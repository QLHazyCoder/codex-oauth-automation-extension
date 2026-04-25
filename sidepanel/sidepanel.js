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
const btnOpenAccountRecords = document.getElementById('btn-open-account-records');
const accountRecordsOverlay = document.getElementById('account-records-overlay');
const accountRecordsMeta = document.getElementById('account-records-meta');
const accountRecordsStats = document.getElementById('account-records-stats');
const accountRecordsList = document.getElementById('account-records-list');
const accountRecordsPageLabel = document.getElementById('account-records-page-label');
const btnAccountRecordsPrev = document.getElementById('btn-account-records-prev');
const btnAccountRecordsNext = document.getElementById('btn-account-records-next');
const btnCloseAccountRecords = document.getElementById('btn-close-account-records');
const btnClearAccountRecords = document.getElementById('btn-clear-account-records');
const btnToggleAccountRecordsSelection = document.getElementById('btn-toggle-account-records-selection');
const btnDeleteSelectedAccountRecords = document.getElementById('btn-delete-selected-account-records');
const updateSection = document.getElementById('update-section');
const btnRepoHome = document.getElementById('btn-repo-home');
const extensionUpdateStatus = document.getElementById('extension-update-status');
const extensionVersionMeta = document.getElementById('extension-version-meta');
const btnReleaseLog = document.getElementById('btn-release-log');
const updateCardVersion = document.getElementById('update-card-version');
const updateCardSummary = document.getElementById('update-card-summary');
const updateReleaseList = document.getElementById('update-release-list');
const btnOpenRelease = document.getElementById('btn-open-release');
const settingsCard = document.getElementById('settings-card');
const contributionModePanel = document.getElementById('contribution-mode-panel');
const contributionModeText = document.getElementById('contribution-mode-text');
const inputContributionNickname = document.getElementById('input-contribution-nickname');
const inputContributionQq = document.getElementById('input-contribution-qq');
const contributionOauthStatus = document.getElementById('contribution-oauth-status');
const contributionCallbackStatus = document.getElementById('contribution-callback-status');
const contributionModeSummary = document.getElementById('contribution-mode-summary');
const btnStartContribution = document.getElementById('btn-start-contribution');
const btnOpenContributionUpload = document.getElementById('btn-open-contribution-upload');
const btnExitContributionMode = document.getElementById('btn-exit-contribution-mode');
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
const btnContributionMode = document.getElementById('btn-contribution-mode');
const contributionUpdateLayer = document.getElementById('contribution-update-layer');
const contributionUpdateHint = document.getElementById('contribution-update-hint');
const contributionUpdateHintText = document.getElementById('contribution-update-hint-text');
const btnDismissContributionUpdateHint = document.getElementById('btn-dismiss-contribution-update-hint');
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
const rowSub2ApiUrl = document.getElementById('row-sub2api-url');
const inputSub2ApiUrl = document.getElementById('input-sub2api-url');
const rowSub2ApiEmail = document.getElementById('row-sub2api-email');
const inputSub2ApiEmail = document.getElementById('input-sub2api-email');
const rowSub2ApiPassword = document.getElementById('row-sub2api-password');
const inputSub2ApiPassword = document.getElementById('input-sub2api-password');
const rowSub2ApiGroup = document.getElementById('row-sub2api-group');
const inputSub2ApiGroup = document.getElementById('input-sub2api-group');
const rowSub2ApiDefaultProxy = document.getElementById('row-sub2api-default-proxy');
const inputSub2ApiDefaultProxy = document.getElementById('input-sub2api-default-proxy');
const rowCodex2ApiUrl = document.getElementById('row-codex2api-url');
const inputCodex2ApiUrl = document.getElementById('input-codex2api-url');
const rowCodex2ApiAdminKey = document.getElementById('row-codex2api-admin-key');
const inputCodex2ApiAdminKey = document.getElementById('input-codex2api-admin-key');
const rowCustomPassword = document.getElementById('row-custom-password');
const selectMailProvider = document.getElementById('select-mail-provider');
const btnMailLogin = document.getElementById('btn-mail-login');
const rowCustomMailProviderPool = document.getElementById('row-custom-mail-provider-pool');
const inputCustomMailProviderPool = document.getElementById('input-custom-mail-provider-pool');
const rowMail2925Mode = document.getElementById('row-mail-2925-mode');
const rowMail2925PoolSettings = document.getElementById('row-mail2925-pool-settings');
const mail2925ModeButtons = Array.from(document.querySelectorAll('[data-mail2925-mode]'));
const rowEmailGenerator = document.getElementById('row-email-generator');
const selectEmailGenerator = document.getElementById('select-email-generator');
const rowCustomEmailPool = document.getElementById('row-custom-email-pool');
const inputCustomEmailPool = document.getElementById('input-custom-email-pool');
const rowTempEmailBaseUrl = document.getElementById('row-temp-email-base-url');
const inputTempEmailBaseUrl = document.getElementById('input-temp-email-base-url');
const rowTempEmailAdminAuth = document.getElementById('row-temp-email-admin-auth');
const inputTempEmailAdminAuth = document.getElementById('input-temp-email-admin-auth');
const rowTempEmailCustomAuth = document.getElementById('row-temp-email-custom-auth');
const inputTempEmailCustomAuth = document.getElementById('input-temp-email-custom-auth');
const rowTempEmailReceiveMailbox = document.getElementById('row-temp-email-receive-mailbox');
const inputTempEmailReceiveMailbox = document.getElementById('input-temp-email-receive-mailbox');
const rowTempEmailRandomSubdomainToggle = document.getElementById('row-temp-email-random-subdomain-toggle');
const inputTempEmailUseRandomSubdomain = document.getElementById('input-temp-email-use-random-subdomain');
const rowTempEmailDomain = document.getElementById('row-temp-email-domain');
const selectTempEmailDomain = document.getElementById('select-temp-email-domain');
const inputTempEmailDomain = document.getElementById('input-temp-email-domain');
const btnTempEmailDomainMode = document.getElementById('btn-temp-email-domain-mode');
const cloudflareTempEmailSection = document.getElementById('cloudflare-temp-email-section');
const btnCloudflareTempEmailUsageGuide = document.getElementById('btn-cloudflare-temp-email-usage-guide');
const btnCloudflareTempEmailGithub = document.getElementById('btn-cloudflare-temp-email-github');
const hotmailSection = document.getElementById('hotmail-section');
const mail2925Section = document.getElementById('mail2925-section');
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
const selectIcloudFetchMode = document.getElementById('select-icloud-fetch-mode');
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
const btnToggleHotmailForm = document.getElementById('btn-toggle-hotmail-form');
const btnHotmailUsageGuide = document.getElementById('btn-hotmail-usage-guide');
const btnClearUsedHotmailAccounts = document.getElementById('btn-clear-used-hotmail-accounts');
const btnDeleteAllHotmailAccounts = document.getElementById('btn-delete-all-hotmail-accounts');
const btnToggleHotmailList = document.getElementById('btn-toggle-hotmail-list');
const hotmailFormShell = document.getElementById('hotmail-form-shell');
const hotmailListShell = document.getElementById('hotmail-list-shell');
const hotmailAccountsList = document.getElementById('hotmail-accounts-list');
const inputMail2925Email = document.getElementById('input-mail2925-email');
const inputMail2925Password = document.getElementById('input-mail2925-password');
const inputMail2925Import = document.getElementById('input-mail2925-import');
const btnAddMail2925Account = document.getElementById('btn-add-mail2925-account');
const btnToggleMail2925Form = document.getElementById('btn-toggle-mail2925-form');
const btnImportMail2925Accounts = document.getElementById('btn-import-mail2925-accounts');
const btnDeleteAllMail2925Accounts = document.getElementById('btn-delete-all-mail2925-accounts');
const btnToggleMail2925List = document.getElementById('btn-toggle-mail2925-list');
const mail2925FormShell = document.getElementById('mail2925-form-shell');
const mail2925ListShell = document.getElementById('mail2925-list-shell');
const mail2925AccountsList = document.getElementById('mail2925-accounts-list');
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
const selectMail2925PoolAccount = document.getElementById('select-mail2925-pool-account');
const inputMail2925UseAccountPool = document.getElementById('input-mail2925-use-account-pool');
const labelMail2925UseAccountPool = document.getElementById('label-mail2925-use-account-pool');
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
const inputVerificationResendCount = document.getElementById('input-verification-resend-count');
const rowAccountRunHistoryTextEnabled = document.getElementById('row-account-run-history-text-enabled');
const inputHeroSmsApiKey = document.getElementById('input-hero-sms-api-key');
const selectHeroSmsCountry = document.getElementById('select-hero-sms-country');
const displayHeroSmsPlatform = document.getElementById('display-hero-sms-platform');
const inputAccountRunHistoryTextEnabled = document.getElementById('input-account-run-history-text-enabled');
const rowAccountRunHistoryHelperBaseUrl = document.getElementById('row-account-run-history-helper-base-url');
const inputAccountRunHistoryHelperBaseUrl = document.getElementById('input-account-run-history-helper-base-url');
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
const stepDefinitions = (window.MultiPageStepDefinitions?.getSteps?.() || []).sort((left, right) => left.order - right.order);
const STEP_IDS = stepDefinitions.map((step) => Number(step.id)).filter(Number.isFinite);
const STEP_DEFAULT_STATUSES = Object.fromEntries(STEP_IDS.map((stepId) => [stepId, 'pending']));
const SKIPPABLE_STEPS = new Set(STEP_IDS);
const stepsList = document.querySelector('.steps-list');
const AUTO_DELAY_MIN_MINUTES = 1;
const AUTO_DELAY_MAX_MINUTES = 1440;
const AUTO_DELAY_DEFAULT_MINUTES = 30;
const AUTO_FALLBACK_THREAD_INTERVAL_MIN_MINUTES = 0;
const AUTO_FALLBACK_THREAD_INTERVAL_MAX_MINUTES = 1440;
const AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES = 0;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_SECONDS = 600;
const VERIFICATION_RESEND_COUNT_MIN = 0;
const VERIFICATION_RESEND_COUNT_MAX = 20;
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const DEFAULT_CPA_CALLBACK_MODE = 'step8';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
const NEW_USER_GUIDE_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-new-user-guide-prompt-dismissed';
const AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-skip-failures-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-run-fallback-risk-prompt-dismissed';
const CONTRIBUTION_CONTENT_PROMPT_DISMISSED_VERSION_STORAGE_KEY = 'multipage-contribution-content-prompt-dismissed-version';
const AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS = 3;
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const GMAIL_ALIAS_GENERATOR = 'gmail-alias';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const CUSTOM_EMAIL_POOL_GENERATOR = 'custom-pool';
const DEFAULT_LUCKMAIL_BASE_URL = 'https://mails.luckyous.com';
const DEFAULT_LUCKMAIL_EMAIL_TYPE = 'ms_graph';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL = 'http://127.0.0.1:17373';
const CONTRIBUTION_UPLOAD_URL = 'https://apikey.qzz.io/';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';

function getManagedAliasUtils() {
  return window.MultiPageManagedAliasUtils || null;
}

function isManagedAliasProvider(provider = selectMailProvider.value, mail2925Mode = getSelectedMail2925Mode()) {
  const utils = getManagedAliasUtils();
  if (utils?.usesManagedAliasGeneration) {
    return utils.usesManagedAliasGeneration(provider, { mail2925Mode });
  }
  if (utils?.isManagedAliasProvider) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === '2925') {
      return utils.isManagedAliasProvider(provider)
        && normalizeMail2925Mode(mail2925Mode) === MAIL_2925_MODE_PROVIDE;
    }
    return utils.isManagedAliasProvider(provider);
  }
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider === '2925') {
    return normalizeMail2925Mode(mail2925Mode) === MAIL_2925_MODE_PROVIDE;
  }
  return normalizedProvider === GMAIL_PROVIDER;
}

function parseManagedAliasBaseEmail(rawValue, provider = selectMailProvider.value) {
  const utils = getManagedAliasUtils();
  if (utils?.parseManagedAliasBaseEmail) {
    return utils.parseManagedAliasBaseEmail(rawValue, provider);
  }
  return null;
}

function isManagedAliasEmail(value, baseEmail = '', provider = selectMailProvider.value) {
  const utils = getManagedAliasUtils();
  if (utils?.isManagedAliasEmail) {
    return utils.isManagedAliasEmail(value, provider, baseEmail);
  }
  return false;
}

function getManagedAliasProviderUiCopy(provider = selectMailProvider.value, mail2925Mode = getSelectedMail2925Mode()) {
  if (!isManagedAliasProvider(provider, mail2925Mode)) {
    return null;
  }
  const utils = getManagedAliasUtils();
  if (utils?.getManagedAliasProviderUiCopy) {
    return utils.getManagedAliasProviderUiCopy(provider);
  }
  if (String(provider || '').trim().toLowerCase() === GMAIL_PROVIDER) {
    return {
      baseLabel: '基邮箱',
      basePlaceholder: '例如 yourname@gmail.com',
      buttonLabel: '生成',
      successVerb: '生成',
      label: 'Gmail +tag 邮箱',
      placeholder: '点击生成 Gmail +tag 邮箱，或手动填写完整邮箱',
      hint: '先填写基邮箱后点“生成”，也可以直接手动填写完整的 Gmail 邮箱。',
    };
  }
  if (String(provider || '').trim().toLowerCase() === '2925') {
    return {
      baseLabel: '基邮箱',
      basePlaceholder: '例如 yourname@2925.com',
      buttonLabel: '生成',
      successVerb: '生成',
      label: '2925 邮箱',
      placeholder: '点击生成 2925 邮箱，或手动填写完整邮箱',
      hint: '先填写基邮箱后点“生成”，也可以直接手动填写完整的 2925 邮箱。',
    };
  }
  return null;
}

function getManagedAliasBaseEmailKey(provider = selectMailProvider.value) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider === GMAIL_PROVIDER) {
    return 'gmailBaseEmail';
  }
  if (normalizedProvider === '2925') {
    return 'mail2925BaseEmail';
  }
  return '';
}

function isMail2925AccountPoolEnabled(state = latestState) {
  return Boolean(state?.mail2925UseAccountPool);
}

function getPreferredMail2925PoolAccountId(state = latestState) {
  const currentId = String(state?.currentMail2925AccountId || '').trim();
  if (currentId && getMail2925Accounts(state).some((account) => account.id === currentId)) {
    return currentId;
  }
  return '';
}

function syncMail2925PoolAccountOptions(state = latestState) {
  if (!selectMail2925PoolAccount) {
    return;
  }

  const accounts = getMail2925Accounts(state);
  const selectedId = getPreferredMail2925PoolAccountId(state);
  const options = ['<option value="">请选择号池邮箱</option>'].concat(
    accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.email || '(未命名账号)')}</option>`)
  );
  selectMail2925PoolAccount.innerHTML = options.join('');
  selectMail2925PoolAccount.value = selectedId;
}

async function syncSelectedMail2925PoolAccount(options = {}) {
  const { silent = false } = options;
  if (!selectMail2925PoolAccount || !isMail2925AccountPoolEnabled(latestState)) {
    return null;
  }

  const accountId = String(selectMail2925PoolAccount.value || '').trim();
  if (!accountId) {
    syncLatestState({ currentMail2925AccountId: null });
    setManagedAliasBaseEmailInputForProvider('2925', latestState);
    return null;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SELECT_MAIL2925_ACCOUNT',
    source: 'sidepanel',
    payload: { accountId },
  });
  if (response?.error) {
    throw new Error(response.error);
  }

  syncLatestState({
    currentMail2925AccountId: response.account?.id || accountId,
    ...(response.account?.email ? { mail2925BaseEmail: String(response.account.email).trim() } : {}),
  });
  setManagedAliasBaseEmailInputForProvider('2925', latestState);
  if (!silent) {
    showToast(`已切换当前 2925 号池邮箱为 ${response.account?.email || accountId}`, 'success', 1800);
  }
  return response.account || null;
}

function getManagedAliasBaseEmailForProvider(provider = selectMailProvider.value, state = latestState) {
  if (String(provider || '').trim().toLowerCase() === '2925' && isMail2925AccountPoolEnabled(state)) {
    const currentMail2925Email = getCurrentMail2925Email(state);
    if (currentMail2925Email) {
      return currentMail2925Email;
    }
  }

  const key = getManagedAliasBaseEmailKey(provider);
  if (!key) {
    return '';
  }

  const providerValue = String(state?.[key] || '').trim();
  if (providerValue) {
    return providerValue;
  }

  const legacyEmailPrefix = String(state?.emailPrefix || '').trim();
  return parseManagedAliasBaseEmail(legacyEmailPrefix, provider) ? legacyEmailPrefix : '';
}

function buildManagedAliasBaseEmailPayload(state = latestState) {
  const payload = {
    gmailBaseEmail: String(state?.gmailBaseEmail || '').trim(),
    mail2925BaseEmail: String(state?.mail2925BaseEmail || '').trim(),
    mail2925UseAccountPool: Boolean(state?.mail2925UseAccountPool),
    emailPrefix: '',
  };
  const key = getManagedAliasBaseEmailKey();
  if (key) {
    if (key === 'mail2925BaseEmail' && isMail2925AccountPoolEnabled(state)) {
      payload[key] = String(state?.mail2925BaseEmail || '').trim();
    } else {
      payload[key] = inputEmailPrefix.value.trim();
    }
  }
  return payload;
}

function syncManagedAliasBaseEmailDraftFromInput(provider = selectMailProvider.value) {
  const key = getManagedAliasBaseEmailKey(provider);
  if (!key) {
    return;
  }
  if (key === 'mail2925BaseEmail' && isMail2925AccountPoolEnabled(latestState)) {
    return;
  }
  syncLatestState({ [key]: inputEmailPrefix.value.trim() });
}

function setManagedAliasBaseEmailInputForProvider(provider = selectMailProvider.value, state = latestState) {
  syncMail2925PoolAccountOptions(state);
  inputEmailPrefix.value = getManagedAliasBaseEmailForProvider(provider, state);
}

function getCurrentRegistrationEmailUiCopy() {
  if (isCustomMailProvider()) {
    return getCustomMailProviderUiCopy();
  }
  if (usesGeneratedAliasMailProvider()) {
    return getManagedAliasProviderUiCopy();
  }
  return getEmailGeneratorUiCopy();
}

function isCurrentRegistrationEmailCompatible(email = inputEmail.value.trim(), provider = selectMailProvider.value, state = latestState) {
  if (!usesGeneratedAliasMailProvider(provider, getSelectedMail2925Mode()) || !email) {
    return true;
  }
  const baseEmail = getManagedAliasBaseEmailForProvider(provider, state);
  return isManagedAliasEmail(email, baseEmail, provider);
}

function validateCurrentRegistrationEmail(email = inputEmail.value.trim(), options = {}) {
  const { showToastOnFailure = false } = options;
  if (isCurrentRegistrationEmailCompatible(email)) {
    return true;
  }

  if (showToastOnFailure) {
    const uiCopy = getManagedAliasProviderUiCopy();
    const baseEmail = getManagedAliasBaseEmailForProvider();
    showToast(
      baseEmail
        ? `当前邮箱服务为“${uiCopy?.label || '别名邮箱'}”，注册邮箱需与 ${uiCopy?.baseLabel || '基邮箱'} 对应。`
        : `当前邮箱服务为“${uiCopy?.label || '别名邮箱'}”，请直接填写完整邮箱，或先填写基邮箱后点击“生成”。`,
      'warn'
    );
  }
  return false;
}

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
let settingsSaveRevision = 0;
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
let modalChoiceResolver = null;
let currentModalActions = [];
let modalResultBuilder = null;
let scheduledCountdownTimer = null;
let configMenuOpen = false;
let configActionInFlight = false;
let currentReleaseSnapshot = null;
let currentContributionContentSnapshot = null;
let contributionContentSnapshotRequestInFlight = null;

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
const sidepanelUpdateService = window.SidepanelUpdateService;
const contributionContentService = window.SidepanelContributionContentService;
const DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME = window.LuckMailUtils?.DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME || '保留';
const normalizeIcloudHost = window.IcloudUtils?.normalizeIcloudHost
  || ((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'icloud.com' || normalized === 'icloud.com.cn' ? normalized : '';
  });
const normalizeIcloudFetchMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'always_new' ? 'always_new' : 'reuse_existing';
};
const getIcloudLoginUrlForHost = window.IcloudUtils?.getIcloudLoginUrlForHost
  || ((host) => host === 'icloud.com.cn' ? 'https://www.icloud.com.cn/' : (host === 'icloud.com' ? 'https://www.icloud.com/' : ''));

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

const CLOUDFLARE_TEMP_EMAIL_REPOSITORY_URL = 'https://github.com/dreamhunter2333/cloudflare_temp_email';

function usesGeneratedAliasMailProvider(
  provider,
  mail2925Mode = getSelectedMail2925Mode(),
  generator = undefined
) {
  const customEmailPoolGenerator = typeof CUSTOM_EMAIL_POOL_GENERATOR === 'string'
    ? CUSTOM_EMAIL_POOL_GENERATOR
    : 'custom-pool';
  const resolvedGenerator = generator !== undefined
    ? generator
    : (typeof getSelectedEmailGenerator === 'function' ? getSelectedEmailGenerator() : '');
  return resolvedGenerator !== customEmailPoolGenerator
    && isManagedAliasProvider(provider, mail2925Mode);
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

function setActionModalMessageContent({ text = '', html = '' } = {}) {
  if (!autoStartMessage) {
    return;
  }

  if (html) {
    autoStartMessage.innerHTML = html;
    return;
  }

  autoStartMessage.textContent = text;
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

function openActionModal({ title, message, messageHtml, actions, option, alert, buildResult }) {
  if (!autoStartModal) {
    return Promise.resolve(null);
  }

  if (modalChoiceResolver) {
    resolveModalChoice(null);
  }

  resetActionModalButtons();
  autoStartTitle.textContent = title;
  setActionModalMessageContent({ text: message, html: messageHtml });
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

function isNewUserGuidePromptDismissed() {
  return isPromptDismissed(NEW_USER_GUIDE_PROMPT_DISMISSED_STORAGE_KEY);
}

function setNewUserGuidePromptDismissed(dismissed) {
  setPromptDismissed(NEW_USER_GUIDE_PROMPT_DISMISSED_STORAGE_KEY, dismissed);
}

function shouldPromptNewUserGuide() {
  if (isNewUserGuidePromptDismissed()) {
    return false;
  }
  if (!btnContributionMode || btnContributionMode.disabled) {
    return false;
  }
  if (latestState?.contributionMode) {
    return false;
  }
  return true;
}

function getContributionPortalUrl() {
  return String(contributionContentService?.portalUrl || 'https://apikey.qzz.io').trim();
}

function openNewUserGuidePrompt() {
  return openActionModal({
    title: '新手引导',
    message: '如果你是第一次使用，可以先查看贡献页里的公告和使用教程。点击“查看引导”会自动打开贡献页面。',
    alert: {
      text: '本提示仅出现一次。',
    },
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: '查看引导', variant: 'btn-primary' },
    ],
  });
}

async function maybeShowNewUserGuidePrompt() {
  if (!shouldPromptNewUserGuide()) {
    return false;
  }

  setNewUserGuidePromptDismissed(true);
  const choice = await openNewUserGuidePrompt();
  if (choice === 'confirm') {
    openExternalUrl(getContributionPortalUrl());
    return true;
  }
  return false;
}

function getDismissedContributionContentPromptVersion() {
  return String(localStorage.getItem(CONTRIBUTION_CONTENT_PROMPT_DISMISSED_VERSION_STORAGE_KEY) || '').trim();
}

function setDismissedContributionContentPromptVersion(version) {
  const normalized = String(version || '').trim();
  if (normalized) {
    localStorage.setItem(CONTRIBUTION_CONTENT_PROMPT_DISMISSED_VERSION_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(CONTRIBUTION_CONTENT_PROMPT_DISMISSED_VERSION_STORAGE_KEY);
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

async function openAutoRunFallbackRiskConfirmModal(totalRuns) {
  const result = await openConfirmModalWithOption({
    title: '自动运行风险提醒',
    message: `当前轮数已经不适合单节点情况，请确保已经配置并打开节点轮询功能（若没有配置，请点击贡献/使用按钮，根据网页中使用教程进行配置），避免连续使用一个节点注册，导致出现手机号验证。`,
    confirmLabel: '继续',
  });

  return {
    confirmed: result.confirmed,
    dismissPrompt: result.optionChecked,
  };
}

function updateConfigMenuControls() {
  const disabled = configActionInFlight || settingsSaveInFlight;
  const contributionModeEnabled = Boolean(latestState?.contributionMode);
  if (contributionModeEnabled && configMenuOpen) {
    configMenuOpen = false;
  }
  const importLocked = disabled
    || contributionModeEnabled
    || currentAutoRun.autoRunning
    || Object.values(getStepStatuses()).some((status) => status === 'running');
  if (btnConfigMenu) {
    btnConfigMenu.disabled = disabled || contributionModeEnabled;
    btnConfigMenu.setAttribute('aria-expanded', String(configMenuOpen));
  }
  if (configMenu) {
    configMenu.hidden = contributionModeEnabled || !configMenuOpen;
  }
  if (btnExportSettings) {
    btnExportSettings.disabled = disabled || contributionModeEnabled;
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
  for (const step of STEP_IDS) {
    if (!isDoneStatus(statuses[step])) {
      return step;
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

function isContributionModeSwitchBlocked(state = latestState) {
  const statuses = getStepStatuses(state);
  const anyRunning = Object.values(statuses).some((status) => status === 'running');
  return anyRunning || isAutoRunLockedPhase() || isAutoRunPausedPhase() || isAutoRunScheduledPhase();
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

  renderAccountRecords(latestState);
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

function isContributionButtonLocked() {
  const autoActive = currentAutoRun.autoRunning
    || isAutoRunLockedPhase()
    || isAutoRunPausedPhase()
    || isAutoRunScheduledPhase();
  if (autoActive) {
    return false;
  }

  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some((status) => status === 'running');
  return anyRunning;
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

function normalizeVerificationResendCount(value, fallback) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return fallback;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    VERIFICATION_RESEND_COUNT_MAX,
    Math.max(VERIFICATION_RESEND_COUNT_MIN, Math.floor(numeric))
  );
}

function formatAutoStepDelayInputValue(value) {
  const normalized = normalizeAutoStepDelaySeconds(value);
  return normalized === null ? '' : String(normalized);
}

function normalizeCustomEmailPoolEntries(value = '') {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\r\n,，;；]+/);

  return source
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function usesCustomEmailPoolGenerator(provider = selectMailProvider.value) {
  return !isCustomMailProvider(provider)
    && !isLuckmailProvider(provider)
    && getSelectedEmailGenerator() === CUSTOM_EMAIL_POOL_GENERATOR;
}

function getCustomMailProviderPoolSize() {
  return normalizeCustomEmailPoolEntries(inputCustomMailProviderPool?.value).length;
}

function usesCustomMailProviderPool(provider = selectMailProvider.value) {
  return isCustomMailProvider(provider) && getCustomMailProviderPoolSize() > 0;
}

function getCustomEmailPoolSize() {
  return normalizeCustomEmailPoolEntries(inputCustomEmailPool?.value).length;
}

function getLockedRunCountFromEmailPool(provider = selectMailProvider.value) {
  if (usesCustomMailProviderPool(provider)) {
    return getCustomMailProviderPoolSize();
  }
  if (usesCustomEmailPoolGenerator(provider)) {
    return getCustomEmailPoolSize();
  }
  return 0;
}

function shouldLockRunCountToEmailPool(provider = selectMailProvider.value) {
  return getLockedRunCountFromEmailPool(provider) > 0;
}

function syncRunCountFromCustomEmailPool() {
  if (!usesCustomEmailPoolGenerator()) {
    return;
  }
  inputRunCount.value = String(getCustomEmailPoolSize());
}

function syncRunCountFromCustomMailProviderPool() {
  if (!usesCustomMailProviderPool()) {
    return;
  }
  inputRunCount.value = String(getCustomMailProviderPoolSize());
}

function syncRunCountFromConfiguredEmailPool(provider = selectMailProvider.value) {
  const poolSize = getLockedRunCountFromEmailPool(provider);
  if (poolSize > 0) {
    inputRunCount.value = String(poolSize);
  }
}

function getRunCountValue() {
  const lockedRunCount = typeof getLockedRunCountFromEmailPool === 'function'
    ? getLockedRunCountFromEmailPool()
    : 0;
  if (lockedRunCount > 0) {
    return lockedRunCount;
  }
  return Math.max(1, parseInt(inputRunCount.value, 10) || 1);
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

  if (currentAutoRun.phase !== 'waiting_interval') {
    return null;
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
  inputRunCount.disabled = shouldLockRunCountToEmailPool();
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

function applyCloudflareTempEmailSettingsState(state = {}) {
  inputTempEmailBaseUrl.value = state?.cloudflareTempEmailBaseUrl || '';
  inputTempEmailAdminAuth.value = state?.cloudflareTempEmailAdminAuth || '';
  inputTempEmailCustomAuth.value = state?.cloudflareTempEmailCustomAuth || '';
  inputTempEmailReceiveMailbox.value = state?.cloudflareTempEmailReceiveMailbox || '';
  if (inputTempEmailUseRandomSubdomain) {
    inputTempEmailUseRandomSubdomain.checked = Boolean(state?.cloudflareTempEmailUseRandomSubdomain);
  }
  renderCloudflareTempEmailDomainOptions(state?.cloudflareTempEmailDomain || '');
  setCloudflareTempEmailDomainEditMode(false, { clearInput: true });
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
  const contributionModeEnabled = Boolean(latestState?.contributionMode);
  const icloudFetchModeRawValue = typeof selectIcloudFetchMode !== 'undefined'
    ? String(selectIcloudFetchMode?.value || '')
    : '';
  const mail2925UseAccountPool = typeof inputMail2925UseAccountPool !== 'undefined'
    ? Boolean(inputMail2925UseAccountPool?.checked)
    : Boolean(latestState?.mail2925UseAccountPool);
  const heroSmsApiKeyValue = typeof inputHeroSmsApiKey !== 'undefined' && inputHeroSmsApiKey
    ? (inputHeroSmsApiKey.value || '')
    : '';
  const heroSmsCountry = typeof getSelectedHeroSmsCountryOption === 'function'
    ? getSelectedHeroSmsCountryOption()
    : {
      id: typeof DEFAULT_HERO_SMS_COUNTRY_ID !== 'undefined' ? DEFAULT_HERO_SMS_COUNTRY_ID : 52,
      label: typeof DEFAULT_HERO_SMS_COUNTRY_LABEL !== 'undefined' ? DEFAULT_HERO_SMS_COUNTRY_LABEL : 'Thailand',
    };
  return {
    panelMode: selectPanelMode.value,
    vpsUrl: inputVpsUrl.value.trim(),
    vpsPassword: inputVpsPassword.value,
    localCpaStep9Mode: getSelectedLocalCpaStep9Mode(),
    sub2apiUrl: inputSub2ApiUrl.value.trim(),
    sub2apiEmail: inputSub2ApiEmail.value.trim(),
    sub2apiPassword: inputSub2ApiPassword.value,
    sub2apiGroupName: inputSub2ApiGroup.value.trim(),
    sub2apiDefaultProxyName: inputSub2ApiDefaultProxy.value.trim(),
    codex2apiUrl: inputCodex2ApiUrl.value.trim(),
    codex2apiAdminKey: inputCodex2ApiAdminKey.value.trim(),
    ...(contributionModeEnabled ? {} : {
      customPassword: inputPassword.value,
    }),
    mailProvider: selectMailProvider.value,
    mail2925Mode: getSelectedMail2925Mode(),
    mail2925UseAccountPool,
    currentMail2925AccountId: String(latestState?.currentMail2925AccountId || '').trim(),
    emailGenerator: selectEmailGenerator.value,
    customMailProviderPool: typeof normalizeCustomEmailPoolEntries === 'function'
      ? normalizeCustomEmailPoolEntries(inputCustomMailProviderPool?.value)
      : [],
    customEmailPool: typeof normalizeCustomEmailPoolEntries === 'function'
      ? normalizeCustomEmailPoolEntries(inputCustomEmailPool?.value)
      : [],
    autoDeleteUsedIcloudAlias: checkboxAutoDeleteIcloud?.checked,
    icloudHostPreference: selectIcloudHostPreference?.value || 'auto',
    icloudFetchMode: (icloudFetchModeRawValue.trim().toLowerCase() === 'always_new'
      ? 'always_new'
      : 'reuse_existing'),
    ...(contributionModeEnabled ? {} : {
      accountRunHistoryTextEnabled: Boolean(inputAccountRunHistoryTextEnabled?.checked),
      accountRunHistoryHelperBaseUrl: normalizeAccountRunHistoryHelperBaseUrlValue(inputAccountRunHistoryHelperBaseUrl?.value),
    }),
    ...buildManagedAliasBaseEmailPayload(),
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
    cloudflareTempEmailUseRandomSubdomain: Boolean(inputTempEmailUseRandomSubdomain?.checked),
    cloudflareTempEmailDomain: selectedCloudflareTempEmailDomain,
    cloudflareTempEmailDomains: tempEmailDomains,
    autoRunSkipFailures: inputAutoSkipFailures.checked,
    autoRunFallbackThreadIntervalMinutes: normalizeAutoRunThreadIntervalMinutes(inputAutoSkipFailuresThreadIntervalMinutes.value),
    autoRunDelayEnabled: inputAutoDelayEnabled.checked,
    autoRunDelayMinutes: normalizeAutoDelayMinutes(inputAutoDelayMinutes.value),
    autoStepDelaySeconds: normalizeAutoStepDelaySeconds(inputAutoStepDelaySeconds.value),
    verificationResendCount: normalizeVerificationResendCount(
      inputVerificationResendCount?.value,
      DEFAULT_VERIFICATION_RESEND_COUNT
    ),
    heroSmsApiKey: heroSmsApiKeyValue,
    heroSmsCountryId: heroSmsCountry.id,
    heroSmsCountryLabel: heroSmsCountry.label,
  };
}

function normalizeLocalCpaStep9Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'bypass'
    ? 'bypass'
    : DEFAULT_LOCAL_CPA_STEP9_MODE;
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

function normalizeAccountRunHistoryHelperBaseUrlValue(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL;
    }

    if (parsed.pathname === '/append-account-log' || parsed.pathname === '/sync-account-run-records') {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL;
  }
}

function normalizeHeroSmsCountryId(value) {
  return Math.max(1, Math.floor(Number(value) || DEFAULT_HERO_SMS_COUNTRY_ID));
}

function normalizeHeroSmsCountryLabel(value = '') {
  return String(value || '').trim() || DEFAULT_HERO_SMS_COUNTRY_LABEL;
}

function getSelectedHeroSmsCountryOption() {
  if (!selectHeroSmsCountry) {
    return {
      id: DEFAULT_HERO_SMS_COUNTRY_ID,
      label: DEFAULT_HERO_SMS_COUNTRY_LABEL,
    };
  }

  const option = selectHeroSmsCountry.options[selectHeroSmsCountry.selectedIndex];
  return {
    id: normalizeHeroSmsCountryId(selectHeroSmsCountry.value),
    label: normalizeHeroSmsCountryLabel(option?.textContent),
  };
}

function updateHeroSmsPlatformDisplay(label = '') {
  if (!displayHeroSmsPlatform) {
    return;
  }
  const countryLabel = normalizeHeroSmsCountryLabel(label);
  displayHeroSmsPlatform.textContent = `HeroSMS / OpenAI / ${countryLabel}`;
}

async function loadHeroSmsCountries() {
  if (!selectHeroSmsCountry) {
    return;
  }

  const previousValue = selectHeroSmsCountry.value || String(DEFAULT_HERO_SMS_COUNTRY_ID);
  try {
    const response = await fetch('https://hero-sms.com/stubs/handler_api.php?action=getCountries');
    const payload = await response.json();
    const countries = Array.isArray(payload?.value) ? payload.value : (Array.isArray(payload) ? payload : []);
    if (!countries.length) {
      throw new Error('empty country list');
    }

    const optionsHtml = countries
      .filter((item) => Number(item?.id) > 0 && String(item?.eng || '').trim())
      .sort((left, right) => String(left.eng || '').localeCompare(String(right.eng || '')))
      .map((item) => {
        const id = normalizeHeroSmsCountryId(item.id);
        const label = String(item.eng || '').trim();
        return `<option value="${id}">${label}</option>`;
      })
      .join('');

    if (optionsHtml) {
      selectHeroSmsCountry.innerHTML = optionsHtml;
    }
  } catch (error) {
    console.warn('Failed to load HeroSMS countries:', error);
    selectHeroSmsCountry.innerHTML = `<option value="${DEFAULT_HERO_SMS_COUNTRY_ID}">${DEFAULT_HERO_SMS_COUNTRY_LABEL}</option>`;
  }

  selectHeroSmsCountry.value = Array.from(selectHeroSmsCountry.options).some((option) => option.value === previousValue)
    ? previousValue
    : String(DEFAULT_HERO_SMS_COUNTRY_ID);
  updateHeroSmsPlatformDisplay(getSelectedHeroSmsCountryOption().label);
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

function updateAccountRunHistorySettingsUI() {
  if (!rowAccountRunHistoryHelperBaseUrl || !inputAccountRunHistoryTextEnabled) {
    return;
  }

  rowAccountRunHistoryHelperBaseUrl.style.display = inputAccountRunHistoryTextEnabled.checked && !latestState?.contributionMode
    ? ''
    : 'none';
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
  if (isDirty) {
    settingsSaveRevision += 1;
  }
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
  const saveRevision = settingsSaveRevision;
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

    if (response?.state && saveRevision === settingsSaveRevision) {
      applySettingsState(response.state);
    } else {
      syncLatestState(payload);
      if (saveRevision === settingsSaveRevision) {
        markSettingsDirty(false);
      }
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

  inputRunCount.disabled = currentAutoRun.autoRunning || shouldLockRunCountToEmailPool();
  btnAutoRun.disabled = currentAutoRun.autoRunning;
  btnFetchEmail.disabled = locked
    || isCustomMailProvider()
    || usesCustomEmailPoolGenerator();
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
        btnFetchEmail.disabled = isCustomMailProvider() || usesCustomEmailPoolGenerator();
      }
      break;
  }

  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  syncScheduledCountdownTicker();
  updateStopButtonState(scheduled || paused || locked || Object.values(getStepStatuses()).some(status => status === 'running'));
  updateConfigMenuControls();
  renderContributionMode();
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

function renderStepsList() {
  if (!stepsList) return;

  stepsList.innerHTML = stepDefinitions.map((step) => `
    <div class="step-row" data-step="${step.id}" data-step-key="${escapeHtml(step.key)}">
      <div class="step-indicator" data-step="${step.id}"><span class="step-num">${step.id}</span></div>
      <button class="step-btn" data-step="${step.id}" data-step-key="${escapeHtml(step.key)}">${escapeHtml(step.title)}</button>
      <span class="step-status" data-step="${step.id}"></span>
    </div>
  `).join('');

  if (stepsProgress) {
    stepsProgress.textContent = `0 / ${STEP_IDS.length}`;
  }
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
  inputSub2ApiGroup.value = state?.sub2apiGroupName || '';
  inputSub2ApiDefaultProxy.value = state?.sub2apiDefaultProxyName || '';
  inputCodex2ApiUrl.value = state?.codex2apiUrl || '';
  inputCodex2ApiAdminKey.value = state?.codex2apiAdminKey || '';
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
    if (restoredMailProvider === GMAIL_PROVIDER) {
      selectEmailGenerator.value = restoredEmailGenerator === CUSTOM_EMAIL_POOL_GENERATOR
        ? CUSTOM_EMAIL_POOL_GENERATOR
        : GMAIL_ALIAS_GENERATOR;
    } else if (restoredEmailGenerator === CUSTOM_EMAIL_POOL_GENERATOR) {
      selectEmailGenerator.value = CUSTOM_EMAIL_POOL_GENERATOR;
    } else if (restoredEmailGenerator === 'icloud') {
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
  if (selectIcloudFetchMode) {
    selectIcloudFetchMode.value = normalizeIcloudFetchMode(state?.icloudFetchMode);
  }
  if (checkboxAutoDeleteIcloud) {
    checkboxAutoDeleteIcloud.checked = Boolean(state?.autoDeleteUsedIcloudAlias);
  }
  if (inputAccountRunHistoryTextEnabled) {
    inputAccountRunHistoryTextEnabled.checked = Boolean(state?.accountRunHistoryTextEnabled);
  }
  if (inputAccountRunHistoryHelperBaseUrl) {
    inputAccountRunHistoryHelperBaseUrl.value = normalizeAccountRunHistoryHelperBaseUrlValue(state?.accountRunHistoryHelperBaseUrl);
  }
  if (inputContributionNickname) {
    inputContributionNickname.value = state?.contributionNickname || '';
  }
  if (inputContributionQq) {
    inputContributionQq.value = state?.contributionQq || '';
  }
  if (inputMail2925UseAccountPool) {
    inputMail2925UseAccountPool.checked = Boolean(state?.mail2925UseAccountPool);
  }
  setManagedAliasBaseEmailInputForProvider(restoredMailProvider, state);
  inputInbucketHost.value = state?.inbucketHost || '';
  inputInbucketMailbox.value = state?.inbucketMailbox || '';
  if (inputCustomMailProviderPool) {
    inputCustomMailProviderPool.value = normalizeCustomEmailPoolEntries(state?.customMailProviderPool).join('\n');
  }
  if (inputCustomEmailPool) {
    inputCustomEmailPool.value = normalizeCustomEmailPoolEntries(state?.customEmailPool).join('\n');
  }
  setHotmailServiceMode(state?.hotmailServiceMode);
  inputHotmailRemoteBaseUrl.value = state?.hotmailRemoteBaseUrl || '';
  inputHotmailLocalBaseUrl.value = state?.hotmailLocalBaseUrl || '';
  inputLuckmailApiKey.value = state?.luckmailApiKey || '';
  inputLuckmailBaseUrl.value = normalizeLuckmailBaseUrl(state?.luckmailBaseUrl);
  selectLuckmailEmailType.value = normalizeLuckmailEmailType(state?.luckmailEmailType);
  inputLuckmailDomain.value = state?.luckmailDomain || '';
  applyCloudflareTempEmailSettingsState(state);
  renderCloudflareDomainOptions(state?.cloudflareDomain || '');
  setCloudflareDomainEditMode(false, { clearInput: true });
  inputAutoSkipFailures.checked = Boolean(state?.autoRunSkipFailures);
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(normalizeAutoRunThreadIntervalMinutes(state?.autoRunFallbackThreadIntervalMinutes));
  inputAutoDelayEnabled.checked = Boolean(state?.autoRunDelayEnabled);
  inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(state?.autoRunDelayMinutes));
  inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(state?.autoStepDelaySeconds);
  if (inputVerificationResendCount) {
    const restoredVerificationResendCount = state?.verificationResendCount !== undefined
      ? state.verificationResendCount
      : (state?.signupVerificationResendCount ?? state?.loginVerificationResendCount);
    inputVerificationResendCount.value = String(
      normalizeVerificationResendCount(restoredVerificationResendCount, DEFAULT_VERIFICATION_RESEND_COUNT)
    );
  }
  if (inputHeroSmsApiKey) {
    inputHeroSmsApiKey.value = state?.heroSmsApiKey || '';
  }
  if (selectHeroSmsCountry) {
    const restoredCountryId = String(normalizeHeroSmsCountryId(state?.heroSmsCountryId));
    if (Array.from(selectHeroSmsCountry.options).some((option) => option.value === restoredCountryId)) {
      selectHeroSmsCountry.value = restoredCountryId;
    }
    updateHeroSmsPlatformDisplay(state?.heroSmsCountryLabel || getSelectedHeroSmsCountryOption().label);
  }
  if (state?.autoRunTotalRuns) {
    inputRunCount.value = String(state.autoRunTotalRuns);
  }

  applyAutoRunStatus(state);
  markSettingsDirty(false);
  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  updateAccountRunHistorySettingsUI();
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
    renderContributionMode();
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

function getRepositoryHomeUrl() {
  const serviceRepositoryUrl = String(sidepanelUpdateService?.repositoryUrl || '').trim();
  if (serviceRepositoryUrl) {
    return serviceRepositoryUrl;
  }

  const releasesPageUrl = String(sidepanelUpdateService?.releasesPageUrl || '').trim();
  if (releasesPageUrl) {
    return releasesPageUrl.replace(/\/releases\/?$/, '');
  }

  return 'https://github.com/QLHazyCoder/codex-oauth-automation-extension';
}

function getReleaseListUrl() {
  const snapshotReleaseListUrl = String(currentReleaseSnapshot?.releasesPageUrl || '').trim();
  if (snapshotReleaseListUrl) {
    return snapshotReleaseListUrl;
  }

  const serviceReleaseListUrl = String(sidepanelUpdateService?.releasesPageUrl || '').trim();
  if (serviceReleaseListUrl) {
    return serviceReleaseListUrl;
  }

  return `${getRepositoryHomeUrl()}/releases`;
}

function openRepositoryHomePage() {
  openExternalUrl(getRepositoryHomeUrl());
}

function openReleaseListPage() {
  openExternalUrl(getReleaseListUrl());
}

function openCloudflareTempEmailUsageGuidePage() {
  const targetUrl = getContributionPortalUrl();
  if (!targetUrl) {
    return;
  }
  openExternalUrl(targetUrl);
}

function openCloudflareTempEmailRepositoryPage() {
  openExternalUrl(CLOUDFLARE_TEMP_EMAIL_REPOSITORY_URL);
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
    version.textContent = release.displayVersion || `Pro${release.version}`;
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

  const localVersionText = snapshot?.localVersion || '';
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
        updateCardVersion.textContent = `最新版本 ${snapshot.latestVersion}`;
      }
      if (updateCardSummary) {
        const updateCount = Array.isArray(snapshot.newerReleases) ? snapshot.newerReleases.length : 0;
        updateCardSummary.textContent = updateCount > 1
          ? `当前 ${localVersionText}，共有 ${updateCount} 个新版本可更新。`
          : `当前 ${localVersionText}，可更新到 ${snapshot.latestVersion}。`;
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
      extensionUpdateStatus.textContent = localVersionText || 'Pro0.0';
      extensionUpdateStatus.classList.add('is-version-label');
      resetUpdateCard();
      break;
    }

    case 'empty': {
      extensionUpdateStatus.textContent = localVersionText || 'Pro0.0';
      extensionUpdateStatus.classList.add('is-version-label');
      resetUpdateCard();
      break;
    }

    case 'error':
    default: {
      extensionUpdateStatus.textContent = localVersionText || 'Pro0.0';
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

  const localVersion = sidepanelUpdateService?.getLocalVersionLabel?.(chrome.runtime.getManifest())
    || chrome.runtime.getManifest()?.version_name
    || (chrome.runtime.getManifest()?.version ? `v${chrome.runtime.getManifest().version}` : '');
  extensionUpdateStatus.textContent = localVersion || 'Pro0.0';
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

function getContributionUpdateHintMessage(snapshot = currentContributionContentSnapshot) {
  const lines = getContributionUpdatePromptLines(snapshot);
  if (!lines.length) {
    return '';
  }
  if (lines.length === 1) {
    return lines[0];
  }
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

function getContributionUpdatePromptLines(snapshot = currentContributionContentSnapshot) {
  if (!snapshot?.promptVersion) {
    return [];
  }

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const hasAnnouncementOrTutorial = items.some((item) =>
    item
    && item.isVisible
    && ['announcement', 'tutorial'].includes(String(item.slug || '').trim().toLowerCase())
  );
  const hasQuestionnaire = items.some((item) =>
    item
    && item.isVisible
    && String(item.slug || '').trim().toLowerCase() === 'questionnaire'
  );

  const lines = [];
  if (hasAnnouncementOrTutorial) {
    lines.push('公告 / 使用教程有更新了，可点上方“贡献/使用”查看。');
  }
  if (hasQuestionnaire) {
    lines.push('有新的征求意见，请佬友共同参与选择。');
  }
  return lines;
}

function shouldPromptContributionUpdateBeforeAutoRun(snapshot = currentContributionContentSnapshot) {
  const promptVersion = String(snapshot?.promptVersion || '').trim();
  if (!promptVersion) {
    return false;
  }
  if (promptVersion === getDismissedContributionContentPromptVersion()) {
    return false;
  }
  return getContributionUpdatePromptLines(snapshot).length > 0;
}

async function maybeConfirmContributionUpdateBeforeAutoRun(snapshot = currentContributionContentSnapshot) {
  if (!shouldPromptContributionUpdateBeforeAutoRun(snapshot)) {
    return true;
  }

  const confirmed = await openConfirmModal({
    title: '自动前提醒',
    message: getContributionUpdateHintMessage(snapshot),
    confirmLabel: '确定继续',
    confirmVariant: 'btn-primary',
  });
  if (!confirmed) {
    return false;
  }
  dismissContributionUpdateHint();
  return true;
}

function positionContributionUpdateHint() {
  if (!contributionUpdateLayer || !contributionUpdateHint || !btnContributionMode) {
    return;
  }
  if (contributionUpdateLayer.hidden || contributionUpdateHint.hidden) {
    return;
  }

  const buttonRect = btnContributionMode.getBoundingClientRect();
  const viewportWidth = Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement?.clientHeight || 0, window.innerHeight || 0);
  const hintWidth = contributionUpdateHint.offsetWidth || 220;
  const hintHeight = contributionUpdateHint.offsetHeight || 56;
  const viewportPadding = 12;
  const gap = 10;

  const maxLeft = Math.max(viewportPadding, viewportWidth - hintWidth - viewportPadding);
  const left = Math.min(Math.max(viewportPadding, Math.round(buttonRect.left)), maxLeft);
  const shouldPlaceAbove = (buttonRect.bottom + gap + hintHeight) > (viewportHeight - viewportPadding)
    && buttonRect.top > (hintHeight + gap + viewportPadding);
  const top = shouldPlaceAbove
    ? Math.max(viewportPadding, Math.round(buttonRect.top - hintHeight - gap))
    : Math.max(viewportPadding, Math.round(buttonRect.bottom + gap));
  const buttonCenter = Math.round(buttonRect.left + (buttonRect.width / 2));
  const arrowOffset = Math.min(Math.max(16, buttonCenter - left), Math.max(16, hintWidth - 16));

  contributionUpdateHint.style.left = `${left}px`;
  contributionUpdateHint.style.top = `${top}px`;
  contributionUpdateHint.style.setProperty('--contribution-update-arrow-left', `${arrowOffset}px`);
}

function shouldShowContributionUpdateHint(snapshot = currentContributionContentSnapshot) {
  const promptVersion = String(snapshot?.promptVersion || '').trim();
  if (!contributionUpdateLayer || !contributionUpdateHint || !contributionUpdateHintText || !btnContributionMode) {
    return false;
  }
  if (!promptVersion) {
    return false;
  }
  if (promptVersion === getDismissedContributionContentPromptVersion()) {
    return false;
  }
  if (latestState?.contributionMode) {
    return false;
  }
  return !btnContributionMode.disabled;
}

function renderContributionUpdateHint(snapshot = currentContributionContentSnapshot) {
  if (!contributionUpdateLayer || !contributionUpdateHint) {
    return;
  }

  const visible = shouldShowContributionUpdateHint(snapshot);
  contributionUpdateLayer.hidden = !visible;
  contributionUpdateHint.hidden = !visible;
  if (!visible || !contributionUpdateHintText) {
    return;
  }

  contributionUpdateHintText.textContent = getContributionUpdateHintMessage(snapshot);
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => positionContributionUpdateHint());
    return;
  }
  positionContributionUpdateHint();
}

function dismissContributionUpdateHint() {
  const promptVersion = String(currentContributionContentSnapshot?.promptVersion || '').trim();
  if (promptVersion) {
    setDismissedContributionContentPromptVersion(promptVersion);
  }
  renderContributionUpdateHint();
}

async function refreshContributionContentHint() {
  if (!contributionContentService?.getContentUpdateSnapshot) {
    currentContributionContentSnapshot = null;
    renderContributionUpdateHint();
    return null;
  }
  if (contributionContentSnapshotRequestInFlight) {
    return contributionContentSnapshotRequestInFlight;
  }

  contributionContentSnapshotRequestInFlight = contributionContentService.getContentUpdateSnapshot()
    .then((snapshot) => {
      currentContributionContentSnapshot = snapshot;
      renderContributionUpdateHint(snapshot);
      return snapshot;
    })
    .catch((error) => {
      currentContributionContentSnapshot = null;
      renderContributionUpdateHint(null);
      throw error;
    })
    .finally(() => {
      contributionContentSnapshotRequestInFlight = null;
    });

  return contributionContentSnapshotRequestInFlight;
}

function syncPasswordField(state) {
  inputPassword.value = state?.contributionMode ? '' : (state.customPassword || state.password || '');
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
  if (generator === GMAIL_ALIAS_GENERATOR) {
    return GMAIL_ALIAS_GENERATOR;
  }
  if (generator === CUSTOM_EMAIL_POOL_GENERATOR) {
    return CUSTOM_EMAIL_POOL_GENERATOR;
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
  if (getSelectedEmailGenerator() === GMAIL_ALIAS_GENERATOR) {
    return {
      buttonLabel: '生成',
      placeholder: '步骤 3 自动生成 Gmail +tag 邮箱并回填',
      successVerb: '生成',
      label: 'Gmail +tag 邮箱',
    };
  }
  if (getSelectedEmailGenerator() === CUSTOM_EMAIL_POOL_GENERATOR) {
    return {
      buttonLabel: '取下一个',
      placeholder: '按邮箱池顺序自动回填，也可以手动粘贴当前轮邮箱',
      successVerb: '取用',
      label: '自定义邮箱池',
    };
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
  if (usesCustomMailProviderPool()) {
    return {
      buttonLabel: '自定义邮箱',
      placeholder: '号池会按顺序自动回填，也可以手动覆盖当前轮邮箱',
      successVerb: '使用',
      label: '自定义邮箱',
    };
  }
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
    ...(step === 8 ? {
      phoneActionLabel: '出现手机号验证',
      phoneActionAlert: {
        text: '如果当前页面已经进入手机号验证，可直接标记为失败并继续下一个邮箱。',
        tone: 'danger',
      },
    } : {}),
  };
}

async function openCustomVerificationConfirmDialog(step) {
  const promptCopy = getCustomVerificationPromptCopy(step);
  if (step === 8) {
    return openActionModal({
      title: promptCopy.title,
      message: promptCopy.message,
      alert: promptCopy.alert,
      actions: [
        { id: null, label: '取消', variant: 'btn-ghost' },
        { id: 'add_phone', label: promptCopy.phoneActionLabel || '出现手机号验证', variant: 'btn-outline' },
        { id: 'confirm', label: '确认跳过', variant: 'btn-danger' },
      ],
      buildResult: (choice) => ({
        confirmed: choice === 'confirm',
        addPhoneDetected: choice === 'add_phone',
      }),
    });
  }

  const confirmed = await openConfirmModal({
    title: promptCopy.title,
    message: promptCopy.message,
    confirmLabel: '确认跳过',
    confirmVariant: 'btn-danger',
    alert: promptCopy.alert,
  });
  return { confirmed, addPhoneDetected: false };
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

function getMail2925Accounts(state = latestState) {
  return Array.isArray(state?.mail2925Accounts) ? state.mail2925Accounts : [];
}

function getCurrentMail2925Account(state = latestState) {
  const currentId = state?.currentMail2925AccountId;
  return getMail2925Accounts(state).find((account) => account.id === currentId) || null;
}

function getCurrentMail2925Email(state = latestState) {
  return String(getCurrentMail2925Account(state)?.email || '').trim();
}

function syncMail2925BaseEmailFromCurrentAccount(state = latestState, options = {}) {
  const { persist = false } = options;
  if (!isMail2925AccountPoolEnabled(state)) {
    return false;
  }

  const currentEmail = getCurrentMail2925Email(state);
  if (!currentEmail || currentEmail === String(state?.mail2925BaseEmail || '').trim()) {
    return false;
  }

  syncLatestState({ mail2925BaseEmail: currentEmail });
  if (persist) {
    saveSettings({ silent: true }).catch(() => {});
  }
  return true;
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
  const baseEmail = getManagedAliasBaseEmailForProvider(normalizedProvider, state);
  return isManagedAliasEmail(inputEmailValue, baseEmail, normalizedProvider)
    || isManagedAliasEmail(stateEmailValue, baseEmail, normalizedProvider);
}

async function maybeClearGeneratedAliasAfterEmailPrefixChange() {
  const provider = selectMailProvider.value;
  if (!usesGeneratedAliasMailProvider(provider, latestState?.mail2925Mode)) {
    return;
  }

  const previousPrefix = getManagedAliasBaseEmailForProvider(provider, latestState);
  const nextPrefix = inputEmailPrefix.value.trim();
  if (previousPrefix === nextPrefix) {
    return;
  }

  if (!previousPrefix) {
    return;
  }

  if (!isCurrentEmailManagedByGeneratedAlias(provider, latestState, latestState?.mail2925Mode)) {
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

function updateMailProviderUI() {
  const use2925 = selectMailProvider.value === '2925';
  const useGmail = selectMailProvider.value === GMAIL_PROVIDER;
  const useMail2925 = selectMailProvider.value === '2925';
  const useMail2925AccountPool = useMail2925 && Boolean(inputMail2925UseAccountPool?.checked);
  const mail2925Mode = getSelectedMail2925Mode();
  const gmailAliasGenerator = typeof GMAIL_ALIAS_GENERATOR === 'string'
    ? GMAIL_ALIAS_GENERATOR
    : 'gmail-alias';
  const customEmailPoolGenerator = typeof CUSTOM_EMAIL_POOL_GENERATOR === 'string'
    ? CUSTOM_EMAIL_POOL_GENERATOR
    : 'custom-pool';
  const gmailOnlyGenerators = new Set([gmailAliasGenerator, customEmailPoolGenerator]);
  Array.from(selectEmailGenerator?.options || []).forEach((option) => {
    if (!option) return;
    if (useGmail) {
      option.hidden = !gmailOnlyGenerators.has(String(option.value || '').trim().toLowerCase());
      return;
    }
    option.hidden = String(option.value || '').trim().toLowerCase() === gmailAliasGenerator;
  });
  if (useGmail && !gmailOnlyGenerators.has(String(selectEmailGenerator.value || '').trim().toLowerCase())) {
    selectEmailGenerator.value = gmailAliasGenerator;
  }
  if (!useGmail && String(selectEmailGenerator.value || '').trim().toLowerCase() === gmailAliasGenerator) {
    selectEmailGenerator.value = 'duck';
  }
  const selectedGenerator = getSelectedEmailGenerator();
  const useGeneratedAlias = usesGeneratedAliasMailProvider(selectMailProvider.value, mail2925Mode, selectedGenerator);
  const useInbucket = selectMailProvider.value === 'inbucket';
  const useHotmail = selectMailProvider.value === 'hotmail-api';
  const useLuckmail = isLuckmailProvider();
  const useCustomEmail = isCustomMailProvider();
  const useCustomMailProviderPool = useCustomEmail && usesCustomMailProviderPool(selectMailProvider.value);
  const useIcloudProvider = isIcloudMailProvider();
  const useEmailGenerator = !useHotmail && !useLuckmail && !useCustomEmail && (!useGeneratedAlias || useGmail);
  const useCloudflareTempEmailProvider = selectMailProvider.value === 'cloudflare-temp-email';
  const aliasUiCopy = useGeneratedAlias
    ? getManagedAliasProviderUiCopy(selectMailProvider.value, mail2925Mode)
    : null;
  const uiCopy = getCurrentRegistrationEmailUiCopy();
  updateMailLoginButtonState();
  if (rowMail2925Mode) {
    rowMail2925Mode.style.display = use2925 ? '' : 'none';
  }
  if (rowMail2925PoolSettings) {
    rowMail2925PoolSettings.style.display = useMail2925 ? '' : 'none';
  }
  if (typeof rowCustomMailProviderPool !== 'undefined' && rowCustomMailProviderPool) {
    rowCustomMailProviderPool.style.display = useCustomEmail ? '' : 'none';
  }
  rowEmailPrefix.style.display = useGeneratedAlias && !useMail2925AccountPool ? '' : 'none';
  const hotmailServiceMode = getSelectedHotmailServiceMode();
  rowInbucketHost.style.display = useInbucket ? '' : 'none';
  rowInbucketMailbox.style.display = useInbucket ? '' : 'none';
  const useCustomEmailPool = useEmailGenerator && selectedGenerator === customEmailPoolGenerator;
  const useCloudflare = selectedGenerator === 'cloudflare';
  const useIcloud = selectedGenerator === 'icloud';
  const useCloudflareTempEmailGenerator = selectedGenerator === 'cloudflare-temp-email';
  const showCloudflareDomain = useEmailGenerator && useCloudflare;
  const showCloudflareTempEmailSettings = useCloudflareTempEmailProvider || (useEmailGenerator && useCloudflareTempEmailGenerator);
  const showCloudflareTempEmailReceiveMailbox = useCloudflareTempEmailProvider && !useCloudflareTempEmailGenerator;
  const showCloudflareTempEmailRandomSubdomainToggle = useEmailGenerator && useCloudflareTempEmailGenerator;
  const showCloudflareTempEmailDomain = useEmailGenerator && useCloudflareTempEmailGenerator;
  if (rowEmailGenerator) {
    rowEmailGenerator.style.display = useEmailGenerator ? '' : 'none';
  }
  if (typeof rowCustomEmailPool !== 'undefined' && rowCustomEmailPool) {
    rowCustomEmailPool.style.display = useCustomEmailPool ? '' : 'none';
  }
  if (cloudflareTempEmailSection) {
    cloudflareTempEmailSection.style.display = showCloudflareTempEmailSettings ? '' : 'none';
  }
  if (icloudSection) {
    const showIcloudSection = (useEmailGenerator && useIcloud) || useIcloudProvider;
    icloudSection.style.display = showIcloudSection ? '' : 'none';
    if (showIcloudSection) {
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
  if (rowTempEmailRandomSubdomainToggle) {
    rowTempEmailRandomSubdomainToggle.style.display = showCloudflareTempEmailRandomSubdomainToggle ? '' : 'none';
  }
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
  if (mail2925Section) {
    mail2925Section.style.display = useMail2925AccountPool ? '' : 'none';
  }
  if (luckmailSection) {
    luckmailSection.style.display = useLuckmail ? '' : 'none';
  }
  labelEmailPrefix.textContent = '邮箱前缀';
  inputEmailPrefix.placeholder = '例如 abc';
  if (labelMail2925UseAccountPool) {
    labelMail2925UseAccountPool.style.display = useMail2925 ? '' : 'none';
  }
  syncMail2925PoolAccountOptions(latestState);
  if (selectMail2925PoolAccount) {
    selectMail2925PoolAccount.style.display = useMail2925AccountPool ? '' : 'none';
    selectMail2925PoolAccount.disabled = !useMail2925AccountPool || getMail2925Accounts().length === 0;
  }
  inputEmailPrefix.style.display = '';
  inputEmailPrefix.readOnly = false;
  selectEmailGenerator.disabled = useHotmail || useLuckmail || useCustomEmail || (useGeneratedAlias && !useGmail);
  if (useGmail) {
    labelEmailPrefix.textContent = 'Gmail 原邮箱';
    inputEmailPrefix.placeholder = '例如 yourname@gmail.com';
  }
  labelEmailPrefix.textContent = aliasUiCopy?.baseLabel || labelEmailPrefix.textContent;
  inputEmailPrefix.placeholder = aliasUiCopy?.basePlaceholder || inputEmailPrefix.placeholder;
  if (rowHotmailServiceMode) {
    rowHotmailServiceMode.style.display = useHotmail ? '' : 'none';
  }
  if (rowHotmailRemoteBaseUrl) {
    rowHotmailRemoteBaseUrl.style.display = useHotmail && hotmailServiceMode === HOTMAIL_SERVICE_MODE_REMOTE ? '' : 'none';
  }
  if (rowHotmailLocalBaseUrl) {
    rowHotmailLocalBaseUrl.style.display = useHotmail && hotmailServiceMode === HOTMAIL_SERVICE_MODE_LOCAL ? '' : 'none';
  }
  btnFetchEmail.hidden = useHotmail || useLuckmail || useCustomEmail || useCustomEmailPool;
  inputEmail.readOnly = useHotmail || useLuckmail;
  inputEmail.placeholder = useHotmail
    ? '由 Hotmail 账号池自动分配'
    : (useLuckmail
      ? '步骤 3 自动购买 LuckMail 邮箱并回填'
      : (useGeneratedAlias ? '步骤 3 自动生成 2925 邮箱并回填' : uiCopy.placeholder));
  if (useGmail && useGeneratedAlias) {
    inputEmail.placeholder = '步骤 3 自动生成 Gmail +tag 邮箱并回填';
  }
  if (!useHotmail && !useLuckmail) {
    inputEmail.placeholder = uiCopy.placeholder;
  }
  if (useCustomEmail && useCustomMailProviderPool) {
    inputEmail.placeholder = '号池会按顺序自动回填当前轮邮箱，也可以手动覆盖';
  }
  btnFetchEmail.disabled = useLuckmail || useCustomEmail || useCustomEmailPool || isAutoRunLockedPhase();
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
  if (autoHintText && useCustomEmailPool) {
    autoHintText.textContent = getCustomEmailPoolSize() > 0
      ? `当前邮箱池共 ${getCustomEmailPoolSize()} 个邮箱，自动轮数会跟随数量；实际收码仍走当前邮箱服务`
      : '请先在邮箱池里每行填写一个邮箱，自动轮数会跟随数量';
  }
  if (autoHintText && useCustomEmail && useCustomMailProviderPool) {
    autoHintText.textContent = `当前自定义号池共 ${getCustomMailProviderPoolSize()} 个邮箱，自动轮数会跟随数量；第 4/8 步仍需手动输入验证码`;
  }
  if (autoHintText && useGmail && useGeneratedAlias) {
    autoHintText.textContent = '请先填写 Gmail 原邮箱，步骤 3 会自动生成 Gmail +tag 地址';
  }
  if (autoHintText && useGeneratedAlias && aliasUiCopy?.hint) {
    autoHintText.textContent = aliasUiCopy.hint;
  }
  if (autoHintText && useMail2925AccountPool && !useCustomEmailPool) {
    autoHintText.textContent = getMail2925Accounts().length
      ? (useGeneratedAlias
        ? '当前已启用 2925 号池模式，步骤 3 会基于下拉框选中的号池邮箱生成别名地址'
        : '当前已启用 2925 号池模式，步骤 4 / 8 遇到登录页时会优先使用下拉框选中的账号自动登录')
      : '当前已启用 2925 号池模式，请先在下方 2925 账号池中添加账号并选择邮箱';
  }
  if (autoHintText && showCloudflareTempEmailReceiveMailbox && !useCustomEmailPool) {
    autoHintText.textContent = '若注册邮箱会转发到 Cloudflare Temp Email，请在“邮件接收”中填写实际接收转发邮件的邮箱。';
  }
  if (autoHintText && showCloudflareTempEmailRandomSubdomainToggle && inputTempEmailUseRandomSubdomain?.checked) {
    autoHintText.textContent = '已启用随机子域名：扩展会按当前选中的 Temp 域名提交，并额外携带 enableRandomSubdomain；是否生效取决于后端 RANDOM_SUBDOMAIN_DOMAINS 配置。';
  }
  if (useHotmail) {
    inputEmail.value = getCurrentHotmailEmail();
  } else if (useLuckmail) {
    inputEmail.value = getCurrentLuckmailEmail();
  }
  if (useCustomEmailPool) {
    syncRunCountFromCustomEmailPool();
  }
  if (useCustomMailProviderPool) {
    syncRunCountFromCustomMailProviderPool();
  }
  if (typeof inputRunCount !== 'undefined' && inputRunCount) {
    inputRunCount.disabled = currentAutoRun.autoRunning || shouldLockRunCountToEmailPool();
  }
  renderHotmailAccounts();
  if (useMail2925) {
    renderMail2925Accounts();
  }
  if (useLuckmail) {
    renderLuckmailPurchases();
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
  const useCodex2Api = selectPanelMode.value === 'codex2api';
  const useCpa = !useSub2Api && !useCodex2Api;
  rowVpsUrl.style.display = useCpa ? '' : 'none';
  rowVpsPassword.style.display = useCpa ? '' : 'none';
  rowLocalCpaStep9Mode.style.display = useCpa ? '' : 'none';
  rowSub2ApiUrl.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiEmail.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiPassword.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiGroup.style.display = useSub2Api ? '' : 'none';
  rowSub2ApiDefaultProxy.style.display = useSub2Api ? '' : 'none';
  rowCodex2ApiUrl.style.display = useCodex2Api ? '' : 'none';
  rowCodex2ApiAdminKey.style.display = useCodex2Api ? '' : 'none';

  const step9Btn = document.querySelector('.step-btn[data-step-key="platform-verify"]');
  if (step9Btn) {
    step9Btn.textContent = useSub2Api
      ? 'SUB2API 回调验证'
      : (useCodex2Api ? 'Codex2API 回调验证' : 'CPA 回调验证');
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
  const completed = Object.values(getStepStatuses()).filter(isDoneStatus).length;
  stepsProgress.textContent = `${completed} / ${STEP_IDS.length}`;
}

function updateButtonStates() {
  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some(s => s === 'running');
  const autoLocked = isAutoRunLockedPhase();
  const autoScheduled = isAutoRunScheduledPhase();

  for (const step of STEP_IDS) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;

    if (anyRunning || autoLocked || autoScheduled) {
      btn.disabled = true;
    } else if (step === 1) {
      btn.disabled = false;
    } else {
    const currentIndex = STEP_IDS.indexOf(step);
    const prevStep = currentIndex > 0 ? STEP_IDS[currentIndex - 1] : null;
    const prevStatus = prevStep === null ? 'completed' : statuses[prevStep];
    const currentStatus = statuses[step];
    btn.disabled = !(isDoneStatus(prevStatus) || currentStatus === 'failed' || isDoneStatus(currentStatus) || currentStatus === 'stopped');
  }
  }

  document.querySelectorAll('.step-manual-btn').forEach((btn) => {
    const step = Number(btn.dataset.step);
    const currentStatus = statuses[step];
    const currentIndex = STEP_IDS.indexOf(step);
    const prevStep = currentIndex > 0 ? STEP_IDS[currentIndex - 1] : null;
    const prevStatus = prevStep === null ? 'completed' : statuses[prevStep];

    if (!SKIPPABLE_STEPS.has(step) || anyRunning || autoLocked || autoScheduled || currentStatus === 'running' || isDoneStatus(currentStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = '当前不可跳过';
      return;
    }

    if (prevStep !== null && !isDoneStatus(prevStatus)) {
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
  if (btnIcloudDeleteUsed) btnIcloudDeleteUsed.disabled = disableIcloudControls || !hasDeletableUsedIcloudAliases();
  if (selectIcloudHostPreference) selectIcloudHostPreference.disabled = disableIcloudControls;
  if (selectIcloudFetchMode) {
    const allowIcloudFetchMode = getSelectedEmailGenerator() === ICLOUD_PROVIDER
      && !isCustomMailProvider()
      && !isManagedAliasProvider();
    selectIcloudFetchMode.disabled = disableIcloudControls || !allowIcloudFetchMode;
  }
  if (checkboxAutoDeleteIcloud) checkboxAutoDeleteIcloud.disabled = disableIcloudControls;
  if (btnContributionMode) btnContributionMode.disabled = isContributionButtonLocked();
  updateStopButtonState(anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked);
  renderContributionMode();
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

  if (lastCompleted === STEP_IDS[STEP_IDS.length - 1]) {
    displayStatus.textContent = (state.stepStatuses[lastCompleted] === 'manual_completed' || state.stepStatuses[lastCompleted] === 'skipped') ? '全部步骤已跳过/完成' : '全部步骤已完成';
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
  const uiCopy = getCurrentRegistrationEmailUiCopy();
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
        mailProvider: selectMailProvider.value,
        mail2925Mode: getSelectedMail2925Mode(),
        ...(getSelectedEmailGenerator() === CUSTOM_EMAIL_POOL_GENERATOR
          ? {
              customEmailPool: normalizeCustomEmailPoolEntries(inputCustomEmailPool?.value),
            }
          : {}),
        ...buildManagedAliasBaseEmailPayload(),
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

const hotmailManager = window.SidepanelHotmailManager?.createHotmailManager({
  state: {
    getLatestState: () => latestState,
    syncLatestState,
  },
  dom: {
    btnAddHotmailAccount,
    btnClearUsedHotmailAccounts,
    btnDeleteAllHotmailAccounts,
    btnHotmailUsageGuide,
    btnImportHotmailAccounts,
    btnToggleHotmailForm,
    btnToggleHotmailList,
    hotmailFormShell,
    hotmailAccountsList,
    hotmailListShell,
    inputEmail,
    inputHotmailClientId,
    inputHotmailEmail,
    inputHotmailImport,
    inputHotmailPassword,
    inputHotmailRefreshToken,
    selectMailProvider,
  },
  helpers: {
    copyTextToClipboard,
    escapeHtml,
    getCurrentHotmailEmail,
    getHotmailAccounts,
    openConfirmModal,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  constants: {
    copyIcon: COPY_ICON,
    displayTimeZone: DISPLAY_TIMEZONE,
    expandedStorageKey: 'multipage-hotmail-list-expanded',
  },
  hotmailUtils: {
    filterHotmailAccountsByUsage,
    getHotmailBulkActionLabel,
    getHotmailListToggleLabel,
    parseHotmailImportText,
    shouldClearHotmailCurrentSelection,
    upsertHotmailAccountInList,
  },
});
const initHotmailListExpandedState = hotmailManager?.initHotmailListExpandedState
  || (() => { });
const renderHotmailAccounts = hotmailManager?.renderHotmailAccounts
  || (() => { });
const bindHotmailEvents = hotmailManager?.bindHotmailEvents
  || (() => { });
bindHotmailEvents();

const mail2925Manager = window.SidepanelMail2925Manager?.createMail2925Manager({
  state: {
    getLatestState: () => latestState,
    syncLatestState,
  },
  dom: {
    btnAddMail2925Account,
    btnDeleteAllMail2925Accounts,
    btnImportMail2925Accounts,
    btnToggleMail2925Form,
    btnToggleMail2925List,
    inputMail2925Email,
    inputMail2925Import,
    inputMail2925Password,
    mail2925AccountsList,
    mail2925FormShell,
    mail2925ListShell,
  },
  helpers: {
    copyTextToClipboard,
    escapeHtml,
    getMail2925Accounts,
    openConfirmModal,
    refreshManagedAliasBaseEmail: () => {
      syncMail2925BaseEmailFromCurrentAccount(latestState, { persist: true });
      setManagedAliasBaseEmailInputForProvider('2925', latestState);
    },
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  constants: {
    copyIcon: COPY_ICON,
    displayTimeZone: DISPLAY_TIMEZONE,
    expandedStorageKey: 'multipage-mail2925-list-expanded',
  },
  mail2925Utils: window.Mail2925Utils || {},
});
const initMail2925ListExpandedState = mail2925Manager?.initMail2925ListExpandedState
  || (() => { });
const renderMail2925Accounts = mail2925Manager?.renderMail2925Accounts
  || (() => { });
const bindMail2925Events = mail2925Manager?.bindMail2925Events
  || (() => { });
bindMail2925Events();

const icloudManager = window.SidepanelIcloudManager?.createIcloudManager({
  dom: {
    btnIcloudBulkDelete,
    btnIcloudBulkPreserve,
    btnIcloudBulkUnpreserve,
    btnIcloudBulkUnused,
    btnIcloudBulkUsed,
    btnIcloudDeleteUsed,
    btnIcloudLoginDone,
    btnIcloudRefresh,
    checkboxIcloudSelectAll,
    icloudList,
    icloudLoginHelp,
    icloudLoginHelpText,
    icloudLoginHelpTitle,
    icloudSection,
    icloudSelectionSummary,
    icloudSummary,
    inputIcloudSearch,
    selectIcloudFilter,
  },
  helpers: {
    copyTextToClipboard,
    escapeHtml,
    openConfirmModal,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
});
const hideIcloudLoginHelp = icloudManager?.hideIcloudLoginHelp
  || (() => { });
const hasDeletableUsedIcloudAliases = icloudManager?.hasDeletableUsedAliases
  || (() => false);
const queueIcloudAliasRefresh = icloudManager?.queueIcloudAliasRefresh
  || (() => { });
const refreshIcloudAliases = icloudManager?.refreshIcloudAliases
  || (async () => { });
const renderIcloudAliases = icloudManager?.renderIcloudAliases
  || (() => { });
const resetIcloudManager = icloudManager?.reset
  || (() => { });
const showIcloudLoginHelp = icloudManager?.showIcloudLoginHelp
  || (() => { });
const updateIcloudBulkUI = icloudManager?.updateIcloudBulkUI
  || (() => { });
const bindIcloudEvents = icloudManager?.bindIcloudEvents
  || (() => { });
bindIcloudEvents();

const luckmailManager = window.SidepanelLuckmailManager?.createLuckmailManager({
  dom: {
    btnLuckmailBulkDisable,
    btnLuckmailBulkEnable,
    btnLuckmailBulkPreserve,
    btnLuckmailBulkUnpreserve,
    btnLuckmailBulkUnused,
    btnLuckmailBulkUsed,
    btnLuckmailDisableUsed,
    btnLuckmailRefresh,
    checkboxLuckmailSelectAll,
    inputEmail,
    inputLuckmailSearch,
    luckmailList,
    luckmailSection,
    luckmailSelectionSummary,
    luckmailSummary,
    selectLuckmailFilter,
  },
  helpers: {
    copyTextToClipboard,
    escapeHtml,
    formatLuckmailDateTime,
    getLuckmailPreserveTagName,
    normalizeLuckmailProjectName,
    openConfirmModal,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  constants: {
    copyIcon: COPY_ICON,
  },
});
const queueLuckmailPurchaseRefresh = luckmailManager?.queueLuckmailPurchaseRefresh
  || (() => { });
const refreshLuckmailPurchases = luckmailManager?.refreshLuckmailPurchases
  || (async () => { });
const renderLuckmailPurchases = luckmailManager?.renderLuckmailPurchases
  || (() => { });
const resetLuckmailManager = luckmailManager?.reset
  || (() => { });
const bindLuckmailEvents = luckmailManager?.bindLuckmailEvents
  || (() => { });
bindLuckmailEvents();

const accountRecordsManager = window.SidepanelAccountRecordsManager?.createAccountRecordsManager({
  state: {
    getLatestState: () => latestState,
    syncLatestState,
  },
  dom: {
    accountRecordsList,
    accountRecordsMeta,
    accountRecordsOverlay,
    accountRecordsPageLabel,
    accountRecordsStats,
    btnAccountRecordsNext,
    btnAccountRecordsPrev,
    btnClearAccountRecords,
    btnDeleteSelectedAccountRecords,
    btnCloseAccountRecords,
    btnOpenAccountRecords,
    btnToggleAccountRecordsSelection,
  },
  helpers: {
    escapeHtml,
    openConfirmModal,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  constants: {
    displayTimeZone: DISPLAY_TIMEZONE,
    pageSize: 10,
  },
});
const renderAccountRecords = accountRecordsManager?.render
  || (() => { });
const bindAccountRecordEvents = accountRecordsManager?.bindEvents
  || (() => { });
const closeAccountRecordsPanel = accountRecordsManager?.closePanel
  || (() => { });
bindAccountRecordEvents();
const contributionModeManager = window.SidepanelContributionMode?.createContributionModeManager({
  state: {
    getLatestState: () => latestState,
  },
  dom: {
    btnConfigMenu,
    btnContributionMode,
    inputContributionNickname,
    inputContributionQq,
    contributionCallbackStatus,
    btnExitContributionMode,
    btnOpenAccountRecords,
    btnOpenContributionUpload,
    btnStartContribution,
    contributionModePanel,
    contributionModeSummary,
    contributionModeText,
    contributionOauthStatus,
    rowAccountRunHistoryHelperBaseUrl,
    rowAccountRunHistoryTextEnabled,
    rowCustomPassword,
    rowLocalCpaStep9Mode,
    rowSub2ApiDefaultProxy,
    rowSub2ApiEmail,
    rowSub2ApiGroup,
    rowSub2ApiPassword,
    rowSub2ApiUrl,
    rowVpsPassword,
    rowVpsUrl,
    selectPanelMode,
  },
  helpers: {
    applySettingsState,
    closeAccountRecordsPanel,
    closeConfigMenu,
    getContributionNickname: () => latestState?.email || '',
    getContributionProfile: () => ({
      nickname: String(inputContributionNickname?.value || '').trim(),
      qq: String(inputContributionQq?.value || '').trim(),
    }),
    isModeSwitchBlocked: isContributionModeSwitchBlocked,
    openConfirmModal,
    openExternalUrl,
    showToast,
    startContributionAutoRun: () => startAutoRunFromCurrentSettings(),
    updateAccountRunHistorySettingsUI,
    updateConfigMenuControls,
    updatePanelModeUI,
    updateStatusDisplay,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  constants: {
    contributionOauthUrl: `${String(contributionContentService?.portalUrl || 'https://apikey.qzz.io').replace(/\/+$/, '')}/oauth/`,
    contributionPortalUrl: String(contributionContentService?.portalUrl || 'https://apikey.qzz.io').replace(/\/+$/, ''),
    contributionUploadUrl: `${String(contributionContentService?.portalUrl || 'https://apikey.qzz.io').replace(/\/+$/, '')}/upload`,
  },
});
const baseRenderContributionMode = contributionModeManager?.render
  || (() => { });
const renderContributionMode = () => {
  baseRenderContributionMode();
  renderContributionUpdateHint();
};
const bindContributionModeEvents = contributionModeManager?.bindEvents
  || (() => { });
bindContributionModeEvents();
renderStepsList();

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

stepsList?.addEventListener('click', async (event) => {
  const btn = event.target.closest('.step-btn');
  if (!btn) {
    return;
  }
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
      } else if (false && usesGeneratedAliasMailProvider(selectMailProvider.value)) {
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
        if (!validateCurrentRegistrationEmail(email, { showToastOnFailure: true })) {
          return;
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

btnFetchEmail.addEventListener('click', async () => {
  if (selectMailProvider.value === 'hotmail-api' || isLuckmailProvider() || isCustomMailProvider()) {
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

btnRepoHome?.addEventListener('click', () => {
  openRepositoryHomePage();
});

btnCloudflareTempEmailUsageGuide?.addEventListener('click', () => {
  openCloudflareTempEmailUsageGuidePage();
});

btnCloudflareTempEmailGithub?.addEventListener('click', () => {
  openCloudflareTempEmailRepositoryPage();
});

extensionUpdateStatus?.addEventListener('click', () => {
  openReleaseListPage();
});

btnDismissContributionUpdateHint?.addEventListener('click', (event) => {
  event.stopPropagation();
  dismissContributionUpdateHint();
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

async function startAutoRunFromCurrentSettings() {
  let contributionSnapshot = null;
  try {
    contributionSnapshot = await refreshContributionContentHint();
  } catch (error) {
    console.warn('Failed to refresh contribution content hint before auto run:', error);
  }

  const confirmedContributionUpdate = await maybeConfirmContributionUpdateBeforeAutoRun(contributionSnapshot);
  if (!confirmedContributionUpdate) {
    return false;
  }

  if (typeof settingsDirty !== 'undefined' && settingsDirty && typeof saveSettings === 'function') {
    await saveSettings({ silent: true });
  }

  const customEmailPoolEnabled = typeof usesCustomEmailPoolGenerator === 'function'
    && usesCustomEmailPoolGenerator();
  const lockedRunCount = typeof getLockedRunCountFromEmailPool === 'function'
    ? getLockedRunCountFromEmailPool()
    : 0;
  if (customEmailPoolEnabled && lockedRunCount <= 0) {
    throw new Error('请先在邮箱池里至少填写 1 个邮箱。');
  }
  const totalRuns = lockedRunCount > 0 ? lockedRunCount : getRunCountValue();
  if (lockedRunCount > 0) {
    inputRunCount.value = String(lockedRunCount);
  }
  let mode = 'restart';
  const autoRunSkipFailures = inputAutoSkipFailures.checked;
  const contributionNickname = String(inputContributionNickname?.value || '').trim();
  const contributionQq = String(inputContributionQq?.value || '').trim();
  const fallbackThreadIntervalMinutes = normalizeAutoRunThreadIntervalMinutes(
    inputAutoSkipFailuresThreadIntervalMinutes.value
  );
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(fallbackThreadIntervalMinutes);

  if (shouldOfferAutoModeChoice()) {
    const startStep = getFirstUnfinishedStep();
    const runningStep = getRunningSteps()[0] ?? null;
    const choice = await openAutoStartChoiceDialog(startStep, { runningStep });
    if (!choice) {
      return false;
    }
    mode = choice;
  }

  if (shouldWarnAutoRunFallbackRisk(totalRuns, autoRunSkipFailures)
    && !isAutoRunFallbackRiskPromptDismissed()) {
    const result = await openAutoRunFallbackRiskConfirmModal(totalRuns);
    if (!result.confirmed) {
      return false;
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
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 璁″垝涓?..'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 杩愯涓?..';
  const response = await chrome.runtime.sendMessage({
    type: delayEnabled ? 'SCHEDULE_AUTO_RUN' : 'AUTO_RUN',
    source: 'sidepanel',
    payload: {
      totalRuns,
      delayMinutes,
      autoRunSkipFailures,
      contributionMode: Boolean(latestState?.contributionMode),
      contributionNickname,
      contributionQq,
      mode,
    },
  });
  if (response?.error) {
    throw new Error(response.error);
  }
  return true;
}

// Auto Run
btnAutoRun.addEventListener('click', async () => {
  try {
    await startAutoRunFromCurrentSettings();
  } catch (err) {
    setDefaultAutoRunButton();
    inputRunCount.disabled = shouldLockRunCountToEmailPool();
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
  resetIcloudManager();
  document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
  document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
  setDefaultAutoRunButton();
  applyAutoRunStatus(currentAutoRun);
  markSettingsDirty(false);
  updateStopButtonState(false);
  updateButtonStates();
  updateProgressCounter();
  renderHotmailAccounts();
  resetLuckmailManager();
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
      if (!validateCurrentRegistrationEmail(email, { showToastOnFailure: true })) {
        return;
      }
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
  syncManagedAliasBaseEmailDraftFromInput(previousProvider);
  setManagedAliasBaseEmailInputForProvider(nextProvider, latestState);
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
  if (nextProvider === '2925' && Boolean(inputMail2925UseAccountPool?.checked)) {
    syncMail2925PoolAccountOptions(latestState);
    if (!selectMail2925PoolAccount.value && getMail2925Accounts().length > 0) {
      selectMail2925PoolAccount.value = String(getMail2925Accounts()[0]?.id || '');
    }
    await syncSelectedMail2925PoolAccount({ silent: true }).catch(() => { });
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

selectIcloudFetchMode?.addEventListener('change', () => {
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
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

inputSub2ApiDefaultProxy.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputSub2ApiDefaultProxy.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputCodex2ApiUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputCodex2ApiUrl.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputCodex2ApiAdminKey.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputCodex2ApiAdminKey.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputEmailPrefix.addEventListener('input', () => {
  maybeClearGeneratedAliasAfterEmailPrefixChange().catch(() => { });
  syncManagedAliasBaseEmailDraftFromInput();
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputEmailPrefix.addEventListener('blur', () => {
  maybeClearGeneratedAliasAfterEmailPrefixChange().catch(() => {});
  syncManagedAliasBaseEmailDraftFromInput();
  saveSettings({ silent: true }).catch(() => {});
});

inputCustomEmailPool?.addEventListener('input', () => {
  syncRunCountFromConfiguredEmailPool();
  updateMailProviderUI();
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputCustomEmailPool?.addEventListener('blur', () => {
  inputCustomEmailPool.value = normalizeCustomEmailPoolEntries(inputCustomEmailPool.value).join('\n');
  syncRunCountFromConfiguredEmailPool();
  updateMailProviderUI();
  saveSettings({ silent: true }).catch(() => {});
});

inputCustomMailProviderPool?.addEventListener('input', () => {
  syncRunCountFromConfiguredEmailPool();
  updateMailProviderUI();
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputCustomMailProviderPool?.addEventListener('blur', () => {
  inputCustomMailProviderPool.value = normalizeCustomEmailPoolEntries(inputCustomMailProviderPool.value).join('\n');
  syncRunCountFromConfiguredEmailPool();
  updateMailProviderUI();
  saveSettings({ silent: true }).catch(() => {});
});

selectMail2925PoolAccount?.addEventListener('change', async () => {
  try {
    await syncSelectedMail2925PoolAccount();
    markSettingsDirty(true);
    saveSettings({ silent: true }).catch(() => {});
  } catch (err) {
    showToast(err.message, 'error');
  }
});

inputMail2925UseAccountPool?.addEventListener('change', async () => {
  const enabled = Boolean(inputMail2925UseAccountPool.checked);
  syncLatestState({ mail2925UseAccountPool: enabled });
  if (enabled) {
    syncMail2925PoolAccountOptions(latestState);
    if (!selectMail2925PoolAccount.value && getMail2925Accounts().length > 0) {
      selectMail2925PoolAccount.value = String(getMail2925Accounts()[0]?.id || '');
    }
    try {
      await syncSelectedMail2925PoolAccount({ silent: true });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  setManagedAliasBaseEmailInputForProvider('2925', latestState);
  updateMailProviderUI();
  markSettingsDirty(true);
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
  if (shouldLockRunCountToEmailPool()) {
    syncRunCountFromConfiguredEmailPool();
    updateFallbackThreadIntervalInputState();
    return;
  }
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

inputTempEmailUseRandomSubdomain?.addEventListener('change', () => {
  updateMailProviderUI();
  clearRegistrationEmail({ silent: true }).catch(() => { });
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

inputAccountRunHistoryTextEnabled?.addEventListener('change', () => {
  updateAccountRunHistorySettingsUI();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputAccountRunHistoryHelperBaseUrl?.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});

inputAccountRunHistoryHelperBaseUrl?.addEventListener('blur', () => {
  inputAccountRunHistoryHelperBaseUrl.value = normalizeAccountRunHistoryHelperBaseUrlValue(inputAccountRunHistoryHelperBaseUrl.value);
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

inputVerificationResendCount?.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVerificationResendCount?.addEventListener('blur', () => {
  inputVerificationResendCount.value = String(
    normalizeVerificationResendCount(
      inputVerificationResendCount.value,
      DEFAULT_VERIFICATION_RESEND_COUNT
    )
  );
  saveSettings({ silent: true }).catch(() => { });
});

inputHeroSmsApiKey?.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputHeroSmsApiKey?.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

selectHeroSmsCountry?.addEventListener('change', () => {
  updateHeroSmsPlatformDisplay(getSelectedHeroSmsCountryOption().label);
  markSettingsDirty(true);
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
        const result = await openCustomVerificationConfirmDialog(step);
        sendResponse(result || { confirmed: false, addPhoneDetected: false });
      })().catch((err) => {
        sendResponse({ error: err.message });
      });
      return true;
    }

    case 'SECURITY_BLOCKED_ALERT': {
      openConfirmModal({
        title: message.payload?.title || '流程已完全停止',
        message: message.payload?.message || '检测到安全风控，当前流程已完全停止。',
        alert: message.payload?.alert || { text: '检测到 Cloudflare 风控，请暂停当前操作。', tone: 'danger' },
        confirmLabel: '我知道了',
        confirmVariant: 'btn-danger',
      }).catch(() => {});
      break;
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
      resetIcloudManager();
      resetLuckmailManager();
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
      renderMail2925Accounts();
      if (isLuckmailProvider()) {
        queueLuckmailPurchaseRefresh();
      }
      break;
    }

    case 'DATA_UPDATED': {
      syncLatestState(message.payload);
      if (message.payload.email !== undefined) {
        inputEmail.value = message.payload.email || '';
      }
      if (
        message.payload.password !== undefined
        || message.payload.customPassword !== undefined
        || message.payload.contributionMode !== undefined
      ) {
        syncPasswordField(latestState || {});
      }
      if (message.payload.localCpaStep9Mode !== undefined) {
        setLocalCpaStep9Mode(message.payload.localCpaStep9Mode);
      }
      if (message.payload.panelMode !== undefined) {
        selectPanelMode.value = message.payload.panelMode || 'cpa';
        updatePanelModeUI();
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
      if (message.payload.cloudflareTempEmailUseRandomSubdomain !== undefined && inputTempEmailUseRandomSubdomain) {
        inputTempEmailUseRandomSubdomain.checked = Boolean(message.payload.cloudflareTempEmailUseRandomSubdomain);
      }
      if (message.payload.cloudflareTempEmailDomain !== undefined || message.payload.cloudflareTempEmailDomains !== undefined) {
        renderCloudflareTempEmailDomainOptions(message.payload.cloudflareTempEmailDomain || latestState?.cloudflareTempEmailDomain || '');
      }
      if (
        message.payload.cloudflareTempEmailUseRandomSubdomain !== undefined
        || message.payload.cloudflareTempEmailDomain !== undefined
        || message.payload.cloudflareTempEmailDomains !== undefined
      ) {
        updateMailProviderUI();
      }
      if (message.payload.currentHotmailAccountId !== undefined || message.payload.hotmailAccounts !== undefined) {
        renderHotmailAccounts();
        if (selectMailProvider.value === 'hotmail-api') {
          inputEmail.value = getCurrentHotmailEmail();
        }
      }
      if (message.payload.currentMail2925AccountId !== undefined || message.payload.mail2925Accounts !== undefined) {
        renderMail2925Accounts();
        if (selectMailProvider.value === '2925') {
          setManagedAliasBaseEmailInputForProvider('2925', latestState);
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
      if (message.payload.accountRunHistoryTextEnabled !== undefined && inputAccountRunHistoryTextEnabled) {
        inputAccountRunHistoryTextEnabled.checked = Boolean(message.payload.accountRunHistoryTextEnabled);
        updateAccountRunHistorySettingsUI();
      }
      if (message.payload.accountRunHistoryHelperBaseUrl !== undefined && inputAccountRunHistoryHelperBaseUrl) {
        inputAccountRunHistoryHelperBaseUrl.value = normalizeAccountRunHistoryHelperBaseUrlValue(message.payload.accountRunHistoryHelperBaseUrl);
      }
      if (message.payload.icloudHostPreference !== undefined && selectIcloudHostPreference) {
        const hostPreference = String(message.payload.icloudHostPreference || '').trim().toLowerCase();
        selectIcloudHostPreference.value = hostPreference === 'icloud.com'
          ? 'icloud.com'
          : (hostPreference === 'icloud.com.cn' ? 'icloud.com.cn' : 'auto');
      }
      if (message.payload.icloudFetchMode !== undefined && selectIcloudFetchMode) {
        selectIcloudFetchMode.value = normalizeIcloudFetchMode(message.payload.icloudFetchMode);
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
      if (
        (
          message.payload.verificationResendCount !== undefined
          || message.payload.signupVerificationResendCount !== undefined
          || message.payload.loginVerificationResendCount !== undefined
        )
        && inputVerificationResendCount
      ) {
        const nextVerificationResendCount = message.payload.verificationResendCount !== undefined
          ? message.payload.verificationResendCount
          : (message.payload.signupVerificationResendCount ?? message.payload.loginVerificationResendCount);
        inputVerificationResendCount.value = String(
          normalizeVerificationResendCount(
            nextVerificationResendCount,
            DEFAULT_VERIFICATION_RESEND_COUNT
          )
        );
      }
      if (message.payload.heroSmsApiKey !== undefined && inputHeroSmsApiKey) {
        inputHeroSmsApiKey.value = message.payload.heroSmsApiKey || '';
      }
      if (
        (message.payload.heroSmsCountryId !== undefined || message.payload.heroSmsCountryLabel !== undefined)
        && selectHeroSmsCountry
      ) {
        const nextCountryId = String(
          normalizeHeroSmsCountryId(
            message.payload.heroSmsCountryId !== undefined
              ? message.payload.heroSmsCountryId
              : selectHeroSmsCountry.value
          )
        );
        if (Array.from(selectHeroSmsCountry.options).some((option) => option.value === nextCountryId)) {
          selectHeroSmsCountry.value = nextCountryId;
        }
        updateHeroSmsPlatformDisplay(message.payload.heroSmsCountryLabel || getSelectedHeroSmsCountryOption().label);
      }
      renderContributionMode();
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

window.addEventListener('resize', () => {
  positionContributionUpdateHint();
});

document.addEventListener('scroll', () => {
  positionContributionUpdateHint();
}, true);

// ============================================================
// Init
// ============================================================

initializeManualStepActions();
initTheme();
initHotmailListExpandedState();
initMail2925ListExpandedState();
updateSaveButtonState();
updateConfigMenuControls();
setLocalCpaStep9Mode(DEFAULT_LOCAL_CPA_STEP9_MODE);
setMail2925Mode(DEFAULT_MAIL_2925_MODE);
initializeReleaseInfo().catch((err) => {
  console.error('Failed to initialize release info:', err);
});
loadHeroSmsCountries().catch((err) => {
  console.error('Failed to load HeroSMS countries:', err);
}).finally(() => {
  return restoreState().then(() => {
    syncPasswordToggleLabel();
    syncVpsUrlToggleLabel();
    syncVpsPasswordToggleLabel();
    updatePanelModeUI();
    updateButtonStates();
    updateStatusDisplay(latestState);
    return refreshContributionContentHint()
      .catch((error) => {
        console.warn('Failed to refresh contribution content hint during initialization:', error);
        return null;
      })
      .then(() => maybeShowNewUserGuidePrompt());
  }).catch((err) => {
    console.error('Failed to initialize sidepanel state:', err);
  });
});
