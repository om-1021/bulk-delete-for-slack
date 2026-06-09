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

  it("updates the conversation name without changing status", () => {
    const initd = reduce(initialState, { type: "INIT", channelId: "D1", conversationName: "D1" });
    const named = reduce(initd, { type: "SET_CONVERSATION_NAME", conversationName: "DM with Alice" });
    expect(named.conversationName).toBe("DM with Alice");
    expect(named.status).toBe("idle");
  });

  it("tracks scan progress and resets it on a new scan", () => {
    const scanning = reduce(initialState, { type: "SCAN_START" });
    expect(scanning.scanProgress).toEqual({ scanned: 0, found: 0 });
    const progressed = reduce(scanning, { type: "SCAN_PROGRESS", scanned: 200, found: 12 });
    expect(progressed.scanProgress).toEqual({ scanned: 200, found: 12 });
    expect(progressed.status).toBe("scanning");
    const rescan = reduce(progressed, { type: "SCAN_START" });
    expect(rescan.scanProgress).toEqual({ scanned: 0, found: 0 });
  });

  it("defaults keepPinned to true and toggles it", () => {
    expect(initialState.keepPinned).toBe(true);
    const off = reduce(initialState, { type: "SET_KEEP_PINNED", keepPinned: false });
    expect(off.keepPinned).toBe(false);
  });

  it("selects a new target, resetting scan but keeping filters", () => {
    let s = reduce(initialState, { type: "INIT", channelId: "C1", conversationName: "#a" });
    s = reduce(s, { type: "SET_AFTER", afterSec: 123 });
    s = reduce(s, { type: "SCAN_DONE", total: 9 });
    const sel = reduce(s, { type: "SELECT_TARGET", channelId: "C2", conversationName: "#b" });
    expect(sel.channelId).toBe("C2");
    expect(sel.conversationName).toBe("#b");
    expect(sel.status).toBe("idle");
    expect(sel.scanTotal).toBe(0);
    expect(sel.afterSec).toBe(123);
  });
});
