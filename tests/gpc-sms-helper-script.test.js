const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const scriptPath = path.join(process.cwd(), 'scripts/gpc_sms_helper_macos.py');

test('GPC SMS helper shows macOS and iPhone forwarding guidance on non-macOS', () => {
  if (process.platform === 'darwin') {
    return;
  }
  const result = spawnSync('python3', [scriptPath, '--help'], { encoding: 'utf8' });
  // argparse --help exits before runtime checks, so run normally with a harmless db path.
  const run = spawnSync('python3', [scriptPath, '--db', '/tmp/nonexistent-gpc-chat.db'], { encoding: 'utf8', timeout: 3000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /仅支持 macOS/);
  assert.match(run.stderr, /iPhone 短信已转发|短信.*转发/);
  assert.equal(result.status, 0);
});
