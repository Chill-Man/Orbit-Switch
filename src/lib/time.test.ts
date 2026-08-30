import { describe, expect, it } from 'vitest';

import {
  countdownParts,
  formatCountdown,
  formatRelativeUpdated,
  formatResetAt,
  isStale,
} from './time';

describe('countdownParts', () => {
  it('returns null when reset time is absent or invalid', () => {
    expect(countdownParts(null)).toBeNull();
    expect(countdownParts('not-a-date')).toBeNull();
  });

  it('splits a future reset into days and clock parts', () => {
    const now = Date.parse('2026-08-29T10:00:00.000Z');
    const resetAt = '2026-08-30T12:03:04.000Z';

    expect(countdownParts(resetAt, now)).toEqual({
      expired: false,
      totalSeconds: 93_784,
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
  });

  it('floors partial seconds and clamps an expired reset to zero', () => {
    const target = Date.parse('2026-08-29T10:00:00.000Z');

    expect(countdownParts('2026-08-29T10:00:00.000Z', target - 1)?.totalSeconds).toBe(0);
    expect(countdownParts('2026-08-29T10:00:00.000Z', target)).toMatchObject({
      expired: true,
      totalSeconds: 0,
    });
    expect(countdownParts('2026-08-29T10:00:00.000Z', target + 5_000)).toMatchObject({
      expired: true,
      totalSeconds: 0,
    });
  });
});

describe('countdown formatting', () => {
  const now = Date.parse('2026-08-29T10:00:00.000Z');

  it('formats sub-day and multi-day countdowns with stable-width clock fields', () => {
    expect(formatCountdown('2026-08-29T12:03:04.000Z', now)).toBe('02:03:04');
    expect(formatCountdown('2026-08-30T12:03:04.000Z', now)).toBe('1 дн. 02:03:04');
  });

  it('distinguishes unavailable and expired reset information', () => {
    expect(formatCountdown(null, now)).toBe('Время не указано');
    expect(formatCountdown('invalid', now)).toBe('Время не указано');
    expect(formatCountdown('2026-08-29T10:00:00.000Z', now)).toBe(
      'Ожидаем подтверждение сброса',
    );
  });

  it('uses a safe fallback for an invalid absolute reset date', () => {
    expect(formatResetAt(null)).toBe('Сброс не указан');
    expect(formatResetAt('invalid')).toBe('Сброс не указан');
  });
});

describe('freshness helpers', () => {
  const now = Date.parse('2026-08-29T12:00:00.000Z');

  it.each([
    ['2026-08-29T11:59:30.000Z', 'только что'],
    ['2026-08-29T11:43:00.000Z', '17 мин. назад'],
    ['2026-08-29T09:00:00.000Z', '3 ч. назад'],
    ['2026-08-27T12:00:00.000Z', '2 дн. назад'],
    ['2026-08-29T12:05:00.000Z', 'только что'],
  ])('formats %s relative to now', (updatedAt, expected) => {
    expect(formatRelativeUpdated(updatedAt, now)).toBe(expected);
  });

  it('marks data stale only after the TTL boundary', () => {
    const exactlyTwelveHoursAgo = '2026-08-29T00:00:00.000Z';
    const justOverTwelveHoursAgo = '2026-08-28T23:59:59.999Z';

    expect(isStale(exactlyTwelveHoursAgo, now, 12)).toBe(false);
    expect(isStale(justOverTwelveHoursAgo, now, 12)).toBe(true);
  });
});
