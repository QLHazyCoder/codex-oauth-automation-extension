const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const duckSource = fs.readFileSync('content/duck-mail.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(source, name) {
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

test('fetchDuckEmail retries once and accepts a new address on the second click', async () => {
  const api = new Function(`
let currentEmail = 'old@duck.com';
let clickCount = 0;
const logs = [];
const input = {
  get value() {
    return currentEmail;
  },
  set value(nextValue) {
    currentEmail = nextValue;
  },
};
const button = {
  click() {
    clickCount += 1;
    if (clickCount === 2) {
      currentEmail = 'new@duck.com';
    }
  },
};
const document = {
  querySelector(selector) {
    if (selector === 'input.AutofillSettingsPanel__PrivateDuckAddressValue') return input;
    if (selector === 'button.AutofillSettingsPanel__GeneratorButton') return button;
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
async function waitForElement() { return button; }
async function sleep() {}
async function humanPause() {}
function log(message, type) {
  logs.push({ message, type: type || 'info' });
}
${extractFunction(duckSource, 'fetchDuckEmail')}
return {
  fetchDuckEmail,
  snapshot() {
    return { currentEmail, clickCount, logs };
  },
};
`)();

  const result = await api.fetchDuckEmail({ generateNew: true });
  const snapshot = api.snapshot();

  assert.deepEqual(result, { email: 'new@duck.com', generated: true });
  assert.equal(snapshot.clickCount, 2);
  assert.ok(
    snapshot.logs.some((entry) => entry.message.includes('首次生成后地址未变化，准备重试一次')),
    '第一次点击未拿到新地址时应记录一次重试日志'
  );
});

test('fetchDuckEmail marks the error as fatal after two unchanged generation attempts', async () => {
  const api = new Function(`
let currentEmail = 'old@duck.com';
let clickCount = 0;
const input = {
  get value() {
    return currentEmail;
  },
};
const button = {
  click() {
    clickCount += 1;
  },
};
const document = {
  querySelector(selector) {
    if (selector === 'input.AutofillSettingsPanel__PrivateDuckAddressValue') return input;
    if (selector === 'button.AutofillSettingsPanel__GeneratorButton') return button;
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
async function waitForElement() { return button; }
async function sleep() {}
async function humanPause() {}
function log() {}
${extractFunction(duckSource, 'fetchDuckEmail')}
return {
  fetchDuckEmail,
  snapshot() {
    return { clickCount };
  },
};
`)();

  let thrown = null;
  try {
    await api.fetchDuckEmail({ generateNew: true });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error, '两次点击后仍未拿到新地址时应抛错');
  assert.equal(thrown?.fatal, true);
  assert.match(thrown?.message || '', /点击 2 次后仍未获得新的 Duck 地址/);
  assert.equal(api.snapshot().clickCount, 2);
});

test('ensureAutoEmailReady stops the auto flow immediately when duck generation reports fatal', async () => {
  const api = new Function(`
let fetchAttempts = 0;
let waitedForResume = false;
const requestStopCalls = [];
const logMessages = [];
async function getState() {
  return { email: '', emailGenerator: 'duck' };
}
function isHotmailProvider() {
  return false;
}
function normalizeEmailGenerator(value) {
  return value || 'duck';
}
function getEmailGeneratorLabel() {
  return 'Duck 邮箱';
}
async function fetchGeneratedEmail() {
  fetchAttempts += 1;
  const error = new Error('duck fatal');
  error.duckFatal = true;
  throw error;
}
async function addLog(message, type) {
  logMessages.push({ message, type });
}
function isDuckEmailFatalError(error) {
  return Boolean(error?.duckFatal);
}
async function requestStop(options = {}) {
  requestStopCalls.push(options);
}
async function broadcastAutoRunStatus() {
  throw new Error('duck fatal should not fall through to waiting_email');
}
async function waitForResume() {
  waitedForResume = true;
}
async function ensureHotmailAccountForFlow() {
  throw new Error('should not allocate hotmail account');
}
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const EMAIL_FETCH_MAX_ATTEMPTS = 5;
${extractFunction(backgroundSource, 'ensureAutoEmailReady')}
return {
  ensureAutoEmailReady,
  snapshot() {
    return { fetchAttempts, waitedForResume, requestStopCalls, logMessages };
  },
};
`)();

  await assert.rejects(
    () => api.ensureAutoEmailReady(2, 5, 3),
    /流程已被用户停止。/
  );

  const snapshot = api.snapshot();
  assert.equal(snapshot.fetchAttempts, 1);
  assert.equal(snapshot.waitedForResume, false);
  assert.equal(snapshot.requestStopCalls.length, 1);
  assert.match(
    snapshot.requestStopCalls[0]?.logMessage || '',
    /Duck 邮箱生成失败，已立即停止自动流程/
  );
});
