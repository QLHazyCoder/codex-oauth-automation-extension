(function attachBackgroundAccountRunHistory(root, factory) {
  root.MultiPageBackgroundAccountRunHistory = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundAccountRunHistoryModule() {
  function createAccountRunHistoryHelpers(deps = {}) {
    const {
      ACCOUNT_RUN_HISTORY_STORAGE_KEY = 'accountRunHistory',
      addLog,
      buildLocalHelperEndpoint,
      chrome,
      getErrorMessage,
      getState,
      normalizeAccountRunHistoryHelperBaseUrl,
    } = deps;

    function normalizeAccountRunHistory(records) {
      if (!Array.isArray(records)) {
        return [];
      }

      return records
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          email: String(item.email || '').trim(),
          password: String(item.password || '').trim(),
          status: String(item.status || '').trim().toLowerCase(),
          recordedAt: String(item.recordedAt || '').trim(),
          reason: String(item.reason || '').trim(),
        }))
        .filter((item) => item.email && item.password && item.status);
    }

    async function getPersistedAccountRunHistory() {
      try {
        const stored = await chrome.storage.local.get(ACCOUNT_RUN_HISTORY_STORAGE_KEY);
        return normalizeAccountRunHistory(stored[ACCOUNT_RUN_HISTORY_STORAGE_KEY]);
      } catch (err) {
        console.warn('[MultiPage:account-run-history] Failed to read account run history:', err?.message || err);
        return [];
      }
    }

    function buildAccountRunHistoryRecord(state = {}, status = '', reason = '') {
      const email = String(state.email || '').trim();
      const password = String(state.password || state.customPassword || '').trim();
      const normalizedStatus = String(status || '').trim().toLowerCase();
      const normalizedReason = String(reason || '').trim();

      if (!email || !password || !normalizedStatus) {
        return null;
      }

      return {
        email,
        password,
        status: normalizedStatus,
        recordedAt: new Date().toISOString(),
        reason: normalizedReason,
      };
    }

    async function appendAccountRunHistoryRecord(status, stateOverride = null, reason = '') {
      const state = stateOverride || await getState();
      const record = buildAccountRunHistoryRecord(state, status, reason);
      if (!record) {
        return null;
      }

      const history = await getPersistedAccountRunHistory();
      history.push(record);
      await chrome.storage.local.set({
        [ACCOUNT_RUN_HISTORY_STORAGE_KEY]: history,
      });
      return record;
    }

    function shouldAppendAccountRunTextFile(state = {}) {
      if (!Boolean(state.accountRunHistoryTextEnabled)) {
        return false;
      }

      const helperBaseUrl = normalizeAccountRunHistoryHelperBaseUrl(state.accountRunHistoryHelperBaseUrl);
      return Boolean(helperBaseUrl);
    }

    async function appendAccountRunHistoryTextFile(record, stateOverride = null) {
      const normalizedRecord = record && typeof record === 'object'
        ? record
        : buildAccountRunHistoryRecord(stateOverride || await getState(), '');
      if (!normalizedRecord?.email || !normalizedRecord?.password || !normalizedRecord?.status) {
        return null;
      }

      const state = stateOverride || await getState();
      if (!shouldAppendAccountRunTextFile(state)) {
        return null;
      }

      const helperBaseUrl = normalizeAccountRunHistoryHelperBaseUrl(state.accountRunHistoryHelperBaseUrl);
      let response;
      try {
        response = await fetch(buildLocalHelperEndpoint(helperBaseUrl, '/append-account-log'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: normalizedRecord.email,
            password: normalizedRecord.password,
            status: normalizedRecord.status,
            recordedAt: normalizedRecord.recordedAt,
            reason: normalizedRecord.reason || '',
          }),
        });
      } catch (err) {
        throw new Error(`账号文本记录写入失败：无法连接本地 helper（${getErrorMessage(err)}）`);
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error(`账号文本记录写入失败：本地 helper 返回了无法解析的响应（${getErrorMessage(err)}）`);
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(`账号文本记录写入失败：${payload?.error || `HTTP ${response.status}`}`);
      }

      return payload?.filePath || '';
    }

    async function appendAccountRunRecord(status, stateOverride = null, reason = '') {
      const state = stateOverride || await getState();
      const record = await appendAccountRunHistoryRecord(status, state, reason);
      if (!record) {
        return null;
      }

      try {
        const filePath = await appendAccountRunHistoryTextFile(record, state);
        if (filePath) {
          await addLog(`账号记录已追加到本地文本：${filePath}`, 'info');
        }
      } catch (err) {
        await addLog(getErrorMessage(err), 'warn');
      }

      return record;
    }

    return {
      appendAccountRunRecord,
      appendAccountRunHistoryRecord,
      appendAccountRunHistoryTextFile,
      buildAccountRunHistoryRecord,
      getPersistedAccountRunHistory,
      normalizeAccountRunHistory,
      shouldAppendAccountRunTextFile,
    };
  }

  return {
    createAccountRunHistoryHelpers,
  };
});
