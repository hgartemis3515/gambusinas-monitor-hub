import { getNative, constants } from './native/win32.js';
import { listMonitors } from './monitors.js';
import type { WindowMode } from '../shared/types.js';
import { logger } from '../shared/logger.js';

const { SW_RESTORE, SW_MAXIMIZE } = constants;

// Trackea qué hwnds pusimos en fullscreen (browser) via F11.
// F11 es un toggle: si ya está fullscreen, enviarlo de nuevo lo saca.
const fullscreenHwnds = new Set<number>();

function exitBrowserFullscreenIfTracked(hwnd: number): void {
  if (fullscreenHwnds.has(hwnd)) {
    getNative().sendF11(BigInt(hwnd));
    fullscreenHwnds.delete(hwnd);
  }
}

export function moveWindowToMonitor(
  hwnd: number,
  monitorIndex: number,
  mode: WindowMode = 'normal',
): void {
  const native = getNative();
  const monitor = listMonitors().find((m) => m.index === monitorIndex);
  if (!monitor) {
    throw new Error(`Monitor ${monitorIndex} no encontrado`);
  }
  const h = BigInt(hwnd);
  // Si estaba en fullscreen (F11) y lo movemos a otro modo, salimos primero.
  exitBrowserFullscreenIfTracked(hwnd);
  native.showWindow(h, SW_RESTORE);
  native.setWindowPos(
    h,
    monitor.bounds.x,
    monitor.bounds.y,
    monitor.bounds.width,
    monitor.bounds.height,
  );
  applyMode(hwnd, mode);
  logger.info('moveWindowToMonitor', { hwnd, monitorIndex, mode });
}

export function setWindowMode(hwnd: number, mode: WindowMode): void {
  applyMode(hwnd, mode);
  logger.info('setWindowMode', { hwnd, mode });
}

function applyMode(hwnd: number, mode: WindowMode): void {
  const native = getNative();
  const h = BigInt(hwnd);
  if (mode === 'normal') {
    exitBrowserFullscreenIfTracked(hwnd);
    native.showWindow(h, SW_RESTORE);
    return;
  }
  if (mode === 'maximized') {
    exitBrowserFullscreenIfTracked(hwnd);
    native.showWindow(h, SW_MAXIMIZE);
    return;
  }
  // fullscreen real del navegador via F11 (oculta URL bar / tabs).
  // F11 es toggle: solo lo enviamos si no lo trackeamos ya en fullscreen.
  if (!fullscreenHwnds.has(hwnd)) {
    native.sendF11(h);
    fullscreenHwnds.add(hwnd);
  }
}

// Limpieza: si una ventana ya no existe, sacar su hwnd del set.
// (Llamado periodicamente desde ipc si hace falta; por ahora best-effort.)
export function pruneFullscreenHwnds(aliveHwnds: number[]): void {
  const alive = new Set(aliveHwnds);
  for (const h of [...fullscreenHwnds]) {
    if (!alive.has(h)) fullscreenHwnds.delete(h);
  }
}
