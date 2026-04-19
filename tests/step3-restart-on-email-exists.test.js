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

async function testMaybeResumePendingStep3PasswordStageClearsPendingOnEmailExists() {
  const api = new Function(`
let step3PasswordStageResumeInFlight = false;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
const removedKeys = [];
const setCalls = [];

const chrome = {
  storage: {
    session: {
      async get() {
        return {
          [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
            email: 'foo@2925.com',
            status: 'waiting',
          },
        };
      },
      async set(value) {
        setCalls.push(value);
      },
      async remove(key) {
        removedKeys.push(key);
      },
    },
  },
};

async function getState() {
  return {
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  };
}

async function addLog() {}
async function sendToContentScript() {
  return { error: '当前邮箱已存在，需要重新开始新一轮。' };
}
function isRetryableContentScriptTransportError() { return false; }
function getErrorMessage(error) { return error?.message || String(error); }

${extractFunction('createStep3RestartFromStep2Error')}
${extractFunction('maybeResumePendingStep3PasswordStage')}

return {
  maybeResumePendingStep3PasswordStage,
  getRemovedKeys() {
    return [...removedKeys];
  },
  getSetCalls() {
    return [...setCalls];
  },
};
`)();

  await assert.rejects(
    api.maybeResumePendingStep3PasswordStage({
      email: 'foo@2925.com',
      password: 'pw',
      currentStep: 3,
      stepStatuses: { 3: 'running' },
    }),
    /当前邮箱已存在，需要重新开始新一轮/
  );

  assert.deepStrictEqual(
    api.getRemovedKeys(),
    ['pendingStep3PasswordStage'],
    '恢复密码页续跑时若检测到邮箱已存在，应清掉 pending 标记，避免后续继续卡在旧上下文'
  );
  assert.equal(
    api.getSetCalls()[0]?.pendingStep3PasswordStage?.status,
    'resuming',
    '开始恢复密码页时应先把 pending 标记为 resuming，避免 CONTENT_SCRIPT_READY 重入'
  );
}

async function testMaybeResumePendingStep3PasswordStageSkipsWhenAlreadyResuming() {
  const api = new Function(`
let step3PasswordStageResumeInFlight = false;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
let sendCalls = 0;

const chrome = {
  storage: {
    session: {
      async get() {
        return {
          [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
            email: 'foo@2925.com',
            status: 'resuming',
          },
        };
      },
      async set() {},
      async remove() {},
    },
  },
};

async function getState() {
  return {
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  };
}

async function addLog() {}
async function sendToContentScript() {
  sendCalls += 1;
  return { ok: true };
}
function isRetryableContentScriptTransportError() { return false; }
function getErrorMessage(error) { return error?.message || String(error); }

${extractFunction('createStep3RestartFromStep2Error')}
${extractFunction('maybeResumePendingStep3PasswordStage')}

return {
  maybeResumePendingStep3PasswordStage,
  getSendCalls() {
    return sendCalls;
  },
};
`)();

  await api.maybeResumePendingStep3PasswordStage({
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  });

  assert.equal(
    api.getSendCalls(),
    0,
    '若 pending 已处于 resuming 状态，后续 CONTENT_SCRIPT_READY 不应再次拉起新的 Step 3 恢复任务'
  );
}

async function testMaybeResumePendingStep3PasswordStageClearsPendingAfterSuccess() {
  const api = new Function(`
let step3PasswordStageResumeInFlight = false;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
const removedKeys = [];

const chrome = {
  storage: {
    session: {
      async get() {
        return {
          [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
            email: 'foo@2925.com',
            status: 'waiting',
          },
        };
      },
      async set() {},
      async remove(key) {
        removedKeys.push(key);
      },
    },
  },
};

async function getState() {
  return {
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  };
}

async function addLog() {}
async function sendToContentScript() {
  return { ok: true };
}
function isRetryableContentScriptTransportError() { return false; }
function getErrorMessage(error) { return error?.message || String(error); }

${extractFunction('createStep3RestartFromStep2Error')}
${extractFunction('maybeResumePendingStep3PasswordStage')}

return {
  maybeResumePendingStep3PasswordStage,
  getRemovedKeys() {
    return [...removedKeys];
  },
};
`)();

  await api.maybeResumePendingStep3PasswordStage({
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  });

  assert.deepStrictEqual(
    api.getRemovedKeys(),
    ['pendingStep3PasswordStage'],
    'Step 3 恢复成功后应立即清掉 pending，避免下一个 CONTENT_SCRIPT_READY 再次重入'
  );
}

async function testHandleStep3PasswordStageResumeFailureNotifiesWaiter() {
  const api = new Function(`
const events = [];

async function finalizeDeferredStepExecutionError(step, error) {
  events.push({ type: 'finalize', step, message: error.message });
}

function notifyStepError(step, message) {
  events.push({ type: 'notify', step, message });
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

${extractFunction('handleStep3PasswordStageResumeFailure')}

return {
  handleStep3PasswordStageResumeFailure,
  getEvents() {
    return [...events];
  },
};
`)();

  await api.handleStep3PasswordStageResumeFailure(new Error('当前邮箱已存在，需要重新开始新一轮。'));

  assert.deepStrictEqual(
    api.getEvents(),
    [
      { type: 'finalize', step: 3, message: '当前邮箱已存在，需要重新开始新一轮。' },
      { type: 'notify', step: 3, message: '当前邮箱已存在，需要重新开始新一轮。' },
    ],
    '密码页续跑失败后应同时落失败状态并通知 step 3 waiter，才能让外层流程触发整轮重开'
  );
}

async function testMaybeResumePendingStep3PasswordStageTurnsRetryableTransportIntoRestartFromStep2() {
  const api = new Function(`
let step3PasswordStageResumeInFlight = false;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
const removedKeys = [];
const logs = [];

const chrome = {
  storage: {
    session: {
      async get() {
        return {
          [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
            email: 'foo@2925.com',
            status: 'waiting',
          },
        };
      },
      async set() {},
      async remove(key) {
        removedKeys.push(key);
      },
    },
  },
};

async function getState() {
  return {
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  };
}

async function addLog(message, level) {
  logs.push({ message, level });
}

async function sendToContentScript() {
  throw new Error('Content script on signup-page did not respond in 30s. Try refreshing the tab and retry.');
}

function isRetryableContentScriptTransportError(error) {
  return /did not respond/i.test(error?.message || String(error));
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

// commit 1 引入的旁路：当 tab 已推进到 verification/后续阶段时，transport error 不再触发重启。
// 本测试覆盖的是「tab 未推进」这条路径，所以 stub 为 false。
async function hasSignupTabProgressedPastPassword() { return false; }
async function completeStepFromBackground() {}
function notifyStepComplete() {}

${extractFunction('createStep3RestartFromStep2Error')}
${extractFunction('isStep3RestartFromStep2Error')}
${extractFunction('maybeResumePendingStep3PasswordStage')}

return {
  maybeResumePendingStep3PasswordStage,
  isStep3RestartFromStep2Error,
  getRemovedKeys() {
    return [...removedKeys];
  },
  getLogs() {
    return [...logs];
  },
};
`)();

  let thrown = null;
  try {
    await api.maybeResumePendingStep3PasswordStage({
      email: 'foo@2925.com',
      password: 'pw',
      currentStep: 3,
      stepStatuses: { 3: 'running' },
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, '应抛出 Step 3 回到步骤 2 的重启错误');
  assert.equal(api.isStep3RestartFromStep2Error(thrown), true);
  assert.deepStrictEqual(
    api.getRemovedKeys(),
    ['pendingStep3PasswordStage'],
    '一旦触发“密码页内容脚本尚未就绪”告警并决定回到步骤 2，应清掉 pending 防止旧恢复链继续重入'
  );
  assert.ok(
    api.getLogs().some((entry) => entry.message.includes('密码页内容脚本尚未就绪') && entry.level === 'warn'),
    'retryable transport 触发时应保留用户可见告警，再立即回到步骤 2'
  );
}

// commit 1 regression: 当 transport error 发生但 signup-page tab 已经推进到 /email-verification
// 之类的阶段时，应该把 step 3 视为完成（显式 completeStepFromBackground(3, ...)），
// 而不是抛 STEP3_RESTART_FROM_STEP2 让主循环回退到步骤 2。
async function testMaybeResumePendingStep3PasswordStageSkipsRestartWhenTabProgressed() {
  const api = new Function(`
let step3PasswordStageResumeInFlight = false;
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
const removedKeys = [];
const logs = [];
const completeCalls = [];
const notifyCompleteCalls = [];

const chrome = {
  storage: {
    session: {
      async get() {
        return {
          [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
            email: 'foo@2925.com',
            status: 'waiting',
          },
        };
      },
      async set() {},
      async remove(key) {
        removedKeys.push(key);
      },
    },
  },
};

async function getState() {
  return {
    email: 'foo@2925.com',
    password: 'pw',
    currentStep: 3,
    stepStatuses: { 3: 'running' },
  };
}

async function addLog(message, level) {
  logs.push({ message, level });
}

async function sendToContentScript() {
  throw new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received');
}

function isRetryableContentScriptTransportError(error) {
  return /message channel closed|A listener indicated an asynchronous response/i.test(error?.message || String(error));
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

// 关键 mock：tab 已经推进到 email-verification 阶段。
async function hasSignupTabProgressedPastPassword() { return true; }
async function completeStepFromBackground(step, payload) {
  completeCalls.push({ step, payload });
}
function notifyStepComplete(step, payload) {
  notifyCompleteCalls.push({ step, payload });
}

${extractFunction('createStep3RestartFromStep2Error')}
${extractFunction('isStep3RestartFromStep2Error')}
${extractFunction('maybeResumePendingStep3PasswordStage')}

return {
  maybeResumePendingStep3PasswordStage,
  isStep3RestartFromStep2Error,
  getRemovedKeys() { return [...removedKeys]; },
  getLogs() { return [...logs]; },
  getCompleteCalls() { return [...completeCalls]; },
  getNotifyCompleteCalls() { return [...notifyCompleteCalls]; },
};
`)();

  let thrown = null;
  try {
    await api.maybeResumePendingStep3PasswordStage({
      email: 'foo@2925.com',
      password: 'pw',
      currentStep: 3,
      stepStatuses: { 3: 'running' },
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown, null, 'tab 已推进时不应抛出任何错误（否则外层会被误当成 step 3 失败）');
  assert.deepStrictEqual(
    api.getCompleteCalls().map((entry) => entry.step),
    [3],
    'tab 已推进时必须调用 completeStepFromBackground(3, ...) 让主循环推进到 step 4'
  );
  assert.equal(
    api.getCompleteCalls()[0].payload?.recoveredFromTransportError,
    true,
    'payload 应带 recoveredFromTransportError 标记，便于后续步骤或日志定位这是从 transport error 竞争中恢复的'
  );
  assert.ok(
    api.getRemovedKeys().includes('pendingStep3PasswordStage'),
    '恢复成功路径也必须清 pending key，避免 CONTENT_SCRIPT_READY 再次触发重入'
  );
  assert.ok(
    api.getLogs().some((entry) =>
      entry.message.includes('密码已提交且页面已推进到下一阶段') && entry.level === 'ok'
    ),
    '应留下一条 ok 级日志说明这是 transport error 竞争恢复，便于线上排查'
  );
}

(async () => {
  await testMaybeResumePendingStep3PasswordStageClearsPendingOnEmailExists();
  await testMaybeResumePendingStep3PasswordStageSkipsWhenAlreadyResuming();
  await testMaybeResumePendingStep3PasswordStageClearsPendingAfterSuccess();
  await testMaybeResumePendingStep3PasswordStageTurnsRetryableTransportIntoRestartFromStep2();
  await testMaybeResumePendingStep3PasswordStageSkipsRestartWhenTabProgressed();
  await testHandleStep3PasswordStageResumeFailureNotifiesWaiter();
  console.log('step3 restart on email exists tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
