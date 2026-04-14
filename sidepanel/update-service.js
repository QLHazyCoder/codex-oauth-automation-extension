(() => {
  const GITHUB_OWNER = 'ZyphrZero';
  const GITHUB_REPO = 'codex-oauth-automation-extension';
  const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
  const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=10`;
  const CACHE_KEY = 'multipage-release-snapshot-v1';
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_RELEASES = 10;
  const MAX_NOTES_PER_RELEASE = 5;

  function stripVersionPrefix(version) {
    return String(version || '').trim().replace(/^v/i, '');
  }

  function parseVersionParts(version) {
    const core = stripVersionPrefix(version).split('-')[0];
    if (!core) {
      return [0];
    }

    return core.split('.').map((part) => {
      const numeric = Number.parseInt(part, 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });
  }

  function compareVersions(left, right) {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const maxLength = Math.max(leftParts.length, rightParts.length, 3);

    for (let index = 0; index < maxLength; index += 1) {
      const leftPart = leftParts[index] || 0;
      const rightPart = rightParts[index] || 0;
      if (leftPart > rightPart) {
        return 1;
      }
      if (leftPart < rightPart) {
        return -1;
      }
    }

    return 0;
  }

  function sanitizeInlineMarkdown(text) {
    return String(text || '')
      .replace(/!\[[^\]]*]\(([^)]+)\)/g, '')
      .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseReleaseNotes(body) {
    const lines = String(body || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const bulletLines = [];
    const plainLines = [];

    for (const line of lines) {
      if (/^#{1,6}\s*/.test(line)) {
        continue;
      }

      if (/^```/.test(line) || /^---+$/.test(line)) {
        continue;
      }

      if (/^[-*+]\s+/.test(line)) {
        bulletLines.push(line.replace(/^[-*+]\s+/, ''));
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        bulletLines.push(line.replace(/^\d+\.\s+/, ''));
        continue;
      }

      plainLines.push(line);
    }

    const noteLines = bulletLines.length > 0 ? bulletLines : plainLines;
    return noteLines
      .map(sanitizeInlineMarkdown)
      .filter(Boolean)
      .slice(0, MAX_NOTES_PER_RELEASE);
  }

  function normalizeReleaseVersion(release) {
    const candidates = [
      release?.tag_name,
      release?.name,
    ];

    for (const candidate of candidates) {
      const normalized = stripVersionPrefix(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  function sanitizeRelease(release) {
    const version = normalizeReleaseVersion(release);
    if (!version) {
      return null;
    }

    const rawTitle = sanitizeInlineMarkdown(release?.name || '');
    const normalizedTitle = stripVersionPrefix(rawTitle) === version ? '' : rawTitle;

    return {
      version,
      title: normalizedTitle,
      url: String(release?.html_url || RELEASES_PAGE_URL),
      publishedAt: String(release?.published_at || release?.created_at || ''),
      notes: parseReleaseNotes(release?.body || ''),
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.releases) || !Number.isFinite(parsed.fetchedAt)) {
        return null;
      }

      if ((Date.now() - parsed.fetchedAt) > CACHE_TTL_MS) {
        return null;
      }

      return parsed.releases;
    } catch (error) {
      return null;
    }
  }

  function writeCache(releases) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        fetchedAt: Date.now(),
        releases,
      }));
    } catch (error) {
      // Ignore cache write failures.
    }
  }

  async function fetchReleases() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(RELEASES_API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`GitHub Releases 请求失败（${response.status}）`);
      }

      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('GitHub Releases 返回格式异常');
      }

      const releases = payload
        .filter((release) => release && !release.draft && !release.prerelease)
        .map(sanitizeRelease)
        .filter(Boolean)
        .sort((left, right) => compareVersions(right.version, left.version))
        .slice(0, MAX_RELEASES);

      writeCache(releases);
      return releases;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('GitHub Releases 请求超时');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function loadReleases(options = {}) {
    if (!options.force) {
      const cached = readCache();
      if (cached) {
        return cached;
      }
    }

    return fetchReleases();
  }

  function buildReleaseSnapshot(releases, localVersion) {
    const latestRelease = releases[0] || null;
    if (!latestRelease) {
      return {
        status: 'empty',
        localVersion,
        latestVersion: null,
        latestRelease: null,
        newerReleases: [],
        logUrl: RELEASES_PAGE_URL,
        releasesPageUrl: RELEASES_PAGE_URL,
        checkedAt: Date.now(),
      };
    }

    const newerReleases = releases.filter((release) => compareVersions(release.version, localVersion) > 0);
    return {
      status: newerReleases.length > 0 ? 'update-available' : 'latest',
      localVersion,
      latestVersion: latestRelease.version,
      latestRelease,
      newerReleases,
      logUrl: latestRelease.url || RELEASES_PAGE_URL,
      releasesPageUrl: RELEASES_PAGE_URL,
      checkedAt: Date.now(),
    };
  }

  async function getReleaseSnapshot(options = {}) {
    const localVersion = stripVersionPrefix(chrome.runtime.getManifest()?.version || '0.0.0');

    try {
      const releases = await loadReleases(options);
      return buildReleaseSnapshot(releases, localVersion);
    } catch (error) {
      return {
        status: 'error',
        localVersion,
        latestVersion: null,
        latestRelease: null,
        newerReleases: [],
        logUrl: RELEASES_PAGE_URL,
        releasesPageUrl: RELEASES_PAGE_URL,
        checkedAt: Date.now(),
        errorMessage: error?.message || '更新检查失败',
      };
    }
  }

  function formatReleaseDate(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  window.SidepanelUpdateService = {
    compareVersions,
    formatReleaseDate,
    getReleaseSnapshot,
    releasesPageUrl: RELEASES_PAGE_URL,
    stripVersionPrefix,
  };
})();
