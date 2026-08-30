import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AccountStore, EMPTY_STATE, normalizeQuota } = require('../../electron/account-store.cjs') as {
  AccountStore: new (userDataPath: string) => AccountStoreInstance;
  EMPTY_STATE: Record<string, unknown>;
  normalizeQuota: (quota: Record<string, unknown>, source?: string) => StoredQuota;
};

interface StoredQuota {
  id: string;
  name: string;
  remainingPercent: number;
  remaining: number | null;
  total: number | null;
  resetAt: string | null;
  source: string;
  updatedAt: string;
}

interface StoredAccount {
  id: string;
  label: string;
  email: string;
  color: string;
  profilePath: string;
  authState: string;
  lastOpenedAt: string | null;
  planTier?: string | null;
  quotas: StoredQuota[];
}

interface StoredState {
  version: number;
  accounts: StoredAccount[];
  activeAccountId: string | null;
  preferences: { theme: string; cardStyle: string; background: string; progressStyle: string; executablePath: string | null };
}

interface AccountStoreInstance {
  filePath: string;
  profilesPath: string;
  init(): Promise<void>;
  read(): Promise<StoredState>;
  createAccount(input: Record<string, unknown>): Promise<StoredAccount>;
  completeSetup(accountId: string): Promise<StoredState>;
  renameAccount(accountId: string, label: string): Promise<StoredState>;
  markOpened(accountId: string): Promise<StoredState>;
  updateQuotas(
    accountId: string,
    quotas: Array<Record<string, unknown>>,
    source?: string,
  ): Promise<StoredState>;
  applyStatuslineSnapshot(snapshot: Record<string, unknown>): Promise<boolean>;
  setPreferences(preferences: Record<string, unknown>): Promise<StoredState>;
}

const temporaryDirectories: string[] = [];

async function newStore() {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-switch-account-store-'));
  temporaryDirectories.push(directory);
  const store = new AccountStore(directory);
  await store.init();
  return { directory, store };
}

afterEach(async () => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop()!;
    if (
      resolve(dirname(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('orbit-switch-account-store-')
    ) {
      throw new Error(`Refusing to remove unexpected test directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('normalizeQuota', () => {
  it('normalizes identifiers, numeric input, precision, and reset timestamps', () => {
    const normalized = normalizeQuota(
      {
        id: '  weekly-pro  ',
        name: '  Weekly Pro  ',
        remainingPercent: '68.46',
        remaining: '34',
        total: '50',
        resetAt: '2026-08-30T10:00:00+03:00',
      },
      'import',
    );

    expect(normalized).toMatchObject({
      id: 'weekly-pro',
      name: 'Weekly Pro',
      remainingPercent: 68.5,
      remaining: 34,
      total: 50,
      resetAt: '2026-08-30T07:00:00.000Z',
      source: 'import',
    });
    expect(Number.isNaN(Date.parse(normalized.updatedAt))).toBe(false);
  });

  it.each([
    [{ name: '', remainingPercent: 50 }, 'У квоты должно быть название.'],
    [
      { name: 'Gemini', remainingPercent: 101 },
      'Остаток для «Gemini» должен быть числом от 0 до 100.',
    ],
    [
      { name: 'Gemini', remainingPercent: 50, total: 0 },
      'Общий лимит для «Gemini» должен быть больше нуля.',
    ],
    [
      { name: 'Gemini', remainingPercent: 50, remaining: -1 },
      'Остаток для «Gemini» не может быть отрицательным.',
    ],
    [
      { name: 'Gemini', remainingPercent: 50, resetAt: 'tomorrow-ish' },
      'Некорректное время сброса для «Gemini».',
    ],
  ])('rejects invalid quota input %#', (input, message) => {
    expect(() => normalizeQuota(input)).toThrow(message);
  });
});

describe('AccountStore persistence and validation', () => {
  it('initializes a private state file and profiles directory with default state', async () => {
    const { store } = await newStore();

    expect((await stat(store.profilesPath)).isDirectory()).toBe(true);
    expect(JSON.parse(await readFile(store.filePath, 'utf8'))).toEqual(EMPTY_STATE);
    expect(await store.read()).toEqual(EMPTY_STATE);
  });

  it('normalizes account fields and prevents case-insensitive duplicates', async () => {
    const { store } = await newStore();
    const account = await store.createAccount({
      label: '  Work  ',
      email: '  Owner@Example.COM  ',
      color: '#123456',
    });

    expect(account).toMatchObject({
      label: 'Work',
      email: 'owner@example.com',
      color: '#123456',
      authState: 'setup',
    });
    expect(account.profilePath.startsWith(store.profilesPath)).toBe(true);

    await expect(
      store.createAccount({ label: 'Duplicate', email: 'OWNER@example.com' }),
    ).rejects.toThrow('Этот Google-аккаунт уже добавлен.');
    await expect(store.createAccount({ label: 'Bad', email: 'not-an-email' })).rejects.toThrow(
      'Укажите корректный адрес электронной почты.',
    );
    await expect(store.createAccount({ label: '   ', email: 'new@example.com' })).rejects.toThrow(
      'Добавьте понятное название аккаунта.',
    );
  });

  it('renames an account persistently and rejects empty labels', async () => {
    const { directory, store } = await newStore();
    const account = await store.createAccount({ label: 'Old name', email: 'rename@example.com' });

    await store.renameAccount(account.id, '  New name  ');
    expect((await store.read()).accounts[0].label).toBe('New name');

    const reopened = new AccountStore(directory);
    expect((await reopened.read()).accounts[0].label).toBe('New name');
    await expect(store.renameAccount(account.id, '   ')).rejects.toThrow(
      'Название аккаунта не может быть пустым.',
    );
    await expect(store.renameAccount('missing-account', 'Valid')).rejects.toThrow('Аккаунт не найден.');
  });

  it('persists account state, preferences, activation, and quotas across instances', async () => {
    const { directory, store } = await newStore();
    const account = await store.createAccount({ label: 'Personal', email: 'me@example.com' });
    await store.completeSetup(account.id);
    await store.markOpened(account.id);
    await store.setPreferences({ theme: 'dark', cardStyle: 'glass', background: 'ribbons', progressStyle: 'segmented', executablePath: 'C:\\Apps\\Antigravity.exe' });
    await store.updateQuotas(account.id, [
      {
        id: 'daily',
        name: 'Daily',
        remainingPercent: 42.24,
        remaining: 21,
        total: 50,
        resetAt: '2026-08-30T00:00:00.000Z',
      },
    ]);

    const reopened = new AccountStore(directory);
    const state = await reopened.read();

    expect(state.activeAccountId).toBe(account.id);
    expect(state.preferences).toEqual({
      theme: 'dark',
      cardStyle: 'glass',
      background: 'ribbons',
      progressStyle: 'segmented',
      executablePath: 'C:\\Apps\\Antigravity.exe',
    });
    expect(state.accounts[0]).toMatchObject({
      id: account.id,
      authState: 'ready',
      email: 'me@example.com',
    });
    expect(state.accounts[0].lastOpenedAt).not.toBeNull();
    expect(state.accounts[0].quotas[0]).toMatchObject({
      id: 'daily',
      remainingPercent: 42.2,
      remaining: 21,
      total: 50,
      source: 'manual',
    });
  });

  it('keeps the last valid card style when an unsupported value is requested', async () => {
    const { store } = await newStore();
    await store.setPreferences({ cardStyle: 'compact' });
    await store.setPreferences({ cardStyle: 'neon-rainbow' });

    expect((await store.read()).preferences.cardStyle).toBe('compact');
  });

  it('keeps the last valid background when an unsupported value is requested', async () => {
    const { store } = await newStore();
    await store.setPreferences({ background: 'horizon' });
    await store.setPreferences({ background: 'animated-nebula' });

    expect((await store.read()).preferences.background).toBe('horizon');
  });

  it('keeps the last valid progress style when an unsupported value is requested', async () => {
    const { store } = await newStore();
    await store.setPreferences({ progressStyle: 'glow' });
    await store.setPreferences({ progressStyle: 'broken-pixels' });

    expect((await store.read()).preferences.progressStyle).toBe('glow');
  });

  it('rejects malformed persistence data with a stable user-facing error', async () => {
    const { store } = await newStore();
    await writeFile(store.filePath, '{broken json', 'utf8');

    await expect(store.read()).rejects.toThrow(
      'Не удалось прочитать локальные настройки Orbit Switch.',
    );
  });

  it('enforces the maximum number of quotas without modifying stored data', async () => {
    const { store } = await newStore();
    const account = await store.createAccount({ label: 'Work', email: 'work@example.com' });
    const tooMany = Array.from({ length: 13 }, (_, index) => ({
      name: `Quota ${index}`,
      remainingPercent: 50,
    }));

    await expect(store.updateQuotas(account.id, tooMany)).rejects.toThrow(
      'Можно сохранить от 0 до 12 квот.',
    );
    expect((await store.read()).accounts[0].quotas).toEqual([]);
  });
});

describe('AccountStore concurrent mutation', () => {
  it('serializes concurrent account creation without losing updates', async () => {
    const { store } = await newStore();
    const count = 20;

    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        store.createAccount({ label: `Account ${index}`, email: `user${index}@example.com` }),
      ),
    );

    const state = await store.read();
    expect(state.accounts).toHaveLength(count);
    expect(new Set(state.accounts.map((account) => account.email)).size).toBe(count);
  });

  it('continues processing mutations after a queued duplicate fails', async () => {
    const { store } = await newStore();
    await store.createAccount({ label: 'Original', email: 'same@example.com' });

    const duplicate = store.createAccount({ label: 'Duplicate', email: 'same@example.com' });
    const next = store.createAccount({ label: 'Next', email: 'next@example.com' });

    await expect(duplicate).rejects.toThrow('Этот Google-аккаунт уже добавлен.');
    await expect(next).resolves.toMatchObject({ email: 'next@example.com' });
    expect((await store.read()).accounts.map((account) => account.email)).toEqual([
      'same@example.com',
      'next@example.com',
    ]);
  });
});

describe('AccountStore statusline snapshot sanitization', () => {
  it('matches normalized email and sanitizes quota fields before persistence', async () => {
    const { store } = await newStore();
    const account = await store.createAccount({ label: 'Work', email: 'work@example.com' });
    const longPlan = `Pro ${'x'.repeat(80)}`;
    const quota = Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => [
        index === 0 ? 'gemini_pro-weekly' : `bucket-${index}`,
        {
          remaining_fraction: index === 0 ? 1.5 : index === 1 ? -0.25 : 0.456,
          reset_time: index === 1 ? 'invalid-reset' : '2026-08-30T10:00:00+03:00',
          access_token: 'must-not-be-persisted',
        },
      ]),
    );

    await expect(
      store.applyStatuslineSnapshot({
        email: ' WORK@EXAMPLE.COM ',
        observedAt: '2026-08-29T09:15:00+03:00',
        planTier: longPlan,
        quota,
        refreshToken: 'must-not-be-persisted',
      }),
    ).resolves.toBe(true);

    const updated = (await store.read()).accounts.find((item) => item.id === account.id)!;
    expect(updated.authState).toBe('ready');
    expect(updated.planTier).toBe(longPlan.slice(0, 40));
    expect(updated.quotas).toHaveLength(12);
    expect(updated.quotas[0]).toMatchObject({
      id: 'statusline:gemini_pro-weekly',
      name: 'Gemini Pro Weekly',
      remainingPercent: 100,
      remaining: null,
      total: null,
      resetAt: '2026-08-30T07:00:00.000Z',
      source: 'statusline',
      updatedAt: '2026-08-29T06:15:00.000Z',
    });
    expect(updated.quotas[1]).toMatchObject({ remainingPercent: 0, resetAt: null });
    expect(JSON.stringify(updated)).not.toContain('must-not-be-persisted');
    expect(updated.quotas.some((item) => item.id === 'statusline:bucket-12')).toBe(false);
  });

  it('ignores snapshots for unknown accounts and snapshots without usable quotas', async () => {
    const { store } = await newStore();
    await store.createAccount({ label: 'Work', email: 'work@example.com' });

    await expect(
      store.applyStatuslineSnapshot({
        email: 'unknown@example.com',
        quota: { pro: { remaining_fraction: 0.5 } },
      }),
    ).resolves.toBe(false);
    await expect(
      store.applyStatuslineSnapshot({
        email: 'work@example.com',
        quota: { pro: { remaining_fraction: 'not-a-number' } },
      }),
    ).resolves.toBe(false);

    expect((await store.read()).accounts[0].quotas).toEqual([]);
  });
});
