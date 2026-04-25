// content/vps-panel.js — Content script for CPA panel (steps 7, 10 / OAuth URL request)
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
//       <div class="status-badge success">回调 URL 已提交，等待认证中...</div>
//       <div class="status-badge error">回调 URL 提交失败: ...</div>
//     </div>
//     <div class="status-badge">等待认证中... / 认证成功！ / 认证失败: ...</div>
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
    case 10: return await step9_vpsVerify(payload);
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
    '#root .OAuthPage-module__cardContent___1sXLA .status-badge',
    '[class*="cardContent"] .status-badge',
    '.status-badge',
  ];
}

function getStatusBadgeEntries() {
  const searchRoot = findCodexOAuthCard() || document;
  const seen = new Set();
  const entries = [];

  for (const selector of getStatusBadgeSelectors()) {
    const candidates = searchRoot.querySelectorAll(selector);
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
  return /(?:认证失败\s*[:：]?\s*)?(?:Timeout waiting for OAuth callback|timeout of \d+ms exceeded|OAuth flow timed out)/i.test(statusText || '');
}

function getStep10StatusBadgeLocation(element) {
  if (element?.closest?.('[class*="callbackSection"]')) {
    return 'callback';
  }
  if (element?.closest?.('[class*="cardContent"]')) {
    return 'main';
  }
  return 'page';
}

function isStep10CallbackSubmittedStatus(statusText) {
  const text = normalizeStep9StatusText(statusText);
  return /回调\s*url\s*已提交.*等待认证中/i.test(text)
    || /callback\s*url\s*submitted.*waiting/i.test(text);
}

function isStep10CallbackFailureText(statusText) {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return false;
  return /(?:回调\s*url\s*提交失败|回调url提交失败|提交回调失败)\s*[:：,，]?\s*/i.test(text)
    || /请更新\s*cli\s*proxy\s*api\s*或检查连接/i.test(text);
}

function isStep10MainWaitingStatus(statusText) {
  const text = normalizeStep9StatusText(statusText);
  return /等待认证中/i.test(text);
}

function isStep10MainFailureText(statusText) {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return false;
  if (/^认证失败\s*[:：]?\s*/i.test(text)) return true;
  return /bad request|state code error|failed to exchange authorization code for tokens|failed to save authentication tokens|unknown or expired state|invalid state|state is required|code or error is required|invalid redirect_url|provider does not match state|failed to persist oauth callback|timeout waiting for oauth callback|oauth flow timed out|request failed with status code \d+|timeout of \d+ms exceeded|network error|failed to fetch/i.test(text);
}

function isStep9FailureText(statusText) {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return false;
  if (isOAuthCallbackTimeoutFailure(text)) return true;
  if (isStep10CallbackFailureText(text)) return true;
  if (isStep10MainFailureText(text)) return true;
  if (typeof isRecoverableStep9AuthFailure === 'function' && isRecoverableStep9AuthFailure(text)) {
    return true;
  }
  return /callback\s*url\s*submit\s*failed|oauth flow is not pending/i.test(text);
}

function isStep9SuccessStatus(statusText) {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return false;
  return STEP9_SUCCESS_STATUSES.has(text)
    || /^认证成功[!！]?$/i.test(text)
    || /^Authentication successful!?$/i.test(text)
    || /^Аутентификация успешна!?$/i.test(text);
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
    location: getStep10StatusBadgeLocation(candidate),
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
  const cardRoot = findCodexOAuthCard();
  const searchRoots = [cardRoot, document].filter(Boolean);
  const seen = new Set();
  const entries = [];

  for (const root of searchRoots) {
    for (const selector of getStep9PageErrorSelectors()) {
      const candidates = root.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        if (!isVisibleElement(candidate)) continue;

        const entry = createStep9Entry(candidate, selector);
        if (/\bstatus-badge\b/i.test(entry.className)) continue;
        if (!isStep9FailureText(entry.text)) continue;
        entries.push(entry);
      }
    }
  }

  return entries;
}

function formatStep10StatusSummaryValue(text, emptyText = '无') {
  return text ? `"${getInlineTextSnippet(text, 80)}"` : emptyText;
}

function isStep10BrowserSwitchRequiredConflict(diagnostics = {}) {
  return Boolean(diagnostics?.hasExactSuccessVisibleBadge)
    && /请更新\s*cli\s*proxy\s*api\s*或检查连接/i.test(String(diagnostics?.callbackFailureText || ''));
}

function getStep10BrowserSwitchRequiredMessage(diagnostics = {}) {
  const callbackFailureText = normalizeStep9StatusText(diagnostics?.callbackFailureText || '');
  return [
    '检测到 CPA 页面同时显示“认证成功”和“回调 URL 提交失败: 请更新CLI Proxy API或检查连接”。',
    '这类冲突状态通常通过更换浏览器可以解决，请更换浏览器后重新进行注册登录。',
    callbackFailureText ? `面板原文：${callbackFailureText}` : '',
  ].filter(Boolean).join(' ');
}

function buildStep9StatusDiagnostics(entries = [], pageErrorEntries = [], pageSnippet = '') {
  const visibleEntries = entries.filter((entry) => entry.visible);
  const callbackEntries = visibleEntries.filter((entry) => entry.location === 'callback');
  const mainEntries = visibleEntries.filter((entry) => entry.location === 'main');
  const successLikeEntries = mainEntries.filter((entry) => isStep9SuccessLikeStatus(entry.text));
  const exactSuccessEntries = mainEntries.filter((entry) => isStep9SuccessStatus(entry.text) && !entry.hasErrorVisualSignal);
  const callbackSubmittedEntries = callbackEntries.filter((entry) => isStep10CallbackSubmittedStatus(entry.text) && !entry.hasErrorVisualSignal);
  const callbackFailureEntries = callbackEntries.filter((entry) => isStep10CallbackFailureText(entry.text));
  const mainWaitingEntries = mainEntries.filter((entry) => isStep10MainWaitingStatus(entry.text) && !entry.hasErrorVisualSignal);
  const mainFailureEntries = mainEntries.filter((entry) => isStep10MainFailureText(entry.text));
  const failureEntries = [...callbackFailureEntries, ...mainFailureEntries];
  const errorStyledEntries = visibleEntries.filter((entry) => entry.hasErrorVisualSignal);
  const allFailureEntries = [...failureEntries, ...pageErrorEntries];
  const decisiveFailureEntry = allFailureEntries[0] || null;
  const selectedEntry = decisiveFailureEntry
    || exactSuccessEntries[0]
    || callbackSubmittedEntries[0]
    || mainWaitingEntries[0]
    || visibleEntries[0]
    || null;
  const selectedText = selectedEntry?.text || '';
  const visibleSummary = summarizeStatusBadgeEntries(visibleEntries);
  const callbackSummary = summarizeStatusBadgeEntries(callbackEntries);
  const mainSummary = summarizeStatusBadgeEntries(mainEntries);
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
    failureSource: decisiveFailureEntry?.location || (pageErrorEntries.length ? 'page' : ''),
    visibleCount: visibleEntries.length,
    visibleSummary,
    callbackSummary,
    mainSummary,
    callbackStatusText: callbackEntries[0]?.text || '',
    callbackSubmittedText: callbackSubmittedEntries[0]?.text || '',
    callbackFailureText: callbackFailureEntries[0]?.text || '',
    mainStatusText: mainEntries[0]?.text || '',
    mainWaitingText: mainWaitingEntries[0]?.text || '',
    mainFailureText: mainFailureEntries[0]?.text || '',
    hasSuccessLikeVisibleBadge: successLikeEntries.length > 0,
    hasExactSuccessVisibleBadge: exactSuccessEntries.length > 0,
    hasCallbackSubmittedBadge: callbackSubmittedEntries.length > 0,
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
      callbackSummary,
      mainSummary,
      successLikeSummary,
      exactSuccessSummary,
      failureSummary,
      pageErrorSummary,
      errorStyledSummary,
    }),
    summary: selectedText
      ? `当前聚焦状态=${formatStep10StatusSummaryValue(selectedText)}；回调提示=${formatStep10StatusSummaryValue(callbackEntries[0]?.text || '')}；主状态=${formatStep10StatusSummaryValue(mainEntries[0]?.text || '')}；页面错误=${formatStep10StatusSummaryValue(pageErrorEntries[0]?.text || '')}；可见徽标 ${visibleEntries.length} 个：${visibleSummary}${extraFailureSuffix}${errorStyledSuffix}`
      : `当前未选中任何可见状态；回调提示=${formatStep10StatusSummaryValue(callbackEntries[0]?.text || '')}；主状态=${formatStep10StatusSummaryValue(mainEntries[0]?.text || '')}；页面错误=${formatStep10StatusSummaryValue(pageErrorEntries[0]?.text || '')}；可见徽标 ${visibleEntries.length} 个：${visibleSummary}${extraFailureSuffix}${errorStyledSuffix}；页面片段="${getInlineTextSnippet(pageSnippet, 120)}"`,
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

function extractStep10FailureDetail(statusText, sourceKind = '') {
  const text = normalizeStep9StatusText(statusText);
  if (!text) return '';
  if (sourceKind === 'callback' || isStep10CallbackFailureText(text)) {
    return text.replace(/^(?:回调\s*url\s*提交失败|回调url提交失败|提交回调失败)\s*[:：,，]?\s*/i, '').trim();
  }
  if (sourceKind === 'main' || isStep10MainFailureText(text)) {
    return text.replace(/^认证失败\s*[:：]?\s*/i, '').trim();
  }
  return text;
}

function explainStep10Failure(statusText, sourceKind = 'unknown') {
  const rawText = normalizeStep9StatusText(statusText);
  const detail = extractStep10FailureDetail(rawText, sourceKind) || rawText;
  const phaseLabel = sourceKind === 'callback'
    ? '回调提交阶段'
    : sourceKind === 'main'
      ? '认证结果阶段'
      : '页面状态阶段';

  const rules = [
    {
      code: 'callback_submit_api_unavailable',
      pattern: /请更新\s*cli\s*proxy\s*api\s*或检查连接/i,
      message: 'CPA 面板无法把回调提交给后台，通常是 CLI Proxy API 版本过旧、管理接口未启动，或当前面板与后端连接异常。',
    },
    {
      code: 'oauth_state_expired',
      pattern: /unknown or expired state/i,
      message: '当前 OAuth 会话在 CPA 中已不存在或已过期，通常是使用了旧回调链接、刷新过新的授权链接后仍提交旧链接，或 CPA 刚重启过。',
    },
    {
      code: 'oauth_not_pending',
      pattern: /oauth flow is not pending/i,
      message: '当前 OAuth 会话已经不在等待状态，通常是重复提交、提交过慢，或这轮认证此前已经结束。',
    },
    {
      code: 'callback_state_invalid',
      pattern: /invalid state|state is required|missing_state/i,
      message: '回调链接里的 state 缺失或无效，通常是复制了不完整的 localhost 回调链接，或提交了不属于这一轮的旧链接。',
    },
    {
      code: 'callback_missing_result',
      pattern: /code or error is required/i,
      message: '回调链接里既没有授权码，也没有错误信息，通常是复制的 localhost 回调链接不完整。',
    },
    {
      code: 'callback_invalid_url',
      pattern: /invalid redirect_url/i,
      message: '提交给 CPA 的回调链接格式无法解析，通常是粘贴内容不完整、带了多余字符，或并不是 localhost OAuth 回调地址。',
    },
    {
      code: 'callback_provider_mismatch',
      pattern: /provider does not match state/i,
      message: '这条回调不属于当前这次 Codex OAuth，会话与回调来源对不上，通常是混用了其他轮次或其他提供方的回调。',
    },
    {
      code: 'callback_persist_failed',
      pattern: /failed to persist oauth callback/i,
      message: 'CPA 已收到回调，但无法把回调结果写入本地缓存文件，通常是认证目录权限、磁盘或运行环境异常。',
    },
    {
      code: 'oauth_bad_request',
      pattern: /^bad request$/i,
      message: 'CPA 已收到回调，但 OpenAI OAuth 回调本身返回了错误。常见于用户取消授权、请求过期，或这条回调已经失效。',
    },
    {
      code: 'oauth_state_mismatch',
      pattern: /state code error/i,
      message: 'CPA 校验到回调里的 state 与当前 OAuth 会话不一致，通常是步骤 1 已刷新过新的授权链接，但步骤 10 仍提交旧回调。',
    },
    {
      code: 'oauth_code_exchange_failed',
      pattern: /failed to exchange authorization code for tokens/i,
      message: 'CPA 已收到授权码，但向 OpenAI 交换令牌失败。常见于 CPA 到 OpenAI 的网络或代理异常，或授权码已过期。',
    },
    {
      code: 'oauth_token_save_failed',
      pattern: /failed to save authentication tokens/i,
      message: 'CPA 已完成认证，但保存认证文件失败。常见于认证目录权限、磁盘写入，或 post-auth hook 异常。',
    },
    {
      code: 'oauth_callback_timeout',
      pattern: /timeout waiting for oauth callback|oauth flow timed out/i,
      message: 'CPA 长时间没有把这轮 OAuth 流程走完。常见于提交太晚、面板轮询异常，或后端状态没有及时刷新。',
    },
    {
      code: 'oauth_http_timeout',
      pattern: /timeout of \d+ms exceeded/i,
      message: 'CPA 面板在请求后台接口时超时，通常是 CLI Proxy API 响应过慢、接口未启动，或网络连接不稳定。',
    },
    {
      code: 'oauth_http_status_error',
      pattern: /request failed with status code \d+/i,
      message: 'CPA 面板请求后台接口时收到了异常 HTTP 状态码，通常是接口异常、反向代理配置错误，或当前会话已失效。',
    },
    {
      code: 'oauth_network_error',
      pattern: /network error|failed to fetch/i,
      message: 'CPA 面板与后台通信失败，通常是网络不通、管理接口未启动，或浏览器当前连接已断开。',
    },
  ];

  const matchedRule = rules.find((rule) => rule.pattern.test(detail) || rule.pattern.test(rawText));
  const message = matchedRule
    ? matchedRule.message
    : `CPA 在${phaseLabel}返回了未归类的失败，请结合面板原文进一步排查。`;

  return {
    code: matchedRule?.code || 'oauth_unknown_failure',
    phaseLabel,
    rawText,
    detail,
    userMessage: `CPA 在${phaseLabel}返回失败：${message} 面板原文：${rawText}`,
  };
}

async function waitForExactSuccessBadge(timeout = STEP9_SUCCESS_BADGE_TIMEOUT_MS) {
  const start = Date.now();
  let lastDiagnosticsSignature = '';
  let lastHeartbeatLoggedAt = 0;
  let lastCallbackSubmittedSignature = '';
  let lastSuccessFailureConflictSignature = '';

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const diagnostics = getStatusBadgeDiagnostics();
    const elapsed = Date.now() - start;

    if (diagnostics.signature !== lastDiagnosticsSignature) {
      lastDiagnosticsSignature = diagnostics.signature;
      lastHeartbeatLoggedAt = elapsed;
      log(`步骤 10：认证状态检测中，${diagnostics.summary}`);
      console.log(LOG_PREFIX, '[Step 9] status badge diagnostics changed', diagnostics);
    } else if (elapsed - lastHeartbeatLoggedAt >= 10000) {
      lastHeartbeatLoggedAt = elapsed;
      log(`步骤 10：仍在等待认证成功，${diagnostics.summary}`);
      console.log(LOG_PREFIX, '[Step 9] still waiting for success badge', diagnostics);
    }

    if (diagnostics.hasCallbackSubmittedBadge && !diagnostics.hasExactSuccessVisibleBadge) {
      const callbackSubmittedSignature = JSON.stringify({
        callbackStatusText: diagnostics.callbackStatusText,
        mainStatusText: diagnostics.mainStatusText,
      });
      if (callbackSubmittedSignature !== lastCallbackSubmittedSignature) {
        lastCallbackSubmittedSignature = callbackSubmittedSignature;
        log(
          `步骤 10：CPA 已接受 localhost 回调，正在等待后台完成认证。回调提示=${formatStep10StatusSummaryValue(diagnostics.callbackStatusText)}；主状态=${formatStep10StatusSummaryValue(diagnostics.mainStatusText)}`,
          'info'
        );
        console.info(LOG_PREFIX, '[Step 9] callback accepted and waiting for auth completion', diagnostics);
      }
    }

    if (isStep10BrowserSwitchRequiredConflict(diagnostics)) {
      const browserSwitchMessage = getStep10BrowserSwitchRequiredMessage(diagnostics);
      log(`步骤 10：${browserSwitchMessage}`, 'error');
      console.error(LOG_PREFIX, '[Step 9] browser-switch conflict detected', diagnostics);
      throw new Error(`BROWSER_SWITCH_REQUIRED::${browserSwitchMessage}`);
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
          `步骤 10：同时检测到成功徽标和失败提示，本轮不判定成功。成功徽标：${diagnostics.exactSuccessSummary}；失败提示：${failureSummary}`,
          'warn'
        );
        console.warn(LOG_PREFIX, '[Step 9] success badge is blocked by visible failure', diagnostics);
      }
    }

    if (diagnostics.failureText) {
      const failureExplanation = explainStep10Failure(diagnostics.failureText, diagnostics.failureSource || 'unknown');
      if (isOAuthCallbackTimeoutFailure(diagnostics.failureText)) {
        throw new Error(`STEP9_OAUTH_TIMEOUT::${failureExplanation.userMessage}`);
      }
      throw new Error(`STEP9_OAUTH_RETRY::${failureExplanation.userMessage}`);
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
    const failureExplanation = explainStep10Failure(finalText, finalDiagnostics.failureSource || 'main');
    throw new Error(`STEP9_OAUTH_TIMEOUT::${failureExplanation.userMessage}${diagnosticsSuffix}`);
  }
  if (isStep9FailureText(finalText)) {
    const failureExplanation = explainStep10Failure(finalText, finalDiagnostics.failureSource || 'unknown');
    throw new Error(`STEP9_OAUTH_RETRY::${failureExplanation.userMessage}${diagnosticsSuffix}`);
  }
  if (finalDiagnostics.hasCallbackSubmittedBadge || finalDiagnostics.mainWaitingText) {
    throw new Error(
      'STEP9_OAUTH_TIMEOUT::CPA 已接受回调，但 120 秒内仍未进入认证成功状态。通常是 CPA 后台处理过慢、面板轮询异常，或 CPA 到 OpenAI 的网络/代理存在问题。'
      + diagnosticsSuffix
    );
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

function findCodexOAuthCard() {
  const header = findCodexOAuthHeader();
  return header?.closest('.card, [class*="card"]') || header || null;
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
// 步骤 10：CPA 回调验证——填写 localhost 回调地址并提交
// ============================================================

async function step9_vpsVerify(payload) {
  await ensureOAuthManagementPage(payload?.vpsPassword, 9);

  // 优先从 payload 读取 localhostUrl；没有时再回退到全局状态
  let localhostUrl = payload?.localhostUrl;
  if (localhostUrl && !isLocalhostOAuthCallbackUrl(localhostUrl)) {
    throw new Error('步骤 10 只接受真实的 localhost OAuth 回调地址，请重新执行步骤 9。');
  }
  if (!localhostUrl) {
    log('步骤 10：payload 中没有 localhostUrl，正在从状态中读取...');
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    localhostUrl = state.localhostUrl;
    if (localhostUrl && !isLocalhostOAuthCallbackUrl(localhostUrl)) {
      throw new Error('步骤 10 只接受真实的 localhost OAuth 回调地址，请重新执行步骤 9。');
    }
  }
  if (!localhostUrl) {
    throw new Error('未找到 localhost 回调地址，请先完成步骤 8。');
  }
  log(`步骤 10：已获取 localhostUrl：${localhostUrl.slice(0, 60)}...`);

  log('步骤 10：正在查找回调地址输入框...');

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
  log(`步骤 10：已填写回调地址：${localhostUrl.slice(0, 80)}...`);

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
  log('步骤 10：已点击回调提交按钮，正在等待认证结果...');

  const verifiedStatus = await waitForExactSuccessBadge();
  log(`步骤 10：${verifiedStatus}`, 'ok');
  reportComplete(10, { localhostUrl, verifiedStatus });
}
