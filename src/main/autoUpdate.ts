import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { logger } from '../shared/logger.js';
import type { HubUpdateStatus } from '../shared/types.js';

const { autoUpdater } = electronUpdater as typeof import('electron-updater');

const CHECK_MS = 15 * 60 * 1000;

let status: HubUpdateStatus = {
  state: 'idle',
  currentVersion: '',
  packaged: false,
};

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('hub:update-status', status);
  }
}

function setStatus(partial: Partial<HubUpdateStatus>): void {
  status = { ...status, ...partial };
  broadcast();
}

export function getUpdateStatus(): HubUpdateStatus {
  return status;
}

export async function checkForHubUpdates(): Promise<HubUpdateStatus> {
  if (!app.isPackaged) {
    setStatus({
      state: 'dev',
      message: 'En desarrollo no hay auto-update. Usa la app instalada.',
      lastCheckAt: new Date().toISOString(),
    });
    return status;
  }
  setStatus({ state: 'checking', message: 'Buscando actualizaciones…' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setStatus({
      state: 'error',
      message: (err as Error).message,
      lastCheckAt: new Date().toISOString(),
    });
  }
  return status;
}

export function setupAutoUpdater(): void {
  status.currentVersion = app.getVersion();
  status.packaged = app.isPackaged;
  if (!app.isPackaged) {
    logger.info('autoUpdater: ignorado en dev');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', message: 'Buscando actualizaciones…' });
  });
  autoUpdater.on('update-available', (info) => {
    logger.info('autoUpdater: actualizacion disponible', { version: info.version });
    setStatus({
      state: 'available',
      availableVersion: info.version,
      message: `Descargando v${info.version}…`,
    });
  });
  autoUpdater.on('update-not-available', () => {
    setStatus({
      state: 'idle',
      message: 'Estás al día',
      lastCheckAt: new Date().toISOString(),
    });
  });
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent || 0);
    setStatus({
      state: 'downloading',
      message: `Descargando ${pct}%`,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('autoUpdater: actualizacion descargada, instalando', { version: info.version });
    setStatus({
      state: 'installing',
      availableVersion: info.version,
      message: `Instalando v${info.version} y reiniciando…`,
      lastCheckAt: new Date().toISOString(),
    });
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 2500);
  });
  autoUpdater.on('error', (err) => {
    logger.warn('autoUpdater: error', { message: err.message });
    setStatus({
      state: 'error',
      message: err.message,
      lastCheckAt: new Date().toISOString(),
    });
  });

  void checkForHubUpdates();
  setInterval(() => {
    void checkForHubUpdates();
  }, CHECK_MS);
}
