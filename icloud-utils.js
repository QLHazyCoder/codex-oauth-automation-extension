(function icloudUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.IcloudUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createIcloudUtils() {
  function normalizeIcloudHost(rawHost) {
    const host = String(rawHost || '').trim().toLowerCase();
    if (!host) return '';
    if (host === 'icloud.com' || host === 'www.icloud.com' || host === 'setup.icloud.com') return 'icloud.com';
    if (host === 'icloud.com.cn' || host === 'www.icloud.com.cn' || host === 'setup.icloud.com.cn') return 'icloud.com.cn';
    return '';
  }

  function getConfiguredIcloudHostPreference(stateOrValue = '') {
    const preference = typeof stateOrValue === 'object'
      ? String(stateOrValue?.icloudHostPreference || '').trim().toLowerCase()
      : String(stateOrValue || '').trim().toLowerCase();
    if (!preference || preference === 'auto') return '';
    return normalizeIcloudHost(preference);
  }

  function getIcloudLoginUrlForHost(host) {
    const normalizedHost = normalizeIcloudHost(host);
    if (normalizedHost === 'icloud.com') return 'https://www.icloud.com/';
    if (normalizedHost === 'icloud.com.cn') return 'https://www.icloud.com.cn/';
    return '';
  }

  function getIcloudSetupUrlForHost(host) {
    const normalizedHost = normalizeIcloudHost(host);
    if (normalizedHost === 'icloud.com') return 'https://setup.icloud.com/setup/ws/1';
    if (normalizedHost === 'icloud.com.cn') return 'https://setup.icloud.com.cn/setup/ws/1';
    return '';
  }

  function getIcloudHostHintFromMessage(message) {
    const lower = String(message || '').toLowerCase();
    if (lower.includes('setup.icloud.com.cn') || lower.includes('www.icloud.com.cn') || lower.includes('icloud.com.cn')) {
      return 'icloud.com.cn';
    }
    if (lower.includes('setup.icloud.com') || lower.includes('www.icloud.com') || lower.includes('icloud.com')) {
      return 'icloud.com';
    }
    return '';
  }

  function normalizeBooleanMap(rawValue = {}) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return {};
    }

    return Object.entries(rawValue).reduce((result, [key, value]) => {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey) {
        return result;
      }
      result[normalizedKey] = Boolean(value);
      return result;
    }, {});
  }

  function toNormalizedEmailSet(values = []) {
    if (values instanceof Set) {
      return new Set(Array.from(values, (item) => String(item || '').trim().toLowerCase()).filter(Boolean));
    }
    if (Array.isArray(values)) {
      return new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
    }
    if (values && typeof values === 'object') {
      const normalizedMap = normalizeBooleanMap(values);
      return new Set(Object.entries(normalizedMap)
        .filter(([, value]) => value)
        .map(([email]) => email));
    }
    return new Set();
  }

  function findIcloudAliasArray(node, depth = 0) {
    if (!node || depth > 4) return null;
    if (Array.isArray(node)) {
      return node.some((item) => item && typeof item === 'object') ? node : null;
    }
    if (typeof node !== 'object') return null;

    const priorityKeys = ['hmeEmails', 'hmeEmailList', 'hmeList', 'hmes', 'aliases', 'items'];
    for (const key of priorityKeys) {
      if (Array.isArray(node[key])) return node[key];
    }

    for (const value of Object.values(node)) {
      const nested = findIcloudAliasArray(value, depth + 1);
      if (nested) return nested;
    }

    return null;
  }

  function normalizeIcloudAliasRecord(raw, options = {}) {
    const usedEmails = toNormalizedEmailSet(options.usedEmails);
    const preservedEmails = toNormalizedEmailSet(options.preservedEmails);
    const anonymousId = String(raw?.anonymousId || raw?.id || '').trim();
    const email = String(
      raw?.hme
        || raw?.email
        || raw?.alias
        || raw?.address
        || raw?.metaData?.hme
        || ''
    ).trim().toLowerCase();

    if (!email || !email.includes('@')) return null;

    const label = String(raw?.label || raw?.metaData?.label || '').trim();
    const note = String(raw?.note || raw?.metaData?.note || '').trim();
    const state = String(raw?.state || raw?.status || '').trim().toLowerCase();
    const createdAt = raw?.createTimestamp
      || raw?.createTime
      || raw?.createdAt
      || raw?.createdDate
      || null;

    return {
      anonymousId,
      email,
      label,
      note,
      state,
      active: raw?.active !== false && raw?.isActive !== false && state !== 'inactive' && state !== 'deleted',
      used: usedEmails.has(email),
      preserved: preservedEmails.has(email),
      createdAt,
    };
  }

  function normalizeIcloudAliasList(response, options = {}) {
    const aliases = findIcloudAliasArray(response);
    if (!aliases) return [];

    return aliases
      .map((alias) => normalizeIcloudAliasRecord(alias, options))
      .filter(Boolean)
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        if (left.used !== right.used) return left.used ? 1 : -1;
        return String(left.email).localeCompare(String(right.email));
      });
  }

  function pickReusableIcloudAlias(aliases = []) {
    return (Array.isArray(aliases) ? aliases : []).find((alias) => alias?.active && !alias?.used) || null;
  }

  function findIcloudAliasByEmail(aliases = [], email = '') {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    return (Array.isArray(aliases) ? aliases : [])
      .find((alias) => String(alias?.email || '').trim().toLowerCase() === normalizedEmail) || null;
  }

  return {
    findIcloudAliasArray,
    findIcloudAliasByEmail,
    getConfiguredIcloudHostPreference,
    getIcloudHostHintFromMessage,
    getIcloudLoginUrlForHost,
    getIcloudSetupUrlForHost,
    normalizeBooleanMap,
    normalizeIcloudAliasList,
    normalizeIcloudAliasRecord,
    normalizeIcloudHost,
    pickReusableIcloudAlias,
    toNormalizedEmailSet,
  };
});
