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

test('waitForVerificationSubmitOutcome recovers signup retry page after submit', async () => {
  const api = new Function(`
let retryVisible = true;
let step5Ready = false;
let recoverCalls = 0;
const location = { href: 'https://auth.openai.com/email-verification' };

function throwIfStopped() {}
function log() {}
function getVerificationErrorText() { return ''; }
function isStep5Ready() { return step5Ready; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return false; }
function createSignupUserAlreadyExistsError() {
  return new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
}
function createSignupPhonePasswordMismatchError(detailText = '') {
  return new Error('SIGNUP_PHONE_PASSWORD_MISMATCH::' + detailText);
}
function createSignupPhoneAlreadyExistsError(detailText = '') {
  return new Error('SIGNUP_PHONE_ALREADY_EXISTS::' + detailText);
}
function getCurrentAuthRetryPageState(flow) {
  if (flow === 'signup' && retryVisible) {
    return {
      retryEnabled: true,
      userAlreadyExistsBlocked: false,
    };
  }
  return null;
}
async function recoverCurrentAuthRetryPage() {
  recoverCalls += 1;
  retryVisible = false;
  step5Ready = true;
}
async function sleep() {}

${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('waitForVerificationSubmitOutcome')}

return {
  run() {
    return waitForVerificationSubmitOutcome(4, 1000);
  },
  snapshot() {
    return { recoverCalls };
  },
};
`)();

  const result = await api.run();

  assert.deepStrictEqual(result, { success: true });
  assert.equal(api.snapshot().recoverCalls, 1);
});

test('waitForVerificationSubmitOutcome does not assume success after repeated signup retry pages', async () => {
  const api = new Function(`
let recoverCalls = 0;
const location = { href: 'https://auth.openai.com/email-verification' };

function throwIfStopped() {}
function log() {}
function getVerificationErrorText() { return ''; }
function isStep5Ready() { return false; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return false; }
function createSignupUserAlreadyExistsError() {
  return new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
}
function getCurrentAuthRetryPageState(flow) {
  if (flow === 'signup') {
    return {
      retryEnabled: true,
      userAlreadyExistsBlocked: false,
    };
  }
  return null;
}
async function recoverCurrentAuthRetryPage() {
  recoverCalls += 1;
}
async function sleep() {}

${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('waitForVerificationSubmitOutcome')}

return {
  run() {
    return waitForVerificationSubmitOutcome(4, 1000);
  },
  snapshot() {
    return { recoverCalls };
  },
};
`)();

  await assert.rejects(
    api.run(),
    /连续进入认证重试页 2 次，页面仍未恢复/
  );
  assert.equal(api.snapshot().recoverCalls, 2);
});

test('waitForVerificationSubmitOutcome marks step 5 skipped when step 4 already lands on chatgpt home', async () => {
  const api = new Function(`
const location = { href: 'https://chatgpt.com/' };

function throwIfStopped() {}
function log() {}
function getVerificationErrorText() { return ''; }
function isStep5Ready() { return false; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return false; }
function createSignupUserAlreadyExistsError() {
  return new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
}
function getCurrentAuthRetryPageState() {
  return null;
}
async function recoverCurrentAuthRetryPage() {
  throw new Error('should not recover retry page');
}
async function sleep() {}

${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('waitForVerificationSubmitOutcome')}

return {
  run() {
    return waitForVerificationSubmitOutcome(4, 1000);
  },
};
`)();

  const result = await api.run();

  assert.deepStrictEqual(result, {
    success: true,
    skipProfileStep: true,
    url: 'https://chatgpt.com/',
  });
});

test('prepareSignupVerificationFlow restarts current attempt when password page shows phone already exists', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
let now = 0;

Date.now = () => now;

let retryVisible = false;
const location = {
  href: 'https://auth.openai.com/create-account/password',
  pathname: '/create-account/password',
};

function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function sleep(ms = 0) { now += ms || 200; }
function getVerificationErrorText() { return ''; }
function isStep5Ready() { return false; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return false; }
function isDocumentLoadComplete() { return true; }
function isVisibleElement() { return true; }
function isActionEnabled() { return true; }
function getActionText(el) { return el?.textContent || ''; }
function createSignupUserAlreadyExistsError() {
  return new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
}
function createSignupPhonePasswordMismatchError(detailText = '') {
  return new Error('SIGNUP_PHONE_PASSWORD_MISMATCH::' + detailText);
}
function createSignupPhoneAlreadyExistsError(detailText = '') {
  return new Error('SIGNUP_PHONE_ALREADY_EXISTS::' + detailText);
}
function getCurrentAuthRetryPageState() { return null; }
function getSignupPasswordInput() { return { value: 'Secret123!' }; }
function getSignupPasswordSubmitButton() { return { textContent: 'Continue' }; }
function getSignupPasswordFieldErrorText() { return 'An account for this phone number already exists'; }
const SIGNUP_PHONE_ALREADY_EXISTS_PATTERN = /an\s+account\s+for\s+this\s+phone\s+number\s+already\s+exists|phone\s+number\s+already\s+exists|account\s+for\s+this\s+phone\s+number\s+already\s+exists|this\s+phone\s+number\s+already\s+exists|phone\s+number.*already\s+exists/i;
function isSignupPhoneAlreadyExistsErrorText(text) {
  const normalized = String(text || '').toLowerCase();
  return normalized.includes('already exists')
    && (normalized.includes('phone') || normalized.includes('account'));
}
function getSignupPasswordTimeoutErrorPageState() { return null; }
function isSignupEmailAlreadyExistsPage() { return false; }
function isSignupPasswordErrorPage() { return false; }
function getVerificationCodeTarget() { return null; }
function simulateClick(target) { clicks.push(target?.textContent || 'clicked'); }
async function humanPause() {}
function fillInput() {}
function logSignupPasswordDiagnostics() {}
function getStep4PostVerificationState() { return null; }

${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('isSignupVerificationPageInteractiveReady')}
${extractFunction('waitForSignupVerificationTransition')}
${extractFunction('inspectSignupVerificationState')}
${extractFunction('prepareSignupVerificationFlow')}

return {
  async run() {
    try {
      await prepareSignupVerificationFlow({
        password: 'Secret123!',
        prepareLogLabel: '步骤 3 收尾',
      }, 10000);
      return { threw: false, logs };
    } catch (error) {
      return { threw: true, error: error.message, logs };
    }
  },
};
`)();

  const result = await api.run();

  assert.equal(result.threw, true);
  assert.match(result.error, /SIGNUP_PHONE_ALREADY_EXISTS::An account for this phone number already exists/);
  assert.equal(
    result.logs.some(({ message }) => /检测到“手机号已存在”报错，准备直接回到步骤 1 重开当前轮/.test(message)),
    true
  );
});

test('waitForVerificationSubmitOutcome treats step 5 as success after submit even when verification ui residue remains', async () => {
  const api = new Function(`
const location = { href: 'https://auth.openai.com/email-verification/register' };

function throwIfStopped() {}
function log() {}
function getVerificationErrorText() { return ''; }
function isStep5Ready() { return true; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return true; }
function createSignupUserAlreadyExistsError() {
  return new Error('SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。');
}
function getCurrentAuthRetryPageState() {
  return null;
}
async function recoverCurrentAuthRetryPage() {
  throw new Error('should not recover retry page');
}
async function sleep() {}

${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('waitForVerificationSubmitOutcome')}

return {
  run() {
    return waitForVerificationSubmitOutcome(4, 1000);
  },
};
`)();

  const result = await api.run();

  assert.deepStrictEqual(result, {
    success: true,
  });
});
