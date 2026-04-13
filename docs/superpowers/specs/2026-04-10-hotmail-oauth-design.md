# Hotmail OAuth + Graph Mail Design

## Goal

Replace the existing DuckDuckGo plus webmail polling flow with a Hotmail account pool that:

- authorizes each Hotmail account inside the extension via Microsoft OAuth
- stores per-account tokens locally
- selects a fresh account for each automated run
- fetches verification emails through Microsoft Graph instead of mailbox page DOM polling

The existing 1~9 step flow should remain intact wherever possible. The new work should be isolated to account selection, authorization, and email retrieval.

## Existing Constraints

- The project is a Manifest V3 Chrome extension with no build step.
- Runtime orchestration lives in `background.js`.
- The side panel is plain HTML/CSS/JS.
- Step 4 and Step 7 currently depend on provider-specific content scripts for QQ, 163, and Inbucket mailbox polling.
- Auto mode already supports retries, pauses, and restoring session state.

## Design Summary

The new Hotmail path introduces three focused subsystems:

1. `hotmail-account-pool`
   Maintains a reusable list of Hotmail accounts and their OAuth credentials.
2. `microsoft-oauth`
   Handles Microsoft authorization code flow with PKCE through `chrome.identity.launchWebAuthFlow`.
3. `hotmail-graph-mail`
   Reads inbox messages from Microsoft Graph and extracts verification codes for Step 4 and Step 7.

The main flow continues to use the existing step state machine in `background.js`.

## Architecture

### 1. Account Pool

Persist a new `hotmailAccounts` array in `chrome.storage.local`.

Each account record stores:

- `id`
- `email`
- `password`
- `clientId`
- `accessToken`
- `refreshToken`
- `expiresAt`
- `status`
- `lastUsedAt`
- `lastAuthAt`
- `lastError`

The current run stores `currentHotmailAccountId` in `chrome.storage.session`.

When `mailProvider = hotmail-api`, Auto mode must allocate one account at the start of a fresh run, write its email into the existing `email` runtime field, and reuse the same account through Step 3, Step 4, Step 6, and Step 7.

### 2. OAuth Flow

Each account is authorized separately from the side panel.

Flow:

1. User clicks `Authorize` on an account row.
2. Background generates PKCE verifier/challenge and a random `state`.
3. Background launches Microsoft sign-in via `chrome.identity.launchWebAuthFlow`.
4. Microsoft redirects back to the extension redirect URL.
5. Background validates `state`, exchanges `code` for tokens, and updates the account record.

The extension requests delegated scopes only:

- `openid`
- `profile`
- `offline_access`
- `https://graph.microsoft.com/Mail.Read`
- `https://graph.microsoft.com/User.Read`

The design assumes one shared `clientId` across accounts is valid, while `refreshToken` remains per account.

### 3. Graph Mail Retrieval

Hotmail mail retrieval runs inside background logic and does not require a mail tab or content script.

The provider performs:

1. Resolve the current Hotmail account from session state.
2. Refresh the token if missing or near expiry.
3. Call Microsoft Graph to fetch recent inbox messages.
4. Filter by sender, subject, and time window.
5. Extract a 6-digit verification code from message metadata or preview/body.
6. Return the code to the existing Step 4 or Step 7 submission flow.

The first iteration should prefer stable fields such as:

- `from.emailAddress.address`
- `subject`
- `receivedDateTime`
- `bodyPreview`

Full HTML body parsing is explicitly deferred unless needed.

## Integration with Existing Steps

### Step 3

Step 3 keeps filling the OpenAI page in the same way, but when `mailProvider = hotmail-api`, the email comes from the selected account pool entry instead of the manual email box or Duck address.

### Step 4 and Step 7

The existing retry and resend behavior stays in place, but the provider path changes:

- old providers: `qq`, `163`, `inbucket`
- new provider: `hotmail-api`

The orchestration layer should branch before opening any mailbox tab. For `hotmail-api`, it calls a background helper instead of `sendToMailContentScriptResilient`.

### Auto Run

Auto run changes:

- remove the Duck auto-fetch dependency when `hotmail-api` is selected
- allocate a fresh Hotmail account at the start of a new run
- fail early if no authorized account is available
- preserve the existing retry and skip-failure semantics

## Side Panel Changes

The current single email entry remains for backward compatibility, but a new account-pool section is added when `hotmail-api` is selected.

New UI capabilities:

- list Hotmail accounts
- add an account
- delete an account
- authorize an account
- test mail access for an account
- show status and last error

The existing provider selector gains a `hotmail-api` option.

## Error Handling

The new path must surface actionable errors:

- no Hotmail account available
- missing `clientId`
- OAuth denied or cancelled
- token exchange failed
- refresh token invalid
- Graph mail read failed
- no matching verification mail found in the time window

Account-level failures should update the account record `status` and `lastError` without corrupting unrelated accounts.

## Security and Storage Tradeoffs

- Tokens and account passwords are stored in `chrome.storage.local` for operator convenience.
- This is acceptable for the current operator-managed extension model, but it increases the trust requirement of the local browser profile.
- No secret should be hard-coded in the repository.

## Testing Strategy

Because the project has no automated test harness today, implementation should carve out pure helper functions where possible and validate them with focused runtime checks.

The minimum verification surface:

- account selection logic
- PKCE helper generation
- OAuth callback parsing and state validation
- token refresh request/response handling
- Graph message filtering and code extraction
- Step 4 and Step 7 provider branch behavior
- Auto run allocation of a fresh account per run

## Deferred Work

The first version intentionally excludes:

- bulk import/export UX
- bulk authorize all accounts
- advanced HTML message parsing
- mailbox delete/move/archive behavior
- background local service or server proxy
- removal of existing QQ/163/Inbucket support

## Implementation Boundary

Modify only the minimum set of files needed to add the new provider while keeping current providers operational:

- `manifest.json`
- `background.js`
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.css`
- `sidepanel/sidepanel.js`

If helper extraction becomes necessary, prefer adding small new files under `content/` or the repo root only if they clearly reduce complexity in `background.js`.
