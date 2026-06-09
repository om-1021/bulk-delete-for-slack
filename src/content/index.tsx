import { render } from "preact";
import { App } from "./panel/App";

const MOUNT_ID = "bulk-delete-for-slack-root";

function togglePanel(): void {
  const existing = document.getElementById(MOUNT_ID);
  if (existing) {
    existing.remove();
    return;
  }
  const host = document.createElement("div");
  host.id = MOUNT_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadow.appendChild(mount);

  render(<App onClose={() => host.remove()} />, mount);
}

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === "TOGGLE_PANEL") togglePanel();
});
