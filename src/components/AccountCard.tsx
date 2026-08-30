import { Check, GripVertical, LogIn, PencilLine, Pin, Play, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Account, ProgressStyle } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { QuotaBar } from './QuotaBar';

interface AccountCardProps {
  account: Account;
  active: boolean;
  pinned: boolean;
  now: number;
  busy: boolean;
  glassEnabled: boolean;
  progressStyle: ProgressStyle;
  onSwitch(): void;
  onLogin(): void;
  onRename(label: string): Promise<boolean>;
  onDelete(): void;
  onTogglePinned(): void;
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function stopSortActivation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function AccountCard({ account, active, pinned, now, busy, glassEnabled, progressStyle, onSwitch, onLogin, onRename, onDelete, onTogglePinned }: AccountCardProps) {
  const authenticating = account.authState === 'authenticating';
  const ready = account.authState === 'ready';
  const hasAuthError = account.authState === 'error' || account.authState === 'expired';
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(account.label);
  const [renaming, setRenaming] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInFlightRef = useRef(false);

  useEffect(() => {
    if (!editingName) setDraftName(account.label);
  }, [account.label, editingName]);

  useEffect(() => {
    if (!editingName) return;
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    const caretPosition = input.value.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, [editingName]);

  const startRename = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (renaming) return;
    setDraftName(account.label);
    setEditingName(true);
  };

  const cancelRename = () => {
    setDraftName(account.label);
    setEditingName(false);
  };

  const commitRename = async () => {
    if (renameInFlightRef.current) return;
    const nextLabel = draftName.trim().slice(0, 60);
    if (!nextLabel || nextLabel === account.label) {
      cancelRename();
      return;
    }

    renameInFlightRef.current = true;
    setRenaming(true);
    const renamed = await onRename(nextLabel);
    renameInFlightRef.current = false;
    setRenaming(false);
    if (!renamed) setDraftName(account.label);
    setEditingName(false);
  };

  return (
    <LiquidGlassCard
      enabled={glassEnabled}
      className={`account-card-surface ${active ? 'account-card-surface--active' : ''} ${pinned ? 'account-card-surface--pinned' : ''}`}
    >
      <article className={`account-card ${active ? 'account-card--active' : ''} ${pinned ? 'account-card--pinned' : ''}`}>
      <header className="account-card__header">
        <div className="account-identity">
          <div className="avatar" style={{ '--avatar': account.color } as React.CSSProperties} aria-hidden="true">
            {initials(account.label)}
          </div>
          <div className="account-identity__copy">
            <div className="account-identity__title">
              <h3 className={`account-name-heading ${editingName ? 'is-editing' : ''}`}>
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    className="account-name-editor"
                    value={draftName}
                    maxLength={60}
                    disabled={renaming}
                    data-no-account-drag
                    aria-label={`Новое название для ${account.label}`}
                    aria-busy={renaming}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => { void commitRename(); }}
                    onPointerDown={stopSortActivation}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void commitRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="account-name-trigger"
                    data-no-account-drag
                    aria-label={`${account.label}. Переименовать аккаунт`}
                    onDoubleClick={startRename}
                    onContextMenu={startRename}
                    onPointerDown={stopSortActivation}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter' || event.key === 'F2') startRename(event);
                    }}
                  >
                    <span>{account.label}</span>
                    <PencilLine size={12} aria-hidden="true" />
                  </button>
                )}
              </h3>
            </div>
            <div className="account-identity__meta">
              <p>{account.email || 'Email определится автоматически после входа'}</p>
              {active && ready && <span className="status-pill status-pill--active"><Check size={13} /> Активен</span>}
              {!active && ready && <span className="status-pill">Готов</span>}
              {authenticating && <span className="status-pill status-pill--warning">Вход…</span>}
              {!ready && !authenticating && <span className="status-pill status-pill--warning">Нужен вход</span>}
            </div>
          </div>
        </div>
        <div className="account-card__header-actions">
          <button
            type="button"
            className={`icon-button account-card__pin ${pinned ? 'is-pinned' : ''}`}
            onClick={onTogglePinned}
            onPointerDown={stopSortActivation}
            onKeyDown={stopSortActivation}
            aria-label={pinned ? `Открепить ${account.label}` : `Закрепить ${account.label} наверху`}
            aria-pressed={pinned}
            title={pinned ? 'Открепить аккаунт' : 'Закрепить аккаунт наверху'}
          >
            <Pin size={16} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <span className="account-card__drag-hint" title="Удерживайте ЛКМ и перемещайте карточку" aria-hidden="true">
            <GripVertical size={18} />
          </span>
        </div>
      </header>

      {!ready ? (
        <div className={`setup-callout ${hasAuthError ? 'setup-callout--error' : ''}`}>
          <div className="setup-callout__icon">
            {authenticating ? <RefreshCcw className="spin" size={19} aria-hidden="true" /> : <LogIn size={19} aria-hidden="true" />}
          </div>
          <div>
            <strong>{authenticating ? 'Завершите защищённый вход Google' : hasAuthError ? 'Вход не завершён' : 'Войдите через Google'}</strong>
            <p>{authenticating
              ? 'Orbit уже открыл страницу Google. После подтверждения аккаунт добавится сам.'
              : account.authError || 'Orbit откроет официальный OAuth Google и сам получит данные аккаунта.'}</p>
          </div>
          {!authenticating && (
            <button className="button button--secondary" onClick={onLogin} onPointerDown={stopSortActivation} onKeyDown={stopSortActivation} disabled={busy}>
              <LogIn size={17} /> {hasAuthError ? 'Повторить вход' : 'Войти'}
            </button>
          )}
        </div>
      ) : account.quotas.length ? (
        <div className="quota-list">
          {account.quotas.slice(0, 3).map((quota) => (
            <QuotaBar key={quota.id} quota={quota} now={now} progressStyle={progressStyle} />
          ))}
        </div>
      ) : (
        <div className="no-quota">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Ожидаем данные Antigravity</strong>
            <p>Orbit получит лимиты автоматически при обновлении или переключении.</p>
          </div>
        </div>
      )}

      <footer className="account-card__footer">
        <button
          className="icon-button icon-button--danger"
          onClick={onDelete}
          onPointerDown={stopSortActivation}
          onKeyDown={stopSortActivation}
          aria-label={`Удалить ${account.label}`}
          title="Удалить аккаунт"
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
        <button
          className={`button ${active ? 'button--secondary' : 'button--primary'}`}
          onClick={onSwitch}
          onPointerDown={stopSortActivation}
          onKeyDown={stopSortActivation}
          disabled={busy || !ready}
        >
          {busy ? <RefreshCcw className="spin" size={17} aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}
          {busy ? 'Переключаем…' : active ? 'Открыть Antigravity' : 'Переключить'}
        </button>
      </footer>
      </article>
    </LiquidGlassCard>
  );
}
