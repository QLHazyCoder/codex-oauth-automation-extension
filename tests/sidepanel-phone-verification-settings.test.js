const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  normalizeIcloudForwardMailProvider,
  normalizeIcloudTargetMailboxType,
} = require('../mail-provider-utils');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

test('sidepanel html exposes phone verification toggle and dedicated HeroSMS rows', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-phone-verification-enabled"/);
  assert.match(html, /id="btn-toggle-phone-verification-section"/);
  assert.match(html, /id="row-phone-verification-fold"/);
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="row-phone-sms-provider"/);
  assert.match(html, /id="select-phone-sms-provider"/);
  assert.match(html, /id="row-phone-sms-provider-order"/);
  assert.match(html, /id="select-phone-sms-provider-order"[^>]*multiple/);
  assert.match(html, /id="btn-phone-sms-provider-order-menu"/);
  assert.match(html, /id="row-phone-sms-provider-order-actions"/);
  assert.match(html, /id="btn-phone-sms-provider-order-reset"/);
  assert.match(html, /id="row-hero-sms-platform"/);
  assert.match(html, /id="row-hero-sms-country"/);
  assert.match(html, /id="row-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-country"[^>]*multiple/);
  assert.doesNotMatch(html, /id="select-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-api-key"/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="row-hero-sms-current-number"/);
  assert.match(html, /id="row-hero-sms-current-countdown"/);
  assert.match(html, /id="row-hero-sms-price-tiers"/);
  assert.match(html, /id="row-hero-sms-current-code"/);
  assert.match(html, /id="row-hero-sms-preferred-activation"/);
  assert.match(html, /id="select-hero-sms-preferred-activation"/);
  assert.match(html, /id="row-phone-replacement-limit"/);
  assert.match(html, /id="row-phone-verification-resend-count"/);
  assert.match(html, /id="row-phone-code-wait-seconds"/);
  assert.match(html, /id="row-phone-code-timeout-windows"/);
  assert.match(html, /id="row-phone-code-poll-interval-seconds"/);
  assert.match(html, /id="row-phone-code-poll-max-rounds"/);
  assert.match(html, /id="row-five-sim-api-key"/);
  assert.match(html, /id="input-five-sim-api-key"/);
  assert.match(html, /id="row-five-sim-country"/);
  assert.match(html, /id="select-five-sim-country"[^>]*multiple/);
  assert.match(html, /id="row-five-sim-country-fallback"/);
  assert.match(html, /id="row-five-sim-operator"/);
  assert.match(html, /id="input-five-sim-operator"/);
  assert.match(html, /id="row-five-sim-product"/);
  assert.match(html, /id="input-five-sim-product"/);
  assert.match(html, /<option value="nexsms">/);
  assert.match(html, /id="row-nex-sms-api-key"/);
  assert.match(html, /id="input-nex-sms-api-key"/);
  assert.match(html, /id="row-nex-sms-country"/);
  assert.match(html, /id="select-nex-sms-country"[^>]*multiple/);
  assert.match(html, /id="row-nex-sms-country-fallback"/);
  assert.match(html, /id="row-nex-sms-service-code"/);
  assert.match(html, /id="input-nex-sms-service-code"/);
  assert.doesNotMatch(html, /id="input-account-run-history-text-enabled"/);
});

test('updatePhoneVerificationSettingsUI toggles HeroSMS rows from the sms switch', () => {
  const api = new Function(`
const phoneVerificationSectionExpanded = true;
let latestState = {};
const inputPhoneVerificationEnabled = { checked: false };
const rowPhoneVerificationEnabled = { style: { display: 'none' } };
const rowPhoneVerificationFold = { style: { display: 'none' } };
const rowPhoneSmsProvider = { style: { display: 'none' } };
const rowPhoneSmsProviderOrder = { style: { display: 'none' } };
const rowPhoneSmsProviderOrderActions = { style: { display: 'none' } };
const selectPhoneSmsProvider = { value: 'hero-sms' };
const btnTogglePhoneVerificationSection = {
  disabled: false,
  textContent: '',
  title: '',
  setAttribute: () => {},
};
  const DEFAULT_PHONE_SMS_PROVIDER_ORDER = ['hero-sms', '5sim', 'nexsms'];
  const phoneSmsProviderOrderSelection = [];
  function normalizePhoneSmsProviderOrderValue(value = [], fallbackOrder = DEFAULT_PHONE_SMS_PROVIDER_ORDER) {
    const source = Array.isArray(value) ? value : [];
    const normalized = [...source];
    if (normalized.length) {
      return normalized.slice(0, 3);
    }
    if (!Array.isArray(fallbackOrder) || !fallbackOrder.length) {
      return [];
    }
    const fallbackNormalized = [];
    for (const provider of fallbackOrder) {
      if (!fallbackNormalized.includes(provider)) {
        fallbackNormalized.push(provider);
      }
    }
    return fallbackNormalized.slice(0, 3);
  }
  function resolveNormalizedProviderOrderForRuntime(state = {}) {
    const rawOrder = Array.isArray(state?.phoneSmsProviderOrder) ? state.phoneSmsProviderOrder : [];
    const normalizedOrder = normalizePhoneSmsProviderOrderValue(rawOrder, []);
    if (normalizedOrder.length) {
      return normalizedOrder;
    }
    const fallbackProvider = String(state?.phoneSmsProvider || selectPhoneSmsProvider?.value || 'hero-sms').trim().toLowerCase() || 'hero-sms';
    return [fallbackProvider];
  }
function updatePhoneSmsProviderOrderSummary() {}
const rowHeroSmsPlatform = { style: { display: 'none' } };
const rowHeroSmsCountry = { style: { display: 'none' } };
const rowHeroSmsCountryFallback = { style: { display: 'none' } };
const rowHeroSmsAcquirePriority = { style: { display: 'none' } };
const rowHeroSmsApiKey = { style: { display: 'none' } };
const rowHeroSmsMaxPrice = { style: { display: 'none' } };
const rowHeroSmsCurrentNumber = { style: { display: 'none' } };
const rowHeroSmsCurrentCountdown = { style: { display: 'none' } };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const rowHeroSmsCurrentCode = { style: { display: 'none' } };
const rowHeroSmsPreferredActivation = { style: { display: 'none' } };
const rowPhoneVerificationResendCount = { style: { display: 'none' } };
const rowPhoneReplacementLimit = { style: { display: 'none' } };
const rowPhoneCodeWaitSeconds = { style: { display: 'none' } };
const rowPhoneCodeTimeoutWindows = { style: { display: 'none' } };
const rowPhoneCodePollIntervalSeconds = { style: { display: 'none' } };
const rowPhoneCodePollMaxRounds = { style: { display: 'none' } };
const rowFiveSimApiKey = { style: { display: 'none' } };
const rowFiveSimCountry = { style: { display: 'none' } };
const rowFiveSimCountryFallback = { style: { display: 'none' } };
const rowFiveSimOperator = { style: { display: 'none' } };
const rowFiveSimProduct = { style: { display: 'none' } };
const rowNexSmsApiKey = { style: { display: 'none' } };
const rowNexSmsCountry = { style: { display: 'none' } };
const rowNexSmsCountryFallback = { style: { display: 'none' } };
const rowNexSmsServiceCode = { style: { display: 'none' } };

${extractFunction('updatePhoneVerificationSettingsUI')}

return {
  setLatestState: (state) => { latestState = state || {}; },
  rowPhoneVerificationEnabled,
  rowPhoneVerificationFold,
  rowPhoneSmsProvider,
  rowPhoneSmsProviderOrder,
  rowPhoneSmsProviderOrderActions,
  selectPhoneSmsProvider,
  btnTogglePhoneVerificationSection,
  inputPhoneVerificationEnabled,
  rowHeroSmsPlatform,
  rowHeroSmsCountry,
  rowHeroSmsCountryFallback,
  rowHeroSmsAcquirePriority,
  rowHeroSmsApiKey,
  rowHeroSmsMaxPrice,
  rowHeroSmsCurrentNumber,
  rowHeroSmsCurrentCountdown,
  rowHeroSmsPriceTiers,
  rowHeroSmsCurrentCode,
  rowHeroSmsPreferredActivation,
  rowPhoneVerificationResendCount,
  rowPhoneReplacementLimit,
  rowPhoneCodeWaitSeconds,
  rowPhoneCodeTimeoutWindows,
  rowPhoneCodePollIntervalSeconds,
  rowPhoneCodePollMaxRounds,
  rowFiveSimApiKey,
  rowFiveSimCountry,
  rowFiveSimCountryFallback,
  rowFiveSimOperator,
  rowFiveSimProduct,
  rowNexSmsApiKey,
  rowNexSmsCountry,
  rowNexSmsCountryFallback,
  rowNexSmsServiceCode,
  updatePhoneVerificationSettingsUI,
};
`)();

  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationEnabled.style.display, '');
  assert.equal(api.rowPhoneVerificationFold.style.display, 'none');
  assert.equal(api.rowPhoneSmsProvider.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, 'none');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, 'none');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, true);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '展开设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, 'none');
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCountdown.style.display, 'none');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, 'none');
  assert.equal(api.rowHeroSmsPreferredActivation.style.display, 'none');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, 'none');
  assert.equal(api.rowPhoneReplacementLimit.style.display, 'none');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, 'none');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimCountry.style.display, 'none');
  assert.equal(api.rowFiveSimCountryFallback.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowFiveSimProduct.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsCountry.style.display, 'none');
  assert.equal(api.rowNexSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowNexSmsServiceCode.style.display, 'none');

  api.inputPhoneVerificationEnabled.checked = true;
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationFold.style.display, '');
  assert.equal(api.rowPhoneSmsProvider.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrder.style.display, '');
  assert.equal(api.rowPhoneSmsProviderOrderActions.style.display, '');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, false);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '收起设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, '');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, '');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, '');
  assert.equal(api.rowHeroSmsApiKey.style.display, '');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, '');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, '');
  assert.equal(api.rowHeroSmsCurrentCountdown.style.display, '');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, '');
  assert.equal(api.rowHeroSmsPreferredActivation.style.display, '');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, '');
  assert.equal(api.rowPhoneReplacementLimit.style.display, '');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, '');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, '');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, '');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, '');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimCountry.style.display, 'none');
  assert.equal(api.rowFiveSimCountryFallback.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowFiveSimProduct.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsCountry.style.display, 'none');
  assert.equal(api.rowNexSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowNexSmsServiceCode.style.display, 'none');

  api.selectPhoneSmsProvider.value = '5sim';
  api.setLatestState({ phoneSmsProviderOrder: ['5sim'] });
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, '');
  assert.equal(api.rowFiveSimCountry.style.display, '');
  assert.equal(api.rowFiveSimCountryFallback.style.display, '');
  assert.equal(api.rowFiveSimOperator.style.display, '');
  assert.equal(api.rowFiveSimProduct.style.display, '');
  assert.equal(api.rowNexSmsApiKey.style.display, 'none');
  assert.equal(api.rowNexSmsCountry.style.display, 'none');
  assert.equal(api.rowNexSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowNexSmsServiceCode.style.display, 'none');

  api.selectPhoneSmsProvider.value = 'nexsms';
  api.setLatestState({ phoneSmsProviderOrder: ['nexsms'] });
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowFiveSimApiKey.style.display, 'none');
  assert.equal(api.rowFiveSimCountry.style.display, 'none');
  assert.equal(api.rowNexSmsApiKey.style.display, '');
  assert.equal(api.rowNexSmsCountry.style.display, '');
  assert.equal(api.rowNexSmsCountryFallback.style.display, '');
  assert.equal(api.rowNexSmsServiceCode.style.display, '');
});

test('collectSettingsPayload keeps local helper sync enabled while persisting sms toggle state', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
  fiveSimCountryOrder: ['thailand', 'england'],
};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const selectCfDomain = { value: '' };
const selectTempEmailDomain = { value: '' };
const selectPanelMode = { value: 'cpa' };
const inputVpsUrl = { value: '' };
const inputVpsPassword = { value: '' };
const inputSub2ApiUrl = { value: '' };
const inputSub2ApiEmail = { value: '' };
const inputSub2ApiPassword = { value: '' };
const inputSub2ApiGroup = { value: '' };
const inputSub2ApiDefaultProxy = { value: '' };
const inputCodex2ApiUrl = { value: '' };
const inputCodex2ApiAdminKey = { value: '' };
const inputPassword = { value: '' };
const selectMailProvider = { value: '163' };
const selectEmailGenerator = { value: 'duck' };
const checkboxAutoDeleteIcloud = { checked: false };
const selectIcloudHostPreference = { value: 'auto' };
const inputMail2925UseAccountPool = { checked: false };
const inputInbucketHost = { value: '' };
const inputInbucketMailbox = { value: '' };
const inputHotmailRemoteBaseUrl = { value: '' };
const inputHotmailLocalBaseUrl = { value: '' };
const inputLuckmailApiKey = { value: '' };
const inputLuckmailBaseUrl = { value: '' };
const selectLuckmailEmailType = { value: 'ms_graph' };
const inputLuckmailDomain = { value: '' };
const inputTempEmailBaseUrl = { value: '' };
const inputTempEmailAdminAuth = { value: '' };
const inputTempEmailCustomAuth = { value: '' };
const inputTempEmailReceiveMailbox = { value: '' };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputAutoSkipFailures = { checked: false };
const inputAutoSkipFailuresThreadIntervalMinutes = { value: '0' };
const inputAutoDelayEnabled = { checked: false };
const inputAutoDelayMinutes = { value: '30' };
const inputAutoStepDelaySeconds = { value: '' };
const inputPhoneVerificationEnabled = { checked: true };
const selectPhoneSmsProvider = { value: 'hero-sms' };
const inputVerificationResendCount = { value: '4' };
const inputHeroSmsApiKey = { value: 'demo-key' };
const inputFiveSimApiKey = { value: 'five-sim-key' };
const inputFiveSimOperator = { value: 'any' };
const inputFiveSimProduct = { value: 'openai' };
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'price' };
function getSelectedPhonePreferredActivation() {
  return {
    provider: 'hero-sms',
    activationId: 'demo-activation',
    phoneNumber: '66958889999',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  };
}
const inputHeroSmsMaxPrice = { value: '0.12' };
const inputPhoneReplacementLimit = { value: '5' };
const inputPhoneCodeWaitSeconds = { value: '75' };
const inputPhoneCodeTimeoutWindows = { value: '3' };
const inputPhoneCodePollIntervalSeconds = { value: '6' };
const inputPhoneCodePollMaxRounds = { value: '18' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_PHONE_VERIFICATION_REPLACEMENT_LIMIT = 3;
const DEFAULT_PHONE_CODE_WAIT_SECONDS = 60;
const DEFAULT_PHONE_CODE_TIMEOUT_WINDOWS = 2;
const DEFAULT_PHONE_CODE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_PHONE_CODE_POLL_MAX_ROUNDS = 4;
const PHONE_CODE_WAIT_SECONDS_MIN = 15;
const PHONE_CODE_WAIT_SECONDS_MAX = 300;
const PHONE_CODE_TIMEOUT_WINDOWS_MIN = 1;
const PHONE_CODE_TIMEOUT_WINDOWS_MAX = 10;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MIN = 1;
const PHONE_CODE_POLL_INTERVAL_SECONDS_MAX = 30;
const PHONE_CODE_POLL_MAX_ROUNDS_MIN = 1;
const PHONE_CODE_POLL_MAX_ROUNDS_MAX = 120;
const DEFAULT_HERO_SMS_REUSE_ENABLED = true;
const HERO_SMS_ACQUIRE_PRIORITY_COUNTRY = 'country';
const HERO_SMS_ACQUIRE_PRIORITY_PRICE = 'price';
const DEFAULT_HERO_SMS_ACQUIRE_PRIORITY = HERO_SMS_ACQUIRE_PRIORITY_COUNTRY;
const PHONE_REPLACEMENT_LIMIT_MIN = 1;
const PHONE_REPLACEMENT_LIMIT_MAX = 20;
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const selectHeroSmsCountry = {
  value: '52',
  selectedIndex: 0,
  options: [{ textContent: 'Thailand' }],
};
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareDomainValue(value) { return String(value || '').trim(); }
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function normalizeCloudflareTempEmailDomainValue(value) { return String(value || '').trim(); }
function getSelectedLocalCpaStep9Mode() { return 'submit'; }
function getSelectedMail2925Mode() { return 'provide'; }
function getSelectedHotmailServiceMode() { return 'local'; }
function buildManagedAliasBaseEmailPayload() { return { gmailBaseEmail: '', mail2925BaseEmail: '', emailPrefix: '' }; }
function normalizeLuckmailBaseUrl(value) { return String(value || '').trim(); }
function normalizeLuckmailEmailType(value) { return String(value || '').trim() || 'ms_graph'; }
function normalizeCloudflareTempEmailBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeCloudflareTempEmailReceiveMailboxValue(value) { return String(value || '').trim(); }
function normalizeAccountRunHistoryHelperBaseUrlValue(value) { return String(value || '').trim(); }
function normalizeAutoRunThreadIntervalMinutes(value) { return Number(value) || 0; }
function normalizeAutoDelayMinutes(value) { return Number(value) || 30; }
function normalizeAutoStepDelaySeconds(value) { return value === '' ? null : Number(value); }
function normalizeVerificationResendCount(value, fallback) { return Number(value) || fallback; }
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizePhoneVerificationReplacementLimit')}
${extractFunction('normalizePhoneCodeWaitSecondsValue')}
${extractFunction('normalizePhoneCodeTimeoutWindowsValue')}
${extractFunction('normalizePhoneCodePollIntervalSecondsValue')}
${extractFunction('normalizePhoneCodePollMaxRoundsValue')}
${extractFunction('normalizeHeroSmsReuseEnabledValue')}
${extractFunction('normalizeHeroSmsAcquirePriority')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('getSelectedHeroSmsCountryOption')}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 52, label: 'Thailand' }, { id: 16, label: 'United Kingdom' }];
}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.phoneVerificationEnabled, true);
  assert.equal(payload.phoneSmsProvider, 'hero-sms');
  assert.equal(payload.accountRunHistoryTextEnabled, true);
  assert.equal(payload.accountRunHistoryHelperBaseUrl, 'http://127.0.0.1:17373');
  assert.equal(payload.heroSmsApiKey, 'demo-key');
  assert.equal(payload.fiveSimApiKey, 'five-sim-key');
  assert.deepStrictEqual(payload.fiveSimCountryOrder, ['thailand', 'england']);
  assert.equal(payload.fiveSimOperator, 'any');
  assert.equal(payload.fiveSimProduct, 'openai');
  assert.equal(payload.heroSmsReuseEnabled, true);
  assert.equal(payload.heroSmsAcquirePriority, 'price');
  assert.equal(payload.heroSmsMaxPrice, '0.12');
  assert.deepStrictEqual(payload.phonePreferredActivation, {
    provider: 'hero-sms',
    activationId: 'demo-activation',
    phoneNumber: '66958889999',
    countryId: 52,
    countryLabel: 'Thailand',
    successfulUses: 0,
    maxUses: 3,
  });
  assert.equal(payload.phoneVerificationReplacementLimit, 5);
  assert.equal(payload.phoneCodeWaitSeconds, 75);
  assert.equal(payload.phoneCodeTimeoutWindows, 3);
  assert.equal(payload.phoneCodePollIntervalSeconds, 6);
  assert.equal(payload.phoneCodePollMaxRounds, 18);
  assert.equal(payload.heroSmsCountryId, 52);
  assert.equal(payload.heroSmsCountryLabel, 'Thailand');
  assert.deepStrictEqual(payload.heroSmsCountryFallback, [{ id: 16, label: 'United Kingdom' }]);
});

test('hero sms max price input does not auto-save partial typing states', () => {
  assert.match(
    sidepanelSource,
    /inputHeroSmsMaxPrice\?\.\s*addEventListener\('input',\s*\(\)\s*=>\s*\{\s*markSettingsDirty\(true\);\s*\}\);/
  );
  assert.doesNotMatch(
    sidepanelSource,
    /inputHeroSmsMaxPrice\?\.\s*addEventListener\('input',\s*\(\)\s*=>\s*\{\s*markSettingsDirty\(true\);\s*scheduleSettingsAutoSave\(\);/
  );
});
