(function attachPayPalUtils(root, factory) {
  root.PayPalUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createPayPalUtils() {
  function normalizePayPalAccount(account = {}) {
    const normalizedEmail = String(account.email || '').trim().toLowerCase();
    const now = Date.now();
    return {
      id: String(account.id || crypto.randomUUID()),
      email: normalizedEmail,
      password: String(account.password || ''),
      createdAt: Number.isFinite(Number(account.createdAt)) ? Number(account.createdAt) : now,
      updatedAt: Number.isFinite(Number(account.updatedAt)) ? Number(account.updatedAt) : now,
      lastUsedAt: Number.isFinite(Number(account.lastUsedAt)) ? Number(account.lastUsedAt) : 0,
    };
  }

  function normalizePayPalAccounts(accounts) {
    if (!Array.isArray(accounts)) return [];

    const deduped = new Map();
    for (const account of accounts) {
      const normalized = normalizePayPalAccount(account);
      if (!normalized.email) continue;
      deduped.set(normalized.id, normalized);
    }
    return [...deduped.values()];
  }

  function findPayPalAccount(accounts = [], accountId = '') {
    const normalizedId = String(accountId || '').trim();
    if (!normalizedId) return null;
    return normalizePayPalAccounts(accounts).find((account) => account.id === normalizedId) || null;
  }

  function upsertPayPalAccountInList(accounts = [], nextAccount = null) {
    if (!nextAccount) {
      return normalizePayPalAccounts(accounts);
    }

    const normalizedNext = normalizePayPalAccount(nextAccount);
    const list = normalizePayPalAccounts(accounts);
    const existingIndex = list.findIndex((account) => account.id === normalizedNext.id);
    if (existingIndex >= 0) {
      list[existingIndex] = normalizedNext;
      return list;
    }
    return [...list, normalizedNext];
  }

  return {
    findPayPalAccount,
    normalizePayPalAccount,
    normalizePayPalAccounts,
    upsertPayPalAccountInList,
  };
});
