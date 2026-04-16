const assert = require('assert');
const fs = require('fs');

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

const bundle = [
  extractFunction('getPageTextSnapshot'),
  extractFunction('findChatgptSkipButton'),
  extractFunction('waitForChatgptSkipButton'),
  extractFunction('isChatgptOnboardingPage'),
  extractFunction('isChatgptUrl'),
  extractFunction('hasVisibleElementMatchingSelector'),
  extractFunction('isChatgptAuthenticatedHomePage'),
  extractFunction('waitForChatgptPostSignupState'),
  extractFunction('skipChatgptOnboarding'),
].join('\n');

const api = new Function(`
const CHATGPT_ONBOARDING_TEXT_PATTERN = /welcome\\s+to\\s+chatgpt|what\\s+should\\s+chatgpt\\s+call\\s+you|how\\s+do\\s+you\\s+want\\s+chatgpt\\s+to\\s+respond|tell\\s+chatgpt\\s+what\\s+traits|personal(?:ize|ise)\\s+your\\s+experience|介绍一下你自己|ChatGPT 应该如何称呼你|你希望 ChatGPT 如何回应/i;
const CHATGPT_HOME_TEXT_PATTERN = /new\\s+chat|temporary\\s+chat|message\\s+chatgpt|send\\s+a\\s+message|chatgpt\\s+can\\s+make\\s+mistakes|新建聊天|临时聊天|给\\s*ChatGPT\\s*发消息|ChatGPT\\s*可能会犯错/i;

let buttonList = [];
let selectorMap = {};
let pageText = '';
let clickedButtons = [];
let logs = [];
const location = { href: 'https://chatgpt.com/' };
const document = {
  body: { innerText: '', textContent: '' },
  querySelectorAll(selector) {
    if (selector === 'button') {
      return buttonList;
    }
    return selectorMap[selector] || [];
  },
};

function isVisibleElement(el) {
  return Boolean(el) && !el.hidden;
}

function throwIfStopped() {}
async function sleep() {}
async function humanPause() {}
function log(message, level = 'info') {
  logs.push({ message, level });
}
function simulateClick(button) {
  clickedButtons.push(button.textContent || button.id || 'button');
  button.hidden = true;
}

${bundle}

return {
  setPage({ href = 'https://chatgpt.com/', text = '', buttons = [], selectors = {} }) {
    location.href = href;
    pageText = text;
    buttonList = buttons.map((button, index) => ({
      id: button.id || \`button-\${index}\`,
      textContent: button.textContent || '',
      className: button.className || '',
      hidden: Boolean(button.hidden),
    }));
    selectorMap = {};
    for (const [selector, count] of Object.entries(selectors)) {
      selectorMap[selector] = Array.from({ length: count }, (_, index) => ({ id: \`\${selector}-\${index}\`, hidden: false }));
    }
    document.body.innerText = pageText;
    document.body.textContent = pageText;
    clickedButtons = [];
    logs = [];
  },
  isChatgptOnboardingPage() {
    return isChatgptOnboardingPage();
  },
  isChatgptAuthenticatedHomePage() {
    return isChatgptAuthenticatedHomePage();
  },
  async skipChatgptOnboarding() {
    return skipChatgptOnboarding();
  },
  snapshot() {
    return { clickedButtons, logs };
  },
};
`)();

(async () => {
  api.setPage({
    href: 'https://chatgpt.com/',
    text: 'New chat ChatGPT can make mistakes',
    selectors: {
      'textarea[placeholder*="Message" i]': 1,
    },
  });

  assert.strictEqual(api.isChatgptOnboardingPage(), false, '已登录主页不应仅因 chatgpt.com URL 被误判为 onboarding');
  assert.strictEqual(api.isChatgptAuthenticatedHomePage(), true, '主页特征存在时应识别为已登录 ChatGPT 页面');

  let result = await api.skipChatgptOnboarding();
  let snapshot = api.snapshot();
  assert.deepStrictEqual(result, { success: true, alreadyCompleted: true }, '无 Skip 按钮但已进入主页时应按成功处理');
  assert.deepStrictEqual(snapshot.clickedButtons, [], '已登录主页场景不应再误点按钮');

  api.setPage({
    href: 'https://chatgpt.com/',
    text: 'Welcome to ChatGPT',
    buttons: [
      { textContent: 'Skip', className: 'btn-ghost' },
      { textContent: 'Skip', className: 'btn-ghost' },
    ],
  });

  assert.strictEqual(api.isChatgptOnboardingPage(), true, '存在 Skip 按钮时应识别为 onboarding');
  result = await api.skipChatgptOnboarding();
  snapshot = api.snapshot();
  assert.deepStrictEqual(result, { success: true }, '真实 onboarding 仍应继续执行跳过逻辑');
  assert.deepStrictEqual(snapshot.clickedButtons, ['Skip', 'Skip'], '双 Skip onboarding 应依次点击两个按钮');

  console.log('step5 chatgpt onboarding tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
