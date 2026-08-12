import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels.js';
import type {
  LayoutProfile,
  LayoutSlot,
  MonitorInfo,
  WindowInfo,
  WindowMode,
  WindowProcessFilter,
  CocinaLayoutImport,
} from '../shared/types.js';

export interface HubApi {
  listMonitors: () => Promise<MonitorInfo[]>;
  identifyMonitors: () => Promise<boolean>;
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
    opts?: { kiosk?: boolean },
  ) => Promise<{ applied: number; opened: number; errors: string[] }>;
  deleteLayout: (id: string) => Promise<void>;
  importFromCocina: () => Promise<CocinaLayoutImport | null>;
  importCocinaFile: () => Promise<CocinaLayoutImport | null>;
  getHubConfig: () => Promise<{ backendUrl: string }>;
  setHubConfig: (cfg: { backendUrl: string }) => Promise<void>;
  getHubStatus: () => Promise<string>;
  onHubStatus: (cb: (s: string) => void) => void;
  getVersion: () => Promise<string>;
}

try {
  const api: HubApi = {
    listMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_LIST),
    identifyMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_IDENTIFY),
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
    onHubStatus: (cb) => {
      const handler = (_e: unknown, s: string) => cb(s);
      ipcRenderer.on('hub:status-changed', handler);
    },
  };
  contextBridge.exposeInMainWorld('hub', api);
  contextBridge.exposeInMainWorld('__hubPreloadOk', true);
} catch (err) {
  // Si el preload falla, exponemos el error para que el renderer lo muestre
  // en vez de quedar window.hub undefined sin explicacion.
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  try {
    contextBridge.exposeInMainWorld('hub', { __error: msg } as unknown as HubApi);
    contextBridge.exposeInMainWorld('__hubPreloadOk', false);
    contextBridge.exposeInMainWorld('__hubPreloadError', msg);
  } catch {
    /* ultima opcion: no podemos exponer nada */
  }
}
