const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

test('syncSelectedMail2925PoolAccount writes selected pool email back to mail2925BaseEmail', async () => {
  const bundle = [
    extractFunction('getMail2925Accounts'),
    extractFunction('getCurrentMail2925Account'),
    extractFunction('getCurrentMail2925Email'),
    extractFunction('isMail2925AccountPoolEnabled'),
    extractFunction('syncMail2925PoolAccountOptions'),
    extractFunction('getPreferredMail2925PoolAccountId'),
    extractFunction('syncSelectedMail2925PoolAccount'),
  ].join('\n');

  const api = new Function(`
let latestState = {
  mail2925UseAccountPool: true,
  mail2925BaseEmail: 'old@2925.com',
  currentMail2925AccountId: '',
  mail2925Accounts: [{ id: 'acc-1', email: 'new@2925.com' }],
};
const selectMail2925PoolAccount = { value: 'acc-1', innerHTML: '' };
const chrome = {
  runtime: {
    async sendMessage() {
      return { account: { id: 'acc-1', email: 'new@2925.com' } };
    },
  },
};
const toastEvents = [];
function syncLatestState(patch) {
  latestState = { ...latestState, ...patch };
}
function setManagedAliasBaseEmailInputForProvider() {}
function showToast(message) {
  toastEvents.push(message);
}
function escapeHtml(value) {
  return String(value || '');
}
${bundle}
return {
  syncSelectedMail2925PoolAccount,
  getLatestState() {
    return latestState;
  },
};
`)();

  await api.syncSelectedMail2925PoolAccount({ silent: true });

  assert.equal(api.getLatestState().currentMail2925AccountId, 'acc-1');
  assert.equal(api.getLatestState().mail2925BaseEmail, 'new@2925.com');
});

test('syncMail2925BaseEmailFromCurrentAccount reuses current pool account email for manual base email field', async () => {
  const bundle = [
    extractFunction('getMail2925Accounts'),
    extractFunction('getCurrentMail2925Account'),
    extractFunction('getCurrentMail2925Email'),
    extractFunction('isMail2925AccountPoolEnabled'),
    extractFunction('syncMail2925BaseEmailFromCurrentAccount'),
  ].join('\n');

  const api = new Function(`
let latestState = {
  mail2925UseAccountPool: true,
  mail2925BaseEmail: 'old@2925.com',
  currentMail2925AccountId: 'acc-1',
  mail2925Accounts: [{ id: 'acc-1', email: 'new@2925.com' }],
};
let saveCalls = 0;
function syncLatestState(patch) {
  latestState = { ...latestState, ...patch };
}
async function saveSettings() {
  saveCalls += 1;
}
${bundle}
return {
  syncMail2925BaseEmailFromCurrentAccount,
  getLatestState() {
    return latestState;
  },
  getSaveCalls() {
    return saveCalls;
  },
};
`)();

  const changed = api.syncMail2925BaseEmailFromCurrentAccount(undefined, { persist: true });
  await Promise.resolve();

  assert.equal(changed, true);
  assert.equal(api.getLatestState().mail2925BaseEmail, 'new@2925.com');
  assert.equal(api.getSaveCalls(), 1);
});
