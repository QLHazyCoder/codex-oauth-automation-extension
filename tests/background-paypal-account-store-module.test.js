const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports paypal account store module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/paypal-account-store\.js/);
  assert.match(source, /paypal-utils\.js/);
});

test('paypal account store module exposes a factory', () => {
  const source = fs.readFileSync('background/paypal-account-store.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundPayPalAccountStore;`)(globalScope);

  assert.equal(typeof api?.createPayPalAccountStore, 'function');
});

test('paypal account store selects account and keeps legacy paypal credentials in sync', async () => {
  const source = fs.readFileSync('background/paypal-account-store.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundPayPalAccountStore;`)(globalScope);

  let latestState = {
    paypalAccounts: [],
    currentPayPalAccountId: '',
    paypalEmail: '',
    paypalPassword: '',
  };
  const broadcasts = [];

  const store = api.createPayPalAccountStore({
    broadcastDataUpdate(payload) {
      broadcasts.push(payload);
    },
    findPayPalAccount(accounts, accountId) {
      return (Array.isArray(accounts) ? accounts : []).find((account) => account.id === accountId) || null;
    },
    getState: async () => latestState,
    normalizePayPalAccount(account = {}) {
      return {
        id: String(account.id || 'generated'),
        email: String(account.email || '').trim().toLowerCase(),
        password: String(account.password || ''),
        createdAt: Number(account.createdAt) || 1,
        updatedAt: Number(account.updatedAt) || 1,
        lastUsedAt: Number(account.lastUsedAt) || 0,
      };
    },
    normalizePayPalAccounts(accounts) {
      return Array.isArray(accounts) ? accounts.slice() : [];
    },
    setPersistentSettings: async (updates) => {
      latestState = { ...latestState, ...updates };
    },
    setState: async (updates) => {
      latestState = { ...latestState, ...updates };
    },
    upsertPayPalAccountInList(accounts, nextAccount) {
      const list = Array.isArray(accounts) ? accounts.slice() : [];
      const existingIndex = list.findIndex((account) => account.id === nextAccount.id);
      if (existingIndex >= 0) {
        list[existingIndex] = nextAccount;
        return list;
      }
      list.push(nextAccount);
      return list;
    },
  });

  const account = await store.upsertPayPalAccount({
    id: 'pp-1',
    email: 'User@Example.com',
    password: 'secret',
  });
  assert.equal(account.email, 'user@example.com');

  const selected = await store.setCurrentPayPalAccount('pp-1');
  assert.equal(selected.id, 'pp-1');
  assert.equal(latestState.currentPayPalAccountId, 'pp-1');
  assert.equal(latestState.paypalEmail, 'user@example.com');
  assert.equal(latestState.paypalPassword, 'secret');
  assert.deepStrictEqual(
    broadcasts.at(-1),
    {
      currentPayPalAccountId: 'pp-1',
      paypalEmail: 'user@example.com',
      paypalPassword: 'secret',
    }
  );
});
