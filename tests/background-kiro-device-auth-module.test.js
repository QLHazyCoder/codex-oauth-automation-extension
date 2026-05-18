const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadKiroDeviceAuthApi() {
  const source = fs.readFileSync('background/steps/kiro-device-auth.js', 'utf8');
  return new Function('self', `${source}; return self.MultiPageBackgroundKiroDeviceAuth;`)({});
}

function createResponse({ ok = true, status = 200, json = null, text = '' } = {}) {
  const bodyText = text || (json ? JSON.stringify(json) : '');
  return {
    ok,
    status,
    statusText: bodyText || `HTTP ${status}`,
    async text() {
      return bodyText;
    },
  };
}

function mergeUpdates(updatesList = []) {
  return updatesList.reduce((acc, item) => Object.assign(acc, item), {});
}

test('kiro device auth module exposes a factory', () => {
  const api = loadKiroDeviceAuthApi();
  assert.equal(typeof api?.createKiroDeviceAuthExecutor, 'function');
  assert.equal(typeof api?.startBuilderIdDeviceLogin, 'function');
  assert.equal(typeof api?.uploadBuilderIdCredential, 'function');
});

test('kiro start device login registers client, opens auth tab, and completes with runtime payload', async () => {
  const api = loadKiroDeviceAuthApi();
  const fetchCalls = [];
  const stateUpdates = [];
  const registerCalls = [];
  const reuseCalls = [];
  const completeCalls = [];

  const executor = api.createKiroDeviceAuthExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => {
      completeCalls.push({ nodeId, payload });
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (url.endsWith('/client/register')) {
        return createResponse({
          ok: true,
          status: 200,
          json: {
            clientId: 'client-001',
            clientSecret: 'secret-001',
          },
        });
      }
      if (url.endsWith('/device_authorization')) {
        return createResponse({
          ok: true,
          status: 200,
          json: {
            deviceCode: 'device-code-001',
            userCode: 'ABCD-1234',
            verificationUri: 'https://device.example.com/start',
            verificationUriComplete: 'https://device.example.com/complete',
            interval: 7,
            expiresIn: 900,
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    },
    getState: async () => ({
      kiroRegion: 'eu-west-1',
    }),
    registerTab: async (source, tabId) => {
      registerCalls.push({ source, tabId });
    },
    reuseOrCreateTab: async (source, url) => {
      reuseCalls.push({ source, url });
      return 88;
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await executor.executeKiroStartDeviceLogin({
    nodeId: 'kiro-start-device-login',
    kiroRegion: 'eu-west-1',
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://oidc.eu-west-1.amazonaws.com/client/register');
  assert.equal(fetchCalls[1].url, 'https://oidc.eu-west-1.amazonaws.com/device_authorization');
  assert.deepEqual(fetchCalls[1].body, {
    clientId: 'client-001',
    clientSecret: 'secret-001',
    startUrl: 'https://view.awsapps.com/start',
  });
  assert.deepEqual(reuseCalls, [{
    source: 'kiro-device-auth',
    url: 'https://device.example.com/complete',
  }]);
  assert.deepEqual(registerCalls, [{
    source: 'kiro-device-auth',
    tabId: 88,
  }]);

  const finalState = mergeUpdates(stateUpdates);
  assert.equal(finalState.kiroClientId, 'client-001');
  assert.equal(finalState.kiroClientSecret, 'secret-001');
  assert.equal(finalState.kiroDeviceAuthorizationCode, 'device-code-001');
  assert.equal(finalState.kiroDeviceCode, 'ABCD-1234');
  assert.equal(finalState.kiroLoginUrl, 'https://device.example.com/complete');
  assert.equal(finalState.kiroAuthRegion, 'eu-west-1');
  assert.equal(finalState.kiroAuthIntervalSeconds, 7);
  assert.equal(finalState.kiroAuthStatus, 'waiting_user');
  assert.equal(finalState.kiroUploadStatus, 'waiting_login');

  assert.equal(completeCalls.length, 1);
  assert.equal(completeCalls[0].nodeId, 'kiro-start-device-login');
  assert.equal(completeCalls[0].payload.kiroDeviceCode, 'ABCD-1234');
  assert.equal(completeCalls[0].payload.kiroLoginUrl, 'https://device.example.com/complete');
});

test('kiro await device login polls until refresh token is captured', async () => {
  const api = loadKiroDeviceAuthApi();
  const fetchCalls = [];
  const stateUpdates = [];
  const sleepCalls = [];
  const completeCalls = [];

  let pollCount = 0;
  const executor = api.createKiroDeviceAuthExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => {
      completeCalls.push({ nodeId, payload });
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : null,
      });
      pollCount += 1;
      if (pollCount === 1) {
        return createResponse({
          ok: false,
          status: 400,
          json: { error: 'authorization_pending' },
        });
      }
      return createResponse({
        ok: true,
        status: 200,
        json: {
          accessToken: 'access-001',
          refreshToken: 'refresh-001',
          expiresIn: 3600,
        },
      });
    },
    getState: async () => ({
      kiroClientId: 'client-001',
      kiroClientSecret: 'secret-001',
      kiroDeviceAuthorizationCode: 'device-code-001',
      kiroAuthRegion: 'us-east-1',
      kiroAuthExpiresAt: Date.now() + 60000,
      kiroAuthIntervalSeconds: 5,
    }),
    setState: async (updates) => {
      stateUpdates.push(updates);
    },
    sleepWithStop: async (ms) => {
      sleepCalls.push(ms);
    },
    throwIfStopped: () => {},
  });

  await executor.executeKiroAwaitDeviceLogin({
    nodeId: 'kiro-await-device-login',
    kiroClientId: 'client-001',
    kiroClientSecret: 'secret-001',
    kiroDeviceAuthorizationCode: 'device-code-001',
    kiroAuthRegion: 'us-east-1',
    kiroAuthExpiresAt: Date.now() + 60000,
    kiroAuthIntervalSeconds: 5,
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://oidc.us-east-1.amazonaws.com/token');
  assert.deepEqual(fetchCalls[0].body, {
    clientId: 'client-001',
    clientSecret: 'secret-001',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    deviceCode: 'device-code-001',
  });
  assert.deepEqual(sleepCalls, [5000]);

  const finalState = mergeUpdates(stateUpdates);
  assert.equal(finalState.kiroAuthStatus, 'authorized');
  assert.equal(finalState.kiroRefreshToken, 'refresh-001');
  assert.equal(finalState.kiroAccessToken, 'access-001');
  assert.equal(finalState.kiroUploadStatus, 'ready_to_upload');

  assert.equal(completeCalls.length, 1);
  assert.equal(completeCalls[0].nodeId, 'kiro-await-device-login');
  assert.equal(completeCalls[0].payload.kiroRefreshToken, 'refresh-001');
});

test('kiro upload credential checks connection and uploads builder id credential to kiro.rs', async () => {
  const api = loadKiroDeviceAuthApi();
  const fetchCalls = [];
  const stateUpdates = [];
  const completeCalls = [];

  const executor = api.createKiroDeviceAuthExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => {
      completeCalls.push({ nodeId, payload });
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (options.method === 'GET') {
        return createResponse({
          ok: true,
          status: 200,
          json: { success: true },
        });
      }
      return createResponse({
        ok: true,
        status: 200,
        json: {
          success: true,
          message: 'uploaded',
          credentialId: 321,
          email: 'aws-user@example.com',
        },
      });
    },
    getState: async () => ({
      kiroRefreshToken: 'refresh-001',
      kiroClientId: 'client-001',
      kiroClientSecret: 'secret-001',
      kiroAuthRegion: 'ap-southeast-1',
      kiroAuthorizedEmail: 'cached@example.com',
      kiroRsUrl: 'https://kiro.example.com/admin',
      kiroRsKey: 'admin-key-001',
      ipProxyEnabled: true,
      ipProxyProtocol: 'socks5',
      ipProxyHost: '127.0.0.1',
      ipProxyPort: '1080',
      ipProxyUsername: 'proxy-user',
      ipProxyPassword: 'proxy-pass',
    }),
    setState: async (updates) => {
      stateUpdates.push(updates);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await executor.executeKiroUploadCredential({
    nodeId: 'kiro-upload-credential',
    kiroRefreshToken: 'refresh-001',
    kiroClientId: 'client-001',
    kiroClientSecret: 'secret-001',
    kiroAuthRegion: 'ap-southeast-1',
    kiroAuthorizedEmail: 'cached@example.com',
    kiroRsUrl: 'https://kiro.example.com/admin',
    kiroRsKey: 'admin-key-001',
    ipProxyEnabled: true,
    ipProxyProtocol: 'socks5',
    ipProxyHost: '127.0.0.1',
    ipProxyPort: '1080',
    ipProxyUsername: 'proxy-user',
    ipProxyPassword: 'proxy-pass',
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://kiro.example.com/api/admin/credentials');
  assert.equal(fetchCalls[0].method, 'GET');
  assert.equal(fetchCalls[0].headers['x-api-key'], 'admin-key-001');

  assert.equal(fetchCalls[1].url, 'https://kiro.example.com/api/admin/credentials');
  assert.equal(fetchCalls[1].method, 'POST');
  assert.equal(fetchCalls[1].headers['x-api-key'], 'admin-key-001');
  assert.deepEqual(fetchCalls[1].body, {
    refreshToken: 'refresh-001',
    clientId: 'client-001',
    clientSecret: 'secret-001',
    region: 'ap-southeast-1',
    email: 'cached@example.com',
    priority: 0,
    authMethod: 'IdC',
    provider: 'BuilderId',
    proxyUrl: 'socks5://127.0.0.1:1080',
    proxyUsername: 'proxy-user',
    proxyPassword: 'proxy-pass',
  });

  const finalState = mergeUpdates(stateUpdates);
  assert.equal(finalState.kiroLastConnectionMessage, 'kiro.rs connection ok (HTTP 200)');
  assert.equal(finalState.kiroAuthorizedEmail, 'aws-user@example.com');
  assert.equal(finalState.kiroCredentialId, 321);
  assert.equal(finalState.kiroUploadStatus, 'uploaded');
  assert.equal(typeof finalState.kiroLastUploadAt, 'number');
  assert.equal(finalState.kiroLastUploadAt > 0, true);

  assert.equal(completeCalls.length, 1);
  assert.equal(completeCalls[0].nodeId, 'kiro-upload-credential');
  assert.equal(completeCalls[0].payload.kiroCredentialId, 321);
  assert.equal(completeCalls[0].payload.kiroUploadStatus, 'uploaded');
});
