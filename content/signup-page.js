// content/signup-page.js — Content script for ChatGPT signup entry + OpenAI auth pages
// Injected on: auth0.openai.com, auth.openai.com, accounts.openai.com
// Dynamically injected on: chatgpt.com

console.log('[MultiPage:signup-page] Content script loaded on', location.href);

const SIGNUP_PAGE_LISTENER_SENTINEL = 'data-multipage-signup-page-listener';

if (document.documentElement.getAttribute(SIGNUP_PAGE_LISTENER_SENTINEL) !== '1') {
  document.documentElement.setAttribute(SIGNUP_PAGE_LISTENER_SENTINEL, '1');

  // Listen for commands from Background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message.type === 'EXECUTE_STEP'
      || message.type === 'FILL_CODE'
      || message.type === 'STEP8_FIND_AND_CLICK'
      || message.type === 'STEP8_GET_STATE'
      || message.type === 'STEP8_TRIGGER_CONTINUE'
      || message.type === 'GET_LOGIN_AUTH_STATE'
      || message.type === 'PREPARE_SIGNUP_VERIFICATION'
      || message.type === 'RECOVER_AUTH_RETRY_PAGE'
      || message.type === 'RESEND_VERIFICATION_CODE'
      || message.type === 'SUBMIT_PHONE_NUMBER'
      || message.type === 'SUBMIT_PHONE_VERIFICATION_CODE'
      || message.type === 'RESEND_PHONE_VERIFICATION_CODE'
      || message.type === 'RETURN_TO_ADD_PHONE'
      || message.type === 'ENSURE_SIGNUP_ENTRY_READY'
      || message.type === 'ENSURE_SIGNUP_PASSWORD_PAGE_READY'
    ) {
      resetStopState();
      handleCommand(message).then((result) => {
        sendResponse({ ok: true, ...(result || {}) });
      }).catch(err => {
        const reportedStep = Number(message.payload?.visibleStep) || message.step;
        if (isStopError(err)) {
          if (reportedStep) {
            log(`步骤 ${reportedStep || 8}：已被用户停止。`, 'warn');
          }
          sendResponse({ stopped: true, error: err.message });
          return;
        }

        if (message.type === 'STEP8_FIND_AND_CLICK') {
          log(`步骤 9：${err.message}`, 'error');
          sendResponse({ error: err.message });
          return;
        }

        if (reportedStep) {
          reportError(reportedStep, err.message);
        }
        sendResponse({ error: err.message });
      });
      return true;
    }
  });
} else {
  console.log('[MultiPage:signup-page] 消息监听已存在，跳过重复注册');
}

async function handleCommand(message) {
  switch (message.type) {
    case 'EXECUTE_STEP':
      switch (message.step) {
        case 2: return await step2_clickRegister(message.payload);
        case 3: return await step3_fillEmailPassword(message.payload);
        case 5: return await step5_fillNameBirthday(message.payload);
        case 7: return await step6_login(message.payload);
        case 9: return await step8_findAndClick();
        default: throw new Error(`signup-page.js 不处理步骤 ${message.step}`);
      }
    case 'FILL_CODE':
      // Step 4 = signup code, Step 7 = login code (same handler)
      return await fillVerificationCode(message.step, message.payload);
    case 'GET_LOGIN_AUTH_STATE':
      return serializeLoginAuthState(inspectLoginAuthState());
    case 'PREPARE_SIGNUP_VERIFICATION':
      return await prepareSignupVerificationFlow(message.payload);
    case 'RECOVER_AUTH_RETRY_PAGE':
      return await recoverCurrentAuthRetryPage(message.payload);
    case 'RESEND_VERIFICATION_CODE':
      return await resendVerificationCode(message.step);
    case 'SUBMIT_PHONE_NUMBER':
      return await phoneAuthHelpers.submitPhoneNumber(message.payload);
    case 'SUBMIT_PHONE_VERIFICATION_CODE':
      return await phoneAuthHelpers.submitPhoneVerificationCode(message.payload);
    case 'RESEND_PHONE_VERIFICATION_CODE':
      return await phoneAuthHelpers.resendPhoneVerificationCode();
    case 'RETURN_TO_ADD_PHONE':
      return await phoneAuthHelpers.returnToAddPhone();
    case 'ENSURE_SIGNUP_ENTRY_READY':
      return await ensureSignupEntryReady();
    case 'ENSURE_SIGNUP_PASSWORD_PAGE_READY':
      return await ensureSignupPasswordPageReady();
    case 'STEP8_FIND_AND_CLICK':
      return await step8_findAndClick();
    case 'STEP8_GET_STATE':
      return getStep8State();
    case 'STEP8_TRIGGER_CONTINUE':
      return await step8_triggerContinue(message.payload);
  }
}

const VERIFICATION_CODE_INPUT_SELECTOR = [
  'input[name="code"]',
  'input[name="otp"]',
  'input[autocomplete="one-time-code"]',
  'input[type="text"][maxlength="6"]',
  'input[type="tel"][maxlength="6"]',
  'input[aria-label*="code" i]',
  'input[placeholder*="code" i]',
  'input[inputmode="numeric"]',
].join(', ');

const ONE_TIME_CODE_LOGIN_PATTERN = /使用一次性验证码登录|改用(?:一次性)?验证码(?:登录)?|使用验证码登录|一次性验证码|验证码登录|one[-\s]*time\s*(?:passcode|password|code)|use\s+(?:a\s+)?one[-\s]*time\s*(?:passcode|password|code)(?:\s+instead)?|use\s+(?:a\s+)?code(?:\s+instead)?|sign\s+in\s+with\s+(?:email|code)|email\s+(?:me\s+)?(?:a\s+)?code/i;
const LOGIN_ENTRY_ACTION_PATTERN = /(?:^|\b)(?:log\s*in|sign\s*in|continue\s+(?:with|using)\s+(?:email|chatgpt)|use\s+(?:an?\s+)?email|email\s+address)(?:\b|$)|登录|登陆|邮箱|电子邮件/i;
const LOGIN_EXTERNAL_IDP_PATTERN = /google|microsoft|apple|sso|single\s+sign[-\s]*on|企业|工作区|workspace/i;
const LOGIN_CODE_ONLY_ACTION_PATTERN = /one[-\s]*time|passcode|use\s+(?:a\s+)?code|验证码|一次性/i;

const RESEND_VERIFICATION_CODE_PATTERN = /重新发送(?:验证码)?|再次发送(?:验证码)?|重发(?:验证码)?|未收到(?:验证码|邮件)|resend(?:\s+code)?|send\s+(?:a\s+)?new\s+code|send\s+(?:it\s+)?again|request\s+(?:a\s+)?new\s+code|didn'?t\s+receive/i;

function isVisibleElement(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0;
}

function getVisibleSplitVerificationInputs() {
  return Array.from(document.querySelectorAll('input[maxlength="1"]'))
    .filter(isVisibleElement);
}

function getVerificationCodeTarget() {
  const splitInputs = getVisibleSplitVerificationInputs();
  const codeInput = document.querySelector(VERIFICATION_CODE_INPUT_SELECTOR);
  if (codeInput && isVisibleElement(codeInput)) {
    const maxLength = Number(codeInput.getAttribute?.('maxlength') || codeInput.maxLength || 0);
    if (maxLength === 1 && splitInputs.length >= 6) {
      return { type: 'split', elements: splitInputs };
    }
    return { type: 'single', element: codeInput };
  }

  if (splitInputs.length >= 6) {
    return { type: 'split', elements: splitInputs };
  }

  return null;
}

function getActionText(el) {
  return [
    el?.textContent,
    el?.value,
    el?.getAttribute?.('aria-label'),
    el?.getAttribute?.('title'),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isActionEnabled(el) {
  return Boolean(el)
    && !el.disabled
    && el.getAttribute('aria-disabled') !== 'true';
}

function findOneTimeCodeLoginTrigger() {
  const candidates = document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );

  for (const el of candidates) {
    if (!isVisibleElement(el)) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;

    const text = [
      el.textContent,
      el.value,
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text && ONE_TIME_CODE_LOGIN_PATTERN.test(text)) {
      return el;
    }
  }

  return null;
}

function findResendVerificationCodeTrigger({ allowDisabled = false } = {}) {
  const candidates = document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );

  for (const el of candidates) {
    if (!isVisibleElement(el)) continue;
    if (!allowDisabled && !isActionEnabled(el)) continue;

    const text = getActionText(el);
    if (text && RESEND_VERIFICATION_CODE_PATTERN.test(text)) {
      return el;
    }
  }

  return null;
}

function isEmailVerificationPage() {
  return /\/email-verification(?:[/?#]|$)/i.test(location.pathname || '');
}

async function resendVerificationCode(step, timeout = 45000) {
  if (step === 8) {
    await waitForLoginVerificationPageReady();
  }

  const start = Date.now();
  let action = null;
  let loggedWaiting = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    // Check for 405 error page and recover by clicking "Try again"
    if (is405MethodNotAllowedPage()) {
      await handle405ResendError(step, timeout - (Date.now() - start));
      // After recovery, loop back to find the resend button again
      loggedWaiting = false;
      continue;
    }

    action = findResendVerificationCodeTrigger({ allowDisabled: true });

    if (action && isActionEnabled(action)) {
      log(`步骤 ${step}：重新发送验证码按钮已可用。`);
      await humanPause(350, 900);
      simulateClick(action);
      await sleep(1200);

      // After clicking resend, check if 405 error appeared
      if (is405MethodNotAllowedPage()) {
        log(`步骤 ${step}：点击重新发送后出现 405 错误，正在恢复...`, 'warn');
        await handle405ResendError(step, timeout - (Date.now() - start));
        loggedWaiting = false;
        continue;
      }

      return {
        resent: true,
        buttonText: getActionText(action),
      };
    }

    if (action && !loggedWaiting) {
      loggedWaiting = true;
      log(`步骤 ${step}：正在等待重新发送验证码按钮变为可点击...`);
    }

    await sleep(250);
  }

  throw new Error('无法点击重新发送验证码按钮。URL: ' + location.href);
}

function is405MethodNotAllowedPage() {
  const pageText = document.body?.textContent || '';
  return AUTH_ROUTE_ERROR_PATTERN.test(pageText);
}

async function handle405ResendError(step, remainingTimeout = 30000) {
  await recoverCurrentAuthRetryPage({
    logLabel: `步骤 ${step}：检测到 405 错误页面，正在点击“重试”恢复`,
    pathPatterns: [],
    step,
    timeoutMs: Math.max(1000, remainingTimeout),
  });
  log(`步骤 ${step}：405 错误已恢复，页面已返回验证码页面。`);
}

// ============================================================
// Signup Entry Helpers
// ============================================================

const SIGNUP_ENTRY_TRIGGER_PATTERN = /免费注册|立即注册|注册|sign\s*up|register|create\s*account|create\s+account/i;
const SIGNUP_EMAIL_INPUT_SELECTOR = [
  'input[type="email"]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[id*="email"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="电子邮件"]',
  'input[placeholder*="邮箱"]',
  'input[aria-label*="email" i]',
  'input[aria-label*="电子邮件"]',
  'input[aria-label*="邮箱"]',
].join(', ');
const SIGNUP_PHONE_INPUT_SELECTOR = [
  'input[type="tel"]:not([maxlength="6"])',
  'input[name*="phone" i]',
  'input[id*="phone" i]',
  'input[autocomplete="tel"]',
  'input[placeholder*="手机"]',
  'input[aria-label*="手机"]',
].join(', ');
const SIGNUP_SWITCH_TO_EMAIL_PATTERN = new RegExp([
  String.raw`\u7ee7\u7eed\u4f7f\u7528(?:\u7535\u5b50\u90ae\u4ef6\u5730\u5740|\u90ae\u7bb1)\u767b\u5f55`,
  String.raw`\u6539\u7528(?:\u7535\u5b50\u90ae\u4ef6\u5730\u5740|\u90ae\u7bb1)\u767b\u5f55`,
  String.raw`continue\s+using\s+(?:an?\s+)?email(?:\s+address)?(?:\s+(?:to\s+)?(?:log\s*in|sign\s*in|sign\s*up))?`,
  String.raw`continue\s+with\s+email(?:\s+address)?`,
  String.raw`use\s+(?:an?\s+)?email(?:\s+address)?(?:\s+instead)?`,
  String.raw`sign\s*(?:in|up)\s+with\s+email`,
].join('|'), 'i');
const SIGNUP_SWITCH_ACTION_PATTERN = /\u7ee7\u7eed\u4f7f\u7528|\u6539\u7528|continue|use|sign\s*(?:in|up)/i;
const SIGNUP_EMAIL_ACTION_PATTERN = /\u7535\u5b50\u90ae\u4ef6|\u90ae\u7bb1|email/i;
const SIGNUP_WORK_EMAIL_PATTERN = /\u5de5\u4f5c|business|work\s+email/i;

function getSignupEmailInput() {
  const input = document.querySelector(SIGNUP_EMAIL_INPUT_SELECTOR);
  if (input && isVisibleElement(input)) {
    return input;
  }

  const fallback = Array.from(document.querySelectorAll('input')).find((el) => {
    if (!isVisibleElement(el)) return false;
    const type = String(el.getAttribute?.('type') || '').trim().toLowerCase();
    const name = String(el.getAttribute?.('name') || '').trim().toLowerCase();
    const id = String(el.getAttribute?.('id') || '').trim().toLowerCase();
    const placeholder = String(el.getAttribute?.('placeholder') || '').trim();
    const ariaLabel = String(el.getAttribute?.('aria-label') || '').trim();
    const autocomplete = String(el.getAttribute?.('autocomplete') || '').trim().toLowerCase();
    const combinedText = `${placeholder} ${ariaLabel}`;
    return type === 'email'
      || autocomplete === 'email'
      || autocomplete === 'username'
      || /email|username/i.test(`${name} ${id}`)
      || /email|电子邮件|邮箱/i.test(combinedText);
  });

  return fallback || null;
}

function getSignupPhoneInput() {
  const input = document.querySelector(SIGNUP_PHONE_INPUT_SELECTOR);
  if (input && isVisibleElement(input)) {
    return input;
  }

  const fallback = Array.from(document.querySelectorAll('input')).find((el) => {
    if (!isVisibleElement(el)) return false;
    const type = String(el.getAttribute?.('type') || '').trim().toLowerCase();
    const name = String(el.getAttribute?.('name') || '').trim().toLowerCase();
    const id = String(el.getAttribute?.('id') || '').trim().toLowerCase();
    const placeholder = String(el.getAttribute?.('placeholder') || '').trim();
    const ariaLabel = String(el.getAttribute?.('aria-label') || '').trim();
    const autocomplete = String(el.getAttribute?.('autocomplete') || '').trim().toLowerCase();
    const combinedText = `${placeholder} ${ariaLabel}`;
    return type === 'tel'
      || autocomplete === 'tel'
      || /phone|tel/i.test(`${name} ${id}`)
      || /手机|电话|手机号/.test(combinedText);
  });

  return fallback || null;
}

function findSignupUseEmailTrigger() {
  const candidates = document.querySelectorAll('button, a, [role="button"], [role="link"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || !isActionEnabled(el)) return false;
    const text = getActionText(el);
    if (!text) return false;
    if (SIGNUP_WORK_EMAIL_PATTERN.test(text)) return false;
    return SIGNUP_SWITCH_TO_EMAIL_PATTERN.test(text)
      || (SIGNUP_SWITCH_ACTION_PATTERN.test(text) && SIGNUP_EMAIL_ACTION_PATTERN.test(text));
  }) || null;
}

function getSignupEmailContinueButton({ allowDisabled = false } = {}) {
  const direct = document.querySelector('button[type="submit"], input[type="submit"]');
  if (direct && isVisibleElement(direct) && (allowDisabled || isActionEnabled(direct))) {
    return direct;
  }

  const candidates = document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
    return /continue|next|submit|继续|下一步/i.test(getActionText(el));
  }) || null;
}

function findSignupEntryTrigger() {
  const candidates = document.querySelectorAll('a, button, [role="button"], [role="link"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || !isActionEnabled(el)) return false;
    return SIGNUP_ENTRY_TRIGGER_PATTERN.test(getActionText(el));
  }) || null;
}

function getSignupPasswordDisplayedEmail() {
  const text = (document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig);
  return matches?.[0] ? String(matches[0]).trim().toLowerCase() : '';
}

function inspectSignupEntryState() {
  const passwordInput = getSignupPasswordInput();
  if (isSignupPasswordPage() && passwordInput) {
    return {
      state: 'password_page',
      passwordInput,
      submitButton: getSignupPasswordSubmitButton({ allowDisabled: true }),
      displayedEmail: getSignupPasswordDisplayedEmail(),
      url: location.href,
    };
  }

  const emailInput = getSignupEmailInput();
  if (emailInput) {
    return {
      state: 'email_entry',
      emailInput,
      continueButton: getSignupEmailContinueButton({ allowDisabled: true }),
      url: location.href,
    };
  }

  const phoneInput = getSignupPhoneInput();
  if (phoneInput) {
    return {
      state: 'phone_entry',
      phoneInput,
      switchToEmailTrigger: findSignupUseEmailTrigger(),
      url: location.href,
    };
  }

  const signupTrigger = findSignupEntryTrigger();
  if (signupTrigger) {
    return {
      state: 'entry_home',
      signupTrigger,
      url: location.href,
    };
  }

  return {
    state: 'unknown',
    url: location.href,
  };
}

function getSignupEntryStateSummary(snapshot = inspectSignupEntryState()) {
  const summary = {
    state: snapshot?.state || 'unknown',
    url: snapshot?.url || location.href,
    hasEmailInput: Boolean(snapshot?.emailInput || getSignupEmailInput()),
    hasPhoneInput: Boolean(snapshot?.phoneInput || getSignupPhoneInput()),
    hasPasswordInput: Boolean(snapshot?.passwordInput || getSignupPasswordInput()),
  };

  if (snapshot?.displayedEmail) {
    summary.displayedEmail = snapshot.displayedEmail;
  }

  if (snapshot?.signupTrigger) {
    summary.signupTrigger = {
      tag: (snapshot.signupTrigger.tagName || '').toLowerCase(),
      text: getActionText(snapshot.signupTrigger).slice(0, 80),
    };
  }

  if (snapshot?.continueButton) {
    summary.continueButton = {
      tag: (snapshot.continueButton.tagName || '').toLowerCase(),
      text: getActionText(snapshot.continueButton).slice(0, 80),
      enabled: isActionEnabled(snapshot.continueButton),
    };
  }

  if (snapshot?.switchToEmailTrigger) {
    summary.switchToEmailTrigger = {
      tag: (snapshot.switchToEmailTrigger.tagName || '').toLowerCase(),
      text: getActionText(snapshot.switchToEmailTrigger).slice(0, 80),
      enabled: isActionEnabled(snapshot.switchToEmailTrigger),
    };
  }

  return summary;
}

function getSignupEntryDiagnostics() {
  const view = typeof window !== 'undefined' ? window : globalThis;
  const safeGetComputedStyle = (el) => {
    if (!el || typeof view?.getComputedStyle !== 'function') {
      return null;
    }
    try {
      return view.getComputedStyle(el);
    } catch {
      return null;
    }
  };
  const buildRectSummary = (el) => {
    const rect = typeof el?.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : null;
    return rect
      ? {
          width: Math.round(rect.width || 0),
          height: Math.round(rect.height || 0),
        }
      : null;
  };
  const buildVisibilityMeta = (el) => {
    const style = safeGetComputedStyle(el);
    return {
      className: String(el?.className || '').slice(0, 200),
      hidden: Boolean(el?.hidden),
      ariaHidden: el?.getAttribute?.('aria-hidden') || '',
      inert: typeof el?.hasAttribute === 'function' ? el.hasAttribute('inert') : false,
      display: style?.display || '',
      visibility: style?.visibility || '',
      opacity: style?.opacity || '',
      pointerEvents: style?.pointerEvents || '',
    };
  };
  const findBlockingAncestor = (el) => {
    let current = el?.parentElement || null;
    while (current) {
      const style = safeGetComputedStyle(current);
      const rect = buildRectSummary(current);
      const hidden = Boolean(current.hidden);
      const ariaHidden = current.getAttribute?.('aria-hidden') || '';
      const inert = typeof current.hasAttribute === 'function' ? current.hasAttribute('inert') : false;
      const blockedByStyle = Boolean(
        style
        && (
          style.display === 'none'
          || style.visibility === 'hidden'
          || style.opacity === '0'
          || style.pointerEvents === 'none'
        )
      );
      const blockedByRect = Boolean(rect && (rect.width === 0 || rect.height === 0));
      if (hidden || ariaHidden === 'true' || inert || blockedByStyle || blockedByRect) {
        return {
          tag: (current.tagName || '').toLowerCase(),
          id: current.id || '',
          className: String(current.className || '').slice(0, 200),
          hidden,
          ariaHidden,
          inert,
          display: style?.display || '',
          visibility: style?.visibility || '',
          opacity: style?.opacity || '',
          pointerEvents: style?.pointerEvents || '',
          rect,
        };
      }
      current = current.parentElement;
    }
    return null;
  };
  const actionCandidates = document.querySelectorAll(
    'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );
  const allActions = Array.from(actionCandidates).map((el) => {
    const text = getActionText(el);
    return {
      tag: (el.tagName || '').toLowerCase(),
      type: el.getAttribute?.('type') || '',
      text: text.slice(0, 80),
      visible: isVisibleElement(el),
      enabled: isActionEnabled(el),
      rect: buildRectSummary(el),
    };
  });
  const visibleActions = Array.from(actionCandidates)
    .filter(isVisibleElement)
    .slice(0, 12)
    .map((el) => ({
      tag: (el.tagName || '').toLowerCase(),
      type: el.getAttribute?.('type') || '',
      text: getActionText(el).slice(0, 80),
      enabled: isActionEnabled(el),
    }))
    .filter((item) => item.text);
  const signupLikeActions = Array.from(actionCandidates)
    .map((el) => {
      const text = getActionText(el);
      return {
        tag: (el.tagName || '').toLowerCase(),
        type: el.getAttribute?.('type') || '',
        text: text.slice(0, 80),
        visible: isVisibleElement(el),
        enabled: isActionEnabled(el),
        rect: buildRectSummary(el),
        ...buildVisibilityMeta(el),
        blockingAncestor: findBlockingAncestor(el),
      };
    })
    .filter((item) => item.text && SIGNUP_ENTRY_TRIGGER_PATTERN.test(item.text))
    .slice(0, 12);

  return {
    url: location.href,
    title: document.title || '',
    readyState: document.readyState || '',
    viewport: {
      innerWidth: Math.round(Number(view?.innerWidth) || 0),
      innerHeight: Math.round(Number(view?.innerHeight) || 0),
      outerWidth: Math.round(Number(view?.outerWidth) || 0),
      outerHeight: Math.round(Number(view?.outerHeight) || 0),
      devicePixelRatio: Number(view?.devicePixelRatio) || 0,
    },
    hasEmailInput: Boolean(getSignupEmailInput()),
    hasPhoneInput: Boolean(getSignupPhoneInput()),
    hasPasswordInput: Boolean(getSignupPasswordInput()),
    hasSwitchToEmailAction: Boolean(findSignupUseEmailTrigger()),
    bodyContainsSignupText: SIGNUP_ENTRY_TRIGGER_PATTERN.test(getPageTextSnapshot()),
    signupLikeActionCounts: {
      total: signupLikeActions.length,
      visible: signupLikeActions.filter((item) => item.visible).length,
      hidden: signupLikeActions.filter((item) => !item.visible).length,
    },
    signupLikeActions,
    visibleActions,
    bodyTextPreview: getPageTextSnapshot().slice(0, 240),
  };
}

function getSignupPasswordDiagnostics() {
  const view = typeof window !== 'undefined' ? window : globalThis;
  const safeGetComputedStyle = (el) => {
    if (!el || typeof view?.getComputedStyle !== 'function') {
      return null;
    }
    try {
      return view.getComputedStyle(el);
    } catch {
      return null;
    }
  };
  const buildRectSummary = (el) => {
    const rect = typeof el?.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : null;
    return rect
      ? {
          width: Math.round(rect.width || 0),
          height: Math.round(rect.height || 0),
        }
      : null;
  };
  const buildInputSummary = (el) => {
    const style = safeGetComputedStyle(el);
    return {
      tag: (el?.tagName || '').toLowerCase(),
      type: el?.getAttribute?.('type') || el?.type || '',
      name: el?.getAttribute?.('name') || el?.name || '',
      id: el?.id || '',
      autocomplete: el?.getAttribute?.('autocomplete') || '',
      placeholder: String(el?.getAttribute?.('placeholder') || '').slice(0, 80),
      visible: isVisibleElement(el),
      enabled: isActionEnabled(el),
      valueLength: String(el?.value || '').length,
      rect: buildRectSummary(el),
      className: String(el?.className || '').slice(0, 200),
      display: style?.display || '',
      visibility: style?.visibility || '',
      opacity: style?.opacity || '',
      pointerEvents: style?.pointerEvents || '',
      formAction: el?.form?.action || '',
    };
  };
  const buildActionSummary = (el) => {
    const style = safeGetComputedStyle(el);
    return {
      tag: (el?.tagName || '').toLowerCase(),
      type: el?.getAttribute?.('type') || el?.type || '',
      role: el?.getAttribute?.('role') || '',
      text: getActionText(el).slice(0, 120),
      visible: isVisibleElement(el),
      enabled: isActionEnabled(el),
      rect: buildRectSummary(el),
      className: String(el?.className || '').slice(0, 200),
      display: style?.display || '',
      visibility: style?.visibility || '',
      opacity: style?.opacity || '',
      pointerEvents: style?.pointerEvents || '',
      dataDdActionName: el?.getAttribute?.('data-dd-action-name') || '',
      formAction: el?.form?.action || '',
    };
  };
  const passwordInputs = Array.from(document.querySelectorAll(
    'input[type="password"], input[name*="password" i], input[autocomplete="new-password"], input[autocomplete="current-password"]'
  ))
    .map(buildInputSummary)
    .slice(0, 8);
  const actionCandidates = Array.from(document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  ))
    .map(buildActionSummary)
    .filter((item) => item.text)
    .slice(0, 16);
  const visibleActions = actionCandidates.filter((item) => item.visible).slice(0, 12);
  const submitButton = getSignupPasswordSubmitButton({ allowDisabled: true });
  const oneTimeCodeTrigger = findOneTimeCodeLoginTrigger();
  const retryState = getSignupPasswordTimeoutErrorPageState();

  return {
    url: location.href,
    title: document.title || '',
    readyState: document.readyState || '',
    displayedEmail: getSignupPasswordDisplayedEmail(),
    hasVisiblePasswordInput: Boolean(getSignupPasswordInput()),
    passwordInputCount: passwordInputs.length,
    visiblePasswordInputCount: passwordInputs.filter((item) => item.visible).length,
    passwordInputs,
    submitButton: submitButton ? buildActionSummary(submitButton) : null,
    oneTimeCodeTrigger: oneTimeCodeTrigger ? buildActionSummary(oneTimeCodeTrigger) : null,
    retryPage: Boolean(retryState),
    retryEnabled: Boolean(retryState?.retryEnabled),
    userAlreadyExistsBlocked: Boolean(retryState?.userAlreadyExistsBlocked),
    visibleActions,
    bodyTextPreview: getPageTextSnapshot().slice(0, 240),
  };
}

function logSignupPasswordDiagnostics(context, level = 'warn') {
  try {
    log(`${context}：密码页诊断快照：${JSON.stringify(getSignupPasswordDiagnostics())}`, level);
  } catch (error) {
    console.warn('[MultiPage:signup-page] failed to build signup password diagnostics:', error?.message || error);
  }
}

async function waitForSignupEntryState(options = {}) {
  const {
    timeout = 15000,
    autoOpenEntry = false,
    step = 2,
    logDiagnostics = false,
  } = options;
  const start = Date.now();
  let lastTriggerClickAt = 0;
  let clickAttempts = 0;
  let lastState = '';
  let slowSnapshotLogged = false;
  let lastSwitchToEmailAt = 0;
  let loggedMissingSwitchToEmail = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const snapshot = inspectSignupEntryState();

    if (logDiagnostics && snapshot.state !== lastState) {
      lastState = snapshot.state;
      log(`步骤 ${step}：注册入口状态切换为 ${snapshot.state}，状态快照：${JSON.stringify(getSignupEntryStateSummary(snapshot))}`);
    }

    if (snapshot.state === 'password_page' || snapshot.state === 'email_entry') {
      return snapshot;
    }

    if (snapshot.state === 'phone_entry') {
      if (!autoOpenEntry) {
        return snapshot;
      }

      if (snapshot.switchToEmailTrigger && Date.now() - lastSwitchToEmailAt >= 1500) {
        lastSwitchToEmailAt = Date.now();
        loggedMissingSwitchToEmail = false;
        if (logDiagnostics) {
          log(`步骤 ${step}：检测到手机号输入模式，准备点击切换邮箱入口："${getActionText(snapshot.switchToEmailTrigger).slice(0, 80)}"`);
        }
        log('步骤 2：检测到手机号输入模式，正在切换到邮箱输入模式...');
        await humanPause(350, 900);
        simulateClick(snapshot.switchToEmailTrigger);
      } else if (!snapshot.switchToEmailTrigger && !loggedMissingSwitchToEmail) {
        loggedMissingSwitchToEmail = true;
        log('步骤 2：检测到手机号输入模式，但暂未识别到“改用邮箱/继续使用电子邮件地址登录”按钮，继续等待界面稳定...', 'warn');
      }

      if (logDiagnostics && !slowSnapshotLogged && Date.now() - start >= 5000) {
        slowSnapshotLogged = true;
        log(`步骤 ${step}：等待手机号入口切换超过 5 秒，页面诊断快照：${JSON.stringify(getSignupEntryDiagnostics())}`, 'warn');
      }

      await sleep(250);
      continue;
    }

    if (snapshot.state === 'entry_home') {
      if (!autoOpenEntry) {
        return snapshot;
      }

      if (Date.now() - lastTriggerClickAt >= 1500) {
        lastTriggerClickAt = Date.now();
        clickAttempts += 1;
        if (logDiagnostics) {
          log(`步骤 ${step}：正在点击官网注册入口（第 ${clickAttempts} 次）："${getActionText(snapshot.signupTrigger).slice(0, 80)}"`);
        }
        log('步骤 2：正在点击官网注册入口...');
        await humanPause(350, 900);
        simulateClick(snapshot.signupTrigger);
      }
    }

    if (logDiagnostics && !slowSnapshotLogged && Date.now() - start >= 5000) {
      slowSnapshotLogged = true;
      log(`步骤 ${step}：等待注册入口超过 5 秒，页面诊断快照：${JSON.stringify(getSignupEntryDiagnostics())}`, 'warn');
    }

    await sleep(250);
  }

  const finalSnapshot = inspectSignupEntryState();
  if (logDiagnostics) {
    log(`步骤 ${step}：等待注册入口状态超时，最终状态快照：${JSON.stringify(getSignupEntryStateSummary(finalSnapshot))}`, 'warn');
  }
  return finalSnapshot;
}

async function ensureSignupEntryReady(timeout = 15000) {
  const snapshot = await waitForSignupEntryState({ timeout, autoOpenEntry: false });
  if (snapshot.state === 'entry_home' || snapshot.state === 'phone_entry' || snapshot.state === 'email_entry' || snapshot.state === 'password_page') {
    return {
      ready: true,
      state: snapshot.state,
      url: snapshot.url || location.href,
    };
  }

  log(`注册入口识别失败，诊断快照：${JSON.stringify(getSignupEntryDiagnostics())}`, 'warn');
  throw new Error('当前页面没有可用的注册入口，也不在邮箱/密码页。URL: ' + location.href);
}

async function ensureSignupPasswordPageReady(timeout = 20000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const passwordInput = getSignupPasswordInput();
    if (isSignupPasswordPage() && passwordInput) {
      return {
        ready: true,
        state: 'password_page',
        url: location.href,
      };
    }
    await sleep(200);
  }

  throw new Error('等待进入密码页超时。URL: ' + location.href);
}

async function fillSignupEmailAndContinue(email, step) {
  if (!email) throw new Error(`未提供邮箱地址，步骤 ${step} 无法继续。`);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const snapshot = await waitForSignupEntryState({
    timeout: 20000,
    autoOpenEntry: true,
    step,
    logDiagnostics: step === 2,
  });

  if (snapshot.state === 'password_page') {
    if (snapshot.displayedEmail && snapshot.displayedEmail !== normalizedEmail) {
      throw new Error(`步骤 ${step}：当前密码页邮箱为 ${snapshot.displayedEmail}，与目标邮箱 ${email} 不一致，请先回到步骤 1 重新开始。`);
    }
    log(`步骤 ${step}：当前已在密码页，无需重复提交邮箱。`);
    return {
      alreadyOnPasswordPage: true,
      url: snapshot.url || location.href,
    };
  }

  if (snapshot.state !== 'email_entry' || !snapshot.emailInput) {
    if (step === 2) {
      log(`步骤 ${step}：未进入邮箱输入页，最终页面诊断快照：${JSON.stringify(getSignupEntryDiagnostics())}`, 'warn');
    }
    throw new Error(`步骤 ${step}：未找到可用的邮箱输入入口。URL: ${location.href}`);
  }

  log(`步骤 ${step}：正在填写邮箱：${email}`);
  await humanPause(500, 1400);
  fillInput(snapshot.emailInput, email);
  log(`步骤 ${step}：邮箱已填写`);

  const continueButton = snapshot.continueButton || getSignupEmailContinueButton({ allowDisabled: true });
  if (!continueButton || !isActionEnabled(continueButton)) {
    throw new Error(`步骤 ${step}：未找到可点击的“继续”按钮。URL: ${location.href}`);
  }

  log(`步骤 ${step}：邮箱已准备提交，正在前往密码页...`);
  window.setTimeout(() => {
    try {
      throwIfStopped();
      simulateClick(continueButton);
    } catch (error) {
      if (!isStopError(error)) {
        console.error('[MultiPage:signup-page] deferred signup email submit failed:', error?.message || error);
      }
    }
  }, 120);

  return {
    submitted: true,
    email,
    url: location.href,
  };
}

// ============================================================
// Step 2: Click Register, fill email, then continue to password page
// ============================================================

async function step2_clickRegister(payload = {}) {
  const { email } = payload;
  return fillSignupEmailAndContinue(email, 2);
}

// ============================================================
// Step 3: Fill Password
// ============================================================

async function step3_fillEmailPassword(payload) {
  const { email, password } = payload;
  if (!password) throw new Error('未提供密码，步骤 3 需要可用密码。');
  const normalizedEmail = String(email || '').trim().toLowerCase();

  let snapshot = inspectSignupEntryState();
  if (snapshot.state === 'entry_home') {
    throw new Error('当前仍停留在 ChatGPT 官网首页，请先完成步骤 2。');
  }

  if (snapshot.state === 'email_entry') {
    const transition = await fillSignupEmailAndContinue(email, 3);
    if (!transition.alreadyOnPasswordPage) {
      await sleep(1200);
      await ensureSignupPasswordPageReady();
    }
    snapshot = inspectSignupEntryState();
  }

  if (snapshot.state !== 'password_page' || !snapshot.passwordInput) {
    await ensureSignupPasswordPageReady();
    snapshot = inspectSignupEntryState();
  }

  if (snapshot.state !== 'password_page' || !snapshot.passwordInput) {
    logSignupPasswordDiagnostics('步骤 3：未能识别可填写的密码输入框');
  }

  if (snapshot.state !== 'password_page' || !snapshot.passwordInput) {
    throw new Error('在密码页未找到密码输入框。URL: ' + location.href);
  }
  if (normalizedEmail && snapshot.displayedEmail && snapshot.displayedEmail !== normalizedEmail) {
    throw new Error(`当前密码页邮箱为 ${snapshot.displayedEmail}，与目标邮箱 ${email} 不一致，请先回到步骤 1 重新开始。`);
  }

  await humanPause(600, 1500);
  fillInput(snapshot.passwordInput, password);
  log('步骤 3：密码已填写');

  const submitBtn = snapshot.submitButton
    || getSignupPasswordSubmitButton({ allowDisabled: true })
    || await waitForElementByText('button', /continue|sign\s*up|submit|注册|创建|create/i, 5000).catch(() => null);

  if (!submitBtn) {
    logSignupPasswordDiagnostics('步骤 3：未找到可提交的密码页按钮');
  } else if (typeof findOneTimeCodeLoginTrigger === 'function' && findOneTimeCodeLoginTrigger()) {
    logSignupPasswordDiagnostics('步骤 3：当前密码页同时存在一次性验证码入口', 'info');
  }

  // Report complete BEFORE submit, because submit causes page navigation
  // which kills the content script connection
  const signupVerificationRequestedAt = submitBtn ? Date.now() : null;
  const completionPayload = {
    email,
    signupVerificationRequestedAt,
    deferredSubmit: Boolean(submitBtn),
  };
  reportComplete(3, completionPayload);

  if (submitBtn) {
    window.setTimeout(async () => {
      try {
        throwIfStopped();
        await sleep(500);
        await humanPause(500, 1300);
        simulateClick(submitBtn);
        log('步骤 3：表单已提交');
      } catch (error) {
        if (!isStopError(error)) {
          console.error('[MultiPage:signup-page] deferred step 3 submit failed:', error?.message || error);
        }
      }
    }, 120);
  }

  return completionPayload;
}

// ============================================================
// Fill Verification Code (used by step 4 and step 7)
// ============================================================

const INVALID_VERIFICATION_CODE_PATTERN = /代码不正确|验证码不正确|验证码错误|code\s+(?:is\s+)?incorrect|invalid\s+code|incorrect\s+code|try\s+again/i;
const VERIFICATION_PAGE_PATTERN = /检查您的收件箱|输入我们刚刚向|重新发送电子邮件|重新发送验证码|代码不正确|email\s+verification|check\s+your\s+inbox|enter\s+the\s+code|we\s+just\s+sent|we\s+emailed|resend/i;
const OAUTH_CONSENT_PAGE_PATTERN = /使用\s*ChatGPT\s*登录到\s*Codex|sign\s+in\s+to\s+codex(?:\s+with\s+chatgpt)?|login\s+to\s+codex|log\s+in\s+to\s+codex|authorize|授权/i;
const OAUTH_CONSENT_FORM_SELECTOR = 'form[action*="/sign-in-with-chatgpt/" i][action*="/consent" i]';
const CONTINUE_ACTION_PATTERN = /继续|continue/i;
const ADD_PHONE_PAGE_PATTERN = /add[\s-]*phone|添加手机号|手机号码|手机号|phone\s+number|telephone/i;
const STEP5_SUBMIT_ERROR_PATTERN = /无法根据该信息创建帐户|请重试|unable\s+to\s+create\s+(?:your\s+)?account|couldn'?t\s+create\s+(?:your\s+)?account|something\s+went\s+wrong|invalid\s+(?:birthday|birth|date)|生日|出生日期/i;
const AUTH_TIMEOUT_ERROR_TITLE_PATTERN = /糟糕，出错了|something\s+went\s+wrong|oops/i;
const AUTH_TIMEOUT_ERROR_DETAIL_PATTERN = /operation\s+timed\s+out|timed\s+out|请求超时|操作超时|failed\s+to\s+fetch|network\s+error|fetch\s+failed/i;
const AUTH_ROUTE_ERROR_PATTERN = /405\s+method\s+not\s+allowed|route\s+error.*405|did\s+not\s+provide\s+an?\s+[`'"]?action|post\s+request\s+to\s+["']?\/email-verification/i;
const SIGNUP_USER_ALREADY_EXISTS_ERROR_PREFIX = 'SIGNUP_USER_ALREADY_EXISTS::';
const SIGNUP_EMAIL_EXISTS_PATTERN = /与此电子邮件地址相关联的帐户已存在|account\s+associated\s+with\s+this\s+email\s+address\s+already\s+exists|email\s+address.*already\s+exists/i;

const authPageRecovery = self.MultiPageAuthPageRecovery?.createAuthPageRecovery?.({
  detailPattern: AUTH_TIMEOUT_ERROR_DETAIL_PATTERN,
  getActionText,
  getPageTextSnapshot,
  humanPause,
  isActionEnabled,
  isVisibleElement,
  log,
  routeErrorPattern: AUTH_ROUTE_ERROR_PATTERN,
  simulateClick,
  sleep,
  throwIfStopped,
  titlePattern: AUTH_TIMEOUT_ERROR_TITLE_PATTERN,
}) || null;

function getVerificationErrorText() {
  const messages = [];
  const selectors = [
    '.react-aria-FieldError',
    '[slot="errorMessage"]',
    '[id$="-error"]',
    '[data-invalid="true"] + *',
    '[aria-invalid="true"] + *',
    '[class*="error"]',
  ];

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) {
        messages.push(text);
      }
    });
  }

  const invalidInput = document.querySelector(`${VERIFICATION_CODE_INPUT_SELECTOR}[aria-invalid="true"], ${VERIFICATION_CODE_INPUT_SELECTOR}[data-invalid="true"]`);
  if (invalidInput) {
    const wrapper = invalidInput.closest('form, [data-rac], ._root_18qcl_51, div');
    if (wrapper) {
      const text = (wrapper.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) {
        messages.push(text);
      }
    }
  }

  return messages.find((text) => INVALID_VERIFICATION_CODE_PATTERN.test(text)) || '';
}

function createSignupUserAlreadyExistsError() {
  return new Error(
    `${SIGNUP_USER_ALREADY_EXISTS_ERROR_PREFIX}步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。`
  );
}

function isStep5Ready() {
  return Boolean(
    document.querySelector('input[name="name"], input[autocomplete="name"], input[name="birthday"], input[name="age"], [role="spinbutton"][data-type="year"]')
  );
}

function isSignupProfilePageUrl(rawUrl = location.href) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const host = String(parsed.hostname || '').toLowerCase();
    if (!['auth.openai.com', 'auth0.openai.com', 'accounts.openai.com'].includes(host)) {
      return false;
    }
    return /\/create-account\/profile(?:[/?#]|$)/i.test(String(parsed.pathname || ''));
  } catch {
    return false;
  }
}

function isLikelyLoggedInChatgptHomeUrl(rawUrl = location.href) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const host = String(parsed.hostname || '').toLowerCase();
    if (!['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(host)) {
      return false;
    }

    const path = String(parsed.pathname || '');
    if (/^\/(?:auth\/|create-account\/|email-verification|log-in|add-phone)(?:[/?#]|$)/i.test(path)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getStep4PostVerificationState() {
  if (isStep5Ready() || isSignupProfilePageUrl()) {
    return {
      state: 'step5',
      url: location.href,
    };
  }

  if (isLikelyLoggedInChatgptHomeUrl()) {
    return {
      state: 'logged_in_home',
      skipProfileStep: true,
      url: location.href,
    };
  }

  return null;
}

function getPageTextSnapshot() {
  return (document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLoginVerificationDisplayedEmail() {
  const pageText = getPageTextSnapshot();
  const matches = pageText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  return matches[0] ? String(matches[0]).trim().toLowerCase() : '';
}

function getPhoneVerificationDisplayedPhone() {
  const pageText = getPageTextSnapshot();
  const matches = pageText.match(/\+\d[\d\s-]{6,}\d/g) || [];
  return matches[0] ? String(matches[0]).replace(/\s+/g, ' ').trim() : '';
}

function getOAuthConsentForm() {
  return document.querySelector(OAUTH_CONSENT_FORM_SELECTOR);
}

function getPrimaryContinueButton() {
  const consentForm = getOAuthConsentForm();
  if (consentForm) {
    const formButtons = Array.from(
      consentForm.querySelectorAll('button[type="submit"], input[type="submit"], [role="button"]')
    );

    const formContinueButton = formButtons.find((el) => {
      if (!isVisibleElement(el)) return false;

      const ddActionName = el.getAttribute?.('data-dd-action-name') || '';
      return ddActionName === 'Continue' || CONTINUE_ACTION_PATTERN.test(getActionText(el));
    });
    if (formContinueButton) {
      return formContinueButton;
    }

    const firstVisibleSubmit = formButtons.find(isVisibleElement);
    if (firstVisibleSubmit) {
      return firstVisibleSubmit;
    }
  }

  const continueBtn = document.querySelector(
    `${OAUTH_CONSENT_FORM_SELECTOR} button[type="submit"], button[type="submit"][data-dd-action-name="Continue"], button[type="submit"]._primary_3rdp0_107`
  );
  if (continueBtn && isVisibleElement(continueBtn)) {
    return continueBtn;
  }

  const buttons = document.querySelectorAll('button, [role="button"]');
  return Array.from(buttons).find((el) => {
    if (!isVisibleElement(el)) return false;

    const ddActionName = el.getAttribute?.('data-dd-action-name') || '';
    return ddActionName === 'Continue' || CONTINUE_ACTION_PATTERN.test(getActionText(el));
  }) || null;
}

function isOAuthConsentPage() {
  const pageText = getPageTextSnapshot();
  if (OAUTH_CONSENT_PAGE_PATTERN.test(pageText)) {
    return true;
  }

  if (getOAuthConsentForm()) {
    return true;
  }

  return /\bcodex\b/i.test(pageText) && /\bchatgpt\b/i.test(pageText) && Boolean(getPrimaryContinueButton());
}

function isVerificationPageStillVisible() {
  if (getCurrentAuthRetryPageState('signup_password') || getCurrentAuthRetryPageState('login')) {
    return false;
  }
  if (isPhoneVerificationPageReady()) {
    return false;
  }
  if (getVerificationCodeTarget()) return true;
  if (findResendVerificationCodeTrigger({ allowDisabled: true })) return true;
  if (document.querySelector('form[action*="email-verification" i]')) return true;

  if (!isEmailVerificationPage()) {
    return false;
  }

  return VERIFICATION_PAGE_PATTERN.test(getPageTextSnapshot());
}

function isAddPhonePageReady() {
  const path = `${location.pathname || ''} ${location.href || ''}`;
  if (/\/add-phone(?:[/?#]|$)/i.test(path)) return true;

  const phoneInput = document.querySelector(
    'input[type="tel"]:not([maxlength="6"]), input[name*="phone" i], input[id*="phone" i], input[autocomplete="tel"]'
  );
  if (phoneInput && isVisibleElement(phoneInput)) {
    return true;
  }

  return ADD_PHONE_PAGE_PATTERN.test(getPageTextSnapshot());
}

function isPhoneVerificationPageReady() {
  const path = `${location.pathname || ''} ${location.href || ''}`;
  if (/\/phone-verification(?:[/?#]|$)/i.test(path)) {
    return true;
  }

  const form = document.querySelector('form[action*="/phone-verification" i]');
  if (form && isVisibleElement(form)) {
    return true;
  }

  if (document.querySelector('button[name="intent"][value="resend"]') && getPhoneVerificationDisplayedPhone()) {
    return true;
  }

  const pageText = getPageTextSnapshot();
  const displayedPhone = getPhoneVerificationDisplayedPhone();
  return Boolean(getVerificationCodeTarget())
    && Boolean(displayedPhone)
    && /check\s+your\s+phone|phone\s+verification|verify\s+your\s+phone|sms|text\s+message|code\s+to\s+\+/.test(pageText);
}

function isStep8Ready() {
  const continueBtn = getPrimaryContinueButton();
  if (!continueBtn) return false;
  if (isVerificationPageStillVisible()) return false;
  if (isPhoneVerificationPageReady()) return false;
  if (isAddPhonePageReady()) return false;

  return isOAuthConsentPage();
}

const phoneAuthHelpers = self.MultiPagePhoneAuth?.createPhoneAuthHelpers?.({
  fillInput,
  getActionText,
  getPageTextSnapshot,
  getVerificationErrorText,
  humanPause,
  isActionEnabled,
  isAddPhonePageReady,
  isConsentReady: isStep8Ready,
  isPhoneVerificationPageReady,
  isVisibleElement,
  simulateClick,
  sleep,
  throwIfStopped,
  waitForElement,
}) || {
  submitPhoneNumber: async () => {
    throw new Error('Phone auth helpers are unavailable.');
  },
  submitPhoneVerificationCode: async () => {
    throw new Error('Phone auth helpers are unavailable.');
  },
  resendPhoneVerificationCode: async () => {
    throw new Error('Phone auth helpers are unavailable.');
  },
  returnToAddPhone: async () => {
    throw new Error('Phone auth helpers are unavailable.');
  },
};

function normalizeInlineText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isStep5AllConsentText(text) {
  const normalizedText = normalizeInlineText(text).toLowerCase();
  if (!normalizedText) return false;

  return /i\s+agree\s+to\s+all\s+of\s+the\s+following/i.test(normalizedText)
    || normalizedText.includes('\u6211\u540c\u610f\u4ee5\u4e0b\u6240\u6709\u5404\u9879')
    || normalizedText.includes('\u540c\u610f\u4ee5\u4e0b\u6240\u6709\u5404\u9879')
    || normalizedText.includes('\u6211\u540c\u610f\u6240\u6709')
    || normalizedText.includes('\u5168\u90e8\u540c\u610f');
}

function findStep5AllConsentCheckbox() {
  const namedCandidates = Array.from(document.querySelectorAll('input[name="allCheckboxes"][type="checkbox"]'))
    .filter((el) => {
      const checkboxLabel = el.closest?.('label') || null;
      return isVisibleElement(el) || (checkboxLabel && isVisibleElement(checkboxLabel));
    });

  const namedMatch = namedCandidates.find((el) => {
    const checkboxLabel = el.closest?.('label') || null;
    const checkboxText = normalizeInlineText([
      checkboxLabel?.textContent || '',
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('title') || '',
      el.getAttribute?.('name') || '',
    ].filter(Boolean).join(' '));
    return isStep5AllConsentText(checkboxText);
  });
  if (namedMatch) {
    return namedMatch;
  }
  if (namedCandidates.length > 0) {
    return namedCandidates[0];
  }

  return Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find((el) => {
      const checkboxLabel = el.closest?.('label') || null;
      if (!isVisibleElement(el) && !(checkboxLabel && isVisibleElement(checkboxLabel))) {
        return false;
      }
      const checkboxText = normalizeInlineText([
        checkboxLabel?.textContent || '',
        el.getAttribute?.('aria-label') || '',
        el.getAttribute?.('title') || '',
        el.getAttribute?.('name') || '',
      ].filter(Boolean).join(' '));
      return isStep5AllConsentText(checkboxText);
    }) || null;
}

function isStep5CheckboxChecked(checkbox) {
  if (!checkbox) return false;
  if (checkbox.checked === true) return true;

  const ariaChecked = String(
    checkbox.getAttribute?.('aria-checked')
    || checkbox.closest?.('[role="checkbox"]')?.getAttribute?.('aria-checked')
    || ''
  ).toLowerCase();
  return ariaChecked === 'true';
}

function findBirthdayReactAriaSelect(labelText) {
  const normalizedLabel = normalizeInlineText(labelText);
  const roots = document.querySelectorAll('.react-aria-Select');

  for (const root of roots) {
    const labelEl = Array.from(root.querySelectorAll('span')).find((el) => normalizeInlineText(el.textContent) === normalizedLabel);
    if (!labelEl) continue;

    const item = root.closest('[class*="selectItem"], ._selectItem_ppsls_113') || root.parentElement;
    const nativeSelect = item?.querySelector('[data-testid="hidden-select-container"] select') || null;
    const button = root.querySelector('button[aria-haspopup="listbox"]') || null;
    const valueEl = root.querySelector('.react-aria-SelectValue') || null;

    return { root, item, labelEl, nativeSelect, button, valueEl };
  }

  return null;
}

async function setReactAriaBirthdaySelect(control, value) {
  if (!control?.nativeSelect) {
    throw new Error('未找到可写入的生日下拉框。');
  }

  const desiredValue = String(value);
  const option = Array.from(control.nativeSelect.options).find((item) => item.value === desiredValue);
  if (!option) {
    throw new Error(`生日下拉框中不存在值 ${desiredValue}。`);
  }

  control.nativeSelect.value = desiredValue;
  option.selected = true;
  control.nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
  control.nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);
}

function getStep5ErrorText() {
  const messages = [];
  const selectors = [
    '.react-aria-FieldError',
    '[slot="errorMessage"]',
    '[id$="-error"]',
    '[id$="-errors"]',
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '[class*="error"]',
  ];

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      if (!isVisibleElement(el)) return;
      const text = normalizeInlineText(el.textContent);
      if (text) {
        messages.push(text);
      }
    });
  }

  const invalidField = Array.from(document.querySelectorAll('[aria-invalid="true"], [data-invalid="true"]'))
    .find((el) => isVisibleElement(el));
  if (invalidField) {
    const wrapper = invalidField.closest('form, fieldset, [data-rac], div');
    if (wrapper) {
      const text = normalizeInlineText(wrapper.textContent);
      if (text) {
        messages.push(text);
      }
    }
  }

  return messages.find((text) => STEP5_SUBMIT_ERROR_PATTERN.test(text)) || '';
}


function isSignupPasswordPage() {
  return /\/create-account\/password(?:[/?#]|$)/i.test(location.pathname || '');
}

function getSignupPasswordInput() {
  const input = document.querySelector('input[type="password"]');
  return input && isVisibleElement(input) ? input : null;
}

function getSignupPasswordSubmitButton({ allowDisabled = false } = {}) {
  const direct = document.querySelector('button[type="submit"]');
  if (direct && isVisibleElement(direct) && (allowDisabled || isActionEnabled(direct))) {
    return direct;
  }

  const candidates = document.querySelectorAll('button, [role="button"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
    const text = getActionText(el);
    return /继续|continue|submit|创建|create/i.test(text);
  }) || null;
}

function getAuthRetryButton({ allowDisabled = false } = {}) {
  if (authPageRecovery?.getAuthRetryButton) {
    return authPageRecovery.getAuthRetryButton({ allowDisabled });
  }

  const direct = document.querySelector('button[data-dd-action-name="Try again"]');
  if (direct && isVisibleElement(direct) && (allowDisabled || isActionEnabled(direct))) {
    return direct;
  }

  const candidates = document.querySelectorAll('button, [role="button"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
    const text = getActionText(el);
    return /重试|try\s+again/i.test(text);
  }) || null;
}

function getAuthTimeoutErrorPageState(options = {}) {
  if (authPageRecovery?.getAuthTimeoutErrorPageState) {
    return authPageRecovery.getAuthTimeoutErrorPageState(options);
  }

  const { pathPatterns = [] } = options;
  const path = location.pathname || '';
  if (pathPatterns.length && !pathPatterns.some((pattern) => pattern.test(path))) {
    return null;
  }

  const retryButton = getAuthRetryButton({ allowDisabled: true });
  if (!retryButton) {
    return null;
  }

  const text = getPageTextSnapshot();
  const titleMatched = AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(text)
    || AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(document.title || '');
  const detailMatched = AUTH_TIMEOUT_ERROR_DETAIL_PATTERN.test(text);
  const routeErrorMatched = AUTH_ROUTE_ERROR_PATTERN.test(text);
  const fetchFailedMatched = /failed\s+to\s+fetch|network\s+error|fetch\s+failed/i.test(text);
  const maxCheckAttemptsBlocked = /max_check_attempts/i.test(text);
  const userAlreadyExistsBlocked = /user_already_exists/i.test(text);

  if (!titleMatched && !detailMatched && !routeErrorMatched && !fetchFailedMatched && !maxCheckAttemptsBlocked && !userAlreadyExistsBlocked) {
    return null;
  }

  return {
    path,
    url: location.href,
    retryButton,
    retryEnabled: isActionEnabled(retryButton),
    titleMatched,
    detailMatched,
    routeErrorMatched,
    fetchFailedMatched,
    maxCheckAttemptsBlocked,
    userAlreadyExistsBlocked,
  };
}

function getSignupAuthRetryPathPatterns() {
  return [
    /\/create-account\/password(?:[/?#]|$)/i,
    /\/email-verification(?:[/?#]|$)/i,
  ];
}

function getLoginAuthRetryPathPatterns() {
  return [
    /\/log-in(?:[/?#]|$)/i,
    /\/email-verification(?:[/?#]|$)/i,
  ];
}

function getAuthRetryPathPatternsForFlow(flow = 'auth') {
  switch (flow) {
    case 'signup':
    case 'signup_password':
      return getSignupAuthRetryPathPatterns();
    case 'login':
      return getLoginAuthRetryPathPatterns();
    default:
      return [];
  }
}

function getCurrentAuthRetryPageState(flow = 'auth') {
  return getAuthTimeoutErrorPageState({
    pathPatterns: getAuthRetryPathPatternsForFlow(flow),
  });
}

async function recoverCurrentAuthRetryPage(payload = {}) {
  const {
    flow = 'auth',
    logLabel = '',
    maxClickAttempts = 5,
    pathPatterns = null,
    step = null,
    timeoutMs = 12000,
    waitAfterClickMs = 3000,
  } = payload;
  const resolvedPathPatterns = Array.isArray(pathPatterns)
    ? pathPatterns
    : getAuthRetryPathPatternsForFlow(flow);
  if (authPageRecovery?.recoverAuthRetryPage) {
    return authPageRecovery.recoverAuthRetryPage({
      logLabel,
      maxClickAttempts,
      pathPatterns: resolvedPathPatterns,
      step,
      timeoutMs,
      waitAfterClickMs,
    });
  }

  const maxIdlePolls = timeoutMs > 0
    ? Math.max(1, Math.ceil(timeoutMs / Math.max(1, 250)))
    : Number.POSITIVE_INFINITY;
  let clickCount = 0;
  let idlePollCount = 0;
  while (clickCount < maxClickAttempts) {
    throwIfStopped();
    const retryState = getAuthTimeoutErrorPageState({ pathPatterns: resolvedPathPatterns });
    if (!retryState) {
      return {
        recovered: clickCount > 0,
        clickCount,
        url: location.href,
      };
    }

    if (retryState.maxCheckAttemptsBlocked) {
      throw new Error('CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统，已完全停止流程，请不要短时间内多次进行重新发送验证码，连续刷新、反复点击重试会加重风控；请先关闭页面等待 15-30 分钟，让系统的临时限制自动解除。或者更换浏览器');
    }
    if (retryState.userAlreadyExistsBlocked) {
      throw createSignupUserAlreadyExistsError();
    }
    if (retryState.retryButton && retryState.retryEnabled) {
      idlePollCount = 0;
      clickCount += 1;
      log(`${logLabel || `步骤 ${step || '?'}：检测到重试页，正在点击“重试”恢复`}（第 ${clickCount} 次）...`, 'warn');
      await humanPause(300, 800);
      simulateClick(retryState.retryButton);
      const settleStart = Date.now();
      while (Date.now() - settleStart < waitAfterClickMs) {
        throwIfStopped();
        if (!getAuthTimeoutErrorPageState({ pathPatterns: resolvedPathPatterns })) {
          return {
            recovered: true,
            clickCount,
            url: location.href,
          };
        }
        await sleep(250);
      }
      continue;
    }

    idlePollCount += 1;
    if (idlePollCount >= maxIdlePolls) {
      throw new Error(`${logLabel || `步骤 ${step || '?'}：重试页恢复`}超时：重试按钮长时间不可点击。URL: ${location.href}`);
    }

    await sleep(250);
  }

  const finalRetryState = getAuthTimeoutErrorPageState({ pathPatterns: resolvedPathPatterns });
  if (!finalRetryState) {
    return {
      recovered: clickCount > 0,
      clickCount,
      url: location.href,
    };
  }
  if (finalRetryState.maxCheckAttemptsBlocked) {
    throw new Error('CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统，已完全停止流程，请不要短时间内多次进行重新发送验证码，连续刷新、反复点击重试会加重风控；请先关闭页面等待 15-30 分钟，让系统的临时限制自动解除。或者更换浏览器');
  }
  if (finalRetryState.userAlreadyExistsBlocked) {
    throw createSignupUserAlreadyExistsError();
  }

  throw new Error(`${logLabel || `步骤 ${step || '?'}：重试页恢复`}失败：已连续点击“重试” ${maxClickAttempts} 次，页面仍未恢复。URL: ${location.href}`);
}

function getSignupPasswordTimeoutErrorPageState() {
  return getAuthTimeoutErrorPageState({
    pathPatterns: getSignupAuthRetryPathPatterns(),
  });
}

function getLoginTimeoutErrorPageState() {
  return getAuthTimeoutErrorPageState({
    pathPatterns: getLoginAuthRetryPathPatterns(),
  });
}

function getLoginEmailInput() {
  const input = document.querySelector(
    'input[type="email"], input[name="email"], input[name="username"], input[id*="email"], input[placeholder*="email" i], input[placeholder*="Email"]'
  );
  return input && isVisibleElement(input) ? input : null;
}

function getLoginPasswordInput() {
  const input = document.querySelector('input[type="password"]');
  return input && isVisibleElement(input) ? input : null;
}

function getLoginSubmitButton({ allowDisabled = false } = {}) {
  const direct = document.querySelector('button[type="submit"], input[type="submit"]');
  if (direct && isVisibleElement(direct) && (allowDisabled || isActionEnabled(direct))) {
    return direct;
  }

  const candidates = document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
    const text = getActionText(el);
    if (!text || ONE_TIME_CODE_LOGIN_PATTERN.test(text)) return false;
    return /continue|next|submit|sign\s*in|log\s*in|继续|下一步|登录/i.test(text);
  }) || null;
}

function findLoginEntryTrigger() {
  const candidates = Array.from(document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  )).filter((el) => isVisibleElement(el) && isActionEnabled(el));

  const preferred = candidates.find((el) => {
    const text = getActionText(el);
    if (!text || LOGIN_CODE_ONLY_ACTION_PATTERN.test(text) || LOGIN_EXTERNAL_IDP_PATTERN.test(text)) return false;
    return /continue\s+(?:with|using)\s+email|use\s+(?:an?\s+)?email|email\s+address|邮箱|电子邮件/i.test(text);
  });
  if (preferred) return preferred;

  return candidates.find((el) => {
    const text = getActionText(el);
    if (!text || LOGIN_CODE_ONLY_ACTION_PATTERN.test(text) || LOGIN_EXTERNAL_IDP_PATTERN.test(text)) return false;
    return LOGIN_ENTRY_ACTION_PATTERN.test(text);
  }) || null;
}

function inspectLoginAuthState() {
  const retryState = getLoginTimeoutErrorPageState();
  const verificationTarget = getVerificationCodeTarget();
  const passwordInput = getLoginPasswordInput();
  const emailInput = getLoginEmailInput();
  const switchTrigger = findOneTimeCodeLoginTrigger();
  const loginEntryTrigger = findLoginEntryTrigger();
  const submitButton = getLoginSubmitButton({ allowDisabled: true });
  const verificationVisible = isVerificationPageStillVisible();
  const addPhonePage = isAddPhonePageReady();
  const phoneVerificationPage = isPhoneVerificationPageReady();
  const consentReady = isStep8Ready();
  const oauthConsentPage = isOAuthConsentPage();
  const baseState = {
    state: 'unknown',
    url: location.href,
    path: location.pathname || '',
    displayedEmail: getLoginVerificationDisplayedEmail(),
    retryButton: retryState?.retryButton || null,
    retryEnabled: Boolean(retryState?.retryEnabled),
    titleMatched: Boolean(retryState?.titleMatched),
    detailMatched: Boolean(retryState?.detailMatched),
    maxCheckAttemptsBlocked: Boolean(retryState?.maxCheckAttemptsBlocked),
    verificationTarget,
    passwordInput,
    emailInput,
    submitButton,
    switchTrigger,
    loginEntryTrigger,
    verificationVisible,
    addPhonePage,
    phoneVerificationPage,
    oauthConsentPage,
    consentReady,
  };

  if (retryState) {
    return {
      ...baseState,
      state: 'login_timeout_error_page',
    };
  }

  if (phoneVerificationPage) {
    return {
      ...baseState,
      state: 'phone_verification_page',
      displayedPhone: getPhoneVerificationDisplayedPhone(),
    };
  }

  if (verificationTarget) {
    return {
      ...baseState,
      state: 'verification_page',
    };
  }

  if (addPhonePage) {
    return {
      ...baseState,
      state: 'add_phone_page',
    };
  }

  if (passwordInput || switchTrigger) {
    return {
      ...baseState,
      state: 'password_page',
    };
  }

  if (emailInput) {
    return {
      ...baseState,
      state: 'email_page',
    };
  }

  if (verificationVisible) {
    return {
      ...baseState,
      state: 'verification_page',
    };
  }

  if (consentReady) {
    return {
      ...baseState,
      state: 'oauth_consent_page',
    };
  }

  if (loginEntryTrigger) {
    return {
      ...baseState,
      state: 'entry_page',
    };
  }

  return baseState;
}

function serializeLoginAuthState(snapshot) {
  return {
    state: snapshot?.state || 'unknown',
    url: snapshot?.url || location.href,
    path: snapshot?.path || location.pathname || '',
    displayedEmail: snapshot?.displayedEmail || '',
    retryEnabled: Boolean(snapshot?.retryEnabled),
    titleMatched: Boolean(snapshot?.titleMatched),
    detailMatched: Boolean(snapshot?.detailMatched),
    maxCheckAttemptsBlocked: Boolean(snapshot?.maxCheckAttemptsBlocked),
    hasVerificationTarget: Boolean(snapshot?.verificationTarget),
    hasPasswordInput: Boolean(snapshot?.passwordInput),
    hasEmailInput: Boolean(snapshot?.emailInput),
    hasSubmitButton: Boolean(snapshot?.submitButton),
    hasSwitchTrigger: Boolean(snapshot?.switchTrigger),
    hasLoginEntryTrigger: Boolean(snapshot?.loginEntryTrigger),
    verificationVisible: Boolean(snapshot?.verificationVisible),
    addPhonePage: Boolean(snapshot?.addPhonePage),
    phoneVerificationPage: Boolean(snapshot?.phoneVerificationPage),
    oauthConsentPage: Boolean(snapshot?.oauthConsentPage),
    consentReady: Boolean(snapshot?.consentReady),
  };
}

function getLoginAuthStateLabel(snapshot) {
  const state = snapshot?.state;
  switch (state) {
    case 'verification_page':
      return '登录验证码页';
    case 'password_page':
      return '密码页';
    case 'email_page':
      return '邮箱输入页';
    case 'login_timeout_error_page':
      return '登录超时报错页';
    case 'oauth_consent_page':
      return 'OAuth 授权页';
    case 'entry_page':
      return '登录入口页';
    case 'add_phone_page':
      return '手机号页';
    default:
      return '未知页面';
  }
}

async function waitForKnownLoginAuthState(timeout = 15000) {
  const start = Date.now();
  let snapshot = normalizeStep6Snapshot(inspectLoginAuthState());

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = normalizeStep6Snapshot(inspectLoginAuthState());
    if (snapshot.state !== 'unknown') {
      return snapshot;
    }
    await sleep(200);
  }

  return snapshot;
}

async function waitForLoginVerificationPageReady(timeout = 10000) {
  const start = Date.now();
  let snapshot = inspectLoginAuthState();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = inspectLoginAuthState();
    if (snapshot.state === 'verification_page') {
      return snapshot;
    }
    if (snapshot.state !== 'unknown') {
      break;
    }
    await sleep(200);
  }

  throw new Error(
    `当前未进入登录验证码页面，请先重新完成步骤 7。当前状态：${getLoginAuthStateLabel(snapshot)}。URL: ${snapshot?.url || location.href}`
  );
}

function createStep6SuccessResult(snapshot, options = {}) {
  const result = {
    step6Outcome: 'success',
    state: snapshot?.state || 'verification_page',
    url: snapshot?.url || location.href,
    via: options.via || '',
    loginVerificationRequestedAt: options.loginVerificationRequestedAt || null,
  };

  if (options.skipLoginVerificationStep) {
    result.skipLoginVerificationStep = true;
  }
  if (options.directOAuthConsentPage) {
    result.directOAuthConsentPage = true;
  }

  return result;
}

function createStep6OAuthConsentSuccessResult(snapshot, options = {}) {
  return createStep6SuccessResult(snapshot, {
    ...options,
    via: options.via || 'oauth_consent_page',
    loginVerificationRequestedAt: null,
    skipLoginVerificationStep: true,
    directOAuthConsentPage: true,
  });
}

function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return {
    step6Outcome: 'recoverable',
    reason,
    state: snapshot?.state || 'unknown',
    url: snapshot?.url || location.href,
    message: options.message || '',
    loginVerificationRequestedAt: options.loginVerificationRequestedAt || null,
  };
}

async function createStep6LoginTimeoutRecoveryTransition(reason, snapshot, message, options = {}) {
  const {
    loginVerificationRequestedAt = null,
    via = 'login_timeout_recovered',
  } = options;
  let resolvedSnapshot = normalizeStep6Snapshot(snapshot || inspectLoginAuthState());
  let recovered = false;
  if (resolvedSnapshot?.state === 'login_timeout_error_page') {
    try {
      const recoveryResult = await recoverCurrentAuthRetryPage({
        flow: 'login',
        logLabel: '步骤 7：检测到登录超时报错，正在点击“重试”恢复当前页面',
        step: 7,
        timeoutMs: 12000,
      });
      recovered = Boolean(recoveryResult?.recovered);
      if (recovered) {
        log('步骤 7：登录超时报错页已点击“重试”，正在按恢复后的页面状态继续当前流程。', 'warn');
      }
    } catch (error) {
      if (/CF_SECURITY_BLOCKED::/i.test(String(error?.message || error || ''))) {
        throw error;
      }
      log(`步骤 7：登录超时报错页自动点击“重试”失败：${error.message}`, 'warn');
    }
  }

  resolvedSnapshot = recovered
    ? normalizeStep6Snapshot(await waitForKnownLoginAuthState(4000))
    : normalizeStep6Snapshot(inspectLoginAuthState());

  if (resolvedSnapshot.state === 'verification_page') {
    return {
      action: 'done',
      result: createStep6SuccessResult(resolvedSnapshot, {
        via,
        loginVerificationRequestedAt,
      }),
    };
  }

  if (resolvedSnapshot.state === 'oauth_consent_page') {
    return {
      action: 'done',
      result: createStep6OAuthConsentSuccessResult(resolvedSnapshot, {
        via,
      }),
    };
  }

  if (resolvedSnapshot.state === 'password_page') {
    log('步骤 7：登录超时报错页恢复后已进入密码页，继续当前登录流程。', 'warn');
    return { action: 'password', snapshot: resolvedSnapshot };
  }

  if (resolvedSnapshot.state === 'email_page') {
    log('步骤 7：登录超时报错页恢复后已回到邮箱输入页，继续当前登录流程。', 'warn');
    return { action: 'email', snapshot: resolvedSnapshot };
  }

  return {
    action: 'recoverable',
    result: createStep6RecoverableResult(reason, resolvedSnapshot, {
      message,
      loginVerificationRequestedAt,
    }),
  };
}

async function createStep6LoginTimeoutRecoverableResult(reason, snapshot, message) {
  const transition = await createStep6LoginTimeoutRecoveryTransition(reason, snapshot, message);
  if (transition?.action === 'done' || transition?.action === 'recoverable') {
    return transition.result;
  }

  return createStep6RecoverableResult(reason, transition?.snapshot || normalizeStep6Snapshot(inspectLoginAuthState()), {
    message,
  });
}

async function finalizeStep6VerificationReady(options = {}) {
  const {
    logLabel = '步骤 7 收尾',
    loginVerificationRequestedAt = null,
    timeout = 12000,
    via = 'verification_page_ready',
  } = options;
  const start = Date.now();
  const maxRounds = 3;
  const settleDelayMs = 3000;
  let round = 0;

  while (Date.now() - start < timeout && round < maxRounds) {
    throwIfStopped();
    round += 1;
    log(`${logLabel}：确认页面是否稳定停留在登录验证码阶段（第 ${round}/${maxRounds} 轮，先等待 3 秒）...`, 'info');
    await sleep(settleDelayMs);

    const rawSnapshot = inspectLoginAuthState();
    const snapshot = normalizeStep6Snapshot(rawSnapshot);

    if (snapshot.state === 'verification_page') {
      log(`${logLabel}：登录验证码页面已稳定就绪。`, 'ok');
      return createStep6SuccessResult(snapshot, {
        via,
        loginVerificationRequestedAt,
      });
    }

    if (snapshot.state === 'oauth_consent_page') {
      log(`${logLabel}：认证页已直接进入 OAuth 授权页，跳过登录验证码步骤。`, 'ok');
      return createStep6OAuthConsentSuccessResult(snapshot, {
        via: `${via}_oauth_consent`,
      });
    }

    if (snapshot.state === 'login_timeout_error_page') {
      log(`${logLabel}：页面进入登录超时报错页，准备自动恢复后重试步骤 7。`, 'warn');
      return createStep6LoginTimeoutRecoverableResult(
        'login_timeout_error_page',
        snapshot,
        '登录验证码页面准备就绪前进入登录超时报错页。'
      );
    }

    if (snapshot.state === 'password_page' || snapshot.state === 'email_page') {
      return createStep6RecoverableResult('verification_page_unstable', snapshot, {
        message: `页面曾进入登录验证码阶段，但又回到了${getLoginAuthStateLabel(snapshot)}，准备重新执行步骤 7。`,
        loginVerificationRequestedAt,
      });
    }

    if (snapshot.state === 'add_phone_page') {
      throw new Error(`登录验证码页面准备过程中页面进入手机号页面。URL: ${snapshot.url}`);
    }
  }

  const rawSnapshot = inspectLoginAuthState();
  const snapshot = normalizeStep6Snapshot(rawSnapshot);
  if (snapshot.state === 'verification_page') {
    log(`${logLabel}：登录验证码页面已稳定就绪。`, 'ok');
    return createStep6SuccessResult(snapshot, {
      via,
      loginVerificationRequestedAt,
    });
  }
  if (snapshot.state === 'oauth_consent_page') {
    log(`${logLabel}：认证页已直接进入 OAuth 授权页，跳过登录验证码步骤。`, 'ok');
    return createStep6OAuthConsentSuccessResult(snapshot, {
      via: `${via}_oauth_consent`,
    });
  }
  if (snapshot.state === 'login_timeout_error_page') {
    log(`${logLabel}：页面进入登录超时报错页，准备自动恢复后重试步骤 7。`, 'warn');
    return createStep6LoginTimeoutRecoverableResult(
      'login_timeout_error_page',
      snapshot,
      '登录验证码页面准备就绪前进入登录超时报错页。'
    );
  }
  if (snapshot.state === 'password_page' || snapshot.state === 'email_page') {
    return createStep6RecoverableResult('verification_page_unstable', snapshot, {
      message: `页面曾进入登录验证码阶段，但又回到了${getLoginAuthStateLabel(snapshot)}，准备重新执行步骤 7。`,
      loginVerificationRequestedAt,
    });
  }

  return createStep6RecoverableResult('verification_page_finalize_unknown', snapshot, {
    message: '登录验证码页面状态在收尾确认阶段未稳定，准备重新执行步骤 7。',
    loginVerificationRequestedAt,
  });
}

function normalizeStep6Snapshot(snapshot) {
  return snapshot;
}

function throwForStep6FatalState(snapshot) {
  snapshot = normalizeStep6Snapshot(snapshot);
  switch (snapshot?.state) {
    case 'oauth_consent_page':
      return;
    case 'add_phone_page':
      throw new Error(`当前页面已进入手机号页面，未经过登录验证码页，无法完成步骤 7。URL: ${snapshot.url}`);
    case 'unknown':
      throw new Error(`无法识别当前登录页面状态。URL: ${snapshot?.url || location.href}`);
    default:
      return;
  }
}

async function triggerLoginSubmitAction(button, fallbackField) {
  const form = button?.form || fallbackField?.form || button?.closest?.('form') || fallbackField?.closest?.('form') || null;

  await humanPause(400, 1100);
  if (button && isActionEnabled(button)) {
    simulateClick(button);
    return;
  }

  if (form && typeof form.requestSubmit === 'function') {
    if (button && button.form === form) {
      form.requestSubmit(button);
    } else {
      form.requestSubmit();
    }
    return;
  }

  if (button && typeof button.click === 'function') {
    button.click();
    return;
  }

  throw new Error('未找到可用的登录提交按钮。URL: ' + location.href);
}

function isSignupPasswordErrorPage() {
  return Boolean(getSignupPasswordTimeoutErrorPageState());
}

function isSignupEmailAlreadyExistsPage() {
  return isSignupPasswordPage() && SIGNUP_EMAIL_EXISTS_PATTERN.test(getPageTextSnapshot());
}

function inspectSignupVerificationState() {
  const postVerificationState = getStep4PostVerificationState();
  if (postVerificationState?.state === 'step5') {
    return { state: 'step5' };
  }

  if (postVerificationState?.state === 'logged_in_home') {
    return {
      state: 'logged_in_home',
      skipProfileStep: true,
      url: postVerificationState.url || location.href,
    };
  }

  if (isSignupPasswordErrorPage()) {
    const timeoutPage = getSignupPasswordTimeoutErrorPageState();
    return {
      state: 'error',
      retryButton: timeoutPage?.retryButton || null,
      userAlreadyExistsBlocked: Boolean(timeoutPage?.userAlreadyExistsBlocked),
    };
  }

  if (isVerificationPageStillVisible()) {
    return { state: 'verification' };
  }

  if (isSignupEmailAlreadyExistsPage()) {
    return { state: 'email_exists' };
  }

  const passwordInput = getSignupPasswordInput();
  if (passwordInput) {
    return {
      state: 'password',
      passwordInput,
      submitButton: getSignupPasswordSubmitButton({ allowDisabled: true }),
    };
  }

  return { state: 'unknown' };
}

async function waitForSignupVerificationTransition(timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const snapshot = inspectSignupVerificationState();
    if (
      snapshot.state === 'step5'
      || snapshot.state === 'logged_in_home'
      || snapshot.state === 'verification'
      || snapshot.state === 'error'
      || snapshot.state === 'email_exists'
    ) {
      return snapshot;
    }

    await sleep(200);
  }

  return inspectSignupVerificationState();
}

async function prepareSignupVerificationFlow(payload = {}, timeout = 30000) {
  const { password } = payload;
  const prepareSource = String(payload?.prepareSource || '').trim() || 'step4_execute';
  const prepareLogLabel = String(payload?.prepareLogLabel || '').trim()
    || (prepareSource === 'step3_finalize' ? '步骤 3 收尾' : '步骤 4 执行');
  const start = Date.now();
  let recoveryRound = 0;
  const maxRecoveryRounds = 3;
  let passwordPageDiagnosticsLogged = false;

  while (Date.now() - start < timeout && recoveryRound < maxRecoveryRounds) {
    throwIfStopped();

    const roundNo = recoveryRound + 1;
    log(`${prepareLogLabel}：等待页面进入验证码阶段（第 ${roundNo}/${maxRecoveryRounds} 轮，先等待 5 秒）...`, 'info');
    const snapshot = await waitForSignupVerificationTransition(5000);

    if (snapshot.state === 'step5') {
      log(`${prepareLogLabel}：页面已进入验证码后的下一阶段，本步骤按已完成处理。`, 'ok');
      return { ready: true, alreadyVerified: true, retried: recoveryRound, prepareSource };
    }

    if (snapshot.state === 'logged_in_home') {
      /*
      log(`${prepareLogLabel}锛氶〉闈㈠凡鐩存帴杩涘叆 ChatGPT 宸茬櫥褰曟€侊紝鏈楠?鎸夊凡瀹屾垚澶勭悊锛屽苟灏嗚烦杩囨楠?5銆俙, 'ok');
      */
      log(`${prepareLogLabel}：页面已直接进入 ChatGPT 已登录态，本步骤按已完成处理，并将跳过步骤 5。`, 'ok');
      return {
        ready: true,
        alreadyVerified: true,
        skipProfileStep: true,
        retried: recoveryRound,
        prepareSource,
      };
    }

    if (snapshot.state === 'verification') {
      log(`${prepareLogLabel}：验证码页面已就绪${recoveryRound ? `（期间自动恢复 ${recoveryRound} 次）` : ''}。`, 'ok');
      return { ready: true, retried: recoveryRound, prepareSource };
    }

    if (snapshot.state === 'email_exists') {
      throw new Error('当前邮箱已存在，需要重新开始新一轮。');
    }

    recoveryRound += 1;

    if (snapshot.state === 'error') {
      if (snapshot.userAlreadyExistsBlocked) {
        throw createSignupUserAlreadyExistsError();
      }
      await recoverCurrentAuthRetryPage({
        flow: 'signup',
        logLabel: `${prepareLogLabel}：检测到注册认证重试页，正在点击“重试”恢复（第 ${recoveryRound}/${maxRecoveryRounds} 次）`,
        step: 4,
        timeoutMs: 12000,
      });
      continue;
    }

    if (snapshot.state === 'password') {
      if (!passwordPageDiagnosticsLogged) {
        passwordPageDiagnosticsLogged = true;
        logSignupPasswordDiagnostics(`${prepareLogLabel}：页面仍停留在密码页`);
      }
      if (!password) {
        throw new Error('当前回到了密码页，但没有可用密码，无法自动重新提交。');
      }

      if ((snapshot.passwordInput.value || '') !== password) {
        log(`${prepareLogLabel}：页面仍停留在密码页，正在重新填写密码...`, 'warn');
        await humanPause(450, 1100);
        fillInput(snapshot.passwordInput, password);
      }

      if (snapshot.submitButton && isActionEnabled(snapshot.submitButton)) {
        log(`${prepareLogLabel}：页面仍停留在密码页，正在重新点击“继续”（第 ${recoveryRound}/${maxRecoveryRounds} 次）...`, 'warn');
        await humanPause(350, 900);
        simulateClick(snapshot.submitButton);
        await sleep(1200);
        continue;
      }

      log(`${prepareLogLabel}：页面仍停留在密码页，但“继续”按钮暂不可用，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
      continue;
    }

    log(`${prepareLogLabel}：页面仍在切换中，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
  }

  throw new Error(`等待注册验证码页面就绪超时或自动恢复失败（已尝试 ${recoveryRound}/${maxRecoveryRounds} 轮）。URL: ${location.href}`);
}


async function waitForVerificationSubmitOutcome(step, timeout) {
  const resolvedTimeout = timeout ?? (step === 8 ? 30000 : 12000);
  const start = Date.now();
  let recoveryCount = 0;
  const maxRecoveryCount = 2;

  while (Date.now() - start < resolvedTimeout) {
    throwIfStopped();

    const retryFlow = step === 4 ? 'signup' : 'login';
    const retryState = getCurrentAuthRetryPageState(retryFlow);
    if (retryState?.userAlreadyExistsBlocked) {
      throw createSignupUserAlreadyExistsError();
    }
    if (retryState) {
      if (recoveryCount >= maxRecoveryCount) {
        throw new Error(`步骤 ${step}：验证码提交后连续进入认证重试页 ${maxRecoveryCount} 次，页面仍未恢复。URL: ${location.href}`);
      }
      recoveryCount += 1;
      log(`步骤 ${step}：验证码提交后进入认证重试页，正在自动恢复（${recoveryCount}/${maxRecoveryCount}）...`, 'warn');
      await recoverCurrentAuthRetryPage({
        flow: retryFlow,
        logLabel: `步骤 ${step}：验证码提交后检测到认证重试页，正在点击“重试”恢复`,
        step,
        timeoutMs: 12000,
      });
      continue;
    }

    if (step === 4) {
      const postVerificationState = getStep4PostVerificationState();
      if (postVerificationState?.state === 'logged_in_home') {
        return {
          success: true,
          skipProfileStep: true,
          url: postVerificationState.url || location.href,
        };
      }
      if (postVerificationState?.state === 'step5') {
        return { success: true };
      }
    }

    const errorText = getVerificationErrorText();
    if (errorText) {
      return { invalidCode: true, errorText };
    }

    if (step === 8 && isStep8Ready()) {
      return { success: true };
    }

    if (step === 8 && isAddPhonePageReady()) {
      return { success: true, addPhonePage: true, url: location.href };
    }

    await sleep(150);
  }

  if (step === 4) {
    const signupRetryState = getCurrentAuthRetryPageState('signup');
    if (signupRetryState?.userAlreadyExistsBlocked) {
      throw createSignupUserAlreadyExistsError();
    }

    const postVerificationState = getStep4PostVerificationState();
    if (postVerificationState?.state === 'logged_in_home') {
      return {
        success: true,
        skipProfileStep: true,
        url: postVerificationState.url || location.href,
      };
    }
    if (postVerificationState?.state === 'step5') {
      return { success: true };
    }
  }

  if (isVerificationPageStillVisible()) {
    return {
      invalidCode: true,
      errorText: getVerificationErrorText() || '提交后仍停留在验证码页面，准备重新发送验证码。',
    };
  }

  return { success: true, assumed: true };
}

function getVerificationSubmitButtonForTarget(codeInput, options = {}) {
  const { allowDisabled = false } = options;
  const form = codeInput?.form || codeInput?.closest?.('form') || null;
  const isUsableAction = (element) => {
    if (!element || !isVisibleElement(element)) return false;
    return allowDisabled || isActionEnabled(element);
  };

  const findSubmitInRoot = (root) => {
    if (!root?.querySelectorAll) return null;

    const directCandidates = root.querySelectorAll('button[type="submit"], input[type="submit"]');
    for (const element of directCandidates) {
      if (isUsableAction(element)) {
        return element;
      }
    }

    const textCandidates = root.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
    return Array.from(textCandidates).find((element) => {
      if (!isUsableAction(element)) return false;
      const text = getActionText(element);
      return /verify|confirm|submit|continue|确认|验证|继续/i.test(text);
    }) || null;
  };

  return findSubmitInRoot(form) || findSubmitInRoot(document);
}

async function waitForVerificationSubmitButton(codeInput, timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (is405MethodNotAllowedPage()) {
      throw new Error('当前页面处于 405 错误恢复流程中，暂时无法定位验证码提交按钮。');
    }

    const button = getVerificationSubmitButtonForTarget(codeInput, { allowDisabled: false });
    if (button) {
      return button;
    }

    await sleep(150);
  }

  return null;
}

async function waitForVerificationCodeTarget(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (is405MethodNotAllowedPage()) {
      throw new Error('当前页面处于 405 错误恢复流程中，暂时无法定位验证码输入框。');
    }

    const target = getVerificationCodeTarget();
    if (target) {
      return target;
    }

    await sleep(150);
  }

  throw new Error('未找到验证码输入框。URL: ' + location.href);
}

async function waitForSplitVerificationInputsFilled(inputs, code, timeout = 2500) {
  const expected = String(code || '').slice(0, 6);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const current = Array.from(inputs || [])
      .slice(0, expected.length)
      .map((input) => String(input?.value || '').trim())
      .join('');

    if (current === expected) {
      return true;
    }

    await sleep(100);
  }

  return false;
}

async function fillVerificationCode(step, payload) {
  const { code } = payload;
  if (!code) throw new Error('未提供验证码。');

  if (step === 4 && isStep5Ready()) {
    log(`步骤 ${step}：检测到页面已进入下一阶段，本次验证码提交按成功处理。`, 'ok');
    return { success: true, assumed: true, alreadyAdvanced: true };
  }
  if (step === 8) {
    if (isStep8Ready()) {
      log(`步骤 ${step}：检测到页面已进入 OAuth 同意页，本次验证码提交按成功处理。`, 'ok');
      return { success: true, assumed: true, alreadyAdvanced: true };
    }
    if (isAddPhonePageReady()) {
      return { success: true, addPhonePage: true, url: location.href };
    }
  }

  log(`步骤 ${step}：正在填写验证码：${code}`);

  if (step === 8) {
    await waitForLoginVerificationPageReady();
  }

  // Find code input — could be a single input or multiple separate inputs
  // Retry with 405 error recovery if needed
  const maxRetries = 3;
  let codeInput = null;
  let splitInputs = null;

  for (let retry = 0; retry <= maxRetries; retry++) {
    throwIfStopped();

    // Before looking for input, check if page is in 405 error state
    if (is405MethodNotAllowedPage()) {
      log(`步骤 ${step}：检测到 405 错误页面，正在恢复...`, 'warn');
      await handle405ResendError(step, 30000);
      continue;
    }

    try {
      const verificationTarget = await waitForVerificationCodeTarget(10000);
      if (verificationTarget.type === 'split') {
        splitInputs = verificationTarget.elements;
      } else {
        codeInput = verificationTarget.element;
      }
      break; // Found it
    } catch {
      // No input found — check if it's a 405 error and can be recovered
      if (is405MethodNotAllowedPage() && retry < maxRetries) {
        log(`步骤 ${step}：未找到验证码输入框且页面出现 405 错误，正在恢复...`, 'warn');
        await handle405ResendError(step, 30000);
        continue;
      }

      throw new Error('未找到验证码输入框。URL: ' + location.href);
    }
  }

  if (splitInputs?.length >= 6) {
    log(`步骤 ${step}：发现分开的单字符验证码输入框，正在逐个填写...`);
    for (let i = 0; i < 6 && i < splitInputs.length; i++) {
      const targetInput = splitInputs[i];
      try {
        targetInput.focus?.();
      } catch {}
      fillInput(splitInputs[i], code[i]);
      try {
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: code[i], bubbles: true }));
      } catch {}
      await sleep(100);
    }
    const filled = await waitForSplitVerificationInputsFilled(splitInputs, code, 2500);
    if (!filled) {
      const current = Array.from(splitInputs)
        .slice(0, 6)
        .map((input) => String(input?.value || '').trim() || '_')
        .join('');
      log(`步骤 ${step}：分格验证码输入框未稳定呈现目标值，当前页面值为 ${current}，准备继续观察提交流程。`, 'warn');
    } else {
      log(`步骤 ${step}：分格验证码输入框已稳定显示 ${code}。`, 'info');
    }

    await sleep(800);
    const splitSubmitBtn = await waitForVerificationSubmitButton(splitInputs[0], 2000).catch(() => null);
    if (splitSubmitBtn) {
      await humanPause(450, 1200);
      simulateClick(splitSubmitBtn);
      log(`步骤 ${step}：分格验证码已提交`);
    } else {
      log(`步骤 ${step}：分格验证码页面未找到可点击提交按钮，继续等待页面自动推进。`, 'info');
    }

    const outcome = await waitForVerificationSubmitOutcome(step);
    if (outcome.invalidCode) {
      log(`步骤 ${step}：验证码被拒绝：${outcome.errorText}`, 'warn');
    } else if (outcome.addPhonePage) {
      log(`步骤 ${step}：验证码提交后页面进入手机号页面，当前流程将停止自动授权。`, 'warn');
    } else {
      log(`步骤 ${step}：验证码已通过${outcome.assumed ? '（按成功推定）' : ''}。`, 'ok');
    }
    return outcome;
  }

  if (!codeInput) {
    throw new Error('未找到验证码输入框。URL: ' + location.href);
  }

  fillInput(codeInput, code);
  log(`步骤 ${step}：验证码已填写`);

  // Submit
  await sleep(800);
  const submitBtn = await waitForVerificationSubmitButton(codeInput, 5000).catch(() => null);

  if (submitBtn) {
    await humanPause(450, 1200);
    simulateClick(submitBtn);
    log(`步骤 ${step}：验证码已提交`);
  } else {
    log(`步骤 ${step}：未找到可提交的验证码按钮，先等待页面自动推进或反馈结果。`, 'warn');
  }

  const outcome = await waitForVerificationSubmitOutcome(step);
  if (outcome.invalidCode) {
    log(`步骤 ${step}：验证码被拒绝：${outcome.errorText}`, 'warn');
  } else if (outcome.addPhonePage) {
    log(`步骤 ${step}：验证码提交后页面进入手机号页面，当前流程将停止自动授权。`, 'warn');
  } else {
    log(`步骤 ${step}：验证码已通过${outcome.assumed ? '（按成功推定）' : ''}。`, 'ok');
  }

  return outcome;
}

// ============================================================
// Step 7: Login with registered account (on OAuth auth page)
// ============================================================

function getStep6OptionMessage(value, snapshot) {
  return typeof value === 'function' ? value(snapshot) : String(value || '');
}

async function resolveStep6PostSubmitSnapshot(snapshot, options = {}) {
  const normalizedSnapshot = normalizeStep6Snapshot(snapshot || inspectLoginAuthState());
  const {
    via = 'post_submit',
    loginVerificationRequestedAt = null,
    oauthConsentVia = `${via}_oauth_consent`,
    timeoutRecoveryReason = 'login_timeout_error_page',
    timeoutRecoveryMessage = '登录提交后进入登录超时报错页。',
    timeoutRecoveryVia = `${via}_timeout_recovered`,
    allowPasswordAction = false,
    allowEmailAction = false,
    allowFinalPasswordAction = false,
    allowFinalEmailAction = false,
    allowFinalSwitchAction = false,
    final = false,
    addPhoneMessage,
  } = options;

  if (normalizedSnapshot.state === 'verification_page') {
    return {
      action: 'done',
      result: createStep6SuccessResult(normalizedSnapshot, {
        via,
        loginVerificationRequestedAt,
      }),
    };
  }

  if (normalizedSnapshot.state === 'oauth_consent_page') {
    return {
      action: 'done',
      result: createStep6OAuthConsentSuccessResult(normalizedSnapshot, {
        via: oauthConsentVia,
      }),
    };
  }

  if (normalizedSnapshot.state === 'login_timeout_error_page') {
    const transition = await createStep6LoginTimeoutRecoveryTransition(
      timeoutRecoveryReason,
      normalizedSnapshot,
      timeoutRecoveryMessage,
      {
        loginVerificationRequestedAt,
        via: timeoutRecoveryVia,
      }
    );
    if (transition.action === 'done') {
      return {
        action: 'done',
        result: transition.result,
      };
    }
    if (transition.action === 'password') {
      return { action: 'password', snapshot: transition.snapshot };
    }
    if (transition.action === 'email') {
      return { action: 'email', snapshot: transition.snapshot };
    }
    return {
      action: 'recoverable',
      result: transition.result,
    };
  }

  if (normalizedSnapshot.state === 'password_page') {
    if (allowPasswordAction || (final && allowFinalPasswordAction)) {
      return { action: 'password', snapshot: normalizedSnapshot };
    }
    if (final && allowFinalSwitchAction && normalizedSnapshot.switchTrigger) {
      return { action: 'switch', snapshot: normalizedSnapshot };
    }
  }

  if (normalizedSnapshot.state === 'email_page' && (allowEmailAction || (final && allowFinalEmailAction))) {
    return { action: 'email', snapshot: normalizedSnapshot };
  }

  if (normalizedSnapshot.state === 'add_phone_page') {
    const message = getStep6OptionMessage(addPhoneMessage, normalizedSnapshot)
      || `登录提交后页面进入手机号页面。URL: ${normalizedSnapshot.url || location.href}`;
    throw new Error(message);
  }

  return null;
}

async function waitForStep6PostSubmitTransition(options = {}) {
  const {
    timeout = 10000,
    stalledReason = 'post_submit_stalled',
    stalledMessage = '登录提交后未进入可识别的下一页。',
  } = options;
  const start = Date.now();
  let snapshot = normalizeStep6Snapshot(inspectLoginAuthState());

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = normalizeStep6Snapshot(inspectLoginAuthState());
    const transition = await resolveStep6PostSubmitSnapshot(snapshot, {
      ...options,
      final: false,
    });
    if (transition) {
      return transition;
    }
    await sleep(250);
  }

  snapshot = normalizeStep6Snapshot(inspectLoginAuthState());
  const transition = await resolveStep6PostSubmitSnapshot(snapshot, {
    ...options,
    final: true,
  });
  if (transition) {
    return transition;
  }

  return {
    action: 'recoverable',
    result: createStep6RecoverableResult(stalledReason, snapshot, {
      message: stalledMessage,
      loginVerificationRequestedAt: options.loginVerificationRequestedAt || null,
    }),
  };
}

async function waitForStep6EmailSubmitTransition(emailSubmittedAt, timeout = 12000) {
  return waitForStep6PostSubmitTransition({
    timeout,
    via: 'email_submit',
    oauthConsentVia: 'email_submit_oauth_consent',
    loginVerificationRequestedAt: emailSubmittedAt,
    timeoutRecoveryMessage: '提交邮箱后进入登录超时报错页。',
    timeoutRecoveryVia: 'email_submit_timeout_recovered',
    allowPasswordAction: true,
    stalledReason: 'email_submit_stalled',
    stalledMessage: '提交邮箱后长时间未进入密码页或登录验证码页。',
    addPhoneMessage: (snapshot) => `提交邮箱后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`,
  });
}

async function waitForStep6PasswordSubmitTransition(passwordSubmittedAt, timeout = 10000) {
  return waitForStep6PostSubmitTransition({
    timeout,
    via: 'password_submit',
    oauthConsentVia: 'password_submit_oauth_consent',
    loginVerificationRequestedAt: passwordSubmittedAt,
    timeoutRecoveryMessage: '提交密码后进入登录超时报错页。',
    timeoutRecoveryVia: 'password_submit_timeout_recovered',
    allowFinalSwitchAction: true,
    stalledReason: 'password_submit_stalled',
    stalledMessage: '提交密码后仍未进入登录验证码页。',
    addPhoneMessage: (snapshot) => `提交密码后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`,
  });
}

async function waitForStep6SwitchTransition(loginVerificationRequestedAt, timeout = 10000) {
  const transition = await waitForStep6PostSubmitTransition({
    timeout,
    via: 'switch_to_one_time_code_login',
    oauthConsentVia: 'switch_to_one_time_code_oauth_consent',
    loginVerificationRequestedAt,
    timeoutRecoveryMessage: '切换到一次性验证码登录后进入登录超时报错页。',
    timeoutRecoveryVia: 'switch_to_one_time_code_timeout_recovered',
    stalledReason: 'one_time_code_switch_stalled',
    stalledMessage: '点击一次性验证码登录后仍未进入登录验证码页。',
    addPhoneMessage: (snapshot) => `切换到一次性验证码登录后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`,
  });

  if (transition.action === 'done' || transition.action === 'recoverable') {
    return transition.result;
  }
  return transition;
}

async function waitForLoginEntryOpenTransition(timeout = 10000) {
  const start = Date.now();
  let snapshot = normalizeStep6Snapshot(inspectLoginAuthState());

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = normalizeStep6Snapshot(inspectLoginAuthState());
    if (snapshot.state !== 'unknown' && snapshot.state !== 'entry_page') {
      return snapshot;
    }
    await sleep(250);
  }

  return snapshot;
}

async function step6OpenLoginEntry(payload, snapshot) {
  const currentSnapshot = normalizeStep6Snapshot(snapshot || inspectLoginAuthState());
  const trigger = currentSnapshot.loginEntryTrigger || findLoginEntryTrigger();
  if (!trigger || !isActionEnabled(trigger)) {
    return createStep6RecoverableResult('missing_login_entry_trigger', currentSnapshot, {
      message: '当前登录入口页没有可点击的邮箱登录入口。',
    });
  }

  log(`步骤 7：检测到登录入口页，正在点击 "${getActionText(trigger).slice(0, 80)}"...`);
  await humanPause(350, 900);
  simulateClick(trigger);
  const nextSnapshot = await waitForLoginEntryOpenTransition();

  if (nextSnapshot.state === 'email_page') {
    return step6LoginFromEmailPage(payload, nextSnapshot);
  }
  if (nextSnapshot.state === 'password_page') {
    return step6LoginFromPasswordPage(payload, nextSnapshot);
  }
  if (nextSnapshot.state === 'verification_page') {
    return finalizeStep6VerificationReady({
      logLabel: '步骤 7 收尾',
      loginVerificationRequestedAt: null,
      via: 'entry_open_verification_page',
    });
  }
  if (nextSnapshot.state === 'oauth_consent_page') {
    return createStep6OAuthConsentSuccessResult(nextSnapshot, {
      via: 'entry_open_oauth_consent_page',
    });
  }
  if (nextSnapshot.state === 'login_timeout_error_page') {
    const transition = await createStep6LoginTimeoutRecoveryTransition(
      'login_timeout_after_entry_open',
      nextSnapshot,
      '点击登录入口后进入登录超时报错页。'
    );
    if (transition.action === 'done') return transition.result;
    if (transition.action === 'email') return step6LoginFromEmailPage(payload, transition.snapshot);
    if (transition.action === 'password') return step6LoginFromPasswordPage(payload, transition.snapshot);
    return transition.result;
  }

  return createStep6RecoverableResult('login_entry_open_stalled', nextSnapshot, {
    message: '点击登录入口后仍未进入邮箱/密码/验证码页。',
  });
}

async function step6SwitchToOneTimeCodeLogin(payload, snapshot) {
  const switchTrigger = snapshot?.switchTrigger || findOneTimeCodeLoginTrigger();
  if (!switchTrigger || !isActionEnabled(switchTrigger)) {
    return createStep6RecoverableResult('missing_one_time_code_trigger', normalizeStep6Snapshot(inspectLoginAuthState()), {
      message: '当前登录页没有可用的一次性验证码登录入口。',
    });
  }

  log('步骤 7：已检测到一次性验证码登录入口，准备切换...');
  const loginVerificationRequestedAt = Date.now();
  await humanPause(350, 900);
  simulateClick(switchTrigger);
  log('步骤 7：已点击一次性验证码登录');
  await sleep(1200);
  const result = await waitForStep6SwitchTransition(loginVerificationRequestedAt);
  if (result?.step6Outcome === 'success') {
    if (result.skipLoginVerificationStep) {
      return result;
    }
    return finalizeStep6VerificationReady({
      logLabel: '步骤 7 收尾',
      loginVerificationRequestedAt: result.loginVerificationRequestedAt || loginVerificationRequestedAt,
      via: result.via || 'switch_to_one_time_code_login',
    });
  }
  if (result?.action === 'password') {
    return step6LoginFromPasswordPage(payload, result.snapshot);
  }
  if (result?.action === 'email') {
    return step6LoginFromEmailPage(payload, result.snapshot);
  }
  return result;
}

async function step6LoginFromPasswordPage(payload, snapshot) {
  const currentSnapshot = normalizeStep6Snapshot(snapshot || inspectLoginAuthState());
  const hasPassword = Boolean(String(payload?.password || '').trim());

  if (currentSnapshot.passwordInput) {
    if (!hasPassword) {
      if (currentSnapshot.switchTrigger) {
        log('步骤 7：当前未提供密码，改走一次性验证码登录。', 'warn');
        return step6SwitchToOneTimeCodeLogin(payload, currentSnapshot);
      }

      return createStep6RecoverableResult('missing_password_and_one_time_code_trigger', currentSnapshot, {
        message: '登录时未提供密码，且当前页面没有可用的一次性验证码登录入口。',
      });
    }

    log('步骤 7：已进入密码页，准备填写密码...');
    await humanPause(550, 1450);
    fillInput(currentSnapshot.passwordInput, payload.password);
    log('步骤 7：已填写密码');

    await sleep(500);
    const passwordSubmittedAt = Date.now();
    await triggerLoginSubmitAction(currentSnapshot.submitButton, currentSnapshot.passwordInput);
    log('步骤 7：已提交密码');

    const transition = await waitForStep6PasswordSubmitTransition(passwordSubmittedAt);
    if (transition.action === 'done') {
      if (transition.result?.skipLoginVerificationStep) {
        return transition.result;
      }
      return finalizeStep6VerificationReady({
        logLabel: '步骤 7 收尾',
        loginVerificationRequestedAt: transition.result.loginVerificationRequestedAt || passwordSubmittedAt,
        via: transition.result.via || 'password_submit',
      });
    }
    if (transition.action === 'recoverable') {
      log(`步骤 7：${transition.result.message || '提交密码后仍未进入登录验证码页面，准备重新执行步骤 7。'}`, 'warn');
      return transition.result;
    }
    if (transition.action === 'password') {
      return step6LoginFromPasswordPage(payload, transition.snapshot);
    }
    if (transition.action === 'email') {
      return step6LoginFromEmailPage(payload, transition.snapshot);
    }
    if (transition.action === 'switch') {
      return step6SwitchToOneTimeCodeLogin(payload, transition.snapshot);
    }

    return createStep6RecoverableResult('password_submit_unknown', normalizeStep6Snapshot(inspectLoginAuthState()), {
      message: '提交密码后未得到可用的下一步状态。',
    });
  }

  if (currentSnapshot.switchTrigger) {
    return step6SwitchToOneTimeCodeLogin(payload, currentSnapshot);
  }

  return createStep6RecoverableResult('password_page_unactionable', currentSnapshot, {
    message: '当前停留在登录页，但没有可提交密码的输入框，也没有一次性验证码登录入口。',
  });
}

async function step6LoginFromEmailPage(payload, snapshot) {
  const currentSnapshot = normalizeStep6Snapshot(snapshot || inspectLoginAuthState());
  const emailInput = currentSnapshot.emailInput || getLoginEmailInput();
  if (!emailInput) {
    throw new Error('在登录页未找到邮箱输入框。URL: ' + location.href);
  }

  if ((emailInput.value || '').trim() !== payload.email) {
    await humanPause(500, 1400);
    fillInput(emailInput, payload.email);
    log('步骤 7：已填写邮箱');
  } else {
    log('步骤 7：邮箱已在输入框中，准备提交...');
  }

  await sleep(500);
  const emailSubmittedAt = Date.now();
  await triggerLoginSubmitAction(currentSnapshot.submitButton, emailInput);
  log('步骤 7：已提交邮箱');

  const transition = await waitForStep6EmailSubmitTransition(emailSubmittedAt);
  if (transition.action === 'done') {
    if (transition.result?.skipLoginVerificationStep) {
      return transition.result;
    }
    return finalizeStep6VerificationReady({
      logLabel: '步骤 7 收尾',
      loginVerificationRequestedAt: transition.result.loginVerificationRequestedAt || emailSubmittedAt,
      via: transition.result.via || 'email_submit',
    });
  }
  if (transition.action === 'recoverable') {
    log(`步骤 7：${transition.result.message || '提交邮箱后仍未进入目标页面，准备重新执行步骤 7。'}`, 'warn');
    return transition.result;
  }
  if (transition.action === 'email') {
    return step6LoginFromEmailPage(payload, transition.snapshot);
  }
  if (transition.action === 'password') {
    return step6LoginFromPasswordPage(payload, transition.snapshot);
  }

  return createStep6RecoverableResult('email_submit_unknown', normalizeStep6Snapshot(inspectLoginAuthState()), {
    message: '提交邮箱后未得到可用的下一步状态。',
  });
}

async function step6_login(payload) {
  const { email } = payload;
  if (!email) throw new Error('登录时缺少邮箱地址。');

  const snapshot = normalizeStep6Snapshot(await waitForKnownLoginAuthState(15000));

  if (snapshot.state === 'verification_page') {
    log('步骤 7：认证页已在登录验证码页，开始确认页面是否稳定。');
    return finalizeStep6VerificationReady({
      logLabel: '步骤 7 收尾',
      loginVerificationRequestedAt: null,
      via: 'already_on_verification_page',
    });
  }

  if (snapshot.state === 'oauth_consent_page') {
    log('步骤 7：认证页已直接进入 OAuth 授权页，跳过登录验证码步骤。', 'ok');
    return createStep6OAuthConsentSuccessResult(snapshot, {
      via: 'already_on_oauth_consent_page',
    });
  }

  if (snapshot.state === 'login_timeout_error_page') {
    log('步骤 7：检测到登录超时报错页，先尝试恢复当前页面。', 'warn');
    const transition = await createStep6LoginTimeoutRecoveryTransition(
      'login_timeout_error_page',
      snapshot,
      '当前页面处于登录超时报错页。',
      {
        loginVerificationRequestedAt: null,
        via: 'login_timeout_initial_recovered',
      }
    );
    if (transition.action === 'done') {
      if (transition.result?.skipLoginVerificationStep) {
        return transition.result;
      }
      return finalizeStep6VerificationReady({
        logLabel: '步骤 7 收尾',
        loginVerificationRequestedAt: transition.result.loginVerificationRequestedAt || null,
        via: transition.result.via || 'login_timeout_initial_recovered',
      });
    }
    if (transition.action === 'email') {
      return step6LoginFromEmailPage(payload, transition.snapshot);
    }
    if (transition.action === 'password') {
      return step6LoginFromPasswordPage(payload, transition.snapshot);
    }
    return transition.result;
  }

  if (snapshot.state === 'email_page') {
    log(`步骤 7：正在使用 ${email} 登录...`);
    return step6LoginFromEmailPage(payload, snapshot);
  }

  if (snapshot.state === 'password_page') {
    log('步骤 7：认证页已在密码页，继续当前登录流程。');
    return step6LoginFromPasswordPage(payload, snapshot);
  }

  if (snapshot.state === 'entry_page') {
    return step6OpenLoginEntry(payload, snapshot);
  }

  throwForStep6FatalState(snapshot);
  throw new Error(`无法识别当前登录页面状态。URL: ${snapshot?.url || location.href}`);
}

// ============================================================
// Step 9: Find "继续" on OAuth consent page for debugger click
// ============================================================
// After login + verification, page shows:
// "使用 ChatGPT 登录到 Codex" with a "继续" submit button.
// Background performs the actual click through the debugger Input API.

async function step8_findAndClick() {
  log('步骤 9：正在查找 OAuth 同意页的“继续”按钮...');

  const continueBtn = await prepareStep8ContinueButton();

  const rect = getSerializableRect(continueBtn);
  log('步骤 9：已找到“继续”按钮并准备好调试器点击坐标。');
  return {
    rect,
    buttonText: (continueBtn.textContent || '').trim(),
    url: location.href,
  };
}

function getStep8State() {
  const continueBtn = getPrimaryContinueButton();
  const retryState = getCurrentAuthRetryPageState('auth');
  const state = {
    url: location.href,
    consentPage: isOAuthConsentPage(),
    consentReady: isStep8Ready(),
    verificationPage: isVerificationPageStillVisible(),
    addPhonePage: isAddPhonePageReady(),
    phoneVerificationPage: isPhoneVerificationPageReady(),
    retryPage: Boolean(retryState),
    retryEnabled: Boolean(retryState?.retryEnabled),
    retryTitleMatched: Boolean(retryState?.titleMatched),
    retryDetailMatched: Boolean(retryState?.detailMatched),
    maxCheckAttemptsBlocked: Boolean(retryState?.maxCheckAttemptsBlocked),
    buttonFound: Boolean(continueBtn),
    buttonEnabled: isButtonEnabled(continueBtn),
    buttonText: continueBtn ? getActionText(continueBtn) : '',
  };

  if (continueBtn) {
    try {
      state.rect = getSerializableRect(continueBtn);
    } catch {
      state.rect = null;
    }
  }

  return state;
}

async function step8_triggerContinue(payload = {}) {
  const strategy = payload?.strategy || 'requestSubmit';
  const continueBtn = await prepareStep8ContinueButton({
    findTimeoutMs: payload?.findTimeoutMs,
    enabledTimeoutMs: payload?.enabledTimeoutMs,
  });
  const form = continueBtn.form || continueBtn.closest('form');

  switch (strategy) {
    case 'requestSubmit':
      if (!form || typeof form.requestSubmit !== 'function') {
        throw new Error('“继续”按钮当前不在可提交的 form 中，无法使用 requestSubmit。URL: ' + location.href);
      }
      form.requestSubmit(continueBtn);
      break;
    case 'nativeClick':
      continueBtn.click();
      break;
    case 'dispatchClick':
      simulateClick(continueBtn);
      break;
    default:
      throw new Error(`未知的 Step 9 触发策略：${strategy}`);
  }

  log(`Step 9: continue button triggered via ${strategy}.`);
  return {
    strategy,
    ...getStep8State(),
  };
}

async function prepareStep8ContinueButton(options = {}) {
  const {
    findTimeoutMs = 10000,
    enabledTimeoutMs = 8000,
  } = options;

  const continueBtn = await findContinueButton(findTimeoutMs);
  await waitForButtonEnabled(continueBtn, enabledTimeoutMs);

  await humanPause(250, 700);
  continueBtn.scrollIntoView({ behavior: 'auto', block: 'center' });
  continueBtn.focus();
  await waitForStableButtonRect(continueBtn);
  return continueBtn;
}

async function findContinueButton(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (isAddPhonePageReady()) {
      throw new Error('当前页面已进入手机号页面，不是 OAuth 授权同意页。URL: ' + location.href);
    }
    const button = getPrimaryContinueButton();
    if (button && isStep8Ready()) {
      return button;
    }
    await sleep(150);
  }

  throw new Error('在 OAuth 同意页未找到“继续”按钮，或页面尚未进入授权同意状态。URL: ' + location.href);
}

async function waitForButtonEnabled(button, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (isButtonEnabled(button)) return;
    await sleep(150);
  }
  throw new Error('“继续”按钮长时间不可点击。URL: ' + location.href);
}

function isButtonEnabled(button) {
  return Boolean(button)
    && !button.disabled
    && button.getAttribute('aria-disabled') !== 'true';
}

async function waitForStableButtonRect(button, timeout = 1500) {
  let previous = null;
  let stableSamples = 0;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const rect = button?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      const snapshot = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

      if (
        previous
        && Math.abs(snapshot.left - previous.left) < 1
        && Math.abs(snapshot.top - previous.top) < 1
        && Math.abs(snapshot.width - previous.width) < 1
        && Math.abs(snapshot.height - previous.height) < 1
      ) {
        stableSamples += 1;
        if (stableSamples >= 2) {
          return;
        }
      } else {
        stableSamples = 0;
      }

      previous = snapshot;
    }

    await sleep(80);
  }
}

function getSerializableRect(el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    throw new Error('滚动后“继续”按钮没有可点击尺寸。URL: ' + location.href);
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + (rect.width / 2),
    centerY: rect.top + (rect.height / 2),
  };
}

// ============================================================
// Step 5: Fill Name & Birthday / Age
// ============================================================

function getStep5DirectCompletionPayload({ isAgeMode = false } = {}) {
  const payload = {
    skippedPostSubmitCheck: true,
    directProceedToStep6: true,
  };
  if (isAgeMode) {
    payload.ageMode = true;
  }
  return payload;
}

async function step5_fillNameBirthday(payload) {
  const { firstName, lastName, age, year, month, day } = payload;
  if (!firstName || !lastName) throw new Error('未提供姓名数据。');

  const resolvedAge = age ?? (year ? new Date().getFullYear() - Number(year) : null);
  const hasBirthdayData = [year, month, day].every(value => value != null && !Number.isNaN(Number(value)));
  if (!hasBirthdayData && (resolvedAge == null || Number.isNaN(Number(resolvedAge)))) {
    throw new Error('未提供生日或年龄数据。');
  }

  const fullName = `${firstName} ${lastName}`;
  log(`步骤 5：正在填写姓名：${fullName}`);

  // Actual DOM structure:
  // - Full name: <input name="name" placeholder="全名" type="text">
  // - Birthday: React Aria DateField or hidden input[name="birthday"]
  // - Age: <input name="age" type="text|number">

  // --- Full Name (single field, not first+last) ---
  let nameInput = null;
  try {
    nameInput = await waitForElement(
      'input[name="name"], input[placeholder*="全名"], input[autocomplete="name"]',
      10000
    );
  } catch {
    throw new Error('未找到姓名输入框。URL: ' + location.href);
  }
  await humanPause(500, 1300);
  fillInput(nameInput, fullName);
  log(`步骤 5：姓名已填写：${fullName}`);

  let birthdayMode = false;
  let ageInput = null;
  let yearSpinner = null;
  let monthSpinner = null;
  let daySpinner = null;
  let hiddenBirthday = null;
  let yearReactSelect = null;
  let monthReactSelect = null;
  let dayReactSelect = null;
  let visibleAgeInput = false;
  let visibleBirthdaySpinners = false;
  let visibleBirthdaySelects = false;

  for (let i = 0; i < 100; i++) {
    yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');
    hiddenBirthday = document.querySelector('input[name="birthday"]');
    ageInput = document.querySelector('input[name="age"]');
    yearReactSelect = findBirthdayReactAriaSelect('年');
    monthReactSelect = findBirthdayReactAriaSelect('月');
    dayReactSelect = findBirthdayReactAriaSelect('天');

    visibleAgeInput = Boolean(ageInput && isVisibleElement(ageInput));
    visibleBirthdaySpinners = Boolean(
      yearSpinner
      && monthSpinner
      && daySpinner
      && isVisibleElement(yearSpinner)
      && isVisibleElement(monthSpinner)
      && isVisibleElement(daySpinner)
    );
    visibleBirthdaySelects = Boolean(
      yearReactSelect?.button
      && monthReactSelect?.button
      && dayReactSelect?.button
      && isVisibleElement(yearReactSelect.button)
      && isVisibleElement(monthReactSelect.button)
      && isVisibleElement(dayReactSelect.button)
    );

    if (visibleAgeInput) break;
    if (visibleBirthdaySpinners || visibleBirthdaySelects) {
      birthdayMode = true;
      break;
    }
    await sleep(100);
  }

  if (birthdayMode) {
    if (!hasBirthdayData) {
      throw new Error('检测到生日字段，但未提供生日数据。');
    }

    const yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    const monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    const daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');
    const yearReactSelect = findBirthdayReactAriaSelect('年');
    const monthReactSelect = findBirthdayReactAriaSelect('月');
    const dayReactSelect = findBirthdayReactAriaSelect('天');

    if (yearReactSelect?.nativeSelect && monthReactSelect?.nativeSelect && dayReactSelect?.nativeSelect) {
      const desiredDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hiddenBirthday = document.querySelector('input[name="birthday"]');

      log('步骤 5：检测到 React Aria 下拉生日字段，正在填写生日...');
      await humanPause(450, 1100);
      await setReactAriaBirthdaySelect(yearReactSelect, year);
      await humanPause(250, 650);
      await setReactAriaBirthdaySelect(monthReactSelect, month);
      await humanPause(250, 650);
      await setReactAriaBirthdaySelect(dayReactSelect, day);

      if (hiddenBirthday) {
        const start = Date.now();
        while (Date.now() - start < 2000) {
          if ((hiddenBirthday.value || '') === desiredDate) break;
          await sleep(100);
        }

        if ((hiddenBirthday.value || '') !== desiredDate) {
          throw new Error(`生日值未成功写入页面。期望 ${desiredDate}，实际 ${(hiddenBirthday.value || '空')}。`);
        }
      }

      log(`步骤 5：React Aria 生日已填写：${desiredDate}`);
    }

    if (yearSpinner && monthSpinner && daySpinner) {
      log('步骤 5：检测到生日字段，正在填写生日...');

      async function setSpinButton(el, value) {
        el.focus();
        await sleep(100);
        document.execCommand('selectAll', false, null);
        await sleep(50);

        const valueStr = String(value);
        for (const char of valueStr) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Digit${char}`, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, code: `Digit${char}`, bubbles: true }));
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: char, bubbles: true }));
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));
          await sleep(50);
        }

        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
        el.blur();
        await sleep(100);
      }

      await humanPause(450, 1100);
      await setSpinButton(yearSpinner, year);
      await humanPause(250, 650);
      await setSpinButton(monthSpinner, String(month).padStart(2, '0'));
      await humanPause(250, 650);
      await setSpinButton(daySpinner, String(day).padStart(2, '0'));
      log(`步骤 5：生日已填写：${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    const hiddenBirthday = document.querySelector('input[name="birthday"]');
    if (hiddenBirthday) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      hiddenBirthday.value = dateStr;
      hiddenBirthday.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenBirthday.dispatchEvent(new Event('change', { bubbles: true }));
      log(`步骤 5：已设置隐藏生日输入框：${dateStr}`);
    }
  } else if (ageInput) {
    if (resolvedAge == null || Number.isNaN(Number(resolvedAge))) {
      throw new Error('检测到年龄字段，但未提供年龄数据。');
    }
    await humanPause(500, 1300);
    fillInput(ageInput, String(resolvedAge));
    log(`步骤 5：年龄已填写：${resolvedAge}`);
  } else {
    throw new Error('未找到生日或年龄输入项。URL: ' + location.href);
  }
  // 韩国IP判断勾选框""I agree"
  const allConsentCheckbox = findStep5AllConsentCheckbox();

  if (allConsentCheckbox) {
    if (!isStep5CheckboxChecked(allConsentCheckbox)) {
      const checkboxLabel = allConsentCheckbox.closest('label');
      await humanPause(500, 1500);
      if (checkboxLabel && isVisibleElement(checkboxLabel)) {
        simulateClick(checkboxLabel);
      } else {
        simulateClick(allConsentCheckbox);
      }
      await sleep(250);

      if (!isStep5CheckboxChecked(allConsentCheckbox)) {
        allConsentCheckbox.click();
        await sleep(250);
      }

      if (!isStep5CheckboxChecked(allConsentCheckbox)) {
        throw new Error('未能勾选 “I agree to all of the following” 复选框。');
      }

      log('步骤 5：已勾选 “I agree to all of the following”。');
    } else {
      log('步骤 5：“I agree to all of the following” 已勾选，跳过。');
    }
  }


  // Click "完成帐户创建" button
  await sleep(500);
  const completeBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /完成|create|continue|finish|done|agree/i, 5000).catch(() => null);
  if (!completeBtn) {
    throw new Error('未找到“完成帐户创建”按钮。URL: ' + location.href);
  }

  const isAgeMode = !birthdayMode && Boolean(ageInput);
  if (isAgeMode) {
    log('步骤 5：当前为年龄输入模式，点击“完成帐户创建”后将直接完成当前步骤。', 'warn');
  }

  await humanPause(500, 1300);
  simulateClick(completeBtn);

  const completionPayload = getStep5DirectCompletionPayload({ isAgeMode });
  reportComplete(5, completionPayload);

  if (isAgeMode) {
    log('步骤 5：年龄模式已点击“完成帐户创建”，当前步骤直接完成，不再等待页面结果。', 'warn');
    return completionPayload;
  }

  log('步骤 5：已点击“完成帐户创建”，当前步骤直接完成，不再等待页面结果。');
  return completionPayload;
}
