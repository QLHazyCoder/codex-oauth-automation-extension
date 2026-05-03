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

test('sidepanel html exposes phone verification toggle and multi-provider SMS rows', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="row-phone-verification-enabled"/);
  assert.match(html, /id="btn-toggle-phone-verification-section"/);
  assert.match(html, /id="row-phone-verification-fold"/);
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="row-hero-sms-platform"/);
  assert.match(html, /id="select-phone-sms-provider"/);
  assert.match(html, /\.\.\/phone-sms\/providers\/hero-sms\.js/);
  assert.match(html, /\.\.\/phone-sms\/providers\/five-sim\.js/);
  assert.match(html, /\.\.\/phone-sms\/providers\/registry\.js/);
  assert.match(html, /<option value="hero-sms">HeroSMS<\/option>/);
  assert.match(html, /<option value="5sim">5sim<\/option>/);
  assert.match(html, /id="row-hero-sms-country"/);
  assert.match(html, /id="row-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-acquire-priority"/);
  assert.match(html, /id="select-hero-sms-country"[^>]*multiple/);
  assert.doesNotMatch(html, /id="select-hero-sms-country-fallback"/);
  assert.match(html, /id="row-hero-sms-api-key"/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="btn-phone-sms-balance"/);
  assert.match(html, /id="display-phone-sms-balance"/);
  assert.match(html, /id="row-five-sim-operator"/);
  assert.match(html, /id="input-five-sim-operator"/);
  assert.match(html, /id="row-hero-sms-current-number"/);
  assert.match(html, /id="row-hero-sms-price-tiers"/);
  assert.match(html, /id="row-hero-sms-current-code"/);
  assert.match(html, /id="row-phone-replacement-limit"/);
  assert.match(html, /id="row-phone-verification-resend-count"/);
  assert.match(html, /id="row-phone-code-wait-seconds"/);
  assert.match(html, /id="row-phone-code-timeout-windows"/);
  assert.match(html, /id="row-phone-code-poll-interval-seconds"/);
  assert.match(html, /id="row-phone-code-poll-max-rounds"/);
  assert.doesNotMatch(html, /id="input-account-run-history-text-enabled"/);
});

test('updatePhoneVerificationSettingsUI toggles SMS rows from the sms switch and provider selection', () => {
  const api = new Function(`
const phoneVerificationSectionExpanded = true;
const inputPhoneVerificationEnabled = { checked: false };
const rowPhoneVerificationEnabled = { style: { display: 'none' } };
const rowPhoneVerificationFold = { style: { display: 'none' } };
const btnTogglePhoneVerificationSection = {
  disabled: false,
  textContent: '',
  title: '',
  setAttribute: () => {},
};
const rowHeroSmsPlatform = { style: { display: 'none' } };
const rowHeroSmsCountry = { style: { display: 'none' } };
const rowHeroSmsCountryFallback = { style: { display: 'none' } };
const rowHeroSmsAcquirePriority = { style: { display: 'none' } };
const rowHeroSmsApiKey = { style: { display: 'none' } };
const rowHeroSmsMaxPrice = { style: { display: 'none' } };
const rowFiveSimOperator = { style: { display: 'none' } };
const rowHeroSmsCurrentNumber = { style: { display: 'none' } };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const rowHeroSmsCurrentCode = { style: { display: 'none' } };
const rowPhoneVerificationResendCount = { style: { display: 'none' } };
const rowPhoneReplacementLimit = { style: { display: 'none' } };
const rowPhoneCodeWaitSeconds = { style: { display: 'none' } };
const rowPhoneCodeTimeoutWindows = { style: { display: 'none' } };
const rowPhoneCodePollIntervalSeconds = { style: { display: 'none' } };
const rowPhoneCodePollMaxRounds = { style: { display: 'none' } };
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
let selectedPhoneSmsProvider = PHONE_SMS_PROVIDER_HERO_SMS;
function getSelectedPhoneSmsProvider() { return selectedPhoneSmsProvider; }
function isFiveSimProviderSelected() { return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM; }
function updateHeroSmsPlatformDisplay() {}

${extractFunction('updatePhoneVerificationSettingsUI')}

return {
  rowPhoneVerificationEnabled,
  rowPhoneVerificationFold,
  btnTogglePhoneVerificationSection,
  inputPhoneVerificationEnabled,
  rowHeroSmsPlatform,
  rowHeroSmsCountry,
  rowHeroSmsCountryFallback,
  rowHeroSmsAcquirePriority,
  rowHeroSmsApiKey,
  rowHeroSmsMaxPrice,
  rowFiveSimOperator,
  rowHeroSmsCurrentNumber,
  rowHeroSmsPriceTiers,
  rowHeroSmsCurrentCode,
  rowPhoneVerificationResendCount,
  rowPhoneReplacementLimit,
  rowPhoneCodeWaitSeconds,
  rowPhoneCodeTimeoutWindows,
  rowPhoneCodePollIntervalSeconds,
  rowPhoneCodePollMaxRounds,
  setSelectedPhoneSmsProvider(value) { selectedPhoneSmsProvider = value; },
  updatePhoneVerificationSettingsUI,
};
`)();

  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationEnabled.style.display, '');
  assert.equal(api.rowPhoneVerificationFold.style.display, 'none');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, true);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '展开设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, 'none');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, 'none');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, 'none');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, 'none');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, 'none');
  assert.equal(api.rowPhoneReplacementLimit.style.display, 'none');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, 'none');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, 'none');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, 'none');

  api.inputPhoneVerificationEnabled.checked = true;
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowPhoneVerificationFold.style.display, '');
  assert.equal(api.btnTogglePhoneVerificationSection.disabled, false);
  assert.equal(api.btnTogglePhoneVerificationSection.textContent, '收起设置');
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, '');
  assert.equal(api.rowHeroSmsCountryFallback.style.display, '');
  assert.equal(api.rowHeroSmsAcquirePriority.style.display, '');
  assert.equal(api.rowHeroSmsApiKey.style.display, '');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, '');
  assert.equal(api.rowFiveSimOperator.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentNumber.style.display, '');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, 'none');
  assert.equal(api.rowHeroSmsCurrentCode.style.display, '');
  assert.equal(api.rowPhoneVerificationResendCount.style.display, '');
  assert.equal(api.rowPhoneReplacementLimit.style.display, '');
  assert.equal(api.rowPhoneCodeWaitSeconds.style.display, '');
  assert.equal(api.rowPhoneCodeTimeoutWindows.style.display, '');
  assert.equal(api.rowPhoneCodePollIntervalSeconds.style.display, '');
  assert.equal(api.rowPhoneCodePollMaxRounds.style.display, '');

  api.setSelectedPhoneSmsProvider('5sim');
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowFiveSimOperator.style.display, '');
});

test('collectSettingsPayload keeps local helper sync enabled while persisting sms toggle state', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
const window = {};
let latestState = {
  contributionMode: false,
  mail2925UseAccountPool: false,
  currentMail2925AccountId: '',
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
const inputHeroSmsReuseEnabled = { checked: true };
const selectHeroSmsAcquirePriority = { value: 'price' };
const inputHeroSmsMaxPrice = { value: '0.12' };
const inputFiveSimOperator = { value: 'any' };
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
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const DEFAULT_PHONE_SMS_PROVIDER = PHONE_SMS_PROVIDER_HERO_SMS;
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
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
function getSelectedPlusPaymentMethod() { return 'paypal'; }
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
${extractFunction('normalizePhoneSmsProvider')}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProvider(selectPhoneSmsProvider?.value || latestState?.phoneSmsProvider); }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeFiveSimCountryFallbackList')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
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
  assert.equal(payload.heroSmsReuseEnabled, true);
  assert.equal(payload.heroSmsAcquirePriority, 'price');
  assert.equal(payload.heroSmsMaxPrice, '0.12');
  assert.equal(payload.phoneVerificationReplacementLimit, 5);
  assert.equal(payload.phoneCodeWaitSeconds, 75);
  assert.equal(payload.phoneCodeTimeoutWindows, 3);
  assert.equal(payload.phoneCodePollIntervalSeconds, 6);
  assert.equal(payload.phoneCodePollMaxRounds, 18);
  assert.equal(payload.heroSmsCountryId, 52);
  assert.equal(payload.heroSmsCountryLabel, 'Thailand');
  assert.deepStrictEqual(payload.heroSmsCountryFallback, [{ id: 16, label: 'United Kingdom' }]);
  assert.equal(payload.fiveSimApiKey, '');
  assert.equal(payload.fiveSimCountryId, 'vietnam');
});

test('switchPhoneSmsProvider saves API keys independently when the select value has already changed', async () => {
  const api = new Function(`
let latestState = {
  phoneSmsProvider: 'hero-sms',
  heroSmsApiKey: 'hero-old',
  fiveSimApiKey: 'five-old',
  heroSmsMaxPrice: '0.11',
  fiveSimMaxPrice: '12',
  heroSmsCountryId: 52,
  heroSmsCountryLabel: 'Thailand',
  heroSmsCountryFallback: [],
  fiveSimCountryId: 'vietnam',
  fiveSimCountryLabel: '越南 (Vietnam)',
  fiveSimCountryFallback: [],
  fiveSimOperator: 'any',
};
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const DEFAULT_HERO_SMS_COUNTRY_ID = 52;
const DEFAULT_HERO_SMS_COUNTRY_LABEL = 'Thailand';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const selectPhoneSmsProvider = { value: 'hero-sms', dataset: { activeProvider: 'hero-sms' } };
const inputHeroSmsApiKey = { value: 'hero-live' };
const inputHeroSmsMaxPrice = { value: '0.22' };
const inputFiveSimOperator = { value: 'any' };
const displayHeroSmsPriceTiers = { textContent: '' };
const displayPhoneSmsBalance = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: '' } };
let heroSmsCountrySelectionOrder = [];
let savedPayload = null;

${extractFunction('normalizePhoneSmsProvider')}
${extractFunction('setPhoneSmsProviderSelectValue')}
${extractFunction('getLastAppliedPhoneSmsProvider')}
function getSelectedPhoneSmsProvider() { return normalizePhoneSmsProvider(selectPhoneSmsProvider?.value || latestState?.phoneSmsProvider); }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('normalizeHeroSmsCountryFallbackList')}
${extractFunction('normalizeFiveSimCountryFallbackList')}
function getSelectedHeroSmsCountryOption() {
  return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM
    ? { id: latestState.fiveSimCountryId || DEFAULT_FIVE_SIM_COUNTRY_ID, label: latestState.fiveSimCountryLabel || DEFAULT_FIVE_SIM_COUNTRY_LABEL }
    : { id: latestState.heroSmsCountryId || DEFAULT_HERO_SMS_COUNTRY_ID, label: latestState.heroSmsCountryLabel || DEFAULT_HERO_SMS_COUNTRY_LABEL };
}
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return getSelectedPhoneSmsProvider() === PHONE_SMS_PROVIDER_FIVE_SIM
    ? [{ id: 'vietnam', label: '越南 (Vietnam)' }]
    : [{ id: 52, label: 'Thailand' }];
}
function syncLatestState(patch) { latestState = { ...latestState, ...patch }; }
function loadHeroSmsCountries() { return Promise.resolve(); }
function applyHeroSmsFallbackSelection() {}
function updatePhoneVerificationSettingsUI() {}
function markSettingsDirty() {}
function saveSettings() { savedPayload = { ...latestState }; return Promise.resolve(); }

${extractFunction('switchPhoneSmsProvider')}

return {
  selectPhoneSmsProvider,
  inputHeroSmsApiKey,
  get latestState() { return latestState; },
  get savedPayload() { return savedPayload; },
  switchPhoneSmsProvider,
};
`)();

  // Browser change events update <select>.value before the listener runs.
  api.selectPhoneSmsProvider.value = '5sim';
  await api.switchPhoneSmsProvider(api.selectPhoneSmsProvider.value);

  assert.equal(api.latestState.phoneSmsProvider, '5sim');
  assert.equal(api.latestState.heroSmsApiKey, 'hero-live');
  assert.equal(api.latestState.fiveSimApiKey, 'five-old');
  assert.equal(api.inputHeroSmsApiKey.value, 'five-old');
  assert.equal(api.selectPhoneSmsProvider.dataset.activeProvider, '5sim');

  api.inputHeroSmsApiKey.value = 'five-live';
  api.selectPhoneSmsProvider.value = 'hero-sms';
  await api.switchPhoneSmsProvider(api.selectPhoneSmsProvider.value);

  assert.equal(api.latestState.phoneSmsProvider, 'hero-sms');
  assert.equal(api.latestState.heroSmsApiKey, 'hero-live');
  assert.equal(api.latestState.fiveSimApiKey, 'five-live');
  assert.equal(api.inputHeroSmsApiKey.value, 'hero-live');
  assert.equal(api.selectPhoneSmsProvider.dataset.activeProvider, 'hero-sms');
  assert.equal(api.savedPayload.heroSmsApiKey, 'hero-live');
  assert.equal(api.savedPayload.fiveSimApiKey, 'five-live');
});

test('formatPhoneSmsPriceEntriesSummary treats HeroSMS physicalCount=0 as out of stock even when count is positive', () => {
  const api = new Function(`
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatPhoneSmsPriceEntriesSummary')}
return { formatPhoneSmsPriceEntriesSummary };
`)();

  const summary = api.formatPhoneSmsPriceEntriesSummary({
    52: {
      dr: {
        cost: 0.05,
        count: 3,
        physicalCount: 0,
      },
    },
  });

  assert.deepStrictEqual(summary.inStockPrices, []);
  assert.deepStrictEqual(summary.allPrices, [0.05]);
  assert.equal(summary.entries[0].inStock, false);
  assert.equal(summary.entries[0].stockCount, 0);
});

test('previewHeroSmsPriceTiers prefers 5sim products price for buy-compatible any operator', async () => {
  const api = new Function(`
let latestState = { phoneSmsProvider: '5sim', fiveSimOperator: 'any' };
const PHONE_SMS_PROVIDER_HERO_SMS = 'hero-sms';
const PHONE_SMS_PROVIDER_FIVE_SIM = '5sim';
const DEFAULT_FIVE_SIM_COUNTRY_ID = 'vietnam';
const DEFAULT_FIVE_SIM_COUNTRY_LABEL = '越南 (Vietnam)';
const DEFAULT_FIVE_SIM_OPERATOR = 'any';
const FIVE_SIM_SUPPORTED_COUNTRY_ID_SET = new Set(['indonesia', 'thailand', 'vietnam']);
const HERO_SMS_SUPPORTED_COUNTRY_ID_SET = new Set(['6', '52', '10']);
const inputHeroSmsMaxPrice = { value: '' };
const inputHeroSmsApiKey = { value: '' };
const inputFiveSimOperator = { value: 'any' };
const displayHeroSmsPriceTiers = { textContent: '' };
const rowHeroSmsPriceTiers = { style: { display: 'none' } };
const fetchCalls = [];

${extractFunction('normalizePhoneSmsProvider')}
function getSelectedPhoneSmsProvider() { return '5sim'; }
${extractFunction('normalizeFiveSimCountryId')}
${extractFunction('normalizeFiveSimCountryLabel')}
${extractFunction('normalizeFiveSimOperator')}
${extractFunction('normalizePhoneSmsMaxPriceValue')}
${extractFunction('normalizeFiveSimMaxPriceValue')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('normalizeHeroSmsPriceForPreview')}
${extractFunction('formatHeroSmsPriceForPreview')}
${extractFunction('isHeroSmsPreviewEmptyPayload')}
${extractFunction('collectHeroSmsPriceEntriesForPreview')}
${extractFunction('formatPhoneSmsPriceEntriesSummary')}
${extractFunction('describeHeroSmsPreviewPayload')}
${extractFunction('summarizeHeroSmsPreviewError')}
function normalizeHeroSmsFetchErrorMessage(error) { return error?.message || String(error); }
function syncHeroSmsFallbackSelectionOrderFromSelect() {
  return [{ id: 'vietnam', label: '越南 (Vietnam)' }];
}
function getSelectedHeroSmsCountryOption() {
  return { id: 'vietnam', label: '越南 (Vietnam)' };
}
function normalizePhoneSmsCountryId(value) { return normalizeFiveSimCountryId(value); }
function normalizePhoneSmsCountryLabel(value) { return normalizeFiveSimCountryLabel(value); }
function getHeroSmsCountryLabelById() { return '越南 (Vietnam)'; }
async function fetch(url, options = {}) {
  const parsed = new URL(url);
  fetchCalls.push({ url: parsed, options });
  if (parsed.pathname === '/v1/guest/products/vietnam/any') {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ openai: { Category: 'activation', Qty: 4609, Price: 0.08 } }),
    };
  }
  if (parsed.pathname === '/v1/guest/prices') {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        vietnam: {
          openai: {
            virtual21: { cost: 0.0769, count: 0 },
            virtual47: { cost: 0.1282, count: 4608 },
          },
        },
      }),
    };
  }
  throw new Error('unexpected ' + parsed.pathname);
}

${extractFunction('previewHeroSmsPriceTiers')}

return {
  displayHeroSmsPriceTiers,
  rowHeroSmsPriceTiers,
  fetchCalls,
  previewHeroSmsPriceTiers,
};
`)();

  await api.previewHeroSmsPriceTiers();

  assert.equal(api.displayHeroSmsPriceTiers.textContent, '越南 (Vietnam): 最低 0.08');
  assert.equal(api.rowHeroSmsPriceTiers.style.display, '');
  assert.deepStrictEqual(
    api.fetchCalls.map((entry) => entry.url.pathname),
    ['/v1/guest/products/vietnam/any', '/v1/guest/prices']
  );
});
