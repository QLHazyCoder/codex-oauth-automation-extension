// 回归：当上一轮 cookie 残留 / step 3 用错按钮提交，OpenAI 会把页面卡在
// /email-verification 上、Remix 报 Route Error (405 Method Not Allowed)。
// 截图中错误页含「糟糕，出错了！」标题、Route Error 文案、和「重试」按钮。
// step 4 应该把它识别为 state:'error'+retryButton+routeError:true，让现有
// prepareSignupVerificationFlow 的 error 分支自动点击重试，而不是当成 unknown
// 苦等 5 轮 ×15s 后回退到 step 2。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for ${name}`);

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return source.slice(start, end);
}

function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = source.match(re);
  if (!m) throw new Error(`missing const ${name}`);
  return `const ${name} = ${m[1]};`;
}

// scenario:
//   'route_error_405'      — /email-verification + 标题「糟糕，出错了」 + Route Error 文案 + 重试按钮（启用）
//   'route_error_no_retry' — /email-verification + 错误文案 + 但找不到「重试」按钮
//   'route_error_no_text'  — /email-verification + 重试按钮 + 但页面文案不含 405/Route Error 标识
//   'wrong_path'           — 不在 /email-verification 路径上
//   'create_account_path'  — /create-account/password（password 超时报错，旧分支）
function buildApi(scenario) {
  const retryButton = { tagName: 'BUTTON', _disabled: false };
  const passwordRetryButton = { tagName: 'BUTTON', _disabled: false };

  return new Function('scenario', 'retryButton', 'passwordRetryButton', `
${extractConst('AUTH_TIMEOUT_ERROR_TITLE_PATTERN')}
${extractConst('AUTH_TIMEOUT_ERROR_DETAIL_PATTERN')}
${extractConst('EMAIL_VERIFICATION_ROUTE_ERROR_DETAIL_PATTERN')}

const pages = {
  route_error_405: {
    pathname: '/email-verification',
    href: 'https://auth.openai.com/email-verification',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ Route Error (405 Method Not Allowed): "Error: You made a POST request to \\"/email-verification\\" but did not provide an \`action\` for route \\"EMAIL_VERIFICATION\\", so there is no way to handle the request." 重试 使用条款 隐私政策',
    retry: retryButton,
  },
  route_error_no_retry: {
    pathname: '/email-verification',
    href: 'https://auth.openai.com/email-verification',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ Route Error (405 Method Not Allowed) ...',
    retry: null,
  },
  route_error_no_text: {
    pathname: '/email-verification',
    href: 'https://auth.openai.com/email-verification',
    title: '检查您的收件箱',
    text: '检查您的收件箱 重试',
    retry: retryButton,
  },
  wrong_path: {
    pathname: '/log-in',
    href: 'https://auth.openai.com/log-in',
    title: '糟糕，出错了！',
    text: 'Route Error (405) ...',
    retry: retryButton,
  },
  create_account_path: {
    pathname: '/create-account/password',
    href: 'https://auth.openai.com/create-account/password',
    title: '糟糕，出错了！',
    text: '糟糕，出错了 operation timed out',
    retry: passwordRetryButton,
  },
};
const page = pages[scenario];

const location = {
  get pathname() { return page.pathname; },
  get href() { return page.href; },
};
const document = {
  get title() { return page.title; },
};

function getPageTextSnapshot() { return page.text; }
function getAuthRetryButton() { return page.retry; }
function isActionEnabled(el) { return Boolean(el) && !el._disabled; }
function isVisibleElement() { return true; }

// 这两个不用测，但 inspectSignupVerificationState 会调到 — 给空实现避免引用错误
function isAddPhonePageReady() { return false; }
function isStep5Ready() { return false; }
function isVerificationPageStillVisible() { return false; }
function isSignupEmailAlreadyExistsPage() { return false; }
function getSignupPasswordInput() { return null; }
function getSignupPasswordSubmitButton() { return null; }
function getVerificationCodeTarget() { return null; }
function findResendVerificationCodeTrigger() { return null; }

${extractFunction('getAuthTimeoutErrorPageState')}
${extractFunction('getSignupPasswordTimeoutErrorPageState')}
${extractFunction('isSignupPasswordErrorPage')}
${extractFunction('getEmailVerificationRouteErrorPageState')}
${extractFunction('isEmailVerificationRouteErrorPage')}
${extractFunction('inspectSignupVerificationState')}

return {
  getEmailVerificationRouteErrorPageState,
  isEmailVerificationRouteErrorPage,
  inspectSignupVerificationState,
  retryButton,
  passwordRetryButton,
};
`)(scenario, retryButton, passwordRetryButton);
}

test('T1: 完整 405 错误页（路径 + 文案 + 重试按钮）应被识别', () => {
  const api = buildApi('route_error_405');
  const state = api.getEmailVerificationRouteErrorPageState();
  assert.ok(state, '应返回非空 state');
  assert.strictEqual(state.path, '/email-verification', '路径正确');
  assert.strictEqual(state.retryButton, api.retryButton, '回传重试按钮');
  assert.strictEqual(state.retryEnabled, true, '按钮应可点击');
  assert.strictEqual(state.titleMatched, true, '标题命中');
  assert.strictEqual(state.routeErrorMatched, true, 'Route Error 文案命中');
});

test('T2: 路径正确但找不到「重试」按钮 → 不识别', () => {
  const api = buildApi('route_error_no_retry');
  assert.strictEqual(api.getEmailVerificationRouteErrorPageState(), null);
  assert.strictEqual(api.isEmailVerificationRouteErrorPage(), false);
});

test('T3: 路径与重试按钮都有，但文案不像 405 → 不识别', () => {
  const api = buildApi('route_error_no_text');
  assert.strictEqual(
    api.getEmailVerificationRouteErrorPageState(),
    null,
    '只能匹配标题/Route Error 文案的页面才算 405，避免把正常 OTP 页（如有「重试」入口）误识别',
  );
});

test('T4: 不在 /email-verification 路径上 → 不识别', () => {
  const api = buildApi('wrong_path');
  assert.strictEqual(
    api.getEmailVerificationRouteErrorPageState(),
    null,
    '/log-in 上的 405 走 getLoginTimeoutErrorPageState 分支，不归本函数管',
  );
});

test('T5: inspectSignupVerificationState 在 405 页上返回 error+retryButton+routeError:true', () => {
  const api = buildApi('route_error_405');
  const snapshot = api.inspectSignupVerificationState();
  assert.strictEqual(snapshot.state, 'error', 'state 应为 error，让 prepareSignupVerificationFlow 自动接手');
  assert.strictEqual(snapshot.retryButton, api.retryButton, '应回传重试按钮');
  assert.strictEqual(snapshot.routeError, true, '应带 routeError:true 让日志能区分 405 和密码页超时');
});

test('T6: inspectSignupVerificationState 对密码页 (旧分支) 不带 routeError:true', () => {
  const api = buildApi('create_account_path');
  const snapshot = api.inspectSignupVerificationState();
  assert.strictEqual(snapshot.state, 'error', '密码页超时仍走 error 分支');
  assert.strictEqual(snapshot.retryButton, api.passwordRetryButton);
  assert.notStrictEqual(snapshot.routeError, true, '密码页超时不应被标记为 routeError，避免日志误导');
});
