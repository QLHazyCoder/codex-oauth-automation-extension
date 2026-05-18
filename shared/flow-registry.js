(function attachMultiPageFlowRegistry(root, factory) {
  root.MultiPageFlowRegistry = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createFlowRegistryModule() {
  const DEFAULT_FLOW_ID = 'openai';
  const LEGACY_OPENAI_FLOW_ALIAS = 'codex';
  const DEFAULT_OPENAI_SOURCE_ID = 'cpa';
  const DEFAULT_KIRO_SOURCE_ID = 'kiro-rs';
  const DEFAULT_KIRO_REGION = 'us-east-1';
  const DEFAULT_KIRO_RS_URL = 'https://kiro.leftcode.xyz/admin';
  const OPENAI_SOURCE_IDS = Object.freeze(['cpa', 'sub2api', 'codex2api']);
  const SHARED_SERVICE_IDS = Object.freeze(['email', 'proxy']);

  const DEFAULT_FLOW_CAPABILITIES = Object.freeze({
    supportsEmailSignup: true,
    supportsPhoneSignup: false,
    supportsPhoneVerificationSettings: false,
    supportsPlusMode: false,
    supportsContributionMode: false,
    supportsPlatformBinding: [],
    supportsLuckmail: false,
    supportsOauthTimeoutBudget: false,
    canSwitchFlow: true,
    stepDefinitionMode: 'default',
    sourceSelectorLabel: '来源',
  });

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach((key) => {
      freezeDeep(value[key]);
    });
    return Object.freeze(value);
  }

  const FLOW_DEFINITIONS = freezeDeep({
    openai: {
      id: 'openai',
      label: 'Codex / OpenAI',
      services: ['email', 'proxy'],
      capabilities: {
        ...DEFAULT_FLOW_CAPABILITIES,
        supportsPhoneSignup: true,
        supportsPhoneVerificationSettings: true,
        supportsPlusMode: true,
        supportsContributionMode: true,
        supportsPlatformBinding: [...OPENAI_SOURCE_IDS],
        supportsLuckmail: true,
        supportsOauthTimeoutBudget: true,
        stepDefinitionMode: 'openai-dynamic',
      },
      baseGroups: [
        'openai-account',
        'openai-plus',
        'openai-phone',
        'openai-oauth',
      ],
      sources: {
        cpa: {
          id: 'cpa',
          label: 'CPA 面板',
          legacyPanelMode: 'cpa',
          groups: ['openai-source-cpa'],
        },
        sub2api: {
          id: 'sub2api',
          label: 'SUB2API',
          legacyPanelMode: 'sub2api',
          groups: ['openai-source-sub2api'],
        },
        codex2api: {
          id: 'codex2api',
          label: 'Codex2API',
          legacyPanelMode: 'codex2api',
          groups: ['openai-source-codex2api'],
        },
      },
      runtimeSources: {
        'openai-auth': {
          flowId: 'openai',
          kind: 'flow-page',
          label: '认证页',
          readyPolicy: 'allow-child-frame',
          family: 'openai-auth-family',
          driverId: 'content/signup-page',
          cleanupScopes: ['oauth-localhost-callback'],
        },
        chatgpt: {
          flowId: 'openai',
          kind: 'flow-entry',
          label: 'ChatGPT 首页',
          readyPolicy: 'allow-child-frame',
          family: 'chatgpt-entry-family',
          driverId: null,
          cleanupScopes: [],
        },
        'vps-panel': {
          flowId: 'openai',
          kind: 'panel-page',
          label: 'CPA 面板',
          readyPolicy: 'allow-child-frame',
          family: 'vps-panel-family',
          driverId: 'content/vps-panel',
          cleanupScopes: [],
        },
        'platform-panel': {
          flowId: 'openai',
          kind: 'virtual-page',
          label: '平台回调面板',
          readyPolicy: 'disabled',
          family: 'platform-panel-family',
          driverId: 'content/platform-panel',
          cleanupScopes: [],
        },
        'sub2api-panel': {
          flowId: 'openai',
          kind: 'panel-page',
          label: 'SUB2API 后台',
          readyPolicy: 'allow-child-frame',
          family: 'sub2api-panel-family',
          driverId: 'content/sub2api-panel',
          cleanupScopes: [],
        },
        'codex2api-panel': {
          flowId: 'openai',
          kind: 'panel-page',
          label: 'Codex2API 后台',
          readyPolicy: 'allow-child-frame',
          family: 'codex2api-panel-family',
          driverId: 'content/sub2api-panel',
          cleanupScopes: [],
        },
        'plus-checkout': {
          flowId: 'openai',
          kind: 'flow-page',
          label: 'Plus Checkout',
          readyPolicy: 'top-frame-only',
          family: 'plus-checkout-family',
          driverId: 'content/plus-checkout',
          cleanupScopes: [],
        },
        'paypal-flow': {
          flowId: 'openai',
          kind: 'flow-page',
          label: 'PayPal 授权页',
          readyPolicy: 'allow-child-frame',
          family: 'paypal-flow-family',
          driverId: 'content/paypal-flow',
          cleanupScopes: [],
        },
        'gopay-flow': {
          flowId: 'openai',
          kind: 'flow-page',
          label: 'GoPay 授权页',
          readyPolicy: 'allow-child-frame',
          family: 'gopay-flow-family',
          driverId: 'content/gopay-flow',
          cleanupScopes: [],
        },
      },
      driverDefinitions: {
        'content/signup-page': {
          sourceId: 'openai-auth',
          commands: [
            'submit-signup-email',
            'fill-password',
            'fill-profile',
            'oauth-login',
            'submit-verification-code',
            'post-login-phone-verification',
            'bind-email',
            'fetch-bind-email-code',
            'confirm-oauth',
            'detect-auth-state',
          ],
        },
        'content/sub2api-panel': {
          sourceId: 'sub2api-panel',
          commands: ['open-panel', 'fetch-oauth-url', 'platform-verify'],
        },
        'content/vps-panel': {
          sourceId: 'vps-panel',
          commands: ['open-panel', 'fetch-oauth-url', 'platform-verify'],
        },
        'content/platform-panel': {
          sourceId: 'platform-panel',
          commands: ['platform-verify', 'fetch-oauth-url'],
        },
        'content/plus-checkout': {
          sourceId: 'plus-checkout',
          commands: ['plus-checkout-create', 'plus-checkout-billing', 'plus-checkout-return'],
        },
        'content/paypal-flow': {
          sourceId: 'paypal-flow',
          commands: ['paypal-approve'],
        },
        'content/gopay-flow': {
          sourceId: 'gopay-flow',
          commands: ['gopay-subscription-confirm'],
        },
      },
    },
    kiro: {
      id: 'kiro',
      label: 'Kiro',
      services: ['email', 'proxy'],
      capabilities: {
        ...DEFAULT_FLOW_CAPABILITIES,
        stepDefinitionMode: 'kiro-device-auth',
      },
      baseGroups: [
        'kiro-runtime-status',
      ],
      sources: {
        'kiro-rs': {
          id: 'kiro-rs',
          label: 'kiro.rs',
          groups: ['kiro-source-kiro-rs'],
        },
      },
      runtimeSources: {
        'kiro-device-auth': {
          flowId: 'kiro',
          kind: 'flow-page',
          label: 'Kiro 授权页',
          readyPolicy: 'top-frame-only',
          family: 'kiro-device-auth-family',
          driverId: null,
          cleanupScopes: [],
        },
        'kiro-rs-admin': {
          flowId: 'kiro',
          kind: 'virtual-page',
          label: 'kiro.rs Admin',
          readyPolicy: 'disabled',
          family: 'kiro-rs-admin-family',
          driverId: null,
          cleanupScopes: [],
        },
      },
      driverDefinitions: {
        'background/kiro-device-auth': {
          sourceId: 'kiro-device-auth',
          commands: [
            'kiro-start-device-login',
            'kiro-await-device-login',
            'kiro-upload-credential',
          ],
        },
      },
    },
  });

  const SETTINGS_GROUP_DEFINITIONS = freezeDeep({
    'service-email': {
      id: 'service-email',
      label: '邮箱服务',
    },
    'service-proxy': {
      id: 'service-proxy',
      label: 'IP 代理',
      sectionIds: ['ip-proxy-section'],
    },
    'openai-source-cpa': {
      id: 'openai-source-cpa',
      label: 'CPA 来源',
      rowIds: ['row-vps-url', 'row-vps-password', 'row-local-cpa-step9-mode'],
    },
    'openai-source-sub2api': {
      id: 'openai-source-sub2api',
      label: 'SUB2API 来源',
      rowIds: [
        'row-sub2api-url',
        'row-sub2api-email',
        'row-sub2api-password',
        'row-sub2api-group',
        'row-sub2api-account-priority',
        'row-sub2api-default-proxy',
      ],
    },
    'openai-source-codex2api': {
      id: 'openai-source-codex2api',
      label: 'Codex2API 来源',
      rowIds: ['row-codex2api-url', 'row-codex2api-admin-key'],
    },
    'openai-account': {
      id: 'openai-account',
      label: '账户',
      rowIds: ['row-custom-password'],
    },
    'openai-plus': {
      id: 'openai-plus',
      label: 'Plus',
      rowIds: [
        'row-plus-mode',
      ],
    },
    'openai-phone': {
      id: 'openai-phone',
      label: '接码设置',
      sectionIds: ['phone-verification-section'],
      rowIds: [],
    },
    'openai-oauth': {
      id: 'openai-oauth',
      label: 'OAuth',
      rowIds: ['row-oauth-flow-timeout', 'row-oauth-display'],
    },
    'kiro-source-kiro-rs': {
      id: 'kiro-source-kiro-rs',
      label: 'kiro.rs 配置',
      rowIds: ['row-kiro-rs-url', 'row-kiro-rs-key', 'row-kiro-region'],
    },
    'kiro-runtime-status': {
      id: 'kiro-runtime-status',
      label: 'Kiro 运行态',
      rowIds: ['row-kiro-device-code', 'row-kiro-login-url', 'row-kiro-upload-status'],
    },
  });

  function normalizeFlowId(value = '', fallback = DEFAULT_FLOW_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === LEGACY_OPENAI_FLOW_ALIAS) {
      return DEFAULT_FLOW_ID;
    }
    if (normalized && Object.prototype.hasOwnProperty.call(FLOW_DEFINITIONS, normalized)) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    if (fallbackValue === LEGACY_OPENAI_FLOW_ALIAS) {
      return DEFAULT_FLOW_ID;
    }
    return Object.prototype.hasOwnProperty.call(FLOW_DEFINITIONS, fallbackValue)
      ? fallbackValue
      : DEFAULT_FLOW_ID;
  }

  function getRegisteredFlowIds() {
    return Object.keys(FLOW_DEFINITIONS);
  }

  function getFlowDefinition(flowId) {
    const normalizedFlowId = normalizeFlowId(flowId);
    return FLOW_DEFINITIONS[normalizedFlowId] || FLOW_DEFINITIONS[DEFAULT_FLOW_ID];
  }

  function getFlowLabel(flowId) {
    return getFlowDefinition(flowId)?.label || normalizeFlowId(flowId);
  }

  function getDefaultSourceId(flowId) {
    return normalizeFlowId(flowId) === 'kiro'
      ? DEFAULT_KIRO_SOURCE_ID
      : DEFAULT_OPENAI_SOURCE_ID;
  }

  function normalizeOpenAiSourceId(value = '', fallback = DEFAULT_OPENAI_SOURCE_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (OPENAI_SOURCE_IDS.includes(normalized)) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return OPENAI_SOURCE_IDS.includes(fallbackValue) ? fallbackValue : DEFAULT_OPENAI_SOURCE_ID;
  }

  function normalizeKiroSourceId(value = '', fallback = DEFAULT_KIRO_SOURCE_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === DEFAULT_KIRO_SOURCE_ID) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return fallbackValue === DEFAULT_KIRO_SOURCE_ID ? fallbackValue : DEFAULT_KIRO_SOURCE_ID;
  }

  function normalizeSourceId(flowId, sourceId = '', fallback = undefined) {
    const normalizedFlowId = normalizeFlowId(flowId);
    if (normalizedFlowId === 'kiro') {
      return normalizeKiroSourceId(sourceId, fallback || DEFAULT_KIRO_SOURCE_ID);
    }
    return normalizeOpenAiSourceId(sourceId, fallback || DEFAULT_OPENAI_SOURCE_ID);
  }

  function getSourceDefinitions(flowId) {
    return getFlowDefinition(flowId)?.sources || {};
  }

  function getSourceDefinition(flowId, sourceId) {
    const normalizedFlowId = normalizeFlowId(flowId);
    const normalizedSourceId = normalizeSourceId(normalizedFlowId, sourceId, getDefaultSourceId(normalizedFlowId));
    return getSourceDefinitions(normalizedFlowId)[normalizedSourceId] || null;
  }

  function getSourceOptions(flowId) {
    return Object.values(getSourceDefinitions(flowId));
  }

  function getSourceLabel(flowId, sourceId) {
    return getSourceDefinition(flowId, sourceId)?.label || normalizeSourceId(flowId, sourceId);
  }

  function mapPanelModeToSourceId(panelMode = '', fallback = DEFAULT_OPENAI_SOURCE_ID) {
    return normalizeOpenAiSourceId(panelMode, fallback);
  }

  function mapSourceIdToPanelMode(flowId, sourceId = '', fallback = DEFAULT_OPENAI_SOURCE_ID) {
    if (normalizeFlowId(flowId) !== DEFAULT_FLOW_ID) {
      return normalizeOpenAiSourceId(fallback, DEFAULT_OPENAI_SOURCE_ID);
    }
    return normalizeOpenAiSourceId(sourceId, fallback || DEFAULT_OPENAI_SOURCE_ID);
  }

  function getFlowCapabilities(flowId) {
    return {
      ...DEFAULT_FLOW_CAPABILITIES,
      ...(getFlowDefinition(flowId)?.capabilities || {}),
    };
  }

  function getVisibleGroupIds(flowId, sourceId, options = {}) {
    const normalizedFlowId = normalizeFlowId(flowId);
    const flowDefinition = getFlowDefinition(normalizedFlowId);
    const normalizedSourceId = normalizeSourceId(normalizedFlowId, sourceId, getDefaultSourceId(normalizedFlowId));
    const sourceDefinition = getSourceDefinition(normalizedFlowId, normalizedSourceId);
    const includeSharedServices = options?.includeSharedServices !== false;
    const serviceGroups = includeSharedServices
      ? (Array.isArray(flowDefinition?.services) ? flowDefinition.services.map((serviceId) => `service-${serviceId}`) : [])
      : [];
    return Array.from(new Set([
      ...(Array.isArray(flowDefinition?.baseGroups) ? flowDefinition.baseGroups : []),
      ...(Array.isArray(sourceDefinition?.groups) ? sourceDefinition.groups : []),
      ...serviceGroups,
    ]));
  }

  function getSettingsGroupDefinition(groupId) {
    const normalizedGroupId = String(groupId || '').trim();
    return SETTINGS_GROUP_DEFINITIONS[normalizedGroupId] || null;
  }

  function getSettingsGroupDefinitions() {
    return SETTINGS_GROUP_DEFINITIONS;
  }

  function getRuntimeSourceDefinitions() {
    const next = {};
    Object.values(FLOW_DEFINITIONS).forEach((flowDefinition) => {
      Object.assign(next, flowDefinition.runtimeSources || {});
    });
    return next;
  }

  function getDriverDefinitions() {
    const next = {};
    Object.values(FLOW_DEFINITIONS).forEach((flowDefinition) => {
      Object.assign(next, flowDefinition.driverDefinitions || {});
    });
    return next;
  }

  return {
    DEFAULT_FLOW_CAPABILITIES,
    DEFAULT_FLOW_ID,
    DEFAULT_KIRO_REGION,
    DEFAULT_KIRO_RS_URL,
    DEFAULT_KIRO_SOURCE_ID,
    DEFAULT_OPENAI_SOURCE_ID,
    FLOW_DEFINITIONS,
    LEGACY_OPENAI_FLOW_ALIAS,
    OPENAI_SOURCE_IDS,
    SETTINGS_GROUP_DEFINITIONS,
    SHARED_SERVICE_IDS,
    getDefaultSourceId,
    getDriverDefinitions,
    getFlowCapabilities,
    getFlowDefinition,
    getFlowLabel,
    getRegisteredFlowIds,
    getRuntimeSourceDefinitions,
    getSettingsGroupDefinition,
    getSettingsGroupDefinitions,
    getSourceDefinition,
    getSourceDefinitions,
    getSourceLabel,
    getSourceOptions,
    getVisibleGroupIds,
    mapPanelModeToSourceId,
    mapSourceIdToPanelMode,
    normalizeFlowId,
    normalizeKiroSourceId,
    normalizeOpenAiSourceId,
    normalizeSourceId,
  };
});
