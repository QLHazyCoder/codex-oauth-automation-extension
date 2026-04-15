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
const configMenuShell = document.getElementById('config-menu-shell');
const btnConfigMenu = document.getElementById('btn-config-menu');
const configMenu = document.getElementById('config-menu');
const btnExportSettings = document.getElementById('btn-export-settings');
const btnImportSettings = document.getElementById('btn-import-settings');
const inputImportSettingsFile = document.getElementById('input-import-settings-file');
const selectPanelMode = document.getElementById('select-panel-mode');
const rowVpsUrl = document.getElementById('row-vps-url');
const inputVpsUrl = document.getElementById('input-vps-url');
const rowVpsPassword = document.getElementById('row-vps-password');
const inputVpsPassword = document.getElementById('input-vps-password');
const rowLocalCpaStep9Mode = document.getElementById('row-local-cpa-step9-mode');
const localCpaStep9ModeButtons = Array.from(document.querySelectorAll('[data-local-cpa-step9-mode]'));
const rowCpaCallbackMode = document.getElementById('row-cpa-callback-mode');
const cpaCallbackModeButtons = Array.from(document.querySelectorAll('[data-cpa-callback-mode]'));
const rowSub2ApiUrl = document.getElementById('row-sub2api-url');
const inputSub2ApiUrl = document.getElementById('input-sub2api-url');
const rowSub2ApiEmail = document.getElementById('row-sub2api-email');
const inputSub2ApiEmail = document.getElementById('input-sub2api-email');
const rowSub2ApiPassword = document.getElementById('row-sub2api-password');
const inputSub2ApiPassword = document.getElementById('input-sub2api-password');
const rowSub2ApiGroup = document.getElementById('row-sub2api-group');
const inputSub2ApiGroup = document.getElementById('input-sub2api-group');
const selectMailProvider = document.getElementById('select-mail-provider');
const btnMailLogin = document.getElementById('btn-mail-login');
const rowMail2925Mode = document.getElementById('row-mail-2925-mode');
const mail2925ModeButtons = Array.from(document.querySelectorAll('[data-mail2925-mode]'));
const rowEmailGenerator = document.getElementById('row-email-generator');
const selectEmailGenerator = document.getElementById('select-email-generator');
const rowTempEmailBaseUrl = document.getElementById('row-temp-email-base-url');
const inputTempEmailBaseUrl = document.getElementById('input-temp-email-base-url');
const rowTempEmailAdminAuth = document.getElementById('row-temp-email-admin-auth');
const inputTempEmailAdminAuth = document.getElementById('input-temp-email-admin-auth');
const rowTempEmailCustomAuth = document.getElementById('row-temp-email-custom-auth');
const inputTempEmailCustomAuth = document.getElementById('input-temp-email-custom-auth');
const rowTempEmailReceiveMailbox = document.getElementById('row-temp-email-receive-mailbox');
const inputTempEmailReceiveMailbox = document.getElementById('input-temp-email-receive-mailbox');
const rowTempEmailDomain = document.getElementById('row-temp-email-domain');
const selectTempEmailDomain = document.getElementById('select-temp-email-domain');
const inputTempEmailDomain = document.getElementById('input-temp-email-domain');
const btnTempEmailDomainMode = document.getElementById('btn-temp-email-domain-mode');
const hotmailSection = document.getElementById('hotmail-section');
const luckmailSection = document.getElementById('luckmail-section');
const icloudSection = document.getElementById('icloud-section');
const icloudSummary = document.getElementById('icloud-summary');
const icloudList = document.getElementById('icloud-list');
const icloudLoginHelp = document.getElementById('icloud-login-help');
const icloudLoginHelpTitle = document.getElementById('icloud-login-help-title');
const icloudLoginHelpText = document.getElementById('icloud-login-help-text');
const btnIcloudLoginDone = document.getElementById('btn-icloud-login-done');
const btnIcloudRefresh = document.getElementById('btn-icloud-refresh');
const btnIcloudDeleteUsed = document.getElementById('btn-icloud-delete-used');
const selectIcloudHostPreference = document.getElementById('select-icloud-host-preference');
const checkboxAutoDeleteIcloud = document.getElementById('checkbox-auto-delete-icloud');
const inputIcloudSearch = document.getElementById('input-icloud-search');
const selectIcloudFilter = document.getElementById('select-icloud-filter');
const checkboxIcloudSelectAll = document.getElementById('checkbox-icloud-select-all');
const icloudSelectionSummary = document.getElementById('icloud-selection-summary');
const btnIcloudBulkUsed = document.getElementById('btn-icloud-bulk-used');
const btnIcloudBulkUnused = document.getElementById('btn-icloud-bulk-unused');
const btnIcloudBulkPreserve = document.getElementById('btn-icloud-bulk-preserve');
const btnIcloudBulkUnpreserve = document.getElementById('btn-icloud-bulk-unpreserve');
const btnIcloudBulkDelete = document.getElementById('btn-icloud-bulk-delete');
const rowHotmailServiceMode = document.getElementById('row-hotmail-service-mode');
const hotmailServiceModeButtons = Array.from(document.querySelectorAll('[data-hotmail-service-mode]'));
const rowHotmailRemoteBaseUrl = document.getElementById('row-hotmail-remote-base-url');
const inputHotmailRemoteBaseUrl = document.getElementById('input-hotmail-remote-base-url');
const rowHotmailLocalBaseUrl = document.getElementById('row-hotmail-local-base-url');
const inputHotmailLocalBaseUrl = document.getElementById('input-hotmail-local-base-url');
const inputHotmailEmail = document.getElementById('input-hotmail-email');
const inputHotmailClientId = document.getElementById('input-hotmail-client-id');
const inputHotmailPassword = document.getElementById('input-hotmail-password');
const inputHotmailRefreshToken = document.getElementById('input-hotmail-refresh-token');
const inputHotmailImport = document.getElementById('input-hotmail-import');
const btnAddHotmailAccount = document.getElementById('btn-add-hotmail-account');
const btnImportHotmailAccounts = document.getElementById('btn-import-hotmail-accounts');
const btnHotmailUsageGuide = document.getElementById('btn-hotmail-usage-guide');
const btnClearUsedHotmailAccounts = document.getElementById('btn-clear-used-hotmail-accounts');
const btnDeleteAllHotmailAccounts = document.getElementById('btn-delete-all-hotmail-accounts');
const btnToggleHotmailList = document.getElementById('btn-toggle-hotmail-list');
const hotmailListShell = document.getElementById('hotmail-list-shell');
const hotmailAccountsList = document.getElementById('hotmail-accounts-list');
const inputLuckmailApiKey = document.getElementById('input-luckmail-api-key');
const inputLuckmailBaseUrl = document.getElementById('input-luckmail-base-url');
const selectLuckmailEmailType = document.getElementById('select-luckmail-email-type');
const inputLuckmailDomain = document.getElementById('input-luckmail-domain');
const btnLuckmailRefresh = document.getElementById('btn-luckmail-refresh');
const btnLuckmailDisableUsed = document.getElementById('btn-luckmail-disable-used');
const luckmailSummary = document.getElementById('luckmail-summary');
const inputLuckmailSearch = document.getElementById('input-luckmail-search');
const selectLuckmailFilter = document.getElementById('select-luckmail-filter');
const checkboxLuckmailSelectAll = document.getElementById('checkbox-luckmail-select-all');
const luckmailSelectionSummary = document.getElementById('luckmail-selection-summary');
const btnLuckmailBulkUsed = document.getElementById('btn-luckmail-bulk-used');
const btnLuckmailBulkUnused = document.getElementById('btn-luckmail-bulk-unused');
const btnLuckmailBulkPreserve = document.getElementById('btn-luckmail-bulk-preserve');
const btnLuckmailBulkUnpreserve = document.getElementById('btn-luckmail-bulk-unpreserve');
const btnLuckmailBulkDisable = document.getElementById('btn-luckmail-bulk-disable');
const btnLuckmailBulkEnable = document.getElementById('btn-luckmail-bulk-enable');
const luckmailList = document.getElementById('luckmail-list');
const rowEmailPrefix = document.getElementById('row-email-prefix');
const labelEmailPrefix = document.getElementById('label-email-prefix');
const inputEmailPrefix = document.getElementById('input-email-prefix');
const rowInbucketHost = document.getElementById('row-inbucket-host');
const inputInbucketHost = document.getElementById('input-inbucket-host');
const rowInbucketMailbox = document.getElementById('row-inbucket-mailbox');
const inputInbucketMailbox = document.getElementById('input-inbucket-mailbox');
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
const FIRST_VISIBLE_STEP = 2;
const LAST_STEP = 10;
const VISIBLE_STEPS = Array.from(
  { length: LAST_STEP - FIRST_VISIBLE_STEP + 1 },
  (_, index) => FIRST_VISIBLE_STEP + index
);
const TOTAL_VISIBLE_STEPS = VISIBLE_STEPS.length;
const SKIPPABLE_STEPS = new Set(VISIBLE_STEPS);
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
const DEFAULT_CPA_CALLBACK_MODE = 'step8';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
const AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-skip-failures-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-run-fallback-risk-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS = 15;
const AUTO_RUN_FALLBACK_RISK_RECOMMENDED_THREAD_INTERVAL_MINUTES = 5;
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const DEFAULT_LUCKMAIL_BASE_URL = 'https://mails.luckyous.com';
const DEFAULT_LUCKMAIL_EMAIL_TYPE = 'ms_graph';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';

let latestState = null;
let currentAutoRun = {
  autoRunning: false,
  phase: 'idle',
  currentRun: 0,
  totalRuns: 1,
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
let cloudflareTempEmailDomainEditMode = false;
let icloudRefreshQueued = false;
let lastRenderedIcloudAliases = [];
let icloudSelectedEmails = new Set();
let icloudSearchTerm = '';
let icloudFilterMode = 'all';
let modalChoiceResolver = null;
let currentModalActions = [];
let modalResultBuilder = null;
let scheduledCountdownTimer = null;
let hotmailActionInFlight = false;
let hotmailListExpanded = false;
let configMenuOpen = false;
let configActionInFlight = false;
let currentReleaseSnapshot = null;

const EYE_OPEN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.77 21.77 0 0 1 5.06-6.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const parseHotmailImportText = window.HotmailUtils?.parseHotmailImportText;
const normalizeHotmailServiceModeFromUtils = window.HotmailUtils?.normalizeHotmailServiceMode;
const shouldClearHotmailCurrentSelection = window.HotmailUtils?.shouldClearHotmailCurrentSelection;
const upsertHotmailAccountInList = window.HotmailUtils?.upsertHotmailAccountInList;
const filterHotmailAccountsByUsage = window.HotmailUtils?.filterHotmailAccountsByUsage;
const getHotmailBulkActionLabel = window.HotmailUtils?.getHotmailBulkActionLabel;
const getHotmailListToggleLabel = window.HotmailUtils?.getHotmailListToggleLabel;
const normalizeLuckmailTimestampValue = window.LuckMailUtils?.normalizeTimestamp
  || ((value) => {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
  });
const HOTMAIL_LIST_EXPANDED_STORAGE_KEY = 'multipage-hotmail-list-expanded';
const sidepanelUpdateService = window.SidepanelUpdateService;
const DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME = window.LuckMailUtils?.DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME || '保留';
const normalizeIcloudHost = window.IcloudUtils?.normalizeIcloudHost
  || ((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'icloud.com' || normalized === 'icloud.com.cn' ? normalized : '';
  });
const getIcloudLoginUrlForHost = window.IcloudUtils?.getIcloudLoginUrlForHost
  || ((host) => host === 'icloud.com.cn' ? 'https://www.icloud.com.cn/' : (host === 'icloud.com' ? 'https://www.icloud.com/' : ''));

let lastRenderedLuckmailPurchases = [];
let luckmailSelectedPurchaseIds = new Set();
let luckmailSearchTerm = '';
let luckmailFilterMode = 'all';
let luckmailRefreshQueued = false;

btnAutoCancelSchedule?.remove();
const MAIL_PROVIDER_LOGIN_CONFIGS = {
  [ICLOUD_PROVIDER]: {
    label: 'iCloud 邮箱',
    buttonLabel: '登录',
  },
  [GMAIL_PROVIDER]: {
    label: 'Gmail 邮箱',
    url: 'https://mail.google.com/mail/u/0/#inbox',
    buttonLabel: '登录',
  },
  '163': {
    label: '163 邮箱',
    url: 'https://mail.163.com/',
    buttonLabel: '登录',
  },
  '163-vip': {
    label: '163 VIP 邮箱',
    url: 'https://webmail.vip.163.com/',
    buttonLabel: '登录',
  },
  qq: {
    label: 'QQ 邮箱',
    url: 'https://wx.mail.qq.com/',
    buttonLabel: '登录',
  },
  'cloudflare-temp-email': {
    label: 'Cloudflare Temp Email GitHub',
    url: 'https://github.com/dreamhunter2333/cloudflare_temp_email',
    buttonLabel: 'GitHub',
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

function usesGeneratedAliasMailProvider(provider, mail2925Mode = getSelectedMail2925Mode()) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider === GMAIL_PROVIDER) {
    return true;
  }
  return normalizedProvider === '2925'
    && normalizeMail2925Mode(mail2925Mode) === MAIL_2925_MODE_PROVIDE;
}

function parseGmailBaseEmail(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^([^@\s+]+)@((?:gmail|googlemail)\.com)$/i);
  if (!match) return null;
  return {
    localPart: match[1],
    domain: match[2].toLowerCase(),
  };
}

function isManagedGmailAlias(value, baseEmail) {
  const parsedBase = parseGmailBaseEmail(baseEmail);
  if (!parsedBase) return false;

  const match = String(value || '').trim().toLowerCase().match(/^([^@\s+]+)(?:\+[^@\s]+)?@((?:gmail|googlemail)\.com)$/i);
  if (!match) return false;

  return match[1] === parsedBase.localPart && match[2] === parsedBase.domain;
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
    message: `检测到当前已有流程进度。${continueMessage}重新开始会清空当前流程进度并从步骤 1 新开一轮。`,
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

function getVisibleStepStatuses(state = latestState) {
  const statuses = getStepStatuses(state);
  return VISIBLE_STEPS.map((step) => statuses[step]);
}

function getPreviousVisibleStep(step) {
  const index = VISIBLE_STEPS.indexOf(step);
  return index > 0 ? VISIBLE_STEPS[index - 1] : null;
}

function getFirstUnfinishedStep(state = latestState) {
  const statuses = getStepStatuses(state);
  for (const step of VISIBLE_STEPS) {
    if (!isDoneStatus(statuses[step])) {
      return step;
    }
  }
  return null;
}

function getRunningSteps(state = latestState) {
  const statuses = getStepStatuses(state);
  return VISIBLE_STEPS.filter((step) => statuses[step] === 'running');
}

function hasSavedProgress(state = latestState) {
  return getVisibleStepStatuses(state).some((status) => status !== 'pending');
}

function shouldOfferAutoModeChoice(state = latestState) {
  return hasSavedProgress(state) && getFirstUnfinishedStep(state) !== null;
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
  return Math.min(50, Math.max(1, parseInt(inputRunCount.value, 10) || 1));
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
    return;
  }

  const remainingMs = countdown.at - Date.now();
  autoScheduleBar.style.display = 'flex';
  if (btnAutoRunNow) {
    btnAutoRunNow.hidden = false;
    btnAutoRunNow.textContent = currentAutoRun.phase === 'waiting_interval' ? '立即继续' : '立即开始';
  }
  if (btnAutoCancelSchedule) {
    btnAutoCancelSchedule.hidden = true;
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

function normalizeCloudflareTempEmailBaseUrlValue(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    parsed.hash = '';
    parsed.search = '';
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

function normalizeCloudflareTempEmailReceiveMailboxValue(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function normalizeCloudflareTempEmailDomainValue(value = '') {
  return normalizeCloudflareDomainValue(value);
}

function normalizeCloudflareTempEmailDomains(values = []) {
  const seen = new Set();
  const domains = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCloudflareTempEmailDomainValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    domains.push(normalized);
  }
  return domains;
}

function getCloudflareDomainsFromState() {
  const domains = normalizeCloudflareDomains(latestState?.cloudflareDomains || []);
  const activeDomain = normalizeCloudflareDomainValue(latestState?.cloudflareDomain || '');
  if (activeDomain && !domains.includes(activeDomain)) {
    domains.unshift(activeDomain);
  }
  return { domains, activeDomain: activeDomain || domains[0] || '' };
}

function getCloudflareTempEmailDomainsFromState() {
  const domains = normalizeCloudflareTempEmailDomains(latestState?.cloudflareTempEmailDomains || []);
  const activeDomain = normalizeCloudflareTempEmailDomainValue(latestState?.cloudflareTempEmailDomain || '');
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

function renderCloudflareTempEmailDomainOptions(preferredDomain = '') {
  const preferred = normalizeCloudflareTempEmailDomainValue(preferredDomain);
  const { domains, activeDomain } = getCloudflareTempEmailDomainsFromState();
  const selected = preferred || activeDomain;

  selectTempEmailDomain.innerHTML = '';
  if (domains.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请先添加域名';
    selectTempEmailDomain.appendChild(option);
    selectTempEmailDomain.disabled = true;
    selectTempEmailDomain.value = '';
    return;
  }

  for (const domain of domains) {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    selectTempEmailDomain.appendChild(option);
  }
  selectTempEmailDomain.disabled = false;
  selectTempEmailDomain.value = domains.includes(selected) ? selected : domains[0];
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

function setCloudflareTempEmailDomainEditMode(editing, options = {}) {
  const { clearInput = false } = options;
  cloudflareTempEmailDomainEditMode = Boolean(editing);
  selectTempEmailDomain.style.display = cloudflareTempEmailDomainEditMode ? 'none' : '';
  inputTempEmailDomain.style.display = cloudflareTempEmailDomainEditMode ? '' : 'none';
  btnTempEmailDomainMode.textContent = cloudflareTempEmailDomainEditMode ? '保存' : '添加';
  if (cloudflareTempEmailDomainEditMode) {
    if (clearInput) {
      inputTempEmailDomain.value = '';
    }
    inputTempEmailDomain.focus();
  } else if (clearInput) {
    inputTempEmailDomain.value = '';
  }
}

function collectSettingsPayload() {
  const { domains, activeDomain } = getCloudflareDomainsFromState();
  const selectedCloudflareDomain = normalizeCloudflareDomainValue(
    !cloudflareDomainEditMode ? selectCfDomain.value : activeDomain
  ) || activeDomain;
  const { domains: tempEmailDomains, activeDomain: tempEmailActiveDomain } = getCloudflareTempEmailDomainsFromState();
  const selectedCloudflareTempEmailDomain = normalizeCloudflareTempEmailDomainValue(
    !cloudflareTempEmailDomainEditMode ? selectTempEmailDomain.value : tempEmailActiveDomain
  ) || tempEmailActiveDomain;
  return {
    panelMode: selectPanelMode.value,
    vpsUrl: inputVpsUrl.value.trim(),
    vpsPassword: inputVpsPassword.value,
    localCpaStep9Mode: getSelectedLocalCpaStep9Mode(),
    cpaCallbackMode: getSelectedCpaCallbackMode(),
    sub2apiUrl: inputSub2ApiUrl.value.trim(),
    sub2apiEmail: inputSub2ApiEmail.value.trim(),
    sub2apiPassword: inputSub2ApiPassword.value,
    sub2apiGroupName: inputSub2ApiGroup.value.trim(),
    customPassword: inputPassword.value,
    mailProvider: selectMailProvider.value,
    mail2925Mode: getSelectedMail2925Mode(),
    emailGenerator: selectEmailGenerator.value,
    autoDeleteUsedIcloudAlias: checkboxAutoDeleteIcloud?.checked,
    icloudHostPreference: selectIcloudHostPreference?.value || 'auto',
    emailPrefix: inputEmailPrefix.value.trim(),
    inbucketHost: inputInbucketHost.value.trim(),
    inbucketMailbox: inputInbucketMailbox.value.trim(),
    hotmailServiceMode: getSelectedHotmailServiceMode(),
    hotmailRemoteBaseUrl: inputHotmailRemoteBaseUrl.value.trim(),
    hotmailLocalBaseUrl: inputHotmailLocalBaseUrl.value.trim(),
    luckmailApiKey: inputLuckmailApiKey.value,
    luckmailBaseUrl: normalizeLuckmailBaseUrl(inputLuckmailBaseUrl.value),
    luckmailEmailType: normalizeLuckmailEmailType(selectLuckmailEmailType.value),
    luckmailDomain: inputLuckmailDomain.value.trim(),
    cloudflareDomain: selectedCloudflareDomain,
    cloudflareDomains: domains,
    cloudflareTempEmailBaseUrl: normalizeCloudflareTempEmailBaseUrlValue(inputTempEmailBaseUrl.value),
    cloudflareTempEmailAdminAuth: inputTempEmailAdminAuth.value,
    cloudflareTempEmailCustomAuth: inputTempEmailCustomAuth.value,
    cloudflareTempEmailReceiveMailbox: normalizeCloudflareTempEmailReceiveMailboxValue(inputTempEmailReceiveMailbox.value),
    cloudflareTempEmailDomain: selectedCloudflareTempEmailDomain,
    cloudflareTempEmailDomains: tempEmailDomains,
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

function normalizeCpaCallbackMode(value = '') {
  return String(value || '').trim().toLowerCase() === 'step6'
    ? 'step6'
    : DEFAULT_CPA_CALLBACK_MODE;
}

function normalizeMail2925Mode(value = '') {
  return String(value || '').trim().toLowerCase() === MAIL_2925_MODE_RECEIVE
    ? MAIL_2925_MODE_RECEIVE
    : DEFAULT_MAIL_2925_MODE;
}

function normalizeHotmailServiceMode(value = '') {
  if (typeof normalizeHotmailServiceModeFromUtils === 'function') {
    return normalizeHotmailServiceModeFromUtils(value);
  }
  return String(value || '').trim().toLowerCase() === HOTMAIL_SERVICE_MODE_REMOTE
    ? HOTMAIL_SERVICE_MODE_REMOTE
    : HOTMAIL_SERVICE_MODE_LOCAL;
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

function getSelectedCpaCallbackMode() {
  const activeButton = cpaCallbackModeButtons.find((button) => button.classList.contains('is-active'));
  return normalizeCpaCallbackMode(activeButton?.dataset.cpaCallbackMode);
}

function setCpaCallbackMode(mode) {
  const resolvedMode = normalizeCpaCallbackMode(mode);
  cpaCallbackModeButtons.forEach((button) => {
    const active = button.dataset.cpaCallbackMode === resolvedMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function getSelectedMail2925Mode() {
  const activeButton = mail2925ModeButtons.find((button) => button.classList.contains('is-active'));
  return normalizeMail2925Mode(activeButton?.dataset.mail2925Mode);
}

function setMail2925Mode(mode) {
  const resolvedMode = normalizeMail2925Mode(mode);
  mail2925ModeButtons.forEach((button) => {
    const active = button.dataset.mail2925Mode === resolvedMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function getSelectedHotmailServiceMode() {
  const activeButton = hotmailServiceModeButtons.find((button) => button.classList.contains('is-active'));
  return normalizeHotmailServiceMode(activeButton?.dataset.hotmailServiceMode);
}

function setHotmailServiceMode(mode) {
  const resolvedMode = normalizeHotmailServiceMode(mode);
  hotmailServiceModeButtons.forEach((button) => {
    const active = button.dataset.hotmailServiceMode === resolvedMode;
    button.disabled = false;
    button.setAttribute('aria-disabled', 'false');
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

function updateSaveButtonState() {
  btnSaveSettings.disabled = settingsSaveInFlight || !settingsDirty;
  updateConfigMenuControls();
  btnSaveSettings.textContent = settingsSaveInFlight ? '保存中' : '保存';
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
  setCpaCallbackMode(state?.cpaCallbackMode);
  selectPanelMode.value = state?.panelMode || 'cpa';
  inputSub2ApiUrl.value = state?.sub2apiUrl || '';
  inputSub2ApiEmail.value = state?.sub2apiEmail || '';
  inputSub2ApiPassword.value = state?.sub2apiPassword || '';
  inputSub2ApiGroup.value = state?.sub2apiGroupName || '';
  const restoredMailProvider = isCustomMailProvider(state?.mailProvider)
    || [ICLOUD_PROVIDER, 'hotmail-api', GMAIL_PROVIDER, 'luckmail-api', '163', '163-vip', 'qq', 'inbucket', '2925', 'cloudflare-temp-email'].includes(String(state?.mailProvider || '').trim())
    ? String(state?.mailProvider || '163').trim()
    : (String(state?.emailGenerator || '').trim().toLowerCase() === 'custom'
      || String(state?.emailGenerator || '').trim().toLowerCase() === 'manual'
      ? 'custom'
      : '163');
  selectMailProvider.value = restoredMailProvider;
  setMail2925Mode(state?.mail2925Mode);
  {
    const restoredEmailGenerator = String(state?.emailGenerator || '').trim().toLowerCase();
    if (restoredEmailGenerator === 'icloud') {
      selectEmailGenerator.value = 'icloud';
    } else if (restoredEmailGenerator === 'cloudflare') {
      selectEmailGenerator.value = 'cloudflare';
    } else if (restoredEmailGenerator === 'cloudflare-temp-email') {
      selectEmailGenerator.value = 'cloudflare-temp-email';
    } else {
      selectEmailGenerator.value = 'duck';
    }
  }
  if (selectIcloudHostPreference) {
    selectIcloudHostPreference.value = String(state?.icloudHostPreference || '').trim().toLowerCase() === 'icloud.com'
      ? 'icloud.com'
      : (String(state?.icloudHostPreference || '').trim().toLowerCase() === 'icloud.com.cn' ? 'icloud.com.cn' : 'auto');
  }
  if (checkboxAutoDeleteIcloud) {
    checkboxAutoDeleteIcloud.checked = Boolean(state?.autoDeleteUsedIcloudAlias);
  }
  inputEmailPrefix.value = state?.emailPrefix || '';
  inputInbucketHost.value = state?.inbucketHost || '';
  inputInbucketMailbox.value = state?.inbucketMailbox || '';
  setHotmailServiceMode(state?.hotmailServiceMode);
  inputHotmailRemoteBaseUrl.value = state?.hotmailRemoteBaseUrl || '';
  inputHotmailLocalBaseUrl.value = state?.hotmailLocalBaseUrl || '';
  inputLuckmailApiKey.value = state?.luckmailApiKey || '';
  inputLuckmailBaseUrl.value = normalizeLuckmailBaseUrl(state?.luckmailBaseUrl);
  selectLuckmailEmailType.value = normalizeLuckmailEmailType(state?.luckmailEmailType);
  inputLuckmailDomain.value = state?.luckmailDomain || '';
  inputTempEmailBaseUrl.value = state?.cloudflareTempEmailBaseUrl || '';
  inputTempEmailAdminAuth.value = state?.cloudflareTempEmailAdminAuth || '';
  inputTempEmailCustomAuth.value = state?.cloudflareTempEmailCustomAuth || '';
  inputTempEmailReceiveMailbox.value = state?.cloudflareTempEmailReceiveMailbox || '';
  renderCloudflareDomainOptions(state?.cloudflareDomain || '');
  setCloudflareDomainEditMode(false, { clearInput: true });
  renderCloudflareTempEmailDomainOptions(state?.cloudflareTempEmailDomain || '');
  setCloudflareTempEmailDomainEditMode(false, { clearInput: true });
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
  if (isLuckmailProvider(state?.mailProvider)) {
    queueLuckmailPurchaseRefresh();
  }
  updateButtonStates();
}

async function restoreState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    applySettingsState(state);
    if (getSelectedEmailGenerator() === 'icloud' && icloudSection?.style.display !== 'none') {
      refreshIcloudAliases({ silent: true }).catch(() => { });
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
  extensionVersionMeta.hidden = true;
  extensionVersionMeta.textContent = '';

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
      extensionVersionMeta.textContent = snapshot?.errorMessage || 'GitHub Releases 检查失败';
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
  extensionVersionMeta.hidden = true;
  extensionVersionMeta.textContent = '';
  if (btnReleaseLog) {
    btnReleaseLog.hidden = true;
  }
  resetUpdateCard();

  if (!sidepanelUpdateService) {
    extensionVersionMeta.textContent = '更新检查服务不可用';
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

function isLuckmailProvider(provider = selectMailProvider.value) {
  return String(provider || '').trim().toLowerCase() === LUCKMAIL_PROVIDER;
}

function isIcloudMailProvider(provider = selectMailProvider.value) {
  return String(provider || '').trim().toLowerCase() === ICLOUD_PROVIDER;
}

function normalizeLuckmailBaseUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return DEFAULT_LUCKMAIL_BASE_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_LUCKMAIL_BASE_URL;
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_LUCKMAIL_BASE_URL;
  }
}

function normalizeLuckmailEmailType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['self_built', 'ms_imap', 'ms_graph', 'google_variant'].includes(normalized)
    ? normalized
    : DEFAULT_LUCKMAIL_EMAIL_TYPE;
}

function getSelectedEmailGenerator() {
  const generator = String(selectEmailGenerator.value || '').trim().toLowerCase();
  if (generator === 'custom' || generator === 'manual') {
    return 'custom';
  }
  if (generator === 'icloud') {
    return 'icloud';
  }
  if (generator === 'cloudflare') return 'cloudflare';
  if (generator === 'cloudflare-temp-email') return 'cloudflare-temp-email';
  return 'duck';
}

function getEmailGeneratorUiCopy() {
  if (getSelectedEmailGenerator() === 'custom') {
    return getCustomMailProviderUiCopy();
  }
  if (getSelectedEmailGenerator() === 'icloud') {
    return {
      buttonLabel: '获取',
      placeholder: '点击获取 iCloud 隐私邮箱，或手动粘贴邮箱',
      successVerb: '获取',
      label: 'iCloud 隐私邮箱',
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
  if (getSelectedEmailGenerator() === 'cloudflare-temp-email') {
    return {
      buttonLabel: '生成 Temp',
      placeholder: '点击生成 Cloudflare Temp Email，或手动粘贴邮箱',
      successVerb: '生成',
      label: 'Cloudflare Temp Email',
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

function getHotmailAccounts(state = latestState) {
  return Array.isArray(state?.hotmailAccounts) ? state.hotmailAccounts : [];
}

function getCurrentHotmailAccount(state = latestState) {
  const currentId = state?.currentHotmailAccountId;
  return getHotmailAccounts(state).find((account) => account.id === currentId) || null;
}

function getCurrentHotmailEmail(state = latestState) {
  return String(getCurrentHotmailAccount(state)?.email || '').trim();
}

function getCurrentLuckmailPurchase(state = latestState) {
  return state?.currentLuckmailPurchase || null;
}

function getCurrentLuckmailEmail(state = latestState) {
  return String(getCurrentLuckmailPurchase(state)?.email_address || '').trim();
}

function getLuckmailUsedPurchases(state = latestState) {
  const rawValue = state?.luckmailUsedPurchases;
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.entries(rawValue).reduce((result, [key, value]) => {
    const numeric = Number(key);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return result;
    }
    result[String(Math.floor(numeric))] = Boolean(value);
    return result;
  }, {});
}

function normalizeLuckmailProjectName(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getLuckmailPreserveTagName(state = latestState) {
  return String(state?.luckmailPreserveTagName || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME;
}

function formatLuckmailDateTime(value) {
  const timestamp = normalizeLuckmailTimestampValue(value);
  if (!timestamp) {
    return String(value || '').trim() || '未知';
  }
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  });
}

function normalizeLuckmailSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getFilteredLuckmailPurchases(purchases = lastRenderedLuckmailPurchases) {
  const searchTerm = normalizeLuckmailSearchText(luckmailSearchTerm);
  return (Array.isArray(purchases) ? purchases : []).filter((purchase) => {
    const matchesFilter = (() => {
      switch (luckmailFilterMode) {
        case 'reusable': return Boolean(purchase.reusable);
        case 'used': return Boolean(purchase.used);
        case 'unused': return !purchase.used;
        case 'preserved': return Boolean(purchase.preserved);
        case 'disabled': return Boolean(purchase.disabled);
        default: return true;
      }
    })();

    if (!matchesFilter) return false;
    if (!searchTerm) return true;

    const haystack = [
      purchase.email_address,
      purchase.project_name,
      purchase.tag_name,
      purchase.used ? '已用 used' : '未用 unused',
      purchase.preserved ? '保留 preserved' : '',
      purchase.disabled ? '已禁用 disabled' : '',
      purchase.reusable ? '可复用 reusable' : '',
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm);
  });
}

function pruneLuckmailSelection(purchases = lastRenderedLuckmailPurchases) {
  const existingIds = new Set((Array.isArray(purchases) ? purchases : []).map((purchase) => String(purchase.id)));
  luckmailSelectedPurchaseIds = new Set([...luckmailSelectedPurchaseIds].filter((id) => existingIds.has(id)));
}

function updateLuckmailBulkUI(visiblePurchases = getFilteredLuckmailPurchases()) {
  if (!checkboxLuckmailSelectAll || !luckmailSelectionSummary) {
    return;
  }

  const visibleIds = visiblePurchases.map((purchase) => String(purchase.id));
  const selectedVisibleCount = visibleIds.filter((id) => luckmailSelectedPurchaseIds.has(id)).length;
  const hasVisible = visibleIds.length > 0;
  const hasSelection = luckmailSelectedPurchaseIds.size > 0;

  checkboxLuckmailSelectAll.checked = hasVisible && selectedVisibleCount === visibleIds.length;
  checkboxLuckmailSelectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  checkboxLuckmailSelectAll.disabled = !hasVisible;
  luckmailSelectionSummary.textContent = `已选 ${luckmailSelectedPurchaseIds.size} 个（当前显示 ${visibleIds.length} 个）`;

  if (btnLuckmailBulkUsed) btnLuckmailBulkUsed.disabled = !hasSelection;
  if (btnLuckmailBulkUnused) btnLuckmailBulkUnused.disabled = !hasSelection;
  if (btnLuckmailBulkPreserve) btnLuckmailBulkPreserve.disabled = !hasSelection;
  if (btnLuckmailBulkUnpreserve) btnLuckmailBulkUnpreserve.disabled = !hasSelection;
  if (btnLuckmailBulkDisable) btnLuckmailBulkDisable.disabled = !hasSelection;
  if (btnLuckmailBulkEnable) btnLuckmailBulkEnable.disabled = !hasSelection;
}

function setLuckmailLoadingState(loading, summary = '') {
  if (btnLuckmailRefresh) btnLuckmailRefresh.disabled = loading;
  if (btnLuckmailDisableUsed) btnLuckmailDisableUsed.disabled = loading;
  if (inputLuckmailSearch) inputLuckmailSearch.disabled = loading;
  if (selectLuckmailFilter) selectLuckmailFilter.disabled = loading;
  if (checkboxLuckmailSelectAll) checkboxLuckmailSelectAll.disabled = loading || getFilteredLuckmailPurchases().length === 0;
  if (btnLuckmailBulkUsed) btnLuckmailBulkUsed.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (btnLuckmailBulkUnused) btnLuckmailBulkUnused.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (btnLuckmailBulkPreserve) btnLuckmailBulkPreserve.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (btnLuckmailBulkUnpreserve) btnLuckmailBulkUnpreserve.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (btnLuckmailBulkDisable) btnLuckmailBulkDisable.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (btnLuckmailBulkEnable) btnLuckmailBulkEnable.disabled = loading || luckmailSelectedPurchaseIds.size === 0;
  if (summary && luckmailSummary) {
    luckmailSummary.textContent = summary;
  }
}

function renderLuckmailPurchases(purchases = []) {
  if (!luckmailList || !luckmailSummary) return;

  lastRenderedLuckmailPurchases = Array.isArray(purchases) ? purchases : [];
  pruneLuckmailSelection(lastRenderedLuckmailPurchases);
  luckmailList.innerHTML = '';

  if (!lastRenderedLuckmailPurchases.length) {
    luckmailSelectedPurchaseIds.clear();
    luckmailList.innerHTML = '<div class="luckmail-empty">未找到 openai 项目的 LuckMail 邮箱。</div>';
    luckmailSummary.textContent = '加载已购邮箱后可在这里管理 openai 项目的 LuckMail 邮箱。';
    if (btnLuckmailDisableUsed) btnLuckmailDisableUsed.disabled = true;
    updateLuckmailBulkUI([]);
    return;
  }

  const usedCount = lastRenderedLuckmailPurchases.filter((purchase) => purchase.used).length;
  const reusableCount = lastRenderedLuckmailPurchases.filter((purchase) => purchase.reusable).length;
  const disableUsedCount = lastRenderedLuckmailPurchases.filter((purchase) => purchase.used && !purchase.preserved && !purchase.disabled).length;
  luckmailSummary.textContent = `已加载 ${lastRenderedLuckmailPurchases.length} 个 openai 邮箱，其中 ${reusableCount} 个可复用，${usedCount} 个已本地标记为已用。`;
  if (btnLuckmailDisableUsed) {
    btnLuckmailDisableUsed.textContent = `禁用已用${disableUsedCount > 0 ? `（${disableUsedCount}）` : ''}`;
    btnLuckmailDisableUsed.disabled = disableUsedCount === 0;
  }

  const visiblePurchases = getFilteredLuckmailPurchases(lastRenderedLuckmailPurchases);
  if (!visiblePurchases.length) {
    luckmailList.innerHTML = '<div class="luckmail-empty">没有匹配当前筛选条件的 LuckMail 邮箱。</div>';
    updateLuckmailBulkUI([]);
    return;
  }

  for (const purchase of visiblePurchases) {
    const purchaseId = String(purchase.id);
    const item = document.createElement('div');
    item.className = `luckmail-item${purchase.current ? ' is-current' : ''}`;
    item.innerHTML = `
      <input class="luckmail-item-check" type="checkbox" data-action="select" ${luckmailSelectedPurchaseIds.has(purchaseId) ? 'checked' : ''} />
      <div class="luckmail-item-main">
        <div class="luckmail-item-email-row">
          <div class="luckmail-item-email">${escapeHtml(purchase.email_address || '(未知邮箱)')}</div>
          <button
            class="hotmail-copy-btn"
            type="button"
            data-action="copy-email"
            title="复制邮箱"
            aria-label="复制邮箱 ${escapeHtml(purchase.email_address || '')}"
          >${COPY_ICON}</button>
        </div>
        <div class="luckmail-item-meta">
          <span class="luckmail-tag">${escapeHtml(normalizeLuckmailProjectName(purchase.project_name) || 'openai')}</span>
          ${purchase.reusable ? '<span class="luckmail-tag active">可复用</span>' : ''}
          ${purchase.current ? '<span class="luckmail-tag current">当前</span>' : ''}
          ${purchase.used ? '<span class="luckmail-tag used">已用</span>' : ''}
          ${purchase.preserved ? '<span class="luckmail-tag">保留</span>' : ''}
          ${purchase.disabled ? '<span class="luckmail-tag disabled">已禁用</span>' : ''}
          ${purchase.tag_name && normalizeLuckmailSearchText(purchase.tag_name) !== normalizeLuckmailSearchText(getLuckmailPreserveTagName())
            ? `<span class="luckmail-tag">${escapeHtml(purchase.tag_name)}</span>`
            : ''}
        </div>
        <div class="luckmail-item-details">
          <span>ID：${escapeHtml(String(purchase.id || ''))}</span>
          <span>保修至：${escapeHtml(formatLuckmailDateTime(purchase.warranty_until))}</span>
        </div>
      </div>
      <div class="luckmail-item-actions">
        <button class="btn btn-outline btn-xs" type="button" data-action="use">使用此邮箱</button>
        <button class="btn btn-outline btn-xs" type="button" data-action="toggle-used">${escapeHtml(purchase.used ? '标记未用' : '标记已用')}</button>
        <button class="btn btn-outline btn-xs" type="button" data-action="toggle-preserved">${escapeHtml(purchase.preserved ? '取消保留' : '保留')}</button>
        <button class="btn btn-outline btn-xs" type="button" data-action="toggle-disabled">${escapeHtml(purchase.disabled ? '启用' : '禁用')}</button>
      </div>
    `;

    item.querySelector('[data-action="select"]').addEventListener('change', (event) => {
      if (event.target.checked) {
        luckmailSelectedPurchaseIds.add(purchaseId);
      } else {
        luckmailSelectedPurchaseIds.delete(purchaseId);
      }
      updateLuckmailBulkUI(visiblePurchases);
    });
    item.querySelector('[data-action="copy-email"]').addEventListener('click', async () => {
      await copyTextToClipboard(purchase.email_address || '');
      showToast('邮箱已复制', 'success', 1600);
    });
    item.querySelector('[data-action="use"]').addEventListener('click', async () => {
      await selectSingleLuckmailPurchase(purchase);
    });
    item.querySelector('[data-action="toggle-used"]').addEventListener('click', async () => {
      await setSingleLuckmailPurchaseUsedState(purchase, !purchase.used);
    });
    item.querySelector('[data-action="toggle-preserved"]').addEventListener('click', async () => {
      await setSingleLuckmailPurchasePreservedState(purchase, !purchase.preserved);
    });
    item.querySelector('[data-action="toggle-disabled"]').addEventListener('click', async () => {
      await setSingleLuckmailPurchaseDisabledState(purchase, !purchase.disabled);
    });
    luckmailList.appendChild(item);
  }

  updateLuckmailBulkUI(visiblePurchases);
}

async function refreshLuckmailPurchases(options = {}) {
  const { silent = false } = options;
  if (!luckmailSection || luckmailSection.style.display === 'none') {
    return;
  }

  if (!silent) setLuckmailLoadingState(true, '正在加载 LuckMail openai 邮箱...');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_LUCKMAIL_PURCHASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) throw new Error(response.error);
    renderLuckmailPurchases(response?.purchases || []);
  } catch (err) {
    luckmailSelectedPurchaseIds.clear();
    if (luckmailList) {
      luckmailList.innerHTML = '<div class="luckmail-empty">无法加载 LuckMail 邮箱列表。</div>';
    }
    if (luckmailSummary) {
      luckmailSummary.textContent = err.message;
    }
    updateLuckmailBulkUI([]);
    if (!silent) {
      showToast(`LuckMail 邮箱列表加载失败：${err.message}`, 'error');
    }
  } finally {
    setLuckmailLoadingState(false);
  }
}

function queueLuckmailPurchaseRefresh() {
  if (luckmailRefreshQueued) return;
  luckmailRefreshQueued = true;
  setTimeout(async () => {
    luckmailRefreshQueued = false;
    await refreshLuckmailPurchases({ silent: true });
  }, 150);
}

async function selectSingleLuckmailPurchase(purchase) {
  setLuckmailLoadingState(true, `正在切换到 ${purchase.email_address} ...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SELECT_LUCKMAIL_PURCHASE',
      source: 'sidepanel',
      payload: { purchaseId: purchase.id },
    });
    if (response?.error) throw new Error(response.error);
    inputEmail.value = response?.purchase?.email_address || purchase.email_address || '';
    showToast(`已切换当前 LuckMail 邮箱为 ${purchase.email_address}`, 'success', 2200);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`切换 LuckMail 邮箱失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
  }
}

async function setSingleLuckmailPurchaseUsedState(purchase, used) {
  setLuckmailLoadingState(true, `正在更新 ${purchase.email_address} 的已用状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_LUCKMAIL_PURCHASE_USED_STATE',
      source: 'sidepanel',
      payload: { purchaseId: purchase.id, used },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`${purchase.email_address} 已${used ? '标记为已用' : '恢复为未用'}`, 'success', 2200);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`更新 LuckMail 已用状态失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
  }
}

async function setSingleLuckmailPurchasePreservedState(purchase, preserved) {
  setLuckmailLoadingState(true, `正在更新 ${purchase.email_address} 的保留状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_LUCKMAIL_PURCHASE_PRESERVED_STATE',
      source: 'sidepanel',
      payload: { purchaseId: purchase.id, preserved },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`${purchase.email_address} 已${preserved ? '设为保留' : '取消保留'}`, 'success', 2200);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`更新 LuckMail 保留状态失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
  }
}

async function setSingleLuckmailPurchaseDisabledState(purchase, disabled) {
  setLuckmailLoadingState(true, `正在${disabled ? '禁用' : '启用'} ${purchase.email_address} ...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_LUCKMAIL_PURCHASE_DISABLED_STATE',
      source: 'sidepanel',
      payload: { purchaseId: purchase.id, disabled },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`${purchase.email_address} 已${disabled ? '禁用' : '启用'}`, 'success', 2200);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`更新 LuckMail 禁用状态失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
  }
}

async function runBulkLuckmailAction(action) {
  const selectedIds = lastRenderedLuckmailPurchases
    .filter((purchase) => luckmailSelectedPurchaseIds.has(String(purchase.id)))
    .map((purchase) => purchase.id);
  if (!selectedIds.length) {
    updateLuckmailBulkUI();
    return;
  }

  const actionLabelMap = {
    used: '标记已用',
    unused: '标记未用',
    preserve: '保留',
    unpreserve: '取消保留',
    disable: '禁用',
    enable: '启用',
  };

  setLuckmailLoadingState(true, `正在批量${actionLabelMap[action] || '处理'} LuckMail 邮箱...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'BATCH_UPDATE_LUCKMAIL_PURCHASES',
      source: 'sidepanel',
      payload: { action, ids: selectedIds },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`已批量${actionLabelMap[action] || '处理'} ${selectedIds.length} 个 LuckMail 邮箱`, 'success', 2400);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`批量处理 LuckMail 邮箱失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
    updateLuckmailBulkUI();
  }
}

async function disableUsedLuckmailPurchases() {
  const confirmed = await openConfirmModal({
    title: '禁用已用 LuckMail 邮箱',
    message: '确认禁用所有本地已用且未保留的 openai LuckMail 邮箱吗？',
    confirmLabel: '确认禁用',
    confirmVariant: 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  setLuckmailLoadingState(true, '正在禁用已用 LuckMail 邮箱...');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DISABLE_USED_LUCKMAIL_PURCHASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) throw new Error(response.error);
    const disabledCount = Array.isArray(response?.disabledIds) ? response.disabledIds.length : 0;
    showToast(`已禁用 ${disabledCount} 个 LuckMail 邮箱`, disabledCount > 0 ? 'success' : 'info', 2400);
    await refreshLuckmailPurchases({ silent: true });
  } catch (err) {
    if (luckmailSummary) luckmailSummary.textContent = err.message;
    showToast(`禁用已用 LuckMail 邮箱失败：${err.message}`, 'error');
  } finally {
    setLuckmailLoadingState(false);
  }
}

function getMailProviderLoginConfig(provider = selectMailProvider.value) {
  return MAIL_PROVIDER_LOGIN_CONFIGS[String(provider || '').trim()] || null;
}

function getSelectedIcloudHostPreference() {
  return normalizeIcloudHost(selectIcloudHostPreference?.value || latestState?.icloudHostPreference || '')
    || normalizeIcloudHost(latestState?.preferredIcloudHost)
    || 'icloud.com';
}

function getMailProviderLoginUrl(provider = selectMailProvider.value) {
  const config = getMailProviderLoginConfig(provider);
  if (String(provider || '').trim() === ICLOUD_PROVIDER) {
    return getIcloudLoginUrlForHost(getSelectedIcloudHostPreference());
  }
  const url = String(config?.url || '').trim();
  return url ? url : '';
}

function isCurrentEmailManagedByHotmail(state = latestState) {
  const hotmailEmail = getCurrentHotmailEmail(state);
  if (!hotmailEmail) {
    return false;
  }

  const inputEmailValue = String(inputEmail.value || '').trim();
  const stateEmailValue = String(state?.email || '').trim();
  return inputEmailValue === hotmailEmail || stateEmailValue === hotmailEmail;
}

function isCurrentEmailManagedByLuckmail(state = latestState) {
  const luckmailEmail = getCurrentLuckmailEmail(state);
  if (!luckmailEmail) {
    return false;
  }

  const inputEmailValue = String(inputEmail.value || '').trim();
  const stateEmailValue = String(state?.email || '').trim();
  return inputEmailValue === luckmailEmail || stateEmailValue === luckmailEmail;
}

function isCurrentEmailManagedByGeneratedAlias(
  provider = latestState?.mailProvider,
  state = latestState,
  mail2925Mode = latestState?.mail2925Mode
) {
  const normalizedProvider = String(provider || '').trim();
  if (!usesGeneratedAliasMailProvider(normalizedProvider, mail2925Mode)) {
    return false;
  }

  const inputEmailValue = String(inputEmail.value || '').trim().toLowerCase();
  const stateEmailValue = String(state?.email || '').trim().toLowerCase();

  if (normalizedProvider === GMAIL_PROVIDER) {
    const baseEmail = String(state?.emailPrefix || inputEmailPrefix.value || '').trim();
    return isManagedGmailAlias(inputEmailValue, baseEmail) || isManagedGmailAlias(stateEmailValue, baseEmail);
  }

  if (normalizedProvider === '2925') {
    return inputEmailValue.endsWith('@2925.com') || stateEmailValue.endsWith('@2925.com');
  }

  return false;
}

async function maybeClearGeneratedAliasAfterEmailPrefixChange() {
  const provider = selectMailProvider.value;
  const mail2925Mode = latestState?.mail2925Mode;
  if (!usesGeneratedAliasMailProvider(provider, mail2925Mode)) {
    return;
  }

  const previousPrefix = String(latestState?.emailPrefix || '').trim();
  const nextPrefix = inputEmailPrefix.value.trim();
  if (previousPrefix === nextPrefix) {
    return;
  }

  if (!isCurrentEmailManagedByGeneratedAlias(provider, latestState, mail2925Mode)) {
    return;
  }

  await clearRegistrationEmail({ silent: true });
}

function updateMailLoginButtonState() {
  if (!btnMailLogin) {
    return;
  }

  const config = getMailProviderLoginConfig();
  const loginUrl = getMailProviderLoginUrl();
  btnMailLogin.disabled = !loginUrl;
  btnMailLogin.textContent = config?.buttonLabel || '登录';
  btnMailLogin.title = loginUrl ? `打开 ${config.label} 登录页` : '当前邮箱服务没有可跳转的登录页';
}

function getHotmailAccountsByUsage(mode = 'all', state = latestState) {
  const accounts = getHotmailAccounts(state);
  if (typeof filterHotmailAccountsByUsage === 'function') {
    return filterHotmailAccountsByUsage(accounts, mode);
  }
  if (mode === 'used') {
    return accounts.filter((account) => Boolean(account?.used));
  }
  return accounts.slice();
}

function getHotmailBulkActionText(mode, count) {
  if (typeof getHotmailBulkActionLabel === 'function') {
    return getHotmailBulkActionLabel(mode, count);
  }
  const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  const prefix = mode === 'used' ? '清空已用' : '全部删除';
  const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
  return `${prefix}${suffix}`;
}

function getHotmailListToggleText(expanded, count) {
  if (typeof getHotmailListToggleLabel === 'function') {
    return getHotmailListToggleLabel(expanded, count);
  }
  const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
  return `${expanded ? '收起列表' : '展开列表'}${suffix}`;
}

function updateHotmailListViewport() {
  const count = getHotmailAccounts().length;
  const usedCount = getHotmailAccountsByUsage('used').length;
  if (btnClearUsedHotmailAccounts) {
    btnClearUsedHotmailAccounts.textContent = getHotmailBulkActionText('used', usedCount);
    btnClearUsedHotmailAccounts.disabled = usedCount === 0;
  }
  if (btnDeleteAllHotmailAccounts) {
    btnDeleteAllHotmailAccounts.textContent = getHotmailBulkActionText('all', count);
    btnDeleteAllHotmailAccounts.disabled = count === 0;
  }
  if (btnToggleHotmailList) {
    btnToggleHotmailList.textContent = getHotmailListToggleText(hotmailListExpanded, count);
    btnToggleHotmailList.setAttribute('aria-expanded', String(hotmailListExpanded));
    btnToggleHotmailList.disabled = count === 0;
  }
  if (hotmailListShell) {
    hotmailListShell.classList.toggle('is-expanded', hotmailListExpanded);
    hotmailListShell.classList.toggle('is-collapsed', !hotmailListExpanded);
  }
}

function setHotmailListExpanded(expanded, options = {}) {
  const { persist = true } = options;
  hotmailListExpanded = Boolean(expanded);
  updateHotmailListViewport();
  if (persist) {
    localStorage.setItem(HOTMAIL_LIST_EXPANDED_STORAGE_KEY, hotmailListExpanded ? '1' : '0');
  }
}

function initHotmailListExpandedState() {
  const saved = localStorage.getItem(HOTMAIL_LIST_EXPANDED_STORAGE_KEY);
  setHotmailListExpanded(saved === '1', { persist: false });
}

function shouldClearCurrentHotmailSelectionLocally(account) {
  if (typeof shouldClearHotmailCurrentSelection === 'function') {
    return shouldClearHotmailCurrentSelection(account);
  }
  return Boolean(account) && account.used === true;
}

function upsertHotmailAccountListLocally(accounts, nextAccount) {
  if (typeof upsertHotmailAccountInList === 'function') {
    return upsertHotmailAccountInList(accounts, nextAccount);
  }

  const list = Array.isArray(accounts) ? accounts.slice() : [];
  if (!nextAccount?.id) return list;

  const existingIndex = list.findIndex((account) => account?.id === nextAccount.id);
  if (existingIndex === -1) {
    list.push(nextAccount);
    return list;
  }

  list[existingIndex] = nextAccount;
  return list;
}

function refreshHotmailSelectionUI() {
  renderHotmailAccounts();
  if (selectMailProvider.value === 'hotmail-api') {
    inputEmail.value = getCurrentHotmailEmail();
  }
}

function applyHotmailAccountMutation(account, options = {}) {
  if (!account?.id) return;
  const { preserveCurrentSelection = false } = options;

  const nextState = {
    hotmailAccounts: upsertHotmailAccountListLocally(getHotmailAccounts(), account),
  };

  if (!preserveCurrentSelection
    && latestState?.currentHotmailAccountId === account.id
    && shouldClearCurrentHotmailSelectionLocally(account)) {
    nextState.currentHotmailAccountId = null;
    if (selectMailProvider.value === 'hotmail-api') {
      nextState.email = null;
    }
  }

  syncLatestState(nextState);
  refreshHotmailSelectionUI();
}

function formatDateTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return '未使用';
  }
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  });
}

function getHotmailAvailabilityLabel(account) {
  if (account.used) return '已用';
  return '可分配';
}

function getHotmailStatusLabel(account) {
  if (account.used) return '已用';

  switch (account.status) {
    case 'authorized':
      return '可用';
    case 'error':
      return '异常';
    default:
      return '待校验';
  }
}

function getHotmailStatusClass(account) {
  if (account.used) return 'status-used';
  return `status-${account.status || 'pending'}`;
}

function clearHotmailForm() {
  inputHotmailEmail.value = '';
  inputHotmailClientId.value = '';
  inputHotmailPassword.value = '';
  inputHotmailRefreshToken.value = '';
}

function renderHotmailAccounts() {
  if (!hotmailAccountsList) return;
  const accounts = getHotmailAccounts();
  const currentId = latestState?.currentHotmailAccountId || '';

  if (!accounts.length) {
    hotmailAccountsList.innerHTML = '<div class="hotmail-empty">还没有 Hotmail 账号，先添加一条再校验。</div>';
    updateHotmailListViewport();
    return;
  }

  hotmailAccountsList.innerHTML = accounts.map((account) => `
    <div class="hotmail-account-item${account.id === currentId ? ' is-current' : ''}">
      <div class="hotmail-account-top">
        <div class="hotmail-account-title-row">
          <div class="hotmail-account-email">${escapeHtml(account.email || '(未命名账号)')}</div>
          <button
            class="hotmail-copy-btn"
            type="button"
            data-account-action="copy-email"
            data-account-id="${escapeHtml(account.id)}"
            title="复制邮箱"
            aria-label="复制邮箱 ${escapeHtml(account.email || '')}"
          >${COPY_ICON}</button>
        </div>
        <span class="hotmail-status-chip ${escapeHtml(getHotmailStatusClass(account))}">${escapeHtml(getHotmailStatusLabel(account))}</span>
      </div>
      <div class="hotmail-account-meta">
        <span>客户端 ID：${escapeHtml(account.clientId ? `${account.clientId.slice(0, 10)}...` : '未填写')}</span>
        <span>刷新令牌：${account.refreshToken ? '已保存' : '未保存'}</span>
        <span>分配状态: ${escapeHtml(getHotmailAvailabilityLabel(account))}</span>
        <span>上次校验: ${escapeHtml(formatDateTime(account.lastAuthAt))}</span>
        <span>上次使用: ${escapeHtml(formatDateTime(account.lastUsedAt))}</span>
      </div>
      ${account.lastError ? `<div class="hotmail-account-error">${escapeHtml(account.lastError)}</div>` : ''}
      <div class="hotmail-account-actions">
        <button class="btn btn-outline btn-sm" type="button" data-account-action="select" data-account-id="${escapeHtml(account.id)}">使用此账号</button>
        <button class="btn btn-outline btn-sm" type="button" data-account-action="toggle-used" data-account-id="${escapeHtml(account.id)}">${account.used ? '标记未用' : '标记已用'}</button>
        <button class="btn btn-primary btn-sm" type="button" data-account-action="verify" data-account-id="${escapeHtml(account.id)}">校验</button>
        <button class="btn btn-outline btn-sm" type="button" data-account-action="test" data-account-id="${escapeHtml(account.id)}">复制最新验证码</button>
        <button class="btn btn-ghost btn-sm" type="button" data-account-action="delete" data-account-id="${escapeHtml(account.id)}">删除</button>
      </div>
    </div>
  `).join('');
  updateHotmailListViewport();
}

function updateMailProviderUI() {
  const use2925 = selectMailProvider.value === '2925';
  const useGmail = selectMailProvider.value === GMAIL_PROVIDER;
  const mail2925Mode = getSelectedMail2925Mode();
  const useGeneratedAlias = usesGeneratedAliasMailProvider(selectMailProvider.value, mail2925Mode);
  const useInbucket = selectMailProvider.value === 'inbucket';
  const useHotmail = selectMailProvider.value === 'hotmail-api';
  const useLuckmail = isLuckmailProvider();
  const useCustomEmail = isCustomMailProvider();
  const useIcloudProvider = isIcloudMailProvider();
  const useEmailGenerator = !useHotmail && !useLuckmail && !useGeneratedAlias && !useCustomEmail;
  const useCloudflareTempEmailProvider = selectMailProvider.value === 'cloudflare-temp-email';
  updateMailLoginButtonState();
  if (rowMail2925Mode) {
    rowMail2925Mode.style.display = use2925 ? '' : 'none';
  }
  rowEmailPrefix.style.display = useGeneratedAlias ? '' : 'none';
  const hotmailServiceMode = getSelectedHotmailServiceMode();
  rowInbucketHost.style.display = useInbucket ? '' : 'none';
  rowInbucketMailbox.style.display = useInbucket ? '' : 'none';
  const selectedGenerator = getSelectedEmailGenerator();
  const useCloudflare = selectedGenerator === 'cloudflare';
  const useIcloud = selectedGenerator === 'icloud';
  const useCloudflareTempEmailGenerator = selectedGenerator === 'cloudflare-temp-email';
  const showCloudflareDomain = useEmailGenerator && useCloudflare;
  const showCloudflareTempEmailSettings = useCloudflareTempEmailProvider || (useEmailGenerator && useCloudflareTempEmailGenerator);
  const showCloudflareTempEmailReceiveMailbox = useCloudflareTempEmailProvider && !useCloudflareTempEmailGenerator;
  const showCloudflareTempEmailDomain = useEmailGenerator && useCloudflareTempEmailGenerator;
  if (rowEmailGenerator) {
    rowEmailGenerator.style.display = useEmailGenerator ? '' : 'none';
  }
  if (icloudSection) {
    const showIcloudSection = (useEmailGenerator && useIcloud) || useIcloudProvider;
    icloudSection.style.display = showIcloudSection ? '' : 'none';
    if (showIcloudSection && !lastRenderedIcloudAliases.length) {
      queueIcloudAliasRefresh();
    }
    if (!showIcloudSection) {
      hideIcloudLoginHelp();
    }
  }
  rowCfDomain.style.display = showCloudflareDomain ? '' : 'none';
  const { domains } = getCloudflareDomainsFromState();
  if (showCloudflareDomain) {
    setCloudflareDomainEditMode(cloudflareDomainEditMode || domains.length === 0, { clearInput: false });
  } else {
    setCloudflareDomainEditMode(false, { clearInput: false });
  }
  rowTempEmailBaseUrl.style.display = showCloudflareTempEmailSettings ? '' : 'none';
  rowTempEmailAdminAuth.style.display = showCloudflareTempEmailSettings ? '' : 'none';
  rowTempEmailCustomAuth.style.display = showCloudflareTempEmailSettings ? '' : 'none';
  rowTempEmailReceiveMailbox.style.display = showCloudflareTempEmailReceiveMailbox ? '' : 'none';
  rowTempEmailDomain.style.display = showCloudflareTempEmailDomain ? '' : 'none';
  const { domains: tempEmailDomains } = getCloudflareTempEmailDomainsFromState();
  if (showCloudflareTempEmailDomain) {
    setCloudflareTempEmailDomainEditMode(cloudflareTempEmailDomainEditMode || tempEmailDomains.length === 0, { clearInput: false });
  } else {
    setCloudflareTempEmailDomainEditMode(false, { clearInput: false });
  }

  if (hotmailSection) {
    hotmailSection.style.display = useHotmail ? '' : 'none';
  }
  if (luckmailSection) {
    luckmailSection.style.display = useLuckmail ? '' : 'none';
  }
  labelEmailPrefix.textContent = '邮箱前缀';
  inputEmailPrefix.placeholder = '例如 abc';
  selectEmailGenerator.disabled = useHotmail || useLuckmail || useGeneratedAlias || useCustomEmail;
  if (useGmail) {
    labelEmailPrefix.textContent = 'Gmail 原邮箱';
    inputEmailPrefix.placeholder = '例如 yourname@gmail.com';
  }
  if (rowHotmailServiceMode) {
    rowHotmailServiceMode.style.display = useHotmail ? '' : 'none';
  }
  if (rowHotmailRemoteBaseUrl) {
    rowHotmailRemoteBaseUrl.style.display = useHotmail && hotmailServiceMode === HOTMAIL_SERVICE_MODE_REMOTE ? '' : 'none';
  }
  if (rowHotmailLocalBaseUrl) {
    rowHotmailLocalBaseUrl.style.display = useHotmail && hotmailServiceMode === HOTMAIL_SERVICE_MODE_LOCAL ? '' : 'none';
  }
  btnFetchEmail.hidden = useHotmail || useLuckmail || useCustomEmail;
  inputEmail.readOnly = useHotmail || useLuckmail || useGeneratedAlias;
  const uiCopy = useCustomEmail ? getCustomMailProviderUiCopy() : getEmailGeneratorUiCopy();
  inputEmail.placeholder = useHotmail
    ? '由 Hotmail 账号池自动分配'
    : (useLuckmail
      ? '步骤 3 自动购买 LuckMail 邮箱并回填'
      : (useGeneratedAlias ? '步骤 3 自动生成 2925 邮箱并回填' : uiCopy.placeholder));
  if (useGmail && useGeneratedAlias) {
    inputEmail.placeholder = '步骤 3 自动生成 Gmail +tag 邮箱并回填';
  }
  btnFetchEmail.disabled = useGeneratedAlias || useLuckmail || useCustomEmail || isAutoRunLockedPhase();
  if (!btnFetchEmail.disabled) {
    btnFetchEmail.textContent = uiCopy.buttonLabel;
  }
  if (autoHintText) {
    autoHintText.textContent = useHotmail
      ? '请先校验并选择一个 Hotmail 账号'
      : (useLuckmail
        ? '步骤 3 会自动购买 LuckMail 邮箱并用于收码'
      : (useGeneratedAlias
        ? '步骤 3 会自动生成邮箱，无需手动获取'
        : (useCustomEmail ? '请先填写自定义注册邮箱，成功一轮后会自动清空' : `先自动获取${uiCopy.label}，或手动粘贴邮箱后再继续`)));
  }
  if (autoHintText && useGmail && useGeneratedAlias) {
    autoHintText.textContent = '请先填写 Gmail 原邮箱，步骤 3 会自动生成 Gmail +tag 地址';
  }
  if (autoHintText && showCloudflareTempEmailReceiveMailbox) {
    autoHintText.textContent = '若注册邮箱会转发到 Cloudflare Temp Email，请在“邮件接收”中填写实际接收转发邮件的邮箱。';
  }
  if (useHotmail) {
    inputEmail.value = getCurrentHotmailEmail();
  } else if (useLuckmail) {
    inputEmail.value = getCurrentLuckmailEmail();
  }
  renderHotmailAccounts();
  if (useLuckmail) {
    renderLuckmailPurchases(lastRenderedLuckmailPurchases);
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

async function saveCloudflareTempEmailDomainSettings(domains, activeDomain, options = {}) {
  const { silent = false } = options;
  const normalizedDomains = normalizeCloudflareTempEmailDomains(domains);
  const normalizedActiveDomain = normalizeCloudflareTempEmailDomainValue(activeDomain) || normalizedDomains[0] || '';
  const payload = {
    cloudflareTempEmailDomain: normalizedActiveDomain,
    cloudflareTempEmailDomains: normalizedDomains,
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
  renderCloudflareTempEmailDomainOptions(normalizedActiveDomain);
  setCloudflareTempEmailDomainEditMode(false, { clearInput: true });
  markSettingsDirty(false);
  updateMailProviderUI();

  if (!silent) {
    showToast('Cloudflare Temp Email 域名已保存', 'success', 1800);
  }
}

function updatePanelModeUI() {
  const useSub2Api = selectPanelMode.value === 'sub2api';
  rowVpsUrl.style.display = useSub2Api ? 'none' : '';
  rowVpsPassword.style.display = useSub2Api ? 'none' : '';
  rowLocalCpaStep9Mode.style.display = useSub2Api ? 'none' : '';
  rowCpaCallbackMode.style.display = useSub2Api ? 'none' : '';
  rowSub2ApiUrl.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiEmail.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiPassword.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiGroup.style.display = useSub2Api ? '' : 'none';

  const step9Btn = document.querySelector('.step-btn[data-step="9"]');
  if (step9Btn) {
    step9Btn.textContent = useSub2Api ? 'SUB2API 回调验证' : 'CPA 回调验证';
  }
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
  const statuses = getStepStatuses();
  const completed = VISIBLE_STEPS.filter((step) => isDoneStatus(statuses[step])).length;
  stepsProgress.textContent = `${completed} / ${TOTAL_VISIBLE_STEPS}`;
}

function updateButtonStates() {
  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some(s => s === 'running');
  const autoLocked = isAutoRunLockedPhase();
  const autoScheduled = isAutoRunScheduledPhase();

  for (const step of VISIBLE_STEPS) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;
    const prevStep = getPreviousVisibleStep(step);

    if (anyRunning || autoLocked || autoScheduled) {
      btn.disabled = true;
    } else if (!prevStep) {
      btn.disabled = false;
    } else {
      const prevStatus = statuses[prevStep];
      const currentStatus = statuses[step];
      btn.disabled = !(isDoneStatus(prevStatus) || currentStatus === 'failed' || isDoneStatus(currentStatus) || currentStatus === 'stopped');
    }
  }

  document.querySelectorAll('.step-manual-btn').forEach((btn) => {
    const step = Number(btn.dataset.step);
    const currentStatus = statuses[step];
    const prevStep = getPreviousVisibleStep(step);
    const prevStatus = prevStep ? statuses[prevStep] : null;

    if (!SKIPPABLE_STEPS.has(step) || anyRunning || autoLocked || autoScheduled || currentStatus === 'running' || isDoneStatus(currentStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = '当前不可跳过';
      return;
    }

    if (prevStep && !isDoneStatus(prevStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = `请先完成步骤 ${prevStep}`;
      return;
    }

    btn.style.display = '';
    btn.disabled = false;
    btn.title = `跳过步骤 ${step}`;
  });

  btnReset.disabled = anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked;
  const disableIcloudControls = anyRunning || autoScheduled || autoLocked;
  if (btnIcloudRefresh) btnIcloudRefresh.disabled = disableIcloudControls;
  if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = disableIcloudControls || !(lastRenderedIcloudAliases.some((alias) => alias.used && !alias.preserved));
  if (selectIcloudHostPreference) selectIcloudHostPreference.disabled = disableIcloudControls;
  if (checkboxAutoDeleteIcloud) checkboxAutoDeleteIcloud.disabled = disableIcloudControls;
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

  const running = VISIBLE_STEPS
    .map((step) => [String(step), state.stepStatuses?.[step]])
    .find(([, s]) => s === 'running');
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

  const failed = VISIBLE_STEPS
    .map((step) => [String(step), state.stepStatuses?.[step]])
    .find(([, s]) => s === 'failed');
  if (failed) {
    displayStatus.textContent = `步骤 ${failed[0]} 失败`;
    statusBar.classList.add('failed');
    return;
  }

  const stopped = VISIBLE_STEPS
    .map((step) => [String(step), state.stepStatuses?.[step]])
    .find(([, s]) => s === 'stopped');
  if (stopped) {
    displayStatus.textContent = `步骤 ${stopped[0]} 已停止`;
    statusBar.classList.add('stopped');
    return;
  }

  const lastCompleted = VISIBLE_STEPS
    .filter((step) => isDoneStatus(state.stepStatuses?.[step]))
    .sort((a, b) => b - a)[0];

  if (lastCompleted === LAST_STEP) {
    displayStatus.textContent = (state.stepStatuses[LAST_STEP] === 'manual_completed' || state.stepStatuses[LAST_STEP] === 'skipped') ? '全部步骤已跳过/完成' : '全部步骤已完成';
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

function normalizeIcloudSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getFilteredIcloudAliases(aliases = lastRenderedIcloudAliases) {
  const searchTerm = normalizeIcloudSearchText(icloudSearchTerm);
  return (Array.isArray(aliases) ? aliases : []).filter((alias) => {
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
      alias.used ? '已用 used' : '未用 unused',
      alias.active ? '可用 active' : '不可用 inactive',
      alias.preserved ? '保留 preserved' : '',
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
  icloudSelectionSummary.textContent = `已选 ${icloudSelectedEmails.size} 个（当前显示 ${visibleEmails.length} 个）`;

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

function showIcloudLoginHelp(payload = {}) {
  if (!icloudLoginHelp) return;
  const loginUrl = String(payload.loginUrl || '').trim();
  const host = loginUrl ? new URL(loginUrl).host : 'icloud.com.cn / icloud.com';
  if (icloudLoginHelpTitle) icloudLoginHelpTitle.textContent = '需要登录 iCloud';
  if (icloudLoginHelpText) icloudLoginHelpText.textContent = `我已经为你打开 ${host}。请在那个页面完成登录，然后回到这里点击“我已登录”。`;
  icloudLoginHelp.style.display = 'flex';
}

function hideIcloudLoginHelp() {
  if (icloudLoginHelp) {
    icloudLoginHelp.style.display = 'none';
  }
}

function renderIcloudAliases(aliases = []) {
  if (!icloudList || !icloudSummary) return;

  lastRenderedIcloudAliases = Array.isArray(aliases) ? aliases : [];
  pruneIcloudSelection(lastRenderedIcloudAliases);
  icloudList.innerHTML = '';

  if (!aliases.length) {
    icloudSelectedEmails.clear();
    icloudList.innerHTML = '<div class="icloud-empty">未找到 iCloud Hide My Email 别名。</div>';
    icloudSummary.textContent = '加载你的 iCloud Hide My Email 别名以便在这里管理。';
    if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = true;
    updateIcloudBulkUI([]);
    return;
  }

  const usedCount = aliases.filter((alias) => alias.used).length;
  const deletableUsedCount = aliases.filter((alias) => alias.used && !alias.preserved).length;
  icloudSummary.textContent = `已加载 ${aliases.length} 个别名，其中 ${usedCount} 个已标记为已用。`;
  if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = deletableUsedCount === 0;

  const visibleAliases = getFilteredIcloudAliases(aliases);
  if (!visibleAliases.length) {
    icloudList.innerHTML = '<div class="icloud-empty">没有匹配当前筛选条件的别名。</div>';
    updateIcloudBulkUI([]);
    return;
  }

  for (const alias of visibleAliases) {
    const item = document.createElement('div');
    item.className = 'icloud-item';
    item.innerHTML = `
      <input class="icloud-item-check" type="checkbox" data-action="select" ${icloudSelectedEmails.has(alias.email) ? 'checked' : ''} />
      <div class="icloud-item-main">
        <div class="icloud-item-email">${escapeHtml(alias.email)}</div>
        <div class="icloud-item-meta">
          ${alias.used ? '<span class="icloud-tag used">已用</span>' : ''}
          ${!alias.used && alias.active ? '<span class="icloud-tag active">可用</span>' : ''}
          ${alias.preserved ? '<span class="icloud-tag">保留</span>' : ''}
          ${alias.label ? `<span class="icloud-tag">${escapeHtml(alias.label)}</span>` : ''}
          ${alias.note ? `<span class="icloud-tag">${escapeHtml(alias.note)}</span>` : ''}
        </div>
      </div>
      <div class="icloud-item-actions">
        <button class="btn btn-outline btn-xs" type="button" data-action="toggle-used">${escapeHtml(alias.used ? '标记未用' : '标记已用')}</button>
        <button class="btn btn-outline btn-xs" type="button" data-action="toggle-preserved">${escapeHtml(alias.preserved ? '取消保留' : '保留')}</button>
        <button class="btn btn-outline btn-xs" type="button" data-action="delete">删除</button>
      </div>
    `;

    item.querySelector('[data-action="select"]').addEventListener('change', (event) => {
      if (event.target.checked) {
        icloudSelectedEmails.add(alias.email);
      } else {
        icloudSelectedEmails.delete(alias.email);
      }
      updateIcloudBulkUI(visibleAliases);
    });
    item.querySelector('[data-action="toggle-used"]').addEventListener('click', async () => {
      await setSingleIcloudAliasUsedState(alias, !alias.used);
    });
    item.querySelector('[data-action="toggle-preserved"]').addEventListener('click', async () => {
      await setSingleIcloudAliasPreservedState(alias, !alias.preserved);
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await deleteSingleIcloudAlias(alias);
    });
    icloudList.appendChild(item);
  }

  updateIcloudBulkUI(visibleAliases);
}

async function refreshIcloudAliases(options = {}) {
  const { silent = false } = options;
  if (!icloudSection || icloudSection.style.display === 'none') {
    return;
  }

  if (!silent) setIcloudLoadingState(true, '正在加载 iCloud 别名...');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LIST_ICLOUD_ALIASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) throw new Error(response.error);
    hideIcloudLoginHelp();
    renderIcloudAliases(response?.aliases || []);
  } catch (err) {
    icloudSelectedEmails.clear();
    if (icloudList) {
      icloudList.innerHTML = '<div class="icloud-empty">无法加载 iCloud 别名。</div>';
    }
    if (icloudSummary) {
      icloudSummary.textContent = err.message;
    }
    updateIcloudBulkUI([]);
    if (!silent) showToast(`iCloud 别名加载失败：${err.message}`, 'error');
  } finally {
    setIcloudLoadingState(false);
  }
}

function queueIcloudAliasRefresh() {
  if (icloudRefreshQueued) return;
  icloudRefreshQueued = true;
  setTimeout(async () => {
    icloudRefreshQueued = false;
    await refreshIcloudAliases({ silent: true });
  }, 150);
}

async function deleteSingleIcloudAlias(alias) {
  const confirmed = await openConfirmModal({
    title: '删除 iCloud 别名',
    message: `确认删除 ${alias.email} 吗？此操作不可撤销。`,
    confirmLabel: '确认删除',
    confirmVariant: 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  setIcloudLoadingState(true, `正在删除 ${alias.email} ...`);
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
    if (icloudSummary) icloudSummary.textContent = err.message;
    showToast(`删除 iCloud 别名失败：${err.message}`, 'error');
  } finally {
    setIcloudLoadingState(false);
  }
}

async function setSingleIcloudAliasUsedState(alias, used) {
  setIcloudLoadingState(true, `正在更新 ${alias.email} 的使用状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_ICLOUD_ALIAS_USED_STATE',
      source: 'sidepanel',
      payload: { email: alias.email, used },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`${alias.email} 已${used ? '标记为已用' : '恢复为未用'}`, 'success', 2200);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    if (icloudSummary) icloudSummary.textContent = err.message;
    showToast(`更新 iCloud 使用状态失败：${err.message}`, 'error');
  } finally {
    setIcloudLoadingState(false);
  }
}

async function setSingleIcloudAliasPreservedState(alias, preserved) {
  setIcloudLoadingState(true, `正在更新 ${alias.email} 的保留状态...`);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_ICLOUD_ALIAS_PRESERVED_STATE',
      source: 'sidepanel',
      payload: { email: alias.email, preserved },
    });
    if (response?.error) throw new Error(response.error);
    showToast(`${alias.email} 已${preserved ? '设为保留' : '取消保留'}`, 'success', 2200);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    if (icloudSummary) icloudSummary.textContent = err.message;
    showToast(`更新 iCloud 保留状态失败：${err.message}`, 'error');
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

  if (action === 'delete') {
    const confirmed = await openConfirmModal({
      title: '批量删除 iCloud 别名',
      message: `确认删除选中的 ${selectedAliases.length} 个 iCloud 别名吗？此操作不可撤销。`,
      confirmLabel: '确认删除',
      confirmVariant: 'btn-danger',
    });
    if (!confirmed) {
      return;
    }
  }

  const actionLabelMap = {
    used: '标记已用',
    unused: '标记未用',
    preserve: '保留',
    unpreserve: '取消保留',
    delete: '删除',
  };
  setIcloudLoadingState(true, `正在批量${actionLabelMap[action] || '处理'} iCloud 别名...`);

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
        icloudSelectedEmails.delete(alias.email);
      }

      if (response?.error) {
        throw new Error(response.error);
      }
    }

    showToast(`已批量${actionLabelMap[action] || '处理'} ${selectedAliases.length} 个 iCloud 别名`, 'success', 2400);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    if (icloudSummary) icloudSummary.textContent = err.message;
    showToast(`批量处理 iCloud 别名失败：${err.message}`, 'error');
  } finally {
    setIcloudLoadingState(false);
    updateIcloudBulkUI();
  }
}

async function deleteUsedIcloudAliases() {
  const confirmed = await openConfirmModal({
    title: '删除已用 iCloud 别名',
    message: '确认删除所有未保留的已用 iCloud 别名吗？此操作不可撤销。',
    confirmLabel: '确认删除',
    confirmVariant: 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  setIcloudLoadingState(true, '正在删除已用 iCloud 别名...');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_USED_ICLOUD_ALIASES',
      source: 'sidepanel',
      payload: {},
    });
    if (response?.error) throw new Error(response.error);
    const deleted = response?.deleted || [];
    const skipped = response?.skipped || [];
    showToast(`已删除 ${deleted.length} 个已用别名，跳过 ${skipped.length} 个`, skipped.length ? 'warn' : 'success', 2800);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    if (icloudSummary) icloudSummary.textContent = err.message;
    showToast(`删除已用 iCloud 别名失败：${err.message}`, 'error');
  } finally {
    setIcloudLoadingState(false);
  }
}

async function fetchGeneratedEmail(options = {}) {
  const { showFailureToast = true } = options;
  const uiCopy = getEmailGeneratorUiCopy();
  if (isCustomMailProvider()) {
    throw new Error('当前邮箱服务为自定义邮箱，请直接填写注册邮箱。');
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
    if (getSelectedEmailGenerator() === 'icloud') {
      queueIcloudAliasRefresh();
    }
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

async function deleteHotmailAccountsByMode(mode) {
  const isUsedMode = mode === 'used';
  const targetAccounts = getHotmailAccountsByUsage(isUsedMode ? 'used' : 'all');
  if (!targetAccounts.length) {
    showToast(isUsedMode ? '没有已用账号可清空。' : '没有可删除的 Hotmail 账号。', 'warn');
    return;
  }

  const confirmed = await openConfirmModal({
    title: isUsedMode ? '清空已用账号' : '全部删除账号',
    message: isUsedMode
      ? `确认删除当前 ${targetAccounts.length} 个已用 Hotmail 账号吗？`
      : `确认删除全部 ${targetAccounts.length} 个 Hotmail 账号吗？`,
    confirmLabel: isUsedMode ? '确认清空已用' : '确认全部删除',
    confirmVariant: isUsedMode ? 'btn-outline' : 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'DELETE_HOTMAIL_ACCOUNTS',
    source: 'sidepanel',
    payload: { mode: isUsedMode ? 'used' : 'all' },
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  const targetIds = new Set(targetAccounts.map((account) => account.id));
  const nextAccounts = isUsedMode
    ? getHotmailAccounts().filter((account) => !targetIds.has(account.id))
    : [];
  const nextState = { hotmailAccounts: nextAccounts };
  if (latestState?.currentHotmailAccountId && targetIds.has(latestState.currentHotmailAccountId)) {
    nextState.currentHotmailAccountId = null;
    if (selectMailProvider.value === 'hotmail-api') {
      nextState.email = null;
    }
  }
  syncLatestState(nextState);
  refreshHotmailSelectionUI();

  showToast(
    isUsedMode
      ? `已清空 ${response.deletedCount || 0} 个已用 Hotmail 账号`
      : `已删除全部 ${response.deletedCount || 0} 个 Hotmail 账号`,
    'success',
    2200
  );
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
        if (selectMailProvider.value === 'hotmail-api' || isLuckmailProvider()) {
          const response = await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step } });
          if (response?.error) {
            throw new Error(response.error);
          }
        } else if (usesGeneratedAliasMailProvider(selectMailProvider.value)) {
          const emailPrefix = inputEmailPrefix.value.trim();
          if (!emailPrefix) {
            showToast(selectMailProvider.value === GMAIL_PROVIDER ? '请先填写 Gmail 原邮箱。' : '请先填写 2925 邮箱前缀。', 'warn');
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
  if (selectMailProvider.value === 'hotmail-api' || isLuckmailProvider() || isCustomMailProvider()) {
    return;
  }
  await fetchGeneratedEmail().catch(() => { });
});

btnIcloudRefresh?.addEventListener('click', async () => {
  await refreshIcloudAliases();
});

btnIcloudDeleteUsed?.addEventListener('click', async () => {
  await deleteUsedIcloudAliases();
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
    showToast('iCloud 会话已恢复，别名列表已刷新。', 'success', 2600);
    await refreshIcloudAliases({ silent: true });
  } catch (err) {
    showToast(`看起来还没有登录完成：${err.message}`, 'warn', 4200);
  } finally {
    btnIcloudLoginDone.disabled = false;
  }
});

btnToggleHotmailList?.addEventListener('click', () => {
  setHotmailListExpanded(!hotmailListExpanded);
});

btnHotmailUsageGuide?.addEventListener('click', async () => {
  await openConfirmModal({
    title: '使用教程',
    message: 'API对接模式会直接调用微软邮箱接口取件；本地助手模式仍走本地服务。两种模式继续共用同一套 Hotmail 账号池与导入格式。',
    confirmLabel: '确定',
    confirmVariant: 'btn-primary',
  });
});

btnClearUsedHotmailAccounts?.addEventListener('click', async () => {
  if (hotmailActionInFlight) return;
  hotmailActionInFlight = true;
  btnClearUsedHotmailAccounts.disabled = true;
  try {
    await deleteHotmailAccountsByMode('used');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hotmailActionInFlight = false;
    updateHotmailListViewport();
  }
});

btnDeleteAllHotmailAccounts?.addEventListener('click', async () => {
  if (hotmailActionInFlight) return;
  hotmailActionInFlight = true;
  btnDeleteAllHotmailAccounts.disabled = true;
  try {
    await deleteHotmailAccountsByMode('all');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hotmailActionInFlight = false;
    updateHotmailListViewport();
  }
});

btnAddHotmailAccount?.addEventListener('click', async () => {
  if (hotmailActionInFlight) return;

  const email = inputHotmailEmail.value.trim();
  const clientId = inputHotmailClientId.value.trim();
  const refreshToken = inputHotmailRefreshToken.value.trim();
  if (!email) {
    showToast('请先填写 Hotmail 邮箱。', 'warn');
    return;
  }
  if (!clientId) {
    showToast('请先填写微软应用客户端 ID。', 'warn');
    return;
  }
  if (!refreshToken) {
    showToast('请先填写刷新令牌（refresh token）。', 'warn');
    return;
  }

  hotmailActionInFlight = true;
  btnAddHotmailAccount.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPSERT_HOTMAIL_ACCOUNT',
      source: 'sidepanel',
      payload: {
        email,
        clientId,
        password: inputHotmailPassword.value,
        refreshToken,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    showToast(`已保存 Hotmail 账号 ${email}`, 'success', 1800);
    clearHotmailForm();
  } catch (err) {
    showToast(`保存 Hotmail 账号失败：${err.message}`, 'error');
  } finally {
    hotmailActionInFlight = false;
    btnAddHotmailAccount.disabled = false;
  }
});

btnImportHotmailAccounts?.addEventListener('click', async () => {
  if (hotmailActionInFlight) return;
  if (typeof parseHotmailImportText !== 'function') {
    showToast('导入解析器未加载，请刷新扩展后重试。', 'error');
    return;
  }

  const rawText = inputHotmailImport.value.trim();
  if (!rawText) {
    showToast('请先粘贴账号导入内容。', 'warn');
    return;
  }

  const parsedAccounts = parseHotmailImportText(rawText);
  if (!parsedAccounts.length) {
    showToast('没有解析到有效账号，请检查格式是否为 账号----密码----ID----Token。', 'error');
    return;
  }

  hotmailActionInFlight = true;
  btnImportHotmailAccounts.disabled = true;

  try {
    for (const account of parsedAccounts) {
      const response = await chrome.runtime.sendMessage({
        type: 'UPSERT_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: account,
      });
      if (response?.error) {
        throw new Error(response.error);
      }
    }

    inputHotmailImport.value = '';
    showToast(`已导入 ${parsedAccounts.length} 条 Hotmail 账号`, 'success', 2200);
  } catch (err) {
    showToast(`批量导入失败：${err.message}`, 'error');
  } finally {
    hotmailActionInFlight = false;
    btnImportHotmailAccounts.disabled = false;
  }
});

hotmailAccountsList?.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-account-action]');
  if (!actionButton || hotmailActionInFlight) {
    return;
  }

  const accountId = actionButton.dataset.accountId;
  const action = actionButton.dataset.accountAction;
  if (!accountId || !action) {
    return;
  }

  const targetAccount = getHotmailAccounts().find((account) => account.id === accountId) || null;

  hotmailActionInFlight = true;
  actionButton.disabled = true;

  try {
    if (action === 'copy-email') {
      if (!targetAccount?.email) throw new Error('未找到可复制的邮箱地址。');
      await copyTextToClipboard(targetAccount.email);
      showToast(`已复制 ${targetAccount.email}`, 'success', 1800);
    } else if (action === 'select') {
      const response = await chrome.runtime.sendMessage({
        type: 'SELECT_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: { accountId },
      });
      if (response?.error) throw new Error(response.error);
      syncLatestState({ currentHotmailAccountId: response.account.id });
      applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
      showToast(`已切换当前 Hotmail 账号为 ${response.account.email}`, 'success', 1800);
    } else if (action === 'toggle-used') {
      if (!targetAccount) throw new Error('未找到目标 Hotmail 账号。');
      const response = await chrome.runtime.sendMessage({
        type: 'PATCH_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: {
          accountId,
          updates: { used: !targetAccount.used },
        },
      });
      if (response?.error) throw new Error(response.error);
      applyHotmailAccountMutation(response.account);
      showToast(`账号 ${response.account.email} 已${response.account.used ? '标记为已用' : '恢复为未用'}`, 'success', 2200);
    } else if (action === 'verify') {
      const response = await chrome.runtime.sendMessage({
        type: 'VERIFY_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: { accountId },
      });
      if (response?.error) throw new Error(response.error);
      applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
      showToast(`账号 ${response.account.email} 校验通过`, 'success', 2200);
    } else if (action === 'test') {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: { accountId },
      });
      if (response?.error) throw new Error(response.error);
      applyHotmailAccountMutation(response.account, { preserveCurrentSelection: true });
      if (response.latestCode) {
        await copyTextToClipboard(response.latestCode);
        const mailbox = response.latestMailbox ? `（${response.latestMailbox}）` : '';
        showToast(`已复制最新验证码 ${response.latestCode}${mailbox}`, 'success', 2600);
      } else if (response.latestSubject) {
        const mailbox = response.latestMailbox ? `（${response.latestMailbox}）` : '';
        showToast(`最新邮件${mailbox}没有验证码：${response.latestSubject}`, 'warn', 3200);
      } else {
        showToast('当前没有可读取的最新邮件。', 'warn', 2600);
      }
    } else if (action === 'delete') {
      const confirmed = await openConfirmModal({
        title: '删除账号',
        message: '确认删除这个 Hotmail 账号吗？对应 token 也会一起移除。',
        confirmLabel: '确认删除',
        confirmVariant: 'btn-danger',
      });
      if (!confirmed) {
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_HOTMAIL_ACCOUNT',
        source: 'sidepanel',
        payload: { accountId },
      });
      if (response?.error) throw new Error(response.error);
      showToast('Hotmail 账号已删除', 'success', 1800);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hotmailActionInFlight = false;
    actionButton.disabled = false;
  }
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

cpaCallbackModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.cpaCallbackMode;
    if (getSelectedCpaCallbackMode() === normalizeCpaCallbackMode(nextMode)) {
      return;
    }
    setCpaCallbackMode(nextMode);
    markSettingsDirty(true);
    saveSettings({ silent: true }).catch(() => { });
  });
});

hotmailServiceModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.disabled) {
      return;
    }
    const nextMode = button.dataset.hotmailServiceMode;
    if (getSelectedHotmailServiceMode() === normalizeHotmailServiceMode(nextMode)) {
      return;
    }
    setHotmailServiceMode(nextMode);
    updateMailProviderUI();
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
      const startStep = getFirstUnfinishedStep();
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
  syncLatestState({
    stepStatuses: STEP_DEFAULT_STATUSES,
    currentHotmailAccountId: null,
    currentLuckmailPurchase: null,
    currentLuckmailMailCursor: null,
    email: null,
  });
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
  icloudSelectedEmails.clear();
  lastRenderedIcloudAliases = [];
  if (icloudList) {
    icloudList.innerHTML = '';
  }
  if (icloudSummary) {
    icloudSummary.textContent = '加载你的 iCloud Hide My Email 别名以便在这里管理。';
  }
  updateIcloudBulkUI([]);
  document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
  document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
  setDefaultAutoRunButton();
  applyAutoRunStatus(currentAutoRun);
  markSettingsDirty(false);
  updateStopButtonState(false);
  updateButtonStates();
  updateProgressCounter();
  renderHotmailAccounts();
  renderLuckmailPurchases(lastRenderedLuckmailPurchases);
  if (isLuckmailProvider()) {
    queueLuckmailPurchaseRefresh();
  }
});

// Clear log
btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// Save settings on change
inputEmail.addEventListener('change', async () => {
  if (selectMailProvider.value === 'hotmail-api' || isLuckmailProvider()) {
    return;
  }
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

[inputHotmailRemoteBaseUrl, inputHotmailLocalBaseUrl].forEach((input) => {
  input?.addEventListener('input', () => {
    markSettingsDirty(true);
    scheduleSettingsAutoSave();
  });
  input?.addEventListener('blur', () => {
    saveSettings({ silent: true }).catch(() => { });
  });
});

[inputLuckmailApiKey, inputLuckmailBaseUrl, inputLuckmailDomain].forEach((input) => {
  input?.addEventListener('input', () => {
    markSettingsDirty(true);
    scheduleSettingsAutoSave();
  });
  input?.addEventListener('blur', () => {
    saveSettings({ silent: true }).catch(() => { });
  });
});

selectLuckmailEmailType?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputLuckmailSearch?.addEventListener('input', (event) => {
  luckmailSearchTerm = event.target.value || '';
  renderLuckmailPurchases(lastRenderedLuckmailPurchases);
});

selectLuckmailFilter?.addEventListener('change', (event) => {
  luckmailFilterMode = String(event.target.value || 'all').trim() || 'all';
  renderLuckmailPurchases(lastRenderedLuckmailPurchases);
});

checkboxLuckmailSelectAll?.addEventListener('change', () => {
  const visiblePurchases = getFilteredLuckmailPurchases();
  if (checkboxLuckmailSelectAll.checked) {
    visiblePurchases.forEach((purchase) => luckmailSelectedPurchaseIds.add(String(purchase.id)));
  } else {
    visiblePurchases.forEach((purchase) => luckmailSelectedPurchaseIds.delete(String(purchase.id)));
  }
  renderLuckmailPurchases(lastRenderedLuckmailPurchases);
});

btnLuckmailRefresh?.addEventListener('click', async () => {
  await refreshLuckmailPurchases();
});

btnLuckmailDisableUsed?.addEventListener('click', async () => {
  await disableUsedLuckmailPurchases();
});

btnLuckmailBulkUsed?.addEventListener('click', async () => {
  await runBulkLuckmailAction('used');
});

btnLuckmailBulkUnused?.addEventListener('click', async () => {
  await runBulkLuckmailAction('unused');
});

btnLuckmailBulkPreserve?.addEventListener('click', async () => {
  await runBulkLuckmailAction('preserve');
});

btnLuckmailBulkUnpreserve?.addEventListener('click', async () => {
  await runBulkLuckmailAction('unpreserve');
});

btnLuckmailBulkDisable?.addEventListener('click', async () => {
  await runBulkLuckmailAction('disable');
});

btnLuckmailBulkEnable?.addEventListener('click', async () => {
  await runBulkLuckmailAction('enable');
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
  const previousMail2925Mode = latestState?.mail2925Mode;
  const nextProvider = selectMailProvider.value;
  updateMailProviderUI();
  const leavingHotmail = previousProvider === 'hotmail-api'
    && nextProvider !== 'hotmail-api'
    && isCurrentEmailManagedByHotmail();
  const leavingLuckmail = previousProvider === LUCKMAIL_PROVIDER
    && nextProvider !== LUCKMAIL_PROVIDER
    && isCurrentEmailManagedByLuckmail();
  const leavingGeneratedAlias = (
    previousProvider !== nextProvider
    || (previousProvider === '2925' && normalizeMail2925Mode(previousMail2925Mode) !== getSelectedMail2925Mode())
  ) && usesGeneratedAliasMailProvider(previousProvider, previousMail2925Mode)
    && isCurrentEmailManagedByGeneratedAlias(previousProvider, latestState, previousMail2925Mode);
  if (leavingHotmail || leavingLuckmail || leavingGeneratedAlias) {
    await clearRegistrationEmail({ silent: true }).catch(() => { });
  }
  if (nextProvider === LUCKMAIL_PROVIDER) {
    queueLuckmailPurchaseRefresh();
  }
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

mail2925ModeButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const nextMode = normalizeMail2925Mode(button.dataset.mail2925Mode);
    const previousMode = normalizeMail2925Mode(latestState?.mail2925Mode);
    if (nextMode === getSelectedMail2925Mode()) {
      return;
    }

    setMail2925Mode(nextMode);
    updateMailProviderUI();

    const leavingGeneratedAlias = selectMailProvider.value === '2925'
      && previousMode === MAIL_2925_MODE_PROVIDE
      && nextMode !== MAIL_2925_MODE_PROVIDE
      && isCurrentEmailManagedByGeneratedAlias('2925', latestState, previousMode);
    if (leavingGeneratedAlias) {
      await clearRegistrationEmail({ silent: true }).catch(() => { });
    }

    markSettingsDirty(true);
    saveSettings({ silent: true }).catch(() => { });
  });
});

selectEmailGenerator.addEventListener('change', () => {
  updateMailProviderUI();
  clearRegistrationEmail({ silent: true }).catch(() => { });
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectIcloudHostPreference?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
  if (getSelectedEmailGenerator() === 'icloud') {
    queueIcloudAliasRefresh();
  }
});

checkboxAutoDeleteIcloud?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectPanelMode.addEventListener('change', () => {
  updatePanelModeUI();
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

selectTempEmailDomain.addEventListener('change', () => {
  if (selectTempEmailDomain.disabled) {
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

btnTempEmailDomainMode.addEventListener('click', async () => {
  try {
    if (!cloudflareTempEmailDomainEditMode) {
      setCloudflareTempEmailDomainEditMode(true, { clearInput: true });
      return;
    }

    const newDomain = normalizeCloudflareTempEmailDomainValue(inputTempEmailDomain.value);
    if (!newDomain) {
      showToast('请输入有效的 Cloudflare Temp Email 域名。', 'warn');
      inputTempEmailDomain.focus();
      return;
    }

    const { domains } = getCloudflareTempEmailDomainsFromState();
    await saveCloudflareTempEmailDomainSettings([...domains, newDomain], newDomain);
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

inputTempEmailDomain.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    btnTempEmailDomainMode.click();
  }
});

inputSub2ApiUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiUrl.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputSub2ApiEmail.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiEmail.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputSub2ApiPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputSub2ApiGroup.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiGroup.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputEmailPrefix.addEventListener('input', () => {
  maybeClearGeneratedAliasAfterEmailPrefixChange().catch(() => { });
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputEmailPrefix.addEventListener('blur', () => {
  maybeClearGeneratedAliasAfterEmailPrefixChange().catch(() => {});
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

inputTempEmailBaseUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputTempEmailBaseUrl.addEventListener('blur', () => {
  inputTempEmailBaseUrl.value = normalizeCloudflareTempEmailBaseUrlValue(inputTempEmailBaseUrl.value);
  saveSettings({ silent: true }).catch(() => { });
});

inputTempEmailAdminAuth.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputTempEmailAdminAuth.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputTempEmailCustomAuth.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputTempEmailCustomAuth.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputTempEmailReceiveMailbox.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputTempEmailReceiveMailbox.addEventListener('blur', () => {
  inputTempEmailReceiveMailbox.value = normalizeCloudflareTempEmailReceiveMailboxValue(inputTempEmailReceiveMailbox.value);
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
      icloudSelectedEmails.clear();
      lastRenderedIcloudAliases = [];
      if (icloudList) icloudList.innerHTML = '';
      if (icloudSummary) icloudSummary.textContent = '加载你的 iCloud Hide My Email 别名以便在这里管理。';
      updateIcloudBulkUI([]);
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
      renderHotmailAccounts();
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
      if (message.payload.cpaCallbackMode !== undefined) {
        setCpaCallbackMode(message.payload.cpaCallbackMode);
      }
      if (message.payload.oauthUrl !== undefined) {
        displayOauthUrl.textContent = message.payload.oauthUrl || '等待中...';
        displayOauthUrl.classList.toggle('has-value', Boolean(message.payload.oauthUrl));
      }
      if (message.payload.localhostUrl !== undefined) {
        displayLocalhostUrl.textContent = message.payload.localhostUrl || '等待中...';
        displayLocalhostUrl.classList.toggle('has-value', Boolean(message.payload.localhostUrl));
      }
      if (message.payload.cloudflareTempEmailBaseUrl !== undefined) {
        inputTempEmailBaseUrl.value = message.payload.cloudflareTempEmailBaseUrl || '';
      }
      if (message.payload.cloudflareTempEmailAdminAuth !== undefined) {
        inputTempEmailAdminAuth.value = message.payload.cloudflareTempEmailAdminAuth || '';
      }
      if (message.payload.cloudflareTempEmailCustomAuth !== undefined) {
        inputTempEmailCustomAuth.value = message.payload.cloudflareTempEmailCustomAuth || '';
      }
      if (message.payload.cloudflareTempEmailReceiveMailbox !== undefined) {
        inputTempEmailReceiveMailbox.value = message.payload.cloudflareTempEmailReceiveMailbox || '';
      }
      if (message.payload.cloudflareTempEmailDomain !== undefined || message.payload.cloudflareTempEmailDomains !== undefined) {
        renderCloudflareTempEmailDomainOptions(message.payload.cloudflareTempEmailDomain || latestState?.cloudflareTempEmailDomain || '');
      }
      if (message.payload.currentHotmailAccountId !== undefined || message.payload.hotmailAccounts !== undefined) {
        renderHotmailAccounts();
        if (selectMailProvider.value === 'hotmail-api') {
          inputEmail.value = getCurrentHotmailEmail();
        }
      }
      if (message.payload.luckmailApiKey !== undefined) {
        inputLuckmailApiKey.value = message.payload.luckmailApiKey || '';
      }
      if (message.payload.luckmailBaseUrl !== undefined) {
        inputLuckmailBaseUrl.value = normalizeLuckmailBaseUrl(message.payload.luckmailBaseUrl);
      }
      if (message.payload.luckmailEmailType !== undefined) {
        selectLuckmailEmailType.value = normalizeLuckmailEmailType(message.payload.luckmailEmailType);
      }
      if (message.payload.luckmailDomain !== undefined) {
        inputLuckmailDomain.value = message.payload.luckmailDomain || '';
      }
      if (message.payload.luckmailUsedPurchases !== undefined && isLuckmailProvider()) {
        queueLuckmailPurchaseRefresh();
      }
      if (message.payload.currentLuckmailPurchase !== undefined && isLuckmailProvider()) {
        inputEmail.value = getCurrentLuckmailEmail();
        queueLuckmailPurchaseRefresh();
      }
      if (message.payload.autoDeleteUsedIcloudAlias !== undefined && checkboxAutoDeleteIcloud) {
        checkboxAutoDeleteIcloud.checked = Boolean(message.payload.autoDeleteUsedIcloudAlias);
      }
      if (message.payload.icloudHostPreference !== undefined && selectIcloudHostPreference) {
        const hostPreference = String(message.payload.icloudHostPreference || '').trim().toLowerCase();
        selectIcloudHostPreference.value = hostPreference === 'icloud.com'
          ? 'icloud.com'
          : (hostPreference === 'icloud.com.cn' ? 'icloud.com.cn' : 'auto');
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
      break;
    }

    case 'ICLOUD_LOGIN_REQUIRED': {
      const loginMessage = '需要登录 iCloud，我已经为你打开登录页。';
      showToast(loginMessage, 'warn', 5000);
      if (icloudSummary) {
        icloudSummary.textContent = loginMessage;
      }
      showIcloudLoginHelp(message.payload || {});
      break;
    }

    case 'ICLOUD_ALIASES_CHANGED': {
      queueIcloudAliasRefresh();
      break;
    }

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
initHotmailListExpandedState();
updateSaveButtonState();
updateConfigMenuControls();
setLocalCpaStep9Mode(DEFAULT_LOCAL_CPA_STEP9_MODE);
setCpaCallbackMode(DEFAULT_CPA_CALLBACK_MODE);
setMail2925Mode(DEFAULT_MAIL_2925_MODE);
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
