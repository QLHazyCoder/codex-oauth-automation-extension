# Native Host Migration Probe

**Goal:** Probe the current `codex-oauth-automation-extension` codebase for a Chrome Native Messaging migration path, identify the exact touchpoints, and outline the safest staged rollout from the current localhost helper model.

**Architecture snapshot:** The extension currently talks to a local Python helper over HTTP at `http://127.0.0.1:17373`. The helper is a long-lived `ThreadingHTTPServer` process that exposes `/messages`, `/code`, `/sync-account-run-records`, `/append-account-log`, and `/icloud/create-hide-my-email`. The extension has no Native Messaging capability in `manifest.json` yet.

**Recommendation:** Do not replace the existing localhost helper in one shot. First add a Native Messaging transport shim for the same helper capabilities, then migrate iCloud local generation and mailbox/account-history calls behind a shared background bridge with HTTP fallback during the transition.

---

## Grounded Facts

1. `manifest.json` currently has no `nativeMessaging`, `connectNative`, or `sendNativeMessage` surface.
2. `background.js` centralizes helper URL construction via `buildHotmailLocalEndpoint(baseUrl, path)` and currently issues localhost `fetch()` calls for:
   - `/messages`
   - `/code`
   - `/icloud/create-hide-my-email`
3. `background/account-run-history.js` also depends on the same local helper shape for `/sync-account-run-records`.
4. `scripts/hotmail_helper.py` is currently an HTTP server process, not a stdio Native Messaging host.
5. The helper logic is still reusable for a native host because the business functions are imported/executed under a normal `if __name__ == "__main__": main()` guard.

---

## Current Code Touchpoints

### Extension-side touchpoints

- `manifest.json`
  - add Native Messaging permission/capability for the target Chromium runtime
- `background.js`
  - helper base URL defaults and normalization
  - `buildHotmailLocalEndpoint()`
  - mailbox helper calls (`/messages`, `/code`)
  - iCloud local generation call (`/icloud/create-hide-my-email`)
- `background/generated-email-helpers.js`
  - generator routing for `icloud` / `local-macos`
- `background/account-run-history.js`
  - local helper sync path for account history files
- `sidepanel/sidepanel.js` / `sidepanel/sidepanel.html`
  - currently expose helper URL / local mode configuration only; likely need status messaging rather than direct Native Host controls

### Helper-side touchpoints

- `scripts/hotmail_helper.py`
  - contains the actual business handlers already worth reusing
  - currently exposes HTTP routes only
- helper start scripts
  - `start-hotmail-helper.command`
  - `start-hotmail-helper.bat`
- `README.md`
  - documents manual helper startup and localhost assumptions

### Test/documentation touchpoints

- helper-related tests under `tests/`
- architecture docs and rollout docs under `docs/`

---

## Key Migration Constraint

Native Messaging is **not** a drop-in transport swap for the current helper process.

Today the helper is a server that binds `127.0.0.1:17373` and waits for HTTP requests. A Native Messaging host must instead:

- start on demand from the browser
- read length-prefixed JSON messages from stdin
- write length-prefixed JSON replies to stdout
- exit cleanly when idle / when the port is closed

So the current Python file cannot simply be “registered as-is” without an adapter.

---

## Safest Migration Shape

### Phase 1 — add a Native Host shim, keep existing HTTP helper intact

Create a separate native host entrypoint, for example:

- `scripts/native_host.py`

Responsibilities:

- read Native Messaging requests from stdin
- dispatch to existing helper business functions already implemented in `scripts/hotmail_helper.py`
- serialize replies/errors back to stdout
- avoid starting `ThreadingHTTPServer`

Why this is safest:

- preserves current localhost helper behavior for existing users
- avoids large refactors inside the already-working HTTP helper
- lets the extension migrate call-by-call behind a bridge layer

### Phase 2 — add a background transport bridge in the extension

Introduce a single background-owned helper transport abstraction, for example:

- `invokeLocalCompanion({ action, payload, transportPreference })`

The bridge should:

1. try Native Messaging when enabled/available
2. optionally fall back to HTTP localhost during migration
3. normalize all response/error shapes for callers

This keeps the rest of the extension from caring whether a reply came from HTTP or Native Messaging.

### Phase 3 — migrate the highest-value paths first

Recommended order:

1. `iCloud local-macos` generation (`/icloud/create-hide-my-email`)
2. mailbox polling (`/messages`, `/code`)
3. account run history sync (`/sync-account-run-records`, `/append-account-log`)

Reason:

- iCloud local generation is the user-visible pain point that motivated the lifecycle discussion
- mailbox/account-history paths already work with localhost and can follow after the transport abstraction is proven

### Phase 4 — add installer/registration tooling

Needed artifacts:

- native host manifest template(s)
- macOS install/uninstall script
- host registration path docs
- version compatibility check between extension and host

Without this, the transport code can compile but the browser still will not be able to launch the host.

---

## Concrete File-Level Work Plan

### Task 1: Introduce a transport bridge in background

**Files:**
- Modify: `background.js`
- Modify: `background/generated-email-helpers.js`
- Modify: `background/account-run-history.js`
- Add: `background/native-host-client.js` (preferred) or equivalent helper module

**Goal:** Move all helper invocations behind one background-owned API.

### Task 2: Add a Python Native Host shim

**Files:**
- Add: `scripts/native_host.py`
- Optionally modify: `scripts/hotmail_helper.py` (only to extract reusable pure helpers if required)

**Goal:** Reuse current business functions without binding an HTTP server.

### Task 3: Register the host with the browser

**Files:**
- Modify: `manifest.json`
- Add: browser native host manifest(s)
- Add: install/uninstall scripts/docs

**Goal:** Make the browser capable of launching the host on demand.

### Task 4: Migrate the iCloud local path first

**Files:**
- Modify: `background.js`
- Modify: `background/generated-email-helpers.js`
- Modify: `README.md`
- Modify: related tests in `tests/`

**Goal:** Prove the new bridge on the most important path before touching all helper consumers.

### Task 5: Migrate mailbox/account-history consumers

**Files:**
- Modify: `background.js`
- Modify: `background/account-run-history.js`
- Modify: tests and docs

**Goal:** Bring the remaining localhost helper endpoints behind the same bridge.

---

## Risks to Call Out Early

1. **Shared-file overlap risk**
   - `background.js`, `README.md`, helper scripts, and sidepanel files are already the exact files involved in recent helper lifecycle work; avoid parallel blind edits.
2. **Registration/distribution risk**
   - Native Messaging is only as good as install + registration reliability.
3. **Protocol drift risk**
   - If HTTP and Native Messaging responses diverge, extension callers will accumulate transport-specific branches.
4. **One-shot rewrite risk**
   - Replacing the HTTP helper outright would combine transport change, install change, and feature regression risk in one step.

---

## Verification Checklist for the Migration Work

### Bridge-level verification

- Native Messaging host call succeeds when the host is installed
- structured errors distinguish “host missing”, “host timeout”, and “business failure”
- HTTP fallback still works when explicitly enabled during migration

### iCloud verification

- first local iCloud generation works without a prestarted localhost server
- Apple ID password flow still surfaces actionable errors
- success path still writes the generated alias back into extension state

### Mailbox/account-history verification

- mailbox fetch/code fetch still return the same normalized payload shape
- account history sync still writes the expected file outputs

### Rollout verification

- fresh install path works on macOS
- uninstall/rollback returns the extension to the documented localhost/manual mode

---

## Bottom Line

The repo is structurally ready for a staged Native Messaging migration, but **not** for a safe one-shot swap. The cleanest path is:

1. add a Native Host shim around existing Python helper logic,
2. add one background transport bridge,
3. migrate the iCloud local path first,
4. then move mailbox/account-history traffic,
5. and only later consider retiring localhost mode.
