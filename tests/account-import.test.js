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
${extractFunction('compareAccountStatusPriority')}
${extractFunction('normalizeImportedAccountRecord')}
${extractFunction('mergeAccountRecords')}
${extractFunction('parseImportedAccountDataBundle')}
${extractFunction('getImportedManualAliasUsageMap')}
${extractFunction('getUsedIcloudEmails')}
return {
  normalizeImportedAccountRecord,
  mergeAccountRecords,
  parseImportedAccountDataBundle,
  getUsedIcloudEmails,
};
`)();

test('parseImportedAccountDataBundle accepts plain accounts array export', () => {
  const result = api.parseImportedAccountDataBundle([
    { email: 'a@example.com', password: 'pw1', createdAt: '2026-04-10T10:00:00Z' },
  ]);

  assert.equal(result.accounts.length, 1);
  assert.deepEqual(result.manualAliasUsage, {});
  assert.deepEqual(result.preservedAliases, {});
});

test('parseImportedAccountDataBundle accepts full alias-state object export', () => {
  const result = api.parseImportedAccountDataBundle({
    accounts: [{ email: 'b@example.com', password: 'pw2' }],
    manualAliasUsage: { 'b@example.com': true },
    preservedAliases: { 'b@example.com': true },
  });

  assert.equal(result.accounts.length, 1);
  assert.equal(result.manualAliasUsage['b@example.com'], true);
  assert.equal(result.preservedAliases['b@example.com'], true);
});

test('mergeAccountRecords merges duplicate emails and keeps imported password', () => {
  const result = api.mergeAccountRecords(
    [{ email: 'c@example.com', password: '', createdAt: '2026-04-09T10:00:00Z' }],
    [{ email: 'c@example.com', password: 'pw3', createdAt: '2026-04-10T10:00:00Z' }]
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].password, 'pw3');
});

test('normalizeImportedAccountRecord defaults legacy account status to authorized', () => {
  const result = api.normalizeImportedAccountRecord({
    email: 'legacy@example.com',
    password: 'pw',
    createdAt: '2026-04-10T10:00:00Z',
  });

  assert.equal(result.status, 'authorized');
});

test('mergeAccountRecords keeps authorized status when merging with registered record', () => {
  const result = api.mergeAccountRecords(
    [{ email: 'status@example.com', password: 'old', status: 'authorized', createdAt: '2026-04-09T10:00:00Z' }],
    [{ email: 'status@example.com', password: 'new', status: 'registered', createdAt: '2026-04-10T10:00:00Z' }]
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'authorized');
  assert.equal(result[0].password, 'new');
});

test('getUsedIcloudEmails respects manualAliasUsage overrides', () => {
  const result = api.getUsedIcloudEmails({
    accounts: [{ email: 'used@icloud.com' }],
    manualAliasUsage: {
      'used@icloud.com': false,
      'manual@icloud.com': true,
    },
  });

  assert.equal(result.has('used@icloud.com'), false);
  assert.equal(result.has('manual@icloud.com'), true);
});
