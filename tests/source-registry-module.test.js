const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports shared source registry module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /shared\/flow-registry\.js/);
  assert.match(source, /shared\/settings-schema\.js/);
  assert.match(source, /shared\/source-registry\.js/);
});

test('manifest loads shared source registry before content utils in static bundles', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  for (const entry of manifest.content_scripts || []) {
    const scripts = Array.isArray(entry.js) ? entry.js : [];
    if (!scripts.includes('content/utils.js')) continue;
    assert.ok(scripts.includes('shared/source-registry.js'));
    assert.ok(
      scripts.indexOf('shared/source-registry.js') < scripts.indexOf('content/utils.js'),
      'shared/source-registry.js must load before content/utils.js'
    );
  }
});

test('shared source registry exposes canonical source, alias, detection, and ready policies', () => {
  const flowRegistrySource = fs.readFileSync('shared/flow-registry.js', 'utf8');
  const source = fs.readFileSync('shared/source-registry.js', 'utf8');
  const api = new Function('self', `${flowRegistrySource}; ${source}; return self.MultiPageSourceRegistry;`)({});
  const registry = api.createSourceRegistry();

  assert.equal(registry.resolveCanonicalSource('signup-page'), 'openai-auth');
  assert.deepEqual(registry.getSourceKeys('signup-page'), ['openai-auth', 'signup-page']);
  assert.equal(registry.getSourceLabel('openai-auth'), '认证页');
  assert.equal(
    registry.matchesSourceUrlFamily(
      'openai-auth',
      'https://chatgpt.com/',
      'https://auth.openai.com/authorize?client_id=test'
    ),
    true
  );
  assert.equal(
    registry.detectSourceFromLocation({
      url: 'https://auth.openai.com/create-account',
      hostname: 'auth.openai.com',
    }),
    'openai-auth'
  );
  assert.equal(
    registry.detectSourceFromLocation({
      url: 'https://example.com/',
      hostname: 'example.com',
    }),
    'unknown-source'
  );
  assert.equal(registry.detectSourceFromLocation({
    url: 'https://view.awsapps.com/start',
    hostname: 'view.awsapps.com',
  }), 'kiro-device-auth');
  assert.equal(registry.shouldReportReadyForFrame('mail-163', true), false);
  assert.equal(registry.shouldReportReadyForFrame('unknown-source', false), false);
  assert.equal(registry.getCleanupOwnerSource('oauth-localhost-callback'), 'openai-auth');
  assert.equal(registry.driverAcceptsCommand('openai-auth', 'submit-signup-email'), true);
  assert.equal(registry.driverAcceptsCommand('openai-auth', 'post-login-phone-verification'), true);
  assert.equal(registry.driverAcceptsCommand('openai-auth', 'bind-email'), true);
  assert.equal(registry.driverAcceptsCommand('openai-auth', 'fetch-bind-email-code'), true);
  assert.equal(registry.driverAcceptsCommand('content/platform-panel', 'platform-verify'), true);
  assert.equal(registry.driverAcceptsCommand('openai-auth', 'platform-verify'), false);
  assert.equal(registry.driverAcceptsCommand('background/kiro-device-auth', 'kiro-start-device-login'), true);
});
