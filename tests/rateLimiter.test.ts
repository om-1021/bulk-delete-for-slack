import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/lib/rateLimiter";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("RateLimiter", () => {
  it("allows the first request immediately", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    expect(rl.reserve()).toBe(0);
  });

  it("spaces consecutive requests by minIntervalMs", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.reserve();                       // reserves slot, nextAllowed -> 1000
    expect(rl.reserve()).toBe(1000);    // still t=0, must wait 1000ms
  });

  it("returns zero wait once enough time has elapsed", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.reserve();
    c.advance(1000);
    expect(rl.reserve()).toBe(0);
  });

  it("delays the next slot after penalize()", () => {
    const c = clock();
    const rl = new RateLimiter({ minIntervalMs: 1000, now: c.now });
    rl.penalize(5000);
    expect(rl.reserve()).toBe(5000);
  });
});
