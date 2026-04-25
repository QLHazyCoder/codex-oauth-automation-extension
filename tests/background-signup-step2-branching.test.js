const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const step2Source = fs.readFileSync('background/steps/submit-signup-email.js', 'utf8');
const step2GlobalScope = {};
const step2Api = new Function('self', `${step2Source}; return self.MultiPageBackgroundStep2;`)(step2GlobalScope);

const signupFlowSource = fs.readFileSync('background/signup-flow-helpers.js', 'utf8');
const signupFlowGlobalScope = {};
const signupFlowApi = new Function('self', `${signupFlowSource}; return self.MultiPageSignupFlowHelpers;`)(signupFlowGlobalScope);

test('step 2 completes with password step skipped when landing on email verification page', async () => {
  const completedPayloads = [];

  const executor = step2Api.createStep2Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeStepFromBackground: async (step, payload) => {
      completedPayloads.push({ step, payload });
    },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupEntryPageReady: async () => ({ tabId: 11 }),
    ensureSignupPostEmailPageReadyInTab: async () => ({
      state: 'verification_page',
      url: 'https://auth.openai.com/email-verification',
    }),
    getTabId: async () => 11,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'user@example.com',
    sendToContentScriptResilient: async () => ({ submitted: true }),
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep2({ email: 'user@example.com' });

  assert.deepStrictEqual(completedPayloads, [
    {
      step: 2,
      payload: {
        email: 'user@example.com',
        nextSignupState: 'verification_page',
        nextSignupUrl: 'https://auth.openai.com/email-verification',
        skippedPasswordStep: true,
      },
    },
  ]);
});

test('step 2 keeps password flow when landing on password page', async () => {
  const completedPayloads = [];

  const executor = step2Api.createStep2Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeStepFromBackground: async (step, payload) => {
      completedPayloads.push({ step, payload });
    },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupEntryPageReady: async () => ({ tabId: 12 }),
    ensureSignupPostEmailPageReadyInTab: async () => ({
      state: 'password_page',
      url: 'https://auth.openai.com/create-account/password',
    }),
    getTabId: async () => 12,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'user@example.com',
    sendToContentScriptResilient: async () => ({ submitted: true }),
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep2({ email: 'user@example.com' });

  assert.deepStrictEqual(completedPayloads, [
    {
      step: 2,
      payload: {
        email: 'user@example.com',
        nextSignupState: 'password_page',
        nextSignupUrl: 'https://auth.openai.com/create-account/password',
        skippedPasswordStep: false,
      },
    },
  ]);
});

test('step 2 falls back to already-logged-in branch when auth entry recovery fails on chatgpt home', async () => {
  const completedPayloads = [];
  const logs = [];

  const executor = step2Api.createStep2Executor({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async () => {},
        get: async () => ({ url: 'https://chatgpt.com/' }),
      },
    },
    completeStepFromBackground: async (step, payload) => {
      completedPayloads.push({ step, payload });
    },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupAuthEntryPageReady: async () => {
      throw new Error('当前页面没有可用的注册入口，也不在邮箱/密码页。URL: https://chatgpt.com/');
    },
    ensureSignupEntryPageReady: async () => ({ tabId: 13 }),
    ensureSignupPostEmailPageReadyInTab: async () => ({
      state: 'password_page',
      url: 'https://auth.openai.com/create-account/password',
    }),
    getTabId: async () => 13,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'user@example.com',
    sendToContentScriptResilient: async () => ({ submitted: true }),
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep2({ email: 'user@example.com' });

  assert.equal(completedPayloads.length, 1);
  assert.deepStrictEqual(completedPayloads[0], {
    step: 2,
    payload: {
      email: 'user@example.com',
      nextSignupState: 'already_logged_in_home',
      nextSignupUrl: 'https://chatgpt.com/',
      skippedPasswordStep: true,
      skipRegistrationFlow: true,
    },
  });
  assert.ok(logs.some((item) => /已跳过注册链路/.test(item.message)));
});

test('signup flow helper recognizes email verification page as post-email landing page', async () => {
  let ensureCalls = 0;
  let passwordReadyChecks = 0;

  const helpers = signupFlowApi.createSignupFlowHelpers({
    buildGeneratedAliasEmail: () => '',
    chrome: {
      tabs: {
        get: async () => ({
          id: 21,
          url: 'https://auth.openai.com/email-verification',
        }),
      },
    },
    ensureContentScriptReadyOnTab: async () => {
      ensureCalls += 1;
    },
    ensureHotmailAccountForFlow: async () => ({}),
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => false,
    isHotmailProvider: () => false,
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: (url) => /\/email-verification(?:[/?#]|$)/i.test(url || ''),
    isSignupPasswordPageUrl: (url) => /\/create-account\/password(?:[/?#]|$)/i.test(url || ''),
    reuseOrCreateTab: async () => 21,
    sendToContentScriptResilient: async () => {
      passwordReadyChecks += 1;
      return {};
    },
    setEmailState: async () => {},
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabUrlMatch: async () => ({
      id: 21,
      url: 'https://auth.openai.com/email-verification',
    }),
  });

  const result = await helpers.ensureSignupPostEmailPageReadyInTab(21, 2);

  assert.deepStrictEqual(result, {
    ready: true,
    state: 'verification_page',
    url: 'https://auth.openai.com/email-verification',
  });
  assert.equal(ensureCalls, 1);
  assert.equal(passwordReadyChecks, 0);
});

test('signup flow helper reuses existing managed alias email when it is still compatible', async () => {
  let buildCalls = 0;
  let setEmailCalls = 0;

  const helpers = signupFlowApi.createSignupFlowHelpers({
    buildGeneratedAliasEmail: () => {
      buildCalls += 1;
      return 'demo+fresh@gmail.com';
    },
    chrome: { tabs: { get: async () => ({ id: 21, url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async () => {},
    ensureHotmailAccountForFlow: async () => ({}),
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => true,
    isReusableGeneratedAliasEmail: (_state, email) => email === 'demo+saved@gmail.com',
    isHotmailProvider: () => false,
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: () => false,
    isSignupPasswordPageUrl: () => true,
    reuseOrCreateTab: async () => 21,
    sendToContentScriptResilient: async () => ({}),
    setEmailState: async () => {
      setEmailCalls += 1;
    },
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabUrlMatch: async () => null,
  });

  const email = await helpers.resolveSignupEmailForFlow({
    mailProvider: 'gmail',
    email: 'demo+saved@gmail.com',
  });

  assert.equal(email, 'demo+saved@gmail.com');
  assert.equal(buildCalls, 0);
  assert.equal(setEmailCalls, 0);
});

test('signup flow helper finalizes step 3 submit by reusing signup verification preparation', async () => {
  let ensureCalls = 0;
  const messages = [];
  const logs = [];

  const helpers = signupFlowApi.createSignupFlowHelpers({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    buildGeneratedAliasEmail: () => '',
    chrome: { tabs: { get: async () => ({ id: 31, url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async (...args) => {
      ensureCalls += 1;
      messages.push({ type: 'ensure', args });
    },
    ensureHotmailAccountForFlow: async () => ({}),
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => false,
    isReusableGeneratedAliasEmail: () => false,
    isHotmailProvider: () => false,
    isRetryableContentScriptTransportError: () => false,
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: () => false,
    isSignupPasswordPageUrl: () => true,
    reuseOrCreateTab: async () => 31,
    sendToContentScriptResilient: async (_source, message) => {
      messages.push({ type: 'send', message });
      return { ready: true, retried: 1 };
    },
    setEmailState: async () => {},
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: ['content/utils.js', 'content/signup-page.js'],
    waitForTabUrlMatch: async () => null,
  });

  const result = await helpers.finalizeSignupPasswordSubmitInTab(31, 'Secret123!', 3);

  assert.deepStrictEqual(result, { ready: true, retried: 1 });
  assert.equal(ensureCalls, 1);
  assert.deepStrictEqual(logs, []);
  assert.deepStrictEqual(messages.find((item) => item.type === 'send')?.message, {
    type: 'PREPARE_SIGNUP_VERIFICATION',
    step: 3,
    source: 'background',
    payload: {
      password: 'Secret123!',
      prepareSource: 'step3_finalize',
      prepareLogLabel: '步骤 3 收尾',
    },
  });
});

test('signup flow helper rewrites retryable step 3 finalize transport timeout into a Chinese error', async () => {
  const logs = [];

  const helpers = signupFlowApi.createSignupFlowHelpers({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    buildGeneratedAliasEmail: () => '',
    chrome: { tabs: { get: async () => ({ id: 31, url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async () => {},
    ensureHotmailAccountForFlow: async () => ({}),
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => false,
    isReusableGeneratedAliasEmail: () => false,
    isHotmailProvider: () => false,
    isRetryableContentScriptTransportError: (error) => /did not respond in 45s/i.test(error?.message || String(error || '')),
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: () => false,
    isSignupPasswordPageUrl: () => true,
    reuseOrCreateTab: async () => 31,
    sendToContentScriptResilient: async () => {
      throw new Error('Content script on signup-page did not respond in 45s. Try refreshing the tab and retry.');
    },
    setEmailState: async () => {},
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: ['content/utils.js', 'content/signup-page.js'],
    waitForTabUrlMatch: async () => null,
  });

  await assert.rejects(
    () => helpers.finalizeSignupPasswordSubmitInTab(31, 'Secret123!', 3),
    /步骤 3：认证页在提交后切换过程中页面通信超时，未能重新就绪，暂时无法确认是否进入下一页面。请重试当前轮。/
  );

  assert.deepStrictEqual(logs, [
    {
      message: '步骤 3：认证页在提交后切换过程中页面通信超时，未能重新就绪，暂时无法确认是否进入下一页面。请重试当前轮。',
      level: 'warn',
    },
  ]);
});
