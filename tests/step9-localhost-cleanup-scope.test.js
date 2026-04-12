const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i++) {
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
  for (; end < source.length; end++) {
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
  extractFunction('getTabRegistry'),
  extractFunction('parseUrlSafely'),
  extractFunction('isLocalhostOAuthCallbackUrl'),
  extractFunction('isLocalhostOAuthCallbackTabMatch'),
  extractFunction('closeLocalhostCallbackTabs'),
  extractFunction('handleStepData'),
].join('\n');

const api = new Function(`
let currentState = {
  tabRegistry: {
    'signup-page': { tabId: 1, ready: true },
    'vps-panel': { tabId: 99, ready: true },
  },
};
let currentTabs = [];
const removedBatches = [];
const logMessages = [];

const chrome = {
  tabs: {
    async query() {
      return currentTabs;
    },
    async remove(ids) {
      removedBatches.push(ids);
      currentTabs = currentTabs.filter((tab) => !ids.includes(tab.id));
    },
  },
};

async function getState() {
  return currentState;
}

async function setState(updates) {
  currentState = { ...currentState, ...updates };
}

async function setEmailState(email) {
  currentState = { ...currentState, email };
}

function broadcastDataUpdate() {}

async function addLog(message) {
  logMessages.push(message);
}

${bundle}

return {
  handleStepData,
  closeLocalhostCallbackTabs,
  isLocalhostOAuthCallbackTabMatch,
  reset({ tabs, tabRegistry }) {
    currentTabs = tabs;
    removedBatches.length = 0;
    logMessages.length = 0;
    currentState = {
      tabRegistry: tabRegistry || {},
    };
  },
  snapshot() {
    return {
      currentState,
      removedBatches,
      logMessages,
    };
  },
};
`)();

(async () => {
  const codexCallbackUrl = 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz';
  const authCallbackUrl = 'http://localhost:1455/auth/callback?code=def&state=uvw';

  assert.strictEqual(
    api.isLocalhostOAuthCallbackTabMatch(codexCallbackUrl, codexCallbackUrl),
    true,
    '真实 callback 页应命中清理规则'
  );
  assert.strictEqual(
    api.isLocalhostOAuthCallbackTabMatch(codexCallbackUrl, authCallbackUrl),
    false,
    '/codex/callback 不应误伤 /auth/callback'
  );
  assert.strictEqual(
    api.isLocalhostOAuthCallbackTabMatch(authCallbackUrl, codexCallbackUrl),
    false,
    '/auth/callback 不应误伤 /codex/callback'
  );

  api.reset({
    tabs: [
      { id: 1, url: codexCallbackUrl },
      { id: 2, url: 'http://127.0.0.1:8317/codex/dashboard' },
      { id: 3, url: 'http://127.0.0.1:8317/codex/callback?code=other&state=xyz' },
      { id: 4, url: authCallbackUrl },
    ],
    tabRegistry: {
      'signup-page': { tabId: 1, ready: true },
      'vps-panel': { tabId: 99, ready: true },
    },
  });

  await api.handleStepData(9, { localhostUrl: codexCallbackUrl });
  let snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [[1]], 'handleStepData(9) 只应关闭当前 callback 页');
  assert.strictEqual(
    snapshot.currentState.tabRegistry['signup-page'],
    null,
    '关闭 callback 页后应同步清理 signup-page 的 tabRegistry'
  );
  assert.deepStrictEqual(
    snapshot.currentState.tabRegistry['vps-panel'],
    { tabId: 99, ready: true },
    '不相关的 tabRegistry 项不应被误清理'
  );

  api.reset({
    tabs: [
      { id: 1, url: codexCallbackUrl },
      { id: 4, url: authCallbackUrl },
      { id: 5, url: 'http://localhost:1455/auth/dashboard' },
    ],
    tabRegistry: {},
  });

  const closedCount = await api.closeLocalhostCallbackTabs(authCallbackUrl);
  snapshot = api.snapshot();
  assert.strictEqual(closedCount, 1, 'auth callback 也应只关闭当前命中的 callback 页');
  assert.deepStrictEqual(snapshot.removedBatches, [[4]], '不应按 /auth 前缀批量清理页面');
  assert.strictEqual(snapshot.logMessages.length, 1, '发生清理时应记录一条日志');

  console.log('step9 localhost cleanup scope tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
