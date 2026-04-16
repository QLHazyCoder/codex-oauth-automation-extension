const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports account run history module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/account-run-history\.js/);
});

test('account run history module exposes a factory', () => {
  const source = fs.readFileSync('background/account-run-history.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundAccountRunHistory;`)(globalScope);

  assert.equal(typeof api?.createAccountRunHistoryHelpers, 'function');
});

test('account run history helper normalizes records and persists without helper upload when local helper is disabled', async () => {
  const source = fs.readFileSync('background/account-run-history.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundAccountRunHistory;`)(globalScope);

  let storedHistory = [{ email: 'old@example.com', password: 'old-pass', status: 'success', recordedAt: '2026-04-17T00:00:00.000Z' }];
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('should not call fetch');
  };

  const helpers = api.createAccountRunHistoryHelpers({
    ACCOUNT_RUN_HISTORY_STORAGE_KEY: 'accountRunHistory',
    addLog: async () => {},
    buildLocalHelperEndpoint: (baseUrl, path) => `${baseUrl}${path}`,
    chrome: {
      storage: {
        local: {
          get: async () => ({ accountRunHistory: storedHistory }),
          set: async (payload) => {
            storedHistory = payload.accountRunHistory;
          },
        },
      },
    },
    getErrorMessage: (error) => error?.message || String(error || ''),
    getState: async () => ({
      email: ' latest@example.com ',
      password: ' secret ',
      accountRunHistoryTextEnabled: false,
      accountRunHistoryHelperBaseUrl: '',
    }),
    normalizeAccountRunHistoryHelperBaseUrl: (value) => String(value || '').trim(),
  });

  const record = helpers.buildAccountRunHistoryRecord(
    { email: ' latest@example.com ', password: ' secret ' },
    ' FAILED ',
    ' reason '
  );
  assert.deepStrictEqual(record, {
    email: 'latest@example.com',
    password: 'secret',
    status: 'failed',
    recordedAt: record.recordedAt,
    reason: 'reason',
  });

  const appended = await helpers.appendAccountRunRecord('failed', null, 'boom');
  assert.equal(appended.email, 'latest@example.com');
  assert.equal(appended.status, 'failed');
  assert.equal(storedHistory.length, 2);
  assert.equal(storedHistory[1].reason, 'boom');
  assert.equal(fetchCalled, false);
  assert.equal(helpers.shouldAppendAccountRunTextFile({ accountRunHistoryTextEnabled: false, accountRunHistoryHelperBaseUrl: 'http://127.0.0.1:17373' }), false);
  assert.equal(helpers.shouldAppendAccountRunTextFile({ accountRunHistoryTextEnabled: true, accountRunHistoryHelperBaseUrl: 'http://127.0.0.1:17373' }), true);
});
