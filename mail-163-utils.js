(function mail163UtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.Mail163Utils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMail163Utils() {
  const DEFAULT_SIGNATURE_HISTORY_LIMIT = 200;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeTimestamp(value) {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeMinuteTimestamp(value) {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp) return 0;

    const date = new Date(timestamp);
    date.setSeconds(0, 0);
    return date.getTime();
  }

  function parseMail163Timestamp(rawText, nowValue = new Date()) {
    const text = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    let match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        0,
        0
      ).getTime();
    }

    match = text.match(/\b(\d{1,2}):(\d{2})\b/);
    if (match) {
      const [, hour, minute] = match;
      const nowTimestamp = normalizeTimestamp(nowValue) || Date.now();
      const now = new Date(nowTimestamp);
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Number(hour),
        Number(minute),
        0,
        0
      ).getTime();
    }

    return null;
  }

  function extractVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function buildMail163EntrySignature(entry = {}) {
    const code = entry.code || extractVerificationCode(
      [entry.subject, entry.ariaLabel, entry.sender].filter(Boolean).join(' ')
    );
    const signatureParts = [
      entry.id ? `id=${String(entry.id).trim()}` : '',
      normalizeText(entry.sender),
      normalizeText(entry.subject),
      normalizeText(entry.ariaLabel),
      String(normalizeMinuteTimestamp(entry.timestamp) || 0),
      code || '',
    ];
    return signatureParts.join('|');
  }

  function normalizeMail163Entry(entry = {}, index = 0) {
    const timestamp = normalizeTimestamp(entry.timestamp);
    const code = entry.code || extractVerificationCode(
      [entry.subject, entry.ariaLabel, entry.sender].filter(Boolean).join(' ')
    );
    const normalizedEntry = {
      ...entry,
      index: Number.isFinite(entry.index) ? entry.index : index,
      id: String(entry.id || '').trim(),
      sender: String(entry.sender || '').trim(),
      subject: String(entry.subject || '').trim(),
      ariaLabel: String(entry.ariaLabel || '').trim(),
      timestamp,
      minuteTimestamp: normalizeMinuteTimestamp(timestamp),
      code,
    };
    normalizedEntry.signature = buildMail163EntrySignature(normalizedEntry);
    return normalizedEntry;
  }

  function createMail163Snapshot(entries = []) {
    const idsToSignatures = new Map();
    const signatures = new Set();

    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const normalizedEntry = normalizeMail163Entry(entry, index);
      signatures.add(normalizedEntry.signature);
      if (normalizedEntry.id) {
        idsToSignatures.set(normalizedEntry.id, normalizedEntry.signature);
      }
    });

    return { idsToSignatures, signatures };
  }

  function snapshotHasMail163Entry(snapshot, entry) {
    if (!snapshot) return false;

    const normalizedEntry = normalizeMail163Entry(entry);
    if (normalizedEntry.id && snapshot.idsToSignatures instanceof Map && snapshot.idsToSignatures.has(normalizedEntry.id)) {
      return snapshot.idsToSignatures.get(normalizedEntry.id) === normalizedEntry.signature;
    }

    return snapshot.signatures instanceof Set
      ? snapshot.signatures.has(normalizedEntry.signature)
      : false;
  }

  function messageMatchesFilters(entry, filters = {}) {
    const senderFilters = (filters.senderFilters || []).map(normalizeText).filter(Boolean);
    const subjectFilters = (filters.subjectFilters || []).map(normalizeText).filter(Boolean);
    const sender = normalizeText(entry.sender);
    const subject = normalizeText(entry.subject);
    const combined = normalizeText([entry.subject, entry.sender, entry.ariaLabel].filter(Boolean).join(' '));

    const senderMatch = senderFilters.length === 0
      ? false
      : senderFilters.some((value) => sender.includes(value) || combined.includes(value));
    const subjectMatch = subjectFilters.length === 0
      ? false
      : subjectFilters.some((value) => subject.includes(value) || combined.includes(value));
    const matched = (senderFilters.length === 0 && subjectFilters.length === 0)
      ? true
      : (senderMatch || subjectMatch);

    return {
      matched: Boolean(matched && entry.code),
      senderMatch,
      subjectMatch,
      code: entry.code || null,
    };
  }

  function compareMail163Candidates(left, right) {
    if (left.existsInSnapshot !== right.existsInSnapshot) {
      return left.existsInSnapshot ? 1 : -1;
    }

    if (left.minuteTimestamp !== right.minuteTimestamp) {
      return right.minuteTimestamp - left.minuteTimestamp;
    }

    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return left.index - right.index;
  }

  function compareMail163EntriesByFreshness(left, right) {
    if (left.minuteTimestamp !== right.minuteTimestamp) {
      return right.minuteTimestamp - left.minuteTimestamp;
    }

    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return left.index - right.index;
  }

  function collectMail163CleanupEntries(entries, filters = {}) {
    return (Array.isArray(entries) ? entries : [])
      .map((entry, index) => normalizeMail163Entry(entry, index))
      .map((entry) => ({
        ...entry,
        ...messageMatchesFilters(entry, filters),
      }))
      .filter((entry) => entry.matched)
      .filter((entry) => Boolean(entry.code))
      .sort(compareMail163EntriesByFreshness);
  }

  function buildMail163SelectionPlan(entries, targetEntries = []) {
    const normalizedEntries = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => normalizeMail163Entry(entry, index))
      .map((entry) => ({
        ...entry,
        selected: Boolean(entry.selected),
      }));
    const targetSignatures = new Set(
      (Array.isArray(targetEntries) ? targetEntries : [])
        .map((entry, index) => normalizeMail163Entry(entry, index).signature)
        .filter(Boolean)
    );

    const toSelect = [];
    const toUnselect = [];
    let selectedTargetCount = 0;

    normalizedEntries.forEach((entry) => {
      const isTarget = targetSignatures.has(entry.signature);
      if (isTarget && entry.selected) {
        selectedTargetCount += 1;
      }
      if (isTarget && !entry.selected) {
        toSelect.push(entry);
      }
      if (!isTarget && entry.selected) {
        toUnselect.push(entry);
      }
    });

    return {
      targetCount: targetSignatures.size,
      selectedTargetCount,
      expectedSelectedCount: selectedTargetCount + toSelect.length,
      toSelect,
      toUnselect,
    };
  }

  function normalizeMail163PollAttempts(value, fallback = 7) {
    const normalizedFallback = Number.isFinite(Number(fallback))
      ? Math.max(1, Math.floor(Number(fallback)))
      : 7;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return normalizedFallback;
    }

    return Math.max(1, Math.floor(numeric));
  }

  function pickMail163VerificationEntry(entries, options = {}) {
    const excludedCodes = new Set((options.excludeCodes || []).filter(Boolean));
    const seenSignatures = new Set((options.seenSignatures || []).filter(Boolean));
    const snapshot = options.snapshot || createMail163Snapshot([]);
    const afterMinute = normalizeMinuteTimestamp(options.afterTimestamp);
    const allowSnapshotFallback = Boolean(options.allowSnapshotFallback);
    const allowTimeFallback = Boolean(options.allowTimeFallback);

    const candidates = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => normalizeMail163Entry(entry, index))
      .map((entry) => {
        const filterResult = messageMatchesFilters(entry, options);
        return {
          ...entry,
          ...filterResult,
          existsInSnapshot: snapshotHasMail163Entry(snapshot, entry),
        };
      })
      .filter((entry) => entry.matched)
      .filter((entry) => Boolean(entry.code))
      .filter((entry) => !excludedCodes.has(entry.code))
      .filter((entry) => !seenSignatures.has(entry.signature));

    const strictMatches = candidates
      .filter((entry) => {
        if (!allowSnapshotFallback && entry.existsInSnapshot) {
          return false;
        }

        if (!afterMinute) {
          return true;
        }

        if (entry.minuteTimestamp) {
          return entry.minuteTimestamp >= afterMinute;
        }

        return !entry.existsInSnapshot;
      })
      .sort(compareMail163Candidates);

    if (strictMatches[0]) {
      return {
        match: strictMatches[0],
        usedSnapshotFallback: Boolean(strictMatches[0].existsInSnapshot),
        usedTimeFallback: false,
      };
    }

    if (!allowTimeFallback) {
      return {
        match: null,
        usedSnapshotFallback: false,
        usedTimeFallback: false,
      };
    }

    const relaxedMatches = candidates
      .filter((entry) => allowSnapshotFallback || !entry.existsInSnapshot)
      .sort(compareMail163Candidates);

    if (!relaxedMatches[0]) {
      return {
        match: null,
        usedSnapshotFallback: false,
        usedTimeFallback: false,
      };
    }

    return {
      match: relaxedMatches[0],
      usedSnapshotFallback: Boolean(relaxedMatches[0].existsInSnapshot),
      usedTimeFallback: true,
    };
  }

  function updateRecentMail163Signatures(signatures, nextSignature, limit = DEFAULT_SIGNATURE_HISTORY_LIMIT) {
    const nextLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.floor(Number(limit)))
      : DEFAULT_SIGNATURE_HISTORY_LIMIT;
    const nextList = Array.isArray(signatures) ? signatures.filter(Boolean) : [];

    if (!nextSignature) {
      return nextList.slice(0, nextLimit);
    }

    return [nextSignature, ...nextList.filter((signature) => signature !== nextSignature)]
      .slice(0, nextLimit);
  }

  return {
    buildMail163SelectionPlan,
    buildMail163EntrySignature,
    collectMail163CleanupEntries,
    createMail163Snapshot,
    extractVerificationCode,
    messageMatchesFilters,
    normalizeMail163Entry,
    normalizeMail163PollAttempts,
    normalizeMinuteTimestamp,
    normalizeText,
    normalizeTimestamp,
    parseMail163Timestamp,
    pickMail163VerificationEntry,
    snapshotHasMail163Entry,
    updateRecentMail163Signatures,
  };
});
