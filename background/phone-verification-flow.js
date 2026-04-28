(function attachBackgroundPhoneVerification(root, factory) {
  root.MultiPageBackgroundPhoneVerification = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPhoneVerificationModule() {
  function createPhoneVerificationHelpers(deps = {}) {
    const {
      addLog,
      ensureStep8SignupPageReady,
      fetchImpl = (...args) => fetch(...args),
      getOAuthFlowStepTimeoutMs,
      getState,
      sendToContentScriptResilient,
      setState,
      sleepWithStop,
      throwIfStopped,
      DEFAULT_HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php',
      HERO_SMS_COUNTRY_ID = 52,
      HERO_SMS_COUNTRY_LABEL = 'Thailand',
      HERO_SMS_SERVICE_CODE = 'dr',
      HERO_SMS_SERVICE_LABEL = 'OpenAI',
    } = deps;

    const PHONE_ACTIVATION_STATE_KEY = 'currentPhoneActivation';
    const REUSABLE_PHONE_ACTIVATION_STATE_KEY = 'reusablePhoneActivation';
    const DEFAULT_PHONE_POLL_INTERVAL_MS = 5000;
    const DEFAULT_PHONE_POLL_TIMEOUT_MS = 180000;
    const DEFAULT_PHONE_REQUEST_TIMEOUT_MS = 20000;
    const DEFAULT_PHONE_SUBMIT_ATTEMPTS = 3;
    const DEFAULT_PHONE_CODE_WAIT_WINDOW_MS = 60000;
    const DEFAULT_PHONE_NUMBER_MAX_USES = 3;
    const DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS = 3;
    const DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT = 5;
    const PHONE_CODE_TIMEOUT_ERROR_PREFIX = 'PHONE_CODE_TIMEOUT::';

    function normalizeUrl(value, fallback = DEFAULT_HERO_SMS_BASE_URL) {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return fallback;
      }
      try {
        return new URL(trimmed).toString();
      } catch {
        return fallback;
      }
    }

    function normalizeApiKey(value) {
      return String(value || '').trim();
    }

    function normalizeUseCount(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    }

    function resolveCountryConfig(state = {}) {
      return {
        id: Math.max(1, Math.floor(Number(state.heroSmsCountryId) || HERO_SMS_COUNTRY_ID)),
        label: String(state.heroSmsCountryLabel || HERO_SMS_COUNTRY_LABEL).trim() || HERO_SMS_COUNTRY_LABEL,
      };
    }

    function normalizeActivation(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }
      const activationId = String(
        record.activationId ?? record.id ?? record.activation ?? ''
      ).trim();
      const phoneNumber = String(
        record.phoneNumber ?? record.number ?? record.phone ?? ''
      ).trim();
      if (!activationId || !phoneNumber) {
        return null;
      }
      const statusAction = String(record.statusAction || '').trim();
      return {
        activationId,
        phoneNumber,
        provider: String(record.provider || 'hero-sms').trim() || 'hero-sms',
        serviceCode: String(record.serviceCode || HERO_SMS_SERVICE_CODE).trim() || HERO_SMS_SERVICE_CODE,
        countryId: Number(record.countryId) || HERO_SMS_COUNTRY_ID,
        successfulUses: normalizeUseCount(record.successfulUses),
        maxUses: Math.max(1, Math.floor(Number(record.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES)),
        ...(statusAction ? { statusAction } : {}),
      };
    }

    function normalizeActivationFallback(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }

      const fallback = {};
      const provider = String(record.provider || '').trim();
      const serviceCode = String(record.serviceCode || '').trim();
      const countryId = Math.floor(Number(record.countryId));
      const statusAction = String(record.statusAction || '').trim();

      if (provider) {
        fallback.provider = provider;
      }
      if (serviceCode) {
        fallback.serviceCode = serviceCode;
      }
      if (Number.isFinite(countryId) && countryId > 0) {
        fallback.countryId = countryId;
      }
      if (Object.prototype.hasOwnProperty.call(record, 'successfulUses')) {
        fallback.successfulUses = normalizeUseCount(record.successfulUses);
      }
      if (Object.prototype.hasOwnProperty.call(record, 'maxUses')) {
        fallback.maxUses = Math.max(1, Math.floor(Number(record.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES));
      }
      if (statusAction) {
        fallback.statusAction = statusAction;
      }

      return Object.keys(fallback).length ? fallback : null;
    }

    function describeHeroSmsPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        if (raw.title || raw.details) {
          const title = String(raw.title || '').trim();
          const details = String(raw.details || '').trim();
          return details ? `${title}: ${details}` : title;
        }
        if (raw.status === 'false' && raw.msg) {
          return String(raw.msg).trim();
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    function parseHeroSmsPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }

    function buildHeroSmsUrl(baseUrl, query = {}) {
      const url = new URL(normalizeUrl(baseUrl));
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return;
        }
        url.searchParams.set(key, String(value));
      });
      return url.toString();
    }

    function buildPhoneCodeTimeoutError(lastResponse = '') {
      const suffix = lastResponse ? ` Last HeroSMS status: ${lastResponse}` : '';
      return new Error(`${PHONE_CODE_TIMEOUT_ERROR_PREFIX}Timed out waiting for the phone verification code.${suffix}`);
    }

    function isPhoneCodeTimeoutError(error) {
      return String(error?.message || '').startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX);
    }

    function buildPhoneAddPhoneTerminalError(message = '') {
      const detail = String(message || '').trim();
      const suffix = detail ? ` ${detail}` : '';
      const terminalError = new Error(`Step 9: add-phone flow cannot continue.${suffix} URL: https://auth.openai.com/add-phone`);
      terminalError.addPhoneFlowFatal = true;
      terminalError.phoneVerificationFlowFatal = true;
      return terminalError;
    }

    function sanitizePhoneCodeTimeoutError(error) {
      const message = String(error?.message || '');
      if (!message.startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX)) {
        return error;
      }
      return new Error(message.slice(PHONE_CODE_TIMEOUT_ERROR_PREFIX.length).trim() || 'Timed out waiting for the phone verification code.');
    }

    async function fetchHeroSmsPayload(config, query, actionLabel) {
      const requestUrl = buildHeroSmsUrl(config.baseUrl, {
        api_key: config.apiKey,
        ...query,
      });
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;

      try {
        const response = await fetchImpl(requestUrl, {
          method: 'GET',
          signal: controller?.signal,
        });
        const text = await response.text();
        const payload = parseHeroSmsPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeHeroSmsPayload(payload) || response.status}`);
          requestError.payload = payload;
          requestError.status = response.status;
          throw requestError;
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`${actionLabel} timed out.`);
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    function resolvePhoneConfig(state = {}) {
      const apiKey = normalizeApiKey(state.heroSmsApiKey);
      if (!apiKey) {
        throw new Error('HeroSMS API key is missing. Save it in the side panel before running the phone flow.');
      }
      return {
        apiKey,
        baseUrl: normalizeUrl(state.heroSmsBaseUrl, DEFAULT_HERO_SMS_BASE_URL),
      };
    }

    function parseActivationPayload(payload, fallback = null) {
      const normalizedFallback = normalizeActivation(fallback) || normalizeActivationFallback(fallback);
      const directActivation = normalizeActivation(payload);
      if (directActivation) {
        const statusAction = normalizedFallback?.statusAction || directActivation.statusAction;
        return {
          ...directActivation,
          provider: normalizedFallback?.provider || directActivation.provider,
          serviceCode: normalizedFallback?.serviceCode || directActivation.serviceCode,
          countryId: normalizedFallback?.countryId || directActivation.countryId,
          successfulUses: normalizedFallback?.successfulUses ?? directActivation.successfulUses,
          maxUses: normalizedFallback?.maxUses ?? directActivation.maxUses,
          ...(statusAction ? { statusAction } : {}),
        };
      }

      const text = describeHeroSmsPayload(payload);
      const accessNumberMatch = text.match(/^ACCESS_NUMBER:([^:]+):(.+)$/i);
      if (accessNumberMatch) {
        return {
          activationId: String(accessNumberMatch[1] || '').trim(),
          phoneNumber: String(accessNumberMatch[2] || '').trim(),
          provider: normalizedFallback?.provider || 'hero-sms',
          serviceCode: normalizedFallback?.serviceCode || HERO_SMS_SERVICE_CODE,
          countryId: normalizedFallback?.countryId || HERO_SMS_COUNTRY_ID,
          successfulUses: normalizedFallback?.successfulUses ?? 0,
          maxUses: normalizedFallback?.maxUses ?? DEFAULT_PHONE_NUMBER_MAX_USES,
          ...(normalizedFallback?.statusAction ? { statusAction: normalizedFallback.statusAction } : {}),
        };
      }

      if (/^ACCESS_READY$/i.test(text) && normalizedFallback) {
        return normalizedFallback;
      }

      return null;
    }

    function resolveActivationStatusAction(activation) {
      return activation?.statusAction === 'getStatusV2' ? 'getStatusV2' : 'getStatus';
    }

    function normalizeHeroSmsPrice(value) {
      const price = Number(value);
      if (!Number.isFinite(price) || price < 0) {
        return null;
      }
      return price;
    }

    function collectHeroSmsPriceCandidates(payload, candidates = []) {
      if (Array.isArray(payload)) {
        payload.forEach((entry) => collectHeroSmsPriceCandidates(entry, candidates));
        return candidates;
      }
      if (!payload || typeof payload !== 'object') {
        return candidates;
      }

      const cost = normalizeHeroSmsPrice(payload.cost);
      if (cost !== null) {
        const count = Number(payload.count);
        const physicalCount = Number(payload.physicalCount);
        const hasCount = Number.isFinite(count);
        const hasPhysicalCount = Number.isFinite(physicalCount);
        if ((!hasCount && !hasPhysicalCount) || count > 0 || physicalCount > 0) {
          candidates.push(cost);
        }
      }

      Object.values(payload).forEach((value) => collectHeroSmsPriceCandidates(value, candidates));
      return candidates;
    }

    function findLowestHeroSmsPrice(payload) {
      const candidates = collectHeroSmsPriceCandidates(payload, []);
      if (!candidates.length) {
        return null;
      }
      return Math.min(...candidates);
    }

    function isHeroSmsNoNumbersPayload(payload) {
      return /\bNO_NUMBERS\b/i.test(describeHeroSmsPayload(payload));
    }

    function isHeroSmsNoNumbersError(error) {
      return isHeroSmsNoNumbersPayload(error?.payload || error?.message || error);
    }

    function extractHeroSmsErrorToken(payload) {
      const text = describeHeroSmsPayload(payload).toUpperCase();
      if (!text) {
        return '';
      }
      const tokenMatch = text.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
      return String(tokenMatch?.[1] || '').trim();
    }

    function getHeroSmsTerminalAcquireReason(payload) {
      const text = describeHeroSmsPayload(payload);
      const token = extractHeroSmsErrorToken(payload);
      const terminalTokenSet = new Set([
        'NO_BALANCE',
        'NOT_ENOUGH_BALANCE',
        'BAD_KEY',
        'WRONG_KEY',
        'BAD_ACTION',
        'BAD_SERVICE',
        'BAD_STATUS',
        'BAD_COUNTRY',
        'ERROR_SQL',
        'BANNED',
      ]);
      if (terminalTokenSet.has(token)) {
        return text || token;
      }
      return '';
    }

    function isHeroSmsActivationReplaceableError(error) {
      const text = describeHeroSmsPayload(error?.payload || error?.message || error).toUpperCase();
      if (!text) {
        return false;
      }
      return (
        /\b(?:STATUS_CANCEL|NO_ACTIVATION|BAD_STATUS|STATUS_EXPIRED|STATUS_FINISHED|STATUS_DONE)\b/.test(text)
        || /ACTIVATION WAS CANCELLED/.test(text)
      );
    }

    function extractHeroSmsWrongMaxPrice(payload) {
      if (payload && typeof payload === 'object') {
        const title = String(payload.title || '').trim();
        const minPrice = normalizeHeroSmsPrice(payload.info?.min);
        if (/^WRONG_MAX_PRICE$/i.test(title) && minPrice !== null) {
          return minPrice;
        }
      }

      const text = describeHeroSmsPayload(payload);
      const match = text.match(/\bWRONG_MAX_PRICE:(\d+(?:\.\d+)?)\b/i);
      if (!match) {
        return null;
      }
      return normalizeHeroSmsPrice(match[1]);
    }

    function isNetworkFetchFailure(error) {
      const message = String(error?.message || '').trim();
      return /failed to fetch|networkerror|load failed/i.test(message);
    }

    function findHeroSmsPriceLadder(payload) {
      const candidates = collectHeroSmsPriceCandidates(payload, []);
      if (!candidates.length) {
        return [];
      }
      return Array.from(new Set(candidates.map((price) => Number(price)))).sort((left, right) => left - right);
    }

    async function resolvePhoneActivationPriceLadder(config, countryConfig) {
      for (let attempt = 1; attempt <= DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const payload = await fetchHeroSmsPayload(config, {
            action: 'getPrices',
            service: HERO_SMS_SERVICE_CODE,
            country: countryConfig.id,
          }, 'HeroSMS getPrices');
          const priceLadder = findHeroSmsPriceLadder(payload);
          if (priceLadder.length) {
            return priceLadder;
          }
        } catch (_) {
          // Best-effort lookup only.
        }
      }
      return [];
    }

    async function fetchPhoneActivationPayload(config, countryConfig, action, options = {}) {
      const query = {
        action,
        service: HERO_SMS_SERVICE_CODE,
        country: countryConfig.id,
      };
      if (options.maxPrice !== null && options.maxPrice !== undefined) {
        query.maxPrice = options.maxPrice;
        query.fixedPrice = 'true';
      }
      return fetchHeroSmsPayload(config, query, `HeroSMS ${action}`);
    }

    async function requestPhoneActivationWithPrice(config, countryConfig, action, maxPrice) {
      let nextMaxPrice = maxPrice;
      let retriedWithUpdatedPrice = false;
      let retriedWithoutPrice = false;

      while (true) {
        try {
          return await fetchPhoneActivationPayload(config, countryConfig, action, {
            maxPrice: nextMaxPrice,
          });
        } catch (error) {
          const updatedMaxPrice = extractHeroSmsWrongMaxPrice(error?.payload || error?.message);
          if (
            nextMaxPrice !== null
            && nextMaxPrice !== undefined
            && !retriedWithUpdatedPrice
            && updatedMaxPrice !== null
          ) {
            nextMaxPrice = updatedMaxPrice;
            retriedWithUpdatedPrice = true;
            continue;
          }

          if (
            nextMaxPrice !== null
            && nextMaxPrice !== undefined
            && !retriedWithoutPrice
            && isNetworkFetchFailure(error)
          ) {
            nextMaxPrice = null;
            retriedWithoutPrice = true;
            continue;
          }

          throw error;
        }
      }
    }

    async function requestPhoneActivation(state = {}) {
      const config = resolvePhoneConfig(state);
      const countryConfig = resolveCountryConfig(state);
      const priceLadder = await resolvePhoneActivationPriceLadder(config, countryConfig);
      const priceCandidates = priceLadder.length ? priceLadder : [null];
      const buildFallbackActivation = (requestAction) => ({
        countryId: countryConfig.id,
        ...(requestAction === 'getNumberV2' ? { statusAction: 'getStatusV2' } : {}),
      });

      let lastNoNumbersMessage = '';

      for (let priceIndex = 0; priceIndex < priceCandidates.length; priceIndex += 1) {
        const maxPrice = priceCandidates[priceIndex];
        const hasNextPrice = priceIndex < priceCandidates.length - 1;
        const actions = ['getNumber', 'getNumberV2'];
        let priceExhaustedByNoNumbers = false;

        for (const requestAction of actions) {
          let payload;
          try {
            payload = await requestPhoneActivationWithPrice(config, countryConfig, requestAction, maxPrice);
          } catch (error) {
            if (isHeroSmsNoNumbersError(error)) {
              lastNoNumbersMessage = describeHeroSmsPayload(error?.payload || error?.message || '');
              priceExhaustedByNoNumbers = true;
              continue;
            }
            const terminalReason = getHeroSmsTerminalAcquireReason(error?.payload || error?.message || error);
            if (terminalReason) {
              throw buildPhoneAddPhoneTerminalError(
                `HeroSMS number acquisition failed (${terminalReason}).`
              );
            }
            throw error;
          }

          const activation = parseActivationPayload(payload, buildFallbackActivation(requestAction));
          if (activation) {
            return activation;
          }

          if (isHeroSmsNoNumbersPayload(payload)) {
            lastNoNumbersMessage = describeHeroSmsPayload(payload);
            priceExhaustedByNoNumbers = true;
            continue;
          }

          const terminalReason = getHeroSmsTerminalAcquireReason(payload);
          if (terminalReason) {
            throw buildPhoneAddPhoneTerminalError(
              `HeroSMS number acquisition failed (${terminalReason}).`
            );
          }

          const text = describeHeroSmsPayload(payload);
          throw new Error(`HeroSMS ${requestAction} failed: ${text || 'empty response'}`);
        }

        if (priceExhaustedByNoNumbers && hasNextPrice) {
          const nextPrice = priceCandidates[priceIndex + 1];
          const currentPriceLabel = maxPrice === null ? '不限价' : String(maxPrice);
          const nextPriceLabel = nextPrice === null ? '不限价' : String(nextPrice);
          await addLog(
            `Step 9: HeroSMS returned NO_NUMBERS at maxPrice=${currentPriceLabel}, retrying with maxPrice=${nextPriceLabel}.`,
            'warn'
          );
        }
      }

      const details = lastNoNumbersMessage
        ? ` HeroSMS response: ${lastNoNumbersMessage}.`
        : '';
      throw buildPhoneAddPhoneTerminalError(
        `HeroSMS has no available numbers for ${countryConfig.label}.${details}`
      );
    }

    async function reactivatePhoneActivation(state = {}, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Reusable phone activation is missing.');
      }

      const config = resolvePhoneConfig(state);
      const payload = await fetchHeroSmsPayload(config, {
        action: 'reactivate',
        id: normalizedActivation.activationId,
      }, 'HeroSMS reactivate');
      const nextActivation = parseActivationPayload(payload, normalizedActivation);
      if (!nextActivation) {
        const text = describeHeroSmsPayload(payload);
        throw new Error(`HeroSMS reactivate failed: ${text || 'empty response'}`);
      }
      return nextActivation;
    }

    async function setPhoneActivationStatus(state = {}, activation, status, actionLabel) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        return '';
      }
      const config = resolvePhoneConfig(state);
      const payload = await fetchHeroSmsPayload(config, {
        action: 'setStatus',
        id: normalizedActivation.activationId,
        status,
      }, actionLabel);
      return describeHeroSmsPayload(payload);
    }

    async function completePhoneActivation(state = {}, activation) {
      await setPhoneActivationStatus(state, activation, 6, 'HeroSMS setStatus(6)');
    }

    async function cancelPhoneActivation(state = {}, activation) {
      try {
        await setPhoneActivationStatus(state, activation, 8, 'HeroSMS setStatus(8)');
      } catch (_) {
        // Best-effort cleanup.
      }
    }

    async function requestAdditionalPhoneSms(state = {}, activation) {
      try {
        await setPhoneActivationStatus(state, activation, 3, 'HeroSMS setStatus(3)');
      } catch (_) {
        // Best-effort request only.
      }
    }

    async function pollPhoneActivationCode(state = {}, activation, options = {}) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Phone activation is missing.');
      }
      const statusAction = resolveActivationStatusAction(normalizedActivation);

      const config = resolvePhoneConfig(state);
      const configuredTimeoutMs = Math.max(1000, Number(options.timeoutMs) || 0);
      const timeoutMs = configuredTimeoutMs || (
        typeof getOAuthFlowStepTimeoutMs === 'function'
          ? await getOAuthFlowStepTimeoutMs(
            DEFAULT_PHONE_POLL_TIMEOUT_MS,
            { step: 9, actionLabel: options.actionLabel || 'poll phone verification code' }
          )
          : DEFAULT_PHONE_POLL_TIMEOUT_MS
      );
      const intervalMs = Math.max(1000, Number(options.intervalMs) || DEFAULT_PHONE_POLL_INTERVAL_MS);
      const start = Date.now();
      let lastResponse = '';
      let pollCount = 0;

      while (Date.now() - start < timeoutMs) {
        throwIfStopped();
        const payload = await fetchHeroSmsPayload(config, {
          action: statusAction,
          id: normalizedActivation.activationId,
        }, `HeroSMS ${statusAction}`);
        const text = describeHeroSmsPayload(payload);
        lastResponse = text;
        pollCount += 1;

        if (typeof options.onStatus === 'function') {
          await options.onStatus({
            activation: normalizedActivation,
            elapsedMs: Date.now() - start,
            pollCount,
            statusText: text,
            timeoutMs,
          });
        }

        const extractVerificationCode = (rawCode) => {
          const trimmed = String(rawCode || '').trim();
          if (!trimmed) {
            return '';
          }
          const digitMatch = trimmed.match(/\b(\d{4,8})\b/);
          return digitMatch?.[1] || trimmed;
        };

        const v2Code = (
          payload
          && typeof payload === 'object'
          && !Array.isArray(payload)
          && (
            extractVerificationCode(payload.sms?.code)
            || extractVerificationCode(payload.call?.code)
          )
        );
        if (v2Code) {
          return v2Code;
        }

        const okMatch = text.match(/^STATUS_OK:(.+)$/i);
        if (okMatch) {
          const rawCode = String(okMatch[1] || '').trim();
          const digitMatch = rawCode.match(/\b(\d{4,8})\b/);
          return digitMatch?.[1] || rawCode;
        }

        if (/^STATUS_(WAIT_CODE|WAIT_RETRY|WAIT_RESEND)$/i.test(text)) {
          await sleepWithStop(intervalMs);
          continue;
        }

        if (statusAction === 'getStatusV2' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
          await sleepWithStop(intervalMs);
          continue;
        }

        if (/^STATUS_CANCEL$/i.test(text)) {
          throw new Error('HeroSMS activation was cancelled before the SMS arrived.');
        }

        throw new Error(`HeroSMS ${statusAction} failed: ${text || 'empty response'}`);
      }

      throw buildPhoneCodeTimeoutError(lastResponse);
    }

    async function readPhonePageState(tabId, timeoutMs = 10000) {
      await ensureStep8SignupPageReady(tabId, {
        timeoutMs,
        logMessage: 'Step 9: waiting for auth page content script to recover before phone verification.',
      });
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'STEP8_GET_STATE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: auth page is switching, waiting to inspect phone verification state again...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function submitPhoneNumber(tabId, phoneNumber) {
      const state = await getState();
      const countryConfig = resolveCountryConfig(state);
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'submit add-phone number' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_NUMBER',
        source: 'background',
        payload: {
          phoneNumber,
          countryId: countryConfig.id,
          countryLabel: countryConfig.label,
        },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for add-phone page to become ready...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function submitPhoneVerificationCode(tabId, code) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(45000, { step: 9, actionLabel: 'submit phone verification code' })
        : 45000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'SUBMIT_PHONE_VERIFICATION_CODE',
        source: 'background',
        payload: { code },
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for phone verification page before filling the SMS code...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function resendPhoneVerificationCode(tabId) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'resend phone verification code' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RESEND_PHONE_VERIFICATION_CODE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: waiting for the phone verification resend button...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function returnToAddPhone(tabId) {
      const timeoutMs = typeof getOAuthFlowStepTimeoutMs === 'function'
        ? await getOAuthFlowStepTimeoutMs(30000, { step: 9, actionLabel: 'return to add-phone page' })
        : 30000;
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'RETURN_TO_ADD_PHONE',
        source: 'background',
        payload: {},
      }, {
        timeoutMs,
        responseTimeoutMs: timeoutMs,
        retryDelayMs: 600,
        logMessage: 'Step 9: returning to add-phone page to replace the phone number...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function persistCurrentActivation(activation) {
      await setState({
        [PHONE_ACTIVATION_STATE_KEY]: activation || null,
      });
    }

    async function persistReusableActivation(activation) {
      await setState({
        [REUSABLE_PHONE_ACTIVATION_STATE_KEY]: activation || null,
      });
    }

    async function clearCurrentActivation() {
      await persistCurrentActivation(null);
    }

    async function clearReusableActivation() {
      await persistReusableActivation(null);
    }

    async function acquirePhoneActivation(state = {}) {
      const countryConfig = resolveCountryConfig(state);
      const reusableActivation = normalizeActivation(state[REUSABLE_PHONE_ACTIVATION_STATE_KEY]);
      if (
        reusableActivation
        && reusableActivation.countryId === countryConfig.id
        && reusableActivation.successfulUses < reusableActivation.maxUses
      ) {
        try {
          const reactivated = await reactivatePhoneActivation(state, reusableActivation);
          await addLog(
            `Step 9: reusing ${countryConfig.label} number ${reactivated.phoneNumber} (${reactivated.successfulUses + 1}/${reactivated.maxUses}).`,
            'info'
          );
          return reactivated;
        } catch (error) {
          await addLog(`Step 9: failed to reuse phone number ${reusableActivation.phoneNumber}, falling back to a new number. ${error.message}`, 'warn');
          await clearReusableActivation();
        }
      } else if (reusableActivation && reusableActivation.countryId !== countryConfig.id) {
        await clearReusableActivation();
      }

      const activation = await requestPhoneActivation(state);
      await addLog(
        `Step 9: acquired ${HERO_SMS_SERVICE_LABEL} / ${countryConfig.label} number ${activation.phoneNumber}.`,
        'info'
      );
      return activation;
    }

    async function markActivationReusableAfterSuccess(activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        await clearReusableActivation();
        return;
      }

      const successfulUses = normalizedActivation.successfulUses + 1;
      if (successfulUses >= normalizedActivation.maxUses) {
        await clearReusableActivation();
        return;
      }

      await persistReusableActivation({
        ...normalizedActivation,
        successfulUses,
      });
    }

    async function waitForPhoneCodeOrRotateNumber(tabId, state, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Phone activation is missing.');
      }

      let lastLoggedStatus = '';
      let lastLoggedPollCount = 0;

      for (let windowIndex = 1; windowIndex <= 2; windowIndex += 1) {
        await addLog(
          `Step 9: waiting up to 60 seconds for SMS on ${normalizedActivation.phoneNumber} (${windowIndex}/2).`,
          'info'
        );
        try {
          const code = await pollPhoneActivationCode(state, normalizedActivation, {
            actionLabel: windowIndex === 1
              ? 'poll phone verification code from HeroSMS'
              : 'poll resent phone verification code from HeroSMS',
            timeoutMs: DEFAULT_PHONE_CODE_WAIT_WINDOW_MS,
            onStatus: async ({ elapsedMs, pollCount, statusText }) => {
              const shouldLog = (
                pollCount === 1
                || statusText !== lastLoggedStatus
                || pollCount - lastLoggedPollCount >= 3
              );
              if (!shouldLog) {
                return;
              }
              lastLoggedStatus = statusText;
              lastLoggedPollCount = pollCount;
              await addLog(
                `Step 9: HeroSMS status for ${normalizedActivation.phoneNumber}: ${statusText} (${Math.ceil(elapsedMs / 1000)}s elapsed).`,
                'info'
              );
            },
          });
          return {
            code,
            replaceNumber: false,
          };
        } catch (error) {
          if (isHeroSmsActivationReplaceableError(error)) {
            await addLog(
              `Step 9: HeroSMS reported activation issue for ${normalizedActivation.phoneNumber} (${error.message || 'unknown status'}), replacing this number in current step 9.`,
              'warn'
            );
            return {
              code: '',
              replaceNumber: true,
            };
          }

          if (!isPhoneCodeTimeoutError(error)) {
            throw error;
          }

          if (windowIndex === 1) {
            await addLog(
              `Step 9: no SMS arrived for ${normalizedActivation.phoneNumber} within 60 seconds, requesting another SMS.`,
              'warn'
            );
            await requestAdditionalPhoneSms(state, normalizedActivation);
            try {
              await resendPhoneVerificationCode(tabId);
              await addLog('Step 9: clicked "Resend text message" on the phone verification page.', 'info');
            } catch (resendError) {
              await addLog(`Step 9: failed to click resend on the phone verification page. ${resendError.message}`, 'warn');
            }
            continue;
          }

          await addLog(
            `Step 9: still no SMS for ${normalizedActivation.phoneNumber} 60 seconds after resend, replacing the number in current step 9.`,
            'warn'
          );
          return {
            code: '',
            replaceNumber: true,
          };
        }
      }

      throw new Error('Phone verification did not complete successfully.');
    }

    async function completePhoneVerificationFlow(tabId, initialPageState = null) {
      let state = await getState();
      let activation = normalizeActivation(state[PHONE_ACTIVATION_STATE_KEY]);
      let pageState = initialPageState || await readPhonePageState(tabId);
      let shouldCancelActivation = false;
      let remainingResendRequests = Math.max(0, Number(state.verificationResendCount) || 0);
      let replacedNumberCount = 0;

      const ensureReplacementWithinLimit = (reason = '') => {
        replacedNumberCount += 1;
        if (replacedNumberCount > DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT) {
          throw buildPhoneAddPhoneTerminalError(
            `Reached number replacement limit (${DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT}).${reason ? ` ${reason}` : ''}`
          );
        }
      };

      try {
        while (true) {
          state = await getState();
          if (!activation) {
            activation = normalizeActivation(state[PHONE_ACTIVATION_STATE_KEY]);
          }

          if (pageState?.addPhonePage) {
            if (activation) {
              await cancelPhoneActivation(state, activation);
              await clearCurrentActivation();
              activation = null;
              shouldCancelActivation = false;
            }

            activation = await acquirePhoneActivation(state);
            shouldCancelActivation = true;
            await persistCurrentActivation(activation);
            let submitResult;
            try {
              submitResult = await submitPhoneNumber(tabId, activation.phoneNumber);
            } catch (submitError) {
              const submitErrorMessage = String(submitError?.message || submitError || '');
              const likelyNumberRejected = /Timed out waiting for phone verification page|already\s+(?:in use|used|associated|linked)|phone\s+number.*(?:invalid|not valid|unsupported|not supported|cannot|can't)|号码.*(?:已被|无效|不支持)/i
                .test(submitErrorMessage);
              if (likelyNumberRejected) {
                const observedState = await readPhonePageState(tabId, 10000).catch(() => null);
                if (observedState?.addPhonePage) {
                  ensureReplacementWithinLimit(`Last reason: ${submitErrorMessage}`);
                  await addLog(
                    `Step 9: phone number ${activation.phoneNumber} was rejected on add-phone, replacing with a new number (${replacedNumberCount}/${DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT}).`,
                    'warn'
                  );
                  pageState = {
                    ...pageState,
                    ...observedState,
                    addPhonePage: true,
                    phoneVerificationPage: false,
                  };
                  continue;
                }
              }
              throw submitError;
            }
            await addLog('Step 9: submitted the phone number on add-phone page.', 'info');
            pageState = {
              ...pageState,
              ...submitResult,
              addPhonePage: Boolean(submitResult?.addPhonePage),
              phoneVerificationPage: Boolean(submitResult?.phoneVerificationPage),
            };
          }

          if (!pageState?.phoneVerificationPage) {
            pageState = await readPhonePageState(tabId);
          }

          if (!pageState?.phoneVerificationPage) {
            return pageState;
          }

          if (!activation) {
            throw new Error('The auth page is waiting for a phone verification code, but no HeroSMS activation is stored for this run.');
          }

          let shouldReplaceNumber = false;

          for (let attempt = 1; attempt <= DEFAULT_PHONE_SUBMIT_ATTEMPTS; attempt += 1) {
            throwIfStopped();

            const codeResult = await waitForPhoneCodeOrRotateNumber(tabId, state, activation);
            if (codeResult.replaceNumber) {
              ensureReplacementWithinLimit(`No SMS for ${activation.phoneNumber} after resend.`);
              const backToAddPhone = await returnToAddPhone(tabId);
              pageState = {
                ...pageState,
                ...backToAddPhone,
                addPhonePage: true,
                phoneVerificationPage: false,
              };
              await addLog(
                `Step 9: switching to another number in current flow (${replacedNumberCount}/${DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT}).`,
                'warn'
              );
              shouldReplaceNumber = true;
              break;
            }

            await addLog(`Step 9: received phone verification code ${codeResult.code}.`, 'info');
            const submitResult = await submitPhoneVerificationCode(tabId, codeResult.code);

            if (submitResult.returnedToAddPhone) {
              ensureReplacementWithinLimit('Verification page returned to add-phone after code submission.');
              await addLog(
                'Step 9: phone verification returned to add-phone after code submission, replacing the current number.',
                'warn'
              );
              shouldReplaceNumber = true;
              pageState = {
                ...pageState,
                ...submitResult,
                addPhonePage: true,
                phoneVerificationPage: false,
              };
              break;
            }

            if (submitResult.invalidCode) {
              if (attempt >= DEFAULT_PHONE_SUBMIT_ATTEMPTS) {
                throw new Error(
                  `Phone verification code was rejected after ${DEFAULT_PHONE_SUBMIT_ATTEMPTS} attempts: ${submitResult.errorText || submitResult.url || 'unknown error'}`
                );
              }

              if (remainingResendRequests > 0) {
                remainingResendRequests -= 1;
                await requestAdditionalPhoneSms(state, activation);
                try {
                  await resendPhoneVerificationCode(tabId);
                  await addLog('Step 9: clicked "Resend text message" after the phone code was rejected.', 'info');
                } catch (resendError) {
                  await addLog(`Step 9: failed to click resend after code rejection. ${resendError.message}`, 'warn');
                }
                await addLog(
                  `Step 9: phone verification code was rejected, requested another SMS (${remainingResendRequests} resend attempts left).`,
                  'warn'
                );
              } else {
                await addLog(
                  'Step 9: phone verification code was rejected and the configured resend budget is exhausted, retrying with the current activation window.',
                  'warn'
                );
              }
              continue;
            }

            await completePhoneActivation(state, activation);
            await markActivationReusableAfterSuccess(activation);
            shouldCancelActivation = false;
            await clearCurrentActivation();
          await addLog('Step 9: phone verification finished, waiting for OAuth consent.', 'ok');
          return submitResult;
        }

          if (!shouldReplaceNumber) {
            throw new Error('Phone verification did not complete successfully.');
          }
        }
      } catch (error) {
        if (shouldCancelActivation && activation) {
          await cancelPhoneActivation(state, activation);
        }
        await clearCurrentActivation();
        throw sanitizePhoneCodeTimeoutError(error);
      }
    }

    return {
      completePhoneVerificationFlow,
      normalizeActivation,
      pollPhoneActivationCode,
      reactivatePhoneActivation,
      requestPhoneActivation,
    };
  }

  return {
    createPhoneVerificationHelpers,
  };
});
