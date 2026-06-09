import type { DeleteProgress } from "./types";

export type PanelStatus =
  | "idle" | "scanning" | "preview" | "running" | "stopped" | "done" | "error";

export interface PanelState {
  status: PanelStatus;
  conversationName: string;
  channelId: string | null;
  afterSec?: number;
  beforeSec?: number;
  confirmed: boolean;
  scanTotal: number;
  keepPinned: boolean;
  scanProgress: { scanned: number; found: number };
  progress: DeleteProgress;
  error?: string;
}

export type PanelAction =
  | { type: "INIT"; channelId: string | null; conversationName: string }
  | { type: "SET_AFTER"; afterSec?: number }
  | { type: "SET_BEFORE"; beforeSec?: number }
  | { type: "SET_CONFIRMED"; confirmed: boolean }
  | { type: "SCAN_START" }
  | { type: "SCAN_PROGRESS"; scanned: number; found: number }
  | { type: "SCAN_DONE"; total: number }
  | { type: "RUN_START" }
  | { type: "PROGRESS"; progress: DeleteProgress }
  | { type: "RUN_DONE"; progress: DeleteProgress }
  | { type: "RUN_STOPPED"; progress: DeleteProgress }
  | { type: "ERROR"; message: string }
  | { type: "SET_KEEP_PINNED"; keepPinned: boolean }
  | { type: "SELECT_TARGET"; channelId: string; conversationName: string }
  | { type: "RESET" }
  | { type: "SET_CONVERSATION_NAME"; conversationName: string };

export const initialState: PanelState = {
  status: "idle",
  conversationName: "",
  channelId: null,
  confirmed: false,
  scanTotal: 0,
  keepPinned: true,
  scanProgress: { scanned: 0, found: 0 },
  progress: { deleted: 0, skipped: 0, total: 0, ratePerMin: 0, elapsedMs: 0 },
};

export function reduce(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "INIT":
      return { ...initialState, channelId: action.channelId, conversationName: action.conversationName };
    case "SET_AFTER":
      return { ...state, afterSec: action.afterSec };
    case "SET_BEFORE":
      return { ...state, beforeSec: action.beforeSec };
    case "SET_CONFIRMED":
      return { ...state, confirmed: action.confirmed };
    case "SCAN_START":
      return { ...state, status: "scanning", error: undefined, scanProgress: { scanned: 0, found: 0 } };
    case "SCAN_PROGRESS":
      return { ...state, scanProgress: { scanned: action.scanned, found: action.found } };
    case "SCAN_DONE":
      return { ...state, status: "preview", scanTotal: action.total, progress: { ...state.progress, total: action.total } };
    case "RUN_START":
      return { ...state, status: "running" };
    case "PROGRESS":
      return { ...state, progress: action.progress };
    case "RUN_DONE":
      return { ...state, status: "done", progress: action.progress };
    case "RUN_STOPPED":
      return { ...state, status: "stopped", progress: action.progress };
    case "ERROR":
      return { ...state, status: "error", error: action.message };
    case "RESET":
      return { ...initialState, channelId: state.channelId, conversationName: state.conversationName };
    case "SET_CONVERSATION_NAME":
      return { ...state, conversationName: action.conversationName };
    case "SET_KEEP_PINNED":
      return { ...state, keepPinned: action.keepPinned };
    case "SELECT_TARGET":
      return {
        ...state,
        channelId: action.channelId,
        conversationName: action.conversationName,
        status: "idle",
        error: undefined,
        confirmed: false,
        scanTotal: 0,
        scanProgress: { scanned: 0, found: 0 },
        progress: { deleted: 0, skipped: 0, total: 0, ratePerMin: 0, elapsedMs: 0 },
      };
    default:
      return state;
  }
}
