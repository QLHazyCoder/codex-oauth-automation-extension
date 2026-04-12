// background.js — Service Worker: orchestration, state, tab management, message routing

importScripts('data/names.js');

const LOG_PREFIX = '[MultiPage:bg]';
const DUCK_AUTOFILL_URL = 'https://duckduckgo.com/email/settings/autofill';
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const HUMAN_STEP_DELAY_MIN = 700;
const HUMAN_STEP_DELAY_MAX = 2200;
const STEP7_RESTART_MAX_ROUNDS = 8;
const CLOUDFLARE_RULE_PROPAGATION_MIN_MS = 3000;
const CLOUDFLARE_RULE_PROPAGATION_MAX_MS = 5000;

initializeSessionStorageAccess();

// ============================================================
// 状态管理（chrome.storage.session + chrome.storage.local）
// ============================================================

const PERSISTED_SETTING_DEFAULTS = {
  vpsUrl: '', // VPS 面板地址，可手动填写。
  vpsPassword: '', // VPS 面板登录密码，可手动填写。
  customPassword: '', // 自定义账号密码；留空时由程序自动生成随机密码。
  autoRunSkipFailures: false, // 自动运行遇到失败步骤后，是否继续执行后续流程。
  verificationWaitTimeoutSec: 40, // 收验证码单轮等待秒数，超时后会自动请求新验证码继续下一轮。
  mailProvider: '163', // 验证码邮箱来源（163 / 163-vip / qq / inbucket）。
  emailGenerator: 'duck', // 注册邮箱生成方式：duck / cloudflare。
  inbucketHost: '', // 仅当 mailProvider 为 inbucket 时填写 Inbucket 地址，其他情况保持为空。
  inbucketMailbox: '', // 仅当 mailProvider 为 inbucket 时填写邮箱名，其他情况保持为空。
  cloudflareDomain: '', // 仅当 emailGenerator=cloudflare 时填写自定义域名（如 example.xyz）。
  cloudflareZoneId: '', // 仅当 emailGenerator=cloudflare 时填写 Cloudflare Zone ID。
  cloudflareForwardTo: '', // 仅当 emailGenerator=cloudflare 时填写已验证的目标邮箱。
  cloudflareApiToken: '', // 仅当 emailGenerator=cloudflare 时填写 API Token（Zone Email Routing Rules:Edit）。
};

const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const SENSITIVE_STATE_KEYS = new Set(['cloudflareApiToken']);
const CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY = 'cloudflareRuleCleanupContext';

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
  lastEmailTimestamp: null, // 最近一次获取到邮箱数据的运行时时间戳。
  lastSignupCode: null, // 注册验证码，运行时由程序自动读取并写入。
  lastLoginCode: null, // 登录验证码，运行时由程序自动读取并写入。
  localhostUrl: null, // 运行时捕获到的 localhost 回调地址，不要手动预填。
  flowStartTime: null, // 当前流程开始时间。
  tabRegistry: {}, // 程序维护的标签页注册表。
  sourceLastUrls: {}, // 各来源页面最近一次打开的地址记录。
  logs: [], // 侧边栏展示的运行日志。
  ...PERSISTED_SETTING_DEFAULTS, // 合并 chrome.storage.local 中持久化保存的用户配置。
  autoRunning: false, // 当前是否处于自动运行中。
  autoRunPhase: 'idle', // 当前自动运行阶段。
  autoRunCurrentRun: 0, // 自动运行当前执行到第几轮。
  autoRunTotalRuns: 1, // 自动运行计划总轮数。
  autoRunAttemptRun: 0, // 当前轮次的重试序号。
};

function stripSensitiveStateFields(source = {}) {
  const copy = { ...(source || {}) };
  for (const key of SENSITIVE_STATE_KEYS) {
    if (key in copy) {
      delete copy[key];
    }
  }
  return copy;
}

function isTrustedExtensionPageSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const url = String(sender.url || '');
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

async function getPersistedSettings(options = {}) {
  const includeSensitive = options.includeSensitive !== false;
  const stored = await chrome.storage.local.get(PERSISTED_SETTING_KEYS);
  const settings = {
    ...PERSISTED_SETTING_DEFAULTS,
    ...stored,
    autoRunSkipFailures: Boolean(stored.autoRunSkipFailures ?? PERSISTED_SETTING_DEFAULTS.autoRunSkipFailures),
    verificationWaitTimeoutSec: normalizeVerificationWaitTimeoutSec(
      stored.verificationWaitTimeoutSec ?? PERSISTED_SETTING_DEFAULTS.verificationWaitTimeoutSec
    ),
    emailGenerator: normalizeEmailGenerator(stored.emailGenerator ?? PERSISTED_SETTING_DEFAULTS.emailGenerator),
  };
  return includeSensitive ? settings : stripSensitiveStateFields(settings);
}

async function getState(options = {}) {
  const includeSensitive = options.includeSensitive !== false;
  const [state, persistedSettings] = await Promise.all([
    chrome.storage.session.get(null),
    getPersistedSettings({ includeSensitive }),
  ]);
  const merged = { ...DEFAULT_STATE, ...persistedSettings, ...state };
  return includeSensitive ? merged : stripSensitiveStateFields(merged);
}

async function getPublicStateForSender(sender) {
  const includeSensitive = isTrustedExtensionPageSender(sender);
  return getState({ includeSensitive });
}

async function initializeSessionStorageAccess() {
  try {
    if (chrome.storage?.session?.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      });
      console.log(LOG_PREFIX, 'Enabled storage.session for content scripts');
    }
    if (chrome.storage?.local?.setAccessLevel) {
      await chrome.storage.local.setAccessLevel({
        accessLevel: 'TRUSTED_CONTEXTS',
      });
      console.log(LOG_PREFIX, 'Restricted storage.local to trusted extension contexts');
    }
    await chrome.storage.session.remove([...SENSITIVE_STATE_KEYS]);
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to enable storage.session for content scripts:', err?.message || err);
  }
}

async function setState(updates) {
  const safeUpdates = stripSensitiveStateFields(updates || {});
  console.log(LOG_PREFIX, 'storage.set:', JSON.stringify(safeUpdates).slice(0, 200));
  if (Object.keys(safeUpdates).length > 0) {
    await chrome.storage.session.set(safeUpdates);
  }
}

async function setPersistentSettings(updates) {
  const persistedUpdates = {};
  for (const key of PERSISTED_SETTING_KEYS) {
    if (updates[key] !== undefined) {
      persistedUpdates[key] = key === 'autoRunSkipFailures'
        ? Boolean(updates[key])
        : key === 'verificationWaitTimeoutSec'
          ? normalizeVerificationWaitTimeoutSec(updates[key])
        : updates[key];
    }
  }

  if (Object.keys(persistedUpdates).length > 0) {
    await chrome.storage.local.set(persistedUpdates);
  }
}

function broadcastDataUpdate(payload) {
  chrome.runtime.sendMessage({
    type: 'DATA_UPDATED',
    payload,
  }).catch(() => { });
}

async function setEmailState(email) {
  await setState({ email });
  broadcastDataUpdate({ email });
  if (email) {
    await resumeAutoRunIfWaitingForEmail();
  }
}

async function setPasswordState(password) {
  await setState({ password });
  broadcastDataUpdate({ password });
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
    getPersistedSettings({ includeSensitive: false }),
  ]);
  await chrome.storage.session.clear();
  await chrome.storage.session.set(stripSensitiveStateFields({
    ...DEFAULT_STATE,
    ...persistedSettings,
    seenCodes: prev.seenCodes || [],
    seenInbucketMailIds: prev.seenInbucketMailIds || [],
    accounts: prev.accounts || [],
    tabRegistry: prev.tabRegistry || {},
    sourceLastUrls: prev.sourceLastUrls || {},
  }));
  await clearCloudflareRuleCleanupContext();
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
  if (parsed.hostname !== 'localhost') return false;
  if (parsed.pathname !== '/auth/callback') return false;

  const code = (parsed.searchParams.get('code') || '').trim();
  const state = (parsed.searchParams.get('state') || '').trim();
  return Boolean(code && state);
}

function buildLocalhostCleanupPrefix(rawUrl) {
  if (!isLocalhostOAuthCallbackUrl(rawUrl)) return '';

  const parsed = parseUrlSafely(rawUrl);
  return parsed ? `${parsed.origin}/auth` : '';
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
    case 'inbucket-mail':
      return Boolean(reference)
        && candidate.origin === reference.origin
        && candidate.pathname.startsWith('/m/');
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

async function closeTabsByUrlPrefix(prefix, options = {}) {
  if (!prefix) return 0;

  const { excludeTabIds = [] } = options;
  const excluded = new Set(excludeTabIds.filter(id => Number.isInteger(id)));
  const tabs = await chrome.tabs.query({});
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

  while (Date.now() - start < timeoutMs) {
    const pong = await pingContentScriptOnTab(tabId);
    if (pong?.ok && (!pong.source || pong.source === source)) {
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
    }

    const pongAfterInject = await pingContentScriptOnTab(tabId);
    if (pongAfterInject?.ok && (!pongAfterInject.source || pongAfterInject.source === source)) {
      await registerTab(source, tabId);
      return;
    }

    if (logMessage && !logged) {
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
    chrome.tabs.sendMessage(tabId, pending.message).then(pending.resolve).catch(pending.reject);
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

async function sendToContentScript(source, message) {
  const registry = await getTabRegistry();
  const entry = registry[source];

  if (!entry || !entry.ready) {
    console.log(LOG_PREFIX, `${source} not ready, queuing command`);
    return queueCommand(source, message);
  }

  // Verify tab is still alive
  const alive = await isTabAlive(source);
  if (!alive) {
    // Tab was closed — queue the command, it will be sent when tab is reopened
    console.log(LOG_PREFIX, `${source} tab was closed, queuing command`);
    return queueCommand(source, message);
  }

  console.log(LOG_PREFIX, `Sending to ${source} (tab ${entry.tabId}):`, message.type);
  return chrome.tabs.sendMessage(entry.tabId, message);
}

async function sendToContentScriptResilient(source, message, options = {}) {
  const { timeoutMs = 30000, retryDelayMs = 600, logMessage = '' } = options;
  const start = Date.now();
  let lastError = null;
  let logged = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();

    try {
      return await sendToContentScript(source, message);
    } catch (err) {
      if (!isRetryableContentScriptTransportError(err)) {
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

function getSourceLabel(source) {
  const labels = {
    'sidepanel': '侧边栏',
    'signup-page': '认证页',
    'vps-panel': 'CPA 面板',
    'qq-mail': 'QQ 邮箱',
    'mail-163': '163 邮箱',
    'inbucket-mail': 'Inbucket 邮箱',
    'duck-mail': 'Duck 邮箱',
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
  return /back\/forward cache|message channel is closed|Receiving end does not exist|port closed before a response was received|A listener indicated an asynchronous response/i.test(message);
}

function getErrorMessage(error) {
  return String(typeof error === 'string' ? error : error?.message || '');
}

function isVerificationMailPollingError(error) {
  const message = getErrorMessage(error);
  return /未在 .*邮箱中找到新的匹配邮件|邮箱轮询结束，但未获取到验证码|无法获取新的(?:注册|登录)验证码|页面未能重新就绪|页面通信异常|did not respond in \d+s/i.test(message);
}

function isRestartCurrentAttemptError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /当前邮箱已存在，需要重新开始新一轮/.test(message);
}

function isStep9OAuthTimeoutError(error) {
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
      flowStartTime: null,
      password: null,
      lastEmailTimestamp: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 2) {
    return {
      password: null,
      lastEmailTimestamp: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 3 || step === 4) {
    return {
      lastEmailTimestamp: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 5 || step === 6 || step === 7) {
    return {
      lastLoginCode: null,
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

function getAutoRunStatusPayload(phase, payload = {}) {
  const currentRun = payload.currentRun ?? autoRunCurrentRun;
  const totalRuns = payload.totalRuns ?? autoRunTotalRuns;
  const attemptRun = payload.attemptRun ?? autoRunAttemptRun;
  const autoRunning = phase === 'running' || phase === 'waiting_email' || phase === 'retrying';

  return {
    autoRunning,
    autoRunPhase: phase,
    autoRunCurrentRun: currentRun,
    autoRunTotalRuns: totalRuns,
    autoRunAttemptRun: attemptRun,
  };
}

async function broadcastAutoRunStatus(phase, payload = {}) {
  const statusPayload = {
    phase,
    currentRun: payload.currentRun ?? autoRunCurrentRun,
    totalRuns: payload.totalRuns ?? autoRunTotalRuns,
    attemptRun: payload.attemptRun ?? autoRunAttemptRun,
  };

  await setState(getAutoRunStatusPayload(phase, statusPayload));
  chrome.runtime.sendMessage({
    type: 'AUTO_RUN_STATUS',
    payload: statusPayload,
  }).catch(() => { });
}

function isAutoRunLockedState(state) {
  return Boolean(state.autoRunning) && (state.autoRunPhase === 'running' || state.autoRunPhase === 'retrying');
}

function isAutoRunPausedState(state) {
  return Boolean(state.autoRunning) && state.autoRunPhase === 'waiting_email';
}

async function ensureManualInteractionAllowed(actionLabel) {
  const state = await getState();

  if (isAutoRunLockedState(state)) {
    throw new Error(`自动流程运行中，请先停止后再${actionLabel}。`);
  }
  if (isAutoRunPausedState(state)) {
    throw new Error(`自动流程当前已暂停。请点击“继续”，或先确认接管自动流程后再${actionLabel}。`);
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
    const x = Math.round(rect.centerX);
    const y = Math.round(rect.centerY);

    await chrome.debugger.sendCommand(target, 'Page.bringToFront');
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      clickCount: 0,
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
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
      return await getPublicStateForSender(sender);
    }

    case 'RESET': {
      clearStopRequest();
      await cleanupCloudflareRoutingRule(null, {
        reason: '重置流程前清理 Cloudflare 路由',
        strict: true,
      });
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
      await executeStep(step);
      return { ok: true };
    }

    case 'AUTO_RUN': {
      clearStopRequest();
      const totalRuns = message.payload?.totalRuns || 1;
      const autoRunSkipFailures = Boolean(message.payload?.autoRunSkipFailures);
      const mode = message.payload?.mode === 'continue' ? 'continue' : 'restart';
      await setState({ autoRunSkipFailures });
      autoRunLoop(totalRuns, { autoRunSkipFailures, mode });  // fire-and-forget
      return { ok: true };
    }

    case 'RESUME_AUTO_RUN': {
      clearStopRequest();
      if (message.payload.email) {
        await setEmailState(message.payload.email);
      }
      resumeAutoRun();  // fire-and-forget
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
      const updates = {};
      if (message.payload.vpsUrl !== undefined) updates.vpsUrl = message.payload.vpsUrl;
      if (message.payload.vpsPassword !== undefined) updates.vpsPassword = message.payload.vpsPassword;
      if (message.payload.customPassword !== undefined) updates.customPassword = message.payload.customPassword;
      if (message.payload.autoRunSkipFailures !== undefined) updates.autoRunSkipFailures = Boolean(message.payload.autoRunSkipFailures);
      if (message.payload.verificationWaitTimeoutSec !== undefined) {
        updates.verificationWaitTimeoutSec = normalizeVerificationWaitTimeoutSec(message.payload.verificationWaitTimeoutSec);
      }
      if (message.payload.mailProvider !== undefined) updates.mailProvider = message.payload.mailProvider;
      if (message.payload.emailGenerator !== undefined) updates.emailGenerator = normalizeEmailGenerator(message.payload.emailGenerator);
      if (message.payload.inbucketHost !== undefined) updates.inbucketHost = message.payload.inbucketHost;
      if (message.payload.inbucketMailbox !== undefined) updates.inbucketMailbox = message.payload.inbucketMailbox;
      if (message.payload.cloudflareDomain !== undefined) updates.cloudflareDomain = normalizeCloudflareDomain(message.payload.cloudflareDomain);
      if (message.payload.cloudflareZoneId !== undefined) updates.cloudflareZoneId = String(message.payload.cloudflareZoneId || '').trim();
      if (message.payload.cloudflareForwardTo !== undefined) updates.cloudflareForwardTo = String(message.payload.cloudflareForwardTo || '').trim().toLowerCase();
      if (message.payload.cloudflareApiToken !== undefined) updates.cloudflareApiToken = String(message.payload.cloudflareApiToken || '').trim();
      await setPersistentSettings(updates);
      await setState(updates);
      return { ok: true };
    }

    // Side panel data updates
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

    // Backward compatibility with previous sidepanel versions.
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
    case 1:
      if (payload.oauthUrl) {
        await setState({ oauthUrl: payload.oauthUrl });
        broadcastDataUpdate({ oauthUrl: payload.oauthUrl });
      }
      break;
    case 3:
      if (payload.email) await setEmailState(payload.email);
      break;
    case 4:
      if (payload.emailTimestamp) await setState({ lastEmailTimestamp: payload.emailTimestamp });
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
      const localhostPrefix = buildLocalhostCleanupPrefix(payload.localhostUrl);
      if (localhostPrefix) {
        await closeTabsByUrlPrefix(localhostPrefix);
      }
      await cleanupCloudflareRoutingRule(null, { reason: '步骤 9 完成后清理本轮 Cloudflare 路由' });
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

function waitForStepComplete(step, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    throwIfStopped();
    const timer = setTimeout(() => {
      stepWaiters.delete(step);
      reject(new Error(`Step ${step} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    stepWaiters.set(step, {
      resolve: (data) => { clearTimeout(timer); stepWaiters.delete(step); resolve(data); },
      reject: (err) => { clearTimeout(timer); stepWaiters.delete(step); reject(err); },
    });
  });
}

function notifyStepComplete(step, payload) {
  const waiter = stepWaiters.get(step);
  if (waiter) waiter.resolve(payload);
}

function notifyStepError(step, error) {
  const waiter = stepWaiters.get(step);
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

async function markRunningStepsStopped() {
  const state = await getState();
  const runningSteps = Object.entries(state.stepStatuses || {})
    .filter(([, status]) => status === 'running')
    .map(([step]) => Number(step));

  for (const step of runningSteps) {
    await setStepStatus(step, 'stopped');
  }
}

async function requestStop(options = {}) {
  const { logMessage = '已收到停止请求，正在取消当前操作...' } = options;
  if (stopRequested) return;

  stopRequested = true;
  cancelPendingCommands();
  if (webNavListener) {
    chrome.webNavigation.onBeforeNavigate.removeListener(webNavListener);
    webNavListener = null;
  }

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

async function executeStep(step) {
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
    await setStepStatus(step, 'failed');
    await addLog(`步骤 ${step} 失败：${err.message}`, 'error');
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

  if (AUTO_RUN_BACKGROUND_COMPLETED_STEPS.has(step)) {
    await addLog(`自动运行：步骤 ${step} 由后台流程负责收尾，执行函数返回后将直接进入下一步。`, 'info');
    await executeStep(step);
    const latestState = await getState();
    await addLog(`自动运行：步骤 ${step} 已执行返回，当前状态为 ${latestState.stepStatuses?.[step] || 'pending'}，准备继续后续步骤。`, 'info');
  } else {
    await addLog(`自动运行：步骤 ${step} 已发起，正在等待完成信号（超时 ${AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS / 1000} 秒）。`, 'info');
    const completionResultPromise = waitForStepComplete(step, AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS).then(
      payload => ({ ok: true, payload }),
      error => ({ ok: false, error }),
    );

    try {
      await executeStep(step);
    } catch (err) {
      notifyStepError(step, getErrorMessage(err));
      await completionResultPromise;
      throw err;
    }

    const completionResult = await completionResultPromise;
    if (!completionResult.ok) {
      throw completionResult.error;
    }

    await addLog(`自动运行：步骤 ${step} 已收到完成信号，准备继续后续步骤。`, 'info');
  }

  // Extra delay for page transitions / DOM updates
  if (delayAfter > 0) {
    await sleepWithStop(delayAfter + Math.floor(Math.random() * 1200));
  }
}

function normalizeEmailGenerator(value = '') {
  return String(value || '').trim().toLowerCase() === 'cloudflare' ? 'cloudflare' : 'duck';
}

function getEmailGeneratorLabel(generator) {
  return generator === 'cloudflare' ? 'Cloudflare 邮箱' : 'Duck 邮箱';
}

function normalizeVerificationWaitTimeoutSec(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 40;
  const rounded = Math.round(num);
  if (rounded < 10) return 10;
  if (rounded > 300) return 300;
  return rounded;
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

function isLikelyEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function generateCloudflareAliasLocalPart() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const randomPart = String(Math.floor(Math.random() * 900) + 100);
  return `user${stamp}${randomPart}`.toLowerCase();
}

function getCloudflareConfig(state) {
  const zoneId = String(state.cloudflareZoneId || '').trim();
  const domain = normalizeCloudflareDomain(state.cloudflareDomain);
  const forwardTo = String(state.cloudflareForwardTo || '').trim().toLowerCase();
  const apiToken = String(state.cloudflareApiToken || '').trim();

  if (!zoneId) throw new Error('Cloudflare Zone ID 为空。');
  if (!domain) throw new Error('Cloudflare 域名为空或格式无效。');
  if (!forwardTo || !isLikelyEmail(forwardTo)) throw new Error('Cloudflare 转发邮箱为空或格式无效。');
  if (!apiToken) throw new Error('Cloudflare API Token 为空。');

  return { zoneId, domain, forwardTo, apiToken };
}

function normalizeCloudflareCleanupContext(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const ruleId = String(raw.ruleId || '').trim();
  const zoneId = String(raw.zoneId || '').trim();
  const apiToken = String(raw.apiToken || '').trim();
  if (!ruleId || !zoneId || !apiToken) return null;

  return {
    ruleId,
    zoneId,
    apiToken,
    savedAt: Number(raw.savedAt || 0) || Date.now(),
  };
}

async function getCloudflareRuleCleanupContext() {
  const data = await chrome.storage.local.get([CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY]);
  return normalizeCloudflareCleanupContext(data[CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY]);
}

async function setCloudflareRuleCleanupContext(context) {
  const normalized = normalizeCloudflareCleanupContext(context);
  if (!normalized) {
    throw new Error('Cloudflare 路由清理上下文无效，已中止保存。');
  }
  await chrome.storage.local.set({
    [CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY]: normalized,
  });
}

async function clearCloudflareRuleCleanupContext(expectedRuleId = '') {
  const ruleId = String(expectedRuleId || '').trim();
  if (!ruleId) {
    await chrome.storage.local.remove(CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY);
    return;
  }

  const current = await getCloudflareRuleCleanupContext();
  if (!current || current.ruleId === ruleId) {
    await chrome.storage.local.remove(CLOUDFLARE_RULE_CLEANUP_CONTEXT_KEY);
  }
}

async function callCloudflareApi({ path, method = 'GET', token, body = null, timeoutMs = 25000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail = data?.errors?.[0]?.message || text || `HTTP ${response.status}`;
      throw new Error(`Cloudflare API 请求失败：${detail}`);
    }

    if (data && data.success === false) {
      const detail = data.errors?.[0]?.message || '未知错误';
      throw new Error(`Cloudflare API 返回失败：${detail}`);
    }

    return data || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Cloudflare API 请求超时。');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCloudflareEmail(state, options = {}) {
  throwIfStopped();
  if (state?.cloudflareLastRuleId) {
    await cleanupCloudflareRoutingRule(state, {
      reason: '创建新 Cloudflare 前缀前清理旧路由',
      strict: true,
    });
  }

  const latestState = await getState();
  const { zoneId, domain, forwardTo, apiToken } = getCloudflareConfig(latestState);
  const localPart = String(options.localPart || '').trim().toLowerCase() || generateCloudflareAliasLocalPart();
  const aliasEmail = `${localPart}@${domain}`;

  await addLog(`Cloudflare 邮箱：正在创建前缀 ${aliasEmail} -> ${forwardTo} ...`);

  const payload = {
    name: `codex-auto-${localPart}`,
    enabled: true,
    matchers: [
      { type: 'literal', field: 'to', value: aliasEmail },
    ],
    actions: [
      { type: 'forward', value: [forwardTo] },
    ],
  };

  const result = await callCloudflareApi({
    path: `/zones/${encodeURIComponent(zoneId)}/email/routing/rules`,
    method: 'POST',
    token: apiToken,
    body: payload,
  });

  const ruleId = String(result?.result?.id || '').trim();
  if (!ruleId) {
    throw new Error('Cloudflare API 未返回路由 ID，为避免失去清理追踪已中止。');
  }

  try {
    await setCloudflareRuleCleanupContext({
      ruleId,
      zoneId,
      apiToken,
      savedAt: Date.now(),
    });
  } catch (err) {
    let rollbackNote = '';
    try {
      await callCloudflareApi({
        path: `/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(ruleId)}`,
        method: 'DELETE',
        token: apiToken,
      });
      rollbackNote = '已自动回滚并删除刚创建的路由。';
    } catch (rollbackErr) {
      rollbackNote = `回滚删除失败：${rollbackErr.message}`;
    }
    throw new Error(`Cloudflare 路由创建后无法保存清理凭据（${err.message}）。${rollbackNote}`);
  }

  const propagationWaitMs = Math.floor(
    Math.random() * (CLOUDFLARE_RULE_PROPAGATION_MAX_MS - CLOUDFLARE_RULE_PROPAGATION_MIN_MS + 1)
  ) + CLOUDFLARE_RULE_PROPAGATION_MIN_MS;
  const aliasReadyAt = Date.now() + propagationWaitMs;
  await setState({
    cloudflareLastRuleId: ruleId,
    cloudflareLastAliasEmail: aliasEmail,
    cloudflareAliasReadyAt: aliasReadyAt,
  });

  await setEmailState(aliasEmail);
  await addLog(
    `Cloudflare 邮箱：已创建转发规则${ruleId ? `（${ruleId}）` : ''}，地址 ${aliasEmail}。建议等待 ${Math.ceil(propagationWaitMs / 1000)} 秒再触发验证码发送。`,
    'ok'
  );
  return aliasEmail;
}

async function cleanupCloudflareRoutingRule(stateOrNull = null, options = {}) {
  const state = stateOrNull || await getState();
  const reason = options.reason || '清理 Cloudflare 路由';
  const strict = Boolean(options.strict);
  const ruleId = String(state.cloudflareLastRuleId || '').trim();
  if (!ruleId) {
    return false;
  }

  const cleanupContext = await getCloudflareRuleCleanupContext();
  if (!cleanupContext || cleanupContext.ruleId !== ruleId) {
    const msg = `${reason}：存在待清理路由 ${ruleId}，但未找到创建时清理凭据，已停止自动清理。`;
    await addLog(msg, 'warn');
    if (strict) throw new Error(msg);
    return false;
  }
  const { zoneId, apiToken } = cleanupContext;

  try {
    await callCloudflareApi({
      path: `/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(ruleId)}`,
      method: 'DELETE',
      token: apiToken,
    });
    await addLog(`${reason}：已删除 Cloudflare 路由 ${ruleId}。`, 'info');
  } catch (err) {
    const msg = `${reason}：删除 Cloudflare 路由 ${ruleId} 失败：${err.message}`;
    await addLog(msg, 'warn');
    if (strict) throw new Error(msg);
    return false;
  }

  const latest = await getState();
  if (String(latest.cloudflareLastRuleId || '').trim() === ruleId) {
    await setState({
      cloudflareLastRuleId: null,
      cloudflareLastAliasEmail: null,
      cloudflareAliasReadyAt: null,
    });
  }
  await clearCloudflareRuleCleanupContext(ruleId);
  return true;
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
  if (generator === 'cloudflare') {
    return fetchCloudflareEmail(currentState, options);
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
  if (currentState.email) {
    return currentState.email;
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
      if (generator === 'cloudflare' && /Zone ID|域名|转发邮箱|Token/.test(String(err.message || ''))) {
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
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：第 ${attemptRuns} 次尝试，阶段 1，获取 OAuth 链接并打开注册页 ===`, 'info');
  }

  if (startStep <= 2) {
    for (const step of [1, 2]) {
      if (step < startStep) continue;
      await executeStepAndWait(step, AUTO_STEP_DELAYS[step]);
    }
  }

  if (startStep <= 3) {
    await ensureAutoEmailReady(targetRun, totalRuns, attemptRuns);
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：阶段 2，注册、验证、登录并完成授权（第 ${attemptRuns} 次尝试）===`, 'info');
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
      step += 1;
    } catch (err) {
      if (step === 9 && isStep9OAuthTimeoutError(err) && step9RestartAttempts < maxStep9RestartAttempts) {
        step9RestartAttempts += 1;
        await addLog(
          `步骤 9：检测到 OAuth callback 超时，正在回到步骤 6 重新开始授权流程（${step9RestartAttempts}/${maxStep9RestartAttempts}）...`,
          'warn'
        );
        await invalidateDownstreamAfterStepRestart(6, {
          logLabel: `步骤 9 超时后准备回到步骤 6 重试（${step9RestartAttempts}/${maxStep9RestartAttempts}）`,
        });
        step = 6;
        continue;
      }
      throw err;
    }
  }
}

// Outer loop: keep retrying until the target number of successful runs is reached.
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
  const resumeCurrentRun = Number.isInteger(options.resumeCurrentRun) ? options.resumeCurrentRun : 0;
  const resumeSuccessfulRuns = Number.isInteger(options.resumeSuccessfulRuns) ? options.resumeSuccessfulRuns : 0;
  const resumeAttemptRunsProcessed = Number.isInteger(options.resumeAttemptRunsProcessed) ? options.resumeAttemptRunsProcessed : 0;
  let maxAttempts = autoRunSkipFailures ? Math.max(totalRuns * 10, totalRuns + 20) : totalRuns;
  const forcedRetryCap = Math.max(totalRuns * 10, totalRuns + 20);
  let successfulRuns = Math.max(0, resumeSuccessfulRuns);
  let attemptRuns = Math.max(0, resumeAttemptRunsProcessed);
  let forceFreshTabsNextRun = false;
  let continueCurrentOnFirstAttempt = initialMode === 'continue';

  await setState({
    autoRunSkipFailures,
    ...getAutoRunStatusPayload('running', {
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
    let startStep = 1;
    let useExistingProgress = false;

    if (continueCurrentOnFirstAttempt) {
      const currentState = await getState();
      const resumeStep = getFirstUnfinishedStep(currentState.stepStatuses);
      if (resumeStep && hasSavedProgress(currentState.stepStatuses)) {
        startStep = resumeStep;
        useExistingProgress = true;
      } else if (hasSavedProgress(currentState.stepStatuses)) {
        await addLog('当前流程已全部处理，将按“重新开始”新开一轮自动运行。', 'info');
      }
      continueCurrentOnFirstAttempt = false;
    }

    if (!useExistingProgress) {
      // Reset everything at the start of each fresh attempt (keep user settings).
      const prevState = await getState();
      await cleanupCloudflareRoutingRule(prevState, {
        reason: forceFreshTabsNextRun
          ? '自动运行放弃旧线程后清理 Cloudflare 路由'
          : '自动运行新开一轮前清理 Cloudflare 路由',
        strict: true,
      });
      const keepSettings = {
        vpsUrl: prevState.vpsUrl,
        vpsPassword: prevState.vpsPassword,
        customPassword: prevState.customPassword,
          autoRunSkipFailures: prevState.autoRunSkipFailures,
          mailProvider: prevState.mailProvider,
          emailGenerator: prevState.emailGenerator,
          inbucketHost: prevState.inbucketHost,
          inbucketMailbox: prevState.inbucketMailbox,
          cloudflareDomain: prevState.cloudflareDomain,
          cloudflareZoneId: prevState.cloudflareZoneId,
          cloudflareForwardTo: prevState.cloudflareForwardTo,
          cloudflareApiToken: prevState.cloudflareApiToken,
          ...getAutoRunStatusPayload('running', { currentRun: targetRun, totalRuns, attemptRun: attemptRuns }),
          ...(forceFreshTabsNextRun ? { tabRegistry: {} } : {}),
        };
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

// ============================================================
// Step 1: Get OAuth Link (via vps-panel.js)
// ============================================================

async function executeStep1(state) {
  if (!state.vpsUrl) {
    throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
  }
  await addLog('步骤 1：正在打开 CPA 面板...');

  const injectFiles = ['content/utils.js', 'content/vps-panel.js'];

  await closeConflictingTabsForSource('vps-panel', state.vpsUrl);

  const tab = await chrome.tabs.create({ url: state.vpsUrl, active: true });
  const tabId = tab.id;
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

// ============================================================
// Step 2: Open Signup Page (Background opens tab, signup-page.js clicks Register)
// ============================================================

async function executeStep2(state) {
  if (!state.oauthUrl) {
    throw new Error('缺少 OAuth 链接，请先完成步骤 1。');
  }
  await addLog('步骤 2：正在打开认证链接...');
  await reuseOrCreateTab('signup-page', state.oauthUrl);

  await sendToContentScript('signup-page', {
    type: 'EXECUTE_STEP',
    step: 2,
    source: 'background',
    payload: {},
  });
}

// ============================================================
// Step 3: Fill Email & Password (via signup-page.js)
// ============================================================

async function executeStep3(state) {
  if (!state.email) {
    throw new Error('缺少邮箱地址，请先在侧边栏粘贴邮箱。');
  }

  const aliasReadyAt = Number(state.cloudflareAliasReadyAt || 0);
  const lastAlias = String(state.cloudflareLastAliasEmail || '').trim().toLowerCase();
  const currentEmail = String(state.email || '').trim().toLowerCase();
  if (aliasReadyAt && lastAlias && currentEmail && currentEmail === lastAlias) {
    const remainingMs = aliasReadyAt - Date.now();
    if (remainingMs > 0) {
      await addLog(`步骤 3：检测到 Cloudflare 新前缀刚创建，等待 ${Math.ceil(remainingMs / 1000)} 秒让路由生效...`, 'warn');
      await sleepWithStop(remainingMs);
    }
  }

  const password = state.customPassword || generatePassword();
  await setPasswordState(password);

  // Save account record
  const accounts = state.accounts || [];
  accounts.push({ email: state.email, password, createdAt: new Date().toISOString() });
  await setState({ accounts });

  await addLog(
    `步骤 3：正在填写邮箱 ${state.email}，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
  );
  await sendToContentScript('signup-page', {
    type: 'EXECUTE_STEP',
    step: 3,
    source: 'background',
    payload: { email: state.email, password },
  });
}

// ============================================================
// Step 4: Get Signup Verification Code (qq-mail.js polls, then fills in signup-page.js)
// ============================================================

function getMailConfig(state) {
  const provider = state.mailProvider || 'qq';
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
      inject: ['content/utils.js', 'content/inbucket-mail.js'],
      injectSource: 'inbucket-mail',
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

function getVerificationPollPayload(step, state, overrides = {}) {
  const rawIntervalMs = Number(overrides.intervalMs ?? 3000);
  const intervalMs = Number.isFinite(rawIntervalMs) ? Math.max(1000, Math.round(rawIntervalMs)) : 3000;
  const waitTimeoutSec = normalizeVerificationWaitTimeoutSec(
    overrides.verificationWaitTimeoutSec ?? state.verificationWaitTimeoutSec
  );
  const autoMaxAttempts = Math.max(1, Math.ceil((waitTimeoutSec * 1000) / intervalMs));
  const rawMaxAttempts = Number(overrides.maxAttempts);
  const maxAttempts = Number.isFinite(rawMaxAttempts)
    ? Math.max(1, Math.round(rawMaxAttempts))
    : autoMaxAttempts;

  if (step === 4) {
    return {
      filterAfterTimestamp: state.flowStartTime || 0,
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'otp', 'passcode', 'one-time'],
      targetEmail: state.email,
      maxAttempts,
      intervalMs,
      verificationWaitTimeoutSec: waitTimeoutSec,
      ...overrides,
    };
  }

  return {
    filterAfterTimestamp: state.lastEmailTimestamp || state.flowStartTime || 0,
    senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
    subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'login', 'otp', 'passcode', 'one-time'],
    targetEmail: state.email,
    maxAttempts,
    intervalMs,
    verificationWaitTimeoutSec: waitTimeoutSec,
    ...overrides,
  };
}

async function requestVerificationCodeResend(step) {
  const signupTabId = await getTabId('signup-page');
  if (!signupTabId) {
    throw new Error('认证页面标签页已关闭，无法重新请求验证码。');
  }

  await chrome.tabs.update(signupTabId, { active: true });
  await addLog(`步骤 ${step}：正在请求新的${getVerificationCodeLabel(step)}验证码...`, 'warn');

  const result = await sendToContentScript('signup-page', {
    type: 'RESEND_VERIFICATION_CODE',
    step,
    source: 'background',
    payload: {},
  });

  if (result && result.error) {
    throw new Error(result.error);
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

  let lastError = null;
  const filterAfterTimestamp = pollOverrides.filterAfterTimestamp ?? getVerificationPollPayload(step, state).filterAfterTimestamp;
  const maxRounds = pollOverrides.maxRounds || VERIFICATION_POLL_MAX_ROUNDS;

  for (let round = 1; round <= maxRounds; round++) {
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
  if (state[stateKey]) {
    rejectedCodes.add(state[stateKey]);
  }

  const nextFilterAfterTimestamp = options.filterAfterTimestamp ?? null;
  const requestFreshCodeFirst = Boolean(options.requestFreshCodeFirst);
  const maxSubmitAttempts = 3;
  const waitTimeoutSec = normalizeVerificationWaitTimeoutSec(state.verificationWaitTimeoutSec);

  await addLog(`步骤 ${step}：邮箱单轮等待上限 ${waitTimeoutSec} 秒，超时将自动重发验证码并进入下一轮。`, 'info');

  if (requestFreshCodeFirst) {
    try {
      await requestVerificationCodeResend(step);
      await addLog(`步骤 ${step}：已先请求一封新的${getVerificationCodeLabel(step)}验证码，再开始轮询邮箱。`, 'warn');
    } catch (err) {
      await addLog(`步骤 ${step}：首次重新获取验证码失败：${err.message}，将继续使用当前时间窗口轮询。`, 'warn');
    }
  }

  for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
    const result = await pollFreshVerificationCode(step, state, mail, {
      excludeCodes: [...rejectedCodes],
      filterAfterTimestamp: nextFilterAfterTimestamp ?? undefined,
    });

    await addLog(`步骤 ${step}：已获取${getVerificationCodeLabel(step)}验证码：${result.code}`);
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

  await chrome.tabs.update(signupTabId, { active: true });
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

  await resolveVerificationStep(4, state, mail, {
    filterAfterTimestamp: stepStartedAt,
    requestFreshCodeFirst: true,
  });
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
  if (!state.vpsUrl) {
    throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
  }

  await addLog('步骤 6：正在刷新登录用的 CPA OAuth 链接...');
  const waitForFreshOAuth = waitForStepComplete(1, 120000);
  await executeStep1(state);
  await waitForFreshOAuth;

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
    await chrome.tabs.update(authTabId, { active: true });
  } else {
    if (!state.oauthUrl) {
      throw new Error('缺少 OAuth 链接，请先完成步骤 1。');
    }
    await reuseOrCreateTab('signup-page', state.oauthUrl);
  }

  await addLog('步骤 7：正在准备认证页，必要时切换到一次性验证码登录...');
  const prepareResult = await sendToContentScript('signup-page', {
    type: 'PREPARE_LOGIN_CODE',
    step: 7,
    source: 'background',
    payload: {},
  });

  if (prepareResult && prepareResult.error) {
    throw new Error(prepareResult.error);
  }

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

  await resolveVerificationStep(7, state, mail, {
    filterAfterTimestamp: stepStartedAt,
    requestFreshCodeFirst: true,
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
  let lastError = null;

  for (let round = 1; round <= STEP7_RESTART_MAX_ROUNDS; round++) {
    const currentState = round === 1 ? state : await getState();

    try {
      if (round > 1) {
        await addLog(`步骤 7：正在进行第 ${round}/${STEP7_RESTART_MAX_ROUNDS} 轮登录验证码恢复尝试。`, 'warn');
      }
      await runStep7Attempt(currentState);
      return;
    } catch (err) {
      lastError = err;

      if (!isVerificationMailPollingError(err)) {
        throw err;
      }

      if (round >= STEP7_RESTART_MAX_ROUNDS) {
        break;
      }

      await addLog(`步骤 7：检测到邮箱轮询类失败，准备从步骤 6 重新开始（${round + 1}/${STEP7_RESTART_MAX_ROUNDS}）...`, 'warn');
      await rerunStep6ForStep7Recovery();
    }
  }

  throw lastError || new Error(`步骤 7：登录验证码流程在 ${STEP7_RESTART_MAX_ROUNDS} 轮后仍未成功。`);
}

// ============================================================
// Step 8: 完成 OAuth（自动点击 + localhost 回调监听）
// ============================================================

let webNavListener = null;

async function executeStep8(state) {
  if (!state.oauthUrl) {
    throw new Error('缺少 OAuth 链接，请先完成步骤 1。');
  }

  await addLog('步骤 8：正在监听 localhost 回调地址...');

  // 只在当前步骤内注册 webNavigation 监听
  return new Promise((resolve, reject) => {
    let resolved = false;
    let signupTabId = null;

    const cleanupListener = () => {
      if (webNavListener) {
        chrome.webNavigation.onBeforeNavigate.removeListener(webNavListener);
        webNavListener = null;
      }
    };

    const timeout = setTimeout(() => {
      cleanupListener();
      reject(new Error('120 秒内未捕获到 localhost 回调跳转，步骤 8 的点击可能被拦截了。'));
    }, 120000);

    webNavListener = (details) => {
      if (resolved || !signupTabId) return;
      if (details.tabId !== signupTabId) return;
      if (details.frameId !== 0) return;
      if (isLocalhostOAuthCallbackUrl(details.url)) {
        console.log(LOG_PREFIX, `已捕获 localhost OAuth 回调：${details.url}`);
        resolved = true;
        cleanupListener();
        clearTimeout(timeout);
        addLog(`步骤 8：已捕获 localhost 地址：${details.url}`, 'ok').then(() => {
          return completeStepFromBackground(8, { localhostUrl: details.url });
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });
      }
    };


    // 步骤 7 之后，认证页会进入 OAuth 同意页，出现“继续”按钮。
    // 这里先在页面内定位按钮，再通过 debugger 输入事件发起点击。
    (async () => {
      try {
        signupTabId = await getTabId('signup-page');
        if (signupTabId) {
          await chrome.tabs.update(signupTabId, { active: true });
          await addLog('步骤 8：已切回认证页，正在准备调试器点击...');
        } else {
          signupTabId = await reuseOrCreateTab('signup-page', state.oauthUrl);
          await addLog('步骤 8：已重新打开认证页，正在准备调试器点击...');
        }

        chrome.webNavigation.onBeforeNavigate.addListener(webNavListener);

        const clickResult = await sendToContentScript('signup-page', {
          type: 'STEP8_FIND_AND_CLICK',
          source: 'background',
          payload: {},
        });

        if (clickResult?.error) {
          throw new Error(clickResult.error);
        }

        if (!resolved) {
          await clickWithDebugger(signupTabId, clickResult?.rect);
          await addLog('步骤 8：已发送调试器点击，正在等待跳转...');
        }
      } catch (err) {
        clearTimeout(timeout);
        cleanupListener();
        reject(err);
      }
    })();
  });
}

// ============================================================
// Step 9: CPA 回调验证（通过 vps-panel.js）
// ============================================================

async function executeStep9(state) {
  if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
    throw new Error('步骤 8 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 8。');
  }
  if (!state.localhostUrl) {
    throw new Error('缺少 localhost 回调地址，请先完成步骤 8。');
  }
  if (!state.vpsUrl) {
    throw new Error('尚未填写 CPA 地址，请先在侧边栏输入。');
  }

  await addLog('步骤 9：正在打开 CPA 面板...');

  const injectFiles = ['content/utils.js', 'content/vps-panel.js'];
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

// ============================================================
// Open Side Panel on extension icon click
// ============================================================

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
