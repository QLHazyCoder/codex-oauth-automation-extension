(function attachBackgroundRuntimeState(root, factory) {
  root.MultiPageBackgroundRuntimeState = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundRuntimeStateModule() {
  function createRuntimeStateHelpers(deps = {}) {
    const {
      DEFAULT_ACTIVE_FLOW_ID = 'openai',
      defaultStepStatuses = {},
      getStepDefinitionForState = null,
      getResolvedStepsForState = null,
      getRuntimeFieldDefaults = null,
      runtimeFieldDefaults = {},
    } = deps;

    const RUNTIME_SHARED_FIELDS = Object.freeze([
      'automationWindowId',
      'tabRegistry',
      'sourceLastUrls',
      'flowStartTime',
    ]);
    const RUNTIME_PROXY_FIELDS = Object.freeze([
      'ipProxyApiPool',
      'ipProxyApiCurrentIndex',
      'ipProxyApiCurrent',
      'ipProxyAccountPool',
      'ipProxyAccountCurrentIndex',
      'ipProxyAccountCurrent',
      'ipProxyPool',
      'ipProxyCurrentIndex',
      'ipProxyCurrent',
    ]);
    const OPENAI_FLOW_FIELD_GROUPS = Object.freeze({
      auth: Object.freeze([
        'oauthUrl',
        'localhostUrl',
        'signupVerificationRequestedAt',
        'loginVerificationRequestedAt',
        'oauthFlowDeadlineAt',
        'oauthFlowDeadlineSourceUrl',
      ]),
      platformBinding: Object.freeze([
        'cpaOAuthState',
        'cpaManagementOrigin',
        'sub2apiSessionId',
        'sub2apiOAuthState',
        'sub2apiGroupId',
        'sub2apiDraftName',
        'sub2apiProxyId',
        'sub2apiGroupIds',
        'codex2apiSessionId',
        'codex2apiOAuthState',
      ]),
      plus: Object.freeze([
        'plusCheckoutTabId',
        'plusCheckoutUrl',
        'plusCheckoutCountry',
        'plusCheckoutCurrency',
        'plusCheckoutSource',
        'plusBillingCountryText',
        'plusBillingAddress',
        'plusPaypalApprovedAt',
        'plusGoPayApprovedAt',
        'plusReturnUrl',
        'plusManualConfirmationPending',
        'plusManualConfirmationRequestId',
        'plusManualConfirmationStep',
        'plusManualConfirmationMethod',
        'plusManualConfirmationTitle',
        'plusManualConfirmationMessage',
        'gopayHelperReferenceId',
        'gopayHelperGoPayGuid',
        'gopayHelperRedirectUrl',
        'gopayHelperNextAction',
        'gopayHelperFlowId',
        'gopayHelperChallengeId',
        'gopayHelperStartPayload',
        'gopayHelperTaskId',
        'gopayHelperTaskStatus',
        'gopayHelperStatusText',
        'gopayHelperRemoteStage',
        'gopayHelperApiWaitingFor',
        'gopayHelperApiInputDeadlineAt',
        'gopayHelperApiInputWaitSeconds',
        'gopayHelperLastInputError',
        'gopayHelperOtpInvalidCount',
        'gopayHelperFailureStage',
        'gopayHelperFailureDetail',
        'gopayHelperTaskPayload',
        'gopayHelperOrderCreatedAt',
        'gopayHelperTaskProgressSignature',
        'gopayHelperTaskProgressAt',
        'gopayHelperTaskProgressTaskId',
        'gopayHelperPinPayload',
        'gopayHelperResolvedOtp',
        'gopayHelperOtpRequestId',
        'gopayHelperOtpReferenceId',
      ]),
      phoneVerification: Object.freeze([
        'currentPhoneActivation',
        'phoneNumber',
        'currentPhoneVerificationCode',
        'currentPhoneVerificationCountdownEndsAt',
        'currentPhoneVerificationCountdownWindowIndex',
        'currentPhoneVerificationCountdownWindowTotal',
        'reusablePhoneActivation',
        'freeReusablePhoneActivation',
        'phoneReusableActivationPool',
        'signupPhoneNumber',
        'signupPhoneActivation',
        'signupPhoneCompletedActivation',
        'signupPhoneVerificationRequestedAt',
        'signupPhoneVerificationPurpose',
        'heroSmsLastPriceTiers',
        'heroSmsLastPriceCountryId',
        'heroSmsLastPriceCountryLabel',
        'heroSmsLastPriceUserLimit',
        'heroSmsLastPriceAt',
        'pendingPhoneActivationConfirmation',
      ]),
      luckmail: Object.freeze([
        'currentLuckmailPurchase',
        'currentLuckmailMailCursor',
      ]),
      identity: Object.freeze([
        'resolvedSignupMethod',
        'accountIdentifierType',
        'accountIdentifier',
        'registrationEmailState',
        'email',
        'password',
        'lastEmailTimestamp',
        'lastSignupCode',
        'lastLoginCode',
        'step8VerificationTargetEmail',
      ]),
    });

    function isPlainObject(value) {
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneValue(value) {
      if (Array.isArray(value)) {
        return value.map((item) => cloneValue(item));
      }
      if (isPlainObject(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)])
        );
      }
      return value;
    }

    function normalizePlainObject(value) {
      return isPlainObject(value) ? value : {};
    }

    function resolveRuntimeFieldDefaults() {
      if (typeof getRuntimeFieldDefaults === 'function') {
        return normalizePlainObject(getRuntimeFieldDefaults());
      }
      return normalizePlainObject(runtimeFieldDefaults);
    }

    function normalizeFlowId(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized || DEFAULT_ACTIVE_FLOW_ID;
    }

    function normalizeRunId(value = '') {
      return String(value || '').trim();
    }

    function normalizeStepNumber(value) {
      const step = Math.floor(Number(value) || 0);
      return step > 0 ? step : 0;
    }

    function normalizeNodeStatus(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) {
        return 'pending';
      }
      return normalized;
    }

    function buildDefaultStepStatuses() {
      return Object.fromEntries(
        Object.entries(normalizePlainObject(defaultStepStatuses)).map(([key, value]) => [
          String(key),
          normalizeNodeStatus(value),
        ])
      );
    }

    function normalizeStepStatuses(value) {
      const base = buildDefaultStepStatuses();
      if (!isPlainObject(value)) {
        return base;
      }

      const next = { ...base };
      for (const [key, status] of Object.entries(value)) {
        const step = normalizeStepNumber(key);
        if (!step) continue;
        next[String(step)] = normalizeNodeStatus(status);
      }
      return next;
    }

    function normalizeLegacyStepCompat(value = {}, state = {}) {
      const candidate = normalizePlainObject(value);
      const currentStep = normalizeStepNumber(
        Object.prototype.hasOwnProperty.call(state, 'currentStep')
          ? state.currentStep
          : candidate.currentStep
      );
      const stepStatuses = normalizeStepStatuses(
        Object.prototype.hasOwnProperty.call(state, 'stepStatuses')
          ? state.stepStatuses
          : candidate.stepStatuses
      );

      return {
        currentStep,
        stepStatuses,
      };
    }

    function resolveStepKey(step, state = {}) {
      const numericStep = normalizeStepNumber(step);
      if (!numericStep || typeof getStepDefinitionForState !== 'function') {
        return '';
      }
      return String(getStepDefinitionForState(numericStep, state)?.key || '').trim();
    }

    function getResolvedSteps(state = {}) {
      if (typeof getResolvedStepsForState !== 'function') {
        return [];
      }
      const steps = getResolvedStepsForState(state);
      return Array.isArray(steps) ? steps : [];
    }

    function resolveNodeStatusKey(step = {}) {
      return String(step?.statusKey || step?.key || '').trim();
    }

    function normalizeDisplayStepStatuses(value, state = {}, nodeStatuses = null) {
      const resolvedSteps = getResolvedSteps(state).filter((step) => Boolean(step?.displayOnly));
      if (!resolvedSteps.length) {
        return {};
      }

      const explicit = normalizePlainObject(value);
      const next = {};

      for (const step of resolvedSteps) {
        const statusKey = resolveNodeStatusKey(step);
        if (!statusKey) continue;

        const hasNodeStatus = Boolean(nodeStatuses) && Object.prototype.hasOwnProperty.call(nodeStatuses, statusKey);
        const normalizedStatus = normalizeNodeStatus(
          hasNodeStatus ? nodeStatuses[statusKey] : explicit[statusKey]
        );

        if (normalizedStatus !== 'pending') {
          next[statusKey] = normalizedStatus;
        }
      }

      return next;
    }

    function normalizeNodeStatuses(value, state = {}, legacyStepCompat = null, displayStepStatuses = {}) {
      const resolvedSteps = getResolvedSteps(state);
      const explicit = isPlainObject(value)
        ? Object.fromEntries(
          Object.entries(value)
            .map(([key, status]) => [String(key || '').trim(), normalizeNodeStatus(status)])
            .filter(([key]) => Boolean(key))
        )
        : {};

      if (resolvedSteps.length) {
        const compat = legacyStepCompat || normalizeLegacyStepCompat({}, state);
        const next = {};

        for (const step of resolvedSteps) {
          const statusKey = resolveNodeStatusKey(step);
          if (!statusKey) continue;

          if (Object.prototype.hasOwnProperty.call(explicit, statusKey)) {
            next[statusKey] = explicit[statusKey];
            continue;
          }

          if (step.displayOnly) {
            next[statusKey] = normalizeNodeStatus(displayStepStatuses[statusKey]);
            continue;
          }

          const stepId = normalizeStepNumber(step?.stepId || step?.executableStepId || step?.id);
          next[statusKey] = normalizeNodeStatus(
            stepId ? compat.stepStatuses[String(stepId)] : 'pending'
          );
        }

        return next;
      }

      if (Object.keys(explicit).length > 0) {
        return explicit;
      }

      if (isPlainObject(value) && Object.keys(value).length > 0) {
        return Object.fromEntries(
          Object.entries(value)
            .map(([key, status]) => [String(key || '').trim(), normalizeNodeStatus(status)])
            .filter(([key]) => Boolean(key))
        );
      }

      const compat = legacyStepCompat || normalizeLegacyStepCompat({}, state);
      const next = {};
      for (const [stepKey, status] of Object.entries(compat.stepStatuses || {})) {
        const step = normalizeStepNumber(stepKey);
        if (!step) continue;
        const nodeKey = resolveStepKey(step, state) || `step-${step}`;
        next[nodeKey] = normalizeNodeStatus(status);
      }
      return next;
    }

    function resolveCurrentNodeId(state = {}, baseRuntimeState = {}, nodeStatuses = {}, legacyStepCompat = null) {
      const resolvedSteps = getResolvedSteps(state);
      for (const step of resolvedSteps) {
        const statusKey = resolveNodeStatusKey(step);
        if (statusKey && nodeStatuses[statusKey] === 'running') {
          return statusKey;
        }
      }

      const firstRunningNodeKey = Object.entries(nodeStatuses)
        .find(([, status]) => status === 'running')?.[0];
      if (firstRunningNodeKey) {
        return firstRunningNodeKey;
      }

      const compat = legacyStepCompat || normalizeLegacyStepCompat({}, state);
      const currentStepKey = resolveStepKey(compat.currentStep, state);
      if (currentStepKey) {
        return currentStepKey;
      }

      return String(
        Object.prototype.hasOwnProperty.call(state, 'currentNodeId')
          ? state.currentNodeId
          : baseRuntimeState.currentNodeId
      ).trim();
    }

    function pickDefinedFields(state = {}, fields = []) {
      const next = {};
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(state, field)) {
          next[field] = cloneValue(state[field]);
        }
      }
      return next;
    }

    function buildSharedState(baseValue = {}, state = {}, overrideValue = null) {
      return {
        ...cloneValue(normalizePlainObject(baseValue)),
        ...pickDefinedFields(state, RUNTIME_SHARED_FIELDS),
        ...pickDefinedFields(normalizePlainObject(overrideValue), RUNTIME_SHARED_FIELDS),
      };
    }

    function buildServiceState(baseValue = {}, state = {}, overrideValue = null) {
      const base = cloneValue(normalizePlainObject(baseValue));
      const override = normalizePlainObject(overrideValue);
      return {
        ...base,
        proxy: {
          ...cloneValue(normalizePlainObject(base.proxy)),
          ...pickDefinedFields(state, RUNTIME_PROXY_FIELDS),
          ...pickDefinedFields(normalizePlainObject(override.proxy), RUNTIME_PROXY_FIELDS),
        },
      };
    }

    function flattenSharedState(sharedState = {}) {
      return pickDefinedFields(normalizePlainObject(sharedState), RUNTIME_SHARED_FIELDS);
    }

    function flattenServiceState(serviceState = {}) {
      const service = normalizePlainObject(serviceState);
      return pickDefinedFields(normalizePlainObject(service.proxy), RUNTIME_PROXY_FIELDS);
    }

    function flattenOpenAiFlowState(flowState = {}) {
      const openaiState = normalizePlainObject(flowState.openai);
      const next = {};
      for (const [groupKey, fields] of Object.entries(OPENAI_FLOW_FIELD_GROUPS)) {
        const group = normalizePlainObject(openaiState[groupKey]);
        for (const field of fields) {
          if (Object.prototype.hasOwnProperty.call(group, field)) {
            next[field] = cloneValue(group[field]);
          }
        }
      }
      return next;
    }

    function buildOpenAiFlowState(baseValue = {}, state = {}, overrideValue = null) {
      const baseFlowState = cloneValue(normalizePlainObject(baseValue));
      const overrideFlowState = cloneValue(normalizePlainObject(overrideValue));
      const baseOpenAi = cloneValue(normalizePlainObject(baseFlowState.openai));
      const overrideOpenAi = cloneValue(normalizePlainObject(overrideFlowState.openai));
      const openaiState = {
        ...baseOpenAi,
      };

      for (const [groupKey, fields] of Object.entries(OPENAI_FLOW_FIELD_GROUPS)) {
        const overrideGroup = normalizePlainObject(overrideOpenAi[groupKey]);
        openaiState[groupKey] = {
          ...cloneValue(normalizePlainObject(baseOpenAi[groupKey])),
          ...pickDefinedFields(state, fields),
          ...pickDefinedFields(overrideGroup, fields),
        };
      }

      return {
        ...baseFlowState,
        ...overrideFlowState,
        openai: openaiState,
      };
    }

    function buildRuntimeCompatibilityFields(runtimeState = {}) {
      return {
        ...flattenSharedState(runtimeState.sharedState),
        ...flattenServiceState(runtimeState.serviceState),
        ...flattenOpenAiFlowState(runtimeState.flowState),
      };
    }

    function buildRuntimeStateDefault() {
      const runtimeDefaults = resolveRuntimeFieldDefaults();
      return {
        activeFlowId: DEFAULT_ACTIVE_FLOW_ID,
        activeRunId: '',
        currentNodeId: '',
        nodeStatuses: {},
        sharedState: buildSharedState({}, runtimeDefaults),
        serviceState: buildServiceState({}, runtimeDefaults),
        flowState: buildOpenAiFlowState({}, runtimeDefaults),
        legacyStepCompat: {
          currentStep: 0,
          stepStatuses: buildDefaultStepStatuses(),
        },
      };
    }

    function ensureRuntimeState(state = {}) {
      const runtimeStateInput = cloneValue(normalizePlainObject(state.runtimeState));
      const runtimeStateDefaults = buildRuntimeStateDefault();
      const baseRuntimeState = {
        ...runtimeStateDefaults,
        ...runtimeStateInput,
      };
      const activeFlowId = normalizeFlowId(
        Object.prototype.hasOwnProperty.call(state, 'activeFlowId')
          ? state.activeFlowId
          : baseRuntimeState.activeFlowId
      );
      const legacyStepCompat = normalizeLegacyStepCompat(baseRuntimeState.legacyStepCompat, state);
      const displayStepStatuses = normalizeDisplayStepStatuses(
        Object.prototype.hasOwnProperty.call(state, 'displayStepStatuses')
          ? state.displayStepStatuses
          : {},
        state
      );
      const nodeStatuses = normalizeNodeStatuses(
        Object.prototype.hasOwnProperty.call(state, 'nodeStatuses')
          ? state.nodeStatuses
          : baseRuntimeState.nodeStatuses,
        state,
        legacyStepCompat,
        displayStepStatuses
      );
      const currentNodeId = resolveCurrentNodeId(
        state,
        baseRuntimeState,
        nodeStatuses,
        legacyStepCompat
      );

      return {
        ...baseRuntimeState,
        activeFlowId,
        activeRunId: normalizeRunId(
          Object.prototype.hasOwnProperty.call(state, 'activeRunId')
            ? state.activeRunId
            : baseRuntimeState.activeRunId
        ),
        currentNodeId,
        nodeStatuses,
        sharedState: buildSharedState(runtimeStateDefaults.sharedState, state, runtimeStateInput.sharedState),
        serviceState: buildServiceState(runtimeStateDefaults.serviceState, state, runtimeStateInput.serviceState),
        flowState: buildOpenAiFlowState(runtimeStateDefaults.flowState, state, runtimeStateInput.flowState),
        legacyStepCompat,
      };
    }

    function buildFlattenedUpdates(updates = {}) {
      const next = {
        ...updates,
      };
      const runtimeState = normalizePlainObject(updates.runtimeState);
      const legacyStepCompat = normalizePlainObject(updates.legacyStepCompat);
      const sharedState = normalizePlainObject(updates.sharedState);
      const serviceState = normalizePlainObject(updates.serviceState);
      const flowState = normalizePlainObject(updates.flowState);

      if (Object.prototype.hasOwnProperty.call(runtimeState, 'activeFlowId')) {
        next.activeFlowId = runtimeState.activeFlowId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'activeRunId')) {
        next.activeRunId = runtimeState.activeRunId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'currentNodeId')) {
        next.currentNodeId = runtimeState.currentNodeId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'nodeStatuses')) {
        next.nodeStatuses = cloneValue(runtimeState.nodeStatuses);
      }
      if (Object.prototype.hasOwnProperty.call(legacyStepCompat, 'currentStep')) {
        next.currentStep = legacyStepCompat.currentStep;
      }
      if (Object.prototype.hasOwnProperty.call(legacyStepCompat, 'stepStatuses')) {
        next.stepStatuses = cloneValue(legacyStepCompat.stepStatuses);
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'legacyStepCompat')) {
        const compatCandidate = normalizePlainObject(runtimeState.legacyStepCompat);
        if (Object.prototype.hasOwnProperty.call(compatCandidate, 'currentStep')) {
          next.currentStep = compatCandidate.currentStep;
        }
        if (Object.prototype.hasOwnProperty.call(compatCandidate, 'stepStatuses')) {
          next.stepStatuses = cloneValue(compatCandidate.stepStatuses);
        }
      }

      Object.assign(next, pickDefinedFields(sharedState, RUNTIME_SHARED_FIELDS));
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'sharedState')) {
        Object.assign(
          next,
          pickDefinedFields(normalizePlainObject(runtimeState.sharedState), RUNTIME_SHARED_FIELDS)
        );
      }

      const serviceProxy = normalizePlainObject(serviceState.proxy);
      Object.assign(next, pickDefinedFields(serviceProxy, RUNTIME_PROXY_FIELDS));
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'serviceState')) {
        const runtimeServiceState = normalizePlainObject(runtimeState.serviceState);
        Object.assign(
          next,
          pickDefinedFields(normalizePlainObject(runtimeServiceState.proxy), RUNTIME_PROXY_FIELDS)
        );
      }

      Object.assign(next, flattenOpenAiFlowState(flowState));
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'flowState')) {
        Object.assign(next, flattenOpenAiFlowState(normalizePlainObject(runtimeState.flowState)));
      }

      return next;
    }

    function buildStateView(state = {}) {
      const runtimeState = ensureRuntimeState(state);
      const displayStepStatuses = normalizeDisplayStepStatuses(state.displayStepStatuses, {
        ...state,
        activeFlowId: runtimeState.activeFlowId,
        currentStep: runtimeState.legacyStepCompat.currentStep,
        stepStatuses: runtimeState.legacyStepCompat.stepStatuses,
      }, runtimeState.nodeStatuses);
      const compatibilityFields = buildRuntimeCompatibilityFields(runtimeState);
      return {
        ...state,
        ...compatibilityFields,
        activeFlowId: runtimeState.activeFlowId,
        activeRunId: runtimeState.activeRunId,
        currentNodeId: runtimeState.currentNodeId,
        nodeStatuses: cloneValue(runtimeState.nodeStatuses),
        displayStepStatuses: cloneValue(displayStepStatuses),
        flowState: cloneValue(runtimeState.flowState),
        sharedState: cloneValue(runtimeState.sharedState),
        serviceState: cloneValue(runtimeState.serviceState),
        legacyStepCompat: cloneValue(runtimeState.legacyStepCompat),
        currentStep: runtimeState.legacyStepCompat.currentStep,
        stepStatuses: cloneValue(runtimeState.legacyStepCompat.stepStatuses),
        runtimeState,
      };
    }

    function buildSessionStatePatch(currentState = {}, updates = {}) {
      const flattenedUpdates = buildFlattenedUpdates(updates);
      const runtimeStateUpdates = normalizePlainObject(updates.runtimeState);
      const legacyStepCompatUpdates = normalizePlainObject(updates.legacyStepCompat);
      const touchedLegacyStepCompat = (
        Object.prototype.hasOwnProperty.call(flattenedUpdates, 'currentStep')
        || Object.prototype.hasOwnProperty.call(flattenedUpdates, 'stepStatuses')
        || Object.prototype.hasOwnProperty.call(legacyStepCompatUpdates, 'currentStep')
        || Object.prototype.hasOwnProperty.call(legacyStepCompatUpdates, 'stepStatuses')
        || Object.prototype.hasOwnProperty.call(runtimeStateUpdates, 'legacyStepCompat')
      );
      const touchedStepDefinitionContext = [
        'activeFlowId',
        'phoneVerificationEnabled',
        'plusModeEnabled',
        'plusPaymentMethod',
        'signupMethod',
        'resolvedSignupMethod',
      ].some((key) => Object.prototype.hasOwnProperty.call(flattenedUpdates, key));
      const touchedDisplayStepCompat = Object.prototype.hasOwnProperty.call(flattenedUpdates, 'displayStepStatuses');
      const explicitNodeStatuses = (
        Object.prototype.hasOwnProperty.call(flattenedUpdates, 'nodeStatuses')
        || Object.prototype.hasOwnProperty.call(runtimeStateUpdates, 'nodeStatuses')
      );
      const explicitCurrentNodeId = (
        Object.prototype.hasOwnProperty.call(flattenedUpdates, 'currentNodeId')
        || Object.prototype.hasOwnProperty.call(runtimeStateUpdates, 'currentNodeId')
      );
      const nextState = {
        ...currentState,
        ...flattenedUpdates,
      };
      if (!explicitNodeStatuses && (touchedLegacyStepCompat || touchedDisplayStepCompat || touchedStepDefinitionContext)) {
        delete nextState.nodeStatuses;
      }
      if (!explicitCurrentNodeId && (touchedLegacyStepCompat || touchedDisplayStepCompat || touchedStepDefinitionContext)) {
        delete nextState.currentNodeId;
      }
      const runtimeState = ensureRuntimeState(nextState);
      const displayStepStatuses = normalizeDisplayStepStatuses(nextState.displayStepStatuses, {
        ...nextState,
        activeFlowId: runtimeState.activeFlowId,
        currentStep: runtimeState.legacyStepCompat.currentStep,
        stepStatuses: runtimeState.legacyStepCompat.stepStatuses,
      }, runtimeState.nodeStatuses);
      const compatibilityFields = buildRuntimeCompatibilityFields(runtimeState);

      return {
        ...flattenedUpdates,
        ...compatibilityFields,
        activeFlowId: runtimeState.activeFlowId,
        activeRunId: runtimeState.activeRunId,
        currentNodeId: runtimeState.currentNodeId,
        nodeStatuses: cloneValue(runtimeState.nodeStatuses),
        displayStepStatuses: cloneValue(displayStepStatuses),
        currentStep: runtimeState.legacyStepCompat.currentStep,
        stepStatuses: cloneValue(runtimeState.legacyStepCompat.stepStatuses),
        runtimeState,
      };
    }

    return {
      DEFAULT_ACTIVE_FLOW_ID,
      OPENAI_FLOW_FIELD_GROUPS,
      RUNTIME_PROXY_FIELDS,
      RUNTIME_SHARED_FIELDS,
      buildDefaultRuntimeState: buildRuntimeStateDefault,
      buildSessionStatePatch,
      buildStateView,
      ensureRuntimeState,
    };
  }

  return {
    createRuntimeStateHelpers,
  };
});
