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

test('signup password detector accepts create-account and phone login password paths', () => {
  const run = (pathname) => new Function('location', `
${extractFunction('isSignupPasswordPage')}
return isSignupPasswordPage();
`)({ pathname });

  assert.equal(run('/create-account/password'), true);
  assert.equal(run('/log-in/password'), true);
  assert.equal(run('/log-in'), false);
});

test('signup entry diagnostics summarizes current page inputs and visible actions', () => {
const api = new Function(`
const SIGNUP_ENTRY_TRIGGER_PATTERN = /免费注册|立即注册|注册|sign\\s*up|register|create\\s*account|create\\s+account/i;
const location = { href: 'https://chatgpt.com/' };
const document = {
  title: 'ChatGPT',
  readyState: 'complete',
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [
        {
          tagName: 'BUTTON',
          textContent: 'Get started',
          disabled: false,
          getBoundingClientRect() {
            return { width: 120, height: 40 };
          },
          getAttribute(name) {
            return name === 'type' ? 'button' : '';
          },
        },
        {
          tagName: 'A',
          textContent: 'Log in',
          disabled: false,
          getBoundingClientRect() {
            return { width: 96, height: 40 };
          },
          getAttribute() {
            return '';
          },
        },
      ];
    }
    return [];
  },
};

function isVisibleElement() {
  return true;
}

function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}

function getSignupEmailInput() {
  return null;
}

function getSignupPhoneInput() {
  return null;
}

function getSignupPasswordInput() {
  return null;
}

function findSignupUseEmailTrigger() {
  return null;
}

function getPageTextSnapshot() {
  return 'Welcome to ChatGPT. Try our latest models.';
}

${extractFunction('getSignupEntryDiagnostics')}

return {
  run() {
    return getSignupEntryDiagnostics();
  },
};
`)();

  const result = api.run();

  assert.equal(result.url, 'https://chatgpt.com/');
  assert.equal(result.title, 'ChatGPT');
  assert.equal(result.readyState, 'complete');
  assert.equal(result.hasEmailInput, false);
  assert.equal(result.hasPasswordInput, false);
  assert.equal(result.bodyContainsSignupText, false);
  assert.deepStrictEqual(result.signupLikeActions, []);
  assert.deepStrictEqual(result.visibleActions, [
    { tag: 'button', type: 'button', text: 'Get started', enabled: true },
    { tag: 'a', type: '', text: 'Log in', enabled: true },
  ]);
  assert.match(result.bodyTextPreview, /Welcome to ChatGPT/);
});

test('signup entry diagnostics captures hidden signup button style and blocking ancestor details', () => {
const api = new Function(`
const SIGNUP_ENTRY_TRIGGER_PATTERN = /免费注册|立即注册|注册|sign\\s*up|register|create\\s*account|create\\s+account/i;
const location = { href: 'https://chatgpt.com/' };
const hiddenSection = {
  tagName: 'DIV',
  id: 'mobile-cta',
  className: 'max-xs:hidden',
  hidden: false,
  parentElement: null,
  hasAttribute() {
    return false;
  },
  getAttribute(name) {
    if (name === 'aria-hidden') return '';
    return '';
  },
  getBoundingClientRect() {
    return { width: 0, height: 0 };
  },
  _style: {
    display: 'none',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  },
};
const hiddenSignupButton = {
  tagName: 'BUTTON',
  textContent: 'Sign up for free',
  disabled: false,
  className: 'signup-button',
  hidden: false,
  parentElement: hiddenSection,
  hasAttribute() {
    return false;
  },
  getBoundingClientRect() {
    return { width: 0, height: 0 };
  },
  getAttribute(name) {
    if (name === 'type') return '';
    if (name === 'aria-hidden') return '';
    return '';
  },
  _style: {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  },
};
const document = {
  title: 'ChatGPT',
  readyState: 'complete',
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [hiddenSignupButton];
    }
    return [];
  },
};
const window = {
  innerWidth: 390,
  innerHeight: 844,
  outerWidth: 390,
  outerHeight: 844,
  devicePixelRatio: 3,
  getComputedStyle(el) {
    return el?._style || {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    };
  },
};

function isVisibleElement(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0;
}

function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}

function getSignupEmailInput() {
  return null;
}

function getSignupPhoneInput() {
  return null;
}

function getSignupPasswordInput() {
  return null;
}

function findSignupUseEmailTrigger() {
  return null;
}

function getPageTextSnapshot() {
  return 'ChatGPT 登录';
}

${extractFunction('getSignupEntryDiagnostics')}

return {
  run() {
    return getSignupEntryDiagnostics();
  },
};
`)();

  const result = api.run();

  assert.deepStrictEqual(result.viewport, {
    innerWidth: 390,
    innerHeight: 844,
    outerWidth: 390,
    outerHeight: 844,
    devicePixelRatio: 3,
  });
  assert.deepStrictEqual(result.signupLikeActionCounts, {
    total: 1,
    visible: 0,
    hidden: 1,
  });
  assert.equal(result.signupLikeActions[0]?.text, 'Sign up for free');
  assert.equal(result.signupLikeActions[0]?.className, 'signup-button');
  assert.equal(result.signupLikeActions[0]?.display, 'block');
  assert.equal(result.signupLikeActions[0]?.blockingAncestor?.className, 'max-xs:hidden');
  assert.equal(result.signupLikeActions[0]?.blockingAncestor?.display, 'none');
});

test('signup password diagnostics summarizes password inputs, submit button, and alternate code entry', () => {
const api = new Function(`
const location = { href: 'https://auth.openai.com/create-account/password' };
const form = { action: 'https://auth.openai.com/u/signup/password' };
const passwordInput = {
  tagName: 'INPUT',
  type: 'password',
  name: 'new-password',
  id: 'password-field',
  value: 'SecretLength14',
  className: 'password-input',
  disabled: false,
  form,
  getBoundingClientRect() {
    return { width: 320, height: 44 };
  },
  getAttribute(name) {
    if (name === 'type') return 'password';
    if (name === 'name') return 'new-password';
    if (name === 'autocomplete') return 'new-password';
    if (name === 'placeholder') return 'Password';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  _style: {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  },
};
const submitButton = {
  tagName: 'BUTTON',
  textContent: 'Continue',
  className: 'submit-btn',
  disabled: false,
  form,
  getBoundingClientRect() {
    return { width: 160, height: 40 };
  },
  getAttribute(name) {
    if (name === 'type') return 'submit';
    if (name === 'aria-disabled') return 'false';
    if (name === 'data-dd-action-name') return 'Continue';
    return '';
  },
  _style: {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  },
};
const oneTimeCodeButton = {
  tagName: 'BUTTON',
  textContent: 'Use a one-time code instead',
  className: 'switch-btn',
  disabled: false,
  getBoundingClientRect() {
    return { width: 220, height: 36 };
  },
  getAttribute(name) {
    if (name === 'type') return 'button';
    if (name === 'aria-disabled') return 'false';
    return '';
  },
  _style: {
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
  },
};
const document = {
  title: 'Create your account',
  readyState: 'complete',
  querySelectorAll(selector) {
    if (selector === 'input[type="password"], input[name*="password" i], input[autocomplete="new-password"], input[autocomplete="current-password"]') {
      return [passwordInput];
    }
    if (selector === 'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]') {
      return [submitButton, oneTimeCodeButton];
    }
    return [];
  },
};
const window = {
  getComputedStyle(el) {
    return el?._style || {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    };
  },
};

function isVisibleElement(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0;
}

function isActionEnabled(el) {
  return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}

function getActionText(el) {
  return [el?.textContent, el?.value, el?.getAttribute?.('aria-label'), el?.getAttribute?.('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function getPageTextSnapshot() {
  return 'Create your account Use a one-time code instead';
}

function getSignupPasswordInput() {
  return passwordInput;
}

function getSignupPasswordSubmitButton() {
  return submitButton;
}

function getSignupPasswordDisplayedEmail() {
  return 'user@example.com';
}

function findOneTimeCodeLoginTrigger() {
  return oneTimeCodeButton;
}

function getSignupPasswordTimeoutErrorPageState() {
  return {
    retryEnabled: true,
    userAlreadyExistsBlocked: false,
  };
}

${extractFunction('getSignupPasswordDiagnostics')}

return {
  run() {
    return getSignupPasswordDiagnostics();
  },
};
`)();

  const result = api.run();

  assert.equal(result.url, 'https://auth.openai.com/create-account/password');
  assert.equal(result.displayedEmail, 'user@example.com');
  assert.equal(result.hasVisiblePasswordInput, true);
  assert.equal(result.passwordInputCount, 1);
  assert.equal(result.visiblePasswordInputCount, 1);
  assert.equal(result.passwordInputs[0]?.name, 'new-password');
  assert.equal(result.passwordInputs[0]?.valueLength, 14);
  assert.equal(result.submitButton?.text, 'Continue');
  assert.equal(result.oneTimeCodeTrigger?.text, 'Use a one-time code instead');
  assert.equal(result.retryPage, true);
  assert.equal(result.retryEnabled, true);
  assert.match(result.bodyTextPreview, /one-time code/);
});
