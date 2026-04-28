(function attachBackgroundAutoRunController(root, factory) {
  root.MultiPageBackgroundAutoRunController = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundAutoRunControllerModule() {
  function createAutoRunController(deps = {}) {
    const {
      addLog,
      appendAccountRunRecord,
      AUTO_RUN_MAX_RETRIES_PER_ROUND,
      AUTO_RUN_RETRY_DELAY_MS,
      AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
      AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
      broadcastAutoRunStatus,
      broadcastStopToContentScripts,
      cancelPendingCommands,
      clearStopRequest,
      createAutoRunSessionId,
      ensureHotmailMailboxReadyForAutoRunRound,
      getAutoRunStatusPayload,
      getErrorMessage,
      getFirstUnfinishedStep,
      getPendingAutoRunTimerPlan,
      getRunningSteps,
      getState,
      hasSavedProgress,
      isAddPhoneAuthFailure,
      isRestartCurrentAttemptError,
      isSignupUserAlreadyExistsFailure,
      isStopError,
      launchAutoRunTimerPlan,
      normalizeAutoRunFallbackThreadIntervalMinutes,
      persistAutoRunTimerPlan,
      resetState,
      runAutoSequenceFromStep,
      runtime,
      setState,
      sleepWithStop,
      throwIfAutoRunSessionStopped,
      waitForRunningStepsToFinish,
    } = deps;

    function createAutoRunRoundSummary(round) {
      return {
        round,
        status: 'pending',
        attempts: 0,
        failureReasons: [],
        finalFailureReason: '',
      };
    }

    function normalizeAutoRunRoundSummary(summary, round) {
      const base = createAutoRunRoundSummary(round);
      if (!summary || typeof summary !== 'object') {
        return base;
      }

      const status = String(summary.status || '').trim().toLowerCase();
      return {
        round,
        status: ['pending', 'success', 'failed'].includes(status) ? status : base.status,
        attempts: Math.max(0, Math.floor(Number(summary.attempts) || 0)),
        failureReasons: Array.isArray(summary.failureReasons)
          ? summary.failureReasons.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        finalFailureReason: String(summary.finalFailureReason || '').trim(),
      };
    }

    function buildAutoRunRoundSummaries(totalRuns, rawSummaries = []) {
      return Array.from({ length: totalRuns }, (_, index) => normalizeAutoRunRoundSummary(rawSummaries[index], index + 1));
    }

    function serializeAutoRunRoundSummaries(totalRuns, roundSummaries = []) {
      return buildAutoRunRoundSummaries(totalRuns, roundSummaries).map((summary) => ({
        ...summary,
        failureReasons: [...summary.failureReasons],
      }));
    }

    function getAutoRunRoundRetryCount(summary) {
      return Math.max(0, Number(summary?.attempts || 0) - 1);
    }

    function formatAutoRunFailureReasons(reasons = []) {
      if (!Array.isArray(reasons) || !reasons.length) {
        return '未知错误';
      }

      const counts = new Map();
      for (const reason of reasons) {
        const normalized = String(reason || '').trim() || '未知错误';
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }

      return Array.from(counts.entries())
        .map(([reason, count]) => (count > 1 ? `${reason}（${count}次）` : reason))
        .join('；');
    }

    function shouldKeepCustomMailProviderPoolEmail(state = {}) {
      return String(state?.mailProvider || '').trim().toLowerCase() === 'custom'
        && Array.isArray(state?.customMailProviderPool)
        && state.customMailProviderPool.length > 0;
    }

    async function logAutoRunFinalSummary(totalRuns, roundSummaries = []) {
      const summaries = buildAutoRunRoundSummaries(totalRuns, roundSummaries);
      const successRounds = summaries.filter((item) => item.status === 'success');
      const failedRounds = summaries.filter((item) => item.status === 'failed');
      const pendingRounds = summaries.filter((item) => item.status === 'pending');

      await addLog('=== 自动运行汇总 ===', failedRounds.length ? 'warn' : 'ok');
      await addLog(
        `总轮数：${totalRuns}；成功：${successRounds.length}；失败：${failedRounds.length}；未完成：${pendingRounds.length}`,
        failedRounds.length ? 'warn' : 'ok'
      );

      if (successRounds.length) {
        await addLog(
          `成功轮次：${successRounds
            .map((item) => `第 ${item.round} 轮（重试 ${getAutoRunRoundRetryCount(item)} 次）`)
            .join('；')}`,
          'ok'
        );
      }

      if (failedRounds.length) {
        await addLog(
          `失败轮次：${failedRounds
            .map((item) => {
              const retryCount = getAutoRunRoundRetryCount(item);
              const finalReason = item.finalFailureReason || item.failureReasons[item.failureReasons.length - 1] || '未知错误';
              const reasonSummary = formatAutoRunFailureReasons(item.failureReasons);
              return `第 ${item.round} 轮（重试 ${retryCount} 次，最终原因：${finalReason}；失败记录：${reasonSummary}）`;
            })
            .join('；')}`,
          'error'
        );
      }

      if (pendingRounds.length) {
        await addLog(
          `未完成轮次：${pendingRounds.map((item) => `第 ${item.round} 轮`).join('；')}`,
          'warn'
        );
      }
    }

    async function skipAutoRunCountdown() {
      const state = await getState();
      const plan = getPendingAutoRunTimerPlan(state);
      if (!plan || state.autoRunPhase !== 'waiting_interval') {
        return false;
      }

      return launchAutoRunTimerPlan('manual', {
        expectedKinds: [
          AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
          AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
        ],
      });
    }

    async function waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, options = {}) {
      const { autoRunSkipFailures = false, roundSummaries = [] } = options;
      if (totalRuns <= 1 || targetRun >= totalRuns) {
        return false;
      }

      const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
        (await getState()).autoRunFallbackThreadIntervalMinutes
      );
      if (fallbackThreadIntervalMinutes <= 0) {
        return false;
      }

      const currentRuntime = runtime.get();
      const statusLabel = roundSummary?.status === 'failed' ? '失败' : '完成';
      await addLog(
        `线程间隔：第 ${targetRun}/${totalRuns} 轮已${statusLabel}，等待 ${fallbackThreadIntervalMinutes} 分钟后开始下一轮。`,
        'info'
      );
      await persistAutoRunTimerPlan({
        kind: AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
        fireAt: Date.now() + fallbackThreadIntervalMinutes * 60 * 1000,
        currentRun: targetRun,
        totalRuns,
        attemptRun: currentRuntime.autoRunAttemptRun,
        autoRunSessionId: currentRuntime.autoRunSessionId,
        autoRunSkipFailures,
        roundSummaries,
        countdownTitle: '线程间隔中',
        countdownNote: `第 ${Math.min(targetRun + 1, totalRuns)}/${totalRuns} 轮即将开始`,
      }, {
        autoRunSkipFailures,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
      });
      runtime.set({ autoRunActive: false });
      return true;
    }

    async function waitBeforeAutoRunRetry(targetRun, totalRuns, nextAttemptRun, options = {}) {
      const { autoRunSkipFailures = false, roundSummaries = [] } = options;
      const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
        (await getState()).autoRunFallbackThreadIntervalMinutes
      );
      if (fallbackThreadIntervalMinutes <= 0) {
        return false;
      }

      await addLog(
        `线程间隔：等待 ${fallbackThreadIntervalMinutes} 分钟后开始第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试。`,
        'info'
      );
      await persistAutoRunTimerPlan({
        kind: AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
        fireAt: Date.now() + fallbackThreadIntervalMinutes * 60 * 1000,
        currentRun: targetRun,
        totalRuns,
        attemptRun: nextAttemptRun,
        autoRunSessionId: runtime.get().autoRunSessionId,
        autoRunSkipFailures,
        roundSummaries,
        countdownTitle: '线程间隔中',
        countdownNote: `第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试即将开始`,
      }, {
        autoRunSkipFailures,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
      });
      runtime.set({ autoRunActive: false });
      return true;
    }

    async function handleAutoRunLoopUnhandledError(error) {
      const currentRuntime = runtime.get();
      console.error('Auto run loop crashed:', error);
      if (!isStopError(error)) {
        await addLog(`自动运行异常终止：${getErrorMessage(error) || '未知错误'}`, 'error');
      }

      runtime.set({ autoRunActive: false, autoRunSessionId: 0 });
      await broadcastAutoRunStatus('stopped', {
        currentRun: currentRuntime.autoRunCurrentRun,
        totalRuns: currentRuntime.autoRunTotalRuns,
        attemptRun: currentRuntime.autoRunAttemptRun,
        sessionId: 0,
      }, {
        autoRunSessionId: 0,
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      });
      clearStopRequest();
    }

    function startAutoRunLoop(totalRuns, options = {}) {
      autoRunLoop(totalRuns, options).catch((error) => {
        handleAutoRunLoopUnhandledError(error).catch(() => {});
      });
    }

    async function autoRunLoop(totalRuns, options = {}) {
      let currentRuntime = runtime.get();
      if (currentRuntime.autoRunActive) {
        await addLog('自动运行已在进行中', 'warn');
        return;
      }

      let sessionId = Number.isInteger(options.autoRunSessionId) && options.autoRunSessionId > 0
        ? options.autoRunSessionId
        : 0;
      if (sessionId) {
        throwIfAutoRunSessionStopped(sessionId);
      } else {
        sessionId = createAutoRunSessionId();
      }

      clearStopRequest();
      runtime.set({
        autoRunActive: true,
        autoRunTotalRuns: totalRuns,
        autoRunCurrentRun: 0,
        autoRunAttemptRun: 0,
        autoRunSessionId: sessionId,
      });
      currentRuntime = runtime.get();

      const autoRunSkipFailures = Boolean(options.autoRunSkipFailures);
      const initialMode = options.mode === 'continue' ? 'continue' : 'restart';
      const resumeCurrentRun = Number.isInteger(options.resumeCurrentRun) && options.resumeCurrentRun > 0
        ? Math.min(totalRuns, options.resumeCurrentRun)
        : 1;
      const resumeAttemptRun = Number.isInteger(options.resumeAttemptRun) && options.resumeAttemptRun > 0
        ? Math.min(AUTO_RUN_MAX_RETRIES_PER_ROUND + 1, options.resumeAttemptRun)
        : 1;
      let continueCurrentOnFirstAttempt = initialMode === 'continue';
      let forceFreshTabsNextRun = false;
      let stoppedEarly = false;
      let parkedByTimer = false;
      const roundSummaries = buildAutoRunRoundSummaries(totalRuns, options.resumeRoundSummaries);

      if (continueCurrentOnFirstAttempt && resumeCurrentRun > 1) {
        for (let round = 1; round < resumeCurrentRun; round += 1) {
          const summary = roundSummaries[round - 1];
          if (summary.status === 'pending') {
            summary.status = 'success';
            if (!summary.attempts) {
              summary.attempts = 1;
            }
          }
        }
      }

      let successfulRuns = roundSummaries.filter((item) => item.status === 'success').length;
      const initialState = await getState();
      const initialPhase = continueCurrentOnFirstAttempt && getRunningSteps(initialState.stepStatuses, initialState).length
        ? 'waiting_step'
        : 'running';
      const showResumePosition = continueCurrentOnFirstAttempt || resumeCurrentRun > 1 || resumeAttemptRun > 1;

      await setState({
        autoRunSessionId: sessionId,
        autoRunSkipFailures,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
        ...getAutoRunStatusPayload(initialPhase, {
          currentRun: showResumePosition ? resumeCurrentRun : 0,
          totalRuns,
          attemptRun: showResumePosition ? resumeAttemptRun : 0,
          sessionId,
        }),
      });

      for (let targetRun = resumeCurrentRun; targetRun <= totalRuns; targetRun += 1) {
        const roundSummary = roundSummaries[targetRun - 1];
        let roundRecordAppended = false;
        const resumingCurrentRound = continueCurrentOnFirstAttempt && targetRun === resumeCurrentRun;
        let attemptRun = resumingCurrentRound ? resumeAttemptRun : 1;
        let reuseExistingProgress = resumingCurrentRound;
        const currentRoundState = await getState();
        const keepSameEmailUntilAddPhone = autoRunSkipFailures && shouldKeepCustomMailProviderPoolEmail(currentRoundState);
        const maxAttemptsForRound = autoRunSkipFailures
          ? (keepSameEmailUntilAddPhone ? Number.MAX_SAFE_INTEGER : AUTO_RUN_MAX_RETRIES_PER_ROUND + 1)
          : Math.max(1, attemptRun);

        while (attemptRun <= maxAttemptsForRound) {
          runtime.set({
            autoRunCurrentRun: targetRun,
            autoRunAttemptRun: attemptRun,
          });
          roundSummary.attempts = attemptRun;
          let startStep = 1;
          let useExistingProgress = false;

          if (reuseExistingProgress) {
            let currentState = await getState();
            if (getRunningSteps(currentState.stepStatuses, currentState).length) {
              currentState = await waitForRunningStepsToFinish({
                currentRun: targetRun,
                totalRuns,
                attemptRun,
              });
            }
            const resumeStep = getFirstUnfinishedStep(currentState.stepStatuses, currentState);
            if (resumeStep && hasSavedProgress(currentState.stepStatuses, currentState)) {
              startStep = resumeStep;
              useExistingProgress = true;
            } else if (hasSavedProgress(currentState.stepStatuses, currentState)) {
              await addLog('检测到当前流程已处理完成，本轮将改为从步骤 1 重新开始。', 'info');
            }
          }

          if (!useExistingProgress) {
            const prevState = await getState();
            const keepSettings = {
              vpsUrl: prevState.vpsUrl,
              vpsPassword: prevState.vpsPassword,
              customPassword: prevState.customPassword,
              plusModeEnabled: prevState.plusModeEnabled,
              paypalEmail: prevState.paypalEmail,
              paypalPassword: prevState.paypalPassword,
              autoRunSkipFailures: prevState.autoRunSkipFailures,
              autoRunFallbackThreadIntervalMinutes: prevState.autoRunFallbackThreadIntervalMinutes,
              autoRunDelayEnabled: prevState.autoRunDelayEnabled,
              autoRunDelayMinutes: prevState.autoRunDelayMinutes,
              autoStepDelaySeconds: prevState.autoStepDelaySeconds,
              mailProvider: prevState.mailProvider,
              emailGenerator: prevState.emailGenerator,
              gmailBaseEmail: prevState.gmailBaseEmail,
              mail2925BaseEmail: prevState.mail2925BaseEmail,
              currentMail2925AccountId: prevState.currentMail2925AccountId,
              emailPrefix: prevState.emailPrefix,
              inbucketHost: prevState.inbucketHost,
              inbucketMailbox: prevState.inbucketMailbox,
              cloudflareDomain: prevState.cloudflareDomain,
              cloudflareDomains: prevState.cloudflareDomains,
              autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
              autoRunSessionId: sessionId,
              tabRegistry: {},
              sourceLastUrls: {},
              ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun, sessionId }),
            };
            await resetState();
            await setState(keepSettings);
            deps.chrome.runtime.sendMessage({ type: 'AUTO_RUN_RESET' }).catch(() => { });
            await sleepWithStop(500);
          } else {
            await setState({
              autoRunSessionId: sessionId,
              autoRunSkipFailures,
              autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
              ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun, sessionId }),
            });
          }

          if (forceFreshTabsNextRun) {
            await addLog(`上一轮尝试已放弃，当前开始第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试。`, 'warn');
            forceFreshTabsNextRun = false;
          }

          const appendRoundRecordIfNeeded = async (status, reason = '') => {
            if (roundRecordAppended) {
              return;
            }

            if (typeof appendAccountRunRecord !== 'function') {
              return;
            }

            const record = await appendAccountRunRecord(status, null, reason);
            if (record) {
              roundRecordAppended = true;
            }
          };

          try {
            throwIfAutoRunSessionStopped(sessionId);
            await broadcastAutoRunStatus('running', {
              currentRun: targetRun,
              totalRuns,
              attemptRun,
              sessionId,
            });

            if (!useExistingProgress && startStep === 1 && typeof ensureHotmailMailboxReadyForAutoRunRound === 'function') {
              await ensureHotmailMailboxReadyForAutoRunRound({
                targetRun,
                totalRuns,
                attemptRun,
                sessionId,
              });
            }

            await runAutoSequenceFromStep(startStep, {
              targetRun,
              totalRuns,
              attemptRuns: attemptRun,
              continued: useExistingProgress,
            });

            roundSummary.status = 'success';
            roundSummary.finalFailureReason = '';
            successfulRuns += 1;
            await setState({
              autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
            });
            await addLog(`=== 第 ${targetRun}/${totalRuns} 轮完成（第 ${attemptRun} 次尝试成功）===`, 'ok');
            break;
          } catch (err) {
            if (isStopError(err)) {
              stoppedEarly = true;
              await appendRoundRecordIfNeeded('stopped', getErrorMessage(err));
              await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
              await broadcastAutoRunStatus('stopped', {
                currentRun: targetRun,
                totalRuns,
                attemptRun,
                sessionId: 0,
              });
              break;
            }

            const reason = getErrorMessage(err);
            roundSummary.failureReasons.push(reason);
            const blockedByAddPhone = typeof isAddPhoneAuthFailure === 'function' && isAddPhoneAuthFailure(err);
            const blockedBySignupUserAlreadyExists = typeof isSignupUserAlreadyExistsFailure === 'function'
              && !keepSameEmailUntilAddPhone
              && isSignupUserAlreadyExistsFailure(err);
            const canRetry = !blockedByAddPhone && !blockedBySignupUserAlreadyExists && autoRunSkipFailures && attemptRun < maxAttemptsForRound;

            await setState({
              autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
            });

            if (blockedByAddPhone) {
              roundSummary.status = 'failed';
              roundSummary.finalFailureReason = reason;
              await setState({
                autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
              });
              await appendRoundRecordIfNeeded('failed', reason);
              cancelPendingCommands('当前轮因认证流程进入 add-phone 已终止。');
              await broadcastStopToContentScripts();
              if (!autoRunSkipFailures) {
                await addLog(
                  `第 ${targetRun}/${totalRuns} 轮触发 add-phone/手机号页，自动重试未开启，当前自动运行将停止。`,
                  'warn'
                );
                stoppedEarly = true;
                await broadcastAutoRunStatus('stopped', {
                  currentRun: targetRun,
                  totalRuns,
                  attemptRun,
                  sessionId: 0,
                });
                break;
              }

              await addLog(`第 ${targetRun}/${totalRuns} 轮触发 add-phone/手机号页，本轮将直接失败并跳过剩余重试。`, 'warn');
              await addLog(
                targetRun < totalRuns
                  ? `第 ${targetRun}/${totalRuns} 轮因 add-phone/手机号页提前结束，自动流程将继续下一轮。`
                  : `第 ${targetRun}/${totalRuns} 轮因 add-phone/手机号页提前结束，已无后续轮次，本次自动运行结束。`,
                'warn'
              );
              forceFreshTabsNextRun = true;
              break;
            }

            if (blockedBySignupUserAlreadyExists) {
              roundSummary.status = 'failed';
              roundSummary.finalFailureReason = reason;
              await setState({
                autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
              });
              await appendRoundRecordIfNeeded('failed', reason);
              cancelPendingCommands('当前轮因 user_already_exists 已终止。');
              await broadcastStopToContentScripts();
              if (!autoRunSkipFailures) {
                await addLog(
                  `第 ${targetRun}/${totalRuns} 轮触发 user_already_exists/用户已存在，自动重试未开启，当前自动运行将停止。`,
                  'warn'
                );
                stoppedEarly = true;
                await broadcastAutoRunStatus('stopped', {
                  currentRun: targetRun,
                  totalRuns,
                  attemptRun,
                  sessionId: 0,
                });
                break;
              }

              await addLog(`第 ${targetRun}/${totalRuns} 轮触发 user_already_exists/用户已存在，本轮将直接失败并跳过剩余重试。`, 'warn');
              await addLog(
                targetRun < totalRuns
                  ? `第 ${targetRun}/${totalRuns} 轮因 user_already_exists/用户已存在提前结束，自动流程将继续下一轮。`
                  : `第 ${targetRun}/${totalRuns} 轮因 user_already_exists/用户已存在提前结束，已无后续轮次，本次自动运行结束。`,
                'warn'
              );
              forceFreshTabsNextRun = true;
              break;
            }

            if (canRetry) {
              const retryIndex = attemptRun;
              if (isRestartCurrentAttemptError(err)) {
                await addLog(`第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试需要整轮重开：${reason}`, 'warn');
              } else {
                await addLog(`第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试失败：${reason}`, 'error');
              }
              cancelPendingCommands('当前尝试已放弃。');
              await broadcastStopToContentScripts();
              await broadcastAutoRunStatus('retrying', {
                currentRun: targetRun,
                totalRuns,
                attemptRun,
                sessionId,
              });
              forceFreshTabsNextRun = true;
              await addLog(
                keepSameEmailUntilAddPhone
                  ? `自动重试：${Math.round(AUTO_RUN_RETRY_DELAY_MS / 1000)} 秒后继续使用当前邮箱，开始第 ${targetRun}/${totalRuns} 轮第 ${attemptRun + 1} 次尝试。`
                  : `自动重试：${Math.round(AUTO_RUN_RETRY_DELAY_MS / 1000)} 秒后开始第 ${targetRun}/${totalRuns} 轮第 ${attemptRun + 1} 次尝试（第 ${retryIndex}/${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试）。`,
                'warn'
              );
              try {
                await sleepWithStop(AUTO_RUN_RETRY_DELAY_MS);
              } catch (sleepError) {
                if (isStopError(sleepError)) {
                  stoppedEarly = true;
                  await appendRoundRecordIfNeeded('stopped', getErrorMessage(sleepError));
                  await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
                  await broadcastAutoRunStatus('stopped', {
                    currentRun: targetRun,
                    totalRuns,
                    attemptRun,
                    sessionId: 0,
                  });
                  break;
                }
                throw sleepError;
              }
              try {
                const parkedForRetry = await waitBeforeAutoRunRetry(targetRun, totalRuns, attemptRun + 1, {
                  autoRunSkipFailures,
                  roundSummaries,
                });
                if (parkedForRetry) {
                  parkedByTimer = true;
                  break;
                }
              } catch (sleepError) {
                if (isStopError(sleepError)) {
                  stoppedEarly = true;
                  await appendRoundRecordIfNeeded('stopped', getErrorMessage(sleepError));
                  await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
                  await broadcastAutoRunStatus('stopped', {
                    currentRun: targetRun,
                    totalRuns,
                    attemptRun,
                    sessionId: 0,
                  });
                  break;
                }
                throw sleepError;
              }
              attemptRun += 1;
              reuseExistingProgress = false;
              continue;
            }

            roundSummary.status = 'failed';
            roundSummary.finalFailureReason = reason;
            await setState({
              autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
            });
            await appendRoundRecordIfNeeded('failed', reason);
            if (!autoRunSkipFailures) {
              cancelPendingCommands('当前轮执行失败。');
              await broadcastStopToContentScripts();
              await addLog('自动重试未开启，自动运行将在当前失败后停止。', 'warn');
              stoppedEarly = true;
              await broadcastAutoRunStatus('stopped', {
                currentRun: targetRun,
                totalRuns,
                attemptRun,
                sessionId: 0,
              });
              break;
            }
            await addLog(`第 ${targetRun}/${totalRuns} 轮最终失败：${reason}`, 'error');
            await addLog(
              targetRun < totalRuns
                ? `第 ${targetRun}/${totalRuns} 轮已达到 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试上限，继续下一轮。`
                : `第 ${targetRun}/${totalRuns} 轮已达到 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试上限，本次自动运行结束。`,
              'warn'
            );
            cancelPendingCommands('当前轮已达到重试上限。');
            await broadcastStopToContentScripts();
            forceFreshTabsNextRun = true;
            break;
          } finally {
            reuseExistingProgress = false;
            continueCurrentOnFirstAttempt = false;
          }
        }

        if (stoppedEarly || parkedByTimer) {
          break;
        }

        try {
          const parkedForNextRound = await waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, {
            autoRunSkipFailures,
            roundSummaries,
          });
          if (parkedForNextRound) {
            parkedByTimer = true;
            break;
          }
        } catch (sleepError) {
          if (isStopError(sleepError)) {
            stoppedEarly = true;
            await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
            await broadcastAutoRunStatus('stopped', {
              currentRun: targetRun,
              totalRuns,
              attemptRun: runtime.get().autoRunAttemptRun,
              sessionId: 0,
            });
            break;
          }
          throw sleepError;
        }
      }

      if (parkedByTimer) {
        runtime.set({ autoRunActive: false });
        clearStopRequest();
        return;
      }

      await setState({
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
      });
      await logAutoRunFinalSummary(totalRuns, roundSummaries);

      const finalRuntime = runtime.get();
      if (deps.getStopRequested() || stoppedEarly) {
        await addLog(`=== 已停止，完成 ${successfulRuns}/${finalRuntime.autoRunTotalRuns} 轮 ===`, 'warn');
        await broadcastAutoRunStatus('stopped', {
          currentRun: finalRuntime.autoRunCurrentRun,
          totalRuns: finalRuntime.autoRunTotalRuns,
          attemptRun: finalRuntime.autoRunAttemptRun,
          sessionId: 0,
        });
      } else {
        await addLog(`=== 全部 ${finalRuntime.autoRunTotalRuns} 轮已执行完成，成功 ${successfulRuns} 轮 ===`, 'ok');
        await broadcastAutoRunStatus('complete', {
          currentRun: finalRuntime.autoRunTotalRuns,
          totalRuns: finalRuntime.autoRunTotalRuns,
          attemptRun: finalRuntime.autoRunAttemptRun,
          sessionId: 0,
        });
      }
      runtime.set({ autoRunActive: false, autoRunSessionId: 0 });
      const afterRuntime = runtime.get();
      await setState({
        autoRunSessionId: 0,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
        ...getAutoRunStatusPayload(deps.getStopRequested() || stoppedEarly ? 'stopped' : 'complete', {
          currentRun: deps.getStopRequested() || stoppedEarly ? afterRuntime.autoRunCurrentRun : afterRuntime.autoRunTotalRuns,
          totalRuns: afterRuntime.autoRunTotalRuns,
          attemptRun: afterRuntime.autoRunAttemptRun,
          sessionId: 0,
        }),
      });
      clearStopRequest();
    }

    return {
      autoRunLoop,
      buildAutoRunRoundSummaries,
      createAutoRunRoundSummary,
      formatAutoRunFailureReasons,
      getAutoRunRoundRetryCount,
      handleAutoRunLoopUnhandledError,
      logAutoRunFinalSummary,
      normalizeAutoRunRoundSummary,
      serializeAutoRunRoundSummaries,
      skipAutoRunCountdown,
      startAutoRunLoop,
      waitBetweenAutoRunRounds,
      waitBeforeAutoRunRetry,
    };
  }

  return {
    createAutoRunController,
  };
});
