(function attachBackgroundStep8(root, factory) {
  root.MultiPageBackgroundStep8 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep8Module() {
  const MAIL_2925_FILTER_LOOKBACK_MS = 10 * 60 * 1000;

  function createStep8Executor(deps = {}) {
    const {
      addLog,
      chrome,
      CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      completeStepFromBackground,
      confirmCustomVerificationStepBypass,
      ensureMail2925MailboxSession,
      ensureIcloudMailSession,
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
      sleepWithStop,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    function getVisibleStep(state, fallback = 8) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : fallback;
    }

    function getAuthLoginStepForVisibleStep(visibleStep) {
      return visibleStep >= 11 ? 10 : 7;
    }

    async function getStep8ReadyTimeoutMs(actionLabel, expectedOauthUrl = '', visibleStep = 8) {
      if (typeof getOAuthFlowStepTimeoutMs !== 'function') {
        return 15000;
      }

      return getOAuthFlowStepTimeoutMs(15000, {
        step: visibleStep,
        actionLabel,
        oauthUrl: expectedOauthUrl,
      });
    }

    function getStep8RemainingTimeResolver(expectedOauthUrl = '', visibleStep = 8) {
      if (typeof getOAuthFlowRemainingMs !== 'function') {
        return undefined;
      }

      return async (details = {}) => getOAuthFlowRemainingMs({
        step: visibleStep,
        actionLabel: details.actionLabel || '登录验证码流程',
        oauthUrl: expectedOauthUrl,
      });
    }

    function normalizeStep8VerificationTargetEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    async function completeStep8WhenAuthAlreadyOnOauthConsent(visibleStep, options = {}) {
      await setState({
        step8VerificationTargetEmail: '',
        loginVerificationRequestedAt: null,
      });
      const fromRecovery = Boolean(options.fromRecovery);
      await addLog(
        `步骤 ${visibleStep}：当前认证页已进入 OAuth 授权页${fromRecovery ? '（轮询失败后复核）' : ''}，跳过登录验证码拉取并继续后续流程。`,
        'warn'
      );
      if (typeof completeStepFromBackground === 'function') {
        await completeStepFromBackground(visibleStep, {
          loginVerificationRequestedAt: null,
          skipLoginVerificationStep: true,
          directOAuthConsentPage: true,
        });
      }
    }

    function isStep8AddPhoneStateError(error) {
      const message = String(error?.message || error || '');
      return /add-phone|手机号页面|手机号验证页|phone[\s-_]verification|phone\s+number/i.test(message);
    }

    async function recoverStep8PollingFailure(currentState, visibleStep) {
      const authLoginStep = getAuthLoginStepForVisibleStep(visibleStep);
      try {
        const pageState = await ensureStep8VerificationPageReady({
          visibleStep,
          authLoginStep,
          timeoutMs: await getStep8ReadyTimeoutMs(
            '登录验证码轮询异常后复核认证页状态',
            currentState?.oauthUrl || '',
            visibleStep
          ),
        });
        if (pageState?.state === 'oauth_consent_page') {
          await completeStep8WhenAuthAlreadyOnOauthConsent(visibleStep, { fromRecovery: true });
          return { outcome: 'completed' };
        }
        if (pageState?.state === 'verification_page') {
          await addLog(
            `步骤 ${visibleStep}：检测到邮箱轮询/页面通信异常，但认证页仍在验证码页，先在当前链路重试，不回到步骤 ${authLoginStep}。`,
            'warn'
          );
          return { outcome: 'retry_without_step7' };
        }
      } catch (inspectError) {
        if (isStep8RestartStep7Error(inspectError)) {
          return { outcome: 'restart_step7', error: inspectError };
        }
        if (isStep8AddPhoneStateError(inspectError)) {
          throw inspectError;
        }
        await addLog(
          `步骤 ${visibleStep}：轮询失败后复核认证页状态异常：${inspectError?.message || inspectError}，将回到步骤 ${authLoginStep} 重试。`,
          'warn'
        );
      }
      return { outcome: 'restart_step7' };
    }

    function getExpectedMail2925MailboxEmail(state = {}) {
      if (Boolean(state?.mail2925UseAccountPool)) {
        const currentAccountId = String(state?.currentMail2925AccountId || '').trim();
        const accounts = Array.isArray(state?.mail2925Accounts) ? state.mail2925Accounts : [];
        const currentAccount = accounts.find((account) => String(account?.id || '') === currentAccountId) || null;
        const accountEmail = String(currentAccount?.email || '').trim().toLowerCase();
        if (accountEmail) {
          return accountEmail;
        }
      }

      return String(state?.mail2925BaseEmail || '').trim().toLowerCase();
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

    function getStep8ResendIntervalMs(state = {}) {
      const mail = getMailConfig(state);
      if (mail?.provider === LUCKMAIL_PROVIDER) {
        return 15000;
      }
      if (mail?.provider === HOTMAIL_PROVIDER || mail?.provider === '2925') {
        return 0;
      }
      return Math.max(0, Number(STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS) || 0);
    }

    async function runStep8Attempt(state, runtime = {}) {
      const visibleStep = getVisibleStep(state, 8);
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);
      const stateLastResendAt = Number(state?.loginVerificationRequestedAt) || 0;
      let latestResendAt = Math.max(0, Number(runtime?.stickyLastResendAt) || 0, stateLastResendAt);
      const notifyResendRequestedAt = typeof runtime?.onResendRequestedAt === 'function'
        ? runtime.onResendRequestedAt
        : null;

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
          throw new Error(`缺少登录用 OAuth 链接，请先完成步骤 ${getAuthLoginStepForVisibleStep(visibleStep)}。`);
        }
        await reuseOrCreateTab('signup-page', state.oauthUrl);
      }

      throwIfStopped();
      const pageState = await ensureStep8VerificationPageReady({
        visibleStep,
        authLoginStep: getAuthLoginStepForVisibleStep(visibleStep),
        timeoutMs: await getStep8ReadyTimeoutMs('确认登录验证码页已就绪', state?.oauthUrl || '', visibleStep),
      });
      if (pageState?.state === 'oauth_consent_page') {
        await completeStep8WhenAuthAlreadyOnOauthConsent(visibleStep);
        return;
      }
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

      await addLog(`步骤 ${visibleStep}：登录验证码页面已就绪，开始获取验证码。`, 'info');
      if (shouldCompareVerificationEmail && displayedVerificationEmail) {
        await addLog(`步骤 ${visibleStep}：已固定当前验证码页显示邮箱 ${displayedVerificationEmail} 作为后续匹配目标。`, 'info');
      }

      if (shouldUseCustomRegistrationEmail(state)) {
        await confirmCustomVerificationStepBypass(8, {
          completionStep: visibleStep,
          promptStep: visibleStep,
        });
        return;
      }

      if (mail.source === 'icloud-mail' && typeof ensureIcloudMailSession === 'function') {
        await addLog(`步骤 ${visibleStep}：正在确认 iCloud 邮箱登录态...`, 'info');
        await ensureIcloudMailSession({
          state,
          step: 8,
          actionLabel: `步骤 ${visibleStep}：确认 iCloud 邮箱登录态`,
        });
      }

      throwIfStopped();
      if (
        mail.provider === HOTMAIL_PROVIDER
        || mail.provider === LUCKMAIL_PROVIDER
        || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER
      ) {
        await addLog(`步骤 ${visibleStep}：正在通过 ${mail.label} 轮询验证码...`);
      } else {
        await addLog(`步骤 ${visibleStep}：正在打开${mail.label}...`);
        if (mail.provider === '2925' && typeof ensureMail2925MailboxSession === 'function') {
          await ensureMail2925MailboxSession({
            accountId: state.currentMail2925AccountId || null,
            forceRelogin: false,
            allowLoginWhenOnLoginPage: Boolean(state?.mail2925UseAccountPool),
            expectedMailboxEmail: getExpectedMail2925MailboxEmail(state),
            actionLabel: `Step ${visibleStep}: ensure 2925 mailbox session`,
          });
        } else {
          await focusOrOpenMailTab(mail);
        }
        if (mail.provider === '2925') {
          await addLog(`步骤 ${visibleStep}：将直接使用当前已登录的 ${mail.label} 轮询验证码。`, 'info');
        }
      }

      await resolveVerificationStep(8, {
        ...state,
        step8VerificationTargetEmail: displayedVerificationEmail || '',
      }, mail, {
        completionStep: visibleStep,
        filterAfterTimestamp: verificationFilterAfterTimestamp,
        sessionKey: verificationSessionKey,
        disableTimeBudgetCap: mail.provider === '2925',
        getRemainingTimeMs: getStep8RemainingTimeResolver(state?.oauthUrl || '', visibleStep),
        requestFreshCodeFirst: false,
        lastResendAt: latestResendAt,
        onResendRequestedAt: async (requestedAt) => {
          const numericRequestedAt = Number(requestedAt) || 0;
          if (numericRequestedAt > 0) {
            latestResendAt = Math.max(latestResendAt, numericRequestedAt);
          }
          if (notifyResendRequestedAt) {
            await notifyResendRequestedAt(latestResendAt);
          }
        },
        targetEmail: fixedTargetEmail,
        resendIntervalMs: mail.provider === LUCKMAIL_PROVIDER
          ? 15000
          : ((mail.provider === HOTMAIL_PROVIDER || mail.provider === '2925')
            ? 0
            : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS),
      });
      return {
        lastResendAt: latestResendAt,
      };
    }

    function isStep8RestartStep7Error(error) {
      const message = String(error?.message || error || '');
      return /STEP8_RESTART_STEP7::/i.test(message);
    }

    async function executeStep8(state) {
      let currentState = state;
      let mailPollingAttempt = 1;
      let lastMailPollingError = null;
      let stickyLastResendAt = Number(state?.loginVerificationRequestedAt) || 0;
      let retryWithoutStep7Streak = 0;
      const maxRetryWithoutStep7Streak = 3;

      while (true) {
        try {
          const result = await runStep8Attempt(currentState, {
            stickyLastResendAt,
            onResendRequestedAt: async (requestedAt) => {
              const numericRequestedAt = Number(requestedAt) || 0;
              if (numericRequestedAt > 0) {
                stickyLastResendAt = Math.max(stickyLastResendAt, numericRequestedAt);
              }
            },
          });
          if (Number(result?.lastResendAt) > 0) {
            stickyLastResendAt = Math.max(stickyLastResendAt, Number(result.lastResendAt) || 0);
          }
          retryWithoutStep7Streak = 0;
          return;
        } catch (err) {
          const visibleStep = getVisibleStep(currentState, 8);
          const authLoginStep = getAuthLoginStepForVisibleStep(visibleStep);
          let currentError = err;
          let retryWithoutStep7 = false;
          const isMailPollingError = isVerificationMailPollingError(err);
          if (isMailPollingError && !isStep8RestartStep7Error(err)) {
            const recovery = await recoverStep8PollingFailure(currentState, visibleStep);
            if (recovery?.outcome === 'completed') {
              return;
            }
            if (recovery?.outcome === 'retry_without_step7') {
              retryWithoutStep7 = true;
            }
            if (recovery?.error) {
              currentError = recovery.error;
            }
          }
          if (!isVerificationMailPollingError(currentError) && !isStep8RestartStep7Error(currentError)) {
            throw currentError;
          }

          lastMailPollingError = currentError;
          if (mailPollingAttempt >= STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS) {
            break;
          }

          mailPollingAttempt += 1;
          if (retryWithoutStep7) {
            retryWithoutStep7Streak += 1;
            if (retryWithoutStep7Streak > maxRetryWithoutStep7Streak) {
              await addLog(
                `步骤 ${visibleStep}：邮箱通信异常在当前链路已连续重试 ${retryWithoutStep7Streak} 次，改为回到步骤 ${authLoginStep} 重新发起授权链路，避免空轮询循环。`,
                'warn'
              );
              await rerunStep7ForStep8Recovery({
                logMessage: `步骤 ${visibleStep}：邮箱通信异常持续未恢复，正在回到步骤 ${authLoginStep} 重新发起登录流程...`,
              });
              currentState = await getState();
              retryWithoutStep7Streak = 0;
              continue;
            }
            await addLog(
              `步骤 ${visibleStep}：认证页仍保持在验证码页，将在当前链路直接重试（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}），不回到步骤 ${authLoginStep}（连续同链路重试 ${retryWithoutStep7Streak}/${maxRetryWithoutStep7Streak}）。`,
              'warn'
            );
            const latestState = await getState();
            const latestStateResendAt = Number(latestState?.loginVerificationRequestedAt) || 0;
            if (latestStateResendAt > 0) {
              stickyLastResendAt = Math.max(stickyLastResendAt, latestStateResendAt);
            }
            currentState = latestState;
            if (stickyLastResendAt > 0 && (!latestStateResendAt || latestStateResendAt < stickyLastResendAt)) {
              currentState = {
                ...latestState,
                loginVerificationRequestedAt: stickyLastResendAt,
              };
            }
            const resendIntervalMs = getStep8ResendIntervalMs(currentState);
            const remainingBeforeRetryMs = stickyLastResendAt > 0 && resendIntervalMs > 0
              ? Math.max(0, resendIntervalMs - (Date.now() - stickyLastResendAt))
              : 0;
            if (remainingBeforeRetryMs > 0 && typeof sleepWithStop === 'function') {
              await addLog(
                `步骤 ${visibleStep}：上轮已触发重发验证码，为避免重复重发，先等待 ${Math.ceil(remainingBeforeRetryMs / 1000)} 秒后继续当前链路重试。`,
                'info'
              );
              await sleepWithStop(Math.min(remainingBeforeRetryMs, 3000));
            }
            continue;
          }
          retryWithoutStep7Streak = 0;
          await addLog(
            isStep8RestartStep7Error(currentError)
              ? `步骤 ${visibleStep}：检测到认证页进入重试/超时报错状态，准备从步骤 ${authLoginStep} 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`
              : `步骤 ${visibleStep}：检测到邮箱轮询类失败，准备从步骤 ${authLoginStep} 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`,
            'warn'
          );
          await rerunStep7ForStep8Recovery({
            logMessage: isStep8RestartStep7Error(currentError)
              ? `步骤 ${visibleStep}：认证页进入重试/超时报错状态，正在回到步骤 ${authLoginStep} 重新发起登录流程...`
              : `步骤 ${visibleStep}：正在回到步骤 ${authLoginStep}，重新发起登录验证码流程...`,
          });
          currentState = await getState();
        }
      }

      const visibleStep = getVisibleStep(currentState, 8);
      if (lastMailPollingError) {
        throw new Error(
          `步骤 ${visibleStep}：登录验证码流程在 ${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS} 轮邮箱轮询恢复后仍未成功。最后一次原因：${lastMailPollingError.message}`
        );
      }

      throw new Error(`步骤 ${visibleStep}：登录验证码流程未成功完成。`);
    }

    return { executeStep8 };
  }

  return { createStep8Executor };
});
