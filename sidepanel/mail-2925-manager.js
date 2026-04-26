(function attachSidepanelMail2925Manager(globalScope) {
  function createMail2925Manager(context = {}) {
    const {
      state,
      dom,
      helpers,
      runtime,
      constants = {},
      mail2925Utils = {},
    } = context;

    const expandedStorageKey = constants.expandedStorageKey || 'multipage-mail2925-list-expanded';
    const displayTimeZone = constants.displayTimeZone || 'Asia/Shanghai';
    const copyIcon = constants.copyIcon || '';
    const createAccountPoolFormController = globalScope.SidepanelAccountPoolUi?.createAccountPoolFormController;

    let actionInFlight = false;
    let listExpanded = false;
    let editingAccountId = '';
    let searchTerm = '';
    let filterMode = 'all';

    function getMail2925Accounts(currentState = state.getLatestState()) {
      return helpers.getMail2925Accounts(currentState);
    }

    function getCurrentMail2925AccountId(currentState = state.getLatestState()) {
      return String(currentState?.currentMail2925AccountId || '');
    }

    function updateMail2925ListViewport() {
      const count = getMail2925Accounts().length;
      if (dom.btnDeleteAllMail2925Accounts) {
        dom.btnDeleteAllMail2925Accounts.textContent = `全部删除${count > 0 ? `（${count}）` : ''}`;
        dom.btnDeleteAllMail2925Accounts.disabled = count === 0;
      }
      if (dom.btnToggleMail2925List) {
        const label = typeof mail2925Utils.getMail2925ListToggleLabel === 'function'
          ? mail2925Utils.getMail2925ListToggleLabel(listExpanded, count)
          : `${listExpanded ? '收起列表' : '展开列表'}${count > 0 ? `（${count}）` : ''}`;
        dom.btnToggleMail2925List.textContent = label;
        dom.btnToggleMail2925List.setAttribute('aria-expanded', String(listExpanded));
        dom.btnToggleMail2925List.disabled = count === 0;
      }
      if (dom.mail2925ListShell) {
        dom.mail2925ListShell.classList.toggle('is-expanded', listExpanded);
        dom.mail2925ListShell.classList.toggle('is-collapsed', !listExpanded);
      }
    }

    function setMail2925ListExpanded(expanded, options = {}) {
      const { persist = true } = options;
      listExpanded = Boolean(expanded);
      updateMail2925ListViewport();
      if (persist) {
        localStorage.setItem(expandedStorageKey, listExpanded ? '1' : '0');
      }
    }

    function initMail2925ListExpandedState() {
      const saved = localStorage.getItem(expandedStorageKey);
      setMail2925ListExpanded(saved === '1', { persist: false });
    }

    function formatDateTime(timestamp) {
      const value = Number(timestamp);
      if (!Number.isFinite(value) || value <= 0) {
        return '未记录';
      }
      return new Date(value).toLocaleString('zh-CN', {
        hour12: false,
        timeZone: displayTimeZone,
      });
    }

    function getStatusSnapshot(account) {
      const status = typeof mail2925Utils.getMail2925AccountStatus === 'function'
        ? mail2925Utils.getMail2925AccountStatus(account, Date.now())
        : 'ready';
      switch (status) {
        case 'cooldown':
          return { label: '冷却中', className: 'status-used' };
        case 'disabled':
          return { label: '已禁用', className: 'status-disabled' };
        case 'error':
          return { label: '异常', className: 'status-error' };
        case 'pending':
          return { label: '待完善', className: 'status-pending' };
        default:
          return { label: '可用', className: 'status-authorized' };
      }
    }

    function normalizeSearchText(value = '') {
      return String(value || '').trim().toLowerCase();
    }

    function getStatusKey(account) {
      return typeof mail2925Utils.getMail2925AccountStatus === 'function'
        ? mail2925Utils.getMail2925AccountStatus(account, Date.now())
        : 'ready';
    }

    function getFilteredMail2925Accounts(accounts, currentId = '') {
      const normalizedSearchTerm = normalizeSearchText(searchTerm);
      return accounts.filter((account) => {
        const statusKey = getStatusKey(account);
        const status = getStatusSnapshot(account);
        const isCurrent = Boolean(currentId) && account.id === currentId;
        const matchesFilter = (() => {
          switch (filterMode) {
            case 'current': return isCurrent;
            case 'ready': return statusKey === 'ready';
            case 'cooldown': return statusKey === 'cooldown';
            case 'disabled': return statusKey === 'disabled';
            case 'error': return statusKey === 'error';
            default: return true;
          }
        })();

        if (!matchesFilter) return false;
        if (!normalizedSearchTerm) return true;

        const haystack = [
          account.email,
          statusKey,
          status.label,
          isCurrent ? 'current 当前' : '',
        ].join(' ').toLowerCase();

        return haystack.includes(normalizedSearchTerm);
      });
    }

    function refreshManagedAliasBaseEmail() {
      if (typeof helpers.refreshManagedAliasBaseEmail === 'function') {
        helpers.refreshManagedAliasBaseEmail();
      }
    }

    function applyMail2925AccountMutation(account) {
      if (!account?.id) return;
      const latestState = state.getLatestState();
      const currentId = getCurrentMail2925AccountId(latestState);
      const nextAccounts = typeof mail2925Utils.upsertMail2925AccountInList === 'function'
        ? mail2925Utils.upsertMail2925AccountInList(getMail2925Accounts(latestState), account)
        : getMail2925Accounts(latestState).map((item) => (item.id === account.id ? account : item));

      const nextState = {
        mail2925Accounts: nextAccounts,
      };
      if (currentId === account.id && account.enabled === false) {
        nextState.currentMail2925AccountId = null;
      }
      state.syncLatestState(nextState);
      refreshManagedAliasBaseEmail();
      renderMail2925Accounts();
    }

    function clearMail2925Form() {
      if (dom.inputMail2925Email) dom.inputMail2925Email.value = '';
      if (dom.inputMail2925Password) dom.inputMail2925Password.value = '';
    }

    const formController = typeof createAccountPoolFormController === 'function'
      ? createAccountPoolFormController({
        formShell: dom.mail2925FormShell,
        toggleButton: dom.btnToggleMail2925Form,
        hiddenLabel: '添加账号',
        visibleLabel: '取消添加',
        onClear: () => {
          stopEditingAccount({ clearForm: true });
        },
        onFocus: () => {
          dom.inputMail2925Email?.focus?.();
        },
      })
      : {
        isVisible: () => false,
        setVisible() {},
        sync() {},
      };

    function syncEditUi() {
      if (dom.btnAddMail2925Account) {
        dom.btnAddMail2925Account.textContent = editingAccountId ? '保存修改' : '添加账号';
      }
    }

    function startEditingAccount(account) {
      if (!account?.id) return;
      editingAccountId = account.id;
      if (dom.inputMail2925Email) dom.inputMail2925Email.value = String(account.email || '').trim();
      if (dom.inputMail2925Password) dom.inputMail2925Password.value = String(account.password || '');
      formController.setVisible(true, { focusField: false });
      syncEditUi();
    }

    function stopEditingAccount(options = {}) {
      const { clearForm = true } = options;
      editingAccountId = '';
      if (clearForm) {
        clearMail2925Form();
      }
      syncEditUi();
    }

    function renderMail2925Accounts() {
      if (!dom.mail2925AccountsList) return;

      const latestState = state.getLatestState();
      const accounts = getMail2925Accounts(latestState);
      const currentId = getCurrentMail2925AccountId(latestState);

      if (!accounts.length) {
        dom.mail2925AccountsList.innerHTML = '<div class="hotmail-empty">还没有 2925 账号，先添加一条再使用。</div>';
        updateMail2925ListViewport();
        return;
      }

      const visibleAccounts = getFilteredMail2925Accounts(accounts, currentId);
      if (!visibleAccounts.length) {
        dom.mail2925AccountsList.innerHTML = '<div class="hotmail-empty">没有匹配当前筛选条件的 2925 账号。</div>';
        updateMail2925ListViewport();
        return;
      }

      dom.mail2925AccountsList.innerHTML = visibleAccounts.map((account) => {
        const status = getStatusSnapshot(account);
        const coolingDown = status.label === '冷却中';
        return `
          <div class="hotmail-account-item${account.id === currentId ? ' is-current' : ''}">
            <div class="hotmail-account-top">
              <div class="hotmail-account-title-row">
                <div class="hotmail-account-email">${helpers.escapeHtml(account.email || '(未命名账号)')}</div>
                <button
                  class="hotmail-copy-btn"
                  type="button"
                  data-account-action="copy-email"
                  data-account-id="${helpers.escapeHtml(account.id)}"
                  title="复制邮箱"
                  aria-label="复制邮箱 ${helpers.escapeHtml(account.email || '')}"
                >${copyIcon}</button>
              </div>
              <span class="hotmail-status-chip ${helpers.escapeHtml(status.className)}">${helpers.escapeHtml(status.label)}</span>
            </div>
            <div class="hotmail-account-meta">
              <span>密码：${account.password ? '已保存' : '未保存'}</span>
              <span>上次登录：${helpers.escapeHtml(formatDateTime(account.lastLoginAt))}</span>
              <span>上次使用：${helpers.escapeHtml(formatDateTime(account.lastUsedAt))}</span>
              <span>上限记录：${helpers.escapeHtml(formatDateTime(account.lastLimitAt))}</span>
              <span>恢复时间：${helpers.escapeHtml(formatDateTime(account.disabledUntil))}</span>
            </div>
            ${account.lastError ? `<div class="hotmail-account-error">${helpers.escapeHtml(account.lastError)}</div>` : ''}
            <div class="hotmail-account-actions">
              <button class="btn btn-outline btn-sm" type="button" data-account-action="select" data-account-id="${helpers.escapeHtml(account.id)}">使用此账号</button>
              <button class="btn btn-primary btn-sm" type="button" data-account-action="login" data-account-id="${helpers.escapeHtml(account.id)}">登录</button>
              <button class="btn btn-outline btn-sm" type="button" data-account-action="edit" data-account-id="${helpers.escapeHtml(account.id)}">编辑</button>
              <button class="btn btn-outline btn-sm" type="button" data-account-action="toggle-enabled" data-account-id="${helpers.escapeHtml(account.id)}">${account.enabled === false ? '启用' : '禁用'}</button>
              ${coolingDown ? `<button class="btn btn-outline btn-sm" type="button" data-account-action="clear-cooldown" data-account-id="${helpers.escapeHtml(account.id)}">清冷却</button>` : ''}
              <button class="btn btn-ghost btn-sm" type="button" data-account-action="delete" data-account-id="${helpers.escapeHtml(account.id)}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      updateMail2925ListViewport();
    }

    async function handleAddMail2925Account() {
      if (actionInFlight) return;

      const email = String(dom.inputMail2925Email?.value || '').trim();
      const password = String(dom.inputMail2925Password?.value || '');
      if (!email) {
        helpers.showToast('请先填写 2925 邮箱。', 'warn');
        return;
      }
      if (!password) {
        helpers.showToast('请先填写 2925 密码。', 'warn');
        return;
      }

      const updatingExisting = Boolean(editingAccountId);
      actionInFlight = true;
      if (dom.btnAddMail2925Account) {
        dom.btnAddMail2925Account.disabled = true;
      }

      try {
        const response = await runtime.sendMessage({
          type: 'UPSERT_MAIL2925_ACCOUNT',
          source: 'sidepanel',
          payload: {
            ...(editingAccountId ? { id: editingAccountId } : {}),
            email,
            password,
          },
        });
        if (response?.error) {
          throw new Error(response.error);
        }

        applyMail2925AccountMutation(response.account);
        formController.setVisible(false, { clearForm: true });
        helpers.showToast(
          updatingExisting
            ? `已更新 2925 账号 ${email}`
            : `已保存 2925 账号 ${email}`,
          'success',
          1800
        );
      } catch (err) {
        helpers.showToast(`保存 2925 账号失败：${err.message}`, 'error');
      } finally {
        actionInFlight = false;
        if (dom.btnAddMail2925Account) {
          dom.btnAddMail2925Account.disabled = false;
        }
      }
    }

    async function handleImportMail2925Accounts() {
      if (actionInFlight) return;
      if (typeof mail2925Utils.parseMail2925ImportText !== 'function') {
        helpers.showToast('2925 导入解析器未加载，请刷新扩展后重试。', 'error');
        return;
      }

      const rawText = String(dom.inputMail2925Import?.value || '').trim();
      if (!rawText) {
        helpers.showToast('请先粘贴 2925 账号导入内容。', 'warn');
        return;
      }

      const parsedAccounts = mail2925Utils.parseMail2925ImportText(rawText);
      if (!parsedAccounts.length) {
        helpers.showToast('没有解析到有效账号，请检查格式是否为 邮箱----密码。', 'error');
        return;
      }

      actionInFlight = true;
      if (dom.btnImportMail2925Accounts) {
        dom.btnImportMail2925Accounts.disabled = true;
      }

      try {
        for (const account of parsedAccounts) {
          const response = await runtime.sendMessage({
            type: 'UPSERT_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: account,
          });
          if (response?.error) {
            throw new Error(response.error);
          }
        }

        if (dom.inputMail2925Import) {
          dom.inputMail2925Import.value = '';
        }
        helpers.showToast(`已导入 ${parsedAccounts.length} 条 2925 账号`, 'success', 2200);
      } catch (err) {
        helpers.showToast(`批量导入 2925 账号失败：${err.message}`, 'error');
      } finally {
        actionInFlight = false;
        if (dom.btnImportMail2925Accounts) {
          dom.btnImportMail2925Accounts.disabled = false;
        }
      }
    }

    async function deleteAllMail2925Accounts() {
      const accounts = getMail2925Accounts();
      if (!accounts.length) {
        helpers.showToast('没有可删除的 2925 账号。', 'warn');
        return;
      }

      const confirmed = await helpers.openConfirmModal({
        title: '全部删除 2925 账号',
        message: `确认删除当前全部 ${accounts.length} 个 2925 账号吗？`,
        confirmLabel: '确认全部删除',
        confirmVariant: 'btn-danger',
      });
      if (!confirmed) {
        return;
      }

      const response = await runtime.sendMessage({
        type: 'DELETE_MAIL2925_ACCOUNTS',
        source: 'sidepanel',
        payload: { mode: 'all' },
      });
      if (response?.error) {
        throw new Error(response.error);
      }

      state.syncLatestState({
        mail2925Accounts: [],
        currentMail2925AccountId: null,
      });
      formController.setVisible(false, { clearForm: true });
      refreshManagedAliasBaseEmail();
      renderMail2925Accounts();
      helpers.showToast(`已删除全部 ${response.deletedCount || 0} 个 2925 账号`, 'success', 2200);
    }

    async function handleAccountListClick(event) {
      const actionButton = event.target.closest('[data-account-action]');
      if (!actionButton || actionInFlight) {
        return;
      }

      const accountId = String(actionButton.dataset.accountId || '');
      const action = String(actionButton.dataset.accountAction || '');
      if (!accountId || !action) {
        return;
      }

      const targetAccount = getMail2925Accounts().find((account) => account.id === accountId) || null;
      actionInFlight = true;
      actionButton.disabled = true;

      try {
        if (action === 'copy-email') {
          if (!targetAccount?.email) throw new Error('未找到可复制的 2925 邮箱。');
          await helpers.copyTextToClipboard(targetAccount.email);
          helpers.showToast(`已复制 ${targetAccount.email}`, 'success', 1800);
          return;
        }

        if (action === 'select') {
          const response = await runtime.sendMessage({
            type: 'SELECT_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);
          state.syncLatestState({ currentMail2925AccountId: response.account.id });
          refreshManagedAliasBaseEmail();
          renderMail2925Accounts();
          helpers.showToast(`已切换当前 2925 账号为 ${response.account.email}`, 'success', 2000);
          return;
        }

        if (action === 'login') {
          const response = await runtime.sendMessage({
            type: 'LOGIN_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: {
              accountId,
              forceRelogin: true,
            },
          });
          if (response?.error) throw new Error(response.error);
          state.syncLatestState({ currentMail2925AccountId: response.account.id });
          refreshManagedAliasBaseEmail();
          renderMail2925Accounts();
          helpers.showToast(`已使用 ${response.account.email} 登录 2925 邮箱`, 'success', 2200);
          return;
        }

        if (action === 'edit') {
          if (!targetAccount) throw new Error('未找到目标 2925 账号。');
          startEditingAccount(targetAccount);
          helpers.showToast(`已载入 ${targetAccount.email}，修改后点“保存修改”即可`, 'info', 1800);
          return;
        }

        if (action === 'toggle-enabled') {
          if (!targetAccount) throw new Error('未找到目标 2925 账号。');
          const response = await runtime.sendMessage({
            type: 'PATCH_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: {
              accountId,
              updates: {
                enabled: targetAccount.enabled === false,
              },
            },
          });
          if (response?.error) throw new Error(response.error);
          applyMail2925AccountMutation(response.account);
          helpers.showToast(`2925 账号 ${response.account.email} 已${response.account.enabled === false ? '禁用' : '启用'}`, 'success', 2200);
          return;
        }

        if (action === 'clear-cooldown') {
          const response = await runtime.sendMessage({
            type: 'PATCH_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: {
              accountId,
              updates: {
                disabledUntil: 0,
                lastError: '',
              },
            },
          });
          if (response?.error) throw new Error(response.error);
          applyMail2925AccountMutation(response.account);
          helpers.showToast(`2925 账号 ${response.account.email} 已清除冷却`, 'success', 2200);
          return;
        }

        if (action === 'delete') {
          const confirmed = await helpers.openConfirmModal({
            title: '删除 2925 账号',
            message: '确认删除这个 2925 账号吗？',
            confirmLabel: '确认删除',
            confirmVariant: 'btn-danger',
          });
          if (!confirmed) {
            return;
          }
          const response = await runtime.sendMessage({
            type: 'DELETE_MAIL2925_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);

          const nextAccounts = getMail2925Accounts().filter((account) => account.id !== accountId);
          const nextState = { mail2925Accounts: nextAccounts };
          if (getCurrentMail2925AccountId() === accountId) {
            nextState.currentMail2925AccountId = null;
          }
          state.syncLatestState(nextState);
          if (editingAccountId === accountId) {
            formController.setVisible(false, { clearForm: true });
          }
          refreshManagedAliasBaseEmail();
          renderMail2925Accounts();
          helpers.showToast('2925 账号已删除', 'success', 1800);
        }
      } catch (err) {
        helpers.showToast(err.message, 'error');
      } finally {
        actionInFlight = false;
        actionButton.disabled = false;
      }
    }

    function bindMail2925Events() {
      dom.btnToggleMail2925List?.addEventListener('click', () => {
        setMail2925ListExpanded(!listExpanded);
      });

      dom.btnToggleMail2925Form?.addEventListener('click', () => {
        if (formController.isVisible()) {
          formController.setVisible(false, { clearForm: true });
          return;
        }
        formController.setVisible(true, { clearForm: !editingAccountId, focusField: true });
      });

      dom.btnDeleteAllMail2925Accounts?.addEventListener('click', async () => {
        if (actionInFlight) return;
        actionInFlight = true;
        try {
          await deleteAllMail2925Accounts();
        } catch (err) {
          helpers.showToast(err.message, 'error');
        } finally {
          actionInFlight = false;
          updateMail2925ListViewport();
        }
      });

      dom.btnAddMail2925Account?.addEventListener('click', handleAddMail2925Account);
      dom.btnImportMail2925Accounts?.addEventListener('click', handleImportMail2925Accounts);
      dom.inputMail2925Search?.addEventListener('input', (event) => {
        searchTerm = normalizeSearchText(event.target.value);
        renderMail2925Accounts();
      });
      dom.selectMail2925Filter?.addEventListener('change', (event) => {
        filterMode = String(event.target.value || 'all');
        renderMail2925Accounts();
      });
      dom.mail2925AccountsList?.addEventListener('click', handleAccountListClick);
      syncEditUi();
      formController.sync();
    }

    return {
      bindMail2925Events,
      initMail2925ListExpandedState,
      renderMail2925Accounts,
    };
  }

  globalScope.SidepanelMail2925Manager = {
    createMail2925Manager,
  };
})(window);
