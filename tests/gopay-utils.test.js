const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadGoPayUtils() {
  const source = fs.readFileSync('gopay-utils.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.GoPayUtils;`)(globalScope);
}

test('GoPay utils normalize manual OTP input', () => {
  const api = loadGoPayUtils();
  assert.equal(api.normalizeGoPayOtp(' 12-34 56 '), '123456');
  assert.equal(api.normalizeGoPayOtp('abc'), '');
});
