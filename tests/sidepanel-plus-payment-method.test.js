const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const asyncStart = sidepanelSource.indexOf(`async function ${name}`);
  const normalStart = sidepanelSource.indexOf(`function ${name}`);
  const start = asyncStart !== -1
    ? asyncStart
    : normalStart;
  if (start === -1) {
    throw new Error(`Function ${name} not found`);
  }
  const signatureEnd = sidepanelSource.indexOf(')', start);
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
  const asyncStart = sidepanelSource.lastIndexOf(`async function ${name}`);
  const normalStart = sidepanelSource.lastIndexOf(`function ${name}`);
  const asyncInnerFunctionStart = asyncStart >= 0 ? asyncStart + 'async '.length : -1;
  const start = asyncStart >= 0 && normalStart === asyncInnerFunctionStart
    ? asyncStart
    : (asyncStart > normalStart ? asyncStart : normalStart);
  if (start === -1) {
    throw new Error(`Function ${name} not found`);
  }
  const signatureEnd = sidepanelSource.indexOf(')', start);
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

  const api = new Function(`
const calls = [];
const window = {
  MultiPageStepDefinitions: {
    getSteps(options) {
      calls.push({ type: 'getSteps', options });
      return [{ id: options.plusPaymentMethod === 'gopay' ? 7 : 6, order: 1 }];
    },
  },
};
let currentPlusModeEnabled = false;
let currentPlusPaymentMethod = 'paypal';
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
    options: { plusModeEnabled: true, plusPaymentMethod: 'gopay', signupMethod: 'email' },
  });
  assert.deepEqual(api.calls[1], { type: 'render', stepIds: [7] });
});

test('sidepanel normalizeSignupMethod stays independent from signup constants during bootstrap', () => {
  const source = extractFunction('normalizeSignupMethod');
  assert.doesNotMatch(source, /SIGNUP_METHOD_(PHONE|EMAIL)/);
});

test('sidepanel signup method UI syncs shared step definitions with the selected signup method', () => {
  const source = extractFunction('updateSignupMethodUI');
  assert.match(source, /syncStepDefinitionsForMode\(/);
  assert.match(source, /signupMethod:\s*selectedMethod/);
});

test('sidepanel applies restored signup method when rebuilding shared step definitions on load', () => {
  const source = extractFunction('applySettingsState');
  assert.match(source, /syncStepDefinitionsForMode\(Boolean\(state\?\.plusModeEnabled\),\s*\{/);
  assert.match(source, /signupMethod:\s*state\?\.signupMethod/);
});

test('sidepanel Plus UI hides PayPal account selector while GoPay is selected', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gopay' };
let currentPlusPaymentMethod = 'paypal';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gopay', style: { display: 'none' } };
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
let currentPlusModeEnabled = false;
let currentPlusPaymentMethod = 'paypal';
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
    options: { plusModeEnabled: true, plusPaymentMethod: 'gpc-helper', signupMethod: 'email' },
  });
});

test('sidepanel Plus UI shows GPC fields and purchase button only for GPC without API input', () => {
  const bundle = [
    extractFunction('normalizePlusPaymentMethod'),
    extractFunction('getSelectedPlusPaymentMethod'),
    extractFunction('updatePlusModeUI'),
  ].join('\n');

  const api = new Function(`
let latestState = { plusPaymentMethod: 'gpc-helper' };
let currentPlusPaymentMethod = 'paypal';
const inputPlusModeEnabled = { checked: true };
const selectPlusPaymentMethod = { value: 'gpc-helper', style: { display: 'none' } };
const plusPaymentMethodCaption = { textContent: '' };
const btnGpcCardKeyPurchase = { style: { display: 'none' } };
const rowPayPalAccount = { style: { display: '' } };
const rowPlusPaymentMethod = { style: { display: 'none' } };
const rowGpcHelperApi = { style: { display: 'none' } };
const rowGpcHelperCardKey = { style: { display: 'none' } };
const rowGpcHelperCountryCode = { style: { display: 'none' } };
const rowGpcHelperPhone = { style: { display: 'none' } };
const rowGpcHelperPin = { style: { display: 'none' } };
const rowGoPayCountryCode = { style: { display: 'none' } };
const rowGoPayPhone = { style: { display: 'none' } };
const rowGoPayOtp = { style: { display: 'none' } };
const rowGoPayPin = { style: { display: 'none' } };
${bundle}
return {
  updatePlusModeUI,
  selectPlusPaymentMethod,
  btnGpcCardKeyPurchase,
  rowPayPalAccount,
  plusPaymentMethodCaption,
  rows: { rowGpcHelperApi, rowGpcHelperCardKey, rowGpcHelperCountryCode, rowGpcHelperPhone, rowGpcHelperPin },
};
`)();

  api.updatePlusModeUI();

  assert.equal(api.rowPayPalAccount.style.display, 'none');
  assert.equal(api.btnGpcCardKeyPurchase.style.display, '');
  assert.equal(api.rows.rowGpcHelperApi.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperCardKey.style.display, '');
  assert.equal(api.rows.rowGpcHelperPhone.style.display, '');
  assert.match(api.plusPaymentMethodCaption.textContent, /GPC/);

  api.selectPlusPaymentMethod.value = 'gopay';
  api.updatePlusModeUI();
  assert.equal(api.btnGpcCardKeyPurchase.style.display, 'none');
  assert.equal(api.rows.rowGpcHelperApi.style.display, 'none');
  assert.equal(api.rowPayPalAccount.style.display, 'none');
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
