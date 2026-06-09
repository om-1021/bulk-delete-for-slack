chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch {
    // No content script on this tab (not app.slack.com) — ignore.
  }
});
