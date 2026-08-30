export function countdownParts(resetAt: string | null, now = Date.now()) {
  if (!resetAt) return null;
  const target = new Date(resetAt).getTime();
  if (!Number.isFinite(target)) return null;
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  return {
    expired: target <= now,
    totalSeconds,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCountdown(resetAt: string | null, now = Date.now()) {
  const parts = countdownParts(resetAt, now);
  if (!parts) return 'Время не указано';
  if (parts.expired) return 'Ожидаем подтверждение сброса';
  const h = String(parts.hours).padStart(2, '0');
  const m = String(parts.minutes).padStart(2, '0');
  const s = String(parts.seconds).padStart(2, '0');
  return parts.days > 0 ? `${parts.days} дн. ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

export function formatResetAt(resetAt: string | null, locale = 'ru-RU') {
  if (!resetAt) return 'Сброс не указан';
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return 'Сброс не указан';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function formatRelativeUpdated(updatedAt: string, now = Date.now()) {
  const difference = Math.max(0, now - new Date(updatedAt).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

export function isStale(updatedAt: string, now = Date.now(), ttlHours = 12) {
  return now - new Date(updatedAt).getTime() > ttlHours * 3_600_000;
}
