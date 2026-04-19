// content/mail-2925.js — Content script for 2925 Mail (steps 4, 7)
// Injected dynamically on: 2925.com

const MAIL2925_PREFIX = '[MultiPage:mail-2925]';
const isTopFrame = window === window.top;

console.log(MAIL2925_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

if (!isTopFrame) {
  console.log(MAIL2925_PREFIX, 'Skipping child frame');
} else {

let seenCodes = new Set();

async function loadSeenCodes() {
  try {
    const data = await chrome.storage.session.get('seen2925Codes');
    if (data.seen2925Codes && Array.isArray(data.seen2925Codes)) {
      seenCodes = new Set(data.seen2925Codes);
      console.log(MAIL2925_PREFIX, `Loaded ${seenCodes.size} previously seen codes`);
    }
  } catch (err) {
    console.warn(MAIL2925_PREFIX, 'Session storage unavailable, using in-memory seen codes:', err?.message || err);
  }
}

loadSeenCodes();

async function persistSeenCodes() {
  try {
    await chrome.storage.session.set({ seen2925Codes: [...seenCodes] });
  } catch (err) {
    console.warn(MAIL2925_PREFIX, 'Could not persist seen codes, continuing in-memory only:', err?.message || err);
  }
}

const MAIL2925_API_LIST_PATH = '/mailv2/maildata/MailList/mails';

function getCookieValue(name) {
  const prefix = `${name}=`;
  return (document.cookie || '')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    const utf8 = decodeURIComponent(
      Array.from(decoded)
        .map(ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(utf8);
  } catch (err) {
    console.warn(MAIL2925_PREFIX, 'Failed to decode jwt payload:', err?.message || err);
    return null;
  }
}

function get2925AuthContext() {
  const token = getCookieValue('jwt_token')
    || localStorage.getItem('jwt_token')
    || sessionStorage.getItem('jwt_token')
    || '';

  const payload = decodeJwtPayload(token);
  const accountName = String(
    payload?.name
    || payload?.accountName
    || payload?.account
    || localStorage.getItem('account')
    || localStorage.getItem('accountName')
    || sessionStorage.getItem('account')
    || sessionStorage.getItem('accountName')
    || ''
  ).trim();

  return { token, accountName };
}

function normalizeApiMail(mail = {}) {
  return {
    id: String(mail.messageId || mail.mailId || ''),
    timestamp: Number(mail.date ? new Date(mail.date).getTime() : 0) || 0,
    subject: String(mail.subject || ''),
    preview: String(mail.text || ''),
    fromName: String(mail.fromName || ''),
    from: String(mail.from || ''),
    to: String(mail.to || ''),
  };
}

function buildApiMailText(mail = {}) {
  return [
    mail.subject || '',
    mail.preview || '',
    mail.fromName || '',
    mail.from || '',
    mail.to || '',
  ].join(' ');
}

async function fetch2925MailListPage({ accountName, pageIndex = 1, pageCount = 25, filterType = 0, folder = 'Inbox' }) {
  const { token } = get2925AuthContext();
  if (!token) {
    throw new Error('2925 页面缺少 jwt_token，无法直接调用邮件列表接口。');
  }
  if (!accountName) {
    throw new Error('2925 页面缺少账号信息，无法直接调用邮件列表接口。');
  }

  const params = new URLSearchParams({
    Folder: folder,
    MailBox: accountName,
    FilterType: String(filterType),
    PageIndex: String(pageIndex),
    PageCount: String(pageCount),
  });

  const response = await fetch(`${MAIL2925_API_LIST_PATH}?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error(`2925 邮件列表接口返回 HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result?.code !== 200) {
    throw new Error(`2925 邮件列表接口返回异常：${result?.message || result?.code || 'unknown'}`);
  }

  return Array.isArray(result?.result?.pageData) ? result.result.pageData : [];
}

async function handleApiMailMatch({
  step,
  mail,
  filterAfterMinute,
  existingMailIds,
  useFallback,
  excludedCodeSet,
  strictChatGPTCodeOnly,
  targetEmail,
  senderFilters,
  subjectFilters,
}) {
  const normalizedMail = normalizeApiMail(mail);
  const itemMinute = normalizeMinuteTimestamp(normalizedMail.timestamp || 0);
  const passesTimeFilter = !filterAfterMinute || (itemMinute && itemMinute >= filterAfterMinute);
  const shouldBypassOldSnapshot = Boolean(filterAfterMinute && passesTimeFilter && itemMinute > 0);

  if (!passesTimeFilter) {
    return null;
  }

  if (!useFallback && !shouldBypassOldSnapshot && normalizedMail.id && existingMailIds.has(normalizedMail.id)) {
    return null;
  }

  const text = buildApiMailText(normalizedMail);
  if (!matchesMailFilters(text, senderFilters, subjectFilters)) {
    return null;
  }

  const targetState = getTargetEmailMatchState(text, targetEmail);
  const previewEmails = extractEmails(text);
  if (targetEmail && previewEmails.length > 0 && !targetState.matches) {
    return null;
  }

  const code = extractVerificationCode(text, strictChatGPTCodeOnly);
  if (!code || !targetState.matches) {
    return null;
  }

  if (excludedCodeSet.has(code)) {
    log(`步骤 ${step}：跳过排除的验证码：${code}`, 'info');
    return null;
  }
  if (seenCodes.has(code)) {
    log(`步骤 ${step}：跳过已处理过的验证码：${code}`, 'info');
    return null;
  }

  seenCodes.add(code);
  persistSeenCodes();
  const source = useFallback && normalizedMail.id && existingMailIds.has(normalizedMail.id) ? '回退匹配邮件(API)' : '新邮件(API)';
  const timeLabel = normalizedMail.timestamp
    ? `，时间：${new Date(normalizedMail.timestamp).toLocaleString('zh-CN', { hour12: false })}`
    : '';
  log(`步骤 ${step}：已通过 2925 接口找到验证码：${code}（来源：${source}${timeLabel}）`, 'ok');
  return { ok: true, code, emailTimestamp: Date.now() };
}

async function pollEmailFromApi(step, payload) {
  const {
    senderFilters,
    subjectFilters,
    maxAttempts,
    intervalMs,
    filterAfterTimestamp = 0,
    excludeCodes = [],
    strictChatGPTCodeOnly = false,
    targetEmail = '',
  } = payload;

  const { accountName } = get2925AuthContext();
  if (!accountName) {
    throw new Error('2925 页面当前无法识别登录账号。');
  }

  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));
  const filterAfterMinute = normalizeMinuteTimestamp(Number(filterAfterTimestamp) || 0);

  log(`步骤 ${step}：优先通过 2925 邮件列表接口轮询（最多 ${maxAttempts} 次）`);
  if (document.hidden) {
    log(`步骤 ${step}：检测到 2925 标签页当前处于后台隐藏状态，已切换为接口轮询，避免依赖前台渲染。`, 'info');
  }

  const initialPage = await fetch2925MailListPage({ accountName });
  const initialMails = initialPage.map(normalizeApiMail);
  const existingMailIds = new Set(initialMails.map(mail => mail.id).filter(Boolean));

  log(`步骤 ${step}：2925 接口已返回 ${initialMails.length} 封邮件，已记录 ${existingMailIds.size} 封旧邮件快照`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`步骤 ${step}：正在通过 2925 接口轮询，第 ${attempt}/${maxAttempts} 次`);

    const pageData = await fetch2925MailListPage({ accountName });
    const mails = pageData.map(normalizeApiMail);
    const useFallback = attempt > FALLBACK_AFTER;

    for (const mail of mails) {
      const matched = await handleApiMailMatch({
        step,
        mail,
        filterAfterMinute,
        existingMailIds,
        useFallback,
        excludedCodeSet,
        strictChatGPTCodeOnly,
        targetEmail,
        senderFilters,
        subjectFilters,
      });
      if (matched) {
        return matched;
      }
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`步骤 ${step}：接口连续 ${FALLBACK_AFTER} 次未发现新邮件，开始回退检查首封匹配邮件`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${(maxAttempts * intervalMs / 1000).toFixed(0)} 秒后仍未通过 2925 接口找到新的匹配邮件。`
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    resetStopState();
    handlePollEmail(message.step, message.payload).then(result => {
      sendResponse(result);
    }).catch(err => {
      if (isStopError(err)) {
        log(`步骤 ${message.step}：已被用户停止。`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      log(`步骤 ${message.step}：邮箱轮询失败：${err.message}`, 'warn');
      sendResponse({ error: err.message });
    });
    return true;
  }
});

const MAIL_ITEM_SELECTORS = [
  '.mail-item',
  '.letter-item',
  '[class*="mailItem"]',
  '[class*="mail-item"]',
  '[class*="MailItem"]',
  '.el-table__row',
  'tr[class*="mail"]',
  '[class*="listItem"]',
  '[class*="list-item"]',
  'li[class*="mail"]',
];

function findMailItems() {
  for (const selector of MAIL_ITEM_SELECTORS) {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      return Array.from(items);
    }
  }
  return [];
}

function getMailItemText(item) {
  if (!item) return '';
  const contentCell = item.querySelector('td.content, .content, .mail-content');
  const titleEl = item.querySelector('.mail-content-title');
  const textEl = item.querySelector('.mail-content-text');
  return [
    titleEl?.getAttribute('title') || '',
    titleEl?.textContent || '',
    textEl?.textContent || '',
    contentCell?.textContent || '',
    item.textContent || '',
  ].join(' ');
}

function getMailItemTimeText(item) {
  const timeEl = item?.querySelector('.date-time-text, [class*="date-time"], [class*="time"], td.time');
  return (timeEl?.textContent || '').replace(/\s+/g, ' ').trim();
}

function normalizeMailIdentityPart(value) {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getMailItemId(item, index = 0) {
  const candidates = [
    item?.getAttribute?.('data-id'),
    item?.dataset?.id,
    item?.getAttribute?.('data-mail-id'),
    item?.dataset?.mailId,
    item?.getAttribute?.('data-key'),
    item?.getAttribute?.('key'),
  ].filter(Boolean);

  if (candidates.length > 0) {
    return String(candidates[0]);
  }

  return [
    index,
    normalizeMailIdentityPart(getMailItemTimeText(item)),
    normalizeMailIdentityPart(getMailItemText(item)).slice(0, 240),
  ].join('|');
}

function getCurrentMailIds(items = []) {
  const ids = new Set();
  items.forEach((item, index) => {
    ids.add(getMailItemId(item, index));
  });
  return ids;
}

function normalizeMinuteTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.getTime();
}

function matchesMailFilters(text, senderFilters, subjectFilters) {
  const lower = (text || '').toLowerCase();
  const senderMatch = senderFilters.some(filter => lower.includes(filter.toLowerCase()));
  const subjectMatch = subjectFilters.some(filter => lower.includes(filter.toLowerCase()));
  return senderMatch || subjectMatch;
}

function extractVerificationCode(text, strictChatGPTCodeOnly = false) {
  if (strictChatGPTCodeOnly) {
    const strictMatch = text.match(/your\s+chatgpt\s+code\s+is\s+(\d{6})/i);
    return strictMatch ? strictMatch[1] : null;
  }

  const matchCn = text.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/);
  if (matchCn) return matchCn[1];

  const matchChatGPT = text.match(/your\s+chatgpt\s+code\s+is\s+(\d{6})/i);
  if (matchChatGPT) return matchChatGPT[1];

  const matchEn = text.match(/code[:\s]+is[:\s]+(\d{6})|code[:\s]+(\d{6})/i);
  if (matchEn) return matchEn[1] || matchEn[2];

  const match6 = text.match(/\b(\d{6})\b/);
  if (match6) return match6[1];

  return null;
}

function extractEmails(text) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  return [...new Set(matches.map(item => item.toLowerCase()))];
}

function emailMatchesTarget(candidate, targetEmail) {
  const normalizedCandidate = String(candidate || '').trim().toLowerCase();
  const normalizedTarget = String(targetEmail || '').trim().toLowerCase();
  return Boolean(normalizedCandidate && normalizedTarget && normalizedCandidate === normalizedTarget);
}

function getTargetEmailMatchState(text, targetEmail) {
  const normalizedTarget = String(targetEmail || '').trim().toLowerCase();
  if (!normalizedTarget) {
    return { matches: true, hasExplicitEmail: false };
  }

  const normalizedText = String(text || '').toLowerCase();
  if (normalizedText.includes(normalizedTarget)) {
    return { matches: true, hasExplicitEmail: true };
  }

  const atIndex = normalizedTarget.indexOf('@');
  if (atIndex > 0) {
    const encodedTarget = `${normalizedTarget.slice(0, atIndex)}=${normalizedTarget.slice(atIndex + 1)}`;
    if (normalizedText.includes(encodedTarget)) {
      return { matches: true, hasExplicitEmail: true };
    }
  }

  const emails = extractEmails(text);
  if (!emails.length) {
    return { matches: false, hasExplicitEmail: false };
  }

  return {
    matches: emails.some(email => emailMatchesTarget(email, normalizedTarget)),
    hasExplicitEmail: true,
  };
}

function parseMailItemTimestamp(item) {
  const timeText = getMailItemTimeText(item);
  if (!timeText) return null;

  const now = new Date();
  const date = new Date(now);
  let match = null;

  if (/刚刚/.test(timeText)) {
    return now.getTime();
  }

  match = timeText.match(/(\d+)\s*分(?:钟)?前/);
  if (match) {
    return now.getTime() - Number(match[1]) * 60 * 1000;
  }

  match = timeText.match(/(\d+)\s*秒前/);
  if (match) {
    return now.getTime() - Number(match[1]) * 1000;
  }

  match = timeText.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date.getTime();
  }

  match = timeText.match(/今天\s*(\d{1,2}):(\d{2})/);
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date.getTime();
  }

  match = timeText.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (match) {
    date.setDate(date.getDate() - 1);
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date.getTime();
  }

  match = timeText.match(/(\d{1,2})-(\d{1,2})\s*(\d{1,2}):(\d{2})/);
  if (match) {
    date.setMonth(Number(match[1]) - 1, Number(match[2]));
    date.setHours(Number(match[3]), Number(match[4]), 0, 0);
    return date.getTime();
  }

  match = timeText.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*(\d{1,2}):(\d{2})/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      0,
      0
    ).getTime();
  }

  return null;
}

async function sleepRandom(minMs, maxMs = minMs) {
  const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(duration);
}

async function refreshInbox() {
  const refreshBtn = document.querySelector(
    '[class*="refresh"], [title*="刷新"], [aria-label*="刷新"], [class*="Refresh"]'
  );
  if (refreshBtn) {
    simulateClick(refreshBtn);
    await sleepRandom(700, 1200);
    return;
  }

  const inboxLink = document.querySelector(
    'a[href*="mailList"], [class*="inbox"], [class*="Inbox"], [title*="收件箱"]'
  );
  if (inboxLink) {
    simulateClick(inboxLink);
    await sleepRandom(700, 1200);
  }
}

async function pollEmailFromDom(step, payload) {
  const {
    senderFilters,
    subjectFilters,
    maxAttempts,
    intervalMs,
    filterAfterTimestamp = 0,
    excludeCodes = [],
    strictChatGPTCodeOnly = false,
    targetEmail = '',
  } = payload;
  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));
  const filterAfterMinute = normalizeMinuteTimestamp(Number(filterAfterTimestamp) || 0);

  log(`步骤 ${step}：开始轮询 2925 邮箱（最多 ${maxAttempts} 次）`);
  if (filterAfterMinute) {
    log(`步骤 ${step}：仅尝试 ${new Date(filterAfterMinute).toLocaleString('zh-CN', { hour12: false })} 及之后时间的邮件。`);
  }

  let initialItems = [];
  for (let i = 0; i < 20; i++) {
    initialItems = findMailItems();
    if (initialItems.length > 0) break;
    await sleep(500);
  }

  if (initialItems.length === 0) {
    await refreshInbox();
    await sleep(2000);
    initialItems = findMailItems();
  }

  if (initialItems.length === 0) {
    throw new Error('2925 邮箱列表未加载完成，请确认当前已打开收件箱。');
  }

  const existingMailIds = getCurrentMailIds(initialItems);
  log(`步骤 ${step}：邮件列表已加载，共 ${initialItems.length} 封邮件`);
  log(`步骤 ${step}：已记录当前 ${existingMailIds.size} 封旧邮件快照`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`步骤 ${step}：正在轮询 2925 邮箱，第 ${attempt}/${maxAttempts} 次`);

    if (attempt > 1) {
      await refreshInbox();
      await sleepRandom(900, 1500);
    }

    const items = findMailItems();
    if (items.length > 0) {
      const useFallback = attempt > FALLBACK_AFTER;

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const itemId = getMailItemId(item, index);
        const itemTimestamp = parseMailItemTimestamp(item);
        const itemMinute = normalizeMinuteTimestamp(itemTimestamp || 0);
        const passesTimeFilter = !filterAfterMinute || (itemMinute && itemMinute >= filterAfterMinute);
        const shouldBypassOldSnapshot = Boolean(filterAfterMinute && passesTimeFilter && itemMinute > 0);

        if (!passesTimeFilter) {
          continue;
        }

        if (!useFallback && !shouldBypassOldSnapshot && existingMailIds.has(itemId)) {
          continue;
        }

        const text = getMailItemText(item);
        if (!matchesMailFilters(text, senderFilters, subjectFilters)) {
          continue;
        }

        const previewEmails = extractEmails(text);
        const previewTargetState = getTargetEmailMatchState(text, targetEmail);
        const previewMatchesTarget = previewTargetState.matches;
        if (targetEmail && previewEmails.length > 0 && !previewMatchesTarget) {
          continue;
        }

        const code = extractVerificationCode(text, strictChatGPTCodeOnly);
        if (code && previewMatchesTarget) {
          if (excludedCodeSet.has(code)) {
            log(`步骤 ${step}：跳过排除的验证码：${code}`, 'info');
            continue;
          }
          if (seenCodes.has(code)) {
            log(`步骤 ${step}：跳过已处理过的验证码：${code}`, 'info');
            continue;
          }
          seenCodes.add(code);
          persistSeenCodes();
          const source = useFallback && existingMailIds.has(itemId) ? '回退匹配邮件' : '新邮件';
          const timeLabel = itemTimestamp ? `，时间：${new Date(itemTimestamp).toLocaleString('zh-CN', { hour12: false })}` : '';
          log(`步骤 ${step}：已找到验证码：${code}（来源：${source}${timeLabel}）`, 'ok');
          await sleep(1000);
          return { ok: true, code, emailTimestamp: Date.now() };
        }

        simulateClick(item);
        await sleepRandom(1200, 2200);
        const openedText = document.body?.textContent || '';
        const bodyCode = extractVerificationCode(openedText, strictChatGPTCodeOnly);
        const openedTargetState = getTargetEmailMatchState(openedText, targetEmail);
        if (targetEmail && openedTargetState.hasExplicitEmail && !openedTargetState.matches) {
          continue;
        }
        if (bodyCode) {
          if (excludedCodeSet.has(bodyCode)) {
            log(`步骤 ${step}：跳过排除的验证码：${bodyCode}`, 'info');
            continue;
          }
          if (seenCodes.has(bodyCode)) {
            log(`步骤 ${step}：跳过已处理过的验证码：${bodyCode}`, 'info');
            continue;
          }
          seenCodes.add(bodyCode);
          persistSeenCodes();
          const source = useFallback && existingMailIds.has(itemId) ? '回退匹配邮件正文' : '新邮件正文';
          const timeLabel = itemTimestamp ? `，时间：${new Date(itemTimestamp).toLocaleString('zh-CN', { hour12: false })}` : '';
          log(`步骤 ${step}：已在邮件正文中找到验证码：${bodyCode}（来源：${source}${timeLabel}）`, 'ok');
          await sleep(1000);
          return { ok: true, code: bodyCode, emailTimestamp: Date.now() };
        }
      }
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`步骤 ${step}：连续 ${FALLBACK_AFTER} 次未发现新邮件，开始回退到首封匹配邮件`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleepRandom(intervalMs, intervalMs + 1200);
    }
  }

  throw new Error(
    `${(maxAttempts * intervalMs / 1000).toFixed(0)} 秒后仍未在 2925 邮箱中找到新的匹配邮件。请手动检查收件箱。`
  );
}

async function handlePollEmail(step, payload) {
  try {
    return await pollEmailFromApi(step, payload);
  } catch (err) {
    log(`步骤 ${step}：2925 接口轮询不可用，回退到页面轮询：${err.message}`, 'warn');
    return await pollEmailFromDom(step, payload);
  }
}

}
