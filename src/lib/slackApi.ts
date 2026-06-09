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

export interface ConversationInfo {
  id?: string;
  name?: string;       // channel/group name (without leading #)
  is_im?: boolean;
  is_mpim?: boolean;
  is_channel?: boolean;
  is_private?: boolean;
  user?: string;       // peer user id (for IMs)
}

export interface UserInfo {
  id?: string;
  name?: string;                                   // handle
  real_name?: string;
  profile?: { display_name?: string; real_name?: string };
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
  conversationsInfo(channel: string): Promise<ConversationInfo>;
  usersInfo(user: string): Promise<UserInfo>;
  usersConversations(opts?: { cursor?: string; types?: string; limit?: number }): Promise<{ conversations: ConversationInfo[]; nextCursor?: string }>;
  pinsList(channel: string): Promise<string[]>;
}

export function createSlackApi(
  ctx: SlackContext,
  fetchImpl: typeof fetch = fetch,
  sleepImpl: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): SlackApi {
  async function post(method: string, params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams({ token: ctx.token, ...params });
    return fetchImpl(`${ctx.apiBase}/api/${method}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  async function postReadJson<T>(method: string, params: Record<string, string>, attempt = 0): Promise<T> {
    const res = await post(method, params);
    if (res.status === 429 && attempt < 3) {
      const ra = Number(res.headers.get("Retry-After") ?? "1");
      await sleepImpl((Number.isFinite(ra) ? ra : 1) * 1000);
      return postReadJson<T>(method, params, attempt + 1);
    }
    return (await res.json()) as T;
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
      return toPage(await postReadJson<{ messages?: SlackMessage[]; response_metadata?: { next_cursor?: string } }>("conversations.history", params));
    },
    async conversationsReplies(channel, ts, opts = {}) {
      const params: Record<string, string> = { channel, ts, limit: String(opts.limit ?? 200) };
      if (opts.cursor) params.cursor = opts.cursor;
      return toPage(await postReadJson<{ messages?: SlackMessage[]; response_metadata?: { next_cursor?: string } }>("conversations.replies", params));
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
    async conversationsInfo(channel) {
      const json = await postReadJson<{ channel?: ConversationInfo }>("conversations.info", { channel });
      return json.channel ?? {};
    },
    async usersInfo(user) {
      const json = await postReadJson<{ user?: UserInfo }>("users.info", { user });
      return json.user ?? {};
    },
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
  };
}
