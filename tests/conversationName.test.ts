import { describe, it, expect } from "vitest";
import { resolveConversationName } from "../src/lib/conversationName";
import type { SlackApi } from "../src/lib/slackApi";

function api(over: Partial<SlackApi>): SlackApi {
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

describe("resolveConversationName", () => {
  it("labels a DM with the peer's display name", async () => {
    const a = api({
      conversationsInfo: async () => ({ is_im: true, user: "U9" }),
      usersInfo: async () => ({ profile: { display_name: "Alice" } }),
    });
    expect(await resolveConversationName("D1", a)).toBe("DM with Alice");
  });

  it("falls back through real_name then handle for a DM", async () => {
    const a = api({
      conversationsInfo: async () => ({ is_im: true, user: "U9" }),
      usersInfo: async () => ({ name: "alice" }),
    });
    expect(await resolveConversationName("D1", a)).toBe("DM with alice");
  });

  it("labels a channel with a leading hash", async () => {
    const a = api({ conversationsInfo: async () => ({ name: "general" }) });
    expect(await resolveConversationName("C1", a)).toBe("#general");
  });

  it("labels a group DM generically", async () => {
    const a = api({ conversationsInfo: async () => ({ is_mpim: true, name: "mpdm-a--b--c-1" }) });
    expect(await resolveConversationName("G1", a)).toBe("Group message");
  });

  it("falls back to the channel id if lookup throws", async () => {
    const a = api({ conversationsInfo: async () => { throw new Error("boom"); } });
    expect(await resolveConversationName("D1", a)).toBe("D1");
  });
});
