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
  extractFunction('isStep10CallbackSubmittedStatus'),
  extractFunction('isStep10CallbackFailureText'),
  extractFunction('isStep10MainWaitingStatus'),
  extractFunction('isStep10MainFailureText'),
  extractFunction('isStep9FailureText'),
  extractFunction('isStep9SuccessStatus'),
  extractFunction('isStep9SuccessLikeStatus'),
  extractFunction('formatStep10StatusSummaryValue'),
  extractFunction('isStep10BrowserSwitchRequiredConflict'),
  extractFunction('getStep10BrowserSwitchRequiredMessage'),
  extractFunction('buildStep9StatusDiagnostics'),
  extractFunction('extractStep10FailureDetail'),
  extractFunction('explainStep10Failure'),
].join('\n');

function createApi() {
  return new Function(`
function isRecoverableStep9AuthFailure(text) {
  const normalized = String(text || '').trim();
  return /(?:认证失败|回调\\s*url\\s*提交失败|回调url提交失败|提交回调失败)\\s*[:：]?/i.test(normalized)
    || /oauth flow is not pending|请更新\\s*cli\\s*proxy\\s*api\\s*或检查连接|bad request|state code error|failed to exchange authorization code for tokens|failed to save authentication tokens|unknown or expired state|invalid state|state is required|code or error is required|invalid redirect_url|provider does not match state|failed to persist oauth callback|timeout waiting for oauth callback|oauth flow timed out/i.test(normalized);
}

${bundle}

return {
  buildStep9StatusDiagnostics,
  explainStep10Failure,
  isStep10BrowserSwitchRequiredConflict,
  getStep10BrowserSwitchRequiredMessage,
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
      location: 'main',
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
        location: 'main',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
      {
        visible: true,
        text: '回调 URL 提交失败: oauth flow is not pending',
        className: 'status-badge error',
        location: 'callback',
        hasErrorVisualSignal: true,
        errorVisualSummary: 'color=rgb(220, 38, 38)',
      },
    ],
    [],
    'page'
  );

  assert.equal(diagnostics.hasExactSuccessVisibleBadge, true);
  assert.equal(diagnostics.hasFailureVisibleBadge, true);
  assert.equal(diagnostics.failureText, '回调 URL 提交失败: oauth flow is not pending');
  assert.equal(diagnostics.failureSource, 'callback');
});

test('step 10 treats plain 认证成功 as success when no failure is visible', () => {
  const api = createApi();
  const diagnostics = api.buildStep9StatusDiagnostics(
    [
      {
        visible: true,
        text: '认证成功',
        className: 'status-badge',
        location: 'main',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
    ],
    [],
    'page'
  );

  assert.equal(diagnostics.hasExactSuccessVisibleBadge, true);
  assert.equal(diagnostics.exactSuccessText, '认证成功');
});

test('step 10 recognizes callback accepted badge as in-progress signal', () => {
  const api = createApi();
  const diagnostics = api.buildStep9StatusDiagnostics(
    [
      {
        visible: true,
        text: '回调 URL 已提交，等待认证中...',
        className: 'status-badge success',
        location: 'callback',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
      {
        visible: true,
        text: '等待认证中...',
        className: 'status-badge',
        location: 'main',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
    ],
    [],
    'page'
  );

  assert.equal(diagnostics.hasCallbackSubmittedBadge, true);
  assert.equal(diagnostics.callbackSubmittedText, '回调 URL 已提交，等待认证中...');
  assert.equal(diagnostics.mainWaitingText, '等待认证中...');
  assert.equal(diagnostics.hasExactSuccessVisibleBadge, false);
});

test('step 10 explains callback upgrade hint with user-friendly reason', () => {
  const api = createApi();
  const explanation = api.explainStep10Failure(
    '回调 URL 提交失败: 请更新CLI Proxy API或检查连接',
    'callback'
  );

  assert.equal(explanation.code, 'callback_submit_api_unavailable');
  assert.match(explanation.userMessage, /CLI Proxy API 版本过旧|管理接口未启动|连接异常/);
  assert.match(explanation.userMessage, /回调提交阶段/);
});

test('step 10 requests browser switch when success badge and callback upgrade failure coexist', () => {
  const api = createApi();
  const diagnostics = api.buildStep9StatusDiagnostics(
    [
      {
        visible: true,
        text: '认证成功',
        className: 'status-badge success',
        location: 'main',
        hasErrorVisualSignal: false,
        errorVisualSummary: '',
      },
      {
        visible: true,
        text: '回调 URL 提交失败: 请更新CLI Proxy API或检查连接',
        className: 'status-badge error',
        location: 'callback',
        hasErrorVisualSignal: true,
        errorVisualSummary: 'color=rgb(220, 38, 38)',
      },
    ],
    [],
    'page'
  );

  assert.equal(api.isStep10BrowserSwitchRequiredConflict(diagnostics), true);
  assert.match(api.getStep10BrowserSwitchRequiredMessage(diagnostics), /更换浏览器后重新进行注册登录/);
});
