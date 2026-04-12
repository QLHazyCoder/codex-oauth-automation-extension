// content/inbucket-mail.js — Content script for Inbucket polling (steps 4, 7)
// Injected dynamically on the configured Inbucket host
//
// Supported page:
// - /m/<mailbox>/

const INBUCKET_PREFIX = '[MultiPage:inbucket-mail]';
const isTopFrame = window === window.top;
const SEEN_MAIL_IDS_KEY = 'seenInbucketMailIds';

console.log(INBUCKET_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

if (!isTopFrame) {
  console.log(INBUCKET_PREFIX, 'Skipping child frame');
} else {

let seenMailIds = new Set();

async function loadSeenMailIds() {
  try {
    const data = await chrome.storage.session.get(SEEN_MAIL_IDS_KEY);
    if (Array.isArray(data[SEEN_MAIL_IDS_KEY])) {
      seenMailIds = new Set(data[SEEN_MAIL_IDS_KEY]);
      console.log(INBUCKET_PREFIX, `Loaded ${seenMailIds.size} previously seen mail ids`);
    }
  } catch (err) {
    console.warn(INBUCKET_PREFIX, 'Session storage unavailable, using in-memory seen mail ids:', err?.message || err);
  }
}

async function persistSeenMailIds() {
  try {
    await chrome.storage.session.set({ [SEEN_MAIL_IDS_KEY]: [...seenMailIds] });
  } catch (err) {
    console.warn(INBUCKET_PREFIX, 'Could not persist seen mail ids, continuing in-memory only:', err?.message || err);
  }
}

loadSeenMailIds();

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

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractVerificationCode(text) {
  const matchCn = text.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/);
  if (matchCn) return matchCn[1];

  const matchEn = text.match(/code[:\s]+is[:\s]+(\d{6})|code[:\s]+(\d{6})/i);
  if (matchEn) return matchEn[1] || matchEn[2];

  const match6 = text.match(/\b(\d{6})\b/);
  if (match6) return match6[1];

  return null;
}

function rowMatchesFilters(mail, senderFilters, subjectFilters, targetEmail) {
  const sender = normalizeText(mail.sender);
  const subject = normalizeText(mail.subject);
  const mailbox = normalizeText(mail.mailbox);
  const combined = normalizeText(mail.combinedText);
  const targetLocal = normalizeText((targetEmail || '').split('@')[0]);

  const senderMatch = senderFilters.some(f => sender.includes(f.toLowerCase()) || combined.includes(f.toLowerCase()));
  const subjectMatch = subjectFilters.some(f => subject.includes(f.toLowerCase()) || combined.includes(f.toLowerCase()));
  const mailboxMatch = Boolean(targetLocal) && mailbox.includes(targetLocal);
  const forwardedDuck = /duckduckgo|forward(?:ed)?\s*by/i.test(mail.combinedText);
  const code = extractVerificationCode(mail.combinedText);
  const keywordMatch = /openai|chatgpt|verify|verification|confirm|login|验证码|代码/.test(combined);

  if (mailboxMatch) return { matched: true, mailboxMatch, code };
  if (senderMatch || subjectMatch) return { matched: true, mailboxMatch: false, code };
  if (code && (forwardedDuck || keywordMatch)) return { matched: true, mailboxMatch: false, code };

  return { matched: false, mailboxMatch: false, code };
}

function findMailboxEntries() {
  return document.querySelectorAll('.message-list-entry');
}

function getMailboxEntryId(entry, index = 0) {
  const explicitId = entry.getAttribute('data-id') || entry.dataset?.id || '';
  if (explicitId) return explicitId;

  const subject = entry.querySelector('.subject')?.textContent?.trim() || '';
  const sender = entry.querySelector('.from')?.textContent?.trim() || '';
  const dateText = entry.querySelector('.date')?.textContent?.trim() || '';

  return `mailbox:${index}:${normalizeText(subject)}|${normalizeText(sender)}|${normalizeText(dateText)}`;
}

function parseMailboxEntry(entry, index = 0) {
  const subject = entry.querySelector('.subject')?.textContent?.trim() || '';
  const sender = entry.querySelector('.from')?.textContent?.trim() || '';
  const dateText = entry.querySelector('.date')?.textContent?.trim() || '';
  const combinedText = [subject, sender, dateText].filter(Boolean).join(' ');

  return {
    entry,
    dateText,
    sender,
    mailbox: '',
    subject,
    unread: entry.classList.contains('unseen'),
    combinedText,
    mailId: getMailboxEntryId(entry, index),
  };
}

function getCurrentMailboxIds() {
  const ids = new Set();
  Array.from(findMailboxEntries()).forEach((entry, index) => {
    ids.add(getMailboxEntryId(entry, index));
  });
  return ids;
}

async function refreshMailbox() {
  const refreshButton = document.querySelector(
    'button[alt="Refresh Mailbox"], button[title*="Refresh"], button[aria-label*="Refresh"], button[alt*="刷新"], button[title*="刷新"], button[aria-label*="刷新"]'
  );
  if (!refreshButton) return;

  simulateClick(refreshButton);
  await sleep(800);
}

async function openMailboxEntry(entry) {
  simulateClick(entry);

  for (let i = 0; i < 20; i++) {
    if (entry.classList.contains('selected') || document.querySelector('.message-header, .message-body, .button-bar')) {
      return;
    }
    await sleep(150);
  }
}

async function deleteCurrentMailboxMessage(step) {
  try {
    const deleteButton = await waitForElement('.button-bar button.danger', 5000);
    simulateClick(deleteButton);
    log(`步骤 ${step}：已删除邮箱消息`, 'ok');
    await sleep(1200);
  } catch (err) {
    log(`步骤 ${step}：删除邮箱消息失败：${err.message}`, 'warn');
  }
}

async function handleMailboxPollEmail(step, payload) {
  const {
    senderFilters = [],
    subjectFilters = [],
    maxAttempts = 20,
    intervalMs = 3000,
    excludeCodes = [],
  } = payload || {};
  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));

  log(`步骤 ${step}：开始轮询 Inbucket 邮箱页面（最多 ${maxAttempts} 次）`);

  try {
    await waitForElement('.message-list, .message-list-entry', 15000);
    log(`步骤 ${step}：邮箱页面已加载`);
  } catch {
    throw new Error('Inbucket 邮箱页面未加载完成，请确认已打开 /m/<mailbox>/ 页面。');
  }

  const existingMailIds = getCurrentMailboxIds();
  log(`步骤 ${step}：已记录当前 ${existingMailIds.size} 封旧消息快照`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`步骤 ${step}：正在轮询 Inbucket 邮箱，第 ${attempt}/${maxAttempts} 次`);

    if (attempt > 1) {
      await refreshMailbox();
    }

    const entries = Array.from(findMailboxEntries()).map(parseMailboxEntry);
    const useFallback = attempt > FALLBACK_AFTER;
    const candidates = [];

    for (const mail of entries) {
      if (!mail.unread) continue;
      if (seenMailIds.has(mail.mailId)) continue;
      if (!useFallback && existingMailIds.has(mail.mailId)) continue;

      const match = rowMatchesFilters(mail, senderFilters, subjectFilters, '');
      if (!match.matched) continue;

      candidates.push({ ...mail, code: match.code });
    }

    for (const mail of candidates) {
      const code = mail.code || extractVerificationCode(mail.combinedText);
      if (!code) continue;
      if (excludedCodeSet.has(code)) {
        log(`步骤 ${step}：跳过排除的验证码：${code}`, 'info');
        continue;
      }

      await openMailboxEntry(mail.entry);
      await deleteCurrentMailboxMessage(step);

      seenMailIds.add(mail.mailId);
      await persistSeenMailIds();

      const source = existingMailIds.has(mail.mailId) ? '回退匹配邮件' : '新邮件';
      log(
        `步骤 ${step}：已找到验证码：${code}（来源：${source}，发件人：${mail.sender || '未知'}，主题：${(mail.subject || '').slice(0, 60)}）`,
        'ok'
      );

      return {
        ok: true,
        code,
        emailTimestamp: Date.now(),
        mailId: mail.mailId,
      };
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`步骤 ${step}：暂未发现新消息，开始回退到较早的匹配邮件`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${(maxAttempts * intervalMs / 1000).toFixed(0)} 秒后仍未在 Inbucket 邮箱中找到匹配的验证码邮件。` +
    '请手动检查邮箱页面。'
  );
}

async function handlePollEmail(step, payload) {
  if (!location.pathname.startsWith('/m/')) {
    throw new Error('当前 Inbucket 仅支持 /m/<mailbox>/ 这种邮箱页面。');
  }
  return handleMailboxPollEmail(step, payload);
}

} // end of isTopFrame else block
