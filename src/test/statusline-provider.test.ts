import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { configure, getStatus, pathsFor, readLatestSnapshot } = require(
  '../../electron/statusline-provider.cjs',
) as StatuslineProvider;

interface ProviderPaths {
  cliSettingsPath: string;
  helperPath: string;
  snapshotPath: string;
}

interface StatuslineProvider {
  configure(userDataPath: string): Promise<{
    configured: boolean;
    hasOtherStatusline: boolean;
    settingsPath: string;
    lastSnapshotAt: string | null;
  }>;
  getStatus(userDataPath: string): Promise<{
    configured: boolean;
    hasOtherStatusline: boolean;
    settingsPath: string;
    lastSnapshotAt: string | null;
  }>;
  pathsFor(userDataPath: string): ProviderPaths;
  readLatestSnapshot(userDataPath: string): Promise<Record<string, unknown> | null>;
}

const temporaryDirectories: string[] = [];
const originalUserProfile = process.env.USERPROFILE;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orbit-switch-statusline-'));
  temporaryDirectories.push(root);
  const userProfile = join(root, 'profile');
  const userDataPath = join(root, 'orbit-data');
  process.env.USERPROFILE = userProfile;
  return { root, userProfile, userDataPath, paths: pathsFor(userDataPath) };
}

afterEach(async () => {
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;

  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop()!;
    if (
      resolve(dirname(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('orbit-switch-statusline-')
    ) {
      throw new Error(`Refusing to remove unexpected test directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('readLatestSnapshot', () => {
  it('returns null when no snapshot exists or the top-level shape is invalid', async () => {
    const { userDataPath, paths } = await fixture();
    expect(await readLatestSnapshot(userDataPath)).toBeNull();

    await mkdir(userDataPath, { recursive: true });
    await writeFile(paths.snapshotPath, JSON.stringify({ email: 42, quota: {} }), 'utf8');
    expect(await readLatestSnapshot(userDataPath)).toBeNull();
  });

  it('reads a valid bounded snapshot', async () => {
    const { userDataPath, paths } = await fixture();
    const snapshot = {
      observedAt: '2026-08-29T10:00:00.000Z',
      email: 'work@example.com',
      planTier: 'Pro',
      quota: {
        weekly: { remaining_fraction: 0.42, reset_time: '2026-08-30T10:00:00.000Z' },
      },
    };
    await mkdir(userDataPath, { recursive: true });
    await writeFile(paths.snapshotPath, JSON.stringify(snapshot), 'utf8');

    await expect(readLatestSnapshot(userDataPath)).resolves.toEqual(snapshot);
  });

  it('rejects snapshots larger than one MiB before parsing', async () => {
    const { userDataPath, paths } = await fixture();
    await mkdir(userDataPath, { recursive: true });
    await writeFile(paths.snapshotPath, 'x'.repeat(1024 * 1024 + 1), 'utf8');

    await expect(readLatestSnapshot(userDataPath)).rejects.toThrow(
      'Снимок квот превышает допустимый размер.',
    );
  });
});

describe('statusline configuration', () => {
  it('preserves unrelated settings and writes a sanitizing helper with an explicit field allowlist', async () => {
    const { userDataPath, paths } = await fixture();
    await mkdir(dirname(paths.cliSettingsPath), { recursive: true });
    await writeFile(
      paths.cliSettingsPath,
      JSON.stringify({ theme: 'dark', telemetry: false }),
      'utf8',
    );

    const status = await configure(userDataPath);
    const settings = JSON.parse(await readFile(paths.cliSettingsPath, 'utf8'));
    const helper = await readFile(paths.helperPath, 'utf8');

    expect(status).toMatchObject({
      configured: true,
      hasOtherStatusline: false,
      settingsPath: paths.cliSettingsPath,
    });
    expect(settings).toMatchObject({ theme: 'dark', telemetry: false });
    expect(settings.statusLine.command).toContain('orbit-statusline.ps1');
    expect(helper).toContain("$raw.Length -gt 1048576");
    expect(helper).toContain('email = [string]$data.email');
    expect(helper).toContain('planTier = [string]$data.plan_tier');
    expect(helper).toContain('remaining_fraction = $value.remaining_fraction');
    expect(helper).toContain('reset_time = $value.reset_time');
    expect(helper).toContain('reset_in_seconds = $value.reset_in_seconds');
    expect(helper).not.toContain('$value.access_token');
    expect(helper).not.toContain('$data.refresh_token');
  });

  it('detects another configured statusline and refuses to overwrite it', async () => {
    const { userDataPath, paths } = await fixture();
    const originalSettings = {
      statusLine: { type: 'command', command: 'C:\\Tools\\existing-statusline.exe' },
    };
    await mkdir(dirname(paths.cliSettingsPath), { recursive: true });
    await writeFile(paths.cliSettingsPath, JSON.stringify(originalSettings), 'utf8');

    await expect(getStatus(userDataPath)).resolves.toMatchObject({
      configured: false,
      hasOtherStatusline: true,
    });
    await expect(configure(userDataPath)).rejects.toThrow(
      'В Antigravity CLI уже настроена другая status line.',
    );
    await expect(access(paths.helperPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(paths.cliSettingsPath, 'utf8'))).toEqual(originalSettings);
  });

  it('reports the timestamp of the latest snapshot', async () => {
    const { userDataPath, paths } = await fixture();
    await mkdir(userDataPath, { recursive: true });
    await writeFile(
      paths.snapshotPath,
      JSON.stringify({
        observedAt: '2026-08-29T08:30:00.000Z',
        email: 'work@example.com',
        quota: {},
      }),
      'utf8',
    );

    await expect(getStatus(userDataPath)).resolves.toMatchObject({
      lastSnapshotAt: '2026-08-29T08:30:00.000Z',
    });
  });
});
