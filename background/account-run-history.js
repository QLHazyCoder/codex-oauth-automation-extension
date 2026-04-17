(function attachBackgroundAccountRunHistory(root, factory) {
  root.MultiPageBackgroundAccountRunHistory = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundAccountRunHistoryModule() {
  function createEmptyAccountRunStore(scope = 'persisted') {
    const startedAt = new Date().toISOString();
    return {
      schemaVersion: 2,
      scope: scope === 'session' ? 'session' : 'persisted',
      sessionStartedAt: startedAt,
      updatedAt: startedAt,
      accounts: [],
    };
  }

  function normalizeAccountRunTimestamp(value, fallback = '') {
    const rawValue = String(value || '').trim();
    const timestamp = Date.parse(rawValue);
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
    if (fallback) {
      return fallback;
    }
    return new Date().toISOString();
  }

  function compareAccountRunTimestamps(left, right) {
    const leftTime = Date.parse(String(left || ''));
    const rightTime = Date.parse(String(right || ''));
    const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedLeft - normalizedRight;
  }

  function sortAccountRunRecords(records = []) {
    return [...records].sort((left, right) => {
      const timeDiff = compareAccountRunTimestamps(left?.recordedAt, right?.recordedAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return String(left?.status || '').localeCompare(String(right?.status || ''));
    });
  }

  function normalizeAccountRunHistoryEvent(event = {}) {
    const status = String(event.status || '').trim().toLowerCase();
    if (!status) {
      return null;
    }

    return {
      status,
      recordedAt: normalizeAccountRunTimestamp(event.recordedAt),
      reason: String(event.reason || '').trim(),
    };
  }

  function normalizeFlatAccountRunRecord(record = {}) {
    const email = String(record.email || '').trim();
    const password = String(record.password || '').trim();
    const status = String(record.status || '').trim().toLowerCase();
    if (!email || !password || !status) {
      return null;
    }

    return {
      email,
      password,
      status,
      recordedAt: normalizeAccountRunTimestamp(record.recordedAt),
      reason: String(record.reason || '').trim(),
    };
  }

  function flattenAccountRunHistoryEntry(entry = {}) {
    const email = String(entry.email || '').trim();
    const password = String(entry.password || '').trim();
    if (!email || !password) {
      return [];
    }

    const normalizedEvents = Array.isArray(entry.events)
      ? entry.events
        .map((event) => normalizeAccountRunHistoryEvent(event))
        .filter(Boolean)
      : [];

    if (!normalizedEvents.length) {
      const fallbackRecord = normalizeFlatAccountRunRecord({
        email,
        password,
        status: entry.latestStatus,
        recordedAt: entry.lastRecordedAt || entry.firstRecordedAt,
        reason: entry.latestReason,
      });
      return fallbackRecord ? [fallbackRecord] : [];
    }

    return sortAccountRunRecords(normalizedEvents).map((event) => ({
      email,
      password,
      status: event.status,
      recordedAt: event.recordedAt,
      reason: event.reason,
    }));
  }

  function upsertAccountRunStoreRecord(store, record) {
    const normalizedRecord = normalizeFlatAccountRunRecord(record);
    if (!normalizedRecord) {
      return normalizeAccountRunStore(store);
    }

    const normalizedStore = normalizeAccountRunStore(store);
    const nextAccounts = [...normalizedStore.accounts];
    const targetIndex = nextAccounts.findIndex((entry) => (
      entry.email === normalizedRecord.email && entry.password === normalizedRecord.password
    ));

    if (targetIndex < 0) {
      nextAccounts.push({
        email: normalizedRecord.email,
        password: normalizedRecord.password,
        latestStatus: normalizedRecord.status,
        latestReason: normalizedRecord.reason,
        firstRecordedAt: normalizedRecord.recordedAt,
        lastRecordedAt: normalizedRecord.recordedAt,
        events: [{
          status: normalizedRecord.status,
          recordedAt: normalizedRecord.recordedAt,
          reason: normalizedRecord.reason,
        }],
      });
    } else {
      const currentEntry = nextAccounts[targetIndex];
      const nextEvents = sortAccountRunRecords([
        ...(Array.isArray(currentEntry.events) ? currentEntry.events : []),
        {
          status: normalizedRecord.status,
          recordedAt: normalizedRecord.recordedAt,
          reason: normalizedRecord.reason,
        },
      ]);
      const firstEvent = nextEvents[0];
      const lastEvent = nextEvents[nextEvents.length - 1];

      nextAccounts[targetIndex] = {
        ...currentEntry,
        latestStatus: normalizedRecord.status,
        latestReason: normalizedRecord.reason,
        firstRecordedAt: firstEvent?.recordedAt || normalizedRecord.recordedAt,
        lastRecordedAt: lastEvent?.recordedAt || normalizedRecord.recordedAt,
        events: nextEvents,
      };
    }

    return normalizeAccountRunStore({
      ...normalizedStore,
      accounts: nextAccounts,
      updatedAt: normalizedRecord.recordedAt,
    }, { scope: normalizedStore.scope });
  }

  function normalizeAccountRunStore(store, options = {}) {
    const scope = options.scope === 'session'
      ? 'session'
      : (store?.scope === 'session' ? 'session' : 'persisted');
    const base = createEmptyAccountRunStore(scope);
    const rawRecords = [];

    if (Array.isArray(store)) {
      rawRecords.push(...store);
    } else if (store && typeof store === 'object' && Array.isArray(store.accounts)) {
      for (const entry of store.accounts) {
        rawRecords.push(...flattenAccountRunHistoryEntry(entry));
      }
    }

    const accountMap = new Map();
    for (const rawRecord of sortAccountRunRecords(
      rawRecords.map((item) => normalizeFlatAccountRunRecord(item)).filter(Boolean)
    )) {
      const key = `${rawRecord.email}\n${rawRecord.password}`;
      const existing = accountMap.get(key);
      if (!existing) {
        accountMap.set(key, {
          email: rawRecord.email,
          password: rawRecord.password,
          latestStatus: rawRecord.status,
          latestReason: rawRecord.reason,
          firstRecordedAt: rawRecord.recordedAt,
          lastRecordedAt: rawRecord.recordedAt,
          events: [{
            status: rawRecord.status,
            recordedAt: rawRecord.recordedAt,
            reason: rawRecord.reason,
          }],
        });
        continue;
      }

      existing.events.push({
        status: rawRecord.status,
        recordedAt: rawRecord.recordedAt,
        reason: rawRecord.reason,
      });
      existing.events = sortAccountRunRecords(existing.events);
      existing.firstRecordedAt = existing.events[0]?.recordedAt || existing.firstRecordedAt;
      existing.lastRecordedAt = existing.events[existing.events.length - 1]?.recordedAt || existing.lastRecordedAt;
      existing.latestStatus = rawRecord.status;
      existing.latestReason = rawRecord.reason;
    }

    const accounts = [...accountMap.values()]
      .map((entry) => ({
        email: entry.email,
        password: entry.password,
        latestStatus: String(entry.latestStatus || '').trim().toLowerCase(),
        latestReason: String(entry.latestReason || '').trim(),
        firstRecordedAt: normalizeAccountRunTimestamp(entry.firstRecordedAt, base.sessionStartedAt),
        lastRecordedAt: normalizeAccountRunTimestamp(entry.lastRecordedAt, base.sessionStartedAt),
        events: sortAccountRunRecords(
          (Array.isArray(entry.events) ? entry.events : [])
            .map((event) => normalizeAccountRunHistoryEvent(event))
            .filter(Boolean)
        ),
      }))
      .sort((left, right) => compareAccountRunTimestamps(right.lastRecordedAt, left.lastRecordedAt));

    const latestTimestamp = accounts
      .map((entry) => entry.lastRecordedAt)
      .sort(compareAccountRunTimestamps)
      .pop();

    return {
      ...base,
      sessionStartedAt: normalizeAccountRunTimestamp(store?.sessionStartedAt, base.sessionStartedAt),
      updatedAt: normalizeAccountRunTimestamp(store?.updatedAt || latestTimestamp, latestTimestamp || base.updatedAt),
      accounts,
    };
  }

  function extractAccountRunStoreRecords(store) {
    const normalizedStore = normalizeAccountRunStore(store);
    const records = [];
    for (const entry of normalizedStore.accounts) {
      for (const event of entry.events) {
        records.push({
          email: entry.email,
          password: entry.password,
          status: event.status,
          recordedAt: event.recordedAt,
          reason: event.reason,
        });
      }
    }
    return sortAccountRunRecords(records);
  }

  function createAccountRunHistoryHelpers(deps = {}) {
    const {
      ACCOUNT_RUN_HISTORY_STORAGE_KEY = 'accountRunHistory',
      ACCOUNT_RUN_SESSION_STORAGE_KEY = 'accountRunSession',
      addLog,
      buildLocalHelperEndpoint,
      chrome,
      getErrorMessage,
      getState,
      normalizeAccountRunHistoryHelperBaseUrl,
    } = deps;

    let accountRunHistoryWriteQueue = Promise.resolve();

    function enqueueAccountRunHistoryWrite(task) {
      const work = accountRunHistoryWriteQueue.then(task, task);
      accountRunHistoryWriteQueue = work.catch(() => { });
      return work;
    }

    async function getPersistedAccountRunHistoryStore() {
      try {
        const stored = await chrome.storage.local.get(ACCOUNT_RUN_HISTORY_STORAGE_KEY);
        return normalizeAccountRunStore(stored[ACCOUNT_RUN_HISTORY_STORAGE_KEY], { scope: 'persisted' });
      } catch (err) {
        console.warn('[MultiPage:account-run-history] Failed to read persisted account run history:', err?.message || err);
        return createEmptyAccountRunStore('persisted');
      }
    }

    async function getSessionAccountRunStore() {
      try {
        const stored = await chrome.storage.session.get(ACCOUNT_RUN_SESSION_STORAGE_KEY);
        return normalizeAccountRunStore(stored[ACCOUNT_RUN_SESSION_STORAGE_KEY], { scope: 'session' });
      } catch (err) {
        console.warn('[MultiPage:account-run-history] Failed to read session account run history:', err?.message || err);
        return createEmptyAccountRunStore('session');
      }
    }

    async function getPersistedAccountRunHistory() {
      const store = await getPersistedAccountRunHistoryStore();
      return extractAccountRunStoreRecords(store);
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
      return enqueueAccountRunHistoryWrite(async () => {
        const state = stateOverride || await getState();
        const record = buildAccountRunHistoryRecord(state, status, reason);
        if (!record) {
          return null;
        }

        const [historyStore, sessionStore] = await Promise.all([
          getPersistedAccountRunHistoryStore(),
          getSessionAccountRunStore(),
        ]);

        const nextHistoryStore = upsertAccountRunStoreRecord(historyStore, record);
        const nextSessionStore = upsertAccountRunStoreRecord(sessionStore, record);

        await Promise.all([
          chrome.storage.local.set({
            [ACCOUNT_RUN_HISTORY_STORAGE_KEY]: nextHistoryStore,
          }),
          chrome.storage.session.set({
            [ACCOUNT_RUN_SESSION_STORAGE_KEY]: nextSessionStore,
          }),
        ]);

        return record;
      });
    }

    function resolveAccountLogPersistenceEnabled(state = {}) {
      if (state.enableLocalAccountLogPersistence !== undefined) {
        return Boolean(state.enableLocalAccountLogPersistence);
      }
      return Boolean(state.accountRunHistoryTextEnabled);
    }

    function resolveAccountLogHelperBaseUrl(state = {}) {
      const candidate = String(
        state.hotmailLocalBaseUrl
        || state.accountRunHistoryHelperBaseUrl
        || ''
      ).trim();
      return normalizeAccountRunHistoryHelperBaseUrl(candidate);
    }

    function shouldAppendAccountRunTextFile(state = {}) {
      if (!resolveAccountLogPersistenceEnabled(state)) {
        return false;
      }
      return Boolean(resolveAccountLogHelperBaseUrl(state));
    }

    async function appendAccountRunHistoryTextFile(record, stateOverride = null) {
      const normalizedRecord = record && typeof record === 'object'
        ? normalizeFlatAccountRunRecord(record)
        : buildAccountRunHistoryRecord(stateOverride || await getState(), '');
      if (!normalizedRecord?.email || !normalizedRecord?.password || !normalizedRecord?.status) {
        return null;
      }

      const state = stateOverride || await getState();
      if (!shouldAppendAccountRunTextFile(state)) {
        return null;
      }

      const helperBaseUrl = resolveAccountLogHelperBaseUrl(state);
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
        throw new Error(`Failed to write local account log: ${getErrorMessage(err)}`);
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch (err) {
        throw new Error(`Failed to parse local account log response: ${getErrorMessage(err)}`);
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(`Failed to write local account log: ${payload?.error || `HTTP ${response.status}`}`);
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
          await addLog(`Local account log updated: ${filePath}`, 'info');
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
      createEmptyAccountRunStore,
      extractAccountRunStoreRecords,
      getPersistedAccountRunHistory,
      getPersistedAccountRunHistoryStore,
      getSessionAccountRunStore,
      normalizeAccountRunStore,
      shouldAppendAccountRunTextFile,
      upsertAccountRunStoreRecord,
    };
  }

  return {
    createAccountRunHistoryHelpers,
    createEmptyAccountRunStore,
    normalizeAccountRunStore,
  };
});
