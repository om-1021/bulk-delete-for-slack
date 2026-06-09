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
