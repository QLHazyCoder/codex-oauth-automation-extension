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

async function testDismissSequencePrefersSkipThenGuideThenContinueThenStart() {
  const api = new Function(`
const events = [];
const CHATGPT_ONBOARDING_SKIP_PATTERN = /跳过|skip/i;
const CHATGPT_ONBOARDING_SKIP_NOW_PATTERN = /跳过导览|跳过导航|跳过|skip(?:\\s+for\\s+now)?|not\\s+now/i;
const CHATGPT_ONBOARDING_CONTINUE_PATTERN = /继续|下一步|continue|next|开始|完成|done|finish/i;
const CHATGPT_ONBOARDING_START_PATTERN = /好的，开始吧|开始吧|let'?s\\s*go|got\\s*it|start\\s*chatting|start\\s*using/i;

const steps = [
  { key: 'skip', text: '跳过' },
  { key: 'skipGuide', text: '跳过导览' },
  { key: 'continue', text: '继续' },
];

let startAvailable = false;

function findChatGptOnboardingAction(pattern) {
  const current = steps[0];
  if (current && pattern.test(current.text)) {
    return {
      textContent: current.text,
      key: current.key,
      getAttribute() { return null; },
    };
  }
  if (startAvailable && pattern.test('好的，开始吧')) {
    return {
      textContent: '好的，开始吧',
      key: 'start',
      getAttribute() { return null; },
    };
  }
  return null;
}

function getActionText(el) {
  return el?.textContent || '';
}

async function humanPause() {}
async function sleep(ms) {
  events.push({ type: 'sleep', ms });
  if (ms >= 1200 && steps.length === 0) {
    startAvailable = true;
  }
}
function log(message) {
  events.push({ type: 'log', message });
}
function simulateClick(el) {
  events.push({ type: 'click', label: el.textContent });
  if (steps[0] && steps[0].text === el.textContent) {
    steps.shift();
  } else if (el.textContent === '好的，开始吧') {
    startAvailable = false;
  }
}
function throwIfStopped() {}

async function advanceChatGptPostSignupOnboarding() {
  events.push({ type: 'advance-fallback' });
  return { finished: true };
}

${extractFunction('clickChatGptOnboardingActionIfPresent')}
${extractFunction('waitForChatGptOnboardingAction')}
${extractFunction('dismissChatGptOnboardingBeforeLogout')}

return {
  dismissChatGptOnboardingBeforeLogout,
  getEvents() {
    return events;
  },
};
`)();

  await api.dismissChatGptOnboardingBeforeLogout();
  const clicks = api.getEvents().filter((event) => event.type === 'click').map((event) => event.label);
  assert.deepStrictEqual(
    clicks,
    ['跳过', '跳过导览', '继续', '好的，开始吧'],
    'Step 10 onboarding 应按“跳过 -> 跳过导览 -> 继续 -> 好的，开始吧”顺序处理'
  );
}

(async () => {
  await testDismissSequencePrefersSkipThenGuideThenContinueThenStart();
  console.log('step10 onboarding sequence tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
