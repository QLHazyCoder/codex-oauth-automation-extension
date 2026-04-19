const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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

async function testMaybeContinueWithPasswordClicksButtonAndWaitsForPasswordField() {
  const api = new Function(`
const events = [];
let passwordVisible = false;
const action = { tagName: 'BUTTON' };

${extractFunction('maybeContinueWithPassword')}

function findUsePasswordContinueAction() {
  return action;
}

function isActionEnabled() {
  return true;
}

function getActionText() {
  return '使用密码继续';
}

function log(message) {
  events.push({ type: 'log', message });
}

async function humanPause() {}
function simulateClick() {
  passwordVisible = true;
  events.push({ type: 'click' });
}

function getSignupPasswordInput() {
  return passwordVisible ? { type: 'password' } : null;
}

function getVisibleRegistrationEmailInput() {
  return null;
}

function throwIfStopped() {}
async function sleep() {}

return {
  maybeContinueWithPassword,
  getEvents() {
    return events;
  },
};
`)();

  const result = await api.maybeContinueWithPassword();
  assert.deepStrictEqual(
    result,
    { continued: true, passwordInput: { type: 'password' }, emailInput: null },
    '点击“使用密码继续”后应等待密码输入框出现'
  );
  assert.ok(api.getEvents().some((event) => event.type === 'click'), '应实际点击“使用密码继续”按钮');
}

async function testWaitForStep3SurfaceCanHandleDelayedUsePasswordContinue() {
  const api = new Function(`
let loops = 0;
const events = [];

${extractFunction('waitForStep3Surface')}

function throwIfStopped() {}

function getSignupPasswordInput() {
  return loops >= 2 ? { type: 'password' } : null;
}

function getVisibleRegistrationEmailInput() {
  return null;
}

function isVerificationPageStillVisible() {
  return true;
}

function findUsePasswordContinueAction() {
  return null;
}

async function maybeContinueWithPassword() {
  loops += 1;
  events.push({ type: 'continue-attempt', loops });
  return loops === 1 ? { continued: false } : { continued: true };
}

function log(message) {
  events.push({ type: 'log', message });
}

async function sleep() {}

// waitForStep3Surface 新增了 invalid_state 检测，此测试场景无 invalid_state，返回 false。
function isInvalidStateErrorPage() { return false; }

return {
  waitForStep3Surface,
  getEvents() {
    return events;
  },
};
`)();

  const result = await api.waitForStep3Surface(1000);
  assert.deepStrictEqual(
    result,
    { type: 'password', passwordInput: { type: 'password' } },
    '即使“使用密码继续”按钮是延迟出现/第二次才成功，也应继续轮询直到密码框出现'
  );
  assert.ok(
    api.getEvents().some((event) => event.type === 'continue-attempt' && event.loops === 2),
    '应重复尝试处理验证码检查页上的“使用密码继续”分支，而不是只检测一次'
  );
}


async function testWaitForStep3SurfaceHandlesStandaloneUsePasswordContinuePage() {
  const api = new Function(`
let loops = 0;
const events = [];

${extractFunction('waitForStep3Surface')}

function throwIfStopped() {}

function getSignupPasswordInput() {
  return loops >= 2 ? { type: 'password' } : null;
}

function getVisibleRegistrationEmailInput() {
  return null;
}

function isVerificationPageStillVisible() {
  return false;
}

function findUsePasswordContinueAction() {
  return loops === 0 ? { id: 'use-password' } : null;
}

async function maybeContinueWithPassword() {
  loops += 1;
  events.push({ type: 'continue-attempt', loops });
  return { continued: true };
}

function log(message) {
  events.push({ type: 'log', message });
}

async function sleep() {
  loops += 1;
}

function isInvalidStateErrorPage() { return false; }

return {
  waitForStep3Surface,
  getEvents() {
    return events;
  },
};
`)();

  const result = await api.waitForStep3Surface(1000);
  assert.deepStrictEqual(
    result,
    { type: 'password', passwordInput: { type: 'password' } },
    '即使不是验证码页，只要当前页面存在“使用密码继续”入口，也应切回密码流程'
  );
  assert.ok(
    api.getEvents().some((event) => event.type === 'log' && /使用密码继续/.test(event.message)),
    '应记录识别到“使用密码继续”入口的日志'
  );
}

async function testMaybeCompleteStep3InlineAfterEmailSubmitFinishesSamePagePasswordStage() {
  const api = new Function(`
const events = [];
let loops = 0;

${extractFunction('maybeCompleteStep3InlineAfterEmailSubmit')}

function throwIfStopped() {}

function getSignupPasswordInput() {
  loops += 1;
  return loops >= 2 ? { type: 'password' } : null;
}

function findUsePasswordContinueAction() {
  return null;
}

async function maybeContinueWithPassword() {
  return { continued: false };
}

function getInvalidStateErrorPageState() {
  return null;
}

function isInvalidStateErrorPage() {
  return false;
}

function getAuthTimeoutErrorPageState() {
  return null;
}

async function completeStep3PasswordStage(payload) {
  events.push({ type: 'complete', payload });
}

function log(message, level) {
  events.push({ type: 'log', message, level });
}

async function sleep() {}

return {
  maybeCompleteStep3InlineAfterEmailSubmit,
  getEvents() {
    return events;
  },
};
`)();

  const result = await api.maybeCompleteStep3InlineAfterEmailSubmit({
    email: 'cat@example.com',
    password: 'super-secret',
    activeEmailInput: { id: 'email' },
    timeoutMs: 1000,
  });

  assert.deepStrictEqual(
    result,
    { completedInline: true, surface: 'password' },
    '邮箱提交后若密码框在当前页直接出现，应当在同一内容脚本内完成密码阶段'
  );
  assert.ok(
    api.getEvents().some((event) => event.type === 'complete' && event.payload?.passwordInput?.type === 'password'),
    '应调用密码阶段完成逻辑，而不是仅等待背景页恢复'
  );
}

(async () => {
  await testMaybeContinueWithPasswordClicksButtonAndWaitsForPasswordField();
  await testWaitForStep3SurfaceCanHandleDelayedUsePasswordContinue();
  await testWaitForStep3SurfaceHandlesStandaloneUsePasswordContinuePage();
  await testMaybeCompleteStep3InlineAfterEmailSubmitFinishesSamePagePasswordStage();
  console.log('step3 use password continue tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
