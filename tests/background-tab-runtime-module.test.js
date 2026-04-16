const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports tab runtime module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/tab-runtime\.js/);
});

test('tab runtime module exposes a factory', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  assert.equal(typeof api?.createTabRuntime, 'function');
});
