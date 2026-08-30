const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { safeStorage } = require('electron');

const TARGET_NAME = 'gemini:antigravity';
const HELPER_NAME = 'orbit-credential-helper.ps1';

const HELPER_SOURCE = String.raw`
param(
  [Parameter(Mandatory = $true)][ValidateSet('get', 'set', 'delete')][string]$Operation,
  [Parameter(Mandatory = $true)][string]$TargetName
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class OrbitCredentialApi {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, Int32 reservedFlag, out IntPtr credentialPtr);

  [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
  public static extern void CredFree(IntPtr buffer);
}
'@

if ($Operation -eq 'get') {
  $pointer = [IntPtr]::Zero
  if (-not [OrbitCredentialApi]::CredRead($TargetName, 1, 0, [ref]$pointer)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($code -eq 1168) { 'null'; exit 0 }
    throw [ComponentModel.Win32Exception]::new($code)
  }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $pointer,
      [type][OrbitCredentialApi+CREDENTIAL]
    )
    $blob = New-Object byte[] $credential.CredentialBlobSize
    if ($credential.CredentialBlobSize -gt 0) {
      [Runtime.InteropServices.Marshal]::Copy(
        $credential.CredentialBlob,
        $blob,
        0,
        [int]$credential.CredentialBlobSize
      )
    }
    [pscustomobject]@{
      userName = $credential.UserName
      blobBase64 = [Convert]::ToBase64String($blob)
      persist = [int]$credential.Persist
    } | ConvertTo-Json -Compress
  } finally {
    [OrbitCredentialApi]::CredFree($pointer)
  }
  exit 0
}

if ($Operation -eq 'delete') {
  if (-not [OrbitCredentialApi]::CredDelete($TargetName, 1, 0)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($code -ne 1168) { throw [ComponentModel.Win32Exception]::new($code) }
  }
  '{"ok":true}'
  exit 0
}

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { throw 'Credential input is empty.' }
$data = $raw | ConvertFrom-Json
$blob = [Convert]::FromBase64String([string]$data.blobBase64)
$blobPointer = [IntPtr]::Zero
try {
  if ($blob.Length -gt 0) {
    $blobPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($blob.Length)
    [Runtime.InteropServices.Marshal]::Copy($blob, 0, $blobPointer, $blob.Length)
  }
  $credential = New-Object OrbitCredentialApi+CREDENTIAL
  $credential.Flags = 0
  $credential.Type = 1
  $credential.TargetName = $TargetName
  $credential.CredentialBlobSize = $blob.Length
  $credential.CredentialBlob = $blobPointer
  $credential.Persist = if ($data.persist) { [uint32]$data.persist } else { 2 }
  $credential.UserName = [string]$data.userName
  if (-not [OrbitCredentialApi]::CredWrite([ref]$credential, 0)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw [ComponentModel.Win32Exception]::new($code)
  }
  '{"ok":true}'
} finally {
  if ($blobPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPointer)
  }
}
`;

async function ensureHelper(userDataPath) {
  const helperPath = path.join(userDataPath, HELPER_NAME);
  let current = null;
  try {
    current = await fs.readFile(helperPath, 'utf8');
  } catch {
    // Created below.
  }
  if (current !== HELPER_SOURCE) {
    await fs.mkdir(userDataPath, { recursive: true });
    await fs.writeFile(helperPath, HELPER_SOURCE, { encoding: 'utf8', mode: 0o600 });
  }
  return helperPath;
}

async function runHelper(userDataPath, operation, payload = null) {
  const helperPath = await ensureHelper(userDataPath);
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-Operation', operation, '-TargetName', TARGET_NAME],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Windows Credential Manager недоступен: ${Buffer.concat(stderr).toString('utf8').trim() || `код ${code}`}`));
        return;
      }
      const text = Buffer.concat(stdout).toString('utf8').trim();
      try {
        resolve(text ? JSON.parse(text) : null);
      } catch {
        reject(new Error('Windows Credential Manager вернул некорректный ответ.'));
      }
    });
    child.stdin.end(payload == null ? '' : JSON.stringify(payload));
  });
}

async function readCredential(userDataPath) {
  return runHelper(userDataPath, 'get');
}

async function writeCredential(userDataPath, credential) {
  if (!credential?.blobBase64) throw new Error('Сохранённая авторизация Google повреждена.');
  await runHelper(userDataPath, 'set', credential);
}

async function deleteCredential(userDataPath) {
  await runHelper(userDataPath, 'delete');
}

function sealCredential(credential) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows не разрешила безопасно зашифровать авторизацию Google.');
  }
  return safeStorage.encryptString(JSON.stringify(credential)).toString('base64');
}

function openCredential(cipherText) {
  if (!cipherText || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Для аккаунта требуется повторный вход Google.');
  }
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(cipherText, 'base64')));
  } catch {
    throw new Error('Не удалось расшифровать авторизацию. Выполните вход заново.');
  }
}

module.exports = {
  deleteCredential,
  openCredential,
  readCredential,
  sealCredential,
  writeCredential,
};
