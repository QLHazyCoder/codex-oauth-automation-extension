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

test('getPreferredRunCountValue keeps current auto-run total when UI resets', () => {
  const api = new Function(`
const inputRunCount = { value: '8' };
let currentAutoRun = { totalRuns: 12 };

${extractFunction('getPreferredRunCountValue')}

return {
  getPreferredRunCountValue,
  setInput(value) { inputRunCount.value = value; },
  setCurrent(totalRuns) { currentAutoRun = { totalRuns }; },
};
`)();

  assert.equal(api.getPreferredRunCountValue(), 12, '应优先保留当前自动运行总轮数');
  api.setCurrent(0);
  assert.equal(api.getPreferredRunCountValue(), 8, '当前自动运行总轮数为空时应回退到输入框值');
  api.setInput('');
  assert.equal(api.getPreferredRunCountValue(), 8, '输入框为空时应回退默认 8 轮');
});
