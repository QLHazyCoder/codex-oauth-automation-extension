const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel html keeps a single contribution mode button in header', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const matches = html.match(/id="btn-contribution-mode"/g) || [];
  const serviceIndex = html.indexOf('<script src="contribution-content-update-service.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');

  assert.equal(matches.length, 1);
  assert.match(html, /id="btn-contribution-mode"[^>]*title="进入贡献模式并打开上传页"/);
  assert.match(html, />贡献\/使用<\/button>/);
  assert.match(html, /<\/header>\s*<div id="contribution-update-layer"/);
  assert.match(html, /id="contribution-update-layer"/);
  assert.match(html, /id="contribution-update-hint"/);
  assert.match(html, /id="contribution-update-hint-text"/);
  assert.match(html, /id="btn-dismiss-contribution-update-hint"/);
  assert.notEqual(serviceIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(serviceIndex < sidepanelIndex);
});

test('sidepanel source no longer keeps the legacy upload-page handler on the header contribution button', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.doesNotMatch(source, /openContributionUploadPage/);
  assert.doesNotMatch(source, /await openContributionUploadPage\(\)/);
});
