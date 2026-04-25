const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/auto-run-controller.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundAutoRunController;`)(globalScope);

test('auto-run controller skips add-phone failures to the next round instead of stopping when auto retry is enabled', async () => {
  const events = {
    logs: [],
    broadcasts: [],
    accountRecords: [],
    runCalls: 0,
  };

  let currentState = {
    stepStatuses: {},
    vpsUrl: 'https://example.com/vps',
    vpsPassword: 'secret',
    customPassword: '',
    autoRunSkipFailures: true,
    autoRunFallbackThreadIntervalMinutes: 0,
    autoRunDelayEnabled: false,
    autoRunDelayMinutes: 30,
    autoStepDelaySeconds: null,
    mailProvider: '163',
    emailGenerator: 'duck',
    gmailBaseEmail: '',
    mail2925BaseEmail: '',
    emailPrefix: 'demo',
    inbucketHost: '',
    inbucketMailbox: '',
    cloudflareDomain: '',
    cloudflareDomains: [],
    tabRegistry: {},
    sourceLastUrls: {},
    autoRunRoundSummaries: [],
  };

  const runtime = {
    state: {
      autoRunActive: false,
      autoRunCurrentRun: 0,
      autoRunTotalRuns: 1,
      autoRunAttemptRun: 0,
      autoRunSessionId: 0,
    },
    get() {
      return { ...this.state };
    },
    set(updates = {}) {
      this.state = { ...this.state, ...updates };
    },
  };

  let sessionSeed = 0;

  const controller = api.createAutoRunController({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    appendAccountRunRecord: async (status, _state, reason) => {
      events.accountRecords.push({ status, reason });
      return { status, reason };
    },
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 3000,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase, payload = {}) => {
      events.broadcasts.push({ phase, ...payload });
      currentState = {
        ...currentState,
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
        autoRunPhase: phase,
        autoRunCurrentRun: payload.currentRun ?? runtime.state.autoRunCurrentRun,
        autoRunTotalRuns: payload.totalRuns ?? runtime.state.autoRunTotalRuns,
        autoRunAttemptRun: payload.attemptRun ?? runtime.state.autoRunAttemptRun,
        autoRunSessionId: payload.sessionId ?? runtime.state.autoRunSessionId,
      };
    },
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunSessionId: () => {
      sessionSeed += 1;
      return sessionSeed;
    },
    getAutoRunStatusPayload: (phase, payload = {}) => ({
      autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun ?? 0,
      autoRunTotalRuns: payload.totalRuns ?? 1,
      autoRunAttemptRun: payload.attemptRun ?? 0,
      autoRunSessionId: payload.sessionId ?? 0,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedStep: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningSteps: () => [],
    getState: async () => ({
      ...currentState,
      stepStatuses: { ...(currentState.stepStatuses || {}) },
      tabRegistry: { ...(currentState.tabRegistry || {}) },
      sourceLastUrls: { ...(currentState.sourceLastUrls || {}) },
    }),
    getStopRequested: () => false,
    hasSavedProgress: () => false,
    isAddPhoneAuthFailure: (error) => /add-phone|手机号页面|手机号页|手机号码|手机号/i.test(error?.message || String(error || '')),
    isRestartCurrentAttemptError: () => false,
    isStopError: (error) => (error?.message || String(error || '')) === '流程已被用户停止。',
    launchAutoRunTimerPlan: async () => false,
    normalizeAutoRunFallbackThreadIntervalMinutes: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    persistAutoRunTimerPlan: async () => ({}),
    resetState: async () => {
      currentState = {
        ...currentState,
        stepStatuses: {},
        tabRegistry: {},
        sourceLastUrls: {},
      };
    },
    runAutoSequenceFromStep: async () => {
      events.runCalls += 1;
      if (events.runCalls === 1) {
        throw new Error('步骤 8：验证码提交后页面进入手机号页面，当前流程无法继续自动授权。 URL: https://auth.openai.com/add-phone');
      }
    },
    runtime,
    setState: async (updates = {}) => {
      currentState = {
        ...currentState,
        ...updates,
        stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : currentState.stepStatuses,
        tabRegistry: updates.tabRegistry ? { ...updates.tabRegistry } : currentState.tabRegistry,
        sourceLastUrls: updates.sourceLastUrls ? { ...updates.sourceLastUrls } : currentState.sourceLastUrls,
      };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: (sessionId) => {
      if (sessionId && sessionId !== runtime.state.autoRunSessionId) {
        throw new Error('流程已被用户停止。');
      }
    },
    waitForRunningStepsToFinish: async () => currentState,
    chrome: {
      runtime: {
        sendMessage() {
          return Promise.resolve();
        },
      },
    },
  });

  await controller.autoRunLoop(2, {
    autoRunSkipFailures: true,
    mode: 'restart',
  });

  assert.equal(events.runCalls, 2, 'add-phone failure should skip the current round and continue with the next round');
  assert.equal(events.broadcasts.some(({ phase }) => phase === 'retrying'), false, 'add-phone fatal failure should not enter retrying phase');
  assert.equal(events.accountRecords.length, 1, 'fatal add-phone should still persist a failed round record');
  assert.equal(events.accountRecords[0].status, 'failed');
  assert.match(events.accountRecords[0].reason, /add-phone/);
  assert.ok(events.logs.some(({ message }) => /继续下一轮/.test(message)));
  assert.equal(events.broadcasts.some(({ phase }) => phase === 'stopped'), false, 'add-phone failure should not stop the whole auto-run when skip failures is enabled');
  assert.equal(runtime.state.autoRunActive, false);
  assert.equal(runtime.state.autoRunSessionId, 0);
});

test('auto-run controller skips user_already_exists failures to the next round instead of retrying the same round', async () => {
  const events = {
    logs: [],
    broadcasts: [],
    accountRecords: [],
    runCalls: 0,
  };

  let currentState = {
    stepStatuses: {},
    vpsUrl: 'https://example.com/vps',
    vpsPassword: 'secret',
    customPassword: '',
    autoRunSkipFailures: true,
    autoRunFallbackThreadIntervalMinutes: 0,
    autoRunDelayEnabled: false,
    autoRunDelayMinutes: 30,
    autoStepDelaySeconds: null,
    mailProvider: '163',
    emailGenerator: 'duck',
    gmailBaseEmail: '',
    mail2925BaseEmail: '',
    emailPrefix: 'demo',
    inbucketHost: '',
    inbucketMailbox: '',
    cloudflareDomain: '',
    cloudflareDomains: [],
    tabRegistry: {},
    sourceLastUrls: {},
    autoRunRoundSummaries: [],
  };

  const runtime = {
    state: {
      autoRunActive: false,
      autoRunCurrentRun: 0,
      autoRunTotalRuns: 1,
      autoRunAttemptRun: 0,
      autoRunSessionId: 0,
    },
    get() {
      return { ...this.state };
    },
    set(updates = {}) {
      this.state = { ...this.state, ...updates };
    },
  };

  let sessionSeed = 0;

  const controller = api.createAutoRunController({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    appendAccountRunRecord: async (status, _state, reason) => {
      events.accountRecords.push({ status, reason });
      return { status, reason };
    },
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 3000,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase, payload = {}) => {
      events.broadcasts.push({ phase, ...payload });
      currentState = {
        ...currentState,
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
        autoRunPhase: phase,
        autoRunCurrentRun: payload.currentRun ?? runtime.state.autoRunCurrentRun,
        autoRunTotalRuns: payload.totalRuns ?? runtime.state.autoRunTotalRuns,
        autoRunAttemptRun: payload.attemptRun ?? runtime.state.autoRunAttemptRun,
        autoRunSessionId: payload.sessionId ?? runtime.state.autoRunSessionId,
      };
    },
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunSessionId: () => {
      sessionSeed += 1;
      return sessionSeed;
    },
    getAutoRunStatusPayload: (phase, payload = {}) => ({
      autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun ?? 0,
      autoRunTotalRuns: payload.totalRuns ?? 1,
      autoRunAttemptRun: payload.attemptRun ?? 0,
      autoRunSessionId: payload.sessionId ?? 0,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedStep: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningSteps: () => [],
    getState: async () => ({
      ...currentState,
      stepStatuses: { ...(currentState.stepStatuses || {}) },
      tabRegistry: { ...(currentState.tabRegistry || {}) },
      sourceLastUrls: { ...(currentState.sourceLastUrls || {}) },
    }),
    getStopRequested: () => false,
    hasSavedProgress: () => false,
    isAddPhoneAuthFailure: () => false,
    isRestartCurrentAttemptError: () => false,
    isSignupUserAlreadyExistsFailure: (error) => /SIGNUP_USER_ALREADY_EXISTS::|user_already_exists/i.test(error?.message || String(error || '')),
    isStopError: (error) => (error?.message || String(error || '')) === '流程已被用户停止。',
    launchAutoRunTimerPlan: async () => false,
    normalizeAutoRunFallbackThreadIntervalMinutes: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    persistAutoRunTimerPlan: async () => ({}),
    resetState: async () => {
      currentState = {
        ...currentState,
        stepStatuses: {},
        tabRegistry: {},
        sourceLastUrls: {},
      };
    },
    runAutoSequenceFromStep: async () => {
      events.runCalls += 1;
      if (events.runCalls === 1) {
        throw new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
      }
    },
    runtime,
    setState: async (updates = {}) => {
      currentState = {
        ...currentState,
        ...updates,
        stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : currentState.stepStatuses,
        tabRegistry: updates.tabRegistry ? { ...updates.tabRegistry } : currentState.tabRegistry,
        sourceLastUrls: updates.sourceLastUrls ? { ...updates.sourceLastUrls } : currentState.sourceLastUrls,
      };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: (sessionId) => {
      if (sessionId && sessionId !== runtime.state.autoRunSessionId) {
        throw new Error('流程已被用户停止。');
      }
    },
    waitForRunningStepsToFinish: async () => currentState,
    chrome: {
      runtime: {
        sendMessage() {
          return Promise.resolve();
        },
      },
    },
  });

  await controller.autoRunLoop(2, {
    autoRunSkipFailures: true,
    mode: 'restart',
  });

  assert.equal(events.runCalls, 2, 'user_already_exists failure should skip the current round and continue with the next round');
  assert.equal(events.broadcasts.some(({ phase }) => phase === 'retrying'), false, 'user_already_exists failure should not enter same-round retrying');
  assert.equal(events.accountRecords.length, 1, 'user_already_exists should still persist a failed round record');
  assert.equal(events.accountRecords[0].status, 'failed');
  assert.match(events.accountRecords[0].reason, /SIGNUP_USER_ALREADY_EXISTS::/);
  assert.ok(events.logs.some(({ message }) => /继续下一轮/.test(message)));
  assert.equal(runtime.state.autoRunActive, false);
  assert.equal(runtime.state.autoRunSessionId, 0);
});

test('auto-run controller keeps retrying the same custom mail provider pool email until success', async () => {
  const events = {
    logs: [],
    broadcasts: [],
    accountRecords: [],
    runCalls: 0,
  };

  let currentState = {
    stepStatuses: {},
    vpsUrl: 'https://example.com/vps',
    vpsPassword: 'secret',
    customPassword: '',
    autoRunSkipFailures: true,
    autoRunFallbackThreadIntervalMinutes: 0,
    autoRunDelayEnabled: false,
    autoRunDelayMinutes: 30,
    autoStepDelaySeconds: null,
    mailProvider: 'custom',
    customMailProviderPool: ['first@example.com'],
    emailGenerator: 'duck',
    gmailBaseEmail: '',
    mail2925BaseEmail: '',
    emailPrefix: 'demo',
    inbucketHost: '',
    inbucketMailbox: '',
    cloudflareDomain: '',
    cloudflareDomains: [],
    tabRegistry: {},
    sourceLastUrls: {},
    autoRunRoundSummaries: [],
  };

  const runtime = {
    state: {
      autoRunActive: false,
      autoRunCurrentRun: 0,
      autoRunTotalRuns: 1,
      autoRunAttemptRun: 0,
      autoRunSessionId: 0,
    },
    get() {
      return { ...this.state };
    },
    set(updates = {}) {
      this.state = { ...this.state, ...updates };
    },
  };

  let sessionSeed = 0;

  const controller = api.createAutoRunController({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    appendAccountRunRecord: async (status, _state, reason) => {
      events.accountRecords.push({ status, reason });
      return { status, reason };
    },
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 3000,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase, payload = {}) => {
      events.broadcasts.push({ phase, ...payload });
      currentState = {
        ...currentState,
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
        autoRunPhase: phase,
        autoRunCurrentRun: payload.currentRun ?? runtime.state.autoRunCurrentRun,
        autoRunTotalRuns: payload.totalRuns ?? runtime.state.autoRunTotalRuns,
        autoRunAttemptRun: payload.attemptRun ?? runtime.state.autoRunAttemptRun,
        autoRunSessionId: payload.sessionId ?? runtime.state.autoRunSessionId,
      };
    },
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunSessionId: () => {
      sessionSeed += 1;
      return sessionSeed;
    },
    getAutoRunStatusPayload: (phase, payload = {}) => ({
      autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase),
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun ?? 0,
      autoRunTotalRuns: payload.totalRuns ?? 1,
      autoRunAttemptRun: payload.attemptRun ?? 0,
      autoRunSessionId: payload.sessionId ?? 0,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedStep: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningSteps: () => [],
    getState: async () => ({
      ...currentState,
      stepStatuses: { ...(currentState.stepStatuses || {}) },
      tabRegistry: { ...(currentState.tabRegistry || {}) },
      sourceLastUrls: { ...(currentState.sourceLastUrls || {}) },
      customMailProviderPool: [...(currentState.customMailProviderPool || [])],
    }),
    getStopRequested: () => false,
    hasSavedProgress: () => false,
    isAddPhoneAuthFailure: (error) => /add-phone|手机号页面|手机号页|手机号码|手机号/i.test(error?.message || String(error || '')),
    isRestartCurrentAttemptError: () => false,
    isSignupUserAlreadyExistsFailure: (error) => /SIGNUP_USER_ALREADY_EXISTS::|user_already_exists/i.test(error?.message || String(error || '')),
    isStopError: (error) => (error?.message || String(error || '')) === '流程已被用户停止。',
    launchAutoRunTimerPlan: async () => false,
    normalizeAutoRunFallbackThreadIntervalMinutes: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    persistAutoRunTimerPlan: async () => ({}),
    resetState: async () => {
      currentState = {
        ...currentState,
        stepStatuses: {},
        tabRegistry: {},
        sourceLastUrls: {},
      };
    },
    runAutoSequenceFromStep: async () => {
      events.runCalls += 1;
      if (events.runCalls <= 2) {
        throw new Error('步骤 3：页面异常，当前尝试失败。');
      }
    },
    runtime,
    setState: async (updates = {}) => {
      currentState = {
        ...currentState,
        ...updates,
        stepStatuses: updates.stepStatuses ? { ...updates.stepStatuses } : currentState.stepStatuses,
        tabRegistry: updates.tabRegistry ? { ...updates.tabRegistry } : currentState.tabRegistry,
        sourceLastUrls: updates.sourceLastUrls ? { ...updates.sourceLastUrls } : currentState.sourceLastUrls,
      };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: (sessionId) => {
      if (sessionId && sessionId !== runtime.state.autoRunSessionId) {
        throw new Error('流程已被用户停止。');
      }
    },
    waitForRunningStepsToFinish: async () => currentState,
    chrome: {
      runtime: {
        sendMessage() {
          return Promise.resolve();
        },
      },
    },
  });

  await controller.autoRunLoop(1, {
    autoRunSkipFailures: true,
    mode: 'restart',
  });

  assert.equal(events.runCalls, 3, 'custom mail provider pool should keep retrying the same round until success');
  assert.equal(events.broadcasts.filter(({ phase }) => phase === 'retrying').length, 2);
  assert.ok(events.broadcasts.filter(({ phase }) => phase === 'retrying').every(({ currentRun }) => currentRun === 1));
  assert.ok(events.logs.some(({ message }) => /继续使用当前邮箱/.test(message)));
  assert.equal(events.logs.some(({ message }) => /达到 3 次重试上限，继续下一轮/.test(message)), false);
  assert.equal(events.accountRecords.length, 0);
  assert.equal(runtime.state.autoRunActive, false);
  assert.equal(runtime.state.autoRunSessionId, 0);
});
