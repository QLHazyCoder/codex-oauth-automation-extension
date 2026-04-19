const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
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
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
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

function createHarness(overrides = {}) {
  const bundle = [
    extractFunction('normalizeHotmailLocalBaseUrl'),
    extractFunction('buildHotmailLocalEndpoint'),
    extractFunction('getRuntimePlatformOs'),
    extractFunction('getIcloudAliasLabel'),
    extractFunction('fetchIcloudHideMyEmailLocally'),
  ].join('\n');

  return new Function('overrides', `
const DEFAULT_HOTMAIL_LOCAL_BASE_URL = 'http://127.0.0.1:17373';
const ICLOUD_LOCAL_HELPER_TIMEOUT_MS = 120000;
const LOG_PREFIX = '[test]';
const calls = {
  logs: [],
  emailStates: [],
  broadcasts: [],
  fetches: [],
};
const chrome = overrides.chrome || { runtime: { getPlatformInfo: async () => ({ os: 'mac' }) } };
const fetch = async (url, options) => {
  calls.fetches.push({ url, options });
  if (typeof overrides.fetchImpl === 'function') {
    return overrides.fetchImpl(url, options);
  }
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, email: 'relay@icloud.com' }),
  };
};
function getHotmailServiceSettings(state = {}) {
  return {
    localBaseUrl: normalizeHotmailLocalBaseUrl(state.hotmailLocalBaseUrl),
  };
}
async function getState() {
  return overrides.state || { hotmailLocalBaseUrl: DEFAULT_HOTMAIL_LOCAL_BASE_URL, icloudAppleIdPassword: '' };
}
async function addLog(message, level = 'info') {
  calls.logs.push({ message, level });
}
async function setEmailState(email) {
  calls.emailStates.push(email);
}
function broadcastIcloudAliasesChanged(payload) {
  calls.broadcasts.push(payload);
}
function throwIfStopped() {}
${bundle}
return {
  calls,
  fetchIcloudHideMyEmailLocally,
};
`)(overrides);
}

test('local icloud helper path creates alias on macOS and stores email', async () => {
  const harness = createHarness({
    state: {
      hotmailLocalBaseUrl: 'http://127.0.0.1:17373',
      icloudAppleIdPassword: 'saved-password',
    },
  });

  const email = await harness.fetchIcloudHideMyEmailLocally(null, {});

  assert.equal(email, 'relay@icloud.com');
  assert.deepEqual(harness.calls.emailStates, ['relay@icloud.com']);
  assert.equal(harness.calls.fetches.length, 1);
  assert.match(harness.calls.fetches[0].url, /\/icloud\/create-hide-my-email$/);
  assert.deepEqual(harness.calls.broadcasts, [{ reason: 'created-local', email: 'relay@icloud.com' }]);
});

test('local icloud helper path rejects non-macOS environments', async () => {
  const harness = createHarness({
    chrome: {
      runtime: {
        getPlatformInfo: async () => ({ os: 'win' }),
      },
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /仅支持 macOS/
  );
  assert.equal(harness.calls.fetches.length, 0);
});

test('local icloud helper path surfaces helper connectivity errors', async () => {
  const harness = createHarness({
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:17373');
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /无法连接本地 helper/
  );
});

test('local icloud helper path surfaces clear password-missing errors', async () => {
  const harness = createHarness({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        ok: false,
        error: '本地 iCloud 方案遇到 Apple ID 密码确认框，但未配置 Apple ID 密码。请在侧边栏填写后重试。',
      }),
    }),
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /未配置 Apple ID 密码/
  );
});
