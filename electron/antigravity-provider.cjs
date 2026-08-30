const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const SERVICE = '/exa.language_server_pb.LanguageServerService';

async function exists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function findLanguageServer(executablePath) {
  const root = path.dirname(executablePath);
  const candidates = [
    path.join(root, 'resources', 'bin', 'language_server.exe'),
    path.join(root, 'resources', 'bin', 'language_server_windows_x64.exe'),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error('Локальный сервис Antigravity не найден. Обновите Antigravity до актуальной версии.');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function request(session, method, payload = {}, timeoutMs = 20000) {
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1',
      port: session.port,
      path: `${SERVICE}/${method}`,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'Connect-Protocol-Version': '1',
        'x-codeium-csrf-token': session.csrfToken,
      },
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          reject(new Error('Antigravity вернула некорректный ответ.'));
          return;
        }
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(parsed?.message || 'Antigravity отклонила запрос.'));
          return;
        }
        resolve(parsed);
      });
    });
    req.once('timeout', () => req.destroy(new Error('Antigravity не ответила вовремя.')));
    req.once('error', reject);
    req.end(body);
  });
}

function ping(session) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1',
      port: session.port,
      path: '/',
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 800,
    }, (response) => {
      response.resume();
      resolve();
    });
    req.once('timeout', () => req.destroy());
    req.once('error', reject);
    req.end();
  });
}

async function waitUntilReady(session) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (session.closed) throw new Error('Локальный сервис Antigravity неожиданно завершился.');
    try {
      await ping(session);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Не удалось запустить локальный сервис Antigravity.');
}

async function start(executablePath) {
  const binaryPath = await findLanguageServer(executablePath);
  const port = await reservePort();
  const httpPort = await reservePort();
  const csrfToken = randomUUID();
  const args = [
    '--standalone',
    '--override_ide_name', 'antigravity',
    '--subclient_type', 'hub',
    '--override_user_agent_name', 'antigravity',
    '--https_server_port', String(port),
    '--http_server_port', String(httpPort),
    '--csrf_token', csrfToken,
    '--app_data_dir', 'antigravity',
    '--api_server_url', 'https://generativelanguage.googleapis.com',
    '--cloud_code_endpoint', 'https://daily-cloudcode-pa.googleapis.com',
    '--disable_telemetry',
  ];
  const child = spawn(binaryPath, args, {
    windowsHide: true,
    stdio: 'ignore',
  });
  const session = { child, port, csrfToken, closed: false };
  child.once('close', () => { session.closed = true; });
  child.once('error', () => { session.closed = true; });
  try {
    await waitUntilReady(session);
    return session;
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function stop(session) {
  if (!session || session.closed) return;
  session.child.kill();
  await Promise.race([
    new Promise((resolve) => session.child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

function parseResetTime(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.seconds != null) {
    const milliseconds = Number(value.seconds) * 1000 + Number(value.nanos || 0) / 1e6;
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function quotaName(group, bucket) {
  const groupName = String(group?.displayName || group?.name || 'Antigravity').trim();
  const rawBucket = String(bucket?.displayName || bucket?.bucketId || bucket?.id || 'Лимит').trim();
  const bucketName = rawBucket
    .replace(/(^|[-_])5h($|[-_])/i, '$1на 5 часов$2')
    .replace(/weekly/i, 'недельный')
    .replace(/[-_]+/g, ' ');
  return `${groupName} · ${bucketName}`;
}

function mapQuotas(summary) {
  const groups = summary?.quotaGroups || summary?.groups || summary?.response?.groups || [];
  const updatedAt = new Date().toISOString();
  return groups.flatMap((group) => (group?.buckets || group?.quotaBuckets || []).map((bucket) => {
    const fraction = Number(bucket?.remainingFraction ?? bucket?.remaining_fraction);
    if (!Number.isFinite(fraction)) return null;
    return {
      id: `antigravity:${String(bucket?.bucketId || bucket?.id || randomUUID()).slice(0, 80)}`,
      name: quotaName(group, bucket),
      remainingPercent: Math.max(0, Math.min(100, Math.round(fraction * 1000) / 10)),
      remaining: null,
      total: null,
      resetAt: parseResetTime(bucket?.resetTime ?? bucket?.reset_time),
      source: 'antigravity',
      updatedAt,
    };
  }).filter(Boolean)).slice(0, 16);
}

async function readAccount(session) {
  const [status, summary] = await Promise.all([
    request(session, 'GetUserStatus'),
    request(session, 'RetrieveUserQuotaSummary'),
  ]);
  const user = status?.userStatus || status?.user || status;
  const email = String(user?.email || status?.email || '').trim().toLowerCase();
  if (!email) throw new Error('Antigravity не вернула данные вошедшего Google-аккаунта.');
  return {
    email,
    displayName: String(user?.name || user?.displayName || '').trim() || null,
    planTier: String(
      user?.userTier?.displayName
      || user?.userTier?.name
      || user?.planName
      || status?.planName
      || '',
    ).trim() || null,
    quotas: mapQuotas(summary),
  };
}

function beginLogin(session) {
  return request(session, 'Login', {}, 5 * 60 * 1000);
}

module.exports = {
  beginLogin,
  mapQuotas,
  readAccount,
  start,
  stop,
};
