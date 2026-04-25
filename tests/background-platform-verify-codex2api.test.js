const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('platform verify module supports codex2api protocol callback exchange', async () => {
  const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
      assert.equal(url, 'http://localhost:8080/api/admin/oauth/exchange-code');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Admin-Key'], 'admin-secret');
      assert.deepStrictEqual(JSON.parse(options.body), {
        session_id: 'session-123',
        code: 'callback-code',
        state: 'oauth-state',
      });
      return {
        ok: true,
        json: async () => ({
          message: 'OAuth 账号 flow@example.com 添加成功',
          id: 42,
          email: 'flow@example.com',
          plan_type: 'pro',
        }),
      };
  };

  try {
    const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)({});
    const completed = [];
    const logs = [];
    const executor = api.createStep10Executor({
      addLog: async (message, level = 'info') => {
        logs.push({ message, level });
      },
      chrome: {},
      closeConflictingTabsForSource: async () => {},
      completeStepFromBackground: async (step, payload) => {
        completed.push({ step, payload });
      },
      ensureContentScriptReadyOnTab: async () => {},
      getPanelMode: () => 'codex2api',
      getTabId: async () => 0,
      isLocalhostOAuthCallbackUrl: (value) => String(value || '').includes('/auth/callback?code='),
      isTabAlive: async () => false,
      normalizeCodex2ApiUrl: () => 'http://localhost:8080/admin/accounts',
      normalizeSub2ApiUrl: (value) => value,
      rememberSourceLastUrl: async () => {},
      reuseOrCreateTab: async () => 0,
      sendToContentScript: async () => ({}),
      sendToContentScriptResilient: async () => ({}),
      shouldBypassStep9ForLocalCpa: () => false,
      SUB2API_STEP9_RESPONSE_TIMEOUT_MS: 120000,
    });

    await executor.executeStep10({
      panelMode: 'codex2api',
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      codex2apiUrl: 'http://localhost:8080/admin/accounts',
      codex2apiAdminKey: 'admin-secret',
      codex2apiSessionId: 'session-123',
      codex2apiOAuthState: 'oauth-state',
    });

    assert.deepStrictEqual(logs, [
      { message: '步骤 10：正在向 Codex2API 提交回调并创建账号...', level: 'info' },
      { message: '步骤 10：OAuth 账号 flow@example.com 添加成功', level: 'ok' },
    ]);
    assert.deepStrictEqual(completed, [
      {
        step: 10,
        payload: {
          localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
          verifiedStatus: 'OAuth 账号 flow@example.com 添加成功',
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
