(function yydsMailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.YydsMailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createYydsMailUtils() {
  const DEFAULT_YYDS_MAIL_BASE_URL = 'https://maliapi.215.im/v1';
  const YYDS_MAIL_PROVIDER = 'yyds-mail';

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeYydsMailBaseUrl(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) return DEFAULT_YYDS_MAIL_BASE_URL;

    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)
      ? value
      : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return DEFAULT_YYDS_MAIL_BASE_URL;
      }
      parsed.hash = '';
      parsed.search = '';
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${pathname}` || DEFAULT_YYDS_MAIL_BASE_URL;
    } catch {
      return DEFAULT_YYDS_MAIL_BASE_URL;
    }
  }

  function normalizeYydsMailApiKey(value = '') {
    return String(value || '').trim();
  }

  function normalizeYydsMailAddress(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function buildYydsMailHeaders(config = {}, options = {}) {
    const headers = {};
    const apiKey = firstNonEmptyString([
      options.apiKey,
      options.includeConfigApiKey === false ? '' : config.apiKey,
      options.includeConfigApiKey === false ? '' : config.yydsMailApiKey,
    ]);
    const tempToken = firstNonEmptyString([
      options.tempToken,
      config.tempToken,
      config.token,
    ]);

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    if (tempToken) {
      headers.Authorization = /^bearer\s+/i.test(tempToken)
        ? tempToken
        : `Bearer ${tempToken}`;
    }
    if (options.json) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.acceptJson !== false) {
      headers.Accept = 'application/json';
    }
    return headers;
  }

  function joinYydsMailUrl(baseUrl, path, params = {}) {
    const normalizedBase = normalizeYydsMailBaseUrl(baseUrl);
    const normalizedPath = String(path || '').trim();
    const url = new URL(`${normalizedBase}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  function normalizeYydsMailInbox(payload = {}) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    return {
      id: firstNonEmptyString([safePayload.id, safePayload.inbox_id, safePayload.inboxId]),
      address: normalizeYydsMailAddress(firstNonEmptyString([safePayload.address, safePayload.email])),
      token: firstNonEmptyString([safePayload.token, safePayload.tempToken, safePayload.accessToken]),
      expiresAt: firstNonEmptyString([safePayload.expiresAt, safePayload.expires_at]) || null,
      isActive: safePayload.isActive !== undefined ? Boolean(safePayload.isActive) : true,
      createdAt: firstNonEmptyString([safePayload.createdAt, safePayload.created_at]) || null,
      raw: safePayload,
    };
  }

  function normalizeYydsMailCurrentInbox(value = null) {
    if (!value || typeof value !== 'object') return null;
    const inbox = normalizeYydsMailInbox(value);
    return inbox.address && inbox.token ? inbox : null;
  }

  function getYydsMailRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const candidates = [
      payload.messages,
      payload.items,
      payload.list,
      payload.records,
      payload.data?.messages,
      payload.data?.items,
      payload.data?.list,
      payload.data?.records,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return [];
  }

  function stripHtmlTags(value = '') {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeYydsMailSender(value = {}) {
    if (typeof value === 'string') {
      return { name: '', address: value };
    }
    const safeValue = value && typeof value === 'object' ? value : {};
    return {
      name: firstNonEmptyString([safeValue.name]),
      address: firstNonEmptyString([safeValue.address, safeValue.email]),
    };
  }

  function normalizeYydsMailRecipients(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map((item) => {
      if (typeof item === 'string') return { name: '', address: normalizeYydsMailAddress(item) };
      const safeItem = item && typeof item === 'object' ? item : {};
      return {
        name: firstNonEmptyString([safeItem.name]),
        address: normalizeYydsMailAddress(firstNonEmptyString([safeItem.address, safeItem.email])),
      };
    }).filter((item) => item.address);
  }

  function normalizeYydsMailCreatedAt(value = '') {
    const source = firstNonEmptyString([value]);
    if (!source) return '';
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : source;
  }

  function normalizeYydsMailMessage(row = {}) {
    if (!row || typeof row !== 'object') return null;
    const from = normalizeYydsMailSender(row.from || row.sender);
    const to = normalizeYydsMailRecipients(row.to || row.recipients || row.recipient);
    const htmlValue = Array.isArray(row.html)
      ? row.html.join('\n')
      : firstNonEmptyString([row.html, row.bodyHtml, row.body_html]);
    const textValue = firstNonEmptyString([row.text, row.bodyText, row.body_text, row.bodyPreview, row.preview]);
    const raw = firstNonEmptyString([row.raw, row.source]);
    const bodyPreview = (textValue || stripHtmlTags(htmlValue) || stripHtmlTags(raw))
      .replace(/\s+/g, ' ')
      .trim();

    return {
      id: firstNonEmptyString([row.id, row.message_id, row.messageId]),
      address: normalizeYydsMailAddress(firstNonEmptyString([
        row.address,
        row.mailbox,
        to[0]?.address,
      ])),
      inboxId: firstNonEmptyString([row.inboxId, row.inbox_id]),
      subject: firstNonEmptyString([row.subject, row.title]),
      from: {
        name: from.name,
        emailAddress: {
          address: from.address,
        },
      },
      to,
      seen: Boolean(row.seen),
      bodyPreview,
      raw: raw || htmlValue || textValue || '',
      text: textValue,
      html: htmlValue,
      receivedDateTime: normalizeYydsMailCreatedAt(firstNonEmptyString([
        row.createdAt,
        row.created_at,
        row.receivedDateTime,
        row.date,
      ])),
    };
  }

  function normalizeYydsMailMessages(payload) {
    return getYydsMailRows(payload)
      .map((row) => normalizeYydsMailMessage(row))
      .filter(Boolean);
  }

  function extractYydsMailVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchOpenAiLogin = source.match(/(?:chatgpt\s+log-?in\s+code|enter\s+this\s+code)[^0-9]{0,24}(\d{6})/i);
    if (matchOpenAiLogin) return matchOpenAiLogin[1];

    const matchChatGPT = source.match(/your\s+chatgpt\s+code\s+is\s+(\d{6})/i);
    if (matchChatGPT) return matchChatGPT[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function normalizeYydsMailMessageDetail(payload = {}) {
    const message = normalizeYydsMailMessage(payload);
    if (!message) return null;
    const combined = [
      message.subject,
      message.from?.emailAddress?.address,
      message.bodyPreview,
      message.text,
      message.html,
      message.raw,
    ].filter(Boolean).join(' ');
    return {
      ...message,
      bodyPreview: message.bodyPreview || stripHtmlTags(combined),
      verification_code: extractYydsMailVerificationCode(combined) || '',
    };
  }

  return {
    DEFAULT_YYDS_MAIL_BASE_URL,
    YYDS_MAIL_PROVIDER,
    buildYydsMailHeaders,
    extractYydsMailVerificationCode,
    firstNonEmptyString,
    joinYydsMailUrl,
    normalizeYydsMailAddress,
    normalizeYydsMailApiKey,
    normalizeYydsMailBaseUrl,
    normalizeYydsMailCurrentInbox,
    normalizeYydsMailInbox,
    normalizeYydsMailMessage,
    normalizeYydsMailMessageDetail,
    normalizeYydsMailMessages,
    stripHtmlTags,
  };
});
