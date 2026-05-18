const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('sidepanel/contribution-mode.js', 'utf8');

function createElement() {
  return {
    hidden: false,
    disabled: false,
    title: '',
    textContent: '',
    value: '',
    classList: {
      hiddenState: false,
      toggle(_className, hidden) {
        this.hiddenState = Boolean(hidden);
      },
    },
    setAttribute() {},
    addEventListener() {},
  };
}

test('contribution mode manager does not project openai-only ui state into kiro flow', () => {
  const context = {
    window: {},
    document: { activeElement: null },
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context);

  const createContributionModeManager = context.window.SidepanelContributionMode.createContributionModeManager;
  const rowVpsUrl = createElement();
  const dom = {
    btnContributionMode: createElement(),
    contributionModePanel: createElement(),
    contributionModeText: createElement(),
    contributionModeBadge: createElement(),
    contributionOauthStatus: createElement(),
    contributionCallbackStatus: createElement(),
    contributionModeSummary: createElement(),
    inputContributionNickname: createElement(),
    inputContributionQq: createElement(),
    btnStartContribution: createElement(),
    btnOpenContributionUpload: createElement(),
    btnExitContributionMode: createElement(),
    btnOpenAccountRecords: createElement(),
    selectPanelMode: createElement(),
    rowVpsUrl,
  };
  const manager = createContributionModeManager({
    state: {
      getLatestState: () => ({
        activeFlowId: 'kiro',
        flowId: 'kiro',
        contributionMode: true,
        contributionSource: 'cpa',
      }),
    },
    dom,
    helpers: {
      updatePanelModeUI() {},
      updateAccountRunHistorySettingsUI() {},
      updateConfigMenuControls() {},
      closeConfigMenu() {},
      closeAccountRecordsPanel() {},
      isModeSwitchBlocked() {
        return false;
      },
    },
    runtime: {
      sendMessage: async () => ({}),
    },
    constants: {},
  });

  manager.render();

  assert.equal(dom.contributionModePanel.hidden, true);
  assert.equal(dom.selectPanelMode.disabled, false);
  assert.equal(dom.btnContributionMode.disabled, true);
  assert.equal(dom.btnContributionMode.title, '当前 flow 不支持贡献模式');
  assert.equal(dom.btnStartContribution.disabled, true);
  assert.equal(dom.btnOpenContributionUpload.disabled, true);
  assert.equal(rowVpsUrl.classList.hiddenState, false);
});
