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

export interface ScanProgress {
  scanned: number; // messages checked so far
  found: number; // of those, how many are the user's (will be deleted)
}

export async function scan(
  channel: string,
  ctx: SlackContext,
  filters: ScanFilters,
  deps: CleanerDeps,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const found = new Set<string>();
  const threadRoots: string[] = [];
  const oldest = filters.afterSec !== undefined ? String(filters.afterSec) : undefined;
  const latest = filters.beforeSec !== undefined ? String(filters.beforeSec) : undefined;
  let scanned = 0;

  let cursor: string | undefined;
  do {
    await deps.sleep(deps.limiter.reserve());
    const page = await deps.api.conversationsHistory(channel, { cursor, oldest, latest, limit: 200 });
    for (const m of page.messages) {
      if (matches(m, ctx.userId, filters)) found.add(m.ts);
      if ((m.reply_count ?? 0) > 0) threadRoots.push(m.ts);
    }
    scanned += page.messages.length;
    onProgress?.({ scanned, found: found.size });
    cursor = page.nextCursor;
  } while (cursor);

  for (const root of threadRoots) {
    let rc: string | undefined;
    do {
      await deps.sleep(deps.limiter.reserve());
      const page = await deps.api.conversationsReplies(channel, root, { cursor: rc, limit: 200 });
      for (const m of page.messages) {
        if (m.ts === root) continue; // root already handled by history pass
        if (matches(m, ctx.userId, filters)) found.add(m.ts);
      }
      scanned += page.messages.length;
      onProgress?.({ scanned, found: found.size });
      rc = page.nextCursor;
    } while (rc);
  }

  const tsList = Array.from(found);
  return { channelId: channel, tsList, total: tsList.length };
}

export async function runDelete(
  scanResult: ScanResult,
  _ctx: SlackContext,
  deps: CleanerDeps,
  onEvent: (e: CleanerEvent) => void,
  signal: AbortSignal,
): Promise<DeleteProgress> {
  const start = deps.now();
  const progress: DeleteProgress = {
    deleted: 0, skipped: 0, total: scanResult.total, ratePerMin: 0, elapsedMs: 0,
  };

  const finish = (type: "done" | "stopped"): DeleteProgress => {
    progress.elapsedMs = deps.now() - start;
    onEvent({ type, progress: { ...progress } });
    return { ...progress };
  };

  for (const ts of scanResult.tsList) {
    if (signal.aborted) return finish("stopped");

    let attempts = 0;
    for (;;) {
      if (signal.aborted) return finish("stopped");
      await deps.sleep(deps.limiter.reserve());
      const out = await deps.api.chatDelete(scanResult.channelId, ts);

      if (out.ok) { progress.deleted++; break; }

      if (out.status === 429 && attempts < 5) {
        deps.limiter.penalize(out.retryAfterMs ?? 1000);
        attempts++;
        continue;
      }

      if (out.error === "invalid_auth" || out.error === "token_revoked") {
        progress.lastError = out.error;
        onEvent({ type: "error", message: "Slack session expired — reload Slack and try again." });
        return finish("stopped");
      }

      // message_not_found / cant_delete_message / compliance_exports_enabled / attempts exhausted
      progress.skipped++;
      progress.lastError = out.error;
      break;
    }

    progress.elapsedMs = deps.now() - start;
    const mins = progress.elapsedMs / 60000;
    progress.ratePerMin = mins > 0 ? (progress.deleted + progress.skipped) / mins : 0;
    onEvent({ type: "progress", progress: { ...progress } });
  }

  return finish("done");
}

