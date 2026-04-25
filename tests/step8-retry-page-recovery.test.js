const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (char === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('step 8 click effect throws when retry page appears after clicking continue', async () => {
  const api = new Function(`
const chrome = {
  tabs: {
    async get() {
      return {
        id: 88,
        url: 'https://auth.openai.com/authorize',
      };
    },
  },
};

function throwIfStopped() {}
async function sleepWithStop() {}
async function ensureStep8SignupPageReady() {}
async function getStep8PageState() {
  return {
    url: 'https://auth.openai.com/authorize',
    retryPage: true,
    addPhonePage: false,
    consentPage: false,
    verificationPage: false,
  };
}

${extractFunction('waitForStep8ClickEffect')}

return {
  async run() {
    return waitForStep8ClickEffect(88, 'https://auth.openai.com/authorize', 1000);
  },
};
`)();

  await assert.rejects(
    () => api.run(),
    /点击“继续”后页面进入认证页重试页/
  );
});

test('step 8 ready check throws when consent page is already a retry page before clicking', async () => {
  const api = new Function(`
const chrome = {
  tabs: {
    async get() {
      return {
        id: 88,
        url: 'https://auth.openai.com/authorize',
      };
    },
  },
};

function throwIfStopped() {}
async function sleepWithStop() {}
async function ensureStep8SignupPageReady() {}
async function getStep8PageState() {
  return {
    url: 'https://auth.openai.com/authorize',
    retryPage: true,
    addPhonePage: false,
    consentReady: false,
  };
}

${extractFunction('waitForStep8Ready')}

return {
  async run() {
    return waitForStep8Ready(88, 1000);
  },
};
`)();

  await assert.rejects(
    () => api.run(),
    /当前认证页已进入重试页/
  );
});

test('step 8 ready check completes phone verification flow before waiting for OAuth consent', async () => {
  const api = new Function(`
let pollCount = 0;
const phoneVerificationCalls = [];

function throwIfStopped() {}
async function sleepWithStop() {}
async function ensureStep8SignupPageReady() {}
const phoneVerificationHelpers = {
  async completePhoneVerificationFlow(tabId, pageState) {
    phoneVerificationCalls.push({ tabId, pageState });
    return {
      success: true,
      consentReady: true,
      url: 'https://auth.openai.com/authorize',
    };
  },
};
async function getStep8PageState() {
  pollCount += 1;
  if (pollCount === 1) {
    return {
      url: 'https://auth.openai.com/add-phone',
      addPhonePage: true,
      phoneVerificationPage: false,
      consentReady: false,
    };
  }
  return {
    url: 'https://auth.openai.com/authorize',
    addPhonePage: false,
    phoneVerificationPage: false,
    consentReady: true,
  };
}

${extractFunction('waitForStep8Ready')}

return {
  async run() {
    return {
      result: await waitForStep8Ready(88, 1000),
      phoneVerificationCalls,
    };
  },
};
`)();

  const { result, phoneVerificationCalls } = await api.run();

  assert.deepStrictEqual(phoneVerificationCalls, [
    {
      tabId: 88,
      pageState: {
        url: 'https://auth.openai.com/add-phone',
        addPhonePage: true,
        phoneVerificationPage: false,
        consentReady: false,
      },
    },
  ]);
  assert.deepStrictEqual(result, {
    url: 'https://auth.openai.com/authorize',
    addPhonePage: false,
    phoneVerificationPage: false,
    consentReady: true,
  });
});
