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
      normalizeSub2ApiUrl,
      rememberSourceLastUrl,
      reuseOrCreateTab,
      sendToContentScript,
      sendToContentScriptResilient,
      shouldBypassStep9ForLocalCpa,
      SUB2API_STEP9_RESPONSE_TIMEOUT_MS,
    } = deps;

    async function executeStep10(state) {
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
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: '步骤 10：CPA 面板通信未就绪，正在等待页面恢复...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
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
      executeStep10,
      executeSub2ApiStep10,
    };
  }

  return { createStep10Executor };
});
