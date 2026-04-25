const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports tab runtime module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/tab-runtime\.js/);
});

test('tab runtime module exposes a factory', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  assert.equal(typeof api?.createTabRuntime, 'function');
});

test('tab runtime caps per-attempt response timeout to the remaining resilient timeout budget', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 1, url: 'https://example.com', status: 'complete' }),
        query: async () => [],
      },
    },
    getSourceLabel: (source) => source || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    normalizeLocalCpaStep9Mode: () => 'submit',
    parseUrlSafely: () => null,
    registerTab: async () => {},
    setState: async () => {},
    shouldBypassStep9ForLocalCpa: () => false,
    throwIfStopped: () => {},
  });

  assert.equal(
    runtime.resolveResponseTimeoutMs({ type: 'PREPARE_SIGNUP_VERIFICATION' }, undefined, 30000),
    30000
  );
  assert.equal(
    runtime.resolveResponseTimeoutMs({ type: 'PREPARE_SIGNUP_VERIFICATION' }, 12000, 5000),
    5000
  );
});

test('tab runtime waitForTabComplete waits until tab status becomes complete', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  let getCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    buildLocalhostCleanupPrefix: () => '',
    chrome: {
      tabs: {
        get: async () => {
          getCalls += 1;
          return {
            id: 9,
            url: 'https://example.com',
            status: getCalls >= 3 ? 'complete' : 'loading',
          };
        },
        query: async () => [],
      },
    },
    getSourceLabel: (source) => source || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    normalizeLocalCpaStep9Mode: () => 'submit',
    parseUrlSafely: () => null,
    registerTab: async () => {},
    setState: async () => {},
    shouldBypassStep9ForLocalCpa: () => false,
    throwIfStopped: () => {},
  });

  const result = await runtime.waitForTabComplete(9, {
    timeoutMs: 2000,
    retryDelayMs: 1,
  });

  assert.equal(result?.status, 'complete');
  assert.equal(getCalls, 3);
});

test('tab runtime waitForTabComplete aborts promptly when stop is requested', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  let throwCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({
          id: 9,
          url: 'https://example.com',
          status: 'loading',
        }),
        query: async () => [],
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {
      throwCalls += 1;
      if (throwCalls >= 2) {
        throw new Error('Flow stopped.');
      }
    },
  });

  await assert.rejects(
    runtime.waitForTabComplete(9, {
      timeoutMs: 2000,
      retryDelayMs: 1,
    }),
    /Flow stopped\./
  );
});
