(function attachBackgroundStep4(root, factory) {
  root.MultiPageBackgroundStep4 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep4Module() {
  function createStep4Executor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      confirmCustomVerificationStepBypass,
      getMailConfig,
      getTabId,
      HOTMAIL_PROVIDER,
      ICLOUD_PROVIDER,
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

    async function executeStep4(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);
      const stepStartedAt = Date.now();
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法继续步骤 4。');
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

      throwIfStopped();
      if (mail.provider === HOTMAIL_PROVIDER || mail.provider === LUCKMAIL_PROVIDER || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
        await addLog(`步骤 4：正在通过 ${mail.label} 轮询验证码...`);
      } else {
        await addLog(`步骤 4：正在打开${mail.label}...`);

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

      await resolveVerificationStep(4, state, mail, {
        filterAfterTimestamp: stepStartedAt,
        requestFreshCodeFirst: !(mail.provider === HOTMAIL_PROVIDER || mail.provider === ICLOUD_PROVIDER),
        resendIntervalMs: (mail.provider === HOTMAIL_PROVIDER || mail.provider === '2925')
          ? 0
          : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      });
    }

    return { executeStep4 };
  }

  return { createStep4Executor };
});
