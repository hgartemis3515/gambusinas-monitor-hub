import React from 'react';
import type { MonitorInfo, WindowInfo, WindowMode, WindowProcessFilter } from '@shared/types';
import type { HubApi } from '../preload/index';
import { MonitorCard } from './components/MonitorCard';
import { WindowPicker } from './components/WindowPicker';
import { LayoutPanel } from './components/LayoutPanel';
import { HubStatus } from './components/HubStatus';

const POLL_MS = 3000;
const THUMB_MS = 5000;

export function App(): React.ReactElement {
  const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
  const [windows, setWindows] = React.useState<WindowInfo[]>([]);
  const [thumbs, setThumbs] = React.useState<WindowInfo[]>([]);
  const [filter, setFilter] = React.useState<WindowProcessFilter>('all');
  const [selectedHwnd, setSelectedHwnd] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const w = (typeof window !== 'undefined' ? (window as unknown as { hub?: unknown; __hubPreloadError?: string }).hub : undefined);
    const preloadErr = (typeof window !== 'undefined' ? (window as unknown as { __hubPreloadError?: string }).__hubPreloadError : undefined);
    if (!w) {
      setError(
        preloadErr
          ? `Preload falló: ${preloadErr}`
          : 'El preload del Hub no cargó (window.hub undefined). Reinstala la app o contacta soporte.'
      );
      setLoading(false);
      return;
    }
    if (typeof w === 'object' && w !== null && '__error' in w) {
      setError(`Preload error: ${(w as { __error: string }).__error}`);
      setLoading(false);
      return;
    }
    try {
      const [ms, ws] = await Promise.all([
        (w as HubApi).listMonitors(),
        (w as HubApi).listWindows(filter),
      ]);
      setMonitors(ms);
      setWindows(ws);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const refreshThumbs = React.useCallback(async () => {
    const hub = getHub();
    if (!hub) return;
    try {
      const t = await hub.listThumbnails();
      setThumbs(t);
    } catch {
      /* thumbnails best-effort */
    }
  }, []);

  React.useEffect(() => {
    void refreshThumbs();
    const id = setInterval(() => {
      void refreshThumbs();
    }, THUMB_MS);
    return () => clearInterval(id);
  }, [refreshThumbs]);

  // Merge thumbnails into windows (by hwnd).
  const thumbByHwnd = new Map<number, string | undefined>();
  for (const t of thumbs) thumbByHwnd.set(t.hwnd, t.thumbnail);
  const windowsWithThumbs: WindowInfo[] = windows.map((w) => ({
    ...w,
    thumbnail: w.thumbnail ?? thumbByHwnd.get(w.hwnd),
  }));

  function getHub(): HubApi | null {
    const w = window as unknown as { hub?: HubApi };
    return w.hub ?? null;
  }

  async function handleMove(hwnd: number, monitorIndex: number, mode: WindowMode): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    try {
      await hub.moveWindow(hwnd, monitorIndex, mode);
      await refresh();
    } catch (e) {
      setError('Mover: ' + (e as Error).message);
    }
  }

  async function handleSetMode(hwnd: number, mode: WindowMode): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    try {
      await hub.setWindowMode(hwnd, mode);
      await refresh();
    } catch (e) {
      setError('Modo: ' + (e as Error).message);
    }
  }

  async function handleIdentify(): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    try {
      await hub.identifyMonitors();
    } catch (e) {
      setError('Identificar: ' + (e as Error).message);
    }
  }

  const windowByMonitor = new Map<number, WindowInfo>();
  for (const w of windows) {
    if (!windowByMonitor.has(w.monitorIndex)) windowByMonitor.set(w.monitorIndex, w);
  }

  return (
    <div className="hub">
      <div className="panel">
        <div className="topbar">
          <span className="title">Gambusinas Monitor Hub</span>
          <HubStatus />
          <span className="spacer" />
          <button onClick={handleIdentify}>Identificar monitores</button>
          <button onClick={() => void refresh()}>Actualizar</button>
        </div>
        {error && <div className="error">⚠ {error}</div>}
        {loading && monitors.length === 0 ? (
          <div className="muted">Cargando…</div>
        ) : (
          <div className="monitor-grid">
            {monitors.map((m) => (
              <MonitorCard
                key={m.index}
                monitor={m}
                windowOnMonitor={windowByMonitor.get(m.index)}
                onIdentify={handleIdentify}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <LayoutPanel monitors={monitors} windows={windows} onRefresh={() => void refresh()} />
        </div>
      </div>

      <div className="panel">
        <h2>Ventanas abiertas</h2>
        <WindowPicker
          windows={windowsWithThumbs}
          monitors={monitors}
          filter={filter}
          selectedHwnd={selectedHwnd}
          onFilterChange={setFilter}
          onSelect={setSelectedHwnd}
          onMove={handleMove}
          onSetMode={handleSetMode}
        />
      </div>
    </div>
  );
}
