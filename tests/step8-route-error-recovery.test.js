const assert = require('node:assert/strict');
const fs = require('node:fs');

const signupSource = fs.readFileSync('content/signup-page.js', 'utf8');
const bgSource = fs.readFileSync('background.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((m) => source.indexOf(m)).find((i) => i >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for function ${name}`);

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return source.slice(start, end);
}

(function testStep8StateReportsRouteError() {
  const api = new Function(`
const AUTH_TIMEOUT_ERROR_TITLE_PATTERN = /糟糕，出错了|something\s+went\s+wrong|oops/i;
const STEP8_ROUTE_ERROR_DETAIL_PATTERN = new RegExp('Route\\\\s+Error|Invalid\\\\s+content\\\\s+type|text\\\\/html|Method\\\\s+Not\\\\s+Allowed|did\\\\s+not\\\\s+provide\\\\s+an\\\\s+action', 'i');
${extractFunction(signupSource, 'getStep8RouteErrorPageState')}
${extractFunction(signupSource, 'getStep8State')}
function getAuthRetryButton() { return { id: 'retry' }; }
function isActionEnabled() { return true; }
function getPageTextSnapshot() { return '糟糕，出错了！ Route Error (400 Invalid content type: text/html; charset=UTF-8) 重试'; }
function isVerificationPageStillVisible() { return false; }
function isAddPhonePageReady() { return false; }
function isOAuthConsentPage() { return false; }
function isStep8Ready() { return false; }
function getPrimaryContinueButton() { return null; }
function isButtonEnabled() { return false; }
function getActionText() { return ''; }
const location = { href: 'https://auth.openai.com/u/login/identifier', pathname: '/u/login/identifier' };
const document = { title: '糟糕，出错了！' };
return { getStep8State, getStep8RouteErrorPageState };
`)();

  const routeError = api.getStep8RouteErrorPageState();
  assert.ok(routeError, 'step8 route error 页面应被识别');
  const state = api.getStep8State();
  assert.strictEqual(state.routeError, true, 'getStep8State 应暴露 routeError=true');
  assert.strictEqual(state.retryEnabled, true, 'getStep8State 应暴露 retryEnabled=true');
})();

(function testStep8RecoverRouteErrorClicksRetry() {
  const api = new Function(`
const AUTH_TIMEOUT_ERROR_TITLE_PATTERN = /糟糕，出错了|something\s+went\s+wrong|oops/i;
const STEP8_ROUTE_ERROR_DETAIL_PATTERN = new RegExp('Route\\\\s+Error|Invalid\\\\s+content\\\\s+type|text\\\\/html|Method\\\\s+Not\\\\s+Allowed|did\\\\s+not\\\\s+provide\\\\s+an\\\\s+action', 'i');
const events = [];
${extractFunction(signupSource, 'getStep8RouteErrorPageState')}
${extractFunction(signupSource, 'getStep8State')}
${extractFunction(signupSource, 'step8_recoverRouteError')}
function getAuthRetryButton() { return retryButton; }
function isActionEnabled() { return true; }
function getPageTextSnapshot() { return '糟糕，出错了！ Route Error (400 Invalid content type: text/html; charset=UTF-8) 重试'; }
function isVerificationPageStillVisible() { return false; }
function isAddPhonePageReady() { return false; }
function isOAuthConsentPage() { return false; }
function isStep8Ready() { return false; }
function getPrimaryContinueButton() { return null; }
function isButtonEnabled() { return false; }
function getActionText() { return ''; }
function simulateClick(target) { events.push({ type: 'click', target }); }
function log(message) { events.push({ type: 'log', message }); }
const retryButton = { id: 'retry', click() { events.push({ type: 'native-click' }); } };
const location = { href: 'https://auth.openai.com/u/login/identifier', pathname: '/u/login/identifier' };
const document = { title: '糟糕，出错了！' };
return { step8_recoverRouteError, getEvents() { return events; } };
`)();

  api.step8_recoverRouteError({ strategy: 'simulateClick' });
  assert.ok(api.getEvents().some((event) => event.type === 'click' && event.target?.id === 'retry'), 'step8 route error 恢复应点击重试按钮');
})();

(async function testWaitForStep8ClickEffectDetectsRouteError() {
  const api = new Function(`
${extractFunction(bgSource, 'waitForStep8ClickEffect')}
async function getStep8PageState() {
  return {
    url: 'https://auth.openai.com/u/login/identifier',
    routeError: true,
    retryEnabled: true,
    addPhonePage: false,
  };
}
function throwIfStopped() {}
async function sleepWithStop() {}
const chrome = {
  tabs: {
    async get() { return { id: 88, url: 'https://auth.openai.com/consent' }; },
  },
};
return { waitForStep8ClickEffect };
`)();

  const effect = await api.waitForStep8ClickEffect(88, 'https://auth.openai.com/consent', 1000);
  assert.deepStrictEqual(
    effect,
    {
      progressed: false,
      reason: 'route_error',
      url: 'https://auth.openai.com/u/login/identifier',
      retryEnabled: true,
    },
    'waitForStep8ClickEffect 应把 400/Route Error 页识别为 route_error'
  );
})();

(async function testRecoverStep8RouteErrorSendsRecoveryCommand() {
  const api = new Function(`
${extractFunction(bgSource, 'recoverStep8RouteError')}
const sentMessages = [];
async function sendToContentScriptResilient(source, message) {
  sentMessages.push({ source, type: message.type, strategy: message.payload?.strategy || '' });
  return { ok: true };
}
async function sleepWithStop() {}
return {
  recoverStep8RouteError,
  getSentMessages() { return sentMessages; },
};
`)();

  await api.recoverStep8RouteError(88);
  assert.deepStrictEqual(
    api.getSentMessages(),
    [{ source: 'signup-page', type: 'STEP8_RECOVER_ROUTE_ERROR', strategy: 'simulateClick' }],
    'background 应向 signup-page 发送 Step 8 Route Error 恢复命令'
  );
})();

console.log('step8 route error recovery tests passed');
