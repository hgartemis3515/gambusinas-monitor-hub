import { getNative, constants } from './native/win32.js';
import { listMonitors } from './monitors.js';
import type { WindowMode } from '../shared/types.js';
import { logger } from '../shared/logger.js';

const { SW_RESTORE, SW_MAXIMIZE, SW_SHOW, WS_OVERLAPPEDWINDOW, WS_POPUP, WS_VISIBLE } =
  constants;

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
    native.showWindow(h, SW_RESTORE);
    return;
  }
  if (mode === 'maximized') {
    native.showWindow(h, SW_MAXIMIZE);
    return;
  }
  // fullscreen real (borderless cubriendo el monitor actual)
  const monitors = listMonitors();
  const monHandle = native.monitorFromWindow(h);
  const raw = native.enumMonitors().find((r) => r.handle === monHandle);
  const bounds = raw?.bounds ?? monitors[0]?.bounds;
  if (!bounds) throw new Error('No se pudo determinar el monitor de la ventana');
  const style = native.getWindowStyle(h);
  const clean = style & ~WS_OVERLAPPEDWINDOW;
  native.setWindowStyle(h, clean | WS_POPUP | WS_VISIBLE);
  native.setWindowPos(h, bounds.x, bounds.y, bounds.width, bounds.height);
  native.showWindow(h, SW_SHOW);
}
