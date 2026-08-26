import { ipcMain, desktopCapturer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels.js';
import type {
  HubCocinero,
  LayoutSlot,
  WindowMode,
  WindowProcessFilter,
} from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { listWindows } from './windows.js';
import { moveWindowToMonitor, setWindowMode } from './windowManager.js';
import { listLayouts, saveLayout, deleteLayout } from './layoutStore.js';
import {
  readInbox,
  importFromFile,
  toPublicInbox,
  tokenFromInbox,
  setInboxCocinero,
} from './cocinaBridge.js';
import { applyLayout, applyCocinaInbox } from './layoutApply.js';
import { getCachedPreviews, setPreviewOptions, setPreviewsLive } from './screenCapture.js';
import { readConfig } from './hubSocket.js';
import { logger } from '../shared/logger.js';
import { readChromeZooms, setAndApplyChromeZoom } from './chromeZoom.js';
import {
  toggleIdentifyOverlays,
  identifyOverlaysActive,
} from './identifyOverlays.js';

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
    const active = toggleIdentifyOverlays();
    return { active };
  });

  ipcMain.handle(IpcChannel.MONITORS_IDENTIFY_STATUS, () => identifyOverlaysActive());

  ipcMain.handle(IpcChannel.COCINA_COCINEROS, () => listCocinerosHub());

  ipcMain.handle(
    IpcChannel.COCINA_SET_COCINERO,
    async (
      _e,
      monitorIndex: number,
      cook: HubCocinero,
      opts?: { deploy?: boolean; kiosk?: boolean },
    ) => {
      const data = await setInboxCocinero(monitorIndex, cook);
      let deploy = { applied: 0, opened: 0, errors: [] as string[] };
      if (opts?.deploy !== false) {
        deploy = await applyCocinaInbox({
          kiosk: opts?.kiosk !== false,
          monitorIndex: Number(monitorIndex),
        });
      }
      return { inbox: toPublicInbox(data), deploy };
    },
  );

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

async function listCocinerosHub(): Promise<HubCocinero[]> {
  const inbox = await readInbox();
  const byId = new Map<string, HubCocinero>();
  for (const s of inbox?.slots || []) {
    const id = String(s.cocineroId || '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      nombre: String(s.cocineroNombre || s.label || id).trim() || id,
    });
  }
  const token = tokenFromInbox(inbox);
  try {
    const cfg = await readConfig();
    const base = (cfg.backendUrl || '').replace(/\/$/, '');
    if (base && token) {
      const res = await fetch(`${base}/api/cocina/cocineros`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ _id?: string; name?: string; alias?: string }>;
        };
        for (const c of Array.isArray(json.data) ? json.data : []) {
          const id = String(c._id || '').trim();
          if (!id) continue;
          byId.set(id, { id, nombre: String(c.alias || c.name || id).trim() || id });
        }
      }
    }
  } catch (e) {
    logger.warn('listCocinerosHub: API no disponible', { error: (e as Error).message });
  }
  return [...byId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
