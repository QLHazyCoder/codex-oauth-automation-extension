const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadGoPayUtils() {
  const source = fs.readFileSync('gopay-utils.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.GoPayUtils;`)(globalScope);
}

test('GoPay utils normalize manual OTP input', () => {
  const api = loadGoPayUtils();
  assert.equal(api.normalizeGoPayOtp(' 12-34 56 '), '123456');
  assert.equal(api.normalizeGoPayOtp('abc'), '');
});

test('GoPay utils keeps GPC helper payment method distinct', () => {
  const api = loadGoPayUtils();
  assert.equal(api.normalizePlusPaymentMethod('gpc-helper'), 'gpc-helper');
  assert.equal(api.normalizePlusPaymentMethod('gopay'), 'gopay');
  assert.equal(api.normalizePlusPaymentMethod('unknown'), 'paypal');
});

test('GoPay utils builds GPC card balance URL from helper endpoints', () => {
  const api = loadGoPayUtils();
  assert.equal(api.DEFAULT_GPC_HELPER_API_URL, 'https://gopay.hwork.pro');
  assert.equal(api.normalizeGpcHelperBaseUrl(''), 'https://gopay.hwork.pro');
  assert.equal(
    api.buildGpcHelperApiUrl('', '/api/checkout/start'),
    'https://gopay.hwork.pro/api/checkout/start'
  );
  assert.equal(
    api.buildGpcCardBalanceUrl('http://localhost:18473/', ' card key/1 '),
    'http://localhost:18473/api/card/balance?card_key=card%20key%2F1'
  );
  assert.equal(
    api.buildGpcCardBalanceUrl('https://gopay.hwork.pro/api/checkout/start', 'GPC-1'),
    'https://gopay.hwork.pro/api/card/balance?card_key=GPC-1'
  );
  assert.equal(
    api.buildGpcCardBalanceUrl('https://gopay.hwork.pro/api/card/balance?card_key=old', 'new'),
    'https://gopay.hwork.pro/api/card/balance?card_key=new'
  );
});

test('GoPay utils builds GPC OTP/PIN payloads with card_key and flow_id', () => {
  const api = loadGoPayUtils();
  assert.deepEqual(
    api.buildGpcOtpPayload({
      reference_id: ' ref_1 ',
      otp: ' 12-34 56 ',
      card_key: ' card_1 ',
      gopay_guid: ' guid_1 ',
      flow_id: ' flow_1 ',
      redirect_url: 'https://pm-redirects.stripe.com/test',
    }),
    {
      reference_id: 'ref_1',
      otp: '123456',
      card_key: 'card_1',
      flow_id: 'flow_1',
      gopay_guid: 'guid_1',
      redirect_url: 'https://pm-redirects.stripe.com/test',
    }
  );
  assert.deepEqual(
    api.buildGpcOtpRetryPayload({ referenceId: 'ref_1', otp: '123456', cardKey: 'card_1', flowId: 'flow_1' }),
    {
      reference_id: 'ref_1',
      otp: '123456',
      card_key: 'card_1',
      flow_id: 'flow_1',
      code: '123456',
    }
  );
  assert.deepEqual(
    api.buildGpcPinPayload({
      referenceId: 'ref_1',
      challengeId: 'challenge_1',
      gopayGuid: 'guid_1',
      pin: '65-43-21',
      cardKey: 'card_1',
      flowId: 'flow_1',
    }),
    {
      reference_id: 'ref_1',
      challenge_id: 'challenge_1',
      gopay_guid: 'guid_1',
      pin: '654321',
      card_key: 'card_1',
      flow_id: 'flow_1',
    }
  );
});

test('GoPay utils formats balance and maps linked-account errors', () => {
  const api = loadGoPayUtils();
  assert.equal(
    api.formatGpcBalancePayload({ remaining_uses: 12, card_status: 'active', flow_id: 'flow_1' }),
    '余额 12，状态 active，flow_id flow_1'
  );
  assert.equal(
    api.extractGpcResponseErrorDetail({ errors: [{ loc: ['body', 'otp'], msg: 'Field required' }] }, 422),
    'body.otp: Field required'
  );
  assert.equal(
    api.extractGpcResponseErrorDetail({ error_messages: ['account already linked'] }, 406),
    'GOPAY已经绑了订阅，需要手动解绑'
  );
});
