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
    'bodyPreview',
    'receivedDateTime',
  ];
  const HOTMAIL_GRAPH_SCOPES = [
    'offline_access',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/User.Read',
  ];

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

  function getHotmailListToggleLabel(expanded, count = 0) {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
    return `${expanded ? '收起列表' : '展开列表'}${suffix}`;
  }

  function filterHotmailAccountsByUsage(accounts, mode = 'all') {
    const list = Array.isArray(accounts) ? accounts.slice() : [];
    if (mode === 'used') {
      return list.filter((account) => Boolean(account?.used));
    }
    return list;
  }

  function getHotmailBulkActionLabel(mode = 'all', count = 0) {
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    const prefix = mode === 'used' ? '清空已用' : '全部删除';
    const suffix = normalizedCount > 0 ? `（${normalizedCount}）` : '';
    return `${prefix}${suffix}`;
  }

  function isAuthorizedHotmailAccount(account) {
    return Boolean(account)
      && account.status === 'authorized'
      && !account.used
      && Boolean(account.refreshToken);
  }

  function shouldClearHotmailCurrentSelection(account) {
    return Boolean(account) && account.used === true;
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
    const candidates = Array.isArray(accounts) ? accounts.filter(isAuthorizedHotmailAccount) : [];
    if (!candidates.length) return null;

    const excludeIds = new Set((options.excludeIds || []).filter(Boolean));
    const filtered = candidates.filter((account) => !excludeIds.has(account.id));
    const pool = filtered.length ? filtered : candidates;

    return pool
      .slice()
      .sort((left, right) => {
        const leftUsedAt = normalizeTimestamp(left.lastUsedAt);
        const rightUsedAt = normalizeTimestamp(right.lastUsedAt);
        if (leftUsedAt !== rightUsedAt) {
          return leftUsedAt - rightUsedAt;
        }

        return String(left.email || '').localeCompare(String(right.email || ''));
      })[0] || null;
  }

  function messageMatchesFilters(message, filters = {}) {
    const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
    const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
    const afterTimestamp = normalizeTimestamp(filters.afterTimestamp);
    const receivedAt = normalizeTimestamp(message?.receivedDateTime);
    if (afterTimestamp && receivedAt && receivedAt < afterTimestamp) {
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
    });

    return {
      match: timeFallbackMatch || null,
      usedRelaxedFilters: false,
      usedTimeFallback: Boolean(timeFallbackMatch),
    };
    /* c8 ignore stop */
  }

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
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
    buildHotmailGraphMessagesUrl,
    extractVerificationCodeFromMessage,
    filterHotmailAccountsByUsage,
    extractVerificationCode,
    getLatestHotmailMessage,
    getHotmailBulkActionLabel,
    getHotmailListToggleLabel,
    getHotmailGraphRequestConfig,
    getHotmailVerificationPollConfig,
    getHotmailVerificationRequestTimestamp,
    normalizeHotmailMailboxId,
    isAuthorizedHotmailAccount,
    normalizeHotmailMailApiMessages,
    normalizeTimestamp,
    parseHotmailImportText,
    pickHotmailAccountForRun,
    pickVerificationMessage,
    pickVerificationMessageWithFallback,
    pickVerificationMessageWithTimeFallback,
    shouldClearHotmailCurrentSelection,
    upsertHotmailAccountInList,
  };
});
