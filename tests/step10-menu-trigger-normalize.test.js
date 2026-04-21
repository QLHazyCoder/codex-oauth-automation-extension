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

async function testNormalizeMovesFromInnerDivToClickableButton() {
  const api = new Function(`
const button = {
  tagName: 'BUTTON',
  attrs: {},
  parentElement: null,
  getAttribute(name) { return this.attrs[name] ?? null; },
  closest(selector) {
    if (/button/.test(selector)) return this;
    return null;
  },
};
const inner = {
  tagName: 'DIV',
  attrs: { 'data-testid': 'accounts-profile-button', 'data-sidebar-item': 'true', 'aria-haspopup': 'menu' },
  parentElement: button,
  getAttribute(name) { return this.attrs[name] ?? null; },
  closest(selector) {
    if (selector.includes('[data-testid="accounts-profile-button"]')) return this;
    if (/button/.test(selector)) return button;
    if (selector.includes('[aria-haspopup="menu"]')) return this;
    return null;
  },
};

const window = {
  getComputedStyle() {
    return { pointerEvents: 'auto' };
  },
};

function isVisibleElement() { return true; }

${extractFunction('isChatGptAccountMenuTriggerElement')}
${extractFunction('normalizeChatGptAccountMenuTrigger')}

return { normalizeChatGptAccountMenuTrigger, inner, button };
`)();

  assert.equal(
    api.normalizeChatGptAccountMenuTrigger(api.inner),
    api.button,
    '应把内层 accounts-profile-button 容器归一化到真实可点击按钮'
  );
}

async function testFindsCollapsedBottomLeftAccountTriggerViaCornerSampling() {
  const api = new Function(`
const trigger = {
  tagName: 'BUTTON',
  attrs: { 'data-testid': 'accounts-profile-button' },
  getAttribute(name) { return this.attrs[name] ?? null; },
  querySelector(selector) {
    if (/img|svg|avatar|canvas/i.test(selector)) {
      return { tagName: 'IMG' };
    }
    return null;
  },
  getBoundingClientRect() {
    return { left: 10, top: 730, width: 28, height: 28 };
  },
  closest(selector) {
    if (/button/.test(selector)) return this;
    if (selector.includes('[data-testid="accounts-profile-button"]')) return this;
    return null;
  },
};

const window = {
  innerWidth: 560,
  innerHeight: 760,
  getComputedStyle() {
    return { pointerEvents: 'auto' };
  },
};

const document = {
  documentElement: { clientWidth: 560, clientHeight: 760 },
  elementFromPoint(x, y) {
    if (x <= 64 && y >= 696) return trigger;
    return null;
  },
};

function isVisibleElement() { return true; }
function getActionText() { return ''; }
function normalizeInlineText(text) { return String(text || '').replace(/\\s+/g, ' ').trim(); }
const CHATGPT_ACCOUNT_CARD_TEXT_PATTERN = /免费版|plus|pro|team|enterprise|升级|upgrade/i;

${extractFunction('isChatGptAccountMenuTriggerElement')}
${extractFunction('normalizeChatGptAccountMenuTrigger')}
${extractFunction('findChatGptBottomLeftCornerTrigger')}

return { findChatGptBottomLeftCornerTrigger, trigger };
`)();

  assert.equal(
    api.findChatGptBottomLeftCornerTrigger(),
    api.trigger,
    '应通过左下角采样点识别折叠侧边栏中的账号入口'
  );
}

(async () => {
  await testNormalizeMovesFromInnerDivToClickableButton();
  await testFindsCollapsedBottomLeftAccountTriggerViaCornerSampling();
  console.log('step10 menu trigger normalize tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
