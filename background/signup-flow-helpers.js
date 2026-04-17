(function attachSignupFlowHelpers(root, factory) {
  root.MultiPageSignupFlowHelpers = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSignupFlowHelpersModule() {
  function createSignupFlowHelpers(deps = {}) {
    const {
      addLog,
      buildGeneratedAliasEmail,
      chrome,
      ensureContentScriptReadyOnTab,
      ensureHotmailAccountForFlow,
      ensureLuckmailPurchaseForFlow,
      getErrorMessage,
      getState,
      getTabId,
      isGeneratedAliasProvider,
      isHotmailProvider,
      isLuckmailProvider,
      isRetryableContentScriptTransportError,
      matchesSourceUrlFamily,
      isSignupEmailVerificationPageUrl,
      isSignupPasswordPageUrl,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      setEmailState,
      setState,
      SIGNUP_ENTRY_URL,
      SIGNUP_PAGE_INJECT_FILES,
      sleepWithStop,
      throwIfStopped,
      waitForTabUrlMatch,
    } = deps;

    async function getSignupPageHealthFromContent() {
      try {
        const result = await sendToContentScriptResilient(
          'signup-page',
          {
            type: 'GET_SIGNUP_PAGE_HEALTH',
            source: 'background',
            payload: {},
          },
          {
            timeoutMs: 15000,
            retryDelayMs: 600,
            logMessage: '步骤 4：认证页正在切换，等待页面恢复后继续检查页面状态...',
          }
        );

        if (result?.error) {
          throw new Error(result.error);
        }

        return result || {};
      } catch (err) {
        if (!isRetryableContentScriptTransportError(err)) {
          throw err;
        }

        return await probeSignupPageHealthFromTab(err);
      }
    }

    async function probeSignupPageHealthFromTab(originalError = null) {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw originalError || new Error('认证页面标签页已关闭，无法探测页面健康状态。');
      }

      const tab = await chrome.tabs.get(signupTabId);
      const fallbackUrl = String(tab?.url || '').trim();
      const fallbackTitle = String(tab?.title || '').trim();
      let probeResult = null;

      try {
        const injected = await chrome.scripting.executeScript({
          target: { tabId: signupTabId },
          func: () => {
            const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
            const body = document.body;
            const pageText = normalize(document.body?.innerText || document.body?.textContent || '');
            const title = normalize(document.title || '');
            const hasInteractiveElements = Boolean(
              document.querySelector('input, button, a, form, [role="button"], [role="link"]')
            );
            const hasVisualElements = Boolean(document.querySelector('img, svg, canvas, video'));
            const childCount = body?.children?.length || 0;
            const isMethodNotAllowed = /405\b[\s\S]{0,80}method\s+not\s+allowed|method\s+not\s+allowed|405/i.test(pageText);
            const isUnknownError = /unknown\s+error/i.test(pageText) || /unknown\s+error/i.test(title);
            const isBlankPage = !isMethodNotAllowed
              && !isUnknownError
              && pageText.length < 20
              && !hasInteractiveElements
              && !hasVisualElements
              && childCount <= 1
              && title.length < 10;

            return {
              url: location.href,
              path: location.pathname || '',
              title: document.title || '',
              isMethodNotAllowed,
              isUnknownError,
              isBlankPage,
              bodyTextLength: pageText.length,
              hasInteractiveElements,
              hasVisualElements,
              childCount,
              readyState: document.readyState || '',
            };
          },
        });
        probeResult = injected?.[0]?.result || null;
      } catch (probeError) {
        console.warn('[MultiPage:signup-flow-helpers] [probeSignupPageHealthFromTab] executeScript failed:', probeError?.message || probeError);
      }

      const likelyBlankWithoutProbe = Boolean(
        !probeResult
        && fallbackUrl
        && matchesSourceUrlFamily('signup-page', fallbackUrl, fallbackUrl)
        && String(tab?.status || '').toLowerCase() === 'complete'
        && !fallbackTitle
      );

      const health = {
        url: probeResult?.url || fallbackUrl,
        path: probeResult?.path || '',
        title: probeResult?.title || fallbackTitle,
        isMethodNotAllowed: Boolean(probeResult?.isMethodNotAllowed),
        isUnknownError: Boolean(probeResult?.isUnknownError),
        isBlankPage: Boolean(probeResult?.isBlankPage) || likelyBlankWithoutProbe,
        bodyTextLength: Number(probeResult?.bodyTextLength) || 0,
        hasInteractiveElements: Boolean(probeResult?.hasInteractiveElements),
        hasVisualElements: Boolean(probeResult?.hasVisualElements),
        childCount: Number(probeResult?.childCount) || 0,
        readyState: probeResult?.readyState || '',
        detectedBy: probeResult ? 'tab_probe' : 'tab_metadata',
        originalError: getErrorMessage(originalError),
      };

      if (health.isMethodNotAllowed || health.isUnknownError || health.isBlankPage) {
        await addLog(
          `步骤 4：内容脚本已失联，已通过标签页旁路探测识别到${health.isMethodNotAllowed ? '405' : (health.isUnknownError ? 'Unknown error' : '白屏')}页面，准备自动恢复。`,
          'warn'
        );
      }

      return health;
    }

    async function reloadSignupPageKeepingUrl(step = 4, url = '') {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error(`步骤 ${step}：认证页面标签页已关闭，无法刷新白屏页面。`);
      }

      const targetUrl = String(url || '').trim();
      await addLog(`步骤 ${step}：检测到认证页白屏，正在刷新当前页面恢复...`, 'warn');

      const state = await getState();
      const registry = state?.tabRegistry && typeof state.tabRegistry === 'object'
        ? { ...state.tabRegistry }
        : {};
      if (registry['signup-page']) {
        registry['signup-page'] = {
          ...registry['signup-page'],
          ready: false,
        };
        await setState({ tabRegistry: registry });
      }

      if (targetUrl) {
        await chrome.tabs.update(signupTabId, { url: targetUrl, active: true });
      } else {
        await chrome.tabs.reload(signupTabId);
        await chrome.tabs.update(signupTabId, { active: true });
      }

      await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：认证页正在从白屏恢复，等待重新加载...`,
      });

      return signupTabId;
    }

    async function forceRecoverSignupPageByReopen(step = 4, options = {}) {
      const {
        targetUrl = '',
        reason = '认证页异常',
        includeEntryHop = true,
      } = options;
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error(`步骤 ${step}：认证页面标签页已关闭，无法强制恢复页面。`);
      }

      let currentTabUrl = '';
      try {
        const currentTab = await chrome.tabs.get(signupTabId);
        currentTabUrl = String(currentTab?.url || '').trim();
      } catch {}

      const state = await getState();
      const rememberedUrl = String(state?.sourceLastUrls?.['signup-page'] || '').trim();
      const recoveryUrl = String(targetUrl || currentTabUrl || rememberedUrl || '').trim();
      if (!recoveryUrl) {
        throw new Error(`步骤 ${step}：缺少可用于恢复的认证页地址，无法执行强制恢复。`);
      }

      await addLog(`步骤 ${step}：检测到${reason}，正在强制重开认证页并回到原路径...`, 'warn');

      if (includeEntryHop) {
        const leaveTabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
        });
        await ensureContentScriptReadyOnTab('signup-page', leaveTabId, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          timeoutMs: 45000,
          retryDelayMs: 900,
          logMessage: `步骤 ${step}：认证页正在离开异常页面，等待重新加载...`,
        });
        await sleepWithStop(600);
      }

      const tabId = await reuseOrCreateTab('signup-page', recoveryUrl, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        reloadIfSameUrl: true,
      });
      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：认证页正在回到原路径，等待页面恢复...`,
      });
      await addLog(`步骤 ${step}：已强制重开认证页并返回原路径。`, 'ok');
      return true;
    }

    async function recoverSignupPageIfNeeded(step = 4) {
      throwIfStopped();
      const health = await getSignupPageHealthFromContent();
      if (health?.isMethodNotAllowed && health?.url) {
        await addLog(`步骤 ${step}：检测到认证页出现 405 Method Not Allowed，正在按当前页面路径重新打开...`, 'warn');
        const leaveTabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
        });

        await ensureContentScriptReadyOnTab('signup-page', leaveTabId, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          timeoutMs: 45000,
          retryDelayMs: 900,
          logMessage: `步骤 ${step}：认证页正在从 405 页面恢复，等待重新加载...`,
        });
        await addLog(`步骤 ${step}：已按当前路径重新打开认证页，继续执行。`, 'ok');
        await sleepWithStop(600);
        const tabId = await reuseOrCreateTab('signup-page', health.url, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
        });
        await ensureContentScriptReadyOnTab('signup-page', tabId, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          timeoutMs: 45000,
          retryDelayMs: 900,
          logMessage: `步骤 ${step}：认证页正在重新进入原路径，等待页面恢复...`,
        });
        return true;
      }

      if (health?.isUnknownError && health?.url) {
        await addLog(`步骤 ${step}：检测到认证页出现 Unknown error，正在按当前页面路径重新打开...`, 'warn');
        await forceRecoverSignupPageByReopen(step, {
          targetUrl: health.url,
          reason: '认证页 Unknown error',
          includeEntryHop: true,
        });
        return true;
      }

      if (health?.isBlankPage) {
        await reloadSignupPageKeepingUrl(step, health.url);
        await addLog(`步骤 ${step}：认证页白屏已刷新恢复，继续执行。`, 'ok');
        return true;
      }

      return false;
    }

    async function sendToSignupPageWithRecovery(message, options = {}) {
      const {
        step = Number(message?.step) || 0,
        timeoutMs = 30000,
        retryDelayMs = 700,
        logMessage = '',
        maxRecoveryAttempts = 2,
      } = options;
      let lastError = null;

      const isForcedReopenSignal = (error) => {
        const text = String(typeof error === 'string' ? error : error?.message || '');
        return text.includes('[SIGNUP_PAGE_REOPEN_REQUIRED_405]')
          || text.includes('[SIGNUP_PAGE_REOPEN_REQUIRED_UNKNOWN_ERROR]');
      };

      for (let attempt = 1; attempt <= maxRecoveryAttempts; attempt++) {
        if (step > 0) {
          await recoverSignupPageIfNeeded(step);
        }

        try {
          return await sendToContentScriptResilient('signup-page', message, {
            timeoutMs,
            retryDelayMs,
            logMessage,
          });
        } catch (err) {
          lastError = err;
          if (attempt >= maxRecoveryAttempts || step <= 0) {
            throw err;
          }

          if (isRetryableContentScriptTransportError(err) || isForcedReopenSignal(err)) {
            await forceRecoverSignupPageByReopen(step, {
              reason: '认证页通信中断，需离开当前异常 path 后重新打开原路径',
              includeEntryHop: true,
            });
            await addLog(`步骤 ${step}：认证页进入异常页或导航中断，已强制离开当前异常 path 并重新打开原路径（${attempt + 1}/${maxRecoveryAttempts}）。`, 'warn');
            continue;
          }

          const recovered = await recoverSignupPageIfNeeded(step);
          if (!recovered) {
            throw err;
          }

          await addLog(`步骤 ${step}：认证页出现白屏/异常，已自动恢复并重试当前操作（${attempt + 1}/${maxRecoveryAttempts}）。`, 'warn');
        }
      }

      throw lastError || new Error(`步骤 ${step}：认证页操作失败。`);
    }

    async function openSignupEntryTab(step = 1) {
      const tabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
      });

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：ChatGPT 官网仍在加载，正在重试连接内容脚本...`,
      });

      return tabId;
    }

    async function ensureSignupEntryPageReady(step = 1) {
      const tabId = await openSignupEntryTab(step);
      await recoverSignupPageIfNeeded(step);
      const result = await sendToSignupPageWithRecovery({
        type: 'ENSURE_SIGNUP_ENTRY_READY',
        step,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 20000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：官网注册入口正在切换，等待页面恢复...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      return { tabId, result: result || {} };
    }

    function resolveSignupPostEmailState(rawUrl) {
      if (isSignupPasswordPageUrl(rawUrl)) {
        return 'password_page';
      }
      if (isSignupEmailVerificationPageUrl(rawUrl)) {
        return 'verification_page';
      }
      return '';
    }

    async function ensureSignupPostEmailPageReadyInTab(tabId, step = 2, options = {}) {
      const { skipUrlWait = false } = options;
      let landingUrl = '';
      let landingState = '';

      if (!skipUrlWait) {
        const matchedTab = await waitForTabUrlMatch(tabId, (url) => Boolean(resolveSignupPostEmailState(url)), {
          timeoutMs: 45000,
          retryDelayMs: 300,
        });
        if (!matchedTab) {
          throw new Error('等待邮箱提交后的页面跳转超时，请检查页面是否仍停留在邮箱输入页。');
        }

        landingUrl = matchedTab.url || '';
        landingState = resolveSignupPostEmailState(landingUrl);
      }

      if (!landingState) {
        try {
          const currentTab = await chrome.tabs.get(tabId);
          landingUrl = landingUrl || currentTab?.url || '';
          landingState = resolveSignupPostEmailState(landingUrl);
        } catch {
          landingUrl = landingUrl || '';
        }
      }

      if (!landingState) {
        throw new Error(`邮箱提交后未能识别当前页面，既不是密码页也不是邮箱验证码页。URL: ${landingUrl || 'unknown'}`);
      }

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: landingState === 'verification_page'
          ? `步骤 ${step}：邮箱验证码页仍在加载，正在等待页面恢复...`
          : `步骤 ${step}：密码页仍在加载，正在重试连接内容脚本...`,
      });

      if (landingState === 'verification_page') {
        return {
          ready: true,
          state: landingState,
          url: landingUrl,
        };
      }

      await recoverSignupPageIfNeeded(step);
      const result = await sendToSignupPageWithRecovery({
        type: 'ENSURE_SIGNUP_PASSWORD_PAGE_READY',
        step,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 20000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：认证页正在切换，等待密码页重新就绪...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      return {
        ...(result || {}),
        ready: true,
        state: landingState,
        url: landingUrl,
      };
    }

    async function ensureSignupPasswordPageReadyInTab(tabId, step = 2, options = {}) {
      const result = await ensureSignupPostEmailPageReadyInTab(tabId, step, options);
      if (result.state !== 'password_page') {
        throw new Error(`当前页面不是密码页，实际落地为 ${result.state || 'unknown'}。URL: ${result.url || 'unknown'}`);
      }
      return result;
    }

    async function resolveSignupEmailForFlow(state) {
      let resolvedEmail = state.email;
      if (isHotmailProvider(state)) {
        const account = await ensureHotmailAccountForFlow({
          allowAllocate: true,
          markUsed: true,
          preferredAccountId: state.currentHotmailAccountId || null,
        });
        resolvedEmail = account.email;
      } else if (isLuckmailProvider(state)) {
        const purchase = await ensureLuckmailPurchaseForFlow({ allowReuse: true });
        resolvedEmail = purchase.email_address;
      } else if (isGeneratedAliasProvider(state)) {
        resolvedEmail = buildGeneratedAliasEmail(state);
      }

      if (!resolvedEmail) {
        throw new Error('缺少邮箱地址，请先在侧边栏粘贴邮箱。');
      }

      if (resolvedEmail !== state.email) {
        await setEmailState(resolvedEmail);
      }

      return resolvedEmail;
    }

    return {
      forceRecoverSignupPageByReopen,
      getSignupPageHealthFromContent,
      recoverSignupPageIfNeeded,
      ensureSignupEntryPageReady,
      ensureSignupPostEmailPageReadyInTab,
      ensureSignupPasswordPageReadyInTab,
      openSignupEntryTab,
      resolveSignupEmailForFlow,
      sendToSignupPageWithRecovery,
    };
  }

  return {
    createSignupFlowHelpers,
  };
});
