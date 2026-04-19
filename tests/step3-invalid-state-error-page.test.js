// 回归：step 2 → step 3 跳转期间，OpenAI 偶发把页面换成
// 「糟糕，出错了！/ 验证过程中出错 (invalid_state)」错误页。
// 识别特征：标题「糟糕，出错了」 + 文案含 invalid_state / 验证过程中出错 + 「重试」按钮。
// 期望：step 3 入口自动点「重试」让 OpenAI 重跳，避免白等 10s 再 throw 触发重启。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

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

// 场景取值:
//   'invalid_state'        — 标题「糟糕，出错了」 + 文案含 invalid_state + 重试按钮可点击
//   'invalid_state_cn'     — 中文文案「验证过程中出错」
//   'invalid_state_no_btn' — 文案命中但找不到「重试」按钮
//   'title_only'           — 只有标题命中，没有 invalid_state 文案（例如 405 错误页）
//   'plain_signup'         — 正常注册表单页
//   'invalid_state_disabled' — 重试按钮被禁用
function buildApi(scenario) {
  const retryButton = { tagName: 'BUTTON', _disabled: scenario === 'invalid_state_disabled' };

  return new Function('scenario', 'retryButton', `
${extractConst('AUTH_TIMEOUT_ERROR_TITLE_PATTERN')}
${extractConst('INVALID_STATE_ERROR_DETAIL_PATTERN')}

const pages = {
  invalid_state: {
    pathname: '/create-account',
    href: 'https://auth.openai.com/create-account',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ 验证过程中出错 (invalid_state)。请重试。 重试 使用条款 隐私政策',
    retry: retryButton,
  },
  invalid_state_cn: {
    pathname: '/auth/signup',
    href: 'https://auth.openai.com/auth/signup',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ 验证过程中出错。请重试。 重试',
    retry: retryButton,
  },
  invalid_state_no_btn: {
    pathname: '/create-account',
    href: 'https://auth.openai.com/create-account',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ invalid_state',
    retry: null,
  },
  title_only: {
    pathname: '/email-verification',
    href: 'https://auth.openai.com/email-verification',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ Route Error (405 Method Not Allowed) 重试',
    retry: retryButton,
  },
  plain_signup: {
    pathname: '/create-account',
    href: 'https://auth.openai.com/create-account',
    title: '创建帐户',
    text: '欢迎使用 ChatGPT 请输入电子邮件地址',
    retry: null,
  },
  invalid_state_disabled: {
    pathname: '/create-account',
    href: 'https://auth.openai.com/create-account',
    title: '糟糕，出错了！',
    text: '糟糕，出错了！ 验证过程中出错 (invalid_state)。请重试。 重试',
    retry: retryButton,
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

${extractFunction('getInvalidStateErrorPageState')}
${extractFunction('isInvalidStateErrorPage')}

return {
  getInvalidStateErrorPageState,
  isInvalidStateErrorPage,
  retryButton,
};
`)(scenario, retryButton);
}

test('T1: 英文 invalid_state 错误页应被识别（含 retryButton + retryEnabled）', () => {
  const api = buildApi('invalid_state');
  const state = api.getInvalidStateErrorPageState();
  assert.ok(state, 'T1: 应返回非空 state');
  assert.strictEqual(state.path, '/create-account');
  assert.strictEqual(state.retryButton, api.retryButton);
  assert.strictEqual(state.retryEnabled, true);
  assert.strictEqual(state.titleMatched, true);
  assert.strictEqual(state.detailMatched, true);
});

test('T2: 中文「验证过程中出错」文案也应被识别（即使没有英文 invalid_state 关键字）', () => {
  const api = buildApi('invalid_state_cn');
  assert.ok(
    api.isInvalidStateErrorPage(),
    'T2: 中文 Gmail/中文界面下 OpenAI 返回的错误页也应匹配'
  );
});

test('T3: 找不到「重试」按钮 → 不识别（避免返回无法恢复的 state）', () => {
  const api = buildApi('invalid_state_no_btn');
  assert.strictEqual(api.getInvalidStateErrorPageState(), null);
  assert.strictEqual(api.isInvalidStateErrorPage(), false);
});

test('T4: 只有「糟糕，出错了」标题、没有 invalid_state 文案 → 不识别（避免误判 405 Route Error）', () => {
  const api = buildApi('title_only');
  assert.strictEqual(
    api.getInvalidStateErrorPageState(),
    null,
    'T4: 405 Route Error 页同样有标题 + 重试按钮，本函数必须靠 invalid_state 文案区分，否则会误抢 405 分支的处理',
  );
});

test('T5: 正常注册表单页 → 不识别', () => {
  const api = buildApi('plain_signup');
  assert.strictEqual(api.isInvalidStateErrorPage(), false);
});

test('T6: invalid_state 错误页但重试按钮被禁用 → 仍识别但 retryEnabled=false（调用方决定是否 throw）', () => {
  const api = buildApi('invalid_state_disabled');
  const state = api.getInvalidStateErrorPageState();
  assert.ok(state, 'T6: 禁用态也要识别（否则 retryButton 被禁用会被误当成"没错"）');
  assert.strictEqual(state.retryEnabled, false, 'T6: retryEnabled 应反映按钮禁用状态');
});
