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

/**
 * Viewport CSS como el zoom nativo de Chrome (Ctrl +/-):
 * al alejar caben más elementos (innerWidth crece); al acercar, menos.
 * 100% → null (usar métricas nativas).
 */
export function chromeZoomViewport(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  percent: number,
): { width: number; height: number; deviceScaleFactor: number } | null {
  const factor = clampChromeZoom(percent) / 100;
  if (factor === 1) return null;
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    width: Math.max(320, Math.round(cssWidth / factor)),
    height: Math.max(240, Math.round(cssHeight / factor)),
    deviceScaleFactor: Math.max(0.5, Math.min(4, Number((safeDpr * factor).toFixed(4)))),
  };
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

type CdpResult = { result?: unknown; error?: { message?: string } };

function withCdpSession<T>(wsUrl: string, fn: (call: (method: string, params?: Record<string, unknown>) => Promise<unknown>) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch { /* noop */ }
      reject(new Error('CDP timeout'));
    }, 8000);

    const call = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<unknown>((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      });

    ws.once('open', () => {
      void fn(call).then((out) => {
        clearTimeout(timer);
        try { ws.close(); } catch { /* noop */ }
        resolve(out);
      }).catch((err) => {
        clearTimeout(timer);
        try { ws.close(); } catch { /* noop */ }
        reject(err);
      });
    });
    ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: { id?: number } & CdpResult;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.id == null) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
      else p.resolve(msg.result);
    });
    ws.once('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function pageWsUrl(port: number): Promise<string | null> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
  const tabs = (await res.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
  const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  return page?.webSocketDebuggerUrl || null;
}

function evalValue<T>(result: unknown): T {
  const r = result as { result?: { value?: T } };
  return r?.result?.value as T;
}

/**
 * Zoom de página igual al de Chrome (Ctrl +/-): cambia el viewport CSS
 * (Emulation.setDeviceMetricsOverride). CSS zoom solo es fallback.
 */
export async function applyChromeZoomLive(monitorIndex: number, percent: number): Promise<boolean> {
  const z = clampChromeZoom(percent);
  const port = debugPortForMonitor(monitorIndex);
  try {
    const wsUrl = await pageWsUrl(port);
    if (!wsUrl) return false;

    return await withCdpSession(wsUrl, async (call) => {
      await call('Runtime.evaluate', {
        expression: `(() => {
          const r = document.documentElement;
          r.style.zoom = '';
          r.style.transform = '';
          r.style.width = '';
          r.style.height = '';
          if (document.body) document.body.style.zoom = '';
          return true;
        })()`,
        returnByValue: true,
      });
      try {
        await call('Emulation.clearDeviceMetricsOverride', {});
      } catch {
        /* no había override */
      }
      const metrics = evalValue<{ w: number; h: number; dpr: number }>(
        await call('Runtime.evaluate', {
          expression: `({
            w: window.innerWidth,
            h: window.innerHeight,
            dpr: window.devicePixelRatio || 1
          })`,
          returnByValue: true,
        }),
      );
      const w = Number(metrics?.w) || 0;
      const h = Number(metrics?.h) || 0;
      const dpr = Number(metrics?.dpr) || 1;
      if (w < 100 || h < 100) {
        logger.warn('chromeZoom: viewport invalido', { monitorIndex, w, h });
        return false;
      }
      const vp = chromeZoomViewport(w, h, dpr, z);
      if (!vp) {
        logger.info('chromeZoom: CDP 100%', { monitorIndex });
        return true;
      }
      await call('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor,
        mobile: false,
      });
      logger.info('chromeZoom: CDP viewport', { monitorIndex, zoom: z, ...vp });
      return true;
    });
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
