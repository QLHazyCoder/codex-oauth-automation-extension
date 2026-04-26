const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function createSub2ApiPanelContext(fetchCalls = []) {
  const storage = new Map();
  const documentElement = {
    attrs: new Map(),
    getAttribute(name) {
      return this.attrs.get(name) || null;
    },
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
    },
  };

  const context = {
    URL,
    console: { log() {} },
    setTimeout() {},
    document: { documentElement },
    location: {
      href: 'https://sub.example/admin/accounts',
      origin: 'https://sub.example',
      pathname: '/admin/accounts',
      replace() {},
    },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({
          email: 'flow@example.com',
          sub2apiDefaultProxyName: '',
        }),
      },
    },
    localStorage: {
      setItem(key, value) { storage.set(`local:${key}`, String(value)); },
      removeItem(key) { storage.delete(`local:${key}`); },
    },
    sessionStorage: {
      removeItem(key) { storage.delete(`session:${key}`); },
    },
    log() {},
    reportComplete(step, payload) {
      context.completed.push({ step, payload });
    },
    reportReady() {},
    reportError() {},
    resetStopState() {},
    throwIfStopped() {},
    isStopError() { return false; },
    completed: [],
    fetch: async (url, options = {}) => {
      const parsed = new URL(url);
      const body = options.body ? JSON.parse(options.body) : null;
      fetchCalls.push({ path: parsed.pathname, search: parsed.search, method: options.method || 'GET', body });

      if (parsed.pathname === '/api/v1/auth/login') {
        return createJsonResponse({
          code: 0,
          data: {
            access_token: 'admin-token',
            refresh_token: 'refresh-admin',
            expires_in: 3600,
            user: { id: 1 },
          },
        });
      }
      if (parsed.pathname === '/api/v1/admin/groups/all') {
        return createJsonResponse({
          code: 0,
          data: [
            { id: 5, name: 'codex', platform: 'openai' },
            { id: 9, name: 'codex-plus', platform: 'openai' },
          ],
        });
      }
      if (parsed.pathname === '/api/v1/admin/proxies/all') {
        return createJsonResponse({
          code: 0,
          data: [{
            id: 7,
            name: 'shadowrocket',
            protocol: 'socks5',
            host: '127.0.0.1',
            port: 1080,
            status: 'active',
          }],
        });
      }
      if (parsed.pathname === '/api/v1/admin/openai/generate-auth-url') {
        return createJsonResponse({
          code: 0,
          data: {
            auth_url: 'https://auth.openai.com/oauth?state=oauth-state',
            session_id: 'session-1',
            state: 'oauth-state',
          },
        });
      }
      if (parsed.pathname === '/api/v1/admin/openai/exchange-code') {
        return createJsonResponse({
          code: 0,
          data: {
            access_token: 'openai-access',
            refresh_token: 'openai-refresh',
            expires_at: 1770000000,
            email: 'flow@example.com',
          },
        });
      }
      if (parsed.pathname === '/api/v1/admin/accounts') {
        return createJsonResponse({
          code: 0,
          data: { id: 11 },
        });
      }

      return createJsonResponse({ code: 1, message: `unexpected path ${parsed.pathname}` }, 404);
    },
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync('content/sub2api-panel.js', 'utf8'), context);
  return context;
}

test('SUB2API step 1 selects the configured default proxy before generating OAuth URL', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  const result = await vm.runInContext(`
    step1_generateOpenAiAuthUrl({
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex',
      sub2apiDefaultProxyName: 'shadowrocket'
    }, { report: false })
  `, context);

  const generateCall = fetchCalls.find((call) => call.path === '/api/v1/admin/openai/generate-auth-url');
  assert.equal(result.sub2apiProxyId, 7);
  assert.equal(generateCall.body.proxy_id, 7);
});

test('SUB2API step 10 uses the same proxy for code exchange and account creation', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  await vm.runInContext(`
    step9_submitOpenAiCallback({
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      sub2apiUrl: 'https://sub.example/admin/accounts',
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex',
      sub2apiSessionId: 'session-1',
      sub2apiOAuthState: 'oauth-state',
      sub2apiGroupId: 5,
      sub2apiProxyId: 7
    })
  `, context);

  const exchangeCall = fetchCalls.find((call) => call.path === '/api/v1/admin/openai/exchange-code');
  const createCall = fetchCalls.find((call) => call.path === '/api/v1/admin/accounts');

  assert.equal(exchangeCall.body.proxy_id, 7);
  assert.equal(createCall.body.proxy_id, 7);
  assert.equal(createCall.body.group_ids[0], 5);
  assert.equal(context.completed[0].step, 10);
});

test('SUB2API panel accepts Plus platform verify step 13', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  await vm.runInContext(`
    handleStep(13, {
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      sub2apiUrl: 'https://sub.example/admin/accounts',
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex',
      sub2apiSessionId: 'session-1',
      sub2apiOAuthState: 'oauth-state',
      sub2apiGroupId: 5
    })
  `, context);

  const exchangeCall = fetchCalls.find((call) => call.path === '/api/v1/admin/openai/exchange-code');
  const createCall = fetchCalls.find((call) => call.path === '/api/v1/admin/accounts');

  assert.equal(exchangeCall.body.code, 'callback-code');
  assert.equal(createCall.body.group_ids[0], 5);
  assert.equal(context.completed[0].step, 13);
});

test('SUB2API step 1 omits proxy_id when default proxy is empty', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  const result = await vm.runInContext(`
    step1_generateOpenAiAuthUrl({
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex',
      sub2apiDefaultProxyName: '   '
    }, { report: false })
  `, context);

  const generateCall = fetchCalls.find((call) => call.path === '/api/v1/admin/openai/generate-auth-url');
  assert.equal(result.sub2apiProxyId, null);
  assert.equal(Object.hasOwn(generateCall.body, 'proxy_id'), false);
});

test('SUB2API step 10 creates accounts in multiple configured groups', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  const step1Result = await vm.runInContext(`
    step1_generateOpenAiAuthUrl({
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex, codex-plus'
    }, { report: false })
  `, context);

  await vm.runInContext(`
    step9_submitOpenAiCallback({
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      sub2apiUrl: 'https://sub.example/admin/accounts',
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex, codex-plus',
      sub2apiSessionId: 'session-1',
      sub2apiOAuthState: 'oauth-state',
      sub2apiGroupIds: ${JSON.stringify(step1Result.sub2apiGroupIds)}
    })
  `, context);

  const createCall = fetchCalls.find((call) => call.path === '/api/v1/admin/accounts');
  assert.deepEqual(Array.from(step1Result.sub2apiGroupIds), [5, 9]);
  assert.deepEqual(createCall.body.group_ids, [5, 9]);
});

test('SUB2API step 10 omits proxy_id when no proxy is configured', async () => {
  const fetchCalls = [];
  const context = createSub2ApiPanelContext(fetchCalls);

  await vm.runInContext(`
    step9_submitOpenAiCallback({
      localhostUrl: 'http://localhost:1455/auth/callback?code=callback-code&state=oauth-state',
      sub2apiUrl: 'https://sub.example/admin/accounts',
      sub2apiEmail: 'admin@example.com',
      sub2apiPassword: 'secret',
      sub2apiGroupName: 'codex',
      sub2apiSessionId: 'session-1',
      sub2apiOAuthState: 'oauth-state',
      sub2apiGroupId: 5,
      sub2apiDefaultProxyName: ''
    })
  `, context);

  const exchangeCall = fetchCalls.find((call) => call.path === '/api/v1/admin/openai/exchange-code');
  const createCall = fetchCalls.find((call) => call.path === '/api/v1/admin/accounts');

  assert.equal(Object.hasOwn(exchangeCall.body, 'proxy_id'), false);
  assert.equal(Object.hasOwn(createCall.body, 'proxy_id'), false);
});
