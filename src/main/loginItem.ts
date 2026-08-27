import { app } from 'electron';
import { logger } from '../shared/logger.js';

export function applyOpenAtLogin(enabled: boolean): void {
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
        path: process.execPath,
        args: [app.getAppPath()],
      });
    }
    logger.info('loginItem', { openAtLogin: enabled, packaged: app.isPackaged });
  } catch (e) {
    logger.error('loginItem failed', { message: (e as Error).message });
  }
}

export function isOpenAtLogin(): boolean {
  try {
    return !!app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
