(function attachBackgroundVerificationFlow(root, factory) {
  root.MultiPageBackgroundVerificationFlow = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundVerificationFlowModule() {
  function createVerificationFlowHelpers(deps = {}) {
    const {
      addLog,
      chrome,
      CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      completeStepFromBackground,
      confirmCustomVerificationStepBypassRequest,
      forceRecoverSignupPageByReopen,
      getHotmailVerificationPollConfig,
      getHotmailVerificationRequestTimestamp,
      getState,
      getTabId,
      HOTMAIL_PROVIDER,
      isRetryableContentScriptTransportError,
      isStopError,
      LUCKMAIL_PROVIDER,
      MAIL_2925_VERIFICATION_INTERVAL_MS,
      MAIL_2925_VERIFICATION_MAX_ATTEMPTS,
      pollCloudflareTempEmailVerificationCode,
      pollHotmailVerificationCode,
      pollLuckmailVerificationCode,
      recoverSignupPageIfNeeded,
      sendToMailContentScriptResilient,
      sendToSignupPageWithRecovery,
      setState,
      sleepWithStop,
      throwIfStopped,
      VERIFICATION_POLL_MAX_ROUNDS,
    } = deps;

    function getVerificationCodeStateKey(step) {
      return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
    }

    function getVerificationCodeLabel(step) {
      return step === 4 ? '注册' : '登录';
    }

    function isSignupPageReopenRequired405Error(error) {
      const message = String(typeof error === 'string' ? error : error?.message || '');
      return message.includes('[SIGNUP_PAGE_REOPEN_REQUIRED_405]');
    }

    async function confirmCustomVerificationStepBypass(step) {
      const verificationLabel = getVerificationCodeLabel(step);
      await addLog(`步骤 ${step}：当前为自定义邮箱模式，请手动在页面中输入${verificationLabel}验证码并进入下一页面。`, 'warn');

      let response = null;
      try {
        response = await confirmCustomVerificationStepBypassRequest(step);
      } catch {
        throw new Error(`步骤 ${step}：无法打开确认弹窗，请先保持侧边栏打开后重试。`);
      }

      if (response?.error) {
        throw new Error(response.error);
      }
      if (!response?.confirmed) {
        throw new Error(`步骤 ${step}：已取消手动${verificationLabel}验证码确认。`);
      }

      await setState({
        lastEmailTimestamp: null,
        signupVerificationRequestedAt: null,
        loginVerificationRequestedAt: null,
      });
      await deps.setStepStatus(step, 'skipped');
      await addLog(`步骤 ${step}：已确认手动完成${verificationLabel}验证码输入，当前步骤已跳过。`, 'warn');
    }

    function getVerificationPollPayload(step, state, overrides = {}) {
      const is2925Provider = state?.mailProvider === '2925';
      if (step === 4) {
        return {
          filterAfterTimestamp: getHotmailVerificationRequestTimestamp(4, state),
          senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
          subjectFilters: ['verify', 'verification', 'code', '验证码', 'confirm'],
          targetEmail: state.email,
          maxAttempts: is2925Provider ? MAIL_2925_VERIFICATION_MAX_ATTEMPTS : 5,
          intervalMs: is2925Provider ? MAIL_2925_VERIFICATION_INTERVAL_MS : 3000,
          ...overrides,
        };
      }

      return {
        filterAfterTimestamp: getHotmailVerificationRequestTimestamp(7, state),
        senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
        subjectFilters: ['verify', 'verification', 'code', '验证码', 'confirm', 'login'],
        targetEmail: state.email,
        maxAttempts: is2925Provider ? MAIL_2925_VERIFICATION_MAX_ATTEMPTS : 5,
        intervalMs: is2925Provider ? MAIL_2925_VERIFICATION_INTERVAL_MS : 3000,
        ...overrides,
      };
    }

    async function requestVerificationCodeResend(step) {
      throwIfStopped();
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法重新请求验证码。');
      }

      throwIfStopped();
      await chrome.tabs.update(signupTabId, { active: true });
      throwIfStopped();

      let result = await sendToSignupPageWithRecovery({
        type: 'RESEND_VERIFICATION_CODE',
        step,
        source: 'background',
        payload: {},
      }, {
        step,
        timeoutMs: 45000,
        retryDelayMs: 700,
        logMessage: `姝ラ ${step}锛氳璇侀〉鍦ㄩ噸鍙戦獙璇佺爜鏃舵鍦ㄥ垏鎹紝绛夊緟椤甸潰鎭㈠鍚庣户缁?..`,
      });

      if (result && result.error) {
        throw new Error(result.error);
      }

      await addLog(`步骤 ${step}：已请求新的${getVerificationCodeLabel(step)}验证码。`, 'warn');

      const requestedAt = Date.now();
      if (step === 7) {
        await setState({ loginVerificationRequestedAt: requestedAt });
      }

      const currentState = await getState();
      if (currentState.mailProvider === '2925') {
        const mailTabId = await getTabId('mail-2925');
        if (mailTabId) {
          await chrome.tabs.update(mailTabId, { active: true });
          await addLog(`步骤 ${step}：已切换到 2925 邮箱标签页等待新邮件。`, 'info');
        }
      }

      return requestedAt;
    }

    async function pollFreshVerificationCodeWithResendInterval(step, state, mail, pollOverrides = {}) {
      const stateKey = getVerificationCodeStateKey(step);
      const rejectedCodes = new Set();
      if (state[stateKey]) {
        rejectedCodes.add(state[stateKey]);
      }
      for (const code of (pollOverrides.excludeCodes || [])) {
        if (code) rejectedCodes.add(code);
      }

      const {
        maxRounds: _ignoredMaxRounds,
        resendIntervalMs: _ignoredResendIntervalMs,
        lastResendAt: _ignoredLastResendAt,
        onResendRequestedAt: _ignoredOnResendRequestedAt,
        ...payloadOverrides
      } = pollOverrides;
      const onResendRequestedAt = typeof pollOverrides.onResendRequestedAt === 'function'
        ? pollOverrides.onResendRequestedAt
        : null;
      let lastError = null;
      let filterAfterTimestamp = payloadOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
      const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;
      const resendIntervalMs = Math.max(0, Number(pollOverrides.resendIntervalMs) || 0);
      let lastResendAt = Number(pollOverrides.lastResendAt) || 0;

      for (let round = 1; round <= maxRounds; round++) {
        throwIfStopped();
        if (round > 1) {
          lastResendAt = await requestVerificationCodeResend(step);
          if (onResendRequestedAt) {
            const nextFilterAfterTimestamp = await onResendRequestedAt(lastResendAt);
            if (nextFilterAfterTimestamp !== undefined) {
              filterAfterTimestamp = nextFilterAfterTimestamp;
            }
          }
        }

        while (true) {
          throwIfStopped();
          const payload = getVerificationPollPayload(step, state, {
            ...payloadOverrides,
            filterAfterTimestamp,
            excludeCodes: [...rejectedCodes],
          });

          if (lastResendAt > 0) {
            const remainingBeforeResendMs = Math.max(0, resendIntervalMs - (Date.now() - lastResendAt));
            const baseMaxAttempts = Math.max(1, Number(payload.maxAttempts) || 5);
            const intervalMs = Math.max(1, Number(payload.intervalMs) || 3000);
            payload.maxAttempts = Math.max(1, Math.min(baseMaxAttempts, Math.floor(remainingBeforeResendMs / intervalMs) + 1));
          }

          try {
            const result = await sendToMailContentScriptResilient(
              mail,
              {
                type: 'POLL_EMAIL',
                step,
                source: 'background',
                payload,
              },
              {
                timeoutMs: 45000,
                maxRecoveryAttempts: 2,
              }
            );

            if (result && result.error) {
              throw new Error(result.error);
            }

            if (!result || !result.code) {
              throw new Error(`步骤 ${step}：邮箱轮询结束，但未获取到验证码。`);
            }

            if (rejectedCodes.has(result.code)) {
              throw new Error(`步骤 ${step}：再次收到了相同的${getVerificationCodeLabel(step)}验证码：${result.code}`);
            }

            return {
              ...result,
              lastResendAt,
            };
          } catch (err) {
            if (isStopError(err)) {
              throw err;
            }
            lastError = err;
            await addLog(`步骤 ${step}：${err.message}`, 'warn');
          }

          const remainingBeforeResendMs = lastResendAt > 0
            ? Math.max(0, resendIntervalMs - (Date.now() - lastResendAt))
            : 0;
          if (remainingBeforeResendMs > 0) {
            await addLog(
              `步骤 ${step}：距离下次重新发送验证码还差 ${Math.ceil(remainingBeforeResendMs / 1000)} 秒，继续刷新邮箱（第 ${round}/${maxRounds} 轮）...`,
              'info'
            );
            continue;
          }

          if (round < maxRounds) {
            await addLog(`步骤 ${step}：已到 25 秒重发间隔，准备重新发送验证码（第 ${round + 1}/${maxRounds} 轮）...`, 'warn');
          }
          break;
        }
      }

      throw lastError || new Error(`步骤 ${step}：无法获取新的${getVerificationCodeLabel(step)}验证码。`);
    }

    async function pollFreshVerificationCode(step, state, mail, pollOverrides = {}) {
      const { onResendRequestedAt, ...cleanPollOverrides } = pollOverrides;

      if (mail.provider === HOTMAIL_PROVIDER) {
        const hotmailPollConfig = getHotmailVerificationPollConfig(step);
        return pollHotmailVerificationCode(step, state, {
          ...getVerificationPollPayload(step, state),
          ...hotmailPollConfig,
          ...cleanPollOverrides,
        });
      }
      if (mail.provider === LUCKMAIL_PROVIDER) {
        return pollLuckmailVerificationCode(step, state, {
          ...getVerificationPollPayload(step, state),
          ...pollOverrides,
        });
      }
      if (mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
        return pollCloudflareTempEmailVerificationCode(step, state, {
          ...getVerificationPollPayload(step, state),
          ...pollOverrides,
        });
      }

      if (Number(pollOverrides.resendIntervalMs) > 0) {
        return pollFreshVerificationCodeWithResendInterval(step, state, mail, pollOverrides);
      }

      const stateKey = getVerificationCodeStateKey(step);
      const rejectedCodes = new Set();
      if (state[stateKey]) {
        rejectedCodes.add(state[stateKey]);
      }
      for (const code of (pollOverrides.excludeCodes || [])) {
        if (code) rejectedCodes.add(code);
      }

      let lastError = null;
      let filterAfterTimestamp = cleanPollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
      const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

      for (let round = 1; round <= maxRounds; round++) {
        throwIfStopped();
        if (round > 1) {
          const requestedAt = await requestVerificationCodeResend(step);
          if (typeof onResendRequestedAt === 'function') {
            const nextFilterAfterTimestamp = await onResendRequestedAt(requestedAt);
            if (nextFilterAfterTimestamp !== undefined) {
              filterAfterTimestamp = nextFilterAfterTimestamp;
            }
          }
        }

        const payload = getVerificationPollPayload(step, state, {
          ...cleanPollOverrides,
          filterAfterTimestamp,
          excludeCodes: [...rejectedCodes],
        });

        try {
          const result = await sendToMailContentScriptResilient(
            mail,
            {
              type: 'POLL_EMAIL',
              step,
              source: 'background',
              payload,
            },
            {
              timeoutMs: 45000,
              maxRecoveryAttempts: 2,
            }
          );

          if (result && result.error) {
            throw new Error(result.error);
          }

          if (!result || !result.code) {
            throw new Error(`步骤 ${step}：邮箱轮询结束，但未获取到验证码。`);
          }

          if (rejectedCodes.has(result.code)) {
            throw new Error(`步骤 ${step}：再次收到了相同的${getVerificationCodeLabel(step)}验证码：${result.code}`);
          }

          return result;
        } catch (err) {
          if (isStopError(err)) {
            throw err;
          }
          lastError = err;
          await addLog(`步骤 ${step}：${err.message}`, 'warn');
          if (round < maxRounds) {
            await addLog(`步骤 ${step}：将重新发送验证码后重试（${round + 1}/${maxRounds}）...`, 'warn');
          }
        }
      }

      throw lastError || new Error(`步骤 ${step}：无法获取新的${getVerificationCodeLabel(step)}验证码。`);
    }

    async function submitVerificationCode(step, code) {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法填写验证码。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      if (step === 4 || step === 7) {
        await recoverSignupPageIfNeeded(step);
      }
      const result = await sendToSignupPageWithRecovery({
        type: 'FILL_CODE',
        step,
        source: 'background',
        payload: { code },
      }, {
        step,
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：认证页正在切换，等待页面恢复后继续提交验证码...`,
      });

      if (result && result.error) {
        throw new Error(result.error);
      }

      return result || {};
    }

    async function resolveVerificationStep(step, state, mail, options = {}) {
      const stateKey = getVerificationCodeStateKey(step);
      const rejectedCodes = new Set();
      const hotmailPollConfig = mail.provider === HOTMAIL_PROVIDER
        ? getHotmailVerificationPollConfig(step)
        : null;
      const beforeSubmit = typeof options.beforeSubmit === 'function'
        ? options.beforeSubmit
        : null;
      const ignorePersistedLastCode = Boolean(hotmailPollConfig?.ignorePersistedLastCode);
      if (state[stateKey] && !ignorePersistedLastCode) {
        rejectedCodes.add(state[stateKey]);
      }

      let nextFilterAfterTimestamp = options.filterAfterTimestamp ?? null;
      const requestFreshCodeFirst = options.requestFreshCodeFirst !== undefined
        ? Boolean(options.requestFreshCodeFirst)
        : (hotmailPollConfig?.requestFreshCodeFirst ?? false);
      const maxSubmitAttempts = 3;
      const resendIntervalMs = Math.max(0, Number(options.resendIntervalMs) || 0);
      let lastResendAt = Number(options.lastResendAt) || 0;

      const updateFilterAfterTimestampForStep7 = async (requestedAt) => {
        if (step !== 7 || !requestedAt) {
          return nextFilterAfterTimestamp;
        }

        if (mail.provider === HOTMAIL_PROVIDER) {
          nextFilterAfterTimestamp = getHotmailVerificationRequestTimestamp(7, {
            ...state,
            loginVerificationRequestedAt: requestedAt,
          });
        } else {
          nextFilterAfterTimestamp = Math.max(0, Number(requestedAt) - 60000);
        }

        return nextFilterAfterTimestamp;
      };

      if (requestFreshCodeFirst) {
        try {
          lastResendAt = await requestVerificationCodeResend(step);
          await updateFilterAfterTimestampForStep7(lastResendAt);
          await addLog(`步骤 ${step}：已先请求一封新的${getVerificationCodeLabel(step)}验证码，再开始轮询邮箱。`, 'warn');
        } catch (err) {
          if (isStopError(err)) {
            throw err;
          }
          await addLog(`步骤 ${step}：首次重新获取验证码失败：${err.message}，将继续使用当前时间窗口轮询。`, 'warn');
        }
      }

      if (mail.provider === HOTMAIL_PROVIDER) {
        const initialDelayMs = Number(options.initialDelayMs ?? hotmailPollConfig.initialDelayMs) || 0;
        if (initialDelayMs > 0) {
          await addLog(`步骤 ${step}：等待 ${Math.round(initialDelayMs / 1000)} 秒，让 Hotmail 验证码邮件先到达...`, 'info');
          await sleepWithStop(initialDelayMs);
        }
      }

      for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
        const result = await pollFreshVerificationCode(step, state, mail, {
          excludeCodes: [...rejectedCodes],
          filterAfterTimestamp: nextFilterAfterTimestamp ?? undefined,
          resendIntervalMs,
          lastResendAt,
          onResendRequestedAt: updateFilterAfterTimestampForStep7,
        });
        lastResendAt = Number(result?.lastResendAt) || lastResendAt;

        throwIfStopped();
        await addLog(`步骤 ${step}：已获取${getVerificationCodeLabel(step)}验证码：${result.code}`);
        if (beforeSubmit) {
          await beforeSubmit(result, {
            attempt,
            rejectedCodes: new Set(rejectedCodes),
            filterAfterTimestamp: nextFilterAfterTimestamp ?? undefined,
            lastResendAt,
          });
        }
        throwIfStopped();
        const submitResult = await submitVerificationCode(step, result.code);

        if (submitResult.invalidCode) {
          rejectedCodes.add(result.code);
          await addLog(`步骤 ${step}：验证码被页面拒绝：${submitResult.errorText || result.code}`, 'warn');

          if (attempt >= maxSubmitAttempts) {
            throw new Error(`步骤 ${step}：验证码连续失败，已达到 ${maxSubmitAttempts} 次重试上限。`);
          }

          const remainingBeforeResendMs = resendIntervalMs > 0 && lastResendAt > 0
            ? Math.max(0, resendIntervalMs - (Date.now() - lastResendAt))
            : 0;
          if (remainingBeforeResendMs > 0) {
            await addLog(
              `步骤 ${step}：提交失败后距离下次重新发送验证码还差 ${Math.ceil(remainingBeforeResendMs / 1000)} 秒，先继续刷新邮箱（${attempt + 1}/${maxSubmitAttempts}）...`,
              'warn'
            );
            continue;
          }

          lastResendAt = await requestVerificationCodeResend(step);
          await updateFilterAfterTimestampForStep7(lastResendAt);
          await addLog(`步骤 ${step}：提交失败后已请求新验证码（${attempt + 1}/${maxSubmitAttempts}）...`, 'warn');
          continue;
        }

        await setState({
          lastEmailTimestamp: result.emailTimestamp,
          [stateKey]: result.code,
        });

        await completeStepFromBackground(step, {
          emailTimestamp: result.emailTimestamp,
          code: result.code,
        });
        return;
      }
    }

    return {
      confirmCustomVerificationStepBypass,
      getVerificationCodeLabel,
      getVerificationCodeStateKey,
      getVerificationPollPayload,
      pollFreshVerificationCode,
      pollFreshVerificationCodeWithResendInterval,
      requestVerificationCodeResend,
      resolveVerificationStep,
      submitVerificationCode,
    };
  }

  return {
    createVerificationFlowHelpers,
  };
});
