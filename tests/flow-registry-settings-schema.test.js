const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flowRegistrySource = fs.readFileSync('shared/flow-registry.js', 'utf8');
const settingsSchemaSource = fs.readFileSync('shared/settings-schema.js', 'utf8');

function loadApis() {
  const scope = {};
  return new Function('self', `${flowRegistrySource}; ${settingsSchemaSource}; return {
    flowRegistry: self.MultiPageFlowRegistry,
    settingsSchema: self.MultiPageSettingsSchema,
  };`)(scope);
}

test('flow registry exposes openai and kiro with canonical source metadata', () => {
  const { flowRegistry } = loadApis();

  assert.deepEqual(flowRegistry.getRegisteredFlowIds(), ['openai', 'kiro']);
  assert.equal(flowRegistry.getFlowLabel('codex'), 'Codex / OpenAI');
  assert.equal(flowRegistry.normalizeFlowId('codex'), 'openai');
  assert.equal(flowRegistry.normalizeSourceId('openai', 'sub2api'), 'sub2api');
  assert.equal(flowRegistry.normalizeSourceId('kiro', 'anything-else'), 'kiro-rs');
  assert.deepEqual(
    flowRegistry.getVisibleGroupIds('kiro', 'kiro-rs'),
    ['kiro-runtime-status', 'kiro-source-kiro-rs', 'service-email', 'service-proxy']
  );
  assert.deepEqual(
    flowRegistry.getSettingsGroupDefinition('openai-plus')?.rowIds || [],
    ['row-plus-mode']
  );
  assert.deepEqual(
    flowRegistry.getSettingsGroupDefinition('openai-phone')?.rowIds || [],
    []
  );
});

test('settings schema normalizes flat input into canonical flow and service namespaces', () => {
  const { settingsSchema } = loadApis();
  const schema = settingsSchema.createSettingsSchema();

  const normalized = schema.normalizeSettingsState({
    activeFlowId: 'kiro',
    panelMode: 'sub2api',
    mailProvider: 'hotmail',
    ipProxyEnabled: true,
    ipProxyService: '711proxy',
    kiroRsUrl: 'https://kiro.example.com/admin',
    kiroRsKey: 'secret-key',
    kiroRegion: 'eu-west-1',
    stepExecutionRangeByFlow: {
      openai: { enabled: true, fromStep: 2, toStep: 9 },
      kiro: { enabled: true, fromStep: 1, toStep: 3 },
    },
  });

  assert.equal(normalized.activeFlowId, 'kiro');
  assert.equal(normalized.services.email.provider, 'hotmail');
  assert.equal(normalized.services.proxy.enabled, true);
  assert.equal(normalized.flows.openai.source.selected, 'sub2api');
  assert.equal(normalized.flows.kiro.source.selected, 'kiro-rs');
  assert.equal(normalized.flows.kiro.source.entries['kiro-rs'].kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(normalized.flows.kiro.source.entries['kiro-rs'].kiroRsKey, 'secret-key');
  assert.equal(normalized.flows.kiro.options.kiroRegion, 'eu-west-1');
  assert.deepEqual(normalized.flows.kiro.autoRun.stepExecutionRange, {
    enabled: true,
    fromStep: 1,
    toStep: 3,
  });
});

test('settings schema can project canonical state back to legacy payload without losing flow selection', () => {
  const { settingsSchema } = loadApis();
  const schema = settingsSchema.createSettingsSchema();
  const payload = schema.buildLegacySettingsPayload(schema.normalizeSettingsState({
    activeFlowId: 'kiro',
    kiroSourceId: 'kiro-rs',
    kiroRsUrl: 'https://kiro.example.com/admin',
    kiroRsKey: 'key-123',
    kiroRegion: 'ap-southeast-1',
  }));

  assert.equal(payload.activeFlowId, 'kiro');
  assert.equal(payload.panelMode, 'cpa');
  assert.equal(payload.kiroSourceId, 'kiro-rs');
  assert.equal(payload.kiroRsUrl, 'https://kiro.example.com/admin');
  assert.equal(payload.kiroRsKey, 'key-123');
  assert.equal(payload.kiroRegion, 'ap-southeast-1');
  assert.equal(payload.settingsSchemaVersion, 3);
  assert.equal(payload.settingsState.activeFlowId, 'kiro');
});
