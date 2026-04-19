// 回归：点击 chatgpt.com 首页「免费注册」后，「欢迎回来」账号选择弹窗可能
// 在 step 2 的 5s post-click 守望之后才冒出来。此时 step 3 的 content script
// 上来就会撞见弹窗、找不到邮箱输入框，10 秒后超时报错。
//
// 修复：step 3 入口先检测弹窗；有则执行与 step 2 相同的"清缓存账号 X → 点
// 创建帐户"清理流程，再让原有等待逻辑自然接手邮箱输入框。

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
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

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

// scenarios: 'picker_ok' | 'picker_no_create' | 'no_picker'
// 策略：在 guard 块之后紧接着的 getSignupPasswordInput() 抛出 sentinel，
// 这样能精确判断执行流是否穿过 guard 块到达了"正常填写邮箱"阶段。
function buildApi(scenario) {
  return new Function('scenario', `
const events = [];
const forgetBtn = { id: 'forget' };
const createBtn = { id: 'create' };
const POST_GUARD_SENTINEL = '__POST_GUARD_REACHED__';

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('step3_fillEmailPassword')}

function isChooseAccountPickerVisible() {
  return scenario !== 'no_picker';
}

function findChooseAccountPickerForgetButtons() {
  return scenario === 'picker_no_create' ? [] : [forgetBtn];
}

function findChooseAccountPickerCreateButton() {
  return scenario === 'picker_no_create' ? null : createBtn;
}

function clearStep3RegisterError() { events.push({ type: 'clearError' }); }

// step 3 入口新增了 invalid_state 错误页识别，这里 stub 为 null 表示"无 invalid_state"，
// 让原有的弹窗 guard 测试不受影响。invalid_state 的识别逻辑由独立的测试文件覆盖。
function getInvalidStateErrorPageState() { return null; }

function log(message, level) { events.push({ type: 'log', message, level }); }
async function humanPause() {}
async function sleep(ms) { events.push({ type: 'sleep', ms }); }

function simulateClick(el) { events.push({ type: 'click', id: el.id }); }

// 首次调用即抛 sentinel，用来精确判断"执行流到达 guard 之后"
function getSignupPasswordInput() { throw new Error(POST_GUARD_SENTINEL); }
function getVisibleRegistrationEmailInput() { return null; }

const location = { href: 'https://chatgpt.com/' };

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
};
`)(scenario);
}

// T1: step 3 入口有弹窗，cleanup 能找到创建帐户 → 执行清理 → 流程穿过到填邮箱阶段
async function testStep3EntryPickerCleanupThenProceed() {
  const api = buildApi('picker_ok');
  const { events, error } = await api.run('x@y.com');

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(
    clicks,
    ['forget', 'create'],
    'T1: 应依次点击 forget → create（和 step 2 的清理流程一致）'
  );

  // 触发 guard 分支的告警日志
  assert.ok(
    events.some((e) => e.type === 'log' && /发现「欢迎回来」弹窗/.test(e.message || '')),
    'T1: 应写入一条 warn 级日志，告知 step 3 撞见了弹窗'
  );

  // 点击后应 sleep 800ms 给页面渲染邮箱输入框的时间
  const sleep800 = events.find((e) => e.type === 'sleep' && e.ms === 800);
  assert.ok(sleep800, 'T1: create 点击后应 sleep(800) 让页面导航/渲染邮箱输入框');

  // 最终应到达 guard 之后（通过 POST_GUARD sentinel 证明流程没卡在 guard 里）
  assert.ok(error, 'T1: 穿过 guard 后的 getSignupPasswordInput 会抛 sentinel 错误');
  assert.ok(
    error.message.includes(api.POST_GUARD_SENTINEL),
    'T1: 错误应该是 sentinel，说明流程穿过了 guard 到达正常填邮箱阶段'
  );
}

// T2: step 3 入口有弹窗，但找不到创建帐户 → 抛清晰的错误、不继续
async function testStep3EntryPickerWithoutCreateBtnThrows() {
  const api = buildApi('picker_no_create');
  const { events, error } = await api.run('x@y.com');

  // forget 数组空 → 不点 forget；create 是 null → 不点 create
  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T2: 找不到创建帐户时不应有任何点击');

  assert.ok(error, 'T2: 应抛错');
  assert.match(
    error.message,
    /step 3 入口检测到欢迎回来弹窗.*未找到.*创建帐户/,
    'T2: 错误消息应清晰指示是 step 3 入口守卫触发'
  );

  // 关键：不应该是 sentinel（不能静默穿过到填邮箱阶段）
  assert.ok(
    !error.message.includes(api.POST_GUARD_SENTINEL),
    'T2: 必须在 guard 内就抛错，绝不能穿过到 POST_GUARD'
  );
}

// T3: step 3 入口无弹窗 → 跳过 guard，直接进入原有填邮箱流程
async function testStep3EntryNoPickerSkipsGuard() {
  const api = buildApi('no_picker');
  const { events, error } = await api.run('x@y.com');

  // 不应触发 cleanup 里的任何点击
  const clicks = events.filter((e) => e.type === 'click');
  assert.strictEqual(clicks.length, 0, 'T3: 无弹窗时 cleanup 不应被调用（无 forget/create 点击）');

  // 不应出现 guard 分支的告警日志
  assert.ok(
    !events.some((e) => e.type === 'log' && /发现「欢迎回来」弹窗/.test(e.message || '')),
    'T3: 无弹窗时 guard 告警日志不应出现'
  );

  // 应该到达原有填邮箱阶段（sentinel 抛出）
  assert.ok(error, 'T3: 无弹窗时流程应推进到原有填邮箱阶段（触发 sentinel）');
  assert.ok(
    error.message.includes(api.POST_GUARD_SENTINEL),
    'T3: guard 被跳过、到达 getSignupPasswordInput，验证不破坏现有 step 3 行为'
  );
}

(async () => {
  await testStep3EntryPickerCleanupThenProceed();
  await testStep3EntryPickerWithoutCreateBtnThrows();
  await testStep3EntryNoPickerSkipsGuard();
  console.log('step3 welcome back dialog guard tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
