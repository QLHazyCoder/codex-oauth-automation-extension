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
  'const HOTMAIL_PROVIDER = "hotmail-api";',
  'const EMAIL_POLL_MAX_ATTEMPTS_MIN = 1;',
  'const EMAIL_POLL_MAX_ATTEMPTS_MAX = 20;',
  'const EMAIL_POLL_MAX_ATTEMPTS_DEFAULT = 7;',
  'const PERSISTED_SETTING_DEFAULTS = { emailPollMaxAttempts: 7 };',
  'function getHotmailVerificationRequestTimestamp() { return 1234567890; }',
  extractFunction('normalizeEmailPollMaxAttempts'),
  extractFunction('getVerificationPollPayload'),
].join('\n');

const api = new Function(`${bundle}; return { normalizeEmailPollMaxAttempts, getVerificationPollPayload };`)();

assert.strictEqual(
  api.normalizeEmailPollMaxAttempts(undefined),
  7,
  'missing poll attempts should fall back to the default value'
);
assert.strictEqual(
  api.normalizeEmailPollMaxAttempts(0),
  1,
  'poll attempts should clamp to the minimum value'
);
assert.strictEqual(
  api.normalizeEmailPollMaxAttempts(99),
  20,
  'poll attempts should clamp to the maximum value'
);

const signupPayload = api.getVerificationPollPayload(4, {
  email: 'demo@example.com',
  emailPollMaxAttempts: 9,
});
assert.strictEqual(signupPayload.maxAttempts, 9, 'configured poll attempts should be used for step 4');
assert.ok(signupPayload.senderFilters.includes('otp'), 'step 4 sender filters should include otp variants');
assert.ok(signupPayload.senderFilters.includes('openai'), 'step 4 sender filters should include openai variants');
assert.ok(signupPayload.subjectFilters.includes('chatgpt'), 'step 4 subject filters should include ChatGPT variants');
assert.ok(signupPayload.subjectFilters.includes('openai'), 'step 4 subject filters should include OpenAI variants');

const loginPayload = api.getVerificationPollPayload(7, {
  email: 'demo@example.com',
  emailPollMaxAttempts: 11,
});
assert.strictEqual(loginPayload.maxAttempts, 11, 'configured poll attempts should be used for step 7');
assert.ok(loginPayload.senderFilters.includes('otp'), 'step 7 sender filters should include otp variants');
assert.ok(loginPayload.subjectFilters.includes('chatgpt'), 'step 7 subject filters should include ChatGPT variants');
assert.ok(loginPayload.subjectFilters.includes('openai'), 'step 7 subject filters should include OpenAI variants');

console.log('email poll settings tests passed');
