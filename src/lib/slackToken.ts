import type { SlackContext } from "./types";

export class TokenNotFoundError extends Error {}

interface MinimalWindow {
  localStorage: Pick<Storage, "getItem">;
  location: { origin: string };
}

interface TeamConfig {
  token?: string;
  user_id?: string;
}
interface LocalConfig {
  lastActiveTeamId?: string;
  teams?: Record<string, TeamConfig>;
}

export function readSlackContext(win: MinimalWindow = window): SlackContext {
  const raw = win.localStorage.getItem("localConfig_v2");
  if (!raw) throw new TokenNotFoundError("Open and log into Slack first.");

  let cfg: LocalConfig;
  try {
    cfg = JSON.parse(raw) as LocalConfig;
  } catch {
    throw new TokenNotFoundError("Could not read your Slack session — reload Slack.");
  }

  const teamId = cfg.lastActiveTeamId ?? Object.keys(cfg.teams ?? {})[0];
  const team = teamId ? cfg.teams?.[teamId] : undefined;
  if (!team?.token) throw new TokenNotFoundError("No Slack session found — open and log into Slack first.");

  return {
    token: team.token,
    userId: team.user_id ?? "",
    teamId: teamId!,
    apiBase: win.location.origin,
  };
}

export function readActiveChannelId(pathname: string): string | null {
  const seg = pathname.split("/").find((s) => /^[CDG][A-Z0-9]{6,}$/.test(s));
  return seg ?? null;
}
