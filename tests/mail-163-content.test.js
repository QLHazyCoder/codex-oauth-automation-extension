const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/mail-163.js', 'utf8');

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

test('findMailItems falls back to visible aria-label mail rows when legacy selector is missing', () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('isVisibleNode'),
    extractFunction('isLikelyMailItemNode'),
    extractFunction('findMailItems'),
  ].join('\n');

  const api = new Function(`
const mailRow = {
  hidden: false,
  textContent: 'Your temporary ChatGPT verification code 911113',
  getAttribute(name) {
    if (name === 'aria-label') return 'Your temporary ChatGPT verification code 911113 发件人 OpenAI';
    return '';
  },
  getBoundingClientRect() {
    return { width: 600, height: 48 };
  },
  matches() {
    return false;
  },
  querySelector() {
    return null;
  },
};

const document = {
  querySelectorAll(selector) {
    if (selector === 'div[sign="letter"]') return [];
    if (selector === '[role="option"][aria-label]') return [mailRow];
    return [];
  },
};

const window = {
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
};

${bundle}

return { findMailItems };
`)();

  const rows = api.findMailItems();
  assert.equal(rows.length, 1);
});

test('getMailTimestamp parses visible hh:mm text even when no title attribute exists', () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('parseMail163Timestamp'),
    extractFunction('isLikelyMailTimestampText'),
    extractFunction('collectMailTimestampCandidates'),
    extractFunction('getMailTimestamp'),
  ].join('\n');

  const timestamp = new Function(`
const item = {
  getAttribute() {
    return '';
  },
  querySelectorAll(selector) {
    if (selector === '.e00, [title], [aria-label], time, [class*="time"], [class*="date"]') {
      return [];
    }
    if (selector === 'span, div, td, strong, b') {
      return [
        {
          textContent: '22:22',
          getAttribute() {
            return '';
          },
        },
      ];
    }
    return [];
  },
};

${bundle}

return getMailTimestamp(item);
`)();

  const now = new Date();
  const expected = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 22, 0, 0).getTime();
  assert.equal(timestamp, expected);
});

test('readOpenedMailText prefers opened body content that contains the verification code', () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('collectOpenedMailTextCandidates'),
    extractFunction('selectOpenedMailTextCandidate'),
    extractFunction('readOpenedMailText'),
    extractFunction('extractVerificationCode'),
  ].join('\n');

  const text = new Function(`
const item = {
  querySelectorAll() {
    return [];
  },
};

function getMailSubjectText() {
  return 'Your temporary ChatGPT login code';
}

function getMailSenderText() {
  return 'OpenAI';
}

const document = {
  querySelectorAll(selector) {
    if (selector === 'iframe') {
      return [];
    }
    return [
      { innerText: 'Your temporary ChatGPT login code', textContent: 'Your temporary ChatGPT login code' },
      { innerText: 'Enter this temporary verification code to continue: 214203', textContent: 'Enter this temporary verification code to continue: 214203' },
    ];
  },
  body: {
    innerText: 'fallback body',
    textContent: 'fallback body',
  },
};

${bundle}

return readOpenedMailText(item);
`)();

  assert.match(text, /214203/);
});

test('openMailAndGetMessageText reads opened body text and returns to inbox', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('collectOpenedMailTextCandidates'),
    extractFunction('selectOpenedMailTextCandidate'),
    extractFunction('readOpenedMailText'),
    extractFunction('returnToInbox'),
    extractFunction('openMailAndGetMessageText'),
    extractFunction('extractVerificationCode'),
  ].join('\n');

  const api = new Function(`
let inInbox = true;
let clickCount = 0;
const mailItem = {
  click() {
    clickCount += 1;
    inInbox = false;
  },
};
const inboxLink = {
  click() {
    inInbox = true;
  },
};

function getMailSubjectText() {
  return 'Your temporary ChatGPT login code';
}

function getMailSenderText() {
  return 'OpenAI';
}

const document = {
  querySelector(selector) {
    if (selector === '.nui-tree-item-text[title="收件箱"], [title="收件箱"]') return inboxLink;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'iframe') {
      return [];
    }
    return inInbox ? [] : [{ innerText: 'Enter this temporary verification code to continue: 214203', textContent: 'Enter this temporary verification code to continue: 214203' }];
  },
  body: {
    innerText: '',
    textContent: '',
  },
};

function findMailItems() {
  return inInbox ? [mailItem] : [];
}

async function sleep() {}

${bundle}

return {
  openMailAndGetMessageText,
  getClickCount: () => clickCount,
  isInInbox: () => inInbox,
  mailItem,
};
`)();

  const text = await api.openMailAndGetMessageText(api.mailItem);
  assert.match(text, /214203/);
  assert.equal(api.getClickCount(), 1);
  assert.equal(api.isInInbox(), true);
});

test('openMailAndGetMessageText ignores stale pre-open text that contains an old code', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('collectOpenedMailTextCandidates'),
    extractFunction('selectOpenedMailTextCandidate'),
    extractFunction('readOpenedMailText'),
    extractFunction('returnToInbox'),
    extractFunction('openMailAndGetMessageText'),
    extractFunction('extractVerificationCode'),
  ].join('\n');

  const api = new Function(`
let stage = 'before';
const oldText = 'OpenAI Your temporary ChatGPT login code. Ignore this old code 111111. '.repeat(10);
const newText = 'OpenAI Your temporary ChatGPT login code. Your new code is 222222.';
const mailItem = {
  click() {
    stage = 'after';
  },
};
const inboxLink = {
  click() {
    stage = 'done';
  },
};

function getMailSubjectText() {
  return 'Your temporary ChatGPT login code';
}

function getMailSenderText() {
  return 'OpenAI';
}

const document = {
  querySelector(selector) {
    if (selector === '.nui-tree-item-text[title="收件箱"], [title="收件箱"]') return inboxLink;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'iframe') {
      return [];
    }
    if (stage === 'before') {
      return [{ innerText: oldText, textContent: oldText }];
    }
    if (stage === 'after') {
      return [
        { innerText: oldText, textContent: oldText },
        { innerText: newText, textContent: newText },
      ];
    }
    return [];
  },
  body: {
    innerText: '',
    textContent: '',
  },
};

function findMailItems() {
  return stage === 'done' ? [mailItem] : [];
}

async function sleep() {}

${bundle}

return { openMailAndGetMessageText, mailItem };
`)();

  const text = await api.openMailAndGetMessageText(api.mailItem);
  assert.match(text, /222222/);
  assert.doesNotMatch(text, /111111/);
});

test('handlePollEmail ignores same-minute old snapshot mail before fallback', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let currentItems = [{ id: 'old-mail' }];
const seenCodes = new Set();

function findMailItems() {
  return currentItems;
}

function getCurrentMailIds(items = []) {
  return new Set((items.length ? items : currentItems).map((item) => item.id));
}

function getMailItemId(item) {
  return item.id;
}

function getMailTimestamp() {
  return new Date(2026, 3, 22, 22, 22, 0, 0).getTime();
}

function getMailSenderText() {
  return 'OpenAI';
}

function getMailSubjectText() {
  return 'Your temporary ChatGPT verification code';
}

function getMailRowText() {
  return 'Your temporary ChatGPT verification code 911113 发件人 OpenAI';
}

function extractVerificationCode() {
  return '911113';
}

async function waitForElement() {
  return { click() {} };
}
async function refreshInbox() {}
async function sleep() {}
function log() {}
function persistSeenCodes() {}
function scheduleEmailCleanup() {}

${bundle}

return { handlePollEmail };
`)();

  await assert.rejects(
    () => api.handlePollEmail(4, {
      senderFilters: ['openai'],
      subjectFilters: ['verification'],
      maxAttempts: 1,
      intervalMs: 1,
      filterAfterTimestamp: new Date(2026, 3, 22, 22, 22, 40, 0).getTime(),
    }),
    /未在 163 邮箱中找到新的匹配邮件/
  );
});

test('handlePollEmail accepts a new same-minute mail that appears after the snapshot', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
const oldMail = {
  id: 'old-mail',
  getAttribute(name) {
    if (name === 'aria-label') return 'Old verification mail 111111 发件人 OpenAI';
    return '';
  },
};
const newMail = {
  id: 'new-mail',
  getAttribute(name) {
    if (name === 'aria-label') return 'Your temporary ChatGPT verification code 654321 发件人 OpenAI';
    return '';
  },
};
let refreshCount = 0;
let currentItems = [oldMail];
const seenCodes = new Set();

function findMailItems() {
  return currentItems;
}

function getCurrentMailIds(items = []) {
  return new Set((items.length ? items : currentItems).map((item) => item.id));
}

function getMailItemId(item) {
  return item.id;
}

function getMailTimestamp() {
  return new Date(2026, 3, 22, 22, 22, 0, 0).getTime();
}

function getMailSenderText() {
  return 'OpenAI';
}

function getMailSubjectText(item) {
  return item.id === 'new-mail' ? 'Your temporary ChatGPT verification code' : 'Old verification mail';
}

function getMailRowText(item) {
  return item.id === 'new-mail'
    ? 'Your temporary ChatGPT verification code 654321 发件人 OpenAI'
    : 'Old verification mail 111111 发件人 OpenAI';
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function waitForElement() {
  return { click() {} };
}
async function refreshInbox() {
  refreshCount += 1;
  if (refreshCount >= 1) {
    currentItems = [oldMail, newMail];
  }
}
async function sleep() {}
function log() {}
function persistSeenCodes() {}
function scheduleEmailCleanup() {}

${bundle}

return { handlePollEmail };
`)();

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 2,
    intervalMs: 1,
    filterAfterTimestamp: new Date(2026, 3, 22, 22, 22, 40, 0).getTime(),
  });

  assert.equal(result.code, '654321');
  assert.equal(result.mailId, 'new-mail');
});

test('handlePollEmail falls back to row text when the subject node is missing', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
const matchingMail = {
  id: 'mail-1',
  getAttribute(name) {
    if (name === 'aria-label') return 'OpenAI Your temporary ChatGPT verification code 123456';
    return '';
  },
};
const seenCodes = new Set();

function findMailItems() {
  return [matchingMail];
}

function getCurrentMailIds() {
  return new Set();
}

function getMailItemId(item) {
  return item.id;
}

function getMailTimestamp() {
  return new Date(2026, 3, 22, 22, 22, 0, 0).getTime();
}

function getMailSenderText() {
  return '';
}

function getMailSubjectText() {
  return '';
}

function getMailRowText() {
  return 'OpenAI Your temporary ChatGPT verification code 123456';
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function waitForElement() {
  return { click() {} };
}
async function refreshInbox() {}
async function sleep() {}
function log() {}
function persistSeenCodes() {}
function scheduleEmailCleanup() {}
async function openMailAndGetMessageText() {
  return '';
}

${bundle}

return { handlePollEmail };
`)();

  const result = await api.handlePollEmail(8, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 1,
    intervalMs: 1,
    filterAfterTimestamp: 0,
  });

  assert.equal(result.code, '123456');
  assert.equal(result.mailId, 'mail-1');
});

test('handlePollEmail opens matching mail body when preview has no code', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
const matchingMail = {
  id: 'mail-body-1',
  getAttribute(name) {
    if (name === 'aria-label') return 'OpenAI Your temporary ChatGPT login code';
    return '';
  },
};
const seenCodes = new Set();
let openedCount = 0;

function findMailItems() {
  return [matchingMail];
}

function getCurrentMailIds() {
  return new Set();
}

function getMailItemId(item) {
  return item.id;
}

function getMailTimestamp() {
  return new Date(2026, 3, 22, 22, 49, 0, 0).getTime();
}

function getMailSenderText() {
  return 'OpenAI';
}

function getMailSubjectText() {
  return 'Your temporary ChatGPT login code';
}

function getMailRowText() {
  return 'OpenAI Your temporary ChatGPT login code';
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function waitForElement() {
  return { click() {} };
}
async function refreshInbox() {}
async function sleep() {}
function log() {}
function persistSeenCodes() {}
function scheduleEmailCleanup() {}
async function openMailAndGetMessageText() {
  openedCount += 1;
  return 'Enter this temporary verification code to continue: 214203';
}

${bundle}

return { handlePollEmail, getOpenedCount: () => openedCount };
`)();

  const result = await api.handlePollEmail(8, {
    senderFilters: ['openai'],
    subjectFilters: ['verification', 'login'],
    maxAttempts: 1,
    intervalMs: 1,
    filterAfterTimestamp: 0,
  });

  assert.equal(result.code, '214203');
  assert.equal(result.mailId, 'mail-body-1');
  assert.equal(api.getOpenedCount(), 1);
});
