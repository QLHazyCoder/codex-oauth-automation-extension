// background.js — Service Worker: orchestration, state, tab management, message routing

importScripts('data/names.js', 'content/moemail-utils.js', 'content/mailpit-utils.js', 'content/activation-utils.js');

const {
  pickVerificationMessage,
  pickVerificationMessageWithTimeFallback,
  DEFAULT_MOEMAIL_API_BASE_URL,
  buildMoemailApiUrl,
  normalizeTimestamp,
  normalizeMoemailApiBaseUrl: normalizeMoemailApiBaseUrlValue,
  normalizeMoemailDomain: normalizeMoemailDomainValue,
  normalizeMoemailMessages,
  parseMoemailConfigDomains,
} = self.MoemailUtils;
const {
  normalizeMailpitApiBaseUrl,
  normalizeMailpitDomain,
  normalizeMailpitMessages,
} = self.MailpitUtils;
const {
  isRecoverableStep9AuthFailure,
} = self.MultiPageActivationUtils;

const LOG_PREFIX = '[MultiPage:bg]';
const DUCK_AUTOFILL_URL = 'https://duckduckgo.com/email/settings/autofill';
const ICLOUD_SETUP_URLS = [
  'https://setup.icloud.com/setup/ws/1',
  'https://setup.icloud.com.cn/setup/ws/1',
];
const ICLOUD_LOGIN_URLS = [
  'https://www.icloud.com/',
  'https://www.icloud.com.cn/',
];
const MOEMAIL_PROVIDER = 'moemail';
const MAILPIT_PROVIDER = 'mailpit';
const IMPORTABLE_ACCOUNT_STATE_KEYS = ['accounts', 'manualAliasUsage', 'preservedAliases'];
const MOEMAIL_REQUEST_TIMEOUT_MS = 15000;
const MAILPIT_REQUEST_TIMEOUT_MS = 15000;
const MOEMAIL_MAX_MESSAGE_DETAILS = 12;
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const HUMAN_STEP_DELAY_MIN = 700;
const HUMAN_STEP_DELAY_MAX = 2200;
const STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS = 8;
const SUB2API_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_SUB2API_URL = 'https://sub2api.hisence.fun/admin/accounts';
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_GROUP_NAMES = [];
const DEFAULT_SUB2API_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SUB2API_DEFAULT_CONCURRENCY = 10;
const SUB2API_DEFAULT_PRIORITY = 1;
const SUB2API_DEFAULT_RATE_MULTIPLIER = 1;
const AUTO_RUN_ALARM_NAME = 'scheduled-auto-run';
const AUTO_RUN_DELAY_MIN_MINUTES = 1;
const AUTO_RUN_DELAY_MAX_MINUTES = 1440;
const AUTO_RUN_RETRY_DELAY_MS = 3000;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS = 600;
const LEGACY_AUTO_STEP_DELAY_KEYS = ['autoStepRandomDelayMinSeconds', 'autoStepRandomDelayMaxSeconds'];
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const STANDALONE_SIGNUP_URL_CANDIDATES = [
  'https://chatgpt.com/',
  'https://auth.openai.com/log-in-or-create-account',
  'https://auth.openai.com/sign-up',
  'https://auth.openai.com/signup',
  // accounts.openai.com 域名上游已下线（Cloudflare 长期返回 522 Connection timed out），
  // 每个候选光等 CF 渲染错误页就浪费 ~40s，两个候选连续失败会累计 ~80s 延迟后才能滑到
  // 最后的 auth.openai.com/create-account。OpenAI 主注册流已全部迁至 auth.openai.com，
  // 保留 accounts.openai.com 只会拖慢 failover，此处移除。
  // direct create-account 路由可以直接露出邮箱框，但更容易在 step 3 提交邮箱后落到 invalid_state，
  // 因此放到最后作为兜底入口；若上一轮已经在该路由触发 invalid_state，则 executeStep2 会整轮跳过。
  'https://auth.openai.com/create-account',
];
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
const ACCOUNT_STATUS_REGISTERED = 'registered';
const ACCOUNT_STATUS_AUTHORIZED = 'authorized';
const STEP3_PENDING_PASSWORD_STAGE_KEY = 'pendingStep3PasswordStage';
// 当主循环因 step3/step4 失败回退到 step2 时，在 session 里打一个一次性标记，
// executeStep2 会读并清这个 flag，把 forceFreshSignup=true 随 payload 下发给 content script，
// 让 step2_clickRegister 不要把「verification 页」当作"已在注册流程中"而短路返回。
const STEP2_FORCE_FRESH_SIGNUP_KEY = 'forceFreshSignupForNextStep2';
const STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY = 'skipDirectCreateAccountForNextStep2';
const STEP2_NAVIGATION_RECOVERY_MAX_ATTEMPTS = 3;
const STEP2_EXECUTE_RESPONSE_TIMEOUT_MS = 20000;

initializeSessionStorageAccess();

// ============================================================
// 状态管理（chrome.storage.session + chrome.storage.local）
// ============================================================

const PERSISTED_SETTING_DEFAULTS = {
  panelMode: 'cpa',
  vpsUrl: '',
  vpsPassword: '',
  localCpaStep9Mode: DEFAULT_LOCAL_CPA_STEP9_MODE,
  sub2apiUrl: DEFAULT_SUB2API_URL,
  sub2apiEmail: '',
  sub2apiPassword: '',
  sub2apiGroupNames: DEFAULT_SUB2API_GROUP_NAMES,
  customPassword: '',
  autoRunSkipFailures: false,
  autoRunFallbackThreadIntervalMinutes: 0,
  autoRunDelayEnabled: false,
  autoRunDelayMinutes: 30,
  autoStepDelaySeconds: null,
  mailProvider: '163',
  emailGenerator: 'duck',
  icloudHostPreference: 'auto',
  emailPrefix: '',
  mailpitApiBaseUrl: '',
  mailpitUsername: '',
  mailpitPassword: '',
  mailpitDomain: '',
  inbucketHost: '',
  inbucketMailbox: '',
  moemailApiBaseUrl: DEFAULT_MOEMAIL_API_BASE_URL,
  moemailApiKey: '',
  moemailDomain: '',
  cloudflareDomain: '',
  cloudflareDomains: [],
};

const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const SETTINGS_EXPORT_SCHEMA_VERSION = 1;
const SETTINGS_EXPORT_FILENAME_PREFIX = 'multipage-settings';

const DEFAULT_STATE = {
  currentStep: 0, // 当前流程执行到的步骤编号。
  stepStatuses: {
    1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending', // 运行时步骤状态映射，不要手动预填。
    6: 'pending', 7: 'pending', 8: 'pending', 9: 'pending', 10: 'pending',
  },
  oauthUrl: null, // 运行时抓取到的 OAuth 地址，不要手动预填。
  email: null, // 运行时邮箱，由程序自动获取并写入，不能手动预填。
  password: null, // 运行时实际密码，由 customPassword 或程序自动生成后写入。
  accounts: [], // 历史账号记录：{ email, password, createdAt, status }。
  lastEmailTimestamp: null, // 最近一次获取到邮箱数据的运行时时间戳。
  lastSignupCode: null, // 注册验证码，运行时由程序自动读取并写入。
  lastLoginCode: null, // 登录验证码，运行时由程序自动读取并写入。
  localhostUrl: null, // 运行时捕获到的 localhost 回调地址，不要手动预填。
  sub2apiSessionId: null, // SUB2API OpenAI Auth 会话 ID。
  sub2apiOAuthState: null, // SUB2API OpenAI Auth state。
  sub2apiGroupIds: [], // SUB2API 目标分组 ID 列表。
  sub2apiDraftName: null, // SUB2API 本轮预生成的账号名称。
  flowStartTime: null, // 当前流程开始时间。
  runTabGroupId: null, // 当前运行绑定的浏览器标签组 ID。
  runTabGroupWindowId: null, // 当前运行标签组所属窗口 ID。
  tabRegistry: {}, // 程序维护的标签页注册表。
  sourceLastUrls: {}, // 各来源页面最近一次打开的地址记录。
  logs: [], // 侧边栏展示的运行日志。
  preferredIcloudHost: '',
  ...PERSISTED_SETTING_DEFAULTS, // 合并 chrome.storage.local 中持久化保存的用户配置。
  autoRunning: false, // 当前是否处于自动运行中。
  autoRunPhase: 'idle', // 当前自动运行阶段。
  autoRunCurrentRun: 0, // 自动运行当前执行到第几轮。
  autoRunTotalRuns: 8, // 自动运行计划总轮数。
  autoRunAttemptRun: 0, // 当前轮次的重试序号。
  autoRunRoundSummaries: [], // 自动运行轮次摘要。
  scheduledAutoRunAt: null, // 自动运行计划启动时间戳。
  scheduledAutoRunPlan: null, // 自动运行计划参数快照。
  autoRunCountdownAt: null,
  autoRunCountdownTitle: '',
  autoRunCountdownNote: '',
  signupVerificationRequestedAt: null,
  loginVerificationRequestedAt: null,
  moemailEmailId: null,
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

function normalizeScheduledAutoRunPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  return {
    totalRuns: normalizeRunCount(plan.totalRuns),
    autoRunSkipFailures: Boolean(plan.autoRunSkipFailures),
    mode: plan.mode === 'continue' ? 'continue' : 'restart',
  };
}

function normalizeEmailGenerator(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'custom' || normalized === 'manual') {
    return 'custom';
  }
  if (normalized === 'cloudflare') {
    return 'cloudflare';
  }
  if (normalized === 'icloud') {
    return 'icloud';
  }
  return 'duck';
}

function normalizePanelMode(value = '') {
  return String(value || '').trim().toLowerCase() === 'sub2api' ? 'sub2api' : 'cpa';
}

function normalizeMailProvider(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  switch (normalized) {
    case 'custom':
    case MOEMAIL_PROVIDER:
    case MAILPIT_PROVIDER:
    case '163':
    case '163-vip':
    case 'gmail':
    case 'qq':
    case 'inbucket':
    case '2925':
      return normalized;
    default:
      return PERSISTED_SETTING_DEFAULTS.mailProvider;
  }
}

function normalizeLocalCpaStep9Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'bypass'
    ? 'bypass'
    : DEFAULT_LOCAL_CPA_STEP9_MODE;
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

function normalizeIcloudHost(rawValue = '') {
  const host = String(rawValue || '').trim().toLowerCase();
  if (!host || host === 'auto') return 'auto';
  if (host === 'icloud.com' || host === 'www.icloud.com' || host === 'setup.icloud.com') return 'icloud.com';
  if (host === 'icloud.com.cn' || host === 'www.icloud.com.cn' || host === 'setup.icloud.com.cn') return 'icloud.com.cn';
  return 'auto';
}

function getConfiguredIcloudHostPreference(state) {
  const normalized = normalizeIcloudHost(state?.icloudHostPreference);
  return normalized === 'auto' ? '' : normalized;
}

function getIcloudLoginUrlForHost(host) {
  const normalizedHost = normalizeIcloudHost(host);
  if (normalizedHost === 'icloud.com') return 'https://www.icloud.com/';
  if (normalizedHost === 'icloud.com.cn') return 'https://www.icloud.com.cn/';
  return '';
}

function getIcloudSetupUrlForHost(host) {
  const normalizedHost = normalizeIcloudHost(host);
  if (normalizedHost === 'icloud.com') return 'https://setup.icloud.com/setup/ws/1';
  if (normalizedHost === 'icloud.com.cn') return 'https://setup.icloud.com.cn/setup/ws/1';
  return '';
}

function getIcloudHostHintFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('setup.icloud.com.cn') || lower.includes('www.icloud.com.cn') || lower.includes('icloud.com.cn')) {
    return 'icloud.com.cn';
  }
  if (lower.includes('setup.icloud.com') || lower.includes('www.icloud.com') || lower.includes('icloud.com')) {
    return 'icloud.com';
  }
  return '';
}

function isIcloudLoginRequiredError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('could not validate icloud session')
    || message.includes('hide my email service was unavailable')
    || /\bstatus (401|403|409|421)\b/.test(message);
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
        if (host && host !== 'auto') return host;
      } catch {}
    }
  } catch {}

  return '';
}

async function getPreferredIcloudLoginUrl(error, state = null) {
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
  if (savedHost && savedHost !== 'auto') {
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

  if (!preferredSetupUrl) return [...ICLOUD_SETUP_URLS];

  return [
    preferredSetupUrl,
    ...ICLOUD_SETUP_URLS.filter((url) => url !== preferredSetupUrl),
  ];
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

async function promptIcloudLogin(error, actionLabel = 'iCloud action') {
  const now = Date.now();
  const preferredUrl = await getPreferredIcloudLoginUrl(error);
  const originalError = getErrorMessage(error);

  chrome.runtime.sendMessage({
    type: 'ICLOUD_LOGIN_REQUIRED',
    payload: {
      actionLabel,
      loginUrl: preferredUrl,
      message: 'iCloud sign-in is required. A login page has been opened for you.',
      detail: originalError,
    },
  }).catch(() => {});

  if (now - lastIcloudLoginPromptAt < 15000) {
    return;
  }
  lastIcloudLoginPromptAt = now;

  await addLog(`iCloud 登录态缺失，正在打开 ${new URL(preferredUrl).host}...`, 'warn');

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
      await addLog(`iCloud 登录检查失败（${actionLabel}）：${getErrorMessage(err)}`, 'warn');
      await promptIcloudLogin(err, actionLabel);
      throw new Error('请先在新打开的 iCloud 页面完成登录，再回到侧边栏继续。');
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
    throw new Error(`iCloud request failed for ${method} ${url}: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`iCloud request failed for ${method} ${url} with status ${response.status}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error(`iCloud returned invalid JSON for ${method} ${url}: ${err.message}`);
  }
}

async function validateIcloudSession(setupUrl) {
  const data = await icloudRequest('POST', `${setupUrl}/validate`);
  if (!data?.webservices?.premiummailsettings?.url) {
    throw new Error('iCloud session validated, but Hide My Email service was unavailable.');
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
        serviceUrl: String(data.webservices.premiummailsettings.url).replace(/\/$/, ''),
      };
    } catch (err) {
      errors.push(`${new URL(setupUrl).host}: ${err.message}`);
    }
  }

  throw new Error(errors.length
    ? `Could not validate iCloud session. ${errors.join(' | ')}`
    : 'Could not validate iCloud session. Log into icloud.com or icloud.com.cn in this browser first.');
}

function findIcloudAliasArray(node, depth = 0) {
  if (!node || depth > 4) return null;
  if (Array.isArray(node)) {
    return node.some((item) => typeof item === 'object') ? node : null;
  }
  if (typeof node !== 'object') return null;

  const priorityKeys = ['hmeEmails', 'hmeEmailList', 'hmeList', 'hmes', 'aliases', 'items'];
  for (const key of priorityKeys) {
    if (Array.isArray(node[key])) return node[key];
  }

  for (const value of Object.values(node)) {
    const nested = findIcloudAliasArray(value, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function normalizeIcloudAliasRecord(raw, usedEmails = new Set()) {
  const email = String(
    raw?.hme
      || raw?.email
      || raw?.alias
      || raw?.address
      || raw?.metaData?.hme
      || ''
  ).trim();

  if (!email || !email.includes('@')) return null;

  const state = String(raw?.state || raw?.status || '').trim().toLowerCase();

  return {
    anonymousId: String(raw?.anonymousId || raw?.id || '').trim(),
    email,
    label: String(raw?.label || raw?.metaData?.label || '').trim(),
    note: String(raw?.note || raw?.metaData?.note || '').trim(),
    active: raw?.active !== false && raw?.isActive !== false && state !== 'inactive' && state !== 'deleted',
    used: usedEmails.has(email),
    createdAt: raw?.createTimestamp || raw?.createTime || raw?.createdAt || raw?.createdDate || null,
  };
}

function getUsedIcloudEmails(state) {
  const usedEmails = new Set((state.accounts || [])
    .map((account) => String(account?.email || '').trim())
    .filter((email) => email.endsWith('@icloud.com') || email.includes('@')));

  const manualAliasUsage = getImportedManualAliasUsageMap(state);
  for (const [email, used] of Object.entries(manualAliasUsage)) {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) continue;
    if (used) usedEmails.add(normalizedEmail);
    else usedEmails.delete(normalizedEmail);
  }

  return usedEmails;
}

async function checkIcloudSession() {
  return withIcloudLoginHelp('检查 iCloud 登录态', async () => {
    const { setupUrl } = await resolveIcloudPremiumMailService();
    await addLog(`iCloud：登录态可用（${new URL(setupUrl).host}）`, 'ok');
    return { ok: true, setupUrl };
  });
}

async function listIcloudAliases() {
  return withIcloudLoginHelp('加载 iCloud aliases', async () => {
    const { serviceUrl } = await resolveIcloudPremiumMailService();
    const response = await icloudRequest('GET', `${serviceUrl}/v2/hme/list`);
    const [state, importedState] = await Promise.all([getState(), getImportedAccountState()]);
    const usedEmails = getUsedIcloudEmails({
      accounts: importedState.accounts?.length ? importedState.accounts : state.accounts,
      manualAliasUsage: importedState.manualAliasUsage || {},
    });
    const aliases = findIcloudAliasArray(response) || [];

    return aliases
      .map((alias) => normalizeIcloudAliasRecord(alias, usedEmails))
      .filter(Boolean)
      .map((alias) => ({
        anonymousId: alias.anonymousId,
        email: alias.email,
        active: alias.active,
        used: alias.used,
        preserved: Boolean(getImportedPreservedAliasMap(importedState)[alias.email]),
        label: String(alias.label || '').trim(),
        note: String(alias.note || '').trim(),
        createdAt: alias.createdAt || null,
      }))
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        if (left.used !== right.used) return left.used ? 1 : -1;
        return String(left.email || '').localeCompare(String(right.email || ''));
      });
  });
}

async function setIcloudAliasUsedState(payload = {}) {
  const email = String(payload.email || '').trim();
  if (!email) {
    throw new Error('未提供 iCloud alias 邮箱。');
  }

  const importedState = await getImportedAccountState();
  const manualAliasUsage = getImportedManualAliasUsageMap(importedState);
  manualAliasUsage[email] = Boolean(payload.used);
  await setImportedAccountState({ manualAliasUsage });
  await addLog(`iCloud：已将 ${email} 标记为${payload.used ? '已用' : '未用'}`, 'ok');
  broadcastIcloudAliasesChanged({ reason: 'used-updated', email, used: Boolean(payload.used) });
  return { email, used: Boolean(payload.used) };
}

async function setIcloudAliasPreservedState(payload = {}) {
  const email = String(payload.email || '').trim();
  if (!email) {
    throw new Error('未提供 iCloud alias 邮箱。');
  }

  const importedState = await getImportedAccountState();
  const preservedAliases = getImportedPreservedAliasMap(importedState);
  preservedAliases[email] = Boolean(payload.preserved);
  await setImportedAccountState({ preservedAliases });
  await addLog(`iCloud：已将 ${email} 标记为${payload.preserved ? '保留' : '不保留'}`, 'ok');
  broadcastIcloudAliasesChanged({ reason: 'preserved-updated', email, preserved: Boolean(payload.preserved) });
  return { email, preserved: Boolean(payload.preserved) };
}

async function deleteIcloudAlias(email) {
  return withIcloudLoginHelp('删除 iCloud alias', async () => {
    const alias = typeof email === 'string'
      ? { email: String(email).trim(), anonymousId: '' }
      : {
          email: String(email?.email || '').trim(),
          anonymousId: String(email?.anonymousId || '').trim(),
        };

    if (!alias.email) {
      throw new Error('未提供 iCloud alias 邮箱。');
    }
    if (!alias.anonymousId) {
      throw new Error(`缺少 ${alias.email} 的 anonymousId，请先刷新列表后重试。`);
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
      await addLog(`iCloud：直接删除 ${alias.email} 失败，尝试先 deactivate...`, 'warn');

      const deactivated = await icloudRequest('POST', `${serviceUrl}/v1/hme/deactivate`, {
        data: { anonymousId: alias.anonymousId },
      });
      if (deactivated?.success === false) {
        throw new Error(deactivated?.error?.errorMessage || `Failed to deactivate ${alias.email}`);
      }

      const deleted = await icloudRequest('POST', `${serviceUrl}/v1/hme/delete`, {
        data: { anonymousId: alias.anonymousId },
      });
      if (deleted?.success === false) {
        throw new Error(deleted?.error?.errorMessage || `Failed to delete ${alias.email}`);
      }
    }

    const importedState = await getImportedAccountState();
    const manualAliasUsage = getImportedManualAliasUsageMap(importedState);
    const preservedAliases = getImportedPreservedAliasMap(importedState);
    delete manualAliasUsage[alias.email];
    delete preservedAliases[alias.email];
    await setImportedAccountState({ manualAliasUsage, preservedAliases });

    await addLog(`iCloud：已删除 alias ${alias.email}`, 'ok');
    broadcastIcloudAliasesChanged({ reason: 'deleted', email: alias.email });
    return { email: alias.email };
  });
}

async function deleteUsedIcloudAliases() {
  const aliases = await listIcloudAliases();
  const usedAliases = aliases.filter((alias) => alias.used);

  if (usedAliases.length === 0) {
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
      skipped.push({ email: alias.email, error: err.message });
    }
  }

  return { deleted, skipped };
}

function normalizeMoemailApiBaseUrl(rawValue = '') {
  try {
    return normalizeMoemailApiBaseUrlValue(rawValue);
  } catch {
    return DEFAULT_MOEMAIL_API_BASE_URL;
  }
}

function normalizeMoemailApiKey(rawValue = '') {
  return String(rawValue || '').trim();
}

function normalizeMoemailDomain(rawValue = '') {
  return normalizeMoemailDomainValue(rawValue);
}

function getMoemailSettings(state = {}) {
  return {
    baseUrl: normalizeMoemailApiBaseUrl(state.moemailApiBaseUrl),
    apiKey: normalizeMoemailApiKey(state.moemailApiKey),
    domain: normalizeMoemailDomain(state.moemailDomain),
  };
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
    case 'sub2apiUrl':
      return String(value || '').trim();
    case 'sub2apiEmail':
      return String(value || '').trim();
    case 'sub2apiPassword':
      return String(value || '');
    case 'sub2apiGroupNames':
      return normalizeSub2ApiGroupNames(value);
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
    case 'emailGenerator':
      return normalizeEmailGenerator(value);
    case 'icloudHostPreference':
      return normalizeIcloudHost(value);
    case 'emailPrefix':
      return String(value || '').trim();
    case 'mailpitApiBaseUrl':
      return normalizeMailpitApiBaseUrl(value);
    case 'mailpitUsername':
      return String(value || '').trim();
    case 'mailpitPassword':
      return String(value || '').trim();
    case 'mailpitDomain':
      return normalizeMailpitDomain(value);
    case 'inbucketHost':
      return String(value || '').trim();
    case 'inbucketMailbox':
      return String(value || '').trim();
    case 'moemailApiBaseUrl':
      return normalizeMoemailApiBaseUrl(value);
    case 'moemailApiKey':
      return normalizeMoemailApiKey(value);
    case 'moemailDomain':
      return normalizeMoemailDomain(value);
    case 'cloudflareDomain':
      return normalizeCloudflareDomain(value);
    case 'cloudflareDomains':
      return normalizeCloudflareDomains(value);
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

  return payload;
}

async function getPersistedSettings() {
  const stored = await chrome.storage.local.get([...PERSISTED_SETTING_KEYS, ...LEGACY_AUTO_STEP_DELAY_KEYS]);
  return buildPersistentSettingsPayload(stored, { fillDefaults: true });
}

async function getState() {
  const [state, persistedSettings] = await Promise.all([
    chrome.storage.session.get(null),
    getPersistedSettings(),
  ]);
  return { ...DEFAULT_STATE, ...persistedSettings, ...state };
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
    moemailEmailId: null,
    email: null,
  };

  await setState(sessionUpdates);
  broadcastDataUpdate({
    ...importedSettings,
    moemailEmailId: null,
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

function broadcastAccountsChanged(payload = {}) {
  chrome.runtime.sendMessage({
    type: 'ACCOUNTS_CHANGED',
    payload,
  }).catch(() => { });
}

function broadcastIcloudAliasesChanged(payload = {}) {
  chrome.runtime.sendMessage({
    type: 'ICLOUD_ALIASES_CHANGED',
    payload,
  }).catch(() => { });
}

async function getImportedAccountState() {
  try {
    const state = await chrome.storage.local.get(IMPORTABLE_ACCOUNT_STATE_KEYS);
    return {
      accounts: Array.isArray(state.accounts) ? state.accounts : [],
      manualAliasUsage: state.manualAliasUsage && typeof state.manualAliasUsage === 'object'
        ? state.manualAliasUsage
        : {},
      preservedAliases: state.preservedAliases && typeof state.preservedAliases === 'object'
        ? state.preservedAliases
        : {},
    };
  } catch {
    return {
      accounts: [],
      manualAliasUsage: {},
      preservedAliases: {},
    };
  }
}

function getImportedManualAliasUsageMap(state = {}) {
  return state?.manualAliasUsage && typeof state.manualAliasUsage === 'object'
    ? { ...state.manualAliasUsage }
    : {};
}

function getImportedPreservedAliasMap(state = {}) {
  return state?.preservedAliases && typeof state.preservedAliases === 'object'
    ? { ...state.preservedAliases }
    : {};
}

async function setImportedAccountState(updates = {}) {
  const payload = {};
  for (const key of IMPORTABLE_ACCOUNT_STATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      payload[key] = updates[key];
    }
  }
  if (Object.keys(payload).length > 0) {
    await chrome.storage.local.set(payload);
  }
}

function normalizeEmailKey(value) {
  return String(value || '').trim().toLowerCase();
}

function compareAccountStatusPriority(leftStatus = '', rightStatus = '') {
  const priority = {
    registered: 1,
    authorized: 2,
  };
  return (priority[String(leftStatus || '').trim()] || 0) - (priority[String(rightStatus || '').trim()] || 0);
}

function normalizeImportedAccountRecord(raw) {
  const email = String(raw?.email || '').trim();
  if (!email) return null;
  const rawStatus = String(raw?.status || '').trim().toLowerCase();
  return {
    email,
    password: String(raw?.password || '').trim(),
    createdAt: raw?.createdAt || raw?.time || new Date().toISOString(),
    status: rawStatus === 'registered' ? 'registered' : 'authorized',
  };
}

function mergeAccountRecords(existingAccounts = [], importedAccounts = []) {
  const byEmail = new Map();

  for (const account of Array.isArray(existingAccounts) ? existingAccounts : []) {
    const normalized = normalizeImportedAccountRecord(account);
    if (!normalized) continue;
    byEmail.set(normalized.email.toLowerCase(), normalized);
  }

  for (const account of Array.isArray(importedAccounts) ? importedAccounts : []) {
    const normalized = normalizeImportedAccountRecord(account);
    if (!normalized) continue;
    const key = normalized.email.toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, normalized);
      continue;
    }
    const mergedStatus = compareAccountStatusPriority(existing.status, normalized.status) >= 0
      ? existing.status
      : normalized.status;
    byEmail.set(key, {
      email: existing.email || normalized.email,
      password: normalized.password || existing.password || '',
      createdAt: normalized.createdAt || existing.createdAt || new Date().toISOString(),
      status: mergedStatus,
    });
  }

  return Array.from(byEmail.values()).sort((left, right) => {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
}

async function upsertCurrentAccountRecord(status, options = {}) {
  const state = await getState();
  const email = String(options.email ?? state.email ?? '').trim();
  const password = String(options.password ?? state.password ?? '').trim();

  if (!email || !status) {
    return null;
  }

  const accounts = Array.isArray(state.accounts) ? [...state.accounts] : [];
  const now = new Date().toISOString();
  const existingIndex = accounts.findIndex((account) => normalizeEmailKey(account?.email) === normalizeEmailKey(email));
  const existingRecord = existingIndex >= 0 ? normalizeImportedAccountRecord(accounts[existingIndex]) : null;
  const nextStatus = existingRecord
    && compareAccountStatusPriority(existingRecord.status, status) >= 0
    ? existingRecord.status
    : status;
  const nextRecord = {
    email,
    password: password || existingRecord?.password || '',
    createdAt: existingRecord?.createdAt || now,
    status: nextStatus,
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = {
      ...accounts[existingIndex],
      ...nextRecord,
    };
  } else {
    accounts.push(nextRecord);
  }

  const mergedAccounts = mergeAccountRecords(accounts, []);
  const importedState = await getImportedAccountState();
  const manualAliasUsage = {
    ...(importedState.manualAliasUsage || {}),
    [email]: true,
  };

  await setState({ accounts: mergedAccounts });
  await setImportedAccountState({ accounts: mergedAccounts, manualAliasUsage });
  broadcastAccountsChanged({
    reason: 'saved',
    email,
    account: nextRecord,
    count: mergedAccounts.length,
  });
  broadcastIcloudAliasesChanged({ reason: 'used-updated', email, used: true });
  return nextRecord;
}

function parseImportedAccountDataBundle(bundle) {
  if (Array.isArray(bundle)) {
    return {
      accounts: bundle,
      manualAliasUsage: {},
      preservedAliases: {},
    };
  }

  if (!bundle || typeof bundle !== 'object') {
    throw new Error('导入文件内容无效。');
  }

  const accounts = Array.isArray(bundle.accounts)
    ? bundle.accounts
    : (Array.isArray(bundle.data?.accounts) ? bundle.data.accounts : []);
  const manualAliasUsage = bundle.manualAliasUsage && typeof bundle.manualAliasUsage === 'object'
    ? bundle.manualAliasUsage
    : (bundle.data?.manualAliasUsage && typeof bundle.data.manualAliasUsage === 'object' ? bundle.data.manualAliasUsage : {});
  const preservedAliases = bundle.preservedAliases && typeof bundle.preservedAliases === 'object'
    ? bundle.preservedAliases
    : (bundle.data?.preservedAliases && typeof bundle.data.preservedAliases === 'object' ? bundle.data.preservedAliases : {});

  if (!accounts.length && !Object.keys(manualAliasUsage).length && !Object.keys(preservedAliases).length) {
    throw new Error('导入文件中未找到 accounts / manualAliasUsage / preservedAliases。');
  }

  return {
    accounts,
    manualAliasUsage,
    preservedAliases,
  };
}

async function setEmailStateSilently(email, options = {}) {
  const normalizedEmail = String(email || '').trim() || null;
  const currentState = await getState();
  const currentEmail = String(currentState.email || '').trim() || null;
  const updates = { email: normalizedEmail };

  if (options.moemailEmailId !== undefined) {
    updates.moemailEmailId = String(options.moemailEmailId || '').trim() || null;
  } else if (!normalizedEmail || normalizedEmail !== currentEmail) {
    updates.moemailEmailId = null;
  }

  await setState(updates);
  broadcastDataUpdate(updates);
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

async function getCompletedAccounts() {
  const importedState = await getImportedAccountState();
  if (Array.isArray(importedState.accounts) && importedState.accounts.length) {
    return importedState.accounts;
  }
  const state = await getState();
  return Array.isArray(state.accounts) ? state.accounts : [];
}

async function deleteCompletedAccount(index) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0) {
    throw new Error('无效的账号索引。');
  }

  const accounts = await getCompletedAccounts();
  if (numericIndex >= accounts.length) {
    throw new Error('账号索引超出范围。');
  }

  const [removed] = accounts.splice(numericIndex, 1);
  await setState({ accounts });
  await setImportedAccountState({ accounts });
  broadcastAccountsChanged({
    reason: 'deleted',
    index: numericIndex,
    email: String(removed?.email || '').trim(),
    count: accounts.length,
  });
  return accounts;
}

async function clearCompletedAccounts() {
  await setState({ accounts: [] });
  await setImportedAccountState({ accounts: [] });
  broadcastAccountsChanged({ reason: 'cleared', count: 0 });
  return [];
}

async function importAccountDataBundle(bundle) {
  const state = await ensureManualInteractionAllowed('导入历史账号');
  if (Object.values(state.stepStatuses || {}).some((status) => status === 'running')) {
    throw new Error('当前有步骤正在执行，无法导入历史账号。');
  }

  const parsed = parseImportedAccountDataBundle(bundle);
  const currentPersistentState = await getImportedAccountState();
  const mergedAccounts = mergeAccountRecords(currentPersistentState.accounts, parsed.accounts);
  const mergedManualAliasUsage = {
    ...(currentPersistentState.manualAliasUsage || {}),
    ...(parsed.manualAliasUsage || {}),
  };
  const mergedPreservedAliases = {
    ...(currentPersistentState.preservedAliases || {}),
    ...(parsed.preservedAliases || {}),
  };

  await setImportedAccountState({
    accounts: mergedAccounts,
    manualAliasUsage: mergedManualAliasUsage,
    preservedAliases: mergedPreservedAliases,
  });
  await setState({ accounts: mergedAccounts });
  broadcastAccountsChanged({ reason: 'imported', count: mergedAccounts.length });
  return {
    accounts: mergedAccounts,
    importedCount: Array.isArray(parsed.accounts) ? parsed.accounts.length : 0,
  };
}

async function resetState() {
  console.log(LOG_PREFIX, 'Resetting all state');
  // Preserve settings and persistent data across resets
  const [prev, persistedSettings] = await Promise.all([
    chrome.storage.session.get([
      'seenCodes',
      'seenInbucketMailIds',
      'accounts',
      'tabRegistry',
      'sourceLastUrls',
    ]),
    getPersistedSettings(),
  ]);
  await chrome.storage.session.clear();
  await chrome.storage.session.set({
    ...DEFAULT_STATE,
    ...persistedSettings,
    seenCodes: prev.seenCodes || [],
    seenInbucketMailIds: prev.seenInbucketMailIds || [],
    accounts: prev.accounts || [],
    tabRegistry: prev.tabRegistry || {},
    sourceLastUrls: prev.sourceLastUrls || {},
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

function isMoemailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === MOEMAIL_PROVIDER;
}

function isMailpitProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === MAILPIT_PROVIDER;
}

function isCustomMailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === 'custom';
}

function getVerificationRequestTimestamp(step, state = {}, options = {}) {
  const bufferMs = Number(options.bufferMs) || 15_000;
  const signupRequestedAt = normalizeTimestamp(state.signupVerificationRequestedAt);
  const loginRequestedAt = normalizeTimestamp(state.loginVerificationRequestedAt);
  const lastEmailTimestamp = normalizeTimestamp(state.lastEmailTimestamp);
  const flowStartTime = normalizeTimestamp(state.flowStartTime);

  if (step === 4 && signupRequestedAt) {
    return Math.max(0, signupRequestedAt - bufferMs);
  }

  if (step === 7 && loginRequestedAt) {
    return Math.max(0, loginRequestedAt - bufferMs);
  }

  return step === 7
    ? (lastEmailTimestamp || flowStartTime || 0)
    : (flowStartTime || 0);
}

function generateMoemailLocalPart(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = chars[Math.floor(Math.random() * 26)];
  for (let index = 1; index < length; index += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function getMailpitSettings(state = {}) {
  return {
    baseUrl: normalizeMailpitApiBaseUrl(state.mailpitApiBaseUrl),
    username: String(state.mailpitUsername || '').trim(),
    password: String(state.mailpitPassword || '').trim(),
    domain: normalizeMailpitDomain(state.mailpitDomain),
  };
}

function buildMailpitAuthHeader(username = '', password = '') {
  if (!username && !password) {
    return '';
  }

  const raw = `${username}:${password}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `Basic ${btoa(binary)}`;
}

async function requestMailpit(endpoint, options = {}, overrides = {}) {
  const settings = {
    ...getMailpitSettings(await getState()),
    ...overrides,
  };
  settings.baseUrl = normalizeMailpitApiBaseUrl(settings.baseUrl);
  settings.username = String(settings.username || '').trim();
  settings.password = String(settings.password || '').trim();

  if (!settings.baseUrl) {
    throw new Error('请先填写 Mailpit API 地址。');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), MAILPIT_REQUEST_TIMEOUT_MS);
  const requestUrl = endpoint.startsWith('http')
    ? endpoint
    : `${settings.baseUrl}${String(endpoint || '').startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  const authHeader = buildMailpitAuthHeader(settings.username, settings.password);
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  let response;
  try {
    response = await fetch(requestUrl, {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Mailpit API 请求超时（>${Math.round(MAILPIT_REQUEST_TIMEOUT_MS / 1000)} 秒）`);
    }
    throw new Error(`Mailpit API 请求失败：${err.message}`);
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

  if (!response.ok) {
    const errorText = payload?.error || payload?.message || payload?.raw || text || `HTTP ${response.status}`;
    throw new Error(`Mailpit API 请求失败：${errorText}`);
  }

  return payload;
}

function buildMailpitLocalPart(prefix = '') {
  const normalizedPrefix = String(prefix || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  if (normalizedPrefix) {
    return normalizedPrefix;
  }
  return generateMoemailLocalPart(10);
}

async function requestMoemail(endpoint, options = {}, overrides = {}) {
  const settings = {
    ...getMoemailSettings(await getState()),
    ...overrides,
  };
  settings.baseUrl = normalizeMoemailApiBaseUrl(settings.baseUrl);
  settings.apiKey = normalizeMoemailApiKey(settings.apiKey);

  if (!settings.apiKey) {
    throw new Error('请先填写 MoeMail API Key。');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), MOEMAIL_REQUEST_TIMEOUT_MS);
  const requestUrl = buildMoemailApiUrl(settings.baseUrl, endpoint);

  let response;
  try {
    response = await fetch(requestUrl, {
      method: options.method || 'GET',
      headers: {
        'X-API-Key': settings.apiKey,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`MoeMail API 请求超时（>${Math.round(MOEMAIL_REQUEST_TIMEOUT_MS / 1000)} 秒）`);
    }
    throw new Error(`MoeMail API 请求失败：${err.message}`);
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

  if (!response.ok) {
    const errorText = payload?.error || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(`MoeMail API 请求失败：${errorText}`);
  }

  if (payload && payload.success === false) {
    const errorText = payload?.error || payload?.message || '未知错误';
    throw new Error(`MoeMail API 返回失败：${errorText}`);
  }

  return payload;
}

async function fetchMoemailDomains(state = null) {
  const settings = getMoemailSettings(state || await getState());
  const config = await requestMoemail('/api/config', {}, settings);
  const domains = parseMoemailConfigDomains(config);
  if (!domains.length) {
    throw new Error('未获取到 MoeMail 可用域名。');
  }
  return domains;
}

async function findMoemailEmailByAddress(address, state = null) {
  const normalizedAddress = String(address || '').trim().toLowerCase();
  if (!normalizedAddress) {
    return null;
  }

  const settings = getMoemailSettings(state || await getState());
  let cursor = '';

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const payload = await requestMoemail(`/api/emails${query}`, {}, settings);
    const emails = Array.isArray(payload?.emails) ? payload.emails : [];
    const matched = emails.find((item) => {
      const candidate = String(item?.email || item?.address || '').trim().toLowerCase();
      return candidate === normalizedAddress;
    });
    if (matched) {
      return {
        id: String(matched.id || '').trim(),
        email: String(matched.email || matched.address || address).trim(),
      };
    }
    cursor = String(payload?.nextCursor || payload?.next_cursor || '').trim();
  } while (cursor);

  return null;
}

function pickMoemailGenerationDomain(preferredDomain = '', domains = []) {
  const normalizedPreferred = normalizeMoemailDomain(preferredDomain);
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const normalizedDomains = [];
  const seen = new Set();
  for (const rawDomain of Array.isArray(domains) ? domains : []) {
    const normalized = normalizeMoemailDomain(rawDomain);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedDomains.push(normalized);
  }

  if (!normalizedDomains.length) {
    return '';
  }

  const randomIndex = Math.floor(Math.random() * normalizedDomains.length);
  return normalizedDomains[Math.max(0, Math.min(normalizedDomains.length - 1, randomIndex))] || '';
}

async function createMoemailEmail(state = null, options = {}) {
  const latestState = state || await getState();
  const settings = getMoemailSettings(latestState);
  let domain = pickMoemailGenerationDomain(options.domain || settings.domain, []);
  if (!domain) {
    const domains = await fetchMoemailDomains(latestState);
    domain = pickMoemailGenerationDomain('', domains);
  }
  if (!domain) {
    throw new Error('MoeMail 没有可用域名，无法创建邮箱。');
  }

  const name = String(options.prefix || latestState.emailPrefix || '').trim() || generateMoemailLocalPart(10);
  const payload = await requestMoemail('/api/emails/generate', {
    method: 'POST',
    body: {
      expiryTime: 0,
      domain,
      name,
    },
  }, settings);

  const email = String(payload?.email || payload?.address || '').trim();
  const emailId = String(payload?.id || '').trim();
  if (!email || !emailId) {
    throw new Error('MoeMail 创建邮箱失败。');
  }

  return { email, emailId, domain };
}

async function fetchMoemailMailboxMessages(address, options = {}) {
  const latestState = await getState();
  const settings = getMoemailSettings(latestState);
  let targetId = String(options.emailId || latestState.moemailEmailId || '').trim();
  let resolvedEmail = String(address || latestState.email || '').trim();

  if (!targetId) {
    const matchedEmail = await findMoemailEmailByAddress(resolvedEmail, latestState);
    targetId = String(matchedEmail?.id || '').trim();
    resolvedEmail = String(matchedEmail?.email || resolvedEmail).trim();
  }

  if (!targetId) {
    return { emailId: '', email: resolvedEmail, messages: [] };
  }

  let listPayload;
  try {
    listPayload = await requestMoemail(`/api/emails/${encodeURIComponent(targetId)}`, {}, settings);
  } catch (err) {
    if (!String(options.emailId || latestState.moemailEmailId || '').trim()) {
      throw err;
    }

    const matchedEmail = await findMoemailEmailByAddress(resolvedEmail, latestState);
    targetId = String(matchedEmail?.id || '').trim();
    resolvedEmail = String(matchedEmail?.email || resolvedEmail).trim();
    if (!targetId) {
      return { emailId: '', email: resolvedEmail, messages: [] };
    }

    listPayload = await requestMoemail(`/api/emails/${encodeURIComponent(targetId)}`, {}, settings);
  }

  const messageRefs = Array.isArray(listPayload?.messages) ? listPayload.messages.slice(0, MOEMAIL_MAX_MESSAGE_DETAILS) : [];
  if (!messageRefs.length) {
    return { emailId: targetId, email: resolvedEmail, messages: [] };
  }

  const settledDetails = await Promise.allSettled(
    messageRefs.map(async (item) => {
      const messageId = String(item?.id || item?.messageId || item?.message_id || '').trim();
      if (!messageId) {
        return item;
      }

      const detailPayload = await requestMoemail(
        `/api/emails/${encodeURIComponent(targetId)}/${encodeURIComponent(messageId)}`,
        {},
        settings
      );
      const detailMessage = detailPayload?.message && typeof detailPayload.message === 'object'
        ? detailPayload.message
        : {};
      return {
        ...item,
        ...detailMessage,
        id: messageId,
      };
    })
  );

  const messages = normalizeMoemailMessages(
    settledDetails.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : messageRefs[index]
    ))
  );

  return {
    emailId: targetId,
    email: resolvedEmail,
    messages,
  };
}

async function fetchMoemailGeneratedEmail(state, options = {}) {
  throwIfStopped();
  const latestState = state || await getState();
  const result = await createMoemailEmail(latestState, {
    prefix: options.prefix,
    domain: options.domain,
  });

  await setEmailStateSilently(result.email, { moemailEmailId: result.emailId });
  await addLog(`MoeMail：已生成 ${result.email}`, 'ok');
  return result.email;
}

async function fetchMailpitGeneratedEmail(state, options = {}) {
  throwIfStopped();
  const latestState = state || await getState();
  const settings = getMailpitSettings(latestState);
  if (!settings.domain) {
    throw new Error('请先填写 Mailpit 域名。');
  }

  await requestMailpit('/api/v1/info', {}, settings);

  const localPart = buildMailpitLocalPart(options.prefix || latestState.emailPrefix);
  const email = `${localPart}@${settings.domain}`;
  await setEmailState(email);
  await addLog(`Mailpit：已生成 ${email}`, 'ok');
  return email;
}

async function pollMoemailVerificationCode(step, state, pollPayload = {}) {
  const targetEmail = String(state.email || '').trim();
  if (!targetEmail) {
    throw new Error('当前没有 MoeMail 注册邮箱。');
  }

  await addLog(`步骤 ${step}：当前使用 MoeMail 邮箱 ${targetEmail} 轮询验证码。`, 'info');

  const maxAttempts = Number(pollPayload.maxAttempts) || 5;
  const intervalMs = Number(pollPayload.intervalMs) || 3000;
  let currentEmailId = String(state.moemailEmailId || '').trim();
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
        return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
      })
      .join(' || ');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfStopped();
    try {
      await addLog(`步骤 ${step}：正在轮询 MoeMail 邮件（${attempt}/${maxAttempts}）...`, 'info');
      const fetchResult = await fetchMoemailMailboxMessages(targetEmail, { emailId: currentEmailId });
      currentEmailId = String(fetchResult.emailId || '').trim();
      if (currentEmailId && currentEmailId !== String(state.moemailEmailId || '').trim()) {
        await setState({ moemailEmailId: currentEmailId });
        broadcastDataUpdate({ moemailEmailId: currentEmailId });
        state = { ...state, moemailEmailId: currentEmailId };
      }

      if (!fetchResult.messages.length) {
        lastError = new Error(`步骤 ${step}：暂未在 MoeMail 中读取到邮件（${attempt}/${maxAttempts}）。`);
        await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
      } else {
        const matchResult = pickVerificationMessageWithTimeFallback(fetchResult.messages, {
          afterTimestamp: pollPayload.filterAfterTimestamp || 0,
          senderFilters: pollPayload.senderFilters || [],
          subjectFilters: pollPayload.subjectFilters || [],
          excludeCodes: pollPayload.excludeCodes || [],
        });
        const match = matchResult.match;

        if (match?.code) {
          if (matchResult.usedTimeFallback) {
            await addLog(`步骤 ${step}：MoeMail 使用时间回退后命中验证码。`, 'warn');
          }
          await addLog(`步骤 ${step}：已在 MoeMail 中找到验证码：${match.code}`, 'ok');
          return {
            ok: true,
            code: match.code,
            emailTimestamp: match.receivedAt || Date.now(),
            mailId: match.message?.id || '',
          };
        }

        lastError = new Error(`步骤 ${step}：暂未在 MoeMail 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
        await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
        const mailSummary = summarizeMessagesForLog(fetchResult.messages);
        if (mailSummary) {
          await addLog(`步骤 ${step}：最近邮件样本：${mailSummary}`, 'info');
        }
      }
    } catch (err) {
      lastError = err;
      await addLog(`步骤 ${step}：MoeMail 轮询失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：未在 MoeMail 中找到新的匹配验证码。`);
}

async function pollMailpitVerificationCode(step, state, pollPayload = {}) {
  const targetEmail = String(state.email || '').trim().toLowerCase();
  if (!targetEmail) {
    throw new Error('当前没有 Mailpit 注册邮箱。');
  }

  await addLog(`步骤 ${step}：当前使用 Mailpit 邮箱 ${targetEmail} 轮询验证码。`, 'info');

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
        return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
      })
      .join(' || ');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfStopped();
    try {
      await addLog(`步骤 ${step}：正在轮询 Mailpit 邮件（${attempt}/${maxAttempts}）...`, 'info');
      const query = new URLSearchParams({
        query: `to:"${targetEmail}"`,
        limit: '10',
      });
      const searchPayload = await requestMailpit(`/api/v1/search?${query.toString()}`);
      const searchMessages = Array.isArray(searchPayload?.messages) ? searchPayload.messages : [];

      if (!searchMessages.length) {
        lastError = new Error(`步骤 ${step}：暂未在 Mailpit 中读取到邮件（${attempt}/${maxAttempts}）。`);
        await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
      } else {
        const detailResults = await Promise.allSettled(
          searchMessages.slice(0, 10).map(async (message) => {
            const messageId = String(message?.ID || message?.id || '').trim();
            if (!messageId) {
              return { message, detail: {} };
            }
            const detailPayload = await requestMailpit(`/api/v1/message/${encodeURIComponent(messageId)}`);
            return { message, detail: detailPayload };
          })
        );

        const normalizedMessages = normalizeMailpitMessages(detailResults.map((result, index) => (
          result.status === 'fulfilled'
            ? result.value
            : { message: searchMessages[index], detail: {} }
        )));

        const matchResult = pickVerificationMessageWithTimeFallback(normalizedMessages, {
          afterTimestamp: pollPayload.filterAfterTimestamp || 0,
          senderFilters: pollPayload.senderFilters || [],
          subjectFilters: pollPayload.subjectFilters || [],
          excludeCodes: pollPayload.excludeCodes || [],
        });
        const match = matchResult.match;

        if (match?.code) {
          if (matchResult.usedTimeFallback) {
            await addLog(`步骤 ${step}：Mailpit 使用时间回退后命中验证码。`, 'warn');
          }
          await addLog(`步骤 ${step}：已在 Mailpit 中找到验证码：${match.code}`, 'ok');
          return {
            ok: true,
            code: match.code,
            emailTimestamp: match.receivedAt || Date.now(),
            mailId: match.message?.id || '',
          };
        }

        lastError = new Error(`步骤 ${step}：暂未在 Mailpit 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
        await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
        const mailSummary = summarizeMessagesForLog(normalizedMessages);
        if (mailSummary) {
          await addLog(`步骤 ${step}：最近邮件样本：${mailSummary}`, 'info');
        }
      }
    } catch (err) {
      lastError = err;
      await addLog(`步骤 ${step}：Mailpit 轮询失败：${err.message}`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepWithStop(intervalMs);
    }
  }

  throw lastError || new Error(`步骤 ${step}：未在 Mailpit 中找到新的匹配验证码。`);
}

function generateRandomSuffix(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < length; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return suffix;
}

function isGeneratedAliasProvider(provider) {
  return provider === '2925';
}

function shouldUseCustomRegistrationEmail(state = {}) {
  return isCustomMailProvider(state)
    || (!isGeneratedAliasProvider(state.mailProvider)
      && normalizeEmailGenerator(state.emailGenerator) === 'custom');
}

function buildGeneratedAliasEmail(state) {
  const provider = state.mailProvider || '163';
  const emailPrefix = (state.emailPrefix || '').trim();

  if (!emailPrefix) {
    throw new Error('2925 邮箱前缀未设置，请先在侧边栏填写。');
  }

  if (provider === '2925') {
    return `${emailPrefix}${generateRandomSuffix(6)}@2925.com`;
  }

  throw new Error(`未支持的别名邮箱类型：${provider}`);
}

// ============================================================
// Tab Registry
// ============================================================

async function getTabRegistry() {
  const state = await getState();
  return state.tabRegistry || {};
}

function normalizeRunTabGroupId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeRunTabGroupWindowId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function getRunTabGroupId(state = {}) {
  return normalizeRunTabGroupId(state.runTabGroupId);
}

function doesTabBelongToRunGroup(tab, state = {}) {
  const runTabGroupId = getRunTabGroupId(state);
  if (runTabGroupId === null) {
    return false;
  }
  return Number(tab?.groupId) === runTabGroupId;
}

function filterTabsForCurrentRun(tabs = [], state = {}) {
  return (Array.isArray(tabs) ? tabs : []).filter((tab) => doesTabBelongToRunGroup(tab, state));
}

function isSenderTabInCurrentRunGroup(sender = {}, state = {}) {
  return doesTabBelongToRunGroup(sender?.tab, state);
}

async function registerTab(source, tabId) {
  const registry = await getTabRegistry();
  registry[source] = { tabId, ready: true };
  await setState({ tabRegistry: registry });
  console.log(LOG_PREFIX, `Tab registered: ${source} -> ${tabId}`);
}

async function collectTrackedTabIdsForRunWindow(windowId, preferredTabId = null) {
  const normalizedWindowId = normalizeRunTabGroupWindowId(windowId);
  const registry = await getTabRegistry();
  const candidateIds = new Set();

  if (Number.isInteger(preferredTabId)) {
    candidateIds.add(preferredTabId);
  }

  for (const entry of Object.values(registry)) {
    const tabId = Number(entry?.tabId);
    if (!Number.isInteger(tabId) || candidateIds.has(tabId)) continue;

    try {
      const tab = await chrome.tabs.get(tabId);
      if (normalizeRunTabGroupWindowId(tab.windowId) === normalizedWindowId) {
        candidateIds.add(tabId);
      }
    } catch { }
  }

  return [...candidateIds];
}

async function ensureRunTabGroupForTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  const tab = await chrome.tabs.get(tabId);
  const state = await getState();
  const runTabGroupId = getRunTabGroupId(state);
  const runWindowId = normalizeRunTabGroupWindowId(state.runTabGroupWindowId);

  if (runTabGroupId !== null && tab.groupId === runTabGroupId) {
    if (runWindowId !== normalizeRunTabGroupWindowId(tab.windowId)) {
      await setState({ runTabGroupWindowId: normalizeRunTabGroupWindowId(tab.windowId) });
    }
    return runTabGroupId;
  }

  if (runTabGroupId !== null) {
    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: runTabGroupId });
      if (runWindowId !== normalizeRunTabGroupWindowId(tab.windowId)) {
        await setState({ runTabGroupWindowId: normalizeRunTabGroupWindowId(tab.windowId) });
      }
      return runTabGroupId;
    } catch (err) {
      console.warn(
        LOG_PREFIX,
        `Failed to reattach tab ${tabId} to run group ${runTabGroupId}: ${err?.message || err}`
      );
    }
  }

  const tabIds = await collectTrackedTabIdsForRunWindow(tab.windowId, tabId);
  if (!tabIds.length) {
    return null;
  }

  const groupOptions = { tabIds };
  const normalizedWindowId = normalizeRunTabGroupWindowId(tab.windowId);
  if (normalizedWindowId !== null) {
    groupOptions.createProperties = { windowId: normalizedWindowId };
  }

  const groupId = await chrome.tabs.group(groupOptions);
  await setState({
    runTabGroupId: groupId,
    runTabGroupWindowId: normalizedWindowId,
  });
  console.log(LOG_PREFIX, `Created run tab group ${groupId} for tab ${tabId}`);
  return groupId;
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

async function findExistingTabForSource(source, referenceUrl) {
  const tabs = await chrome.tabs.query({});
  const matched = tabs
    .filter((tab) => Number.isInteger(tab.id))
    .filter((tab) => matchesSourceUrlFamily(source, tab.url, referenceUrl));

  if (!matched.length) {
    return null;
  }

  matched.sort((left, right) => {
    if (Boolean(right.active) !== Boolean(left.active)) {
      return Number(Boolean(right.active)) - Number(Boolean(left.active));
    }
    if (Boolean(right.highlighted) !== Boolean(left.highlighted)) {
      return Number(Boolean(right.highlighted)) - Number(Boolean(left.highlighted));
    }
    return Number(right.id || 0) - Number(left.id || 0);
  });

  return matched[0] || null;
}

function parseUrlSafely(rawUrl) {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

// Compare two URLs ignoring hash fragment. new URL() normalises trailing slash on root paths,
// so 'https://chatgpt.com' and 'https://chatgpt.com/' are treated as equal.
function isSameLogicalUrl(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    ua.hash = '';
    ub.hash = '';
    return ua.href === ub.href;
  } catch {
    return a === b;
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

function normalizeSub2ApiGroupName(rawValue = '') {
  return String(rawValue || '').trim();
}

function normalizeSub2ApiGroupNames(rawValue = []) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const seen = new Set();
  const names = [];

  for (const value of values) {
    const normalized = normalizeSub2ApiGroupName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(normalized);
  }

  return names;
}

function getSelectedSub2ApiGroupNames(state = {}) {
  return normalizeSub2ApiGroupNames(state.sub2apiGroupNames);
}

function normalizeSub2ApiGroupRecords(groups = []) {
  const seenIds = new Set();
  const seenNames = new Set();
  const normalizedGroups = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    const id = Number(group?.id);
    const name = normalizeSub2ApiGroupName(group?.name);
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
      account_count: Number.isFinite(Number(group?.account_count)) ? Number(group.account_count) : null,
    });
  }

  return normalizedGroups;
}

async function requestSub2ApiJson(rawUrl, path, options = {}) {
  const sub2apiUrl = normalizeSub2ApiUrl(rawUrl);
  const origin = new URL(sub2apiUrl).origin;
  const {
    method = 'GET',
    token = '',
    body = undefined,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUB2API_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`SUB2API 请求超时（>${Math.round(SUB2API_REQUEST_TIMEOUT_MS / 1000)} 秒）`);
    }
    throw new Error(`SUB2API 请求失败：${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (json && typeof json === 'object' && 'code' in json) {
    if (json.code === 0) {
      return json.data;
    }
    throw new Error(json.message || json.detail || `请求失败（${path}）`);
  }

  if (!response.ok) {
    throw new Error((json && (json.message || json.detail)) || `请求失败（HTTP ${response.status}）：${path}`);
  }

  return json;
}

async function loginSub2Api(state = {}) {
  const email = String(state.sub2apiEmail || '').trim();
  const password = String(state.sub2apiPassword || '');

  if (!email) {
    throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
  }
  if (!password) {
    throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
  }

  const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
  const origin = new URL(sub2apiUrl).origin;
  const loginData = await requestSub2ApiJson(sub2apiUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (!String(loginData?.access_token || '').trim()) {
    throw new Error('SUB2API 登录返回缺少 access_token。');
  }

  return {
    origin,
    token: String(loginData.access_token).trim(),
  };
}

async function fetchSub2ApiGroups(state = {}) {
  const { token } = await loginSub2Api(state);
  const groups = await requestSub2ApiJson(state.sub2apiUrl, '/api/v1/admin/groups/all?platform=openai', {
    method: 'GET',
    token,
  });
  return normalizeSub2ApiGroupRecords(groups);
}

async function fetchSub2ApiGroupsWithToken(rawUrl, token) {
  const groups = await requestSub2ApiJson(rawUrl, '/api/v1/admin/groups/all?platform=openai', {
    method: 'GET',
    token,
  });
  return normalizeSub2ApiGroupRecords(groups);
}

function resolveSub2ApiGroups(groups = [], groupNames = []) {
  const availableGroups = normalizeSub2ApiGroupRecords(groups);
  const selectedNames = normalizeSub2ApiGroupNames(groupNames);
  const matchedGroups = [];
  const missingNames = [];

  selectedNames.forEach((name) => {
    const lowerName = name.toLowerCase();
    const matchedGroup = availableGroups.find((group) => group.name.toLowerCase() === lowerName);
    if (matchedGroup) {
      matchedGroups.push(matchedGroup);
    } else {
      missingNames.push(name);
    }
  });

  if (missingNames.length) {
    throw new Error(`SUB2API 中未找到这些 openai 分组：${missingNames.join('、')}。`);
  }

  return matchedGroups;
}

function normalizeSub2ApiRedirectUri() {
  const input = DEFAULT_SUB2API_REDIRECT_URI;
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  const parsed = new URL(withProtocol);
  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = '/auth/callback';
  }
  if (parsed.pathname !== '/auth/callback') {
    throw new Error('SUB2API 回调地址必须是 /auth/callback，例如 http://localhost:1455/auth/callback');
  }
  return parsed.toString();
}

function buildDraftAccountName(groupName) {
  const prefix = (groupName || DEFAULT_SUB2API_GROUP_NAME)
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_SUB2API_GROUP_NAME;
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${stamp}-${random}`;
}

function extractStateFromAuthUrl(authUrl) {
  try {
    return new URL(authUrl).searchParams.get('state') || '';
  } catch {
    return '';
  }
}

function parseLocalhostCallback(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('提供的回调 URL 不是合法链接。');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('回调 URL 协议不正确。');
  }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('步骤 9 只接受 localhost / 127.0.0.1 回调地址。');
  }
  if (parsed.pathname !== '/auth/callback') {
    throw new Error('回调 URL 路径必须是 /auth/callback。');
  }

  const code = (parsed.searchParams.get('code') || '').trim();
  const state = (parsed.searchParams.get('state') || '').trim();
  if (!code || !state) {
    throw new Error('回调 URL 中缺少 code 或 state。');
  }

  return {
    url: parsed.toString(),
    code,
    state,
  };
}

function buildSub2ApiAccountCreatePayload(accountName, credentials, extra, groupIds) {
  const normalizedGroupIds = Array.isArray(groupIds)
    ? groupIds.map((groupId) => Number(groupId)).filter((groupId) => Number.isFinite(groupId) && groupId > 0)
    : [];
  if (!normalizedGroupIds.length) {
    throw new Error('SUB2API 返回的目标分组 ID 无效。');
  }

  const payload = {
    name: accountName,
    notes: '',
    platform: 'openai',
    type: 'oauth',
    credentials,
    concurrency: SUB2API_DEFAULT_CONCURRENCY,
    priority: SUB2API_DEFAULT_PRIORITY,
    rate_multiplier: SUB2API_DEFAULT_RATE_MULTIPLIER,
    group_ids: normalizedGroupIds,
    auto_pause_on_expired: true,
  };

  if (extra) {
    payload.extra = extra;
  }

  return payload;
}

function buildOpenAiCredentials(exchangeData) {
  const credentials = {};
  const allowedKeys = [
    'access_token',
    'refresh_token',
    'id_token',
    'expires_at',
    'email',
    'chatgpt_account_id',
    'chatgpt_user_id',
    'organization_id',
    'client_id',
  ];

  for (const key of allowedKeys) {
    if (exchangeData?.[key] !== undefined && exchangeData?.[key] !== null && exchangeData?.[key] !== '') {
      credentials[key] = exchangeData[key];
    }
  }

  if (!credentials.access_token) {
    throw new Error('SUB2API 交换授权码后未返回 access_token。');
  }

  return credentials;
}

function buildOpenAiExtra(exchangeData) {
  const extra = {};
  const allowedKeys = ['email', 'name', 'privacy_mode'];

  for (const key of allowedKeys) {
    if (exchangeData?.[key] !== undefined && exchangeData?.[key] !== null && exchangeData?.[key] !== '') {
      extra[key] = exchangeData[key];
    }
  }

  return Object.keys(extra).length ? extra : undefined;
}

async function requestSub2ApiOpenAiAuthSession(state = {}) {
  const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
  const selectedGroupNames = getSelectedSub2ApiGroupNames(state);
  if (!selectedGroupNames.length) {
    throw new Error('尚未选择 SUB2API 分组，请先在侧边栏勾选至少一个分组。');
  }

  const redirectUri = normalizeSub2ApiRedirectUri();
  const { token } = await loginSub2Api(state);
  const groups = resolveSub2ApiGroups(
    await fetchSub2ApiGroupsWithToken(sub2apiUrl, token),
    selectedGroupNames
  );
  const draftName = buildDraftAccountName(groups[0]?.name || selectedGroupNames[0] || DEFAULT_SUB2API_GROUP_NAME);
  const groupSummary = groups.map((group) => `${group.name}（#${group.id}）`).join('、');

  const authData = await requestSub2ApiJson(sub2apiUrl, '/api/v1/admin/openai/generate-auth-url', {
    method: 'POST',
    token,
    body: {
      redirect_uri: redirectUri,
    },
  });

  const oauthUrl = String(authData?.auth_url || '').trim();
  const sessionId = String(authData?.session_id || '').trim();
  const oauthState = String(authData?.state || extractStateFromAuthUrl(oauthUrl)).trim();

  if (!oauthUrl || !sessionId) {
    throw new Error('SUB2API 未返回完整的 auth_url / session_id。');
  }

  return {
    oauthUrl,
    sub2apiSessionId: sessionId,
    sub2apiOAuthState: oauthState,
    sub2apiGroupIds: groups.map((group) => group.id),
    sub2apiDraftName: draftName,
    groupSummary,
    redirectUri,
  };
}

async function submitSub2ApiOpenAiCallback(state = {}) {
  const callback = parseLocalhostCallback(state.localhostUrl || '');
  const sub2apiUrl = normalizeSub2ApiUrl(state.sub2apiUrl);
  const selectedGroupNames = getSelectedSub2ApiGroupNames(state);
  const selectedGroupIds = Array.isArray(state.sub2apiGroupIds)
    ? state.sub2apiGroupIds.map((groupId) => Number(groupId)).filter((groupId) => Number.isFinite(groupId) && groupId > 0)
    : [];
  if (!selectedGroupNames.length && !selectedGroupIds.length) {
    throw new Error('尚未选择 SUB2API 分组，请先在侧边栏勾选至少一个分组。');
  }

  const sessionId = String(state.sub2apiSessionId || '').trim();
  if (!sessionId) {
    throw new Error('缺少 SUB2API session_id，请重新执行步骤 1。');
  }

  const expectedState = String(state.sub2apiOAuthState || '').trim();
  if (expectedState && expectedState !== callback.state) {
    throw new Error('本次 localhost 回调中的 state 与步骤 1 生成的 state 不一致，请重新执行步骤 1。');
  }

  const { token } = await loginSub2Api(state);

  let resolvedGroupIds = selectedGroupIds;
  let groupSummary = selectedGroupNames.join('、');
  if (!resolvedGroupIds.length) {
    const resolvedGroups = resolveSub2ApiGroups(
      await fetchSub2ApiGroupsWithToken(sub2apiUrl, token),
      selectedGroupNames
    );
    resolvedGroupIds = resolvedGroups.map((group) => group.id);
    groupSummary = resolvedGroups.map((group) => `${group.name}（#${group.id}）`).join('、');
  }

  const exchangeData = await requestSub2ApiJson(sub2apiUrl, '/api/v1/admin/openai/exchange-code', {
    method: 'POST',
    token,
    body: {
      session_id: sessionId,
      code: callback.code,
      state: callback.state,
    },
  });

  const credentials = buildOpenAiCredentials(exchangeData);
  const extra = buildOpenAiExtra(exchangeData);
  const accountName = String(state.email || '').trim()
    || String(state.sub2apiDraftName || '').trim()
    || buildDraftAccountName(selectedGroupNames[0] || DEFAULT_SUB2API_GROUP_NAME);
  const createPayload = buildSub2ApiAccountCreatePayload(accountName, credentials, extra, resolvedGroupIds);
  const createdAccount = await requestSub2ApiJson(sub2apiUrl, '/api/v1/admin/accounts', {
    method: 'POST',
    token,
    body: createPayload,
  });

  return {
    localhostUrl: callback.url,
    verifiedStatus: `SUB2API 已创建账号 #${createdAccount?.id || 'unknown'}`,
    groupSummary,
  };
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

  const tabs = filterTabsForCurrentRun(await chrome.tabs.query({}), state);
  if (!tabs.length) return;

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
  const state = await getState();
  const tabs = filterTabsForCurrentRun(await chrome.tabs.query({}), state);
  if (!tabs.length) return 0;

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

  const { excludeTabIds = [] } = options;
  const excluded = new Set(excludeTabIds.filter(id => Number.isInteger(id)));
  const state = await getState();
  const tabs = filterTabsForCurrentRun(await chrome.tabs.query({}), state);
  if (!tabs.length) return 0;

  const matchedIds = tabs
    .filter((tab) => Number.isInteger(tab.id) && !excluded.has(tab.id))
    .filter((tab) => typeof tab.url === 'string' && tab.url.startsWith(prefix))
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
let step3PasswordStageResumeInFlight = false;

function getContentScriptResponseTimeoutMs(message, source = '') {
  if (!message || typeof message !== 'object') {
    return 30000;
  }

  if (message.type === 'POLL_EMAIL') {
    const maxAttempts = Math.max(1, Number(message.payload?.maxAttempts) || 1);
    const intervalMs = Math.max(0, Number(message.payload?.intervalMs) || 0);
    if (source === 'mail-2925') {
      return Math.max(90000, maxAttempts * intervalMs + 75000);
    }
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

function sendTabMessageWithTimeout(tabId, source, message, responseTimeoutMs = getContentScriptResponseTimeoutMs(message, source)) {
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

// Navigate a tab to a URL and wait for it to finish loading.
// The onUpdated listener is registered BEFORE chrome.tabs.update is called, so there is no
// window where the 'complete' event fires before we start listening.
async function navigateTabAndAwaitLoad(tabId, url, { active = false, timeoutMs = 30000 } = {}) {
  let timedOut = false;
  // Create the Promise (and register the listener) synchronously before awaiting tabs.update.
  const waitForLoad = new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      timedOut = true;
      resolve();
    }, timeoutMs);
    const listener = (tid, info) => {
      if (tid !== tabId || info.status !== 'complete' || settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  await chrome.tabs.update(tabId, active ? { url, active: true } : { url });
  await waitForLoad;
  if (timedOut) {
    console.warn(LOG_PREFIX, `Tab ${tabId} load timed out after ${timeoutMs}ms, continuing anyway`);
  }
  return { timedOut };
}

async function reuseOrCreateTab(source, url, options = {}) {
  const shouldActivate = Boolean(options.activate);
  const alive = await isTabAlive(source);
  if (alive) {
    const tabId = await getTabId(source);
    await ensureRunTabGroupForTab(tabId);
    await closeConflictingTabsForSource(source, url, { excludeTabIds: [tabId] });
    const currentTab = await chrome.tabs.get(tabId);
    const sameUrl = currentTab.url === url;
    const shouldReloadOnReuse = sameUrl && options.reloadIfSameUrl;

    const registry = await getTabRegistry();
    if (sameUrl) {
      if (shouldActivate) {
        await chrome.tabs.update(tabId, { active: true });
      }
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

    await navigateTabAndAwaitLoad(tabId, url, { active: shouldActivate });
    console.log(LOG_PREFIX, `Reused tab ${source} (${tabId}), navigated to ${url.slice(0, 60)}`);

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

  const existingTab = await findExistingTabForSource(source, url);
  if (existingTab?.id) {
    const tabId = existingTab.id;
    await ensureRunTabGroupForTab(tabId);
    await registerTab(source, tabId);

    if (!isSameLogicalUrl(existingTab.url, url)) {
      // 认领的 tab URL 与目标不同时，先标 not-ready 再导航（与 B 分支语义一致）
      const adoptRegistry = await getTabRegistry();
      if (adoptRegistry[source]) adoptRegistry[source].ready = false;
      await setState({ tabRegistry: adoptRegistry });

      await navigateTabAndAwaitLoad(tabId, url, { active: shouldActivate });
      console.log(LOG_PREFIX, `Adopted tab ${source} (${tabId}), navigated to ${url.slice(0, 60)}`);
    } else {
      if (shouldActivate) {
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});
      }
      console.log(LOG_PREFIX, `Adopted existing tab ${source} (${tabId}) by URL family`);
    }

    if (options.inject) {
      await ensureContentScriptReadyOnTab(source, tabId, {
        inject: options.inject,
        injectSource: options.injectSource,
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: options.logMessage || `${getSourceLabel(source)} 页面仍在加载，正在重试连接内容脚本...`,
      });
    }

    await rememberSourceLastUrl(source, url);
    return tabId;
  }

  // Create new tab
  await closeConflictingTabsForSource(source, url);
  const tab = await chrome.tabs.create({ url, active: shouldActivate });
  await ensureRunTabGroupForTab(tab.id);
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
  const { responseTimeoutMs = getContentScriptResponseTimeoutMs(message, source) } = options;
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
  const defaultTimeoutMs = mail?.source === 'mail-2925' ? 120000 : 45000;
  const { timeoutMs = defaultTimeoutMs, maxRecoveryAttempts = 2 } = options;
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
    'sidepanel': '侧边栏',
    'signup-page': '认证页',
    'vps-panel': 'CPA 面板',
    'qq-mail': 'QQ 邮箱',
    'mail-163': '163 邮箱',
    'gmail-mail': 'Gmail',
    'mail-2925': '2925 邮箱',
    'inbucket-mail': 'Inbucket 邮箱',
    'duck-mail': 'Duck 邮箱',
    'moemail': 'MoeMail',
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

// 判断 signup-page 所在 tab 是否已经跨过「填邮箱 / 填密码」阶段。
// 用于识别「密码提交其实成功了、只是 STEP_COMPLETE 随页面跳转被吞」这种伪失败。
async function hasSignupTabProgressedPastPassword() {
  const tabId = await getTabId('signup-page');
  if (!tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = String(tab?.url || '');
    if (!url) return false;
    if (/\/email-verification|\/signup\/interrupted|\/add-phone|\/onboarding|\/welcome/i.test(url)) {
      return true;
    }
    let hostname = '';
    try { hostname = new URL(url).hostname.toLowerCase(); } catch { hostname = ''; }
    if (/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getErrorMessage(error) {
  return String(typeof error === 'string' ? error : error?.message || '');
}

function isVerificationMailPollingError(error) {
  const message = getErrorMessage(error);
  return /未在 .*邮箱中找到新的匹配邮件|未在 MoeMail 中找到新的匹配验证码|邮箱轮询结束，但未获取到验证码|无法获取新的(?:注册|登录)验证码|页面未能重新就绪|页面通信异常|did not respond in \d+s|elapsed with no matching .* verification email|no matching Gmail verification email/i.test(message);
}

const STEP3_RESTART_FROM_STEP2_ERROR_CODE = 'STEP3_RESTART_FROM_STEP2';
const STEP4_RESTART_FROM_STEP2_ERROR_CODE = 'STEP4_RESTART_FROM_STEP2';
const STEP7_RESTART_FROM_STEP6_ERROR_CODE = 'STEP7_RESTART_FROM_STEP6';
const STEP7_RESTART_FROM_STEP6_MARKER_PATTERN = /^STEP7_RESTART_FROM_STEP6::([^:]+)::(.*)$/;

function createStep3RestartFromStep2Error(details = {}) {
  const { cause = null } = details || {};
  const reasonMessage = cause ? getErrorMessage(cause) : '';
  const error = new Error(`步骤 3：密码页恢复失败，准备回到步骤 2 重新开始注册流程。${reasonMessage ? ` 原因：${reasonMessage}` : ''}`.trim());
  error.code = STEP3_RESTART_FROM_STEP2_ERROR_CODE;
  error.cause = cause || undefined;
  return error;
}

function isStep3RestartFromStep2Error(error) {
  // code 路径：background 内部通过 createStep3RestartFromStep2Error 生成的 error
  if (error?.code === STEP3_RESTART_FROM_STEP2_ERROR_CODE) return true;
  // message 路径：content script 检测到 invalid_state 后，通过约定的标记前缀通知 background
  // 需要 step 2 restart（不共享 error code，靠 message 约定通信）。
  return String(error?.message || '').startsWith('STEP3_INVALID_STATE_RESTART:');
}

function createStep4RestartFromStep2Error(details = {}) {
  const { cause = null } = details || {};
  const reasonMessage = cause ? getErrorMessage(cause) : '';
  const error = new Error(`步骤 4：多次未获取到注册验证码，准备回到步骤 2 重新开始注册流程。${reasonMessage ? ` 原因：${reasonMessage}` : ''}`.trim());
  error.code = STEP4_RESTART_FROM_STEP2_ERROR_CODE;
  error.cause = cause || undefined;
  return error;
}

function isStep4RestartFromStep2Error(error) {
  return error?.code === STEP4_RESTART_FROM_STEP2_ERROR_CODE;
}

function createStep7RestartFromStep6Error(details = {}) {
  const { reason = 'unknown', url = '' } = details || {};
  const reasonLabel = reason === 'login_timeout_error_page'
    ? '检测到登录页超时报错'
    : '步骤 7 请求回到步骤 6';
  const error = new Error(`步骤 7：${reasonLabel}。${url ? `URL: ${url}` : ''}`.trim());
  error.code = STEP7_RESTART_FROM_STEP6_ERROR_CODE;
  error.restartReason = reason;
  error.restartUrl = url;
  return error;
}

function parseStep7RestartFromStep6Marker(message) {
  const normalized = getErrorMessage(message);
  const match = normalized.match(STEP7_RESTART_FROM_STEP6_MARKER_PATTERN);
  if (!match) {
    return null;
  }

  return {
    reason: match[1] || 'unknown',
    url: match[2] || '',
  };
}

function getStep7RestartFromStep6Error(result) {
  if (result?.restartFromStep6) {
    return createStep7RestartFromStep6Error(result);
  }

  const parsed = parseStep7RestartFromStep6Marker(result?.error);
  if (!parsed) {
    return null;
  }

  return createStep7RestartFromStep6Error(parsed);
}

function isStep7RestartFromStep6Error(error) {
  return error?.code === STEP7_RESTART_FROM_STEP6_ERROR_CODE
    || Boolean(parseStep7RestartFromStep6Marker(error));
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
  for (let step = 1; step <= 10; step++) {
    if (!isStepDoneStatus(statuses[step] || 'pending')) {
      return step;
    }
  }
  return null;
}

function getFirstUnfinishedAutoRunStep(statuses = {}) {
  const mergedStatuses = { ...DEFAULT_STATE.stepStatuses, ...statuses };
  for (const step of AUTO_RUN_STEP_SEQUENCE) {
    if (!isStepDoneStatus(mergedStatuses[step] || 'pending')) {
      return step;
    }
  }
  return null;
}

function hasSavedProgress(statuses = {}) {
  return Object.values({ ...DEFAULT_STATE.stepStatuses, ...statuses }).some((status) => status !== 'pending');
}

function getFlowDownstreamSteps(step) {
  const currentStep = Number(step);
  const startIndex = AUTO_RUN_STEP_SEQUENCE.indexOf(currentStep);
  if (startIndex < 0) {
    return [];
  }
  return AUTO_RUN_STEP_SEQUENCE.slice(startIndex + 1);
}

function getManualStepPrerequisites(step) {
  return Array.isArray(MANUAL_STEP_PREREQUISITES?.[step])
    ? [...MANUAL_STEP_PREREQUISITES[step]]
    : [];
}

function getFirstMissingManualPrerequisite(step, statuses = {}) {
  const mergedStatuses = { ...DEFAULT_STATE.stepStatuses, ...statuses };
  for (const prerequisiteStep of getManualStepPrerequisites(step)) {
    if (!isStepDoneStatus(mergedStatuses[prerequisiteStep] || 'pending')) {
      return prerequisiteStep;
    }
  }
  return null;
}

function getDownstreamStateResets(step) {
  if (step === 1) {
    return {
      oauthUrl: null,
      sub2apiSessionId: null,
      sub2apiOAuthState: null,
      sub2apiGroupIds: [],
      sub2apiDraftName: null,
      loginVerificationRequestedAt: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 2) {
    return {
      oauthUrl: null,
      sub2apiSessionId: null,
      sub2apiOAuthState: null,
      sub2apiGroupIds: [],
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
  if (step === 3 || step === 4 || step === 5) {
    return {
      oauthUrl: null,
      sub2apiSessionId: null,
      sub2apiOAuthState: null,
      sub2apiGroupIds: [],
      sub2apiDraftName: null,
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 6 || step === 7) {
    return {
      oauthUrl: null,
      sub2apiSessionId: null,
      sub2apiOAuthState: null,
      sub2apiGroupIds: [],
      sub2apiDraftName: null,
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

  for (const downstream of getFlowDownstreamSteps(step)) {
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

// 当主循环决定「必须回到步骤 2 重开注册」时（step3/step4 restart），仅靠 invalidateDownstreamAfterStepRestart
// 清 extension 本地 state 是不够的——auth.openai.com 的 cookie 还把账号锁在 email-verification 阶段，
// signup tab 也还停留在旧 URL，下一次 reuseOrCreateTab 会在脏状态上继续翻车（典型表现：POST /email-verification 405）。
// 这个函数做三件事，确保主循环拿到一个真正干净的起点：
//   1) 清 auth.openai.com 及相关域名的 cookie / storage，让服务端不再 302 回验证页；
//   2) 关闭现有 signup tab（下一次 reuseOrCreateTab 会新开一个，而不是复用脏页面）；
//   3) 兜底清掉 pendingStep3PasswordStage，防止旧恢复链继续重入。
async function resetSignupSessionForRestart(reason) {
  const reasonText = reason ? `（${reason}）` : '';
  await addLog(`正在清理 OpenAI Auth 会话以便重新开始注册${reasonText}...`, 'info');

  // 1) 清 cookie / storage
  if (chrome.browsingData && typeof chrome.browsingData.remove === 'function') {
    try {
      await chrome.browsingData.remove(
        {
          origins: [
            'https://auth.openai.com',
            'https://auth0.openai.com',
            'https://accounts.openai.com',
            'https://chatgpt.com',
            'https://chat.openai.com',
          ],
        },
        {
          cookies: true,
          localStorage: true,
          cacheStorage: true,
          indexedDB: true,
        }
      );
      await addLog('OpenAI Auth 会话：cookie / storage 已清理。', 'info');
    } catch (error) {
      console.warn(LOG_PREFIX, '[resetSignupSessionForRestart] browsingData.remove failed:', error?.message || error);
      await addLog(`OpenAI Auth 会话清理失败（忽略继续）：${getErrorMessage(error)}`, 'warn');
    }
  } else {
    await addLog('当前运行环境没有 chrome.browsingData，跳过 cookie 清理。', 'warn');
  }

  // 2) 关闭 signup tab
  const signupTabId = await getTabId('signup-page');
  if (signupTabId) {
    try {
      await chrome.tabs.remove(signupTabId);
    } catch (error) {
      console.warn(LOG_PREFIX, '[resetSignupSessionForRestart] tabs.remove failed:', error?.message || error);
    }
    try {
      const registry = await getTabRegistry();
      if (registry['signup-page']?.tabId === signupTabId || registry['signup-page']?.tabId === undefined) {
        registry['signup-page'] = null;
        await setState({ tabRegistry: registry });
      }
    } catch (error) {
      console.warn(LOG_PREFIX, '[resetSignupSessionForRestart] registry cleanup failed:', error?.message || error);
    }
  }

  // 3) 兜底清 pending key
  await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
}

// 标记「下一次 executeStep2 要走强制新注册入口」。配合 resetSignupSessionForRestart 使用，
// 即使 cookie 清理没起作用（环境降级、权限缺失等），step 2 也不会被「已在 verification 页」误判为已完成。
async function markStep2ForceFreshSignup() {
  try {
    await chrome.storage.session.set({ [STEP2_FORCE_FRESH_SIGNUP_KEY]: true });
  } catch (error) {
    console.warn(LOG_PREFIX, '[markStep2ForceFreshSignup] failed:', error?.message || error);
  }
}

// 消费 forceFreshSignup 标记，读取并立即清除。返回 true 表示本次 step 2 需要强制新起点。
async function consumeStep2ForceFreshSignup() {
  try {
    const got = await chrome.storage.session.get(STEP2_FORCE_FRESH_SIGNUP_KEY);
    const flag = Boolean(got?.[STEP2_FORCE_FRESH_SIGNUP_KEY]);
    if (flag) {
      await chrome.storage.session.remove(STEP2_FORCE_FRESH_SIGNUP_KEY).catch(() => {});
    }
    return flag;
  } catch (error) {
    console.warn(LOG_PREFIX, '[consumeStep2ForceFreshSignup] failed:', error?.message || error);
    return false;
  }
}


async function markStep2SkipDirectCreateAccount() {
  try {
    await chrome.storage.session.set({ [STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY]: true });
  } catch (error) {
    console.warn(LOG_PREFIX, '[markStep2SkipDirectCreateAccount] failed:', error?.message || error);
  }
}

async function consumeStep2SkipDirectCreateAccount() {
  try {
    const got = await chrome.storage.session.get(STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY);
    const flag = Boolean(got?.[STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY]);
    if (flag) {
      await chrome.storage.session.remove(STEP2_SKIP_DIRECT_CREATE_ACCOUNT_KEY).catch(() => {});
    }
    return flag;
  } catch (error) {
    console.warn(LOG_PREFIX, '[consumeStep2SkipDirectCreateAccount] failed:', error?.message || error);
    return false;
  }
}

function clearStopRequest() {
  stopRequested = false;
  autoRunCountdownSkipRequested = false;
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
  const scheduledAt = state.scheduledAutoRunAt === null ? null : Number(state.scheduledAutoRunAt);
  return Boolean(state.autoRunning)
    && state.autoRunPhase === 'scheduled'
    && Number.isFinite(scheduledAt)
    && Boolean(normalizeScheduledAutoRunPlan(state.scheduledAutoRunPlan));
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

async function ensureScheduledAutoRunAlarm(scheduledAt) {
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
    return false;
  }

  const existingAlarm = await chrome.alarms.get(AUTO_RUN_ALARM_NAME);
  if (!existingAlarm || Math.abs((existingAlarm.scheduledTime || 0) - scheduledAt) > 1000) {
    await chrome.alarms.clear(AUTO_RUN_ALARM_NAME);
    await chrome.alarms.create(AUTO_RUN_ALARM_NAME, { when: scheduledAt });
  }

  return true;
}

async function clearScheduledAutoRunAlarm() {
  await chrome.alarms.clear(AUTO_RUN_ALARM_NAME);
}

async function scheduleAutoRun(totalRuns, options = {}) {
  const state = await getState();
  if (isAutoRunLockedState(state) || isAutoRunPausedState(state) || autoRunActive) {
    throw new Error('自动运行已在进行中，请先停止后再重新计划。');
  }
  if (isAutoRunScheduledState(state)) {
    throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
  }

  const delayMinutes = normalizeAutoRunDelayMinutes(options.delayMinutes);
  const plan = normalizeScheduledAutoRunPlan({
    totalRuns,
    autoRunSkipFailures: options.autoRunSkipFailures,
    mode: options.mode,
  });
  const scheduledAt = Date.now() + delayMinutes * 60 * 1000;

  autoRunCurrentRun = 0;
  autoRunTotalRuns = plan.totalRuns;
  autoRunAttemptRun = 0;

  await ensureScheduledAutoRunAlarm(scheduledAt);
  await broadcastAutoRunStatus(
    'scheduled',
    {
      currentRun: 0,
      totalRuns: plan.totalRuns,
      attemptRun: 0,
      scheduledAt,
      countdownAt: scheduledAt,
      countdownTitle: '已计划自动运行',
      countdownNote: `计划于 ${formatAutoRunScheduleTime(scheduledAt)} 开始`,
    },
    {
      autoRunSkipFailures: plan.autoRunSkipFailures,
      scheduledAutoRunPlan: plan,
    }
  );
  await addLog(
    `自动运行已计划：${delayMinutes} 分钟后启动（${formatAutoRunScheduleTime(scheduledAt)}），目标 ${plan.totalRuns} 轮。`,
    'info'
  );
  return { ok: true, scheduledAt };
}

let scheduledAutoRunLaunching = false;

async function launchScheduledAutoRun(trigger = 'alarm') {
  if (scheduledAutoRunLaunching) {
    return false;
  }

  scheduledAutoRunLaunching = true;
  try {
    const state = await getState();
    if (!isAutoRunScheduledState(state)) {
      return false;
    }
    if (autoRunActive) {
      return false;
    }

    const plan = normalizeScheduledAutoRunPlan(state.scheduledAutoRunPlan);
    if (!plan) {
      await clearScheduledAutoRunAlarm();
      await broadcastAutoRunStatus('idle', {
        currentRun: 0,
        totalRuns: 1,
        attemptRun: 0,
      }, {
        scheduledAutoRunPlan: null,
      });
      return false;
    }

    await clearScheduledAutoRunAlarm();
    if (trigger !== 'manual' && state.autoRunDelayEnabled) {
      await setAutoRunDelayEnabledState(false);
    }
    await broadcastAutoRunStatus(
      'running',
      {
        currentRun: 0,
        totalRuns: plan.totalRuns,
        attemptRun: 0,
      },
      {
        autoRunSkipFailures: plan.autoRunSkipFailures,
        scheduledAutoRunPlan: null,
      }
    );

    clearStopRequest();
    await addLog(
      trigger === 'manual'
        ? '已手动跳过倒计时，自动运行立即开始。'
        : '倒计时结束，自动运行开始执行。',
      'info'
    );
    startAutoRunLoop(plan.totalRuns, {
      autoRunSkipFailures: Boolean(plan.autoRunSkipFailures),
      mode: plan.mode,
    });
    return true;
  } finally {
    scheduledAutoRunLaunching = false;
  }
}

async function cancelScheduledAutoRun(options = {}) {
  const state = await getState();
  if (!isAutoRunScheduledState(state)) {
    return false;
  }
  const plan = normalizeScheduledAutoRunPlan(state.scheduledAutoRunPlan);

  await clearScheduledAutoRunAlarm();
  autoRunCurrentRun = 0;
  autoRunTotalRuns = plan?.totalRuns || 1;
  autoRunAttemptRun = 0;
  await broadcastAutoRunStatus(
    'idle',
    {
      currentRun: 0,
      totalRuns: plan?.totalRuns || 1,
      attemptRun: 0,
    },
    {
      scheduledAutoRunPlan: null,
    }
  );
  if (options.logMessage !== false) {
    await addLog(options.logMessage || '已取消自动运行倒计时计划。', 'warn');
  }
  return true;
}

async function restoreScheduledAutoRunIfNeeded() {
  const state = await getState();
  if (state.autoRunPhase !== 'scheduled') {
    return;
  }

  const plan = normalizeScheduledAutoRunPlan(state.scheduledAutoRunPlan);
  const scheduledAt = state.scheduledAutoRunAt === null ? null : Number(state.scheduledAutoRunAt);
  if (!plan || !Number.isFinite(scheduledAt)) {
    await clearScheduledAutoRunAlarm();
    await broadcastAutoRunStatus('idle', {
      currentRun: 0,
      totalRuns: 1,
      attemptRun: 0,
    }, {
      scheduledAutoRunPlan: null,
    });
    return;
  }

  if (scheduledAt <= Date.now()) {
    await launchScheduledAutoRun('restore');
    return;
  }

  await ensureScheduledAutoRunAlarm(scheduledAt);
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

  if (!Number.isInteger(step) || step < 1 || step > 10) {
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

  const missingPrerequisiteStep = getFirstMissingManualPrerequisite(step, statuses);
  if (missingPrerequisiteStep) {
    throw new Error(`请先完成步骤 ${missingPrerequisiteStep}，再跳过步骤 ${step}。`);
  }

  await setStepStatus(step, 'skipped');
  await addLog(`步骤 ${step} 已跳过`, 'warn');

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

async function clickWithDebugger(tabId, rect, options = {}) {
  throwIfStopped();
  const actionLabel = String(options.actionLabel || '调试器点击').trim() || '调试器点击';
  if (!tabId) {
    throw new Error(`未找到用于${actionLabel}的认证页面标签页。`);
  }
  if (!rect || !Number.isFinite(rect.centerX) || !Number.isFinite(rect.centerY)) {
    throw new Error(`${actionLabel}需要有效的按钮坐标。`);
  }

  const target = { tabId };
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (err) {
    throw new Error(
      `${actionLabel}附加调试器失败：${err.message}。` +
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
let autoRunCountdownSkipRequested = false;

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
        const state = await getState();
        if (!isSenderTabInCurrentRunGroup(sender, state)) {
          console.log(
            LOG_PREFIX,
            `Ignoring CONTENT_SCRIPT_READY from ${message.source} outside current run group`,
            { tabId, groupId: sender.tab?.groupId ?? null }
          );
          return { ok: true, ignored: true };
        }
        await registerTab(message.source, tabId);
        flushCommand(message.source, tabId);
        await addLog(`内容脚本已就绪：${getSourceLabel(message.source)}（标签页 ${tabId}）`);
        if (message.source === 'signup-page') {
          maybeResumePendingStep3PasswordStage(state).catch(async (error) => {
            console.warn(LOG_PREFIX, '[maybeResumePendingStep3PasswordStage] failed:', error?.message || error);
            await handleStep3PasswordStageResumeFailure(error).catch((notifyError) => {
              console.warn(LOG_PREFIX, '[handleStep3PasswordStageResumeFailure] failed:', notifyError?.message || notifyError);
            });
          });
        }
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
      await clearScheduledAutoRunAlarm();
      await resetState();
      await setState({
        tabRegistry: {},
        sourceLastUrls: {},
        runTabGroupId: null,
        runTabGroupWindowId: null,
      });
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
      if (isAutoRunScheduledState(state)) {
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
      const started = await launchScheduledAutoRun('manual');
      if (!started) {
        throw new Error('当前没有可立即开始的倒计时计划。');
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

    case 'CANCEL_SCHEDULED_AUTO_RUN': {
      const cancelled = await cancelScheduledAutoRun();
      if (!cancelled) {
        throw new Error('当前没有可取消的倒计时计划。');
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
      await setPersistentSettings(updates);
      await setState(updates);
      return { ok: true, state: await getState() };
    }

    case 'EXPORT_SETTINGS': {
      return { ok: true, ...(await exportSettingsBundle()) };
    }

    case 'IMPORT_SETTINGS': {
      const state = await importSettingsBundle(message.payload?.config || null);
      return { ok: true, state };
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
      return { ok: true, ...(await setIcloudAliasUsedState(message.payload || {})) };
    }

    case 'SET_ICLOUD_ALIAS_PRESERVED_STATE': {
      clearStopRequest();
      return { ok: true, ...(await setIcloudAliasPreservedState(message.payload || {})) };
    }

    case 'DELETE_ICLOUD_ALIAS': {
      clearStopRequest();
      return { ok: true, ...(await deleteIcloudAlias(message.payload)) };
    }

    case 'DELETE_USED_ICLOUD_ALIASES': {
      clearStopRequest();
      return { ok: true, ...(await deleteUsedIcloudAliases()) };
    }

    case 'GET_ACCOUNTS': {
      return { ok: true, accounts: await getCompletedAccounts() };
    }

    case 'DELETE_ACCOUNT': {
      const accounts = await deleteCompletedAccount(message.payload?.index);
      return { ok: true, accounts };
    }

    case 'CLEAR_ACCOUNTS': {
      const accounts = await clearCompletedAccounts();
      return { ok: true, accounts };
    }

    case 'IMPORT_ACCOUNT_DATA': {
      return { ok: true, ...(await importAccountDataBundle(message.payload?.config || null)) };
    }

    case 'FETCH_MOEMAIL_DOMAINS': {
      const state = await getState();
      const overrides = buildPersistentSettingsPayload(message.payload || {});
      const domains = await fetchMoemailDomains({ ...state, ...overrides });
      return { ok: true, domains };
    }

    case 'FETCH_SUB2API_GROUPS': {
      const state = await getState();
      const payload = message.payload || {};
      const groups = await fetchSub2ApiGroups({
        ...state,
        sub2apiUrl: payload.sub2apiUrl,
        sub2apiEmail: payload.sub2apiEmail,
        sub2apiPassword: payload.sub2apiPassword,
      });
      return { ok: true, groups };
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
      if (payload.sub2apiGroupIds !== undefined) {
        updates.sub2apiGroupIds = Array.isArray(payload.sub2apiGroupIds)
          ? payload.sub2apiGroupIds.map((groupId) => Number(groupId)).filter((groupId) => Number.isFinite(groupId) && groupId > 0)
          : [];
      }
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
    case 5:
      await upsertCurrentAccountRecord(ACCOUNT_STATUS_REGISTERED);
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
      const localhostPrefix = buildLocalhostCleanupPrefix(payload.localhostUrl);
      if (localhostPrefix) {
        await closeTabsByUrlPrefix(localhostPrefix);
      }
      await upsertCurrentAccountRecord(ACCOUNT_STATUS_AUTHORIZED, {
        email: latestState.email,
        password: latestState.password,
      });
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
const AUTO_RUN_BACKGROUND_COMPLETED_STEPS = new Set([4, 7, 8]);
const STEP_COMPLETION_SIGNAL_STEPS = new Set([1, 2, 3, 5, 6, 9, 10]);

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

async function maybeResumePendingStep3PasswordStage(state = null) {
  if (step3PasswordStageResumeInFlight) {
    return;
  }

  const latestState = state || await getState();
  const step3Running = latestState?.currentStep === 3 || latestState?.stepStatuses?.[3] === 'running';
  if (!step3Running) {
    return;
  }

  const pending = (await chrome.storage.session.get(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => ({})))?.[STEP3_PENDING_PASSWORD_STAGE_KEY];
  if (!pending) {
    return;
  }

  if (pending.status === 'resuming') {
    return;
  }

  step3PasswordStageResumeInFlight = true;
  try {
    await chrome.storage.session.set({
      [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
        ...pending,
        status: 'resuming',
        resumeStartedAt: Date.now(),
      },
    }).catch(() => {});

    await addLog('步骤 3：检测到密码页已重新就绪，正在继续填写密码...', 'info');
    let result = null;
    try {
      result = await sendToContentScript('signup-page', {
        type: 'EXECUTE_STEP',
        step: 3,
        source: 'background',
        payload: {
          email: pending.email || latestState.email,
          password: latestState.password,
        },
      }, {
        responseTimeoutMs: 30000,
      });
    } catch (error) {
      if (isRetryableContentScriptTransportError(error)) {
        // 先看 signup-page tab 是否其实已经推进到「邮箱验证码 / 后续」阶段。
        // 如果已推进，说明密码提交实际是成功的，只是 STEP_COMPLETE 在页面跳转过程中被吞，
        // 此时不该回退到步骤 2，应该把步骤 3 直接标记完成让主循环继续。
        const progressed = await hasSignupTabProgressedPastPassword();
        if (progressed) {
          await addLog('步骤 3：密码已提交且页面已推进到下一阶段，视为完成（恢复 transport error 竞争）。', 'ok');
          await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
          const latestStatuses = (await getState()).stepStatuses || {};
          const recoveredPayload = {
            email: pending.email || latestState.email,
            recoveredFromTransportError: true,
          };
          if (latestStatuses[3] === 'completed') {
            notifyStepComplete(3, recoveredPayload);
          } else {
            await completeStepFromBackground(3, recoveredPayload);
          }
          return;
        }
        await addLog('步骤 3：密码页内容脚本尚未就绪，正在等待账号创建表单恢复...', 'warn');
        await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
        throw createStep3RestartFromStep2Error({ cause: error });
      }
      throw error;
    }

    if (result?.emailStageSubmitted) {
      // resume 路径应当落在密码页，若再次看到邮箱阶段说明 OAuth state 已损坏（典型：
      // invalid_state 点「重试」让页面暂时跳回邮箱表单，填邮箱后再次提交又回到 invalid_state）。
      // 允许第 1 次"意外回到邮箱"等待一次，第 2 次直接触发 step 2 restart（清 cookie 重建 OAuth context）。
      const resumeEmailCount = (pending.resumeEmailCount || 0) + 1;
      if (resumeEmailCount >= 2) {
        await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
        throw new Error(
          `STEP3_INVALID_STATE_RESTART: 密码页恢复 ${resumeEmailCount} 次仍回到邮箱提交阶段，` +
          `OAuth state 已彻底失效，需清理 cookie 从步骤 2 重新开始。URL: ${pending.url || '(unknown)'}`
        );
      }
      await chrome.storage.session.set({
        [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
          ...pending,
          status: 'waiting',
          startedAt: Date.now(),
          resumeEmailCount,
        },
      }).catch(() => {});
      await addLog(
        `步骤 3：密码页恢复执行时仍回到了邮箱阶段（第 ${resumeEmailCount} 次），继续等待下一次页面就绪事件...`,
        'warn'
      );
      return;
    }

    if (result?.error) {
      await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
      throw new Error(result.error);
    }
    await chrome.storage.session.remove(STEP3_PENDING_PASSWORD_STAGE_KEY).catch(() => {});
  } catch (error) {
    const errorMsg = String(error?.message || error);
    // STEP3_INVALID_STATE_RESTART 和停止信号需要触发 step 2 restart 或停止，不应重置 pending stage
    // 让它继续等待——那样会屏蔽 notifyStepError 并导致 step 2 restart 机制失效。
    const shouldResetPending = error
      && !errorMsg.includes('当前邮箱已存在')
      && !errorMsg.startsWith('STEP3_INVALID_STATE_RESTART:');
    if (shouldResetPending) {
      await chrome.storage.session.set({
        [STEP3_PENDING_PASSWORD_STAGE_KEY]: {
          ...pending,
          status: 'waiting',
          startedAt: Date.now(),
        },
      }).catch(() => {});
    }
    throw error;
  } finally {
    step3PasswordStageResumeInFlight = false;
  }
}

async function handleStep3PasswordStageResumeFailure(error) {
  await finalizeDeferredStepExecutionError(3, error);
  notifyStepError(3, getErrorMessage(error));
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

  if (isAutoRunScheduledState(state) && !autoRunActive) {
    await cancelScheduledAutoRun({
      logMessage: options.logMessage === false
        ? false
        : (options.logMessage || '已取消自动运行倒计时计划。'),
    });
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

  // 首次进入注册或授权链路时记录本轮流程起点
  if ((step === 1 || step === 2 || step === 3) && !state.flowStartTime) {
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
      case 10: await executeStep10(state); break;
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

function findLatestStepFailureLogMessage(step, logs = []) {
  const targetPrefix = `步骤 ${step} 失败：`;
  const entries = Array.isArray(logs) ? logs : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const message = String(entries[index]?.message || '');
    if (message.startsWith(targetPrefix)) {
      return message;
    }
  }
  return '';
}

async function throwIfStepFailedAfterCompletionSignal(step) {
  const state = await getState();
  const status = state?.stepStatuses?.[step];
  if (status === 'failed') {
    throw new Error(findLatestStepFailureLogMessage(step, state?.logs) || `步骤 ${step} 在完成信号后失败，请查看日志。`);
  }
  if (status === 'stopped') {
    throw new Error(`步骤 ${step} 已被用户停止`);
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

  if (doesStepUseCompletionSignal(step)) {
    await throwIfStepFailedAfterCompletionSignal(step);
  }
}

function getEmailGeneratorLabel(generator) {
  if (generator === 'custom') {
    return '自定义邮箱';
  }
  if (generator === 'cloudflare') {
    return 'Cloudflare 邮箱';
  }
  if (generator === 'icloud') {
    return 'iCloud 邮箱';
  }
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

async function fetchIcloudGeneratedEmail(state, options = {}) {
  void options;
  return withIcloudLoginHelp('生成 iCloud Hide My Email 别名', async () => {
    throwIfStopped();
    await addLog('iCloud：正在验证 Hide My Email 登录态...', 'info');

    const { serviceUrl, setupUrl } = await resolveIcloudPremiumMailService();
    await addLog(`iCloud：登录态验证通过（${new URL(setupUrl).host}）`, 'ok');

    const existingAliasesResponse = await icloudRequest('GET', `${serviceUrl}/v2/hme/list`);
    const currentState = state || await getState();
    const importedState = await getImportedAccountState();
    const usedEmails = getUsedIcloudEmails({
      accounts: importedState.accounts?.length ? importedState.accounts : currentState.accounts,
      manualAliasUsage: importedState.manualAliasUsage || {},
    });
    const existingAliases = (findIcloudAliasArray(existingAliasesResponse) || [])
      .map((alias) => normalizeIcloudAliasRecord(alias, usedEmails))
      .filter(Boolean);

    const reusableAlias = existingAliases.find((alias) => alias.active && !alias.used);
    if (reusableAlias) {
      await setEmailState(reusableAlias.email);
      await addLog(`iCloud：复用未使用别名 ${reusableAlias.email}`, 'ok');
      return reusableAlias.email;
    }

    await addLog('iCloud：没有可复用别名，正在申请新的 Hide My Email 地址...', 'info');

    const generated = await icloudRequest('POST', `${serviceUrl}/v1/hme/generate`);
    if (!generated?.success || !generated?.result?.hme) {
      throw new Error(generated?.error?.errorMessage || 'iCloud Hide My Email generate failed.');
    }

    const reservePayload = {
      hme: generated.result.hme,
      label: `Codex OAuth ${new Date().toISOString().slice(0, 10)}`,
      note: 'Generated through codex-oauth-automation-extension',
    };
    const reserved = await icloudRequest('POST', `${serviceUrl}/v1/hme/reserve`, {
      data: reservePayload,
    });

    if (!reserved?.success || !reserved?.result?.hme?.hme) {
      throw new Error(reserved?.error?.errorMessage || 'iCloud Hide My Email reserve failed.');
    }

    const alias = reserved.result.hme.hme;
    await setEmailState(alias);
    await addLog(`iCloud：已生成新的 Hide My Email 别名 ${alias}`, 'ok');
    return alias;
  });
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
  if (isMoemailProvider(currentState)) {
    return fetchMoemailGeneratedEmail(currentState, options);
  }
  if (isMailpitProvider(currentState)) {
    return fetchMailpitGeneratedEmail(currentState, options);
  }
  const generator = normalizeEmailGenerator(options.generator ?? currentState.emailGenerator);
  if (generator === 'custom') {
    throw new Error('当前邮箱生成方式为自定义邮箱，请直接填写注册邮箱。');
  }
  if (generator === 'cloudflare') {
    return fetchCloudflareEmail(currentState, options);
  }
  if (generator === 'icloud') {
    return fetchIcloudGeneratedEmail(currentState, options);
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
  if (isGeneratedAliasProvider(currentState.mailProvider)) {
    if (!currentState.emailPrefix) {
      throw new Error('2925 邮箱前缀未设置，请先在侧边栏填写。');
    }
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：2925 模式已启用，将在步骤 3 自动生成邮箱（第 ${attemptRuns} 次尝试）===`, 'info');
    return null;
  }

  if (currentState.email) {
    return currentState.email;
  }

  if (isMoemailProvider(currentState)) {
    let lastError = null;
    for (let attempt = 1; attempt <= EMAIL_FETCH_MAX_ATTEMPTS; attempt++) {
      try {
        if (attempt > 1) {
          await addLog(`MoeMail：正在进行第 ${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS} 次自动生成重试...`, 'warn');
        }
        const generatedEmail = await fetchGeneratedEmail(currentState, { generateNew: true });
        await addLog(
          `=== 目标 ${targetRun}/${totalRuns} 轮：MoeMail 邮箱已就绪：${generatedEmail}（第 ${attemptRuns} 次尝试，第 ${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS} 次生成）===`,
          'ok'
        );
        return generatedEmail;
      } catch (err) {
        lastError = err;
        await addLog(`MoeMail 自动生成失败（${attempt}/${EMAIL_FETCH_MAX_ATTEMPTS}）：${err.message}`, 'warn');
      }
    }
    throw lastError || new Error('MoeMail 邮箱生成失败。');
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
      if (generator === 'cloudflare' && /域名/.test(String(err.message || ''))) {
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
  // commit 2c: 配合 resetSignupSessionForRestart（cookie/tab 彻底清理）给更充裕的恢复预算。
  // 之前只给 1 次是因为重启不干净、再试一次通常会继续踩同一个坑；现在每次重启都是干净起点，2 次更稳。
  const maxStep3RestartAttempts = 2;
  const maxStep4RestartAttempts = 2;
  const maxStep9RestartAttempts = 5;
  let step3RestartAttempts = 0;
  let step4RestartAttempts = 0;
  let step9RestartAttempts = 0;
  const startIndex = AUTO_RUN_STEP_SEQUENCE.indexOf(startStep);
  if (startIndex < 0) {
    throw new Error(`自动运行遇到未知起始步骤：${startStep}`);
  }

  if (continued) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：继续当前进度，从步骤 ${startStep} 开始（第 ${attemptRuns} 次尝试）===`, 'info');
  } else {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：第 ${attemptRuns} 次尝试，将先完成注册，再进入 OAuth 授权 ===`, 'info');
  }

  let stepIndex = startIndex;
  let loggedRegistrationPhase = false;
  let loggedAuthorizationPhase = false;

  while (stepIndex < AUTO_RUN_STEP_SEQUENCE.length) {
    const step = AUTO_RUN_STEP_SEQUENCE[stepIndex];

    if (!loggedRegistrationPhase && [2, 3, 4, 5].includes(step)) {
      loggedRegistrationPhase = true;
      await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：阶段 1，打开独立注册页并完成注册（第 ${attemptRuns} 次尝试）===`, 'info');
    }

    if (!loggedAuthorizationPhase && [1, 6, 7, 8, 9].includes(step)) {
      loggedAuthorizationPhase = true;
      await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：阶段 2，获取 OAuth 链接并完成授权（第 ${attemptRuns} 次尝试）===`, 'info');
      await broadcastAutoRunStatus('running', {
        currentRun: targetRun,
        totalRuns,
        attemptRun: attemptRuns,
      });
    }

    if (step === 3) {
      await ensureAutoEmailReady(targetRun, totalRuns, attemptRuns);
    }

    try {
      await executeStepAndWait(step, AUTO_STEP_DELAYS[step]);
      if (step === 5) {
        const signupTabId = await getTabId('signup-page');
        if (signupTabId) {
          await ensureRunTabGroupForTab(signupTabId);
        }
      }
      stepIndex += 1;
    } catch (err) {
      const shouldRestartStep3 = step === 3
        && isStep3RestartFromStep2Error(err)
        && step3RestartAttempts < maxStep3RestartAttempts;
      const shouldRestartStep4 = step === 4
        && isStep4RestartFromStep2Error(err)
        && step4RestartAttempts < maxStep4RestartAttempts;
      const shouldRetryStep9 = step === 9
        && (
          isLegacyStep9RecoverableAuthError(err)
          || isStep9RecoverableAuthError(err)
        )
        && step9RestartAttempts < maxStep9RestartAttempts;

      if (shouldRestartStep3) {
        step3RestartAttempts += 1;
        await addLog(
          `步骤 3：密码页恢复异常，正在回到步骤 2 重新开始注册流程（${step3RestartAttempts}/${maxStep3RestartAttempts}）...`,
          'warn'
        );
        await resetSignupSessionForRestart(`步骤 3 密码页恢复异常（${step3RestartAttempts}/${maxStep3RestartAttempts}）`);
        await invalidateDownstreamAfterStepRestart(2, {
          logLabel: `步骤 3 密码页恢复异常后准备回到步骤 2 重试（${step3RestartAttempts}/${maxStep3RestartAttempts}）`,
        });
        await markStep2ForceFreshSignup();
        if (String(err?.message || '').startsWith('STEP3_INVALID_STATE_RESTART:')) {
          await markStep2SkipDirectCreateAccount();
        }
        stepIndex = AUTO_RUN_STEP_SEQUENCE.indexOf(2);
        loggedRegistrationPhase = false;
        continue;
      }

      if (shouldRestartStep4) {
        step4RestartAttempts += 1;
        await addLog(
          `步骤 4：多次未获取到注册验证码，正在回到步骤 2 重新开始注册流程（${step4RestartAttempts}/${maxStep4RestartAttempts}）...`,
          'warn'
        );
        await resetSignupSessionForRestart(`步骤 4 验证码超时（${step4RestartAttempts}/${maxStep4RestartAttempts}）`);
        await invalidateDownstreamAfterStepRestart(2, {
          logLabel: `步骤 4 验证码超时后准备回到步骤 2 重试（${step4RestartAttempts}/${maxStep4RestartAttempts}）`,
        });
        await markStep2ForceFreshSignup();
        stepIndex = AUTO_RUN_STEP_SEQUENCE.indexOf(2);
        loggedRegistrationPhase = false;
        continue;
      }

      if (shouldRetryStep9) {
        step9RestartAttempts += 1;
        await addLog(
          `步骤 9：检测到 CPA 认证失败，正在回到步骤 6 重新开始授权流程（${step9RestartAttempts}/${maxStep9RestartAttempts}）...`,
          'warn'
        );
        await invalidateDownstreamAfterStepRestart(6, {
          logLabel: `步骤 9 认证失败后准备回到步骤 6 重试（${step9RestartAttempts}/${maxStep9RestartAttempts}）`,
        });
        stepIndex = AUTO_RUN_STEP_SEQUENCE.indexOf(6);
        loggedAuthorizationPhase = false;
        continue;
      }
      throw err;
    }
  }
}

// Outer loop: keep retrying until the target number of successful runs is reached.
async function legacyAutoRunLoop(totalRuns, options = {}) {
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
  const resumeCurrentRun = Number.isInteger(options.resumeCurrentRun) ? options.resumeCurrentRun : 0;
  const resumeSuccessfulRuns = Number.isInteger(options.resumeSuccessfulRuns) ? options.resumeSuccessfulRuns : 0;
  const resumeAttemptRunsProcessed = Number.isInteger(options.resumeAttemptRunsProcessed) ? options.resumeAttemptRunsProcessed : 0;
  let maxAttempts = autoRunSkipFailures ? Math.max(totalRuns * 10, totalRuns + 20) : totalRuns;
  const forcedRetryCap = Math.max(totalRuns * 10, totalRuns + 20);
  let successfulRuns = Math.max(0, resumeSuccessfulRuns);
  let attemptRuns = Math.max(0, resumeAttemptRunsProcessed);
  let forceFreshTabsNextRun = false;
  let continueCurrentOnFirstAttempt = initialMode === 'continue';
  const initialState = await getState();
  const initialPhase = continueCurrentOnFirstAttempt && getRunningSteps(initialState.stepStatuses).length
    ? 'waiting_step'
    : 'running';

  await setState({
    autoRunSkipFailures,
    ...getAutoRunStatusPayload(initialPhase, {
      currentRun: resumeCurrentRun,
      totalRuns,
      attemptRun: resumeAttemptRunsProcessed,
    }),
  });

  while (successfulRuns < totalRuns && attemptRuns < maxAttempts) {
    attemptRuns += 1;
    const targetRun = successfulRuns + 1;
    autoRunCurrentRun = targetRun;
    autoRunAttemptRun = attemptRuns;
    let startStep = AUTO_RUN_STEP_SEQUENCE[0];
    let useExistingProgress = false;

    if (continueCurrentOnFirstAttempt) {
      let currentState = await getState();
      if (getRunningSteps(currentState.stepStatuses).length) {
        currentState = await waitForRunningStepsToFinish({
          currentRun: targetRun,
          totalRuns,
          attemptRun: attemptRuns,
        });
      }
      const resumeStep = getFirstUnfinishedAutoRunStep(currentState.stepStatuses);
      if (resumeStep && hasSavedProgress(currentState.stepStatuses)) {
        startStep = resumeStep;
        useExistingProgress = true;
      } else if (hasSavedProgress(currentState.stepStatuses)) {
        await addLog('当前流程已全部处理，将按“重新开始”从步骤 2 新开一轮自动运行。', 'info');
      }
      continueCurrentOnFirstAttempt = false;
    }

    if (!useExistingProgress) {
      // Reset everything at the start of each fresh attempt (keep user settings).
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
        icloudHostPreference: prevState.icloudHostPreference,
        emailPrefix: prevState.emailPrefix,
        preferredIcloudHost: prevState.preferredIcloudHost,
        inbucketHost: prevState.inbucketHost,
        inbucketMailbox: prevState.inbucketMailbox,
        moemailApiBaseUrl: prevState.moemailApiBaseUrl,
        moemailApiKey: prevState.moemailApiKey,
        moemailDomain: prevState.moemailDomain,
        cloudflareDomain: prevState.cloudflareDomain,
        cloudflareDomains: prevState.cloudflareDomains,
        // Fresh attempts must drop stale tab/url runtime state from the prior run.
        runTabGroupId: null,
        runTabGroupWindowId: null,
        tabRegistry: {},
        sourceLastUrls: {},
        ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun: attemptRuns }),
      };
      // 关闭上一轮遗留的 signup tab，避免浏览器随运行轮次不断积累脏标签页。
      // tabRegistry 即将被清空（keepSettings.tabRegistry = {}），必须先从 prevState 里读。
      const prevSignupTabId = prevState.tabRegistry?.['signup-page']?.tabId;
      if (prevSignupTabId) {
        await chrome.tabs.remove(prevSignupTabId).catch(() => {});
      }

      await resetState();
      await setState(keepSettings);
      chrome.runtime.sendMessage({ type: 'AUTO_RUN_RESET' }).catch(() => { });
      await sleepWithStop(500);
    } else {
      await setState({
        autoRunSkipFailures,
        ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun: attemptRuns }),
      });
    }

    if (forceFreshTabsNextRun) {
      await addLog(`兜底模式：上一轮已放弃，当前开始第 ${attemptRuns} 次尝试，将使用新线程继续补足第 ${targetRun}/${totalRuns} 轮。`, 'warn');
      forceFreshTabsNextRun = false;
    }

    try {
      throwIfStopped();
      await broadcastAutoRunStatus('running', {
        currentRun: targetRun,
        totalRuns,
        attemptRun: attemptRuns,
      });

      await runAutoSequenceFromStep(startStep, {
        targetRun,
        totalRuns,
        attemptRuns,
        continued: useExistingProgress,
      });

      successfulRuns += 1;
      autoRunCurrentRun = successfulRuns;
      await addLog(`=== 目标 ${successfulRuns}/${totalRuns} 轮已完成（第 ${attemptRuns} 次尝试成功）===`, 'ok');
      const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
        (await getState()).autoRunFallbackThreadIntervalMinutes
      );
      if (autoRunSkipFailures && totalRuns > 1 && successfulRuns < totalRuns && fallbackThreadIntervalMinutes > 0) {
        await addLog(
          `兜底模式：第 ${successfulRuns}/${totalRuns} 轮已完成，等待 ${fallbackThreadIntervalMinutes} 分钟后再启动下一轮新线程。`,
          'info'
        );
        await sleepWithStop(fallbackThreadIntervalMinutes * 60 * 1000);
      }
      continue;
    } catch (err) {
      if (isStopError(err)) {
        await addLog(`目标 ${targetRun}/${totalRuns} 轮已被用户停止`, 'warn');
        await broadcastAutoRunStatus('stopped', {
          currentRun: targetRun,
          totalRuns,
          attemptRun: attemptRuns,
        });
        break;
      }

      if (isRestartCurrentAttemptError(err)) {
        await addLog(`目标 ${targetRun}/${totalRuns} 轮检测到当前邮箱已存在，当前线程已放弃，将重新开始新一轮。`, 'warn');
        cancelPendingCommands('当前线程因邮箱已存在而放弃。');
        await broadcastStopToContentScripts();
        await broadcastAutoRunStatus('retrying', {
          currentRun: targetRun,
          totalRuns,
          attemptRun: attemptRuns,
        });
        forceFreshTabsNextRun = true;
        maxAttempts = Math.max(maxAttempts, Math.min(forcedRetryCap, attemptRuns + 1));
        continue;
      }

      if (!autoRunSkipFailures) {
        await addLog(`目标 ${targetRun}/${totalRuns} 轮失败：${err.message}`, 'error');
        await broadcastAutoRunStatus('stopped', {
          currentRun: targetRun,
          totalRuns,
          attemptRun: attemptRuns,
        });
        break;
      }

      await addLog(`目标 ${targetRun}/${totalRuns} 轮的第 ${attemptRuns} 次尝试失败：${err.message}`, 'error');
      await addLog('兜底开关已开启：将放弃当前线程，重新开一轮继续补足目标次数。', 'warn');
      cancelPendingCommands('当前尝试已放弃。');
      await broadcastStopToContentScripts();
      await broadcastAutoRunStatus('retrying', {
        currentRun: targetRun,
        totalRuns,
        attemptRun: attemptRuns,
      });
      forceFreshTabsNextRun = true;
    }
  }

  if (!stopRequested && autoRunSkipFailures && successfulRuns < totalRuns && attemptRuns >= maxAttempts) {
    await addLog(`已达到安全重试上限（${attemptRuns} 次尝试），当前仅完成 ${successfulRuns}/${totalRuns} 轮。`, 'error');
    await broadcastAutoRunStatus('stopped', {
      currentRun: successfulRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: attemptRuns,
    });
  } else if (stopRequested) {
    await addLog(`=== 已停止，完成 ${successfulRuns}/${autoRunTotalRuns} 轮，共尝试 ${attemptRuns} 次 ===`, 'warn');
    await broadcastAutoRunStatus('stopped', {
      currentRun: successfulRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: attemptRuns,
    });
  } else if (successfulRuns >= autoRunTotalRuns) {
    await addLog(`=== 全部 ${autoRunTotalRuns} 轮均已成功完成，共尝试 ${attemptRuns} 次 ===`, 'ok');
    await broadcastAutoRunStatus('complete', {
      currentRun: successfulRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: attemptRuns,
    });
  } else {
    await addLog(`=== 已停止，完成 ${successfulRuns}/${autoRunTotalRuns} 轮，共尝试 ${attemptRuns} 次 ===`, 'warn');
    await broadcastAutoRunStatus('stopped', {
      currentRun: successfulRuns,
      totalRuns: autoRunTotalRuns,
      attemptRun: attemptRuns,
    });
  }
  autoRunActive = false;
  autoRunAttemptRun = attemptRuns;
  await setState(getAutoRunStatusPayload(stopRequested ? 'stopped' : (successfulRuns >= autoRunTotalRuns ? 'complete' : 'stopped'), {
    currentRun: successfulRuns,
    totalRuns: autoRunTotalRuns,
    attemptRun: attemptRuns,
  }));
  clearStopRequest();
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

async function legacyResumeAutoRun() {
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
  const successfulRuns = Math.max(0, currentRun - 1);

  await addLog('检测到自动流程暂停上下文已丢失，正在从当前进度恢复自动运行...', 'warn');
  autoRunLoop(totalRuns, {
    autoRunSkipFailures: Boolean(state.autoRunSkipFailures),
    mode: 'continue',
    resumeCurrentRun: currentRun,
    resumeSuccessfulRuns: successfulRuns,
    resumeAttemptRunsProcessed: Math.max(0, attemptRun - 1),
  });
  return true;
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

async function sleepWithAutoRunCountdown(waitMs, payload = {}) {
  if (!Number.isFinite(waitMs) || waitMs <= 0) {
    return;
  }

  autoRunCountdownSkipRequested = false;
  const countdownPayload = {
    ...payload,
    countdownAt: Date.now() + waitMs,
  };
  await broadcastAutoRunStatus('waiting_interval', countdownPayload);

  const start = Date.now();
  try {
    while (Date.now() - start < waitMs) {
      throwIfStopped();
      if (autoRunCountdownSkipRequested) {
        autoRunCountdownSkipRequested = false;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, waitMs - (Date.now() - start))));
    }
  } finally {
    if (!stopRequested) {
      await broadcastAutoRunStatus('waiting_interval', {
        ...payload,
        countdownAt: null,
        countdownTitle: '',
        countdownNote: '',
      });
    }
  }
}

async function skipAutoRunCountdown() {
  const state = await getState();
  if (!autoRunActive || state.autoRunPhase !== 'waiting_interval') {
    return false;
  }

  autoRunCountdownSkipRequested = true;
  await addLog('已手动跳过当前倒计时，自动流程将立即继续。', 'info');
  await broadcastAutoRunStatus('waiting_interval', {
    currentRun: state.autoRunCurrentRun,
    totalRuns: state.autoRunTotalRuns,
    attemptRun: state.autoRunAttemptRun,
    countdownAt: null,
    countdownTitle: '',
    countdownNote: '',
  });
  return true;
}

async function waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary) {
  if (totalRuns <= 1 || targetRun >= totalRuns) {
    return;
  }

  const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
    (await getState()).autoRunFallbackThreadIntervalMinutes
  );
  if (fallbackThreadIntervalMinutes <= 0) {
    return;
  }

  const statusLabel = roundSummary?.status === 'failed' ? '失败' : '完成';
  await addLog(
    `线程间隔：第 ${targetRun}/${totalRuns} 轮已${statusLabel}，等待 ${fallbackThreadIntervalMinutes} 分钟后开始下一轮。`,
    'info'
  );
  await sleepWithAutoRunCountdown(fallbackThreadIntervalMinutes * 60 * 1000, {
    currentRun: targetRun,
    totalRuns,
    attemptRun: autoRunAttemptRun,
    countdownTitle: '线程间隔中',
    countdownNote: `第 ${Math.min(targetRun + 1, totalRuns)}/${totalRuns} 轮即将开始`,
  });
}

async function waitBeforeAutoRunRetry(targetRun, totalRuns, nextAttemptRun) {
  const fallbackThreadIntervalMinutes = normalizeAutoRunFallbackThreadIntervalMinutes(
    (await getState()).autoRunFallbackThreadIntervalMinutes
  );
  if (fallbackThreadIntervalMinutes <= 0) {
    return;
  }

  await addLog(
    `线程间隔：等待 ${fallbackThreadIntervalMinutes} 分钟后开始第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试。`,
    'info'
  );
  await sleepWithAutoRunCountdown(fallbackThreadIntervalMinutes * 60 * 1000, {
    currentRun: targetRun,
    totalRuns,
    attemptRun: nextAttemptRun,
    countdownTitle: '线程间隔中',
    countdownNote: `第 ${targetRun}/${totalRuns} 轮第 ${nextAttemptRun} 次尝试即将开始`,
  });
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

  await setState({
    autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
    ...getAutoRunStatusPayload(initialPhase, {
      currentRun: continueCurrentOnFirstAttempt ? resumeCurrentRun : 0,
      totalRuns,
      attemptRun: continueCurrentOnFirstAttempt ? resumeAttemptRun : 0,
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
      let startStep = AUTO_RUN_STEP_SEQUENCE[0];
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
        const resumeStep = getFirstUnfinishedAutoRunStep(currentState.stepStatuses);
        if (resumeStep && hasSavedProgress(currentState.stepStatuses)) {
          startStep = resumeStep;
          useExistingProgress = true;
        } else if (hasSavedProgress(currentState.stepStatuses)) {
          await addLog('检测到当前流程已处理完成，本轮将改为从步骤 2 重新开始。', 'info');
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
          icloudHostPreference: prevState.icloudHostPreference,
          emailPrefix: prevState.emailPrefix,
          preferredIcloudHost: prevState.preferredIcloudHost,
          inbucketHost: prevState.inbucketHost,
          inbucketMailbox: prevState.inbucketMailbox,
          moemailApiBaseUrl: prevState.moemailApiBaseUrl,
          moemailApiKey: prevState.moemailApiKey,
          moemailDomain: prevState.moemailDomain,
          cloudflareDomain: prevState.cloudflareDomain,
          cloudflareDomains: prevState.cloudflareDomains,
          autoRunRoundSummaries: serializeAutoRunRoundSummaries(totalRuns, roundSummaries),
          runTabGroupId: null,
          runTabGroupWindowId: null,
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
            await waitBeforeAutoRunRetry(targetRun, totalRuns, attemptRun + 1);
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

    if (stoppedEarly) {
      break;
    }

    try {
      await waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary);
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
// Step 1: Get OAuth Link
// ============================================================

async function executeStep1(state) {
  if (getPanelMode(state) === 'sub2api') {
    return executeSub2ApiStep1(state);
  }
  return executeCpaStep1(state);
}

async function executeCpaStep1(state) {
  if (!state.vpsUrl) {
    throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
  }
  await addLog('步骤 1：正在打开 CPA 面板...');

  const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];

  await closeConflictingTabsForSource('vps-panel', state.vpsUrl);

  const tab = await chrome.tabs.create({ url: state.vpsUrl, active: false });
  const tabId = tab.id;
  await ensureRunTabGroupForTab(tabId);
  await rememberSourceLastUrl('vps-panel', state.vpsUrl);

  await addLog('步骤 1：CPA 面板已打开，正在等待页面进入目标地址...');
  const matchedTab = await waitForTabUrlFamily('vps-panel', tabId, state.vpsUrl, {
    timeoutMs: 15000,
    retryDelayMs: 400,
  });
  if (!matchedTab) {
    await addLog('步骤 1：CPA 页面尚未完全进入目标地址，继续尝试连接内容脚本...', 'warn');
  }

  await ensureContentScriptReadyOnTab('vps-panel', tabId, {
    inject: injectFiles,
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: '步骤 1：CPA 面板仍在加载，正在重试连接内容脚本...',
  });

  const result = await sendToContentScriptResilient('vps-panel', {
    type: 'EXECUTE_STEP',
    step: 1,
    source: 'background',
    payload: { vpsPassword: state.vpsPassword },
  }, {
    timeoutMs: 30000,
    retryDelayMs: 700,
    logMessage: '步骤 1：CPA 面板通信未就绪，正在等待页面恢复...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }
}

async function executeSub2ApiStep1(state) {
  if (!state.sub2apiEmail) {
    throw new Error('尚未配置 SUB2API 登录邮箱，请先在侧边栏填写。');
  }
  if (!state.sub2apiPassword) {
    throw new Error('尚未配置 SUB2API 登录密码，请先在侧边栏填写。');
  }
  await addLog('步骤 1：正在通过 SUB2API API 生成 OpenAI Auth 链接...');
  const result = await requestSub2ApiOpenAiAuthSession(state);
  await addLog(`步骤 1：已登录 SUB2API，使用分组 ${result.groupSummary}。`, 'info');
  await addLog(`步骤 1：正在向 SUB2API 生成 OpenAI Auth 链接，回调地址为 ${result.redirectUri}。`, 'info');
  await addLog(`步骤 1：已获取 SUB2API OAuth 链接：${result.oauthUrl.slice(0, 96)}...`, 'ok');
  await completeStepFromBackground(1, {
    oauthUrl: result.oauthUrl,
    sub2apiSessionId: result.sub2apiSessionId,
    sub2apiOAuthState: result.sub2apiOAuthState,
    sub2apiGroupIds: result.sub2apiGroupIds,
    sub2apiDraftName: result.sub2apiDraftName,
  });
}

// ============================================================
// Step 2: Open Standalone Signup Page (Background opens signup entry, signup-page.js adapts)
// ============================================================

async function executeStep2(state) {
  let lastAlternateEntryReason = '';
  // 本轮 step 2 是否是被「密码页恢复失败 / 验证码超时」触发的重启驱动的。
  // 只读一次——后续备选入口在同一次 executeStep2 调用里都沿用这个语义。
  const forceFreshSignup = await consumeStep2ForceFreshSignup();
  const skipDirectCreateAccount = await consumeStep2SkipDirectCreateAccount();
  if (forceFreshSignup) {
    await addLog('步骤 2：本次运行是重启后的新起点，将跳过「已在注册流程」短路判定。', 'info');
  }
  if (skipDirectCreateAccount) {
    await addLog('步骤 2：检测到上一轮在 direct create-account 入口触发 invalid_state，本轮将跳过 direct create-account 备用地址。', 'warn');
  }

  const signupCandidates = skipDirectCreateAccount
    ? STANDALONE_SIGNUP_URL_CANDIDATES.filter((url) => !/\/create-account(?:[/?#]|$)/i.test(String(url || '')))
    : STANDALONE_SIGNUP_URL_CANDIDATES;

  // cookie 清理后，auth.openai.com 备用地址因缺少 chatgpt.com 建立的 OAuth state 通常也会失败。
  // chatgpt.com 失败时优先重新开启步骤 2（回到 chatgpt.com 重试），
  // 而不是立刻滑落到注定失败的备用入口序列。
  const CHATGPT_RESTART_MAX = 2; // 最多额外重新开启 2 次（共 3 次尝试）
  const CHATGPT_RESTART_DELAY_MS = 15000;
  let chatgptRestartCount = 0;

  for (let index = 0; index < signupCandidates.length; index += 1) {
    const signupUrl = signupCandidates[index];
    const isChatGptUrl = /chatgpt\.com/i.test(String(signupUrl || ''));
    await addLog(
      `步骤 2：正在打开独立注册入口（${index + 1}/${signupCandidates.length}）：${signupUrl}`,
      'info'
    );
    await reuseOrCreateTab('signup-page', signupUrl);

    let recoveryAttempt = 0;
    while (true) {
      try {
        const result = await sendToContentScript('signup-page', {
          type: 'EXECUTE_STEP',
          step: 2,
          source: 'background',
          payload: {
            forceFreshSignup: recoveryAttempt === 0 ? forceFreshSignup : false,
            navigationRecovery: recoveryAttempt > 0,
          },
        }, {
          responseTimeoutMs: STEP2_EXECUTE_RESPONSE_TIMEOUT_MS,
        });

        if (!result?.needsAlternateSignupEntry) {
          return;
        }

        lastAlternateEntryReason = String(result.reason || '').trim();
        await addLog(
          `步骤 2：当前入口未直接进入注册流程，准备尝试下一个独立注册地址${lastAlternateEntryReason ? `（${lastAlternateEntryReason}）` : ''}。`,
          'warn'
        );
        break;
      } catch (error) {
        if (
          isRetryableContentScriptTransportError(error)
          && recoveryAttempt < STEP2_NAVIGATION_RECOVERY_MAX_ATTEMPTS
        ) {
          recoveryAttempt += 1;
          await addLog(
            `步骤 2：检测到注册入口点击后页面发生跳转，正在等待新页面恢复并继续执行（${recoveryAttempt}/${STEP2_NAVIGATION_RECOVERY_MAX_ATTEMPTS}）。`,
            'info'
          );
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        throw error;
      }
    }

    // chatgpt.com 失败 + 重启场景（forceFreshSignup）：auth.openai.com 备用地址因缺少
    // chatgpt.com 建立的 OAuth state 通常也会失败，因此优先重新开启步骤 2（等待后回到
    // chatgpt.com 重试），而非立刻滑落到注定失败的备用入口序列。
    // forceFreshSignup=false 时（正常轮次），auth.openai.com 可能有上一轮的 OAuth state，
    // 保持原有"顺序尝试备选地址"逻辑不变。
    if (isChatGptUrl && forceFreshSignup && chatgptRestartCount < CHATGPT_RESTART_MAX) {
      chatgptRestartCount += 1;
      await addLog(
        `步骤 2：chatgpt.com 未响应，重新开启步骤 2（第 ${chatgptRestartCount}/${CHATGPT_RESTART_MAX} 次），等待 ${CHATGPT_RESTART_DELAY_MS / 1000}s 后重试...`,
        'warn'
      );
      await new Promise((resolve) => setTimeout(resolve, CHATGPT_RESTART_DELAY_MS));
      index -= 1; // 抵消 for 循环的 index += 1，下次迭代重新从 chatgpt.com 开始
    }
  }

  throw new Error(`步骤 2：所有独立注册入口均未进入注册流程。${lastAlternateEntryReason || '请检查页面是否出现新的注册 DOM 形态。'}`);
}

// ============================================================
// Step 3: Fill Email & Password (via signup-page.js)
// ============================================================

async function executeStep3(state) {
  let resolvedEmail = state.email;
  if (isMoemailProvider(state) && !resolvedEmail) {
    resolvedEmail = await fetchMoemailGeneratedEmail(state, { generateNew: true });
  } else if (isGeneratedAliasProvider(state.mailProvider)) {
    resolvedEmail = buildGeneratedAliasEmail(state);
  }

  if (!resolvedEmail) {
    throw new Error('缺少邮箱地址，请先在侧边栏粘贴邮箱。');
  }

  const password = state.customPassword || generatePassword();
  if (resolvedEmail !== state.email) {
    await setEmailState(resolvedEmail);
  }
  await setPasswordState(password);

  await addLog(
    `步骤 3：正在填写邮箱 ${resolvedEmail}，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
  );
  const step3Message = {
    type: 'EXECUTE_STEP',
    step: 3,
    source: 'background',
    payload: { email: resolvedEmail, password },
  };
  const step3Result = await sendToContentScript('signup-page', step3Message);

  if (step3Result?.emailStageSubmitted) {
    await addLog('步骤 3：邮箱阶段已准备完成，等待密码页内容脚本就绪后继续填写密码...', 'info');
    return;
  }

  if (step3Result?.error) {
    throw new Error(step3Result.error);
  }
}

// ============================================================
// Step 4: Get Signup Verification Code (qq-mail.js polls, then fills in signup-page.js)
// ============================================================

function getMailConfig(state) {
  const provider = state.mailProvider || 'qq';
  if (provider === 'custom') {
    return { provider: 'custom', label: '自定义邮箱' };
  }
  if (provider === MOEMAIL_PROVIDER) {
    return { provider: MOEMAIL_PROVIDER, label: 'MoeMail' };
  }
  if (provider === MAILPIT_PROVIDER) {
    return { provider: MAILPIT_PROVIDER, label: 'Mailpit' };
  }
  if (provider === '163') {
    return { source: 'mail-163', url: 'https://mail.163.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D', label: '163 邮箱' };
  }
  if (provider === '163-vip') {
    return { source: 'mail-163', url: 'https://webmail.vip.163.com/js6/main.jsp?df=mail163_letter#module=mbox.ListModule%7C%7B%22fid%22%3A1%2C%22order%22%3A%22date%22%2C%22desc%22%3Atrue%7D', label: '163 VIP 邮箱' };
  }
  if (provider === 'gmail') {
    return { source: 'gmail-mail', url: 'https://mail.google.com/mail/u/0/#inbox', label: 'Gmail' };
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
      activateOnOpen: true,
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
  // flowStartTime 用于在 gmail-mail.js 内容脚本里区分"这次注册轮"与"上次轮"，
  // 让 seenCodes 每轮独立（避免同一 6 位码跨轮误判为"已见过"而被跳过）。
  const flowStartTime = Number(state?.flowStartTime) || 0;

  if (step === 4) {
    return {
      filterAfterTimestamp: getVerificationRequestTimestamp(4, state),
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm'],
      // step 4 按产品需求放开主题级 reject——所有 OpenAI 类 OTP 邮件（含
      // 「你的临时 ChatGPT 登录代码」等登录 OTP）都允许进入识别链路。
      // 风险自负：若目标账号已存在，OpenAI 只会发登录 OTP，而注册表单并不接受
      // 此码 → 上游应在 signup-page 的 invalid code 分支检测账号冲突并抛错。
      rejectSubjectPatterns: [],
      targetEmail: state.email,
      flowStartTime,
      maxAttempts: 8,
      intervalMs: 1500,
      ...overrides,
    };
  }

  return {
    filterAfterTimestamp: getVerificationRequestTimestamp(7, state),
    senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
    subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'login'],
    // step 7 是"登录" OTP。对称拒绝"注册"类邮件——避免把上一轮残留的注册验证码
    // 当成本轮登录码提交。
    rejectSubjectPatterns: [
      '注册(?:代码|验证|码)',
      'sign\\s*up(?:\\s+code)?',
      'create\\s+account',
    ],
    targetEmail: state.email,
    flowStartTime,
    maxAttempts: 8,
    intervalMs: 1500,
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
  throwIfStopped();
  await addLog(`步骤 ${step}：正在请求新的${getVerificationCodeLabel(step)}验证码...`, 'warn');
  throwIfStopped();

  const result = await sendToContentScript('signup-page', {
    type: 'GET_RESEND_VERIFICATION_TARGET',
    step,
    source: 'background',
    payload: {},
  });

  if (step === 7) {
    const restartError = getStep7RestartFromStep6Error(result);
    if (restartError) {
      throw restartError;
    }
  }

  if (result && result.error) {
    throw new Error(result.error);
  }

  await clickWithDebugger(signupTabId, result?.rect, {
    actionLabel: `步骤 ${step} 的重新发送验证码点击`,
  });
  await addLog(`步骤 ${step}：已通过调试器真实点击重新发送验证码按钮${result?.buttonText ? `（${result.buttonText}）` : ''}。`, 'info');
  await sleepWithStop(1200);

  const currentState = await getState();
  if (currentState.mailProvider === '2925') {
    const mailTabId = await getTabId('mail-2925');
    if (mailTabId) {
      await chrome.tabs.update(mailTabId, { active: true }).catch(() => {});
      await addLog(`步骤 ${step}：已保留 2925 邮箱标签页等待新邮件。`, 'info');
    }
  }

  return Date.now();
}

async function pollFreshVerificationCode(step, state, mail, pollOverrides = {}) {
  const stateKey = getVerificationCodeStateKey(step);
  const rejectedCodes = new Set();
  if (state[stateKey]) {
    rejectedCodes.add(state[stateKey]);
  }
  for (const code of (pollOverrides.excludeCodes || [])) {
    if (code) rejectedCodes.add(code);
  }

  if (mail.provider === MOEMAIL_PROVIDER) {
    let lastError = null;
    const filterAfterTimestamp = pollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
    const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

    for (let round = 1; round <= maxRounds; round += 1) {
      throwIfStopped();
      if (round > 1) {
        await requestVerificationCodeResend(step);
      }

      try {
        const result = await pollMoemailVerificationCode(step, state, {
          ...getVerificationPollPayload(step, state),
          ...pollOverrides,
          filterAfterTimestamp,
          excludeCodes: [...rejectedCodes],
        });

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

  if (mail.provider === MAILPIT_PROVIDER) {
    let lastError = null;
    const filterAfterTimestamp = pollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
    const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

    for (let round = 1; round <= maxRounds; round += 1) {
      throwIfStopped();
      if (round > 1) {
        await requestVerificationCodeResend(step);
      }

      try {
        const result = await pollMailpitVerificationCode(step, state, {
          ...getVerificationPollPayload(step, state),
          ...pollOverrides,
          filterAfterTimestamp,
          excludeCodes: [...rejectedCodes],
        });

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

  let lastError = null;
  const filterAfterTimestamp = pollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
  const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

  for (let round = 1; round <= maxRounds; round++) {
    throwIfStopped();
    if (round > 1) {
      await requestVerificationCodeResend(step);
    }

    const payload = getVerificationPollPayload(step, state, {
      ...pollOverrides,
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

async function submitVerificationCode(step, code) {
  const signupTabId = await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('认证页面标签页已关闭，无法填写验证码。');
  }

  const result = await sendToContentScript('signup-page', {
    type: 'FILL_CODE',
    step,
    source: 'background',
    payload: { code },
  });

  if (step === 7) {
    const restartError = getStep7RestartFromStep6Error(result);
    if (restartError) {
      throw restartError;
    }
  }

  if (result && result.error) {
    throw new Error(result.error);
  }

  return result || {};
}

async function resolveVerificationStep(step, state, mail, options = {}) {
  const stateKey = getVerificationCodeStateKey(step);
  const rejectedCodes = new Set();
  if (state[stateKey]) {
    rejectedCodes.add(state[stateKey]);
  }

  const nextFilterAfterTimestamp = options.filterAfterTimestamp ?? null;
  const requestFreshCodeFirst = options.requestFreshCodeFirst !== undefined
    ? Boolean(options.requestFreshCodeFirst)
    : false;
  const maxSubmitAttempts = 3;

  if (requestFreshCodeFirst) {
    try {
      await requestVerificationCodeResend(step);
      await addLog(`步骤 ${step}：已先请求一封新的${getVerificationCodeLabel(step)}验证码，再开始轮询邮箱。`, 'warn');
    } catch (err) {
      if (isStopError(err) || (step === 7 && isStep7RestartFromStep6Error(err))) {
        throw err;
      }
      await addLog(`步骤 ${step}：首次重新获取验证码失败：${err.message}，将继续使用当前时间窗口轮询。`, 'warn');
    }
  }

  for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
    const result = await pollFreshVerificationCode(step, state, mail, {
      excludeCodes: [...rejectedCodes],
      filterAfterTimestamp: nextFilterAfterTimestamp ?? undefined,
      // 透传上层 options.maxRounds（如 executeStep4 给 gmail-mail 设的 2），
      // 否则 pollFreshVerificationCode 会回落到全局 VERIFICATION_POLL_MAX_ROUNDS=5，
      // 导致 step 4 等不到验证码时硬等 5×15s ≈ 75s 才放弃重启。
      maxRounds: options.maxRounds,
    });

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

      await requestVerificationCodeResend(step);
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

  throwIfStopped();
  await addLog('步骤 4：正在确认注册验证码页面是否就绪，必要时自动恢复密码页超时报错...');
  let prepareResult;
  try {
    prepareResult = await sendToContentScriptResilient(
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
  } catch (err) {
    // 页面从密码页成功跳转到 /email-verification 时 content script 被销毁，
    // 产生 transport error — 但跳转本身说明密码提交成功了。
    // 复用 step 3 已有的 hasSignupTabProgressedPastPassword() 检测。
    if (isRetryableContentScriptTransportError(err)) {
      const progressed = await hasSignupTabProgressedPastPassword();
      if (progressed) {
        await addLog('步骤 4：密码提交后页面已跳转到验证码阶段，视为就绪（恢复 transport error）。', 'warn');
        prepareResult = { ready: true };
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  if (prepareResult && prepareResult.error) {
    throw new Error(prepareResult.error);
  }
  if (prepareResult?.verificationRequestedAt) {
    await setState({ loginVerificationRequestedAt: prepareResult.verificationRequestedAt });
  }
  if (prepareResult?.phoneRequired) {
    throw new Error('当前注册流程已进入手机号页面，自动流程不再等待注册验证码。请先手动处理手机号，或在侧边栏手动跳过步骤 4 / 5。');
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
  if (!mail.source) {
    await addLog(`步骤 4：正在通过 ${mail.label} 轮询验证码...`);
  } else {
    await addLog(`步骤 4：正在打开${mail.label}...`);

    // For mail tabs, only create if not alive — don't navigate (preserves login session)
    const alive = await isTabAlive(mail.source);
    if (alive) {
      if (mail.navigateOnReuse) {
        await reuseOrCreateTab(mail.source, mail.url, {
          activate: Boolean(mail.activateOnOpen),
          inject: mail.inject,
          injectSource: mail.injectSource,
        });
      } else {
        const tabId = await getTabId(mail.source);
        await ensureRunTabGroupForTab(tabId);
        if (mail.activateOnOpen) {
          await chrome.tabs.update(tabId, { active: true }).catch(() => {});
        }
      }
    } else {
      await reuseOrCreateTab(mail.source, mail.url, {
        activate: Boolean(mail.activateOnOpen),
        inject: mail.inject,
        injectSource: mail.injectSource,
      });
    }
  }

  try {
    await resolveVerificationStep(4, state, mail, {
      filterAfterTimestamp: mail.source ? stepStartedAt : undefined,
      requestFreshCodeFirst: false,
      maxRounds: mail.source === 'gmail-mail' ? 2 : undefined,
    });
  } catch (err) {
    if (!isStopError(err) && isVerificationMailPollingError(err)) {
      throw createStep4RestartFromStep2Error({ cause: err });
    }
    throw err;
  }
  return;
}

// ============================================================
// Step 5: Fill Name & Birthday (via signup-page.js)
// ============================================================

async function executeStep5(state) {
  const { firstName, lastName } = generateRandomName();
  const { year, month, day } = generateRandomBirthday();

  await addLog(`步骤 5：已生成姓名 ${firstName} ${lastName}，生日 ${year}-${month}-${day}`);

  await sendToContentScript('signup-page', {
    type: 'EXECUTE_STEP',
    step: 5,
    source: 'background',
    payload: { firstName, lastName, year, month, day },
  });
}

// ============================================================
// Step 6: Login ChatGPT (Background opens tab, chatgpt.js handles login)
// ============================================================

async function refreshOAuthUrlBeforeStep6(state) {
  await addLog(`步骤 6：正在刷新登录用的 ${getPanelModeLabel(state)} OAuth 链接...`);
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] preparing fresh OAuth via step 1');
  const waitForFreshOAuth = waitForStepComplete(1, 120000);
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] executing step 1 for fresh OAuth');
  await executeStep1(state);
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] step 1 execute returned, waiting for completion signal');
  await waitForFreshOAuth;
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] step 1 completion signal received');

  const latestState = await getState();
  if (!latestState.oauthUrl) {
    throw new Error('刷新 OAuth 链接后仍未拿到可用链接。');
  }

  return latestState.oauthUrl;
}

async function executeStep6(state) {
  if (!state.email) {
    throw new Error('缺少邮箱地址，请先完成步骤 3。');
  }

  const oauthUrl = await refreshOAuthUrlBeforeStep6(state);

  await addLog('步骤 6：正在打开最新 OAuth 链接并登录...');
  // Reuse the signup-page tab — navigate it to the OAuth URL
  await reuseOrCreateTab('signup-page', oauthUrl);

  // signup-page.js will inject (same auth.openai.com domain) and handle login
  await sendToContentScript('signup-page', {
    type: 'EXECUTE_STEP',
    step: 6,
    source: 'background',
    payload: { email: state.email, password: state.password },
  });
}

// ============================================================
// Step 7: Get Login Verification Code (qq-mail.js polls, then fills in chatgpt.js)
// ============================================================

async function runStep7Attempt(state) {
  const mail = getMailConfig(state);
  if (mail.error) throw new Error(mail.error);
  const stepStartedAt = Date.now();
  const authTabId = await getTabId('signup-page');

  if (authTabId) {
    await ensureRunTabGroupForTab(authTabId);
  } else {
    if (!state.oauthUrl) {
      throw new Error('缺少 OAuth 链接，请先完成步骤 1。');
    }
    await reuseOrCreateTab('signup-page', state.oauthUrl);
  }

  throwIfStopped();
  await addLog('步骤 7：正在准备认证页，必要时切换到一次性验证码登录...');
  const prepareResult = await sendToContentScript('signup-page', {
    type: 'PREPARE_LOGIN_CODE',
    step: 7,
    source: 'background',
    payload: {},
  });

  const restartError = getStep7RestartFromStep6Error(prepareResult);
  if (restartError) {
    throw restartError;
  }

  if (prepareResult && prepareResult.error) {
    throw new Error(prepareResult.error);
  }

  if (shouldUseCustomRegistrationEmail(state)) {
    await confirmCustomVerificationStepBypass(7);
    return;
  }

  throwIfStopped();
  if (!mail.source) {
    await addLog(`步骤 7：正在通过 ${mail.label} 轮询验证码...`);
  } else {
    await addLog(`步骤 7：正在打开${mail.label}...`);

  const alive = await isTabAlive(mail.source);
  if (alive) {
    if (mail.navigateOnReuse) {
      await reuseOrCreateTab(mail.source, mail.url, {
        activate: Boolean(mail.activateOnOpen),
        inject: mail.inject,
        injectSource: mail.injectSource,
      });
    } else {
      const tabId = await getTabId(mail.source);
      await ensureRunTabGroupForTab(tabId);
      if (mail.activateOnOpen) {
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});
      }
    }
  } else {
    await reuseOrCreateTab(mail.source, mail.url, {
      activate: Boolean(mail.activateOnOpen),
      inject: mail.inject,
      injectSource: mail.injectSource,
    });
  }
  }

  await resolveVerificationStep(7, state, mail, {
    filterAfterTimestamp: mail.source ? stepStartedAt : undefined,
    requestFreshCodeFirst: Boolean(mail.source),
  });
}

async function rerunStep6ForStep7Recovery() {
  const currentState = await getState();
  const waitForStep6 = waitForStepComplete(6, 120000);
  await addLog('步骤 7：正在回到步骤 6，重新发起登录验证码流程...', 'warn');
  await executeStep6(currentState);
  await waitForStep6;
  await sleepWithStop(3000);
}

async function executeStep7(state) {
  let currentState = state;
  let mailPollingAttempt = 1;
  let lastMailPollingError = null;

  while (true) {
    try {
      await runStep7Attempt(currentState);
      return;
    } catch (err) {
      if (isStep7RestartFromStep6Error(err)) {
        await addLog('步骤 7：检测到登录页超时报错，准备从步骤 6 重新开始...', 'warn');
        await rerunStep6ForStep7Recovery();
        currentState = await getState();
        continue;
      }

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
const STEP8_SIGNUP_PAGE_INJECT_FILES = ['content/utils.js', 'content/signup-page.js'];
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
    inject: STEP8_SIGNUP_PAGE_INJECT_FILES,
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
    throw new Error('缺少 OAuth 链接，请先完成步骤 1。');
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
          await ensureRunTabGroupForTab(signupTabId);
          await addLog('步骤 8：已定位到认证页，正在准备自动授权...');
        } else {
          signupTabId = await reuseOrCreateTab('signup-page', state.oauthUrl);
          await addLog('步骤 8：已重新打开认证页，正在准备自动授权...');
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
    await ensureRunTabGroupForTab(tabId);
    await closeConflictingTabsForSource('vps-panel', state.vpsUrl, { excludeTabIds: [tabId] });
    await rememberSourceLastUrl('vps-panel', state.vpsUrl);
  }

  await ensureContentScriptReadyOnTab('vps-panel', tabId, {
    inject: injectFiles,
    timeoutMs: 45000,
    retryDelayMs: 900,
    logMessage: '步骤 9：CPA 面板仍在加载，正在重试连接内容脚本...',
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
  await addLog('步骤 9：正在通过 SUB2API API 交换授权码并创建账号...');
  await addLog('步骤 9：正在向 SUB2API 交换 OpenAI 授权码...', 'info');
  const result = await submitSub2ApiOpenAiCallback(state);
  await addLog(`步骤 9：${result.verifiedStatus}（分组：${result.groupSummary || 'unknown'}）`, 'ok');
  await completeStepFromBackground(9, {
    localhostUrl: result.localhostUrl,
    verifiedStatus: result.verifiedStatus,
  });
}

// ============================================================
// Step 10: 退出当前 ChatGPT 登录态
// ============================================================

async function executeStep10(state) {
  await addLog('步骤 10：正在打开 ChatGPT 页面并准备退出当前登录态...');

  const signupTabId = await reuseOrCreateTab('signup-page', 'https://chatgpt.com');
  await ensureRunTabGroupForTab(signupTabId);
  await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
    inject: ['content/activation-utils.js', 'content/utils.js', 'content/signup-page.js'],
    timeoutMs: 30000,
    retryDelayMs: 600,
    logMessage: '步骤 10：ChatGPT 页面内容脚本尚未就绪，正在等待页面恢复...',
  });

  const result = await sendToContentScriptResilient('signup-page', {
    type: 'EXECUTE_STEP',
    step: 10,
    source: 'background',
    payload: {},
  }, {
    timeoutMs: 30000,
    retryDelayMs: 600,
    logMessage: '步骤 10：正在等待 ChatGPT 页面退出登录入口重新就绪...',
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
  if (alarm.name !== AUTO_RUN_ALARM_NAME) {
    return;
  }
  launchScheduledAutoRun('alarm').catch((err) => {
    console.error(LOG_PREFIX, 'Failed to launch scheduled auto run from alarm:', err);
  });
});

chrome.runtime.onStartup.addListener(() => {
  restoreScheduledAutoRunIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore scheduled auto run on startup:', err);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  restoreScheduledAutoRunIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore scheduled auto run on install/update:', err);
  });
});

restoreScheduledAutoRunIfNeeded().catch((err) => {
  console.error(LOG_PREFIX, 'Failed to restore scheduled auto run:', err);
});
