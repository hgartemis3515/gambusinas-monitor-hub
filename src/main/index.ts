import { app, BrowserWindow, screen, Menu, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc.js';
import { startCocinaServer } from './cocinaServer.js';
import { startHubSocket, onStatus, readConfig, saveConfig, getStatus } from './hubSocket.js';
import { isWin } from './native/win32.js';
import { logger, getLogFilePath } from '../shared/logger.js';
import { IpcChannel } from '../shared/ipc-channels.js';
import type { HubConfig } from '../shared/types.js';
import { ipcMain } from 'electron';
import { checkForHubUpdates, getUpdateStatus, setupAutoUpdater } from './autoUpdate.js';

let mainWindow: BrowserWindow | null = null;

// DevTools: abierto en desarrollo (no empaquetado) o si la variable de entorno
// MONITOR_HUB_DEVTOOLS=1 lo fuerza. En release estable queda cerrado
// (se puede abrir desde el menu Archivo -> Alternar DevTools).
const OPEN_DEVTOOLS = !app.isPackaged || process.env['MONITOR_HUB_DEVTOOLS'] === '1';

function createWindow(): void {
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.workArea;

  mainWindow = new BrowserWindow({
    width: Math.min(width, 1440),
    height: Math.min(height, 900),
    x: x + 40,
    y: y + 40,
    title: 'Gambusinas Monitor Hub',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (OPEN_DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('console-message', (_e, level, message) => {
    logger.info(`[renderer] ${message}`, { level });
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    logger.error('preload-error', { preloadPath, message: err.message });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Hub window creada', { primary: primary.id, bounds: primary.bounds });
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Alternar DevTools' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Diagnostico',
      submenu: [
        {
          label: 'Abrir carpeta de logs',
          click: () => {
            const logFile = getLogFilePath();
            const dir = logFile ? join(logFile, '..') : app.getPath('userData');
            void shell.openPath(dir);
          },
        },
        {
          label: 'Mostrar ruta del preload',
          click: () => {
            logger.info('preload path', { path: join(__dirname, '../preload/index.cjs') });
          },
        },
        {
          label: 'Buscar actualizaciones',
          click: () => {
            void checkForHubUpdates();
          },
        },
      ],
    },
  ]);
}

function checkPlatform(): boolean {
  if (!isWin) {
    logger.error('Gambusinas Monitor Hub solo funciona en Windows.');
    return false;
  }
  return true;
}

function registerHubIpc(): void {
  ipcMain.handle(IpcChannel.HUB_CONFIG_GET, () => readConfig());
  ipcMain.handle(IpcChannel.HUB_CONFIG_SET, (_e, cfg: Partial<HubConfig>) => saveConfig(cfg));
  ipcMain.handle(IpcChannel.HUB_STATUS, () => getStatus());
  ipcMain.handle(IpcChannel.HUB_VERSION, () => app.getVersion());
  ipcMain.handle(IpcChannel.HUB_UPDATER_STATUS, () => getUpdateStatus());
  ipcMain.handle(IpcChannel.HUB_UPDATER_CHECK, () => checkForHubUpdates());
  onStatus((s) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('hub:status-changed', s);
    }
  });
}

app.whenReady().then(() => {
  if (!checkPlatform()) {
    app.quit();
    return;
  }
  Menu.setApplicationMenu(buildMenu());
  registerIpc();
  registerHubIpc();
  startCocinaServer();
  void startHubSocket();
  setupAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
