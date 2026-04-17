(function attachBackgroundStep6(root, factory) {
  root.MultiPageBackgroundStep6 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep6Module() {
  function createStep6Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      getErrorMessage,
      getLoginAuthStateLabel,
      getState,
      isStep6RecoverableResult,
      isStep6SuccessResult,
      recoverSignupPageIfNeeded,
      refreshOAuthUrlBeforeStep6,
      reuseOrCreateTab,
      runPreStep6CookieCleanup,
      sendToSignupPageWithRecovery,
      shouldSkipLoginVerificationForCpaCallback,
      skipLoginVerificationStepsForCpaCallback,
      STEP6_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    async function executeStep6(state, options = {}) {
      const { skipPreLoginCleanup = false } = options;
      if (shouldSkipLoginVerificationForCpaCallback(state)) {
        await skipLoginVerificationStepsForCpaCallback();
        return;
      }
      if (!state.email) {
        throw new Error('缺少邮箱地址，请先完成步骤 3。');
      }

      if (!skipPreLoginCleanup) {
        await runPreStep6CookieCleanup();
      }

      let attempt = 0;
      let lastError = null;

      while (attempt < STEP6_MAX_ATTEMPTS) {
        throwIfStopped();
        attempt += 1;
        try {
          const currentState = attempt === 1 ? state : await getState();
          const password = currentState.password || currentState.customPassword || '';
          const oauthUrl = await refreshOAuthUrlBeforeStep6(currentState);

          if (attempt === 1) {
            await addLog('步骤 6：正在打开最新 OAuth 链接并登录...');
          } else {
            await addLog(`步骤 6：上一轮失败后，正在进行第 ${attempt} 次尝试（最多 ${STEP6_MAX_ATTEMPTS} 次）...`, 'warn');
          }

          await reuseOrCreateTab('signup-page', oauthUrl);
          await recoverSignupPageIfNeeded(6);

          const result = await sendToSignupPageWithRecovery({
            type: 'EXECUTE_STEP',
            step: 6,
            source: 'background',
            payload: {
              email: currentState.email,
              password,
            },
          }, {
            step: 6,
            timeoutMs: 180000,
            retryDelayMs: 700,
            logMessage: '步骤 6：认证页正在切换，等待页面恢复后继续登录...',
          });

          if (result?.error) {
            throw new Error(result.error);
          }

          if (isStep6SuccessResult(result)) {
            await completeStepFromBackground(6, {
              loginVerificationRequestedAt: result.loginVerificationRequestedAt || null,
            });
            return;
          }

          if (isStep6RecoverableResult(result)) {
            const reasonMessage = result.message
              || `当前停留在${getLoginAuthStateLabel(result.state)}，准备重新执行步骤 6。`;
            throw new Error(reasonMessage);
          }

          throw new Error('步骤 6：认证页未返回可识别的登录结果。');
        } catch (err) {
          throwIfStopped(err);
          lastError = err;
          if (attempt >= STEP6_MAX_ATTEMPTS) {
            break;
          }

          await addLog(`步骤 6：第 ${attempt} 次尝试失败，原因：${getErrorMessage(err)}；准备重试...`, 'warn');
        }
      }

      throw new Error(`步骤 6：判定失败后已重试 ${STEP6_MAX_ATTEMPTS - 1} 次，仍未成功。最后原因：${getErrorMessage(lastError)}`);
    }

    return { executeStep6 };
  }

  return { createStep6Executor };
});
