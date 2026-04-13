# Hotmail OAuth Mail Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hotmail account pool with Microsoft OAuth authorization and Microsoft Graph mail polling, then wire it into the existing automation flow as a new mail provider.

**Architecture:** Keep the existing 1~9 step orchestrator in `background.js`, add a new `hotmail-api` provider path, and extend the side panel to manage Hotmail accounts. Preserve QQ, 163, and Inbucket behavior while introducing account allocation, token management, and Graph-based verification-code retrieval.

**Tech Stack:** Chrome Extension MV3, plain JavaScript, `chrome.identity.launchWebAuthFlow`, `fetch`, `chrome.storage.local`, `chrome.storage.session`

---

### Task 1: Extend State Model for Hotmail Accounts

**Files:**
- Modify: `background.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

Document the expected account shape and provider behavior in code comments or development notes before implementation:

```js
// Expected local storage shape:
// hotmailAccounts: [{ id, email, password, clientId, accessToken, refreshToken, expiresAt, status, lastUsedAt, lastAuthAt, lastError }]
// mailProvider accepts 'hotmail-api'
```

- [ ] **Step 2: Run test to verify it fails**

Run a manual smoke check by loading the current extension and confirming there is no `hotmail-api` provider and no persisted Hotmail account state.

Expected: The provider does not exist yet and account state is absent.

- [ ] **Step 3: Write minimal implementation**

Add new persisted keys and runtime state helpers in `background.js`:

- `hotmailAccounts`
- `currentHotmailAccountId`
- helper functions to read, write, upsert, delete, and mark account status

- [ ] **Step 4: Run test to verify it passes**

Reload the extension and confirm Hotmail account state can be read and written through background message handlers.

- [ ] **Step 5: Commit**

```bash
git add background.js README.md
git commit -m "feat: add hotmail account state model"
```

### Task 2: Add Hotmail Account Pool UI

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Write the failing test**

Describe the expected UI state:

- provider selector includes `hotmail-api`
- Hotmail account section renders a list
- user can add, authorize, test, and delete accounts

- [ ] **Step 2: Run test to verify it fails**

Reload the current extension.

Expected: No Hotmail provider option and no account section.

- [ ] **Step 3: Write minimal implementation**

Add:

- a new provider option
- a Hotmail accounts management section
- side panel event handlers for add, authorize, test, delete, and select current account status

- [ ] **Step 4: Run test to verify it passes**

Reload the extension and verify:

- the new provider is visible
- the section appears only when selected
- account rows render correctly from stored state

- [ ] **Step 5: Commit**

```bash
git add sidepanel/sidepanel.html sidepanel/sidepanel.css sidepanel/sidepanel.js
git commit -m "feat: add hotmail account pool panel"
```

### Task 3: Implement Microsoft OAuth Authorization

**Files:**
- Modify: `background.js`
- Modify: `manifest.json`

- [ ] **Step 1: Write the failing test**

Define the expected authorization flow in a focused helper-oriented checklist:

- PKCE code verifier/challenge can be created
- auth URL includes client ID, redirect URI, state, scope, and challenge
- callback code is parsed and validated
- token response updates the account record

- [ ] **Step 2: Run test to verify it fails**

Trigger the new `Authorize` action from the side panel.

Expected: The action is not implemented yet and fails.

- [ ] **Step 3: Write minimal implementation**

Add background handlers and helpers for:

- PKCE generation
- OAuth URL creation
- `chrome.identity.getRedirectURL()`
- `chrome.identity.launchWebAuthFlow`
- code exchange via Microsoft token endpoint
- account token persistence and error reporting

- [ ] **Step 4: Run test to verify it passes**

Manually authorize a Hotmail account and confirm:

- the login flow opens
- tokens are saved to the target account
- account status becomes `authorized`

- [ ] **Step 5: Commit**

```bash
git add background.js manifest.json
git commit -m "feat: add microsoft oauth authorization"
```

### Task 4: Implement Token Refresh and Graph Mail Polling

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Write the failing test**

Define the expected helper behavior:

- expired access token refreshes with `refresh_token`
- Graph mail fetch returns recent inbox messages
- filtering returns the newest matching verification code after the requested timestamp

- [ ] **Step 2: Run test to verify it fails**

Use the side panel `Test Mail Access` action before implementing the Graph path.

Expected: The action fails because Graph mail polling does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add helpers in `background.js` for:

- token freshness check
- refresh-token grant request
- Graph inbox fetch
- mail filtering
- verification code extraction

- [ ] **Step 4: Run test to verify it passes**

Authorize a Hotmail account and verify the test action can fetch mailbox data and surface a success or meaningful “no matching mail” response.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: add graph mail polling"
```

### Task 5: Wire Hotmail Provider into Step 3, Step 4, Step 7, and Auto Run

**Files:**
- Modify: `background.js`
- Modify: `sidepanel/sidepanel.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

Define the expected run behavior:

- Auto mode chooses a fresh authorized Hotmail account for each new run
- Step 3 uses the selected account email and password
- Step 4 and Step 7 read verification mail through Graph instead of mailbox tabs

- [ ] **Step 2: Run test to verify it fails**

Select `hotmail-api` and run a manual or auto flow.

Expected: The flow cannot yet allocate an account or fetch verification codes from Graph.

- [ ] **Step 3: Write minimal implementation**

Update:

- provider branching in `getMailConfig()` or a replacement provider resolver
- account allocation at fresh run start
- Step 3 account-backed credentials
- Step 4 and Step 7 Graph polling path
- auto-run preconditions for Hotmail accounts

- [ ] **Step 4: Run test to verify it passes**

Run:

1. manual Step 3 + Step 4 on a selected account
2. manual Step 6 + Step 7 on the same account
3. one full Auto run with `hotmail-api`

Expected: no mailbox tab is opened for Hotmail, and verification codes come from Graph.

- [ ] **Step 5: Commit**

```bash
git add background.js sidepanel/sidepanel.js README.md
git commit -m "feat: integrate hotmail api provider into automation flow"
```

### Task 6: Regression Verification and Cleanup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

List the required regression checks:

- QQ provider still opens QQ mail tab
- 163 provider still opens 163 mail tab
- Inbucket provider still opens mailbox page
- Hotmail provider uses API path only

- [ ] **Step 2: Run test to verify it fails**

Manually inspect pre-change behavior expectations against the new code before cleanup.

Expected: Any missing provider branch or broken selector is identified.

- [ ] **Step 3: Write minimal implementation**

Clean up labels, update README usage instructions, and ensure all branches show accurate UI copy.

- [ ] **Step 4: Run test to verify it passes**

Reload the extension and perform:

- provider switch smoke test
- account add/delete smoke test
- one OAuth authorization smoke test
- one mail access smoke test

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document hotmail oauth mail provider"
```
