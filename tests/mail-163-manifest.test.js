const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('manifest 为网易邮箱内容脚本覆盖 126 子域名', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const mail163Script = manifest.content_scripts.find((script) => (
    Array.isArray(script.js) && script.js.includes('content/mail-163.js')
  ));

  assert.ok(mail163Script, '应存在 mail-163 内容脚本声明');
  assert.equal(
    mail163Script.matches.includes('https://mail.126.com/*'),
    true,
    '应覆盖 mail.126.com'
  );
  assert.equal(
    mail163Script.matches.includes('https://*.mail.126.com/*'),
    true,
    '应覆盖 *.mail.126.com'
  );
});
