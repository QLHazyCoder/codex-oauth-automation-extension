const test = require('node:test');
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

function createApi() {
  return new Function(`
const DEFAULT_SUB2API_URL = 'https://sub2api.example.com/admin/accounts';
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SUB2API_DEFAULT_CONCURRENCY = 10;
const SUB2API_DEFAULT_PRIORITY = 1;
const SUB2API_DEFAULT_RATE_MULTIPLIER = 1;

const requestCalls = [];
const logMessages = [];
const completedSteps = [];

${extractFunction('normalizeSub2ApiUrl')}
${extractFunction('normalizeSub2ApiGroupName')}
${extractFunction('normalizeSub2ApiGroupNames')}
${extractFunction('getSelectedSub2ApiGroupNames')}
${extractFunction('normalizeSub2ApiGroupRecords')}
${extractFunction('resolveSub2ApiGroups')}
${extractFunction('normalizeSub2ApiRedirectUri')}
${extractFunction('parseUrlSafely')}
${extractFunction('isLocalhostOAuthCallbackUrl')}
${extractFunction('buildDraftAccountName')}
${extractFunction('extractStateFromAuthUrl')}
${extractFunction('parseLocalhostCallback')}
${extractFunction('fetchSub2ApiGroupsWithToken')}
${extractFunction('buildSub2ApiAccountCreatePayload')}
${extractFunction('buildOpenAiCredentials')}
${extractFunction('buildOpenAiExtra')}
${extractFunction('requestSub2ApiOpenAiAuthSession')}
${extractFunction('submitSub2ApiOpenAiCallback')}
${extractFunction('executeSub2ApiStep1')}
${extractFunction('executeSub2ApiStep9')}

async function loginSub2Api(state = {}) {
  return {
    origin: 'https://sub2api.example.com',
    token: 'token-123',
  };
}

async function requestSub2ApiJson(rawUrl, path, options = {}) {
  requestCalls.push({ rawUrl, path, options });

  if (path === '/api/v1/admin/groups/all?platform=openai') {
    return [
      { id: 11, name: 'alpha', platform: 'openai' },
      { id: 22, name: 'beta', platform: 'openai' },
      { id: 33, name: 'gamma', platform: 'openai' },
    ];
  }

  if (path === '/api/v1/admin/openai/generate-auth-url') {
    return {
      auth_url: 'https://auth.openai.com/authorize?state=oauth-state-1',
      session_id: 'session-abc',
      state: 'oauth-state-1',
    };
  }

  if (path === '/api/v1/admin/openai/exchange-code') {
    return {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      id_token: 'id-token',
      expires_at: '2026-05-01T00:00:00Z',
      email: 'demo@example.com',
      name: 'Demo User',
      chatgpt_account_id: 'acct-1',
      chatgpt_user_id: 'user-1',
      organization_id: 'org-1',
      client_id: 'client-1',
    };
  }

  if (path === '/api/v1/admin/accounts') {
    return {
      id: 7788,
      name: options?.body?.name || 'unknown',
      group_ids: options?.body?.group_ids || [],
    };
  }

  throw new Error('unexpected path: ' + path);
}

async function addLog(message, level = 'info') {
  logMessages.push({ message, level });
}

async function completeStepFromBackground(step, payload = {}) {
  completedSteps.push({ step, payload });
}

return {
  requestSub2ApiOpenAiAuthSession,
  submitSub2ApiOpenAiCallback,
  executeSub2ApiStep1,
  executeSub2ApiStep9,
  snapshot() {
    return {
      requestCalls,
      logMessages,
      completedSteps,
    };
  },
};
`)();
}

test('requestSub2ApiOpenAiAuthSession uses OpenAI OAuth API and preserves selected group order', async () => {
  const api = createApi();
  const result = await api.requestSub2ApiOpenAiAuthSession({
    sub2apiUrl: 'https://sub2api.example.com/admin/accounts',
    sub2apiEmail: 'admin@example.com',
    sub2apiPassword: 'secret',
    sub2apiGroupNames: ['gamma', 'alpha'],
  });

  assert.deepEqual(
    result,
    {
      oauthUrl: 'https://auth.openai.com/authorize?state=oauth-state-1',
      sub2apiSessionId: 'session-abc',
      sub2apiOAuthState: 'oauth-state-1',
      sub2apiGroupIds: [33, 11],
      sub2apiDraftName: result.sub2apiDraftName,
      groupSummary: 'gamma（#33）、alpha（#11）',
      redirectUri: 'http://localhost:1455/auth/callback',
    }
  );

  const state = api.snapshot();
  assert.deepEqual(
    state.requestCalls.map((entry) => entry.path),
    [
      '/api/v1/admin/groups/all?platform=openai',
      '/api/v1/admin/openai/generate-auth-url',
    ]
  );
  assert.deepEqual(
    state.requestCalls[1].options.body,
    { redirect_uri: 'http://localhost:1455/auth/callback' },
    'Step 1 应直接调用 OpenAI OAuth generate-auth-url 接口'
  );
});

test('submitSub2ApiOpenAiCallback exchanges code in background and creates account with selected groups', async () => {
  const api = createApi();
  const result = await api.submitSub2ApiOpenAiCallback({
    sub2apiUrl: 'https://sub2api.example.com/admin/accounts',
    sub2apiEmail: 'admin@example.com',
    sub2apiPassword: 'secret',
    sub2apiSessionId: 'session-abc',
    sub2apiOAuthState: 'oauth-state-1',
    sub2apiGroupIds: [22, 11],
    sub2apiDraftName: 'draft-name',
    localhostUrl: 'http://localhost:1455/auth/callback?code=code-123&state=oauth-state-1',
  });

  assert.equal(result.localhostUrl, 'http://localhost:1455/auth/callback?code=code-123&state=oauth-state-1');
  assert.equal(result.verifiedStatus, 'SUB2API 已创建账号 #7788');

  const state = api.snapshot();
  assert.deepEqual(
    state.requestCalls.map((entry) => entry.path),
    [
      '/api/v1/admin/openai/exchange-code',
      '/api/v1/admin/accounts',
    ]
  );
  assert.deepEqual(
    state.requestCalls[0].options.body,
    {
      session_id: 'session-abc',
      code: 'code-123',
      state: 'oauth-state-1',
    },
    'Step 9 应直接调用 OpenAI OAuth exchange-code 接口'
  );
  assert.deepEqual(
    state.requestCalls[1].options.body.group_ids,
    [22, 11],
    '创建账号时应保留用户已选分组顺序'
  );
});

test('executeSub2ApiStep1 completes in background without content-script tab orchestration', async () => {
  const api = createApi();
  await api.executeSub2ApiStep1({
    sub2apiUrl: 'https://sub2api.example.com/admin/accounts',
    sub2apiEmail: 'admin@example.com',
    sub2apiPassword: 'secret',
    sub2apiGroupNames: ['alpha'],
  });

  const state = api.snapshot();
  assert.deepEqual(
    state.completedSteps.map((entry) => entry.step),
    [1],
    'Step 1 应直接在 background 完成'
  );
  assert.ok(
    state.logMessages.some((entry) => entry.message.includes('正在向 SUB2API 生成 OpenAI Auth 链接')),
    'Step 1 应保留关键过程日志'
  );
});

test('executeSub2ApiStep9 completes in background without page-bound SUB2API tab', async () => {
  const api = createApi();
  await api.executeSub2ApiStep9({
    sub2apiUrl: 'https://sub2api.example.com/admin/accounts',
    sub2apiEmail: 'admin@example.com',
    sub2apiPassword: 'secret',
    sub2apiSessionId: 'session-abc',
    sub2apiOAuthState: 'oauth-state-1',
    sub2apiGroupIds: [11, 22],
    localhostUrl: 'http://localhost:1455/auth/callback?code=code-123&state=oauth-state-1',
  });

  const state = api.snapshot();
  assert.deepEqual(
    state.completedSteps.map((entry) => entry.step),
    [9],
    'Step 9 应直接在 background 完成'
  );
  assert.ok(
    state.logMessages.some((entry) => entry.message.includes('正在向 SUB2API 交换 OpenAI 授权码')),
    'Step 9 应记录 exchange-code 日志'
  );
});
