import { io as ioClient, type Socket } from 'socket.io-client';
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CocinaLayoutImport } from '../shared/types.js';
import { writeInbox } from './cocinaBridge.js';
import { logger } from '../shared/logger.js';

const CONFIG_FILE = 'hub-config.json';
const DEFAULT_BACKEND = 'http://localhost:3000';

export interface HubConfig {
  backendUrl: string;
}

let _socket: Socket | null = null;
let _status: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let _onStatus: ((s: string) => void) | null = null;

export function onStatus(cb: (s: string) => void): void {
  _onStatus = cb;
  cb(_status);
}

function setStatus(s: 'disconnected' | 'connecting' | 'connected'): void {
  _status = s;
  _onStatus?.(s);
  logger.info(`hubSocket: ${s}`);
}

export async function readConfig(): Promise<HubConfig> {
  try {
    const file = join(app.getPath('userData'), CONFIG_FILE);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as HubConfig;
  } catch {
    return { backendUrl: DEFAULT_BACKEND };
  }
}

export async function saveConfig(cfg: HubConfig): Promise<void> {
  const file = join(app.getPath('userData'), CONFIG_FILE);
  await fs.writeFile(file, JSON.stringify(cfg, null, 2), 'utf8');
  // Reconectar con la nueva URL.
  void startHubSocket();
}

export async function startHubSocket(): Promise<void> {
  const cfg = await readConfig();
  const url = cfg.backendUrl.replace(/\/$/, '');
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
  setStatus('connecting');
  logger.info('hubSocket: conectando a', { url: `${url}/hub` });
  try {
    const sock = ioClient(`${url}/hub`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 5000,
    });
    sock.on('connect', () => {
      logger.info('hubSocket: conectado', { url });
      setStatus('connected');
    });
    sock.on('disconnect', (reason) => {
      logger.warn('hubSocket: desconectado', { reason: String(reason) });
      setStatus('disconnected');
    });
    sock.on('connect_error', (err) => {
      logger.error('hubSocket: connect_error', {
        url,
        message: err.message,
        description: (err as { description?: string }).description,
      });
    });
    sock.on('reconnect_attempt', (attempt) => {
      logger.info('hubSocket: reconnect_attempt', { attempt, url });
    });
    sock.on('hub:layout', async (payload: CocinaLayoutImport) => {
      try {
        await writeInbox(payload);
        logger.info('hubSocket: layout recibido y guardado en inbox', {
          slots: payload.slots?.length ?? 0,
        });
      } catch (err) {
        logger.error('hubSocket: error guardando layout', {
          message: (err as Error).message,
        });
      }
    });
    _socket = sock;
  } catch (err) {
    setStatus('disconnected');
    logger.error('hubSocket: no pudo conectar', { url, message: (err as Error).message });
  }
}

export function getStatus(): string {
  return _status;
}
