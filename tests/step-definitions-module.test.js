const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step definitions module exposes ordered normal and Plus step metadata', () => {
  const source = fs.readFileSync('data/step-definitions.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageStepDefinitions;`)(globalScope);
  const steps = api.getSteps();
  const plusSteps = api.getSteps({ plusModeEnabled: true });

  assert.equal(Array.isArray(steps), true);
  assert.equal(steps.length, 10);
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
      'clear-login-cookies',
      'oauth-login',
      'fetch-login-code',
      'confirm-oauth',
      'platform-verify',
    ]
  );
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
      'confirm-oauth',
      'platform-verify',
    ]
  );
  assert.equal(plusSteps.some((step) => step.key === 'clear-login-cookies'), false);
  assert.equal(plusSteps.some((step) => step.key === 'fetch-login-code'), true);
  assert.deepStrictEqual(api.getStepIds({ plusModeEnabled: true }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(api.getLastStepId({ plusModeEnabled: true }), 13);
});

test('sidepanel html loads shared step definitions before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const definitionsIndex = html.indexOf('<script src="../data/step-definitions.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(definitionsIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(definitionsIndex < sidepanelIndex);
});

test('sidepanel html exposes Plus mode and PayPal settings', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="input-plus-mode-enabled"/);
  assert.match(html, /id="select-paypal-account"/);
  assert.match(html, /id="btn-add-paypal-account"/);
  assert.match(html, /id="shared-form-modal"/);
});
