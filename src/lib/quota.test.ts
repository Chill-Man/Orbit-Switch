import { describe, expect, it } from 'vitest';

import type { Quota } from '../types';
import { quotaSummary, quotaTone, sourceLabel } from './quota';

function quota(overrides: Partial<Quota> = {}): Quota {
  return {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    remainingPercent: 68.4,
    remaining: null,
    total: null,
    resetAt: null,
    source: 'manual',
    updatedAt: '2026-08-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('quotaTone', () => {
  it.each([
    [0, 'critical'],
    [9.9, 'critical'],
    [10, 'warning'],
    [25, 'warning'],
    [25.1, 'healthy'],
    [100, 'healthy'],
  ] as const)('maps %s%% to %s', (remainingPercent, expected) => {
    expect(quotaTone(remainingPercent)).toBe(expected);
  });
});

describe('quotaSummary', () => {
  it('prefers exact remaining and total values, including a zero remainder', () => {
    const expected = `${(0).toLocaleString('ru-RU')} из ${(20_000).toLocaleString('ru-RU')}`;
    expect(quotaSummary(quota({ remaining: 0, total: 20_000 }))).toBe(expected);
  });

  it('falls back to a rounded percentage when exact values are incomplete', () => {
    expect(quotaSummary(quota({ remaining: 12_345, total: null, remainingPercent: 68.4 }))).toBe(
      '68% осталось',
    );
  });
});

describe('sourceLabel', () => {
  it.each([
    ['manual', 'Вручную'],
    ['import', 'JSON-импорт'],
    ['statusline', 'Antigravity CLI'],
  ] as const)('labels the %s source', (source, expected) => {
    expect(sourceLabel(source)).toBe(expected);
  });
});
