const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('phone-sms/providers/five-sim.js', 'utf8');
const api = new Function('self', `${source}; return self.PhoneSmsFiveSimProvider;`)({});

function createTextResponse(payload, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };
}

test('5sim provider fetches profile balance with bearer token', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: new URL(url), options });
      return createTextResponse({ balance: 123.45, frozen_balance: 6.7, rating: 99 });
    },
  });

  const balance = await provider.fetchBalance({ fiveSimApiKey: 'demo-key' });

  assert.equal(requests[0].url.pathname, '/v1/user/profile');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer demo-key');
  assert.equal(balance.balance, 123.45);
  assert.equal(balance.frozenBalance, 6.7);
});

test('5sim provider maps countries and prices', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      requests.push({ url: parsed, options });
      if (parsed.pathname === '/v1/guest/countries') {
        return createTextResponse({ england: { text_en: 'England', iso: { GB: 1 }, prefix: { 44: 1 } } });
      }
      if (parsed.pathname === '/v1/guest/prices') {
        return createTextResponse({ england: { any: { openai: { cost: 10, count: 2 } } } });
      }
      throw new Error(`unexpected ${parsed.pathname}`);
    },
  });

  const countries = await provider.fetchCountries({});
  const prices = await provider.fetchPrices({}, { id: 'england', label: 'England' });
  const entries = provider.collectPriceEntries(prices, []);

  assert.deepStrictEqual(countries[0], {
    id: 'england',
    label: '英国 (England)',
    searchText: 'england 英国 (England) England GB 44',
  });
  assert.equal(requests[1].url.searchParams.get('country'), 'england');
  assert.equal(requests[1].url.searchParams.get('product'), 'openai');
  assert.deepStrictEqual(entries, [{ cost: 10, count: 2, inStock: true }]);
});

test('5sim provider buys, checks, finishes, cancels, bans, and reuses activation', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      requests.push({ url: parsed, options });
      if (parsed.pathname === '/v1/guest/products/england/any') {
        return createTextResponse({ openai: { Category: 'activation', Qty: 4, Price: 8 } });
      }
      if (parsed.pathname === '/v1/guest/prices') {
        return createTextResponse({ england: { any: { openai: { cost: 9.5, count: 4 } } } });
      }
      if (parsed.pathname === '/v1/user/buy/activation/england/any/openai') {
        return createTextResponse({ id: 1001, phone: '+447911123456', country: 'england', operator: 'any', status: 'PENDING' });
      }
      if (parsed.pathname === '/v1/user/check/1001') {
        return createTextResponse({ id: 1001, phone: '+447911123456', status: 'RECEIVED', sms: [{ text: 'code 112233' }] });
      }
      if (parsed.pathname === '/v1/user/finish/1001') return createTextResponse({ status: 'FINISHED' });
      if (parsed.pathname === '/v1/user/cancel/1001') return createTextResponse({ status: 'CANCELED' });
      if (parsed.pathname === '/v1/user/ban/1001') return createTextResponse({ status: 'BANNED' });
      if (parsed.pathname === '/v1/user/reuse/openai/447911123456') {
        return createTextResponse({ id: 1002, phone: '+447911123456', country: 'england', status: 'PENDING' });
      }
      throw new Error(`unexpected ${parsed.pathname}`);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const state = { fiveSimApiKey: 'demo-key', fiveSimCountryId: 'england', fiveSimCountryLabel: 'England', fiveSimMaxPrice: '12', fiveSimOperator: 'any' };
  const activation = await provider.requestActivation(state);
  const code = await provider.pollActivationCode(state, activation, { timeoutMs: 1000, intervalMs: 1, maxRounds: 1 });
  await provider.finishActivation(state, activation);
  await provider.cancelActivation(state, activation);
  await provider.banActivation(state, activation);
  const reused = await provider.reuseActivation(state, activation);

  assert.equal(activation.provider, '5sim');
  assert.equal(activation.activationId, '1001');
  assert.equal(activation.countryId, 'england');
  assert.equal(code, '112233');
  assert.equal(reused.activationId, '1002');
  const buy = requests.find((entry) => entry.url.pathname.includes('/buy/activation'));
  assert.equal(buy.url.searchParams.get('maxPrice'), '12');
  assert.equal(buy.url.searchParams.get('reuse'), '1');
  assert.deepStrictEqual(
    requests.map((entry) => entry.url.pathname),
    [
      '/v1/guest/products/england/any',
      '/v1/guest/prices',
      '/v1/user/buy/activation/england/any/openai',
      '/v1/user/check/1001',
      '/v1/user/finish/1001',
      '/v1/user/cancel/1001',
      '/v1/user/ban/1001',
      '/v1/user/reuse/openai/447911123456',
    ]
  );
});

test('5sim provider prefers buy-compatible products price over operator detail price', async () => {
  const requests = [];
  const provider = api.createProvider({
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      requests.push({ url: parsed, options });
      if (parsed.pathname === '/v1/guest/products/vietnam/any') {
        return createTextResponse({ openai: { Category: 'activation', Qty: 4609, Price: 0.08 } });
      }
      if (parsed.pathname === '/v1/guest/prices') {
        return createTextResponse({
          vietnam: {
            openai: {
              virtual21: { cost: 0.0769, count: 0 },
              virtual47: { cost: 0.1282, count: 4608 },
            },
          },
        });
      }
      if (parsed.pathname === '/v1/user/buy/activation/vietnam/any/openai') {
        return createTextResponse({ id: 2001, phone: '+84901234567', country: 'vietnam', operator: 'any', status: 'PENDING' });
      }
      throw new Error(`unexpected ${parsed.pathname}`);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const activation = await provider.requestActivation({
    fiveSimApiKey: 'demo-key',
    fiveSimCountryId: 'vietnam',
    fiveSimCountryLabel: '越南 (Vietnam)',
    fiveSimOperator: 'any',
  });

  assert.equal(activation.activationId, '2001');
  const buy = requests.find((entry) => entry.url.pathname.includes('/buy/activation'));
  assert.equal(buy.url.searchParams.get('maxPrice'), '0.08');
  assert.deepStrictEqual(
    requests.map((entry) => entry.url.pathname),
    [
      '/v1/guest/products/vietnam/any',
      '/v1/guest/prices',
      '/v1/user/buy/activation/vietnam/any/openai',
    ]
  );
});
