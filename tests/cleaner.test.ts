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
