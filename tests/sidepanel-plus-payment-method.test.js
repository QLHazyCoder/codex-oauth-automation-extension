const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
const sharedStepDefinitionsSource = fs.readFileSync('data/step-definitions.js', 'utf8');
const sharedStepDefinitions = new Function(
  'self',
  `${sharedStepDefinitionsSource}; return self.MultiPageStepDefinitions;`
)({});

function extractFunction(name) {
  const asyncStart = sidepanelSource.indexOf(`async function ${name}(`);
  const normalStart = sidepanelSource.indexOf(`function ${name}(`);
  const start = asyncStart !== -1
    ? asyncStart
    : normalStart;
  if (start === -1) {
    throw new Error(`Function ${name} not found`);
  }
  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = start; index < sidepanelSource.length; index += 1) {
    const char = sidepanelSource[index];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }
  if (signatureEnd < 0) {
    throw new Error(`Function ${name} signature not found`);
  }
  const bodyStart = sidepanelSource.indexOf('{', signatureEnd);
  let depth = 0;
  let end = bodyStart;
  for (; end < sidepanelSource.length; end += 1) {
    const char = sidepanelSource[end];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return sidepanelSource.slice(start, end);
}

function extractLastFunction(name) {
  const asyncStart = sidepanelSource.lastIndexOf(`async function ${name}(`);
  const normalStart = sidepanelSource.lastIndexOf(`function ${name}(`);
  const asyncInnerFunctionStart = asyncStart >= 0 ? asyncStart + 'async '.length : -1;
  const start = asyncStart >= 0 && normalStart === asyncInnerFunctionStart
    ? asyncStart
    : (asyncStart > normalStart ? asyncStart : normalStart);
  if (start === -1) {
    throw new Error(`Function ${name} not found`);
  }
  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = start; index < sidepanelSource.length; index += 1) {
    const char = sidepanelSource[index];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }
  if (signatureEnd < 0) {
    throw new Error(`Function ${name} signature not found`);
  }
  const bodyStart = sidepanelSource.indexOf('{', signatureEnd);
  let depth = 0;
  let end = bodyStart;
  for (; end < sidepanelSource.length; end += 1) {
    const char = sidepanelSource[end];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return sidepanelSource.slice(start, end);
}

test('sidepanel step definitions keep the selected Plus payment method', () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getStepDefinitionsForMode'),
    extractFunction('rebuildStepDefinitionState'),
    extractFunction('syncStepDefinitionsForMode'),
  ].join('\n');

  const api = new Function('sharedStepDefinitions', `
const calls = [];
const window = {
  MultiPageStepDefinitions: {
    getSteps(options) {
      calls.push({ type: 'getSteps', options });
      return [{ id: options.plusPaymentMethod === 'gopay' ? 7 : 6, order: 1 }];
    },
  },
};
let latestState = {};
let currentPlusModeEnabled = false;
let currentPlusPaymentMethod = 'paypal';
let currentPhoneVerificationEnabled = false;
let currentSignupMethod = 'email';
const DEFAULT_SIGNUP_METHOD = 'email';
let stepDefinitions = [];
let STEP_IDS = [];
let STEP_DEFAULT_STATUSES = {};
let SKIPPABLE_STEPS = new Set();
function renderStepsList() {
  calls.push({ type: 'render', stepIds: [...STEP_IDS] });
}
${bundle}
return {
  calls,
  syncStepDefinitionsForMode,
  getCurrentPlusPaymentMethod: () => currentPlusPaymentMethod,
  getStepIds: () => [...STEP_IDS],
};
`)();

  api.syncStepDefinitionsForMode(true, 'gopay', { render: true });

  assert.equal(api.getCurrentPlusPaymentMethod(), 'gopay');
  assert.deepEqual(api.getStepIds(), [7]);
  assert.deepEqual(api.calls[0], {
    type: 'getSteps',
    options: { activeFlowId: 'openai', phoneVerificationEnabled: false, plusModeEnabled: true, plusPaymentMethod: 'gopay', signupMethod: 'email' },
  });
  assert.deepEqual(api.calls[1], { type: 'render', stepIds: [7] });
});

test('sidepanel display-only phone verification step is email signup only', () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('getDisplayStepDefinitions'),
  ].join('\n');

  const api = new Function('sharedStepDefinitions', `
const DISPLAY_PHONE_VERIFICATION_STEP_KEY = 'phone-verification';
const DISPLAY_PHONE_VERIFICATION_TITLE = '\\u624b\\u673a\\u53f7\\u9a8c\\u8bc1';
const DISPLAY_PHONE_VERIFICATION_BEFORE_STEP_KEY = 'confirm-oauth';
const SIGNUP_METHOD_EMAIL = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;
const DEFAULT_ACTIVE_FLOW_ID = 'openai';
const window = {
  MultiPageStepDefinitions: {
    resolveSteps(steps, options) {
      return sharedStepDefinitions.resolveSteps(steps, options);
    },
    shouldShowPhoneVerificationStep(options) {
      return sharedStepDefinitions.shouldShowPhoneVerificationStep(options);
    },
  },
};
let latestState = {};
let currentPhoneVerificationEnabled = false;
let currentSignupMethod = 'email';
let stepDefinitions = [];
${bundle}
return {
  getDisplayStepDefinitions,
};
`)(sharedStepDefinitions);

  const baseSteps = [
    { id: 7, order: 70, key: 'oauth-login', title: 'OAuth' },
    { id: 8, order: 80, key: 'fetch-login-code', title: 'Login code' },
    { id: 9, order: 90, key: 'confirm-oauth', title: 'Confirm OAuth' },
    { id: 10, order: 100, key: 'platform-verify', title: 'Platform verify' },
  ];

  const emailDisplaySteps = api.getDisplayStepDefinitions(baseSteps, {
    phoneVerificationEnabled: true,
    signupMethod: 'email',
  });
  assert.deepEqual(
    emailDisplaySteps.map((step) => step.key),
    ['oauth-login', 'fetch-login-code', 'phone-verification', 'confirm-oauth', 'platform-verify']
  );
  assert.deepEqual(
    emailDisplaySteps.map((step) => step.displayStepId),
    [7, 8, 9, 10, 11]
  );
  assert.deepEqual(
    emailDisplaySteps.filter((step) => !step.displayOnly).map((step) => step.executableStepId),
    [7, 8, 9, 10]
  );
  assert.equal(emailDisplaySteps[2].displayOnly, true);
  assert.equal(emailDisplaySteps[2].executableStepId, '');

  assert.equal(sharedStepDefinitions.shouldShowPhoneVerificationStep({
    phoneVerificationEnabled: true,
    signupMethod: 'email',
  }), true);
  assert.equal(sharedStepDefinitions.shouldShowPhoneVerificationStep({
    phoneVerificationEnabled: false,
    signupMethod: 'email',
  }), false);
  assert.equal(sharedStepDefinitions.shouldShowPhoneVerificationStep({
    phoneVerificationEnabled: true,
    signupMethod: 'phone',
  }), false);
  assert.equal(api.getDisplayStepDefinitions(baseSteps, {
    phoneVerificationEnabled: true,
    signupMethod: 'phone',
  }).some((step) => step.key === 'phone-verification'), false);
});

test('sidepanel display-only phone verification no longer keeps dedicated muted styling', () => {
  const css = fs.readFileSync('sidepanel/sidepanel.css', 'utf8');
  assert.doesNotMatch(css, /\.step-row\.step-display-only \.step-indicator\s*\{/);
  assert.doesNotMatch(css, /\.step-row\.step-display-only \.step-btn:disabled\s*\{/);
  assert.doesNotMatch(css, /\.step-row\.step-display-only\.completed \.step-btn:disabled\s*\{/);
  assert.doesNotMatch(css, /\.step-row\.step-display-only \.step-status\s*\{/);
});

test('sidepanel display-only phone verification keeps generic row classes and skip toast wording', () => {
  const renderStepsListSource = extractLastFunction('renderStepsList');
  const renderDisplayOnlyStepStatusSource = extractLastFunction('renderDisplayOnlyStepStatus');
  const handleSkipDisplayStepSource = extractLastFunction('handleSkipDisplayStep');

  assert.match(renderStepsListSource, /<div class="step-row"/);
  assert.doesNotMatch(renderStepsListSource, /step-display-only/);
  assert.match(renderDisplayOnlyStepStatusSource, /row\.className = `step-row \$\{normalizedStatus\}`;/);
  assert.match(handleSkipDisplayStepSource, /showToast\(`步骤 \$\{stepLabel\} 已跳过`/);
  assert.doesNotMatch(handleSkipDisplayStepSource, /手机号验证步骤已跳过/);
});

test('sidepanel phone verification display changes without changing executable step ids', () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getStepDefinitionsForMode'),
    extractFunction('getDisplayStepDefinitions'),
    extractFunction('rebuildStepDefinitionState'),
    extractFunction('syncStepDefinitionsForMode'),
  ].join('\n');

  const api = new Function('sharedStepDefinitions', `
const calls = [];
const DISPLAY_PHONE_VERIFICATION_STEP_KEY = 'phone-verification';
const DISPLAY_PHONE_VERIFICATION_TITLE = '\\u624b\\u673a\\u53f7\\u9a8c\\u8bc1';
const DISPLAY_PHONE_VERIFICATION_BEFORE_STEP_KEY = 'confirm-oauth';
const SIGNUP_METHOD_EMAIL = 'email';
const SIGNUP_METHOD_PHONE = 'phone';
const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;
const DEFAULT_ACTIVE_FLOW_ID = 'openai';
const window = {
  MultiPageStepDefinitions: {
    getSteps(options) {
      calls.push({ type: 'getSteps', options });
      return [
        { id: 8, order: 80, key: 'fetch-login-code', title: 'Login code' },
        { id: 9, order: 90, key: 'confirm-oauth', title: 'Confirm OAuth' },
        { id: 10, order: 100, key: 'platform-verify', title: 'Platform verify' },
      ];
    },
    getPlusPaymentStepTitle() {
      return '';
    },
    resolveSteps(steps, options) {
      return sharedStepDefinitions.resolveSteps(steps, options);
    },
    shouldShowPhoneVerificationStep(options) {
      return sharedStepDefinitions.shouldShowPhoneVerificationStep(options);
    },
  },
};
let latestState = { phoneVerificationEnabled: false };
let currentPlusModeEnabled = false;
let currentPlusPaymentMethod = 'paypal';
let currentPhoneVerificationEnabled = false;
let currentSignupMethod = 'email';
let stepDefinitions = [];
let STEP_IDS = [];
let STEP_DEFAULT_STATUSES = {};
let SKIPPABLE_STEPS = new Set();
function getSelectedPlusPaymentMethod() { return 'paypal'; }
function renderStepsList() {
  calls.push({
    type: 'render',
    displayKeys: getDisplayStepDefinitions().map((step) => step.key),
    displayStepIds: getDisplayStepDefinitions().map((step) => step.displayStepId),
    stepIds: [...STEP_IDS],
  });
}
${bundle}
return {
  calls,
  syncStepDefinitionsForMode,
};
`)(sharedStepDefinitions);

  api.syncStepDefinitionsForMode(false, {
    phoneVerificationEnabled: false,
    render: true,
    signupMethod: 'email',
  });
  api.syncStepDefinitionsForMode(false, {
    phoneVerificationEnabled: true,
    render: true,
    signupMethod: 'email',
  });
  api.syncStepDefinitionsForMode(false, {
    phoneVerificationEnabled: true,
    render: true,
    signupMethod: 'phone',
  });

  const renders = api.calls.filter((entry) => entry.type === 'render');
  assert.deepEqual(renders[0].stepIds, [8, 9, 10]);
  assert.deepEqual(renders[1].stepIds, [8, 9, 10]);
  assert.deepEqual(renders[1].displayKeys, ['fetch-login-code', 'phone-verification', 'confirm-oauth', 'platform-verify']);
  assert.deepEqual(renders[1].displayStepIds, [8, 9, 10, 11]);
  assert.deepEqual(renders[2].displayKeys, ['fetch-login-code', 'confirm-oauth', 'platform-verify']);
});

test('sidepanel display-only phone verification unlock order follows display status instead of previous real step', () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('isDoneStatus'),
    extractFunction('getDisplayStepDefinitions'),
    extractFunction('getStepStatuses'),
    extractFunction('getDisplayStepStatuses'),
    extractFunction('getDisplayStepStatus'),
    extractFunction('findDisplayStepEntryIndex'),
    extractFunction('getPreviousDisplayStepStatus'),
    extractFunction('canRunDisplayStepEntry'),
    extractFunction('canSkipDisplayStepEntry'),
  ].join('\n');

  const api = new Function('sharedStepDefinitions', `
const DISPLAY_PHONE_VERIFICATION_STEP_KEY = 'phone-verification';
const DISPLAY_PHONE_VERIFICATION_TITLE = '\\u624b\\u673a\\u53f7\\u9a8c\\u8bc1';
const DISPLAY_PHONE_VERIFICATION_BEFORE_STEP_KEY = 'confirm-oauth';
const SIGNUP_METHOD_EMAIL = 'email';
const DEFAULT_SIGNUP_METHOD = SIGNUP_METHOD_EMAIL;
const DEFAULT_ACTIVE_FLOW_ID = 'openai';
const window = {
  MultiPageStepDefinitions: {
    resolveSteps(steps, options) {
      return sharedStepDefinitions.resolveSteps(steps, options);
    },
    shouldShowPhoneVerificationStep(options) {
      return sharedStepDefinitions.shouldShowPhoneVerificationStep(options);
    },
  },
};
const STATUS_ICONS = {
  pending: '',
  running: '',
  completed: '',
  failed: '',
  stopped: '',
  manual_completed: '',
  skipped: '',
};
let latestState = {
  activeFlowId: 'openai',
  phoneVerificationEnabled: true,
  signupMethod: 'email',
  displayStepStatuses: {},
};
let currentPhoneVerificationEnabled = true;
let currentSignupMethod = 'email';
let stepDefinitions = [];
${bundle}
return {
  getDisplayStepDefinitions,
  getDisplayStepStatus,
  canRunDisplayStepEntry,
  canSkipDisplayStepEntry,
};
`)(sharedStepDefinitions);

  const baseSteps = [
    { id: 7, order: 70, key: 'oauth-login', title: 'OAuth' },
    { id: 8, order: 80, key: 'fetch-login-code', title: 'Login code' },
    { id: 9, order: 90, key: 'confirm-oauth', title: 'Confirm OAuth' },
    { id: 10, order: 100, key: 'platform-verify', title: 'Platform verify' },
  ];
  const displaySteps = api.getDisplayStepDefinitions(baseSteps, {
    phoneVerificationEnabled: true,
    signupMethod: 'email',
  });
  const phoneStep = displaySteps.find((step) => step.key === 'phone-verification');
  const confirmStep = displaySteps.find((step) => step.key === 'confirm-oauth');
  const statuses = { 7: 'completed', 8: 'completed', 9: 'pending', 10: 'pending' };

  assert.equal(api.getDisplayStepStatus(phoneStep, statuses, {
    displayStepStatuses: {},
  }), 'pending');
  assert.equal(api.canRunDisplayStepEntry(phoneStep, displaySteps, statuses, {
    displayStepStatuses: {},
  }), true);
  assert.equal(api.canSkipDisplayStepEntry(phoneStep, displaySteps, statuses, {
    displayStepStatuses: {},
  }), true);
  assert.equal(api.canRunDisplayStepEntry(confirmStep, displaySteps, statuses, {
    displayStepStatuses: {},
  }), false);

  assert.equal(api.canRunDisplayStepEntry(confirmStep, displaySteps, statuses, {
    displayStepStatuses: { 'phone-verification': 'skipped' },
  }), true);
  assert.equal(api.canRunDisplayStepEntry(confirmStep, displaySteps, statuses, {
    displayStepStatuses: { 'phone-verification': 'completed' },
  }), true);
  assert.equal(api.getDisplayStepStatus(phoneStep, statuses, {
    nodeStatuses: { 'phone-verification': 'running' },
    displayStepStatuses: { 'phone-verification': 'completed' },
  }), 'running');
  assert.equal(api.canRunDisplayStepEntry(confirmStep, displaySteps, statuses, {
    nodeStatuses: { 'phone-verification': 'skipped' },
    displayStepStatuses: {},
  }), true);
});

test('sidepanel DATA_UPDATED refreshes display steps for canonical node status payloads', () => {
  assert.match(
    sidepanelSource,
    /const shouldRefreshDisplaySteps = \(\s*Object\.prototype\.hasOwnProperty\.call\(message\.payload, 'displayStepStatuses'\)\s*\|\|\s*Object\.prototype\.hasOwnProperty\.call\(message\.payload, 'nodeStatuses'\)\s*\|\|\s*Object\.prototype\.hasOwnProperty\.call\(message\.payload, 'currentNodeId'\)\s*\);/
  );
});

test('sidepanel normalizeSignupMethod stays independent from signup constants during bootstrap', () => {
  const source = extractFunction('normalizeSignupMethod');
  assert.doesNotMatch(source, /SIGNUP_METHOD_(PHONE|EMAIL)/);
});

test('sidepanel initializes latestState before bootstrapping shared step definitions', () => {
  const latestStateIndex = sidepanelSource.indexOf('let latestState = null;');
  const bootstrapIndex = sidepanelSource.indexOf('let stepDefinitions = getStepDefinitionsForMode(false, {');

  assert.notEqual(latestStateIndex, -1);
  assert.notEqual(bootstrapIndex, -1);
  assert.ok(latestStateIndex < bootstrapIndex);
});

test('sidepanel signup method UI syncs shared step definitions with the selected signup method', () => {
  const source = extractFunction('updateSignupMethodUI');
  assert.match(source, /syncStepDefinitionsForMode\(/);
  assert.match(source, /phoneVerificationEnabled:\s*stepDefinitionState\.phoneVerificationEnabled/);
  assert.match(source, /signupMethod:\s*stepDefinitionState\.signupMethod/);
});

test('sidepanel applies restored signup method when rebuilding shared step definitions on load', () => {
  const source = extractFunction('applySettingsState');
  assert.match(source, /resolveStepDefinitionCapabilityState\(state/);
  assert.match(source, /signupMethod:\s*stepDefinitionState\.signupMethod/);
});

test('sidepanel Plus UI hides PayPal account selector while GoPay is selected', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gopay' };
let currentPlusPaymentMethod = 'paypal';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gopay', style: { display: 'none' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const rowPayPalAccount = { style: { display: '' } };
${bundle}
return { updatePlusModeUI, selectPlusPaymentMethod, rowPayPalAccount };
`)();

  api.updatePlusModeUI();

  assert.equal(api.selectPlusPaymentMethod.style.display, '');
  assert.equal(api.rowPayPalAccount.style.display, 'none');

  api.selectPlusPaymentMethod.value = 'paypal';
  api.updatePlusModeUI();
  assert.equal(api.rowPayPalAccount.style.display, '');
});

test('sidepanel Plus UI can hide Plus controls when the shared flow capability registry disables them', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
const window = {
  MultiPageFlowCapabilities: {
    createFlowCapabilityRegistry() {
      return {
        resolveSidepanelCapabilities() {
          return {
            canShowPlusSettings: false,
            runtimeLocks: { plusModeEnabled: false },
          };
        },
      };
    },
  },
};
let latestState = { plusPaymentMethod: 'paypal' };
const inputPlusModeEnabled = { checked: true };
const rowPlusMode = { style: { display: '' } };
const selectPlusPaymentMethod = { value: 'paypal', style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: '' } };
const rowPayPalAccount = { style: { display: '' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
${bundle}
return {
  rowPlusMode,
  rowPlusPaymentMethod,
  rowPayPalAccount,
  selectPlusPaymentMethod,
  updatePlusModeUI,
};
`)();

  api.updatePlusModeUI();

  assert.equal(api.rowPlusMode.style.display, 'none');
  assert.equal(api.rowPlusPaymentMethod.style.display, 'none');
  assert.equal(api.rowPayPalAccount.style.display, 'none');
  assert.equal(api.selectPlusPaymentMethod.style.display, 'none');
});

test('sidepanel step definitions keep GPC helper mode distinct', () => {
  const bundle = [
    extractFunction('normalizeSignupMethod'),
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getStepDefinitionsForMode'),
    extractFunction('rebuildStepDefinitionState'),
    extractFunction('syncStepDefinitionsForMode'),
  ].join('\n');

  const api = new Function(`
const calls = [];
const window = {
  MultiPageStepDefinitions: {
    getSteps(options) {
      calls.push({ type: 'getSteps', options });
      return [{ id: options.plusPaymentMethod === 'gpc-helper' ? 13 : 6, order: 1 }];
    },
  },
};
let latestState = {};
let currentPlusModeEnabled = false;
let currentPlusPaymentMethod = 'paypal';
let currentPhoneVerificationEnabled = false;
let currentSignupMethod = 'email';
const DEFAULT_SIGNUP_METHOD = 'email';
let stepDefinitions = [];
let STEP_IDS = [];
let STEP_DEFAULT_STATUSES = {};
let SKIPPABLE_STEPS = new Set();
function renderStepsList() {
  calls.push({ type: 'render', stepIds: [...STEP_IDS] });
}
${bundle}
return {
  calls,
  syncStepDefinitionsForMode,
  getCurrentPlusPaymentMethod: () => currentPlusPaymentMethod,
  getStepIds: () => [...STEP_IDS],
};
`)();

  api.syncStepDefinitionsForMode(true, 'gpc-helper', { render: true });

  assert.equal(api.getCurrentPlusPaymentMethod(), 'gpc-helper');
  assert.deepEqual(api.getStepIds(), [13]);
  assert.deepEqual(api.calls[0], {
    type: 'getSteps',
    options: { activeFlowId: 'openai', phoneVerificationEnabled: false, plusModeEnabled: true, plusPaymentMethod: 'gpc-helper', signupMethod: 'email' },
  });
});

test('sidepanel Plus UI shows GPC fields and purchase button only for GPC', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gpc-helper', gopayHelperAutoModeEnabled: true };
let currentPlusPaymentMethod = 'paypal';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gpc-helper', style: { display: 'none' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const plusPaymentMethodCaption = { textContent: '' };
const btnGpcCardKeyPurchase = { style: { display: 'none' } };
const rowPayPalAccount = { style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: 'none' } };
const rowGpcHelperApi = { style: { display: 'none' } };
const rowGpcHelperCardKey = { style: { display: 'none' } };
const rowGpcHelperPhoneMode = { style: { display: 'none' } };
const selectGpcHelperPhoneMode = { value: 'manual' };
const rowGpcHelperCountryCode = { style: { display: 'none' } };
const rowGpcHelperPhone = { style: { display: 'none' } };
const rowGpcHelperOtpChannel = { style: { display: 'none' } };
const selectGpcHelperOtpChannel = { value: 'whatsapp' };
const rowGpcHelperLocalSmsEnabled = { style: { display: 'none' } };
const inputGpcHelperLocalSmsEnabled = { checked: false };
const rowGpcHelperLocalSmsUrl = { style: { display: 'none' } };
const rowGpcHelperPin = { style: { display: 'none' } };
const rowGoPayCountryCode = { style: { display: 'none' } };
const rowGoPayPhone = { style: { display: 'none' } };
const rowGoPayOtp = { style: { display: 'none' } };
const rowGoPayPin = { style: { display: 'none' } };
${bundle}
return {
  updatePlusModeUI,
  selectPlusPaymentMethod,
  selectGpcHelperPhoneMode,
  selectGpcHelperOtpChannel,
  inputGpcHelperLocalSmsEnabled,
  btnGpcCardKeyPurchase,
  rowPayPalAccount,
  plusPaymentMethodCaption,
  rows: { rowGpcHelperApi, rowGpcHelperCardKey, rowGpcHelperPhoneMode, rowGpcHelperCountryCode, rowGpcHelperPhone, rowGpcHelperOtpChannel, rowGpcHelperLocalSmsEnabled, rowGpcHelperLocalSmsUrl, rowGpcHelperPin },
};
`)();

  api.updatePlusModeUI();

  assert.equal(api.rowPayPalAccount.style.display, 'none');
  assert.equal(api.btnGpcCardKeyPurchase.style.display, '');
  assert.equal(api.rows.rowGpcHelperApi.style.display, '');
  assert.equal(api.rows.rowGpcHelperCardKey.style.display, '');
  assert.equal(api.rows.rowGpcHelperPhoneMode.style.display, '');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, '');
  assert.equal(api.rows.rowGpcHelperOtpChannel.style.display, '');
  assert.equal(api.rows.rowGpcHelperLocalSmsEnabled.style.display, '');
  assert.equal(api.rows.rowGpcHelperLocalSmsUrl.style.display, 'none');
  assert.match(api.plusPaymentMethodCaption.textContent, /GPC/);

  api.inputGpcHelperLocalSmsEnabled.checked = true;
  api.updatePlusModeUI();
  assert.equal(api.selectGpcHelperOtpChannel.value, 'whatsapp');
  assert.equal(api.rows.rowGpcHelperLocalSmsUrl.style.display, '');

  api.selectGpcHelperOtpChannel.value = 'sms';
  api.updatePlusModeUI();
  assert.equal(api.inputGpcHelperLocalSmsEnabled.checked, true);
  assert.equal(api.rows.rowGpcHelperLocalSmsEnabled.style.display, '');
  assert.equal(api.rows.rowGpcHelperLocalSmsUrl.style.display, '');

  api.selectGpcHelperPhoneMode.value = 'auto';
  api.updatePlusModeUI();
  assert.equal(api.rows.rowGpcHelperPhoneMode.style.display, '');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperOtpChannel.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperLocalSmsEnabled.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperLocalSmsUrl.style.display, 'none');
  assert.match(api.plusPaymentMethodCaption.textContent, /自动/);

  api.selectPlusPaymentMethod.value = 'gopay';
  api.updatePlusModeUI();
  assert.equal(api.btnGpcCardKeyPurchase.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperApi.style.display, 'none');
  assert.equal(api.rowPayPalAccount.style.display, 'none');
});

test('sidepanel keeps selected GPC auto mode when API Key has no auto permission', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gpc-helper', gopayHelperPhoneMode: 'auto', gopayHelperAutoModeEnabled: false, gopayHelperBalancePayload: { auto_mode_enabled: false } };
let currentPlusPaymentMethod = 'gpc-helper';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gpc-helper', style: { display: 'none' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const plusPaymentMethodCaption = { textContent: '' };
const btnGpcCardKeyPurchase = { style: { display: 'none' } };
const rowPayPalAccount = { style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: 'none' } };
const rowGpcHelperApi = { style: { display: 'none' } };
const rowGpcHelperCardKey = { style: { display: 'none' } };
const rowGpcHelperPhoneMode = { style: { display: 'none' } };
const selectGpcHelperPhoneMode = { value: 'auto' };
const rowGpcHelperCountryCode = { style: { display: 'none' } };
const rowGpcHelperPhone = { style: { display: 'none' } };
const rowGpcHelperOtpChannel = { style: { display: 'none' } };
const selectGpcHelperOtpChannel = { value: 'whatsapp' };
const rowGpcHelperLocalSmsEnabled = { style: { display: 'none' } };
const inputGpcHelperLocalSmsEnabled = { checked: false };
const rowGpcHelperLocalSmsUrl = { style: { display: 'none' } };
const rowGpcHelperPin = { style: { display: 'none' } };
${bundle}
return { updatePlusModeUI, selectGpcHelperPhoneMode, plusPaymentMethodCaption, rows: { rowGpcHelperPhoneMode, rowGpcHelperPhone, rowGpcHelperOtpChannel, rowGpcHelperPin } };
`)();

  api.updatePlusModeUI();

  assert.equal(api.rows.rowGpcHelperPhoneMode.style.display, '');
  assert.equal(api.selectGpcHelperPhoneMode.value, 'auto');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperOtpChannel.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperPin.style.display, 'none');
  assert.match(api.plusPaymentMethodCaption.textContent, /手动/);
});

test('sidepanel keeps selected GPC auto mode when persisted permission survives stop refresh', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = {
  plusPaymentMethod: 'gpc-helper',
  gopayHelperPhoneMode: 'auto',
  gopayHelperAutoModeEnabled: true,
  gopayHelperBalancePayload: { auto_mode_enabled: true },
};
let currentPlusPaymentMethod = 'gpc-helper';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gpc-helper', style: { display: 'none' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const plusPaymentMethodCaption = { textContent: '' };
const rowPayPalAccount = { style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: 'none' } };
const rowGpcHelperApi = { style: { display: 'none' } };
const rowGpcHelperCardKey = { style: { display: 'none' } };
const rowGpcHelperPhoneMode = { style: { display: 'none' } };
const selectGpcHelperPhoneMode = { value: 'auto' };
const rowGpcHelperCountryCode = { style: { display: 'none' } };
const rowGpcHelperPhone = { style: { display: 'none' } };
const rowGpcHelperOtpChannel = { style: { display: 'none' } };
const selectGpcHelperOtpChannel = { value: 'whatsapp' };
const rowGpcHelperLocalSmsEnabled = { style: { display: 'none' } };
const inputGpcHelperLocalSmsEnabled = { checked: false };
const rowGpcHelperLocalSmsUrl = { style: { display: 'none' } };
const rowGpcHelperPin = { style: { display: 'none' } };
${bundle}
function syncLatestState(nextState) { latestState = { ...latestState, ...nextState }; }
return {
  updatePlusModeUI,
  selectGpcHelperPhoneMode,
  getSelectedPhoneMode() { return selectGpcHelperPhoneMode.value; },
  getPayloadPhoneMode() {
    return (() => {
      return normalizeGpcHelperPhoneModeValue(selectGpcHelperPhoneMode.value);
    })();
  },
  applyDataUpdated(payload) {
    syncLatestState(payload);
    if (payload.gopayHelperPhoneMode !== undefined) {
      selectGpcHelperPhoneMode.value = normalizeGpcHelperPhoneModeValue(payload.gopayHelperPhoneMode);
    }
    updatePlusModeUI();
  },
  rows: { rowGpcHelperPhoneMode, rowGpcHelperPhone, rowGpcHelperOtpChannel, rowGpcHelperPin },
};
`)();

  api.updatePlusModeUI();
  assert.equal(api.getSelectedPhoneMode(), 'auto');
  assert.equal(api.getPayloadPhoneMode(), 'auto');
  assert.equal(api.rows.rowGpcHelperPhoneMode.style.display, '');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, 'none');

  api.applyDataUpdated({
    autoRunning: false,
    autoRunPhase: 'stopped',
    gopayHelperAutoModeEnabled: false,
  });

  assert.equal(api.getSelectedPhoneMode(), 'auto');
  assert.equal(api.getPayloadPhoneMode(), 'auto');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, 'none');
});

test('sidepanel keeps selected GPC auto mode before permission has been queried', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('normalizeGpcHelperPhoneModeValue'),
    extractFunction('getGpcHelperAutoModeEnabled'),
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('shouldPreserveSelectedGpcAutoMode'),
    extractFunction('hasGpcAutoModePermissionField'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcOtpChannelValue'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gpc-helper', gopayHelperPhoneMode: 'auto', gopayHelperAutoModeEnabled: false, gopayHelperBalancePayload: null };
let currentPlusPaymentMethod = 'gpc-helper';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gpc-helper', style: { display: 'none' } };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const plusPaymentMethodCaption = { textContent: '' };
const rowPayPalAccount = { style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: 'none' } };
const rowGpcHelperApi = { style: { display: 'none' } };
const rowGpcHelperCardKey = { style: { display: 'none' } };
const rowGpcHelperPhoneMode = { style: { display: 'none' } };
const selectGpcHelperPhoneMode = { value: 'auto' };
const rowGpcHelperCountryCode = { style: { display: 'none' } };
const rowGpcHelperPhone = { style: { display: 'none' } };
const rowGpcHelperOtpChannel = { style: { display: 'none' } };
const selectGpcHelperOtpChannel = { value: 'whatsapp' };
const rowGpcHelperLocalSmsEnabled = { style: { display: 'none' } };
const inputGpcHelperLocalSmsEnabled = { checked: false };
const rowGpcHelperLocalSmsUrl = { style: { display: 'none' } };
const rowGpcHelperPin = { style: { display: 'none' } };
${bundle}
return { updatePlusModeUI, selectGpcHelperPhoneMode, plusPaymentMethodCaption, rows: { rowGpcHelperPhoneMode, rowGpcHelperPhone, rowGpcHelperOtpChannel, rowGpcHelperPin } };
`)();

  api.updatePlusModeUI();

  assert.equal(api.rows.rowGpcHelperPhoneMode.style.display, '');
  assert.equal(api.selectGpcHelperPhoneMode.value, 'auto');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperOtpChannel.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperPin.style.display, 'none');
  assert.match(api.plusPaymentMethodCaption.textContent, /自动/);
});

test('sidepanel start check keeps GPC auto mode when balance payload omits permission field', async () => {
  const bundle = [
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcRemainingUsesValue'),
    extractFunction('ensureGpcApiKeyReadyForStart'),
  ].join('\n');

  const api = new Function(`
let latestState = { gopayHelperPhoneMode: 'auto' };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const selectGpcHelperPhoneMode = { value: 'auto' };
const dialogs = [];
let saveCalls = 0;
let updateCalls = 0;
${bundle}
function isGpcHelperCheckoutSelected() { return true; }
function getSelectedGpcHelperPhoneMode() { return selectGpcHelperPhoneMode.value; }
async function refreshGpcBalanceForStart() {
  return {
    gopayHelperRemainingUses: 998,
    gopayHelperApiKeyStatus: 'active',
    gopayHelperAutoModeEnabled: false,
    gopayHelperBalancePayload: {
      status: 'active',
      remaining_uses: 998,
    },
  };
}
async function showGpcStartBlockedDialog(message) {
  dialogs.push(message);
}
function syncLatestState(nextState) {
  latestState = { ...latestState, ...nextState };
}
function updatePlusModeUI() {
  updateCalls += 1;
}
async function saveSettings() {
  saveCalls += 1;
}
function showToast() {}
return {
  ensureGpcApiKeyReadyForStart,
  selectGpcHelperPhoneMode,
  getDialogs: () => dialogs.slice(),
  getSaveCalls: () => saveCalls,
  getUpdateCalls: () => updateCalls,
  getPersistedPhoneMode: () => latestState.gopayHelperPhoneMode,
};
`)();

  const allowed = await api.ensureGpcApiKeyReadyForStart();

  assert.equal(allowed, true);
  assert.equal(api.selectGpcHelperPhoneMode.value, 'auto');
  assert.equal(api.getPersistedPhoneMode(), 'auto');
  assert.equal(api.getSaveCalls(), 0);
  assert.equal(api.getUpdateCalls(), 0);
  assert.deepEqual(api.getDialogs(), []);
});

test('sidepanel start check blocks unsupported GPC auto mode without rewriting selection', async () => {
  const bundle = [
    extractFunction('normalizeGpcAutoModePermissionValue'),
    extractFunction('getGpcAutoModePermissionFromPayload'),
    extractFunction('isGpcAutoModePermissionDenied'),
    extractFunction('normalizeGpcRemainingUsesValue'),
    extractFunction('ensureGpcApiKeyReadyForStart'),
  ].join('\n');

  const api = new Function(`
let latestState = { gopayHelperPhoneMode: 'auto' };
const GPC_HELPER_PHONE_MODE_AUTO = 'auto';
const GPC_HELPER_PHONE_MODE_MANUAL = 'manual';
const selectGpcHelperPhoneMode = { value: 'auto' };
const dialogs = [];
let saveCalls = 0;
let updateCalls = 0;
${bundle}
function isGpcHelperCheckoutSelected() { return true; }
function getSelectedGpcHelperPhoneMode() { return selectGpcHelperPhoneMode.value; }
async function refreshGpcBalanceForStart() {
  return {
    gopayHelperRemainingUses: 998,
    gopayHelperApiKeyStatus: 'active',
    gopayHelperAutoModeEnabled: false,
    gopayHelperBalancePayload: {
      status: 'active',
      remaining_uses: 998,
      auto_mode_enabled: false,
    },
  };
}
async function showGpcStartBlockedDialog(message) {
  dialogs.push(message);
}
function syncLatestState(nextState) {
  latestState = { ...latestState, ...nextState };
}
function updatePlusModeUI() {
  updateCalls += 1;
}
async function saveSettings() {
  saveCalls += 1;
}
function showToast() {}
return {
  ensureGpcApiKeyReadyForStart,
  selectGpcHelperPhoneMode,
  getDialogs: () => dialogs.slice(),
  getSaveCalls: () => saveCalls,
  getUpdateCalls: () => updateCalls,
  getPersistedPhoneMode: () => latestState.gopayHelperPhoneMode,
};
`)();

  const allowed = await api.ensureGpcApiKeyReadyForStart();

  assert.equal(allowed, false);
  assert.equal(api.selectGpcHelperPhoneMode.value, 'auto');
  assert.equal(api.getPersistedPhoneMode(), 'auto');
  assert.equal(api.getSaveCalls(), 0);
  assert.equal(api.getUpdateCalls(), 0);
  assert.equal(api.getDialogs().length, 1);
});

test('sidepanel resolves pending GoPay manual confirmation from DATA_UPDATED state', async () => {
  const bundle = [
    extractFunction('openPlusManualConfirmationDialog'),
    extractFunction('syncPlusManualConfirmationDialog'),
  ].join('\n');

  const api = new Function(`
const events = [];
let latestState = {
  plusManualConfirmationPending: true,
  plusManualConfirmationRequestId: 'gopay-request-1',
  plusManualConfirmationStep: 7,
  plusManualConfirmationMethod: 'gopay',
  plusManualConfirmationTitle: 'GoPay 订阅确认',
  plusManualConfirmationMessage: '请确认订阅。',
};
let activePlusManualConfirmationRequestId = '';
let plusManualConfirmationDialogInFlight = false;
function openActionModal(options) {
  events.push({ type: 'modal', options });
  return Promise.resolve('confirm');
}
function showToast(message, tone) {
  events.push({ type: 'toast', message, tone });
}
const chrome = {
  runtime: {
    async sendMessage(message) {
      events.push({ type: 'send', message });
      latestState = {
        ...latestState,
        plusManualConfirmationPending: false,
      };
      return { ok: true };
    },
  },
};
${bundle}
return { events, syncPlusManualConfirmationDialog };
`)();

  await api.syncPlusManualConfirmationDialog();

  assert.equal(api.events[0].type, 'modal');
  assert.equal(api.events[0].options.title, 'GoPay 订阅确认');
  assert.deepEqual(api.events[1], {
    type: 'send',
    message: {
      type: 'RESOLVE_PLUS_MANUAL_CONFIRMATION',
      source: 'sidepanel',
      payload: {
        step: 7,
        requestId: 'gopay-request-1',
        confirmed: true,
      },
    },
  });
  assert.match(api.events[2].message, /GoPay/);
  assert.equal(api.events[2].tone, 'info');
});

test('sidepanel resolves pending GPC OTP with typed code', async () => {
  const bundle = [
    extractLastFunction('openPlusManualConfirmationDialog'),
    extractLastFunction('syncPlusManualConfirmationDialog'),
  ].join('\n');

  const api = new Function(`
const events = [];
let latestState = {
  plusManualConfirmationPending: true,
  plusManualConfirmationRequestId: 'otp-request-1',
  plusManualConfirmationStep: 7,
  plusManualConfirmationMethod: 'gopay-otp',
  plusManualConfirmationTitle: 'GPC OTP 验证',
  plusManualConfirmationMessage: '',
};
let activePlusManualConfirmationRequestId = '';
let plusManualConfirmationDialogInFlight = false;
const sharedFormDialog = {
  async open(options) {
    events.push({ type: 'form', options });
    return { otp: ' 12-34 56 ' };
  },
};
function openActionModal(options) {
  events.push({ type: 'modal', options });
  return Promise.resolve('confirm');
}
function showToast(message, tone) {
  events.push({ type: 'toast', message, tone });
}
const chrome = {
  runtime: {
    async sendMessage(message) {
      events.push({ type: 'send', message });
      latestState = { ...latestState, plusManualConfirmationPending: false };
      return { ok: true };
    },
  },
};
${bundle}
return { events, syncPlusManualConfirmationDialog };
`)();

  await api.syncPlusManualConfirmationDialog();

  assert.equal(api.events[0].type, 'form');
  assert.equal(api.events[0].options.message, '请在WhatsApp里面获取验证码（耐心等待三十秒左右）');
  assert.equal(api.events[0].options.confirmLabel, '提交 OTP');
  const sendEvent = api.events.find((event) => event.type === 'send');
  assert.deepEqual(sendEvent.message.payload, {
    step: 7,
    requestId: 'otp-request-1',
    confirmed: true,
    otp: '123456',
  });
  assert.equal(api.events.some((event) => event.type === 'modal'), false);
});
