// content/plus-checkout.js — ChatGPT Plus checkout helper.

(function attachPlusCheckoutContentScript() {
console.log('[MultiPage:plus-checkout] Content script loaded on', location.href);
window.__MULTIPAGE_PLUS_CHECKOUT_READY__ = true;

const PLUS_CHECKOUT_LISTENER_SENTINEL = 'data-multipage-plus-checkout-listener';
const PLUS_CHECKOUT_BASE_PAYLOAD = {
  entry_point: 'all_plans_pricing_modal',
  plan_name: 'chatgptplusplan',
  checkout_ui_mode: 'custom',
  promo_campaign: {
    promo_campaign_id: 'plus-1-month-free',
    is_coupon_from_query_param: false,
  },
};
const PLUS_CHECKOUT_CONFIGS = {
  paypal: {
    billing_details: {
      country: 'DE',
      currency: 'EUR',
    },
    checkoutUrlPrefix: 'https://chatgpt.com/checkout/openai_ie/',
    paymentLabel: 'PayPal',
  },
  gopay: {
    billing_details: {
      country: 'ID',
      currency: 'IDR',
    },
    checkoutUrlPrefix: 'https://chatgpt.com/checkout/openai_llc/',
    paymentLabel: 'GoPay',
  },
};
const PAYPAL_DIAGNOSTIC_LOG_INTERVAL_MS = 5000;

if (document.documentElement.getAttribute(PLUS_CHECKOUT_LISTENER_SENTINEL) !== '1') {
  document.documentElement.setAttribute(PLUS_CHECKOUT_LISTENER_SENTINEL, '1');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message.type === 'CREATE_PLUS_CHECKOUT'
      || message.type === 'FILL_PLUS_BILLING_AND_SUBMIT'
      || message.type === 'PLUS_CHECKOUT_SELECT_PAYPAL'
      || message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS'
      || message.type === 'PLUS_CHECKOUT_FILL_ADDRESS_QUERY'
      || message.type === 'PLUS_CHECKOUT_SELECT_ADDRESS_SUGGESTION'
      || message.type === 'PLUS_CHECKOUT_ENSURE_BILLING_ADDRESS'
      || message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE'
      || message.type === 'PLUS_CHECKOUT_GET_STATE'
    ) {
      resetStopState();
      handlePlusCheckoutCommand(message).then((result) => {
        sendResponse({ ok: true, ...(result || {}) });
      }).catch((err) => {
        if (isStopError(err)) {
          sendResponse({ stopped: true, error: err.message });
          return;
        }
        sendResponse({ error: err.message });
      });
      return true;
    }
  });
} else {
  console.log('[MultiPage:plus-checkout] 消息监听已存在，跳过重复注册');
}

async function handlePlusCheckoutCommand(message) {
  switch (message.type) {
    case 'CREATE_PLUS_CHECKOUT':
      return createPlusCheckoutSession(message.payload || {});
    case 'FILL_PLUS_BILLING_AND_SUBMIT':
      return fillPlusBillingAndSubmit(message.payload || {});
    case 'PLUS_CHECKOUT_SELECT_PAYPAL':
      return selectPlusPayPalPaymentMethod();
    case 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS':
      return fillPlusBillingAddress(message.payload || {});
    case 'PLUS_CHECKOUT_FILL_ADDRESS_QUERY':
      return fillPlusAddressQuery(message.payload || {});
    case 'PLUS_CHECKOUT_SELECT_ADDRESS_SUGGESTION':
      return selectPlusAddressSuggestion(message.payload || {});
    case 'PLUS_CHECKOUT_ENSURE_BILLING_ADDRESS':
      return ensurePlusStructuredBillingAddress(message.payload || {});
    case 'PLUS_CHECKOUT_CLICK_SUBSCRIBE':
      return clickPlusSubscribe();
    case 'PLUS_CHECKOUT_GET_STATE':
      return inspectPlusCheckoutState(message.payload || {});
    default:
      throw new Error(`plus-checkout.js 不处理消息：${message.type}`);
  }
}

async function waitUntil(predicate, options = {}) {
  const intervalMs = Math.max(50, Math.floor(Number(options.intervalMs) || 250));
  const label = String(options.label || '条件').trim() || '条件';
  while (true) {
    throwIfStopped();
    const value = await predicate();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
}

async function waitForDocumentComplete() {
  await waitUntil(() => document.readyState === 'complete', {
    label: '页面加载完成',
    intervalMs: 200,
  });
  await sleep(1000);
}

function isVisibleElement(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(rect.width) > 0
    && Number(rect.height) > 0;
}

function normalizeText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizePlusPaymentMethod(value = '') {
  return String(value || '').trim().toLowerCase() === 'gopay' ? 'gopay' : 'paypal';
}

function buildPlusCheckoutConfig(payload = {}) {
  const paymentMethod = normalizePlusPaymentMethod(payload.paymentMethod);
  const config = PLUS_CHECKOUT_CONFIGS[paymentMethod] || PLUS_CHECKOUT_CONFIGS.paypal;
  return {
    paymentMethod,
    paymentLabel: config.paymentLabel,
    checkoutUrlPrefix: config.checkoutUrlPrefix,
    checkoutPayload: {
      ...PLUS_CHECKOUT_BASE_PAYLOAD,
      billing_details: {
        country: config.billing_details.country,
        currency: config.billing_details.currency,
      },
    },
  };
}

function getActionText(el) {
  return normalizeText([
    el?.textContent,
    el?.value,
    el?.getAttribute?.('aria-label'),
    el?.getAttribute?.('title'),
    el?.getAttribute?.('placeholder'),
    el?.getAttribute?.('name'),
    el?.id,
  ].filter(Boolean).join(' '));
}

function getSearchText(el) {
  const datasetValues = el?.dataset ? Object.values(el.dataset) : [];
  return normalizeText([
    getActionText(el),
    el?.getAttribute?.('alt'),
    el?.getAttribute?.('role'),
    el?.getAttribute?.('data-testid'),
    el?.getAttribute?.('src'),
    el?.getAttribute?.('href'),
    el?.getAttribute?.('xlink:href'),
    typeof el?.className === 'string' ? el.className : el?.getAttribute?.('class'),
    ...datasetValues,
  ].filter(Boolean).join(' '));
}

function getFieldText(el) {
  const id = el?.id || '';
  const labels = [];
  if (id) {
    labels.push(...Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)).map((label) => label.textContent));
  }
  const wrappingLabel = el?.closest?.('label');
  if (wrappingLabel) {
    labels.push(wrappingLabel.textContent);
  }
  const container = el?.closest?.('[data-testid], [class], div, section, fieldset');
  if (container) {
    labels.push(container.textContent);
  }
  return normalizeText([
    getActionText(el),
    ...labels,
  ].filter(Boolean).join(' '));
}

function getCombinedSearchText(el) {
  return normalizeText([
    getSearchText(el),
    getFieldText(el),
  ].filter(Boolean).join(' '));
}

function getVisibleControls(selector) {
  return Array.from(document.querySelectorAll(selector)).filter(isVisibleElement);
}

function findClickableByText(patterns) {
  const normalizedPatterns = (Array.isArray(patterns) ? patterns : [patterns])
    .filter(Boolean);
  const candidates = getVisibleControls('button, a, [role="button"], input[type="button"], input[type="submit"], [tabindex]');
  return candidates.find((el) => {
    const text = getActionText(el);
    return normalizedPatterns.some((pattern) => pattern.test(text));
  }) || null;
}

function isEnabledControl(el) {
  return Boolean(el)
    && !el.disabled
    && el.getAttribute?.('aria-disabled') !== 'true';
}

function getVisibleTextInputs() {
  return getVisibleControls('input, textarea')
    .filter((el) => {
      const type = String(el.getAttribute('type') || el.type || '').trim().toLowerCase();
      return !['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(type);
    });
}

function findInputByFieldText(patterns, options = {}) {
  const inputs = getVisibleTextInputs();
  const excluded = options.exclude || (() => false);
  return inputs.find((input) => {
    if (excluded(input)) return false;
    const text = getFieldText(input);
    return patterns.some((pattern) => pattern.test(text));
  }) || null;
}

function getDirectFieldHintText(el) {
  const id = el?.id || '';
  const labels = [];
  if (id) {
    labels.push(...Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)).map((label) => label.textContent));
  }
  const wrappingLabel = el?.closest?.('label');
  if (wrappingLabel) {
    labels.push(wrappingLabel.textContent);
  }
  return normalizeText([
    getActionText(el),
    ...labels,
  ].filter(Boolean).join(' '));
}

function isNonAddressSearchInput(input) {
  const directText = getDirectFieldHintText(input);
  const type = String(input?.getAttribute?.('type') || input?.type || '').trim().toLowerCase();
  return /name|email|e-mail|phone|tel|password|coupon|promo|country|region|postal|zip|city|state|province|card|card\s*number|expiry|expiration|security|cvc|cvv|cc-/i.test(directText)
    || ['email', 'tel', 'password'].includes(type);
}

function isDocumentLevelContainer(el) {
  return !el
    || el === document.documentElement
    || el === document.body
    || ['HTML', 'BODY', 'MAIN'].includes(el.tagName);
}

function isPaymentCardSized(el) {
  if (!isVisibleElement(el) || isDocumentLevelContainer(el)) return false;
  const rect = el.getBoundingClientRect();
  const maxWidth = Math.max(320, Math.min(window.innerWidth * 0.95, 900));
  const maxHeight = Math.max(140, Math.min(window.innerHeight * 0.45, 320));
  return rect.width >= 64
    && rect.height >= 28
    && rect.width <= maxWidth
    && rect.height <= maxHeight;
}

function findInteractiveAncestor(el) {
  let current = el;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    if (!isVisibleElement(current) || isDocumentLevelContainer(current)) continue;
    if (current.matches?.('button, a, label, [role="button"], [role="radio"], input[type="radio"], [tabindex]')) {
      return current;
    }
  }
  return null;
}

function findPaymentCardAncestor(el, pattern) {
  let current = el;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    if (!isVisibleElement(current)) continue;
    if (isDocumentLevelContainer(current)) break;
    const text = getSearchText(current);
    if (pattern.test(text) && isPaymentCardSized(current)) {
      return current;
    }
  }
  return null;
}

function getAncestorChainSummary(el, limit = 6) {
  const chain = [];
  let current = el;
  for (let depth = 0; current && depth < limit; depth += 1, current = current.parentElement) {
    if (isDocumentLevelContainer(current)) break;
    const rect = current.getBoundingClientRect();
    chain.push({
      tag: String(current.tagName || '').toLowerCase(),
      role: current.getAttribute?.('role') || '',
      id: current.id || '',
      className: typeof current.className === 'string' ? current.className.slice(0, 120) : '',
      testId: current.getAttribute?.('data-testid') || '',
      ariaLabel: current.getAttribute?.('aria-label') || '',
      ariaChecked: current.getAttribute?.('aria-checked') || '',
      ariaSelected: current.getAttribute?.('aria-selected') || '',
      rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      text: getCombinedSearchText(current).slice(0, 180),
    });
  }
  return chain;
}

function getPayPalSearchCandidates() {
  const selector = [
    'button',
    'a',
    'label',
    '[role="button"]',
    '[role="radio"]',
    'input[type="radio"]',
    '[tabindex]',
    '[data-testid]',
    '[aria-label]',
    '[title]',
    'img',
    'svg',
    'span',
    'div',
  ].join(', ');

  return getVisibleControls(selector)
    .filter((el) => /paypal/i.test(getCombinedSearchText(el)))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height);
    });
}

function findPayPalPaymentMethodTarget() {
  const paypalPattern = /paypal/i;
  const directClickable = findClickableByText([paypalPattern]);
  if (directClickable) {
    return directClickable;
  }

  const radios = getVisibleControls('input[type="radio"], [role="radio"]');
  const paypalRadio = radios.find((el) => paypalPattern.test(getCombinedSearchText(el)));
  if (paypalRadio) {
    return paypalRadio;
  }

  const candidates = getPayPalSearchCandidates();
  for (const candidate of candidates) {
    const interactive = findInteractiveAncestor(candidate);
    if (interactive && paypalPattern.test(getCombinedSearchText(interactive))) {
      return interactive;
    }
    const card = findPaymentCardAncestor(candidate, paypalPattern);
    if (card) {
      return card;
    }
  }

  return null;
}

function summarizeElementForDebug(el) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    tag: String(el.tagName || '').toLowerCase(),
    role: el.getAttribute?.('role') || '',
    text: getSearchText(el).slice(0, 160),
    rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    chain: getAncestorChainSummary(el, 3),
  };
}

function getPayPalCandidateSummaries(limit = 6) {
  return getPayPalSearchCandidates()
    .map(summarizeElementForDebug)
    .filter(Boolean)
    .slice(0, limit);
}

function getPaymentTextPreview(limit = 10) {
  const seen = new Set();
  const pattern = /paypal|card|payment|billing|subscribe|pay|银行卡|付款|支付|账单|订阅/i;
  return getVisibleControls('button, a, label, [role="button"], [role="radio"], input[type="radio"], input[type="button"], input[type="submit"], [data-testid]')
    .map((el) => getCombinedSearchText(el))
    .filter((text) => text && pattern.test(text))
    .map((text) => text.slice(0, 180))
    .filter((text) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .slice(0, limit);
}

function getPayPalDiagnostics(reason = '') {
  return {
    reason,
    url: location.href,
    readyState: document.readyState,
    paypalCandidates: getPayPalCandidateSummaries(),
    paymentTextPreview: getPaymentTextPreview(),
    cardFieldsVisible: hasCreditCardFields(),
    billingFieldsVisible: hasBillingAddressFields(),
  };
}

function writePayPalDiagnostics(reason, level = 'info') {
  const diagnostics = getPayPalDiagnostics(reason);
  const writer = typeof console[level] === 'function' ? console[level] : console.info;
  writer.call(console, '[MultiPage:plus-checkout] PayPal diagnostics', diagnostics);
  log(`Plus Checkout：${reason}。PayPal 候选 ${diagnostics.paypalCandidates.length} 个，银行卡字段${diagnostics.cardFieldsVisible ? '仍可见' : '不可见'}。`, level === 'error' ? 'error' : 'warn');
  return diagnostics;
}

async function createPlusCheckoutSession(payload = {}) {
  await waitForDocumentComplete();
  const checkoutConfig = buildPlusCheckoutConfig(payload);
  log('Plus：正在读取 ChatGPT 登录会话...');

  const sessionResponse = await fetch('/api/auth/session', {
    credentials: 'include',
  });
  const session = await sessionResponse.json().catch(() => ({}));
  const accessToken = session?.accessToken;
  if (!accessToken) {
    throw new Error('请先登录 ChatGPT，当前页面未返回可用 accessToken。');
  }

  log('Plus：正在创建 checkout 会话...');
  const response = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(checkoutConfig.checkoutPayload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.checkout_session_id) {
    const detail = data?.detail || data?.message || `HTTP ${response.status}`;
    throw new Error(`创建 Plus Checkout 失败：${detail}`);
  }

  return {
    checkoutUrl: `${checkoutConfig.checkoutUrlPrefix}${data.checkout_session_id}`,
    country: checkoutConfig.checkoutPayload.billing_details.country,
    currency: checkoutConfig.checkoutPayload.billing_details.currency,
    paymentMethod: checkoutConfig.paymentMethod,
  };
}

async function selectPayPalPaymentMethod() {
  let lastDiagnosticsAt = 0;
  const target = await waitUntil(() => {
    const currentTarget = findPayPalPaymentMethodTarget();
    if (currentTarget) {
      return currentTarget;
    }

    const now = Date.now();
    if (!lastDiagnosticsAt || now - lastDiagnosticsAt >= PAYPAL_DIAGNOSTIC_LOG_INTERVAL_MS) {
      lastDiagnosticsAt = now;
      writePayPalDiagnostics('正在等待可点击的 PayPal 付款方式', 'warn');
    }
    return null;
  }, {
    label: 'PayPal 付款方式',
    intervalMs: 250,
  });
  console.info('[MultiPage:plus-checkout] PayPal target selected', summarizeElementForDebug(target));
  simulateClick(target);
  log('Plus Checkout：已点击 PayPal 付款方式，正在确认选中状态。');

  if (!await waitForPayPalPaymentMethodActive()) {
    const diagnostics = writePayPalDiagnostics('点击 PayPal 后页面仍未进入 PayPal 账单表单', 'error');
    throw new Error(`Plus Checkout：已尝试点击 PayPal，但页面未切换到 PayPal 表单。请提供控制台 PayPal diagnostics 结构。候选数量：${diagnostics.paypalCandidates.length}，银行卡字段仍可见：${diagnostics.cardFieldsVisible ? '是' : '否'}。`);
  }

  log('Plus Checkout：已确认 PayPal 付款方式生效。');
  return true;
}

async function selectPlusPayPalPaymentMethod() {
  await waitForDocumentComplete();
  await selectPayPalPaymentMethod();
  return {
    paymentSelected: true,
  };
}

async function fillFullName(fullName) {
  const value = normalizeText(fullName);
  if (!value) return false;
  const input = findInputByFieldText([
    /full\s*name|name\s*on|cardholder|billing\s*name/i,
    /姓名|全名|持卡人/i,
  ]);
  if (!input) {
    return false;
  }
  fillInput(input, value);
  await sleep(300);
  return true;
}

function readCountryText() {
  const countryInput = findInputByFieldText([
    /country|region/i,
    /国家|地区/i,
  ]);
  if (countryInput?.value) {
    return countryInput.value;
  }
  const countrySelect = getVisibleControls('select').find((select) => /country|region|国家|地区/i.test(getFieldText(select)));
  if (countrySelect) {
    const option = countrySelect.selectedOptions?.[0];
    return option?.textContent || countrySelect.value || '';
  }
  const countryDropdown = findCountryDropdown();
  if (countryDropdown) {
    return getCountryDropdownValue(countryDropdown);
  }
  return '';
}

function isLikelyAddressSearchInput(input) {
  const text = getFieldText(input);
  if (isNonAddressSearchInput(input)) {
    return false;
  }
  if (/name|email|e-mail|phone|tel|password|coupon|promo|country|region|postal|zip|city|state|province|card|card\s*number|expiry|expiration|security|cvc|cvv|cc-|全名|姓名|邮箱|电话|密码|国家|地区|邮编|城市|省|州|银行卡|卡号|有效期|安全码/i.test(text)) {
    return false;
  }
  if (/address|street|billing|search|line\s*1|地址|街道|账单/i.test(text)) {
    return true;
  }
  return false;
}

function hasCreditCardFields() {
  return getVisibleTextInputs().some((input) => {
    const text = getFieldText(input);
    return /card\s*number|card|expiry|expiration|security\s*code|cvc|cvv|银行卡|卡号|有效期|安全码/i.test(text);
  });
}

function hasBillingAddressFields() {
  return getVisibleTextInputs().some((input) => {
    const text = getFieldText(input);
    return /address|street|billing|line\s*1|地址|街道|账单/i.test(text)
      && !/card\s*number|card|expiry|expiration|security|cvc|cvv|银行卡|卡号|有效期|安全码/i.test(text);
  });
}

function hasSelectedPayPalControl() {
  const paypalPattern = /paypal/i;
  const candidates = getPayPalSearchCandidates();
  return candidates.some((candidate) => {
    let current = candidate;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      if (isDocumentLevelContainer(current)) break;
      if (!paypalPattern.test(getCombinedSearchText(current))) continue;
      const className = typeof current.className === 'string' ? current.className : current.getAttribute?.('class') || '';
      if (
        current.checked === true
        || current.getAttribute?.('aria-checked') === 'true'
        || current.getAttribute?.('aria-selected') === 'true'
        || current.getAttribute?.('data-state') === 'checked'
        || current.getAttribute?.('data-selected') === 'true'
        || /\b(selected|checked|active)\b/i.test(className)
      ) {
        return true;
      }
    }
    return false;
  });
}

function isPayPalPaymentMethodActive() {
  return hasSelectedPayPalControl();
}

async function waitForPayPalPaymentMethodActive(timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    throwIfStopped();
    if (isPayPalPaymentMethodActive()) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function findAddressSearchInput() {
  return waitUntil(() => {
    const direct = findInputByFieldText([
      /address|street|billing|search|line\s*1/i,
      /地址|街道|账单/i,
    ], {
      exclude: (input) => /city|state|province|postal|zip|country|城市|省|州|邮编|国家|地区/i.test(getFieldText(input)),
    });
    if (direct && !isNonAddressSearchInput(direct)) return direct;
    const candidates = getVisibleTextInputs().filter(isLikelyAddressSearchInput);
    return candidates[0] || null;
  }, {
    label: '地址搜索输入框',
    intervalMs: 250,
  });
}

function getAddressSuggestions() {
  const selectors = [
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    '.pac-container .pac-item',
    '[data-testid*="address" i] [role="option"]',
    'li',
  ];
  const seen = new Set();
  const results = [];
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (!isVisibleElement(el)) continue;
      const text = normalizeText(el.textContent || el.getAttribute?.('aria-label') || '');
      if (!text || text.length < 3) continue;
      const key = `${selector}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(el);
    }
  }
  return results;
}

async function selectAddressSuggestion(seed) {
  await fillAddressQuery(seed);
  return clickAddressSuggestion(seed);
}

async function clickAddressSuggestion(seed = {}) {
  const suggestions = await waitUntil(() => {
    const options = getAddressSuggestions();
    return options.length ? options : null;
  }, {
    label: '地址推荐列表',
    intervalMs: 250,
  });

  const suggestionIndex = Math.max(0, Math.min(
    suggestions.length - 1,
    Math.floor(Number(seed.suggestionIndex) || 0)
  ));
  const target = suggestions[suggestionIndex] || suggestions[0];
  simulateClick(target);
  await sleep(1200);
  return {
    selectedText: normalizeText(target.textContent || ''),
    suggestionIndex,
  };
}

async function fillAddressQuery(seed = {}) {
  const addressInput = await findAddressSearchInput();
  fillInput(addressInput, seed.query || 'Berlin Mitte');
  await sleep(800);
  return {
    filled: true,
  };
}

function getRegionCandidates(value) {
  const raw = normalizeText(value);
  if (!raw) return [];
  const aliases = {
    act: 'Australian Capital Territory',
    nsw: 'New South Wales',
    nt: 'Northern Territory',
    qld: 'Queensland',
    sa: 'South Australia',
    tas: 'Tasmania',
    vic: 'Victoria',
    wa: 'Western Australia',
    tokyo: '東京都',
    osaka: '大阪府',
  };
  const compact = raw.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  const candidates = [raw];
  if (aliases[compact]) {
    candidates.push(aliases[compact]);
  }
  for (const [abbr, name] of Object.entries(aliases)) {
    const compactName = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    if (compact === compactName) {
      candidates.push(abbr.toUpperCase());
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

function getCountryCandidates(value = '') {
  const raw = normalizeText(value);
  const compact = raw.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  const aliases = {
    AR: ['Argentina', '阿根廷'],
    AU: ['Australia', '澳大利亚'],
    CA: ['Canada', '加拿大'],
    CN: ['China', '中国'],
    DE: ['Germany', 'Deutschland', '德国'],
    ES: ['Spain', '西班牙'],
    FR: ['France', '法国'],
    GB: ['United Kingdom', 'UK', 'Britain', 'England', '英国'],
    HK: ['Hong Kong', '香港'],
    IT: ['Italy', '意大利'],
    JP: ['Japan', '日本', '日本国'],
    KR: ['Korea', 'South Korea', '韩国'],
    MY: ['Malaysia', '马来西亚'],
    NL: ['Netherlands', 'Holland', '荷兰'],
    PH: ['Philippines', '菲律宾'],
    RU: ['Russia', '俄罗斯'],
    SG: ['Singapore', '新加坡'],
    TH: ['Thailand', '泰国'],
    TR: ['Turkey', 'Turkiye', '土耳其'],
    TW: ['Taiwan', '台湾'],
    US: ['United States', 'United States of America', 'USA', '美国'],
    VN: ['Vietnam', '越南'],
  };
  const direct = aliases[String(raw || '').trim().toUpperCase()] || [];
  const matched = Object.entries(aliases).find(([code, names]) => {
    if (String(code).toLowerCase() === compact) return true;
    return names.some((name) => {
      const normalizedName = normalizeText(name).toLowerCase();
      const compactName = normalizedName.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      return compact === compactName || normalizedName === raw.toLowerCase();
    });
  });
  return Array.from(new Set([raw, ...direct, ...(matched ? matched[1] : [])].filter(Boolean)));
}

function matchesCountryOption(text, desiredValue) {
  const normalizedText = normalizeText(text).toLowerCase();
  const compactText = normalizedText.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  if (!compactText) return false;
  return getCountryCandidates(desiredValue).some((candidate) => {
    const normalizedCandidate = normalizeText(candidate).toLowerCase();
    const compactCandidate = normalizedCandidate.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    if (!compactCandidate) return false;
    return normalizedText === normalizedCandidate
      || compactText === compactCandidate
      || (compactCandidate.length > 3 && compactText.includes(compactCandidate));
  });
}

function findCountryDropdown() {
  const controls = getVisibleControls('select, button, [role="button"], [role="combobox"], [aria-haspopup="listbox"]');
  return controls.find((control) => {
    if (!isEnabledControl(control) || isDocumentLevelContainer(control)) return false;
    const text = getFieldText(control);
    return /country/i.test(text) || /\u56fd\u5bb6|\u56fd\u5bb6\u6216\u5730\u533a/.test(text);
  }) || null;
}

function getCountryDropdownValue(control) {
  if (!control) return '';
  if (String(control.tagName || '').toUpperCase() === 'SELECT') {
    const selected = control.selectedOptions?.[0];
    return normalizeText(selected?.textContent || control.value || '');
  }
  return normalizeText(
    control.getAttribute?.('aria-valuetext')
    || control.getAttribute?.('aria-label')
    || control.getAttribute?.('data-value')
    || control.textContent
    || ''
  );
}

function matchesRegionOption(text, desiredValue) {
  const normalizedText = normalizeText(text).toLowerCase();
  const compactText = normalizedText.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  if (!compactText) return false;
  return getRegionCandidates(desiredValue).some((candidate) => {
    const normalizedCandidate = normalizeText(candidate).toLowerCase();
    const compactCandidate = normalizedCandidate.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    if (!compactCandidate) return false;
    return normalizedText === normalizedCandidate
      || compactText === compactCandidate
      || (compactCandidate.length > 3 && compactText.includes(compactCandidate));
  });
}

function findRegionDropdown() {
  const controls = getVisibleControls('select, button, [role="button"], [role="combobox"], [aria-haspopup="listbox"]');
  return controls.find((control) => {
    if (!isEnabledControl(control) || isDocumentLevelContainer(control)) return false;
    const text = getFieldText(control);
    if (/country/i.test(text) || /\u56fd\u5bb6|\u5730\u533a/.test(text)) return false;
    return /state|province|county/i.test(text)
      || /(?:^|\s)region(?:\s|$)/i.test(text)
      || /\u5dde|\u7701|\u8f96\u533a|\u90fd\u9053\u5e9c\u53bf/.test(text);
  }) || null;
}

function getRegionDropdownValue(control) {
  if (!control) return '';
  if (String(control.tagName || '').toUpperCase() === 'SELECT') {
    const selected = control.selectedOptions?.[0];
    return normalizeText(selected?.textContent || control.value || '');
  }
  return normalizeText(
    control.getAttribute?.('aria-valuetext')
    || control.getAttribute?.('aria-label')
    || control.getAttribute?.('data-value')
    || control.textContent
    || ''
  );
}

function getVisibleRegionOptions() {
  const selectors = [
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    'li',
  ];
  const seen = new Set();
  const options = [];
  for (const selector of selectors) {
    for (const option of Array.from(document.querySelectorAll(selector))) {
      if (!isVisibleElement(option)) continue;
      const text = normalizeText(getActionText(option) || option.textContent || '');
      if (!text || seen.has(text)) continue;
      seen.add(text);
      options.push(option);
    }
  }
  return options;
}

async function selectRegionDropdown(regionDropdown, value) {
  if (!regionDropdown || !value) return false;
  if (matchesRegionOption(getRegionDropdownValue(regionDropdown), value)) {
    return false;
  }

  if (String(regionDropdown.tagName || '').toUpperCase() === 'SELECT') {
    const option = Array.from(regionDropdown.options || []).find((item) => (
      matchesRegionOption(item.textContent || '', value)
      || matchesRegionOption(item.value || '', value)
    ));
    if (!option) {
      throw new Error(`Plus Checkout: state dropdown option "${value}" was not found.`);
    }
    regionDropdown.value = option.value;
    option.selected = true;
    regionDropdown.dispatchEvent(new Event('input', { bubbles: true }));
    regionDropdown.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  simulateClick(regionDropdown);
  await sleep(250);
  const startedAt = Date.now();
  let option = null;
  while (Date.now() - startedAt < 2500) {
    throwIfStopped();
    option = getVisibleRegionOptions().find((item) => (
      matchesRegionOption(getActionText(item) || item.textContent || '', value)
    ));
    if (option) break;
    await sleep(100);
  }
  if (!option) {
    const visibleOptions = getVisibleRegionOptions()
      .map((item) => normalizeText(getActionText(item) || item.textContent || ''))
      .filter(Boolean)
      .slice(0, 12)
      .join(' | ');
    throw new Error(`Plus Checkout: state dropdown option "${value}" was not found. Visible options: ${visibleOptions || 'none'}.`);
  }
  simulateClick(option);
  await sleep(500);
  return true;
}

async function selectCountryDropdown(countryDropdown, value) {
  if (!countryDropdown || !value) return false;
  if (matchesCountryOption(getCountryDropdownValue(countryDropdown), value)) {
    return false;
  }

  if (String(countryDropdown.tagName || '').toUpperCase() === 'SELECT') {
    const option = Array.from(countryDropdown.options || []).find((item) => (
      matchesCountryOption(item.textContent || '', value)
      || matchesCountryOption(item.value || '', value)
    ));
    if (!option) {
      throw new Error(`Plus Checkout: country dropdown option "${value}" was not found.`);
    }
    countryDropdown.value = option.value;
    option.selected = true;
    countryDropdown.dispatchEvent(new Event('input', { bubbles: true }));
    countryDropdown.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);
    return true;
  }

  simulateClick(countryDropdown);
  await sleep(250);
  const startedAt = Date.now();
  let option = null;
  while (Date.now() - startedAt < 2500) {
    throwIfStopped();
    option = getVisibleRegionOptions().find((item) => (
      matchesCountryOption(getActionText(item) || item.textContent || '', value)
    ));
    if (option) break;
    await sleep(100);
  }
  if (!option) {
    const visibleOptions = getVisibleRegionOptions()
      .map((item) => normalizeText(getActionText(item) || item.textContent || ''))
      .filter(Boolean)
      .slice(0, 12)
      .join(' | ');
    throw new Error(`Plus Checkout: country dropdown option "${value}" was not found. Visible options: ${visibleOptions || 'none'}.`);
  }
  simulateClick(option);
  await sleep(700);
  return true;
}

function getStructuredAddressFields() {
  const address1 = findInputByFieldText([
    /address\s*(?:line)?\s*1|street/i,
    /地址\s*1|街道|详细地址/i,
  ]);
  const address2 = findInputByFieldText([
    /address\s*(?:line)?\s*2|apt|suite|unit/i,
    /地址\s*2|公寓|单元|门牌/i,
  ]);
  const city = findInputByFieldText([
    /city|town|suburb/i,
    /城市|市区/i,
  ]);
  const region = findInputByFieldText([
    /state|province|region|county/i,
    /省|州|地区/i,
  ]);
  const postalCode = findInputByFieldText([
    /postal|zip|postcode/i,
    /邮编|邮政/i,
  ]);
  return { address1, address2, city, region, postalCode };
}

function fillIfEmpty(input, value, options = {}) {
  if (!input || !value) return false;
  if (!options.overwrite && String(input.value || '').trim()) return false;
  if (options.overwrite && String(input.value || '').trim() === String(value || '').trim()) return false;
  fillInput(input, value);
  return true;
}

function isDropdownStructuredAddressForm(fields = getStructuredAddressFields()) {
  return Boolean(
    findCountryDropdown()
    && findRegionDropdown()
    && fields.address1
    && fields.city
    && fields.postalCode
  );
}

async function ensureStructuredAddress(seed, options = {}) {
  const fallback = seed?.fallback || {};
  const overwrite = Boolean(options.overwrite);
  const countryDropdown = findCountryDropdown();
  if (countryDropdown && seed?.countryCode) {
    await selectCountryDropdown(countryDropdown, seed.countryCode);
  }
  const fields = await waitUntil(() => {
    const currentFields = getStructuredAddressFields();
    if (currentFields.address1 || currentFields.city || currentFields.postalCode) {
      return currentFields;
    }
    return null;
  }, {
    label: '结构化账单地址字段',
    intervalMs: 250,
  });

  fillIfEmpty(fields.address1, fallback.address1, { overwrite });
  fillIfEmpty(fields.city, fallback.city, { overwrite });
  await selectRegionDropdown(findRegionDropdown(), fallback.region);
  fillIfEmpty(fields.postalCode, fallback.postalCode, { overwrite });
  await sleep(500);

  const latest = getStructuredAddressFields();
  const missing = [];
  if (!String(latest.address1?.value || '').trim()) missing.push('地址1');
  if (!String(latest.city?.value || '').trim()) missing.push('城市');
  if (!String(latest.postalCode?.value || '').trim()) missing.push('邮编');
  if (missing.length) {
    throw new Error(`Plus Checkout：账单地址字段未填写完整：${missing.join('、')}。`);
  }

  return {
    address1: latest.address1?.value || '',
    city: latest.city?.value || '',
    region: getRegionDropdownValue(findRegionDropdown()) || latest.region?.value || '',
    postalCode: latest.postalCode?.value || '',
  };
}

function findSubscribeButton() {
  return findClickableByText([
    /订阅|继续|确认|支付/i,
    /subscribe|continue|confirm|pay|start\s*subscription|place\s*order/i,
  ]);
}

async function fillPlusBillingAndSubmit(payload = {}) {
  await waitForDocumentComplete();
  await selectPayPalPaymentMethod();
  const billingResult = await fillPlusBillingAddress(payload);

  if (payload.skipSubmit) {
    return {
      ...billingResult,
      submitted: false,
    };
  }

  await clickPlusSubscribe();
  return {
    ...billingResult,
    submitted: true,
  };
}

async function fillPlusBillingAddress(payload = {}) {
  await waitForDocumentComplete();
  await fillFullName(payload.fullName || '');

  const countryText = readCountryText();
  const seed = payload.addressSeed || {
    query: 'Berlin Mitte',
    suggestionIndex: 1,
    fallback: {
      address1: 'Unter den Linden',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10117',
    },
  };
  let selected = { selectedText: '' };
  const fields = getStructuredAddressFields();
  const useDirectStructuredBranch = Boolean(seed.skipAutocomplete || isDropdownStructuredAddressForm(fields));
  if (!useDirectStructuredBranch) {
    selected = await selectAddressSuggestion(seed);
  }
  const structuredAddress = await ensureStructuredAddress(seed, {
    overwrite: useDirectStructuredBranch,
  });

  return {
    countryText,
    selectedAddressText: selected.selectedText,
    structuredAddress,
  };
}

async function fillPlusAddressQuery(payload = {}) {
  await waitForDocumentComplete();
  await fillFullName(payload.fullName || '');
  const seed = payload.addressSeed || {};
  await fillAddressQuery(seed);
  return {
    countryText: readCountryText(),
    queryFilled: true,
  };
}

async function selectPlusAddressSuggestion(payload = {}) {
  await waitForDocumentComplete();
  const selected = await clickAddressSuggestion(payload.addressSeed || {});
  return {
    selectedAddressText: selected.selectedText,
    suggestionIndex: selected.suggestionIndex,
  };
}

async function ensurePlusStructuredBillingAddress(payload = {}) {
  await waitForDocumentComplete();
  const structuredAddress = await ensureStructuredAddress(payload.addressSeed || {});
  return {
    countryText: readCountryText(),
    structuredAddress,
  };
}

async function clickPlusSubscribe() {
  const subscribeButton = await waitUntil(() => {
    const button = findSubscribeButton();
    return button && isEnabledControl(button) ? button : null;
  }, {
    label: '订阅按钮',
    intervalMs: 250,
  });

  simulateClick(subscribeButton);
  return {
    clicked: true,
  };
}

async function readChatGptSessionAccessToken() {
  const sessionResponse = await fetch('/api/auth/session', {
    credentials: 'include',
  });
  const session = await sessionResponse.json().catch(() => ({}));
  return {
    session,
    accessToken: String(session?.accessToken || '').trim(),
  };
}

async function inspectPlusCheckoutState(options = {}) {
  const structuredAddress = getStructuredAddressFields();
  const state = {
    url: location.href,
    readyState: document.readyState,
    countryText: readCountryText(),
    hasPayPal: Boolean(findPayPalPaymentMethodTarget()),
    paypalCandidates: getPayPalCandidateSummaries(),
    paymentTextPreview: getPaymentTextPreview(),
    cardFieldsVisible: hasCreditCardFields(),
    billingFieldsVisible: hasBillingAddressFields(),
    hasSubscribeButton: Boolean(findSubscribeButton()),
    addressFieldValues: {
      address1: structuredAddress.address1?.value || '',
      city: structuredAddress.city?.value || '',
      region: getRegionDropdownValue(findRegionDropdown()) || structuredAddress.region?.value || '',
      postalCode: structuredAddress.postalCode?.value || '',
    },
  };
  if (options.includeSession || options.includeAccessToken) {
    const sessionState = await readChatGptSessionAccessToken();
    state.session = sessionState.session;
    state.accessToken = sessionState.accessToken;
  }
  return state;
}
})();
