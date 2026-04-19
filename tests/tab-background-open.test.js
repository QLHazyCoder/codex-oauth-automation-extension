const assert = require('assert');
const fs = require('fs');
const originalConsole = console;

const source = fs.readFileSync('background.js', 'utf8');

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

const bundle = [
  extractFunction('isSameLogicalUrl'),
  extractFunction('navigateTabAndAwaitLoad'),
  extractFunction('reuseOrCreateTab'),
].join('\n');

function buildApi() {
  return new Function(`
let alive = false;
let currentTab = { id: 41, url: 'https://old.example.com/' };
const createCalls = [];
const updateCalls = [];
const remembered = [];
const stateUpdates = [];

async function isTabAlive() {
  return alive;
}

async function getTabId() {
  return currentTab.id;
}

async function ensureRunTabGroupForTab() {}
async function closeConflictingTabsForSource() {}
async function findExistingTabForSource() { return null; }
async function registerTab() {}
async function ensureContentScriptReadyOnTab() {}
async function rememberSourceLastUrl(source, url) {
  remembered.push({ source, url });
}
async function getTabRegistry() {
  return {
    'signup-page': { tabId: currentTab.id, ready: true },
  };
}
async function setState(updates) {
  stateUpdates.push(updates);
}

const chrome = {
  tabs: {
    async get() {
      return currentTab;
    },
    async update(tabId, updateInfo) {
      updateCalls.push({ tabId, updateInfo });
      currentTab = {
        ...currentTab,
        ...(updateInfo.url ? { url: updateInfo.url } : {}),
      };
      return currentTab;
    },
    async create(createInfo) {
      createCalls.push(createInfo);
      currentTab = {
        id: 99,
        url: createInfo.url,
      };
      return currentTab;
    },
    async reload() {},
    onUpdated: {
      addListener(listener) {
        setImmediate(() => listener(currentTab.id, { status: 'complete' }));
      },
      removeListener() {},
    },
  },
  scripting: {
    async executeScript() {},
  },
};

const LOG_PREFIX = '[test]';
console = { log() {}, warn() {}, error() {} };

${bundle}

return {
  async createInBackground() {
    alive = false;
    currentTab = { id: 41, url: 'https://old.example.com/' };
    createCalls.length = 0;
    updateCalls.length = 0;
    await reuseOrCreateTab('signup-page', 'https://auth.openai.com/authorize');
    return { createCalls: [...createCalls], updateCalls: [...updateCalls], remembered: [...remembered] };
  },
  async navigateExistingWithoutFocus() {
    alive = true;
    currentTab = { id: 41, url: 'https://old.example.com/' };
    createCalls.length = 0;
    updateCalls.length = 0;
    stateUpdates.length = 0;
    await reuseOrCreateTab('signup-page', 'https://auth.openai.com/authorize');
    return { createCalls: [...createCalls], updateCalls: [...updateCalls], stateUpdates: [...stateUpdates] };
  },
};
`)();
}

(async () => {
  const api = buildApi();

  const created = await api.createInBackground();
  assert.deepStrictEqual(
    created.createCalls,
    [{ url: 'https://auth.openai.com/authorize', active: false }],
    '默认新开标签页应在后台打开，避免抢焦点'
  );
  assert.deepStrictEqual(created.updateCalls, [], '新开后台标签页时不应额外激活标签页');

  const navigated = await api.navigateExistingWithoutFocus();
  assert.deepStrictEqual(navigated.createCalls, [], '复用已有标签页时不应再新建标签页');
  assert.deepStrictEqual(
    navigated.updateCalls[0],
    { tabId: 41, updateInfo: { url: 'https://auth.openai.com/authorize' } },
    '复用已有标签页导航时不应附带 active: true'
  );

  // C 分支公用沙箱工厂：可配置 staleUrl、targetUrl、shouldActivate、以及 onUpdated 是否触发
  function buildAdoptApi({ staleUrl, targetUrl, activate = false, fireComplete = true }) {
    return new Function('staleUrl', 'targetUrl', 'activate', 'fireComplete', `
let currentTab = { id: 55, url: staleUrl };
const createCalls = [];
const updateCalls = [];
const stateUpdates = [];
let registryStore = { 'signup-page': { tabId: 55, ready: true } };

async function isTabAlive() { return false; }
async function getTabId() { return currentTab.id; }
async function ensureRunTabGroupForTab() {}
async function closeConflictingTabsForSource() {}
async function findExistingTabForSource() { return { id: 55, url: staleUrl }; }
async function registerTab() {}
async function ensureContentScriptReadyOnTab() {}
async function rememberSourceLastUrl() {}
async function getTabRegistry() { return JSON.parse(JSON.stringify(registryStore)); }
async function setState(updates) {
  stateUpdates.push(JSON.parse(JSON.stringify(updates)));
  if (updates.tabRegistry) registryStore = { ...updates.tabRegistry };
}

const chrome = {
  tabs: {
    async get() { return currentTab; },
    async update(tabId, updateInfo) {
      updateCalls.push({ tabId, updateInfo });
      currentTab = { ...currentTab, ...(updateInfo.url ? { url: updateInfo.url } : {}) };
      return currentTab;
    },
    async create(createInfo) { createCalls.push(createInfo); return { id: 99, url: createInfo.url }; },
    async reload() {},
    onUpdated: {
      addListener(listener) {
        if (fireComplete) setImmediate(() => listener(55, { status: 'complete' }));
      },
      removeListener() {},
    },
  },
  scripting: { async executeScript() {} },
};

const LOG_PREFIX = '[test]';
const warnLogs = [];
console = { log() {}, warn(...args) { warnLogs.push(args.join(' ')); }, error() {} };

${bundle}

return async function run() {
  const tabId = await reuseOrCreateTab('signup-page', targetUrl, activate ? { activate: true } : {});
  return {
    tabId,
    createCalls: [...createCalls],
    updateCalls: [...updateCalls],
    stateUpdates: [...stateUpdates],
    warnLogs: [...warnLogs],
  };
};
`)(staleUrl, targetUrl, activate, fireComplete)();
  }

  // C-1: URL 不同时应导航，shouldActivate=false → update 无 active:true
  const staleTabUrl = 'https://auth.openai.com/email-verification';
  const targetUrl = 'https://chatgpt.com/auth/login';
  const adopted = await buildAdoptApi({ staleUrl: staleTabUrl, targetUrl });
  assert.strictEqual(adopted.tabId, 55, 'C-1: 应复用认领的 tab（id=55），而非新建');
  assert.deepStrictEqual(adopted.createCalls, [], 'C-1: 认领 tab 后不应再新建 tab');
  assert.strictEqual(adopted.updateCalls.length, 1, 'C-1: 应恰好调用一次 chrome.tabs.update 做导航');
  assert.strictEqual(adopted.updateCalls[0].updateInfo.url, targetUrl, 'C-1: 应导航到目标 URL');
  assert.ok(!('active' in adopted.updateCalls[0].updateInfo), 'C-1: shouldActivate=false 时不应附带 active:true');
  // M1 回归：导航前 ready 应被置为 false
  const readyFalseUpdate = adopted.stateUpdates.find(
    (u) => u.tabRegistry?.['signup-page']?.ready === false
  );
  assert.ok(readyFalseUpdate, 'C-1: 导航前必须将 registry[signup-page].ready 置为 false（防止命令提前发送）');

  // C-2: shouldActivate=true → update 应携带 active:true
  const adoptedWithActivate = await buildAdoptApi({ staleUrl: staleTabUrl, targetUrl, activate: true });
  assert.strictEqual(adoptedWithActivate.updateCalls.length, 1, 'C-2: 应调用一次 update');
  assert.deepStrictEqual(
    adoptedWithActivate.updateCalls[0].updateInfo,
    { url: targetUrl, active: true },
    'C-2: shouldActivate=true 时 update 应同时附带 active:true'
  );

  // C-3: 等价 URL（hash 不同）不应触发导航
  const sameOriginWithHash = 'https://chatgpt.com/#stale-hash';
  const targetNormalized = 'https://chatgpt.com/';
  const adoptedSameUrl = await buildAdoptApi({ staleUrl: sameOriginWithHash, targetUrl: targetNormalized });
  assert.deepStrictEqual(adoptedSameUrl.updateCalls, [], 'C-3: 仅 hash 不同的 URL 不应触发导航（isSameLogicalUrl 应忽略 hash）');

  console.log('tab background open tests passed');
})().catch((error) => {
  originalConsole.error(error);
  process.exit(1);
});
