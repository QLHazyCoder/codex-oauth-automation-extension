const assert = require('assert');
const fs = require('fs');

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

function buildResendApi(mailProvider) {
  const bundle = [
    extractFunction('throwIfStopped'),
    extractFunction('requestVerificationCodeResend'),
  ].join('\n');

  return new Function(`
let stopRequested = false;
let currentState = { mailProvider: ${JSON.stringify(mailProvider)} };
const tabUpdates = [];
const sentMessages = [];
const logs = [];

async function getState() {
  return { ...currentState };
}

async function getTabId(source) {
  if (source === 'signup-page') return 11;
  if (source === 'mail-2925') return 22;
  return null;
}

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

function getVerificationCodeLabel(step) {
  return step === 7 ? '登录' : '注册';
}

async function sendToContentScript(source, payload) {
  sentMessages.push({ source, payload });
  return {};
}

function getStep7RestartFromStep6Error() {
  return null;
}

const chrome = {
  tabs: {
    async update(tabId, updateInfo) {
      tabUpdates.push({ tabId, updateInfo });
      return { id: tabId };
    },
  },
};

${bundle}

return {
  requestVerificationCodeResend,
  snapshot() {
    return { tabUpdates, sentMessages, logs };
  },
};
`)();
}

function buildCountdownApi() {
  const bundle = [
    extractFunction('throwIfStopped'),
    extractFunction('sleepWithAutoRunCountdown'),
    extractFunction('skipAutoRunCountdown'),
  ].join('\n');

  return new Function(`
let stopRequested = false;
let autoRunCountdownSkipRequested = false;
let autoRunActive = true;
let currentState = {
  autoRunPhase: 'waiting_interval',
  autoRunCurrentRun: 2,
  autoRunTotalRuns: 5,
  autoRunAttemptRun: 1,
};
const logs = [];
const broadcasts = [];

async function getState() {
  return { ...currentState };
}

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

async function broadcastAutoRunStatus(phase, payload = {}) {
  broadcasts.push({ phase, ...payload });
}

${bundle}

return {
  sleepWithAutoRunCountdown,
  skipAutoRunCountdown,
  snapshot() {
    return { logs, broadcasts };
  },
};
`)();
}

async function testRequestVerificationCodeResendSwitchesBackTo2925Tab() {
  const api = buildResendApi('2925');
  await api.requestVerificationCodeResend(7);

  const state = api.snapshot();
  assert.strictEqual(state.sentMessages.length, 1, '应向注册页发送一次重发验证码请求');
  assert.deepStrictEqual(
    state.tabUpdates,
    [
      { tabId: 11, updateInfo: { active: true } },
      { tabId: 22, updateInfo: { active: true } },
    ],
    '2925 模式下重发后应切回邮箱标签页'
  );
  assert.ok(
    state.logs.some((entry) => entry.message.includes('已切换到 2925 邮箱标签页等待新邮件')),
    '2925 模式下应记录切回邮箱标签页的日志'
  );
}

async function testRequestVerificationCodeResendKeepsOtherMailProvidersUntouched() {
  const api = buildResendApi('moemail');
  await api.requestVerificationCodeResend(7);

  const state = api.snapshot();
  assert.deepStrictEqual(
    state.tabUpdates,
    [{ tabId: 11, updateInfo: { active: true } }],
    '非 2925 模式下不应额外切换邮箱标签页'
  );
  assert.ok(
    !state.logs.some((entry) => entry.message.includes('已切换到 2925 邮箱标签页等待新邮件')),
    '非 2925 模式下不应写入 2925 切页日志'
  );
}

async function testSkipAutoRunCountdownClearsPendingInterval() {
  const api = buildCountdownApi();
  const startedAt = Date.now();
  const waiter = api.sleepWithAutoRunCountdown(80, {
    currentRun: 2,
    totalRuns: 5,
    attemptRun: 1,
    countdownTitle: '线程间隔中',
    countdownNote: '第 3/5 轮即将开始',
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  const skipped = await api.skipAutoRunCountdown();
  await waiter;

  const elapsed = Date.now() - startedAt;
  const state = api.snapshot();
  assert.strictEqual(skipped, true, '等待线程间隔时应允许手动跳过倒计时');
  assert.ok(elapsed < 250, '跳过倒计时后不应继续长时间阻塞');
  assert.strictEqual(state.broadcasts[0]?.phase, 'waiting_interval', '应先广播倒计时开始');
  assert.ok(Number.isFinite(state.broadcasts[0]?.countdownAt), '倒计时开始广播应携带截止时间');
  assert.ok(
    state.broadcasts.some((entry) => entry.phase === 'waiting_interval' && entry.countdownAt === null),
    '跳过或结束后应清空倒计时状态'
  );
  assert.ok(
    state.logs.some((entry) => entry.message.includes('已手动跳过当前倒计时')),
    '手动跳过倒计时时应记录日志'
  );
}

(async () => {
  await testRequestVerificationCodeResendSwitchesBackTo2925Tab();
  await testRequestVerificationCodeResendKeepsOtherMailProvidersUntouched();
  await testSkipAutoRunCountdownClearsPendingInterval();
  console.log('upstream sync regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
