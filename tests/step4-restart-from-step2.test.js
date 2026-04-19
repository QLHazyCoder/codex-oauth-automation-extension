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
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = index;
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
const STEP4_RESTART_FROM_STEP2_ERROR_CODE = 'STEP4_RESTART_FROM_STEP2';
let lastResolveOptions = null;

${extractFunction('createStep4RestartFromStep2Error')}
${extractFunction('executeStep4')}

function getErrorMessage(error) {
  return error?.message || String(error);
}

function getMailConfig() {
  return { source: 'gmail-mail', label: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' };
}
async function getTabId() { return 1; }
function throwIfStopped() {}
async function addLog() {}
async function sendToContentScriptResilient() {
  return { ready: true };
}
async function setState() {}
async function completeStepFromBackground() {}
function shouldUseCustomRegistrationEmail() { return false; }
async function confirmCustomVerificationStepBypass() {}
async function isTabAlive() { return true; }
async function ensureRunTabGroupForTab() {}
const chrome = { tabs: { update() { return Promise.resolve(); } } };
async function reuseOrCreateTab() {}
function isStopError() { return false; }
function isVerificationMailPollingError() { return true; }
async function resolveVerificationStep(step, state, mail, options) {
  lastResolveOptions = options;
  throw new Error('步骤 4：无法获取新的注册验证码。');
}

return {
  executeStep4,
  getLastResolveOptions() {
    return lastResolveOptions;
  },
};
`)();

test('executeStep4 wraps persistent mailbox polling failure as restart-from-step2 error', async () => {
  let thrown = null;
  try {
    await api.executeStep4({ password: 'pw' });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, '应抛出回到步骤 2 的重启错误');
  assert.strictEqual(thrown.code, 'STEP4_RESTART_FROM_STEP2');
  assert.match(thrown.message, /回到步骤 2 重新开始注册流程/);
  assert.strictEqual(
    api.getLastResolveOptions()?.maxRounds,
    2,
    '方案B下 Gmail 的 Step 4 内层轮询轮数应收敛到 2 轮，避免重复 resend 过多次'
  );
});
