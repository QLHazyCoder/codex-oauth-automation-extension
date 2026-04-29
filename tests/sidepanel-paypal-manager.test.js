const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel loads reusable form dialog and paypal manager before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const formDialogIndex = html.indexOf('<script src="form-dialog.js"></script>');
  const managerIndex = html.indexOf('<script src="paypal-manager.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(formDialogIndex, -1);
  assert.notEqual(managerIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(formDialogIndex < managerIndex);
  assert.ok(managerIndex < sidepanelIndex);
});

test('sidepanel html contains paypal select and add button controls', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-paypal-account"/);
  assert.match(html, /id="select-paypal-account"/);
  assert.match(html, /id="btn-add-paypal-account"/);
  assert.match(html, /id="shared-form-modal"/);
});

test('paypal manager saves a paypal account and selects it immediately', async () => {
  const source = fs.readFileSync('sidepanel/paypal-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelPayPalManager;`)(windowObject);

  let latestState = {
    paypalAccounts: [],
    currentPayPalAccountId: null,
    paypalEmail: '',
    paypalPassword: '',
  };
  const events = [];
  const clickHandlers = {};
  const changeHandlers = {};
  const selectNode = {
    innerHTML: '',
    value: '',
    disabled: false,
    addEventListener(type, handler) {
      changeHandlers[type] = handler;
    },
  };
  const addButton = {
    disabled: false,
    addEventListener(type, handler) {
      clickHandlers[type] = handler;
    },
  };

  const manager = api.createPayPalManager({
    state: {
      getLatestState: () => latestState,
      syncLatestState(updates) {
        latestState = { ...latestState, ...updates };
      },
    },
    dom: {
      btnAddPayPalAccount: addButton,
      selectPayPalAccount: selectNode,
    },
    helpers: {
      escapeHtml: (value) => String(value || ''),
      getPayPalAccounts: (state) => Array.isArray(state?.paypalAccounts) ? state.paypalAccounts : [],
      openFormDialog: async () => ({ email: 'user@example.com', password: 'secret' }),
      showToast(message, tone) {
        events.push({ type: 'toast', message, tone });
      },
    },
    runtime: {
      sendMessage: async (message) => {
        events.push({ type: 'message', message });
        if (message.type === 'UPSERT_PAYPAL_ACCOUNT') {
          return {
            ok: true,
            account: {
              id: 'pp-1',
              email: 'user@example.com',
              password: 'secret',
            },
          };
        }
        if (message.type === 'SELECT_PAYPAL_ACCOUNT') {
          return {
            ok: true,
            account: {
              id: 'pp-1',
              email: 'user@example.com',
              password: 'secret',
            },
          };
        }
        throw new Error(`unexpected message ${message.type}`);
      },
    },
    paypalUtils: {
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
    },
  });

  manager.bindPayPalEvents();
  manager.renderPayPalAccounts();

  assert.match(selectNode.innerHTML, /请先添加 PayPal 账号/);
  clickHandlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(
    events.filter((event) => event.type === 'message').map((event) => event.message.type),
    ['UPSERT_PAYPAL_ACCOUNT', 'SELECT_PAYPAL_ACCOUNT']
  );
  assert.equal(latestState.currentPayPalAccountId, 'pp-1');
  assert.equal(latestState.paypalEmail, 'user@example.com');
  assert.equal(latestState.paypalPassword, 'secret');
  assert.equal(selectNode.value, 'pp-1');
  assert.equal(selectNode.disabled, false);
  assert.match(events.at(-1)?.message || '', /已保存 PayPal 账号/);
});
