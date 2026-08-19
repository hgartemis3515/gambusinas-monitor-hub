import { BrowserWindow } from 'electron';

export function notifyInboxUpdated(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('hub:inbox-updated');
  }
}
