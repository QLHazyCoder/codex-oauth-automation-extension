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

test('sidepanel html keeps 2925 mode row and standalone pool settings row', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-mail-2925-mode"/);
  assert.match(html, /data-mail2925-mode="provide"/);
  assert.match(html, /data-mail2925-mode="receive"/);
  assert.match(html, /id="row-mail2925-pool-settings"/);
});

test('sidepanel only treats 2925 as generated alias provider in provide mode', () => {
  const bundle = [
    extractFunction('isManagedAliasProvider'),
    extractFunction('usesGeneratedAliasMailProvider'),
  ].join('\n');

  const api = new Function(`
const GMAIL_PROVIDER = 'gmail';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
const selectMailProvider = { value: '2925' };

function normalizeMail2925Mode(value = '') {
  return String(value || '').trim().toLowerCase() === MAIL_2925_MODE_RECEIVE
    ? MAIL_2925_MODE_RECEIVE
    : DEFAULT_MAIL_2925_MODE;
}

function getSelectedMail2925Mode() {
  return MAIL_2925_MODE_PROVIDE;
}

function getManagedAliasUtils() {
  return {
    usesManagedAliasGeneration(provider, options = {}) {
      return String(provider || '').trim().toLowerCase() === 'gmail'
        || (String(provider || '').trim().toLowerCase() === '2925'
          && normalizeMail2925Mode(options.mail2925Mode) === MAIL_2925_MODE_PROVIDE);
    },
  };
}

${bundle}

return {
  isManagedAliasProvider,
  usesGeneratedAliasMailProvider,
};
`)();

  assert.equal(api.isManagedAliasProvider('2925', 'provide'), true);
  assert.equal(api.isManagedAliasProvider('2925', 'receive'), false);
  assert.equal(api.usesGeneratedAliasMailProvider('2925', 'provide'), true);
  assert.equal(api.usesGeneratedAliasMailProvider('2925', 'receive'), false);
  assert.equal(api.usesGeneratedAliasMailProvider('gmail', 'receive'), true);
});
