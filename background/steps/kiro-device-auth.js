(function attachBackgroundKiroDeviceAuth(root, factory) {
  root.MultiPageBackgroundKiroDeviceAuth = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundKiroDeviceAuthModule() {
  const DEFAULT_REGION = 'us-east-1';
  const DEVICE_LOGIN_START_URL = 'https://view.awsapps.com/start';
  const DEFAULT_SCOPES = Object.freeze([
    'codewhisperer:completions',
    'codewhisperer:analysis',
    'codewhisperer:conversations',
    'codewhisperer:transformations',
    'codewhisperer:taskassist',
  ]);

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function normalizeRegion(value = '', fallback = DEFAULT_REGION) {
    return cleanString(value) || fallback;
  }

  function buildOidcBaseUrl(region = DEFAULT_REGION) {
    return `https://oidc.${normalizeRegion(region)}.amazonaws.com`;
  }

  function normalizeKiroRsBaseUrl(value = '') {
    const normalized = cleanString(value).replace(/\/+$/, '');
    if (!normalized) {
      throw new Error('Missing kiro.rs admin URL.');
    }
    return normalized.endsWith('/admin')
      ? normalized.slice(0, -'/admin'.length)
      : normalized;
  }

  async function readResponse(response) {
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_error) {
      json = null;
    }
    return { text, json };
  }

  function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? 'Unknown error');
  }

  function normalizePositiveInteger(value, fallback) {
    const numeric = Math.floor(Number(value));
    if (Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }
    return fallback;
  }

  function buildCredentialUploadOptions(state = {}) {
    const next = {
      priority: Math.max(0, Math.floor(Number(state?.kiroRsPriority) || 0)),
      authMethod: 'IdC',
      provider: 'BuilderId',
    };

    const endpoint = cleanString(state?.kiroRsEndpoint);
    const authRegion = cleanString(state?.kiroRsAuthRegion);
    const apiRegion = cleanString(state?.kiroRsApiRegion);
    if (endpoint) {
      next.endpoint = endpoint;
    }
    if (authRegion) {
      next.authRegion = authRegion;
    }
    if (apiRegion) {
      next.apiRegion = apiRegion;
    }

    if (state?.ipProxyEnabled) {
      const proxyUrl = cleanString(state?.ipProxyApiUrl)
        || (() => {
          const host = cleanString(state?.ipProxyHost);
          const port = cleanString(state?.ipProxyPort);
          if (!host || !port) {
            return '';
          }
          const protocol = cleanString(state?.ipProxyProtocol) || 'http';
          return `${protocol}://${host}:${port}`;
        })();
      if (proxyUrl) {
        next.proxyUrl = proxyUrl;
      }
      const proxyUsername = cleanString(state?.ipProxyUsername);
      const proxyPassword = String(state?.ipProxyPassword || '');
      if (proxyUsername) {
        next.proxyUsername = proxyUsername;
      }
      if (proxyPassword) {
        next.proxyPassword = proxyPassword;
      }
    }

    return next;
  }

  async function startBuilderIdDeviceLogin(region, fetchImpl) {
    const normalizedRegion = normalizeRegion(region);
    const oidcBaseUrl = buildOidcBaseUrl(normalizedRegion);
    const registerResponse = await fetchImpl(`${oidcBaseUrl}/client/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientName: 'Codex Registration Extension',
        clientType: 'public',
        scopes: DEFAULT_SCOPES,
        grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
        issuerUrl: DEVICE_LOGIN_START_URL,
      }),
    });
    const registerBody = await readResponse(registerResponse);
    if (!registerResponse.ok) {
      throw new Error(`Builder ID client registration failed: ${cleanString(registerBody.text || registerResponse.statusText) || registerResponse.status}`);
    }

    const clientId = cleanString(registerBody.json?.clientId);
    const clientSecret = String(registerBody.json?.clientSecret || '');
    if (!clientId || !clientSecret) {
      throw new Error('Builder ID client registration response is missing client credentials.');
    }

    const authorizationResponse = await fetchImpl(`${oidcBaseUrl}/device_authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl: DEVICE_LOGIN_START_URL,
      }),
    });
    const authorizationBody = await readResponse(authorizationResponse);
    if (!authorizationResponse.ok) {
      throw new Error(`Builder ID device authorization failed: ${cleanString(authorizationBody.text || authorizationResponse.statusText) || authorizationResponse.status}`);
    }

    const deviceCode = String(authorizationBody.json?.deviceCode || '');
    const userCode = cleanString(authorizationBody.json?.userCode);
    const verificationUri = cleanString(authorizationBody.json?.verificationUri);
    const verificationUriComplete = cleanString(
      authorizationBody.json?.verificationUriComplete || verificationUri
    );
    const interval = normalizePositiveInteger(authorizationBody.json?.interval, 5);
    const expiresIn = normalizePositiveInteger(authorizationBody.json?.expiresIn, 600);
    if (!deviceCode || !userCode || !verificationUriComplete) {
      throw new Error('Builder ID device authorization response is missing required fields.');
    }

    return {
      clientId,
      clientSecret,
      deviceCode,
      expiresAt: Date.now() + expiresIn * 1000,
      expiresIn,
      interval,
      region: normalizedRegion,
      userCode,
      verificationUri,
      verificationUriComplete,
    };
  }

  async function pollBuilderIdDeviceAuth(params = {}, fetchImpl) {
    const oidcBaseUrl = buildOidcBaseUrl(params.region);
    const response = await fetchImpl(`${oidcBaseUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: params.clientId,
        clientSecret: params.clientSecret,
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        deviceCode: params.deviceCode,
      }),
    });
    const body = await readResponse(response);
    if (response.status === 200) {
      return {
        completed: true,
        accessToken: String(body.json?.accessToken || ''),
        refreshToken: String(body.json?.refreshToken || ''),
        expiresIn: normalizePositiveInteger(body.json?.expiresIn, 3600),
        region: normalizeRegion(params.region),
      };
    }
    if (response.status === 400) {
      const errorCode = cleanString(body.json?.error);
      if (errorCode === 'authorization_pending') {
        return { completed: false, status: 'pending' };
      }
      if (errorCode === 'slow_down') {
        return { completed: false, status: 'slow_down' };
      }
      if (errorCode === 'expired_token') {
        throw new Error('Kiro device login expired.');
      }
      if (errorCode === 'access_denied') {
        throw new Error('User denied the Builder ID device login request.');
      }
      throw new Error(`Builder ID authorization failed: ${errorCode || cleanString(body.text || response.statusText) || response.status}`);
    }
    throw new Error(`Builder ID token request failed: HTTP ${response.status}`);
  }

  async function checkKiroRsConnection(baseUrl, apiKey, fetchImpl) {
    const normalizedBaseUrl = normalizeKiroRsBaseUrl(baseUrl);
    const response = await fetchImpl(`${normalizedBaseUrl}/api/admin/credentials`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-api-key': String(apiKey || ''),
      },
    });
    const body = await readResponse(response);
    if (response.ok) {
      return {
        ok: true,
        message: `kiro.rs connection ok (HTTP ${response.status})`,
      };
    }
    if (response.status === 405) {
      return {
        ok: true,
        message: 'kiro.rs upload endpoint is reachable.',
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: `kiro.rs API key rejected (HTTP ${response.status})`,
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        message: 'kiro.rs admin endpoint not found.',
      };
    }
    return {
      ok: false,
      message: cleanString(body.json?.error?.message || body.json?.message || body.text || response.statusText)
        || `kiro.rs connection failed (HTTP ${response.status})`,
    };
  }

  async function uploadBuilderIdCredential(baseUrl, apiKey, payload, fetchImpl) {
    const normalizedBaseUrl = normalizeKiroRsBaseUrl(baseUrl);
    const response = await fetchImpl(`${normalizedBaseUrl}/api/admin/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': String(apiKey || ''),
      },
      body: JSON.stringify(payload),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      const message = cleanString(body.json?.error?.message || body.json?.message || body.text || response.statusText)
        || `HTTP ${response.status}`;
      throw new Error(`kiro.rs credential upload failed: ${message}`);
    }

    return {
      credentialId: Number(body.json?.credentialId || body.json?.credential_id || 0) || null,
      email: cleanString(body.json?.email),
      message: cleanString(body.json?.message) || 'Credential uploaded.',
      raw: body.json,
    };
  }

  function createKiroDeviceAuthExecutor(deps = {}) {
    const {
      addLog = async () => {},
      completeNodeFromBackground,
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getState = async () => ({}),
      registerTab = async () => {},
      reuseOrCreateTab = async () => null,
      setState = async () => {},
      sleepWithStop = async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      },
      throwIfStopped = () => {},
    } = deps;

    if (typeof completeNodeFromBackground !== 'function') {
      throw new Error('Kiro device auth executor requires completeNodeFromBackground.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('Kiro device auth executor requires fetch support.');
    }

    async function log(message, level, nodeId) {
      await addLog(message, level, { nodeId });
    }

    async function getExecutionState(state = {}) {
      if (state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length) {
        return state;
      }
      return getState();
    }

    async function persistFailure(updates = {}) {
      if (updates && Object.keys(updates).length) {
        await setState(updates);
      }
    }

    async function executeKiroStartDeviceLogin(state = {}) {
      const nodeId = String(state?.nodeId || 'kiro-start-device-login').trim();
      try {
        const latestState = await getExecutionState(state);
        const auth = await startBuilderIdDeviceLogin(
          latestState.kiroRegion || DEFAULT_REGION,
          fetchImpl
        );
        const loginUrl = cleanString(auth.verificationUriComplete || auth.verificationUri);
        const tabId = loginUrl ? await reuseOrCreateTab('kiro-device-auth', loginUrl) : null;
        if (Number.isInteger(tabId)) {
          await registerTab('kiro-device-auth', tabId);
        }

        const updates = {
          kiroAccessToken: '',
          kiroAuthError: '',
          kiroAuthExpiresAt: auth.expiresAt,
          kiroAuthIntervalSeconds: auth.interval,
          kiroAuthRegion: auth.region,
          kiroAuthStatus: 'waiting_user',
          kiroAuthTabId: Number.isInteger(tabId) ? tabId : null,
          kiroClientId: auth.clientId,
          kiroClientSecret: auth.clientSecret,
          kiroCredentialId: null,
          kiroDeviceAuthorizationCode: auth.deviceCode,
          kiroDeviceCode: auth.userCode,
          kiroLastConnectionMessage: '',
          kiroLastUploadAt: 0,
          kiroLoginUrl: loginUrl,
          kiroRefreshToken: '',
          kiroUploadError: '',
          kiroUploadStatus: 'waiting_login',
          kiroUserCode: auth.userCode,
          kiroVerificationUri: auth.verificationUri,
          kiroVerificationUriComplete: loginUrl,
        };

        await setState(updates);
        await log(`Kiro device login started. Open ${loginUrl} and approve with code ${auth.userCode}.`, 'info', nodeId);
        await completeNodeFromBackground(nodeId, updates);
      } catch (error) {
        const message = getErrorMessage(error);
        await persistFailure({
          kiroAuthError: message,
          kiroAuthStatus: 'error',
        });
        throw error;
      }
    }

    async function executeKiroAwaitDeviceLogin(state = {}) {
      const nodeId = String(state?.nodeId || 'kiro-await-device-login').trim();
      try {
        const latestState = await getExecutionState(state);
        const clientId = cleanString(latestState.kiroClientId);
        const clientSecret = String(latestState.kiroClientSecret || '');
        const deviceCode = String(latestState.kiroDeviceAuthorizationCode || '');
        const region = normalizeRegion(latestState.kiroAuthRegion || latestState.kiroRegion || DEFAULT_REGION);
        const expiresAt = Math.max(0, Number(latestState.kiroAuthExpiresAt) || 0);
        if (!clientId || !clientSecret || !deviceCode) {
          throw new Error('Kiro device login has not been started yet.');
        }
        if (!expiresAt || expiresAt <= Date.now()) {
          throw new Error('Kiro device login expired. Restart step 1.');
        }

        await setState({
          kiroAuthError: '',
          kiroAuthStatus: 'waiting_user',
          kiroUploadStatus: 'waiting_login',
        });
        await log('Waiting for Kiro device login approval...', 'info', nodeId);

        let intervalSeconds = normalizePositiveInteger(latestState.kiroAuthIntervalSeconds, 5);
        while (Date.now() < expiresAt) {
          throwIfStopped();
          const result = await pollBuilderIdDeviceAuth({
            clientId,
            clientSecret,
            deviceCode,
            region,
          }, fetchImpl);
          if (result.completed) {
            const updates = {
              kiroAccessToken: result.accessToken,
              kiroAuthError: '',
              kiroAuthStatus: 'authorized',
              kiroRefreshToken: result.refreshToken,
              kiroUploadError: '',
              kiroUploadStatus: 'ready_to_upload',
            };
            await setState(updates);
            await log('Kiro device login approved. Refresh token captured.', 'ok', nodeId);
            await completeNodeFromBackground(nodeId, updates);
            return;
          }

          if (result.status === 'slow_down') {
            intervalSeconds = Math.max(intervalSeconds + 5, 10);
          }
          await sleepWithStop(intervalSeconds * 1000);
        }

        throw new Error('Kiro device login expired. Restart step 1.');
      } catch (error) {
        const message = getErrorMessage(error);
        await persistFailure({
          kiroAuthError: message,
          kiroAuthStatus: /expired/i.test(message) ? 'expired' : 'error',
        });
        throw error;
      }
    }

    async function executeKiroUploadCredential(state = {}) {
      const nodeId = String(state?.nodeId || 'kiro-upload-credential').trim();
      try {
        const latestState = await getExecutionState(state);
        const refreshToken = String(latestState.kiroRefreshToken || '');
        const clientId = cleanString(latestState.kiroClientId);
        const clientSecret = String(latestState.kiroClientSecret || '');
        const region = normalizeRegion(latestState.kiroAuthRegion || latestState.kiroRegion || DEFAULT_REGION);
        const kiroRsUrl = String(latestState.kiroRsUrl || '');
        const kiroRsKey = String(latestState.kiroRsKey || '');
        if (!refreshToken || !clientId || !clientSecret) {
          throw new Error('Kiro refresh token is missing. Complete step 2 first.');
        }
        if (!cleanString(kiroRsUrl)) {
          throw new Error('Missing kiro.rs admin URL.');
        }
        if (!cleanString(kiroRsKey)) {
          throw new Error('Missing kiro.rs API key.');
        }

        await setState({
          kiroUploadError: '',
          kiroUploadStatus: 'uploading',
        });
        await log('Uploading Builder ID credential to kiro.rs...', 'info', nodeId);

        const connection = await checkKiroRsConnection(kiroRsUrl, kiroRsKey, fetchImpl);
        await setState({
          kiroLastConnectionMessage: connection.message,
        });
        if (!connection.ok) {
          throw new Error(connection.message);
        }

        const uploadOptions = buildCredentialUploadOptions(latestState);
        const uploadPayload = {
          refreshToken,
          clientId,
          clientSecret,
          region,
          ...(cleanString(latestState.kiroAuthorizedEmail)
            ? { email: cleanString(latestState.kiroAuthorizedEmail) }
            : {}),
          ...uploadOptions,
        };
        const uploadResult = await uploadBuilderIdCredential(
          kiroRsUrl,
          kiroRsKey,
          uploadPayload,
          fetchImpl
        );
        const updates = {
          kiroAuthorizedEmail: uploadResult.email || cleanString(latestState.kiroAuthorizedEmail),
          kiroCredentialId: uploadResult.credentialId,
          kiroLastUploadAt: Date.now(),
          kiroUploadError: '',
          kiroUploadStatus: uploadResult.message || 'uploaded',
        };

        await setState(updates);
        await log(`kiro.rs upload completed: ${updates.kiroUploadStatus}`, 'ok', nodeId);
        await completeNodeFromBackground(nodeId, updates);
      } catch (error) {
        const message = getErrorMessage(error);
        await persistFailure({
          kiroUploadError: message,
          kiroUploadStatus: 'error',
        });
        throw error;
      }
    }

    return {
      executeKiroAwaitDeviceLogin,
      executeKiroStartDeviceLogin,
      executeKiroUploadCredential,
    };
  }

  return {
    buildCredentialUploadOptions,
    checkKiroRsConnection,
    createKiroDeviceAuthExecutor,
    normalizeKiroRsBaseUrl,
    pollBuilderIdDeviceAuth,
    startBuilderIdDeviceLogin,
    uploadBuilderIdCredential,
  };
});
