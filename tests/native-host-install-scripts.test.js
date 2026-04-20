const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HOST_NAME = 'com.qlhazycoder.codex_oauth_automation_extension';
const EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('native messaging host self-check returns protocol and host metadata', () => {
  const stdout = execFileSync('python3', ['scripts/native_messaging_host.py', '--self-check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.hostName, HOST_NAME);
  assert.equal(payload.protocolVersion, 1);
  assert.ok(typeof payload.swiftScriptPath === 'string' && payload.swiftScriptPath.length > 0);
});

test('native messaging host install/uninstall scripts manage manifest contents', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-native-host-'));
  const manifestPath = path.join(tempDir, `${HOST_NAME}.json`);

  execFileSync('python3', [
    'scripts/install_native_messaging_host.py',
    '--extension-id',
    EXTENSION_ID,
    '--output-dir',
    tempDir,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, HOST_NAME);
  assert.equal(manifest.type, 'stdio');
  assert.equal(manifest.protocol_version, 1);
  assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${EXTENSION_ID}/`]);
  assert.match(manifest.path, /scripts\/native_messaging_host\.py$/);

  execFileSync('python3', [
    'scripts/uninstall_native_messaging_host.py',
    '--output-dir',
    tempDir,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(fs.existsSync(manifestPath), false);
});
