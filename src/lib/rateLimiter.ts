export interface RateLimiterOptions {
  minIntervalMs?: number;
  now?: () => number;
}

export class RateLimiter {
  private minIntervalMs: number;
  private now: () => number;
  private nextAllowed = 0;

  constructor(opts: RateLimiterOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 1100;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Reserve the next slot; returns ms the caller must wait before sending. */
  reserve(): number {
    const t = this.now();
    const wait = Math.max(0, this.nextAllowed - t);
    this.nextAllowed = Math.max(t, this.nextAllowed) + this.minIntervalMs;
    return wait;
  }

  /** Record a rate-limit response; push the next slot out by retryAfterMs. */
  penalize(retryAfterMs: number): void {
    const t = this.now();
    this.nextAllowed = Math.max(this.nextAllowed, t + retryAfterMs);
  }
}
