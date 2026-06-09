# Free Bulk Delete for Slack — Messages, DMs & Group Chats

🧹 A free, local **Manifest V3 Chrome extension** that bulk-deletes *your own* Slack
messages in any DM, group chat, or channel — directly in your browser. No backend, no
account, nothing leaves your browser.

## Features

- Bulk-delete your own messages in the currently-open conversation
- Optional **date-range** filter (before / after)
- **Scan & preview** the exact count before deleting anything
- Live **progress** with a **Stop** button to halt at any time
- **Rate-limit aware** (safe pacing + backoff on 429s)
- **100% local** — uses your existing Slack session; the only network calls are to Slack

## How it works

Runs as a content script on `app.slack.com`. It reads your workspace token from the page,
calls Slack's web API (`conversations.history` / `conversations.replies` / `chat.delete`)
same-origin so your session cookie is attached automatically, and deletes matching
messages through a rate limiter. The UI is a Shadow-DOM [Preact](https://preactjs.com/)
panel that shows live progress.

## Install from source

```bash
npm install
npm run build      # outputs the unpacked extension to dist/
```

Then in Chrome: open `chrome://extensions` → enable **Developer mode** → **Load unpacked**
→ select the **`dist/`** folder. Open Slack, **reload the tab**, then click the toolbar
icon to open the panel.

## Development

```bash
npm test                         # run unit tests (Vitest)
npm run build                    # type-check (tsc) + production build (Vite)
node scripts/generate-icons.mjs  # regenerate PNG icons from icons/icon.svg
```

## Tech stack

TypeScript · Preact · Vite + `@crxjs/vite-plugin` · Vitest

## Privacy

No data is collected or transmitted to any third party. There is no analytics, no
tracking, and no remote code. See [PRIVACY.md](./PRIVACY.md).

## Disclaimer

This tool uses Slack's internal web API via your own logged-in session to delete **only
your own** messages. **Deletion is permanent.** Use at your own discretion — automated
use may conflict with Slack's Terms of Service.

## License

[MIT](./LICENSE)
