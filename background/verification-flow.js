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
      getHotmailVerificationPollConfig,
      getHotmailVerificationRequestTimestamp,
      handleMail2925LimitReachedError,
      getState,
      getTabId,
      HOTMAIL_PROVIDER,
      isMail2925LimitReachedError,
      isStopError,
      LUCKMAIL_PROVIDER,
      MAIL_2925_VERIFICATION_INTERVAL_MS,
      MAIL_2925_VERIFICATION_MAX_ATTEMPTS,
      pollCloudflareTempEmailVerificationCode,
      pollHotmailVerificationCode,
      pollLuckmailVerificationCode,
      sendToContentScript,
      sendToContentScriptResilient,
      sendToMailContentScriptResilient,
      setState,
      sleepWithStop,
      throwIfStopped,
      VERIFICATION_POLL_MAX_ROUNDS,
    } = deps;

    const isRetryableVerificationTransportError = typeof deps.isRetryableContentScriptTransportError === 'function'
      ? deps.isRetryableContentScriptTransportError
      : ((error) => /back\/forward cache|message channel is closed|Receiving end does not exist|port closed before a response was received|A listener indicated an asynchronous response|did not respond in \d+s/i.test(
        String(typeof error === 'string' ? error : error?.message || '')
      ));

    function getVerificationCodeStateKey(step) {
      return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
    }

    function getVerificationCodeLabel(step) {
      return step === 4 ? '注册' : '登录';
    }

    function isLikelyLoggedInChatgptHomeUrl(rawUrl) {
      const url = String(rawUrl || '').trim();
      if (!url) return false;

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

    function isSignupProfilePageUrl(rawUrl) {
      const url = String(rawUrl || '').trim();
      if (!url) return false;

      try {
        const parsed = new URL(url);
        const host = String(parsed.hostname || '').toLowerCase();
        if (!['auth.openai.com', 'auth0.openai.com', 'accounts.openai.com'].includes(host)) {
          return false;
        }
        return /\/create-account\/profile(?:[/?#]|$)/i.test(String(parsed.pathname || ''));
      } catch {
        return false;
      }
    }

    async function detectStep4PostSubmitFallback(tabId, options = {}) {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 8000);
      const pollIntervalMs = Math.max(100, Number(options.pollIntervalMs) || 250);
      const startedAt = Date.now();
      let lastUrl = '';

      while (Date.now() - startedAt < timeoutMs) {
        throwIfStopped();
        try {
          const tab = await chrome.tabs.get(tabId);
          const currentUrl = String(tab?.url || '').trim();
          if (currentUrl) {
            lastUrl = currentUrl;
          }

          if (isLikelyLoggedInChatgptHomeUrl(currentUrl)) {
            return {
              success: true,
              reason: 'chatgpt_home',
              skipProfileStep: true,
              url: currentUrl,
            };
          }

          if (isSignupProfilePageUrl(currentUrl)) {
            return {
              success: true,
              reason: 'signup_profile',
              skipProfileStep: false,
              url: currentUrl,
            };
          }
        } catch {
          // Keep polling until timeout; tab may be mid-navigation.
        }

        await sleepWithStop(pollIntervalMs);
      }

      return {
        success: false,
        reason: 'unknown',
        skipProfileStep: false,
        url: lastUrl,
      };
    }

    function getVerificationResendStateKey() {
      return 'verificationResendCount';
    }

    function normalizeVerificationResendCount(value, fallback = 0) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return Math.max(0, Math.floor(Number(fallback) || 0));
      }

      return Math.min(20, Math.max(0, Math.floor(numeric)));
    }

    function getLegacyVerificationResendCountDefault(step, options = {}) {
      const requestFreshCodeFirst = Boolean(options.requestFreshCodeFirst);
      const legacyMaxRounds = Math.max(1, Math.floor(Number(VERIFICATION_POLL_MAX_ROUNDS) || 1));
      if (step === 4 && requestFreshCodeFirst) {
        return legacyMaxRounds;
      }
      return Math.max(0, legacyMaxRounds - 1);
    }

    function getConfiguredVerificationResendCount(step, state, options = {}) {
      const stateKey = getVerificationResendStateKey(step);
      const configuredValue = state?.[stateKey] !== undefined
        ? state[stateKey]
        : (state?.signupVerificationResendCount ?? state?.loginVerificationResendCount);
      return normalizeVerificationResendCount(
        configuredValue,
        getLegacyVerificationResendCountDefault(step, options)
      );
    }

    function resolveMaxResendRequests(pollOverrides = {}) {
      if (pollOverrides.maxResendRequests !== undefined) {
        return normalizeVerificationResendCount(pollOverrides.maxResendRequests, 0);
      }

      const legacyMaxRounds = Number(pollOverrides.maxRounds);
      if (Number.isFinite(legacyMaxRounds)) {
        return Math.max(0, Math.floor(legacyMaxRounds) - 1);
      }

      return Math.max(0, Math.floor(Number(VERIFICATION_POLL_MAX_ROUNDS) || 1) - 1);
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
      if (step === 8 && response?.addPhoneDetected) {
        throw new Error('步骤 8：验证码提交后页面进入手机号页面，当前流程无法继续自动授权。 URL: https://auth.openai.com/add-phone');
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
      const mail2925MatchTargetEmail = is2925Provider
        && String(state?.mail2925Mode || '').trim().toLowerCase() === 'receive';
      if (step === 4) {
        return {
          filterAfterTimestamp: is2925Provider ? 0 : getHotmailVerificationRequestTimestamp(4, state),
          senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
          subjectFilters: ['verify', 'verification', 'code', '验证码', 'confirm'],
          targetEmail: state.email,
          mail2925MatchTargetEmail,
          maxAttempts: is2925Provider ? MAIL_2925_VERIFICATION_MAX_ATTEMPTS : 5,
          intervalMs: is2925Provider ? MAIL_2925_VERIFICATION_INTERVAL_MS : 3000,
          ...overrides,
        };
      }

      return {
        filterAfterTimestamp: is2925Provider ? 0 : getHotmailVerificationRequestTimestamp(8, state),
        senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
        subjectFilters: ['verify', 'verification', 'code', '验证码', 'confirm', 'login'],
        targetEmail: String(state?.step8VerificationTargetEmail || '').trim() || state.email,
        mail2925MatchTargetEmail,
        maxAttempts: is2925Provider ? MAIL_2925_VERIFICATION_MAX_ATTEMPTS : 5,
        intervalMs: is2925Provider ? MAIL_2925_VERIFICATION_INTERVAL_MS : 3000,
        ...overrides,
      };
    }

    async function getRemainingTimeBudgetMs(step, options = {}, actionLabel = '') {
      const resolver = typeof options.getRemainingTimeMs === 'function'
        ? options.getRemainingTimeMs
        : null;
      if (!resolver) {
        return null;
      }

      const value = await resolver({ step, actionLabel });
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return null;
      }

      return Math.max(0, Math.floor(numeric));
    }

    async function getResponseTimeoutMsForStep(step, options = {}, fallbackMs = 30000, actionLabel = '') {
      const remainingMs = await getRemainingTimeBudgetMs(step, options, actionLabel);
      if (remainingMs === null) {
        return Math.max(1000, Number(fallbackMs) || 1000);
      }

      return Math.max(1000, Math.min(Math.max(1000, Number(fallbackMs) || 1000), remainingMs));
    }

    async function applyMailPollingTimeBudget(step, payload, options = {}, actionLabel = '') {
      const nextPayload = { ...payload };
      const intervalMs = Math.max(1, Number(nextPayload.intervalMs) || 3000);
      const baseMaxAttempts = Math.max(1, Number(nextPayload.maxAttempts) || 1);
      const disableTimeBudgetCap = Boolean(options.disableTimeBudgetCap);
      const remainingMs = await getRemainingTimeBudgetMs(step, options, actionLabel);

      if (!disableTimeBudgetCap && remainingMs !== null) {
        nextPayload.maxAttempts = Math.max(
          1,
          Math.min(baseMaxAttempts, Math.floor(Math.max(0, remainingMs - 1000) / intervalMs) + 1)
        );
      }

      const defaultResponseTimeoutMs = Math.max(45000, nextPayload.maxAttempts * intervalMs + 25000);
      const responseTimeoutMs = disableTimeBudgetCap || remainingMs === null
        ? defaultResponseTimeoutMs
        : Math.max(1000, Math.min(defaultResponseTimeoutMs, remainingMs));

      return {
        payload: nextPayload,
        responseTimeoutMs,
        timeoutMs: responseTimeoutMs,
      };
    }

    async function requestVerificationCodeResend(step, options = {}) {
      throwIfStopped();
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法重新请求验证码。');
      }

      throwIfStopped();
      await chrome.tabs.update(signupTabId, { active: true });
      throwIfStopped();

      const result = await sendToContentScript('signup-page', {
        type: 'RESEND_VERIFICATION_CODE',
        step,
        source: 'background',
        payload: {},
      }, {
        responseTimeoutMs: await getResponseTimeoutMsForStep(
          step,
          options,
          30000,
          `重新发送${getVerificationCodeLabel(step)}验证码`
        ),
      });

      if (result && result.error) {
        throw new Error(result.error);
      }

      await addLog(`步骤 ${step}：已请求新的${getVerificationCodeLabel(step)}验证码。`, 'warn');

      const requestedAt = Date.now();
      if (step === 4) {
        await setState({ signupVerificationRequestedAt: requestedAt });
      }
      if (step === 8) {
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

    function shouldPreclear2925Mailbox(step, mail, options = {}) {
      if (mail?.provider !== '2925' || (step !== 4 && step !== 8)) {
        return false;
      }

      return !(Number(options.filterAfterTimestamp) > 0);
    }

    async function clear2925MailboxBeforePolling(step, mail, options = {}) {
      if (!shouldPreclear2925Mailbox(step, mail, options)) {
        return;
      }

      throwIfStopped();
      await addLog(`步骤 ${step}：开始刷新 2925 邮箱前先清空全部邮件，避免读取旧验证码邮件。`, 'warn');

      try {
        const responseTimeoutMs = await getResponseTimeoutMsForStep(
          step,
          options,
          15000,
          '清空 2925 邮箱历史邮件'
        );
        const result = await sendToMailContentScriptResilient(
          mail,
          {
            type: 'DELETE_ALL_EMAILS',
            step,
            source: 'background',
            payload: {},
          },
          {
            timeoutMs: responseTimeoutMs,
            responseTimeoutMs,
            maxRecoveryAttempts: 2,
          }
        );

        if (result?.error) {
          throw new Error(result.error);
        }

        if (result?.deleted === false) {
          await addLog(`步骤 ${step}：未能确认 2925 邮箱已清空，将继续刷新等待新邮件。`, 'warn');
          return;
        }

        await addLog(`步骤 ${step}：2925 邮箱已预先清空，开始刷新等待新邮件。`, 'info');
      } catch (err) {
        if (isStopError(err)) {
          throw err;
        }
        await addLog(`步骤 ${step}：预清空 2925 邮箱失败，将继续刷新等待新邮件：${err.message}`, 'warn');
      }
    }

    function triggerPostSuccessMailboxCleanup(step, mail) {
      if (mail?.provider !== '2925') {
        return;
      }

      Promise.resolve().then(async () => {
        try {
          await sendToMailContentScriptResilient(
            mail,
            {
              type: 'DELETE_ALL_EMAILS',
              step,
              source: 'background',
              payload: {},
            },
            {
              timeoutMs: 10000,
              responseTimeoutMs: 5000,
              maxRecoveryAttempts: 1,
            }
          );
        } catch (_) {
          // Best-effort cleanup only.
        }
      });
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
        maxResendRequests: _ignoredMaxResendRequests,
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
      const maxResendRequests = resolveMaxResendRequests(pollOverrides);
      const totalRounds = maxResendRequests + 1;
      const maxRounds = totalRounds;
      const resendIntervalMs = Math.max(0, Number(pollOverrides.resendIntervalMs) || 0);
      let lastResendAt = Number(pollOverrides.lastResendAt) || 0;
      let usedResendRequests = 0;

      for (let round = 1; round <= totalRounds; round++) {
        throwIfStopped();
        if (round > 1) {
          lastResendAt = await requestVerificationCodeResend(step, pollOverrides);
          usedResendRequests += 1;
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
            const timedPoll = await applyMailPollingTimeBudget(
              step,
              payload,
              pollOverrides,
              `轮询${getVerificationCodeLabel(step)}验证码邮箱`
            );
            const result = await sendToMailContentScriptResilient(
              mail,
              {
                type: 'POLL_EMAIL',
                step,
                source: 'background',
                payload: timedPoll.payload,
              },
              {
                timeoutMs: timedPoll.timeoutMs,
                maxRecoveryAttempts: 2,
                responseTimeoutMs: timedPoll.responseTimeoutMs,
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
              remainingResendRequests: Math.max(0, maxResendRequests - usedResendRequests),
            };
          } catch (err) {
            if (isStopError(err)) {
              throw err;
            }
            if (mail?.provider === '2925' && typeof isMail2925LimitReachedError === 'function' && isMail2925LimitReachedError(err)) {
              if (typeof handleMail2925LimitReachedError === 'function') {
                throw await handleMail2925LimitReachedError(step, err);
              }
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
            const configuredIntervalMs = Math.max(
              1,
              Number(payloadOverrides.intervalMs)
                || Number(pollOverrides.intervalMs)
                || 3000
            );
            const cooldownSleepMs = Math.min(
              remainingBeforeResendMs,
              Math.max(1000, Math.min(configuredIntervalMs, 3000))
            );
            await sleepWithStop(cooldownSleepMs);
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
      const {
        onResendRequestedAt,
        maxRounds: _ignoredMaxRounds,
        maxResendRequests: _ignoredMaxResendRequests,
        ...cleanPollOverrides
      } = pollOverrides;

      if (mail.provider === HOTMAIL_PROVIDER) {
        const hotmailPollConfig = getHotmailVerificationPollConfig(step);
        const timedPoll = await applyMailPollingTimeBudget(step, {
          ...getVerificationPollPayload(step, state),
          ...hotmailPollConfig,
          ...cleanPollOverrides,
        }, cleanPollOverrides, `轮询${getVerificationCodeLabel(step)}验证码邮箱`);
        return pollHotmailVerificationCode(step, state, timedPoll.payload);
      }
      if (mail.provider === LUCKMAIL_PROVIDER) {
        const timedPoll = await applyMailPollingTimeBudget(step, {
          ...getVerificationPollPayload(step, state),
          ...cleanPollOverrides,
        }, cleanPollOverrides, `轮询${getVerificationCodeLabel(step)}验证码邮箱`);
        return pollLuckmailVerificationCode(step, state, timedPoll.payload);
      }
      if (mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
        const timedPoll = await applyMailPollingTimeBudget(step, {
          ...getVerificationPollPayload(step, state),
          ...cleanPollOverrides,
        }, cleanPollOverrides, `轮询${getVerificationCodeLabel(step)}验证码邮箱`);
        return pollCloudflareTempEmailVerificationCode(step, state, timedPoll.payload);
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
      const maxResendRequests = resolveMaxResendRequests(pollOverrides);
      const maxRounds = maxResendRequests + 1;
      let usedResendRequests = 0;

      for (let round = 1; round <= maxRounds; round++) {
        throwIfStopped();
        if (round > 1) {
          const requestedAt = await requestVerificationCodeResend(step, pollOverrides);
          usedResendRequests += 1;
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
          const timedPoll = await applyMailPollingTimeBudget(
            step,
            payload,
            pollOverrides,
            `轮询${getVerificationCodeLabel(step)}验证码邮箱`
          );
          const result = await sendToMailContentScriptResilient(
            mail,
            {
              type: 'POLL_EMAIL',
              step,
              source: 'background',
              payload: timedPoll.payload,
            },
            {
              timeoutMs: timedPoll.timeoutMs,
              maxRecoveryAttempts: 2,
              responseTimeoutMs: timedPoll.responseTimeoutMs,
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
            remainingResendRequests: Math.max(0, maxResendRequests - usedResendRequests),
          };
        } catch (err) {
          if (isStopError(err)) {
            throw err;
          }
          if (mail?.provider === '2925' && typeof isMail2925LimitReachedError === 'function' && isMail2925LimitReachedError(err)) {
            if (typeof handleMail2925LimitReachedError === 'function') {
              throw await handleMail2925LimitReachedError(step, err);
            }
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

    async function submitVerificationCode(step, code, options = {}) {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法填写验证码。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      const baseResponseTimeoutMs = await getResponseTimeoutMsForStep(
        step,
        options,
        step === 7 ? 45000 : 30000,
        `填写${getVerificationCodeLabel(step)}验证码`
      );
      const message = {
        type: 'FILL_CODE',
        step,
        source: 'background',
        payload: { code },
      };
      let result;
      if (typeof sendToContentScriptResilient === 'function') {
        try {
          result = await sendToContentScriptResilient('signup-page', message, {
            timeoutMs: Math.max(baseResponseTimeoutMs + 15000, 30000),
            retryDelayMs: 700,
            responseTimeoutMs: baseResponseTimeoutMs,
            logMessage: `步骤 ${step}：认证页正在切换，等待页面重新就绪后继续确认验证码提交结果...`,
          });
        } catch (err) {
          if (step === 4 && isRetryableVerificationTransportError(err)) {
            const fallback = await detectStep4PostSubmitFallback(signupTabId, {
              timeoutMs: 9000,
              pollIntervalMs: 300,
            });
            if (fallback.success) {
              const fallbackLabel = fallback.reason === 'chatgpt_home'
                ? 'ChatGPT 已登录首页'
                : '注册资料页';
              await addLog(`步骤 4：验证码提交后页面已切换到${fallbackLabel}，按提交成功继续。`, 'warn');
              return {
                success: true,
                assumed: true,
                transportRecovered: true,
                skipProfileStep: Boolean(fallback.skipProfileStep),
                url: fallback.url,
              };
            }
          }
          throw err;
        }
      } else {
        result = await sendToContentScript('signup-page', message, {
          responseTimeoutMs: baseResponseTimeoutMs,
        });
      }

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
      let remainingAutomaticResendCount = options.maxResendRequests !== undefined
        ? normalizeVerificationResendCount(
          options.maxResendRequests,
          getLegacyVerificationResendCountDefault(step, { requestFreshCodeFirst })
        )
        : getConfiguredVerificationResendCount(step, state, { requestFreshCodeFirst });
      const maxSubmitAttempts = 15;
      const resendIntervalMs = Math.max(0, Number(options.resendIntervalMs) || 0);
      let lastResendAt = Number(options.lastResendAt) || 0;

      const updateFilterAfterTimestampForVerificationStep = async (_requestedAt) => {
        return nextFilterAfterTimestamp;
      };

      await clear2925MailboxBeforePolling(step, mail, options);

      if (requestFreshCodeFirst) {
        if (remainingAutomaticResendCount <= 0) {
          await addLog(`步骤 ${step}：当前自动重新发送验证码次数为 0，将直接使用当前时间窗口轮询邮箱。`, 'info');
        } else {
          try {
            lastResendAt = await requestVerificationCodeResend(step, options);
            remainingAutomaticResendCount -= 1;
            await updateFilterAfterTimestampForVerificationStep(lastResendAt);
            await addLog(`步骤 ${step}：已先请求一封新的${getVerificationCodeLabel(step)}验证码，再开始轮询邮箱。`, 'warn');
          } catch (err) {
            if (isStopError(err)) {
              throw err;
            }
            await addLog(`步骤 ${step}：首次重新获取验证码失败：${err.message}，将继续使用当前时间窗口轮询。`, 'warn');
          }
        }
      }

      if (mail.provider === HOTMAIL_PROVIDER) {
          const initialDelayMs = Number(options.initialDelayMs ?? hotmailPollConfig.initialDelayMs) || 0;
          if (initialDelayMs > 0) {
            const remainingMs = await getRemainingTimeBudgetMs(
              step,
              options,
              `等待${getVerificationCodeLabel(step)}验证码邮件到达`
            );
            const delayMs = remainingMs === null
              ? initialDelayMs
              : Math.min(initialDelayMs, Math.max(0, remainingMs));
            await addLog(`步骤 ${step}：等待 ${Math.round(initialDelayMs / 1000)} 秒，让 Hotmail 验证码邮件先到达...`, 'info');
            await sleepWithStop(delayMs);
          }
        }

        for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
          const pollOptions = {
            excludeCodes: [...rejectedCodes],
            disableTimeBudgetCap: Boolean(options.disableTimeBudgetCap),
            getRemainingTimeMs: options.getRemainingTimeMs,
            maxResendRequests: remainingAutomaticResendCount,
            resendIntervalMs,
            lastResendAt,
            onResendRequestedAt: updateFilterAfterTimestampForVerificationStep,
          };
          if (nextFilterAfterTimestamp !== null && nextFilterAfterTimestamp !== undefined) {
            pollOptions.filterAfterTimestamp = nextFilterAfterTimestamp;
          }
          const result = await pollFreshVerificationCode(step, state, mail, pollOptions);
          lastResendAt = Number(result?.lastResendAt) || lastResendAt;
          remainingAutomaticResendCount = normalizeVerificationResendCount(
            result?.remainingResendRequests,
            remainingAutomaticResendCount
          );

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
          const submitResult = await submitVerificationCode(step, result.code, options);

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
              await sleepWithStop(Math.min(remainingBeforeResendMs, 2000));
              continue;
            }

            if (remainingAutomaticResendCount <= 0) {
              await addLog(`步骤 ${step}：已达到自动重新发送验证码次数上限，将直接使用当前时间窗口继续重试。`, 'warn');
              continue;
            }

            lastResendAt = await requestVerificationCodeResend(step, options);
            remainingAutomaticResendCount -= 1;
            await updateFilterAfterTimestampForVerificationStep(lastResendAt);
            await addLog(`步骤 ${step}：提交失败后已请求新验证码（${attempt + 1}/${maxSubmitAttempts}）...`, 'warn');
            continue;
          }

          if (submitResult.addPhonePage) {
            const urlPart = submitResult.url ? ` URL: ${submitResult.url}` : '';
            throw new Error(`步骤 ${step}：验证码提交后页面进入手机号页面，当前流程无法继续自动授权。${urlPart}`.trim());
          }

          await setState({
            lastEmailTimestamp: result.emailTimestamp,
            [stateKey]: result.code,
          });

          await completeStepFromBackground(step, {
            emailTimestamp: result.emailTimestamp,
            code: result.code,
            ...(step === 4 && submitResult?.skipProfileStep ? { skipProfileStep: true } : {}),
          });
          triggerPostSuccessMailboxCleanup(step, mail);
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
