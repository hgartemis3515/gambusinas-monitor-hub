import { ipcMain, BrowserWindow, desktopCapturer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels.js';
import type {
  LayoutSlot,
  WindowMode,
  WindowProcessFilter,
} from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { listWindows } from './windows.js';
import { moveWindowToMonitor, setWindowMode } from './windowManager.js';
import { listLayouts, saveLayout, deleteLayout } from './layoutStore.js';
import { readInbox, importFromFile, toPublicInbox } from './cocinaBridge.js';
import { applyLayout, applyCocinaInbox } from './layoutApply.js';
import { getCachedPreviews, setPreviewOptions, setPreviewsLive } from './screenCapture.js';
import { readConfig } from './hubSocket.js';
import { logger } from '../shared/logger.js';
import { readChromeZooms, setAndApplyChromeZoom } from './chromeZoom.js';

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.MONITORS_LIST, () => listMonitors());

  ipcMain.handle(IpcChannel.MONITORS_PREVIEWS, () => getCachedPreviews());

  ipcMain.handle(IpcChannel.MONITORS_PREVIEWS_LIVE, async (_e, on: boolean) => {
    if (on) {
      const cfg = await readConfig();
      setPreviewOptions(cfg.previewScale, cfg.previewIntervalMs);
      setPreviewsLive(true);
    } else {
      setPreviewsLive(false);
    }
    return true;
  });

  ipcMain.handle(IpcChannel.WINDOWS_LIST, (_e, filter: WindowProcessFilter = 'all') =>
    listWindows(filter),
  );

  ipcMain.handle(IpcChannel.WINDOWS_THUMBNAILS, async () => {
    try {
      const windows = listWindows('all');
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const byTitle = new Map<string, string>();
      for (const s of sources) {
        const key = s.name.trim().toLowerCase();
        if (s.thumbnail && !byTitle.has(key)) {
          byTitle.set(key, s.thumbnail.toDataURL());
        }
      }
      return windows.map((w) => ({
        ...w,
        thumbnail: byTitle.get(w.title.trim().toLowerCase()),
      }));
    } catch (err) {
      logger.error('thumbnails', { message: (err as Error).message });
      return listWindows('all');
    }
  });

  ipcMain.handle(
    IpcChannel.WINDOW_MOVE,
    (_e, hwnd: number, monitorIndex: number, mode: WindowMode = 'normal') => {
      moveWindowToMonitor(hwnd, monitorIndex, mode);
      return true;
    },
  );

  ipcMain.handle(IpcChannel.WINDOW_SET_MODE, (_e, hwnd: number, mode: WindowMode) => {
    setWindowMode(hwnd, mode);
    return true;
  });

  ipcMain.handle(IpcChannel.MONITORS_IDENTIFY, () => {
    identifyMonitors();
    return true;
  });

  ipcMain.handle(IpcChannel.LAYOUTS_LIST, () => listLayouts());

  ipcMain.handle(IpcChannel.LAYOUTS_SAVE, (_e, name: string, slots: LayoutSlot[]) =>
    saveLayout(name, slots),
  );

  ipcMain.handle(IpcChannel.LAYOUTS_DELETE, (_e, id: string) => deleteLayout(id));

  ipcMain.handle(IpcChannel.LAYOUTS_APPLY, async (_e, id: string, opts?: { kiosk?: boolean }) => {
    const { getLayout } = await import('./layoutStore.js');
    const profile = await getLayout(id);
    if (!profile) throw new Error('Perfil no encontrado: ' + id);
    return applyLayout(profile, opts);
  });

  ipcMain.handle(
    IpcChannel.LAYOUTS_APPLY_COCINA,
    async (_e, opts?: { kiosk?: boolean; monitorIndex?: number }) => {
      return applyCocinaInbox(opts);
    },
  );

  ipcMain.handle(IpcChannel.COCINA_IMPORT, async () => {
    return toPublicInbox(await readInbox());
  });

  ipcMain.handle(IpcChannel.COCINA_IMPORT_FILE, async () => {
    return toPublicInbox(await importFromFile());
  });

  ipcMain.handle(IpcChannel.HUB_ZOOM_GET, () => readChromeZooms());

  ipcMain.handle(IpcChannel.HUB_ZOOM_SET, async (_e, monitorIndex: number, percent: number) => {
    return setAndApplyChromeZoom(monitorIndex, percent);
  });
}

function identifyMonitors(): void {
  const monitors = listMonitors();
  for (const m of monitors) {
    const win = new BrowserWindow({
      x: m.bounds.x + 40,
      y: m.bounds.y + 40,
      width: 320,
      height: 240,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      show: false,
    });
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);color:#fff;font-family:Arial;font-size:160px;font-weight:bold">${m.index}</div>`,
        ),
    );
    win.once('ready-to-show', () => {
      win.show();
      setTimeout(() => win.close(), 2000);
    });
  }
}
