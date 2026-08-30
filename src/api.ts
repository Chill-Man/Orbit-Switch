import type { AccountInput, ApiResult, AppBackground, AppState, CardStyle, OrbitBridge, ProgressStyle, ThemePreference } from './types';

function browserFallbackState(): AppState {
  return {
    version: 2,
    activeAccountId: null,
    preferences: { theme: 'system', cardStyle: 'modern', background: 'orbits', customBackgroundUrl: null, useCustomBackground: false, progressStyle: 'solid', executablePath: null },
    environment: {
      platform: navigator.platform || 'browser',
      executablePath: null,
      antigravityInstalled: false,
    },
    usageProvider: {
      available: false,
      refreshing: false,
      source: 'antigravity-api',
      lastRefreshAt: null,
    },
    accounts: [],
  };
}

let browserState = browserFallbackState();

function desktopOnly(): ApiResult<AppState> {
  return { ok: false, error: 'Эта операция доступна только в установленном приложении Orbit Switch.' };
}

const browserBridge: OrbitBridge = {
  async getState() { return { ok: true, data: browserState }; },
  async createAccount() { return desktopOnly(); },
  async loginAccount() { return desktopOnly(); },
  async switchAccount() { return desktopOnly(); },
  async renameAccount() { return desktopOnly(); },
  async removeAccount() { return desktopOnly(); },
  async selectExecutable() { return desktopOnly(); },
  async setTheme(theme: ThemePreference) { browserState = { ...browserState, preferences: { ...browserState.preferences, theme } }; return { ok: true, data: browserState }; },
  async setCardStyle(cardStyle: CardStyle) { browserState = { ...browserState, preferences: { ...browserState.preferences, cardStyle } }; return { ok: true, data: browserState }; },
  async setBackground(background: AppBackground) { browserState = { ...browserState, preferences: { ...browserState.preferences, background } }; return { ok: true, data: browserState }; },
  async selectCustomBackground() { return desktopOnly(); },
  async useCustomBackground() { return desktopOnly(); },
  async clearCustomBackground() { return desktopOnly(); },
  async setProgressStyle(progressStyle: ProgressStyle) { browserState = { ...browserState, preferences: { ...browserState.preferences, progressStyle } }; return { ok: true, data: browserState }; },
  async refreshUsage() { return desktopOnly(); },
  async openExternal() { return { ok: true, data: null }; },
  onStateChanged() { return () => undefined; },
};

const bridge = window.orbit || browserBridge;

async function unwrap<T>(promise: Promise<ApiResult<T>>) {
  const result = await promise;
  if (!result.ok || result.data === undefined) throw new Error(result.error || 'Операция не выполнена.');
  return result.data;
}

export const api = {
  getState: () => unwrap(bridge.getState()),
  createAccount: (input: AccountInput) => unwrap(bridge.createAccount(input)),
  loginAccount: (accountId: string) => unwrap(bridge.loginAccount(accountId)),
  switchAccount: (accountId: string) => unwrap(bridge.switchAccount(accountId)),
  renameAccount: (accountId: string, label: string) => unwrap(bridge.renameAccount(accountId, label)),
  removeAccount: (accountId: string) => unwrap(bridge.removeAccount(accountId)),
  selectExecutable: () => unwrap(bridge.selectExecutable()),
  setTheme: (theme: ThemePreference) => unwrap(bridge.setTheme(theme)),
  setCardStyle: (cardStyle: CardStyle) => unwrap(bridge.setCardStyle(cardStyle)),
  setBackground: (background: AppBackground) => unwrap(bridge.setBackground(background)),
  selectCustomBackground: () => unwrap(bridge.selectCustomBackground()),
  useCustomBackground: () => unwrap(bridge.useCustomBackground()),
  clearCustomBackground: () => unwrap(bridge.clearCustomBackground()),
  setProgressStyle: (progressStyle: ProgressStyle) => unwrap(bridge.setProgressStyle(progressStyle)),
  refreshUsage: () => unwrap(bridge.refreshUsage()),
  openExternal: async (url: string) => { await bridge.openExternal(url); },
  onStateChanged: bridge.onStateChanged,
};
