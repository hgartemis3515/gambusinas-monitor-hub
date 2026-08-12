import { app, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc.js';
import { startCocinaServer } from './cocinaServer.js';
import { isWin } from './native/win32.js';
import { logger } from '../shared/logger.js';

let mainWindow: BrowserWindow | null = null;

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
      preload: join(__dirname, '../preload/index.js'),
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Hub window creada', { primary: primary.id, bounds: primary.bounds });
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
