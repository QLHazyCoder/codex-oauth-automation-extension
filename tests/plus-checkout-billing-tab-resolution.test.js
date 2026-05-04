const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadPlusCheckoutBillingModule() {
  const source = fs.readFileSync('background/steps/fill-plus-checkout.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundPlusCheckoutBilling;`)(globalScope);
}

function createAddressSeed() {
  return {
    countryCode: 'DE',
    query: 'Berlin Mitte',
    suggestionIndex: 1,
    fallback: {
      address1: 'Unter den Linden',
      city: 'Berlin',
      region: 'Berlin',
      postalCode: '10117',
    },
  };
}

function createAuAddressSeed() {
  return {
    countryCode: 'AU',
    query: 'Sydney NSW',
    suggestionIndex: 1,
    fallback: {
      address1: 'George Street',
      city: 'Sydney',
      region: 'New South Wales',
      postalCode: '2000',
    },
  };
}

function createIdAddressSeed() {
  return {
    countryCode: 'ID',
    query: 'Jakarta Indonesia',
    suggestionIndex: 1,
    fallback: {
      address1: 'Jalan M.H. Thamrin No. 1',
      city: 'Jakarta',
      region: 'DKI Jakarta',
      postalCode: '10310',
    },
  };
}

function createKrAddressSeed() {
  return {
    countryCode: 'KR',
    query: 'Seoul Jung-gu',
    suggestionIndex: 1,
    fallback: {
      address1: 'Sejong-daero 110',
      city: 'Jung-gu',
      region: 'Seoul',
      postalCode: '04524',
    },
  };
}

function createSuccessfulBillingResult() {
  return {
    countryText: 'Germany',
    structuredAddress: {
      address1: 'Unter den Linden',
      city: 'Berlin',
      postalCode: '10117',
    },
  };
}

function createExecutorHarness({
  frames,
  stateByFrame,
  readyByFrame = {},
  fetchImpl = null,
  getAddressSeedForCountry = () => createAddressSeed(),
  getState = null,
  markCurrentRegistrationAccountUsed = async () => {},
  probeIpProxyExit = null,
  submitRedirectUrl = 'https://www.paypal.com/checkoutnow',
}) {
  const api = loadPlusCheckoutBillingModule();
  const events = {
    completed: [],
    ensuredTabs: [],
    injectedAllFrames: false,
    logs: [],
    messages: [],
    states: [],
    waitedUrls: [],
  };
  const checkoutTab = {
    id: 42,
    url: 'https://chatgpt.com/checkout/openai_ie/cs_test',
    status: 'complete',
  };

  const executor = api.createPlusCheckoutBillingExecutor({
    addLog: async (message, level = 'info') => events.logs.push({ message, level }),
    chrome: {
      tabs: {
        get: async (tabId) => (tabId === checkoutTab.id ? checkoutTab : null),
        query: async (queryInfo) => {
          if (queryInfo.active && queryInfo.currentWindow) {
            return [checkoutTab];
          }
          if (queryInfo.url === 'https://chatgpt.com/checkout/*') {
            return [checkoutTab];
          }
          return [];
        },
        sendMessage: async (tabId, message, options = {}) => {
          const frameId = Number.isInteger(options.frameId) ? options.frameId : 0;
          events.messages.push({ tabId, message, frameId });
          const hasConfiguredState = Object.prototype.hasOwnProperty.call(stateByFrame, frameId);
          if (message.type === 'PING') {
            if (readyByFrame[frameId] === false) {
              throw new Error('No receiving end');
            }
            return { ok: true, source: 'plus-checkout' };
          }
          if (readyByFrame[frameId] === false && !hasConfiguredState) {
            throw new Error('No receiving end');
          }
          if (message.type === 'PLUS_CHECKOUT_GET_STATE') {
            return stateByFrame[frameId] || { hasPayPal: false, paypalCandidates: [] };
          }
          if (message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE') {
            checkoutTab.url = submitRedirectUrl;
          }
          return createSuccessfulBillingResult();
        },
      },
      scripting: {
        executeScript: async (details) => {
          if (details.target?.allFrames) {
            events.injectedAllFrames = true;
          }
        },
      },
      webNavigation: {
        getAllFrames: async () => frames,
      },
    },
    completeStepFromBackground: async (step, payload) => events.completed.push({ step, payload }),
    ensureContentScriptReadyOnTabUntilStopped: async (source, tabId) => events.ensuredTabs.push({ source, tabId }),
    fetch: fetchImpl,
    generateRandomName: () => ({ firstName: 'Ada', lastName: 'Lovelace' }),
    getAddressSeedForCountry,
    getState: typeof getState === 'function' ? getState : async () => ({}),
    getTabId: async () => null,
    isTabAlive: async () => false,
    markCurrentRegistrationAccountUsed,
    setState: async (updates) => events.states.push(updates),
    sleepWithStop: async () => {},
    waitForTabCompleteUntilStopped: async () => checkoutTab,
    waitForTabUrlMatchUntilStopped: async (tabId, matcher) => {
      events.waitedUrls.push({ tabId });
      assert.equal(matcher(submitRedirectUrl), true);
      return { id: tabId, url: submitRedirectUrl };
    },
    ...(typeof probeIpProxyExit === 'function' ? { probeIpProxyExit } : {}),
  });

  return { checkoutTab, events, executor };
}

test('Plus checkout billing stops before PayPal when today due amount is non-zero', async () => {
  const markCalls = [];
  const { events, executor } = createExecutorHarness({
    frames: [{ frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' }],
    stateByFrame: {
      0: {
        hasPayPal: true,
        paypalCandidates: [{ tag: 'button', text: 'PayPal' }],
        billingFieldsVisible: true,
        hasSubscribeButton: true,
        checkoutAmountSummary: {
          hasTodayDue: true,
          amount: 19.33,
          isZero: false,
          rawAmount: '€19.33',
        },
      },
    },
    markCurrentRegistrationAccountUsed: async (state, options) => {
      markCalls.push({ state, options });
      return { updated: true };
    },
  });

  await assert.rejects(
    () => executor.executePlusCheckoutBilling({ email: 'paid@example.com' }),
    /PLUS_CHECKOUT_NON_FREE_TRIAL::/
  );

  assert.equal(events.messages.some((entry) => entry.message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE'), false);
  assert.equal(events.completed.length, 0);
  assert.equal(markCalls.length, 1);
  assert.equal(markCalls[0].state.email, 'paid@example.com');
  assert.equal(events.logs.some((entry) => /今日应付金额不是 0/.test(entry.message)), true);
});

test('Plus checkout billing uses the current checkout tab when step 6 did not register one', async () => {
  const { checkoutTab, events, executor } = createExecutorHarness({
    frames: [{ frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' }],
    stateByFrame: {
      0: {
        hasPayPal: true,
        paypalCandidates: [{ tag: 'button', text: 'PayPal' }],
        billingFieldsVisible: true,
        hasSubscribeButton: true,
      },
    },
  });

  await executor.executePlusCheckoutBilling({});

  assert.deepEqual(events.ensuredTabs[0], { source: 'plus-checkout', tabId: checkoutTab.id });
  assert.equal(events.messages.some((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_PAYPAL' && entry.frameId === 0), true);
  assert.equal(events.messages.some((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS' && entry.frameId === 0), true);
  assert.equal(events.messages.some((entry) => entry.message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE' && entry.frameId === 0), true);
  assert.equal(events.completed[0].step, 7);
  assert.equal(events.states.some((updates) => updates.plusCheckoutTabId === checkoutTab.id), true);
  assert.equal(events.logs.some((entry) => /当前已在 Plus Checkout 页面/.test(entry.message)), true);
});

test('Plus checkout billing sends the billing command to the iframe that contains PayPal', async () => {
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: true, paypalCandidates: [{ tag: 'button', text: 'PayPal' }] },
      8: { hasPayPal: false, paypalCandidates: [], billingFieldsVisible: true },
    },
  });

  await executor.executePlusCheckoutBilling({});

  const selectMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_PAYPAL');
  const fillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  const subscribeMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE');
  assert.equal(selectMessage.frameId, 7);
  assert.equal(fillMessage.frameId, 8);
  assert.equal(subscribeMessage.frameId, 0);
  assert.equal(events.logs.some((entry) => /checkout iframe/.test(entry.message)), true);
  assert.equal(events.completed[0].step, 7);
});

test('Plus checkout billing uses proxy exit country for GoPay address when available', async () => {
  const requestedCountries = [];
  const fetchRequests = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_llc/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, hasGoPay: false, paypalCandidates: [], gopayCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: false, hasGoPay: true, gopayCandidates: [{ tag: 'button', text: 'GoPay' }] },
      8: {
        hasPayPal: false,
        hasGoPay: false,
        paypalCandidates: [],
        gopayCandidates: [],
        billingFieldsVisible: true,
        countryText: 'United States',
      },
    },
    getAddressSeedForCountry: (countryValue) => {
      requestedCountries.push(countryValue);
      return countryValue === 'JP' ? {
        countryCode: 'JP',
        query: 'Tokyo Marunouchi',
        suggestionIndex: 1,
        fallback: {
          address1: 'Marunouchi 1-1',
          city: 'Chiyoda-ku',
          region: 'Tokyo',
          postalCode: '100-0005',
        },
      } : createIdAddressSeed();
    },
    fetchImpl: async (url, init) => {
      fetchRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          address: {
            Address: 'トウキョウト, チヨダク, マルノウチ, 1-1',
            Trans_Address: 'Marunouchi 1-1, Chiyoda-ku, Tokyo',
            City: 'Tokyo',
            State: 'Tokyo',
            Zip_Code: '100-0005',
          },
        }),
      };
    },
    submitRedirectUrl: 'https://app.midtrans.com/snap/v4/redirection/session#/gopay-tokenization/linking',
  });

  await executor.executePlusCheckoutBilling({
    plusPaymentMethod: 'gopay',
    plusCheckoutCountry: 'ID',
    ipProxyAppliedExitRegion: 'JP',
  });

  const fillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(requestedCountries[0], 'JP');
  assert.equal(fillMessage.message.payload.addressSeed.countryCode, 'JP');
  assert.equal(fillMessage.message.payload.addressSeed.source, 'meiguodizhi');
  assert.deepEqual(JSON.parse(fetchRequests[0].init.body), {
    city: 'Chiyoda-ku',
    path: '/jp-address',
    method: 'refresh',
  });
  assert.equal(events.logs.some((entry) => /GoPay 账单地址将按当前代理出口地区 JP/.test(entry.message)), true);
});

test('Plus checkout billing refreshes stale GoPay proxy country before filling address', async () => {
  const requestedCountries = [];
  const probeCalls = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_llc/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, hasGoPay: false, paypalCandidates: [], gopayCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: false, hasGoPay: true, gopayCandidates: [{ tag: 'button', text: 'GoPay' }] },
      8: {
        hasPayPal: false,
        hasGoPay: false,
        paypalCandidates: [],
        gopayCandidates: [],
        billingFieldsVisible: true,
        countryText: 'Indonesia',
      },
    },
    getAddressSeedForCountry: (countryValue) => {
      requestedCountries.push(countryValue);
      return countryValue === 'JP' ? {
        countryCode: 'JP',
        query: 'Tokyo Chiyoda-ku',
        suggestionIndex: 1,
        fallback: {
          address1: 'Marunouchi 1-1',
          city: 'Chiyoda-ku',
          region: 'Tokyo',
          postalCode: '100-0005',
        },
      } : createKrAddressSeed();
    },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ status: 'error' }),
    }),
    probeIpProxyExit: async (options) => {
      probeCalls.push(options);
      return {
        proxyRouting: {
          exitRegion: 'JP',
          exitIp: '203.0.113.8',
          exitSource: 'page_context',
          exitEndpoint: 'https://ipinfo.io/json',
        },
      };
    },
    submitRedirectUrl: 'https://app.midtrans.com/snap/v4/redirection/session#/gopay-tokenization/linking',
  });

  await executor.executePlusCheckoutBilling({
    plusPaymentMethod: 'gopay',
    plusCheckoutCountry: 'ID',
    ipProxyAppliedExitRegion: 'KR',
  });

  const fillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(probeCalls.length, 1);
  assert.equal(probeCalls[0].detectWhenDisabled, true);
  assert.equal(requestedCountries[0], 'JP');
  assert.equal(fillMessage.message.payload.addressSeed.countryCode, 'JP');
  assert.equal(events.logs.some((entry) => entry.message.includes('当前代理出口复测结果：JP / 203.0.113.8')), true);
  assert.equal(events.logs.some((entry) => /GoPay 账单地址将按当前代理出口地区 JP/.test(entry.message)), true);
  assert.equal(events.logs.some((entry) => /GoPay 账单地址将按当前代理出口地区 KR/.test(entry.message)), false);
});

test('Plus checkout billing refuses to reuse stale GoPay proxy country when refresh has no region', async () => {
  const requestedCountries = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_llc/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, hasGoPay: false, paypalCandidates: [], gopayCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: false, hasGoPay: true, gopayCandidates: [{ tag: 'button', text: 'GoPay' }] },
      8: {
        hasPayPal: false,
        hasGoPay: false,
        paypalCandidates: [],
        gopayCandidates: [],
        billingFieldsVisible: true,
        countryText: 'Indonesia',
      },
    },
    getAddressSeedForCountry: (countryValue) => {
      requestedCountries.push(countryValue);
      return createKrAddressSeed();
    },
    probeIpProxyExit: async () => ({
      proxyRouting: {
        reason: 'disabled_probe_only',
        exitIp: '203.0.113.9',
        exitRegion: '',
        exitError: 'missing_region',
      },
    }),
  });

  await assert.rejects(
    () => executor.executePlusCheckoutBilling({
      plusPaymentMethod: 'gopay',
      plusCheckoutCountry: 'ID',
      ipProxyAppliedExitRegion: 'KR',
    }),
    /本次复测没有拿到国家码/
  );

  assert.equal(requestedCountries.length, 0);
  assert.equal(events.logs.some((entry) => /已清空旧出口地区 KR/.test(entry.message)), true);
  assert.equal(events.logs.some((entry) => /GoPay 账单地址将按当前代理出口地区 KR/.test(entry.message)), false);
});

test('Plus checkout billing normalizes legacy Korean postal code for GoPay address', async () => {
  const requestedCountries = [];
  const fetchRequests = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_llc/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, hasGoPay: false, paypalCandidates: [], gopayCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: false, hasGoPay: true, gopayCandidates: [{ tag: 'button', text: 'GoPay' }] },
      8: {
        hasPayPal: false,
        hasGoPay: false,
        paypalCandidates: [],
        gopayCandidates: [],
        billingFieldsVisible: true,
        countryText: 'United States',
      },
    },
    getAddressSeedForCountry: (countryValue) => {
      requestedCountries.push(countryValue);
      return countryValue === 'KR' ? createKrAddressSeed() : createIdAddressSeed();
    },
    fetchImpl: async (url, init) => {
      fetchRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          address: {
            Address: '서울특별시 중구 세종대로 110',
            Trans_Address: 'Sejong-daero 110, Jung-gu, Seoul',
            City: 'Jung-gu',
            State: 'Seoul',
            Zip_Code: '150-300',
          },
        }),
      };
    },
    submitRedirectUrl: 'https://app.midtrans.com/snap/v4/redirection/session#/gopay-tokenization/linking',
  });

  await executor.executePlusCheckoutBilling({
    plusPaymentMethod: 'gopay',
    plusCheckoutCountry: 'ID',
    ipProxyAppliedExitRegion: 'KR',
  });

  const fillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(requestedCountries[0], 'KR');
  assert.equal(fillMessage.message.payload.addressSeed.countryCode, 'KR');
  assert.equal(fillMessage.message.payload.addressSeed.source, 'meiguodizhi');
  assert.equal(fillMessage.message.payload.addressSeed.fallback.address1, 'Sejong-daero 110, Jung-gu, Seoul');
  assert.equal(fillMessage.message.payload.addressSeed.fallback.postalCode, '04524');
  assert.match(fillMessage.message.payload.addressSeed.fallback.postalCode, /^\d{5}$/);
  assert.deepEqual(JSON.parse(fetchRequests[0].init.body), {
    city: 'Jung-gu',
    path: '/kr-address',
    method: 'refresh',
  });
  assert.equal(events.logs.some((entry) => /GoPay 账单地址将按当前代理出口地区 KR/.test(entry.message)), true);
});

test('Plus checkout billing selects GoPay and waits for a GoPay redirect', async () => {
  const { checkoutTab, events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, hasGoPay: false, paypalCandidates: [], gopayCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: false, hasGoPay: true, gopayCandidates: [{ tag: 'button', text: 'GoPay' }] },
      8: {
        hasPayPal: false,
        hasGoPay: false,
        paypalCandidates: [],
        gopayCandidates: [],
        billingFieldsVisible: true,
        countryText: 'Indonesia',
      },
    },
    getAddressSeedForCountry: () => createIdAddressSeed(),
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ status: 'error' }),
    }),
    submitRedirectUrl: 'https://gopay.co.id/payment/session',
  });

  await executor.executePlusCheckoutBilling({ plusPaymentMethod: 'gopay' });

  const selectMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_GOPAY');
  const paypalSelectMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_PAYPAL');
  const fillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  const subscribeMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_CLICK_SUBSCRIBE');
  assert.equal(selectMessage.frameId, 7);
  assert.equal(selectMessage.message.payload.paymentMethod, 'gopay');
  assert.equal(paypalSelectMessage, undefined);
  assert.equal(fillMessage.message.payload.addressSeed.countryCode, 'ID');
  assert.equal(subscribeMessage.message.payload.paymentMethod, 'gopay');
  assert.equal(checkoutTab.url, 'https://gopay.co.id/payment/session');
  assert.equal(events.completed[0].step, 7);
});

test('Plus checkout billing still inspects a frame when ping readiness is stale', async () => {
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: {
        hasPayPal: true,
        paypalCandidates: [{ tag: 'button', text: 'PayPal' }],
        hasSubscribeButton: true,
      },
      7: { hasPayPal: false, paypalCandidates: [] },
      8: { hasPayPal: false, paypalCandidates: [], billingFieldsVisible: true },
    },
    readyByFrame: {
      0: false,
    },
  });

  await executor.executePlusCheckoutBilling({});

  const selectMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_PAYPAL');
  assert.equal(selectMessage.frameId, 0);
  assert.equal(events.completed[0].step, 7);
});

test('Plus checkout billing uses the autocomplete iframe for address suggestions when Stripe splits it out', async () => {
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
      { frameId: 9, url: 'https://js.stripe.com/v3/elements-inner-autocompl.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: true, paypalCandidates: [{ tag: 'button', text: 'PayPal' }] },
      8: { hasPayPal: false, paypalCandidates: [], billingFieldsVisible: true },
      9: { hasPayPal: false, paypalCandidates: [] },
    },
  });

  await executor.executePlusCheckoutBilling({});

  const fillQueryMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_ADDRESS_QUERY');
  const suggestionMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_ADDRESS_SUGGESTION');
  const ensureAddressMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_ENSURE_BILLING_ADDRESS');
  const combinedFillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(fillQueryMessage.frameId, 8);
  assert.equal(suggestionMessage.frameId, 9);
  assert.equal(ensureAddressMessage.frameId, 8);
  assert.equal(combinedFillMessage, undefined);
  assert.equal(events.logs.some((entry) => /Google 地址推荐/.test(entry.message)), true);
  assert.equal(events.completed[0].step, 7);
});

test('Plus checkout billing skips Google autocomplete when meiguodizhi returns a complete address', async () => {
  const fetchRequests = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
      { frameId: 9, url: 'https://js.stripe.com/v3/elements-inner-autocompl.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: true, paypalCandidates: [{ tag: 'button', text: 'PayPal' }] },
      8: { hasPayPal: false, paypalCandidates: [], billingFieldsVisible: true },
      9: { hasPayPal: false, paypalCandidates: [] },
    },
    fetchImpl: async (url, init) => {
      fetchRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          address: {
            Address: 'Rosa-Luxemburg-Strasse 40',
            City: 'Berlin',
            State: 'Berlin',
            Zip_Code: '69081',
          },
        }),
      };
    },
  });

  await executor.executePlusCheckoutBilling({});

  const fillQueryMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_ADDRESS_QUERY');
  const suggestionMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_SELECT_ADDRESS_SUGGESTION');
  const ensureAddressMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_ENSURE_BILLING_ADDRESS');
  const combinedFillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(fillQueryMessage, undefined);
  assert.equal(suggestionMessage, undefined);
  assert.equal(ensureAddressMessage, undefined);
  assert.equal(combinedFillMessage.frameId, 8);
  assert.equal(combinedFillMessage.message.payload.addressSeed.skipAutocomplete, true);
  assert.equal(combinedFillMessage.message.payload.addressSeed.source, 'meiguodizhi');
  assert.equal(combinedFillMessage.message.payload.addressSeed.fallback.address1, 'Rosa-Luxemburg-Strasse 40');
  assert.equal(combinedFillMessage.message.payload.addressSeed.fallback.city, 'Berlin');
  assert.equal(combinedFillMessage.message.payload.addressSeed.fallback.postalCode, '69081');
  assert.equal(fetchRequests.length, 1);
  assert.equal(fetchRequests[0].url, 'https://www.meiguodizhi.com/api/v1/dz');
  assert.deepEqual(JSON.parse(fetchRequests[0].init.body), {
    city: 'Berlin',
    path: '/de-address',
    method: 'refresh',
  });
  assert.equal(events.completed[0].step, 7);
});

test('Plus checkout billing uses the detected checkout country before choosing an address seed', async () => {
  const requestedCountries = [];
  const fetchRequests = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: true, paypalCandidates: [{ tag: 'button', text: 'PayPal' }] },
      8: {
        hasPayPal: false,
        paypalCandidates: [],
        billingFieldsVisible: true,
        countryText: 'Australia',
      },
    },
    getAddressSeedForCountry: (countryValue) => {
      requestedCountries.push(countryValue);
      return /australia|au/i.test(String(countryValue || '')) ? createAuAddressSeed() : createAddressSeed();
    },
    fetchImpl: async (url, init) => {
      fetchRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          address: {
            Address: '98 Ocean Street',
            City: 'Sydney South',
            State: 'New South Wales',
            Zip_Code: '2000',
          },
        }),
      };
    },
  });

  await executor.executePlusCheckoutBilling({ plusCheckoutCountry: 'DE' });

  const combinedFillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(requestedCountries[0], 'AU');
  assert.equal(combinedFillMessage.message.payload.addressSeed.countryCode, 'AU');
  assert.equal(combinedFillMessage.message.payload.addressSeed.fallback.region, 'New South Wales');
  assert.deepEqual(JSON.parse(fetchRequests[0].init.body), {
    city: 'Sydney',
    path: '/au-address',
    method: 'refresh',
  });
});

test('Plus checkout billing uses meiguodizhi country paths for localized countries without local seeds', async () => {
  const fetchRequests = [];
  const { events, executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
      { frameId: 8, url: 'https://js.stripe.com/v3/elements-inner-address.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
      7: { hasPayPal: true, paypalCandidates: [{ tag: 'button', text: 'PayPal' }] },
      8: {
        hasPayPal: false,
        paypalCandidates: [],
        billingFieldsVisible: true,
        countryText: '日本',
      },
    },
    fetchImpl: async (url, init) => {
      fetchRequests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          address: {
            Address: 'トウキョウト, ミナトク, シバダイモン, 10-4',
            Trans_Address: '10-4, Shiba Daimon 2-chome, Minato-ku, Tokyo',
            City: 'Tokyo',
            State: 'Tokyo',
            Zip_Code: '105-0012',
          },
        }),
      };
    },
  });

  await executor.executePlusCheckoutBilling({ plusCheckoutCountry: 'DE' });

  const combinedFillMessage = events.messages.find((entry) => entry.message.type === 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS');
  assert.equal(combinedFillMessage.message.payload.addressSeed.countryCode, 'JP');
  assert.equal(combinedFillMessage.message.payload.addressSeed.source, 'meiguodizhi');
  assert.equal(combinedFillMessage.message.payload.addressSeed.fallback.address1, '10-4, Shiba Daimon 2-chome, Minato-ku, Tokyo');
  assert.deepEqual(JSON.parse(fetchRequests[0].init.body), {
    city: 'Tokyo',
    path: '/jp-address',
    method: 'refresh',
  });
});

test('Plus checkout billing reports when the payment iframe exists but cannot receive the content script', async () => {
  const { executor } = createExecutorHarness({
    frames: [
      { frameId: 0, url: 'https://chatgpt.com/checkout/openai_ie/cs_test' },
      { frameId: 7, url: 'https://js.stripe.com/v3/elements-inner-payment.html' },
    ],
    stateByFrame: {
      0: { hasPayPal: false, paypalCandidates: [], hasSubscribeButton: true },
    },
    readyByFrame: {
      7: false,
    },
  });

  await assert.rejects(
    executor.executePlusCheckoutBilling({}),
    /已定位到 PayPal 所在 iframe（frameId=7），但账单脚本无法注入该 iframe/
  );
});

test('GPC billing normalizes API URL and submits OTP then PIN with card_key and flow_id', async () => {
  const fetchCalls = [];
  let currentState = {
    plusManualConfirmationPending: true,
    plusManualConfirmationRequestId: '',
  };
  const { events, executor } = createExecutorHarness({
    frames: [],
    stateByFrame: {},
    getState: async () => currentState,
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.endsWith('/api/gopay/otp')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ reference_id: 'ref_123', challenge_id: 'challenge_456' }),
        };
      }
      if (url.endsWith('/api/gopay/pin')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ stage: 'gopay_complete' }),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    },
  });

  const run = executor.executePlusCheckoutBilling({
    plusPaymentMethod: 'gpc-helper',
    plusCheckoutSource: 'gpc-helper',
    gopayHelperReferenceId: 'ref_123',
    gopayHelperGoPayGuid: 'guid_789',
    gopayHelperApiUrl: 'https://gopay.hwork.pro/api/checkout/start',
    gopayHelperPin: '654321',
    gopayHelperCardKey: 'card_billing_123',
    gopayHelperFlowId: 'flow_billing_123',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const pending = events.states.find((state) => state.plusManualConfirmationMethod === 'gopay-otp');
  assert.ok(pending);
  currentState = {
    plusManualConfirmationPending: false,
    plusManualConfirmationRequestId: pending.plusManualConfirmationRequestId,
    gopayHelperResolvedOtp: '123456',
  };

  await run;

  assert.equal(fetchCalls[0].url, 'https://gopay.hwork.pro/api/gopay/otp');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    reference_id: 'ref_123',
    otp: '123456',
    card_key: 'card_billing_123',
    flow_id: 'flow_billing_123',
    gopay_guid: 'guid_789',
  });
  assert.equal(fetchCalls[1].url, 'https://gopay.hwork.pro/api/gopay/pin');
  assert.deepEqual(JSON.parse(fetchCalls[1].options.body), {
    reference_id: 'ref_123',
    challenge_id: 'challenge_456',
    gopay_guid: 'guid_789',
    pin: '654321',
    card_key: 'card_billing_123',
    flow_id: 'flow_billing_123',
  });
  assert.equal(events.completed[0].step, 7);
  assert.equal(events.completed[0].payload.plusCheckoutSource, 'gpc-helper');
});

test('GPC billing retries OTP with compatibility field after HTTP 400', async () => {
  const fetchCalls = [];
  let currentState = {
    plusManualConfirmationPending: true,
    plusManualConfirmationRequestId: '',
  };
  const { events, executor } = createExecutorHarness({
    frames: [],
    stateByFrame: {},
    getState: async () => currentState,
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.endsWith('/api/gopay/otp') && fetchCalls.filter((call) => call.url.endsWith('/api/gopay/otp')).length === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'otp field invalid' }),
        };
      }
      if (url.endsWith('/api/gopay/otp')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ challenge_id: 'challenge_retry' }),
        };
      }
      if (url.endsWith('/api/gopay/pin')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ stage: 'gopay_complete' }),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    },
  });

  const run = executor.executePlusCheckoutBilling({
    plusPaymentMethod: 'gpc-helper',
    plusCheckoutSource: 'gpc-helper',
    gopayHelperReferenceId: 'ref_retry',
    gopayHelperGoPayGuid: 'guid_retry',
    gopayHelperRedirectUrl: 'https://pm-redirects.stripe.com/retry',
    gopayHelperApiUrl: 'http://localhost:18473/',
    gopayHelperPin: '654321',
    gopayHelperCardKey: 'card_retry',
    gopayHelperFlowId: 'flow_retry',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const pending = events.states.find((state) => state.plusManualConfirmationMethod === 'gopay-otp');
  currentState = {
    plusManualConfirmationPending: false,
    plusManualConfirmationRequestId: pending.plusManualConfirmationRequestId,
    gopayHelperResolvedOtp: '123456',
  };

  await run;

  assert.equal(fetchCalls.filter((call) => call.url.endsWith('/api/gopay/otp')).length, 2);
  assert.deepEqual(JSON.parse(fetchCalls[1].options.body), {
    reference_id: 'ref_retry',
    otp: '123456',
    card_key: 'card_retry',
    flow_id: 'flow_retry',
    gopay_guid: 'guid_retry',
    redirect_url: 'https://pm-redirects.stripe.com/retry',
    code: '123456',
  });
  assert.equal(events.logs.some((entry) => /兼容字段重试/.test(entry.message)), true);
  assert.equal(events.completed[0].step, 7);
});
