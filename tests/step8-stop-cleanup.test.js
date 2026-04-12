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
  extractFunction('throwIfStopped'),
  extractFunction('cleanupStep8NavigationListeners'),
  extractFunction('rejectPendingStep8'),
  extractFunction('throwIfStep8SettledOrStopped'),
  extractFunction('requestStop'),
  extractFunction('executeStep8'),
].join('\n');

const api = new Function(`
let stopRequested = false;
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
let webNavListener = null;
let webNavCommittedListener = null;
let step8TabUpdatedListener = null;
let step8PendingReject = null;
let autoRunActive = true;
let autoRunCurrentRun = 2;
let autoRunTotalRuns = 3;
let autoRunAttemptRun = 4;

const added = {
  beforeNavigate: 0,
  committed: 0,
  tabUpdated: 0,
};
const removed = {
  beforeNavigate: 0,
  committed: 0,
  tabUpdated: 0,
};
const sentMessages = [];
let clickCount = 0;
let resolveTabId = null;

const chrome = {
  webNavigation: {
    onBeforeNavigate: {
      addListener(listener) {
        added.beforeNavigate += 1;
      },
      removeListener(listener) {
        removed.beforeNavigate += 1;
      },
    },
    onCommitted: {
      addListener(listener) {
        added.committed += 1;
      },
      removeListener(listener) {
        removed.committed += 1;
      },
    },
  },
  tabs: {
    onUpdated: {
      addListener(listener) {
        added.tabUpdated += 1;
      },
      removeListener(listener) {
        removed.tabUpdated += 1;
      },
    },
    async update() {},
  },
};

const stepWaiters = new Map();
let resumeWaiter = null;

function cancelPendingCommands() {}
async function addLog() {}
async function broadcastStopToContentScripts() {}
async function markRunningStepsStopped() {}
async function broadcastAutoRunStatus() {}
function getStep8CallbackUrlFromNavigation() { return ''; }
function getStep8CallbackUrlFromTabUpdate() { return ''; }
async function completeStepFromBackground() {}
async function getTabId() {
  return await new Promise((resolve) => {
    resolveTabId = resolve;
  });
}
async function reuseOrCreateTab() {
  return 999;
}
async function isTabAlive() {
  return true;
}
async function sendToContentScript(source, message) {
  sentMessages.push({ source, type: message.type });
  return { rect: { centerX: 10, centerY: 20 } };
}
async function clickWithDebugger() {
  clickCount += 1;
}

${bundle}

return {
  executeStep8,
  requestStop,
  resolveTabId(tabId) {
    if (!resolveTabId) {
      throw new Error('resolveTabId is not ready');
    }
    resolveTabId(tabId);
  },
  snapshot() {
    return {
      stopRequested,
      webNavListener,
      webNavCommittedListener,
      step8TabUpdatedListener,
      step8PendingReject,
      added,
      removed,
      sentMessages,
      clickCount,
      autoRunActive,
    };
  },
};
`)();

(async () => {
  const step8Promise = api.executeStep8({ oauthUrl: 'https://example.com/oauth' });
  const settledStep8Promise = step8Promise.catch((err) => err);

  await new Promise((resolve) => setImmediate(resolve));
  await api.requestStop();
  await new Promise((resolve) => setImmediate(resolve));
  api.resolveTabId(123);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const error = await settledStep8Promise;
  const state = api.snapshot();

  assert.strictEqual(error?.message, '流程已被用户停止。', 'Stop 后 Step 8 promise 应被拒绝为停止错误');
  assert.deepStrictEqual(
    state.added,
    { beforeNavigate: 0, committed: 0, tabUpdated: 0 },
    'Stop 先发生时，不应再注册 Step 8 监听'
  );
  assert.strictEqual(state.sentMessages.length, 0, 'Stop 后不应再发送 STEP8_FIND_AND_CLICK 命令');
  assert.strictEqual(state.clickCount, 0, 'Stop 后不应再触发 debugger 点击');
  assert.strictEqual(state.webNavListener, null, 'Stop 后 onBeforeNavigate 引用应为空');
  assert.strictEqual(state.webNavCommittedListener, null, 'Stop 后 onCommitted 引用应为空');
  assert.strictEqual(state.step8TabUpdatedListener, null, 'Stop 后 tabs.onUpdated 引用应为空');
  assert.strictEqual(state.step8PendingReject, null, 'Stop 后不应保留 Step 8 挂起 reject');

  console.log('step8 stop cleanup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
