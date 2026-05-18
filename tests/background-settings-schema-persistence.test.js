const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flowRegistrySource = fs.readFileSync('shared/flow-registry.js', 'utf8');
const settingsSchemaSource = fs.readFileSync('shared/settings-schema.js', 'utf8');
const backgroundSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => backgroundSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < backgroundSource.length; i += 1) {
    const ch = backgroundSource[i];
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    }
    if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < backgroundSource.length; end += 1) {
    const ch = backgroundSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return backgroundSource.slice(start, end);
}

function buildHarness(extra = '') {
  return new Function(`
const self = {};
${flowRegistrySource}
${settingsSchemaSource}
const DEFAULT_ACTIVE_FLOW_ID = 'openai';
const DEFAULT_SUB2API_GROUP_NAMES = ['codex', 'openai-plus'];
const PERSISTED_SETTING_DEFAULTS = {
  activeFlowId: DEFAULT_ACTIVE_FLOW_ID,
  panelMode: 'cpa',
  signupMethod: 'email',
  plusModeEnabled: false,
  plusPaymentMethod: 'paypal',
  phoneVerificationEnabled: false,
  mailProvider: '163',
  ipProxyEnabled: false,
  ipProxyService: '711proxy',
  ipProxyMode: 'account',
  kiroSourceId: 'kiro-rs',
  kiroRsUrl: 'https://kiro.leftcode.xyz/admin',
  kiroRsKey: '',
  kiroRegion: 'us-east-1',
  stepExecutionRangeByFlow: {},
};
const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const PERSISTED_SETTINGS_SCHEMA_KEYS = ['settingsSchemaVersion', 'settingsState'];
const LEGACY_AUTO_STEP_DELAY_KEYS = [];
const LEGACY_VERIFICATION_RESEND_COUNT_KEYS = [];
function normalizePanelMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'sub2api' || normalized === 'codex2api' ? normalized : 'cpa';
}
function normalizeSignupMethod(value = '') {
  return String(value || '').trim().toLowerCase() === 'phone' ? 'phone' : 'email';
}
function normalizePlusPaymentMethod(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'gopay' || normalized === 'gpc-helper' ? normalized : 'paypal';
}
function normalizeSub2ApiGroupNames(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}
function normalizeCloudflareDomains(value) { return Array.isArray(value) ? value : []; }
function normalizeCloudflareTempEmailDomains(value) { return Array.isArray(value) ? value : []; }
function normalizeCloudMailDomains(value) { return Array.isArray(value) ? value : []; }
function normalizeMailProvider(value = '') { return String(value || '163').trim().toLowerCase() || '163'; }
function normalizeStepExecutionRangeByFlow(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function normalizeIpProxyProviderValue(value) { return String(value || '711proxy').trim() || '711proxy'; }
function normalizeIpProxyMode(value) { return String(value || 'account').trim() || 'account'; }
function normalizeIpProxyServiceProfiles(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function buildIpProxyServiceProfileFromState() {
  return {
    mode: 'account',
    apiUrl: '',
    accountList: '',
    accountSessionPrefix: '',
    accountLifeMinutes: '',
    poolTargetCount: '20',
    host: '',
    port: '',
    protocol: 'http',
    username: '',
    password: '',
    region: '',
  };
}
function normalizeIpProxyAccountList(value) { return String(value || ''); }
function normalizeIpProxyAccountSessionPrefix(value) { return String(value || ''); }
function normalizeIpProxyAccountLifeMinutes(value) { return String(value || ''); }
function normalizeIpProxyPoolTargetCount(value) { return String(value || '20'); }
function normalizeIpProxyPort(value) { return String(value || '').trim(); }
function normalizeIpProxyProtocol(value) { return String(value || 'http').trim() || 'http'; }
function resolveSignupMethod(state = {}) {
  const activeFlowId = String(state?.activeFlowId || DEFAULT_ACTIVE_FLOW_ID).trim().toLowerCase() || DEFAULT_ACTIVE_FLOW_ID;
  if (activeFlowId === 'kiro') {
    return 'email';
  }
  return String(state?.signupMethod || '').trim().toLowerCase() === 'phone' ? 'phone' : 'email';
}
function resolveLegacyAutoStepDelaySeconds() { return undefined; }
${extractFunction('normalizePersistentSettingValue')}
${extractFunction('getSettingsSchemaApi')}
${extractFunction('buildPersistentSettingsPayload')}
${extractFunction('getPersistedSettings')}
${extractFunction('setPersistentSettings')}
${extra}
return {
  buildPersistentSettingsPayload,
  getPersistedSettings,
  setPersistentSettings,
  getRequestedKeys: typeof getRequestedKeys === 'function' ? getRequestedKeys : () => [],
  getPersistedWrites: typeof getPersistedWrites === 'function' ? getPersistedWrites : () => [],
};
`)();
}

test('buildPersistentSettingsPayload writes canonical settings schema into persisted payloads when defaults are materialized', () => {
  const api = buildHarness();

  const payload = api.buildPersistentSettingsPayload({
    activeFlowId: 'kiro',
    kiroRsUrl: 'https://kiro.example.com/admin',
    kiroRsKey: 'secret-key',
    kiroRegion: 'eu-west-1',
  }, { fillDefaults: true });

  assert.equal(payload.activeFlowId, 'kiro');
  assert.equal(payload.kiroSourceId, 'kiro-rs');
  assert.equal(payload.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(payload.kiroRsKey, 'secret-key');
  assert.equal(payload.kiroRegion, 'eu-west-1');
  assert.equal(payload.settingsSchemaVersion, 3);
  assert.equal(payload.settingsState.activeFlowId, 'kiro');
  assert.equal(payload.settingsState.flows.kiro.source.selected, 'kiro-rs');
});

test('buildPersistentSettingsPayload accepts schema-only input when requireKnownKeys is enabled', () => {
  const api = buildHarness();

  const payload = api.buildPersistentSettingsPayload({
    settingsSchemaVersion: 3,
    settingsState: {
      activeFlowId: 'kiro',
      services: {
        email: { provider: '163' },
        proxy: { enabled: false, provider: '711proxy', mode: 'account' },
      },
      flows: {
        openai: {
          source: { selected: 'cpa', entries: {} },
          account: { customPassword: '' },
          signup: {
            signupMethod: 'email',
            phoneVerificationEnabled: false,
            phoneSignupReloginAfterBindEmailEnabled: false,
          },
          plus: {
            plusModeEnabled: false,
            plusPaymentMethod: 'paypal',
          },
          autoRun: {
            stepExecutionRange: { enabled: false, fromStep: 1, toStep: 11 },
          },
        },
        kiro: {
          source: {
            selected: 'kiro-rs',
            entries: {
              'kiro-rs': {
                kiroRsUrl: 'https://kiro.example.com/admin',
                kiroRsKey: 'schema-only-key',
              },
            },
          },
          options: {
            kiroRegion: 'eu-west-1',
          },
          autoRun: {
            stepExecutionRange: { enabled: true, fromStep: 1, toStep: 3 },
          },
        },
      },
    },
  }, { requireKnownKeys: true });

  assert.equal(payload.activeFlowId, 'kiro');
  assert.equal(payload.kiroSourceId, 'kiro-rs');
  assert.equal(payload.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(payload.kiroRsKey, 'schema-only-key');
  assert.equal(payload.kiroRegion, 'eu-west-1');
  assert.equal(payload.settingsSchemaVersion, 3);
});

test('getPersistedSettings reads schema keys alongside legacy flat settings keys', async () => {
  const api = buildHarness(`
let requestedKeys = [];
const chrome = {
  storage: {
    local: {
      async get(keys) {
        requestedKeys = Array.isArray(keys) ? [...keys] : [];
        return {};
      },
    },
  },
};
function getRequestedKeys() {
  return requestedKeys;
}
`);

  const state = await api.getPersistedSettings();

  assert.ok(api.getRequestedKeys().includes('settingsSchemaVersion'));
  assert.ok(api.getRequestedKeys().includes('settingsState'));
  assert.equal(state.settingsSchemaVersion, 3);
  assert.equal(state.settingsState.activeFlowId, 'openai');
});

test('getPersistedSettings can project schema-only storage back into legacy flat settings', async () => {
  const api = buildHarness(`
const chrome = {
  storage: {
    local: {
      async get() {
        return {
          settingsSchemaVersion: 3,
          settingsState: {
            activeFlowId: 'kiro',
            services: {
              email: { provider: 'hotmail' },
              proxy: { enabled: true, provider: '711proxy', mode: 'account' },
            },
            flows: {
              openai: {
                source: {
                  selected: 'sub2api',
                  entries: {},
                },
                account: { customPassword: '' },
                signup: {
                  signupMethod: 'email',
                  phoneVerificationEnabled: false,
                  phoneSignupReloginAfterBindEmailEnabled: false,
                },
                plus: {
                  plusModeEnabled: false,
                  plusPaymentMethod: 'paypal',
                },
                autoRun: {
                  stepExecutionRange: { enabled: false, fromStep: 1, toStep: 11 },
                },
              },
              kiro: {
                source: {
                  selected: 'kiro-rs',
                  entries: {
                    'kiro-rs': {
                      kiroRsUrl: 'https://kiro.example.com/admin',
                      kiroRsKey: 'stored-key',
                    },
                  },
                },
                options: {
                  kiroRegion: 'ap-southeast-1',
                },
                autoRun: {
                  stepExecutionRange: { enabled: true, fromStep: 1, toStep: 3 },
                },
              },
            },
          },
        };
      },
    },
  },
};
`);

  const state = await api.getPersistedSettings();

  assert.equal(state.activeFlowId, 'kiro');
  assert.equal(state.panelMode, 'sub2api');
  assert.equal(state.mailProvider, 'hotmail');
  assert.equal(state.ipProxyEnabled, true);
  assert.equal(state.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(state.kiroRsKey, 'stored-key');
  assert.equal(state.kiroRegion, 'ap-southeast-1');
  assert.deepEqual(state.stepExecutionRangeByFlow.kiro, {
    enabled: true,
    fromStep: 1,
    toStep: 3,
  });
});

test('setPersistentSettings materializes canonical schema keys for schema-only updates', async () => {
  const api = buildHarness(`
const persistedWrites = [];
const chrome = {
  storage: {
    local: {
      async get() {
        return {};
      },
      async set(payload) {
        persistedWrites.push(JSON.parse(JSON.stringify(payload)));
      },
    },
  },
};
function getPersistedWrites() {
  return persistedWrites;
}
`);

  const persisted = await api.setPersistentSettings({
    settingsSchemaVersion: 3,
    settingsState: {
      activeFlowId: 'kiro',
      services: {
        email: { provider: '163' },
        proxy: { enabled: false, provider: '711proxy', mode: 'account' },
      },
      flows: {
        openai: {
          source: { selected: 'cpa', entries: {} },
          account: { customPassword: '' },
          signup: {
            signupMethod: 'email',
            phoneVerificationEnabled: false,
            phoneSignupReloginAfterBindEmailEnabled: false,
          },
          plus: {
            plusModeEnabled: false,
            plusPaymentMethod: 'paypal',
          },
          autoRun: {
            stepExecutionRange: { enabled: false, fromStep: 1, toStep: 11 },
          },
        },
        kiro: {
          source: {
            selected: 'kiro-rs',
            entries: {
              'kiro-rs': {
                kiroRsUrl: 'https://kiro.example.com/admin',
                kiroRsKey: 'nested-only-key',
              },
            },
          },
          options: {
            kiroRegion: 'us-west-2',
          },
          autoRun: {
            stepExecutionRange: { enabled: true, fromStep: 1, toStep: 3 },
          },
        },
      },
    },
  });

  const write = api.getPersistedWrites().at(-1);

  assert.equal(persisted.activeFlowId, 'kiro');
  assert.equal(persisted.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(persisted.kiroRsKey, 'nested-only-key');
  assert.equal(persisted.kiroRegion, 'us-west-2');
  assert.equal(persisted.settingsSchemaVersion, 3);
  assert.equal(write.activeFlowId, 'kiro');
  assert.equal(write.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(write.kiroRsKey, 'nested-only-key');
  assert.equal(write.kiroRegion, 'us-west-2');
  assert.equal(write.settingsSchemaVersion, 3);
  assert.equal(write.settingsState.activeFlowId, 'kiro');
});
