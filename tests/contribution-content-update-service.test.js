const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/contribution-content-update-service.js', 'utf8');

function createContributionContentService(options = {}) {
  const cache = new Map();
  const windowObject = {};
  let fetchCalls = 0;

  const localStorage = {
    getItem(key) {
      return cache.has(key) ? cache.get(key) : null;
    },
    setItem(key, value) {
      cache.set(key, String(value));
    },
    removeItem(key) {
      cache.delete(key);
    },
  };

  if (options.cachedSnapshot) {
    cache.set(
      'multipage-contribution-content-summary-v1',
      JSON.stringify(options.cachedSnapshot)
    );
  }

  const fetchImpl = options.fetchImpl || (async () => ({
    ok: true,
    async json() {
      return {
        ok: true,
        items: [],
        prompt_version: '',
        has_visible_updates: false,
        latest_updated_at: '',
        latest_updated_at_display: '',
      };
    },
  }));

  const wrappedFetch = async (...args) => {
    fetchCalls += 1;
    return fetchImpl(...args);
  };

  const api = new Function(
    'window',
    'localStorage',
    'fetch',
    'AbortController',
    'setTimeout',
    'clearTimeout',
    `${source}; return window.SidepanelContributionContentService;`
  )(
    windowObject,
    localStorage,
    wrappedFetch,
    AbortController,
    setTimeout,
    clearTimeout
  );

  return {
    api,
    getFetchCalls() {
      return fetchCalls;
    },
  };
}

test('getContentUpdateSnapshot returns a prompt version for visible contribution content updates', async () => {
  const { api } = createContributionContentService({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          ok: true,
          prompt_version: 'announcement:2026-04-21T12:00:00Z|tutorial:2026-04-21T12:05:00Z',
          has_visible_updates: true,
          latest_updated_at: '2026-04-21T12:05:00Z',
          latest_updated_at_display: '2026-04-21 20:05',
          items: [
            {
              slug: 'announcement',
              title: '最新公告',
              is_enabled: true,
              has_content: true,
              is_visible: true,
              updated_at: '2026-04-21T12:00:00Z',
              updated_at_display: '2026-04-21 20:00',
            },
            {
              slug: 'tutorial',
              title: '使用教程',
              is_enabled: true,
              has_content: true,
              is_visible: true,
              updated_at: '2026-04-21T12:05:00Z',
              updated_at_display: '2026-04-21 20:05',
            },
          ],
        };
      },
    }),
  });

  const snapshot = await api.getContentUpdateSnapshot();

  assert.equal(snapshot.status, 'update-available');
  assert.equal(snapshot.promptVersion, 'announcement:2026-04-21T12:00:00Z|tutorial:2026-04-21T12:05:00Z');
  assert.equal(snapshot.hasVisibleUpdates, true);
  assert.equal(snapshot.latestUpdatedAt, '2026-04-21T12:05:00Z');
  assert.equal(snapshot.items.length, 2);
  assert.deepEqual(
    snapshot.items.map((item) => [item.slug, item.isVisible]),
    [['announcement', true], ['tutorial', true]]
  );
});

test('getContentUpdateSnapshot falls back to cached snapshot when the live request fails', async () => {
  const cachedSnapshot = {
    status: 'update-available',
    promptVersion: 'announcement:2026-04-20T00:00:00Z',
    hasVisibleUpdates: true,
    latestUpdatedAt: '2026-04-20T00:00:00Z',
    latestUpdatedAtDisplay: '2026-04-20 08:00',
    items: [
      {
        slug: 'announcement',
        title: '站点公告',
        isEnabled: true,
        hasContent: true,
        isVisible: true,
        updatedAt: '2026-04-20T00:00:00Z',
        updatedAtDisplay: '2026-04-20 08:00',
      },
    ],
    portalUrl: 'https://apikey.qzz.io',
    apiUrl: 'https://apikey.qzz.io/api/content-summary',
    checkedAt: Date.now() - 1000,
  };

  const { api, getFetchCalls } = createContributionContentService({
    cachedSnapshot,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });

  const snapshot = await api.getContentUpdateSnapshot();

  assert.equal(getFetchCalls(), 1);
  assert.equal(snapshot.fromCache, true);
  assert.equal(snapshot.promptVersion, cachedSnapshot.promptVersion);
  assert.equal(snapshot.errorMessage, 'offline');
  assert.equal(snapshot.items[0].slug, 'announcement');
});
