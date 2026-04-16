(function attachStepDefinitions(root, factory) {
  root.MultiPageStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createStepDefinitionsModule() {
  const STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续' },
    { id: 4, order: 40, key: 'fetch-signup-code', title: '获取注册验证码' },
    { id: 5, order: 50, key: 'fill-profile', title: '填写姓名和生日' },
    { id: 6, order: 60, key: 'oauth-login', title: '刷新 OAuth 并登录' },
    { id: 7, order: 70, key: 'fetch-login-code', title: '获取登录验证码' },
    { id: 8, order: 80, key: 'confirm-oauth', title: '自动确认 OAuth' },
    { id: 9, order: 90, key: 'platform-verify', title: '平台回调验证' },
  ];

  function getSteps() {
    return STEP_DEFINITIONS.map((step) => ({ ...step }));
  }

  function getStepById(id) {
    const numericId = Number(id);
    const match = STEP_DEFINITIONS.find((step) => step.id === numericId);
    return match ? { ...match } : null;
  }

  return {
    STEP_DEFINITIONS,
    getStepById,
    getSteps,
  };
});
