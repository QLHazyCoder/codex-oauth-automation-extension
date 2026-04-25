(function attachBackgroundStep2(root, factory) {
  root.MultiPageBackgroundStep2 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep2Module() {
  function createStep2Executor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      ensureSignupAuthEntryPageReady,
      ensureSignupEntryPageReady,
      ensureSignupPostEmailPageReadyInTab,
      getTabId,
      isTabAlive,
      resolveSignupEmailForFlow,
      sendToContentScriptResilient,
      SIGNUP_PAGE_INJECT_FILES,
    } = deps;

    function getErrorMessage(error) {
      return String(typeof error === 'string' ? error : error?.message || '');
    }

    function isSignupEntryUnavailableErrorMessage(errorLike) {
      const message = getErrorMessage(errorLike);
      return /未找到可用的邮箱输入入口|当前页面没有可用的注册入口，也不在邮箱\/密码页/.test(message);
    }

    function isRetryableStep2TransportErrorMessage(errorLike) {
      const message = getErrorMessage(errorLike);
      return /Content script on signup-page did not respond in \d+s|Receiving end does not exist|message channel closed|A listener indicated an asynchronous response|port closed before a response was received|did not respond in \d+s/i.test(message);
    }

    function isLikelyLoggedInChatgptHomeUrl(rawUrl) {
      const url = String(rawUrl || '').trim();
      if (!url) {
        return false;
      }
      try {
        const parsed = new URL(url);
        const host = String(parsed.hostname || '').toLowerCase();
        if (!['chatgpt.com', 'www.chatgpt.com'].includes(host)) {
          return false;
        }
        const path = String(parsed.pathname || '');
        if (/^\/(?:auth\/|create-account\/|email-verification|log-in|add-phone)(?:[/?#]|$)/i.test(path)) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }

    async function shouldForceAuthEntryRetry(tabId) {
      if (!Number.isInteger(tabId) || typeof chrome?.tabs?.get !== 'function') {
        return false;
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = String(tab?.url || '');
        return isLikelyLoggedInChatgptHomeUrl(currentUrl);
      } catch {
        return false;
      }
    }

    async function getTabUrl(tabId) {
      if (!Number.isInteger(tabId) || typeof chrome?.tabs?.get !== 'function') {
        return '';
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        return String(tab?.url || '');
      } catch {
        return '';
      }
    }

    async function completeStep2AsLoggedInSession(tabId, resolvedEmail, reasonMessage = '') {
      const currentUrl = await getTabUrl(tabId);
      if (!isLikelyLoggedInChatgptHomeUrl(currentUrl)) {
        return false;
      }
      const reasonText = getErrorMessage(reasonMessage);
      const reasonSuffix = reasonText ? `（触发原因：${reasonText}）` : '';
      await addLog(`步骤 2：检测到当前会话已登录 ChatGPT，已跳过注册链路（步骤 3/4/5），将直接进入步骤 6。${reasonSuffix}`, 'warn');
      await completeStepFromBackground(2, {
        email: resolvedEmail,
        nextSignupState: 'already_logged_in_home',
        nextSignupUrl: currentUrl || 'https://chatgpt.com/',
        skippedPasswordStep: true,
        skipRegistrationFlow: true,
      });
      return true;
    }

    async function submitSignupEmail(resolvedEmail, options = {}) {
      const {
        timeoutMs = 35000,
        retryDelayMs = 700,
        logMessage = '步骤 2：官网注册入口正在切换，等待页面恢复后继续输入邮箱...',
      } = options;

      try {
        return await sendToContentScriptResilient('signup-page', {
          type: 'EXECUTE_STEP',
          step: 2,
          source: 'background',
          payload: { email: resolvedEmail },
        }, {
          timeoutMs,
          retryDelayMs,
          logMessage,
        });
      } catch (error) {
        return { error: getErrorMessage(error) };
      }
    }

    async function executeStep2(state) {
      const resolvedEmail = await resolveSignupEmailForFlow(state);

      let signupTabId = await getTabId('signup-page');
      if (!signupTabId || !(await isTabAlive('signup-page'))) {
        await addLog('步骤 2：未发现可用的注册页标签，正在重新打开 ChatGPT 官网...', 'warn');
        signupTabId = (await ensureSignupEntryPageReady(2)).tabId;
      } else {
        await chrome.tabs.update(signupTabId, { active: true });
        await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          timeoutMs: 45000,
          retryDelayMs: 900,
          logMessage: '步骤 2：注册入口页内容脚本未就绪，正在等待页面恢复...',
        });
      }

      if (await shouldForceAuthEntryRetry(signupTabId)) {
        await addLog('步骤 2：检测到当前位于已登录 ChatGPT 首页，先切换认证入口页再提交邮箱。', 'warn');
        try {
          signupTabId = (await ensureSignupAuthEntryPageReady(2)).tabId;
        } catch (entryError) {
          const entryErrorMessage = getErrorMessage(entryError);
          if (await completeStep2AsLoggedInSession(signupTabId, resolvedEmail, entryErrorMessage)) {
            return;
          }
          await addLog('步骤 2：切换认证入口失败，正在重新打开官网入口并重试提交邮箱...', 'warn');
          signupTabId = (await ensureSignupEntryPageReady(2)).tabId;
        }
      }

      let step2Result = await submitSignupEmail(resolvedEmail, {
        timeoutMs: 35000,
        retryDelayMs: 700,
        logMessage: '步骤 2：官网注册入口正在切换，等待页面恢复后继续输入邮箱...',
      });

      if (step2Result?.error) {
        const errorMessage = getErrorMessage(step2Result.error);
        if (isSignupEntryUnavailableErrorMessage(errorMessage)) {
          await addLog('步骤 2：未找到邮箱输入入口，正在切换认证入口页后重试一次...', 'warn');
          signupTabId = (await ensureSignupAuthEntryPageReady(2)).tabId;
          step2Result = await submitSignupEmail(resolvedEmail, {
            timeoutMs: 35000,
            retryDelayMs: 700,
            logMessage: '步骤 2：认证入口页已打开，正在重新提交邮箱...',
          });

          if (step2Result?.error) {
            const retryErrorMessage = getErrorMessage(step2Result.error);
            if (isSignupEntryUnavailableErrorMessage(retryErrorMessage)) {
              if (await completeStep2AsLoggedInSession(signupTabId, resolvedEmail, retryErrorMessage)) {
                return;
              }
              await addLog('步骤 2：认证入口仍不可用，正在重新进入官网注册入口再重试一次...', 'warn');
              signupTabId = (await ensureSignupEntryPageReady(2)).tabId;
              step2Result = await submitSignupEmail(resolvedEmail, {
                timeoutMs: 35000,
                retryDelayMs: 700,
                logMessage: '步骤 2：重试官网注册入口后正在重新提交邮箱...',
              });
            }
          }
        } else if (isRetryableStep2TransportErrorMessage(errorMessage)) {
          await addLog('步骤 2：注册入口页通信超时，正在切换认证入口页并重试提交邮箱...', 'warn');
          signupTabId = (await ensureSignupAuthEntryPageReady(2)).tabId;
          step2Result = await submitSignupEmail(resolvedEmail, {
            timeoutMs: 45000,
            retryDelayMs: 700,
            logMessage: '步骤 2：认证入口页已打开，正在重新提交邮箱...',
          });
        }
      }

      if (step2Result?.error) {
        const finalErrorMessage = getErrorMessage(step2Result.error);
        if (
          (isSignupEntryUnavailableErrorMessage(finalErrorMessage)
            || isRetryableStep2TransportErrorMessage(finalErrorMessage))
          && await completeStep2AsLoggedInSession(signupTabId, resolvedEmail, finalErrorMessage)
        ) {
          return;
        }
        throw new Error(finalErrorMessage);
      }

      if (!step2Result?.alreadyOnPasswordPage) {
        await addLog(`步骤 2：邮箱 ${resolvedEmail} 已提交，正在等待页面加载并确认下一步入口...`);
      }

      const landingResult = await ensureSignupPostEmailPageReadyInTab(signupTabId, 2, {
        skipUrlWait: Boolean(step2Result?.alreadyOnPasswordPage),
      });

      await completeStepFromBackground(2, {
        email: resolvedEmail,
        nextSignupState: landingResult?.state || 'password_page',
        nextSignupUrl: landingResult?.url || step2Result?.url || '',
        skippedPasswordStep: landingResult?.state === 'verification_page',
      });
    }

    return { executeStep2 };
  }

  return { createStep2Executor };
});
