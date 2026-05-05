(function attachBackgroundPlusCheckoutBilling(root, factory) {
  root.MultiPageBackgroundPlusCheckoutBilling = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPlusCheckoutBillingModule() {
  const PLUS_CHECKOUT_SOURCE = 'plus-checkout';
  const PLUS_CHECKOUT_INJECT_FILES = ['content/utils.js', 'content/plus-checkout.js'];
  const PLUS_CHECKOUT_URL_PATTERN = /^https:\/\/chatgpt\.com\/checkout(?:\/|$)/i;
  const GOPAY_HELPER_CHECKOUT_SOURCE = 'gpc-helper';
  const PLUS_CHECKOUT_FRAME_READY_DELAY_MS = 500;
  const MEIGUODIZHI_ADDRESS_ENDPOINT = 'https://www.meiguodizhi.com/api/v1/dz';
  const MEIGUODIZHI_COUNTRY_CONFIG = {
    AR: { path: '/ar-address', city: 'Buenos Aires', aliases: ['ar', 'argentina', '阿根廷'] },
    AU: { path: '/au-address', city: 'Sydney', aliases: ['au', 'aus', 'australia', '澳大利亚'] },
    CA: { path: '/ca-address', city: 'Toronto', aliases: ['ca', 'canada', '加拿大'] },
    CN: { path: '/cn-address', city: 'Shanghai', aliases: ['cn', 'china', '中国'] },
    DE: { path: '/de-address', city: 'Berlin', aliases: ['de', 'deu', 'germany', 'deutschland', '德国'] },
    ES: { path: '/es-address', city: 'Madrid', aliases: ['es', 'esp', 'spain', '西班牙'] },
    FR: { path: '/fr-address', city: 'Paris', aliases: ['fr', 'fra', 'france', '法国'] },
    GB: { path: '/uk-address', city: 'London', aliases: ['gb', 'uk', 'united kingdom', 'britain', 'england', '英国'] },
    HK: { path: '/hk-address', city: 'Hong Kong', aliases: ['hk', 'hong kong', '香港'] },
    IT: { path: '/it-address', city: 'Rome', aliases: ['it', 'ita', 'italy', '意大利'] },
    JP: { path: '/jp-address', city: 'Tokyo', aliases: ['jp', 'jpn', 'japan', '日本', '日本国'] },
    KR: { path: '/kr-address', city: 'Seoul', aliases: ['kr', 'kor', 'korea', 'south korea', '韩国'] },
    MY: { path: '/my-address', city: 'Kuala Lumpur', aliases: ['my', 'malaysia', '马来西亚'] },
    NL: { path: '/nl-address', city: 'Amsterdam', aliases: ['nl', 'netherlands', 'holland', '荷兰'] },
    PH: { path: '/ph-address', city: 'Manila', aliases: ['ph', 'philippines', '菲律宾'] },
    RU: { path: '/ru-address', city: 'Moscow', aliases: ['ru', 'russia', '俄罗斯'] },
    SG: { path: '/sg-address', city: 'Singapore', aliases: ['sg', 'singapore', '新加坡'] },
    TH: { path: '/th-address', city: 'Bangkok', aliases: ['th', 'thailand', '泰国'] },
    TR: { path: '/tr-address', city: 'Istanbul', aliases: ['tr', 'turkey', 'turkiye', '土耳其'] },
    TW: { path: '/tw-address', city: 'Taipei', aliases: ['tw', 'taiwan', '台湾'] },
    US: { path: '/', city: 'New York', aliases: ['us', 'usa', 'united states', 'united states of america', 'america', '美国'] },
    VN: { path: '/vn-address', city: 'Ho Chi Minh City', aliases: ['vn', 'vietnam', '越南'] },
  };

  function createPlusCheckoutBillingExecutor(deps = {}) {
    const {
      addLog,
      broadcastDataUpdate,
      chrome,
      completeStepFromBackground,
      ensureContentScriptReadyOnTabUntilStopped,
      fetch: fetchImpl = null,
      generateRandomName,
      getAddressSeedForCountry,
      getState,
      getTabId,
      isTabAlive,
      markCurrentRegistrationAccountUsed,
      setState,
      sleepWithStop,
      waitForTabCompleteUntilStopped,
      waitForTabUrlMatchUntilStopped,
      throwIfStopped = () => {},
    } = deps;

    function isPlusCheckoutUrl(url = '') {
      return PLUS_CHECKOUT_URL_PATTERN.test(String(url || ''));
    }


    function isGopayHelperCheckout(state = {}) {
      return normalizeText(state?.plusCheckoutSource) === GOPAY_HELPER_CHECKOUT_SOURCE
        && Boolean(state?.gopayHelperReferenceId);
    }

    async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 30000) {
      const fetcher = typeof fetchImpl === 'function'
        ? fetchImpl
        : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
      if (typeof fetcher !== 'function') {
        throw new Error('当前运行环境不支持 fetch，无法调用 GPC API。');
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000)) : null;
      try {
        const response = await fetcher(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    function normalizeText(value = '') {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }


    function normalizeGpcHelperBaseUrl(apiUrl = '') {
      const globalRoot = typeof self !== 'undefined' ? self : globalThis;
      if (globalRoot.GoPayUtils?.normalizeGpcHelperBaseUrl) {
        return globalRoot.GoPayUtils.normalizeGpcHelperBaseUrl(apiUrl);
      }
      let normalized = String(apiUrl || '').trim().replace(/\/+$/g, '');
      normalized = normalized.replace(/\/api\/checkout\/start$/i, '');
      normalized = normalized.replace(/\/api\/gopay\/(?:otp|pin)$/i, '');
      normalized = normalized.replace(/\/api\/card\/balance(?:\?.*)?$/i, '');
      return normalized;
    }

    function buildGpcOtpPayload(input = {}) {
      if (typeof self !== 'undefined' && self.GoPayUtils?.buildGpcOtpPayload) {
        return self.GoPayUtils.buildGpcOtpPayload(input);
      }
      const payload = {
        reference_id: String(input.reference_id ?? input.referenceId ?? '').trim(),
        otp: String(input.otp ?? input.code ?? '').trim().replace(/[^\d]/g, ''),
        card_key: String(input.card_key ?? input.cardKey ?? '').trim(),
      };
      const gopayGuid = String(input.gopay_guid ?? input.gopayGuid ?? '').trim();
      const redirectUrl = String(input.redirect_url ?? input.redirectUrl ?? '').trim();
      const flowId = String(input.flow_id ?? input.flowId ?? '').trim();
      if (flowId) payload.flow_id = flowId;
      if (gopayGuid) payload.gopay_guid = gopayGuid;
      if (redirectUrl) payload.redirect_url = redirectUrl;
      return payload;
    }

    function buildGpcOtpRetryPayload(input = {}) {
      if (typeof self !== 'undefined' && self.GoPayUtils?.buildGpcOtpRetryPayload) {
        return self.GoPayUtils.buildGpcOtpRetryPayload(input);
      }
      const basePayload = buildGpcOtpPayload(input);
      return { ...basePayload, code: basePayload.otp };
    }

    function buildGpcPinPayload(input = {}) {
      if (typeof self !== 'undefined' && self.GoPayUtils?.buildGpcPinPayload) {
        return self.GoPayUtils.buildGpcPinPayload(input);
      }
      const payload = {
        reference_id: String(input.reference_id ?? input.referenceId ?? '').trim(),
        challenge_id: String(input.challenge_id ?? input.challengeId ?? '').trim(),
        gopay_guid: String(input.gopay_guid ?? input.gopayGuid ?? '').trim(),
        pin: String(input.pin ?? '').trim().replace(/[^\d]/g, ''),
        card_key: String(input.card_key ?? input.cardKey ?? '').trim(),
      };
      const redirectUrl = String(input.redirect_url ?? input.redirectUrl ?? '').trim();
      const flowId = String(input.flow_id ?? input.flowId ?? '').trim();
      if (flowId) payload.flow_id = flowId;
      if (redirectUrl) payload.redirect_url = redirectUrl;
      return payload;
    }

    function buildGpcPinRetryPayload(input = {}) {
      if (typeof self !== 'undefined' && self.GoPayUtils?.buildGpcPinRetryPayload) {
        return self.GoPayUtils.buildGpcPinRetryPayload(input);
      }
      const basePayload = buildGpcPinPayload(input);
      return { ...basePayload, challengeId: basePayload.challenge_id };
    }

    function getGpcResponseErrorDetail(payload = {}, status = 0) {
      if (typeof self !== 'undefined' && self.GoPayUtils?.extractGpcResponseErrorDetail) {
        return self.GoPayUtils.extractGpcResponseErrorDetail(payload, status);
      }
      if (payload && typeof payload === 'object') {
        return payload.detail || payload.message || payload.error || payload.error_description || payload.reason || `HTTP ${status || 0}`;
      }
      return `HTTP ${status || 0}`;
    }

    async function postGpcJsonWithFallback(apiUrl, endpointPath, primaryPayload, fallbackPayload, timeoutMs = 30000) {
      const requestUrl = `${apiUrl}${endpointPath}`;
      const send = (payload) => fetchJsonWithTimeout(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, timeoutMs);
      const firstResponse = await send(primaryPayload);
      if (firstResponse?.response?.ok || !fallbackPayload) {
        return { ...firstResponse, retried: false, payload: primaryPayload };
      }
      const status = Number(firstResponse?.response?.status || 0);
      if (status !== 400 && status !== 422) {
        return { ...firstResponse, retried: false, payload: primaryPayload };
      }
      const firstDetail = getGpcResponseErrorDetail(firstResponse?.data, status);
      await addLog(`步骤 7：GPC 接口返回 ${status}（${firstDetail}），使用兼容字段重试。`, 'warn');
      const secondResponse = await send(fallbackPayload);
      return {
        ...secondResponse,
        retried: true,
        payload: fallbackPayload,
        firstError: firstDetail,
        firstStatus: status,
      };
    }

    function getStateInternal() {
      if (typeof getState === 'function') {
        return getState();
      }
      return Promise.resolve({});
    }

    function normalizeGpcOtpChannel(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'sms') {
        return 'sms';
      }
      if (normalized === 'wa' || normalized === 'ws' || normalized === 'whatsapp' || !normalized) {
        return 'whatsapp';
      }
      return 'whatsapp';
    }

    function normalizeGpcLocalSmsHelperBaseUrl(value = '') {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return '';
      }
      try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return '';
        }
        const endpointPaths = new Set(['/otp', '/latest-otp', '/health']);
        if (endpointPaths.has(parsed.pathname.replace(/\/+$/g, '') || '/')) {
          parsed.pathname = '';
          parsed.search = '';
          parsed.hash = '';
        }
        return parsed.toString().replace(/\/$/, '');
      } catch {
        return '';
      }
    }

    function buildGpcLocalSmsHelperUrl(baseUrl = '', path = '/otp') {
      const base = normalizeGpcLocalSmsHelperBaseUrl(baseUrl);
      if (!base) {
        return '';
      }
      const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
      return `${base}${normalizedPath}`;
    }

    function extractGpcOtpFromPayload(payload = {}) {
      if (!payload || typeof payload !== 'object') {
        return '';
      }
      const directCandidates = [
        payload.otp,
        payload.code,
        payload.sms_code,
        payload.smsCode,
        payload.verification_code,
        payload.verificationCode,
        payload?.data?.otp,
        payload?.data?.code,
        payload?.data?.sms_code,
        payload?.data?.smsCode,
        payload?.result?.otp,
        payload?.result?.code,
      ];
      for (const candidate of directCandidates) {
        const normalized = String(candidate || '').trim().replace(/[^\d]/g, '');
        if (/^\d{4,8}$/.test(normalized)) {
          return normalized;
        }
      }
      const messageCandidates = [
        payload.message_text,
        payload.messageText,
        payload.text,
        payload.body,
        payload?.data?.message_text,
        payload?.data?.messageText,
        payload?.data?.text,
      ];
      for (const messageText of messageCandidates) {
        const match = String(messageText || '').match(/(?:OTP\s*[:：]?\s*|#)(\d{4,8})\b|\b(\d{6})\b/i);
        if (match) {
          return String(match[1] || match[2] || '').trim();
        }
      }
      return '';
    }

    async function fetchGpcOtpFromLocalSmsHelper({ baseUrl = '', referenceId = '', phoneNumber = '', timeoutMs = 15000 }) {
      const requestUrl = buildGpcLocalSmsHelperUrl(baseUrl, '/otp');
      if (!requestUrl) {
        throw new Error('本地 SMS Helper 地址无效。');
      }
      const queryUrl = new URL(requestUrl);
      if (referenceId) queryUrl.searchParams.set('reference_id', referenceId);
      if (phoneNumber) queryUrl.searchParams.set('phone_number', phoneNumber);
      const result = await fetchJsonWithTimeout(queryUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, timeoutMs);
      if (!result?.response?.ok || result?.data?.ok === false) {
        const detail = getGpcResponseErrorDetail(result?.data, result?.response?.status || 0);
        throw new Error(detail || '本地 SMS Helper 查询失败');
      }
      return extractGpcOtpFromPayload(result?.data);
    }

    async function waitForGpcOtpFromLocalSmsHelper(state = {}, options = {}) {
      const baseUrl = normalizeGpcLocalSmsHelperBaseUrl(state?.gopayHelperLocalSmsHelperUrl || '');
      if (!baseUrl) {
        throw new Error('步骤 7：已开启本地 SMS Helper，但未填写有效地址。');
      }
      const timeoutSeconds = Math.max(10, Math.min(300, Number(state?.gopayHelperLocalSmsTimeoutSeconds) || 90));
      const pollIntervalSeconds = Math.max(1, Math.min(30, Number(state?.gopayHelperLocalSmsPollIntervalSeconds) || 2));
      const deadline = Date.now() + timeoutSeconds * 1000;
      let lastError = '';
      while (Date.now() <= deadline) {
        throwIfStopped();
        try {
          const otp = await fetchGpcOtpFromLocalSmsHelper({
            baseUrl,
            referenceId: options.referenceId || '',
            phoneNumber: options.phoneNumber || '',
            timeoutMs: Math.min(15000, Math.max(3000, pollIntervalSeconds * 1000)),
          });
          if (otp) {
            await setState({
              gopayHelperResolvedOtp: otp,
              gopayHelperSmsOtpPayload: {
                source: 'local-sms-helper',
                reference_id: options.referenceId || '',
              },
            });
            if (typeof broadcastDataUpdate === 'function') {
              broadcastDataUpdate({ gopayHelperResolvedOtp: otp });
            }
            return otp;
          }
          lastError = '未查询到验证码';
        } catch (error) {
          lastError = error?.message || String(error || '查询失败');
        }
        await sleepWithStop(Math.max(500, pollIntervalSeconds * 1000));
      }
      throw new Error(`步骤 7：本地 SMS Helper 查询 OTP 超时${lastError ? `：${lastError}` : ''}`);
    }

    async function requestGpcOtpInput({ title = '', message = '', referenceId = '' }) {
      const requestId = `otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        plusManualConfirmationPending: true,
        plusManualConfirmationRequestId: requestId,
        plusManualConfirmationStep: 7,
        plusManualConfirmationMethod: 'gopay-otp',
        plusManualConfirmationTitle: title || 'GPC OTP 验证',
        plusManualConfirmationMessage: message || '请输入 OTP 验证码',
        gopayHelperOtpRequestId: requestId,
        gopayHelperOtpReferenceId: referenceId,
        gopayHelperResolvedOtp: '',
      };
      await setState(payload);
      if (typeof broadcastDataUpdate === 'function') {
        broadcastDataUpdate(payload);
      }
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
          const currentState = await getStateInternal();
          if (!currentState?.plusManualConfirmationPending || currentState?.plusManualConfirmationRequestId !== requestId) {
            clearInterval(checkInterval);
            const resolvedOtp = String(currentState?.gopayHelperResolvedOtp || '').trim().replace(/[^\d]/g, '');
            if (resolvedOtp) {
              resolve(resolvedOtp);
            } else {
              reject(new Error('OTP 输入已取消'));
            }
          }
        }, 500);
      });
    }

    async function executeGpcHelperBilling(state = {}) {
      const referenceId = String(state?.gopayHelperReferenceId || '').trim();
      const apiUrl = normalizeGpcHelperBaseUrl(state?.gopayHelperApiUrl || '');
      const cardKey = String(state?.gopayHelperCardKey || state?.gpcCardKey || state?.cardKey || '').trim();
      if (!referenceId) {
        throw new Error('步骤 7：GPC 模式缺少 reference_id，请先执行步骤 6。');
      }
      if (!apiUrl) {
        throw new Error('步骤 7：GPC 模式缺少 API 地址。');
      }
      if (!cardKey) {
        throw new Error('步骤 7：GPC 模式缺少卡密。');
      }
      const otpChannel = normalizeGpcOtpChannel(state?.gopayHelperOtpChannel);
      const localSmsHelperEnabled = Boolean(state?.gopayHelperLocalSmsHelperEnabled) && otpChannel === 'sms';
      await addLog(`步骤 7：GPC 模式开始 OTP 验证（reference_id: ${referenceId}，通道：${otpChannel}）...`, 'info');
      let otp = '';
      if (localSmsHelperEnabled) {
        await addLog('步骤 7：已开启本地 SMS Helper，正在查询短信 OTP...', 'info');
        otp = await waitForGpcOtpFromLocalSmsHelper(state, {
          referenceId,
          phoneNumber: state?.gopayHelperPhoneNumber || '',
        });
        await addLog('步骤 7：本地 SMS Helper 已获取 OTP，准备自动提交。', 'ok');
      } else {
        await addLog('步骤 7：等待用户输入 OTP...', 'info');
        otp = await requestGpcOtpInput({
          title: 'GPC OTP 验证',
          message: `请输入收到的 OTP 验证码（reference_id: ${referenceId}）`,
          referenceId,
        });
      }

      const baseInput = {
        reference_id: referenceId,
        otp,
        card_key: cardKey,
        gopay_guid: state?.gopayHelperGoPayGuid || '',
        redirect_url: state?.gopayHelperRedirectUrl || '',
        flow_id: state?.gopayHelperFlowId
          || state?.gopayHelperStartPayload?.flow_id
          || state?.gopayHelperStartPayload?.flowId
          || state?.gopayHelperBalancePayload?.flow_id
          || state?.gopayHelperBalancePayload?.flowId
          || '',
      };
      await addLog('步骤 7：正在提交 OTP...', 'info');
      const otpResponse = await postGpcJsonWithFallback(
        apiUrl,
        '/api/gopay/otp',
        buildGpcOtpPayload(baseInput),
        buildGpcOtpRetryPayload(baseInput),
        30000
      );
      if (!otpResponse?.response?.ok) {
        throw new Error(`步骤 7：OTP 验证失败：${getGpcResponseErrorDetail(otpResponse?.data, otpResponse?.response?.status || 0)}`);
      }

      const otpData = otpResponse?.data || {};
      const challengeId = String(
        otpData?.challenge_id
        || otpData?.challengeId
        || state?.gopayHelperChallengeId
        || state?.gopayHelperStartPayload?.challenge_id
        || state?.gopayHelperStartPayload?.challengeId
        || ''
      ).trim();
      const flowId = String(otpData?.flow_id || otpData?.flowId || baseInput.flow_id || '').trim();
      const gopayGuid = String(otpData?.gopay_guid || otpData?.gopayGuid || state?.gopayHelperGoPayGuid || '').trim();
      const redirectUrl = String(otpData?.redirect_url || otpData?.redirectUrl || state?.gopayHelperRedirectUrl || '').trim();
      if (!challengeId) {
        throw new Error('步骤 7：GPC OTP 验证后未返回 challenge_id。');
      }
      const pin = String(state?.gopayHelperPin || '').trim().replace(/[^\d]/g, '');
      if (!pin) {
        throw new Error('步骤 7：GPC 模式缺少 PIN 配置。');
      }

      await setState({
        gopayHelperChallengeId: challengeId,
        gopayHelperFlowId: flowId,
        gopayHelperGoPayGuid: gopayGuid,
        gopayHelperRedirectUrl: redirectUrl,
      });

      await addLog('步骤 7：正在提交 PIN...', 'info');
      const pinInput = {
        reference_id: referenceId,
        challenge_id: challengeId,
        gopay_guid: gopayGuid,
        redirect_url: redirectUrl,
        flow_id: flowId,
        pin,
        card_key: cardKey,
      };
      const pinResponse = await postGpcJsonWithFallback(
        apiUrl,
        '/api/gopay/pin',
        buildGpcPinPayload(pinInput),
        buildGpcPinRetryPayload(pinInput),
        30000
      );
      if (!pinResponse?.response?.ok) {
        throw new Error(`步骤 7：PIN 验证失败：${getGpcResponseErrorDetail(pinResponse?.data, pinResponse?.response?.status || 0)}`);
      }

      await setState({
        plusCheckoutSource: GOPAY_HELPER_CHECKOUT_SOURCE,
        gopayHelperPinPayload: pinResponse?.data || null,
      });
      await addLog('步骤 7：GPC 支付完成，准备继续下一步。', 'ok');
      await completeStepFromBackground(7, {
        plusCheckoutSource: GOPAY_HELPER_CHECKOUT_SOURCE,
      });
    }

    function compactCountryText(value = '') {
      return normalizeText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    }

    function resolveMeiguodizhiCountryCode(value = '') {
      const normalized = normalizeText(value);
      const upper = normalized.toUpperCase();
      if (MEIGUODIZHI_COUNTRY_CONFIG[upper]) {
        return upper;
      }
      const compact = compactCountryText(normalized);
      const match = Object.entries(MEIGUODIZHI_COUNTRY_CONFIG).find(([code, config]) => (
        compact === code.toLowerCase()
        || (config.aliases || []).some((alias) => {
          const compactAlias = compactCountryText(alias);
          return compact === compactAlias || compact.includes(compactAlias);
        })
      ));
      return match?.[0] || '';
    }

    function hasCompleteAddressFallback(seed) {
      const fallback = seed?.fallback || {};
      return Boolean(
        normalizeText(fallback.address1)
        && normalizeText(fallback.city)
        && normalizeText(fallback.postalCode)
      );
    }

    function buildDirectAddressSeed(countryCode, apiAddress, fallbackSeed) {
      const address1 = normalizeText(apiAddress?.Trans_Address || apiAddress?.Address);
      const city = normalizeText(apiAddress?.City);
      const region = normalizeText(apiAddress?.State_Full || apiAddress?.State);
      const postalCode = normalizeText(apiAddress?.Zip_Code);
      if (!address1 || !city || !postalCode) {
        return null;
      }
      return {
        ...(fallbackSeed || {}),
        countryCode,
        query: [address1, city].filter(Boolean).join(', '),
        source: 'meiguodizhi',
        skipAutocomplete: true,
        fallback: {
          ...(fallbackSeed?.fallback || {}),
          address1,
          city,
          region,
          postalCode,
        },
      };
    }

    async function fetchMeiguodizhiAddressSeed(countryCode, fallbackSeed) {
      if (typeof fetchImpl !== 'function') {
        return null;
      }
      const countryConfig = MEIGUODIZHI_COUNTRY_CONFIG[countryCode];
      if (!countryConfig?.path) {
        return null;
      }
      const path = countryConfig.path;
      const city = normalizeText(fallbackSeed?.fallback?.city || fallbackSeed?.query || countryConfig.city);
      const response = await fetchImpl(MEIGUODIZHI_ADDRESS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          city,
          path,
          method: 'refresh',
        }),
      });
      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status || 0}`);
      }
      const data = await response.json();
      if (data?.status !== 'ok') {
        throw new Error(data?.message || data?.status || 'unknown response');
      }
      return buildDirectAddressSeed(countryCode, data.address || {}, fallbackSeed);
    }

    function getLocalAddressSeed(countryCode) {
      if (typeof getAddressSeedForCountry !== 'function') {
        return null;
      }
      const seed = getAddressSeedForCountry(countryCode, {
        fallbackCountry: 'DE',
      });
      return seed?.countryCode === countryCode ? seed : null;
    }

    function buildMeiguodizhiLookupSeed(countryCode) {
      const config = MEIGUODIZHI_COUNTRY_CONFIG[countryCode];
      if (!config) {
        return null;
      }
      return {
        countryCode,
        query: config.city,
        fallback: {
          address1: '',
          city: config.city,
          region: '',
          postalCode: '',
        },
      };
    }

    async function resolveBillingAddressSeed(state = {}, countryOverride = '') {
      const requestedCountry = normalizeText(countryOverride || state.plusCheckoutCountry || 'DE');
      const countryCode = resolveMeiguodizhiCountryCode(requestedCountry) || 'DE';
      const localSeed = getLocalAddressSeed(countryCode);
      const lookupSeed = localSeed || buildMeiguodizhiLookupSeed(countryCode);
      if (!lookupSeed) {
        throw new Error(`步骤 7：无法识别账单国家或地区：${requestedCountry || '空'}`);
      }
      try {
        const remoteSeed = await fetchMeiguodizhiAddressSeed(countryCode, lookupSeed);
        if (hasCompleteAddressFallback(remoteSeed)) {
          await addLog(
            `步骤 7：已从 meiguodizhi 接口获取账单地址（${remoteSeed.fallback.city} / ${remoteSeed.fallback.postalCode}），将跳过 Google 地址推荐。`,
            'info'
          );
          return remoteSeed;
        }
        await addLog('步骤 7：meiguodizhi 接口返回的地址字段不完整，回退到本地地址种子。', 'warn');
      } catch (error) {
        await addLog(`步骤 7：meiguodizhi 地址接口不可用，回退到本地地址种子：${error?.message || String(error || '')}`, 'warn');
      }

      if (hasCompleteAddressFallback(localSeed)) {
        return localSeed;
      }
      throw new Error(`步骤 7：${requestedCountry} 的 meiguodizhi 地址不可用，且没有本地兜底地址。`);
    }

    async function getAlivePlusCheckoutTabId(tabId) {
      if (!Number.isInteger(tabId) || tabId <= 0) {
        return null;
      }
      if (!chrome?.tabs?.get) {
        return tabId;
      }
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      return tab && isPlusCheckoutUrl(tab.url) ? tabId : null;
    }

    async function getCurrentPlusCheckoutTabId() {
      if (!chrome?.tabs?.query) {
        return null;
      }

      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      const activeCheckoutTab = activeTabs.find((tab) => Number.isInteger(tab?.id) && isPlusCheckoutUrl(tab.url));
      if (activeCheckoutTab) {
        return activeCheckoutTab.id;
      }

      const checkoutTabs = await chrome.tabs.query({ url: 'https://chatgpt.com/checkout/*' }).catch(() => []);
      const checkoutTab = checkoutTabs.find((tab) => Number.isInteger(tab?.id) && isPlusCheckoutUrl(tab.url));
      return checkoutTab?.id || null;
    }

    async function getCheckoutFrames(tabId) {
      if (!chrome?.webNavigation?.getAllFrames) {
        return [{ frameId: 0, url: '' }];
      }
      const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null);
      if (!Array.isArray(frames) || !frames.length) {
        return [{ frameId: 0, url: '' }];
      }
      return frames
        .filter((frame) => Number.isInteger(frame?.frameId))
        .sort((left, right) => Number(left.frameId) - Number(right.frameId));
    }

    async function pingCheckoutFrame(tabId, frameId) {
      try {
        const pong = await chrome.tabs.sendMessage(tabId, {
          type: 'PING',
          source: 'background',
          payload: {},
        }, {
          frameId: Number.isInteger(frameId) ? frameId : 0,
        });
        return Boolean(pong?.ok && (!pong.source || pong.source === PLUS_CHECKOUT_SOURCE));
      } catch {
        return false;
      }
    }

    async function ensurePlusCheckoutFrameReady(tabId, frameId) {
      if (await pingCheckoutFrame(tabId, frameId)) {
        return true;
      }
      if (!chrome?.scripting?.executeScript) {
        return false;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          func: (injectedSource) => {
            window.__MULTIPAGE_SOURCE = injectedSource;
          },
          args: [PLUS_CHECKOUT_SOURCE],
        });
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: PLUS_CHECKOUT_INJECT_FILES,
        });
      } catch {
        // If the frame was already injected or navigated mid-injection, ping once more below.
      }

      await sleepWithStop(PLUS_CHECKOUT_FRAME_READY_DELAY_MS);
      return await pingCheckoutFrame(tabId, frameId);
    }

    async function ensurePlusCheckoutFramesReady(tabId, frames) {
      const checkedFrames = [];
      for (const frame of frames) {
        const ready = await ensurePlusCheckoutFrameReady(tabId, frame.frameId);
        checkedFrames.push({ ...frame, ready });
      }
      return checkedFrames;
    }

    async function sendFrameMessage(tabId, frameId, message) {
      return chrome.tabs.sendMessage(tabId, message, {
        frameId: Number.isInteger(frameId) ? frameId : 0,
      });
    }

    async function inspectCheckoutFrame(tabId, frame) {
      try {
        const result = await sendFrameMessage(tabId, frame.frameId, {
          type: 'PLUS_CHECKOUT_GET_STATE',
          source: 'background',
          payload: {},
        });
        if (result?.error) {
          return { frame, error: result.error };
        }
        return { frame: { ...frame, ready: true }, result: result || {} };
      } catch (error) {
        const readyError = frame.ready === false ? 'content-script-not-ready' : '';
        const message = error?.message || String(error || '');
        return { frame, error: readyError ? `${readyError}: ${message}` : message };
      }
    }

    function isPaymentFrameUrl(url = '') {
      return /elements-inner-payment|componentName=payment/i.test(String(url || ''));
    }

    function isAddressFrameUrl(url = '') {
      return /elements-inner-address|componentName=address/i.test(String(url || ''));
    }

    function isAutocompleteFrameUrl(url = '') {
      return /elements-inner-autocompl/i.test(String(url || ''));
    }

    function buildFrameSummary(inspections) {
      return inspections
        .map((item) => {
          const flags = [];
          if (item.result?.hasPayPal) flags.push('paypal');
          if (item.result?.billingFieldsVisible) flags.push('billing');
          if (item.result?.hasSubscribeButton) flags.push('subscribe');
          if (!flags.length && item.error) flags.push(item.error);
          if (!flags.length) flags.push('no-match');
          return `${item.frame.frameId}:${item.frame.url || 'about:blank'}:${flags.join(',')}`;
        })
        .slice(0, 8)
        .join(' | ');
    }

    async function inspectCheckoutFrames(tabId, frames) {
      const inspections = [];
      for (const frame of frames) {
        const inspection = await inspectCheckoutFrame(tabId, frame);
        inspections.push(inspection);
      }
      return inspections;
    }

    function pickPaymentFrame(inspections) {
      return inspections.find((item) => item.result?.hasPayPal || item.result?.paypalCandidates?.length)
        || inspections.find((item) => isPaymentFrameUrl(item.frame.url))
        || null;
    }

    function pickBillingFrame(inspections) {
      return inspections.find((item) => item.result?.billingFieldsVisible)
        || inspections.find((item) => isAddressFrameUrl(item.frame.url))
        || null;
    }

    function pickSubscribeFrame(inspections) {
      return inspections.find((item) => item.result?.hasSubscribeButton)
        || inspections.find((item) => item.frame.frameId === 0)
        || null;
    }

    async function getReadyCheckoutFrames(tabId) {
      return ensurePlusCheckoutFramesReady(tabId, await getCheckoutFrames(tabId));
    }

    async function resolveOptionalFrameByUrl(tabId, predicate) {
      const frames = await getCheckoutFrames(tabId);
      const frame = frames.find((item) => predicate(item.url));
      if (!frame) {
        return null;
      }
      const ready = await ensurePlusCheckoutFrameReady(tabId, frame.frameId);
      return {
        frame,
        ready,
      };
    }

    async function resolvePaymentFrame(tabId, frames) {
      const inspections = await inspectCheckoutFrames(tabId, frames);
      const picked = pickPaymentFrame(inspections);
      if (picked) {
        return {
          frameId: picked.frame.frameId,
          frameUrl: picked.frame.url || '',
          ready: picked.frame.ready !== false,
          inspections,
        };
      }

      return {
        frameId: null,
        frameUrl: '',
        inspections,
      };
    }

    async function waitForBillingFrame(tabId) {
      while (true) {
        const frames = await getReadyCheckoutFrames(tabId);
        const inspections = await inspectCheckoutFrames(tabId, frames);
        const picked = pickBillingFrame(inspections);
        if (picked) {
          return {
            frameId: picked.frame.frameId,
            frameUrl: picked.frame.url || '',
            countryText: picked.result?.countryText || '',
            ready: picked.frame.ready !== false,
            inspections,
          };
        }
        await sleepWithStop(250);
      }
    }

    async function waitForSubscribeFrame(tabId, candidateFrames) {
      const frames = candidateFrames.length ? candidateFrames : [{ frameId: 0, url: '' }];
      while (true) {
        const readyFrames = await ensurePlusCheckoutFramesReady(tabId, frames);
        const inspections = await inspectCheckoutFrames(tabId, readyFrames);
        const picked = pickSubscribeFrame(inspections);
        if (picked) {
          return picked.frame;
        }
        await sleepWithStop(250);
      }
    }

    async function getCheckoutTabId(state = {}) {
      const registeredTabId = await getTabId(PLUS_CHECKOUT_SOURCE);
      if (registeredTabId && await isTabAlive(PLUS_CHECKOUT_SOURCE)) {
        const aliveRegisteredTabId = await getAlivePlusCheckoutTabId(registeredTabId);
        if (aliveRegisteredTabId) {
          return aliveRegisteredTabId;
        }
      }
      const storedTabId = Number(state.plusCheckoutTabId) || 0;
      if (storedTabId) {
        const aliveStoredTabId = await getAlivePlusCheckoutTabId(storedTabId);
        if (aliveStoredTabId) {
          return aliveStoredTabId;
        }
      }
      const currentCheckoutTabId = await getCurrentPlusCheckoutTabId();
      if (currentCheckoutTabId) {
        await addLog('步骤 7：检测到当前已在 Plus Checkout 页面，直接接管当前标签页。', 'info');
        return currentCheckoutTabId;
      }
      throw new Error('步骤 7：未找到 Plus Checkout 标签页。请先打开 Plus Checkout 页面，或完成步骤 6。');
    }

    async function executePlusCheckoutBilling(state = {}) {
      if (isGopayHelperCheckout(state)) {
        await executeGpcHelperBilling(state);
        return;
      }
      const tabId = await getCheckoutTabId(state);
      await addLog('步骤 7：正在等待 Plus Checkout 页面加载完成...', 'info');
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);

      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 7：Checkout 页面仍在加载，等待账单填写脚本就绪...',
      });
      const readyFrames = await getReadyCheckoutFrames(tabId);
      const paymentFrame = await resolvePaymentFrame(tabId, readyFrames);
      if (paymentFrame.frameId === null) {
        const frameSummary = buildFrameSummary(paymentFrame.inspections);
        throw new Error(`步骤 7：未在主页面或 iframe 中发现 PayPal DOM，无法自动切换付款方式。frame 摘要：${frameSummary}`);
      }
      if (!paymentFrame.ready) {
        throw new Error(`步骤 7：已定位到 PayPal 所在 iframe（frameId=${paymentFrame.frameId}），但账单脚本无法注入该 iframe。请提供该 iframe 的控制台结构或截图。`);
      }

      if (paymentFrame.frameId !== 0) {
        await addLog(`步骤 7：PayPal 位于 checkout iframe（frameId=${paymentFrame.frameId}），将改为在该 frame 内操作。`, 'info');
      }

      const randomName = generateRandomName();
      const fullName = [randomName.firstName, randomName.lastName].filter(Boolean).join(' ');

      await addLog('步骤 7：正在切换 PayPal 付款方式...', 'info');
      const paymentResult = await sendFrameMessage(tabId, paymentFrame.frameId, {
        type: 'PLUS_CHECKOUT_SELECT_PAYPAL',
        source: 'background',
        payload: {},
      });
      if (paymentResult?.error) {
        throw new Error(paymentResult.error);
      }

      const billingFrame = await waitForBillingFrame(tabId);
      if (!billingFrame.ready) {
        throw new Error(`步骤 7：已定位到账单地址 iframe（frameId=${billingFrame.frameId}），但账单脚本无法注入该 iframe。请提供该 iframe 的控制台结构或截图。`);
      }
      if (billingFrame.frameId !== paymentFrame.frameId) {
        await addLog(`步骤 7：账单地址位于 checkout iframe（frameId=${billingFrame.frameId}），将改为在该 frame 内填写。`, 'info');
      }

      const addressSeed = await resolveBillingAddressSeed(state, billingFrame.countryText);
      if (!addressSeed) {
        throw new Error('步骤 7：未找到可用的本地账单地址种子。');
      }

      await addLog(`步骤 7：正在填写账单地址（${addressSeed.countryCode} / ${addressSeed.query}）...`, 'info');
      const autocompleteFrame = await resolveOptionalFrameByUrl(tabId, isAutocompleteFrameUrl);
      let result = null;
      if (!addressSeed.skipAutocomplete && autocompleteFrame?.frame && autocompleteFrame.frame.frameId !== billingFrame.frameId) {
        if (!autocompleteFrame.ready) {
          throw new Error('步骤 7：发现 Google 地址推荐 iframe，但无法注入账单脚本。请提供该 iframe 的控制台结构。');
        }
        await addLog(`步骤 7：Google 地址推荐位于独立 iframe（frameId=${autocompleteFrame.frame.frameId}），将拆分输入与选择动作。`, 'info');

        const queryResult = await sendFrameMessage(tabId, billingFrame.frameId, {
          type: 'PLUS_CHECKOUT_FILL_ADDRESS_QUERY',
          source: 'background',
          payload: {
            fullName,
            addressSeed,
          },
        });
        if (queryResult?.error) {
          throw new Error(queryResult.error);
        }

        const suggestionResult = await sendFrameMessage(tabId, autocompleteFrame.frame.frameId, {
          type: 'PLUS_CHECKOUT_SELECT_ADDRESS_SUGGESTION',
          source: 'background',
          payload: {
            addressSeed,
          },
        });
        if (suggestionResult?.error) {
          throw new Error(suggestionResult.error);
        }

        const structuredResult = await sendFrameMessage(tabId, billingFrame.frameId, {
          type: 'PLUS_CHECKOUT_ENSURE_BILLING_ADDRESS',
          source: 'background',
          payload: {
            addressSeed,
          },
        });
        if (structuredResult?.error) {
          throw new Error(structuredResult.error);
        }

        result = {
          ...structuredResult,
          selectedAddressText: suggestionResult?.selectedAddressText || '',
        };
      } else {
        result = await sendFrameMessage(tabId, billingFrame.frameId, {
          type: 'PLUS_CHECKOUT_FILL_BILLING_ADDRESS',
          source: 'background',
          payload: {
            fullName,
            addressSeed,
          },
        });

        if (result?.error) {
          throw new Error(result.error);
        }
      }

      await addLog('步骤 7：账单地址已填写完成，正在定位订阅按钮...', 'info');
      const subscribeFrame = await waitForSubscribeFrame(tabId, [
        { frameId: 0, url: '' },
        { frameId: paymentFrame.frameId, url: paymentFrame.frameUrl || '' },
        { frameId: billingFrame.frameId, url: billingFrame.frameUrl || '' },
      ]);
      const subscribeResult = await sendFrameMessage(tabId, subscribeFrame.frameId, {
        type: 'PLUS_CHECKOUT_CLICK_SUBSCRIBE',
        source: 'background',
        payload: {},
      });
      if (subscribeResult?.error) {
        throw new Error(subscribeResult.error);
      }

      await setState({
        plusCheckoutTabId: tabId,
        plusBillingCountryText: result?.countryText || '',
        plusBillingAddress: result?.structuredAddress || null,
      });

      await addLog('步骤 7：账单地址已提交，正在等待跳转到 PayPal...', 'info');
      await waitForTabUrlMatchUntilStopped(tabId, (url) => /paypal\./i.test(url));
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);

      await completeStepFromBackground(7, {
        plusBillingCountryText: result?.countryText || '',
      });
    }

    return {
      executePlusCheckoutBilling,
    };
  }

  return {
    createPlusCheckoutBillingExecutor,
  };
});
