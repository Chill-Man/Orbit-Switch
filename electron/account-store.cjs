const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const EMPTY_STATE = {
  version: 2,
  accounts: [],
  activeAccountId: null,
  preferences: {
    theme: 'system',
    cardStyle: 'modern',
    background: 'orbits',
    progressStyle: 'solid',
    executablePath: null,
  },
};

const CARD_STYLES = ['modern', 'compact', 'glass'];
const BACKGROUNDS = ['orbits', 'horizon', 'ribbons'];
const PROGRESS_STYLES = ['solid', 'gradient', 'segmented', 'glow'];

function cleanText(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Укажите корректный адрес электронной почты.');
  }
  return email;
}

function normalizeQuota(quota, source = 'manual') {
  const name = cleanText(quota?.name, 80);
  if (!name) throw new Error('У квоты должно быть название.');

  const percentage = Number(quota?.remainingPercent);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(`Остаток для «${name}» должен быть числом от 0 до 100.`);
  }

  let resetAt = null;
  if (quota?.resetAt) {
    const parsed = new Date(quota.resetAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Некорректное время сброса для «${name}».`);
    }
    resetAt = parsed.toISOString();
  }

  const total = quota?.total === '' || quota?.total == null ? null : Number(quota.total);
  const remaining = quota?.remaining === '' || quota?.remaining == null ? null : Number(quota.remaining);
  if (total != null && (!Number.isFinite(total) || total <= 0)) {
    throw new Error(`Общий лимит для «${name}» должен быть больше нуля.`);
  }
  if (remaining != null && (!Number.isFinite(remaining) || remaining < 0)) {
    throw new Error(`Остаток для «${name}» не может быть отрицательным.`);
  }

  return {
    id: cleanText(quota?.id, 80) || randomUUID(),
    name,
    remainingPercent: Math.round(percentage * 10) / 10,
    remaining,
    total,
    resetAt,
    source,
    updatedAt: new Date().toISOString(),
  };
}

class AccountStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, 'orbit-switch.json');
    this.profilesPath = path.join(userDataPath, 'antigravity-profiles');
    this.writeQueue = Promise.resolve();
    this.mutationQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.profilesPath, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.write(EMPTY_STATE);
    }
  }

  async read() {
    await this.writeQueue;
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const nextState = {
        ...structuredClone(EMPTY_STATE),
        ...data,
        version: 2,
        preferences: { ...EMPTY_STATE.preferences, ...(data.preferences || {}) },
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
      };
      if (!CARD_STYLES.includes(nextState.preferences.cardStyle)) {
        nextState.preferences.cardStyle = EMPTY_STATE.preferences.cardStyle;
      }
      if (!BACKGROUNDS.includes(nextState.preferences.background)) {
        nextState.preferences.background = EMPTY_STATE.preferences.background;
      }
      if (!PROGRESS_STYLES.includes(nextState.preferences.progressStyle)) {
        nextState.preferences.progressStyle = EMPTY_STATE.preferences.progressStyle;
      }
      nextState.accounts = nextState.accounts.map((account) => ({
        ...account,
        authError: account.authError || null,
        displayName: account.displayName || null,
        planTier: account.planTier || null,
        credentialCipherText: account.credentialCipherText || null,
      }));
      return nextState;
    } catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(EMPTY_STATE);
      throw new Error('Не удалось прочитать локальные настройки Orbit Switch.');
    }
  }

  async write(nextState) {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(nextState, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  async mutate(mutator) {
    const operation = this.mutationQueue.then(async () => {
      const state = await this.read();
      const result = await mutator(state);
      await this.write(state);
      return result ?? state;
    });
    this.mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async createAccount(input) {
    const label = cleanText(input?.label, 60);
    // Kept as an internal migration hook for version-1 data/tests. The renderer
    // no longer asks the user for an email; live auth overwrites this value.
    const email = cleanEmail(input?.email);
    if (!label) throw new Error('Добавьте понятное название аккаунта.');

    return this.mutate((state) => {
      if (email && state.accounts.some((account) => account.email === email)) {
        throw new Error('Этот Google-аккаунт уже добавлен.');
      }
      const id = randomUUID();
      const account = {
        id,
        label,
        email,
        displayName: null,
        planTier: null,
        color: cleanText(input?.color, 20) || '#7c6df2',
        profilePath: path.join(this.profilesPath, id),
        authState: 'setup',
        authError: null,
        credentialCipherText: null,
        createdAt: new Date().toISOString(),
        lastOpenedAt: null,
        quotaFilePath: null,
        quotas: [],
      };
      state.accounts.push(account);
      return account;
    });
  }

  async completeSetup(accountId) {
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.authState = 'ready';
      return state;
    });
  }

  async getAccountSecret(accountId) {
    const state = await this.read();
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error('Аккаунт не найден.');
    return account;
  }

  async setAuthState(accountId, authState, authError = null) {
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.authState = authState;
      account.authError = cleanText(authError, 240) || null;
      return state;
    });
  }

  async saveCredential(accountId, credentialCipherText) {
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.credentialCipherText = cleanText(credentialCipherText, 32768);
      return state;
    });
  }

  async applyAntigravityAccount(accountId, snapshot, credentialCipherText = undefined) {
    const email = cleanEmail(snapshot?.email);
    if (!email) throw new Error('Antigravity не вернула email Google-аккаунта.');
    const quotas = Array.isArray(snapshot?.quotas) ? snapshot.quotas : [];
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      if (state.accounts.some((item) => item.id !== accountId && item.email === email)) {
        throw new Error('Этот Google-аккаунт уже добавлен в Orbit Switch.');
      }
      account.email = email;
      account.displayName = cleanText(snapshot?.displayName, 120) || null;
      account.planTier = cleanText(snapshot?.planTier, 80) || null;
      account.quotas = quotas.map((quota) => normalizeQuota(quota, 'antigravity'));
      account.authState = 'ready';
      account.authError = null;
      if (credentialCipherText !== undefined) {
        account.credentialCipherText = cleanText(credentialCipherText, 32768) || null;
      }
      return state;
    });
  }

  async publicState() {
    const state = await this.read();
    return {
      ...state,
      accounts: state.accounts.map(({ credentialCipherText: _secret, ...account }) => account),
    };
  }

  async markOpened(accountId) {
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.lastOpenedAt = new Date().toISOString();
      state.activeAccountId = accountId;
      return state;
    });
  }

  async updateQuotas(accountId, quotas, source = 'manual') {
    if (!Array.isArray(quotas) || quotas.length > 12) {
      throw new Error('Можно сохранить от 0 до 12 квот.');
    }
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.quotas = quotas.map((quota) => normalizeQuota(quota, source));
      return state;
    });
  }

  async attachQuotaFile(accountId, filePath, quotas) {
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.quotaFilePath = filePath;
      account.quotas = quotas.map((quota) => normalizeQuota(quota, 'import'));
      return state;
    });
  }

  async applyStatuslineSnapshot(snapshot) {
    const email = cleanEmail(snapshot?.email);
    if (!email || !snapshot?.quota || typeof snapshot.quota !== 'object') return false;
    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.email === email);
      if (!account) return false;
      const updatedAt = new Date(snapshot.observedAt || Date.now()).toISOString();
      const automaticQuotas = Object.entries(snapshot.quota)
        .slice(0, 12)
        .map(([bucketId, value]) => {
          const fraction = Number(value?.remaining_fraction);
          if (!Number.isFinite(fraction)) return null;
          const resetDate = value?.reset_time ? new Date(value.reset_time) : null;
          return {
            id: `statusline:${cleanText(bucketId, 80)}`,
            name: cleanText(bucketId, 80)
              .split(/[-_]/g)
              .filter(Boolean)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(' '),
            remainingPercent: Math.max(0, Math.min(100, Math.round(fraction * 1000) / 10)),
            remaining: null,
            total: null,
            resetAt: resetDate && !Number.isNaN(resetDate.getTime()) ? resetDate.toISOString() : null,
            source: 'statusline',
            updatedAt,
          };
        })
        .filter(Boolean);
      if (!automaticQuotas.length) return false;
      account.quotas = automaticQuotas;
      account.planTier = cleanText(snapshot.planTier, 40) || account.planTier || null;
      account.authState = 'ready';
      return true;
    });
  }

  async removeAccount(accountId) {
    return this.mutate((state) => {
      const index = state.accounts.findIndex((item) => item.id === accountId);
      if (index < 0) throw new Error('Аккаунт не найден.');
      state.accounts.splice(index, 1);
      if (state.activeAccountId === accountId) state.activeAccountId = null;
      return state;
    });
  }

  async renameAccount(accountId, label) {
    const nextLabel = cleanText(label, 60);
    if (!nextLabel) throw new Error('Название аккаунта не может быть пустым.');

    return this.mutate((state) => {
      const account = state.accounts.find((item) => item.id === accountId);
      if (!account) throw new Error('Аккаунт не найден.');
      account.label = nextLabel;
      return state;
    });
  }

  async setPreferences(preferences) {
    return this.mutate((state) => {
      const allowedTheme = ['system', 'light', 'dark'].includes(preferences?.theme)
        ? preferences.theme
        : state.preferences.theme;
      const allowedCardStyle = CARD_STYLES.includes(preferences?.cardStyle)
        ? preferences.cardStyle
        : state.preferences.cardStyle;
      const allowedBackground = BACKGROUNDS.includes(preferences?.background)
        ? preferences.background
        : state.preferences.background;
      const allowedProgressStyle = PROGRESS_STYLES.includes(preferences?.progressStyle)
        ? preferences.progressStyle
        : state.preferences.progressStyle;
      state.preferences = {
        ...state.preferences,
        ...preferences,
        theme: allowedTheme,
        cardStyle: allowedCardStyle,
        background: allowedBackground,
        progressStyle: allowedProgressStyle,
      };
      return state;
    });
  }
}

module.exports = { AccountStore, normalizeQuota, EMPTY_STATE };
