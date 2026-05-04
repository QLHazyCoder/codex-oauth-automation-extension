(function attachStepDefinitions(root, factory) {
  root.MultiPageStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createStepDefinitionsModule() {
  const PLUS_PAYMENT_METHOD_PAYPAL = 'paypal';
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';
  const PLUS_PAYMENT_METHOD_GPC_HELPER = 'gpc-helper';
  const PLUS_PAYMENT_STEP_KEY = 'paypal-approve';
  const SIGNUP_METHOD_EMAIL = 'email';
  const SIGNUP_METHOD_PHONE = 'phone';

  const NORMAL_STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续' },
    { id: 4, order: 40, key: 'fetch-signup-code', title: '获取注册验证码' },
    { id: 5, order: 50, key: 'fill-profile', title: '填写姓名和生日' },
    { id: 6, order: 60, key: 'clear-login-cookies', title: '清理登录 Cookies' },
    { id: 7, order: 70, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 8, order: 80, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 9, order: 90, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 10, order: 100, key: 'platform-verify', title: '平台回调验证' },
  ];

  const PLUS_PAYPAL_STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续' },
    { id: 4, order: 40, key: 'fetch-signup-code', title: '获取注册验证码' },
    { id: 5, order: 50, key: 'fill-profile', title: '填写姓名和生日' },
    { id: 6, order: 60, key: 'plus-checkout-create', title: '创建 Plus Checkout' },
    { id: 7, order: 70, key: 'plus-checkout-billing', title: '填写账单并提交订单' },
    { id: 8, order: 80, key: 'paypal-approve', title: 'PayPal 登录与授权' },
    { id: 9, order: 90, key: 'plus-checkout-return', title: '订阅回跳确认' },
    { id: 10, order: 100, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 11, order: 110, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 12, order: 120, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 13, order: 130, key: 'platform-verify', title: '平台回调验证' },
  ];

  const PLUS_GOPAY_STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续' },
    { id: 4, order: 40, key: 'fetch-signup-code', title: '获取注册验证码' },
    { id: 5, order: 50, key: 'fill-profile', title: '填写姓名和生日' },
    { id: 6, order: 60, key: 'plus-checkout-create', title: '打开 GoPay 订阅页' },
    { id: 7, order: 70, key: 'gopay-subscription-confirm', title: '等待 GoPay 订阅确认' },
    { id: 10, order: 100, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 11, order: 110, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 12, order: 120, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 13, order: 130, key: 'platform-verify', title: '平台回调验证' },
  ];

  const PLUS_GPC_STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续' },
    { id: 4, order: 40, key: 'fetch-signup-code', title: '获取注册验证码' },
    { id: 5, order: 50, key: 'fill-profile', title: '填写姓名和生日' },
    { id: 6, order: 60, key: 'plus-checkout-create', title: '创建 GPC 订单' },
    { id: 7, order: 70, key: 'plus-checkout-billing', title: 'GPC OTP/PIN 验证' },
    { id: 10, order: 100, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 11, order: 110, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 12, order: 120, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 13, order: 130, key: 'platform-verify', title: '平台回调验证' },
  ];

  const PHONE_SIGNUP_TITLE_OVERRIDES = Object.freeze({
    'submit-signup-email': '注册并输入手机号',
    'fetch-signup-code': '获取手机验证码',
  });

  function isPlusModeEnabled(options = {}) {
    return Boolean(options?.plusModeEnabled || options?.plusMode);
  }

  function normalizePlusPaymentMethod(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === PLUS_PAYMENT_METHOD_GPC_HELPER) {
      return PLUS_PAYMENT_METHOD_GPC_HELPER;
    }
    return normalized === PLUS_PAYMENT_METHOD_GOPAY ? PLUS_PAYMENT_METHOD_GOPAY : PLUS_PAYMENT_METHOD_PAYPAL;
  }

  function normalizeSignupMethod(value = '') {
    return String(value || '').trim().toLowerCase() === SIGNUP_METHOD_PHONE
      ? SIGNUP_METHOD_PHONE
      : SIGNUP_METHOD_EMAIL;
  }

  function getResolvedSignupMethod(options = {}) {
    return normalizeSignupMethod(options?.resolvedSignupMethod || options?.signupMethod);
  }

  function getModeStepDefinitions(options = {}) {
    if (!isPlusModeEnabled(options)) {
      return NORMAL_STEP_DEFINITIONS;
    }
    const paymentMethod = normalizePlusPaymentMethod(options?.plusPaymentMethod || options?.paymentMethod);
    if (paymentMethod === PLUS_PAYMENT_METHOD_GPC_HELPER) {
      return PLUS_GPC_STEP_DEFINITIONS;
    }
    return paymentMethod === PLUS_PAYMENT_METHOD_GOPAY ? PLUS_GOPAY_STEP_DEFINITIONS : PLUS_PAYPAL_STEP_DEFINITIONS;
  }

  function getPlusPaymentStepTitle(options = {}) {
    if (!isPlusModeEnabled(options)) {
      return '';
    }
    const paymentStep = getModeStepDefinitions({
      ...options,
      plusModeEnabled: true,
    }).find((step) => step.key === PLUS_PAYMENT_STEP_KEY);
    return paymentStep?.title || '';
  }

  function getResolvedStepTitle(step = {}, options = {}) {
    if (isPlusModeEnabled(options) && step.key === PLUS_PAYMENT_STEP_KEY) {
      return getPlusPaymentStepTitle(options) || step.title;
    }
    const signupMethod = getResolvedSignupMethod(options);
    if (signupMethod === SIGNUP_METHOD_PHONE && PHONE_SIGNUP_TITLE_OVERRIDES[step.key]) {
      return PHONE_SIGNUP_TITLE_OVERRIDES[step.key];
    }
    return step.title;
  }

  function cloneSteps(steps = [], options = {}) {
    return steps.map((step) => ({
      ...step,
      title: getResolvedStepTitle(step, options),
    }));
  }

  function getSteps(options = {}) {
    return cloneSteps(getModeStepDefinitions(options), options);
  }

  function getAllSteps() {
    const keyed = new Map();
    for (const step of [
      ...NORMAL_STEP_DEFINITIONS,
      ...PLUS_PAYPAL_STEP_DEFINITIONS,
      ...PLUS_GOPAY_STEP_DEFINITIONS,
      ...PLUS_GPC_STEP_DEFINITIONS,
    ]) {
      keyed.set(`${step.id}:${step.key}`, step);
    }
    return cloneSteps(Array.from(keyed.values()).sort((left, right) => {
      const leftOrder = Number.isFinite(left.order) ? left.order : left.id;
      const rightOrder = Number.isFinite(right.order) ? right.order : right.id;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.id - right.id;
    }));
  }

  function getStepIds(options = {}) {
    return getModeStepDefinitions(options)
      .map((step) => Number(step.id))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
  }

  function getLastStepId(options = {}) {
    const ids = getStepIds(options);
    return ids[ids.length - 1] || 0;
  }

  function getStepById(id, options = {}) {
    const numericId = Number(id);
    const match = getModeStepDefinitions(options).find((step) => step.id === numericId);
    return match ? cloneSteps([match], options)[0] : null;
  }

  return {
    STEP_DEFINITIONS: NORMAL_STEP_DEFINITIONS,
    NORMAL_STEP_DEFINITIONS,
    PLUS_STEP_DEFINITIONS: PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_GOPAY_STEP_DEFINITIONS,
    PLUS_GPC_STEP_DEFINITIONS,
    SIGNUP_METHOD_EMAIL,
    SIGNUP_METHOD_PHONE,
    getAllSteps,
    getLastStepId,
    getPlusPaymentStepTitle,
    getStepById,
    getStepIds,
    getSteps,
    isPlusModeEnabled,
    normalizePlusPaymentMethod,
    normalizeSignupMethod,
  };
});
