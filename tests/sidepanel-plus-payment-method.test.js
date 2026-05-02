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

test('sidepanel step definitions keep the selected Plus payment method', () => {
  const bundle = [
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
    options: { plusModeEnabled: true, plusPaymentMethod: 'gopay' },
  });
  assert.deepEqual(api.calls[1], { type: 'render', stepIds: [7] });
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
