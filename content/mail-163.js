// content/mail-163.js — Content script for 163 Mail (steps 4, 7)
// Injected on: mail.163.com
//
// DOM structure:
// Mail item: div[sign="letter"] with aria-label="你的 ChatGPT 代码为 479637 发件人 ： OpenAI ..."
// Sender: .nui-user (e.g., "OpenAI")
// Subject: span.da0 (e.g., "你的 ChatGPT 代码为 479637")
// Delete actions: hover trash icon on the row, or checkbox + toolbar delete button

const MAIL163_PREFIX = '[MultiPage:mail-163]';
const isTopFrame = window === window.top;
const SEEN_MAIL_SIGNATURES_KEY = 'seen163MailSignatures';
const SEEN_MAIL_SIGNATURE_LIMIT = 200;

const {
  buildMail163SelectionPlan,
  collectMail163CleanupEntries,
  createMail163Snapshot,
  normalizeMail163Entry,
  normalizeMail163PollAttempts,
  normalizeMinuteTimestamp,
  parseMail163Timestamp,
  pickMail163VerificationEntry,
  updateRecentMail163Signatures,
} = self.Mail163Utils;

console.log(MAIL163_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

// Only operate in the top frame
if (!isTopFrame) {
  console.log(MAIL163_PREFIX, 'Skipping child frame');
} else {

let seenMailSignatures = [];
let seenMailSignatureSet = new Set();

async function loadSeenMailSignatures() {
  try {
    const data = await chrome.storage.session.get(SEEN_MAIL_SIGNATURES_KEY);
    if (Array.isArray(data[SEEN_MAIL_SIGNATURES_KEY])) {
      seenMailSignatures = data[SEEN_MAIL_SIGNATURES_KEY].filter(Boolean).slice(0, SEEN_MAIL_SIGNATURE_LIMIT);
      seenMailSignatureSet = new Set(seenMailSignatures);
      console.log(MAIL163_PREFIX, `Loaded ${seenMailSignatureSet.size} previously seen mail signatures`);
    }
  } catch (err) {
    console.warn(MAIL163_PREFIX, 'Session storage unavailable, using in-memory seen mail signatures:', err?.message || err);
  }
}

const seenMailSignaturesReady = loadSeenMailSignatures();

async function persistSeenMailSignatures() {
  try {
    await chrome.storage.session.set({
      [SEEN_MAIL_SIGNATURES_KEY]: seenMailSignatures,
    });
  } catch (err) {
    console.warn(MAIL163_PREFIX, 'Could not persist seen mail signatures, continuing in-memory only:', err?.message || err);
  }
}

async function rememberSeenMailSignature(signature) {
  if (!signature) return;
  seenMailSignatures = updateRecentMail163Signatures(
    seenMailSignatures,
    signature,
    SEEN_MAIL_SIGNATURE_LIMIT
  );
  seenMailSignatureSet = new Set(seenMailSignatures);
  await persistSeenMailSignatures();
}

// ============================================================
// Message Handler (top frame only)
// ============================================================

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

// ============================================================
// Find mail items
// ============================================================

function findMailItems() {
  return document.querySelectorAll('div[sign="letter"]');
}

function getMailTimestamp(item) {
  const candidates = [];
  const timeCell = item.querySelector('.e00[title], [title*="年"][title*=":"]');
  if (timeCell?.getAttribute('title')) candidates.push(timeCell.getAttribute('title'));
  if (timeCell?.textContent) candidates.push(timeCell.textContent);

  const titledNodes = item.querySelectorAll('[title]');
  titledNodes.forEach((node) => {
    const title = node.getAttribute('title');
    if (title) candidates.push(title);
  });

  for (const candidate of candidates) {
    const parsed = parseMail163Timestamp(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function parseMailItem(item, index = 0) {
  const sender = item.querySelector('.nui-user')?.textContent || '';
  const subject = item.querySelector('span.da0')?.textContent || '';

  return {
    item,
    index,
    id: item.getAttribute('id') || '',
    sender,
    subject,
    ariaLabel: item.getAttribute('aria-label') || '',
    timestamp: getMailTimestamp(item),
  };
}

function getCurrentMailSnapshot() {
  return createMail163Snapshot(Array.from(findMailItems()).map(parseMailItem));
}

function getCurrentMailEntries() {
  return Array.from(findMailItems()).map((item, index) => {
    const checkbox = findMailCheckbox(item);
    const entry = normalizeMail163Entry(parseMailItem(item, index), index);
    return {
      ...entry,
      item,
      checkbox,
      selected: isMailCheckboxChecked(checkbox),
    };
  });
}

function scheduleEmailCleanup(cleanupContext, step) {
  setTimeout(() => {
    Promise.resolve(deleteEmail(cleanupContext, step)).catch(() => {
      // Cleanup is best effort only and must never affect the main verification flow.
    });
  }, 0);
}

// ============================================================
// Email Polling
// ============================================================

async function handlePollEmail(step, payload) {
  await seenMailSignaturesReady;

  const {
    senderFilters = [],
    subjectFilters = [],
    maxAttempts,
    intervalMs = 3000,
    excludeCodes = [],
    filterAfterTimestamp = 0,
  } = payload || {};
  const effectiveMaxAttempts = normalizeMail163PollAttempts(maxAttempts);
  const filterAfterMinute = normalizeMinuteTimestamp(Number(filterAfterTimestamp) || 0);

  log(`步骤 ${step}：开始轮询 163 邮箱（最多 ${effectiveMaxAttempts} 次）`);
  if (filterAfterMinute) {
    log(`步骤 ${step}：仅尝试 ${new Date(filterAfterMinute).toLocaleString('zh-CN', { hour12: false })} 及之后时间的邮件。`);
  }

  // Click inbox in sidebar to ensure we're in inbox view
  log(`步骤 ${step}：正在等待侧边栏加载...`);
  try {
    const inboxLink = await waitForElement('.nui-tree-item-text[title="收件箱"]', 5000);
    inboxLink.click();
    log(`步骤 ${step}：已点击收件箱`);
  } catch {
    log(`步骤 ${step}：未找到收件箱入口，继续尝试后续流程...`, 'warn');
  }

  // Wait for mail list to appear
  log(`步骤 ${step}：正在等待邮件列表加载...`);
  let items = [];
  for (let i = 0; i < 20; i++) {
    items = findMailItems();
    if (items.length > 0) break;
    await sleep(500);
  }

  if (items.length === 0) {
    await refreshInbox();
    await sleep(2000);
    items = findMailItems();
  }

  if (items.length === 0) {
    throw new Error('163 邮箱列表未加载完成，请确认当前已打开收件箱。');
  }

  log(`步骤 ${step}：邮件列表已加载，共 ${items.length} 封邮件`);

  const existingMailSnapshot = getCurrentMailSnapshot();
  log(`步骤 ${step}：已记录当前 ${existingMailSnapshot.signatures.size} 封旧邮件快照`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
    log(`步骤 ${step}：正在轮询 163 邮箱，第 ${attempt}/${effectiveMaxAttempts} 次`);

    if (attempt > 1) {
      await refreshInbox();
      await sleep(1000);
    }

    const allItems = Array.from(findMailItems()).map(parseMailItem);
    const useFallback = attempt > FALLBACK_AFTER;

    const selection = pickMail163VerificationEntry(allItems, {
      afterTimestamp: filterAfterTimestamp,
      allowSnapshotFallback: useFallback,
      allowTimeFallback: useFallback,
      excludeCodes,
      seenSignatures: [...seenMailSignatureSet],
      senderFilters,
      snapshot: existingMailSnapshot,
      subjectFilters,
    });

    if (selection?.match) {
      const matchedMail = selection.match;
      await rememberSeenMailSignature(matchedMail.signature);
      const source = selection.usedTimeFallback
        ? '延迟回退匹配邮件'
        : (selection.usedSnapshotFallback ? '回退匹配邮件' : '新邮件');
      const timeLabel = matchedMail.timestamp
        ? `，时间：${new Date(matchedMail.timestamp).toLocaleString('zh-CN', { hour12: false })}`
        : '';
      const extraLabel = selection.usedTimeFallback ? '，已忽略时间窗口' : '';
      log(`步骤 ${step}：已找到验证码：${matchedMail.code}（来源：${source}${extraLabel}${timeLabel}，主题：${matchedMail.subject.slice(0, 40)}）`, 'ok');

      scheduleEmailCleanup({
        matchedMail,
        senderFilters,
        subjectFilters,
      }, step);

      return {
        ok: true,
        code: matchedMail.code,
        emailTimestamp: matchedMail.timestamp || Date.now(),
        mailId: matchedMail.id || matchedMail.signature,
      };
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`步骤 ${step}：连续 ${FALLBACK_AFTER} 次未发现新邮件，开始回退到匹配邮件，并在必要时放宽时间窗口。`, 'warn');
    }

    if (attempt < effectiveMaxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${(effectiveMaxAttempts * intervalMs / 1000).toFixed(0)} 秒后仍未在 163 邮箱中找到新的匹配邮件。` +
    '请手动检查收件箱。'
  );
}

// ============================================================
// Delete Email via Hover Trash / Toolbar Fallback
// ============================================================

function clickElement(element) {
  if (!element) return;
  if (typeof simulateClick === 'function') {
    simulateClick(element);
    return;
  }
  element.click();
}

function findMailCheckbox(item) {
  return item?.querySelector('[sign="checkbox"], .nui-chk, input[type="checkbox"]') || null;
}

function isMailCheckboxChecked(checkbox) {
  if (!checkbox) return false;

  const nodes = [checkbox, ...checkbox.querySelectorAll?.('*') || []];
  for (const node of nodes) {
    if (!node) continue;
    if (node instanceof HTMLInputElement && node.type === 'checkbox' && node.checked) {
      return true;
    }

    const ariaChecked = node.getAttribute?.('aria-checked');
    if (ariaChecked === 'true') {
      return true;
    }

    const checkedAttr = node.getAttribute?.('checked');
    if (checkedAttr !== null && checkedAttr !== 'false') {
      return true;
    }

    const className = typeof node.className === 'string' ? node.className : '';
    if (/\bnui-(?:chk|ico)-checked\b|\bis-checked\b|\bchecked\b/.test(className)) {
      return true;
    }
  }

  return false;
}

async function clickToolbarDelete(step, selectedCount) {
  const toolbarBtns = document.querySelectorAll('.nui-btn .nui-btn-text');
  for (const btn of toolbarBtns) {
    if (btn.textContent.replace(/\s/g, '').includes('删除')) {
      clickElement(btn.closest('.nui-btn'));
      log(`步骤 ${step}：已批量删除 ${selectedCount} 封匹配邮件`, 'ok');
      await sleep(1500);
      return true;
    }
  }

  return false;
}

async function toggleMailCheckbox(entry, shouldBeChecked) {
  if (!entry?.checkbox) return false;
  const initiallyChecked = isMailCheckboxChecked(entry.checkbox);
  if (initiallyChecked === shouldBeChecked) {
    return true;
  }

  entry.item?.scrollIntoView?.({ block: 'center' });
  clickElement(entry.checkbox);
  await sleep(150);
  return isMailCheckboxChecked(entry.checkbox) === shouldBeChecked;
}

async function syncMailSelection(targetEntries, step) {
  const initialEntries = getCurrentMailEntries();
  const initialPlan = buildMail163SelectionPlan(initialEntries, targetEntries);

  let clearedCount = 0;
  for (const entry of initialPlan.toUnselect) {
    if (await toggleMailCheckbox(entry, false)) {
      clearedCount += 1;
    }
  }

  for (const entry of initialPlan.toSelect) {
    await toggleMailCheckbox(entry, true);
  }

  const finalPlan = buildMail163SelectionPlan(getCurrentMailEntries(), targetEntries);
  if (clearedCount > 0) {
    log(`步骤 ${step}：已清除 ${clearedCount} 封与本次删除无关的已选邮件。`, 'info');
  }

  return {
    clearedCount,
    selectedCount: finalPlan.selectedTargetCount,
    targetCount: finalPlan.targetCount,
    unexpectedSelectedCount: finalPlan.toUnselect.length,
  };
}

async function deleteSingleEmail(item, step) {
  try {
    log(`步骤 ${step}：正在删除邮件...`);

    // Strategy 1: Click the trash icon inside the mail item
    // Each mail item has: <b class="nui-ico nui-ico-delete" title="删除邮件" sign="trash">
    // These icons appear on hover, so we trigger mouseover first
    item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);

    const trashIcon = item.querySelector('[sign="trash"], .nui-ico-delete, [title="删除邮件"]');
    if (trashIcon) {
      clickElement(trashIcon);
      log(`步骤 ${step}：已点击删除图标`, 'ok');
      await sleep(1500);

      // Check if item disappeared (confirm deletion)
      const stillExists = document.getElementById(item.id);
      if (!stillExists || stillExists.style.display === 'none') {
        log(`步骤 ${step}：邮件已成功删除`);
      } else {
        log(`步骤 ${step}：邮件可能尚未删除，列表中仍可见`, 'warn');
      }
      return;
    }

    // Strategy 2: Select checkbox then click toolbar delete button
    log(`步骤 ${step}：未找到删除图标，尝试使用复选框加工具栏删除...`);
    const checkbox = findMailCheckbox(item);
    if (checkbox) {
      const selection = await syncMailSelection([
        {
          ...normalizeMail163Entry(parseMailItem(item)),
          item,
        },
      ], step);

      if (selection.unexpectedSelectedCount > 0) {
        log(`步骤 ${step}：仍存在 ${selection.unexpectedSelectedCount} 封无关已选邮件，已跳过工具栏删除以避免误删。`, 'warn');
        return;
      }

      if (selection.selectedCount > 0 && await clickToolbarDelete(step, selection.selectedCount)) {
        return;
      }
    }

    log(`步骤 ${step}：无法删除邮件（未找到删除按钮）`, 'warn');
  } catch (err) {
    log(`步骤 ${step}：删除邮件失败：${err.message}`, 'warn');
  }
}

async function deleteEmail(cleanupContext, step) {
  const { matchedMail = null, senderFilters = [], subjectFilters = [] } = cleanupContext || {};

  try {
    const candidates = collectMail163CleanupEntries(
      Array.from(findMailItems()).map(parseMailItem),
      { senderFilters, subjectFilters }
    );

    if (!candidates.length) {
      if (matchedMail?.item) {
        await deleteSingleEmail(matchedMail.item, step);
        return;
      }
      log(`步骤 ${step}：未找到可批量删除的匹配邮件`, 'warn');
      return;
    }

    const selection = await syncMailSelection(candidates, step);
    if (selection.unexpectedSelectedCount > 0) {
      log(`步骤 ${step}：仍存在 ${selection.unexpectedSelectedCount} 封无关已选邮件，已放弃批量删除以避免误删。`, 'warn');
    } else if (selection.selectedCount > 0 && await clickToolbarDelete(step, selection.selectedCount)) {
      return;
    }

    if (matchedMail?.item) {
      log(`步骤 ${step}：批量删除不可用，回退为单封删除`, 'warn');
      await deleteSingleEmail(matchedMail.item, step);
      return;
    }

    log(`步骤 ${step}：无法删除邮件（未找到可用的复选框或删除按钮）`, 'warn');
  } catch (err) {
    log(`步骤 ${step}：删除邮件失败：${err.message}`, 'warn');
  }
}

// ============================================================
// Inbox Refresh
// ============================================================

async function refreshInbox() {
  // Try toolbar "刷 新" button
  const toolbarBtns = document.querySelectorAll('.nui-btn .nui-btn-text');
  for (const btn of toolbarBtns) {
    if (btn.textContent.replace(/\s/g, '') === '刷新') {
      btn.closest('.nui-btn').click();
      console.log(MAIL163_PREFIX, 'Clicked "刷新" button');
      await sleep(800);
      return;
    }
  }

  // Fallback: click sidebar "收 信"
  const shouXinBtns = document.querySelectorAll('.ra0');
  for (const btn of shouXinBtns) {
    if (btn.textContent.replace(/\s/g, '').includes('收信')) {
      btn.click();
      console.log(MAIL163_PREFIX, 'Clicked "收信" button');
      await sleep(800);
      return;
    }
  }

  console.log(MAIL163_PREFIX, 'Could not find refresh button');
}

} // end of isTopFrame else block
