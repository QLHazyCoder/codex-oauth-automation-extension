(function attachGoPayUtils(root, factory) {
  root.GoPayUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGoPayUtils() {
  const PLUS_PAYMENT_METHOD_PAYPAL = 'paypal';
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';
  const PLUS_PAYMENT_METHOD_GPC_HELPER = 'gpc-helper';
  const DEFAULT_GPC_HELPER_API_URL = 'https://gopay.hwork.pro';

  function normalizePlusPaymentMethod(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === PLUS_PAYMENT_METHOD_GPC_HELPER) {
      return PLUS_PAYMENT_METHOD_GPC_HELPER;
    }
    return normalized === PLUS_PAYMENT_METHOD_GOPAY ? PLUS_PAYMENT_METHOD_GOPAY : PLUS_PAYMENT_METHOD_PAYPAL;
  }

  const DEFAULT_GOPAY_COUNTRY_CODE = '+86';

  function normalizeGoPayCountryCode(value = '') {
    const normalized = String(value || '').trim().replace(/[^\d+]/g, '');
    const digits = normalized.replace(/\D/g, '');
    return digits ? `+${digits}` : DEFAULT_GOPAY_COUNTRY_CODE;
  }

  function normalizeGoPayPhone(value = '') {
    return String(value || '').trim().replace(/[^\d+]/g, '');
  }

  function normalizeGoPayPhoneForCountry(value = '', countryCode = DEFAULT_GOPAY_COUNTRY_CODE) {
    const normalizedPhone = normalizeGoPayPhone(value);
    const normalizedCountryCode = normalizeGoPayCountryCode(countryCode);
    const countryDigits = normalizedCountryCode.replace(/\D/g, '');
    let nationalNumber = normalizedPhone.replace(/\D/g, '');

    if (countryDigits && nationalNumber.startsWith(countryDigits)) {
      nationalNumber = nationalNumber.slice(countryDigits.length);
    }
    return nationalNumber;
  }

  function normalizeGoPayPin(value = '') {
    return String(value || '').trim().replace(/[^\d]/g, '');
  }

  function normalizeGoPayOtp(value = '') {
    return String(value || '').trim().replace(/[^\d]/g, '');
  }

  function normalizeGpcHelperBaseUrl(apiUrl = '') {
    let normalized = String(apiUrl || DEFAULT_GPC_HELPER_API_URL).trim();
    if (!normalized) {
      return DEFAULT_GPC_HELPER_API_URL;
    }
    normalized = normalized.replace(/\/+$/g, '');
    normalized = normalized.replace(/\/api\/checkout\/start$/i, '');
    normalized = normalized.replace(/\/api\/gopay\/(?:otp|pin)$/i, '');
    normalized = normalized.replace(/\/api\/card\/balance(?:\?.*)?$/i, '');
    return normalized || DEFAULT_GPC_HELPER_API_URL;
  }

  function buildGpcHelperApiUrl(apiUrl = '', path = '') {
    const baseUrl = normalizeGpcHelperBaseUrl(apiUrl);
    if (!baseUrl) {
      return '';
    }
    const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
    return `${baseUrl}${normalizedPath}`;
  }

  function buildGpcCardBalanceUrl(apiUrl = '', cardKey = '') {
    const endpoint = buildGpcHelperApiUrl(apiUrl, '/api/card/balance');
    if (!endpoint) {
      return '';
    }
    return `${endpoint}?card_key=${encodeURIComponent(String(cardKey || '').trim())}`;
  }

  function extractGpcResponseErrorDetail(payload = {}, status = 0) {
    if (!payload || typeof payload !== 'object') {
      return status ? `HTTP ${status}` : '未知错误';
    }

    const payloadText = JSON.stringify(payload).toLowerCase();
    if (/account\s+already\s+linked/i.test(payloadText)) {
      return 'GOPAY已经绑了订阅，需要手动解绑';
    }

    const direct = payload.detail
      ?? payload.message
      ?? payload.error
      ?? payload.error_description
      ?? payload.reason;
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      const directText = String(direct).trim();
      return /account\s+already\s+linked/i.test(directText)
        ? 'GOPAY已经绑了订阅，需要手动解绑'
        : directText;
    }

    const errorMessages = payload.error_messages ?? payload.errorMessages;
    if (Array.isArray(errorMessages) && errorMessages.length > 0) {
      const firstMessage = String(errorMessages[0] || '').trim();
      if (/account\s+already\s+linked/i.test(firstMessage)) {
        return 'GOPAY已经绑了订阅，需要手动解绑';
      }
      if (firstMessage) {
        return firstMessage;
      }
    }

    const errors = payload.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0];
      if (typeof first === 'string') {
        return first.trim() || (status ? `HTTP ${status}` : '未知错误');
      }
      if (first && typeof first === 'object') {
        const field = Array.isArray(first.loc) ? first.loc.join('.') : String(first.field || first.path || '').trim();
        const message = String(first.msg || first.message || first.error || '').trim();
        return [field, message].filter(Boolean).join(': ') || JSON.stringify(first);
      }
    }

    return status ? `HTTP ${status}` : '未知错误';
  }

  function buildGpcOtpPayload(input = {}) {
    const payload = {
      reference_id: String(input.reference_id ?? input.referenceId ?? '').trim(),
      otp: normalizeGoPayOtp(input.otp ?? input.code ?? ''),
      card_key: String(input.card_key ?? input.cardKey ?? '').trim(),
    };
    const flowId = String(input.flow_id ?? input.flowId ?? '').trim();
    const gopayGuid = String(input.gopay_guid ?? input.gopayGuid ?? '').trim();
    const redirectUrl = String(input.redirect_url ?? input.redirectUrl ?? '').trim();
    if (flowId) payload.flow_id = flowId;
    if (gopayGuid) payload.gopay_guid = gopayGuid;
    if (redirectUrl) payload.redirect_url = redirectUrl;
    return payload;
  }

  function buildGpcOtpRetryPayload(input = {}) {
    const payload = buildGpcOtpPayload(input);
    return { ...payload, code: payload.otp };
  }

  function buildGpcPinPayload(input = {}) {
    const payload = {
      reference_id: String(input.reference_id ?? input.referenceId ?? '').trim(),
      challenge_id: String(input.challenge_id ?? input.challengeId ?? '').trim(),
      gopay_guid: String(input.gopay_guid ?? input.gopayGuid ?? '').trim(),
      pin: normalizeGoPayPin(input.pin ?? ''),
      card_key: String(input.card_key ?? input.cardKey ?? '').trim(),
    };
    const flowId = String(input.flow_id ?? input.flowId ?? '').trim();
    const redirectUrl = String(input.redirect_url ?? input.redirectUrl ?? '').trim();
    if (flowId) payload.flow_id = flowId;
    if (redirectUrl) payload.redirect_url = redirectUrl;
    return payload;
  }

  function buildGpcPinRetryPayload(input = {}) {
    const payload = buildGpcPinPayload(input);
    return { ...payload, challengeId: payload.challenge_id };
  }

  function formatGpcBalancePayload(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    const candidates = [
      payload.remaining_uses,
      payload.remainingUses,
      payload.balance,
      payload.remaining,
      payload.uses,
      payload.available_uses,
      payload.availableUses,
    ];
    const firstValue = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const status = String(payload.card_status || payload.cardStatus || payload.status || '').trim();
    const flowId = String(payload.flow_id || payload.flowId || '').trim();
    const parts = [];
    if (firstValue !== undefined) {
      parts.push(`余额 ${firstValue}`);
    }
    if (status) {
      parts.push(`状态 ${status}`);
    }
    if (flowId) {
      parts.push(`flow_id ${flowId}`);
    }
    return parts.join('，');
  }

  return {
    DEFAULT_GOPAY_COUNTRY_CODE,
    DEFAULT_GPC_HELPER_API_URL,
    PLUS_PAYMENT_METHOD_GPC_HELPER,
    PLUS_PAYMENT_METHOD_GOPAY,
    PLUS_PAYMENT_METHOD_PAYPAL,
    buildGpcCardBalanceUrl,
    buildGpcHelperApiUrl,
    buildGpcOtpPayload,
    buildGpcOtpRetryPayload,
    buildGpcPinPayload,
    buildGpcPinRetryPayload,
    extractGpcResponseErrorDetail,
    formatGpcBalancePayload,
    normalizeGpcHelperBaseUrl,
    normalizeGoPayCountryCode,
    normalizeGoPayPhone,
    normalizeGoPayPhoneForCountry,
    normalizeGoPayOtp,
    normalizeGoPayPin,
    normalizePlusPaymentMethod,
  };
});
