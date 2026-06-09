import type { SlackApi, ConversationInfo } from "./slackApi";

export type ConversationType = "channel" | "group" | "dm";

export interface ConversationOption {
  id: string;
  type: ConversationType;
  label: string;
  peerUserId?: string; // present for DMs whose name still needs resolving
}

/** Prettify an mpim/group-DM name like "mpdm-alice--bob--carol-1" -> "alice, bob, carol". */
export function mpimLabel(name: string | undefined): string {
  if (!name) return "Group message";
  const m = name.match(/^mpdm-(.+)-\d+$/);
  if (!m) return "Group message";
  const handles = m[1].split("--").filter(Boolean);
  return handles.length ? handles.join(", ") : "Group message";
}

export function toOption(c: ConversationInfo): ConversationOption | null {
  if (!c.id) return null;
  if (c.is_im) return { id: c.id, type: "dm", label: "Direct message", peerUserId: c.user };
  if (c.is_mpim) return { id: c.id, type: "group", label: mpimLabel(c.name) };
  if (c.name) return { id: c.id, type: "channel", label: `#${c.name}` };
  return { id: c.id, type: "channel", label: c.id };
}

export async function listConversations(api: SlackApi): Promise<ConversationOption[]> {
  const out: ConversationOption[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.usersConversations({ cursor });
    for (const c of page.conversations) {
      const opt = toOption(c);
      if (opt) out.push(opt);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function resolveDmLabel(api: SlackApi, peerUserId: string): Promise<string> {
  try {
    const u = await api.usersInfo(peerUserId);
    const name = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
    return name ? `DM with ${name}` : "Direct message";
  } catch {
    return "Direct message";
  }
}
