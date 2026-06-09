# Bulk Delete for Slack — Design Spec

> A free, local-only Manifest V3 Chrome extension that bulk-deletes a user's own
> messages from a Slack DM, group DM, or channel, directly in the browser. No
> backend, no accounts, no data collection. Modeled on the "/clean for Slack"
> extension, scoped to a lean MVP for the first release.

- **Date:** 2026-06-09
- **Status:** Approved design → ready for implementation planning
- **Project dir:** `d:\slack-dm-cleaner`

## 1. Product

**Store title (manifest `name`):** `Free Bulk Delete for Slack — Messages, DMs & Group Chats`
**Toolbar `short_name`:** `BulkDelete`

> "Free" leads the title both because it's accurate (no payment, no backend) and because
> it's a high-intent search keyword; "Bulk Delete" + "Slack" stay near the front for the
> primary target queries.

**Single purpose:** Let a logged-in Slack user bulk-delete their own messages in the
currently-open conversation, with an optional date-range filter, safely and locally
in their browser.

### Monetization

Free. No license keys, no payment, **no backend of any kind**. (Licensing/freemium
can be layered on later; explicitly out of scope now.)

### Target & distribution

- Runs on the Slack **web app** at `https://app.slack.com/*` (and `https://*.slack.com/*`
  for API calls). The Slack **desktop app is Electron and unreachable by extensions** —
  out of scope.
- Distributed via the **Chrome Web Store**.

## 2. Scope (v1 — Lean MVP)

**In scope:**
- Operate on the **currently-open conversation** (DM / group DM / channel) — read from
  the page; no conversation picker.
- Delete **only the user's own messages** (Slack also enforces this for non-admins).
- Optional **date-range filter** (before / after).
- **Scan/preview** count before any deletion.
- **Rate-limit-safe** sequential deletion with adaptive backoff.
- Live **progress** + a prominent **Stop** button that halts mid-run and shows a summary.
- Remember last-used filters (`storage`).

**Out of scope (YAGNI for v1):**
- Deleting other people's messages / admin "delete all".
- Filters by reaction, starred, pinned, or specific user.
- Multi-conversation batch, scheduling.
- Licensing / payments.
- Slack desktop (Electron), Firefox/Edge ports.

## 3. Architecture

Manifest V3 extension, three small parts:

1. **Content script** (`app.slack.com`) — the heart. Captures the token, runs the Slack
   API client + delete loop, and renders the UI. Everything co-located → minimal
   message-passing.
2. **Service worker** (background) — tiny: on toolbar-icon click, send `TOGGLE_PANEL`
   to the active tab's content script. Nothing else (MV3 workers are killed after ~30s
   idle, so **no long-running work lives here**).
3. **Injected panel** — a polished drawer rendered inside a **Shadow DOM** (Slack's CSS
   can't leak in or out), mounted by the content script.

No remote code, no external network calls except to Slack itself.

### Why this shape

The long delete loop (minutes for thousands of messages) must live somewhere that
survives: the **content script** lives as long as the Slack tab is open, has same-origin
access to Slack's cookies, and can read the page's `localStorage` token. Keeping the UI
in the same context means progress and Stop are wired directly to the loop with no
cross-context state sync.

## 4. Deletion engine

### 4.1 Token & context capture (`src/lib/slackToken.ts`)

- Read the active workspace's `xoxc-…` token and the current user ID from the page's
  `localStorage` (`localConfig_v2`) and/or Slack boot data. Content scripts can read the
  page's origin-scoped `localStorage`.
- Determine the **active conversation ID** (channel `C…` / DM `D…` / group `G…`) and the
  correct **API base** from the URL / boot data at runtime.
- Defensive parsing: if the token shape/location changes, fail with a clear message
  rather than a crash.

### 4.2 Authenticated API client (`src/lib/slackApi.ts`)

- Issues `fetch` calls to Slack's internal web API **same-origin**, so the browser
  auto-attaches the `d` session cookie — **no `cookies` permission required.**
- Methods used:
  - `conversations.history` — cursor pagination (limit up to 1000), `oldest`/`latest`
    bounds for date filtering.
  - `conversations.replies` — to enumerate thread replies so they aren't left behind.
  - `chat.delete { channel, ts }` — the delete call (Slack Tier-3, ~50/min).
- Normalizes Slack responses (`ok` / `error`) and HTTP 429 into typed results.

### 4.3 Rate limiter (`src/lib/rateLimiter.ts`)

- Token-bucket / fixed-interval throttle targeting ~1 delete/sec (≈ Tier-3 50/min).
- On HTTP 429 or `ratelimited`: exponential backoff honoring the `Retry-After` header,
  then resume.
- Sequential (concurrency 1) for safety and predictable progress.

### 4.4 Cleaner orchestrator (`src/lib/cleaner.ts`)

- **Enumerate:** page through `conversations.history`; for messages with replies, walk
  `conversations.replies`. Collect candidate `ts` values.
- **Filter:** keep only `message.user === currentUserId`; apply optional date range.
- **Scan result:** return the matched count + list (drives the preview).
- **Delete loop:** iterate matched `ts`, call `chat.delete` through the rate limiter,
  emit progress events (`{deleted, skipped, total, currentRate, elapsed}`).
- **Stop:** a `stopRequested` flag + `AbortController` checked every iteration; in-flight
  request settles, partial progress is preserved, summary emitted.

## 5. UI (Shadow-DOM panel, `src/content/panel/`)

Right-side drawer, modern/rounded, single accent color, clear state machine:

- **Header** — extension name + current conversation + close (×).
- **Target line** — e.g. "Cleaning: #general" / "DM with Jane".
- **Filters** — "Only my messages" (the v1 scope) + optional **Before / After** date pickers.
- **Scan** button → "Found **N** of your messages".
- **Safety confirm** — checkbox *"I understand this permanently deletes messages"*,
  required before the first delete (deletion is irreversible).
- **Run state** — progress bar, "Deleted X / N", live rate, elapsed, big red **Stop**.
- **Summary** — "Deleted X · Skipped Y (couldn't delete) · Stopped/Done".

States: `idle → scanning → preview → confirm → running → (stopped | done)`, plus an
`error` state with a friendly message and a retry where sensible.

## 6. Components / file layout

Built with **Vite + TypeScript + Preact** (tiny runtime, clean components, simple build;
the **CRXJS** Vite plugin handles the MV3 manifest + dev reload).

```
manifest.json
src/
  background/service-worker.ts   # toolbar click -> TOGGLE_PANEL message
  content/index.ts               # mount/toggle Shadow-DOM panel, wire orchestrator
  content/panel/                 # Preact UI components + scoped styles
  lib/slackToken.ts              # token + user + active-conversation discovery
  lib/slackApi.ts                # authenticated API client
  lib/rateLimiter.ts             # token-bucket + backoff
  lib/cleaner.ts                 # enumerate + filter + delete loop (AbortController, events)
  lib/types.ts
```

Each `lib/*` module has one purpose and a small typed interface, testable in isolation
with a mocked `fetch`.

## 7. Error handling

Friendly, specific messaging for:

- **Not logged in / token not found** → "Open and log into Slack first."
- **Not on a conversation** → "Open a DM, group, or channel first."
- **`ratelimited` / HTTP 429** → backoff + retry (honor `Retry-After`); keep going.
- **`message_not_found`** → skip (already gone), count as skipped.
- **`cant_delete_message` / `compliance_exports_enabled`** → skip + count + note that
  workspace policy blocked it.
- **`invalid_auth` / `token_revoked`** → stop, ask the user to reload Slack.
- **Network errors** → bounded retry, then skip + log.

## 8. Permissions (minimal, for clean CWS review)

```jsonc
{
  "manifest_version": 3,
  "host_permissions": ["https://*.slack.com/*"],
  "permissions": ["scripting", "activeTab", "storage"],
  "action": { /* toolbar icon */ },
  "content_scripts": [{ "matches": ["https://app.slack.com/*"], "js": ["..."] }]
}
```

**No `cookies`, no remote hosts, no `<all_urls>`, no remote code.** `storage` only
remembers last-used filters.

## 9. Testing

TDD with **Vitest** + mocked `fetch`:

- Rate-limiter interval/backoff timing (fake timers).
- Cleaner filtering: mine-vs-others, date bounds inclusive/exclusive.
- Pagination/cursor handling across multiple `conversations.history` pages.
- Thread traversal via `conversations.replies`.
- Stop/abort: loop halts promptly, progress preserved, summary correct.
- API client: response/error normalization, 429 handling.

**De-risking spike (FIRST implementation task, before any UI):** a throwaway proof, run
manually on a real logged-in Slack tab, that confirms a content script can (a) read the
`xoxc` token, (b) list messages via `conversations.history`, and (c) successfully
`chat.delete` one message — validating the **same-origin / cookie / CORS** behavior of
Slack's internal API, which is the main technical unknown. If this fails, the whole
approach needs revisiting before further investment.

## 10. Chrome Web Store launch checklist

- Manifest V3 ✅, single-purpose statement, per-permission + host justifications.
- Privacy form: **"no user data collected or transmitted"** (true — all local).
- A simple **privacy policy** page (a static GitHub Pages / hosted markdown URL — not a
  backend) linked in the listing.
- One-time **$5 developer registration fee**; identity verification.
- **Non-trader** declaration (EU DSA), since it's free.
- Listing assets: 128px icon, screenshots, keyword-rich description reinforcing the
  title's search terms (bulk delete, Slack messages, DMs, group chats).
- No remote code (MV3-compliant), no obfuscation.

## 11. Legal / risk note

Deletion uses Slack's **internal, undocumented** web API via the user's own session.
This can technically conflict with Slack's automation Terms of Service and carries a
small account-risk for the user. The extension only ever deletes the **acting user's own
messages**, runs entirely locally, and transmits nothing to third parties. The listing
should set honest expectations (irreversible deletion; use at your own discretion).
