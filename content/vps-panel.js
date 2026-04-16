// content/vps-panel.js — Content script for CPA panel (steps 1, 9)
// Injected on: CPA panel (user-configured URL)
//
// Actual DOM structure (after login click):
// <div class="card">
//   <div class="card-header">
//     <span class="OAuthPage-module__cardTitle___yFaP0">Codex OAuth</span>
//     <button class="btn btn-primary"><span>登录</span></button>
//   </div>
//   <div class="OAuthPage-module__cardContent___1sXLA">
//     <div class="OAuthPage-module__authUrlBox___Iu1d4">
//       <div class="OAuthPage-module__authUrlLabel___mYFJB">授权链接:</div>
//       <div class="OAuthPage-module__authUrlValue___axvUJ">https://auth.openai.com/...</div>
//       <div class="OAuthPage-module__authUrlActions___venPj">
//         <button class="btn btn-secondary btn-sm"><span>复制链接</span></button>
//         <button class="btn btn-secondary btn-sm"><span>打开链接</span></button>
//       </div>
//     </div>
//     <div class="OAuthPage-module__callbackSection___8kA31">
//       <input class="input" placeholder="http://localhost:1455/auth/callback?code=...&state=...">
//       <button class="btn btn-secondary btn-sm"><span>提交回调 URL</span></button>
//     </div>
//   </div>
// </div>

console.log('[MultiPage:vps-panel] Content script loaded on', location.href);

const VPS_PANEL_LISTENER_SENTINEL = 'data-multipage-vps-panel-listener';
const STEP9_SUCCESS_BADGE_TIMEOUT_MS = 120000;
const {
  isRecoverableStep9AuthFailure,
} = self.MultiPageActivationUtils || {};

if (document.documentElement.getAttribute(VPS_PANEL_LISTENER_SENTINEL) !== '1') {
  document.documentElement.setAttribute(VPS_PANEL_LISTENER_SENTINEL, '1');

  // Listen for commands from Background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_STEP' || message.type === 'REQUEST_OAUTH_URL') {
      resetStopState();
      const startedAt = Date.now();
      const actionLabel = message.type === 'REQUEST_OAUTH_URL'
        ? 'REQUEST_OAUTH_URL'
        : `EXECUTE_STEP received for step ${message.step}`;
      console.log(LOG_PREFIX, actionLabel, {
        url: location.href,
        payloadKeys: Object.keys(message.payload || {}),
        snapshot: getVpsPanelSnapshot(),
      });
      const handler = message.type === 'REQUEST_OAUTH_URL'
        ? requestOAuthUrl(message.payload)
        : handleStep(message.step, message.payload);
      handler.then((result) => {
        console.log(LOG_PREFIX, `${actionLabel} resolved after ${Date.now() - startedAt}ms`, {
          url: location.href,
          snapshot: getVpsPanelSnapshot(),
        });
        sendResponse({ ok: true, ...(result || {}) });
      }).catch(err => {
        console.error(LOG_PREFIX, `${actionLabel} rejected after ${Date.now() - startedAt}ms: ${err?.message || err}`, {
          url: location.href,
          snapshot: getVpsPanelSnapshot(),
        });
        if (isStopError(err)) {
          if (message.step) {
            log(`步骤 ${message.step}：已被用户停止。`, 'warn');
          }
          sendResponse({ stopped: true, error: err.message });
          return;
        }
        if (message.step) {
          reportError(message.step, err.message);
        }
        sendResponse({ error: err.message });
      });
      return true;
    }
  });
} else {
  console.log('[MultiPage:vps-panel] 消息监听已存在，跳过重复注册');
}

async function handleStep(step, payload) {
  switch (step) {
    case 1: return await step1_getOAuthLink(payload);
    case 9: return await step9_vpsVerify(payload);
    default:
      throw new Error(`vps-panel.js 不处理步骤 ${step}`);
  }
}

function isVisibleElement(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0;
}

function getActionText(el) {
  return [
    el?.textContent,
    el?.value,
    el?.getAttribute?.('aria-label'),
    el?.getAttribute?.('title'),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInlineTextSnippet(text, maxLength = 160) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function getPageTextSnippet(maxLength = 240) {
  const bodyText = document.body?.innerText || document.documentElement?.innerText || '';
  return getInlineTextSnippet(bodyText, maxLength);
}

function getVpsPanelSnapshot() {
  const authUrlEl = findAuthUrlElement();
  const oauthHeader = findCodexOAuthHeader();
  const managementKeyInput = findManagementKeyInput();
  const managementLoginButton = findManagementLoginButton();
  const rememberCheckbox = findRememberPasswordCheckbox();
  const oauthNavLink = findOAuthNavLink();

  return {
    url: location.href,
    readyState: document.readyState,
    title: getInlineTextSnippet(document.title || '', 80),
    authUrlVisible: Boolean(authUrlEl),
    authUrlText: getInlineTextSnippet(authUrlEl?.textContent || '', 120),
    oauthHeaderVisible: Boolean(oauthHeader),
    oauthHeaderText: getInlineTextSnippet(oauthHeader?.textContent || '', 120),
    managementKeyVisible: Boolean(managementKeyInput),
    managementLoginVisible: Boolean(managementLoginButton),
    managementLoginText: getInlineTextSnippet(getActionText(managementLoginButton), 60),
    rememberCheckboxVisible: Boolean(rememberCheckbox),
    rememberCheckboxChecked: Boolean(rememberCheckbox?.checked),
    oauthNavVisible: Boolean(oauthNavLink),
    oauthNavText: getInlineTextSnippet(getActionText(oauthNavLink), 80),
    bodySnippet: getPageTextSnippet(),
  };
}

function getVpsPanelSnapshotSignature(snapshot) {
  return JSON.stringify({
    readyState: snapshot.readyState,
    title: snapshot.title,
    authUrlVisible: snapshot.authUrlVisible,
    authUrlText: snapshot.authUrlText,
    oauthHeaderVisible: snapshot.oauthHeaderVisible,
    oauthHeaderText: snapshot.oauthHeaderText,
    managementKeyVisible: snapshot.managementKeyVisible,
    managementLoginVisible: snapshot.managementLoginVisible,
    rememberCheckboxVisible: snapshot.rememberCheckboxVisible,
    rememberCheckboxChecked: snapshot.rememberCheckboxChecked,
    oauthNavVisible: snapshot.oauthNavVisible,
    oauthNavText: snapshot.oauthNavText,
    bodySnippet: snapshot.bodySnippet,
  });
}

function parseUrlSafely(rawUrl) {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
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

function getStatusBadgeSelectors() {
  return [
    '#root > div > div > div > main > div > div > div > div > div:nth-child(1) > div > div.OAuthPage-module__cardContent___1sXLA > div.status-badge',
    '#root .OAuthPage-module__cardContent___1sXLA > .status-badge',
    '.OAuthPage-module__cardContent___1sXLA > .status-badge',
    '.status-badge',
  ];
}

function getStatusBadgeEntries() {
  const seen = new Set();
  const entries = [];

  for (const selector of getStatusBadgeSelectors()) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      entries.push(createStep9Entry(candidate, selector));
    }
  }

  return entries;
}

function summarizeStatusBadgeEntries(entries) {
  if (!entries.length) return '无可见状态徽标';
  return entries
    .map((entry, index) => {
      const text = entry.text || '(空文本)';
      const className = entry.className ? ` class=${getInlineTextSnippet(entry.className, 80)}` : '';
      const errorVisual = entry.errorVisualSummary ? ` error=${getInlineTextSnippet(entry.errorVisualSummary, 80)}` : '';
      return `#${index + 1}="${getInlineTextSnippet(text, 80)}"${className}${errorVisual}`;
    })
    .join(' | ');
}

const STEP9_SUCCESS_STATUSES = new Set([
  'Authentication successful!',
  'Аутентификация успешна!',
  '认证成功！',
]);

function normalizeStep9StatusText(statusText) {
  return String(statusText || '').replace(/\s+/g, ' ').trim();
}

function isOAuthCallbackTimeoutFailure(statusText) {
  return /认证失败:\s*(?:Timeout waiting for OAuth callback|timeout of \d+ms exceeded)/i.test(statusText || '');
}

function isStep9FailureText(statusText) {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return false;
  if (isOAuthCallbackTimeoutFailure(text)) return true;
  if (typeof isRecoverableStep9AuthFailure === 'function' && isRecoverableStep9AuthFailure(text)) {
    return true;
  }
  return /回调\s*url\s*提交失败|callback\s*url\s*submit\s*failed|oauth flow is not pending/i.test(text);
}

function isStep9SuccessStatus(statusText) {
  return STEP9_SUCCESS_STATUSES.has(normalizeStep9StatusText(statusText));
}

function isStep9SuccessLikeStatus(statusText) {
  const text = normalizeStep9StatusText(statusText);
  return /authentication successful|аутентификац.*успеш|认证成功/i.test(text);
}

function parseCssColorChannels(colorText) {
  const text = String(colorText || '').trim().toLowerCase();
  if (!text || text === 'transparent' || text === 'inherit' || text === 'initial' || text === 'unset') {
    return null;
  }

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex.split('').map((part) => part + part);
      const [r, g, b, a = 'ff'] = expanded;
      return {
        r: Number.parseInt(r, 16),
        g: Number.parseInt(g, 16),
        b: Number.parseInt(b, 16),
        a: Number.parseInt(a, 16) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const parts = hex.match(/.{1,2}/g) || [];
      const [r, g, b, a = 'ff'] = parts;
      return {
        r: Number.parseInt(r, 16),
        g: Number.parseInt(g, 16),
        b: Number.parseInt(b, 16),
        a: Number.parseInt(a, 16) / 255,
      };
    }
  }

  if (text.startsWith('rgb')) {
    const numericParts = text.match(/[\d.]+/g) || [];
    if (numericParts.length >= 3) {
      const [r, g, b, a = '1'] = numericParts.map(Number);
      return { r, g, b, a };
    }
  }

  return null;
}

function isReddishColor(colorText) {
  const channels = parseCssColorChannels(colorText);
  if (!channels) return false;
  const { r, g, b, a = 1 } = channels;
  if (a <= 0.05) return false;
  return r >= 120 && r >= g + 35 && r >= b + 35;
}

function getStep9ErrorVisualSignals(element, className = '') {
  const signals = [];
  const normalizedClassName = String(className || '').replace(/\s+/g, ' ').trim();
  if (/(?:error|danger|fail|destructive|text-red|text-danger|alert)/i.test(normalizedClassName)) {
    signals.push(`class=${getInlineTextSnippet(normalizedClassName, 80)}`);
  }

  if (!element) {
    return signals;
  }

  const style = window.getComputedStyle(element);
  if (isReddishColor(style.color)) {
    signals.push(`color=${style.color}`);
  }
  if (isReddishColor(style.borderColor)) {
    signals.push(`border=${style.borderColor}`);
  }
  if (isReddishColor(style.backgroundColor)) {
    signals.push(`background=${style.backgroundColor}`);
  }

  return signals;
}

function createStep9Entry(candidate, selector) {
  const className = String(candidate?.className || '').replace(/\s+/g, ' ').trim();
  const errorVisualSignals = getStep9ErrorVisualSignals(candidate, className);
  return {
    element: candidate,
    selector,
    visible: isVisibleElement(candidate),
    text: normalizeStep9StatusText(candidate?.textContent || ''),
    className,
    errorVisualSignals,
    errorVisualSummary: errorVisualSignals.join(', '),
    hasErrorVisualSignal: errorVisualSignals.length > 0,
  };
}

function getStep9PageErrorSelectors() {
  return [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '.alert',
    '[class*="alert"]',
    '[class*="error"]',
    '[class*="danger"]',
    '.text-danger',
    '.text-red',
  ];
}

function getStep9PageErrorEntries() {
  const seen = new Set();
  const entries = [];

  for (const selector of getStep9PageErrorSelectors()) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (!isVisibleElement(candidate)) continue;

      const entry = createStep9Entry(candidate, selector);
      if (!isStep9FailureText(entry.text)) continue;
      entries.push(entry);
    }
  }

  return entries;
}

function buildStep9StatusDiagnostics(entries = [], pageErrorEntries = [], pageSnippet = '') {
  const visibleEntries = entries.filter((entry) => entry.visible);
  const successLikeEntries = visibleEntries.filter((entry) => isStep9SuccessLikeStatus(entry.text));
  const exactSuccessEntries = visibleEntries.filter((entry) => isStep9SuccessStatus(entry.text) && !entry.hasErrorVisualSignal);
  const failureEntries = visibleEntries.filter((entry) => isStep9FailureText(entry.text));
  const errorStyledEntries = visibleEntries.filter((entry) => entry.hasErrorVisualSignal);
  const allFailureEntries = [...failureEntries, ...pageErrorEntries];
  const decisiveFailureEntry = allFailureEntries[0] || null;
  const selectedEntry = decisiveFailureEntry || exactSuccessEntries[0] || visibleEntries[0] || null;
  const selectedText = selectedEntry?.text || '';
  const visibleSummary = summarizeStatusBadgeEntries(visibleEntries);
  const successLikeSummary = summarizeStatusBadgeEntries(successLikeEntries);
  const exactSuccessSummary = summarizeStatusBadgeEntries(exactSuccessEntries);
  const failureSummary = summarizeStatusBadgeEntries(failureEntries);
  const pageErrorSummary = summarizeStatusBadgeEntries(pageErrorEntries);
  const errorStyledSummary = summarizeStatusBadgeEntries(errorStyledEntries);
  const extraFailureSuffix = pageErrorEntries.length ? `；额外错误提示：${pageErrorSummary}` : '';
  const errorStyledSuffix = errorStyledEntries.length ? `；红色/错误样式徽标：${errorStyledSummary}` : '';

  return {
    selectedText,
    exactSuccessText: exactSuccessEntries[0]?.text || '',
    failureText: decisiveFailureEntry?.text || '',
    visibleCount: visibleEntries.length,
    visibleSummary,
    hasSuccessLikeVisibleBadge: successLikeEntries.length > 0,
    hasExactSuccessVisibleBadge: exactSuccessEntries.length > 0,
    hasFailureVisibleBadge: allFailureEntries.length > 0,
    hasErrorStyledVisibleBadge: errorStyledEntries.length > 0,
    successLikeSummary,
    exactSuccessSummary,
    failureSummary,
    pageErrorSummary,
    errorStyledSummary,
    pageSnippet,
    signature: JSON.stringify({
      selectedText,
      visibleCount: visibleEntries.length,
      visibleSummary,
      successLikeSummary,
      exactSuccessSummary,
      failureSummary,
      pageErrorSummary,
      errorStyledSummary,
    }),
    summary: selectedText
      ? `当前聚焦状态="${getInlineTextSnippet(selectedText, 80)}"；可见徽标 ${visibleEntries.length} 个：${visibleSummary}${extraFailureSuffix}${errorStyledSuffix}`
      : `当前未选中任何可见状态徽标；可见徽标 ${visibleEntries.length} 个：${visibleSummary}${extraFailureSuffix}${errorStyledSuffix}；页面片段="${getInlineTextSnippet(pageSnippet, 120)}"`,
  };
}

function getStatusBadgeDiagnostics() {
  return buildStep9StatusDiagnostics(
    getStatusBadgeEntries(),
    getStep9PageErrorEntries(),
    getPageTextSnippet()
  );
}

function getStatusBadgeElement() {
  const visibleEntry = getStatusBadgeEntries().find((entry) => entry.visible);
  return visibleEntry ? visibleEntry.element : null;
}

function getStatusBadgeText() {
  const diagnostics = getStatusBadgeDiagnostics();
  return diagnostics.selectedText;
}

async function waitForExactSuccessBadge(timeout = STEP9_SUCCESS_BADGE_TIMEOUT_MS) {
  const start = Date.now();
  let lastDiagnosticsSignature = '';
  let lastHeartbeatLoggedAt = 0;
  let lastSuccessLikeMismatchSignature = '';
  let lastSuccessFailureConflictSignature = '';

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const diagnostics = getStatusBadgeDiagnostics();
    const elapsed = Date.now() - start;

    if (diagnostics.signature !== lastDiagnosticsSignature) {
      lastDiagnosticsSignature = diagnostics.signature;
      lastHeartbeatLoggedAt = elapsed;
      log(`步骤 9：认证状态检测中，${diagnostics.summary}`);
      console.log(LOG_PREFIX, '[Step 9] status badge diagnostics changed', diagnostics);
    } else if (elapsed - lastHeartbeatLoggedAt >= 10000) {
      lastHeartbeatLoggedAt = elapsed;
      log(`步骤 9：仍在等待认证成功，${diagnostics.summary}`);
      console.log(LOG_PREFIX, '[Step 9] still waiting for success badge', diagnostics);
    }

    if (diagnostics.hasSuccessLikeVisibleBadge && !diagnostics.hasExactSuccessVisibleBadge) {
      const mismatchSignature = JSON.stringify({
        selectedText: diagnostics.selectedText,
        successLikeSummary: diagnostics.successLikeSummary,
        visibleSummary: diagnostics.visibleSummary,
        errorStyledSummary: diagnostics.errorStyledSummary,
      });
      if (mismatchSignature !== lastSuccessLikeMismatchSignature) {
        lastSuccessLikeMismatchSignature = mismatchSignature;
        const errorStyledSuffix = diagnostics.hasErrorStyledVisibleBadge
          ? `；错误样式徽标：${diagnostics.errorStyledSummary}`
          : '';
        log(
          `步骤 9：检测到“认证成功”相关徽标，但未命中精确成功条件。当前聚焦="${getInlineTextSnippet(diagnostics.selectedText || '(空)', 80)}"；成功相关徽标：${diagnostics.successLikeSummary}${errorStyledSuffix}`,
          'warn'
        );
        console.warn(LOG_PREFIX, '[Step 9] success-like badge detected without exact match', diagnostics);
      }
    }

    if (diagnostics.hasExactSuccessVisibleBadge && diagnostics.hasFailureVisibleBadge) {
      const conflictSignature = JSON.stringify({
        exactSuccessSummary: diagnostics.exactSuccessSummary,
        failureSummary: diagnostics.failureSummary,
        pageErrorSummary: diagnostics.pageErrorSummary,
      });
      if (conflictSignature !== lastSuccessFailureConflictSignature) {
        lastSuccessFailureConflictSignature = conflictSignature;
        const failureSummary = diagnostics.pageErrorSummary !== '无可见状态徽标'
          ? diagnostics.pageErrorSummary
          : diagnostics.failureSummary;
        log(
          `步骤 9：同时检测到成功徽标和失败提示，本轮不判定成功。成功徽标：${diagnostics.exactSuccessSummary}；失败提示：${failureSummary}`,
          'warn'
        );
        console.warn(LOG_PREFIX, '[Step 9] success badge is blocked by visible failure', diagnostics);
      }
    }

    if (diagnostics.failureText) {
      if (isOAuthCallbackTimeoutFailure(diagnostics.failureText)) {
        throw new Error(`STEP9_OAUTH_TIMEOUT::${diagnostics.failureText}`);
      }
      throw new Error(`STEP9_OAUTH_RETRY::${diagnostics.failureText}`);
    }
    if (diagnostics.exactSuccessText) {
      return diagnostics.exactSuccessText;
    }
    await sleep(200);
  }

  const finalDiagnostics = getStatusBadgeDiagnostics();
  const finalText = finalDiagnostics.failureText || finalDiagnostics.selectedText;
  const diagnosticsSuffix = ` 当前诊断：${finalDiagnostics.summary}`;
  if (isOAuthCallbackTimeoutFailure(finalText)) {
    throw new Error(`STEP9_OAUTH_TIMEOUT::${finalText}${diagnosticsSuffix}`);
  }
  if (isStep9FailureText(finalText)) {
    throw new Error(`STEP9_OAUTH_RETRY::${finalText}${diagnosticsSuffix}`);
  }
  throw new Error(finalText
    ? `CPA 面板状态未进入成功状态，当前为“${finalText}”。${diagnosticsSuffix}`
    : `CPA 面板长时间未出现成功状态徽标。${diagnosticsSuffix}`);
}

function findManagementKeyInput() {
  const candidates = document.querySelectorAll(
    '.LoginPage-module__loginCard___OgP-R input[type="password"], input[placeholder*="管理密钥"], input[aria-label*="管理密钥"]'
  );
  return Array.from(candidates).find(isVisibleElement) || null;
}

function findManagementLoginButton() {
  const candidates = document.querySelectorAll('.LoginPage-module__loginCard___OgP-R button, .LoginPage-module__loginCard___OgP-R .btn');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el)) return false;
    return /登录|login/i.test(getActionText(el));
  }) || null;
}

function findRememberPasswordCheckbox() {
  const candidates = document.querySelectorAll('.LoginPage-module__loginCard___OgP-R input[type="checkbox"]');
  return Array.from(candidates).find((el) => {
    const label = el.closest('label');
    const text = getActionText(label || el);
    return /记住密码|remember/i.test(text);
  }) || null;
}

function findOAuthNavLink() {
  const candidates = document.querySelectorAll('a[href*="#/oauth"], a.nav-item, button, [role="link"], [role="button"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el)) return false;
    const text = getActionText(el);
    const href = el.getAttribute('href') || '';
    return href.includes('#/oauth') || /oauth/i.test(text);
  }) || null;
}

function findCodexOAuthHeader() {
  const candidates = document.querySelectorAll('.card-header, [class*="cardHeader"], .card, [class*="card"]');
  return Array.from(candidates).find((el) => {
    if (!isVisibleElement(el)) return false;
    const text = (el.textContent || '').toLowerCase();
    return text.includes('codex') && text.includes('oauth');
  }) || null;
}

function findOAuthCardLoginButton(header) {
  const card = header?.closest('.card, [class*="card"]') || header?.parentElement || document;
  const candidates = card.querySelectorAll('button.btn.btn-primary, button.btn-primary, button.btn');
  return Array.from(candidates).find((el) => isVisibleElement(el) && /登录|login/i.test(getActionText(el))) || null;
}

function findAuthUrlElement() {
  const candidates = document.querySelectorAll('[class*="authUrlValue"], .OAuthPage-module__authUrlValue___axvUJ');
  return Array.from(candidates).find((el) => isVisibleElement(el) && /^https?:\/\//i.test((el.textContent || '').trim())) || null;
}

async function ensureOAuthManagementPage(vpsPassword, step = 1, timeout = 45000) {
  const start = Date.now();
  let lastLoginAttemptAt = 0;
  let lastOauthNavAttemptAt = 0;
  let lastSnapshotSignature = '';
  let lastSnapshotLogAt = 0;

  console.log(LOG_PREFIX, `[Step ${step}] ensureOAuthManagementPage start`, {
    timeout,
    url: location.href,
    hasVpsPassword: Boolean(vpsPassword),
    snapshot: getVpsPanelSnapshot(),
  });

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const elapsed = Date.now() - start;
    const snapshot = getVpsPanelSnapshot();
    const signature = getVpsPanelSnapshotSignature(snapshot);
    if (signature !== lastSnapshotSignature || elapsed - lastSnapshotLogAt >= 5000) {
      lastSnapshotSignature = signature;
      lastSnapshotLogAt = elapsed;
      console.log(LOG_PREFIX, `[Step ${step}] panel snapshot at ${elapsed}ms`, snapshot);
    }

    const authUrlEl = findAuthUrlElement();
    if (authUrlEl) {
      console.log(LOG_PREFIX, `[Step ${step}] found visible auth URL after ${elapsed}ms`, {
        url: location.href,
        authUrlText: getInlineTextSnippet(authUrlEl.textContent || '', 120),
      });
      return { header: findCodexOAuthHeader(), authUrlEl };
    }

    const oauthHeader = findCodexOAuthHeader();
    if (oauthHeader) {
      console.log(LOG_PREFIX, `[Step ${step}] found OAuth card header after ${elapsed}ms`, {
        url: location.href,
        headerText: getInlineTextSnippet(oauthHeader.textContent || '', 120),
      });
      return { header: oauthHeader, authUrlEl: null };
    }

    const managementKeyInput = findManagementKeyInput();
    const managementLoginButton = findManagementLoginButton();
    if (managementKeyInput && managementLoginButton) {
      if (!vpsPassword) {
        throw new Error('CPA 面板需要管理密钥，请先在侧边栏填写 CPA Key（管理密钥）。');
      }

      if ((managementKeyInput.value || '') !== vpsPassword) {
        await humanPause(350, 900);
        fillInput(managementKeyInput, vpsPassword);
        console.log(LOG_PREFIX, `[Step ${step}] filled management key after ${elapsed}ms`);
        log(`步骤 ${step}：已填写 CPA 管理密钥。`);
      }

      const rememberCheckbox = findRememberPasswordCheckbox();
      if (rememberCheckbox && !rememberCheckbox.checked) {
        simulateClick(rememberCheckbox);
        console.log(LOG_PREFIX, `[Step ${step}] toggled remember checkbox after ${elapsed}ms`);
        log(`步骤 ${step}：已勾选 CPA 面板“记住密码”。`);
        await sleep(300);
      }

      if (Date.now() - lastLoginAttemptAt > 3000) {
        lastLoginAttemptAt = Date.now();
        await humanPause(350, 900);
        simulateClick(managementLoginButton);
        console.log(LOG_PREFIX, `[Step ${step}] clicked management login after ${elapsed}ms`, {
          buttonText: getInlineTextSnippet(getActionText(managementLoginButton), 80),
        });
        log(`步骤 ${step}：已提交 CPA 管理登录。`);
      }

      await sleep(1500);
      continue;
    }

    const oauthNavLink = findOAuthNavLink();
    if (oauthNavLink && Date.now() - lastOauthNavAttemptAt > 2000) {
      lastOauthNavAttemptAt = Date.now();
      await humanPause(300, 800);
      simulateClick(oauthNavLink);
      console.log(LOG_PREFIX, `[Step ${step}] clicked OAuth nav after ${elapsed}ms`, {
        navText: getInlineTextSnippet(getActionText(oauthNavLink), 80),
      });
      log(`步骤 ${step}：已打开“OAuth 登录”导航。`);
      await sleep(1200);
      continue;
    }

    await sleep(250);
  }

  console.error(LOG_PREFIX, `[Step ${step}] ensureOAuthManagementPage timeout after ${Date.now() - start}ms`, {
    url: location.href,
    snapshot: getVpsPanelSnapshot(),
  });

  throw new Error('无法进入 CPA 的 OAuth 管理页面，请检查面板是否正常加载。URL: ' + location.href);
}

async function requestOAuthUrl(payload = {}) {
  return step1_getOAuthLink(payload, { report: false });
}

// ============================================================
// Step 1: Get OAuth Link
// ============================================================

async function step1_getOAuthLink(payload, options = {}) {
  const { report = true } = options;
  const { vpsPassword } = payload || {};
  const logStep = Number.isInteger(payload?.logStep) ? payload.logStep : 1;
  console.log(LOG_PREFIX, '[Step 1] step1_getOAuthLink start', {
    url: location.href,
    hasVpsPassword: Boolean(vpsPassword),
    snapshot: getVpsPanelSnapshot(),
  });

  log(`步骤 ${logStep}：正在等待 CPA 面板加载并进入 OAuth 页面...`);

  const { header, authUrlEl: existingAuthUrlEl } = await ensureOAuthManagementPage(vpsPassword, logStep);
  let authUrlEl = existingAuthUrlEl;
  console.log(LOG_PREFIX, '[Step 1] ensureOAuthManagementPage resolved', {
    url: location.href,
    hasHeader: Boolean(header),
    hasExistingAuthUrl: Boolean(existingAuthUrlEl),
    snapshot: getVpsPanelSnapshot(),
  });

  if (!authUrlEl) {
    const loginBtn = findOAuthCardLoginButton(header);
    if (!loginBtn) {
      throw new Error('已找到 Codex OAuth 卡片，但卡片内没有登录按钮。URL: ' + location.href);
    }

    if (loginBtn.disabled) {
      console.log(LOG_PREFIX, '[Step 1] OAuth login button is disabled, waiting for auth URL', {
        url: location.href,
        buttonText: getInlineTextSnippet(getActionText(loginBtn), 80),
      });
      log(`步骤 ${logStep}：OAuth 登录按钮当前不可用，正在等待授权链接出现...`);
    } else {
      await humanPause(500, 1400);
      simulateClick(loginBtn);
      console.log(LOG_PREFIX, '[Step 1] clicked OAuth login button and waiting for auth URL', {
        url: location.href,
        buttonText: getInlineTextSnippet(getActionText(loginBtn), 80),
      });
      log(`步骤 ${logStep}：已点击 OAuth 登录按钮，正在等待授权链接...`);
    }

    try {
      authUrlEl = await waitForElement('[class*="authUrlValue"]', 15000);
    } catch {
      throw new Error(
        '点击 OAuth 登录按钮后未出现授权链接。' +
        '请检查 CPA 面板服务是否正在运行。URL: ' + location.href
      );
    }
  } else {
    log(`步骤 ${logStep}：CPA 面板上已显示授权链接。`);
  }

  const oauthUrl = (authUrlEl.textContent || '').trim();
  if (!oauthUrl || !oauthUrl.startsWith('http')) {
    throw new Error(`拿到的 OAuth 链接无效：\"${oauthUrl.slice(0, 50)}\"。应为 http 开头的 URL。`);
  }

  log(`步骤 ${logStep}：已获取 OAuth 链接：${oauthUrl.slice(0, 80)}...`, 'ok');
  console.log(LOG_PREFIX, '[Step 1] reporting completion with oauthUrl', {
    url: location.href,
    oauthUrlPreview: oauthUrl.slice(0, 120),
  });
  if (report) {
    reportComplete(1, { oauthUrl });
  }
  return { oauthUrl };
}

// ============================================================
// 步骤 9：CPA 回调验证——填写 localhost 回调地址并提交
// ============================================================

async function step9_vpsVerify(payload) {
  await ensureOAuthManagementPage(payload?.vpsPassword, 9);

  // 优先从 payload 读取 localhostUrl；没有时再回退到全局状态
  let localhostUrl = payload?.localhostUrl;
  if (localhostUrl && !isLocalhostOAuthCallbackUrl(localhostUrl)) {
    throw new Error('步骤 9 只接受真实的 localhost OAuth 回调地址，请重新执行步骤 8。');
  }
  if (!localhostUrl) {
    log('步骤 9：payload 中没有 localhostUrl，正在从状态中读取...');
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    localhostUrl = state.localhostUrl;
    if (localhostUrl && !isLocalhostOAuthCallbackUrl(localhostUrl)) {
      throw new Error('步骤 9 只接受真实的 localhost OAuth 回调地址，请重新执行步骤 8。');
    }
  }
  if (!localhostUrl) {
    throw new Error('未找到 localhost 回调地址，请先完成步骤 8。');
  }
  log(`步骤 9：已获取 localhostUrl：${localhostUrl.slice(0, 60)}...`);

  log('步骤 9：正在查找回调地址输入框...');

  // Find the callback URL input
  // Actual DOM: <input class="input" placeholder="http://localhost:1455/auth/callback?code=...&state=...">
  let urlInput = null;
  try {
    urlInput = await waitForElement('[class*="callbackSection"] input.input', 10000);
  } catch {
    try {
      urlInput = await waitForElement('input[placeholder*="localhost"]', 5000);
    } catch {
      throw new Error('在 CPA 面板中未找到回调地址输入框。URL: ' + location.href);
    }
  }

  await humanPause(600, 1500);
  fillInput(urlInput, localhostUrl);
  log(`步骤 9：已填写回调地址：${localhostUrl.slice(0, 80)}...`);

  // Find and click the callback submit button in supported UI languages.
  const callbackSubmitPattern = /提交回调\s*URL|Submit\s+Callback\s+URL|Отправить\s+Callback\s+URL/i;
  let submitBtn = null;
  try {
    submitBtn = await waitForElementByText(
      '[class*="callbackActions"] button, [class*="callbackSection"] button',
      callbackSubmitPattern,
      5000
    );
  } catch {
    try {
      submitBtn = await waitForElementByText('button.btn', callbackSubmitPattern, 5000);
    } catch {
      throw new Error('未找到回调提交按钮（提交回调 URL / Submit Callback URL / Отправить Callback URL）。URL: ' + location.href);
    }
  }

  await humanPause(450, 1200);
  simulateClick(submitBtn);
  log('步骤 9：已点击回调提交按钮，正在等待认证结果...');

  const verifiedStatus = await waitForExactSuccessBadge();
  log(`步骤 9：${verifiedStatus}`, 'ok');
  reportComplete(9, { localhostUrl, verifiedStatus });
}
