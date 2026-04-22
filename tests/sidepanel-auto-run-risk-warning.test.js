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

test('auto-run fallback risk warning starts at 3 runs', () => {
  const bundle = extractFunction('shouldWarnAutoRunFallbackRisk');

  const api = new Function(`
const AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS = 3;
${bundle}
return { shouldWarnAutoRunFallbackRisk };
`)();

  assert.equal(api.shouldWarnAutoRunFallbackRisk(2, false), false);
  assert.equal(api.shouldWarnAutoRunFallbackRisk(3, false), true);
  assert.equal(api.shouldWarnAutoRunFallbackRisk(10, true), true);
});

test('auto-run fallback risk modal uses the single-node warning copy', async () => {
  const bundle = extractFunction('openAutoRunFallbackRiskConfirmModal');

  const api = new Function(`
let capturedOptions = null;
async function openConfirmModalWithOption(options) {
  capturedOptions = options;
  return { confirmed: true, optionChecked: false };
}
${bundle}
return {
  openAutoRunFallbackRiskConfirmModal,
  getCapturedOptions() {
    return capturedOptions;
  },
};
`)();

  const result = await api.openAutoRunFallbackRiskConfirmModal(3);
  const options = api.getCapturedOptions();

  assert.deepStrictEqual(result, { confirmed: true, dismissPrompt: false });
  assert.equal(options.title, '自动运行风险提醒');
  assert.equal(
    options.message,
    '当前轮数已经不适合单节点情况，请确保已经配置并打开节点轮询功能（若没有配置，请点击贡献/使用按钮，根据网页中使用教程进行配置），避免连续使用一个节点注册，导致出现手机号验证。'
  );
  assert.equal(options.confirmLabel, '继续');
});
