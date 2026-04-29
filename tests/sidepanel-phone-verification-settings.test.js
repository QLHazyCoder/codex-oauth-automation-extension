const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  normalizeIcloudForwardMailProvider,
  normalizeIcloudTargetMailboxType,
} = require('../mail-provider-utils');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');
const ipProxyPanelSource = fs.readFileSync('sidepanel/ip-proxy-panel.js', 'utf8');

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
  assert.match(html, /id="input-phone-verification-enabled"/);
  assert.match(html, /id="ip-proxy-section"/);
  assert.match(html, /id="row-ip-proxy-enabled"/);
  assert.match(html, /id="input-ip-proxy-enabled"/);
  assert.match(html, /id="row-hero-sms-platform"/);
  assert.match(html, /id="row-hero-sms-country"/);
  assert.match(html, /id="row-hero-sms-max-price"/);
  assert.match(html, /id="row-hero-sms-api-key"/);
  assert.doesNotMatch(html, /id="input-account-run-history-text-enabled"/);
});

test('sidepanel renders IP proxy as a standalone card after sms verification without proxy status chrome', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const phoneToggleIndex = html.indexOf('id="row-phone-verification-enabled"');
  const ipProxySectionIndex = html.indexOf('id="ip-proxy-section"');
  const ipProxyToggleIndex = html.indexOf('id="row-ip-proxy-enabled"');
  const cloudflareSectionIndex = html.indexOf('id="cloudflare-temp-email-section"');

  assert.match(html, /id="ip-proxy-section" class="data-card ip-proxy-card"/);
  assert.match(html, /id="btn-toggle-ip-proxy-section"/);
  assert.match(html, /aria-controls="row-ip-proxy-fold"/);
  assert.match(html, />展开设置<\/button>/);
  assert.ok(phoneToggleIndex >= 0);
  assert.ok(ipProxySectionIndex > phoneToggleIndex);
  assert.ok(ipProxyToggleIndex > phoneToggleIndex);
  assert.ok(cloudflareSectionIndex > ipProxySectionIndex);
  assert.doesNotMatch(html, /id="ip-proxy-enabled-status"/);
  assert.doesNotMatch(html, /id="row-ip-proxy-runtime-status"/);
});

test('IP proxy standalone card supports persisted collapse control', () => {
  assert.match(ipProxyPanelSource, /IP_PROXY_SECTION_EXPANDED_STORAGE_KEY = 'multipage-ip-proxy-section-expanded'/);
  assert.match(ipProxyPanelSource, /let ipProxySectionExpanded = false/);
  assert.match(ipProxyPanelSource, /const showSettings = enabled && ipProxySectionExpanded/);
  assert.match(ipProxyPanelSource, /rowIpProxyFold\.style\.display = showSettings \? '' : 'none'/);
  assert.match(ipProxyPanelSource, /btnToggleIpProxySection\.setAttribute\('aria-expanded', String\(showSettings\)\)/);
  assert.match(sidepanelSource, /btnToggleIpProxySection\?\.addEventListener\('click', \(\) => \{\s*if \(typeof toggleIpProxySectionExpanded === 'function'\)/);
  assert.match(sidepanelSource, /initIpProxySectionExpandedState\(\)/);
});

test('updatePhoneVerificationSettingsUI toggles HeroSMS rows from the sms switch', () => {
  const api = new Function(`
const inputPhoneVerificationEnabled = { checked: false };
const rowHeroSmsPlatform = { style: { display: 'none' } };
const rowHeroSmsCountry = { style: { display: 'none' } };
const rowHeroSmsMaxPrice = { style: { display: 'none' } };
const rowHeroSmsApiKey = { style: { display: 'none' } };

${extractFunction('updatePhoneVerificationSettingsUI')}

return {
  inputPhoneVerificationEnabled,
  rowHeroSmsPlatform,
  rowHeroSmsCountry,
  rowHeroSmsMaxPrice,
  rowHeroSmsApiKey,
  updatePhoneVerificationSettingsUI,
};
`)();

  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowHeroSmsPlatform.style.display, 'none');
  assert.equal(api.rowHeroSmsCountry.style.display, 'none');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, 'none');
  assert.equal(api.rowHeroSmsApiKey.style.display, 'none');

  api.inputPhoneVerificationEnabled.checked = true;
  api.updatePhoneVerificationSettingsUI();
  assert.equal(api.rowHeroSmsPlatform.style.display, '');
  assert.equal(api.rowHeroSmsCountry.style.display, '');
  assert.equal(api.rowHeroSmsMaxPrice.style.display, '');
  assert.equal(api.rowHeroSmsApiKey.style.display, '');
});

test('collectSettingsPayload keeps local helper sync enabled while persisting sms toggle state', () => {
  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
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
const inputVerificationResendCount = { value: '4' };
const inputHeroSmsApiKey = { value: 'demo-key' };
const inputHeroSmsMaxPrice = { value: '0.08' };
const inputAccountRunHistoryHelperBaseUrl = { value: 'http://127.0.0.1:17373' };
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
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
${extractFunction('normalizeHeroSmsCountryId')}
${extractFunction('normalizeHeroSmsCountryLabel')}
${extractFunction('normalizeHeroSmsMaxPriceValue')}
${extractFunction('getSelectedHeroSmsCountryOption')}
${extractFunction('collectSettingsPayload')}
return { collectSettingsPayload };
`)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  const payload = api.collectSettingsPayload();

  assert.equal(payload.phoneVerificationEnabled, true);
  assert.equal(payload.accountRunHistoryTextEnabled, true);
  assert.equal(payload.accountRunHistoryHelperBaseUrl, 'http://127.0.0.1:17373');
  assert.equal(payload.heroSmsApiKey, 'demo-key');
  assert.equal(payload.heroSmsMaxPrice, '0.08');
  assert.equal(payload.heroSmsCountryId, 52);
  assert.equal(payload.heroSmsCountryLabel, 'Thailand');
});
