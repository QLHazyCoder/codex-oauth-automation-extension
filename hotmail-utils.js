(function hotmailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.HotmailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createHotmailUtils() {
  const HOTMAIL_MICROSOFT_COMMON_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const HOTMAIL_MICROSOFT_CONSUMERS_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
  const HOTMAIL_MICROSOFT_NATIVE_REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
  const HOTMAIL_GRAPH_API_ORIGIN = 'https://graph.microsoft.com';
  const HOTMAIL_GRAPH_PAGE_SIZE = 10;
  const HOTMAIL_GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';
  const HOTMAIL_GRAPH_MESSAGE_FIELDS = [
    'id',
    'internetMessageId',
    'subject',
    'from',
    'toRecipients',
    'bodyPreview',
    'receivedDateTime',
  ];
  const HOTMAIL_GRAPH_SCOPES = [
    'offline_access',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/User.Read',
  ];
  const HOTMAIL_DIRECT_ADDRESS_MODE = 'direct';
  const HOTMAIL_PLUS_TAG_ADDRESS_MODE = 'plus-tag';
  const HOTMAIL_DEFAULT_ALIAS_COUNT = 5;
  const HOTMAIL_MIN_ALIAS_COUNT = 1;
  const HOTMAIL_MAX_ALIAS_COUNT = 20;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeTimestamp(value) {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : 0;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function createRandomId(prefix = 'hotmail-id') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}:${crypto.randomUUID()}`;
    }
    return `${prefix}:${Math.random().toString(36).slice(2, 12)}`;
  }

  function splitMailAddress(rawEmail = '') {
    const email = String(rawEmail || '').trim();
    const atIndex = email.lastIndexOf('@');
    if (atIndex <= 0 || atIndex >= email.length - 1) {
      return null;
    }

    return {
      local: email.slice(0, atIndex),
      domain: email.slice(atIndex + 1),
    };
  }

  function normalizeHotmailAddressMode(value = '', options = {}) {
    const fallback = options.allowPlusTagDefault ? HOTMAIL_PLUS_TAG_ADDRESS_MODE : HOTMAIL_DIRECT_ADDRESS_MODE;
    return String(value || '').trim().toLowerCase() === HOTMAIL_PLUS_TAG_ADDRESS_MODE
      ? HOTMAIL_PLUS_TAG_ADDRESS_MODE
      : fallback;
  }

  function normalizeHotmailAliasCount(value, addressMode = HOTMAIL_DIRECT_ADDRESS_MODE) {
    if (addressMode !== HOTMAIL_PLUS_TAG_ADDRESS_MODE) {
      return 0;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return HOTMAIL_DEFAULT_ALIAS_COUNT;
    }

    return Math.min(HOTMAIL_MAX_ALIAS_COUNT, Math.max(HOTMAIL_MIN_ALIAS_COUNT, Math.floor(numeric)));
  }

  function buildHotmailAliasTag(index = 1) {
    const numeric = Math.max(HOTMAIL_MIN_ALIAS_COUNT, Math.floor(Number(index) || HOTMAIL_MIN_ALIAS_COUNT));
    return `+${numeric}`;
  }

  function normalizeHotmailAliasTag(value, fallbackIndex = 1) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return buildHotmailAliasTag(fallbackIndex);
    }

    if (/^\+\d+$/.test(normalized)) {
      return normalized;
    }

    if (/^\d+$/.test(normalized)) {
      return `+${normalized}`;
    }

    return buildHotmailAliasTag(fallbackIndex);
  }

  function buildHotmailPlusAliasEmail(baseEmail, tag) {
    const parts = splitMailAddress(baseEmail);
    if (!parts) return '';

    const normalizedTag = normalizeHotmailAliasTag(tag);
    return `${parts.local}${normalizedTag}@${parts.domain}`;
  }

  function buildHotmailIdentityId(accountId, suffix = 'direct') {
    const normalizedSuffix = String(suffix || 'direct')
      .replace(/[^a-z0-9]+/ig, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'direct';
    return `hotmail-identity:${accountId}:${normalizedSuffix}`;
  }

  function normalizeHotmailAlias(alias = {}, options = {}) {
    const tag = normalizeHotmailAliasTag(alias.tag, options.fallbackIndex);
    const email = buildHotmailPlusAliasEmail(options.baseEmail, tag);
    return {
      id: String(alias.id || buildHotmailIdentityId(options.accountId, tag)),
      tag,
      email,
      used: Boolean(alias.used),
      lastUsedAt: normalizeTimestamp(alias.lastUsedAt),
      lastError: String(alias.lastError || ''),
    };
  }

  function buildHotmailAliases(baseEmail, aliasCount, existingAliases = [], accountId = '') {
    const normalizedExisting = Array.isArray(existingAliases) ? existingAliases : [];
    const existingByTag = new Map();
    normalizedExisting.forEach((alias, index) => {
      const tag = normalizeHotmailAliasTag(alias?.tag, index + 1);
      if (!existingByTag.has(tag)) {
        existingByTag.set(tag, alias);
      }
    });

    const aliases = [];
    for (let index = 1; index <= aliasCount; index += 1) {
      const tag = buildHotmailAliasTag(index);
      aliases.push(normalizeHotmailAlias(existingByTag.get(tag) || {}, {
        accountId,
        baseEmail,
        fallbackIndex: index,
      }));
    }
    return aliases;
  }

  function normalizeHotmailAccount(account = {}) {
    const email = String(account.email || '').trim();
    const hasAliases = Array.isArray(account.aliases) && account.aliases.length > 0;
    const addressMode = normalizeHotmailAddressMode(account.addressMode, {
      allowPlusTagDefault: hasAliases,
    });
    const aliasCount = normalizeHotmailAliasCount(
      account.aliasCount !== undefined ? account.aliasCount : (hasAliases ? account.aliases.length : undefined),
      addressMode
    );
    const id = String(account.id || createRandomId('hotmail-account'));
    const normalizedLastAuthAt = normalizeTimestamp(account.lastAuthAt);
    const normalizedStatus = String(
      account.status
      || (normalizedLastAuthAt > 0 || account.accessToken ? 'authorized' : 'pending')
    );

    return {
      id,
      email,
      password: String(account.password || ''),
      clientId: String(account.clientId || '').trim(),
      accessToken: String(account.accessToken || ''),
      refreshToken: String(account.refreshToken || ''),
      expiresAt: Number.isFinite(Number(account.expiresAt)) ? Number(account.expiresAt) : 0,
      status: normalizedStatus,
      enabled: account.enabled !== undefined ? Boolean(account.enabled) : true,
      used: Boolean(account.used),
      lastUsedAt: normalizeTimestamp(account.lastUsedAt),
      lastAuthAt: normalizedLastAuthAt,
      lastError: String(account.lastError || ''),
      addressMode,
      aliasCount,
      aliases: addressMode === HOTMAIL_PLUS_TAG_ADDRESS_MODE
        ? buildHotmailAliases(email, aliasCount, account.aliases, id)
        : [],
    };
  }

  function getDirectHotmailIdentity(account, options = {}) {
    const normalized = normalizeHotmailAccount(account);
    return {
      id: buildHotmailIdentityId(normalized.id, 'direct'),
      tag: '',
      email: normalized.email,
      used: Boolean(normalized.used),
      lastUsedAt: normalizeTimestamp(normalized.lastUsedAt),
      lastError: String(normalized.lastError || ''),
      implicit: true,
      addressMode: options.addressMode || HOTMAIL_DIRECT_ADDRESS_MODE,
    };
  }

  function getHotmailAccountIdentities(account, options = {}) {
    const { includeUsed = true } = options;
    const normalized = normalizeHotmailAccount(account);
    const identities = normalized.addressMode === HOTMAIL_PLUS_TAG_ADDRESS_MODE
      ? [
        getDirectHotmailIdentity(normalized, {
          addressMode: HOTMAIL_PLUS_TAG_ADDRESS_MODE,
        }),
        ...normalized.aliases.map((alias) => ({
          ...alias,
          implicit: false,
          addressMode: HOTMAIL_PLUS_TAG_ADDRESS_MODE,
        })),
      ]
      : [getDirectHotmailIdentity(normalized)];

    return includeUsed ? identities : identities.filter((identity) => !identity.used);
  }

  function findHotmailAccountIdentity(account, aliasId) {
    const normalized = normalizeHotmailAccount(account);
    const identities = getHotmailAccountIdentities(normalized, { includeUsed: true });
    if (aliasId) {
      return identities.find((identity) => identity.id === aliasId) || null;
    }
    return identities[0] || null;
  }

  function patchHotmailAccountIdentity(account, aliasId, updates = {}) {
    const normalized = normalizeHotmailAccount(account);
    if (normalized.addressMode === HOTMAIL_PLUS_TAG_ADDRESS_MODE) {
      const directIdentity = getDirectHotmailIdentity(normalized, {
        addressMode: HOTMAIL_PLUS_TAG_ADDRESS_MODE,
      });
      if (!aliasId || aliasId === directIdentity.id) {
        return normalizeHotmailAccount({
          ...normalized,
          used: updates.used !== undefined ? Boolean(updates.used) : normalized.used,
          lastUsedAt: updates.lastUsedAt !== undefined ? normalizeTimestamp(updates.lastUsedAt) : normalized.lastUsedAt,
          lastError: updates.lastError !== undefined ? String(updates.lastError || '') : normalized.lastError,
        });
      }

      const nextAliases = normalized.aliases.map((alias) => {
        if (alias.id !== aliasId) {
          return alias;
        }
        return {
          ...alias,
          used: updates.used !== undefined ? Boolean(updates.used) : alias.used,
          lastUsedAt: updates.lastUsedAt !== undefined ? normalizeTimestamp(updates.lastUsedAt) : alias.lastUsedAt,
          lastError: updates.lastError !== undefined ? String(updates.lastError || '') : alias.lastError,
        };
      });
      return normalizeHotmailAccount({
        ...normalized,
        aliases: nextAliases,
      });
    }

    const directIdentity = getDirectHotmailIdentity(normalized);
    if (aliasId && aliasId !== directIdentity.id) {
      return normalized;
    }

    return normalizeHotmailAccount({
      ...normalized,
      used: updates.used !== undefined ? Boolean(updates.used) : normalized.used,
      lastUsedAt: updates.lastUsedAt !== undefined ? normalizeTimestamp(updates.lastUsedAt) : normalized.lastUsedAt,
      lastError: updates.lastError !== undefined ? String(updates.lastError || '') : normalized.lastError,
    });
  }

  function resetUsedHotmailIdentities(account, options = {}) {
    const { clearErrors = false } = options;
    const normalized = normalizeHotmailAccount(account);

    if (normalized.addressMode === HOTMAIL_PLUS_TAG_ADDRESS_MODE) {
      return normalizeHotmailAccount({
        ...normalized,
        used: false,
        lastError: clearErrors ? '' : normalized.lastError,
        aliases: normalized.aliases.map((alias) => ({
          ...alias,
          used: false,
          lastError: clearErrors ? '' : alias.lastError,
        })),
      });
    }

    return normalizeHotmailAccount({
      ...normalized,
      used: false,
      lastError: clearErrors ? '' : normalized.lastError,
    });
  }

  function getHotmailAvailableIdentityCount(account) {
    return getHotmailAccountIdentities(account, { includeUsed: true })
      .filter((identity) => !identity.used)
      .length;
  }

  function getHotmailUsedIdentityCount(account) {
    return getHotmailAccountIdentities(account, { includeUsed: true })
      .filter((identity) => identity.used)
      .length;
  }

  function hasUsedHotmailIdentity(account) {
    return getHotmailUsedIdentityCount(account) > 0;
  }

  function getHotmailListToggleLabel(expanded, count = 0) {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
    return `${expanded ? '收起列表' : '展开列表'}${suffix}`;
  }

  function filterHotmailAccountsByUsage(accounts, mode = 'all') {
    const list = Array.isArray(accounts) ? accounts.map((account) => normalizeHotmailAccount(account)) : [];
    if (mode === 'used') {
      return list.filter((account) => hasUsedHotmailIdentity(account));
    }
    return list;
  }

  function getHotmailBulkActionLabel(mode = 'all', count = 0) {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    const prefix = mode === 'used' ? '重置已用' : '全部删除';
    const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
    return `${prefix}${suffix}`;
  }

  function isAuthorizedHotmailAccount(account) {
    const normalized = normalizeHotmailAccount(account);
    return Boolean(normalized)
      && normalized.status === 'authorized'
      && Boolean(normalized.refreshToken);
  }

  function shouldClearHotmailCurrentSelection(account, aliasId = null) {
    const normalized = normalizeHotmailAccount(account);
    if (normalized.addressMode === HOTMAIL_PLUS_TAG_ADDRESS_MODE) {
      if (!aliasId) return false;
      const alias = normalized.aliases.find((item) => item.id === aliasId);
      return !alias || alias.used === true;
    }
    return Boolean(normalized.used);
  }

  function upsertHotmailAccountInList(accounts, nextAccount) {
    const list = Array.isArray(accounts) ? accounts.slice() : [];
    if (!nextAccount?.id) return list;

    const existingIndex = list.findIndex((account) => account?.id === nextAccount.id);
    if (existingIndex === -1) {
      list.push(nextAccount);
      return list;
    }

    list[existingIndex] = nextAccount;
    return list;
  }

  function pickHotmailAccountForRun(accounts, options = {}) {
    const normalizedAccounts = Array.isArray(accounts)
      ? accounts.map((account) => normalizeHotmailAccount(account))
      : [];
    const excludeAccountIds = new Set((options.excludeIds || []).filter(Boolean));
    const excludeIdentityIds = new Set((options.excludeIdentityIds || []).filter(Boolean));
    const candidates = normalizedAccounts
      .filter(isAuthorizedHotmailAccount)
      .filter((account) => !excludeAccountIds.has(account.id))
      .flatMap((account) => getHotmailAccountIdentities(account, { includeUsed: false })
        .filter((identity) => !excludeIdentityIds.has(identity.id))
        .map((identity) => ({ account, alias: identity })));

    if (!candidates.length) {
      return null;
    }

    return candidates
      .slice()
      .sort((left, right) => {
        const leftUsedAt = normalizeTimestamp(left.alias?.lastUsedAt);
        const rightUsedAt = normalizeTimestamp(right.alias?.lastUsedAt);
        if (leftUsedAt !== rightUsedAt) {
          return leftUsedAt - rightUsedAt;
        }

        const leftEmail = String(left.alias?.email || left.account?.email || '');
        const rightEmail = String(right.alias?.email || right.account?.email || '');
        return leftEmail.localeCompare(rightEmail);
      })[0] || null;
  }

  function extractVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function extractVerificationCodeFromMessage(message = {}) {
    const sender = firstNonEmptyString([
      message?.from?.emailAddress?.address,
      message?.sender,
      message?.from,
    ]);
    const subject = firstNonEmptyString([message?.subject]);
    const preview = firstNonEmptyString([message?.bodyPreview, message?.preview, message?.text]);
    return extractVerificationCode([subject, preview, sender].filter(Boolean).join(' '));
  }

  function getLatestHotmailMessage(messages) {
    return (Array.isArray(messages) ? messages : [])
      .slice()
      .sort((left, right) => {
        const leftTime = normalizeTimestamp(left?.receivedDateTime);
        const rightTime = normalizeTimestamp(right?.receivedDateTime);
        return rightTime - leftTime;
      })[0] || null;
  }

  function normalizeMailAddress(rawValue) {
    if (!rawValue) return '';
    if (typeof rawValue === 'string') {
      return rawValue.trim();
    }
    if (typeof rawValue === 'object') {
      return firstNonEmptyString([
        rawValue.emailAddress?.address,
        rawValue.address,
        rawValue.email,
        rawValue.sender,
        rawValue.from,
      ]);
    }
    return '';
  }

  function normalizeMailRecipients(rawRecipients) {
    const recipients = Array.isArray(rawRecipients) ? rawRecipients : (rawRecipients ? [rawRecipients] : []);
    return recipients
      .map((recipient) => normalizeMailAddress(recipient))
      .filter(Boolean)
      .map((address) => ({
        emailAddress: {
          address,
        },
      }));
  }

  function messageTargetsRecipient(message = {}, targetEmail = '') {
    const normalizedTarget = normalizeText(targetEmail);
    if (!normalizedTarget) {
      return false;
    }

    const recipients = normalizeMailRecipients(message?.toRecipients);
    return recipients.some((recipient) => normalizeText(recipient?.emailAddress?.address) === normalizedTarget);
  }

  function stripHtmlTags(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeHotmailMailApiMessage(message = {}) {
    return {
      id: firstNonEmptyString([message.id, message.message_id, message.messageId, message.internetMessageId]),
      subject: firstNonEmptyString([message.subject, message.title]),
      from: {
        emailAddress: {
          address: normalizeMailAddress(
            message.from_email
            || message.sender_email
            || message.from
            || message.sender
            || message.emailAddress
          ),
        },
      },
      toRecipients: normalizeMailRecipients(
        message.toRecipients
        || message.to_recipients
        || message.to
        || message.recipient
        || message.recipients
      ),
      bodyPreview: firstNonEmptyString([
        message.bodyPreview,
        message.preview,
        message.snippet,
        message.text,
        message.body,
        stripHtmlTags(message.html || message.content || ''),
      ]),
      receivedDateTime: firstNonEmptyString([
        message.receivedDateTime,
        message.received_at,
        message.receivedAt,
        message.date,
        message.created_at,
        message.time,
      ]),
    };
  }

  function normalizeHotmailMailApiMessages(messages) {
    const list = Array.isArray(messages)
      ? messages
      : (messages ? [messages] : []);
    return list.map((message) => normalizeHotmailMailApiMessage(message));
  }

  function messageMatchesFilters(message, filters = {}) {
    const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
    const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
    const afterTimestamp = normalizeTimestamp(filters.afterTimestamp);
    const receivedAt = normalizeTimestamp(message?.receivedDateTime);
    if (afterTimestamp && receivedAt && receivedAt < afterTimestamp) {
      return null;
    }

    if (filters.targetEmail && !messageTargetsRecipient(message, filters.targetEmail)) {
      return null;
    }

    const sender = normalizeText(message?.from?.emailAddress?.address);
    const subject = normalizeText(message?.subject);
    const preview = String(message?.bodyPreview || '');
    const combinedText = [subject, sender, preview].filter(Boolean).join(' ');
    const code = extractVerificationCode(combinedText);
    const excludedCodes = new Set((filters.excludeCodes || []).filter(Boolean));
    if (code && excludedCodes.has(code)) {
      return null;
    }

    const senderMatch = senderFilters.length === 0
      ? true
      : senderFilters.some((item) => sender.includes(item) || normalizeText(preview).includes(item));
    const subjectMatch = subjectFilters.length === 0
      ? true
      : subjectFilters.some((item) => subject.includes(item) || normalizeText(preview).includes(item));

    if (!senderMatch && !subjectMatch) {
      return null;
    }

    if (!code) {
      return null;
    }

    return {
      code,
      message,
      receivedAt,
    };
  }

  function pickVerificationMessage(messages, filters = {}) {
    const matches = (Array.isArray(messages) ? messages : [])
      .map((message) => messageMatchesFilters(message, filters))
      .filter(Boolean)
      .sort((left, right) => right.receivedAt - left.receivedAt);

    return matches[0] || null;
  }

  function pickVerificationMessageWithFallback(messages, filters = {}) {
    const strictMatch = pickVerificationMessage(messages, filters);
    return {
      match: strictMatch || null,
      usedRelaxedFilters: false,
      usedTimeFallback: false,
    };
  }

  function pickVerificationMessageWithTimeFallback(messages, filters = {}) {
    const strictOrRelaxedResult = pickVerificationMessageWithFallback(messages, filters);
    if (strictOrRelaxedResult.match) {
      return strictOrRelaxedResult;
    }

    const timeFallbackMatch = pickVerificationMessage(messages, {
      afterTimestamp: 0,
      excludeCodes: filters.excludeCodes,
      senderFilters: filters.senderFilters,
      subjectFilters: filters.subjectFilters,
      targetEmail: filters.targetEmail,
    });

    return {
      match: timeFallbackMatch || null,
      usedRelaxedFilters: false,
      usedTimeFallback: Boolean(timeFallbackMatch),
    };
    /* c8 ignore stop */
  }

  function normalizeHotmailMailboxId(mailbox = 'INBOX') {
    const normalized = normalizeText(mailbox);
    if (normalized === 'junk' || normalized === 'junk email' || normalized === 'junkemail') {
      return 'junkemail';
    }
    return 'inbox';
  }

  function buildHotmailGraphMessagesUrl(options) {
    const folderId = normalizeHotmailMailboxId(options?.mailbox);
    const url = new URL(`${HOTMAIL_GRAPH_API_ORIGIN}/v1.0/me/mailFolders/${folderId}/messages`);
    url.searchParams.set('$top', String(options?.top || HOTMAIL_GRAPH_PAGE_SIZE));
    url.searchParams.set('$select', (options?.selectFields || HOTMAIL_GRAPH_MESSAGE_FIELDS).join(','));
    url.searchParams.set('$orderby', String(options?.orderBy || 'receivedDateTime desc'));
    return url.toString();
  }

  function getHotmailVerificationPollConfig(step) {
    if (step === 4 || step === 7) {
      return {
        initialDelayMs: 5000,
        maxAttempts: 12,
        intervalMs: 5000,
        requestFreshCodeFirst: false,
        ignorePersistedLastCode: true,
      };
    }

    return {
      initialDelayMs: 5000,
      maxAttempts: 8,
      intervalMs: 4000,
      requestFreshCodeFirst: false,
      ignorePersistedLastCode: true,
    };
  }

  function getHotmailVerificationRequestTimestamp(step, state = {}, options = {}) {
    const bufferMs = Number(options.bufferMs) || 15_000;
    const signupRequestedAt = normalizeTimestamp(state.signupVerificationRequestedAt);
    const loginRequestedAt = normalizeTimestamp(state.loginVerificationRequestedAt);
    const lastEmailTimestamp = normalizeTimestamp(state.lastEmailTimestamp);
    const flowStartTime = normalizeTimestamp(state.flowStartTime);

    if (step === 4 && signupRequestedAt) {
      return Math.max(0, signupRequestedAt - bufferMs);
    }

    if (step === 7 && loginRequestedAt) {
      return Math.max(0, loginRequestedAt - bufferMs);
    }

    return step === 7
      ? (lastEmailTimestamp || flowStartTime || 0)
      : (flowStartTime || 0);
  }

  function getHotmailGraphRequestConfig() {
    const delegatedScope = HOTMAIL_GRAPH_SCOPES.join(' ');
    return {
      timeoutMs: 15000,
      pageSize: HOTMAIL_GRAPH_PAGE_SIZE,
      scopes: HOTMAIL_GRAPH_SCOPES.slice(),
      tokenUrl: HOTMAIL_MICROSOFT_COMMON_TOKEN_URL,
      tokenRefreshStrategies: [
        {
          id: 'graph-common-default',
          label: 'Graph .default/common',
          tokenUrl: HOTMAIL_MICROSOFT_COMMON_TOKEN_URL,
          scope: HOTMAIL_GRAPH_DEFAULT_SCOPE,
          redirectUri: '',
        },
        {
          id: 'graph-common-delegated',
          label: 'Graph delegated/common',
          tokenUrl: HOTMAIL_MICROSOFT_COMMON_TOKEN_URL,
          scope: delegatedScope,
          redirectUri: '',
        },
        {
          id: 'graph-consumers-delegated',
          label: 'Graph delegated/consumers',
          tokenUrl: HOTMAIL_MICROSOFT_CONSUMERS_TOKEN_URL,
          scope: delegatedScope,
          redirectUri: '',
        },
        {
          id: 'graph-consumers-native-redirect',
          label: 'Graph delegated/consumers + native redirect',
          tokenUrl: HOTMAIL_MICROSOFT_CONSUMERS_TOKEN_URL,
          scope: delegatedScope,
          redirectUri: HOTMAIL_MICROSOFT_NATIVE_REDIRECT_URI,
        },
      ],
      messageFields: HOTMAIL_GRAPH_MESSAGE_FIELDS.slice(),
    };
  }

  function parseHotmailImportText(rawText) {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines
      .filter((line, index) => !(index === 0 && /^账号----密码----ID----Token$/i.test(line)))
      .map((line) => line.split('----').map((part) => part.trim()))
      .filter((parts) => parts.length >= 4 && parts[0] && parts[2])
      .map(([email, password, clientId, refreshToken]) => ({
        email,
        password,
        clientId,
        refreshToken,
      }));
  }

  return {
    HOTMAIL_DEFAULT_ALIAS_COUNT,
    HOTMAIL_DIRECT_ADDRESS_MODE,
    HOTMAIL_PLUS_TAG_ADDRESS_MODE,
    buildHotmailAliasTag,
    buildHotmailGraphMessagesUrl,
    buildHotmailPlusAliasEmail,
    extractVerificationCodeFromMessage,
    filterHotmailAccountsByUsage,
    extractVerificationCode,
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
    isAuthorizedHotmailAccount,
    messageTargetsRecipient,
    normalizeHotmailAccount,
    normalizeHotmailAddressMode,
    normalizeHotmailAliasCount,
    normalizeHotmailMailboxId,
    normalizeHotmailMailApiMessages,
    normalizeTimestamp,
    parseHotmailImportText,
    patchHotmailAccountIdentity,
    pickHotmailAccountForRun,
    pickVerificationMessage,
    pickVerificationMessageWithFallback,
    pickVerificationMessageWithTimeFallback,
    resetUsedHotmailIdentities,
    shouldClearHotmailCurrentSelection,
    upsertHotmailAccountInList,
  };
});
