const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports node registry and shared workflow definitions', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/steps\/registry\.js/);
  assert.match(source, /data\/step-definitions\.js/);
  assert.match(source, /background\/workflow-engine\.js/);
  assert.match(source, /MultiPageStepDefinitions\?\.getNodes/);
  assert.match(source, /buildNodeRegistry\(definitions/);
  assert.match(source, /const stepRegistryCache = new Map\(\);/);
  assert.match(source, /const definitions = getNodeDefinitionsForState\(state\);/);
  assert.match(source, /stepRegistryCache\.set\(cacheKey, buildStepRegistry\(definitions\)\)/);
  assert.match(source, /'bind-email': \(state\) => step8Executor\.executeBindEmail\(state\)/);
  assert.match(source, /'fetch-bind-email-code': \(state\) => step8Executor\.executeFetchBindEmailCode\(state\)/);
  assert.match(source, /'relogin-bound-email': \(state\) => executeReloginBoundEmail\(state\)/);
  assert.match(source, /'fetch-bound-email-login-code': \(state\) => step8Executor\.executeBoundEmailLoginCode\(state\)/);
  assert.match(source, /'post-bound-email-phone-verification': \(state\) => step8Executor\.executeBoundEmailPostLoginPhoneVerification\(state\)/);
  assert.match(source, /background\/steps\/create-plus-checkout\.js/);
  assert.match(source, /background\/steps\/fill-plus-checkout\.js/);
  assert.match(source, /background\/steps\/gopay-manual-confirm\.js/);
  assert.match(source, /'gopay-subscription-confirm': \(state\) => goPayManualConfirmExecutor\.executeGoPayManualConfirm\(state\)/);
  assert.match(source, /background\/steps\/paypal-approve\.js/);
  assert.match(source, /background\/steps\/gopay-approve\.js/);
  assert.match(source, /background\/steps\/plus-return-confirm\.js/);
  assert.match(source, /background\/steps\/kiro-device-auth\.js/);
  assert.match(source, /const kiroDeviceAuthExecutor = self\.MultiPageBackgroundKiroDeviceAuth\?\.createKiroDeviceAuthExecutor\(/);
  assert.match(source, /'kiro-start-device-login': \(state\) => kiroDeviceAuthExecutor\.executeKiroStartDeviceLogin\(state\)/);
  assert.match(source, /'kiro-await-device-login': \(state\) => kiroDeviceAuthExecutor\.executeKiroAwaitDeviceLogin\(state\)/);
  assert.match(source, /'kiro-upload-credential': \(state\) => kiroDeviceAuthExecutor\.executeKiroUploadCredential\(state\)/);
  assert.match(source, /'kiro-start-device-login',[\s\S]*'kiro-await-device-login',[\s\S]*'kiro-upload-credential'/);
});

test('GoPay approve executor receives debugger click and manual OTP helpers', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /createGoPayApproveExecutor\(\{[\s\S]*clickWithDebugger[\s\S]*requestGoPayOtpInput[\s\S]*\}\)/);
  assert.match(source, /REQUEST_GOPAY_OTP_INPUT/);
});
