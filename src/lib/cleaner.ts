import type { SlackApi } from "./slackApi";
import type { RateLimiter } from "./rateLimiter";
import type {
  CleanerEvent, DeleteProgress, ScanFilters, ScanResult, SlackContext, SlackMessage,
} from "./types";

export interface CleanerDeps {
  api: SlackApi;
  limiter: RateLimiter;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

function matches(msg: SlackMessage, userId: string, filters: ScanFilters): boolean {
  if (filters.onlyMine && msg.user !== userId) return false;
  const sec = Math.floor(Number(msg.ts));
  if (filters.afterSec !== undefined && sec < filters.afterSec) return false;
  if (filters.beforeSec !== undefined && sec > filters.beforeSec) return false;
  return true;
}

export async function scan(
  channel: string,
  ctx: SlackContext,
  filters: ScanFilters,
  deps: CleanerDeps,
): Promise<ScanResult> {
  const found: string[] = [];
  const threadRoots: string[] = [];
  const oldest = filters.afterSec !== undefined ? String(filters.afterSec) : undefined;
  const latest = filters.beforeSec !== undefined ? String(filters.beforeSec) : undefined;

  let cursor: string | undefined;
  do {
    await deps.sleep(deps.limiter.reserve());
    const page = await deps.api.conversationsHistory(channel, { cursor, oldest, latest, limit: 200 });
    for (const m of page.messages) {
      if (matches(m, ctx.userId, filters)) found.push(m.ts);
      if ((m.reply_count ?? 0) > 0) threadRoots.push(m.ts);
    }
    cursor = page.nextCursor;
  } while (cursor);

  for (const root of threadRoots) {
    let rc: string | undefined;
    do {
      await deps.sleep(deps.limiter.reserve());
      const page = await deps.api.conversationsReplies(channel, root, { cursor: rc, limit: 200 });
      for (const m of page.messages) {
        if (m.ts === root) continue; // root already handled by history pass
        if (matches(m, ctx.userId, filters)) found.push(m.ts);
      }
      rc = page.nextCursor;
    } while (rc);
  }

  const tsList = Array.from(new Set(found));
  return { channelId: channel, tsList, total: tsList.length };
}

// CleanerEvent and DeleteProgress are used by runDelete (Task 8, appended to this file).
// Keeping imports here to satisfy that future dependency.
export type { CleanerEvent, DeleteProgress };
