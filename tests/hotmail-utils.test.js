const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HOTMAIL_DEFAULT_ALIAS_COUNT,
  HOTMAIL_DIRECT_ADDRESS_MODE,
  HOTMAIL_PLUS_TAG_ADDRESS_MODE,
  buildHotmailAliasTag,
  buildHotmailGraphMessagesUrl,
  buildHotmailPlusAliasEmail,
  extractVerificationCode,
  extractVerificationCodeFromMessage,
  filterHotmailAccountsByUsage,
  findHotmailAccountIdentity,
  getDirectHotmailIdentity,
  getHotmailAccountIdentities,
  getHotmailAvailableIdentityCount,
  getHotmailBulkActionLabel,
  getHotmailGraphRequestConfig,
  getHotmailListToggleLabel,
  getHotmailUsedIdentityCount,
  getHotmailVerificationPollConfig,
  getHotmailVerificationRequestTimestamp,
  getLatestHotmailMessage,
  hasUsedHotmailIdentity,
  messageTargetsRecipient,
  normalizeHotmailAccount,
  normalizeHotmailMailApiMessages,
  parseHotmailImportText,
  patchHotmailAccountIdentity,
  pickHotmailAccountForRun,
  pickVerificationMessage,
  pickVerificationMessageWithFallback,
  pickVerificationMessageWithTimeFallback,
  resetUsedHotmailIdentities,
  shouldClearHotmailCurrentSelection,
  upsertHotmailAccountInList,
} = require('../hotmail-utils.js');

function createPlusTagAccount(overrides = {}) {
  return normalizeHotmailAccount({
    id: 'main-account',
    email: 'base@hotmail.com',
    status: 'authorized',
    refreshToken: 'rt-main',
    addressMode: HOTMAIL_PLUS_TAG_ADDRESS_MODE,
    aliasCount: HOTMAIL_DEFAULT_ALIAS_COUNT,
    ...overrides,
  });
}

test('normalizeHotmailAccount derives +tag aliases for plus-tag mode', () => {
  const account = createPlusTagAccount();

  assert.equal(account.addressMode, HOTMAIL_PLUS_TAG_ADDRESS_MODE);
  assert.equal(account.aliasCount, 5);
  assert.deepEqual(
    account.aliases.map((alias) => ({ tag: alias.tag, email: alias.email })),
    [
      { tag: '+1', email: 'base+1@hotmail.com' },
      { tag: '+2', email: 'base+2@hotmail.com' },
      { tag: '+3', email: 'base+3@hotmail.com' },
      { tag: '+4', email: 'base+4@hotmail.com' },
      { tag: '+5', email: 'base+5@hotmail.com' },
    ]
  );
  assert.deepEqual(
    getHotmailAccountIdentities(account).map((identity) => identity.email),
    [
      'base@hotmail.com',
      'base+1@hotmail.com',
      'base+2@hotmail.com',
      'base+3@hotmail.com',
      'base+4@hotmail.com',
      'base+5@hotmail.com',
    ]
  );
});

test('normalizeHotmailAccount keeps old direct accounts compatible', () => {
  const account = normalizeHotmailAccount({
    id: 'legacy',
    email: 'legacy@hotmail.com',
    status: 'authorized',
    refreshToken: 'rt-legacy',
    used: true,
    lastUsedAt: 123,
  });

  assert.equal(account.addressMode, HOTMAIL_DIRECT_ADDRESS_MODE);
  assert.equal(account.aliasCount, 0);
  assert.deepEqual(getHotmailAccountIdentities(account), [{
    id: 'hotmail-identity:legacy:direct',
    tag: '',
    email: 'legacy@hotmail.com',
    used: true,
    lastUsedAt: 123,
    lastError: '',
    implicit: true,
    addressMode: HOTMAIL_DIRECT_ADDRESS_MODE,
  }]);
});

test('buildHotmailPlusAliasEmail and buildHotmailAliasTag generate deterministic +tag addresses', () => {
  assert.equal(buildHotmailAliasTag(3), '+3');
  assert.equal(buildHotmailPlusAliasEmail('mail@mail.com', '+4'), 'mail+4@mail.com');
  assert.equal(buildHotmailPlusAliasEmail('mail@mail.com', '5'), 'mail+5@mail.com');
});

test('pickHotmailAccountForRun returns the oldest unused direct identity', () => {
  const selected = pickHotmailAccountForRun([
    normalizeHotmailAccount({
      id: 'recent',
      email: 'recent@hotmail.com',
      status: 'authorized',
      refreshToken: 'rt-recent',
      lastUsedAt: 50,
    }),
    normalizeHotmailAccount({
      id: 'older',
      email: 'older@hotmail.com',
      status: 'authorized',
      refreshToken: 'rt-older',
      lastUsedAt: 10,
    }),
  ]);

  assert.equal(selected.account.id, 'older');
  assert.equal(selected.alias.email, 'older@hotmail.com');
});

test('pickHotmailAccountForRun returns the oldest unused identity in plus-tag mode, including the main address', () => {
  const account = createPlusTagAccount({
    used: true,
    lastUsedAt: 1000,
    aliases: [
      { tag: '+1', used: true, lastUsedAt: 1000 },
      { tag: '+2', used: false, lastUsedAt: 5000 },
      { tag: '+3', used: false, lastUsedAt: 200 },
      { tag: '+4', used: false, lastUsedAt: 300 },
      { tag: '+5', used: false, lastUsedAt: 400 },
    ],
  });

  const selected = pickHotmailAccountForRun([account]);

  assert.equal(selected.account.id, 'main-account');
  assert.equal(selected.alias.tag, '+3');
  assert.equal(selected.alias.email, 'base+3@hotmail.com');
});

test('pickHotmailAccountForRun respects excludeIdentityIds and returns null when aliases are exhausted', () => {
  const account = createPlusTagAccount({
    used: true,
    aliases: [
      { tag: '+1', used: true },
      { tag: '+2', used: true },
      { tag: '+3', used: true },
      { tag: '+4', used: true },
      { tag: '+5', used: false },
    ],
  });
  const onlyAvailable = findHotmailAccountIdentity(account, account.aliases[4].id);

  assert.equal(
    pickHotmailAccountForRun([account], { excludeIdentityIds: [onlyAvailable.id] }),
    null
  );
});

test('Step 9 style smoke case consumes main address plus +1..+5 and the seventh allocation returns null', () => {
  let account = createPlusTagAccount();
  const allocatedEmails = [];

  for (let index = 0; index < HOTMAIL_DEFAULT_ALIAS_COUNT + 1; index += 1) {
    const selected = pickHotmailAccountForRun([account]);
    assert.ok(selected, `expected alias allocation for round ${index + 1}`);
    allocatedEmails.push(selected.alias.email);
    account = patchHotmailAccountIdentity(account, selected.alias.id, {
      used: true,
      lastUsedAt: 1000 + index,
    });
  }

  assert.deepEqual(allocatedEmails, [
    'base@hotmail.com',
    'base+1@hotmail.com',
    'base+2@hotmail.com',
    'base+3@hotmail.com',
    'base+4@hotmail.com',
    'base+5@hotmail.com',
  ]);
  assert.equal(pickHotmailAccountForRun([account]), null);
});

test('patchHotmailAccountIdentity only marks the selected alias used without downgrading account auth state', () => {
  const account = createPlusTagAccount();
  const targetAlias = account.aliases[1];
  const nextAccount = patchHotmailAccountIdentity(account, targetAlias.id, {
    used: true,
    lastUsedAt: 2468,
  });

  assert.equal(nextAccount.status, 'authorized');
  assert.equal(nextAccount.aliases[1].used, true);
  assert.equal(nextAccount.aliases[1].lastUsedAt, 2468);
  assert.equal(nextAccount.aliases[0].used, false);
});

test('resetUsedHotmailIdentities resets alias usage without deleting the account', () => {
  const account = createPlusTagAccount({
    used: true,
    aliases: [
      { tag: '+1', used: true },
      { tag: '+2', used: false },
      { tag: '+3', used: true },
      { tag: '+4', used: false },
      { tag: '+5', used: false },
    ],
  });

  const resetAccount = resetUsedHotmailIdentities(account);

  assert.equal(getHotmailUsedIdentityCount(resetAccount), 0);
  assert.equal(getHotmailAvailableIdentityCount(resetAccount), 6);
});

test('shouldClearHotmailCurrentSelection returns true only when the selected identity is used or missing', () => {
  const account = createPlusTagAccount();
  const alias = account.aliases[0];

  assert.equal(shouldClearHotmailCurrentSelection(account, alias.id), false);

  const usedAccount = patchHotmailAccountIdentity(account, alias.id, { used: true });
  assert.equal(shouldClearHotmailCurrentSelection(usedAccount, alias.id), true);
  assert.equal(shouldClearHotmailCurrentSelection(usedAccount, 'missing-alias'), true);
});

test('plus-tag mode also allows the main address itself to be marked used', () => {
  const account = createPlusTagAccount();
  const mainIdentity = getHotmailAccountIdentities(account)[0];

  const nextAccount = patchHotmailAccountIdentity(account, mainIdentity.id, {
    used: true,
    lastUsedAt: 1357,
  });

  assert.equal(nextAccount.used, true);
  assert.equal(nextAccount.lastUsedAt, 1357);
  assert.equal(shouldClearHotmailCurrentSelection(nextAccount, mainIdentity.id), true);
});

test('filterHotmailAccountsByUsage and usage counters inspect alias-level state', () => {
  const accounts = [
    createPlusTagAccount({
      id: 'used-aliases',
      aliases: [{ tag: '+1', used: true }],
    }),
    createPlusTagAccount({
      id: 'fresh-aliases',
      email: 'fresh@hotmail.com',
      aliases: [{ tag: '+1', used: false }],
    }),
  ];

  assert.deepEqual(
    filterHotmailAccountsByUsage(accounts, 'used').map((account) => account.id),
    ['used-aliases']
  );
  assert.equal(hasUsedHotmailIdentity(accounts[0]), true);
  assert.equal(hasUsedHotmailIdentity(accounts[1]), false);
});

test('upsertHotmailAccountInList replaces matching account state by id', () => {
  const accounts = [
    createPlusTagAccount({ id: 'active' }),
    createPlusTagAccount({ id: 'other', email: 'other@hotmail.com' }),
  ];

  const nextAccounts = upsertHotmailAccountInList(accounts, createPlusTagAccount({
    id: 'active',
    aliases: [{ tag: '+1', used: true }],
  }));

  assert.equal(nextAccounts.length, 2);
  assert.equal(nextAccounts[0].id, 'active');
  assert.equal(nextAccounts[0].aliases[0].used, true);
});

test('extractVerificationCode returns first six-digit code from multilingual mail text', () => {
  assert.equal(extractVerificationCode('你的 ChatGPT 验证码为 370794，请勿泄露。'), '370794');
  assert.equal(extractVerificationCode('Your verification code is 654321.'), '654321');
  assert.equal(extractVerificationCode('No code here'), null);
});

test('extractVerificationCodeFromMessage reads code from the latest message subject or preview', () => {
  assert.equal(
    extractVerificationCodeFromMessage({
      subject: '你的 ChatGPT 代码为 192742',
      bodyPreview: 'OpenAI 验证邮件',
      from: { emailAddress: { address: 'noreply@openai.com' } },
    }),
    '192742'
  );

  assert.equal(
    extractVerificationCodeFromMessage({
      subject: 'OpenAI security message',
      bodyPreview: 'Your verification code is 654321.',
      from: { emailAddress: { address: 'noreply@openai.com' } },
    }),
    '654321'
  );
});

test('getHotmailListToggleLabel reflects expanded state and account count', () => {
  assert.equal(getHotmailListToggleLabel(false, 0), '展开列表');
  assert.equal(getHotmailListToggleLabel(false, 7), '展开列表（7）');
  assert.equal(getHotmailListToggleLabel(true, 7), '收起列表（7）');
});

test('getHotmailBulkActionLabel reflects reset/delete action labels', () => {
  assert.equal(getHotmailBulkActionLabel('used', 0), '重置已用');
  assert.equal(getHotmailBulkActionLabel('used', 3), '重置已用（3）');
  assert.equal(getHotmailBulkActionLabel('all', 5), '全部删除（5）');
});

test('getLatestHotmailMessage picks the newest received mail', () => {
  const latest = getLatestHotmailMessage([
    {
      id: 'older',
      subject: 'older',
      receivedDateTime: '2026-04-11T00:01:00.000Z',
    },
    {
      id: 'newest',
      subject: 'newest',
      receivedDateTime: '2026-04-11T00:05:00.000Z',
    },
    {
      id: 'middle',
      subject: 'middle',
      receivedDateTime: '2026-04-11T00:03:00.000Z',
    },
  ]);

  assert.equal(latest.id, 'newest');
});

test('normalizeHotmailMailApiMessages maps Graph recipients into the verification message shape', () => {
  const messages = normalizeHotmailMailApiMessages([
    {
      id: 'mail-1',
      from: 'noreply@openai.com',
      to: ['base+1@hotmail.com'],
      subject: 'ChatGPT verification code',
      text: 'Use 135790 to continue',
      date: '2026-04-10T10:02:00.000Z',
    },
  ]);

  assert.deepEqual(messages, [
    {
      id: 'mail-1',
      subject: 'ChatGPT verification code',
      from: { emailAddress: { address: 'noreply@openai.com' } },
      toRecipients: [{ emailAddress: { address: 'base+1@hotmail.com' } }],
      bodyPreview: 'Use 135790 to continue',
      receivedDateTime: '2026-04-10T10:02:00.000Z',
    },
  ]);
});

test('messageTargetsRecipient requires exact recipient match for the current alias', () => {
  const message = normalizeHotmailMailApiMessages([{
    id: 'mail-1',
    from: 'noreply@openai.com',
    toRecipients: [
      { emailAddress: { address: 'base+1@hotmail.com' } },
      { emailAddress: { address: 'other@hotmail.com' } },
    ],
    subject: 'Verification code 135790',
    bodyPreview: 'Use 135790',
    receivedDateTime: '2026-04-10T10:02:00.000Z',
  }])[0];

  assert.equal(messageTargetsRecipient(message, 'base+1@hotmail.com'), true);
  assert.equal(messageTargetsRecipient(message, 'base+2@hotmail.com'), false);
});

test('pickVerificationMessage filters by time, sender, subject, excluded code, and exact target recipient', () => {
  const messages = normalizeHotmailMailApiMessages([
    {
      id: 'wrong-recipient',
      from: 'noreply@openai.com',
      to: ['base+2@hotmail.com'],
      subject: 'ChatGPT verification code 111111',
      text: 'Use 111111 to continue',
      date: '2026-04-10T10:02:00.000Z',
    },
    {
      id: 'good-mail',
      from: 'noreply@openai.com',
      to: ['base+1@hotmail.com'],
      subject: 'ChatGPT verification code 333333',
      text: 'Use 333333 to continue',
      date: '2026-04-10T10:03:00.000Z',
    },
    {
      id: 'excluded-mail',
      from: 'noreply@openai.com',
      to: ['base+1@hotmail.com'],
      subject: 'ChatGPT verification code 444444',
      text: 'Use 444444 to continue',
      date: '2026-04-10T10:04:00.000Z',
    },
  ]);

  const match = pickVerificationMessage(messages, {
    afterTimestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
    senderFilters: ['openai', 'noreply'],
    subjectFilters: ['verification', 'code', 'chatgpt'],
    excludeCodes: ['444444'],
    targetEmail: 'base+1@hotmail.com',
  });

  assert.equal(match.message.id, 'good-mail');
  assert.equal(match.code, '333333');
});

test('pickVerificationMessageWithFallback no longer matches arbitrary recent mails when recipient misses', () => {
  const messages = normalizeHotmailMailApiMessages([{
    id: 'login-mail',
    from: 'account-security@openai.com',
    to: ['base+9@hotmail.com'],
    subject: 'Use this security code to continue 555666',
    text: 'Your one-time security code is 555666',
    date: '2026-04-10T10:05:00.000Z',
  }]);

  const result = pickVerificationMessageWithFallback(messages, {
    afterTimestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
    senderFilters: ['noreply'],
    subjectFilters: ['verification'],
    targetEmail: 'base+1@hotmail.com',
    excludeCodes: [],
  });

  assert.equal(result.match, null);
  assert.equal(result.usedRelaxedFilters, false);
  assert.equal(result.usedTimeFallback, false);
});

test('pickVerificationMessageWithTimeFallback keeps targetEmail when ignoring afterTimestamp', () => {
  const messages = normalizeHotmailMailApiMessages([
    {
      id: 'slightly-old-mail',
      from: 'noreply@openai.com',
      to: ['base+1@hotmail.com'],
      subject: '你的 ChatGPT 代码为 141735',
      text: 'OpenAI logo ...',
      date: '2026-04-10T10:00:02.000Z',
    },
    {
      id: 'wrong-alias-mail',
      from: 'noreply@openai.com',
      to: ['base+2@hotmail.com'],
      subject: '你的 ChatGPT 代码为 888999',
      text: 'OpenAI logo ...',
      date: '2026-04-10T10:00:09.000Z',
    },
  ]);

  const result = pickVerificationMessageWithTimeFallback(messages, {
    afterTimestamp: Date.UTC(2026, 3, 10, 10, 0, 10),
    senderFilters: ['openai', 'noreply'],
    subjectFilters: ['verify', 'verification', 'code'],
    targetEmail: 'base+1@hotmail.com',
    excludeCodes: [],
  });

  assert.equal(result.match.message.id, 'slightly-old-mail');
  assert.equal(result.match.code, '141735');
  assert.equal(result.usedRelaxedFilters, false);
  assert.equal(result.usedTimeFallback, true);
});

test('buildHotmailGraphMessagesUrl targets the official Microsoft Graph mailbox endpoint', () => {
  const url = new URL(buildHotmailGraphMessagesUrl({
    mailbox: 'Junk',
  }));

  assert.equal(url.origin + url.pathname, 'https://graph.microsoft.com/v1.0/me/mailFolders/junkemail/messages');
  assert.equal(url.searchParams.get('$top'), '10');
  assert.equal(url.searchParams.get('$orderby'), 'receivedDateTime desc');
  assert.match(url.searchParams.get('$select'), /subject/);
  assert.match(url.searchParams.get('$select'), /toRecipients/);
});

test('getHotmailVerificationPollConfig gives Hotmail a slower initial wait and longer polling window', () => {
  assert.deepEqual(getHotmailVerificationPollConfig(4), {
    initialDelayMs: 5000,
    maxAttempts: 12,
    intervalMs: 5000,
    requestFreshCodeFirst: false,
    ignorePersistedLastCode: true,
  });

  assert.deepEqual(getHotmailVerificationPollConfig(7), {
    initialDelayMs: 5000,
    maxAttempts: 12,
    intervalMs: 5000,
    requestFreshCodeFirst: false,
    ignorePersistedLastCode: true,
  });
});

test('getHotmailVerificationRequestTimestamp prefers actual request timestamps with a safety buffer', () => {
  const signupRequestedAt = Date.UTC(2026, 3, 10, 12, 0, 30);
  const loginRequestedAt = Date.UTC(2026, 3, 10, 12, 5, 45);

  assert.equal(
    getHotmailVerificationRequestTimestamp(4, {
      signupVerificationRequestedAt: signupRequestedAt,
      flowStartTime: signupRequestedAt - 60_000,
    }),
    signupRequestedAt - 15_000
  );

  assert.equal(
    getHotmailVerificationRequestTimestamp(7, {
      loginVerificationRequestedAt: loginRequestedAt,
      lastEmailTimestamp: loginRequestedAt - 120_000,
      flowStartTime: loginRequestedAt - 300_000,
    }),
    loginRequestedAt - 15_000
  );
});

test('getHotmailGraphRequestConfig defines Microsoft Graph request defaults with toRecipients selected', () => {
  assert.deepEqual(getHotmailGraphRequestConfig(), {
    timeoutMs: 15000,
    pageSize: 10,
    scopes: [
      'offline_access',
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/User.Read',
    ],
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    tokenRefreshStrategies: [
      {
        id: 'graph-common-default',
        label: 'Graph .default/common',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: 'https://graph.microsoft.com/.default',
        redirectUri: '',
      },
      {
        id: 'graph-common-delegated',
        label: 'Graph delegated/common',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read',
        redirectUri: '',
      },
      {
        id: 'graph-consumers-delegated',
        label: 'Graph delegated/consumers',
        tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        scope: 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read',
        redirectUri: '',
      },
      {
        id: 'graph-consumers-native-redirect',
        label: 'Graph delegated/consumers + native redirect',
        tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        scope: 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read',
        redirectUri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
      },
    ],
    messageFields: [
      'id',
      'internetMessageId',
      'subject',
      'from',
      'toRecipients',
      'bodyPreview',
      'receivedDateTime',
    ],
  });
});

test('parseHotmailImportText parses account lines in email----password----clientId----token format', () => {
  const parsed = parseHotmailImportText(`
账号----密码----ID----Token
JohnRodriguez5425@hotmail.com----nb4ta1OK----9e5f94bc-e8a4-4e73-b8be-63364c29d753----refresh-token-1
alice@hotmail.com----pass-2----client-2----refresh-token-2
  `.trim());

  assert.deepEqual(parsed, [
    {
      email: 'JohnRodriguez5425@hotmail.com',
      password: 'nb4ta1OK',
      clientId: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
      refreshToken: 'refresh-token-1',
    },
    {
      email: 'alice@hotmail.com',
      password: 'pass-2',
      clientId: 'client-2',
      refreshToken: 'refresh-token-2',
    },
  ]);
});

test('getDirectHotmailIdentity returns the implicit identity for direct accounts', () => {
  const identity = getDirectHotmailIdentity(normalizeHotmailAccount({
    id: 'direct-id',
    email: 'direct@hotmail.com',
    status: 'authorized',
    refreshToken: 'rt',
  }));

  assert.equal(identity.id, 'hotmail-identity:direct-id:direct');
  assert.equal(identity.email, 'direct@hotmail.com');
});
