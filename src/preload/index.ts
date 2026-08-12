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
  moveWindow: (hwnd: number, monitorIndex: number, mode?: WindowMode) => Promise<boolean>;
  setWindowMode: (hwnd: number, mode: WindowMode) => Promise<boolean>;
  listLayouts: () => Promise<LayoutProfile[]>;
  saveLayout: (name: string, slots: LayoutSlot[]) => Promise<LayoutProfile>;
  applyLayout: (id: string) => Promise<{ applied: number; opened: number; errors: string[] }>;
  deleteLayout: (id: string) => Promise<void>;
  importFromCocina: () => Promise<CocinaLayoutImport | null>;
  importCocinaFile: () => Promise<CocinaLayoutImport | null>;
}

try {
  const api: HubApi = {
    listMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_LIST),
    identifyMonitors: () => ipcRenderer.invoke(IpcChannel.MONITORS_IDENTIFY),
    listWindows: (filter: WindowProcessFilter = 'all') =>
      ipcRenderer.invoke(IpcChannel.WINDOWS_LIST, filter),
    moveWindow: (hwnd: number, monitorIndex: number, mode: WindowMode = 'normal') =>
      ipcRenderer.invoke(IpcChannel.WINDOW_MOVE, hwnd, monitorIndex, mode),
    setWindowMode: (hwnd, mode) => ipcRenderer.invoke(IpcChannel.WINDOW_SET_MODE, hwnd, mode),
    listLayouts: () => ipcRenderer.invoke(IpcChannel.LAYOUTS_LIST),
    saveLayout: (name, slots) => ipcRenderer.invoke(IpcChannel.LAYOUTS_SAVE, name, slots),
    applyLayout: (id) => ipcRenderer.invoke(IpcChannel.LAYOUTS_APPLY, id),
    deleteLayout: (id) => ipcRenderer.invoke(IpcChannel.LAYOUTS_DELETE, id),
    importFromCocina: () => ipcRenderer.invoke(IpcChannel.COCINA_IMPORT),
    importCocinaFile: () => ipcRenderer.invoke(IpcChannel.COCINA_IMPORT_FILE),
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
