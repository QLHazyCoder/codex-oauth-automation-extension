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
  'const DEFAULT_LOCAL_CPA_STEP9_MODE = "submit";',
  extractFunction('parseUrlSafely'),
  extractFunction('isLocalCpaUrl'),
  extractFunction('normalizeLocalCpaStep9Mode'),
  extractFunction('shouldBypassStep9ForLocalCpa'),
].join('\n');

const api = new Function(`${bundle}; return { isLocalCpaUrl, normalizeLocalCpaStep9Mode, shouldBypassStep9ForLocalCpa };`)();

assert.strictEqual(api.isLocalCpaUrl('http://127.0.0.1:8317/management.html#/oauth'), true, '127.0.0.1 应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('http://localhost:1455/management.html#/oauth'), true, 'localhost 应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('https://example.com/management.html#/oauth'), false, '远程域名不应视为本地 CPA');
assert.strictEqual(api.isLocalCpaUrl('notaurl'), false, '非法 URL 不应视为本地 CPA');
assert.strictEqual(api.normalizeLocalCpaStep9Mode('submit'), 'submit', 'submit 应保持为 submit');
assert.strictEqual(api.normalizeLocalCpaStep9Mode('bypass'), 'bypass', 'bypass 应保持为 bypass');
assert.strictEqual(api.normalizeLocalCpaStep9Mode('other'), 'submit', '未知模式应回退为 submit');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  vpsUrl: 'http://127.0.0.1:8317/management.html#/oauth',
  localhostUrl: 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz',
}), false, '默认模式下，本地 CPA 也应执行步骤 9');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  localCpaStep9Mode: 'bypass',
  vpsUrl: 'http://127.0.0.1:8317/management.html#/oauth',
  localhostUrl: 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz',
}), true, '切换为 bypass 后，本地 CPA 且已有 callback 时应跳过步骤 9');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  localCpaStep9Mode: 'bypass',
  vpsUrl: 'https://example.com/management.html#/oauth',
  localhostUrl: 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz',
}), false, '远程 CPA 不应跳过步骤 9');

assert.strictEqual(api.shouldBypassStep9ForLocalCpa({
  localCpaStep9Mode: 'bypass',
  vpsUrl: 'http://127.0.0.1:8317/management.html#/oauth',
  localhostUrl: '',
}), false, '没有 callback 时不应跳过步骤 9');

console.log('step9 cpa mode tests passed');
