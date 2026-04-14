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
  extractFunction('clearStopRequest'),
  extractFunction('throwIfStopped'),
  extractFunction('isStopError'),
  extractFunction('isStepDoneStatus'),
  extractFunction('isRestartCurrentAttemptError'),
  extractFunction('getFirstUnfinishedStep'),
  extractFunction('hasSavedProgress'),
  extractFunction('getRunningSteps'),
  extractFunction('getAutoRunStatusPayload'),
  extractFunction('autoRunLoop'),
].join('\n');

const api = new Function(`
const STOP_ERROR_MESSAGE = 'Flow stopped.';
const DEFAULT_STATE = {
  stepStatuses: {
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
    6: 'pending',
    7: 'pending',
    8: 'pending',
    9: 'pending',
  },
};

let stopRequested = false;
let autoRunActive = false;
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;
let runCalls = 0;

const logs = [];
const broadcasts = [];
let currentState = {
  ...DEFAULT_STATE,
  stepStatuses: { ...DEFAULT_STATE.stepStatuses },
  vpsUrl: 'https://example.com/vps',
  vpsPassword: 'secret',
  customPassword: '',
  autoRunSkipFailures: false,
  autoRunFallbackThreadIntervalMinutes: 0,
  autoRunDelayEnabled: false,
  autoRunDelayMinutes: 30,
  autoStepDelaySeconds: null,
  mailProvider: '163',
  emailGenerator: 'duck',
  emailPrefix: 'demo',
  inbucketHost: '',
  inbucketMailbox: '',
  cloudflareDomain: '',
  cloudflareDomains: [],
  tabRegistry: {},
  sourceLastUrls: {},
};

async function getState() {
  return {
    ...currentState,
    stepStatuses: { ...(currentState.stepStatuses || {}) },
    tabRegistry: { ...(currentState.tabRegistry || {}) },
    sourceLastUrls: { ...(currentState.sourceLastUrls || {}) },
  };
}

async function setState(updates) {
  currentState = {
    ...currentState,
    ...updates,
    stepStatuses: updates.stepStatuses
      ? { ...updates.stepStatuses }
      : currentState.stepStatuses,
    tabRegistry: updates.tabRegistry
      ? { ...updates.tabRegistry }
      : currentState.tabRegistry,
    sourceLastUrls: updates.sourceLastUrls
      ? { ...updates.sourceLastUrls }
      : currentState.sourceLastUrls,
  };
}

async function resetState() {
  const prev = await getState();
  currentState = {
    ...DEFAULT_STATE,
    stepStatuses: { ...DEFAULT_STATE.stepStatuses },
    vpsUrl: prev.vpsUrl,
    vpsPassword: prev.vpsPassword,
    customPassword: prev.customPassword,
    autoRunSkipFailures: prev.autoRunSkipFailures,
    autoRunFallbackThreadIntervalMinutes: prev.autoRunFallbackThreadIntervalMinutes,
    autoRunDelayEnabled: prev.autoRunDelayEnabled,
    autoRunDelayMinutes: prev.autoRunDelayMinutes,
    autoStepDelaySeconds: prev.autoStepDelaySeconds,
    mailProvider: prev.mailProvider,
    emailGenerator: prev.emailGenerator,
    emailPrefix: prev.emailPrefix,
    inbucketHost: prev.inbucketHost,
    inbucketMailbox: prev.inbucketMailbox,
    cloudflareDomain: prev.cloudflareDomain,
    cloudflareDomains: [...(prev.cloudflareDomains || [])],
    tabRegistry: { ...(prev.tabRegistry || {}) },
    sourceLastUrls: { ...(prev.sourceLastUrls || {}) },
  };
}

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

async function broadcastAutoRunStatus(phase, payload = {}) {
  broadcasts.push({ phase, ...payload });
  await setState({
    ...getAutoRunStatusPayload(phase, payload),
  });
}

async function sleepWithStop() {}
async function waitForRunningStepsToFinish() {
  return getState();
}
async function broadcastStopToContentScripts() {}
function cancelPendingCommands() {}
function normalizeAutoRunFallbackThreadIntervalMinutes(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

const chrome = {
  runtime: {
    sendMessage() {
      return Promise.resolve();
    },
  },
};

async function runAutoSequenceFromStep() {
  runCalls += 1;
  const state = await getState();

  if (
    runCalls === 2
    && (Object.keys(state.tabRegistry || {}).length || Object.keys(state.sourceLastUrls || {}).length)
  ) {
    throw new Error('fresh auto-run attempt reused stale runtime tab context');
  }

  currentState = {
    ...currentState,
    stepStatuses: {
      1: 'completed',
      2: 'completed',
      3: 'completed',
      4: 'completed',
      5: 'completed',
      6: 'completed',
      7: 'completed',
      8: 'completed',
      9: 'completed',
    },
    tabRegistry: {
      'signup-page': { tabId: 88, ready: true },
    },
    sourceLastUrls: {
      'signup-page': 'https://auth.openai.com/authorize',
    },
  };
}

${bundle}

return {
  autoRunLoop,
  snapshot() {
    return {
      runCalls,
      autoRunActive,
      autoRunCurrentRun,
      autoRunTotalRuns,
      autoRunAttemptRun,
      currentState,
      logs,
      broadcasts,
    };
  },
};
`)();

(async () => {
  await api.autoRunLoop(2, { autoRunSkipFailures: false, mode: 'restart' });

  const snapshot = api.snapshot();
  assert.strictEqual(snapshot.runCalls, 2, 'auto-run should enter the second fresh attempt');
  assert.strictEqual(snapshot.currentState.autoRunPhase, 'complete', 'both runs should complete after reset');
  assert.strictEqual(snapshot.currentState.autoRunCurrentRun, 2, 'final run index should be recorded');
  assert.strictEqual(snapshot.autoRunActive, false, 'auto-run should exit active state after completion');

  console.log('auto-run fresh attempt reset tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
