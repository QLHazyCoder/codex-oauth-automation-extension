const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../mail2925-utils.js');

test('normalizeMail2925Account normalizes key fields', () => {
  const account = utils.normalizeMail2925Account({
    id: 'a-1',
    email: ' Demo@2925.com ',
    password: 'secret',
    enabled: 0,
    lastUsedAt: '123',
    disabledUntil: '456',
  });

  assert.deepStrictEqual(account, {
    id: 'a-1',
    email: 'demo@2925.com',
    password: 'secret',
    enabled: false,
    lastUsedAt: 123,
    lastLoginAt: 0,
    lastLimitAt: 0,
    disabledUntil: 456,
    lastError: '',
  });
});

test('pickMail2925AccountForRun skips cooldown and picks the least recently used account', () => {
  const now = 1000;
  const picked = utils.pickMail2925AccountForRun([
    { id: 'cooldown', email: 'cool@2925.com', password: 'x', disabledUntil: now + 10, lastUsedAt: 1 },
    { id: 'b', email: 'b@2925.com', password: 'x', lastUsedAt: 50 },
    { id: 'a', email: 'a@2925.com', password: 'x', lastUsedAt: 10 },
  ], { now });

  assert.equal(picked.id, 'a');
});

test('getMail2925AccountStatus reports cooldown before error', () => {
  const status = utils.getMail2925AccountStatus({
    email: 'demo@2925.com',
    password: 'secret',
    enabled: true,
    disabledUntil: Date.now() + 60_000,
    lastError: '子邮箱已达上限邮箱',
  });

  assert.equal(status, 'cooldown');
});

test('parseMail2925ImportText parses 邮箱----密码 rows', () => {
  const parsed = utils.parseMail2925ImportText(`
邮箱----密码
demo1@2925.com----pass1
demo2@2925.com----pass2
  `);

  assert.deepStrictEqual(parsed, [
    { email: 'demo1@2925.com', password: 'pass1' },
    { email: 'demo2@2925.com', password: 'pass2' },
  ]);
});
