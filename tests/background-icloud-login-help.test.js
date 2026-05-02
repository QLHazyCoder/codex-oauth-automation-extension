const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('icloud login helper distinguishes auth-required errors from transient context errors', () => {
  const source = fs.readFileSync('background.js', 'utf8');

  assert.match(
    source,
    /function isIcloudLoginRequiredError\(error\) \{[\s\S]*hasAuthStatus401[\s\S]*status \(409\|421\|429\|5\\d\\d\)[\s\S]*could not validate icloud session[\s\S]*return false;/m,
    'login-required detection should only force login for auth failures and ignore transient 421/429/5xx statuses'
  );

  assert.match(
    source,
    /function isIcloudTransientContextError\(error\) \{[\s\S]*status \(401\|403\|409\|421\|429\|5\\d\\d\)[\s\S]*timeout[\s\S]*timed out/m,
    'transient context detection should treat 421/429/5xx and timeout-like network errors as retryable context failures'
  );

  assert.match(
    source,
    /if \(isIcloudTransientContextError\(err\)\) \{[\s\S]*safeActionLabel[\s\S]*iCloud：\$\{safeActionLabel\}受网络\/上下文波动影响，请稍后重试。/m,
    'withIcloudLoginHelp should surface action-scoped transient-context copy instead of forcing login prompt'
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
    /已回退最近缓存（\$\{[a-zA-Z0-9_]+\.length\} 条）/,
    'icloud alias listing should fallback to cached aliases when transient context errors occur'
  );

  assert.match(
    source,
    /PERSISTENT_ALIAS_STATE_KEYS = \[[\s\S]*'icloudAliasCache'[\s\S]*'icloudAliasCacheAt'[\s\S]*\]/m,
    'icloud alias cache should be persisted so transient fallback can survive restarts'
  );

  assert.match(
    source,
    /function shouldStopIcloudAutoFetchRetries\(error\) \{[\s\S]*网络\/上下文波动[\s\S]*status 421/m,
    'icloud auto-fetch retry guard should stop repeated retries for transient session/context failures'
  );

  assert.match(
    source,
    /async function validateIcloudSessionViaPageContext\(tabId, setupUrl\) \{[\s\S]*world:\s*'MAIN'[\s\S]*\/validate/m,
    'icloud service resolution should support page-context validate fallback when background validate keeps failing'
  );

  assert.match(
    source,
    /function isIcloudApiUrl\(url = ''\) \{[\s\S]*new URL\(rawUrl\)[\s\S]*hostname\.endsWith\('\.icloud\.com'\)[\s\S]*hostname\.endsWith\('\.icloud\.com\.cn'\)/m,
    'icloud api url detection should match icloud subdomains so maildomainws hosts can trigger page-context fallback'
  );

  assert.match(
    source,
    /function appendIcloudClientQueryParams\(rawUrl = ''\) \{[\s\S]*clientBuildNumber[\s\S]*clientMasteringNumber[\s\S]*clientId[\s\S]*dsid/m,
    'icloud maildomainws requests should include compatible client query params before sending requests'
  );

  assert.match(
    source,
    /function isIcloudMailPageUrl\(rawUrl = ''\) \{[\s\S]*pathname === '\/mail'[\s\S]*pathname\.startsWith\('\/mail\/'\)/m,
    'icloud page-context fallback should be able to identify mail pages as preferred execution context'
  );

  assert.match(
    source,
    /async function waitForIcloudMailTabReady\(tabId, timeoutMs = 8000\) \{[\s\S]*status === 'complete'/m,
    'icloud page-context fallback should wait for a created mail tab to finish loading before using it'
  );

  assert.match(
    source,
    /async function icloudRequestViaPageContext\(method, url, options = \{\}\) \{[\s\S]*ensureIcloudMailContextTab\([\s\S]*isIcloudMailPageUrl\(tab\?\.url\) \? 8 : 0[\s\S]*const mailTabs = sortedTabs\.filter/m,
    'icloud page-context requests should ensure a mail-context tab exists and prioritize it before other icloud pages'
  );

  assert.match(
    source,
    /async function fetchIcloudHideMyEmail\(options = \{\}\) \{[\s\S]*const existingAliases = await listIcloudAliases\(\);/m,
    'icloud auto-fetch should load aliases through listIcloudAliases so transient cache/local fallback applies before creation'
  );

  assert.match(
    source,
    /保留别名返回鉴权\/网络异常，正在回查别名列表确认是否已创建[\s\S]*保留请求异常，但已在列表确认别名/m,
    'icloud auto-fetch should attempt list-confirmation recovery when reserve returns auth/network errors'
  );

  assert.match(
    source,
    /当前网络\/上下文波动，暂无法创建新别名，已临时回退复用/,
    'icloud auto-fetch should fallback to reusable aliases when create-new fails due transient session/context issues'
  );
});
