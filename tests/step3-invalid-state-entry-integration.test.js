// 集成回归：step3_fillEmailPassword 入口及执行过程中遇到 invalid_state / timeout
// 错误页时的处理。
//
// 覆盖多条路径：
//   A) 入口守卫命中 + 重试有效 → 穿过 guard（sentinel 触发）
//   B) 入口守卫命中 + 重试禁用 / 重试后仍是 invalid_state → STEP3_INVALID_STATE_RESTART
//   C) 入口正常，waitForStep3Surface 循环里检测到 invalid_state → STEP3_INVALID_STATE_RESTART
//   D) 入口 timeout 错误页 + 重试禁用 / 重试后仍是 timeout → STEP3_INVALID_STATE_RESTART
//   E) waitForStep3Surface 循环里检测到 timeout → STEP3_INVALID_STATE_RESTART
//
// STEP3_INVALID_STATE_RESTART 前缀由 background.js isStep3RestartFromStep2Error 识别，
// 触发 step 2 restart（清 cookie 重建 OAuth context）。

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

// scenarios:
//   'invalid_state_retry_ok'    — 入口 invalid_state + retry 可用 + 重试后正常 → 穿过 guard
//   'invalid_state_disabled'    — 入口 invalid_state + retry 禁用 → STEP3_INVALID_STATE_RESTART
//   'invalid_state_retry_fails' — 入口 invalid_state + retry 可用 + 重试后仍是 invalid_state → RESTART
//   'no_invalid_state'          — 入口正常 → 跳过 guard，直接到 sentinel
//   'surface_invalid_state'     — 入口正常，waitForStep3Surface 里检测到 invalid_state → RESTART
//   'timeout_disabled'          — 入口 timeout + retry 禁用 → STEP3_INVALID_STATE_RESTART
//   'timeout_retry_fails'       — 入口 timeout + retry 可用 + 重试后仍是 timeout → RESTART
//   'surface_timeout'           — 入口正常，waitForStep3Surface 里检测到 timeout → RESTART
function buildApi(scenario) {
  return new Function('scenario', `
const events = [];
const retryBtn = { id: 'retry' };
const POST_GUARD_SENTINEL = '__POST_GUARD_REACHED__';
const RESTART_MARKER = 'STEP3_INVALID_STATE_RESTART:';
let timeoutCallCount = 0;

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('waitForStep3Surface')}
${extractFunction('step3_fillEmailPassword')}

function isChooseAccountPickerVisible() { return false; }
function findChooseAccountPickerForgetButtons() { return []; }
function findChooseAccountPickerCreateButton() { return null; }
function clearStep3RegisterError() { events.push({ type: 'clearError' }); }
function isVerificationPageStillVisible() { return false; }
function throwIfStopped() {}

// 入口守卫用 getInvalidStateErrorPageState；sleep 后二次检测用 isInvalidStateErrorPage
function getInvalidStateErrorPageState() {
  const hasError = scenario === 'invalid_state_retry_ok'
    || scenario === 'invalid_state_disabled'
    || scenario === 'invalid_state_retry_fails';
  if (!hasError) return null;
  return {
    path: '/create-account',
    url: 'https://auth.openai.com/create-account',
    retryButton: retryBtn,
    retryEnabled: scenario !== 'invalid_state_disabled',
    titleMatched: true,
    detailMatched: true,
  };
}

// sleep 后二次检测 + waitForStep3Surface 里循环检测
// 'invalid_state_retry_fails': 重试后仍是 invalid_state → true
// 'surface_invalid_state': waitForStep3Surface 里检测到 → true
// 其他 → false
function isInvalidStateErrorPage() {
  return scenario === 'invalid_state_retry_fails' || scenario === 'surface_invalid_state';
}

function getAuthTimeoutErrorPageState() {
  timeoutCallCount += 1;
  if (scenario === 'surface_timeout' && timeoutCallCount === 1) {
    return null;
  }
  const hasTimeout = scenario === 'timeout_disabled'
    || scenario === 'timeout_retry_fails'
    || scenario === 'surface_timeout';
  if (!hasTimeout) return null;
  return {
    path: '/log-in-or-create-account',
    url: 'https://auth.openai.com/log-in-or-create-account',
    retryButton: retryBtn,
    retryEnabled: scenario !== 'timeout_disabled',
    titleMatched: true,
    detailMatched: true,
  };
}

function log(message, level) { events.push({ type: 'log', message, level }); }
async function humanPause() {}
async function sleep(ms) { events.push({ type: 'sleep', ms }); }

function simulateClick(el) { events.push({ type: 'click', id: el.id }); }

// surface_invalid_state 场景：入口没有 invalid_state，但需要进入 waitForStep3Surface
// 为此让 getSignupPasswordInput 返回 null（不触发 sentinel），由 waitForStep3Surface 处理
function getSignupPasswordInput() {
  if (scenario === 'surface_invalid_state' || scenario === 'surface_timeout') return null;
  throw new Error(POST_GUARD_SENTINEL);
}
function getVisibleRegistrationEmailInput() { return null; }

const location = { href: 'https://auth.openai.com/create-account', pathname: '/create-account' };

return {
  async run(email) {
    let error = null;
    try {
      await step3_fillEmailPassword({ email });
    } catch (e) {
      error = e;
    }
    return { events: [...events], error };
  },
  POST_GUARD_SENTINEL,
  RESTART_MARKER,
};
`)(scenario);
}

// T1: 入口 invalid_state + retry 可用 + 重试后正常 → 点重试 → sleep(2000) → 穿过 guard
async function testRetrySucceedsGuardPassThrough() {
  const api = buildApi('invalid_state_retry_ok');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(clicks, ['retry'], 'T1: 必须点一次 retry 按钮');

  const retryIdx = events.findIndex((e) => e.type === 'click' && e.id === 'retry');
  const sleep2000Idx = events.findIndex(
    (e, i) => i > retryIdx && e.type === 'sleep' && e.ms === 2000
  );
  assert.ok(sleep2000Idx > retryIdx, 'T1: retry 点击后必须 sleep(2000) 给页面重跳');

  assert.ok(
    events.some((e) => e.type === 'log' && /invalid_state/i.test(e.message || '')),
    'T1: 必须写入包含 invalid_state 的 warn 日志'
  );

  assert.ok(error, 'T1: 穿过 guard 后应命中 sentinel');
  assert.ok(
    error.message.includes(api.POST_GUARD_SENTINEL),
    'T1: error 必须是 sentinel —— guard 执行完毕后流程继续向下'
  );
}

// T2: 入口 invalid_state + retry 禁用 → 立即 throw STEP3_INVALID_STATE_RESTART，不得穿过
async function testRetryDisabledThrowsRestart() {
  const api = buildApi('invalid_state_disabled');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T2: 按钮禁用时绝不能点击');

  assert.ok(error, 'T2: 应抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T2: 错误必须以 STEP3_INVALID_STATE_RESTART: 开头（background 靠此标记触发 step 2 restart）'
  );
  assert.match(error.message, /禁用|disabled/i, 'T2: 错误消息应包含按钮禁用的说明');
  assert.ok(
    !error.message.includes(api.POST_GUARD_SENTINEL),
    'T2: 必须在 guard 内抛错，绝不能穿过到 POST_GUARD'
  );
}

// T3: 非错误页 → 跳过 guard，直接到 sentinel（回归保障）
async function testNoInvalidStateSkipsGuard() {
  const api = buildApi('no_invalid_state');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T3: 无 invalid_state 时不应有任何点击');

  assert.ok(
    !events.some((e) => e.type === 'log' && /invalid_state/i.test(e.message || '')),
    'T3: 无 invalid_state 时不应出现相关日志'
  );

  assert.ok(error, 'T3: 应推进到 sentinel');
  assert.ok(
    error.message.includes(api.POST_GUARD_SENTINEL),
    'T3: guard 被跳过、sentinel 触发 —— 验证不破坏正常 step 3 行为'
  );
}

// T4: 入口 invalid_state + retry 可用，但重试后 2s 内仍是 invalid_state → STEP3_INVALID_STATE_RESTART
// 复现：step 2 备用 URL（/create-account）直接打开，OAuth state cookie 已损坏，
// OpenAI 「重试」按钮点击后也无法恢复，不能无限循环，必须触发 step 2 restart 清 cookie。
async function testRetryStillInvalidStateThrowsRestart() {
  const api = buildApi('invalid_state_retry_fails');
  const { events, error } = await api.run('x@y.com');

  // 仍应点击 retry（尝试一次）
  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(clicks, ['retry'], 'T4: 应先点一次 retry 再检测');

  assert.ok(error, 'T4: 应抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T4: 重试后仍是 invalid_state → 必须以 STEP3_INVALID_STATE_RESTART: 开头（触发 step 2 restart）'
  );
  assert.match(
    error.message,
    /彻底失效|仍是.*invalid_state|invalid_state.*仍/i,
    'T4: 错误消息应说明 OAuth state 彻底失效'
  );
  assert.ok(
    !error.message.includes(api.POST_GUARD_SENTINEL),
    'T4: 不应穿过 guard 到 POST_GUARD'
  );
}

// T5: 入口正常（无 invalid_state），waitForStep3Surface 循环里检测到 invalid_state →
//      立即 throw STEP3_INVALID_STATE_RESTART（不等 10s 超时）
// 复现：step 3 填邮箱后点「继续」，页面切换到 invalid_state 错误页；
// maybeResumePendingStep3PasswordStage 再次调用 step3_fillEmailPassword，
// 入口无 invalid_state（guard 跳过），进入 waitForStep3Surface 后检测到 → 快速放弃。
async function testWaitForSurfaceDetectsInvalidState() {
  const api = buildApi('surface_invalid_state');
  const { events, error } = await api.run('x@y.com');

  // 入口守卫未触发，不应有点击
  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T5: 入口无 invalid_state 时不应有点击');

  assert.ok(error, 'T5: waitForStep3Surface 应立即抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T5: waitForStep3Surface 里检测到 invalid_state → STEP3_INVALID_STATE_RESTART:（不等 10s 超时）'
  );
  assert.match(
    error.message,
    /waitForStep3Surface|邮箱提交|OAuth state.*失效/i,
    'T5: 错误消息应说明是 waitForStep3Surface 检测到的'
  );
}

// T6: 入口 timeout + retry 禁用 → 立即 throw STEP3_INVALID_STATE_RESTART
async function testEntryTimeoutDisabledThrowsRestart() {
  const api = buildApi('timeout_disabled');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T6: timeout 按钮禁用时绝不能点击');

  assert.ok(error, 'T6: 应抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T6: timeout 入口守卫应抛 STEP3_INVALID_STATE_RESTART'
  );
  assert.match(error.message, /timeout/i, 'T6: 错误消息应明确说明 timeout 场景');
}

// T7: 入口 timeout + retry 可用，但重试后 2s 内仍是 timeout → STEP3_INVALID_STATE_RESTART
async function testEntryTimeoutRetryFailsThrowsRestart() {
  const api = buildApi('timeout_retry_fails');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(clicks, ['retry'], 'T7: timeout 场景应先尝试一次 retry');

  assert.ok(error, 'T7: 应抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T7: timeout 重试失败后必须抛 STEP3_INVALID_STATE_RESTART'
  );
  assert.match(error.message, /timeout/i, 'T7: 错误消息应明确说明 timeout 场景');
}

// T8: 入口正常，waitForStep3Surface 里检测到 timeout → 立即 throw STEP3_INVALID_STATE_RESTART
async function testWaitForSurfaceDetectsTimeout() {
  const api = buildApi('surface_timeout');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T8: 入口无 timeout 时不应先点击 retry');

  assert.ok(error, 'T8: waitForStep3Surface 应立即抛错');
  assert.ok(
    error.message.startsWith(api.RESTART_MARKER),
    'T8: waitForStep3Surface 检测到 timeout → STEP3_INVALID_STATE_RESTART:'
  );
  assert.match(error.message, /waitForStep3Surface|timeout/i, 'T8: 错误消息应指出是 surface timeout 场景');
}

(async () => {
  await testRetrySucceedsGuardPassThrough();
  await testRetryDisabledThrowsRestart();
  await testNoInvalidStateSkipsGuard();
  await testRetryStillInvalidStateThrowsRestart();
  await testWaitForSurfaceDetectsInvalidState();
  await testEntryTimeoutDisabledThrowsRestart();
  await testEntryTimeoutRetryFailsThrowsRestart();
  await testWaitForSurfaceDetectsTimeout();
  console.log('step3 invalid_state entry integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
