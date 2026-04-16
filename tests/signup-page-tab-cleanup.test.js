const assert = require('assert');
const fs = require('fs');

const helperSource = fs.readFileSync('background.js', 'utf8');
const tabRuntimeSource = fs.readFileSync('background/tab-runtime.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
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

const helperBundle = [
  extractFunction(helperSource, 'parseUrlSafely'),
  extractFunction(helperSource, 'isSignupPageHost'),
  extractFunction(helperSource, 'isSignupEntryHost'),
  extractFunction(helperSource, 'matchesSourceUrlFamily'),
].join('\n');

const api = new Function('tabRuntimeSource', `
const self = {};
let currentState = {
  sourceLastUrls: {},
  tabRegistry: {},
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

async function addLog(message, level = 'info') {
  logMessages.push({ message, level });
}

function getSourceLabel(source) {
  return source;
}

function isLocalhostOAuthCallbackUrl() {
  return false;
}

function isRetryableContentScriptTransportError() {
  return false;
}

function throwIfStopped() {}
const LOG_PREFIX = '[test:bg]';
const STOP_ERROR_MESSAGE = 'Flow stopped.';

${helperBundle}
${tabRuntimeSource}

const runtime = self.MultiPageBackgroundTabRuntime.createTabRuntime({
  addLog,
  chrome,
  getSourceLabel,
  getState,
  isLocalhostOAuthCallbackUrl,
  isRetryableContentScriptTransportError,
  LOG_PREFIX,
  matchesSourceUrlFamily,
  setState,
  STOP_ERROR_MESSAGE,
  throwIfStopped,
});

return {
  matchesSourceUrlFamily,
  closeConflictingTabsForSource: runtime.closeConflictingTabsForSource,
  reset({ tabs, state }) {
    currentTabs = tabs;
    removedBatches.length = 0;
    logMessages.length = 0;
    currentState = {
      sourceLastUrls: {},
      tabRegistry: {},
      ...(state || {}),
    };
  },
  snapshot() {
    return {
      currentState,
      currentTabs,
      removedBatches,
      logMessages,
    };
  },
};
`)(tabRuntimeSource);

(async () => {
  assert.strictEqual(
    api.matchesSourceUrlFamily('signup-page', 'https://chatgpt.com/', 'https://chatgpt.com/'),
    true,
    'signup-page family should include chatgpt.com'
  );
  assert.strictEqual(
    api.matchesSourceUrlFamily('signup-page', 'https://chat.openai.com/', 'https://auth.openai.com/authorize'),
    true,
    'signup-page family should include legacy chat.openai.com'
  );

  api.reset({
    tabs: [
      { id: 1, url: 'https://chatgpt.com/' },
      { id: 2, url: 'https://chat.openai.com/' },
      { id: 3, url: 'https://auth.openai.com/authorize?client_id=test' },
      { id: 4, url: 'https://example.com/' },
    ],
    state: {
      sourceLastUrls: {
        'signup-page': 'https://chatgpt.com/',
      },
      tabRegistry: {
        'signup-page': { tabId: 3, ready: true },
      },
    },
  });

  await api.closeConflictingTabsForSource('signup-page', 'https://auth.openai.com/authorize', {
    excludeTabIds: [3],
  });

  let snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [[1, 2]]);
  assert.deepStrictEqual(snapshot.currentTabs, [
    { id: 3, url: 'https://auth.openai.com/authorize?client_id=test' },
    { id: 4, url: 'https://example.com/' },
  ]);

  api.reset({
    tabs: [
      { id: 11, url: 'https://chatgpt.com/' },
      { id: 12, url: 'https://auth.openai.com/authorize?client_id=test' },
    ],
    state: {
      sourceLastUrls: {
        'signup-page': 'https://auth.openai.com/authorize?client_id=test',
      },
      tabRegistry: {
        'signup-page': { tabId: 11, ready: true },
      },
    },
  });

  await api.closeConflictingTabsForSource('signup-page', 'https://chatgpt.com/');

  snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [[11, 12]]);
  assert.strictEqual(snapshot.currentState.tabRegistry['signup-page'], null);

  console.log('signup page tab cleanup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
