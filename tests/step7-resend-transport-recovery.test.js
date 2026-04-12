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
  for (let i = start; i < source.length; i++) {
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

const bundle = [
  extractFunction('getVerificationCodeLabel'),
  extractFunction('isRetryableContentScriptTransportError'),
  extractFunction('requestVerificationCodeResend'),
].join('\n');

const api = new Function(`
const captured = {
  tabUpdates: [],
  logs: [],
  sendCalls: [],
};
const Date = {
  now() {
    return 1700000000123;
  },
};
const chrome = {
  tabs: {
    async update(tabId, payload) {
      captured.tabUpdates.push({ tabId, payload });
    },
  },
};

async function getTabId(source) {
  return source === 'signup-page' ? 9527 : null;
}

async function addLog(message, level) {
  captured.logs.push({ message, level });
}

async function sendToContentScript(source, message) {
  captured.sendCalls.push({ source, type: message.type, step: message.step });
  throw new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received');
}

${bundle}

return {
  requestVerificationCodeResend,
  snapshot() {
    return captured;
  },
};
`)();

(async () => {
  const resendRequestedAt = await api.requestVerificationCodeResend(7);
  const snapshot = api.snapshot();

  assert.strictEqual(
    resendRequestedAt,
    1700000000123,
    '重发验证码遇到通道关闭时，应沿用触发重发时刻作为新的轮询起点'
  );

  assert.deepStrictEqual(
    snapshot.tabUpdates,
    [{ tabId: 9527, payload: { active: true } }],
    '重发前应切回认证页标签'
  );

  assert.deepStrictEqual(
    snapshot.sendCalls,
    [{ source: 'signup-page', type: 'RESEND_VERIFICATION_CODE', step: 7 }],
    '应仅向认证页发送一次重发验证码命令'
  );

  assert.deepStrictEqual(
    snapshot.logs,
    [
      { message: '步骤 7：正在请求新的登录验证码...', level: 'warn' },
      { message: '步骤 7：重发验证码后认证页立即刷新，按已触发重发处理并继续轮询新时间窗口。', level: 'warn' },
    ],
    '通道关闭时应记录软成功日志，而不是把首次重发标记为失败'
  );

  console.log('step7 resend transport recovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
