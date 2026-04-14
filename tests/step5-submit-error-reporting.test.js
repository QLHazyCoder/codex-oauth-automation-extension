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

${extractFunction('normalizeInlineText')}
${extractFunction('safeJsonParse')}
${extractFunction('formatStep3RegisterError')}
${extractFunction('clearStep3RegisterError')}
${extractFunction('getStep3RegisterErrorText')}
${extractFunction('formatStep5CreateAccountError')}
${extractFunction('clearStep5CreateAccountError')}
${extractFunction('getStep5CreateAccountErrorText')}
${extractFunction('getStep5SubmitErrorText')}

function getStep5ErrorText() {
  return domErrorText;
}

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

console.log('step5 submit error reporting tests passed');
