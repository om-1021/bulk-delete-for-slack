export interface SlackContext {
  token: string;   // xoxc-...
  userId: string;  // U...
  teamId: string;  // T...
  apiBase: string; // origin for /api calls, e.g. "https://app.slack.com"
}

export interface SlackMessage {
  ts: string;
  user?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
}

export interface ScanFilters {
  onlyMine: boolean;   // v1: always true
  afterSec?: number;   // inclusive lower bound (epoch seconds)
  beforeSec?: number;  // inclusive upper bound (epoch seconds)
  keepPinned?: boolean; // when true, pinned messages are excluded from deletion
}

export interface ScanResult {
  channelId: string;
  tsList: string[];
  total: number;
}

export interface DeleteProgress {
  deleted: number;
  skipped: number;
  total: number;
  ratePerMin: number;
  elapsedMs: number;
  lastError?: string;
}

export type CleanerEvent =
  | { type: "progress"; progress: DeleteProgress }
  | { type: "done"; progress: DeleteProgress }
  | { type: "stopped"; progress: DeleteProgress }
  | { type: "error"; message: string };
