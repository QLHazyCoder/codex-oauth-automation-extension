(function attachBackgroundStep3(root, factory) {
  root.MultiPageBackgroundStep3 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep3Module() {
  function createStep3Executor(deps = {}) {
    const {
      addLog,
      chrome,
      ensureContentScriptReadyOnTab,
      recoverSignupPageIfNeeded,
      generatePassword,
      getTabId,
      isTabAlive,
      sendToSignupPageWithRecovery,
      setPasswordState,
      setState,
      SIGNUP_PAGE_INJECT_FILES,
    } = deps;

    async function executeStep3(state) {
      const resolvedEmail = state.email;
      if (!resolvedEmail) {
        throw new Error('缺少邮箱地址，请先完成步骤 2。');
      }

      const signupTabId = await getTabId('signup-page');
      if (!signupTabId || !(await isTabAlive('signup-page'))) {
        throw new Error('认证页面标签页已关闭，请先重新完成步骤 2。');
      }

      const password = state.customPassword || generatePassword();
      await setPasswordState(password);

      const accounts = state.accounts || [];
      accounts.push({ email: resolvedEmail, password, createdAt: new Date().toISOString() });
      await setState({ accounts });

      await chrome.tabs.update(signupTabId, { active: true });
      await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: '步骤 3：密码页内容脚本未就绪，正在等待页面恢复...',
      });

      await recoverSignupPageIfNeeded(3);
      await addLog(
        `步骤 3：正在填写密码，邮箱为 ${resolvedEmail}，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
      );
      await sendToSignupPageWithRecovery({
        type: 'EXECUTE_STEP',
        step: 3,
        source: 'background',
        payload: { email: resolvedEmail, password },
      }, {
        step: 3,
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: '步骤 3：密码页正在切换，等待页面恢复后继续填写密码...',
      });
    }

    return { executeStep3 };
  }

  return { createStep3Executor };
});
