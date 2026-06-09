import type { SlackApi } from "./slackApi";

/** Resolve a Slack conversation id to a human-friendly label, falling back to the id. */
export async function resolveConversationName(channelId: string, api: SlackApi): Promise<string> {
  try {
    const info = await api.conversationsInfo(channelId);
    if (info.is_mpim) return "Group message";
    if (info.is_im && info.user) {
      const u = await api.usersInfo(info.user);
      const name = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
      return name ? `DM with ${name}` : "Direct message";
    }
    if (info.name) return `#${info.name}`;
    return channelId;
  } catch {
    return channelId;
  }
}
