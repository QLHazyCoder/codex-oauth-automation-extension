(function attachBackgroundPanelBridge(root, factory) {
  root.MultiPageBackgroundPanelBridge = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPanelBridgeModule() {
  function createPanelBridge(deps = {}) {
    const {
      chrome,
      addLog,
      closeConflictingTabsForSource,
      ensureContentScriptReadyOnTab,
      getPanelMode,
      normalizeCodex2ApiUrl,
      normalizeSub2ApiUrl,
      rememberSourceLastUrl,
      sendToContentScript,
      sendToContentScriptResilient,
      waitForTabUrlFamily,
      DEFAULT_SUB2API_GROUP_NAME,
      SUB2API_STEP1_RESPONSE_TIMEOUT_MS,
    } = deps;

    function normalizeAdminKey(value = '') {
      return String(value || '').trim();
    }

    function extractStateFromAuthUrl(authUrl = '') {
      try {
        return new URL(authUrl).searchParams.get('state') || '';
      } catch {
        return '';
      }
    }

    function getCodex2ApiErrorMessage(payload, responseStatus = 500) {
      const candidates = [
        payload?.error,
        payload?.message,
        payload?.detail,
        payload?.reason,
      ];
      const message = candidates
        .map((value) => String(value || '').trim())
        .find(Boolean);
      return message || `Codex2API 请求失败（HTTP ${responseStatus}）。`;
    }

    function deriveCpaManagementOrigin(vpsUrl) {
      const normalizedUrl = String(vpsUrl || '').trim();
      if (!normalizedUrl) {
        throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
      }
      let parsed;
      try {
        parsed = new URL(normalizedUrl);
      } catch {
        throw new Error('CPA 地址格式无效，请先在侧边栏检查。');
      }
      return parsed.origin;
    }

    function getCpaApiErrorMessage(payload, responseStatus = 500) {
      const candidates = [
        payload?.error,
        payload?.message,
        payload?.detail,
        payload?.reason,
      ];
      const message = candidates
        .map((value) => String(value || '').trim())
        .find(Boolean);
      return message || `CPA 管理接口请求失败（HTTP ${responseStatus}）。`;
    }

    async function fetchCpaManagementJson(origin, path, options = {}) {
      const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 20000));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const managementKey = String(options.managementKey || '').trim();
        const headers = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        };
        if (managementKey) {
          headers.Authorization = `Bearer ${managementKey}`;
          headers['X-Management-Key'] = managementKey;
        }

        const response = await fetch(`${origin}${path}`, {
          method: options.method || 'POST',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (!response.ok) {
          throw new Error(getCpaApiErrorMessage(payload, response.status));
        }

        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('CPA 管理接口请求超时，请稍后重试。');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function fetchCodex2ApiJson(origin, path, options = {}) {
      const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 30000));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${origin}${path}`, {
          method: options.method || 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Admin-Key': normalizeAdminKey(options.adminKey),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (!response.ok) {
          throw new Error(getCodex2ApiErrorMessage(payload, response.status));
        }

        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('Codex2API 请求超时，请稍后重试。');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function requestOAuthUrlFromPanel(state, options = {}) {
      if (getPanelMode(state) === 'codex2api') {
        return requestCodex2ApiOAuthUrl(state, options);
      }
      if (getPanelMode(state) === 'sub2api') {
        return requestSub2ApiOAuthUrl(state, options);
      }
      return requestCpaOAuthUrl(state, options);
    }

    async function requestCpaOAuthUrl(state, options = {}) {
      const { logLabel = 'OAuth 刷新' } = options;
      if (!state.vpsUrl) {
        throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
      }
      const managementKey = String(state.vpsPassword || '').trim();
      if (!managementKey) {
        throw new Error('尚未配置 CPA 管理密钥，请先在侧边栏填写。');
      }

      const origin = deriveCpaManagementOrigin(state.vpsUrl);

      await addLog(`${logLabel}：正在通过 CPA 管理接口获取 OAuth 授权链接...`);
      const result = await fetchCpaManagementJson(origin, '/v0/management/codex-auth-url', {
        method: 'GET',
        managementKey,
      });

      const oauthUrl = String(
        result?.url
        || result?.auth_url
        || result?.authUrl
        || result?.data?.url
        || result?.data?.auth_url
        || result?.data?.authUrl
        || ''
      ).trim();
      const oauthState = String(
        result?.state
        || result?.auth_state
        || result?.authState
        || result?.data?.state
        || result?.data?.auth_state
        || result?.data?.authState
        || ''
      ).trim()
        || extractStateFromAuthUrl(oauthUrl);

      if (!oauthUrl || !oauthUrl.startsWith('http')) {
        throw new Error('CPA 管理接口未返回有效的 auth_url。');
      }

      return {
        oauthUrl,
        cpaOAuthState: oauthState || null,
        cpaManagementOrigin: origin,
      };
    }

    async function requestCodex2ApiOAuthUrl(state, options = {}) {
      const { logLabel = 'OAuth 刷新' } = options;
      const codex2apiUrl = normalizeCodex2ApiUrl(state.codex2apiUrl);
      const adminKey = normalizeAdminKey(state.codex2apiAdminKey);

      if (!adminKey) {
        throw new Error('尚未配置 Codex2API 管理密钥，请先在侧边栏填写。');
      }

      const origin = new URL(codex2apiUrl).origin;
      await addLog(`${logLabel}：正在通过 Codex2API 协议生成 OAuth 授权链接...`);

      const result = await fetchCodex2ApiJson(origin, '/api/admin/oauth/generate-auth-url', {
        adminKey,
        method: 'POST',
        body: {},
      });

      const oauthUrl = String(result?.auth_url || result?.authUrl || '').trim();
      const sessionId = String(result?.session_id || result?.sessionId || '').trim();
      const oauthState = extractStateFromAuthUrl(oauthUrl);

      if (!oauthUrl || !sessionId) {
        throw new Error('Codex2API 未返回有效的 auth_url 或 session_id。');
      }

      return {
        oauthUrl,
        codex2apiSessionId: sessionId,
        codex2apiOAuthState: oauthState || null,
      };
    }

    async function requestSub2ApiOAuthUrl(state, options = {}) {
      const { logLabel = 'OAuth 刷新' } = options;
      const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
      const groupName = (state.sub2apiGroupName || DEFAULT_SUB2API_GROUP_NAME).trim() || DEFAULT_SUB2API_GROUP_NAME;

      if (!state.sub2apiEmail) {
        throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
      }
      if (!state.sub2apiPassword) {
        throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
      }

      await addLog(`${logLabel}：正在打开 SUB2API 后台...`);

      const injectFiles = ['content/utils.js', 'content/sub2api-panel.js'];
      await closeConflictingTabsForSource('sub2api-panel', sub2apiUrl);

      const tab = await chrome.tabs.create({ url: sub2apiUrl, active: true });
      const tabId = tab.id;
      await rememberSourceLastUrl('sub2api-panel', sub2apiUrl);

      await addLog(`${logLabel}：SUB2API 页面已打开，正在等待页面进入目标地址...`);
      const matchedTab = await waitForTabUrlFamily('sub2api-panel', tabId, sub2apiUrl, {
        timeoutMs: 15000,
        retryDelayMs: 400,
      });
      if (!matchedTab) {
        await addLog(`${logLabel}：SUB2API 页面尚未稳定，继续尝试连接内容脚本...`, 'warn');
      }

      await ensureContentScriptReadyOnTab('sub2api-panel', tabId, {
        inject: injectFiles,
        injectSource: 'sub2api-panel',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `${logLabel}：SUB2API 页面仍在加载，正在重试连接内容脚本...`,
      });

      const result = await sendToContentScript('sub2api-panel', {
        type: 'REQUEST_OAUTH_URL',
        source: 'background',
        payload: {
          sub2apiUrl,
          sub2apiEmail: state.sub2apiEmail,
          sub2apiPassword: state.sub2apiPassword,
          sub2apiGroupName: groupName,
          sub2apiDefaultProxyName: state.sub2apiDefaultProxyName,
          logStep: 7,
        },
      }, {
        responseTimeoutMs: SUB2API_STEP1_RESPONSE_TIMEOUT_MS,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    return {
      requestOAuthUrlFromPanel,
      requestCodex2ApiOAuthUrl,
      requestCpaOAuthUrl,
      requestSub2ApiOAuthUrl,
    };
  }

  return {
    createPanelBridge,
  };
});
