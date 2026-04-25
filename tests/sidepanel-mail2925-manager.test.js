const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function createAccountPoolUiStub() {
  return {
    createAccountPoolFormController({
      formShell,
      toggleButton,
      hiddenLabel = '添加账号',
      visibleLabel = '取消添加',
      onClear,
      onFocus,
    } = {}) {
      let visible = false;

      function sync() {
        if (formShell) {
          formShell.hidden = !visible;
        }
        if (toggleButton) {
          toggleButton.textContent = visible ? visibleLabel : hiddenLabel;
          toggleButton.setAttribute?.('aria-expanded', String(visible));
        }
      }

      function setVisible(nextVisible, options = {}) {
        visible = Boolean(nextVisible);
        if (options.clearForm) {
          onClear?.();
        }
        sync();
        if (visible && options.focusField) {
          onFocus?.();
        }
      }

      sync();
      return {
        isVisible: () => visible,
        setVisible,
        sync,
      };
    },
  };
}

test('sidepanel loads mail2925 manager before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const helperIndex = html.indexOf('<script src="account-pool-ui.js"></script>');
  const managerIndex = html.indexOf('<script src="mail-2925-manager.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(helperIndex, -1);
  assert.notEqual(managerIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(helperIndex < managerIndex);
  assert.ok(managerIndex < sidepanelIndex);
});

test('sidepanel html contains mail2925 pool toggle and selector controls', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="input-mail2925-use-account-pool"/);
  assert.match(html, /id="select-mail2925-pool-account"/);
  assert.match(html, /id="btn-toggle-mail2925-form"/);
  assert.match(html, /id="mail2925-form-shell"/);
  assert.doesNotMatch(html, /id="btn-cancel-mail2925-edit"/);
});

test('sidepanel css keeps collapsed shared mailbox list near a single card height', () => {
  const css = fs.readFileSync('sidepanel/sidepanel.css', 'utf8');
  assert.match(css, /\.hotmail-list-shell\.is-collapsed\s*\{\s*max-height:\s*176px;\s*\}/);
});

test('mail2925 manager exposes a factory and renders empty state', () => {
  const source = fs.readFileSync('sidepanel/mail-2925-manager.js', 'utf8');
  const windowObject = {
    SidepanelAccountPoolUi: createAccountPoolUiStub(),
  };
  const localStorageMock = {
    getItem() {
      return null;
    },
    setItem() {},
  };

  const api = new Function('window', 'localStorage', `${source}; return window.SidepanelMail2925Manager;`)(
    windowObject,
    localStorageMock
  );

  assert.equal(typeof api?.createMail2925Manager, 'function');

  const mail2925AccountsList = { innerHTML: '', addEventListener() {} };
  const formToggleButton = {
    textContent: '',
    disabled: false,
    setAttribute() {},
    addEventListener() {},
  };
  const toggleButton = {
    textContent: '',
    disabled: false,
    setAttribute() {},
    addEventListener() {},
  };
  const noopClassList = { toggle() {} };

  const manager = api.createMail2925Manager({
    state: {
      getLatestState: () => ({ currentMail2925AccountId: null, mail2925Accounts: [] }),
      syncLatestState() {},
    },
    dom: {
      btnAddMail2925Account: { disabled: false, addEventListener() {} },
      btnDeleteAllMail2925Accounts: { textContent: '', disabled: false, addEventListener() {} },
      btnImportMail2925Accounts: { disabled: false, addEventListener() {} },
      btnToggleMail2925Form: formToggleButton,
      btnToggleMail2925List: toggleButton,
      inputMail2925Email: { value: '' },
      inputMail2925Import: { value: '' },
      inputMail2925Password: { value: '' },
      mail2925AccountsList,
      mail2925FormShell: { hidden: true },
      mail2925ListShell: { classList: noopClassList },
    },
    helpers: {
      getMail2925Accounts: () => [],
      escapeHtml: (value) => String(value || ''),
      showToast() {},
      openConfirmModal: async () => true,
      copyTextToClipboard: async () => {},
      refreshManagedAliasBaseEmail() {},
    },
    runtime: {
      sendMessage: async () => ({}),
    },
    constants: {
      copyIcon: '',
      displayTimeZone: 'Asia/Shanghai',
      expandedStorageKey: 'multipage-mail2925-list-expanded',
    },
    mail2925Utils: {},
  });

  assert.equal(typeof manager.renderMail2925Accounts, 'function');
  assert.equal(typeof manager.bindMail2925Events, 'function');
  assert.equal(typeof manager.initMail2925ListExpandedState, 'function');

  manager.renderMail2925Accounts();
  assert.match(mail2925AccountsList.innerHTML, /还没有 2925 账号/);
});

test('mail2925 manager toggles form container from header button', () => {
  const source = fs.readFileSync('sidepanel/mail-2925-manager.js', 'utf8');
  const windowObject = {
    SidepanelAccountPoolUi: createAccountPoolUiStub(),
  };
  const localStorageMock = {
    getItem() {
      return null;
    },
    setItem() {},
  };

  const api = new Function('window', 'localStorage', `${source}; return window.SidepanelMail2925Manager;`)(
    windowObject,
    localStorageMock
  );

  const clickHandlers = {};
  const formToggleButton = {
    textContent: '',
    disabled: false,
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(type, handler) {
      clickHandlers[type] = handler;
    },
  };
  const formShell = { hidden: true };

  const manager = api.createMail2925Manager({
    state: {
      getLatestState: () => ({ currentMail2925AccountId: null, mail2925Accounts: [] }),
      syncLatestState() {},
    },
    dom: {
      btnAddMail2925Account: { textContent: '', disabled: false, addEventListener() {} },
      btnDeleteAllMail2925Accounts: { textContent: '', disabled: false, addEventListener() {} },
      btnImportMail2925Accounts: { disabled: false, addEventListener() {} },
      btnToggleMail2925Form: formToggleButton,
      btnToggleMail2925List: { textContent: '', disabled: false, setAttribute() {}, addEventListener() {} },
      inputMail2925Email: { value: '', focus() { this.focused = true; } },
      inputMail2925Import: { value: '' },
      inputMail2925Password: { value: '' },
      mail2925AccountsList: { innerHTML: '', addEventListener() {} },
      mail2925FormShell: formShell,
      mail2925ListShell: { classList: { toggle() {} } },
    },
    helpers: {
      getMail2925Accounts: () => [],
      escapeHtml: (value) => String(value || ''),
      showToast() {},
      openConfirmModal: async () => true,
      copyTextToClipboard: async () => {},
      refreshManagedAliasBaseEmail() {},
    },
    runtime: {
      sendMessage: async () => ({}),
    },
    constants: {
      copyIcon: '',
      displayTimeZone: 'Asia/Shanghai',
      expandedStorageKey: 'multipage-mail2925-list-expanded',
    },
    mail2925Utils: {},
  });

  manager.bindMail2925Events();
  assert.equal(formShell.hidden, true);
  assert.equal(formToggleButton.textContent, '添加账号');

  clickHandlers.click();
  assert.equal(formShell.hidden, false);
  assert.equal(formToggleButton.textContent, '取消添加');

  clickHandlers.click();
  assert.equal(formShell.hidden, true);
  assert.equal(formToggleButton.textContent, '添加账号');
});

test('mail2925 manager hides form after save succeeds', async () => {
  const source = fs.readFileSync('sidepanel/mail-2925-manager.js', 'utf8');
  const windowObject = {
    SidepanelAccountPoolUi: createAccountPoolUiStub(),
  };
  const localStorageMock = {
    getItem() {
      return null;
    },
    setItem() {},
  };

  const api = new Function('window', 'localStorage', `${source}; return window.SidepanelMail2925Manager;`)(
    windowObject,
    localStorageMock
  );

  let latestState = { currentMail2925AccountId: null, mail2925Accounts: [] };
  const handlers = {};
  const formToggleButton = {
    textContent: '',
    disabled: false,
    setAttribute() {},
    addEventListener(type, handler) {
      if (type === 'click') handlers.toggle = handler;
    },
  };
  const addButton = {
    textContent: '',
    disabled: false,
    addEventListener(type, handler) {
      if (type === 'click') handlers.add = handler;
    },
  };
  const formShell = { hidden: true };
  const inputMail2925Email = { value: '', focus() {} };
  const inputMail2925Password = { value: '' };
  const toastMessages = [];

  const manager = api.createMail2925Manager({
    state: {
      getLatestState: () => latestState,
      syncLatestState(patch) {
        latestState = { ...latestState, ...patch };
      },
    },
    dom: {
      btnAddMail2925Account: addButton,
      btnDeleteAllMail2925Accounts: { textContent: '', disabled: false, addEventListener() {} },
      btnImportMail2925Accounts: { disabled: false, addEventListener() {} },
      btnToggleMail2925Form: formToggleButton,
      btnToggleMail2925List: { textContent: '', disabled: false, setAttribute() {}, addEventListener() {} },
      inputMail2925Email,
      inputMail2925Import: { value: '' },
      inputMail2925Password,
      mail2925AccountsList: { innerHTML: '', addEventListener() {} },
      mail2925FormShell: formShell,
      mail2925ListShell: { classList: { toggle() {} } },
    },
    helpers: {
      getMail2925Accounts: (state) => state.mail2925Accounts || [],
      escapeHtml: (value) => String(value || ''),
      showToast(message) {
        toastMessages.push(message);
      },
      openConfirmModal: async () => true,
      copyTextToClipboard: async () => {},
      refreshManagedAliasBaseEmail() {},
    },
    runtime: {
      sendMessage: async () => ({
        account: {
          id: 'acc-1',
          email: 'demo@2925.com',
          password: 'secret',
          enabled: true,
          lastLoginAt: 0,
          lastUsedAt: 0,
          lastLimitAt: 0,
          disabledUntil: 0,
          lastError: '',
        },
      }),
    },
    constants: {
      copyIcon: '',
      displayTimeZone: 'Asia/Shanghai',
      expandedStorageKey: 'multipage-mail2925-list-expanded',
    },
    mail2925Utils: {
      upsertMail2925AccountInList: (accounts, nextAccount) => accounts.concat(nextAccount),
    },
  });

  manager.bindMail2925Events();
  handlers.toggle();
  inputMail2925Email.value = 'demo@2925.com';
  inputMail2925Password.value = 'secret';

  await handlers.add();

  assert.equal(formShell.hidden, true);
  assert.equal(formToggleButton.textContent, '添加账号');
  assert.equal(addButton.textContent, '添加账号');
  assert.equal(inputMail2925Email.value, '');
  assert.equal(inputMail2925Password.value, '');
  assert.match(toastMessages.at(-1) || '', /已保存 2925 账号/);
});
