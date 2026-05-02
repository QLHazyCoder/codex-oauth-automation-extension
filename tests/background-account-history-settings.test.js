const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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

test('background account history settings are normalized independently from hotmail service mode', () => {
  const bundle = [
    extractFunction('normalizeCodex2ApiUrl'),
    extractFunction('normalizeHotmailLocalBaseUrl'),
    extractFunction('normalizeAccountRunHistoryHelperBaseUrl'),
    extractFunction('normalizeVerificationResendCount'),
    extractFunction('normalizePhoneSmsProvider'),
    extractFunction('normalizePhoneSmsProviderOrder'),
    extractFunction('normalizeFiveSimCountryCode'),
    extractFunction('normalizeFiveSimCountryOrder'),
    extractFunction('normalizeNexSmsCountryId'),
    extractFunction('normalizeNexSmsCountryOrder'),
    extractFunction('normalizePhoneVerificationReplacementLimit'),
    extractFunction('normalizePhoneCodeWaitSeconds'),
    extractFunction('normalizePhoneCodeTimeoutWindows'),
    extractFunction('normalizePhoneCodePollIntervalSeconds'),
    extractFunction('normalizePhoneCodePollMaxRounds'),
    extractFunction('normalizeHeroSmsMaxPrice'),
    extractFunction('normalizeHeroSmsCountryFallback'),
    extractFunction('normalizePersistentSettingValue'),
  ].join('\n');

  const api = new Function(`
const DEFAULT_HOTMAIL_LOCAL_BASE_URL = 'http://127.0.0.1:17373';
const DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL = DEFAULT_HOTMAIL_LOCAL_BASE_URL;
const DEFAULT_HOTMAIL_REMOTE_BASE_URL = '';
const DEFAULT_CODEX2API_URL = 'http://localhost:8080/admin/accounts';
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const PHONE_CODE_POLL_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_ROUNDS_MAX = 120;
const DEFAULT_PHONE_CODE_POLL_ROUNDS = 4;
const DEFAULT_SUB2API_PROXY_NAME = '';
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const VERIFICATION_RESEND_COUNT_MIN = 0;
const VERIFICATION_RESEND_COUNT_MAX = 20;
const HERO_SMS_COUNTRY_ID = 52;
const HERO_SMS_COUNTRY_LABEL = 'Thailand';
const PERSISTED_SETTING_DEFAULTS = {
  autoStepDelaySeconds: null,
  mailProvider: '163',
};
function normalizePanelMode(value) { return value === 'sub2api' ? 'sub2api' : (value === 'codex2api' ? 'codex2api' : 'cpa'); }
function normalizeLocalCpaStep9Mode(value) { return value === 'bypass' ? 'bypass' : 'submit'; }
function normalizeAutoRunFallbackThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoRunDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value == null || value === '' ? null : Number(value); }
function normalizeMailProvider(value) { return String(value || '').trim().toLowerCase() || '163'; }
function normalizeMail2925Mode(value) { return String(value || '').trim().toLowerCase() === 'receive' ? 'receive' : 'provide'; }
function normalizeEmailGenerator(value) { return String(value || '').trim().toLowerCase() || 'duck'; }
function normalizeIcloudHost(value) { const normalized = String(value || '').trim().toLowerCase(); return normalized === 'icloud.com' || normalized === 'icloud.com.cn' ? normalized : ''; }
function normalizeHotmailServiceMode(value) { return String(value || '').trim().toLowerCase() === 'remote' ? 'remote' : 'local'; }
function normalizeHotmailRemoteBaseUrl(value) { return String(value || '').trim(); }
function normalizeCloudflareDomain(value) { return String(value || '').trim(); }
function normalizeCloudflareDomains(value) { return Array.isArray(value) ? value : []; }
function normalizeCloudflareTempEmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailbox(value) { return String(value || '').trim().toLowerCase(); }
function normalizeCloudflareTempEmailDomain(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailDomains(value) { return Array.isArray(value) ? value : []; }
function normalizeHotmailAccounts(value) { return Array.isArray(value) ? value : []; }
${bundle}
return {
  normalizeAccountRunHistoryHelperBaseUrl,
  normalizePersistentSettingValue,
};
  `)();

  assert.equal(api.normalizePersistentSettingValue('accountRunHistoryTextEnabled', 1), true);
  assert.equal(api.normalizePersistentSettingValue('phoneVerificationEnabled', 1), true);
  assert.equal(api.normalizePersistentSettingValue('plusPaymentMethod', 'gopay'), 'gopay');
  assert.equal(api.normalizePersistentSettingValue('plusPaymentMethod', 'paypal'), 'paypal');
  assert.equal(api.normalizePersistentSettingValue('plusPaymentMethod', 'unknown'), 'paypal');
  assert.equal(api.normalizePersistentSettingValue('verificationResendCount', '7'), 7);
  assert.equal(api.normalizePersistentSettingValue('verificationResendCount', '-1'), 0);
  assert.equal(api.normalizePersistentSettingValue('phoneVerificationReplacementLimit', '9'), 9);
  assert.equal(api.normalizePersistentSettingValue('phoneVerificationReplacementLimit', '-1'), 1);
  assert.equal(api.normalizePersistentSettingValue('phoneCodeWaitSeconds', '75'), 75);
  assert.equal(api.normalizePersistentSettingValue('phoneCodeTimeoutWindows', '3'), 3);
  assert.equal(api.normalizePersistentSettingValue('phoneCodePollIntervalSeconds', '6'), 6);
  assert.equal(api.normalizePersistentSettingValue('phoneCodePollMaxRounds', '18'), 18);
  assert.equal(api.normalizePersistentSettingValue('heroSmsMaxPrice', '0.123456'), '0.1235');
  assert.equal(api.normalizePersistentSettingValue('heroSmsMaxPrice', '0'), '');
  assert.equal(api.normalizePersistentSettingValue('heroSmsCountryId', 0), 0);
  assert.deepStrictEqual(
    api.normalizePersistentSettingValue('heroSmsCountryFallback', [{ id: 16, label: 'United Kingdom' }, { id: 52 }]),
    [{ id: 16, label: 'United Kingdom' }, { id: 52, label: 'Country #52' }]
  );
  assert.equal(
    api.normalizePersistentSettingValue('accountRunHistoryHelperBaseUrl', 'http://127.0.0.1:17373/append-account-log'),
    'http://127.0.0.1:17373'
  );
  assert.equal(
    api.normalizePersistentSettingValue('accountRunHistoryHelperBaseUrl', 'http://127.0.0.1:17373/sync-account-run-records'),
    'http://127.0.0.1:17373'
  );
  assert.equal(
    api.normalizeAccountRunHistoryHelperBaseUrl(''),
    'http://127.0.0.1:17373'
  );
  assert.equal(
    api.normalizePersistentSettingValue('sub2apiDefaultProxyName', ''),
    ''
  );
  assert.equal(
    api.normalizePersistentSettingValue('sub2apiDefaultProxyName', ' proxy-a '),
    'proxy-a'
  );
  assert.equal(
    api.normalizePersistentSettingValue('codex2apiUrl', 'localhost:8080/admin'),
    'http://localhost:8080/admin/accounts'
  );
  assert.equal(
    api.normalizePersistentSettingValue('codex2apiUrl', 'https://codex-admin.example.com/'),
    'https://codex-admin.example.com/admin/accounts'
  );
  assert.equal(
    api.normalizePersistentSettingValue('codex2apiAdminKey', ' secret-key '),
    'secret-key'
  );
  assert.deepStrictEqual(
    api.normalizePersistentSettingValue('phoneSmsProviderOrder', []),
    []
  );
  assert.deepStrictEqual(
    api.normalizePersistentSettingValue('fiveSimCountryOrder', []),
    []
  );
  assert.deepStrictEqual(
    api.normalizePersistentSettingValue('nexSmsCountryOrder', []),
    []
  );
});
