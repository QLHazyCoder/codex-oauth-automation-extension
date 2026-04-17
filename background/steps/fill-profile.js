(function attachBackgroundStep5(root, factory) {
  root.MultiPageBackgroundStep5 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep5Module() {
  function createStep5Executor(deps = {}) {
    const {
      addLog,
      generateRandomBirthday,
      generateRandomName,
      recoverSignupPageIfNeeded,
      sendToSignupPageWithRecovery,
    } = deps;

    async function executeStep5() {
      const { firstName, lastName } = generateRandomName();
      const { year, month, day } = generateRandomBirthday();

      await addLog(`步骤 5：已生成姓名 ${firstName} ${lastName}，生日 ${year}-${month}-${day}`);
      await recoverSignupPageIfNeeded(5);

      await sendToSignupPageWithRecovery({
        type: 'EXECUTE_STEP',
        step: 5,
        source: 'background',
        payload: { firstName, lastName, year, month, day },
      }, {
        step: 5,
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: '步骤 5：资料页正在切换，等待页面恢复后继续填写...',
      });
    }

    return { executeStep5 };
  }

  return { createStep5Executor };
});
