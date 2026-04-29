const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel password inputs expose visibility toggles', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const passwordInputIds = Array.from(
    html.matchAll(/<input\b[^>]*type="password"[^>]*id="([^"]+)"/g),
    (match) => match[1]
  );
  const legacyToggleIds = new Map([
    ['input-vps-url', 'btn-toggle-vps-url'],
    ['input-vps-password', 'btn-toggle-vps-password'],
    ['input-ip-proxy-username', 'btn-toggle-ip-proxy-username'],
    ['input-ip-proxy-password', 'btn-toggle-ip-proxy-password'],
    ['input-ip-proxy-api-url', 'btn-toggle-ip-proxy-api-url'],
    ['input-password', 'btn-toggle-password'],
  ]);

  assert.ok(passwordInputIds.length > 0);
  for (const inputId of passwordInputIds) {
    const hasDataToggle = html.includes(`data-password-toggle="${inputId}"`);
    const legacyToggleId = legacyToggleIds.get(inputId);
    const hasLegacyToggle = legacyToggleId ? html.includes(`id="${legacyToggleId}"`) : false;
    assert.equal(
      hasDataToggle || hasLegacyToggle,
      true,
      `${inputId} should have a visibility toggle button`
    );
  }
});

test('shared form dialog adds visibility toggles for password fields', () => {
  const source = fs.readFileSync('sidepanel/form-dialog.js', 'utf8');

  assert.match(source, /field\.type === 'password'[\s\S]*data-input-with-icon/);
  assert.match(source, /syncPasswordToggleButton\(toggleButton,\s*input,\s*labels\)/);
  assert.match(source, /input\.type = input\.type === 'password' \? 'text' : 'password'/);
});
