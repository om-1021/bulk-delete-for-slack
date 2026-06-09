# Free Bulk Delete for Slack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, local-only Manifest V3 Chrome extension that bulk-deletes the user's own messages in the currently-open Slack DM, group DM, or channel, with an optional date-range filter, live progress, and a Stop button.

**Architecture:** A content script on `app.slack.com` captures the workspace `xoxc` token from the page, calls Slack's internal web API (`conversations.history`/`replies` + `chat.delete`) same-origin so the session cookie auto-attaches, and renders a Shadow-DOM Preact panel with live progress. A tiny service worker toggles the panel when the toolbar icon is clicked. No backend, no remote code.

**Tech Stack:** TypeScript, Preact, Vite + `@crxjs/vite-plugin` (MV3 bundling), Vitest (unit tests). Pure logic modules are TDD'd with mocked `fetch`; the UI/manifest/packaging are verified manually.

---

## File Structure

```
manifest.json                      # MV3 manifest
package.json                       # scripts + deps
tsconfig.json                      # TS config (Preact JSX)
vite.config.ts                     # Vite + CRXJS + Preact
src/
  background/service-worker.ts     # toolbar click -> TOGGLE_PANEL message
  content/index.ts                 # mount/toggle Shadow-DOM panel; message listener
  content/panel/App.tsx            # Preact root: state machine + orchestration
  content/panel/styles.ts          # PANEL_CSS string injected into shadow root
  lib/types.ts                     # shared types
  lib/rateLimiter.ts               # request spacing + backoff
  lib/slackApi.ts                  # authenticated Slack web API client
  lib/slackToken.ts                # token + user + active-conversation discovery
  lib/cleaner.ts                   # enumerate + filter + delete loop (AbortController, events)
  lib/panelState.ts                # UI reducer / state machine
tests/
  sanity.test.ts                   # harness check (Task 1)
  rateLimiter.test.ts
  slackApi.test.ts
  slackToken.test.ts
  cleaner.test.ts
  panelState.test.ts
public/icons/                      # icon16/48/128 png (Task 13)
```

Each `lib/*` module has one responsibility and a small typed interface, testable in isolation. The `fetch` used by `slackApi` is injectable, so if the spike (Task 2) shows API calls must be routed through the background worker, only the injected `fetch` changes — cleaner/UI logic is untouched.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.json`
- Create stubs: `src/content/index.ts`, `src/background/service-worker.ts`
- Create: `tests/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "free-bulk-delete-for-slack",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "preact": "^10.22.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "@preact/preset-vite": "^2.9.0",
    "@types/chrome": "^0.0.270",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["chrome"],
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["src", "tests", "vite.config.ts", "manifest.json"]
}
```

- [ ] **Step 3: Create `manifest.json`** (icons added later in Task 13)

```json
{
  "manifest_version": 3,
  "name": "Free Bulk Delete for Slack — Messages, DMs & Group Chats",
  "short_name": "BulkDelete",
  "version": "0.1.0",
  "description": "Bulk delete your own Slack messages in any DM, group chat, or channel. Free, fast, and 100% local — nothing leaves your browser.",
  "action": { "default_title": "Bulk Delete for Slack" },
  "background": { "service_worker": "src/background/service-worker.ts", "type": "module" },
  "host_permissions": ["https://*.slack.com/*"],
  "permissions": ["scripting", "activeTab", "storage"],
  "content_scripts": [
    {
      "matches": ["https://app.slack.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
});
```

- [ ] **Step 5: Create stub `src/background/service-worker.ts`**

```ts
// Toolbar-click toggles the in-page panel. Implemented fully in Task 12.
export {};
```

- [ ] **Step 6: Create stub `src/content/index.ts`**

```ts
// Mounts the panel on TOGGLE_PANEL. Implemented fully in Task 11.
console.debug("[BulkDelete] content script loaded");
```

- [ ] **Step 7: Create `tests/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` created.

- [ ] **Step 9: Verify the test harness**

Run: `npm test`
Expected: PASS — 1 passed (`tests/sanity.test.ts`).

- [ ] **Step 10: Verify the build**

Run: `npm run build`
Expected: completes; a `dist/` folder is produced containing `manifest.json`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Preact + CRXJS MV3 extension with Vitest"
```

---

## Task 2: De-risking spike (MANUAL — do before building logic)

**Purpose:** Confirm the core technical unknown before investing in modules: that a same-origin request from `app.slack.com` using the page's `xoxc` token can (a) read the token, (b) list messages, and (c) delete one message — with the session cookie auto-attached. This decides the `apiBase` value used in `slackToken.ts`.

> This task writes no code into the repo. It is a manual verification run in the browser DevTools console.

- [ ] **Step 1: Open a throwaway Slack conversation**

In Chrome, open `https://app.slack.com`, log in, and open a DM **with yourself** (or a personal test conversation). Post 2–3 throwaway messages you are willing to delete.

- [ ] **Step 2: Read the token + active channel (paste into DevTools console)**

```js
const cfg = JSON.parse(localStorage.localConfig_v2);
const teamId = cfg.lastActiveTeamId ?? Object.keys(cfg.teams)[0];
const team = cfg.teams[teamId];
const channel = location.pathname.split("/").find(s => /^[CDG][A-Z0-9]{6,}$/.test(s));
console.log({ teamId, userId: team.user_id, hasToken: !!team.token, channel, origin: location.origin });
```
Expected: an object with a truthy `hasToken`, a `userId` like `U…`, and a `channel` like `D…`/`C…`/`G…`.
**Record:** Is `team.user_id` present? If not, note where the user id actually lives (try `cfg.teams[teamId]` keys, or `window.boot_data`). The finding feeds Task 6.

- [ ] **Step 3: List messages (same console)**

```js
const token = JSON.parse(localStorage.localConfig_v2).teams[JSON.parse(localStorage.localConfig_v2).lastActiveTeamId].token;
const ch = location.pathname.split("/").find(s => /^[CDG][A-Z0-9]{6,}$/.test(s));
const r = await fetch(`${location.origin}/api/conversations.history`, {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token, channel: ch, limit: "5" }).toString(),
});
const j = await r.json();
console.log("history ok:", j.ok, "count:", j.messages?.length, "err:", j.error, "status:", r.status);
```
Expected: `history ok: true` with a message count > 0.
**Decision point:** If `ok:true` → `apiBase = location.origin` (i.e. `https://app.slack.com`) works; proceed. If it fails with a CORS/`not_allowed`/`invalid_auth` error, see Step 5 contingency.

- [ ] **Step 4: Delete one of your own messages (same console)**

```js
// Put the ts of one of YOUR throwaway messages from Step 3's output:
const ts = "PASTE_A_TS_HERE";
const token = JSON.parse(localStorage.localConfig_v2).teams[JSON.parse(localStorage.localConfig_v2).lastActiveTeamId].token;
const ch = location.pathname.split("/").find(s => /^[CDG][A-Z0-9]{6,}$/.test(s));
const r = await fetch(`${location.origin}/api/chat.delete`, {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token, channel: ch, ts }).toString(),
});
console.log("delete:", await r.json(), "status:", r.status);
```
Expected: `{ ok: true, ... }` and the message vanishes from the Slack UI.

- [ ] **Step 5: Record the outcome / contingency**

- **If Steps 3–4 succeeded:** the plan proceeds as written; `slackToken.apiBase = window.location.origin`.
- **If same-origin failed but the workspace domain (`team.url`, e.g. `https://acme.slack.com`) is required (cross-origin):** the content-script fetch will be CORS-blocked. Contingency: route API calls through the **background service worker** (which bypasses CORS for hosts in `host_permissions`). Because `createSlackApi` takes an injectable `fetch`, implement a `backgroundFetch` that messages the service worker to perform the request and pass it into `createSlackApi`. Note this decision here and adjust Task 5 + Task 11 accordingly. **Do not proceed past this task until one path is confirmed working.**

- [ ] **Step 6: No commit** (nothing changed in the repo). Write the confirmed `apiBase` decision into the PR/commit message of Task 6.

---

## Task 3: Shared types

**Files:**
- Create: `src/lib/types.ts`

> Pure type declarations — no behavior, so no test. Later tasks depend on these exact names.

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export interface SlackContext {
  token: string;   // xoxc-...
  userId: string;  // U...
  teamId: string;  // T...
  apiBase: string; // origin for /api calls, e.g. "https://app.slack.com"
}

export interface SlackMessage {
  ts: string;
  user?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
}

export interface ScanFilters {
  onlyMine: boolean;   // v1: always true
  afterSec?: number;   // inclusive lower bound (epoch seconds)
  beforeSec?: number;  // inclusive upper bound (epoch seconds)
}

export interface ScanResult {
  channelId: string;
  tsList: string[];
  total: number;
}

export interface DeleteProgress {
  deleted: number;
  skipped: number;
  total: number;
  ratePerMin: number;
  elapsedMs: number;
  lastError?: string;
}

export type CleanerEvent =
  | { type: "progress"; progress: DeleteProgress }
  | { type: "done"; progress: DeleteProgress }
  | { type: "stopped"; progress: DeleteProgress }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared types"
```

---

## Task 4: RateLimiter

**Files:**
- Create: `src/lib/rateLimiter.ts`
- Test: `tests/rateLimiter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/lib/rateLimiter";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("RateLimiter", () => {
  it("allows the first request immediately", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    expect(rl.reserve()).toBe(0);
  });

  it("spaces consecutive requests by minIntervalMs", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.reserve();                       // reserves slot, nextAllowed -> 1000
    expect(rl.reserve()).toBe(1000);    // still t=0, must wait 1000ms
  });

  it("returns zero wait once enough time has elapsed", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.reserve();
    c.advance(1000);
    expect(rl.reserve()).toBe(0);
  });

  it("delays the next slot after penalize()", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.penalize(5000);
    expect(rl.reserve()).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rateLimiter.test.ts`
Expected: FAIL — cannot find module `../src/lib/rateLimiter`.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface RateLimiterOptions {
  minIntervalMs?: number;
  now?: () => number;
}

export class RateLimiter {
  private minIntervalMs: number;
  private now: () => number;
  private nextAllowed = 0;

  constructor(opts: RateLimiterOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 1100;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Reserve the next slot; returns ms the caller must wait before sending. */
  reserve(): number {
    const t = this.now();
    const wait = Math.max(0, this.nextAllowed - t);
    this.nextAllowed = Math.max(t, this.nextAllowed) + this.minIntervalMs;
    return wait;
  }

  /** Record a rate-limit response; push the next slot out by retryAfterMs. */
  penalize(retryAfterMs: number): void {
    const t = this.now();
    this.nextAllowed = Math.max(this.nextAllowed, t + retryAfterMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rateLimiter.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rateLimiter.ts tests/rateLimiter.test.ts
git commit -m "feat: add RateLimiter with spacing and backoff"
```

---

## Task 5: Slack API client

**Files:**
- Create: `src/lib/slackApi.ts`
- Test: `tests/slackApi.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createSlackApi } from "../src/lib/slackApi";
import type { SlackContext } from "../src/lib/types";

const ctx: SlackContext = {
  token: "xoxc-1", userId: "U1", teamId: "T1", apiBase: "https://app.slack.com",
};

function jsonResponse(obj: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(obj), { status: 200, ...init });
}

describe("createSlackApi", () => {
  it("posts conversations.history and parses messages + cursor", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, messages: [{ ts: "1.0", user: "U1" }], response_metadata: { next_cursor: "c2" } }),
    );
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    const page = await api.conversationsHistory("C1", { limit: 200 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/conversations.history");
    expect(init.credentials).toBe("include");
    expect(String(init.body)).toContain("token=xoxc-1");
    expect(String(init.body)).toContain("channel=C1");
    expect(page.messages).toHaveLength(1);
    expect(page.nextCursor).toBe("c2");
  });

  it("reports ok from chat.delete", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    expect(await api.chatDelete("C1", "1.0")).toEqual({ ok: true, error: undefined, status: 200 });
  });

  it("maps HTTP 429 into a retryAfterMs outcome", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "3" } }));
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    expect(await api.chatDelete("C1", "1.0")).toEqual({
      ok: false, status: 429, error: "ratelimited", retryAfterMs: 3000,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slackApi.test.ts`
Expected: FAIL — cannot find module `../src/lib/slackApi`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SlackContext, SlackMessage } from "./types";

export interface HistoryPage {
  messages: SlackMessage[];
  nextCursor?: string;
}

export interface DeleteOutcome {
  ok: boolean;
  error?: string;
  status: number;
  retryAfterMs?: number;
}

export interface SlackApi {
  conversationsHistory(
    channel: string,
    opts?: { cursor?: string; oldest?: string; latest?: string; limit?: number },
  ): Promise<HistoryPage>;
  conversationsReplies(
    channel: string,
    ts: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<HistoryPage>;
  chatDelete(channel: string, ts: string): Promise<DeleteOutcome>;
}

export function createSlackApi(ctx: SlackContext, fetchImpl: typeof fetch = fetch): SlackApi {
  async function post(method: string, params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams({ token: ctx.token, ...params });
    return fetchImpl(`${ctx.apiBase}/api/${method}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  function toPage(json: { messages?: SlackMessage[]; response_metadata?: { next_cursor?: string } }): HistoryPage {
    return {
      messages: json.messages ?? [],
      nextCursor: json.response_metadata?.next_cursor || undefined,
    };
  }

  return {
    async conversationsHistory(channel, opts = {}) {
      const params: Record<string, string> = { channel, limit: String(opts.limit ?? 200) };
      if (opts.cursor) params.cursor = opts.cursor;
      if (opts.oldest) params.oldest = opts.oldest;
      if (opts.latest) params.latest = opts.latest;
      const res = await post("conversations.history", params);
      return toPage(await res.json());
    },
    async conversationsReplies(channel, ts, opts = {}) {
      const params: Record<string, string> = { channel, ts, limit: String(opts.limit ?? 200) };
      if (opts.cursor) params.cursor = opts.cursor;
      const res = await post("conversations.replies", params);
      return toPage(await res.json());
    },
    async chatDelete(channel, ts) {
      const res = await post("chat.delete", { channel, ts });
      if (res.status === 429) {
        const ra = Number(res.headers.get("Retry-After") ?? "1");
        return { ok: false, status: 429, error: "ratelimited", retryAfterMs: ra * 1000 };
      }
      const json = (await res.json()) as { ok?: boolean; error?: string };
      return { ok: !!json.ok, error: json.error, status: res.status };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/slackApi.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slackApi.ts tests/slackApi.test.ts
git commit -m "feat: add authenticated Slack web API client"
```

---

## Task 6: Token & active-conversation discovery

**Files:**
- Create: `src/lib/slackToken.ts`
- Test: `tests/slackToken.test.ts`

> Use the user-id location confirmed in Task 2, Step 2. The code below reads `team.user_id`; if the spike showed it elsewhere, adjust the `userId` line accordingly and note it in the commit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readSlackContext, readActiveChannelId, TokenNotFoundError } from "../src/lib/slackToken";

function fakeWin(configObj: unknown | null, origin = "https://app.slack.com") {
  const raw = configObj === null ? null : JSON.stringify(configObj);
  return {
    localStorage: { getItem: (k: string) => (k === "localConfig_v2" ? raw : null) },
    location: { origin },
  };
}

describe("readSlackContext", () => {
  it("extracts token, user, team, and apiBase", () => {
    const win = fakeWin({ lastActiveTeamId: "T1", teams: { T1: { token: "xoxc-1", user_id: "U1" } } });
    expect(readSlackContext(win)).toEqual({
      token: "xoxc-1", userId: "U1", teamId: "T1", apiBase: "https://app.slack.com",
    });
  });

  it("throws TokenNotFoundError when config is missing", () => {
    expect(() => readSlackContext(fakeWin(null))).toThrow(TokenNotFoundError);
  });

  it("throws TokenNotFoundError when the team has no token", () => {
    const win = fakeWin({ lastActiveTeamId: "T1", teams: { T1: {} } });
    expect(() => readSlackContext(win)).toThrow(TokenNotFoundError);
  });
});

describe("readActiveChannelId", () => {
  it("reads the channel id from the client path", () => {
    expect(readActiveChannelId("/client/T08AB12/C08CD34/thread")).toBe("C08CD34");
  });

  it("returns null when no conversation is open", () => {
    expect(readActiveChannelId("/client/T08AB12")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slackToken.test.ts`
Expected: FAIL — cannot find module `../src/lib/slackToken`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SlackContext } from "./types";

export class TokenNotFoundError extends Error {}

interface MinimalWindow {
  localStorage: Pick<Storage, "getItem">;
  location: { origin: string };
}

interface TeamConfig {
  token?: string;
  user_id?: string;
}
interface LocalConfig {
  lastActiveTeamId?: string;
  teams?: Record<string, TeamConfig>;
}

export function readSlackContext(win: MinimalWindow = window): SlackContext {
  const raw = win.localStorage.getItem("localConfig_v2");
  if (!raw) throw new TokenNotFoundError("Open and log into Slack first.");

  let cfg: LocalConfig;
  try {
    cfg = JSON.parse(raw) as LocalConfig;
  } catch {
    throw new TokenNotFoundError("Could not read your Slack session — reload Slack.");
  }

  const teamId = cfg.lastActiveTeamId ?? Object.keys(cfg.teams ?? {})[0];
  const team = teamId ? cfg.teams?.[teamId] : undefined;
  if (!team?.token) throw new TokenNotFoundError("No Slack session found — open and log into Slack first.");

  return {
    token: team.token,
    userId: team.user_id ?? "",
    teamId: teamId!,
    apiBase: win.location.origin,
  };
}

export function readActiveChannelId(pathname: string): string | null {
  const seg = pathname.split("/").find((s) => /^[CDG][A-Z0-9]{6,}$/.test(s));
  return seg ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/slackToken.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slackToken.ts tests/slackToken.test.ts
git commit -m "feat: add Slack token and active-conversation discovery"
```

---

## Task 7: Cleaner — scan (enumerate + filter)

**Files:**
- Create: `src/lib/cleaner.ts`
- Test: `tests/cleaner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scan } from "../src/lib/cleaner";
import type { SlackApi, HistoryPage } from "../src/lib/slackApi";
import type { SlackContext } from "../src/lib/types";
import { RateLimiter } from "../src/lib/rateLimiter";

const ctx: SlackContext = { token: "t", userId: "U1", teamId: "T1", apiBase: "https://app.slack.com" };
const noopSleep = async () => {};

function fakeApi(over: Partial<SlackApi> = {}): SlackApi {
  return {
    conversationsHistory: async (): Promise<HistoryPage> => ({ messages: [] }),
    conversationsReplies: async (): Promise<HistoryPage> => ({ messages: [] }),
    chatDelete: async () => ({ ok: true, status: 200 }),
    ...over,
  };
}
function deps(api: SlackApi) {
  return { api, limiter: new RateLimiter({ now: () => 0 }), sleep: noopSleep, now: () => 0 };
}

describe("scan", () => {
  it("keeps only the acting user's messages", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [
          { ts: "100.0", user: "U1" },
          { ts: "101.0", user: "U2" },
          { ts: "102.0", user: "U1" },
        ],
      }),
    });
    const res = await scan("C1", ctx, { onlyMine: true }, deps(api));
    expect(res.tsList.sort()).toEqual(["100.0", "102.0"]);
    expect(res.total).toBe(2);
  });

  it("applies after/before date bounds", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({
        messages: [
          { ts: "100.0", user: "U1" },
          { ts: "200.0", user: "U1" },
          { ts: "300.0", user: "U1" },
        ],
      }),
    });
    const res = await scan("C1", ctx, { onlyMine: true, afterSec: 150, beforeSec: 250 }, deps(api));
    expect(res.tsList).toEqual(["200.0"]);
  });

  it("follows pagination cursors", async () => {
    const pages: HistoryPage[] = [
      { messages: [{ ts: "1.0", user: "U1" }], nextCursor: "c2" },
      { messages: [{ ts: "2.0", user: "U1" }] },
    ];
    let i = 0;
    const api = fakeApi({ conversationsHistory: async () => pages[i++] });
    const res = await scan("C1", ctx, { onlyMine: true }, deps(api));
    expect(res.tsList.sort()).toEqual(["1.0", "2.0"]);
  });

  it("includes thread replies authored by the user", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({ messages: [{ ts: "10.0", user: "U2", reply_count: 2 }] }),
      conversationsReplies: async () => ({
        messages: [
          { ts: "10.0", user: "U2" }, // root — skipped (not mine, already considered)
          { ts: "10.1", user: "U1" }, // mine
          { ts: "10.2", user: "U3" },
        ],
      }),
    });
    const res = await scan("C1", ctx, { onlyMine: true }, deps(api));
    expect(res.tsList).toEqual(["10.1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: FAIL — cannot find module `../src/lib/cleaner` (or `scan` is not exported).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SlackApi } from "./slackApi";
import type { RateLimiter } from "./rateLimiter";
import type {
  CleanerEvent, DeleteProgress, ScanFilters, ScanResult, SlackContext, SlackMessage,
} from "./types";

export interface CleanerDeps {
  api: SlackApi;
  limiter: RateLimiter;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

function matches(msg: SlackMessage, userId: string, filters: ScanFilters): boolean {
  if (filters.onlyMine && msg.user !== userId) return false;
  const sec = Math.floor(Number(msg.ts));
  if (filters.afterSec !== undefined && sec < filters.afterSec) return false;
  if (filters.beforeSec !== undefined && sec > filters.beforeSec) return false;
  return true;
}

export async function scan(
  channel: string,
  ctx: SlackContext,
  filters: ScanFilters,
  deps: CleanerDeps,
): Promise<ScanResult> {
  const found: string[] = [];
  const threadRoots: string[] = [];
  const oldest = filters.afterSec !== undefined ? String(filters.afterSec) : undefined;
  const latest = filters.beforeSec !== undefined ? String(filters.beforeSec) : undefined;

  let cursor: string | undefined;
  do {
    await deps.sleep(deps.limiter.reserve());
    const page = await deps.api.conversationsHistory(channel, { cursor, oldest, latest, limit: 200 });
    for (const m of page.messages) {
      if (matches(m, ctx.userId, filters)) found.push(m.ts);
      if ((m.reply_count ?? 0) > 0) threadRoots.push(m.ts);
    }
    cursor = page.nextCursor;
  } while (cursor);

  for (const root of threadRoots) {
    let rc: string | undefined;
    do {
      await deps.sleep(deps.limiter.reserve());
      const page = await deps.api.conversationsReplies(channel, root, { cursor: rc, limit: 200 });
      for (const m of page.messages) {
        if (m.ts === root) continue; // root already handled by history pass
        if (matches(m, ctx.userId, filters)) found.push(m.ts);
      }
      rc = page.nextCursor;
    } while (rc);
  }

  const tsList = Array.from(new Set(found));
  return { channelId: channel, tsList, total: tsList.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cleaner.ts tests/cleaner.test.ts
git commit -m "feat: add cleaner scan (enumerate + filter, with thread traversal)"
```

---

## Task 8: Cleaner — runDelete (delete loop + errors + Stop)

**Files:**
- Modify: `src/lib/cleaner.ts` (add `runDelete`)
- Modify: `tests/cleaner.test.ts` (add a `runDelete` describe block)

- [ ] **Step 1: Add the failing tests** (append to `tests/cleaner.test.ts`)

```ts
import { runDelete } from "../src/lib/cleaner";
import { vi } from "vitest";

function incClock() {
  let t = 0;
  return () => (t += 1000);
}

describe("runDelete", () => {
  it("deletes every message and finishes done", async () => {
    const deleted: string[] = [];
    const api = fakeApi({
      chatDelete: async (_c, ts) => { deleted.push(ts); return { ok: true, status: 200 }; },
    });
    const d = { api, limiter: new RateLimiter({ now: () => 0 }), sleep: noopSleep, now: incClock() };
    const events: CleanerEventLike[] = [];
    const ac = new AbortController();
    const final = await runDelete(
      { channelId: "C1", tsList: ["1.0", "2.0"], total: 2 }, ctx, d, (e) => events.push(e), ac.signal,
    );
    expect(deleted).toEqual(["1.0", "2.0"]);
    expect(final.deleted).toBe(2);
    expect(events.at(-1)!.type).toBe("done");
  });

  it("retries after a rate-limit response", async () => {
    let calls = 0;
    const api = fakeApi({
      chatDelete: async () => {
        calls++;
        return calls === 1
          ? { ok: false, status: 429, error: "ratelimited", retryAfterMs: 1000 }
          : { ok: true, status: 200 };
      },
    });
    const limiter = new RateLimiter({ now: () => 0 });
    const penalize = vi.spyOn(limiter, "penalize");
    const d = { api, limiter, sleep: noopSleep, now: incClock() };
    const ac = new AbortController();
    const final = await runDelete(
      { channelId: "C1", tsList: ["1.0"], total: 1 }, ctx, d, () => {}, ac.signal,
    );
    expect(penalize).toHaveBeenCalledWith(1000);
    expect(final.deleted).toBe(1);
  });

  it("skips messages that cannot be deleted", async () => {
    const api = fakeApi({ chatDelete: async () => ({ ok: false, status: 200, error: "message_not_found" }) });
    const d = { api, limiter: new RateLimiter({ now: () => 0 }), sleep: noopSleep, now: incClock() };
    const ac = new AbortController();
    const final = await runDelete(
      { channelId: "C1", tsList: ["1.0"], total: 1 }, ctx, d, () => {}, ac.signal,
    );
    expect(final.skipped).toBe(1);
    expect(final.deleted).toBe(0);
  });

  it("stops promptly when aborted", async () => {
    const ac = new AbortController();
    let calls = 0;
    const api = fakeApi({
      chatDelete: async (_c, ts) => { calls++; if (calls === 1) ac.abort(); return { ok: true, status: 200 }; },
    });
    const d = { api, limiter: new RateLimiter({ now: () => 0 }), sleep: noopSleep, now: incClock() };
    const events: CleanerEventLike[] = [];
    const final = await runDelete(
      { channelId: "C1", tsList: ["1.0", "2.0", "3.0"], total: 3 }, ctx, d, (e) => events.push(e), ac.signal,
    );
    expect(final.deleted).toBe(1);
    expect(events.at(-1)!.type).toBe("stopped");
  });
});

type CleanerEventLike = { type: string };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: FAIL — `runDelete` is not exported from `../src/lib/cleaner`.

- [ ] **Step 3: Add `runDelete` to `src/lib/cleaner.ts`** (append at the end of the file)

```ts
export async function runDelete(
  scanResult: ScanResult,
  _ctx: SlackContext,
  deps: CleanerDeps,
  onEvent: (e: CleanerEvent) => void,
  signal: AbortSignal,
): Promise<DeleteProgress> {
  const start = deps.now();
  const progress: DeleteProgress = {
    deleted: 0, skipped: 0, total: scanResult.total, ratePerMin: 0, elapsedMs: 0,
  };

  const finish = (type: "done" | "stopped"): DeleteProgress => {
    progress.elapsedMs = deps.now() - start;
    onEvent({ type, progress: { ...progress } });
    return { ...progress };
  };

  for (const ts of scanResult.tsList) {
    if (signal.aborted) return finish("stopped");

    let attempts = 0;
    for (;;) {
      if (signal.aborted) return finish("stopped");
      await deps.sleep(deps.limiter.reserve());
      const out = await deps.api.chatDelete(scanResult.channelId, ts);

      if (out.ok) { progress.deleted++; break; }

      if (out.status === 429 && attempts < 5) {
        deps.limiter.penalize(out.retryAfterMs ?? 1000);
        attempts++;
        continue;
      }

      if (out.error === "invalid_auth" || out.error === "token_revoked") {
        progress.lastError = out.error;
        onEvent({ type: "error", message: "Slack session expired — reload Slack and try again." });
        return finish("stopped");
      }

      // message_not_found / cant_delete_message / compliance_exports_enabled / attempts exhausted
      progress.skipped++;
      progress.lastError = out.error;
      break;
    }

    progress.elapsedMs = deps.now() - start;
    const mins = progress.elapsedMs / 60000;
    progress.ratePerMin = mins > 0 ? (progress.deleted + progress.skipped) / mins : 0;
    onEvent({ type: "progress", progress: { ...progress } });
  }

  return finish("done");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: PASS — 8 passed (4 scan + 4 runDelete).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all files green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cleaner.ts tests/cleaner.test.ts
git commit -m "feat: add cleaner runDelete with rate-limit retry, skips, and Stop"
```

---

## Task 9: Panel state reducer

**Files:**
- Create: `src/lib/panelState.ts`
- Test: `tests/panelState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { reduce, initialState } from "../src/lib/panelState";

describe("panel reducer", () => {
  it("initializes with the channel and conversation name", () => {
    const s = reduce(initialState, { type: "INIT", channelId: "C1", conversationName: "#general" });
    expect(s.status).toBe("idle");
    expect(s.channelId).toBe("C1");
    expect(s.conversationName).toBe("#general");
  });

  it("moves to preview and records the scan total", () => {
    const scanning = reduce(initialState, { type: "SCAN_START" });
    expect(scanning.status).toBe("scanning");
    const preview = reduce(scanning, { type: "SCAN_DONE", total: 7 });
    expect(preview.status).toBe("preview");
    expect(preview.scanTotal).toBe(7);
    expect(preview.progress.total).toBe(7);
  });

  it("marks stopped with final progress", () => {
    const running = reduce(initialState, { type: "RUN_START" });
    const stopped = reduce(running, {
      type: "RUN_STOPPED",
      progress: { deleted: 3, skipped: 1, total: 7, ratePerMin: 40, elapsedMs: 6000 },
    });
    expect(stopped.status).toBe("stopped");
    expect(stopped.progress.deleted).toBe(3);
  });

  it("captures errors", () => {
    const s = reduce(initialState, { type: "ERROR", message: "boom" });
    expect(s.status).toBe("error");
    expect(s.error).toBe("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/panelState.test.ts`
Expected: FAIL — cannot find module `../src/lib/panelState`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { DeleteProgress } from "./types";

export type PanelStatus =
  | "idle" | "scanning" | "preview" | "running" | "stopped" | "done" | "error";

export interface PanelState {
  status: PanelStatus;
  conversationName: string;
  channelId: string | null;
  afterSec?: number;
  beforeSec?: number;
  confirmed: boolean;
  scanTotal: number;
  progress: DeleteProgress;
  error?: string;
}

export type PanelAction =
  | { type: "INIT"; channelId: string | null; conversationName: string }
  | { type: "SET_AFTER"; afterSec?: number }
  | { type: "SET_BEFORE"; beforeSec?: number }
  | { type: "SET_CONFIRMED"; confirmed: boolean }
  | { type: "SCAN_START" }
  | { type: "SCAN_DONE"; total: number }
  | { type: "RUN_START" }
  | { type: "PROGRESS"; progress: DeleteProgress }
  | { type: "RUN_DONE"; progress: DeleteProgress }
  | { type: "RUN_STOPPED"; progress: DeleteProgress }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export const initialState: PanelState = {
  status: "idle",
  conversationName: "",
  channelId: null,
  confirmed: false,
  scanTotal: 0,
  progress: { deleted: 0, skipped: 0, total: 0, ratePerMin: 0, elapsedMs: 0 },
};

export function reduce(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "INIT":
      return { ...initialState, channelId: action.channelId, conversationName: action.conversationName };
    case "SET_AFTER":
      return { ...state, afterSec: action.afterSec };
    case "SET_BEFORE":
      return { ...state, beforeSec: action.beforeSec };
    case "SET_CONFIRMED":
      return { ...state, confirmed: action.confirmed };
    case "SCAN_START":
      return { ...state, status: "scanning", error: undefined };
    case "SCAN_DONE":
      return { ...state, status: "preview", scanTotal: action.total, progress: { ...state.progress, total: action.total } };
    case "RUN_START":
      return { ...state, status: "running" };
    case "PROGRESS":
      return { ...state, progress: action.progress };
    case "RUN_DONE":
      return { ...state, status: "done", progress: action.progress };
    case "RUN_STOPPED":
      return { ...state, status: "stopped", progress: action.progress };
    case "ERROR":
      return { ...state, status: "error", error: action.message };
    case "RESET":
      return { ...initialState, channelId: state.channelId, conversationName: state.conversationName };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/panelState.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/panelState.ts tests/panelState.test.ts
git commit -m "feat: add panel state reducer"
```

---

## Task 10: Panel styles + UI component

**Files:**
- Create: `src/content/panel/styles.ts`
- Create: `src/content/panel/App.tsx`

> The UI is verified by building and loading the extension (Task 11 wires it up). No unit test — the state logic it relies on is already covered by Tasks 8 and 9.

- [ ] **Step 1: Create `src/content/panel/styles.ts`**

```ts
export const PANEL_CSS = `
:host, * { box-sizing: border-box; }
.panel {
  position: fixed; top: 0; right: 0; height: 100vh; width: 360px; z-index: 2147483647;
  background: #ffffff; color: #1d1c1d; font-family: -apple-system, Segoe UI, Roboto, sans-serif;
  box-shadow: -8px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column;
  border-left: 1px solid #e2e2e2;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #ededed; background: #611f69; color: #fff;
}
.header h1 { font-size: 15px; margin: 0; font-weight: 700; }
.header button { background: transparent; border: 0; color: #fff; font-size: 18px; cursor: pointer; }
.body { padding: 16px; overflow-y: auto; flex: 1; }
.target { font-size: 13px; color: #616061; margin-bottom: 14px; }
.target b { color: #1d1c1d; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; }
.field label { font-weight: 600; }
.field input { padding: 7px 9px; border: 1px solid #cfcfcf; border-radius: 6px; font-size: 13px; }
.btn {
  width: 100%; padding: 10px 12px; border: 0; border-radius: 8px; font-size: 14px;
  font-weight: 700; cursor: pointer; margin-top: 6px;
}
.btn-primary { background: #007a5a; color: #fff; }
.btn-primary:disabled { background: #b9d9cd; cursor: not-allowed; }
.btn-danger { background: #e01e5a; color: #fff; }
.btn-secondary { background: #f1f1f1; color: #1d1c1d; }
.confirm { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; margin: 10px 0; color: #616061; }
.count { font-size: 22px; font-weight: 800; margin: 8px 0; }
.progress-wrap { background: #ededed; border-radius: 999px; height: 10px; overflow: hidden; margin: 12px 0 8px; }
.progress-bar { background: #007a5a; height: 100%; transition: width .2s ease; }
.stats { font-size: 12px; color: #616061; display: flex; justify-content: space-between; }
.error { background: #fdeef0; color: #8b0a2c; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
.note { font-size: 11px; color: #8d8d8d; margin-top: 12px; line-height: 1.4; }
`;
```

- [ ] **Step 2: Create `src/content/panel/App.tsx`**

```tsx
import { useEffect, useReducer, useRef } from "preact/hooks";
import { reduce, initialState } from "../../lib/panelState";
import { readSlackContext, readActiveChannelId, TokenNotFoundError } from "../../lib/slackToken";
import { createSlackApi } from "../../lib/slackApi";
import { RateLimiter } from "../../lib/rateLimiter";
import { scan, runDelete, type CleanerDeps } from "../../lib/cleaner";
import type { ScanFilters, ScanResult, SlackContext } from "../../lib/types";
import { PANEL_CSS } from "./styles";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function dateToSec(value: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

export function App({ onClose }: { onClose: () => void }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const ctxRef = useRef<SlackContext | null>(null);
  const scanRef = useRef<ScanResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const ctx = readSlackContext();
      ctxRef.current = ctx;
      const channelId = readActiveChannelId(location.pathname);
      dispatch({ type: "INIT", channelId, conversationName: channelId ?? "" });
      if (!channelId) dispatch({ type: "ERROR", message: "Open a DM, group, or channel first." });
    } catch (e) {
      dispatch({
        type: "ERROR",
        message: e instanceof TokenNotFoundError ? e.message : "Could not read your Slack session — reload Slack.",
      });
    }
  }, []);

  function buildDeps(): CleanerDeps {
    return { api: createSlackApi(ctxRef.current!), limiter: new RateLimiter(), sleep, now: () => Date.now() };
  }
  function filters(): ScanFilters {
    return { onlyMine: true, afterSec: state.afterSec, beforeSec: state.beforeSec };
  }

  async function onScan() {
    if (!ctxRef.current || !state.channelId) return;
    dispatch({ type: "SCAN_START" });
    try {
      const result = await scan(state.channelId, ctxRef.current, filters(), buildDeps());
      scanRef.current = result;
      dispatch({ type: "SCAN_DONE", total: result.total });
    } catch {
      dispatch({ type: "ERROR", message: "Could not scan messages — reload Slack and try again." });
    }
  }

  async function onDelete() {
    if (!ctxRef.current || !scanRef.current) return;
    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({ type: "RUN_START" });
    const final = await runDelete(scanRef.current, ctxRef.current, buildDeps(), (e) => {
      if (e.type === "progress") dispatch({ type: "PROGRESS", progress: e.progress });
      else if (e.type === "error") dispatch({ type: "ERROR", message: e.message });
    }, ac.signal);
    if (state.status !== "error") {
      dispatch(ac.signal.aborted ? { type: "RUN_STOPPED", progress: final } : { type: "RUN_DONE", progress: final });
    }
  }

  const pct = state.progress.total
    ? Math.round(((state.progress.deleted + state.progress.skipped) / state.progress.total) * 100)
    : 0;

  return (
    <div>
      <style>{PANEL_CSS}</style>
      <div class="panel">
        <div class="header">
          <h1>Bulk Delete for Slack</h1>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div class="body">
          {state.status === "error" && <div class="error">{state.error}</div>}

          {state.channelId && (
            <p class="target">Cleaning: <b>{state.conversationName}</b><br />Only your own messages.</p>
          )}

          {(state.status === "idle" || state.status === "preview") && state.channelId && (
            <>
              <div class="field">
                <label>After (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_AFTER", afterSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Before (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_BEFORE", beforeSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <button class="btn btn-secondary" onClick={onScan}>Scan messages</button>
            </>
          )}

          {state.status === "scanning" && <p>Scanning…</p>}

          {state.status === "preview" && (
            <>
              <div class="count">Found {state.scanTotal} of your messages</div>
              {state.scanTotal > 0 && (
                <>
                  <label class="confirm">
                    <input type="checkbox" checked={state.confirmed}
                      onInput={(e) => dispatch({ type: "SET_CONFIRMED", confirmed: (e.target as HTMLInputElement).checked })} />
                    I understand this permanently deletes these messages.
                  </label>
                  <button class="btn btn-danger" disabled={!state.confirmed} onClick={onDelete}>
                    Delete {state.scanTotal} messages
                  </button>
                </>
              )}
            </>
          )}

          {state.status === "running" && (
            <>
              <div class="progress-wrap"><div class="progress-bar" style={{ width: `${pct}%` }} /></div>
              <div class="stats">
                <span>Deleted {state.progress.deleted} / {state.progress.total}</span>
                <span>{Math.round(state.progress.ratePerMin)}/min</span>
              </div>
              <button class="btn btn-danger" onClick={() => abortRef.current?.abort()}>Stop</button>
            </>
          )}

          {(state.status === "done" || state.status === "stopped") && (
            <>
              <div class="count">{state.status === "done" ? "Done" : "Stopped"}</div>
              <div class="stats">
                <span>Deleted {state.progress.deleted}</span>
                <span>Skipped {state.progress.skipped}</span>
              </div>
              <button class="btn btn-secondary" onClick={() => dispatch({ type: "RESET" })}>Start over</button>
            </>
          )}

          <p class="note">
            Free · runs entirely in your browser · nothing is sent to any server.
            Deletes only your own messages. Deletion is permanent.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `CleanerDeps` is exported from `cleaner.ts` — it is, from Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/content/panel/styles.ts src/content/panel/App.tsx
git commit -m "feat: add Shadow-DOM panel UI (Preact)"
```

---

## Task 11: Content script — mount, Shadow DOM, message listener

**Files:**
- Modify: `src/content/index.ts` (replace the stub from Task 1)

- [ ] **Step 1: Replace `src/content/index.ts` with the full implementation**

```ts
import { render } from "preact";
import { App } from "./panel/App";

const MOUNT_ID = "bulk-delete-for-slack-root";

function togglePanel(): void {
  const existing = document.getElementById(MOUNT_ID);
  if (existing) {
    existing.remove();
    return;
  }
  const host = document.createElement("div");
  host.id = MOUNT_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadow.appendChild(mount);

  render(<App onClose={() => host.remove()} />, mount);
}

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === "TOGGLE_PANEL") togglePanel();
});
```

> Note: this file uses JSX, so it must be `.tsx`. Rename it.

- [ ] **Step 2: Rename the content entry to `.tsx` and update the manifest**

Run:
```bash
git mv src/content/index.ts src/content/index.tsx
```
Then edit `manifest.json` → `content_scripts[0].js` from `"src/content/index.ts"` to `"src/content/index.tsx"`.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: completes; `dist/` contains the bundled content script and `manifest.json` references it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: mount Shadow-DOM panel from content script on TOGGLE_PANEL"
```

---

## Task 12: Service worker — toolbar toggle

**Files:**
- Modify: `src/background/service-worker.ts` (replace the stub from Task 1)

- [ ] **Step 1: Replace `src/background/service-worker.ts`**

```ts
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch {
    // No content script on this tab (not app.slack.com) — ignore.
  }
});
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: completes without errors.

- [ ] **Step 3: Manual end-to-end verification**

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the `dist/` folder.
2. Open `https://app.slack.com` and open a test DM (use a self-DM with throwaway messages).
3. Click the extension's toolbar icon → the panel slides in on the right.
4. Click **Scan messages** → it shows "Found N of your messages".
5. Tick the confirm checkbox → click **Delete N messages**.
6. Watch the progress bar advance; click **Stop** mid-run → it halts and shows a summary.
7. Verify in Slack that your messages were deleted and others' were not.

Expected: each step behaves as described; no console errors in the page or the service worker.

- [ ] **Step 4: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: toggle panel from the toolbar icon"
```

---

## Task 13: Icons, build artifact, and Chrome Web Store packaging

**Files:**
- Create: `public/icons/icon16.png`, `icon48.png`, `icon128.png`
- Create: `icons/icon.svg` (source)
- Create: `PRIVACY.md`
- Modify: `manifest.json` (add `icons` + `action.default_icon`)
- Create: `STORE_LISTING.md`

- [ ] **Step 1: Create the icon source `icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#611f69"/>
  <path d="M40 44h48l-4 52a8 8 0 0 1-8 7H52a8 8 0 0 1-8-7L40 44z" fill="#fff"/>
  <rect x="34" y="34" width="60" height="10" rx="5" fill="#fff"/>
  <rect x="54" y="26" width="20" height="9" rx="4" fill="#fff"/>
  <rect x="54" y="56" width="8" height="36" rx="4" fill="#611f69"/>
  <rect x="66" y="56" width="8" height="36" rx="4" fill="#611f69"/>
</svg>
```

- [ ] **Step 2: Rasterize to PNG at 16, 48, 128**

Use any image tool (e.g. open the SVG in a browser and export, or an online SVG→PNG converter, or `npx svgexport icons/icon.svg public/icons/icon128.png 128:128`). Produce:
- `public/icons/icon16.png` (16×16)
- `public/icons/icon48.png` (48×48)
- `public/icons/icon128.png` (128×128)

Expected: three PNG files exist with the correct dimensions.

- [ ] **Step 3: Add icons to `manifest.json`**

Add these two keys (CRXJS copies `public/` to the build root, so reference paths are `icons/…`):
```json
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
```
and extend `action`:
```json
  "action": {
    "default_title": "Bulk Delete for Slack",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
```

- [ ] **Step 4: Create `PRIVACY.md`** (host this text at a public URL — e.g. GitHub Pages — and link it in the listing)

```markdown
# Privacy Policy — Free Bulk Delete for Slack

This extension does not collect, store, transmit, or sell any personal data.

- All actions run locally in your browser.
- The extension reads your existing Slack session token from the Slack page solely to
  call Slack's own API to list and delete **your own** messages, at your request.
- No data is ever sent to the developer or any third party. There are no analytics,
  no tracking, and no remote servers.
- The only network requests made are to Slack's own API (`*.slack.com`).

Contact: <your-email@example.com>
```

- [ ] **Step 5: Create `STORE_LISTING.md`** (copy/paste source for the CWS dashboard)

```markdown
# Chrome Web Store listing

**Name:** Free Bulk Delete for Slack — Messages, DMs & Group Chats

**Short description (≤132 chars):**
Bulk delete your own Slack messages in any DM, group chat, or channel. Free, fast, and 100% local — nothing leaves your browser.

**Category:** Productivity

**Detailed description:**
Free Bulk Delete for Slack lets you clean up your own Slack messages in bulk — in any
direct message, group chat, or channel — directly from your browser.

Features:
- Bulk delete your own messages in the currently-open conversation
- Optional date-range filter (delete messages before/after a date)
- Scan & preview the exact count before deleting anything
- Live progress with a Stop button to halt at any time
- Rate-limit aware so Slack stays happy
- 100% local: your session never leaves your browser. No account, no servers, no tracking. Free.

How to use:
1. Open Slack in your browser and open a DM, group, or channel.
2. Click the extension icon to open the panel.
3. (Optional) set a date range, click Scan, confirm, then Delete.

Note: deletes only your own messages, and deletion is permanent.

**Permission justifications (for the dashboard):**
- host `https://*.slack.com/*`: the extension operates only on Slack to read and delete the user's own messages via Slack's API.
- `scripting` / content script: to display the in-page control panel on Slack.
- `activeTab`: to act on the Slack tab when you click the toolbar icon.
- `storage`: to remember your last-used filter settings locally.

**Privacy practices:** No user data collected. Single purpose: bulk-delete the user's own Slack messages.
```

- [ ] **Step 6: Build and package the upload artifact**

Run:
```bash
npm run build
cd dist && zip -r ../bulk-delete-for-slack.zip . && cd ..
```
Expected: `bulk-delete-for-slack.zip` is created from the contents of `dist/`.
(On Windows PowerShell, use: `Compress-Archive -Path dist/* -DestinationPath bulk-delete-for-slack.zip -Force`.)

- [ ] **Step 7: Reload unpacked and sanity-check the icon**

Reload the unpacked extension in `chrome://extensions`; confirm the toolbar shows the new icon and the panel still works end-to-end (repeat Task 12, Step 3).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add icons, privacy policy, store listing, and packaging"
```

- [ ] **Step 9: Chrome Web Store submission checklist (manual, outside the repo)**

- [ ] Register a Chrome Web Store developer account (one-time $5 fee) and complete identity verification.
- [ ] Host `PRIVACY.md` at a public URL; copy that link into the listing.
- [ ] Create a new item, upload `bulk-delete-for-slack.zip`.
- [ ] Fill name, short + detailed description from `STORE_LISTING.md`.
- [ ] Upload at least one 1280×800 (or 640×400) screenshot of the panel in action, plus the 128px icon.
- [ ] Complete the Privacy practices form: declare **no data collected**; add per-permission justifications; declare **non-trader** (EU DSA).
- [ ] Set the single-purpose statement.
- [ ] Submit for review.

---

## Self-Review (completed during planning)

**Spec coverage:**
- Free / no backend → Task 1 (no network deps), Task 13 (privacy declares no collection). ✓
- Lean MVP scope (current conversation, my messages, date range, scan/preview, progress, Stop) → Tasks 7–10, 12. ✓
- Session token + internal API → Tasks 5, 6; validated by Task 2 spike. ✓
- Shadow-DOM panel, nice UI, Stop button → Tasks 10, 11. ✓
- Rate-limit handling + backoff → Tasks 4, 8. ✓
- Thread replies not left behind → Task 7. ✓
- Error handling (not logged in, 429, not_found, invalid_auth, etc.) → Tasks 6, 8, 10. ✓
- Minimal permissions (no `cookies`) → Task 1 manifest. ✓
- Testing (Vitest, mocked fetch) + spike-first → Tasks 2, 4–9. ✓
- CWS packaging + name "Free Bulk Delete for Slack…" → Tasks 1, 13. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code/test step contains full content. The only intentionally manual placeholders are the user's contact email in `PRIVACY.md`/`STORE_LISTING.md` and the spike's `PASTE_A_TS_HERE`, both clearly flagged.

**Type consistency:** `SlackContext`, `ScanFilters`, `ScanResult`, `DeleteProgress`, `CleanerEvent` (types.ts) are used identically across `slackApi`, `slackToken`, `cleaner`, `panelState`, and `App`. `CleanerDeps` is defined in Task 7 and consumed in Tasks 8 and 10. `RateLimiter.reserve()`/`penalize()` names match across Tasks 4, 7, 8. `scan`/`runDelete` signatures match their tests and the `App` call sites.

**Contingency:** Task 2 Step 5 documents the cross-origin fallback (route fetch via the service worker) without changing `cleaner`/UI, thanks to the injectable `fetch` in `createSlackApi`.
