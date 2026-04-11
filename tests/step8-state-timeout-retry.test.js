const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  const braceStart = source.indexOf('{', start);
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
  extractFunction('isRetryableContentScriptTransportError'),
].join('\n');

const api = new Function(`${bundle}; return { isRetryableContentScriptTransportError };`)();

assert.strictEqual(
  api.isRetryableContentScriptTransportError(new Error('Content script on signup-page did not respond in 2s. Try refreshing the tab and retry.')),
  true,
  'Step 8 状态探测短超时应被视为可重试错误'
);

assert.strictEqual(
  api.isRetryableContentScriptTransportError(new Error('Content script on signup-page did not respond in 30s. Try refreshing the tab and retry.')),
  true,
  '普通内容脚本超时也应沿用可重试分支'
);

assert.strictEqual(
  api.isRetryableContentScriptTransportError(new Error('按钮不存在')),
  false,
  '真实业务错误不应被误判为可重试传输错误'
);

console.log('step8 state timeout retry tests passed');
