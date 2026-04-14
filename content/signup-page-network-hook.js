(() => {
  const HOOK_FLAG = '__MULTIPAGE_SIGNUP_API_HOOK_READY__';
  const STEP3_REGISTER_ERROR_EVENT = 'multipage:step3-register-error';
  const STEP5_CREATE_ACCOUNT_ERROR_EVENT = 'multipage:step5-create-account-error';
  const REGISTER_PATH_PATTERN = /\/api\/accounts\/user\/register(?:[/?#]|$)/i;
  const CREATE_ACCOUNT_PATH_PATTERN = /\/api\/accounts\/create_account(?:[/?#]|$)/i;

  if (window[HOOK_FLAG]) {
    return;
  }
  window[HOOK_FLAG] = true;

  function matchesRegisterUrl(url) {
    return REGISTER_PATH_PATTERN.test(String(url || ''));
  }

  function matchesCreateAccountUrl(url) {
    return CREATE_ACCOUNT_PATH_PATTERN.test(String(url || ''));
  }

  function emitApiError(eventName, detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: JSON.stringify({
          status: Number(detail.status) || 0,
          url: String(detail.url || ''),
          bodyText: typeof detail.bodyText === 'string' ? detail.bodyText : '',
          source: String(detail.source || ''),
          timestamp: Date.now(),
        }),
      }));
    } catch (err) {
      console.warn('[MultiPage:signup-page-network-hook] Failed to emit error event:', err);
    }
  }

  function maybeReportRegisterError({ status, url, bodyText = '', source = '' } = {}) {
    if (Number(status) < 400 || !matchesRegisterUrl(url)) {
      return;
    }

    emitApiError(STEP3_REGISTER_ERROR_EVENT, { status, url, bodyText, source });
  }

  function maybeReportCreateAccountError({ status, url, bodyText = '', source = '' } = {}) {
    if (Number(status) < 400 || !matchesCreateAccountUrl(url)) {
      return;
    }

    emitApiError(STEP5_CREATE_ACCOUNT_ERROR_EVENT, { status, url, bodyText, source });
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function multipageHookedFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);

      try {
        const requestUrl = response?.url || (typeof input === 'string' ? input : input?.url) || '';
        if ((matchesRegisterUrl(requestUrl) || matchesCreateAccountUrl(requestUrl)) && Number(response?.status) >= 400) {
          const bodyText = await response.clone().text().catch(() => '');
          maybeReportRegisterError({
            status: response.status,
            url: requestUrl,
            bodyText,
            source: 'fetch',
          });
          maybeReportCreateAccountError({
            status: response.status,
            url: requestUrl,
            bodyText,
            source: 'fetch',
          });
        }
      } catch (err) {
        console.warn('[MultiPage:signup-page-network-hook] Failed to inspect fetch response:', err);
      }

      return response;
    };
  }

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function multipageHookedOpen(method, url) {
    this.__MULTIPAGE_CREATE_ACCOUNT_URL__ = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function multipageHookedSend() {
    const requestUrl = this.__MULTIPAGE_CREATE_ACCOUNT_URL__;

    if (matchesRegisterUrl(requestUrl) || matchesCreateAccountUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        maybeReportRegisterError({
          status: this.status,
          url: this.responseURL || requestUrl,
          bodyText: typeof this.responseText === 'string' ? this.responseText : '',
          source: 'xhr',
        });
        maybeReportCreateAccountError({
          status: this.status,
          url: this.responseURL || requestUrl,
          bodyText: typeof this.responseText === 'string' ? this.responseText : '',
          source: 'xhr',
        });
      }, { once: true });
    }

    return originalXhrSend.apply(this, arguments);
  };
})();
