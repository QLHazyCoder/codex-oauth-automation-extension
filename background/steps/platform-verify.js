(function attachBackgroundStep10(root, factory) {
  root.MultiPageBackgroundStep10 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep10Module() {
  function createStep10Executor(deps = {}) {
    const {
      addLog,
      chrome,
      closeConflictingTabsForSource,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getPanelMode,
      getTabId,
      isLocalhostOAuthCallbackUrl,
      isTabAlive,
      normalizeCodex2ApiUrl,
      normalizeSub2ApiUrl,
      rememberSourceLastUrl,
      reuseOrCreateTab,
      sendToContentScript,
      sendToContentScriptResilient,
      shouldBypassStep9ForLocalCpa,
      SUB2API_STEP9_RESPONSE_TIMEOUT_MS,
    } = deps;

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    function parseLocalhostCallback(rawUrl) {
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        throw new Error('步骤 10 捕获到的 localhost OAuth 回调地址格式无效，请重新执行步骤 9。');
      }

      const code = normalizeString(parsed.searchParams.get('code'));
      const state = normalizeString(parsed.searchParams.get('state'));
      if (!code || !state) {
        throw new Error('步骤 10 捕获到的 localhost OAuth 回调地址缺少 code 或 state，请重新执行步骤 9。');
      }

      return {
        url: parsed.toString(),
        code,
        state,
      };
    }

    function getCodex2ApiErrorMessage(payload, responseStatus = 500) {
      const details = [
        payload?.error,
        payload?.message,
        payload?.detail,
        payload?.reason,
      ]
        .map((value) => normalizeString(value))
        .find(Boolean);
      return details || `Codex2API 请求失败（HTTP ${responseStatus}）。`;
    }

    async function fetchCodex2ApiJson(origin, path, options = {}) {
      const controller = new AbortController();
      const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 30000));
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${origin}${path}`, {
          method: options.method || 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Admin-Key': normalizeString(options.adminKey),
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

    async function executeStep10(state) {
      if (getPanelMode(state) === 'codex2api') {
        return executeCodex2ApiStep10(state);
      }
      if (getPanelMode(state) === 'sub2api') {
        return executeSub2ApiStep10(state);
      }
      return executeCpaStep10(state);
    }

    async function executeCpaStep10(state) {
      if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
        throw new Error('步骤 9 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 9。');
      }
      if (!state.localhostUrl) {
        throw new Error('缺少 localhost 回调地址，请先完成步骤 9。');
      }
      if (!state.vpsUrl) {
        throw new Error('尚未填写 CPA 地址，请先在侧边栏输入。');
      }

      if (shouldBypassStep9ForLocalCpa(state)) {
        await addLog('步骤 10：检测到本地 CPA，且当前策略为“跳过第10步”，本轮不再重复提交回调地址。', 'info');
        await completeStepFromBackground(10, {
          localhostUrl: state.localhostUrl,
          verifiedStatus: 'local-auto',
        });
        return;
      }

      await addLog('步骤 10：正在打开 CPA 面板...');

      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];
      let tabId = await getTabId('vps-panel');
      const alive = tabId && await isTabAlive('vps-panel');

      if (!alive) {
        tabId = await reuseOrCreateTab('vps-panel', state.vpsUrl, {
          inject: injectFiles,
          reloadIfSameUrl: true,
        });
      } else {
        await closeConflictingTabsForSource('vps-panel', state.vpsUrl, { excludeTabIds: [tabId] });
        await chrome.tabs.update(tabId, { active: true });
        await rememberSourceLastUrl('vps-panel', state.vpsUrl);
      }

      await ensureContentScriptReadyOnTab('vps-panel', tabId, {
        inject: injectFiles,
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: '步骤 10：CPA 面板仍在加载，正在重试连接...',
      });

      await addLog('步骤 10：正在填写回调地址...');
      const result = await sendToContentScriptResilient('vps-panel', {
        type: 'EXECUTE_STEP',
        step: 10,
        source: 'background',
        payload: { localhostUrl: state.localhostUrl, vpsPassword: state.vpsPassword },
      }, {
        timeoutMs: 125000,
        responseTimeoutMs: 125000,
        retryDelayMs: 700,
        logMessage: '步骤 10：CPA 面板通信未就绪，正在等待页面恢复...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
    }

    async function executeCodex2ApiStep10(state) {
      if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
        throw new Error('步骤 9 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 9。');
      }
      if (!state.localhostUrl) {
        throw new Error('缺少 localhost 回调地址，请先完成步骤 9。');
      }
      if (!state.codex2apiSessionId) {
        throw new Error('缺少 Codex2API 会话信息，请重新执行步骤 7。');
      }
      if (!normalizeString(state.codex2apiAdminKey)) {
        throw new Error('尚未配置 Codex2API 管理密钥，请先在侧边栏填写。');
      }

      const callback = parseLocalhostCallback(state.localhostUrl);
      const expectedState = normalizeString(state.codex2apiOAuthState);
      if (expectedState && expectedState !== callback.state) {
        throw new Error('Codex2API 回调 state 与当前授权会话不匹配，请重新执行步骤 7。');
      }

      const codex2apiUrl = normalizeCodex2ApiUrl(state.codex2apiUrl);
      const origin = new URL(codex2apiUrl).origin;

      await addLog('步骤 10：正在向 Codex2API 提交回调并创建账号...');
      const result = await fetchCodex2ApiJson(origin, '/api/admin/oauth/exchange-code', {
        adminKey: state.codex2apiAdminKey,
        method: 'POST',
        body: {
          session_id: state.codex2apiSessionId,
          code: callback.code,
          state: callback.state,
        },
      });

      const verifiedStatus = normalizeString(result?.message) || 'Codex2API OAuth 账号添加成功';
      await addLog(`步骤 10：${verifiedStatus}`, 'ok');
      await completeStepFromBackground(10, {
        localhostUrl: callback.url,
        verifiedStatus,
      });
    }

    async function executeSub2ApiStep10(state) {
      if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
        throw new Error('步骤 9 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 9。');
      }
      if (!state.localhostUrl) {
        throw new Error('缺少 localhost 回调地址，请先完成步骤 9。');
      }
      if (!state.sub2apiSessionId) {
        throw new Error('缺少 SUB2API 会话信息，请重新执行步骤 1。');
      }
      if (!state.sub2apiEmail) {
        throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
      }
      if (!state.sub2apiPassword) {
        throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
      }

      const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
      const injectFiles = ['content/utils.js', 'content/sub2api-panel.js'];

      await addLog('步骤 10：正在打开 SUB2API 后台...');

      let tabId = await getTabId('sub2api-panel');
      const alive = tabId && await isTabAlive('sub2api-panel');

      if (!alive) {
        tabId = await reuseOrCreateTab('sub2api-panel', sub2apiUrl, {
          inject: injectFiles,
          injectSource: 'sub2api-panel',
          reloadIfSameUrl: true,
        });
      } else {
        await closeConflictingTabsForSource('sub2api-panel', sub2apiUrl, { excludeTabIds: [tabId] });
        await chrome.tabs.update(tabId, { active: true });
        await rememberSourceLastUrl('sub2api-panel', sub2apiUrl);
      }

      await ensureContentScriptReadyOnTab('sub2api-panel', tabId, {
        inject: injectFiles,
        injectSource: 'sub2api-panel',
      });

      await addLog('步骤 10：正在向 SUB2API 提交回调并创建账号...');
      const result = await sendToContentScript('sub2api-panel', {
        type: 'EXECUTE_STEP',
        step: 10,
        source: 'background',
        payload: {
          localhostUrl: state.localhostUrl,
          sub2apiUrl,
          sub2apiEmail: state.sub2apiEmail,
          sub2apiPassword: state.sub2apiPassword,
          sub2apiGroupName: state.sub2apiGroupName,
          sub2apiDefaultProxyName: state.sub2apiDefaultProxyName,
          sub2apiProxyId: state.sub2apiProxyId,
          sub2apiSessionId: state.sub2apiSessionId,
          sub2apiOAuthState: state.sub2apiOAuthState,
          sub2apiGroupId: state.sub2apiGroupId,
          sub2apiDraftName: state.sub2apiDraftName,
        },
      }, {
        responseTimeoutMs: SUB2API_STEP9_RESPONSE_TIMEOUT_MS,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
    }

    return {
      executeCpaStep10,
      executeCodex2ApiStep10,
      executeStep10,
      executeSub2ApiStep10,
    };
  }

  return { createStep10Executor };
});
