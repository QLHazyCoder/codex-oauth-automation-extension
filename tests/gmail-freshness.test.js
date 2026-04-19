const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/gmail-mail.js', 'utf8');

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

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
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

const api = new Function(`
${extractFunction('normalizeMinuteTimestamp')}
${extractFunction('parseGmailTimestamp')}
${extractFunction('extractVerificationCode')}
${extractFunction('extractEmails')}
${extractFunction('emailMatchesTarget')}
${extractFunction('getTargetEmailMatchState')}

return {
  normalizeMinuteTimestamp,
  parseGmailTimestamp,
  extractVerificationCode,
  extractEmails,
  getTargetEmailMatchState,
};
`)();

// 使用动态日期避免隔天测试失败。
// 这里不要把“期望值”写死成外部 new Date(...) 结果：若测试恰好跨分钟运行，
// parseGmailTimestamp 内部的 now 与外部 now 可能不在同一时间窗口，导致偶发失败。
const today = new Date();
const parsedPlainTime = api.parseGmailTimestamp('10:23');
assert.ok(Number.isFinite(parsedPlainTime), '纯时间格式应返回合法时间戳');
const parsedDate = new Date(parsedPlainTime);
assert.strictEqual(parsedDate.getMinutes(), 23, '纯时间格式应保留分钟信息');
assert.strictEqual(parsedDate.getHours(), 10, '纯时间格式应解析为当天/回退后的 10 点');

// "下午 10:23" = 22:23；如果当前时间早于 22:21，rollbackIfFuture 会回退到昨天
const pmTs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 22, 23, 0, 0).getTime();
const expectedPm = (pmTs - Date.now() > 2 * 60 * 1000) ? pmTs - 24 * 60 * 60 * 1000 : pmTs;
assert.strictEqual(
  api.parseGmailTimestamp('下午 10:23'),
  api.normalizeMinuteTimestamp(expectedPm),
  '中文上午/下午时间格式也应被正确解析，避免 freshness filter 把新邮件全过滤掉'
);

assert.strictEqual(
  api.parseGmailTimestamp('4月18日 下午 6:36'),
  new Date('2026-04-18T18:36:00').getTime(),
  '中文月日格式应被解析，适配 Gmail 中文界面'
);

assert.strictEqual(
  api.extractVerificationCode('Your ChatGPT code is 654321', true),
  '654321',
  'strictChatGPTCodeOnly 开启时仍应识别标准 ChatGPT 验证码'
);

assert.strictEqual(
  api.extractVerificationCode('Duck forward code 112233', true),
  null,
  'strictChatGPTCodeOnly 开启时不应接受泛化 6 位数字'
);

assert.deepStrictEqual(
  api.extractEmails('To: foo@example.com / Alt: foo@example.com'),
  ['foo@example.com'],
  'extractEmails 应去重，避免目标邮箱判断抖动'
);

assert.deepStrictEqual(
  api.getTargetEmailMatchState('Delivered to foo=example.com, Your ChatGPT code is 123456', 'foo@example.com'),
  { matches: true, hasExplicitEmail: true },
  '目标邮箱被 Gmail 转义展示时仍应正确识别'
);

const noExplicitEmailPreview = api.getTargetEmailMatchState('OpenAI 您的 ChatGPT 临时验证码 839539', 'foo@example.com');
assert.deepStrictEqual(
  noExplicitEmailPreview,
  { matches: false, hasExplicitEmail: false },
  '没有显式邮箱地址的 Gmail 列表摘要不应被当成 mismatch；后续逻辑应允许它继续参与验证码匹配'
);

console.log('gmail freshness tests passed');
