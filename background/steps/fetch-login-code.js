(function attachBackgroundStep8(root, factory) {
  root.MultiPageBackgroundStep8 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep8Module() {
  const MAIL_2925_FILTER_LOOKBACK_MS = 10 * 60 * 1000;

  function createStep8Executor(deps = {}) {
    const {
      addLog,
      chrome,
      CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      confirmCustomVerificationStepBypass,
      ensureStep8VerificationPageReady,
      getOAuthFlowRemainingMs,
      getOAuthFlowStepTimeoutMs,
      getMailConfig,
      getState,
      getTabId,
      HOTMAIL_PROVIDER,
      isTabAlive,
      isVerificationMailPollingError,
      LUCKMAIL_PROVIDER,
      resolveVerificationStep,
      rerunStep7ForStep8Recovery,
      reuseOrCreateTab,
      setState,
      shouldUseCustomRegistrationEmail,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    async function getStep8ReadyTimeoutMs(actionLabel, expectedOauthUrl = '') {
      if (typeof getOAuthFlowStepTimeoutMs !== 'function') {
        return 15000;
      }

      return getOAuthFlowStepTimeoutMs(15000, {
        step: 8,
        actionLabel,
        oauthUrl: expectedOauthUrl,
      });
    }

    function getStep8RemainingTimeResolver(expectedOauthUrl = '') {
      if (typeof getOAuthFlowRemainingMs !== 'function') {
        return undefined;
      }

      return async (details = {}) => getOAuthFlowRemainingMs({
        step: 8,
        actionLabel: details.actionLabel || '登录验证码流程',
        oauthUrl: expectedOauthUrl,
      });
    }

    function normalizeStep8VerificationTargetEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    async function focusOrOpenMailTab(mail) {
      const alive = await isTabAlive(mail.source);
      if (alive) {
        if (mail.navigateOnReuse) {
          await reuseOrCreateTab(mail.source, mail.url, {
            inject: mail.inject,
            injectSource: mail.injectSource,
          });
          return;
        }

        const tabId = await getTabId(mail.source);
        await chrome.tabs.update(tabId, { active: true });
        return;
      }

      await reuseOrCreateTab(mail.source, mail.url, {
        inject: mail.inject,
        injectSource: mail.injectSource,
      });
    }

    async function runStep8Attempt(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);

      const stepStartedAt = Date.now();
      const verificationFilterAfterTimestamp = mail.provider === '2925'
        ? Math.max(0, stepStartedAt - MAIL_2925_FILTER_LOOKBACK_MS)
        : stepStartedAt;
      const verificationSessionKey = `8:${stepStartedAt}`;
      const authTabId = await getTabId('signup-page');

      if (authTabId) {
        await chrome.tabs.update(authTabId, { active: true });
      } else {
        if (!state.oauthUrl) {
          throw new Error('缺少登录用 OAuth 链接，请先完成步骤 7。');
        }
        await reuseOrCreateTab('signup-page', state.oauthUrl);
      }

      throwIfStopped();
      const pageState = await ensureStep8VerificationPageReady({
        timeoutMs: await getStep8ReadyTimeoutMs('确认登录验证码页已就绪', state?.oauthUrl || ''),
      });
      const shouldCompareVerificationEmail = mail.provider !== '2925';
      const displayedVerificationEmail = shouldCompareVerificationEmail
        ? normalizeStep8VerificationTargetEmail(pageState?.displayedEmail)
        : '';
      const fixedTargetEmail = shouldCompareVerificationEmail
        ? (displayedVerificationEmail || normalizeStep8VerificationTargetEmail(state?.email))
        : '';

      await setState({
        step8VerificationTargetEmail: displayedVerificationEmail || '',
      });

      await addLog('步骤 8：登录验证码页面已就绪，开始获取验证码。', 'info');
      if (shouldCompareVerificationEmail && displayedVerificationEmail) {
        await addLog(`步骤 8：已固定当前验证码页显示邮箱 ${displayedVerificationEmail} 作为后续匹配目标。`, 'info');
      }

      if (shouldUseCustomRegistrationEmail(state)) {
        await confirmCustomVerificationStepBypass(8);
        return;
      }

      throwIfStopped();
      if (
        mail.provider === HOTMAIL_PROVIDER
        || mail.provider === LUCKMAIL_PROVIDER
        || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER
      ) {
        await addLog(`步骤 8：正在通过 ${mail.label} 轮询验证码...`);
      } else {
        await addLog(`步骤 8：正在打开${mail.label}...`);
        await focusOrOpenMailTab(mail);
        if (mail.provider === '2925') {
          await addLog(`步骤 8：将直接使用当前已登录的 ${mail.label} 轮询验证码。`, 'info');
        }
      }

      await resolveVerificationStep(8, {
        ...state,
        step8VerificationTargetEmail: displayedVerificationEmail || '',
      }, mail, {
        filterAfterTimestamp: verificationFilterAfterTimestamp,
        sessionKey: verificationSessionKey,
        disableTimeBudgetCap: mail.provider === '2925',
        getRemainingTimeMs: getStep8RemainingTimeResolver(state?.oauthUrl || ''),
        requestFreshCodeFirst: false,
        targetEmail: fixedTargetEmail,
        resendIntervalMs: (mail.provider === HOTMAIL_PROVIDER || mail.provider === '2925')
          ? 0
          : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      });
    }

    function isStep8RestartStep7Error(error) {
      const message = String(error?.message || error || '');
      return /STEP8_RESTART_STEP7::/i.test(message);
    }

    async function executeStep8(state) {
      let currentState = state;
      let mailPollingAttempt = 1;
      let lastMailPollingError = null;

      while (true) {
        try {
          await runStep8Attempt(currentState);
          return;
        } catch (err) {
          if (!isVerificationMailPollingError(err) && !isStep8RestartStep7Error(err)) {
            throw err;
          }

          lastMailPollingError = err;
          if (mailPollingAttempt >= STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS) {
            break;
          }

          mailPollingAttempt += 1;
          await addLog(
            isStep8RestartStep7Error(err)
              ? `步骤 8：检测到认证页进入重试/超时报错状态，准备从步骤 7 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`
              : `步骤 8：检测到邮箱轮询类失败，准备从步骤 7 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`,
            'warn'
          );
          await rerunStep7ForStep8Recovery({
            logMessage: isStep8RestartStep7Error(err)
              ? '步骤 8：认证页进入重试/超时报错状态，正在回到步骤 7 重新发起登录流程...'
              : '步骤 8：正在回到步骤 7，重新发起登录验证码流程...',
          });
          currentState = await getState();
        }
      }

      if (lastMailPollingError) {
        throw new Error(
          `步骤 8：登录验证码流程在 ${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS} 轮邮箱轮询恢复后仍未成功。最后一次原因：${lastMailPollingError.message}`
        );
      }

      throw new Error('步骤 8：登录验证码流程未成功完成。');
    }

    return { executeStep8 };
  }

  return { createStep8Executor };
});
