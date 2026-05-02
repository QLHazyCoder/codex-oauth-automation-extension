const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadIpProxyCore({ accountListEnabled = true } = {}) {
  const providerSource = fs.readFileSync('background/ip-proxy-provider-711proxy.js', 'utf8');
  const coreSource = fs.readFileSync('background/ip-proxy-core.js', 'utf8');
  return new Function(`
const self = {};
const chrome = {};
const DEFAULT_IP_PROXY_SERVICE = '711proxy';
const IP_PROXY_SERVICE_VALUES = ['711proxy', 'lumiproxy', 'iproyal', 'omegaproxy'];
const IP_PROXY_ENABLED_SERVICE_VALUES = ['711proxy'];
const DEFAULT_IP_PROXY_MODE = 'account';
const IP_PROXY_MODE_VALUES = ['api', 'account'];
const DEFAULT_IP_PROXY_PROTOCOL = 'http';
const IP_PROXY_PROTOCOL_VALUES = ['http', 'https', 'socks4', 'socks5'];
const IP_PROXY_FETCH_TIMEOUT_MS = 20000;
const IP_PROXY_SETTINGS_SCOPE = 'regular';
const IP_PROXY_BYPASS_LIST = ['<local>', 'localhost', '127.0.0.1'];
const IP_PROXY_ROUTE_ALL_TRAFFIC = true;
const IP_PROXY_ACCOUNT_LIST_ENABLED = ${accountListEnabled ? 'true' : 'false'};
const IP_PROXY_TARGET_HOST_PATTERNS = [
  'openai.com',
  '*.openai.com',
  'chatgpt.com',
  '*.chatgpt.com',
];
${providerSource}
const transformIpProxyAccountEntryByProvider = self.transformIpProxyAccountEntryByProvider;
${coreSource}
return {
  applyExitRegionExpectation,
  buildIpProxyPacScript,
  getAccountModeProxyPoolFromState,
  normalizeIpProxyAccountList,
  normalizeProxyPoolEntries,
  parseIpProxyLine,
  resolveIpProxyAutoSwitchThreshold,
};
`)();
}

test('IP proxy parser ignores disabled lines and normalizes proxy entries', () => {
  const api = loadIpProxyCore();

  assert.equal(
    api.normalizeIpProxyAccountList([
      '# disabled',
      ' // disabled',
      '; disabled',
      'global.rotgb.711proxy.com:10000:user:pass',
      '',
    ].join('\n')),
    'global.rotgb.711proxy.com:10000:user:pass'
  );

  const pool = api.normalizeProxyPoolEntries([
    'http://global.rotgb.711proxy.com:10000:user:pa:ss',
    'http://global.rotgb.711proxy.com:10000:user:pa:ss',
    { host: 'us.proxy.example', port: '8080', username: 'u2', password: 'p2' },
  ]);

  assert.equal(pool.length, 2);
  assert.deepStrictEqual(pool[0], {
    host: 'global.rotgb.711proxy.com',
    port: 10000,
    username: 'user',
    password: 'pa:ss',
    protocol: 'http',
    region: '',
    provider: '711proxy',
  });
  assert.equal(pool[1].host, 'us.proxy.example');
  assert.equal(pool[1].port, 8080);
});

test('711 fixed-account mode applies region and sticky session parameters', () => {
  const api = loadIpProxyCore();
  const pool = api.getAccountModeProxyPoolFromState({
    ipProxyService: '711proxy',
    ipProxyMode: 'account',
    ipProxyHost: 'global.rotgb.711proxy.com',
    ipProxyPort: '10000',
    ipProxyProtocol: 'http',
    ipProxyUsername: 'USER047152-zone-custom',
    ipProxyPassword: 'secret',
    ipProxyRegion: 'US',
    ipProxyAccountSessionPrefix: 'sticky_001',
    ipProxyAccountLifeMinutes: '30',
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].host, 'global.rotgb.711proxy.com');
  assert.equal(pool[0].port, 10000);
  assert.equal(pool[0].region, 'US');
  assert.match(pool[0].username, /region-US/);
  assert.match(pool[0].username, /session-sticky_001/);
  assert.match(pool[0].username, /sessTime-30/);
});

test('IP proxy PAC keeps local traffic direct and routes target traffic through proxy', () => {
  const api = loadIpProxyCore();
  const pac = api.buildIpProxyPacScript({
    host: 'global.rotgb.711proxy.com',
    port: 10000,
    protocol: 'http',
  });

  assert.match(pac, /FindProxyForURL/);
  assert.match(pac, /localhost/);
  assert.match(pac, /PROXY global\.rotgb\.711proxy\.com:10000/);
  assert.match(pac, /chatgpt\.com/);
  assert.match(pac, /openai\.com/);
});

test('sidepanel loads IP proxy scripts before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const providerIndex = html.indexOf('<script src="ip-proxy-provider-711proxy.js"></script>');
  const panelIndex = html.indexOf('<script src="ip-proxy-panel.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(providerIndex, -1);
  assert.notEqual(panelIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(providerIndex < panelIndex);
  assert.ok(panelIndex < sidepanelIndex);
});

test('IP proxy auto-switch threshold is clamped to the supported range', () => {
  const api = loadIpProxyCore();

  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '0' }), 1);
  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '25' }), 25);
  assert.equal(api.resolveIpProxyAutoSwitchThreshold({ ipProxyPoolTargetCount: '9999' }), 500);
});

test('711 proxy region mismatch with missing auth challenge keeps routing as warning instead of hard failure', () => {
  const api = loadIpProxyCore();

  const status = api.applyExitRegionExpectation({
    applied: true,
    reason: 'applied',
    provider: '711proxy',
    hasAuth: true,
    username: 'USER047152-zone-custom-region-US',
    entrySource: 'fixed_account',
    exitIp: '1.2.3.4',
    exitRegion: 'BR',
    authDiagnostics: 'auth(challenge=0,provided=0,isProxy=n/a,status=0,host=unknown)',
    error: '',
    warning: '',
  }, 'US');

  assert.equal(status.applied, true);
  assert.equal(status.reason, 'applied_with_warning');
  assert.equal(status.error, '');
  assert.match(
    String(status.warning || ''),
    /地区校验未通过且未触发代理鉴权挑战，疑似匿名链路；先保留代理接管并给出强告警/
  );
  assert.match(String(status.warning || ''), /期望 US，实际 BR/);
});
