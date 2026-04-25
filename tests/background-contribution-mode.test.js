const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const backgroundSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(source, name) {
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

function createMockResponse(ok, status, payload) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('background imports contribution oauth module and keeps contribution runtime out of persisted settings', () => {
  const persistedStart = backgroundSource.indexOf('const PERSISTED_SETTING_DEFAULTS = {');
  const persistedEnd = backgroundSource.indexOf('const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);');
  const defaultStateStart = backgroundSource.indexOf('const DEFAULT_STATE = {');
  const defaultStateEnd = backgroundSource.indexOf('async function getState()');

  const persistedBlock = backgroundSource.slice(persistedStart, persistedEnd);
  const defaultStateBlock = backgroundSource.slice(defaultStateStart, defaultStateEnd);

  assert.match(backgroundSource, /background\/contribution-oauth\.js/);
  assert.doesNotMatch(persistedBlock, /contributionSessionId|contributionAuthUrl|contributionCallbackUrl|contributionStatus/);
  assert.match(defaultStateBlock, /contributionMode:\s*false|CONTRIBUTION_RUNTIME_DEFAULTS/);
});

test('contribution oauth module exposes a factory', () => {
  const source = fs.readFileSync('background/contribution-oauth.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', 'fetch', `${source}; return self.MultiPageBackgroundContributionOAuth;`)(
    globalScope,
    async () => createMockResponse(true, 200, { ok: true })
  );

  assert.equal(typeof api?.createContributionOAuthManager, 'function');
  assert.equal(Array.isArray(api?.RUNTIME_KEYS), true);
});

test('buildContributionModeState preserves active contribution runtime while forcing CPA mode', () => {
  const bundle = extractFunction(backgroundSource, 'buildContributionModeState');

  const api = new Function(`
const DEFAULT_STATE = { panelMode: 'cpa' };
const CONTRIBUTION_RUNTIME_DEFAULTS = {
  contributionMode: false,
  contributionModeExpected: false,
  contributionNickname: '',
  contributionQq: '',
  contributionSessionId: '',
  contributionAuthUrl: '',
  contributionAuthState: '',
  contributionCallbackUrl: '',
  contributionStatus: '',
  contributionStatusMessage: '',
  contributionLastPollAt: 0,
  contributionCallbackStatus: 'idle',
  contributionCallbackMessage: '',
  contributionAuthOpenedAt: 0,
  contributionAuthTabId: 0,
};
const CONTRIBUTION_RUNTIME_KEYS = Object.keys(CONTRIBUTION_RUNTIME_DEFAULTS);
${bundle}
return { buildContributionModeState };
`)();

  assert.deepStrictEqual(
    api.buildContributionModeState(true, {
      panelMode: 'sub2api',
      customPassword: 'Secret123!',
      accountRunHistoryTextEnabled: true,
    }, {
      contributionSessionId: 'session-001',
      contributionAuthUrl: 'https://auth.example.com',
      contributionStatus: 'waiting',
      contributionCallbackStatus: 'waiting',
    }),
    {
      contributionMode: true,
      contributionModeExpected: true,
      contributionNickname: '',
      contributionQq: '',
      contributionSessionId: 'session-001',
      contributionAuthUrl: 'https://auth.example.com',
      contributionAuthState: '',
      contributionCallbackUrl: '',
      contributionStatus: 'waiting',
      contributionStatusMessage: '',
      contributionLastPollAt: 0,
      contributionCallbackStatus: 'waiting',
      contributionCallbackMessage: '',
      contributionAuthOpenedAt: 0,
      contributionAuthTabId: 0,
      panelMode: 'cpa',
      customPassword: '',
      accountRunHistoryTextEnabled: false,
    }
  );

  assert.deepStrictEqual(
    api.buildContributionModeState(false, {
      panelMode: 'sub2api',
      customPassword: 'Secret123!',
      accountRunHistoryTextEnabled: true,
    }, {
      contributionSessionId: 'session-001',
      contributionAuthUrl: 'https://auth.example.com',
      contributionStatus: 'waiting',
    }),
    {
      contributionMode: false,
      contributionModeExpected: false,
      contributionNickname: '',
      contributionQq: '',
      contributionSessionId: '',
      contributionAuthUrl: '',
      contributionAuthState: '',
      contributionCallbackUrl: '',
      contributionStatus: '',
      contributionStatusMessage: '',
      contributionLastPollAt: 0,
      contributionCallbackStatus: 'idle',
      contributionCallbackMessage: '',
      contributionAuthOpenedAt: 0,
      contributionAuthTabId: 0,
      panelMode: 'sub2api',
      customPassword: 'Secret123!',
      accountRunHistoryTextEnabled: true,
    }
  );
});

test('resetState preserves contribution runtime across reset', () => {
  assert.match(backgroundSource, /CONTRIBUTION_RUNTIME_KEYS/);
  assert.match(backgroundSource, /const contributionModeState = buildContributionModeState/);
  assert.match(backgroundSource, /\.\.\.contributionModeState/);
});

test('message router handles contribution mode, start flow, and status polling messages', async () => {
  const source = fs.readFileSync('background/message-router.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

  const calls = [];
  const router = api.createMessageRouter({
    ensureManualInteractionAllowed: async () => ({
      stepStatuses: { 1: 'pending', 2: 'completed' },
      contributionMode: true,
    }),
    pollContributionStatus: async (options) => {
      calls.push({ type: 'poll', options });
      return { contributionStatus: 'waiting' };
    },
    setContributionMode: async (enabled) => {
      calls.push({ type: 'toggle', enabled });
      return {
        contributionMode: Boolean(enabled),
        panelMode: 'cpa',
      };
    },
    startContributionFlow: async (options) => {
      calls.push({ type: 'start', options });
      return {
        contributionMode: true,
        contributionSessionId: 'session-001',
        contributionStatus: 'started',
      };
    },
  });

  const enableResponse = await router.handleMessage({
    type: 'SET_CONTRIBUTION_MODE',
    payload: { enabled: true },
  });
  const startResponse = await router.handleMessage({
    type: 'START_CONTRIBUTION_FLOW',
    payload: { nickname: '阿青', qq: '123456' },
  });
  const pollResponse = await router.handleMessage({
    type: 'POLL_CONTRIBUTION_STATUS',
    payload: { reason: 'test_poll' },
  });

  assert.equal(enableResponse.ok, true);
  assert.equal(startResponse.ok, true);
  assert.equal(pollResponse.ok, true);
  assert.deepStrictEqual(calls, [
    { type: 'toggle', enabled: true },
    { type: 'start', options: { nickname: '阿青', qq: '123456' } },
    { type: 'poll', options: { reason: 'test_poll' } },
  ]);
});

test('message router re-syncs contribution mode before AUTO_RUN when sidepanel payload marks contributionMode=true', async () => {
  const source = fs.readFileSync('background/message-router.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

  const calls = [];
  const router = api.createMessageRouter({
    clearStopRequest: () => {},
    getPendingAutoRunTimerPlan: () => null,
    getState: async () => ({
      contributionMode: false,
      stepStatuses: {},
    }),
    normalizeRunCount: (value) => Number(value) || 1,
    setContributionMode: async (enabled) => {
      calls.push({ type: 'toggle', enabled });
      return { contributionMode: true };
    },
    setState: async (updates) => {
      calls.push({ type: 'setState', updates });
    },
    startAutoRunLoop: (totalRuns, options) => {
      calls.push({ type: 'startAutoRunLoop', totalRuns, options });
    },
  });

  const response = await router.handleMessage({
    type: 'AUTO_RUN',
      payload: {
        totalRuns: 2,
        autoRunSkipFailures: true,
        mode: 'restart',
        contributionMode: true,
        contributionNickname: '阿青',
        contributionQq: '123456',
      },
    });

  assert.equal(response.ok, true);
  assert.deepStrictEqual(calls, [
    { type: 'toggle', enabled: true },
    { type: 'setState', updates: { contributionNickname: '阿青', contributionQq: '123456' } },
    { type: 'setState', updates: { autoRunSkipFailures: true } },
    { type: 'startAutoRunLoop', totalRuns: 2, options: { autoRunSkipFailures: true, mode: 'restart' } },
  ]);
});

test('account run history snapshot sync is disabled in contribution mode', () => {
  const source = fs.readFileSync('background/account-run-history.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundAccountRunHistory;`)(globalScope);

  const helpers = api.createAccountRunHistoryHelpers({
    addLog: async () => {},
    buildLocalHelperEndpoint: (baseUrl, path) => `${baseUrl}${path}`,
    chrome: {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
        },
      },
    },
    getErrorMessage: (error) => error?.message || String(error || ''),
    getState: async () => ({}),
    normalizeAccountRunHistoryHelperBaseUrl: (value) => String(value || '').trim(),
  });

  assert.equal(
    helpers.shouldSyncAccountRunHistorySnapshot({
      contributionMode: true,
      accountRunHistoryTextEnabled: true,
      accountRunHistoryHelperBaseUrl: 'http://127.0.0.1:17373',
    }),
    false
  );

  assert.equal(
    helpers.shouldSyncAccountRunHistorySnapshot({
      contributionMode: false,
      accountRunHistoryTextEnabled: true,
      accountRunHistoryHelperBaseUrl: 'http://127.0.0.1:17373',
    }),
    true
  );
});

test('contribution oauth manager starts session, opens auth url, submits callback, and continues polling final status', async () => {
  const source = fs.readFileSync('background/contribution-oauth.js', 'utf8');
  const globalScope = {};
  const fetchCalls = [];
  const tabCalls = [];
  const closeCallbackCalls = [];
  let statusPollCount = 0;
  let currentState = {
    contributionMode: true,
    email: 'user@example.com',
    contributionSessionId: '',
    contributionStatus: '',
    contributionCallbackStatus: 'idle',
  };
  const broadcasts = [];

  const api = new Function('self', 'fetch', `${source}; return self.MultiPageBackgroundContributionOAuth;`)(
    globalScope,
    async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (String(url).endsWith('/start')) {
        return createMockResponse(true, 200, {
          ok: true,
          session_id: 'session-001',
          state: 'oauth-state-001',
          auth_url: 'https://auth.example.com/oauth?state=oauth-state-001',
          message: '登录地址已生成',
        });
      }
      if (String(url).includes('/status?')) {
        statusPollCount += 1;
        if (statusPollCount === 1) {
          return createMockResponse(true, 200, {
            ok: true,
            session_id: 'session-001',
            status: 'waiting',
            message: '等待提交回调。',
          });
        }
        return createMockResponse(true, 200, {
          ok: true,
          session_id: 'session-001',
          status: 'processing',
          message: '回调地址已提交给 CPA，正在等待结果确认。',
        });
      }
      if (String(url).endsWith('/submit-callback')) {
        return createMockResponse(true, 200, {
          ok: true,
          session_id: 'session-001',
          status: 'processing',
          message: '回调地址已提交给 CPA，正在等待结果确认。',
        });
      }
      return createMockResponse(true, 200, { ok: true });
    }
  );

  const manager = api.createContributionOAuthManager({
    addLog: async () => {},
    broadcastDataUpdate(updates) {
      broadcasts.push(updates);
      currentState = { ...currentState, ...updates };
    },
    chrome: {
      tabs: {
        async create(payload) {
          tabCalls.push(payload);
          return { id: 88, url: payload.url };
        },
        async update() {
          return null;
        },
        onUpdated: { addListener() {} },
      },
      webNavigation: {
        onCommitted: { addListener() {} },
        onHistoryStateUpdated: { addListener() {} },
      },
    },
    closeLocalhostCallbackTabs: async (callbackUrl) => {
      closeCallbackCalls.push(callbackUrl);
    },
    getState: async () => currentState,
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
  });

  const startedState = await manager.startContributionFlow();
  assert.equal(startedState.contributionSessionId, 'session-001');
  assert.equal(startedState.contributionAuthState, 'oauth-state-001');
  assert.equal(startedState.contributionStatus, 'waiting');
  assert.equal(startedState.contributionAuthTabId, 88);
  assert.equal(tabCalls.length, 1);
  assert.match(fetchCalls[0].url, /\/start$/);
  assert.match(String(fetchCalls[0].options.body || ''), /"nickname":""/);
  assert.match(String(fetchCalls[0].options.body || ''), /"qq":""/);
  assert.match(String(fetchCalls[0].options.body || ''), /"email":"user@example\.com"/);
  assert.match(fetchCalls[1].url, /\/status\?/);

  const callbackState = await manager.handleCapturedCallback(
    'http://localhost:1455/auth/callback?code=abc123&state=oauth-state-001',
    { source: 'test' }
  );

  assert.equal(callbackState.contributionCallbackUrl, 'http://localhost:1455/auth/callback?code=abc123&state=oauth-state-001');
  assert.equal(callbackState.contributionCallbackStatus, 'submitted');
  assert.equal(callbackState.contributionStatus, 'processing');
  assert.equal(closeCallbackCalls[0], 'http://localhost:1455/auth/callback?code=abc123&state=oauth-state-001');
  assert.ok(fetchCalls.some((call) => String(call.url).endsWith('/submit-callback')));
  assert.ok(broadcasts.some((item) => item.contributionCallbackStatus === 'captured'));
  assert.ok(broadcasts.some((item) => item.contributionCallbackStatus === 'submitted'));
});

test('contribution oauth manager accepts localhost callback urls that contain error and state', async () => {
  const source = fs.readFileSync('background/contribution-oauth.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', 'fetch', `${source}; return self.MultiPageBackgroundContributionOAuth;`)(
    globalScope,
    async () => createMockResponse(true, 200, { ok: true })
  );

  const manager = api.createContributionOAuthManager({
    chrome: {
      tabs: {
        onUpdated: { addListener() {} },
      },
      webNavigation: {
        onCommitted: { addListener() {} },
        onHistoryStateUpdated: { addListener() {} },
      },
    },
    getState: async () => ({}),
    setState: async () => ({}),
  });

  assert.equal(
    manager.isContributionCallbackUrl(
      'http://localhost:1455/auth/callback?error=access_denied&state=oauth-state-001',
      { contributionAuthState: 'oauth-state-001' }
    ),
    true
  );
});

test('refreshOAuthUrlBeforeStep6 uses contribution oauth session instead of panel bridge in contribution mode', async () => {
  const bundle = extractFunction(backgroundSource, 'refreshOAuthUrlBeforeStep6');
  const calls = [];

  const api = new Function(`
${bundle}
return { refreshOAuthUrlBeforeStep6 };
`)();

  globalThis.addLog = async (message) => {
    calls.push({ type: 'log', message });
  };
  globalThis.contributionOAuthManager = {
    async startContributionFlow(options) {
      calls.push({ type: 'contribution', options });
      return {
        contributionAuthUrl: 'https://auth.example.com/oauth?state=oauth-state-001',
      };
    },
  };
  globalThis.handleStepData = async (step, payload) => {
    calls.push({ type: 'step', step, payload });
  };
  globalThis.getPanelModeLabel = () => 'CPA';
  globalThis.requestOAuthUrlFromPanel = async () => {
    calls.push({ type: 'panel' });
    return { oauthUrl: 'https://panel.example.com/oauth' };
  };
  globalThis.LOG_PREFIX = '[test]';

  const oauthUrl = await api.refreshOAuthUrlBeforeStep6({
    contributionMode: true,
    email: 'user@example.com',
  });

  assert.equal(oauthUrl, 'https://auth.example.com/oauth?state=oauth-state-001');
  assert.deepStrictEqual(calls, [
    { type: 'log', message: '步骤 7：contributionMode=true，走公开贡献接口，正在申请 OAuth 登录地址...' },
    {
      type: 'contribution',
      options: {
        nickname: '',
        openAuthTab: false,
        stateOverride: {
          contributionMode: true,
          email: 'user@example.com',
        },
      },
    },
    {
      type: 'step',
      step: 1,
      payload: {
        oauthUrl: 'https://auth.example.com/oauth?state=oauth-state-001',
      },
    },
  ]);

  delete globalThis.addLog;
  delete globalThis.contributionOAuthManager;
  delete globalThis.handleStepData;
  delete globalThis.getPanelModeLabel;
  delete globalThis.requestOAuthUrlFromPanel;
  delete globalThis.LOG_PREFIX;
});

test('refreshOAuthUrlBeforeStep6 logs the normal CPA/SUB2API/Codex2API path explicitly when contributionMode=false', async () => {
  const bundle = extractFunction(backgroundSource, 'refreshOAuthUrlBeforeStep6');
  const calls = [];

  const api = new Function(`
${bundle}
return { refreshOAuthUrlBeforeStep6 };
`)();

  globalThis.addLog = async (message) => {
    calls.push({ type: 'log', message });
  };
  globalThis.contributionOAuthManager = {
    async startContributionFlow() {
      calls.push({ type: 'contribution' });
      return {
        contributionAuthUrl: 'https://auth.example.com/oauth?state=unexpected',
      };
    },
  };
  globalThis.handleStepData = async (step, payload) => {
    calls.push({ type: 'step', step, payload });
  };
  globalThis.getPanelModeLabel = () => 'SUB2API';
  globalThis.requestOAuthUrlFromPanel = async () => {
    calls.push({ type: 'panel' });
    return { oauthUrl: 'https://panel.example.com/oauth' };
  };
  globalThis.LOG_PREFIX = '[test]';

  const oauthUrl = await api.refreshOAuthUrlBeforeStep6({
    contributionMode: false,
    panelMode: 'sub2api',
    email: 'user@example.com',
  });

  assert.equal(oauthUrl, 'https://panel.example.com/oauth');
  assert.deepStrictEqual(calls, [
    { type: 'log', message: '步骤 7：contributionMode=false，走普通 CPA / SUB2API / Codex2API 链路（当前面板：SUB2API），正在刷新 OAuth 登录地址...' },
    { type: 'panel' },
    {
      type: 'step',
      step: 1,
      payload: {
        oauthUrl: 'https://panel.example.com/oauth',
      },
    },
  ]);

  delete globalThis.addLog;
  delete globalThis.contributionOAuthManager;
  delete globalThis.handleStepData;
  delete globalThis.getPanelModeLabel;
  delete globalThis.requestOAuthUrlFromPanel;
  delete globalThis.LOG_PREFIX;
});

test('executeStep10 blocks silent fallback when contributionModeExpected=true but contributionMode=false', async () => {
  const bundle = extractFunction(backgroundSource, 'executeStep10');

  const api = new Function(`
${bundle}
return { executeStep10 };
`)();

  globalThis.executeContributionStep10 = async () => ({ ok: true });
  globalThis.step10Executor = {
    async executeStep10() {
      return { ok: true };
    },
  };

  await assert.rejects(
    () => api.executeStep10({
      contributionModeExpected: true,
      contributionMode: false,
    }),
    /步骤 10：当前自动流程预期使用贡献模式/
  );

  delete globalThis.executeContributionStep10;
  delete globalThis.step10Executor;
});
