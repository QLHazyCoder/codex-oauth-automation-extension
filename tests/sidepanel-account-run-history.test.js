const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
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

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

test('sidepanel html contains account run history strip under log header', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="account-run-history-strip"/);
  assert.match(html, /id="account-run-history-meta"/);
  assert.match(html, /id="account-run-history-stats"/);
  assert.match(html, /id="account-run-history-list"/);
  assert.match(html, /id="input-account-run-history-text-enabled"/);
  assert.match(html, /id="input-account-run-history-helper-base-url"/);
});

test('sidepanel account run history helpers classify statuses and summarize counts', () => {
  const bundle = [
    extractFunction('normalizeAccountRunHistoryHelperBaseUrlValue'),
    extractFunction('parseAccountRunStatus'),
    extractFunction('summarizeAccountRunHistory'),
    extractFunction('buildAccountRunHistoryDetailText'),
  ].join('\n');

  const api = new Function(`
const DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL = 'http://127.0.0.1:17373';
${bundle}
return { normalizeAccountRunHistoryHelperBaseUrlValue, parseAccountRunStatus, summarizeAccountRunHistory, buildAccountRunHistoryDetailText };
`)();

  assert.deepStrictEqual(api.parseAccountRunStatus('step7_failed'), {
    kind: 'failed',
    label: '步7失败',
  });
  assert.deepStrictEqual(api.parseAccountRunStatus('step4_stopped'), {
    kind: 'stopped',
    label: '步4停止',
  });
  assert.deepStrictEqual(api.parseAccountRunStatus('success'), {
    kind: 'success',
    label: '成功',
  });

  assert.deepStrictEqual(api.summarizeAccountRunHistory([
    { status: 'success' },
    { status: 'step7_failed' },
    { status: 'stopped' },
    { status: 'step2_failed' },
  ]), {
    total: 4,
    success: 1,
    failed: 2,
    stopped: 1,
    other: 0,
  });

  assert.equal(
    api.buildAccountRunHistoryDetailText({ status: 'success', reason: '' }),
    '流程已完成并写入本地记录'
  );
  assert.equal(
    api.buildAccountRunHistoryDetailText({ status: 'step7_failed', reason: '' }),
    '流程执行失败，已保留当前账号快照'
  );
  assert.equal(
    api.buildAccountRunHistoryDetailText({ status: 'stopped', reason: '手动停止' }),
    '手动停止'
  );
  assert.equal(
    api.normalizeAccountRunHistoryHelperBaseUrlValue('http://127.0.0.1:17373/append-account-log'),
    'http://127.0.0.1:17373'
  );
});
