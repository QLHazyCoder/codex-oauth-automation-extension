(function attachBackgroundPlusCheckoutCreate(root, factory) {
  root.MultiPageBackgroundPlusCheckoutCreate = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPlusCheckoutCreateModule() {
  const PLUS_CHECKOUT_SOURCE = 'plus-checkout';
  const PLUS_CHECKOUT_ENTRY_URL = 'https://chatgpt.com/';
  const PLUS_CHECKOUT_INJECT_FILES = ['content/utils.js', 'content/plus-checkout.js'];
  const PLUS_PAYMENT_METHOD_PAYPAL = 'paypal';
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';
  const PLUS_PAYMENT_METHOD_GPC_HELPER = 'gpc-helper';
  const DEFAULT_GPC_HELPER_API_URL = 'https://gopay.hwork.pro';

  function createPlusCheckoutCreateExecutor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      ensureContentScriptReadyOnTabUntilStopped,
      fetch: fetchImpl = null,
      markCurrentRegistrationAccountUsed = null,
      registerTab,
      sendTabMessageUntilStopped,
      setState,
      sleepWithStop,
      waitForTabCompleteUntilStopped,
      throwIfStopped = () => {},
    } = deps;

    function normalizePlusPaymentMethod(value = '') {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      if (rootScope.GoPayUtils?.normalizePlusPaymentMethod) {
        return rootScope.GoPayUtils.normalizePlusPaymentMethod(value);
      }
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === PLUS_PAYMENT_METHOD_GPC_HELPER) {
        return PLUS_PAYMENT_METHOD_GPC_HELPER;
      }
      return normalized === PLUS_PAYMENT_METHOD_GOPAY ? PLUS_PAYMENT_METHOD_GOPAY : PLUS_PAYMENT_METHOD_PAYPAL;
    }

    function getCheckoutModeLabel(state = {}) {
      const paymentMethod = normalizePlusPaymentMethod(state?.plusPaymentMethod);
      if (paymentMethod === PLUS_PAYMENT_METHOD_GPC_HELPER) {
        return 'GPC 订阅页';
      }
      return paymentMethod === PLUS_PAYMENT_METHOD_GOPAY ? 'GoPay 订阅页' : 'Plus Checkout';
    }

    function getPlusPaymentMethodLabel(method = PLUS_PAYMENT_METHOD_PAYPAL) {
      const paymentMethod = normalizePlusPaymentMethod(method);
      if (paymentMethod === PLUS_PAYMENT_METHOD_GPC_HELPER) {
        return 'GPC';
      }
      return paymentMethod === PLUS_PAYMENT_METHOD_GOPAY ? 'GoPay' : 'PayPal';
    }

    async function openFreshChatGptTabForCheckoutCreate() {
      const tab = await chrome.tabs.create({ url: PLUS_CHECKOUT_ENTRY_URL, active: true });
      const tabId = Number(tab?.id);
      if (!Number.isInteger(tabId)) {
        throw new Error('步骤 6：打开 ChatGPT 页面失败，无法创建订阅页。');
      }
      if (typeof registerTab === 'function') {
        await registerTab(PLUS_CHECKOUT_SOURCE, tabId);
      }
      return tabId;
    }

    function normalizeHelperCountryCode(countryCode = '86') {
      const digits = String(countryCode || '').replace(/\D/g, '');
      return digits || '86';
    }

    function normalizeHelperPhoneNumber(phone = '', countryCode = '86') {
      const cleaned = String(phone || '').replace(/\D/g, '');
      const countryDigits = normalizeHelperCountryCode(countryCode);
      if (countryDigits && cleaned.startsWith(countryDigits) && cleaned.length > countryDigits.length) {
        return cleaned.slice(countryDigits.length);
      }
      return cleaned;
    }

    function resolveGpcHelperCardKey(state = {}) {
      const cardKey = String(state?.gopayHelperCardKey || state?.gpcCardKey || state?.cardKey || '').trim();
      if (!cardKey) {
        throw new Error('创建 GPC 订单失败：缺少卡密。');
      }
      return cardKey;
    }

    function resolveGpcHelperCustomerEmail(state = {}) {
      const email = String(
        state?.email
        || state?.currentEmail
        || state?.registrationEmail
        || state?.accountEmail
        || state?.mailboxEmail
        || ''
      ).trim().toLowerCase();
      if (!email) {
        throw new Error('创建 GPC 订单失败：缺少当前轮邮箱。');
      }
      return email;
    }

    function parseGpcAmount(value) {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? { amount: value, raw: String(value) } : null;
      }
      if (typeof value !== 'string') {
        return null;
      }
      const raw = String(value || '').trim();
      if (!raw || !/\d/.test(raw)) {
        return null;
      }
      const match = raw.match(/([+-]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|[+-]?\d+(?:[.,]\d{1,2})?)/);
      if (!match) {
        return null;
      }
      let numericText = String(match[1] || '').trim();
      const lastComma = numericText.lastIndexOf(',');
      const lastDot = numericText.lastIndexOf('.');
      if (lastComma > -1 && lastDot > -1) {
        const decimalSeparator = lastComma > lastDot ? ',' : '.';
        const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
        numericText = numericText
          .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
          .replace(decimalSeparator, '.');
      } else if (lastComma > -1) {
        numericText = numericText.replace(',', '.');
      }
      const amount = Number(numericText.replace(/[^\d.+-]/g, ''));
      return Number.isFinite(amount) ? { amount, raw } : null;
    }

    function isGpcAmountKey(key = '') {
      const normalized = String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (!normalized) {
        return false;
      }
      if (/(?:^|_)(?:id|guid|uuid|phone|country|postal|zip|code|count|status|time|timestamp|created|updated|expires|challenge|client|reference|currency|state)(?:_|$)/i.test(normalized)) {
        return false;
      }
      return /(?:amount|balance|total|due|payable|gross|subtotal|price|charge)/i.test(normalized);
    }

    function findGpcNonZeroAmount(payload = {}) {
      const seen = new Set();
      function visit(value, path = [], depth = 0) {
        if (value == null || depth > 10) {
          return null;
        }
        const key = path[path.length - 1] || '';
        if (isGpcAmountKey(key)) {
          const parsed = parseGpcAmount(value);
          if (parsed && Math.abs(parsed.amount) >= 0.005) {
            return { ...parsed, path: path.join('.') };
          }
        }
        if (typeof value !== 'object') {
          return null;
        }
        if (seen.has(value)) {
          return null;
        }
        seen.add(value);
        if (Array.isArray(value)) {
          for (let index = 0; index < value.length; index += 1) {
            const found = visit(value[index], [...path, String(index)], depth + 1);
            if (found) return found;
          }
          return null;
        }
        for (const [childKey, childValue] of Object.entries(value)) {
          const found = visit(childValue, [...path, childKey], depth + 1);
          if (found) return found;
        }
        return null;
      }
      return visit(payload);
    }

    async function abortGpcNonFreeTrialIfNeeded(data = {}, state = {}) {
      const nonZeroAmount = findGpcNonZeroAmount(data);
      if (!nonZeroAmount) {
        return;
      }
      const amountLabel = nonZeroAmount.raw || String(nonZeroAmount.amount);
      await addLog(`步骤 6：GPC 接口返回余额非 0（${amountLabel}），当前账号没有免费试用资格，将跳过当前账号。`, 'warn');
      if (typeof markCurrentRegistrationAccountUsed === 'function') {
        await markCurrentRegistrationAccountUsed(state, {
          reason: 'plus-checkout-non-free-trial',
          logPrefix: 'GPC：当前账号没有免费试用资格',
        });
      }
      throw new Error(`PLUS_CHECKOUT_NON_FREE_TRIAL::步骤 6：GPC 接口返回余额非 0（${amountLabel}），当前账号没有免费试用资格，已跳过支付提交。`);
    }

    function normalizeGpcHelperBaseUrl(apiUrl = '') {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      if (rootScope.GoPayUtils?.normalizeGpcHelperBaseUrl) {
        return rootScope.GoPayUtils.normalizeGpcHelperBaseUrl(apiUrl);
      }
      let normalized = String(apiUrl || DEFAULT_GPC_HELPER_API_URL).trim().replace(/\/+$/g, '');
      normalized = normalized.replace(/\/api\/checkout\/start$/i, '');
      normalized = normalized.replace(/\/api\/gopay\/(?:otp|pin)$/i, '');
      normalized = normalized.replace(/\/api\/card\/balance(?:\?.*)?$/i, '');
      return normalized || DEFAULT_GPC_HELPER_API_URL;
    }

    function buildGpcHelperApiUrl(apiUrl = '', path = '') {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      if (rootScope.GoPayUtils?.buildGpcHelperApiUrl) {
        return rootScope.GoPayUtils.buildGpcHelperApiUrl(apiUrl, path);
      }
      const baseUrl = normalizeGpcHelperBaseUrl(apiUrl);
      if (!baseUrl) {
        return '';
      }
      const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
      return `${baseUrl}${normalizedPath}`;
    }

    async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 30000) {
      const fetcher = typeof fetchImpl === 'function'
        ? fetchImpl
        : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
      if (typeof fetcher !== 'function') {
        throw new Error('当前运行环境不支持 fetch，无法调用 GPC API。');
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000)) : null;
      try {
        const response = await fetcher(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function readAccessTokenFromChatGptSessionTab(tabId) {
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);
      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 6：正在等待 ChatGPT 页面完成加载，再继续获取 accessToken...',
      });

      const sessionResult = await sendTabMessageUntilStopped(tabId, PLUS_CHECKOUT_SOURCE, {
        type: 'PLUS_CHECKOUT_GET_STATE',
        source: 'background',
        payload: {
          includeSession: true,
          includeAccessToken: true,
        },
      });
      if (sessionResult?.error) {
        throw new Error(sessionResult.error);
      }
      return String(sessionResult?.accessToken || sessionResult?.session?.accessToken || '').trim();
    }

    async function generateGpcCheckoutFromApi(accessToken = '', state = {}) {
      const token = String(accessToken || '').trim();
      if (!token) {
        throw new Error('创建 GPC 订单失败：缺少 accessToken。');
      }
      const apiUrl = buildGpcHelperApiUrl(state?.gopayHelperApiUrl, '/api/checkout/start');
      if (!apiUrl) {
        throw new Error('创建 GPC 订单失败：缺少 API 地址。');
      }
      const phoneNumber = String(state?.gopayHelperPhoneNumber || '').trim();
      const countryCode = normalizeHelperCountryCode(state?.gopayHelperCountryCode || '86');
      const pin = String(state?.gopayHelperPin || '').trim();
      const cardKey = resolveGpcHelperCardKey(state);
      if (!phoneNumber) {
        throw new Error('创建 GPC 订单失败：缺少手机号。');
      }
      if (!pin) {
        throw new Error('创建 GPC 订单失败：缺少 PIN。');
      }

      throwIfStopped();
      const payload = {
        token,
        entry_point: 'all_plans_pricing_modal',
        plan_name: 'chatgptplusplan',
        billing_details: { country: 'ID', currency: 'IDR' },
        promo_campaign: {
          promo_campaign_id: 'plus-1-month-free',
          is_coupon_from_query_param: false,
        },
        checkout_ui_mode: 'custom',
        proxy: { type: 'direct', url: '' },
        tax_region: {
          country: 'US',
          line1: '1208 Oakdale Street',
          city: 'Jonesboro',
          postal_code: '72401',
          state: 'AR',
        },
        customer_email: resolveGpcHelperCustomerEmail(state),
        card_key: cardKey,
        gopay_link: {
          type: 'gopay',
          country_code: countryCode,
          phone_number: normalizeHelperPhoneNumber(phoneNumber, countryCode),
        },
      };

      const { response, data } = await fetchJsonWithTimeout(apiUrl, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }, 30000);

      const referenceId = String(data?.reference_id || data?.referenceId || '').trim();
      const gopayGuid = String(data?.gopay_guid || data?.gopayGuid || '').trim();
      const redirectUrl = String(data?.redirect_url || data?.redirectUrl || '').trim();
      const nextAction = String(data?.next_action || data?.nextAction || '').trim();
      const flowId = String(data?.flow_id || data?.flowId || '').trim();
      const challengeId = String(data?.challenge_id || data?.challengeId || '').trim();

      if (response?.ok) {
        await abortGpcNonFreeTrialIfNeeded(data, state);
      }

      if (!response?.ok || !referenceId) {
        const rootScope = typeof self !== 'undefined' ? self : globalThis;
        const detail = rootScope.GoPayUtils?.extractGpcResponseErrorDetail
          ? rootScope.GoPayUtils.extractGpcResponseErrorDetail(data, response?.status || 0)
          : (data?.detail || data?.message || data?.error || `HTTP ${response?.status || 0}`);
        throw new Error(`创建 GPC 订单失败：${detail}`);
      }

      return {
        referenceId,
        gopayGuid,
        redirectUrl,
        nextAction,
        flowId,
        challengeId,
        responsePayload: data && typeof data === 'object' && !Array.isArray(data) ? data : null,
        country: 'ID',
        currency: 'IDR',
        checkoutSource: PLUS_PAYMENT_METHOD_GPC_HELPER,
      };
    }

    async function executeGpcCheckoutCreate(state = {}) {
      let accessToken = String(state?.contributionAccessToken || state?.accessToken || state?.chatgptAccessToken || '').trim();
      if (!accessToken) {
        await addLog('步骤 6：正在获取 accessToken...', 'info');
        const tokenTabId = await openFreshChatGptTabForCheckoutCreate();
        try {
          accessToken = await readAccessTokenFromChatGptSessionTab(tokenTabId);
        } finally {
          if (chrome?.tabs?.remove && Number.isInteger(tokenTabId)) {
            await chrome.tabs.remove(tokenTabId).catch(() => {});
          }
        }
      }
      if (!accessToken) {
        throw new Error('步骤 6：GPC 模式获取 accessToken 失败。');
      }

      await addLog('步骤 6：正在调用 GPC 接口创建订单...', 'info');
      const result = await generateGpcCheckoutFromApi(accessToken, state);
      await setState({
        plusCheckoutTabId: null,
        plusCheckoutUrl: '',
        plusCheckoutCountry: result.country || 'ID',
        plusCheckoutCurrency: result.currency || 'IDR',
        plusCheckoutSource: result.checkoutSource,
        gopayHelperReferenceId: result.referenceId,
        gopayHelperGoPayGuid: result.gopayGuid,
        gopayHelperRedirectUrl: result.redirectUrl,
        gopayHelperNextAction: result.nextAction,
        gopayHelperFlowId: result.flowId,
        gopayHelperChallengeId: result.challengeId,
        gopayHelperStartPayload: result.responsePayload,
      });
      await addLog('步骤 6：GPC 订单已创建，准备继续下一步。', 'info');
      await completeStepFromBackground(6, {
        plusCheckoutCountry: result.country || 'ID',
        plusCheckoutCurrency: result.currency || 'IDR',
        plusCheckoutSource: result.checkoutSource,
      });
    }

    async function executePlusCheckoutCreate(state = {}) {
      const paymentMethod = normalizePlusPaymentMethod(state?.plusPaymentMethod);
      if (paymentMethod === PLUS_PAYMENT_METHOD_GPC_HELPER) {
        await executeGpcCheckoutCreate(state);
        return;
      }

      const paymentMethodLabel = getPlusPaymentMethodLabel(paymentMethod);
      const checkoutModeLabel = getCheckoutModeLabel(state);
      await addLog(`步骤 6：正在打开新的 ChatGPT 会话，准备创建${checkoutModeLabel}...`, 'info');
      const tabId = await openFreshChatGptTabForCheckoutCreate();

      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);
      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 6：正在等待 ChatGPT 页面完成加载，再继续创建订阅页...',
      });

      const result = await sendTabMessageUntilStopped(tabId, PLUS_CHECKOUT_SOURCE, {
        type: 'CREATE_PLUS_CHECKOUT',
        source: 'background',
        payload: { paymentMethod },
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      if (!result?.checkoutUrl) {
        throw new Error(`步骤 6：${checkoutModeLabel}未返回可用的订阅链接。`);
      }

      await addLog(`步骤 6：${checkoutModeLabel}已创建，正在打开订阅页面...`, 'ok');
      await chrome.tabs.update(tabId, { url: result.checkoutUrl, active: true });
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);
      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 6：正在等待订阅页面完成加载...',
      });

      await setState({
        plusCheckoutTabId: tabId,
        plusCheckoutUrl: result.checkoutUrl,
        plusCheckoutCountry: result.country || 'DE',
        plusCheckoutCurrency: result.currency || 'EUR',
        plusCheckoutSource: '',
      });

      await addLog(`步骤 6：Plus Checkout 页面已就绪（${paymentMethodLabel} / ${result.country || 'DE'} ${result.currency || 'EUR'}），准备继续下一步。`, 'info');

      await completeStepFromBackground(6, {
        plusCheckoutCountry: result.country || 'DE',
        plusCheckoutCurrency: result.currency || 'EUR',
      });
    }

    return {
      executePlusCheckoutCreate,
    };
  }

  return {
    createPlusCheckoutCreateExecutor,
  };
});
