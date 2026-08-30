export type ThemePreference = 'system' | 'light' | 'dark';
export type CardStyle = 'modern' | 'compact' | 'glass';
export type AppBackground = 'orbits' | 'horizon' | 'ribbons';
export type ProgressStyle = 'solid' | 'gradient' | 'segmented' | 'glow';
export type AuthState = 'setup' | 'authenticating' | 'ready' | 'expired' | 'error';
export type QuotaSource = 'antigravity' | 'manual' | 'import' | 'statusline';

export interface Quota {
  id: string;
  name: string;
  remainingPercent: number;
  remaining: number | null;
  total: number | null;
  resetAt: string | null;
  source: QuotaSource;
  updatedAt: string;
}

export interface Account {
  id: string;
  label: string;
  email: string;
  color: string;
  profilePath: string;
  authState: AuthState;
  authError?: string | null;
  displayName?: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
  quotaFilePath: string | null;
  planTier?: string | null;
  quotas: Quota[];
}

export interface AppState {
  version: number;
  accounts: Account[];
  activeAccountId: string | null;
  preferences: {
    theme: ThemePreference;
    cardStyle: CardStyle;
    background: AppBackground;
    progressStyle: ProgressStyle;
    executablePath: string | null;
  };
  environment: {
    platform: string;
    executablePath: string | null;
    antigravityInstalled: boolean;
  };
  usageProvider: {
    available: boolean;
    refreshing: boolean;
    source: 'antigravity-api';
    lastRefreshAt: string | null;
  };
}

export interface AccountInput {
  label: string;
  color?: string;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface OrbitBridge {
  getState(): Promise<ApiResult<AppState>>;
  createAccount(input: AccountInput): Promise<ApiResult<AppState>>;
  loginAccount(accountId: string): Promise<ApiResult<AppState>>;
  switchAccount(accountId: string): Promise<ApiResult<AppState>>;
  renameAccount(accountId: string, label: string): Promise<ApiResult<AppState>>;
  removeAccount(accountId: string): Promise<ApiResult<AppState>>;
  selectExecutable(): Promise<ApiResult<AppState>>;
  setTheme(theme: ThemePreference): Promise<ApiResult<AppState>>;
  setCardStyle(cardStyle: CardStyle): Promise<ApiResult<AppState>>;
  setBackground(background: AppBackground): Promise<ApiResult<AppState>>;
  setProgressStyle(progressStyle: ProgressStyle): Promise<ApiResult<AppState>>;
  refreshUsage(): Promise<ApiResult<AppState>>;
  openExternal(url: string): Promise<ApiResult<null>>;
  onStateChanged(callback: (state: AppState) => void): () => void;
}

declare global {
  interface Window {
    orbit?: OrbitBridge;
  }
}
