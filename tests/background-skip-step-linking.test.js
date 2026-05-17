const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

const OPENAI_NODE_IDS = [
  'open-chatgpt',
  'submit-signup-email',
  'fill-password',
  'fetch-signup-code',
  'fill-profile',
  'wait-registration-success',
  'oauth-login',
  'fetch-login-code',
  'confirm-oauth',
  'platform-verify',
];

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

function createApi() {
  const bundle = [
    extractFunction('isStepDoneStatus'),
    extractFunction('skipNode'),
  ].join('\n');

  return new Function(`
const DEFAULT_STATE = { nodeStatuses: {} };
function getNodeIdsForState() {
  return ${JSON.stringify(OPENAI_NODE_IDS)};
}
function normalizeStatusMapForNodes(statuses = {}) {
  return { ...statuses };
}
function assertNodeExecutionAllowedForState() {}
function isNodeExecutionAllowedForState() {
  return true;
}
function getExecutionAllowedNodeIdsForState() {
  return ${JSON.stringify(OPENAI_NODE_IDS)};
}
${bundle}
return { skipNode };
`)();
}

test('skipNode cascades from open-chatgpt through signup profile when downstream nodes are pending', async () => {
  const statuses = Object.fromEntries(OPENAI_NODE_IDS.map((nodeId) => [nodeId, 'pending']));
  const events = {
    setNodeStatusCalls: [],
    logs: [],
  };
  const api = createApi();

  globalThis.ensureManualInteractionAllowed = async () => ({
    nodeStatuses: { ...statuses },
  });
  globalThis.getState = async () => ({
    nodeStatuses: { ...statuses },
  });
  globalThis.setNodeStatus = async (nodeId, status) => {
    events.setNodeStatusCalls.push({ nodeId, status });
    statuses[nodeId] = status;
  };
  globalThis.addLog = async (message, level) => {
    events.logs.push({ message, level });
  };

  const result = await api.skipNode('open-chatgpt');

  assert.deepStrictEqual(result, { ok: true, nodeId: 'open-chatgpt', status: 'skipped' });
  assert.deepStrictEqual(events.setNodeStatusCalls, [
    { nodeId: 'open-chatgpt', status: 'skipped' },
    { nodeId: 'submit-signup-email', status: 'skipped' },
    { nodeId: 'fill-password', status: 'skipped' },
    { nodeId: 'fetch-signup-code', status: 'skipped' },
    { nodeId: 'fill-profile', status: 'skipped' },
    { nodeId: 'wait-registration-success', status: 'skipped' },
  ]);
  assert.equal(events.logs[0]?.message, '节点 open-chatgpt 已跳过');
  assert.equal(
    events.logs[1]?.message,
    '节点 open-chatgpt 已跳过，节点 submit-signup-email、fill-password、fetch-signup-code、fill-profile、wait-registration-success 也已同时跳过。'
  );
});

test('skipNode from open-chatgpt skips only unfinished linked signup nodes', async () => {
  const statuses = {
    'open-chatgpt': 'pending',
    'submit-signup-email': 'completed',
    'fill-password': 'running',
    'fetch-signup-code': 'pending',
    'fill-profile': 'manual_completed',
    'wait-registration-success': 'pending',
    'oauth-login': 'pending',
    'fetch-login-code': 'pending',
    'confirm-oauth': 'pending',
    'platform-verify': 'pending',
  };
  const events = {
    setNodeStatusCalls: [],
    logs: [],
  };
  const api = createApi();

  globalThis.ensureManualInteractionAllowed = async () => ({
    nodeStatuses: { ...statuses },
  });
  globalThis.getState = async () => ({
    nodeStatuses: { ...statuses },
  });
  globalThis.setNodeStatus = async (nodeId, status) => {
    events.setNodeStatusCalls.push({ nodeId, status });
    statuses[nodeId] = status;
  };
  globalThis.addLog = async (message, level) => {
    events.logs.push({ message, level });
  };

  await api.skipNode('open-chatgpt');

  assert.deepStrictEqual(events.setNodeStatusCalls, [
    { nodeId: 'open-chatgpt', status: 'skipped' },
    { nodeId: 'fetch-signup-code', status: 'skipped' },
    { nodeId: 'wait-registration-success', status: 'skipped' },
  ]);
  assert.equal(
    events.logs.some(({ message }) => (
      message === '节点 open-chatgpt 已跳过，节点 fetch-signup-code、wait-registration-success 也已同时跳过。'
    )),
    true
  );
});
