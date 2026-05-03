const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const backgroundSource = fs.readFileSync('background.js', 'utf8');
const step8Source = fs.readFileSync('background/steps/fetch-login-code.js', 'utf8');
const step8GlobalScope = {};
const step8Api = new Function('self', `${step8Source}; return self.MultiPageBackgroundStep8;`)(step8GlobalScope);

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('ensureStep8VerificationPageReady throws explicit restart-step7 error on login timeout page', async () => {
  const api = new Function(`
function getLoginAuthStateLabel(state) {
  return state === 'login_timeout_error_page' ? 'login timeout page' : 'unknown page';
}

async function getLoginAuthStateFromContent() {
  return {
    state: 'login_timeout_error_page',
    url: 'https://auth.openai.com/log-in',
  };
}

${extractFunction(backgroundSource, 'ensureStep8VerificationPageReady')}

return {
  run() {
    return ensureStep8VerificationPageReady({});
  },
};
`)();

  await assert.rejects(
    () => api.run(),
    /STEP8_RESTART_STEP7::/
  );
});

test('ensureStep8VerificationPageReady throws cloudflare security block error on max_check_attempts page', async () => {
  const api = new Function(`
const CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX = 'CF_SECURITY_BLOCKED::';
const CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE = 'cloudflare blocked';

function getLoginAuthStateLabel(state) {
  return state === 'login_timeout_error_page' ? 'login timeout page' : 'unknown page';
}

async function getLoginAuthStateFromContent() {
  return {
    state: 'login_timeout_error_page',
    url: 'https://auth.openai.com/log-in',
    maxCheckAttemptsBlocked: true,
  };
}

${extractFunction(backgroundSource, 'ensureStep8VerificationPageReady')}

return {
  run() {
    return ensureStep8VerificationPageReady({});
  },
};
`)();

  await assert.rejects(
    () => api.run(),
    /CF_SECURITY_BLOCKED::/
  );
});

test('step 8 reruns step 7 when auth page enters login timeout retry state', async () => {
  const calls = {
    rerunStep7: 0,
    ensureReady: 0,
    logs: [],
    rerunOptions: [],
    resolveCalls: 0,
  };

  const executor = step8Api.createStep8Executor({
    addLog: async (message, level) => {
      calls.logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    confirmCustomVerificationStepBypass: async () => {},
    ensureStep8VerificationPageReady: async () => {
      calls.ensureReady += 1;
      if (calls.ensureReady === 1) {
        throw new Error('STEP8_RESTART_STEP7::step 8 timeout retry page');
      }
      return { state: 'verification_page' };
    },
    rerunStep7ForStep8Recovery: async (options) => {
      calls.rerunStep7 += 1;
      calls.rerunOptions.push(options || null);
    },
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ mail',
      source: 'mail-qq',
      url: 'https://mail.qq.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret', oauthUrl: 'https://oauth.example/latest' }),
    getTabId: async () => 1,
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async () => {
      calls.resolveCalls += 1;
    },
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    setStepStatus: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
  });

  await executor.executeStep8({
    email: 'user@example.com',
    password: 'secret',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.equal(calls.rerunStep7, 1);
  assert.equal(calls.ensureReady, 2);
  assert.equal(calls.resolveCalls, 1);
  assert.equal(calls.logs.some(({ message }) => /重新开始|重新发起/.test(message)), true);
  assert.deepStrictEqual(calls.rerunOptions, [
    {
      logMessage: '认证页进入重试/超时报错状态，正在回到步骤 7 重新发起登录流程...',
      logStep: 8,
      logStepKey: 'fetch-login-code',
    },
  ]);
});

test('step 8 escalates to rerun step 7 after too many local retry_without_step7 recoveries', async () => {
  const calls = {
    rerunStep7: 0,
    ensureReady: 0,
    logs: [],
  };

  const executor = step8Api.createStep8Executor({
    addLog: async (message, level) => {
      calls.logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {},
    ensureStep8VerificationPageReady: async () => {
      calls.ensureReady += 1;
      return { state: 'verification_page' };
    },
    rerunStep7ForStep8Recovery: async () => {
      calls.rerunStep7 += 1;
      throw new Error('RERUN_MARKER');
    },
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      provider: 'qq',
      label: 'QQ mail',
      source: 'mail-qq',
      url: 'https://mail.qq.com',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret', oauthUrl: 'https://oauth.example/latest' }),
    getTabId: async () => 1,
    HOTMAIL_PROVIDER: 'hotmail-api',
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => true,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    resolveVerificationStep: async () => {
      throw new Error('Content script on icloud-mail did not respond in 1s. Try refreshing the tab and retry.');
    },
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    shouldUseCustomRegistrationEmail: () => false,
    sleepWithStop: async () => {},
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
    }),
    /RERUN_MARKER/
  );

  assert.equal(calls.rerunStep7, 1);
  assert.equal(calls.ensureReady >= 4, true);
  assert.equal(
    calls.logs.some(({ message }) => /连续重试 \d+ 次，改为回到步骤 7/.test(message)),
    true
  );
});
