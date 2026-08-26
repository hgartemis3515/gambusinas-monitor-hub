import { BrowserWindow } from 'electron';
import { listMonitors } from './monitors.js';

let overlays: BrowserWindow[] = [];

function overlayHtml(index: number): string {
  const html = `<!doctype html><html><body style="margin:0;overflow:hidden">
<div style="width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:rgba(10,10,15,0.88);color:#d4af37;font-family:Segoe UI,Arial,sans-serif;border:3px solid #d4af37;border-radius:16px">
  <div style="font-size:18px;letter-spacing:0.18em;font-weight:700;color:#fff;opacity:0.85">MONITOR</div>
  <div style="font-size:92px;font-weight:800;line-height:1">${index}</div>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

export function identifyOverlaysActive(): boolean {
  return overlays.some((w) => w && !w.isDestroyed());
}

export function closeIdentifyOverlays(): void {
  for (const w of overlays) {
    if (w && !w.isDestroyed()) w.close();
  }
  overlays = [];
}

export function toggleIdentifyOverlays(): boolean {
  if (identifyOverlaysActive()) {
    closeIdentifyOverlays();
    return false;
  }
  const monitors = listMonitors();
  overlays = monitors.map((m) => {
    const win = new BrowserWindow({
      x: m.bounds.x + 24,
      y: m.bounds.y + 24,
      width: 220,
      height: 180,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      show: false,
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadURL(overlayHtml(m.index));
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      overlays = overlays.filter((x) => x !== win);
    });
    return win;
  });
  return true;
}
