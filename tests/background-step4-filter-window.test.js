const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-signup-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep4;`)(globalScope);

test('step 4 passes a fixed 10-minute lookback window to 2925 mailbox polling', async () => {
  let capturedOptions = null;
  let ensureCalls = 0;
  const tabUpdates = [];
  const tabReuses = [];
  const realDateNow = Date.now;
  Date.now = () => 700000;

  const executor = api.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async (tabId, payload) => {
          tabUpdates.push({ tabId, payload });
        },
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    ensureMail2925MailboxSession: async () => {
      ensureCalls += 1;
    },
    getMailConfig: () => ({
      provider: '2925',
      label: '2925 邮箱',
      source: 'mail-2925',
      url: 'https://2925.com',
    }),
    getTabId: async () => 1,
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
    reuseOrCreateTab: async (source, url) => {
      tabReuses.push({ source, url });
    },
    sendToContentScriptResilient: async () => ({}),
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    throwIfStopped: () => {},
  });

  try {
    await executor.executeStep4({
      email: 'user@example.com',
      password: 'secret',
      mail2925UseAccountPool: true,
    });
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(ensureCalls, 1);
  assert.deepStrictEqual(tabReuses, []);
  assert.deepStrictEqual(tabUpdates, [
    { tabId: 1, payload: { active: true } },
  ]);
  assert.equal(capturedOptions.filterAfterTimestamp, 100000);
  assert.equal(capturedOptions.resendIntervalMs, 0);
});

test('step 4 does not request a fresh code first for Cloudflare temp mail', async () => {
  let capturedOptions = null;
  const realDateNow = Date.now;
  Date.now = () => 700000;

  const executor = api.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    ensureMail2925MailboxSession: async () => {},
    getMailConfig: () => ({
      provider: 'cloudflare-temp-email',
      label: 'Cloudflare Temp Email',
      source: 'cloudflare-temp-email',
      url: 'https://temp.peekcart.com',
    }),
    getTabId: async () => 1,
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({}),
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    throwIfStopped: () => {},
  });

  try {
    await executor.executeStep4({
      email: 'user@example.com',
      password: 'secret',
    });
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(capturedOptions.filterAfterTimestamp, 700000);
  assert.equal(capturedOptions.requestFreshCodeFirst, false);
  assert.equal(capturedOptions.resendIntervalMs, 25000);
});

test('step 4 checks iCloud session before polling iCloud mailbox', async () => {
  let icloudChecks = 0;
  let resolved = false;

  const executor = api.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    ensureIcloudMailSession: async () => {
      icloudChecks += 1;
    },
    ensureMail2925MailboxSession: async () => {},
    getMailConfig: () => ({
      source: 'icloud-mail',
      url: 'https://www.icloud.com/mail/',
      label: 'iCloud 邮箱',
    }),
    getTabId: async () => 1,
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    resolveVerificationStep: async () => {
      resolved = true;
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({}),
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    throwIfStopped: () => {},
  });

  await executor.executeStep4({
    email: 'user@example.com',
    password: 'secret',
  });

  assert.equal(icloudChecks, 1);
  assert.equal(resolved, true);
});
