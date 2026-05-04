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

test('fillVerificationCode submits after split inputs are stably filled', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
const filledValues = [];
let submitClicked = false;
const VERIFICATION_CODE_INPUT_SELECTOR = 'input[data-verification-code]';
const location = { href: 'https://auth.openai.com/email-verification' };
function KeyboardEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}

const submitBtn = {
  tagName: 'BUTTON',
  textContent: 'Continue',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'submit';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  click() {
    submitClicked = true;
  },
};

const inputs = Array.from({ length: 6 }, () => ({
  value: '',
  maxLength: 1,
  getAttribute(name) {
    if (name === 'maxlength') return '1';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  focus() {},
  dispatchEvent() {},
  closest() { return null; },
}));

const document = {
  querySelector(selector) {
    if (selector === VERIFICATION_CODE_INPUT_SELECTOR) return inputs[0];
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'input[maxlength="1"]') return inputs;
    if (selector === 'button[type="submit"], input[type="submit"]') return [submitBtn];
    if (selector === 'button, [role="button"], input[type="button"], input[type="submit"]') return [submitBtn];
    return [];
  },
};

function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function waitForLoginVerificationPageReady() {}
function is405MethodNotAllowedPage() { return false; }
async function handle405ResendError() {}
function fillInput(el, value) {
  el.value = value;
  filledValues.push(value);
}
async function sleep() {}
async function waitForDocumentLoadComplete() {}
function isStep5Ready() { return false; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVerificationPageStillVisible() { return false; }
function isEmailVerificationPage() { return true; }
function isVisibleElement() { return true; }
function isActionEnabled(el) { return Boolean(el) && !el.disabled; }
function getActionText(el) { return el.textContent || ''; }
async function humanPause() {}
function simulateClick(el) { el.click(); clicks.push(el.textContent); }
async function waitForVerificationSubmitOutcome() { return { success: true }; }

${extractFunction('getVisibleSplitVerificationInputs')}
${extractFunction('getVerificationCodeTarget')}
${extractFunction('getVerificationSubmitButtonForTarget')}
${extractFunction('waitForVerificationSubmitButton')}
${extractFunction('waitForVerificationCodeTarget')}
${extractFunction('waitForSplitVerificationInputsFilled')}
${extractFunction('isCombinedSignupVerificationProfilePage')}
${extractFunction('waitForCombinedSignupVerificationProfilePage')}
${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('fillVerificationCode')}

return {
  run() {
    return fillVerificationCode(4, { code: '123456' });
  },
  snapshot() {
    return {
      logs,
      clicks,
      filledValues,
      submitClicked,
      currentValue: inputs.map((input) => input.value).join(''),
    };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.deepStrictEqual(result, { success: true });
  assert.equal(snapshot.currentValue, '123456');
  assert.equal(snapshot.submitClicked, true);
  assert.deepStrictEqual(snapshot.clicks, ['Continue']);
});

test('fillVerificationCode does not short-circuit on mixed email-verification profile page before verification exits', async () => {
  const api = new Function(`
const logs = [];
const location = { href: 'https://auth.openai.com/email-verification/register' };

function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function waitForLoginVerificationPageReady() {}
function is405MethodNotAllowedPage() { return false; }
async function handle405ResendError() {}
function fillInput() {}
async function sleep() {}
async function waitForDocumentLoadComplete() {}
function isStep5Ready() { return true; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVisibleElement() { return true; }
function isActionEnabled() { return true; }
function getActionText(el) { return el?.textContent || ''; }
async function humanPause() {}
function simulateClick() {}
function getCurrentAuthRetryPageState() { return null; }
function isPhoneVerificationPageReady() { return false; }
function getVerificationCodeTarget() { return { type: 'single', element: { value: '', form: null, closest() { return null; } } }; }
function findResendVerificationCodeTrigger() { return { textContent: 'Resend' }; }
function isEmailVerificationPage() { return true; }
function getPageTextSnapshot() { return 'Enter the verification code we just sent'; }

const document = {
  querySelector(selector) {
    if (selector === 'form[action*="email-verification" i]') return {};
    return null;
  },
  querySelectorAll() {
    return [];
  },
};

${extractFunction('isVerificationPageStillVisible')}
${extractFunction('isCombinedSignupVerificationProfilePage')}
${extractFunction('waitForCombinedSignupVerificationProfilePage')}
${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('fillVerificationCode')}

return {
  async run() {
    try {
      await fillVerificationCode(4, { code: '123456' });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: String(error?.message || error) };
    }
  },
};
`)();

  const result = await api.run();
  assert.deepStrictEqual(result, {
    ok: false,
    message: '未找到验证码输入框。URL: https://auth.openai.com/email-verification/register',
  });
});

test('fillVerificationCode prefills profile on combined verification/register page and skips step 5 after success', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
const filledValues = [];
let submitClicked = false;
const VERIFICATION_CODE_INPUT_SELECTOR = 'input[name="code"]';
const location = {
  href: 'https://auth.openai.com/email-verification/register',
  pathname: '/email-verification/register',
};
function KeyboardEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}

const nameInput = {
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'name') return 'name';
    if (name === 'autocomplete') return 'name';
    return '';
  },
};
const ageInput = {
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'name') return 'age';
    return '';
  },
};
const codeInput = {
  value: '',
  disabled: false,
  form: null,
  getAttribute(name) {
    if (name === 'maxlength') return '6';
    if (name === 'aria-disabled') return 'false';
    if (name === 'name') return 'code';
    return '';
  },
  closest() { return null; },
  focus() {},
  dispatchEvent() {},
};
const submitBtn = {
  tagName: 'BUTTON',
  textContent: 'Continue',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'submit';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  click() {
    submitClicked = true;
  },
};

const document = {
  querySelector(selector) {
    switch (selector) {
      case 'input[name="name"], input[autocomplete="name"], input[name="birthday"], input[name="age"], [role="spinbutton"][data-type="year"]':
        return nameInput;
      case 'input[name="name"], input[placeholder*="全名"], input[autocomplete="name"]':
        return nameInput;
      case 'input[name="age"]':
        return ageInput;
      case '[role="spinbutton"][data-type="year"]':
      case '[role="spinbutton"][data-type="month"]':
      case '[role="spinbutton"][data-type="day"]':
      case 'input[name="birthday"]':
        return null;
      case 'form[action*="email-verification/register" i]':
      case 'form[action*="email-verification" i]':
        return { action: '/email-verification/register' };
      case VERIFICATION_CODE_INPUT_SELECTOR:
        return codeInput;
      case 'button[type="submit"]':
        return submitBtn;
      default:
        return null;
    }
  },
  querySelectorAll(selector) {
    if (selector === 'input[maxlength="1"]') return [];
    if (selector === 'button[type="submit"], input[type="submit"]') return [submitBtn];
    if (selector === 'button, [role="button"], input[type="button"], input[type="submit"]') return [submitBtn];
    if (selector === 'input[name="allCheckboxes"][type="checkbox"]') return [];
    if (selector === 'input[type="checkbox"]') return [];
    return [];
  },
  execCommand() {},
};

function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function waitForLoginVerificationPageReady() {}
function is405MethodNotAllowedPage() { return false; }
async function handle405ResendError() {}
function fillInput(el, value) {
  el.value = value;
  filledValues.push({ target: el === nameInput ? 'name' : (el === ageInput ? 'age' : 'code'), value });
}
async function sleep() {}
async function waitForDocumentLoadComplete() {}
function isStep5Ready() { return true; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVisibleElement(el) { return Boolean(el) && !el.disabled; }
function isActionEnabled(el) { return Boolean(el) && !el.disabled; }
function getActionText(el) { return el.textContent || ''; }
async function humanPause() {}
function simulateClick(el) { el.click(); clicks.push(el.textContent); }
function getCurrentAuthRetryPageState() { return null; }
function isPhoneVerificationPageReady() { return false; }
function findResendVerificationCodeTrigger() { return null; }
function isEmailVerificationPage() { return true; }
function isCombinedSignupVerificationProfilePage() { return true; }
function getPageTextSnapshot() { return 'Create your account Enter the verification code we just sent Tell us about you'; }
function findBirthdayReactAriaSelect() { return null; }
async function setReactAriaBirthdaySelect() {}
async function waitForElement(selector) {
  if (/input\\[name=\"name\"\\]/.test(selector)) {
    return nameInput;
  }
  throw new Error('unexpected selector ' + selector);
}
async function waitForElementByText() { return submitBtn; }
function isStep5AllConsentText() { return false; }
function findStep5AllConsentCheckbox() { return null; }
function isStep5CheckboxChecked() { return false; }
async function waitForVerificationSubmitOutcome() {
  return { success: true, skipProfileStep: true };
}

${extractFunction('getStep5DirectCompletionPayload')}
${extractFunction('isVerificationPageStillVisible')}
${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('getVisibleSplitVerificationInputs')}
${extractFunction('getVerificationCodeTarget')}
${extractFunction('getVerificationSubmitButtonForTarget')}
${extractFunction('waitForVerificationSubmitButton')}
${extractFunction('waitForVerificationCodeTarget')}
${extractFunction('waitForSplitVerificationInputsFilled')}
${extractFunction('waitForCombinedSignupVerificationProfilePage')}
${extractFunction('step5_fillNameBirthday')}
${extractFunction('fillVerificationCode')}

return {
  run() {
    return fillVerificationCode(4, {
      code: '123456',
      signupProfile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        age: 22,
      },
    });
  },
  snapshot() {
    return {
      logs,
      clicks,
      filledValues,
      submitClicked,
      nameValue: nameInput.value,
      ageValue: ageInput.value,
      codeValue: codeInput.value,
    };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.deepStrictEqual(result, {
    success: true,
    skipProfileStep: true,
    skipProfileStepReason: 'combined_verification_profile',
  });
  assert.equal(snapshot.nameValue, 'Ada Lovelace');
  assert.equal(snapshot.ageValue, '22');
  assert.equal(snapshot.codeValue, '123456');
  assert.equal(snapshot.submitClicked, true);
  assert.deepStrictEqual(snapshot.clicks, ['Continue']);
});

test('fillVerificationCode waits for delayed combined profile fields before prefilling', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
let submitClicked = false;
let nameQueryCount = 0;
const VERIFICATION_CODE_INPUT_SELECTOR = 'input[name="code"]';
const location = {
  href: 'https://auth.openai.com/email-verification/register',
  pathname: '/email-verification/register',
};
function KeyboardEvent(type, init = {}) {
  this.type = type;
  Object.assign(this, init);
}

const nameInput = {
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'name') return 'name';
    if (name === 'autocomplete') return 'name';
    return '';
  },
};
const ageInput = {
  value: '',
  disabled: false,
  getAttribute(name) {
    if (name === 'name') return 'age';
    return '';
  },
};
const codeInput = {
  value: '',
  disabled: false,
  form: null,
  getAttribute(name) {
    if (name === 'maxlength') return '6';
    if (name === 'aria-disabled') return 'false';
    if (name === 'name') return 'code';
    return '';
  },
  closest() { return null; },
  focus() {},
  dispatchEvent() {},
};
const submitBtn = {
  tagName: 'BUTTON',
  textContent: 'Continue',
  disabled: false,
  getAttribute(name) {
    if (name === 'type') return 'submit';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  click() {
    submitClicked = true;
  },
};

const document = {
  querySelector(selector) {
    switch (selector) {
      case 'input[name="name"], input[autocomplete="name"]':
        nameQueryCount += 1;
        return nameQueryCount >= 3 ? nameInput : null;
      case 'input[name="name"], input[autocomplete="name"], input[name="birthday"], input[name="age"], [role="spinbutton"][data-type="year"]':
        nameQueryCount += 1;
        return nameQueryCount >= 3 ? nameInput : null;
      case 'input[name="name"], input[placeholder*="全名"], input[autocomplete="name"]':
        return nameInput;
      case 'input[name="age"]':
        return nameQueryCount >= 3 ? ageInput : null;
      case '[role="spinbutton"][data-type="year"]':
      case '[role="spinbutton"][data-type="month"]':
      case '[role="spinbutton"][data-type="day"]':
      case 'input[name="birthday"]':
        return null;
      case 'form[action*="email-verification/register" i]':
      case 'form[action*="email-verification" i]':
        return { action: '/email-verification/register' };
      case VERIFICATION_CODE_INPUT_SELECTOR:
        return codeInput;
      case 'button[type="submit"]':
        return submitBtn;
      default:
        return null;
    }
  },
  querySelectorAll(selector) {
    if (selector === 'input[maxlength="1"]') return [];
    if (selector === 'button[type="submit"], input[type="submit"]') return [submitBtn];
    if (selector === 'button, [role="button"], input[type="button"], input[type="submit"]') return [submitBtn];
    if (selector === 'input[name="allCheckboxes"][type="checkbox"]') return [];
    if (selector === 'input[type="checkbox"]') return [];
    return [];
  },
  execCommand() {},
};

function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function waitForLoginVerificationPageReady() {}
function is405MethodNotAllowedPage() { return false; }
async function handle405ResendError() {}
function fillInput(el, value) {
  el.value = value;
}
async function sleep() {}
async function waitForDocumentLoadComplete() {}
function isStep5Ready() { return false; }
function isStep8Ready() { return false; }
function isAddPhonePageReady() { return false; }
function isVisibleElement(el) { return Boolean(el) && !el.disabled; }
function isActionEnabled(el) { return Boolean(el) && !el.disabled; }
function getActionText(el) { return el.textContent || ''; }
async function humanPause() {}
function simulateClick(el) { el.click(); clicks.push(el.textContent); }
function getCurrentAuthRetryPageState() { return null; }
function isPhoneVerificationPageReady() { return false; }
function findResendVerificationCodeTrigger() { return null; }
function isEmailVerificationPage() { return true; }
function getPageTextSnapshot() { return 'Create your account Enter the verification code we just sent Tell us about you'; }
function findBirthdayReactAriaSelect() { return null; }
async function setReactAriaBirthdaySelect() {}
async function waitForElement(selector) {
  if (/input\\[name=\"name\"\\]/.test(selector)) {
    return nameInput;
  }
  throw new Error('unexpected selector ' + selector);
}
async function waitForElementByText() { return submitBtn; }
function isStep5AllConsentText() { return false; }
function findStep5AllConsentCheckbox() { return null; }
function isStep5CheckboxChecked() { return false; }
async function waitForVerificationSubmitOutcome() {
  return { success: true, skipProfileStep: true };
}

${extractFunction('getStep5DirectCompletionPayload')}
${extractFunction('isVerificationPageStillVisible')}
${extractFunction('isCombinedSignupVerificationProfilePage')}
${extractFunction('waitForCombinedSignupVerificationProfilePage')}
${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('getVisibleSplitVerificationInputs')}
${extractFunction('getVerificationCodeTarget')}
${extractFunction('getVerificationSubmitButtonForTarget')}
${extractFunction('waitForVerificationSubmitButton')}
${extractFunction('waitForVerificationCodeTarget')}
${extractFunction('waitForSplitVerificationInputsFilled')}
${extractFunction('step5_fillNameBirthday')}
${extractFunction('fillVerificationCode')}

return {
  run() {
    return fillVerificationCode(4, {
      code: '123456',
      signupProfile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        age: 22,
      },
    });
  },
  snapshot() {
    return {
      nameValue: nameInput.value,
      ageValue: ageInput.value,
      codeValue: codeInput.value,
      submitClicked,
      clicks,
      nameQueryCount,
    };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.deepStrictEqual(result, {
    success: true,
    skipProfileStep: true,
    skipProfileStepReason: 'combined_verification_profile',
  });
  assert.equal(snapshot.nameValue, 'Ada Lovelace');
  assert.equal(snapshot.ageValue, '22');
  assert.equal(snapshot.codeValue, '123456');
  assert.equal(snapshot.submitClicked, true);
  assert.equal(snapshot.nameQueryCount >= 3, true);
});

test('prepareSignupVerificationFlow waits for complete verification page before reporting ready', async () => {
  const api = new Function(`
const logs = [];
let now = 0;
let sleepCalls = 0;
let targetChecks = 0;
const location = {
  href: 'https://auth.openai.com/email-verification',
  pathname: '/email-verification',
};
const document = {
  readyState: 'loading',
  title: '',
  body: {
    textContent: 'Enter the verification code we just sent',
    innerText: 'Enter the verification code we just sent',
  },
  querySelector(selector) {
    if (selector === 'form[action*="email-verification" i]') {
      return {};
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [];
    }
    return [];
  },
};

Date.now = () => now;
function throwIfStopped() {}
function log(message, level = 'info') { logs.push({ message, level }); }
async function sleep(ms = 0) {
  sleepCalls += 1;
  now += ms || 200;
  if (sleepCalls >= 3) {
    document.readyState = 'complete';
  }
}
function isVisibleElement() { return true; }
function isActionEnabled() { return true; }
function getActionText(el) { return el?.textContent || ''; }
function getCurrentAuthRetryPageState() { return null; }
function isPhoneVerificationPageReady() { return false; }
function findResendVerificationCodeTrigger() { return null; }
function isEmailVerificationPage() { return true; }
function getPageTextSnapshot() { return document.body.textContent; }
function getVerificationCodeTarget() {
  targetChecks += 1;
  return document.readyState === 'complete'
    ? { type: 'single', element: { value: '' } }
    : null;
}
function is405MethodNotAllowedPage() { return false; }
async function recoverCurrentAuthRetryPage() {}
function createSignupUserAlreadyExistsError() { return new Error('user already exists'); }
function getSignupPasswordInput() { return null; }
function getSignupPasswordSubmitButton() { return null; }
function isSignupEmailAlreadyExistsPage() { return false; }
function isSignupPasswordErrorPage() { return false; }
function getSignupPasswordTimeoutErrorPageState() { return null; }
function isStep5Ready() { return false; }

const VERIFICATION_PAGE_PATTERN = /verification code/i;

${extractFunction('getDocumentReadyStateSnapshot')}
${extractFunction('isDocumentLoadComplete')}
${extractFunction('waitForDocumentLoadComplete')}
${extractFunction('isSignupVerificationPageInteractiveReady')}
${extractFunction('isVerificationPageStillVisible')}
${extractFunction('isSignupProfilePageUrl')}
${extractFunction('isLikelyLoggedInChatgptHomeUrl')}
${extractFunction('getStep4PostVerificationState')}
${extractFunction('inspectSignupVerificationState')}
${extractFunction('waitForVerificationCodeTarget')}
${extractFunction('waitForSignupVerificationTransition')}
${extractFunction('prepareSignupVerificationFlow')}

return {
  run() {
    return prepareSignupVerificationFlow({ prepareLogLabel: '步骤 4 执行' }, 10000);
  },
  snapshot() {
    return { logs, sleepCalls, targetChecks, readyState: document.readyState };
  },
};
`)();

  const result = await api.run();
  const snapshot = api.snapshot();

  assert.equal(result.ready, true);
  assert.equal(snapshot.readyState, 'complete');
  assert.equal(snapshot.sleepCalls >= 3, true);
  assert.equal(snapshot.targetChecks >= 1, true);
});
