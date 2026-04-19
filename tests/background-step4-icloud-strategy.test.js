const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-signup-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep4;`)(globalScope);

test('step 4 uses poll-first behavior for iCloud mailboxes', async () => {
  let capturedOptions = null;
  const realDateNow = Date.now;
  Date.now = () => 123456;

  const executor = api.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    getMailConfig: () => ({
      provider: 'icloud',
      label: 'iCloud 邮箱',
      source: 'icloud-mail',
      url: 'https://www.icloud.com/mail/',
      navigateOnReuse: true,
    }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    ICLOUD_PROVIDER: 'icloud',
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

  assert.equal(capturedOptions.requestFreshCodeFirst, false);
  assert.equal(capturedOptions.filterAfterTimestamp, 123456);
  assert.equal(capturedOptions.resendIntervalMs, 25000);
});

test('step 4 keeps resend-first behavior for generic webmail providers', async () => {
  let capturedOptions = null;

  const executor = api.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ 邮箱',
      source: 'qq-mail',
      url: 'https://wx.mail.qq.com/',
    }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    ICLOUD_PROVIDER: 'icloud',
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

  await executor.executeStep4({
    email: 'user@example.com',
    password: 'secret',
  });

  assert.equal(capturedOptions.requestFreshCodeFirst, true);
});
