const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

function cloneState(state) {
  return {
    ...state,
    tabRegistry: { ...(state.tabRegistry || {}) },
    sourceLastUrls: { ...(state.sourceLastUrls || {}) },
    retainedTabOwnership: { ...(state.retainedTabOwnership || {}) },
  };
}

function createHarness(options = {}) {
  const initialState = options.state || {};
  let currentState = cloneState({
    tabRegistry: {},
    sourceLastUrls: {},
    retainedTabOwnership: {},
    ...initialState,
  });

  const logs = [];
  const createCalls = [];
  const updateCalls = [];
  const reloadCalls = [];
  const removedTabIds = [];
  const tabs = new Map();
  const updateListeners = new Set();

  const initialTabs = Array.isArray(options.tabs) ? options.tabs : [];
  let nextTabId = 1;
  for (const tab of initialTabs) {
    const normalized = {
      id: tab.id,
      url: tab.url || 'https://example.com',
      status: tab.status || 'complete',
      active: Boolean(tab.active),
    };
    tabs.set(normalized.id, normalized);
    nextTabId = Math.max(nextTabId, normalized.id + 1);
  }

  function emitTabComplete(tabId) {
    setTimeout(() => {
      for (const listener of updateListeners) {
        listener(tabId, { status: 'complete' });
      }
    }, 0);
  }

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    chrome: {
      tabs: {
        get: async (tabId) => {
          const tab = tabs.get(tabId);
          if (!tab) {
            throw new Error(`No tab ${tabId}`);
          }
          return { ...tab };
        },
        query: async () => Array.from(tabs.values()).map((tab) => ({ ...tab })),
        create: async ({ url, active }) => {
          const tab = {
            id: nextTabId,
            url,
            status: 'complete',
            active: Boolean(active),
          };
          nextTabId += 1;
          tabs.set(tab.id, tab);
          createCalls.push({ url, active: Boolean(active), tabId: tab.id });
          return { ...tab };
        },
        remove: async (tabIds) => {
          for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
            removedTabIds.push(tabId);
            tabs.delete(tabId);
          }
        },
        update: async (tabId, updates = {}) => {
          const existing = tabs.get(tabId);
          if (!existing) {
            throw new Error(`No tab ${tabId}`);
          }
          const next = { ...existing, ...updates };
          if (Object.prototype.hasOwnProperty.call(updates, 'url')) {
            next.status = 'complete';
            emitTabComplete(tabId);
          }
          tabs.set(tabId, next);
          updateCalls.push({ tabId, updates: { ...updates } });
          return { ...next };
        },
        reload: async (tabId) => {
          const existing = tabs.get(tabId);
          if (!existing) {
            throw new Error(`No tab ${tabId}`);
          }
          tabs.set(tabId, { ...existing, status: 'complete' });
          reloadCalls.push(tabId);
          emitTabComplete(tabId);
        },
        sendMessage: async () => ({ ok: true }),
        onUpdated: {
          addListener(listener) {
            updateListeners.add(listener);
          },
          removeListener(listener) {
            updateListeners.delete(listener);
          },
        },
      },
      scripting: {
        executeScript: async () => {},
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => cloneState(currentState),
    isLocalhostOAuthCallbackUrl: () => false,
    isRetryableContentScriptTransportError: () => false,
    matchesSourceUrlFamily: (sourceName, candidateUrl, referenceUrl) => {
      if (sourceName !== 'icloud-mail') return false;
      return new URL(candidateUrl).hostname === new URL(referenceUrl).hostname;
    },
    setState: async (updates = {}) => {
      currentState = cloneState({
        ...currentState,
        ...updates,
        tabRegistry: Object.prototype.hasOwnProperty.call(updates, 'tabRegistry')
          ? updates.tabRegistry
          : currentState.tabRegistry,
        sourceLastUrls: Object.prototype.hasOwnProperty.call(updates, 'sourceLastUrls')
          ? updates.sourceLastUrls
          : currentState.sourceLastUrls,
        retainedTabOwnership: Object.prototype.hasOwnProperty.call(updates, 'retainedTabOwnership')
          ? updates.retainedTabOwnership
          : currentState.retainedTabOwnership,
      });
    },
    sleepWithStop: async () => {},
    STOP_ERROR_MESSAGE: 'Flow stopped.',
    throwIfStopped: () => {},
  });

  return {
    runtime,
    logs,
    createCalls,
    updateCalls,
    reloadCalls,
    removedTabIds,
    tabs,
    snapshot: () => cloneState(currentState),
  };
}

test('background imports tab runtime module', () => {
  const backgroundSource = fs.readFileSync('background.js', 'utf8');
  assert.match(backgroundSource, /background\/tab-runtime\.js/);
});

test('tab runtime module exposes a factory', () => {
  assert.equal(typeof api?.createTabRuntime, 'function');
});

test('tab runtime waitForTabComplete waits until tab status becomes complete', async () => {
  let getCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => {
          getCalls += 1;
          return {
            id: 9,
            url: 'https://example.com',
            status: getCalls >= 3 ? 'complete' : 'loading',
          };
        },
        query: async () => [],
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {}, retainedTabOwnership: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  const result = await runtime.waitForTabComplete(9, {
    timeoutMs: 2000,
    retryDelayMs: 1,
  });

  assert.equal(result?.status, 'complete');
  assert.equal(getCalls, 3);
});

test('tab runtime waitForTabComplete aborts promptly when stop is requested', async () => {
  let throwCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({
          id: 9,
          url: 'https://example.com',
          status: 'loading',
        }),
        query: async () => [],
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {}, retainedTabOwnership: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {
      throwCalls += 1;
      if (throwCalls >= 2) {
        throw new Error('Flow stopped.');
      }
    },
  });

  await assert.rejects(
    runtime.waitForTabComplete(9, {
      timeoutMs: 2000,
      retryDelayMs: 1,
    }),
    /Flow stopped\./
  );
});

test('iCloud ownership-missing path creates a dedicated owned tab without adopting user tab', async () => {
  const harness = createHarness({
    tabs: [
      { id: 9, url: 'https://www.icloud.com/mail/' },
    ],
  });

  const tabId = await harness.runtime.reuseOrCreateTab('icloud-mail', 'https://www.icloud.com/mail/');
  const snapshot = harness.snapshot();

  assert.notEqual(tabId, 9, 'runtime must not adopt a user-opened iCloud tab');
  assert.equal(harness.createCalls.length, 1, 'runtime should create exactly one automation-owned tab');
  assert.deepEqual(harness.removedTabIds, [], 'runtime must not close the user-opened iCloud tab');
  assert.ok(harness.tabs.has(9), 'user-opened iCloud tab should remain open');
  assert.equal(snapshot.retainedTabOwnership['icloud-mail']?.tabId, tabId, 'owned tab should be retained outside generic registry state');
  assert.deepEqual(snapshot.tabRegistry['icloud-mail'], { tabId, ready: true }, 'owned tab should be mirrored into active registry state');
  assert.deepEqual(
    harness.logs.map((entry) => entry.message),
    [
      'icloud-mail ownership-missing-create-new',
      'icloud-mail create-owned-tab',
      'icloud-mail mirror-owned-tab-into-registry',
    ],
  );
});

test('closeConflictingTabsForSource never closes iCloud tabs without ownership', async () => {
  const harness = createHarness({
    state: {
      sourceLastUrls: {
        'icloud-mail': 'https://www.icloud.com/mail/',
      },
    },
    tabs: [
      { id: 9, url: 'https://www.icloud.com/mail/' },
    ],
  });

  await harness.runtime.closeConflictingTabsForSource('icloud-mail', 'https://www.icloud.com/mail/');

  assert.deepEqual(harness.removedTabIds, []);
  assert.ok(harness.tabs.has(9));
});

test('iCloud retained ownership survives registry reset and reuses the same owned tab', async () => {
  const harness = createHarness({
    state: {
      retainedTabOwnership: {
        'icloud-mail': { tabId: 21, url: 'https://www.icloud.com/mail/' },
      },
    },
    tabs: [
      { id: 21, url: 'https://www.icloud.com/mail/' },
    ],
  });

  const tabId = await harness.runtime.reuseOrCreateTab('icloud-mail', 'https://www.icloud.com/mail/');
  const snapshot = harness.snapshot();

  assert.equal(tabId, 21, 'runtime should reuse the retained owned tab');
  assert.equal(harness.createCalls.length, 0, 'reusing retained ownership must not create a new tab');
  assert.deepEqual(snapshot.tabRegistry['icloud-mail'], { tabId: 21, ready: true }, 'retained owned tab should be mirrored back into registry');
  assert.deepEqual(
    harness.logs.map((entry) => entry.message),
    [
      'icloud-mail mirror-owned-tab-into-registry',
      'icloud-mail reuse-owned-tab',
    ],
  );
});

test('iCloud retained ownership recovers by navigation instead of creating a second tab', async () => {
  const harness = createHarness({
    state: {
      retainedTabOwnership: {
        'icloud-mail': { tabId: 21, url: 'https://www.icloud.com/' },
      },
    },
    tabs: [
      { id: 21, url: 'https://www.icloud.com/' },
    ],
  });

  const tabId = await harness.runtime.reuseOrCreateTab('icloud-mail', 'https://www.icloud.com/mail/');
  const snapshot = harness.snapshot();

  assert.equal(tabId, 21);
  assert.equal(harness.createCalls.length, 0, 'navigation recovery should not create a replacement tab');
  assert.deepEqual(harness.updateCalls, [
    { tabId: 21, updates: { active: true } },
    { tabId: 21, updates: { url: 'https://www.icloud.com/mail/', active: true } },
  ]);
  assert.equal(snapshot.retainedTabOwnership['icloud-mail']?.url, 'https://www.icloud.com/mail/');
  assert.deepEqual(
    harness.logs.map((entry) => entry.message),
    [
      'icloud-mail mirror-owned-tab-into-registry',
      'icloud-mail recover-owned-tab-via-navigation',
    ],
  );
});

test('manually closed owned iCloud tab is replaced exactly once and then reused', async () => {
  const harness = createHarness({
    state: {
      retainedTabOwnership: {
        'icloud-mail': { tabId: 77, url: 'https://www.icloud.com/mail/' },
      },
    },
  });

  const replacementTabId = await harness.runtime.reuseOrCreateTab('icloud-mail', 'https://www.icloud.com/mail/');
  const reusedReplacementTabId = await harness.runtime.reuseOrCreateTab('icloud-mail', 'https://www.icloud.com/mail/');

  assert.equal(harness.createCalls.length, 1, 'manual close should produce exactly one replacement tab');
  assert.equal(replacementTabId, reusedReplacementTabId, 'later runs should reuse the replacement tab');
  assert.equal(harness.snapshot().retainedTabOwnership['icloud-mail']?.tabId, replacementTabId);
  assert.deepEqual(
    harness.logs.map((entry) => entry.message),
    [
      'icloud-mail create-owned-tab',
      'icloud-mail mirror-owned-tab-into-registry',
      'icloud-mail mirror-owned-tab-into-registry',
      'icloud-mail reuse-owned-tab',
    ],
  );
});

test('runtime logs iCloud manual-inspection preservation only when an owned tab is still open', async () => {
  const harness = createHarness({
    state: {
      retainedTabOwnership: {
        'icloud-mail': { tabId: 42, url: 'https://www.icloud.com/mail/' },
      },
    },
    tabs: [
      { id: 42, url: 'https://www.icloud.com/mail/' },
    ],
  });

  const preserved = await harness.runtime.logOwnedTabPreserved('icloud-mail');

  assert.equal(preserved, true);
  assert.deepEqual(harness.logs.map((entry) => entry.message), [
    'icloud-mail preserve-for-manual-inspection',
  ]);
});
