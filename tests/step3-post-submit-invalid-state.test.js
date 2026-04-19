const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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

test('step3 deferred email-submit path reports invalid_state errors back to background', async () => {
  const api = new Function(`
const events = [];
const emailInput = { value: '', focus() {}, dispatchEvent() {} };
const submitBtn = { id: 'submit' };
const window = {
  setTimeout(fn) {
    Promise.resolve().then(fn);
    return 1;
  },
};
const location = { href: 'https://auth.openai.com/create-account' };
const document = {
  querySelector(selector) {
    return selector === 'button[type="submit"]' ? submitBtn : null;
  },
};

${extractFunction('step3_fillEmailPassword')}

function clearStep3RegisterError() {}
function isChooseAccountPickerVisible() { return false; }
function getInvalidStateErrorPageState() { return null; }
function isInvalidStateErrorPage() { return false; }
function getSignupPasswordInput() { return null; }
function getVisibleRegistrationEmailInput() { return emailInput; }
async function waitForElement() { throw new Error('waitForElement should not be called'); }
async function waitForStep3Surface() { throw new Error('waitForStep3Surface should not be called'); }
async function humanPause() {}
function fillInput(el, value) { el.value = value; events.push({ type: 'fill', value }); }
async function waitForElementByText() { return submitBtn; }
async function setPendingStep3PasswordStage(payload) { events.push({ type: 'setPending', payload }); }
function simulateClick(el) { events.push({ type: 'click', id: el.id || 'submit' }); }
function log(message, level) { events.push({ type: 'log', message, level }); }
async function maybeCompleteStep3InlineAfterEmailSubmit() {
  throw new Error('STEP3_INVALID_STATE_RESTART: 邮箱提交后点击继续直接落到 invalid_state');
}
function reportError(step, message) { events.push({ type: 'reportError', step, message }); }

return {
  step3_fillEmailPassword,
  getEvents() { return events.slice(); },
};
`)();

  const result = await api.step3_fillEmailPassword({
    email: 'cat@example.com',
    password: 'super-secret',
  });

  assert.deepStrictEqual(
    result,
    { emailStageSubmitted: true, url: 'https://auth.openai.com/create-account' },
    '邮箱阶段仍应先返回 emailStageSubmitted，让背景继续等待完成信号'
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  const reportErrorEvent = api.getEvents().find((entry) => entry.type === 'reportError');
  assert.deepStrictEqual(
    reportErrorEvent,
    {
      type: 'reportError',
      step: 3,
      message: 'STEP3_INVALID_STATE_RESTART: 邮箱提交后点击继续直接落到 invalid_state',
    },
    'post-submit invalid_state 必须通过 reportError(3, ...) 上报给 background，不能只写日志后挂住'
  );
});
