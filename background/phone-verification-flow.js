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
      sendToContentScript,
      sendToContentScriptResilient,
      setState,
      broadcastDataUpdate = null,
      sleepWithStop,
      throwIfStopped,
      DEFAULT_HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php',
      DEFAULT_FIVE_SIM_BASE_URL = 'https://5sim.net/v1',
      DEFAULT_FIVE_SIM_PRODUCT = 'openai',
      DEFAULT_FIVE_SIM_OPERATOR = 'any',
      DEFAULT_FIVE_SIM_COUNTRY_ORDER = ['thailand'],
      DEFAULT_NEX_SMS_BASE_URL = 'https://api.nexsms.net',
      DEFAULT_NEX_SMS_COUNTRY_ORDER = [1],
      DEFAULT_NEX_SMS_SERVICE_CODE = 'ot',
      DEFAULT_HERO_SMS_REUSE_ENABLED = true,
      HERO_SMS_COUNTRY_ID = 52,
      HERO_SMS_COUNTRY_LABEL = 'Thailand',
      HERO_SMS_SERVICE_CODE = 'dr',
      HERO_SMS_SERVICE_LABEL = 'OpenAI',
      DEFAULT_PHONE_CODE_WAIT_SECONDS = 60,
      DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2,
      DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5,
      DEFAULT_PHONE_CODE_POLL_ROUNDS = 4,
    } = deps;

    const PHONE_ACTIVATION_STATE_KEY = 'currentPhoneActivation';
    const PHONE_VERIFICATION_CODE_STATE_KEY = 'currentPhoneVerificationCode';
    const REUSABLE_PHONE_ACTIVATION_STATE_KEY = 'reusablePhoneActivation';
    const REUSABLE_PHONE_ACTIVATION_POOL_STATE_KEY = 'phoneReusableActivationPool';
    const PREFERRED_PHONE_ACTIVATION_STATE_KEY = 'phonePreferredActivation';
    const PHONE_RUNTIME_COUNTDOWN_ENDS_AT_KEY = 'currentPhoneVerificationCountdownEndsAt';
    const PHONE_RUNTIME_COUNTDOWN_WINDOW_INDEX_KEY = 'currentPhoneVerificationCountdownWindowIndex';
    const PHONE_RUNTIME_COUNTDOWN_WINDOW_TOTAL_KEY = 'currentPhoneVerificationCountdownWindowTotal';
    const PHONE_NO_SUPPLY_FAILURE_STREAK_STATE_KEY = 'phoneNoSupplyFailureStreak';
    const HERO_SMS_LAST_PRICE_TIERS_KEY = 'heroSmsLastPriceTiers';
    const HERO_SMS_LAST_PRICE_COUNTRY_ID_KEY = 'heroSmsLastPriceCountryId';
    const HERO_SMS_LAST_PRICE_COUNTRY_LABEL_KEY = 'heroSmsLastPriceCountryLabel';
    const HERO_SMS_LAST_PRICE_USER_LIMIT_KEY = 'heroSmsLastPriceUserLimit';
    const HERO_SMS_LAST_PRICE_AT_KEY = 'heroSmsLastPriceAt';
    const PHONE_CODE_WAIT_SECONDS_MIN = 15;
    const PHONE_CODE_WAIT_SECONDS_MAX = 300;
    const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
    const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
    const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
    const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
    const PHONE_CODE_POLL_ROUNDS_MIN = 1;
    const PHONE_CODE_POLL_ROUNDS_MAX = 120;
    const DEFAULT_PHONE_POLL_INTERVAL_MS = DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS * 1000;
    const DEFAULT_PHONE_POLL_TIMEOUT_MS = 180000;
    const DEFAULT_PHONE_REQUEST_TIMEOUT_MS = 20000;
    const DEFAULT_PHONE_SUBMIT_ATTEMPTS = 3;
    const DEFAULT_PHONE_NUMBER_MAX_USES = 3;
    const DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT = 3;
    const DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS = 3;
    const MAX_PHONE_PRICE_CANDIDATES = 8;
    const DEFAULT_PHONE_ACTIVATION_RETRY_ROUNDS = 3;
    const PHONE_ACTIVATION_RETRY_ROUNDS_MIN = 1;
    const PHONE_ACTIVATION_RETRY_ROUNDS_MAX = 10;
    const DEFAULT_PHONE_ACTIVATION_RETRY_DELAY_MS = 2000;
    const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
    const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
    const HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH = 'price_high';
    const PHONE_SMS_PROVIDER_HERO = 'hero-sms';
    const PHONE_SMS_PROVIDER_5SIM = '5sim';
    const PHONE_SMS_PROVIDER_NEXSMS = 'nexsms';
    const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO;
    const DEFAULT_PHONE_SMS_PROVIDER_ORDER = [
      PHONE_SMS_PROVIDER_HERO,
      PHONE_SMS_PROVIDER_5SIM,
      PHONE_SMS_PROVIDER_NEXSMS,
    ];
    const MAX_PHONE_REUSABLE_POOL = 12;
    const PHONE_CODE_TIMEOUT_ERROR_PREFIX = 'PHONE_CODE_TIMEOUT::';
    const PHONE_RESTART_STEP7_ERROR_PREFIX = 'PHONE_RESTART_STEP7::';
    const PHONE_RESEND_THROTTLED_ERROR_PREFIX = 'PHONE_RESEND_THROTTLED::';
    const PHONE_ROUTE_405_RECOVERY_FAILED_ERROR_PREFIX = 'PHONE_ROUTE_405_RECOVERY_FAILED::';
    const PHONE_SMS_FAILURE_SKIP_THRESHOLD = 2;
    const MAX_ACTIVATION_PRICE_HINTS = 256;
    const activationPriceHintsByKey = new Map();

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

    function normalizePhoneSmsProvider(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === PHONE_SMS_PROVIDER_5SIM) {
        return PHONE_SMS_PROVIDER_5SIM;
      }
      if (normalized === PHONE_SMS_PROVIDER_NEXSMS) {
        return PHONE_SMS_PROVIDER_NEXSMS;
      }
      return PHONE_SMS_PROVIDER_HERO;
    }

    function isFiveSimProvider(state = {}) {
      return normalizePhoneSmsProvider(state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER) === PHONE_SMS_PROVIDER_5SIM;
    }

    function normalizeNexSmsCountryId(value, fallback = 0) {
      const parsed = Math.floor(Number(value));
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
      const fallbackParsed = Math.floor(Number(fallback));
      if (Number.isFinite(fallbackParsed) && fallbackParsed >= 0) {
        return fallbackParsed;
      }
      return 0;
    }

    function normalizeNexSmsCountryOrder(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const normalized = [];
      const seen = new Set();
      source.forEach((entry) => {
        const id = normalizeNexSmsCountryId(
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry.id || entry.countryId || entry.country || '')
            : entry,
          -1
        );
        if (id < 0 || seen.has(id)) {
          return;
        }
        seen.add(id);
        normalized.push(id);
      });
      return normalized.slice(0, 10);
    }

    function resolveNexSmsCountryCandidates(state = {}) {
      const ids = normalizeNexSmsCountryOrder(state?.nexSmsCountryOrder);
      return ids.map((id) => ({
        id,
        label: `Country #${id}`,
      }));
    }

    function normalizeNexSmsServiceCode(value = '', fallback = DEFAULT_NEX_SMS_SERVICE_CODE) {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      if (normalized) {
        return normalized;
      }
      const fallbackNormalized = String(fallback || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      return fallbackNormalized || 'ot';
    }

    function normalizeFiveSimCountryCode(value = '', fallback = 'thailand') {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      return normalized || fallback;
    }

    function normalizeFiveSimCountryOrder(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const normalized = [];
      const seen = new Set();

      source.forEach((entry) => {
        const code = normalizeFiveSimCountryCode(
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry.code || entry.country || entry.id || '')
            : entry,
          ''
        );
        if (!code || seen.has(code)) {
          return;
        }
        seen.add(code);
        normalized.push(code);
      });

      return normalized.slice(0, 10);
    }

    function resolveFiveSimCountryCandidates(state = {}) {
      const codes = normalizeFiveSimCountryOrder(state?.fiveSimCountryOrder);
      return codes.map((code) => ({
        code,
        id: code,
        label: code,
      }));
    }

    function normalizeUseCount(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    }

    function normalizeTimestampMs(value) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        if (numeric >= 1000000000000) {
          return Math.floor(numeric);
        }
        if (numeric >= 1000000000) {
          return Math.floor(numeric * 1000);
        }
      }

      const text = String(value || '').trim();
      if (!text) {
        return 0;
      }
      const parsed = Date.parse(text);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    }

    function normalizePhoneReplacementLimit(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_NUMBER_REPLACEMENT_LIMIT;
      }
      return Math.max(1, Math.min(20, parsed));
    }

    function normalizePhoneActivationRetryRounds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_ACTIVATION_RETRY_ROUNDS;
      }
      return Math.max(PHONE_ACTIVATION_RETRY_ROUNDS_MIN, Math.min(PHONE_ACTIVATION_RETRY_ROUNDS_MAX, parsed));
    }

    function normalizePhoneActivationRetryDelayMs(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_ACTIVATION_RETRY_DELAY_MS;
      }
      return Math.max(500, Math.min(30000, parsed));
    }

    function normalizeHeroSmsPriceLimit(value) {
      if (value === undefined || value === null || String(value).trim() === '') {
        return null;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
      }
      return Math.round(parsed * 10000) / 10000;
    }

    function isPhoneNumberUsedError(value) {
      const text = String(value || '').trim();
      if (!text) {
        return false;
      }
      return /phone_max_usage_exceeded|phone_number_in_use|already\s+linked\s+to\s+the\s+maximum\s+number\s+of\s+accounts|phone\s+number\s+is\s+already\s+(?:in\s+use|linked|registered)|phone\s+number\s+has\s+already\s+been\s+used|already\s+associated\s+with\s+another\s+account|not\s+eligible\s+to\s+be\s+used|cannot\s+be\s+used\s+for\s+verification|号码.*(?:已|被).*(?:使用|占用|绑定|注册)|手机号.*(?:已|被).*(?:使用|占用|绑定|注册)|该手机号.*(?:已|被).*(?:使用|占用|绑定|注册)/i.test(text);
    }

    function isPhoneNumberInvalidError(value) {
      const text = String(value || '').trim();
      if (!text) {
        return false;
      }
      return /phone\s+number\s+is\s+not\s+valid|invalid\s+phone\s+number|invalid\s+phone|not\s+a\s+valid\s+phone|号码.*无效|手机号.*无效|电话号码.*无效/i.test(text);
    }

    function isRecoverableAddPhoneSubmitError(value) {
      const text = String(value || '').trim();
      if (!text) {
        return false;
      }
      return (
        isPhoneNumberInvalidError(text)
        || /failed\s+to\s+select\b.*add-phone\s+page|missing\s+the\s+country\s+option|could\s+not\s+determine\s+the\s+dial\s+code|add-phone\s+page\s+is\s+missing\s+the\s+phone\s+number\s+input|add-phone\s+page\s+is\s+missing\s+the\s+submit\s+button/i.test(text)
      );
    }

    function normalizeCountryId(value, fallback = HERO_SMS_COUNTRY_ID) {
      const parsed = Math.floor(Number(value));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      const fallbackParsed = Math.floor(Number(fallback));
      if (Number.isFinite(fallbackParsed) && fallbackParsed > 0) {
        return fallbackParsed;
      }
      return 0;
    }

    function normalizeCountryLabel(value = '', fallback = HERO_SMS_COUNTRY_LABEL) {
      return String(value || '').trim() || fallback;
    }

    function normalizePhoneCodeWaitSeconds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_WAIT_SECONDS;
      }
      return Math.max(PHONE_CODE_WAIT_SECONDS_MIN, Math.min(PHONE_CODE_WAIT_SECONDS_MAX, parsed));
    }

    function normalizePhoneCodeTimeoutWindows(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS;
      }
      return Math.max(PHONE_CODE_TIMEOUT_WINDOWS_MIN, Math.min(PHONE_CODE_TIMEOUT_WINDOWS_MAX, parsed));
    }

    function normalizePhoneCodePollIntervalSeconds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS;
      }
      return Math.max(PHONE_CODE_POLL_INTERVAL_SECONDS_MIN, Math.min(PHONE_CODE_POLL_INTERVAL_SECONDS_MAX, parsed));
    }

    function normalizePhoneCodePollMaxRounds(value) {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PHONE_CODE_POLL_ROUNDS;
      }
      return Math.max(PHONE_CODE_POLL_ROUNDS_MIN, Math.min(PHONE_CODE_POLL_ROUNDS_MAX, parsed));
    }

    function normalizeHeroSmsReuseEnabled(value) {
      if (value === undefined || value === null) {
        return Boolean(DEFAULT_HERO_SMS_REUSE_ENABLED);
      }
      return Boolean(value);
    }

    function normalizeHeroSmsAcquirePriority(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === HERO_SMS_ACQUIRE_PRIORITY_PRICE) {
        return HERO_SMS_ACQUIRE_PRIORITY_PRICE;
      }
      if (normalized === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH) {
        return HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH;
      }
      return HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
    }

    function normalizePhoneSmsProviderOrder(value = [], fallbackOrder = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；|/]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const normalized = [];
      const seen = new Set();

      source.forEach((entry) => {
        const provider = normalizePhoneSmsProvider(entry);
        if (seen.has(provider)) {
          return;
        }
        seen.add(provider);
        normalized.push(provider);
      });

      if (normalized.length) {
        return normalized.slice(0, 3);
      }

      const fallback = Array.isArray(fallbackOrder) ? fallbackOrder : [];
      if (!fallback.length) {
        return [];
      }
      const fallbackNormalized = [];
      fallback.forEach((entry) => {
        const provider = normalizePhoneSmsProvider(entry);
        if (!provider || fallbackNormalized.includes(provider)) {
          return;
        }
        fallbackNormalized.push(provider);
      });

      return fallbackNormalized.slice(0, 3);
    }

    function resolvePhoneProviderOrder(state = {}, preferredProvider = '') {
      const currentProvider = normalizePhoneSmsProvider(
        preferredProvider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
      );
      const hasExplicitOrder = Array.isArray(state?.phoneSmsProviderOrder)
        ? state.phoneSmsProviderOrder.length > 0
        : String(state?.phoneSmsProviderOrder || '').trim().length > 0;
      if (hasExplicitOrder) {
        const explicitOrder = normalizePhoneSmsProviderOrder(
          state?.phoneSmsProviderOrder,
          []
        );
        if (explicitOrder.length) {
          return explicitOrder;
        }
        return [currentProvider];
      }
      const fallbackOrder = normalizePhoneSmsProviderOrder(
        [currentProvider],
        DEFAULT_PHONE_SMS_PROVIDER_ORDER
      );
      if (fallbackOrder[0] === currentProvider) {
        return fallbackOrder;
      }
      const withoutCurrent = fallbackOrder.filter((provider) => provider !== currentProvider);
      return [currentProvider, ...withoutCurrent].slice(0, 3);
    }

    function reorderPriceCandidates(prices = [], acquirePriority = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY, preferredPrice = null) {
      const hasNullTier = Array.isArray(prices)
        && prices.some((value) => value === null || value === undefined || String(value).trim() === '');
      const normalized = Array.from(
        new Set(
          (Array.isArray(prices) ? prices : [])
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
            .map((value) => Math.round(value * 10000) / 10000)
        )
      ).sort((left, right) => left - right);
      const ordered = acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH
        ? normalized.reverse()
        : normalized;
      const preferred = Number(preferredPrice);
      if (!Number.isFinite(preferred) || preferred <= 0) {
        if (ordered.length) {
          return ordered;
        }
        return hasNullTier ? [null] : [];
      }
      const normalizedPreferred = Math.round(preferred * 10000) / 10000;
      const withoutPreferred = ordered.filter((value) => value !== normalizedPreferred);
      return [normalizedPreferred, ...withoutPreferred];
    }

    function filterPriceCandidatesAboveFloor(prices = [], minExclusivePrice = null) {
      const floor = normalizeHeroSmsPrice(minExclusivePrice);
      if (floor === null || floor <= 0) {
        return Array.isArray(prices) ? [...prices] : [];
      }
      return (Array.isArray(prices) ? prices : []).filter((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return false;
        }
        const normalized = Math.round(numeric * 10000) / 10000;
        return normalized > floor;
      });
    }

    function shouldUseHeroSmsExpandedPriceLookup(state = {}) {
      if (typeof state?.heroSmsUseExpandedPriceLookup === 'boolean') {
        return state.heroSmsUseExpandedPriceLookup;
      }
      const runningInNode = (
        typeof process !== 'undefined'
        && process
        && process.versions
        && process.versions.node
      );
      // Runtime default: enabled in extension/browser; tests in Node can opt-in explicitly.
      return !runningInNode;
    }

    async function fetchHeroSmsPricePayloads(config, countryConfig, options = {}) {
      const payloads = [];
      const errors = [];
      const actions = Array.isArray(options.actions) && options.actions.length
        ? options.actions
        : (
          shouldUseHeroSmsExpandedPriceLookup(options.state || {})
            ? ['getPricesExtended', 'getPrices']
            : ['getPrices']
        );

      for (const action of actions) {
        try {
          const query = {
            action,
            service: HERO_SMS_SERVICE_CODE,
            country: countryConfig.id,
          };
          if (action === 'getPricesExtended') {
            query.freePrice = 'true';
          }
          const payload = await fetchHeroSmsPayload(config, query, `HeroSMS ${action}`);
          payloads.push(payload);
        } catch (error) {
          errors.push({
            action,
            message: describeHeroSmsPayload(error?.payload || error?.message || ''),
          });
        }
      }

      return {
        payloads,
        errors,
      };
    }

    function collectHeroSmsPriceCandidatesIncludingZeroStock(payload, candidates = []) {
      if (Array.isArray(payload)) {
        payload.forEach((entry) => collectHeroSmsPriceCandidatesIncludingZeroStock(entry, candidates));
        return candidates;
      }
      if (!payload || typeof payload !== 'object') {
        return candidates;
      }

      const cost = normalizeHeroSmsPrice(payload.cost);
      if (cost !== null) {
        candidates.push(cost);
      }

      Object.entries(payload).forEach(([key]) => {
        const keyedPrice = normalizeHeroSmsPrice(key);
        if (keyedPrice !== null) {
          const value = payload[key];
          if (value && typeof value === 'object') {
            const stockState = resolveHeroSmsStockState(value);
            if (stockState.hasStockField) {
              candidates.push(keyedPrice);
            }
            return;
          }
          const numericCount = Number(value);
          if (Number.isFinite(numericCount)) {
            candidates.push(keyedPrice);
          }
        }
      });

      Object.values(payload).forEach((value) => collectHeroSmsPriceCandidatesIncludingZeroStock(value, candidates));
      return candidates;
    }

    async function resolveHeroSmsPricePlanFromPricePayloads(config, countryConfig, state = {}, payloads = []) {
      const userLimit = normalizeHeroSmsPriceLimit(state.heroSmsMaxPrice);
      const inStockCandidates = buildSortedUniquePriceCandidates(
        (Array.isArray(payloads) ? payloads : [])
          .flatMap((payload) => collectHeroSmsPriceCandidates(payload, []))
      );
      const allCatalogCandidates = buildSortedUniquePriceCandidates(
        (Array.isArray(payloads) ? payloads : [])
          .flatMap((payload) => collectHeroSmsPriceCandidatesIncludingZeroStock(payload, []))
      );
      const mergedCandidates = buildSortedUniquePriceCandidates([
        ...inStockCandidates,
        ...allCatalogCandidates,
      ]);
      const minCatalogPrice = allCatalogCandidates.length
        ? allCatalogCandidates[0]
        : (mergedCandidates.length ? mergedCandidates[0] : null);

      if (userLimit !== null) {
        const bounded = mergedCandidates.filter((price) => price <= userLimit);
        if (bounded.length > 0) {
          const boundedPlan = {
            prices: bounded,
            userLimit,
            minCatalogPrice,
            syntheticUserLimitProbe: false,
          };
          await persistHeroSmsPricePlanSnapshot(countryConfig, boundedPlan);
          return boundedPlan;
        }
        const userLimitedPlan = {
          prices: [userLimit],
          userLimit,
          minCatalogPrice,
          syntheticUserLimitProbe: true,
        };
        await persistHeroSmsPricePlanSnapshot(countryConfig, userLimitedPlan);
        return userLimitedPlan;
      }

      if (mergedCandidates.length > 0) {
        const plan = {
          prices: mergedCandidates,
          userLimit: null,
          minCatalogPrice,
          syntheticUserLimitProbe: false,
        };
        await persistHeroSmsPricePlanSnapshot(countryConfig, plan);
        return plan;
      }
      const fallbackPlan = {
        prices: [null],
        userLimit: null,
        minCatalogPrice: null,
        syntheticUserLimitProbe: false,
      };
      await persistHeroSmsPricePlanSnapshot(countryConfig, fallbackPlan);
      return fallbackPlan;
    }

    function normalizeCountryPriceFloorMap(rawMap = {}, normalizeCountryKey) {
      const normalizedMap = new Map();
      if (!rawMap || typeof rawMap !== 'object') {
        return normalizedMap;
      }
      Object.entries(rawMap).forEach(([rawCountryKey, rawPrice]) => {
        const countryKey = String(
          typeof normalizeCountryKey === 'function'
            ? normalizeCountryKey(rawCountryKey)
            : rawCountryKey
        ).trim();
        if (!countryKey) {
          return;
        }
        const normalizedPrice = normalizeHeroSmsPrice(rawPrice);
        if (normalizedPrice === null || normalizedPrice <= 0) {
          return;
        }
        normalizedMap.set(countryKey, Math.round(normalizedPrice * 10000) / 10000);
      });
      return normalizedMap;
    }

    function normalizeCountryFallbackList(value = []) {
      const source = Array.isArray(value)
        ? value
        : String(value || '')
          .split(/[\r\n,，;；]+/)
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      const seen = new Set();
      const normalized = [];

      for (const entry of source) {
        let id = 0;
        let label = '';

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          id = normalizeCountryId(entry.id ?? entry.countryId, 0);
          label = String((entry.label ?? entry.countryLabel) || '').trim();
        } else {
          const text = String(entry || '').trim();
          const structured = text.match(/^(\d+)\s*(?:[:|/-]\s*(.+))?$/);
          if (structured) {
            id = normalizeCountryId(structured[1], 0);
            label = String(structured[2] || '').trim();
          } else {
            id = normalizeCountryId(text, 0);
          }
        }

        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) {
          continue;
        }
        seen.add(id);
        normalized.push({
          id,
          label: label || `Country #${id}`,
        });
      }

      return normalized;
    }

    function resolveCountryConfig(state = {}) {
      const hasExplicitPrimaryCountry = Object.prototype.hasOwnProperty.call(state || {}, 'heroSmsCountryId');
      const fallbackList = normalizeCountryFallbackList(state.heroSmsCountryFallback);
      const primaryCountryId = normalizeCountryId(state.heroSmsCountryId, 0);
      if (primaryCountryId > 0) {
        return {
          id: primaryCountryId,
          label: normalizeCountryLabel(state.heroSmsCountryLabel, HERO_SMS_COUNTRY_LABEL),
        };
      }
      if (hasExplicitPrimaryCountry) {
        if (fallbackList.length) {
          const firstFallback = fallbackList[0];
          return {
            id: normalizeCountryId(firstFallback.id, 0),
            label: normalizeCountryLabel(firstFallback.label, `Country #${firstFallback.id}`),
          };
        }
        return null;
      }
      return {
        id: normalizeCountryId(HERO_SMS_COUNTRY_ID, HERO_SMS_COUNTRY_ID),
        label: normalizeCountryLabel(state.heroSmsCountryLabel, HERO_SMS_COUNTRY_LABEL),
      };
    }

    function resolveCountryCandidates(state = {}) {
      const primary = resolveCountryConfig(state);
      const fallbackList = normalizeCountryFallbackList(state.heroSmsCountryFallback);
      if (!primary || !Number.isFinite(primary.id) || primary.id <= 0) {
        return fallbackList
          .map((entry) => ({
            id: normalizeCountryId(entry.id, 0),
            label: normalizeCountryLabel(entry.label, `Country #${entry.id}`),
          }))
          .filter((entry) => entry.id > 0);
      }
      const seen = new Set([primary.id]);
      const candidates = [primary];

      fallbackList.forEach((entry) => {
        const nextId = normalizeCountryId(entry.id, 0);
        if (!Number.isFinite(nextId) || nextId <= 0 || seen.has(nextId)) {
          return;
        }
        seen.add(nextId);
        candidates.push({
          id: nextId,
          label: normalizeCountryLabel(entry.label, `Country #${nextId}`),
        });
      });

      return candidates;
    }

    function normalizeActivation(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }
      const provider = normalizePhoneSmsProvider(record.provider || '');
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
      const countryLabel = String(record.countryLabel || '').trim();
      const countryCode = normalizeFiveSimCountryCode(
        record.countryCode ?? record.countryId ?? '',
        provider === PHONE_SMS_PROVIDER_5SIM ? 'thailand' : ''
      );
      const expiresAt = normalizeTimestampMs(
        record.expiresAt
        ?? record.expireAt
        ?? record.expires
        ?? record.expiredAt
        ?? record.expired_at
      );
      const defaultServiceCode = provider === PHONE_SMS_PROVIDER_5SIM
        ? DEFAULT_FIVE_SIM_PRODUCT
        : (provider === PHONE_SMS_PROVIDER_NEXSMS ? DEFAULT_NEX_SMS_SERVICE_CODE : HERO_SMS_SERVICE_CODE);
      return {
        activationId,
        phoneNumber,
        provider,
        serviceCode: String(record.serviceCode || defaultServiceCode).trim() || defaultServiceCode,
        countryId: provider === PHONE_SMS_PROVIDER_5SIM
          ? countryCode
          : (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? normalizeNexSmsCountryId(record.countryId, 0)
              : normalizeCountryId(record.countryId, HERO_SMS_COUNTRY_ID)
          ),
        ...(provider === PHONE_SMS_PROVIDER_5SIM ? { countryCode } : {}),
        ...(countryLabel ? { countryLabel } : {}),
        successfulUses: normalizeUseCount(record.successfulUses),
        maxUses: Math.max(1, Math.floor(Number(record.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES)),
        ...(expiresAt > 0 ? { expiresAt } : {}),
        ...(statusAction ? { statusAction } : {}),
      };
    }

    function normalizeActivationPool(value = []) {
      const source = Array.isArray(value) ? value : [];
      const normalized = [];
      const seen = new Set();
      source.forEach((entry) => {
        const activation = normalizeActivation(entry);
        if (!activation) {
          return;
        }
        const key = buildActivationIdentityKey(activation);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        normalized.push(activation);
      });
      return normalized.slice(0, MAX_PHONE_REUSABLE_POOL);
    }

    function buildActivationIdentityKey(activation) {
      const normalized = normalizeActivation(activation);
      if (!normalized) {
        return '';
      }
      return [
        normalizePhoneSmsProvider(normalized.provider || ''),
        String(normalized.activationId || '').trim(),
        String(normalized.phoneNumber || '').trim(),
      ].join('::');
    }

    function isSameActivation(left, right) {
      const leftKey = buildActivationIdentityKey(left);
      const rightKey = buildActivationIdentityKey(right);
      return Boolean(leftKey && rightKey && leftKey === rightKey);
    }

    function rememberActivationAcquiredPrice(activation, price) {
      const key = buildActivationIdentityKey(activation);
      const normalizedPrice = normalizeHeroSmsPrice(price);
      if (!key || normalizedPrice === null || normalizedPrice <= 0) {
        return;
      }
      const roundedPrice = Math.round(normalizedPrice * 10000) / 10000;
      activationPriceHintsByKey.set(key, roundedPrice);
      while (activationPriceHintsByKey.size > MAX_ACTIVATION_PRICE_HINTS) {
        const oldest = activationPriceHintsByKey.keys().next();
        if (oldest?.done) {
          break;
        }
        activationPriceHintsByKey.delete(oldest.value);
      }
    }

    function getActivationAcquiredPriceHint(activation) {
      const key = buildActivationIdentityKey(activation);
      if (!key) {
        return null;
      }
      const raw = activationPriceHintsByKey.get(key);
      const normalizedPrice = normalizeHeroSmsPrice(raw);
      return normalizedPrice === null || normalizedPrice <= 0
        ? null
        : Math.round(normalizedPrice * 10000) / 10000;
    }

    function forgetActivationAcquiredPriceHint(activation) {
      const key = buildActivationIdentityKey(activation);
      if (!key) {
        return;
      }
      activationPriceHintsByKey.delete(key);
    }

    async function setPhoneRuntimeState(updates = {}) {
      await setState(updates);
      if (typeof broadcastDataUpdate === 'function') {
        broadcastDataUpdate(updates);
      }
    }

    function normalizeActivationFallback(record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return null;
      }

      const fallback = {};
      const provider = normalizePhoneSmsProvider(record.provider || '');
      const serviceCode = String(record.serviceCode || '').trim();
      const countryId = provider === PHONE_SMS_PROVIDER_5SIM
        ? normalizeFiveSimCountryCode(record.countryId || record.countryCode || '', '')
        : (
          provider === PHONE_SMS_PROVIDER_NEXSMS
            ? normalizeNexSmsCountryId(record.countryId, -1)
            : Math.floor(Number(record.countryId))
        );
      const countryLabel = String(record.countryLabel || '').trim();
      const statusAction = String(record.statusAction || '').trim();

      if (provider) {
        fallback.provider = provider;
      }
      if (serviceCode) {
        fallback.serviceCode = serviceCode;
      }
      if (
        (provider === PHONE_SMS_PROVIDER_5SIM && countryId)
        || (provider === PHONE_SMS_PROVIDER_NEXSMS && Number.isFinite(countryId) && countryId >= 0)
        || (
          provider !== PHONE_SMS_PROVIDER_5SIM
          && provider !== PHONE_SMS_PROVIDER_NEXSMS
          && Number.isFinite(countryId)
          && countryId > 0
        )
      ) {
        fallback.countryId = countryId;
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          fallback.countryCode = countryId;
        }
      }
      if (countryLabel) {
        fallback.countryLabel = countryLabel;
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
      const suffix = lastResponse ? ` Last provider status: ${lastResponse}` : '';
      return new Error(`${PHONE_CODE_TIMEOUT_ERROR_PREFIX}Timed out waiting for the phone verification code.${suffix}`);
    }

    function isPhoneCodeTimeoutError(error) {
      return String(error?.message || '').startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX);
    }

    function isPhoneResendThrottledError(error) {
      const message = String(error?.message || error || '').trim();
      if (!message) {
        return false;
      }
      if (message.startsWith(PHONE_RESEND_THROTTLED_ERROR_PREFIX)) {
        return true;
      }
      return /tried\s+to\s+resend\s+too\s+many\s+times|please\s+try\s+again\s+later|too\s+many\s+resend|resend\s+too\s+many|发送.*过于频繁|稍后再试/i.test(message);
    }

    function isPhoneRoute405RecoveryError(error) {
      const message = String(error?.message || error || '').trim();
      if (!message) {
        return false;
      }
      if (message.startsWith(PHONE_ROUTE_405_RECOVERY_FAILED_ERROR_PREFIX)) {
        return true;
      }
      return /route\s+error.*405|405\s+method\s+not\s+allowed|post\s+request\s+to\s+["']?\/phone-verification|did\s+not\s+provide\s+an?\s+[`'"]?action/i.test(message);
    }

    function isPhoneActivationOrderMissingError(error, provider = '') {
      const message = String(error?.message || error || '').trim();
      if (!message) {
        return false;
      }
      const normalizedProvider = normalizePhoneSmsProvider(provider);
      if (normalizedProvider === PHONE_SMS_PROVIDER_5SIM) {
        return /5sim\s+check\s+activation\s+failed.*order\s+not\s+found|order\s+not\s+found|activation\s+not\s+found|no\s+such\s+order/i.test(message);
      }
      return /activation\s+not\s+found|order\s+not\s+found|no\s+such\s+order/i.test(message);
    }

    function isStopRequestedError(error) {
      const message = String(error?.message || error || '').trim();
      if (!message) {
        return false;
      }
      return message === '流程已被用户停止。'
        || /已被用户停止/.test(message)
        || /flow\s+was\s+stopped|stopped\s+by\s+user/i.test(message);
    }

    function buildPhoneRestartStep7Error(phoneNumber = '') {
      const suffix = phoneNumber ? ` Current number: ${phoneNumber}.` : '';
      return new Error(
        `${PHONE_RESTART_STEP7_ERROR_PREFIX}Phone verification could not receive an SMS after resend. Restart step 7 with a new number.${suffix}`
      );
    }

    function sanitizePhoneCodeTimeoutError(error) {
      const message = String(error?.message || '');
      if (!message.startsWith(PHONE_CODE_TIMEOUT_ERROR_PREFIX)) {
        return error;
      }
      return new Error(message.slice(PHONE_CODE_TIMEOUT_ERROR_PREFIX.length).trim() || 'Timed out waiting for the phone verification code.');
    }

    function sanitizePhoneRestartStep7Error(error) {
      const message = String(error?.message || '');
      if (!message.startsWith(PHONE_RESTART_STEP7_ERROR_PREFIX)) {
        return error;
      }
      return new Error(
        message.slice(PHONE_RESTART_STEP7_ERROR_PREFIX.length).trim()
        || 'Phone verification could not receive an SMS after resend. Restart step 7 with a new number.'
      );
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

    function parseFiveSimPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    function describeFiveSimPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        const message = String(raw.message || raw.error || raw.msg || raw.statusText || '').trim();
        if (message) {
          return message;
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    async function fetchFiveSimPayload(config, path, actionLabel, options = {}) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;

      try {
        const requestUrl = new URL(path.replace(/^\/+/, ''), `${config.baseUrl.replace(/\/+$/, '')}/`);
        const query = (options && options.query && typeof options.query === 'object') ? options.query : {};
        Object.entries(query).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            return;
          }
          requestUrl.searchParams.set(key, String(value));
        });

        const response = await fetchImpl(requestUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal: controller?.signal,
        });
        const text = await response.text();
        const payload = parseFiveSimPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeFiveSimPayload(payload) || response.status}`);
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

    function parseNexSmsPayload(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return '';
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    function describeNexSmsPayload(raw) {
      if (typeof raw === 'string') {
        return raw.trim();
      }
      if (raw && typeof raw === 'object') {
        const message = String(raw.message || raw.error || raw.msg || raw.statusText || '').trim();
        if (message) {
          return message;
        }
        try {
          return JSON.stringify(raw);
        } catch {
          return String(raw);
        }
      }
      return String(raw || '').trim();
    }

    function isNexSmsSuccessPayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
      }
      return Number(payload.code) === 0;
    }

    async function fetchNexSmsPayload(config, path, actionLabel, options = {}) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), DEFAULT_PHONE_REQUEST_TIMEOUT_MS)
        : null;

      try {
        const method = String(options.method || 'GET').trim().toUpperCase() || 'GET';
        const requestUrl = new URL(path.replace(/^\/+/, ''), `${config.baseUrl.replace(/\/+$/, '')}/`);
        requestUrl.searchParams.set('apiKey', config.apiKey);
        const query = (options && options.query && typeof options.query === 'object') ? options.query : {};
        Object.entries(query).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            return;
          }
          requestUrl.searchParams.set(key, String(value));
        });
        const headers = {
          Accept: 'application/json',
          ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
        };
        const requestInit = {
          method,
          headers,
          signal: controller?.signal,
        };
        if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined) {
          requestInit.body = typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body);
          if (!requestInit.headers['Content-Type']) {
            requestInit.headers['Content-Type'] = 'application/json';
          }
        }
        const response = await fetchImpl(requestUrl.toString(), requestInit);
        const text = await response.text();
        const payload = parseNexSmsPayload(text);
        if (!response.ok) {
          const requestError = new Error(`${actionLabel} failed: ${describeNexSmsPayload(payload) || response.status}`);
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
      const provider = normalizePhoneSmsProvider(state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER);
      if (provider === PHONE_SMS_PROVIDER_5SIM) {
        const apiKey = normalizeApiKey(state.fiveSimApiKey || state.heroSmsApiKey);
        if (!apiKey) {
          throw new Error('5sim API key is missing. Save it in the side panel before running the phone flow.');
        }
        return {
          provider,
          apiKey,
          baseUrl: normalizeUrl(state.fiveSimBaseUrl, DEFAULT_FIVE_SIM_BASE_URL).replace(/\/+$/, ''),
          operator: normalizeFiveSimCountryCode(state.fiveSimOperator, DEFAULT_FIVE_SIM_OPERATOR),
          product: normalizeFiveSimCountryCode(state.fiveSimProduct, DEFAULT_FIVE_SIM_PRODUCT),
          countryCandidates: resolveFiveSimCountryCandidates(state),
        };
      }

      if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
        const apiKey = normalizeApiKey(state.nexSmsApiKey || state.heroSmsApiKey);
        if (!apiKey) {
          throw new Error('NexSMS API key is missing. Save it in the side panel before running the phone flow.');
        }
        return {
          provider,
          apiKey,
          baseUrl: normalizeUrl(state.nexSmsBaseUrl, DEFAULT_NEX_SMS_BASE_URL).replace(/\/+$/, ''),
          serviceCode: normalizeNexSmsServiceCode(state.nexSmsServiceCode, DEFAULT_NEX_SMS_SERVICE_CODE),
          countryCandidates: resolveNexSmsCountryCandidates(state),
        };
      }

      const apiKey = normalizeApiKey(state.heroSmsApiKey);
      if (!apiKey) {
        throw new Error('HeroSMS API key is missing. Save it in the side panel before running the phone flow.');
      }
      return {
        provider,
        apiKey,
        baseUrl: normalizeUrl(state.heroSmsBaseUrl, DEFAULT_HERO_SMS_BASE_URL),
        countryCandidates: resolveCountryCandidates(state),
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
            ...(
              normalizedFallback?.countryLabel || directActivation.countryLabel
                ? { countryLabel: normalizedFallback?.countryLabel || directActivation.countryLabel }
                : {}
            ),
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
            provider: normalizedFallback?.provider || PHONE_SMS_PROVIDER_HERO,
            serviceCode: normalizedFallback?.serviceCode || HERO_SMS_SERVICE_CODE,
            countryId: normalizedFallback?.countryId || HERO_SMS_COUNTRY_ID,
            ...(normalizedFallback?.countryLabel ? { countryLabel: normalizedFallback.countryLabel } : {}),
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
      const direct = Number(value);
      if (Number.isFinite(direct) && direct >= 0) {
        return direct;
      }

      const text = String(value ?? '').trim();
      if (!text) {
        return null;
      }

      // HeroSMS occasionally returns formatted price strings such as "$0.1183".
      // Extract the first decimal token so those tiers can still participate in
      // fallback selection and pricing diagnostics.
      const matched = text.match(/-?\d+(?:[.,]\d+)?/);
      if (!matched) {
        return null;
      }
      const normalizedText = String(matched[0] || '').replace(',', '.');
      const parsed = Number(normalizedText);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
      }
      return parsed;
    }

    function resolveHeroSmsStockState(payload = {}) {
      const stockCandidates = [
        payload.count,
        payload.physicalCount,
        payload.stock,
        payload.available,
        payload.quantity,
        payload.qty,
        payload.left,
        payload.free,
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      if (!stockCandidates.length) {
        return {
          hasStockField: false,
          stockCount: 0,
        };
      }
      return {
        hasStockField: true,
        stockCount: Math.max(...stockCandidates),
      };
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
        const stockState = resolveHeroSmsStockState(payload);
        if (!stockState.hasStockField || stockState.stockCount > 0) {
          candidates.push(cost);
        }
      }

      // Some HeroSMS responses expose price tiers as object keys:
      // { "0.05": { count: 0 }, "0.35": { count: 12 } }.
      // Parse those keyed tiers so higher-price stock is not missed.
      Object.entries(payload).forEach(([key, value]) => {
        const keyedPrice = normalizeHeroSmsPrice(key);
        if (keyedPrice === null) {
          return;
        }
        if (value && typeof value === 'object') {
          const stockState = resolveHeroSmsStockState(value);
          // Ignore numeric keys that are actually country/service IDs.
          // Keyed price tiers are considered valid only when stock fields exist.
          if (stockState.hasStockField && stockState.stockCount > 0) {
            candidates.push(keyedPrice);
          }
          return;
        }
        const numericCount = Number(value);
        if (Number.isFinite(numericCount) && numericCount > 0) {
          candidates.push(keyedPrice);
        }
      });

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

    function buildSortedUniquePriceCandidates(values = []) {
      return Array.from(
        new Set(
          values
            .map((value) => normalizeHeroSmsPrice(value))
            .filter((value) => value !== null)
            .map((value) => Math.round(value * 10000) / 10000)
        )
      )
        .sort((left, right) => left - right)
        .slice(0, MAX_PHONE_PRICE_CANDIDATES);
    }

    function isHeroSmsNoNumbersPayload(payload) {
      return /\bNO_NUMBERS\b/i.test(describeHeroSmsPayload(payload));
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

    function isHeroSmsTerminalError(payloadOrMessage) {
      const text = describeHeroSmsPayload(payloadOrMessage);
      return /\bNO_BALANCE\b|\bNOT_ENOUGH_BALANCE\b|\bBAD_KEY\b|\bINVALID_KEY\b|\bBANNED\b|\bACCOUNT_BANNED\b|\bWRONG_KEY\b/i.test(text);
    }

    function isProviderNoSupplyFailureMessage(message = '') {
      const text = String(message || '').trim();
      if (!text) {
        return false;
      }
      return /no\s+numbers\s+available\s+across|no\s+free\s+phones|numbers?\s+not\s+found|no\s+numbers\s+within\s+maxprice|step\s*9:\s*(?:5sim|nexsms)\s+countries\s+are\s+empty|\bNO_NUMBERS\b/i.test(text);
    }

    function resolveNoSupplyDiagnosticsContext(state = {}, providerOrder = []) {
      const order = Array.isArray(providerOrder) && providerOrder.length
        ? providerOrder
        : resolvePhoneProviderOrder(state, state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER);
      const heroCountryCount = resolveCountryCandidates(state).length;
      const fiveSimCountryCount = resolveFiveSimCountryCandidates(state).length;
      const nexSmsCountryCount = resolveNexSmsCountryCandidates(state).length;
      const maxPrice = normalizeHeroSmsPriceLimit(state?.heroSmsMaxPrice);
      const acquirePriority = normalizeHeroSmsAcquirePriority(state?.heroSmsAcquirePriority);
      return {
        order,
        heroCountryCount,
        fiveSimCountryCount,
        nexSmsCountryCount,
        maxPrice,
        acquirePriority,
      };
    }

    function formatNoSupplySuggestion(context = {}) {
      const suggestions = [];
      const maxPrice = Number(context?.maxPrice);
      if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
        suggestions.push('先设置价格上限（建议 >= 0.12）');
      } else if (maxPrice < 0.12) {
        suggestions.push('先提高价格上限（当前偏低）');
      }

      if ((context?.heroCountryCount || 0) <= 1) {
        suggestions.push('HeroSMS 增加国家回退');
      }
      if ((context?.fiveSimCountryCount || 0) <= 0) {
        suggestions.push('5sim 至少选择 1 个国家');
      }
      if ((context?.nexSmsCountryCount || 0) <= 0) {
        suggestions.push('NexSMS 至少选择 1 个国家');
      }
      if (String(context?.acquirePriority || '') === HERO_SMS_ACQUIRE_PRIORITY_COUNTRY) {
        suggestions.push('可尝试切到“价格优先”');
      }

      const unique = Array.from(new Set(suggestions));
      if (!unique.length) {
        return '优先提高价格上限，并调整服务商/国家优先级后重试';
      }
      return unique.slice(0, 3).join('；');
    }

    async function resetPhoneNoSupplyFailureStreak(state = {}) {
      const latestState = (typeof getState === 'function')
        ? (await getState().catch(() => state))
        : state;
      const current = Math.max(0, Math.floor(Number(latestState?.[PHONE_NO_SUPPLY_FAILURE_STREAK_STATE_KEY]) || 0));
      if (current > 0) {
        await setPhoneRuntimeState({
          [PHONE_NO_SUPPLY_FAILURE_STREAK_STATE_KEY]: 0,
        });
      }
    }

    async function logNoSupplyDiagnostics(state = {}, providerOrder = [], providerErrors = []) {
      const allNoSupply = Array.isArray(providerErrors)
        && providerErrors.length > 0
        && providerErrors.every((entry) => isProviderNoSupplyFailureMessage(entry));
      if (!allNoSupply) {
        await resetPhoneNoSupplyFailureStreak(state);
        return false;
      }

      const latestState = (typeof getState === 'function')
        ? (await getState().catch(() => state))
        : state;
      const previousStreak = Math.max(
        0,
        Math.floor(Number(latestState?.[PHONE_NO_SUPPLY_FAILURE_STREAK_STATE_KEY]) || 0)
      );
      const nextStreak = previousStreak + 1;
      await setPhoneRuntimeState({
        [PHONE_NO_SUPPLY_FAILURE_STREAK_STATE_KEY]: nextStreak,
      });

      const context = resolveNoSupplyDiagnosticsContext(
        latestState && typeof latestState === 'object' ? latestState : state,
        providerOrder
      );
      const maxPriceText = context.maxPrice === null ? '未设置' : String(context.maxPrice);
      const providerOrderText = context.order.join(' > ');
      const suggestion = formatNoSupplySuggestion(context);
      await addLog(
        `Step 9 diagnostics: 无号连续失败 ${nextStreak} 次；maxPrice=${maxPriceText}；providerOrder=${providerOrderText}；国家数 HeroSMS=${context.heroCountryCount}, 5sim=${context.fiveSimCountryCount}, NexSMS=${context.nexSmsCountryCount}。建议：${suggestion}。`,
        nextStreak >= 2 ? 'warn' : 'info'
      );
      return true;
    }

    async function resolveCheapestPhoneActivationPrice(config, countryConfig) {
      for (let attempt = 1; attempt <= DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const { payloads } = await fetchHeroSmsPricePayloads(config, countryConfig, { state });
          const price = findLowestHeroSmsPrice(
            payloads && payloads.length
              ? payloads
              : []
          );
          const normalizedPrice = Number.isFinite(Number(price)) ? Number(price) : null;
          if (normalizedPrice !== null) {
            return normalizedPrice;
          }
          const fallbackCandidates = buildSortedUniquePriceCandidates(
            (Array.isArray(payloads) ? payloads : [])
              .flatMap((payload) => collectHeroSmsPriceCandidatesIncludingZeroStock(payload, []))
          );
          if (fallbackCandidates.length > 0) {
            return fallbackCandidates[0];
          }
        } catch (_) {
          // Best-effort lookup only.
        }
      }
      return null;
    }

    async function persistHeroSmsPricePlanSnapshot(countryConfig, pricePlan) {
      if (typeof setState !== 'function') {
        return;
      }
      const prices = Array.isArray(pricePlan?.prices)
        ? pricePlan.prices.filter((price) => Number.isFinite(Number(price)))
        : [];
      const userLimit = pricePlan?.userLimit === null || pricePlan?.userLimit === undefined
        ? ''
        : String(pricePlan.userLimit);
      await setState({
        [HERO_SMS_LAST_PRICE_TIERS_KEY]: prices,
        [HERO_SMS_LAST_PRICE_COUNTRY_ID_KEY]: normalizeCountryId(countryConfig?.id, 0),
        [HERO_SMS_LAST_PRICE_COUNTRY_LABEL_KEY]: normalizeCountryLabel(countryConfig?.label, HERO_SMS_COUNTRY_LABEL),
        [HERO_SMS_LAST_PRICE_USER_LIMIT_KEY]: userLimit,
        [HERO_SMS_LAST_PRICE_AT_KEY]: Date.now(),
      });
    }

    async function resolvePhoneActivationPricePlan(config, countryConfig, state = {}) {
      for (let attempt = 1; attempt <= DEFAULT_PHONE_PRICE_LOOKUP_ATTEMPTS; attempt += 1) {
        try {
          const { payloads } = await fetchHeroSmsPricePayloads(config, countryConfig, { state });
          const plan = await resolveHeroSmsPricePlanFromPricePayloads(
            config,
            countryConfig,
            state,
            payloads
          );
          if (
            Array.isArray(plan?.prices)
            && plan.prices.length > 0
            && (
              plan.prices.some((price) => Number.isFinite(Number(price)) && Number(price) > 0)
              || plan.syntheticUserLimitProbe
            )
          ) {
            return plan;
          }
        } catch (_) {
          // best effort
        }
      }

      const fallbackPlan = {
        prices: [null],
        userLimit: null,
        minCatalogPrice: null,
        syntheticUserLimitProbe: false,
      };
      await persistHeroSmsPricePlanSnapshot(countryConfig, fallbackPlan);
      return fallbackPlan;
    }

    async function fetchPhoneActivationPayload(config, countryConfig, action, options = {}) {
      const query = {
        action,
        service: HERO_SMS_SERVICE_CODE,
        country: countryConfig.id,
      };
      if (options.maxPrice !== null && options.maxPrice !== undefined) {
        query.maxPrice = options.maxPrice;
        if (options.fixedPrice !== false) {
          query.fixedPrice = 'true';
        }
      }
      return fetchHeroSmsPayload(config, query, `HeroSMS ${action}`);
    }

    async function requestPhoneActivationWithPrice(config, countryConfig, action, maxPrice, options = {}) {
      let nextMaxPrice = maxPrice;
      let retriedWithUpdatedPrice = false;
      let retriedWithoutPrice = false;
      const userLimit = normalizeHeroSmsPriceLimit(options.userLimit);

      while (true) {
        try {
          return await fetchPhoneActivationPayload(config, countryConfig, action, {
            maxPrice: nextMaxPrice,
            fixedPrice: options.fixedPrice,
          });
        } catch (error) {
          const updatedMaxPrice = extractHeroSmsWrongMaxPrice(error?.payload || error?.message);
          if (
            nextMaxPrice !== null
            && nextMaxPrice !== undefined
            && !retriedWithUpdatedPrice
            && updatedMaxPrice !== null
          ) {
            if (userLimit !== null && updatedMaxPrice > userLimit) {
              throw new Error(
                `HeroSMS ${action} failed: WRONG_MAX_PRICE requires ${updatedMaxPrice}, which exceeds configured maxPrice=${userLimit}.`
              );
            }
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

    function collectFiveSimPriceCandidates(payload, candidates = []) {
      if (Array.isArray(payload)) {
        payload.forEach((entry) => collectFiveSimPriceCandidates(entry, candidates));
        return candidates;
      }
      if (!payload || typeof payload !== 'object') {
        return candidates;
      }
      const cost = Number(payload.cost);
      const count = Number(payload.count);
      if (Number.isFinite(cost) && cost > 0) {
        if (!Number.isFinite(count) || count > 0) {
          candidates.push(Math.round(cost * 10000) / 10000);
        }
      }
      Object.entries(payload).forEach(([key, value]) => {
        const keyedPrice = Number(key);
        if (!Number.isFinite(keyedPrice) || keyedPrice <= 0) {
          return;
        }
        if (value && typeof value === 'object') {
          const keyedCount = Number(value.count);
          if (!Number.isFinite(keyedCount) || keyedCount > 0) {
            candidates.push(Math.round(keyedPrice * 10000) / 10000);
          }
          return;
        }
        const numericCount = Number(value);
        if (!Number.isFinite(numericCount) || numericCount > 0) {
          candidates.push(Math.round(keyedPrice * 10000) / 10000);
        }
      });
      Object.values(payload).forEach((entry) => collectFiveSimPriceCandidates(entry, candidates));
      return candidates;
    }

    function findLowestFiveSimPrice(payload, product = DEFAULT_FIVE_SIM_PRODUCT, countryCode = '') {
      const normalizedProduct = normalizeFiveSimCountryCode(product, DEFAULT_FIVE_SIM_PRODUCT);
      const normalizedCountryCode = normalizeFiveSimCountryCode(countryCode, '');
      const root = payload && typeof payload === 'object'
        ? (payload[normalizedProduct] || payload)
        : {};
      const countryPayload = (
        normalizedCountryCode
          ? (root?.[normalizedCountryCode] || root)
          : root
      );
      const candidates = collectFiveSimPriceCandidates(countryPayload, []);
      if (!candidates.length) {
        return null;
      }
      return Math.min(...candidates);
    }

    function isFiveSimNoNumbersError(payloadOrMessage) {
      const text = describeFiveSimPayload(payloadOrMessage);
      return /no\s+free\s+phones|no\s+phones\s+available|no\s+numbers\s+available/i.test(text);
    }

    function isFiveSimTerminalError(payloadOrMessage, status = 0) {
      if (Number(status) === 401 || Number(status) === 403) {
        return true;
      }
      const text = describeFiveSimPayload(payloadOrMessage);
      return /not\s+enough\s+balance|no\s+balance|unauthorized|invalid\s+token|forbidden|bad\s+key|wrong\s+key|banned/i.test(text);
    }

    async function resolveFiveSimLowestPrice(config, countryCode) {
      try {
        const payload = await fetchFiveSimPayload(
          config,
          '/guest/prices',
          '5sim guest prices',
          {
            query: {
              country: countryCode,
              product: config.product,
            },
          }
        );
        return findLowestFiveSimPrice(payload, config.product, countryCode);
      } catch {
        return null;
      }
    }

    function parseFiveSimActivationPayload(payload, fallback = {}) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      const activationId = String(payload.id || payload.activationId || '').trim();
      const phoneNumber = String(payload.phone || payload.number || '').trim();
      if (!activationId || !phoneNumber) {
        return null;
      }

      const fallbackCountryCode = normalizeFiveSimCountryCode(
        fallback.countryCode || fallback.countryId || '',
        'thailand'
      );
      const countryCode = normalizeFiveSimCountryCode(
        payload.country || payload.country_name || payload.countryCode || payload.countryId || fallbackCountryCode,
        fallbackCountryCode
      );
      const countryLabel = String(
        payload.country_name
        || payload.countryName
        || payload.country
        || fallback.countryLabel
        || countryCode
      ).trim();

      return {
        activationId,
        phoneNumber,
        provider: PHONE_SMS_PROVIDER_5SIM,
        serviceCode: normalizeFiveSimCountryCode(payload.product || fallback.serviceCode || DEFAULT_FIVE_SIM_PRODUCT, DEFAULT_FIVE_SIM_PRODUCT),
        countryId: countryCode,
        countryCode,
        countryLabel: countryLabel || countryCode,
        successfulUses: normalizeUseCount(payload.successfulUses ?? fallback.successfulUses ?? 0),
        maxUses: Math.max(1, Math.floor(Number(payload.maxUses ?? fallback.maxUses) || DEFAULT_PHONE_NUMBER_MAX_USES)),
        ...(() => {
          const expiresAt = normalizeTimestampMs(
            payload.expiresAt
            ?? payload.expires
            ?? payload.expireAt
            ?? payload.expired_at
            ?? payload.expiredAt
            ?? fallback.expiresAt
          );
          return expiresAt > 0 ? { expiresAt } : {};
        })(),
      };
    }

    async function requestFiveSimActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      const allCountryCandidates = Array.isArray(config.countryCandidates) && config.countryCandidates.length
        ? config.countryCandidates
        : [];
      if (!allCountryCandidates.length) {
        throw new Error('Step 9: 5sim countries are empty. Please select at least one country in 接码设置。');
      }
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeFiveSimCountryCode(value, ''))
          .filter(Boolean)
      );
      let countryCandidates = allCountryCandidates.filter(
        (entry) => !blockedCountryIds.has(normalizeFiveSimCountryCode(entry.code || entry.id || '', ''))
      );
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }

      const maxPriceLimit = normalizeHeroSmsPriceLimit(state.heroSmsMaxPrice);
      const acquirePriority = normalizeHeroSmsAcquirePriority(state?.heroSmsAcquirePriority);
      const preferredPriceTier = normalizeHeroSmsPriceLimit(state?.heroSmsPreferredPrice);
      const countryPriceFloorByCountryCode = normalizeCountryPriceFloorMap(
        options?.countryPriceFloorByCountryId,
        (value) => normalizeFiveSimCountryCode(value, '')
      );
      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(state?.heroSmsActivationRetryRounds);
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(state?.heroSmsActivationRetryDelayMs);

      let finalNoNumbersByCountry = [];
      let finalLastError = null;

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: 5sim acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }
        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;

        let orderedCountryCandidates = [...countryCandidates];
        if (
          (acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE || acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH)
          && countryCandidates.length > 1
        ) {
          const rankedCandidates = [];
          for (const [index, countryConfig] of countryCandidates.entries()) {
            const countryCode = normalizeFiveSimCountryCode(countryConfig.code || countryConfig.id || '', 'thailand');
            const lowestPrice = await resolveFiveSimLowestPrice(config, countryCode);
            rankedCandidates.push({
              index,
              countryConfig,
              lowestPrice: Number.isFinite(Number(lowestPrice)) ? Number(lowestPrice) : null,
            });
          }
          rankedCandidates.sort((left, right) => {
            const leftPrice = left.lowestPrice;
            const rightPrice = right.lowestPrice;
            const leftHasPrice = Number.isFinite(leftPrice);
            const rightHasPrice = Number.isFinite(rightPrice);
            if (leftHasPrice && rightHasPrice && leftPrice !== rightPrice) {
              return acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH
                ? (rightPrice - leftPrice)
                : (leftPrice - rightPrice);
            }
            if (leftHasPrice !== rightHasPrice) {
              return leftHasPrice ? -1 : 1;
            }
            return left.index - right.index;
          });
          orderedCountryCandidates = rankedCandidates.map((entry) => entry.countryConfig);
          const rankedSummary = rankedCandidates
            .map((entry) => {
              const countryCode = normalizeFiveSimCountryCode(entry.countryConfig.code || entry.countryConfig.id || '', 'thailand');
              const countryLabel = String(entry.countryConfig.label || countryCode).trim() || countryCode;
              return Number.isFinite(entry.lowestPrice)
                ? `${countryLabel}:${entry.lowestPrice}`
                : `${countryLabel}:n/a`;
            })
            .join(' | ');
          await addLog(`Step 9: 5sim price-priority ranking: ${rankedSummary}`, 'info');
        }

        for (const countryConfig of orderedCountryCandidates) {
          const countryCode = normalizeFiveSimCountryCode(countryConfig.code || countryConfig.id || '', 'thailand');
          const countryLabel = String(countryConfig.label || countryCode).trim() || countryCode;
          const countryPriceFloor = countryPriceFloorByCountryCode.get(countryCode) ?? null;
          try {
            let guestPricesPayload = null;
            try {
              guestPricesPayload = await fetchFiveSimPayload(
                config,
                '/guest/prices',
                '5sim guest prices',
                {
                  query: {
                    country: countryCode,
                    product: config.product,
                  },
                }
              );
            } catch (_) {
              guestPricesPayload = null;
            }

            const rawPriceCandidates = buildSortedUniquePriceCandidates(
              collectFiveSimPriceCandidates(
                (
                  guestPricesPayload
                  && typeof guestPricesPayload === 'object'
                  && !Array.isArray(guestPricesPayload)
                  ? (guestPricesPayload?.[config.product]?.[countryCode] || guestPricesPayload?.[countryCode] || guestPricesPayload)
                  : guestPricesPayload
                ),
                []
              )
            );
            const boundedPriceCandidates = maxPriceLimit === null
              ? rawPriceCandidates
              : rawPriceCandidates.filter((price) => Number(price) <= maxPriceLimit);
            const orderedPricesFromCatalog = reorderPriceCandidates(
              boundedPriceCandidates,
              acquirePriority,
              preferredPriceTier
            );
            const orderedPrices = orderedPricesFromCatalog.length
              ? orderedPricesFromCatalog
              : (maxPriceLimit !== null ? [maxPriceLimit] : [null]);
            const floorFilteredPrices = filterPriceCandidatesAboveFloor(orderedPrices, countryPriceFloor);
            const hasCountryPriceFloor = (
              countryPriceFloor !== null
              && Number.isFinite(Number(countryPriceFloor))
              && Number(countryPriceFloor) > 0
            );
            const hasAlternativeCountries = orderedCountryCandidates.some((entry) => (
              normalizeFiveSimCountryCode(entry.code || entry.id || '', '')
              !== normalizeFiveSimCountryCode(countryConfig.code || countryConfig.id || '', '')
            ));
            // When a floor is set (e.g. timeout on current tier), do NOT fall back to the
            // original lowest-tier list; that would retry the same tier forever and block
            // country/provider fallback.
            const pricesToTry = hasCountryPriceFloor
              ? (
                floorFilteredPrices.length
                  ? floorFilteredPrices
                  : (hasAlternativeCountries ? [] : orderedPrices.slice(0, 1))
              )
              : (floorFilteredPrices.length ? floorFilteredPrices : orderedPrices);

            if (!pricesToTry.length) {
              const lowestCatalog = rawPriceCandidates.length ? rawPriceCandidates[0] : null;
              if (
                maxPriceLimit !== null
                && lowestCatalog !== null
                && Number(lowestCatalog) > Number(maxPriceLimit)
              ) {
                noNumbersByCountry.push(
                  `${countryLabel}: no numbers within maxPrice=${maxPriceLimit}; lowest listed=${lowestCatalog}`
                );
              } else if (countryPriceFloor !== null && boundedPriceCandidates.length) {
                noNumbersByCountry.push(
                  `${countryLabel}: no higher price tier above ${countryPriceFloor} for current fallback attempt`
                );
              } else if (rawPriceCandidates.length) {
                const tierText = rawPriceCandidates.join(', ');
                noNumbersByCountry.push(`${countryLabel}: all visible price tiers unavailable (${tierText})`);
                retryableNoNumberCountries.push(countryLabel);
              } else {
                noNumbersByCountry.push(`${countryLabel}: no free phones`);
                retryableNoNumberCountries.push(countryLabel);
              }
              continue;
            }

            let acquiredActivation = null;
            let countryNoNumbersText = '';
            for (const candidatePrice of pricesToTry) {
              try {
                const payload = await fetchFiveSimPayload(
                  config,
                  `/user/buy/activation/${countryCode}/${config.operator}/${config.product}`,
                  '5sim buy activation',
                  {
                    query: {
                      ...(candidatePrice !== null && candidatePrice !== undefined ? { maxPrice: candidatePrice } : {}),
                      ...(normalizeHeroSmsReuseEnabled(state.heroSmsReuseEnabled) ? { reuse: 1 } : {}),
                    },
                  }
                );
                const activation = parseFiveSimActivationPayload(payload, {
                  countryCode,
                  countryLabel,
                  serviceCode: config.product,
                });
                if (activation) {
                  const priceValue = Number(candidatePrice);
                  rememberActivationAcquiredPrice(activation, priceValue);
                  acquiredActivation = activation;
                  break;
                }
                const payloadText = describeFiveSimPayload(payload);
                if (isFiveSimNoNumbersError(payload)) {
                  countryNoNumbersText = payloadText || countryNoNumbersText || 'no free phones';
                  continue;
                }
                if (isFiveSimTerminalError(payload)) {
                  throw new Error(`5sim buy activation failed: ${payloadText || 'empty response'}`);
                }
                lastError = new Error(`5sim buy activation failed: ${payloadText || 'empty response'}`);
              } catch (error) {
                if (isFiveSimTerminalError(error?.payload || error?.message, error?.status)) {
                  throw new Error(`5sim buy activation failed: ${describeFiveSimPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
                }
                if (isFiveSimNoNumbersError(error?.payload || error?.message)) {
                  countryNoNumbersText = describeFiveSimPayload(error?.payload || error?.message) || countryNoNumbersText || 'no free phones';
                  continue;
                }
                lastError = error;
              }
            }

            if (acquiredActivation) {
              return acquiredActivation;
            }

            const lowestPrice = rawPriceCandidates.length ? rawPriceCandidates[0] : await resolveFiveSimLowestPrice(config, countryCode);
            if (maxPriceLimit !== null && lowestPrice !== null && Number(lowestPrice) > Number(maxPriceLimit)) {
              noNumbersByCountry.push(
                `${countryLabel}: no numbers within maxPrice=${maxPriceLimit}; lowest listed=${lowestPrice}`
              );
            } else {
              noNumbersByCountry.push(`${countryLabel}: ${countryNoNumbersText || 'no free phones'}`);
              retryableNoNumberCountries.push(countryLabel);
            }
            continue;
          } catch (error) {
            if (isFiveSimTerminalError(error?.payload || error?.message, error?.status)) {
              throw new Error(`5sim buy activation failed: ${describeFiveSimPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
            }
            if (isFiveSimNoNumbersError(error?.payload || error?.message)) {
              const lowestPrice = await resolveFiveSimLowestPrice(config, countryCode);
              if (maxPriceLimit !== null && lowestPrice !== null && lowestPrice > maxPriceLimit) {
                noNumbersByCountry.push(
                  `${countryLabel}: no numbers within maxPrice=${maxPriceLimit}; lowest listed=${lowestPrice}`
                );
              } else {
                noNumbersByCountry.push(`${countryLabel}: ${describeFiveSimPayload(error?.payload || error?.message) || 'no free phones'}`);
                retryableNoNumberCountries.push(countryLabel);
              }
              continue;
            }
            lastError = error;
          }
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: 5sim has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `5sim no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error('5sim failed to acquire a phone number.');
    }

    function isNexSmsNoNumbersError(payloadOrMessage) {
      const text = describeNexSmsPayload(payloadOrMessage);
      return /numbers?\s+not\s+found|暂无可用|no\s+numbers|no\s+stock|库存.*0|not\s+available/i.test(text);
    }

    function isNexSmsPendingMessage(payloadOrMessage) {
      const text = describeNexSmsPayload(payloadOrMessage);
      return /no\s+sms|暂无短信|waiting|not\s+arrived|empty|未收到|短信为空|no\s+records/i.test(text);
    }

    function isNexSmsTerminalError(payloadOrMessage, status = 0) {
      if (Number(status) === 401 || Number(status) === 403) {
        return true;
      }
      const text = describeNexSmsPayload(payloadOrMessage);
      return /invalid\s*api\s*key|bad[_\s-]*key|wrong[_\s-]*key|unauthorized|forbidden|no\s*balance|insufficient\s*balance|余额不足|账号.*封禁|banned/i.test(text);
    }

    function collectNexSmsPriceCandidates(countryData = {}) {
      const candidates = [];
      const pushCandidate = (value) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
          candidates.push(Math.round(numeric * 10000) / 10000);
        }
      };

      pushCandidate(countryData.minPrice);
      pushCandidate(countryData.medianPrice);
      pushCandidate(countryData.maxPrice);

      if (countryData.priceMap && typeof countryData.priceMap === 'object') {
        Object.entries(countryData.priceMap).forEach(([priceKey, count]) => {
          const availableCount = Number(count);
          if (!Number.isFinite(availableCount) || availableCount <= 0) {
            return;
          }
          pushCandidate(priceKey);
        });
      }

      return buildSortedUniquePriceCandidates(candidates);
    }

    async function resolveNexSmsCountryPricePlan(config, countryConfig, state = {}) {
      const countryId = normalizeNexSmsCountryId(countryConfig?.id, -1);
      if (countryId < 0) {
        throw new Error(`NexSMS countryId is invalid: ${countryConfig?.id}`);
      }
      const payload = await fetchNexSmsPayload(
        config,
        '/api/getCountryByService',
        'NexSMS getCountryByService',
        {
          query: {
            serviceCode: config.serviceCode,
            countryId,
          },
        }
      );
      if (!isNexSmsSuccessPayload(payload)) {
        throw new Error(`NexSMS getCountryByService failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
      }
      const countryData = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? (payload.data || {})
        : {};
      const countryLabel = normalizeCountryLabel(
        countryData.countryName || countryConfig?.label,
        `Country #${countryId}`
      );
      const prices = collectNexSmsPriceCandidates(countryData);
      const minCatalogPrice = prices.length
        ? prices[0]
        : (() => {
          const minPrice = Number(countryData.minPrice);
          return Number.isFinite(minPrice) && minPrice > 0
            ? Math.round(minPrice * 10000) / 10000
            : null;
        })();
      const userLimit = normalizeHeroSmsPriceLimit(state?.heroSmsMaxPrice);
      const filteredPrices = userLimit === null
        ? prices
        : prices.filter((price) => price <= userLimit);

      return {
        countryId,
        countryLabel,
        prices: filteredPrices,
        userLimit,
        minCatalogPrice,
        rawPayload: payload,
      };
    }

    function parseNexSmsActivationPayload(payload, fallback = {}) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      if (!isNexSmsSuccessPayload(payload)) {
        return null;
      }
      const data = payload.data || {};
      const phoneCandidates = Array.isArray(data.phoneNumbers)
        ? data.phoneNumbers
        : (Array.isArray(data.numbers) ? data.numbers : []);
      const phoneNumber = String(
        data.phoneNumber
        || data.phone
        || phoneCandidates[0]
        || fallback.phoneNumber
        || ''
      ).trim();
      if (!phoneNumber) {
        return null;
      }
      const countryId = normalizeNexSmsCountryId(
        data.countryId ?? fallback.countryId,
        0
      );
      const countryLabel = normalizeCountryLabel(
        data.countryName || fallback.countryLabel,
        `Country #${countryId}`
      );
      const serviceCode = normalizeNexSmsServiceCode(
        data.serviceCode || fallback.serviceCode || DEFAULT_NEX_SMS_SERVICE_CODE,
        DEFAULT_NEX_SMS_SERVICE_CODE
      );
      return {
        activationId: phoneNumber,
        phoneNumber,
        provider: PHONE_SMS_PROVIDER_NEXSMS,
        serviceCode,
        countryId,
        countryLabel,
        successfulUses: normalizeUseCount(fallback.successfulUses ?? 0),
        maxUses: 1,
      };
    }

    async function requestNexSmsActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      const allCountryCandidates = Array.isArray(config.countryCandidates) && config.countryCandidates.length
        ? config.countryCandidates
        : resolveNexSmsCountryCandidates(state);
      if (!allCountryCandidates.length) {
        throw new Error('Step 9: NexSMS countries are empty. Please select at least one country in 接码设置。');
      }
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeNexSmsCountryId(value, -1))
          .filter((id) => id >= 0)
      );
      let countryCandidates = allCountryCandidates.filter((entry) => {
        const id = normalizeNexSmsCountryId(entry.id, -1);
        return id >= 0 && !blockedCountryIds.has(id);
      });
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }

      const acquirePriority = normalizeHeroSmsAcquirePriority(state?.heroSmsAcquirePriority);
      const preferredPriceTier = normalizeHeroSmsPriceLimit(state?.heroSmsPreferredPrice);
      const countryPriceFloorByCountryId = normalizeCountryPriceFloorMap(
        options?.countryPriceFloorByCountryId,
        (value) => String(normalizeNexSmsCountryId(value, -1))
      );
      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(state?.heroSmsActivationRetryRounds);
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(state?.heroSmsActivationRetryDelayMs);
      let finalNoNumbersByCountry = [];
      let finalLastError = null;

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: NexSMS acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }

        const candidateAttempts = [];
        for (const [index, countryConfig] of countryCandidates.entries()) {
          candidateAttempts.push({
            index,
            countryConfig,
            pricePlan: null,
            orderingPrice: Number.POSITIVE_INFINITY,
          });
        }

        if (
          (acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE || acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH)
          && candidateAttempts.length > 1
        ) {
          for (const attempt of candidateAttempts) {
            try {
              const pricePlan = await resolveNexSmsCountryPricePlan(config, attempt.countryConfig, state);
              attempt.pricePlan = pricePlan;
              const orderedForRanking = reorderPriceCandidates(pricePlan.prices, acquirePriority, preferredPriceTier);
              attempt.orderingPrice = Array.isArray(orderedForRanking) && orderedForRanking.length
                ? Number(orderedForRanking[0])
                : Number.POSITIVE_INFINITY;
            } catch (error) {
              attempt.pricePlan = null;
              attempt.orderingPrice = Number.POSITIVE_INFINITY;
              attempt.lookupError = error;
            }
          }
          candidateAttempts.sort((left, right) => {
            if (left.orderingPrice !== right.orderingPrice) {
              return acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH
                ? (right.orderingPrice - left.orderingPrice)
                : (left.orderingPrice - right.orderingPrice);
            }
            return left.index - right.index;
          });
          const rankingSummary = candidateAttempts.map((attempt) => {
            const id = normalizeNexSmsCountryId(attempt.countryConfig.id, -1);
            const label = String(attempt.countryConfig.label || `Country #${id}`).trim() || `Country #${id}`;
            return Number.isFinite(attempt.orderingPrice)
              ? `${label}:${attempt.orderingPrice}`
              : `${label}:n/a`;
          }).join(' | ');
          await addLog(`Step 9: NexSMS price-priority ranking: ${rankingSummary}`, 'info');
        }

        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;

        for (const attempt of candidateAttempts) {
          const countryId = normalizeNexSmsCountryId(attempt.countryConfig.id, -1);
          const countryLabel = normalizeCountryLabel(attempt.countryConfig.label, `Country #${countryId}`);
          const countryPriceFloor = countryPriceFloorByCountryId.get(String(countryId)) ?? null;
          let pricePlan = attempt.pricePlan;
          if (!pricePlan) {
            try {
              pricePlan = await resolveNexSmsCountryPricePlan(config, attempt.countryConfig, state);
            } catch (error) {
              if (isNexSmsTerminalError(error?.payload || error?.message, error?.status)) {
                throw new Error(`NexSMS price lookup failed: ${describeNexSmsPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
              }
              lastError = error;
              continue;
            }
          }

          if (!Array.isArray(pricePlan.prices) || !pricePlan.prices.length) {
            if (
              pricePlan.userLimit !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.minCatalogPrice > pricePlan.userLimit
            ) {
              noNumbersByCountry.push(
                `${countryLabel}: no numbers within maxPrice=${pricePlan.userLimit}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else {
              const reason = describeNexSmsPayload(pricePlan.rawPayload) || 'no price candidates';
              noNumbersByCountry.push(`${countryLabel}: ${reason}`);
              retryableNoNumberCountries.push(countryLabel);
            }
            continue;
          }

            const orderedPrices = reorderPriceCandidates(pricePlan.prices, acquirePriority, preferredPriceTier);
            const floorFilteredPrices = filterPriceCandidatesAboveFloor(orderedPrices, countryPriceFloor);
            const hasCountryPriceFloor = (
              countryPriceFloor !== null
              && Number.isFinite(Number(countryPriceFloor))
              && Number(countryPriceFloor) > 0
            );
            const hasAlternativeCountries = candidateAttempts.some((entry) => (
              normalizeNexSmsCountryId(entry?.countryConfig?.id, -1)
              !== normalizeNexSmsCountryId(attempt?.countryConfig?.id, -1)
            ));
            // With an explicit floor, only try higher tiers. If none exist, we should
            // move to country/provider fallback instead of retrying the same tier again.
            const pricesToTry = hasCountryPriceFloor
              ? (
                floorFilteredPrices.length
                  ? floorFilteredPrices
                  : (hasAlternativeCountries ? [] : orderedPrices.slice(0, 1))
              )
              : (floorFilteredPrices.length ? floorFilteredPrices : orderedPrices);
            if (!pricesToTry.length) {
              if (
                countryPriceFloor !== null
                && Array.isArray(pricePlan.prices)
                && pricePlan.prices.length > 0
              ) {
                noNumbersByCountry.push(
                  `${countryLabel}: no higher price tier above ${countryPriceFloor} for current fallback attempt`
                );
              } else {
                noNumbersByCountry.push(`${countryLabel}: ${describeNexSmsPayload(pricePlan.rawPayload) || 'no numbers found'}`);
                retryableNoNumberCountries.push(countryLabel);
              }
              continue;
            }
            for (const price of pricesToTry) {
            try {
              const payload = await fetchNexSmsPayload(
                config,
                '/api/order/purchase',
                'NexSMS purchase',
                {
                  method: 'POST',
                  body: {
                    serviceCode: config.serviceCode,
                    countryId,
                    quantity: 1,
                    price,
                  },
                }
              );
              if (!isNexSmsSuccessPayload(payload)) {
                if (isNexSmsNoNumbersError(payload)) {
                  continue;
                }
                if (isNexSmsTerminalError(payload)) {
                  throw new Error(`NexSMS purchase failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
                }
                lastError = new Error(`NexSMS purchase failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
                continue;
              }
              const activation = parseNexSmsActivationPayload(payload, {
                countryId,
                countryLabel,
                serviceCode: config.serviceCode,
              });
              if (!activation) {
                lastError = new Error('NexSMS purchase succeeded but did not return a phone number.');
                continue;
              }
              const numericPrice = Number(price);
              rememberActivationAcquiredPrice(activation, numericPrice);
              return activation;
            } catch (error) {
              if (isNexSmsTerminalError(error?.payload || error?.message, error?.status)) {
                throw new Error(`NexSMS purchase failed: ${describeNexSmsPayload(error?.payload || error?.message) || 'unknown terminal error'}`);
              }
              if (isNexSmsNoNumbersError(error?.payload || error?.message)) {
                continue;
              }
              lastError = error;
            }
          }

          const fallbackReason = describeNexSmsPayload(pricePlan.rawPayload) || 'no numbers found';
          noNumbersByCountry.push(`${countryLabel}: ${fallbackReason}`);
          retryableNoNumberCountries.push(countryLabel);
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: NexSMS has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `NexSMS no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error('NexSMS failed to acquire a phone number.');
    }

    async function requestPhoneActivation(state = {}, options = {}) {
      const config = resolvePhoneConfig(state);
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        return requestFiveSimActivation(state, options);
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return requestNexSmsActivation(state, options);
      }
      const allCountryCandidates = Array.isArray(config.countryCandidates) && config.countryCandidates.length
        ? config.countryCandidates
        : resolveCountryCandidates(state);
      if (!allCountryCandidates.length) {
        throw new Error('Step 9: HeroSMS countries are empty. Please select at least one country in 接码设置。');
      }
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeCountryId(value, 0))
          .filter((id) => id > 0)
      );
      let countryCandidates = allCountryCandidates.filter(
        (entry) => !blockedCountryIds.has(normalizeCountryId(entry.id, 0))
      );
      if (!countryCandidates.length) {
        countryCandidates = allCountryCandidates;
        if (blockedCountryIds.size) {
          await addLog(
            'Step 9: all selected countries reached the temporary SMS-failure skip threshold, lifting skip for this acquire round.',
            'warn'
          );
        }
      }
      const acquirePriority = normalizeHeroSmsAcquirePriority(state?.heroSmsAcquirePriority);
      const preferredPriceTier = normalizeHeroSmsPriceLimit(state?.heroSmsPreferredPrice);
      const countryPriceFloorByCountryId = normalizeCountryPriceFloorMap(
        options?.countryPriceFloorByCountryId,
        (value) => String(normalizeCountryId(value, 0))
      );
      const requestActions = ['getNumber', 'getNumberV2'];
      const configuredAcquireRounds = normalizePhoneActivationRetryRounds(
        state?.heroSmsActivationRetryRounds
      );
      const maxAcquireRounds = Math.max(2, configuredAcquireRounds);
      const retryDelayMs = normalizePhoneActivationRetryDelayMs(
        state?.heroSmsActivationRetryDelayMs
      );

      let finalNoNumbersByCountry = [];
      let finalLastError = null;
      let finalLastFailureText = '';

      for (let round = 1; round <= maxAcquireRounds; round += 1) {
        if (maxAcquireRounds > 1) {
          await addLog(
            `Step 9: HeroSMS acquiring phone number (round ${round}/${maxAcquireRounds})...`,
            'info'
          );
        }

        const countryAttempts = countryCandidates.map((countryConfig, index) => ({
          index,
          countryConfig,
          pricePlan: null,
          orderingPrice: Number.POSITIVE_INFINITY,
        }));

        if (
          acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE
          || acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH
        ) {
          for (const attempt of countryAttempts) {
            const pricePlan = await resolvePhoneActivationPricePlan(config, attempt.countryConfig, state);
            const orderedPrices = reorderPriceCandidates(pricePlan?.prices, acquirePriority, preferredPriceTier);
            const numericPrices = Array.isArray(orderedPrices)
              ? orderedPrices
                  .map((value) => Number(value))
                  .filter((value) => Number.isFinite(value) && value > 0)
              : [];
            const candidateOrderingPrice = numericPrices.length ? numericPrices[0] : null;
            const cappedByUserLimit = (
              pricePlan?.userLimit !== null
              && pricePlan?.userLimit !== undefined
              && pricePlan?.minCatalogPrice !== null
              && pricePlan?.minCatalogPrice !== undefined
              && Number(pricePlan.minCatalogPrice) > Number(pricePlan.userLimit)
            );
            attempt.pricePlan = pricePlan;
            attempt.orderingPrice = cappedByUserLimit
              ? Number.POSITIVE_INFINITY
              : (candidateOrderingPrice !== null ? candidateOrderingPrice : Number.POSITIVE_INFINITY);
          }
        }

        if (
          (acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE || acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH)
          && countryAttempts.length > 1
        ) {
          countryAttempts.sort((left, right) => {
            if (left.orderingPrice !== right.orderingPrice) {
              return acquirePriority === HERO_SMS_ACQUIRE_PRIORITY_PRICE_HIGH
                ? (right.orderingPrice - left.orderingPrice)
                : (left.orderingPrice - right.orderingPrice);
            }
            return left.index - right.index;
          });
        }

        const noNumbersByCountry = [];
        const retryableNoNumberCountries = [];
        let lastError = null;
        let lastFailureText = '';

        for (const attempt of countryAttempts) {
          const countryConfig = attempt.countryConfig;
          const countryIdKey = String(normalizeCountryId(countryConfig?.id, 0));
          const countryPriceFloor = countryPriceFloorByCountryId.get(countryIdKey) ?? null;
          const buildFallbackActivation = (requestAction) => ({
            countryId: countryConfig.id,
            ...(requestAction === 'getNumberV2' ? { statusAction: 'getStatusV2' } : {}),
          });
          const pricePlan = attempt.pricePlan || await resolvePhoneActivationPricePlan(config, countryConfig, state);
          let noNumbersObservedInCountry = false;

          const orderedPrices = reorderPriceCandidates(pricePlan.prices, acquirePriority, preferredPriceTier);
          const floorFilteredPrices = filterPriceCandidatesAboveFloor(orderedPrices, countryPriceFloor);
          const hasCountryPriceFloor = (
            countryPriceFloor !== null
            && Number.isFinite(Number(countryPriceFloor))
            && Number(countryPriceFloor) > 0
          );
          const hasAlternativeCountries = countryAttempts.some((entry) => (
            String(normalizeCountryId(entry?.countryConfig?.id, 0))
            !== String(normalizeCountryId(countryConfig?.id, 0))
          ));
          // Same rule as 5sim/NexSMS: once floor is set, never re-try lower/equal tiers.
          // Keep a probe fallback only for HeroSMS (single-country/no-tier environments),
          // so replacement-limit behavior remains stable while still allowing country fallback.
          const pricesToTry = hasCountryPriceFloor
            ? (
              floorFilteredPrices.length
                ? floorFilteredPrices
                : (hasAlternativeCountries ? [] : orderedPrices.slice(0, 1))
            )
            : (floorFilteredPrices.length ? floorFilteredPrices : orderedPrices);
          const rawTierText = Array.isArray(pricePlan?.prices) && pricePlan.prices.length
            ? pricePlan.prices
                .map((value) => (value === null || value === undefined ? 'auto' : String(value)))
                .join(', ')
            : 'none';
          await addLog(
            `Step 9: HeroSMS ${countryConfig.label} price plan resolved -> tiers=[${rawTierText}], userLimit=${pricePlan?.userLimit ?? 'none'}, minCatalog=${pricePlan?.minCatalogPrice ?? 'n/a'}.`,
            'info'
          );
          if (pricesToTry.length > 1 || countryPriceFloor !== null) {
            const tierText = pricesToTry
              .map((value) => (value === null || value === undefined ? 'auto' : String(value)))
              .join(', ');
            await addLog(
              `Step 9: HeroSMS ${countryConfig.label} price candidates: ${tierText}${countryPriceFloor !== null ? ` (floor>${countryPriceFloor})` : ''}.`,
              'info'
            );
          }
          if (!pricesToTry.length) {
            if (
              countryPriceFloor !== null
              && Array.isArray(pricePlan.prices)
              && pricePlan.prices.length > 0
            ) {
              noNumbersByCountry.push(
                `${countryConfig.label}: no higher price tier above ${countryPriceFloor} for current fallback attempt`
              );
              continue;
            }
            if (
              pricePlan.userLimit !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.minCatalogPrice > pricePlan.userLimit
            ) {
              noNumbersByCountry.push(
                `${countryConfig.label}: no numbers within maxPrice=${pricePlan.userLimit}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else {
              noNumbersByCountry.push(
                `${countryConfig.label}: ${lastFailureText || 'NO_NUMBERS'}`
              );
              retryableNoNumberCountries.push(countryConfig.label);
            }
            continue;
          }
          for (const maxPrice of pricesToTry) {
            for (const requestAction of requestActions) {
              try {
                const fixedPrice = !Boolean(pricePlan.syntheticUserLimitProbe);
                await addLog(
                  `Step 9: HeroSMS ${countryConfig.label} trying ${requestAction} at tier ${maxPrice === null || maxPrice === undefined ? 'auto' : maxPrice}.`,
                  'info'
                );
                const payload = await requestPhoneActivationWithPrice(
                  config,
                  countryConfig,
                  requestAction,
                  maxPrice,
                  {
                    userLimit: pricePlan.userLimit,
                    fixedPrice,
                  }
                );
                const activation = parseActivationPayload(payload, buildFallbackActivation(requestAction));
                if (activation) {
                  const numericPrice = Number(maxPrice);
                  rememberActivationAcquiredPrice(activation, numericPrice);
                  return {
                    ...activation,
                    countryId: countryConfig.id,
                  };
                }
                const payloadText = describeHeroSmsPayload(payload);
                if (isHeroSmsNoNumbersPayload(payload)) {
                  noNumbersObservedInCountry = true;
                  lastFailureText = payloadText || lastFailureText;
                  continue;
                }
                if (isHeroSmsTerminalError(payload)) {
                  throw new Error(`HeroSMS ${requestAction} failed: ${payloadText || 'empty response'}`);
                }
                lastFailureText = payloadText || lastFailureText;
                lastError = new Error(`HeroSMS ${requestAction} failed: ${payloadText || 'empty response'}`);
              } catch (error) {
                const payloadOrMessage = error?.payload || error?.message;
                if (isHeroSmsTerminalError(payloadOrMessage)) {
                  throw new Error(`HeroSMS ${requestAction} failed: ${describeHeroSmsPayload(payloadOrMessage) || 'empty response'}`);
                }
                if (isHeroSmsNoNumbersPayload(payloadOrMessage)) {
                  noNumbersObservedInCountry = true;
                  lastFailureText = describeHeroSmsPayload(payloadOrMessage) || lastFailureText;
                  continue;
                }
                lastFailureText = describeHeroSmsPayload(payloadOrMessage) || lastFailureText;
                lastError = error;
              }
            }
          }

          if (noNumbersObservedInCountry) {
            const tiersTriedText = pricesToTry
              .map((value) => (value === null || value === undefined ? 'auto' : String(value)))
              .join(', ');
            if (
              pricePlan.userLimit !== null
              && pricePlan.minCatalogPrice !== null
              && pricePlan.minCatalogPrice > pricePlan.userLimit
            ) {
              noNumbersByCountry.push(
                `${countryConfig.label}: no numbers within maxPrice=${pricePlan.userLimit}; lowest listed=${pricePlan.minCatalogPrice}`
              );
            } else {
              noNumbersByCountry.push(
                `${countryConfig.label}: ${lastFailureText || 'NO_NUMBERS'}${tiersTriedText ? ` (tiers tried: ${tiersTriedText})` : ''}`
              );
              retryableNoNumberCountries.push(countryConfig.label);
            }
            continue;
          }
        }

        finalNoNumbersByCountry = noNumbersByCountry;
        finalLastError = lastError;
        finalLastFailureText = lastFailureText;

        if (
          noNumbersByCountry.length
          && round < maxAcquireRounds
          && retryableNoNumberCountries.length > 0
        ) {
          await addLog(
            `Step 9: HeroSMS has no available numbers (round ${round}/${maxAcquireRounds}); retrying in ${Math.ceil(retryDelayMs / 1000)}s. Countries: ${retryableNoNumberCountries.join(', ')}.`,
            'warn'
          );
          await sleepWithStop(retryDelayMs);
          continue;
        }

        break;
      }

      if (finalNoNumbersByCountry.length) {
        throw new Error(
          `HeroSMS no numbers available across ${countryCandidates.length} country candidate(s): ${finalNoNumbersByCountry.join(' | ')}.`
        );
      }
      if (finalLastError) {
        throw finalLastError;
      }
      throw new Error(`HeroSMS failed to acquire a phone number. Last status: ${finalLastFailureText || 'unknown'}.`);
    }

    async function reactivatePhoneActivation(state = {}, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Reusable phone activation is missing.');
      }

      const config = resolvePhoneConfig(state);
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        const reuseProduct = normalizeFiveSimCountryCode(
          normalizedActivation.serviceCode || config.product || DEFAULT_FIVE_SIM_PRODUCT,
          DEFAULT_FIVE_SIM_PRODUCT
        );
        const reuseNumber = String(normalizedActivation.phoneNumber || '').replace(/[^\d]/g, '');
        if (!reuseNumber) {
          throw new Error('5sim reuse activation failed: phone number is missing.');
        }
        const payload = await fetchFiveSimPayload(
          config,
          `/user/reuse/${reuseProduct}/${reuseNumber}`,
          '5sim reuse activation'
        );
        const nextActivation = parseFiveSimActivationPayload(payload, normalizedActivation);
        if (!nextActivation) {
          const text = describeFiveSimPayload(payload);
          throw new Error(`5sim reuse activation failed: ${text || 'empty response'}`);
        }
        return nextActivation;
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        throw new Error('NexSMS does not support activation reuse for this flow.');
      }
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
      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        const endpoint = status === 6
          ? `/user/finish/${normalizedActivation.activationId}`
          : `/user/cancel/${normalizedActivation.activationId}`;
        const payload = await fetchFiveSimPayload(config, endpoint, actionLabel || '5sim set status');
        return describeFiveSimPayload(payload);
      }
      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        if (status === 6) {
          return 'NexSMS complete skipped';
        }
        const payload = await fetchNexSmsPayload(
          config,
          '/api/close/activation',
          actionLabel || 'NexSMS close activation',
          {
            method: 'POST',
            body: {
              phoneNumber: normalizedActivation.phoneNumber,
            },
          }
        );
        if (!isNexSmsSuccessPayload(payload)) {
          throw new Error(`NexSMS close activation failed: ${describeNexSmsPayload(payload) || 'empty response'}`);
        }
        return describeNexSmsPayload(payload);
      }
      const payload = await fetchHeroSmsPayload(config, {
        action: 'setStatus',
        id: normalizedActivation.activationId,
        status,
      }, actionLabel);
      return describeHeroSmsPayload(payload);
    }

    async function completePhoneActivation(state = {}, activation) {
      forgetActivationAcquiredPriceHint(activation);
      await setPhoneActivationStatus(state, activation, 6, 'HeroSMS setStatus(6)');
    }

    async function cancelPhoneActivation(state = {}, activation) {
      try {
        forgetActivationAcquiredPriceHint(activation);
        await setPhoneActivationStatus(state, activation, 8, 'HeroSMS setStatus(8)');
      } catch (_) {
        // Best-effort cleanup.
      }
    }

    async function requestAdditionalPhoneSms(state = {}, activation) {
      const config = resolvePhoneConfig(state);
      if (config.provider !== PHONE_SMS_PROVIDER_HERO) {
        return;
      }
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
      const maxRoundsRaw = Math.floor(Number(options.maxRounds));
      const maxRounds = Number.isFinite(maxRoundsRaw) && maxRoundsRaw > 0 ? maxRoundsRaw : 0;
      const start = Date.now();
      let lastResponse = '';
      let pollCount = 0;
      const extractVerificationCode = (rawCode) => {
        const trimmed = String(rawCode || '').trim();
        if (!trimmed) {
          return '';
        }
        const digitMatch = trimmed.match(/\b(\d{4,8})\b/);
        return digitMatch?.[1] || '';
      };

      if (config.provider === PHONE_SMS_PROVIDER_5SIM) {
        while (Date.now() - start < timeoutMs) {
          if (maxRounds > 0 && pollCount >= maxRounds) {
            break;
          }
          throwIfStopped();
          const payload = await fetchFiveSimPayload(
            config,
            `/user/check/${normalizedActivation.activationId}`,
            '5sim check activation'
          );
          const text = describeFiveSimPayload(payload);
          lastResponse = text;
          pollCount += 1;

          const smsList = Array.isArray(payload?.sms) ? payload.sms : [];
          const directCode = extractVerificationCode(payload?.code || payload?.sms_code);
          const smsCode = directCode || smsList
            .map((smsItem) => extractVerificationCode(smsItem?.code || smsItem?.text || smsItem?.message || ''))
            .find(Boolean);
          if (smsCode) {
            return smsCode;
          }

          const statusText = String(payload?.status || '').trim().toUpperCase();
          if (/^(RECEIVED|PENDING|RETRY|PREPARE|WAITING)$/i.test(statusText) || !statusText) {
            if (typeof options.onStatus === 'function') {
              await options.onStatus({
                activation: normalizedActivation,
                elapsedMs: Date.now() - start,
                pollCount,
                statusText: statusText || text || 'PENDING',
                timeoutMs,
              });
            }
            await sleepWithStop(intervalMs);
            continue;
          }

          if (/^(CANCELED|CANCELLED|BANNED|FINISHED|EXPIRED|TIMEOUT)$/i.test(statusText)) {
            throw new Error(`5sim activation ended before receiving SMS: ${statusText}`);
          }

          throw new Error(`5sim check activation failed: ${text || statusText || 'empty response'}`);
        }

        throw buildPhoneCodeTimeoutError(lastResponse);
      }

      if (config.provider === PHONE_SMS_PROVIDER_NEXSMS) {
        while (Date.now() - start < timeoutMs) {
          if (maxRounds > 0 && pollCount >= maxRounds) {
            break;
          }
          throwIfStopped();
          const payload = await fetchNexSmsPayload(
            config,
            '/api/sms/messages',
            'NexSMS get sms messages',
            {
              query: {
                phoneNumber: normalizedActivation.phoneNumber,
                format: 'json_latest',
              },
            }
          );
          const text = describeNexSmsPayload(payload);
          lastResponse = text;
          pollCount += 1;

          if (typeof options.onStatus === 'function') {
            await options.onStatus({
              activation: normalizedActivation,
              elapsedMs: Date.now() - start,
              pollCount,
              statusText: text || 'PENDING',
              timeoutMs,
            });
          }

          if (isNexSmsSuccessPayload(payload)) {
            const directCode = extractVerificationCode(payload?.data?.code || payload?.data?.text || '');
            if (directCode) {
              return directCode;
            }
            await sleepWithStop(intervalMs);
            continue;
          }

          if (isNexSmsPendingMessage(payload)) {
            await sleepWithStop(intervalMs);
            continue;
          }
          if (isNexSmsTerminalError(payload)) {
            throw new Error(`NexSMS get sms messages failed: ${text || 'unknown terminal error'}`);
          }
          await sleepWithStop(intervalMs);
        }

        throw buildPhoneCodeTimeoutError(lastResponse);
      }

      while (Date.now() - start < timeoutMs) {
        if (maxRounds > 0 && pollCount >= maxRounds) {
          break;
        }
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
          const extractedCode = extractVerificationCode(okMatch[1] || '');
          if (extractedCode) {
            return extractedCode;
          }
          await sleepWithStop(intervalMs);
          continue;
        }

        if (/^STATUS_(WAIT_CODE|WAIT_RETRY|WAIT_RESEND)(?::.+)?$/i.test(text)) {
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

    function resolveCountryConfigFromActivation(activation, fallbackState = {}) {
      const provider = normalizePhoneSmsProvider(
        activation?.provider || fallbackState?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
      );
      const candidates = provider === PHONE_SMS_PROVIDER_5SIM
        ? resolveFiveSimCountryCandidates(fallbackState)
        : (
          provider === PHONE_SMS_PROVIDER_NEXSMS
            ? resolveNexSmsCountryCandidates(fallbackState)
            : resolveCountryCandidates(fallbackState)
        );
      if (activation && typeof activation === 'object') {
        if (provider === PHONE_SMS_PROVIDER_5SIM) {
          const countryCode = normalizeFiveSimCountryCode(
            activation.countryCode || activation.countryId || '',
            ''
          );
          if (countryCode) {
            const matched = candidates.find((entry) => String(entry.id || entry.code || '') === countryCode);
            if (matched) {
              return matched;
            }
            return {
              id: countryCode,
              code: countryCode,
              label: normalizeCountryLabel(activation.countryLabel, countryCode),
            };
          }
        } else if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
          const countryId = normalizeNexSmsCountryId(activation.countryId, -1);
          if (countryId >= 0) {
            const matched = candidates.find((entry) => normalizeNexSmsCountryId(entry.id, -1) === countryId);
            if (matched) {
              return matched;
            }
            return {
              id: countryId,
              label: normalizeCountryLabel(activation.countryLabel, `Country #${countryId}`),
            };
          }
        } else {
          const countryId = normalizeCountryId(activation.countryId, 0);
          if (countryId > 0) {
            const matched = candidates.find((entry) => entry.id === countryId);
            if (matched) {
              return matched;
            }
            return {
              id: countryId,
              label: normalizeCountryLabel(activation.countryLabel, `Country #${countryId}`),
            };
          }
        }
      }
      if (provider === PHONE_SMS_PROVIDER_5SIM) {
        return candidates[0] || {
          id: '',
          code: '',
          label: '',
        };
      }
      if (provider === PHONE_SMS_PROVIDER_NEXSMS) {
        return candidates[0] || {
          id: 0,
          label: '',
        };
      }
      return candidates[0] || resolveCountryConfig(fallbackState);
    }

    async function submitPhoneNumber(tabId, phoneNumber, activation = null) {
      const state = await getState();
      const countryConfig = resolveCountryConfigFromActivation(activation, state);
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
        ? await getOAuthFlowStepTimeoutMs(65000, { step: 9, actionLabel: 'resend phone verification code' })
        : 65000;
      const request = {
        type: 'RESEND_PHONE_VERIFICATION_CODE',
        source: 'background',
        payload: {},
      };
      const result = typeof sendToContentScript === 'function'
        ? await sendToContentScript('signup-page', request, {
          responseTimeoutMs: timeoutMs,
        })
        : await sendToContentScriptResilient('signup-page', request, {
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
      const normalizedActivation = normalizeActivation(activation);
      const updates = {
        [PHONE_ACTIVATION_STATE_KEY]: normalizedActivation || null,
        [PHONE_VERIFICATION_CODE_STATE_KEY]: '',
      };
      if (!normalizedActivation) {
        updates[PHONE_RUNTIME_COUNTDOWN_ENDS_AT_KEY] = 0;
        updates[PHONE_RUNTIME_COUNTDOWN_WINDOW_INDEX_KEY] = 0;
        updates[PHONE_RUNTIME_COUNTDOWN_WINDOW_TOTAL_KEY] = 0;
      }
      await setPhoneRuntimeState(updates);
    }

    async function persistReusableActivation(activation) {
      await setPhoneRuntimeState({
        [REUSABLE_PHONE_ACTIVATION_STATE_KEY]: normalizeActivation(activation) || null,
      });
    }

    function readReusableActivationPoolFromState(state = {}) {
      return normalizeActivationPool(state?.[REUSABLE_PHONE_ACTIVATION_POOL_STATE_KEY]);
    }

    async function persistReusableActivationPool(pool = []) {
      await setPhoneRuntimeState({
        [REUSABLE_PHONE_ACTIVATION_POOL_STATE_KEY]: normalizeActivationPool(pool),
      });
    }

    async function upsertReusableActivationPool(activation, options = {}) {
      const normalized = normalizeActivation(activation);
      if (!normalized) {
        return [];
      }
      const state = options?.state || await getState();
      const existingPool = readReusableActivationPoolFromState(state);
      const filtered = existingPool.filter((entry) => !isSameActivation(entry, normalized));
      const nextPool = [normalized, ...filtered].slice(0, MAX_PHONE_REUSABLE_POOL);
      await persistReusableActivationPool(nextPool);
      return nextPool;
    }

    async function removeReusableActivationFromPool(activation, options = {}) {
      const normalized = normalizeActivation(activation);
      if (!normalized) {
        return [];
      }
      const state = options?.state || await getState();
      const existingPool = readReusableActivationPoolFromState(state);
      const nextPool = existingPool.filter((entry) => !isSameActivation(entry, normalized));
      if (nextPool.length === existingPool.length) {
        return existingPool;
      }
      await persistReusableActivationPool(nextPool);
      return nextPool;
    }

    async function clearCurrentActivation() {
      await persistCurrentActivation(null);
    }

    async function clearReusableActivation() {
      await persistReusableActivation(null);
    }

    async function setPhoneRuntimeCountdown(activation, waitSeconds, windowIndex, windowTotal) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        return;
      }
      const safeWaitSeconds = Math.max(0, Math.floor(Number(waitSeconds) || 0));
      await setPhoneRuntimeState({
        [PHONE_ACTIVATION_STATE_KEY]: normalizedActivation,
        [PHONE_RUNTIME_COUNTDOWN_ENDS_AT_KEY]: Date.now() + safeWaitSeconds * 1000,
        [PHONE_RUNTIME_COUNTDOWN_WINDOW_INDEX_KEY]: Math.max(0, Math.floor(Number(windowIndex) || 0)),
        [PHONE_RUNTIME_COUNTDOWN_WINDOW_TOTAL_KEY]: Math.max(0, Math.floor(Number(windowTotal) || 0)),
      });
    }

    async function clearPhoneRuntimeCountdown() {
      await setPhoneRuntimeState({
        [PHONE_RUNTIME_COUNTDOWN_ENDS_AT_KEY]: 0,
        [PHONE_RUNTIME_COUNTDOWN_WINDOW_INDEX_KEY]: 0,
        [PHONE_RUNTIME_COUNTDOWN_WINDOW_TOTAL_KEY]: 0,
      });
    }

    async function acquirePhoneActivation(state = {}, options = {}) {
      const provider = normalizePhoneSmsProvider(state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER);
      const providerOrder = resolvePhoneProviderOrder(state, provider);
      const countryCandidates = provider === PHONE_SMS_PROVIDER_5SIM
        ? resolveFiveSimCountryCandidates(state)
        : (
          provider === PHONE_SMS_PROVIDER_NEXSMS
            ? resolveNexSmsCountryCandidates(state)
            : resolveCountryCandidates(state)
        );
      if (
        (provider === PHONE_SMS_PROVIDER_5SIM || provider === PHONE_SMS_PROVIDER_NEXSMS)
        && !countryCandidates.length
      ) {
        throw new Error(`Step 9: ${provider === PHONE_SMS_PROVIDER_5SIM ? '5sim' : 'NexSMS'} countries are empty. Please select at least one country in 接码设置。`);
      }
      const normalizeCountryKey = (value) => (
        provider === PHONE_SMS_PROVIDER_5SIM
          ? normalizeFiveSimCountryCode(value, '')
          : (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? String(normalizeNexSmsCountryId(value, -1))
              : String(normalizeCountryId(value, 0))
          )
      );
      const blockedCountryIds = new Set(
        (Array.isArray(options?.blockedCountryIds) ? options.blockedCountryIds : [])
          .map((value) => normalizeCountryKey(value))
          .filter((id) => (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? (id !== '' && id !== null && id !== undefined)
              : Boolean(id && id !== '0')
          ))
      );
      const allowedCountryIds = new Set(
        countryCandidates
          .map((entry) => normalizeCountryKey(entry.id || entry.code))
          .filter((id) => (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? (id !== '' && id !== null && id !== undefined && !blockedCountryIds.has(id))
              : Boolean(id && id !== '0' && !blockedCountryIds.has(id))
          ))
      );
      const preferredCountryLabel = countryCandidates[0]?.label || (
        provider === PHONE_SMS_PROVIDER_5SIM
          ? ''
          : (
            provider === PHONE_SMS_PROVIDER_NEXSMS
              ? ''
              : HERO_SMS_COUNTRY_LABEL
          )
      );
      const resolveCountryLabelById = (countryId) => {
        const normalizedCountryKey = normalizeCountryKey(countryId);
        return countryCandidates.find((entry) => normalizeCountryKey(entry.id || entry.code) === normalizedCountryKey)?.label
          || preferredCountryLabel;
      };
      const scopedStateForProvider = (providerName) => ({
        ...state,
        phoneSmsProvider: normalizePhoneSmsProvider(providerName),
      });
      const preferredActivation = normalizeActivation(state[PREFERRED_PHONE_ACTIVATION_STATE_KEY]);
      let failedPreferredActivation = null;
      const canTryPreferredActivation = (
        !Boolean(options?.skipPreferredActivation)
        && preferredActivation
        && (provider === PHONE_SMS_PROVIDER_HERO || provider === PHONE_SMS_PROVIDER_5SIM)
        && preferredActivation.provider === provider
        && !blockedCountryIds.has(normalizeCountryKey(preferredActivation.countryId))
        && allowedCountryIds.has(normalizeCountryKey(preferredActivation.countryId))
        && preferredActivation.successfulUses < preferredActivation.maxUses
      );
      if (canTryPreferredActivation) {
        try {
          const reactivated = await reactivatePhoneActivation(state, preferredActivation);
          await addLog(
            `Step 9: using preferred number ${reactivated.phoneNumber}${reactivated.countryId ? ` (${resolveCountryLabelById(reactivated.countryId)})` : ''}.`,
            'info'
          );
          await resetPhoneNoSupplyFailureStreak(state);
          return reactivated;
        } catch (error) {
          failedPreferredActivation = preferredActivation;
          await removeReusableActivationFromPool(preferredActivation, { state }).catch(() => {});
          await addLog(
            `Step 9: preferred number ${preferredActivation.phoneNumber} is unavailable, falling back to a new number. ${error.message}`,
            'warn'
          );
        }
      }
      const reuseEnabled = normalizeHeroSmsReuseEnabled(state.heroSmsReuseEnabled);
      const reusableActivation = normalizeActivation(state[REUSABLE_PHONE_ACTIVATION_STATE_KEY]);
      const reusableActivationPool = readReusableActivationPoolFromState(state);
      const reusableCandidates = [];
      const seenReusableKeys = new Set();
      const pushReusableCandidate = (candidate) => {
        const normalizedCandidate = normalizeActivation(candidate);
        if (!normalizedCandidate) {
          return;
        }
        const candidateKey = buildActivationIdentityKey(normalizedCandidate);
        if (!candidateKey || seenReusableKeys.has(candidateKey)) {
          return;
        }
        seenReusableKeys.add(candidateKey);
        reusableCandidates.push(normalizedCandidate);
      };
      pushReusableCandidate(reusableActivation);
      reusableActivationPool.forEach((candidate) => pushReusableCandidate(candidate));

      if (reuseEnabled && (provider === PHONE_SMS_PROVIDER_HERO || provider === PHONE_SMS_PROVIDER_5SIM)) {
        for (const candidateActivation of reusableCandidates) {
          if (candidateActivation.provider !== provider) {
            continue;
          }
          if (isSameActivation(candidateActivation, failedPreferredActivation)) {
            continue;
          }
          if (candidateActivation.successfulUses >= candidateActivation.maxUses) {
            continue;
          }
          if (blockedCountryIds.has(normalizeCountryKey(candidateActivation.countryId))) {
            continue;
          }
          if (!allowedCountryIds.has(normalizeCountryKey(candidateActivation.countryId))) {
            continue;
          }
          try {
            const reactivated = await reactivatePhoneActivation(state, candidateActivation);
            await addLog(
              `Step 9: reusing ${resolveCountryLabelById(reactivated.countryId)} number ${reactivated.phoneNumber} (${reactivated.successfulUses + 1}/${reactivated.maxUses}).`,
              'info'
            );
            await resetPhoneNoSupplyFailureStreak(state);
            return reactivated;
          } catch (error) {
            await addLog(`Step 9: failed to reuse phone number ${candidateActivation.phoneNumber}, falling back to a new number. ${error.message}`, 'warn');
            await removeReusableActivationFromPool(candidateActivation, { state }).catch(() => {});
            if (isSameActivation(reusableActivation, candidateActivation)) {
              await clearReusableActivation();
            }
          }
        }
      }

      let lastProviderError = null;
      const providerErrors = [];
      const skippedFallbackProviders = [];
      for (const providerCandidate of providerOrder) {
        const useBlockedCountryIds = providerCandidate === provider
          ? Array.from(blockedCountryIds)
          : [];
        const useCountryPriceFloorByCountryId = (
          providerCandidate === provider
          && options?.countryPriceFloorByCountryId
          && typeof options.countryPriceFloorByCountryId === 'object'
        )
          ? options.countryPriceFloorByCountryId
          : {};
        try {
          const activation = await requestPhoneActivation(
            scopedStateForProvider(providerCandidate),
            {
              blockedCountryIds: useBlockedCountryIds,
              countryPriceFloorByCountryId: useCountryPriceFloorByCountryId,
            }
          );
          const providerLabel = providerCandidate === PHONE_SMS_PROVIDER_5SIM
            ? '5sim'
            : (providerCandidate === PHONE_SMS_PROVIDER_NEXSMS ? 'NexSMS' : HERO_SMS_SERVICE_LABEL);
          const providerCountryLabel = providerCandidate === provider
            ? resolveCountryLabelById(activation.countryId)
            : String(activation?.countryLabel || activation?.countryId || '').trim();
          if (providerCandidate !== provider) {
            await addLog(
              `Step 9: primary provider ${provider} has no usable number, fallback succeeded on ${providerLabel}${providerCountryLabel ? ` / ${providerCountryLabel}` : ''}.`,
              'warn'
            );
          }
          await addLog(
            `Step 9: acquired ${providerLabel}${providerCountryLabel ? ` / ${providerCountryLabel}` : ''} number ${activation.phoneNumber}.`,
            'info'
          );
          await resetPhoneNoSupplyFailureStreak(state);
          return activation;
        } catch (error) {
          if (isStopRequestedError(error)) {
            throw error;
          }
          const providerErrorMessage = String(error?.message || error || 'unknown error');
          const providerLabel = providerCandidate === PHONE_SMS_PROVIDER_5SIM
            ? '5sim'
            : (providerCandidate === PHONE_SMS_PROVIDER_NEXSMS ? 'NexSMS' : HERO_SMS_SERVICE_LABEL);
          if (
            providerCandidate !== provider
            && /step\s*9:\s*(?:5sim|nexsms)\s+countries\s+are\s+empty/i.test(providerErrorMessage)
          ) {
            skippedFallbackProviders.push(`${providerLabel}: countries are empty`);
            await addLog(
              `Step 9: skipping fallback provider ${providerLabel} because countries are empty in 接码设置。`,
              'warn'
            );
            continue;
          }
          lastProviderError = error;
          providerErrors.push(`${providerCandidate}: ${providerErrorMessage}`);
        }
      }

      if (providerErrors.length) {
        await logNoSupplyDiagnostics(state, providerOrder, providerErrors);
        const skippedSuffix = skippedFallbackProviders.length
          ? ` | skipped fallback providers: ${skippedFallbackProviders.join('; ')}`
          : '';
        throw new Error(`Step 9: all provider candidates failed to acquire number. ${providerErrors.join(' | ')}${skippedSuffix}`);
      }
      throw lastProviderError || new Error('Step 9: failed to acquire phone activation.');
    }

    async function markActivationReusableAfterSuccess(state, activation) {
      const normalizedActivation = normalizeActivation(activation);
      const reusableProvider = normalizedActivation?.provider;
      const canPersistReusableActivation = reusableProvider === PHONE_SMS_PROVIDER_HERO
        || reusableProvider === PHONE_SMS_PROVIDER_5SIM;
      if (!canPersistReusableActivation) {
        await clearReusableActivation();
        return;
      }
      if (!normalizedActivation) {
        await clearReusableActivation();
        return;
      }

      const successfulUses = normalizedActivation.successfulUses + 1;
      const nextReusableActivation = {
        ...normalizedActivation,
        successfulUses,
      };
      await upsertReusableActivationPool(nextReusableActivation, { state });
      if (!normalizeHeroSmsReuseEnabled(state?.heroSmsReuseEnabled)) {
        await clearReusableActivation();
        return;
      }
      if (successfulUses >= normalizedActivation.maxUses) {
        await clearReusableActivation();
        await removeReusableActivationFromPool(nextReusableActivation, { state });
        return;
      }

      await persistReusableActivation(nextReusableActivation);
    }

    async function waitForPhoneCodeOrRotateNumber(tabId, state, activation) {
      const normalizedActivation = normalizeActivation(activation);
      if (!normalizedActivation) {
        throw new Error('Phone activation is missing.');
      }
      const providerLabel = normalizedActivation.provider === PHONE_SMS_PROVIDER_5SIM
        ? '5sim'
        : (normalizedActivation.provider === PHONE_SMS_PROVIDER_NEXSMS ? 'NexSMS' : 'HeroSMS');
      const usePageResend = normalizedActivation.provider !== PHONE_SMS_PROVIDER_5SIM;

      const waitSeconds = normalizePhoneCodeWaitSeconds(state?.phoneCodeWaitSeconds);
      const timeoutWindows = normalizePhoneCodeTimeoutWindows(state?.phoneCodeTimeoutWindows);
      const pollIntervalSeconds = normalizePhoneCodePollIntervalSeconds(state?.phoneCodePollIntervalSeconds);
      const pollMaxRounds = normalizePhoneCodePollMaxRounds(state?.phoneCodePollMaxRounds);
      let lastLoggedStatus = '';
      let lastLoggedPollCount = 0;
      let resendTriggeredForCurrentNumber = false;

      for (let windowIndex = 1; windowIndex <= timeoutWindows; windowIndex += 1) {
        await setPhoneRuntimeCountdown(normalizedActivation, waitSeconds, windowIndex, timeoutWindows);
        await addLog(
          `Step 9: waiting up to ${waitSeconds} seconds for SMS on ${normalizedActivation.phoneNumber} (${windowIndex}/${timeoutWindows}).`,
          'info'
        );
        try {
          const code = await pollPhoneActivationCode(state, normalizedActivation, {
            actionLabel: windowIndex === 1
              ? `poll phone verification code from ${providerLabel}`
              : `poll resent phone verification code from ${providerLabel}`,
            timeoutMs: waitSeconds * 1000,
            intervalMs: pollIntervalSeconds * 1000,
            maxRounds: pollMaxRounds,
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
                `Step 9: ${providerLabel} status for ${normalizedActivation.phoneNumber}: ${statusText} (${Math.ceil(elapsedMs / 1000)}s elapsed, round ${pollCount}/${pollMaxRounds}).`,
                'info'
              );
            },
          });
          await clearPhoneRuntimeCountdown();
          return {
            code,
            replaceNumber: false,
          };
        } catch (error) {
          if (!isPhoneCodeTimeoutError(error)) {
            if (isPhoneActivationOrderMissingError(error, normalizedActivation.provider)) {
              await addLog(
                `Step 9: ${providerLabel} activation for ${normalizedActivation.phoneNumber} became invalid (${error.message || error}), replacing number immediately.`,
                'warn'
              );
              await clearPhoneRuntimeCountdown();
              return {
                code: '',
                replaceNumber: true,
                reason: 'activation_not_found',
              };
            }
            throw error;
          }

          if (windowIndex < timeoutWindows) {
            await addLog(
              `Step 9: no SMS arrived for ${normalizedActivation.phoneNumber} within ${waitSeconds} seconds, requesting another SMS.`,
              'warn'
            );
            if (!usePageResend) {
              await addLog(
                `Step 9: ${providerLabel} keeps the same verification page session and skips page resend to avoid route 405 / resend throttling; continue polling this number.`,
                'warn'
              );
              continue;
            }
            await requestAdditionalPhoneSms(state, normalizedActivation);
            if (resendTriggeredForCurrentNumber) {
              await addLog(
                `Step 9: resend already used once for ${normalizedActivation.phoneNumber}; continue polling without another page resend to avoid rate limit.`,
                'warn'
              );
              continue;
            }
            try {
              await resendPhoneVerificationCode(tabId);
              resendTriggeredForCurrentNumber = true;
              await addLog('Step 9: clicked "Resend text message" on the phone verification page.', 'info');
            } catch (resendError) {
              if (isStopRequestedError(resendError)) {
                throw resendError;
              }
              if (isPhoneResendThrottledError(resendError)) {
                await addLog(
                  `Step 9: resend is throttled for ${normalizedActivation.phoneNumber}, replacing number immediately. ${resendError.message}`,
                  'warn'
                );
                await clearPhoneRuntimeCountdown();
                return {
                  code: '',
                  replaceNumber: true,
                  reason: 'resend_throttled',
                };
              }
              if (isPhoneRoute405RecoveryError(resendError)) {
                await addLog(
                  `Step 9: phone verification page is stuck on route-405 retry loop for ${normalizedActivation.phoneNumber}, replacing number immediately. ${resendError.message}`,
                  'warn'
                );
                await clearPhoneRuntimeCountdown();
                return {
                  code: '',
                  replaceNumber: true,
                  reason: 'route_405_retry_loop',
                };
              }
              await addLog(`Step 9: failed to click resend on the phone verification page. ${resendError.message}`, 'warn');
            }
            continue;
          }

          await addLog(
            `Step 9: no SMS for ${normalizedActivation.phoneNumber} after ${timeoutWindows} window(s), replacing the number inside step 9.`,
            'warn'
          );
          await clearPhoneRuntimeCountdown();
          return {
            code: '',
            replaceNumber: true,
            reason: `sms_timeout_after_${timeoutWindows}_windows`,
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
      const maxNumberReplacementAttempts = normalizePhoneReplacementLimit(
        state.phoneVerificationReplacementLimit
      );
      let usedNumberReplacementAttempts = 0;
      let preferredActivationExhausted = false;
      let preferReuseExistingActivationOnAddPhone = false;
      let addPhoneReentryWithSameActivation = 0;
      const countrySmsFailureCounts = new Map();
      const countryPriceFloorByKey = new Map();
      const normalizeCountryFailureKey = (countryId, provider = activation?.provider || state?.phoneSmsProvider || '') => {
        const normalizedProvider = normalizePhoneSmsProvider(provider || state?.phoneSmsProvider || '');
        if (normalizedProvider === PHONE_SMS_PROVIDER_5SIM) {
          const normalizedCountryCode = normalizeFiveSimCountryCode(countryId, '');
          return normalizedCountryCode ? `${normalizedProvider}:${normalizedCountryCode}` : '';
        }
        if (normalizedProvider === PHONE_SMS_PROVIDER_NEXSMS) {
          const normalizedCountryId = normalizeNexSmsCountryId(countryId, -1);
          return normalizedCountryId >= 0 ? `${normalizedProvider}:${normalizedCountryId}` : '';
        }
        const normalizedCountryId = normalizeCountryId(countryId, 0);
        return normalizedCountryId > 0 ? `${normalizedProvider}:${normalizedCountryId}` : '';
      };
      const splitCountryFailureKey = (countryKey, providerHint = '') => {
        const fallbackProvider = normalizePhoneSmsProvider(
          providerHint || activation?.provider || state?.phoneSmsProvider || DEFAULT_PHONE_SMS_PROVIDER
        );
        const raw = String(countryKey || '').trim();
        if (!raw) {
          return { provider: fallbackProvider, countryKey: '' };
        }
        const idx = raw.indexOf(':');
        if (idx <= 0) {
          return { provider: fallbackProvider, countryKey: raw };
        }
        const providerPrefix = normalizePhoneSmsProvider(raw.slice(0, idx));
        const keyPart = raw.slice(idx + 1).trim();
        return {
          provider: providerPrefix || fallbackProvider,
          countryKey: keyPart,
        };
      };
      const resolveCountryLabelByFailureKey = (countryKey, provider = activation?.provider || state?.phoneSmsProvider || '') => {
        const parsed = splitCountryFailureKey(countryKey, provider);
        const normalizedProvider = normalizePhoneSmsProvider(parsed.provider || provider || state?.phoneSmsProvider || '');
        const normalizedCountryKey = String(parsed.countryKey || '').trim();
        if (!normalizedCountryKey) {
          return 'Unknown country';
        }
        if (normalizedProvider === PHONE_SMS_PROVIDER_5SIM) {
          const matched = resolveFiveSimCountryCandidates(state)
            .find((entry) => String(entry.id || entry.code || '') === normalizedCountryKey);
          return matched?.label || normalizedCountryKey || 'Unknown country';
        }
        if (normalizedProvider === PHONE_SMS_PROVIDER_NEXSMS) {
          const normalizedCountryId = normalizeNexSmsCountryId(normalizedCountryKey, -1);
          const matched = resolveNexSmsCountryCandidates(state)
            .find((entry) => normalizeNexSmsCountryId(entry.id, -1) === normalizedCountryId);
          return matched?.label || `Country #${normalizedCountryId}`;
        }
        const normalizedCountryId = normalizeCountryId(normalizedCountryKey, 0);
        const matched = resolveCountryCandidates(state)
          .find((entry) => normalizeCountryId(entry.id, 0) === normalizedCountryId);
        return matched?.label || `Country #${normalizedCountryId}`;
      };

      const ensureAddPhonePageBeforeSubmit = async (attemptLabel = 'before submit') => {
        let snapshot = null;
        try {
          snapshot = await readPhonePageState(tabId, 12000);
        } catch (error) {
          await addLog(
            `Step 9: failed to inspect auth page ${attemptLabel}. ${error.message}`,
            'warn'
          );
          snapshot = null;
        }

        if (snapshot?.addPhonePage) {
          return snapshot;
        }

        try {
          const returned = await returnToAddPhone(tabId);
          const merged = {
            ...(snapshot || {}),
            ...(returned || {}),
          };
          if (merged?.addPhonePage) {
            return merged;
          }
        } catch (error) {
          await addLog(
            `Step 9: failed to return to add-phone page ${attemptLabel}. ${error.message}`,
            'warn'
          );
        }

        const latest = await readPhonePageState(tabId, 15000);
        if (!latest?.addPhonePage) {
          throw new Error(
            `Step 9: auth page is not on add-phone before phone submit (${attemptLabel}). URL: ${latest?.url || 'unknown'}`
          );
        }
        return latest;
      };

      const getCountryFailureCount = (countryId) => {
        const countryKey = normalizeCountryFailureKey(countryId);
        if (!countryKey) {
          return 0;
        }
        return Math.max(0, Math.floor(Number(countrySmsFailureCounts.get(countryKey)) || 0));
      };

      const markCountrySmsFailure = async (countryId, reason = 'sms_timeout') => {
        const countryKey = normalizeCountryFailureKey(countryId);
        if (!countryKey) {
          return;
        }
        const nextCount = getCountryFailureCount(countryKey) + 1;
        countrySmsFailureCounts.set(countryKey, nextCount);
        if (nextCount >= PHONE_SMS_FAILURE_SKIP_THRESHOLD) {
          const countryLabel = resolveCountryLabelByFailureKey(countryKey);
          await addLog(
            `Step 9: ${countryLabel} reached ${nextCount} SMS failures (${reason}); next acquisition will fallback to other selected country candidates first.`,
            'warn'
          );
        }
      };

      const clearCountrySmsFailure = (countryId) => {
        const countryKey = normalizeCountryFailureKey(countryId);
        if (!countryKey) {
          return;
        }
        countrySmsFailureCounts.delete(countryKey);
        countryPriceFloorByKey.delete(countryKey);
      };

      const getBlockedCountryIds = () => {
        const activeProvider = normalizePhoneSmsProvider(
          state?.phoneSmsProvider || activation?.provider || DEFAULT_PHONE_SMS_PROVIDER
        );
        return Array.from(countrySmsFailureCounts.entries())
          .filter(([, count]) => Number(count) >= PHONE_SMS_FAILURE_SKIP_THRESHOLD)
          .map(([countryKey]) => splitCountryFailureKey(countryKey, activeProvider))
          .filter((entry) => entry.provider === activeProvider)
          .map((entry) => String(entry.countryKey || '').trim())
          .filter(Boolean);
      };

      const getCountryPriceFloorById = () => {
        const activeProvider = normalizePhoneSmsProvider(
          state?.phoneSmsProvider || activation?.provider || DEFAULT_PHONE_SMS_PROVIDER
        );
        const floorById = {};
        countryPriceFloorByKey.forEach((price, compoundCountryKey) => {
          const numeric = normalizeHeroSmsPrice(price);
          if (numeric === null || numeric <= 0) {
            return;
          }
          const parsed = splitCountryFailureKey(compoundCountryKey, activeProvider);
          if (parsed.provider !== activeProvider) {
            return;
          }
          const keyPart = String(parsed.countryKey || '').trim();
          if (!keyPart) {
            return;
          }
          floorById[keyPart] = Math.round(numeric * 10000) / 10000;
        });
        return floorById;
      };

      const setCountryPriceFloorFromActivation = async (activationCandidate, reason = '') => {
        const normalizedActivation = normalizeActivation(activationCandidate);
        if (!normalizedActivation) {
          return;
        }
        const countryKey = normalizeCountryFailureKey(
          normalizedActivation.countryId,
          normalizedActivation.provider
        );
        if (!countryKey) {
          return;
        }
        const floorPrice = normalizeHeroSmsPrice(
          normalizedActivation.price
          ?? normalizedActivation.maxPrice
          ?? normalizedActivation.selectedPrice
          ?? getActivationAcquiredPriceHint(normalizedActivation)
        );
        if (floorPrice === null || floorPrice <= 0) {
          return;
        }
        const currentFloor = normalizeHeroSmsPrice(countryPriceFloorByKey.get(countryKey));
        if (currentFloor !== null && currentFloor >= floorPrice) {
          return;
        }
        const normalizedFloor = Math.round(floorPrice * 10000) / 10000;
        countryPriceFloorByKey.set(countryKey, normalizedFloor);
        const countryLabel = resolveCountryLabelByFailureKey(countryKey, normalizedActivation.provider);
        await addLog(
          `Step 9: ${countryLabel} will try a higher price tier (> ${normalizedFloor}) due to ${reason || 'sms timeout'}.`,
          'warn'
        );
      };

      const isPreferredActivation = (activationCandidate, stateSnapshot = {}) => (
        isSameActivation(
          stateSnapshot?.[PREFERRED_PHONE_ACTIVATION_STATE_KEY],
          activationCandidate
        )
      );

      const markPreferredActivationExhausted = async (reason = '') => {
        if (preferredActivationExhausted || !activation || !isPreferredActivation(activation, state)) {
          return;
        }
        preferredActivationExhausted = true;
        await addLog(
          `Step 9: preferred number ${activation.phoneNumber} failed (${reason || 'unknown reason'}), falling back to a new number.`,
          'warn'
        );
      };

      const rotateActivationAfterAddPhoneFailure = async (failureReason, failureCode, submitState = {}) => {
        await markPreferredActivationExhausted(failureCode || failureReason);
        usedNumberReplacementAttempts += 1;
        if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
          throw new Error(
            `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: ${failureCode || 'add_phone_rejected'}.`
          );
        }
        await addLog(
          `Step 9: replacing number after add-phone failure (${failureReason}) (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
          'warn'
        );
        if (shouldCancelActivation && activation) {
          await cancelPhoneActivation(state, activation);
        }
        await clearCurrentActivation();
        activation = null;
        shouldCancelActivation = false;
        preferReuseExistingActivationOnAddPhone = false;
        addPhoneReentryWithSameActivation = 0;
        let addPhoneSnapshot = {
          ...pageState,
          ...submitState,
          addPhonePage: true,
          phoneVerificationPage: false,
        };
        try {
          const returned = await returnToAddPhone(tabId);
          addPhoneSnapshot = {
            ...addPhoneSnapshot,
            ...returned,
            addPhonePage: true,
            phoneVerificationPage: false,
          };
        } catch (returnError) {
          await addLog(
            `Step 9: failed to return to add-phone page after rejection, will continue with best-effort state. ${returnError.message}`,
            'warn'
          );
        }
        try {
          const verified = await ensureAddPhonePageBeforeSubmit('after add-phone rejection');
          addPhoneSnapshot = {
            ...addPhoneSnapshot,
            ...verified,
            addPhonePage: true,
            phoneVerificationPage: false,
          };
        } catch (verifyError) {
          await addLog(
            `Step 9: failed to verify add-phone state after rejection. ${verifyError.message}`,
            'warn'
          );
        }
        pageState = addPhoneSnapshot;
      };

      try {
        while (true) {
          state = await getState();
          if (!activation) {
            activation = normalizeActivation(state[PHONE_ACTIVATION_STATE_KEY]);
          }

          if (pageState?.addPhonePage) {
            const addPhoneUrlText = String(pageState?.url || '').trim().toLowerCase();
            const looksLikeAddPhoneUrl = /\/add-phone(?:[/?#]|$)/i.test(addPhoneUrlText);
            if (!looksLikeAddPhoneUrl) {
              pageState = await ensureAddPhonePageBeforeSubmit(
                activation ? 'with current activation' : 'with new activation'
              );
            }
            if (!activation) {
              activation = await acquirePhoneActivation(state, {
                blockedCountryIds: getBlockedCountryIds(),
                countryPriceFloorByCountryId: getCountryPriceFloorById(),
                skipPreferredActivation: preferredActivationExhausted,
              });
              shouldCancelActivation = true;
              await persistCurrentActivation(activation);
              addPhoneReentryWithSameActivation = 0;
            } else if (preferReuseExistingActivationOnAddPhone) {
              addPhoneReentryWithSameActivation += 1;
              if (addPhoneReentryWithSameActivation > 1) {
                usedNumberReplacementAttempts += 1;
                if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
                  throw new Error(
                    `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: returned_to_add_phone_loop.`
                  );
                }
                await addLog(
                  `Step 9: current number ${activation.phoneNumber} returned to add-phone repeatedly, replacing number (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
                  'warn'
                );
                if (shouldCancelActivation && activation) {
                  await cancelPhoneActivation(state, activation);
                }
                await clearCurrentActivation();
                activation = null;
                shouldCancelActivation = false;
                preferReuseExistingActivationOnAddPhone = false;
                addPhoneReentryWithSameActivation = 0;
                pageState = {
                  ...pageState,
                  addPhonePage: true,
                  phoneVerificationPage: false,
                };
                continue;
              }
              await addLog(
                `Step 9: add-phone returned, re-submitting current number ${activation.phoneNumber} before requesting a new number.`,
                'warn'
              );
            }

            let submitResult = null;
            try {
              submitResult = await submitPhoneNumber(tabId, activation.phoneNumber, activation);
            } catch (submitError) {
              const submitErrorText = String(submitError?.message || submitError || 'unknown error');
              if (isRecoverableAddPhoneSubmitError(submitErrorText)) {
                await rotateActivationAfterAddPhoneFailure(
                  submitErrorText,
                  'add_phone_submit_failed',
                  { url: pageState?.url || '' }
                );
                continue;
              }
              throw submitError;
            }
            if (submitResult.addPhoneRejected) {
              const addPhoneRejectText = String(submitResult.errorText || submitResult.url || 'unknown error');
              if (isPhoneNumberUsedError(addPhoneRejectText)) {
                await rotateActivationAfterAddPhoneFailure(
                  `add-phone rejected ${activation.phoneNumber} as already used (${addPhoneRejectText})`,
                  'phone_number_used',
                  submitResult
                );
                continue;
              }

              await addLog(
                `Step 9: add-phone rejected current number but did not mark it as used (${addPhoneRejectText}), retrying once with the same number.`,
                'warn'
              );
              let retrySubmitError = null;
              try {
                submitResult = await submitPhoneNumber(tabId, activation.phoneNumber, activation);
              } catch (submitError) {
                retrySubmitError = submitError;
              }
              if (retrySubmitError || submitResult.addPhoneRejected) {
                const retryRejectText = String(
                  retrySubmitError?.message
                  || submitResult?.errorText
                  || submitResult?.url
                  || 'unknown error'
                );
                if (isPhoneNumberUsedError(retryRejectText) || isRecoverableAddPhoneSubmitError(retryRejectText)) {
                  await rotateActivationAfterAddPhoneFailure(
                    `add-phone keeps rejecting ${activation.phoneNumber} (${retryRejectText})`,
                    isPhoneNumberUsedError(retryRejectText) ? 'phone_number_used' : 'add_phone_rejected',
                    submitResult || {}
                  );
                  continue;
                }
                throw new Error(
                  `Step 9: add-phone keeps rejecting current number without explicit "used" status: ${retryRejectText}.`
                );
              }
            }

            await addLog('Step 9: submitted the phone number on add-phone page.', 'info');
            pageState = {
              ...pageState,
              ...submitResult,
              addPhonePage: false,
              phoneVerificationPage: true,
            };
            preferReuseExistingActivationOnAddPhone = false;
            addPhoneReentryWithSameActivation = 0;
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
          let replaceReason = '';

          for (let attempt = 1; attempt <= DEFAULT_PHONE_SUBMIT_ATTEMPTS; attempt += 1) {
            throwIfStopped();

            const codeResult = await waitForPhoneCodeOrRotateNumber(tabId, state, activation);
            if (codeResult.replaceNumber) {
              await markPreferredActivationExhausted(codeResult.reason || 'sms_timeout');
              shouldReplaceNumber = true;
              replaceReason = codeResult.reason || 'sms_not_received';
              break;
            }

            await setPhoneRuntimeState({
              [PHONE_VERIFICATION_CODE_STATE_KEY]: String(codeResult.code || '').trim(),
            });
            await addLog(`Step 9: received phone verification code ${codeResult.code}.`, 'info');
            let submitResult = null;
            let submitError = null;
            try {
              submitResult = await submitPhoneVerificationCode(tabId, codeResult.code);
            } catch (error) {
              submitError = error;
            }
            if (submitError) {
              const submitErrorText = String(submitError?.message || submitError || 'unknown error');
              if (isPhoneNumberUsedError(submitErrorText)) {
                shouldReplaceNumber = true;
                replaceReason = 'phone_number_used';
                await addLog(
                  `Step 9: phone verification failed with used-number signal (${submitErrorText}), replacing with a new number immediately.`,
                  'warn'
                );
                break;
              }
              if (isPhoneNumberInvalidError(submitErrorText)) {
                shouldReplaceNumber = true;
                replaceReason = 'phone_number_invalid';
                await addLog(
                  `Step 9: phone verification failed with invalid-number signal (${submitErrorText}), replacing with a new number immediately.`,
                  'warn'
                );
                break;
              }
              if (isPhoneRoute405RecoveryError(submitErrorText)) {
                shouldReplaceNumber = true;
                replaceReason = 'route_405_retry_loop';
                await addLog(
                  `Step 9: phone verification page entered route-405 retry loop (${submitErrorText}), replacing with a new number immediately.`,
                  'warn'
                );
                break;
              }
              throw submitError;
            }

            if (submitResult.returnedToAddPhone) {
              await addLog(
                'Step 9: phone verification returned to add-phone after code submission, will try current number first.',
                'warn'
              );
              preferReuseExistingActivationOnAddPhone = true;
              pageState = {
                ...pageState,
                ...submitResult,
                addPhonePage: true,
                phoneVerificationPage: false,
              };
              break;
            }

            if (submitResult.invalidCode) {
              const invalidErrorText = String(submitResult.errorText || submitResult.url || 'unknown error');
              if (isPhoneNumberUsedError(invalidErrorText)) {
                shouldReplaceNumber = true;
                replaceReason = 'phone_number_used';
                await addLog(
                  `Step 9: phone number was rejected as already used (${invalidErrorText}), replacing with a new number immediately.`,
                  'warn'
                );
                break;
              }

              if (attempt >= DEFAULT_PHONE_SUBMIT_ATTEMPTS) {
                shouldReplaceNumber = true;
                replaceReason = 'code_rejected';
                await addLog(
                  `Step 9: phone verification code was rejected ${DEFAULT_PHONE_SUBMIT_ATTEMPTS} times (${invalidErrorText}), replacing the number.`,
                  'warn'
                );
                break;
              }

              if (remainingResendRequests > 0) {
                remainingResendRequests -= 1;
                await requestAdditionalPhoneSms(state, activation);
                try {
                  await resendPhoneVerificationCode(tabId);
                  await addLog('Step 9: clicked "Resend text message" after the phone code was rejected.', 'info');
                } catch (resendError) {
                  if (isStopRequestedError(resendError)) {
                    throw resendError;
                  }
                  if (isPhoneResendThrottledError(resendError)) {
                    shouldReplaceNumber = true;
                    replaceReason = 'resend_throttled';
                    await addLog(
                      `Step 9: resend is throttled after code rejection (${resendError.message}), replacing number immediately.`,
                      'warn'
                    );
                    break;
                  }
                  if (isPhoneRoute405RecoveryError(resendError)) {
                    shouldReplaceNumber = true;
                    replaceReason = 'route_405_retry_loop';
                    await addLog(
                      `Step 9: phone verification page entered route-405 retry loop after code rejection (${resendError.message}), replacing number immediately.`,
                      'warn'
                    );
                    break;
                  }
                  await addLog(`Step 9: failed to click resend after code rejection. ${resendError.message}`, 'warn');
                }
                if (shouldReplaceNumber) {
                  break;
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
            await markActivationReusableAfterSuccess(state, activation);
            clearCountrySmsFailure(activation.countryId);
            shouldCancelActivation = false;
            await clearCurrentActivation();
            addPhoneReentryWithSameActivation = 0;
            await addLog('Step 9: phone verification finished, waiting for OAuth consent.', 'ok');
            return submitResult;
          }

          if (!shouldReplaceNumber) {
            if (pageState?.addPhonePage) {
              continue;
            }
            throw new Error('Phone verification did not complete successfully.');
          }

          if (
            activation
            && (
              replaceReason === 'resend_throttled'
              || replaceReason === 'route_405_retry_loop'
              || /^sms_timeout_after_/i.test(String(replaceReason || ''))
            )
          ) {
            await setCountryPriceFloorFromActivation(activation, replaceReason || 'sms_timeout');
            if (
              replaceReason === 'resend_throttled'
              || replaceReason === 'route_405_retry_loop'
            ) {
              await markCountrySmsFailure(activation.countryId, replaceReason || 'sms_timeout');
            } else if (/^sms_timeout_after_/i.test(String(replaceReason || ''))) {
              await addLog(
                `Step 9: ${activation.countryLabel || activation.countryId || 'current country'} timed out on SMS; keep the same provider/country for number replacement first and avoid country block on timeout.`,
                'info'
              );
            }
          }
          await markPreferredActivationExhausted(replaceReason || 'replace_number');

          usedNumberReplacementAttempts += 1;
          if (usedNumberReplacementAttempts > maxNumberReplacementAttempts) {
            throw new Error(
              `Step 9: phone verification did not succeed after ${maxNumberReplacementAttempts} number replacements. Last reason: ${replaceReason || 'unknown'}.`
            );
          }

          if (shouldCancelActivation && activation) {
            await cancelPhoneActivation(state, activation);
          }
          await clearCurrentActivation();
          activation = null;
          shouldCancelActivation = false;
          addPhoneReentryWithSameActivation = 0;

          let returnResult = {
            addPhonePage: true,
            phoneVerificationPage: false,
            url: 'https://auth.openai.com/add-phone',
          };
          try {
            returnResult = await returnToAddPhone(tabId);
          } catch (returnError) {
            await addLog(`Step 9: failed to return to add-phone page before replacing number. ${returnError.message}`, 'warn');
          }

          if (!returnResult?.addPhonePage) {
            try {
              const stateSnapshot = await readPhonePageState(tabId, 12000);
              if (stateSnapshot?.addPhonePage) {
                returnResult = {
                  ...returnResult,
                  ...stateSnapshot,
                  addPhonePage: true,
                  phoneVerificationPage: false,
                };
              }
            } catch (_) {
              // Best effort: keep fallback state for compatibility with tests and older flows.
            }
          }
          try {
            const verifiedAddPhoneState = await ensureAddPhonePageBeforeSubmit('after replace-number rotation');
            returnResult = {
              ...returnResult,
              ...verifiedAddPhoneState,
              addPhonePage: true,
              phoneVerificationPage: false,
            };
          } catch (verifyError) {
            await addLog(
              `Step 9: failed to verify add-phone page after number replacement. ${verifyError.message}`,
              'warn'
            );
          }

          await addLog(
            `Step 9: replacing number and retrying inside step 9 (${usedNumberReplacementAttempts}/${maxNumberReplacementAttempts}).`,
            'warn'
          );
          pageState = {
            ...pageState,
            ...returnResult,
            addPhonePage: true,
            phoneVerificationPage: false,
          };
        }
      } catch (error) {
        if (shouldCancelActivation && activation) {
          await cancelPhoneActivation(state, activation);
        }
        await clearCurrentActivation();
        throw sanitizePhoneRestartStep7Error(sanitizePhoneCodeTimeoutError(error));
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
