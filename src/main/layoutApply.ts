import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { app, shell } from 'electron';
import type { CocinaLayoutImport, LayoutProfile, LayoutSlot, WindowInfo, WindowMode } from '../shared/types.js';
import { listMonitors } from './monitors.js';
import { listWindows } from './windows.js';
import { moveWindowToMonitor } from './windowManager.js';
import { isWin } from './native/win32.js';
import { readInbox, validateSlots } from './cocinaBridge.js';
import { logger } from '../shared/logger.js';
import {
  applyChromeZoomLive,
  debugPortForMonitor,
  getChromeZoom,
  withHubZoom,
} from './chromeZoom.js';

const execFileAsync = promisify(execFile);

function findChromePath(): string | null {
  if (!isWin) return null;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function matchWindow(slots: WindowInfo[], slot: LayoutSlot): WindowInfo | undefined {
  return slots.find((w) => {
    if (slot.match?.process) {
      const proc = w.processName.toLowerCase();
      if (!proc.includes(slot.match.process.toLowerCase())) return false;
    }
    if (slot.match?.titleContains) {
      if (!w.title.toLowerCase().includes(slot.match.titleContains.toLowerCase())) return false;
    }
    return Boolean(slot.match?.process || slot.match?.titleContains);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentBrowserHwnds(): Set<number> {
  return new Set(
    listWindows('all')
      .filter((w) => {
        const p = w.processName.toLowerCase();
        return p.includes('chrome') || p.includes('msedge') || p.includes('edge');
      })
      .map((w) => w.hwnd),
  );
}

async function placeNewBrowserWindow(
  monitorIndex: number,
  mode: WindowMode,
  before: Set<number>,
): Promise<boolean> {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await sleep(400);
    const fresh = listWindows('all').filter((w) => {
      const p = w.processName.toLowerCase();
      const isBrowser = p.includes('chrome') || p.includes('msedge') || p.includes('edge');
      return isBrowser && !before.has(w.hwnd);
    });
    const target = fresh[fresh.length - 1];
    if (target) {
      moveWindowToMonitor(target.hwnd, monitorIndex, mode);
      return true;
    }
  }
  return false;
}

function redactUrl(url: string): string {
  const i = url.indexOf('#hubAuth=');
  return i >= 0 ? `${url.slice(0, i)}#hubAuth=***` : url;
}

function withHubAuth(url: string, authBundle?: string): string {
  if (!url || url.includes('#hubAuth=')) return url;
  if (!authBundle) return url;
  const hash = Buffer.from(authBundle, 'utf8').toString('base64url');
  return `${url}#hubAuth=${hash}`;
}

function kioskUserDataDir(monitorIndex: number): string {
  return join(app.getPath('userData'), 'chrome-kiosk', `M${monitorIndex}`);
}

function mergeJsonFile(path: string, patch: Record<string, unknown>): void {
  let current: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      current = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }
  writeFileSync(path, JSON.stringify({ ...current, ...patch }));
}

/** Preferencias Chrome: apagar Translate y fijar locale es (perfil kiosk fresco). */
function prepareKioskProfile(userDataDir: string): void {
  try {
    if (existsSync(join(userDataDir, 'lockfile')) || existsSync(join(userDataDir, 'SingletonLock'))) {
      return;
    }
    mkdirSync(join(userDataDir, 'Default'), { recursive: true });
    mergeJsonFile(join(userDataDir, 'Default', 'Preferences'), {
      translate: { enabled: false },
      translate_blocked_languages: ['en', 'es'],
      intl: { accept_languages: 'es-419,es' },
      browser: {
        check_default_browser: false,
        has_seen_welcome_page: true,
        enable_spellchecking: false,
      },
    });
    mergeJsonFile(join(userDataDir, 'Local State'), {
      intl: { app_locale: 'es', selected_languages: { translate_blocked_languages: ['en', 'es'] } },
    });
  } catch (err) {
    logger.warn('prepareKioskProfile: no se pudieron escribir prefs', {
      message: (err as Error).message,
    });
  }
}

/** Cierra solo Chrome/Edge lanzados por el Hub (`--user-data-dir=...chrome-kiosk`). */
async function killKioskBrowsers(): Promise<void> {
  if (!isWin) return;
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -like '*chrome-kiosk*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { timeout: 8000, windowsHide: true },
    );
    await sleep(500);
  } catch {
    /* best-effort: si no se pueden cerrar, el spawn igual abre la URL */
  }
}

function debugFlags(monitorIndex: number): string[] {
  return [
    `--remote-debugging-port=${debugPortForMonitor(monitorIndex)}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-allow-origins=*',
  ];
}

function buildSpawnArgs(
  slot: LayoutSlot,
  bounds: { x: number; y: number; width: number; height: number },
  kiosk: boolean,
  url: string,
): string[] {
  const quietFlags = [
    '--disable-features=Translate,TranslateUI,LanguageDetection,TFLiteLanguageDetection',
    '--disable-translate',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-infobars',
    '--lang=es-419',
    '--accept-lang=es-419,es',
    ...debugFlags(slot.monitorIndex),
  ];
  const userData = kioskUserDataDir(slot.monitorIndex);
  prepareKioskProfile(userData);
  const pos = [`--window-position=${bounds.x},${bounds.y}`, `--window-size=${bounds.width},${bounds.height}`];
  if (slot.mode === 'fullscreen' && kiosk) {
    return [
      `--user-data-dir=${userData}`,
      '--kiosk',
      '--disable-pinch',
      '--new-window',
      ...quietFlags,
      ...pos,
      url,
    ];
  }
  if (slot.mode === 'fullscreen') {
    return [
      `--user-data-dir=${userData}`,
      '--new-window',
      ...quietFlags,
      '--start-fullscreen',
      ...pos,
      url,
    ];
  }
  return [
    `--user-data-dir=${userData}`,
    '--new-window',
    ...quietFlags,
    ...pos,
    url,
  ];
}

export async function applyLayout(
  profile: LayoutProfile,
  opts?: { kiosk?: boolean },
): Promise<{ applied: number; opened: number; errors: string[] }> {
  const monitors = listMonitors();
  const errors: string[] = [];
  let applied = 0;
  let opened = 0;
  const chromePath = findChromePath();
  const kiosk = opts?.kiosk !== false;

  for (const slot of profile.slots) {
    const monitor = monitors.find((m) => m.index === slot.monitorIndex);
    if (!monitor) {
      errors.push(`Monitor ${slot.monitorIndex} no encontrado`);
      continue;
    }
    const windows = listWindows('all');
    const target = matchWindow(windows, slot);
    if (target) {
      try {
        moveWindowToMonitor(target.hwnd, slot.monitorIndex, slot.mode);
        applied++;
        const zoom = await getChromeZoom(slot.monitorIndex);
        void applyChromeZoomLive(slot.monitorIndex, zoom);
      } catch (err) {
        errors.push(`Mover hwnd ${target.hwnd}: ${(err as Error).message}`);
      }
      continue;
    }
    if (!slot.url) {
      errors.push(`Sin ventana para M${slot.monitorIndex} y sin url`);
      continue;
    }
    if (!chromePath) {
      void shell.openExternal(slot.url);
      opened++;
      errors.push('Chrome/Edge no encontrado; abriendo en navegador por defecto');
      continue;
    }
    const before = currentBrowserHwnds();
    const zoom = await getChromeZoom(slot.monitorIndex);
    const url = withHubZoom(slot.url, zoom);
    const args = buildSpawnArgs(slot, monitor.bounds, kiosk, url);
    spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
    opened++;
    logger.info('applyLayout: abierto navegador', {
      slot: slot.monitorIndex,
      url: redactUrl(url),
      kiosk,
      zoom,
    });
    // Kiosk ya es pantalla completa: no enviar F11 (lo apagaría). Mover al monitor.
    const placeMode: WindowMode = kiosk && slot.mode === 'fullscreen' ? 'maximized' : slot.mode;
    const placed = await placeNewBrowserWindow(slot.monitorIndex, placeMode, before);
    if (!placed) {
      errors.push(`M${slot.monitorIndex}: ventana abierta pero no se pudo posicionar a tiempo`);
    }
    void sleep(1800).then(() => applyChromeZoomLive(slot.monitorIndex, zoom));
  }
  logger.info('applyLayout: fin', { profile: profile.name, applied, opened, errors: errors.length });
  return { applied, opened, errors };
}

function injectAuthIntoSlots(data: CocinaLayoutImport): LayoutSlot[] {
  const slots = validateSlots(data.slots) ?? [];
  return slots.map((s) =>
    s.url ? { ...s, url: withHubAuth(s.url, data.authBundle) } : s,
  );
}

export async function applyCocinaInbox(
  opts?: { kiosk?: boolean },
): Promise<{ applied: number; opened: number; errors: string[] }> {
  const data = await readInbox();
  if (!data || !data.slots?.length) {
    throw new Error(
      'No hay layout de Cocina en el inbox. Envía desde la App Cocina ("Enviar al Monitor Hub" o Aplicar).',
    );
  }
  await killKioskBrowsers();
  const profile: LayoutProfile = {
    id: `cocina-${Date.now()}`,
    name: data.profileName || `Cocina ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: injectAuthIntoSlots(data),
  };
  return applyLayout(profile, { kiosk: opts?.kiosk !== false });
}
