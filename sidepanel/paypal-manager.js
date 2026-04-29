(function attachSidepanelPayPalManager(globalScope) {
  function createPayPalManager(context = {}) {
    const {
      state,
      dom,
      helpers,
      runtime,
      paypalUtils = {},
    } = context;

    let actionInFlight = false;

    function getPayPalAccounts(currentState = state.getLatestState()) {
      return helpers.getPayPalAccounts(currentState);
    }

    function getCurrentPayPalAccountId(currentState = state.getLatestState()) {
      return String(currentState?.currentPayPalAccountId || '').trim();
    }

    function buildSelectOptions(accounts = []) {
      if (!accounts.length) {
        return '<option value="">请先添加 PayPal 账号</option>';
      }
      return accounts.map((account) => (
        `<option value="${helpers.escapeHtml(account.id)}">${helpers.escapeHtml(account.email || '(未命名账号)')}</option>`
      )).join('');
    }

    function applyPayPalAccountMutation(account) {
      if (!account?.id) return;
      const latestState = state.getLatestState();
      const nextAccounts = typeof paypalUtils.upsertPayPalAccountInList === 'function'
        ? paypalUtils.upsertPayPalAccountInList(getPayPalAccounts(latestState), account)
        : [...getPayPalAccounts(latestState), account];
      state.syncLatestState({ paypalAccounts: nextAccounts });
      renderPayPalAccounts();
    }

    function renderPayPalAccounts() {
      if (!dom.selectPayPalAccount) return;

      const latestState = state.getLatestState();
      const accounts = getPayPalAccounts(latestState);
      const currentId = getCurrentPayPalAccountId(latestState);

      dom.selectPayPalAccount.innerHTML = buildSelectOptions(accounts);
      dom.selectPayPalAccount.disabled = accounts.length === 0;
      dom.selectPayPalAccount.value = accounts.some((account) => account.id === currentId) ? currentId : '';
    }

    async function syncSelectedPayPalAccount(options = {}) {
      const { silent = false } = options;
      const accountId = String(dom.selectPayPalAccount?.value || '').trim();
      if (!accountId) {
        state.syncLatestState({
          currentPayPalAccountId: null,
          paypalEmail: '',
          paypalPassword: '',
        });
        renderPayPalAccounts();
        return null;
      }

      const response = await runtime.sendMessage({
        type: 'SELECT_PAYPAL_ACCOUNT',
        source: 'sidepanel',
        payload: { accountId },
      });
      if (response?.error) {
        throw new Error(response.error);
      }

      state.syncLatestState({
        currentPayPalAccountId: response.account?.id || accountId,
        paypalEmail: String(response.account?.email || '').trim(),
        paypalPassword: String(response.account?.password || ''),
      });
      renderPayPalAccounts();
      if (!silent) {
        helpers.showToast(`已切换当前 PayPal 账号为 ${response.account?.email || accountId}`, 'success', 1800);
      }
      return response.account || null;
    }

    async function openPayPalAccountDialog() {
      if (typeof helpers.openFormDialog !== 'function') {
        throw new Error('表单弹窗能力未加载，请刷新扩展后重试。');
      }
      return helpers.openFormDialog({
        title: '添加 PayPal 账号',
        confirmLabel: '保存账号',
        confirmVariant: 'btn-primary',
        fields: [
          {
            key: 'email',
            label: 'PayPal 账号',
            type: 'text',
            placeholder: '请输入 PayPal 登录邮箱',
            autocomplete: 'username',
            required: true,
            requiredMessage: '请先填写 PayPal 账号。',
            validate: (value) => {
              const normalized = String(value || '').trim();
              if (!normalized.includes('@')) {
                return 'PayPal 账号需填写邮箱格式。';
              }
              return '';
            },
          },
          {
            key: 'password',
            label: 'PayPal 密码',
            type: 'password',
            placeholder: '请输入 PayPal 登录密码',
            autocomplete: 'current-password',
            required: true,
            requiredMessage: '请先填写 PayPal 密码。',
          },
        ],
      });
    }

    async function handleAddPayPalAccount() {
      if (actionInFlight) return;

      const formValues = await openPayPalAccountDialog();
      if (!formValues) {
        return;
      }

      actionInFlight = true;
      if (dom.btnAddPayPalAccount) {
        dom.btnAddPayPalAccount.disabled = true;
      }

      try {
        const response = await runtime.sendMessage({
          type: 'UPSERT_PAYPAL_ACCOUNT',
          source: 'sidepanel',
          payload: {
            email: String(formValues.email || '').trim(),
            password: String(formValues.password || ''),
          },
        });
        if (response?.error) {
          throw new Error(response.error);
        }

        applyPayPalAccountMutation(response.account);
        if (response.account?.id) {
          state.syncLatestState({ currentPayPalAccountId: response.account.id });
          renderPayPalAccounts();
          dom.selectPayPalAccount.value = response.account.id;
          await syncSelectedPayPalAccount({ silent: true });
        }
        helpers.showToast(`已保存 PayPal 账号 ${response.account?.email || ''}`, 'success', 2200);
      } catch (error) {
        helpers.showToast(`保存 PayPal 账号失败：${error.message}`, 'error');
        throw error;
      } finally {
        actionInFlight = false;
        if (dom.btnAddPayPalAccount) {
          dom.btnAddPayPalAccount.disabled = false;
        }
      }
    }

    function bindPayPalEvents() {
      dom.btnAddPayPalAccount?.addEventListener('click', () => {
        void handleAddPayPalAccount();
      });
      dom.selectPayPalAccount?.addEventListener('change', () => {
        void syncSelectedPayPalAccount().catch((error) => {
          helpers.showToast(error.message, 'error');
          renderPayPalAccounts();
        });
      });
    }

    return {
      bindPayPalEvents,
      renderPayPalAccounts,
      syncSelectedPayPalAccount,
    };
  }

  globalScope.SidepanelPayPalManager = {
    createPayPalManager,
  };
})(window);
