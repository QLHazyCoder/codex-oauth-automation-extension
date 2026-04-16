(function attachBackgroundLoggingStatus(root, factory) {
  root.MultiPageBackgroundLoggingStatus = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundLoggingStatusModule() {
  function createLoggingStatus(deps = {}) {
    const {
      chrome,
      DEFAULT_STATE,
      getState,
      isRecoverableStep9AuthFailure,
      LOG_PREFIX,
      setState,
      STOP_ERROR_MESSAGE,
    } = deps;

    function getSourceLabel(source) {
      const labels = {
        'gmail-mail': 'Gmail 邮箱',
        'sidepanel': '侧边栏',
        'signup-page': '认证页',
        'vps-panel': 'CPA 面板',
        'sub2api-panel': 'SUB2API 后台',
        'qq-mail': 'QQ 邮箱',
        'mail-163': '163 邮箱',
        'mail-2925': '2925 邮箱',
        'inbucket-mail': 'Inbucket 邮箱',
        'duck-mail': 'Duck 邮箱',
        'hotmail-api': 'Hotmail（API对接/本地助手）',
        'luckmail-api': 'LuckMail（API 购邮）',
        'cloudflare-temp-email': 'Cloudflare Temp Email',
      };
      return labels[source] || source || '未知来源';
    }

    async function addLog(message, level = 'info') {
      const state = await getState();
      const logs = state.logs || [];
      const entry = { message, level, timestamp: Date.now() };
      logs.push(entry);
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      await setState({ logs });
      chrome.runtime.sendMessage({ type: 'LOG_ENTRY', payload: entry }).catch(() => { });
    }

    async function setStepStatus(step, status) {
      const state = await getState();
      const statuses = { ...state.stepStatuses };
      statuses[step] = status;
      await setState({ stepStatuses: statuses, currentStep: step });
      chrome.runtime.sendMessage({
        type: 'STEP_STATUS_CHANGED',
        payload: { step, status },
      }).catch(() => { });
    }

    function getErrorMessage(error) {
      return String(typeof error === 'string' ? error : error?.message || '');
    }

    function isVerificationMailPollingError(error) {
      const message = getErrorMessage(error);
      return /未在 .*邮箱中找到新的匹配邮件|未在 Hotmail 收件箱中找到新的匹配验证码|邮箱轮询结束，但未获取到验证码|无法获取新的(?:注册|登录)验证码|页面未能重新就绪|页面通信异常|did not respond in \d+s/i.test(message);
    }

    function getLoginAuthStateLabel(state) {
      state = state === 'oauth_consent_page' ? 'unknown' : state;
      switch (state) {
        case 'verification_page':
          return '登录验证码页';
        case 'password_page':
          return '密码页';
        case 'email_page':
          return '邮箱输入页';
        case 'login_timeout_error_page':
          return '登录超时报错页';
        case 'oauth_consent_page':
          return 'OAuth 授权页';
        case 'add_phone_page':
          return '手机号页';
        default:
          return '未知页面';
      }
    }

    function isRestartCurrentAttemptError(error) {
      const message = String(typeof error === 'string' ? error : error?.message || '');
      return /当前邮箱已存在，需要重新开始新一轮/.test(message);
    }

    function isStep9RecoverableAuthError(error) {
      const message = String(typeof error === 'string' ? error : error?.message || '');
      return /STEP9_OAUTH_RETRY::/i.test(message)
        || isRecoverableStep9AuthFailure(message);
    }

    function isLegacyStep9RecoverableAuthError(error) {
      const message = String(typeof error === 'string' ? error : error?.message || '');
      return /STEP9_OAUTH_TIMEOUT::|认证失败:\s*(?:Timeout waiting for OAuth callback|timeout of \d+ms exceeded)/i.test(message);
    }

    function isStepDoneStatus(status) {
      return status === 'completed' || status === 'manual_completed' || status === 'skipped';
    }

    function getFirstUnfinishedStep(statuses = {}) {
      for (let step = 1; step <= 9; step++) {
        if (!isStepDoneStatus(statuses[step] || 'pending')) {
          return step;
        }
      }
      return null;
    }

    function hasSavedProgress(statuses = {}) {
      return Object.values({ ...DEFAULT_STATE.stepStatuses, ...statuses }).some((status) => status !== 'pending');
    }

    function getRunningSteps(statuses = {}) {
      return Object.entries({ ...DEFAULT_STATE.stepStatuses, ...statuses })
        .filter(([, status]) => status === 'running')
        .map(([step]) => Number(step))
        .sort((a, b) => a - b);
    }

    function getAutoRunStatusPayload(phase, payload = {}) {
      return {
        autoRunning: phase === 'scheduled'
          || phase === 'running'
          || phase === 'waiting_step'
          || phase === 'waiting_email'
          || phase === 'retrying'
          || phase === 'waiting_interval',
        autoRunPhase: phase,
        autoRunCurrentRun: payload.currentRun ?? 0,
        autoRunTotalRuns: payload.totalRuns ?? 1,
        autoRunAttemptRun: payload.attemptRun ?? 0,
        scheduledAutoRunAt: Number.isFinite(Number(payload.scheduledAt)) ? Number(payload.scheduledAt) : null,
        autoRunCountdownAt: Number.isFinite(Number(payload.countdownAt)) ? Number(payload.countdownAt) : null,
        autoRunCountdownTitle: payload.countdownTitle === undefined ? '' : String(payload.countdownTitle || ''),
        autoRunCountdownNote: payload.countdownNote === undefined ? '' : String(payload.countdownNote || ''),
      };
    }

    return {
      addLog,
      getAutoRunStatusPayload,
      getErrorMessage,
      getFirstUnfinishedStep,
      getLoginAuthStateLabel,
      getRunningSteps,
      getSourceLabel,
      hasSavedProgress,
      isLegacyStep9RecoverableAuthError,
      isRestartCurrentAttemptError,
      isStep9RecoverableAuthError,
      isStepDoneStatus,
      isVerificationMailPollingError,
      setStepStatus,
    };
  }

  return {
    createLoggingStatus,
  };
});
