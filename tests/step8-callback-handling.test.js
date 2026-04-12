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
  extractFunction('isLocalhostOAuthCallbackUrl'),
  extractFunction('getStep8CallbackUrlFromNavigation'),
  extractFunction('getStep8CallbackUrlFromTabUpdate'),
].join('\n');

const api = new Function(`${bundle}; return { getStep8CallbackUrlFromNavigation, getStep8CallbackUrlFromTabUpdate };`)();

const callbackUrl = 'http://127.0.0.1:8317/codex/callback?code=abc&state=xyz';

assert.strictEqual(
  api.getStep8CallbackUrlFromNavigation({
    tabId: 123,
    frameId: 0,
    url: callbackUrl,
  }, 123),
  callbackUrl,
  '应识别 onCommitted/onBeforeNavigate 命中的 callback'
);

assert.strictEqual(
  api.getStep8CallbackUrlFromNavigation({
    tabId: 123,
    frameId: 1,
    url: callbackUrl,
  }, 123),
  '',
  '子 frame 不应命中 callback'
);

assert.strictEqual(
  api.getStep8CallbackUrlFromNavigation({
    tabId: 999,
    frameId: 0,
    url: callbackUrl,
  }, 123),
  '',
  '非 signup tab 不应命中 callback'
);

assert.strictEqual(
  api.getStep8CallbackUrlFromTabUpdate(
    123,
    { url: callbackUrl },
    { url: callbackUrl },
    123
  ),
  callbackUrl,
  'tabs.onUpdated 应能从 changeInfo.url 捕获 callback'
);

assert.strictEqual(
  api.getStep8CallbackUrlFromTabUpdate(
    123,
    {},
    { url: callbackUrl },
    123
  ),
  callbackUrl,
  'tabs.onUpdated 应能从 tab.url 兜底捕获 callback'
);

assert.strictEqual(
  api.getStep8CallbackUrlFromTabUpdate(
    999,
    { url: callbackUrl },
    { url: callbackUrl },
    123
  ),
  '',
  '非 signup tab 的 tabs.onUpdated 不应命中 callback'
);

console.log('step8 callback handling tests passed');
