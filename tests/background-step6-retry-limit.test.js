const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step 6 runs cookie cleanup and completes from background', async () => {
  const source = fs.readFileSync('background/steps/clear-login-cookies.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep6;`)(globalScope);

  const events = {
    cleanupCalls: 0,
    completedSteps: [],
  };

  const executor = api.createStep6Executor({
    completeStepFromBackground: async (step) => {
      events.completedSteps.push(step);
    },
    runPreStep6CookieCleanup: async () => {
      events.cleanupCalls += 1;
    },
  });

  await executor.executeStep6();

  assert.equal(events.cleanupCalls, 1);
  assert.deepStrictEqual(events.completedSteps, [6]);
});

test('step 7 retries up to configured limit and then fails', async () => {
  const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

  const events = {
    refreshCalls: 0,
    sendCalls: 0,
    completed: 0,
  };

  const executor = api.createStep7Executor({
    addLog: async () => {},
    completeStepFromBackground: async () => {
      events.completed += 1;
    },
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    refreshOAuthUrlBeforeStep6: async () => {
      events.refreshCalls += 1;
      return `https://oauth.example/${events.refreshCalls}`;
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => {
      events.sendCalls += 1;
      return {
        step6Outcome: 'recoverable',
        state: 'email_page',
        message: '当前仍停留在邮箱页。',
      };
    },
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep7({ email: 'user@example.com', password: 'secret' }),
    /已重试 2 次，仍未成功/
  );

  assert.equal(events.refreshCalls, 3);
  assert.equal(events.sendCalls, 3);
  assert.equal(events.completed, 0);
});

test('step 7 exits internal retry loop immediately when add-phone is detected', async () => {
  const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

  const events = {
    refreshCalls: 0,
    sendCalls: 0,
    completed: 0,
    logs: [],
  };

  const executor = api.createStep7Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    completeStepFromBackground: async () => {
      events.completed += 1;
    },
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    refreshOAuthUrlBeforeStep6: async () => {
      events.refreshCalls += 1;
      return `https://oauth.example/${events.refreshCalls}`;
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => {
      events.sendCalls += 1;
      throw new Error('提交密码后页面直接进入手机号页面，未经过登录验证码页。URL: https://auth.openai.com/add-phone');
    },
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep7({ email: 'user@example.com', password: 'secret' }),
    /add-phone/
  );

  assert.equal(events.refreshCalls, 1, 'add-phone should stop further OAuth refresh attempts');
  assert.equal(events.sendCalls, 1, 'add-phone should stop after the first failed login attempt');
  assert.equal(events.completed, 0);
  assert.ok(
    !events.logs.some(({ message }) => /准备重试/.test(message)),
    'add-phone failure should not be logged as an internal retryable attempt'
  );
});

test('step 7 starts a new oauth timeout window for each refreshed oauth url', async () => {
  const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

  const events = {
    startedWindows: [],
    timeoutRequests: [],
  };

  const executor = api.createStep7Executor({
    addLog: async () => {},
    completeStepFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs, options) => {
      events.timeoutRequests.push({ defaultTimeoutMs, options });
      return 5000;
    },
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    refreshOAuthUrlBeforeStep6: async () => 'https://oauth.example/latest',
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async (_source, _message, options) => ({
      step6Outcome: 'success',
      usedTimeoutMs: options.timeoutMs,
    }),
    startOAuthFlowTimeoutWindow: async (payload) => {
      events.startedWindows.push(payload);
    },
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await executor.executeStep7({ email: 'user@example.com', password: 'secret' });

  assert.deepStrictEqual(events.startedWindows, [
    { step: 7, oauthUrl: 'https://oauth.example/latest' },
  ]);
  assert.deepStrictEqual(events.timeoutRequests, [
    {
      defaultTimeoutMs: 180000,
      options: {
        step: 7,
        actionLabel: 'OAuth 登录并进入验证码页',
        oauthUrl: 'https://oauth.example/latest',
      },
    },
  ]);
});

test('step 7 stops immediately when management secret is missing', async () => {
  const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

  const events = {
    refreshCalls: 0,
    sendCalls: 0,
    logs: [],
  };

  const executor = api.createStep7Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    completeStepFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    refreshOAuthUrlBeforeStep6: async () => {
      events.refreshCalls += 1;
      throw new Error('尚未配置 Codex2API 管理密钥，请先在侧边栏填写。');
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => {
      events.sendCalls += 1;
      return { step6Outcome: 'success' };
    },
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep7({ email: 'user@example.com', password: 'secret' }),
    /管理密钥/
  );

  assert.equal(events.refreshCalls, 1);
  assert.equal(events.sendCalls, 0);
  assert.ok(events.logs.some(({ message }) => /管理密钥缺失或错误，不再重试，当前流程停止/.test(message)));
  assert.ok(!events.logs.some(({ message }) => /准备重试/.test(message)));
});

test('step 7 stops immediately when management secret is invalid', async () => {
  const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

  const events = {
    refreshCalls: 0,
    logs: [],
  };

  const executor = api.createStep7Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    completeStepFromBackground: async () => {},
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    refreshOAuthUrlBeforeStep6: async () => {
      events.refreshCalls += 1;
      throw new Error('Codex2API 请求失败（HTTP 401）。X-Admin-Key 无效或未授权。');
    },
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({ step6Outcome: 'success' }),
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep7({ email: 'user@example.com', password: 'secret' }),
    /401|未授权|无效/
  );

  assert.equal(events.refreshCalls, 1);
  assert.ok(events.logs.some(({ message }) => /管理密钥缺失或错误，不再重试，当前流程停止/.test(message)));
  assert.ok(!events.logs.some(({ message }) => /准备重试/.test(message)));
});
