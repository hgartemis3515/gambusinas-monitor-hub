import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels.js';
import type {
  LayoutProfile,
  LayoutSlot,
  MonitorInfo,
  MonitorPreview,
  WindowInfo,
  WindowMode,
  WindowProcessFilter,
  CocinaLayoutImport,
  HubConfig,
  HubCocinero,
  HubUpdateStatus,
} from '../shared/types.js';

export interface HubApi {
  listMonitors: () => Promise<MonitorInfo[]>;
  listMonitorPreviews: () => Promise<MonitorPreview[]>;
  setPreviewsLive: (on: boolean) => Promise<boolean>;
  identifyMonitors: () => Promise<{ active: boolean }>;
  identifyStatus: () => Promise<boolean>;
  listCocineros: () => Promise<HubCocinero[]>;
  setSlotCocinero: (
    monitorIndex: number,
    cook: HubCocinero,
    opts?: { deploy?: boolean; kiosk?: boolean },
  ) => Promise<{
    inbox: CocinaLayoutImport | null;
    deploy: { applied: number; opened: number; errors: string[] };
  }>;
  listWindows: (filter?: WindowProcessFilter) => Promise<WindowInfo[]>;
  listThumbnails: () => Promise<WindowInfo[]>;
  moveWindow: (hwnd: number, monitorIndex: number, mode?: WindowMode) => Promise<boolean>;
  setWindowMode: (hwnd: number, mode: WindowMode) => Promise<boolean>;
  listLayouts: () => Promise<LayoutProfile[]>;
  saveLayout: (name: string, slots: LayoutSlot[]) => Promise<LayoutProfile>;
  applyLayout: (
    id: string,
    opts?: { kiosk?: boolean },
  ) => Promise<{ applied: number; opened: number; errors: string[] }>;
  applyCocina: (
    opts?: { kiosk?: boolean; monitorIndex?: number },
  ) => Promise<{ applied: number; opened: number; errors: string[] }>;
  deleteLayout: (id: string) => Promise<void>;
  importFromCocina: () => Promise<CocinaLayoutImport | null>;
  importCocinaFile: () => Promise<CocinaLayoutImport | null>;
  getHubConfig: () => Promise<HubConfig>;
  setHubConfig: (cfg: Partial<HubConfig>) => Promise<void>;
  getHubStatus: () => Promise<string>;
  onHubStatus: (cb: (s: string) => void) => void;
  onInboxUpdated: (cb: () => void) => () => void;
  getVersion: () => Promise<string>;
  getChromeZooms: () => Promise<Record<string, number>>;
  setChromeZoom: (monitorIndex: number, percent: number) => Promise<{ zoom: number; live: boolean }>;
  getUpdateStatus: () => Promise<HubUpdateStatus>;
  checkForUpdates: () => Promise<HubUpdateStatus>;
  onUpdateStatus: (cb: (s: HubUpdateStatus) => void) => () => void;
}

try {
  const api: HubApi = {
    listMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_LIST),
    listMonitorPreviews: () => ipcRenderer.invoke(IpcChannel.MONITORS_PREVIEWS),
    setPreviewsLive: (on: boolean) => ipcRenderer.invoke(IpcChannel.MONITORS_PREVIEWS_LIVE, on),
    identifyMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_IDENTIFY),
    identifyStatus: () => ipcRenderer.invoke(IpcChannel.MONITORS_IDENTIFY_STATUS),
    listCocineros: () => ipcRenderer.invoke(IpcChannel.COCINA_COCINEROS),
    setSlotCocinero: (monitorIndex, cook, opts) =>
      ipcRenderer.invoke(IpcChannel.COCINA_SET_COCINERO, monitorIndex, cook, opts),
    listWindows: (filter: WindowProcessFilter = 'all') =>
      ipcRenderer.invoke(IpcChannel.WINDOWS_LIST, filter),
    listThumbnails: () => ipcRenderer.invoke(IpcChannel.WINDOWS_THUMBNAILS),
    moveWindow: (hwnd: number, monitorIndex: number, mode: WindowMode = 'normal') =>
      ipcRenderer.invoke(IpcChannel.WINDOW_MOVE, hwnd, monitorIndex, mode),
    setWindowMode: (hwnd, mode) => ipcRenderer.invoke(IpcChannel.WINDOW_SET_MODE, hwnd, mode),
    listLayouts: () => ipcRenderer.invoke(IpcChannel.LAYOUTS_LIST),
    saveLayout: (name, slots) => ipcRenderer.invoke(IpcChannel.LAYOUTS_SAVE, name, slots),
    applyLayout: (id, opts) => ipcRenderer.invoke(IpcChannel.LAYOUTS_APPLY, id, opts),
    applyCocina: (opts) => ipcRenderer.invoke(IpcChannel.LAYOUTS_APPLY_COCINA, opts),
    deleteLayout: (id) => ipcRenderer.invoke(IpcChannel.LAYOUTS_DELETE, id),
    importFromCocina: () => ipcRenderer.invoke(IpcChannel.COCINA_IMPORT),
    importCocinaFile: () => ipcRenderer.invoke(IpcChannel.COCINA_IMPORT_FILE),
    getHubConfig: () => ipcRenderer.invoke(IpcChannel.HUB_CONFIG_GET),
    setHubConfig: (cfg) => ipcRenderer.invoke(IpcChannel.HUB_CONFIG_SET, cfg),
    getHubStatus: () => ipcRenderer.invoke(IpcChannel.HUB_STATUS),
    getVersion: () => ipcRenderer.invoke(IpcChannel.HUB_VERSION),
    getChromeZooms: () => ipcRenderer.invoke(IpcChannel.HUB_ZOOM_GET),
    setChromeZoom: (monitorIndex, percent) =>
      ipcRenderer.invoke(IpcChannel.HUB_ZOOM_SET, monitorIndex, percent),
    getUpdateStatus: () => ipcRenderer.invoke(IpcChannel.HUB_UPDATER_STATUS),
    checkForUpdates: () => ipcRenderer.invoke(IpcChannel.HUB_UPDATER_CHECK),
    onHubStatus: (cb) => {
      const handler = (_e: unknown, s: string) => cb(s);
      ipcRenderer.on('hub:status-changed', handler);
    },
    onInboxUpdated: (cb) => {
      const handler = () => cb();
      ipcRenderer.on('hub:inbox-updated', handler);
      return () => {
        ipcRenderer.removeListener('hub:inbox-updated', handler);
      };
    },
    onUpdateStatus: (cb) => {
      const handler = (_e: unknown, s: HubUpdateStatus) => cb(s);
      ipcRenderer.on('hub:update-status', handler);
      return () => {
        ipcRenderer.removeListener('hub:update-status', handler);
      };
    },
  };
  contextBridge.exposeInMainWorld('hub', api);
  contextBridge.exposeInMainWorld('__hubPreloadOk', true);
} catch (err) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  try {
    contextBridge.exposeInMainWorld('hub', { __error: msg } as unknown as HubApi);
    contextBridge.exposeInMainWorld('__hubPreloadOk', false);
    contextBridge.exposeInMainWorld('__hubPreloadError', msg);
  } catch {
    /* ultima opcion: no podemos exponer nada */
  }
}
