const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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
  for (let i = start; i < source.length; i++) {
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
  for (; end < source.length; end++) {
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

const bundle = [
  extractFunction('getActionText'),
  extractFunction('isActionEnabled'),
  extractFunction('getElementTagName'),
  extractFunction('getElementType'),
  extractFunction('getActionForm'),
  extractFunction('isEmailVerificationForm'),
  extractFunction('isSubmitLikeAction'),
  extractFunction('getVerificationSubmitTriggerPriority'),
  extractFunction('findVerificationSubmitTrigger'),
].join('\n');

const api = new Function(`
const VERIFICATION_SUBMIT_BUTTON_PATTERN = /verify|confirm|submit|continue|确认|验证/i;
let currentCandidates = [];

const document = {
  querySelectorAll() {
    return currentCandidates;
  },
};

function isVisibleElement() {
  return true;
}

${bundle}

return {
  findVerificationSubmitTrigger,
  getVerificationSubmitTriggerPriority,
  setCandidates(candidates) {
    currentCandidates = candidates;
  },
};
`)();

function createElement({
  tagName,
  type = '',
  text = '',
  value = '',
  role = '',
  action = '',
  disabled = false,
  ariaDisabled = null,
}) {
  const attrs = new Map();
  if (type) attrs.set('type', type);
  if (role) attrs.set('role', role);

  const form = action
    ? {
      action,
      getAttribute(name) {
        return name === 'action' ? action : null;
      },
    }
    : null;

  return {
    tagName: tagName.toUpperCase(),
    textContent: text,
    value,
    disabled,
    form,
    getAttribute(name) {
      if (name === 'aria-disabled') return ariaDisabled;
      return attrs.has(name) ? attrs.get(name) : null;
    },
    closest(selector) {
      if (selector === 'form') return form;
      return null;
    },
  };
}

const unsafeSubmit = createElement({
  tagName: 'button',
  type: 'submit',
  text: 'Continue',
  action: '/email-verification',
});

const saferButton = createElement({
  tagName: 'button',
  type: 'button',
  text: 'Continue',
});

api.setCandidates([unsafeSubmit, saferButton]);

assert.strictEqual(
  api.findVerificationSubmitTrigger(),
  saferButton,
  '验证码提交入口应优先选择非 submit 的安全按钮，而不是直接 POST /email-verification 的 submit'
);

assert(
  api.getVerificationSubmitTriggerPriority(saferButton) > api.getVerificationSubmitTriggerPriority(unsafeSubmit),
  '安全按钮的优先级应高于 email-verification 表单 submit'
);

console.log('signup verification submit priority tests passed');
