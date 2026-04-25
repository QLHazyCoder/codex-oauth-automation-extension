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

function createClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) {
          values.delete(name);
          return false;
        }
        values.add(name);
        return true;
      }
      if (force) {
        values.add(name);
        return true;
      }
      values.delete(name);
      return false;
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createElement(initial = {}) {
  return {
    disabled: Boolean(initial.disabled),
    hidden: Boolean(initial.hidden),
    value: initial.value || '',
    title: '',
    textContent: initial.textContent || '',
    listeners: {},
    attributes: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

test('sidepanel html contains contribution mode runtime UI and loads the module before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const moduleIndex = html.indexOf('<script src="contribution-mode.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.match(html, /id="btn-contribution-mode"/);
  assert.match(html, /id="contribution-mode-panel"/);
  assert.match(html, /id="contribution-oauth-status"/);
  assert.match(html, /id="contribution-callback-status"/);
  assert.match(html, /id="contribution-mode-summary"/);
  assert.match(html, /id="btn-start-contribution"/);
  assert.match(html, /id="btn-open-contribution-upload"/);
  assert.match(html, /id="btn-exit-contribution-mode"/);
  assert.match(html, /id="input-contribution-nickname"/);
  assert.match(html, /id="input-contribution-qq"/);
  assert.notEqual(moduleIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(moduleIndex < sidepanelIndex);
});

test('collectSettingsPayload omits custom password and local sync settings in contribution mode', () => {
  const bundle = extractFunction('collectSettingsPayload');

  const api = new Function(`
let latestState = { contributionMode: true };
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: 'example.com' };
const selectTempEmailDomain = { value: 'mail.example.com' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: 'https://panel.example.com' };
const inputVpsPassword = { value: 'panel-secret' };
const inputSub2ApiUrl = { value: 'https://sub.example.com' };
const inputSub2ApiEmail = { value: 'user@example.com' };
const inputSub2ApiPassword = { value: 'sub-secret' };
const inputSub2ApiGroup = { value: ' codex ' };
const inputSub2ApiDefaultProxy = { value: ' proxy-a ' };
const inputCodex2ApiUrl = { value: 'http://localhost:8080/admin/accounts' };
const inputCodex2ApiAdminKey = { value: 'codex-admin-secret' };
const inputPassword = { value: 'Secret123!' };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: true };
const selectIcloudHostPreference = { value: 'auto' };
const inputAccountRunHistoryTextEnabled = { checked: true };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const inputInbucketHost = { value: 'inbucket.local' };
const inputInbucketMailbox = { value: 'demo' };
const inputHotmailRemoteBaseUrl = { value: 'https://hotmail.example.com' };
const inputHotmailLocalBaseUrl = { value: 'http://127.0.0.1:17373' };
const inputLuckmailApiKey = { value: 'lk-api-key' };
const inputLuckmailBaseUrl = { value: 'https://mails.example.com' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: 'luckmail.example.com' };
const inputTempEmailBaseUrl = { value: 'https://temp.example.com' };
const inputTempEmailAdminAuth = { value: 'admin-secret' };
const inputTempEmailCustomAuth = { value: 'custom-secret' };
const inputTempEmailReceiveMailbox = { value: 'relay@example.com' };
const inputTempEmailUseRandomSubdomain = { checked: true };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '5' };
const inputAutoDelayEnabled = { checked: true };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '10' };
const inputVerificationResendCount = { value: '6' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;

function getCloudflareDomainsFromState() { return { domains: ['example.com'], activeDomain: 'example.com' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: ['mail.example.com'], activeDomain: 'mail.example.com' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedMail2925Mode() { return 'provide'; }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function getSelectedHotmailServiceMode() { return 'local'; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
${bundle}
return {
  collectSettingsPayload,
  setLatestState(nextState) { latestState = nextState; },
};
`)();

  const contributionPayload = api.collectSettingsPayload();
  assert.equal('customPassword' in contributionPayload, false);
  assert.equal('accountRunHistoryTextEnabled' in contributionPayload, false);
  assert.equal('accountRunHistoryHelperBaseUrl' in contributionPayload, false);
  assert.equal(contributionPayload.cloudflareTempEmailUseRandomSubdomain, true);

  api.setLatestState({ contributionMode: false });
  const normalPayload = api.collectSettingsPayload();
  assert.equal(normalPayload.customPassword, 'Secret123!');
  assert.equal(normalPayload.accountRunHistoryTextEnabled, true);
  assert.equal(normalPayload.accountRunHistoryHelperBaseUrl, 'http://127.0.0.1:17373');
  assert.equal(normalPayload.codex2apiUrl, 'http://localhost:8080/admin/accounts');
  assert.equal(normalPayload.codex2apiAdminKey, 'codex-admin-secret');
  assert.equal(normalPayload.cloudflareTempEmailUseRandomSubdomain, true);
});

test('contribution mode manager enters mode, starts main auto flow, polls contribution status, and exits cleanly', async () => {
  const source = fs.readFileSync('sidepanel/contribution-mode.js', 'utf8');
  const windowObject = {};
  const timers = [];

  const api = new Function('window', 'setTimeout', 'clearTimeout', `${source}; return window.SidepanelContributionMode;`)(
    windowObject,
    (handler) => {
      timers.push(handler);
      return timers.length;
    },
    (id) => {
      if (timers[id - 1]) {
        timers[id - 1] = null;
      }
    }
  );

  assert.equal(typeof api?.createContributionModeManager, 'function');

  let latestState = {
    contributionMode: false,
    panelMode: 'sub2api',
    contributionSessionId: '',
    contributionStatus: '',
    contributionStatusMessage: '',
    contributionCallbackStatus: 'idle',
    contributionCallbackMessage: '',
    email: 'user@example.com',
  };
  let blocked = false;
  let appliedState = null;
  let statusState = null;
  let closeConfigMenuCount = 0;
  let closeAccountRecordsCount = 0;
  let contributionAutoRunStartCount = 0;
  let updatePanelModeCount = 0;
  let updateSyncUiCount = 0;
  let updateConfigMenuCount = 0;
  const toasts = [];
  const openedUrls = [];
  const sentMessages = [];

  const dom = {
    btnConfigMenu: createElement(),
    btnContributionMode: createElement(),
    btnExitContributionMode: createElement(),
    btnOpenAccountRecords: createElement(),
    btnOpenContributionUpload: createElement(),
    btnStartContribution: createElement(),
    inputContributionNickname: createElement({ value: '贡献者昵称' }),
    inputContributionQq: createElement({ value: '123456' }),
    contributionCallbackStatus: createElement(),
    contributionModePanel: createElement({ hidden: true }),
    contributionModeSummary: createElement(),
    contributionModeText: createElement(),
    contributionOauthStatus: createElement(),
    rowAccountRunHistoryHelperBaseUrl: createElement(),
    rowAccountRunHistoryTextEnabled: createElement(),
    rowCustomPassword: createElement(),
    rowLocalCpaStep9Mode: createElement(),
    rowSub2ApiDefaultProxy: createElement(),
    rowSub2ApiEmail: createElement(),
    rowSub2ApiGroup: createElement(),
    rowSub2ApiPassword: createElement(),
    rowSub2ApiUrl: createElement(),
    rowCodex2ApiUrl: createElement(),
    rowCodex2ApiAdminKey: createElement(),
    rowVpsPassword: createElement(),
    rowVpsUrl: createElement(),
    selectPanelMode: createElement({ value: 'sub2api' }),
  };

  const manager = api.createContributionModeManager({
    state: {
      getLatestState: () => latestState,
    },
    dom,
    helpers: {
      applySettingsState(nextState) {
        latestState = nextState;
        appliedState = nextState;
      },
      closeAccountRecordsPanel() {
        closeAccountRecordsCount += 1;
      },
      closeConfigMenu() {
        closeConfigMenuCount += 1;
      },
      getContributionNickname() {
        return latestState.email;
      },
      getContributionProfile() {
        return {
          nickname: dom.inputContributionNickname.value,
          qq: dom.inputContributionQq.value,
        };
      },
      isModeSwitchBlocked() {
        return blocked;
      },
      openConfirmModal: async () => {
        throw new Error('should not ask for confirmation before entering contribution mode');
      },
      openExternalUrl(url) {
        openedUrls.push(url);
      },
      showToast(message, type) {
        toasts.push({ message, type });
      },
      async startContributionAutoRun() {
        contributionAutoRunStartCount += 1;
        latestState = {
          ...latestState,
          contributionSessionId: 'session-002',
          contributionAuthUrl: 'https://auth.example.com/oauth?state=oauth-state-002',
          contributionAuthState: 'oauth-state-002',
          contributionStatus: 'started',
          contributionStatusMessage: '\u5df2\u751f\u6210\u767b\u5f55\u5730\u5740',
          contributionCallbackStatus: 'waiting',
          contributionCallbackMessage: '\u7b49\u5f85\u56de\u8c03',
        };
        return true;
      },
      updateAccountRunHistorySettingsUI() {
        updateSyncUiCount += 1;
      },
      updateConfigMenuControls() {
        updateConfigMenuCount += 1;
      },
      updatePanelModeUI() {
        updatePanelModeCount += 1;
      },
      updateStatusDisplay(nextState) {
        statusState = nextState;
      },
    },
    runtime: {
      sendMessage: async (message) => {
        sentMessages.push(message);
        if (message.type === 'SET_CONTRIBUTION_MODE') {
          return {
            state: message.payload.enabled
              ? {
                contributionMode: true,
                panelMode: 'cpa',
                contributionNickname: '',
                contributionQq: '',
                contributionSessionId: '',
                contributionAuthUrl: '',
                contributionAuthState: '',
                contributionStatus: '',
                contributionStatusMessage: '',
                contributionCallbackStatus: 'idle',
                contributionCallbackMessage: '',
                email: latestState.email,
              }
              : {
                contributionMode: false,
                panelMode: 'cpa',
                contributionNickname: '',
                contributionQq: '',
                contributionSessionId: '',
                contributionAuthUrl: '',
                contributionAuthState: '',
                contributionCallbackUrl: '',
                contributionStatus: '',
                contributionStatusMessage: '',
                contributionCallbackStatus: 'idle',
                contributionCallbackMessage: '',
                email: latestState.email,
              },
          };
        }
        if (message.type === 'POLL_CONTRIBUTION_STATUS') {
          return {
            state: {
              ...latestState,
              contributionStatus: 'processing',
              contributionStatusMessage: '已提交回调，等待 CPA 确认',
              contributionCallbackStatus: 'submitted',
              contributionCallbackMessage: '已提交回调',
            },
          };
        }
        if (message.type === 'SET_CONTRIBUTION_PROFILE') {
          latestState = {
            ...latestState,
            contributionNickname: message.payload.nickname,
            contributionQq: message.payload.qq,
          };
          return { state: latestState };
        }
        return {};
      },
    },
    constants: {
      contributionPortalUrl: 'https://apikey.qzz.io',
      contributionUploadUrl: 'https://apikey.qzz.io/upload',
      pollIntervalMs: 2500,
    },
  });

  manager.render();
  assert.equal(dom.contributionModePanel.hidden, true);
  assert.equal(dom.btnContributionMode.disabled, false);

  manager.bindEvents();
  await dom.btnContributionMode.listeners.click();

  assert.equal(dom.contributionModePanel.hidden, false);
  assert.equal(dom.selectPanelMode.value, 'cpa');
  assert.equal(dom.selectPanelMode.disabled, true);
  assert.equal(dom.btnOpenAccountRecords.disabled, true);
  assert.equal(dom.contributionOauthStatus.textContent, '\u672a\u751f\u6210\u767b\u5f55\u5730\u5740');
  assert.equal(dom.contributionCallbackStatus.textContent, '\u7b49\u5f85\u56de\u8c03');
  assert.equal(dom.contributionModeSummary.textContent.length > 0, true);
  assert.equal(dom.btnContributionMode.classList.contains('is-active'), true);
  assert.equal(dom.rowVpsUrl.classList.contains('is-contribution-hidden'), true);
  assert.equal(dom.rowCodex2ApiUrl.classList.contains('is-contribution-hidden'), true);
  assert.equal(dom.rowCodex2ApiAdminKey.classList.contains('is-contribution-hidden'), true);
  assert.ok(closeConfigMenuCount >= 1);
  assert.ok(closeAccountRecordsCount >= 1);
  assert.ok(updatePanelModeCount >= 1);
  assert.ok(updateSyncUiCount >= 1);
  assert.ok(updateConfigMenuCount >= 1);
  assert.equal(timers.length, 0);
  assert.deepStrictEqual(openedUrls, ['https://apikey.qzz.io']);

  dom.inputContributionNickname.value = '贡献者昵称';
  dom.inputContributionQq.value = '123456';

  await dom.btnStartContribution.listeners.click();
  assert.equal(contributionAutoRunStartCount, 1);
  assert.equal(appliedState.contributionSessionId, '');
  assert.equal(latestState.contributionSessionId, 'session-002');
  assert.equal(latestState.contributionStatus, 'started');
  const contributionProfileMessage = sentMessages.find((message) => message.type === 'SET_CONTRIBUTION_PROFILE');
  assert.deepStrictEqual(contributionProfileMessage?.payload, { nickname: '贡献者昵称', qq: '123456' });
  assert.equal(timers.length > 0, true);

  await manager.pollOnce({ reason: 'test_poll' });
  assert.equal(statusState.contributionStatus, 'processing');
  assert.equal(dom.contributionOauthStatus.textContent, '\u5df2\u63d0\u4ea4\u56de\u8c03');
  assert.equal(dom.contributionCallbackStatus.textContent, '\u5df2\u63d0\u4ea4\u56de\u8c03');
  assert.equal(dom.contributionModeSummary.textContent, '\u5df2\u63d0\u4ea4\u56de\u8c03\uff0c\u7b49\u5f85 CPA \u786e\u8ba4');

  dom.btnOpenContributionUpload.listeners.click();
  assert.deepStrictEqual(openedUrls, ['https://apikey.qzz.io', 'https://apikey.qzz.io/upload']);

  await dom.btnExitContributionMode.listeners.click();
  manager.render();
  assert.equal(dom.contributionModePanel.hidden, true);
  assert.equal(dom.btnContributionMode.classList.contains('is-active'), false);
  assert.equal(dom.selectPanelMode.disabled, false);
  assert.equal(dom.rowVpsUrl.classList.contains('is-contribution-hidden'), false);
  assert.deepStrictEqual(
    sentMessages.map((message) => message.type),
    ['SET_CONTRIBUTION_MODE', 'SET_CONTRIBUTION_PROFILE', 'POLL_CONTRIBUTION_STATUS', 'SET_CONTRIBUTION_MODE']
  );
  assert.deepStrictEqual(
    toasts.map((item) => item.message),
    ['\u5df2\u8fdb\u5165\u8d21\u732e\u6a21\u5f0f\u3002', '\u8d21\u732e\u81ea\u52a8\u6d41\u7a0b\u5df2\u542f\u52a8\u3002', '\u5df2\u9000\u51fa\u8d21\u732e\u6a21\u5f0f\u3002']
  );

  blocked = true;
  latestState = {
    contributionMode: true,
    panelMode: 'cpa',
    contributionNickname: '贡献者昵称',
    contributionQq: '123456',
    contributionSessionId: 'session-002',
    contributionAuthUrl: 'https://auth.example.com/oauth?state=oauth-state-002',
    contributionStatus: 'waiting',
    contributionStatusMessage: '\u7b49\u5f85\u6388\u6743\u5b8c\u6210',
    contributionCallbackStatus: 'waiting',
    contributionCallbackMessage: '\u7b49\u5f85\u56de\u8c03',
  };
  manager.render();
  assert.equal(dom.btnExitContributionMode.disabled, true);
  manager.stopPolling();
});
