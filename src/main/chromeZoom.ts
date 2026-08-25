import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import WebSocket from 'ws';
import { logger } from '../shared/logger.js';

export function clampChromeZoom(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.min(200, Math.max(50, Math.round(v)));
}

export function debugPortForMonitor(index: number): number {
  return 9330 + Number(index);
}

export function withHubZoom(url: string, percent: number): string {
  const z = clampChromeZoom(percent);
  try {
    const u = new URL(url);
    u.searchParams.set('hubZoom', String(z));
    return u.toString();
  } catch {
    const stripped = url.replace(/([?&])hubZoom=\d+/g, '').replace(/\?&/, '?').replace(/&&/g, '&');
    const sep = stripped.includes('?') ? '&' : '?';
    return `${stripped}${sep}hubZoom=${z}`;
  }
}

function zoomsPath(): string {
  return join(app.getPath('userData'), 'chrome-zooms.json');
}

export async function readChromeZooms(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile(zoomsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      out[String(k)] = clampChromeZoom(v);
    }
    return out;
  } catch {
    return {};
  }
}

export async function getChromeZoom(monitorIndex: number): Promise<number> {
  const all = await readChromeZooms();
  return all[String(monitorIndex)] ?? 100;
}

export async function setChromeZoomPersist(monitorIndex: number, percent: number): Promise<number> {
  const z = clampChromeZoom(percent);
  const all = await readChromeZooms();
  all[String(monitorIndex)] = z;
  await fs.writeFile(zoomsPath(), JSON.stringify(all, null, 2), 'utf8');
  logger.info('chromeZoom: guardado', { monitorIndex, zoom: z });
  return z;
}

function sendEval(wsUrl: string, expression: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch { /* noop */ }
      reject(new Error('CDP timeout'));
    }, 4000);
    ws.once('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }));
    });
    ws.once('message', () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* noop */ }
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Aplica zoom CSS a la página Chrome kiosk vía DevTools (127.0.0.1). */
export async function applyChromeZoomLive(monitorIndex: number, percent: number): Promise<boolean> {
  const z = clampChromeZoom(percent);
  const port = debugPortForMonitor(monitorIndex);
  const factor = (z / 100).toFixed(4);
  const expression = `document.documentElement.style.zoom='${factor}';true`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
    const tabs = (await res.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
    const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) return false;
    await sendEval(page.webSocketDebuggerUrl, expression);
    logger.info('chromeZoom: CDP ok', { monitorIndex, zoom: z });
    return true;
  } catch (err) {
    logger.warn('chromeZoom: CDP no alcanzó Chrome', {
      monitorIndex,
      port,
      message: (err as Error).message,
    });
    return false;
  }
}

export async function setAndApplyChromeZoom(
  monitorIndex: number,
  percent: number,
): Promise<{ zoom: number; live: boolean }> {
  const zoom = await setChromeZoomPersist(monitorIndex, percent);
  const live = await applyChromeZoomLive(monitorIndex, zoom);
  return { zoom, live };
}
