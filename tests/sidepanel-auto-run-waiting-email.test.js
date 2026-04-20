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

test('sidepanel exposes waiting-email summary helpers for auto-run observability', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="auto-continue-hint"/);

  const bundle = [
    extractFunction('getAutoRunLabel'),
    extractFunction('getAutoRunWaitingEmailHintText'),
    extractFunction('getAutoRunPausedStatusText'),
  ].join('\n');

  const api = new Function(`
let currentAutoRun = {
  phase: 'waiting_email',
  currentRun: 2,
  totalRuns: 5,
  attemptRun: 3,
  failureSummary: 'iCloud 本地生成失败：未找到已注册的本地宿主。',
};
${bundle}
return {
  getAutoRunPausedStatusText,
  getAutoRunWaitingEmailHintText,
};
`)();

  assert.equal(
    api.getAutoRunWaitingEmailHintText(),
    '最近失败：iCloud 本地生成失败：未找到已注册的本地宿主。'
  );
  assert.equal(
    api.getAutoRunPausedStatusText(),
    '自动已暂停 (2/5 · 尝试3)，等待邮箱后继续：iCloud 本地生成失败：未找到已注册的本地宿主。'
  );
});
