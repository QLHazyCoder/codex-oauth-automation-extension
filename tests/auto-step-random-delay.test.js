const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = paramsStart;
  for (; paramsEnd < source.length; paramsEnd += 1) {
    const ch = source[paramsEnd];
    if (ch === '(') paramsDepth += 1;
    if (ch === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        break;
      }
    }
  }

  const braceStart = source.indexOf('{', paramsEnd);
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

const bundle = [
  'const AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS = 0;',
  'const AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS = 600;',
  'const PERSISTED_SETTING_DEFAULTS = { autoStepDelaySeconds: null };',
  extractFunction('normalizeAutoStepDelaySeconds'),
  extractFunction('resolveLegacyAutoStepDelaySeconds'),
].join('\n');

const api = new Function(`${bundle}; return { normalizeAutoStepDelaySeconds, resolveLegacyAutoStepDelaySeconds };`)();

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds(''),
  null,
  'empty input should remain empty instead of being forced to a default delay'
);

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds(null, null),
  null,
  'null input should stay null'
);

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds('0'),
  0,
  'zero seconds should be kept so the UI can explicitly show no extra delay'
);

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds('12.9'),
  12,
  'delay seconds should be floored to an integer'
);

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds('-50'),
  0,
  'negative delay should clamp to zero seconds'
);

assert.strictEqual(
  api.normalizeAutoStepDelaySeconds('999'),
  600,
  'delay should clamp to the configured upper bound'
);

assert.strictEqual(
  api.resolveLegacyAutoStepDelaySeconds({}),
  undefined,
  'missing legacy fields should not synthesize a migrated delay'
);

assert.strictEqual(
  api.resolveLegacyAutoStepDelaySeconds({ autoStepRandomDelayMinSeconds: 12 }),
  12,
  'legacy min-only settings should migrate to that same delay'
);

assert.strictEqual(
  api.resolveLegacyAutoStepDelaySeconds({ autoStepRandomDelayMaxSeconds: 18 }),
  18,
  'legacy max-only settings should migrate to that same delay'
);

assert.strictEqual(
  api.resolveLegacyAutoStepDelaySeconds({
    autoStepRandomDelayMinSeconds: 12,
    autoStepRandomDelayMaxSeconds: 18,
  }),
  15,
  'legacy min/max ranges should migrate to their rounded midpoint'
);

assert.strictEqual(
  api.resolveLegacyAutoStepDelaySeconds({
    autoStepRandomDelayMinSeconds: '',
    autoStepRandomDelayMaxSeconds: '',
  }),
  null,
  'empty legacy settings should migrate to no delay'
);

console.log('auto step delay tests passed');
