import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';
import type { LayoutProfile, LayoutSlot, WindowInfo, WindowMode } from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { listWindows } from './windows.js';
import { moveWindowToMonitor } from './windowManager.js';
import { isWin } from './native/win32.js';
import { readInbox, validateSlots } from './cocinaBridge.js';
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
    return Boolean(slot.match?.process || slot.match?.titleContains);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentBrowserHwnds(): Set<number> {
  return new Set(
    listWindows('all')
      .filter((w) => {
        const p = w.processName.toLowerCase();
        return p.includes('chrome') || p.includes('msedge') || p.includes('edge');
      })
      .map((w) => w.hwnd),
  );
}

async function placeNewBrowserWindow(
  monitorIndex: number,
  mode: WindowMode,
  before: Set<number>,
): Promise<boolean> {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await sleep(400);
    const fresh = listWindows('all').filter((w) => {
      const p = w.processName.toLowerCase();
      const isBrowser = p.includes('chrome') || p.includes('msedge') || p.includes('edge');
      return isBrowser && !before.has(w.hwnd);
    });
    const target = fresh[fresh.length - 1];
    if (target) {
      moveWindowToMonitor(target.hwnd, monitorIndex, mode);
      return true;
    }
  }
  return false;
}

function buildSpawnArgs(
  slot: LayoutSlot,
  bounds: { x: number; y: number; width: number; height: number },
  kiosk: boolean,
): string[] {
  const quietFlags = [
    '--disable-features=TranslateUI,Translate',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--lang=es',
    '--accept-lang=es-419,es',
  ];
  const userData = join(app.getPath('userData'), 'chrome-kiosk', `M${slot.monitorIndex}`);
  const pos = [`--window-position=${bounds.x},${bounds.y}`, `--window-size=${bounds.width},${bounds.height}`];
  if (slot.mode === 'fullscreen' && kiosk) {
    return [
      `--user-data-dir=${userData}`,
      '--kiosk',
      '--disable-pinch',
      '--new-window',
      ...quietFlags,
      ...pos,
      slot.url!,
    ];
  }
  if (slot.mode === 'fullscreen') {
    return [
      `--user-data-dir=${userData}`,
      '--new-window',
      ...quietFlags,
      '--start-fullscreen',
      ...pos,
      slot.url!,
    ];
  }
  return [
    `--user-data-dir=${userData}`,
    '--new-window',
    ...quietFlags,
    ...pos,
    slot.url!,
  ];
}

export async function applyLayout(
  profile: LayoutProfile,
  opts?: { kiosk?: boolean },
): Promise<{ applied: number; opened: number; errors: string[] }> {
  const monitors = listMonitors();
  const errors: string[] = [];
  let applied = 0;
  let opened = 0;
  const chromePath = findChromePath();
  const kiosk = opts?.kiosk !== false;

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
      continue;
    }
    if (!slot.url) {
      errors.push(`Sin ventana para M${slot.monitorIndex} y sin url`);
      continue;
    }
    if (!chromePath) {
      void shell.openExternal(slot.url);
      opened++;
      errors.push('Chrome/Edge no encontrado; abriendo en navegador por defecto');
      continue;
    }
    const before = currentBrowserHwnds();
    const args = buildSpawnArgs(slot, monitor.bounds, kiosk);
    spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
    opened++;
    logger.info('applyLayout: abierto navegador', {
      slot: slot.monitorIndex,
      url: slot.url,
      kiosk,
    });
    // Kiosk ya es pantalla completa: no enviar F11 (lo apagaría). Mover al monitor.
    const placeMode: WindowMode = kiosk && slot.mode === 'fullscreen' ? 'maximized' : slot.mode;
    const placed = await placeNewBrowserWindow(slot.monitorIndex, placeMode, before);
    if (!placed) {
      errors.push(`M${slot.monitorIndex}: ventana abierta pero no se pudo posicionar a tiempo`);
    }
  }
  logger.info('applyLayout: fin', { profile: profile.name, applied, opened, errors: errors.length });
  return { applied, opened, errors };
}

export async function applyCocinaInbox(
  opts?: { kiosk?: boolean },
): Promise<{ applied: number; opened: number; errors: string[] }> {
  const data = await readInbox();
  if (!data || !data.slots?.length) {
    throw new Error(
      'No hay layout de Cocina en el inbox. Envía desde la App Cocina ("Enviar al Monitor Hub" o Aplicar).',
    );
  }
  const profile: LayoutProfile = {
    id: `cocina-${Date.now()}`,
    name: data.profileName || `Cocina ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: validateSlots(data.slots) ?? [],
  };
  return applyLayout(profile, { kiosk: opts?.kiosk !== false });
}
