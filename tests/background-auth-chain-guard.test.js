const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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

test('throwIfStopped rethrows an explicit stop error even when stopRequested has been cleared', () => {
  const api = new Function(`
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
let stopRequested = false;
${extractFunction('isStopError')}
${extractFunction('throwIfStopped')}
return {
  run(error) {
    throwIfStopped(error);
  },
};
`)();

  assert.throws(
    () => api.run(new Error('流程已被用户停止。')),
    /流程已被用户停止。/
  );
});

test('executeStep reuses the active top-level auth chain instead of starting a duplicate step', async () => {
  const api = new Function(`
const LOG_PREFIX = '[test]';
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const BROWSER_SWITCH_REQUIRED_ERROR_PREFIX = 'BROWSER_SWITCH_REQUIRED::';
const AUTH_CHAIN_STEP_IDS = new Set([7, 8, 9, 10]);
let activeTopLevelAuthChainExecution = null;
let stopRequested = false;
let releaseStep8 = null;
const events = {
  logs: [],
  statusCalls: [],
  registryCalls: [],
};
const state = {
  stepStatuses: {},
};

async function addLog(message, level = 'info') {
  events.logs.push({ message, level });
}
async function setStepStatus(step, status) {
  state.stepStatuses[step] = status;
  events.statusCalls.push({ step, status });
}
async function humanStepDelay() {}
async function getState() {
  return {
    flowStartTime: null,
    stepStatuses: { ...state.stepStatuses },
  };
}
function getErrorMessage(error) {
  return error?.message || String(error || '');
}
async function appendManualAccountRunRecordIfNeeded() {}
function isTerminalSecurityBlockedError() {
  return false;
}
async function handleCloudflareSecurityBlocked() {}
function isBrowserSwitchRequiredError() {
  return false;
}
async function handleBrowserSwitchRequired() {}
function doesStepUseCompletionSignal() {
  return false;
}
function isRetryableContentScriptTransportError() {
  return false;
}
const stepRegistry = {
  async executeStep(step) {
    events.registryCalls.push(step);
    if (step === 8) {
      await new Promise((resolve) => {
        releaseStep8 = resolve;
      });
    }
  },
};

${extractFunction('isStopError')}
${extractFunction('throwIfStopped')}
${extractFunction('isAuthChainStep')}
${extractFunction('acquireTopLevelAuthChainExecution')}
${extractFunction('executeStep')}

return {
  executeStep,
  releaseStep8() {
    if (releaseStep8) {
      releaseStep8();
    }
  },
  snapshot() {
    return events;
  },
};
`)();

  const firstRun = api.executeStep(8);
  await new Promise((resolve) => setImmediate(resolve));
  const duplicateRun = api.executeStep(7);
  await new Promise((resolve) => setImmediate(resolve));
  api.releaseStep8();

  await firstRun;
  await duplicateRun;

  const events = api.snapshot();
  assert.deepStrictEqual(events.registryCalls, [8]);
  assert.deepStrictEqual(events.statusCalls, [
    { step: 8, status: 'running' },
  ]);
  assert.ok(events.logs.some(({ message }) => /复用当前授权链/.test(message)));
});

test('executeStep stops flow when browser-switch-required error is raised', async () => {
  const api = new Function(`
const LOG_PREFIX = '[test]';
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const BROWSER_SWITCH_REQUIRED_ERROR_PREFIX = 'BROWSER_SWITCH_REQUIRED::';
const AUTH_CHAIN_STEP_IDS = new Set([7, 8, 9, 10]);
let activeTopLevelAuthChainExecution = null;
let stopRequested = false;
const events = {
  logs: [],
  statusCalls: [],
  stopRequests: [],
  appendRecords: [],
};

async function addLog(message, level = 'info') {
  events.logs.push({ message, level });
}
async function setStepStatus(step, status) {
  events.statusCalls.push({ step, status });
}
async function humanStepDelay() {}
async function getState() {
  return {
    flowStartTime: null,
    stepStatuses: {},
  };
}
function getErrorMessage(error) {
  return error?.message || String(error || '');
}
async function appendManualAccountRunRecordIfNeeded(status, _state, reason) {
  events.appendRecords.push({ status, reason });
}
function isTerminalSecurityBlockedError() {
  return false;
}
async function handleCloudflareSecurityBlocked() {}
async function requestStop(options = {}) {
  events.stopRequests.push(options);
}
function doesStepUseCompletionSignal() {
  return false;
}
function isRetryableContentScriptTransportError() {
  return false;
}
const stepRegistry = {
  async executeStep() {
    throw new Error('BROWSER_SWITCH_REQUIRED::请更换浏览器进行注册登录。');
  },
};

${extractFunction('isStopError')}
${extractFunction('throwIfStopped')}
${extractFunction('isAuthChainStep')}
${extractFunction('acquireTopLevelAuthChainExecution')}
${extractFunction('isBrowserSwitchRequiredError')}
${extractFunction('getBrowserSwitchRequiredMessage')}
${extractFunction('handleBrowserSwitchRequired')}
${extractFunction('executeStep')}

return {
  executeStep,
  snapshot() {
    return events;
  },
};
`)();

  await assert.rejects(
    () => api.executeStep(10),
    /流程已被用户停止。/
  );

  const events = api.snapshot();
  assert.deepStrictEqual(events.stopRequests, [
    { logMessage: '请更换浏览器进行注册登录。' },
  ]);
  assert.deepStrictEqual(events.statusCalls, [
    { step: 10, status: 'running' },
  ]);
  assert.equal(
    events.logs.some(({ message }) => /步骤 10 失败/.test(message)),
    false,
    'browser-switch-required error should stop the flow before generic failed logging'
  );
});

test('oauth timeout budget ignores stale deadlines from an old oauth url', async () => {
  const api = new Function(`
const LOG_PREFIX = '[test]';
const OAUTH_FLOW_TIMEOUT_MS = 5 * 60 * 1000;
${extractFunction('normalizeOAuthFlowDeadlineAt')}
${extractFunction('normalizeOAuthFlowSourceUrl')}
${extractFunction('getOAuthFlowRemainingMs')}
${extractFunction('getOAuthFlowStepTimeoutMs')}
return {
  getOAuthFlowStepTimeoutMs,
};
`)();

  const timeoutMs = await api.getOAuthFlowStepTimeoutMs(15000, {
    step: 8,
    actionLabel: '登录验证码流程',
    state: {
      oauthUrl: 'https://oauth.example/current',
      oauthFlowDeadlineAt: Date.now() + 1200,
      oauthFlowDeadlineSourceUrl: 'https://oauth.example/old',
    },
  });

  assert.equal(timeoutMs, 15000);
});
