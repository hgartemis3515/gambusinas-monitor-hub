import { ipcMain, shell, BrowserWindow, desktopCapturer } from 'electron';
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

async function applyLayout(
  profile: LayoutProfile,
  opts?: { kiosk?: boolean },
): Promise<{ applied: number; opened: number; errors: string[] }> {
  const monitors = listMonitors();
  const errors: string[] = [];
  let applied = 0;
  let opened = 0;
  const chromePath = findChromePath();
  const kiosk = opts?.kiosk !== false; // default true

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
      const args = buildSpawnArgs(slot, monitor.bounds, kiosk);
      spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
      opened++;
      logger.info('applyLayout: abierto navegador', {
        slot: slot.monitorIndex,
        url: slot.url,
        kiosk,
      });
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

function buildSpawnArgs(
  slot: LayoutSlot,
  bounds: { x: number; y: number; width: number; height: number },
  kiosk: boolean,
): string[] {
  // Flags para silenciar popups que roban el foco e impiden el fullscreen:
  //  - TranslateUI: deshabilita el "¿Quieres traducir esta página?"
  //  - no-first-run / no-default-browser-check: evitan diálogos de primer uso
  //  - lang/accept-lang: el navegador asume que la página ya está en el idioma del usuario
  const quietFlags = [
    '--disable-features=TranslateUI,Translate',
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=es',
    '--accept-lang=es-419,es',
  ];
  if (slot.mode === 'fullscreen') {
    // Kiosk: sin URL bar, sin tabs, bloqueado (ideal para cocina).
    // start-fullscreen: fullscreen del navegador (F11-like), se puede salir con F11.
    return kiosk
      ? [...quietFlags, '--kiosk', '--disable-pinch', slot.url!]
      : [
          '--new-window',
          ...quietFlags,
          '--start-fullscreen',
          `--window-position=${bounds.x},${bounds.y}`,
          `--window-size=${bounds.width},${bounds.height}`,
          slot.url!,
        ];
  }
  return [
    '--new-window',
    `--window-position=${bounds.x},${bounds.y}`,
    `--window-size=${bounds.width},${bounds.height}`,
    slot.url!,
  ];
}

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.MONITORS_LIST, () => listMonitors());

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

  // Boton unico: lee el inbox de App Cocina y aplica con kiosk (pantalla completa
  // sin URL bar) en un solo paso. Abre las ventanas en cada monitor asignado.
  ipcMain.handle(IpcChannel.LAYOUTS_APPLY_COCINA, async (_e, opts?: { kiosk?: boolean }) => {
    const data = await readInbox();
    if (!data || !data.slots?.length) {
      throw new Error('No hay layout de Cocina en el inbox. Envía desde la App Cocina ("Enviar al Monitor Hub").');
    }
    const profile: LayoutProfile = {
      id: `cocina-${Date.now()}`,
      name: data.profileName || `Cocina ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slots: validateSlots(data.slots) ?? [],
    };
    return applyLayout(profile, { kiosk: opts?.kiosk !== false });
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
