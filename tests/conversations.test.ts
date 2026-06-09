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
    savedList: async () => [],
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
