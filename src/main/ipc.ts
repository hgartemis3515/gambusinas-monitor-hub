import { ipcMain, shell, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IpcChannel } from '../shared/ipc-channels.js';
import type {
  LayoutProfile,
  LayoutSlot,
  WindowInfo,
  WindowMode,
  WindowProcessFilter,
  CocinaLayoutImport,
} from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { listWindows } from './windows.js';
import { moveWindowToMonitor, setWindowMode } from './windowManager.js';
import { isWin } from './native/win32.js';
import { listLayouts, saveLayout, deleteLayout } from './layoutStore.js';
import { readInbox, importFromFile, validateSlots } from './cocinaBridge.js';
import { logger } from '../shared/logger.js';

function findChromePath(): string | null {
  if (!isWin) return null;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function matchWindow(slots: WindowInfo[], slot: LayoutSlot): WindowInfo | undefined {
  return slots.find((w) => {
    if (slot.match?.process) {
      const proc = w.processName.toLowerCase();
      if (!proc.includes(slot.match.process.toLowerCase())) return false;
    }
    if (slot.match?.titleContains) {
      if (!w.title.toLowerCase().includes(slot.match.titleContains.toLowerCase())) return false;
    }
    return true;
  });
}

async function applyLayout(profile: LayoutProfile): Promise<{ applied: number; opened: number; errors: string[] }> {
  const monitors = listMonitors();
  const errors: string[] = [];
  let applied = 0;
  let opened = 0;
  const chromePath = findChromePath();

  for (const slot of profile.slots) {
    const monitor = monitors.find((m) => m.index === slot.monitorIndex);
    if (!monitor) {
      errors.push(`Monitor ${slot.monitorIndex} no encontrado`);
      continue;
    }
    const windows = listWindows('all');
    const target = matchWindow(windows, slot);
    if (target) {
      try {
        moveWindowToMonitor(target.hwnd, slot.monitorIndex, slot.mode);
        applied++;
      } catch (err) {
        errors.push(`Mover hwnd ${target.hwnd}: ${(err as Error).message}`);
      }
    } else if (slot.url && chromePath) {
      const args = [
        '--new-window',
        `--window-position=${monitor.bounds.x},${monitor.bounds.y}`,
        `--window-size=${monitor.bounds.width},${monitor.bounds.height}`,
        slot.url,
      ];
      spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
      opened++;
      logger.info('applyLayout: abierto Chrome', { slot: slot.monitorIndex, url: slot.url });
    } else if (slot.url && !chromePath) {
      shell.openExternal(slot.url);
      opened++;
      errors.push('Chrome/Edge no encontrado; abriendo en navegador por defecto');
    } else {
      errors.push(`Sin ventana para M${slot.monitorIndex} y sin url`);
    }
  }
  logger.info('applyLayout: fin', { profile: profile.name, applied, opened, errors: errors.length });
  return { applied, opened, errors };
}

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.MONITORS_LIST, () => listMonitors());

  ipcMain.handle(IpcChannel.WINDOWS_LIST, (_e, filter: WindowProcessFilter = 'all') =>
    listWindows(filter),
  );

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

  ipcMain.handle(IpcChannel.LAYOUTS_APPLY, async (_e, id: string) => {
    const { getLayout } = await import('./layoutStore.js');
    const profile = await getLayout(id);
    if (!profile) throw new Error('Perfil no encontrado: ' + id);
    return applyLayout(profile);
  });

  ipcMain.handle(IpcChannel.COCINA_IMPORT, async () => {
    const data = await readInbox();
    return data;
  });

  ipcMain.handle(IpcChannel.COCINA_IMPORT_FILE, async () => {
    const data = await importFromFile();
    return data;
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
