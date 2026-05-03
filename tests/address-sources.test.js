const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('address sources normalize supported countries and return local seeds', () => {
  const source = fs.readFileSync('data/address-sources.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageAddressSources;`)(globalScope);

  assert.equal(api.normalizeCountryCode('Deutschland'), 'DE');
  assert.equal(api.normalizeCountryCode('澳大利亚'), 'AU');
  assert.equal(api.normalizeCountryCode('印尼'), 'ID');
  assert.equal(api.normalizeCountryCode('日本'), 'JP');
  assert.equal(api.normalizeCountryCode('韩国'), 'KR');
  assert.equal(api.normalizeCountryCode('South Korea'), 'KR');
  assert.equal(api.normalizeCountryCode('unknown'), '');

  const deSeed = api.getAddressSeedForCountry('DE');
  assert.equal(deSeed.countryCode, 'DE');
  assert.equal(deSeed.suggestionIndex, 1);
  assert.equal(Boolean(deSeed.query), true);
  assert.equal(Boolean(deSeed.fallback.city), true);

  const fallbackSeed = api.getAddressSeedForCountry('unknown', { fallbackCountry: 'AU' });
  assert.equal(fallbackSeed.countryCode, 'AU');
  assert.equal(fallbackSeed.fallback.region, 'New South Wales');

  const idSeed = api.getAddressSeedForCountry('Indonesia');
  assert.equal(idSeed.countryCode, 'ID');
  assert.equal(idSeed.fallback.region, 'DKI Jakarta');

  const jpSeed = api.getAddressSeedForCountry('日本');
  assert.equal(jpSeed.countryCode, 'JP');
  assert.equal(jpSeed.fallback.region, 'Tokyo');

  const krSeed = api.getAddressSeedForCountry('Korea');
  assert.equal(krSeed.countryCode, 'KR');
  assert.equal(krSeed.fallback.region, 'Seoul');
  assert.match(krSeed.fallback.postalCode, /^\d{5}$/);
});
