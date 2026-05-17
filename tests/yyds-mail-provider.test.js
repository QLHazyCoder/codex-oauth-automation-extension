const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../yyds-mail-utils.js');
require('../background/yyds-mail-provider.js');

function createProviderApi(options = {}) {
  const {
    state = {
      yydsMailApiKey: 'AC-demo',
      yydsMailBaseUrl: 'https://maliapi.215.im/v1',
      currentYydsMailInbox: null,
      email: '',
    },
    fetchImpl,
  } = options;
  let currentState = { ...state };
  const logs = [];
  const persistCalls = [];
  const stateUpdates = [];
  const calls = [];

  const api = globalThis.MultiPageBackgroundYydsMailProvider.createYydsMailProvider({
    addLog: async (message, level) => logs.push({ message, level }),
    buildYydsMailHeaders: utils.buildYydsMailHeaders,
    DEFAULT_YYDS_MAIL_BASE_URL: utils.DEFAULT_YYDS_MAIL_BASE_URL,
    fetchImpl: fetchImpl || (async (url, request = {}) => {
      calls.push({
        url: String(url),
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.parse(request.body) : undefined,
      });
      if (String(url).endsWith('/accounts')) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            success: true,
            data: {
              id: 'inbox-1',
              address: 'fresh@example.com',
              token: 'temp-token',
              expiresAt: '2026-03-15T12:00:00Z',
            },
          }),
        };
      }
      if (String(url).includes('/messages/msg-1')) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            success: true,
            data: {
              id: 'msg-1',
              from: { address: 'noreply@tm.openai.com' },
              subject: 'OpenAI verification code',
              text: 'Your ChatGPT code is 987654.',
              createdAt: '2026-03-14T12:30:00Z',
            },
          }),
        };
      }
      if (String(url).includes('/messages')) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            success: true,
            data: {
              messages: [{
                id: 'msg-1',
                from: { address: 'noreply@tm.openai.com' },
                subject: 'OpenAI verification code',
                createdAt: '2026-03-14T12:30:00Z',
              }],
            },
          }),
        };
      }
      throw new Error(`unexpected URL ${url}`);
    }),
    getState: async () => currentState,
    joinYydsMailUrl: utils.joinYydsMailUrl,
    normalizeYydsMailAddress: utils.normalizeYydsMailAddress,
    normalizeYydsMailApiKey: utils.normalizeYydsMailApiKey,
    normalizeYydsMailBaseUrl: utils.normalizeYydsMailBaseUrl,
    normalizeYydsMailCurrentInbox: utils.normalizeYydsMailCurrentInbox,
    normalizeYydsMailInbox: utils.normalizeYydsMailInbox,
    normalizeYydsMailMessageDetail: utils.normalizeYydsMailMessageDetail,
    normalizeYydsMailMessages: utils.normalizeYydsMailMessages,
    persistRegistrationEmailState: async (callState, email, persistOptions) => {
      persistCalls.push({ state: callState, email, options: persistOptions });
      currentState = { ...currentState, email };
    },
    pickVerificationMessageWithTimeFallback: (messages) => {
      const match = messages.find((message) => message.verification_code);
      return match
        ? {
            match: {
              code: match.verification_code,
              receivedAt: Date.parse(match.receivedDateTime),
              message: match,
            },
            usedRelaxedFilters: false,
            usedTimeFallback: false,
          }
        : { match: null, usedRelaxedFilters: false, usedTimeFallback: false };
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    YYDS_MAIL_PROVIDER: utils.YYDS_MAIL_PROVIDER,
  });

  return {
    ...api,
    snapshot() {
      return { calls, currentState, logs, persistCalls, stateUpdates };
    },
  };
}

test('fetchYydsMailAddress creates an inbox with localPart only and stores the returned address/token', async () => {
  const api = createProviderApi();
  const email = await api.fetchYydsMailAddress(null, { localPart: 'fresh' });
  const snapshot = api.snapshot();

  assert.equal(email, 'fresh@example.com');
  assert.equal(snapshot.calls[0].url, 'https://maliapi.215.im/v1/accounts');
  assert.equal(snapshot.calls[0].method, 'POST');
  assert.deepEqual(snapshot.calls[0].body, { localPart: 'fresh' });
  assert.equal(snapshot.calls[0].headers['X-API-Key'], 'AC-demo');
  assert.equal(snapshot.calls[0].headers.Authorization, undefined);
  assert.equal(snapshot.currentState.currentYydsMailInbox.address, 'fresh@example.com');
  assert.equal(snapshot.currentState.currentYydsMailInbox.token, 'temp-token');
  assert.equal(snapshot.persistCalls[0].email, 'fresh@example.com');
});

test('pollYydsMailVerificationCode lists messages with temp token and reads detail before matching code', async () => {
  const api = createProviderApi({
    state: {
      yydsMailApiKey: 'AC-demo',
      yydsMailBaseUrl: 'https://maliapi.215.im/v1',
      currentYydsMailInbox: {
        id: 'inbox-1',
        address: 'fresh@example.com',
        token: 'temp-token',
      },
      email: 'fresh@example.com',
    },
  });

  const result = await api.pollYydsMailVerificationCode(4, null, {
    maxAttempts: 1,
    intervalMs: 1,
    senderFilters: ['openai'],
    subjectFilters: ['code'],
  });
  const snapshot = api.snapshot();
  const listCall = snapshot.calls.find((call) => call.url.includes('/messages?'));
  const detailCall = snapshot.calls.find((call) => call.url.includes('/messages/msg-1'));

  assert.equal(result.code, '987654');
  assert.equal(listCall.headers.Authorization, 'Bearer temp-token');
  assert.equal(listCall.headers['X-API-Key'], undefined);
  assert.match(listCall.url, /address=fresh%40example\.com/);
  assert.equal(detailCall.headers.Authorization, 'Bearer temp-token');
});

test('clearYydsMailRuntimeState clears current inbox and optionally current email', async () => {
  const api = createProviderApi({
    state: {
      currentYydsMailInbox: { address: 'fresh@example.com', token: 'temp-token' },
      email: 'fresh@example.com',
    },
  });

  await api.clearYydsMailRuntimeState({ clearEmail: true });
  assert.deepEqual(api.snapshot().stateUpdates.at(-1), {
    currentYydsMailInbox: null,
    email: null,
  });
});
