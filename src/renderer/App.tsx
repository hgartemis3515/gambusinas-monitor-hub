import React from 'react';
import type { MonitorInfo, WindowInfo, WindowMode, WindowProcessFilter } from '@shared/types';
import { MonitorCard } from './components/MonitorCard';
import { WindowPicker } from './components/WindowPicker';
import { LayoutPanel } from './components/LayoutPanel';

const POLL_MS = 3000;

export function App(): React.ReactElement {
  const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
  const [windows, setWindows] = React.useState<WindowInfo[]>([]);
  const [filter, setFilter] = React.useState<WindowProcessFilter>('all');
  const [selectedHwnd, setSelectedHwnd] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (typeof window === 'undefined' || !window.hub) {
      setError('El preload del Hub no cargó. Reinstala la app o contacta soporte.');
      setLoading(false);
      return;
    }
    try {
      const [ms, ws] = await Promise.all([
        window.hub.listMonitors(),
        window.hub.listWindows(filter),
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

  async function handleMove(hwnd: number, monitorIndex: number, mode: WindowMode): Promise<void> {
    try {
      await window.hub.moveWindow(hwnd, monitorIndex, mode);
      await refresh();
    } catch (e) {
      setError('Mover: ' + (e as Error).message);
    }
  }

  async function handleSetMode(hwnd: number, mode: WindowMode): Promise<void> {
    try {
      await window.hub.setWindowMode(hwnd, mode);
      await refresh();
    } catch (e) {
      setError('Modo: ' + (e as Error).message);
    }
  }

  async function handleIdentify(): Promise<void> {
    try {
      await window.hub.identifyMonitors();
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
          windows={windows}
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
