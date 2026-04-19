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

test('executeStep2 retries same signup entry after navigation transport error', async () => {
  const api = new Function(`
const STANDALONE_SIGNUP_URL_CANDIDATES = ['https://chatgpt.com/'];
const STEP2_NAVIGATION_RECOVERY_MAX_ATTEMPTS = 3;
const STEP2_EXECUTE_RESPONSE_TIMEOUT_MS = 20000;
const calls = [];
const logs = [];
let sendCount = 0;

async function consumeStep2ForceFreshSignup() {
  return true;
}

async function consumeStep2SkipDirectCreateAccount() {
  return false;
}

async function addLog(message, level) {
  logs.push({ message, level });
}

async function reuseOrCreateTab(source, url) {
  calls.push({ type: 'reuseOrCreateTab', source, url });
}

function isRetryableContentScriptTransportError(error) {
  return /port closed before a response was received/i.test(String(error?.message || error));
}

async function sendToContentScript(source, message, options) {
  sendCount += 1;
  calls.push({
    type: 'sendToContentScript',
    source,
    payload: { ...message.payload },
    responseTimeoutMs: options?.responseTimeoutMs,
  });

  if (sendCount === 1) {
    throw new Error('The message port closed before a response was received.');
  }

  return { ok: true };
}

${extractFunction('executeStep2')}

return {
  executeStep2,
  getCalls() { return calls.slice(); },
  getLogs() { return logs.slice(); },
};
`)();

  await api.executeStep2({});

  const sendCalls = api.getCalls().filter((entry) => entry.type === 'sendToContentScript');
  assert.equal(sendCalls.length, 2, '应先发一次原始 step2，再在导航恢复后重发一次');
  assert.deepStrictEqual(
    sendCalls.map((entry) => entry.payload),
    [
      { forceFreshSignup: true, navigationRecovery: false },
      { forceFreshSignup: false, navigationRecovery: true },
    ],
    '恢复重试时必须关闭 forceFreshSignup，并显式标记 navigationRecovery'
  );
  assert.ok(
    sendCalls.every((entry) => entry.responseTimeoutMs === 20000),
    'step2 执行应使用专门的响应超时预算'
  );

  assert.ok(
    api.getCalls().filter((entry) => entry.type === 'sendToContentScript').length === 2,
    '遇到导航型 transport error 后应在同一候选入口上重新发送 step2 指令'
  );

  assert.ok(
    api.getLogs().some((entry) => /发生跳转，正在等待新页面恢复并继续执行/.test(entry.message)),
    '应输出一条导航恢复日志，方便定位“点击后整页跳转”的场景'
  );
});
