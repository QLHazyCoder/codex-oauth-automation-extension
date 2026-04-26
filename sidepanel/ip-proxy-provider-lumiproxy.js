// sidepanel/ip-proxy-provider-lumiproxy.js — LumiProxy 面板专属逻辑
function normalizeIpProxyCountryCode(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const simple = raw.replace(/[^a-z]/g, '');
  return /^[a-z]{2}$/.test(simple) ? simple : '';
}

const LUMIPROXY_HOST_COUNTRY_HINTS = new Set([
  'us', 'de', 'uk', 'fr', 'nl', 'it', 'es', 'ca', 'au', 'sg', 'jp', 'kr', 'tw', 'hk', 'in', 'br', 'mx',
]);

function inferLumiProxyCountryFromHost(host = '') {
  const normalizedHost = String(host || '').trim().toLowerCase();
  if (!normalizedHost || !normalizedHost.endsWith('.lumiproxy.io')) {
    return '';
  }
  const prefix = normalizedHost.split('.')[0] || '';
  return LUMIPROXY_HOST_COUNTRY_HINTS.has(prefix) ? prefix : '';
}

function inferLumiAreaFromUsername(username = '') {
  const text = String(username || '').trim().toLowerCase();
  if (!text) return '';
  const areaMatch = text.match(/(?:^|[-_])area[-_:]?([a-z]{2})\b/i);
  if (areaMatch) {
    return String(areaMatch[1] || '').toLowerCase();
  }
  const countryMatch = text.match(/(?:^|[-_])country[-_:]?([a-z]{2})\b/i);
  return countryMatch ? String(countryMatch[1] || '').toLowerCase() : '';
}

function resolveLumiProxyCountryFromInputs({ host = '', username = '', region = '' } = {}) {
  const hostCode = inferLumiProxyCountryFromHost(host);
  const usernameCode = inferLumiAreaFromUsername(username);
  const regionCode = normalizeIpProxyCountryCode(region);
  return hostCode || usernameCode || regionCode;
}

function syncLumiProxyRegionInputFromCredentials(options = {}) {
  const { force = false } = options;
  const normalizeService = typeof normalizeIpProxyService === 'function'
    ? normalizeIpProxyService
    : ((value = '') => String(value || '').trim().toLowerCase() || 'lumiproxy');
  const normalizeMode = typeof normalizeIpProxyMode === 'function'
    ? normalizeIpProxyMode
    : ((value = '') => String(value || '').trim().toLowerCase() || 'api');
  const getMode = typeof getSelectedIpProxyMode === 'function'
    ? getSelectedIpProxyMode
    : (() => 'api');

  const service = normalizeService(
    (typeof selectIpProxyService !== 'undefined' ? selectIpProxyService?.value : '')
      || (typeof latestState !== 'undefined' ? latestState?.ipProxyService : '')
      || 'lumiproxy'
  );
  const mode = normalizeMode(getMode());
  if (service !== 'lumiproxy' || mode !== 'account' || typeof inputIpProxyRegion === 'undefined' || !inputIpProxyRegion) {
    return '';
  }

  const currentRegion = String(inputIpProxyRegion.value || '').trim();
  const resolvedCode = resolveLumiProxyCountryFromInputs({
    host: (typeof inputIpProxyHost !== 'undefined' && inputIpProxyHost) ? inputIpProxyHost.value : '',
    username: (typeof inputIpProxyUsername !== 'undefined' && inputIpProxyUsername) ? inputIpProxyUsername.value : '',
    region: currentRegion,
  });
  if (!resolvedCode) {
    return '';
  }

  const normalizedCurrent = normalizeIpProxyCountryCode(currentRegion);
  if (force || !normalizedCurrent) {
    inputIpProxyRegion.value = resolvedCode.toUpperCase();
  }
  return resolvedCode.toUpperCase();
}

