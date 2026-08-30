const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_SNAPSHOT_BYTES = 1024 * 1024;

function pathsFor(userDataPath) {
  const userProfile = process.env.USERPROFILE || '';
  return {
    cliSettingsPath: path.join(userProfile, '.gemini', 'antigravity-cli', 'settings.json'),
    helperPath: path.join(userDataPath, 'orbit-statusline.ps1'),
    snapshotPath: path.join(userDataPath, 'orbit-statusline-latest.json'),
  };
}

function helperScript(snapshotPath) {
  const escapedPath = snapshotPath.replace(/'/g, "''");
  return String.raw`$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw) -or $raw.Length -gt 1048576) {
  Write-Output 'Orbit • нет данных'
  exit 0
}
$data = $raw | ConvertFrom-Json
$clean = [ordered]@{
  observedAt = [DateTime]::UtcNow.ToString('o')
  email = [string]$data.email
  planTier = [string]$data.plan_tier
  quota = [ordered]@{}
}
if ($null -ne $data.quota) {
  foreach ($property in $data.quota.PSObject.Properties) {
    $value = $property.Value
    $clean.quota[$property.Name] = [ordered]@{
      remaining_fraction = $value.remaining_fraction
      reset_time = $value.reset_time
      reset_in_seconds = $value.reset_in_seconds
    }
  }
}
$json = $clean | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText('${escapedPath}', $json, [Text.UTF8Encoding]::new($false))
$first = @($clean.quota.Values)[0]
if ($null -ne $first -and $null -ne $first.remaining_fraction) {
  $percent = [Math]::Round(([double]$first.remaining_fraction) * 100)
  Write-Output ("Orbit • {0}% осталось" -f $percent)
} else {
  Write-Output 'Orbit • квоты ожидаются'
}
`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function getStatus(userDataPath) {
  const paths = pathsFor(userDataPath);
  const settings = await readJson(paths.cliSettingsPath);
  const command = settings?.statusLine?.command || '';
  return {
    configured: command.includes('orbit-statusline.ps1'),
    hasOtherStatusline: Boolean(settings?.statusLine && !command.includes('orbit-statusline.ps1')),
    settingsPath: paths.cliSettingsPath,
    lastSnapshotAt: (await readJson(paths.snapshotPath))?.observedAt || null,
  };
}

async function configure(userDataPath) {
  const paths = pathsFor(userDataPath);
  const settings = (await readJson(paths.cliSettingsPath)) || {};
  const existingCommand = settings?.statusLine?.command || '';
  if (settings.statusLine && existingCommand && !existingCommand.includes('orbit-statusline.ps1')) {
    throw new Error('В Antigravity CLI уже настроена другая status line. Orbit не будет перезаписывать её автоматически.');
  }

  await fs.mkdir(path.dirname(paths.cliSettingsPath), { recursive: true });
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(paths.helperPath, helperScript(paths.snapshotPath), { encoding: 'utf8', mode: 0o600 });
  const commandPath = paths.helperPath.replace(/"/g, '');
  settings.statusLine = {
    type: 'command',
    command: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${commandPath}"`,
    padding: 0,
    enabled: true,
    stack_with_default: true,
  };
  const temporaryPath = `${paths.cliSettingsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, paths.cliSettingsPath);
  return getStatus(userDataPath);
}

async function readLatestSnapshot(userDataPath) {
  const { snapshotPath } = pathsFor(userDataPath);
  try {
    const stat = await fs.stat(snapshotPath);
    if (stat.size > MAX_SNAPSHOT_BYTES) throw new Error('Снимок квот превышает допустимый размер.');
    const snapshot = await readJson(snapshotPath);
    if (!snapshot || typeof snapshot.email !== 'string' || typeof snapshot.quota !== 'object') return null;
    return snapshot;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

module.exports = { configure, getStatus, readLatestSnapshot, pathsFor };
