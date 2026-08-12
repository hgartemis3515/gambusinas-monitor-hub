import { app, BrowserWindow, screen, Menu, shell } from 'electron';
import { join } from 'node:path';
import electronUpdater from 'electron-updater';
import { registerIpc } from './ipc.js';
import { startCocinaServer } from './cocinaServer.js';
import { startHubSocket, onStatus, readConfig, saveConfig, getStatus } from './hubSocket.js';
import { isWin } from './native/win32.js';
import { logger, getLogFilePath } from '../shared/logger.js';
import { IpcChannel } from '../shared/ipc-channels.js';
import { ipcMain } from 'electron';

// electron-updater es CommonJS; con "type":"module" el main corre como ESM,
// asi que usamos el default import y desestructuramos.
const { autoUpdater } = electronUpdater as typeof import('electron-updater');

let mainWindow: BrowserWindow | null = null;

// DevTools: abierto en desarrollo (no empaquetado) o si la variable de entorno
// MONITOR_HUB_DEVTOOLS=1 lo fuerza. En release estable queda cerrado
// (se puede abrir desde el menu Archivo -> Alternar DevTools).
const OPEN_DEVTOOLS = !app.isPackaged || process.env['MONITOR_HUB_DEVTOOLS'] === '1';

function createWindow(): void {
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.workArea;

  mainWindow = new BrowserWindow({
    width: Math.min(width, 1280),
    height: Math.min(height, 800),
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
            if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify();
            else logger.info('autoUpdater: ignorado en dev');
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
  ipcMain.handle(IpcChannel.HUB_CONFIG_SET, (_e, cfg: { backendUrl: string }) => saveConfig(cfg));
  ipcMain.handle(IpcChannel.HUB_STATUS, () => getStatus());
  onStatus((s) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('hub:status-changed', s);
    }
  });
}

// Auto-update: al abrir el Hub, busca actualizaciones; si hay, descarga e
// instala silenciosamente y reinicia la app. Solo en app empaquetada (no dev).
function setupAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    logger.info('autoUpdater: actualizacion disponible', { version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('autoUpdater: actualizacion descargada, instalando', { version: info.version });
    autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => {
    logger.warn('autoUpdater: error', { message: err.message });
  });
  void autoUpdater.checkForUpdatesAndNotify();
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
  // Conecta al backend por socket (conexion saliente, sin firewall inbound).
  void startHubSocket();
  // Busca actualizaciones automaticas al abrir el Hub.
  setupAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
