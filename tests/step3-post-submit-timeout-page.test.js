// 回归：step 3 邮箱提交后偶发落到通用「糟糕，出错了！Operation timed out」错误页
// （路径通常是 /log-in-or-create-account，不是 /create-account/password 或 /log-in，
//  因此 getSignupPasswordTimeoutErrorPageState / getLoginTimeoutErrorPageState 的
//  路径约束都不命中，也不是 invalid_state 错误页）。
// 之前 maybeCompleteStep3InlineAfterEmailSubmit 只检查 invalid_state，导致这种
// timeout 错误页被漏检 → 循环跑满 6s → 上层继续当成"未出错"处理 → 密码恢复阶段
// 又被拉回邮箱页 → 再次提交 → 再次 timeout。
// 期望：识别通用 timeout 错误页，自动点「重试」；若 2s 内仍未恢复则抛
// STEP3_INVALID_STATE_RESTART，让 background 触发 step 2 重启。
//
// 同时验证"只有标题命中、没有 Operation timed out 文案"的 detailMatched=false
// 分支不会误触发（避免误吃 invalid_state / 405 Route Error 等共享标题的错误页）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0);
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

// 构造 maybeCompleteStep3InlineAfterEmailSubmit 的最小可运行沙箱。
// 通过脚本对外暴露 setTimeoutPage / setInvalidStatePage / setPasswordInput，
// 让各测试决定在循环的第几次轮询看到什么。
function buildApi() {
  return new Function(`
const events = [];
let timeoutPage = null;
let invalidStatePage = null;
let passwordInput = null;
let nowOffset = 0;

// 把 sleep(2000) 折成立刻 resolve 并推进虚拟时钟，避免真实等待让单测变慢。
async function sleep(ms) {
  events.push({ type: 'sleep', ms });
  nowOffset += Number(ms) || 0;
}

function throwIfStopped() {}
function log(message, level) { events.push({ type: 'log', message, level }); }
function simulateClick(el) { events.push({ type: 'click', target: el && el._label }); }

function getInvalidStateErrorPageState() { return invalidStatePage; }
function isInvalidStateErrorPage() { return Boolean(invalidStatePage); }
function getAuthTimeoutErrorPageState() { return timeoutPage; }

function getSignupPasswordInput() { return passwordInput; }
function findUsePasswordContinueAction() { return null; }
async function maybeContinueWithPassword() { return null; }
async function completeStep3PasswordStage() {
  events.push({ type: 'completePassword' });
}

const location = { href: 'https://auth.openai.com/log-in-or-create-account' };

// Date.now 走虚拟时钟，单测瞬间完成。6s 循环上限会被 sleep 推进迅速触发。
const _realNow = globalThis.Date.now();
const Date = { now() { return _realNow + nowOffset; } };

${extractFunction('maybeCompleteStep3InlineAfterEmailSubmit')}

return {
  maybeCompleteStep3InlineAfterEmailSubmit,
  getEvents() { return events.slice(); },
  setTimeoutPage(page) { timeoutPage = page; },
  setInvalidStatePage(page) { invalidStatePage = page; },
  setPasswordInput(el) { passwordInput = el; },
};
`)();
}

test('T1: timeout 错误页（detailMatched=true + retryEnabled）→ 点「重试」后恢复则循环继续', async () => {
  const api = buildApi();
  const retryBtn = { _label: 'retry' };
  const pwdInput = { _label: 'password' };

  let polled = 0;
  // 第一次进入循环看到 timeout 页；点重试 + sleep(2000) 后 stillTimeout 返回 null；
  // 循环 continue；下一轮轮询看到密码框 → 走 completeStep3PasswordStage 分支。
  const origSetTimeout = api.setTimeoutPage;
  api.setTimeoutPage = (page) => {
    polled += 1;
    origSetTimeout.call(api, page);
  };
  api.setTimeoutPage({
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: retryBtn,
    retryEnabled: true,
    titleMatched: true,
    detailMatched: true,
  });

  // 我们需要在"点重试 + sleep 之后"把 timeoutPage 清掉、同时把 password input 放进来
  // —— 通过改写 sleep 里的副作用做不到（sleep 是沙箱内部的）。
  // 最干净的方式：用一个代理的 getAuthTimeoutErrorPageState 行为：第一次返回 timeout，
  // 第二次（stillTimeout 检查）返回 null。
  // 但沙箱里我们已经做成 "timeoutPage" 单变量，测试无法在 sleep 期间切换。
  // —— 改用"监听 click 事件后立即清除 timeoutPage、注入 password input"的方式。
  const origClick = api.getEvents;
  // Patch: 我们需要一个 hook 让 click 立刻推进状态。
  // 重新构造 api 支持这种 hook：
  const apiWithHook = (function buildHookedApi() {
    return new Function(`
const events = [];
let timeoutPage = null;
let invalidStatePage = null;
let passwordInput = null;
let nowOffset = 0;
let onRetryClicked = null;

async function sleep(ms) {
  events.push({ type: 'sleep', ms });
  nowOffset += Number(ms) || 0;
}

function throwIfStopped() {}
function log(message, level) { events.push({ type: 'log', message, level }); }
function simulateClick(el) {
  events.push({ type: 'click', target: el && el._label });
  if (typeof onRetryClicked === 'function') onRetryClicked();
}

function getInvalidStateErrorPageState() { return invalidStatePage; }
function isInvalidStateErrorPage() { return Boolean(invalidStatePage); }
function getAuthTimeoutErrorPageState() { return timeoutPage; }

function getSignupPasswordInput() { return passwordInput; }
function findUsePasswordContinueAction() { return null; }
async function maybeContinueWithPassword() { return null; }
async function completeStep3PasswordStage() {
  events.push({ type: 'completePassword' });
}

const location = { href: 'https://auth.openai.com/log-in-or-create-account' };
const _realNow = globalThis.Date.now();
const Date = { now() { return _realNow + nowOffset; } };

${extractFunction('maybeCompleteStep3InlineAfterEmailSubmit')}

return {
  maybeCompleteStep3InlineAfterEmailSubmit,
  getEvents() { return events.slice(); },
  setTimeoutPage(page) { timeoutPage = page; },
  setInvalidStatePage(page) { invalidStatePage = page; },
  setPasswordInput(el) { passwordInput = el; },
  onRetry(fn) { onRetryClicked = fn; },
};
`)();
  })();

  apiWithHook.setTimeoutPage({
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: retryBtn,
    retryEnabled: true,
    titleMatched: true,
    detailMatched: true,
  });
  // 点下重试后 → 页面恢复：清 timeoutPage，注入密码框供下一轮循环命中
  apiWithHook.onRetry(() => {
    apiWithHook.setTimeoutPage(null);
    apiWithHook.setPasswordInput(pwdInput);
  });

  const result = await apiWithHook.maybeCompleteStep3InlineAfterEmailSubmit({
    email: 'cat@example.com',
    password: 'pw',
    timeoutMs: 6000,
  });

  assert.deepStrictEqual(result, { completedInline: true, surface: 'password' }, 'T1: 重试后看到密码框，应走完内联密码阶段');
  const events = apiWithHook.getEvents();
  assert.ok(events.some((e) => e.type === 'click' && e.target === 'retry'), 'T1: 应对 timeout 错误页的重试按钮产生一次 click');
  assert.ok(events.some((e) => e.type === 'completePassword'), 'T1: 重试后应进入 completeStep3PasswordStage');
});

test('T2: timeout 错误页点重试 2s 后仍是 timeout → 抛 STEP3_INVALID_STATE_RESTART', async () => {
  const api = buildApi();
  const retryBtn = { _label: 'retry' };
  api.setTimeoutPage({
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: retryBtn,
    retryEnabled: true,
    titleMatched: true,
    detailMatched: true,
  });
  // 不 hook onRetry —— 点重试后 timeoutPage 保持不变，stillTimeout?.detailMatched 仍为 true

  await assert.rejects(
    api.maybeCompleteStep3InlineAfterEmailSubmit({ email: 'x@y', password: 'p', timeoutMs: 6000 }),
    (err) => {
      assert.match(err.message, /STEP3_INVALID_STATE_RESTART/, 'T2: 错误消息应含 STEP3_INVALID_STATE_RESTART 标记');
      assert.match(err.message, /timeout/, 'T2: 错误消息应注明这是 timeout 场景，便于定位');
      return true;
    }
  );
  const events = api.getEvents();
  assert.ok(events.filter((e) => e.type === 'click' && e.target === 'retry').length === 1, 'T2: 应只点一次重试后就放弃，不在 timeout 页无限重试');
});

test('T3: timeout 错误页但重试按钮被禁用 → 直接抛 STEP3_INVALID_STATE_RESTART，不点击', async () => {
  const api = buildApi();
  const retryBtn = { _label: 'retry' };
  api.setTimeoutPage({
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: retryBtn,
    retryEnabled: false, // 禁用
    titleMatched: true,
    detailMatched: true,
  });

  await assert.rejects(
    api.maybeCompleteStep3InlineAfterEmailSubmit({ email: 'x@y', password: 'p', timeoutMs: 6000 }),
    (err) => {
      assert.match(err.message, /STEP3_INVALID_STATE_RESTART/, 'T3: 应直接抛 STEP3_INVALID_STATE_RESTART');
      assert.match(err.message, /禁用/, 'T3: 消息应说明是按钮被禁用');
      return true;
    }
  );
  const events = api.getEvents();
  assert.ok(!events.some((e) => e.type === 'click'), 'T3: 按钮被禁用时不应发起任何 click');
});

test('T4: 只有标题命中、Operation timed out 文案未命中（detailMatched=false）→ 不误触发 timeout 分支', async () => {
  const api = buildApi();
  // 模拟"糟糕，出错了！"但没有 operation timed out 文案（例如 405 Route Error 或其他）
  // 且非 invalid_state。这种情况下我们不应接管——留给 /email-verification 的 Route
  // Error 专用逻辑、或者让循环跑到超时、或者等 URL 变化。
  api.setTimeoutPage({
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: { _label: 'retry' },
    retryEnabled: true,
    titleMatched: true,
    detailMatched: false, // 关键：detail 未命中
  });

  const result = await api.maybeCompleteStep3InlineAfterEmailSubmit({
    email: 'x@y',
    password: 'p',
    timeoutMs: 100, // 快速超时，避免单测慢
  });

  assert.deepStrictEqual(result, { completedInline: false }, 'T4: detailMatched=false 时应让循环跑到超时，返回 completedInline=false');
  const events = api.getEvents();
  assert.ok(!events.some((e) => e.type === 'click'), 'T4: detailMatched=false 时不应点击重试按钮');
});

test('T5: invalid_state 优先级高于 timeout —— 两者同时命中时只走 invalid_state 分支', async () => {
  const api = buildApi();
  const invalidRetry = { _label: 'invalid-retry' };
  const timeoutRetry = { _label: 'timeout-retry' };
  api.setInvalidStatePage({
    path: '/create-account',
    url: 'https://auth.openai.com/create-account',
    retryButton: invalidRetry,
    retryEnabled: true,
  });
  api.setTimeoutPage({
    path: '/create-account',
    url: 'https://auth.openai.com/create-account',
    retryButton: timeoutRetry,
    retryEnabled: true,
    titleMatched: true,
    detailMatched: true,
  });

  await assert.rejects(
    api.maybeCompleteStep3InlineAfterEmailSubmit({ email: 'x@y', password: 'p', timeoutMs: 6000 }),
    (err) => {
      assert.match(err.message, /STEP3_INVALID_STATE_RESTART/, 'T5: invalid_state 2s 后仍未恢复应抛 STEP3_INVALID_STATE_RESTART');
      assert.match(err.message, /invalid_state/, 'T5: 错误消息应提到 invalid_state（而非 timeout）');
      return true;
    }
  );
  const events = api.getEvents();
  const clicks = events.filter((e) => e.type === 'click');
  assert.ok(clicks.every((e) => e.target === 'invalid-retry'), 'T5: 只应点 invalid_state 分支的重试按钮，不应触碰 timeout 的');
});
