(function attachBackgroundStep9(root, factory) {
  root.MultiPageBackgroundStep9 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep9Module() {
  function createStep9Executor(deps = {}) {
    const {
      addLog,
      chrome,
      cleanupStep8NavigationListeners,
      clickWithDebugger,
      completeStepFromBackground,
      ensureStep8SignupPageReady,
      getOAuthFlowRemainingMs,
      getOAuthFlowStepTimeoutMs,
      getStep8CallbackUrlFromNavigation,
      getStep8CallbackUrlFromTabUpdate,
      getStep8EffectLabel,
      getTabId,
      isTabAlive,
      prepareStep8DebuggerClick,
      recoverOAuthLocalhostTimeout,
      reloadStep8ConsentPage,
      reuseOrCreateTab,
      sleepWithStop,
      STEP8_CLICK_RETRY_DELAY_MS,
      STEP8_MAX_ROUNDS,
      STEP8_READY_WAIT_TIMEOUT_MS,
      STEP8_STRATEGIES,
      throwIfStep8SettledOrStopped,
      triggerStep8ContentStrategy,
      waitForStep8ClickEffect,
      waitForStep8Ready,
      setWebNavListener,
      setWebNavCommittedListener,
      setStep8PendingReject,
      setStep8TabUpdatedListener,
    } = deps;

    const LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS = 240000;
    const CALLBACK_TIMEOUT_CHECK_INTERVAL_MS = 1000;

    function getVisibleStep(state, fallback = 9) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : fallback;
    }

    function getAuthLoginStepForVisibleStep(visibleStep) {
      return visibleStep >= 12 ? 10 : 7;
    }

    function addStepLog(step, message, level = 'info') {
      return addLog(message, level, { step, stepKey: 'confirm-oauth' });
    }

    async function executeStep9(state) {
      const visibleStep = getVisibleStep(state, 9);
      let activeState = state;

      if (!activeState.oauthUrl) {
        const authLoginStep = getAuthLoginStepForVisibleStep(visibleStep);
        throw new Error(`缺少登录用 OAuth 链接，请先完成步骤 ${authLoginStep}。`);
      }

      await addStepLog(visibleStep, '正在监听 localhost 回调地址...');

      let callbackTimeoutMs = LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS;
      let timeoutRecoveryAttempted = false;
      while (true) {
        try {
          callbackTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
            ? await getOAuthFlowStepTimeoutMs(LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS, {
              step: visibleStep,
              actionLabel: 'OAuth localhost 回调',
              oauthUrl: activeState?.oauthUrl || '',
            })
            : LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS;
          break;
        } catch (error) {
          if (timeoutRecoveryAttempted || typeof recoverOAuthLocalhostTimeout !== 'function') {
            throw error;
          }
          const recoveredState = await recoverOAuthLocalhostTimeout({
            error,
            state: activeState,
            visibleStep,
          });
          if (!recoveredState) {
            throw error;
          }
          activeState = recoveredState;
          timeoutRecoveryAttempted = true;
        }
      }

      return new Promise((resolve, reject) => {
        let resolved = false;
        let signupTabId = null;
        const callbackWaitStartedAt = Date.now();
        let timeoutCheckTimer = null;

        const cleanupListener = () => {
          if (timeoutCheckTimer) {
            clearTimeout(timeoutCheckTimer);
            timeoutCheckTimer = null;
          }
          cleanupStep8NavigationListeners();
          setStep8PendingReject(null);
        };

        const rejectStep9 = (error) => {
          if (resolved) return;
          resolved = true;
          cleanupListener();
          reject(error);
        };

        const finalizeStep9Callback = (callbackUrl) => {
          if (resolved || !callbackUrl) return;

          resolved = true;
          cleanupListener();

          addStepLog(visibleStep, `已捕获 localhost 地址：${callbackUrl}`, 'ok').then(() => {
            return completeStepFromBackground(visibleStep, { localhostUrl: callbackUrl });
          }).then(() => {
            resolve();
          }).catch((err) => {
            reject(err);
          });
        };

        const checkCallbackTimeout = async () => {
          if (resolved) {
            return;
          }
          const elapsedMs = Date.now() - callbackWaitStartedAt;
          if (elapsedMs >= LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS) {
            rejectStep9(new Error(`${Math.round(LOCALHOST_CALLBACK_LOCAL_TIMEOUT_MS / 1000)} 秒内未捕获到 localhost 回调跳转，步骤 ${visibleStep} 的点击可能被拦截了。`));
            return;
          }

          if (typeof getOAuthFlowRemainingMs === 'function') {
            try {
              await getOAuthFlowRemainingMs({
                step: visibleStep,
                actionLabel: 'OAuth localhost 回调',
                oauthUrl: activeState?.oauthUrl || '',
              });
            } catch (error) {
              rejectStep9(error);
              return;
            }
          } else if (elapsedMs >= callbackTimeoutMs) {
            rejectStep9(new Error(`${Math.round(callbackTimeoutMs / 1000)} 秒内未捕获到 localhost 回调跳转，步骤 ${visibleStep} 的点击可能被拦截了。`));
            return;
          }

          timeoutCheckTimer = setTimeout(checkCallbackTimeout, CALLBACK_TIMEOUT_CHECK_INTERVAL_MS);
        };

        timeoutCheckTimer = setTimeout(
          checkCallbackTimeout,
          Math.min(CALLBACK_TIMEOUT_CHECK_INTERVAL_MS, Math.max(1, callbackTimeoutMs))
        );

        setStep8PendingReject((error) => {
          rejectStep9(error);
        });

        setWebNavListener((details) => {
          const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        setWebNavCommittedListener((details) => {
          const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        setStep8TabUpdatedListener((tabId, changeInfo, tab) => {
          const callbackUrl = getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId);
          finalizeStep9Callback(callbackUrl);
        });

        (async () => {
          try {
            throwIfStep8SettledOrStopped(resolved);
            signupTabId = await getTabId('signup-page');
            throwIfStep8SettledOrStopped(resolved);

            if (signupTabId && await isTabAlive('signup-page')) {
              await chrome.tabs.update(signupTabId, { active: true });
              await addStepLog(visibleStep, '已切回认证页，正在准备调试器点击...');
            } else {
              signupTabId = await reuseOrCreateTab('signup-page', activeState.oauthUrl);
              await addStepLog(visibleStep, '已重新打开认证页，正在准备调试器点击...');
            }

            throwIfStep8SettledOrStopped(resolved);
            chrome.webNavigation.onBeforeNavigate.addListener(deps.getWebNavListener());
            chrome.webNavigation.onCommitted.addListener(deps.getWebNavCommittedListener());
            chrome.tabs.onUpdated.addListener(deps.getStep8TabUpdatedListener());
            await ensureStep8SignupPageReady(signupTabId, {
              timeoutMs: typeof getOAuthFlowStepTimeoutMs === 'function'
                ? await getOAuthFlowStepTimeoutMs(15000, {
                  step: visibleStep,
                  actionLabel: '等待 OAuth 同意页内容脚本就绪',
                })
                : 15000,
              visibleStep,
              logStepKey: 'confirm-oauth',
              logMessage: '认证页内容脚本尚未就绪，正在等待页面恢复...',
            });

            for (let round = 1; round <= STEP8_MAX_ROUNDS && !resolved; round++) {
              throwIfStep8SettledOrStopped(resolved);
              const pageState = await waitForStep8Ready(
                signupTabId,
                typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(STEP8_READY_WAIT_TIMEOUT_MS, {
                    step: visibleStep,
                    actionLabel: '等待 OAuth 同意页出现',
                  })
                  : STEP8_READY_WAIT_TIMEOUT_MS,
                { visibleStep }
              );
              if (!pageState?.consentReady) {
                await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
                continue;
              }

              const strategy = STEP8_STRATEGIES[Math.min(round - 1, STEP8_STRATEGIES.length - 1)];

              await addStepLog(visibleStep, `第 ${round}/${STEP8_MAX_ROUNDS} 轮尝试点击“继续”（${strategy.label}）...`);

              if (strategy.mode === 'debugger') {
                const clickActionTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(15000, {
                    step: visibleStep,
                    actionLabel: '定位 OAuth 同意页继续按钮',
                  })
                  : 15000;
                const clickTarget = await prepareStep8DebuggerClick(signupTabId, {
                  timeoutMs: clickActionTimeoutMs,
                  responseTimeoutMs: clickActionTimeoutMs,
                  visibleStep,
                });
                throwIfStep8SettledOrStopped(resolved);
                await clickWithDebugger(signupTabId, clickTarget?.rect, { visibleStep });
              } else {
                const clickActionTimeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(15000, {
                    step: visibleStep,
                    actionLabel: '点击 OAuth 同意页继续按钮',
                  })
                  : 15000;
                await triggerStep8ContentStrategy(signupTabId, strategy.strategy, {
                  timeoutMs: clickActionTimeoutMs,
                  responseTimeoutMs: clickActionTimeoutMs,
                  visibleStep,
                });
              }

              if (resolved) {
                return;
              }

              const effect = await waitForStep8ClickEffect(
                signupTabId,
                pageState.url,
                typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(15000, {
                    step: visibleStep,
                    actionLabel: '等待 OAuth 同意页点击生效',
                  })
                  : 15000,
                { visibleStep }
              );
              if (resolved) {
                return;
              }

              if (effect.progressed) {
                await addStepLog(visibleStep, `检测到本次点击已生效，${getStep8EffectLabel(effect)}，继续等待 localhost 回调...`, 'info');
                break;
              }

              if (round >= STEP8_MAX_ROUNDS) {
                throw new Error(`步骤 ${visibleStep}：连续 ${STEP8_MAX_ROUNDS} 轮点击“继续”后页面仍无反应。`);
              }

              await addStepLog(visibleStep, `${strategy.label} 本轮点击后页面无反应，正在刷新认证页后重试（下一轮 ${round + 1}/${STEP8_MAX_ROUNDS}）...`, 'warn');
              await reloadStep8ConsentPage(
                signupTabId,
                typeof getOAuthFlowStepTimeoutMs === 'function'
                  ? await getOAuthFlowStepTimeoutMs(30000, {
                    step: visibleStep,
                    actionLabel: '刷新 OAuth 同意页',
                  })
                  : 30000,
                { visibleStep }
              );
              await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
            }
          } catch (err) {
            rejectStep9(err);
          }
        })();
      });
    }

    return { executeStep9 };
  }

  return { createStep9Executor };
});
