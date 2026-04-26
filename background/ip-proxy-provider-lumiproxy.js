// background/ip-proxy-provider-lumiproxy.js — LumiProxy 专属参数与账号规则
(function registerLumiProxyProvider(root) {
  const HOST_COUNTRY_HINTS = new Set([
    'us', 'de', 'uk', 'fr', 'nl', 'it', 'es', 'ca', 'au', 'sg', 'jp', 'kr', 'tw', 'hk', 'in', 'br', 'mx',
  ]);

  function normalizeCountryCode(value = '') {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const simple = raw.replace(/[^a-z]/g, '');
    return /^[a-z]{2}$/.test(simple) ? simple : '';
  }

  function normalizeSessionPrefix(value = '') {
    return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  }

  function normalize711SessionId(value = '') {
    return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  }

  function normalizeLifeMinutes(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number.parseInt(raw, 10);
    if (!Number.isInteger(numeric)) return '';
    return String(Math.max(1, Math.min(1440, numeric)));
  }

  function normalize711SessionMinutes(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number.parseInt(raw, 10);
    if (!Number.isInteger(numeric)) return '';
    return String(Math.max(1, Math.min(180, numeric)));
  }

  function normalize711RegionCode(value = '') {
    return normalizeCountryCode(value);
  }

  function inferCountryFromHost(host = '') {
    const normalizedHost = String(host || '').trim().toLowerCase();
    if (!normalizedHost || !normalizedHost.endsWith('.lumiproxy.io')) {
      return '';
    }
    const prefix = normalizedHost.split('.')[0] || '';
    return HOST_COUNTRY_HINTS.has(prefix) ? prefix : '';
  }

  function inferAreaFromUsername(username = '') {
    const text = String(username || '').trim().toLowerCase();
    if (!text) return '';
    const areaMatch = text.match(/(?:^|[-_])area[-_:]?([a-z]{2})\b/i);
    if (areaMatch) {
      return String(areaMatch[1] || '').toLowerCase();
    }
    const countryMatch = text.match(/(?:^|[-_])country[-_:]?([a-z]{2})\b/i);
    return countryMatch ? String(countryMatch[1] || '').toLowerCase() : '';
  }

  function applyAreaToUsername(username = '', countryCode = '') {
    const text = String(username || '').trim();
    const normalizedCode = normalizeCountryCode(countryCode);
    if (!text || !normalizedCode) {
      return text;
    }
    if (/(?:^|[-_])area[-_:]?[a-z]{2}\b/i.test(text)) {
      return text.replace(/((?:^|[-_])area[-_:]?)([a-z]{2})\b/i, `$1${normalizedCode.toUpperCase()}`);
    }
    if (/(?:^|[-_])country[-_:]?[a-z]{2}\b/i.test(text)) {
      return text.replace(/((?:^|[-_])country[-_:]?)([a-z]{2})\b/i, `$1${normalizedCode.toUpperCase()}`);
    }
    return `${text}_area-${normalizedCode.toUpperCase()}`;
  }

  function transformLumiProxyAccountEntry(entry = {}, context = {}) {
    const state = context?.state || {};
    const index = Number.isInteger(context?.index) ? context.index : 0;
    const nextEntry = { ...entry };
    const configuredRegion = String(state?.ipProxyRegion || '').trim();
    const entryRegion = String(nextEntry.region || '').trim();
    const effectiveRegion = entryRegion || configuredRegion;
    const hostCountry = inferCountryFromHost(nextEntry.host);
    const regionCountry = normalizeCountryCode(effectiveRegion);
    const usernameCountry = inferAreaFromUsername(nextEntry.username);
    const countryCode = hostCountry || regionCountry || usernameCountry;

    if (nextEntry.username && countryCode) {
      nextEntry.username = applyAreaToUsername(nextEntry.username, countryCode);
      nextEntry.region = countryCode.toUpperCase();
    } else if (!entryRegion && configuredRegion) {
      nextEntry.region = configuredRegion;
    }

    const sessionPrefix = normalizeSessionPrefix(state?.ipProxyAccountSessionPrefix || '');
    const lifeMinutes = normalizeLifeMinutes(state?.ipProxyAccountLifeMinutes || '');
    if (nextEntry.username && sessionPrefix && !/session[-:]/i.test(nextEntry.username)) {
      const suffix = `${sessionPrefix}-${String(index + 1).padStart(2, '0')}`;
      nextEntry.username = `${nextEntry.username}-session-${suffix}${lifeMinutes ? `-life-${lifeMinutes}` : ''}`;
      if (!nextEntry.region && sessionPrefix) {
        nextEntry.region = `session:${suffix}`;
      }
    } else if (nextEntry.username && lifeMinutes && !/-life-\d+/i.test(nextEntry.username)) {
      nextEntry.username = `${nextEntry.username}-life-${lifeMinutes}`;
    }
    return nextEntry;
  }

  function apply711SessionToUsername(username = '', options = {}) {
    const text = String(username || '').trim();
    if (!text) {
      return text;
    }
    const sessionId = normalize711SessionId(options?.sessionId || '');
    const sessTime = normalize711SessionMinutes(options?.sessTime || '');
    let next = text;

    if (sessionId) {
      if (/(?:^|[-_])session[-_:][A-Za-z0-9_-]+?(?=(?:[-_](?:sessTime|sessAuto|region|life|zone|ptype|country|area)\b)|$)/i.test(next)) {
        next = next.replace(
          /((?:^|[-_])session[-_:])([A-Za-z0-9_-]+?)(?=(?:[-_](?:sessTime|sessAuto|region|life|zone|ptype|country|area)\b)|$)/i,
          `$1${sessionId}`
        );
      } else {
        next = `${next}-session-${sessionId}`;
      }
    }

    if (sessTime) {
      if (/(?:^|[-_])sessTime[-_:]?\d+\b/i.test(next)) {
        next = next.replace(/((?:^|[-_])sessTime[-_:]?)(\d+)\b/i, `$1${sessTime}`);
      } else {
        next = `${next}-sessTime-${sessTime}`;
      }
    }
    return next;
  }

  function apply711RegionToUsername(username = '', regionCode = '') {
    const text = String(username || '').trim();
    const normalizedRegion = normalize711RegionCode(regionCode);
    if (!text || !normalizedRegion) {
      return text;
    }
    if (/(?:^|[-_])region[-_:]?[A-Za-z]{2}\b/i.test(text)) {
      return text.replace(/((?:^|[-_])region[-_:]?)([A-Za-z]{2})\b/i, `$1${normalizedRegion.toUpperCase()}`);
    }
    return `${text}-region-${normalizedRegion.toUpperCase()}`;
  }

  function transform711ProxyAccountEntry(entry = {}, context = {}) {
    const state = context?.state || {};
    const hasAccountList = Boolean(context?.hasAccountList);
    const nextEntry = { ...entry };
    if (!String(nextEntry.username || '').trim()) {
      return nextEntry;
    }

    const configuredRegion = normalize711RegionCode(state?.ipProxyRegion || '');
    if (!hasAccountList && configuredRegion) {
      nextEntry.username = apply711RegionToUsername(nextEntry.username, configuredRegion);
      if (!String(nextEntry.region || '').trim()) {
        nextEntry.region = configuredRegion.toUpperCase();
      }
    }

    // 账号列表模式下，按每行条目原样生效，不再叠加固定账号区的 session/sessTime。
    if (hasAccountList) {
      return nextEntry;
    }

    const sessionId = normalize711SessionId(state?.ipProxyAccountSessionPrefix || '');
    const sessTime = normalize711SessionMinutes(state?.ipProxyAccountLifeMinutes || '');
    if (!sessionId && !sessTime) {
      return nextEntry;
    }

    nextEntry.username = apply711SessionToUsername(nextEntry.username, {
      sessionId,
      sessTime,
    });
    return nextEntry;
  }

  root.transformIpProxyAccountEntryByProvider = function transformIpProxyAccountEntryByProvider(
    provider = '',
    entry = {},
    context = {}
  ) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === 'lumiproxy') {
      return transformLumiProxyAccountEntry(entry, context);
    }
    if (normalizedProvider === '711proxy') {
      return transform711ProxyAccountEntry(entry, context);
    }
    return entry;
  };
})(typeof self !== 'undefined' ? self : globalThis);
