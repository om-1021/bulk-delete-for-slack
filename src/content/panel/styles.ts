export const PANEL_CSS = `
:host, * { box-sizing: border-box; }
.panel {
  position: fixed; top: 0; right: 0; height: 100vh; width: 360px; z-index: 2147483647;
  background: #ffffff; color: #1d1c1d; font-family: -apple-system, Segoe UI, Roboto, sans-serif;
  box-shadow: -8px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column;
  border-left: 1px solid #e2e2e2;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #ededed; background: #611f69; color: #fff;
}
.header h1 { font-size: 15px; margin: 0; font-weight: 700; }
.header button { background: transparent; border: 0; color: #fff; font-size: 18px; cursor: pointer; }
.body { padding: 16px; overflow-y: auto; flex: 1; }
.target { font-size: 13px; color: #616061; margin-bottom: 14px; }
.target b { color: #1d1c1d; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; }
.field label { font-weight: 600; }
.field input { padding: 7px 9px; border: 1px solid #cfcfcf; border-radius: 6px; font-size: 13px; }
.btn {
  width: 100%; padding: 10px 12px; border: 0; border-radius: 8px; font-size: 14px;
  font-weight: 700; cursor: pointer; margin-top: 6px;
}
.btn-primary { background: #007a5a; color: #fff; }
.btn-primary:disabled { background: #b9d9cd; cursor: not-allowed; }
.btn-danger { background: #e01e5a; color: #fff; }
.btn-secondary { background: #f1f1f1; color: #1d1c1d; }
.confirm { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; margin: 10px 0; color: #616061; }
.count { font-size: 22px; font-weight: 800; margin: 8px 0; }
.progress-wrap { background: #ededed; border-radius: 999px; height: 10px; overflow: hidden; margin: 12px 0 8px; }
.progress-bar { background: #007a5a; height: 100%; transition: width .2s ease; }
.stats { font-size: 12px; color: #616061; display: flex; justify-content: space-between; }
.error { background: #fdeef0; color: #8b0a2c; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
.note { font-size: 11px; color: #8d8d8d; margin-top: 12px; line-height: 1.4; }
.scanning { text-align: center; padding: 14px 0 6px; }
.spinner {
  width: 30px; height: 30px; margin: 4px auto 12px; border: 3px solid #ececec;
  border-top-color: #611f69; border-radius: 50%; animation: bdfs-spin 0.8s linear infinite;
}
@keyframes bdfs-spin { to { transform: rotate(360deg); } }
.scan-line { font-size: 13px; color: #1d1c1d; margin: 0; }
.hint { font-size: 12px; color: #8d8d8d; margin-top: 8px; line-height: 1.45; }
`;
