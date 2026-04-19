// content/gmail-mail.js — Content script for Gmail (steps 4, 7)
// Injected on: mail.google.com
//
// Strategy:
// 1. Snapshot currently visible conversation IDs
// 2. Use a MutationObserver to detect newly inserted rows the instant Gmail
//    pushes them into the DOM — far faster than waiting for the next refresh
//    tick (Gmail's live push typically delivers within <1s of arrival).
// 3. In parallel, run a polling loop that periodically clicks Refresh as a
//    fallback for the rare case where Gmail's live channel is stale.
// 4. After a few refresh rounds, widen the filter (fallback mode) so that
//    rows which were snapshotted as "old" can still participate (useful when
//    the code email landed right before we started polling).
//
// flowStartTime-scoped seenMailIds:
//   Each signup/login flow gets a distinct flowStartTime. We persist processed
//   Gmail mailIds (not 6-digit codes) so the same row won't be re-consumed on
//   fallback / refresh rounds, while still allowing two different emails to
//   carry the same verification code.

const GMAIL_PREFIX = '[MultiPage:gmail-mail]';
const isTopFrame = window === window.top;
let seenMailIds = new Set();
let seenMailIdsFlowId = null;

console.log(GMAIL_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

async function loadSeenMailIds() {
  try {
    const data = await chrome.storage.session.get(['seenGmailMailIds', 'seenGmailMailIdsFlowId']);
    if (data.seenGmailMailIds && Array.isArray(data.seenGmailMailIds)) {
      seenMailIds = new Set(data.seenGmailMailIds);
      console.log(GMAIL_PREFIX, `Loaded ${seenMailIds.size} previously seen Gmail mail ids`);
    }
    if (Number.isFinite(Number(data.seenGmailMailIdsFlowId))) {
      seenMailIdsFlowId = Number(data.seenGmailMailIdsFlowId);
    }
  } catch (err) {
    console.warn(GMAIL_PREFIX, 'Session storage unavailable, using in-memory Gmail seen mail ids:', err?.message || err);
  }
}

loadSeenMailIds();

async function persistSeenMailIds() {
  try {
    await chrome.storage.session.set({
      seenGmailMailIds: [...seenMailIds],
      seenGmailMailIdsFlowId: seenMailIdsFlowId,
    });
  } catch (err) {
    console.warn(GMAIL_PREFIX, 'Could not persist Gmail seen mail ids, continuing in-memory only:', err?.message || err);
  }
}

// 当注册/登录流程切换（flowStartTime 变化）时，把 seenMailIds 清空。
// 背景：Gmail 可能连续收到两封不同邮件但验证码相同；若按 code 去重会把后一封
// 误判为"已见过"。改成按 mailId 去重后，只需在跨流程时清空已处理邮件集合。
async function ensureSeenMailIdsScopedTo(flowStartTime) {
  const next = Number(flowStartTime) || 0;
  if (!next) return; // 兼容旧 payload：没有 flowStartTime 则保留原行为
  if (seenMailIdsFlowId === next) return;
  seenMailIds = new Set();
  seenMailIdsFlowId = next;
  try {
    await chrome.storage.session.set({
      seenGmailMailIds: [],
      seenGmailMailIdsFlowId: next,
    });
  } catch (err) {
    console.warn(GMAIL_PREFIX, 'Could not reset seenGmailMailIds for new flow:', err?.message || err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    if (!isTopFrame) {
      sendResponse({ ok: false, reason: 'wrong-frame' });
      return;
    }

    resetStopState();
    handlePollEmail(message.step, message.payload).then((result) => {
      sendResponse(result);
    }).catch((err) => {
      if (isStopError(err)) {
        log(`Step ${message.step}: Stopped by user.`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      log(`Step ${message.step}: Poll attempt failed, background will decide whether to resend/retry: ${err.message}`, 'warn');
      sendResponse({ error: err.message });
    });
    return true;
  }
});

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

function getVisibleMailRows() {
  return Array.from(document.querySelectorAll('tr.zA')).filter(isVisible);
}

function normalizeMinuteTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.getTime();
}

function getMailIdFromRow(row) {
  const threadNode = row.querySelector('.bqe[data-thread-id], .bqe[data-legacy-thread-id], [data-thread-id], [data-legacy-thread-id]');
  return (
    threadNode?.getAttribute('data-thread-id')
    || threadNode?.getAttribute('data-legacy-thread-id')
    || row.getAttribute('data-thread-id')
    || row.getAttribute('data-legacy-thread-id')
    || row.id
    || ''
  ).trim();
}

function getCurrentMailIds() {
  const ids = new Set();
  for (const row of getVisibleMailRows()) {
    const id = getMailIdFromRow(row);
    if (id) ids.add(id);
  }
  return ids;
}

function getRowText(row, selector) {
  return (row.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
}

function extractMailMeta(row) {
  const sender = getRowText(row, '.yW .zF, .yW .yP, .zF, .yP');
  const subject = getRowText(row, '.bog .bqe, .y6 .bqe, .bqe');
  const digest = getRowText(row, '.y2');
  const timeText = getRowText(row, 'td.xW span[title], td.xW span');
  const ariaLabelId = row.getAttribute('aria-labelledby');
  const ariaLabel = ariaLabelId
    ? (document.getElementById(ariaLabelId)?.textContent || '').replace(/\s+/g, ' ').trim()
    : '';

  return {
    sender,
    subject,
    digest,
    timeText,
    ariaLabel,
    unread: row.classList.contains('zE'),
  };
}

function parseGmailTimestamp(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const now = new Date();
  let match = null;

  if (/刚刚/.test(text)) {
    return now.getTime();
  }

  match = text.match(/(\d+)\s*分(?:钟)?前/);
  if (match) {
    return now.getTime() - Number(match[1]) * 60 * 1000;
  }

  match = text.match(/(\d+)\s*秒前/);
  if (match) {
    return now.getTime() - Number(match[1]) * 1000;
  }

  const applyMeridiem = (rawMeridiem, rawHour) => {
    let hour = Number(rawHour);
    if (!Number.isFinite(hour)) return null;

    const meridiem = String(rawMeridiem || '').trim().toLowerCase();
    if (/下午|pm/.test(meridiem)) {
      if (hour < 12) hour += 12;
    } else if (/上午|am/.test(meridiem)) {
      if (hour === 12) hour = 0;
    }
    return hour;
  };

  // Gmail 对"昨天"的邮件也可能只显示纯时间（如 "20:51"），不带日期前缀。
  // 若用今天拼出的时间戳领先 now 超过 2 分钟，判为昨天，回退 24 小时。
  // 只向未来方向给 2 分钟容差（覆盖系统/服务端时钟微小偏差、刚到达的邮件）。
  const rollbackIfFuture = (ts) => {
    if (!Number.isFinite(ts)) return ts;
    if (ts - now.getTime() > 2 * 60 * 1000) {
      return ts - 24 * 60 * 60 * 1000;
    }
    return ts;
  };

  match = text.match(/^昨天\s*(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2})$/i);
  if (match) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    const hour = applyMeridiem(match[1], match[2]);
    date.setHours(hour ?? Number(match[2]), Number(match[3]), 0, 0);
    return date.getTime();
  }

  match = text.match(/^(上午|下午|AM|PM)\s*(\d{1,2}):(\d{2})$/i);
  if (match) {
    const hour = applyMeridiem(match[1], match[2]);
    return rollbackIfFuture(new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour ?? Number(match[2]),
      Number(match[3]),
      0,
      0
    ).getTime());
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return rollbackIfFuture(new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(match[1]),
      Number(match[2]),
      0,
      0
    ).getTime());
  }

  match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    const hour = applyMeridiem(match[3], match[1]);
    return rollbackIfFuture(new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour ?? Number(match[1]),
      Number(match[2]),
      0,
      0
    ).getTime());
  }

  match = text.match(/^(\d{1,2})月(\d{1,2})日(?:\s*(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2}))?$/i);
  if (match) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const hour = match[4] ? (applyMeridiem(match[3], match[4]) ?? Number(match[4])) : 0;
    const minute = match[5] ? Number(match[5]) : 0;
    return new Date(now.getFullYear(), month, day, hour, minute, 0, 0).getTime();
  }

  match = text.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:\s*(上午|下午|AM|PM)?\s*(\d{1,2}):(\d{2}))?$/i);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = match[5] ? (applyMeridiem(match[4], match[5]) ?? Number(match[5])) : 0;
    const minute = match[6] ? Number(match[6]) : 0;
    return new Date(year, month, day, hour, minute, 0, 0).getTime();
  }

  return null;
}

function getMailTimestamp(meta) {
  const candidates = [meta.timeText, meta.ariaLabel, `${meta.subject} ${meta.digest} ${meta.ariaLabel}`];
  for (const candidate of candidates) {
    const parsed = parseGmailTimestamp(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function triggerRowHover(row) {
  row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

function findVisibleRowDeleteButton(row) {
  const buttons = row.querySelectorAll('li.bru[data-tooltip], li.bru');
  for (const button of buttons) {
    if (isVisible(button)) return button;
  }
  return null;
}

function findTopToolbarDeleteButton() {
  const candidates = document.querySelectorAll([
    'div[role="button"][aria-label="删除"]',
    'div[role="button"][data-tooltip="删除"]',
    'div[role="button"][aria-label="Delete"]',
    'div[role="button"][data-tooltip="Delete"]',
    '.T-I.nX[role="button"]',
  ].join(', '));

  for (const button of candidates) {
    if (isVisible(button) && button.getAttribute('aria-disabled') !== 'true') {
      return button;
    }
  }
  return null;
}

async function ensureMailSelected(row) {
  const checkbox = row.querySelector('.oZ-jc[role="checkbox"]');
  if (!checkbox) {
    throw new Error('Could not find Gmail row checkbox.');
  }

  if (checkbox.getAttribute('aria-checked') === 'true') return;

  simulateClick(checkbox);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    throwIfStopped();
    if (checkbox.getAttribute('aria-checked') === 'true') return;
    await sleep(100);
  }

  throw new Error('Timed out while selecting Gmail row for deletion.');
}

async function deleteGmailItem(row, mailId) {
  triggerRowHover(row);
  await sleep(250);

  const rowDeleteButton = findVisibleRowDeleteButton(row);
  if (rowDeleteButton) {
    simulateClick(rowDeleteButton);
    log(`Gmail: Row delete clicked for ${mailId}`);
  } else {
    await ensureMailSelected(row);
    await sleep(250);

    const toolbarDelete = findTopToolbarDeleteButton();
    if (!toolbarDelete) {
      throw new Error('Could not find Gmail delete button.');
    }

    simulateClick(toolbarDelete);
    log(`Gmail: Toolbar delete clicked for ${mailId}`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    throwIfStopped();
    const stillExists = getVisibleMailRows().some((currentRow) => getMailIdFromRow(currentRow) === mailId);
    if (!stillExists) return;
    await sleep(150);
  }

  throw new Error(`Gmail row ${mailId} did not disappear after delete.`);
}

function findRefreshButton() {
  const candidates = document.querySelectorAll([
    'div[role="button"][aria-label="刷新"]',
    'div[role="button"][data-tooltip="刷新"]',
    'div[role="button"][aria-label="Refresh"]',
    'div[role="button"][data-tooltip="Refresh"]',
    '.T-I.nu[role="button"]',
  ].join(', '));

  for (const button of candidates) {
    if (isVisible(button) && button.getAttribute('aria-disabled') !== 'true') {
      return button;
    }
  }
  return null;
}

async function refreshInbox() {
  const refreshButton = findRefreshButton();
  if (!refreshButton) {
    throw new Error('Could not find Gmail refresh button.');
  }

  simulateClick(refreshButton);
  log('Gmail: Refresh clicked');
  await sleep(1500);
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

function rowMatchesFilters(meta, senderFilters, subjectFilters) {
  const senderText = `${meta.sender} ${meta.ariaLabel}`.toLowerCase();
  const subjectText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`.toLowerCase();
  const senderMatch = senderFilters.some((filter) => senderText.includes(String(filter || '').toLowerCase()));
  const subjectMatch = subjectFilters.some((filter) => subjectText.includes(String(filter || '').toLowerCase()));
  return senderMatch || subjectMatch;
}

function extractEmails(text) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
}

// 判断一个地址是不是"转发器/无人回复"发件地址，用来区分"邮件发给了另一个账号"
// (真正的跨收件人冲突) vs. "iCloud Hide My Email/Apple Private Relay 把 From
// 改写成了转发器地址" (无冲突——该邮件其实就是发给 target 的，只是 Gmail
// aria-label 里显示的是转发器).
//
// 背景：OpenAI 发到 HME 别名 (如 40.blowup.copse@icloud.com) 的验证码邮件，
// 在 Gmail 收件箱里会被 Apple 改写 From 为 noreply_at_<random>@icloud.com。
// 这个地址被 extractEmails 捕获后，之前的 previewEmails 校验会误判成"收件人
// 不匹配"，导致 7 次轮询全部静默丢掉合法 OTP 邮件。
function isForwarderLikeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  // iCloud Hide My Email: noreply_at_<hash>@icloud.com
  if (/^noreply_at_.+@icloud\.com$/.test(normalized)) return true;
  // Apple Private Relay: *@privaterelay.appleid.com
  if (/@privaterelay\.appleid\.com$/.test(normalized)) return true;
  // 通用 no-reply / notifications / donotreply / mailer-daemon / postmaster sender
  // （本质都是发件机器人，不可能是"收件目标"，不应作为跨收件人冲突证据）
  const localPart = normalized.split('@')[0] || '';
  if (/^(no[-_.]?reply|notifications?|notify|mailer[-_.]?daemon|postmaster|donotreply|do[-_.]not[-_.]reply)(?:$|[.+_-])/.test(localPart)) return true;
  return false;
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
    matches: emails.some((email) => emailMatchesTarget(email, normalizedTarget)),
    hasExplicitEmail: true,
  };
}

// 把 payload 里的 rejectSubjectPatterns（string[]）编译成 RegExp[]。
// 跨 chrome.runtime.sendMessage 不能直接传 RegExp，所以 background 侧以 source
// 字符串传递，这里统一编译为大小写不敏感。
function compileRejectPatterns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((source) => {
      if (source instanceof RegExp) return source;
      const str = String(source || '').trim();
      if (!str) return null;
      try {
        return new RegExp(str, 'i');
      } catch (err) {
        console.warn(GMAIL_PREFIX, 'Skipping invalid rejectSubjectPattern:', source, err?.message || err);
        return null;
      }
    })
    .filter(Boolean);
}

// 观察 Gmail 邮件列表容器的 DOM 变动（新行插入、class 翻转为 zE 未读 等）。
// Gmail 的邮件推送会直接把新 tr.zA 插入 '.AO'（主面板）子树，MutationObserver 能在
// <1s 内发现，不必等下一次 refresh 点击（每次 refresh ≈ 1.5s UI 抖动）。
//
// 返回值：await 这个 promise，要么在 timeoutMs 到期时 resolve(null)，
// 要么在 matcher() 命中时 resolve(matchResult)。matcher 在每次 mutation burst
// 结束后被调用一次——如果调用时命中就提前返回。
function waitForInboxChangeOrTimeout(timeoutMs, matcher) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { observer.disconnect(); } catch { /* noop */ }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), Math.max(0, timeoutMs | 0));

    // 每次 mutation 可能同时有十几条（Gmail 会批量替换节点）。用 microtask 合并一批。
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending || settled) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (settled) return;
        try {
          const result = matcher();
          if (result) finish(result);
        } catch (err) {
          // matcher 抛异常不应该让流程卡死，打日志后当作未命中继续等
          console.warn(GMAIL_PREFIX, 'Inbox matcher threw:', err?.message || err);
        }
      });
    });

    // '.AO' 是 Gmail 主面板；若拿不到退化到 body。attributeFilter 兼容"行从已读变未读"
    // 这类 class 翻转场景（zE = 未读）。
    const target = document.querySelector('.AO, [role="main"]') || document.body;
    try {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    } catch (err) {
      console.warn(GMAIL_PREFIX, 'Could not attach MutationObserver:', err?.message || err);
      finish(null);
    }
  });
}

async function handlePollEmail(step, payload) {
  const {
    senderFilters,
    subjectFilters,
    rejectSubjectPatterns: rawRejectPatterns = [],
    maxAttempts,
    intervalMs,
    filterAfterTimestamp = 0,
    excludeCodes = [],
    strictChatGPTCodeOnly = false,
    targetEmail = '',
    flowStartTime = 0,
  } = payload;
  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));
  const filterAfterMinute = normalizeMinuteTimestamp(Number(filterAfterTimestamp) || 0);
  const rejectSubjectPatterns = compileRejectPatterns(rawRejectPatterns);

  await ensureSeenMailIdsScopedTo(flowStartTime);

  log(`Step ${step}: Starting email poll on Gmail (max ${maxAttempts} attempts, every ${intervalMs / 1000}s)`);
  if (filterAfterMinute) {
    log(`Step ${step}: Only accepting Gmail messages at or after ${new Date(filterAfterMinute).toLocaleString('zh-CN', { hour12: false })}.`);
  }
  if (rejectSubjectPatterns.length > 0) {
    log(`Step ${step}: Rejecting subjects matching ${rejectSubjectPatterns.length} pattern(s) (e.g. opposite-flow OTP).`);
  }

  try {
    await waitForElement('table.F.cf.zt, tr.zA', 15000);
    log(`Step ${step}: Gmail list loaded`);
  } catch {
    throw new Error('Gmail list did not load. Make sure Gmail inbox or Primary tab is open.');
  }

  const existingMailIds = getCurrentMailIds();
  log(`Step ${step}: Snapshotted ${existingMailIds.size} visible emails as "old"`);

  // 前 FALLBACK_AFTER 次只认"新邮件"（不在 snapshot 里 / 时间戳晚于 filterAfterMinute）；
  // 第 FALLBACK_AFTER+1 次起进入宽松模式：允许 snapshot 里的旧邮件也参与抽码——
  // 覆盖"邮件在 snapshot 之前就到了、我们一开始就错过"的场景。
  // 从 3 降到 1：Gmail 的实时推送 + MutationObserver 已经能在 <1s 内发现新邮件，
  // 再连等 3 轮才放宽是多余的延迟。
  const FALLBACK_AFTER = 1;

  // scanRows 是一个幂等函数：检查当前可见行，命中就返回 match 对象；否则返回 null。
  // MutationObserver 和轮询都调用它。不在这里 deleteGmailItem/persist seenMailIds，
  // 那些副作用由主循环在拿到 match 后统一处理，防止 observer 触发的"发现"
  // 和轮询发起的"发现"双写冲突。
  function scanRowsOnce(useFallback) {
    const rows = getVisibleMailRows();
    const orderedRows = [
      ...rows.filter((row) => row.classList.contains('zE')),
      ...rows.filter((row) => !row.classList.contains('zE')),
    ];
    let unknownTimestampRows = 0;

    for (const row of orderedRows) {
      const mailId = getMailIdFromRow(row);
      if (!mailId) continue;

      const meta = extractMailMeta(row);
      const mailTimestamp = getMailTimestamp(meta);
      if (!mailTimestamp) unknownTimestampRows += 1;
      const mailMinute = normalizeMinuteTimestamp(mailTimestamp || 0);
      const passesTimeFilter = !filterAfterMinute || !mailMinute || (mailMinute >= filterAfterMinute);
      const shouldBypassOldSnapshot = Boolean(filterAfterMinute && passesTimeFilter && mailMinute > 0);
      if (!passesTimeFilter) continue;
      if (!useFallback && !shouldBypassOldSnapshot && existingMailIds.has(mailId)) continue;
      if (!rowMatchesFilters(meta, senderFilters, subjectFilters)) continue;

      const subjectText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
      // 负向主题过滤：step 4(注册) 拒绝"登录 OTP"邮件；step 7(登录) 拒绝"注册验证码"邮件。
      // 这两种邮件的正向过滤条件几乎完全重合（都是 openai/noreply + 验证/code），
      // 没有这一条就会把对侧流程的 OTP 拿来提交，触发 invalid code。
      if (rejectSubjectPatterns.some((re) => re.test(subjectText))) {
        continue;
      }

      const combinedText = `${meta.sender} ${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
      const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
      const previewTargetState = getTargetEmailMatchState(contentText, targetEmail);
      const previewEmails = extractEmails(contentText);
      // 只用"非转发器"邮件做跨收件人冲突判定。iCloud HME / Apple Private Relay
      // / noreply 等 sender 地址出现在 ariaLabel 里时不应被当成"其他收件人"——
      // 否则 OpenAI 通过 HME 发来的邮件会被全部静默丢弃（参见 isForwarderLikeEmail）。
      const nonForwarderEmails = previewEmails.filter((email) => !isForwarderLikeEmail(email));
      if (targetEmail && nonForwarderEmails.length > 0 && !previewTargetState.matches) {
        log(
          `Step ${step}: Skipping row — preview contains other recipient email(s) ${JSON.stringify(nonForwarderEmails)} that don't match target ${targetEmail}. Sender=${meta.sender || '?'} Subject=${meta.subject || '?'}`,
          'warn'
        );
        continue;
      }

      const code = extractVerificationCode(combinedText, strictChatGPTCodeOnly);
      if (!code) continue;
      // 第二次校验：即使没有 previewEmails，如果 hasExplicitEmail 但 target 既不是
      // 字面量也不是编码形式，仍然 skip。同样要把转发器排除在外。
      if (
        targetEmail
        && previewTargetState.hasExplicitEmail
        && !previewTargetState.matches
        && nonForwarderEmails.length > 0
      ) {
        log(
          `Step ${step}: Skipping row (post-code check) — explicit other-recipient email(s) ${JSON.stringify(nonForwarderEmails)} vs target ${targetEmail}. Code candidate=${code}`,
          'warn'
        );
        continue;
      }
      if (excludedCodeSet.has(code)) {
        log(`Step ${step}: Skipping excluded Gmail code ${code}`, 'info');
        continue;
      }
      if (seenMailIds.has(mailId)) {
        log(`Step ${step}: Skipping already-processed Gmail mail ${mailId} (code ${code})`, 'info');
        continue;
      }

      return { row, mailId, meta, mailTimestamp, code, useFallback };
    }

    if (filterAfterMinute && orderedRows.length > 0 && unknownTimestampRows === orderedRows.length) {
      log(`Step ${step}: Gmail visible rows all had unparsed timestamps under current locale; freshness filter may skip every row.`, 'warn');
    }
    return null;
  }

  async function finalizeMatch(match) {
    try {
      await deleteGmailItem(match.row, match.mailId);
    } catch (err) {
      log(`Gmail: Delete failed for ${match.mailId}, but continuing with extracted code: ${err.message}`, 'warn');
    }
    seenMailIds.add(match.mailId);
    persistSeenMailIds();
    const source = match.useFallback && existingMailIds.has(match.mailId) ? 'fallback matched row' : 'new email';
    const timeLabel = match.mailTimestamp
      ? ` Time=${new Date(match.mailTimestamp).toLocaleString('zh-CN', { hour12: false })}`
      : '';
    log(
      `Step ${step}: Found code ${match.code} from ${source}. Sender=${match.meta.sender || 'unknown'} Subject=${match.meta.subject || ''}${timeLabel}`,
      'ok'
    );
    return { ok: true, code: match.code, emailTimestamp: Date.now(), mailId: match.mailId };
  }

  // 开场先扫一遍：若 snapshot 之前邮件就已到达（例如 step 4 启动很晚、OpenAI 邮件秒到），
  // 可以零等待返回。
  const immediate = scanRowsOnce(false);
  if (immediate) return await finalizeMatch(immediate);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`Polling Gmail... attempt ${attempt}/${maxAttempts}`);

    if (attempt > 1) {
      await refreshInbox();
    }

    const useFallback = attempt > FALLBACK_AFTER;

    // 刷新之后立刻扫一次；很多时候新邮件在 refresh 过程中就被渲染好了。
    const postRefresh = scanRowsOnce(useFallback);
    if (postRefresh) return await finalizeMatch(postRefresh);

    if (attempt === FALLBACK_AFTER + 1) {
      // 原文案 "falling back to the first matching visible row" 会让人误以为是
      // "放弃筛选随便挑一封"。实际只是允许 snapshot 里的旧邮件也参与抽码，过滤条件
      // (senderFilters / subjectFilters / rejectSubjectPatterns / targetEmail) 仍然生效。
      log(
        `Step ${step}: 前 ${FALLBACK_AFTER} 轮未见新邮件，后续轮询将允许 snapshot 内的旧邮件也参与抽码（主题/发件人/目标邮箱过滤仍然生效）。`,
        'warn'
      );
    }

    if (attempt < maxAttempts) {
      // 用 MutationObserver 提前结束 sleep：一旦 Gmail 推送新行，立刻停等、命中就返回。
      // 没命中也只是提早一点进入下一轮 refresh，不会多消耗资源。
      const observed = await waitForInboxChangeOrTimeout(
        intervalMs,
        () => scanRowsOnce(useFallback)
      );
      if (observed) return await finalizeMatch(observed);
    }
  }

  throw new Error(`${Math.round(maxAttempts * intervalMs / 1000)}s elapsed with no matching Gmail verification email.`);
}
