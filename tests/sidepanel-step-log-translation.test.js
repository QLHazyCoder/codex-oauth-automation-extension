const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

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

test('translateInternalStepMentions maps internal step numbers to visible flow steps', () => {
  const api = new Function(`
const UI_STEP_BY_INTERNAL_STEP = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  10: 9,
};

${extractFunction('getUiStep')}
${extractFunction('getDisplayStepForMessage')}
${extractFunction('translateInternalStepMentions')}

return { translateInternalStepMentions };
`)();

  assert.equal(
    api.translateInternalStepMentions('步骤 6：正在刷新登录用的 OAuth 链接...'),
    '步骤 5：正在刷新登录用的 OAuth 链接...',
    '旧内部步骤 6 应在日志中显示为可见步骤 5'
  );

  assert.equal(
    api.translateInternalStepMentions('Step 10: logout'),
    'Step 9: logout',
    '英文 Step N 形式也应同步翻译'
  );

  assert.equal(
    api.translateInternalStepMentions('步骤 1：正在通过 SUB2API API 生成 OpenAI Auth 链接...'),
    '步骤 5：正在通过 SUB2API API 生成 OpenAI Auth 链接...',
    '内部旧步骤 1 的 OAuth 获取能力应在显示层归并为可见新步骤 5'
  );
});
