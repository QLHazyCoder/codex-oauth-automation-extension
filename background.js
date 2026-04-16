// background.js — Service Worker: orchestration, state, tab management, message routing

importScripts(
  'data/names.js',
  'hotmail-utils.js',
  'microsoft-email.js',
  'luckmail-utils.js',
  'cloudflare-temp-email-utils.js',
  'icloud-utils.js',
  'content/activation-utils.js'
);

const {
  extractVerificationCodeFromMessage,
  filterHotmailAccountsByUsage,
  getLatestHotmailMessage,
  getHotmailMailApiRequestConfig,
  getHotmailVerificationPollConfig,
  getHotmailVerificationRequestTimestamp,
  normalizeHotmailServiceMode,
  normalizeHotmailMailApiMessages,
  pickHotmailAccountForRun,
  pickVerificationMessage,
  pickVerificationMessageWithFallback,
  pickVerificationMessageWithTimeFallback,
  shouldClearHotmailCurrentSelection,
} = self.HotmailUtils;
const {
  fetchMicrosoftMailboxMessages,
} = self.MultiPageMicrosoftEmail;
const {
  DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  DEFAULT_LUCKMAIL_BASE_URL,
  DEFAULT_LUCKMAIL_EMAIL_TYPE,
  buildLuckmailBaselineCursor,
  buildLuckmailMailCursor,
  filterReusableLuckmailPurchases,
  isLuckmailMailNewerThanCursor,
  isLuckmailPurchaseReusable,
  isLuckmailPurchaseForProject,
  isLuckmailPurchasePreserved,
  normalizeLuckmailBaseUrl,
  normalizeLuckmailEmailType,
  normalizeLuckmailMailCursor,
  normalizeLuckmailProjectName,
  normalizeLuckmailPurchase,
  normalizeLuckmailPurchaseId,
  normalizeLuckmailPurchaseListPage,
  normalizeLuckmailPurchases,
  normalizeLuckmailTags,
  normalizeLuckmailTokenCode,
  normalizeLuckmailTokenMail,
  normalizeLuckmailTokenMails,
  normalizeLuckmailUsedPurchases,
  normalizeTimestamp: normalizeLuckmailTimestamp,
  pickLuckmailVerificationMail,
} = self.LuckMailUtils;
const {
  DEFAULT_MAIL_PAGE_SIZE: CLOUDFLARE_TEMP_EMAIL_DEFAULT_PAGE_SIZE,
  buildCloudflareTempEmailHeaders,
  getCloudflareTempEmailAddressFromResponse,
  joinCloudflareTempEmailUrl,
  normalizeCloudflareTempEmailAddress,
  normalizeCloudflareTempEmailBaseUrl,
  normalizeCloudflareTempEmailDomain,
  normalizeCloudflareTempEmailDomains,
  normalizeCloudflareTempEmailMailApiMessages,
} = self.CloudflareTempEmailUtils;
const {
  findIcloudAliasByEmail,
  getConfiguredIcloudHostPreference,
  getIcloudHostHintFromMessage,
  getIcloudLoginUrlForHost,
  getIcloudMailUrlForHost,
  getIcloudSetupUrlForHost,
  normalizeBooleanMap,
  normalizeIcloudAliasList,
  normalizeIcloudHost,
  pickReusableIcloudAlias,
  toNormalizedEmailSet,
} = self.IcloudUtils;
const {
  isRecoverableStep9AuthFailure,
} = self.MultiPageActivationUtils;

const LOG_PREFIX = '[MultiPage:bg]';
const DUCK_AUTOFILL_URL = 'https://duckduckgo.com/email/settings/autofill';
const ICLOUD_SETUP_URLS = [
  'https://setup.icloud.com.cn/setup/ws/1',
  'https://setup.icloud.com/setup/ws/1',
];
const ICLOUD_LOGIN_URLS = [
  'https://www.icloud.com.cn/',
  'https://www.icloud.com/',
];
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const HOTMAIL_PROVIDER = 'hotmail-api';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const CLOUDFLARE_TEMP_EMAIL_PROVIDER = 'cloudflare-temp-email';
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
const HOTMAIL_MAILBOXES = ['INBOX', 'Junk'];
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const HUMAN_STEP_DELAY_MIN = 700;
const HUMAN_STEP_DELAY_MAX = 2200;
const STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS = 8;
const SUB2API_STEP1_RESPONSE_TIMEOUT_MS = 90000;
const SUB2API_STEP9_RESPONSE_TIMEOUT_MS = 120000;
const DEFAULT_SUB2API_URL = 'https://sub2api.hisence.fun/admin/accounts';
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const AUTO_RUN_TIMER_ALARM_NAME = 'auto-run-timer';
const AUTO_RUN_TIMER_KIND_SCHEDULED_START = 'scheduled_start';
const AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS = 'between_rounds';
const AUTO_RUN_TIMER_KIND_BEFORE_RETRY = 'before_retry';
const AUTO_RUN_DELAY_MIN_MINUTES = 1;
const AUTO_RUN_DELAY_MAX_MINUTES = 1440;
const AUTO_RUN_RETRY_DELAY_MS = 3000;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS = 600;
const LEGACY_AUTO_STEP_DELAY_KEYS = ['autoStepRandomDelayMinSeconds', 'autoStepRandomDelayMaxSeconds'];
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const DEFAULT_CPA_CALLBACK_MODE = 'step8';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const DEFAULT_HOTMAIL_REMOTE_BASE_URL = '';
const DEFAULT_HOTMAIL_LOCAL_BASE_URL = 'http://127.0.0.1:17373';
const HOTMAIL_LOCAL_HELPER_TIMEOUT_MS = 45000;
const DEFAULT_LUCKMAIL_PROJECT_CODE = 'openai';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const MICROSOFT_TOKEN_DNR_RULE_ID = 1001;
const PERSISTENT_ALIAS_STATE_KEYS = ['manualAliasUsage', 'preservedAliases'];

initializeSessionStorageAccess();
setupDeclarativeNetRequestRules();

function setupDeclarativeNetRequestRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [MICROSOFT_TOKEN_DNR_RULE_ID],
    addRules: [{
      id: MICROSOFT_TOKEN_DNR_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'remove' },
        ],
      },
      condition: {
        urlFilter: 'login.microsoftonline.com/*/oauth2/v2.0/token',
        resourceTypes: ['xmlhttprequest'],
      },
    }],
  }).catch((error) => {
    console.warn(LOG_PREFIX, 'Failed to setup declarativeNetRequest rules:', error?.message || error);
  });
}

// ============================================================
// 状态管理（chrome.storage.session + chrome.storage.local）
// ============================================================

const PERSISTED_SETTING_DEFAULTS = {
  panelMode: 'cpa',
  vpsUrl: '',
  vpsPassword: '',
  localCpaStep9Mode: DEFAULT_LOCAL_CPA_STEP9_MODE,
  cpaCallbackMode: DEFAULT_CPA_CALLBACK_MODE,
  sub2apiUrl: DEFAULT_SUB2API_URL,
  sub2apiEmail: '',
  sub2apiPassword: '',
  sub2apiGroupName: DEFAULT_SUB2API_GROUP_NAME,
  customPassword: '',
  autoRunSkipFailures: false,
  autoRunFallbackThreadIntervalMinutes: 0,
  autoRunDelayEnabled: false,
  autoRunDelayMinutes: 30,
  autoStepDelaySeconds: null,
  mailProvider: '163',
  mail2925Mode: DEFAULT_MAIL_2925_MODE,
  emailGenerator: 'duck',
  autoDeleteUsedIcloudAlias: false,
  icloudHostPreference: 'auto',
  emailPrefix: '',
  inbucketHost: '',
  inbucketMailbox: '',
  hotmailServiceMode: HOTMAIL_SERVICE_MODE_LOCAL,
  hotmailRemoteBaseUrl: DEFAULT_HOTMAIL_REMOTE_BASE_URL,
  hotmailLocalBaseUrl: DEFAULT_HOTMAIL_LOCAL_BASE_URL,
  cloudflareDomain: '',
  cloudflareDomains: [],
  cloudflareTempEmailBaseUrl: '',
  cloudflareTempEmailAdminAuth: '',
  cloudflareTempEmailCustomAuth: '',
  cloudflareTempEmailReceiveMailbox: '',
  cloudflareTempEmailDomain: '',
  cloudflareTempEmailDomains: [],
  hotmailAccounts: [],
};

const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const SETTINGS_EXPORT_SCHEMA_VERSION = 1;
const SETTINGS_EXPORT_FILENAME_PREFIX = 'multipage-settings';
const STEP6_PRE_LOGIN_COOKIE_CLEAR_DELAY_MS = 10000;
const PRE_LOGIN_COOKIE_CLEAR_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'auth.openai.com',
  'auth0.openai.com',
  'accounts.openai.com',
];
const PRE_LOGIN_COOKIE_CLEAR_ORIGINS = [
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://auth.openai.com',
  'https://auth0.openai.com',
  'https://accounts.openai.com',
  'https://openai.com',
];

const DEFAULT_STATE = {
  currentStep: 0, // 当前流程执行到的步骤编号。
  stepStatuses: {
    1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending', // 运行时步骤状态映射，不要手动预填。
    6: 'pending', 7: 'pending', 8: 'pending', 9: 'pending',
  },
  oauthUrl: null, // 运行时抓取到的 OAuth 地址，不要手动预填。
  email: null, // 运行时邮箱，由程序自动获取并写入，不能手动预填。
  password: null, // 运行时实际密码，由 customPassword 或程序自动生成后写入。
  accounts: [], // 已生成账号记录：{ email, password, createdAt }。
  manualAliasUsage: {},
  preservedAliases: {},
  lastEmailTimestamp: null, // 最近一次获取到邮箱数据的运行时时间戳。
  lastSignupCode: null, // 注册验证码，运行时由程序自动读取并写入。
  lastLoginCode: null, // 登录验证码，运行时由程序自动读取并写入。
  localhostUrl: null, // 运行时捕获到的 localhost 回调地址，不要手动预填。
  sub2apiSessionId: null, // SUB2API OpenAI Auth 会话 ID。
  sub2apiOAuthState: null, // SUB2API OpenAI Auth state。
  sub2apiGroupId: null, // SUB2API 目标分组 ID。
  sub2apiDraftName: null, // SUB2API 本轮预生成的账号名称。
  flowStartTime: null, // 当前流程开始时间。
  tabRegistry: {}, // 程序维护的标签页注册表。
  sourceLastUrls: {}, // 各来源页面最近一次打开的地址记录。
  logs: [], // 侧边栏展示的运行日志。
  ...PERSISTED_SETTING_DEFAULTS, // 合并 chrome.storage.local 中持久化保存的用户配置。
  luckmailApiKey: '',
  luckmailBaseUrl: DEFAULT_LUCKMAIL_BASE_URL,
  luckmailEmailType: DEFAULT_LUCKMAIL_EMAIL_TYPE,
  luckmailDomain: '',
  luckmailUsedPurchases: {},
  luckmailPreserveTagId: 0,
  luckmailPreserveTagName: DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  currentLuckmailPurchase: null,
  currentLuckmailMailCursor: null,
  autoRunning: false, // 当前是否处于自动运行中。
  autoRunPhase: 'idle', // 当前自动运行阶段。
  autoRunCurrentRun: 0, // 自动运行当前执行到第几轮。
  autoRunTotalRuns: 1, // 自动运行计划总轮数。
  autoRunAttemptRun: 0, // 当前轮次的重试序号。
  autoRunRoundSummaries: [], // 自动运行轮次摘要。
  scheduledAutoRunAt: null, // 自动运行计划启动时间戳。
  autoRunTimerPlan: null, // 自动运行可恢复计时计划快照。
  autoRunCountdownAt: null,
  autoRunCountdownTitle: '',
  autoRunCountdownNote: '',
  signupVerificationRequestedAt: null,
  loginVerificationRequestedAt: null,
  currentHotmailAccountId: null,
  preferredIcloudHost: '',
};

function normalizeAutoRunDelayMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return PERSISTED_SETTING_DEFAULTS.autoRunDelayMinutes;
  }
  return Math.min(
    AUTO_RUN_DELAY_MAX_MINUTES,
    Math.max(AUTO_RUN_DELAY_MIN_MINUTES, Math.floor(numeric))
  );
}

function normalizeAutoRunFallbackThreadIntervalMinutes(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return 0;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(
    AUTO_RUN_DELAY_MAX_MINUTES,
    Math.max(0, Math.floor(numeric))
  );
}

function normalizeAutoStepDelaySeconds(value, fallback = null) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return fallback;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS,
    Math.max(AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS, Math.floor(numeric))
  );
}

function resolveLegacyAutoStepDelaySeconds(input = {}) {
  const hasLegacyMin = input.autoStepRandomDelayMinSeconds !== undefined;
  const hasLegacyMax = input.autoStepRandomDelayMaxSeconds !== undefined;
  if (!hasLegacyMin && !hasLegacyMax) {
    return undefined;
  }

  const minSeconds = normalizeAutoStepDelaySeconds(input.autoStepRandomDelayMinSeconds, null);
  const maxSeconds = normalizeAutoStepDelaySeconds(input.autoStepRandomDelayMaxSeconds, null);
  if (minSeconds === null && maxSeconds === null) {
    return null;
  }
  if (minSeconds === null) {
    return maxSeconds;
  }
  if (maxSeconds === null) {
    return minSeconds;
  }
  return Math.round((minSeconds + maxSeconds) / 2);
}

function normalizeRunCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(50, Math.max(1, Math.floor(numeric)));
}

function normalizeAutoRunTimerKind(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return AUTO_RUN_TIMER_KIND_SCHEDULED_START;
  }
  if (normalized === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    return AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS;
  }
  if (normalized === AUTO_RUN_TIMER_KIND_BEFORE_RETRY) {
    return AUTO_RUN_TIMER_KIND_BEFORE_RETRY;
  }
  return '';
}

function normalizeAutoRunTimerPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return null;
  }

  const kind = normalizeAutoRunTimerKind(plan.kind);
  if (!kind) {
    return null;
  }

  const fireAt = Number(plan.fireAt);
  if (!Number.isFinite(fireAt)) {
    return null;
  }

  const totalRuns = normalizeRunCount(plan.totalRuns);
  const autoRunSkipFailures = Boolean(plan.autoRunSkipFailures);
  const mode = plan.mode === 'continue' ? 'continue' : 'restart';
  const currentRun = Math.max(0, Math.min(totalRuns, Math.floor(Number(plan.currentRun) || 0)));
  const attemptRun = Math.max(
    0,
    Math.min(AUTO_RUN_MAX_RETRIES_PER_ROUND + 1, Math.floor(Number(plan.attemptRun) || 0))
  );
  const roundSummaries = serializeAutoRunRoundSummaries(totalRuns, plan.roundSummaries);
  const countdownTitle = String(plan.countdownTitle || '').trim();
  const countdownNote = String(plan.countdownNote || '').trim();

  if (kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return {
      kind,
      fireAt,
      totalRuns,
      autoRunSkipFailures,
      mode,
      currentRun: 0,
      attemptRun: 0,
      roundSummaries: [],
      countdownTitle: countdownTitle || '已计划自动运行',
      countdownNote: countdownNote || `计划于 ${formatAutoRunScheduleTime(fireAt)} 开始`,
    };
  }

  if (kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    const normalizedCurrentRun = Math.max(1, Math.min(totalRuns, currentRun));
    const normalizedAttemptRun = Math.max(1, attemptRun);
    return {
      kind,
      fireAt,
      totalRuns,
      autoRunSkipFailures,
      mode: 'restart',
      currentRun: normalizedCurrentRun,
      attemptRun: normalizedAttemptRun,
      roundSummaries,
      countdownTitle: countdownTitle || '线程间隔中',
      countdownNote: countdownNote || `第 ${Math.min(normalizedCurrentRun + 1, totalRuns)}/${totalRuns} 轮即将开始`,
    };
  }

  const normalizedCurrentRun = Math.max(1, Math.min(totalRuns, currentRun));
  const normalizedAttemptRun = Math.max(1, attemptRun);
  return {
    kind,
    fireAt,
    totalRuns,
    autoRunSkipFailures,
    mode: 'restart',
    currentRun: normalizedCurrentRun,
    attemptRun: normalizedAttemptRun,
    roundSummaries,
    countdownTitle: countdownTitle || '线程间隔中',
    countdownNote: countdownNote || `第 ${normalizedCurrentRun}/${totalRuns} 轮第 ${normalizedAttemptRun} 次尝试即将开始`,
  };
}

function normalizeAutoRunTimerPlanFromState(state = {}) {
  const directPlan = normalizeAutoRunTimerPlan(state.autoRunTimerPlan);
  if (directPlan) {
    return directPlan;
  }

  if (state.autoRunPhase !== 'scheduled') {
    return null;
  }

  const legacyScheduledAt = Number(state.scheduledAutoRunAt);
  if (!Number.isFinite(legacyScheduledAt)) {
    return null;
  }

  return normalizeAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_SCHEDULED_START,
    fireAt: legacyScheduledAt,
    totalRuns: state.scheduledAutoRunPlan?.totalRuns ?? state.autoRunTotalRuns,
    autoRunSkipFailures: state.scheduledAutoRunPlan?.autoRunSkipFailures ?? state.autoRunSkipFailures,
    mode: state.scheduledAutoRunPlan?.mode,
  });
}

function getAutoRunTimerPlanPhase(kind = '') {
  return kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START ? 'scheduled' : 'waiting_interval';
}

function getAutoRunTimerStatusPayload(plan) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    return null;
  }

  const phase = getAutoRunTimerPlanPhase(normalizedPlan.kind);
  return {
    phase,
    currentRun: normalizedPlan.currentRun,
    totalRuns: normalizedPlan.totalRuns,
    attemptRun: normalizedPlan.attemptRun,
    scheduledAt: phase === 'scheduled' ? normalizedPlan.fireAt : null,
    countdownAt: normalizedPlan.fireAt,
    countdownTitle: normalizedPlan.countdownTitle,
    countdownNote: normalizedPlan.countdownNote,
  };
}

function normalizeEmailGenerator(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'custom' || normalized === 'manual') {
    return 'custom';
  }
  if (normalized === 'icloud') {
    return 'icloud';
  }
  if (normalized === 'cloudflare') return 'cloudflare';
  if (normalized === CLOUDFLARE_TEMP_EMAIL_GENERATOR) return CLOUDFLARE_TEMP_EMAIL_GENERATOR;
  return 'duck';
}

function normalizePanelMode(value = '') {
  return String(value || '').trim().toLowerCase() === 'sub2api' ? 'sub2api' : 'cpa';
}

function normalizeMailProvider(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  switch (normalized) {
    case 'custom':
    case ICLOUD_PROVIDER:
    case GMAIL_PROVIDER:
    case HOTMAIL_PROVIDER:
    case LUCKMAIL_PROVIDER:
    case CLOUDFLARE_TEMP_EMAIL_PROVIDER:
    case '163':
    case '163-vip':
    case 'qq':
    case 'inbucket':
    case '2925':
      return normalized;
    default:
      return PERSISTED_SETTING_DEFAULTS.mailProvider;
  }
}

function buildLuckmailSessionSettingsPayload(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const payload = {};

  if (input.luckmailApiKey !== undefined) {
    payload.luckmailApiKey = String(input.luckmailApiKey || '');
  }
  if (input.luckmailBaseUrl !== undefined) {
    payload.luckmailBaseUrl = normalizeLuckmailBaseUrl(input.luckmailBaseUrl);
  }
  if (input.luckmailEmailType !== undefined) {
    payload.luckmailEmailType = normalizeLuckmailEmailType(input.luckmailEmailType);
  }
  if (input.luckmailDomain !== undefined) {
    payload.luckmailDomain = String(input.luckmailDomain || '').trim();
  }
  if (input.luckmailUsedPurchases !== undefined) {
    payload.luckmailUsedPurchases = normalizeLuckmailUsedPurchases(input.luckmailUsedPurchases);
  }
  if (input.luckmailPreserveTagId !== undefined) {
    payload.luckmailPreserveTagId = Number(input.luckmailPreserveTagId) || 0;
  }
  if (input.luckmailPreserveTagName !== undefined) {
    payload.luckmailPreserveTagName = String(input.luckmailPreserveTagName || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME;
  }
  if (input.currentLuckmailPurchase !== undefined) {
    payload.currentLuckmailPurchase = input.currentLuckmailPurchase
      ? normalizeLuckmailPurchase(input.currentLuckmailPurchase)
      : null;
  }
  if (input.currentLuckmailMailCursor !== undefined) {
    payload.currentLuckmailMailCursor = input.currentLuckmailMailCursor
      ? normalizeLuckmailMailCursor(input.currentLuckmailMailCursor)
      : null;
  }

  return payload;
}

function normalizeMail2925Mode(value = '') {
  return String(value || '').trim().toLowerCase() === MAIL_2925_MODE_RECEIVE
    ? MAIL_2925_MODE_RECEIVE
    : DEFAULT_MAIL_2925_MODE;
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

function normalizeCloudflareDomain(rawValue = '') {
  let value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^@+/, '');
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return '';
  return value;
}

function normalizeCloudflareDomains(values) {
  const normalizedDomains = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCloudflareDomain(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedDomains.push(normalized);
  }

  return normalizedDomains;
}

function normalizeHotmailRemoteBaseUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return DEFAULT_HOTMAIL_REMOTE_BASE_URL;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_HOTMAIL_REMOTE_BASE_URL;
    }

    if (parsed.pathname.endsWith('/api/mail-new') || parsed.pathname.endsWith('/api/mail-all') || parsed.pathname === '/api.html') {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_HOTMAIL_REMOTE_BASE_URL;
  }
}

function normalizeHotmailLocalBaseUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return DEFAULT_HOTMAIL_LOCAL_BASE_URL;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_HOTMAIL_LOCAL_BASE_URL;
    }

    if (['/messages', '/code', '/clear', '/token'].includes(parsed.pathname)) {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_HOTMAIL_LOCAL_BASE_URL;
  }
}

function getHotmailServiceSettings(state = {}) {
  return {
    mode: normalizeHotmailServiceMode(state.hotmailServiceMode),
    remoteBaseUrl: normalizeHotmailRemoteBaseUrl(state.hotmailRemoteBaseUrl),
    localBaseUrl: normalizeHotmailLocalBaseUrl(state.hotmailLocalBaseUrl),
  };
}

function getCloudflareTempEmailConfig(state = {}) {
  return {
    baseUrl: normalizeCloudflareTempEmailBaseUrl(state.cloudflareTempEmailBaseUrl),
    adminAuth: String(state.cloudflareTempEmailAdminAuth || ''),
    customAuth: String(state.cloudflareTempEmailCustomAuth || ''),
    receiveMailbox: normalizeCloudflareTempEmailReceiveMailbox(state.cloudflareTempEmailReceiveMailbox),
    domain: normalizeCloudflareTempEmailDomain(state.cloudflareTempEmailDomain),
    domains: normalizeCloudflareTempEmailDomains(state.cloudflareTempEmailDomains),
  };
}

function normalizeCloudflareTempEmailReceiveMailbox(value = '') {
  const normalized = normalizeCloudflareTempEmailAddress(value);
  if (!normalized) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function resolveCloudflareTempEmailPollTargetEmail(state = {}, pollPayload = {}, config = getCloudflareTempEmailConfig(state)) {
  const configuredReceiveMailbox = normalizeCloudflareTempEmailReceiveMailbox(config.receiveMailbox);
  if (configuredReceiveMailbox) {
    return configuredReceiveMailbox;
  }

  const requestedTarget = normalizeCloudflareTempEmailReceiveMailbox(pollPayload.targetEmail);
  if (requestedTarget) {
    return requestedTarget;
  }

  return normalizeCloudflareTempEmailReceiveMailbox(state.email);
}

function normalizePersistentSettingValue(key, value) {
  switch (key) {
    case 'panelMode':
      return normalizePanelMode(value);
    case 'vpsUrl':
      return String(value || '').trim();
    case 'vpsPassword':
      return String(value || '');
    case 'localCpaStep9Mode':
      return normalizeLocalCpaStep9Mode(value);
    case 'cpaCallbackMode':
      return normalizeCpaCallbackMode(value);
    case 'sub2apiUrl':
      return String(value || '').trim();
    case 'sub2apiEmail':
      return String(value || '').trim();
    case 'sub2apiPassword':
      return String(value || '');
    case 'sub2apiGroupName':
      return String(value || '').trim();
    case 'customPassword':
      return String(value || '');
    case 'autoRunSkipFailures':
    case 'autoRunDelayEnabled':
      return Boolean(value);
    case 'autoRunFallbackThreadIntervalMinutes':
      return normalizeAutoRunFallbackThreadIntervalMinutes(value);
    case 'autoRunDelayMinutes':
      return normalizeAutoRunDelayMinutes(value);
    case 'autoStepDelaySeconds':
      return normalizeAutoStepDelaySeconds(value, PERSISTED_SETTING_DEFAULTS.autoStepDelaySeconds);
    case 'mailProvider':
      return normalizeMailProvider(value);
    case 'mail2925Mode':
      return normalizeMail2925Mode(value);
    case 'emailGenerator':
      return normalizeEmailGenerator(value);
    case 'autoDeleteUsedIcloudAlias':
      return Boolean(value);
    case 'icloudHostPreference':
      return normalizeIcloudHost(value) || 'auto';
    case 'emailPrefix':
      return String(value || '').trim();
    case 'inbucketHost':
      return String(value || '').trim();
    case 'inbucketMailbox':
      return String(value || '').trim();
    case 'hotmailServiceMode':
      return normalizeHotmailServiceMode(value);
    case 'hotmailRemoteBaseUrl':
      return normalizeHotmailRemoteBaseUrl(value);
    case 'hotmailLocalBaseUrl':
      return normalizeHotmailLocalBaseUrl(value);
    case 'cloudflareDomain':
      return normalizeCloudflareDomain(value);
    case 'cloudflareDomains':
      return normalizeCloudflareDomains(value);
    case 'cloudflareTempEmailBaseUrl':
      return normalizeCloudflareTempEmailBaseUrl(value);
    case 'cloudflareTempEmailAdminAuth':
    case 'cloudflareTempEmailCustomAuth':
      return String(value || '');
    case 'cloudflareTempEmailReceiveMailbox':
      return normalizeCloudflareTempEmailReceiveMailbox(value);
    case 'cloudflareTempEmailDomain':
      return normalizeCloudflareTempEmailDomain(value);
    case 'cloudflareTempEmailDomains':
      return normalizeCloudflareTempEmailDomains(value);
    case 'hotmailAccounts':
      return normalizeHotmailAccounts(value);
    default:
      return value;
  }
}

function buildPersistentSettingsPayload(input = {}, options = {}) {
  const { fillDefaults = false, requireKnownKeys = false } = options;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('\u914d\u7f6e\u5185\u5bb9\u683c\u5f0f\u65e0\u6548\u3002');
  }

  const normalizedInput = { ...input };
  if (normalizedInput.autoStepDelaySeconds === undefined) {
    const legacyAutoStepDelaySeconds = resolveLegacyAutoStepDelaySeconds(normalizedInput);
    if (legacyAutoStepDelaySeconds !== undefined) {
      normalizedInput.autoStepDelaySeconds = legacyAutoStepDelaySeconds;
    }
  }

  const payload = {};
  let matchedKeyCount = 0;
  for (const key of PERSISTED_SETTING_KEYS) {
    if (normalizedInput[key] !== undefined) {
      payload[key] = normalizePersistentSettingValue(key, normalizedInput[key]);
      matchedKeyCount += 1;
    } else if (fillDefaults) {
      payload[key] = normalizePersistentSettingValue(key, PERSISTED_SETTING_DEFAULTS[key]);
    }
  }

  if (requireKnownKeys && matchedKeyCount === 0) {
    throw new Error('\u914d\u7f6e\u6587\u4ef6\u4e2d\u6ca1\u6709\u53ef\u8bc6\u522b\u7684\u914d\u7f6e\u5185\u5bb9\u3002');
  }

  if (payload.cloudflareDomains) {
    const domains = normalizeCloudflareDomains(payload.cloudflareDomains);
    if (payload.cloudflareDomain && !domains.includes(payload.cloudflareDomain)) {
      domains.unshift(payload.cloudflareDomain);
    }
    payload.cloudflareDomains = domains;
  }
  if (payload.cloudflareTempEmailDomains) {
    const domains = normalizeCloudflareTempEmailDomains(payload.cloudflareTempEmailDomains);
    if (payload.cloudflareTempEmailDomain && !domains.includes(payload.cloudflareTempEmailDomain)) {
      domains.unshift(payload.cloudflareTempEmailDomain);
    }
    payload.cloudflareTempEmailDomains = domains;
  }

  return payload;
}

async function getPersistedSettings() {
  const stored = await chrome.storage.local.get([...PERSISTED_SETTING_KEYS, ...LEGACY_AUTO_STEP_DELAY_KEYS]);
  return buildPersistentSettingsPayload(stored, { fillDefaults: true });
}

async function getPersistedAliasState() {
  try {
    const stored = await chrome.storage.local.get(PERSISTENT_ALIAS_STATE_KEYS);
    return {
      manualAliasUsage: normalizeBooleanMap(stored.manualAliasUsage),
      preservedAliases: normalizeBooleanMap(stored.preservedAliases),
    };
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to read persisted iCloud alias state:', err?.message || err);
    return {
      manualAliasUsage: {},
      preservedAliases: {},
    };
  }
}

async function getState() {
  const [state, persistedSettings, persistedAliasState] = await Promise.all([
    chrome.storage.session.get(null),
    getPersistedSettings(),
    getPersistedAliasState(),
  ]);
  return { ...DEFAULT_STATE, ...persistedSettings, ...persistedAliasState, ...state };
}

async function initializeSessionStorageAccess() {
  try {
    if (chrome.storage?.session?.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      });
      console.log(LOG_PREFIX, 'Enabled storage.session for content scripts');
    }
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to enable storage.session for content scripts:', err?.message || err);
  }
}

async function setState(updates) {
  console.log(LOG_PREFIX, 'storage.set:', JSON.stringify(updates).slice(0, 200));
  if (Object.keys(updates || {}).length > 0) {
    await chrome.storage.session.set(updates);
    const persistentAliasUpdates = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'manualAliasUsage')) {
      persistentAliasUpdates.manualAliasUsage = normalizeBooleanMap(updates.manualAliasUsage);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'preservedAliases')) {
      persistentAliasUpdates.preservedAliases = normalizeBooleanMap(updates.preservedAliases);
    }
    if (Object.keys(persistentAliasUpdates).length > 0) {
      await chrome.storage.local.set(persistentAliasUpdates);
    }
  }
}

async function setPersistentSettings(updates) {
  const persistedUpdates = buildPersistentSettingsPayload(updates);

  if (Object.keys(persistedUpdates).length > 0) {
    await chrome.storage.local.set(persistedUpdates);
  }
}

function buildSettingsExportFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${SETTINGS_EXPORT_FILENAME_PREFIX}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}

async function exportSettingsBundle() {
  const settings = await getPersistedSettings();
  const bundle = {
    schemaVersion: SETTINGS_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    settings,
  };

  return {
    fileName: buildSettingsExportFilename(),
    fileContent: JSON.stringify(bundle, null, 2),
  };
}

async function importSettingsBundle(configBundle) {
  const state = await ensureManualInteractionAllowed('\u5bfc\u5165\u914d\u7f6e');
  if (Object.values(state.stepStatuses || {}).some((status) => status === 'running')) {
    throw new Error('\u5f53\u524d\u6709\u6b65\u9aa4\u6b63\u5728\u6267\u884c\uff0c\u65e0\u6cd5\u5bfc\u5165\u914d\u7f6e\u3002');
  }
  if (!configBundle || typeof configBundle !== 'object' || Array.isArray(configBundle)) {
    throw new Error('\u914d\u7f6e\u6587\u4ef6\u5185\u5bb9\u65e0\u6548\u3002');
  }

  const schemaVersion = Number(configBundle.schemaVersion);
  if (schemaVersion !== SETTINGS_EXPORT_SCHEMA_VERSION) {
    throw new Error(`\u4ec5\u652f\u6301\u5bfc\u5165 schemaVersion=${SETTINGS_EXPORT_SCHEMA_VERSION} \u7684\u914d\u7f6e\u6587\u4ef6\u3002`);
  }
  if (!configBundle.settings || typeof configBundle.settings !== 'object' || Array.isArray(configBundle.settings)) {
    throw new Error('\u914d\u7f6e\u6587\u4ef6\u7f3a\u5c11 settings \u914d\u7f6e\u6bb5\u3002');
  }

  const importedSettings = buildPersistentSettingsPayload(configBundle.settings, {
    fillDefaults: true,
    requireKnownKeys: true,
  });

  await setPersistentSettings(importedSettings);

  const sessionUpdates = {
    ...importedSettings,
    currentHotmailAccountId: null,
    email: null,
  };

  await setState(sessionUpdates);
  broadcastDataUpdate({
    ...importedSettings,
    currentHotmailAccountId: null,
    ...(sessionUpdates.email !== undefined ? { email: sessionUpdates.email } : {}),
  });

  return getState();
}

function broadcastDataUpdate(payload) {
  chrome.runtime.sendMessage({
    type: 'DATA_UPDATED',
    payload,
  }).catch(() => { });
}

function broadcastIcloudAliasesChanged(payload = {}) {
  chrome.runtime.sendMessage({
    type: 'ICLOUD_ALIASES_CHANGED',
    payload,
  }).catch(() => { });
}

async function setEmailStateSilently(email) {
  await setState({ email });
  broadcastDataUpdate({ email });
}

async function setEmailState(email) {
  await setEmailStateSilently(email);
  if (email) {
    await resumeAutoRunIfWaitingForEmail();
  }
}

async function setPasswordState(password) {
  await setState({ password });
  broadcastDataUpdate({ password });
}

function getLuckmailUsedPurchases(state = {}) {
  return normalizeLuckmailUsedPurchases(state?.luckmailUsedPurchases);
}

function getLuckmailPreserveTagInfo(state = {}) {
  return {
    id: Number(state?.luckmailPreserveTagId) || 0,
    name: String(state?.luckmailPreserveTagName || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  };
}

async function setLuckmailUsedPurchasesState(usedPurchases) {
  const normalizedUsedPurchases = normalizeLuckmailUsedPurchases(usedPurchases);
  await setState({ luckmailUsedPurchases: normalizedUsedPurchases });
  broadcastDataUpdate({ luckmailUsedPurchases: normalizedUsedPurchases });
  return normalizedUsedPurchases;
}

async function setLuckmailPurchaseUsedState(purchaseId, used) {
  const normalizedPurchaseId = normalizeLuckmailPurchaseId(purchaseId);
  if (!normalizedPurchaseId) {
    throw new Error('LuckMail 邮箱 ID 无效。');
  }

  const state = await getState();
  const usedPurchases = getLuckmailUsedPurchases(state);
  if (used) {
    usedPurchases[normalizedPurchaseId] = true;
  } else {
    delete usedPurchases[normalizedPurchaseId];
  }

  await setLuckmailUsedPurchasesState(usedPurchases);
  return {
    purchaseId: Number(normalizedPurchaseId),
    used: Boolean(used),
  };
}

async function setLuckmailPreserveTagInfo(tag) {
  const normalizedTags = normalizeLuckmailTags([tag]);
  const normalizedTag = normalizedTags[0] || {
    id: 0,
    name: DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  };
  const updates = {
    luckmailPreserveTagId: Number(normalizedTag.id) || 0,
    luckmailPreserveTagName: String(normalizedTag.name || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  };
  await setState(updates);
  broadcastDataUpdate(updates);
  return updates;
}

async function setLuckmailPurchaseState(purchase) {
  const normalizedPurchase = purchase ? normalizeLuckmailPurchase(purchase) : null;
  await setState({ currentLuckmailPurchase: normalizedPurchase });
  broadcastDataUpdate({ currentLuckmailPurchase: normalizedPurchase });
  return normalizedPurchase;
}

async function setLuckmailMailCursorState(cursor) {
  const normalizedCursor = cursor ? normalizeLuckmailMailCursor(cursor) : null;
  await setState({ currentLuckmailMailCursor: normalizedCursor });
  return normalizedCursor;
}

async function clearLuckmailRuntimeState(options = {}) {
  const { clearEmail = false } = options;
  const updates = {
    currentLuckmailPurchase: null,
    currentLuckmailMailCursor: null,
  };
  if (clearEmail) {
    updates.email = null;
  }
  await setState(updates);
  broadcastDataUpdate(updates);
}

function getManualAliasUsageMap(state) {
  return normalizeBooleanMap(state?.manualAliasUsage);
}

function getPreservedAliasMap(state) {
  return normalizeBooleanMap(state?.preservedAliases);
}

function isAliasPreserved(state, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;
  return Boolean(getPreservedAliasMap(state)[normalizedEmail]);
}

function getEffectiveUsedEmails(state) {
  return toNormalizedEmailSet(getManualAliasUsageMap(state));
}

async function setIcloudAliasUsedState(payload = {}, options = {}) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('未提供 iCloud 隐私邮箱地址。');
  }

  const used = Boolean(payload.used);
  const state = await getState();
  const manualAliasUsage = getManualAliasUsageMap(state);
  manualAliasUsage[email] = used;
  await setState({ manualAliasUsage });
  if (!options.silentLog) {
    await addLog(`iCloud：已将 ${email} 标记为${used ? '已用' : '未用'}`, 'ok');
  }
  broadcastIcloudAliasesChanged({ reason: 'used-updated', email, used });
  return { email, used };
}

async function setIcloudAliasPreservedState(payload = {}) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('未提供 iCloud 隐私邮箱地址。');
  }

  const preserved = Boolean(payload.preserved);
  const state = await getState();
  const preservedAliases = getPreservedAliasMap(state);
  preservedAliases[email] = preserved;
  await setState({ preservedAliases });
  await addLog(`iCloud：已将 ${email} ${preserved ? '设为保留' : '取消保留'}`, 'ok');
  broadcastIcloudAliasesChanged({ reason: 'preserved-updated', email, preserved });
  return { email, preserved };
}

async function resetState() {
  console.log(LOG_PREFIX, 'Resetting all state');
  // Preserve settings and persistent data across resets
  const [prev, persistedSettings, persistedAliasState] = await Promise.all([
    chrome.storage.session.get([
      'seenCodes',
      'seenInbucketMailIds',
      'accounts',
      'tabRegistry',
      'sourceLastUrls',
      'luckmailApiKey',
      'luckmailBaseUrl',
      'luckmailEmailType',
      'luckmailDomain',
      'luckmailUsedPurchases',
      'luckmailPreserveTagId',
      'luckmailPreserveTagName',
      'preferredIcloudHost',
    ]),
    getPersistedSettings(),
    getPersistedAliasState(),
  ]);
  await chrome.storage.session.clear();
  await chrome.storage.session.set({
    ...DEFAULT_STATE,
    ...persistedSettings,
    ...persistedAliasState,
    seenCodes: prev.seenCodes || [],
    seenInbucketMailIds: prev.seenInbucketMailIds || [],
    accounts: prev.accounts || [],
    tabRegistry: prev.tabRegistry || {},
    sourceLastUrls: prev.sourceLastUrls || {},
    luckmailApiKey: String(prev.luckmailApiKey || ''),
    luckmailBaseUrl: normalizeLuckmailBaseUrl(prev.luckmailBaseUrl),
    luckmailEmailType: normalizeLuckmailEmailType(prev.luckmailEmailType),
    luckmailDomain: String(prev.luckmailDomain || '').trim(),
    luckmailUsedPurchases: normalizeLuckmailUsedPurchases(prev.luckmailUsedPurchases),
    luckmailPreserveTagId: Number(prev.luckmailPreserveTagId) || 0,
    luckmailPreserveTagName: String(prev.luckmailPreserveTagName || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
    currentLuckmailPurchase: null,
    currentLuckmailMailCursor: null,
    preferredIcloudHost: prev.preferredIcloudHost || '',
  });
}

/**
 * Generate a random password: 14 chars, mix of uppercase, lowercase, digits, symbols.
 */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;

  // Ensure at least one of each type
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill remaining 10 chars
  for (let i = 0; i < 10; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

function normalizeHotmailAccount(account = {}) {
  const normalizedLastAuthAt = Number.isFinite(Number(account.lastAuthAt)) ? Number(account.lastAuthAt) : 0;
  const normalizedStatus = String(
    account.status
    || (normalizedLastAuthAt > 0 ? 'authorized' : 'pending')
  );
  return {
    id: String(account.id || crypto.randomUUID()),
    email: String(account.email || '').trim(),
    password: String(account.password || ''),
    clientId: String(account.clientId || '').trim(),
    refreshToken: String(account.refreshToken || ''),
    status: normalizedStatus,
    enabled: account.enabled !== undefined ? Boolean(account.enabled) : true,
    used: Boolean(account.used),
    lastUsedAt: Number.isFinite(Number(account.lastUsedAt)) ? Number(account.lastUsedAt) : 0,
    lastAuthAt: normalizedLastAuthAt,
    lastError: String(account.lastError || ''),
  };
}

function normalizeHotmailAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];

  const deduped = new Map();
  for (const account of accounts) {
    const normalized = normalizeHotmailAccount(account);
    if (!normalized.email && !normalized.id) continue;
    deduped.set(normalized.id, normalized);
  }
  return [...deduped.values()];
}

function findHotmailAccount(accounts, accountId) {
  return normalizeHotmailAccounts(accounts).find((account) => account.id === accountId) || null;
}

function isHotmailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === HOTMAIL_PROVIDER;
}

function isLuckmailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === LUCKMAIL_PROVIDER;
}

function isCustomMailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === 'custom';
}

function getMail2925Mode(stateOrMode) {
  if (typeof stateOrMode === 'string') {
    return normalizeMail2925Mode(stateOrMode);
  }
  return normalizeMail2925Mode(stateOrMode?.mail2925Mode);
}

async function syncHotmailAccounts(accounts) {
  const normalized = normalizeHotmailAccounts(accounts);
  await setPersistentSettings({ hotmailAccounts: normalized });
  await setState({ hotmailAccounts: normalized });
  broadcastDataUpdate({ hotmailAccounts: normalized });
  return normalized;
}

async function upsertHotmailAccount(input) {
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const normalizedEmail = String(input?.email || '').trim().toLowerCase();
  const existing = input?.id
    ? findHotmailAccount(accounts, input.id)
    : accounts.find((account) => account.email.toLowerCase() === normalizedEmail) || null;
  const credentialsChanged = !existing
    || (input?.clientId !== undefined && String(input.clientId).trim() !== existing.clientId)
    || (input?.refreshToken !== undefined && String(input.refreshToken).trim() !== existing.refreshToken)
    || (input?.email !== undefined && String(input.email).trim().toLowerCase() !== existing.email.toLowerCase());
  const normalized = normalizeHotmailAccount({
    ...(existing || {}),
    ...(credentialsChanged ? {
      status: 'pending',
      lastAuthAt: 0,
      lastError: '',
    } : {}),
    ...input,
    id: input?.id || existing?.id || crypto.randomUUID(),
  });

  const nextAccounts = existing
    ? accounts.map((account) => (account.id === normalized.id ? normalized : account))
    : [...accounts, normalized];

  await syncHotmailAccounts(nextAccounts);
  return normalized;
}

async function deleteHotmailAccount(accountId) {
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const nextAccounts = accounts.filter((account) => account.id !== accountId);
  await syncHotmailAccounts(nextAccounts);

  if (state.currentHotmailAccountId === accountId) {
    await setState({ currentHotmailAccountId: null });
    if (isHotmailProvider(state)) {
      await setEmailState(null);
    }
    broadcastDataUpdate({ currentHotmailAccountId: null });
  }
}

async function deleteHotmailAccounts(mode = 'all') {
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const targets = filterHotmailAccountsByUsage(accounts, mode);
  const targetIds = new Set(targets.map((account) => account.id));
  const nextAccounts = mode === 'used'
    ? accounts.filter((account) => !targetIds.has(account.id))
    : [];

  await syncHotmailAccounts(nextAccounts);

  if (state.currentHotmailAccountId && targetIds.has(state.currentHotmailAccountId)) {
    await setState({ currentHotmailAccountId: null });
    if (isHotmailProvider(state)) {
      await setEmailState(null);
    }
    broadcastDataUpdate({ currentHotmailAccountId: null });
  }

  return {
    deletedCount: targets.length,
    remainingCount: nextAccounts.length,
  };
}

async function patchHotmailAccount(accountId, updates = {}) {
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const account = findHotmailAccount(accounts, accountId);
  if (!account) {
    throw new Error('未找到对应的 Hotmail 账号。');
  }

  const nextAccount = normalizeHotmailAccount({
    ...account,
    ...updates,
    id: account.id,
  });

  await syncHotmailAccounts(accounts.map((item) => (item.id === account.id ? nextAccount : item)));

  if (state.currentHotmailAccountId === account.id && shouldClearHotmailCurrentSelection(nextAccount)) {
    await setState({ currentHotmailAccountId: null });
    broadcastDataUpdate({ currentHotmailAccountId: null });
    if (isHotmailProvider(state)) {
      await setEmailState(null);
    }
  }

  return nextAccount;
}

async function setCurrentHotmailAccount(accountId, options = {}) {
  const { markUsed = false, syncEmail = true } = options;
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const account = findHotmailAccount(accounts, accountId);
  if (!account) {
    throw new Error('未找到对应的 Hotmail 账号。');
  }

  if (markUsed) {
    account.lastUsedAt = Date.now();
    await syncHotmailAccounts(accounts.map((item) => (item.id === account.id ? account : item)));
  }

  await setState({ currentHotmailAccountId: account.id });
  broadcastDataUpdate({ currentHotmailAccountId: account.id });
  if (syncEmail) {
    await setEmailState(account.email || null);
  }
  return account;
}

async function ensureHotmailAccountForFlow(options = {}) {
  const { allowAllocate = true, markUsed = false, preferredAccountId = null } = options;
  const state = await getState();
  const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
  const isAccountAllocatable = (candidate) => Boolean(candidate)
    && candidate.status === 'authorized'
    && !candidate.used
    && Boolean(candidate.refreshToken);

  let account = null;
  if (preferredAccountId) {
    account = findHotmailAccount(accounts, preferredAccountId);
  }
  if (!account && state.currentHotmailAccountId) {
    account = findHotmailAccount(accounts, state.currentHotmailAccountId);
  }
  if ((!account || !isAccountAllocatable(account)) && allowAllocate) {
    account = pickHotmailAccountForRun(accounts, {});
  }

  if (!account) {
    throw new Error('没有可用的 Hotmail 账号。请先在侧边栏添加至少一个带刷新令牌（refresh token）的账号。');
  }
  if (!isAccountAllocatable(account)) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 尚未就绪，无法读取邮件。`);
  }

  return setCurrentHotmailAccount(account.id, { markUsed, syncEmail: true });
}

function buildHotmailLocalEndpoint(baseUrl, path) {
  const normalizedBaseUrl = normalizeHotmailLocalBaseUrl(baseUrl);
  return new URL(path, `${normalizedBaseUrl}/`).toString();
}

async function requestHotmailRemoteMailbox(account, mailbox = 'INBOX') {
  if (!account?.email) {
    throw new Error('Hotmail 账号缺少邮箱地址。');
  }
  if (!account?.clientId) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少客户端 ID。`);
  }
  if (!account?.refreshToken) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少刷新令牌（refresh token）。`);
  }

  const { timeoutMs } = getHotmailMailApiRequestConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  try {
    const result = await fetchMicrosoftMailboxMessages({
      clientId: account.clientId,
      refreshToken: account.refreshToken,
      mailbox,
      top: 10,
      signal: controller.signal,
    });

    return {
      mailbox,
      payload: {
        source: 'microsoft-api',
        transport: result.transport,
        tokenStrategy: result.tokenStrategy,
      },
      messages: normalizeHotmailMailApiMessages(result.messages).map((message) => ({
        ...message,
        mailbox: message?.mailbox || mailbox,
      })),
      nextRefreshToken: result.nextRefreshToken,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Hotmail API 对接请求超时（>${Math.round(timeoutMs / 1000)} 秒）：${mailbox}`);
    }
    throw new Error(`Hotmail API 对接请求失败：${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function applyHotmailApiResultToAccount(account, apiResult) {
  const nextRefreshToken = String(apiResult?.nextRefreshToken || '').trim();
  return {
    ...account,
    refreshToken: nextRefreshToken || account.refreshToken,
    status: 'authorized',
    lastAuthAt: Date.now(),
    lastError: '',
  };
}

function buildHotmailMailApiFailureAccount(account, errorMessage) {
  return normalizeHotmailAccount({
    ...account,
    status: 'error',
    lastError: String(errorMessage || ''),
  });
}

async function fetchHotmailMailboxMessagesFromRemoteService(account, mailboxes = HOTMAIL_MAILBOXES) {
  let workingAccount = normalizeHotmailAccount(account);
  const mailboxResults = [];

  try {
    for (const mailbox of mailboxes) {
      const result = await requestHotmailRemoteMailbox(workingAccount, mailbox);
      workingAccount = applyHotmailApiResultToAccount(workingAccount, result);
      mailboxResults.push({
        mailbox,
        count: result.messages.length,
        messages: result.messages.map((message) => ({
          ...message,
          mailbox: message?.mailbox || mailbox,
        })),
      });
    }
  } catch (err) {
    const failedAccount = buildHotmailMailApiFailureAccount(workingAccount, err.message);
    await upsertHotmailAccount(failedAccount);
    throw err;
  }

  const savedAccount = await upsertHotmailAccount(workingAccount);
  return {
    account: savedAccount,
    mailboxResults,
    messages: mailboxResults.flatMap((item) => item.messages),
  };
}

async function requestHotmailLocalMessages(account, mailboxes = HOTMAIL_MAILBOXES) {
  if (!account?.email) {
    throw new Error('Hotmail 账号缺少邮箱地址。');
  }
  if (!account?.clientId) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少客户端 ID。`);
  }
  if (!account?.refreshToken) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少刷新令牌（refresh token）。`);
  }

  const serviceSettings = getHotmailServiceSettings(await getState());
  const { timeoutMs } = getHotmailMailApiRequestConfig();
  const requestTimeoutMs = Math.max(timeoutMs, HOTMAIL_LOCAL_HELPER_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), requestTimeoutMs);

  let response;
  try {
    response = await fetch(buildHotmailLocalEndpoint(serviceSettings.localBaseUrl, '/messages'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        clientId: account.clientId,
        refreshToken: account.refreshToken,
        mailboxes,
        top: 5,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Hotmail 本地助手请求超时（>${Math.round(requestTimeoutMs / 1000)} 秒）`);
    }
    throw new Error(`Hotmail 本地助手请求失败：${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok || payload?.ok === false) {
    const errorText = payload?.error || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(`Hotmail 本地助手返回失败：${errorText}`);
  }

  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const normalizedMessages = normalizeHotmailMailApiMessages(rawMessages).map((message, index) => ({
    ...message,
    mailbox: rawMessages[index]?.mailbox || 'INBOX',
    receivedTimestamp: Number(rawMessages[index]?.receivedTimestamp || 0) || 0,
  }));
  const mailboxResults = Array.isArray(payload?.mailboxResults)
    ? payload.mailboxResults.map((item) => ({
      mailbox: String(item?.mailbox || 'INBOX'),
      count: Number(item?.count || 0),
      messages: normalizedMessages.filter((message) => String(message.mailbox || 'INBOX') === String(item?.mailbox || 'INBOX')),
    }))
    : mailboxes.map((mailbox) => ({
      mailbox,
      count: normalizedMessages.filter((message) => String(message.mailbox || 'INBOX') === mailbox).length,
      messages: normalizedMessages.filter((message) => String(message.mailbox || 'INBOX') === mailbox),
    }));

  const nextAccount = applyHotmailApiResultToAccount(account, {
    nextRefreshToken: String(payload?.nextRefreshToken || '').trim(),
  });
  const savedAccount = await upsertHotmailAccount(nextAccount);
  return {
    account: savedAccount,
    mailboxResults,
    messages: normalizedMessages,
  };
}

async function requestHotmailLocalCode(account, pollPayload = {}) {
  if (!account?.email) {
    throw new Error('Hotmail 账号缺少邮箱地址。');
  }
  if (!account?.clientId) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少客户端 ID。`);
  }
  if (!account?.refreshToken) {
    throw new Error(`Hotmail 账号 ${account.email || account.id} 缺少刷新令牌（refresh token）。`);
  }

  const serviceSettings = getHotmailServiceSettings(await getState());
  const { timeoutMs } = getHotmailMailApiRequestConfig();
  const requestTimeoutMs = Math.max(timeoutMs, HOTMAIL_LOCAL_HELPER_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), requestTimeoutMs);

  let response;
  try {
    response = await fetch(buildHotmailLocalEndpoint(serviceSettings.localBaseUrl, '/code'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        clientId: account.clientId,
        refreshToken: account.refreshToken,
        mailboxes: HOTMAIL_MAILBOXES,
        top: 5,
        senderFilters: pollPayload.senderFilters || [],
        subjectFilters: pollPayload.subjectFilters || [],
        excludeCodes: pollPayload.excludeCodes || [],
        filterAfterTimestamp: Number(pollPayload.filterAfterTimestamp || 0) || 0,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Hotmail 本地助手请求超时（>${Math.round(requestTimeoutMs / 1000)} 秒）`);
    }
    throw new Error(`Hotmail 本地助手请求失败：${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok || payload?.ok === false) {
    const errorText = payload?.error || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(`Hotmail 本地助手返回失败：${errorText}`);
  }

  const normalizedMessage = payload?.message
    ? {
      ...normalizeHotmailMailApiMessages([payload.message])[0],
      mailbox: payload?.message?.mailbox || 'INBOX',
      receivedTimestamp: Number(payload?.message?.receivedTimestamp || 0) || 0,
    }
    : null;
  const nextAccount = applyHotmailApiResultToAccount(account, {
    nextRefreshToken: String(payload?.nextRefreshToken || '').trim(),
  });
  const savedAccount = await upsertHotmailAccount(nextAccount);
  return {
    account: savedAccount,
    code: String(payload?.code || ''),
    message: normalizedMessage,
    usedTimeFallback: Boolean(payload?.usedTimeFallback),
    selectionSource: String(payload?.selectionSource || ''),
  };
}

async function pollHotmailVerificationCodeViaLocalHelper(step, account, pollPayload = {}) {
  const maxAttempts = Number(pollPayload.maxAttempts) || 5;
  const intervalMs = Number(pollPayload.intervalMs) || 3000;
  let workingAccount = account;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfStopped();
    try {
      await addLog(`步骤 ${step}：正在通过本地助手轮询 Hotmail 验证码（${attempt}/${maxAttempts}）...`, 'info');
      const fetchResult = await requestHotmailLocalCode(workingAccount, pollPayload);
      workingAccount = fetchResult.account;

      if (fetchResult.code) {
        const mailboxLabel = fetchResult.message?.mailbox || 'INBOX';
        if (fetchResult.usedTimeFallback) {
          await addLog(`步骤 ${step}：本地助手使用时间回退后命中 Hotmail ${mailboxLabel} 验证码。`, 'warn');
        }
        await addLog(`步骤 ${step}：已通过本地助手在 Hotmail ${mailboxLabel} 中找到验证码：${fetchResult.code}`, 'ok');
        return {
          ok: true,
          code: fetchResult.code,
          emailTimestamp: fetchResult.message?.receivedTimestamp || Date.now(),
          mailId: fetchResult.message?.id || '',
        };
      }

      lastError = new Error(`步骤 ${step}：本地助手暂未返回匹配验证码（${attempt}/${maxAttempts}）。`);
      await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
    } catch (err) {
      lastError = err;
      await addLog(`步骤 ${step}：本地助手轮询 Hotmail 失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：本地助手未返回新的匹配验证码。`);
}

async function fetchHotmailMailboxMessages(account, mailboxes = HOTMAIL_MAILBOXES) {
  const serviceSettings = getHotmailServiceSettings(await getState());
  if (serviceSettings.mode === HOTMAIL_SERVICE_MODE_LOCAL) {
    return requestHotmailLocalMessages(account, mailboxes);
  }
  return fetchHotmailMailboxMessagesFromRemoteService(account, mailboxes);
}

async function verifyHotmailAccount(accountId) {
  const state = await getState();
  const account = findHotmailAccount(state.hotmailAccounts, accountId);
  if (!account) {
    throw new Error('未找到需要校验的 Hotmail 账号。');
  }

  const result = await fetchHotmailMailboxMessages(account, ['INBOX']);
  return {
    account: result.account,
    messageCount: result.mailboxResults[0]?.count || 0,
  };
}

async function testHotmailAccountMailAccess(accountId) {
  const state = await getState();
  const account = findHotmailAccount(state.hotmailAccounts, accountId);
  if (!account) {
    throw new Error('未找到需要测试的 Hotmail 账号。');
  }

  const result = await fetchHotmailMailboxMessages(account, HOTMAIL_MAILBOXES);
  const latestMessage = getLatestHotmailMessage(result.messages);
  const latestCode = latestMessage ? extractVerificationCodeFromMessage(latestMessage) : null;

  return {
    account: result.account,
    accountId: result.account.id,
    email: result.account.email,
    messageCount: result.messages.length,
    latestSubject: latestMessage?.subject || '',
    latestMailbox: latestMessage?.mailbox || '',
    latestCode: latestCode || '',
    inboxCount: result.mailboxResults.find((item) => item.mailbox === 'INBOX')?.count || 0,
    junkCount: result.mailboxResults.find((item) => item.mailbox === 'Junk')?.count || 0,
  };
}

async function pollHotmailVerificationCode(step, state, pollPayload = {}) {
  await addLog(`步骤 ${step}：正在确定 Hotmail 收信账号...`, 'info');
  let account = await ensureHotmailAccountForFlow({
    allowAllocate: true,
    markUsed: false,
    preferredAccountId: state.currentHotmailAccountId || null,
  });
  await addLog(`步骤 ${step}：当前使用 Hotmail 账号 ${account.email} 轮询收件箱。`, 'info');

  const serviceSettings = getHotmailServiceSettings(state);
  if (serviceSettings.mode === HOTMAIL_SERVICE_MODE_LOCAL) {
    return pollHotmailVerificationCodeViaLocalHelper(step, account, pollPayload);
  }

  const maxAttempts = Number(pollPayload.maxAttempts) || 5;
  const intervalMs = Number(pollPayload.intervalMs) || 3000;
  let lastError = null;

  function summarizeMessagesForLog(messages) {
    return (messages || [])
      .slice()
      .sort((left, right) => {
        const leftTime = Date.parse(left.receivedDateTime || '') || 0;
        const rightTime = Date.parse(right.receivedDateTime || '') || 0;
        return rightTime - leftTime;
      })
      .slice(0, 3)
      .map((message) => {
        const receivedAt = message?.receivedDateTime || '未知时间';
        const sender = message?.from?.emailAddress?.address || '未知发件人';
        const subject = message?.subject || '（无主题）';
        const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        return `[${message.mailbox || 'INBOX'}] ${receivedAt} | ${sender} | ${subject} | ${preview}`;
      })
      .join(' || ');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfStopped();
    try {
      await addLog(`步骤 ${step}：正在通过 API对接 轮询 Hotmail 邮件（${attempt}/${maxAttempts}）...`, 'info');
      const fetchResult = await fetchHotmailMailboxMessages(account, HOTMAIL_MAILBOXES);
      account = fetchResult.account;
      const matchResult = pickVerificationMessageWithTimeFallback(fetchResult.messages, {
        afterTimestamp: pollPayload.filterAfterTimestamp || 0,
        senderFilters: pollPayload.senderFilters || [],
        subjectFilters: pollPayload.subjectFilters || [],
        excludeCodes: pollPayload.excludeCodes || [],
      });
      const match = matchResult.match;

      if (match?.code) {
        const mailboxLabel = match.message?.mailbox || 'INBOX';
        if (matchResult.usedRelaxedFilters) {
          const fallbackLabel = matchResult.usedTimeFallback ? '宽松匹配 + 时间回退' : '宽松匹配';
          await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 Hotmail ${mailboxLabel} 验证码。`, 'warn');
        }
        await addLog(`步骤 ${step}：已通过 API对接 在 Hotmail ${mailboxLabel} 中找到验证码：${match.code}`, 'ok');
        return {
          ok: true,
          code: match.code,
          emailTimestamp: match.receivedAt || Date.now(),
          mailId: match.message?.id || '',
        };
      }

      lastError = new Error(`步骤 ${step}：暂未在 Hotmail 收件箱中找到匹配验证码（${attempt}/${maxAttempts}）。`);
      await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
      const mailSummary = summarizeMessagesForLog(fetchResult.messages);
      if (mailSummary) {
        await addLog(`步骤 ${step}：最近邮件样本：${mailSummary}`, 'info');
      }
    } catch (err) {
      lastError = err;
      await addLog(`步骤 ${step}：Hotmail API 对接轮询失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：未在 Hotmail 收件箱中找到新的匹配验证码。`);
}

function generateRandomSuffix(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < length; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return suffix;
}

const GMAIL_ALIAS_WORDS = [
  'amber', 'apple', 'ash', 'berry', 'birch', 'blue', 'brook', 'cedar',
  'cloud', 'clover', 'coast', 'cocoa', 'coral', 'dawn', 'delta', 'echo',
  'ember', 'field', 'flint', 'flora', 'forest', 'frost', 'glade', 'harbor',
  'hazel', 'honey', 'ivory', 'jade', 'lake', 'leaf', 'light', 'lilac',
  'lotus', 'lunar', 'maple', 'meadow', 'mist', 'moon', 'nova', 'oasis',
  'olive', 'opal', 'pearl', 'pine', 'pixel', 'plum', 'quartz', 'rain',
  'raven', 'river', 'rose', 'sage', 'shore', 'sky', 'solar', 'spark',
  'stone', 'storm', 'sun', 'terra', 'vale', 'wave', 'willow', 'zephyr',
];

function generateRandomWordAliasTag(parts = 3) {
  const selected = [];
  for (let i = 0; i < parts; i++) {
    selected.push(GMAIL_ALIAS_WORDS[Math.floor(Math.random() * GMAIL_ALIAS_WORDS.length)]);
  }
  return selected.join('');
}

function parseGmailBaseEmail(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^([^@\s+]+)@((?:gmail|googlemail)\.com)$/i);
  if (!match) return null;
  return {
    localPart: match[1],
    domain: match[2].toLowerCase(),
  };
}

function isGeneratedAliasProvider(stateOrProvider, mail2925Mode = undefined) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  if (provider === GMAIL_PROVIDER) {
    return true;
  }
  const resolvedMail2925Mode = mail2925Mode !== undefined
    ? normalizeMail2925Mode(mail2925Mode)
    : getMail2925Mode(stateOrProvider);
  return provider === '2925' && resolvedMail2925Mode === MAIL_2925_MODE_PROVIDE;
}

function shouldUseCustomRegistrationEmail(state = {}) {
  return isCustomMailProvider(state)
    || (!isHotmailProvider(state)
      && !isGeneratedAliasProvider(state)
      && normalizeEmailGenerator(state.emailGenerator) === 'custom');
}

function buildGeneratedAliasEmail(state) {
  const provider = state.mailProvider || '163';
  const emailPrefix = (state.emailPrefix || '').trim();

  if (provider === GMAIL_PROVIDER) {
    if (!emailPrefix) {
      throw new Error('Gmail 原邮箱未设置，请先在侧边栏填写。');
    }
    const parsed = parseGmailBaseEmail(emailPrefix);
    if (!parsed) {
      throw new Error('Gmail 原邮箱格式不正确，请填写类似 name@gmail.com 的地址。');
    }
    return `${parsed.localPart}+${generateRandomWordAliasTag()}@${parsed.domain}`;
  }

  if (!emailPrefix) {
    throw new Error('2925 邮箱前缀未设置，请先在侧边栏填写。');
  }

  if (provider === '2925' && isGeneratedAliasProvider(state)) {
    return `${emailPrefix}${generateRandomSuffix(6)}@2925.com`;
  }

  throw new Error(`未支持的别名邮箱类型：${provider}`);
}

function getLuckmailSessionConfig(state = {}) {
  return {
    apiKey: String(state.luckmailApiKey || ''),
    baseUrl: normalizeLuckmailBaseUrl(state.luckmailBaseUrl),
    emailType: normalizeLuckmailEmailType(state.luckmailEmailType),
    domain: String(state.luckmailDomain || '').trim(),
  };
}

function ensureLuckmailApiKey(state = {}) {
  const apiKey = String(state.luckmailApiKey || '').trim();
  if (!apiKey) {
    throw new Error('LuckMail API Key 为空，请先在侧边栏填写。');
  }
  return apiKey;
}

async function requestLuckmail(method, path, { baseUrl, apiKey, params, jsonData, timeout = 30000 } = {}) {
  const requestUrl = new URL(`${normalizeLuckmailBaseUrl(baseUrl)}${path}`);
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      requestUrl.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const headers = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const upperMethod = String(method || 'GET').toUpperCase();
  const fetchOptions = {
    method: upperMethod,
    headers,
    signal: controller.signal,
  };
  if (jsonData !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(jsonData || {});
  }

  let response = null;
  try {
    response = await fetch(requestUrl.toString(), fetchOptions);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`LuckMail 请求超时：${path}`);
    }
    throw new Error(`LuckMail 请求失败：${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`LuckMail 返回了无法解析的响应：${path}`);
  }

  if (!response.ok) {
    const errorText = String(payload?.message || response.statusText || 'HTTP error');
    throw new Error(`LuckMail 请求失败：${errorText}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(`LuckMail 返回数据无效：${path}`);
  }

  if (payload.code !== 0) {
    const errorText = String(payload.message || 'Unknown error');
    throw new Error(`LuckMail 接口返回失败：${errorText}`);
  }

  return payload.data;
}

function createLuckmailClient(state = {}) {
  const config = getLuckmailSessionConfig(state);
  const apiKey = ensureLuckmailApiKey(state);
  const request = (method, path, options = {}) => requestLuckmail(method, path, {
    baseUrl: config.baseUrl,
    apiKey,
    ...options,
  });

  return {
    user: {
      async purchaseEmails(projectCode, quantity, { emailType, domain } = {}) {
        const body = {
          project_code: projectCode,
          quantity,
          email_type: normalizeLuckmailEmailType(emailType),
        };
        if (domain) {
          body.domain = String(domain).trim();
        }
        return request('POST', '/api/v1/openapi/email/purchase', {
          jsonData: body,
        });
      },
      async getPurchases({ page = 1, pageSize = 100, projectId, tagId, keyword, userDisabled } = {}) {
        return normalizeLuckmailPurchaseListPage(await request('GET', '/api/v1/openapi/email/purchases', {
          params: {
            page,
            page_size: pageSize,
            project_id: projectId,
            tag_id: tagId,
            keyword,
            user_disabled: userDisabled,
          },
        }));
      },
      async getTokenCode(token) {
        return normalizeLuckmailTokenCode(await request(
          'GET',
          `/api/v1/openapi/email/token/${encodeURIComponent(token)}/code`
        ));
      },
      async checkTokenAlive(token) {
        const data = await request(
          'GET',
          `/api/v1/openapi/email/token/${encodeURIComponent(token)}/alive`
        );
        return {
          email_address: String(data?.email_address || ''),
          project: String(data?.project || ''),
          alive: Boolean(data?.alive),
          status: String(data?.status || ''),
          message: String(data?.message || ''),
          mail_count: Number(data?.mail_count) || 0,
        };
      },
      async getTokenMails(token) {
        const data = await request('GET', `/api/v1/openapi/email/token/${encodeURIComponent(token)}/mails`);
        return {
          email_address: String(data?.email_address || ''),
          project: String(data?.project || ''),
          warranty_until: String(data?.warranty_until || ''),
          mails: normalizeLuckmailTokenMails(data?.mails || []),
        };
      },
      async getTokenMailDetail(token, messageId) {
        return normalizeLuckmailTokenMail(await request(
          'GET',
          `/api/v1/openapi/email/token/${encodeURIComponent(token)}/mails/${encodeURIComponent(messageId)}`
        ));
      },
      async setPurchaseDisabled(purchaseId, disabled) {
        await request('PUT', `/api/v1/openapi/email/purchases/${encodeURIComponent(purchaseId)}/disabled`, {
          jsonData: {
            disabled: disabled ? 1 : 0,
          },
        });
      },
      async batchSetPurchaseDisabled(ids, disabled) {
        await request('POST', '/api/v1/openapi/email/purchases/batch-disabled', {
          jsonData: {
            ids: (Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
            disabled: disabled ? 1 : 0,
          },
        });
      },
      async setPurchaseTag(purchaseId, { tagId, tagName } = {}) {
        const body = {};
        if (tagId !== undefined) {
          body.tag_id = Number(tagId) || 0;
        }
        if (tagName !== undefined) {
          body.tag_name = String(tagName || '').trim();
        }
        await request('PUT', `/api/v1/openapi/email/purchases/${encodeURIComponent(purchaseId)}/tag`, {
          jsonData: body,
        });
      },
      async batchSetPurchaseTag(ids, { tagId, tagName } = {}) {
        const body = {
          ids: (Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
        };
        if (tagId !== undefined) {
          body.tag_id = Number(tagId) || 0;
        }
        if (tagName !== undefined) {
          body.tag_name = String(tagName || '').trim();
        }
        await request('POST', '/api/v1/openapi/email/purchases/batch-tag', {
          jsonData: body,
        });
      },
      async getTags() {
        return normalizeLuckmailTags(await request('GET', '/api/v1/openapi/email/tags'));
      },
      async createTag(name, limitType, remark) {
        const body = {
          name: String(name || '').trim(),
          limit_type: Number(limitType) || 0,
        };
        if (remark !== undefined) {
          body.remark = String(remark || '').trim();
        }
        return normalizeLuckmailTags([await request('POST', '/api/v1/openapi/email/tags', {
          jsonData: body,
        })])[0] || null;
      },
    },
  };
}

function getCurrentLuckmailPurchase(state = {}) {
  return state.currentLuckmailPurchase
    ? normalizeLuckmailPurchase(state.currentLuckmailPurchase)
    : null;
}

function buildLuckmailPurchaseView(purchase, state = {}) {
  const normalizedPurchase = normalizeLuckmailPurchase(purchase);
  const usedPurchases = getLuckmailUsedPurchases(state);
  const preserveTagInfo = getLuckmailPreserveTagInfo(state);

  return {
    id: normalizedPurchase.id,
    email_address: normalizedPurchase.email_address,
    project_name: normalizeLuckmailProjectName(normalizedPurchase.project_name) || DEFAULT_LUCKMAIL_PROJECT_CODE,
    price: normalizedPurchase.price,
    status: normalizedPurchase.status,
    tag_id: normalizedPurchase.tag_id,
    tag_name: normalizedPurchase.tag_name,
    user_disabled: normalizedPurchase.user_disabled,
    warranty_hours: normalizedPurchase.warranty_hours,
    warranty_until: normalizedPurchase.warranty_until,
    created_at: normalizedPurchase.created_at,
    used: Boolean(usedPurchases[normalizeLuckmailPurchaseId(normalizedPurchase.id)]),
    preserved: isLuckmailPurchasePreserved(normalizedPurchase, {
      preserveTagId: preserveTagInfo.id,
      preserveTagName: preserveTagInfo.name,
    }),
    disabled: normalizedPurchase.user_disabled === 1,
    current: Number(getCurrentLuckmailPurchase(state)?.id) === normalizedPurchase.id,
    reusable: isLuckmailPurchaseReusable(normalizedPurchase, {
      projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
      usedPurchases,
      preserveTagId: preserveTagInfo.id,
      preserveTagName: preserveTagInfo.name,
      now: Date.now(),
    }),
  };
}

async function getAllLuckmailPurchases(state, options = {}) {
  const client = options.client || createLuckmailClient(state);
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || 100));
  const maxPages = Math.max(1, Number(options.maxPages) || 50);
  const purchases = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageResult = await client.user.getPurchases({
      page,
      pageSize,
      keyword: options.keyword,
      projectId: options.projectId,
      tagId: options.tagId,
      userDisabled: options.userDisabled,
    });
    const normalizedPage = normalizeLuckmailPurchaseListPage(pageResult);
    purchases.push(...normalizedPage.list);

    if (normalizedPage.list.length === 0) {
      break;
    }
    if (normalizedPage.total > 0 && purchases.length >= normalizedPage.total) {
      break;
    }
    if (normalizedPage.list.length < normalizedPage.page_size) {
      break;
    }
  }

  return purchases;
}

async function listLuckmailPurchasesByProject(state, options = {}) {
  const projectCode = normalizeLuckmailProjectName(options.projectCode || DEFAULT_LUCKMAIL_PROJECT_CODE)
    || DEFAULT_LUCKMAIL_PROJECT_CODE;
  const purchases = await getAllLuckmailPurchases(state, options);
  return purchases.filter((purchase) => isLuckmailPurchaseForProject(purchase, projectCode));
}

async function getLuckmailPurchaseById(state, purchaseId, options = {}) {
  const normalizedPurchaseId = Number(normalizeLuckmailPurchaseId(purchaseId)) || 0;
  if (!normalizedPurchaseId) {
    throw new Error('LuckMail 邮箱 ID 无效。');
  }

  const purchases = await listLuckmailPurchasesByProject(state, options);
  const purchase = purchases.find((item) => item.id === normalizedPurchaseId) || null;
  if (!purchase) {
    throw new Error(`未找到 ID=${normalizedPurchaseId} 的 openai LuckMail 邮箱。`);
  }
  return purchase;
}

async function listLuckmailPurchasesForManagement() {
  const state = await getState();
  const purchases = await listLuckmailPurchasesByProject(state, {
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });
  return purchases.map((purchase) => buildLuckmailPurchaseView(purchase, state));
}

async function ensureLuckmailPreserveTag(client, state = null) {
  const resolvedState = state || await getState();
  const preserveTagInfo = getLuckmailPreserveTagInfo(resolvedState);
  if (preserveTagInfo.id > 0) {
    return preserveTagInfo;
  }

  const tags = normalizeLuckmailTags(await client.user.getTags());
  let preserveTag = tags.find(
    (tag) => normalizeLuckmailProjectName(tag.name) === normalizeLuckmailProjectName(preserveTagInfo.name)
  ) || null;

  if (!preserveTag) {
    preserveTag = await client.user.createTag(
      DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
      0,
      '保留邮箱（不参与自动复用）'
    );
  }

  await setLuckmailPreserveTagInfo(preserveTag);
  return {
    id: Number(preserveTag?.id) || 0,
    name: String(preserveTag?.name || '').trim() || DEFAULT_LUCKMAIL_PRESERVE_TAG_NAME,
  };
}

async function activateLuckmailPurchaseForFlow(state, client, purchase, options = {}) {
  const normalizedPurchase = normalizeLuckmailPurchase(purchase);
  if (!normalizedPurchase?.email_address || !normalizedPurchase?.token) {
    throw new Error('LuckMail 邮箱缺少 email/token，无法用于当前流程。');
  }

  let baselineCursor = null;
  if (options.initializeCursor !== false) {
    const mailList = await client.user.getTokenMails(normalizedPurchase.token);
    baselineCursor = buildLuckmailBaselineCursor(mailList?.mails || []);
  }

  await setLuckmailPurchaseState(normalizedPurchase);
  await setLuckmailMailCursorState(baselineCursor);
  await setEmailState(normalizedPurchase.email_address);

  if (options.logMessage) {
    await addLog(options.logMessage, options.logLevel || 'ok');
  }

  return normalizedPurchase;
}

async function findReusableLuckmailPurchaseForFlow(state, client) {
  const preserveTagInfo = getLuckmailPreserveTagInfo(state);
  const reusablePurchases = filterReusableLuckmailPurchases(
    await listLuckmailPurchasesByProject(state, {
      client,
      projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
    }),
    {
      projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
      usedPurchases: getLuckmailUsedPurchases(state),
      preserveTagId: preserveTagInfo.id,
      preserveTagName: preserveTagInfo.name,
      now: Date.now(),
    }
  );

  for (const candidate of reusablePurchases) {
    try {
      const aliveResult = await client.user.checkTokenAlive(candidate.token);
      if (!aliveResult?.alive) {
        await addLog(
          `LuckMail：跳过不可复用邮箱 ${candidate.email_address}：${aliveResult?.message || aliveResult?.status || 'token 不可用'}`,
          'warn'
        );
        continue;
      }
      return candidate;
    } catch (err) {
      await addLog(`LuckMail：检测复用邮箱 ${candidate.email_address} 失败：${err.message}`, 'warn');
    }
  }

  return null;
}

async function selectLuckmailPurchase(purchaseId) {
  const state = await ensureManualInteractionAllowed('切换 LuckMail 邮箱');
  const client = createLuckmailClient(state);
  const purchase = await getLuckmailPurchaseById(state, purchaseId, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });

  if (purchase.user_disabled === 1) {
    throw new Error(`LuckMail 邮箱 ${purchase.email_address} 已禁用，无法使用。`);
  }

  const aliveResult = await client.user.checkTokenAlive(purchase.token);
  if (!aliveResult?.alive) {
    throw new Error(`LuckMail 邮箱 ${purchase.email_address} 当前不可用：${aliveResult?.message || aliveResult?.status || 'token 已失效'}`);
  }

  const activatedPurchase = await activateLuckmailPurchaseForFlow(state, client, purchase, {
    initializeCursor: true,
    logMessage: `LuckMail：已切换当前邮箱为 ${purchase.email_address}`,
  });
  const nextState = await getState();
  return buildLuckmailPurchaseView(activatedPurchase, nextState);
}

async function setLuckmailPurchasePreservedState(purchaseId, preserved) {
  const state = await ensureManualInteractionAllowed('设置 LuckMail 邮箱保留状态');
  const client = createLuckmailClient(state);
  const purchase = await getLuckmailPurchaseById(state, purchaseId, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });

  if (preserved) {
    const preserveTag = await ensureLuckmailPreserveTag(client, state);
    await client.user.setPurchaseTag(purchase.id, { tagId: preserveTag.id });
  } else {
    await client.user.setPurchaseTag(purchase.id, { tagId: 0 });
  }

  await addLog(`LuckMail：已将 ${purchase.email_address} ${preserved ? '设为保留' : '取消保留'}`, 'ok');
  const refreshedState = await getState();
  const refreshedPurchase = await getLuckmailPurchaseById(refreshedState, purchase.id, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });
  return buildLuckmailPurchaseView(refreshedPurchase, await getState());
}

async function setLuckmailPurchaseDisabledState(purchaseId, disabled) {
  const state = await ensureManualInteractionAllowed(disabled ? '禁用 LuckMail 邮箱' : '启用 LuckMail 邮箱');
  const client = createLuckmailClient(state);
  const purchase = await getLuckmailPurchaseById(state, purchaseId, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });

  await client.user.setPurchaseDisabled(purchase.id, disabled ? 1 : 0);

  const currentPurchase = getCurrentLuckmailPurchase(await getState());
  if (disabled && currentPurchase?.id === purchase.id) {
    await clearLuckmailRuntimeState({ clearEmail: isLuckmailProvider(await getState()) });
  }

  await addLog(`LuckMail：已将 ${purchase.email_address} ${disabled ? '禁用' : '启用'}`, 'ok');
  const refreshedState = await getState();
  const refreshedPurchase = await getLuckmailPurchaseById(refreshedState, purchase.id, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });
  return buildLuckmailPurchaseView(refreshedPurchase, await getState());
}

async function batchUpdateLuckmailPurchases(input = {}) {
  const action = String(input.action || '').trim();
  const selectedIds = Array.isArray(input.ids)
    ? [...new Set(input.ids.map((id) => Number(normalizeLuckmailPurchaseId(id)) || 0).filter((id) => id > 0))]
    : [];
  if (!selectedIds.length) {
    throw new Error('请先选择至少一个 LuckMail 邮箱。');
  }

  const state = await ensureManualInteractionAllowed('批量更新 LuckMail 邮箱');
  const client = createLuckmailClient(state);
  const purchases = await listLuckmailPurchasesByProject(state, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });
  const purchaseMap = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const targetPurchases = selectedIds.map((id) => purchaseMap.get(id)).filter(Boolean);

  if (!targetPurchases.length) {
    throw new Error('未找到可批量处理的 openai LuckMail 邮箱。');
  }

  const targetIds = targetPurchases.map((purchase) => purchase.id);

  if (action === 'used' || action === 'unused') {
    const nextUsedState = getLuckmailUsedPurchases(state);
    targetIds.forEach((id) => {
      const key = normalizeLuckmailPurchaseId(id);
      if (!key) return;
      if (action === 'used') {
        nextUsedState[key] = true;
      } else {
        delete nextUsedState[key];
      }
    });
    await setLuckmailUsedPurchasesState(nextUsedState);
    await addLog(`LuckMail：已批量${action === 'used' ? '标记已用' : '标记未用'} ${targetIds.length} 个邮箱`, 'ok');
  } else if (action === 'preserve' || action === 'unpreserve') {
    if (action === 'preserve') {
      const preserveTag = await ensureLuckmailPreserveTag(client, state);
      await client.user.batchSetPurchaseTag(targetIds, { tagId: preserveTag.id });
    } else {
      await client.user.batchSetPurchaseTag(targetIds, { tagId: 0 });
    }
    await addLog(`LuckMail：已批量${action === 'preserve' ? '保留' : '取消保留'} ${targetIds.length} 个邮箱`, 'ok');
  } else if (action === 'disable' || action === 'enable') {
    await client.user.batchSetPurchaseDisabled(targetIds, action === 'disable' ? 1 : 0);
    const currentPurchase = getCurrentLuckmailPurchase(await getState());
    if (action === 'disable' && currentPurchase?.id && targetIds.includes(currentPurchase.id)) {
      await clearLuckmailRuntimeState({ clearEmail: isLuckmailProvider(await getState()) });
    }
    await addLog(`LuckMail：已批量${action === 'disable' ? '禁用' : '启用'} ${targetIds.length} 个邮箱`, 'ok');
  } else {
    throw new Error(`不支持的 LuckMail 批量操作：${action}`);
  }

  return {
    updatedIds: targetIds,
  };
}

async function disableUsedLuckmailPurchases() {
  const state = await ensureManualInteractionAllowed('禁用已用 LuckMail 邮箱');
  const usedPurchases = getLuckmailUsedPurchases(state);
  const preserveTagInfo = getLuckmailPreserveTagInfo(state);
  const client = createLuckmailClient(state);
  const purchases = await listLuckmailPurchasesByProject(state, {
    client,
    projectCode: DEFAULT_LUCKMAIL_PROJECT_CODE,
  });
  const targets = purchases.filter((purchase) => {
    const purchaseId = normalizeLuckmailPurchaseId(purchase.id);
    return Boolean(purchaseId && usedPurchases[purchaseId])
      && !isLuckmailPurchasePreserved(purchase, {
        preserveTagId: preserveTagInfo.id,
        preserveTagName: preserveTagInfo.name,
      })
      && purchase.user_disabled !== 1;
  });

  if (!targets.length) {
    return { disabledIds: [] };
  }

  const targetIds = targets.map((purchase) => purchase.id);
  await client.user.batchSetPurchaseDisabled(targetIds, 1);
  const currentPurchase = getCurrentLuckmailPurchase(await getState());
  if (currentPurchase?.id && targetIds.includes(currentPurchase.id)) {
    await clearLuckmailRuntimeState({ clearEmail: isLuckmailProvider(await getState()) });
  }
  await addLog(`LuckMail：已禁用 ${targetIds.length} 个本地已用邮箱`, 'ok');
  return { disabledIds: targetIds };
}

async function ensureLuckmailPurchaseForFlow(options = {}) {
  const { allowReuse = true } = options;
  const state = await getState();
  const existingPurchase = getCurrentLuckmailPurchase(state);
  if (allowReuse && existingPurchase?.email_address && existingPurchase?.token) {
    if (state.email !== existingPurchase.email_address) {
      await setEmailState(existingPurchase.email_address);
    }
    return existingPurchase;
  }

  const config = getLuckmailSessionConfig(state);
  const client = createLuckmailClient(state);
  if (allowReuse) {
    const reusablePurchase = await findReusableLuckmailPurchaseForFlow(state, client);
    if (reusablePurchase) {
      return activateLuckmailPurchaseForFlow(state, client, reusablePurchase, {
        initializeCursor: true,
        logMessage: `LuckMail：已复用 openai 邮箱 ${reusablePurchase.email_address}`,
      });
    }
  }

  const result = await client.user.purchaseEmails(DEFAULT_LUCKMAIL_PROJECT_CODE, 1, {
    emailType: config.emailType,
    domain: config.domain || undefined,
  });
  const purchases = normalizeLuckmailPurchases(result);
  const purchase = purchases[0] || null;
  if (!purchase?.email_address || !purchase?.token) {
    throw new Error('LuckMail 购邮成功，但未返回可用邮箱或 token。');
  }

  return activateLuckmailPurchaseForFlow(state, client, purchase, {
    initializeCursor: false,
    logMessage: `LuckMail：已购买邮箱 ${purchase.email_address}（类型：${config.emailType}，项目：${DEFAULT_LUCKMAIL_PROJECT_CODE}）`,
  });
}

async function resolveLuckmailVerificationMail(client, token, filters = {}, tokenCodeResult = null) {
  const tokenCode = tokenCodeResult ? normalizeLuckmailTokenCode(tokenCodeResult) : null;
  if (tokenCode?.mail) {
    const tokenMail = tokenCode.verification_code && !tokenCode.mail.verification_code
      ? {
        ...tokenCode.mail,
        verification_code: tokenCode.verification_code,
      }
      : tokenCode.mail;
    const inlineMatch = pickLuckmailVerificationMail([tokenMail], filters);
    if (inlineMatch) {
      return inlineMatch;
    }
  }

  const mailList = await client.user.getTokenMails(token);
  let match = pickLuckmailVerificationMail(mailList.mails, filters);
  if (match?.mail?.message_id && !match.mail.verification_code) {
    const detail = await client.user.getTokenMailDetail(token, match.mail.message_id);
    match = pickLuckmailVerificationMail([detail], filters);
  }
  return match || null;
}

async function pollLuckmailVerificationCode(step, state, pollPayload = {}) {
  const purchase = getCurrentLuckmailPurchase(state);
  if (!purchase?.token) {
    throw new Error('LuckMail 当前没有可用 token，请先执行步骤 3 购买邮箱。');
  }

  const client = createLuckmailClient(state);
  const maxAttempts = Math.max(1, Number(pollPayload.maxAttempts) || 5);
  const intervalMs = Math.max(1000, Number(pollPayload.intervalMs) || 3000);
  const filters = {
    afterTimestamp: pollPayload.filterAfterTimestamp || 0,
    senderFilters: pollPayload.senderFilters || [],
    subjectFilters: pollPayload.subjectFilters || [],
    excludeCodes: pollPayload.excludeCodes || [],
  };

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfStopped();
    await addLog(`步骤 ${step}：正在通过 LuckMail 轮询验证码（${attempt}/${maxAttempts}）...`, 'info');

    try {
      const tokenCode = await client.user.getTokenCode(purchase.token);
      const cursor = normalizeLuckmailMailCursor((await getState()).currentLuckmailMailCursor);
      if (tokenCode.verification_code && tokenCode.mail && !isLuckmailMailNewerThanCursor(tokenCode.mail, cursor)) {
        throw new Error(`步骤 ${step}：LuckMail 返回的最新邮件仍是旧验证码。`);
      }

      let match = null;
      if (tokenCode.has_new_mail || tokenCode.verification_code) {
        match = await resolveLuckmailVerificationMail(client, purchase.token, filters, tokenCode);
      }
      if (!match) {
        match = await resolveLuckmailVerificationMail(client, purchase.token, filters, null);
      }

      if (match?.mail) {
        const cursor = normalizeLuckmailMailCursor((await getState()).currentLuckmailMailCursor);
        if (!isLuckmailMailNewerThanCursor(match.mail, cursor)) {
          throw new Error(`步骤 ${step}：LuckMail 命中的邮件不是新邮件。`);
        }

        await setLuckmailMailCursorState(buildLuckmailMailCursor(match.mail));
        return {
          ok: true,
          code: match.code,
          emailTimestamp: normalizeLuckmailTimestamp(match.mail.received_at) || Date.now(),
          mailId: match.mail.message_id,
        };
      }

      lastError = new Error(`步骤 ${step}：暂未在 LuckMail 邮箱中找到新的匹配验证码。`);
    } catch (err) {
      if (isStopError(err)) {
        throw err;
      }
      lastError = err;
      await addLog(`步骤 ${step}：LuckMail 轮询失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：未在 LuckMail 邮箱中找到新的匹配验证码。`);
}

function summarizeCloudflareTempEmailMessagesForLog(messages) {
  return (messages || [])
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.receivedDateTime || '') || 0;
      const rightTime = Date.parse(right.receivedDateTime || '') || 0;
      return rightTime - leftTime;
    })
    .slice(0, 3)
    .map((message) => {
      const receivedAt = message?.receivedDateTime || '未知时间';
      const sender = message?.from?.emailAddress?.address || '未知发件人';
      const subject = message?.subject || '（无主题）';
      const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const address = message?.address || '未知地址';
      return `[${address}] ${receivedAt} | ${sender} | ${subject} | ${preview}`;
    })
    .join(' || ');
}

async function deleteCloudflareTempEmailMail(config, mailId) {
  const normalizedMailId = String(mailId || '').trim();
  if (!normalizedMailId) return false;

  await requestCloudflareTempEmailJson(config, `/admin/mails/${encodeURIComponent(normalizedMailId)}`, {
    method: 'DELETE',
  });
  return true;
}

async function listCloudflareTempEmailMessages(state, options = {}) {
  const config = ensureCloudflareTempEmailConfig(state, { requireAdminAuth: true });
  const address = normalizeCloudflareTempEmailAddress(options.address);
  const payload = await requestCloudflareTempEmailJson(config, '/admin/mails', {
    method: 'GET',
    searchParams: {
      limit: Number(options.limit) || CLOUDFLARE_TEMP_EMAIL_DEFAULT_PAGE_SIZE,
      offset: Number(options.offset) || 0,
      address,
    },
  });

  const messages = normalizeCloudflareTempEmailMailApiMessages(payload).filter((message) => {
    if (!address) return true;
    return !message.address || normalizeCloudflareTempEmailAddress(message.address) === address;
  });

  return { config, messages };
}

async function pollCloudflareTempEmailVerificationCode(step, state, pollPayload = {}) {
  const config = ensureCloudflareTempEmailConfig(state, { requireAdminAuth: true });
  const targetEmail = resolveCloudflareTempEmailPollTargetEmail(state, pollPayload, config);
  const registrationEmail = normalizeCloudflareTempEmailReceiveMailbox(state.email);
  if (!targetEmail) {
    throw new Error('Cloudflare Temp Email 轮询前缺少目标邮箱地址，请先填写注册邮箱或“邮件接收”邮箱。');
  }

  if (registrationEmail && registrationEmail !== targetEmail) {
    await addLog(`步骤 ${step}：正在轮询 Cloudflare Temp Email 收件邮箱（${targetEmail}），注册邮箱为 ${registrationEmail}...`, 'info');
  } else {
    await addLog(`步骤 ${step}：正在轮询 Cloudflare Temp Email 邮件（${targetEmail}）...`, 'info');
  }
  const maxAttempts = Number(pollPayload.maxAttempts) || 5;
  const intervalMs = Number(pollPayload.intervalMs) || 3000;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfStopped();
    try {
      const { messages } = await listCloudflareTempEmailMessages(state, {
        address: targetEmail,
        limit: pollPayload.limit || CLOUDFLARE_TEMP_EMAIL_DEFAULT_PAGE_SIZE,
        offset: pollPayload.offset || 0,
      });
      const matchResult = pickVerificationMessageWithTimeFallback(messages, {
        afterTimestamp: pollPayload.filterAfterTimestamp || 0,
        senderFilters: pollPayload.senderFilters || [],
        subjectFilters: pollPayload.subjectFilters || [],
        excludeCodes: pollPayload.excludeCodes || [],
      });
      const match = matchResult.match;

      if (match?.code) {
        if (matchResult.usedRelaxedFilters) {
          const fallbackLabel = matchResult.usedTimeFallback ? '宽松匹配 + 时间回退' : '宽松匹配';
          await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 Cloudflare Temp Email 验证码。`, 'warn');
        }
        try {
          await deleteCloudflareTempEmailMail(config, match.message?.id);
        } catch (err) {
          await addLog(`步骤 ${step}：删除 Cloudflare Temp Email 邮件失败：${err.message}`, 'warn');
        }
        return {
          ok: true,
          code: match.code,
          emailTimestamp: match.receivedAt || Date.now(),
          mailId: match.message?.id || '',
        };
      }

      lastError = new Error(`步骤 ${step}：暂未在 Cloudflare Temp Email 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
      await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
      const sample = summarizeCloudflareTempEmailMessagesForLog(messages);
      if (sample) {
        await addLog(`步骤 ${step}：最近邮件样本：${sample}`, 'info');
      }
    } catch (err) {
      lastError = err;
      await addLog(`步骤 ${step}：Cloudflare Temp Email 轮询失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：未在 Cloudflare Temp Email 中找到新的匹配验证码。`);
}

async function getOpenIcloudHostPreference() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        'https://www.icloud.com/*',
        'https://www.icloud.com.cn/*',
      ],
    });

    const activeTab = tabs.find((tab) => tab.active);
    const candidates = activeTab ? [activeTab, ...tabs.filter((tab) => tab.id !== activeTab.id)] : tabs;
    for (const tab of candidates) {
      try {
        const host = normalizeIcloudHost(new URL(tab.url).host);
        if (host) return host;
      } catch {}
    }
  } catch {}

  return '';
}

async function getPreferredIcloudLoginUrl(error = null, state = null) {
  const currentState = state || await getState();
  const configuredHost = getConfiguredIcloudHostPreference(currentState);
  if (configuredHost) {
    return getIcloudLoginUrlForHost(configuredHost);
  }

  const messageHint = getIcloudHostHintFromMessage(getErrorMessage(error));
  if (messageHint) {
    return getIcloudLoginUrlForHost(messageHint);
  }

  const savedHost = normalizeIcloudHost(currentState?.preferredIcloudHost);
  if (savedHost) {
    return getIcloudLoginUrlForHost(savedHost);
  }

  const openHost = await getOpenIcloudHostPreference();
  if (openHost) {
    return getIcloudLoginUrlForHost(openHost);
  }

  return ICLOUD_LOGIN_URLS[0];
}

async function getPreferredIcloudSetupUrls(state = null, error = null) {
  const preferredLoginUrl = await getPreferredIcloudLoginUrl(error, state);
  const preferredHost = normalizeIcloudHost(new URL(preferredLoginUrl).host);
  const preferredSetupUrl = getIcloudSetupUrlForHost(preferredHost);
  if (!preferredSetupUrl) {
    return [...ICLOUD_SETUP_URLS];
  }
  return [
    preferredSetupUrl,
    ...ICLOUD_SETUP_URLS.filter((url) => url !== preferredSetupUrl),
  ];
}

function isIcloudLoginRequiredError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('could not validate icloud session')
    || message.includes('hide my email service was unavailable')
    || /\bstatus (401|403|409|421)\b/.test(message);
}

let lastIcloudLoginPromptAt = 0;

async function openIcloudLoginPage(preferredUrl) {
  const tabs = await chrome.tabs.query({
    url: [
      'https://www.icloud.com/*',
      'https://www.icloud.com.cn/*',
    ],
  });
  const preferredHost = new URL(preferredUrl).host;
  const existing = tabs.find((tab) => {
    try {
      return new URL(tab.url).host === preferredHost;
    } catch {
      return false;
    }
  });

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.url !== preferredUrl) {
      await chrome.tabs.update(existing.id, { url: preferredUrl });
    }
    return existing.id;
  }

  const created = await chrome.tabs.create({ url: preferredUrl, active: true });
  return created.id;
}

async function promptIcloudLogin(error, actionLabel = 'iCloud 操作') {
  const now = Date.now();
  const preferredUrl = await getPreferredIcloudLoginUrl(error);
  const originalError = getErrorMessage(error);

  chrome.runtime.sendMessage({
    type: 'ICLOUD_LOGIN_REQUIRED',
    payload: {
      actionLabel,
      loginUrl: preferredUrl,
      message: '需要先登录 iCloud，我已经为你打开登录页。',
      detail: originalError,
    },
  }).catch(() => { });

  if (now - lastIcloudLoginPromptAt < 15000) {
    return;
  }
  lastIcloudLoginPromptAt = now;

  await addLog(`iCloud：${actionLabel}时需要登录，正在打开 ${new URL(preferredUrl).host} ...`, 'warn');

  try {
    await openIcloudLoginPage(preferredUrl);
  } catch (tabErr) {
    await addLog(`iCloud：自动打开登录页失败：${getErrorMessage(tabErr)}`, 'warn');
  }
}

async function withIcloudLoginHelp(actionLabel, action) {
  try {
    return await action();
  } catch (err) {
    if (isIcloudLoginRequiredError(err)) {
      await promptIcloudLogin(err, actionLabel);
      throw new Error('请先在新打开的 iCloud 页面中完成登录，再回来点击“我已登录”。');
    }
    throw err;
  }
}

async function icloudRequest(method, url, options = {}) {
  const { data } = options;
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (err) {
    throw new Error(`iCloud 请求失败：${method} ${url}，${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`iCloud 请求失败：${method} ${url}，status ${response.status}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error(`iCloud 返回的 JSON 无法解析：${method} ${url}，${err.message}`);
  }
}

async function validateIcloudSession(setupUrl) {
  const data = await icloudRequest('POST', `${setupUrl}/validate`);
  if (!data?.webservices?.premiummailsettings?.url) {
    throw new Error('Could not validate iCloud session. Hide My Email service was unavailable.');
  }
  return data;
}

async function resolveIcloudPremiumMailService() {
  const errors = [];
  const state = await getState();
  const setupUrls = await getPreferredIcloudSetupUrls(state);

  for (const setupUrl of setupUrls) {
    try {
      const data = await validateIcloudSession(setupUrl);
      const preferredIcloudHost = normalizeIcloudHost(new URL(setupUrl).host);
      if (preferredIcloudHost && preferredIcloudHost !== normalizeIcloudHost(state.preferredIcloudHost)) {
        await setState({ preferredIcloudHost });
      }
      return {
        setupUrl,
        serviceUrl: String(data.webservices.premiummailsettings.url || '').replace(/\/$/, ''),
      };
    } catch (err) {
      errors.push(`${new URL(setupUrl).host}: ${getErrorMessage(err)}`);
    }
  }

  throw new Error(errors.length
    ? `Could not validate iCloud session. ${errors.join(' | ')}`
    : 'Could not validate iCloud session. 请先在当前浏览器登录 icloud.com.cn 或 icloud.com。');
}

function getIcloudAliasLabel() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `MultiPage ${dateStr}`;
}

async function checkIcloudSession() {
  return withIcloudLoginHelp('检查 iCloud 会话', async () => {
    const { setupUrl } = await resolveIcloudPremiumMailService();
    await addLog(`iCloud：会话校验通过（${new URL(setupUrl).host}）`, 'ok');
    return { ok: true, setupUrl };
  });
}

async function listIcloudAliases() {
  return withIcloudLoginHelp('加载 iCloud 隐私邮箱列表', async () => {
    const { serviceUrl } = await resolveIcloudPremiumMailService();
    const response = await icloudRequest('GET', `${serviceUrl}/v2/hme/list`);
    const state = await getState();
    return normalizeIcloudAliasList(response, {
      usedEmails: getEffectiveUsedEmails(state),
      preservedEmails: getPreservedAliasMap(state),
    });
  });
}

async function deleteIcloudAlias(payload) {
  return withIcloudLoginHelp('删除 iCloud 隐私邮箱', async () => {
    const alias = typeof payload === 'string'
      ? { email: String(payload).trim().toLowerCase(), anonymousId: '' }
      : {
          email: String(payload?.email || '').trim().toLowerCase(),
          anonymousId: String(payload?.anonymousId || '').trim(),
        };

    if (!alias.email) {
      throw new Error('未提供需要删除的 iCloud 隐私邮箱。');
    }
    if (!alias.anonymousId) {
      throw new Error(`缺少 ${alias.email} 的 anonymousId，请先刷新 iCloud 别名列表。`);
    }

    const { serviceUrl } = await resolveIcloudPremiumMailService();

    try {
      const directDelete = await icloudRequest('POST', `${serviceUrl}/v1/hme/delete`, {
        data: { anonymousId: alias.anonymousId },
      });
      if (directDelete?.success === false) {
        throw new Error(directDelete?.error?.errorMessage || 'delete failed');
      }
    } catch (err) {
      await addLog(`iCloud：直接删除 ${alias.email} 失败，尝试先停用再删除...`, 'warn');

      const deactivated = await icloudRequest('POST', `${serviceUrl}/v1/hme/deactivate`, {
        data: { anonymousId: alias.anonymousId },
      });
      if (deactivated?.success === false) {
        throw new Error(deactivated?.error?.errorMessage || `停用 ${alias.email} 失败`);
      }

      const deleted = await icloudRequest('POST', `${serviceUrl}/v1/hme/delete`, {
        data: { anonymousId: alias.anonymousId },
      });
      if (deleted?.success === false) {
        throw new Error(deleted?.error?.errorMessage || `删除 ${alias.email} 失败`);
      }
    }

    const state = await getState();
    const manualAliasUsage = getManualAliasUsageMap(state);
    const preservedAliases = getPreservedAliasMap(state);
    delete manualAliasUsage[alias.email];
    delete preservedAliases[alias.email];
    await setState({ manualAliasUsage, preservedAliases });

    await addLog(`iCloud：已删除 ${alias.email}`, 'ok');
    broadcastIcloudAliasesChanged({ reason: 'deleted', email: alias.email });
    return { email: alias.email };
  });
}

async function deleteUsedIcloudAliases() {
  const aliases = await listIcloudAliases();
  const usedAliases = aliases.filter((alias) => alias.used);
  if (!usedAliases.length) {
    return { deleted: [], skipped: [] };
  }

  const deleted = [];
  const skipped = [];
  for (const alias of usedAliases) {
    if (alias.preserved) {
      skipped.push({ email: alias.email, error: 'preserved' });
      continue;
    }
    try {
      await deleteIcloudAlias(alias);
      deleted.push(alias.email);
    } catch (err) {
      skipped.push({ email: alias.email, error: getErrorMessage(err) });
    }
  }
  return { deleted, skipped };
}

async function fetchIcloudHideMyEmail() {
  return withIcloudLoginHelp('获取 iCloud 隐私邮箱', async () => {
    throwIfStopped();
    await addLog('iCloud：正在校验当前浏览器登录状态...', 'info');

    const { serviceUrl, setupUrl } = await resolveIcloudPremiumMailService();
    await addLog(`iCloud：已通过 ${new URL(setupUrl).host} 验证会话`, 'ok');

    const existingAliasesResponse = await icloudRequest('GET', `${serviceUrl}/v2/hme/list`);
    const state = await getState();
    const existingAliases = normalizeIcloudAliasList(existingAliasesResponse, {
      usedEmails: getEffectiveUsedEmails(state),
      preservedEmails: getPreservedAliasMap(state),
    });

    const reusableAlias = pickReusableIcloudAlias(existingAliases);
    if (reusableAlias) {
      await setEmailState(reusableAlias.email);
      await addLog(`iCloud：复用未使用别名 ${reusableAlias.email}`, 'ok');
      broadcastIcloudAliasesChanged({ reason: 'selected', email: reusableAlias.email });
      return reusableAlias.email;
    }

    await addLog('iCloud：没有可复用别名，开始生成新的 Hide My Email 地址...', 'warn');

    const generated = await icloudRequest('POST', `${serviceUrl}/v1/hme/generate`);
    if (!generated?.success || !generated?.result?.hme) {
      throw new Error(generated?.error?.errorMessage || 'iCloud 隐私邮箱生成失败。');
    }

    const reserved = await icloudRequest('POST', `${serviceUrl}/v1/hme/reserve`, {
      data: {
        hme: generated.result.hme,
        label: getIcloudAliasLabel(),
        note: 'Generated through Multi-Page Automation',
      },
    });

    if (!reserved?.success || !reserved?.result?.hme?.hme) {
      throw new Error(reserved?.error?.errorMessage || 'iCloud 隐私邮箱保留失败。');
    }

    const alias = String(reserved.result.hme.hme || '').trim().toLowerCase();
    await setEmailState(alias);
    await addLog(`iCloud：已创建并保留新别名 ${alias}`, 'ok');
    broadcastIcloudAliasesChanged({ reason: 'created', email: alias });
    return alias;
  });
}

async function finalizeIcloudAliasAfterSuccessfulFlow(state) {
  const email = String(state?.email || '').trim().toLowerCase();
  if (!email) {
    return { handled: false, deleted: false };
  }

  const knownIcloudAlias = normalizeEmailGenerator(state?.emailGenerator) === 'icloud'
    || Object.prototype.hasOwnProperty.call(getManualAliasUsageMap(state), email)
    || Object.prototype.hasOwnProperty.call(getPreservedAliasMap(state), email);
  if (!knownIcloudAlias) {
    return { handled: false, deleted: false };
  }

  await setIcloudAliasUsedState({ email, used: true }, { silentLog: true });
  await addLog(`iCloud：流程成功后已标记 ${email} 为已用。`, 'ok');

  if (!state.autoDeleteUsedIcloudAlias) {
    return { handled: true, deleted: false };
  }

  if (isAliasPreserved(state, email)) {
    await addLog(`iCloud：${email} 已被标记为保留，跳过自动删除。`, 'info');
    return { handled: true, deleted: false };
  }

  try {
    const aliases = await listIcloudAliases();
    const alias = findIcloudAliasByEmail(aliases, email);
    if (!alias) {
      await addLog(`iCloud：自动删除跳过，列表中未找到 ${email}。`, 'warn');
      return { handled: true, deleted: false };
    }
    if (alias.preserved) {
      await addLog(`iCloud：${email} 在最新别名列表中已是保留状态，跳过自动删除。`, 'info');
      return { handled: true, deleted: false };
    }
    if (!alias.anonymousId) {
      await addLog(`iCloud：自动删除跳过，${email} 缺少 anonymousId，请先刷新列表后重试。`, 'warn');
      return { handled: true, deleted: false };
    }
    await deleteIcloudAlias(alias);
    await addLog(`iCloud：流程成功后已自动删除 ${email}。`, 'ok');
    return { handled: true, deleted: true };
  } catch (err) {
    await addLog(`iCloud：自动删除 ${email} 失败：${getErrorMessage(err)}`, 'warn');
    return { handled: true, deleted: false };
  }
}

// ============================================================
// Tab Registry
// ============================================================

async function getTabRegistry() {
  const state = await getState();
  return state.tabRegistry || {};
}

async function registerTab(source, tabId) {
  const registry = await getTabRegistry();
  registry[source] = { tabId, ready: true };
  await setState({ tabRegistry: registry });
  console.log(LOG_PREFIX, `Tab registered: ${source} -> ${tabId}`);
}

async function isTabAlive(source) {
  const registry = await getTabRegistry();
  const entry = registry[source];
  if (!entry) return false;
  try {
    await chrome.tabs.get(entry.tabId);
    return true;
  } catch {
    // Tab no longer exists — clean up registry
    registry[source] = null;
    await setState({ tabRegistry: registry });
    return false;
  }
}

async function getTabId(source) {
  const registry = await getTabRegistry();
  return registry[source]?.tabId || null;
}

function parseUrlSafely(rawUrl) {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function normalizeSub2ApiUrl(rawUrl) {
  const input = (rawUrl || '').trim() || DEFAULT_SUB2API_URL;
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const parsed = new URL(withProtocol);
  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = '/admin/accounts';
  }
  parsed.hash = '';
  return parsed.toString();
}

function getPanelMode(state = {}) {
  return state.panelMode === 'sub2api' ? 'sub2api' : 'cpa';
}

function getPanelModeLabel(modeOrState) {
  const mode = typeof modeOrState === 'string' ? modeOrState : getPanelMode(modeOrState);
  return mode === 'sub2api' ? 'SUB2API' : 'CPA';
}

function isSignupPageHost(hostname = '') {
  return ['auth0.openai.com', 'auth.openai.com', 'accounts.openai.com'].includes(hostname);
}

function isSignupPasswordPageUrl(rawUrl) {
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  return isSignupPageHost(parsed.hostname)
    && /\/create-account\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
}

function is163MailHost(hostname = '') {
  return hostname === 'mail.163.com'
    || hostname.endsWith('.mail.163.com')
    || hostname === 'webmail.vip.163.com';
}

function isLocalhostOAuthCallbackUrl(rawUrl) {
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) return false;
  if (!['/auth/callback', '/codex/callback'].includes(parsed.pathname)) return false;

  const code = (parsed.searchParams.get('code') || '').trim();
  const state = (parsed.searchParams.get('state') || '').trim();
  return Boolean(code && state);
}

function isLocalCpaUrl(rawUrl) {
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  return ['localhost', '127.0.0.1'].includes(parsed.hostname);
}

function shouldBypassStep9ForLocalCpa(state) {
  return normalizeLocalCpaStep9Mode(state?.localCpaStep9Mode) === 'bypass'
    && Boolean(state?.localhostUrl)
    && isLocalCpaUrl(state?.vpsUrl);
}

function shouldSkipLoginVerificationForCpaCallback(state) {
  return getPanelMode(state) === 'cpa'
    && normalizeCpaCallbackMode(state?.cpaCallbackMode) === 'step6';
}

function matchesSourceUrlFamily(source, candidateUrl, referenceUrl) {
  const candidate = parseUrlSafely(candidateUrl);
  if (!candidate) return false;

  const reference = parseUrlSafely(referenceUrl);

  switch (source) {
    case 'signup-page':
      return isSignupPageHost(candidate.hostname);
    case 'duck-mail':
      return candidate.hostname === 'duckduckgo.com' && candidate.pathname.startsWith('/email/');
    case 'qq-mail':
      return candidate.hostname === 'mail.qq.com' || candidate.hostname === 'wx.mail.qq.com';
    case 'mail-163':
      return is163MailHost(candidate.hostname);
    case 'gmail-mail':
      return candidate.hostname === 'mail.google.com';
    case 'inbucket-mail':
      return Boolean(reference)
        && candidate.origin === reference.origin
        && candidate.pathname.startsWith('/m/');
    case 'mail-2925':
      return candidate.hostname === '2925.com' || candidate.hostname === 'www.2925.com';
    case 'vps-panel':
      return Boolean(reference)
        && candidate.origin === reference.origin
        && candidate.pathname === reference.pathname;
    case 'sub2api-panel':
      return Boolean(reference)
        && candidate.origin === reference.origin
        && (
          candidate.pathname.startsWith('/admin/accounts')
          || candidate.pathname.startsWith('/login')
          || candidate.pathname === '/'
        );
    default:
      return false;
  }
}

async function rememberSourceLastUrl(source, url) {
  if (!source || !url) return;
  const state = await getState();
  const sourceLastUrls = { ...(state.sourceLastUrls || {}) };
  sourceLastUrls[source] = url;
  await setState({ sourceLastUrls });
}

async function closeConflictingTabsForSource(source, currentUrl, options = {}) {
  const { excludeTabIds = [] } = options;
  const excluded = new Set(excludeTabIds.filter(id => Number.isInteger(id)));
  const state = await getState();
  const lastUrl = state.sourceLastUrls?.[source];
  const referenceUrls = [currentUrl, lastUrl].filter(Boolean);

  if (!referenceUrls.length) return;

  const tabs = await chrome.tabs.query({});
  const matchedIds = tabs
    .filter((tab) => Number.isInteger(tab.id) && !excluded.has(tab.id))
    .filter((tab) => referenceUrls.some((refUrl) => matchesSourceUrlFamily(source, tab.url, refUrl)))
    .map(tab => tab.id);

  if (!matchedIds.length) return;

  await chrome.tabs.remove(matchedIds).catch(() => { });

  const registry = await getTabRegistry();
  if (registry[source]?.tabId && matchedIds.includes(registry[source].tabId)) {
    registry[source] = null;
    await setState({ tabRegistry: registry });
  }

  await addLog(`已关闭 ${matchedIds.length} 个旧的${getSourceLabel(source)}标签页。`, 'info');
}

function isLocalhostOAuthCallbackTabMatch(callbackUrl, candidateUrl) {
  if (!isLocalhostOAuthCallbackUrl(callbackUrl) || !isLocalhostOAuthCallbackUrl(candidateUrl)) {
    return false;
  }

  const callback = parseUrlSafely(callbackUrl);
  const candidate = parseUrlSafely(candidateUrl);
  if (!callback || !candidate) return false;

  return callback.origin === candidate.origin
    && callback.pathname === candidate.pathname
    && callback.searchParams.get('code') === candidate.searchParams.get('code')
    && callback.searchParams.get('state') === candidate.searchParams.get('state');
}

async function closeLocalhostCallbackTabs(callbackUrl, options = {}) {
  if (!isLocalhostOAuthCallbackUrl(callbackUrl)) return 0;

  const { excludeTabIds = [] } = options;
  const excluded = new Set(excludeTabIds.filter(id => Number.isInteger(id)));
  const tabs = await chrome.tabs.query({});
  const matchedIds = tabs
    .filter((tab) => Number.isInteger(tab.id) && !excluded.has(tab.id))
    .filter((tab) => isLocalhostOAuthCallbackTabMatch(callbackUrl, tab.url))
    .map((tab) => tab.id);

  if (!matchedIds.length) return 0;

  await chrome.tabs.remove(matchedIds).catch(() => { });

  const registry = await getTabRegistry();
  if (registry['signup-page']?.tabId && matchedIds.includes(registry['signup-page'].tabId)) {
    registry['signup-page'] = null;
    await setState({ tabRegistry: registry });
  }

  await addLog(`已关闭 ${matchedIds.length} 个匹配当前 OAuth callback 的 localhost 残留标签页。`, 'info');
  return matchedIds.length;
}

function buildLocalhostCleanupPrefix(rawUrl) {
  if (!isLocalhostOAuthCallbackUrl(rawUrl)) return '';
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return '';

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return parsed.origin;
  }

  return `${parsed.origin}/${segments[0]}`;
}

async function closeTabsByUrlPrefix(prefix, options = {}) {
  if (!prefix) return 0;

  const { excludeTabIds = [], excludeUrls = [], excludeLocalhostCallbacks = false } = options;
  const excluded = new Set(excludeTabIds.filter(id => Number.isInteger(id)));
  const excludedUrls = new Set((Array.isArray(excludeUrls) ? excludeUrls : []).filter(Boolean));
  const tabs = await chrome.tabs.query({});
  const matchedIds = tabs
    .filter((tab) => Number.isInteger(tab.id) && !excluded.has(tab.id))
    .filter((tab) => typeof tab.url === 'string' && !excludedUrls.has(tab.url))
    .filter((tab) => !(excludeLocalhostCallbacks && isLocalhostOAuthCallbackUrl(tab.url)))
    .filter((tab) => typeof tab.url === 'string' && tab.url.startsWith(prefix))
    .filter((tab) => !isLocalhostOAuthCallbackUrl(tab.url))
    .map((tab) => tab.id);

  if (!matchedIds.length) return 0;

  await chrome.tabs.remove(matchedIds).catch(() => { });
  await addLog(`已关闭 ${matchedIds.length} 个匹配 ${prefix} 的 localhost 残留标签页。`, 'info');
  return matchedIds.length;
}

async function pingContentScriptOnTab(tabId) {
  if (!Number.isInteger(tabId)) return null;

  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: 'PING',
      source: 'background',
      payload: {},
    });
  } catch {
    return null;
  }
}

async function waitForTabUrlFamily(source, tabId, referenceUrl, options = {}) {
  const { timeoutMs = 15000, retryDelayMs = 400 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (matchesSourceUrlFamily(source, tab.url, referenceUrl)) {
        return tab;
      }
    } catch {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return null;
}

async function waitForTabUrlMatch(tabId, matcher, options = {}) {
  const { timeoutMs = 15000, retryDelayMs = 400 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (matcher(tab.url || '', tab)) {
        return tab;
      }
    } catch {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return null;
}

async function ensureContentScriptReadyOnTab(source, tabId, options = {}) {
  const {
    inject = null,
    injectSource = null,
    timeoutMs = 30000,
    retryDelayMs = 700,
    logMessage = '',
  } = options;

  const start = Date.now();
  let lastError = null;
  let logged = false;
  let attempt = 0;

  console.log(
    LOG_PREFIX,
    `[ensureContentScriptReadyOnTab] start ${source} tab=${tabId}, timeout=${timeoutMs}ms, inject=${Array.isArray(inject) ? inject.join(',') : 'none'}`
  );

  while (Date.now() - start < timeoutMs) {
    attempt += 1;
    const pong = await pingContentScriptOnTab(tabId);
    if (pong?.ok && (!pong.source || pong.source === source)) {
      console.log(
        LOG_PREFIX,
        `[ensureContentScriptReadyOnTab] ready ${source} tab=${tabId} on attempt ${attempt} after ${Date.now() - start}ms`
      );
      await registerTab(source, tabId);
      return;
    }

    if (!inject || !inject.length) {
      throw new Error(`${getSourceLabel(source)} 内容脚本未就绪，且未提供可用的注入文件。`);
    }

    const registry = await getTabRegistry();
    if (registry[source]) {
      registry[source].ready = false;
      await setState({ tabRegistry: registry });
    }

    try {
      if (injectSource) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (injectedSource) => {
            window.__MULTIPAGE_SOURCE = injectedSource;
          },
          args: [injectSource],
        });
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: inject,
      });
    } catch (err) {
      lastError = err;
      console.warn(
        LOG_PREFIX,
        `[ensureContentScriptReadyOnTab] inject attempt ${attempt} failed for ${source} tab=${tabId}: ${err?.message || err}`
      );
    }

    const pongAfterInject = await pingContentScriptOnTab(tabId);
    if (pongAfterInject?.ok && (!pongAfterInject.source || pongAfterInject.source === source)) {
      console.log(
        LOG_PREFIX,
        `[ensureContentScriptReadyOnTab] ready after inject ${source} tab=${tabId} on attempt ${attempt} after ${Date.now() - start}ms`
      );
      await registerTab(source, tabId);
      return;
    }

    if (logMessage && !logged) {
      console.warn(
        LOG_PREFIX,
        `[ensureContentScriptReadyOnTab] ${source} tab=${tabId} still not ready after ${Date.now() - start}ms`
      );
      await addLog(logMessage, 'warn');
      logged = true;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  throw lastError || new Error(`${getSourceLabel(source)} 内容脚本长时间未就绪。`);
}

// ============================================================
// Command Queue (for content scripts not yet ready)
// ============================================================

const pendingCommands = new Map(); // source -> { message, resolve, reject, timer }

function getContentScriptResponseTimeoutMs(message) {
  if (!message || typeof message !== 'object') {
    return 30000;
  }

  if (message.type === 'EXECUTE_STEP' && Number(message.step) === 6) {
    return 75000;
  }

  if (message.type === 'POLL_EMAIL') {
    const maxAttempts = Math.max(1, Number(message.payload?.maxAttempts) || 1);
    const intervalMs = Math.max(0, Number(message.payload?.intervalMs) || 0);
    return Math.max(45000, maxAttempts * intervalMs + 25000);
  }

  if (message.type === 'FILL_CODE') {
    return Number(message.step) === 7 ? 45000 : 30000;
  }

  if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
    return 45000;
  }

  return 30000;
}

function getMessageDebugLabel(source, message, tabId = null) {
  const parts = [source || 'unknown', message?.type || 'UNKNOWN'];
  if (Number.isInteger(message?.step)) {
    parts.push(`step=${message.step}`);
  }
  if (Number.isInteger(tabId)) {
    parts.push(`tab=${tabId}`);
  }
  return parts.join(' ');
}

function summarizeMessageResultForDebug(result) {
  if (result === undefined) return 'undefined';
  if (result === null) return 'null';
  if (typeof result !== 'object') return JSON.stringify(result);

  const summary = {};
  for (const key of ['ok', 'error', 'stopped', 'source', 'step']) {
    if (key in result) summary[key] = result[key];
  }
  if (result.payload && typeof result.payload === 'object') {
    summary.payloadKeys = Object.keys(result.payload);
  }
  return JSON.stringify(summary);
}

function sendTabMessageWithTimeout(tabId, source, message, responseTimeoutMs = getContentScriptResponseTimeoutMs(message)) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();
    const debugLabel = getMessageDebugLabel(source, message, tabId);

    console.log(LOG_PREFIX, `[sendTabMessageWithTimeout] dispatch ${debugLabel}, timeout=${responseTimeoutMs}ms`);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const seconds = Math.ceil(responseTimeoutMs / 1000);
      console.warn(LOG_PREFIX, `[sendTabMessageWithTimeout] timeout ${debugLabel} after ${Date.now() - startedAt}ms`);
      reject(new Error(`Content script on ${source} did not respond in ${seconds}s. Try refreshing the tab and retry.`));
    }, responseTimeoutMs);

    chrome.tabs.sendMessage(tabId, message)
      .then((value) => {
        const elapsed = Date.now() - startedAt;
        if (settled) {
          console.warn(
            LOG_PREFIX,
            `[sendTabMessageWithTimeout] late response ignored for ${debugLabel} after ${elapsed}ms: ${summarizeMessageResultForDebug(value)}`
          );
          return;
        }

        settled = true;
        clearTimeout(timer);
        console.log(
          LOG_PREFIX,
          `[sendTabMessageWithTimeout] response ${debugLabel} after ${elapsed}ms: ${summarizeMessageResultForDebug(value)}`
        );
        resolve(value);
      })
      .catch((error) => {
        const elapsed = Date.now() - startedAt;
        const errorMessage = error?.message || String(error);
        if (settled) {
          console.warn(
            LOG_PREFIX,
            `[sendTabMessageWithTimeout] late rejection ignored for ${debugLabel} after ${elapsed}ms: ${errorMessage}`
          );
          return;
        }

        settled = true;
        clearTimeout(timer);
        console.warn(
          LOG_PREFIX,
          `[sendTabMessageWithTimeout] rejection ${debugLabel} after ${elapsed}ms: ${errorMessage}`
        );
        reject(error);
      });
  });
}

function queueCommand(source, message, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(source);
      const err = `Content script on ${source} did not respond in ${timeout / 1000}s. Try refreshing the tab and retry.`;
      console.error(LOG_PREFIX, err);
      reject(new Error(err));
    }, timeout);
    pendingCommands.set(source, { message, resolve, reject, timer });
    console.log(LOG_PREFIX, `Command queued for ${source} (waiting for ready)`);
  });
}

function flushCommand(source, tabId) {
  const pending = pendingCommands.get(source);
  if (pending) {
    clearTimeout(pending.timer);
    pendingCommands.delete(source);
    sendTabMessageWithTimeout(tabId, source, pending.message).then(pending.resolve).catch(pending.reject);
    console.log(LOG_PREFIX, `Flushed queued command to ${source} (tab ${tabId})`);
  }
}

function cancelPendingCommands(reason = STOP_ERROR_MESSAGE) {
  for (const [source, pending] of pendingCommands.entries()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    pendingCommands.delete(source);
    console.log(LOG_PREFIX, `Cancelled queued command for ${source}`);
  }
}

// ============================================================
// Reuse or create tab
// ============================================================

async function reuseOrCreateTab(source, url, options = {}) {
  const alive = await isTabAlive(source);
  if (alive) {
    const tabId = await getTabId(source);
    await closeConflictingTabsForSource(source, url, { excludeTabIds: [tabId] });
    const currentTab = await chrome.tabs.get(tabId);
    const sameUrl = currentTab.url === url;
    const shouldReloadOnReuse = sameUrl && options.reloadIfSameUrl;

    const registry = await getTabRegistry();
    if (sameUrl) {
      await chrome.tabs.update(tabId, { active: true });
      console.log(LOG_PREFIX, `Reused tab ${source} (${tabId}) on same URL`);

      if (shouldReloadOnReuse) {
        if (registry[source]) registry[source].ready = false;
        await setState({ tabRegistry: registry });
        await chrome.tabs.reload(tabId);

        await new Promise((resolve) => {
          const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
          const listener = (tid, info) => {
            if (tid === tabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timer);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      }

      // For dynamically injected pages like the VPS panel, re-inject immediately.
      if (options.inject) {
        if (registry[source]) registry[source].ready = false;
        await setState({ tabRegistry: registry });
        if (options.injectSource) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (injectedSource) => {
              window.__MULTIPAGE_SOURCE = injectedSource;
            },
            args: [options.injectSource],
          });
        }
        await chrome.scripting.executeScript({
          target: { tabId },
          files: options.inject,
        });
        await new Promise(r => setTimeout(r, 500));
      }

      await rememberSourceLastUrl(source, url);
      return tabId;
    }

    // Mark as not ready BEFORE navigating — so READY signal from new page is captured correctly
    if (registry[source]) registry[source].ready = false;
    await setState({ tabRegistry: registry });

    // Navigate existing tab to new URL
    await chrome.tabs.update(tabId, { url, active: true });
    console.log(LOG_PREFIX, `Reused tab ${source} (${tabId}), navigated to ${url.slice(0, 60)}`);

    // Wait for page load complete (with 30s timeout)
    await new Promise((resolve) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
      const listener = (tid, info) => {
        if (tid === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // If dynamic injection needed (VPS panel), re-inject after navigation
    if (options.inject) {
      if (options.injectSource) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (injectedSource) => {
            window.__MULTIPAGE_SOURCE = injectedSource;
          },
          args: [options.injectSource],
        });
      }
      await chrome.scripting.executeScript({
        target: { tabId },
        files: options.inject,
      });
    }

    // Wait a bit for content script to inject and send READY
    await new Promise(r => setTimeout(r, 500));

    await rememberSourceLastUrl(source, url);
    return tabId;
  }

  // Create new tab
  await closeConflictingTabsForSource(source, url);
  const tab = await chrome.tabs.create({ url, active: true });
  console.log(LOG_PREFIX, `Created new tab ${source} (${tab.id})`);

  // If dynamic injection needed (VPS panel), inject scripts after load
  if (options.inject) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    if (options.injectSource) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (injectedSource) => {
          window.__MULTIPAGE_SOURCE = injectedSource;
        },
        args: [options.injectSource],
      });
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: options.inject,
    });
  }

  await rememberSourceLastUrl(source, url);
  return tab.id;
}

// ============================================================
// Send command to content script (with readiness check)
// ============================================================

async function sendToContentScript(source, message, options = {}) {
  throwIfStopped();
  const { responseTimeoutMs = getContentScriptResponseTimeoutMs(message) } = options;
  const registry = await getTabRegistry();
  const entry = registry[source];

  if (!entry || !entry.ready) {
    throwIfStopped();
    console.log(LOG_PREFIX, `${source} not ready, queuing command`);
    return queueCommand(source, message);
  }

  // Verify tab is still alive
  const alive = await isTabAlive(source);
  throwIfStopped();
  if (!alive) {
    // Tab was closed — queue the command, it will be sent when tab is reopened
    console.log(LOG_PREFIX, `${source} tab was closed, queuing command`);
    return queueCommand(source, message);
  }

  throwIfStopped();
  console.log(LOG_PREFIX, `Sending to ${source} (tab ${entry.tabId}):`, message.type);
  return sendTabMessageWithTimeout(entry.tabId, source, message, responseTimeoutMs);
}

async function sendToContentScriptResilient(source, message, options = {}) {
  const { timeoutMs = 30000, retryDelayMs = 600, logMessage = '' } = options;
  const start = Date.now();
  let lastError = null;
  let logged = false;
  let attempt = 0;
  const debugLabel = getMessageDebugLabel(source, message);

  console.log(
    LOG_PREFIX,
    `[sendToContentScriptResilient] start ${debugLabel}, totalTimeout=${timeoutMs}ms, retryDelay=${retryDelayMs}ms`
  );

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();
    attempt += 1;

    try {
      console.log(
        LOG_PREFIX,
        `[sendToContentScriptResilient] attempt ${attempt} -> ${debugLabel}, elapsed=${Date.now() - start}ms`
      );
      const result = await sendToContentScript(source, message);
      console.log(
        LOG_PREFIX,
        `[sendToContentScriptResilient] success ${debugLabel} on attempt ${attempt} after ${Date.now() - start}ms`
      );
      return result;
    } catch (err) {
      const retryable = isRetryableContentScriptTransportError(err);
      console.warn(
        LOG_PREFIX,
        `[sendToContentScriptResilient] attempt ${attempt} failed for ${debugLabel}, retryable=${retryable}, elapsed=${Date.now() - start}ms: ${err?.message || err}`
      );
      if (!retryable) {
        throw err;
      }

      lastError = err;
      if (logMessage && !logged) {
        await addLog(logMessage, 'warn');
        logged = true;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError || new Error(`等待 ${getSourceLabel(source)} 重新就绪超时。`);
}

async function sendToMailContentScriptResilient(mail, message, options = {}) {
  const { timeoutMs = 45000, maxRecoveryAttempts = 2 } = options;
  const start = Date.now();
  let lastError = null;
  let recoveries = 0;
  let logged = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();

    try {
      return await sendToContentScript(mail.source, message);
    } catch (err) {
      if (!isRetryableContentScriptTransportError(err)) {
        throw err;
      }

      lastError = err;
      if (!logged) {
        await addLog(`步骤 ${message.step}：${mail.label} 页面通信异常，正在尝试让邮箱页重新就绪...`, 'warn');
        logged = true;
      }

      if (recoveries >= maxRecoveryAttempts) {
        break;
      }

      recoveries += 1;
      await reuseOrCreateTab(mail.source, mail.url, {
        inject: mail.inject,
        injectSource: mail.injectSource,
        reloadIfSameUrl: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  throw lastError || new Error(`${mail.label} 页面未能重新就绪。`);
}

// ============================================================
// Logging
// ============================================================

async function addLog(message, level = 'info') {
  const state = await getState();
  const logs = state.logs || [];
  const entry = { message, level, timestamp: Date.now() };
  logs.push(entry);
  // Keep last 500 logs
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  await setState({ logs });
  // Broadcast to side panel
  chrome.runtime.sendMessage({ type: 'LOG_ENTRY', payload: entry }).catch(() => { });
}

function getStep8CallbackUrlFromNavigation(details, signupTabId) {
  if (!Number.isInteger(signupTabId) || !details) return '';
  if (details.tabId !== signupTabId) return '';
  if (details.frameId !== 0) return '';
  return isLocalhostOAuthCallbackUrl(details.url) ? details.url : '';
}

function getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId) {
  if (!Number.isInteger(signupTabId) || tabId !== signupTabId) return '';

  const candidates = [changeInfo?.url, tab?.url];
  for (const candidate of candidates) {
    if (isLocalhostOAuthCallbackUrl(candidate)) {
      return candidate;
    }
  }

  return '';
}

function getSourceLabel(source) {
  const labels = {
    'gmail-mail': 'Gmail 邮箱',
    'sidepanel': '侧边栏',
    'signup-page': '认证页',
    'vps-panel': 'CPA 面板',
    'sub2api-panel': 'SUB2API 后台',
    'qq-mail': 'QQ 邮箱',
    'mail-163': '163 邮箱',
    'mail-2925': '2925 邮箱',
    'inbucket-mail': 'Inbucket 邮箱',
    'duck-mail': 'Duck 邮箱',
    'hotmail-api': 'Hotmail（API对接/本地助手）',
    'luckmail-api': 'LuckMail（API 购邮）',
    'cloudflare-temp-email': 'Cloudflare Temp Email',
  };
  return labels[source] || source || '未知来源';
}

// ============================================================
// Step Status Management
// ============================================================

async function setStepStatus(step, status) {
  const state = await getState();
  const statuses = { ...state.stepStatuses };
  statuses[step] = status;
  await setState({ stepStatuses: statuses, currentStep: step });
  // Broadcast to side panel
  chrome.runtime.sendMessage({
    type: 'STEP_STATUS_CHANGED',
    payload: { step, status },
  }).catch(() => { });
}

function isStopError(error) {
  const message = typeof error === 'string' ? error : error?.message;
  return message === STOP_ERROR_MESSAGE;
}

function isRetryableContentScriptTransportError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /back\/forward cache|message channel is closed|Receiving end does not exist|port closed before a response was received|A listener indicated an asynchronous response|did not respond in \d+s/i.test(message);
}

function getErrorMessage(error) {
  return String(typeof error === 'string' ? error : error?.message || '');
}

function isVerificationMailPollingError(error) {
  const message = getErrorMessage(error);
  return /未在 .*邮箱中找到新的匹配邮件|未在 Hotmail 收件箱中找到新的匹配验证码|邮箱轮询结束，但未获取到验证码|无法获取新的(?:注册|登录)验证码|页面未能重新就绪|页面通信异常|did not respond in \d+s/i.test(message);
}

function getLoginAuthStateLabel(state) {
  switch (state) {
    case 'verification_page':
      return '登录验证码页';
    case 'password_page':
      return '密码页';
    case 'email_page':
      return '邮箱输入页';
    case 'login_timeout_error_page':
      return '登录超时报错页';
    case 'oauth_consent_page':
      return 'OAuth 授权页';
    case 'add_phone_page':
      return '手机号页';
    default:
      return '未知页面';
  }
}

function isRestartCurrentAttemptError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /当前邮箱已存在，需要重新开始新一轮/.test(message);
}

function isStep9RecoverableAuthError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /STEP9_OAUTH_RETRY::/i.test(message)
    || isRecoverableStep9AuthFailure(message);
}

function isLegacyStep9RecoverableAuthError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /STEP9_OAUTH_TIMEOUT::|认证失败:\s*Timeout waiting for OAuth callback/i.test(message);
}

function isStepDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}

function getFirstUnfinishedStep(statuses = {}) {
  for (let step = 1; step <= 9; step++) {
    if (!isStepDoneStatus(statuses[step] || 'pending')) {
      return step;
    }
  }
  return null;
}

function hasSavedProgress(statuses = {}) {
  return Object.values({ ...DEFAULT_STATE.stepStatuses, ...statuses }).some((status) => status !== 'pending');
}

function getDownstreamStateResets(step) {
  if (step <= 1) {
    return {
      oauthUrl: null,
      sub2apiSessionId: null,
      sub2apiOAuthState: null,
      sub2apiGroupId: null,
      sub2apiDraftName: null,
      flowStartTime: null,
      password: null,
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 2) {
    return {
      password: null,
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 3 || step === 4) {
    return {
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 5 || step === 6 || step === 7) {
    return {
      lastLoginCode: null,
      loginVerificationRequestedAt: null,
      localhostUrl: null,
    };
  }
  if (step === 8) {
    return {
      localhostUrl: null,
    };
  }
  return {};
}

async function invalidateDownstreamAfterStepRestart(step, options = {}) {
  const { logLabel = `步骤 ${step} 重新执行` } = options;
  const state = await getState();
  const statuses = { ...(state.stepStatuses || {}) };
  const changedSteps = [];

  for (let downstream = step + 1; downstream <= 9; downstream++) {
    if (statuses[downstream] !== 'pending') {
      statuses[downstream] = 'pending';
      changedSteps.push(downstream);
    }
  }

  if (changedSteps.length) {
    await setState({ stepStatuses: statuses });
    for (const downstream of changedSteps) {
      chrome.runtime.sendMessage({
        type: 'STEP_STATUS_CHANGED',
        payload: { step: downstream, status: 'pending' },
      }).catch(() => { });
    }
    await addLog(`${logLabel}，已重置后续步骤状态：${changedSteps.join(', ')}`, 'warn');
  }

  const resets = getDownstreamStateResets(step);
  if (Object.keys(resets).length) {
    await setState(resets);
    broadcastDataUpdate(resets);
  }
}

function clearStopRequest() {
  stopRequested = false;
}

function getRunningSteps(statuses = {}) {
  return Object.entries({ ...DEFAULT_STATE.stepStatuses, ...statuses })
    .filter(([, status]) => status === 'running')
    .map(([step]) => Number(step))
    .sort((a, b) => a - b);
}

function getAutoRunStatusPayload(phase, payload = {}) {
  const currentRun = payload.currentRun ?? autoRunCurrentRun;
  const totalRuns = payload.totalRuns ?? autoRunTotalRuns;
  const attemptRun = payload.attemptRun ?? autoRunAttemptRun;
  const rawScheduledAt = phase === 'scheduled'
    ? (payload.scheduledAt ?? payload.scheduledAutoRunAt ?? null)
    : null;
  const scheduledAt = rawScheduledAt === null ? null : Number(rawScheduledAt);
  const rawCountdownAt = payload.countdownAt ?? payload.autoRunCountdownAt ?? null;
  const countdownAt = rawCountdownAt === null ? null : Number(rawCountdownAt);
  const countdownTitle = payload.countdownTitle === undefined
    ? ''
    : String(payload.countdownTitle || '');
  const countdownNote = payload.countdownNote === undefined
    ? ''
    : String(payload.countdownNote || '');
  const autoRunning = phase === 'scheduled'
    || phase === 'running'
    || phase === 'waiting_step'
    || phase === 'waiting_email'
    || phase === 'retrying'
    || phase === 'waiting_interval';

  return {
    autoRunning,
    autoRunPhase: phase,
    autoRunCurrentRun: currentRun,
    autoRunTotalRuns: totalRuns,
    autoRunAttemptRun: attemptRun,
    scheduledAutoRunAt: Number.isFinite(scheduledAt) ? scheduledAt : null,
    autoRunCountdownAt: Number.isFinite(countdownAt) ? countdownAt : null,
    autoRunCountdownTitle: countdownTitle,
    autoRunCountdownNote: countdownNote,
  };
}

async function broadcastAutoRunStatus(phase, payload = {}, extraState = {}) {
  const rawScheduledAt = phase === 'scheduled'
    ? (payload.scheduledAt ?? payload.scheduledAutoRunAt ?? null)
    : null;
  const rawCountdownAt = payload.countdownAt ?? payload.autoRunCountdownAt ?? null;
  const statusPayload = {
    phase,
    currentRun: payload.currentRun ?? autoRunCurrentRun,
    totalRuns: payload.totalRuns ?? autoRunTotalRuns,
    attemptRun: payload.attemptRun ?? autoRunAttemptRun,
    scheduledAt: rawScheduledAt === null ? null : Number(rawScheduledAt),
    countdownAt: rawCountdownAt === null ? null : Number(rawCountdownAt),
    countdownTitle: payload.countdownTitle === undefined ? '' : String(payload.countdownTitle || ''),
    countdownNote: payload.countdownNote === undefined ? '' : String(payload.countdownNote || ''),
  };

  await setState({
    ...extraState,
    ...getAutoRunStatusPayload(phase, statusPayload),
  });
  chrome.runtime.sendMessage({
    type: 'AUTO_RUN_STATUS',
    payload: statusPayload,
  }).catch(() => { });
}

function isAutoRunLockedState(state) {
  return Boolean(state.autoRunning)
    && (
      state.autoRunPhase === 'running'
      || state.autoRunPhase === 'waiting_step'
      || state.autoRunPhase === 'retrying'
      || state.autoRunPhase === 'waiting_interval'
    );
}

function isAutoRunPausedState(state) {
  return Boolean(state.autoRunning) && state.autoRunPhase === 'waiting_email';
}

function isAutoRunScheduledState(state) {
  const plan = normalizeAutoRunTimerPlanFromState(state);
  const scheduledAt = state.scheduledAutoRunAt === null ? null : Number(state.scheduledAutoRunAt);
  return Boolean(state.autoRunning)
    && state.autoRunPhase === 'scheduled'
    && Number.isFinite(scheduledAt)
    && plan?.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START;
}

function getPendingAutoRunTimerPlan(state = {}) {
  return normalizeAutoRunTimerPlanFromState(state);
}

function formatAutoRunScheduleTime(timestamp) {
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

async function setAutoRunDelayEnabledState(enabled) {
  const normalized = Boolean(enabled);
  await setPersistentSettings({ autoRunDelayEnabled: normalized });
  await setState({ autoRunDelayEnabled: normalized });
  broadcastDataUpdate({ autoRunDelayEnabled: normalized });
}

async function ensureAutoRunTimerAlarm(fireAt) {
  if (!Number.isFinite(fireAt) || fireAt <= Date.now()) {
    return false;
  }

  const existingAlarm = await chrome.alarms.get(AUTO_RUN_TIMER_ALARM_NAME);
  if (!existingAlarm || Math.abs((existingAlarm.scheduledTime || 0) - fireAt) > 1000) {
    await chrome.alarms.clear(AUTO_RUN_TIMER_ALARM_NAME);
    await chrome.alarms.create(AUTO_RUN_TIMER_ALARM_NAME, { when: fireAt });
  }

  return true;
}

async function clearAutoRunTimerAlarm() {
  await chrome.alarms.clear(AUTO_RUN_TIMER_ALARM_NAME);
}

async function persistAutoRunTimerPlan(plan, extraState = {}) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    throw new Error('自动运行计时计划无效。');
  }

  const statusPayload = getAutoRunTimerStatusPayload(normalizedPlan);
  await broadcastAutoRunStatus(
    statusPayload.phase,
    statusPayload,
    {
      ...extraState,
      autoRunTimerPlan: normalizedPlan,
      scheduledAutoRunPlan: null,
    }
  );
  await ensureAutoRunTimerAlarm(normalizedPlan.fireAt);
  return normalizedPlan;
}

function getAutoRunTimerResumeOptions(plan) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    return null;
  }

  if (normalizedPlan.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return {
      loopOptions: {
        autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
        mode: normalizedPlan.mode,
      },
      statusPayload: {
        currentRun: 0,
        totalRuns: normalizedPlan.totalRuns,
        attemptRun: 0,
      },
    };
  }

  if (normalizedPlan.kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    const nextRun = Math.min(normalizedPlan.currentRun + 1, normalizedPlan.totalRuns);
    return {
      loopOptions: {
        autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
        mode: 'restart',
        resumeCurrentRun: nextRun,
        resumeAttemptRun: 1,
        resumeRoundSummaries: normalizedPlan.roundSummaries,
      },
      statusPayload: {
        currentRun: nextRun,
        totalRuns: normalizedPlan.totalRuns,
        attemptRun: 1,
      },
    };
  }

  return {
    loopOptions: {
      autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
      mode: 'restart',
      resumeCurrentRun: normalizedPlan.currentRun,
      resumeAttemptRun: normalizedPlan.attemptRun,
      resumeRoundSummaries: normalizedPlan.roundSummaries,
    },
    statusPayload: {
      currentRun: normalizedPlan.currentRun,
      totalRuns: normalizedPlan.totalRuns,
      attemptRun: normalizedPlan.attemptRun,
    },
  };
}

let autoRunTimerLaunching = false;

async function launchAutoRunTimerPlan(trigger = 'alarm', options = {}) {
  const { expectedKinds = [] } = options;
  if (autoRunTimerLaunching) {
    return false;
  }

  autoRunTimerLaunching = true;
  try {
    const state = await getState();
    const plan = getPendingAutoRunTimerPlan(state);
    if (!plan) {
      return false;
    }
    if (expectedKinds.length && !expectedKinds.includes(plan.kind)) {
      return false;
    }
    if (autoRunActive) {
      return false;
    }

    const resumeOptions = getAutoRunTimerResumeOptions(plan);
    if (!resumeOptions) {
      await clearAutoRunTimerAlarm();
      await broadcastAutoRunStatus('idle', {
        currentRun: 0,
        totalRuns: 1,
        attemptRun: 0,
      }, {
        autoRunRoundSummaries: [],
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      });
      return false;
    }

    await clearAutoRunTimerAlarm();
    autoRunCurrentRun = resumeOptions.statusPayload.currentRun;
    autoRunTotalRuns = plan.totalRuns;
    autoRunAttemptRun = resumeOptions.statusPayload.attemptRun;
    if (plan.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START && trigger !== 'manual' && state.autoRunDelayEnabled) {
      await setAutoRunDelayEnabledState(false);
    }
    await broadcastAutoRunStatus(
      'running',
      resumeOptions.statusPayload,
      {
        autoRunSkipFailures: plan.autoRunSkipFailures,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(plan.totalRuns, plan.roundSummaries),
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      }
    );

    clearStopRequest();
    let logMessage = '倒计时结束，自动运行开始执行。';
    if (plan.kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
      logMessage = trigger === 'manual'
        ? '已手动跳过线程间隔，自动流程立即开始下一轮。'
        : '线程间隔结束，自动流程开始下一轮。';
    } else if (plan.kind === AUTO_RUN_TIMER_KIND_BEFORE_RETRY) {
      logMessage = trigger === 'manual'
        ? `已手动跳过线程间隔，立即开始第 ${plan.currentRun}/${plan.totalRuns} 轮第 ${plan.attemptRun} 次尝试。`
        : `线程间隔结束，开始第 ${plan.currentRun}/${plan.totalRuns} 轮第 ${plan.attemptRun} 次尝试。`;
    } else if (trigger === 'manual') {
      logMessage = '已手动跳过倒计时，自动运行立即开始。';
    }
    await addLog(logMessage, 'info');

    startAutoRunLoop(plan.totalRuns, resumeOptions.loopOptions);
    return true;
  } finally {
    autoRunTimerLaunching = false;
  }
}

async function scheduleAutoRun(totalRuns, options = {}) {
  const state = await getState();
  if (isAutoRunLockedState(state) || isAutoRunPausedState(state) || autoRunActive) {
    throw new Error('自动运行已在进行中，请先停止后再重新计划。');
  }
  if (getPendingAutoRunTimerPlan(state)) {
    throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
  }

  const delayMinutes = normalizeAutoRunDelayMinutes(options.delayMinutes);
  const timerPlan = normalizeAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_SCHEDULED_START,
    fireAt: Date.now() + delayMinutes * 60 * 1000,
    totalRuns,
    autoRunSkipFailures: options.autoRunSkipFailures,
    mode: options.mode,
  });

  autoRunCurrentRun = 0;
  autoRunTotalRuns = timerPlan.totalRuns;
  autoRunAttemptRun = 0;

  await persistAutoRunTimerPlan(timerPlan, {
    autoRunSkipFailures: timerPlan.autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(timerPlan.totalRuns, []),
  });
  await addLog(
    `自动运行已计划：${delayMinutes} 分钟后启动（${formatAutoRunScheduleTime(timerPlan.fireAt)}），目标 ${timerPlan.totalRuns} 轮。`,
    'info'
  );
  return { ok: true, scheduledAt: timerPlan.fireAt };
}

async function cancelScheduledAutoRun(options = {}) {
  const state = await getState();
  const plan = getPendingAutoRunTimerPlan(state);
  if (!plan || plan.kind !== AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return false;
  }

  autoRunCurrentRun = 0;
  autoRunTotalRuns = plan.totalRuns;
  autoRunAttemptRun = 0;
  await broadcastAutoRunStatus(
    'idle',
    {
      currentRun: 0,
      totalRuns: plan.totalRuns,
      attemptRun: 0,
    },
    {
      autoRunRoundSummaries: [],
      autoRunTimerPlan: null,
      scheduledAutoRunPlan: null,
    }
  );
  await clearAutoRunTimerAlarm();
  if (options.logMessage !== false) {
    await addLog(options.logMessage || '已取消自动运行倒计时计划。', 'warn');
  }
  return true;
}

async function restoreAutoRunTimerIfNeeded() {
  const state = await getState();
  const plan = getPendingAutoRunTimerPlan(state);
  if (!plan) {
    if (state.autoRunPhase === 'scheduled' || state.autoRunPhase === 'waiting_interval') {
      await clearAutoRunTimerAlarm();
      await broadcastAutoRunStatus('idle', {
        currentRun: 0,
        totalRuns: 1,
        attemptRun: 0,
      }, {
        autoRunRoundSummaries: [],
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      });
    }
    return;
  }

  if (plan.fireAt <= Date.now()) {
    await launchAutoRunTimerPlan('restore');
    return;
  }

  const statusPayload = getAutoRunTimerStatusPayload(plan);
  await broadcastAutoRunStatus(
    statusPayload.phase,
    statusPayload,
    {
      autoRunSkipFailures: plan.autoRunSkipFailures,
      autoRunRoundSummaries: serializeAutoRunRoundSummaries(plan.totalRuns, plan.roundSummaries),
      autoRunTimerPlan: plan,
      scheduledAutoRunPlan: null,
    }
  );
  await ensureAutoRunTimerAlarm(plan.fireAt);
}

async function ensureManualInteractionAllowed(actionLabel) {
  const state = await getState();

  if (isAutoRunLockedState(state)) {
    throw new Error(`自动流程运行中，请先停止后再${actionLabel}。`);
  }
  if (isAutoRunPausedState(state)) {
    throw new Error(`自动流程当前已暂停。请点击“继续”，或先确认接管自动流程后再${actionLabel}。`);
  }
  if (isAutoRunScheduledState(state)) {
    throw new Error(`自动流程已计划启动。请先取消计划，或立即开始后再${actionLabel}。`);
  }

  return state;
}

async function skipStep(step) {
  const state = await ensureManualInteractionAllowed('跳过步骤');

  if (!Number.isInteger(step) || step < 1 || step > 9) {
    throw new Error(`无效步骤：${step}`);
  }

  const statuses = { ...(state.stepStatuses || {}) };
  const currentStatus = statuses[step];
  if (currentStatus === 'running') {
    throw new Error(`步骤 ${step} 正在运行中，不能跳过。`);
  }
  if (isStepDoneStatus(currentStatus)) {
    throw new Error(`步骤 ${step} 已完成，无需再跳过。`);
  }

  if (step > 1) {
    const prevStatus = statuses[step - 1];
    if (!isStepDoneStatus(prevStatus)) {
      throw new Error(`请先完成步骤 ${step - 1}，再跳过步骤 ${step}。`);
    }
  }

  await setStepStatus(step, 'skipped');
  await addLog(`步骤 ${step} 已跳过`, 'warn');

  if (step === 1) {
    const latestState = await getState();
    const step2Status = latestState.stepStatuses?.[2];
    if (!isStepDoneStatus(step2Status) && step2Status !== 'running') {
      await setStepStatus(2, 'skipped');
      await addLog('步骤 1 已跳过，步骤 2 也已同时跳过。', 'warn');
    }
  }

  return { ok: true, step, status: 'skipped' };
}

function throwIfStopped() {
  if (stopRequested) {
    throw new Error(STOP_ERROR_MESSAGE);
  }
}

async function sleepWithStop(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    throwIfStopped();
    await new Promise(r => setTimeout(r, Math.min(100, ms - (Date.now() - start))));
  }
}

async function humanStepDelay(min = HUMAN_STEP_DELAY_MIN, max = HUMAN_STEP_DELAY_MAX) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await sleepWithStop(duration);
}

async function clickWithDebugger(tabId, rect) {
  throwIfStopped();
  if (!tabId) {
    throw new Error('未找到用于调试点击的认证页面标签页。');
  }
  if (!rect || !Number.isFinite(rect.centerX) || !Number.isFinite(rect.centerY)) {
    throw new Error('步骤 8 的调试器兜底点击需要有效的按钮坐标。');
  }

  const target = { tabId };
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (err) {
    throw new Error(
      `步骤 8 的调试器兜底点击附加失败：${err.message}。` +
      '如果认证页标签已打开 DevTools，请先关闭后重试。'
    );
  }

  try {
    throwIfStopped();
    const x = Math.round(rect.centerX);
    const y = Math.round(rect.centerY);

    await chrome.debugger.sendCommand(target, 'Page.bringToFront');
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      clickCount: 0,
    });
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => { });
  }
}

async function broadcastStopToContentScripts() {
  const registry = await getTabRegistry();
  for (const entry of Object.values(registry)) {
    if (!entry?.tabId) continue;
    try {
      await chrome.tabs.sendMessage(entry.tabId, {
        type: 'STOP_FLOW',
        source: 'background',
        payload: {},
      });
    } catch { }
  }
}

let stopRequested = false;

// ============================================================
// Message Handler (central router)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(LOG_PREFIX, `Received: ${message.type} from ${message.source || 'sidepanel'}`, message);

  handleMessage(message, sender).then(response => {
    sendResponse(response);
  }).catch(err => {
    console.error(LOG_PREFIX, 'Handler error:', err);
    sendResponse({ error: err.message });
  });

  return true; // async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'CONTENT_SCRIPT_READY': {
      const tabId = sender.tab?.id;
      if (tabId && message.source) {
        await registerTab(message.source, tabId);
        flushCommand(message.source, tabId);
        await addLog(`内容脚本已就绪：${getSourceLabel(message.source)}（标签页 ${tabId}）`);
      }
      return { ok: true };
    }

    case 'LOG': {
      const { message: msg, level } = message.payload;
      await addLog(`[${getSourceLabel(message.source)}] ${msg}`, level);
      return { ok: true };
    }

    case 'STEP_COMPLETE': {
      if (stopRequested) {
        await setStepStatus(message.step, 'stopped');
        notifyStepError(message.step, STOP_ERROR_MESSAGE);
        return { ok: true };
      }
      await setStepStatus(message.step, 'completed');
      await addLog(`步骤 ${message.step} 已完成`, 'ok');
      await handleStepData(message.step, message.payload);
      notifyStepComplete(message.step, message.payload);
      return { ok: true };
    }

    case 'STEP_ERROR': {
      if (isStopError(message.error)) {
        await setStepStatus(message.step, 'stopped');
        await addLog(`步骤 ${message.step} 已被用户停止`, 'warn');
        notifyStepError(message.step, message.error);
      } else {
        await setStepStatus(message.step, 'failed');
        await addLog(`步骤 ${message.step} 失败：${message.error}`, 'error');
        notifyStepError(message.step, message.error);
      }
      return { ok: true };
    }

    case 'GET_STATE': {
      return await getState();
    }

    case 'RESET': {
      clearStopRequest();
      await clearAutoRunTimerAlarm();
      await resetState();
      await addLog('流程已重置', 'info');
      return { ok: true };
    }

    case 'EXECUTE_STEP': {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await ensureManualInteractionAllowed('手动执行步骤');
      }
      const step = message.payload.step;
      if (message.source === 'sidepanel') {
        await invalidateDownstreamAfterStepRestart(step, { logLabel: `步骤 ${step} 重新执行` });
      }
      // Save email if provided (from side panel step 3)
      if (message.payload.email) {
        await setEmailState(message.payload.email);
      }
      if (message.payload.emailPrefix !== undefined) {
        await setPersistentSettings({ emailPrefix: message.payload.emailPrefix });
        await setState({ emailPrefix: message.payload.emailPrefix });
      }
      if (doesStepUseCompletionSignal(step)) {
        await executeStepViaCompletionSignal(step);
      } else {
        await executeStep(step);
      }
      return { ok: true };
    }

    case 'AUTO_RUN': {
      clearStopRequest();
      const state = await getState();
      if (getPendingAutoRunTimerPlan(state)) {
        throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
      }
      const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
      const autoRunSkipFailures = Boolean(message.payload?.autoRunSkipFailures);
      const mode = message.payload?.mode === 'continue' ? 'continue' : 'restart';
      await setState({ autoRunSkipFailures });
      startAutoRunLoop(totalRuns, { autoRunSkipFailures, mode });
      return { ok: true };
    }

    case 'SCHEDULE_AUTO_RUN': {
      clearStopRequest();
      const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
      return await scheduleAutoRun(totalRuns, {
        delayMinutes: message.payload?.delayMinutes,
        autoRunSkipFailures: Boolean(message.payload?.autoRunSkipFailures),
        mode: message.payload?.mode,
      });
    }

    case 'START_SCHEDULED_AUTO_RUN_NOW': {
      clearStopRequest();
      const started = await launchAutoRunTimerPlan('manual', {
        expectedKinds: [AUTO_RUN_TIMER_KIND_SCHEDULED_START],
      });
      if (!started) {
        throw new Error('当前没有可立即开始的倒计时计划。');
      }
      return { ok: true };
    }

    case 'CANCEL_SCHEDULED_AUTO_RUN': {
      const cancelled = await cancelScheduledAutoRun();
      if (!cancelled) {
        throw new Error('当前没有可取消的倒计时计划。');
      }
      return { ok: true };
    }

    case 'SKIP_AUTO_RUN_COUNTDOWN': {
      clearStopRequest();
      const skipped = await skipAutoRunCountdown();
      if (!skipped) {
        throw new Error('当前没有可立即开始的倒计时。');
      }
      return { ok: true };
    }

    case 'RESUME_AUTO_RUN': {
      clearStopRequest();
      if (message.payload.email) {
        await setEmailState(message.payload.email);
      }
      resumeAutoRun().catch((error) => {
        handleAutoRunLoopUnhandledError(error).catch((handlerError) => {
          console.error(LOG_PREFIX, 'Failed to finalize resume error:', handlerError);
        });
      });
      return { ok: true };
    }

    case 'TAKEOVER_AUTO_RUN': {
      await requestStop({ logMessage: '已确认手动接管，正在停止自动流程并切换为手动控制...' });
      await addLog('自动流程已切换为手动控制。', 'warn');
      return { ok: true };
    }

    case 'SKIP_STEP': {
      const step = Number(message.payload?.step);
      return await skipStep(step);
    }

    case 'SAVE_SETTING': {
      const updates = buildPersistentSettingsPayload(message.payload || {});
      const sessionUpdates = buildLuckmailSessionSettingsPayload(message.payload || {});
      await setPersistentSettings(updates);
      await setState({
        ...updates,
        ...sessionUpdates,
      });
      return { ok: true, state: await getState() };
    }

    case 'EXPORT_SETTINGS': {
      return { ok: true, ...(await exportSettingsBundle()) };
    }

    case 'IMPORT_SETTINGS': {
      const state = await importSettingsBundle(message.payload?.config || null);
      return { ok: true, state };
    }

    case 'UPSERT_HOTMAIL_ACCOUNT': {
      const account = await upsertHotmailAccount(message.payload || {});
      return { ok: true, account };
    }

    case 'DELETE_HOTMAIL_ACCOUNT': {
      await deleteHotmailAccount(String(message.payload?.accountId || ''));
      return { ok: true };
    }

    case 'DELETE_HOTMAIL_ACCOUNTS': {
      const result = await deleteHotmailAccounts(String(message.payload?.mode || 'all'));
      return { ok: true, ...result };
    }

    case 'SELECT_HOTMAIL_ACCOUNT': {
      const account = await setCurrentHotmailAccount(String(message.payload?.accountId || ''), {
        markUsed: false,
        syncEmail: true,
      });
      return { ok: true, account };
    }

    case 'PATCH_HOTMAIL_ACCOUNT': {
      const account = await patchHotmailAccount(
        String(message.payload?.accountId || ''),
        message.payload?.updates || {}
      );
      return { ok: true, account };
    }

    case 'VERIFY_HOTMAIL_ACCOUNT':
    case 'AUTHORIZE_HOTMAIL_ACCOUNT': {
      const accountId = String(message.payload?.accountId || '');
      try {
        const result = await verifyHotmailAccount(accountId);
        await setCurrentHotmailAccount(result.account.id, { markUsed: false, syncEmail: true });
        await addLog(`Hotmail 账号 ${result.account.email} 校验通过，可直接用于收信。`, 'ok');
        return { ok: true, account: result.account, messageCount: result.messageCount };
      } catch (err) {
        const state = await getState();
        const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
        const target = findHotmailAccount(accounts, accountId);
        if (target) {
          target.status = 'error';
          target.lastError = err.message;
          await syncHotmailAccounts(accounts.map((item) => (item.id === target.id ? target : item)));
        }
        throw err;
      }
    }

    case 'TEST_HOTMAIL_ACCOUNT': {
      const result = await testHotmailAccountMailAccess(String(message.payload?.accountId || ''));
      return { ok: true, ...result };
    }

    case 'LIST_LUCKMAIL_PURCHASES': {
      const purchases = await listLuckmailPurchasesForManagement();
      return { ok: true, purchases };
    }

    case 'SELECT_LUCKMAIL_PURCHASE': {
      const purchase = await selectLuckmailPurchase(message.payload?.purchaseId);
      return { ok: true, purchase };
    }

    case 'SET_LUCKMAIL_PURCHASE_USED_STATE': {
      const result = await setLuckmailPurchaseUsedState(message.payload?.purchaseId, Boolean(message.payload?.used));
      return { ok: true, ...result };
    }

    case 'SET_LUCKMAIL_PURCHASE_PRESERVED_STATE': {
      const purchase = await setLuckmailPurchasePreservedState(message.payload?.purchaseId, Boolean(message.payload?.preserved));
      return { ok: true, purchase };
    }

    case 'SET_LUCKMAIL_PURCHASE_DISABLED_STATE': {
      const purchase = await setLuckmailPurchaseDisabledState(message.payload?.purchaseId, Boolean(message.payload?.disabled));
      return { ok: true, purchase };
    }

    case 'BATCH_UPDATE_LUCKMAIL_PURCHASES': {
      const result = await batchUpdateLuckmailPurchases(message.payload || {});
      return { ok: true, ...result };
    }

    case 'DISABLE_USED_LUCKMAIL_PURCHASES': {
      const result = await disableUsedLuckmailPurchases();
      return { ok: true, ...result };
    }

    // Side panel data updates
    case 'SET_EMAIL_STATE': {
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能手动修改邮箱。');
      }
      const email = String(message.payload?.email || '').trim() || null;
      await setEmailStateSilently(email);
      return { ok: true, email };
    }

    case 'SAVE_EMAIL': {
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能手动修改邮箱。');
      }
      await setEmailState(message.payload.email);
      await resumeAutoRun();
      return { ok: true, email: message.payload.email };
    }

    case 'FETCH_GENERATED_EMAIL': {
      clearStopRequest();
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能手动获取邮箱。');
      }
      const email = await fetchGeneratedEmail(state, message.payload || {});
      await resumeAutoRun();
      return { ok: true, email };
    }

    case 'FETCH_DUCK_EMAIL': {
      clearStopRequest();
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能手动获取邮箱。');
      }
      const email = await fetchGeneratedEmail(state, { ...(message.payload || {}), generator: 'duck' });
      await resumeAutoRun();
      return { ok: true, email };
    }

    case 'CHECK_ICLOUD_SESSION': {
      clearStopRequest();
      return await checkIcloudSession();
    }

    case 'LIST_ICLOUD_ALIASES': {
      clearStopRequest();
      const aliases = await listIcloudAliases();
      return { ok: true, aliases };
    }

    case 'SET_ICLOUD_ALIAS_USED_STATE': {
      clearStopRequest();
      const result = await setIcloudAliasUsedState(message.payload || {});
      return { ok: true, ...result };
    }

    case 'SET_ICLOUD_ALIAS_PRESERVED_STATE': {
      clearStopRequest();
      const result = await setIcloudAliasPreservedState(message.payload || {});
      return { ok: true, ...result };
    }

    case 'DELETE_ICLOUD_ALIAS': {
      clearStopRequest();
      const result = await deleteIcloudAlias(message.payload || {});
      return { ok: true, ...result };
    }

    case 'DELETE_USED_ICLOUD_ALIASES': {
      clearStopRequest();
      const result = await deleteUsedIcloudAliases();
      return { ok: true, ...result };
    }

    case 'STOP_FLOW': {
      await requestStop();
      return { ok: true };
    }

    default:
      console.warn(LOG_PREFIX, `Unknown message type: ${message.type}`);
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ============================================================
// Step Data Handlers
// ============================================================

async function handleStepData(step, payload) {
  switch (step) {
    case 1: {
      const updates = {};
      if (payload.oauthUrl) {
        updates.oauthUrl = payload.oauthUrl;
        broadcastDataUpdate({ oauthUrl: payload.oauthUrl });
      }
      if (payload.sub2apiSessionId !== undefined) updates.sub2apiSessionId = payload.sub2apiSessionId || null;
      if (payload.sub2apiOAuthState !== undefined) updates.sub2apiOAuthState = payload.sub2apiOAuthState || null;
      if (payload.sub2apiGroupId !== undefined) updates.sub2apiGroupId = payload.sub2apiGroupId || null;
      if (payload.sub2apiDraftName !== undefined) updates.sub2apiDraftName = payload.sub2apiDraftName || null;
      if (Object.keys(updates).length) {
        await setState(updates);
      }
      break;
    }
    case 3:
      if (payload.email) await setEmailState(payload.email);
      if (payload.signupVerificationRequestedAt) {
        await setState({ signupVerificationRequestedAt: payload.signupVerificationRequestedAt });
      }
      if (payload.loginVerificationRequestedAt) {
        await setState({ loginVerificationRequestedAt: payload.loginVerificationRequestedAt });
      }
      break;
    case 6:
      if (payload.loginVerificationRequestedAt) {
        await setState({ loginVerificationRequestedAt: payload.loginVerificationRequestedAt });
      }
      break;
    case 4:
      await setState({
        lastEmailTimestamp: payload.emailTimestamp || null,
        signupVerificationRequestedAt: null,
      });
      break;
    case 7:
      await setState({
        lastEmailTimestamp: payload.emailTimestamp || null,
        loginVerificationRequestedAt: null,
      });
      break;
    case 8:
      if (payload.localhostUrl) {
        if (!isLocalhostOAuthCallbackUrl(payload.localhostUrl)) {
          throw new Error('步骤 8 返回了无效的 localhost OAuth 回调地址。');
        }
        await setState({ localhostUrl: payload.localhostUrl });
        broadcastDataUpdate({ localhostUrl: payload.localhostUrl });
      }
      break;
    case 9: {
      if (payload.localhostUrl) {
        await closeLocalhostCallbackTabs(payload.localhostUrl);
      }
      const latestState = await getState();
      if (latestState.currentHotmailAccountId && isHotmailProvider(latestState)) {
        await patchHotmailAccount(latestState.currentHotmailAccountId, {
          used: true,
          lastUsedAt: Date.now(),
        });
        await addLog('当前 Hotmail 账号已自动标记为已用。', 'ok');
      }
      if (isLuckmailProvider(latestState)) {
        const currentPurchase = getCurrentLuckmailPurchase(latestState);
        if (currentPurchase?.id) {
          await setLuckmailPurchaseUsedState(currentPurchase.id, true);
          await addLog(`当前 LuckMail 邮箱 ${currentPurchase.email_address} 已在本地标记为已用。`, 'ok');
        }
        await clearLuckmailRuntimeState({ clearEmail: true });
        await addLog('当前 LuckMail 邮箱运行态已清空，下轮将优先复用未用邮箱或重新购买邮箱。', 'ok');
      }
      const localhostPrefix = buildLocalhostCleanupPrefix(payload.localhostUrl);
      if (localhostPrefix) {
        await closeTabsByUrlPrefix(localhostPrefix, {
          excludeUrls: [payload.localhostUrl],
          excludeLocalhostCallbacks: true,
        });
      }
      await finalizeIcloudAliasAfterSuccessfulFlow(latestState);
      if (shouldUseCustomRegistrationEmail(latestState) && latestState.email) {
        await setEmailStateSilently(null);
      }
      break;
    }
  }
}

// ============================================================
// Step Completion Waiting
// ============================================================

// Map of step -> { resolve, reject } for waiting on step completion
const stepWaiters = new Map();
let resumeWaiter = null;
const AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS = 120000;
const AUTO_RUN_BACKGROUND_COMPLETED_STEPS = new Set([1, 2, 4, 6, 7, 8]);
const STEP_COMPLETION_SIGNAL_STEPS = new Set([3, 5, 9]);

function waitForStepComplete(step, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    throwIfStopped();
    if (stepWaiters.has(step)) {
      console.warn(LOG_PREFIX, `[waitForStepComplete] replacing existing waiter for step ${step}`);
    }
    console.log(LOG_PREFIX, `[waitForStepComplete] register step ${step}, timeout=${timeoutMs}ms`);
    const timer = setTimeout(() => {
      stepWaiters.delete(step);
      console.warn(LOG_PREFIX, `[waitForStepComplete] timeout for step ${step} after ${timeoutMs}ms`);
      reject(new Error(`步骤 ${step} 等待超时（>${timeoutMs / 1000} 秒）`));
    }, timeoutMs);

    stepWaiters.set(step, {
      resolve: (data) => { clearTimeout(timer); stepWaiters.delete(step); resolve(data); },
      reject: (err) => { clearTimeout(timer); stepWaiters.delete(step); reject(err); },
    });
  });
}

function doesStepUseCompletionSignal(step) {
  return STEP_COMPLETION_SIGNAL_STEPS.has(step);
}

function notifyStepComplete(step, payload) {
  const waiter = stepWaiters.get(step);
  console.log(LOG_PREFIX, `[notifyStepComplete] step ${step}, hasWaiter=${Boolean(waiter)}`);
  if (waiter) waiter.resolve(payload);
}

function notifyStepError(step, error) {
  const waiter = stepWaiters.get(step);
  console.warn(LOG_PREFIX, `[notifyStepError] step ${step}, hasWaiter=${Boolean(waiter)}, error=${error}`);
  if (waiter) waiter.reject(new Error(error));
}

async function completeStepFromBackground(step, payload = {}) {
  if (stopRequested) {
    await setStepStatus(step, 'stopped');
    notifyStepError(step, STOP_ERROR_MESSAGE);
    return;
  }

  await setStepStatus(step, 'completed');
  await addLog(`步骤 ${step} 已完成`, 'ok');
  await handleStepData(step, payload);
  notifyStepComplete(step, payload);
}

async function finalizeDeferredStepExecutionError(step, error) {
  const latestState = await getState();
  const currentStatus = latestState.stepStatuses?.[step];
  if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'stopped') {
    return;
  }

  if (isStopError(error)) {
    await setStepStatus(step, 'stopped');
    await addLog(`步骤 ${step} 已被用户停止`, 'warn');
    return;
  }

  await setStepStatus(step, 'failed');
  await addLog(`步骤 ${step} 失败：${getErrorMessage(error)}`, 'error');
}

async function executeStepViaCompletionSignal(step, timeoutMs = AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS) {
  const completionResultPromise = waitForStepComplete(step, timeoutMs).then(
    payload => ({ ok: true, payload }),
    error => ({ ok: false, error }),
  );

  let executeError = null;
  try {
    await executeStep(step, { deferRetryableTransportError: true });
  } catch (err) {
    executeError = err;
    if (isStopError(err) || !isRetryableContentScriptTransportError(err)) {
      notifyStepError(step, getErrorMessage(err));
    }
  }

  const completionResult = await completionResultPromise;
  if (completionResult.ok) {
    if (executeError) {
      console.warn(
        LOG_PREFIX,
        `[executeStepViaCompletionSignal] step ${step} completed after deferred execute error: ${getErrorMessage(executeError)}`
      );
    }
    return completionResult.payload;
  }

  if (executeError && isRetryableContentScriptTransportError(executeError)) {
    const completionMessage = getErrorMessage(completionResult.error);
    if (/等待超时/.test(completionMessage)) {
      await finalizeDeferredStepExecutionError(step, executeError);
      throw executeError;
    }
    throw completionResult.error;
  }

  if (executeError) {
    throw executeError;
  }

  throw completionResult.error;
}

async function waitForRunningStepsToFinish(payload = {}) {
  let currentState = await getState();
  let runningSteps = getRunningSteps(currentState.stepStatuses);
  if (!runningSteps.length) {
    return currentState;
  }

  await addLog(`自动继续：检测到步骤 ${runningSteps.join(', ')} 正在运行，等待完成后再继续自动流程...`, 'info');
  await broadcastAutoRunStatus('waiting_step', payload);

  while (runningSteps.length) {
    await sleepWithStop(250);
    currentState = await getState();
    runningSteps = getRunningSteps(currentState.stepStatuses);
  }

  await addLog('自动继续：当前运行步骤已结束，准备按最新进度继续自动流程...', 'info');
  return currentState;
}

async function markRunningStepsStopped() {
  const state = await getState();
  const runningSteps = getRunningSteps(state.stepStatuses);

  for (const step of runningSteps) {
    await setStepStatus(step, 'stopped');
  }
}

async function requestStop(options = {}) {
  const { logMessage = '已收到停止请求，正在取消当前操作...' } = options;
  const state = await getState();
  const timerPlan = getPendingAutoRunTimerPlan(state);

  if (timerPlan?.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START && !autoRunActive) {
    await cancelScheduledAutoRun({
      logMessage: options.logMessage === false
        ? false
        : (options.logMessage || '已取消自动运行倒计时计划。'),
    });
    return;
  }

  if (timerPlan && !autoRunActive) {
    autoRunCurrentRun = timerPlan.currentRun;
    autoRunTotalRuns = timerPlan.totalRuns;
    autoRunAttemptRun = timerPlan.attemptRun;
    if (options.logMessage !== false) {
      await addLog(options.logMessage || '已停止等待中的自动流程。', 'warn');
    }
    await broadcastAutoRunStatus('stopped', {
      currentRun: timerPlan.currentRun,
      totalRuns: timerPlan.totalRuns,
      attemptRun: timerPlan.attemptRun,
    }, {
      autoRunSkipFailures: timerPlan.autoRunSkipFailures,
      autoRunRoundSummaries: serializeAutoRunRoundSummaries(timerPlan.totalRuns, timerPlan.roundSummaries),
      autoRunTimerPlan: null,
      scheduledAutoRunPlan: null,
    });
    await clearAutoRunTimerAlarm();
    clearStopRequest();
    return;
  }

  if (stopRequested) return;

  stopRequested = true;
  cancelPendingCommands();
  cleanupStep8NavigationListeners();
  rejectPendingStep8(new Error(STOP_ERROR_MESSAGE));

  await addLog(logMessage, 'warn');
  await broadcastStopToContentScripts();

  for (const waiter of stepWaiters.values()) {
    waiter.reject(new Error(STOP_ERROR_MESSAGE));
  }
  stepWaiters.clear();

  if (resumeWaiter) {
    resumeWaiter.reject(new Error(STOP_ERROR_MESSAGE));
    resumeWaiter = null;
  }

  await markRunningStepsStopped();
  autoRunActive = false;
  await broadcastAutoRunStatus('stopped', {
    currentRun: autoRunCurrentRun,
    totalRuns: autoRunTotalRuns,
    attemptRun: autoRunAttemptRun,
  }, {
    autoRunTimerPlan: null,
    scheduledAutoRunPlan: null,
  });
}

// ============================================================
// Step Execution
// ============================================================

async function executeStep(step, options = {}) {
  const { deferRetryableTransportError = false } = options;
  console.log(LOG_PREFIX, `Executing step ${step}`);
  throwIfStopped();
  await setStepStatus(step, 'running');
  await addLog(`步骤 ${step} 开始执行`);
  await humanStepDelay();

  const state = await getState();

  // Set flow start time on first step
  if (step === 1 && !state.flowStartTime) {
    await setState({ flowStartTime: Date.now() });
  }

  try {
    switch (step) {
      case 1: await executeStep1(state); break;
      case 2: await executeStep2(state); break;
      case 3: await executeStep3(state); break;
      case 4: await executeStep4(state); break;
      case 5: await executeStep5(state); break;
      case 6: await executeStep6(state); break;
      case 7: await executeStep7(state); break;
      case 8: await executeStep8(state); break;
      case 9: await executeStep9(state); break;
      default:
        throw new Error(`未知步骤：${step}`);
    }
  } catch (err) {
    if (isStopError(err)) {
      await setStepStatus(step, 'stopped');
      await addLog(`步骤 ${step} 已被用户停止`, 'warn');
      throw err;
    }
    if (!(deferRetryableTransportError && doesStepUseCompletionSignal(step) && isRetryableContentScriptTransportError(err))) {
      await setStepStatus(step, 'failed');
      await addLog(`步骤 ${step} 失败：${err.message}`, 'error');
    } else {
      console.warn(
        LOG_PREFIX,
        `[executeStep] deferring retryable transport error for step ${step}: ${getErrorMessage(err)}`
      );
    }
    throw err;
  }
}

/**
 * Execute a step and wait for it to complete before returning.
 * @param {number} step
 * @param {number} delayAfter - ms to wait after completion (for page transitions)
 */
async function executeStepAndWait(step, delayAfter = 2000) {
  throwIfStopped();

  const delaySeconds = normalizeAutoStepDelaySeconds((await getState()).autoStepDelaySeconds, null);
  if (delaySeconds > 0) {
    await addLog(
      `自动运行：步骤 ${step} 执行前额外等待 ${delaySeconds} 秒，避免节奏过快。`,
      'info'
    );
    await sleepWithStop(delaySeconds * 1000);
  }

  if (AUTO_RUN_BACKGROUND_COMPLETED_STEPS.has(step)) {
    await addLog(`自动运行：步骤 ${step} 由后台流程负责收尾，执行函数返回后将直接进入下一步。`, 'info');
    await executeStep(step);
    const latestState = await getState();
    await addLog(`自动运行：步骤 ${step} 已执行返回，当前状态为 ${latestState.stepStatuses?.[step] || 'pending'}，准备继续后续步骤。`, 'info');
  } else if (doesStepUseCompletionSignal(step)) {
    await addLog(`自动运行：步骤 ${step} 已发起，正在等待完成信号（超时 ${AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS / 1000} 秒）。`, 'info');
    await executeStepViaCompletionSignal(step, AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS);
    await addLog(`自动运行：步骤 ${step} 已收到完成信号，准备继续后续步骤。`, 'info');
  } else {
    await executeStep(step);
  }

  // Extra delay for page transitions / DOM updates
  if (delayAfter > 0) {
    await sleepWithStop(delayAfter + Math.floor(Math.random() * 1200));
  }
}

function getEmailGeneratorLabel(generator) {
  if (generator === 'custom') {
    return '自定义邮箱';
  }
  if (generator === 'icloud') {
    return 'iCloud 隐私邮箱';
  }
  if (generator === 'cloudflare') return 'Cloudflare 邮箱';
  if (generator === CLOUDFLARE_TEMP_EMAIL_GENERATOR) return 'Cloudflare Temp Email';
  return 'Duck 邮箱';
}

function generateCloudflareAliasLocalPart() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const chars = [];

  for (let i = 0; i < 6; i++) {
    chars.push(letters[Math.floor(Math.random() * letters.length)]);
  }

  for (let i = 0; i < 4; i++) {
    chars.push(digits[Math.floor(Math.random() * digits.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

async function fetchCloudflareEmail(state, options = {}) {
  throwIfStopped();
  const latestState = state || await getState();
  const domain = normalizeCloudflareDomain(latestState.cloudflareDomain);
  if (!domain) {
    throw new Error('Cloudflare 域名为空或格式无效。');
  }

  const localPart = String(options.localPart || '').trim().toLowerCase() || generateCloudflareAliasLocalPart();
  const aliasEmail = `${localPart}@${domain}`;

  await setEmailState(aliasEmail);
  await addLog(`Cloudflare 邮箱：已生成 ${aliasEmail}`, 'ok');
  return aliasEmail;
}

function ensureCloudflareTempEmailConfig(state, options = {}) {
  const {
    requireAdminAuth = false,
    requireDomain = false,
  } = options;
  const config = getCloudflareTempEmailConfig(state);
  if (!config.baseUrl) {
    throw new Error('Cloudflare Temp Email 服务地址为空或格式无效。');
  }
  if (requireAdminAuth && !config.adminAuth) {
    throw new Error('Cloudflare Temp Email 缺少 Admin Auth。');
  }
  if (requireDomain && !config.domain) {
    throw new Error('Cloudflare Temp Email 域名为空或格式无效。');
  }
  return config;
}

async function requestCloudflareTempEmailJson(config, path, options = {}) {
  const {
    method = 'GET',
    payload,
    searchParams,
    timeoutMs = 20000,
  } = options;

  const url = new URL(joinCloudflareTempEmailUrl(config.baseUrl, path));
  if (searchParams && typeof searchParams === 'object') {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: buildCloudflareTempEmailHeaders(config, {
        json: payload !== undefined,
      }),
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const errorMessage = err?.name === 'AbortError'
      ? `Cloudflare Temp Email 请求超时（>${Math.round(timeoutMs / 1000)} 秒）`
      : `Cloudflare Temp Email 请求失败：${err.message}`;
    throw new Error(errorMessage);
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const payloadError = typeof parsed === 'object' && parsed
      ? (parsed.message || parsed.error || parsed.msg)
      : '';
    throw new Error(`Cloudflare Temp Email 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
  }

  return parsed;
}

async function fetchCloudflareTempEmailAddress(state, options = {}) {
  throwIfStopped();
  const latestState = state || await getState();
  const config = ensureCloudflareTempEmailConfig(latestState, {
    requireAdminAuth: true,
    requireDomain: true,
  });
  const requestedName = String(options.localPart || options.name || '').trim().toLowerCase() || generateCloudflareAliasLocalPart();
  const payload = {
    enablePrefix: true,
    name: requestedName,
    domain: config.domain,
  };
  const result = await requestCloudflareTempEmailJson(config, '/admin/new_address', {
    method: 'POST',
    payload,
  });
  const address = normalizeCloudflareTempEmailAddress(getCloudflareTempEmailAddressFromResponse(result));
  if (!address) {
    throw new Error('Cloudflare Temp Email 未返回可用邮箱地址。');
  }

  await setEmailState(address);
  await addLog(`Cloudflare Temp Email：已生成 ${address}`, 'ok');
  return address;
}

async function fetchDuckEmail(options = {}) {
  throwIfStopped();
  const { generateNew = true } = options;

  await addLog(`Duck 邮箱：正在打开自动填充设置（${generateNew ? '生成新地址' : '复用当前地址'}）...`);
  await reuseOrCreateTab('duck-mail', DUCK_AUTOFILL_URL);

  const result = await sendToContentScript('duck-mail', {
    type: 'FETCH_DUCK_EMAIL',
    source: 'background',
    payload: { generateNew },
  });

  if (result?.error) {
    throw new Error(result.error);
  }
  if (!result?.email) {
    throw new Error('未返回 Duck 邮箱地址。');
  }

  await setEmailState(result.email);
  await addLog(`Duck 邮箱：${result.generated ? '已生成' : '已读取'} ${result.email}`, 'ok');
  return result.email;
}

async function fetchGeneratedEmail(state, options = {}) {
  const currentState = state || await getState();
  const generator = normalizeEmailGenerator(options.generator ?? currentState.emailGenerator);
  if (generator === 'custom') {
    throw new Error('当前邮箱生成方式为自定义邮箱，请直接填写注册邮箱。');
  }
  if (generator === 'icloud') {
    return fetchIcloudHideMyEmail();
  }
  if (generator === 'cloudflare') {
    return fetchCloudflareEmail(currentState, options);
  }
  if (generator === CLOUDFLARE_TEMP_EMAIL_GENERATOR) {
    return fetchCloudflareTempEmailAddress(currentState, options);
  }
  return fetchDuckEmail(options);
}

// ============================================================
// Auto Run Flow
// ============================================================

let autoRunActive = false;
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;
const EMAIL_FETCH_MAX_ATTEMPTS = 5;
const VERIFICATION_POLL_MAX_ROUNDS = 5;
const STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS = 25000;
const AUTO_STEP_DELAYS = {
  1: 2000,
  2: 2000,
  3: 3000,
  4: 2000,
  5: 3000,
  6: 3000,
  7: 2000,
  8: 2000,
  9: 1000,
};

async function resumeAutoRunIfWaitingForEmail(options = {}) {
  const { silent = false } = options;
  const state = await getState();
  if (!state.email || !isAutoRunPausedState(state)) {
    return false;
  }

  if (resumeWaiter) {
    if (!silent) {
      await addLog('邮箱已就绪，自动继续后续步骤...', 'info');
    }
    resumeWaiter.resolve();
    resumeWaiter = null;
    return true;
  }

  return false;
}

async function ensureAutoEmailReady(targetRun, totalRuns, attemptRuns) {
  const currentState = await getState();
  if (isHotmailProvider(currentState)) {
    const account = await ensureHotmailAccountForFlow({
      allowAllocate: true,
      markUsed: true,
      preferredAccountId: null,
    });
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：已分配 Hotmail 账号 ${account.email}（第 ${attemptRuns} 次尝试）===`, 'ok');
    return account.email;
  }

  if (isLuckmailProvider(currentState)) {
    const purchase = await ensureLuckmailPurchaseForFlow({ allowReuse: true });
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：LuckMail 邮箱已就绪：${purchase.email_address}（第 ${attemptRuns} 次尝试）===`, 'ok');
    return purchase.email_address;
  }

  if (isGeneratedAliasProvider(currentState)) {
    if (currentState.mailProvider === GMAIL_PROVIDER) {
      if (!currentState.emailPrefix) {
        throw new Error('Gmail 原邮箱未设置，请先在侧边栏填写。');
      }
      await addLog(`=== 鐩爣 ${targetRun}/${totalRuns} 杞細Gmail +tag 妯″紡宸插惎鐢紝灏嗗湪姝ラ 3 鑷姩鐢熸垚閭锛堢 ${attemptRuns} 娆″皾璇曪級===`, 'info');
      return null;
    }
    if (!currentState.emailPrefix) {
      throw new Error('2925 邮箱前缀未设置，请先在侧边栏填写。');
    }
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：2925 模式已启用，将在步骤 3 自动生成邮箱（第 ${attemptRuns} 次尝试）===`, 'info');
    return null;
  }

  if (currentState.email) {
    return currentState.email;
  }

  if (shouldUseCustomRegistrationEmail(currentState)) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮已暂停：请先填写自定义注册邮箱，然后继续 ===`, 'warn');
    await broadcastAutoRunStatus('waiting_email', {
      currentRun: targetRun,
      totalRuns,
      attemptRun: attemptRuns,
    });

    await waitForResume();

    const resumedState = await getState();
    if (!resumedState.email) {
      throw new Error('无法继续：当前没有注册邮箱。');
    }
    return resumedState.email;
  }

  const generator = normalizeEmailGenerator(currentState.emailGenerator);
  const generatorLabel = getEmailGeneratorLabel(generator);
  let lastError = null;
  for (let attempt = 1; attempt <= EMAIL_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await addLog(`${generatorLabel}：正在进行第 ${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS} 次自动获取重试...`, 'warn');
      }
      const generatedEmail = await fetchGeneratedEmail(currentState, { generateNew: true, generator });
      await addLog(
        `=== 目标 ${targetRun}/${totalRuns} 轮：${generatorLabel}已就绪：${generatedEmail}（第 ${attemptRuns} 次尝试，第 ${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS} 次获取）===`,
        'ok'
      );
      return generatedEmail;
    } catch (err) {
      lastError = err;
      await addLog(`${generatorLabel}自动获取失败（${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS}）：${err.message}`, 'warn');
      if (
        (generator === 'cloudflare' && /域名/.test(String(err.message || '')))
        || (generator === CLOUDFLARE_TEMP_EMAIL_GENERATOR && /(服务地址|Admin Auth|域名)/.test(String(err.message || '')))
      ) {
        break;
      }
    }
  }

  await addLog(`${generatorLabel}自动获取已连续失败 ${EMAIL_FETCH_MAX_ATTEMPTS} 次：${lastError?.message || '未知错误'}`, 'error');
  await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮已暂停：请先自动获取邮箱或手动粘贴邮箱，然后继续 ===`, 'warn');
  await broadcastAutoRunStatus('waiting_email', {
    currentRun: targetRun,
    totalRuns,
    attemptRun: attemptRuns,
  });

  await waitForResume();

  const resumedState = await getState();
  if (!resumedState.email) {
    throw new Error('无法继续：当前没有邮箱地址。');
  }
  return resumedState.email;
}

async function runAutoSequenceFromStep(startStep, context = {}) {
  const { targetRun, totalRuns, attemptRuns, continued = false } = context;
  const maxStep9RestartAttempts = 5;
  let step9RestartAttempts = 0;

  if (continued) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：继续当前进度，从步骤 ${startStep} 开始（第 ${attemptRuns} 次尝试）===`, 'info');
  } else {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：第 ${attemptRuns} 次尝试，阶段 1，打开官网并进入密码页 ===`, 'info');
  }

  if (startStep <= 1) {
    await executeStepAndWait(1, AUTO_STEP_DELAYS[1]);
  }

  if (startStep <= 2) {
    await ensureAutoEmailReady(targetRun, totalRuns, attemptRuns);
    await executeStepAndWait(2, AUTO_STEP_DELAYS[2]);
  }

  if (startStep <= 3) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：阶段 2，填写密码、验证、登录并完成授权（第 ${attemptRuns} 次尝试）===`, 'info');
    await broadcastAutoRunStatus('running', {
      currentRun: targetRun,
      totalRuns,
      attemptRun: attemptRuns,
    });
    await executeStepAndWait(3, AUTO_STEP_DELAYS[3]);
  } else {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：继续执行剩余流程（第 ${attemptRuns} 次尝试）===`, 'info');
  }

  const signupTabId = await getTabId('signup-page');
  if (signupTabId) {
    await chrome.tabs.update(signupTabId, { active: true });
  }

  let step = Math.max(startStep, 4);
  while (step <= 9) {
    try {
      await executeStepAndWait(step, AUTO_STEP_DELAYS[step]);
      const latestState = await getState();
      if (step === 6 && shouldSkipLoginVerificationForCpaCallback(latestState)) {
        step = 8;
        continue;
      }
      step += 1;
    } catch (err) {
      const latestState = await getState();
      const currentMail = getMailConfig(latestState);
      const shouldRetryStep9 = step === 9
        && (
          isLegacyStep9RecoverableAuthError(err)
          || (currentMail.provider === HOTMAIL_PROVIDER && isStep9RecoverableAuthError(err))
        )
        && step9RestartAttempts < maxStep9RestartAttempts;

      if (shouldRetryStep9) {
        step9RestartAttempts += 1;
        await addLog(
          `步骤 9：检测到 CPA 认证失败，正在回到步骤 6 重新开始授权流程（${step9RestartAttempts}/${maxStep9RestartAttempts}）...`,
          'warn'
        );
        await invalidateDownstreamAfterStepRestart(6, {
          logLabel: `步骤 9 认证失败后准备回到步骤 6 重试（${step9RestartAttempts}/${maxStep9RestartAttempts}）`,
        });
        step = 6;
        continue;
      }
      throw err;
    }
  }
}

async function waitForResume() {
  throwIfStopped();
  const state = await getState();
  if (state.email) {
    await addLog('邮箱已就绪，自动继续后续步骤...', 'info');
    return;
  }

  return new Promise((resolve, reject) => {
    resumeWaiter = { resolve, reject };
  });
}

function createAutoRunRoundSummary(round) {
  return {
    round,
    status: 'pending',
    attempts: 0,
    failureReasons: [],
    finalFailureReason: '',
  };
}

function normalizeAutoRunRoundSummary(summary, round) {
  const base = createAutoRunRoundSummary(round);
  if (!summary || typeof summary !== 'object') {
    return base;
  }

  const status = String(summary.status || '').trim().toLowerCase();
  return {
    round,
    status: ['pending', 'success', 'failed'].includes(status) ? status : base.status,
    attempts: Math.max(0, Math.floor(Number(summary.attempts) || 0)),
    failureReasons: Array.isArray(summary.failureReasons)
      ? summary.failureReasons.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    finalFailureReason: String(summary.finalFailureReason || '').trim(),
  };
}

function buildAutoRunRoundSummaries(totalRuns, rawSummaries = []) {
  return Array.from({ length: totalRuns }, (_, index) => {
    return normalizeAutoRunRoundSummary(rawSummaries[index], index + 1);
  });
}

function serializeAutoRunRoundSummaries(totalRuns, roundSummaries = []) {
  return buildAutoRunRoundSummaries(totalRuns, roundSummaries).map((summary) => ({
    ...summary,
    failureReasons: [...summary.failureReasons],
  }));
}

function getAutoRunRoundRetryCount(summary) {
  return Math.max(0, Number(summary?.attempts || 0) - 1);
}

function formatAutoRunFailureReasons(reasons = []) {
  if (!Array.isArray(reasons) || !reasons.length) {
    return '未知错误';
  }

  const counts = new Map();
  for (const reason of reasons) {
    const normalized = String(reason || '').trim() || '未知错误';
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => (count > 1 ? `${reason}（${count}次）` : reason))
    .join('；');
}

async function logAutoRunFinalSummary(totalRuns, roundSummaries = []) {
  const summaries = buildAutoRunRoundSummaries(totalRuns, roundSummaries);
  const successRounds = summaries.filter((item) => item.status === 'success');
  const failedRounds = summaries.filter((item) => item.status === 'failed');
  const pendingRounds = summaries.filter((item) => item.status === 'pending');

  await addLog('=== 自动运行汇总 ===', failedRounds.length ? 'warn' : 'ok');
  await addLog(
    `总轮数：${totalRuns}；成功：${successRounds.length}；失败：${failedRounds.length}；未完成：${pendingRounds.length}`,
    failedRounds.length ? 'warn' : 'ok'
  );

  if (successRounds.length) {
    await addLog(
      `成功轮次：${successRounds
        .map((item) => `第 ${item.round} 轮（重试 ${getAutoRunRoundRetryCount(item)} 次）`)
        .join('；')}`,
      'ok'
    );
  }

  if (failedRounds.length) {
    await addLog(
      `失败轮次：${failedRounds
        .map((item) => {
          const retryCount = getAutoRunRoundRetryCount(item);
          const finalReason = item.finalFailureReason || item.failureReasons[item.failureReasons.length - 1] || '未知错误';
          const reasonSummary = formatAutoRunFailureReasons(item.failureReasons);
          return `第 ${item.round} 轮（重试 ${retryCount} 次，最终原因：${finalReason}；失败记录：${reasonSummary}）`;
        })
        .join('；')}`,
      'error'
    );
  }

  if (pendingRounds.length) {
    await addLog(
      `未完成轮次：${pendingRounds.map((item) => `第 ${item.round} 轮`).join('；')}`,
      'warn'
    );
  }
}

async function skipAutoRunCountdown() {
  const state = await getState();
  const plan = getPendingAutoRunTimerPlan(state);
  if (!plan || state.autoRunPhase !== 'waiting_interval') {
    return false;
  }

  return launchAutoRunTimerPlan('manual', {
    expectedKinds: [
      AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
      AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
    ],
  });
}

async function waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, options = {}) {
  const { autoRunSkipFailures = false, roundSummaries = [] } = options;
  if (totalRuns <= 1 || targetRun >= totalRuns) {
    return false;
  }

  const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
    (await getState()).autoRunFallbackThreadIntervalMinutes
  );
  if (fallbackThreadIntervalMinutes <= 0) {
    return false;
  }

  const statusLabel = roundSummary?.status === 'failed' ? '失败' : '完成';
  await addLog(
    `线程间隔：第 ${targetRun}/${totalRuns} 轮已${statusLabel}，等待 ${fallbackThreadIntervalMinutes} 分钟后开始下一轮。`,
    'info'
  );
  await persistAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
    fireAt: Date.now() + fallbackThreadIntervalMinutes * 60 * 1000,
    currentRun: targetRun,
    totalRuns,
    attemptRun: autoRunAttemptRun,
    autoRunSkipFailures,
    roundSummaries,
    countdownTitle: '线程间隔中',
    countdownNote: `第 ${Math.min(targetRun + 1, totalRuns)}/${totalRuns} 轮即将开始`,
  }, {
    autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
  });
  autoRunActive = false;
  return true;
}

async function waitBeforeAutoRunRetry(targetRun, totalRuns, nextAttemptRun, options = {}) {
  const { autoRunSkipFailures = false, roundSummaries = [] } = options;
  const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
    (await getState()).autoRunFallbackThreadIntervalMinutes
  );
  if (fallbackThreadIntervalMinutes <= 0) {
    return false;
  }

  await addLog(
    `线程间隔：等待 ${fallbackThreadIntervalMinutes} 分钟后开始第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试。`,
    'info'
  );
  await persistAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
    fireAt: Date.now() + fallbackThreadIntervalMinutes * 60 * 1000,
    currentRun: targetRun,
    totalRuns,
    attemptRun: nextAttemptRun,
    autoRunSkipFailures,
    roundSummaries,
    countdownTitle: '线程间隔中',
    countdownNote: `第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试即将开始`,
  }, {
    autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
  });
  autoRunActive = false;
  return true;
}

async function handleAutoRunLoopUnhandledError(error) {
  console.error(LOG_PREFIX, 'Auto run loop crashed:', error);
  if (!isStopError(error)) {
    await addLog(`自动运行异常终止：${getErrorMessage(error) || '未知错误'}`, 'error');
  }

  autoRunActive = false;
  await broadcastAutoRunStatus('stopped', {
    currentRun: autoRunCurrentRun,
    totalRuns: autoRunTotalRuns,
    attemptRun: autoRunAttemptRun,
  }, {
    autoRunTimerPlan: null,
    scheduledAutoRunPlan: null,
  });
  clearStopRequest();
}

function startAutoRunLoop(totalRuns, options = {}) {
  autoRunLoop(totalRuns, options).catch((error) => {
    handleAutoRunLoopUnhandledError(error).catch((handlerError) => {
      console.error(LOG_PREFIX, 'Failed to finalize auto run error:', handlerError);
    });
  });
}

async function autoRunLoop(totalRuns, options = {}) {
  if (autoRunActive) {
    await addLog('自动运行已在进行中', 'warn');
    return;
  }

  clearStopRequest();
  autoRunActive = true;
  autoRunTotalRuns = totalRuns;
  autoRunCurrentRun = 0;
  autoRunAttemptRun = 0;
  const autoRunSkipFailures = Boolean(options.autoRunSkipFailures);
  const initialMode = options.mode === 'continue' ? 'continue' : 'restart';
  const resumeCurrentRun = Number.isInteger(options.resumeCurrentRun) && options.resumeCurrentRun > 0
    ? Math.min(totalRuns, options.resumeCurrentRun)
    : 1;
  const resumeAttemptRun = Number.isInteger(options.resumeAttemptRun) && options.resumeAttemptRun > 0
    ? Math.min(AUTO_RUN_MAX_RETRIES_PER_ROUND + 1, options.resumeAttemptRun)
    : 1;
  let continueCurrentOnFirstAttempt = initialMode === 'continue';
  let forceFreshTabsNextRun = false;
  let stoppedEarly = false;
  let parkedByTimer = false;
  const roundSummaries = buildAutoRunRoundSummaries(totalRuns, options.resumeRoundSummaries);

  if (continueCurrentOnFirstAttempt && resumeCurrentRun > 1) {
    for (let round = 1; round < resumeCurrentRun; round += 1) {
      const summary = roundSummaries[round - 1];
      if (summary.status === 'pending') {
        summary.status = 'success';
        if (!summary.attempts) {
          summary.attempts = 1;
        }
      }
    }
  }

  let successfulRuns = roundSummaries.filter((item) => item.status === 'success').length;
  const initialState = await getState();
  const initialPhase = continueCurrentOnFirstAttempt && getRunningSteps(initialState.stepStatuses).length
    ? 'waiting_step'
    : 'running';
  const showResumePosition = continueCurrentOnFirstAttempt || resumeCurrentRun > 1 || resumeAttemptRun > 1;

  await setState({
    autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
    ...getAutoRunStatusPayload(initialPhase, {
      currentRun: showResumePosition ? resumeCurrentRun : 0,
      totalRuns,
      attemptRun: showResumePosition ? resumeAttemptRun : 0,
    }),
  });

  for (let targetRun = resumeCurrentRun; targetRun <= totalRuns; targetRun += 1) {
    const roundSummary = roundSummaries[targetRun - 1];
    const resumingCurrentRound = continueCurrentOnFirstAttempt && targetRun === resumeCurrentRun;
    let attemptRun = resumingCurrentRound ? resumeAttemptRun : 1;
    let reuseExistingProgress = resumingCurrentRound;
    const maxAttemptsForRound = autoRunSkipFailures
      ? AUTO_RUN_MAX_RETRIES_PER_ROUND + 1
      : Math.max(1, attemptRun);

    while (attemptRun <= maxAttemptsForRound) {
      autoRunCurrentRun = targetRun;
      autoRunAttemptRun = attemptRun;
      roundSummary.attempts = attemptRun;
      let startStep = 1;
      let useExistingProgress = false;

      if (reuseExistingProgress) {
        let currentState = await getState();
        if (getRunningSteps(currentState.stepStatuses).length) {
          currentState = await waitForRunningStepsToFinish({
            currentRun: targetRun,
            totalRuns,
            attemptRun,
          });
        }
        const resumeStep = getFirstUnfinishedStep(currentState.stepStatuses);
        if (resumeStep && hasSavedProgress(currentState.stepStatuses)) {
          startStep = resumeStep;
          useExistingProgress = true;
        } else if (hasSavedProgress(currentState.stepStatuses)) {
          await addLog('检测到当前流程已处理完成，本轮将改为从步骤 1 重新开始。', 'info');
        }
      }

      if (!useExistingProgress) {
        const prevState = await getState();
        const keepSettings = {
          vpsUrl: prevState.vpsUrl,
          vpsPassword: prevState.vpsPassword,
          customPassword: prevState.customPassword,
          autoRunSkipFailures: prevState.autoRunSkipFailures,
          autoRunFallbackThreadIntervalMinutes: prevState.autoRunFallbackThreadIntervalMinutes,
          autoRunDelayEnabled: prevState.autoRunDelayEnabled,
          autoRunDelayMinutes: prevState.autoRunDelayMinutes,
          autoStepDelaySeconds: prevState.autoStepDelaySeconds,
          mailProvider: prevState.mailProvider,
          emailGenerator: prevState.emailGenerator,
          emailPrefix: prevState.emailPrefix,
          inbucketHost: prevState.inbucketHost,
          inbucketMailbox: prevState.inbucketMailbox,
          cloudflareDomain: prevState.cloudflareDomain,
          cloudflareDomains: prevState.cloudflareDomains,
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
          tabRegistry: {},
          sourceLastUrls: {},
          ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun }),
        };
        await resetState();
        await setState(keepSettings);
        chrome.runtime.sendMessage({ type: 'AUTO_RUN_RESET' }).catch(() => { });
        await sleepWithStop(500);
      } else {
        await setState({
          autoRunSkipFailures,
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
          ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun }),
        });
      }

      if (forceFreshTabsNextRun) {
        await addLog(`上一轮尝试已放弃，当前开始第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试。`, 'warn');
        forceFreshTabsNextRun = false;
      }

      try {
        throwIfStopped();
        await broadcastAutoRunStatus('running', {
          currentRun: targetRun,
          totalRuns,
          attemptRun,
        });

        await runAutoSequenceFromStep(startStep, {
          targetRun,
          totalRuns,
          attemptRuns: attemptRun,
          continued: useExistingProgress,
        });

        roundSummary.status = 'success';
        roundSummary.finalFailureReason = '';
        successfulRuns += 1;
        await setState({
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
        });
        await addLog(`=== 第 ${targetRun}/${totalRuns} 轮完成（第 ${attemptRun} 次尝试成功）===`, 'ok');
        break;
      } catch (err) {
        if (isStopError(err)) {
          stoppedEarly = true;
          await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
          await broadcastAutoRunStatus('stopped', {
            currentRun: targetRun,
            totalRuns,
            attemptRun,
          });
          break;
        }

        const reason = getErrorMessage(err);
        roundSummary.failureReasons.push(reason);
        const canRetry = autoRunSkipFailures && attemptRun < maxAttemptsForRound;

        await setState({
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
        });

        if (canRetry) {
          const retryIndex = attemptRun;
          if (isRestartCurrentAttemptError(err)) {
            await addLog(`第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试需要整轮重开：${reason}`, 'warn');
          } else {
            await addLog(`第 ${targetRun}/${totalRuns} 轮第 ${attemptRun} 次尝试失败：${reason}`, 'error');
          }
          cancelPendingCommands('当前尝试已放弃。');
          await broadcastStopToContentScripts();
          await broadcastAutoRunStatus('retrying', {
            currentRun: targetRun,
            totalRuns,
            attemptRun,
          });
          forceFreshTabsNextRun = true;
          await addLog(
            `自动重试：${Math.round(AUTO_RUN_RETRY_DELAY_MS / 1000)} 秒后开始第 ${targetRun}/${totalRuns} 轮第 ${attemptRun + 1} 次尝试（第 ${retryIndex}/${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试）。`,
            'warn'
          );
          try {
            await sleepWithStop(AUTO_RUN_RETRY_DELAY_MS);
          } catch (sleepError) {
            if (isStopError(sleepError)) {
              stoppedEarly = true;
              await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
              await broadcastAutoRunStatus('stopped', {
                currentRun: targetRun,
                totalRuns,
                attemptRun,
              });
              break;
            }
            throw sleepError;
          }
          try {
            const parkedForRetry = await waitBeforeAutoRunRetry(targetRun, totalRuns, attemptRun + 1, {
              autoRunSkipFailures,
              roundSummaries,
            });
            if (parkedForRetry) {
              parkedByTimer = true;
              break;
            }
          } catch (sleepError) {
            if (isStopError(sleepError)) {
              stoppedEarly = true;
              await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
              await broadcastAutoRunStatus('stopped', {
                currentRun: targetRun,
                totalRuns,
                attemptRun,
              });
              break;
            }
            throw sleepError;
          }
          attemptRun += 1;
          reuseExistingProgress = false;
          continue;
        }

        roundSummary.status = 'failed';
        roundSummary.finalFailureReason = reason;
        await setState({
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
        });
        if (!autoRunSkipFailures) {
          cancelPendingCommands('当前轮执行失败。');
          await broadcastStopToContentScripts();
          await addLog('自动重试未开启，自动运行将在当前失败后停止。', 'warn');
          stoppedEarly = true;
          await broadcastAutoRunStatus('stopped', {
            currentRun: targetRun,
            totalRuns,
            attemptRun,
          });
          break;
        }
        await addLog(`第 ${targetRun}/${totalRuns} 轮最终失败：${reason}`, 'error');
        await addLog(
          targetRun < totalRuns
            ? `第 ${targetRun}/${totalRuns} 轮已达到 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试上限，继续下一轮。`
            : `第 ${targetRun}/${totalRuns} 轮已达到 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次重试上限，本次自动运行结束。`,
          'warn'
        );
        cancelPendingCommands('当前轮已达到重试上限。');
        await broadcastStopToContentScripts();
        forceFreshTabsNextRun = true;
        break;
      } finally {
        reuseExistingProgress = false;
        continueCurrentOnFirstAttempt = false;
      }
    }

    if (stoppedEarly || parkedByTimer) {
      break;
    }

    try {
      const parkedForNextRound = await waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, {
        autoRunSkipFailures,
        roundSummaries,
      });
      if (parkedForNextRound) {
        parkedByTimer = true;
        break;
      }
    } catch (sleepError) {
      if (isStopError(sleepError)) {
        stoppedEarly = true;
        await addLog(`第 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
        await broadcastAutoRunStatus('stopped', {
          currentRun: targetRun,
          totalRuns,
          attemptRun: autoRunAttemptRun,
        });
        break;
      }
      throw sleepError;
    }
  }

  if (parkedByTimer) {
    autoRunActive = false;
    clearStopRequest();
    return;
  }

  await setState({
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
  });
  await logAutoRunFinalSummary(totalRuns, roundSummaries);

  if (stopRequested || stoppedEarly) {
    await addLog(`=== 已停止，完成 ${successfulRuns}/${autoRunTotalRuns} 轮 ===`, 'warn');
    await broadcastAutoRunStatus('stopped', {
      currentRun: autoRunCurrentRun,
      totalRuns: autoRunTotalRuns,
      attemptRun: autoRunAttemptRun,
    });
  } else {
    await addLog(`=== 全部 ${autoRunTotalRuns} 轮已执行完成，成功 ${successfulRuns} 轮 ===`, 'ok');
    await broadcastAutoRunStatus('complete', {
      currentRun: autoRunTotalRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: autoRunAttemptRun,
    });
  }
  autoRunActive = false;
  await setState({
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
    autoRunTimerPlan: null,
    scheduledAutoRunPlan: null,
    ...getAutoRunStatusPayload(stopRequested || stoppedEarly ? 'stopped' : 'complete', {
      currentRun: stopRequested || stoppedEarly ? autoRunCurrentRun : autoRunTotalRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: autoRunAttemptRun,
    }),
  });
  clearStopRequest();
}

async function resumeAutoRun() {
  throwIfStopped();
  const state = await getState();
  if (!state.email) {
    await addLog('无法继续：当前没有邮箱地址，请先在侧边栏填写邮箱。', 'error');
    return false;
  }

  const resumedInMemory = await resumeAutoRunIfWaitingForEmail({ silent: true });
  if (resumedInMemory) {
    return true;
  }

  if (!isAutoRunPausedState(state)) {
    return false;
  }

  if (autoRunActive) {
    return false;
  }

  const totalRuns = state.autoRunTotalRuns || 1;
  const currentRun = state.autoRunCurrentRun || 1;
  const attemptRun = state.autoRunAttemptRun || 1;

  await addLog('检测到自动流程暂停上下文已丢失，正在从当前进度恢复自动运行...', 'warn');
  startAutoRunLoop(totalRuns, {
    autoRunSkipFailures: Boolean(state.autoRunSkipFailures),
    mode: 'continue',
    resumeCurrentRun: currentRun,
    resumeAttemptRun: attemptRun,
    resumeRoundSummaries: state.autoRunRoundSummaries,
  });
  return true;
}

// ============================================================
// Signup / OAuth Helpers
// ============================================================

const SIGNUP_ENTRY_URL = 'https://chatgpt.com/';
const SIGNUP_PAGE_INJECT_FILES = ['content/utils.js', 'content/signup-page.js'];

async function requestOAuthUrlFromPanel(state, options = {}) {
  if (getPanelMode(state) === 'sub2api') {
    return requestSub2ApiOAuthUrl(state, options);
  }
  return requestCpaOAuthUrl(state, options);
}

async function requestCpaOAuthUrl(state, options = {}) {
  const { logLabel = 'OAuth 刷新' } = options;
  if (!state.vpsUrl) {
    throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
  }

  await addLog(`${logLabel}：正在打开 CPA 面板...`);

  const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];
  await closeConflictingTabsForSource('vps-panel', state.vpsUrl);

  const tab = await chrome.tabs.create({ url: state.vpsUrl, active: true });
  const tabId = tab.id;
  await rememberSourceLastUrl('vps-panel', state.vpsUrl);

  await addLog(`${logLabel}：CPA 面板已打开，正在等待页面进入目标地址...`);
  const matchedTab = await waitForTabUrlFamily('vps-panel', tabId, state.vpsUrl, {
    timeoutMs: 15000,
    retryDelayMs: 400,
  });
  if (!matchedTab) {
    await addLog(`${logLabel}：CPA 页面尚未完全进入目标地址，继续尝试连接内容脚本...`, 'warn');
  }

  await ensureContentScriptReadyOnTab('vps-panel', tabId, {
    inject: injectFiles,
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: `${logLabel}：CPA 面板仍在加载，正在重试连接内容脚本...`,
  });

  const result = await sendToContentScriptResilient('vps-panel', {
    type: 'REQUEST_OAUTH_URL',
    source: 'background',
    payload: {
      vpsPassword: state.vpsPassword,
      logStep: 6,
    },
  }, {
    timeoutMs: 30000,
    retryDelayMs: 700,
    logMessage: `${logLabel}：CPA 面板通信未就绪，正在等待页面恢复...`,
  });

  if (result?.error) {
    throw new Error(result.error);
  }
  return result || {};
}

async function requestSub2ApiOAuthUrl(state, options = {}) {
  const { logLabel = 'OAuth 刷新' } = options;
  const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
  const groupName = (state.sub2apiGroupName || DEFAULT_SUB2API_GROUP_NAME).trim() || DEFAULT_SUB2API_GROUP_NAME;

  if (!state.sub2apiEmail) {
    throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
  }
  if (!state.sub2apiPassword) {
    throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
  }

  await addLog(`${logLabel}：正在打开 SUB2API 后台...`);

  const injectFiles = ['content/utils.js', 'content/sub2api-panel.js'];
  await closeConflictingTabsForSource('sub2api-panel', sub2apiUrl);

  const tab = await chrome.tabs.create({ url: sub2apiUrl, active: true });
  const tabId = tab.id;
  await rememberSourceLastUrl('sub2api-panel', sub2apiUrl);

  await addLog(`${logLabel}：SUB2API 页面已打开，正在等待页面进入目标地址...`);
  const matchedTab = await waitForTabUrlFamily('sub2api-panel', tabId, sub2apiUrl, {
    timeoutMs: 15000,
    retryDelayMs: 400,
  });
  if (!matchedTab) {
    await addLog(`${logLabel}：SUB2API 页面尚未稳定，继续尝试连接内容脚本...`, 'warn');
  }

  await ensureContentScriptReadyOnTab('sub2api-panel', tabId, {
    inject: injectFiles,
    injectSource: 'sub2api-panel',
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: `${logLabel}：SUB2API 页面仍在加载，正在重试连接内容脚本...`,
  });

  const result = await sendToContentScript('sub2api-panel', {
    type: 'REQUEST_OAUTH_URL',
    source: 'background',
    payload: {
      sub2apiUrl,
      sub2apiEmail: state.sub2apiEmail,
      sub2apiPassword: state.sub2apiPassword,
      sub2apiGroupName: groupName,
      logStep: 6,
    },
  }, {
    responseTimeoutMs: SUB2API_STEP1_RESPONSE_TIMEOUT_MS,
  });

  if (result?.error) {
    throw new Error(result.error);
  }
  return result || {};
}

async function openSignupEntryTab(step = 1) {
  const tabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
  });

  await ensureContentScriptReadyOnTab('signup-page', tabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: `步骤 ${step}：ChatGPT 官网仍在加载，正在重试连接内容脚本...`,
  });

  return tabId;
}

async function ensureSignupEntryPageReady(step = 1) {
  const tabId = await openSignupEntryTab(step);
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'ENSURE_SIGNUP_ENTRY_READY',
    step,
    source: 'background',
    payload: {},
  }, {
    timeoutMs: 20000,
    retryDelayMs: 700,
    logMessage: `步骤 ${step}：官网注册入口正在切换，等待页面恢复...`,
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return { tabId, result: result || {} };
}

async function ensureSignupPasswordPageReadyInTab(tabId, step = 2, options = {}) {
  const { skipUrlWait = false } = options;

  if (!skipUrlWait) {
    const matchedTab = await waitForTabUrlMatch(tabId, (url) => isSignupPasswordPageUrl(url), {
      timeoutMs: 45000,
      retryDelayMs: 300,
    });
    if (!matchedTab) {
      throw new Error('等待进入密码页超时，请检查邮箱提交后页面是否仍停留在官网或邮箱页。');
    }
  }

  await ensureContentScriptReadyOnTab('signup-page', tabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: `步骤 ${step}：密码页仍在加载，正在重试连接内容脚本...`,
  });

  const result = await sendToContentScriptResilient('signup-page', {
    type: 'ENSURE_SIGNUP_PASSWORD_PAGE_READY',
    step,
    source: 'background',
    payload: {},
  }, {
    timeoutMs: 20000,
    retryDelayMs: 700,
    logMessage: `步骤 ${step}：认证页正在切换，等待密码页重新就绪...`,
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result || {};
}

async function resolveSignupEmailForFlow(state) {
  let resolvedEmail = state.email;
  if (isHotmailProvider(state)) {
    const account = await ensureHotmailAccountForFlow({
      allowAllocate: true,
      markUsed: true,
      preferredAccountId: state.currentHotmailAccountId || null,
    });
    resolvedEmail = account.email;
  } else if (isLuckmailProvider(state)) {
    const purchase = await ensureLuckmailPurchaseForFlow({ allowReuse: true });
    resolvedEmail = purchase.email_address;
  } else if (isGeneratedAliasProvider(state)) {
    resolvedEmail = buildGeneratedAliasEmail(state);
  }

  if (!resolvedEmail) {
    throw new Error('缺少邮箱地址，请先在侧边栏粘贴邮箱。');
  }

  return resolvedEmail;
}

// ============================================================
// Step 1: Open ChatGPT homepage
// ============================================================

async function executeStep1() {
  await addLog('步骤 1：正在打开 ChatGPT 官网...');
  await ensureSignupEntryPageReady(1);
  await completeStepFromBackground(1, {});
}

// ============================================================
// Step 2: Click signup, fill email, continue to password page
// ============================================================

async function executeStep2(state) {
  const resolvedEmail = await resolveSignupEmailForFlow(state);
  if (resolvedEmail !== state.email) {
    await setEmailState(resolvedEmail);
  }

  let signupTabId = await getTabId('signup-page');
  if (!signupTabId || !(await isTabAlive('signup-page'))) {
    await addLog('步骤 2：未发现可用的注册页标签，正在重新打开 ChatGPT 官网...', 'warn');
    signupTabId = (await ensureSignupEntryPageReady(2)).tabId;
  } else {
    await chrome.tabs.update(signupTabId, { active: true });
    await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
      inject: SIGNUP_PAGE_INJECT_FILES,
      injectSource: 'signup-page',
      timeoutMs: 45000,
      retryDelayMs: 900,
      logMessage: '步骤 2：注册入口页内容脚本未就绪，正在等待页面恢复...',
    });
  }

  const step2Result = await sendToContentScriptResilient('signup-page', {
    type: 'EXECUTE_STEP',
    step: 2,
    source: 'background',
    payload: { email: resolvedEmail },
  }, {
    timeoutMs: 20000,
    retryDelayMs: 700,
    logMessage: '步骤 2：官网注册入口正在切换，等待页面恢复后继续输入邮箱...',
  });

  if (step2Result?.error) {
    throw new Error(step2Result.error);
  }

  if (!step2Result?.alreadyOnPasswordPage) {
    await addLog(`步骤 2：邮箱 ${resolvedEmail} 已提交，正在等待进入密码页...`);
  }

  await ensureSignupPasswordPageReadyInTab(signupTabId, 2, {
    skipUrlWait: Boolean(step2Result?.alreadyOnPasswordPage),
  });
  await completeStepFromBackground(2, {});
}

// ============================================================
// Step 3: Fill Password (via signup-page.js)
// ============================================================

async function executeStep3(state) {
  const resolvedEmail = state.email;
  if (!resolvedEmail) {
    throw new Error('缺少邮箱地址，请先完成步骤 2。');
  }

  const signupTabId = await getTabId('signup-page');
  if (!signupTabId || !(await isTabAlive('signup-page'))) {
    throw new Error('认证页面标签页已关闭，请先重新完成步骤 2。');
  }

  const password = state.customPassword || generatePassword();
  await setPasswordState(password);

  const accounts = state.accounts || [];
  accounts.push({ email: resolvedEmail, password, createdAt: new Date().toISOString() });
  await setState({ accounts });

  await chrome.tabs.update(signupTabId, { active: true });
  await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: '步骤 3：密码页内容脚本未就绪，正在等待页面恢复...',
  });

  await addLog(
    `步骤 3：正在填写密码，邮箱为 ${resolvedEmail}，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
  );
  await sendToContentScript('signup-page', {
    type: 'EXECUTE_STEP',
    step: 3,
    source: 'background',
    payload: { email: resolvedEmail, password },
  });
}

// ============================================================
// Step 4: Get Signup Verification Code (qq-mail.js polls, then fills in signup-page.js)
// ============================================================

function getMailConfig(state) {
  const provider = state.mailProvider || 'qq';
  if (provider === 'custom') {
    return { provider: 'custom', label: '自定义邮箱' };
  }
  if (provider === HOTMAIL_PROVIDER) {
    return { provider: HOTMAIL_PROVIDER, label: 'Hotmail（API对接/本地助手）' };
  }
  if (provider === ICLOUD_PROVIDER) {
    const configuredHost = getConfiguredIcloudHostPreference(state)
      || normalizeIcloudHost(state?.preferredIcloudHost)
      || 'icloud.com';
    const loginUrl = getIcloudLoginUrlForHost(configuredHost) || 'https://www.icloud.com/';
    const mailUrl = getIcloudMailUrlForHost(configuredHost) || loginUrl;
    return {
      source: 'icloud-mail',
      url: mailUrl,
      label: 'iCloud 邮箱',
      navigateOnReuse: true,
    };
  }
  if (provider === GMAIL_PROVIDER) {
    return {
      source: 'gmail-mail',
      url: 'https://mail.google.com/mail/u/0/#inbox',
      label: 'Gmail 邮箱',
      inject: ['content/activation-utils.js', 'content/utils.js', 'content/gmail-mail.js'],
      injectSource: 'gmail-mail',
    };
  }
  if (provider === LUCKMAIL_PROVIDER) {
    return { provider: LUCKMAIL_PROVIDER, label: 'LuckMail（API 购邮）' };
  }
  if (provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
    return { provider: CLOUDFLARE_TEMP_EMAIL_PROVIDER, label: 'Cloudflare Temp Email' };
  }
  if (provider === '163') {
    return { source: 'mail-163', url: 'https://mail.163.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D', label: '163 邮箱' };
  }
  if (provider === '163-vip') {
    return { source: 'mail-163', url: 'https://webmail.vip.163.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D', label: '163 VIP 邮箱' };
  }
  if (provider === 'inbucket') {
    const host = normalizeInbucketOrigin(state.inbucketHost);
    const mailbox = (state.inbucketMailbox || '').trim();
    if (!host) {
      return { error: 'Inbucket 主机地址为空或无效。' };
    }
    if (!mailbox) {
      return { error: 'Inbucket 邮箱名称为空。' };
    }
    return {
      source: 'inbucket-mail',
      url: `${host}/m/${encodeURIComponent(mailbox)}/`,
      label: `Inbucket 邮箱（${mailbox}）`,
      navigateOnReuse: true,
      inject: ['content/activation-utils.js', 'content/utils.js', 'content/inbucket-mail.js'],
      injectSource: 'inbucket-mail',
    };
  }
  if (provider === '2925') {
    return {
      source: 'mail-2925',
      url: 'https://2925.com/#/mailList',
      label: '2925 邮箱',
      inject: ['content/utils.js', 'content/mail-2925.js'],
      injectSource: 'mail-2925',
    };
  }
  return { source: 'qq-mail', url: 'https://wx.mail.qq.com/', label: 'QQ 邮箱' };
}

function normalizeInbucketOrigin(rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return '';

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return '';
  }
}

function getVerificationCodeStateKey(step) {
  return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
}

function getVerificationCodeLabel(step) {
  return step === 4 ? '注册' : '登录';
}

async function confirmCustomVerificationStepBypass(step) {
  const verificationLabel = getVerificationCodeLabel(step);
  await addLog(`步骤 ${step}：当前为自定义邮箱模式，请手动在页面中输入${verificationLabel}验证码并进入下一页面。`, 'warn');

  let response = null;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'REQUEST_CUSTOM_VERIFICATION_BYPASS_CONFIRMATION',
      payload: { step },
    });
  } catch {
    throw new Error(`步骤 ${step}：无法打开确认弹窗，请先保持侧边栏打开后重试。`);
  }

  if (response?.error) {
    throw new Error(response.error);
  }
  if (!response?.confirmed) {
    throw new Error(`步骤 ${step}：已取消手动${verificationLabel}验证码确认。`);
  }

  await setState({
    lastEmailTimestamp: null,
    signupVerificationRequestedAt: null,
    loginVerificationRequestedAt: null,
  });
  await setStepStatus(step, 'skipped');
  await addLog(`步骤 ${step}：已确认手动完成${verificationLabel}验证码输入，当前步骤已跳过。`, 'warn');
}

function getVerificationPollPayload(step, state, overrides = {}) {
  if (step === 4) {
    return {
      filterAfterTimestamp: getHotmailVerificationRequestTimestamp(4, state),
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '楠岃瘉', 'confirm'],
      targetEmail: state.email,
      maxAttempts: 5,
      intervalMs: 3000,
      ...overrides,
    };
  }

  return {
    filterAfterTimestamp: getHotmailVerificationRequestTimestamp(7, state),
    senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
    subjectFilters: ['verify', 'verification', 'code', '楠岃瘉', 'confirm', 'login'],
    targetEmail: state.email,
    maxAttempts: 5,
    intervalMs: 3000,
    ...overrides,
  };
}

async function requestVerificationCodeResend(step) {
  throwIfStopped();
  const signupTabId = await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('认证页面标签页已关闭，无法重新请求验证码。');
  }

  throwIfStopped();
  await chrome.tabs.update(signupTabId, { active: true });
  throwIfStopped();
  await addLog(`步骤 ${step}：正在请求新的${getVerificationCodeLabel(step)}验证码...`, 'warn');
  throwIfStopped();

  const result = await sendToContentScript('signup-page', {
    type: 'RESEND_VERIFICATION_CODE',
    step,
    source: 'background',
    payload: {},
  });

  if (result && result.error) {
    throw new Error(result.error);
  }

  const requestedAt = Date.now();
  if (step === 7) {
    await setState({ loginVerificationRequestedAt: requestedAt });
  }

  const currentState = await getState();
  if (currentState.mailProvider === '2925') {
    const mailTabId = await getTabId('mail-2925');
    if (mailTabId) {
      await chrome.tabs.update(mailTabId, { active: true });
      await addLog(`步骤 ${step}：已切换到 2925 邮箱标签页等待新邮件。`, 'info');
    }
  }

  return requestedAt;
}

async function pollFreshVerificationCode(step, state, mail, pollOverrides = {}) {
  const { onResendRequestedAt, ...cleanPollOverrides } = pollOverrides;

  if (mail.provider === HOTMAIL_PROVIDER) {
    const hotmailPollConfig = getHotmailVerificationPollConfig(step);
    return pollHotmailVerificationCode(step, state, {
      ...getVerificationPollPayload(step, state),
      ...hotmailPollConfig,
      ...cleanPollOverrides,
    });
  }
  if (mail.provider === LUCKMAIL_PROVIDER) {
    return pollLuckmailVerificationCode(step, state, {
      ...getVerificationPollPayload(step, state),
      ...pollOverrides,
    });
  }
  if (mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
    return pollCloudflareTempEmailVerificationCode(step, state, {
      ...getVerificationPollPayload(step, state),
      ...pollOverrides,
    });
  }

  if (Number(pollOverrides.resendIntervalMs) > 0) {
    return pollFreshVerificationCodeWithResendInterval(step, state, mail, pollOverrides);
  }

  const stateKey = getVerificationCodeStateKey(step);
  const rejectedCodes = new Set();
  if (state[stateKey]) {
    rejectedCodes.add(state[stateKey]);
  }
  for (const code of (pollOverrides.excludeCodes || [])) {
    if (code) rejectedCodes.add(code);
  }

  let lastError = null;
  let filterAfterTimestamp = cleanPollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
  const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

  for (let round = 1; round <= maxRounds; round++) {
    throwIfStopped();
    if (round > 1) {
      const requestedAt = await requestVerificationCodeResend(step);
      if (typeof onResendRequestedAt === 'function') {
        const nextFilterAfterTimestamp = await onResendRequestedAt(requestedAt);
        if (nextFilterAfterTimestamp !== undefined) {
          filterAfterTimestamp = nextFilterAfterTimestamp;
        }
      }
    }

    const payload = getVerificationPollPayload(step, state, {
      ...cleanPollOverrides,
      filterAfterTimestamp,
      excludeCodes: [...rejectedCodes],
    });

    try {
      const result = await sendToMailContentScriptResilient(
        mail,
        {
          type: 'POLL_EMAIL',
          step,
          source: 'background',
          payload,
        },
        {
          timeoutMs: 45000,
          maxRecoveryAttempts: 2,
        }
      );

      if (result && result.error) {
        throw new Error(result.error);
      }

      if (!result || !result.code) {
        throw new Error(`步骤 ${step}：邮箱轮询结束，但未获取到验证码。`);
      }

      if (rejectedCodes.has(result.code)) {
        throw new Error(`步骤 ${step}：再次收到了相同的${getVerificationCodeLabel(step)}验证码：${result.code}`);
      }

      return result;
    } catch (err) {
      if (isStopError(err)) {
        throw err;
      }
      lastError = err;
      await addLog(`步骤 ${step}：${err.message}`, 'warn');
      if (round < maxRounds) {
        await addLog(`步骤 ${step}：将重新发送验证码后重试（${round + 1}/${maxRounds}）...`, 'warn');
      }
    }
  }

  throw lastError || new Error(`步骤 ${step}：无法获取新的${getVerificationCodeLabel(step)}验证码。`);
}

async function pollFreshVerificationCodeWithResendInterval(step, state, mail, pollOverrides = {}) {
  const stateKey = getVerificationCodeStateKey(step);
  const rejectedCodes = new Set();
  if (state[stateKey]) {
    rejectedCodes.add(state[stateKey]);
  }
  for (const code of (pollOverrides.excludeCodes || [])) {
    if (code) rejectedCodes.add(code);
  }

  const {
    maxRounds: _ignoredMaxRounds,
    resendIntervalMs: _ignoredResendIntervalMs,
    lastResendAt: _ignoredLastResendAt,
    onResendRequestedAt: _ignoredOnResendRequestedAt,
    ...payloadOverrides
  } = pollOverrides;
  const onResendRequestedAt = typeof pollOverrides.onResendRequestedAt === 'function'
    ? pollOverrides.onResendRequestedAt
    : null;
  let lastError = null;
  let filterAfterTimestamp = payloadOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
  const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;
  const resendIntervalMs = Math.max(0, Number(pollOverrides.resendIntervalMs) || 0);
  let lastResendAt = Number(pollOverrides.lastResendAt) || 0;

  for (let round = 1; round <= maxRounds; round++) {
    throwIfStopped();
    if (round > 1) {
      lastResendAt = await requestVerificationCodeResend(step);
      if (onResendRequestedAt) {
        const nextFilterAfterTimestamp = await onResendRequestedAt(lastResendAt);
        if (nextFilterAfterTimestamp !== undefined) {
          filterAfterTimestamp = nextFilterAfterTimestamp;
        }
      }
    }

    while (true) {
      throwIfStopped();
      const payload = getVerificationPollPayload(step, state, {
        ...payloadOverrides,
        filterAfterTimestamp,
        excludeCodes: [...rejectedCodes],
      });

      if (lastResendAt > 0) {
        const remainingBeforeResendMs = Math.max(0, resendIntervalMs - (Date.now() - lastResendAt));
        const baseMaxAttempts = Math.max(1, Number(payload.maxAttempts) || 5);
        const intervalMs = Math.max(1, Number(payload.intervalMs) || 3000);
        payload.maxAttempts = Math.max(1, Math.min(baseMaxAttempts, Math.floor(remainingBeforeResendMs / intervalMs) + 1));
      }

      try {
        const result = await sendToMailContentScriptResilient(
          mail,
          {
            type: 'POLL_EMAIL',
            step,
            source: 'background',
            payload,
          },
          {
            timeoutMs: 45000,
            maxRecoveryAttempts: 2,
          }
        );

        if (result && result.error) {
          throw new Error(result.error);
        }

        if (!result || !result.code) {
          throw new Error(`步骤 ${step}：邮箱轮询结束，但未获取到验证码。`);
        }

        if (rejectedCodes.has(result.code)) {
          throw new Error(`步骤 ${step}：再次收到了相同的${getVerificationCodeLabel(step)}验证码：${result.code}`);
        }

        return {
          ...result,
          lastResendAt,
        };
      } catch (err) {
        if (isStopError(err)) {
          throw err;
        }
        lastError = err;
        await addLog(`步骤 ${step}：${err.message}`, 'warn');
      }

      const remainingBeforeResendMs = lastResendAt > 0
        ? Math.max(0, resendIntervalMs - (Date.now() - lastResendAt))
        : 0;
      if (remainingBeforeResendMs > 0) {
        await addLog(
          `步骤 ${step}：距离下次重新发送验证码还差 ${Math.ceil(remainingBeforeResendMs / 1000)} 秒，继续刷新邮箱（第 ${round}/${maxRounds} 轮）...`,
          'info'
        );
        continue;
      }

      if (round < maxRounds) {
        await addLog(`步骤 ${step}：已到 25 秒重发间隔，准备重新发送验证码（第 ${round + 1}/${maxRounds} 轮）...`, 'warn');
      }
      break;
    }
  }

  throw lastError || new Error(`步骤 ${step}：无法获取新的${getVerificationCodeLabel(step)}验证码。`);
}

async function submitVerificationCode(step, code) {
  const signupTabId = await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('认证页面标签页已关闭，无法填写验证码。');
  }

  await chrome.tabs.update(signupTabId, { active: true });
  const result = await sendToContentScript('signup-page', {
    type: 'FILL_CODE',
    step,
    source: 'background',
    payload: { code },
  });

  if (result && result.error) {
    throw new Error(result.error);
  }

  return result || {};
}

async function resolveVerificationStep(step, state, mail, options = {}) {
  const stateKey = getVerificationCodeStateKey(step);
  const rejectedCodes = new Set();
  const hotmailPollConfig = mail.provider === HOTMAIL_PROVIDER
    ? getHotmailVerificationPollConfig(step)
    : null;
  const ignorePersistedLastCode = Boolean(hotmailPollConfig?.ignorePersistedLastCode);
  if (state[stateKey] && !ignorePersistedLastCode) {
    rejectedCodes.add(state[stateKey]);
  }

  let nextFilterAfterTimestamp = options.filterAfterTimestamp ?? null;
  const requestFreshCodeFirst = options.requestFreshCodeFirst !== undefined
    ? Boolean(options.requestFreshCodeFirst)
    : (hotmailPollConfig?.requestFreshCodeFirst ?? false);
  const maxSubmitAttempts = 3;
  const resendIntervalMs = Math.max(0, Number(options.resendIntervalMs) || 0);
  let lastResendAt = Number(options.lastResendAt) || 0;

  const updateFilterAfterTimestampForStep7 = async (requestedAt) => {
    if (step !== 7 || !requestedAt) {
      return nextFilterAfterTimestamp;
    }

    if (mail.provider === HOTMAIL_PROVIDER) {
      nextFilterAfterTimestamp = getHotmailVerificationRequestTimestamp(7, {
        ...state,
        loginVerificationRequestedAt: requestedAt,
      });
    } else {
      nextFilterAfterTimestamp = Math.max(0, Number(requestedAt) - 60000);
    }

    return nextFilterAfterTimestamp;
  };

  if (requestFreshCodeFirst) {
    try {
      lastResendAt = await requestVerificationCodeResend(step);
      await updateFilterAfterTimestampForStep7(lastResendAt);
      await addLog(`步骤 ${step}：已先请求一封新的${getVerificationCodeLabel(step)}验证码，再开始轮询邮箱。`, 'warn');
    } catch (err) {
      if (isStopError(err)) {
        throw err;
      }
      await addLog(`步骤 ${step}：首次重新获取验证码失败：${err.message}，将继续使用当前时间窗口轮询。`, 'warn');
    }
  }

  if (mail.provider === HOTMAIL_PROVIDER) {
    const initialDelayMs = Number(options.initialDelayMs ?? hotmailPollConfig.initialDelayMs) || 0;
    if (initialDelayMs > 0) {
      await addLog(`步骤 ${step}：等待 ${Math.round(initialDelayMs / 1000)} 秒，让 Hotmail 验证码邮件先到达...`, 'info');
      await sleepWithStop(initialDelayMs);
    }
  }

  for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
    const result = await pollFreshVerificationCode(step, state, mail, {
      excludeCodes: [...rejectedCodes],
      filterAfterTimestamp: nextFilterAfterTimestamp ?? undefined,
      resendIntervalMs,
      lastResendAt,
      onResendRequestedAt: updateFilterAfterTimestampForStep7,
    });
    lastResendAt = Number(result?.lastResendAt) || lastResendAt;

    throwIfStopped();
    await addLog(`步骤 ${step}：已获取${getVerificationCodeLabel(step)}验证码：${result.code}`);
    throwIfStopped();
    const submitResult = await submitVerificationCode(step, result.code);

    if (submitResult.invalidCode) {
      rejectedCodes.add(result.code);
      await addLog(`步骤 ${step}：验证码被页面拒绝：${submitResult.errorText || result.code}`, 'warn');

      if (attempt >= maxSubmitAttempts) {
        throw new Error(`步骤 ${step}：验证码连续失败，已达到 ${maxSubmitAttempts} 次重试上限。`);
      }

      const remainingBeforeResendMs = resendIntervalMs > 0 && lastResendAt > 0
        ? Math.max(0, resendIntervalMs - (Date.now() - lastResendAt))
        : 0;
      if (remainingBeforeResendMs > 0) {
        await addLog(
          `步骤 ${step}：提交失败后距离下次重新发送验证码还差 ${Math.ceil(remainingBeforeResendMs / 1000)} 秒，先继续刷新邮箱（${attempt + 1}/${maxSubmitAttempts}）...`,
          'warn'
        );
        continue;
      }

      lastResendAt = await requestVerificationCodeResend(step);
      await updateFilterAfterTimestampForStep7(lastResendAt);
      await addLog(`步骤 ${step}：提交失败后已请求新验证码（${attempt + 1}/${maxSubmitAttempts}）...`, 'warn');
      continue;
    }

    await setState({
      lastEmailTimestamp: result.emailTimestamp,
      [stateKey]: result.code,
    });

    await completeStepFromBackground(step, {
      emailTimestamp: result.emailTimestamp,
      code: result.code,
    });
    return;
  }
}

async function executeStep4(state) {
  const mail = getMailConfig(state);
  if (mail.error) throw new Error(mail.error);
  const stepStartedAt = Date.now();
  const signupTabId = await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('认证页面标签页已关闭，无法继续步骤 4。');
  }

  await chrome.tabs.update(signupTabId, { active: true });
  throwIfStopped();
  await addLog('步骤 4：正在确认注册验证码页面是否就绪，必要时自动恢复密码页超时报错...');
  const prepareResult = await sendToContentScriptResilient(
    'signup-page',
    {
      type: 'PREPARE_SIGNUP_VERIFICATION',
      step: 4,
      source: 'background',
      payload: { password: state.password || state.customPassword || '' },
    },
    {
      timeoutMs: 30000,
      retryDelayMs: 700,
      logMessage: '步骤 4：认证页正在切换，等待页面重新就绪后继续检测...',
    }
  );

  if (prepareResult && prepareResult.error) {
    throw new Error(prepareResult.error);
  }
  if (prepareResult?.alreadyVerified) {
    await completeStepFromBackground(4, {});
    return;
  }

  if (shouldUseCustomRegistrationEmail(state)) {
    await confirmCustomVerificationStepBypass(4);
    return;
  }

  throwIfStopped();
  if (mail.provider === HOTMAIL_PROVIDER || mail.provider === LUCKMAIL_PROVIDER || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
    await addLog(`步骤 4：正在通过 ${mail.label} 轮询验证码...`);
  } else {
    await addLog(`步骤 4：正在打开${mail.label}...`);

    // For mail tabs, only create if not alive — don't navigate (preserves login session)
    const alive = await isTabAlive(mail.source);
    if (alive) {
      if (mail.navigateOnReuse) {
        await reuseOrCreateTab(mail.source, mail.url, {
          inject: mail.inject,
          injectSource: mail.injectSource,
        });
      } else {
        const tabId = await getTabId(mail.source);
        await chrome.tabs.update(tabId, { active: true });
      }
    } else {
      await reuseOrCreateTab(mail.source, mail.url, {
        inject: mail.inject,
        injectSource: mail.injectSource,
      });
    }
  }

  await resolveVerificationStep(4, state, mail, {
    filterAfterTimestamp: mail.provider === HOTMAIL_PROVIDER ? undefined : stepStartedAt,
    requestFreshCodeFirst: mail.provider === HOTMAIL_PROVIDER ? false : true,
    resendIntervalMs: mail.provider === HOTMAIL_PROVIDER ? 0 : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
  });
  return;
}

// ============================================================
// Step 5: Fill Name & Birthday (via signup-page.js)
// ============================================================

async function waitForStep5ChatgptRedirect(tabId, timeoutMs = 15000) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  const matchedTab = await waitForTabUrlMatch(tabId, (url) => /chatgpt\.com/i.test(url || ''), {
    timeoutMs,
    retryDelayMs: 300,
  });
  if (matchedTab) {
    return matchedTab;
  }

  const currentTab = await chrome.tabs.get(tabId).catch(() => null);
  if (currentTab && /chatgpt\.com/i.test(currentTab.url || '')) {
    return currentTab;
  }

  return null;
}

async function executeStep5(state) {
  const { firstName, lastName } = generateRandomName();
  const { year, month, day } = generateRandomBirthday();

  await addLog(`步骤 5：已生成姓名 ${firstName} ${lastName}，生日 ${year}-${month}-${day}`);

  let step5Result = null;
  let step5TransportError = null;

  try {
    step5Result = await sendToContentScript('signup-page', {
      type: 'EXECUTE_STEP',
      step: 5,
      source: 'background',
      payload: { firstName, lastName, year, month, day },
    });
  } catch (err) {
    // Cross-origin navigation (auth page → chatgpt.com) destroys the content
    // script, causing a transport error. Capture it so we can check if the tab
    // ended up on chatgpt.com onboarding.
    if (isRetryableContentScriptTransportError(err)) {
      step5TransportError = err;
      console.log(LOG_PREFIX, '步骤 5：内容脚本通信中断，正在检查是否跳转到 ChatGPT 引导页...', err?.message);
    } else {
      throw err;
    }
  }

  // Case 1: content script successfully detected chatgpt redirect before dying
  if (step5Result?.chatgptOnboarding) {
    await addLog('步骤 5：检测到 ChatGPT 引导页跳转，正在处理引导页跳过...');
    await handleChatgptOnboardingSkip();
    return;
  }

  if (step5Result?.chatgptHome) {
    await addLog('步骤 5：检测到已进入 ChatGPT 页面，注册成功。', 'ok');
    return;
  }

  // Case 2: content script died due to cross-origin navigation — check tab URL
  if (step5TransportError) {
    const signupTabId = await getTabId('signup-page');
    const redirectedTab = await waitForStep5ChatgptRedirect(signupTabId);
    if (redirectedTab) {
      await addLog('步骤 5：内容脚本因页面跳转到 ChatGPT 而断开，正在处理引导页跳过...');
      await handleChatgptOnboardingSkip(redirectedTab.id);
      return;
    }
    // Not on chatgpt.com — re-throw the original error
    throw step5TransportError;
  }
}

async function handleChatgptOnboardingSkip(knownTabId) {
  const signupTabId = knownTabId || await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('步骤 5：无法找到注册页标签页，无法处理 ChatGPT 引导页。');
  }

  // Wait for the tab to navigate to chatgpt.com (may already be there)
  const start = Date.now();
  const timeout = 15000;
  let tabUrl = '';
  while (Date.now() - start < timeout) {
    throwIfStopped();
    const tab = await chrome.tabs.get(signupTabId).catch(() => null);
    if (tab && /chatgpt\.com/i.test(tab.url || '')) {
      tabUrl = tab.url;
      break;
    }
    await sleepWithStop(500);
  }

  if (!tabUrl) {
    throw new Error('步骤 5：等待页面跳转到 ChatGPT 引导页超时。');
  }

  // Wait for page to finish loading
  await sleepWithStop(2000);

  // Inject content script on chatgpt.com
  await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: 15000,
    logMessage: '步骤 5：正在等待 ChatGPT 引导页内容脚本就绪...',
  });

  // Send CHATGPT_SKIP_ONBOARDING message
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'CHATGPT_SKIP_ONBOARDING',
    source: 'background',
    payload: {},
  }, {
    timeoutMs: 60000,
    retryDelayMs: 1000,
    logMessage: '步骤 5：ChatGPT 引导页正在处理，等待跳过完成...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  if (result?.alreadyCompleted) {
    await addLog('步骤 5：已进入 ChatGPT 页面，无需继续跳过引导，注册成功。', 'ok');
    await completeStepFromBackground(5, { chatgptHome: true });
    return;
  }

  await addLog('步骤 5：ChatGPT 引导页跳过完成，注册成功。', 'ok');
  await completeStepFromBackground(5, { chatgptOnboarding: true });
}

// ============================================================
// Step 6 Cookie Cleanup
// ============================================================

function normalizeCookieDomainForMatch(domain) {
  return String(domain || '').trim().replace(/^\.+/, '').toLowerCase();
}

function shouldClearPreLoginCookie(cookie) {
  const domain = normalizeCookieDomainForMatch(cookie?.domain);
  if (!domain) return false;
  return PRE_LOGIN_COOKIE_CLEAR_DOMAINS.some((target) => (
    domain === target || domain.endsWith(`.${target}`)
  ));
}

function buildCookieRemovalUrl(cookie) {
  const host = normalizeCookieDomainForMatch(cookie?.domain);
  const path = String(cookie?.path || '/').startsWith('/')
    ? String(cookie?.path || '/')
    : `/${String(cookie?.path || '')}`;
  return `https://${host}${path}`;
}

async function collectCookiesForPreLoginCleanup() {
  if (!chrome.cookies?.getAll) {
    return [];
  }

  const stores = chrome.cookies.getAllCookieStores
    ? await chrome.cookies.getAllCookieStores()
    : [{ id: undefined }];
  const cookies = [];
  const seen = new Set();

  for (const store of stores) {
    const storeId = store?.id;
    const batch = await chrome.cookies.getAll(storeId ? { storeId } : {});
    for (const cookie of batch || []) {
      if (!shouldClearPreLoginCookie(cookie)) continue;
      const key = [
        cookie.storeId || storeId || '',
        cookie.domain || '',
        cookie.path || '',
        cookie.name || '',
        cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      cookies.push(cookie);
    }
  }

  return cookies;
}

async function removeCookieDirectly(cookie) {
  const details = {
    url: buildCookieRemovalUrl(cookie),
    name: cookie.name,
  };

  if (cookie.storeId) {
    details.storeId = cookie.storeId;
  }
  if (cookie.partitionKey) {
    details.partitionKey = cookie.partitionKey;
  }

  try {
    const result = await chrome.cookies.remove(details);
    return Boolean(result);
  } catch (err) {
    console.warn(LOG_PREFIX, '[removeCookieDirectly] failed', {
      domain: cookie?.domain,
      name: cookie?.name,
      message: getErrorMessage(err),
    });
    return false;
  }
}

async function runPreStep6CookieCleanup() {
  await addLog(
    `步骤 6：开始前等待 ${Math.round(STEP6_PRE_LOGIN_COOKIE_CLEAR_DELAY_MS / 1000)} 秒，然后直接删除 ChatGPT / OpenAI cookies...`,
    'info'
  );

  await sleepWithStop(STEP6_PRE_LOGIN_COOKIE_CLEAR_DELAY_MS);

  if (!chrome.cookies?.getAll || !chrome.cookies?.remove) {
    await addLog('步骤 6：当前浏览器不支持 cookies API，无法直接删除 cookies。', 'warn');
    return;
  }

  const cookies = await collectCookiesForPreLoginCleanup();
  let removedCount = 0;

  for (const cookie of cookies) {
    throwIfStopped();
    if (await removeCookieDirectly(cookie)) {
      removedCount += 1;
    }
  }

  if (chrome.browsingData?.removeCookies) {
    try {
      await chrome.browsingData.removeCookies({
        since: 0,
        origins: PRE_LOGIN_COOKIE_CLEAR_ORIGINS,
      });
    } catch (err) {
      await addLog(`步骤 6：browsingData 补扫 cookies 失败：${getErrorMessage(err)}`, 'warn');
    }
  }

  await addLog(`步骤 6：已直接删除 ${removedCount} 个 ChatGPT / OpenAI cookies，准备继续获取链接并登录。`, 'ok');
}

// ============================================================
// Step 6: Login and ensure the auth page reaches the login verification page
// ============================================================

async function refreshOAuthUrlBeforeStep6(state) {
  await addLog(`步骤 6：正在刷新登录用的 ${getPanelModeLabel(state)} OAuth 链接...`);
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] requesting fresh OAuth directly from panel');
  const refreshResult = await requestOAuthUrlFromPanel(state, { logLabel: '步骤 6' });
  await handleStepData(1, refreshResult);

  if (!refreshResult?.oauthUrl) {
    throw new Error('刷新 OAuth 链接后仍未拿到可用链接。');
  }

  return refreshResult.oauthUrl;
}

function isStep6SuccessResult(result) {
  return result?.step6Outcome === 'success';
}

function isStep6RecoverableResult(result) {
  return result?.step6Outcome === 'recoverable';
}

async function getLoginAuthStateFromContent() {
  const result = await sendToContentScriptResilient(
    'signup-page',
    {
      type: 'GET_LOGIN_AUTH_STATE',
      source: 'background',
      payload: {},
    },
    {
      timeoutMs: 15000,
      retryDelayMs: 600,
      logMessage: '步骤 7：认证页正在切换，等待页面重新就绪后继续确认验证码页状态...',
    }
  );

  if (result?.error) {
    throw new Error(result.error);
  }

  return result || {};
}

async function ensureStep7VerificationPageReady() {
  const pageState = await getLoginAuthStateFromContent();
  if (pageState.state === 'verification_page') {
    return pageState;
  }

  const stateLabel = getLoginAuthStateLabel(pageState.state);
  const urlPart = pageState.url ? ` URL: ${pageState.url}` : '';
  throw new Error(`当前未进入登录验证码页面，请先重新完成步骤 6。当前状态：${stateLabel}.${urlPart}`.trim());
}

async function skipLoginVerificationStepsForCpaCallback() {
  await setState({
    lastLoginCode: null,
    loginVerificationRequestedAt: null,
  });
  await setStepStatus(6, 'skipped');
  await addLog('步骤 6：当前已选择“第六步回调”，直接跳过步骤 6、7。', 'warn');
  const latestState = await getState();
  if (!isStepDoneStatus(latestState.stepStatuses?.[7])) {
    await setStepStatus(7, 'skipped');
    await addLog('步骤 7：当前已选择“第六步回调”，本轮无需获取登录验证码。', 'warn');
  }
}

async function executeStep6(state) {
  if (shouldSkipLoginVerificationForCpaCallback(state)) {
    await skipLoginVerificationStepsForCpaCallback();
    return;
  }
  if (!state.email) {
    throw new Error('缺少邮箱地址，请先完成步骤 3。');
  }

  await runPreStep6CookieCleanup();

  let attempt = 0;

  while (true) {
    throwIfStopped();
    attempt += 1;
    const currentState = attempt === 1 ? state : await getState();
    const password = currentState.password || currentState.customPassword || '';
    const oauthUrl = await refreshOAuthUrlBeforeStep6(currentState);

    if (attempt === 1) {
      await addLog('步骤 6：正在打开最新 OAuth 链接并登录...');
    } else {
      await addLog(`步骤 6：上一轮登录未进入验证码页，正在重新发起第 ${attempt} 轮登录尝试...`, 'warn');
    }

    await reuseOrCreateTab('signup-page', oauthUrl);

    const result = await sendToContentScriptResilient(
      'signup-page',
      {
        type: 'EXECUTE_STEP',
        step: 6,
        source: 'background',
        payload: {
          email: currentState.email,
          password,
        },
      },
      {
        timeoutMs: 180000,
        retryDelayMs: 700,
        logMessage: '步骤 6：认证页正在切换，等待页面重新就绪后继续登录...',
      }
    );

    if (result?.error) {
      throw new Error(result.error);
    }

    if (isStep6SuccessResult(result)) {
      await completeStepFromBackground(6, {
        loginVerificationRequestedAt: result.loginVerificationRequestedAt || null,
      });
      return;
    }

    if (isStep6RecoverableResult(result)) {
      const reasonMessage = result.message
        || `当前停留在${getLoginAuthStateLabel(result.state)}，准备重新执行步骤 6。`;
      await addLog(`步骤 6：${reasonMessage}`, 'warn');
      continue;
    }

    throw new Error('步骤 6：认证页未返回可识别的登录结果。');
  }
}

// ============================================================
// Step 7: Poll login verification mail and submit the login code
// ============================================================

async function runStep7Attempt(state) {
  const mail = getMailConfig(state);
  if (mail.error) throw new Error(mail.error);
  const stepStartedAt = Date.now();
  const authTabId = await getTabId('signup-page');

  if (authTabId) {
    await chrome.tabs.update(authTabId, { active: true });
  } else {
    if (!state.oauthUrl) {
      throw new Error('缺少登录用 OAuth 链接，请先完成步骤 6。');
    }
    await reuseOrCreateTab('signup-page', state.oauthUrl);
  }

  throwIfStopped();
  await ensureStep7VerificationPageReady();
  await addLog('步骤 7：登录验证码页面已就绪，开始获取验证码。', 'info');

  if (shouldUseCustomRegistrationEmail(state)) {
    await confirmCustomVerificationStepBypass(7);
    return;
  }

  throwIfStopped();
  if (mail.provider === HOTMAIL_PROVIDER || mail.provider === LUCKMAIL_PROVIDER || mail.provider === CLOUDFLARE_TEMP_EMAIL_PROVIDER) {
    await addLog(`步骤 7：正在通过 ${mail.label} 轮询验证码...`);
  } else {
    await addLog(`步骤 7：正在打开${mail.label}...`);

    const alive = await isTabAlive(mail.source);
    if (alive) {
      if (mail.navigateOnReuse) {
        await reuseOrCreateTab(mail.source, mail.url, {
          inject: mail.inject,
          injectSource: mail.injectSource,
        });
      } else {
        const tabId = await getTabId(mail.source);
        await chrome.tabs.update(tabId, { active: true });
      }
    } else {
      await reuseOrCreateTab(mail.source, mail.url, {
        inject: mail.inject,
        injectSource: mail.injectSource,
      });
    }
  }

  await resolveVerificationStep(7, state, mail, {
    filterAfterTimestamp: mail.provider === HOTMAIL_PROVIDER ? undefined : Math.max(0, stepStartedAt - 60000),
    requestFreshCodeFirst: false,
    resendIntervalMs: mail.provider === HOTMAIL_PROVIDER ? 0 : STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
  });
}

async function rerunStep6ForStep7Recovery() {
  const currentState = await getState();
  await addLog('步骤 7：正在回到步骤 6，重新发起登录验证码流程...', 'warn');
  await executeStep6(currentState);
  await sleepWithStop(3000);
}

async function executeStep7(state) {
  if (shouldSkipLoginVerificationForCpaCallback(state)) {
    await setState({
      lastLoginCode: null,
      loginVerificationRequestedAt: null,
    });
    await setStepStatus(7, 'skipped');
    await addLog('步骤 7：当前已选择“第六步回调”，本轮无需获取登录验证码。', 'warn');
    return;
  }

  let currentState = state;
  let mailPollingAttempt = 1;
  let lastMailPollingError = null;

  while (true) {
    try {
      await runStep7Attempt(currentState);
      return;
    } catch (err) {
      if (!isVerificationMailPollingError(err)) {
        throw err;
      }

      lastMailPollingError = err;
      if (mailPollingAttempt >= STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS) {
        break;
      }

      mailPollingAttempt += 1;
      await addLog(
        `步骤 7：检测到邮箱轮询类失败，准备从步骤 6 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`,
        'warn'
      );
      await rerunStep6ForStep7Recovery();
      currentState = await getState();
    }
  }

  if (lastMailPollingError) {
    throw new Error(
      `步骤 7：登录验证码流程在 ${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS} 轮邮箱轮询恢复后仍未成功。最后一次原因：${lastMailPollingError.message}`
    );
  }

  throw new Error('步骤 7：登录验证码流程未成功完成。');
}

// ============================================================
// Step 8: 完成 OAuth（自动点击 + localhost 回调监听）
// ============================================================

let webNavListener = null;
let webNavCommittedListener = null;
let step8TabUpdatedListener = null;
let step8PendingReject = null;
const STEP8_CLICK_EFFECT_TIMEOUT_MS = 15000;
const STEP8_CLICK_RETRY_DELAY_MS = 500;
const STEP8_READY_WAIT_TIMEOUT_MS = 30000;
const STEP8_MAX_ROUNDS = 5;
const STEP8_STRATEGIES = [
  { mode: 'content', strategy: 'requestSubmit', label: 'form.requestSubmit' },
  { mode: 'debugger', label: 'debugger click' },
  { mode: 'content', strategy: 'nativeClick', label: 'element.click' },
  { mode: 'content', strategy: 'dispatchClick', label: 'dispatch click' },
  { mode: 'debugger', label: 'debugger click retry' },
];

function cleanupStep8NavigationListeners() {
  if (webNavListener) {
    chrome.webNavigation.onBeforeNavigate.removeListener(webNavListener);
    webNavListener = null;
  }
  if (webNavCommittedListener) {
    chrome.webNavigation.onCommitted.removeListener(webNavCommittedListener);
    webNavCommittedListener = null;
  }
  if (step8TabUpdatedListener) {
    chrome.tabs.onUpdated.removeListener(step8TabUpdatedListener);
    step8TabUpdatedListener = null;
  }
}

function rejectPendingStep8(error) {
  if (!step8PendingReject) return;
  const reject = step8PendingReject;
  step8PendingReject = null;
  reject(error);
}

function throwIfStep8SettledOrStopped(isSettled = false) {
  if (isSettled || stopRequested) {
    throw new Error(STOP_ERROR_MESSAGE);
  }
}

async function ensureStep8SignupPageReady(tabId, options = {}) {
  await ensureContentScriptReadyOnTab('signup-page', tabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: options.timeoutMs ?? 15000,
    retryDelayMs: options.retryDelayMs ?? 600,
    logMessage: options.logMessage || '',
  });
}

async function getStep8PageState(tabId, responseTimeoutMs = 1500) {
  try {
    const result = await sendTabMessageWithTimeout(tabId, 'signup-page', {
      type: 'STEP8_GET_STATE',
      source: 'background',
      payload: {},
    }, responseTimeoutMs);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  } catch (err) {
    if (isRetryableContentScriptTransportError(err)) {
      return null;
    }
    throw err;
  }
}

async function waitForStep8Ready(tabId, timeoutMs = STEP8_READY_WAIT_TIMEOUT_MS) {
  const start = Date.now();
  let recovered = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();
    const pageState = await getStep8PageState(tabId);
    if (pageState?.addPhonePage) {
      throw new Error('步骤 8：认证页进入了手机号页面，当前不是 OAuth 同意页，无法继续自动授权。');
    }
    if (pageState?.consentReady) {
      return pageState;
    }
    if (pageState === null && !recovered) {
      recovered = true;
      await ensureStep8SignupPageReady(tabId, {
        timeoutMs: Math.min(10000, timeoutMs),
        logMessage: '步骤 8：认证页内容脚本已失联，正在等待页面重新就绪...',
      });
      continue;
    }
    recovered = false;
    await sleepWithStop(250);
  }

  throw new Error('步骤 8：长时间未进入 OAuth 同意页，无法定位“继续”按钮。');
}

async function prepareStep8DebuggerClick(tabId) {
  await ensureStep8SignupPageReady(tabId, {
    timeoutMs: 15000,
    logMessage: '步骤 8：认证页内容脚本已失联，正在恢复后继续定位按钮...',
  });
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'STEP8_FIND_AND_CLICK',
    source: 'background',
    payload: {},
  }, {
    timeoutMs: 15000,
    retryDelayMs: 600,
    logMessage: '步骤 8：认证页正在切换，等待 OAuth 同意页按钮重新就绪...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

async function triggerStep8ContentStrategy(tabId, strategy) {
  await ensureStep8SignupPageReady(tabId, {
    timeoutMs: 15000,
    logMessage: '步骤 8：认证页内容脚本已失联，正在恢复后继续点击“继续”按钮...',
  });
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'STEP8_TRIGGER_CONTINUE',
    source: 'background',
    payload: {
      strategy,
      findTimeoutMs: 4000,
      enabledTimeoutMs: 3000,
    },
  }, {
    timeoutMs: 15000,
    retryDelayMs: 600,
    logMessage: '步骤 8：认证页正在切换，等待“继续”按钮重新就绪...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

async function reloadStep8ConsentPage(tabId, timeoutMs = 30000) {
  if (!Number.isInteger(tabId)) {
    throw new Error('步骤 8：缺少有效的认证页标签页，无法刷新后重试。');
  }

  await chrome.tabs.update(tabId, { active: true }).catch(() => { });

  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('步骤 8：刷新认证页后等待页面完成加载超时。'));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId, { bypassCache: false }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(err);
    });
  });

  await ensureStep8SignupPageReady(tabId, {
    timeoutMs: Math.min(15000, timeoutMs),
    logMessage: '步骤 8：认证页刷新后内容脚本尚未就绪，正在等待页面恢复...',
  });
}

async function waitForStep8ClickEffect(tabId, baselineUrl, timeoutMs = STEP8_CLICK_EFFECT_TIMEOUT_MS) {
  const start = Date.now();
  let recovered = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error('步骤 8：认证页面标签页已关闭，无法继续自动授权。');
    }

    if (baselineUrl && typeof tab.url === 'string' && tab.url !== baselineUrl) {
      return { progressed: true, reason: 'url_changed', url: tab.url };
    }

    const pageState = await getStep8PageState(tabId);
    if (pageState?.addPhonePage) {
      throw new Error('步骤 8：点击“继续”后页面跳到了手机号页面，当前流程无法继续自动授权。');
    }
    if (pageState === null) {
      if (!recovered) {
        recovered = true;
        await ensureStep8SignupPageReady(tabId, {
          timeoutMs: Math.max(3000, Math.min(8000, timeoutMs)),
          logMessage: '步骤 8：点击后认证页正在重载，正在等待内容脚本重新就绪...',
        }).catch(() => null);
        continue;
      }
      await sleepWithStop(200);
      continue;
    }
    recovered = false;

    await sleepWithStop(200);
  }

  return { progressed: false, reason: 'no_effect' };
}

function getStep8EffectLabel(effect) {
  switch (effect?.reason) {
    case 'url_changed':
      return `URL 已变化：${effect.url}`;
    case 'page_reloading':
      return '页面正在跳转或重载';
    case 'left_consent_page':
      return `页面已离开 OAuth 同意页：${effect.url || 'unknown'}`;
    default:
      return '页面仍停留在 OAuth 同意页';
  }
}

async function executeStep8(state) {
  if (!state.oauthUrl) {
    throw new Error('缺少登录用 OAuth 链接，请先完成步骤 6。');
  }

  await addLog('步骤 8：正在监听 localhost 回调地址...');

  return new Promise((resolve, reject) => {
    let resolved = false;
    let signupTabId = null;

    const cleanupListener = () => {
      cleanupStep8NavigationListeners();
      step8PendingReject = null;
    };

    const rejectStep8 = (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanupListener();
      reject(error);
    };

    const finalizeStep8Callback = (callbackUrl) => {
      if (resolved || !callbackUrl) return;

      resolved = true;
      cleanupListener();
      clearTimeout(timeout);

      addLog(`步骤 8：已捕获 localhost 地址：${callbackUrl}`, 'ok').then(() => {
        return completeStepFromBackground(8, { localhostUrl: callbackUrl });
      }).then(() => {
        resolve();
      }).catch((err) => {
        reject(err);
      });
    };

    const timeout = setTimeout(() => {
      rejectStep8(new Error('120 秒内未捕获到 localhost 回调跳转，步骤 8 的点击可能被拦截了。'));
    }, 120000);

    step8PendingReject = (error) => {
      rejectStep8(error);
    };

    webNavListener = (details) => {
      const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
      finalizeStep8Callback(callbackUrl);
    };

    webNavCommittedListener = (details) => {
      const callbackUrl = getStep8CallbackUrlFromNavigation(details, signupTabId);
      finalizeStep8Callback(callbackUrl);
    };

    step8TabUpdatedListener = (tabId, changeInfo, tab) => {
      const callbackUrl = getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId);
      finalizeStep8Callback(callbackUrl);
    };

    (async () => {
      try {
        throwIfStep8SettledOrStopped(resolved);
        signupTabId = await getTabId('signup-page');
        throwIfStep8SettledOrStopped(resolved);

        if (signupTabId && await isTabAlive('signup-page')) {
          await chrome.tabs.update(signupTabId, { active: true });
          await addLog('步骤 8：已切回认证页，正在准备调试器点击...');
        } else {
          signupTabId = await reuseOrCreateTab('signup-page', state.oauthUrl);
          await addLog('步骤 8：已重新打开认证页，正在准备调试器点击...');
        }

        throwIfStep8SettledOrStopped(resolved);
        chrome.webNavigation.onBeforeNavigate.addListener(webNavListener);
        chrome.webNavigation.onCommitted.addListener(webNavCommittedListener);
        chrome.tabs.onUpdated.addListener(step8TabUpdatedListener);
        await ensureStep8SignupPageReady(signupTabId, {
          timeoutMs: 15000,
          logMessage: '步骤 8：认证页内容脚本尚未就绪，正在等待页面恢复...',
        });

        for (let round = 1; round <= STEP8_MAX_ROUNDS && !resolved; round++) {
          throwIfStep8SettledOrStopped(resolved);
          const pageState = await waitForStep8Ready(signupTabId);
          if (!pageState?.consentReady) {
            await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
            continue;
          }

          const strategy = STEP8_STRATEGIES[Math.min(round - 1, STEP8_STRATEGIES.length - 1)];

          await addLog(`步骤 8：第 ${round}/${STEP8_MAX_ROUNDS} 轮尝试点击“继续”（${strategy.label}）...`);

          if (strategy.mode === 'debugger') {
            const clickTarget = await prepareStep8DebuggerClick(signupTabId);
            throwIfStep8SettledOrStopped(resolved);
            await clickWithDebugger(signupTabId, clickTarget?.rect);
          } else {
            await triggerStep8ContentStrategy(signupTabId, strategy.strategy);
          }

          if (resolved) {
            return;
          }

          const effect = await waitForStep8ClickEffect(signupTabId, pageState.url);
          if (resolved) {
            return;
          }

          if (effect.progressed) {
            await addLog(`步骤 8：检测到本次点击已生效，${getStep8EffectLabel(effect)}，继续等待 localhost 回调...`, 'info');
            break;
          }

          if (round >= STEP8_MAX_ROUNDS) {
            throw new Error(`步骤 8：连续 ${STEP8_MAX_ROUNDS} 轮点击“继续”后页面仍无反应。`);
          }

          await addLog(`步骤 8：${strategy.label} 本轮点击后页面无反应，正在刷新认证页后重试（下一轮 ${round + 1}/${STEP8_MAX_ROUNDS}）...`, 'warn');
          await reloadStep8ConsentPage(signupTabId);
          await sleepWithStop(STEP8_CLICK_RETRY_DELAY_MS);
        }
      } catch (err) {
        rejectStep8(err);
      }
    })();
  });
}

// ============================================================
// Step 9: 平台回调验证
// ============================================================

async function executeStep9(state) {
  if (getPanelMode(state) === 'sub2api') {
    return executeSub2ApiStep9(state);
  }
  return executeCpaStep9(state);
}

async function executeCpaStep9(state) {
  if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
    throw new Error('步骤 8 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 8。');
  }
  if (!state.localhostUrl) {
    throw new Error('缺少 localhost 回调地址，请先完成步骤 8。');
  }
  if (!state.vpsUrl) {
    throw new Error('尚未填写 CPA 地址，请先在侧边栏输入。');
  }

  if (shouldBypassStep9ForLocalCpa(state)) {
    await addLog('步骤 9：检测到本地 CPA，且当前策略为“跳过第9步”，本轮不再重复提交回调地址。', 'info');
    await completeStepFromBackground(9, {
      localhostUrl: state.localhostUrl,
      verifiedStatus: 'local-auto',
    });
    return;
  }

  await addLog('步骤 9：正在打开 CPA 面板...');

  const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];
  let tabId = await getTabId('vps-panel');
  const alive = tabId && await isTabAlive('vps-panel');

  if (!alive) {
    tabId = await reuseOrCreateTab('vps-panel', state.vpsUrl, {
      inject: injectFiles,
      reloadIfSameUrl: true,
    });
  } else {
    await closeConflictingTabsForSource('vps-panel', state.vpsUrl, { excludeTabIds: [tabId] });
    await chrome.tabs.update(tabId, { active: true });
    await rememberSourceLastUrl('vps-panel', state.vpsUrl);
  }

  await ensureContentScriptReadyOnTab('vps-panel', tabId, {
    inject: injectFiles,
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: '步骤 9：CPA 面板仍在加载，正在重试连接...',
  });

  await addLog('步骤 9：正在填写回调地址...');
  const result = await sendToContentScriptResilient('vps-panel', {
    type: 'EXECUTE_STEP',
    step: 9,
    source: 'background',
    payload: { localhostUrl: state.localhostUrl, vpsPassword: state.vpsPassword },
  }, {
    timeoutMs: 30000,
    retryDelayMs: 700,
    logMessage: '步骤 9：CPA 面板通信未就绪，正在等待页面恢复...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }
}

async function executeSub2ApiStep9(state) {
  if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
    throw new Error('步骤 8 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 8。');
  }
  if (!state.localhostUrl) {
    throw new Error('缺少 localhost 回调地址，请先完成步骤 8。');
  }
  if (!state.sub2apiSessionId) {
    throw new Error('缺少 SUB2API 会话信息，请重新执行步骤 1。');
  }
  if (!state.sub2apiEmail) {
    throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
  }
  if (!state.sub2apiPassword) {
    throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
  }

  const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
  const injectFiles = ['content/utils.js', 'content/sub2api-panel.js'];

  await addLog('步骤 9：正在打开 SUB2API 后台...');

  let tabId = await getTabId('sub2api-panel');
  const alive = tabId && await isTabAlive('sub2api-panel');

  if (!alive) {
    tabId = await reuseOrCreateTab('sub2api-panel', sub2apiUrl, {
      inject: injectFiles,
      injectSource: 'sub2api-panel',
      reloadIfSameUrl: true,
    });
  } else {
    await closeConflictingTabsForSource('sub2api-panel', sub2apiUrl, { excludeTabIds: [tabId] });
    await chrome.tabs.update(tabId, { active: true });
    await rememberSourceLastUrl('sub2api-panel', sub2apiUrl);
  }

  await ensureContentScriptReadyOnTab('sub2api-panel', tabId, {
    inject: injectFiles,
    injectSource: 'sub2api-panel',
  });

  await addLog('步骤 9：正在向 SUB2API 提交回调并创建账号...');
  const result = await sendToContentScript('sub2api-panel', {
    type: 'EXECUTE_STEP',
    step: 9,
    source: 'background',
    payload: {
      localhostUrl: state.localhostUrl,
      sub2apiUrl,
      sub2apiEmail: state.sub2apiEmail,
      sub2apiPassword: state.sub2apiPassword,
      sub2apiGroupName: state.sub2apiGroupName,
      sub2apiSessionId: state.sub2apiSessionId,
      sub2apiOAuthState: state.sub2apiOAuthState,
      sub2apiGroupId: state.sub2apiGroupId,
      sub2apiDraftName: state.sub2apiDraftName,
    },
  }, {
    responseTimeoutMs: SUB2API_STEP9_RESPONSE_TIMEOUT_MS,
  });

  if (result?.error) {
    throw new Error(result.error);
  }
}

// ============================================================
// Open Side Panel on extension icon click
// ============================================================

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_RUN_TIMER_ALARM_NAME) {
    return;
  }
  launchAutoRunTimerPlan('alarm').catch((err) => {
    console.error(LOG_PREFIX, 'Failed to resume auto run from timer alarm:', err);
  });
});

chrome.runtime.onStartup.addListener(() => {
  restoreAutoRunTimerIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore auto run timer on startup:', err);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  restoreAutoRunTimerIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore auto run timer on install/update:', err);
  });
});

restoreAutoRunTimerIfNeeded().catch((err) => {
  console.error(LOG_PREFIX, 'Failed to restore auto run timer:', err);
});
