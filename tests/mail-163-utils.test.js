const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMail163SelectionPlan,
  buildMail163EntrySignature,
  collectMail163CleanupEntries,
  createMail163Snapshot,
  normalizeMail163PollAttempts,
  normalizeMinuteTimestamp,
  parseMail163Timestamp,
  pickMail163VerificationEntry,
  updateRecentMail163Signatures,
} = require('../mail-163-utils.js');

test('parseMail163Timestamp parses full date and same-day time labels', () => {
  assert.equal(
    parseMail163Timestamp('2026年4月10日 18:05'),
    new Date(2026, 3, 10, 18, 5, 0, 0).getTime()
  );

  const now = new Date(2026, 3, 10, 23, 59, 0, 0);
  assert.equal(
    parseMail163Timestamp('09:41', now),
    new Date(2026, 3, 10, 9, 41, 0, 0).getTime()
  );
});

test('pickMail163VerificationEntry treats changed content on the same row id as a new mail', () => {
  const before = {
    id: 'row-1',
    sender: 'OpenAI',
    subject: 'ChatGPT verification code 111111',
    ariaLabel: 'OpenAI verification 111111',
    timestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
  };
  const after = {
    id: 'row-1',
    sender: 'OpenAI',
    subject: 'ChatGPT verification code 222222',
    ariaLabel: 'OpenAI verification 222222',
    timestamp: Date.UTC(2026, 3, 10, 10, 2, 0),
  };

  const result = pickMail163VerificationEntry([after], {
    afterTimestamp: Date.UTC(2026, 3, 10, 10, 1, 0),
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    snapshot: createMail163Snapshot([before]),
  });

  assert.equal(result.match.id, 'row-1');
  assert.equal(result.match.code, '222222');
  assert.equal(result.usedSnapshotFallback, false);
  assert.equal(result.usedTimeFallback, false);
});

test('pickMail163VerificationEntry can recover delayed new mail by ignoring the time window after fallback', () => {
  const delayedMail = {
    id: 'row-delayed',
    sender: 'OpenAI',
    subject: 'ChatGPT verification code 141735',
    ariaLabel: 'OpenAI verification 141735',
    timestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
  };

  const result = pickMail163VerificationEntry([delayedMail], {
    afterTimestamp: Date.UTC(2026, 3, 10, 10, 5, 0),
    allowTimeFallback: true,
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    snapshot: createMail163Snapshot([]),
  });

  assert.equal(result.match.id, 'row-delayed');
  assert.equal(result.match.code, '141735');
  assert.equal(result.usedSnapshotFallback, false);
  assert.equal(result.usedTimeFallback, true);
});

test('pickMail163VerificationEntry tracks processed mails by signature instead of only by code', () => {
  const oldMail = {
    id: 'row-old',
    sender: 'OpenAI',
    subject: 'ChatGPT verification code 333333',
    ariaLabel: 'OpenAI verification 333333',
    timestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
  };
  const newMail = {
    id: 'row-new',
    sender: 'OpenAI',
    subject: 'ChatGPT verification code 333333',
    ariaLabel: 'OpenAI verification 333333 latest',
    timestamp: Date.UTC(2026, 3, 10, 10, 8, 0),
  };

  const result = pickMail163VerificationEntry([newMail], {
    afterTimestamp: normalizeMinuteTimestamp(Date.UTC(2026, 3, 10, 10, 5, 0)),
    seenSignatures: [buildMail163EntrySignature(oldMail)],
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    snapshot: createMail163Snapshot([]),
  });

  assert.equal(result.match.id, 'row-new');
  assert.equal(result.match.code, '333333');
});

test('collectMail163CleanupEntries returns all matched mails including older ones for bulk deletion', () => {
  const entries = [
    {
      id: 'old-mail',
      sender: 'noreply_at_tm.openai.com_nimbly-army-cloak@duck.com',
      subject: 'Your ChatGPT code is 111111',
      ariaLabel: 'OpenAI old verification 111111',
      timestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
    },
    {
      id: 'new-mail',
      sender: 'otp_at_tm1.openai.com_crib-embark-tiara@duck.com',
      subject: 'Your OpenAI code is 222222',
      ariaLabel: 'OpenAI latest verification 222222',
      timestamp: Date.UTC(2026, 3, 10, 10, 8, 0),
    },
    {
      id: 'ignore-mail',
      sender: 'alerts@example.com',
      subject: 'Welcome message',
      ariaLabel: 'welcome',
      timestamp: Date.UTC(2026, 3, 10, 10, 9, 0),
    },
  ];

  const result = collectMail163CleanupEntries(entries, {
    senderFilters: ['openai', 'noreply', 'otp'],
    subjectFilters: ['chatgpt', 'openai', 'code', 'otp'],
  });

  assert.deepEqual(result.map((item) => item.id), ['new-mail', 'old-mail']);
});

test('buildMail163SelectionPlan clears unrelated selected mails before selecting current cleanup candidates', () => {
  const entries = [
    {
      id: 'stale-selected',
      sender: 'alerts@example.com',
      subject: 'Welcome message',
      ariaLabel: 'welcome',
      timestamp: Date.UTC(2026, 3, 10, 10, 9, 0),
      selected: true,
    },
    {
      id: 'cleanup-target-a',
      sender: 'noreply_at_tm.openai.com_nimbly-army-cloak@duck.com',
      subject: 'Your ChatGPT code is 111111',
      ariaLabel: 'OpenAI old verification 111111',
      timestamp: Date.UTC(2026, 3, 10, 10, 0, 0),
      selected: false,
    },
    {
      id: 'cleanup-target-b',
      sender: 'otp_at_tm1.openai.com_crib-embark-tiara@duck.com',
      subject: 'Your OpenAI code is 222222',
      ariaLabel: 'OpenAI latest verification 222222',
      timestamp: Date.UTC(2026, 3, 10, 10, 8, 0),
      selected: true,
    },
  ];

  const candidates = collectMail163CleanupEntries(entries, {
    senderFilters: ['openai', 'noreply', 'otp'],
    subjectFilters: ['chatgpt', 'openai', 'code', 'otp'],
  });
  const selectionPlan = buildMail163SelectionPlan(entries, candidates);

  assert.equal(selectionPlan.targetCount, 2);
  assert.equal(selectionPlan.selectedTargetCount, 1);
  assert.equal(selectionPlan.expectedSelectedCount, 2);
  assert.deepEqual(selectionPlan.toUnselect.map((item) => item.id), ['stale-selected']);
  assert.deepEqual(selectionPlan.toSelect.map((item) => item.id), ['cleanup-target-a']);
});

test('normalizeMail163PollAttempts honors configured values below seven', () => {
  assert.equal(normalizeMail163PollAttempts(undefined), 7);
  assert.equal(normalizeMail163PollAttempts(3), 3);
  assert.equal(normalizeMail163PollAttempts(0), 1);
});

test('updateRecentMail163Signatures dedupes history and enforces the limit', () => {
  const result = updateRecentMail163Signatures(['sig-a', 'sig-b', 'sig-a'], 'sig-c', 3);
  assert.deepEqual(result, ['sig-c', 'sig-a', 'sig-b']);

  const replaced = updateRecentMail163Signatures(result, 'sig-b', 2);
  assert.deepEqual(replaced, ['sig-b', 'sig-c']);
});
