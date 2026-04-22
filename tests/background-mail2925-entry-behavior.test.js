const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mail2925Utils = require('../mail2925-utils.js');

const source = fs.readFileSync('background/mail-2925-session.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925Session;`)(globalScope);

test('ensureMail2925MailboxSession reuses current mailbox page without sending login when page stays on mailList', async () => {
  let currentState = {
    autoRunning: false,
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'acc-1', email: 'acc1@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: 'acc-1',
  };
  let sendCalls = 0;
  let readyCalls = 0;

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 9, url: 'https://2925.com/#/mailList' }),
      },
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    ensureContentScriptReadyOnTab: async () => {
      readyCalls += 1;
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isAutoRunLockedState: () => false,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    reuseOrCreateTab: async () => 9,
    sendToMailContentScriptResilient: async () => {
      sendCalls += 1;
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

  const result = await manager.ensureMail2925MailboxSession({
    accountId: 'acc-1',
    forceRelogin: false,
    allowLoginWhenOnLoginPage: true,
    actionLabel: '步骤 8：确认 2925 邮箱登录态',
  });

  assert.equal(sendCalls, 0);
  assert.equal(readyCalls, 0);
  assert.equal(result.result.usedExistingSession, true);
});

test('ensureMail2925MailboxSession does not require account-pool accounts when pool is off and mailbox page stays on mailList', async () => {
  let currentState = {
    autoRunning: false,
    mail2925UseAccountPool: false,
    mail2925Accounts: [],
    currentMail2925AccountId: null,
  };
  let sendCalls = 0;

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 9, url: 'https://2925.com/#/mailList' }),
      },
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    ensureContentScriptReadyOnTab: async () => {},
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isAutoRunLockedState: () => false,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    reuseOrCreateTab: async () => 9,
    sendToMailContentScriptResilient: async () => {
      sendCalls += 1;
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

  const result = await manager.ensureMail2925MailboxSession({
    accountId: null,
    forceRelogin: false,
    allowLoginWhenOnLoginPage: false,
    actionLabel: '步骤 4：确认 2925 邮箱登录态',
  });

  assert.equal(sendCalls, 0);
  assert.equal(result.result.usedExistingSession, true);
  assert.equal(result.account, null);
});

test('ensureMail2925MailboxSession stops immediately when login page is detected and account pool is off', async () => {
  let currentState = {
    autoRunning: true,
    autoRunPhase: 'running',
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'acc-1', email: 'acc1@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: 'acc-1',
  };
  const stopCalls = [];
  let sendCalls = 0;

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 9, url: 'https://2925.com/login/' }),
      },
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    ensureContentScriptReadyOnTab: async () => {},
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
      stopCalls.push(options);
    },
    reuseOrCreateTab: async () => 9,
    sendToMailContentScriptResilient: async () => {
      sendCalls += 1;
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

  await assert.rejects(
    () => manager.ensureMail2925MailboxSession({
      accountId: 'acc-1',
      forceRelogin: false,
      allowLoginWhenOnLoginPage: false,
      actionLabel: '步骤 4：确认 2925 邮箱登录态',
    }),
    /流程已被用户停止。/
  );

  assert.equal(sendCalls, 0);
  assert.equal(stopCalls.length, 1);
});

test('ensureMail2925MailboxSession logs in when login page is detected and account pool is on', async () => {
  let currentState = {
    autoRunning: false,
    mail2925Accounts: mail2925Utils.normalizeMail2925Accounts([
      { id: 'acc-1', email: 'acc1@2925.com', password: 'p1', enabled: true, lastUsedAt: 10 },
    ]),
    currentMail2925AccountId: 'acc-1',
  };
  let sendCalls = 0;
  let readyCalls = 0;

  const manager = api.createMail2925SessionManager({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 9, url: 'https://2925.com/login/' }),
      },
      cookies: {
        getAll: async () => [],
        remove: async () => ({ ok: true }),
      },
      browsingData: {
        removeCookies: async () => {},
      },
    },
    ensureContentScriptReadyOnTab: async () => {
      readyCalls += 1;
    },
    findMail2925Account: mail2925Utils.findMail2925Account,
    getMail2925AccountStatus: mail2925Utils.getMail2925AccountStatus,
    getState: async () => currentState,
    isAutoRunLockedState: () => false,
    isMail2925AccountAvailable: mail2925Utils.isMail2925AccountAvailable,
    MAIL2925_LIMIT_COOLDOWN_MS: mail2925Utils.MAIL2925_LIMIT_COOLDOWN_MS,
    normalizeMail2925Account: mail2925Utils.normalizeMail2925Account,
    normalizeMail2925Accounts: mail2925Utils.normalizeMail2925Accounts,
    pickMail2925AccountForRun: mail2925Utils.pickMail2925AccountForRun,
    reuseOrCreateTab: async () => 9,
    sendToMailContentScriptResilient: async () => {
      sendCalls += 1;
      return { loggedIn: true, currentView: 'mailbox' };
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

  const result = await manager.ensureMail2925MailboxSession({
    accountId: 'acc-1',
    forceRelogin: false,
    allowLoginWhenOnLoginPage: true,
    actionLabel: '步骤 4：确认 2925 邮箱登录态',
  });

  assert.equal(sendCalls, 1);
  assert.equal(readyCalls, 1);
  assert.equal(result.result.loggedIn, true);
});
