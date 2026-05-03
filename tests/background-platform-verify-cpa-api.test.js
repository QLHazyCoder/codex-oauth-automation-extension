const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function createDeps(overrides = {}) {
  const logs = [];
  const completed = [];
  const uiCalls = [];

  const deps = {
    addLog: async (message, level = 'info', options = {}) => {
      logs.push({ message, level, step: options.step, stepKey: options.stepKey });
    },
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    closeConflictingTabsForSource: async () => {},
    completeStepFromBackground: async (step, payload) => {
      completed.push({ step, payload });
    },
    ensureContentScriptReadyOnTab: async () => {},
    getPanelMode: () => 'cpa',
    getTabId: async () => 0,
    isLocalhostOAuthCallbackUrl: (value) => String(value || '').includes('/auth/callback?code='),
    isTabAlive: async () => false,
    normalizeCodex2ApiUrl: (value) => value,
    normalizeSub2ApiUrl: (value) => value,
    rememberSourceLastUrl: async () => {},
    reuseOrCreateTab: async () => 91,
    sendToContentScript: async () => ({}),
    sendToContentScriptResilient: async (source, message, options) => {
      uiCalls.push({ source, message, options });
      return {};
    },
    shouldBypassStep9ForLocalCpa: () => false,
    SUB2API_STEP9_RESPONSE_TIMEOUT_MS: 120000,
    ...overrides,
  };

  return { deps, logs, completed, uiCalls };
}

test('platform verify module submits CPA callback via management API first', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  let uiCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, 'http://localhost:8317/v0/management/oauth-callback');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer cpa-key');
    assert.equal(options.headers['X-Management-Key'], 'cpa-key');
    assert.deepStrictEqual(JSON.parse(options.body), {
      provider: 'codex',
      redirect_url: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
    });
    return {
      ok: true,
      json: async () => ({
        message: 'CPA API 回调提交成功',
      }),
    };
  };

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const { deps, logs, completed } = createDeps({
      sendToContentScriptResilient: async () => {
        uiCalled = true;
        return {};
      },
    });
    const executor = api.createStep10Executor(deps);

    await executor.executeStep10({
      panelMode: 'cpa',
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      vpsUrl: 'http://localhost:8317/admin/oauth',
      vpsPassword: 'cpa-key',
    });

    assert.equal(uiCalled, false);
    assert.deepStrictEqual(completed, [
      {
        step: 10,
        payload: {
          localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
          verifiedStatus: 'CPA API 回调提交成功',
        },
      },
    ]);
    assert.deepStrictEqual(logs, [
      { message: '正在通过 CPA 管理接口提交回调地址...', level: 'info', step: 10, stepKey: 'platform-verify' },
      { message: 'CPA API 回调提交成功', level: 'ok', step: 10, stepKey: 'platform-verify' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('platform verify module prefers cpaManagementOrigin when provided', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, 'http://localhost:9999/v0/management/oauth-callback');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer cpa-key');
    assert.equal(options.headers['X-Management-Key'], 'cpa-key');
    return {
      ok: true,
      json: async () => ({
        message: 'CPA API 回调提交成功',
      }),
    };
  };

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const { deps, completed } = createDeps();
    const executor = api.createStep10Executor(deps);

    await executor.executeStep10({
      panelMode: 'cpa',
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      cpaManagementOrigin: 'http://localhost:9999',
      vpsUrl: 'http://localhost:8317/admin/oauth',
      vpsPassword: 'cpa-key',
    });

    assert.equal(completed.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('platform verify module fails fast when CPA API submit fails', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: 'failed to persist oauth callback' }),
  });

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const { deps, logs, completed, uiCalls } = createDeps();
    const executor = api.createStep10Executor(deps);

    await assert.rejects(
      () => executor.executeStep10({
        panelMode: 'cpa',
        localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
        vpsUrl: 'http://localhost:8317/admin/oauth',
        vpsPassword: 'cpa-key',
      }),
      /failed to persist oauth callback/
    );

    assert.equal(uiCalls.length, 0);
    assert.equal(completed.length, 0);
    assert.equal(logs[0].message, '正在通过 CPA 管理接口提交回调地址...');
    assert.equal(logs[0].step, 10);
    assert.match(logs[1].message, /CPA 接口提交失败：failed to persist oauth callback/);
    assert.equal(logs[1].step, 10);
    assert.equal(logs[1].level, 'error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('platform verify module requires management key for CPA API-only flow', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return {
      ok: true,
      json: async () => ({}),
    };
  };

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const { deps, logs, completed, uiCalls } = createDeps();
    const executor = api.createStep10Executor(deps);

    await assert.rejects(
      () => executor.executeStep10({
        panelMode: 'cpa',
        localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
        vpsUrl: 'http://localhost:8317/admin/oauth',
        vpsPassword: '   ',
      }),
      /尚未配置 CPA 管理密钥/
    );

    assert.equal(fetchCalled, false);
    assert.equal(uiCalls.length, 0);
    assert.equal(completed.length, 0);
    assert.equal(logs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('platform verify module rejects callback when cpa oauth state mismatches', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return {
      ok: true,
      json: async () => ({ message: 'should not happen' }),
    };
  };

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const { deps } = createDeps();
    const executor = api.createStep10Executor(deps);

    await assert.rejects(
      () => executor.executeStep10({
        panelMode: 'cpa',
        localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=callback-state',
        cpaOAuthState: 'expected-state',
        vpsUrl: 'http://localhost:8317/admin/oauth',
        vpsPassword: 'cpa-key',
      }),
      /CPA 回调 state 与当前授权会话不匹配/
    );

    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('platform verify module sends Plus visible step 13 to SUB2API panel', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const sentMessages = [];

  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
  const { deps } = createDeps({
    getPanelMode: () => 'sub2api',
    getTabId: async () => 91,
    isTabAlive: async () => true,
    sendToContentScript: async (sourceName, message, options) => {
      sentMessages.push({ sourceName, message, options });
      return { ok: true };
    },
  });
  const executor = api.createStep10Executor(deps);

  await executor.executeStep10({
    panelMode: 'sub2api',
    visibleStep: 13,
    localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
    sub2apiUrl: 'https://sub.example/admin/accounts',
    sub2apiEmail: 'admin@example.com',
    sub2apiPassword: 'secret',
    sub2apiSessionId: 'session-1',
    sub2apiOAuthState: 'oauth-state',
  });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].sourceName, 'sub2api-panel');
  assert.equal(sentMessages[0].message.step, 13);
});

