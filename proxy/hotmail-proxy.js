const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const HOST = process.env.HOTMAIL_PROXY_HOST || '127.0.0.1';
const PORT = Number(process.env.HOTMAIL_PROXY_PORT || process.env.PORT || 8787);
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_ORIGIN = 'https://graph.microsoft.com';
const OUTLOOK_API_ORIGIN = 'https://outlook.office.com';
const PAGE_SIZE = 10;
const REQUEST_TIMEOUT_MS = 20_000;
const GRAPH_MESSAGE_FIELDS = [
  'id',
  'internetMessageId',
  'subject',
  'from',
  'bodyPreview',
  'receivedDateTime',
];
const GRAPH_SCOPES = [
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
];
const CURL_STATUS_MARKER = '__CURL_STATUS__:';
const ACCESS_TOKEN_SAFETY_BUFFER_MS = 60_000;
const tokenCache = new Map();
const tokenRefreshInflight = new Map();

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function normalizeMailboxId(mailbox = 'INBOX') {
  const normalized = String(mailbox || '').trim().toLowerCase();
  if (normalized === 'junk' || normalized === 'junk email' || normalized === 'junkemail') {
    return 'junkemail';
  }
  return 'inbox';
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeMailAddress(rawValue) {
  if (!rawValue) return '';
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }
  if (typeof rawValue === 'object') {
    return String(
      rawValue.emailAddress?.address
      || rawValue.EmailAddress?.Address
      || rawValue.address
      || rawValue.email
      || rawValue.sender
      || rawValue.from
      || rawValue.Address
      || ''
    ).trim();
  }
  return '';
}

function stripHtmlTags(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeGraphMessage(message = {}) {
  return {
    id: String(message.id || message.internetMessageId || '').trim(),
    subject: String(message.subject || message.title || '').trim(),
    from: {
      emailAddress: {
        address: normalizeMailAddress(
          message.from_email
          || message.sender_email
          || message.from
          || message.sender
          || message.emailAddress
        ),
      },
    },
    bodyPreview: String(
      message.bodyPreview
      || message.preview
      || message.snippet
      || message.text
      || message.body
      || stripHtmlTags(message.html || message.content || '')
      || ''
    ).trim(),
    receivedDateTime: String(
      message.receivedDateTime
      || message.received_at
      || message.receivedAt
      || message.date
      || message.created_at
      || message.time
      || ''
    ).trim(),
  };
}

function normalizeOutlookMessage(message = {}) {
  return {
    id: String(message.Id || message.id || '').trim(),
    subject: String(message.Subject || message.subject || '').trim(),
    from: {
      emailAddress: {
        address: normalizeMailAddress(
          message.From
          || message.from
          || message.Sender
          || message.sender
        ),
      },
    },
    bodyPreview: String(
      message.BodyPreview
      || message.bodyPreview
      || message.preview
      || message.text
      || stripHtmlTags(message.Body?.Content || message.body || '')
      || ''
    ).trim(),
    receivedDateTime: String(
      message.ReceivedDateTime
      || message.receivedDateTime
      || message.DateTimeReceived
      || ''
    ).trim(),
  };
}

async function runCurlRequest(options = {}) {
  const {
    url,
    method = 'GET',
    headers = {},
    formEntries = [],
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  const args = [
    '-sS',
    '--max-time', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '--connect-timeout', String(Math.max(1, Math.ceil(Math.min(timeoutMs, 10_000) / 1000))),
    '-X', method,
    url,
    '-w', `\n${CURL_STATUS_MARKER}%{http_code}`,
  ];

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  for (const [key, value] of formEntries) {
    args.push('--data-urlencode', `${key}=${value}`);
  }

  let stdout;
  try {
    ({ stdout } = await execFileAsync('curl', args, {
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const error = new Error('本机未找到 curl，请先安装 curl 后再启动 Hotmail 代理。');
      error.code = 'HOTMAIL_PROXY_CURL_MISSING';
      throw error;
    }
    const stderr = String(err?.stderr || '').trim();
    const error = new Error(stderr || err.message || 'curl 请求失败。');
    error.code = 'HOTMAIL_PROXY_CURL_FAILED';
    throw error;
  }

  const markerIndex = stdout.lastIndexOf(`\n${CURL_STATUS_MARKER}`);
  const fallbackIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
  const splitIndex = markerIndex >= 0 ? markerIndex : fallbackIndex;
  if (splitIndex < 0) {
    const error = new Error('无法解析 curl 响应状态码。');
    error.code = 'HOTMAIL_PROXY_CURL_PARSE_FAILED';
    throw error;
  }

  const body = stdout.slice(0, splitIndex).trim();
  const statusText = stdout.slice(splitIndex).replace(/^\n?__CURL_STATUS__:/, '').trim();
  const statusCode = Number.parseInt(statusText, 10);
  if (!Number.isFinite(statusCode)) {
    const error = new Error(`无法解析 HTTP 状态码：${statusText}`);
    error.code = 'HOTMAIL_PROXY_CURL_PARSE_FAILED';
    throw error;
  }

  return {
    statusCode,
    text: body,
  };
}

function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildCacheKey(account, strategy) {
  return [
    strategy,
    String(account?.email || '').trim().toLowerCase(),
    String(account?.clientId || '').trim(),
    String(account?.refreshToken || '').trim(),
  ].join('::');
}

function isAccessTokenUsable(account, now = Date.now()) {
  return Boolean(account?.accessToken)
    && Number.isFinite(Number(account?.expiresAt))
    && Number(account.expiresAt) - now > ACCESS_TOKEN_SAFETY_BUFFER_MS;
}

function readCachedToken(account, strategy) {
  const cacheKey = buildCacheKey(account, strategy);
  const cached = tokenCache.get(cacheKey);
  if (!cached || !isAccessTokenUsable(cached)) {
    if (cached) {
      tokenCache.delete(cacheKey);
    }
    return null;
  }
  return {
    ...account,
    ...cached,
  };
}

function writeCachedToken(account, strategy) {
  const cacheKey = buildCacheKey(account, strategy);
  const snapshot = {
    accessToken: String(account?.accessToken || ''),
    refreshToken: String(account?.refreshToken || '').trim(),
    expiresAt: Number(account?.expiresAt || 0),
    lastAuthAt: Number(account?.lastAuthAt || 0),
    tokenScope: String(account?.tokenScope || '').trim(),
  };
  if (isAccessTokenUsable(snapshot)) {
    tokenCache.set(cacheKey, snapshot);
  } else {
    tokenCache.delete(cacheKey);
  }
}

async function refreshAccessToken(account, options = {}) {
  const {
    scopes = null,
    strategy = 'graph',
  } = options;
  const cachedAccount = readCachedToken(account, strategy);
  if (cachedAccount) {
    return cachedAccount;
  }

  const cacheKey = buildCacheKey(account, strategy);
  if (tokenRefreshInflight.has(cacheKey)) {
    const inflightAccount = await tokenRefreshInflight.get(cacheKey);
    return {
      ...account,
      ...inflightAccount,
    };
  }

  const refreshPromise = (async () => {
    const maybeCached = readCachedToken(account, strategy);
    if (maybeCached) {
      return maybeCached;
    }

    const formEntries = [
      ['client_id', account.clientId],
      ['grant_type', 'refresh_token'],
      ['refresh_token', account.refreshToken],
    ];
    if (Array.isArray(scopes) && scopes.length) {
      formEntries.push(['scope', scopes.join(' ')]);
    }

    let response;
    try {
      response = await runCurlRequest({
        url: TOKEN_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        formEntries,
      });
    } catch (err) {
      const error = new Error(`Hotmail 令牌刷新失败：${err.message}`);
      error.code = strategy === 'graph' ? 'HOTMAIL_TOKEN_REFRESH_FAILED' : 'HOTMAIL_OUTLOOK_TOKEN_REFRESH_FAILED';
      throw error;
    }

    const payload = parseJson(response.text);
    if (response.statusCode < 200 || response.statusCode >= 300 || !payload?.access_token) {
      const errorText = payload?.error_description || payload?.error?.message || payload?.error || payload?.message || response.text || `HTTP ${response.statusCode}`;
      const error = new Error(`Hotmail 令牌刷新失败：${errorText}`);
      error.code = strategy === 'graph' ? 'HOTMAIL_TOKEN_REFRESH_FAILED' : 'HOTMAIL_OUTLOOK_TOKEN_REFRESH_FAILED';
      throw error;
    }

    const expiresInSeconds = Math.max(60, Number(payload.expires_in || payload.expiresIn || 0) || 3600);
    const nextAccount = {
      ...account,
      accessToken: String(payload.access_token || ''),
      refreshToken: String(payload.refresh_token || '').trim() || account.refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
      lastAuthAt: Date.now(),
      tokenScope: String(payload.scope || '').trim(),
    };
    writeCachedToken(nextAccount, strategy);
    return nextAccount;
  })();

  tokenRefreshInflight.set(cacheKey, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    tokenRefreshInflight.delete(cacheKey);
  }
}

async function requestGraphMessages(account, mailbox = 'INBOX') {
  const folderId = normalizeMailboxId(mailbox);
  const url = new URL(`${GRAPH_API_ORIGIN}/v1.0/me/mailFolders/${folderId}/messages`);
  url.searchParams.set('$top', String(PAGE_SIZE));
  url.searchParams.set('$select', GRAPH_MESSAGE_FIELDS.join(','));
  url.searchParams.set('$orderby', 'receivedDateTime desc');

  let response;
  try {
    response = await runCurlRequest({
      url: url.toString(),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${account.accessToken}`,
      },
    });
  } catch (err) {
    const error = new Error(`Hotmail Graph 邮件请求失败：${err.message}`);
    error.code = 'HOTMAIL_GRAPH_REQUEST_FAILED';
    throw error;
  }

  const payload = parseJson(response.text);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const errorText = payload?.error?.message || payload?.error_description || payload?.message || response.text || `HTTP ${response.statusCode}`;
    const error = new Error(`Hotmail Graph 邮件请求失败：${errorText}`);
    error.code = response.statusCode === 401 || response.statusCode === 403
      ? 'HOTMAIL_GRAPH_AUTH_FAILED'
      : 'HOTMAIL_GRAPH_REQUEST_FAILED';
    throw error;
  }

  const messages = Array.isArray(payload?.value) ? payload.value.map(normalizeGraphMessage) : [];
  return {
    mailbox,
    count: messages.length,
    messages,
  };
}

async function requestOutlookApiMessages(account, mailbox = 'INBOX') {
  const folderId = normalizeMailboxId(mailbox);
  const url = new URL(`${OUTLOOK_API_ORIGIN}/api/v2.0/me/mailfolders/${folderId}/messages`);
  url.searchParams.set('$top', String(PAGE_SIZE));
  url.searchParams.set('$select', 'Id,Subject,From,BodyPreview,ReceivedDateTime');
  url.searchParams.set('$orderby', 'ReceivedDateTime desc');

  let response;
  try {
    response = await runCurlRequest({
      url: url.toString(),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${account.accessToken}`,
      },
    });
  } catch (err) {
    const error = new Error(`Hotmail Outlook 邮件请求失败：${err.message}`);
    error.code = 'HOTMAIL_OUTLOOK_API_REQUEST_FAILED';
    throw error;
  }

  const payload = parseJson(response.text);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const errorText = payload?.error?.message || payload?.error_description || payload?.message || response.text || `HTTP ${response.statusCode}`;
    const error = new Error(`Hotmail Outlook 邮件请求失败：${errorText}`);
    error.code = response.statusCode === 401 || response.statusCode === 403
      ? 'HOTMAIL_OUTLOOK_API_AUTH_FAILED'
      : 'HOTMAIL_OUTLOOK_API_REQUEST_FAILED';
    throw error;
  }

  const messages = Array.isArray(payload?.value) ? payload.value.map(normalizeOutlookMessage) : [];
  return {
    mailbox,
    count: messages.length,
    messages,
  };
}

function buildAccountSnapshot(account = {}) {
  return {
    email: String(account.email || ''),
    clientId: String(account.clientId || ''),
    refreshToken: String(account.refreshToken || ''),
    accessToken: String(account.accessToken || ''),
    expiresAt: Number(account.expiresAt || 0),
    lastAuthAt: Number(account.lastAuthAt || normalizeTimestamp(Date.now())),
    tokenScope: String(account.tokenScope || ''),
  };
}

async function collectGraphMessages(account, mailboxes) {
  let workingAccount = await refreshAccessToken(account, {
    scopes: GRAPH_SCOPES,
    strategy: 'graph',
  });
  const mailboxResults = [];

  for (const mailbox of mailboxes) {
    let result;
    try {
      result = await requestGraphMessages(workingAccount, mailbox);
    } catch (err) {
      if (err?.code !== 'HOTMAIL_GRAPH_AUTH_FAILED') {
        throw err;
      }

      workingAccount = await refreshAccessToken({
        ...workingAccount,
        accessToken: '',
        expiresAt: 0,
      }, {
        scopes: GRAPH_SCOPES,
        strategy: 'graph',
      });
      result = await requestGraphMessages(workingAccount, mailbox);
    }

    mailboxResults.push({
      mailbox: result.mailbox,
      count: result.count,
      messages: result.messages.map((message) => ({ ...message, mailbox: result.mailbox })),
    });
  }

  return {
    strategy: 'graph',
    account: buildAccountSnapshot(workingAccount),
    mailboxResults,
  };
}

async function collectOutlookApiMessages(account, mailboxes) {
  let workingAccount = await refreshAccessToken(account, {
    strategy: 'outlook',
  });
  const mailboxResults = [];

  for (const mailbox of mailboxes) {
    let result;
    try {
      result = await requestOutlookApiMessages(workingAccount, mailbox);
    } catch (err) {
      if (err?.code !== 'HOTMAIL_OUTLOOK_API_AUTH_FAILED') {
        throw err;
      }

      workingAccount = await refreshAccessToken({
        ...workingAccount,
        accessToken: '',
        expiresAt: 0,
      }, {
        strategy: 'outlook',
      });
      result = await requestOutlookApiMessages(workingAccount, mailbox);
    }

    mailboxResults.push({
      mailbox: result.mailbox,
      count: result.count,
      messages: result.messages.map((message) => ({ ...message, mailbox: result.mailbox })),
    });
  }

  return {
    strategy: 'outlook',
    account: buildAccountSnapshot(workingAccount),
    mailboxResults,
  };
}

function shouldFallbackToOutlook(error) {
  const message = String(error?.message || '');
  return [
    'HOTMAIL_TOKEN_REFRESH_FAILED',
    'HOTMAIL_GRAPH_AUTH_FAILED',
    'HOTMAIL_GRAPH_REQUEST_FAILED',
  ].includes(error?.code)
    || /AADSTS70000|invalid_grant|unauthorized or expired|Mail\.Read|graph\.microsoft\.com/i.test(message);
}

async function collectMessages(account, mailboxes = ['INBOX', 'Junk']) {
  const errors = [];

  try {
    return await collectGraphMessages(account, mailboxes);
  } catch (err) {
    errors.push(`Graph: ${err.message}`);
    if (!shouldFallbackToOutlook(err)) {
      throw err;
    }
  }

  try {
    return await collectOutlookApiMessages(account, mailboxes);
  } catch (err) {
    errors.push(`Outlook: ${err.message}`);
    const error = new Error(`Hotmail 邮件读取失败。${errors.join('；')}`);
    error.code = err?.code || 'HOTMAIL_PROXY_REQUEST_FAILED';
    throw error;
  }
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('请求体过大。'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON。'));
      }
    });
    req.on('error', reject);
  });
}

function validateAccountPayload(account = {}) {
  const normalized = {
    email: String(account.email || '').trim(),
    clientId: String(account.clientId || '').trim(),
    refreshToken: String(account.refreshToken || '').trim(),
    accessToken: String(account.accessToken || '').trim(),
    expiresAt: Number(account.expiresAt || 0),
    tokenScope: String(account.tokenScope || '').trim(),
  };

  if (!normalized.email) {
    throw new Error('缺少 Hotmail 邮箱地址。');
  }
  if (!normalized.clientId) {
    throw new Error(`Hotmail 账号 ${normalized.email} 缺少客户端 ID。`);
  }
  if (!normalized.refreshToken) {
    throw new Error(`Hotmail 账号 ${normalized.email} 缺少刷新令牌（refresh token）。`);
  }

  return normalized;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    writeJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, {
      ok: true,
      service: 'hotmail-proxy',
      host: HOST,
      port: PORT,
      transport: 'curl',
      modes: ['graph', 'outlook'],
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/hotmail/messages') {
    try {
      const body = await parseRequestBody(req);
      const account = validateAccountPayload(body.account || {});
      const rawMailboxes = Array.isArray(body.mailboxes) && body.mailboxes.length
        ? body.mailboxes
        : ['INBOX', 'Junk'];
      const mailboxes = rawMailboxes.map((item) => String(item || '').trim()).filter(Boolean);
      const result = await collectMessages(account, mailboxes);
      writeJson(res, 200, result);
    } catch (err) {
      writeJson(res, 502, {
        ok: false,
        error: err.message || 'Hotmail 代理请求失败。',
        code: err.code || 'HOTMAIL_PROXY_REQUEST_FAILED',
      });
    }
    return;
  }

  writeJson(res, 404, {
    ok: false,
    error: '未找到对应接口。',
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[hotmail-proxy] listening on http://${HOST}:${PORT}`);
});
