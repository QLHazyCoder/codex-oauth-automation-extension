const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background step-1 state plumbing persists and resets cpa oauth runtime keys', () => {
  const source = fs.readFileSync('background.js', 'utf8');

  assert.match(source, /cpaOAuthState:\s*null/);
  assert.match(source, /cpaManagementOrigin:\s*null/);
  assert.match(source, /payload\.cpaOAuthState[^\n]*updates\.cpaOAuthState/);
  assert.match(source, /payload\.cpaManagementOrigin[^\n]*updates\.cpaManagementOrigin/);
  assert.match(source, /if \(step <= 1\) \{[\s\S]*cpaOAuthState:\s*null,[\s\S]*cpaManagementOrigin:\s*null,/);
});

test('message router step-1 handler stores cpa oauth runtime keys', async () => {
  const source = fs.readFileSync('background/message-router.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

  const updates = [];
  const router = api.createMessageRouter({
    broadcastDataUpdate: () => {},
    setState: async (payload) => {
      updates.push(payload);
    },
  });

  await router.handleStepData(1, {
    cpaOAuthState: 'oauth-state-1',
    cpaManagementOrigin: 'http://localhost:8317',
  });

  assert.deepStrictEqual(updates, [
    {
      cpaOAuthState: 'oauth-state-1',
      cpaManagementOrigin: 'http://localhost:8317',
    },
  ]);
});
