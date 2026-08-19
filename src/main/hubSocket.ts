import { io as ioClient, type Socket } from 'socket.io-client';
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CocinaLayoutImport, HubConfig } from '../shared/types.js';
import { writeInbox } from './cocinaBridge.js';
import { applyCocinaInbox } from './layoutApply.js';
import { logger } from '../shared/logger.js';

const CONFIG_FILE = 'hub-config.json';
const DEFAULT_BACKEND = 'http://localhost:3000';

export const DEFAULT_HUB_CONFIG: HubConfig = {
  backendUrl: DEFAULT_BACKEND,
  previewScale: 1.5,
  previewIntervalMs: 400,
  fullscreenOnDeploy: true,
  autoDeployOnReceive: false,
};

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

function mergeConfig(partial: Partial<HubConfig> | null | undefined): HubConfig {
  const scale = partial?.previewScale;
  const previewScale: HubConfig['previewScale'] =
    scale === 1 || scale === 1.5 || scale === 2 ? scale : DEFAULT_HUB_CONFIG.previewScale;
  const interval = partial?.previewIntervalMs;
  return {
    backendUrl: typeof partial?.backendUrl === 'string' && partial.backendUrl
      ? partial.backendUrl
      : DEFAULT_HUB_CONFIG.backendUrl,
    previewScale,
    previewIntervalMs:
      typeof interval === 'number' && interval >= 200 && interval <= 2000
        ? Math.round(interval)
        : DEFAULT_HUB_CONFIG.previewIntervalMs,
    fullscreenOnDeploy: partial?.fullscreenOnDeploy ?? DEFAULT_HUB_CONFIG.fullscreenOnDeploy,
    autoDeployOnReceive: partial?.autoDeployOnReceive ?? DEFAULT_HUB_CONFIG.autoDeployOnReceive,
  };
}

export async function readConfig(): Promise<HubConfig> {
  try {
    const file = join(app.getPath('userData'), CONFIG_FILE);
    const raw = await fs.readFile(file, 'utf8');
    return mergeConfig(JSON.parse(raw) as Partial<HubConfig>);
  } catch {
    return { ...DEFAULT_HUB_CONFIG };
  }
}

export async function saveConfig(partial: Partial<HubConfig>): Promise<void> {
  const current = await readConfig();
  const next = mergeConfig({ ...current, ...partial });
  const file = join(app.getPath('userData'), CONFIG_FILE);
  await fs.writeFile(file, JSON.stringify(next, null, 2), 'utf8');
  if (next.backendUrl !== current.backendUrl) {
    void startHubSocket();
  }
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
        const live = await readConfig();
        if (live.autoDeployOnReceive && payload.slots?.length) {
          logger.info('hubSocket: auto-desplegar al recibir');
          try {
            await applyCocinaInbox({ kiosk: live.fullscreenOnDeploy });
          } catch (err) {
            logger.error('hubSocket: auto-desplegar falló', { message: (err as Error).message });
          }
        }
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
