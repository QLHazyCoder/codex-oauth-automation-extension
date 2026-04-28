const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports logging/status module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/logging-status\.js/);
});

test('logging/status module exposes a factory', () => {
  const source = fs.readFileSync('background/logging-status.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundLoggingStatus;`)(globalScope);

  assert.equal(typeof api?.createLoggingStatus, 'function');
});

test('logging/status add-phone detection ignores step 2 phone-entry switch failures', () => {
  const source = fs.readFileSync('background/logging-status.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundLoggingStatus;`)(globalScope);

  const loggingStatus = api.createLoggingStatus({
    chrome: { runtime: { sendMessage() { return Promise.resolve(); } } },
    DEFAULT_STATE: { stepStatuses: {} },
    getState: async () => ({ stepStatuses: {} }),
    isRecoverableStep9AuthFailure: () => false,
    LOG_PREFIX: '[test]',
    setState: async () => {},
    STOP_ERROR_MESSAGE: 'stopped',
  });

  assert.equal(
    loggingStatus.isAddPhoneAuthFailure('Step 2: the signup dialog is still in phone entry mode and has not switched back to email entry. URL: https://chatgpt.com/'),
    false
  );
  assert.equal(
    loggingStatus.isAddPhoneAuthFailure('Step 8: verification submitted but the auth flow entered the phone number page. URL: https://auth.openai.com/add-phone'),
    true
  );
  assert.equal(
    loggingStatus.isAddPhoneAuthFailure('Step 9: auth page entered phone verification page. URL: https://auth.openai.com/phone-verification'),
    true
  );
  assert.equal(
    loggingStatus.isAddPhoneAuthFailure('Timed out waiting for phone verification page.'),
    true
  );
  assert.equal(loggingStatus.getLoginAuthStateLabel('phone_verification_page'), '手机验证码页');
  assert.equal(loggingStatus.getLoginAuthStateLabel('oauth_consent_page'), 'OAuth 授权页');
});
