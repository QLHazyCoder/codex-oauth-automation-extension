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
  markCurrentRegistrationAccountUsed = async () => {},
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
            checkoutTab.url = 'https://www.paypal.com/checkoutnow';
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
    getTabId: async () => null,
    isTabAlive: async () => false,
    markCurrentRegistrationAccountUsed,
    setState: async (updates) => events.states.push(updates),
    sleepWithStop: async () => {},
    waitForTabCompleteUntilStopped: async () => checkoutTab,
    waitForTabUrlMatchUntilStopped: async (tabId, matcher) => {
      events.waitedUrls.push({ tabId });
      assert.equal(matcher('https://www.paypal.com/checkoutnow'), true);
      return { id: tabId, url: 'https://www.paypal.com/checkoutnow' };
    },
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
