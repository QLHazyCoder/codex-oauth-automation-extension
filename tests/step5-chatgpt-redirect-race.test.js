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

const bundle = [
  extractFunction('waitForStep5ChatgptRedirect'),
].join('\n');

const api = new Function(`
let waitArgs = null;
let waitResult = null;
let currentTab = null;

const chrome = {
  tabs: {
    async get() {
      return currentTab;
    },
  },
};

async function waitForTabUrlMatch(tabId, matcher, options = {}) {
  waitArgs = { tabId, matcher, options };
  return waitResult;
}

${bundle}

return {
  async run(tabId, timeoutMs) {
    return waitForStep5ChatgptRedirect(tabId, timeoutMs);
  },
  setWaitResult(value) {
    waitResult = value;
  },
  setCurrentTab(value) {
    currentTab = value;
  },
  snapshot() {
    return { waitArgs };
  },
};
`)();

(async () => {
  const redirected = { id: 86, url: 'https://chatgpt.com/' };
  api.setWaitResult(redirected);
  api.setCurrentTab({ id: 86, url: 'https://auth.openai.com/' });

  let result = await api.run(86, 22000);
  let snapshot = api.snapshot();
  assert.deepStrictEqual(result, redirected, '等待命中 chatgpt.com 时应直接返回匹配到的标签页');
  assert.strictEqual(snapshot.waitArgs.tabId, 86, '应使用 signup-page 当前标签页等待跳转');
  assert.strictEqual(snapshot.waitArgs.options.timeoutMs, 22000, '应透传等待超时时间');
  assert.strictEqual(snapshot.waitArgs.options.retryDelayMs, 300, '应使用较短轮询间隔覆盖 URL 更新 race');
  assert.strictEqual(snapshot.waitArgs.matcher('https://chatgpt.com/?model=gpt-5'), true, 'matcher 应接受 chatgpt.com');
  assert.strictEqual(snapshot.waitArgs.matcher('https://auth.openai.com/u/signup'), false, 'matcher 不应把旧认证页误判为成功');

  api.setWaitResult(null);
  api.setCurrentTab({ id: 86, url: 'https://chatgpt.com/?temporary-chat=true' });
  result = await api.run(86, 15000);
  assert.deepStrictEqual(result, { id: 86, url: 'https://chatgpt.com/?temporary-chat=true' }, '等待超时后仍应回读当前标签页 URL 兜底');

  api.setCurrentTab({ id: 86, url: 'https://auth.openai.com/u/signup' });
  result = await api.run(86, 15000);
  assert.strictEqual(result, null, '仍停留旧域名时不应误判为跳转成功');

  result = await api.run(null, 15000);
  assert.strictEqual(result, null, '无有效标签页时应直接返回 null');

  console.log('step5 chatgpt redirect race tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
