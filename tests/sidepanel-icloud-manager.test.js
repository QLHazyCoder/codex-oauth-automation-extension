const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel loads icloud manager before sidepanel bootstrap', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const icloudManagerIndex = html.indexOf('<script src="icloud-manager.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.notEqual(icloudManagerIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(icloudManagerIndex < sidepanelIndex);
});

test('sidepanel source binds the icloud fetch mode control before using it', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.match(source, /const selectIcloudFetchMode = document\.getElementById\('select-icloud-fetch-mode'\);/);
  assert.match(source, /selectIcloudFetchMode\?\.addEventListener\('change'/);
});

test('update card highlights exporting config before upgrade', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const css = fs.readFileSync('sidepanel/sidepanel.css', 'utf8');

  assert.match(html, /<p class="update-card-reminder">一定请先导出配置，再执行更新<\/p>/);
  assert.match(css, /\.update-card-reminder\s*\{/);
  assert.match(css, /font-weight:\s*700;/);
  assert.match(css, /color:\s*var\(--orange\);/);
});

test('icloud manager exposes a factory and renders empty state', () => {
  const source = fs.readFileSync('sidepanel/icloud-manager.js', 'utf8');
  const windowObject = {};

  const api = new Function('window', `${source}; return window.SidepanelIcloudManager;`)(windowObject);

  assert.equal(typeof api?.createIcloudManager, 'function');

  const manager = api.createIcloudManager({
    dom: {
      btnIcloudBulkDelete: { disabled: false },
      btnIcloudBulkPreserve: { disabled: false },
      btnIcloudBulkUnpreserve: { disabled: false },
      btnIcloudBulkUnused: { disabled: false },
      btnIcloudBulkUsed: { disabled: false },
      btnIcloudDeleteUsed: { disabled: false },
      btnIcloudLoginDone: { disabled: false },
      btnIcloudRefresh: { disabled: false },
      checkboxIcloudSelectAll: { checked: false, indeterminate: false, disabled: false },
      icloudList: { innerHTML: '' },
      icloudLoginHelp: { style: { display: 'none' } },
      icloudLoginHelpText: { textContent: '' },
      icloudLoginHelpTitle: { textContent: '' },
      icloudSection: { style: { display: '' } },
      icloudSelectionSummary: { textContent: '' },
      icloudSummary: { textContent: '' },
      inputIcloudSearch: { value: '', disabled: false },
      selectIcloudFilter: { value: 'all', disabled: false },
    },
    helpers: {
      escapeHtml: (value) => String(value || ''),
      openConfirmModal: async () => true,
      showToast() {},
    },
    runtime: {
      sendMessage: async () => ({ aliases: [] }),
    },
  });

  assert.equal(typeof manager.renderIcloudAliases, 'function');
  assert.equal(typeof manager.refreshIcloudAliases, 'function');
  assert.equal(typeof manager.queueIcloudAliasRefresh, 'function');
  assert.equal(typeof manager.reset, 'function');

  manager.renderIcloudAliases([]);
  assert.equal(manager.hasDeletableUsedAliases(), false);
});
