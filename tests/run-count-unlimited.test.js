const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function extractFunction(source, name) {
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

test('sidepanel run count input no longer hardcodes max=50', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const inputTag = html.match(/<input type="number" id="input-run-count"[^>]+>/);

  assert.ok(inputTag, 'run count input should exist');
  assert.doesNotMatch(inputTag[0], /\smax="50"/);
});

test('sidepanel getRunCountValue no longer clamps run count to 50', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
  const bundle = extractFunction(source, 'getRunCountValue');

  const api = new Function(`
const inputRunCount = { value: '88' };
${bundle}
return {
  getRunCountValue,
  setValue(value) {
    inputRunCount.value = value;
  },
};
`)();

  assert.equal(api.getRunCountValue(), 88);
  api.setValue('0');
  assert.equal(api.getRunCountValue(), 1);
});

test('background normalizeRunCount no longer clamps values to 50', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  const bundle = extractFunction(source, 'normalizeRunCount');

  const api = new Function(`
${bundle}
return { normalizeRunCount };
`)();

  assert.equal(api.normalizeRunCount(88), 88);
  assert.equal(api.normalizeRunCount('120'), 120);
  assert.equal(api.normalizeRunCount(0), 1);
  assert.equal(api.normalizeRunCount('bad'), 1);
});
