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
