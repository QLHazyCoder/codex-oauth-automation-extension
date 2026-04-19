// 回归：step 2 的普通 entry 分支在点击「免费注册」之后，
// OpenAI 可能不跳转，而是弹出「欢迎回来」账号选择弹窗（服务端有缓存 session）。
// 若此时直接 reportComplete(2) 并停手，step 3 会在 chatgpt.com 原地等邮箱输入框
// 10 秒后超时报「在注册页未找到邮箱输入框」。
// 修复：点击 entry 之后轮询 2.5s；看到 picker 就清理并点「创建帐户」。

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

// scenarios 取值:
//   'picker'                    — 点击 register 后出现弹窗；清理后 create 点击完成 → surface 就绪
//   'navigate'                  — 点击 register 后 URL 跳转 → surface 就绪
//   'silent'                    — 点击后什么都没发生且 surface 始终不就绪 → 回退（新行为！）
//   'picker_no_create'          — 点击后出现弹窗但找不到 create 按钮 → 回退
//   'picker_create_no_surface'  — 点击后弹窗出现、create 能点，但 surface 始终不就绪 → 回退（新增）
function buildApi(scenario) {
  return new Function('scenario', `
const events = [];
const registerBtn = { id: 'register' };
const forgetBtn = { id: 'forget' };
const createBtn = { id: 'create' };

let pickerVisible = false;
let currentHref = 'https://chatgpt.com/';
let emailInputAppeared = false;

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('waitForChooseAccountPickerOrProgress')}
${extractFunction('step2_clickRegister')}

function inspectStep2SignupEntryState() {
  return { state: 'entry', registerAction: registerBtn };
}

function isChooseAccountPickerVisible() { return pickerVisible; }
function getVisibleRegistrationEmailInput() { return emailInputAppeared ? { id: 'emailInput' } : null; }

// surface ready：只有在点击 create / register 且场景允许时才视为就绪。
// 'silent' 和 'picker_create_no_surface' 模拟超时。
async function waitForStep2RegistrationSurfaceReady() {
  if (scenario === 'silent' || scenario === 'picker_create_no_surface') {
    return null;
  }
  return 'email';
}

function findChooseAccountPickerForgetButtons() {
  return scenario === 'picker_no_create' ? [] : [forgetBtn];
}

function findChooseAccountPickerCreateButton() {
  return scenario === 'picker_no_create' ? null : createBtn;
}

function log(message, level) { events.push({ type: 'log', message, level }); }

// sleep 无延迟，但把事件时序透出来。polling 仍会驱动 Date.now() 向前。
async function sleep(ms) {
  events.push({ type: 'sleep', ms });
}
async function humanPause() {}

function simulateClick(el) {
  events.push({ type: 'click', id: el.id });
  if (el.id === 'register') {
    if (scenario === 'picker' || scenario === 'picker_no_create' || scenario === 'picker_create_no_surface') {
      pickerVisible = true;
    } else if (scenario === 'navigate') {
      currentHref = 'https://auth.openai.com/create-account';
    } else if (scenario === 'silent') {
      // 什么都不发生
    }
  }
  if (el.id === 'create') {
    // 点击创建帐户后弹窗消失
    pickerVisible = false;
  }
}

function reportComplete(step, payload) { events.push({ type: 'reportComplete', step, payload }); }

const location = {
  get href() { return currentHref; },
};

return {
  async run() {
    return {
      result: await step2_clickRegister({}),
      events: [...events],
    };
  },
};
`)(scenario);
}

// T1: 点击注册入口后冒出「欢迎回来」弹窗 → 清 forget + 点 create → surface 就绪 → reportComplete
async function testPostClickPickerTriggersCleanup() {
  const api = buildApi('picker');
  const { result, events } = await api.run();

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(
    clicks,
    ['register', 'forget', 'create'],
    'T1: 点击顺序应为 register → forget → create'
  );

  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 1, 'T1: reportComplete 应只被调用一次');
  assert.strictEqual(reports[0].step, 2, 'T1: 应 report step 2');
  assert.deepStrictEqual(
    reports[0].payload,
    { fromChooseAccountPicker: true, forgetCount: 1, viaPostClickGuard: true, surface: 'email' },
    'T1: payload 必须带 viaPostClickGuard + surface（新行为：surface 就绪才 report）'
  );

  // 新行为：reportComplete 必须在 create click 之后（先点击 → 等 surface → 再 report）
  const reportIdx = events.findIndex((e) => e.type === 'reportComplete');
  const registerIdx = events.findIndex((e) => e.type === 'click' && e.id === 'register');
  const createIdx = events.findIndex((e) => e.type === 'click' && e.id === 'create');
  assert.ok(
    reportIdx > registerIdx,
    'T1: reportComplete 必须出现在点击 register 之后'
  );
  assert.ok(reportIdx > createIdx, 'T1: 新行为：reportComplete 必须在 create click 之后（等 surface 就绪才 report）');

  assert.deepStrictEqual(
    result,
    {
      clickedRegister: true,
      fromChooseAccountPicker: true,
      viaPostClickGuard: true,
      forgetCount: 1,
      surface: 'email',
      url: 'https://chatgpt.com/',
    },
    'T1: 返回值结构符合预期'
  );
}

// T2: 点击注册入口后 URL 立即跳转 → 不触发清理，等 surface 就绪后 reportComplete({ surface })
async function testPostClickNavigationSkipsCleanup() {
  const api = buildApi('navigate');
  const { result, events } = await api.run();

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(
    clicks,
    ['register'],
    'T2: 仅应点击 register，不应触发 forget / create'
  );

  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 1, 'T2: reportComplete 应被调用一次');
  assert.strictEqual(reports[0].step, 2, 'T2: 应 report step 2');
  assert.deepStrictEqual(
    reports[0].payload,
    { surface: 'email' },
    'T2: 普通 entry 分支也要带 surface，证明真进了注册表单'
  );

  assert.deepStrictEqual(
    result,
    {
      clickedRegister: true,
      surface: 'email',
      url: 'https://auth.openai.com/create-account',
    },
    'T2: URL 已随跳转更新，surface 命中 email'
  );
}

// T3（语义已改）：点击后页面没动、surface 也始终不就绪
//   → 新行为：不 reportComplete，改走 needsAlternateSignupEntry 切下一个候选 URL。
// 这正是本轮修复的核心：避免把假"完成"信号传给 background → 导致 iCloud 配额被浪费。
async function testPostClickSilentTimesOutTriggersFallback() {
  const api = buildApi('silent');
  const { result, events } = await api.run();

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(clicks, ['register'], 'T3: 仅应点击 register');

  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(
    reports.length,
    0,
    'T3: 新行为 —— surface 未就绪时必须不 reportComplete(2)，避免浪费 iCloud 别名配额'
  );

  assert.strictEqual(result.needsAlternateSignupEntry, true, 'T3: 应回退到备用入口');
  assert.match(
    result.reason || '',
    /8s 未进入注册表单/,
    'T3: reason 应说明 surface 超时'
  );
}

// T4: 点击后弹窗出现但找不到「创建帐户」按钮 → needsAlternateSignupEntry，不应 reportComplete
async function testPostClickPickerWithoutCreateBtnFallsBack() {
  const api = buildApi('picker_no_create');
  const { result, events } = await api.run();

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(
    clicks,
    ['register'],
    'T4: 应点击 register；forget 数组为空故不点；create 找不到故不点'
  );

  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 0, 'T4: 找不到 createBtn 时不应 reportComplete(2)');

  assert.strictEqual(
    result.needsAlternateSignupEntry,
    true,
    'T4: 应回退到备用注册入口'
  );
  assert.match(
    result.reason || '',
    /点击注册入口后出现欢迎回来弹窗.*未找到.*创建帐户/,
    'T4: reason 文案提示是"点击后"出现弹窗的分支'
  );
}

// T5: 新增 — 点击 register 后出现弹窗，cleanup 成功、create 也点了，但 surface 始终不就绪
// → 回退到备用入口，且不 reportComplete。复现主人日志里"步骤 2 假完成 → iCloud 配额被烧"的场景。
async function testPostClickPickerCreateClickedButSurfaceNotReady() {
  const api = buildApi('picker_create_no_surface');
  const { result, events } = await api.run();

  const clicks = events.filter((e) => e.type === 'click').map((e) => e.id);
  assert.deepStrictEqual(
    clicks,
    ['register', 'forget', 'create'],
    'T5: 完整清理序列都应发生（点了才有机会等 surface）'
  );

  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(
    reports.length,
    0,
    'T5: surface 超时时 post-click 分支必须不 reportComplete(2)'
  );

  assert.strictEqual(result.needsAlternateSignupEntry, true, 'T5: 应回退到备用入口');
  assert.match(
    result.reason || '',
    /post-click 清理后.*未进入注册表单.*浪费邮箱配额/,
    'T5: reason 应明确指出"避免浪费邮箱配额"'
  );
}

(async () => {
  await testPostClickPickerTriggersCleanup();
  await testPostClickNavigationSkipsCleanup();
  await testPostClickSilentTimesOutTriggersFallback();
  await testPostClickPickerWithoutCreateBtnFallsBack();
  await testPostClickPickerCreateClickedButSurfaceNotReady();
  console.log('step2 post-click picker guard tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
