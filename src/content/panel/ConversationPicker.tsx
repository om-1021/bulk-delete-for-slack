import { useEffect, useState } from "preact/hooks";
import type { SlackApi } from "../../lib/slackApi";
import { RateLimiter } from "../../lib/rateLimiter";
import { listConversations, resolveDmLabel, type ConversationOption } from "../../lib/conversations";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  api: SlackApi;
  selectedId: string | null;
  onSelect: (id: string, label: string) => void;
}

export function ConversationPicker({ api, selectedId, onSelect }: Props) {
  const [options, setOptions] = useState<ConversationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listConversations(api);
        if (cancelled) return;
        setOptions(list);
        setLoading(false);
        const limiter = new RateLimiter();
        for (const opt of list) {
          if (cancelled) return;
          if (opt.type === "dm" && opt.peerUserId) {
            await sleep(limiter.reserve());
            const label = await resolveDmLabel(api, opt.peerUserId);
            if (cancelled) return;
            setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, label } : o)));
          }
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't load your conversations — using the one open in Slack.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div class="picker">
      {error && <p class="picker-error">{error}</p>}
      <input
        class="picker-search"
        type="text"
        placeholder="Search conversations…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <select
        class="picker-select"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = (e.target as HTMLSelectElement).value;
          const o = options.find((x) => x.id === id);
          if (o) onSelect(o.id, o.label);
        }}
      >
        <option value="">{loading ? "Loading conversations…" : "Select a conversation"}</option>
        {filtered.map((o) => <option value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
