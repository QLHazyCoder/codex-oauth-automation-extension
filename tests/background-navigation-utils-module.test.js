const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports navigation utils module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/navigation-utils\.js/);
});

test('navigation utils module exposes a factory', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);

  assert.equal(typeof api?.createNavigationUtils, 'function');
});
