const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/phone-verification-flow.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundPhoneVerification;`)(globalScope);

function buildHeroSmsPricesPayload({ country = '52', service = 'dr', cost = 0.08, count = 25370, physicalCount = 14528 } = {}) {
  return JSON.stringify({
    [country]: {
      [service]: {
        cost,
        count,
        physicalCount,
      },
    },
  });
}

function buildHeroSmsStatusV2Payload({ smsCode = '', smsText = '', callCode = '' } = {}) {
  return JSON.stringify({
    verificationType: 2,
    sms: {
      dateTime: '2026-02-18T16:11:33+00:00',
      code: smsCode,
      text: smsText,
    },
    call: {
      code: callCode,
    },
  });
}

test('phone verification helper requests HeroSMS numbers with fixed OpenAI and Thailand parameters', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      return {
        ok: true,
        text: async () => 'ACCESS_NUMBER:123456:66959916439',
      };
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[0].searchParams.get('service'), 'dr');
  assert.equal(requests[0].searchParams.get('country'), '52');
  assert.equal(requests[0].searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[1].searchParams.get('service'), 'dr');
  assert.equal(requests[1].searchParams.get('country'), '52');
  assert.equal(requests[1].searchParams.get('api_key'), 'demo-key');
});

test('phone verification helper retries HeroSMS getPrices until it receives a usable lowest price', async () => {
  const requests = [];
  let getPricesAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        getPricesAttempt += 1;
        return getPricesAttempt < 3
          ? {
            ok: true,
            text: async () => JSON.stringify({ unavailable: true }),
          }
          : {
            ok: true,
            text: async () => buildHeroSmsPricesPayload({ cost: 0.09 }),
          };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[1].searchParams.get('action'), 'getPrices');
  assert.equal(requests[2].searchParams.get('action'), 'getPrices');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('maxPrice'), '0.09');
  assert.equal(requests[3].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper falls back to plain getNumber only after HeroSMS getPrices fails three times', async () => {
  const requests = [];
  let getPricesAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        getPricesAttempt += 1;
        return {
          ok: true,
          text: async () => JSON.stringify({ unavailable: getPricesAttempt }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[1].searchParams.get('action'), 'getPrices');
  assert.equal(requests[2].searchParams.get('action'), 'getPrices');
  assert.equal(requests[2].searchParams.get('service'), 'dr');
  assert.equal(requests[2].searchParams.get('country'), '52');
  assert.equal(requests[2].searchParams.get('api_key'), 'demo-key');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('maxPrice'), null);
  assert.equal(requests[3].searchParams.get('fixedPrice'), null);
});

test('phone verification helper retries with HeroSMS getNumberV2 when getNumber reports NO_NUMBERS', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'NO_NUMBERS',
        };
      }
      if (action === 'getNumberV2') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '654321',
            phoneNumber: '447911123456',
          }),
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key', heroSmsCountryId: 16 }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
  });

  assert.deepStrictEqual(activation, {
    activationId: '654321',
    phoneNumber: '447911123456',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 16,
    successfulUses: 0,
    maxUses: 3,
    statusAction: 'getStatusV2',
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[0].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[2].searchParams.get('action'), 'getNumberV2');
  assert.equal(requests[2].searchParams.get('country'), '16');
  assert.equal(requests[2].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[2].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper raises terminal add-phone error on HeroSMS account-level acquire failures', async () => {
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'NO_BALANCE',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' }),
    /add-phone flow cannot continue[\s\S]*NO_BALANCE/i
  );
});

test('phone verification helper replaces number in current step 9 when HeroSMS status returns STATUS_CANCEL', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '100001', phoneNumber: '66950000011' },
    { activationId: '100002', phoneNumber: '66950000022' },
  ];
  let numberIndex = 0;
  const statusById = {
    '100001': 'STATUS_CANCEL',
    '100002': 'STATUS_OK:987654',
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => statusById[id] || 'STATUS_WAIT_CODE',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => `STATUS_UPDATED:${id}`,
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          url: 'https://auth.openai.com/add-phone',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(messages, [
    'SUBMIT_PHONE_NUMBER',
    'RETURN_TO_ADD_PHONE',
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
  ]);
  const actions = requests.map((url) => `${url.searchParams.get('action')}:${url.searchParams.get('id') || ''}`);
  assert.deepStrictEqual(actions, [
    'getPrices:',
    'getNumber:',
    'getStatus:100001',
    'setStatus:100001',
    'getPrices:',
    'getNumber:',
    'getStatus:100002',
    'setStatus:100002',
  ]);
  assert.deepStrictEqual(currentState.currentPhoneActivation, null);
});

test('phone verification helper uses HeroSMS getStatusV2 after acquiring a number via getNumberV2', async () => {
  const requests = [];
  const stateUpdates = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };
  let statusPollCount = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'NO_NUMBERS',
        };
      }
      if (action === 'getNumberV2') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '654321',
            phoneNumber: '447911123456',
          }),
        };
      }
      if (action === 'getStatusV2') {
        statusPollCount += 1;
        return {
          ok: true,
          text: async () => (
            statusPollCount === 1
              ? buildHeroSmsStatusV2Payload()
              : buildHeroSmsStatusV2Payload({ smsCode: '112233', smsText: 'Your code is 112233' })
          ),
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(stateUpdates, [
    {
      currentPhoneActivation: {
        activationId: '654321',
        phoneNumber: '447911123456',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 16,
        successfulUses: 0,
        maxUses: 3,
        statusAction: 'getStatusV2',
      },
    },
    {
      reusablePhoneActivation: {
        activationId: '654321',
        phoneNumber: '447911123456',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 16,
        successfulUses: 1,
        maxUses: 3,
        statusAction: 'getStatusV2',
      },
    },
    {
      currentPhoneActivation: null,
    },
  ]);
  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, [
    'getPrices',
    'getNumber',
    'getNumberV2',
    'getStatusV2',
    'getStatusV2',
    'setStatus',
  ]);
});

test('phone verification helper refreshes maxPrice when HeroSMS returns WRONG_MAX_PRICE', async () => {
  const requests = [];
  let getNumberAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        getNumberAttempt += 1;
        return getNumberAttempt === 1
          ? {
            ok: false,
            text: async () => 'WRONG_MAX_PRICE:0.09',
          }
          : {
            ok: true,
            text: async () => 'ACCESS_NUMBER:123456:66959916439',
          };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[2].searchParams.get('action'), 'getNumber');
  assert.equal(requests[2].searchParams.get('maxPrice'), '0.09');
  assert.equal(requests[2].searchParams.get('fixedPrice'), 'true');
});

test('phone verification helper falls back to plain getNumber when priced request fails to fetch', async () => {
  const requests = [];
  let getNumberAttempt = 0;
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        getNumberAttempt += 1;
        if (getNumberAttempt === 1) {
          throw new TypeError('Failed to fetch');
        }
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '123456',
    phoneNumber: '66959916439',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.equal(requests[2].searchParams.get('action'), 'getNumber');
  assert.equal(requests[2].searchParams.get('maxPrice'), null);
  assert.equal(requests[2].searchParams.get('fixedPrice'), null);
});

test('phone verification helper completes add-phone flow, clears current activation, and stores reusable number state', async () => {
  const requests = [];
  const stateUpdates = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:123456:66959916439',
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      stateUpdates.push(updates);
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(stateUpdates, [
    {
      currentPhoneActivation: {
        activationId: '123456',
        phoneNumber: '66959916439',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 52,
        successfulUses: 0,
        maxUses: 3,
      },
    },
    {
      reusablePhoneActivation: {
        activationId: '123456',
        phoneNumber: '66959916439',
        provider: 'hero-sms',
        serviceCode: 'dr',
        countryId: 52,
        successfulUses: 1,
        maxUses: 3,
      },
    },
    {
      currentPhoneActivation: null,
    },
  ]);

  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, ['getPrices', 'getNumber', 'getStatus', 'setStatus']);
});

test('phone verification helper uses the configured HeroSMS country for both number acquisition and add-phone submission', async () => {
  const requests = [];
  const submittedPayloads = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload({ country: '16' }),
        };
      }
      if (action === 'getNumber') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:654321:447911123456',
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:112233',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPayloads.push(message.payload);
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[0].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('country'), '16');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[1].searchParams.get('fixedPrice'), 'true');
  assert.deepStrictEqual(submittedPayloads, [{
    phoneNumber: '447911123456',
    countryId: 16,
    countryLabel: 'United Kingdom',
  }]);
});

test('phone verification helper replaces number in step 9 when no SMS arrives after resend', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };
  const statusCallsById = {};
  const numbers = [
    { activationId: '123456', phoneNumber: '66959916439' },
    { activationId: '654321', phoneNumber: '66959916440' },
  ];
  let numberIndex = 0;
  const realDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;

  try {
    const helpers = api.createPhoneVerificationHelpers({
      addLog: async () => {},
      ensureStep8SignupPageReady: async () => {},
      fetchImpl: async (url) => {
        const parsedUrl = new URL(url);
        requests.push(parsedUrl);
        const action = parsedUrl.searchParams.get('action');
        const id = parsedUrl.searchParams.get('id');

        if (action === 'getPrices') {
          return {
            ok: true,
            text: async () => buildHeroSmsPricesPayload(),
          };
        }

        if (action === 'getNumber') {
          const nextNumber = numbers[numberIndex];
          numberIndex += 1;
          return {
            ok: true,
            text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
          };
        }

        if (action === 'getStatus') {
          statusCallsById[id] = (statusCallsById[id] || 0) + 1;
          if (id === '654321') {
            return {
              ok: true,
              text: async () => 'STATUS_OK:112233',
            };
          }
          return {
            ok: true,
            text: async () => 'STATUS_WAIT_CODE',
          };
        }

        if (action === 'setStatus') {
          return {
            ok: true,
            text: async () => 'ACCESS_ACTIVATION',
          };
        }

        throw new Error(`Unexpected HeroSMS action: ${action}`);
      },
      getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
      getState: async () => ({ ...currentState }),
      sendToContentScriptResilient: async (_source, message) => {
        messages.push(message.type);
        if (message.type === 'SUBMIT_PHONE_NUMBER') {
          return {
            phoneVerificationPage: true,
            url: 'https://auth.openai.com/phone-verification',
          };
        }
        if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
          return {
            success: true,
            consentReady: true,
            url: 'https://auth.openai.com/authorize',
          };
        }
        if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
          return {
            resent: true,
            url: 'https://auth.openai.com/phone-verification',
          };
        }
        if (message.type === 'RETURN_TO_ADD_PHONE') {
          return {
            addPhonePage: true,
            url: 'https://auth.openai.com/add-phone',
          };
        }
        throw new Error(`Unexpected content-script message: ${message.type}`);
      },
      setState: async (updates) => {
        currentState = { ...currentState, ...updates };
      },
      sleepWithStop: async () => {
        fakeNow += 61000;
      },
      throwIfStopped: () => {},
    });

    const result = await helpers.completePhoneVerificationFlow(1, {
      addPhonePage: true,
      phoneVerificationPage: false,
      url: 'https://auth.openai.com/add-phone',
    });

    assert.deepStrictEqual(result, {
      success: true,
      consentReady: true,
      url: 'https://auth.openai.com/authorize',
    });
    assert.ok(statusCallsById['123456'] >= 2, 'first number should be polled twice before being replaced');
    assert.ok(statusCallsById['654321'] >= 1, 'second number should be polled and succeed');
    assert.deepStrictEqual(messages, [
      'SUBMIT_PHONE_NUMBER',
      'RESEND_PHONE_VERIFICATION_CODE',
      'RETURN_TO_ADD_PHONE',
      'SUBMIT_PHONE_NUMBER',
      'SUBMIT_PHONE_VERIFICATION_CODE',
    ]);

    const actions = requests.map((url) => `${url.searchParams.get('action')}:${url.searchParams.get('id') || ''}`);
    assert.deepStrictEqual(actions, [
      'getPrices:',
      'getNumber:',
      'getStatus:123456',
      'setStatus:123456',
      'getStatus:123456',
      'setStatus:123456',
      'getPrices:',
      'getNumber:',
      'getStatus:654321',
      'setStatus:654321',
    ]);
    assert.equal(currentState.currentPhoneActivation, null);
  } finally {
    Date.now = realDateNow;
  }
});

test('phone verification helper retries a higher HeroSMS maxPrice when lower price pool has NO_NUMBERS', async () => {
  const requests = [];
  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const maxPrice = parsedUrl.searchParams.get('maxPrice');
      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            '52': {
              dr: {
                cost: 0.08,
                count: 10,
                physicalCount: 10,
              },
            },
            '52-premium': {
              dr: {
                cost: 0.12,
                count: 6,
                physicalCount: 6,
              },
            },
          }),
        };
      }
      if (action === 'getNumber' || action === 'getNumberV2') {
        if (maxPrice === '0.08') {
          return {
            ok: true,
            text: async () => 'NO_NUMBERS',
          };
        }
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:888888:66958889999',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getState: async () => ({ heroSmsApiKey: 'demo-key' }),
    sendToContentScriptResilient: async () => ({}),
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await helpers.requestPhoneActivation({ heroSmsApiKey: 'demo-key' });

  assert.deepStrictEqual(activation, {
    activationId: '888888',
    phoneNumber: '66958889999',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(requests[0].searchParams.get('action'), 'getPrices');
  assert.equal(requests[1].searchParams.get('action'), 'getNumber');
  assert.equal(requests[1].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[2].searchParams.get('action'), 'getNumberV2');
  assert.equal(requests[2].searchParams.get('maxPrice'), '0.08');
  assert.equal(requests[3].searchParams.get('action'), 'getNumber');
  assert.equal(requests[3].searchParams.get('maxPrice'), '0.12');
});

test('phone verification helper replaces the number when code submission returns to add-phone', async () => {
  const requests = [];
  const messages = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 1,
    currentPhoneActivation: null,
    reusablePhoneActivation: null,
  };

  const numbers = [
    { activationId: '111111', phoneNumber: '66950000001' },
    { activationId: '222222', phoneNumber: '66950000002' },
  ];
  let numberIndex = 0;
  let submitCodeCount = 0;

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      const id = parsedUrl.searchParams.get('id');

      if (action === 'getPrices') {
        return {
          ok: true,
          text: async () => buildHeroSmsPricesPayload(),
        };
      }

      if (action === 'getNumber') {
        const nextNumber = numbers[numberIndex];
        numberIndex += 1;
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${nextNumber.activationId}:${nextNumber.phoneNumber}`,
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => `STATUS_UPDATED:${id}`,
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        submitCodeCount += 1;
        return submitCodeCount === 1
          ? {
            returnedToAddPhone: true,
            url: 'https://auth.openai.com/add-phone',
          }
          : {
            success: true,
            consentReady: true,
            url: 'https://auth.openai.com/authorize',
          };
      }
      if (message.type === 'RESEND_PHONE_VERIFICATION_CODE') {
        return {
          resent: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.deepStrictEqual(messages, [
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
    'SUBMIT_PHONE_NUMBER',
    'SUBMIT_PHONE_VERIFICATION_CODE',
  ]);

  const actions = requests.map((url) => `${url.searchParams.get('action')}:${url.searchParams.get('id') || ''}`);
  assert.deepStrictEqual(actions, [
    'getPrices:',
    'getNumber:',
    'getStatus:111111',
    'setStatus:111111',
    'getPrices:',
    'getNumber:',
    'getStatus:222222',
    'setStatus:222222',
  ]);
  assert.deepStrictEqual(currentState.currentPhoneActivation, null);
  assert.deepStrictEqual(currentState.reusablePhoneActivation, {
    activationId: '222222',
    phoneNumber: '66950000002',
    provider: 'hero-sms',
    serviceCode: 'dr',
    countryId: 52,
    successfulUses: 1,
    maxUses: 3,
  });
});

test('phone verification helper reuses the same number up to three successful registrations', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: '123456',
      phoneNumber: '66959916439',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 52,
      successfulUses: 2,
      maxUses: 3,
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '222333',
            phoneNumber: '66959916439',
          }),
        };
      }
      if (action === 'getStatus') {
        return {
          ok: true,
          text: async () => 'STATUS_OK:654321',
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  assert.equal(requests[0].searchParams.get('action'), 'reactivate');
  assert.equal(requests[0].searchParams.get('id'), '123456');
  assert.deepStrictEqual(currentState.reusablePhoneActivation, null);
});

test('phone verification helper keeps maxUses behavior for reused V2 activations', async () => {
  const requests = [];
  let currentState = {
    heroSmsApiKey: 'demo-key',
    heroSmsCountryId: 16,
    heroSmsCountryLabel: 'United Kingdom',
    verificationResendCount: 0,
    currentPhoneActivation: null,
    reusablePhoneActivation: {
      activationId: '123456',
      phoneNumber: '447911123456',
      provider: 'hero-sms',
      serviceCode: 'dr',
      countryId: 16,
      successfulUses: 2,
      maxUses: 3,
      statusAction: 'getStatusV2',
    },
  };

  const helpers = api.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      requests.push(parsedUrl);
      const action = parsedUrl.searchParams.get('action');
      if (action === 'reactivate') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            activationId: '222333',
            phoneNumber: '447911123456',
          }),
        };
      }
      if (action === 'getStatusV2') {
        return {
          ok: true,
          text: async () => buildHeroSmsStatusV2Payload({ smsCode: '654321', smsText: 'Your code is 654321' }),
        };
      }
      if (action === 'setStatus') {
        return {
          ok: true,
          text: async () => 'ACCESS_ACTIVATION',
        };
      }
      throw new Error(`Unexpected HeroSMS action: ${action}`);
    },
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => defaultTimeoutMs,
    getState: async () => ({ ...currentState }),
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        return {
          phoneVerificationPage: true,
          url: 'https://auth.openai.com/phone-verification',
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          success: true,
          consentReady: true,
          url: 'https://auth.openai.com/authorize',
        };
      }
      throw new Error(`Unexpected content-script message: ${message.type}`);
    },
    setState: async (updates) => {
      currentState = { ...currentState, ...updates };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.deepStrictEqual(result, {
    success: true,
    consentReady: true,
    url: 'https://auth.openai.com/authorize',
  });
  const actions = requests.map((url) => url.searchParams.get('action'));
  assert.deepStrictEqual(actions, ['reactivate', 'getStatusV2', 'setStatus']);
  assert.deepStrictEqual(currentState.reusablePhoneActivation, null);
});
