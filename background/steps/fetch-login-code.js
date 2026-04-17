(function attachBackgroundStep7(root, factory) {
  root.MultiPageBackgroundStep7 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep7Module() {
  function createStep7Executor(deps = {}) {
    const {
      addLog,
      chrome,
      CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      confirmCustomVerificationStepBypass,
      ensureStep7VerificationPageReady,
      executeStep6,
      forceRecoverSignupPageByReopen,
      getPanelMode,
      getMailConfig,
      getState,
      getTabId,
      HOTMAIL_PROVIDER,
      isTabAlive,
      isRetryableContentScriptTransportError,
      isVerificationMailPollingError,
      LUCKMAIL_PROVIDER,
      resolveVerificationStep,
      reuseOrCreateTab,
      setState,
      setStepStatus,
      shouldSkipLoginVerificationForCpaCallback,
      shouldUseCustomRegistrationEmail,
      sleepWithStop,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    async function runStep7Attempt(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);
      const stepStartedAt = Date.now();
      const authTabId = await getTabId('signup-page');

      if (authTabId) {
        await chrome.tabs.update(authTabId, { active: true });
      } else {
        if (!state.oauthUrl) {
          throw new Error('缺少登录用 OAuth 链接，请先完成步骤 6。');
        }
        await reuseOrCreateTab('signup-page', state.oauthUrl);
      }

      throwIfStopped();
      try {
        await ensureStep7VerificationPageReady();
      } catch (err) {
        if (!isRetryableContentScriptTransportError(err)) {
          throw err;
        }

        await forceRecoverSignupPageByReopen(7, {
          reason: `确认登录验证码页时页面通信异常（${err.message || err}）`,
          includeEntryHop: false,
        });
        await ensureStep7VerificationPageReady();
      }
      await addLog('步骤 7：登录验证码页面已就绪，开始获取验证码。', 'info');

      if (shouldUseCustomRegistrationEmail(state)) {
        await confirmCustomVerificationStepBypass(7);
        return;
      }

      throwIfStopped();
      if (mail.provider === HOTMAIL_PROVIDER || mail.provider === LUCKMAIL_PROVIDER || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
        await addLog(`步骤 7：正在通过 ${mail.label} 轮询验证码...`);
      } else {
        await addLog(`步骤 7：正在打开${mail.label}...`);

        const alive = await isTabAlive(mail.source);
        if (alive) {
          if (mail.navigateOnReuse) {
            await reuseOrCreateTab(mail.source, mail.url, {
              inject: mail.inject,
              injectSource: mail.injectSource,
            });
          } else {
            const tabId = await getTabId(mail.source);
            await chrome.tabs.update(tabId, { active: true });
          }
        } else {
          await reuseOrCreateTab(mail.source, mail.url, {
            inject: mail.inject,
            injectSource: mail.injectSource,
          });
        }
      }

      const shouldRefreshOAuthBeforeSubmit = getPanelMode(state) === 'cpa';
      let step6ReplayCompleted = false;

      await resolveVerificationStep(7, state, mail, {
        filterAfterTimestamp: mail.provider === HOTMAIL_PROVIDER ? undefined : Math.max(0, stepStartedAt - 60000),
        requestFreshCodeFirst: false,
        resendIntervalMs: (mail.provider === HOTMAIL_PROVIDER || mail.provider === '2925')
          ? 0
          : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
        beforeSubmit: shouldRefreshOAuthBeforeSubmit ? async (result) => {
          if (step6ReplayCompleted) {
            return;
          }

          step6ReplayCompleted = true;
          await addLog(`步骤 7：已拿到登录验证码 ${result.code}，先刷新 CPA OAuth 链接并重走步骤 6，再回填验证码。`, 'warn');
          await rerunStep6ForStep7Recovery({
            logMessage: '步骤 7：正在重新获取最新 CPA OAuth 链接，并快速重走步骤 6...',
            skipPreLoginCleanup: true,
            postStepDelayMs: 1200,
          });
          await ensureStep7VerificationPageReady();
          await addLog('步骤 7：登录验证码页面已重新就绪，开始回填刚才获取到的验证码。', 'info');
        } : undefined,
      });
    }

    async function rerunStep6ForStep7Recovery(options = {}) {
      const {
        logMessage = '步骤 7：正在回到步骤 6，重新发起登录验证码流程...',
        skipPreLoginCleanup = false,
        postStepDelayMs = 3000,
      } = options;
      const currentState = await getState();
      await addLog(logMessage, 'warn');
      await executeStep6(currentState, { skipPreLoginCleanup });
      if (postStepDelayMs > 0) {
        await sleepWithStop(postStepDelayMs);
      }
    }

    async function executeStep7(state) {
      if (shouldSkipLoginVerificationForCpaCallback(state)) {
        await setState({
          lastLoginCode: null,
          loginVerificationRequestedAt: null,
        });
        await setStepStatus(7, 'skipped');
        await addLog('步骤 7：当前已选择“第六步回调”，本轮无需获取登录验证码。', 'warn');
        return;
      }

      let currentState = state;
      let mailPollingAttempt = 1;
      let lastMailPollingError = null;

      while (true) {
        try {
          await runStep7Attempt(currentState);
          return;
        } catch (err) {
          if (!isVerificationMailPollingError(err)) {
            throw err;
          }

          lastMailPollingError = err;
          if (mailPollingAttempt >= STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS) {
            break;
          }

          mailPollingAttempt += 1;
          await addLog(
            `步骤 7：检测到邮箱轮询类失败，准备从步骤 6 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`,
            'warn'
          );
          await rerunStep6ForStep7Recovery();
          currentState = await getState();
        }
      }

      if (lastMailPollingError) {
        throw new Error(
          `步骤 7：登录验证码流程在 ${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS} 轮邮箱轮询恢复后仍未成功。最后一次原因：${lastMailPollingError.message}`
        );
      }

      throw new Error('步骤 7：登录验证码流程未成功完成。');
    }

    return { executeStep7 };
  }

  return { createStep7Executor };
});
