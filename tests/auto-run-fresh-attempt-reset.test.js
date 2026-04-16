const assert = require('assert');
const fs = require('fs');

const helperSource = fs.readFileSync('background.js', 'utf8');
const autoRunModuleSource = fs.readFileSync('background/auto-run-controller.js', 'utf8');

function extractFunction(source, name) {
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

const helperBundle = [
  extractFunction(helperSource, 'clearStopRequest'),
  extractFunction(helperSource, 'throwIfStopped'),
  extractFunction(helperSource, 'isStopError'),
  extractFunction(helperSource, 'isStepDoneStatus'),
  extractFunction(helperSource, 'isRestartCurrentAttemptError'),
  extractFunction(helperSource, 'getFirstUnfinishedStep'),
  extractFunction(helperSource, 'hasSavedProgress'),
  extractFunction(helperSource, 'getRunningSteps'),
  extractFunction(helperSource, 'getAutoRunStatusPayload'),
].join('\n');

const api = new Function('autoRunModuleSource', `
const self = {};
const STOP_ERROR_MESSAGE = 'Flow stopped.';
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_RUN_RETRY_DELAY_MS = 3000;
const AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS = 'between_rounds';
const AUTO_RUN_TIMER_KIND_BEFORE_RETRY = 'before_retry';
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
async function persistAutoRunTimerPlan() {}
async function launchAutoRunTimerPlan() { return false; }
function getPendingAutoRunTimerPlan() { return null; }
function getErrorMessage(error) { return error?.message || String(error || ''); }
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

${helperBundle}
${autoRunModuleSource}

const runtime = {
  state: {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 1,
    autoRunAttemptRun: 0,
  },
  get() {
    return { ...this.state };
  },
  set(updates = {}) {
    this.state = { ...this.state, ...updates };
  },
};

const controller = self.MultiPageBackgroundAutoRunController.createAutoRunController({
  addLog,
  AUTO_RUN_MAX_RETRIES_PER_ROUND,
  AUTO_RUN_RETRY_DELAY_MS,
  AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
  AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
  broadcastAutoRunStatus,
  broadcastStopToContentScripts,
  cancelPendingCommands,
  clearStopRequest,
  getAutoRunStatusPayload,
  getErrorMessage,
  getFirstUnfinishedStep,
  getPendingAutoRunTimerPlan,
  getRunningSteps,
  getState,
  getStopRequested: () => stopRequested,
  hasSavedProgress,
  isRestartCurrentAttemptError,
  isStopError,
  launchAutoRunTimerPlan,
  normalizeAutoRunFallbackThreadIntervalMinutes,
  persistAutoRunTimerPlan,
  resetState,
  runAutoSequenceFromStep,
  runtime,
  setState,
  sleepWithStop,
  waitForRunningStepsToFinish,
  throwIfStopped,
  chrome,
});

return {
  autoRunLoop: controller.autoRunLoop,
  snapshot() {
    return {
      runCalls,
      autoRunActive: runtime.state.autoRunActive,
      autoRunCurrentRun: runtime.state.autoRunCurrentRun,
      autoRunTotalRuns: runtime.state.autoRunTotalRuns,
      autoRunAttemptRun: runtime.state.autoRunAttemptRun,
      currentState,
      logs,
      broadcasts,
    };
  },
};
`)(autoRunModuleSource);

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
