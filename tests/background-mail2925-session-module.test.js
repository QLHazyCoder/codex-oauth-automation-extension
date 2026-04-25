const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mail2925Utils = require('../mail2925-utils.js');

test('background mail2925 session module exposes a factory', () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  assert.equal(typeof api?.createMail2925SessionManager, 'function');
});

test('handleMail2925LimitReachedError disables current account and switches to the next one', async () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  let currentState = {
    mail2925UseAccountPool: true,
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'current', email: 'current@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
      { id: 'next', email: 'next@2925.com', password: 'p2', enabled: true, lastUsedAt: 20 },
    ]),
    currentMail2925AccountId: 'current',
  };
  const events = {
    logs: [],
    dataUpdates: [],
    tabOpens: 0,
    sessionChecks: 0,
  };

  const manager = api.createMail2925SessionManager({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    broadcastDataUpdate: (payload) => {
      events.dataUpdates.push(payload);
    },
    chrome: {
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    reuseOrCreateTab: async () => {
      events.tabOpens += 1;
      return 1;
    },
    sendToMailContentScriptResilient: async () => {
      events.sessionChecks += 1;
      return { loggedIn: true };
    },
    setPersistentSettings: async (payload) => {
      currentState = {
        ...currentState,
        ...payload,
      };
    },
    setState: async (updates) => {
      currentState = {
        ...currentState,
        ...updates,
      };
    },
    throwIfStopped: () => {},
    upsertMail2925AccountInList: mail2925Utils.upsertMail2925AccountInList,
  });

  const error = await manager.handleMail2925LimitReachedError(
    4,
    new Error('MAIL2925_LIMIT_REACHED::子邮箱已达上限邮箱')
  );

  assert.match(error.message, /^MAIL2925_THREAD_TERMINATED::/);
  assert.equal(currentState.currentMail2925AccountId, 'next');
  assert.ok(events.tabOpens >= 1);
  assert.ok(events.sessionChecks >= 1);

  const currentAccount = currentState.mail2925Accounts.find((account) => account.id === 'current');
  assert.equal(currentAccount.lastError, '子邮箱已达上限邮箱');
  assert.ok(currentAccount.disabledUntil > Date.now());
});

test('handleMail2925LimitReachedError requests stop when no next mail2925 account is available', async () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  let currentState = {
    mail2925UseAccountPool: true,
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'only', email: 'only@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: 'only',
  };
  const events = {
    stopCalls: [],
  };

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    requestStop: async (options = {}) => {
      events.stopCalls.push(options);
    },
    reuseOrCreateTab: async () => 1,
    sendToMailContentScriptResilient: async () => ({ loggedIn: true }),
    setPersistentSettings: async (payload) => {
      currentState = {
        ...currentState,
        ...payload,
      };
    },
    setState: async (updates) => {
      currentState = {
        ...currentState,
        ...updates,
      };
    },
    throwIfStopped: () => {},
    upsertMail2925AccountInList: mail2925Utils.upsertMail2925AccountInList,
  });

  const error = await manager.handleMail2925LimitReachedError(
    4,
    new Error('MAIL2925_LIMIT_REACHED::子邮箱已达上限邮箱')
  );

  assert.equal(error.message, '流程已被用户停止。');
  assert.equal(currentState.currentMail2925AccountId, null);
  assert.equal(events.stopCalls.length, 1);
  assert.match(events.stopCalls[0].logMessage, /没有可切换的下一个账号/);
});

test('ensureMail2925MailboxSession requests stop when auto run is active and login does not reach mailbox', async () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  let currentState = {
    autoRunning: true,
    autoRunPhase: 'running',
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'acc-1', email: 'acc1@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: 'acc-1',
  };
  const events = {
    stopCalls: [],
  };

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isAutoRunLockedState: (state) => Boolean(state?.autoRunning) && state?.autoRunPhase === 'running',
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    requestStop: async (options = {}) => {
      events.stopCalls.push(options);
    },
    reuseOrCreateTab: async () => 1,
    sendToMailContentScriptResilient: async () => ({ loggedIn: false }),
    setPersistentSettings: async (payload) => {
      currentState = { ...currentState, ...payload };
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    throwIfStopped: () => {},
    upsertMail2925AccountInList: mail2925Utils.upsertMail2925AccountInList,
  });

  await assert.rejects(
    () => manager.ensureMail2925MailboxSession({
      accountId: 'acc-1',
      forceRelogin: true,
      actionLabel: '步骤 4：确认 2925 邮箱登录态',
    }),
    /流程已被用户停止。/
  );

  assert.equal(events.stopCalls.length, 1);
  assert.match(events.stopCalls[0].logMessage, /登录后仍未进入收件箱/);
});

test('handleMail2925LimitReachedError stops immediately when account pool is off even if another account exists', async () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  let currentState = {
    mail2925UseAccountPool: false,
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'current', email: 'current@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
      { id: 'next', email: 'next@2925.com', password: 'p2', enabled: true, lastUsedAt: 20 },
    ]),
    currentMail2925AccountId: 'current',
  };
  const events = {
    stopCalls: [],
    sessionChecks: 0,
  };

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    requestStop: async (options = {}) => {
      events.stopCalls.push(options);
    },
    reuseOrCreateTab: async () => 1,
    sendToMailContentScriptResilient: async () => {
      events.sessionChecks += 1;
      return { loggedIn: true };
    },
    setPersistentSettings: async (payload) => {
      currentState = { ...currentState, ...payload };
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    throwIfStopped: () => {},
    upsertMail2925AccountInList: mail2925Utils.upsertMail2925AccountInList,
  });

  const error = await manager.handleMail2925LimitReachedError(
    4,
    new Error('MAIL2925_LIMIT_REACHED::子邮箱已达上限邮箱')
  );

  assert.equal(error.message, '流程已被用户停止。');
  assert.equal(events.sessionChecks, 0);
  assert.equal(events.stopCalls.length, 1);
  assert.equal(currentState.currentMail2925AccountId, 'current');
});

test('setCurrentMail2925Account persists currentMail2925AccountId for browser restart restore', async () => {
  const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

  let currentState = {
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'acc-1', email: 'acc1@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: null,
  };
  const persistedUpdates = [];

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {},
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    setPersistentSettings: async (payload) => {
      persistedUpdates.push(payload);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    throwIfStopped: () => {},
    upsertMail2925AccountInList: mail2925Utils.upsertMail2925AccountInList,
  });

  await manager.setCurrentMail2925Account('acc-1');

  assert.equal(currentState.currentMail2925AccountId, 'acc-1');
  assert.deepStrictEqual(persistedUpdates, [
    { currentMail2925AccountId: 'acc-1' },
  ]);
});
