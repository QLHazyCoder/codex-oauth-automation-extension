const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-login-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep8;`)(globalScope);

test('step 8 submits login verification directly without replaying step 7', async () => {
  const calls = {
    ensureReady: 0,
    ensureReadyOptions: [],
    rerunStep7: 0,
    resolveOptions: null,
    setStates: [],
  };
  const realDateNow = Date.now;
  Date.now = () => 123456;

  const executor = api.createStep8Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureStep8VerificationPageReady: async (options) => {
      calls.ensureReady += 1;
      calls.ensureReadyOptions.push(options || null);
      return { state: 'verification_page', displayedEmail: 'display.user@example.com' };
    },
    rerunStep7ForStep8Recovery: async () => {
      calls.rerunStep7 += 1;
    },
    getOAuthFlowRemainingMs: async () => 5000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 5000),
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ 邮箱',
      source: 'mail-qq',
      url: 'https://mail.qq.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      calls.resolveOptions = options;
    },
    reuseOrCreateTab: async () => {},
    setState: async (payload) => {
      calls.setStates.push(payload);
    },
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  try {
    await executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
    });
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(calls.resolveOptions.beforeSubmit, undefined);
  assert.equal(calls.ensureReady, 1);
  assert.equal(calls.rerunStep7, 0);
  assert.equal(calls.resolveOptions.filterAfterTimestamp, 123456);
  assert.equal(typeof calls.resolveOptions.getRemainingTimeMs, 'function');
  assert.equal(await calls.resolveOptions.getRemainingTimeMs({ actionLabel: '登录验证码流程' }), 5000);
  assert.equal(calls.resolveOptions.resendIntervalMs, 25000);
  assert.equal(calls.resolveOptions.targetEmail, 'display.user@example.com');
  assert.deepStrictEqual(calls.setStates, [
    { step8VerificationTargetEmail: 'display.user@example.com' },
  ]);
  assert.deepStrictEqual(calls.ensureReadyOptions, [
    { timeoutMs: 5000 },
  ]);
});

test('step 8 uses a fixed 10-minute lookback window and disables resend interval for 2925 mailbox polling', async () => {
  let capturedOptions = null;
  let ensureCalls = 0;
  let ensureOptions = null;
  const tabUpdates = [];
  const tabReuses = [];
  const realDateNow = Date.now;
  Date.now = () => 900000;

  const executor = api.createStep8Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async (tabId, payload) => {
          tabUpdates.push({ tabId, payload });
        },
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureMail2925MailboxSession: async (options) => {
      ensureCalls += 1;
      ensureOptions = options;
    },
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page' }),
    rerunStep7ForStep8Recovery: async () => {},
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      provider: '2925',
      label: '2925 邮箱',
      source: 'mail-2925',
      url: 'https://2925.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({
      email: 'user@example.com',
      password: 'secret',
      mail2925UseAccountPool: true,
      currentMail2925AccountId: 'acc-1',
      mail2925Accounts: [
        { id: 'acc-1', email: 'pool-user@2925.com' },
      ],
    }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
    reuseOrCreateTab: async (source, url) => {
      tabReuses.push({ source, url });
    },
    setState: async () => {},
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  try {
    await executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
      mail2925UseAccountPool: true,
      currentMail2925AccountId: 'acc-1',
      mail2925Accounts: [
        { id: 'acc-1', email: 'pool-user@2925.com' },
      ],
    });
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(ensureCalls, 1);
  assert.deepStrictEqual(ensureOptions, {
    accountId: 'acc-1',
    forceRelogin: false,
    allowLoginWhenOnLoginPage: true,
    expectedMailboxEmail: 'pool-user@2925.com',
    actionLabel: 'Step 8: ensure 2925 mailbox session',
  });
  assert.deepStrictEqual(tabReuses, []);
  assert.deepStrictEqual(tabUpdates, [
    { tabId: 1, payload: { active: true } },
  ]);
  assert.equal(capturedOptions.filterAfterTimestamp, 300000);
  assert.equal(capturedOptions.resendIntervalMs, 0);
  assert.equal(capturedOptions.targetEmail, '');
  assert.equal(capturedOptions.beforeSubmit, undefined);
  assert.equal(typeof capturedOptions.getRemainingTimeMs, 'function');
});

test('step 8 falls back to the run email when the verification page does not expose a displayed email', async () => {
  let capturedOptions = null;

  const executor = api.createStep8Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page', displayedEmail: '' }),
    rerunStep7ForStep8Recovery: async () => {},
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ 邮箱',
      source: 'mail-qq',
      url: 'https://mail.qq.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  await executor.executeStep8({
    email: 'user@example.com',
    password: 'secret',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.equal(capturedOptions.targetEmail, 'user@example.com');
});

test('step 8 does not rerun step 7 when verification submit lands on add-phone', async () => {
  const calls = {
    rerunStep7: 0,
    logs: [],
  };

  const executor = api.createStep8Executor({
    addLog: async (message, level = 'info') => {
      calls.logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page' }),
    rerunStep7ForStep8Recovery: async () => {
      calls.rerunStep7 += 1;
    },
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ 邮箱',
      source: 'mail-qq',
      url: 'https://mail.qq.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async () => {
      throw new Error('步骤 8：验证码提交后页面进入手机号页面，当前流程无法继续自动授权。 URL: https://auth.openai.com/add-phone');
    },
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
    }),
    /add-phone/
  );

  assert.equal(calls.rerunStep7, 0);
  assert.ok(!calls.logs.some(({ message }) => /准备从步骤 7 重新开始/.test(message)));
});

test('step 8 checks iCloud session before polling iCloud mailbox', async () => {
  let icloudChecks = 0;
  let resolved = false;

  const executor = api.createStep8Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureIcloudMailSession: async () => {
      icloudChecks += 1;
    },
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page', displayedEmail: '' }),
    rerunStep7ForStep8Recovery: async () => {},
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      source: 'icloud-mail',
      url: 'https://www.icloud.com/mail/',
      label: 'iCloud 邮箱',
      navigateOnReuse: true,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async () => {
      resolved = true;
    },
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  await executor.executeStep8({
    email: 'user@example.com',
    password: 'secret',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.equal(icloudChecks, 1);
  assert.equal(resolved, true);
});
