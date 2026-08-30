import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  FolderSearch2,
  HandCoins,
  Image as ImageIcon,
  Moon,
  Palette,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { api } from './api';
import { AccountCard } from './components/AccountCard';
import { LiquidGlassCard } from './components/LiquidGlassCard';
import { Sidebar, type ViewName } from './components/Sidebar';
import { SortableAccountGrid } from './components/SortableAccountGrid';
import { UsageDashboard } from './components/UsageDashboard';
import { WaterProgressLayers } from './components/WaterProgressLayers';
import { MotionConfettiButton } from './components/ui/motion-confetti';
import backgroundHorizon from './assets/backgrounds/horizon.png';
import backgroundHorizonLight from './assets/backgrounds/horizon-light.png';
import backgroundOrbits from './assets/backgrounds/orbits.png';
import backgroundOrbitsLight from './assets/backgrounds/orbits-light.png';
import backgroundRibbons from './assets/backgrounds/ribbons.png';
import backgroundRibbonsLight from './assets/backgrounds/ribbons-light.png';
import orbitLogo from './assets/orbit-logo.png';
import { groupAccountsByPinnedState, normalizeAccountOrder } from './lib/account-order';
import type { Account, AccountInput, AppBackground, AppState, CardStyle, ProgressStyle, ThemePreference } from './types';

const ACCOUNT_COLORS = ['#7c6df2', '#2e9f81', '#d18448', '#d65c7a', '#4689d6'];
const ACCOUNT_ORDER_STORAGE_KEY = 'orbit-account-order-v1';
const PINNED_ACCOUNT_STORAGE_KEY = 'orbit-pinned-account-ids-v1';
const DONATE_URL = 'https://boosty.to/chillyperchick/donate';
const CARD_STYLES: ReadonlyArray<{ id: CardStyle; label: string; description: string }> = [
  { id: 'modern', label: 'Современный', description: 'Воздушный и сбалансированный' },
  { id: 'compact', label: 'Компактный', description: 'Плотный, плоский и строгий' },
  { id: 'glass', label: 'Liquid Glass', description: 'Прозрачность, блики и глубина' },
];
type EffectiveTheme = 'light' | 'dark';
type BackgroundStyle = {
  id: AppBackground;
  label: string;
  images: Record<EffectiveTheme, string>;
  descriptions: Record<EffectiveTheme, string>;
};
const BACKGROUND_STYLES: ReadonlyArray<BackgroundStyle> = [
  {
    id: 'orbits',
    label: 'Орбиты',
    images: { dark: backgroundOrbits, light: backgroundOrbitsLight },
    descriptions: {
      dark: 'Тёмные графичные дуги с мягким фиолетовым свечением',
      light: 'Светлые стеклянные дуги с нежным сиреневым контуром',
    },
  },
  {
    id: 'horizon',
    label: 'Горизонт',
    images: { dark: backgroundHorizon, light: backgroundHorizonLight },
    descriptions: {
      dark: 'Тёмный рельеф с подсвеченной линией горизонта',
      light: 'Воздушный белый рельеф с мягким лиловым горизонтом',
    },
  },
  {
    id: 'ribbons',
    label: 'Ленты',
    images: { dark: backgroundRibbons, light: backgroundRibbonsLight },
    descriptions: {
      dark: 'Глубокий чёрный фон с вертикальными линиями',
      light: 'Светлые стеклянные ленты с фиолетовыми бликами',
    },
  },
];
const PROGRESS_STYLES: ReadonlyArray<{ id: ProgressStyle; label: string; description: string }> = [
  { id: 'solid', label: 'Минимал', description: 'Тонкая спокойная линия' },
  { id: 'gradient', label: 'Жидкость', description: 'Волны, каустика и течение воды' },
  { id: 'segmented', label: 'Слайдер', description: 'Градиент, искры и белый бегунок' },
  { id: 'glow', label: 'Импульс', description: 'Световой бегунок с пульсацией' },
];

function readStoredIdList(storageKey: string) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
type Toast = { kind: 'success' | 'error'; message: string } | null;
type AddAccountResult = { ok: true } | { ok: false; error: string };

function CardStylePreview({ liquid }: { liquid: boolean }) {
  const preview = (
    <span className="card-style-preview" aria-hidden="true">
      <span className="card-style-preview__header">
        <i className="card-style-preview__avatar" />
        <span><i /><i /></span>
      </span>
      <i className="card-style-preview__label" />
      <i className="card-style-preview__progress" />
      <i className="card-style-preview__meta" />
    </span>
  );

  if (!liquid) return preview;
  return (
    <LiquidGlassCard enabled className="card-style-preview-frame" cornerRadius={16}>
      {preview}
    </LiquidGlassCard>
  );
}

function ProgressStylePreview({ progressStyle }: { progressStyle: ProgressStyle }) {
  const values = progressStyle === 'segmented' ? [78] : progressStyle === 'gradient' ? [76] : [82, 61, 39];
  return (
    <span className={`progress-style-preview progress-style-preview--${progressStyle}`} aria-hidden="true">
      {values.map((value) => (
        <span key={value}>
          <i style={{ width: `${value}%` }}>
            {progressStyle === 'gradient' && <WaterProgressLayers />}
          </i>
          <b style={{ left: `${value}%` }} />
        </span>
      ))}
    </span>
  );
}

function readSystemTheme(): EffectiveTheme {
  if (typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(readSystemTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => setSystemTheme(query.matches ? 'light' : 'dark');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return preference === 'system' ? systemTheme : preference;
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === 'Escape' && onEscape();
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onEscape]);
}

function Modal({ title, description, onClose, children }: {
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal__header">
          <div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function AddAccountModal({ onClose, onSubmit }: { onClose(): void; onSubmit(input: AccountInput): Promise<AddAccountResult> }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) {
      setSecondsLeft(90);
      return;
    }
    const deadline = Date.now() + 90_000;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [submitting]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const result = await onSubmit({ label, color });
      if (result.ok) onClose();
      else setErrorMessage(result.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={submitting ? 'Выполняется вход Google…' : 'Новый Google-аккаунт'}
      description={submitting ? 'Завершите вход на открывшейся защищённой странице Google.' : 'Orbit сам запустит официальный OAuth и определит email.'}
      onClose={submitting ? () => undefined : onClose}
    >
      <form onSubmit={submit} className="modal-form">
        <div className="security-note">
          {submitting ? <RefreshCcw className="spin" size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}
          <p>{submitting
            ? <><strong>Ожидаем подтверждение.</strong> Завершите вход в браузере. Автоматический тайм-аут через {secondsLeft} сек.</>
            : <><strong>Пароль доступен только Google.</strong> Orbit получает готовую авторизацию, шифрует её средствами Windows и больше не просит вход при переключении.</>}</p>
        </div>
        {errorMessage && (
          <div className="form-error" role="alert">
            <AlertCircle size={19} aria-hidden="true" />
            <div><strong>Не удалось завершить вход</strong><p>{errorMessage}</p></div>
          </div>
        )}
        <label className="field">
          <span>Название аккаунта</span>
          <input autoFocus required disabled={submitting} maxLength={60} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Например, Рабочий" />
          <small>Email и тариф будут получены из Antigravity после входа.</small>
        </label>
        <fieldset className="color-field" disabled={submitting}>
          <legend>Цвет профиля</legend>
          <div>
            {ACCOUNT_COLORS.map((item) => (
              <button key={item} type="button" className={color === item ? 'is-selected' : ''} style={{ '--swatch': item } as React.CSSProperties} onClick={() => setColor(item)} aria-label={`Выбрать цвет ${item}`} aria-pressed={color === item} />
            ))}
          </div>
        </fieldset>
        <footer className="modal__footer">
          <button type="button" className="button button--ghost" disabled={submitting} onClick={onClose}>Отмена</button>
          <button className="button button--primary" disabled={submitting || !label.trim()}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : <ArrowRight size={17} />}
            {submitting ? 'Ожидаем Google…' : errorMessage ? 'Повторить вход' : 'Войти через Google'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ConfirmDeleteModal({ account, onClose, onConfirm }: { account: Account; onClose(): void; onConfirm(): Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Удалить «${account.label}»?`} description="Карточка и сохранённая авторизация исчезнут из Orbit Switch." onClose={onClose}>
      <div className="confirm-body">
        <AlertCircle size={22} />
        <p>Папка профиля Antigravity останется на диске, чтобы не удалять пользовательские данные без возможности восстановления.</p>
      </div>
      <footer className="modal__footer">
        <button className="button button--ghost" onClick={onClose}>Отмена</button>
        <button className="button button--danger" disabled={busy} onClick={async () => { setBusy(true); try { if (await onConfirm()) onClose(); } finally { setBusy(false); } }}>
          <Trash2 size={17} /> Удалить аккаунт
        </button>
      </footer>
    </Modal>
  );
}

function SettingsView({ state, effectiveTheme, onTheme, onCardStyle, onBackground, onProgressStyle, onSelectExecutable }: {
  state: AppState;
  effectiveTheme: EffectiveTheme;
  onTheme(theme: ThemePreference): void;
  onCardStyle(cardStyle: CardStyle): void;
  onBackground(background: AppBackground): void;
  onProgressStyle(progressStyle: ProgressStyle): void;
  onSelectExecutable(): void;
}) {
  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-section__title"><h3>Внешний вид</h3><p>Orbit следует теме Windows или использует выбранную вручную.</p></div>
        <div className="segmented" aria-label="Тема интерфейса">
          {([['system', CircleHelp, 'Системная'], ['light', Sun, 'Светлая'], ['dark', Moon, 'Тёмная']] as const).map(([theme, Icon, label]) => (
            <button key={theme} className={state.preferences.theme === theme ? 'is-selected' : ''} onClick={() => onTheme(theme)} aria-pressed={state.preferences.theme === theme}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section card-style-settings">
        <div className="settings-section__heading">
          <div className="settings-section__icon"><Palette size={21} aria-hidden="true" /></div>
          <div className="settings-section__title">
            <h3>Стили карточек</h3>
            <p>Выберите оформление аккаунтов и экрана лимитов. Изменение применяется сразу.</p>
          </div>
        </div>
        <div className="card-style-picker" aria-label="Стиль карточек">
          {CARD_STYLES.map((option) => {
            const selected = state.preferences.cardStyle === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={`card-style-option card-style-option--${option.id} ${selected ? 'is-selected' : ''}`}
                onClick={() => onCardStyle(option.id)}
                aria-pressed={selected}
              >
                <CardStylePreview liquid={option.id === 'glass'} />
                <span className="card-style-option__copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                {selected && <CheckCircle2 className="card-style-option__check" size={17} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section progress-style-settings">
        <div className="settings-section__heading">
          <div className="settings-section__icon"><ChartNoAxesColumnIncreasing size={21} aria-hidden="true" /></div>
          <div className="settings-section__title">
            <h3>Полоски лимитов</h3>
            <p>Выберите оформление прогресса для всех лимитов. Значения и цвета состояний не меняются.</p>
          </div>
        </div>
        <div className="progress-style-picker" role="group" aria-label="Стиль полосок лимитов">
          {PROGRESS_STYLES.map((option) => {
            const selected = state.preferences.progressStyle === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={`progress-style-option ${selected ? 'is-selected' : ''}`}
                onClick={() => onProgressStyle(option.id)}
                aria-pressed={selected}
              >
                <ProgressStylePreview progressStyle={option.id} />
                <span className="progress-style-option__copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                {selected && <CheckCircle2 className="progress-style-option__check" size={17} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section background-settings">
        <div className="settings-section__heading">
          <div className="settings-section__icon"><ImageIcon size={21} aria-hidden="true" /></div>
          <div className="settings-section__title">
            <h3>Фон интерфейса</h3>
            <p>Выберите стиль фона. Для светлой и тёмной темы автоматически используется своя версия.</p>
          </div>
        </div>
        <div className="background-picker" role="group" aria-label="Фон интерфейса">
          {BACKGROUND_STYLES.map((option) => {
            const selected = state.preferences.background === option.id;
            const description = option.descriptions[effectiveTheme];
            return (
              <button
                type="button"
                key={option.id}
                className={`background-option ${selected ? 'is-selected' : ''}`}
                onClick={() => onBackground(option.id)}
                aria-pressed={selected}
              >
                <img src={option.images[effectiveTheme]} alt="" />
                <span className="background-option__scrim" aria-hidden="true" />
                <span className="background-option__copy">
                  <strong>{option.label}</strong>
                  <span>{description}</span>
                </span>
                {selected && <CheckCircle2 className="background-option__check" size={19} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section settings-section--row">
        <div className="settings-section__icon"><FolderSearch2 size={21} /></div>
        <div className="settings-section__title"><h3>Приложение Antigravity</h3><p className="path-text">{state.environment.executablePath || 'Исполняемый файл не найден'}</p></div>
        <button className="button button--secondary" onClick={onSelectExecutable}>Выбрать файл</button>
      </section>

      <section className="settings-section settings-section--support">
        <div className="settings-section__heading">
          <div className="settings-section__icon settings-section__icon--support"><HandCoins size={21} aria-hidden="true" /></div>
          <div className="settings-section__title">
            <h3>Поддержать Orbit Switch</h3>
            <p>Если приложение оказалось полезным, можно по желанию поддержать дальнейшее развитие проекта.</p>
          </div>
        </div>
        <MotionConfettiButton
          ariaLabel="Поддержать разработчика на Boosty"
          onClick={() => void api.openExternal(DONATE_URL)}
        >
          Поддержать на Boosty
        </MotionConfettiButton>
      </section>

    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<ViewName>('accounts');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('orbit-sidebar-collapsed') === 'true');
  const [sidebarTransitioning, setSidebarTransitioning] = useState(false);
  const [accountOrder, setAccountOrder] = useState<string[]>(() => readStoredIdList(ACCOUNT_ORDER_STORAGE_KEY));
  const [pinnedAccountIds, setPinnedAccountIds] = useState<string[]>(() => readStoredIdList(PINNED_ACCOUNT_STORAGE_KEY));
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const mainRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const effectiveTheme = useEffectiveTheme(state?.preferences.theme || 'system');

  useEffect(() => {
    api.getState().then(setState).catch((error) => setToast({ kind: 'error', message: error.message }));
    return api.onStateChanged(setState);
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    if (state) {
      document.documentElement.dataset.theme = state.preferences.theme;
      document.documentElement.dataset.cardStyle = state.preferences.cardStyle;
      document.documentElement.dataset.background = state.preferences.background;
      document.documentElement.dataset.progressStyle = state.preferences.progressStyle;
      document.documentElement.dataset.effectiveTheme = effectiveTheme;
    }
  }, [effectiveTheme, state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem('orbit-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!sidebarTransitioning) return;
    const timer = window.setTimeout(() => setSidebarTransitioning(false), 280);
    return () => window.clearTimeout(timer);
  }, [sidebarCollapsed, sidebarTransitioning]);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(accountOrder));
  }, [accountOrder]);

  useEffect(() => {
    window.localStorage.setItem(PINNED_ACCOUNT_STORAGE_KEY, JSON.stringify(pinnedAccountIds));
  }, [pinnedAccountIds]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  const activeAccount = useMemo(() => state?.accounts.find((account) => account.id === state.activeAccountId) || null, [state]);
  const displayAccounts = useMemo(() => {
    if (!state) return [];
    const orderedAccounts = normalizeAccountOrder(state.accounts, accountOrder);
    return groupAccountsByPinnedState(orderedAccounts, pinnedAccountIds);
  }, [accountOrder, pinnedAccountIds, state]);

  function toggleSidebar() {
    setSidebarTransitioning(true);
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  function togglePinnedAccount(accountId: string) {
    const pinned = pinnedAccountIds.includes(accountId);
    setPinnedAccountIds((current) => pinned
      ? current.filter((id) => id !== accountId)
      : [accountId, ...current.filter((id) => id !== accountId)]);
    if (!pinned) {
      setAccountOrder((current) => [accountId, ...current.filter((id) => id !== accountId)]);
    }
  }

  async function renameDisplayAccount(account: Account, label: string) {
    const nextLabel = label.trim().slice(0, 60);
    if (!nextLabel) {
      setToast({ kind: 'error', message: 'Название аккаунта не может быть пустым.' });
      return false;
    }

    const nextState = await run(account.id, () => api.renameAccount(account.id, nextLabel), `${nextLabel}: название сохранено`);
    if (!nextState) return false;
    setState(nextState);
    return true;
  }

  async function run<T>(id: string, action: () => Promise<T>, successMessage?: string) {
    setBusyId(id);
    try {
      const result = await action();
      if (successMessage) setToast({ kind: 'success', message: successMessage });
      return result;
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Операция не выполнена.' });
      return undefined;
    } finally {
      setBusyId(null);
    }
  }

  if (!state) {
    return <div className="loading-screen"><span className="brand-logo brand-logo--large"><img src={orbitLogo} alt="" /></span><p>Готовим аккаунты…</p></div>;
  }

  const titles = {
    accounts: ['Аккаунты', activeAccount ? `Сейчас активен ${activeAccount.email || activeAccount.label}` : 'Выберите аккаунт для Antigravity'],
    usage: ['Лимиты ИИ', 'Реальные остатки, точное время сброса и обратный отсчёт'],
    settings: ['Настройки', 'Приложение, тема, стили карточек и безопасная авторизация'],
  } as const;
  const currentBackground = BACKGROUND_STYLES.find((item) => item.id === state.preferences.background) || BACKGROUND_STYLES[0];
  const currentBackgroundImage = currentBackground.images[effectiveTheme];

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''} ${sidebarTransitioning ? 'app-shell--sidebar-transitioning' : ''}`} style={{ '--app-background-image': `url("${currentBackgroundImage}")` } as React.CSSProperties}>
      <div className="window-titlebar">
        <span className="window-titlebar__version" aria-label="Версия программы 1.0.0">Версия 1.0.0</span>
      </div>
      <Sidebar current={view} accountCount={displayAccounts.length} collapsed={sidebarCollapsed} onChange={setView} onToggle={toggleSidebar} />
      <main className="main-content" ref={mainRef}>
        <header className="page-header">
          <div><span className="eyebrow">ANTIGRAVITY ACCOUNT MANAGER</span><h1 ref={headingRef} tabIndex={-1}>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>
          {view === 'accounts' && (
            <button className="button button--primary" onClick={() => setAddOpen(true)} disabled={!state.environment.antigravityInstalled || busyId === 'add'}>
              <Plus size={18} /> Добавить аккаунт
            </button>
          )}
          {view === 'usage' && (
            <button className="button button--secondary" onClick={() => run('refresh', async () => setState(await api.refreshUsage()), 'Лимиты обновлены из Antigravity')} disabled={busyId === 'refresh' || state.usageProvider.refreshing}>
              <RefreshCcw className={busyId === 'refresh' || state.usageProvider.refreshing ? 'spin' : ''} size={17} /> Обновить
            </button>
          )}
        </header>

        {!state.environment.antigravityInstalled && (
          <section className="warning-banner">
            <AlertCircle size={21} />
            <div><strong>Antigravity не найдена</strong><p>Укажите путь к Antigravity.exe, прежде чем добавлять аккаунты.</p></div>
            <button className="button button--secondary" onClick={() => run('exe', async () => setState(await api.selectExecutable()))}>Выбрать файл</button>
          </section>
        )}

        {view === 'accounts' && (
          displayAccounts.length ? (
            <SortableAccountGrid accounts={displayAccounts} pinnedAccountIds={pinnedAccountIds} onReorder={setAccountOrder}>
              {(account, pinned) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  active={account.id === state.activeAccountId}
                  pinned={pinned}
                  now={now}
                  busy={busyId === account.id}
                  glassEnabled={state.preferences.cardStyle === 'glass'}
                  progressStyle={state.preferences.progressStyle}
                  onSwitch={() => { void run(account.id, async () => setState(await api.switchAccount(account.id)), `${account.label}: Antigravity запущена`); }}
                  onLogin={() => { void run(account.id, async () => setState(await api.loginAccount(account.id)), `${account.label}: вход завершён`); }}
                  onRename={(label) => renameDisplayAccount(account, label)}
                  onDelete={() => setDeleteAccount(account)}
                  onTogglePinned={() => togglePinnedAccount(account.id)}
                />
              )}
            </SortableAccountGrid>
          ) : (
            <section className="empty-state">
              <div className="empty-state__visual" aria-hidden="true"><span /><span /><span /></div>
              <span className="eyebrow">ОДИН ВХОД · ОДНО НАЖАТИЕ</span>
              <h2>Добавьте первый Google-аккаунт</h2>
              <p>Orbit сам откроет вход Google, определит email и сохранит зашифрованную сессию. Затем аккаунт переключается одним нажатием.</p>
              <button className="button button--primary button--large" onClick={() => setAddOpen(true)} disabled={!state.environment.antigravityInstalled}><Plus size={19} /> Добавить Google-аккаунт</button>
            </section>
          )
        )}

        {view === 'usage' && (
          <UsageDashboard
            accounts={state.accounts}
            activeAccountId={state.activeAccountId}
            now={now}
            refreshing={state.usageProvider.refreshing}
            lastRefreshAt={state.usageProvider.lastRefreshAt}
            glassEnabled={state.preferences.cardStyle === 'glass'}
            progressStyle={state.preferences.progressStyle}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            state={state}
            effectiveTheme={effectiveTheme}
            onTheme={(theme) => run('theme', async () => setState(await api.setTheme(theme)))}
            onCardStyle={(cardStyle) => run('card-style', async () => setState(await api.setCardStyle(cardStyle)))}
            onBackground={(background) => run('background', async () => setState(await api.setBackground(background)))}
            onProgressStyle={(progressStyle) => run('progress-style', async () => setState(await api.setProgressStyle(progressStyle)))}
            onSelectExecutable={() => run('exe', async () => setState(await api.selectExecutable()), 'Путь к Antigravity сохранён')}
          />
        )}
      </main>

      {addOpen && <AddAccountModal onClose={() => setAddOpen(false)} onSubmit={async (input) => {
        setBusyId('add');
        try {
          const next = await api.createAccount(input);
          setState(next);
          setToast({ kind: 'success', message: 'Аккаунт добавлен, лимиты получены' });
          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Не удалось завершить вход Google.';
          setToast({ kind: 'error', message });
          return { ok: false, error: message };
        } finally {
          setBusyId(null);
        }
      }} />}
      {deleteAccount && <ConfirmDeleteModal account={deleteAccount} onClose={() => setDeleteAccount(null)} onConfirm={async () => { const next = await run(`delete-${deleteAccount.id}`, () => api.removeAccount(deleteAccount.id), 'Аккаунт удалён'); if (next) setState(next); return Boolean(next); }} />}

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && <div className={`toast toast--${toast.kind}`}>{toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Закрыть уведомление"><X size={16} /></button></div>}
      </div>
    </div>
  );
}
