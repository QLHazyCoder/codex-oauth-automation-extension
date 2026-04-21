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

async function testRecoversStep5WhenRuntimeAlreadyOnChatGpt() {
const api = new Function(`
const logs = [];
const completions = [];

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

async function completeStepFromBackground(step, payload) {
  completions.push({ step, payload });
}

async function getTabId() {
  return null;
}

function throwIfStopped() {}
async function sleepWithStop() {}

const chrome = {
  tabs: {
    async get() {
      throw new Error('should not fetch tab when sender url exists');
    },
  },
};

${extractFunction('isChatGptRuntimeUrl')}
${extractFunction('isStep5PostSubmitSuccessUrl')}
${extractFunction('isStep5SlowTransitionCandidateError')}
${extractFunction('getSignupPageRuntimeUrl')}
${extractFunction('waitForStep5DelayedRecovery')}
${extractFunction('maybeRecoverStep5CrossOriginAfterError')}

return {
  maybeRecoverStep5CrossOriginAfterError,
  getLogs() { return logs; },
  getCompletions() { return completions; },
};
`)();

  const recovered = await api.maybeRecoverStep5CrossOriginAfterError(
    { step: 5, error: '步骤 5：提交后未进入下一阶段' },
    { tab: { url: 'https://chatgpt.com/' } }
  );

  assert.equal(recovered, true, 'Step 5 在 ChatGPT 域名上报失败时应被后台恢复');
  assert.equal(api.getCompletions().length, 1, '恢复后应将 Step 5 标记为完成');
  assert.equal(api.getCompletions()[0].step, 5);
  assert.equal(api.getCompletions()[0].payload.chatgptCrossOriginCompleted, true);
  assert.ok(
    api.getLogs().some((entry) => entry.message.includes('后台按跨域成功恢复')),
    '应记录后台跨域恢复日志'
  );
}

async function testDoesNotRecoverNonChatGptRuntime() {
const api = new Function(`
const logs = [];
const completions = [];

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

async function completeStepFromBackground(step, payload) {
  completions.push({ step, payload });
}

async function getTabId() {
  return null;
}

function throwIfStopped() {}
async function sleepWithStop() {}

const chrome = {
  tabs: {
    async get() {
      throw new Error('should not fetch tab when sender url exists');
    },
  },
};

${extractFunction('isChatGptRuntimeUrl')}
${extractFunction('isStep5PostSubmitSuccessUrl')}
${extractFunction('isStep5SlowTransitionCandidateError')}
${extractFunction('getSignupPageRuntimeUrl')}
${extractFunction('waitForStep5DelayedRecovery')}
${extractFunction('maybeRecoverStep5CrossOriginAfterError')}

return {
  maybeRecoverStep5CrossOriginAfterError,
  getLogs() { return logs; },
  getCompletions() { return completions; },
};
`)();

  const recovered = await api.maybeRecoverStep5CrossOriginAfterError(
    { step: 5, error: '步骤 5：提交后未进入下一阶段' },
    { tab: { url: 'https://auth.openai.com/create-account' } }
  );

  assert.equal(recovered, false, '非 ChatGPT 域名不应触发 Step 5 恢复');
  assert.equal(api.getCompletions().length, 0, '非 ChatGPT 域名不应误标完成');
}

async function testRecoversStep5AfterDelayedTransition() {
  const api = new Function(`
const logs = [];
const completions = [];
let tabReadCount = 0;

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

async function completeStepFromBackground(step, payload) {
  completions.push({ step, payload });
}

async function getTabId() {
  return 11;
}

function throwIfStopped() {}
async function sleepWithStop() {}

const chrome = {
  tabs: {
    async get() {
      tabReadCount += 1;
      if (tabReadCount < 3) {
        return { url: 'https://auth.openai.com/about-you' };
      }
      return { url: 'https://chatgpt.com/' };
    },
  },
};

${extractFunction('isChatGptRuntimeUrl')}
${extractFunction('isStep5PostSubmitSuccessUrl')}
${extractFunction('isStep5SlowTransitionCandidateError')}
${extractFunction('getSignupPageRuntimeUrl')}
${extractFunction('waitForStep5DelayedRecovery')}
${extractFunction('maybeRecoverStep5CrossOriginAfterError')}

return {
  maybeRecoverStep5CrossOriginAfterError,
  getLogs() { return logs; },
  getCompletions() { return completions; },
};
`)();

  const recovered = await api.maybeRecoverStep5CrossOriginAfterError(
    { step: 5, error: '步骤 5：提交后未进入下一阶段' },
    { tab: { url: 'https://auth.openai.com/about-you' } }
  );

  assert.equal(recovered, true, '慢跳转在恢复窗口内完成时应被后台恢复');
  assert.equal(api.getCompletions().length, 1, '慢跳转恢复后应将 Step 5 标记为完成');
  assert.ok(
    api.getLogs().some((entry) => entry.message.includes('慢跳转恢复窗口')),
    '应记录进入慢跳转恢复窗口的日志'
  );
}

(async () => {
  await testRecoversStep5WhenRuntimeAlreadyOnChatGpt();
  await testDoesNotRecoverNonChatGptRuntime();
  await testRecoversStep5AfterDelayedTransition();
  console.log('step5 background cross-origin recovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
