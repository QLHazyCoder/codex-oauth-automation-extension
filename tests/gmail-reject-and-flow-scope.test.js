// 测试覆盖三件事：
//   P0: rejectSubjectPatterns 能把"对侧流程"的 OTP 邮件过滤掉
//       (step 4 注册不吞登录码、step 7 登录不吞注册码)
//   P2: getVerificationPollPayload 的默认参数更新（maxAttempts=8, intervalMs=1500,
//       rejectSubjectPatterns 非空）
//   P4: ensureSeenMailIdsScopedTo 在 flowStartTime 变更时清空 seenMailIds

const assert = require('node:assert/strict');
const fs = require('node:fs');

const gmailSource = fs.readFileSync('content/gmail-mail.js', 'utf8');
const bgSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((m) => source.indexOf(m)).find((i) => i >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for ${name}`);

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

// ---------- P2: getVerificationPollPayload 默认参数 ----------
(function testPollPayloadDefaults() {
  const api = new Function(`
function normalizeTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function getVerificationRequestTimestamp(step, state) {
  return state?.[step === 4 ? 'signupVerificationRequestedAt' : 'loginVerificationRequestedAt'] || 0;
}
${extractFunction(bgSource, 'getVerificationPollPayload')}
return { getVerificationPollPayload };
`)();

  const state = { email: 'x@icloud.com', flowStartTime: 1700000000000 };

  const step4 = api.getVerificationPollPayload(4, state);
  assert.strictEqual(step4.maxAttempts, 8, 'P2: step 4 maxAttempts 应从 5 提到 8');
  assert.strictEqual(step4.intervalMs, 1500, 'P2: step 4 intervalMs 应从 3000 降到 1500');
  assert.ok(Array.isArray(step4.rejectSubjectPatterns), 'P2: step 4 应携带 rejectSubjectPatterns');
  assert.strictEqual(
    step4.rejectSubjectPatterns.length,
    0,
    'P0: 产品要求 step 4 主题不再 reject 任何邮件（含登录 OTP），需依赖上游 signup-page 识别账号冲突'
  );
  assert.strictEqual(step4.flowStartTime, 1700000000000, 'P4: step 4 应把 flowStartTime 透传下去');

  const step7 = api.getVerificationPollPayload(7, state);
  assert.strictEqual(step7.maxAttempts, 8, 'P2: step 7 maxAttempts 应从 5 提到 8');
  assert.strictEqual(step7.intervalMs, 1500, 'P2: step 7 intervalMs 应从 3000 降到 1500');
  assert.ok(step7.rejectSubjectPatterns.length > 0, 'P2: step 7 rejectSubjectPatterns 不应为空');
  assert.strictEqual(step7.flowStartTime, 1700000000000, 'P4: step 7 应把 flowStartTime 透传下去');

  // step 4 已放开主题 reject：登录/注册主题都不拦（登录 OTP 的误填风险交由上游
  // signup-page 的 invalid code 分支处理）。
  const step4RejectRes = step4.rejectSubjectPatterns.map((s) => new RegExp(s, 'i'));
  assert.ok(
    !step4RejectRes.some((re) => re.test('你的临时 ChatGPT 登录代码 - 输入此临时验证码以继续')),
    'P0: step 4 已放开主题 reject，不应再拦「登录代码」邮件'
  );
  assert.ok(
    !step4RejectRes.some((re) => re.test('你的 OpenAI 代码为 123456')),
    'P0: step 4 也不应拦注册主题邮件（空 reject 数组）'
  );

  // step 7 的 reject 应能命中"注册/sign up"；不应命中"登录"
  const step7RejectRes = step7.rejectSubjectPatterns.map((s) => new RegExp(s, 'i'));
  assert.ok(
    step7RejectRes.some((re) => re.test('Sign up code: 123456')),
    'P0: step 7 rejectSubjectPatterns 应命中 sign up 主题'
  );
  assert.ok(
    !step7RejectRes.some((re) => re.test('你的临时 ChatGPT 登录代码 - 123456')),
    'P0: step 7 rejectSubjectPatterns 不应误命中"登录"主题邮件'
  );

  // 覆盖回退：没有 flowStartTime 时默认 0，不应抛错
  const noFlow = api.getVerificationPollPayload(4, { email: 'x@icloud.com' });
  assert.strictEqual(noFlow.flowStartTime, 0, 'P4: 缺省 flowStartTime 应安全回退为 0');
})();

// ---------- P0: compileRejectPatterns ----------
(function testCompileRejectPatterns() {
  const api = new Function(`
const GMAIL_PREFIX = '[test]';
${extractFunction(gmailSource, 'compileRejectPatterns')}
return { compileRejectPatterns };
`)();

  const compiled = api.compileRejectPatterns([
    '登录\\s*(?:代码|验证|码)',
    'log\\s*in(?:\\s+code)?',
    '', // 空串应被过滤
    null, // null 应被过滤
    '[invalid(regex', // 非法正则应被跳过
  ]);
  assert.strictEqual(compiled.length, 2, 'P0: 仅保留合法非空的 pattern');
  assert.ok(compiled[0] instanceof RegExp, 'P0: 结果应为 RegExp');
  assert.ok(compiled[0].test('你的临时 ChatGPT 登录代码'), 'P0: 中文"登录代码"应命中');
  assert.ok(compiled[1].test('Login code: 123456'), 'P0: 英文"Login code"应命中');
  assert.ok(!compiled[0].test('你的 OpenAI 代码为 123456'), 'P0: 注册代码不应被登录 pattern 命中');

  // 空输入 / 非数组输入应安全返回空数组
  assert.deepStrictEqual(api.compileRejectPatterns(), [], 'P0: undefined 输入返回 []');
  assert.deepStrictEqual(api.compileRejectPatterns(null), [], 'P0: null 输入返回 []');
  assert.deepStrictEqual(api.compileRejectPatterns([]), [], 'P0: 空数组返回 []');
})();

// ---------- P4: ensureSeenMailIdsScopedTo 在 flowStartTime 变化时清空 ----------
(async function testEnsureSeenCodesScopedToResetsOnNewFlow() {
  const store = {};
  const chromeStub = {
    storage: {
      session: {
        async set(payload) { Object.assign(store, payload); },
        async get(keys) {
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) out[k] = store[k];
            return out;
          }
          return { [keys]: store[keys] };
        },
      },
    },
  };

  const api = new Function('chromeStub', `
const chrome = chromeStub;
const GMAIL_PREFIX = '[test]';
let seenMailIds = new Set(['111111', '222222']); // 模拟上一轮残留
let seenMailIdsFlowId = 1700000000000;

${extractFunction(gmailSource, 'persistSeenMailIds')}
${extractFunction(gmailSource, 'ensureSeenMailIdsScopedTo')}

return {
  ensureSeenMailIdsScopedTo,
  getSeenMailIds() { return [...seenMailIds]; },
  getFlowId() { return seenMailIdsFlowId; },
  setSeenMailIdsForTest(ids, flowId) {
    seenMailIds = new Set(ids);
    seenMailIdsFlowId = flowId;
  },
};
`)(chromeStub);

  // 场景 1：相同 flowId → 不清空
  await api.ensureSeenMailIdsScopedTo(1700000000000);
  assert.deepStrictEqual(api.getSeenMailIds(), ['111111', '222222'], 'P4: flowId 相同时 seenMailIds 应保持');
  assert.strictEqual(api.getFlowId(), 1700000000000, 'P4: flowId 相同时 id 应保持');

  // 场景 2：flowId 变更 → 清空并持久化
  await api.ensureSeenMailIdsScopedTo(1700000999999);
  assert.deepStrictEqual(api.getSeenMailIds(), [], 'P4: flowId 变更时 seenMailIds 应被清空');
  assert.strictEqual(api.getFlowId(), 1700000999999, 'P4: flowId 应更新到新值');
  assert.deepStrictEqual(store.seenGmailMailIds, [], 'P4: 清空后的 seenMailIds 应被持久化为 []');
  assert.strictEqual(store.seenGmailMailIdsFlowId, 1700000999999, 'P4: 新 flowId 应被持久化');

  // 场景 3：flowStartTime=0 (兼容旧 payload) → 不触发清空
  api.setSeenMailIdsForTest(['333333'], 1700000999999);
  await api.ensureSeenMailIdsScopedTo(0);
  assert.deepStrictEqual(api.getSeenMailIds(), ['333333'], 'P4: flowStartTime=0 视为"未提供"，不应清空');
  assert.strictEqual(api.getFlowId(), 1700000999999, 'P4: flowStartTime=0 不应重置 flowId');

  // 场景 4：NaN / 非数字 → 同样视为未提供
  api.setSeenMailIdsForTest(['444444'], 1700000999999);
  await api.ensureSeenMailIdsScopedTo('not-a-number');
  assert.deepStrictEqual(api.getSeenMailIds(), ['444444'], 'P4: 非数字 flowStartTime 不应清空');
})().then(() => {
  console.log('gmail reject + flow scope tests passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
