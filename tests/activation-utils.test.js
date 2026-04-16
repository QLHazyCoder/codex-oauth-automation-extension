const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getActivationStrategy,
  isRecoverableStep9AuthFailure,
} = require('../content/activation-utils.js');

test('getActivationStrategy prefers requestSubmit for submit buttons inside forms', () => {
  assert.deepEqual(
    getActivationStrategy({
      tagName: 'button',
      type: 'submit',
      hasForm: true,
      pathname: '/email-verification',
    }),
    { method: 'requestSubmit' }
  );
});

test('getActivationStrategy uses native click for non-submit actions', () => {
  assert.deepEqual(
    getActivationStrategy({
      tagName: 'button',
      type: 'button',
      hasForm: true,
    }),
    { method: 'click' }
  );

  assert.deepEqual(
    getActivationStrategy({
      tagName: 'a',
      type: '',
      hasForm: false,
    }),
    { method: 'click' }
  );
});

test('getActivationStrategy only uses requestSubmit on email verification routes', () => {
  assert.deepEqual(
    getActivationStrategy({
      tagName: 'button',
      type: 'submit',
      hasForm: true,
      pathname: '/u/signup/details',
    }),
    { method: 'click' }
  );

  assert.deepEqual(
    getActivationStrategy({
      tagName: 'button',
      type: 'submit',
      hasForm: true,
      pathname: '/email-verification',
    }),
    { method: 'requestSubmit' }
  );
});

test('isRecoverableStep9AuthFailure matches timeout and CPA auth failure statuses', () => {
  assert.equal(
    isRecoverableStep9AuthFailure('认证失败: Timeout waiting for OAuth callback'),
    true
  );

  assert.equal(
    isRecoverableStep9AuthFailure('认证失败: Request failed with status code 502'),
    true
  );

  assert.equal(
    isRecoverableStep9AuthFailure('认证失败: timeout of 30000ms exceeded'),
    true
  );

  assert.equal(
    isRecoverableStep9AuthFailure('回调 URL 提交失败: oauth flow is not pending'),
    true
  );

  assert.equal(
    isRecoverableStep9AuthFailure('认证成功！'),
    false
  );

  assert.equal(
    isRecoverableStep9AuthFailure('等待中'),
    false
  );
});
