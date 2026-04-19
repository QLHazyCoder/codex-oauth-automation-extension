const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
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

// 回归 commit 2a/2b：当主循环决定回到 step 2 时，resetSignupSessionForRestart 必须
//   - 清 auth.openai.com / auth0.openai.com / accounts.openai.com / chatgpt.com / chat.openai.com 的 cookie + storage
//   - 关闭现有 signup-page tab
//   - 清掉 pendingStep3PasswordStage session key
async function testResetSignupSessionForRestartClearsCookiesAndTab() {
  const api = new Function(`
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const LOG_PREFIX = '[test]';
const browsingDataCalls = [];
const removedTabs = [];
const logs = [];
const removedSessionKeys = [];
let tabRegistry = { 'signup-page': { tabId: 777 } };

const chrome = {
  browsingData: {
    async remove(options, types) {
      browsingDataCalls.push({ options, types });
    },
  },
  tabs: {
    async remove(tabId) {
      removedTabs.push(tabId);
    },
  },
  storage: {
    session: {
      async remove(key) {
        removedSessionKeys.push(key);
      },
    },
  },
};

async function addLog(message, level) { logs.push({ message, level }); }
async function getTabId(source) {
  return tabRegistry[source]?.tabId || null;
}
async function getTabRegistry() { return { ...tabRegistry }; }
async function setState(partial) {
  if (partial.tabRegistry) {
    tabRegistry = { ...partial.tabRegistry };
  }
}
function getErrorMessage(error) { return error?.message || String(error); }

${extractFunction('resetSignupSessionForRestart')}

return {
  resetSignupSessionForRestart,
  getBrowsingDataCalls() { return [...browsingDataCalls]; },
  getRemovedTabs() { return [...removedTabs]; },
  getRemovedSessionKeys() { return [...removedSessionKeys]; },
  getLogs() { return [...logs]; },
  getTabRegistry() { return { ...tabRegistry }; },
};
`)();

  await api.resetSignupSessionForRestart('测试调用');

  const browsingCalls = api.getBrowsingDataCalls();
  assert.equal(browsingCalls.length, 1, '必须调用 browsingData.remove 恰好一次');
  assert.ok(
    browsingCalls[0].options.origins.includes('https://auth.openai.com'),
    '必须清 auth.openai.com'
  );
  assert.ok(
    browsingCalls[0].options.origins.includes('https://chatgpt.com'),
    '必须清 chatgpt.com（影响登录态）'
  );
  assert.equal(browsingCalls[0].types.cookies, true, '必须清 cookies');
  assert.equal(browsingCalls[0].types.localStorage, true, '必须清 localStorage');

  assert.deepStrictEqual(
    api.getRemovedTabs(),
    [777],
    '必须关闭现有的 signup-page tab（id=777）'
  );

  assert.equal(
    api.getTabRegistry()['signup-page'],
    null,
    '关闭 tab 后 registry 的 signup-page 必须置 null'
  );

  assert.ok(
    api.getRemovedSessionKeys().includes(STEP3_PENDING_PASSWORD_STAGE_KEY_PUBLIC()),
    '必须兜底清 pendingStep3PasswordStage 防止旧恢复链重入'
  );
}

// 回归 commit 2a 兜底分支：当环境没有 chrome.browsingData 时不能抛错，
// 应该走降级分支继续关 tab + 清 pending key。
async function testResetSignupSessionForRestartTolerantWhenBrowsingDataMissing() {
  const api = new Function(`
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
const LOG_PREFIX = '[test]';
const removedTabs = [];
const logs = [];
const removedSessionKeys = [];
let tabRegistry = { 'signup-page': { tabId: 42 } };

const chrome = {
  // browsingData 缺失
  tabs: {
    async remove(tabId) {
      removedTabs.push(tabId);
    },
  },
  storage: {
    session: {
      async remove(key) {
        removedSessionKeys.push(key);
      },
    },
  },
};

async function addLog(message, level) { logs.push({ message, level }); }
async function getTabId(source) { return tabRegistry[source]?.tabId || null; }
async function getTabRegistry() { return { ...tabRegistry }; }
async function setState(partial) {
  if (partial.tabRegistry) tabRegistry = { ...partial.tabRegistry };
}
function getErrorMessage(error) { return error?.message || String(error); }

${extractFunction('resetSignupSessionForRestart')}

return {
  resetSignupSessionForRestart,
  getRemovedTabs() { return [...removedTabs]; },
  getRemovedSessionKeys() { return [...removedSessionKeys]; },
  getLogs() { return [...logs]; },
};
`)();

  let thrown = null;
  try {
    await api.resetSignupSessionForRestart('降级测试');
  } catch (error) {
    thrown = error;
  }

  assert.equal(thrown, null, '环境缺 browsingData 不应抛错');
  assert.deepStrictEqual(api.getRemovedTabs(), [42], '仍然需要关闭 tab');
  assert.ok(
    api.getRemovedSessionKeys().includes('pendingStep3PasswordStage'),
    '仍然需要清 pending key'
  );
  assert.ok(
    api.getLogs().some((entry) => /没有 chrome\.browsingData/.test(entry.message)),
    '应记录一条 warn 级日志提示降级'
  );
}

function STEP3_PENDING_PASSWORD_STAGE_KEY_PUBLIC() {
  return 'pendingStep3PasswordStage';
}

// 回归 commit 3：markStep2ForceFreshSignup 写 session key；consumeStep2ForceFreshSignup
// 读出后立即清除。两者配合让「step 2 强制新起点」只生效一次，不会干扰后续常规运行。
async function testForceFreshSignupMarkerRoundTrip() {
  const api = new Function(`
const LOG_PREFIX = '[test]';
const STEP2_FORCE_FRESH_SIGNUP_KEY = 'forceFreshSignupForNextStep2';
let store = {};

const chrome = {
  storage: {
    session: {
      async set(obj) {
        store = { ...store, ...obj };
      },
      async get(key) {
        if (typeof key === 'string') {
          return { [key]: store[key] };
        }
        return { ...store };
      },
      async remove(key) {
        delete store[key];
      },
    },
  },
};

${extractFunction('markStep2ForceFreshSignup')}
${extractFunction('consumeStep2ForceFreshSignup')}

return {
  markStep2ForceFreshSignup,
  consumeStep2ForceFreshSignup,
  getStore() { return { ...store }; },
};
`)();

  assert.equal(
    await api.consumeStep2ForceFreshSignup(),
    false,
    '未 mark 时 consume 必须返回 false'
  );

  await api.markStep2ForceFreshSignup();
  assert.equal(
    api.getStore().forceFreshSignupForNextStep2,
    true,
    'mark 后 session 里必须存在 forceFreshSignupForNextStep2=true'
  );

  assert.equal(
    await api.consumeStep2ForceFreshSignup(),
    true,
    '首次 consume 必须返回 true'
  );
  assert.equal(
    'forceFreshSignupForNextStep2' in api.getStore(),
    false,
    'consume 之后 session key 必须被清除，防止下一次 step 2 被错误强制'
  );

  assert.equal(
    await api.consumeStep2ForceFreshSignup(),
    false,
    '第二次 consume 必须返回 false（一次性标记）'
  );
}

(async () => {
  await testResetSignupSessionForRestartClearsCookiesAndTab();
  await testResetSignupSessionForRestartTolerantWhenBrowsingDataMissing();
  await testForceFreshSignupMarkerRoundTrip();
  console.log('signup session restart regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
