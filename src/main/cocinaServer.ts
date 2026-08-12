import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { CocinaLayoutImport, LayoutSlot } from '../shared/types.js';
import { logger } from '../shared/logger.js';

const PORT = 7331;
const HOST = '127.0.0.1';

function inboxDir(): string {
  return join(app.getPath('userData'), 'cocina-inbox');
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

export function startCocinaServer(): void {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/import') {
      send(res, 404, { error: 'Not found' });
      return;
    }
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidImport(parsed)) {
        send(res, 400, { error: 'Payload invalido: se espera { source, profileName?, slots: [] }' });
        return;
      }
      await fs.mkdir(inboxDir(), { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(inboxDir(), `cocina-${stamp}.json`);
      await fs.writeFile(file, JSON.stringify(parsed, null, 2), 'utf8');
      logger.info('cocinaServer: import recibido', {
        slots: (parsed.slots as LayoutSlot[]).length,
        file,
      });
      send(res, 200, { ok: true, file, slots: parsed.slots.length });
    } catch (err) {
      logger.error('cocinaServer: error', { err });
      send(res, 500, { error: (err as Error).message });
    }
  });

  server.listen(PORT, HOST, () => {
    logger.info(`cocinaServer escuchando en http://${HOST}:${PORT}/import`);
  });
  server.on('error', (err) => {
    logger.warn('cocinaServer no pudo arrancar', { err: err.message });
  });
}
