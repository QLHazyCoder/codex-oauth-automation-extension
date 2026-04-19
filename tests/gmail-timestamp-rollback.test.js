// 回归：Gmail 对「昨天」的邮件也会只显示纯时间（例如 "20:51"，无日期前缀）。
// parseGmailTimestamp 必须在「用今天拼出来的时间领先 now 超过 2 分钟」时回退 1 天，
// 否则 filterAfterTimestamp 会把昨天的旧验证码邮件当成今天的新邮件，
// step 7 会拿到昨天的登录验证码提交给后端，导致验证失败。

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

// 把时钟冻结到 2026-04-19 00:49:30（用户场景：凌晨跑 step 7）。
// 在这个时钟下，"20:51" 既可能是今天刚发生的未来（不可能），也可能是昨晚发的——
// 应当判为昨天。
function buildApi(fakeNowIso) {
  return new Function('fakeNowIso', `
const RealDate = globalThis.Date;
const FROZEN_MS = new RealDate(fakeNowIso).getTime();
let Date;
{
  Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(FROZEN_MS);
      } else {
        super(...args);
      }
    }
    static now() { return FROZEN_MS; }
    static parse(...args) { return RealDate.parse(...args); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

${extractFunction('parseGmailTimestamp')}

function buildLocal(daysOffset, hour, minute) {
  const d = new RealDate(FROZEN_MS);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

return {
  parseGmailTimestamp,
  todayAt(hour, minute) { return buildLocal(0, hour, minute); },
  yesterdayAt(hour, minute) { return buildLocal(-1, hour, minute); },
  frozenMs: FROZEN_MS,
};
`)(fakeNowIso);
}

(function run() {
  // 主场景：凌晨跑 step 7，now = 2026-04-19 00:49:30
  const api = buildApi('2026-04-19T00:49:30');

  // T1：裸 "20:51"（昨晚发的，Gmail 无日期前缀）
  //     今天 20:51 - now ≈ 20h 领先 > 2min → 回退一天
  assert.strictEqual(
    api.parseGmailTimestamp('20:51'),
    api.yesterdayAt(20, 51),
    'T1: 裸 HH:MM 若为未来超过 2 分钟，必须判为昨天（昨晚 20:51 的登录验证码邮件）'
  );

  // T2：裸 "00:30"（凌晨刚过，过去 19 分钟）→ 保留今天
  assert.strictEqual(
    api.parseGmailTimestamp('00:30'),
    api.todayAt(0, 30),
    'T2: 过去的纯时间不应回退（今天 00:30）'
  );

  // T3：领先 now 整 2 分钟的边界情况（00:51:30）
  //     ts - now = 120_000ms，严格 > 2min 不成立，应保留今天
  assert.strictEqual(
    api.parseGmailTimestamp('00:51'),
    api.todayAt(0, 51),
    'T3: 领先 now 恰好 <= 2 分钟时在容差内，保留今天（覆盖时钟抖动 + 刚到达的邮件）'
  );

  // T4：领先 now 3 分钟（> 2 分钟容差）→ 回退
  assert.strictEqual(
    api.parseGmailTimestamp('00:52'),
    api.yesterdayAt(0, 52),
    'T4: 领先 now 超过 2 分钟（含）的纯时间必须判为昨天'
  );

  // T5：「昨天 20:51」显式前缀分支不受本次改动影响，仍返回昨天
  assert.strictEqual(
    api.parseGmailTimestamp('昨天 20:51'),
    api.yesterdayAt(20, 51),
    'T5: 显式「昨天」前缀分支保持原行为'
  );

  // T6：「下午 8:51」= 20:51 今天是未来 → 回退一天
  assert.strictEqual(
    api.parseGmailTimestamp('下午 8:51'),
    api.yesterdayAt(20, 51),
    'T6: 中文上午/下午分支也需要 future → yesterday 回退'
  );

  // T7：「8:51 PM」英文 meridiem 分支同样需要回退
  assert.strictEqual(
    api.parseGmailTimestamp('8:51 PM'),
    api.yesterdayAt(20, 51),
    'T7: 英文 AM/PM 分支也需要 future → yesterday 回退'
  );

  // T8：白天 10:23 跑 step 4 —— 这里是"今天 10:23"的场景，
  //     假设 now = 2026-04-19 12:00（下午），那 10:23 是过去，不回退
  const api2 = buildApi('2026-04-19T12:00:00');
  assert.strictEqual(
    api2.parseGmailTimestamp('10:23'),
    api2.todayAt(10, 23),
    'T8: 白天跑时，过去的 HH:MM 仍然解释为今天（不破坏现有 step 4 逻辑）'
  );

  console.log('gmail timestamp rollback tests passed');
})();
