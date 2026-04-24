(function attachBackgroundStep4(root, factory) {
  root.MultiPageBackgroundStep4 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep4Module() {
  const MAIL_2925_FILTER_LOOKBACK_MS = 10 * 60 * 1000;

  function createStep4Executor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      confirmCustomVerificationStepBypass,
      ensureMail2925MailboxSession,
      ensureIcloudMailSession,
      getMailConfig,
      getTabId,
      HOTMAIL_PROVIDER,
      isTabAlive,
      LUCKMAIL_PROVIDER,
      CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      resolveVerificationStep,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      shouldUseCustomRegistrationEmail,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      throwIfStopped,
    } = deps;

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

    async function executeStep4(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);

      const stepStartedAt = Date.now();
      const verificationFilterAfterTimestamp = mail.provider === '2925'
        ? Math.max(0, stepStartedAt - MAIL_2925_FILTER_LOOKBACK_MS)
        : stepStartedAt;
      const verificationSessionKey = `4:${stepStartedAt}`;
      const signupTabId = await getTabId('signup-page');

      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法继续步骤 4。请先执行步骤 1 或步骤 2，重新打开认证页后再试。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      throwIfStopped();
      await addLog('步骤 4：正在确认注册验证码页面是否就绪，必要时自动恢复密码页超时报错...');

      const prepareResult = await sendToContentScriptResilient(
        'signup-page',
        {
          type: 'PREPARE_SIGNUP_VERIFICATION',
          step: 4,
          source: 'background',
          payload: {
            password: state.password || state.customPassword || '',
            prepareSource: 'step4_execute',
            prepareLogLabel: '步骤 4 执行',
          },
        },
        {
          timeoutMs: 30000,
          retryDelayMs: 700,
          logMessage: '步骤 4：认证页正在切换，等待页面重新就绪后继续检测...',
        }
      );

      if (prepareResult && prepareResult.error) {
        throw new Error(prepareResult.error);
      }
      if (prepareResult?.alreadyVerified) {
        await completeStepFromBackground(4, {});
        return;
      }

      if (shouldUseCustomRegistrationEmail(state)) {
        await confirmCustomVerificationStepBypass(4);
        return;
      }

      if (mail.source === 'icloud-mail' && typeof ensureIcloudMailSession === 'function') {
        await addLog('步骤 4：正在确认 iCloud 邮箱登录态...', 'info');
        await ensureIcloudMailSession({
          state,
          step: 4,
          actionLabel: '步骤 4：确认 iCloud 邮箱登录态',
        });
      }

      throwIfStopped();
      if (
        mail.provider === HOTMAIL_PROVIDER
        || mail.provider === LUCKMAIL_PROVIDER
        || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER
      ) {
        await addLog(`步骤 4：正在通过 ${mail.label} 轮询验证码...`);
      } else if (mail.provider === '2925') {
        await addLog(`步骤 4：正在打开${mail.label}...`);
        if (typeof ensureMail2925MailboxSession === 'function') {
          await ensureMail2925MailboxSession({
            accountId: state.currentMail2925AccountId || null,
            forceRelogin: false,
            allowLoginWhenOnLoginPage: Boolean(state?.mail2925UseAccountPool),
            expectedMailboxEmail: getExpectedMail2925MailboxEmail(state),
            actionLabel: '步骤 4：确认 2925 邮箱登录态',
          });
        } else {
          await focusOrOpenMailTab(mail);
        }
        await addLog(`步骤 4：将直接使用当前已登录的 ${mail.label} 轮询验证码。`, 'info');
      } else {
        await addLog(`步骤 4：正在打开${mail.label}...`);
        await focusOrOpenMailTab(mail);
      }

      const shouldRequestFreshCodeFirst = ![
        HOTMAIL_PROVIDER,
        CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      ].includes(mail.provider);

      await resolveVerificationStep(4, state, mail, {
        filterAfterTimestamp: verificationFilterAfterTimestamp,
        sessionKey: verificationSessionKey,
        disableTimeBudgetCap: mail.provider === '2925',
        requestFreshCodeFirst: shouldRequestFreshCodeFirst,
        resendIntervalMs: (mail.provider === HOTMAIL_PROVIDER || mail.provider === '2925')
          ? 0
          : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      });
    }

    return { executeStep4 };
  }

  return { createStep4Executor };
});
