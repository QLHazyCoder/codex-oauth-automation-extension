const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports navigation utils module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/navigation-utils\.js/);
});

test('navigation utils module exposes a factory', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);

  assert.equal(typeof api?.createNavigationUtils, 'function');
});

test('navigation utils recognize signup password pages for email and phone signup', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);
  const utils = api.createNavigationUtils({
    DEFAULT_CODEX2API_URL: 'http://localhost:8080/admin/accounts',
    DEFAULT_SUB2API_URL: 'https://sub.example.com/admin/accounts',
    normalizeLocalCpaStep9Mode: (value) => value,
  });

  assert.equal(utils.isSignupPasswordPageUrl('https://auth.openai.com/create-account/password'), true);
  assert.equal(utils.isSignupPasswordPageUrl('https://auth.openai.com/log-in/password'), true);
  assert.equal(utils.isSignupPasswordPageUrl('https://auth.openai.com/log-in'), false);
});

test('navigation utils treat 126 mail hosts as part of the shared NetEase mail family', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};
  const moduleApi = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);
  const navigationUtils = moduleApi.createNavigationUtils({
    DEFAULT_SUB2API_URL: 'https://example.com/admin/accounts',
    normalizeLocalCpaStep9Mode: value => value,
  });

  assert.equal(navigationUtils.is163MailHost('mail.126.com'), true);
  assert.equal(
    navigationUtils.matchesSourceUrlFamily(
      'mail-163',
      'https://mail.126.com/js6/main.jsp',
      'https://mail.163.com/js6/main.jsp'
    ),
    true
  );
});

test('navigation utils support codex2api mode and url normalization', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);
  const utils = api.createNavigationUtils({
    DEFAULT_CODEX2API_URL: 'http://localhost:8080/admin/accounts',
    DEFAULT_SUB2API_URL: 'https://sub.example.com/admin/accounts',
    normalizeLocalCpaStep9Mode: (value) => value,
  });

  assert.equal(utils.normalizeCodex2ApiUrl('localhost:8080/admin'), 'http://localhost:8080/admin/accounts');
  assert.equal(
    utils.normalizeCodex2ApiUrl('https://codex-admin.example.com/'),
    'https://codex-admin.example.com/admin/accounts'
  );
  assert.equal(utils.getPanelMode({ panelMode: 'codex2api' }), 'codex2api');
  assert.equal(utils.getPanelModeLabel('codex2api'), 'Codex2API');
});

test('navigation utils recognize the iCloud mail tab family on both supported hosts', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);
  const utils = api.createNavigationUtils({
    DEFAULT_CODEX2API_URL: 'http://localhost:8080/admin/accounts',
    DEFAULT_SUB2API_URL: 'https://sub.example.com/admin/accounts',
    normalizeLocalCpaStep9Mode: (value) => value,
  });

  assert.equal(
    utils.matchesSourceUrlFamily('icloud-mail', 'https://www.icloud.com/mail/', 'https://www.icloud.com/mail/'),
    true
  );
  assert.equal(
    utils.matchesSourceUrlFamily('icloud-mail', 'https://www.icloud.com.cn/mail/', 'https://www.icloud.com.cn/mail/'),
    true
  );
  assert.equal(
    utils.matchesSourceUrlFamily('icloud-mail', 'https://mail.google.com/mail/u/0/#inbox', 'https://www.icloud.com/mail/'),
    false
  );
});
