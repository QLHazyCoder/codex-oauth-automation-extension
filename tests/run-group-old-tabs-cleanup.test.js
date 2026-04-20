const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

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
  if (braceStart < 0) throw new Error(`missing body for function ${name}`);

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
  extractFunction('normalizeRunTabGroupId'),
  extractFunction('getTabRegistry'),
  extractFunction('parseUrlSafely'),
  extractFunction('isSignupPageHost'),
  extractFunction('is163MailHost'),
  extractFunction('isLocalCpaUrl'),
  extractFunction('isManagedRunGroupTab'),
  extractFunction('closeTabsFromPreviousRunGroups'),
].join('\n');

const api = new Function(`
let currentState = {
  tabRegistry: {
    'signup-page': { tabId: 1, ready: true },
    'gmail-mail': { tabId: 2, ready: true },
    'vps-panel': { tabId: 3, ready: true },
  },
  vpsUrl: 'http://127.0.0.1:8317/codex/dashboard',
};
let currentTabs = [
  { id: 1, groupId: 11, windowId: 99, url: 'https://auth.openai.com/authorize?old=1' },
  { id: 2, groupId: 11, windowId: 99, url: 'https://mail.google.com/mail/u/0/#inbox' },
  { id: 3, groupId: 11, windowId: 99, url: 'http://127.0.0.1:8317/codex/dashboard' },
  { id: 4, groupId: 11, windowId: 99, url: 'http://127.0.0.1:8317/codex/callback?code=abc&state=def' },
  { id: 5, groupId: 22, windowId: 99, url: 'https://auth.openai.com/authorize?current=1' },
  { id: 6, groupId: 11, windowId: 99, url: 'https://example.com/unrelated' },
  { id: 7, groupId: -1, windowId: 99, url: 'https://auth.openai.com/authorize?ungrouped=1' },
];
const removedBatches = [];
const logs = [];

async function getState() { return currentState; }
async function setState(updates) { currentState = { ...currentState, ...updates }; }
async function addLog(message) { logs.push(message); }

const chrome = {
  tabs: {
    async query() { return currentTabs; },
    async remove(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      removedBatches.push(list);
      currentTabs = currentTabs.filter((tab) => !list.includes(tab.id));
    },
  },
};

${bundle}

return {
  closeTabsFromPreviousRunGroups,
  snapshot() { return { currentState, currentTabs, removedBatches, logs }; },
};
`)();

(async () => {
  const closed = await api.closeTabsFromPreviousRunGroups(22, { targetGroupIds: [11] });
  const snapshot = api.snapshot();

  assert.strictEqual(closed, 4, '应关闭指定旧运行组中的所有相关标签页');
  assert.deepStrictEqual(snapshot.removedBatches, [[1, 2, 3, 4]], '旧组中的 signup/mail/vps/localhost 页都应被清理');
  assert.strictEqual(snapshot.currentTabs.some((tab) => tab.id === 5), true, '当前新组 tab 不应被误删');
  assert.strictEqual(snapshot.currentTabs.some((tab) => tab.id === 6), true, '旧组中不相关页面不应被误删');
  assert.strictEqual(snapshot.currentTabs.some((tab) => tab.id === 7), true, '未分组标签页不应被误删');
  assert.strictEqual(snapshot.currentState.tabRegistry['signup-page'], null, '旧组 signup-page registry 应被清空');
  assert.strictEqual(snapshot.currentState.tabRegistry['gmail-mail'], null, '旧组 gmail-mail registry 应被清空');
  assert.strictEqual(snapshot.currentState.tabRegistry['vps-panel'], null, '旧组 vps-panel registry 应被清空');

  console.log('run group old tabs cleanup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
