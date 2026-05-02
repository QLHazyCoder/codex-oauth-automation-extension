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
  extractFunction('isAddPhoneAuthFailure'),
  extractFunction('isAddPhoneAuthUrl'),
  extractFunction('isAddPhoneAuthState'),
  extractFunction('getPostStep6AutoRestartDecision'),
  extractFunction('runAutoSequenceFromStep'),
].join('\n');

function createHarness(options = {}) {
  const {
    startStep = 7,
    failureStep = 10,
    failureBudget = 1,
    failureMessage = '认证失败: Request failed with status code 502',
    authState = { state: 'password_page', url: 'https://auth.openai.com/log-in' },
    customState = {},
  } = options;

  return new Function(`
const AUTO_STEP_DELAYS = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
const LAST_STEP_ID = 10;
const FINAL_OAUTH_CHAIN_START_STEP = 7;
const LOG_PREFIX = '[test]';
const chrome = {
  tabs: {
    update: async () => {},
  },
};

let remainingFailures = ${JSON.stringify(failureBudget)};
const events = {
  steps: [],
  logs: [],
  invalidations: [],
};

async function addLog(message, level = 'info') {
  events.logs.push({ message, level });
}

async function ensureAutoEmailReady() {}
async function broadcastAutoRunStatus() {}
async function getState() {
  return {
    stepStatuses: { 3: 'completed' },
    mailProvider: '163',
    ...${JSON.stringify(customState)},
  };
}
function getStepIdsForState() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
}
function getStepDefinitionForState(step) {
  const map = {
    1: { key: 'open-signup' },
    2: { key: 'prepare-email' },
    3: { key: 'fill-password' },
    4: { key: 'verify-email' },
    5: { key: 'profile-basic' },
    6: { key: 'profile-finish' },
    7: { key: 'auth-login' },
    8: { key: 'auth-email-code' },
    9: { key: 'confirm-oauth' },
    10: { key: 'platform-verify' },
  };
  return map[Number(step)] || null;
}
function getStepExecutionKeyForState(step, state = {}) {
  return String(getStepDefinitionForState(step, state)?.key || '').trim();
}
function isStopError(error) {
  return (error?.message || String(error || '')) === '流程已被用户停止。';
}
function isStepDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}
async function executeStepAndWait(step) {
  events.steps.push(step);
  if (step === ${JSON.stringify(failureStep)} && remainingFailures > 0) {
    remainingFailures -= 1;
    throw new Error(${JSON.stringify(failureMessage)});
  }
}
async function getTabId() {
  return 1;
}
async function invalidateDownstreamAfterStepRestart(step, options = {}) {
  events.invalidations.push({ step, options });
}
function getLoginAuthStateLabel(state) {
  return state || 'unknown';
}
function getErrorMessage(error) {
  return error?.message || String(error || '');
}
async function getLoginAuthStateFromContent() {
  return ${JSON.stringify(authState)};
}

${bundle}

return {
  async run() {
    await runAutoSequenceFromStep(${JSON.stringify(startStep)}, {
      targetRun: 1,
      totalRuns: 1,
      attemptRuns: 1,
      continued: false,
    });
    return events;
  },
  async runAndCaptureError() {
    try {
      await runAutoSequenceFromStep(${JSON.stringify(startStep)}, {
        targetRun: 1,
        totalRuns: 1,
        attemptRuns: 1,
        continued: false,
      });
      return null;
    } catch (error) {
      return { error, events };
    }
  },
};
`)();
}

test('auto-run keeps restarting from step 7 after post-login failures without a hard cap', async () => {
  const harness = createHarness({
    failureStep: 10,
    failureBudget: 6,
    failureMessage: '认证失败: Request failed with status code 502',
    authState: { state: 'password_page', url: 'https://auth.openai.com/log-in' },
  });

  const events = await harness.run();

  assert.equal(events.invalidations.length, 6);
  assert.deepStrictEqual(
    events.steps,
    [
      7, 8, 9, 10,
      7, 8, 9, 10,
      7, 8, 9, 10,
      7, 8, 9, 10,
      7, 8, 9, 10,
      7, 8, 9, 10,
      7, 8, 9, 10,
    ]
  );
  assert.ok(events.logs.some(({ message }) => /回到步骤 7 重新开始授权流程/.test(message)));
});

test('auto-run stops restarting once add-phone is detected', async () => {
  const harness = createHarness({
    failureStep: 7,
    failureBudget: 1,
    failureMessage: '当前页面已进入手机号页面。URL: https://auth.openai.com/add-phone',
    authState: { state: 'add_phone_page', url: 'https://auth.openai.com/add-phone' },
  });

  const result = await harness.runAndCaptureError();

  assert.ok(result?.error);
  assert.equal(result.events.invalidations.length, 0);
  assert.deepStrictEqual(result.events.steps, [7]);
  assert.ok(result.events.logs.some(({ message }) => /进入 add-phone/.test(message)));
});

test('auto-run stops restarting on generic phone-page failure messages even without add-phone url', async () => {
  const harness = createHarness({
    failureStep: 9,
    failureBudget: 1,
    failureMessage: '步骤 8：当前认证页进入手机号页面，当前流程无法继续自动授权。',
    authState: { state: 'password_page', url: 'https://auth.openai.com/log-in' },
  });

  const result = await harness.runAndCaptureError();

  assert.ok(result?.error);
  assert.equal(result.events.invalidations.length, 0);
  assert.deepStrictEqual(result.events.steps, [7, 8, 9]);
  assert.ok(!result.events.logs.some(({ message }) => /回到步骤 7 重新开始授权流程/.test(message)));
});

test('auto-run does not restart step 7 when phone verification exhausted replacement attempts in add-phone flow', async () => {
  const harness = createHarness({
    failureStep: 9,
    failureBudget: 1,
    failureMessage: 'Step 9: phone verification did not succeed after 3 number replacements. Last reason: sms_timeout_after_resend.',
    authState: { state: 'add_phone_page', url: 'https://auth.openai.com/add-phone' },
  });

  const result = await harness.runAndCaptureError();

  assert.ok(result?.error);
  assert.equal(result.events.invalidations.length, 0);
  assert.deepStrictEqual(result.events.steps, [7, 8, 9]);
  assert.ok(!result.events.logs.some(({ message }) => /回到步骤 7 重新开始授权流程/.test(message)));
});

test('auto-run stop errors after step 7 are rethrown immediately instead of restarting', async () => {
  const harness = createHarness({
    failureStep: 9,
    failureBudget: 1,
    failureMessage: '流程已被用户停止。',
    authState: { state: 'password_page', url: 'https://auth.openai.com/log-in' },
  });

  const result = await harness.runAndCaptureError();

  assert.equal(result?.error?.message, '流程已被用户停止。');
  assert.equal(result.events.invalidations.length, 0);
  assert.deepStrictEqual(result.events.steps, [7, 8, 9]);
  assert.ok(!result.events.logs.some(({ message }) => /回到步骤 7 重新开始授权流程/.test(message)));
});

test('auto-run restarts from confirm-oauth step after transient step10 token_exchange_user_error', async () => {
  const harness = createHarness({
    failureStep: 10,
    failureBudget: 1,
    failureMessage: 'token exchange failed: status 400, body: { "error": { "message": "Invalid request. Please try again later.", "type": "invalid_request_error", "param": null, "code": "token_exchange_user_error" } }',
    authState: { state: 'oauth_consent_page', url: 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent' },
    customState: {
      panelMode: 'sub2api',
      stepStatuses: { 3: 'completed' },
      stepsVersion: 'ultra2.0',
      visibleStep: 10,
      contributionMode: false,
    },
  });

  const events = await harness.run();

  assert.deepStrictEqual(events.steps, [7, 8, 9, 10, 9, 10]);
  assert.equal(events.invalidations.length, 1);
  assert.deepStrictEqual(events.invalidations[0], {
    step: 8,
    options: {
      logLabel: '步骤 10 报错后准备回到步骤 9 重试（第 1 次重开）',
    },
  });
  assert.ok(events.logs.some(({ message }) => /回到步骤 9 重新开始授权流程/.test(message)));
});
