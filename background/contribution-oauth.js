(function attachBackgroundContributionOAuth(root, factory) {
  root.MultiPageBackgroundContributionOAuth = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundContributionOAuthModule() {
  const API_BASE_URL = 'https://apikey.qzz.io/oauth/api';
  const ACTIVE_STATUSES = new Set(['started', 'waiting', 'processing']);
  const FINAL_STATUSES = new Set(['auto_approved', 'auto_rejected', 'manual_review_required', 'expired', 'error']);
  const CALLBACK_FINAL_STATUSES = new Set(['submitted']);
  const CALLBACK_WAITING_STATUSES = new Set(['idle', 'waiting', 'captured', 'failed', 'submitting']);

  const RUNTIME_DEFAULTS = {
    contributionMode: false,
    contributionModeExpected: false,
    contributionNickname: '',
    contributionQq: '',
    contributionSessionId: '',
    contributionAuthUrl: '',
    contributionAuthState: '',
    contributionCallbackUrl: '',
    contributionStatus: '',
    contributionStatusMessage: '',
    contributionLastPollAt: 0,
    contributionCallbackStatus: 'idle',
    contributionCallbackMessage: '',
    contributionAuthOpenedAt: 0,
    contributionAuthTabId: 0,
  };

  const RUNTIME_KEYS = Object.keys(RUNTIME_DEFAULTS);

  function createContributionOAuthManager(deps = {}) {
    const {
      addLog,
      broadcastDataUpdate,
      chrome,
      closeLocalhostCallbackTabs,
      getState,
      setState,
    } = deps;

    let listenersBound = false;

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    function normalizePositiveInteger(value, fallback = 0) {
      const numeric = Math.floor(Number(value) || 0);
      return numeric > 0 ? numeric : fallback;
    }

    function normalizeContributionStatus(value = '') {
      const normalized = normalizeString(value).toLowerCase();
      switch (normalized) {
        case 'started':
          return 'started';
        case 'waiting':
        case 'wait':
          return 'waiting';
        case 'processing':
          return 'processing';
        case 'auto_approved':
        case 'approved':
          return 'auto_approved';
        case 'auto_rejected':
        case 'rejected':
          return 'auto_rejected';
        case 'manual_review_required':
        case 'manual_review':
          return 'manual_review_required';
        case 'expired':
        case 'timeout':
          return 'expired';
        case 'error':
        case 'failed':
          return 'error';
        default:
          return '';
      }
    }

    function normalizeContributionCallbackStatus(value = '') {
      const normalized = normalizeString(value).toLowerCase();
      switch (normalized) {
        case 'idle':
          return 'idle';
        case 'waiting':
        case 'pending':
          return 'waiting';
        case 'captured':
          return 'captured';
        case 'submitting':
        case 'processing':
          return 'submitting';
        case 'submitted':
        case 'success':
        case 'done':
          return 'submitted';
        case 'failed':
        case 'error':
          return 'failed';
        default:
          return '';
      }
    }

    function isContributionFinalStatus(status = '') {
      return FINAL_STATUSES.has(normalizeContributionStatus(status));
    }

    function getStatusLabel(status = '') {
      switch (normalizeContributionStatus(status)) {
        case 'started':
          return '已生成登录地址';
        case 'waiting':
          return '等待提交回调';
        case 'processing':
          return '已提交回调，等待 CPA 确认';
        case 'auto_approved':
          return '贡献成功，CPA 已确认';
        case 'auto_rejected':
          return '贡献未通过确认';
        case 'manual_review_required':
          return '已提交，等待人工处理';
        case 'expired':
          return '贡献会话已超时';
        case 'error':
          return '贡献流程失败';
        default:
          return '等待开始贡献';
      }
    }

    function getCallbackLabel(status = '') {
      switch (normalizeContributionCallbackStatus(status)) {
        case 'waiting':
        case 'idle':
          return '等待回调';
        case 'captured':
          return '已捕获回调地址';
        case 'submitting':
          return '正在提交回调';
        case 'submitted':
          return '已提交回调';
        case 'failed':
          return '回调提交失败';
        default:
          return '等待回调';
      }
    }

    function unwrapPayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {};
      }

      if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return { ...payload.data, ...payload };
      }

      return payload;
    }

    function getErrorMessage(payload, responseStatus = 500) {
      const details = [
        payload?.message,
        payload?.detail,
        payload?.error,
        payload?.reason,
      ]
        .map((item) => normalizeString(item))
        .find(Boolean);

      if (details) {
        return details;
      }

      return `贡献服务请求失败（HTTP ${responseStatus}）。`;
    }

    async function fetchContributionJson(endpoint, options = {}) {
      const controller = new AbortController();
      const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 15000));
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: options.method || 'GET',
          headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        let rawPayload = {};
        try {
          rawPayload = await response.json();
        } catch {
          rawPayload = {};
        }

        const payload = unwrapPayload(rawPayload);
        if (!response.ok || payload.ok === false) {
          const error = new Error(getErrorMessage(payload, response.status));
          error.payload = payload;
          error.responseStatus = response.status;
          throw error;
        }

        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('贡献服务请求超时，请稍后重试。');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    function pickContributionState(state = {}) {
      const picked = {};
      for (const key of RUNTIME_KEYS) {
        picked[key] = state[key] !== undefined ? state[key] : RUNTIME_DEFAULTS[key];
      }
      return picked;
    }

    async function applyRuntimeUpdates(updates = {}) {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
        return getState();
      }

      await setState(updates);
      broadcastDataUpdate(updates);
      return getState();
    }

    function extractAuthStateFromUrl(authUrl = '') {
      try {
        return new URL(authUrl).searchParams.get('state') || '';
      } catch {
        return '';
      }
    }

    function buildNickname(state = {}, preferredNickname = '') {
      const nickname = normalizeString(preferredNickname)
        || normalizeString(state.contributionNickname);
      return nickname || '';
    }

    function buildContributionQq(state = {}, preferredQq = '') {
      const qq = normalizeString(preferredQq) || normalizeString(state.contributionQq);
      return qq;
    }

    function buildStatusMessage(status, payload = {}) {
      const label = getStatusLabel(status);
      const details = [
        payload.status_message,
        payload.statusMessage,
        payload.message,
        payload.detail,
        payload.reason,
      ]
        .map((item) => normalizeString(item))
        .find(Boolean);

      if (!details || details === label) {
        return label;
      }

      return `${label}：${details}`;
    }

    function buildCallbackMessage(status, payload = {}) {
      const label = getCallbackLabel(status);
      const details = [
        payload.callback_message,
        payload.callbackMessage,
        payload.message,
        payload.detail,
        payload.reason,
      ]
        .map((item) => normalizeString(item))
        .find(Boolean);

      if (!details || details === label) {
        return label;
      }

      return `${label}：${details}`;
    }

    function deriveCallbackState(payload = {}, state = {}) {
      const existingStatus = normalizeContributionCallbackStatus(state.contributionCallbackStatus);
      const callbackUrl = normalizeString(
        payload.callback_url
        || payload.callbackUrl
        || state.contributionCallbackUrl
      );
      const explicitStatus = normalizeContributionCallbackStatus(
        payload.callback_status
        || payload.callbackStatus
      );

      if (explicitStatus) {
        return {
          status: explicitStatus,
          message: buildCallbackMessage(explicitStatus, payload),
          callbackUrl,
        };
      }

      if (payload.callback_submitted === true || payload.callbackSubmitted === true) {
        return {
          status: 'submitted',
          message: buildCallbackMessage('submitted', payload),
          callbackUrl,
        };
      }

      if (callbackUrl) {
        return {
          status: CALLBACK_FINAL_STATUSES.has(existingStatus) ? existingStatus : 'captured',
          message: buildCallbackMessage(CALLBACK_FINAL_STATUSES.has(existingStatus) ? existingStatus : 'captured', payload),
          callbackUrl,
        };
      }

      if (CALLBACK_FINAL_STATUSES.has(existingStatus) || existingStatus === 'failed') {
        return {
          status: existingStatus,
          message: normalizeString(state.contributionCallbackMessage) || buildCallbackMessage(existingStatus),
          callbackUrl: normalizeString(state.contributionCallbackUrl),
        };
      }

      return {
        status: 'waiting',
        message: buildCallbackMessage('waiting', payload),
        callbackUrl: '',
      };
    }

    function isContributionCallbackUrl(rawUrl, state = {}) {
      const urlText = normalizeString(rawUrl);
      if (!urlText) {
        return false;
      }

      let parsed;
      try {
        parsed = new URL(urlText);
      } catch {
        return false;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      const code = normalizeString(parsed.searchParams.get('code'));
      const errorText = normalizeString(parsed.searchParams.get('error'))
        || normalizeString(parsed.searchParams.get('error_description'));
      const authState = normalizeString(parsed.searchParams.get('state'));
      if ((!code && !errorText) || !authState) {
        return false;
      }

      const hostLooksLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      const pathLooksLikeCallback = /callback/i.test(parsed.pathname || '');
      if (!hostLooksLocal && !pathLooksLikeCallback) {
        return false;
      }

      const expectedState = normalizeString(state.contributionAuthState);
      return !expectedState || expectedState === authState;
    }

    async function openContributionAuthUrl(authUrl, options = {}) {
      const normalizedUrl = normalizeString(authUrl);
      if (!normalizedUrl) {
        throw new Error('贡献服务未返回有效的登录地址。');
      }

      const currentState = options.stateOverride || await getState();
      const preferredTabId = normalizePositiveInteger(options.tabId || currentState.contributionAuthTabId, 0);
      let tab = null;

      if (preferredTabId) {
        tab = await chrome.tabs.update(preferredTabId, {
          url: normalizedUrl,
          active: true,
        }).catch(() => null);
      }

      if (!tab) {
        tab = await chrome.tabs.create({ url: normalizedUrl, active: true });
      }

      await applyRuntimeUpdates({
        contributionAuthUrl: normalizedUrl,
        contributionAuthOpenedAt: Date.now(),
        contributionAuthTabId: normalizePositiveInteger(tab?.id, 0),
      });

      return tab;
    }

    async function fetchContributionResult(sessionId) {
      try {
        return await fetchContributionJson(`/result?session_id=${encodeURIComponent(sessionId)}`);
      } catch (error) {
        if (typeof addLog === 'function') {
          await addLog(`贡献模式：获取最终结果失败：${error.message}`, 'warn');
        }
        return null;
      }
    }

    async function submitContributionCallback(callbackUrl, options = {}) {
      const currentState = options.stateOverride || await getState();
      const sessionId = normalizeString(currentState.contributionSessionId);
      const normalizedUrl = normalizeString(callbackUrl);

      if (!sessionId || !normalizedUrl) {
        return currentState;
      }

      const currentCallbackStatus = normalizeContributionCallbackStatus(currentState.contributionCallbackStatus);
      if (CALLBACK_FINAL_STATUSES.has(currentCallbackStatus) || currentCallbackStatus === 'submitting') {
        return currentState;
      }

      await applyRuntimeUpdates({
        contributionCallbackUrl: normalizedUrl,
        contributionCallbackStatus: 'submitting',
        contributionCallbackMessage: buildCallbackMessage('submitting'),
      });

      try {
        const payload = await fetchContributionJson('/submit-callback', {
          method: 'POST',
          body: {
            session_id: sessionId,
            callback_url: normalizedUrl,
          },
        });

        const nextStatus = 'submitted';
        await applyRuntimeUpdates({
          contributionCallbackUrl: normalizedUrl,
          contributionCallbackStatus: nextStatus,
          contributionCallbackMessage: buildCallbackMessage(nextStatus, payload),
        });

        if (typeof closeLocalhostCallbackTabs === 'function') {
          await closeLocalhostCallbackTabs(normalizedUrl).catch(() => {});
        }

        return await pollContributionStatus({ reason: options.reason || 'submit_callback' });
      } catch (error) {
        await applyRuntimeUpdates({
          contributionCallbackUrl: normalizedUrl,
          contributionCallbackStatus: 'failed',
          contributionCallbackMessage: `回调提交失败：${error.message}`,
        });

        if (typeof addLog === 'function') {
          await addLog(`贡献模式：回调提交失败：${error.message}`, 'warn');
        }

        throw error;
      }
    }

    async function handleCapturedCallback(rawUrl, metadata = {}) {
      const currentState = await getState();
      if (!normalizeString(currentState.contributionSessionId) || !currentState.contributionMode) {
        return currentState;
      }
      if (!isContributionCallbackUrl(rawUrl, currentState)) {
        return currentState;
      }

      const normalizedUrl = normalizeString(rawUrl);
      const currentCallbackStatus = normalizeContributionCallbackStatus(currentState.contributionCallbackStatus);
      if (
        normalizedUrl
        && normalizeString(currentState.contributionCallbackUrl) === normalizedUrl
        && (CALLBACK_FINAL_STATUSES.has(currentCallbackStatus) || currentCallbackStatus === 'submitting')
      ) {
        return currentState;
      }

      await applyRuntimeUpdates({
        contributionCallbackUrl: normalizedUrl,
        contributionCallbackStatus: 'captured',
        contributionCallbackMessage: buildCallbackMessage('captured'),
      });

      if (typeof addLog === 'function') {
        await addLog(`贡献模式：已捕获回调地址（${metadata.source || 'unknown'}）。`, 'info');
      }

      try {
        return await submitContributionCallback(normalizedUrl, {
          reason: metadata.source || 'navigation',
          stateOverride: await getState(),
        });
      } catch {
        return getState();
      }
    }

    async function pollContributionStatus(options = {}) {
      const currentState = options.stateOverride || await getState();
      const sessionId = normalizeString(currentState.contributionSessionId);
      if (!sessionId) {
        return currentState;
      }

      const payload = await fetchContributionJson(`/status?session_id=${encodeURIComponent(sessionId)}`);
      const nextStatus = normalizeContributionStatus(payload.status || payload.state || payload.phase) || currentState.contributionStatus || 'waiting';
      let finalPayload = null;

      if (isContributionFinalStatus(nextStatus)) {
        finalPayload = await fetchContributionResult(sessionId);
      }

      const mergedPayload = finalPayload ? { ...payload, ...finalPayload } : payload;
      const normalizedStatus = normalizeContributionStatus(mergedPayload.status || mergedPayload.state || mergedPayload.phase) || nextStatus;
      const callbackState = deriveCallbackState(mergedPayload, currentState);
      const updates = {
        contributionLastPollAt: Date.now(),
        contributionStatus: normalizedStatus,
        contributionStatusMessage: buildStatusMessage(normalizedStatus, mergedPayload),
        contributionCallbackUrl: callbackState.callbackUrl,
        contributionCallbackStatus: callbackState.status,
        contributionCallbackMessage: callbackState.message,
      };

      const authUrl = normalizeString(mergedPayload.auth_url || mergedPayload.authUrl);
      if (authUrl) {
        updates.contributionAuthUrl = authUrl;
      }

      const authState = normalizeString(mergedPayload.state || mergedPayload.auth_state || mergedPayload.authState)
        || (authUrl ? extractAuthStateFromUrl(authUrl) : '');
      if (authState) {
        updates.contributionAuthState = authState;
      }

      await applyRuntimeUpdates(updates);
      const nextState = await getState();

      if (
        normalizeString(nextState.contributionCallbackUrl)
        && CALLBACK_WAITING_STATUSES.has(normalizeContributionCallbackStatus(nextState.contributionCallbackStatus))
      ) {
        try {
          return await submitContributionCallback(nextState.contributionCallbackUrl, {
            reason: options.reason || 'status_poll',
            stateOverride: nextState,
          });
        } catch {
          return getState();
        }
      }

      return nextState;
    }

    async function startContributionFlow(options = {}) {
      const currentState = options.stateOverride || await getState();
      const shouldOpenAuthTab = options.openAuthTab !== false;
      if (!currentState.contributionMode) {
        throw new Error('请先进入贡献模式。');
      }

      const currentSessionId = normalizeString(currentState.contributionSessionId);
      const currentStatus = normalizeContributionStatus(currentState.contributionStatus);
      if (currentSessionId && ACTIVE_STATUSES.has(currentStatus)) {
        if (normalizeString(currentState.contributionAuthUrl)) {
          if (shouldOpenAuthTab) {
            await openContributionAuthUrl(currentState.contributionAuthUrl, {
              stateOverride: currentState,
            }).catch(() => null);
          }
        }
        return pollContributionStatus({ reason: 'resume_existing' });
      }

      const payload = await fetchContributionJson('/start', {
        method: 'POST',
        body: {
          nickname: buildNickname(currentState, options.nickname),
          qq: buildContributionQq(currentState, options.qq),
          email: normalizeString(currentState.email),
          source: 'cpa',
          channel: 'codex-extension',
        },
      });

      const sessionId = normalizeString(payload.session_id || payload.sessionId);
      const authUrl = normalizeString(payload.auth_url || payload.authUrl);
      const authState = normalizeString(payload.state || payload.auth_state || payload.authState) || extractAuthStateFromUrl(authUrl);
      if (!sessionId || !authUrl) {
        throw new Error('贡献服务未返回有效的 session_id 或 auth_url。');
      }

      await applyRuntimeUpdates({
        contributionSessionId: sessionId,
        contributionAuthUrl: authUrl,
        contributionAuthState: authState,
        contributionCallbackUrl: '',
        contributionStatus: normalizeContributionStatus(payload.status) || 'started',
        contributionStatusMessage: buildStatusMessage(normalizeContributionStatus(payload.status) || 'started', payload),
        contributionLastPollAt: 0,
        contributionCallbackStatus: 'waiting',
        contributionCallbackMessage: buildCallbackMessage('waiting'),
        contributionAuthOpenedAt: 0,
        contributionAuthTabId: 0,
      });

      if (shouldOpenAuthTab) {
        await openContributionAuthUrl(authUrl);
      }
      return pollContributionStatus({ reason: 'after_start' });
    }

    function onNavigationEvent(details = {}, source) {
      if (details?.frameId !== undefined && Number(details.frameId) !== 0) {
        return;
      }
      handleCapturedCallback(details?.url || '', {
        source,
        tabId: normalizePositiveInteger(details?.tabId, 0),
      }).catch(() => {});
    }

    function onTabUpdated(tabId, changeInfo, tab) {
      const candidateUrl = normalizeString(changeInfo?.url || tab?.url);
      if (!candidateUrl) {
        return;
      }
      handleCapturedCallback(candidateUrl, {
        source: 'tabs.onUpdated',
        tabId: normalizePositiveInteger(tabId, 0),
      }).catch(() => {});
    }

    function ensureCallbackListeners() {
      if (listenersBound) {
        return;
      }

      chrome.webNavigation.onCommitted.addListener((details) => {
        onNavigationEvent(details, 'webNavigation.onCommitted');
      });
      chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
        onNavigationEvent(details, 'webNavigation.onHistoryStateUpdated');
      });
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      listenersBound = true;
    }

    return {
      ensureCallbackListeners,
      handleCapturedCallback,
      isContributionCallbackUrl,
      isContributionFinalStatus,
      pollContributionStatus,
      startContributionFlow,
      submitContributionCallback,
    };
  }

  return {
    ACTIVE_STATUSES,
    FINAL_STATUSES,
    RUNTIME_DEFAULTS,
    RUNTIME_KEYS,
    createContributionOAuthManager,
  };
});
