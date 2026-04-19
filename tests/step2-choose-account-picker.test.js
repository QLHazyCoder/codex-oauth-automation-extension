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

// ---- 最小 DOM 仿真：只实现 find 函数需要的 API ----
function makeNode({ text = '', ariaLabel = null, parent = null, children = [], tag = 'div' } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    textContent: text,
    _ariaLabel: ariaLabel,
    parentElement: parent,
    children,
    _disabled: false,
    disabled: false,
    getAttribute(name) {
      if (name === 'aria-label') return this._ariaLabel;
      if (name === 'aria-disabled') return null;
      return null;
    },
    querySelectorAll(selector) {
      // 我们不真正解析 selector；所有子孙节点都当作"符合"（因为单测里不依赖精确匹配）
      const all = [];
      const walk = (node) => {
        for (const child of node.children || []) {
          all.push(child);
          walk(child);
        }
      };
      walk(this);
      // 如果选择器仅限 button/[role="button"]，过滤 BUTTON 标签
      if (/button/.test(selector)) {
        return all.filter((el) => el.tagName === 'BUTTON');
      }
      return all;
    },
  };
  for (const child of children) {
    child.parentElement = node;
  }
  return node;
}

// T1: findChooseAccountPickerForgetButtons 能识别卡片 X 但排除弹窗顶部关闭 X
async function testForgetButtonsIdentifiesCardXExcludesDialogTopClose() {
  // Build DOM:
  // dialogEl
  //   ├── topCloseBtn (直接子，顶部关闭 X — 应排除)
  //   ├── cardA
  //   │     ├── emailSpanA ("a@icloud.com")
  //   │     └── forgetBtnA (X 按钮 — 应命中)
  //   └── cardB
  //         ├── emailSpanB ("b@icloud.com")
  //         └── forgetBtnB (aria-label="Remove account")
  const topCloseBtn = makeNode({ tag: 'button', text: '', ariaLabel: 'Close' });
  const emailSpanA = makeNode({ text: 'a@icloud.com' });
  const forgetBtnA = makeNode({ tag: 'button', text: 'X' });
  const cardA = makeNode({ children: [emailSpanA, forgetBtnA] });

  const emailSpanB = makeNode({ text: 'b@icloud.com' });
  const forgetBtnB = makeNode({ tag: 'button', text: '', ariaLabel: 'Remove account' });
  const cardB = makeNode({ children: [emailSpanB, forgetBtnB] });

  const dialogEl = makeNode({ children: [topCloseBtn, cardA, cardB] });

  const api = new Function('dialogEl', `
const document = {
  querySelector(selector) {
    if (/dialog|aria-modal/.test(selector)) return dialogEl;
    return null;
  },
};

function isVisibleElement() { return true; }
function isActionEnabled(el) { return !el.disabled; }
function getActionText(el) {
  const parts = [el.textContent, el.getAttribute('aria-label')].filter(Boolean);
  return parts.join(' ').replace(/\\s+/g, ' ').trim();
}

${extractFunction('findChooseAccountPickerForgetButtons')}

return { findChooseAccountPickerForgetButtons };
`)(dialogEl);

  const result = api.findChooseAccountPickerForgetButtons();
  assert.ok(result.includes(forgetBtnA), 'T1: 应命中 cardA 里的 forgetBtnA');
  assert.ok(result.includes(forgetBtnB), 'T1: 应命中 cardB 里的 forgetBtnB（靠 aria-label Remove 识别）');
  assert.ok(!result.includes(topCloseBtn), 'T1: 不应命中弹窗顶层关闭 X（parentElement === dialogEl）');
  assert.strictEqual(result.length, 2, 'T1: 恰好应返回 2 个 forget 按钮');
}

// T2: findChooseAccountPickerCreateButton 只找「创建帐户」按钮
async function testCreateButtonFindsExactCreateAccountOnly() {
  const loginBtn = makeNode({ tag: 'button', text: '登录至另一个帐户' });
  const createBtn = makeNode({ tag: 'button', text: '创建帐户' });
  const outsideSignupBtn = makeNode({ tag: 'button', text: '免费注册' });
  const dialogEl = makeNode({ children: [loginBtn, createBtn] });

  const api = new Function('dialogEl', 'createBtn', 'outsideSignupBtn', `
const document = {
  querySelector(selector) {
    if (/dialog|aria-modal/.test(selector)) return dialogEl;
    return null;
  },
};

function isVisibleElement() { return true; }
function isActionEnabled() { return true; }
function getActionText(el) { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); }

${extractFunction('findChooseAccountPickerCreateButton')}

return { findChooseAccountPickerCreateButton };
`)(dialogEl, createBtn, outsideSignupBtn);

  const result = api.findChooseAccountPickerCreateButton();
  assert.strictEqual(result, createBtn, 'T2: 应精确返回「创建帐户」按钮');
  assert.notStrictEqual(result, loginBtn, 'T2: 不应返回「登录至另一个帐户」按钮');
  assert.notStrictEqual(result, outsideSignupBtn, 'T2: 不应返回弹窗外的「免费注册」按钮');
}

// T3: step2_clickRegister（picker 分支）端到端 — surface ready 后才 reportComplete
async function testStep2ClickRegisterPickerBranchClicksAllXAndCreateButton() {
  const api = new Function(`
const events = [];
const forgetBtn1 = { id: 'forget1' };
const forgetBtn2 = { id: 'forget2' };
const createBtn = { id: 'create' };

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('step2_clickRegister')}

function inspectStep2SignupEntryState() {
  return { state: 'choose_account_picker' };
}

function findChooseAccountPickerForgetButtons() {
  return [forgetBtn1, forgetBtn2];
}

function findChooseAccountPickerCreateButton() {
  return createBtn;
}

// 模拟点击「创建帐户」之后页面 surface 就绪（邮箱输入框出现）
async function waitForStep2RegistrationSurfaceReady() {
  return 'email';
}

function log(message, level) {
  events.push({ type: 'log', message, level });
}

async function humanPause() {}
async function sleep() {}

function simulateClick(el) {
  events.push({ type: 'click', id: el.id });
}

function reportComplete(step, payload) {
  events.push({ type: 'reportComplete', step, payload });
}

const location = { href: 'https://chatgpt.com/' };

return {
  step2_clickRegister,
  getEvents() { return events; },
};
`)();

  const result = await api.step2_clickRegister({});
  const events = api.getEvents();

  // 按顺序：先点两个 forget，然后点 create；create 点击必须早于 reportComplete
  const clicks = events.filter((e) => e.type === 'click');
  assert.deepStrictEqual(
    clicks.map((e) => e.id),
    ['forget1', 'forget2', 'create'],
    'T3: 应依次点击每个 forget 按钮，然后点 create 按钮'
  );

  // reportComplete 必须在 create 点击之后 —— 新行为：surface 就绪才上报
  const createIdx = events.findIndex((e) => e.type === 'click' && e.id === 'create');
  const reportIdx = events.findIndex((e) => e.type === 'reportComplete');
  assert.ok(
    createIdx >= 0 && reportIdx > createIdx,
    'T3: reportComplete 必须出现在点击 create 之后（新行为：等 surface 就绪才 report）'
  );

  // reportComplete 被调用且 payload 带 surface
  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 1, 'T3: reportComplete 应只被调用一次');
  assert.strictEqual(reports[0].step, 2, 'T3: step 应为 2');
  assert.deepStrictEqual(
    reports[0].payload,
    { fromChooseAccountPicker: true, forgetCount: 2, surface: 'email' },
    'T3: reportComplete payload 应携带 fromChooseAccountPicker + forgetCount + surface'
  );

  // 返回值
  assert.deepStrictEqual(
    result,
    {
      clickedRegister: true,
      fromChooseAccountPicker: true,
      forgetCount: 2,
      surface: 'email',
      url: 'https://chatgpt.com/',
    },
    'T3: 返回值结构符合预期'
  );
}

// T4: 找不到「创建帐户」按钮时，回退到备用注册地址 + 不调用 reportComplete
async function testStep2ClickRegisterPickerFallsBackWhenCreateButtonMissing() {
  const api = new Function(`
const events = [];
const forgetBtn = { id: 'forget1' };

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('step2_clickRegister')}

function inspectStep2SignupEntryState() {
  return { state: 'choose_account_picker' };
}

function findChooseAccountPickerForgetButtons() {
  return [forgetBtn];
}

function findChooseAccountPickerCreateButton() {
  return null;
}

async function waitForStep2RegistrationSurfaceReady() {
  throw new Error('T4: 不应调到 surface 等待 — 应在 cleanup 失败时直接回退');
}

function log(message, level) {
  events.push({ type: 'log', message, level });
}

async function humanPause() {}
async function sleep() {}

function simulateClick(el) {
  events.push({ type: 'click', id: el.id });
}

function reportComplete(step, payload) {
  events.push({ type: 'reportComplete', step, payload });
}

const location = { href: 'https://chatgpt.com/' };

return {
  step2_clickRegister,
  getEvents() { return events; },
};
`)();

  const result = await api.step2_clickRegister({});
  const events = api.getEvents();

  // forget 按钮仍然被点了
  const clicks = events.filter((e) => e.type === 'click');
  assert.deepStrictEqual(clicks.map((e) => e.id), ['forget1'], 'T4: forget 按钮仍应被点');

  // reportComplete 不应被调用
  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 0, 'T4: 找不到 createBtn 时不应 reportComplete(2)');

  // 返回值是 fallback
  assert.strictEqual(result.needsAlternateSignupEntry, true, 'T4: 应回退到备用入口');
  assert.match(result.reason || '', /欢迎回来弹窗.*未找到.*创建帐户/, 'T4: reason 文案提示找不到创建帐户');
}

// T5: 新增 — cleanup 成功、create 已点击，但 8s 内 surface 未就绪 → needsAlternate
// 核心价值：避免把假"完成"信号传给 background → 触发 iCloud 别名配额浪费。
async function testStep2ClickRegisterPickerFallsBackWhenSurfaceNotReady() {
  const api = new Function(`
const events = [];
const forgetBtn = { id: 'forget1' };
const createBtn = { id: 'create' };

${extractFunction('performChooseAccountPickerCleanup')}
${extractFunction('step2_clickRegister')}

function inspectStep2SignupEntryState() {
  return { state: 'choose_account_picker' };
}

function findChooseAccountPickerForgetButtons() {
  return [forgetBtn];
}

function findChooseAccountPickerCreateButton() {
  return createBtn;
}

// 模拟点击后 8s 都没进入注册表单（例如页面卡在 chatgpt.com 过渡态）
async function waitForStep2RegistrationSurfaceReady() {
  return null;
}

function log(message, level) {
  events.push({ type: 'log', message, level });
}

async function humanPause() {}
async function sleep() {}

function simulateClick(el) {
  events.push({ type: 'click', id: el.id });
}

function reportComplete(step, payload) {
  events.push({ type: 'reportComplete', step, payload });
}

const location = { href: 'https://chatgpt.com/' };

return {
  step2_clickRegister,
  getEvents() { return events; },
};
`)();

  const result = await api.step2_clickRegister({});
  const events = api.getEvents();

  // create 按钮应已点击过（否则没有机会等 surface）
  const clicks = events.filter((e) => e.type === 'click');
  assert.deepStrictEqual(
    clicks.map((e) => e.id),
    ['forget1', 'create'],
    'T5: forget 和 create 都应被点（点了才能等 surface，surface 超时后才回退）'
  );

  // reportComplete 绝不能被调用 —— 这是核心断言，避免污染 background
  const reports = events.filter((e) => e.type === 'reportComplete');
  assert.strictEqual(reports.length, 0, 'T5: surface 未就绪时必须不 reportComplete(2)，否则会浪费邮箱配额');

  // 必须回退到备用入口
  assert.strictEqual(result.needsAlternateSignupEntry, true, 'T5: 应回退到备用入口');
  assert.match(
    result.reason || '',
    /点击「创建帐户」后.*未进入注册表单.*浪费邮箱配额/,
    'T5: reason 应说明"避免浪费邮箱配额"的修复意图'
  );
}

(async () => {
  await testForgetButtonsIdentifiesCardXExcludesDialogTopClose();
  await testCreateButtonFindsExactCreateAccountOnly();
  await testStep2ClickRegisterPickerBranchClicksAllXAndCreateButton();
  await testStep2ClickRegisterPickerFallsBackWhenCreateButtonMissing();
  await testStep2ClickRegisterPickerFallsBackWhenSurfaceNotReady();
  console.log('step2 choose account picker tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
