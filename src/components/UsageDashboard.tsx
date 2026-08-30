import { AlertTriangle, CheckCircle2, Clock3, Gauge, Radio, Sparkles } from 'lucide-react';
import { quotaTone } from '../lib/quota';
import { formatCountdown, formatRelativeUpdated, formatResetAt } from '../lib/time';
import type { Account, ProgressStyle, Quota } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { QuotaBar } from './QuotaBar';

function averageRemaining(account: Account) {
  if (!account.quotas.length) return null;
  return Math.round(account.quotas.reduce((sum, quota) => sum + quota.remainingPercent, 0) / account.quotas.length);
}

function nextReset(accounts: Account[]) {
  return accounts.flatMap((account) => account.quotas)
    .filter((quota): quota is Quota & { resetAt: string } => Boolean(quota.resetAt))
    .filter((quota) => new Date(quota.resetAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.resetAt).getTime() - new Date(b.resetAt).getTime())[0] || null;
}

function Ring({ value, color }: { value: number | null; color: string }) {
  const radius = 42;
  const circumference = Math.PI * radius;
  const dash = value == null ? 0 : circumference * (value / 100);
  return (
    <div className="usage-ring" aria-label={value == null ? 'Нет данных о лимитах' : `В среднем ${value}% осталось`}>
      <svg viewBox="0 0 104 58" role="img" aria-hidden="true">
        <path d="M 10 52 A 42 42 0 0 1 94 52" pathLength={circumference} className="usage-ring__track" />
        <path d="M 10 52 A 42 42 0 0 1 94 52" pathLength={circumference} className="usage-ring__value" style={{ stroke: color, strokeDasharray: `${dash} ${circumference}` }} />
      </svg>
      <strong>{value == null ? '—' : `${value}%`}</strong>
      <span>осталось</span>
    </div>
  );
}

interface UsageDashboardProps {
  accounts: Account[];
  activeAccountId: string | null;
  now: number;
  refreshing: boolean;
  lastRefreshAt: string | null;
  glassEnabled: boolean;
  progressStyle: ProgressStyle;
}

export function UsageDashboard({ accounts, activeAccountId, now, refreshing, lastRefreshAt, glassEnabled, progressStyle }: UsageDashboardProps) {
  const quotas = accounts.flatMap((account) => account.quotas);
  const critical = quotas.filter((quota) => quotaTone(quota.remainingPercent) === 'critical').length;
  const reset = nextReset(accounts);
  return (
    <div className="usage-dashboard">
      <section className="metrics-strip" aria-label="Обзор лимитов">
        <div className="metric-card metric-card--accent">
          <span><Gauge size={18} aria-hidden="true" /> Получено лимитов</span>
          <strong>{quotas.length}</strong>
          <small>на {accounts.length} аккаунтах</small>
        </div>
        <div className="metric-card">
          <span><Clock3 size={18} aria-hidden="true" /> Ближайший сброс</span>
          <strong className="metric-card__time">{reset ? formatCountdown(reset.resetAt, now) : 'Нет данных'}</strong>
          <small>{reset ? `${reset.name} · ${formatResetAt(reset.resetAt)}` : 'Появится после входа'}</small>
        </div>
        <div className={`metric-card ${critical ? 'metric-card--critical' : ''}`}>
          <span><AlertTriangle size={18} aria-hidden="true" /> Требуют внимания</span>
          <strong>{critical}</strong>
          <small>{critical ? 'меньше 10% остатка' : 'критичных лимитов нет'}</small>
        </div>
      </section>

      <section className="provider-banner provider-banner--connected">
        <div className="provider-banner__icon">{refreshing ? <Radio className="spin" size={20} /> : <CheckCircle2 size={20} />}</div>
        <div>
          <strong>{refreshing ? 'Читаем лимиты всех аккаунтов…' : 'Прямое подключение к Antigravity'}</strong>
          <p>{lastRefreshAt
            ? `Остатки и время сброса получены автоматически · ${formatRelativeUpdated(lastRefreshAt, now)}`
            : 'После входа Orbit сам запросит остатки и точное время сброса у локального сервиса Antigravity.'}</p>
        </div>
      </section>

      <div className="usage-grid">
        {accounts.map((account) => {
          const average = averageRemaining(account);
          return (
            <LiquidGlassCard
              key={account.id}
              enabled={glassEnabled}
              className={`usage-account-surface ${account.id === activeAccountId ? 'usage-account-surface--active' : ''}`}
            >
              <article className={`usage-account ${account.id === activeAccountId ? 'usage-account--active' : ''}`}>
              <header>
                <div>
                  <span className="eyebrow">{account.planTier || 'Тариф определится автоматически'}</span>
                  <h3>{account.label}</h3>
                  <p>{account.email || 'Требуется вход Google'}</p>
                </div>
                <Ring value={average} color={account.color} />
              </header>
              {account.quotas.length ? (
                <div className="usage-account__quotas">
                  {account.quotas.map((quota) => (
                    <QuotaBar key={quota.id} quota={quota} now={now} progressStyle={progressStyle} dense />
                  ))}
                </div>
              ) : (
                <div className="usage-empty">
                  <Sparkles size={21} aria-hidden="true" />
                  <p>{account.authState === 'ready'
                    ? 'Antigravity пока не вернула лимиты. Нажмите «Обновить».'
                    : 'Войдите в Google через Orbit — ручной ввод не требуется.'}</p>
                </div>
              )}
              </article>
            </LiquidGlassCard>
          );
        })}
      </div>
    </div>
  );
}
