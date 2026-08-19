import { desktopCapturer, nativeImage, screen } from 'electron';
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

export function getCachedPreviews(): MonitorPreview[] {
  return _cache;
}

function scaleSize(
  bounds: { width: number; height: number },
  scale: PreviewScale,
): { w: number; h: number } {
  const maxW = SCALE_WIDTH[scale] ?? 720;
  const w = Math.max(1, Math.min(maxW, bounds.width));
  const h = Math.max(1, Math.round((bounds.height / Math.max(1, bounds.width)) * w));
  return { w, h };
}

function bitmapToDataUrl(pixels: Buffer, w: number, h: number): string | undefined {
  try {
    const img = nativeImage.createFromBitmap(pixels, { width: w, height: h });
    if (img.isEmpty()) return undefined;
    const jpeg = img.toJPEG(72);
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function captureBitBlt(scale: PreviewScale): MonitorPreview[] | null {
  if (!isWin) return null;
  try {
    const native = getNative();
    const monitors = listMonitors();
    const out: MonitorPreview[] = [];
    for (const m of monitors) {
      const { w, h } = scaleSize(m.bounds, scale);
      const pixels = native.captureRect(m.bounds.x, m.bounds.y, m.bounds.width, m.bounds.height, w, h);
      out.push({
        monitorIndex: m.index,
        dataUrl: pixels ? bitmapToDataUrl(pixels, w, h) : undefined,
      });
    }
    return out;
  } catch (err) {
    logger.warn('screenCapture: BitBlt falló', { message: (err as Error).message });
    return null;
  }
}

async function captureDesktopCapturer(scale: PreviewScale): Promise<MonitorPreview[]> {
  const monitors = listMonitors();
  const maxW = SCALE_WIDTH[scale] ?? 720;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxW, height: Math.round(maxW * 0.6) },
  });
  const displays = screen.getAllDisplays();
  return monitors.map((m) => {
    const display = displays.find(
      (d) => d.bounds.x === m.bounds.x && d.bounds.y === m.bounds.y,
    );
    const source =
      (display && sources.find((s) => String(s.display_id) === String(display.id))) ||
      sources.find((s, i) => i === m.index - 1);
    const thumb = source?.thumbnail;
    return {
      monitorIndex: m.index,
      dataUrl: thumb && !thumb.isEmpty() ? `data:image/jpeg;base64,${thumb.toJPEG(72).toString('base64')}` : undefined,
    };
  });
}

export async function captureAllMonitors(scale: PreviewScale = 1.5): Promise<MonitorPreview[]> {
  const bitblt = captureBitBlt(scale);
  const hasAny = bitblt?.some((p) => Boolean(p.dataUrl));
  const result = hasAny && bitblt ? bitblt : await captureDesktopCapturer(scale);
  _cache = result;
  return result;
}
