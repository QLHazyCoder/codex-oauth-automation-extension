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
      ensureMail2925AccountForFlow,
      ensureLuckmailPurchaseForFlow,
      isGeneratedAliasProvider,
      isReusableGeneratedAliasEmail,
      isHotmailProvider,
      isRetryableContentScriptTransportError = () => false,
      isLuckmailProvider,
      isSignupEmailVerificationPageUrl,
      isSignupPasswordPageUrl,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      setEmailState,
      SIGNUP_ENTRY_URL,
      SIGNUP_PAGE_INJECT_FILES,
      waitForTabUrlMatch,
    } = deps;

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
      const result = await sendToContentScriptResilient('signup-page', {
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

      const result = await sendToContentScriptResilient('signup-page', {
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

    async function finalizeSignupPasswordSubmitInTab(tabId, password = '', step = 3) {
      if (!Number.isInteger(tabId)) {
        throw new Error(`认证页面标签页已关闭，无法完成步骤 ${step} 的提交后确认。`);
      }

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：认证页仍在切换，正在等待页面恢复后继续确认提交流程...`,
      });

      let result;
      try {
        result = await sendToContentScriptResilient('signup-page', {
          type: 'PREPARE_SIGNUP_VERIFICATION',
          step,
          source: 'background',
          payload: {
            password: password || '',
            prepareSource: 'step3_finalize',
            prepareLogLabel: '步骤 3 收尾',
          },
        }, {
          timeoutMs: 30000,
          retryDelayMs: 700,
          logMessage: `步骤 ${step}：密码已提交，正在确认是否进入下一页面，必要时自动恢复重试页...`,
        });
      } catch (error) {
        if (isRetryableContentScriptTransportError(error)) {
          const message = `步骤 ${step}：认证页在提交后切换过程中页面通信超时，未能重新就绪，暂时无法确认是否进入下一页面。请重试当前轮。`;
          if (typeof addLog === 'function') {
            await addLog(message, 'warn');
          }
          throw new Error(message);
        }
        throw error;
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      return result || {};
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
        if (Boolean(state?.mail2925UseAccountPool)
          && String(state?.mailProvider || '').trim().toLowerCase() === '2925'
          && typeof ensureMail2925AccountForFlow === 'function') {
          await ensureMail2925AccountForFlow({
            allowAllocate: true,
            preferredAccountId: state.currentMail2925AccountId || null,
            markUsed: true,
          });
        }
        if (!isReusableGeneratedAliasEmail?.(state, resolvedEmail)) {
          resolvedEmail = buildGeneratedAliasEmail(state);
        }
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
      ensureSignupEntryPageReady,
      ensureSignupPostEmailPageReadyInTab,
      finalizeSignupPasswordSubmitInTab,
      ensureSignupPasswordPageReadyInTab,
      openSignupEntryTab,
      resolveSignupEmailForFlow,
    };
  }

  return {
    createSignupFlowHelpers,
  };
});
