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
      normalizeSub2ApiUrl,
      rememberSourceLastUrl,
      sendToContentScript,
      sendToContentScriptResilient,
      waitForTabUrlFamily,
      DEFAULT_SUB2API_GROUP_NAME,
      SUB2API_STEP1_RESPONSE_TIMEOUT_MS,
    } = deps;

    async function requestOAuthUrlFromPanel(state, options = {}) {
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

      await addLog(`${logLabel}：正在打开 CPA 面板...`);

      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];
      await closeConflictingTabsForSource('vps-panel', state.vpsUrl);

      const tab = await chrome.tabs.create({ url: state.vpsUrl, active: true });
      const tabId = tab.id;
      await rememberSourceLastUrl('vps-panel', state.vpsUrl);

      await addLog(`${logLabel}：CPA 面板已打开，正在等待页面进入目标地址...`);
      const matchedTab = await waitForTabUrlFamily('vps-panel', tabId, state.vpsUrl, {
        timeoutMs: 15000,
        retryDelayMs: 400,
      });
      if (!matchedTab) {
        await addLog(`${logLabel}：CPA 页面尚未完全进入目标地址，继续尝试连接内容脚本...`, 'warn');
      }

      await ensureContentScriptReadyOnTab('vps-panel', tabId, {
        inject: injectFiles,
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `${logLabel}：CPA 面板仍在加载，正在重试连接内容脚本...`,
      });

      const result = await sendToContentScriptResilient('vps-panel', {
        type: 'REQUEST_OAUTH_URL',
        source: 'background',
        payload: {
          vpsPassword: state.vpsPassword,
          logStep: 6,
        },
      }, {
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: `${logLabel}：CPA 面板通信未就绪，正在等待页面恢复...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
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
          logStep: 6,
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
      requestCpaOAuthUrl,
      requestSub2ApiOAuthUrl,
    };
  }

  return {
    createPanelBridge,
  };
});
