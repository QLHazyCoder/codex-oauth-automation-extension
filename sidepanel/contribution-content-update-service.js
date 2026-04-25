(() => {
  const PORTAL_BASE_URL = 'https://apikey.qzz.io';
  const CONTENT_SUMMARY_API_URL = `${PORTAL_BASE_URL}/api/content-summary`;
  const CACHE_KEY = 'multipage-contribution-content-summary-v1';
  const FETCH_TIMEOUT_MS = 6000;

  function sanitizeItem(item = {}) {
    return {
      slug: String(item?.slug || '').trim(),
      title: String(item?.title || '').trim(),
      isEnabled: Boolean(item?.is_enabled),
      hasContent: Boolean(item?.has_content),
      isVisible: Boolean(item?.is_visible),
      updatedAt: String(item?.updated_at || '').trim(),
      updatedAtDisplay: String(item?.updated_at_display || '').trim(),
    };
  }

  function buildSnapshot(payload = {}) {
    const items = Array.isArray(payload?.items)
      ? payload.items.map(sanitizeItem).filter((item) => item.slug)
      : [];
    const promptVersion = String(payload?.prompt_version || '').trim();
    const latestUpdatedAt = String(payload?.latest_updated_at || '').trim();
    const latestUpdatedAtDisplay = String(payload?.latest_updated_at_display || '').trim();
    const hasVisibleUpdates = Boolean(payload?.has_visible_updates) && Boolean(promptVersion);

    return {
      status: hasVisibleUpdates ? 'update-available' : 'idle',
      promptVersion,
      hasVisibleUpdates,
      latestUpdatedAt,
      latestUpdatedAtDisplay,
      items,
      portalUrl: PORTAL_BASE_URL,
      apiUrl: CONTENT_SUMMARY_API_URL,
      checkedAt: Date.now(),
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const snapshot = buildSnapshot({
        items: parsed.items,
        prompt_version: parsed.promptVersion,
        has_visible_updates: parsed.hasVisibleUpdates,
        latest_updated_at: parsed.latestUpdatedAt,
        latest_updated_at_display: parsed.latestUpdatedAtDisplay,
      });
      if (!Number.isFinite(parsed.checkedAt)) {
        return snapshot;
      }
      snapshot.checkedAt = parsed.checkedAt;
      return snapshot;
    } catch (error) {
      return null;
    }
  }

  function writeCache(snapshot) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      // Ignore cache write failures.
    }
  }

  async function fetchContentSummary() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(CONTENT_SUMMARY_API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`内容摘要请求失败：${response.status}`);
      }

      const payload = await response.json();
      if (!payload || payload.ok !== true) {
        throw new Error('内容摘要返回格式异常');
      }

      const snapshot = buildSnapshot(payload);
      writeCache(snapshot);
      return snapshot;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('内容摘要请求超时');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function getContentUpdateSnapshot() {
    try {
      return await fetchContentSummary();
    } catch (error) {
      const cached = readCache();
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          errorMessage: error?.message || '内容摘要获取失败',
        };
      }

      return {
        status: 'error',
        promptVersion: '',
        hasVisibleUpdates: false,
        latestUpdatedAt: '',
        latestUpdatedAtDisplay: '',
        items: [],
        portalUrl: PORTAL_BASE_URL,
        apiUrl: CONTENT_SUMMARY_API_URL,
        checkedAt: Date.now(),
        errorMessage: error?.message || '内容摘要获取失败',
      };
    }
  }

  window.SidepanelContributionContentService = {
    getContentUpdateSnapshot,
    portalUrl: PORTAL_BASE_URL,
    apiUrl: CONTENT_SUMMARY_API_URL,
  };
})();
