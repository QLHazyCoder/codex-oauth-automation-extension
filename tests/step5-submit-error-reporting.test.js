const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
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

const api = new Function(`
let lastStep5CreateAccountError = '';
let domErrorText = '';
let pageTextSnapshot = '';
let step8Ready = false;
let addPhonePage = false;
let hostname = 'chatgpt.com';
let actionElements = [];

const CHATGPT_ONBOARDING_PROMPT_PATTERN = /what\\s+brings\\s+you\\s+to\\s+chatgpt|什么促使你使用\\s*chatgpt/i;
const CHATGPT_ONBOARDING_OPTION_PATTERN = /学校|工作|个人任务|乐趣和娱乐|其他|school|work|personal\\s+tasks?|fun|entertainment|other/i;
const CHATGPT_ONBOARDING_NEXT_PATTERN = /下一步|继续|next|continue/i;
const CHATGPT_ONBOARDING_SKIP_PATTERN = /跳过|skip/i;

${extractFunction('normalizeInlineText')}
${extractFunction('getActionText')}
${extractFunction('safeJsonParse')}
${extractFunction('formatStep3RegisterError')}
${extractFunction('clearStep3RegisterError')}
${extractFunction('getStep3RegisterErrorText')}
${extractFunction('formatStep5CreateAccountError')}
${extractFunction('clearStep5CreateAccountError')}
${extractFunction('getStep5CreateAccountErrorText')}
${extractFunction('getStep5SubmitErrorText')}
${extractFunction('isChatGptDomain')}
${extractFunction('isChatGptPostSignupLandingPage')}
${extractFunction('getStep5SubmitSuccessOutcome')}
${extractFunction('shouldApplyStep5SlowTransitionGrace')}
${extractFunction('getStep5VisibleActionSamples')}
${extractFunction('buildStep5SubmitDiagnostics')}
${extractFunction('waitForStep5SubmitOutcome')}

function getStep5ErrorText() {
  return domErrorText;
}

function getPageTextSnapshot() {
  return pageTextSnapshot;
}

function isVisibleElement(el) {
  return !el.hidden;
}

function isAddPhonePageReady() {
  return addPhonePage;
}

function isStep8Ready() {
  return step8Ready;
}

function throwIfStopped() {}
async function sleep() {}
function log() {}

const location = {
  get hostname() {
    return hostname;
  },
};

const document = {
  querySelectorAll() {
    return actionElements;
  },
};

return {
  formatStep3RegisterError,
  clearStep3RegisterError,
  getStep3RegisterErrorText,
  formatStep5CreateAccountError,
  clearStep5CreateAccountError,
  getStep5CreateAccountErrorText,
  getStep5SubmitErrorText,
  setDomErrorText(value) {
    domErrorText = value;
  },
  setLastStep5CreateAccountError(value) {
    lastStep5CreateAccountError = value;
  },
  setPageTextSnapshot(value) {
    pageTextSnapshot = value;
  },
  setHostname(value) {
    hostname = value;
  },
  setActionElements(value) {
    actionElements = value;
  },
  setStep8Ready(value) {
    step8Ready = Boolean(value);
  },
  setAddPhonePage(value) {
    addPhonePage = Boolean(value);
  },
  isChatGptPostSignupLandingPage,
  waitForStep5SubmitOutcome,
};
`)();

assert.strictEqual(
  api.formatStep3RegisterError({
    status: 400,
    bodyText: JSON.stringify({
      message: 'Failed to create account. Please try again.',
      type: 'invalid_request_error',
      code: null,
    }),
  }),
  'user/register 接口返回 invalid_request_error：Failed to create account. Please try again.',
  '应在 Step 3 中展示 register 接口的 type 和 message'
);

api.clearStep3RegisterError();
assert.strictEqual(api.getStep3RegisterErrorText(), '', '清理后不应保留旧的 Step 3 接口错误');

assert.strictEqual(
  api.formatStep5CreateAccountError({
    status: 400,
    bodyText: JSON.stringify({
      message: 'The email you provided is not supported.',
      type: 'invalid_request_error',
      code: 'unsupported_email',
    }),
  }),
  'create_account 接口返回 unsupported_email（HTTP 400）：The email you provided is not supported.',
  '应优先展示接口 code 和 message'
);

assert.strictEqual(
  api.formatStep5CreateAccountError({
    status: 500,
    bodyText: 'gateway timeout',
  }),
  'create_account 接口返回 HTTP 500：gateway timeout',
  '非 JSON 错误体也应保留原始文本'
);

api.setDomErrorText('请重试');
api.setLastStep5CreateAccountError('create_account 接口返回 unsupported_email（HTTP 400）：The email you provided is not supported.');
assert.strictEqual(
  api.getStep5SubmitErrorText(),
  'create_account 接口返回 unsupported_email（HTTP 400）：The email you provided is not supported.',
  '接口错误应优先于页面泛化错误文案'
);

api.clearStep5CreateAccountError();
assert.strictEqual(api.getStep5CreateAccountErrorText(), '', '清理后不应保留旧的接口错误');

api.setHostname('chatgpt.com');
api.setPageTextSnapshot('是什么促使你使用 ChatGPT? 学校 工作 个人任务 乐趣和娱乐 其他');
api.setDomErrorText('');
assert.strictEqual(
  api.isChatGptPostSignupLandingPage(),
  true,
  '应识别 ChatGPT onboarding 页面为注册后落地页'
);

api.setHostname('chatgpt.com');
api.setPageTextSnapshot('');
api.setActionElements([
  { textContent: '学校', getAttribute() { return ''; } },
  { textContent: '工作', getAttribute() { return ''; } },
  { textContent: '下一步', getAttribute() { return ''; } },
  { textContent: '跳过', getAttribute() { return ''; } },
]);

(async () => {
  const outcome = await api.waitForStep5SubmitOutcome();
  assert.deepStrictEqual(
    outcome,
    { success: true, chatgptOnboarding: true },
    'Step 5 在 ChatGPT onboarding 页面上应直接视为成功'
  );

  api.setHostname('chatgpt.com');
  api.setPageTextSnapshot('');
  api.setActionElements([]);
  api.setStep8Ready(false);
  api.setAddPhonePage(false);
  const crossOriginOutcome = await api.waitForStep5SubmitOutcome();
  assert.deepStrictEqual(
    crossOriginOutcome,
    { success: true, chatgptOnboarding: true, chatgptCrossOriginCompleted: true },
    'Step 5 超时兜底前若已跨域进入 ChatGPT 域名，也应按成功处理'
  );

  console.log('step5 submit error reporting tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
