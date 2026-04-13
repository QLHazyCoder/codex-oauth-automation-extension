const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
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

async function testPollFreshVerificationCodeRethrowsStop() {
  const bundle = [
    extractFunction('isStopError'),
    extractFunction('throwIfStopped'),
    extractFunction('pollFreshVerificationCode'),
  ].join('\n');

  const api = new Function(`
let stopRequested = false;
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const HOTMAIL_PROVIDER = 'hotmail-api';
const VERIFICATION_POLL_MAX_ROUNDS = 5;
const logs = [];
let resendCalls = 0;

function getHotmailVerificationPollConfig() {
  return {};
}
async function pollHotmailVerificationCode() {
  throw new Error('hotmail path should not run in this test');
}
function getVerificationCodeStateKey(step) {
  return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
}
function getVerificationPollPayload(step, state, overrides = {}) {
  return {
    filterAfterTimestamp: 123,
    ...overrides,
  };
}
async function sendToMailContentScriptResilient() {
  throw new Error(STOP_ERROR_MESSAGE);
}
async function requestVerificationCodeResend() {
  resendCalls += 1;
}
async function addLog(message, level) {
  logs.push({ message, level });
}

${bundle}

return {
  pollFreshVerificationCode,
  snapshot() {
    return { logs, resendCalls };
  },
};
`)();

  let error = null;
  try {
    await api.pollFreshVerificationCode(7, {}, { provider: 'qq' }, {});
  } catch (err) {
    error = err;
  }

  const state = api.snapshot();
  assert.strictEqual(error?.message, '流程已被用户停止。', 'Stop 错误应原样向上抛出');
  assert.strictEqual(state.resendCalls, 0, 'Stop 后不应继续请求新的验证码');
  assert.deepStrictEqual(state.logs, [], 'Stop 后不应再记录普通失败或重试日志');
}

async function testResolveVerificationStepRethrowsStopFromFreshRequest() {
  const bundle = [
    extractFunction('isStopError'),
    extractFunction('resolveVerificationStep'),
  ].join('\n');

  const api = new Function(`
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const HOTMAIL_PROVIDER = 'hotmail-api';
const logs = [];
let pollCalls = 0;

function getVerificationCodeStateKey(step) {
  return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
}
function getHotmailVerificationPollConfig() {
  return {};
}
function getVerificationCodeLabel(step) {
  return step === 4 ? '注册' : '登录';
}
function isStep7RestartFromStep6Error() {
  return false;
}
async function requestVerificationCodeResend() {
  throw new Error(STOP_ERROR_MESSAGE);
}
async function addLog(message, level) {
  logs.push({ message, level });
}
async function pollFreshVerificationCode() {
  pollCalls += 1;
  return { code: '123456', emailTimestamp: Date.now() };
}
async function submitVerificationCode() {
  throw new Error('submit should not run in this test');
}
async function setState() {}
async function completeStepFromBackground() {}

${bundle}

return {
  resolveVerificationStep,
  snapshot() {
    return { logs, pollCalls };
  },
};
`)();

  let error = null;
  try {
    await api.resolveVerificationStep(7, {}, { provider: 'qq' }, { requestFreshCodeFirst: true });
  } catch (err) {
    error = err;
  }

  const state = api.snapshot();
  assert.strictEqual(error?.message, '流程已被用户停止。', '首次请求新验证码收到 Stop 后应立即终止');
  assert.strictEqual(state.pollCalls, 0, 'Stop 后不应继续进入邮箱轮询');
  assert.deepStrictEqual(state.logs, [], 'Stop 后不应追加降级日志');
}

(async () => {
  await testPollFreshVerificationCodeRethrowsStop();
  await testResolveVerificationStepRethrowsStopFromFreshRequest();
  console.log('verification stop propagation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
