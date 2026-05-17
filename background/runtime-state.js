(function attachBackgroundRuntimeState(root, factory) {
  root.MultiPageBackgroundRuntimeState = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundRuntimeStateModule() {
  function createRuntimeStateHelpers(deps = {}) {
    const {
      DEFAULT_ACTIVE_FLOW_ID = 'openai',
      defaultNodeStatuses = {},
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
      ]),
      luckmail: Object.freeze([
        'currentLuckmailPurchase',
        'currentLuckmailMailCursor',
        'currentYydsMailInbox',
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

    function normalizeFlowId(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized || DEFAULT_ACTIVE_FLOW_ID;
    }

    function normalizeRunId(value = '') {
      return String(value || '').trim();
    }

    function normalizeNodeStatus(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) {
        return 'pending';
      }
      return normalized;
    }

    function buildDefaultNodeStatuses() {
      return Object.fromEntries(
        Object.entries(normalizePlainObject(defaultNodeStatuses)).map(([key, value]) => [
          String(key),
          normalizeNodeStatus(value),
        ])
      );
    }

    function normalizeNodeStatuses(value) {
      const base = buildDefaultNodeStatuses();
      if (!isPlainObject(value)) {
        return base;
      }

      const next = { ...base };
      for (const [key, status] of Object.entries(value)) {
        const nodeId = String(key || '').trim();
        if (!nodeId) continue;
        next[nodeId] = normalizeNodeStatus(status);
      }
      return next;
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

    function buildSharedState(baseValue = {}, state = {}) {
      return {
        ...cloneValue(normalizePlainObject(baseValue)),
        ...pickDefinedFields(state, RUNTIME_SHARED_FIELDS),
      };
    }

    function buildServiceState(baseValue = {}, state = {}) {
      const base = cloneValue(normalizePlainObject(baseValue));
      return {
        ...base,
        proxy: {
          ...cloneValue(normalizePlainObject(base.proxy)),
          ...pickDefinedFields(state, RUNTIME_PROXY_FIELDS),
        },
      };
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

    function buildOpenAiFlowState(baseValue = {}, state = {}) {
      const baseFlowState = cloneValue(normalizePlainObject(baseValue));
      const baseOpenAi = cloneValue(normalizePlainObject(baseFlowState.openai));
      const openaiState = {
        ...baseOpenAi,
      };

      for (const [groupKey, fields] of Object.entries(OPENAI_FLOW_FIELD_GROUPS)) {
        openaiState[groupKey] = {
          ...cloneValue(normalizePlainObject(baseOpenAi[groupKey])),
          ...pickDefinedFields(state, fields),
        };
      }

      return {
        ...baseFlowState,
        openai: openaiState,
      };
    }

    function buildRuntimeStateDefault() {
      return {
        flowId: DEFAULT_ACTIVE_FLOW_ID,
        runId: '',
        activeFlowId: DEFAULT_ACTIVE_FLOW_ID,
        activeRunId: '',
        currentNodeId: '',
        nodeStatuses: {},
        sharedState: {},
        serviceState: {
          proxy: {},
        },
        flowState: {
          openai: {
            auth: {},
            platformBinding: {},
            plus: {},
            phoneVerification: {},
            luckmail: {},
            identity: {},
          },
        },
      };
    }

    function ensureRuntimeState(state = {}) {
      const baseRuntimeState = {
        ...buildRuntimeStateDefault(),
        ...cloneValue(normalizePlainObject(state.runtimeState)),
      };
      const activeFlowId = normalizeFlowId(
        Object.prototype.hasOwnProperty.call(state, 'flowId')
          ? state.flowId
          : Object.prototype.hasOwnProperty.call(state, 'activeFlowId')
          ? state.activeFlowId
          : Object.prototype.hasOwnProperty.call(baseRuntimeState, 'flowId')
            ? baseRuntimeState.flowId
          : baseRuntimeState.activeFlowId
      );
      const currentNodeId = String(
        Object.prototype.hasOwnProperty.call(state, 'currentNodeId')
          ? state.currentNodeId
          : baseRuntimeState.currentNodeId
      ).trim();
      const nodeStatuses = normalizeNodeStatuses(
        Object.prototype.hasOwnProperty.call(state, 'nodeStatuses')
          ? state.nodeStatuses
          : baseRuntimeState.nodeStatuses
      );

      return {
        ...baseRuntimeState,
        flowId: activeFlowId,
        activeFlowId,
        runId: normalizeRunId(
          Object.prototype.hasOwnProperty.call(state, 'runId')
            ? state.runId
            : Object.prototype.hasOwnProperty.call(state, 'activeRunId')
              ? state.activeRunId
              : Object.prototype.hasOwnProperty.call(baseRuntimeState, 'runId')
                ? baseRuntimeState.runId
                : baseRuntimeState.activeRunId
        ),
        activeRunId: normalizeRunId(
          Object.prototype.hasOwnProperty.call(state, 'runId')
            ? state.runId
            : Object.prototype.hasOwnProperty.call(state, 'activeRunId')
              ? state.activeRunId
              : Object.prototype.hasOwnProperty.call(baseRuntimeState, 'runId')
                ? baseRuntimeState.runId
                : baseRuntimeState.activeRunId
        ),
        currentNodeId,
        nodeStatuses,
        sharedState: buildSharedState(baseRuntimeState.sharedState, state),
        serviceState: buildServiceState(baseRuntimeState.serviceState, state),
        flowState: buildOpenAiFlowState(baseRuntimeState.flowState, state),
      };
    }

    function buildFlattenedUpdates(updates = {}) {
      const ignoredKeys = new Set(['current' + 'Step', 'step' + 'Statuses', 'legacy' + 'StepCompat']);
      const next = {};
      for (const [key, value] of Object.entries(updates || {})) {
        if (!ignoredKeys.has(key)) {
          next[key] = value;
        }
      }
      const runtimeState = normalizePlainObject(updates.runtimeState);
      const sharedState = normalizePlainObject(updates.sharedState);
      const serviceState = normalizePlainObject(updates.serviceState);
      const flowState = normalizePlainObject(updates.flowState);

      if (Object.prototype.hasOwnProperty.call(runtimeState, 'activeFlowId')) {
        next.activeFlowId = runtimeState.activeFlowId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'flowId')) {
        next.flowId = runtimeState.flowId;
        next.activeFlowId = runtimeState.flowId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'activeRunId')) {
        next.activeRunId = runtimeState.activeRunId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'runId')) {
        next.runId = runtimeState.runId;
        next.activeRunId = runtimeState.runId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'currentNodeId')) {
        next.currentNodeId = runtimeState.currentNodeId;
      }
      if (Object.prototype.hasOwnProperty.call(runtimeState, 'nodeStatuses')) {
        next.nodeStatuses = cloneValue(runtimeState.nodeStatuses);
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
      return {
        ...state,
        flowId: runtimeState.flowId,
        runId: runtimeState.runId,
        activeFlowId: runtimeState.activeFlowId,
        activeRunId: runtimeState.activeRunId,
        currentNodeId: runtimeState.currentNodeId,
        nodeStatuses: cloneValue(runtimeState.nodeStatuses),
        flowState: cloneValue(runtimeState.flowState),
        sharedState: cloneValue(runtimeState.sharedState),
        serviceState: cloneValue(runtimeState.serviceState),
        runtimeState,
      };
    }

    function buildSessionStatePatch(currentState = {}, updates = {}) {
      const flattenedUpdates = buildFlattenedUpdates(updates);
      const nextState = {
        ...currentState,
        ...flattenedUpdates,
      };
      const runtimeState = ensureRuntimeState(nextState);

      return {
        ...flattenedUpdates,
        flowId: runtimeState.flowId,
        runId: runtimeState.runId,
        activeFlowId: runtimeState.activeFlowId,
        activeRunId: runtimeState.activeRunId,
        currentNodeId: runtimeState.currentNodeId,
        nodeStatuses: cloneValue(runtimeState.nodeStatuses),
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
