import { app, BrowserWindow, screen, Menu, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc.js';
import { startCocinaServer } from './cocinaServer.js';
import { isWin } from './native/win32.js';
import { logger, getLogFilePath } from '../shared/logger.js';

let mainWindow: BrowserWindow | null = null;

// Build diagnostico: abre DevTools para ver errores de preload/renderer.
// Quitar OPEN_DEVTOOLS cuando la app este estable en produccion.
const OPEN_DEVTOOLS = true;

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
            logger.info('preload path', { path: join(__dirname, '../preload/index.js') });
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

app.whenReady().then(() => {
  if (!checkPlatform()) {
    app.quit();
    return;
  }
  Menu.setApplicationMenu(buildMenu());
  registerIpc();
  startCocinaServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
