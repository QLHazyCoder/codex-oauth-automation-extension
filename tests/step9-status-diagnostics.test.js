const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/vps-panel.js', 'utf8');

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

const bundle = [
  "const STEP9_SUCCESS_STATUSES = new Set(['Authentication successful!', 'Аутентификация успешна!', '认证成功！']);",
  extractFunction('getInlineTextSnippet'),
  extractFunction('summarizeStatusBadgeEntries'),
  extractFunction('normalizeStep9StatusText'),
  extractFunction('isOAuthCallbackTimeoutFailure'),
  extractFunction('isStep9FailureText'),
  extractFunction('isStep9SuccessStatus'),
  extractFunction('isStep9SuccessLikeStatus'),
  extractFunction('buildStep9StatusDiagnostics'),
].join('\n');

function createApi() {
  return new Function(`
function isRecoverableStep9AuthFailure(text) {
  return /(?:认证失败|回调 URL 提交失败):\\s*/i.test(String(text || '').trim())
    || /oauth flow is not pending/i.test(String(text || '').trim());
}

${bundle}

return {
  buildStep9StatusDiagnostics,
};
`)();
}

test('step 9 does not treat red success badges as exact success', () => {
  const api = createApi();
  const diagnostics = api.buildStep9StatusDiagnostics([
    {
      visible: true,
      text: '认证成功！',
      className: 'status-badge text-danger',
      hasErrorVisualSignal: true,
      errorVisualSummary: 'color=rgb(220, 38, 38)',
    },
  ], [], 'page');

  assert.equal(diagnostics.hasSuccessLikeVisibleBadge, true);
  assert.equal(diagnostics.hasExactSuccessVisibleBadge, false);
  assert.equal(diagnostics.hasErrorStyledVisibleBadge, true);
});

test('step 9 keeps failure state dominant when success badge and error banner coexist', () => {
  const api = createApi();
  const diagnostics = api.buildStep9StatusDiagnostics(
    [
      {
        visible: true,
        text: '认证成功！',
        className: 'status-badge',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
    ],
    [
      {
        visible: true,
        text: '回调 URL 提交失败: oauth flow is not pending',
        className: 'alert alert-danger',
        hasErrorVisualSignal: true,
        errorVisualSummary: 'color=rgb(220, 38, 38)',
      },
    ],
    'page'
  );

  assert.equal(diagnostics.hasExactSuccessVisibleBadge, true);
  assert.equal(diagnostics.hasFailureVisibleBadge, true);
  assert.equal(diagnostics.failureText, '回调 URL 提交失败: oauth flow is not pending');
});
