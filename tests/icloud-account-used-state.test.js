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

function createApi(initial = {}) {
  const initialJson = JSON.stringify(initial);
  return new Function(`
const ACCOUNT_STATUS_REGISTERED = 'registered';
const ACCOUNT_STATUS_AUTHORIZED = 'authorized';
const INITIAL = ${initialJson};

${extractFunction('normalizeEmailKey')}
${extractFunction('compareAccountStatusPriority')}
${extractFunction('normalizeImportedAccountRecord')}
${extractFunction('mergeAccountRecords')}
${extractFunction('upsertCurrentAccountRecord')}

let currentState = {
  email: 'alias@icloud.com',
  password: 'pw',
  accounts: [],
  ...INITIAL,
};
let importedState = {
  accounts: [],
  manualAliasUsage: {},
  preservedAliases: {},
  ...(INITIAL.importedState || {}),
};
const accountBroadcasts = [];
const aliasBroadcasts = [];

async function getState() {
  return currentState;
}

async function getImportedAccountState() {
  return importedState;
}

async function setState(updates) {
  currentState = { ...currentState, ...updates };
}

async function setImportedAccountState(updates) {
  importedState = { ...importedState, ...updates };
}

function broadcastAccountsChanged(payload) {
  accountBroadcasts.push(payload);
}

function broadcastIcloudAliasesChanged(payload) {
  aliasBroadcasts.push(payload);
}

return {
  upsertCurrentAccountRecord,
  snapshot() {
    return {
      currentState,
      importedState,
      accountBroadcasts,
      aliasBroadcasts,
    };
  },
};
`)();
}

test('upsertCurrentAccountRecord marks alias as used and emits alias refresh signal', async () => {
  const api = createApi();

  await api.upsertCurrentAccountRecord('authorized');
  const snapshot = api.snapshot();

  assert.equal(snapshot.currentState.accounts.length, 1);
  assert.equal(snapshot.currentState.accounts[0].status, 'authorized');
  assert.equal(snapshot.importedState.manualAliasUsage['alias@icloud.com'], true);
  assert.equal(snapshot.aliasBroadcasts.length, 1);
  assert.deepEqual(snapshot.aliasBroadcasts[0], {
    reason: 'used-updated',
    email: 'alias@icloud.com',
    used: true,
  });
});

test('upsertCurrentAccountRecord upgrades status while preserving used marker', async () => {
  const api = createApi({
    accounts: [{ email: 'alias@icloud.com', password: 'pw', createdAt: '2026-04-17T00:00:00Z', status: 'registered' }],
    importedState: {
      accounts: [{ email: 'alias@icloud.com', password: 'pw', createdAt: '2026-04-17T00:00:00Z', status: 'registered' }],
      manualAliasUsage: { 'alias@icloud.com': true },
      preservedAliases: {},
    },
  });

  await api.upsertCurrentAccountRecord('authorized');
  const snapshot = api.snapshot();

  assert.equal(snapshot.currentState.accounts.length, 1);
  assert.equal(snapshot.currentState.accounts[0].status, 'authorized');
  assert.equal(snapshot.importedState.manualAliasUsage['alias@icloud.com'], true);
  assert.equal(snapshot.aliasBroadcasts.length, 1);
});
