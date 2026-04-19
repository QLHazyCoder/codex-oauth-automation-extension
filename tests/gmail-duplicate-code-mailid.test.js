const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/gmail-mail.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((m) => source.indexOf(m)).find((i) => i >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for function ${name}`);

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

async function testSameCodeDifferentMailIdStillAccepted() {
  const api = new Function(`
const chrome = { storage: { session: { async get() { return {}; }, async set() {} } } };
let seenMailIds = new Set(['mail-old']);
let seenMailIdsFlowId = 1700000000000;
const events = [];
const now = new Date();
const timeText = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

${extractFunction('normalizeMinuteTimestamp')}
${extractFunction('getMailIdFromRow')}
${extractFunction('getCurrentMailIds')}
${extractFunction('getRowText')}
${extractFunction('extractMailMeta')}
${extractFunction('parseGmailTimestamp')}
${extractFunction('getMailTimestamp')}
${extractFunction('extractVerificationCode')}
${extractFunction('rowMatchesFilters')}
${extractFunction('extractEmails')}
${extractFunction('isForwarderLikeEmail')}
${extractFunction('emailMatchesTarget')}
${extractFunction('getTargetEmailMatchState')}
${extractFunction('compileRejectPatterns')}
${extractFunction('persistSeenMailIds')}
${extractFunction('ensureSeenMailIdsScopedTo')}
${extractFunction('handlePollEmail')}

function resetStopState() {}
function isStopError() { return false; }
function log(message, level = 'info') { events.push({ message, level }); }
async function waitForElement() {}
async function refreshInbox() {}
async function waitForInboxChangeOrTimeout() { return null; }
async function deleteGmailItem() {}

function isVisible() { return true; }
function getVisibleMailRows() {
  return [
    {
      classList: { contains: () => false },
      querySelector(selector) {
        if (selector.includes('[data-thread-id]')) {
          return { getAttribute(name) { return name === 'data-thread-id' ? 'mail-new' : ''; } };
        }
        if (selector === '.yW .zF, .yW .yP, .zF, .yP') return { textContent: 'OpenAI' };
        if (selector === '.bog .bqe, .y6 .bqe, .bqe') return { textContent: '你的 OpenAI 代码为 642426' };
        if (selector === '.y2') return { textContent: '输入此临时验证码以继续：642426' };
        if (selector === 'td.xW span[title], td.xW span') return { textContent: timeText };
        return null;
      },
      getAttribute(name) {
        if (name === 'aria-labelledby') return '';
        return '';
      },
      id: 'row-mail-new',
      textContent: '',
    },
  ];
}

return {
  handlePollEmail,
  getSeenMailIds() { return [...seenMailIds]; },
  getEvents() { return events; },
};
`)();

  const result = await api.handlePollEmail(7, {
    senderFilters: ['openai', 'noreply'],
    subjectFilters: ['code', '验证'],
    rejectSubjectPatterns: ['sign\\s*up(?:\\s+code)?'],
    maxAttempts: 2,
    intervalMs: 10,
    filterAfterTimestamp: Date.now() - 60_000,
    excludeCodes: [],
    strictChatGPTCodeOnly: false,
    targetEmail: '',
    flowStartTime: 1700000000000,
  });

  assert.deepStrictEqual(result && result.code, '642426', '同码不同 mailId 的新邮件不应被旧 seen code 误杀');
  assert.ok(api.getSeenMailIds().includes('mail-new'), '命中新邮件后应记录其 mailId');
}

(async () => {
  await testSameCodeDifferentMailIdStillAccepted();
  console.log('gmail duplicate code mailId tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
