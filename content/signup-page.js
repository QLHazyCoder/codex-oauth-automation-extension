// content/signup-page.js — Content script for OpenAI auth pages (steps 2, 3, 4-receive, 5)
// Injected on: auth0.openai.com, auth.openai.com, accounts.openai.com

console.log('[MultiPage:signup-page] Content script loaded on', location.href);

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type === 'EXECUTE_STEP'
    || message.type === 'FILL_CODE'
    || message.type === 'STEP8_FIND_AND_CLICK'
    || message.type === 'STEP8_GET_STATE'
    || message.type === 'STEP8_TRIGGER_CONTINUE'
    || message.type === 'PREPARE_LOGIN_CODE'
    || message.type === 'PREPARE_SIGNUP_VERIFICATION'
    || message.type === 'RESEND_VERIFICATION_CODE'
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
        case 2: return await step2_clickRegister();
        case 3: return await step3_fillEmailPassword(message.payload);
        case 5: return await step5_fillNameBirthday(message.payload);
        case 6: return await step6_login(message.payload);
        case 8: return await step8_findAndClick();
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

    const passwordInput = document.querySelector('input[type="password"]');
    const switchTrigger = findOneTimeCodeLoginTrigger();

    if (switchTrigger && (switchClickCount === 0 || Date.now() - lastSwitchAttemptAt > 1500)) {
      switchClickCount += 1;
      lastSwitchAttemptAt = Date.now();
      loggedPasswordPage = false;
      log('步骤 7：检测到密码页，正在切换到一次性验证码登录...');
      await humanPause(350, 900);
      simulateClick(switchTrigger);
      await sleep(1200);
      continue;
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
    await prepareLoginCodeFlow();
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
// Step 2: Click Register
// ============================================================

async function step2_clickRegister() {
  log('步骤 2：正在查找注册按钮...');

  let registerBtn = null;
  try {
    registerBtn = await waitForElementByText(
      'a, button, [role="button"], [role="link"]',
      /sign\s*up|register|create\s*account|注册/i,
      10000
    );
  } catch {
    // Some pages may have a direct link
    try {
      registerBtn = await waitForElement('a[href*="signup"], a[href*="register"]', 5000);
    } catch {
      throw new Error(
        '未找到注册按钮。' +
        '请在 DevTools 中检查认证页面 DOM。URL: ' + location.href
      );
    }
  }

  await humanPause(450, 1200);
  reportComplete(2);
  simulateClick(registerBtn);
  log('步骤 2：已点击注册按钮');
}

// ============================================================
// Step 3: Fill Email & Password
// ============================================================

async function step3_fillEmailPassword(payload) {
  const { email } = payload;
  if (!email) throw new Error('未提供邮箱地址，请先在侧边栏粘贴邮箱。');

  log(`步骤 3：正在填写邮箱：${email}`);

  // Find email input
  let emailInput = null;
  try {
    emailInput = await waitForElement(
      'input[type="email"], input[name="email"], input[name="username"], input[id*="email"], input[placeholder*="email"], input[placeholder*="Email"]',
      10000
    );
  } catch {
    throw new Error('在注册页未找到邮箱输入框。URL: ' + location.href);
  }

  await humanPause(500, 1400);
  fillInput(emailInput, email);
  log('步骤 3：邮箱已填写');

  // Check if password field is on the same page
  let passwordInput = document.querySelector('input[type="password"]');

  if (!passwordInput) {
    // Need to submit email first to get to password page
    log('步骤 3：暂未发现密码输入框，先提交邮箱...');
    const submitBtn = document.querySelector('button[type="submit"]')
      || await waitForElementByText('button', /continue|next|submit|继续|下一步/i, 5000).catch(() => null);

    if (submitBtn) {
      await humanPause(400, 1100);
      simulateClick(submitBtn);
      log('步骤 3：邮箱已提交，正在等待密码输入框...');
      await sleep(2000);
    }

    try {
      passwordInput = await waitForElement('input[type="password"]', 10000);
    } catch {
      throw new Error('提交邮箱后仍未找到密码输入框。URL: ' + location.href);
    }
  }

  if (!payload.password) throw new Error('未提供密码，步骤 3 需要可用密码。');
  await humanPause(600, 1500);
  fillInput(passwordInput, payload.password);
  log('步骤 3：密码已填写');

  // Report complete BEFORE submit, because submit causes page navigation
  // which kills the content script connection
  reportComplete(3, { email });

  // Submit the form (page will navigate away after this)
  await sleep(500);
  const submitBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /continue|sign\s*up|submit|注册|创建|create/i, 5000).catch(() => null);

  if (submitBtn) {
    await humanPause(500, 1300);
    simulateClick(submitBtn);
    log('步骤 3：表单已提交');
  }
}

// ============================================================
// Fill Verification Code (used by step 4 and step 7)
// ============================================================

const INVALID_VERIFICATION_CODE_PATTERN = /代码不正确|验证码不正确|验证码错误|code\s+(?:is\s+)?incorrect|invalid\s+code|incorrect\s+code|try\s+again/i;
const VERIFICATION_PAGE_PATTERN = /检查您的收件箱|输入我们刚刚向|重新发送电子邮件|重新发送验证码|验证码|代码不正确|email\s+verification/i;
const OAUTH_CONSENT_PAGE_PATTERN = /使用\s*ChatGPT\s*登录到\s*Codex|login\s+to\s+codex|log\s+in\s+to\s+codex|authorize|授权/i;
const ADD_PHONE_PAGE_PATTERN = /add[\s-]*phone|添加手机号|手机号码|手机号|phone\s+number|telephone/i;
const STEP5_SUBMIT_ERROR_PATTERN = /无法根据该信息创建帐户|请重试|unable\s+to\s+create\s+(?:your\s+)?account|couldn'?t\s+create\s+(?:your\s+)?account|something\s+went\s+wrong|invalid\s+(?:birthday|birth|date)|生日|出生日期/i;
const SIGNUP_PASSWORD_ERROR_TITLE_PATTERN = /糟糕，出错了|something\s+went\s+wrong|oops/i;
const SIGNUP_PASSWORD_ERROR_DETAIL_PATTERN = /operation\s+timed\s+out|timed\s+out|请求超时|操作超时/i;
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
    document.querySelector('input[name="name"], input[autocomplete="name"], input[name="birthday"], input[name="age"], [role="spinbutton"][data-type="year"]')
  );
}

function getPageTextSnapshot() {
  return (document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPrimaryContinueButton() {
  const continueBtn = document.querySelector(
    'button[type="submit"][data-dd-action-name="Continue"], button[type="submit"]._primary_3rdp0_107'
  );
  if (continueBtn && isVisibleElement(continueBtn)) {
    return continueBtn;
  }

  const buttons = document.querySelectorAll('button, [role="button"]');
  return Array.from(buttons).find((el) => isVisibleElement(el) && /继续|Continue/i.test(el.textContent || '')) || null;
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

  return OAUTH_CONSENT_PAGE_PATTERN.test(getPageTextSnapshot());
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

function getSignupRetryButton() {
  const direct = document.querySelector('button[data-dd-action-name="Try again"]');
  if (direct && isVisibleElement(direct) && isActionEnabled(direct)) {
    return direct;
  }

  const candidates = document.querySelectorAll('button, [role="button"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el) || !isActionEnabled(el)) return false;
    const text = getActionText(el);
    return /重试|try\s+again/i.test(text);
  }) || null;
}

function isSignupPasswordErrorPage() {
  if (!isSignupPasswordPage()) return false;
  const text = getPageTextSnapshot();
  return Boolean(
    getSignupRetryButton()
    && (SIGNUP_PASSWORD_ERROR_TITLE_PATTERN.test(text)
      || SIGNUP_PASSWORD_ERROR_DETAIL_PATTERN.test(text)
      || SIGNUP_PASSWORD_ERROR_TITLE_PATTERN.test(document.title || ''))
  );
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
    return {
      state: 'error',
      retryButton: getSignupRetryButton(),
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
    await prepareLoginCodeFlow();
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
  const pageText = getPageTextSnapshot();
  const continueBtn = getPrimaryContinueButton();
  const state = {
    url: location.href,
    consentPage: OAUTH_CONSENT_PAGE_PATTERN.test(pageText),
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
  const completeBtn = document.querySelector('button[type="submit"]')
    || await waitForElementByText('button', /完成|create|continue|finish|done|agree/i, 5000).catch(() => null);
  if (!completeBtn) {
    throw new Error('未找到“完成帐户创建”按钮。URL: ' + location.href);
  }

  await humanPause(500, 1300);
  simulateClick(completeBtn);
  log('步骤 5：已点击“完成帐户创建”，正在等待页面结果...');

  const outcome = await waitForStep5SubmitOutcome();
  if (outcome.invalidProfile) {
    throw new Error(`步骤 5：${outcome.errorText}`);
  }

  log(`步骤 5：资料已通过。`, 'ok');
  reportComplete(5, { addPhonePage: Boolean(outcome.addPhonePage) });
}
