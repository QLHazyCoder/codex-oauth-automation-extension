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

const api = new Function(`
const SUB2API_DEFAULT_GROUP_NAME = 'codex';
const SUB2API_DEFAULT_CONCURRENCY = 10;
const SUB2API_DEFAULT_PRIORITY = 1;
const SUB2API_DEFAULT_RATE_MULTIPLIER = 1;

${extractFunction('normalizeSub2ApiGroupName')}
${extractFunction('normalizeSub2ApiGroupNames')}
${extractFunction('getSelectedSub2ApiGroupNames')}
${extractFunction('normalizeSub2ApiGroupRecords')}
${extractFunction('resolveSub2ApiGroups')}
${extractFunction('buildSub2ApiAccountCreatePayload')}

return {
  normalizeSub2ApiGroupNames,
  getSelectedSub2ApiGroupNames,
  resolveSub2ApiGroups,
  buildSub2ApiAccountCreatePayload,
};
`)();

test('getSelectedSub2ApiGroupNames returns empty when neither payload nor background selected any group', () => {
  assert.deepEqual(api.getSelectedSub2ApiGroupNames({}, {}), []);
});

test('resolveSub2ApiGroups keeps the user-selected order', () => {
  assert.deepEqual(
    api.resolveSub2ApiGroups(
      [
        { id: 11, name: 'alpha', platform: 'openai' },
        { id: 22, name: 'beta', platform: 'openai' },
        { id: 33, name: 'gamma', platform: 'openai' },
      ],
      ['gamma', 'alpha']
    ),
    [
      { id: 33, name: 'gamma', platform: 'openai', account_count: null },
      { id: 11, name: 'alpha', platform: 'openai', account_count: null },
    ]
  );
});

test('resolveSub2ApiGroups throws when any selected group is missing', () => {
  assert.throws(
    () => api.resolveSub2ApiGroups([{ id: 11, name: 'alpha', platform: 'openai' }], ['alpha', 'missing']),
    /未找到这些 openai 分组：missing/
  );
});

test('buildSub2ApiAccountCreatePayload keeps multiple group ids', () => {
  assert.deepEqual(
    api.buildSub2ApiAccountCreatePayload('demo@example.com', { access_token: 'abc' }, { email: 'demo@example.com' }, [11, 22]),
    {
      name: 'demo@example.com',
      notes: '',
      platform: 'openai',
      type: 'oauth',
      credentials: { access_token: 'abc' },
      concurrency: 10,
      priority: 1,
      rate_multiplier: 1,
      group_ids: [11, 22],
      auto_pause_on_expired: true,
      extra: { email: 'demo@example.com' },
    }
  );
});
