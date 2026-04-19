const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
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

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

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

async function testStep10DismissesOnboardingBeforeLogout() {
const api = new Function(`
const events = [];
let waitCalls = 0;
let menuOpened = false;
const trigger = { tagName: 'DIV' };
const logoutAction = { tagName: 'BUTTON' };

function log(message) {
  events.push({ type: 'log', message });
}

function reportComplete(step, payload) {
  events.push({ type: 'complete', step, payload });
}

function isChatGptLoggedOutSurface() {
  return false;
}

async function waitForChatGptLogoutPreparation() {
  waitCalls += 1;
  if (waitCalls === 1) {
    return { surface: 'onboarding' };
  }
  return { surface: 'account_menu', trigger };
}

async function dismissChatGptOnboardingBeforeLogout() {
  events.push({ type: 'dismiss-onboarding' });
}

async function sleep(ms) {
  events.push({ type: 'sleep', ms });
}

function findChatGptLogoutAction() {
  return menuOpened ? logoutAction : null;
}

function isDialogActionElement() {
  return false;
}

async function humanPause() {}

function simulateClick(target) {
  events.push({ type: 'click', target: target === logoutAction ? 'logout' : 'other' });
}

function findChatGptAccountMenuTrigger() {
  return trigger;
}

async function openChatGptAccountMenu(target) {
  menuOpened = true;
  events.push({ type: 'open-menu', target: target === trigger ? 'trigger' : 'other' });
}

async function waitForChatGptLogoutConfirmDialog() {
  events.push({ type: 'wait-confirm' });
  return logoutAction;
}

async function waitForChatGptLoggedOutState() {
  events.push({ type: 'wait-logged-out' });
  return { loggedOut: true, url: 'https://chatgpt.com/' };
}

${extractFunction('step10_logout')}

return {
  step10_logout,
  getEvents() {
    return events;
  },
};
`)();

  const result = await api.step10_logout();
  assert.deepStrictEqual(result, { loggedOut: true, url: 'https://chatgpt.com/' });

  const events = api.getEvents();
  const dismissIndex = events.findIndex((event) => event.type === 'dismiss-onboarding');
  const openMenuIndex = events.findIndex((event) => event.type === 'open-menu');

  assert.ok(dismissIndex >= 0, '应先处理 onboarding');
  assert.ok(openMenuIndex > dismissIndex, '应在 onboarding 处理后再展开账号菜单退出登录');
}

(async () => {
  await testStep10DismissesOnboardingBeforeLogout();
  console.log('step10 onboarding logout tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
