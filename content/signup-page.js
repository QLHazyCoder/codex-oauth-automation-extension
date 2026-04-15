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
      || message.type === 'RESEND_VERIFICATION_CODE'
      || message.type === 'ENSURE_SIGNUP_ENTRY_READY'
      || message.type === 'ENSURE_SIGNUP_PASSWORD_PAGE_READY'
    ) {
      resetStopState();
      handleCommand(message).then((result) => {
        sendResponse({ ok: true, ...(result || {}) });
      }).catch(err => {
        if (isStopError(err)) {
          if (message.step) {
            log(`步骤 ${message.step || 8}：已被用户停止。`, 'warn');
          }
          sendResponse({ stopped: true, error: err.message });
          return;
        }

        if (message.type === 'STEP8_FIND_AND_CLICK') {
          log(`步骤 8：${err.message}`, 'error');
          sendResponse({ error: err.message });
          return;
        }

        if (message.step) {
          reportError(message.step, err.message);
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
        case 6: return await step6_login(message.payload);
        case 8: return await step8_findAndClick();
        default: throw new Error(`signup-page.js 不处理步骤 ${message.step}`);
      }
    case 'FILL_CODE':
      // Step 4 = signup code, Step 7 = login code (same handler)
      return await fillVerificationCode(message.step, message.payload);
    case 'GET_LOGIN_AUTH_STATE':
      return serializeLoginAuthState(inspectLoginAuthState());
    case 'PREPARE_SIGNUP_VERIFICATION':
      return await prepareSignupVerificationFlow(message.payload);
    case 'RESEND_VERIFICATION_CODE':
      return await resendVerificationCode(message.step);
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

function getVerificationCodeTarget() {
  const codeInput = document.querySelector(VERIFICATION_CODE_INPUT_SELECTOR);
  if (codeInput && isVisibleElement(codeInput)) {
    return { type: 'single', element: codeInput };
  }

  const singleInputs = Array.from(document.querySelectorAll('input[maxlength="1"]'))
    .filter(isVisibleElement);
  if (singleInputs.length >= 6) {
    return { type: 'split', elements: singleInputs };
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

function isChatGptPage() {
  return /(^|\.)chatgpt\.com$/i.test(location.hostname || '');
}

function getElementHref(el) {
  const rawHref = el?.href || el?.getAttribute?.('href') || '';
  if (!rawHref) return '';

  try {
    return new URL(rawHref, location.href).toString();
  } catch {
    return rawHref;
  }
}

function scoreChatGptSignupCandidate(el) {
  if (!isVisibleElement(el) || !isActionEnabled(el)) return 0;

  const text = getActionText(el);
  const href = getElementHref(el);
  const combined = `${text} ${href}`.replace(/\s+/g, ' ').trim();
  if (!combined) return 0;

  const loginOnly = /(^|\b)(log\s*in|sign\s*in|登录|登入|登陆)(\b|$)/i.test(text)
    && !/sign\s*up|signup|register|注册/i.test(combined);
  if (loginOnly) return 0;

  if (/\/auth\/signup|[?&]signup=(?:true|1)\b|\/signup(?:[/?#]|$)|register/i.test(href)) {
    return 100;
  }
  if (/sign\s*up(?:\s*for\s*free)?|signup|register|create\s*(?:account|free account)|注册|免费注册|创建(?:账号|账户|帐户)/i.test(text)) {
    return 90;
  }
  if (/log\s*in\s*or\s*sign\s*up|sign\s*up\s*or\s*log\s*in|登录或注册|注册或登录/i.test(text)) {
    return 80;
  }
  if (/get\s*started|start\s*now|try\s*(?:chatgpt|it)?\s*first|开始使用|立即开始|先试用/i.test(text)) {
    return 50;
  }

  return 0;
}

function findChatGptSignupTrigger() {
  const candidates = Array.from(document.querySelectorAll(
    'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  ));

  return candidates
    .map((el) => ({ el, score: scoreChatGptSignupCandidate(el) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.el || null;
}

async function waitForChatGptSignupTrigger(timeout = 15000) {
  const start = Date.now();
  let loggedWaiting = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const trigger = findChatGptSignupTrigger();
    if (trigger) return trigger;

    if (!loggedWaiting) {
      log('步骤 2：正在等待 ChatGPT 注册入口出现...');
      loggedWaiting = true;
    }
    await sleep(300);
  }

  throw new Error('未找到 ChatGPT 注册入口。URL: ' + location.href);
}

function dispatchPointerClick(el) {
  const rect = el.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };

  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const EventCtor = type.startsWith('pointer') && typeof PointerEvent === 'function'
      ? PointerEvent
      : MouseEvent;
    el.dispatchEvent(new EventCtor(type, eventInit));
  }
}

function getElementClickRect(el) {
  const rect = el?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) {
    throw new Error('目标按钮没有可点击尺寸。URL: ' + location.href);
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

async function requestDebuggerClick(el, label = '调试器兜底点击') {
  const response = await chrome.runtime.sendMessage({
    type: 'DEBUGGER_CLICK',
    source: SCRIPT_SOURCE,
    payload: {
      label,
      rect: getElementClickRect(el),
    },
  });

  if (response?.error) {
    throw new Error(response.error);
  }
}

function findChatGptSignupEmailInput() {
  const input = document.querySelector(
    'input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="Email" i], input[placeholder*="邮箱" i]'
  );
  return input && isVisibleElement(input) ? input : null;
}

async function waitForChatGptSignupDialog(timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();

    const emailInput = findChatGptSignupEmailInput();
    if (emailInput) {
      return emailInput;
    }

    await sleep(250);
  }

  throw new Error('已点击 ChatGPT 注册入口，但未看到邮箱输入框。URL: ' + location.href);
}

async function triggerChatGptSignup(registerBtn) {
  registerBtn.scrollIntoView?.({ block: 'center', inline: 'center' });
  registerBtn.focus?.();
  await humanPause(100, 250);

  try {
    dispatchPointerClick(registerBtn);
  } catch (err) {
    log(`步骤 2：指针事件点击失败：${err.message}`, 'warn');
  }

  try {
    simulateClick(registerBtn);
  } catch (err) {
    log(`步骤 2：常规点击失败：${err.message}`, 'warn');
  }

  try {
    await waitForChatGptSignupDialog(6000);
  } catch (firstErr) {
    log(`步骤 2：普通点击后未看到邮箱框，尝试调试器真实点击：${firstErr.message}`, 'warn');

    const latestRegisterBtn = document.contains(registerBtn)
      ? registerBtn
      : await waitForChatGptSignupTrigger(5000);

    await requestDebuggerClick(latestRegisterBtn, '步骤 2 ChatGPT 注册按钮真实点击');
    await waitForChatGptSignupDialog(15000);
  }

  log('步骤 2：已点击 ChatGPT 注册入口，并看到邮箱输入框');
  await reportComplete(2);
}

async function resendVerificationCode(step, timeout = 45000) {
  if (step === 7) {
    await waitForLoginVerificationPageReady();
  }

  const start = Date.now();
  let action = null;
  let loggedWaiting = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    action = findResendVerificationCodeTrigger({ allowDisabled: true });

    if (action && isActionEnabled(action)) {
      log(`步骤 ${step}：重新发送验证码按钮已可用。`);
      await humanPause(350, 900);
      simulateClick(action);
      await sleep(1200);
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

// ============================================================
// Signup Entry Helpers
// ============================================================

const SIGNUP_ENTRY_TRIGGER_PATTERN = /免费注册|立即注册|注册|sign\s*up|register|create\s*account|create\s+account/i;
const SIGNUP_EMAIL_INPUT_SELECTOR = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[id*="email" i]',
  'input[autocomplete="email"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="邮箱"]',
].join(', ');

function getSignupEmailInput() {
  const input = document.querySelector(SIGNUP_EMAIL_INPUT_SELECTOR);
  return input && isVisibleElement(input) ? input : null;
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

async function waitForSignupEntryState(options = {}) {
  const {
    timeout = 15000,
    autoOpenEntry = false,
  } = options;
  const start = Date.now();
  let lastTriggerClickAt = 0;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const snapshot = inspectSignupEntryState();

    if (snapshot.state === 'password_page' || snapshot.state === 'email_entry') {
      return snapshot;
    }

    if (snapshot.state === 'entry_home') {
      if (!autoOpenEntry) {
        return snapshot;
      }

      if (Date.now() - lastTriggerClickAt >= 1500) {
        lastTriggerClickAt = Date.now();
        log('步骤 2：正在点击官网注册入口...');
        await humanPause(350, 900);
        simulateClick(snapshot.signupTrigger);
      }
    }

    await sleep(250);
  }

  return inspectSignupEntryState();
}

async function ensureSignupEntryReady(timeout = 15000) {
  const snapshot = await waitForSignupEntryState({ timeout, autoOpenEntry: false });
  if (snapshot.state === 'entry_home' || snapshot.state === 'email_entry' || snapshot.state === 'password_page') {
    return {
      ready: true,
      state: snapshot.state,
      url: snapshot.url || location.href,
    };
  }

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
      simulateClick(continueButton);
    } catch (error) {
      console.error('[MultiPage:signup-page] deferred signup email submit failed:', error?.message || error);
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

const SIGNUP_ACTION_SELECTOR = [
  'button',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
].join(', ');

const SIGNUP_CONTINUE_PATTERN = /continue|next|submit|sign\s*up|create|register|继续|下一步|注册|创建/i;
const SOCIAL_AUTH_ACTION_PATTERN = /google|apple|phone|microsoft|github|sso|手机号|手机|电话/i;

function getVisibleElements(selector, root = document) {
  return Array.from(root.querySelectorAll(selector)).filter(isVisibleElement);
}

function getFirstVisibleElement(selector, root = document) {
  return getVisibleElements(selector, root)[0] || null;
}

async function waitForVisibleElement(selector, timeout = 10000, label = selector) {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const element = getFirstVisibleElement(selector);
    if (element) return element;

    if (!logged) {
      log(`正在等待可见元素：${label}...`);
      logged = true;
    }
    await sleep(200);
  }

  throw new Error(`未找到可见元素：${label}。URL: ${location.href}`);
}

function getVisibleSignupEmailInput() {
  return getFirstVisibleElement(SIGNUP_EMAIL_INPUT_SELECTOR);
}

async function waitForSignupEmailInput(timeout = 12000) {
  return waitForVisibleElement(SIGNUP_EMAIL_INPUT_SELECTOR, timeout, '邮箱输入框');
}

function findSignupSubmitAction(pattern = SIGNUP_CONTINUE_PATTERN, options = {}) {
  const { allowDisabled = false, root = document } = options;
  const candidates = Array.from(root.querySelectorAll(SIGNUP_ACTION_SELECTOR))
    .filter((el) => isVisibleElement(el))
    .filter((el) => allowDisabled || isActionEnabled(el))
    .filter((el) => !SOCIAL_AUTH_ACTION_PATTERN.test(getActionText(el)));

  const scored = candidates.map((el, index) => {
    const text = getActionText(el);
    const type = String(el.getAttribute?.('type') || el.type || '').toLowerCase();
    let score = 0;

    if (pattern.test(text)) score += 40;
    if (type === 'submit') score += 20;
    if (el.tagName === 'BUTTON') score += 5;

    return { el, score, index };
  }).filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.el || null;
}

async function waitForSignupActionEnabled(action, timeout = 15000, label = '按钮') {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (!action || !document.contains(action)) {
      throw new Error(`${label} 已从页面移除。URL: ${location.href}`);
    }
    if (isActionEnabled(action)) return action;

    if (!logged) {
      log(`正在等待${label}变为可点击...`);
      logged = true;
    }
    await sleep(200);
  }

  throw new Error(`${label}长时间不可点击。URL: ${location.href}`);
}

async function clickSignupAction(action, label = '按钮') {
  if (!action) throw new Error(`无法点击空的${label}。`);

  action.scrollIntoView?.({ block: 'center', inline: 'center' });
  action.focus?.();
  await humanPause(250, 700);

  try {
    dispatchPointerClick(action);
  } catch (err) {
    log(`${label}指针点击失败，改用普通点击：${err.message}`, 'warn');
    simulateClick(action);
  }
}

async function waitForSignupPasswordInput(timeout = 25000) {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const passwordInput = getSignupPasswordInput();
    if (passwordInput) return passwordInput;

    if (isVerificationPageStillVisible() || isStep5Ready()) {
      throw new Error('页面已越过密码输入阶段，未发现可填写的密码框。URL: ' + location.href);
    }

    if (!logged) {
      log('步骤 3：正在等待密码输入框出现...');
      logged = true;
    }
    await sleep(250);
  }

  throw new Error('长时间未找到密码输入框。URL: ' + location.href);
}

async function waitForPasswordOrEnabledAction(action, timeout = 25000, label = '按钮') {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const passwordInput = getSignupPasswordInput();
    if (passwordInput) return { passwordInput };

    if (action && document.contains(action) && isActionEnabled(action)) {
      return { action };
    }

    if (!logged) {
      log(`步骤 3：正在等待${label}可点击或密码页出现...`);
      logged = true;
    }
    await sleep(200);
  }

  throw new Error(`${label}长时间不可点击，且密码页未出现。URL: ${location.href}`);
}

async function fillAndSubmitSignupEmail(emailInput, email, options = {}) {
  const { waitForPassword = true } = options;
  const form = emailInput.closest('form') || document;
  const currentValue = (emailInput.value || '').trim();

  await humanPause(350, 900);
  if (currentValue !== email) {
    fillInput(emailInput, email);
    await sleep(250);
  } else {
    log('步骤 3：邮箱已在输入框中，准备提交...');
  }

  const submitBtn = findSignupSubmitAction(SIGNUP_CONTINUE_PATTERN, {
    allowDisabled: true,
    root: form,
  }) || findSignupSubmitAction(SIGNUP_CONTINUE_PATTERN, { allowDisabled: true });

  if (!submitBtn) {
    throw new Error('未找到邮箱 Continue 按钮。URL: ' + location.href);
  }

  const ready = await waitForPasswordOrEnabledAction(submitBtn, 20000, '邮箱 Continue 按钮');
  if (ready.passwordInput) return ready.passwordInput;

  await clickSignupAction(ready.action || submitBtn, '邮箱 Continue 按钮');
  log('步骤 3：邮箱已提交');

  if (!waitForPassword) {
    return null;
  }

  return waitForSignupPasswordInput(30000);
}

async function submitChatGptSignupEmail(payload) {
  const { email } = payload;
  if (!email) throw new Error('未提供邮箱地址，请先在侧边栏粘贴邮箱。');

  log(`步骤 3：正在 ChatGPT 弹窗填写邮箱：${email}`);
  const emailInput = getVisibleSignupEmailInput() || await waitForSignupEmailInput(15000);
  await fillAndSubmitSignupEmail(emailInput, email, { waitForPassword: false });

  return {
    emailSubmitted: true,
    source: 'chatgpt-page',
    url: location.href,
  };
}

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

  // Report complete BEFORE submit, because submit causes page navigation
  // which kills the content script connection
  const signupVerificationRequestedAt = Date.now();
  await reportComplete(3, { email, signupVerificationRequestedAt });

  // Submit the form (page will navigate away after this)
  await humanPause(400, 1000);
  await clickSignupAction(submitBtn, '密码 Continue 按钮');
  log('步骤 3：表单已提交');
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
const AUTH_TIMEOUT_ERROR_DETAIL_PATTERN = /operation\s+timed\s+out|timed\s+out|请求超时|操作超时/i;
const SIGNUP_EMAIL_EXISTS_PATTERN = /与此电子邮件地址相关联的帐户已存在|account\s+associated\s+with\s+this\s+email\s+address\s+already\s+exists|email\s+address.*already\s+exists/i;

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

function isStep5Ready() {
  return Boolean(
    document.querySelector([
      'input[name="name"]',
      'input[autocomplete="name"]',
      'input[name*="first" i]',
      'input[id*="first" i]',
      'input[autocomplete="given-name"]',
      'input[name*="last" i]',
      'input[id*="last" i]',
      'input[autocomplete="family-name"]',
      'input[name="birthday"]',
      'input[name*="birth" i]',
      'input[id*="birth" i]',
      'input[name="age"]',
      'input[name*="age" i]',
      '[role="spinbutton"][data-type="year"]',
      '.react-aria-Select',
    ].join(', '))
  );
}

function getPageTextSnapshot() {
  return (document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (getVerificationCodeTarget()) return true;
  if (findResendVerificationCodeTrigger({ allowDisabled: true })) return true;
  if (document.querySelector('form[action*="email-verification" i]')) return true;

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

function isStep8Ready() {
  const continueBtn = getPrimaryContinueButton();
  if (!continueBtn) return false;
  if (isVerificationPageStillVisible()) return false;
  if (isAddPhonePageReady()) return false;

  return isOAuthConsentPage();
}

function normalizeInlineText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
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

function findBirthdayReactAriaSelectByLabels(labels) {
  for (const label of labels) {
    const control = findBirthdayReactAriaSelect(label);
    if (control) return control;
  }
  return null;
}

function findProfileNameFields() {
  const full = getFirstVisibleElement([
    'input[name="name"]',
    'input[autocomplete="name"]',
    'input[placeholder*="Full name" i]',
    'input[placeholder*="全名"]',
    'input[id="name" i]',
  ].join(', '));

  const first = getFirstVisibleElement([
    'input[name*="first" i]',
    'input[id*="first" i]',
    'input[autocomplete="given-name"]',
    'input[placeholder*="First" i]',
    'input[placeholder*="名"]',
  ].join(', '));

  const last = getFirstVisibleElement([
    'input[name*="last" i]',
    'input[id*="last" i]',
    'input[autocomplete="family-name"]',
    'input[placeholder*="Last" i]',
    'input[placeholder*="姓"]',
  ].join(', '));

  return { full, first, last };
}

async function waitForProfileNameFields(timeout = 12000) {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const fields = findProfileNameFields();
    if (fields.full || fields.first || fields.last) return fields;

    if (!logged) {
      log('步骤 5：正在等待姓名输入框...');
      logged = true;
    }
    await sleep(200);
  }

  throw new Error('未找到姓名输入框。URL: ' + location.href);
}

async function fillProfileNameFields(firstName, lastName) {
  const fields = await waitForProfileNameFields();
  const fullName = `${firstName} ${lastName}`;

  await humanPause(500, 1300);
  if (fields.full) {
    fillInput(fields.full, fullName);
    return { mode: 'full', value: fullName };
  }

  if (fields.first) {
    fillInput(fields.first, firstName);
  }
  if (fields.last) {
    fillInput(fields.last, lastName);
  }

  if (!fields.first && fields.last) {
    fillInput(fields.last, fullName);
    return { mode: 'single-last-fallback', value: fullName };
  }

  if (fields.first && !fields.last) {
    fillInput(fields.first, fullName);
    return { mode: 'single-first-fallback', value: fullName };
  }

  return { mode: 'split', value: fullName };
}

function findVisibleAgeInput() {
  return getFirstVisibleElement([
    'input[name="age"]',
    'input[name*="age" i]',
    'input[id*="age" i]',
    'input[placeholder*="Age" i]',
    'input[placeholder*="年龄"]',
  ].join(', '));
}

function getMonthOptionAliases(month) {
  const value = Number(month);
  const padded = String(value).padStart(2, '0');
  const names = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const shortNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return [
    String(value),
    padded,
    names[value - 1],
    shortNames[value - 1],
  ].filter(Boolean);
}

function resolveSelectOptionValue(select, desiredValue, type = '') {
  const aliases = type === 'month'
    ? getMonthOptionAliases(desiredValue)
    : [String(Number(desiredValue)), String(desiredValue).padStart(2, '0'), String(desiredValue)];

  const normalizedAliases = aliases.map((item) => String(item).toLowerCase());
  const option = Array.from(select.options).find((item) => {
    const value = String(item.value || '').trim().toLowerCase();
    const text = normalizeInlineText(item.textContent).toLowerCase();
    return normalizedAliases.includes(value)
      || normalizedAliases.includes(text)
      || normalizedAliases.some((alias) => text.startsWith(alias));
  });

  return option?.value || String(desiredValue);
}

function setNativeDatePartControl(control, value, type = '') {
  if (!control) return;
  const tag = String(control.tagName || '').toLowerCase();

  if (tag === 'select') {
    fillSelect(control, resolveSelectOptionValue(control, value, type));
  } else {
    const shouldPad = type === 'month' || type === 'day';
    fillInput(control, shouldPad ? String(value).padStart(2, '0') : String(value));
  }
}

function findNativeBirthdayControls() {
  const dateInput = getFirstVisibleElement([
    'input[type="date"]',
    'input[autocomplete="bday"]',
    'input[name*="birthday" i]',
    'input[id*="birthday" i]',
    'input[name*="birthdate" i]',
    'input[id*="birthdate" i]',
  ].join(', '));

  const year = getFirstVisibleElement([
    'select[name*="year" i]',
    'select[id*="year" i]',
    'select[aria-label*="year" i]',
    'select[aria-label*="年"]',
    'input[name*="year" i]',
    'input[id*="year" i]',
    'input[placeholder*="YYYY" i]',
    'input[placeholder*="Year" i]',
    'input[aria-label*="year" i]',
    'input[aria-label*="年"]',
  ].join(', '));

  const month = getFirstVisibleElement([
    'select[name*="month" i]',
    'select[id*="month" i]',
    'select[aria-label*="month" i]',
    'select[aria-label*="月"]',
    'input[name*="month" i]',
    'input[id*="month" i]',
    'input[placeholder*="MM" i]',
    'input[placeholder*="Month" i]',
    'input[aria-label*="month" i]',
    'input[aria-label*="月"]',
  ].join(', '));

  const day = getFirstVisibleElement([
    'select[name*="day" i]',
    'select[id*="day" i]',
    'select[aria-label*="day" i]',
    'select[aria-label*="日"]',
    'select[aria-label*="天"]',
    'input[name*="day" i]',
    'input[id*="day" i]',
    'input[placeholder*="DD" i]',
    'input[placeholder*="Day" i]',
    'input[aria-label*="day" i]',
    'input[aria-label*="日"]',
    'input[aria-label*="天"]',
  ].join(', '));

  return { dateInput, year, month, day };
}

function setHiddenBirthdayValue(year, month, day) {
  const hiddenBirthday = document.querySelector('input[name="birthday"]');
  if (!hiddenBirthday) return false;

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  hiddenBirthday.value = dateStr;
  hiddenBirthday.dispatchEvent(new Event('input', { bubbles: true }));
  hiddenBirthday.dispatchEvent(new Event('change', { bubbles: true }));
  log(`步骤 5：已设置隐藏生日输入框：${dateStr}`);
  return true;
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

async function waitForStep5SubmitOutcome(timeout = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const errorText = getStep5ErrorText();
    if (errorText) {
      return { invalidProfile: true, errorText };
    }

    if (isAddPhonePageReady()) {
      return { success: true, addPhonePage: true };
    }

    if (isStep8Ready()) {
      return { success: true };
    }

    await sleep(150);
  }

  const errorText = getStep5ErrorText();
  if (errorText) {
    return { invalidProfile: true, errorText };
  }

  return {
    invalidProfile: true,
    errorText: '提交后未进入下一阶段，请检查生日是否真正被页面接受。',
  };
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

  if (!titleMatched && !detailMatched) {
    return null;
  }

  return {
    path,
    url: location.href,
    retryButton,
    retryEnabled: isActionEnabled(retryButton),
    titleMatched,
    detailMatched,
  };
}

function getSignupPasswordTimeoutErrorPageState() {
  return getAuthTimeoutErrorPageState({
    pathPatterns: [/\/create-account\/password(?:[/?#]|$)/i],
  });
}

function getLoginTimeoutErrorPageState() {
  return getAuthTimeoutErrorPageState({
    pathPatterns: [/\/log-in(?:[/?#]|$)/i],
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

function inspectLoginAuthState() {
  const retryState = getLoginTimeoutErrorPageState();
  const verificationTarget = getVerificationCodeTarget();
  const passwordInput = getLoginPasswordInput();
  const emailInput = getLoginEmailInput();
  const switchTrigger = findOneTimeCodeLoginTrigger();
  const submitButton = getLoginSubmitButton({ allowDisabled: true });
  const verificationVisible = isVerificationPageStillVisible();
  const addPhonePage = isAddPhonePageReady();
  const consentReady = isStep8Ready();
  const oauthConsentPage = isOAuthConsentPage();
  const baseState = {
    state: 'unknown',
    url: location.href,
    path: location.pathname || '',
    retryButton: retryState?.retryButton || null,
    retryEnabled: Boolean(retryState?.retryEnabled),
    titleMatched: Boolean(retryState?.titleMatched),
    detailMatched: Boolean(retryState?.detailMatched),
    verificationTarget,
    passwordInput,
    emailInput,
    submitButton,
    switchTrigger,
    verificationVisible,
    addPhonePage,
    oauthConsentPage,
    consentReady,
  };

  if (verificationTarget) {
    return {
      ...baseState,
      state: 'verification_page',
    };
  }

  if (retryState) {
    return {
      ...baseState,
      state: 'login_timeout_error_page',
    };
  }

  if (addPhonePage) {
    return {
      ...baseState,
      state: 'add_phone_page',
    };
  }

  if (oauthConsentPage) {
    return {
      ...baseState,
      state: 'oauth_consent_page',
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

  return baseState;
}

function serializeLoginAuthState(snapshot) {
  return {
    state: snapshot?.state || 'unknown',
    url: snapshot?.url || location.href,
    path: snapshot?.path || location.pathname || '',
    retryEnabled: Boolean(snapshot?.retryEnabled),
    titleMatched: Boolean(snapshot?.titleMatched),
    detailMatched: Boolean(snapshot?.detailMatched),
    hasVerificationTarget: Boolean(snapshot?.verificationTarget),
    hasPasswordInput: Boolean(snapshot?.passwordInput),
    hasEmailInput: Boolean(snapshot?.emailInput),
    hasSubmitButton: Boolean(snapshot?.submitButton),
    hasSwitchTrigger: Boolean(snapshot?.switchTrigger),
    verificationVisible: Boolean(snapshot?.verificationVisible),
    addPhonePage: Boolean(snapshot?.addPhonePage),
    oauthConsentPage: Boolean(snapshot?.oauthConsentPage),
    consentReady: Boolean(snapshot?.consentReady),
  };
}

function getLoginAuthStateLabel(snapshot) {
  switch (snapshot?.state) {
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
    case 'add_phone_page':
      return '手机号页';
    default:
      return '未知页面';
  }
}

async function waitForKnownLoginAuthState(timeout = 15000) {
  const start = Date.now();
  let snapshot = inspectLoginAuthState();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = inspectLoginAuthState();
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
    `当前未进入登录验证码页面，请先重新完成步骤 6。当前状态：${getLoginAuthStateLabel(snapshot)}。URL: ${snapshot?.url || location.href}`
  );
}

function createStep6SuccessResult(snapshot, options = {}) {
  return {
    step6Outcome: 'success',
    state: snapshot?.state || 'verification_page',
    url: snapshot?.url || location.href,
    via: options.via || '',
    loginVerificationRequestedAt: options.loginVerificationRequestedAt || null,
  };
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

function throwForStep6FatalState(snapshot) {
  switch (snapshot?.state) {
    case 'oauth_consent_page':
      throw new Error(`当前页面已进入 OAuth 授权页，未经过登录验证码页，无法完成步骤 6。URL: ${snapshot.url}`);
    case 'add_phone_page':
      throw new Error(`当前页面已进入手机号页面，未经过登录验证码页，无法完成步骤 6。URL: ${snapshot.url}`);
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
  if (isStep5Ready()) {
    return { state: 'step5' };
  }

  if (isVerificationPageStillVisible()) {
    return { state: 'verification' };
  }

  if (isSignupPasswordErrorPage()) {
    const timeoutPage = getSignupPasswordTimeoutErrorPageState();
    return {
      state: 'error',
      retryButton: timeoutPage?.retryButton || null,
    };
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
    if (snapshot.state === 'step5' || snapshot.state === 'verification' || snapshot.state === 'error' || snapshot.state === 'email_exists') {
      return snapshot;
    }

    await sleep(200);
  }

  return inspectSignupVerificationState();
}

async function prepareSignupVerificationFlow(payload = {}, timeout = 30000) {
  const { password } = payload;
  const start = Date.now();
  let recoveryRound = 0;
  const maxRecoveryRounds = 3;

  while (Date.now() - start < timeout && recoveryRound < maxRecoveryRounds) {
    throwIfStopped();

    const roundNo = recoveryRound + 1;
    log(`步骤 4：等待页面进入验证码阶段（第 ${roundNo}/${maxRecoveryRounds} 轮，先等待 5 秒）...`, 'info');
    const snapshot = await waitForSignupVerificationTransition(5000);

    if (snapshot.state === 'step5') {
      log('步骤 4：页面已进入验证码后的下一阶段，本步骤按已完成处理。', 'ok');
      return { ready: true, alreadyVerified: true, retried: recoveryRound };
    }

    if (snapshot.state === 'verification') {
      log(`步骤 4：验证码页面已就绪${recoveryRound ? `（期间自动恢复 ${recoveryRound} 次）` : ''}。`, 'ok');
      return { ready: true, retried: recoveryRound };
    }

    if (snapshot.state === 'email_exists') {
      throw new Error('当前邮箱已存在，需要重新开始新一轮。');
    }

    recoveryRound += 1;

    if (snapshot.state === 'error') {
      if (snapshot.retryButton && isActionEnabled(snapshot.retryButton)) {
        log(`步骤 4：检测到密码页超时报错，正在点击“重试”（第 ${recoveryRound}/${maxRecoveryRounds} 次）...`, 'warn');
        await humanPause(350, 900);
        simulateClick(snapshot.retryButton);
        await sleep(1200);
        continue;
      }

      log(`步骤 4：检测到异常页，但“重试”按钮暂不可用，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
      continue;
    }

    if (snapshot.state === 'password') {
      if (!password) {
        throw new Error('当前回到了密码页，但没有可用密码，无法自动重新提交。');
      }

      if ((snapshot.passwordInput.value || '') !== password) {
        log('步骤 4：页面仍停留在密码页，正在重新填写密码...', 'warn');
        await humanPause(450, 1100);
        fillInput(snapshot.passwordInput, password);
      }

      if (snapshot.submitButton && isActionEnabled(snapshot.submitButton)) {
        log(`步骤 4：页面仍停留在密码页，正在重新点击“继续”（第 ${recoveryRound}/${maxRecoveryRounds} 次）...`, 'warn');
        await humanPause(350, 900);
        simulateClick(snapshot.submitButton);
        await sleep(1200);
        continue;
      }

      log(`步骤 4：页面仍停留在密码页，但“继续”按钮暂不可用，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
      continue;
    }

    log(`步骤 4：页面仍在切换中，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
  }

  throw new Error(`等待注册验证码页面就绪超时或自动恢复失败（已尝试 ${recoveryRound}/${maxRecoveryRounds} 轮）。URL: ${location.href}`);
}


async function waitForVerificationSubmitOutcome(step, timeout) {
  const resolvedTimeout = timeout ?? (step === 7 ? 30000 : 12000);
  const start = Date.now();

  while (Date.now() - start < resolvedTimeout) {
    throwIfStopped();

    const errorText = getVerificationErrorText();
    if (errorText) {
      return { invalidCode: true, errorText };
    }

    if (step === 4 && isStep5Ready()) {
      return { success: true };
    }

    if (step === 7 && isStep8Ready()) {
      return { success: true };
    }

    if (step === 7 && isAddPhonePageReady()) {
      return { success: true, addPhonePage: true };
    }

    await sleep(150);
  }

  if (isVerificationPageStillVisible()) {
    return {
      invalidCode: true,
      errorText: getVerificationErrorText() || '提交后仍停留在验证码页面，准备重新发送验证码。',
    };
  }

  return { success: true, assumed: true };
}

async function fillVerificationCode(step, payload) {
  const { code } = payload;
  if (!code) throw new Error('未提供验证码。');

  log(`步骤 ${step}：正在填写验证码：${code}`);

  if (step === 7) {
    await waitForLoginVerificationPageReady();
  }

  // Find code input — could be a single input or multiple separate inputs
  let codeInput = null;
  try {
    codeInput = await waitForElement(VERIFICATION_CODE_INPUT_SELECTOR, 10000);
  } catch {
    // Check for multiple single-digit inputs (common pattern)
    const singleInputs = document.querySelectorAll('input[maxlength="1"]');
    if (singleInputs.length >= 6) {
      log(`步骤 ${step}：发现分开的单字符验证码输入框，正在逐个填写...`);
      for (let i = 0; i < 6 && i < singleInputs.length; i++) {
        fillInput(singleInputs[i], code[i]);
        await sleep(100);
      }
      const outcome = await waitForVerificationSubmitOutcome(step);
      if (outcome.invalidCode) {
        log(`步骤 ${step}：验证码被拒绝：${outcome.errorText}`, 'warn');
      } else if (outcome.addPhonePage) {
        log(`步骤 ${step}：验证码已通过，并已跳转到手机号页面。`, 'ok');
      } else {
        log(`步骤 ${step}：验证码已通过${outcome.assumed ? '（按成功推定）' : ''}。`, 'ok');
      }
      return outcome;
    }
    throw new Error('未找到验证码输入框。URL: ' + location.href);
  }

  fillInput(codeInput, code);
  log(`步骤 ${step}：验证码已填写`);

  // Report complete BEFORE submit (page may navigate away)

  // Submit
  await sleep(500);
  const submitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /verify|confirm|submit|continue|确认|验证/i, 5000).catch(() => null);

  if (submitBtn) {
    await humanPause(450, 1200);
    simulateClick(submitBtn);
    log(`步骤 ${step}：验证码已提交`);
  }

  const outcome = await waitForVerificationSubmitOutcome(step);
  if (outcome.invalidCode) {
    log(`步骤 ${step}：验证码被拒绝：${outcome.errorText}`, 'warn');
  } else if (outcome.addPhonePage) {
    log(`步骤 ${step}：验证码已通过，并已跳转到手机号页面。`, 'ok');
  } else {
    log(`步骤 ${step}：验证码已通过${outcome.assumed ? '（按成功推定）' : ''}。`, 'ok');
  }

  return outcome;
}

// ============================================================
// Step 6: Login with registered account (on OAuth auth page)
// ============================================================

async function waitForStep6EmailSubmitTransition(emailSubmittedAt, timeout = 12000) {
  const start = Date.now();
  let snapshot = inspectLoginAuthState();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = inspectLoginAuthState();

    if (snapshot.state === 'verification_page') {
      return {
        action: 'done',
        result: createStep6SuccessResult(snapshot, {
          via: 'email_submit',
          loginVerificationRequestedAt: emailSubmittedAt,
        }),
      };
    }

    if (snapshot.state === 'password_page') {
      return { action: 'password', snapshot };
    }

    if (snapshot.state === 'login_timeout_error_page') {
      return {
        action: 'recoverable',
        result: createStep6RecoverableResult('login_timeout_error_page', snapshot, {
          message: '提交邮箱后进入登录超时报错页。',
        }),
      };
    }

    if (snapshot.state === 'oauth_consent_page') {
      throw new Error(`提交邮箱后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    if (snapshot.state === 'add_phone_page') {
      throw new Error(`提交邮箱后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    await sleep(250);
  }

  snapshot = inspectLoginAuthState();
  if (snapshot.state === 'verification_page') {
    return {
      action: 'done',
      result: createStep6SuccessResult(snapshot, {
        via: 'email_submit',
        loginVerificationRequestedAt: emailSubmittedAt,
      }),
    };
  }
  if (snapshot.state === 'password_page') {
    return { action: 'password', snapshot };
  }
  if (snapshot.state === 'login_timeout_error_page') {
    return {
      action: 'recoverable',
      result: createStep6RecoverableResult('login_timeout_error_page', snapshot, {
        message: '提交邮箱后进入登录超时报错页。',
      }),
    };
  }
  if (snapshot.state === 'oauth_consent_page') {
    throw new Error(`提交邮箱后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
  }
  if (snapshot.state === 'add_phone_page') {
    throw new Error(`提交邮箱后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
  }

  return {
    action: 'recoverable',
    result: createStep6RecoverableResult('email_submit_stalled', snapshot, {
      message: '提交邮箱后长时间未进入密码页或登录验证码页。',
    }),
  };
}

async function waitForStep6PasswordSubmitTransition(passwordSubmittedAt, timeout = 10000) {
  const start = Date.now();
  let snapshot = inspectLoginAuthState();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = inspectLoginAuthState();

    if (snapshot.state === 'verification_page') {
      return {
        action: 'done',
        result: createStep6SuccessResult(snapshot, {
          via: 'password_submit',
          loginVerificationRequestedAt: passwordSubmittedAt,
        }),
      };
    }

    if (snapshot.state === 'login_timeout_error_page') {
      return {
        action: 'recoverable',
        result: createStep6RecoverableResult('login_timeout_error_page', snapshot, {
          message: '提交密码后进入登录超时报错页。',
        }),
      };
    }

    if (snapshot.state === 'oauth_consent_page') {
      throw new Error(`提交密码后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    if (snapshot.state === 'add_phone_page') {
      throw new Error(`提交密码后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    await sleep(250);
  }

  snapshot = inspectLoginAuthState();
  if (snapshot.state === 'verification_page') {
    return {
      action: 'done',
      result: createStep6SuccessResult(snapshot, {
        via: 'password_submit',
        loginVerificationRequestedAt: passwordSubmittedAt,
      }),
    };
  }
  if (snapshot.state === 'login_timeout_error_page') {
    return {
      action: 'recoverable',
      result: createStep6RecoverableResult('login_timeout_error_page', snapshot, {
        message: '提交密码后进入登录超时报错页。',
      }),
    };
  }
  if (snapshot.state === 'oauth_consent_page') {
    throw new Error(`提交密码后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
  }
  if (snapshot.state === 'add_phone_page') {
    throw new Error(`提交密码后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
  }
  if (snapshot.state === 'password_page' && snapshot.switchTrigger) {
    return { action: 'switch', snapshot };
  }

  return {
    action: 'recoverable',
    result: createStep6RecoverableResult('password_submit_stalled', snapshot, {
      message: '提交密码后仍未进入登录验证码页。',
    }),
  };
}

async function waitForStep6SwitchTransition(loginVerificationRequestedAt, timeout = 10000) {
  const start = Date.now();
  let snapshot = inspectLoginAuthState();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    snapshot = inspectLoginAuthState();

    if (snapshot.state === 'verification_page') {
      return createStep6SuccessResult(snapshot, {
        via: 'switch_to_one_time_code_login',
        loginVerificationRequestedAt,
      });
    }

    if (snapshot.state === 'login_timeout_error_page') {
      return createStep6RecoverableResult('login_timeout_error_page', snapshot, {
        message: '切换到一次性验证码登录后进入登录超时报错页。',
      });
    }

    if (snapshot.state === 'oauth_consent_page') {
      throw new Error(`切换到一次性验证码登录后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    if (snapshot.state === 'add_phone_page') {
      throw new Error(`切换到一次性验证码登录后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
    }

    await sleep(250);
  }

  snapshot = inspectLoginAuthState();
  if (snapshot.state === 'verification_page') {
    return createStep6SuccessResult(snapshot, {
      via: 'switch_to_one_time_code_login',
      loginVerificationRequestedAt,
    });
  }
  if (snapshot.state === 'login_timeout_error_page') {
    return createStep6RecoverableResult('login_timeout_error_page', snapshot, {
      message: '切换到一次性验证码登录后进入登录超时报错页。',
    });
  }
  if (snapshot.state === 'oauth_consent_page') {
    throw new Error(`切换到一次性验证码登录后页面直接进入 OAuth 授权页，未经过登录验证码页。URL: ${snapshot.url}`);
  }
  if (snapshot.state === 'add_phone_page') {
    throw new Error(`切换到一次性验证码登录后页面直接进入手机号页面，未经过登录验证码页。URL: ${snapshot.url}`);
  }

  return createStep6RecoverableResult('one_time_code_switch_stalled', snapshot, {
    message: '点击一次性验证码登录后仍未进入登录验证码页。',
  });
}

async function step6SwitchToOneTimeCodeLogin(snapshot) {
  const switchTrigger = snapshot?.switchTrigger || findOneTimeCodeLoginTrigger();
  if (!switchTrigger || !isActionEnabled(switchTrigger)) {
    return createStep6RecoverableResult('missing_one_time_code_trigger', inspectLoginAuthState(), {
      message: '当前登录页没有可用的一次性验证码登录入口。',
    });
  }

  log('步骤 6：已检测到一次性验证码登录入口，准备切换...');
  const loginVerificationRequestedAt = Date.now();
  await humanPause(350, 900);
  simulateClick(switchTrigger);
  log('步骤 6：已点击一次性验证码登录');
  await sleep(1200);
  return waitForStep6SwitchTransition(loginVerificationRequestedAt);
}

async function step6LoginFromPasswordPage(payload, snapshot) {
  const currentSnapshot = snapshot || inspectLoginAuthState();

  if (currentSnapshot.passwordInput) {
    if (!payload.password) {
      throw new Error('登录时缺少密码，步骤 6 无法继续。');
    }

    log('步骤 6：已进入密码页，准备填写密码...');
    await humanPause(550, 1450);
    fillInput(currentSnapshot.passwordInput, payload.password);
    log('步骤 6：已填写密码');

    await sleep(500);
    const passwordSubmittedAt = Date.now();
    await triggerLoginSubmitAction(currentSnapshot.submitButton, currentSnapshot.passwordInput);
    log('步骤 6：已提交密码');

    const transition = await waitForStep6PasswordSubmitTransition(passwordSubmittedAt);
    if (transition.action === 'done') {
      log('步骤 6：已进入登录验证码页面。', 'ok');
      return transition.result;
    }
    if (transition.action === 'recoverable') {
      log(`步骤 6：${transition.result.message || '提交密码后仍未进入登录验证码页面，准备重新执行步骤 6。'}`, 'warn');
      return transition.result;
    }
    if (transition.action === 'switch') {
      return step6SwitchToOneTimeCodeLogin(transition.snapshot);
    }

    return createStep6RecoverableResult('password_submit_unknown', inspectLoginAuthState(), {
      message: '提交密码后未得到可用的下一步状态。',
    });
  }

  if (currentSnapshot.switchTrigger) {
    return step6SwitchToOneTimeCodeLogin(currentSnapshot);
  }

  return createStep6RecoverableResult('password_page_unactionable', currentSnapshot, {
    message: '当前停留在登录页，但没有可提交密码的输入框，也没有一次性验证码登录入口。',
  });
}

async function step6LoginFromEmailPage(payload, snapshot) {
  const currentSnapshot = snapshot || inspectLoginAuthState();
  const emailInput = currentSnapshot.emailInput || getLoginEmailInput();
  if (!emailInput) {
    throw new Error('在登录页未找到邮箱输入框。URL: ' + location.href);
  }

  if ((emailInput.value || '').trim() !== payload.email) {
    await humanPause(500, 1400);
    fillInput(emailInput, payload.email);
    log('步骤 6：已填写邮箱');
  } else {
    log('步骤 6：邮箱已在输入框中，准备提交...');
  }

  await sleep(500);
  const emailSubmittedAt = Date.now();
  await triggerLoginSubmitAction(currentSnapshot.submitButton, emailInput);
  log('步骤 6：已提交邮箱');

  const transition = await waitForStep6EmailSubmitTransition(emailSubmittedAt);
  if (transition.action === 'done') {
    log('步骤 6：已进入登录验证码页面。', 'ok');
    return transition.result;
  }
  if (transition.action === 'recoverable') {
    log(`步骤 6：${transition.result.message || '提交邮箱后仍未进入目标页面，准备重新执行步骤 6。'}`, 'warn');
    return transition.result;
  }
  if (transition.action === 'password') {
    return step6LoginFromPasswordPage(payload, transition.snapshot);
  }

  return createStep6RecoverableResult('email_submit_unknown', inspectLoginAuthState(), {
    message: '提交邮箱后未得到可用的下一步状态。',
  });
}

async function step6_login(payload) {
  const { email } = payload;
  if (!email) throw new Error('登录时缺少邮箱地址。');

  log(`步骤 6：正在使用 ${email} 登录...`);

  const snapshot = await waitForKnownLoginAuthState(15000);

  if (snapshot.state === 'verification_page') {
    log('步骤 6：登录验证码页面已就绪。', 'ok');
    return createStep6SuccessResult(snapshot, { via: 'already_on_verification_page' });
  }

  if (snapshot.state === 'login_timeout_error_page') {
    log('步骤 6：检测到登录超时报错，准备重新执行步骤 6。', 'warn');
    return createStep6RecoverableResult('login_timeout_error_page', snapshot, {
      message: '当前页面处于登录超时报错页。',
    });
  }

  if (snapshot.state === 'email_page') {
    return step6LoginFromEmailPage(payload, snapshot);
  }

  if (snapshot.state === 'password_page') {
    return step6LoginFromPasswordPage(payload, snapshot);
  }

  throwForStep6FatalState(snapshot);
  throw new Error(`无法识别当前登录页面状态。URL: ${snapshot?.url || location.href}`);
}

// ============================================================
// Step 8: Find "继续" on OAuth consent page for debugger click
// ============================================================
// After login + verification, page shows:
// "使用 ChatGPT 登录到 Codex" with a "继续" submit button.
// Background performs the actual click through the debugger Input API.

async function step8_findAndClick() {
  log('步骤 8：正在查找 OAuth 同意页的“继续”按钮...');

  const continueBtn = await prepareStep8ContinueButton();

  const rect = getSerializableRect(continueBtn);
  log('步骤 8：已找到“继续”按钮并准备好调试器点击坐标。');
  return {
    rect,
    buttonText: (continueBtn.textContent || '').trim(),
    url: location.href,
  };
}

function getStep8State() {
  const continueBtn = getPrimaryContinueButton();
  const state = {
    url: location.href,
    consentPage: isOAuthConsentPage(),
    consentReady: isStep8Ready(),
    verificationPage: isVerificationPageStillVisible(),
    addPhonePage: isAddPhonePageReady(),
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
      throw new Error(`未知的 Step 8 触发策略：${strategy}`);
  }

  log(`Step 8: continue button triggered via ${strategy}.`);
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

  const nameResult = await fillProfileNameFields(firstName, lastName);
  log(`步骤 5：姓名已填写：${nameResult.value}（${nameResult.mode}）`);

  let birthdayMode = false;
  let ageInput = null;
  let yearSpinner = null;
  let monthSpinner = null;
  let daySpinner = null;
  let hiddenBirthday = null;
  let yearReactSelect = null;
  let monthReactSelect = null;
  let dayReactSelect = null;
  let nativeBirthdayControls = null;
  let visibleAgeInput = false;
  let visibleBirthdaySpinners = false;
  let visibleBirthdaySelects = false;
  let visibleNativeBirthday = false;

  for (let i = 0; i < 100; i++) {
    yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');
    hiddenBirthday = document.querySelector('input[name="birthday"]');
    ageInput = findVisibleAgeInput();
    nativeBirthdayControls = findNativeBirthdayControls();
    yearReactSelect = findBirthdayReactAriaSelectByLabels(['年', 'Year', 'year']);
    monthReactSelect = findBirthdayReactAriaSelectByLabels(['月', 'Month', 'month']);
    dayReactSelect = findBirthdayReactAriaSelectByLabels(['天', '日', 'Day', 'day']);

    visibleAgeInput = Boolean(ageInput && isVisibleElement(ageInput));
    visibleNativeBirthday = Boolean(
      nativeBirthdayControls?.dateInput
      || (nativeBirthdayControls?.year && nativeBirthdayControls?.month && nativeBirthdayControls?.day)
    );
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
    if (visibleNativeBirthday || visibleBirthdaySpinners || visibleBirthdaySelects || hiddenBirthday) {
      birthdayMode = true;
      break;
    }
    await sleep(100);
  }

  if (birthdayMode) {
    if (!hasBirthdayData) {
      throw new Error('检测到生日字段，但未提供生日数据。');
    }

    let birthdayFilled = false;
    const desiredDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const nativeBirthdayControls = findNativeBirthdayControls();
    const yearSpinner = document.querySelector('[role="spinbutton"][data-type="year"]');
    const monthSpinner = document.querySelector('[role="spinbutton"][data-type="month"]');
    const daySpinner = document.querySelector('[role="spinbutton"][data-type="day"]');
    const yearReactSelect = findBirthdayReactAriaSelectByLabels(['年', 'Year', 'year']);
    const monthReactSelect = findBirthdayReactAriaSelectByLabels(['月', 'Month', 'month']);
    const dayReactSelect = findBirthdayReactAriaSelectByLabels(['天', '日', 'Day', 'day']);

    if (nativeBirthdayControls.dateInput) {
      log('步骤 5：检测到原生日期输入框，正在填写生日...');
      await humanPause(450, 1100);
      fillInput(nativeBirthdayControls.dateInput, desiredDate);
      birthdayFilled = true;
      log(`步骤 5：生日已填写：${desiredDate}`);
    }

    if (!birthdayFilled && nativeBirthdayControls.year && nativeBirthdayControls.month && nativeBirthdayControls.day) {
      log('步骤 5：检测到原生生日年月日字段，正在填写生日...');
      await humanPause(450, 1100);
      setNativeDatePartControl(nativeBirthdayControls.year, year, 'year');
      await humanPause(200, 550);
      setNativeDatePartControl(nativeBirthdayControls.month, month, 'month');
      await humanPause(200, 550);
      setNativeDatePartControl(nativeBirthdayControls.day, day, 'day');
      birthdayFilled = true;
      log(`步骤 5：生日已填写：${desiredDate}`);
    }

    if (!birthdayFilled && yearReactSelect?.nativeSelect && monthReactSelect?.nativeSelect && dayReactSelect?.nativeSelect) {
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
      birthdayFilled = true;
    }

    if (!birthdayFilled && yearSpinner && monthSpinner && daySpinner) {
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
      birthdayFilled = true;
      log(`步骤 5：生日已填写：${desiredDate}`);
    }

    if (setHiddenBirthdayValue(year, month, day)) {
      birthdayFilled = true;
    }

    if (!birthdayFilled) {
      throw new Error('检测到生日区域，但未能识别可填写的生日控件。URL: ' + location.href);
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

  // Click "完成帐户创建" button
  await sleep(500);
  const completeBtn = findSignupSubmitAction(/完成|create|continue|finish|done|agree/i, { allowDisabled: true })
    || await waitForElementByText('button', /完成|create|continue|finish|done|agree/i, 5000).catch(() => null);
  if (!completeBtn) {
    throw new Error('未找到“完成帐户创建”按钮。URL: ' + location.href);
  }

  await waitForSignupActionEnabled(completeBtn, 15000, '完成帐户创建按钮');
  await clickSignupAction(completeBtn, '完成帐户创建按钮');
  log('步骤 5：已点击“完成帐户创建”，正在等待页面结果...');

  const outcome = await waitForStep5SubmitOutcome();
  if (outcome.invalidProfile) {
    throw new Error(`步骤 5：${outcome.errorText}`);
  }

  log(`步骤 5：资料已通过。`, 'ok');
  reportComplete(5, { addPhonePage: Boolean(outcome.addPhonePage) });
}
