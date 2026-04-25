const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const signupFlowSource = fs.readFileSync('background/signup-flow-helpers.js', 'utf8');
const signupFlowGlobalScope = {};
const signupFlowApi = new Function('self', `${signupFlowSource}; return self.MultiPageSignupFlowHelpers;`)(signupFlowGlobalScope);

test('signup flow helper allocates mail2925 account before generating alias email', async () => {
  const calls = {
    ensureMail2925: [],
    buildAlias: 0,
    setEmail: [],
  };

  const helpers = signupFlowApi.createSignupFlowHelpers({
    buildGeneratedAliasEmail: (state) => {
      calls.buildAlias += 1;
      assert.equal(state.currentMail2925AccountId, 'acc-2');
      return 'demo123456@2925.com';
    },
    chrome: { tabs: { get: async () => ({ id: 1, url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async () => {},
    ensureHotmailAccountForFlow: async () => ({}),
    ensureMail2925AccountForFlow: async (options) => {
      calls.ensureMail2925.push(options);
      return { id: 'acc-2', email: 'demo@2925.com' };
    },
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => true,
    isReusableGeneratedAliasEmail: () => false,
    isHotmailProvider: () => false,
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: () => false,
    isSignupPasswordPageUrl: () => true,
    reuseOrCreateTab: async () => 1,
    sendToContentScriptResilient: async () => ({}),
    setEmailState: async (email) => {
      calls.setEmail.push(email);
    },
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabUrlMatch: async () => null,
  });

  const email = await helpers.resolveSignupEmailForFlow({
    mailProvider: '2925',
    mail2925UseAccountPool: true,
    currentMail2925AccountId: 'acc-2',
    email: '',
  });

  assert.equal(email, 'demo123456@2925.com');
  assert.deepStrictEqual(calls.ensureMail2925, [
    {
      allowAllocate: true,
      preferredAccountId: 'acc-2',
      markUsed: true,
    },
  ]);
  assert.equal(calls.buildAlias, 1);
  assert.deepStrictEqual(calls.setEmail, ['demo123456@2925.com']);
});

test('signup flow helper skips mail2925 account allocation when account pool switch is off', async () => {
  const calls = {
    ensureMail2925: 0,
  };

  const helpers = signupFlowApi.createSignupFlowHelpers({
    buildGeneratedAliasEmail: () => 'manual123456@2925.com',
    chrome: { tabs: { get: async () => ({ id: 1, url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async () => {},
    ensureHotmailAccountForFlow: async () => ({}),
    ensureMail2925AccountForFlow: async () => {
      calls.ensureMail2925 += 1;
      return { id: 'acc-2', email: 'demo@2925.com' };
    },
    ensureLuckmailPurchaseForFlow: async () => ({}),
    isGeneratedAliasProvider: () => true,
    isReusableGeneratedAliasEmail: () => false,
    isHotmailProvider: () => false,
    isLuckmailProvider: () => false,
    isSignupEmailVerificationPageUrl: () => false,
    isSignupPasswordPageUrl: () => true,
    reuseOrCreateTab: async () => 1,
    sendToContentScriptResilient: async () => ({}),
    setEmailState: async () => {},
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_PAGE_INJECT_FILES: [],
    waitForTabUrlMatch: async () => null,
  });

  const email = await helpers.resolveSignupEmailForFlow({
    mailProvider: '2925',
    mail2925UseAccountPool: false,
    currentMail2925AccountId: 'acc-2',
    email: '',
  });

  assert.equal(email, 'manual123456@2925.com');
  assert.equal(calls.ensureMail2925, 0);
});
