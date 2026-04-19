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
${extractFunction('executeStep4')}

function getMailConfig() {
  return { source: 'qq-mail', label: 'QQ 邮箱', url: 'https://wx.mail.qq.com/' };
}
async function getTabId() { return 1; }
function throwIfStopped() {}
async function addLog() {}
async function sendToContentScriptResilient() {
  return { phoneRequired: true };
}
async function setState() {}
async function completeStepFromBackground() {}
function shouldUseCustomRegistrationEmail() { return false; }
async function confirmCustomVerificationStepBypass() {}
async function isTabAlive() { return true; }
async function ensureRunTabGroupForTab() {}
async function reuseOrCreateTab() {}
async function resolveVerificationStep() {}

return { executeStep4 };
`)();

test('executeStep4 throws clear phone-required message instead of hanging', async () => {
  await assert.rejects(
    api.executeStep4({ password: 'pw' }),
    /手机号页面.*跳过步骤 4 \/ 5/
  );
});
