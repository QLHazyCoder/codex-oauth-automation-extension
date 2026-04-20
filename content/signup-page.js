// content/signup-page.js — Content script for OpenAI auth pages (steps 2, 3, 4-receive, 5)
// Injected on: auth0.openai.com, auth.openai.com, accounts.openai.com

console.log('[MultiPage:signup-page] Content script loaded on', location.href);

const STEP3_REGISTER_ERROR_EVENT = 'multipage:step3-register-error';
const STEP5_CREATE_ACCOUNT_ERROR_EVENT = 'multipage:step5-create-account-error';
let lastStep3RegisterError = '';
let lastStep5CreateAccountError = '';

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type === 'EXECUTE_STEP'
    || message.type === 'FILL_CODE'
    || message.type === 'STEP8_FIND_AND_CLICK'
    || message.type === 'STEP8_GET_STATE'
    || message.type === 'STEP8_TRIGGER_CONTINUE'
    || message.type === 'STEP8_RECOVER_ROUTE_ERROR'
    || message.type === 'PREPARE_LOGIN_CODE'
    || message.type === 'PREPARE_SIGNUP_VERIFICATION'
    || message.type === 'RESEND_VERIFICATION_CODE'
    || message.type === 'GET_RESEND_VERIFICATION_TARGET'
  ) {
    resetStopState();
    handleCommand(message).then((result) => {
      sendResponse({ ok: true, ...(result || {}) });
    }).catch(err => {
      if (isStopError(err)) {
        log(`步骤 ${message.step || 8}：已被用户停止。`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }

      if (message.type === 'STEP8_FIND_AND_CLICK') {
        log(`步骤 8：${err.message}`, 'error');
        sendResponse({ error: err.message });
        return;
      }

      reportError(message.step, err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleCommand(message) {
  switch (message.type) {
    case 'EXECUTE_STEP':
      switch (message.step) {
        case 2: return await step2_clickRegister(message.payload);
        case 3: return await step3_fillEmailPassword(message.payload);
        case 5: return await step5_fillNameBirthday(message.payload);
        case 6: return await step6_login(message.payload);
        case 8: return await step8_findAndClick();
        case 10: return await step10_logout(message.payload);
        default: throw new Error(`signup-page.js 不处理步骤 ${message.step}`);
      }
    case 'FILL_CODE':
      // Step 4 = signup code, Step 7 = login code (same handler)
      return await fillVerificationCode(message.step, message.payload);
    case 'PREPARE_SIGNUP_VERIFICATION':
      return await prepareSignupVerificationFlow(message.payload);
    case 'PREPARE_LOGIN_CODE':
      return await prepareLoginCodeFlow();
    case 'RESEND_VERIFICATION_CODE':
      return await resendVerificationCode(message.step);
    case 'GET_RESEND_VERIFICATION_TARGET':
      return await getResendVerificationTarget(message.step);
    case 'STEP8_FIND_AND_CLICK':
      return await step8_findAndClick();
    case 'STEP8_GET_STATE':
      return getStep8State();
    case 'STEP8_TRIGGER_CONTINUE':
      return await step8_triggerContinue(message.payload);
    case 'STEP8_RECOVER_ROUTE_ERROR':
      return await step8_recoverRouteError(message.payload);
  }
}

function safeJsonParse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatStep3RegisterError(detail) {
  const normalizedDetail = detail && typeof detail === 'object' ? detail : {};
  const payload = safeJsonParse(normalizedDetail.bodyText) || {};
  const status = Number(normalizedDetail.status) || 0;
  const code = normalizeInlineText(payload.code || normalizedDetail.code || '');
  const type = normalizeInlineText(payload.type || normalizedDetail.type || '');
  const message = normalizeInlineText(payload.message || normalizedDetail.message || '');
  const fallbackText = normalizeInlineText(normalizedDetail.bodyText || '');

  if (!status && !code && !type && !message && !fallbackText) {
    return '';
  }

  const primaryLabel = code || type || (status ? `HTTP ${status}` : '未知错误');
  const statusSuffix = status && code ? `（HTTP ${status}）` : '';
  const detailText = message || (!payload.message ? fallbackText : '');

  return detailText
    ? `user/register 接口返回 ${primaryLabel}${statusSuffix}：${detailText}`
    : `user/register 接口返回 ${primaryLabel}${statusSuffix}`;
}

function clearStep3RegisterError() {
  lastStep3RegisterError = '';
}

function getStep3RegisterErrorText() {
  return lastStep3RegisterError;
}

function formatStep5CreateAccountError(detail) {
  const normalizedDetail = detail && typeof detail === 'object' ? detail : {};
  const payload = safeJsonParse(normalizedDetail.bodyText) || {};
  const status = Number(normalizedDetail.status) || 0;
  const code = normalizeInlineText(payload.code || normalizedDetail.code || '');
  const type = normalizeInlineText(payload.type || normalizedDetail.type || '');
  const message = normalizeInlineText(payload.message || normalizedDetail.message || '');
  const fallbackText = normalizeInlineText(normalizedDetail.bodyText || '');

  if (!status && !code && !type && !message && !fallbackText) {
    return '';
  }

  const primaryLabel = code || type || (status ? `HTTP ${status}` : '未知错误');
  const statusSuffix = status && code ? `（HTTP ${status}）` : '';
  const detailText = message || (!payload.message ? fallbackText : '');

  return detailText
    ? `create_account 接口返回 ${primaryLabel}${statusSuffix}：${detailText}`
    : `create_account 接口返回 ${primaryLabel}${statusSuffix}`;
}

function clearStep5CreateAccountError() {
  lastStep5CreateAccountError = '';
}

function getStep5CreateAccountErrorText() {
  return lastStep5CreateAccountError;
}

function getStep5SubmitErrorText() {
  return getStep5CreateAccountErrorText() || getStep5ErrorText();
}

function handleStep3RegisterErrorEvent(event) {
  const detailText = typeof event?.detail === 'string' ? event.detail : '';
  const detail = safeJsonParse(detailText) || {};
  const errorText = formatStep3RegisterError(detail);
  if (!errorText || errorText === lastStep3RegisterError) {
    return;
  }

  lastStep3RegisterError = errorText;
  console.warn('[MultiPage:signup-page] Captured Step 3 API error:', errorText);
  reportError(3, errorText);
}

function handleStep5CreateAccountErrorEvent(event) {
  const detailText = typeof event?.detail === 'string' ? event.detail : '';
  const detail = safeJsonParse(detailText) || {};
  const errorText = formatStep5CreateAccountError(detail);
  if (!errorText) {
    return;
  }

  lastStep5CreateAccountError = errorText;
  console.warn('[MultiPage:signup-page] Captured Step 5 API error:', errorText);
}

window.addEventListener(STEP3_REGISTER_ERROR_EVENT, handleStep3RegisterErrorEvent, true);
window.addEventListener(STEP5_CREATE_ACCOUNT_ERROR_EVENT, handleStep5CreateAccountErrorEvent, true);

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
const REGISTRATION_EMAIL_INPUT_SELECTOR = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[id*="email"]',
  'input[placeholder*="email" i]',
].join(', ');
const REGISTER_ACTION_PATTERN = /sign\s*up|register|create\s*account|注册/i;
const CHATGPT_FREE_SIGNUP_ACTION_PATTERN = /免费注册|免费开始|sign\s*up\s*(?:for\s*free)?|create\s*free\s*account|get\s*started/i;

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

function getVisibleRegistrationEmailInput() {
  const input = document.querySelector(REGISTRATION_EMAIL_INPUT_SELECTOR);
  return input && isVisibleElement(input) ? input : null;
}

function findRegisterEntryAction({ allowDisabled = false } = {}) {
  const candidates = document.querySelectorAll(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  );
  const matches = [];

  for (const el of candidates) {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) continue;
    const text = getActionText(el);
    if (text && REGISTER_ACTION_PATTERN.test(text)) {
      matches.push(el);
    }
  }

  if (!matches.length) {
    return null;
  }

  const hostname = String(location.hostname || '').trim().toLowerCase();
  const path = String(location.pathname || '').trim();
  const isChatGptHome = (/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname))
    && (path === '/' || path === '' || /^\/\?/.test(path));
  if (isChatGptHome) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const preferredFreeSignup = matches
      .filter((el) => {
        const text = getActionText(el);
        if (!CHATGPT_FREE_SIGNUP_ACTION_PATTERN.test(text)) return false;
        const rect = el.getBoundingClientRect();
        return rect.top <= Math.max(220, window.innerHeight * 0.35) && rect.left >= viewportWidth * 0.45;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        if (Math.abs(leftRect.top - rightRect.top) > 4) {
          return leftRect.top - rightRect.top;
        }
        return rightRect.left - leftRect.left;
      });

    return preferredFreeSignup[0] || matches[0];
  }

  const isLoginOrCreateAccountPage = /\/log-in-or-create-account(?:[/?#]|$)/i.test(path);
  if (!isLoginOrCreateAccountPage) {
    return matches[0];
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const preferred = matches
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top <= Math.max(180, window.innerHeight * 0.35) && rect.left >= viewportWidth * 0.45;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      if (Math.abs(leftRect.top - rightRect.top) > 4) {
        return leftRect.top - rightRect.top;
      }
      return rightRect.left - leftRect.left;
    });

  return preferred[0] || matches[0];
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

async function prepareLoginCodeFlow(timeout = 15000) {
  const readyTarget = getVerificationCodeTarget();
  if (readyTarget) {
    log('步骤 7：验证码输入框已就绪。');
    return { ready: true, mode: readyTarget.type };
  }

  if (isEmailVerificationPage() && isVerificationPageStillVisible()) {
    log('步骤 7：已进入邮箱验证码页面，正在等待验证码输入框或重发入口稳定。');
    return { ready: true, mode: 'verification_page' };
  }

  const initialRestartSignal = getStep7RestartFromStep6Signal();
  if (initialRestartSignal) {
    log('步骤 7：检测到登录页超时报错，准备回到步骤 6 重新发起登录验证码流程...', 'warn');
    return initialRestartSignal;
  }

  const start = Date.now();
  let switchClickCount = 0;
  let lastSwitchAttemptAt = 0;
  let loggedPasswordPage = false;
  let loggedVerificationPage = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const target = getVerificationCodeTarget();
    if (target) {
      log('步骤 7：验证码页面已就绪。');
      return { ready: true, mode: target.type };
    }

    if (isEmailVerificationPage() && isVerificationPageStillVisible()) {
      if (!loggedVerificationPage) {
        loggedVerificationPage = true;
        log('步骤 7：页面已进入邮箱验证码流程，继续等待验证码输入框渲染...');
      }
      await sleep(250);
      continue;
    }

    const restartSignal = getStep7RestartFromStep6Signal();
    if (restartSignal) {
      log('步骤 7：检测到登录页超时报错，准备回到步骤 6 重新发起登录验证码流程...', 'warn');
      return restartSignal;
    }

    const passwordInput = document.querySelector('input[type="password"]');
    const switchTrigger = findOneTimeCodeLoginTrigger();

    if (switchTrigger && (switchClickCount === 0 || Date.now() - lastSwitchAttemptAt > 1500)) {
      switchClickCount += 1;
      lastSwitchAttemptAt = Date.now();
      loggedPasswordPage = false;
      log('步骤 7：检测到密码页，正在切换到一次性验证码登录...');
      await humanPause(350, 900);
      const verificationRequestedAt = Date.now();
      simulateClick(switchTrigger);
      await sleep(1200);
      return { ready: true, mode: 'verification_switch', verificationRequestedAt };
    }

    if (passwordInput && !loggedPasswordPage) {
      loggedPasswordPage = true;
      log('步骤 7：正在等待密码页上的一次性验证码登录入口...');
    }

    await sleep(200);
  }

  throw new Error('无法切换到一次性验证码验证页面。URL: ' + location.href);
}

async function resendVerificationCode(step, timeout = 45000) {
  if (step === 7) {
    const prepareResult = await prepareLoginCodeFlow();
    if (prepareResult?.restartFromStep6) {
      return prepareResult;
    }
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
      if (typeof action.click === 'function') {
        action.click();
        log(`步骤 ${step}：已通过原生 click 触发重新发送验证码。`);
      } else {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        log(`步骤 ${step}：已通过 dispatch click 触发重新发送验证码。`);
      }
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

async function getResendVerificationTarget(step, timeout = 45000) {
  if (step === 7) {
    const prepareResult = await prepareLoginCodeFlow();
    if (prepareResult?.restartFromStep6) {
      return prepareResult;
    }
  }

  const start = Date.now();
  let action = null;
  let loggedWaiting = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();
    action = findResendVerificationCodeTrigger({ allowDisabled: true });

    if (action && isActionEnabled(action)) {
      const rect = getSerializableRect(action);
      log(`步骤 ${step}：重新发送验证码按钮已可用，已捕获点击坐标。`);
      return {
        rect,
        buttonText: getActionText(action),
        url: location.href,
      };
    }

    if (action && !loggedWaiting) {
      loggedWaiting = true;
      log(`步骤 ${step}：正在等待重新发送验证码按钮变为可点击...`);
    }

    await sleep(250);
  }

  throw new Error('无法定位可点击的重新发送验证码按钮。URL: ' + location.href);
}

// ============================================================
// Step 2: Click Register
// ============================================================

// 检测「欢迎回来，选择一个账户以继续」账号选择弹窗。
// 该弹窗在以下情况出现：ChatGPT 检测到浏览器仍缓存着前一轮的登录 session，
// 询问用户是继续使用老账号还是创建新账号。若内容脚本把弹窗里的「创建账户」
// 当成正常注册入口并点击，则 step 2 会过早 reportComplete；step 3
// 还没等到导航完成就开始填写邮箱，导致「在注册页未找到邮箱输入框」报错。
function isChooseAccountPickerVisible() {
  // Only relevant on chatgpt.com root (the picker only appears here, not on auth pages)
  const hostname = String(location.hostname || '').toLowerCase();
  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname)) return false;
  const path = String(location.pathname || '').replace(/\/+$/, '') || '/';
  if (path !== '/') return false;

  // Look for a dialog/modal containing both "欢迎回来"/"Welcome back" and "创建账户"/"创建帐户"/"Create account"
  // 注意：OpenAI 中文 UI 可能用「帐户」（繁体）或「账户」（简体），都要匹配。
  const dialogEl = document.querySelector('[role="dialog"], [data-radix-dialog-content], [data-testid*="dialog"], [aria-modal="true"]');
  if (dialogEl) {
    const text = dialogEl.textContent || '';
    return /欢迎回来|welcome\s*back/i.test(text) && /创建\s*[账帐][户号]|create\s*account/i.test(text);
  }

  // Fallback: check the whole page body (e.g. if dialog role is not set)
  const bodyText = document.body?.textContent || '';
  return /欢迎回来|welcome\s*back/i.test(bodyText)
    && /选择一个[账帐][户号]|choose\s+an?\s+account/i.test(bodyText)
    && /创建\s*[账帐][户号]|create\s*account/i.test(bodyText);
}

// 精确查找「欢迎回来」弹窗里的「创建帐户/Create account」按钮。
// 不走 findRegisterEntryAction：那个函数会匹配「免费注册」等其他入口且不限定在弹窗内。
function findChooseAccountPickerCreateButton() {
  const dialogEl = document.querySelector(
    '[role="dialog"], [data-radix-dialog-content], [data-testid*="dialog"], [aria-modal="true"]'
  );
  const root = dialogEl || document.body;
  const candidates = root.querySelectorAll('button, [role="button"], a');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || !isActionEnabled(el)) return false;
    const text = getActionText(el);
    // 兼容繁体「帐户」与简体「账户」
    return /^创建\s*[账帐][户号]$|^create\s+account$/i.test(text);
  }) || null;
}

// 识别「欢迎回来」弹窗里每张缓存账号卡片右侧的 X（忘记账号）按钮。
// 识别策略：
//   1. 限定在 dialog 根内
//   2. 从包含 @ 邮箱文本的元素向上 4 层找"卡片"容器，再在容器内找按钮
//   3. 按钮必须是"无文字 / X / × / 移除/删除/忘记 语义"
//   4. 显式排除：
//      - 弹窗顶层关闭 X（parentElement === dialogEl）
//      - 文案包含「创建/登录/继续/create/login/sign in/continue」的主按钮
function findChooseAccountPickerForgetButtons() {
  const dialogEl = document.querySelector(
    '[role="dialog"], [data-radix-dialog-content], [data-testid*="dialog"], [aria-modal="true"]'
  );
  if (!dialogEl) return [];

  const result = new Set();
  const emailTextEls = Array.from(dialogEl.querySelectorAll('*')).filter((el) => {
    if (!isVisibleElement(el)) return false;
    if (el.children && el.children.length > 3) return false;
    return /[\w.+-]+@[\w-]+\.[\w.-]+/.test((el.textContent || '').trim());
  });

  for (const emailEl of emailTextEls) {
    let card = emailEl;
    for (let i = 0; i < 4 && card && card !== dialogEl; i += 1) {
      card = card.parentElement;
      if (!card) break;
      const buttons = card.querySelectorAll('button, [role="button"]');
      let foundInThisLevel = false;
      for (const btn of buttons) {
        if (!isVisibleElement(btn) || !isActionEnabled(btn)) continue;
        // 排除弹窗顶层关闭 X（直接挂在 dialog 下，不属于某张卡片）
        if (btn.parentElement === dialogEl) continue;
        const text = getActionText(btn).trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const looksLikeForget =
          text === '' || text === 'X' || text === '×'
          || /^remove$|^delete$|^移除$|^删除$|^忘记$/i.test(text)
          || /remove|forget|移除|删除|忘记/i.test(ariaLabel);
        const isMainActionBtn = /创建|登录|继续|create|login|sign\s*in|continue/i.test(text);
        if (looksLikeForget && !isMainActionBtn) {
          result.add(btn);
          foundInThisLevel = true;
        }
      }
      if (foundInThisLevel) break;
    }
  }
  return Array.from(result);
}

// Cloudflare / 上游 5xx 错误页识别：
// 场景：accounts.openai.com 曾长期返回 Cloudflare 522（origin timed out），
// 页面文案含 "Connection timed out" / "Error code 5xx" / "Cloudflare"。
// 检测命中后直接当作不可用入口，立刻 fallback，不再浪费时间在这类死页面上。
function isServerErrorPage() {
  const title = String(document.title || '');
  const titleMatch = /error\s*\d{3}|attention\s+required|connection\s+timed\s+out|just\s+a\s+moment/i.test(title);
  const bodyText = String(document.body?.textContent || '').slice(0, 3000);
  const bodyMatch = /error\s+code\s+5\d\d|cloudflare/i.test(bodyText)
    && /connection\s+timed\s+out|origin\s+web\s+server\s+timed\s+out|host\s*\n?\s*error/i.test(bodyText);
  return titleMatch && bodyMatch;
}

function inspectStep2SignupEntryState() {
  if (isServerErrorPage()) {
    return { state: 'server_error' };
  }

  if (isAddPhonePageReady()) {
    return { state: 'add_phone' };
  }

  if (isStep5Ready()) {
    return { state: 'step5' };
  }

  if (isVerificationPageStillVisible()) {
    return { state: 'verification' };
  }

  if (isSignupEmailAlreadyExistsPage()) {
    return { state: 'email_exists' };
  }

  const passwordInput = getSignupPasswordInput();
  if (passwordInput) {
    return { state: 'password', passwordInput };
  }

  // 账号选择器必须在 findRegisterEntryAction 之前判断，否则「创建账户」按钮
  // 会被误识别为正常注册入口，导致 step 2 过早完成而 step 3 找不到邮箱输入框。
  if (isChooseAccountPickerVisible()) {
    return { state: 'choose_account_picker' };
  }

  const registerAction = findRegisterEntryAction();
  if (registerAction) {
    return { state: 'entry', registerAction };
  }

  const emailInput = getVisibleRegistrationEmailInput();
  if (emailInput) {
    const pageText = `${document.title || ''} ${getPageTextSnapshot()}`;
    const isLoginRoute = /\/log-in(?:[/?#]|$)/i.test(location.pathname || '');
    const hasLoginSignal = /log\s*in|sign\s*in|登录/i.test(pageText);
    const hasSignupSignal = /sign\s*up|create\s*account|注册|创建/i.test(pageText);

    if (!isLoginRoute || hasSignupSignal || !hasLoginSignal) {
      return { state: 'email', emailInput };
    }
  }

  return { state: 'unknown' };
}

async function step2_clickRegister(payload = {}) {
  const forceFreshSignup = Boolean(payload?.forceFreshSignup);
  const navigationRecovery = Boolean(payload?.navigationRecovery);
  const entryState = inspectStep2SignupEntryState();

  if (navigationRecovery) {
    log('步骤 2：检测到注册按钮点击后发生整页跳转，正在新页面继续确认注册流程。', 'info');
  }

  // 正常情况下，如果打开注册入口时页面已经处于注册流程中间状态（例如填邮箱 / 填密码 / 等验证码），
  // 直接认可「已在流程中」能节省时间。但如果 background 告诉我们这是一次「重启」触发的 step 2，
  // 此时页面大概率是上一轮残留的验证页（cookie 没清干净或服务端仍把账号锁在那儿），
  // 绝不能把它当作已完成——否则下一步会直接在 /email-verification 上尝试填邮箱，触发 405。
  if ((!forceFreshSignup || navigationRecovery) && (
    entryState.state === 'email'
    || entryState.state === 'password'
    || entryState.state === 'verification'
    || entryState.state === 'step5'
    || entryState.state === 'add_phone'
    || entryState.state === 'email_exists'
  )) {
    log(`步骤 2：当前页面已处于注册流程（${entryState.state}），${navigationRecovery ? '已在新页面完成恢复，无需再次点击注册入口。' : '无需再点击注册入口。'}`, 'ok');
    reportComplete(2, { signupFlowState: entryState.state });
    return {
      alreadyOnSignupFlow: true,
      signupFlowState: entryState.state,
      url: location.href,
    };
  }

  if (forceFreshSignup && !navigationRecovery && (
    entryState.state === 'email'
    || entryState.state === 'password'
    || entryState.state === 'verification'
    || entryState.state === 'step5'
    || entryState.state === 'add_phone'
    || entryState.state === 'email_exists'
  )) {
    log(`步骤 2：重启模式——忽略当前页面的注册流程残留状态（${entryState.state}），请求切换到备用注册入口。`, 'warn');
    return {
      needsAlternateSignupEntry: true,
      reason: `重启模式下检测到残留状态 ${entryState.state}，需要强制走新的注册入口。URL: ${location.href}`,
    };
  }

  // 「欢迎回来」账号选择弹窗：浏览器缓存了上一轮的登录 session，OpenAI 让选
  // 「继续用老账号」还是「创建新账号」。策略：先把每个缓存账号右侧的 X 按钮点掉
  // （让 OpenAI 忘掉这些会话），再点弹窗底部的「创建帐户」按钮进入正常注册流程。
  // 这样不浪费候选 URL、也不会把弹窗里的「创建帐户」误识别为主流程入口（因为我们
  // 显式点了它而非靠 findRegisterEntryAction）。
  if (entryState.state === 'choose_account_picker') {
    log('步骤 2：检测到「欢迎回来」账号选择弹窗，准备移除缓存账号并点击「创建帐户」。', 'warn');
    const cleanup = await performChooseAccountPickerCleanup();
    if (!cleanup.ok) {
      log('步骤 2：移除缓存账号后未找到「创建帐户」按钮，回退到备用注册地址。', 'warn');
      return {
        needsAlternateSignupEntry: true,
        reason: `欢迎回来弹窗清理后未找到「创建帐户」按钮。URL: ${location.href}`,
      };
    }
    // 先点击，再等待真正的注册表单 surface 渲染出来；渲染成功才 reportComplete(2)。
    // 避免 background 在页面过渡中间态就推进 step 3 → 消耗 iCloud 别名配额却无处使用。
    simulateClick(cleanup.createBtn);
    const surface = await waitForStep2RegistrationSurfaceReady(8000);
    if (!surface) {
      log('步骤 2：点击「创建帐户」后 8s 未渲染注册表单，回退到备用注册地址（避免浪费邮箱配额）。', 'warn');
      return {
        needsAlternateSignupEntry: true,
        reason: `点击「创建帐户」后 8s 未进入注册表单，避免浪费邮箱配额。URL: ${location.href}`,
      };
    }
    reportComplete(2, { fromChooseAccountPicker: true, forgetCount: cleanup.forgetCount, surface });
    return {
      clickedRegister: true,
      fromChooseAccountPicker: true,
      forgetCount: cleanup.forgetCount,
      surface,
      url: location.href,
    };
  }

  if (entryState.state !== 'entry' || !entryState.registerAction) {
    log('步骤 2：当前入口未直接进入注册流程，准备切换备用注册地址。', 'warn');
    return {
      needsAlternateSignupEntry: true,
      reason: `当前页面既没有注册表单，也没有可点击的注册入口。URL: ${location.href}`,
    };
  }

  log('步骤 2：已找到注册入口，准备进入注册流程...');
  await humanPause(450, 1200);
  simulateClick(entryState.registerAction);
  log('步骤 2：已点击注册按钮，观察后续状态...');

  // chatgpt.com 在 cookie 清理后可能触发 anti-bot 延迟，点击后需要更长的观察窗口。
  // auth.openai.com 通常 1-2s 内跳转，保留 5s 缓冲即可。
  const isChatGptEntry = /chatgpt\.com/i.test(location.hostname || '');

  // 点击后守望：某些 round 下点击 chatgpt.com 首页的「免费注册」并不会跳转，而是
  // 服务端把缓存 session 反馈成「欢迎回来」弹窗。此时若直接 reportComplete(2)，
  // step 3 会在 chatgpt.com 原地等邮箱输入框 10 秒 → 超时报错。
  // chatgpt.com：轮询 10s（cookie 清理后 anti-bot 延迟可长达 8-10s）。
  // 其他入口：轮询 5s 即足够（服务端响应更快）。
  const observed = await waitForChooseAccountPickerOrProgress(isChatGptEntry ? 10000 : 5000);
  if (observed === 'picker') {
    log('步骤 2：点击注册入口后冒出「欢迎回来」弹窗，清理并点击「创建帐户」。', 'warn');
    const cleanup = await performChooseAccountPickerCleanup();
    if (!cleanup.ok) {
      log('步骤 2：点击后出现弹窗但未找到「创建帐户」按钮，回退到备用注册地址。', 'warn');
      return {
        needsAlternateSignupEntry: true,
        reason: `点击注册入口后出现欢迎回来弹窗，但未找到「创建帐户」按钮。URL: ${location.href}`,
      };
    }
    // 同 pre-click 分支：先点击，再等待 surface，确认真就绪才 reportComplete。
    simulateClick(cleanup.createBtn);
    const guardedSurface = await waitForStep2RegistrationSurfaceReady(8000);
    if (!guardedSurface) {
      log('步骤 2：post-click 清理后 8s 未进入注册表单，回退到备用注册地址（避免浪费邮箱配额）。', 'warn');
      return {
        needsAlternateSignupEntry: true,
        reason: `post-click 清理后 8s 未进入注册表单，避免浪费邮箱配额。URL: ${location.href}`,
      };
    }
    reportComplete(2, {
      fromChooseAccountPicker: true,
      forgetCount: cleanup.forgetCount,
      viaPostClickGuard: true,
      surface: guardedSurface,
    });
    return {
      clickedRegister: true,
      fromChooseAccountPicker: true,
      viaPostClickGuard: true,
      forgetCount: cleanup.forgetCount,
      surface: guardedSurface,
      url: location.href,
    };
  }

  // 普通分支：observed 可能是 'progressed'（URL 变了 / 邮箱框一闪）或 'none'（毫无动静）。
  // 两种情况都必须等到真正的注册表单 surface 出现才算步骤 2 完成，避免把假"完成"信号
  // 传给 background 触发 ensureAutoEmailReady 消耗邮箱配额。
  // chatgpt.com anti-bot 延迟后重定向可能需要更多时间：给 15s；其他入口保留 8s。
  const entrySurfaceTimeoutMs = isChatGptEntry ? 15000 : 8000;
  const entrySurface = await waitForStep2RegistrationSurfaceReady(entrySurfaceTimeoutMs);
  if (!entrySurface) {
    log(`步骤 2：点击注册入口后 ${entrySurfaceTimeoutMs / 1000}s 未进入注册表单（observed=${observed}），回退到备用注册地址。`, 'warn');
    return {
      needsAlternateSignupEntry: true,
      reason: `点击注册入口后 ${entrySurfaceTimeoutMs / 1000}s 未进入注册表单（observed=${observed}），避免浪费邮箱配额。URL: ${location.href}`,
    };
  }
  reportComplete(2, { surface: entrySurface });
  return {
    clickedRegister: true,
    surface: entrySurface,
    url: location.href,
  };
}

// 执行「欢迎回来」弹窗清理流程：
//   1) 点掉每张缓存账号卡片右侧的 X（让 OpenAI 忘记这些 session）
//   2) 返回底部「创建帐户」按钮供调用方点击
// 本函数不直接点击「创建帐户」。调用方应当：
//   simulateClick(cleanup.createBtn)
//   → waitForStep2RegistrationSurfaceReady(8000)
//   → surface 就绪才 reportComplete(2)
// 这样避免在页面跳转中间态就上报完成，触发 background 消耗邮箱配额（如 iCloud Hide My Email）。
async function performChooseAccountPickerCleanup() {
  const forgetButtons = findChooseAccountPickerForgetButtons();
  for (const btn of forgetButtons) {
    log('步骤 2：点击 X 移除一个缓存账号。');
    await humanPause(200, 500);
    simulateClick(btn);
    await sleep(300);
  }
  const createBtn = findChooseAccountPickerCreateButton();
  if (!createBtn) {
    return { ok: false, forgetCount: forgetButtons.length };
  }
  log('步骤 2：点击「创建帐户」进入注册流程。');
  await humanPause(450, 1100);
  return { ok: true, forgetCount: forgetButtons.length, createBtn };
}

// 点击 chatgpt.com 首页「免费注册」之后，页面可能出现三种结果：
//   A) 弹出「欢迎回来」账号选择弹窗 → 返回 'picker'，调用方执行清理流程
//   B) 跳转到 auth.openai.com 或已渲染出注册邮箱输入框 → 返回 'progressed'
//   C) 在超时时间内什么都没发生 → 返回 'none'（保底 reportComplete）
async function waitForChooseAccountPickerOrProgress(timeoutMs) {
  const startUrl = location.href;
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (Date.now() < deadline) {
    if (isChooseAccountPickerVisible()) return 'picker';
    if (location.href !== startUrl) return 'progressed';
    if (getVisibleRegistrationEmailInput()) return 'progressed';
    await sleep(150);
  }
  return 'none';
}

// 点击「免费注册」/「创建帐户」之后，等待页面真正进入能填邮箱/密码/验证码的状态。
// 背景：reportComplete(2) 一旦发出，background.js:5415 会立刻触发 ensureAutoEmailReady
// → 可能调 iCloud /v1/hme/generate 消耗一次 Hide My Email 配额（每 Apple ID 每小时
// 约 5 个上限）。如果此时页面仍在跳转中间态，step 3 找不到邮箱输入框 → 重启 → 再申请
// 一次别名 → 几轮后触发 Apple 限流。
// 因此必须等到下列任一 surface 真的就绪，才算步骤 2 完成：
//   - 邮箱输入框（最常见路径）
//   - 密码输入框（已直接跳到密码页）
//   - 验证码 / 加手机 / step5（已跨多步推进）
// 全部 miss 则返回 null，调用方改走 needsAlternateSignupEntry 切下一个候选 URL，避免
// 把假"完成"信号传给 background。
async function waitForStep2RegistrationSurfaceReady(timeoutMs) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (Date.now() < deadline) {
    if (getVisibleRegistrationEmailInput()) return 'email';
    if (getSignupPasswordInput()) return 'password';
    if (isVerificationPageStillVisible()) return 'verification';
    if (isAddPhonePageReady()) return 'add_phone';
    if (isStep5Ready()) return 'step5';
    await sleep(200);
  }
  return null;
}

// ============================================================
// Step 3: Fill Email & Password
// ============================================================


async function completeStep3PasswordStage({ email, password, activeEmailInput = null, passwordInput = null }) {
  const latestEmailInput = getVisibleRegistrationEmailInput();
  if (latestEmailInput && latestEmailInput !== activeEmailInput) {
    const currentValue = String(latestEmailInput.value || '').trim();
    if (currentValue !== email) {
      await humanPause(300, 800);
      fillInput(latestEmailInput, email);
      log('步骤 3：密码页仍要求邮箱，已重新填写邮箱');
    }
  }

  const resolvedPasswordInput = passwordInput || getSignupPasswordInput();
  if (!resolvedPasswordInput) {
    throw new Error('步骤 3：未找到密码输入框，无法继续填写密码。URL: ' + location.href);
  }

  if (!password) throw new Error('未提供密码，步骤 3 需要可用密码。');
  await humanPause(600, 1500);
  fillInput(resolvedPasswordInput, password);
  log('步骤 3：密码已填写');
  await clearPendingStep3PasswordStage();

  const submitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|sign\s*up|submit|注册|创建|create/i, 5000).catch(() => null);

  // Report complete BEFORE submit, because submit causes page navigation
  // which kills the content script connection
  const signupVerificationRequestedAt = submitBtn ? Date.now() : null;
  reportComplete(3, { email, signupVerificationRequestedAt });

  // Submit the form (page will navigate away after this)
  await sleep(500);
  if (submitBtn) {
    await humanPause(500, 1300);
    simulateClick(submitBtn);
    log('步骤 3：表单已提交');

    const submitOutcome = await waitForSignupVerificationTransition(4000);
    if (submitOutcome.state === 'email_exists') {
      throw new Error('当前邮箱已存在，需要重新开始新一轮。');
    }
    if (submitOutcome.state === 'register_error') {
      throw new Error(submitOutcome.errorText || '注册接口返回失败，请重试。');
    }
    if (submitOutcome.state === 'verification') {
      log('步骤 3：提交后已进入验证码阶段。', 'ok');
    } else if (submitOutcome.state === 'step5') {
      log('步骤 3：提交后页面已直接进入下一阶段。', 'ok');
    } else if (submitOutcome.state === 'add_phone') {
      log('步骤 3：提交后页面已进入手机号阶段。', 'warn');
    }
  }

  return { passwordStageCompleted: true, url: location.href };
}

async function maybeCompleteStep3InlineAfterEmailSubmit({ email, password, activeEmailInput = null, timeoutMs = 6000 }) {
  const start = Date.now();
  let loggedUsePasswordPrompt = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();

    const invalidStatePage = getInvalidStateErrorPageState();
    if (invalidStatePage) {
      log(`步骤 3：邮箱提交后检测到 invalid_state 错误页（${invalidStatePage.url}），准备自动恢复。`, 'warn');
      if (!invalidStatePage.retryEnabled) {
        throw new Error(`STEP3_INVALID_STATE_RESTART: 邮箱提交后遇到 invalid_state 错误页，但「重试」按钮被禁用。URL: ${invalidStatePage.url}`);
      }
      simulateClick(invalidStatePage.retryButton);
      await sleep(2000);
      if (isInvalidStateErrorPage()) {
        throw new Error(`STEP3_INVALID_STATE_RESTART: 邮箱提交后点击「重试」后 2s 内仍是 invalid_state 错误页（OAuth state 彻底失效），需从步骤 2 重新开始。URL: ${location.href}`);
      }
      continue;
    }

    // 覆盖通用「糟糕，出错了！Operation timed out」错误页：它不是 invalid_state，
    // 路径可能落在 /log-in-or-create-account，两个专用探测器（signup-password /
    // login timeout）都不命中。走通用探测并要求 detailMatched（含 operation timed
    // out / 请求超时 等文案）真命中，避免错把「糟糕，出错了」共享标题的其他错误页
    // 误判成 timeout。处理策略同 invalid_state：点「重试」→ 2s 后仍未脱离就抛
    // STEP3_INVALID_STATE_RESTART，让 background 触发 step 2 重启。
    const timeoutPage = getAuthTimeoutErrorPageState();
    if (timeoutPage?.detailMatched) {
      log(`步骤 3：邮箱提交后检测到「Operation timed out」错误页（${timeoutPage.url}），准备点「重试」自动恢复。`, 'warn');
      if (!timeoutPage.retryEnabled) {
        throw new Error(`STEP3_INVALID_STATE_RESTART: 邮箱提交后遇到 timeout 错误页，但「重试」按钮被禁用。URL: ${timeoutPage.url}`);
      }
      simulateClick(timeoutPage.retryButton);
      await sleep(2000);
      const stillTimeout = getAuthTimeoutErrorPageState();
      if (stillTimeout?.detailMatched) {
        throw new Error(`STEP3_INVALID_STATE_RESTART: 邮箱提交后点击「重试」后 2s 内仍是 timeout 错误页（OAuth 超时无法恢复），需从步骤 2 重新开始。URL: ${location.href}`);
      }
      continue;
    }

    const passwordInput = getSignupPasswordInput();
    if (passwordInput) {
      log('步骤 3：邮箱提交后检测到密码输入框已在当前页出现，继续填写密码...', 'info');
      await completeStep3PasswordStage({ email, password, activeEmailInput, passwordInput });
      return { completedInline: true, surface: 'password' };
    }

    const usePasswordAction = findUsePasswordContinueAction({ allowDisabled: true });
    if (usePasswordAction) {
      if (!loggedUsePasswordPrompt) {
        log('步骤 3：邮箱提交后检测到“使用密码继续”入口，准备切回密码表单...', 'info');
        loggedUsePasswordPrompt = true;
      }
      const continueResult = await maybeContinueWithPassword(3000);
      if (continueResult?.blocked) {
        log(`步骤 3：检测到“${continueResult.actionText || '使用密码继续'}”按钮，但当前不可点击，将等待页面后续变化。`, 'warn');
        return { completedInline: false, blockedUsePassword: true };
      }
      if (continueResult?.passwordInput) {
        await completeStep3PasswordStage({
          email,
          password,
          activeEmailInput: continueResult.emailInput || activeEmailInput,
          passwordInput: continueResult.passwordInput,
        });
        return { completedInline: true, surface: 'use_password_continue' };
      }
    }

    await sleep(200);
  }

  return { completedInline: false };
}

async function step3_fillEmailPassword(payload) {
  const { email } = payload;
  if (!email) throw new Error('未提供邮箱地址，请先在侧边栏粘贴邮箱。');
  clearStep3RegisterError();

  // 最后防线：step 2 的 post-click 守望只看 step 2 tab 的 5 秒窗口，若「欢迎回来」
  // 弹窗出现得更晚（iCloud 邮箱生成那几秒），step 3 上来就会撞见弹窗并死等邮箱
  // 输入框 10 秒。在这里先把弹窗处理掉：清缓存账号 X → 点「创建帐户」→ 让 OpenAI
  // 把邮箱输入框渲染出来，后续 waitForStep3Surface/waitForElement 自然接手。
  if (isChooseAccountPickerVisible()) {
    log('步骤 3：进入 step 3 时发现「欢迎回来」弹窗，先清理缓存账号并点「创建帐户」。', 'warn');
    const cleanup = await performChooseAccountPickerCleanup();
    if (!cleanup.ok) {
      throw new Error(`step 3 入口检测到欢迎回来弹窗，但未找到「创建帐户」按钮。URL: ${location.href}`);
    }
    simulateClick(cleanup.createBtn);
    await sleep(800);
  }

  // invalid_state 错误页自动恢复：
  // step 2 → step 3 跳转期间，若 OAuth state 校验失败（cookie 残留 / 同 tab 多次触发 /
  // 备用 URL 直接打开但 state cookie 已损坏），OpenAI 会把页面换成错误页。
  // 策略：
  //   1) 检测到就点「重试」按钮 + 等 2 秒；
  //   2) 若重试后页面恢复正常（有邮箱框等），后续 waitForStep3Surface 自然接手；
  //   3) 若重试后仍是 invalid_state（OAuth state 彻底损坏），立即抛 STEP3_INVALID_STATE_RESTART，
  //      background 识别后触发 step 2 restart（清 cookie 重建 OAuth context），避免陷入死循环。
  const invalidStatePage = getInvalidStateErrorPageState();
  if (invalidStatePage) {
    log(`步骤 3：进入 step 3 时发现 invalid_state 错误页（${invalidStatePage.url}），自动点击「重试」。`, 'warn');
    if (!invalidStatePage.retryEnabled) {
      // 按钮禁用 → OAuth state 彻底损坏，无法自愈，必须触发 step 2 restart。
      throw new Error(`STEP3_INVALID_STATE_RESTART: step 3 入口遇到 invalid_state 错误页，但「重试」按钮被禁用。URL: ${invalidStatePage.url}`);
    }
    simulateClick(invalidStatePage.retryButton);
    await sleep(2000);
    // 重试后二次检测：若仍是 invalid_state，说明 OAuth state 已彻底损坏，必须从 step 2 重来。
    if (isInvalidStateErrorPage()) {
      throw new Error(`STEP3_INVALID_STATE_RESTART: step 3 入口点击「重试」后 2s 内仍是 invalid_state 错误页（OAuth state 彻底失效），需清理 cookie 重建 OAuth context。URL: ${location.href}`);
    }
  }

  log(`步骤 3：正在填写邮箱：${email}`);

  let passwordInput = getSignupPasswordInput();
  let emailInput = getVisibleRegistrationEmailInput();

  if (!emailInput && !passwordInput) {
    const surface = await waitForStep3Surface(10000);
    if (surface.type === 'password') {
      passwordInput = surface.passwordInput || getSignupPasswordInput();
    } else if (surface.type === 'email') {
      emailInput = surface.emailInput || getVisibleRegistrationEmailInput();
    }
  }

  // Find email input or password input after switching from "use password continue" flow.
  if (!emailInput && !passwordInput) {
    try {
      emailInput = await waitForElement(
        REGISTRATION_EMAIL_INPUT_SELECTOR,
        10000
      );
    } catch {
      passwordInput = getSignupPasswordInput();
      if (!passwordInput) {
        throw new Error('在注册页未找到邮箱输入框。URL: ' + location.href);
      }
    }
  }

  let activeEmailInput = emailInput;
  if (emailInput) {
    await humanPause(500, 1400);
    fillInput(emailInput, email);
    log('步骤 3：邮箱已填写');
  } else {
    log('步骤 3：当前页面已直接进入密码流程，无需重新填写邮箱。', 'info');
  }

  // Check if password field is on the same page
  passwordInput = passwordInput || getSignupPasswordInput();
  const currentEmailInput = getVisibleRegistrationEmailInput();
  if (currentEmailInput) {
    const currentValue = String(currentEmailInput.value || '').trim();
    if (currentValue !== email) {
      await humanPause(300, 800);
      fillInput(currentEmailInput, email);
      log('步骤 3：当前账号创建页仍要求邮箱，已重新填写邮箱');
      activeEmailInput = currentEmailInput;
    }
  }

  if (!passwordInput) {
    // Need to submit email first to get to password page
    log('步骤 3：暂未发现密码输入框，先提交邮箱...');
    const submitBtn = document.querySelector('button[type="submit"]')
      || await waitForElementByText('button', /continue|next|submit|继续|下一步/i, 5000).catch(() => null);

    if (submitBtn) {
      await setPendingStep3PasswordStage({ email });
      window.setTimeout(() => {
        Promise.resolve().then(async () => {
          try {
            await humanPause(400, 1100);
            simulateClick(submitBtn);
            log('步骤 3：邮箱已提交，正在等待密码输入框...');
            const inlineResult = await maybeCompleteStep3InlineAfterEmailSubmit({
              email,
              password: payload.password,
              activeEmailInput,
            });
            if (inlineResult?.completedInline) {
              log('步骤 3：邮箱提交后已在当前页完成密码阶段，无需等待内容脚本重新就绪。', 'ok');
            }
          } catch (error) {
            const errorMessage = error?.message || String(error);
            log(`步骤 3：邮箱阶段提交失败：${errorMessage}`, 'error');
            reportError(3, errorMessage);
          }
        });
      }, 80);
      log('步骤 3：邮箱阶段已准备完成，正在切换到密码页...');
      return { emailStageSubmitted: true, url: location.href };
    }

    throw new Error('提交邮箱时未找到继续按钮。URL: ' + location.href);
  }

  return await completeStep3PasswordStage({
    email,
    password: payload.password,
    activeEmailInput,
    passwordInput,
  });
}

// ============================================================
// Fill Verification Code (used by step 4 and step 7)
// ============================================================

const INVALID_VERIFICATION_CODE_PATTERN = /代码不正确|验证码不正确|验证码错误|code\s+(?:is\s+)?incorrect|invalid\s+code|incorrect\s+code|try\s+again/i;
const VERIFICATION_PAGE_PATTERN = /检查您的收件箱|输入我们刚刚向|重新发送电子邮件|重新发送验证码|验证码|代码不正确|email\s+verification/i;
const OAUTH_CONSENT_PAGE_PATTERN = /使用\s*ChatGPT\s*登录到\s*Codex|sign\s+in\s+to\s+codex(?:\s+with\s+chatgpt)?|login\s+to\s+codex|log\s+in\s+to\s+codex|authorize|授权/i;
const OAUTH_CONSENT_FORM_SELECTOR = 'form[action*="/sign-in-with-chatgpt/" i][action*="/consent" i]';
const CONTINUE_ACTION_PATTERN = /继续|continue/i;
const USE_PASSWORD_CONTINUE_PATTERN = /使用密码继续|continue\s+with\s+password|use\s+password(?:\s+to\s+continue)?/i;
const ADD_PHONE_PAGE_PATTERN = /add[\s-]*phone|添加手机号|手机号码|手机号|phone\s+number|telephone/i;
const STEP5_SUBMIT_ERROR_PATTERN = /无法根据该信息创建帐户|请重试|unable\s+to\s+create\s+(?:your\s+)?account|couldn'?t\s+create\s+(?:your\s+)?account|something\s+went\s+wrong|invalid\s+(?:birthday|birth|date)|生日|出生日期/i;
const AUTH_TIMEOUT_ERROR_TITLE_PATTERN = /糟糕，出错了|something\s+went\s+wrong|oops/i;
const AUTH_TIMEOUT_ERROR_DETAIL_PATTERN = /operation\s+timed\s+out|timed\s+out|请求超时|操作超时/i;
const SIGNUP_EMAIL_EXISTS_PATTERN = /与此电子邮件地址相关联的帐户已存在|account\s+associated\s+with\s+this\s+email\s+address\s+already\s+exists|email\s+address.*already\s+exists/i;
const CHATGPT_ONBOARDING_PROMPT_PATTERN = /what\s+brings\s+you\s+to\s+chatgpt|什么促使你使用\s*chatgpt/i;
const CHATGPT_ONBOARDING_OPTION_PATTERN = /学校|工作|个人任务|乐趣和娱乐|其他|school|work|personal\s+tasks?|fun|entertainment|other/i;
const CHATGPT_ONBOARDING_NEXT_PATTERN = /下一步|继续|next|continue/i;
const CHATGPT_ONBOARDING_SKIP_PATTERN = /跳过|skip/i;
const CHATGPT_ONBOARDING_SKIP_NOW_PATTERN = /跳过导览|跳过导航|跳过|skip(?:\s+for\s+now)?|not\s+now/i;
const CHATGPT_ONBOARDING_CONTINUE_PATTERN = /继续|下一步|continue|next|开始|完成|done|finish/i;
const CHATGPT_ONBOARDING_START_PATTERN = /好的，开始吧|开始吧|let'?s\s*go|got\s*it|start\s*chatting|start\s*using/i;
const CHATGPT_ONBOARDING_CANCEL_PATTERN = /取消|cancel/i;
const CHATGPT_GROUP_CHAT_MODAL_PATTERN = /共同使用\s*chatgpt|在聊天中添加他人|开始群聊|group\s+chat|share.*chatgpt/i;
const CHATGPT_GROUP_CHAT_START_PATTERN = /开始群聊|start\s+group\s+chat/i;
const CHATGPT_LOGOUT_ACTION_PATTERN = /退出登录|登出|退出帳號|log\s*out|sign\s*out/i;
const CHATGPT_LOGIN_ACTION_PATTERN = /登录|登入|log\s*in|sign\s*in/i;
const CHATGPT_SIGNUP_ACTION_PATTERN = /注册|创建帐户|create\s*account|sign\s*up|get\s*started/i;
const CHATGPT_ACCOUNT_ACTION_EXCLUDE_PATTERN = /退出登录|登出|设置|帮助|更多|upgrade|plus|退出帳號|log\s*out|sign\s*out/i;
const CHATGPT_ACCOUNT_CARD_TEXT_PATTERN = /免费版|plus|pro|team|enterprise|升级|upgrade/i;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP5_PENDING_CROSS_ORIGIN_COMPLETION_KEY = 'pendingStep5CrossOriginCompletion';

async function setPendingStep3PasswordStage(payload = {}) {
  if (!chrome.storage?.session?.set) return;
  await chrome.storage.session.set({
    [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
      startedAt: Date.now(),
      status: 'waiting',
      ...payload,
    },
  });
}

async function clearPendingStep3PasswordStage() {
  if (!chrome.storage?.session?.remove) return;
  await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY);
}

async function setPendingStep5CrossOriginCompletion(payload = {}) {
  if (!chrome.storage?.session?.set) return;
  await chrome.storage.session.set({
    [STEP5_PENDING_CROSS_ORIGIN_COMPLETION_KEY]: {
      startedAt: Date.now(),
      ...payload,
    },
  });
}

async function getPendingStep5CrossOriginCompletion() {
  if (!chrome.storage?.session?.get) return null;
  const state = await chrome.storage.session.get(STEP5_PENDING_CROSS_ORIGIN_COMPLETION_KEY);
  return state?.[STEP5_PENDING_CROSS_ORIGIN_COMPLETION_KEY] || null;
}

async function clearPendingStep5CrossOriginCompletion() {
  if (!chrome.storage?.session?.remove) return;
  await chrome.storage.session.remove(STEP5_PENDING_CROSS_ORIGIN_COMPLETION_KEY);
}

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
    document.querySelector('input[name="name"], input[autocomplete="name"], input[name="birthday"], input[name="age"], [role="spinbutton"][data-type="year"]')
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

function isChatGptPostSignupLandingPage() {
  const hostname = String(location.hostname || '').trim().toLowerCase();
  if (!hostname || !/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname)) {
    return false;
  }

  const pageText = getPageTextSnapshot();
  if (CHATGPT_ONBOARDING_PROMPT_PATTERN.test(pageText)) {
    return true;
  }

  const actions = Array.from(
    document.querySelectorAll('button, [role="button"], a, label')
  ).filter(isVisibleElement);
  const optionMatches = actions.filter((el) => CHATGPT_ONBOARDING_OPTION_PATTERN.test(getActionText(el)));
  const hasNext = actions.some((el) => CHATGPT_ONBOARDING_NEXT_PATTERN.test(getActionText(el)));
  const hasSkip = actions.some((el) => CHATGPT_ONBOARDING_SKIP_PATTERN.test(getActionText(el)));

  return optionMatches.length >= 2 && hasNext && hasSkip;
}

function isChatGptDomain() {
  const hostname = String(location.hostname || '').trim().toLowerCase();
  return /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname);
}

async function maybeReportPendingStep5CrossOriginCompletion() {
  if (!isChatGptDomain()) {
    return;
  }

  const pending = await getPendingStep5CrossOriginCompletion();
  if (!pending) {
    return;
  }

  const ageMs = Math.max(0, Date.now() - Number(pending.startedAt || 0));
  if (ageMs > 120000) {
    await addLog('步骤 5：ChatGPT 引导页处理超时，记录告警后直接继续后续步骤。', 'warn');
    await clearPendingStep5CrossOriginCompletion();
    reportComplete(5, { chatgptOnboarding: true, onboardingWarning: 'timeout waiting for onboarding completion' });
    return;
  }

  const state = await chrome.storage.session.get(['currentStep', 'stepStatuses']).catch(() => ({}));
  const stepStatuses = state?.stepStatuses || {};
  const step5Running = state?.currentStep === 5 || stepStatuses?.[5] === 'running';
  if (!step5Running) {
    return;
  }

  try {
    const waitUntil = Date.now() + 15000;
    while (Date.now() < waitUntil) {
      throwIfStopped();
      const pageText = getPageTextSnapshot();
      if (pageText && pageText.length > 20) {
        break;
      }
      await sleep(250);
    }

    log('步骤 5：检测到“完成帐户创建”后已跳转到 ChatGPT 页面，直接结束步骤 5 并继续后续步骤。', 'ok');
    await clearPendingStep5CrossOriginCompletion();
    reportComplete(5, { chatgptCrossOriginCompleted: true });
  } catch (error) {
    const message = error?.message || String(error);
    await addLog(`步骤 5：跨域跳转到 ChatGPT 页面后的完成确认失败，将记录告警并继续后续步骤：${message}`, 'warn');
    await clearPendingStep5CrossOriginCompletion();
    reportComplete(5, { chatgptCrossOriginCompleted: true, completionWarning: message });
  }
}

async function maybeHandleStep5PostSignupOverlay() {
  return;
}

function findVisibleActions(selectors = 'button, a, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="link"]') {
  return Array.from(document.querySelectorAll(selectors)).filter(isVisibleElement);
}

function findChatGptPostSignupAction() {
  const actions = findVisibleActions('button, [role="button"], a');
  const overlayActions = actions.filter((el) => {
    const dialogLike = Boolean(el.closest?.('[role="dialog"], dialog, [aria-modal="true"]'));
    if (dialogLike) return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.top <= window.innerHeight * 0.75;
  });
  const overlayContainers = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]'))
    .filter(isVisibleElement);
  const dialogText = [
    ...overlayContainers.map((el) => normalizeInlineText(el.textContent)),
    ...overlayActions.map((el) => getActionText(el)),
  ]
    .join(' ');

  if (CHATGPT_GROUP_CHAT_MODAL_PATTERN.test(dialogText)) {
    const cancelAction = actions.find((el) => {
      if (!isActionEnabled(el)) return false;
      return CHATGPT_ONBOARDING_CANCEL_PATTERN.test(getActionText(el));
    });
    if (cancelAction) {
      return cancelAction;
    }
  }

  return actions.find((el) => {
    if (!isActionEnabled(el)) return false;
    if (CHATGPT_GROUP_CHAT_START_PATTERN.test(getActionText(el))) return false;
    return CHATGPT_ONBOARDING_SKIP_NOW_PATTERN.test(getActionText(el));
  })
    || actions.find((el) => {
      if (!isActionEnabled(el)) return false;
      if (CHATGPT_GROUP_CHAT_START_PATTERN.test(getActionText(el))) return false;
      return CHATGPT_ONBOARDING_START_PATTERN.test(getActionText(el));
    })
    || actions.find((el) => {
      if (!isActionEnabled(el)) return false;
      if (CHATGPT_GROUP_CHAT_START_PATTERN.test(getActionText(el))) return false;
      return CHATGPT_ONBOARDING_CONTINUE_PATTERN.test(getActionText(el));
    })
    || null;
}

async function waitForChatGptPostSignupAction(timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    const action = findChatGptPostSignupAction();
    if (action) {
      return action;
    }
    await sleep(250);
  }
  return null;
}

async function advanceChatGptPostSignupOnboarding(options = {}) {
  const {
    logPrefix = '步骤 5',
    maxRounds = 12,
  } = options;
  let round = 0;

  while (round < maxRounds) {
    const action = await waitForChatGptPostSignupAction(round === 0 ? 5000 : 3500);
    if (!action) {
      return { rounds: round, finished: true };
    }

    round += 1;
    await humanPause(250, 700);
    simulateClick(action);
    log(`${logPrefix}：已点击 ChatGPT 引导按钮：${getActionText(action) || 'unknown'}（${round}/${maxRounds}）...`);
    await sleep(1200);
  }

  return { rounds: maxRounds, finished: !(await waitForChatGptPostSignupAction(4000)) };
}

function isChatGptLoggedInShell() {
  const hostname = String(location.hostname || '').trim().toLowerCase();
  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname)) {
    return false;
  }
  const pageText = getPageTextSnapshot();
  return !CHATGPT_LOGIN_ACTION_PATTERN.test(pageText) || !CHATGPT_SIGNUP_ACTION_PATTERN.test(pageText);
}

function isChatGptLoggedOutSurface() {
  const hostname = String(location.hostname || '').trim().toLowerCase();
  const pageText = getPageTextSnapshot();

  if (/(^|\.)auth0\.openai\.com$|(^|\.)auth\.openai\.com$|(^|\.)accounts\.openai\.com$/.test(hostname)) {
    return Boolean(
      document.querySelector('input[type="email"], input[name="email"], input[name="username"]')
      || findRegisterEntryAction({ allowDisabled: true })
    );
  }

  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname)) {
    return false;
  }

  const actions = findVisibleActions();
  const hasLogin = actions.some((el) => CHATGPT_LOGIN_ACTION_PATTERN.test(getActionText(el)));
  const hasSignup = actions.some((el) => CHATGPT_SIGNUP_ACTION_PATTERN.test(getActionText(el)));
  if (hasLogin || hasSignup) {
    return true;
  }

  return /log\s*in|sign\s*in|create\s*account|sign\s*up|登录|注册|创建帐户/.test(pageText)
    && !CHATGPT_LOGOUT_ACTION_PATTERN.test(pageText);
}

function findChatGptLogoutAction() {
  return findVisibleActions().find((el) => CHATGPT_LOGOUT_ACTION_PATTERN.test(getActionText(el))) || null;
}

function findChatGptLogoutConfirmButton() {
  const actions = findVisibleActions('button, [role="button"]');
  return actions.find((el) => CHATGPT_LOGOUT_ACTION_PATTERN.test(getActionText(el))) || null;
}

function isDialogActionElement(element) {
  return Boolean(element?.closest?.('[role="dialog"], dialog, [aria-modal="true"]'));
}

function isChatGptAccountMenuOpen(trigger = null) {
  if (findChatGptLogoutAction()) {
    return true;
  }
  const candidate = trigger || findChatGptAccountMenuTrigger();
  if (!candidate) {
    return false;
  }
  return candidate.getAttribute('aria-expanded') === 'true'
    || candidate.getAttribute('data-state') === 'open';
}

function findChatGptOnboardingAction(pattern) {
  return findVisibleActions('button, [role="button"], a').find((el) => {
    if (!isActionEnabled(el)) return false;
    return pattern.test(getActionText(el));
  }) || null;
}

async function clickChatGptOnboardingActionIfPresent(pattern, options = {}) {
  const {
    label = '引导按钮',
    waitAfterMs = 1200,
  } = options;

  const action = findChatGptOnboardingAction(pattern);
  if (!action) {
    return false;
  }

  await humanPause(250, 700);
  simulateClick(action);
  log(`步骤 10：已点击 ChatGPT onboarding 按钮：${getActionText(action) || label}`);
  if (waitAfterMs > 0) {
    await sleep(waitAfterMs);
  }
  return true;
}

async function waitForChatGptOnboardingAction(pattern, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    const action = findChatGptOnboardingAction(pattern);
    if (action) {
      return action;
    }
    await sleep(250);
  }
  return null;
}

async function dismissChatGptOnboardingBeforeLogout(maxRounds = 6) {
  await clickChatGptOnboardingActionIfPresent(CHATGPT_ONBOARDING_SKIP_PATTERN, {
    label: '跳过',
    waitAfterMs: 1000,
  });

  await clickChatGptOnboardingActionIfPresent(CHATGPT_ONBOARDING_SKIP_NOW_PATTERN, {
    label: '跳过导览',
    waitAfterMs: 1000,
  });

  await clickChatGptOnboardingActionIfPresent(CHATGPT_ONBOARDING_CONTINUE_PATTERN, {
    label: '继续',
    waitAfterMs: 1500,
  });

  await sleep(1200);

  const startAction = await waitForChatGptOnboardingAction(CHATGPT_ONBOARDING_START_PATTERN, 6000);
  if (startAction) {
    await humanPause(250, 700);
    simulateClick(startAction);
    log(`步骤 10：已点击 ChatGPT onboarding 按钮：${getActionText(startAction) || '好的，开始吧'}`);
    await sleep(1200);
  }

  const result = await advanceChatGptPostSignupOnboarding({ logPrefix: '步骤 10', maxRounds });
  if (!result.finished) {
    throw new Error(`步骤 10：连续 ${maxRounds} 轮处理后仍停留在 ChatGPT onboarding 页面，无法继续退出登录。`);
  }
}

async function openChatGptAccountMenu(trigger) {
  const triggerLabel = trigger?.getAttribute?.('data-testid') || trigger?.id || trigger?.tagName || 'unknown';
  const attempts = [
    {
      label: 'click',
      action: async () => {
        trigger.scrollIntoView?.({ behavior: 'auto', block: 'center', inline: 'nearest' });
        await humanPause(300, 800);
        simulateClick(trigger);
      },
    },
    {
      label: 'pointer-sequence',
      action: async () => {
        trigger.scrollIntoView?.({ behavior: 'auto', block: 'center', inline: 'nearest' });
        trigger.focus?.();
        const pointerInit = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerType: 'mouse' };
        try {
          trigger.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
          trigger.dispatchEvent(new PointerEvent('pointerup', pointerInit));
        } catch {
          trigger.dispatchEvent(new MouseEvent('mousedown', pointerInit));
          trigger.dispatchEvent(new MouseEvent('mouseup', pointerInit));
        }
        trigger.dispatchEvent(new MouseEvent('click', pointerInit));
      },
    },
    {
      label: 'keyboard-enter',
      action: async () => {
        trigger.focus?.();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        trigger.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      },
    },
  ];

  for (const attempt of attempts) {
    await attempt.action();
    await sleep(500);
    if (isChatGptAccountMenuOpen(trigger)) {
      log(`步骤 10：已通过 ${attempt.label} 打开左下角账号菜单（${triggerLabel}）。`);
      return;
    }
  }

  throw new Error(`步骤 10：已尝试 click / pointer / keyboard 打开左下角账号菜单（${triggerLabel}），但菜单仍未展开。`);
}

function findChatGptAccountMenuTrigger() {
  const directSelectors = [
    '[data-testid="accounts-profile-button"][data-sidebar-item="true"][aria-haspopup="menu"]',
    '[data-testid="accounts-profile-button"][aria-haspopup="menu"]',
    'div.sticky.bottom-0 [data-sidebar-item="true"][aria-haspopup="menu"][role="button"]',
    '[data-sidebar-item="true"][aria-haspopup="menu"][role="button"]',
    '[data-sidebar-item="true"][aria-haspopup="menu"]',
  ];

  for (const selector of directSelectors) {
    const directMatch = Array.from(document.querySelectorAll(selector))
      .filter(isVisibleElement)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.top - leftRect.top;
      })[0];
    if (directMatch) {
      return directMatch;
    }
  }

  const actions = [
    ...findVisibleActions('button, [role="button"], a'),
    ...Array.from(document.querySelectorAll('div, aside, nav')).filter(isVisibleElement),
  ];
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const menuCandidates = actions.filter((el) => {
    const text = getActionText(el);
    const normalizedText = (text || '').trim();
    if (normalizedText && CHATGPT_ACCOUNT_ACTION_EXCLUDE_PATTERN.test(normalizedText) && !CHATGPT_ACCOUNT_CARD_TEXT_PATTERN.test(normalizedText)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const hasAvatarLikeChild = Boolean(el.querySelector?.('img, svg, [data-testid*="avatar" i], [class*="avatar" i]'));
    const hasAccountText = CHATGPT_ACCOUNT_CARD_TEXT_PATTERN.test(normalizedText);
    return (
      (
        el.getAttribute('aria-haspopup') === 'menu'
        || el.getAttribute('aria-expanded') !== null
        || hasAvatarLikeChild
        || hasAccountText
      )
      && rect.left <= Math.max(320, viewportWidth * 0.35)
      && rect.top >= viewportHeight * 0.55
      && rect.width >= 120
      && rect.height >= 36
    );
  });

  menuCandidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const leftScore = (CHATGPT_ACCOUNT_CARD_TEXT_PATTERN.test(getActionText(left)) ? 10 : 0) + (left.querySelector?.('img, svg') ? 5 : 0);
    const rightScore = (CHATGPT_ACCOUNT_CARD_TEXT_PATTERN.test(getActionText(right)) ? 10 : 0) + (right.querySelector?.('img, svg') ? 5 : 0);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    const rectDiff = rightRect.top - leftRect.top;
    if (Math.abs(rectDiff) > 4) {
      return rectDiff;
    }
    return leftRect.left - rightRect.left;
  });

  return menuCandidates[0] || null;
}

async function waitForChatGptLogoutConfirmDialog(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    const confirmButton = findChatGptLogoutConfirmButton();
    if (confirmButton) {
      return confirmButton;
    }
    await sleep(150);
  }
  throw new Error('步骤 10：未找到“退出登录”确认按钮。');
}

async function waitForChatGptLoggedOutState(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    if (isChatGptLoggedOutSurface()) {
      return { loggedOut: true, url: location.href };
    }
    await sleep(200);
  }
  throw new Error('步骤 10：已触发退出登录，但页面在预期时间内未进入已退出状态。');
}

async function waitForChatGptLogoutPreparation(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();

    if (isChatGptLoggedOutSurface()) {
      return { surface: 'logged_out' };
    }

    if (isChatGptPostSignupLandingPage()) {
      return { surface: 'onboarding' };
    }

    const logoutAction = findChatGptLogoutAction();
    if (logoutAction && isDialogActionElement(logoutAction)) {
      return { surface: 'logout_confirm', logoutAction };
    }

    const trigger = findChatGptAccountMenuTrigger();
    if (trigger) {
      return { surface: 'account_menu', trigger };
    }

    await sleep(250);
  }

  return { surface: 'unknown' };
}

async function step10_logout() {
  log('步骤 10：正在尝试退出当前 ChatGPT 登录态...');

  if (isChatGptLoggedOutSurface()) {
    log('步骤 10：当前页面已经处于未登录状态，无需重复退出。', 'ok');
    reportComplete(10, { alreadyLoggedOut: true });
    return { alreadyLoggedOut: true };
  }

  let preparation = await waitForChatGptLogoutPreparation(10000);
  if (preparation.surface === 'logged_out') {
    log('步骤 10：等待页面稳定后确认当前已经处于未登录状态，无需重复退出。', 'ok');
    reportComplete(10, { alreadyLoggedOut: true });
    return { alreadyLoggedOut: true };
  }

  if (preparation.surface === 'onboarding') {
    log('步骤 10：检测到 ChatGPT onboarding 页面，先尝试跳过引导后再退出登录...', 'info');
    await dismissChatGptOnboardingBeforeLogout();
    await sleep(800);
    preparation = await waitForChatGptLogoutPreparation(10000);
  }

  let logoutAction = preparation.surface === 'logout_confirm'
    ? preparation.logoutAction
    : findChatGptLogoutAction();
  if (logoutAction && isDialogActionElement(logoutAction)) {
    await humanPause(250, 700);
    simulateClick(logoutAction);
    log('步骤 10：当前页面已显示退出确认弹窗，已直接确认退出。');
    const outcome = await waitForChatGptLoggedOutState();
    reportComplete(10, outcome);
    return outcome;
  }

  const trigger = preparation.surface === 'account_menu'
    ? preparation.trigger
    : findChatGptAccountMenuTrigger();
  if (!trigger) {
    throw new Error('步骤 10：等待 onboarding/账号菜单完成后，仍未找到 ChatGPT 左下角账号入口，无法执行退出登录。');
  }

  await openChatGptAccountMenu(trigger);
  log(`步骤 10：左下角账号菜单已展开（${trigger.getAttribute?.('data-testid') || trigger.getAttribute?.('id') || trigger.tagName}），正在查找“退出登录”入口...`);

  logoutAction = findChatGptLogoutAction();

  if (!logoutAction) {
    throw new Error('步骤 10：账号菜单已打开，但未找到“退出登录”入口。');
  }

  await humanPause(250, 700);
  simulateClick(logoutAction);
  log('步骤 10：已点击“退出登录”入口，等待确认弹窗...');

  const confirmButton = await waitForChatGptLogoutConfirmDialog();
  await humanPause(250, 700);
  simulateClick(confirmButton);
  log('步骤 10：已确认退出登录，正在等待页面回到未登录状态...');

  const outcome = await waitForChatGptLoggedOutState();
  reportComplete(10, outcome);
  return outcome;
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

    const errorText = getStep5SubmitErrorText();
    if (errorText) {
      return { invalidProfile: true, errorText };
    }

    if (isAddPhonePageReady()) {
      return { success: true, addPhonePage: true };
    }

    if (isChatGptPostSignupLandingPage()) {
      return { success: true, chatgptOnboarding: true };
    }

    if (isStep8Ready()) {
      return { success: true };
    }

    await sleep(150);
  }

  const errorText = getStep5SubmitErrorText();
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

function findUsePasswordContinueAction({ allowDisabled = false } = {}) {
  const candidates = document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
    return USE_PASSWORD_CONTINUE_PATTERN.test(getActionText(el));
  }) || null;
}

async function maybeContinueWithPassword(timeout = 8000) {
  const action = findUsePasswordContinueAction({ allowDisabled: true });
  if (!action) {
    return { continued: false };
  }

  if (!isActionEnabled(action)) {
    return {
      continued: false,
      blocked: true,
      actionText: getActionText(action),
    };
  }

  log(`步骤 3：检测到“${getActionText(action) || '使用密码继续'}”按钮，准备直接切回密码流程...`, 'info');
  await humanPause(350, 900);
  simulateClick(action);

  const start = Date.now();
  while (Date.now() - start < timeout) {
    throwIfStopped();
    const passwordInput = getSignupPasswordInput();
    const emailInput = getVisibleRegistrationEmailInput();
    if (passwordInput || emailInput) {
      return {
        continued: true,
        passwordInput,
        emailInput,
      };
    }
    await sleep(200);
  }

  return { continued: true };
}

async function waitForStep3Surface(timeout = 10000) {
  const start = Date.now();
  let loggedWaitingVerification = false;

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const passwordInput = getSignupPasswordInput();
    if (passwordInput) {
      return { type: 'password', passwordInput };
    }

    const emailInput = getVisibleRegistrationEmailInput();
    if (emailInput) {
      return { type: 'email', emailInput };
    }

    // invalid_state 错误页：邮箱提交后 OAuth state 失效（常见于 step 2 备用 URL 进入）。
    // 继续轮询 10s 无意义，立即放弃并触发 step 2 restart（background 识别标记后清 cookie）。
    if (isInvalidStateErrorPage()) {
      throw new Error(`STEP3_INVALID_STATE_RESTART: waitForStep3Surface 检测到 invalid_state 错误页，邮箱提交后 OAuth state 已失效，需从步骤 2 重新开始。URL: ${location.href}`);
    }

    const usePasswordAction = findUsePasswordContinueAction({ allowDisabled: true });
    if (usePasswordAction || isVerificationPageStillVisible()) {
      if (!loggedWaitingVerification) {
        loggedWaitingVerification = true;
        log(
          usePasswordAction
            ? '步骤 3：当前页面提供“使用密码继续”入口，正在尝试切回密码流程...'
            : '步骤 3：当前仍停留在验证码检查页，正在尝试切回密码流程...',
          'warn'
        );
      }

      const continueResult = await maybeContinueWithPassword(3000);
      if (continueResult?.blocked) {
        throw new Error(`检测到”${continueResult.actionText || '使用密码继续'}”按钮，但当前不可点击。URL: ${location.href}`);
      }

      if (continueResult?.continued) {
        continue;
      }
    }

    await sleep(200);
  }

  return { type: 'unknown' };
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

function isSignupPasswordErrorPage() {
  return Boolean(getSignupPasswordTimeoutErrorPageState());
}

// /email-verification 上的 Remix Route Error (405 Method Not Allowed)：
// 当上一轮 cookie 残留把页面强行带到该路由、或 step 3 用错按钮提交了表单，
// Remix 对该路由没有 action 导出 → 返回 405 错误页。该错误页含「糟糕，出错了！」
// 标题、「重试」按钮，以及 "Route Error" / "Method Not Allowed" / "EMAIL_VERIFICATION"
// 等独有文案。点击「重试」会让 OpenAI 重新走流程，通常能拿到新的验证码邮件。
const EMAIL_VERIFICATION_ROUTE_ERROR_DETAIL_PATTERN = /Route\s+Error|Method\s+Not\s+Allowed|EMAIL_VERIFICATION|did\s+not\s+provide\s+an\s+`?action`?/i;
const STEP8_ROUTE_ERROR_DETAIL_PATTERN = /Route\s+Error|Invalid\s+content\s+type|text\/html|Method\s+Not\s+Allowed|did\s+not\s+provide\s+an\s+`?action`?/i;

function getEmailVerificationRouteErrorPageState() {
  const path = location.pathname || '';
  if (!/\/email-verification(?:[/?#]|$)/i.test(path)) {
    return null;
  }

  const retryButton = getAuthRetryButton({ allowDisabled: true });
  if (!retryButton) {
    return null;
  }

  const text = getPageTextSnapshot();
  const titleMatched = AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(text)
    || AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(document.title || '');
  const routeErrorMatched = EMAIL_VERIFICATION_ROUTE_ERROR_DETAIL_PATTERN.test(text);

  // 405 错误页两个特征至少要满足一个，避免误识别（例如 OTP 页含「重试」入口）。
  if (!titleMatched && !routeErrorMatched) {
    return null;
  }

  return {
    path,
    url: location.href,
    retryButton,
    retryEnabled: isActionEnabled(retryButton),
    titleMatched,
    routeErrorMatched,
  };
}

function isEmailVerificationRouteErrorPage() {
  return Boolean(getEmailVerificationRouteErrorPageState());
}

function getStep8RouteErrorPageState() {
  const retryButton = getAuthRetryButton({ allowDisabled: true });
  if (!retryButton) {
    return null;
  }

  const text = getPageTextSnapshot();
  const titleMatched = AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(text)
    || AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(document.title || '');
  const routeErrorMatched = STEP8_ROUTE_ERROR_DETAIL_PATTERN.test(text);

  if (!routeErrorMatched) {
    return null;
  }

  return {
    path: location.pathname || '',
    url: location.href,
    retryButton,
    retryEnabled: isActionEnabled(retryButton),
    titleMatched,
    routeErrorMatched,
  };
}

function isStep8RouteErrorPage() {
  return Boolean(getStep8RouteErrorPageState());
}

// invalid_state 错误页：另一种 OpenAI 内部错误页，常见于 step 2 → step 3 跳转时
// OAuth state 校验失败（例如上一轮残留 cookie、同一 tab 短时间内多次进入注册流程），
// 或 OpenAI 后端内部状态机异常。特征：
//   - 标题：「糟糕，出错了！」 / Oops, something went wrong
//   - 详情：「验证过程中出错 (invalid_state)。请重试。」
//   - 带「重试」按钮
//   - URL 不一定在 /email-verification（与 Route Error 405 的关键区别）
// 处理策略：step 3 入口检测到 → 自动点「重试」→ OpenAI 通常能跳回正常注册表单。
const INVALID_STATE_ERROR_DETAIL_PATTERN = /invalid[_\s-]*state|验证过程中出错/i;

function getInvalidStateErrorPageState() {
  const retryButton = getAuthRetryButton({ allowDisabled: true });
  if (!retryButton) {
    return null;
  }

  const text = getPageTextSnapshot();
  const titleMatched = AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(text)
    || AUTH_TIMEOUT_ERROR_TITLE_PATTERN.test(document.title || '');
  const detailMatched = INVALID_STATE_ERROR_DETAIL_PATTERN.test(text);

  // 文案命中是硬条件：单靠「糟糕，出错了」标题会误识别 405 Route Error /
  // 密码页超时等其他错误页，那些由各自专用判定函数处理。
  if (!detailMatched) {
    return null;
  }

  return {
    path: location.pathname || '',
    url: location.href,
    retryButton,
    retryEnabled: isActionEnabled(retryButton),
    titleMatched,
    detailMatched,
  };
}

function isInvalidStateErrorPage() {
  return Boolean(getInvalidStateErrorPageState());
}

function buildStep7RestartFromStep6Marker(reason, url = location.href) {
  return `STEP7_RESTART_FROM_STEP6::${reason || 'unknown'}::${url || ''}`;
}

function getStep7RestartFromStep6Signal() {
  const timeoutPage = getLoginTimeoutErrorPageState();
  if (!timeoutPage) {
    return null;
  }

  return {
    error: buildStep7RestartFromStep6Marker('login_timeout_error_page', timeoutPage.url),
    restartFromStep6: true,
    reason: 'login_timeout_error_page',
    url: timeoutPage.url,
  };
}

function isSignupEmailAlreadyExistsPage() {
  return isSignupPasswordPage() && SIGNUP_EMAIL_EXISTS_PATTERN.test(getPageTextSnapshot());
}

function inspectSignupVerificationState() {
  if (isAddPhonePageReady()) {
    return { state: 'add_phone' };
  }

  if (isStep5Ready()) {
    return { state: 'step5' };
  }

  // 优先识别 /email-verification 上的 405 Route Error，必须在 verification / error 之前判定：
  // - 此页 URL 仍是 /email-verification，但页面已被 Remix 错误边界换成 405 错误页；
  // - 不会命中 isVerificationPageStillVisible（无 OTP 输入框、无原表单），但会有「重试」按钮；
  // - 把它转成 state:'error'+retryButton，让现有 prepareSignupVerificationFlow 的 error 分支
  //   自动点重试，OpenAI 会重新走流程（通常能拿到新的验证码邮件）。
  if (isEmailVerificationRouteErrorPage()) {
    const routeErrorPage = getEmailVerificationRouteErrorPageState();
    return {
      state: 'error',
      retryButton: routeErrorPage?.retryButton || null,
      routeError: true,
    };
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

    const registerErrorText = getStep3RegisterErrorText();
    if (registerErrorText) {
      return { state: 'register_error', errorText: registerErrorText };
    }

    const snapshot = inspectSignupVerificationState();
    if (snapshot.state === 'step5' || snapshot.state === 'add_phone' || snapshot.state === 'verification' || snapshot.state === 'error' || snapshot.state === 'email_exists') {
      return snapshot;
    }

    await sleep(200);
  }

  const registerErrorText = getStep3RegisterErrorText();
  if (registerErrorText) {
    return { state: 'register_error', errorText: registerErrorText };
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

    if (snapshot.state === 'register_error') {
      throw new Error(snapshot.errorText || '注册接口返回失败，请重试。');
    }

    if (snapshot.state === 'step5') {
      log('步骤 4：页面已进入验证码后的下一阶段，本步骤按已完成处理。', 'ok');
      return { ready: true, alreadyVerified: true, retried: recoveryRound };
    }

    if (snapshot.state === 'add_phone') {
      log('步骤 4：页面已进入手机号页面，当前不再等待注册验证码。', 'warn');
      return { ready: true, phoneRequired: true, retried: recoveryRound };
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
      const errorLabel = snapshot.routeError
        ? '/email-verification 路由 405 报错'
        : '密码页超时报错';
      if (snapshot.retryButton && isActionEnabled(snapshot.retryButton)) {
        log(`步骤 4：检测到${errorLabel}，正在点击“重试”（第 ${recoveryRound}/${maxRecoveryRounds} 次）...`, 'warn');
        await humanPause(350, 900);
        simulateClick(snapshot.retryButton);
        await sleep(1200);
        continue;
      }

      log(`步骤 4：检测到${errorLabel}，但“重试”按钮暂不可用，准备继续等待（${recoveryRound}/${maxRecoveryRounds}）...`, 'warn');
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

    if (step === 4 && isAddPhonePageReady()) {
      return { success: true, addPhonePage: true };
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
    const prepareResult = await prepareLoginCodeFlow();
    if (prepareResult?.restartFromStep6) {
      return prepareResult;
    }
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

async function step6_login(payload) {
  const { email, password } = payload;
  if (!email) throw new Error('登录时缺少邮箱地址。');

  log(`步骤 6：正在使用 ${email} 登录...`);

  // Wait for email input on the auth page
  let emailInput = null;
  try {
    emailInput = await waitForElement(
      'input[type="email"], input[name="email"], input[name="username"], input[id*="email"], input[placeholder*="email" i], input[placeholder*="Email"]',
      15000
    );
  } catch {
    throw new Error('在登录页未找到邮箱输入框。URL: ' + location.href);
  }

  await humanPause(500, 1400);
  fillInput(emailInput, email);
  log('步骤 6：邮箱已填写');

  // Submit email
  await sleep(500);
  const submitBtn1 = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|next|submit|继续|下一步/i, 5000).catch(() => null);
  if (submitBtn1) {
    await humanPause(400, 1100);
    simulateClick(submitBtn1);
    log('步骤 6：邮箱已提交');
  }

  await sleep(2000);

  // Check for password field
  const passwordInput = document.querySelector('input[type="password"]');
  if (passwordInput) {
    log('步骤 6：已找到密码输入框，正在填写密码...');
    await humanPause(550, 1450);
    fillInput(passwordInput, password);

    await sleep(500);
    const submitBtn2 = document.querySelector('button[type="submit"]')
      || await waitForElementByText('button', /continue|log\s*in|submit|sign\s*in|登录|继续/i, 5000).catch(() => null);
    // Report complete BEFORE submit in case page navigates
    reportComplete(6, { needsOTP: true });

    if (submitBtn2) {
      await humanPause(450, 1200);
      simulateClick(submitBtn2);
      log('步骤 6：密码已提交，可能还需要验证码（步骤 7）');
    }
    return;
  }

  // No password field — OTP flow
  log('步骤 6：未发现密码输入框，可能进入验证码流程或自动跳转。');
  reportComplete(6, { needsOTP: true });
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
  const routeErrorPage = getStep8RouteErrorPageState();
  const state = {
    url: location.href,
    consentPage: isOAuthConsentPage(),
    consentReady: isStep8Ready(),
    verificationPage: isVerificationPageStillVisible(),
    addPhonePage: isAddPhonePageReady(),
    routeError: Boolean(routeErrorPage),
    retryEnabled: Boolean(routeErrorPage?.retryEnabled),
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

async function step8_recoverRouteError(payload = {}) {
  const routeErrorPage = getStep8RouteErrorPageState();
  if (!routeErrorPage) {
    throw new Error('当前页面不是 Step 8 Route Error 错误页，无法执行恢复。URL: ' + location.href);
  }
  if (!routeErrorPage.retryEnabled) {
    throw new Error('Step 8 Route Error 页面上的“重试”按钮不可点击，无法自动恢复。URL: ' + location.href);
  }

  const strategy = payload?.strategy || 'simulateClick';
  switch (strategy) {
    case 'nativeClick':
      routeErrorPage.retryButton.click();
      break;
    case 'simulateClick':
      simulateClick(routeErrorPage.retryButton);
      break;
    default:
      throw new Error(`未知的 Step 8 Route Error 恢复策略：${strategy}`);
  }

  log(`Step 8: route error recovery triggered via ${strategy}.`);
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

  if (isAddPhonePageReady()) {
    throw new Error('当前页面已进入手机号页面，姓名和生日步骤不再适用。请先手动处理手机号，或手动跳过步骤 5。URL: ' + location.href);
  }

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

  // Click "完成帐户创建" button
  await sleep(500);
  clearStep5CreateAccountError();
  const completeBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /完成|create|continue|finish|done|agree/i, 5000).catch(() => null);
  if (!completeBtn) {
    throw new Error('未找到“完成帐户创建”按钮。URL: ' + location.href);
  }

  await setPendingStep5CrossOriginCompletion({ sourceUrl: location.href });
  await humanPause(500, 1300);
  simulateClick(completeBtn);
  log('步骤 5：已点击“完成帐户创建”，正在等待页面结果...');

  const outcome = await waitForStep5SubmitOutcome();
  if (outcome.invalidProfile) {
    await clearPendingStep5CrossOriginCompletion();
    throw new Error(`步骤 5：${outcome.errorText}`);
  }

  await clearPendingStep5CrossOriginCompletion();
  if (outcome.chatgptOnboarding) {
    log('步骤 5：资料已通过，并已进入 ChatGPT onboarding 页面，将直接继续步骤 6。', 'ok');
  } else {
    log('步骤 5：资料已通过。', 'ok');
  }
  reportComplete(5, { addPhonePage: Boolean(outcome.addPhonePage) });
}

setTimeout(() => {
  maybeReportPendingStep5CrossOriginCompletion().catch((error) => {
    console.warn('[MultiPage:signup-page] Failed to resume pending Step 5 cross-origin completion:', error?.message || error);
  });
  maybeHandleStep5PostSignupOverlay().catch((error) => {
    console.warn('[MultiPage:signup-page] Failed to handle Step 5 welcome overlay:', error?.message || error);
  });
}, 0);
