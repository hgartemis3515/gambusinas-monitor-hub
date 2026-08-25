import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { CocinaLayoutImport, LayoutSlot } from '../shared/types.js';
import { logger } from '../shared/logger.js';
import { writeInbox } from './cocinaBridge.js';
import {
  clampChromeZoom,
  getChromeZoom,
  readChromeZooms,
  setAndApplyChromeZoom,
} from './chromeZoom.js';

const PORT = 7331;
const HOST = '0.0.0.0';

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function isValidImport(data: unknown): data is CocinaLayoutImport {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['slots']);
}

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch {
    return req.url || '/';
  }
}

export function startCocinaServer(): void {
  const server = createServer(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = pathnameOf(req);
    try {
      if (req.method === 'GET' && path === '/state') {
        send(res, 200, { ok: true, zooms: await readChromeZooms() });
        return;
      }
      if (req.method === 'GET' && path.startsWith('/zoom/')) {
        const n = Number(path.slice('/zoom/'.length));
        if (!Number.isInteger(n) || n < 1 || n > 32) {
          send(res, 400, { error: 'monitorIndex invalido' });
          return;
        }
        send(res, 200, { ok: true, monitorIndex: n, zoom: await getChromeZoom(n) });
        return;
      }
      if (req.method === 'POST' && path === '/zoom') {
        const parsed = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const n = Number(parsed['monitorIndex']);
        if (!Number.isInteger(n) || n < 1 || n > 32) {
          send(res, 400, { error: 'monitorIndex invalido' });
          return;
        }
        const result = await setAndApplyChromeZoom(n, clampChromeZoom(parsed['zoom']));
        send(res, 200, { ok: true, monitorIndex: n, ...result });
        return;
      }
      if (req.method === 'POST' && path === '/import') {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidImport(parsed)) {
          send(res, 400, { error: 'Payload invalido: se espera { source, profileName?, slots: [] }' });
          return;
        }
        const file = await writeInbox(parsed);
        logger.info('cocinaServer: import recibido', {
          slots: (parsed.slots as LayoutSlot[]).length,
          file,
        });
        send(res, 200, { ok: true, file, slots: parsed.slots.length });
        return;
      }
      send(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error('cocinaServer: error', { err });
      send(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(PORT, HOST, () => {
    logger.info(`cocinaServer escuchando en http://${HOST}:${PORT}`);
  });
  server.on('error', (err) => {
    logger.warn('cocinaServer no pudo arrancar', { err: err.message });
  });
}
