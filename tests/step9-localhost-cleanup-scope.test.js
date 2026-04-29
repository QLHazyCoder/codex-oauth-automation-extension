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
  for (let i = start; i < source.length; i++) {
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

const helperBundle = [
  extractFunction(helperSource, 'normalizeEmailGenerator'),
  extractFunction(helperSource, 'normalizeMail2925Mode'),
  extractFunction(helperSource, 'getMail2925Mode'),
  extractFunction(helperSource, 'parseUrlSafely'),
  extractFunction(helperSource, 'isHotmailProvider'),
  extractFunction(helperSource, 'isCustomMailProvider'),
  extractFunction(helperSource, 'isGeneratedAliasProvider'),
  extractFunction(helperSource, 'shouldUseCustomRegistrationEmail'),
  extractFunction(helperSource, 'isLocalhostOAuthCallbackUrl'),
  extractFunction(helperSource, 'handleStepData'),
].join('\n');

const api = new Function('tabRuntimeSource', `
const self = {};
const HOTMAIL_PROVIDER = 'hotmail-api';
const CLOUDFLARE_TEMP_EMAIL_PROVIDER = 'cloudflare-temp-email';
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
const GMAIL_PROVIDER = 'gmail';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
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

async function setEmailStateSilently(email) {
  currentState = { ...currentState, email };
}

function isLuckmailProvider() {
  return false;
}

async function patchHotmailAccount() {}
async function clearLuckmailRuntimeState() {}
function broadcastDataUpdate() {}
async function addLog(message) {
  logMessages.push(message);
}
async function finalizePhoneActivationAfterSuccessfulFlow() {}
async function finalizeIcloudAliasAfterSuccessfulFlow() {}
function matchesSourceUrlFamily() {
  return false;
}
function getSourceLabel(source) {
  return source;
}
function isRetryableContentScriptTransportError() {
  return false;
}
function throwIfStopped() {}
const LOG_PREFIX = '[test:bg]';
const STOP_ERROR_MESSAGE = 'Flow stopped.';

${helperBundle}
${tabRuntimeSource}

const tabRuntime = self.MultiPageBackgroundTabRuntime.createTabRuntime({
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
const closeLocalhostCallbackTabs = tabRuntime.closeLocalhostCallbackTabs;
const isLocalhostOAuthCallbackTabMatch = tabRuntime.isLocalhostOAuthCallbackTabMatch;
const buildLocalhostCleanupPrefix = tabRuntime.buildLocalhostCleanupPrefix;
const closeTabsByUrlPrefix = tabRuntime.closeTabsByUrlPrefix;

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
`)(tabRuntimeSource);

(async () => {
  const codexCallbackUrl = 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz';
  const authCallbackUrl = 'http://localhost:1455/auth/callback?code=def&state=uvw';

  assert.strictEqual(api.isLocalhostOAuthCallbackTabMatch(codexCallbackUrl, codexCallbackUrl), true);
  assert.strictEqual(api.isLocalhostOAuthCallbackTabMatch(codexCallbackUrl, authCallbackUrl), false);
  assert.strictEqual(api.isLocalhostOAuthCallbackTabMatch(authCallbackUrl, codexCallbackUrl), false);

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

  await api.handleStepData(10, { localhostUrl: codexCallbackUrl });
  let snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [[1], [2]]);
  assert.strictEqual(snapshot.currentState.tabRegistry['signup-page'], null);
  assert.deepStrictEqual(snapshot.currentState.tabRegistry['vps-panel'], { tabId: 99, ready: true });

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
  assert.strictEqual(closedCount, 1);
  assert.deepStrictEqual(snapshot.removedBatches, [[4]]);
  assert.strictEqual(snapshot.logMessages.length, 1);

  console.log('step9 localhost cleanup scope tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
