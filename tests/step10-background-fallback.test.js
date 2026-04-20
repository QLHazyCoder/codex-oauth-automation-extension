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

async function testExecuteStep10FallsBackToSessionReset() {
  const api = new Function(`
const logs = [];
const completions = [];
const resetReasons = [];
let readyCalled = 0;

async function addLog(message, level = 'info') {
  logs.push({ message, level });
}
async function reuseOrCreateTab() { return 321; }
async function ensureRunTabGroupForTab() {}
async function ensureContentScriptReadyOnTab() { readyCalled += 1; }
async function sendToContentScriptResilient() { throw new Error('步骤 10：账号菜单打不开'); }
function isStopError() { return false; }
function getErrorMessage(error) { return error?.message || String(error); }
async function resetSignupSessionForRestart(reason) { resetReasons.push(reason); }
async function completeStepFromBackground(step, payload) { completions.push({ step, payload }); }

${extractFunction('executeStep10')}

return {
  executeStep10,
  getLogs() { return logs; },
  getCompletions() { return completions; },
  getResetReasons() { return resetReasons; },
  getReadyCalled() { return readyCalled; },
};
`)();

  await api.executeStep10({});

  assert.equal(api.getReadyCalled(), 1, '应先尝试正常注入并执行 Step 10');
  assert.equal(api.getResetReasons().length, 1, 'UI 退出失败后应触发会话清理兜底');
  assert.equal(api.getCompletions().length, 1, '兜底成功后应将步骤 10 标记完成');
  assert.deepStrictEqual(api.getCompletions()[0], {
    step: 10,
    payload: {
      forcedSessionReset: true,
      fallbackReason: '步骤 10：账号菜单打不开',
    },
  });
  assert.ok(
    api.getLogs().some((entry) => /后台会话清理兜底/.test(entry.message)),
    '日志中应明确记录已切换到后台会话清理兜底'
  );
}

(async () => {
  await testExecuteStep10FallsBackToSessionReset();
  console.log('step10 background fallback tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
