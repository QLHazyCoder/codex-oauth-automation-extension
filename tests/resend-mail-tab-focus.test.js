const assert = require('assert');
const fs = require('fs');
const test = require('node:test');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0);
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

test('resolveVerificationStep refocuses mail tab after requesting a fresh code first', async () => {
  const bundle = [
    extractFunction('isStopError'),
    extractFunction('openOrFocusMailTab'),
    extractFunction('resolveVerificationStep'),
  ].join('\n');

  const api = new Function(`
const HOTMAIL_PROVIDER = 'hotmail-api';
const calls = [];

function getVerificationCodeStateKey(step) {
  return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
}
function throwIfStopped() {}
function getHotmailVerificationPollConfig() {
  return {};
}
function getVerificationCodeLabel(step) {
  return step === 4 ? '注册' : '登录';
}
function isStep7RestartFromStep6Error() {
  return false;
}
async function requestVerificationCodeResend(step) {
  calls.push(['resend', step]);
}
async function addLog(message) {
  calls.push(['log', message]);
}
async function pollFreshVerificationCode(step) {
  calls.push(['poll', step]);
  return { code: '123456', emailTimestamp: 1000 };
}
async function submitVerificationCode() {
  calls.push(['submit']);
  return { success: true };
}
async function setState(payload) {
  calls.push(['setState', payload]);
}
async function completeStepFromBackground(step, payload) {
  calls.push(['complete', step, payload]);
}
async function isTabAlive(source) {
  calls.push(['isTabAlive', source]);
  return true;
}
async function getTabId(source) {
  calls.push(['getTabId', source]);
  return 66;
}
async function reuseOrCreateTab() {
  throw new Error('should not navigate existing 2925 tab in this test');
}
const chrome = {
  tabs: {
    async update(tabId, payload) {
      calls.push(['tabs.update', tabId, payload]);
      return { id: tabId, ...payload };
    },
  },
};

${bundle}

return {
  resolveVerificationStep,
  snapshot() {
    return calls;
  },
};
`)();

  await api.resolveVerificationStep(
    4,
    {},
    { provider: '2925', source: 'mail-2925', url: 'https://2925.com/#/mailList', label: '2925 邮箱' },
    { requestFreshCodeFirst: true }
  );

  const calls = api.snapshot();
  const resendIndex = calls.findIndex((entry) => entry[0] === 'resend');
  const focusIndex = calls.findIndex((entry) => entry[0] === 'tabs.update' && entry[1] === 66 && entry[2]?.active === true);
  const pollIndex = calls.findIndex((entry) => entry[0] === 'poll');

  assert.ok(resendIndex >= 0, '应先请求重发验证码');
  assert.ok(focusIndex > resendIndex, '重发后应重新激活邮箱页');
  assert.ok(pollIndex > focusIndex, '激活邮箱页后才开始轮询');
});
