(function attachBackgroundPlusCheckoutCreate(root, factory) {
  root.MultiPageBackgroundPlusCheckoutCreate = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPlusCheckoutCreateModule() {
  const PLUS_CHECKOUT_SOURCE = 'plus-checkout';
  const PLUS_CHECKOUT_ENTRY_URL = 'https://chatgpt.com/';
  const PLUS_CHECKOUT_INJECT_FILES = ['content/utils.js', 'content/plus-checkout.js'];
  const PLUS_PAYMENT_METHOD_GOPAY = 'gopay';

  function createPlusCheckoutCreateExecutor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      ensureContentScriptReadyOnTabUntilStopped,
      registerTab,
      sendTabMessageUntilStopped,
      setState,
      sleepWithStop,
      waitForTabCompleteUntilStopped,
    } = deps;

    async function openFreshChatGptTabForCheckoutCreate() {
      const tab = await chrome.tabs.create({ url: PLUS_CHECKOUT_ENTRY_URL, active: true });
      const tabId = Number(tab?.id);
      if (!Number.isInteger(tabId)) {
        throw new Error('步骤 6：打开 ChatGPT 页面失败，未获取到有效标签页 ID。');
      }
      if (typeof registerTab === 'function') {
        await registerTab(PLUS_CHECKOUT_SOURCE, tabId);
      }
      return tabId;
    }

    function normalizePlusPaymentMethod(value = '') {
      return String(value || '').trim().toLowerCase() === PLUS_PAYMENT_METHOD_GOPAY ? 'gopay' : 'paypal';
    }

    function getPlusPaymentMethodLabel(method = 'paypal') {
      return normalizePlusPaymentMethod(method) === PLUS_PAYMENT_METHOD_GOPAY ? 'GoPay' : 'PayPal';
    }

    async function executePlusCheckoutCreate(state = {}) {
      const paymentMethod = normalizePlusPaymentMethod(state?.plusPaymentMethod);
      const paymentMethodLabel = getPlusPaymentMethodLabel(paymentMethod);
      await addLog('步骤 6：正在新打开 ChatGPT 会话页，准备创建 Plus Checkout...', 'info');
      const tabId = await openFreshChatGptTabForCheckoutCreate();

      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);
      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 6：ChatGPT 页面仍在加载，等待 Plus Checkout 脚本就绪...',
      });

      const result = await sendTabMessageUntilStopped(tabId, PLUS_CHECKOUT_SOURCE, {
        type: 'CREATE_PLUS_CHECKOUT',
        source: 'background',
        payload: { paymentMethod },
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      if (!result?.checkoutUrl) {
        throw new Error('步骤 6：Plus Checkout 创建后未返回支付链接。');
      }

      await addLog('步骤 6：Plus Checkout 已创建，正在打开支付页面...', 'ok');
      await chrome.tabs.update(tabId, { url: result.checkoutUrl, active: true });
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(1000);
      await ensureContentScriptReadyOnTabUntilStopped(PLUS_CHECKOUT_SOURCE, tabId, {
        inject: PLUS_CHECKOUT_INJECT_FILES,
        injectSource: PLUS_CHECKOUT_SOURCE,
        logMessage: '步骤 6：Checkout 页面仍在加载，等待页面脚本就绪...',
      });

      await setState({
        plusCheckoutTabId: tabId,
        plusCheckoutUrl: result.checkoutUrl,
        plusCheckoutCountry: result.country || 'DE',
        plusCheckoutCurrency: result.currency || 'EUR',
      });

      await addLog(`步骤 6：Plus Checkout 页面已就绪（${paymentMethodLabel} / ${result.country || 'DE'} ${result.currency || 'EUR'}），准备继续下一步。`, 'info');

      await completeStepFromBackground(6, {
        plusCheckoutCountry: result.country || 'DE',
        plusCheckoutCurrency: result.currency || 'EUR',
      });
    }

    return {
      executePlusCheckoutCreate,
    };
  }

  return {
    createPlusCheckoutCreateExecutor,
  };
});
