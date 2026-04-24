(function attachBackgroundGrokStep1(root, factory) {
  root.MultiPageBackgroundGrokStep1 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep1Module() {
  function createGrokStep1Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      reuseOrCreateTab,
      registerTab,
      sendToContentScriptResilient,
      ensureContentScriptReadyOnTab,
      chrome,
    } = deps;

    const GROK_SIGNUP_URL = 'https://accounts.x.ai/sign-up?redirect=grok-com';
    const GROK_SESSION_ORIGINS = [
      'https://accounts.x.ai',
      'https://grok.com',
      'https://x.ai',
    ];
    const GROK_COOKIE_DOMAINS = ['x.ai', 'accounts.x.ai', 'grok.com'];

    function normalizeCookieDomain(domain) {
      return String(domain || '').trim().replace(/^\.+/, '').toLowerCase();
    }

    function shouldClearGrokCookie(cookie) {
      const domain = normalizeCookieDomain(cookie?.domain);
      if (!domain) return false;
      return GROK_COOKIE_DOMAINS.some((target) => domain === target || domain.endsWith(`.${target}`));
    }

    function buildCookieUrl(cookie) {
      const host = normalizeCookieDomain(cookie?.domain);
      const path = String(cookie?.path || '/').startsWith('/') ? String(cookie?.path || '/') : `/${cookie?.path || ''}`;
      return `https://${host}${path}`;
    }

    async function clearGrokSessionData() {
      let removedCount = 0;

      if (chrome?.cookies?.getAll && chrome?.cookies?.remove) {
        const stores = chrome.cookies.getAllCookieStores
          ? await chrome.cookies.getAllCookieStores()
          : [{ id: undefined }];
        const seen = new Set();

        for (const store of stores) {
          const storeId = store?.id;
          const cookies = await chrome.cookies.getAll(storeId ? { storeId } : {});
          for (const cookie of cookies || []) {
            if (!shouldClearGrokCookie(cookie)) continue;
            const key = [
              cookie.storeId || storeId || '',
              cookie.domain || '',
              cookie.path || '',
              cookie.name || '',
              cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '',
            ].join('|');
            if (seen.has(key)) continue;
            seen.add(key);

            const details = {
              url: buildCookieUrl(cookie),
              name: cookie.name,
            };
            if (cookie.storeId) details.storeId = cookie.storeId;
            if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;

            try {
              const result = await chrome.cookies.remove(details);
              if (result) removedCount += 1;
            } catch (_) { /* best effort */ }
          }
        }
      }

      if (chrome?.browsingData?.remove) {
        try {
          await chrome.browsingData.remove({ since: 0, origins: GROK_SESSION_ORIGINS }, {
            cacheStorage: true,
            cookies: true,
            indexedDB: true,
            localStorage: true,
            serviceWorkers: true,
          });
        } catch (_) { /* best effort */ }
      } else if (chrome?.browsingData?.removeCookies) {
        try {
          await chrome.browsingData.removeCookies({ since: 0, origins: GROK_SESSION_ORIGINS });
        } catch (_) { /* best effort */ }
      }

      await addLog(`步骤 1：已清理 x.ai / Grok 会话数据（直接删除 ${removedCount} 个 Cookie）。`, 'info');
    }

    async function executeGrokStep1() {
      await clearGrokSessionData();
      await addLog('步骤 1：正在打开 x.ai 注册页...');
      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/grok-signup-page.js'];
      const tabId = await reuseOrCreateTab('grok-signup-page', GROK_SIGNUP_URL, {
        inject: injectFiles,
        injectSource: 'grok-signup-page',
        reloadIfSameUrl: true,
      });

      if (registerTab) {
        await registerTab('grok-signup-page', tabId);
      }

      await ensureContentScriptReadyOnTab('grok-signup-page', tabId, {
        inject: injectFiles,
        injectSource: 'grok-signup-page',
        timeoutMs: 30000,
        retryDelayMs: 900,
        logMessage: '步骤 1：x.ai 注册页正在加载...',
      });

      await addLog('步骤 1：正在点击邮箱注册入口...');
      const result = await sendToContentScriptResilient('grok-signup-page', {
        type: 'EXECUTE_STEP',
        step: 1,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 15000,
        retryDelayMs: 700,
        logMessage: '步骤 1：x.ai 页面通信未就绪...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await completeStepFromBackground(1, {});
    }

    return { clearGrokSessionData, executeGrokStep1 };
  }

  return { createGrokStep1Executor };
});
