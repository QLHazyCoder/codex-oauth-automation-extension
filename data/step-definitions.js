(function attachStepDefinitions(root, factory) {
  root.MultiPageStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createStepDefinitionsModule() {
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
    { id: 7, order: 70, key: 'plus-checkout-billing', title: '填写账单并提交订阅' },
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
    { id: 7, order: 70, key: 'plus-checkout-billing', title: '填写 GoPay 账单并提交订阅' },
    { id: 8, order: 80, key: 'paypal-approve', title: 'GoPay 手机验证与授权' },
    { id: 9, order: 90, key: 'plus-checkout-return', title: '订阅回跳确认' },
    { id: 10, order: 100, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 11, order: 110, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 12, order: 120, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 13, order: 130, key: 'platform-verify', title: '平台回调验证' },
  ];

  function isPlusModeEnabled(options = {}) {
    return Boolean(options?.plusModeEnabled || options?.plusMode);
  }

  function normalizePlusPaymentMethod(value = '') {
    return String(value || '').trim().toLowerCase() === PLUS_PAYMENT_METHOD_GOPAY
      ? PLUS_PAYMENT_METHOD_GOPAY
      : 'paypal';
  }

  function getPlusPaymentStepTitle(options = {}) {
    return normalizePlusPaymentMethod(options?.plusPaymentMethod) === PLUS_PAYMENT_METHOD_GOPAY
      ? 'GoPay 手机验证与授权'
      : 'PayPal 登录与授权';
  }

  function getModeStepDefinitions(options = {}) {
    if (!isPlusModeEnabled(options)) {
      return NORMAL_STEP_DEFINITIONS;
    }
    return normalizePlusPaymentMethod(options?.plusPaymentMethod || options?.paymentMethod) === 'gopay'
      ? PLUS_GOPAY_STEP_DEFINITIONS
      : PLUS_PAYPAL_STEP_DEFINITIONS;
  }

  function cloneSteps(steps = [], options = {}) {
    const plusModeEnabled = isPlusModeEnabled(options);
    return steps.map((step) => ({
      ...step,
      title: plusModeEnabled && step.key === PLUS_PAYMENT_STEP_KEY
        ? getPlusPaymentStepTitle(options)
        : step.title,
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

  function getPlusPaymentStepTitle(options = {}) {
    if (!isPlusModeEnabled(options)) {
      return '';
    }
    const paymentStep = getModeStepDefinitions({
      ...options,
      plusModeEnabled: true,
    }).find((step) => step.key === 'paypal-approve');
    return paymentStep?.title || '';
  }

  return {
    STEP_DEFINITIONS: NORMAL_STEP_DEFINITIONS,
    NORMAL_STEP_DEFINITIONS,
    PLUS_STEP_DEFINITIONS: PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_PAYPAL_STEP_DEFINITIONS,
    PLUS_GOPAY_STEP_DEFINITIONS,
    getAllSteps,
    getLastStepId,
    getPlusPaymentStepTitle,
    getStepById,
    getStepIds,
    getSteps,
    isPlusModeEnabled,
    normalizePlusPaymentMethod,
  };
});
