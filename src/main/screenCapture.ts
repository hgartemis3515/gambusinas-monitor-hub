import { nativeImage } from 'electron';
import type { MonitorPreview, PreviewScale } from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { getNative, isWin } from './native/win32.js';
import { logger } from '../shared/logger.js';

const SCALE_WIDTH: Record<PreviewScale, number> = {
  1: 480,
  1.5: 720,
  2: 960,
};

let _cache: MonitorPreview[] = [];
let _live = false;
let _capturing = false;
let _abort = false;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _scale: PreviewScale = 1;
let _intervalMs = 1500;

export function getCachedPreviews(): MonitorPreview[] {
  return _cache;
}

export function setPreviewOptions(scale: PreviewScale, intervalMs: number): void {
  _scale = scale;
  _intervalMs = Math.max(1000, Math.min(5000, intervalMs));
}

export function setPreviewsLive(on: boolean): void {
  _live = on;
  if (!on) {
    _abort = true;
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    return;
  }
  _abort = false;
  if (!_timer && !_capturing) {
    _timer = setTimeout(() => {
      _timer = null;
      void previewTick();
    }, 0);
  }
}

function yieldMain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function scaleSize(
  bounds: { width: number; height: number },
  scale: PreviewScale,
): { w: number; h: number } {
  const maxW = SCALE_WIDTH[scale] ?? 480;
  const w = Math.max(1, Math.min(maxW, bounds.width));
  const h = Math.max(1, Math.round((bounds.height / Math.max(1, bounds.width)) * w));
  return { w, h };
}

function bitmapToDataUrl(pixels: Buffer, w: number, h: number): string | undefined {
  try {
    const img = nativeImage.createFromBitmap(pixels, { width: w, height: h });
    if (img.isEmpty()) return undefined;
    const jpeg = img.toJPEG(50);
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function captureOneMonitor(
  monitorIndex: number,
  bounds: { x: number; y: number; width: number; height: number },
  scale: PreviewScale,
): MonitorPreview {
  try {
    const native = getNative();
    const { w, h } = scaleSize(bounds, scale);
    const pixels = native.captureRect(bounds.x, bounds.y, bounds.width, bounds.height, w, h);
    return {
      monitorIndex,
      dataUrl: pixels ? bitmapToDataUrl(pixels, w, h) : undefined,
    };
  } catch {
    return { monitorIndex };
  }
}

/** Captura monitor a monitor cediendo el event loop para que la UI no se congele. */
async function captureAllMonitorsYielding(scale: PreviewScale): Promise<MonitorPreview[]> {
  if (!isWin) return _cache;
  const monitors = listMonitors();
  const out: MonitorPreview[] = [];
  for (const m of monitors) {
    if (_abort) break;
    await yieldMain();
    if (_abort) break;
    const shot = captureOneMonitor(m.index, m.bounds, scale);
    out.push(shot);
    _cache = _cache
      .filter((p) => p.monitorIndex !== shot.monitorIndex)
      .concat(shot)
      .sort((a, b) => a.monitorIndex - b.monitorIndex);
  }
  if (!_abort && out.length) _cache = out;
  return _cache;
}

async function previewTick(): Promise<void> {
  if (!_live || _capturing) return;
  _capturing = true;
  try {
    await captureAllMonitorsYielding(_scale);
  } catch (err) {
    logger.warn('screenCapture: tick falló', { message: (err as Error).message });
  } finally {
    _capturing = false;
  }
  if (_live && !_timer) {
    _timer = setTimeout(() => {
      _timer = null;
      void previewTick();
    }, _intervalMs);
  }
}

/** Compat: una pasada (p.ej. tests). No usar desde IPC síncrono. */
export async function captureAllMonitors(scale: PreviewScale = 1): Promise<MonitorPreview[]> {
  _abort = false;
  return captureAllMonitorsYielding(scale);
}
