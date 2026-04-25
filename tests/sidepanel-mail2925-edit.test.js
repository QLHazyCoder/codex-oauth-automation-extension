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

test('sidepanel html contains collapsible mail2925 form controls', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="btn-toggle-mail2925-form"/);
  assert.match(html, /id="mail2925-form-shell"/);
  assert.doesNotMatch(html, /id="btn-cancel-mail2925-edit"/);
});

test('mail2925 manager renders edit action for existing accounts', () => {
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

  const mail2925AccountsList = { innerHTML: '', addEventListener() {} };
  const manager = api.createMail2925Manager({
    state: {
      getLatestState: () => ({
        currentMail2925AccountId: 'acc-1',
        mail2925Accounts: [{
          id: 'acc-1',
          email: 'demo@2925.com',
          password: 'secret',
          enabled: true,
          lastLoginAt: 0,
          lastUsedAt: 0,
          lastLimitAt: 0,
          disabledUntil: 0,
          lastError: '',
        }],
      }),
      syncLatestState() {},
    },
    dom: {
      btnAddMail2925Account: { textContent: '', disabled: false, addEventListener() {} },
      btnDeleteAllMail2925Accounts: { textContent: '', disabled: false, addEventListener() {} },
      btnImportMail2925Accounts: { disabled: false, addEventListener() {} },
      btnToggleMail2925Form: { textContent: '', setAttribute() {}, addEventListener() {} },
      btnToggleMail2925List: { textContent: '', disabled: false, setAttribute() {}, addEventListener() {} },
      inputMail2925Email: { value: '' },
      inputMail2925Import: { value: '' },
      inputMail2925Password: { value: '' },
      mail2925AccountsList,
      mail2925FormShell: { hidden: true },
      mail2925ListShell: { classList: { toggle() {} } },
    },
    helpers: {
      getMail2925Accounts: (state) => state.mail2925Accounts || [],
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
    mail2925Utils: {
      getMail2925AccountStatus: () => 'ready',
      getMail2925ListToggleLabel: () => '展开列表（1）',
      upsertMail2925AccountInList: (_accounts, nextAccount) => [nextAccount],
    },
  });

  manager.renderMail2925Accounts();
  assert.match(mail2925AccountsList.innerHTML, /data-account-action="edit"/);
});
