const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/gopay-approve.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) throw new Error(`missing function ${name}`);
  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) signatureEnded = true;
    }
    if (ch === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
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

test('GoPay OTP always requests manual confirmation even when a previous code exists', () => {
  const body = extractFunction('requestManualGoPayOtp');
  assert.doesNotMatch(body, /if\s*\(existingCode\)\s*\{\s*return existingCode;\s*\}/);
  assert.match(body, /requestGoPayOtpInput\(\{ code: existingCode \}\)/);
  assert.match(body, /检测到上次保存的 GoPay 验证码/);
});


test('GoPay approve handles final payment details iframe as an action frame', () => {
  assert.match(source, /GOPAY_PAYMENT_FRAME_URL_PATTERN/);
  assert.match(source, /payment\\\/details/);
  assert.match(source, /app\\\/challenge/);
  assert.match(source, /inspectGoPayFramesByDom/);
  assert.match(source, /getGoPayDomFramePriority/);
  assert.match(source, /paymentFrames/);
  assert.match(source, /frameState\?\.hasPayNowButton/);
  assert.match(source, /getGoPayDomFrameKind/);
  assert.match(source, /return 'payment'/);
  assert.match(source, /sendGoPayFrameCommand\(tabId, actionFrameId, 'GOPAY_CLICK_PAY_NOW'/);
  assert.match(source, /getGoPayDebuggerTargets/);
  assert.match(source, /chrome\.debugger\.getTargets/);
  assert.match(source, /targetId: picked\.targetId/);
  assert.match(source, /sendGoPayDebuggerTargetCommand\(actionTargetId, 'GOPAY_CLICK_PAY_NOW'/);
  assert.match(source, /sendGoPayDebuggerTargetCommand\(actionTargetId, 'GOPAY_SUBMIT_PIN'/);
  assert.match(source, /Input\.insertText/);
  assert.match(source, /最终 Bayar 确认/);
});

test('GoPay debugger click does not reuse iframe-relative rects as top-level coordinates', () => {
  const body = extractFunction('clickGoPayTargetWithDebugger');
  assert.match(body, /Number\.isInteger\(frameId\)/);
  assert.match(body, /debugger_click_skipped_for_frame_target/);
  assert.ok(
    body.indexOf('debugger_click_skipped_for_frame_target') < body.indexOf('clickWithDebugger(tabId, rect)')
  );
});

test('GoPay approve treats merchant validate-pin iframe as PIN entry frame', () => {
  assert.match(source, /GOPAY_PIN_FRAME_URL_PATTERN/);
  assert.match(source, /payment\\\/validate-pin/);
  assert.match(source, /kind: 'pin'/);
  assert.match(source, /GOPAY_SUBMIT_PIN/);
});


test('GoPay approve closes terminal checkout but does not restart on top-level Pay now alone', () => {
  assert.match(source, /GOPAY_RESTART_FROM_STEP6::/);
  assert.match(source, /restartGoPayCheckoutFromStep6/);
  assert.match(source, /chrome\?\.tabs\?\.remove/);
  assert.match(source, /handleGoPayTerminalError\(pageState, tabId\)/);
  assert.match(source, /nextState\.hasTerminalError/);
  assert.doesNotMatch(source, /GoPay 顶层 Pay now 兜底点击后仍未进入下一步，当前支付会话需要重新创建/);
});

test('GoPay approve falls back to clicking Bayar inside any iframe before top-level Pay now retry', () => {
  assert.match(source, /clickGoPayPayButtonInAnyFrame/);
  assert.match(source, /data-testid/);
  assert.match(source, /pay-button/);
  assert.match(source, /已在 GoPay iframe 中点击 Bayar 按钮/);
  assert.match(source, /不再自动回退步骤 6/);
});

test('GoPay approve does not treat phone linking page as debugger iframe action', () => {
  assert.match(source, /type === 'tel'/);
  assert.match(source, /const hasContinueButton = !hasPayNowButton && !hasPhoneInput/);
  assert.match(source, /filter\(\(target\) => target\.type === 'iframe'\)/);
});

test('GoPay approve waits and retries slowly on Hubungkan linking page', () => {
  assert.match(source, /GOPAY_LINKING_RETRY_WAIT_MS/);
  assert.match(source, /GOPAY_LINKING_STABLE_WAIT_MS/);
  assert.match(source, /createGoPayStableStateTracker/);
  assert.match(source, /clickGoPayContinueBestEffort/);
  assert.match(source, /hubungkan\|sambungkan\|tautkan/);
  assert.match(source, /先等待 linking 页面加载\/跳转/);
  assert.match(source, /改用兜底点击 Hubungkan\/确认按钮/);
  assert.doesNotMatch(source, /GoPay 确认按钮点击后页面仍未变化，已暂停自动重复点击。请手动点击页面上的确认按钮，插件会继续等待后续页面。/);
});


test('background auto-run routes GoPay restart sentinel back to step 6', () => {
  const backgroundSource = fs.readFileSync('background.js', 'utf8');
  assert.match(backgroundSource, /isGoPayCheckoutRestartRequiredFailure/);
  assert.match(backgroundSource, /GOPAY_RESTART_FROM_STEP6::/);
  assert.match(backgroundSource, /step === 8 && isGoPayCheckoutRestartRequiredFailure\(err\)/);
  assert.match(backgroundSource, /step = 6/);
  assert.match(backgroundSource, /invalidateDownstreamAfterStepRestart\(5/);
});

test('GoPay approve gives PIN precedence over OTP on ambiguous second PIN pages', () => {
  assert.match(source, /pageState\.hasPinInput && !pinSubmitted/);
  assert.match(source, /pageState\.hasOtpInput && !pageState\.hasPinInput && !otpSubmitted/);
  assert.ok(source.indexOf('pageState.hasPinInput && !pinSubmitted') < source.indexOf('pageState.hasOtpInput && !pageState.hasPinInput && !otpSubmitted'));
  assert.doesNotMatch(source, /otp\|one\[-\\s\]\*time\|kode\|verification\|whatsapp\|code\|pin-input-field/);
});
