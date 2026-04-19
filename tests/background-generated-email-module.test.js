const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports generated email helper module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /importScripts\([\s\S]*'background\/generated-email-helpers\.js'/);
});

test('generated email helper module exposes a factory', () => {
  const source = fs.readFileSync('background/generated-email-helpers.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageGeneratedEmailHelpers;`)(globalScope);

  assert.equal(typeof api?.createGeneratedEmailHelpers, 'function');
});

test('generated email helper module dispatches icloud generation by strategy', async () => {
  const source = fs.readFileSync('background/generated-email-helpers.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageGeneratedEmailHelpers;`)(globalScope);
  const calls = [];

  const helpers = api.createGeneratedEmailHelpers({
    addLog: async () => {},
    buildGeneratedAliasEmail: () => 'alias@example.com',
    buildCloudflareTempEmailHeaders: () => ({}),
    CLOUDFLARE_TEMP_EMAIL_GENERATOR: 'cloudflare-temp-email',
    DUCK_AUTOFILL_URL: 'https://duckduckgo.com/email/autofill',
    fetch: async () => ({ text: async () => '{}' }),
    fetchIcloudHideMyEmailLocal: async () => {
      calls.push('local');
      return 'local@icloud.com';
    },
    fetchIcloudHideMyEmailWeb: async () => {
      calls.push('web');
      return 'web@icloud.com';
    },
    getCloudflareTempEmailAddressFromResponse: () => '',
    getCloudflareTempEmailConfig: () => ({ baseUrl: '', adminAuth: '', domain: '' }),
    getState: async () => ({ mailProvider: '163', emailGenerator: 'icloud', icloudGenerationStrategy: 'web' }),
    joinCloudflareTempEmailUrl: (baseUrl, path) => `${baseUrl}${path}`,
    normalizeCloudflareDomain: (value) => String(value || '').trim().toLowerCase(),
    normalizeCloudflareTempEmailAddress: (value) => String(value || '').trim().toLowerCase(),
    normalizeEmailGenerator: (value) => String(value || '').trim().toLowerCase() || 'duck',
    normalizeIcloudGenerationStrategy: (value) => String(value || '').trim().toLowerCase() === 'local-macos' ? 'local-macos' : 'web',
    isGeneratedAliasProvider: () => false,
    reuseOrCreateTab: async () => {},
    sendToContentScript: async () => ({}),
    setEmailState: async () => {},
    throwIfStopped: () => {},
  });

  assert.equal(
    await helpers.fetchGeneratedEmail(null, { generator: 'icloud', icloudGenerationStrategy: 'local-macos' }),
    'local@icloud.com'
  );
  assert.deepEqual(calls, ['local']);

  calls.length = 0;
  assert.equal(
    await helpers.fetchGeneratedEmail(null, { generator: 'icloud' }),
    'web@icloud.com'
  );
  assert.deepEqual(calls, ['web']);
});

test('generated email helper module does not silently fall back from local icloud to web', async () => {
  const source = fs.readFileSync('background/generated-email-helpers.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageGeneratedEmailHelpers;`)(globalScope);
  let webCalls = 0;

  const helpers = api.createGeneratedEmailHelpers({
    addLog: async () => {},
    buildGeneratedAliasEmail: () => 'alias@example.com',
    buildCloudflareTempEmailHeaders: () => ({}),
    CLOUDFLARE_TEMP_EMAIL_GENERATOR: 'cloudflare-temp-email',
    DUCK_AUTOFILL_URL: 'https://duckduckgo.com/email/autofill',
    fetch: async () => ({ text: async () => '{}' }),
    fetchIcloudHideMyEmailLocal: async () => {
      throw new Error('local helper unavailable');
    },
    fetchIcloudHideMyEmailWeb: async () => {
      webCalls += 1;
      return 'web@icloud.com';
    },
    getCloudflareTempEmailAddressFromResponse: () => '',
    getCloudflareTempEmailConfig: () => ({ baseUrl: '', adminAuth: '', domain: '' }),
    getState: async () => ({ mailProvider: '163', emailGenerator: 'icloud', icloudGenerationStrategy: 'local-macos' }),
    joinCloudflareTempEmailUrl: (baseUrl, path) => `${baseUrl}${path}`,
    normalizeCloudflareDomain: (value) => String(value || '').trim().toLowerCase(),
    normalizeCloudflareTempEmailAddress: (value) => String(value || '').trim().toLowerCase(),
    normalizeEmailGenerator: (value) => String(value || '').trim().toLowerCase() || 'duck',
    normalizeIcloudGenerationStrategy: (value) => String(value || '').trim().toLowerCase() === 'local-macos' ? 'local-macos' : 'web',
    isGeneratedAliasProvider: () => false,
    reuseOrCreateTab: async () => {},
    sendToContentScript: async () => ({}),
    setEmailState: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    () => helpers.fetchGeneratedEmail(null, { generator: 'icloud', icloudGenerationStrategy: 'local-macos' }),
    /local helper unavailable/
  );
  assert.equal(webCalls, 0);
});
