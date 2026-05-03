(function attachGoPayUtils(root, factory) {
  root.GoPayUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGoPayUtils() {
  const PLUS_PAYMENT_METHOD_PAYPAL = 'paypal';
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';

  function normalizePlusPaymentMethod(value = '') {
    return String(value || '').trim().toLowerCase() === PLUS_PAYMENT_METHOD_GOPAY
      ? PLUS_PAYMENT_METHOD_GOPAY
      : PLUS_PAYMENT_METHOD_PAYPAL;
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

  return {
    DEFAULT_GOPAY_COUNTRY_CODE,
    PLUS_PAYMENT_METHOD_GOPAY,
    PLUS_PAYMENT_METHOD_PAYPAL,
    normalizeGoPayCountryCode,
    normalizeGoPayPhone,
    normalizeGoPayPhoneForCountry,
    normalizeGoPayOtp,
    normalizeGoPayPin,
    normalizePlusPaymentMethod,
  };
});
