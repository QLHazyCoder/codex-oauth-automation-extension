(function attachSidepanelContributionMode(globalScope) {
  const ACTIVE_STATUSES = new Set(['started', 'waiting', 'processing']);
  const FINAL_STATUSES = new Set(['auto_approved', 'auto_rejected', 'manual_review_required', 'expired', 'error']);
  const DEFAULT_COPY = '当前账号将用于支持项目维护。扩展会自动申请贡献登录地址并持续跟踪授权状态；如检测到回调地址，会自动提交，并继续等待 CPA 最终确认。';

  function createContributionModeManager(context = {}) {
    const {
      state,
      dom,
      helpers,
      runtime,
      constants = {},
    } = context;

    const contributionPortalUrl = constants.contributionPortalUrl || 'https://apikey.qzz.io';
    const contributionUploadUrl = constants.contributionUploadUrl || 'https://apikey.qzz.io/upload';
    const pollIntervalMs = Math.max(1500, Math.floor(Number(constants.pollIntervalMs) || 2500));

    const hiddenRows = [
      dom.rowVpsUrl,
      dom.rowVpsPassword,
      dom.rowLocalCpaStep9Mode,
      dom.rowSub2ApiUrl,
      dom.rowSub2ApiEmail,
      dom.rowSub2ApiPassword,
      dom.rowSub2ApiGroup,
      dom.rowSub2ApiDefaultProxy,
      dom.rowCodex2ApiUrl,
      dom.rowCodex2ApiAdminKey,
      dom.rowCustomPassword,
      dom.rowAccountRunHistoryHelperBaseUrl,
    ].filter(Boolean);

    let actionInFlight = false;
    let pollInFlight = false;
    let pollTimer = null;

    function getLatestState() {
      return state.getLatestState?.() || {};
    }

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    function normalizeStatus(value = '') {
      const normalized = normalizeString(value).toLowerCase();
      if (ACTIVE_STATUSES.has(normalized) || FINAL_STATUSES.has(normalized)) {
        return normalized;
      }
      return '';
    }

    function normalizeCallbackStatus(value = '') {
      const normalized = normalizeString(value).toLowerCase();
      switch (normalized) {
        case 'waiting':
        case 'captured':
        case 'submitting':
        case 'submitted':
        case 'failed':
        case 'idle':
          return normalized;
        default:
          return '';
      }
    }

    function isContributionModeEnabled(currentState = getLatestState()) {
      return Boolean(currentState.contributionMode);
    }

    function hasActiveContributionSession(currentState = getLatestState()) {
      const status = normalizeStatus(currentState.contributionStatus);
      return Boolean(normalizeString(currentState.contributionSessionId) && status && !FINAL_STATUSES.has(status));
    }

    function isModeSwitchBlocked() {
      return Boolean(helpers.isModeSwitchBlocked?.(getLatestState()));
    }

    function setContributionHidden(element, hidden) {
      element?.classList.toggle('is-contribution-hidden', hidden);
    }

    function syncContributionRows(enabled) {
      hiddenRows.forEach((row) => {
        setContributionHidden(row, enabled);
      });
    }

    function syncContributionButton(enabled, blocked) {
      if (!dom.btnContributionMode) {
        return;
      }

      dom.btnContributionMode.classList.toggle('is-active', enabled);
      dom.btnContributionMode.setAttribute('aria-pressed', String(enabled));
      dom.btnContributionMode.disabled = enabled || blocked;
      dom.btnContributionMode.title = blocked
        ? '当前流程运行中，暂时不能切换贡献模式'
        : (enabled ? '当前已在贡献模式' : '进入贡献模式');
    }

    function stopPolling() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function schedulePolling(delayMs = pollIntervalMs) {
      stopPolling();
      if (!isContributionModeEnabled() || !hasActiveContributionSession()) {
        return;
      }

      pollTimer = setTimeout(() => {
        pollOnce({ silentError: true }).catch(() => {});
      }, delayMs);
    }

    function ensurePolling() {
      if (!isContributionModeEnabled() || !hasActiveContributionSession()) {
        stopPolling();
        return;
      }

      if (!pollTimer && !pollInFlight) {
        schedulePolling(1200);
      }
    }

    function getOauthStatusText(currentState = getLatestState()) {
      const status = normalizeStatus(currentState.contributionStatus);
      const hasAuthUrl = Boolean(normalizeString(currentState.contributionAuthUrl));
      if (!normalizeString(currentState.contributionSessionId) || !hasAuthUrl) {
        return '未生成登录地址';
      }
      if (status === 'waiting') {
        return '等待提交回调';
      }
      if (status === 'processing' || status === 'auto_approved' || status === 'auto_rejected' || status === 'manual_review_required') {
        return status === 'processing' ? '已提交回调' : '授权已结束';
      }
      if (status === 'expired' || status === 'error') {
        return '授权失败';
      }
      if (Number(currentState.contributionAuthOpenedAt) > 0) {
        return '已打开授权页';
      }
      return '登录地址已生成';
    }

    function getCallbackStatusText(currentState = getLatestState()) {
      const status = normalizeCallbackStatus(currentState.contributionCallbackStatus);
      switch (status) {
        case 'captured':
          return '已捕获回调地址';
        case 'submitting':
          return '正在提交回调';
        case 'submitted':
          return '已提交回调';
        case 'failed':
          return '回调提交失败';
        case 'waiting':
        case 'idle':
        default:
          return normalizeString(currentState.contributionCallbackUrl)
            ? '已捕获回调地址'
            : '等待回调';
      }
    }

    function getSummaryText(currentState = getLatestState()) {
      return normalizeString(currentState.contributionStatusMessage) || DEFAULT_COPY;
    }

    function getContributionPortalPageUrl() {
      return normalizeString(contributionPortalUrl);
    }

    function getContributionUploadPageUrl() {
      return normalizeString(contributionUploadUrl);
    }

    function openContributionPortalPage() {
      const targetUrl = getContributionPortalPageUrl();
      if (!targetUrl) {
        return;
      }
      helpers.openExternalUrl?.(targetUrl);
    }

    function openContributionUploadPage() {
      const targetUrl = getContributionUploadPageUrl();
      if (!targetUrl) {
        return;
      }
      helpers.openExternalUrl?.(targetUrl);
    }

    async function syncContributionProfile(partial = {}) {
      const payload = {
        nickname: normalizeString(partial.nickname),
        qq: normalizeString(partial.qq),
      };
      const response = await runtime.sendMessage({
        type: 'SET_CONTRIBUTION_PROFILE',
        source: 'sidepanel',
        payload,
      });
      if (response?.error) {
        throw new Error(response.error);
      }
      if (response?.state) {
        helpers.applySettingsState?.(response.state);
      }
    }

    async function requestContributionMode(enabled) {
      const response = await runtime.sendMessage({
        type: 'SET_CONTRIBUTION_MODE',
        source: 'sidepanel',
        payload: { enabled: Boolean(enabled) },
      });

      if (response?.error) {
        throw new Error(response.error);
      }
      if (!response?.state) {
        throw new Error('贡献模式切换后未返回最新状态。');
      }

      helpers.applySettingsState?.(response.state);
      helpers.updateStatusDisplay?.(response.state);
      render();
    }

    async function pollOnce(options = {}) {
      if (pollInFlight || !isContributionModeEnabled() || !hasActiveContributionSession()) {
        if (!hasActiveContributionSession()) {
          stopPolling();
        }
        return;
      }

      pollInFlight = true;
      try {
        const response = await runtime.sendMessage({
          type: 'POLL_CONTRIBUTION_STATUS',
          source: 'sidepanel',
          payload: {
            reason: options.reason || 'sidepanel_poll',
          },
        });

        if (response?.error) {
          throw new Error(response.error);
        }
        if (response?.state) {
          helpers.applySettingsState?.(response.state);
          helpers.updateStatusDisplay?.(response.state);
        }
      } finally {
        pollInFlight = false;
        render();
        if (hasActiveContributionSession()) {
          schedulePolling();
        } else {
          stopPolling();
        }
      }
    }

    async function startContributionFlow() {
      if (typeof helpers.startContributionAutoRun !== 'function') {
        throw new Error('贡献模式尚未接入主自动流程启动能力。');
      }

      const profile = helpers.getContributionProfile?.() || {};
      const qq = normalizeString(profile.qq);
      if (qq && !/^\d{1,20}$/.test(qq)) {
        throw new Error('QQ 只能填写数字，且长度不能超过 20 位。');
      }
      await syncContributionProfile(profile);

      const started = await helpers.startContributionAutoRun();
      if (!started) {
        return;
      }

      helpers.showToast?.('贡献自动流程已启动。', 'info', 1800);
      render();
    }

    async function enterContributionMode() {
      await requestContributionMode(true);
      helpers.showToast?.('已进入贡献模式。', 'success', 1800);
    }

    async function exitContributionMode() {
      stopPolling();
      await requestContributionMode(false);
      helpers.showToast?.('已退出贡献模式。', 'info', 1800);
    }

    function render() {
      const currentState = getLatestState();
      const enabled = isContributionModeEnabled(currentState);
      const blocked = isModeSwitchBlocked();
      const activeElement = typeof document !== 'undefined' ? document.activeElement : null;

      if (enabled && dom.selectPanelMode) {
        dom.selectPanelMode.value = 'cpa';
      }

      helpers.updatePanelModeUI?.();
      helpers.updateAccountRunHistorySettingsUI?.();

      if (dom.contributionModePanel) {
        dom.contributionModePanel.hidden = !enabled;
      }
      if (dom.contributionModeText) {
        dom.contributionModeText.textContent = DEFAULT_COPY;
      }
      if (dom.inputContributionNickname && activeElement !== dom.inputContributionNickname) {
        const nextNickname = normalizeString(currentState.contributionNickname);
        if (nextNickname || !normalizeString(dom.inputContributionNickname.value)) {
          dom.inputContributionNickname.value = nextNickname;
        }
      }
      if (dom.inputContributionQq && activeElement !== dom.inputContributionQq) {
        const nextQq = normalizeString(currentState.contributionQq);
        if (nextQq || !normalizeString(dom.inputContributionQq.value)) {
          dom.inputContributionQq.value = nextQq;
        }
      }
      if (dom.contributionOauthStatus) {
        dom.contributionOauthStatus.textContent = getOauthStatusText(currentState);
      }
      if (dom.contributionCallbackStatus) {
        dom.contributionCallbackStatus.textContent = getCallbackStatusText(currentState);
      }
      if (dom.contributionModeSummary) {
        dom.contributionModeSummary.textContent = getSummaryText(currentState);
      }

      syncContributionRows(enabled);
      syncContributionButton(enabled, blocked);

      if (dom.selectPanelMode) {
        dom.selectPanelMode.disabled = enabled;
      }

      if (dom.btnStartContribution) {
        dom.btnStartContribution.disabled = actionInFlight || blocked;
      }

      if (dom.btnOpenContributionUpload) {
        dom.btnOpenContributionUpload.disabled = false;
      }

      if (dom.btnExitContributionMode) {
        dom.btnExitContributionMode.disabled = actionInFlight || blocked;
        dom.btnExitContributionMode.title = blocked ? '当前流程运行中，暂时不能退出贡献模式' : '退出贡献模式';
      }

      if (dom.btnOpenAccountRecords) {
        dom.btnOpenAccountRecords.disabled = enabled;
      }

      if (enabled) {
        helpers.closeConfigMenu?.();
        helpers.closeAccountRecordsPanel?.();
        ensurePolling();
      } else {
        stopPolling();
      }

      helpers.updateConfigMenuControls?.();
    }

    function bindEvents() {
      dom.btnContributionMode?.addEventListener('click', async () => {
        if (actionInFlight) {
          return;
        }
        actionInFlight = true;
        try {
          openContributionPortalPage();
        } catch (error) {
          helpers.showToast?.(`打开官网页面失败：${error.message}`, 'error');
        }
        render();
        try {
          await enterContributionMode();
        } catch (error) {
          helpers.showToast?.(error.message, 'error');
        } finally {
          actionInFlight = false;
          render();
        }
      });

      dom.btnStartContribution?.addEventListener('click', async () => {
        if (actionInFlight) {
          return;
        }
        actionInFlight = true;
        render();
        try {
          await startContributionFlow();
        } catch (error) {
          helpers.showToast?.(error.message, 'error');
        } finally {
          actionInFlight = false;
          render();
        }
      });

      dom.inputContributionNickname?.addEventListener('change', async () => {
        try {
          await syncContributionProfile({
            nickname: dom.inputContributionNickname?.value,
            qq: dom.inputContributionQq?.value,
          });
        } catch (error) {
          helpers.showToast?.(error.message, 'error');
        } finally {
          render();
        }
      });

      dom.inputContributionQq?.addEventListener('change', async () => {
        try {
          await syncContributionProfile({
            nickname: dom.inputContributionNickname?.value,
            qq: dom.inputContributionQq?.value,
          });
        } catch (error) {
          helpers.showToast?.(error.message, 'error');
        } finally {
          render();
        }
      });

      dom.btnOpenContributionUpload?.addEventListener('click', () => {
        try {
          openContributionUploadPage();
        } catch (error) {
          helpers.showToast?.(`打开上传页面失败：${error.message}`, 'error');
        }
      });

      dom.btnExitContributionMode?.addEventListener('click', async () => {
        if (actionInFlight) {
          return;
        }
        actionInFlight = true;
        render();
        try {
          await exitContributionMode();
        } catch (error) {
          helpers.showToast?.(error.message, 'error');
        } finally {
          actionInFlight = false;
          render();
        }
      });
    }

    return {
      bindEvents,
      pollOnce,
      render,
      stopPolling,
    };
  }

  globalScope.SidepanelContributionMode = {
    createContributionModeManager,
  };
})(typeof window !== 'undefined' ? window : globalThis);
