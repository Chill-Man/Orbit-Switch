const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, nativeTheme } = require('electron');
const { AccountStore } = require('./account-store.cjs');
const {
  assertExecutableName,
  detectAntigravity,
  isAntigravityRunning,
  launchAntigravity,
  terminateAntigravity,
} = require('./antigravity.cjs');
const antigravityProvider = require('./antigravity-provider.cjs');
const credentialVault = require('./credential-vault.cjs');

const LOGIN_TIMEOUT_MS = 90 * 1000;
const MAX_CUSTOM_WALLPAPER_SIZE = 25 * 1024 * 1024;
const CUSTOM_WALLPAPER_EXTENSIONS = new Set(['.avif', '.jpg', '.jpeg', '.png', '.webp']);

// Keep development, portable and installed builds on one stable local store.
app.setPath('userData', path.join(app.getPath('appData'), 'orbit-switch'));
let mainWindow = null;
let store = null;
let switchInFlight = false;
let usageRefreshInFlight = false;
const authInFlight = new Set();
const providerSessions = new Set();

function publicError(error) {
  return error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
}

function resultOk(data) {
  return { ok: true, data };
}

function resultError(error) {
  return { ok: false, error: publicError(error) };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getEnrichedState() {
  const state = await store.publicState();
  const executablePath = await detectAntigravity(state.preferences.executablePath);
  const customBackgroundPath = store.getCustomBackgroundPath(state.preferences.customBackgroundFile);
  let customBackgroundUrl = null;
  if (customBackgroundPath) {
    try {
      const image = nativeImage.createFromPath(customBackgroundPath);
      if (image.isEmpty()) throw new Error('Файл обоев не удалось прочитать.');
      customBackgroundUrl = image.toDataURL();
    } catch {
      customBackgroundUrl = null;
    }
  }
  const { customBackgroundFile: _customBackgroundFile, ...preferences } = state.preferences;
  const updatedTimes = state.accounts
    .flatMap((account) => account.quotas || [])
    .map((quota) => Date.parse(quota.updatedAt || ''))
    .filter(Number.isFinite);
  return {
    ...state,
    preferences: { ...preferences, customBackgroundUrl },
    environment: {
      platform: process.platform,
      executablePath,
      antigravityInstalled: Boolean(executablePath),
    },
    usageProvider: {
      available: Boolean(executablePath),
      refreshing: usageRefreshInFlight,
      source: 'antigravity-api',
      lastRefreshAt: updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null,
    },
  };
}

async function emitState() {
  const state = await getEnrichedState();
  mainWindow?.webContents.send('state:changed', state);
  return state;
}

async function startProvider(executablePath) {
  const session = await antigravityProvider.start(executablePath);
  providerSessions.add(session);
  return session;
}

async function stopProvider(session) {
  if (!session) return;
  providerSessions.delete(session);
  await antigravityProvider.stop(session);
}

async function readAccountWithRetry(session, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await antigravityProvider.readAccount(session);
    } catch (error) {
      lastError = error;
      await sleep(800);
    }
  }
  throw lastError || new Error('Не удалось получить данные Google-аккаунта.');
}

async function waitForNewCredential(getLoginError, timeoutMs = LOGIN_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    const credential = await credentialVault.readCredential(store.userDataPath);
    if (credential?.blobBase64) return credential;
    const loginError = getLoginError();
    if (loginError && Date.now() - startedAt > 5000) throw loginError;
    await sleep(900);
  }
  throw new Error('Google не подтвердил вход за 90 секунд. Завершите вход в браузере и попробуйте ещё раз.');
}

async function preserveCurrentCredential(credential) {
  if (!credential?.blobBase64) return;
  const state = await store.read();
  const activeAccount = state.accounts.find((account) => account.id === state.activeAccountId);
  if (activeAccount && !activeAccount.credentialCipherText) {
    await store.saveCredential(activeAccount.id, credentialVault.sealCredential(credential));
  }
}

async function migrateLegacyAccounts() {
  const state = await store.read();
  const legacyAccounts = state.accounts.filter((account) => !account.credentialCipherText);
  if (!legacyAccounts.length) return;

  const executablePath = await detectAntigravity(state.preferences.executablePath);
  const credential = await credentialVault.readCredential(store.userDataPath).catch(() => null);
  if (executablePath && credential?.blobBase64) {
    let session = null;
    try {
      session = await startProvider(executablePath);
      const snapshot = await readAccountWithRetry(session, 12000);
      const candidate = legacyAccounts.find((account) => account.email === snapshot.email)
        || (legacyAccounts.length === 1 ? legacyAccounts[0] : null);
      if (candidate) {
        await store.applyAntigravityAccount(
          candidate.id,
          snapshot,
          credentialVault.sealCredential(credential),
        );
      }
    } catch {
      // A failed migration simply falls back to a normal Google re-login.
    } finally {
      await stopProvider(session).catch(() => undefined);
    }
  }

  const migrated = await store.read();
  for (const account of migrated.accounts) {
    if (account.authState === 'ready' && !account.credentialCipherText) {
      await store.setAuthState(
        account.id,
        'expired',
        'Выполните вход Google через Orbit Switch, чтобы включить переключение одним нажатием.',
      );
    }
  }
}

async function authorizeAccount(accountId) {
  if (authInFlight.has(accountId)) throw new Error('Вход для этого аккаунта уже выполняется.');
  authInFlight.add(accountId);
  let previousCredential = null;
  let session = null;
  try {
    const state = await getEnrichedState();
    const account = await store.getAccountSecret(accountId);
    const executablePath = state.environment.executablePath;
    if (!executablePath) throw new Error('Сначала укажите путь к Antigravity.');

    await store.setAuthState(accountId, 'authenticating');
    await emitState();
    previousCredential = await credentialVault.readCredential(store.userDataPath);
    await preserveCurrentCredential(previousCredential);
    await terminateAntigravity(executablePath);
    await credentialVault.deleteCredential(store.userDataPath);

    session = await startProvider(executablePath);
    let loginError = null;
    antigravityProvider.beginLogin(session).catch((error) => { loginError = error; });
    const credential = await waitForNewCredential(() => loginError);
    const snapshot = await readAccountWithRetry(session);
    const cipherText = credentialVault.sealCredential(credential);
    await store.applyAntigravityAccount(accountId, snapshot, cipherText);
    await stopProvider(session);
    session = null;

    // The OAuth callback can open Antigravity itself. Restart it once with the
    // selected Orbit profile so the user always lands in the expected account.
    await terminateAntigravity(executablePath);
    await launchAntigravity(executablePath, account.profilePath, false);
    await store.markOpened(accountId);
    return await emitState();
  } catch (error) {
    if (previousCredential?.blobBase64) {
      await credentialVault.writeCredential(store.userDataPath, previousCredential).catch(() => undefined);
    } else {
      await credentialVault.deleteCredential(store.userDataPath).catch(() => undefined);
    }
    await store.setAuthState(accountId, 'error', publicError(error)).catch(() => undefined);
    await emitState().catch(() => undefined);
    throw error;
  } finally {
    await stopProvider(session).catch(() => undefined);
    authInFlight.delete(accountId);
  }
}

async function refreshAccount(account, executablePath) {
  if (!account.credentialCipherText) {
    throw new Error(`Для «${account.label}» требуется повторный вход.`);
  }
  const credential = credentialVault.openCredential(account.credentialCipherText);
  await credentialVault.writeCredential(store.userDataPath, credential);
  const session = await startProvider(executablePath);
  try {
    const snapshot = await readAccountWithRetry(session);
    await store.applyAntigravityAccount(account.id, snapshot);
    return snapshot;
  } finally {
    await stopProvider(session);
  }
}

async function switchAccount(accountId) {
  if (switchInFlight) throw new Error('Переключение уже выполняется.');
  switchInFlight = true;
  let session = null;
  try {
    const state = await getEnrichedState();
    const account = await store.getAccountSecret(accountId);
    const executablePath = state.environment.executablePath;
    if (!executablePath) throw new Error('Antigravity не найдена.');
    if (!account.credentialCipherText) {
      throw new Error('Для этого аккаунта требуется вход Google через Orbit Switch.');
    }

    await terminateAntigravity(executablePath);
    const credential = credentialVault.openCredential(account.credentialCipherText);
    await credentialVault.writeCredential(store.userDataPath, credential);

    // Quota refresh is best-effort and must not prevent the actual account switch.
    try {
      session = await startProvider(executablePath);
      const snapshot = await readAccountWithRetry(session, 15000);
      await store.applyAntigravityAccount(accountId, snapshot);
    } catch {
      // Cached quota remains visible until the next successful refresh.
    } finally {
      await stopProvider(session).catch(() => undefined);
      session = null;
    }

    await launchAntigravity(executablePath, account.profilePath, false);
    await store.markOpened(accountId);
    return await emitState();
  } finally {
    await stopProvider(session).catch(() => undefined);
    switchInFlight = false;
  }
}

async function refreshAllUsage() {
  if (usageRefreshInFlight || switchInFlight) {
    throw new Error('Обновление лимитов уже выполняется.');
  }
  usageRefreshInFlight = true;
  await emitState();
  const failures = [];
  let previousCredential = null;
  let wasRunning = false;
  try {
    const state = await getEnrichedState();
    const executablePath = state.environment.executablePath;
    if (!executablePath) throw new Error('Antigravity не найдена.');
    const rawState = await store.read();
    previousCredential = await credentialVault.readCredential(store.userDataPath);
    wasRunning = await isAntigravityRunning(executablePath);
    if (wasRunning) await terminateAntigravity(executablePath);

    for (const account of rawState.accounts) {
      try {
        await refreshAccount(account, executablePath);
      } catch (error) {
        failures.push(publicError(error));
      }
    }

    const latestState = await store.read();
    const activeAccount = latestState.accounts.find((account) => account.id === latestState.activeAccountId);
    if (activeAccount?.credentialCipherText) {
      await credentialVault.writeCredential(
        store.userDataPath,
        credentialVault.openCredential(activeAccount.credentialCipherText),
      );
      if (wasRunning) await launchAntigravity(executablePath, activeAccount.profilePath, false);
    } else if (previousCredential?.blobBase64) {
      await credentialVault.writeCredential(store.userDataPath, previousCredential);
    }

    const nextState = await emitState();
    if (failures.length === rawState.accounts.length && failures.length) {
      throw new Error(failures[0]);
    }
    return nextState;
  } finally {
    usageRefreshInFlight = false;
    await emitState().catch(() => undefined);
  }
}

function registerIpc() {
  ipcMain.handle('state:get', async () => {
    try {
      return resultOk(await getEnrichedState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('account:create', async (_event, input) => {
    let account = null;
    try {
      account = await store.createAccount(input);
      return resultOk(await authorizeAccount(account.id));
    } catch (error) {
      // A failed first login should not leave a duplicate/half-configured card.
      if (account?.id) {
        await store.removeAccount(account.id).catch(() => undefined);
        await emitState().catch(() => undefined);
      }
      return resultError(error);
    }
  });

  ipcMain.handle('account:login', async (_event, accountId) => {
    try {
      return resultOk(await authorizeAccount(accountId));
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('account:switch', async (_event, accountId) => {
    try {
      return resultOk(await switchAccount(accountId));
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('account:rename', async (_event, accountId, label) => {
    try {
      await store.renameAccount(accountId, label);
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('account:remove', async (_event, accountId) => {
    try {
      await store.removeAccount(accountId);
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:select-executable', async () => {
    try {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: 'Выберите Antigravity',
        properties: ['openFile'],
        filters: [{ name: 'Antigravity', extensions: ['exe'] }],
      });
      if (selection.canceled || !selection.filePaths[0]) return resultOk(await getEnrichedState());
      const executablePath = selection.filePaths[0];
      assertExecutableName(executablePath);
      await store.setPreferences({ executablePath });
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:set-theme', async (_event, theme) => {
    try {
      await store.setPreferences({ theme });
      nativeTheme.themeSource = theme;
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:set-card-style', async (_event, cardStyle) => {
    try {
      await store.setPreferences({ cardStyle });
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:set-background', async (_event, background) => {
    try {
      await store.setPreferences({ background, useCustomBackground: false });
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:select-custom-background', async () => {
    try {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: 'Выберите свои обои',
        properties: ['openFile'],
        filters: [{ name: 'Изображения', extensions: ['avif', 'jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (selection.canceled || !selection.filePaths[0]) return resultOk(await getEnrichedState());

      const sourcePath = selection.filePaths[0];
      const extension = path.extname(sourcePath).toLowerCase();
      if (!CUSTOM_WALLPAPER_EXTENSIONS.has(extension)) {
        throw new Error('Выберите изображение в формате PNG, JPG, WebP или AVIF.');
      }
      const sourceStats = await fs.stat(sourcePath);
      if (!sourceStats.isFile() || sourceStats.size > MAX_CUSTOM_WALLPAPER_SIZE) {
        throw new Error('Размер обоев не должен превышать 25 МБ.');
      }
      const wallpaperImage = nativeImage.createFromPath(sourcePath);
      const wallpaperSize = wallpaperImage.getSize();
      if (wallpaperImage.isEmpty() || !wallpaperSize.width || !wallpaperSize.height) {
        throw new Error('Не удалось прочитать изображение. Выберите корректный файл PNG, JPG, WebP или AVIF.');
      }

      const previousState = await store.read();
      const previousWallpaperPath = store.getCustomBackgroundPath(previousState.preferences.customBackgroundFile);
      const fileName = `wallpaper-${Date.now()}.png`;
      const destinationPath = store.getCustomBackgroundPath(fileName);
      await fs.mkdir(store.wallpapersPath, { recursive: true });
      await fs.writeFile(destinationPath, wallpaperImage.toPNG());
      await store.setPreferences({ customBackgroundFile: fileName, useCustomBackground: true });
      if (previousWallpaperPath && previousWallpaperPath !== destinationPath) {
        await fs.unlink(previousWallpaperPath).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:use-custom-background', async () => {
    try {
      const state = await store.read();
      const wallpaperPath = store.getCustomBackgroundPath(state.preferences.customBackgroundFile);
      if (!wallpaperPath) throw new Error('Сначала выберите изображение для своих обоев.');
      await fs.access(wallpaperPath);
      await store.setPreferences({ useCustomBackground: true });
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:clear-custom-background', async () => {
    try {
      await store.clearCustomBackground();
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('settings:set-progress-style', async (_event, progressStyle) => {
    try {
      await store.setPreferences({ progressStyle });
      return resultOk(await emitState());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('usage:refresh', async () => {
    try {
      return resultOk(await refreshAllUsage());
    } catch (error) {
      return resultError(error);
    }
  });

  ipcMain.handle('shell:open-external', async (_event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('Можно открывать только безопасные HTTPS-ссылки.');
      await shell.openExternal(parsed.toString());
      return resultOk(null);
    } catch (error) {
      return resultError(error);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 580,
    show: false,
    backgroundColor: '#11131a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#11131a',
      symbolColor: '#f5f6fa',
      height: 42,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
    if (!url.startsWith(allowed)) event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  app.whenReady().then(async () => {
    store = new AccountStore(app.getPath('userData'));
    await store.init();
    await migrateLegacyAccounts();
    const state = await store.read();
    nativeTheme.themeSource = state.preferences.theme;
    registerIpc();
    createWindow();
  });

  app.on('before-quit', () => {
    for (const session of providerSessions) session.child?.kill();
  });
  app.on('window-all-closed', () => app.quit());
}
