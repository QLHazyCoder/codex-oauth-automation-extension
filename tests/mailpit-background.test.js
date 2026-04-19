const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = index;
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

const getMailConfig = new Function(`
const MOEMAIL_PROVIDER = 'moemail';
const MAILPIT_PROVIDER = 'mailpit';

${extractFunction('getMailConfig')}

return getMailConfig;
`)();

test('getMailConfig treats Mailpit as API provider', () => {
  assert.deepEqual(
    getMailConfig({
      mailProvider: 'mailpit',
      mailpitApiBaseUrl: 'https://tempmail.999125.xyz',
      mailpitDomain: 'ai.gptyyds.ccwu.cc',
    }),
    { provider: 'mailpit', label: 'Mailpit' }
  );
});

const pollMailpitApi = new Function(`
let stopRequested = false;
const logs = [];

function throwIfStopped() {
  if (stopRequested) {
    throw new Error('流程已被用户停止。');
  }
}

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}

function sleepWithStop() {
  return Promise.resolve();
}

function normalizeMailpitMessages(entries) {
  return entries.map((entry) => ({
    id: String(entry.detail?.ID || entry.message?.ID || ''),
    subject: String(entry.detail?.Subject || entry.message?.Subject || ''),
    from: {
      emailAddress: {
        address: String(entry.detail?.From?.Address || entry.message?.From?.Address || ''),
      },
    },
    bodyPreview: String(entry.detail?.Text || ''),
    receivedDateTime: String(entry.detail?.Created || entry.message?.Created || ''),
  }));
}

function normalizeText(value) {
  return String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickVerificationMessageWithTimeFallback(messages, filters = {}) {
  const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
  const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
  const excludedCodes = new Set((filters.excludeCodes || []).filter(Boolean));
  const matched = messages
    .map((message) => {
      const sender = normalizeText(message?.from?.emailAddress?.address);
      const subject = normalizeText(message?.subject);
      const preview = String(message?.bodyPreview || '');
      const codeMatch = preview.match(/\\b(\\d{6})\\b/) || subject.match(/\\b(\\d{6})\\b/);
      const code = codeMatch ? codeMatch[1] : '';
      if (!code || excludedCodes.has(code)) return null;
      const senderMatch = senderFilters.length === 0 || senderFilters.some((item) => sender.includes(item) || normalizeText(preview).includes(item));
      const subjectMatch = subjectFilters.length === 0 || subjectFilters.some((item) => subject.includes(item) || normalizeText(preview).includes(item));
      if (!senderMatch && !subjectMatch) return null;
      return {
        code,
        message,
        receivedAt: normalizeTimestamp(message.receivedDateTime),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.receivedAt - left.receivedAt)[0] || null;

  return {
    match: matched,
    usedTimeFallback: false,
  };
}

async function requestMailpit(endpoint) {
  if (endpoint.startsWith('/api/v1/search')) {
    return {
      messages: [
        {
          ID: 'mail-1',
          Subject: 'OpenAI verification code',
          Created: '2026-04-15T12:00:00Z',
          From: { Address: 'noreply@tm.openai.com' },
        },
      ],
    };
  }
  if (endpoint === '/api/v1/message/mail-1') {
    return {
      ID: 'mail-1',
      Subject: 'OpenAI verification code',
      Created: '2026-04-15T12:00:00Z',
      From: { Address: 'noreply@tm.openai.com' },
      Text: 'Your OpenAI code is 654321.',
    };
  }
  throw new Error('unexpected endpoint: ' + endpoint);
}

${extractFunction('pollMailpitVerificationCode')}

return {
  pollMailpitVerificationCode,
  snapshot() {
    return logs;
  },
};
`)();

test('pollMailpitVerificationCode fetches code from Mailpit API payloads', async () => {
  const result = await pollMailpitApi.pollMailpitVerificationCode(4, {
    email: 'openai@ai.gptyyds.ccwu.cc',
  }, {
    senderFilters: ['openai', 'noreply'],
    subjectFilters: ['verification', 'code'],
    maxAttempts: 1,
    intervalMs: 0,
  });

  assert.equal(result.code, '654321');
  assert.equal(result.mailId, 'mail-1');
  assert.ok(
    pollMailpitApi.snapshot().some((entry) => entry.message.includes('已在 Mailpit 中找到验证码：654321')),
    'should log Mailpit success'
  );
});
