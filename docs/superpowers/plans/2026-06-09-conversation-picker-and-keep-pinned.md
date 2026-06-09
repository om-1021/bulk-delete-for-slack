# Conversation Picker + Keep-Pinned — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable conversation picker (channels/group-DMs/DMs, DM names resolved progressively, current conversation pre-selected) and a "Keep pinned messages" filter (default ON) to the existing Slack bulk-delete extension.

**Architecture:** Two new Slack read methods (`users.conversations`, `pins.list`) on the existing injectable API client; a pure `conversations.ts` module that lists/labels conversations; `scan()` gains pins-aware exclusion; the reducer gains `keepPinned` + a `SELECT_TARGET` action; a self-contained `<ConversationPicker>` Preact component drives selection. Everything stays local — only Slack API calls.

**Tech Stack:** TypeScript, Preact, Vite + @crxjs/vite-plugin, Vitest. Current branch: `feat/picker-keep-pinned`.

---

## File Structure

```
src/lib/slackApi.ts          # + usersConversations(), pinsList(); extend ConversationInfo
src/lib/conversations.ts     # NEW: mpimLabel, toOption, listConversations, resolveDmLabel
src/lib/cleaner.ts           # scan(): keepPinned -> fetch pins once, exclude pinned ts
src/lib/types.ts             # ScanFilters += keepPinned?
src/lib/panelState.ts        # += keepPinned, SET_KEEP_PINNED, SELECT_TARGET
src/content/panel/ConversationPicker.tsx   # NEW: searchable dropdown, progressive DM names
src/content/panel/App.tsx    # mount picker, keep-pinned checkbox, thread keepPinned
src/content/panel/styles.ts  # picker + checkbox styles
tests/slackApi.test.ts       # + usersConversations, pinsList
tests/conversations.test.ts  # NEW
tests/cleaner.test.ts        # + keepPinned; update fakeApi
tests/conversationName.test.ts  # update fake api() helper
tests/panelState.test.ts     # + SET_KEEP_PINNED, SELECT_TARGET
```

---

## Task 1: Slack API — `usersConversations` + `pinsList`

**Files:** Modify `src/lib/slackApi.ts`, `tests/slackApi.test.ts`, `tests/cleaner.test.ts`, `tests/conversationName.test.ts`

> Read `src/lib/slackApi.ts` first. It has `post()`, `postReadJson<T>()`, `toPage()`, the `ConversationInfo`/`UserInfo` interfaces, the `SlackApi` interface, and `createSlackApi`. Adding methods to the `SlackApi` interface will break the two test files that implement a fake `SlackApi`, so this task updates those fakes too.

- [ ] **Step 1: Add the new tests** — APPEND inside the existing `describe("createSlackApi", ...)` in `tests/slackApi.test.ts`:

```ts
  it("posts users.conversations and parses the channels list + cursor", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, channels: [{ id: "C1", name: "general", is_channel: true }], response_metadata: { next_cursor: "cur2" } }),
    );
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    const res = await api.usersConversations({ limit: 100 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/users.conversations");
    expect(String(init.body)).toContain("types=");
    expect(res.conversations).toHaveLength(1);
    expect(res.nextCursor).toBe("cur2");
  });

  it("posts pins.list and returns only message pin timestamps", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, items: [
        { type: "message", message: { ts: "111.0" } },
        { type: "file", file: { id: "F1" } },
        { type: "message", message: { ts: "222.0" } },
      ] }),
    );
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    expect(await api.pinsList("C1")).toEqual(["111.0", "222.0"]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/slackApi.test.ts`
Expected: FAIL — `api.usersConversations`/`api.pinsList` are not functions.

- [ ] **Step 3: Extend `ConversationInfo`** in `src/lib/slackApi.ts` — replace the existing interface with:

```ts
export interface ConversationInfo {
  id?: string;
  name?: string;       // channel/group name (without leading #)
  is_im?: boolean;
  is_mpim?: boolean;
  is_channel?: boolean;
  is_private?: boolean;
  user?: string;       // peer user id (for IMs)
}
```

- [ ] **Step 4: Add two signatures to the `SlackApi` interface** (after the existing `usersInfo(...)` line):

```ts
  usersConversations(opts?: { cursor?: string; types?: string; limit?: number }): Promise<{ conversations: ConversationInfo[]; nextCursor?: string }>;
  pinsList(channel: string): Promise<string[]>;
```

- [ ] **Step 5: Add the two implementations** to the object returned by `createSlackApi` (after the `usersInfo` implementation; mind trailing commas):

```ts
    async usersConversations(opts = {}) {
      const params: Record<string, string> = {
        types: opts.types ?? "public_channel,private_channel,mpim,im",
        exclude_archived: "true",
        limit: String(opts.limit ?? 1000),
      };
      if (opts.cursor) params.cursor = opts.cursor;
      const json = await postReadJson<{ channels?: ConversationInfo[]; response_metadata?: { next_cursor?: string } }>("users.conversations", params);
      return { conversations: json.channels ?? [], nextCursor: json.response_metadata?.next_cursor || undefined };
    },
    async pinsList(channel) {
      const json = await postReadJson<{ items?: Array<{ type?: string; message?: { ts?: string } }> }>("pins.list", { channel });
      return (json.items ?? [])
        .filter((it) => it.type === "message" && it.message?.ts)
        .map((it) => it.message!.ts!);
    },
```

- [ ] **Step 6: Update the fake API in `tests/cleaner.test.ts`** — its `fakeApi()` returns a full `SlackApi`, so add the two new methods to the defaults. Change the object inside `fakeApi` to include:

```ts
    conversationsInfo: async () => ({}),
    usersInfo: async () => ({}),
    usersConversations: async () => ({ conversations: [] }),
    pinsList: async () => [],
```
(Keep the existing `conversationsHistory`/`conversationsReplies`/`chatDelete` entries and the `...over` spread.)

- [ ] **Step 7: Update the fake `api()` helper in `tests/conversationName.test.ts`** the same way — add to its defaults:

```ts
    conversationsInfo: async () => ({}),
    usersInfo: async () => ({}),
    usersConversations: async () => ({ conversations: [] }),
    pinsList: async () => [],
```
(Keep the existing entries + `...over`.)

- [ ] **Step 8: Verify**

Run: `npx vitest run tests/slackApi.test.ts` → the 2 new tests PASS (8 total in that file).
Run: `npx tsc --noEmit` → no errors. Run: `npm test` → all green (38 total: was 36 + 2).

- [ ] **Step 9: Commit**

```bash
git add src/lib/slackApi.ts tests/slackApi.test.ts tests/cleaner.test.ts tests/conversationName.test.ts
git commit -m "feat: add usersConversations and pinsList to Slack API client"
```

---

## Task 2: `conversations.ts` — list & label conversations

**Files:** Create `src/lib/conversations.ts`, `tests/conversations.test.ts`

- [ ] **Step 1: Write the failing test** `tests/conversations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mpimLabel, toOption, listConversations, resolveDmLabel } from "../src/lib/conversations";
import type { SlackApi, ConversationInfo } from "../src/lib/slackApi";

function api(over: Partial<SlackApi> = {}): SlackApi {
  return {
    conversationsHistory: async () => ({ messages: [] }),
    conversationsReplies: async () => ({ messages: [] }),
    chatDelete: async () => ({ ok: true, status: 200 }),
    conversationsInfo: async () => ({}),
    usersInfo: async () => ({}),
    usersConversations: async () => ({ conversations: [] }),
    pinsList: async () => [],
    ...over,
  };
}

describe("mpimLabel", () => {
  it("parses member handles from an mpdm name", () => {
    expect(mpimLabel("mpdm-alice--bob--carol-1")).toBe("alice, bob, carol");
  });
  it("falls back to 'Group message' for unexpected names", () => {
    expect(mpimLabel(undefined)).toBe("Group message");
    expect(mpimLabel("weird")).toBe("Group message");
  });
});

describe("toOption", () => {
  it("labels a channel with a hash", () => {
    expect(toOption({ id: "C1", name: "general", is_channel: true })).toEqual({ id: "C1", type: "channel", label: "#general" });
  });
  it("labels a group DM from its name", () => {
    expect(toOption({ id: "G1", is_mpim: true, name: "mpdm-a--b-1" })).toEqual({ id: "G1", type: "group", label: "a, b" });
  });
  it("marks a DM for later name resolution", () => {
    expect(toOption({ id: "D1", is_im: true, user: "U9" })).toEqual({ id: "D1", type: "dm", label: "Direct message", peerUserId: "U9" });
  });
  it("returns null when there is no id", () => {
    expect(toOption({ name: "x" } as ConversationInfo)).toBeNull();
  });
});

describe("listConversations", () => {
  it("paginates and maps every conversation", async () => {
    const pages = [
      { conversations: [{ id: "C1", name: "general", is_channel: true }], nextCursor: "c2" },
      { conversations: [{ id: "D1", is_im: true, user: "U9" }] },
    ];
    let i = 0;
    const a = api({ usersConversations: async () => pages[i++] });
    const list = await listConversations(a);
    expect(list.map((o) => o.id)).toEqual(["C1", "D1"]);
    expect(list[1].peerUserId).toBe("U9");
  });
});

describe("resolveDmLabel", () => {
  it("prefers display_name, then real_name, then handle", async () => {
    expect(await resolveDmLabel(api({ usersInfo: async () => ({ profile: { display_name: "Alice" } }) }), "U9")).toBe("DM with Alice");
    expect(await resolveDmLabel(api({ usersInfo: async () => ({ real_name: "Bob B" }) }), "U9")).toBe("DM with Bob B");
    expect(await resolveDmLabel(api({ usersInfo: async () => ({ name: "carol" }) }), "U9")).toBe("DM with carol");
  });
  it("falls back to 'Direct message' on error", async () => {
    expect(await resolveDmLabel(api({ usersInfo: async () => { throw new Error("x"); } }), "U9")).toBe("Direct message");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/conversations.test.ts`
Expected: FAIL — cannot find module `../src/lib/conversations`.

- [ ] **Step 3: Create `src/lib/conversations.ts`:**

```ts
import type { SlackApi, ConversationInfo } from "./slackApi";

export type ConversationType = "channel" | "group" | "dm";

export interface ConversationOption {
  id: string;
  type: ConversationType;
  label: string;
  peerUserId?: string; // present for DMs whose name still needs resolving
}

/** Prettify an mpim/group-DM name like "mpdm-alice--bob--carol-1" -> "alice, bob, carol". */
export function mpimLabel(name: string | undefined): string {
  if (!name) return "Group message";
  const m = name.match(/^mpdm-(.+)-\d+$/);
  if (!m) return "Group message";
  const handles = m[1].split("--").filter(Boolean);
  return handles.length ? handles.join(", ") : "Group message";
}

export function toOption(c: ConversationInfo): ConversationOption | null {
  if (!c.id) return null;
  if (c.is_im) return { id: c.id, type: "dm", label: "Direct message", peerUserId: c.user };
  if (c.is_mpim) return { id: c.id, type: "group", label: mpimLabel(c.name) };
  if (c.name) return { id: c.id, type: "channel", label: `#${c.name}` };
  return { id: c.id, type: "channel", label: c.id };
}

export async function listConversations(api: SlackApi): Promise<ConversationOption[]> {
  const out: ConversationOption[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.usersConversations({ cursor });
    for (const c of page.conversations) {
      const opt = toOption(c);
      if (opt) out.push(opt);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function resolveDmLabel(api: SlackApi, peerUserId: string): Promise<string> {
  try {
    const u = await api.usersInfo(peerUserId);
    const name = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
    return name ? `DM with ${name}` : "Direct message";
  } catch {
    return "Direct message";
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/conversations.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Verify whole project** — `npx tsc --noEmit` (clean) and `npm test` (all green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/conversations.ts tests/conversations.test.ts
git commit -m "feat: add conversation listing/labeling helpers"
```

---

## Task 3: `scan()` honors `keepPinned`

**Files:** Modify `src/lib/types.ts`, `src/lib/cleaner.ts`, `tests/cleaner.test.ts`

- [ ] **Step 1: Add `keepPinned` to `ScanFilters`** in `src/lib/types.ts` — change the interface to:

```ts
export interface ScanFilters {
  onlyMine: boolean;   // v1: always true
  afterSec?: number;   // inclusive lower bound (epoch seconds)
  beforeSec?: number;  // inclusive upper bound (epoch seconds)
  keepPinned?: boolean; // when true, pinned messages are excluded from deletion
}
```
(Optional so existing `{ onlyMine: true }` call-sites and tests still type-check.)

- [ ] **Step 2: Add the failing tests** — APPEND inside the existing `describe("scan", ...)` block in `tests/cleaner.test.ts` (the `vi` import already exists later in the file; this block can use it):

```ts
  it("excludes pinned messages when keepPinned is on", async () => {
    const api = fakeApi({
      conversationsHistory: async () => ({ messages: [{ ts: "100.0", user: "U1" }, { ts: "200.0", user: "U1" }] }),
      pinsList: async () => ["100.0"],
    });
    const res = await scan("C1", ctx, { onlyMine: true, keepPinned: true }, deps(api));
    expect(res.tsList).toEqual(["200.0"]);
  });

  it("does not call pins.list when keepPinned is off", async () => {
    const pins = vi.fn(async () => ["100.0"]);
    const api = fakeApi({
      conversationsHistory: async () => ({ messages: [{ ts: "100.0", user: "U1" }] }),
      pinsList: pins,
    });
    const res = await scan("C1", ctx, { onlyMine: true, keepPinned: false }, deps(api));
    expect(pins).not.toHaveBeenCalled();
    expect(res.tsList).toEqual(["100.0"]);
  });
```
Note: `vi` is imported in the runDelete section of this file. If TypeScript complains that `vi` is used before its import (imports hoist in ESM, so this is fine), no action needed.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: FAIL — the keepPinned test deletes "100.0" too (pins not excluded yet).

- [ ] **Step 4: Implement in `src/lib/cleaner.ts`** — in `scan()`, after the `let scanned = 0;` line and before the `let cursor: string | undefined;` history loop, insert:

```ts
  let pinned = new Set<string>();
  if (filters.keepPinned) {
    try {
      await deps.sleep(deps.limiter.reserve());
      pinned = new Set(await deps.api.pinsList(channel));
    } catch {
      pinned = new Set();
    }
  }
```

Then change BOTH `found.add(m.ts)` guards (history loop and replies loop) from:
```ts
      if (matches(m, ctx.userId, filters)) found.add(m.ts);
```
to:
```ts
      if (matches(m, ctx.userId, filters) && !pinned.has(m.ts)) found.add(m.ts);
```
(There are two such lines — the history loop at the `for (const m of page.messages)` and the replies loop. In the replies loop the line is preceded by `if (m.ts === root) continue;` — keep that line, only change the `matches(...)` guard below it.)

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/cleaner.test.ts`
Expected: PASS — all scan + runDelete tests green.

- [ ] **Step 6: Verify whole project** — `npx tsc --noEmit` (clean) and `npm test` (all green).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/cleaner.ts tests/cleaner.test.ts
git commit -m "feat: scan() excludes pinned messages when keepPinned is set"
```

---

## Task 4: Reducer — `keepPinned` + `SELECT_TARGET`

**Files:** Modify `src/lib/panelState.ts`, `tests/panelState.test.ts`

- [ ] **Step 1: Add the failing tests** — APPEND inside the existing `describe("panel reducer", ...)` in `tests/panelState.test.ts`:

```ts
  it("defaults keepPinned to true and toggles it", () => {
    expect(initialState.keepPinned).toBe(true);
    const off = reduce(initialState, { type: "SET_KEEP_PINNED", keepPinned: false });
    expect(off.keepPinned).toBe(false);
  });

  it("selects a new target, resetting scan but keeping filters", () => {
    let s = reduce(initialState, { type: "INIT", channelId: "C1", conversationName: "#a" });
    s = reduce(s, { type: "SET_AFTER", afterSec: 123 });
    s = reduce(s, { type: "SCAN_DONE", total: 9 });
    const sel = reduce(s, { type: "SELECT_TARGET", channelId: "C2", conversationName: "#b" });
    expect(sel.channelId).toBe("C2");
    expect(sel.conversationName).toBe("#b");
    expect(sel.status).toBe("idle");
    expect(sel.scanTotal).toBe(0);
    expect(sel.afterSec).toBe(123);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/panelState.test.ts`
Expected: FAIL — `keepPinned` undefined / `SELECT_TARGET` not handled.

- [ ] **Step 3: Implement in `src/lib/panelState.ts`:**

Add `keepPinned: boolean;` to the `PanelState` interface (after `scanTotal: number;`):
```ts
  scanTotal: number;
  keepPinned: boolean;
```

Add two actions to the `PanelAction` union (before `| { type: "RESET" }`):
```ts
  | { type: "SET_KEEP_PINNED"; keepPinned: boolean }
  | { type: "SELECT_TARGET"; channelId: string; conversationName: string }
```

Add `keepPinned: true,` to `initialState` (after `scanTotal: 0,`):
```ts
  scanTotal: 0,
  keepPinned: true,
```

Add two cases to `reduce` (before `default:`):
```ts
    case "SET_KEEP_PINNED":
      return { ...state, keepPinned: action.keepPinned };
    case "SELECT_TARGET":
      return {
        ...state,
        channelId: action.channelId,
        conversationName: action.conversationName,
        status: "idle",
        error: undefined,
        confirmed: false,
        scanTotal: 0,
        scanProgress: { scanned: 0, found: 0 },
        progress: { deleted: 0, skipped: 0, total: 0, ratePerMin: 0, elapsedMs: 0 },
      };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/panelState.test.ts`
Expected: PASS — all reducer tests green.

- [ ] **Step 5: Verify whole project** — `npx tsc --noEmit` (clean) and `npm test` (all green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/panelState.ts tests/panelState.test.ts
git commit -m "feat: reducer keepPinned default + SELECT_TARGET action"
```

---

## Task 5: `<ConversationPicker>` + panel wiring

**Files:** Create `src/content/panel/ConversationPicker.tsx`; modify `src/content/panel/App.tsx`, `src/content/panel/styles.ts`

> Verified by `npx tsc --noEmit` + `npm run build` here; behavior confirmed in the Task 6 manual e2e.

- [ ] **Step 1: Create `src/content/panel/ConversationPicker.tsx`:**

```tsx
import { useEffect, useState } from "preact/hooks";
import type { SlackApi } from "../../lib/slackApi";
import { RateLimiter } from "../../lib/rateLimiter";
import { listConversations, resolveDmLabel, type ConversationOption } from "../../lib/conversations";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  api: SlackApi;
  selectedId: string | null;
  onSelect: (id: string, label: string) => void;
}

export function ConversationPicker({ api, selectedId, onSelect }: Props) {
  const [options, setOptions] = useState<ConversationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listConversations(api);
        if (cancelled) return;
        setOptions(list);
        setLoading(false);
        const limiter = new RateLimiter();
        for (const opt of list) {
          if (cancelled) return;
          if (opt.type === "dm" && opt.peerUserId) {
            await sleep(limiter.reserve());
            const label = await resolveDmLabel(api, opt.peerUserId);
            if (cancelled) return;
            setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, label } : o)));
          }
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't load your conversations — using the one open in Slack.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div class="picker">
      {error && <p class="picker-error">{error}</p>}
      <input
        class="picker-search"
        type="text"
        placeholder="Search conversations…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <select
        class="picker-select"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = (e.target as HTMLSelectElement).value;
          const o = options.find((x) => x.id === id);
          if (o) onSelect(o.id, o.label);
        }}
      >
        <option value="">{loading ? "Loading conversations…" : "Select a conversation"}</option>
        {filtered.map((o) => <option value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `src/content/panel/App.tsx`.** Read the file first. Make these edits:

(a) Add the import next to the other panel imports:
```ts
import { ConversationPicker } from "./ConversationPicker";
```

(b) Update `filters()` to include keepPinned:
```ts
  function filters(): ScanFilters {
    return { onlyMine: true, afterSec: state.afterSec, beforeSec: state.beforeSec, keepPinned: state.keepPinned };
  }
```

(c) Render the picker + keep-pinned checkbox. Replace this existing block:
```tsx
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
```
with:
```tsx
          {(state.status === "idle" || state.status === "preview") && (
            <>
              {ctxRef.current && (
                <ConversationPicker
                  api={createSlackApi(ctxRef.current)}
                  selectedId={state.channelId}
                  onSelect={(id, label) => dispatch({ type: "SELECT_TARGET", channelId: id, conversationName: label })}
                />
              )}
              <div class="field">
                <label>After (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_AFTER", afterSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Before (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_BEFORE", beforeSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.keepPinned}
                  onInput={(e) => dispatch({ type: "SET_KEEP_PINNED", keepPinned: (e.target as HTMLInputElement).checked })}
                />
                Keep pinned messages (don't delete pinned)
              </label>
              <button class="btn btn-secondary" disabled={!state.channelId} onClick={onScan}>Scan messages</button>
            </>
          )}
```
(Note: the outer guard drops `&& state.channelId` so the picker shows even before a target is chosen; the Scan button is disabled until a conversation is selected.)

- [ ] **Step 3: Add styles** — in `src/content/panel/styles.ts`, insert before the closing `` `; `` (after the `.hint` rule):

```ts
.picker { margin-bottom: 14px; }
.picker-search { width: 100%; padding: 7px 9px; border: 1px solid #cfcfcf; border-radius: 6px; font-size: 13px; margin-bottom: 6px; }
.picker-select { width: 100%; padding: 7px 9px; border: 1px solid #cfcfcf; border-radius: 6px; font-size: 13px; background: #fff; }
.picker-error { font-size: 12px; color: #8b0a2c; margin: 0 0 6px; }
.checkbox-row { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin: 4px 0 8px; color: #1d1c1d; }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all green (unchanged count; no test files touched here).
Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/content/panel/ConversationPicker.tsx src/content/panel/App.tsx src/content/panel/styles.ts
git commit -m "feat: conversation picker dropdown + keep-pinned checkbox in panel"
```

---

## Task 6: Package, manual e2e, integrate

**Files:** none (build + verify + git)

- [ ] **Step 1: Clean build + repackage**

```bash
rm -rf dist bulk-delete-for-slack.zip
npm run build
```
Then (PowerShell): `Compress-Archive -Path dist/* -DestinationPath bulk-delete-for-slack.zip -Force`
Expected: build succeeds; zip regenerated.

- [ ] **Step 2: Manual end-to-end (human)**

1. `chrome://extensions` → **reload ↻** the extension → reload the Slack tab.
2. Open the panel. Confirm:
   - The **dropdown** lists channels (`#name`), group DMs (member names), and DMs ("DM with …" filling in progressively); the **search box** filters it.
   - The conversation currently open in Slack is **pre-selected**.
   - Picking a **different** conversation updates "Cleaning: …" and resets any prior scan.
   - **"Keep pinned messages"** is **checked by default**.
3. Pin one of your test messages in Slack. With keep-pinned ON, **Scan** → that pinned message is **not** counted; uncheck it, Scan again → it **is** counted.
4. Delete a small selection to confirm the end-to-end flow still works.

Report results; paste any page/service-worker console errors.

- [ ] **Step 3: Merge to main + push** (after e2e passes)

```bash
git checkout main
git merge --ff-only feat/picker-keep-pinned
npm test
git branch -d feat/picker-keep-pinned
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Picker data source `users.conversations` → Task 1. ✓
- Channel/group/DM labeling + mpim prettify → Task 2. ✓
- Progressive DM name resolution + search + pre-select + reset-on-select → Tasks 2 (resolve), 4 (SELECT_TARGET reset), 5 (component, pre-select via `selectedId`, search). ✓
- Keep-pinned default ON + pins.list exclusion → Tasks 1 (pinsList), 3 (scan), 4 (reducer default), 5 (checkbox). ✓
- Error handling (picker fallback, pins.list failure → no pins) → Task 5 (picker catch), Task 3 (try/catch around pinsList). ✓
- Tests for all logic units → Tasks 1–4. ✓
- Manual e2e for the component → Task 6. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has concrete code, commands, and expected output.

**Type consistency:** `ConversationOption` shape (`id`/`type`/`label`/`peerUserId`) is identical across Tasks 2 and 5. `usersConversations` returns `{ conversations, nextCursor }` (Task 1) and is consumed that way in `listConversations` (Task 2). `pinsList` returns `string[]` (Task 1), consumed as a ts list in Task 3. `SELECT_TARGET`/`SET_KEEP_PINNED` action shapes match between Task 4 (reducer) and Task 5 (dispatch sites). `ScanFilters.keepPinned` (Task 3) matches `filters()` in Task 5 and the scan tests in Task 3.
