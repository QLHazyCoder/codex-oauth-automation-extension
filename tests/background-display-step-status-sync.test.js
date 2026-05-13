const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const backgroundSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const asyncStart = backgroundSource.indexOf(`async function ${name}(`);
  const normalStart = backgroundSource.indexOf(`function ${name}(`);
  const start = asyncStart !== -1
    ? asyncStart
    : normalStart;
  if (start === -1) {
    throw new Error(`Function ${name} not found`);
  }
  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = start; index < backgroundSource.length; index += 1) {
    const char = backgroundSource[index];
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
  const bodyStart = backgroundSource.indexOf('{', signatureEnd);
  let depth = 0;
  let end = bodyStart;
  for (; end < backgroundSource.length; end += 1) {
    const char = backgroundSource[end];
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
  return backgroundSource.slice(start, end);
}

test('background display-step status broadcast carries canonical nodeStatuses for sidepanel sync', async () => {
  const bundle = [
    extractFunction('getDisplayStepStatuses'),
    extractFunction('getDisplayStepStatus'),
    extractFunction('setDisplayStepStatus'),
  ].join('\n');

  const api = new Function(`
const DISPLAY_PHONE_VERIFICATION_STEP_KEY = 'phone-verification';
const DISPLAY_STEP_STATUS_VALUES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'stopped',
  'manual_completed',
  'skipped',
]);
let state = {
  displayStepStatuses: {},
  nodeStatuses: { 'phone-verification': 'pending' },
  currentNodeId: '',
};
const broadcasts = [];
async function getState() {
  return state;
}
async function setState(updates) {
  const nextDisplayStepStatuses = updates?.displayStepStatuses && typeof updates.displayStepStatuses === 'object'
    ? updates.displayStepStatuses
    : {};
  const nextNodeStatus = Object.prototype.hasOwnProperty.call(nextDisplayStepStatuses, 'phone-verification')
    ? String(nextDisplayStepStatuses['phone-verification'] || '').trim().toLowerCase()
    : 'pending';
  state = {
    ...state,
    ...updates,
    displayStepStatuses: nextDisplayStepStatuses,
    nodeStatuses: {
      ...(state.nodeStatuses || {}),
      'phone-verification': nextNodeStatus || 'pending',
    },
    currentNodeId: nextNodeStatus === 'running' ? 'phone-verification' : '',
  };
}
function broadcastDataUpdate(payload) {
  broadcasts.push(payload);
}
${bundle}
return {
  setDisplayStepStatus,
  getStateSnapshot: () => state,
  getBroadcasts: () => broadcasts.slice(),
};
`)();

  const nextStatuses = await api.setDisplayStepStatus('phone-verification', 'skipped');

  assert.deepEqual(nextStatuses, { 'phone-verification': 'skipped' });
  assert.deepEqual(api.getStateSnapshot(), {
    displayStepStatuses: { 'phone-verification': 'skipped' },
    nodeStatuses: { 'phone-verification': 'skipped' },
    currentNodeId: '',
  });
  assert.deepEqual(api.getBroadcasts(), [{
    displayStepStatuses: { 'phone-verification': 'skipped' },
    nodeStatuses: { 'phone-verification': 'skipped' },
    currentNodeId: '',
  }]);
});
