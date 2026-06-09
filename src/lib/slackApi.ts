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
