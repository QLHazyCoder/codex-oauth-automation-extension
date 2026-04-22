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

test('generated email helper falls back to normal generator when 2925 is in receive mode', async () => {
  const source = fs.readFileSync('background/generated-email-helpers.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageGeneratedEmailHelpers;`)(globalScope);
  const events = [];

  const helpers = api.createGeneratedEmailHelpers({
    addLog: async () => {},
    buildGeneratedAliasEmail: () => {
      throw new Error('should not build alias in receive mode');
    },
    buildCloudflareTempEmailHeaders: () => ({}),
    CLOUDFLARE_TEMP_EMAIL_GENERATOR: 'cloudflare-temp-email',
    DUCK_AUTOFILL_URL: 'https://duckduckgo.com/email',
    fetch: async () => ({ ok: true, text: async () => '{}' }),
    fetchIcloudHideMyEmail: async () => {
      throw new Error('should not use icloud generator');
    },
    getCloudflareTempEmailAddressFromResponse: () => '',
    getCloudflareTempEmailConfig: () => ({ baseUrl: '', adminAuth: '', domain: '' }),
    getState: async () => ({
      mailProvider: '2925',
      mail2925Mode: 'receive',
      emailGenerator: 'duck',
    }),
    ensureMail2925AccountForFlow: async () => {
      throw new Error('should not allocate 2925 account in receive mode');
    },
    joinCloudflareTempEmailUrl: () => '',
    normalizeCloudflareDomain: () => '',
    normalizeCloudflareTempEmailAddress: () => '',
    normalizeEmailGenerator: (value) => String(value || '').trim().toLowerCase(),
    isGeneratedAliasProvider: (_provider, mail2925Mode) => mail2925Mode === 'provide',
    reuseOrCreateTab: async () => {},
    sendToContentScript: async (_source, message) => {
      events.push(message.type);
      return { email: 'duck@example.com', generated: true };
    },
    setEmailState: async (email) => {
      events.push(['email', email]);
    },
    throwIfStopped: () => {},
  });

  const email = await helpers.fetchGeneratedEmail({
    mailProvider: '2925',
    mail2925Mode: 'receive',
    emailGenerator: 'duck',
  }, {
    mailProvider: '2925',
    mail2925Mode: 'receive',
    generator: 'duck',
  });

  assert.equal(email, 'duck@example.com');
  assert.deepStrictEqual(events, [
    'FETCH_DUCK_EMAIL',
    ['email', 'duck@example.com'],
  ]);
});
