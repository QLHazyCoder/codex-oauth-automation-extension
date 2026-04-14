const assert = require('assert');
const fs = require('fs');
const test = require('node:test');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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

test('waitForVerificationPageAfterResend waits until signup verification page becomes visible', async () => {
  const bundle = [
    extractFunction('waitForVerificationPageAfterResend'),
  ].join('\n');

  const api = new Function(`
let now = 0;
let verificationVisible = false;
const logs = [];
const location = { href: 'https://auth.openai.com/u/create-account/email-verification' };

function throwIfStopped() {}
async function prepareLoginCodeFlow() {
  throw new Error('step 4 should not call prepareLoginCodeFlow');
}
function getVerificationCodeTarget() {
  return null;
}
function isEmailVerificationPage() {
  return verificationVisible;
}
function isVerificationPageStillVisible() {
  return verificationVisible;
}
function log(message, level = 'info') {
  logs.push({ message, level });
}
async function sleep(ms) {
  now += ms;
  if (now >= 250) verificationVisible = true;
}

Date.now = () => now;

${bundle}

return {
  waitForVerificationPageAfterResend,
  snapshot() {
    return { logs };
  },
};
`)();

  const result = await api.waitForVerificationPageAfterResend(4, 2000);
  const state = api.snapshot();

  assert.deepStrictEqual(result, { ready: true, mode: 'verification_page' });
  assert.ok(
    state.logs.some((entry) => entry.message.includes('正在等待页面切回邮箱验证码页')),
    '应记录等待页面切换日志'
  );
  assert.ok(
    state.logs.some((entry) => entry.message.includes('已回到邮箱验证码页面')),
    '应记录页面恢复日志'
  );
});

test('waitForVerificationPageAfterResend returns restart signal for step 7', async () => {
  const bundle = [
    extractFunction('waitForVerificationPageAfterResend'),
  ].join('\n');

  const api = new Function(`
const restartSignal = {
  restartFromStep6: true,
  reason: 'login_timeout_error_page',
  url: 'https://auth.openai.com/u/login',
};
const location = { href: restartSignal.url };

function throwIfStopped() {}
async function prepareLoginCodeFlow() {
  return restartSignal;
}
function getVerificationCodeTarget() {
  return null;
}
function isEmailVerificationPage() {
  return false;
}
function isVerificationPageStillVisible() {
  return false;
}
function log() {}
async function sleep() {}

${bundle}

return { waitForVerificationPageAfterResend };
`)();

  const result = await api.waitForVerificationPageAfterResend(7, 2000);
  assert.deepStrictEqual(result, {
    restartFromStep6: true,
    reason: 'login_timeout_error_page',
    url: 'https://auth.openai.com/u/login',
  });
});
