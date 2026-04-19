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

test('sidepanel html contains icloud local strategy controls', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  assert.match(html, /id="select-icloud-generation-strategy"/);
  assert.match(html, /id="row-icloud-apple-id-password"/);
  assert.match(html, /id="input-icloud-apple-id-password"/);
  assert.match(html, /id="btn-toggle-icloud-apple-id-password"/);
});

test('sidepanel icloud local strategy helpers collect and restore settings without forcing web refresh', () => {
  const bundle = [
    extractFunction('normalizeIcloudGenerationStrategy'),
    extractFunction('getSelectedIcloudGenerationStrategy'),
    extractFunction('setIcloudGenerationStrategy'),
    extractFunction('buildIcloudGenerationSettingsPayload'),
    extractFunction('updateIcloudGenerationSettingsUI'),
    extractFunction('applyIcloudGenerationSettings'),
    extractFunction('shouldAutoRefreshIcloudAliases'),
    extractFunction('handleIcloudAliasesChangedMessage'),
  ].join('\n');

  const api = new Function(`
const ICLOUD_PROVIDER = 'icloud';
const ICLOUD_GENERATION_STRATEGY_WEB = 'web';
const ICLOUD_GENERATION_STRATEGY_LOCAL_MACOS = 'local-macos';
const latestState = { mailProvider: '163', icloudGenerationStrategy: 'web' };
const selectIcloudGenerationStrategy = { value: 'web' };
const rowIcloudAppleIdPassword = { style: { display: 'none' } };
const inputIcloudAppleIdPassword = { value: '' };
const selectEmailGenerator = { value: 'icloud' };
let refreshCount = 0;
function getSelectedEmailGenerator() {
  return String(selectEmailGenerator.value || '').trim().toLowerCase();
}
function isIcloudMailProvider(provider = '') {
  return String(provider || '').trim() === ICLOUD_PROVIDER;
}
function queueIcloudAliasRefresh() {
  refreshCount += 1;
}
${bundle}
return {
  applyIcloudGenerationSettings,
  buildIcloudGenerationSettingsPayload,
  handleIcloudAliasesChangedMessage,
  normalizeIcloudGenerationStrategy,
  rowIcloudAppleIdPassword,
  selectEmailGenerator,
  selectIcloudGenerationStrategy,
  inputIcloudAppleIdPassword,
  refreshCount: () => refreshCount,
  shouldAutoRefreshIcloudAliases,
};
`)();

  api.applyIcloudGenerationSettings({
    icloudGenerationStrategy: 'local-macos',
    icloudAppleIdPassword: 'apple-secret',
  });
  assert.equal(api.selectIcloudGenerationStrategy.value, 'local-macos');
  assert.equal(api.inputIcloudAppleIdPassword.value, 'apple-secret');
  assert.equal(api.rowIcloudAppleIdPassword.style.display, '');
  assert.deepEqual(api.buildIcloudGenerationSettingsPayload(), {
    icloudGenerationStrategy: 'local-macos',
    icloudAppleIdPassword: 'apple-secret',
  });
  assert.equal(api.shouldAutoRefreshIcloudAliases({ mailProvider: '163', icloudGenerationStrategy: 'local-macos' }), false);
  assert.equal(api.shouldAutoRefreshIcloudAliases({ mailProvider: '163', icloudGenerationStrategy: 'web' }), true);
  assert.equal(api.shouldAutoRefreshIcloudAliases({ mailProvider: 'icloud', icloudGenerationStrategy: 'local-macos' }), true);
  assert.equal(api.handleIcloudAliasesChangedMessage(), false);
  assert.equal(api.refreshCount(), 0);

  api.selectIcloudGenerationStrategy.value = 'web';
  assert.equal(api.handleIcloudAliasesChangedMessage(), true);
  assert.equal(api.refreshCount(), 1);
});
