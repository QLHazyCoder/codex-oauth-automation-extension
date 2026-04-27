(function attachBackgroundStep7(root, factory) {
  root.MultiPageBackgroundStep7 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep7Module() {
  function createStep7Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      getErrorMessage,
      getLoginAuthStateLabel,
      getOAuthFlowStepTimeoutMs,
      getState,
      isAddPhoneAuthFailure = (error) => {
        const message = String(typeof error === 'string' ? error : error?.message || '');
        if (/\u624b\u673a\u53f7\u8f93\u5165\u6a21\u5f0f|phone\s+entry/i.test(message)) {
          return false;
        }
        return /https:\/\/auth\.openai\.com\/add-phone(?:[/?#]|$)|\badd-phone\b|\u6dfb\u52a0\u624b\u673a\u53f7|\u624b\u673a\u53f7\u7801|\u8fdb\u5165\u624b\u673a\u53f7\u9875\u9762|\u624b\u673a\u53f7\u9875|\u624b\u673a\u53f7\u9875\u9762|phone\s+number|telephone/i.test(message);
      },
      isStep6RecoverableResult,
      isStep6SuccessResult,
      refreshOAuthUrlBeforeStep6,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      startOAuthFlowTimeoutWindow,
      STEP6_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    function isManagementSecretConfigError(error) {
      const message = String(typeof error === 'string' ? error : error?.message || '').trim();
      if (!message) {
        return false;
      }

      const mentionsSecret = /管理密钥|Admin Secret|X-Admin-Key|CPA Key/i.test(message);
      if (!mentionsSecret) {
        return false;
      }

      return /缺少|未配置|请输入|无效|错误|失败|401|认证失败|未授权|unauthorized|invalid/i.test(message);
    }

    async function executeStep7(state) {
      if (!state.email) {
        throw new Error('缺少邮箱地址，请先完成步骤 3。');
      }

      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      const completionStep = visibleStep > 0 ? visibleStep : 7;

      let attempt = 0;
      let lastError = null;

      while (attempt < STEP6_MAX_ATTEMPTS) {
        throwIfStopped();
        attempt += 1;
        try {
          const currentState = attempt === 1 ? state : await getState();
          const password = currentState.password || currentState.customPassword || '';
          const oauthUrl = await refreshOAuthUrlBeforeStep6(currentState);
          if (typeof startOAuthFlowTimeoutWindow === 'function') {
            await startOAuthFlowTimeoutWindow({ step: 7, oauthUrl });
          }
          const loginTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
            ? await getOAuthFlowStepTimeoutMs(180000, {
              step: 7,
              actionLabel: 'OAuth 登录并进入验证码页',
              oauthUrl,
            })
            : 180000;

          if (attempt === 1) {
            await addLog('步骤 7：正在打开最新 OAuth 链接并登录...');
          } else {
            await addLog(`步骤 7：上一轮失败后，正在进行第 ${attempt} 次尝试（最多 ${STEP6_MAX_ATTEMPTS} 次）...`, 'warn');
          }

          await reuseOrCreateTab('signup-page', oauthUrl);

          const result = await sendToContentScriptResilient(
            'signup-page',
            {
              type: 'EXECUTE_STEP',
              step: 7,
              source: 'background',
              payload: {
                email: currentState.email,
                password,
              },
            },
            {
              timeoutMs: loginTimeoutMs,
              responseTimeoutMs: loginTimeoutMs,
              retryDelayMs: 700,
              logMessage: '步骤 7：认证页正在切换，等待页面重新就绪后继续登录...',
            }
          );

          if (result?.error) {
            throw new Error(result.error);
          }

          if (isStep6SuccessResult(result)) {
            const completionPayload = {
              loginVerificationRequestedAt: result.loginVerificationRequestedAt || null,
            };
            if (Object.prototype.hasOwnProperty.call(result || {}, 'skipLoginVerificationStep')) {
              completionPayload.skipLoginVerificationStep = Boolean(result.skipLoginVerificationStep);
            }
            if (Object.prototype.hasOwnProperty.call(result || {}, 'directOAuthConsentPage')) {
              completionPayload.directOAuthConsentPage = Boolean(result.directOAuthConsentPage);
            }

            await completeStepFromBackground(completionStep, completionPayload);
            return;
          }

          if (isStep6RecoverableResult(result)) {
            const reasonMessage = result.message
              || `当前停留在${getLoginAuthStateLabel(result.state)}，准备重新执行步骤 7。`;
            throw new Error(reasonMessage);
          }

          throw new Error('步骤 7：认证页未返回可识别的登录结果。');
        } catch (err) {
          throwIfStopped(err);
          if (isAddPhoneAuthFailure(err)) {
            throw err;
          }
          if (isManagementSecretConfigError(err)) {
            await addLog(
              `步骤 7：检测到来源后台管理密钥缺失或错误，不再重试，当前流程停止。原因：${getErrorMessage(err)}`,
              'error'
            );
            throw err;
          }
          lastError = err;
          if (attempt >= STEP6_MAX_ATTEMPTS) {
            break;
          }

          await addLog(`步骤 7：第 ${attempt} 次尝试失败，原因：${getErrorMessage(err)}；准备重试...`, 'warn');
        }
      }

      throw new Error(`步骤 7：判断失败后已重试 ${STEP6_MAX_ATTEMPTS - 1} 次，仍未成功。最后原因：${getErrorMessage(lastError)}`);
    }

    return { executeStep7 };
  }

  return { createStep7Executor };
});
