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
const displayOauthUrl = document.getElementById('display-oauth-url');
const displayLocalhostUrl = document.getElementById('display-localhost-url');
const displayStatus = document.getElementById('display-status');
const statusBar = document.getElementById('status-bar');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const btnToggleVpsUrl = document.getElementById('btn-toggle-vps-url');
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
const inputSub2ApiGroup = document.getElementById('input-sub2api-group');
const selectMailProvider = document.getElementById('select-mail-provider');
const selectEmailGenerator = document.getElementById('select-email-generator');
const hotmailSection = document.getElementById('hotmail-section');
const inputHotmailEmail = document.getElementById('input-hotmail-email');
const inputHotmailClientId = document.getElementById('input-hotmail-client-id');
const inputHotmailPassword = document.getElementById('input-hotmail-password');
const inputHotmailRefreshToken = document.getElementById('input-hotmail-refresh-token');
const inputHotmailImport = document.getElementById('input-hotmail-import');
const btnAddHotmailAccount = document.getElementById('btn-add-hotmail-account');
const btnImportHotmailAccounts = document.getElementById('btn-import-hotmail-accounts');
const btnClearUsedHotmailAccounts = document.getElementById('btn-clear-used-hotmail-accounts');
const btnDeleteAllHotmailAccounts = document.getElementById('btn-delete-all-hotmail-accounts');
const btnToggleHotmailList = document.getElementById('btn-toggle-hotmail-list');
const hotmailListShell = document.getElementById('hotmail-list-shell');
const hotmailAccountsList = document.getElementById('hotmail-accounts-list');
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
const inputAutoDelayEnabled = document.getElementById('input-auto-delay-enabled');
const inputAutoDelayMinutes = document.getElementById('input-auto-delay-minutes');
const autoStartModal = document.getElementById('auto-start-modal');
const autoStartTitle = autoStartModal?.querySelector('.modal-title');
const autoStartMessage = document.getElementById('auto-start-message');
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
};
const SKIPPABLE_STEPS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const AUTO_DELAY_MIN_MINUTES = 1;
const AUTO_DELAY_MAX_MINUTES = 1440;
const AUTO_DELAY_DEFAULT_MINUTES = 30;
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';

let latestState = null;
let currentAutoRun = {
  autoRunning: false,
  phase: 'idle',
  currentRun: 0,
  totalRuns: 1,
  attemptRun: 0,
  scheduledAt: null,
};
let settingsDirty = false;
let settingsSaveInFlight = false;
let settingsAutoSaveTimer = null;
let cloudflareDomainEditMode = false;
let modalChoiceResolver = null;
let currentModalActions = [];
let scheduledCountdownTimer = null;
let hotmailActionInFlight = false;
let hotmailListExpanded = false;

const EYE_OPEN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.77 21.77 0 0 1 5.06-6.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const parseHotmailImportText = window.HotmailUtils?.parseHotmailImportText;
const shouldClearHotmailCurrentSelection = window.HotmailUtils?.shouldClearHotmailCurrentSelection;
const upsertHotmailAccountInList = window.HotmailUtils?.upsertHotmailAccountInList;
const filterHotmailAccountsByUsage = window.HotmailUtils?.filterHotmailAccountsByUsage;
const getHotmailBulkActionLabel = window.HotmailUtils?.getHotmailBulkActionLabel;
const getHotmailListToggleLabel = window.HotmailUtils?.getHotmailListToggleLabel;
const HOTMAIL_LIST_EXPANDED_STORAGE_KEY = 'multipage-hotmail-list-expanded';

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

function resolveModalChoice(choice) {
  if (modalChoiceResolver) {
    modalChoiceResolver(choice);
    modalChoiceResolver = null;
  }
  resetActionModalButtons();
  if (autoStartModal) {
    autoStartModal.hidden = true;
  }
}

function openActionModal({ title, message, actions }) {
  if (!autoStartModal) {
    return Promise.resolve(null);
  }

  if (modalChoiceResolver) {
    resolveModalChoice(null);
  }

  autoStartTitle.textContent = title;
  autoStartMessage.textContent = message;
  currentModalActions = actions || [];
  configureActionModalButton(btnAutoStartCancel, currentModalActions[0]);
  configureActionModalButton(btnAutoStartRestart, currentModalActions[1]);
  configureActionModalButton(btnAutoStartContinue, currentModalActions[2]);
  autoStartModal.hidden = false;

  return new Promise((resolve) => {
    modalChoiceResolver = resolve;
  });
}

function openAutoStartChoiceDialog(startStep) {
  return openActionModal({
    title: '启动自动',
    message: `检测到当前已有流程进度。继续当前会从步骤 ${startStep} 开始自动执行，重新开始会清空当前流程进度并从步骤 1 新开一轮。`,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'restart', label: '重新开始', variant: 'btn-outline' },
      { id: 'continue', label: '继续当前', variant: 'btn-primary' },
    ],
  });
}

async function openConfirmModal({ title, message, confirmLabel = '确认', confirmVariant = 'btn-primary' }) {
  const choice = await openActionModal({
    title,
    message,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: confirmLabel, variant: confirmVariant },
    ],
  });
  return choice === 'confirm';
}

function isDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}

function getStepStatuses(state = latestState) {
  return { ...STEP_DEFAULT_STATUSES, ...(state?.stepStatuses || {}) };
}

function getFirstUnfinishedStep(state = latestState) {
  const statuses = getStepStatuses(state);
  for (let step = 1; step <= 9; step++) {
    if (!isDoneStatus(statuses[step])) {
      return step;
    }
  }
  return null;
}

function hasSavedProgress(state = latestState) {
  const statuses = getStepStatuses(state);
  return Object.values(statuses).some((status) => status !== 'pending');
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

function syncAutoRunState(source = {}) {
  const phase = source.autoRunPhase ?? source.phase ?? currentAutoRun.phase;
  const autoRunning = source.autoRunning !== undefined
    ? Boolean(source.autoRunning)
    : (source.autoRunPhase !== undefined || source.phase !== undefined
      ? ['scheduled', 'running', 'waiting_email', 'retrying'].includes(phase)
      : currentAutoRun.autoRunning);

  currentAutoRun = {
    autoRunning,
    phase,
    currentRun: source.autoRunCurrentRun ?? source.currentRun ?? currentAutoRun.currentRun,
    totalRuns: source.autoRunTotalRuns ?? source.totalRuns ?? currentAutoRun.totalRuns,
    attemptRun: source.autoRunAttemptRun ?? source.attemptRun ?? currentAutoRun.attemptRun,
    scheduledAt: source.scheduledAutoRunAt ?? source.scheduledAt ?? currentAutoRun.scheduledAt,
  };
}

function isAutoRunLockedPhase() {
  return currentAutoRun.phase === 'running' || currentAutoRun.phase === 'retrying';
}

function isAutoRunPausedPhase() {
  return currentAutoRun.phase === 'waiting_email';
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

function renderScheduledAutoRunInfo() {
  if (!autoScheduleBar) {
    return;
  }

  if (!isAutoRunScheduledPhase() || !Number.isFinite(currentAutoRun.scheduledAt)) {
    autoScheduleBar.style.display = 'none';
    return;
  }

  const remainingMs = currentAutoRun.scheduledAt - Date.now();
  autoScheduleBar.style.display = 'flex';
  autoScheduleTitle.textContent = '已计划自动运行';
  autoScheduleMeta.textContent = remainingMs > 0
    ? `计划于 ${formatScheduleTime(currentAutoRun.scheduledAt)} 开始，剩余 ${formatCountdown(remainingMs)}`
    : '倒计时即将结束，正在准备启动...';
}

function syncScheduledCountdownTicker() {
  renderScheduledAutoRunInfo();
  if (!isAutoRunScheduledPhase() || !Number.isFinite(currentAutoRun.scheduledAt)) {
    stopScheduledCountdownTicker();
    return;
  }

  if (scheduledCountdownTimer) {
    return;
  }

  scheduledCountdownTimer = setInterval(() => {
    renderScheduledAutoRunInfo();
    updateStatusDisplay(latestState);
  }, 1000);
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
    sub2apiGroupName: inputSub2ApiGroup.value.trim(),
    customPassword: inputPassword.value,
    mailProvider: selectMailProvider.value,
    emailGenerator: selectEmailGenerator.value,
    inbucketHost: inputInbucketHost.value.trim(),
    inbucketMailbox: inputInbucketMailbox.value.trim(),
    cloudflareDomain: selectedCloudflareDomain,
    cloudflareDomains: domains,
    autoRunSkipFailures: inputAutoSkipFailures.checked,
    autoRunDelayEnabled: inputAutoDelayEnabled.checked,
    autoRunDelayMinutes: normalizeAutoDelayMinutes(inputAutoDelayMinutes.value),
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

function markSettingsDirty(isDirty = true) {
  settingsDirty = isDirty;
  updateSaveButtonState();
}

function updateSaveButtonState() {
  btnSaveSettings.disabled = settingsSaveInFlight || !settingsDirty;
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

    syncLatestState(payload);
    markSettingsDirty(false);
    updatePanelModeUI();
    updateMailProviderUI();
    updateButtonStates();
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

  inputRunCount.disabled = currentAutoRun.autoRunning;
  btnAutoRun.disabled = currentAutoRun.autoRunning;
  btnFetchEmail.disabled = locked;
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
    default:
      autoContinueBar.style.display = 'none';
      setDefaultAutoRunButton();
      inputEmail.disabled = false;
      if (!locked) {
        btnFetchEmail.disabled = false;
      }
      break;
  }

  updateAutoDelayInputState();
  syncScheduledCountdownTicker();
  updateStopButtonState(scheduled || paused || locked || Object.values(getStepStatuses()).some(status => status === 'running'));
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

async function restoreState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    syncLatestState(state);
    syncAutoRunState(state);

    if (state.oauthUrl) {
      displayOauthUrl.textContent = state.oauthUrl;
      displayOauthUrl.classList.add('has-value');
    }
    if (state.localhostUrl) {
      displayLocalhostUrl.textContent = state.localhostUrl;
      displayLocalhostUrl.classList.add('has-value');
    }
    if (state.email) {
      inputEmail.value = state.email;
    }
    syncPasswordField(state);
    if (state.vpsUrl) {
      inputVpsUrl.value = state.vpsUrl;
    }
    if (state.vpsPassword) {
      inputVpsPassword.value = state.vpsPassword;
    }
    setLocalCpaStep9Mode(state.localCpaStep9Mode);
    if (state.panelMode) {
      selectPanelMode.value = state.panelMode;
    }
    if (state.sub2apiUrl) {
      inputSub2ApiUrl.value = state.sub2apiUrl;
    }
    if (state.sub2apiEmail) {
      inputSub2ApiEmail.value = state.sub2apiEmail;
    }
    if (state.sub2apiPassword) {
      inputSub2ApiPassword.value = state.sub2apiPassword;
    }
    if (state.sub2apiGroupName) {
      inputSub2ApiGroup.value = state.sub2apiGroupName;
    }
    if (state.mailProvider) {
      selectMailProvider.value = state.mailProvider;
    }
    if (state.emailGenerator) {
      selectEmailGenerator.value = state.emailGenerator;
    }
    if (state.inbucketHost) {
      inputInbucketHost.value = state.inbucketHost;
    }
    if (state.inbucketMailbox) {
      inputInbucketMailbox.value = state.inbucketMailbox;
    }
    renderCloudflareDomainOptions(state.cloudflareDomain || '');
    setCloudflareDomainEditMode(false, { clearInput: true });
    inputAutoSkipFailures.checked = Boolean(state.autoRunSkipFailures);
    inputAutoDelayEnabled.checked = Boolean(state.autoRunDelayEnabled);
    inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(state.autoRunDelayMinutes));
    if (state.autoRunTotalRuns) {
      inputRunCount.value = String(state.autoRunTotalRuns);
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

    applyAutoRunStatus(state);
    markSettingsDirty(false);
    updateAutoDelayInputState();
    updateStatusDisplay(latestState);
    updateProgressCounter();
    updatePanelModeUI();
    updateMailProviderUI();
    updateButtonStates();
  } catch (err) {
    console.error('Failed to restore state:', err);
  }
}

function syncPasswordField(state) {
  inputPassword.value = state.customPassword || state.password || '';
}

function getSelectedEmailGenerator() {
  return selectEmailGenerator.value === 'cloudflare' ? 'cloudflare' : 'duck';
}

function getEmailGeneratorUiCopy() {
  if (getSelectedEmailGenerator() === 'cloudflare') {
    return {
      buttonLabel: '生成 Cloudflare',
      placeholder: '点击生成 Cloudflare 邮箱，或手动粘贴邮箱',
      successVerb: '生成',
      label: 'Cloudflare 邮箱',
    };
  }

  return {
    buttonLabel: '获取 Duck',
    placeholder: '点击获取 DuckDuckGo 邮箱，或手动粘贴邮箱',
    successVerb: '获取',
    label: 'Duck 邮箱',
  };
}

function getHotmailAccounts(state = latestState) {
  return Array.isArray(state?.hotmailAccounts) ? state.hotmailAccounts : [];
}

function getCurrentHotmailAccount(state = latestState) {
  const currentId = state?.currentHotmailAccountId;
  return getHotmailAccounts(state).find((account) => account.id === currentId) || null;
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
    const currentAccount = getCurrentHotmailAccount();
    inputEmail.value = currentAccount?.email || latestState?.email || '';
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
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
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
  const useInbucket = selectMailProvider.value === 'inbucket';
  const useHotmail = selectMailProvider.value === 'hotmail-api';
  rowInbucketHost.style.display = useInbucket ? '' : 'none';
  rowInbucketMailbox.style.display = useInbucket ? '' : 'none';
  const useCloudflare = selectEmailGenerator.value === 'cloudflare';
  rowCfDomain.style.display = !useHotmail && useCloudflare ? '' : 'none';
  const { domains } = getCloudflareDomainsFromState();
  if (useCloudflare) {
    setCloudflareDomainEditMode(cloudflareDomainEditMode || domains.length === 0, { clearInput: false });
  } else {
    setCloudflareDomainEditMode(false, { clearInput: false });
  }

  if (hotmailSection) {
    hotmailSection.style.display = useHotmail ? '' : 'none';
  }
  selectEmailGenerator.disabled = useHotmail;
  btnFetchEmail.hidden = useHotmail;
  inputEmail.readOnly = useHotmail;
  const uiCopy = getEmailGeneratorUiCopy();
  inputEmail.placeholder = useHotmail ? '由 Hotmail 账号池自动分配' : uiCopy.placeholder;
  if (!btnFetchEmail.disabled) {
    btnFetchEmail.textContent = uiCopy.buttonLabel;
  }
  if (autoHintText) {
    autoHintText.textContent = useHotmail
      ? '请先校验并选择一个 Hotmail 账号'
      : '先自动获取邮箱，或手动粘贴邮箱后再继续';
  }
  if (useHotmail) {
    const currentAccount = getCurrentHotmailAccount();
    inputEmail.value = currentAccount?.email || latestState?.email || '';
  }
  renderHotmailAccounts();
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
}

function updateProgressCounter() {
  const completed = Object.values(getStepStatuses()).filter(isDoneStatus).length;
  stepsProgress.textContent = `${completed} / 9`;
}

function updateButtonStates() {
  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some(s => s === 'running');
  const autoLocked = isAutoRunLockedPhase();
  const autoScheduled = isAutoRunScheduledPhase();

  for (let step = 1; step <= 9; step++) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;

    if (anyRunning || autoLocked || autoScheduled) {
      btn.disabled = true;
    } else if (step === 1) {
      btn.disabled = false;
    } else {
      const prevStatus = statuses[step - 1];
      const currentStatus = statuses[step];
      btn.disabled = !(isDoneStatus(prevStatus) || currentStatus === 'failed' || isDoneStatus(currentStatus) || currentStatus === 'stopped');
    }
  }

  document.querySelectorAll('.step-manual-btn').forEach((btn) => {
    const step = Number(btn.dataset.step);
    const currentStatus = statuses[step];
    const prevStatus = statuses[step - 1];

    if (!SKIPPABLE_STEPS.has(step) || anyRunning || autoLocked || autoScheduled || currentStatus === 'running' || isDoneStatus(currentStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = '当前不可跳过';
      return;
    }

    if (step > 1 && !isDoneStatus(prevStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = `请先完成步骤 ${step - 1}`;
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

  if (lastCompleted === 9) {
    displayStatus.textContent = (state.stepStatuses[9] === 'manual_completed' || state.stepStatuses[9] === 'skipped') ? '全部步骤已跳过/完成' : '全部步骤已完成';
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
  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
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
        if (selectMailProvider.value === 'hotmail-api') {
          const response = await chrome.runtime.sendMessage({ type: 'EXECUTE_STEP', source: 'sidepanel', payload: { step } });
          if (response?.error) {
            throw new Error(response.error);
          }
        } else {
          let email = inputEmail.value.trim();
          if (!email) {
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
  if (selectMailProvider.value === 'hotmail-api') {
    return;
  }
  await fetchGeneratedEmail().catch(() => { });
});

btnToggleHotmailList?.addEventListener('click', () => {
  setHotmailListExpanded(!hotmailListExpanded);
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

autoStartModal?.addEventListener('click', (event) => {
  if (event.target === autoStartModal) {
    resolveModalChoice(null);
  }
});
btnAutoStartClose?.addEventListener('click', () => resolveModalChoice(null));

// Auto Run
btnAutoRun.addEventListener('click', async () => {
  try {
    const totalRuns = Math.min(50, Math.max(1, parseInt(inputRunCount.value, 10) || 1));
    let mode = 'restart';

    if (shouldOfferAutoModeChoice()) {
      const startStep = getFirstUnfinishedStep();
      const choice = await openAutoStartChoiceDialog(startStep);
      if (!choice) {
        return;
      }
      mode = choice;
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
        autoRunSkipFailures: inputAutoSkipFailures.checked,
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
    showToast('请先获取或粘贴邮箱。', 'warn');
    return;
  }
  autoContinueBar.style.display = 'none';
  await chrome.runtime.sendMessage({ type: 'RESUME_AUTO_RUN', source: 'sidepanel', payload: { email } });
});

btnAutoRunNow?.addEventListener('click', async () => {
  try {
    btnAutoRunNow.disabled = true;
    await chrome.runtime.sendMessage({ type: 'START_SCHEDULED_AUTO_RUN_NOW', source: 'sidepanel', payload: {} });
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
  syncLatestState({ stepStatuses: STEP_DEFAULT_STATUSES, currentHotmailAccountId: null, email: null });
  syncAutoRunState({
    autoRunning: false,
    autoRunPhase: 'idle',
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 1,
    autoRunAttemptRun: 0,
    scheduledAutoRunAt: null,
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
  renderHotmailAccounts();
});

// Clear log
btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// Save settings on change
inputEmail.addEventListener('change', async () => {
  if (selectMailProvider.value === 'hotmail-api') {
    return;
  }
  const email = inputEmail.value.trim();
  if (email) {
    await chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', source: 'sidepanel', payload: { email } });
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

inputPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  updateButtonStates();
  scheduleSettingsAutoSave();
});
inputPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

selectMailProvider.addEventListener('change', () => {
  updateMailProviderUI();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

selectEmailGenerator.addEventListener('change', () => {
  updateMailProviderUI();
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

inputAutoSkipFailures.addEventListener('change', () => {
  markSettingsDirty(true);
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

// ============================================================
// Listen for Background broadcasts
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
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
      if (message.payload.oauthUrl !== undefined) {
        displayOauthUrl.textContent = message.payload.oauthUrl || '等待中...';
        displayOauthUrl.classList.toggle('has-value', Boolean(message.payload.oauthUrl));
      }
      if (message.payload.localhostUrl !== undefined) {
        displayLocalhostUrl.textContent = message.payload.localhostUrl || '等待中...';
        displayLocalhostUrl.classList.toggle('has-value', Boolean(message.payload.localhostUrl));
      }
      if (message.payload.currentHotmailAccountId !== undefined || message.payload.hotmailAccounts !== undefined) {
        renderHotmailAccounts();
        if (selectMailProvider.value === 'hotmail-api') {
          const currentAccount = getCurrentHotmailAccount();
          inputEmail.value = currentAccount?.email || latestState?.email || '';
        }
      }
      if (message.payload.autoRunDelayEnabled !== undefined) {
        inputAutoDelayEnabled.checked = Boolean(message.payload.autoRunDelayEnabled);
        updateAutoDelayInputState();
      }
      if (message.payload.autoRunDelayMinutes !== undefined) {
        inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(message.payload.autoRunDelayMinutes));
      }
      break;
    }

    case 'AUTO_RUN_STATUS': {
      syncLatestState({
        autoRunning: ['scheduled', 'running', 'waiting_email', 'retrying'].includes(message.payload.phase),
        autoRunPhase: message.payload.phase,
        autoRunCurrentRun: message.payload.currentRun,
        autoRunTotalRuns: message.payload.totalRuns,
        autoRunAttemptRun: message.payload.attemptRun,
        scheduledAutoRunAt: message.payload.scheduledAt ?? null,
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

// ============================================================
// Init
// ============================================================

initializeManualStepActions();
initTheme();
initHotmailListExpandedState();
updateSaveButtonState();
setLocalCpaStep9Mode(DEFAULT_LOCAL_CPA_STEP9_MODE);
restoreState().then(() => {
  syncPasswordToggleLabel();
  syncVpsUrlToggleLabel();
  updatePanelModeUI();
  updateButtonStates();
  updateStatusDisplay(latestState);
});
