const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_YYDS_MAIL_BASE_URL,
  buildYydsMailHeaders,
  joinYydsMailUrl,
  normalizeYydsMailBaseUrl,
  normalizeYydsMailInbox,
  normalizeYydsMailMessageDetail,
  normalizeYydsMailMessages,
} = require('../yyds-mail-utils.js');

test('normalizeYydsMailBaseUrl defaults to official v1 endpoint and trims trailing slash', () => {
  assert.equal(normalizeYydsMailBaseUrl(''), DEFAULT_YYDS_MAIL_BASE_URL);
  assert.equal(normalizeYydsMailBaseUrl('maliapi.215.im/v1/'), DEFAULT_YYDS_MAIL_BASE_URL);
  assert.equal(normalizeYydsMailBaseUrl('http://127.0.0.1:8787/v1/'), 'http://127.0.0.1:8787/v1');
});

test('buildYydsMailHeaders separates API key creation auth from temp-token read auth', () => {
  assert.deepEqual(buildYydsMailHeaders({ apiKey: 'AC-demo' }, { json: true }), {
    'X-API-Key': 'AC-demo',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  assert.deepEqual(
    buildYydsMailHeaders(
      { apiKey: 'AC-demo', token: 'temp-token' },
      { tempToken: 'temp-token', includeConfigApiKey: false }
    ),
    {
      Authorization: 'Bearer temp-token',
      Accept: 'application/json',
    }
  );
});

test('joinYydsMailUrl appends query parameters to the normalized base URL', () => {
  assert.equal(
    joinYydsMailUrl('https://maliapi.215.im/v1/', '/messages', { address: 'a+b@example.com', limit: 20 }),
    'https://maliapi.215.im/v1/messages?address=a%2Bb%40example.com&limit=20'
  );
});

test('normalizeYydsMailInbox keeps the final returned address and temp token', () => {
  assert.deepEqual(normalizeYydsMailInbox({
    id: 'inbox-1',
    address: 'User@Example.com',
    token: 'jwt-token',
    expiresAt: '2026-03-15T12:00:00Z',
  }), {
    id: 'inbox-1',
    address: 'user@example.com',
    token: 'jwt-token',
    expiresAt: '2026-03-15T12:00:00Z',
    isActive: true,
    createdAt: null,
    raw: {
      id: 'inbox-1',
      address: 'User@Example.com',
      token: 'jwt-token',
      expiresAt: '2026-03-15T12:00:00Z',
    },
  });
});

test('normalizeYydsMailMessages and detail expose Graph-like fields for verification matching', () => {
  const messages = normalizeYydsMailMessages({
    messages: [{
      id: 'msg-1',
      from: { address: 'noreply@tm.openai.com' },
      to: [{ address: 'User@Example.com' }],
      subject: 'OpenAI verification code',
      createdAt: '2026-03-14T12:30:00Z',
    }],
  });
  assert.equal(messages[0].id, 'msg-1');
  assert.equal(messages[0].address, 'user@example.com');
  assert.equal(messages[0].from.emailAddress.address, 'noreply@tm.openai.com');

  const detail = normalizeYydsMailMessageDetail({
    id: 'msg-1',
    subject: 'OpenAI verification code',
    from: { address: 'noreply@tm.openai.com' },
    text: 'Your ChatGPT code is 654321.',
    createdAt: '2026-03-14T12:30:00Z',
  });
  assert.equal(detail.verification_code, '654321');
  assert.match(detail.bodyPreview, /654321/);
});
