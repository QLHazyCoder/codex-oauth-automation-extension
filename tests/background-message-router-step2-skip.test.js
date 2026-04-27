const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/message-router.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

function createRouter(overrides = {}) {
  const events = {
    logs: [],
    stepStatuses: [],
    emailStates: [],
    finalizePayloads: [],
    notifyCompletions: [],
    notifyErrors: [],
    securityBlocks: [],
    invalidations: [],
    executedSteps: [],
  };

  const router = api.createMessageRouter({
    addLog: async (message, level) => {
      events.logs.push({ message, level });
    },
    appendAccountRunRecord: async () => null,
    batchUpdateLuckmailPurchases: async () => {},
    buildLocalhostCleanupPrefix: () => '',
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: () => ({}),
    broadcastDataUpdate: () => {},
    cancelScheduledAutoRun: async () => {},
    checkIcloudSession: async () => {},
    clearAutoRunTimerAlarm: async () => {},
    clearLuckmailRuntimeState: async () => {},
    clearStopRequest: () => {},
    closeLocalhostCallbackTabs: async () => {},
    closeTabsByUrlPrefix: async () => {},
    deleteHotmailAccount: async () => {},
    deleteHotmailAccounts: async () => {},
    deleteIcloudAlias: async () => {},
    deleteUsedIcloudAliases: async () => {},
    disableUsedLuckmailPurchases: async () => {},
    doesStepUseCompletionSignal: () => false,
    ensureManualInteractionAllowed: async () => ({}),
    executeStep: async (step) => {
      events.executedSteps.push(step);
    },
    executeStepViaCompletionSignal: async () => {},
    exportSettingsBundle: async () => ({}),
    fetchGeneratedEmail: async () => '',
    finalizeStep3Completion: overrides.finalizeStep3Completion || (async (payload) => {
      events.finalizePayloads.push(payload);
    }),
    finalizeIcloudAliasAfterSuccessfulFlow: async () => {},
    findHotmailAccount: async () => null,
    flushCommand: async () => {},
    getCurrentLuckmailPurchase: () => null,
    getPendingAutoRunTimerPlan: () => null,
    getSourceLabel: () => '',
    getState: async () => overrides.state || { stepStatuses: { 3: 'pending' } },
    getStepDefinitionForState: overrides.getStepDefinitionForState,
    getStepIdsForState: overrides.getStepIdsForState,
    getLastStepIdForState: overrides.getLastStepIdForState,
    getTabId: overrides.getTabId || (async () => null),
    getStopRequested: () => false,
    handleAutoRunLoopUnhandledError: async () => {},
    handleCloudflareSecurityBlocked: overrides.handleCloudflareSecurityBlocked || (async (error) => {
      const message = typeof error === 'string' ? error : error?.message || '';
      events.securityBlocks.push(message);
      return message.replace(/^CF_SECURITY_BLOCKED::/, '') || message;
    }),
    importSettingsBundle: async () => {},
    invalidateDownstreamAfterStepRestart: async (step, options) => {
      events.invalidations.push({ step, options });
    },
    isCloudflareSecurityBlockedError: overrides.isCloudflareSecurityBlockedError || ((error) => /^CF_SECURITY_BLOCKED::/.test(typeof error === 'string' ? error : error?.message || '')),
    isAutoRunLockedState: () => false,
    isHotmailProvider: () => false,
    isLocalhostOAuthCallbackUrl: () => true,
    isLuckmailProvider: () => false,
    isStopError: () => false,
    isTabAlive: overrides.isTabAlive || (async () => false),
    launchAutoRunTimerPlan: async () => {},
    listIcloudAliases: async () => [],
    listLuckmailPurchasesForManagement: async () => [],
    normalizeHotmailAccounts: (items) => items,
    normalizeRunCount: (value) => value,
    AUTO_RUN_TIMER_KIND_SCHEDULED_START: 'scheduled',
    notifyStepComplete: (step, payload) => {
      events.notifyCompletions.push({ step, payload });
    },
    notifyStepError: (step, error) => {
      events.notifyErrors.push({ step, error });
    },
    patchHotmailAccount: async () => {},
    registerTab: async () => {},
    requestStop: async () => {},
    resetState: async () => {},
    resumeAutoRun: async () => {},
    scheduleAutoRun: async () => {},
    selectLuckmailPurchase: async () => {},
    setCurrentHotmailAccount: async () => {},
    setEmailState: async (email) => {
      events.emailStates.push(email);
    },
    setEmailStateSilently: async () => {},
    setIcloudAliasPreservedState: async () => {},
    setIcloudAliasUsedState: async () => {},
    setLuckmailPurchaseDisabledState: async () => {},
    setLuckmailPurchasePreservedState: async () => {},
    setLuckmailPurchaseUsedState: async () => {},
    setPersistentSettings: async () => {},
    setState: async () => {},
    setStepStatus: async (step, status) => {
      events.stepStatuses.push({ step, status });
    },
    skipAutoRunCountdown: async () => false,
    skipStep: async () => {},
    startAutoRunLoop: async () => {},
    syncHotmailAccounts: async () => {},
    testHotmailAccountMailAccess: async () => {},
    upsertHotmailAccount: async () => {},
    verifyHotmailAccount: async () => {},
  });

  return { router, events };
}

test('message router skips step 3 when step 2 lands on verification page', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 3: 'pending' } },
  });

  await router.handleStepData(2, {
    email: 'user@example.com',
    skippedPasswordStep: true,
  });

  assert.deepStrictEqual(events.emailStates, ['user@example.com']);
  assert.deepStrictEqual(events.stepStatuses, [{ step: 3, status: 'skipped' }]);
  assert.equal(events.logs[0]?.message, '步骤 2：提交邮箱后页面直接进入邮箱验证码页，已自动跳过步骤 3。');
});

test('message router does not overwrite a completed step 3 when step 2 is replayed', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 3: 'completed' } },
  });

  await router.handleStepData(2, {
    skippedPasswordStep: true,
  });

  assert.deepStrictEqual(events.stepStatuses, []);
});

test('message router skips steps 3/4/5 when step 2 detects already logged-in session', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 3: 'pending', 4: 'completed', 5: 'pending' } },
  });

  await router.handleStepData(2, {
    email: 'user@example.com',
    skipRegistrationFlow: true,
    skippedPasswordStep: true,
  });

  assert.deepStrictEqual(events.emailStates, ['user@example.com']);
  assert.deepStrictEqual(events.stepStatuses, [
    { step: 3, status: 'skipped' },
    { step: 5, status: 'skipped' },
  ]);
  assert.equal(events.logs[0]?.message, '步骤 2：检测到当前已登录会话，已自动跳过步骤 3/4/5，流程将直接进入步骤 6。');
});

test('message router skips step 5 when step 4 reports already logged-in transition', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 5: 'pending' } },
  });

  await router.handleStepData(4, {
    emailTimestamp: 123,
    skipProfileStep: true,
  });

  assert.deepStrictEqual(events.stepStatuses, [{ step: 5, status: 'skipped' }]);
  assert.equal(events.logs[0]?.message, '步骤 4：检测到账号已直接进入已登录态，已自动跳过步骤 5。');
});

test('message router skips login-code step when oauth login lands on consent page', async () => {
  const stepKeys = {
    7: 'oauth-login',
    8: 'fetch-login-code',
    9: 'confirm-oauth',
  };
  const { router, events } = createRouter({
    state: { stepStatuses: { 7: 'completed', 8: 'pending', 9: 'pending' } },
    getStepDefinitionForState: (step) => ({ id: step, key: stepKeys[step] || '' }),
    getStepIdsForState: () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  });

  await router.handleStepData(7, {
    skipLoginVerificationStep: true,
    directOAuthConsentPage: true,
  });

  assert.deepStrictEqual(events.stepStatuses, [{ step: 8, status: 'skipped' }]);
  assert.equal(events.logs.some(({ message }) => /OAuth 授权页.*步骤 8/.test(message)), true);
});

test('message router skips Plus login-code step when oauth login lands on consent page', async () => {
  const stepKeys = {
    10: 'oauth-login',
    11: 'fetch-login-code',
    12: 'confirm-oauth',
    13: 'platform-verify',
  };
  const { router, events } = createRouter({
    state: { plusModeEnabled: true, stepStatuses: { 10: 'completed', 11: 'pending', 12: 'pending', 13: 'pending' } },
    getStepDefinitionForState: (step) => ({ id: step, key: stepKeys[step] || '' }),
    getStepIdsForState: () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  });

  await router.handleStepData(10, {
    skipLoginVerificationStep: true,
    directOAuthConsentPage: true,
  });

  assert.deepStrictEqual(events.stepStatuses, [{ step: 11, status: 'skipped' }]);
  assert.equal(events.logs.some(({ message }) => /OAuth 授权页.*步骤 11/.test(message)), true);
});

test('message router finalizes step 3 before marking it completed', async () => {
  const { router, events } = createRouter();

  const response = await router.handleMessage({
    type: 'STEP_COMPLETE',
    step: 3,
    source: 'signup-page',
    payload: {
      email: 'user@example.com',
      signupVerificationRequestedAt: 123,
    },
  }, {});

  assert.deepStrictEqual(events.finalizePayloads, [
    {
      email: 'user@example.com',
      signupVerificationRequestedAt: 123,
    },
  ]);
  assert.deepStrictEqual(events.stepStatuses, [{ step: 3, status: 'completed' }]);
  assert.deepStrictEqual(events.emailStates, ['user@example.com']);
  assert.deepStrictEqual(events.notifyCompletions, [
    {
      step: 3,
      payload: {
        email: 'user@example.com',
        signupVerificationRequestedAt: 123,
      },
    },
  ]);
  assert.deepStrictEqual(response, { ok: true });
});

test('message router marks step 3 failed when post-submit finalize fails', async () => {
  const { router, events } = createRouter({
    finalizeStep3Completion: async () => {
      throw new Error('步骤 3 提交后仍停留在密码页。');
    },
  });

  const response = await router.handleMessage({
    type: 'STEP_COMPLETE',
    step: 3,
    source: 'signup-page',
    payload: {
      email: 'user@example.com',
    },
  }, {});

  assert.deepStrictEqual(events.stepStatuses, [{ step: 3, status: 'failed' }]);
  assert.deepStrictEqual(events.notifyErrors, [
    {
      step: 3,
      error: '步骤 3 提交后仍停留在密码页。',
    },
  ]);
  assert.equal(events.logs.some(({ message }) => /步骤 3 失败：步骤 3 提交后仍停留在密码页。/.test(message)), true);
  assert.deepStrictEqual(response, { ok: true, error: '步骤 3 提交后仍停留在密码页。' });
});

test('message router stops the flow and surfaces cloudflare security block errors', async () => {
  const { router, events } = createRouter();

  const response = await router.handleMessage({
    type: 'STEP_ERROR',
    step: 7,
    source: 'signup-page',
    payload: {},
    error: 'CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统',
  }, {});

  assert.deepStrictEqual(events.securityBlocks, ['CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统']);
  assert.deepStrictEqual(events.notifyErrors, [
    {
      step: 7,
      error: '流程已被用户停止。',
    },
  ]);
  assert.deepStrictEqual(response, {
    ok: true,
    error: '您已触发Cloudflare 安全防护系统',
  });
});

test('message router blocks manual step 4 execution when signup page tab is missing', async () => {
  const { router, events } = createRouter({
    getTabId: async () => null,
    isTabAlive: async () => false,
  });

  await assert.rejects(
    () => router.handleMessage({
      type: 'EXECUTE_STEP',
      source: 'sidepanel',
      payload: { step: 4 },
    }, {}),
    /手动执行步骤 4 前，请先执行步骤 1 或步骤 2/
  );

  assert.deepStrictEqual(events.invalidations, []);
  assert.deepStrictEqual(events.executedSteps, []);
});
