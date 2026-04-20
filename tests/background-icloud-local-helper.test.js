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
    extractFunction('getRuntimePlatformOs'),
    extractFunction('createIcloudNativeHostRequestId'),
    extractFunction('getIcloudNativeHostClientVersion'),
    extractFunction('sendNativeHostMessage'),
    extractFunction('getIcloudNativeHostTransportErrorMessage'),
    extractFunction('getIcloudNativeHostResponseErrorMessage'),
    extractFunction('getIcloudAliasLabel'),
    extractFunction('fetchIcloudHideMyEmailLocally'),
  ].join('\n');

  return new Function('overrides', `
const ICLOUD_NATIVE_MESSAGING_HOST_NAME = 'com.qlhazycoder.codex_oauth_automation_extension';
const ICLOUD_NATIVE_MESSAGING_PROTOCOL_VERSION = 1;
const ICLOUD_LOCAL_HELPER_TIMEOUT_MS = overrides.timeoutMs || 20;
const LOG_PREFIX = '[test]';
globalThis.crypto = { randomUUID: () => 'test-request-id' };
const calls = {
  logs: [],
  emailStates: [],
  broadcasts: [],
  nativeMessages: [],
};
const runtime = {
  lastError: null,
  getManifest: () => ({ version_name: 'Pro2.4', version: '2.4' }),
  getPlatformInfo: async () => ({ os: 'mac' }),
  sendNativeMessage: (hostName, payload, callback) => {
    calls.nativeMessages.push({ hostName, payload });
    if (typeof overrides.sendNativeMessageImpl === 'function') {
      return overrides.sendNativeMessageImpl({ runtime, hostName, payload, callback, calls });
    }
    callback({
      requestId: payload.requestId,
      ok: true,
      protocolVersion: 1,
      hostVersion: 'Pro2.4',
      result: { email: 'relay@icloud.com', createdAt: '2026-04-20T00:00:00.000Z' },
    });
  },
};
const chrome = overrides.chrome || { runtime };
async function getState() {
  return overrides.state || { icloudAppleIdPassword: '' };
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

test('manifest declares nativeMessaging permission for native host bridge', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('nativeMessaging'));
});

test('local icloud generation uses Native Messaging host and stores email on success', async () => {
  const harness = createHarness({
    state: {
      icloudAppleIdPassword: 'saved-password',
    },
  });

  const email = await harness.fetchIcloudHideMyEmailLocally(null, {});

  assert.equal(email, 'relay@icloud.com');
  assert.deepEqual(harness.calls.emailStates, ['relay@icloud.com']);
  assert.equal(harness.calls.nativeMessages.length, 1);
  assert.equal(harness.calls.nativeMessages[0].hostName, 'com.qlhazycoder.codex_oauth_automation_extension');
  assert.equal(harness.calls.nativeMessages[0].payload.type, 'icloud.createHideMyEmail');
  assert.deepEqual(harness.calls.broadcasts, [{ reason: 'created-local-native-host', email: 'relay@icloud.com' }]);
});

test('local icloud generation rejects non-macOS environments before calling the host', async () => {
  const harness = createHarness({
    chrome: {
      runtime: {
        getManifest: () => ({ version_name: 'Pro2.4' }),
        getPlatformInfo: async () => ({ os: 'win' }),
        sendNativeMessage: () => {
          throw new Error('should not be called');
        },
      },
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /仅支持 macOS/
  );
  assert.equal(harness.calls.nativeMessages.length, 0);
});

test('local icloud generation surfaces host-not-registered errors clearly', async () => {
  const harness = createHarness({
    sendNativeMessageImpl: ({ runtime, callback }) => {
      runtime.lastError = { message: 'Specified native messaging host not found.' };
      callback(undefined);
      runtime.lastError = null;
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /未找到已注册的本地宿主/
  );
});

test('local icloud generation surfaces protocol mismatch clearly', async () => {
  const harness = createHarness({
    sendNativeMessageImpl: ({ payload, callback }) => {
      callback({
        requestId: payload.requestId,
        ok: true,
        protocolVersion: 99,
        result: { email: 'relay@icloud.com' },
      });
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /协议不匹配/
  );
});

test('local icloud generation surfaces password-missing errors clearly', async () => {
  const harness = createHarness({
    sendNativeMessageImpl: ({ payload, callback }) => {
      callback({
        requestId: payload.requestId,
        ok: false,
        protocolVersion: 1,
        error: {
          code: 'APPLE_ID_PASSWORD_NOT_CONFIGURED',
          message: '本地 iCloud 方案遇到 Apple ID 密码确认框，但未配置 Apple ID 密码。请在侧边栏填写后重试。',
        },
      });
    },
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /未配置 Apple ID 密码/
  );
});

test('local icloud generation enforces a host timeout', async () => {
  const harness = createHarness({
    timeoutMs: 5,
    sendNativeMessageImpl: () => {},
  });

  await assert.rejects(
    () => harness.fetchIcloudHideMyEmailLocally(null, {}),
    /本地宿主响应超时/
  );
});
