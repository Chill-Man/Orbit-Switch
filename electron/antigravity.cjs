const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const ALLOWED_EXECUTABLES = new Set(['antigravity.exe', 'antigravity ide.exe']);

function executableCandidates() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
  ];
}

function assertExecutableName(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (!ALLOWED_EXECUTABLES.has(name)) {
    throw new Error('Выберите Antigravity.exe или Antigravity IDE.exe.');
  }
  return path.basename(filePath);
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function detectAntigravity(configuredPath) {
  const candidates = configuredPath
    ? [configuredPath, ...executableCandidates()]
    : executableCandidates();
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    try {
      assertExecutableName(candidate);
      if (await fileExists(candidate)) return candidate;
    } catch {
      // Ignore invalid configured paths and continue with known locations.
    }
  }
  return null;
}

function isMissingProcessError(error) {
  if (Number(error?.code) === 128) return true;
  const output = `${error?.stdout || ''} ${error?.stderr || ''}`.toLowerCase();
  return output.includes('not found') || output.includes('не найден');
}

async function terminateAntigravity(executablePath) {
  const imageName = assertExecutableName(executablePath);
  try {
    await execFileAsync('taskkill.exe', ['/IM', imageName, '/T'], {
      windowsHide: true,
      timeout: 6000,
    });
  } catch (error) {
    // taskkill uses exit code 128 when no matching process exists. Its output is
    // localized and encoded with the active Windows code page, so parsing text is
    // unreliable on non-English systems.
    if (isMissingProcessError(error)) return;
    {
      try {
        await execFileAsync('taskkill.exe', ['/IM', imageName, '/T', '/F'], {
          windowsHide: true,
          timeout: 6000,
        });
      } catch (forceError) {
        if (isMissingProcessError(forceError)) return;
        {
          throw new Error('Не удалось закрыть запущенную Antigravity. Закройте её вручную и повторите.');
        }
      }
    }
  }
}

async function isAntigravityRunning(executablePath) {
  const imageName = assertExecutableName(executablePath);
  const processName = path.parse(imageName).name;
  const command = `$orbitProcessName = '${processName.replaceAll("'", "''")}'; if (Get-Process -Name $orbitProcessName -ErrorAction SilentlyContinue) { exit 0 } else { exit 3 }`;
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command,
      ],
      { windowsHide: true, timeout: 5000 },
    );
    return true;
  } catch (error) {
    if (Number(error?.code) === 3) return false;
    throw new Error('Не удалось проверить состояние Antigravity.');
  }
}

async function launchAntigravity(executablePath, profilePath, shouldRestart = true) {
  assertExecutableName(executablePath);
  if (!(await fileExists(executablePath))) {
    throw new Error('Antigravity не найдена по сохранённому пути.');
  }
  await fs.mkdir(profilePath, { recursive: true });
  if (shouldRestart) {
    await terminateAntigravity(executablePath);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, [`--user-data-dir=${profilePath}`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    const onError = (error) => reject(new Error(`Не удалось запустить Antigravity: ${error.message}`));
    child.once('error', onError);
    child.once('spawn', () => {
      child.off('error', onError);
      child.unref();
      resolve({ pid: child.pid });
    });
  });
}

module.exports = {
  assertExecutableName,
  detectAntigravity,
  isAntigravityRunning,
  isMissingProcessError,
  launchAntigravity,
  terminateAntigravity,
};
