import { describe, expect, it } from 'vitest';
import { groupAccountsByPinnedState, moveAccountOrder, normalizeAccountOrder } from './account-order';

const accounts = [
  { id: 'account-primary' },
  { id: 'account-a' },
  { id: 'account-b' },
  { id: 'account-c' },
];

describe('account order', () => {
  it('applies a saved order and appends newly discovered accounts', () => {
    expect(normalizeAccountOrder(accounts, ['account-b', 'account-primary']).map(({ id }) => id)).toEqual([
      'account-b',
      'account-primary',
      'account-a',
      'account-c',
    ]);
  });

  it('ignores stale and duplicate ids from storage', () => {
    expect(normalizeAccountOrder(accounts, ['missing', 'account-a', 'account-a']).map(({ id }) => id)).toEqual([
      'account-a',
      'account-primary',
      'account-b',
      'account-c',
    ]);
  });

  it('moves an account without mutating the current order', () => {
    const current = accounts.map(({ id }) => id);
    expect(moveAccountOrder(current, 'account-c', 'account-a')).toEqual(['account-primary', 'account-c', 'account-a', 'account-b']);
    expect(current).toEqual(['account-primary', 'account-a', 'account-b', 'account-c']);
    expect(moveAccountOrder(current, 'missing', 'account-primary')).toEqual(current);
  });

  it('keeps pinned accounts first while preserving both group orders', () => {
    expect(groupAccountsByPinnedState(accounts, ['account-b', 'account-primary']).map(({ id }) => id)).toEqual([
      'account-primary',
      'account-b',
      'account-a',
      'account-c',
    ]);
  });

  it('ignores stale and duplicate pinned ids', () => {
    expect(groupAccountsByPinnedState(accounts, ['missing', 'account-a', 'account-a']).map(({ id }) => id)).toEqual([
      'account-a',
      'account-primary',
      'account-b',
      'account-c',
    ]);
  });
});
