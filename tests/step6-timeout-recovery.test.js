const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (char === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('step 7 timeout recoverable result clicks retry before asking background to rerun', async () => {
  const api = new Function(`
const logs = [];
let recoverCalls = 0;

const location = {
  href: 'https://auth.openai.com/log-in',
};

function inspectLoginAuthState() {
  return {
    state: 'login_timeout_error_page',
    url: location.href,
  };
}

async function recoverCurrentAuthRetryPage() {
  recoverCalls += 1;
  return { recovered: true };
}

function log(message, level = 'info') {
  logs.push({ message, level });
}

${extractFunction('createStep6RecoverableResult')}
${extractFunction('normalizeStep6Snapshot')}
${extractFunction('createStep6LoginTimeoutRecoverableResult')}

return {
  async run() {
    return createStep6LoginTimeoutRecoverableResult(
      'login_timeout_error_page',
      { state: 'login_timeout_error_page', url: location.href },
      '当前页面处于登录超时报错页。'
    );
  },
  snapshot() {
    return { logs, recoverCalls };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.equal(snapshot.recoverCalls, 1);
  assert.equal(result.step6Outcome, 'recoverable');
  assert.equal(result.reason, 'login_timeout_error_page');
  assert.equal(result.state, 'login_timeout_error_page');
  assert.equal(result.message, '当前页面处于登录超时报错页。');
});

test('step 7 finalize converts verification page that falls into retry page into recoverable result', async () => {
  const api = new Function(`
const logs = [];
let recoverCalls = 0;
let currentState = 'verification_page';

const location = {
  href: 'https://auth.openai.com/email-verification',
};

function inspectLoginAuthState() {
  return {
    state: currentState,
    url: location.href,
  };
}

async function recoverCurrentAuthRetryPage() {
  recoverCalls += 1;
  return { recovered: true };
}

async function sleep() {
  currentState = 'login_timeout_error_page';
}

function log(message, level = 'info') {
  logs.push({ message, level });
}

function throwIfStopped() {}

function getLoginAuthStateLabel(snapshot) {
  switch (snapshot?.state) {
    case 'verification_page':
      return '登录验证码页';
    case 'login_timeout_error_page':
      return '登录超时报错页';
    default:
      return '未知页面';
  }
}

${extractFunction('createStep6SuccessResult')}
${extractFunction('createStep6RecoverableResult')}
${extractFunction('normalizeStep6Snapshot')}
${extractFunction('createStep6LoginTimeoutRecoverableResult')}
${extractFunction('finalizeStep6VerificationReady')}

return {
  async run() {
    return finalizeStep6VerificationReady({
      logLabel: '步骤 7 收尾',
      loginVerificationRequestedAt: 123,
      via: 'password_submit',
    });
  },
  snapshot() {
    return { logs, recoverCalls };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.equal(snapshot.recoverCalls, 1);
  assert.equal(result.step6Outcome, 'recoverable');
  assert.equal(result.reason, 'login_timeout_error_page');
  assert.equal(result.state, 'login_timeout_error_page');
  assert.equal(result.message, '登录验证码页面准备就绪前进入登录超时报错页。');
});

test('waitForLoginVerificationPageReady reports login timeout page without step8 restart prefix', async () => {
  const api = new Function(`
const location = {
  href: 'https://auth.openai.com/email-verification',
};

function inspectLoginAuthState() {
  return {
    state: 'login_timeout_error_page',
    url: location.href,
  };
}

function throwIfStopped() {}
async function sleep() {}

function getLoginAuthStateLabel(snapshot) {
  return snapshot?.state === 'login_timeout_error_page' ? '登录超时报错页' : '未知页面';
}

${extractFunction('waitForLoginVerificationPageReady')}

return {
  run() {
    return waitForLoginVerificationPageReady(10);
  },
};
`)();

  await assert.rejects(
    () => api.run(),
    /当前未进入登录验证码页面，请先重新完成步骤 7。当前状态：登录超时报错页。URL: https:\/\/auth\.openai\.com\/email-verification/
  );
});
