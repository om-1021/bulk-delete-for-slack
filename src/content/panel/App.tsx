import { useEffect, useReducer, useRef } from "preact/hooks";
import { reduce, initialState } from "../../lib/panelState";
import { readSlackContext, readActiveChannelId, TokenNotFoundError } from "../../lib/slackToken";
import { createSlackApi } from "../../lib/slackApi";
import { RateLimiter } from "../../lib/rateLimiter";
import { scan, runDelete, type CleanerDeps } from "../../lib/cleaner";
import { resolveConversationName } from "../../lib/conversationName";
import type { ScanFilters, ScanResult, SlackContext } from "../../lib/types";
import { PANEL_CSS } from "./styles";
import { ConversationPicker } from "./ConversationPicker";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function dateToSec(value: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

export function App({ onClose }: { onClose: () => void }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const ctxRef = useRef<SlackContext | null>(null);
  const scanRef = useRef<ScanResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const ctx = readSlackContext();
      ctxRef.current = ctx;
      const channelId = readActiveChannelId(location.pathname);
      dispatch({ type: "INIT", channelId, conversationName: channelId ?? "" });
      if (!channelId) dispatch({ type: "ERROR", message: "Open a DM, group, or channel first." });
      if (channelId) {
        resolveConversationName(channelId, createSlackApi(ctx)).then((name) =>
          dispatch({ type: "SET_CONVERSATION_NAME", conversationName: name }),
        );
      }
    } catch (e) {
      dispatch({
        type: "ERROR",
        message: e instanceof TokenNotFoundError ? e.message : "Could not read your Slack session — reload Slack.",
      });
    }
  }, []);

  function buildDeps(): CleanerDeps {
    return { api: createSlackApi(ctxRef.current!), limiter: new RateLimiter(), sleep, now: () => Date.now() };
  }
  function filters(): ScanFilters {
    return { onlyMine: true, afterSec: state.afterSec, beforeSec: state.beforeSec, keepPinned: state.keepPinned };
  }

  async function onScan() {
    if (!ctxRef.current || !state.channelId) return;
    dispatch({ type: "SCAN_START" });
    try {
      const result = await scan(state.channelId, ctxRef.current, filters(), buildDeps(), (p) =>
        dispatch({ type: "SCAN_PROGRESS", scanned: p.scanned, found: p.found }),
      );
      scanRef.current = result;
      dispatch({ type: "SCAN_DONE", total: result.total });
    } catch {
      dispatch({ type: "ERROR", message: "Could not scan messages — reload Slack and try again." });
    }
  }

  async function onDelete() {
    if (!ctxRef.current || !scanRef.current) return;
    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({ type: "RUN_START" });
    let errored = false;
    const final = await runDelete(scanRef.current, ctxRef.current, buildDeps(), (e) => {
      if (e.type === "progress") dispatch({ type: "PROGRESS", progress: e.progress });
      else if (e.type === "error") { errored = true; dispatch({ type: "ERROR", message: e.message }); }
    }, ac.signal);
    if (!errored) {
      dispatch(ac.signal.aborted ? { type: "RUN_STOPPED", progress: final } : { type: "RUN_DONE", progress: final });
    }
  }

  const pct = state.progress.total
    ? Math.round(((state.progress.deleted + state.progress.skipped) / state.progress.total) * 100)
    : 0;

  return (
    <div>
      <style>{PANEL_CSS}</style>
      <div class="panel">
        <div class="header">
          <h1>Bulk Delete for Slack</h1>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div class="body">
          {state.status === "error" && <div class="error">{state.error}</div>}

          {state.channelId && (
            <p class="target">Cleaning: <b>{state.conversationName}</b><br />Only messages sent by you.</p>
          )}

          {ctxRef.current && (
            <div hidden={!(state.status === "idle" || state.status === "preview")}>
              <ConversationPicker
                api={createSlackApi(ctxRef.current)}
                selectedId={state.channelId}
                onSelect={(id, label) => dispatch({ type: "SELECT_TARGET", channelId: id, conversationName: label })}
              />
            </div>
          )}

          {(state.status === "idle" || state.status === "preview") && (
            <>
              <div class="field">
                <label>After (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_AFTER", afterSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Before (optional)</label>
                <input type="date" onInput={(e) => dispatch({ type: "SET_BEFORE", beforeSec: dateToSec((e.target as HTMLInputElement).value) })} />
              </div>
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.keepPinned}
                  onInput={(e) => dispatch({ type: "SET_KEEP_PINNED", keepPinned: (e.target as HTMLInputElement).checked })}
                />
                Keep pinned messages (don't delete pinned)
              </label>
              <button class="btn btn-secondary" disabled={!state.channelId} onClick={onScan}>Scan messages</button>
            </>
          )}

          {state.status === "scanning" && (
            <div class="scanning">
              <div class="spinner" />
              <p class="scan-line">
                <b>Scanning…</b> checked {state.scanProgress.scanned} message{state.scanProgress.scanned === 1 ? "" : "s"} so far
                {state.scanProgress.found > 0 ? `, found ${state.scanProgress.found} of yours` : ""}.
              </p>
              <p class="hint">
                This can take a few minutes for long conversations. Please keep this tab open.
              </p>
            </div>
          )}

          {state.status === "preview" && (
            <>
              <div class="count">Found {state.scanTotal} of your messages</div>
              {state.scanTotal > 0 && (
                <>
                  <label class="confirm">
                    <input type="checkbox" checked={state.confirmed}
                      onInput={(e) => dispatch({ type: "SET_CONFIRMED", confirmed: (e.target as HTMLInputElement).checked })} />
                    I understand this permanently deletes these messages.
                  </label>
                  <button class="btn btn-danger" disabled={!state.confirmed} onClick={onDelete}>
                    Delete {state.scanTotal} messages
                  </button>
                </>
              )}
            </>
          )}

          {state.status === "running" && (
            <>
              <div class="progress-wrap"><div class="progress-bar" style={{ width: `${pct}%` }} /></div>
              <div class="stats">
                <span>Deleted {state.progress.deleted} / {state.progress.total}</span>
                <span>{Math.round(state.progress.ratePerMin)}/min</span>
              </div>
              <button class="btn btn-danger" onClick={() => abortRef.current?.abort()}>Stop</button>
            </>
          )}

          {(state.status === "done" || state.status === "stopped") && (
            <>
              <div class="count">{state.status === "done" ? "Done" : "Stopped"}</div>
              <div class="stats">
                <span>Deleted {state.progress.deleted}</span>
                <span>Skipped {state.progress.skipped}</span>
              </div>
              <button class="btn btn-secondary" onClick={() => dispatch({ type: "RESET" })}>Start over</button>
            </>
          )}

          <p class="note">
            Free · runs entirely in your browser · nothing is sent to any server.
            Deletes only messages sent by you. Deletion is permanent.
          </p>
        </div>
      </div>
    </div>
  );
}
