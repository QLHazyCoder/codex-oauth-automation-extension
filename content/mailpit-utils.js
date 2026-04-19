(function mailpitUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MailpitUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMailpitUtils() {
  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function stripHtmlTags(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeMailpitApiBaseUrl(rawValue = '') {
    const input = String(rawValue || '').trim();
    if (!input) return '';

    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('Mailpit API 地址必须以 http:// 或 https:// 开头');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Mailpit API 地址必须以 http:// 或 https:// 开头');
    }

    if (/^\/api\/v1\/?$/i.test(parsed.pathname) || /^\/api\/?$/i.test(parsed.pathname)) {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  }

  function normalizeMailpitDomain(rawValue = '') {
    let value = String(rawValue || '').trim().toLowerCase();
    if (!value) return '';
    value = value.replace(/^@+/, '');
    value = value.replace(/\.$/, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
      return '';
    }
    return value;
  }

  function normalizeMailpitSender(rawValue) {
    if (!rawValue) return '';
    if (typeof rawValue === 'string') {
      return rawValue.trim();
    }
    if (Array.isArray(rawValue)) {
      return rawValue.map(normalizeMailpitSender).filter(Boolean).join(', ');
    }
    if (typeof rawValue === 'object') {
      const mailbox = firstNonEmptyString([rawValue.Mailbox, rawValue.mailbox]);
      const domain = firstNonEmptyString([rawValue.Domain, rawValue.domain]);
      const address = firstNonEmptyString([
        rawValue.Address,
        rawValue.address,
        rawValue.Email,
        rawValue.email,
      ]);
      if (address) return address;
      if (mailbox && domain) return `${mailbox}@${domain}`;
      return firstNonEmptyString([
        rawValue.Name,
        rawValue.name,
      ]);
    }
    return '';
  }

  function normalizeMailpitMessage(entry = {}) {
    const message = entry.message && typeof entry.message === 'object' ? entry.message : {};
    const detail = entry.detail && typeof entry.detail === 'object' ? entry.detail : {};
    const bodyPreview = [
      detail.Text,
      stripHtmlTags(detail.HTML || detail.Html || ''),
      detail.Snippet,
      message.Snippet,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');

    return {
      id: firstNonEmptyString([detail.ID, message.ID, detail.id, message.id]),
      subject: firstNonEmptyString([detail.Subject, message.Subject, detail.subject, message.subject]),
      from: {
        emailAddress: {
          address: normalizeMailpitSender(detail.From || message.From || detail.from || message.from),
        },
      },
      bodyPreview,
      receivedDateTime: firstNonEmptyString([
        detail.Created,
        message.Created,
        detail.created,
        message.created,
        detail.Date,
        message.Date,
      ]),
    };
  }

  function normalizeMailpitMessages(entries) {
    const list = Array.isArray(entries) ? entries : (entries ? [entries] : []);
    return list.map((entry) => normalizeMailpitMessage(entry));
  }

  return {
    normalizeMailpitApiBaseUrl,
    normalizeMailpitDomain,
    normalizeMailpitMessages,
  };
});
