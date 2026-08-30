import type { Quota, QuotaSource } from '../types';

export type QuotaTone = 'healthy' | 'warning' | 'critical';

export function quotaTone(remainingPercent: number): QuotaTone {
  if (remainingPercent < 10) return 'critical';
  if (remainingPercent <= 25) return 'warning';
  return 'healthy';
}

export function quotaSummary(quota: Quota) {
  if (quota.remaining != null && quota.total != null) {
    return `${quota.remaining.toLocaleString('ru-RU')} из ${quota.total.toLocaleString('ru-RU')}`;
  }
  return `${Math.round(quota.remainingPercent)}% осталось`;
}

export function sourceLabel(source: QuotaSource) {
  return {
    antigravity: 'Antigravity',
    manual: 'Вручную',
    import: 'JSON-импорт',
    statusline: 'Antigravity CLI',
  }[source];
}
