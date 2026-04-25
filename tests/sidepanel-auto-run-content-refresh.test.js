const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

function createApi({ refreshImpl, confirmImpl, dismissImpl } = {}) {
  const bundle = extractFunction('startAutoRunFromCurrentSettings');

  return new Function(`
const events = [];
const latestState = { contributionMode: false };
const inputAutoSkipFailures = { checked: false };
const inputContributionNickname = { value: 'tester' };
const inputContributionQq = { value: '123456' };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '5' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const btnAutoRun = { disabled: false, innerHTML: '' };
const inputRunCount = { disabled: false };
const chrome = {
  runtime: {
    async sendMessage(message) {
      events.push({ type: 'send', message });
      return { ok: true };
    },
  },
};
const console = {
  warn(...args) {
    events.push({ type: 'warn', args });
  },
};
function getRunCountValue() { return 3; }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function shouldOfferAutoModeChoice() { return false; }
async function openAutoStartChoiceDialog() { throw new Error('should not be called'); }
function getFirstUnfinishedStep() { return 1; }
function getRunningSteps() { return []; }
function shouldWarnAutoRunFallbackRisk() { return false; }
function isAutoRunFallbackRiskPromptDismissed() { return false; }
async function openAutoRunFallbackRiskConfirmModal() { throw new Error('should not be called'); }
function setAutoRunFallbackRiskPromptDismissed() {}
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
async function refreshContributionContentHint() {
  events.push({ type: 'refresh' });
  ${refreshImpl ? 'return (' + refreshImpl + ')();' : 'return null;'}
}
async function maybeConfirmContributionUpdateBeforeAutoRun(snapshot) {
  events.push({ type: 'confirm-check', snapshot });
  ${confirmImpl ? 'return (' + confirmImpl + ')(snapshot);' : 'return true;'}
}
function dismissContributionUpdateHint() {
  events.push({ type: 'dismiss-hint' });
  ${dismissImpl ? '(' + dismissImpl + ')();' : ''}
}
${bundle}
return {
  startAutoRunFromCurrentSettings,
  getEvents() {
    return events;
  },
};
`)();
}

test('startAutoRunFromCurrentSettings refreshes contribution content hint before starting auto run', async () => {
  const api = createApi();

  const result = await api.startAutoRunFromCurrentSettings();

  assert.equal(result, true);
  assert.deepEqual(
    api.getEvents().map((entry) => entry.type),
    ['refresh', 'confirm-check', 'send']
  );
  assert.equal(api.getEvents()[2].message.type, 'AUTO_RUN');
});

test('startAutoRunFromCurrentSettings continues auto run when contribution content refresh fails', async () => {
  const api = createApi({
    refreshImpl: 'async () => { throw new Error("refresh failed"); }',
  });

  const result = await api.startAutoRunFromCurrentSettings();
  const events = api.getEvents();

  assert.equal(result, true);
  assert.deepEqual(
    events.map((entry) => entry.type),
    ['refresh', 'warn', 'confirm-check', 'send']
  );
  assert.match(String(events[1].args[0]), /Failed to refresh contribution content hint before auto run/);
  assert.equal(events[3].message.type, 'AUTO_RUN');
});

test('startAutoRunFromCurrentSettings aborts when contribution update confirmation is declined', async () => {
  const api = createApi({
    refreshImpl: `async () => ({
      promptVersion: 'questionnaire:2026-04-23T00:00:00Z',
      items: [{ slug: 'questionnaire', isVisible: true }],
    })`,
    confirmImpl: 'async () => false',
  });

  const result = await api.startAutoRunFromCurrentSettings();

  assert.equal(result, false);
  assert.deepEqual(
    api.getEvents().map((entry) => entry.type),
    ['refresh', 'confirm-check']
  );
});
