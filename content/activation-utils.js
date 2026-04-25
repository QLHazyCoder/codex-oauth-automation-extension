(function activationUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MultiPageActivationUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createActivationUtils() {
  function normalizeTagName(tagName) {
    return String(tagName || '').trim().toLowerCase();
  }

  function normalizeType(type) {
    return String(type || '').trim().toLowerCase();
  }

  function normalizePathname(pathname) {
    return String(pathname || '').trim().toLowerCase();
  }

  function getActivationStrategy(target = {}) {
    const tagName = normalizeTagName(target.tagName);
    const type = normalizeType(target.type);
    const pathname = normalizePathname(target.pathname);
    const hasForm = Boolean(target.hasForm);
    const isEmailVerificationRoute = /\/email-verification(?:[/?#]|$)/i.test(pathname);
    const isSubmitButton = hasForm
      && (
        (tagName === 'button' && (!type || type === 'submit'))
        || (tagName === 'input' && type === 'submit')
      );

    if (isSubmitButton && isEmailVerificationRoute) {
      return { method: 'requestSubmit' };
    }

    return { method: 'click' };
  }

  function isRecoverableStep9AuthFailure(statusText) {
    const text = String(statusText || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return false;
    }

    if (/oauth flow is not pending/i.test(text)) {
      return true;
    }

    if (/请更新\s*cli\s*proxy\s*api\s*或检查连接/i.test(text)) {
      return true;
    }

    if (/bad request|state code error|failed to exchange authorization code for tokens|failed to save authentication tokens|unknown or expired state|invalid state|state is required|code or error is required|invalid redirect_url|provider does not match state|failed to persist oauth callback|timeout waiting for oauth callback|oauth flow timed out/i.test(text)) {
      return true;
    }

    return /(?:认证失败|回调\s*url\s*提交失败|回调url提交失败|提交回调失败)\s*[:：]?\s*/i.test(text);
  }

  return {
    getActivationStrategy,
    isRecoverableStep9AuthFailure,
  };
});
