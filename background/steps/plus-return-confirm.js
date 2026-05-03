(function attachBackgroundPlusReturnConfirm(root, factory) {
  root.MultiPageBackgroundPlusReturnConfirm = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPlusReturnConfirmModule() {
  const PAYPAL_SOURCE = 'paypal-flow';
  const GOPAY_SOURCE = 'gopay-flow';
  const PLUS_CHECKOUT_SOURCE = 'plus-checkout';
  const PLUS_RETURN_SETTLE_WAIT_MS = 20000;

  function createPlusReturnConfirmExecutor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      getTabId,
      isTabAlive,
      setState,
      sleepWithStop,
      waitForTabUrlMatchUntilStopped,
    } = deps;

    async function resolveReturnTabId(state = {}) {
      const paypalTabId = await getTabId(PAYPAL_SOURCE);
      if (paypalTabId && await isTabAlive(PAYPAL_SOURCE)) {
        return paypalTabId;
      }
      const gopayTabId = await getTabId(GOPAY_SOURCE);
      if (gopayTabId && await isTabAlive(GOPAY_SOURCE)) {
        return gopayTabId;
      }
      const checkoutTabId = await getTabId(PLUS_CHECKOUT_SOURCE);
      if (checkoutTabId) {
        return checkoutTabId;
      }
      const storedTabId = Number(state.plusCheckoutTabId) || 0;
      if (storedTabId) {
        return storedTabId;
      }
      throw new Error('步骤 9：未找到 Plus / PayPal / GoPay 标签页，无法确认订阅回跳。');
    }

    function isReturnUrl(url = '') {
      return /https:\/\/(?:chatgpt\.com|chat\.openai\.com|openai\.com)\//i.test(String(url || ''))
        && !/paypal\.|gopay|gojek|midtrans|xendit|stripe/i.test(String(url || ''));
    }

    async function executePlusReturnConfirm(state = {}) {
      const tabId = await resolveReturnTabId(state);
      await addLog('步骤 9：正在等待支付授权后回跳到 ChatGPT / OpenAI 页面...', 'info');
      const tab = await waitForTabUrlMatchUntilStopped(tabId, isReturnUrl);
      await addLog('步骤 9：已检测到订阅回跳页面，固定等待 20 秒让页面完成加载。', 'info');
      await sleepWithStop(PLUS_RETURN_SETTLE_WAIT_MS);

      await setState({
        plusCheckoutTabId: tabId,
        plusReturnUrl: tab?.url || '',
      });
      await completeStepFromBackground(9, {
        plusReturnUrl: tab?.url || '',
      });
    }

    return {
      executePlusReturnConfirm,
    };
  }

  return {
    createPlusReturnConfirmExecutor,
  };
});
