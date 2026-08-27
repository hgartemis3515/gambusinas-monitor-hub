import React from 'react';
import type {
  HubConfig,
  HubCocinero,
  LayoutSlot,
  MonitorInfo,
  MonitorPreview,
  WindowInfo,
  WindowMode,
  WindowProcessFilter,
} from '@shared/types';
import type { HubApi } from '../preload/index';
import { MonitorCard } from './components/MonitorCard';
import { WindowPicker } from './components/WindowPicker';
import { LayoutPanel } from './components/LayoutPanel';
import { Sidebar, type HubView } from './components/Sidebar';
import { CocinaPanel } from './components/CocinaPanel';
import { SettingsPanel } from './components/SettingsPanel';

const DEFAULT_CFG: HubConfig = {
  backendUrl: '',
  previewScale: 1,
  previewIntervalMs: 1500,
  fullscreenOnDeploy: true,
  autoDeployOnReceive: false,
  openAtLogin: false,
  autoDeployOnStartup: false,
};

export function App(): React.ReactElement {
  const [view, setView] = React.useState<HubView>('monitores');
  const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
  const [windows, setWindows] = React.useState<WindowInfo[]>([]);
  const [thumbs, setThumbs] = React.useState<WindowInfo[]>([]);
  const [previews, setPreviews] = React.useState<MonitorPreview[]>([]);
  const [filter, setFilter] = React.useState<WindowProcessFilter>('all');
  const [selectedHwnd, setSelectedHwnd] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState('disconnected');
  const [version, setVersion] = React.useState('');
  const [cfg, setCfg] = React.useState<HubConfig>(DEFAULT_CFG);
  const [inboxCount, setInboxCount] = React.useState(0);
  const [slots, setSlots] = React.useState<LayoutSlot[]>([]);
  const [cocineros, setCocineros] = React.useState<HubCocinero[]>([]);
  const [identifyOn, setIdentifyOn] = React.useState(false);
  const [changingMonitor, setChangingMonitor] = React.useState<number | null>(null);
  const [zooms, setZooms] = React.useState<Record<string, number>>({});
  const zoomTimers = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function getHub(): HubApi | null {
    const w = window as unknown as { hub?: HubApi };
    return w.hub ?? null;
  }

  const refresh = React.useCallback(async () => {
    const w = typeof window !== 'undefined'
      ? (window as unknown as { hub?: unknown; __hubPreloadError?: string }).hub
      : undefined;
    const preloadErr = typeof window !== 'undefined'
      ? (window as unknown as { __hubPreloadError?: string }).__hubPreloadError
      : undefined;
    if (!w) {
      setError(
        preloadErr
          ? `Preload falló: ${preloadErr}`
          : 'El preload del Hub no cargó (window.hub undefined). Reinstala la app o contacta soporte.',
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
      const hub = w as HubApi;
      const ms = await hub.listMonitors();
      setMonitors(ms);
      if (view === 'monitores' || view === 'ventanas' || view === 'layouts') {
        const ws = await hub.listWindows(filter);
        setWindows(ws);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, view]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (view !== 'monitores' && view !== 'ventanas') return;
    const id = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [refresh, view]);

  React.useEffect(() => {
    const hub = getHub();
    void hub?.setPreviewsLive?.(view === 'monitores');
    return () => {
      void hub?.setPreviewsLive?.(false);
    };
  }, [view]);

  const refreshPreviews = React.useCallback(async () => {
    const hub = getHub();
    if (!hub?.listMonitorPreviews) return;
    try {
      const p = await hub.listMonitorPreviews();
      setPreviews((prev) => {
        return p.map((item) => ({
          monitorIndex: item.monitorIndex,
          dataUrl: item.dataUrl || prev.find((x) => x.monitorIndex === item.monitorIndex)?.dataUrl,
        }));
      });
    } catch {
      /* best-effort */
    }
  }, []);

  React.useEffect(() => {
    if (view !== 'monitores') return;
    void refreshPreviews();
    const id = setInterval(() => {
      void refreshPreviews();
    }, 1000);
    return () => clearInterval(id);
  }, [view, refreshPreviews]);

  const refreshThumbs = React.useCallback(async () => {
    const hub = getHub();
    if (!hub) return;
    try {
      const t = await hub.listThumbnails();
      setThumbs(t);
    } catch {
      /* best-effort */
    }
  }, []);

  React.useEffect(() => {
    if (view !== 'ventanas') return;
    void refreshThumbs();
    const id = setInterval(() => {
      void refreshThumbs();
    }, 2000);
    return () => clearInterval(id);
  }, [view, refreshThumbs]);

  React.useEffect(() => {
    const hub = getHub();
    if (!hub) return;
    void hub.getVersion().then(setVersion).catch(() => undefined);
    void hub.getHubStatus().then(setStatus).catch(() => undefined);
    hub.onHubStatus(setStatus);
    void hub.getHubConfig().then(setCfg).catch(() => undefined);
    void hub.importFromCocina().then((d) => {
      setInboxCount(d?.slots?.length ?? 0);
      setSlots(d?.slots ?? []);
    }).catch(() => undefined);
    void hub.listCocineros?.().then(setCocineros).catch(() => undefined);
    void hub.identifyStatus?.().then(setIdentifyOn).catch(() => undefined);
    void hub.getChromeZooms?.().then(setZooms).catch(() => undefined);
    return hub.onInboxUpdated(() => {
      void hub.importFromCocina().then((d) => {
        setInboxCount(d?.slots?.length ?? 0);
        setSlots(d?.slots ?? []);
      }).catch(() => undefined);
      void hub.listCocineros?.().then(setCocineros).catch(() => undefined);
    });
  }, []);

  const thumbByHwnd = new Map<number, string | undefined>();
  for (const t of thumbs) thumbByHwnd.set(t.hwnd, t.thumbnail);
  const windowsWithThumbs: WindowInfo[] = windows.map((w) => ({
    ...w,
    thumbnail: w.thumbnail ?? thumbByHwnd.get(w.hwnd),
  }));

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
      const res = await hub.identifyMonitors();
      setIdentifyOn(typeof res === 'object' && res ? !!res.active : !identifyOn);
    } catch (e) {
      setError('Identificar: ' + (e as Error).message);
    }
  }

  async function handleChangeCocinero(monitorIndex: number, cook: HubCocinero): Promise<void> {
    const hub = getHub();
    if (!hub?.setSlotCocinero) return;
    setChangingMonitor(monitorIndex);
    setError(null);
    try {
      const res = await hub.setSlotCocinero(monitorIndex, cook, {
        deploy: true,
        kiosk: cfg.fullscreenOnDeploy !== false,
      });
      if (res.inbox?.slots) setSlots(res.inbox.slots);
      setInboxCount(res.inbox?.slots?.length ?? 0);
      if (res.deploy?.errors?.length) {
        setError('Cocinero actualizado, pero al desplegar: ' + res.deploy.errors.join('; '));
      }
      await refresh();
    } catch (e) {
      setError('Cambiar cocinero: ' + (e as Error).message);
    } finally {
      setChangingMonitor(null);
    }
  }

  function handleChromeZoom(monitorIndex: number, percent: number): void {
    setZooms((prev) => ({ ...prev, [String(monitorIndex)]: percent }));
    const prevTimer = zoomTimers.current[monitorIndex];
    if (prevTimer) clearTimeout(prevTimer);
    zoomTimers.current[monitorIndex] = setTimeout(() => {
      void getHub()?.setChromeZoom(monitorIndex, percent);
    }, 80);
  }

  const windowByMonitor = new Map<number, WindowInfo>();
  for (const w of windowsWithThumbs) {
    if (!windowByMonitor.has(w.monitorIndex)) windowByMonitor.set(w.monitorIndex, w);
  }
  const previewByMonitor = new Map<number, string | undefined>();
  for (const p of previews) previewByMonitor.set(p.monitorIndex, p.dataUrl);

  const slotByMonitor = new Map<number, LayoutSlot>();
  for (const s of slots) slotByMonitor.set(Number(s.monitorIndex), s);

  const scaleClass =
    cfg.previewScale === 2 ? 'scale-2' : cfg.previewScale === 1 ? 'scale-1' : 'scale-15';

  function handleView(next: HubView): void {
    const hub = getHub();
    void hub?.setPreviewsLive?.(next === 'monitores');
    setView(next);
  }

  return (
    <div className="hub-shell">
      <Sidebar
        view={view}
        onView={handleView}
        status={status}
        version={version}
        inboxCount={inboxCount}
      />
      <main className="hub-main">
        {error && <div className="error">⚠ {error}</div>}

        {view === 'monitores' && (
          <>
            <div className="topbar">
              <span className="title">Monitores</span>
              <span className="spacer" />
              <button
                className={identifyOn ? 'toggle-on' : ''}
                onClick={() => void handleIdentify()}
                title={identifyOn ? 'Ocultar el número en cada monitor' : 'Mostrar el número en cada monitor'}
              >
                {identifyOn ? 'Enumerado ON' : 'Identificar monitores'}
              </button>
              <button onClick={() => void refresh()}>Actualizar</button>
            </div>
            {loading && monitors.length === 0 ? (
              <div className="muted">Cargando…</div>
            ) : (
              <div className={`monitor-grid ${scaleClass}`}>
                {monitors.map((m) => (
                  <MonitorCard
                    key={m.index}
                    monitor={m}
                    windowOnMonitor={windowByMonitor.get(m.index)}
                    preview={previewByMonitor.get(m.index)}
                    previewScale={cfg.previewScale}
                    cocineroId={slotByMonitor.get(m.index)?.cocineroId}
                    cocineroNombre={
                      slotByMonitor.get(m.index)?.cocineroNombre
                      || slotByMonitor.get(m.index)?.label
                    }
                    cocineros={cocineros}
                    changingCocinero={changingMonitor === m.index}
                    onSetMode={handleSetMode}
                    chromeZoom={zooms[String(m.index)] ?? 100}
                    onChromeZoom={(z) => handleChromeZoom(m.index, z)}
                    onChangeCocinero={(cook) => void handleChangeCocinero(m.index, cook)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {view === 'cocina' && (
          <CocinaPanel onRefresh={() => void refresh()} onError={setError} />
        )}

        {view === 'ventanas' && (
          <>
            <div className="topbar">
              <span className="title">Ventanas abiertas</span>
            </div>
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
          </>
        )}

        {view === 'layouts' && (
          <LayoutPanel monitors={monitors} windows={windows} onRefresh={() => void refresh()} />
        )}

        {view === 'ajustes' && <SettingsPanel onConfigChange={setCfg} />}
      </main>
    </div>
  );
}
