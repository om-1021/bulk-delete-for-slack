import { describe, it, expect } from "vitest";
import { reduce, initialState } from "../src/lib/panelState";

describe("panel reducer", () => {
  it("initializes with the channel and conversation name", () => {
    const s = reduce(initialState, { type: "INIT", channelId: "C1", conversationName: "#general" });
    expect(s.status).toBe("idle");
    expect(s.channelId).toBe("C1");
    expect(s.conversationName).toBe("#general");
  });

  it("moves to preview and records the scan total", () => {
    const scanning = reduce(initialState, { type: "SCAN_START" });
    expect(scanning.status).toBe("scanning");
    const preview = reduce(scanning, { type: "SCAN_DONE", total: 7 });
    expect(preview.status).toBe("preview");
    expect(preview.scanTotal).toBe(7);
    expect(preview.progress.total).toBe(7);
  });

  it("marks stopped with final progress", () => {
    const running = reduce(initialState, { type: "RUN_START" });
    const stopped = reduce(running, {
      type: "RUN_STOPPED",
      progress: { deleted: 3, skipped: 1, total: 7, ratePerMin: 40, elapsedMs: 6000 },
    });
    expect(stopped.status).toBe("stopped");
    expect(stopped.progress.deleted).toBe(3);
  });

  it("captures errors", () => {
    const s = reduce(initialState, { type: "ERROR", message: "boom" });
    expect(s.status).toBe("error");
    expect(s.error).toBe("boom");
  });
});
