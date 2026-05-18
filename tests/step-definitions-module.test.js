const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step definitions module exposes ordered normal and Plus step metadata', () => {
  const source = fs.readFileSync('data/step-definitions.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageStepDefinitions;`)(globalScope);
  const steps = api.getSteps();
  const phoneSteps = api.getSteps({ signupMethod: 'phone' });
  const phoneReloginSteps = api.getSteps({
    signupMethod: 'phone',
    phoneSignupReloginAfterBindEmailEnabled: true,
  });
  const plusSteps = api.getSteps({ plusModeEnabled: true });
  const plusPhoneSteps = api.getSteps({ plusModeEnabled: true, signupMethod: 'phone' });
  const plusPhoneReloginSteps = api.getSteps({
    plusModeEnabled: true,
    signupMethod: 'phone',
    phoneSignupReloginAfterBindEmailEnabled: true,
  });
  const goPaySteps = api.getSteps({ plusModeEnabled: true, plusPaymentMethod: 'gopay' });
  const gpcSteps = api.getSteps({ plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' });
  const kiroSteps = api.getSteps({ activeFlowId: 'kiro' });

  assert.equal(Array.isArray(steps), true);
  assert.equal(steps.length, 11);
  assert.equal(steps.every((step) => step.flowId === 'openai'), true);
  assert.deepStrictEqual(
    steps.map((step) => step.order),
    steps.map((step) => step.order).slice().sort((left, right) => left - right)
  );
  assert.deepStrictEqual(
    steps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'wait-registration-success',
      'oauth-login',
      'fetch-login-code',
      'post-login-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(steps[0].title, '打开 ChatGPT 官网');
  assert.equal(steps[5].title, '等待注册成功');
  assert.equal(phoneSteps[1].title, '注册并输入手机号');
  assert.equal(phoneSteps[3].title, '获取手机验证码');
  assert.deepStrictEqual(
    phoneSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'wait-registration-success',
      'oauth-login',
      'fetch-login-code',
      'bind-email',
      'fetch-bind-email-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.deepStrictEqual(
    phoneReloginSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'wait-registration-success',
      'oauth-login',
      'fetch-login-code',
      'bind-email',
      'fetch-bind-email-code',
      'relogin-bound-email',
      'fetch-bound-email-login-code',
      'post-bound-email-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(phoneReloginSteps.find((step) => step.key === 'relogin-bound-email')?.title, '绑定邮箱后刷新 OAuth 并登录（邮箱）');
  assert.equal(phoneReloginSteps.find((step) => step.key === 'fetch-bind-email-code')?.title, '获取绑定邮箱验证码');

  assert.deepStrictEqual(
    plusSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'plus-checkout-create',
      'plus-checkout-billing',
      'paypal-approve',
      'plus-checkout-return',
      'oauth-login',
      'fetch-login-code',
      'post-login-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(plusSteps.some((step) => step.key === 'wait-registration-success'), false);
  assert.equal(plusSteps.some((step) => step.key === 'fetch-login-code'), true);
  assert.equal(plusSteps.find((step) => step.key === 'paypal-approve')?.title, 'PayPal 登录与授权');
  assert.equal(plusPhoneSteps[1].title, '注册并输入手机号');
  assert.equal(plusPhoneSteps[3].title, '获取手机验证码');
  assert.deepStrictEqual(
    plusPhoneSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'plus-checkout-create',
      'plus-checkout-billing',
      'paypal-approve',
      'plus-checkout-return',
      'oauth-login',
      'fetch-login-code',
      'bind-email',
      'fetch-bind-email-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.deepStrictEqual(
    plusPhoneReloginSteps.map((step) => step.key).slice(-9),
    [
      'oauth-login',
      'fetch-login-code',
      'bind-email',
      'fetch-bind-email-code',
      'relogin-bound-email',
      'fetch-bound-email-login-code',
      'post-bound-email-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(goPaySteps.some((step) => step.key === 'paypal-approve'), false);
  assert.equal(api.getStepById(8, { plusModeEnabled: true, plusPaymentMethod: 'gopay' }), null);
  assert.equal(api.getPlusPaymentStepTitle({ plusModeEnabled: true, plusPaymentMethod: 'gopay' }), '');
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true }), 14);
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true, signupMethod: 'phone' }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true, signupMethod: 'phone' }), 15);
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true, signupMethod: 'phone', phoneSignupReloginAfterBindEmailEnabled: true }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true, signupMethod: 'phone', phoneSignupReloginAfterBindEmailEnabled: true }), 18);
  assert.equal(api.hasFlow('openai'), true);
  assert.equal(api.hasFlow('kiro'), true);
  assert.equal(api.hasFlow('site-a'), false);
  assert.deepStrictEqual(api.getRegisteredFlowIds(), ['openai', 'kiro']);
  assert.deepStrictEqual(api.getSteps({ activeFlowId: 'site-a' }), []);
  assert.equal(api.getStepById(2, { activeFlowId: 'site-a' }), null);
  assert.deepStrictEqual(
    kiroSteps.map((step) => step.key),
    [
      'kiro-start-device-login',
      'kiro-await-device-login',
      'kiro-upload-credential',
    ]
  );
  assert.equal(kiroSteps.every((step) => step.flowId === 'kiro'), true);
  assert.equal(kiroSteps[0].driverId, 'background/kiro-device-auth');
  assert.equal(kiroSteps[2].sourceId, 'kiro-rs-admin');
  assert.deepStrictEqual(api.getStepIds({ activeFlowId: 'kiro' }), [1, 2, 3]);
  assert.equal(api.getLastStepId({ activeFlowId: 'kiro' }), 3);
  assert.deepStrictEqual(
    api.getNodes({ activeFlowId: 'kiro' }).map((node) => node.next),
    [['kiro-await-device-login'], ['kiro-upload-credential'], []]
  );
  assert.equal(plusSteps[5].title, '创建 Plus Checkout');
  assert.equal(plusSteps[7].title, 'PayPal 登录与授权');

  assert.deepStrictEqual(
    goPaySteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'plus-checkout-create',
      'gopay-subscription-confirm',
      'oauth-login',
      'fetch-login-code',
      'post-login-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true, plusPaymentMethod: 'gopay' }), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true, plusPaymentMethod: 'gopay' }), 14);
  assert.equal(goPaySteps[5].title, '打开 GoPay 订阅页');
  assert.equal(goPaySteps[6].title, '等待 GoPay 订阅确认');

  assert.deepStrictEqual(
    gpcSteps.map((step) => step.key),
    [
      'open-chatgpt',
      'submit-signup-email',
      'fill-password',
      'fetch-signup-code',
      'fill-profile',
      'plus-checkout-create',
      'plus-checkout-billing',
      'oauth-login',
      'fetch-login-code',
      'post-login-phone-verification',
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' }), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' }), 14);
  assert.equal(gpcSteps[5].title, '创建 GPC 订单');
  assert.equal(gpcSteps[6].title, '等待 GPC 任务完成');
});

test('sidepanel html loads shared step definitions before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const definitionsIndex = html.indexOf('<script src="../data/step-definitions.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(definitionsIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(definitionsIndex < sidepanelIndex);
});

test('sidepanel html exposes Plus mode, PayPal, and GoPay settings', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="input-plus-mode-enabled"/);
  assert.match(html, /id="select-plus-payment-method"/);
  assert.match(html, /id="select-paypal-account"/);
  assert.match(html, /id="btn-add-paypal-account"/);
  assert.match(html, /id="input-gopay-phone"/);
  assert.match(html, /id="input-gopay-otp"/);
  assert.match(html, /id="input-gopay-pin"/);
  assert.match(html, /<option value="gpc-helper">GPC<\/option>/);
  assert.match(html, /id="btn-gpc-card-key-purchase"/);
  assert.match(html, />购买卡密</);
  assert.match(html, /GPC API/);
  assert.match(html, /id="input-gpc-helper-api"/);
  assert.match(html, /id="btn-gpc-helper-convert-api-key"/);
  assert.match(html, />转换 API Key</);
  assert.match(html, /GPC API Key/);
  assert.match(html, /id="input-gpc-helper-card-key"/);
  assert.match(html, /GPC 模式/);
  assert.match(html, /id="select-gpc-helper-phone-mode"/);
  assert.match(html, /<option value="auto">自动模式<\/option>/);
  assert.match(html, /id="btn-gpc-helper-balance"/);
  assert.match(html, /id="input-gpc-helper-phone"/);
  assert.match(html, /id="select-gpc-helper-otp-channel"/);
  assert.match(html, /id="input-gpc-helper-local-sms-enabled"/);
  assert.match(html, /id="input-gpc-helper-local-sms-url"/);
  assert.match(html, /id="input-gpc-helper-pin"/);
  assert.match(html, /id="shared-form-modal"/);
});
