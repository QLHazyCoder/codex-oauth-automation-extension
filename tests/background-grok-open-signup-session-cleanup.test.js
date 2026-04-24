const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadModule() {
  const source = fs.readFileSync('background/steps/grok-open-signup.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundGrokStep1;`)(globalScope);
}

test('grok step 1 clears x.ai and grok session before opening signup page', async () => {
  const api = loadModule();
  const events = {
    logs: [],
    removedCookies: [],
    browsingDataRemovals: [],
    reuseOptions: null,
    calls: [],
  };
  const chrome = {
    cookies: {
      getAllCookieStores: async () => [{ id: '0' }],
      getAll: async () => ([
        { storeId: '0', domain: '.x.ai', path: '/', name: 'sso' },
        { storeId: '0', domain: 'accounts.x.ai', path: '/', name: 'session' },
        { storeId: '0', domain: '.grok.com', path: '/', name: 'sid' },
        { storeId: '0', domain: '.example.com', path: '/', name: 'keep' },
      ]),
      remove: async (details) => {
        events.removedCookies.push(details);
        return { name: details.name };
      },
    },
    browsingData: {
      remove: async (options, dataToRemove) => {
        events.browsingDataRemovals.push({ options, dataToRemove });
      },
    },
  };

  const executor = api.createGrokStep1Executor({
    chrome,
    addLog: async (message, level = 'info') => events.logs.push({ message, level }),
    completeStepFromBackground: async () => events.calls.push('complete'),
    reuseOrCreateTab: async (_source, _url, options) => {
      events.calls.push('open');
      events.reuseOptions = options;
      return 123;
    },
    registerTab: async () => {},
    ensureContentScriptReadyOnTab: async () => {},
    sendToContentScriptResilient: async () => ({ ok: true }),
  });

  await executor.executeGrokStep1();

  assert.deepEqual(events.removedCookies.map((details) => details.name), ['sso', 'session', 'sid']);
  assert.equal(events.removedCookies.some((details) => details.name === 'keep'), false);
  assert.deepEqual(events.browsingDataRemovals, [{
    options: {
      since: 0,
      origins: ['https://accounts.x.ai', 'https://grok.com', 'https://x.ai'],
    },
    dataToRemove: {
      cacheStorage: true,
      cookies: true,
      indexedDB: true,
      localStorage: true,
      serviceWorkers: true,
    },
  }]);
  assert.equal(events.reuseOptions.reloadIfSameUrl, true);
  assert.deepEqual(events.calls, ['open', 'complete']);
  assert.match(events.logs[0].message, /已清理 x\.ai \/ Grok 会话数据/);
  assert.match(events.logs[1].message, /正在打开 x\.ai 注册页/);
});
