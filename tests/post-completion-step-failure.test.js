const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

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

function buildApi(currentState) {
  return new Function(`
let state = ${JSON.stringify(currentState)};

async function getState() {
  return state;
}

${extractFunction('findLatestStepFailureLogMessage')}
${extractFunction('throwIfStepFailedAfterCompletionSignal')}

return {
  findLatestStepFailureLogMessage,
  throwIfStepFailedAfterCompletionSignal,
};
`)();
}

test('findLatestStepFailureLogMessage returns the newest matching failure log', () => {
  const api = buildApi({ stepStatuses: {}, logs: [] });
  assert.equal(
    api.findLatestStepFailureLogMessage(3, [
      { message: '步骤 3 失败：old error' },
      { message: '步骤 2 失败：ignore me' },
      { message: '步骤 3 失败：new error' },
    ]),
    '步骤 3 失败：new error',
  );
});

test('throwIfStepFailedAfterCompletionSignal surfaces the recorded step failure', async () => {
  const api = buildApi({
    stepStatuses: { 3: 'failed' },
    logs: [{ message: '步骤 3 失败：user/register 接口返回 invalid_request_error：Failed to create account. Please try again.' }],
  });

  await assert.rejects(
    api.throwIfStepFailedAfterCompletionSignal(3),
    /user\/register 接口返回 invalid_request_error：Failed to create account\. Please try again\./,
  );
});

test('throwIfStepFailedAfterCompletionSignal ignores completed steps', async () => {
  const api = buildApi({
    stepStatuses: { 3: 'completed' },
    logs: [{ message: '步骤 3 已完成' }],
  });

  await assert.doesNotReject(api.throwIfStepFailedAfterCompletionSignal(3));
});
