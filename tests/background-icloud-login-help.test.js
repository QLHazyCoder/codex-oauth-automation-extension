const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('icloud login helper distinguishes auth-required errors from transient context errors', () => {
  const source = fs.readFileSync('background.js', 'utf8');

  assert.match(
    source,
    /function isIcloudLoginRequiredError\(error\) \{[\s\S]*status \(401\|403\)[\s\S]*status \(409\|421\|429\|5\\d\\d\)[\s\S]*return false;/m,
    'login-required detection should only force login for auth failures and ignore transient 421/429/5xx statuses'
  );

  assert.match(
    source,
    /function isIcloudTransientContextError\(error\) \{[\s\S]*status \(409\|421\|429\|5\\d\\d\)[\s\S]*timeout[\s\S]*timed out/m,
    'transient context detection should treat 421/429/5xx and timeout-like network errors as retryable context failures'
  );

  assert.match(
    source,
    /if \(isIcloudTransientContextError\(err\)\) \{[\s\S]*iCloud 别名加载受网络\/上下文波动影响，请稍后重试。/m,
    'withIcloudLoginHelp should surface transient-context copy instead of forcing login prompt'
  );

  assert.match(
    source,
    /ICLOUD_TRANSIENT_RETRY_MAX_ATTEMPTS = 2/,
    'icloud transient context handling should retry at least once before failing'
  );

  assert.match(
    source,
    /function getIcloudAliasCacheFromState\(state, options = \{\}\)/,
    'icloud alias flow should expose cache lookup helper for transient fallback'
  );

  assert.match(
    source,
    /已回退最近缓存（\$\{cachedAliases\.length\} 条）/,
    'icloud alias listing should fallback to cached aliases when transient context errors occur'
  );
});
