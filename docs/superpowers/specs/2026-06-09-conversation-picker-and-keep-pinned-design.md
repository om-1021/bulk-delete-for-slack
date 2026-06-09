# Conversation Picker + Keep-Pinned — Design Spec

> Two enhancements to the existing "Free Bulk Delete for Slack" extension: (1) a
> dropdown to pick any of the user's channels/DMs/group-DMs to clean (instead of only
> the currently-open one), and (2) a "Keep pinned messages" option that excludes pinned
> messages from deletion.

- **Date:** 2026-06-09
- **Status:** Approved design → ready for implementation planning
- **Builds on:** the shipped MVP (repo: github.com/om-1021/bulk-delete-for-slack)

## 1. Feature: Conversation picker

### Goal
Let the user select **any** conversation they belong to from a dropdown at the top of the
panel, rather than having to open it in Slack first. The conversation currently open in
Slack is **pre-selected by default**; the user can switch to any other.

### Data source
Slack web API `users.conversations` (the calling user's own conversations), called with
the existing session token:
- Params: `types=public_channel,private_channel,mpim,im`, `exclude_archived=true`,
  `limit=1000`, cursor pagination (`response_metadata.next_cursor`). Response list is in
  the `channels` field.

### Labeling rules
- **Channel** (public/private) → `#${name}` (name is in the response — instant).
- **Group DM** (`is_mpim`) → parse the group's `name` (`mpdm-alice--bob--carol-1`):
  strip the `mpdm-` prefix and `-N` suffix, split on `--`, join with ", " →
  "alice, bob, carol". **No extra API calls.** Fallback to "Group message" if parsing
  fails.
- **DM** (`is_im`) → the response gives only the peer's `user` id. The name is resolved
  with one `users.info` call per DM, **progressively** (see below) → "DM with {name}".

### Progressive loading (the chosen UX)
1. On panel open, call `users.conversations` (paginated) and build the option list.
2. Render the dropdown immediately: channels and group DMs are labeled; DMs show a
   placeholder ("Loading…").
3. Resolve DM peer names asynchronously, throttled through a `RateLimiter` (its own
   instance, separate from the scan/delete limiter), updating each DM's label as it
   resolves. The list stays usable throughout — a channel can be picked before DM names
   finish.
4. A **search box** filters options by label (case-insensitive substring).

### Pre-selection
On open, detect the currently-open conversation via `readActiveChannelId(location.pathname)`.
If found and present in the list, pre-select it; otherwise leave nothing selected (user
picks). Selecting an option sets the target (channelId + label) and **resets any prior
scan** back to the idle state (clears scan total, confirmation, progress) while keeping
the date and keep-pinned filters.

### Rejected alternative
Bulk-fetching the whole workspace via `users.list` to name DMs: fewer calls only on tiny
workspaces, but downloads thousands of members on large ones. Per-DM progressive
resolution scales better and was the user's choice.

## 2. Feature: Keep-pinned filter

### Goal
A **"Keep pinned messages"** checkbox in the filters, **default ON**, so by default
pinned messages are skipped and only non-pinned messages are deleted. Unchecking it
deletes pinned messages too.

### Mechanism
When `keepPinned` is on, `scan()` fetches the conversation's pins once via `pins.list`
(before paging history), builds a `Set` of pinned message timestamps, and excludes any
message whose `ts` is in that set. Applies to thread replies as well. `pins.list` returns
mixed item types; only `type: "message"` items contribute a `message.ts`.

## 3. Components / files

- **`src/lib/slackApi.ts`** — add:
  - `usersConversations(opts): Promise<{ conversations: ConversationInfo[]; nextCursor?: string }>`
  - `pinsList(channel: string): Promise<string[]>` (pinned message timestamps)
  - extend `ConversationInfo` with `is_channel?`, `is_private?` (for type detection).
- **`src/lib/conversations.ts`** *(new)* — `listConversations(api)` → paginates and
  returns `ConversationOption[]` (`{ id, type: 'channel'|'group'|'dm', label, peerUserId? }`)
  with channels/groups labeled and DMs left for resolution; `resolveDmLabel(api, peerUserId)`
  → "DM with {name}"; `mpimLabel(name)` → prettified group label. Pure, unit-tested with a
  mocked API.
- **`src/lib/cleaner.ts`** — `scan()` gains `keepPinned` handling: fetch pins once when on,
  exclude pinned ts. (Implemented via the existing `ScanFilters`.)
- **`src/lib/types.ts`** — `ScanFilters` gains `keepPinned: boolean`.
- **`src/lib/panelState.ts`** — add `keepPinned: boolean` (default `true`) +
  `SET_KEEP_PINNED`, and `SELECT_TARGET { channelId, conversationName }` (sets target,
  resets scan state, keeps filters).
- **`src/content/panel/ConversationPicker.tsx`** *(new)* — loads the list, resolves DM
  names progressively, renders a searchable dropdown, calls `onSelect(channelId, label)`.
- **`src/content/panel/App.tsx`** — mount the picker (pre-select current conversation),
  add the keep-pinned checkbox to the filters, thread `keepPinned` into `filters()`.
- **`src/content/panel/styles.ts`** — styles for the picker + checkbox.

## 4. Data flow

1. Panel opens → read Slack context (existing) → mount `<ConversationPicker>`.
2. Picker loads `users.conversations`, labels channels/groups, pre-selects the open
   conversation, and progressively resolves DM names.
3. User picks a conversation → `SELECT_TARGET` sets channelId + label, resets scan.
4. User sets filters (date range, keep-pinned) → Scan → `scan()` (now pins-aware) →
   preview → confirm → delete (unchanged).

## 5. Error handling

- `users.conversations` fails → picker shows a small error and the panel falls back to
  "current open conversation" mode (today's behavior); the user can still scan/delete the
  open conversation.
- A DM name fails to resolve → its label stays a short placeholder ("Direct message");
  selection still works (the id is what matters).
- `pins.list` fails → treat as **no pins** (don't block deletion); the panel may note
  that pinned-protection couldn't be verified.
- Network/429 on these reads → handled by the existing read-path 429 retry in `slackApi`.

## 6. Testing

TDD with Vitest + mocked API:
- `conversations.ts`: pagination across pages; channel/group/DM classification + labels;
  mpim name prettify (and fallback); DM label resolution.
- `slackApi`: `usersConversations` (request shape, parses `channels` + cursor) and
  `pinsList` (filters to message pins, returns ts list).
- `cleaner.scan`: with `keepPinned: true`, pinned timestamps are excluded; with `false`,
  they're included; `pins.list` called only when keepPinned is on.
- `panelState`: `SET_KEEP_PINNED` toggles the flag; `SELECT_TARGET` sets target and resets
  scan state while preserving filters.
- The `ConversationPicker` component is verified in the manual end-to-end test.

## 7. Out of scope (YAGNI)

- Archived conversations (excluded).
- Multi-select / cleaning several conversations at once.
- Showing unread counts or sorting by recency (natural API order is fine for v1).
- Resolving group-DM member display names via API (parsed handles from the mpim name are
  sufficient).
