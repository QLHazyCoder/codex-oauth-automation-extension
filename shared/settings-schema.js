(function attachMultiPageSettingsSchema(root, factory) {
  root.MultiPageSettingsSchema = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSettingsSchemaModule() {
  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => cloneValue(entry));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)])
      );
    }
    return value;
  }

  function normalizeStepExecutionRangeEntry(value = {}, fallback = {}) {
    const source = isPlainObject(value) ? value : {};
    const fallbackSource = isPlainObject(fallback) ? fallback : {};
    const fromStep = Math.max(1, Number(source.fromStep ?? fallbackSource.fromStep ?? 1) || 1);
    const toStep = Math.max(fromStep, Number(source.toStep ?? fallbackSource.toStep ?? fromStep) || fromStep);
    return {
      enabled: Boolean(source.enabled ?? fallbackSource.enabled),
      fromStep,
      toStep,
    };
  }

  function createSettingsSchema(deps = {}) {
    const rootScope = typeof self !== 'undefined' ? self : globalThis;
    const flowRegistry = deps.flowRegistry || rootScope.MultiPageFlowRegistry || {};
    const defaultFlowId = String(deps.defaultFlowId || flowRegistry.DEFAULT_FLOW_ID || 'openai').trim().toLowerCase() || 'openai';
    const defaultOpenAiSourceId = flowRegistry.DEFAULT_OPENAI_SOURCE_ID || 'cpa';
    const defaultKiroSourceId = flowRegistry.DEFAULT_KIRO_SOURCE_ID || 'kiro-rs';
    const defaultKiroRegion = flowRegistry.DEFAULT_KIRO_REGION || 'us-east-1';
    const defaultKiroRsUrl = flowRegistry.DEFAULT_KIRO_RS_URL || 'https://kiro.leftcode.xyz/admin';
    const normalizeFlowId = typeof flowRegistry.normalizeFlowId === 'function'
      ? flowRegistry.normalizeFlowId
      : ((value = '', fallback = defaultFlowId) => {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized || String(fallback || '').trim().toLowerCase() || defaultFlowId;
      });
    const normalizeSourceId = typeof flowRegistry.normalizeSourceId === 'function'
      ? flowRegistry.normalizeSourceId
      : ((flowId, value = '', fallback = '') => String(value || fallback || '').trim().toLowerCase());
    const mapSourceIdToPanelMode = typeof flowRegistry.mapSourceIdToPanelMode === 'function'
      ? flowRegistry.mapSourceIdToPanelMode
      : ((_flowId, sourceId = '', fallback = defaultOpenAiSourceId) => String(sourceId || fallback || defaultOpenAiSourceId).trim().toLowerCase());
    const mapPanelModeToSourceId = typeof flowRegistry.mapPanelModeToSourceId === 'function'
      ? flowRegistry.mapPanelModeToSourceId
      : ((panelMode = '', fallback = defaultOpenAiSourceId) => String(panelMode || fallback || defaultOpenAiSourceId).trim().toLowerCase());

    function buildDefaultSettingsState() {
      return {
        schemaVersion: 3,
        activeFlowId: defaultFlowId,
        services: {
          email: {
            provider: '163',
          },
          proxy: {
            enabled: false,
            provider: '711proxy',
            mode: 'account',
          },
        },
        flows: {
          openai: {
            source: {
              selected: defaultOpenAiSourceId,
              entries: {
                cpa: {
                  vpsUrl: '',
                  vpsPassword: '',
                  localCpaStep9Mode: 'submit',
                },
                sub2api: {
                  sub2apiUrl: '',
                  sub2apiEmail: '',
                  sub2apiPassword: '',
                  sub2apiGroupName: 'codex',
                  sub2apiGroupNames: ['codex', 'openai-plus'],
                  sub2apiAccountPriority: 1,
                  sub2apiDefaultProxyName: '',
                },
                codex2api: {
                  codex2apiUrl: '',
                  codex2apiAdminKey: '',
                },
              },
            },
            account: {
              customPassword: '',
            },
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
              stepExecutionRange: {
                enabled: false,
                fromStep: 1,
                toStep: 11,
              },
            },
          },
          kiro: {
            source: {
              selected: defaultKiroSourceId,
              entries: {
                'kiro-rs': {
                  kiroRsUrl: defaultKiroRsUrl,
                  kiroRsKey: '',
                },
              },
            },
            options: {
              kiroRegion: defaultKiroRegion,
              kiroRsPriority: 0,
              kiroRsEndpoint: '',
              kiroRsAuthRegion: '',
              kiroRsApiRegion: '',
            },
            autoRun: {
              stepExecutionRange: {
                enabled: false,
                fromStep: 1,
                toStep: 3,
              },
            },
          },
        },
      };
    }

    function getSourceValue(settingsState, pathGetter, fallback = {}) {
      return cloneValue(pathGetter(isPlainObject(settingsState) ? settingsState : {}) || fallback);
    }

    function normalizeSettingsState(input = {}, options = {}) {
      const defaults = buildDefaultSettingsState();
      const nested = isPlainObject(input?.settingsState)
        ? input.settingsState
        : (isPlainObject(input) && isPlainObject(input.flows) && isPlainObject(input.services) ? input : {});
      const activeFlowId = normalizeFlowId(
        input?.activeFlowId
        ?? nested?.activeFlowId
        ?? options?.activeFlowId
        ?? defaults.activeFlowId,
        defaults.activeFlowId
      );
      const openaiSelectedSource = normalizeSourceId(
        'openai',
        nested?.flows?.openai?.source?.selected
          ?? input?.panelMode
          ?? input?.openaiSourceId
          ?? defaults.flows.openai.source.selected,
        defaults.flows.openai.source.selected
      );
      const kiroSelectedSource = normalizeSourceId(
        'kiro',
        nested?.flows?.kiro?.source?.selected
          ?? input?.kiroSourceId
          ?? defaults.flows.kiro.source.selected,
        defaults.flows.kiro.source.selected
      );
      const stepExecutionRangeByFlow = isPlainObject(input?.stepExecutionRangeByFlow)
        ? input.stepExecutionRangeByFlow
        : {};

      return {
        schemaVersion: Number(input?.settingsSchemaVersion || nested?.schemaVersion || defaults.schemaVersion) || defaults.schemaVersion,
        activeFlowId,
        services: {
          email: {
            provider: String(
              nested?.services?.email?.provider
              ?? input?.mailProvider
              ?? defaults.services.email.provider
            ).trim() || defaults.services.email.provider,
          },
          proxy: {
            enabled: Boolean(
              nested?.services?.proxy?.enabled
              ?? input?.ipProxyEnabled
              ?? defaults.services.proxy.enabled
            ),
            provider: String(
              nested?.services?.proxy?.provider
              ?? input?.ipProxyService
              ?? defaults.services.proxy.provider
            ).trim() || defaults.services.proxy.provider,
            mode: String(
              nested?.services?.proxy?.mode
              ?? input?.ipProxyMode
              ?? defaults.services.proxy.mode
            ).trim() || defaults.services.proxy.mode,
          },
        },
        flows: {
          openai: {
            source: {
              selected: openaiSelectedSource,
              entries: {
                cpa: {
                  ...defaults.flows.openai.source.entries.cpa,
                  ...getSourceValue(nested, (state) => state.flows?.openai?.source?.entries?.cpa),
                  vpsUrl: String(input?.vpsUrl ?? nested?.flows?.openai?.source?.entries?.cpa?.vpsUrl ?? '').trim(),
                  vpsPassword: String(input?.vpsPassword ?? nested?.flows?.openai?.source?.entries?.cpa?.vpsPassword ?? ''),
                  localCpaStep9Mode: String(
                    input?.localCpaStep9Mode
                    ?? nested?.flows?.openai?.source?.entries?.cpa?.localCpaStep9Mode
                    ?? defaults.flows.openai.source.entries.cpa.localCpaStep9Mode
                  ).trim() || defaults.flows.openai.source.entries.cpa.localCpaStep9Mode,
                },
                sub2api: {
                  ...defaults.flows.openai.source.entries.sub2api,
                  ...getSourceValue(nested, (state) => state.flows?.openai?.source?.entries?.sub2api),
                  sub2apiUrl: String(input?.sub2apiUrl ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiUrl ?? '').trim(),
                  sub2apiEmail: String(input?.sub2apiEmail ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiEmail ?? '').trim(),
                  sub2apiPassword: String(input?.sub2apiPassword ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiPassword ?? ''),
                  sub2apiGroupName: String(input?.sub2apiGroupName ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiGroupName ?? defaults.flows.openai.source.entries.sub2api.sub2apiGroupName).trim() || defaults.flows.openai.source.entries.sub2api.sub2apiGroupName,
                  sub2apiGroupNames: Array.isArray(input?.sub2apiGroupNames)
                    ? input.sub2apiGroupNames.map((entry) => String(entry || '').trim()).filter(Boolean)
                    : (Array.isArray(nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiGroupNames)
                      ? nested.flows.openai.source.entries.sub2api.sub2apiGroupNames.map((entry) => String(entry || '').trim()).filter(Boolean)
                      : [...defaults.flows.openai.source.entries.sub2api.sub2apiGroupNames]),
                  sub2apiAccountPriority: Math.max(1, Number(input?.sub2apiAccountPriority ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiAccountPriority ?? defaults.flows.openai.source.entries.sub2api.sub2apiAccountPriority) || defaults.flows.openai.source.entries.sub2api.sub2apiAccountPriority),
                  sub2apiDefaultProxyName: String(input?.sub2apiDefaultProxyName ?? nested?.flows?.openai?.source?.entries?.sub2api?.sub2apiDefaultProxyName ?? '').trim(),
                },
                codex2api: {
                  ...defaults.flows.openai.source.entries.codex2api,
                  ...getSourceValue(nested, (state) => state.flows?.openai?.source?.entries?.codex2api),
                  codex2apiUrl: String(input?.codex2apiUrl ?? nested?.flows?.openai?.source?.entries?.codex2api?.codex2apiUrl ?? '').trim(),
                  codex2apiAdminKey: String(input?.codex2apiAdminKey ?? nested?.flows?.openai?.source?.entries?.codex2api?.codex2apiAdminKey ?? '').trim(),
                },
              },
            },
            account: {
              customPassword: String(input?.customPassword ?? nested?.flows?.openai?.account?.customPassword ?? '').trim(),
            },
            signup: {
              signupMethod: String(input?.signupMethod ?? nested?.flows?.openai?.signup?.signupMethod ?? defaults.flows.openai.signup.signupMethod).trim().toLowerCase() === 'phone' ? 'phone' : 'email',
              phoneVerificationEnabled: Boolean(input?.phoneVerificationEnabled ?? nested?.flows?.openai?.signup?.phoneVerificationEnabled ?? defaults.flows.openai.signup.phoneVerificationEnabled),
              phoneSignupReloginAfterBindEmailEnabled: Boolean(input?.phoneSignupReloginAfterBindEmailEnabled ?? nested?.flows?.openai?.signup?.phoneSignupReloginAfterBindEmailEnabled ?? defaults.flows.openai.signup.phoneSignupReloginAfterBindEmailEnabled),
            },
            plus: {
              plusModeEnabled: Boolean(input?.plusModeEnabled ?? nested?.flows?.openai?.plus?.plusModeEnabled ?? defaults.flows.openai.plus.plusModeEnabled),
              plusPaymentMethod: String(input?.plusPaymentMethod ?? nested?.flows?.openai?.plus?.plusPaymentMethod ?? defaults.flows.openai.plus.plusPaymentMethod).trim() || defaults.flows.openai.plus.plusPaymentMethod,
            },
            autoRun: {
              stepExecutionRange: normalizeStepExecutionRangeEntry(
                nested?.flows?.openai?.autoRun?.stepExecutionRange
                  ?? stepExecutionRangeByFlow.openai
                  ?? {},
                defaults.flows.openai.autoRun.stepExecutionRange
              ),
            },
          },
          kiro: {
            source: {
              selected: kiroSelectedSource,
              entries: {
                'kiro-rs': {
                  ...defaults.flows.kiro.source.entries['kiro-rs'],
                  ...getSourceValue(nested, (state) => state.flows?.kiro?.source?.entries?.['kiro-rs']),
                  kiroRsUrl: String(
                    input?.kiroRsUrl
                    ?? nested?.flows?.kiro?.source?.entries?.['kiro-rs']?.kiroRsUrl
                    ?? defaults.flows.kiro.source.entries['kiro-rs'].kiroRsUrl
                  ).trim() || defaults.flows.kiro.source.entries['kiro-rs'].kiroRsUrl,
                  kiroRsKey: String(
                    input?.kiroRsKey
                    ?? nested?.flows?.kiro?.source?.entries?.['kiro-rs']?.kiroRsKey
                    ?? defaults.flows.kiro.source.entries['kiro-rs'].kiroRsKey
                  ),
                },
              },
            },
            options: {
              kiroRegion: String(
                input?.kiroRegion
                ?? nested?.flows?.kiro?.options?.kiroRegion
                ?? defaults.flows.kiro.options.kiroRegion
              ).trim() || defaults.flows.kiro.options.kiroRegion,
              kiroRsPriority: Number(
                input?.kiroRsPriority
                ?? nested?.flows?.kiro?.options?.kiroRsPriority
                ?? defaults.flows.kiro.options.kiroRsPriority
              ) || 0,
              kiroRsEndpoint: String(
                input?.kiroRsEndpoint
                ?? nested?.flows?.kiro?.options?.kiroRsEndpoint
                ?? defaults.flows.kiro.options.kiroRsEndpoint
              ).trim(),
              kiroRsAuthRegion: String(
                input?.kiroRsAuthRegion
                ?? nested?.flows?.kiro?.options?.kiroRsAuthRegion
                ?? defaults.flows.kiro.options.kiroRsAuthRegion
              ).trim(),
              kiroRsApiRegion: String(
                input?.kiroRsApiRegion
                ?? nested?.flows?.kiro?.options?.kiroRsApiRegion
                ?? defaults.flows.kiro.options.kiroRsApiRegion
              ).trim(),
            },
            autoRun: {
              stepExecutionRange: normalizeStepExecutionRangeEntry(
                nested?.flows?.kiro?.autoRun?.stepExecutionRange
                  ?? stepExecutionRangeByFlow.kiro
                  ?? {},
                defaults.flows.kiro.autoRun.stepExecutionRange
              ),
            },
          },
        },
      };
    }

    function buildStepExecutionRangeByFlow(settingsState = {}) {
      const normalizedState = normalizeSettingsState(settingsState);
      return {
        openai: normalizeStepExecutionRangeEntry(
          normalizedState?.flows?.openai?.autoRun?.stepExecutionRange,
          buildDefaultSettingsState().flows.openai.autoRun.stepExecutionRange
        ),
        kiro: normalizeStepExecutionRangeEntry(
          normalizedState?.flows?.kiro?.autoRun?.stepExecutionRange,
          buildDefaultSettingsState().flows.kiro.autoRun.stepExecutionRange
        ),
      };
    }

    function getFlowSettings(settingsState = {}, flowId) {
      const normalizedState = normalizeSettingsState(settingsState);
      const normalizedFlowId = normalizeFlowId(flowId, normalizedState.activeFlowId);
      return cloneValue(normalizedState?.flows?.[normalizedFlowId] || {});
    }

    function getSelectedSourceId(settingsState = {}, flowId) {
      const flowSettings = getFlowSettings(settingsState, flowId);
      const normalizedFlowId = normalizeFlowId(flowId, normalizeSettingsState(settingsState).activeFlowId);
      return normalizeSourceId(
        normalizedFlowId,
        flowSettings?.source?.selected,
        normalizedFlowId === 'kiro' ? defaultKiroSourceId : defaultOpenAiSourceId
      );
    }

    function buildLegacySettingsPayload(settingsState = {}, baseInput = {}) {
      const normalizedState = normalizeSettingsState(settingsState);
      const next = {
        ...(isPlainObject(baseInput) ? cloneValue(baseInput) : {}),
      };
      const openaiState = normalizedState.flows.openai;
      const kiroState = normalizedState.flows.kiro;
      next.activeFlowId = normalizedState.activeFlowId;
      next.panelMode = mapSourceIdToPanelMode('openai', openaiState.source.selected, defaultOpenAiSourceId);
      next.kiroSourceId = getSelectedSourceId(normalizedState, 'kiro');
      next.vpsUrl = openaiState.source.entries.cpa.vpsUrl;
      next.vpsPassword = openaiState.source.entries.cpa.vpsPassword;
      next.localCpaStep9Mode = openaiState.source.entries.cpa.localCpaStep9Mode;
      next.sub2apiUrl = openaiState.source.entries.sub2api.sub2apiUrl;
      next.sub2apiEmail = openaiState.source.entries.sub2api.sub2apiEmail;
      next.sub2apiPassword = openaiState.source.entries.sub2api.sub2apiPassword;
      next.sub2apiGroupName = openaiState.source.entries.sub2api.sub2apiGroupName;
      next.sub2apiGroupNames = cloneValue(openaiState.source.entries.sub2api.sub2apiGroupNames);
      next.sub2apiAccountPriority = openaiState.source.entries.sub2api.sub2apiAccountPriority;
      next.sub2apiDefaultProxyName = openaiState.source.entries.sub2api.sub2apiDefaultProxyName;
      next.codex2apiUrl = openaiState.source.entries.codex2api.codex2apiUrl;
      next.codex2apiAdminKey = openaiState.source.entries.codex2api.codex2apiAdminKey;
      next.customPassword = openaiState.account.customPassword;
      next.signupMethod = openaiState.signup.signupMethod;
      next.phoneVerificationEnabled = openaiState.signup.phoneVerificationEnabled;
      next.phoneSignupReloginAfterBindEmailEnabled = openaiState.signup.phoneSignupReloginAfterBindEmailEnabled;
      next.plusModeEnabled = openaiState.plus.plusModeEnabled;
      next.plusPaymentMethod = openaiState.plus.plusPaymentMethod;
      next.mailProvider = normalizedState.services.email.provider;
      next.ipProxyEnabled = normalizedState.services.proxy.enabled;
      next.ipProxyService = normalizedState.services.proxy.provider;
      next.ipProxyMode = normalizedState.services.proxy.mode;
      next.kiroRsUrl = kiroState.source.entries['kiro-rs'].kiroRsUrl;
      next.kiroRsKey = kiroState.source.entries['kiro-rs'].kiroRsKey;
      next.kiroRegion = kiroState.options.kiroRegion;
      next.kiroRsPriority = kiroState.options.kiroRsPriority;
      next.kiroRsEndpoint = kiroState.options.kiroRsEndpoint;
      next.kiroRsAuthRegion = kiroState.options.kiroRsAuthRegion;
      next.kiroRsApiRegion = kiroState.options.kiroRsApiRegion;
      next.stepExecutionRangeByFlow = buildStepExecutionRangeByFlow(normalizedState);
      next.settingsSchemaVersion = normalizedState.schemaVersion;
      next.settingsState = cloneValue(normalizedState);
      return next;
    }

    function getFlowInputState(settingsState = {}, flowId) {
      const normalizedState = normalizeSettingsState(settingsState);
      const normalizedFlowId = normalizeFlowId(flowId, normalizedState.activeFlowId);
      if (normalizedFlowId === 'kiro') {
        return {
          activeFlowId: normalizedFlowId,
          sourceId: getSelectedSourceId(normalizedState, 'kiro'),
          kiroRsUrl: normalizedState.flows.kiro.source.entries['kiro-rs'].kiroRsUrl,
          kiroRsKey: normalizedState.flows.kiro.source.entries['kiro-rs'].kiroRsKey,
          kiroRegion: normalizedState.flows.kiro.options.kiroRegion,
        };
      }
      return {
        activeFlowId: normalizedFlowId,
        sourceId: getSelectedSourceId(normalizedState, 'openai'),
        panelMode: mapSourceIdToPanelMode('openai', normalizedState.flows.openai.source.selected, defaultOpenAiSourceId),
      };
    }

    function normalizeFlatInput(input = {}) {
      const state = normalizeSettingsState(input);
      return buildLegacySettingsPayload(state, input);
    }

    return {
      buildDefaultSettingsState,
      buildLegacySettingsPayload,
      buildStepExecutionRangeByFlow,
      getFlowInputState,
      getFlowSettings,
      getSelectedSourceId,
      normalizeFlatInput,
      normalizeSettingsState,
    };
  }

  return {
    createSettingsSchema,
  };
});
