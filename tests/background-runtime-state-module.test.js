const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadRuntimeStateApi() {
  const source = fs.readFileSync('background/runtime-state.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundRuntimeState;`)(globalScope);
}

test('background imports runtime-state module and wires state view helpers', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/runtime-state\.js/);
  assert.match(source, /createRuntimeStateHelpers/);
  assert.match(source, /buildStateViewWithRuntimeState/);
  assert.match(source, /buildStatePatchWithRuntimeState/);
  assert.match(source, /runtimeState:/);
});

test('background keeps runtime-only OpenAI defaults behind runtime-state compatibility helpers', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  const defaultStateStart = source.indexOf('const DEFAULT_STATE = {');
  const defaultStateEnd = source.indexOf('function normalizeAutoRunDelayMinutes');
  const defaultStateBlock = source.slice(defaultStateStart, defaultStateEnd);

  assert.match(source, /getRuntimeFieldDefaults:\s*\(\)\s*=>\s*getRuntimeCompatFieldDefaults\(\)/);
  assert.match(source, /function getRuntimeCompatFieldDefaults\(\)/);
  assert.doesNotMatch(defaultStateBlock, /\boauthUrl:/);
  assert.doesNotMatch(defaultStateBlock, /\bregistrationEmailState:/);
  assert.doesNotMatch(defaultStateBlock, /\bplusCheckoutTabId:/);
  assert.doesNotMatch(defaultStateBlock, /\bipProxyApiPool:/);
  assert.doesNotMatch(defaultStateBlock, /\bcurrentLuckmailPurchase:/);
  assert.doesNotMatch(defaultStateBlock, /\bcurrentPhoneActivation:/);
});

test('runtime-state module exposes a factory', () => {
  const api = loadRuntimeStateApi();
  assert.equal(typeof api?.createRuntimeStateHelpers, 'function');
});

test('runtime-state view rehydrates flat compatibility fields from canonical runtime state', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      1: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        1: { id: 1, key: 'open-chatgpt' },
      }[Number(step)] || null;
    },
    getRuntimeFieldDefaults() {
      return {
        oauthUrl: null,
        plusCheckoutCountry: 'DE',
        registrationEmailState: {
          current: '',
          previous: '',
          source: '',
          updatedAt: 0,
        },
        currentPhoneActivation: null,
        signupVerificationRequestedAt: null,
        tabRegistry: {},
      };
    },
  });

  const view = helpers.buildStateView({
    oauthUrl: 'https://stale.example.com/oauth',
    runtimeState: {
      sharedState: {
        tabRegistry: {
          auth: { tabId: 7 },
        },
      },
      flowState: {
        openai: {
          auth: {
            oauthUrl: 'https://nested.example.com/oauth',
            signupVerificationRequestedAt: 123,
          },
          plus: {
            plusCheckoutCountry: 'FR',
          },
          phoneVerification: {
            currentPhoneActivation: {
              activationId: 'active-2',
            },
          },
          identity: {
            registrationEmailState: {
              current: 'fresh@example.com',
              previous: 'old@example.com',
              source: 'flow',
              updatedAt: 456,
            },
          },
        },
      },
    },
  });

  assert.equal(view.oauthUrl, 'https://nested.example.com/oauth');
  assert.equal(view.signupVerificationRequestedAt, 123);
  assert.equal(view.plusCheckoutCountry, 'FR');
  assert.deepStrictEqual(view.tabRegistry, {
    auth: { tabId: 7 },
  });
  assert.deepStrictEqual(view.currentPhoneActivation, {
    activationId: 'active-2',
  });
  assert.deepStrictEqual(view.registrationEmailState, {
    current: 'fresh@example.com',
    previous: 'old@example.com',
    source: 'flow',
    updatedAt: 456,
  });
});

test('runtime-state patch exports flat compatibility fields from canonical runtime updates', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      1: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        1: { id: 1, key: 'open-chatgpt' },
      }[Number(step)] || null;
    },
    getRuntimeFieldDefaults() {
      return {
        oauthUrl: null,
        currentLuckmailPurchase: null,
        currentPhoneActivation: null,
        ipProxyApiPool: [],
        plusCheckoutCountry: 'DE',
      };
    },
  });

  const patch = helpers.buildSessionStatePatch({}, {
    runtimeState: {
      sharedState: {
        automationWindowId: 99,
      },
      serviceState: {
        proxy: {
          ipProxyApiPool: [{ id: 'proxy-1' }],
        },
      },
      flowState: {
        openai: {
          auth: {
            oauthUrl: 'https://runtime.example.com/oauth',
          },
          luckmail: {
            currentLuckmailPurchase: { id: 11 },
          },
          phoneVerification: {
            currentPhoneActivation: { activationId: 'active-3' },
          },
          plus: {
            plusCheckoutCountry: 'JP',
          },
        },
      },
    },
  });

  assert.equal(patch.automationWindowId, 99);
  assert.equal(patch.oauthUrl, 'https://runtime.example.com/oauth');
  assert.equal(patch.plusCheckoutCountry, 'JP');
  assert.deepStrictEqual(patch.currentLuckmailPurchase, { id: 11 });
  assert.deepStrictEqual(patch.currentPhoneActivation, { activationId: 'active-3' });
  assert.deepStrictEqual(patch.ipProxyApiPool, [{ id: 'proxy-1' }]);
});

test('runtime-state view derives canonical flow metadata from legacy step state', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      1: 'pending',
      2: 'pending',
      10: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        1: { id: 1, key: 'open-chatgpt' },
        2: { id: 2, key: 'submit-signup-email' },
        10: { id: 10, key: 'oauth-login' },
      }[Number(step)] || null;
    },
  });

  const view = helpers.buildStateView({
    currentStep: 2,
    stepStatuses: {
      1: 'completed',
      2: 'running',
    },
    oauthUrl: 'https://auth.example.com/start',
    plusCheckoutTabId: 88,
    currentPhoneActivation: {
      activationId: 'active-1',
      phoneNumber: '+447700900123',
    },
    tabRegistry: {
      'signup-page': { tabId: 12 },
    },
    sourceLastUrls: {
      'signup-page': 'https://auth.example.com/start',
    },
    flowStartTime: 12345,
  });

  assert.equal(view.activeFlowId, 'openai');
  assert.equal(view.currentNodeId, 'submit-signup-email');
  assert.deepStrictEqual(view.legacyStepCompat, {
    currentStep: 2,
    stepStatuses: {
      1: 'completed',
      2: 'running',
      10: 'pending',
    },
  });
  assert.deepStrictEqual(view.nodeStatuses, {
    'open-chatgpt': 'completed',
    'submit-signup-email': 'running',
    'oauth-login': 'pending',
  });
  assert.equal(view.runtimeState.flowState.openai.auth.oauthUrl, 'https://auth.example.com/start');
  assert.equal(view.runtimeState.flowState.openai.plus.plusCheckoutTabId, 88);
  assert.deepStrictEqual(view.runtimeState.flowState.openai.phoneVerification.currentPhoneActivation, {
    activationId: 'active-1',
    phoneNumber: '+447700900123',
  });
  assert.deepStrictEqual(view.sharedState, {
    tabRegistry: {
      'signup-page': { tabId: 12 },
    },
    sourceLastUrls: {
      'signup-page': 'https://auth.example.com/start',
    },
    flowStartTime: 12345,
  });
});

test('runtime-state patch accepts nested flow updates while keeping legacy compatibility fields in sync', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      1: 'pending',
      2: 'pending',
      10: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        1: { id: 1, key: 'open-chatgpt' },
        2: { id: 2, key: 'submit-signup-email' },
        10: { id: 10, key: 'oauth-login' },
      }[Number(step)] || null;
    },
  });

  const patch = helpers.buildSessionStatePatch({
    currentStep: 1,
    stepStatuses: {
      1: 'running',
      2: 'pending',
      10: 'pending',
    },
    oauthUrl: 'https://old.example.com/start',
  }, {
    runtimeState: {
      activeRunId: 'run-001',
      flowState: {
        openai: {
          auth: {
            oauthUrl: 'https://new.example.com/start',
          },
          plus: {
            plusCheckoutTabId: 99,
          },
        },
      },
      legacyStepCompat: {
        currentStep: 10,
        stepStatuses: {
          1: 'completed',
          10: 'running',
        },
      },
    },
  });

  assert.equal(patch.activeFlowId, 'openai');
  assert.equal(patch.activeRunId, 'run-001');
  assert.equal(patch.currentNodeId, 'oauth-login');
  assert.equal(patch.oauthUrl, 'https://new.example.com/start');
  assert.equal(patch.plusCheckoutTabId, 99);
  assert.equal(patch.currentStep, 10);
  assert.deepStrictEqual(patch.stepStatuses, {
    1: 'completed',
    2: 'pending',
    10: 'running',
  });
  assert.deepStrictEqual(patch.nodeStatuses, {
    'open-chatgpt': 'completed',
    'submit-signup-email': 'pending',
    'oauth-login': 'running',
  });
  assert.equal(patch.runtimeState.flowState.openai.auth.oauthUrl, 'https://new.example.com/start');
  assert.equal(patch.runtimeState.flowState.openai.plus.plusCheckoutTabId, 99);
});

test('runtime-state patch re-derives node and display step statuses from legacy step updates', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      7: 'pending',
      8: 'pending',
      9: 'pending',
      10: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        7: { id: 7, key: 'oauth-login' },
        8: { id: 8, key: 'fetch-login-code' },
        9: { id: 9, key: 'confirm-oauth' },
        10: { id: 10, key: 'platform-verify' },
      }[Number(step)] || null;
    },
    getResolvedStepsForState() {
      return [
        { id: 7, key: 'oauth-login', statusKey: 'oauth-login', stepId: 7, executableStepId: 7, displayOnly: false },
        { id: 8, key: 'fetch-login-code', statusKey: 'fetch-login-code', stepId: 8, executableStepId: 8, displayOnly: false },
        { id: '8:phone-verification', key: 'phone-verification', statusKey: 'phone-verification', displayOnly: true },
        { id: 9, key: 'confirm-oauth', statusKey: 'confirm-oauth', stepId: 9, executableStepId: 9, displayOnly: false },
        { id: 10, key: 'platform-verify', statusKey: 'platform-verify', stepId: 10, executableStepId: 10, displayOnly: false },
      ];
    },
  });

  const patch = helpers.buildSessionStatePatch({
    activeFlowId: 'openai',
    phoneVerificationEnabled: true,
    signupMethod: 'email',
    currentStep: 7,
    currentNodeId: 'oauth-login',
    stepStatuses: {
      7: 'running',
      8: 'pending',
      9: 'pending',
      10: 'pending',
    },
    displayStepStatuses: {
      'phone-verification': 'failed',
    },
    nodeStatuses: {
      'oauth-login': 'running',
      'fetch-login-code': 'pending',
      'phone-verification': 'failed',
      'confirm-oauth': 'pending',
      'platform-verify': 'pending',
    },
  }, {
    currentStep: 8,
    stepStatuses: {
      7: 'completed',
      8: 'running',
      9: 'pending',
      10: 'pending',
    },
    displayStepStatuses: {
      'phone-verification': 'completed',
    },
  });

  assert.equal(patch.currentNodeId, 'fetch-login-code');
  assert.deepStrictEqual(patch.nodeStatuses, {
    'oauth-login': 'completed',
    'fetch-login-code': 'running',
    'phone-verification': 'completed',
    'confirm-oauth': 'pending',
    'platform-verify': 'pending',
  });
  assert.deepStrictEqual(patch.displayStepStatuses, {
    'phone-verification': 'completed',
  });
});

test('runtime-state view derives display-only status from node status when compat map is missing', () => {
  const api = loadRuntimeStateApi();
  const helpers = api.createRuntimeStateHelpers({
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    defaultStepStatuses: {
      8: 'pending',
      9: 'pending',
    },
    getStepDefinitionForState(step) {
      return {
        8: { id: 8, key: 'fetch-login-code' },
        9: { id: 9, key: 'confirm-oauth' },
      }[Number(step)] || null;
    },
    getResolvedStepsForState() {
      return [
        { id: 8, key: 'fetch-login-code', statusKey: 'fetch-login-code', stepId: 8, executableStepId: 8, displayOnly: false },
        { id: '8:phone-verification', key: 'phone-verification', statusKey: 'phone-verification', displayOnly: true },
        { id: 9, key: 'confirm-oauth', statusKey: 'confirm-oauth', stepId: 9, executableStepId: 9, displayOnly: false },
      ];
    },
  });

  const view = helpers.buildStateView({
    activeFlowId: 'openai',
    phoneVerificationEnabled: true,
    signupMethod: 'email',
    currentStep: 8,
    stepStatuses: {
      8: 'completed',
      9: 'pending',
    },
    nodeStatuses: {
      'fetch-login-code': 'completed',
      'phone-verification': 'skipped',
      'confirm-oauth': 'pending',
    },
  });

  assert.deepStrictEqual(view.displayStepStatuses, {
    'phone-verification': 'skipped',
  });
});
