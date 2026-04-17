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

function createButton() {
  return {
    disabled: false,
    textContent: '',
    hidden: false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createContainer() {
  return {
    innerHTML: '',
    textContent: '',
    hidden: true,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

test('sidepanel html contains account records overlay and manager script', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const managerIndex = html.indexOf('<script src="account-records-manager.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.match(html, /id="btn-open-account-records"/);
  assert.match(html, /id="account-records-overlay"/);
  assert.match(html, /id="account-records-list"/);
  assert.match(html, /id="account-records-stats"/);
  assert.match(html, /id="btn-clear-account-records"/);
  assert.match(html, /id="input-sub2api-default-proxy"/);
  assert.notEqual(managerIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(managerIndex < sidepanelIndex);
});

test('sidepanel account records helper normalizes snapshot helper base url', () => {
  const bundle = [
    extractFunction('normalizeAccountRunHistoryHelperBaseUrlValue'),
  ].join('\n');

  const api = new Function(`
const DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL = 'http://127.0.0.1:17373';
${bundle}
return { normalizeAccountRunHistoryHelperBaseUrlValue };
`)();

  assert.equal(
    api.normalizeAccountRunHistoryHelperBaseUrlValue('http://127.0.0.1:17373/sync-account-run-records'),
    'http://127.0.0.1:17373'
  );
});

test('account records manager exposes a factory and renders summarized paginated records', () => {
  const source = fs.readFileSync('sidepanel/account-records-manager.js', 'utf8');
  const windowObject = {};

  const api = new Function('window', `${source}; return window.SidepanelAccountRecordsManager;`)(windowObject);

  assert.equal(typeof api?.createAccountRecordsManager, 'function');

  const btnOpenAccountRecords = createButton();
  const btnCloseAccountRecords = createButton();
  const btnClearAccountRecords = createButton();
  const btnAccountRecordsPrev = createButton();
  const btnAccountRecordsNext = createButton();
  const overlay = createContainer();
  const list = createContainer();
  const stats = createContainer();
  const meta = createContainer();
  const pageLabel = createContainer();

  const manager = api.createAccountRecordsManager({
    state: {
      getLatestState: () => ({
        accountRunHistory: [
          {
            email: 'success@example.com',
            password: 'secret',
            finalStatus: 'success',
            finishedAt: '2026-04-17T04:31:00.000Z',
            retryCount: 0,
            failureLabel: '流程完成',
          },
          {
            email: 'failed@example.com',
            password: 'secret',
            finalStatus: 'failed',
            finishedAt: '2026-04-17T04:29:00.000Z',
            retryCount: 2,
            failureLabel: '出现手机号验证',
          },
        ],
      }),
      syncLatestState() {},
    },
    dom: {
      accountRecordsList: list,
      accountRecordsMeta: meta,
      accountRecordsOverlay: overlay,
      accountRecordsPageLabel: pageLabel,
      accountRecordsStats: stats,
      btnAccountRecordsNext,
      btnAccountRecordsPrev,
      btnClearAccountRecords,
      btnCloseAccountRecords,
      btnOpenAccountRecords,
    },
    helpers: {
      escapeHtml: (value) => String(value || ''),
      openConfirmModal: async () => true,
      showToast() {},
    },
    runtime: {
      sendMessage: async () => ({ clearedCount: 2 }),
    },
    constants: {
      displayTimeZone: 'Asia/Shanghai',
      pageSize: 10,
    },
  });

  assert.equal(typeof manager.bindEvents, 'function');
  assert.equal(typeof manager.render, 'function');
  assert.equal(typeof manager.openPanel, 'function');

  manager.bindEvents();
  manager.render();

  assert.match(meta.textContent, /共 2 条/);
  assert.match(stats.innerHTML, /重试/);
  assert.match(list.innerHTML, /success@example\.com/);
  assert.match(list.innerHTML, /出现手机号验证/);
  assert.match(list.innerHTML, /重试 2/);
  assert.equal(pageLabel.textContent, '1 / 1');
  assert.equal(btnClearAccountRecords.disabled, false);
});
