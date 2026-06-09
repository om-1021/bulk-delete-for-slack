# Chrome Web Store listing — copy/paste source

## Name
Free Bulk Delete for Slack — Messages, DMs & Group Chats

## Category
Productivity

## Short description (≤132 chars)
Bulk delete your own Slack messages in any DM, group chat, or channel. Free, fast, and 100% local — nothing leaves your browser.

## Detailed description
Free Bulk Delete for Slack lets you clean up your own Slack messages in bulk — in any
direct message, group chat, or channel — directly from your browser.

Features:
- Bulk delete your own messages in the currently-open conversation
- Optional date-range filter (delete messages before / after a date)
- Scan & preview the exact count before deleting anything
- Live progress with a Stop button to halt at any time
- Rate-limit aware, so Slack stays happy
- 100% local: your session never leaves your browser. No account, no servers, no
  tracking. Free.

How to use:
1. Open Slack in your browser and open a DM, group, or channel.
2. Click the extension icon to open the panel.
3. (Optional) set a date range, click Scan, confirm, then Delete.

Note: it deletes only your own messages, and deletion is permanent.

## Permission justifications (for the dashboard)
- Host access `https://*.slack.com/*`: the extension operates only on Slack, to read and
  delete the user's own messages via Slack's API.
- `activeTab`: to act on the Slack tab when you click the toolbar icon.

## Privacy practices
- Single purpose: bulk-delete the user's own Slack messages.
- Data collected: none. Nothing is transmitted off the user's device.
- Privacy policy URL: https://github.com/om-1021/bulk-delete-for-slack/blob/main/PRIVACY.md
- Remote code: none.

## Submission checklist
- [ ] Register a Chrome Web Store developer account (one-time $5 fee) + identity verification
- [ ] Host PRIVACY.md at a public URL; paste the link into the listing
- [ ] Create a new item; upload bulk-delete-for-slack.zip (the zipped contents of dist/)
- [ ] Fill name + short + detailed description (above)
- [ ] Upload a 1280×800 (or 640×400) screenshot of the panel in action + the 128px icon
- [ ] Complete the Privacy practices form: declare no data collected; add the per-permission justifications above; declare non-trader (EU DSA)
- [ ] Set the single-purpose statement
- [ ] Submit for review
