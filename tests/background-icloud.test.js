const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

const bundle = [
  extractFunction('normalizeEmailGenerator'),
  extractFunction('getEmailGeneratorLabel'),
  extractFunction('normalizeVerificationResendCount'),
  extractFunction('normalizeIcloudTargetMailboxType'),
  extractFunction('normalizeIcloudForwardMailProvider'),
  extractFunction('normalizePersistentSettingValue'),
  extractFunction('finalizeIcloudAliasAfterSuccessfulFlow'),
].join('\n');

function createApi(overrides = {}) {
  return new Function('overrides', `
const HOTMAIL_PROVIDER = 'hotmail-api';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const DEFAULT_HOTMAIL_REMOTE_BASE_URL = '';
const DEFAULT_HOTMAIL_LOCAL_BASE_URL = 'http://127.0.0.1:17373';
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const VERIFICATION_RESEND_COUNT_MIN = 0;
const VERIFICATION_RESEND_COUNT_MAX = 20;
const PERSISTED_SETTING_DEFAULTS = {
  mailProvider: '163',
  autoStepDelaySeconds: null,
};

const calls = {
  setUsed: [],
  logs: [],
  deletes: [],
  listCalls: 0,
};

function normalizeIcloudHost(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['icloud.com', 'icloud.com.cn'].includes(normalized) ? normalized : '';
}
function normalizePanelMode(value = '') {
  return String(value || '').trim().toLowerCase() === 'sub2api' ? 'sub2api' : 'cpa';
}
function normalizeMailProvider(value = '') {
  return String(value || '').trim().toLowerCase() || '163';
}
function normalizeAutoRunFallbackThreadIntervalMinutes(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}
function normalizeAutoRunDelayMinutes(value) {
  return Math.max(1, Math.floor(Number(value) || 30));
}
function normalizeAutoStepDelaySeconds(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}
function normalizeHotmailServiceMode() {
  return HOTMAIL_SERVICE_MODE_LOCAL;
}
function normalizeHotmailRemoteBaseUrl(value = '') {
  return String(value || '').trim() || DEFAULT_HOTMAIL_REMOTE_BASE_URL;
}
function normalizeHotmailLocalBaseUrl(value = '') {
  return String(value || '').trim() || DEFAULT_HOTMAIL_LOCAL_BASE_URL;
}
function normalizeCloudflareDomain(value = '') {
  return String(value || '').trim().toLowerCase();
}
function normalizeCloudflareDomains(values = []) {
  return Array.isArray(values) ? values : [];
}
function normalizeCloudflareTempEmailAddress(value = '') {
  return String(value || '').trim().toLowerCase();
}
function normalizeCloudflareTempEmailReceiveMailbox(value = '') {
  const normalized = normalizeCloudflareTempEmailAddress(value);
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized) ? normalized : '';
}
function normalizeHotmailAccounts(values = []) {
  return Array.isArray(values) ? values : [];
}
function getManualAliasUsageMap(state) {
  return { ...(state?.manualAliasUsage || {}) };
}
function getPreservedAliasMap(state) {
  return { ...(state?.preservedAliases || {}) };
}
function isAliasPreserved(state, email) {
  return Boolean(getPreservedAliasMap(state)[String(email || '').trim().toLowerCase()]);
}
async function setIcloudAliasUsedState(payload, options = {}) {
  calls.setUsed.push({ payload, options });
}
async function addLog(message, level = 'info') {
  calls.logs.push({ message, level });
}
async function deleteIcloudAlias(alias) {
  calls.deletes.push(alias);
}
async function listIcloudAliases() {
  calls.listCalls += 1;
  return overrides.listIcloudAliases ? overrides.listIcloudAliases() : [];
}
function findIcloudAliasByEmail(aliases, email) {
  return (aliases || []).find((alias) => String(alias.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
}
function getErrorMessage(error) {
  return String(typeof error === 'string' ? error : error?.message || '');
}

${bundle}

return {
  calls,
  normalizeEmailGenerator,
  getEmailGeneratorLabel,
  normalizePersistentSettingValue,
  finalizeIcloudAliasAfterSuccessfulFlow,
};
`)(overrides);
}

test('normalizeEmailGenerator and label support icloud', () => {
  const api = createApi();
  assert.equal(api.normalizeEmailGenerator('icloud'), 'icloud');
  assert.equal(api.getEmailGeneratorLabel('icloud'), 'iCloud 隐私邮箱');
});

test('normalizePersistentSettingValue handles icloud settings', () => {
  const api = createApi();
  assert.equal(api.normalizePersistentSettingValue('icloudHostPreference', 'icloud.com'), 'icloud.com');
  assert.equal(api.normalizePersistentSettingValue('icloudHostPreference', 'bad-host'), 'auto');
  assert.equal(api.normalizePersistentSettingValue('icloudTargetMailboxType', 'forward-mailbox'), 'forward-mailbox');
  assert.equal(api.normalizePersistentSettingValue('icloudTargetMailboxType', 'wrong'), 'icloud-inbox');
  assert.equal(api.normalizePersistentSettingValue('icloudForwardMailProvider', 'GMAIL'), 'gmail');
  assert.equal(api.normalizePersistentSettingValue('icloudForwardMailProvider', 'unknown'), 'qq');
  assert.equal(api.normalizePersistentSettingValue('autoDeleteUsedIcloudAlias', 1), true);
  assert.equal(api.normalizePersistentSettingValue('verificationResendCount', '6'), 6);
  assert.equal(api.normalizePersistentSettingValue('verificationResendCount', 99), 20);
  assert.equal(api.normalizePersistentSettingValue('cloudflareTempEmailReceiveMailbox', ' Forward@Example.com '), 'forward@example.com');
});

test('finalizeIcloudAliasAfterSuccessfulFlow marks icloud aliases as used without deleting when auto-delete is off', async () => {
  const api = createApi();
  const result = await api.finalizeIcloudAliasAfterSuccessfulFlow({
    email: 'alias@icloud.com',
    emailGenerator: 'icloud',
    autoDeleteUsedIcloudAlias: false,
    manualAliasUsage: {},
    preservedAliases: {},
  });

  assert.deepEqual(result, { handled: true, deleted: false });
  assert.equal(api.calls.setUsed.length, 1);
  assert.equal(api.calls.listCalls, 0);
  assert.equal(api.calls.deletes.length, 0);
});

test('finalizeIcloudAliasAfterSuccessfulFlow skips deleting preserved aliases', async () => {
  const api = createApi();
  const result = await api.finalizeIcloudAliasAfterSuccessfulFlow({
    email: 'alias@icloud.com',
    emailGenerator: 'icloud',
    autoDeleteUsedIcloudAlias: true,
    manualAliasUsage: {},
    preservedAliases: { 'alias@icloud.com': true },
  });

  assert.deepEqual(result, { handled: true, deleted: false });
  assert.equal(api.calls.setUsed.length, 1);
  assert.equal(api.calls.listCalls, 0);
  assert.equal(api.calls.deletes.length, 0);
});

test('finalizeIcloudAliasAfterSuccessfulFlow skips deleting aliases that are preserved in the latest alias list', async () => {
  const api = createApi({
    listIcloudAliases() {
      return [
        { email: 'alias@icloud.com', anonymousId: 'anon-1', preserved: true },
      ];
    },
  });

  const result = await api.finalizeIcloudAliasAfterSuccessfulFlow({
    email: 'alias@icloud.com',
    emailGenerator: 'icloud',
    autoDeleteUsedIcloudAlias: true,
    manualAliasUsage: {},
    preservedAliases: {},
  });

  assert.deepEqual(result, { handled: true, deleted: false });
  assert.equal(api.calls.setUsed.length, 1);
  assert.equal(api.calls.listCalls, 1);
  assert.equal(api.calls.deletes.length, 0);
});

test('finalizeIcloudAliasAfterSuccessfulFlow deletes alias when auto-delete is enabled and alias exists', async () => {
  const api = createApi({
    listIcloudAliases() {
      return [
        { email: 'alias@icloud.com', anonymousId: 'anon-1', preserved: false },
      ];
    },
  });

  const result = await api.finalizeIcloudAliasAfterSuccessfulFlow({
    email: 'alias@icloud.com',
    emailGenerator: 'icloud',
    autoDeleteUsedIcloudAlias: true,
    manualAliasUsage: {},
    preservedAliases: {},
  });

  assert.deepEqual(result, { handled: true, deleted: true });
  assert.equal(api.calls.setUsed.length, 1);
  assert.equal(api.calls.listCalls, 1);
  assert.deepEqual(api.calls.deletes, [
    { email: 'alias@icloud.com', anonymousId: 'anon-1', preserved: false },
  ]);
});

test('finalizeIcloudAliasAfterSuccessfulFlow ignores non-icloud flows', async () => {
  const api = createApi();
  const result = await api.finalizeIcloudAliasAfterSuccessfulFlow({
    email: 'plain@example.com',
    emailGenerator: 'duck',
    autoDeleteUsedIcloudAlias: true,
    manualAliasUsage: {},
    preservedAliases: {},
  });

  assert.deepEqual(result, { handled: false, deleted: false });
  assert.equal(api.calls.setUsed.length, 0);
});
