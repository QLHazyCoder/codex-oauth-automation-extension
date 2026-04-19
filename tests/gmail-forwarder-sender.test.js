// 测试覆盖：iCloud Hide My Email / Apple Private Relay / 通用 noreply 发件地址
// 不应被错判为"其他收件人"，导致 OpenAI 验证码邮件被静默丢弃。
//
// 关联 bug：target=40.blowup.copse@icloud.com，Gmail 因 HME 把 From 改写成
// noreply_at_XXXX@icloud.com → extractEmails 找到这个转发器地址 → 与 target 不符
// → 静默 continue → 7 次轮询全失败。

const assert = require('node:assert/strict');
const fs = require('node:fs');

const gmailSource = fs.readFileSync('content/gmail-mail.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((m) => source.indexOf(m)).find((i) => i >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) throw new Error(`missing body for ${name}`);

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

// ---------- T1: isForwarderLikeEmail 基础识别 ----------
(function testIsForwarderLikeEmailRecognizesCommonForwarders() {
  const api = new Function(`
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
return { isForwarderLikeEmail };
`)();

  // iCloud Hide My Email
  assert.strictEqual(api.isForwarderLikeEmail('noreply_at_abcdef1234@icloud.com'), true, 'T1: iCloud HME 发件地址应识别为转发器');
  assert.strictEqual(api.isForwarderLikeEmail('NOREPLY_AT_ABC@ICLOUD.COM'), true, 'T1: 大小写不敏感');

  // Apple Private Relay
  assert.strictEqual(api.isForwarderLikeEmail('abc123@privaterelay.appleid.com'), true, 'T1: Apple Private Relay 应识别为转发器');

  // 通用 noreply / notifications
  assert.strictEqual(api.isForwarderLikeEmail('noreply@openai.com'), true, 'T1: noreply@openai.com 应识别');
  assert.strictEqual(api.isForwarderLikeEmail('no-reply@github.com'), true, 'T1: no-reply 形式应识别');
  assert.strictEqual(api.isForwarderLikeEmail('no.reply@example.com'), true, 'T1: no.reply 形式应识别');
  assert.strictEqual(api.isForwarderLikeEmail('notifications@slack.com'), true, 'T1: notifications@ 应识别');
  assert.strictEqual(api.isForwarderLikeEmail('notify@example.com'), true, 'T1: notify@ 应识别');
  assert.strictEqual(api.isForwarderLikeEmail('donotreply@bank.com'), true, 'T1: donotreply@ 应识别');
  assert.strictEqual(api.isForwarderLikeEmail('mailer-daemon@gmail.com'), true, 'T1: mailer-daemon 应识别');
  assert.strictEqual(api.isForwarderLikeEmail('postmaster@example.com'), true, 'T1: postmaster 应识别');

  // 真实用户邮箱不应被误判
  assert.strictEqual(api.isForwarderLikeEmail('40.blowup.copse@icloud.com'), false, 'T1: 正常 iCloud 别名不应识别为转发器');
  assert.strictEqual(api.isForwarderLikeEmail('john.doe@gmail.com'), false, 'T1: 普通 Gmail 地址不应识别');
  assert.strictEqual(api.isForwarderLikeEmail('replyall@example.com'), false, 'T1: "replyall" 不应被 noreply 正则误命中');
  assert.strictEqual(api.isForwarderLikeEmail('notifythe.user@example.com'), false, 'T1: "notifythe" 不应被 notify 正则误命中（必须完整边界）');

  // 边界值
  assert.strictEqual(api.isForwarderLikeEmail(''), false, 'T1: 空串返回 false');
  assert.strictEqual(api.isForwarderLikeEmail(null), false, 'T1: null 返回 false');
  assert.strictEqual(api.isForwarderLikeEmail(undefined), false, 'T1: undefined 返回 false');

  console.log('T1 isForwarderLikeEmail passed');
})();

// ---------- T2: HME 场景——target 未出现时仍应放行 ----------
// 构造一个和线上 bug 完全一致的 meta 对象：sender 是 HME 转发器，subject/digest
// 只有验证码文案，没有 target 的字面量。
(function testHmeForwarderSenderDoesNotTriggerSkip() {
  const meta = {
    sender: 'noreply_at_abcdef@icloud.com',
    subject: '你的 ChatGPT 代码为 148283',
    digest: '获取您的 OpenAI 代码 - 您的 OpenAI 代码是 148283 要登录 ChatGPT，请输入此代码',
    ariaLabel: 'noreply_at_abcdef@icloud.com, 你的 ChatGPT 代码为 148283, 获取您的 OpenAI 代码 - 您的 OpenAI 代码是 148283 要登录 ChatGPT',
  };
  const targetEmail = '40.blowup.copse@icloud.com';

  const api = new Function(`
${extractFunction(gmailSource, 'extractEmails')}
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
${extractFunction(gmailSource, 'emailMatchesTarget')}
${extractFunction(gmailSource, 'getTargetEmailMatchState')}
return { extractEmails, isForwarderLikeEmail, getTargetEmailMatchState };
`)();

  const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
  const previewEmails = api.extractEmails(contentText);
  const previewTargetState = api.getTargetEmailMatchState(contentText, targetEmail);
  const nonForwarderEmails = previewEmails.filter((e) => !api.isForwarderLikeEmail(e));

  assert.ok(
    previewEmails.includes('noreply_at_abcdef@icloud.com'),
    'T2: ariaLabel 里的 HME 发件地址应被 extractEmails 捕获（复现原 bug 前提）'
  );
  assert.strictEqual(previewTargetState.matches, false, 'T2: target 既不是字面量也不是编码，matches=false');
  assert.deepStrictEqual(
    nonForwarderEmails,
    [],
    'T2: 过滤掉 HME 发件地址后，应无剩余"冲突收件人"——修复后不应再 skip'
  );

  // 断言新 skip 条件：targetEmail && nonForwarderEmails.length > 0 && !matches
  const shouldSkipNew = Boolean(targetEmail) && nonForwarderEmails.length > 0 && !previewTargetState.matches;
  assert.strictEqual(shouldSkipNew, false, 'T2: 修复后 HME 场景不应 skip');

  // 对比旧逻辑：targetEmail && previewEmails.length > 0 && !matches
  const shouldSkipOld = Boolean(targetEmail) && previewEmails.length > 0 && !previewTargetState.matches;
  assert.strictEqual(shouldSkipOld, true, 'T2: 旧逻辑（未过滤转发器）会 skip——即本次修复对象');

  console.log('T2 HME forwarder sender does not trigger skip — passed');
})();

// ---------- T3: 真正的他人收件场景仍然应 skip ----------
(function testGenuineOtherRecipientStillSkips() {
  const meta = {
    sender: 'noreply@openai.com',
    subject: 'Your ChatGPT code is 999999',
    digest: 'Hi someone.else@example.com, your code is 999999. — OpenAI',
    ariaLabel: 'noreply@openai.com, Your ChatGPT code',
  };
  const targetEmail = '40.blowup.copse@icloud.com';

  const api = new Function(`
${extractFunction(gmailSource, 'extractEmails')}
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
${extractFunction(gmailSource, 'emailMatchesTarget')}
${extractFunction(gmailSource, 'getTargetEmailMatchState')}
return { extractEmails, isForwarderLikeEmail, getTargetEmailMatchState };
`)();

  const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
  const previewEmails = api.extractEmails(contentText);
  const previewTargetState = api.getTargetEmailMatchState(contentText, targetEmail);
  const nonForwarderEmails = previewEmails.filter((e) => !api.isForwarderLikeEmail(e));

  assert.ok(
    nonForwarderEmails.includes('someone.else@example.com'),
    'T3: 真实他人收件地址应进入 nonForwarderEmails'
  );
  assert.ok(
    !nonForwarderEmails.includes('noreply@openai.com'),
    'T3: noreply 发件地址应被过滤掉'
  );

  const shouldSkipNew = Boolean(targetEmail) && nonForwarderEmails.length > 0 && !previewTargetState.matches;
  assert.strictEqual(shouldSkipNew, true, 'T3: 真正的跨收件人邮件仍然应 skip');

  console.log('T3 genuine other recipient still skips — passed');
})();

// ---------- T4: target 的字面量出现在 digest 时应匹配 ----------
(function testTargetLiteralInDigestMatches() {
  const meta = {
    sender: 'noreply_at_xyz@icloud.com',
    subject: 'Your ChatGPT code',
    digest: 'Hi 40.blowup.copse@icloud.com, your code is 123456',
    ariaLabel: '',
  };
  const targetEmail = '40.blowup.copse@icloud.com';

  const api = new Function(`
${extractFunction(gmailSource, 'extractEmails')}
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
${extractFunction(gmailSource, 'emailMatchesTarget')}
${extractFunction(gmailSource, 'getTargetEmailMatchState')}
return { extractEmails, isForwarderLikeEmail, getTargetEmailMatchState };
`)();

  const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
  const previewTargetState = api.getTargetEmailMatchState(contentText, targetEmail);
  assert.strictEqual(previewTargetState.matches, true, 'T4: target 字面量在 digest 里，matches=true');

  const previewEmails = api.extractEmails(contentText);
  const nonForwarderEmails = previewEmails.filter((e) => !api.isForwarderLikeEmail(e));
  const shouldSkip = Boolean(targetEmail) && nonForwarderEmails.length > 0 && !previewTargetState.matches;
  assert.strictEqual(shouldSkip, false, 'T4: matches=true 时不 skip');
  console.log('T4 target literal match — passed');
})();

// ---------- T5: target 的编码形式（local=domain）出现时应匹配 ----------
// Gmail 在列表视图里经常把 "to" 地址格式化成 local=domain 形式（因为 `@`
// 被当作字段分隔符处理过）。这是 getTargetEmailMatchState 的既有能力，
// 本次测试确保修复没破坏它。
(function testTargetEncodedFormMatches() {
  const meta = {
    sender: 'noreply_at_xyz@icloud.com',
    subject: 'Your ChatGPT code',
    digest: 'To 40.blowup.copse=icloud.com your code is 123456',
    ariaLabel: '',
  };
  const targetEmail = '40.blowup.copse@icloud.com';

  const api = new Function(`
${extractFunction(gmailSource, 'extractEmails')}
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
${extractFunction(gmailSource, 'emailMatchesTarget')}
${extractFunction(gmailSource, 'getTargetEmailMatchState')}
return { extractEmails, isForwarderLikeEmail, getTargetEmailMatchState };
`)();

  const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
  const previewTargetState = api.getTargetEmailMatchState(contentText, targetEmail);
  assert.strictEqual(previewTargetState.matches, true, 'T5: target 的编码形式 local=domain 应匹配');
  console.log('T5 target encoded form matches — passed');
})();

// ---------- T6: 多个转发器 + 无 target ≠ skip（修复保护 OpenAI 常见格式） ----------
// 实际邮件可能在 digest 里 cc 了其他 noreply 地址，这些也都应被过滤掉。
(function testMultipleForwardersNoTargetDoesNotSkip() {
  const meta = {
    sender: 'noreply_at_aaa@icloud.com',
    subject: 'ChatGPT 验证码：147258',
    digest: 'From noreply@openai.com via noreply_at_bbb@icloud.com',
    ariaLabel: 'noreply_at_aaa@icloud.com, 验证码',
  };
  const targetEmail = '40.blowup.copse@icloud.com';

  const api = new Function(`
${extractFunction(gmailSource, 'extractEmails')}
${extractFunction(gmailSource, 'isForwarderLikeEmail')}
${extractFunction(gmailSource, 'emailMatchesTarget')}
${extractFunction(gmailSource, 'getTargetEmailMatchState')}
return { extractEmails, isForwarderLikeEmail, getTargetEmailMatchState };
`)();

  const contentText = `${meta.subject} ${meta.digest} ${meta.ariaLabel}`;
  const previewEmails = api.extractEmails(contentText);
  const previewTargetState = api.getTargetEmailMatchState(contentText, targetEmail);
  const nonForwarderEmails = previewEmails.filter((e) => !api.isForwarderLikeEmail(e));

  assert.ok(previewEmails.length >= 2, 'T6: extractEmails 应至少找到 noreply + 2 个 HME');
  assert.deepStrictEqual(nonForwarderEmails, [], 'T6: 全部是转发器的场景下，nonForwarderEmails 应为空');

  const shouldSkip = Boolean(targetEmail) && nonForwarderEmails.length > 0 && !previewTargetState.matches;
  assert.strictEqual(shouldSkip, false, 'T6: 全转发器场景下不应 skip');
  console.log('T6 multiple forwarders no target does not skip — passed');
})();

console.log('gmail forwarder sender tests passed');
