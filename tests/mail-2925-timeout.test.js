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

const api = new Function(`
${extractFunction('getContentScriptResponseTimeoutMs')}
return { getContentScriptResponseTimeoutMs };
`)();

const pollMessage = {
  type: 'POLL_EMAIL',
  payload: {
    maxAttempts: 5,
    intervalMs: 3000,
  },
};

assert.strictEqual(
  api.getContentScriptResponseTimeoutMs(pollMessage, 'qq-mail'),
  45000,
  '普通页面轮询邮箱应保持原有 45s 传输超时'
);

assert.ok(
  api.getContentScriptResponseTimeoutMs(pollMessage, 'gmail-mail') >= 60000,
  'Gmail 轮询应获得更长的传输超时，覆盖列表加载、refresh 与删除按钮等待'
);

assert.ok(
  api.getContentScriptResponseTimeoutMs(pollMessage, 'mail-2925') >= 90000,
  '2925 页面轮询应获得更长的传输超时，避免后台隐藏标签页时过早判定失败'
);

console.log('mail-2925 timeout tests passed');
