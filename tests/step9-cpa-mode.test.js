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
  extractFunction('parseUrlSafely'),
  extractFunction('isLocalCpaUrl'),
  extractFunction('shouldBypassStep9ForLocalCpa'),
].join('\n');

const api = new Function(`${bundle}; return { isLocalCpaUrl, shouldBypassStep9ForLocalCpa };`)();

assert.strictEqual(api.isLocalCpaUrl('http://127.0.0.1:8317/management.html#/oauth'), true, '127.0.0.1 应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('http://localhost:1455/management.html#/oauth'), true, 'localhost 应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('https://example.com/management.html#/oauth'), false, '远程域名不应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('notaurl'), false, '非法 URL 不应视为本地 CPA');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  vpsUrl: 'http://127.0.0.1:8317/management.html#/oauth',
  localhostUrl: 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz',
}), true, '本地 CPA 且已有 callback 时应跳过远程提交流程');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  vpsUrl: 'https://example.com/management.html#/oauth',
  localhostUrl: 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz',
}), false, '远程 CPA 不应跳过步骤 9');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  vpsUrl: 'http://127.0.0.1:8317/management.html#/oauth',
  localhostUrl: '',
}), false, '没有 callback 时不应跳过步骤 9');

console.log('step9 cpa mode tests passed');
