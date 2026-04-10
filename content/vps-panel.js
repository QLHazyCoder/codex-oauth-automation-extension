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

// Listen for commands from Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_STEP') {
    resetStopState();
    handleStep(message.step, message.payload).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      if (isStopError(err)) {
        log(`步骤 ${message.step}：已被用户停止。`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      reportError(message.step, err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

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

function getStatusBadgeElement() {
  const selectors = [
    '#root > div > div > div > main > div > div > div > div > div:nth-child(1) > div > div.OAuthPage-module__cardContent___1sXLA > div.status-badge',
    '#root .OAuthPage-module__cardContent___1sXLA > .status-badge',
    '.OAuthPage-module__cardContent___1sXLA > .status-badge',
    '.status-badge',
  ];

  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    const visible = Array.from(candidates).find(isVisibleElement);
    if (visible) return visible;
  }

  return null;
}

function getStatusBadgeText() {
  const statusEl = getStatusBadgeElement();
  return statusEl ? (statusEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function isOAuthCallbackTimeoutFailure(statusText) {
  return /认证失败:\s*Timeout waiting for OAuth callback/i.test(statusText || '');
}

async function waitForExactSuccessBadge(timeout = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    throwIfStopped();
    const statusText = getStatusBadgeText();
    if (statusText === '认证成功！') {
      return statusText;
    }
    await sleep(200);
  }

  const finalText = getStatusBadgeText();
  if (isOAuthCallbackTimeoutFailure(finalText)) {
    throw new Error(`STEP9_OAUTH_TIMEOUT::${finalText}`);
  }
  throw new Error(finalText
    ? `CPA 面板状态不是“认证成功！”，当前为“${finalText}”。`
    : 'CPA 面板长时间未出现“认证成功！”状态徽标。');
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

  while (Date.now() - start < timeout) {
    throwIfStopped();

    const authUrlEl = findAuthUrlElement();
    if (authUrlEl) {
      return { header: findCodexOAuthHeader(), authUrlEl };
    }

    const oauthHeader = findCodexOAuthHeader();
    if (oauthHeader) {
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
        log(`步骤 ${step}：已填写 CPA 管理密钥。`);
      }

      const rememberCheckbox = findRememberPasswordCheckbox();
      if (rememberCheckbox && !rememberCheckbox.checked) {
        simulateClick(rememberCheckbox);
        log(`步骤 ${step}：已勾选 CPA 面板“记住密码”。`);
        await sleep(300);
      }

      if (Date.now() - lastLoginAttemptAt > 3000) {
        lastLoginAttemptAt = Date.now();
        await humanPause(350, 900);
        simulateClick(managementLoginButton);
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
      log(`步骤 ${step}：已打开“OAuth 登录”导航。`);
      await sleep(1200);
      continue;
    }

    await sleep(250);
  }

  throw new Error('无法进入 CPA 的 OAuth 管理页面，请检查面板是否正常加载。URL: ' + location.href);
}

// ============================================================
// Step 1: Get OAuth Link
// ============================================================

async function step1_getOAuthLink(payload) {
  const { vpsPassword } = payload || {};

  log('步骤 1：正在等待 CPA 面板加载并进入 OAuth 页面...');

  const { header, authUrlEl: existingAuthUrlEl } = await ensureOAuthManagementPage(vpsPassword, 1);
  let authUrlEl = existingAuthUrlEl;

  if (!authUrlEl) {
    const loginBtn = findOAuthCardLoginButton(header);
    if (!loginBtn) {
      throw new Error('已找到 Codex OAuth 卡片，但卡片内没有登录按钮。URL: ' + location.href);
    }

    if (loginBtn.disabled) {
      log('步骤 1：OAuth 登录按钮当前不可用，正在等待授权链接出现...');
    } else {
      await humanPause(500, 1400);
      simulateClick(loginBtn);
      log('步骤 1：已点击 OAuth 登录按钮，正在等待授权链接...');
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
    log('步骤 1：CPA 面板上已显示授权链接。');
  }

  const oauthUrl = (authUrlEl.textContent || '').trim();
  if (!oauthUrl || !oauthUrl.startsWith('http')) {
    throw new Error(`拿到的 OAuth 链接无效：\"${oauthUrl.slice(0, 50)}\"。应为 http 开头的 URL。`);
  }

  log(`步骤 1：已获取 OAuth 链接：${oauthUrl.slice(0, 80)}...`, 'ok');
  reportComplete(1, { oauthUrl });
}

// ============================================================
// Step 9: CPA Verify — paste localhost URL and submit
// ============================================================

async function step9_vpsVerify(payload) {
  await ensureOAuthManagementPage(payload?.vpsPassword, 9);

  // Get localhostUrl from payload (passed directly by background) or fallback to state
  let localhostUrl = payload?.localhostUrl;
  if (!localhostUrl) {
    log('步骤 9：payload 中没有 localhostUrl，正在从状态中读取...');
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    localhostUrl = state.localhostUrl;
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

  // Find and click "提交回调 URL" button
  let submitBtn = null;
  try {
    submitBtn = await waitForElementByText(
      '[class*="callbackActions"] button, [class*="callbackSection"] button',
      /提交/,
      5000
    );
  } catch {
    try {
      submitBtn = await waitForElementByText('button.btn', /提交回调/, 5000);
    } catch {
      throw new Error('未找到“提交回调 URL”按钮。URL: ' + location.href);
    }
  }

  await humanPause(450, 1200);
  simulateClick(submitBtn);
  log('步骤 9：已点击“提交回调 URL”，正在等待认证结果...');

  const verifiedStatus = await waitForExactSuccessBadge();
  log(`步骤 9：${verifiedStatus}`, 'ok');
  reportComplete(9, { localhostUrl, verifiedStatus });
}
