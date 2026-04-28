const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { pickHotmailAccountForRun } = require('../hotmail-utils.js');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    return '';
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
    return '';
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

const isAuthorizedHotmailRunAccountSource = extractFunction('isAuthorizedHotmailRunAccount');
const isPendingHotmailVerificationCandidateSource = extractFunction('isPendingHotmailVerificationCandidate');
const compareHotmailAccountAllocationPrioritySource = extractFunction('compareHotmailAccountAllocationPriority');
const pickPendingHotmailAccountForVerificationSource = extractFunction('pickPendingHotmailAccountForVerification');
const ensureHotmailAccountForFlowSource = extractFunction('ensureHotmailAccountForFlow');
const ensureHotmailMailboxReadyForAutoRunRoundSource = extractFunction('ensureHotmailMailboxReadyForAutoRunRound');

function createHotmailPreflightApi(initialState, verifyImpl = async () => ({ account: null, messageCount: 0 })) {
  const factory = new Function('deps', `
let currentState = JSON.parse(JSON.stringify(deps.initialState));
const getState = async () => ({
  ...currentState,
  hotmailAccounts: Array.isArray(currentState.hotmailAccounts)
    ? currentState.hotmailAccounts.map((account) => ({ ...account }))
    : [],
});
const normalizeHotmailAccounts = (accounts) => Array.isArray(accounts)
  ? accounts.map((account) => ({ ...account }))
  : [];
const findHotmailAccount = (accounts, accountId) => normalizeHotmailAccounts(accounts)
  .find((account) => account.id === accountId) || null;
const setCurrentHotmailAccount = async (accountId) => {
  const state = await getState();
  const account = findHotmailAccount(state.hotmailAccounts, accountId);
  if (!account) {
    throw new Error('missing Hotmail account');
  }
  currentState = {
    ...currentState,
    currentHotmailAccountId: accountId,
  };
  return account;
};
const pickHotmailAccountForRun = deps.pickHotmailAccountForRun;
const verifyHotmailAccount = async (accountId) => deps.verifyHotmailAccount(accountId, async () => getState());
const isHotmailProvider = (stateOrProvider) => {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === 'hotmail-api';
};
const addLog = async (message, level = 'info') => {
  deps.logs.push({ message, level });
};
const throwIfStopped = () => {};
${isAuthorizedHotmailRunAccountSource}
${isPendingHotmailVerificationCandidateSource}
${compareHotmailAccountAllocationPrioritySource}
${pickPendingHotmailAccountForVerificationSource}
${ensureHotmailAccountForFlowSource}
${ensureHotmailMailboxReadyForAutoRunRoundSource}
return {
  ensureHotmailAccountForFlow,
  ensureHotmailMailboxReadyForAutoRunRound: typeof ensureHotmailMailboxReadyForAutoRunRound === 'function'
    ? ensureHotmailMailboxReadyForAutoRunRound
    : undefined,
  getState,
};
  `);

  const logs = [];
  return {
    api: factory({
      initialState,
      logs,
      pickHotmailAccountForRun,
      verifyHotmailAccount: verifyImpl,
    }),
    logs,
  };
}

test('ensureHotmailAccountForFlow skips excluded current hotmail account when allocating a fresh account', async () => {
  const { api } = createHotmailPreflightApi({
    mailProvider: 'hotmail-api',
    currentHotmailAccountId: 'primary',
    hotmailAccounts: [
      {
        id: 'primary',
        email: 'primary@hotmail.com',
        status: 'authorized',
        refreshToken: 'rt-primary',
        used: false,
        lastUsedAt: 1,
      },
      {
        id: 'backup',
        email: 'backup@hotmail.com',
        status: 'authorized',
        refreshToken: 'rt-backup',
        used: false,
        lastUsedAt: 2,
      },
    ],
  });

  const account = await api.ensureHotmailAccountForFlow({
    allowAllocate: true,
    markUsed: false,
    excludeIds: ['primary'],
  });

  assert.equal(account.id, 'backup');
});

test('ensureHotmailMailboxReadyForAutoRunRound switches to another hotmail account after a verification failure', async () => {
  const verifyCalls = [];
  const { api, logs } = createHotmailPreflightApi({
    mailProvider: 'hotmail-api',
    currentHotmailAccountId: 'primary',
    hotmailAccounts: [
      {
        id: 'primary',
        email: 'primary@hotmail.com',
        status: 'authorized',
        refreshToken: 'rt-primary',
        used: false,
        lastUsedAt: 1,
      },
      {
        id: 'backup',
        email: 'backup@hotmail.com',
        status: 'authorized',
        refreshToken: 'rt-backup',
        used: false,
        lastUsedAt: 2,
      },
    ],
  }, async (accountId, getState) => {
    verifyCalls.push(accountId);
    const state = await getState();
    const account = state.hotmailAccounts.find((item) => item.id === accountId);
    if (accountId === 'primary') {
      throw new Error('INBOX unavailable');
    }
    return {
      account,
      messageCount: 4,
    };
  });

  assert.equal(typeof api.ensureHotmailMailboxReadyForAutoRunRound, 'function');
  const account = await Promise.race([
    api.ensureHotmailMailboxReadyForAutoRunRound({
      targetRun: 1,
      totalRuns: 3,
      attemptRun: 1,
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Hotmail auto-run preflight timed out')), 200);
    }),
  ]);

  const state = await api.getState();

  assert.equal(account.id, 'backup');
  assert.equal(state.currentHotmailAccountId, 'backup');
  assert.deepEqual(verifyCalls, ['primary', 'backup']);
  assert.ok(logs.some(({ message }) => /切换下一个 Hotmail 账号/.test(message)));
});

test('ensureHotmailMailboxReadyForAutoRunRound verifies pending hotmail accounts when no authorized account exists yet', async () => {
  const verifyCalls = [];
  const { api } = createHotmailPreflightApi({
    mailProvider: 'hotmail-api',
    currentHotmailAccountId: null,
    hotmailAccounts: [
      {
        id: 'pending-1',
        email: 'pending-1@hotmail.com',
        status: 'pending',
        refreshToken: 'rt-pending-1',
        used: false,
        lastUsedAt: 0,
      },
    ],
  }, async (accountId, getState) => {
    verifyCalls.push(accountId);
    const state = await getState();
    const account = state.hotmailAccounts.find((item) => item.id === accountId);
    return {
      account: {
        ...account,
        status: 'authorized',
      },
      messageCount: 2,
    };
  });

  const account = await api.ensureHotmailMailboxReadyForAutoRunRound({
    targetRun: 1,
    totalRuns: 1,
    attemptRun: 1,
  });
  const state = await api.getState();

  assert.equal(account.id, 'pending-1');
  assert.equal(state.currentHotmailAccountId, 'pending-1');
  assert.deepEqual(verifyCalls, ['pending-1']);
});

test('ensureHotmailMailboxReadyForAutoRunRound falls back to pending hotmail accounts after authorized accounts fail', async () => {
  const verifyCalls = [];
  const { api, logs } = createHotmailPreflightApi({
    mailProvider: 'hotmail-api',
    currentHotmailAccountId: 'authorized-primary',
    hotmailAccounts: [
      {
        id: 'authorized-primary',
        email: 'authorized-primary@hotmail.com',
        status: 'authorized',
        refreshToken: 'rt-authorized-primary',
        used: false,
        lastUsedAt: 1,
      },
      {
        id: 'pending-backup',
        email: 'pending-backup@hotmail.com',
        status: 'pending',
        refreshToken: 'rt-pending-backup',
        used: false,
        lastUsedAt: 2,
      },
    ],
  }, async (accountId, getState) => {
    verifyCalls.push(accountId);
    const state = await getState();
    const account = state.hotmailAccounts.find((item) => item.id === accountId);
    if (accountId === 'authorized-primary') {
      throw new Error('INBOX unavailable');
    }
    return {
      account: {
        ...account,
        status: 'authorized',
      },
      messageCount: 3,
    };
  });

  const account = await Promise.race([
    api.ensureHotmailMailboxReadyForAutoRunRound({
      targetRun: 1,
      totalRuns: 2,
      attemptRun: 1,
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Hotmail auto-run pending fallback timed out')), 200);
    }),
  ]);

  const state = await api.getState();

  assert.equal(account.id, 'pending-backup');
  assert.equal(state.currentHotmailAccountId, 'pending-backup');
  assert.deepEqual(verifyCalls, ['authorized-primary', 'pending-backup']);
  assert.ok(logs.some(({ message }) => /待校验|未校验/.test(message)));
});
