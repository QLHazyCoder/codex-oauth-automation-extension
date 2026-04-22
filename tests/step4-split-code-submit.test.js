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
