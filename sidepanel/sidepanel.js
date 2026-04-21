// sidepanel/sidepanel.js — Side Panel logic

const STATUS_ICONS = {
  pending: '',
  running: '',
  completed: '\u2713',  // ✓
  failed: '\u2717',     // ✗
  stopped: '\u25A0',    // ■
  manual_completed: '跳',
  skipped: '跳',
};

const logArea = document.getElementById('log-area');
const updateSection = document.getElementById('update-section');
const extensionUpdateStatus = document.getElementById('extension-update-status');
const extensionVersionMeta = document.getElementById('extension-version-meta');
const btnReleaseLog = document.getElementById('btn-release-log');
const updateCardVersion = document.getElementById('update-card-version');
const updateCardSummary = document.getElementById('update-card-summary');
const updateReleaseList = document.getElementById('update-release-list');
const btnOpenRelease = document.getElementById('btn-open-release');
const BUILD_STAMP = 'reg-gpt-20260421-step5diag1';
const BUILD_SIGNATURE = `${chrome.runtime.getManifest()?.name || 'extension'}@${chrome.runtime.getManifest()?.version || '0.0.0'}+${BUILD_STAMP}`;
const settingsCard = document.getElementById('settings-card');
const displayOauthUrl = document.getElementById('display-oauth-url');
const displayLocalhostUrl = document.getElementById('display-localhost-url');
const displayStatus = document.getElementById('display-status');
const statusBar = document.getElementById('status-bar');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const btnToggleVpsUrl = document.getElementById('btn-toggle-vps-url');
const btnToggleVpsPassword = document.getElementById('btn-toggle-vps-password');
const btnFetchEmail = document.getElementById('btn-fetch-email');
const btnTogglePassword = document.getElementById('btn-toggle-password');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const stepsProgress = document.getElementById('steps-progress');
const btnAutoRun = document.getElementById('btn-auto-run');
const btnAutoContinue = document.getElementById('btn-auto-continue');
const autoContinueBar = document.getElementById('auto-continue-bar');
const autoScheduleBar = document.getElementById('auto-schedule-bar');
const autoScheduleTitle = document.getElementById('auto-schedule-title');
const autoScheduleMeta = document.getElementById('auto-schedule-meta');
const btnAutoRunNow = document.getElementById('btn-auto-run-now');
const btnAutoCancelSchedule = document.getElementById('btn-auto-cancel-schedule');
const btnClearLog = document.getElementById('btn-clear-log');
const icloudSection = document.getElementById('icloud-section');
const icloudSummary = document.getElementById('icloud-summary');
const icloudList = document.getElementById('icloud-list');
const icloudLoginHelp = document.getElementById('icloud-login-help');
const icloudLoginHelpTitle = document.getElementById('icloud-login-help-title');
const icloudLoginHelpText = document.getElementById('icloud-login-help-text');
const btnIcloudLoginDone = document.getElementById('btn-icloud-login-done');
const btnIcloudRefresh = document.getElementById('btn-icloud-refresh');
const btnIcloudDeleteUsed = document.getElementById('btn-icloud-delete-used');
const inputIcloudSearch = document.getElementById('input-icloud-search');
const selectIcloudFilter = document.getElementById('select-icloud-filter');
const checkboxIcloudSelectAll = document.getElementById('checkbox-icloud-select-all');
const icloudSelectionSummary = document.getElementById('icloud-selection-summary');
const btnIcloudBulkUsed = document.getElementById('btn-icloud-bulk-used');
const btnIcloudBulkUnused = document.getElementById('btn-icloud-bulk-unused');
const btnIcloudBulkPreserve = document.getElementById('btn-icloud-bulk-preserve');
const btnIcloudBulkUnpreserve = document.getElementById('btn-icloud-bulk-unpreserve');
const btnIcloudBulkDelete = document.getElementById('btn-icloud-bulk-delete');
const accountsCount = document.getElementById('accounts-count');
const accountsSummary = document.getElementById('accounts-summary');
const accountsList = document.getElementById('accounts-list');
const btnExportAccounts = document.getElementById('btn-export-accounts');
const btnImportAccounts = document.getElementById('btn-import-accounts');
const btnClearAccounts = document.getElementById('btn-clear-accounts');
const btnToggleAccounts = document.getElementById('btn-toggle-accounts');
const configMenuShell = document.getElementById('config-menu-shell');
const btnConfigMenu = document.getElementById('btn-config-menu');
const configMenu = document.getElementById('config-menu');
const btnExportSettings = document.getElementById('btn-export-settings');
const btnImportSettings = document.getElementById('btn-import-settings');
const inputImportSettingsFile = document.getElementById('input-import-settings-file');
const inputImportAccountsFile = document.getElementById('input-import-accounts-file');
const selectPanelMode = document.getElementById('select-panel-mode');
const rowVpsUrl = document.getElementById('row-vps-url');
const inputVpsUrl = document.getElementById('input-vps-url');
const rowVpsPassword = document.getElementById('row-vps-password');
const inputVpsPassword = document.getElementById('input-vps-password');
const rowLocalCpaStep9Mode = document.getElementById('row-local-cpa-step9-mode');
const localCpaStep9ModeButtons = Array.from(document.querySelectorAll('[data-local-cpa-step9-mode]'));
const rowSub2ApiUrl = document.getElementById('row-sub2api-url');
const inputSub2ApiUrl = document.getElementById('input-sub2api-url');
const rowSub2ApiEmail = document.getElementById('row-sub2api-email');
const inputSub2ApiEmail = document.getElementById('input-sub2api-email');
const rowSub2ApiPassword = document.getElementById('row-sub2api-password');
const inputSub2ApiPassword = document.getElementById('input-sub2api-password');
const rowSub2ApiGroup = document.getElementById('row-sub2api-group');
const sub2ApiGroupList = document.getElementById('sub2api-group-list');
const sub2ApiGroupSummary = document.getElementById('sub2api-group-summary');
const btnRefreshSub2ApiGroups = document.getElementById('btn-refresh-sub2api-groups');
const selectMailProvider = document.getElementById('select-mail-provider');
const btnMailLogin = document.getElementById('btn-mail-login');
const rowEmailGenerator = document.getElementById('row-email-generator');
const selectEmailGenerator = document.getElementById('select-email-generator');
const rowIcloudHostPreference = document.getElementById('row-icloud-host-preference');
const selectIcloudHostPreference = document.getElementById('select-icloud-host-preference');
const rowEmailPrefix = document.getElementById('row-email-prefix');
const labelEmailPrefix = document.getElementById('label-email-prefix');
const inputEmailPrefix = document.getElementById('input-email-prefix');
const rowInbucketHost = document.getElementById('row-inbucket-host');
const inputInbucketHost = document.getElementById('input-inbucket-host');
const rowInbucketMailbox = document.getElementById('row-inbucket-mailbox');
const inputInbucketMailbox = document.getElementById('input-inbucket-mailbox');
const rowMoemailBaseUrl = document.getElementById('row-moemail-base-url');
const inputMoemailBaseUrl = document.getElementById('input-moemail-base-url');
const rowMoemailApiKey = document.getElementById('row-moemail-api-key');
const inputMoemailApiKey = document.getElementById('input-moemail-api-key');
const rowMoemailDomain = document.getElementById('row-moemail-domain');
const selectMoemailDomain = document.getElementById('select-moemail-domain');
const btnRefreshMoemailDomains = document.getElementById('btn-refresh-moemail-domains');
const rowMailpitBaseUrl = document.getElementById('row-mailpit-base-url');
const inputMailpitBaseUrl = document.getElementById('input-mailpit-base-url');
const rowMailpitUsername = document.getElementById('row-mailpit-username');
const inputMailpitUsername = document.getElementById('input-mailpit-username');
const rowMailpitPassword = document.getElementById('row-mailpit-password');
const inputMailpitPassword = document.getElementById('input-mailpit-password');
const rowMailpitDomain = document.getElementById('row-mailpit-domain');
const inputMailpitDomain = document.getElementById('input-mailpit-domain');
const rowCfDomain = document.getElementById('row-cf-domain');
const selectCfDomain = document.getElementById('select-cf-domain');
const inputCfDomain = document.getElementById('input-cf-domain');
const btnCfDomainMode = document.getElementById('btn-cf-domain-mode');
const inputRunCount = document.getElementById('input-run-count');
const inputAutoSkipFailures = document.getElementById('input-auto-skip-failures');
const inputAutoSkipFailuresThreadIntervalMinutes = document.getElementById('input-auto-skip-failures-thread-interval-minutes');
const inputAutoDelayEnabled = document.getElementById('input-auto-delay-enabled');
const inputAutoDelayMinutes = document.getElementById('input-auto-delay-minutes');
const inputAutoStepDelaySeconds = document.getElementById('input-auto-step-delay-seconds');
const autoStartModal = document.getElementById('auto-start-modal');
const autoStartTitle = autoStartModal?.querySelector('.modal-title');
const autoStartMessage = document.getElementById('auto-start-message');
const autoStartAlert = document.getElementById('auto-start-alert');
const modalOptionRow = document.getElementById('modal-option-row');
const modalOptionInput = document.getElementById('modal-option-input');
const modalOptionText = document.getElementById('modal-option-text');
const btnAutoStartClose = document.getElementById('btn-auto-start-close');
const btnAutoStartCancel = document.getElementById('btn-auto-start-cancel');
const btnAutoStartRestart = document.getElementById('btn-auto-start-restart');
const btnAutoStartContinue = document.getElementById('btn-auto-start-continue');
const autoHintText = document.querySelector('.auto-hint');
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_GROUP_NAMES = [];
const STEP_DEFAULT_STATUSES = {
  1: 'pending',
  2: 'pending',
  3: 'pending',
  4: 'pending',
  5: 'pending',
  6: 'pending',
  7: 'pending',
  8: 'pending',
  9: 'pending',
  10: 'pending',
};
const AUTO_RUN_STEP_SEQUENCE = [2, 3, 4, 5, 1, 6, 7, 8, 9, 10];
const MANUAL_STEP_PREREQUISITES = {
  1: [],
  2: [],
  3: [2],
  4: [3],
  5: [4],
  6: [5],
  7: [6],
  8: [7],
  9: [8],
  10: [9],
};
const SKIPPABLE_STEPS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const AUTO_DELAY_MIN_MINUTES = 1;
const AUTO_DELAY_MAX_MINUTES = 1440;
const AUTO_DELAY_DEFAULT_MINUTES = 30;
const AUTO_FALLBACK_THREAD_INTERVAL_MIN_MINUTES = 0;
const AUTO_FALLBACK_THREAD_INTERVAL_MAX_MINUTES = 1440;
const AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES = 0;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_SECONDS = 600;
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-skip-failures-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-run-fallback-risk-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS = 15;
const AUTO_RUN_FALLBACK_RISK_RECOMMENDED_THREAD_INTERVAL_MINUTES = 5;
const DISPLAY_TIMEZONE = 'Asia/Shanghai';

let latestState = null;
let currentAutoRun = {
  autoRunning: false,
  phase: 'idle',
  currentRun: 0,
  totalRuns: 8,
  attemptRun: 0,
  scheduledAt: null,
  countdownAt: null,
  countdownTitle: '',
  countdownNote: '',
};
let settingsDirty = false;
let settingsSaveInFlight = false;
let settingsAutoSaveTimer = null;
let cloudflareDomainEditMode = false;
let sub2ApiAvailableGroups = [];
let sub2ApiGroupLoadInFlight = false;
let sub2ApiGroupLoadSequence = 0;
let moemailAvailableDomains = [];
let moemailDomainLoadInFlight = false;
let moemailDomainLoadSequence = 0;
let modalChoiceResolver = null;
let currentModalActions = [];
let modalResultBuilder = null;
let scheduledCountdownTimer = null;
let configMenuOpen = false;
let configActionInFlight = false;
let currentReleaseSnapshot = null;
let lastRenderedIcloudAliases = [];
let lastRenderedAccounts = [];
let lastAccountsByEmail = new Map();
let icloudSearchTerm = '';
let icloudFilterMode = 'all';
let icloudSelectedEmails = new Set();
let accountsCollapsed = false;

const EYE_OPEN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.77 21.77 0 0 1 5.06-6.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const DEFAULT_MOEMAIL_API_BASE_URL = window.MoemailUtils?.DEFAULT_MOEMAIL_API_BASE_URL || 'https://sall.cc';
const normalizeMoemailApiBaseUrlValue = window.MoemailUtils?.normalizeMoemailApiBaseUrl;
const normalizeMailpitApiBaseUrlValue = window.MailpitUtils?.normalizeMailpitApiBaseUrl;
const normalizeMailpitDomainValue = window.MailpitUtils?.normalizeMailpitDomain;
const sidepanelUpdateService = window.SidepanelUpdateService;
const MAIL_PROVIDER_LOGIN_CONFIGS = {
  mailpit: {
    label: 'Mailpit',
  },
  '163': {
    label: '163 邮箱',
    url: 'https://mail.163.com/',
  },
  '163-vip': {
    label: '163 VIP 邮箱',
    url: 'https://vip.163.com/',
  },
  gmail: {
    label: 'Gmail',
    url: 'https://mail.google.com/mail/u/0/#inbox',
  },
  qq: {
    label: 'QQ 邮箱',
    url: 'https://wx.mail.qq.com/',
  },
  '2925': {
    label: '2925 邮箱',
    url: 'https://2925.com/#/mailList',
  },
};

// ============================================================
// Toast Notifications
// ============================================================

const toastContainer = document.getElementById('toast-container');

const TOAST_ICONS = {
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

const LOG_LEVEL_LABELS = {
  info: '信息',
  ok: '成功',
  warn: '警告',
  error: '错误',
};

function usesGeneratedAliasMailProvider(provider) {
  return provider === '2925';
}

function showToast(message, type = 'error', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${TOAST_ICONS[type] || ''}<span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close">&times;</button>`;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove());
}

function shouldShowIcloudSection() {
  return getSelectedEmailGenerator() === 'icloud';
}

function showIcloudLoginHelp(payload = {}) {
  if (!icloudLoginHelp) return;
  const loginUrl = String(payload.loginUrl || '').trim();
  let host = 'icloud.com / icloud.com.cn';
  try {
    if (loginUrl) host = new URL(loginUrl).host;
  } catch {}
  if (icloudLoginHelpTitle) {
    icloudLoginHelpTitle.textContent = 'iCloud 登录已过期';
  }
  if (icloudLoginHelpText) {
    icloudLoginHelpText.textContent = `已为你打开 ${host}，请先完成登录，再回到这里点击“我已登录”。`;
  }
  icloudLoginHelp.style.display = 'flex';
}

function hideIcloudLoginHelp() {
  if (!icloudLoginHelp) return;
  icloudLoginHelp.style.display = 'none';
}

function normalizeIcloudSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getFilteredIcloudAliases(aliases = lastRenderedIcloudAliases) {
  const searchTerm = normalizeIcloudSearchText(icloudSearchTerm);
  return (Array.isArray(aliases) ? aliases : []).filter((alias) => {
    const account = getAccountByEmail(alias.email);
    const matchesFilter = (() => {
      switch (icloudFilterMode) {
        case 'active': return Boolean(alias.active);
        case 'used': return Boolean(alias.used);
        case 'unused': return !alias.used;
        case 'preserved': return Boolean(alias.preserved);
        default: return true;
      }
    })();

    if (!matchesFilter) return false;
    if (!searchTerm) return true;

    const haystack = [
      alias.email,
      alias.label,
      alias.note,
      alias.used ? 'used 已用' : 'unused 未用',
      alias.active ? 'active 可用' : 'inactive',
      alias.preserved ? 'preserved 保留' : '',
      account ? 'account 账号' : '',
      account?.createdAt ? formatAccountTimestamp(account.createdAt) : '',
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm);
  });
}

function pruneIcloudSelection(aliases = lastRenderedIcloudAliases) {
  const existing = new Set((Array.isArray(aliases) ? aliases : []).map((alias) => alias.email));
  icloudSelectedEmails = new Set([...icloudSelectedEmails].filter((email) => existing.has(email)));
}

function updateIcloudBulkUI(visibleAliases = getFilteredIcloudAliases()) {
  if (!checkboxIcloudSelectAll || !icloudSelectionSummary) {
    return;
  }
  const visibleEmails = visibleAliases.map((alias) => alias.email);
  const selectedVisibleCount = visibleEmails.filter((email) => icloudSelectedEmails.has(email)).length;
  const hasVisible = visibleEmails.length > 0;

  checkboxIcloudSelectAll.checked = hasVisible && selectedVisibleCount === visibleEmails.length;
  checkboxIcloudSelectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleEmails.length;
  checkboxIcloudSelectAll.disabled = !hasVisible;
  icloudSelectionSummary.textContent = `已选 ${icloudSelectedEmails.size} / ${visibleEmails.length}`;

  const hasSelection = icloudSelectedEmails.size > 0;
  if (btnIcloudBulkUsed) btnIcloudBulkUsed.disabled = !hasSelection;
  if (btnIcloudBulkUnused) btnIcloudBulkUnused.disabled = !hasSelection;
  if (btnIcloudBulkPreserve) btnIcloudBulkPreserve.disabled = !hasSelection;
  if (btnIcloudBulkUnpreserve) btnIcloudBulkUnpreserve.disabled = !hasSelection;
  if (btnIcloudBulkDelete) btnIcloudBulkDelete.disabled = !hasSelection;
}

function setIcloudLoadingState(loading, summary = '') {
  if (btnIcloudRefresh) btnIcloudRefresh.disabled = loading;
  if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = loading;
  if (btnIcloudLoginDone) btnIcloudLoginDone.disabled = loading;
  if (inputIcloudSearch) inputIcloudSearch.disabled = loading;
  if (selectIcloudFilter) selectIcloudFilter.disabled = loading;
  if (checkboxIcloudSelectAll) checkboxIcloudSelectAll.disabled = loading || getFilteredIcloudAliases().length === 0;
  if (btnIcloudBulkUsed) btnIcloudBulkUsed.disabled = loading || icloudSelectedEmails.size === 0;
  if (btnIcloudBulkUnused) btnIcloudBulkUnused.disabled = loading || icloudSelectedEmails.size === 0;
  if (btnIcloudBulkPreserve) btnIcloudBulkPreserve.disabled = loading || icloudSelectedEmails.size === 0;
  if (btnIcloudBulkUnpreserve) btnIcloudBulkUnpreserve.disabled = loading || icloudSelectedEmails.size === 0;
  if (btnIcloudBulkDelete) btnIcloudBulkDelete.disabled = loading || icloudSelectedEmails.size === 0;
  if (summary && icloudSummary) icloudSummary.textContent = summary;
}

function renderIcloudAliases(aliases = []) {
  lastRenderedIcloudAliases = Array.isArray(aliases) ? aliases : [];
  pruneIcloudSelection(lastRenderedIcloudAliases);
  if (!icloudList || !icloudSummary) return;

  if (!lastRenderedIcloudAliases.length) {
    icloudSelectedEmails.clear();
    icloudList.innerHTML = '<div class="icloud-empty">当前未读取到 iCloud Hide My Email 别名。</div>';
    icloudSummary.textContent = shouldShowIcloudSection()
      ? '当前未读取到 iCloud Hide My Email 别名。'
      : '切换到 iCloud 生成器后，可在这里查看当前 Hide My Email 别名。';
    if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = true;
    updateIcloudBulkUI([]);
    return;
  }

  const usedCount = lastRenderedIcloudAliases.filter((alias) => alias.used).length;
  const deletableUsedCount = lastRenderedIcloudAliases.filter((alias) => alias.used && !alias.preserved).length;
  icloudSummary.textContent = `已加载 ${lastRenderedIcloudAliases.length} 个 iCloud Hide My Email 别名，其中 ${usedCount} 个已使用。`;
  if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = deletableUsedCount === 0;

  const visibleAliases = getFilteredIcloudAliases(lastRenderedIcloudAliases);
  if (!visibleAliases.length) {
    icloudList.innerHTML = '<div class="icloud-empty">没有匹配当前筛选条件的 alias。</div>';
    updateIcloudBulkUI([]);
    return;
  }

  icloudList.innerHTML = visibleAliases.map((alias) => {
    const linkedAccount = getAccountByEmail(alias.email);
    const linkedPassword = String(linkedAccount?.password || '');
    const linkedTime = linkedAccount?.createdAt ? formatAccountTimestamp(linkedAccount.createdAt) : '';
    const tags = [
      alias.active ? '<span class="icloud-tag active">可用</span>' : '<span class="icloud-tag inactive">不可用</span>',
      alias.used ? '<span class="icloud-tag used">已用</span>' : '<span class="icloud-tag unused">未用</span>',
      alias.preserved ? '<span class="icloud-tag preserved">保留</span>' : '',
      alias.label ? `<span class="icloud-tag">${escapeHtml(alias.label)}</span>` : '',
      alias.note ? `<span class="icloud-tag">${escapeHtml(alias.note)}</span>` : '',
    ].filter(Boolean).join('');
    return `
      <div class="icloud-item">
        <input class="icloud-item-check" type="checkbox" data-action="select" data-email="${escapeHtml(alias.email || '')}" ${icloudSelectedEmails.has(alias.email) ? 'checked' : ''} />
        <div class="icloud-item-main">
        <div class="icloud-item-email">${escapeHtml(alias.email || '')}</div>
        <div class="icloud-item-meta">${tags}</div>
        <div class="icloud-item-actions">
          <button class="btn btn-outline btn-xs" type="button" data-action="toggle-used" data-email="${escapeHtml(alias.email || '')}">
            ${alias.used ? '标记未用' : '标记已用'}
          </button>
          <button class="btn btn-outline btn-xs" type="button" data-action="toggle-preserved" data-email="${escapeHtml(alias.email || '')}">
            ${alias.preserved ? '取消保留' : '保留'}
          </button>
          <button class="btn btn-outline btn-xs" type="button" data-action="delete" data-email="${escapeHtml(alias.email || '')}">
            删除
          </button>
        </div>
        ${linkedAccount ? `
          <div class="icloud-account-row">
            <span class="icloud-tag">账号</span>
            <span class="icloud-account-secret" data-email="${escapeHtml(alias.email || '')}" data-hidden="true" title="点击显示密码">${escapeHtml(linkedPassword ? '******' : '无密码')}</span>
            <button class="btn btn-ghost btn-xs" type="button" data-action="copy-account" data-email="${escapeHtml(alias.email || '')}">复制</button>
            ${linkedTime ? `<span class="icloud-account-time">${escapeHtml(linkedTime)}</span>` : ''}
          </div>
        ` : ''}
        </div>
      </div>
    `;
  }).join('');

  icloudList.querySelectorAll('.icloud-account-secret').forEach((node) => {
    node.addEventListener('click', () => {
      const account = getAccountByEmail(node.dataset.email || '');
      const password = String(account?.password || '');
      if (!password) {
        showToast('当前历史账号没有保存密码。', 'warn');
        return;
      }
      const hidden = node.dataset.hidden !== 'false';
      node.textContent = hidden ? password : '******';
      node.dataset.hidden = hidden ? 'false' : 'true';
      node.title = hidden ? '点击隐藏密码' : '点击显示密码';
    });
  });

  icloudList.querySelectorAll('[data-action="copy-account"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const account = getAccountByEmail(button.dataset.email || '');
      await copyTextToClipboard(`${String(account?.email || '').trim()}:${String(account?.password || '').trim()}`.replace(/^:/, ''));
      showToast('已复制账号信息', 'success', 1800);
    });
  });

  icloudList.querySelectorAll('[data-action="toggle-used"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email || '';
      const alias = lastRenderedIcloudAliases.find((item) => item.email === email);
      if (!alias) return;
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SET_ICLOUD_ALIAS_USED_STATE',
          source: 'sidepanel',
          payload: { email: alias.email, used: !alias.used },
        });
        if (response?.error) {
          throw new Error(response.error);
        }
        await refreshIcloudAliases({ silent: true });
        showToast(`已更新 ${alias.email} 的已用状态`, 'success', 1800);
      } catch (err) {
        showToast(`更新已用状态失败：${err.message}`, 'error');
      }
    });
  });

  icloudList.querySelectorAll('[data-action="toggle-preserved"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email || '';
      const alias = lastRenderedIcloudAliases.find((item) => item.email === email);
      if (!alias) return;
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SET_ICLOUD_ALIAS_PRESERVED_STATE',
          source: 'sidepanel',
          payload: { email: alias.email, preserved: !alias.preserved },
        });
        if (response?.error) {
          throw new Error(response.error);
        }
        await refreshIcloudAliases({ silent: true });
        showToast(`已更新 ${alias.email} 的保留状态`, 'success', 1800);
      } catch (err) {
        showToast(`更新保留状态失败：${err.message}`, 'error');
      }
    });
  });

  icloudList.querySelectorAll('[data-action="select"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const email = event.target.dataset.email || '';
      if (event.target.checked) {
        icloudSelectedEmails.add(email);
      } else {
        icloudSelectedEmails.delete(email);
      }
      updateIcloudBulkUI(visibleAliases);
    });
  });

  icloudList.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email || '';
      const alias = lastRenderedIcloudAliases.find((item) => item.email === email);
      if (!alias) return;
      await deleteSingleIcloudAlias(alias);
    });
  });

  updateIcloudBulkUI(visibleAliases);
}

function normalizeEmailKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildAccountsByEmail(accounts = []) {
  const mapped = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const key = normalizeEmailKey(account?.email);
    if (!key) continue;
    mapped.set(key, account);
  }
  return mapped;
}

function setAccountsState(accounts = []) {
  lastRenderedAccounts = Array.isArray(accounts) ? accounts : [];
  lastAccountsByEmail = buildAccountsByEmail(lastRenderedAccounts);
}

function getAccountByEmail(email) {
  return lastAccountsByEmail.get(normalizeEmailKey(email)) || null;
}

function getDetachedAccounts(accounts = lastRenderedAccounts, aliases = lastRenderedIcloudAliases) {
  const aliasEmails = new Set((Array.isArray(aliases) ? aliases : []).map((alias) => normalizeEmailKey(alias?.email)));
  return (Array.isArray(accounts) ? accounts : []).filter((account) => {
    const key = normalizeEmailKey(account?.email);
    return key && !aliasEmails.has(key);
  });
}

function formatAccountTimestamp(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function updateAccountsCollapseUI() {
  if (!accountsList) return;
  const hasVisibleRows = accountsList.dataset.hasVisibleRows !== 'false';
  accountsList.style.display = (!hasVisibleRows || accountsCollapsed) ? 'none' : '';
  const chevron = btnToggleAccounts?.querySelector('.chevron-icon');
  if (chevron) {
    chevron.style.transform = accountsCollapsed ? 'rotate(-90deg)' : '';
  }
}

function renderAccountRow(account, index) {
  const row = document.createElement('div');
  row.className = 'account-row';
  row.dataset.index = String(index);

  const email = String(account?.email || '').trim() || `账号 #${index + 1}`;
  const password = String(account?.password || '');
  const time = formatAccountTimestamp(account?.createdAt);

  row.innerHTML = `
    <div class="account-info">
      <span class="account-email" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
      <span class="account-pwd" data-hidden="true" title="点击显示密码">${escapeHtml(password ? '******' : '无密码')}</span>
      ${time ? `<span class="account-time">${escapeHtml(time)}</span>` : ''}
    </div>
    <div class="account-actions">
      <button class="btn btn-ghost btn-xs" type="button" data-action="copy">复制</button>
      <button class="btn btn-ghost btn-xs" type="button" data-action="delete">删除</button>
    </div>
  `;

  const pwdEl = row.querySelector('.account-pwd');
  pwdEl.addEventListener('click', () => {
    if (!password) {
      showToast('当前历史账号没有保存密码。', 'warn');
      return;
    }
    const hidden = pwdEl.dataset.hidden !== 'false';
    pwdEl.textContent = hidden ? password : '******';
    pwdEl.dataset.hidden = hidden ? 'false' : 'true';
    pwdEl.title = hidden ? '点击隐藏密码' : '点击显示密码';
  });

  row.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    await copyTextToClipboard(`${String(account?.email || '').trim()}:${password}`.replace(/^:/, ''));
    showToast('已复制账号信息', 'success', 1800);
  });

  row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`删除 ${email} 这条历史账号记录？`)) {
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'DELETE_ACCOUNT',
        source: 'sidepanel',
        payload: { index },
      });
      if (result?.error) {
        throw new Error(result.error);
      }
      setAccountsState(result.accounts || []);
      renderIcloudAliases(lastRenderedIcloudAliases);
      renderAccountsSection();
      showToast('已删除历史账号', 'info', 1800);
    } catch (err) {
      showToast(`删除历史账号失败：${err.message}`, 'error');
    }
  });

  return row;
}

function renderAccountsSection() {
  if (!accountsList || !accountsCount) return;
  const detachedAccounts = getDetachedAccounts();
  const attachedCount = Math.max(0, lastRenderedAccounts.length - detachedAccounts.length);

  accountsList.innerHTML = '';
  accountsCount.textContent = String(lastRenderedAccounts.length);

  if (!lastRenderedAccounts.length) {
    accountsList.dataset.hasVisibleRows = 'true';
    if (accountsSummary) accountsSummary.textContent = '';
    accountsList.innerHTML = '<div class="accounts-empty">当前还没有历史账号记录。</div>';
    if (btnClearAccounts) btnClearAccounts.disabled = true;
    if (btnExportAccounts) btnExportAccounts.disabled = true;
    updateAccountsCollapseUI();
    return;
  }

  if (btnClearAccounts) btnClearAccounts.disabled = false;
  if (btnExportAccounts) btnExportAccounts.disabled = false;

  if (!detachedAccounts.length) {
    accountsList.dataset.hasVisibleRows = 'false';
    if (accountsSummary) {
      accountsSummary.textContent = '上方 iCloud 别名中已经合并显示了匹配的历史账号信息。';
    }
    accountsList.innerHTML = '';
    updateAccountsCollapseUI();
    return;
  }

  accountsList.dataset.hasVisibleRows = 'true';
  if (accountsSummary) {
    accountsSummary.textContent = attachedCount > 0
      ? `上方已合并 ${attachedCount} 条账号信息；下方仅显示当前 alias 列表中不存在的 ${detachedAccounts.length} 条历史记录。`
      : `当前有 ${detachedAccounts.length} 条历史账号不在当前 alias 列表中。`;
  }

  for (let index = lastRenderedAccounts.length - 1; index >= 0; index -= 1) {
    const account = lastRenderedAccounts[index];
    if (!detachedAccounts.includes(account)) continue;
    accountsList.appendChild(renderAccountRow(account, index));
  }
  updateAccountsCollapseUI();
}

async function loadAccounts(options = {}) {
  const { silent = false } = options;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'GET_ACCOUNTS',
      source: 'sidepanel',
      payload: {},
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    setAccountsState(result.accounts || []);
    renderIcloudAliases(lastRenderedIcloudAliases);
    renderAccountsSection();
  } catch (err) {
    setAccountsState([]);
    if (accountsCount) accountsCount.textContent = '0';
    if (accountsSummary) accountsSummary.textContent = '';
    if (accountsList) {
      accountsList.innerHTML = `<div class="accounts-empty">${escapeHtml(`加载历史账号失败：${err.message || err}`)}</div>`;
    }
    if (btnClearAccounts) btnClearAccounts.disabled = true;
    if (!silent) {
      showToast(`加载历史账号失败：${err.message || err}`, 'error');
    }
  }
}

async function refreshIcloudAliases(options = {}) {
  const { silent = false } = options;
  if (!shouldShowIcloudSection()) {
    return [];
  }
  if (btnIcloudRefresh) {
    btnIcloudRefresh.disabled = true;
    btnIcloudRefresh.textContent = '加载中';
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_ICLOUD_ALIASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    hideIcloudLoginHelp();
    renderIcloudAliases(response?.aliases || []);
    if (!silent) {
      showToast(`已加载 ${(response?.aliases || []).length} 个 iCloud 别名`, 'success', 1800);
    }
    return response?.aliases || [];
  } catch (err) {
    icloudSummary.textContent = err.message;
    icloudList.innerHTML = '<div class="icloud-empty">当前无法加载 iCloud 别名。</div>';
    if (!silent) {
      showToast(`加载 iCloud 别名失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    if (btnIcloudRefresh) {
      btnIcloudRefresh.disabled = false;
      btnIcloudRefresh.textContent = '刷新';
    }
  }
}

async function deleteSingleIcloudAlias(alias) {
  if (!confirm(`删除 ${alias.email}？此操作不可撤销。`)) {
    return;
  }

  setIcloudLoadingState(true, `正在删除 ${alias.email}...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_ICLOUD_ALIAS',
      source: 'sidepanel',
      payload: { email: alias.email, anonymousId: alias.anonymousId },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`已删除 ${alias.email}`, 'success', 2200);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`删除失败：${err.message}`, 'error');
    icloudSummary.textContent = err.message;
  } finally {
    setIcloudLoadingState(false);
  }
}

async function deleteUsedIcloudAliases() {
  if (!confirm('删除所有未被保留的已用 iCloud alias？此操作不可撤销。')) {
    return;
  }

  setIcloudLoadingState(true, '正在删除已用 iCloud alias...');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_USED_ICLOUD_ALIASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) throw new Error(response.error);
    const deleted = response?.deleted || [];
    const skipped = response?.skipped || [];
    showToast(`删除完成：成功 ${deleted.length} 个，跳过 ${skipped.length} 个`, skipped.length ? 'warn' : 'success', 2600);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`批量删除失败：${err.message}`, 'error');
    icloudSummary.textContent = err.message;
  } finally {
    setIcloudLoadingState(false);
  }
}

async function setSingleIcloudAliasUsedState(alias, used) {
  setIcloudLoadingState(true, `正在更新 ${alias.email} 状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_ICLOUD_ALIAS_USED_STATE',
      source: 'sidepanel',
      payload: { email: alias.email, used },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`已更新 ${alias.email} 的已用状态`, 'success', 2000);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`更新已用状态失败：${err.message}`, 'error');
    icloudSummary.textContent = err.message;
  } finally {
    setIcloudLoadingState(false);
  }
}

async function setSingleIcloudAliasPreservedState(alias, preserved) {
  setIcloudLoadingState(true, `正在更新 ${alias.email} 保留状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_ICLOUD_ALIAS_PRESERVED_STATE',
      source: 'sidepanel',
      payload: { email: alias.email, preserved },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`已更新 ${alias.email} 的保留状态`, 'success', 2000);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`更新保留状态失败：${err.message}`, 'error');
    icloudSummary.textContent = err.message;
  } finally {
    setIcloudLoadingState(false);
  }
}

async function runBulkIcloudAction(action) {
  const selectedAliases = lastRenderedIcloudAliases.filter((alias) => icloudSelectedEmails.has(alias.email));
  if (!selectedAliases.length) {
    updateIcloudBulkUI();
    return;
  }

  if (action === 'delete' && !confirm(`删除所选 ${selectedAliases.length} 个 alias？此操作不可撤销。`)) {
    return;
  }

  setIcloudLoadingState(true, `正在批量处理 ${selectedAliases.length} 个 alias...`);
  try {
    for (const alias of selectedAliases) {
      let response = null;
      if (action === 'used' || action === 'unused') {
        response = await chrome.runtime.sendMessage({
          type: 'SET_ICLOUD_ALIAS_USED_STATE',
          source: 'sidepanel',
          payload: { email: alias.email, used: action === 'used' },
        });
      } else if (action === 'preserve' || action === 'unpreserve') {
        response = await chrome.runtime.sendMessage({
          type: 'SET_ICLOUD_ALIAS_PRESERVED_STATE',
          source: 'sidepanel',
          payload: { email: alias.email, preserved: action === 'preserve' },
        });
      } else if (action === 'delete') {
        response = await chrome.runtime.sendMessage({
          type: 'DELETE_ICLOUD_ALIAS',
          source: 'sidepanel',
          payload: { email: alias.email, anonymousId: alias.anonymousId },
        });
      }
      if (response?.error) throw new Error(response.error);
      if (action === 'delete') {
        icloudSelectedEmails.delete(alias.email);
      }
    }
    showToast(`批量操作完成：${selectedAliases.length} 个 alias`, 'success', 2200);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`批量操作失败：${err.message}`, 'error');
    icloudSummary.textContent = err.message;
  } finally {
    setIcloudLoadingState(false);
    updateIcloudBulkUI();
  }
}

function resetActionModalOption() {
  if (!modalOptionRow || !modalOptionInput || !modalOptionText) {
    return;
  }

  modalOptionRow.hidden = true;
  modalOptionInput.checked = false;
  modalOptionInput.disabled = false;
  modalOptionText.textContent = '不再提示';
}

function resetActionModalAlert() {
  if (!autoStartAlert) {
    return;
  }

  autoStartAlert.hidden = true;
  autoStartAlert.textContent = '';
  autoStartAlert.className = 'modal-alert';
}

function resetActionModalButtons() {
  const buttons = [btnAutoStartCancel, btnAutoStartRestart, btnAutoStartContinue];
  buttons.forEach((button) => {
    if (!button) return;
    button.hidden = true;
    button.disabled = false;
    button.onclick = null;
  });
  currentModalActions = [];
}

function configureActionModalButton(button, action) {
  if (!button) return;
  if (!action) {
    button.hidden = true;
    button.onclick = null;
    return;
  }

  button.hidden = false;
  button.disabled = false;
  button.textContent = action.label;
  button.className = `btn ${action.variant || 'btn-outline'} btn-sm`;
  button.onclick = () => resolveModalChoice(action.id);
}

function configureActionModalOption(option) {
  if (!modalOptionRow || !modalOptionInput || !modalOptionText) {
    return;
  }

  if (!option) {
    resetActionModalOption();
    return;
  }

  modalOptionRow.hidden = false;
  modalOptionInput.checked = Boolean(option.checked);
  modalOptionInput.disabled = Boolean(option.disabled);
  modalOptionText.textContent = option.label || '不再提示';
}

function configureActionModalAlert(alert) {
  if (!autoStartAlert) {
    return;
  }

  if (!alert?.text) {
    resetActionModalAlert();
    return;
  }

  autoStartAlert.hidden = false;
  autoStartAlert.textContent = alert.text;
  autoStartAlert.className = `modal-alert${alert.tone === 'danger' ? ' is-danger' : ''}`;
}

function resolveModalChoice(choice) {
  const optionChecked = Boolean(modalOptionInput?.checked);
  const result = typeof modalResultBuilder === 'function'
    ? modalResultBuilder(choice, { optionChecked })
    : choice;
  if (modalChoiceResolver) {
    modalChoiceResolver(result);
    modalChoiceResolver = null;
  }
  modalResultBuilder = null;
  resetActionModalButtons();
  resetActionModalAlert();
  resetActionModalOption();
  if (autoStartModal) {
    autoStartModal.hidden = true;
  }
}

function openActionModal({ title, message, actions, option, alert, buildResult }) {
  if (!autoStartModal) {
    return Promise.resolve(null);
  }

  if (modalChoiceResolver) {
    resolveModalChoice(null);
  }

  resetActionModalButtons();
  autoStartTitle.textContent = title;
  autoStartMessage.textContent = message;
  currentModalActions = actions || [];
  modalResultBuilder = typeof buildResult === 'function' ? buildResult : null;
  const buttonSlots = currentModalActions.length <= 2
    ? [btnAutoStartCancel, btnAutoStartContinue]
    : [btnAutoStartCancel, btnAutoStartRestart, btnAutoStartContinue];
  buttonSlots.forEach((button, index) => {
    configureActionModalButton(button, currentModalActions[index]);
  });
  configureActionModalAlert(alert);
  configureActionModalOption(option);
  autoStartModal.hidden = false;

  return new Promise((resolve) => {
    modalChoiceResolver = resolve;
  });
}

function openAutoStartChoiceDialog(startStep, options = {}) {
  const runningStep = Number.isInteger(options.runningStep) ? options.runningStep : null;
  const continueMessage = runningStep
    ? `继续当前会先等待步骤 ${runningStep} 完成，再按最新进度自动执行。`
    : `继续当前会从步骤 ${startStep} 开始自动执行。`;
  return openActionModal({
    title: '启动自动',
    message: `检测到当前已有流程进度。${continueMessage}重新开始会清空当前流程进度并从步骤 2 新开一轮（先注册后授权）。`,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'restart', label: '重新开始', variant: 'btn-outline' },
      { id: 'continue', label: '继续当前', variant: 'btn-primary' },
    ],
  });
}

async function openConfirmModal({ title, message, confirmLabel = '确认', confirmVariant = 'btn-primary', alert = null }) {
  const choice = await openActionModal({
    title,
    message,
    alert,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: confirmLabel, variant: confirmVariant },
    ],
  });
  return choice === 'confirm';
}

async function openConfirmModalWithOption({
  title,
  message,
  confirmLabel = '确认',
  confirmVariant = 'btn-primary',
  alert = null,
  optionLabel = '不再提示',
  optionChecked = false,
  optionDisabled = false,
}) {
  const result = await openActionModal({
    title,
    message,
    alert,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: confirmLabel, variant: confirmVariant },
    ],
    option: {
      label: optionLabel,
      checked: optionChecked,
      disabled: optionDisabled,
    },
    buildResult: (choice, meta) => ({
      choice,
      optionChecked: Boolean(meta?.optionChecked),
    }),
  });

  return {
    confirmed: result?.choice === 'confirm',
    optionChecked: Boolean(result?.optionChecked),
  };
}

function isPromptDismissed(storageKey) {
  return localStorage.getItem(storageKey) === '1';
}

function setPromptDismissed(storageKey, dismissed) {
  if (dismissed) {
    localStorage.setItem(storageKey, '1');
  } else {
    localStorage.removeItem(storageKey);
  }
}

function isAutoSkipFailuresPromptDismissed() {
  return isPromptDismissed(AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY);
}

function setAutoSkipFailuresPromptDismissed(dismissed) {
  setPromptDismissed(AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY, dismissed);
}

function isAutoRunFallbackRiskPromptDismissed() {
  return isPromptDismissed(AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY);
}

function setAutoRunFallbackRiskPromptDismissed(dismissed) {
  setPromptDismissed(AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY, dismissed);
}

function shouldWarnAutoRunFallbackRisk(totalRuns, autoRunSkipFailures) {
  return totalRuns >= AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS;
}

async function openAutoSkipFailuresConfirmModal() {
  const result = await openConfirmModalWithOption({
    title: '自动重试说明',
    message: `开启后，自动模式在某一轮失败时，会先在当前轮自动重试；单轮最多重试 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次，仍失败则放弃当前轮并继续下一轮。线程间隔只在开启自动重试且总轮数大于 1 时生效。`,
    confirmLabel: '确认开启',
  });

  return {
    confirmed: result.confirmed,
    dismissPrompt: result.optionChecked,
  };
}

async function openAutoRunFallbackRiskConfirmModal(totalRuns, fallbackThreadIntervalMinutes) {
  const intervalLabel = Number.isFinite(fallbackThreadIntervalMinutes)
    ? `${fallbackThreadIntervalMinutes} 分钟`
    : '未设置';

  const result = await openConfirmModalWithOption({
    title: '自动运行风险提醒',
    message: `当前设置为 ${totalRuns} 轮自动化，已开启自动重试，线程间隔为 ${intervalLabel}。轮数过多时，可能会因为 IP 短时间注册过多而集中失败。建议控制在 ${AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS} 轮以下，并将线程间隔设置在 ${AUTO_RUN_FALLBACK_RISK_RECOMMENDED_THREAD_INTERVAL_MINUTES} 分钟以上。是否继续？`,
    confirmLabel: '继续',
  });

  return {
    confirmed: result.confirmed,
    dismissPrompt: result.optionChecked,
  };
}

function updateConfigMenuControls() {
  const disabled = configActionInFlight || settingsSaveInFlight;
  const importLocked = disabled
    || currentAutoRun.autoRunning
    || Object.values(getStepStatuses()).some((status) => status === 'running');
  if (btnConfigMenu) {
    btnConfigMenu.disabled = disabled;
    btnConfigMenu.setAttribute('aria-expanded', String(configMenuOpen));
  }
  if (configMenu) {
    configMenu.hidden = !configMenuOpen;
  }
  if (btnExportSettings) {
    btnExportSettings.disabled = disabled;
  }
  if (btnImportSettings) {
    btnImportSettings.disabled = importLocked;
  }
}

function closeConfigMenu() {
  configMenuOpen = false;
  updateConfigMenuControls();
}

function openConfigMenu() {
  configMenuOpen = true;
  updateConfigMenuControls();
}

function toggleConfigMenu() {
  configMenuOpen ? closeConfigMenu() : openConfigMenu();
}

async function waitForSettingsSaveIdle() {
  while (settingsSaveInFlight) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function flushPendingSettingsBeforeExport() {
  clearTimeout(settingsAutoSaveTimer);
  await waitForSettingsSaveIdle();
  if (settingsDirty) {
    await saveSettings({ silent: true });
  }
}

async function settlePendingSettingsBeforeImport() {
  clearTimeout(settingsAutoSaveTimer);
  await waitForSettingsSaveIdle();
}

function downloadTextFile(content, fileName, mimeType = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function isDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}

function getStepStatuses(state = latestState) {
  return { ...STEP_DEFAULT_STATUSES, ...(state?.stepStatuses || {}) };
}

function getFirstUnfinishedStep(state = latestState) {
  const statuses = getStepStatuses(state);
  for (let step = 1; step <= 10; step++) {
    if (!isDoneStatus(statuses[step])) {
      return step;
    }
  }
  return null;
}

function getFirstUnfinishedAutoRunStep(state = latestState) {
  const statuses = getStepStatuses(state);
  for (const step of AUTO_RUN_STEP_SEQUENCE) {
    if (!isDoneStatus(statuses[step])) {
      return step;
    }
  }
  return null;
}

function getManualStepPrerequisites(step) {
  return Array.isArray(MANUAL_STEP_PREREQUISITES?.[step])
    ? [...MANUAL_STEP_PREREQUISITES[step]]
    : [];
}

function getFirstMissingManualPrerequisite(step, state = latestState) {
  const statuses = getStepStatuses(state);
  for (const prerequisiteStep of getManualStepPrerequisites(step)) {
    if (!isDoneStatus(statuses[prerequisiteStep])) {
      return prerequisiteStep;
    }
  }
  return null;
}

function getRunningSteps(state = latestState) {
  const statuses = getStepStatuses(state);
  return Object.entries(statuses)
    .filter(([, status]) => status === 'running')
    .map(([step]) => Number(step))
    .sort((a, b) => a - b);
}

function hasSavedProgress(state = latestState) {
  const statuses = getStepStatuses(state);
  return Object.values(statuses).some((status) => status !== 'pending');
}

function shouldOfferAutoModeChoice(state = latestState) {
  return hasSavedProgress(state) && getFirstUnfinishedAutoRunStep(state) !== null;
}

function syncLatestState(nextState) {
  const mergedStepStatuses = nextState?.stepStatuses
    ? { ...STEP_DEFAULT_STATUSES, ...(latestState?.stepStatuses || {}), ...nextState.stepStatuses }
    : getStepStatuses(latestState);

  latestState = {
    ...(latestState || {}),
    ...(nextState || {}),
    stepStatuses: mergedStepStatuses,
  };
}

function hasOwnStateValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readAutoRunStateValue(source, keys, fallback) {
  for (const key of keys) {
    if (hasOwnStateValue(source, key)) {
      return source[key];
    }
  }
  return fallback;
}

function syncAutoRunState(source = {}) {
  const phase = source.autoRunPhase ?? source.phase ?? currentAutoRun.phase;
  const autoRunning = source.autoRunning !== undefined
    ? Boolean(source.autoRunning)
    : (source.autoRunPhase !== undefined || source.phase !== undefined
      ? ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase)
      : currentAutoRun.autoRunning);

  currentAutoRun = {
    autoRunning,
    phase,
    currentRun: readAutoRunStateValue(source, ['autoRunCurrentRun', 'currentRun'], currentAutoRun.currentRun),
    totalRuns: readAutoRunStateValue(source, ['autoRunTotalRuns', 'totalRuns'], currentAutoRun.totalRuns),
    attemptRun: readAutoRunStateValue(source, ['autoRunAttemptRun', 'attemptRun'], currentAutoRun.attemptRun),
    scheduledAt: readAutoRunStateValue(source, ['scheduledAutoRunAt', 'scheduledAt'], currentAutoRun.scheduledAt),
    countdownAt: readAutoRunStateValue(source, ['autoRunCountdownAt', 'countdownAt'], currentAutoRun.countdownAt),
    countdownTitle: readAutoRunStateValue(source, ['autoRunCountdownTitle', 'countdownTitle'], currentAutoRun.countdownTitle),
    countdownNote: readAutoRunStateValue(source, ['autoRunCountdownNote', 'countdownNote'], currentAutoRun.countdownNote),
  };
}

function isAutoRunLockedPhase() {
  return currentAutoRun.phase === 'running'
    || currentAutoRun.phase === 'waiting_step'
    || currentAutoRun.phase === 'retrying'
    || currentAutoRun.phase === 'waiting_interval';
}

function isAutoRunPausedPhase() {
  return currentAutoRun.phase === 'waiting_email';
}

function isAutoRunWaitingStepPhase() {
  return currentAutoRun.phase === 'waiting_step';
}

function isAutoRunScheduledPhase() {
  return currentAutoRun.phase === 'scheduled';
}

function getAutoRunLabel(payload = currentAutoRun) {
  if ((payload.phase ?? currentAutoRun.phase) === 'scheduled') {
    return (payload.totalRuns || 1) > 1 ? ` (${payload.totalRuns}轮)` : '';
  }
  const attemptLabel = payload.attemptRun ? ` · 尝试${payload.attemptRun}` : '';
  if ((payload.totalRuns || 1) > 1) {
    return ` (${payload.currentRun}/${payload.totalRuns}${attemptLabel})`;
  }
  return attemptLabel ? ` (${attemptLabel.slice(3)})` : '';
}

function normalizeAutoDelayMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return AUTO_DELAY_DEFAULT_MINUTES;
  }
  return Math.min(AUTO_DELAY_MAX_MINUTES, Math.max(AUTO_DELAY_MIN_MINUTES, Math.floor(numeric)));
}

function normalizeAutoRunThreadIntervalMinutes(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES;
  }

  return Math.min(
    AUTO_FALLBACK_THREAD_INTERVAL_MAX_MINUTES,
    Math.max(AUTO_FALLBACK_THREAD_INTERVAL_MIN_MINUTES, Math.floor(numeric))
  );
}

function normalizeAutoStepDelaySeconds(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return null;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(AUTO_STEP_DELAY_MAX_SECONDS, Math.max(AUTO_STEP_DELAY_MIN_SECONDS, Math.floor(numeric)));
}

function formatAutoStepDelayInputValue(value) {
  const normalized = normalizeAutoStepDelaySeconds(value);
  return normalized === null ? '' : String(normalized);
}

function getRunCountValue() {
  return Math.min(50, Math.max(1, parseInt(inputRunCount.value, 10) || 8));
}

function updateFallbackThreadIntervalInputState() {
  if (!inputAutoSkipFailuresThreadIntervalMinutes) {
    return;
  }

  inputAutoSkipFailuresThreadIntervalMinutes.disabled = Boolean(inputAutoSkipFailures.disabled);
}

function updateAutoDelayInputState() {
  const scheduled = isAutoRunScheduledPhase();
  inputAutoDelayEnabled.disabled = scheduled;
  inputAutoDelayMinutes.disabled = scheduled || !inputAutoDelayEnabled.checked;
}

function formatCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatScheduleTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stopScheduledCountdownTicker() {
  clearInterval(scheduledCountdownTimer);
  scheduledCountdownTimer = null;
}

function getActiveAutoRunCountdown() {
  if (isAutoRunScheduledPhase() && Number.isFinite(currentAutoRun.scheduledAt)) {
    return {
      at: currentAutoRun.scheduledAt,
      title: '已计划自动运行',
      note: `计划于 ${formatScheduleTime(currentAutoRun.scheduledAt)} 开始`,
      tone: 'scheduled',
    };
  }

  if (!Number.isFinite(currentAutoRun.countdownAt)) {
    return null;
  }

  return {
    at: currentAutoRun.countdownAt,
    title: currentAutoRun.countdownTitle || '等待中',
    note: currentAutoRun.countdownNote || '',
    tone: 'running',
  };
}

function renderScheduledAutoRunInfo() {
  if (!autoScheduleBar) {
    return;
  }

  const countdown = getActiveAutoRunCountdown();
  if (!countdown) {
    autoScheduleBar.style.display = 'none';
    if (btnAutoRunNow) {
      btnAutoRunNow.hidden = false;
      btnAutoRunNow.textContent = '立即开始';
    }
    if (btnAutoCancelSchedule) {
      btnAutoCancelSchedule.hidden = false;
    }
    return;
  }

  const remainingMs = countdown.at - Date.now();
  autoScheduleBar.style.display = 'flex';
  if (btnAutoRunNow) {
    btnAutoRunNow.hidden = false;
    btnAutoRunNow.textContent = currentAutoRun.phase === 'waiting_interval' ? '立即继续' : '立即开始';
  }
  if (btnAutoCancelSchedule) {
    btnAutoCancelSchedule.hidden = currentAutoRun.phase === 'waiting_interval';
  }
  autoScheduleTitle.textContent = countdown.title;
  autoScheduleMeta.textContent = remainingMs > 0
    ? `${countdown.note ? `${countdown.note}，` : ''}剩余 ${formatCountdown(remainingMs)}`
    : '倒计时即将结束，正在准备继续...';
  return;
}

function syncScheduledCountdownTicker() {
  renderScheduledAutoRunInfo();
  if (getActiveAutoRunCountdown()) {
    if (scheduledCountdownTimer) {
      return;
    }

    scheduledCountdownTimer = setInterval(() => {
      renderScheduledAutoRunInfo();
      updateStatusDisplay(latestState);
    }, 1000);
    return;
  }

  stopScheduledCountdownTicker();
  return;
}

function setDefaultAutoRunButton() {
  btnAutoRun.disabled = false;
  inputRunCount.disabled = false;
  btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> 自动';
}

function normalizeSub2ApiGroupNameForUi(rawValue = '') {
  return String(rawValue || '').trim();
}

function normalizeSub2ApiGroupNamesForUi(rawValue = []) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const seen = new Set();
  const names = [];

  for (const value of values) {
    const normalized = normalizeSub2ApiGroupNameForUi(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(normalized);
  }

  return names;
}

function getSelectedSub2ApiGroupNamesFromState(state = latestState) {
  return normalizeSub2ApiGroupNamesForUi(state?.sub2apiGroupNames || []);
}

function normalizeSub2ApiGroupRecords(groups = []) {
  const seenIds = new Set();
  const seenNames = new Set();
  const normalizedGroups = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    const id = Number(group?.id);
    const name = normalizeSub2ApiGroupNameForUi(group?.name);
    const platform = String(group?.platform || '').trim().toLowerCase();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    if (platform && platform !== 'openai') continue;

    const nameKey = name.toLowerCase();
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    normalizedGroups.push({
      id,
      name,
      platform: platform || 'openai',
      accountCount: Number.isFinite(Number(group?.account_count)) ? Number(group.account_count) : null,
    });
  }

  return normalizedGroups;
}

function buildSub2ApiGroupOptionModels(groups = [], selectedNames = []) {
  const normalizedGroups = normalizeSub2ApiGroupRecords(groups);
  const normalizedSelectedNames = normalizeSub2ApiGroupNamesForUi(selectedNames);
  const effectiveSelectedNames = normalizedSelectedNames;
  const options = [];
  const seenNames = new Set();

  normalizedGroups.forEach((group) => {
    options.push(group);
    seenNames.add(group.name.toLowerCase());
  });

  effectiveSelectedNames.forEach((name) => {
    const key = name.toLowerCase();
    if (seenNames.has(key)) return;
    seenNames.add(key);
    options.push({
      id: null,
      name,
      platform: 'openai',
      accountCount: null,
    });
  });

  return {
    options,
    selectedNames: effectiveSelectedNames,
  };
}

function getSelectedSub2ApiGroupNames() {
  if (!sub2ApiGroupList) {
    return getSelectedSub2ApiGroupNamesFromState();
  }

  const checkedNames = Array.from(
    sub2ApiGroupList.querySelectorAll('input[type="checkbox"]:checked')
  ).map((input) => input.value);
  return normalizeSub2ApiGroupNamesForUi(checkedNames);
}

function updateSub2ApiGroupSummary(selectedNames = getSelectedSub2ApiGroupNames()) {
  if (!sub2ApiGroupSummary) {
    return;
  }

  const normalized = normalizeSub2ApiGroupNamesForUi(selectedNames);
  sub2ApiGroupSummary.textContent = `已选 ${normalized.length} 个分组`;
}

function renderSub2ApiGroupOptions(groups = sub2ApiAvailableGroups, selectedNames = getSelectedSub2ApiGroupNamesFromState()) {
  if (!sub2ApiGroupList) {
    return;
  }

  sub2ApiAvailableGroups = normalizeSub2ApiGroupRecords(groups);
  const { options, selectedNames: effectiveSelectedNames } = buildSub2ApiGroupOptionModels(
    sub2ApiAvailableGroups,
    selectedNames
  );
  const selectedSet = new Set(effectiveSelectedNames.map((name) => name.toLowerCase()));
  sub2ApiGroupList.innerHTML = '';

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'sub2api-group-empty';
    empty.textContent = '请先填写 SUB2API 地址、账号和密码，然后点击刷新。';
    sub2ApiGroupList.appendChild(empty);
    updateSub2ApiGroupSummary([]);
    updateSub2ApiGroupActionState();
    return;
  }

  options.forEach((group) => {
    const option = document.createElement('label');
    option.className = 'sub2api-group-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = group.name;
    checkbox.checked = selectedSet.has(group.name.toLowerCase());
    checkbox.disabled = sub2ApiGroupLoadInFlight;

    const name = document.createElement('span');
    name.className = 'sub2api-group-name';
    name.textContent = group.name;

    option.appendChild(checkbox);
    option.appendChild(name);

    if (Number.isFinite(group.accountCount) && group.accountCount !== null) {
      const meta = document.createElement('span');
      meta.className = 'sub2api-group-meta';
      meta.textContent = `${group.accountCount}`;
      option.appendChild(meta);
    }

    sub2ApiGroupList.appendChild(option);
  });

  updateSub2ApiGroupSummary(effectiveSelectedNames);
  updateSub2ApiGroupActionState();
}

function updateSub2ApiGroupActionState() {
  if (btnRefreshSub2ApiGroups) {
    btnRefreshSub2ApiGroups.disabled = sub2ApiGroupLoadInFlight || selectPanelMode.value !== 'sub2api';
    btnRefreshSub2ApiGroups.textContent = sub2ApiGroupLoadInFlight ? '加载中' : '刷新';
  }

  if (!sub2ApiGroupList) {
    return;
  }

  sub2ApiGroupList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.disabled = sub2ApiGroupLoadInFlight;
  });
}

async function refreshSub2ApiGroupOptions(options = {}) {
  const {
    silent = false,
    selectedNames = undefined,
  } = options;

  const nextSelectedNames = selectedNames !== undefined
    ? normalizeSub2ApiGroupNamesForUi(selectedNames)
    : getSelectedSub2ApiGroupNames();

  if (selectPanelMode.value !== 'sub2api') {
    renderSub2ApiGroupOptions(sub2ApiAvailableGroups, nextSelectedNames);
    return [];
  }

  const sub2apiUrl = inputSub2ApiUrl.value.trim();
  const sub2apiEmail = inputSub2ApiEmail.value.trim();
  const sub2apiPassword = inputSub2ApiPassword.value;

  if (!sub2apiUrl || !sub2apiEmail || !sub2apiPassword) {
    renderSub2ApiGroupOptions(sub2ApiAvailableGroups, nextSelectedNames);
    if (!silent) {
      showToast('请先填写 SUB2API 地址、账号和密码。', 'warn');
    }
    return [];
  }

  const requestId = ++sub2ApiGroupLoadSequence;
  sub2ApiGroupLoadInFlight = true;
  updateSub2ApiGroupActionState();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_SUB2API_GROUPS',
      source: 'sidepanel',
      payload: {
        sub2apiUrl,
        sub2apiEmail,
        sub2apiPassword,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    const groups = normalizeSub2ApiGroupRecords(response?.groups || []);
    if (requestId !== sub2ApiGroupLoadSequence) {
      return sub2ApiAvailableGroups;
    }

    renderSub2ApiGroupOptions(groups, nextSelectedNames);
    if (!silent) {
      showToast(`已加载 ${groups.length} 个 SUB2API 分组`, 'success', 1800);
    }
    return groups;
  } catch (err) {
    if (requestId === sub2ApiGroupLoadSequence) {
      renderSub2ApiGroupOptions(sub2ApiAvailableGroups, nextSelectedNames);
    }
    if (!silent) {
      showToast(`加载 SUB2API 分组失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    if (requestId === sub2ApiGroupLoadSequence) {
      sub2ApiGroupLoadInFlight = false;
      updateSub2ApiGroupActionState();
    }
  }
}

function normalizeCloudflareDomainValue(value = '') {
  let normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  normalized = normalized.replace(/^@+/, '');
  normalized = normalized.replace(/^https?:\/\//, '');
  normalized = normalized.replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizeCloudflareDomains(values = []) {
  const seen = new Set();
  const domains = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCloudflareDomainValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    domains.push(normalized);
  }
  return domains;
}

function normalizeMoemailDomainValueForUi(rawValue = '') {
  if (typeof window !== 'undefined' && typeof window.MoemailUtils?.normalizeMoemailDomain === 'function') {
    return window.MoemailUtils.normalizeMoemailDomain(rawValue);
  }

  let value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^@+/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
    return '';
  }
  return value;
}

function normalizeMoemailDomainList(values = []) {
  const seen = new Set();
  const domains = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeMoemailDomainValueForUi(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    domains.push(normalized);
  }
  return domains;
}

function buildMoemailDomainOptionModels(domains = [], preferredDomain = '') {
  const normalizedDomains = normalizeMoemailDomainList(domains);
  const normalizedPreferred = normalizeMoemailDomainValueForUi(preferredDomain);
  const options = [{ value: '', label: '随机域名' }];

  normalizedDomains.forEach((domain) => {
    options.push({ value: domain, label: domain });
  });

  if (normalizedPreferred && !normalizedDomains.includes(normalizedPreferred)) {
    options.push({
      value: normalizedPreferred,
      label: `${normalizedPreferred}（已保存）`,
    });
  }

  return {
    options,
    selectedValue: normalizedPreferred || '',
  };
}

function getSelectedMoemailDomainValue() {
  return normalizeMoemailDomainValueForUi(selectMoemailDomain?.value || '');
}

function resolveMoemailDomainRefreshPreferred(preferredDomain, selectedDomain, savedDomain) {
  if (preferredDomain !== undefined) {
    return normalizeMoemailDomainValueForUi(preferredDomain);
  }

  if (selectedDomain !== undefined) {
    return normalizeMoemailDomainValueForUi(selectedDomain);
  }

  return normalizeMoemailDomainValueForUi(savedDomain || '');
}

function renderMoemailDomainOptions(domains = moemailAvailableDomains, preferredDomain = '') {
  if (!selectMoemailDomain) {
    return;
  }

  moemailAvailableDomains = normalizeMoemailDomainList(domains);
  const { options, selectedValue } = buildMoemailDomainOptionModels(moemailAvailableDomains, preferredDomain);
  selectMoemailDomain.innerHTML = '';

  options.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.value;
    option.textContent = model.label;
    selectMoemailDomain.appendChild(option);
  });

  selectMoemailDomain.value = options.some((model) => model.value === selectedValue)
    ? selectedValue
    : '';
}

function updateMoemailDomainActionState() {
  if (!selectMoemailDomain) {
    return;
  }

  selectMoemailDomain.disabled = moemailDomainLoadInFlight;
  if (btnRefreshMoemailDomains) {
    btnRefreshMoemailDomains.disabled = moemailDomainLoadInFlight || selectMailProvider.value !== 'moemail';
    btnRefreshMoemailDomains.textContent = moemailDomainLoadInFlight ? '加载中' : '刷新';
  }
}

async function refreshMoemailDomainOptions(options = {}) {
  const {
    silent = false,
    preferredDomain = undefined,
  } = options;

  const nextPreferredDomain = resolveMoemailDomainRefreshPreferred(
    preferredDomain,
    selectMoemailDomain ? selectMoemailDomain.value : undefined,
    latestState?.moemailDomain,
  );

  if (selectMailProvider.value !== 'moemail') {
    renderMoemailDomainOptions([], nextPreferredDomain);
    updateMoemailDomainActionState();
    return [];
  }

  const apiKey = inputMoemailApiKey.value.trim();
  if (!apiKey) {
    moemailAvailableDomains = [];
    renderMoemailDomainOptions([], nextPreferredDomain);
    updateMoemailDomainActionState();
    if (!silent) {
      showToast('请先填写 MoeMail API Key。', 'warn');
    }
    return [];
  }

  const requestId = ++moemailDomainLoadSequence;
  moemailDomainLoadInFlight = true;
  updateMoemailDomainActionState();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_MOEMAIL_DOMAINS',
      source: 'sidepanel',
      payload: {
        moemailApiBaseUrl: inputMoemailBaseUrl.value.trim(),
        moemailApiKey: apiKey,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }
    const domains = normalizeMoemailDomainList(response?.domains || []);

    if (requestId !== moemailDomainLoadSequence) {
      return moemailAvailableDomains;
    }

    renderMoemailDomainOptions(domains, nextPreferredDomain);
    if (!silent) {
      showToast(`已加载 ${domains.length} 个 MoeMail 域名`, 'success', 1800);
    }
    return domains;
  } catch (err) {
    if (requestId === moemailDomainLoadSequence) {
      moemailAvailableDomains = [];
      renderMoemailDomainOptions([], nextPreferredDomain);
    }
    if (!silent) {
      showToast(`加载 MoeMail 域名失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    if (requestId === moemailDomainLoadSequence) {
      moemailDomainLoadInFlight = false;
      updateMoemailDomainActionState();
    }
  }
}

function getCloudflareDomainsFromState() {
  const domains = normalizeCloudflareDomains(latestState?.cloudflareDomains || []);
  const activeDomain = normalizeCloudflareDomainValue(latestState?.cloudflareDomain || '');
  if (activeDomain && !domains.includes(activeDomain)) {
    domains.unshift(activeDomain);
  }
  return { domains, activeDomain: activeDomain || domains[0] || '' };
}

function renderCloudflareDomainOptions(preferredDomain = '') {
  const preferred = normalizeCloudflareDomainValue(preferredDomain);
  const { domains, activeDomain } = getCloudflareDomainsFromState();
  const selected = preferred || activeDomain;

  selectCfDomain.innerHTML = '';
  if (domains.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请先添加域名';
    selectCfDomain.appendChild(option);
    selectCfDomain.disabled = true;
    selectCfDomain.value = '';
    return;
  }

  for (const domain of domains) {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    selectCfDomain.appendChild(option);
  }
  selectCfDomain.disabled = false;
  selectCfDomain.value = domains.includes(selected) ? selected : domains[0];
}

function setCloudflareDomainEditMode(editing, options = {}) {
  const { clearInput = false } = options;
  cloudflareDomainEditMode = Boolean(editing);
  selectCfDomain.style.display = cloudflareDomainEditMode ? 'none' : '';
  inputCfDomain.style.display = cloudflareDomainEditMode ? '' : 'none';
  btnCfDomainMode.textContent = cloudflareDomainEditMode ? '保存' : '添加';
  if (cloudflareDomainEditMode) {
    if (clearInput) {
      inputCfDomain.value = '';
    }
    inputCfDomain.focus();
  } else if (clearInput) {
    inputCfDomain.value = '';
  }
}

function collectSettingsPayload() {
  const { domains, activeDomain } = getCloudflareDomainsFromState();
  const selectedCloudflareDomain = normalizeCloudflareDomainValue(
    !cloudflareDomainEditMode ? selectCfDomain.value : activeDomain
  ) || activeDomain;
  return {
    panelMode: selectPanelMode.value,
    vpsUrl: inputVpsUrl.value.trim(),
    vpsPassword: inputVpsPassword.value,
    localCpaStep9Mode: getSelectedLocalCpaStep9Mode(),
    sub2apiUrl: inputSub2ApiUrl.value.trim(),
    sub2apiEmail: inputSub2ApiEmail.value.trim(),
    sub2apiPassword: inputSub2ApiPassword.value,
    sub2apiGroupNames: getSelectedSub2ApiGroupNames(),
    customPassword: inputPassword.value,
    mailProvider: selectMailProvider.value,
    emailGenerator: selectEmailGenerator.value,
    icloudHostPreference: selectIcloudHostPreference?.value || 'auto',
    emailPrefix: inputEmailPrefix.value.trim(),
    mailpitApiBaseUrl: inputMailpitBaseUrl.value.trim(),
    mailpitUsername: inputMailpitUsername.value.trim(),
    mailpitPassword: inputMailpitPassword.value.trim(),
    mailpitDomain: inputMailpitDomain.value.trim(),
    inbucketHost: inputInbucketHost.value.trim(),
    inbucketMailbox: inputInbucketMailbox.value.trim(),
    moemailApiBaseUrl: inputMoemailBaseUrl.value.trim(),
    moemailApiKey: inputMoemailApiKey.value.trim(),
    moemailDomain: getSelectedMoemailDomainValue(),
    cloudflareDomain: selectedCloudflareDomain,
    cloudflareDomains: domains,
    autoRunSkipFailures: inputAutoSkipFailures.checked,
    autoRunFallbackThreadIntervalMinutes: normalizeAutoRunThreadIntervalMinutes(inputAutoSkipFailuresThreadIntervalMinutes.value),
    autoRunDelayEnabled: inputAutoDelayEnabled.checked,
    autoRunDelayMinutes: normalizeAutoDelayMinutes(inputAutoDelayMinutes.value),
    autoStepDelaySeconds: normalizeAutoStepDelaySeconds(inputAutoStepDelaySeconds.value),
  };
}

function normalizeLocalCpaStep9Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'bypass'
    ? 'bypass'
    : DEFAULT_LOCAL_CPA_STEP9_MODE;
}

function getSelectedLocalCpaStep9Mode() {
  const activeButton = localCpaStep9ModeButtons.find((button) => button.classList.contains('is-active'));
  return normalizeLocalCpaStep9Mode(activeButton?.dataset.localCpaStep9Mode);
}

function setLocalCpaStep9Mode(mode) {
  const resolvedMode = normalizeLocalCpaStep9Mode(mode);
  localCpaStep9ModeButtons.forEach((button) => {
    const active = button.dataset.localCpaStep9Mode === resolvedMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setSettingsCardLocked(locked) {
  if (!settingsCard) {
    return;
  }
  settingsCard.classList.toggle('is-locked', locked);
  settingsCard.toggleAttribute('inert', locked);
}

async function setRuntimeEmailState(email) {
  const normalizedEmail = String(email || '').trim() || null;
  const response = await chrome.runtime.sendMessage({
    type: 'SET_EMAIL_STATE',
    source: 'sidepanel',
    payload: { email: normalizedEmail },
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return normalizedEmail;
}

async function clearRegistrationEmail(options = {}) {
  const { silent = false } = options;
  if (!inputEmail.value.trim() && !latestState?.email) {
    return;
  }

  inputEmail.value = '';
  syncLatestState({ email: null });

  try {
    await setRuntimeEmailState(null);
  } catch (err) {
    if (!silent) {
      showToast(`清空邮箱失败：${err.message}`, 'error');
    }
    throw err;
  }
}

function markSettingsDirty(isDirty = true) {
  settingsDirty = isDirty;
  updateSaveButtonState();
}

function getSaveButtonPresentation(isDirty = settingsDirty, saveInFlight = settingsSaveInFlight) {
  if (saveInFlight) {
    return {
      disabled: true,
      label: '保存中',
      title: '正在保存配置',
    };
  }

  if (isDirty) {
    return {
      disabled: false,
      label: '保存',
      title: '保存当前配置',
    };
  }

  return {
    disabled: false,
    label: '保存',
    title: '当前配置已保存',
  };
}

function updateSaveButtonState() {
  const presentation = getSaveButtonPresentation(settingsDirty, settingsSaveInFlight);
  btnSaveSettings.disabled = presentation.disabled;
  updateConfigMenuControls();
  btnSaveSettings.textContent = presentation.label;
  btnSaveSettings.title = presentation.title;
}

function scheduleSettingsAutoSave() {
  clearTimeout(settingsAutoSaveTimer);
  settingsAutoSaveTimer = setTimeout(() => {
    saveSettings({ silent: true }).catch(() => { });
  }, 500);
}

async function saveSettings(options = {}) {
  const { silent = false } = options;
  clearTimeout(settingsAutoSaveTimer);

  if (!settingsDirty && !settingsSaveInFlight && silent) {
    return;
  }

  const payload = collectSettingsPayload();
  settingsSaveInFlight = true;
  updateSaveButtonState();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTING',
      source: 'sidepanel',
      payload,
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    if (response?.state) {
      applySettingsState(response.state);
    } else {
      syncLatestState(payload);
      markSettingsDirty(false);
      updatePanelModeUI();
      updateMailProviderUI();
      updateButtonStates();
    }
    if (!silent) {
      showToast('配置已保存', 'success', 1800);
    }
  } catch (err) {
    markSettingsDirty(true);
    if (!silent) {
      showToast(`保存失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    settingsSaveInFlight = false;
    updateSaveButtonState();
  }
}

function applyAutoRunStatus(payload = currentAutoRun) {
  syncAutoRunState(payload);
  const runLabel = getAutoRunLabel(currentAutoRun);
  const locked = isAutoRunLockedPhase();
  const paused = isAutoRunPausedPhase();
  const scheduled = isAutoRunScheduledPhase();
  const settingsCardLocked = scheduled || locked;

  setSettingsCardLocked(settingsCardLocked);

  inputRunCount.disabled = currentAutoRun.autoRunning;
  btnAutoRun.disabled = currentAutoRun.autoRunning;
  btnFetchEmail.disabled = locked
    || usesGeneratedAliasMailProvider(selectMailProvider.value)
    || isCustomMailProvider();
  inputEmail.disabled = locked;
  inputAutoSkipFailures.disabled = scheduled;

  if (currentAutoRun.totalRuns > 0) {
    inputRunCount.value = String(currentAutoRun.totalRuns);
  }

  switch (currentAutoRun.phase) {
    case 'scheduled':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `已计划${runLabel}`;
      break;
    case 'waiting_step':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `等待中${runLabel}`;
      break;
    case 'waiting_email':
      autoContinueBar.style.display = 'flex';
      btnAutoRun.innerHTML = `已暂停${runLabel}`;
      break;
    case 'running':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `运行中${runLabel}`;
      break;
    case 'retrying':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `重试中${runLabel}`;
      break;
    case 'waiting_interval':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `等待中${runLabel}`;
      break;
    default:
      autoContinueBar.style.display = 'none';
      setDefaultAutoRunButton();
      inputEmail.disabled = false;
      if (!locked) {
        btnFetchEmail.disabled = usesGeneratedAliasMailProvider(selectMailProvider.value)
          || isCustomMailProvider();
      }
      break;
  }

  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  syncScheduledCountdownTicker();
  updateStopButtonState(scheduled || paused || locked || Object.values(getStepStatuses()).some(status => status === 'running'));
  updateConfigMenuControls();
}

function initializeManualStepActions() {
  document.querySelectorAll('.step-row').forEach((row) => {
    const step = Number(row.dataset.step);
    const statusEl = row.querySelector('.step-status');
    if (!statusEl) return;

    const actions = document.createElement('div');
    actions.className = 'step-actions';

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'step-manual-btn';
    manualBtn.dataset.step = String(step);
    manualBtn.title = '跳过此步';
    manualBtn.setAttribute('aria-label', `跳过步骤 ${step}`);
    manualBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';
    manualBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await handleSkipStep(step);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    statusEl.parentNode.replaceChild(actions, statusEl);
    actions.appendChild(manualBtn);
    actions.appendChild(statusEl);
  });
}

// ============================================================
// State Restore on load
// ============================================================

function applySettingsState(state) {
  syncLatestState(state);
  syncAutoRunState(state);

  inputEmail.value = state?.email || '';
  syncPasswordField(state || {});
  inputVpsUrl.value = state?.vpsUrl || '';
  inputVpsPassword.value = state?.vpsPassword || '';
  setLocalCpaStep9Mode(state?.localCpaStep9Mode);
  selectPanelMode.value = state?.panelMode || 'cpa';
  inputSub2ApiUrl.value = state?.sub2apiUrl || '';
  inputSub2ApiEmail.value = state?.sub2apiEmail || '';
  inputSub2ApiPassword.value = state?.sub2apiPassword || '';
  renderSub2ApiGroupOptions(sub2ApiAvailableGroups, state?.sub2apiGroupNames || DEFAULT_SUB2API_GROUP_NAMES);
  const restoredMailProvider = isCustomMailProvider(state?.mailProvider)
    || ['moemail', 'mailpit', '163', '163-vip', 'gmail', 'qq', 'inbucket', '2925'].includes(String(state?.mailProvider || '').trim())
    ? String(state?.mailProvider || '163').trim()
    : (String(state?.emailGenerator || '').trim().toLowerCase() === 'custom'
      || String(state?.emailGenerator || '').trim().toLowerCase() === 'manual'
      ? 'custom'
      : '163');
  selectMailProvider.value = restoredMailProvider;
  const restoredEmailGenerator = String(state?.emailGenerator || '').trim().toLowerCase();
  selectEmailGenerator.value = restoredEmailGenerator === 'cloudflare'
    ? 'cloudflare'
    : (restoredEmailGenerator === 'icloud' ? 'icloud' : 'duck');
  if (selectIcloudHostPreference) {
    selectIcloudHostPreference.value = String(state?.icloudHostPreference || 'auto').trim().toLowerCase() || 'auto';
  }
  inputEmailPrefix.value = state?.emailPrefix || '';
  inputMailpitBaseUrl.value = state?.mailpitApiBaseUrl || '';
  inputMailpitUsername.value = state?.mailpitUsername || '';
  inputMailpitPassword.value = state?.mailpitPassword || '';
  inputMailpitDomain.value = state?.mailpitDomain || '';
  inputInbucketHost.value = state?.inbucketHost || '';
  inputInbucketMailbox.value = state?.inbucketMailbox || '';
  inputMoemailBaseUrl.value = state?.moemailApiBaseUrl || DEFAULT_MOEMAIL_API_BASE_URL;
  inputMoemailApiKey.value = state?.moemailApiKey || '';
  renderMoemailDomainOptions(moemailAvailableDomains, state?.moemailDomain || '');
  renderCloudflareDomainOptions(state?.cloudflareDomain || '');
  setCloudflareDomainEditMode(false, { clearInput: true });
  inputAutoSkipFailures.checked = Boolean(state?.autoRunSkipFailures);
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(normalizeAutoRunThreadIntervalMinutes(state?.autoRunFallbackThreadIntervalMinutes));
  inputAutoDelayEnabled.checked = Boolean(state?.autoRunDelayEnabled);
  inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(state?.autoRunDelayMinutes));
  inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(state?.autoStepDelaySeconds);
  if (state?.autoRunTotalRuns) {
    inputRunCount.value = String(state.autoRunTotalRuns);
  }

  applyAutoRunStatus(state);
  markSettingsDirty(false);
  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  updatePanelModeUI();
  updateMailProviderUI();
  updateButtonStates();
}

async function restoreState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    applySettingsState(state);
    loadAccounts({ silent: true }).catch(() => { });
    if (String(state?.emailGenerator || '').trim().toLowerCase() === 'icloud') {
      refreshIcloudAliases({ silent: true }).catch(() => { });
    }
    if (String(state?.panelMode || '').trim() === 'sub2api') {
      refreshSub2ApiGroupOptions({
        silent: true,
        selectedNames: state?.sub2apiGroupNames || DEFAULT_SUB2API_GROUP_NAMES,
      }).catch(() => { });
    }
    if (String(state?.mailProvider || '').trim() === 'moemail') {
      refreshMoemailDomainOptions({
        silent: true,
        preferredDomain: state?.moemailDomain || '',
      }).catch(() => { });
    }

    if (state.oauthUrl) {
      displayOauthUrl.textContent = state.oauthUrl;
      displayOauthUrl.classList.add('has-value');
    }
    if (state.localhostUrl) {
      displayLocalhostUrl.textContent = state.localhostUrl;
      displayLocalhostUrl.classList.add('has-value');
    }
    if (state.stepStatuses) {
      for (const [step, status] of Object.entries(state.stepStatuses)) {
        updateStepUI(Number(step), status);
      }
    }

    if (state.logs) {
      for (const entry of state.logs) {
        appendLog(entry);
      }
    }

    updateStatusDisplay(latestState);
    updateProgressCounter();
  } catch (err) {
    console.error('Failed to restore state:', err);
  }
}

function openExternalUrl(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) {
    return;
  }

  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: targetUrl, active: true }).catch(() => {
      window.open(targetUrl, '_blank', 'noopener');
    });
    return;
  }

  window.open(targetUrl, '_blank', 'noopener');
}

function createUpdateNoteList(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'update-release-empty';
    empty.textContent = '该版本未提供可解析的更新说明，请查看完整更新日志。';
    return empty;
  }

  const list = document.createElement('ul');
  list.className = 'update-release-notes';

  notes.forEach((note) => {
    const item = document.createElement('li');
    item.textContent = note;
    list.appendChild(item);
  });

  return list;
}

function renderUpdateReleaseList(releases = []) {
  if (!updateReleaseList) {
    return;
  }

  updateReleaseList.innerHTML = '';

  releases.forEach((release) => {
    const item = document.createElement('article');
    item.className = 'update-release-item';

    const head = document.createElement('div');
    head.className = 'update-release-head';

    const titleRow = document.createElement('div');
    titleRow.className = 'update-release-title-row';

    const version = document.createElement('span');
    version.className = 'update-release-version';
    version.textContent = `v${release.version}`;
    titleRow.appendChild(version);

    if (release.title) {
      const name = document.createElement('span');
      name.className = 'update-release-name';
      name.textContent = release.title;
      titleRow.appendChild(name);
    }

    head.appendChild(titleRow);

    const publishedAt = sidepanelUpdateService?.formatReleaseDate?.(release.publishedAt) || '';
    if (publishedAt) {
      const date = document.createElement('span');
      date.className = 'update-release-date';
      date.textContent = publishedAt;
      head.appendChild(date);
    }

    item.appendChild(head);
    item.appendChild(createUpdateNoteList(release.notes));
    updateReleaseList.appendChild(item);
  });
}

function resetUpdateCard() {
  if (updateSection) {
    updateSection.hidden = true;
  }
  if (updateCardVersion) {
    updateCardVersion.textContent = '';
  }
  if (updateCardSummary) {
    updateCardSummary.textContent = '';
  }
  if (updateReleaseList) {
    updateReleaseList.innerHTML = '';
  }
  if (btnOpenRelease) {
    btnOpenRelease.hidden = true;
    btnOpenRelease.onclick = null;
  }
}

function renderReleaseSnapshot(snapshot) {
  currentReleaseSnapshot = snapshot;

  if (!extensionUpdateStatus || !extensionVersionMeta) {
    return;
  }

  extensionUpdateStatus.classList.remove('is-update-available', 'is-check-failed', 'is-version-label');

  const localVersionText = snapshot?.localVersion ? `v${snapshot.localVersion}` : '';
  const logUrl = snapshot?.logUrl || snapshot?.releasesPageUrl || sidepanelUpdateService?.releasesPageUrl || '';

  if (btnReleaseLog) {
    btnReleaseLog.onclick = () => openExternalUrl(logUrl);
    btnReleaseLog.hidden = true;
  }
  extensionVersionMeta.hidden = false;
  extensionVersionMeta.textContent = `构建 ${BUILD_SIGNATURE}`;

  switch (snapshot?.status) {
    case 'update-available': {
      extensionUpdateStatus.textContent = '有更新';
      extensionUpdateStatus.classList.add('is-update-available');
      if (btnReleaseLog) {
        btnReleaseLog.hidden = false;
      }

      if (updateSection) {
        updateSection.hidden = false;
      }
      if (updateCardVersion) {
        updateCardVersion.textContent = `最新版本 v${snapshot.latestVersion}`;
      }
      if (updateCardSummary) {
        const updateCount = Array.isArray(snapshot.newerReleases) ? snapshot.newerReleases.length : 0;
        updateCardSummary.textContent = updateCount > 1
          ? `当前 ${localVersionText}，共有 ${updateCount} 个新版本可更新。`
          : `当前 ${localVersionText}，可更新到 v${snapshot.latestVersion}。`;
      }
      renderUpdateReleaseList(snapshot.newerReleases || []);
      if (btnOpenRelease) {
        btnOpenRelease.hidden = false;
        btnOpenRelease.textContent = '前往更新';
        btnOpenRelease.onclick = () => openExternalUrl(logUrl);
      }
      break;
    }

    case 'latest': {
      extensionUpdateStatus.textContent = localVersionText || 'v0.0.0';
      extensionUpdateStatus.classList.add('is-version-label');
      resetUpdateCard();
      break;
    }

    case 'empty': {
      extensionUpdateStatus.textContent = localVersionText || 'v0.0.0';
      extensionUpdateStatus.classList.add('is-version-label');
      resetUpdateCard();
      break;
    }

    case 'error':
    default: {
      extensionUpdateStatus.textContent = localVersionText || 'v0.0.0';
      extensionUpdateStatus.classList.add('is-version-label', 'is-check-failed');
      extensionVersionMeta.textContent = `构建 ${BUILD_SIGNATURE} | ${snapshot?.errorMessage || 'GitHub Releases 检查失败'}`;
      extensionVersionMeta.hidden = false;
      resetUpdateCard();
      break;
    }
  }
}

async function initializeReleaseInfo() {
  const fallbackReleaseUrl = sidepanelUpdateService?.releasesPageUrl || 'https://github.com/QLHazyCoder/codex-oauth-automation-extension/releases';

  if (btnReleaseLog) {
    btnReleaseLog.onclick = () => openExternalUrl(currentReleaseSnapshot?.logUrl || fallbackReleaseUrl);
  }

  if (!extensionUpdateStatus || !extensionVersionMeta) {
    return;
  }

  const localVersion = sidepanelUpdateService?.stripVersionPrefix?.(chrome.runtime.getManifest()?.version || '') || '';
  extensionUpdateStatus.textContent = localVersion ? `v${localVersion}` : 'v0.0.0';
  extensionUpdateStatus.classList.remove('is-update-available', 'is-check-failed');
  extensionUpdateStatus.classList.add('is-version-label');
  extensionVersionMeta.hidden = false;
  extensionVersionMeta.textContent = `构建 ${BUILD_SIGNATURE}`;
  if (btnReleaseLog) {
    btnReleaseLog.hidden = true;
  }
  resetUpdateCard();

  if (!sidepanelUpdateService) {
    extensionVersionMeta.textContent = `构建 ${BUILD_SIGNATURE} | 更新检查服务不可用`;
    extensionVersionMeta.hidden = false;
    return;
  }

  const snapshot = await sidepanelUpdateService.getReleaseSnapshot();
  renderReleaseSnapshot(snapshot);
}

function syncPasswordField(state) {
  inputPassword.value = state.customPassword || state.password || '';
}

function isCustomMailProvider(provider = selectMailProvider.value) {
  return String(provider || '').trim().toLowerCase() === 'custom';
}

function getSelectedEmailGenerator() {
  const generator = String(selectEmailGenerator.value || '').trim().toLowerCase();
  if (generator === 'cloudflare') {
    return 'cloudflare';
  }
  if (generator === 'icloud') {
    return 'icloud';
  }
  return 'duck';
}

function getEmailGeneratorUiCopy() {
  const provider = String(selectMailProvider.value || '').trim().toLowerCase();
  if (provider === 'moemail') {
    return {
      buttonLabel: '生成',
      placeholder: '点击生成 MoeMail 邮箱，或手动粘贴已有邮箱',
      successVerb: '生成',
      label: 'MoeMail 邮箱',
    };
  }
  if (provider === 'mailpit') {
    return {
      buttonLabel: '生成',
      placeholder: '点击生成 Mailpit 邮箱，或手动粘贴已有邮箱',
      successVerb: '生成',
      label: 'Mailpit 邮箱',
    };
  }

  if (getSelectedEmailGenerator() === 'cloudflare') {
    return {
      buttonLabel: '生成',
      placeholder: '点击生成 Cloudflare 邮箱，或手动粘贴邮箱',
      successVerb: '生成',
      label: 'Cloudflare 邮箱',
    };
  }
  if (getSelectedEmailGenerator() === 'icloud') {
    return {
      buttonLabel: '生成',
      placeholder: '点击生成 iCloud Hide My Email，或手动粘贴邮箱',
      successVerb: '生成',
      label: 'iCloud 邮箱',
    };
  }

  return {
    buttonLabel: '获取',
    placeholder: '点击获取 DuckDuckGo 邮箱，或手动粘贴邮箱',
    successVerb: '获取',
    label: 'Duck 邮箱',
  };
}

function getCustomMailProviderUiCopy() {
  return {
    buttonLabel: '自定义邮箱',
    placeholder: '请填写本轮要使用的注册邮箱',
    successVerb: '使用',
    label: '自定义邮箱',
  };
}

function getCustomVerificationPromptCopy(step) {
  const verificationLabel = step === 4 ? '注册验证码' : '登录验证码';
  return {
    title: `手动处理${verificationLabel}`,
    message: `当前邮箱服务为“自定义邮箱”。请先在页面中手动输入${verificationLabel}，并确认已经进入下一页面后，再点击确认。`,
    alert: {
      text: `点击确认后会跳过步骤 ${step}。`,
      tone: 'danger',
    },
  };
}

function getMailProviderLoginConfig(provider = selectMailProvider.value) {
  const normalizedProvider = String(provider || '').trim();
  if (normalizedProvider === 'moemail') {
    return { label: 'MoeMail' };
  }
  if (normalizedProvider === 'mailpit') {
    return { label: 'Mailpit' };
  }
  return MAIL_PROVIDER_LOGIN_CONFIGS[normalizedProvider] || null;
}

function getMailProviderLoginUrl(provider = selectMailProvider.value) {
  const normalizedProvider = String(provider || '').trim();
  if (normalizedProvider === 'moemail') {
    const rawBaseUrl = String(
      inputMoemailBaseUrl?.value
      || latestState?.moemailApiBaseUrl
      || DEFAULT_MOEMAIL_API_BASE_URL
    ).trim();
    if (!rawBaseUrl) {
      return '';
    }
    if (typeof normalizeMoemailApiBaseUrlValue === 'function') {
      try {
        return normalizeMoemailApiBaseUrlValue(rawBaseUrl);
      } catch {
        return '';
      }
    }
    return rawBaseUrl.replace(/\/+$/, '');
  }
  if (normalizedProvider === 'mailpit') {
    const rawBaseUrl = String(
      inputMailpitBaseUrl?.value
      || latestState?.mailpitApiBaseUrl
      || ''
    ).trim();
    if (!rawBaseUrl) {
      return '';
    }
    if (typeof normalizeMailpitApiBaseUrlValue === 'function') {
      try {
        return normalizeMailpitApiBaseUrlValue(rawBaseUrl);
      } catch {
        return '';
      }
    }
    return rawBaseUrl.replace(/\/+$/, '');
  }
  const config = getMailProviderLoginConfig(provider);
  const url = String(config?.url || '').trim();
  return url ? url : '';
}

function isCurrentEmailManagedByMoemail(state = latestState) {
  return Boolean(String(state?.moemailEmailId || '').trim());
}

function isCurrentEmailManagedByMailpit(state = latestState) {
  const email = String(state?.email || '').trim().toLowerCase();
  const domain = typeof normalizeMailpitDomainValue === 'function'
    ? normalizeMailpitDomainValue(state?.mailpitDomain || '')
    : String(state?.mailpitDomain || '').trim().toLowerCase();
  return Boolean(email && domain && email.endsWith(`@${domain}`));
}

function isCurrentEmailManagedByGeneratedAlias(provider = latestState?.mailProvider, state = latestState) {
  const normalizedProvider = String(provider || '').trim();
  if (!usesGeneratedAliasMailProvider(normalizedProvider)) {
    return false;
  }

  const inputEmailValue = String(inputEmail.value || '').trim().toLowerCase();
  const stateEmailValue = String(state?.email || '').trim().toLowerCase();

  if (normalizedProvider === '2925') {
    return inputEmailValue.endsWith('@2925.com') || stateEmailValue.endsWith('@2925.com');
  }

  return false;
}

function updateMailLoginButtonState() {
  if (!btnMailLogin) {
    return;
  }

  const config = getMailProviderLoginConfig();
  const loginUrl = getMailProviderLoginUrl();
  btnMailLogin.disabled = !loginUrl;
  btnMailLogin.title = loginUrl ? `打开 ${config.label} 登录页` : '当前邮箱服务没有可跳转的登录页';
}

function updateMailProviderUI() {
  const use2925 = selectMailProvider.value === '2925';
  const useMoemail = selectMailProvider.value === 'moemail';
  const useMailpit = selectMailProvider.value === 'mailpit';
  const useApiMailbox = useMoemail || useMailpit;
  const useGeneratedAlias = usesGeneratedAliasMailProvider(selectMailProvider.value);
  const useInbucket = selectMailProvider.value === 'inbucket';
  const useCustomEmail = isCustomMailProvider();
  const useEmailGenerator = !useGeneratedAlias && !useCustomEmail && !useApiMailbox;
  const useIcloudGenerator = useEmailGenerator && getSelectedEmailGenerator() === 'icloud';
  updateMailLoginButtonState();
  if (icloudSection) {
    icloudSection.style.display = useIcloudGenerator ? '' : 'none';
  }
  rowEmailPrefix.style.display = useGeneratedAlias || useApiMailbox ? '' : 'none';
  rowInbucketHost.style.display = useInbucket ? '' : 'none';
  rowInbucketMailbox.style.display = useInbucket ? '' : 'none';
  if (rowMoemailBaseUrl) {
    rowMoemailBaseUrl.style.display = useMoemail ? '' : 'none';
  }
  if (rowMoemailApiKey) {
    rowMoemailApiKey.style.display = useMoemail ? '' : 'none';
  }
  if (rowMoemailDomain) {
    rowMoemailDomain.style.display = useMoemail ? '' : 'none';
  }
  if (rowMailpitBaseUrl) {
    rowMailpitBaseUrl.style.display = useMailpit ? '' : 'none';
  }
  if (rowMailpitUsername) {
    rowMailpitUsername.style.display = useMailpit ? '' : 'none';
  }
  if (rowMailpitPassword) {
    rowMailpitPassword.style.display = useMailpit ? '' : 'none';
  }
  if (rowMailpitDomain) {
    rowMailpitDomain.style.display = useMailpit ? '' : 'none';
  }
  updateMoemailDomainActionState();
  const useCloudflare = selectEmailGenerator.value === 'cloudflare';
  const showCloudflareDomain = useEmailGenerator && useCloudflare;
  if (rowIcloudHostPreference) {
    rowIcloudHostPreference.style.display = useIcloudGenerator ? '' : 'none';
  }
  if (rowEmailGenerator) {
    rowEmailGenerator.style.display = useEmailGenerator ? '' : 'none';
  }
  rowCfDomain.style.display = showCloudflareDomain ? '' : 'none';
  const { domains } = getCloudflareDomainsFromState();
  if (showCloudflareDomain) {
    setCloudflareDomainEditMode(cloudflareDomainEditMode || domains.length === 0, { clearInput: false });
  } else {
    setCloudflareDomainEditMode(false, { clearInput: false });
  }

  labelEmailPrefix.textContent = useApiMailbox ? '邮箱前缀（可选）' : '邮箱前缀';
  inputEmailPrefix.placeholder = useApiMailbox ? '留空则随机生成' : '例如 abc';
  selectEmailGenerator.disabled = useGeneratedAlias || useCustomEmail || useApiMailbox;
  btnFetchEmail.hidden = useCustomEmail;
  inputEmail.readOnly = useGeneratedAlias;
  const uiCopy = useCustomEmail ? getCustomMailProviderUiCopy() : getEmailGeneratorUiCopy();
  inputEmail.placeholder = use2925
    ? '步骤 3 自动生成 2925 邮箱并回填'
    : uiCopy.placeholder;
  btnFetchEmail.disabled = useGeneratedAlias || useCustomEmail || isAutoRunLockedPhase();
  if (!btnFetchEmail.disabled) {
    btnFetchEmail.textContent = uiCopy.buttonLabel;
  }
  if (autoHintText) {
    autoHintText.textContent = useGeneratedAlias
      ? '步骤 3 会自动生成邮箱，无需手动获取'
      : (useMoemail
        ? '可直接生成 MoeMail 邮箱，验证码会通过 API 自动轮询'
        : (useMailpit
          ? '可直接生成 Mailpit 邮箱，验证码会通过 API 自动轮询'
          : (useIcloudGenerator
            ? '点击生成 iCloud Hide My Email；若未登录会自动打开 iCloud 登录页'
            : (useCustomEmail ? '请先填写自定义注册邮箱，成功一轮后会自动清空' : '先自动获取邮箱，或手动粘贴邮箱后再继续'))));
  }

  if (!useIcloudGenerator) {
    hideIcloudLoginHelp();
  }
}

async function saveCloudflareDomainSettings(domains, activeDomain, options = {}) {
  const { silent = false } = options;
  const normalizedDomains = normalizeCloudflareDomains(domains);
  const normalizedActiveDomain = normalizeCloudflareDomainValue(activeDomain) || normalizedDomains[0] || '';
  const payload = {
    cloudflareDomain: normalizedActiveDomain,
    cloudflareDomains: normalizedDomains,
  };

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  syncLatestState({
    ...payload,
  });
  renderCloudflareDomainOptions(normalizedActiveDomain);
  setCloudflareDomainEditMode(false, { clearInput: true });
  markSettingsDirty(false);
  updateMailProviderUI();

  if (!silent) {
    showToast('Cloudflare 域名已保存', 'success', 1800);
  }
}

function updatePanelModeUI() {
  const useSub2Api = selectPanelMode.value === 'sub2api';
  rowVpsUrl.style.display = useSub2Api ? 'none' : '';
  rowVpsPassword.style.display = useSub2Api ? 'none' : '';
  rowLocalCpaStep9Mode.style.display = useSub2Api ? 'none' : '';
  rowSub2ApiUrl.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiEmail.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiPassword.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiGroup.style.display = useSub2Api ? '' : 'none';

  const step9Btn = document.querySelector('.step-btn[data-step="9"]');
  if (step9Btn) {
    step9Btn.textContent = useSub2Api ? 'SUB2API 回调验证' : 'CPA 回调验证';
  }
  updateSub2ApiGroupActionState();
}

// ============================================================
// UI Updates
// ============================================================

function updateStepUI(step, status) {
  const statusEl = document.querySelector(`.step-status[data-step="${step}"]`);
  const row = document.querySelector(`.step-row[data-step="${step}"]`);

  syncLatestState({
    stepStatuses: {
      ...getStepStatuses(),
      [step]: status,
    },
  });

  if (statusEl) statusEl.textContent = STATUS_ICONS[status] || '';
  if (row) {
    row.className = `step-row ${status}`;
  }

  updateButtonStates();
  updateProgressCounter();
  updateConfigMenuControls();
}

function updateProgressCounter() {
  const completed = Object.values(getStepStatuses()).filter(isDoneStatus).length;
  stepsProgress.textContent = `${completed} / 10`;
}

function updateButtonStates() {
  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some(s => s === 'running');
  const autoLocked = isAutoRunLockedPhase();
  const autoScheduled = isAutoRunScheduledPhase();

  for (let step = 1; step <= 10; step++) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;

    if (anyRunning || autoLocked || autoScheduled) {
      btn.disabled = true;
    } else {
      const currentStatus = statuses[step];
      const missingPrerequisiteStep = getFirstMissingManualPrerequisite(step);
      btn.disabled = !(
        !missingPrerequisiteStep
        || currentStatus === 'failed'
        || isDoneStatus(currentStatus)
        || currentStatus === 'stopped'
      );
    }
  }

  document.querySelectorAll('.step-manual-btn').forEach((btn) => {
    const step = Number(btn.dataset.step);
    const currentStatus = statuses[step];
    if (!SKIPPABLE_STEPS.has(step) || anyRunning || autoLocked || autoScheduled || currentStatus === 'running' || isDoneStatus(currentStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = '当前不可跳过';
      return;
    }

    const missingPrerequisiteStep = getFirstMissingManualPrerequisite(step);
    if (missingPrerequisiteStep) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = `请先完成步骤 ${missingPrerequisiteStep}`;
      return;
    }

    btn.style.display = '';
    btn.disabled = false;
    btn.title = `跳过步骤 ${step}`;
  });

  btnReset.disabled = anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked;
  updateStopButtonState(anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked);
}

function updateStopButtonState(active) {
  btnStop.disabled = !active;
}

function updateStatusDisplay(state) {
  if (!state || !state.stepStatuses) return;

  statusBar.className = 'status-bar';

  const countdown = getActiveAutoRunCountdown();
  if (countdown) {
    const remainingMs = countdown.at - Date.now();
    displayStatus.textContent = remainingMs > 0
      ? `${countdown.title}，剩余 ${formatCountdown(remainingMs)}`
      : `${countdown.title}，即将结束...`;
    statusBar.classList.add(countdown.tone === 'scheduled' ? 'scheduled' : 'running');
    return;
  }

  if (isAutoRunScheduledPhase()) {
    const remainingMs = Number.isFinite(currentAutoRun.scheduledAt)
      ? currentAutoRun.scheduledAt - Date.now()
      : 0;
    displayStatus.textContent = remainingMs > 0
      ? `自动计划中，剩余 ${formatCountdown(remainingMs)}`
      : '倒计时即将结束，正在准备启动...';
    statusBar.classList.add('scheduled');
    return;
  }

  if (isAutoRunPausedPhase()) {
    displayStatus.textContent = `自动已暂停${getAutoRunLabel()}，等待邮箱后继续`;
    statusBar.classList.add('paused');
    return;
  }

  if (isAutoRunWaitingStepPhase()) {
    const runningSteps = getRunningSteps(state);
    displayStatus.textContent = runningSteps.length
      ? `自动等待步骤 ${runningSteps.join(', ')} 完成后继续${getAutoRunLabel()}`
      : `自动正在按最新进度准备继续${getAutoRunLabel()}`;
    statusBar.classList.add('running');
    return;
  }

  const running = Object.entries(state.stepStatuses).find(([, s]) => s === 'running');
  if (running) {
    displayStatus.textContent = `步骤 ${running[0]} 运行中...`;
    statusBar.classList.add('running');
    return;
  }

  if (isAutoRunLockedPhase()) {
    displayStatus.textContent = `${currentAutoRun.phase === 'retrying' ? '自动重试中' : '自动运行中'}${getAutoRunLabel()}`;
    statusBar.classList.add('running');
    return;
  }

  const failed = Object.entries(state.stepStatuses).find(([, s]) => s === 'failed');
  if (failed) {
    displayStatus.textContent = `步骤 ${failed[0]} 失败`;
    statusBar.classList.add('failed');
    return;
  }

  const stopped = Object.entries(state.stepStatuses).find(([, s]) => s === 'stopped');
  if (stopped) {
    displayStatus.textContent = `步骤 ${stopped[0]} 已停止`;
    statusBar.classList.add('stopped');
    return;
  }

  const lastCompleted = Object.entries(state.stepStatuses)
    .filter(([, s]) => isDoneStatus(s))
    .map(([k]) => Number(k))
    .sort((a, b) => b - a)[0];

  if (lastCompleted === 10) {
    displayStatus.textContent = (state.stepStatuses[10] === 'manual_completed' || state.stepStatuses[10] === 'skipped') ? '全部步骤已跳过/完成' : '全部步骤已完成';
    statusBar.classList.add('completed');
  } else if (lastCompleted) {
    displayStatus.textContent = (state.stepStatuses[lastCompleted] === 'manual_completed' || state.stepStatuses[lastCompleted] === 'skipped')
      ? `步骤 ${lastCompleted} 已跳过`
      : `步骤 ${lastCompleted} 已完成`;
  } else {
    displayStatus.textContent = '就绪';
  }
}

function appendLog(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  });
  const levelLabel = LOG_LEVEL_LABELS[entry.level] || entry.level;
  const line = document.createElement('div');
  line.className = `log-line log-${entry.level}`;

  const stepMatch = entry.message.match(/(?:Step\s+(\d+)|步骤\s*(\d+))/);
  const stepNum = stepMatch ? (stepMatch[1] || stepMatch[2]) : null;

  let html = `<span class="log-time">${time}</span> `;
  html += `<span class="log-level log-level-${entry.level}">${levelLabel}</span> `;
  if (stepNum) {
    html += `<span class="log-step-tag step-${stepNum}">步${stepNum}</span>`;
  }
  html += `<span class="log-msg">${escapeHtml(entry.message)}</span>`;

  line.innerHTML = html;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchGeneratedEmail(options = {}) {
  const { showFailureToast = true } = options;
  const uiCopy = getEmailGeneratorUiCopy();
  if (isCustomMailProvider()) {
    throw new Error('当前邮箱服务为自定义邮箱，请直接填写注册邮箱。');
  }
  if (settingsDirty) {
    await saveSettings({ silent: true });
  }
  const defaultLabel = uiCopy.buttonLabel;
  btnFetchEmail.disabled = true;
  btnFetchEmail.textContent = '...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_GENERATED_EMAIL',
      source: 'sidepanel',
      payload: {
        generateNew: true,
        generator: selectEmailGenerator.value,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.email) {
      throw new Error('未返回可用邮箱。');
    }

    inputEmail.value = response.email;
    showToast(`已${uiCopy.successVerb} ${uiCopy.label}：${response.email}`, 'success', 2500);
    return response.email;
  } catch (err) {
    if (showFailureToast) {
      showToast(`${uiCopy.label}${uiCopy.successVerb}失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    btnFetchEmail.disabled = false;
    btnFetchEmail.textContent = defaultLabel;
  }
}

function syncToggleButtonLabel(button, input, labels) {
  if (!button || !input) return;

  const isHidden = input.type === 'password';
  button.innerHTML = isHidden ? EYE_OPEN_ICON : EYE_CLOSED_ICON;
  button.setAttribute('aria-label', isHidden ? labels.show : labels.hide);
  button.title = isHidden ? labels.show : labels.hide;
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('没有可复制的内容。');
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error('当前环境不支持剪贴板复制。');
  }
  await navigator.clipboard.writeText(value);
}

async function exportSettingsFile() {
  closeConfigMenu();
  configActionInFlight = true;
  updateConfigMenuControls();

  try {
    await flushPendingSettingsBeforeExport();
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_SETTINGS',
      source: 'sidepanel',
      payload: {},
    });

    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.fileContent || !response?.fileName) {
      throw new Error('\u672a\u751f\u6210\u53ef\u4e0b\u8f7d\u7684\u914d\u7f6e\u6587\u4ef6\u3002');
    }

    downloadTextFile(response.fileContent, response.fileName);
    showToast('\u914d\u7f6e\u5df2\u5bfc\u51fa\uff1a' + response.fileName, 'success', 2200);
  } catch (err) {
    showToast('\u5bfc\u51fa\u914d\u7f6e\u5931\u8d25\uff1a' + err.message, 'error');
  } finally {
    configActionInFlight = false;
    updateConfigMenuControls();
  }
}

async function importSettingsFromFile(file) {
  if (!file) return;

  configActionInFlight = true;
  closeConfigMenu();
  updateConfigMenuControls();

  try {
    await settlePendingSettingsBeforeImport();
    const rawText = await file.text();

    let parsedConfig = null;
    try {
      parsedConfig = JSON.parse(rawText);
    } catch {
      throw new Error('\u914d\u7f6e\u6587\u4ef6\u4e0d\u662f\u6709\u6548\u7684 JSON\u3002');
    }

    const confirmed = await openConfirmModal({
      title: '\u5bfc\u5165\u914d\u7f6e',
      message: '\u786e\u8ba4\u5bfc\u5165\u914d\u7f6e\u6587\u4ef6 "' + file.name + '" \u5417\uff1f\u5bfc\u5165\u540e\u4f1a\u8986\u76d6\u5f53\u524d\u914d\u7f6e\u3002',
      confirmLabel: '\u786e\u8ba4\u8986\u76d6\u5bfc\u5165',
      confirmVariant: 'btn-danger',
    });
    if (!confirmed) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'IMPORT_SETTINGS',
      source: 'sidepanel',
      payload: {
        config: parsedConfig,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.state) {
      throw new Error('\u5bfc\u5165\u540e\u672a\u8fd4\u56de\u6700\u65b0\u914d\u7f6e\u72b6\u6001\u3002');
    }

    applySettingsState(response.state);
    updateStatusDisplay(latestState);
    showToast('\u914d\u7f6e\u5df2\u5bfc\u5165\uff0c\u5f53\u524d\u914d\u7f6e\u5df2\u8986\u76d6\u3002', 'success', 2200);
  } catch (err) {
    showToast('\u5bfc\u5165\u914d\u7f6e\u5931\u8d25\uff1a' + err.message, 'error');
  } finally {
    configActionInFlight = false;
    updateConfigMenuControls();
    if (inputImportSettingsFile) {
      inputImportSettingsFile.value = '';
    }
  }
}

async function importAccountsFromFile(file) {
  if (!file) return;

  try {
    const rawText = await file.text();
    let parsedConfig = null;
    try {
      parsedConfig = JSON.parse(rawText);
    } catch {
      throw new Error('历史账号文件不是有效的 JSON。');
    }

    const confirmed = await openConfirmModal({
      title: '导入历史账号',
      message: `确认导入历史账号文件 "${file.name}" 吗？将合并到当前扩展的账号历史中。`,
      confirmLabel: '确认导入',
      confirmVariant: 'btn-danger',
    });
    if (!confirmed) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'IMPORT_ACCOUNT_DATA',
      source: 'sidepanel',
      payload: { config: parsedConfig },
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    setAccountsState(response.accounts || []);
    await refreshIcloudAliases({ silent: true }).catch(() => {});
    renderAccountsSection();
    showToast(`已导入 ${Number(response.importedCount || 0)} 条历史账号`, 'success', 2200);
  } catch (err) {
    showToast(`导入历史账号失败：${err.message}`, 'error');
  } finally {
    if (inputImportAccountsFile) {
      inputImportAccountsFile.value = '';
    }
  }
}

function syncPasswordToggleLabel() {
  syncToggleButtonLabel(btnTogglePassword, inputPassword, {
    show: '显示密码',
    hide: '隐藏密码',
  });
}

function syncVpsUrlToggleLabel() {
  syncToggleButtonLabel(btnToggleVpsUrl, inputVpsUrl, {
    show: '显示 CPA 地址',
    hide: '隐藏 CPA 地址',
  });
}

function syncVpsPasswordToggleLabel() {
  syncToggleButtonLabel(btnToggleVpsPassword, inputVpsPassword, {
    show: '显示管理密钥',
    hide: '隐藏管理密钥',
  });
}

async function maybeTakeoverAutoRun(actionLabel) {
  if (!isAutoRunPausedPhase()) {
    return true;
  }

  const confirmed = await openConfirmModal({
    title: '接管自动',
    message: `当前自动流程已暂停。若继续${actionLabel}，将停止自动流程并切换为手动控制。是否继续？`,
    confirmLabel: '确认接管',
    confirmVariant: 'btn-primary',
  });
  if (!confirmed) {
    return false;
  }

  await chrome.runtime.sendMessage({ type: 'TAKEOVER_AUTO_RUN', source: 'sidepanel', payload: {} });
  return true;
}

async function handleSkipStep(step) {
  if (isAutoRunPausedPhase()) {
    const takeoverResponse = await chrome.runtime.sendMessage({
      type: 'TAKEOVER_AUTO_RUN',
      source: 'sidepanel',
      payload: {},
    });
    if (takeoverResponse?.error) {
      throw new Error(takeoverResponse.error);
    }
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SKIP_STEP',
    source: 'sidepanel',
    payload: { step },
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  showToast(`步骤 ${step} 已跳过`, 'success', 2200);
}

// ============================================================
// Button Handlers
// ============================================================

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    try {
      const step = Number(btn.dataset.step);
      if (!(await maybeTakeoverAutoRun(`执行步骤 ${step}`))) {
        return;
      }
      if (settingsDirty) {
        await saveSettings({ silent: true });
      }
      if (step === 3) {
        if (inputPassword.value !== (latestState?.customPassword || '')) {
          await chrome.runtime.sendMessage({
            type: 'SAVE_SETTING',
            source: 'sidepanel',
            payload: { customPassword: inputPassword.value },
          });
          syncLatestState({ customPassword: inputPassword.value });
        }
        let email = inputEmail.value.trim();
        if (usesGeneratedAliasMailProvider(selectMailProvider.value)) {
          const emailPrefix = inputEmailPrefix.value.trim();
          if (!emailPrefix) {
            showToast('请先填写 2925 邮箱前缀。', 'warn');
            return;
          }
          const response = await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step, emailPrefix } });
          if (response?.error) {
            throw new Error(response.error);
          }
        } else {
          let email = inputEmail.value.trim();
          if (!email) {
            if (isCustomMailProvider()) {
              showToast('当前邮箱服务为自定义邮箱，请先填写注册邮箱后再执行第 3 步。', 'warn');
              return;
            }
            try {
              email = await fetchGeneratedEmail({ showFailureToast: false });
            } catch (err) {
              showToast(`自动获取失败：${err.message}，请手动粘贴邮箱后重试。`, 'warn');
              return;
            }
          }
          const response = await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step, email } });
          if (response?.error) {
            throw new Error(response.error);
          }
        }
      } else {
        const response = await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step } });
        if (response?.error) {
          throw new Error(response.error);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});

btnFetchEmail.addEventListener('click', async () => {
  if (isCustomMailProvider()) {
    return;
  }
  await fetchGeneratedEmail().catch(() => { });
});

btnTogglePassword.addEventListener('click', () => {
  inputPassword.type = inputPassword.type === 'password' ? 'text' : 'password';
  syncPasswordToggleLabel();
});

btnToggleVpsUrl.addEventListener('click', () => {
  inputVpsUrl.type = inputVpsUrl.type === 'password' ? 'text' : 'password';
  syncVpsUrlToggleLabel();
});

btnToggleVpsPassword.addEventListener('click', () => {
  inputVpsPassword.type = inputVpsPassword.type === 'password' ? 'text' : 'password';
  syncVpsPasswordToggleLabel();
});

btnMailLogin?.addEventListener('click', async () => {
  const config = getMailProviderLoginConfig();
  const loginUrl = getMailProviderLoginUrl();
  if (!config || !loginUrl) {
    return;
  }

  try {
    await chrome.tabs.create({ url: loginUrl, active: true });
  } catch (err) {
    showToast(`打开${config.label}失败：${err.message}`, 'error');
  }
});

localCpaStep9ModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.localCpaStep9Mode;
    if (getSelectedLocalCpaStep9Mode() === normalizeLocalCpaStep9Mode(nextMode)) {
      return;
    }
    setLocalCpaStep9Mode(nextMode);
    markSettingsDirty(true);
    saveSettings({ silent: true }).catch(() => { });
  });
});

btnSaveSettings.addEventListener('click', async () => {
  if (!settingsDirty) {
    showToast('配置已是最新', 'info', 1400);
    return;
  }
  await saveSettings({ silent: false }).catch(() => { });
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await chrome.runtime.sendMessage({ type: 'STOP_FLOW', source: 'sidepanel', payload: {} });
  showToast(isAutoRunScheduledPhase() ? '正在取消倒计时计划...' : '正在停止当前流程...', 'warn', 2000);
});

btnConfigMenu?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleConfigMenu();
});

configMenu?.addEventListener('click', (event) => {
  event.stopPropagation();
});

btnExportSettings?.addEventListener('click', async () => {
  if (configActionInFlight || settingsSaveInFlight) {
    return;
  }
  await exportSettingsFile();
});

btnImportSettings?.addEventListener('click', async () => {
  if (configActionInFlight || settingsSaveInFlight) {
    return;
  }
  closeConfigMenu();
  if (inputImportSettingsFile) {
    inputImportSettingsFile.value = '';
    inputImportSettingsFile.click();
  }
});

inputImportSettingsFile?.addEventListener('change', async () => {
  const file = inputImportSettingsFile.files?.[0] || null;
  await importSettingsFromFile(file);
});

autoStartModal?.addEventListener('click', (event) => {
  if (event.target === autoStartModal) {
    resolveModalChoice(null);
  }
});
btnAutoStartClose?.addEventListener('click', () => resolveModalChoice(null));

// Auto Run
btnAutoRun.addEventListener('click', async () => {
  try {
    const totalRuns = getRunCountValue();
    let mode = 'restart';
    const autoRunSkipFailures = inputAutoSkipFailures.checked;
    const fallbackThreadIntervalMinutes = normalizeAutoRunThreadIntervalMinutes(
      inputAutoSkipFailuresThreadIntervalMinutes.value
    );
    inputAutoSkipFailuresThreadIntervalMinutes.value = String(fallbackThreadIntervalMinutes);

    if (shouldOfferAutoModeChoice()) {
      const startStep = getFirstUnfinishedAutoRunStep();
      const runningStep = getRunningSteps()[0] ?? null;
      const choice = await openAutoStartChoiceDialog(startStep, { runningStep });
      if (!choice) {
        return;
      }
      mode = choice;
    }

    if (shouldWarnAutoRunFallbackRisk(totalRuns, autoRunSkipFailures)
      && !isAutoRunFallbackRiskPromptDismissed()) {
      const result = await openAutoRunFallbackRiskConfirmModal(totalRuns, fallbackThreadIntervalMinutes);
      if (!result.confirmed) {
        return;
      }
      if (result.dismissPrompt) {
        setAutoRunFallbackRiskPromptDismissed(true);
      }
    }

    btnAutoRun.disabled = true;
    inputRunCount.disabled = true;
    const delayEnabled = inputAutoDelayEnabled.checked;
    const delayMinutes = normalizeAutoDelayMinutes(inputAutoDelayMinutes.value);
    inputAutoDelayMinutes.value = String(delayMinutes);
    btnAutoRun.innerHTML = delayEnabled
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 计划中...'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 运行中...';
    const response = await chrome.runtime.sendMessage({
      type: delayEnabled ? 'SCHEDULE_AUTO_RUN' : 'AUTO_RUN',
      source: 'sidepanel',
      payload: {
        totalRuns,
        delayMinutes,
        autoRunSkipFailures,
        mode,
      },
    });
    if (response?.error) {
      throw new Error(response.error);
    }
  } catch (err) {
    setDefaultAutoRunButton();
    inputRunCount.disabled = false;
    showToast(err.message, 'error');
  }
});

btnAutoContinue.addEventListener('click', async () => {
  const email = inputEmail.value.trim();
  if (!email) {
    showToast(
      isCustomMailProvider() ? '请先填写自定义注册邮箱。' : '请先获取或粘贴邮箱。',
      'warn'
    );
    return;
  }
  autoContinueBar.style.display = 'none';
  await chrome.runtime.sendMessage({ type: 'RESUME_AUTO_RUN', source: 'sidepanel', payload: { email } });
});

btnAutoRunNow?.addEventListener('click', async () => {
  try {
    btnAutoRunNow.disabled = true;
    const waitingInterval = currentAutoRun.phase === 'waiting_interval';
    await chrome.runtime.sendMessage({
      type: waitingInterval ? 'SKIP_AUTO_RUN_COUNTDOWN' : 'START_SCHEDULED_AUTO_RUN_NOW',
      source: 'sidepanel',
      payload: {},
    });
    if (waitingInterval) {
      showToast('已跳过当前倒计时，自动流程将立即继续。', 'info', 1800);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAutoRunNow.disabled = false;
  }
});

btnAutoCancelSchedule?.addEventListener('click', async () => {
  try {
    btnAutoCancelSchedule.disabled = true;
    await chrome.runtime.sendMessage({ type: 'CANCEL_SCHEDULED_AUTO_RUN', source: 'sidepanel', payload: {} });
    showToast('已取消倒计时计划。', 'info', 1800);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAutoCancelSchedule.disabled = false;
  }
});

// Reset
btnReset.addEventListener('click', async () => {
  const confirmed = await openConfirmModal({
    title: '重置流程',
    message: '确认重置全部步骤和数据吗？',
    confirmLabel: '确认重置',
    confirmVariant: 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  await chrome.runtime.sendMessage({ type: 'RESET', source: 'sidepanel' });
  syncLatestState({ stepStatuses: STEP_DEFAULT_STATUSES, email: null });
  syncAutoRunState({
    autoRunning: false,
    autoRunPhase: 'idle',
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 1,
    autoRunAttemptRun: 0,
    scheduledAutoRunAt: null,
    autoRunCountdownAt: null,
    autoRunCountdownTitle: '',
    autoRunCountdownNote: '',
  });
  displayOauthUrl.textContent = '等待中...';
  displayOauthUrl.classList.remove('has-value');
  displayLocalhostUrl.textContent = '等待中...';
  displayLocalhostUrl.classList.remove('has-value');
  inputEmail.value = '';
  displayStatus.textContent = '就绪';
  statusBar.className = 'status-bar';
  logArea.innerHTML = '';
  document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
  document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
  setDefaultAutoRunButton();
  applyAutoRunStatus(currentAutoRun);
  markSettingsDirty(false);
  updateStopButtonState(false);
  updateButtonStates();
  updateProgressCounter();
});

// Clear log
btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// Save settings on change
inputEmail.addEventListener('change', async () => {
  const email = inputEmail.value.trim();
  inputEmail.value = email;
  try {
    if (email) {
      const response = await chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', source: 'sidepanel', payload: { email } });
      if (response?.error) {
        throw new Error(response.error);
      }
    } else {
      await setRuntimeEmailState(null);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});
inputEmail.addEventListener('input', updateButtonStates);
inputVpsUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVpsUrl.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputVpsPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVpsPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

[inputMoemailBaseUrl, inputMoemailApiKey, inputMailpitBaseUrl, inputMailpitUsername, inputMailpitPassword, inputMailpitDomain].forEach((input) => {
  input?.addEventListener('input', () => {
    markSettingsDirty(true);
    scheduleSettingsAutoSave();
  });
  input?.addEventListener('blur', () => {
    saveSettings({ silent: true }).catch(() => { });
  });
});

inputMoemailBaseUrl?.addEventListener('blur', () => {
  refreshMoemailDomainOptions({ silent: true }).catch(() => { });
});

inputMoemailApiKey?.addEventListener('blur', () => {
  refreshMoemailDomainOptions({ silent: true }).catch(() => { });
});

selectMoemailDomain?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

btnRefreshMoemailDomains?.addEventListener('click', () => {
  refreshMoemailDomainOptions({ silent: false }).catch(() => { });
});

inputPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  updateButtonStates();
  scheduleSettingsAutoSave();
});
inputPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

selectMailProvider.addEventListener('change', async () => {
  const previousProvider = latestState?.mailProvider || '';
  const nextProvider = selectMailProvider.value;
  updateMailProviderUI();
  if (nextProvider === 'moemail') {
    refreshMoemailDomainOptions({ silent: true }).catch(() => { });
  }
  const leavingMoemail = previousProvider === 'moemail'
    && nextProvider !== 'moemail'
    && isCurrentEmailManagedByMoemail();
  const leavingMailpit = previousProvider === 'mailpit'
    && nextProvider !== 'mailpit'
    && isCurrentEmailManagedByMailpit();
  const leavingGeneratedAlias = previousProvider !== nextProvider
    && usesGeneratedAliasMailProvider(previousProvider)
    && isCurrentEmailManagedByGeneratedAlias(previousProvider);
  if (leavingMoemail || leavingMailpit || leavingGeneratedAlias) {
    await clearRegistrationEmail({ silent: true }).catch(() => { });
  }
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectEmailGenerator.addEventListener('change', () => {
  updateMailProviderUI();
  if (getSelectedEmailGenerator() === 'icloud') {
    refreshIcloudAliases({ silent: true }).catch(() => { });
  }
  clearRegistrationEmail({ silent: true }).catch(() => { });
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectIcloudHostPreference?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectPanelMode.addEventListener('change', () => {
  updatePanelModeUI();
  if (selectPanelMode.value === 'sub2api') {
    refreshSub2ApiGroupOptions({ silent: true }).catch(() => { });
  }
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectCfDomain.addEventListener('change', () => {
  if (selectCfDomain.disabled) {
    return;
  }
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

btnCfDomainMode.addEventListener('click', async () => {
  try {
    if (!cloudflareDomainEditMode) {
      setCloudflareDomainEditMode(true, { clearInput: true });
      return;
    }

    const newDomain = normalizeCloudflareDomainValue(inputCfDomain.value);
    if (!newDomain) {
      showToast('请输入有效的 Cloudflare 域名。', 'warn');
      inputCfDomain.focus();
      return;
    }

    const { domains } = getCloudflareDomainsFromState();
    await saveCloudflareDomainSettings([...domains, newDomain], newDomain);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

inputCfDomain.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    btnCfDomainMode.click();
  }
});

inputSub2ApiUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiUrl.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
  refreshSub2ApiGroupOptions({ silent: true }).catch(() => { });
});

inputSub2ApiEmail.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiEmail.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
  refreshSub2ApiGroupOptions({ silent: true }).catch(() => { });
});

inputSub2ApiPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
  refreshSub2ApiGroupOptions({ silent: true }).catch(() => { });
});

sub2ApiGroupList?.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
    return;
  }
  updateSub2ApiGroupSummary(getSelectedSub2ApiGroupNames());
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

btnRefreshSub2ApiGroups?.addEventListener('click', () => {
  refreshSub2ApiGroupOptions({ silent: false }).catch(() => { });
});

inputEmailPrefix.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputEmailPrefix.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => {});
});

inputInbucketMailbox.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputInbucketMailbox.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputInbucketHost.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputInbucketHost.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputRunCount.addEventListener('input', () => {
  updateFallbackThreadIntervalInputState();
});
inputRunCount.addEventListener('blur', () => {
  inputRunCount.value = String(getRunCountValue());
  updateFallbackThreadIntervalInputState();
});

inputAutoSkipFailures.addEventListener('change', async () => {
  if (inputAutoSkipFailures.checked && !isAutoSkipFailuresPromptDismissed()) {
    const result = await openAutoSkipFailuresConfirmModal();
    if (!result.confirmed) {
      inputAutoSkipFailures.checked = false;
      updateFallbackThreadIntervalInputState();
      return;
    }
    if (result.dismissPrompt) {
      setAutoSkipFailuresPromptDismissed(true);
    }
  }
  updateFallbackThreadIntervalInputState();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoSkipFailuresThreadIntervalMinutes.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoSkipFailuresThreadIntervalMinutes.addEventListener('blur', () => {
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(
    normalizeAutoRunThreadIntervalMinutes(inputAutoSkipFailuresThreadIntervalMinutes.value)
  );
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoDelayEnabled.addEventListener('change', () => {
  updateAutoDelayInputState();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoDelayMinutes.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoDelayMinutes.addEventListener('blur', () => {
  inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(inputAutoDelayMinutes.value));
  saveSettings({ silent: true }).catch(() => { });
});

function syncAutoStepDelayInputs() {
  inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(inputAutoStepDelaySeconds.value);
}

inputAutoStepDelaySeconds.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoStepDelaySeconds.addEventListener('blur', () => {
  syncAutoStepDelayInputs();
  saveSettings({ silent: true }).catch(() => { });
});

btnIcloudRefresh?.addEventListener('click', async () => {
  await refreshIcloudAliases({ silent: false }).catch(() => { });
});

btnIcloudDeleteUsed?.addEventListener('click', async () => {
  await deleteUsedIcloudAliases();
});

btnIcloudLoginDone?.addEventListener('click', async () => {
  btnIcloudLoginDone.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_ICLOUD_SESSION',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    hideIcloudLoginHelp();
    showToast('iCloud 登录态已恢复，正在刷新别名列表。', 'success', 2800);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`iCloud 登录态仍不可用：${err.message}`, 'warn', 4200);
  } finally {
    btnIcloudLoginDone.disabled = false;
  }
});

btnClearAccounts?.addEventListener('click', async () => {
  if (!lastRenderedAccounts.length) {
    return;
  }
  if (!confirm('确定清空当前扩展保存的全部历史账号记录？')) {
    return;
  }
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'CLEAR_ACCOUNTS',
      source: 'sidepanel',
      payload: {},
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    setAccountsState(result.accounts || []);
    renderIcloudAliases(lastRenderedIcloudAliases);
    renderAccountsSection();
    showToast('历史账号已清空', 'info', 1800);
  } catch (err) {
    showToast(`清空历史账号失败：${err.message}`, 'error');
  }
});

inputIcloudSearch?.addEventListener('input', () => {
  icloudSearchTerm = inputIcloudSearch.value || '';
  renderIcloudAliases(lastRenderedIcloudAliases);
});

selectIcloudFilter?.addEventListener('change', () => {
  icloudFilterMode = selectIcloudFilter.value || 'all';
  renderIcloudAliases(lastRenderedIcloudAliases);
});

checkboxIcloudSelectAll?.addEventListener('change', () => {
  const visibleAliases = getFilteredIcloudAliases();
  if (checkboxIcloudSelectAll.checked) {
    visibleAliases.forEach((alias) => icloudSelectedEmails.add(alias.email));
  } else {
    visibleAliases.forEach((alias) => icloudSelectedEmails.delete(alias.email));
  }
  renderIcloudAliases(lastRenderedIcloudAliases);
});

btnIcloudBulkUsed?.addEventListener('click', async () => {
  await runBulkIcloudAction('used');
});

btnIcloudBulkUnused?.addEventListener('click', async () => {
  await runBulkIcloudAction('unused');
});

btnIcloudBulkPreserve?.addEventListener('click', async () => {
  await runBulkIcloudAction('preserve');
});

btnIcloudBulkUnpreserve?.addEventListener('click', async () => {
  await runBulkIcloudAction('unpreserve');
});

btnIcloudBulkDelete?.addEventListener('click', async () => {
  await runBulkIcloudAction('delete');
});

btnToggleAccounts?.addEventListener('click', () => {
  accountsCollapsed = !accountsCollapsed;
  updateAccountsCollapseUI();
});

btnExportAccounts?.addEventListener('click', async () => {
  if (!lastRenderedAccounts.length) {
    showToast('没有可导出的账号。', 'warn');
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(JSON.stringify(lastRenderedAccounts, null, 2), `codex-oauth-accounts-${date}.json`);
  showToast(`已导出 ${lastRenderedAccounts.length} 个账号`, 'success', 1800);
});

btnImportAccounts?.addEventListener('click', () => {
  inputImportAccountsFile?.click();
});

inputImportAccountsFile?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  await importAccountsFromFile(file);
});

// ============================================================
// Listen for Background broadcasts
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'REQUEST_CUSTOM_VERIFICATION_BYPASS_CONFIRMATION': {
      (async () => {
        const step = Number(message.payload?.step);
        const promptCopy = getCustomVerificationPromptCopy(step);
        const confirmed = await openConfirmModal({
          title: promptCopy.title,
          message: promptCopy.message,
          confirmLabel: '确认跳过',
          confirmVariant: 'btn-danger',
          alert: promptCopy.alert,
        });
        sendResponse({ confirmed });
      })().catch((err) => {
        sendResponse({ error: err.message });
      });
      return true;
    }

    case 'LOG_ENTRY':
      appendLog(message.payload);
      if (message.payload.level === 'error') {
        showToast(message.payload.message, 'error');
      }
      break;

    case 'STEP_STATUS_CHANGED': {
      const { step, status } = message.payload;
      updateStepUI(step, status);
      chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' }).then(state => {
        syncLatestState(state);
        syncAutoRunState(state);
        updateStatusDisplay(latestState);
        updateButtonStates();
        if (status === 'completed' || status === 'manual_completed' || status === 'skipped') {
          syncPasswordField(state);
          if (state.oauthUrl) {
            displayOauthUrl.textContent = state.oauthUrl;
            displayOauthUrl.classList.add('has-value');
          }
          if (state.localhostUrl) {
            displayLocalhostUrl.textContent = state.localhostUrl;
            displayLocalhostUrl.classList.add('has-value');
          }
        }
      }
      ).catch(() => { });
      break;
    }

    case 'AUTO_RUN_RESET': {
      // Full UI reset for next run
      syncLatestState({
        oauthUrl: null,
        localhostUrl: null,
        email: null,
        password: null,
        stepStatuses: STEP_DEFAULT_STATUSES,
        logs: [],
        scheduledAutoRunAt: null,
        autoRunCountdownAt: null,
        autoRunCountdownTitle: '',
        autoRunCountdownNote: '',
      });
      displayOauthUrl.textContent = '等待中...';
      displayOauthUrl.classList.remove('has-value');
      displayLocalhostUrl.textContent = '等待中...';
      displayLocalhostUrl.classList.remove('has-value');
      inputEmail.value = '';
      displayStatus.textContent = '就绪';
      statusBar.className = 'status-bar';
      logArea.innerHTML = '';
      document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
      document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
      syncAutoRunState({
        autoRunning: false,
        autoRunPhase: 'idle',
        autoRunCurrentRun: 0,
        autoRunTotalRuns: 1,
        autoRunAttemptRun: 0,
        scheduledAutoRunAt: null,
        autoRunCountdownAt: null,
        autoRunCountdownTitle: '',
        autoRunCountdownNote: '',
      });
      applyAutoRunStatus(currentAutoRun);
      updateProgressCounter();
      updateButtonStates();
      break;
    }

    case 'DATA_UPDATED': {
      syncLatestState(message.payload);
      if (message.payload.email !== undefined) {
        inputEmail.value = message.payload.email || '';
      }
      if (message.payload.password !== undefined) {
        inputPassword.value = message.payload.password || '';
      }
      if (message.payload.localCpaStep9Mode !== undefined) {
        setLocalCpaStep9Mode(message.payload.localCpaStep9Mode);
      }
      if (message.payload.oauthUrl !== undefined) {
        displayOauthUrl.textContent = message.payload.oauthUrl || '等待中...';
        displayOauthUrl.classList.toggle('has-value', Boolean(message.payload.oauthUrl));
      }
      if (message.payload.localhostUrl !== undefined) {
        displayLocalhostUrl.textContent = message.payload.localhostUrl || '等待中...';
        displayLocalhostUrl.classList.toggle('has-value', Boolean(message.payload.localhostUrl));
      }
      if (message.payload.autoRunSkipFailures !== undefined) {
        inputAutoSkipFailures.checked = Boolean(message.payload.autoRunSkipFailures);
        updateFallbackThreadIntervalInputState();
      }
      if (message.payload.autoRunDelayEnabled !== undefined) {
        inputAutoDelayEnabled.checked = Boolean(message.payload.autoRunDelayEnabled);
        updateAutoDelayInputState();
      }
      if (message.payload.autoRunDelayMinutes !== undefined) {
        inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(message.payload.autoRunDelayMinutes));
      }
      if (message.payload.autoRunFallbackThreadIntervalMinutes !== undefined) {
        inputAutoSkipFailuresThreadIntervalMinutes.value = String(
          normalizeAutoRunThreadIntervalMinutes(message.payload.autoRunFallbackThreadIntervalMinutes)
        );
        updateFallbackThreadIntervalInputState();
      }
      if (message.payload.autoStepDelaySeconds !== undefined) {
        inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(message.payload.autoStepDelaySeconds);
      }
      if (message.payload.icloudHostPreference !== undefined && selectIcloudHostPreference) {
        selectIcloudHostPreference.value = String(message.payload.icloudHostPreference || 'auto').trim().toLowerCase() || 'auto';
      }
      break;
    }

    case 'ICLOUD_LOGIN_REQUIRED': {
      const loginMessage = 'iCloud 登录已过期，已为你打开登录页。';
      showToast(loginMessage, 'warn', 5000);
      if (icloudSummary) {
        icloudSummary.textContent = loginMessage;
      }
      showIcloudLoginHelp(message.payload || {});
      break;
    }

    case 'ACCOUNTS_CHANGED':
      loadAccounts({ silent: true });
      break;

    case 'ICLOUD_ALIASES_CHANGED':
      refreshIcloudAliases({ silent: true }).catch(() => {});
      break;

    case 'AUTO_RUN_STATUS': {
      syncLatestState({
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(message.payload.phase),
        autoRunPhase: message.payload.phase,
        autoRunCurrentRun: message.payload.currentRun,
        autoRunTotalRuns: message.payload.totalRuns,
        autoRunAttemptRun: message.payload.attemptRun,
        scheduledAutoRunAt: message.payload.scheduledAt ?? null,
        autoRunCountdownAt: message.payload.countdownAt ?? null,
        autoRunCountdownTitle: message.payload.countdownTitle ?? '',
        autoRunCountdownNote: message.payload.countdownNote ?? '',
      });
      applyAutoRunStatus(message.payload);
      updateStatusDisplay(latestState);
      updateButtonStates();
      break;
    }
  }
});

// ============================================================
// Theme Toggle
// ============================================================

const btnTheme = document.getElementById('btn-theme');

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('multipage-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('multipage-theme');
  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  }
}

btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

document.addEventListener('click', (event) => {
  if (!configMenuOpen) {
    return;
  }
  if (configMenuShell?.contains(event.target)) {
    return;
  }
  closeConfigMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && configMenuOpen) {
    closeConfigMenu();
  }
});

// ============================================================
// Init
// ============================================================

initializeManualStepActions();
initTheme();
updateSaveButtonState();
updateConfigMenuControls();
setLocalCpaStep9Mode(DEFAULT_LOCAL_CPA_STEP9_MODE);
initializeReleaseInfo().catch((err) => {
  console.error('Failed to initialize release info:', err);
});
restoreState().then(() => {
  syncPasswordToggleLabel();
  syncVpsUrlToggleLabel();
  syncVpsPasswordToggleLabel();
  updatePanelModeUI();
  updateButtonStates();
  updateStatusDisplay(latestState);
});
