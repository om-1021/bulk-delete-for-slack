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

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
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

  it("posts conversations.info and returns the channel object", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, channel: { id: "D1", is_im: true, user: "U9" } }));
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    const info = await api.conversationsInfo("D1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/conversations.info");
    expect(String(init.body)).toContain("channel=D1");
    expect(info).toEqual({ id: "D1", is_im: true, user: "U9" });
  });

  it("posts users.info and returns the user object", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, user: { id: "U9", name: "alice", profile: { display_name: "Alice" } } }));
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    const u = await api.usersInfo("U9");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/users.info");
    expect(String(init.body)).toContain("user=U9");
    expect(u.profile?.display_name).toBe("Alice");
  });

  it("retries a read after a 429 then succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "0" } })
        : jsonResponse({ ok: true, messages: [{ ts: "1.0", user: "U1" }] });
    });
    const noSleep = async () => {};
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch, noSleep);
    const page = await api.conversationsHistory("C1");
    expect(calls).toBe(2);
    expect(page.messages).toHaveLength(1);
  });

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

  it("posts saved.list and returns message saved items as {channel, ts}", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, saved_items: [
        { item_id: "D1", item_type: "message", ts: "111.0" },
        { item_id: "C9", item_type: "message", ts: "222.0" },
        { item_id: "F1", item_type: "file" },
      ] }),
    );
    const api = createSlackApi(ctx, fetchMock as unknown as typeof fetch);
    const res = await api.savedList();
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.slack.com/api/saved.list");
    expect(res).toEqual([{ channel: "D1", ts: "111.0" }, { channel: "C9", ts: "222.0" }]);
  });
});
