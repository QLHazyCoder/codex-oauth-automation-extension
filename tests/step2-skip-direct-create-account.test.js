const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for ${name}`);

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

test('executeStep2 skips direct create-account candidates after invalid_state restart marker', async () => {
  const api = new Function(`
const STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY = 'skipDirectCreateAccountForNextStep2';
const STEP2_EXECUTE_RESPONSE_TIMEOUT_MS = 20000;
const STEP2_NAVIGATION_RECOVERY_MAX_ATTEMPTS = 3;
const STANDALONE_SIGNUP_URL_CANDIDATES = [
  'https://chatgpt.com/',
  'https://auth.openai.com/log-in-or-create-account',
  'https://auth.openai.com/sign-up',
  'https://auth.openai.com/signup',
  'https://accounts.openai.com/sign-up',
  'https://accounts.openai.com/create-account',
  'https://auth.openai.com/create-account',
];
let store = {};
const opened = [];
const logs = [];
let sendCount = 0;
const chrome = {
  storage: {
    session: {
      async set(payload) { store = { ...store, ...payload }; },
      async get(key) {
        if (Array.isArray(key)) {
          const out = {};
          for (const item of key) out[item] = store[item];
          return out;
        }
        return { [key]: store[key] };
      },
      async remove(key) { delete store[key]; },
    },
  },
};
const LOG_PREFIX = '[test]';
function getErrorMessage(error) { return error?.message || String(error); }
async function consumeStep2ForceFreshSignup() { return false; }
async function addLog(message, level) { logs.push({ message, level }); }
async function reuseOrCreateTab(source, url) { opened.push(url); }
function isRetryableContentScriptTransportError() { return false; }
async function sendToContentScript() {
  sendCount += 1;
  return sendCount === 1
    ? { needsAlternateSignupEntry: true, reason: 'chatgpt none' }
    : { ok: true };
}

${extractFunction('markStep2SkipDirectCreateAccount')}
${extractFunction('consumeStep2SkipDirectCreateAccount')}
${extractFunction('executeStep2')}

return {
  markStep2SkipDirectCreateAccount,
  executeStep2,
  getOpened() { return opened.slice(); },
  getLogs() { return logs.slice(); },
  getStore() { return { ...store }; },
};
`)();

  await api.markStep2SkipDirectCreateAccount();
  await api.executeStep2({});

  assert.deepStrictEqual(
    api.getOpened(),
    [
      'https://chatgpt.com/',
      'https://auth.openai.com/log-in-or-create-account',
    ],
    'invalid_state 重启后的下一轮 step2 应跳过所有 direct create-account 入口，优先尝试 log-in-or-create-account'
  );
  assert.ok(
    api.getLogs().some((entry) => /跳过 direct create-account/.test(entry.message)),
    '应输出一条跳过 direct create-account 的告警日志，便于后续排查'
  );
  assert.equal(
    'skipDirectCreateAccountForNextStep2' in api.getStore(),
    false,
    'skip 标记应为一次性消费，执行 step2 后必须被清除'
  );
});
