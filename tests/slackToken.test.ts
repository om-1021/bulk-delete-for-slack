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
