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

async function testChinesePromptVariantStillCountsAsOnboarding() {
  const api = new Function(`
const CHATGPT_ONBOARDING_PROMPT_PATTERN = /what\\s+brings\\s+you\\s+to\\s+chatgpt|(?:是)?什么促使你使用\\s*chatgpt/i;
const CHATGPT_ONBOARDING_OPTION_PATTERN = /学校|工作|个人任务|乐趣和娱乐|其他|school|work|personal\\s+tasks?|fun|entertainment|other/i;
const CHATGPT_ONBOARDING_NEXT_PATTERN = /下一步|继续|next|continue/i;
const CHATGPT_ONBOARDING_SKIP_PATTERN = /跳过|skip/i;

const elements = [
  { textContent: '学校', getAttribute(name) { return name === 'tabindex' ? '0' : null; } },
  { textContent: '工作', getAttribute(name) { return name === 'tabindex' ? '0' : null; } },
  { textContent: '下一步', getAttribute() { return null; } },
  { textContent: '跳过', getAttribute() { return null; } },
];

const window = { innerWidth: 1280, innerHeight: 900 };
const location = { hostname: 'chatgpt.com' };
const document = {
  querySelectorAll(selector) {
    if (selector.includes('[tabindex]:not([tabindex="-1"])')) {
      return elements;
    }
    return elements;
  },
  body: {
    innerText: '是什么促使你使用 ChatGPT?',
    textContent: '是什么促使你使用 ChatGPT?',
  },
};

function isVisibleElement() { return true; }
function getPageTextSnapshot() {
  return document.body.innerText;
}
function getActionText(el) {
  return el?.textContent || '';
}

${extractFunction('isChatGptPostSignupLandingPage')}

return { isChatGptPostSignupLandingPage };
`)();

  assert.equal(api.isChatGptPostSignupLandingPage(), true, '应识别“是什么促使你使用 ChatGPT”问卷页');
}

(async () => {
  await testChinesePromptVariantStillCountsAsOnboarding();
  console.log('step10 onboarding detection tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
