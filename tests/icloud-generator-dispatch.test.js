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
${extractFunction('normalizeEmailGenerator')}
${extractFunction('fetchGeneratedEmail')}

function isMoemailProvider() { return false; }
function isMailpitProvider() { return false; }
async function fetchMoemailGeneratedEmail() { throw new Error('moemail branch should not run'); }
async function fetchMailpitGeneratedEmail() { throw new Error('mailpit branch should not run'); }
async function fetchCloudflareEmail() { throw new Error('cloudflare branch should not run'); }
async function fetchDuckEmail() { throw new Error('duck branch should not run'); }
async function fetchIcloudGeneratedEmail() { return 'alias@icloud.com'; }
async function getState() { return {}; }

return { fetchGeneratedEmail, normalizeEmailGenerator };
`)();

test('normalizeEmailGenerator accepts icloud', () => {
  assert.equal(api.normalizeEmailGenerator('icloud'), 'icloud');
});

test('fetchGeneratedEmail dispatches to icloud generator', async () => {
  const result = await api.fetchGeneratedEmail({
    emailGenerator: 'icloud',
  }, {});

  assert.equal(result, 'alias@icloud.com');
});
