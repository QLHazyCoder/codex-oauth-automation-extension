(function attachSidepanelHotmailManager(globalScope) {
  function createHotmailManager(context = {}) {
    const {
      state,
      dom,
      helpers,
      runtime,
      constants = {},
      hotmailUtils = {},
    } = context;

    const expandedStorageKey = constants.expandedStorageKey || 'multipage-hotmail-list-expanded';
    const displayTimeZone = constants.displayTimeZone || 'Asia/Shanghai';
    const copyIcon = constants.copyIcon || '';
    const createAccountPoolFormController = globalScope.SidepanelAccountPoolUi?.createAccountPoolFormController;

    let actionInFlight = false;
    let listExpanded = false;

    function getHotmailAccountsByUsage(mode = 'all', currentState = state.getLatestState()) {
      const accounts = helpers.getHotmailAccounts(currentState);
      if (typeof hotmailUtils.filterHotmailAccountsByUsage === 'function') {
        return hotmailUtils.filterHotmailAccountsByUsage(accounts, mode);
      }
      if (mode === 'used') {
        return accounts.filter((account) => Boolean(account?.used));
      }
      return accounts.slice();
    }

    function getHotmailBulkActionText(mode, count) {
      if (typeof hotmailUtils.getHotmailBulkActionLabel === 'function') {
        return hotmailUtils.getHotmailBulkActionLabel(mode, count);
      }
      const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
      const prefix = mode === 'used' ? '清空已用' : '全部删除';
      const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
      return `${prefix}${suffix}`;
    }

    function getHotmailListToggleText(expanded, count) {
      if (typeof hotmailUtils.getHotmailListToggleLabel === 'function') {
        return hotmailUtils.getHotmailListToggleLabel(expanded, count);
      }
      const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
      const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
      return `${expanded ? '收起列表' : '展开列表'}${suffix}`;
    }

    function updateHotmailListViewport() {
      const count = helpers.getHotmailAccounts().length;
      const usedCount = getHotmailAccountsByUsage('used').length;
      if (dom.btnClearUsedHotmailAccounts) {
        dom.btnClearUsedHotmailAccounts.textContent = getHotmailBulkActionText('used', usedCount);
        dom.btnClearUsedHotmailAccounts.disabled = usedCount === 0;
      }
      if (dom.btnDeleteAllHotmailAccounts) {
        dom.btnDeleteAllHotmailAccounts.textContent = getHotmailBulkActionText('all', count);
        dom.btnDeleteAllHotmailAccounts.disabled = count === 0;
      }
      if (dom.btnToggleHotmailList) {
        dom.btnToggleHotmailList.textContent = getHotmailListToggleText(listExpanded, count);
        dom.btnToggleHotmailList.setAttribute('aria-expanded', String(listExpanded));
        dom.btnToggleHotmailList.disabled = count === 0;
      }
      if (dom.hotmailListShell) {
        dom.hotmailListShell.classList.toggle('is-expanded', listExpanded);
        dom.hotmailListShell.classList.toggle('is-collapsed', !listExpanded);
      }
    }

    function setHotmailListExpanded(expanded, options = {}) {
      const { persist = true } = options;
      listExpanded = Boolean(expanded);
      updateHotmailListViewport();
      if (persist) {
        localStorage.setItem(expandedStorageKey, listExpanded ? '1' : '0');
      }
    }

    function initHotmailListExpandedState() {
      const saved = localStorage.getItem(expandedStorageKey);
      setHotmailListExpanded(saved === '1', { persist: false });
    }

    function shouldClearCurrentHotmailSelectionLocally(account) {
      if (typeof hotmailUtils.shouldClearHotmailCurrentSelection === 'function') {
        return hotmailUtils.shouldClearHotmailCurrentSelection(account);
      }
      return Boolean(account) && account.used === true;
    }

    function upsertHotmailAccountListLocally(accounts, nextAccount) {
      if (typeof hotmailUtils.upsertHotmailAccountInList === 'function') {
        return hotmailUtils.upsertHotmailAccountInList(accounts, nextAccount);
      }

      const list = Array.isArray(accounts) ? accounts.slice() : [];
      if (!nextAccount?.id) return list;

      const existingIndex = list.findIndex((account) => account?.id === nextAccount.id);
      if (existingIndex === -1) {
        list.push(nextAccount);
        return list;
      }

      list[existingIndex] = nextAccount;
      return list;
    }

    function refreshHotmailSelectionUI() {
      renderHotmailAccounts();
      if (dom.selectMailProvider.value === 'hotmail-api') {
        dom.inputEmail.value = helpers.getCurrentHotmailEmail();
      }
    }

    function applyHotmailAccountMutation(account, options = {}) {
      if (!account?.id) return;
      const { preserveCurrentSelection = false } = options;

      const latestState = state.getLatestState();
      const nextState = {
        hotmailAccounts: upsertHotmailAccountListLocally(helpers.getHotmailAccounts(), account),
      };

      if (!preserveCurrentSelection
        && latestState?.currentHotmailAccountId === account.id
        && shouldClearCurrentHotmailSelectionLocally(account)) {
        nextState.currentHotmailAccountId = null;
        if (dom.selectMailProvider.value === 'hotmail-api') {
          nextState.email = null;
        }
      }

      state.syncLatestState(nextState);
      refreshHotmailSelectionUI();
    }

    function formatDateTime(timestamp) {
      const value = Number(timestamp);
      if (!Number.isFinite(value) || value <= 0) {
        return '未使用';
      }
      return new Date(value).toLocaleString('zh-CN', {
        hour12: false,
        timeZone: displayTimeZone,
      });
    }

    function getHotmailAvailabilityLabel(account) {
      if (account.used) return '已用';
      return '可分配';
    }

    function getHotmailStatusLabel(account) {
      if (account.used) return '已用';

      switch (account.status) {
        case 'authorized':
          return '可用';
        case 'error':
          return '异常';
        default:
          return '待校验';
      }
    }

    function getHotmailStatusClass(account) {
      if (account.used) return 'status-used';
      return `status-${account.status || 'pending'}`;
    }

    function clearHotmailForm() {
      dom.inputHotmailEmail.value = '';
      dom.inputHotmailClientId.value = '';
      dom.inputHotmailPassword.value = '';
      dom.inputHotmailRefreshToken.value = '';
    }

    const formController = typeof createAccountPoolFormController === 'function'
      ? createAccountPoolFormController({
        formShell: dom.hotmailFormShell,
        toggleButton: dom.btnToggleHotmailForm,
        hiddenLabel: '添加账号',
        visibleLabel: '取消添加',
        onClear: () => {
          clearHotmailForm();
        },
        onFocus: () => {
          dom.inputHotmailEmail?.focus?.();
        },
      })
      : {
        isVisible: () => false,
        setVisible() {},
        sync() {},
      };

    function renderHotmailAccounts() {
      if (!dom.hotmailAccountsList) return;
      const latestState = state.getLatestState();
      const accounts = helpers.getHotmailAccounts();
      const currentId = latestState?.currentHotmailAccountId || '';

      if (!accounts.length) {
        dom.hotmailAccountsList.innerHTML = '<div class="hotmail-empty">还没有 Hotmail 账号，先添加一条再校验。</div>';
        updateHotmailListViewport();
        return;
      }

      dom.hotmailAccountsList.innerHTML = accounts.map((account) => `
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
            <span class="hotmail-status-chip ${helpers.escapeHtml(getHotmailStatusClass(account))}">${helpers.escapeHtml(getHotmailStatusLabel(account))}</span>
          </div>
          <div class="hotmail-account-meta">
            <span>客户端 ID：${helpers.escapeHtml(account.clientId ? `${account.clientId.slice(0, 10)}...` : '未填写')}</span>
            <span>刷新令牌：${account.refreshToken ? '已保存' : '未保存'}</span>
            <span>分配状态: ${helpers.escapeHtml(getHotmailAvailabilityLabel(account))}</span>
            <span>上次校验: ${helpers.escapeHtml(formatDateTime(account.lastAuthAt))}</span>
            <span>上次使用: ${helpers.escapeHtml(formatDateTime(account.lastUsedAt))}</span>
          </div>
          ${account.lastError ? `<div class="hotmail-account-error">${helpers.escapeHtml(account.lastError)}</div>` : ''}
          <div class="hotmail-account-actions">
            <button class="btn btn-outline btn-sm" type="button" data-account-action="select" data-account-id="${helpers.escapeHtml(account.id)}">使用此账号</button>
            <button class="btn btn-outline btn-sm" type="button" data-account-action="toggle-used" data-account-id="${helpers.escapeHtml(account.id)}">${account.used ? '标记未用' : '标记已用'}</button>
            <button class="btn btn-primary btn-sm" type="button" data-account-action="verify" data-account-id="${helpers.escapeHtml(account.id)}">校验</button>
            <button class="btn btn-outline btn-sm" type="button" data-account-action="test" data-account-id="${helpers.escapeHtml(account.id)}">复制最新验证码</button>
            <button class="btn btn-ghost btn-sm" type="button" data-account-action="delete" data-account-id="${helpers.escapeHtml(account.id)}">删除</button>
          </div>
        </div>
      `).join('');
      updateHotmailListViewport();
    }

    async function deleteHotmailAccountsByMode(mode) {
      const isUsedMode = mode === 'used';
      const targetAccounts = getHotmailAccountsByUsage(isUsedMode ? 'used' : 'all');
      if (!targetAccounts.length) {
        helpers.showToast(isUsedMode ? '没有已用账号可清空。' : '没有可删除的 Hotmail 账号。', 'warn');
        return;
      }

      const confirmed = await helpers.openConfirmModal({
        title: isUsedMode ? '清空已用账号' : '全部删除账号',
        message: isUsedMode
          ? `确认删除当前 ${targetAccounts.length} 个已用 Hotmail 账号吗？`
          : `确认删除全部 ${targetAccounts.length} 个 Hotmail 账号吗？`,
        confirmLabel: isUsedMode ? '确认清空已用' : '确认全部删除',
        confirmVariant: isUsedMode ? 'btn-outline' : 'btn-danger',
      });
      if (!confirmed) {
        return;
      }

      const response = await runtime.sendMessage({
        type: 'DELETE_HOTMAIL_ACCOUNTS',
        source: 'sidepanel',
        payload: { mode: isUsedMode ? 'used' : 'all' },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      const latestState = state.getLatestState();
      const targetIds = new Set(targetAccounts.map((account) => account.id));
      const nextAccounts = isUsedMode
        ? helpers.getHotmailAccounts().filter((account) => !targetIds.has(account.id))
        : [];
      const nextState = { hotmailAccounts: nextAccounts };
      if (latestState?.currentHotmailAccountId && targetIds.has(latestState.currentHotmailAccountId)) {
        nextState.currentHotmailAccountId = null;
        if (dom.selectMailProvider.value === 'hotmail-api') {
          nextState.email = null;
        }
      }
      state.syncLatestState(nextState);
      refreshHotmailSelectionUI();

      helpers.showToast(
        isUsedMode
          ? `已清空 ${response.deletedCount || 0} 个已用 Hotmail 账号`
          : `已删除全部 ${response.deletedCount || 0} 个 Hotmail 账号`,
        'success',
        2200
      );
    }

    async function handleAddHotmailAccount() {
      if (actionInFlight) return;

      const email = dom.inputHotmailEmail.value.trim();
      const clientId = dom.inputHotmailClientId.value.trim();
      const refreshToken = dom.inputHotmailRefreshToken.value.trim();
      if (!email) {
        helpers.showToast('请先填写 Hotmail 邮箱。', 'warn');
        return;
      }
      if (!clientId) {
        helpers.showToast('请先填写微软应用客户端 ID。', 'warn');
        return;
      }
      if (!refreshToken) {
        helpers.showToast('请先填写刷新令牌（refresh token）。', 'warn');
        return;
      }

      actionInFlight = true;
      dom.btnAddHotmailAccount.disabled = true;

      try {
        const response = await runtime.sendMessage({
          type: 'UPSERT_HOTMAIL_ACCOUNT',
          source: 'sidepanel',
          payload: {
            email,
            clientId,
            password: dom.inputHotmailPassword.value,
            refreshToken,
          },
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        helpers.showToast(`已保存 Hotmail 账号 ${email}`, 'success', 1800);
        formController.setVisible(false, { clearForm: true });
      } catch (err) {
        helpers.showToast(`保存 Hotmail 账号失败：${err.message}`, 'error');
      } finally {
        actionInFlight = false;
        dom.btnAddHotmailAccount.disabled = false;
      }
    }

    async function handleImportHotmailAccounts() {
      if (actionInFlight) return;
      if (typeof hotmailUtils.parseHotmailImportText !== 'function') {
        helpers.showToast('导入解析器未加载，请刷新扩展后重试。', 'error');
        return;
      }

      const rawText = dom.inputHotmailImport.value.trim();
      if (!rawText) {
        helpers.showToast('请先粘贴账号导入内容。', 'warn');
        return;
      }

      const parsedAccounts = hotmailUtils.parseHotmailImportText(rawText);
      if (!parsedAccounts.length) {
        helpers.showToast('没有解析到有效账号，请检查格式是否为 账号----密码----ID----Token。', 'error');
        return;
      }

      actionInFlight = true;
      dom.btnImportHotmailAccounts.disabled = true;

      try {
        for (const account of parsedAccounts) {
          const response = await runtime.sendMessage({
            type: 'UPSERT_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: account,
          });
          if (response?.error) {
            throw new Error(response.error);
          }
        }

        dom.inputHotmailImport.value = '';
        helpers.showToast(`已导入 ${parsedAccounts.length} 条 Hotmail 账号`, 'success', 2200);
      } catch (err) {
        helpers.showToast(`批量导入失败：${err.message}`, 'error');
      } finally {
        actionInFlight = false;
        dom.btnImportHotmailAccounts.disabled = false;
      }
    }

    async function handleAccountListClick(event) {
      const actionButton = event.target.closest('[data-account-action]');
      if (!actionButton || actionInFlight) {
        return;
      }

      const accountId = actionButton.dataset.accountId;
      const action = actionButton.dataset.accountAction;
      if (!accountId || !action) {
        return;
      }

      const targetAccount = helpers.getHotmailAccounts().find((account) => account.id === accountId) || null;

      actionInFlight = true;
      actionButton.disabled = true;

      try {
        if (action === 'copy-email') {
          if (!targetAccount?.email) throw new Error('未找到可复制的邮箱地址。');
          await helpers.copyTextToClipboard(targetAccount.email);
          helpers.showToast(`已复制 ${targetAccount.email}`, 'success', 1800);
        } else if (action === 'select') {
          const response = await runtime.sendMessage({
            type: 'SELECT_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);
          state.syncLatestState({ currentHotmailAccountId: response.account.id });
          applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
          helpers.showToast(`已切换当前 Hotmail 账号为 ${response.account.email}`, 'success', 1800);
        } else if (action === 'toggle-used') {
          if (!targetAccount) throw new Error('未找到目标 Hotmail 账号。');
          const response = await runtime.sendMessage({
            type: 'PATCH_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: {
              accountId,
              updates: { used: !targetAccount.used },
            },
          });
          if (response?.error) throw new Error(response.error);
          applyHotmailAccountMutation(response.account);
          helpers.showToast(`账号 ${response.account.email} 已${response.account.used ? '标记为已用' : '恢复为未用'}`, 'success', 2200);
        } else if (action === 'verify') {
          const response = await runtime.sendMessage({
            type: 'VERIFY_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);
          applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
          helpers.showToast(`账号 ${response.account.email} 校验通过`, 'success', 2200);
        } else if (action === 'test') {
          const response = await runtime.sendMessage({
            type: 'TEST_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);
          applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
          if (response.latestCode) {
            await helpers.copyTextToClipboard(response.latestCode);
            const mailbox = response.latestMailbox ? `（${response.latestMailbox}）` : '';
            helpers.showToast(`已复制最新验证码 ${response.latestCode}${mailbox}`, 'success', 2600);
          } else if (response.latestSubject) {
            const mailbox = response.latestMailbox ? `（${response.latestMailbox}）` : '';
            helpers.showToast(`最新邮件${mailbox}没有验证码：${response.latestSubject}`, 'warn', 3200);
          } else {
            helpers.showToast('当前没有可读取的最新邮件。', 'warn', 2600);
          }
        } else if (action === 'delete') {
          const confirmed = await helpers.openConfirmModal({
            title: '删除账号',
            message: '确认删除这个 Hotmail 账号吗？对应 token 也会一起移除。',
            confirmLabel: '确认删除',
            confirmVariant: 'btn-danger',
          });
          if (!confirmed) {
            return;
          }
          const response = await runtime.sendMessage({
            type: 'DELETE_HOTMAIL_ACCOUNT',
            source: 'sidepanel',
            payload: { accountId },
          });
          if (response?.error) throw new Error(response.error);
          helpers.showToast('Hotmail 账号已删除', 'success', 1800);
        }
      } catch (err) {
        helpers.showToast(err.message, 'error');
      } finally {
        actionInFlight = false;
        actionButton.disabled = false;
      }
    }

    function bindHotmailEvents() {
      dom.btnToggleHotmailList?.addEventListener('click', () => {
        setHotmailListExpanded(!listExpanded);
      });

      dom.btnToggleHotmailForm?.addEventListener('click', () => {
        if (formController.isVisible()) {
          formController.setVisible(false, { clearForm: true });
          return;
        }
        formController.setVisible(true, { focusField: true });
      });

      dom.btnHotmailUsageGuide?.addEventListener('click', async () => {
        await helpers.openConfirmModal({
          title: '使用教程',
          message: 'API对接模式会直接调用微软邮箱接口取件；本地助手模式仍走本地服务。两种模式继续共用同一套 Hotmail 账号池与导入格式。',
          confirmLabel: '确定',
          confirmVariant: 'btn-primary',
        });
      });

      dom.btnClearUsedHotmailAccounts?.addEventListener('click', async () => {
        if (actionInFlight) return;
        actionInFlight = true;
        dom.btnClearUsedHotmailAccounts.disabled = true;
        try {
          await deleteHotmailAccountsByMode('used');
        } catch (err) {
          helpers.showToast(err.message, 'error');
        } finally {
          actionInFlight = false;
          updateHotmailListViewport();
        }
      });

      dom.btnDeleteAllHotmailAccounts?.addEventListener('click', async () => {
        if (actionInFlight) return;
        actionInFlight = true;
        dom.btnDeleteAllHotmailAccounts.disabled = true;
        try {
          await deleteHotmailAccountsByMode('all');
        } catch (err) {
          helpers.showToast(err.message, 'error');
        } finally {
          actionInFlight = false;
          updateHotmailListViewport();
        }
      });

      dom.btnAddHotmailAccount?.addEventListener('click', handleAddHotmailAccount);
      dom.btnImportHotmailAccounts?.addEventListener('click', handleImportHotmailAccounts);
      dom.hotmailAccountsList?.addEventListener('click', handleAccountListClick);
      formController.sync();
    }

    return {
      bindHotmailEvents,
      initHotmailListExpandedState,
      renderHotmailAccounts,
    };
  }

  globalScope.SidepanelHotmailManager = {
    createHotmailManager,
  };
})(window);
