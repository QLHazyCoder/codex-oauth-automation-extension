const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background node registry preserves node metadata even before an executor is registered', () => {
  const source = fs.readFileSync('background/steps/registry.js', 'utf8');
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStepRegistry;`)({});
  const registry = api.createNodeRegistry([
    {
      flowId: 'kiro',
      legacyStepId: 1,
      nodeId: 'kiro-start-device-login',
      displayOrder: 10,
      executeKey: 'kiro-start-device-login',
      title: 'Start device login',
    },
  ]);

  const node = registry.getNodeDefinition('kiro-start-device-login');

  assert.equal(node.flowId, 'kiro');
  assert.equal(node.legacyStepId, 1);
  assert.equal(node.title, 'Start device login');
  assert.throws(
    () => registry.executeNode('kiro-start-device-login', {}),
    /Missing node executor: kiro-start-device-login/
  );
});

test('background node registry executes registered nodes in display order', async () => {
  const source = fs.readFileSync('background/steps/registry.js', 'utf8');
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStepRegistry;`)({});
  const events = [];
  const registry = api.createNodeRegistry([
    {
      flowId: 'openai',
      legacyStepId: 2,
      nodeId: 'submit-signup-email',
      displayOrder: 20,
      executeKey: 'submit-signup-email',
      title: 'Submit signup email',
      execute: async (state) => {
        events.push({ type: 'execute', state });
      },
    },
    {
      flowId: 'openai',
      legacyStepId: 1,
      nodeId: 'open-chatgpt',
      displayOrder: 10,
      executeKey: 'open-chatgpt',
      title: 'Open ChatGPT',
    },
  ]);

  assert.deepStrictEqual(
    registry.getOrderedNodes().map((node) => node.nodeId),
    ['open-chatgpt', 'submit-signup-email']
  );

  await registry.executeNode('submit-signup-email', { activeFlowId: 'openai' });

  assert.deepStrictEqual(events, [{ type: 'execute', state: { activeFlowId: 'openai' } }]);
});
