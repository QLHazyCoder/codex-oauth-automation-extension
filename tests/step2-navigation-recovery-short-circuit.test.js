const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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

test('step2_clickRegister accepts recovered signup flow even when original attempt was forceFreshSignup', async () => {
  const api = new Function(`
const events = [];
const location = { href: 'https://auth.openai.com/log-in-or-create-account' };

${extractFunction('step2_clickRegister')}

function inspectStep2SignupEntryState() {
  return { state: 'email', emailInput: { id: 'email' } };
}

function log(message, level) { events.push({ type: 'log', message, level }); }
function reportComplete(step, payload) { events.push({ type: 'reportComplete', step, payload }); }

return {
  step2_clickRegister,
  getEvents() { return events.slice(); },
};
`)();

  const result = await api.step2_clickRegister({
    forceFreshSignup: true,
    navigationRecovery: true,
  });

  assert.deepStrictEqual(
    result,
    {
      alreadyOnSignupFlow: true,
      signupFlowState: 'email',
      url: 'https://auth.openai.com/log-in-or-create-account',
    },
    '导航恢复后应直接接受邮箱页，而不是继续把它当作“残留状态”回退'
  );

  const reports = api.getEvents().filter((entry) => entry.type === 'reportComplete');
  assert.deepStrictEqual(
    reports,
    [{ type: 'reportComplete', step: 2, payload: { signupFlowState: 'email' } }],
    '导航恢复命中邮箱页后必须立刻 reportComplete(2)'
  );

  assert.ok(
    api.getEvents().some((entry) => entry.type === 'log' && /新页面继续确认注册流程/.test(entry.message)),
    '应记录导航恢复日志，便于从用户日志中看到“新页面继续执行 step2”'
  );
});
