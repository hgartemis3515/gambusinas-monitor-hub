import React from 'react';
import type { CocinaLayoutImport, HubCocinero, LayoutProfile, LayoutSlot } from '@shared/types';
import type { HubApi } from '../../preload/index';
import { ChromeZoomSlider } from './ChromeZoomSlider';
import { CocineroSelect } from './CocineroSelect';

interface Props {
  onRefresh: () => void;
  onError: (msg: string | null) => void;
}

function perfilLabel(slot: LayoutSlot): string {
  if (slot.perfilNombre) return slot.perfilNombre;
  if (slot.perfil === 'auto') return 'Perfil auto';
  if (slot.perfil && slot.perfil !== 'none') return slot.perfil;
  return 'Sin perfil';
}

export function CocinaPanel({ onRefresh, onError }: Props): React.ReactElement {
  const [inbox, setInbox] = React.useState<CocinaLayoutImport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [fullscreen, setFullscreen] = React.useState(true);
  const [zooms, setZooms] = React.useState<Record<string, number>>({});
  const zoomTimers = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [profileName, setProfileName] = React.useState('');
  const [profiles, setProfiles] = React.useState<LayoutProfile[]>([]);
  const [despegando, setDespegando] = React.useState<number | null>(null);
  const [cocineros, setCocineros] = React.useState<HubCocinero[]>([]);
  const [cambiando, setCambiando] = React.useState<number | null>(null);

  function getHub(): HubApi | null {
    return (window as unknown as { hub?: HubApi }).hub ?? null;
  }

  const load = React.useCallback(async () => {
    const hub = getHub();
    if (!hub) return;
    try {
      const data = await hub.importFromCocina();
      setInbox(data);
      const cfg = await hub.getHubConfig();
      setFullscreen(cfg.fullscreenOnDeploy !== false);
      const z = await hub.getChromeZooms();
      setZooms(z);
      setProfiles(await hub.listLayouts());
      if (hub.listCocineros) setCocineros(await hub.listCocineros());
    } catch (e) {
      onError('Inbox: ' + (e as Error).message);
    }
  }, [onError]);

  React.useEffect(() => {
    void load();
    const hub = getHub();
    if (!hub?.onInboxUpdated) return;
    return hub.onInboxUpdated(() => {
      void load();
    });
  }, [load]);

  async function toggleFullscreen(v: boolean): Promise<void> {
    setFullscreen(v);
    const hub = getHub();
    if (!hub) return;
    await hub.setHubConfig({ fullscreenOnDeploy: v });
  }

  function handleZoom(monitorIndex: number, percent: number): void {
    setZooms((prev) => ({ ...prev, [String(monitorIndex)]: percent }));
    const prevTimer = zoomTimers.current[monitorIndex];
    if (prevTimer) clearTimeout(prevTimer);
    zoomTimers.current[monitorIndex] = setTimeout(() => {
      void getHub()?.setChromeZoom(monitorIndex, percent);
    }, 80);
  }

  async function desplegar(monitorIndex?: number): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    setBusy(true);
    if (monitorIndex != null) setDespegando(monitorIndex);
    onError(null);
    setMsg(null);
    try {
      const res = await hub.applyCocina({
        kiosk: fullscreen,
        ...(monitorIndex != null ? { monitorIndex } : {}),
      });
      const extra = res.errors.length ? ' · ' + res.errors.join('; ') : '';
      const cual = monitorIndex != null
        ? `M${monitorIndex}`
        : `${res.opened} abiertas, ${res.applied} movidas`;
      setMsg(`Despegado ${cual}${extra}`);
      onRefresh();
    } catch (e) {
      onError('Desplegar: ' + (e as Error).message);
    } finally {
      setBusy(false);
      setDespegando(null);
    }
  }

  async function cambiarCocinero(monitorIndex: number, cook: HubCocinero): Promise<void> {
    const hub = getHub();
    if (!hub?.setSlotCocinero) return;
    setCambiando(monitorIndex);
    onError(null);
    setMsg(null);
    try {
      const res = await hub.setSlotCocinero(monitorIndex, cook, {
        deploy: true,
        kiosk: fullscreen,
      });
      if (res.inbox) setInbox(res.inbox);
      const extra = res.deploy.errors.length ? ' · ' + res.deploy.errors.join('; ') : '';
      setMsg(`M${monitorIndex} → ${cook.nombre}${extra}`);
      onRefresh();
    } catch (e) {
      onError('Cambiar cocinero: ' + (e as Error).message);
    } finally {
      setCambiando(null);
    }
  }

  async function guardarPerfilConfig(): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    const nom = profileName.trim();
    if (!nom) {
      setMsg('Dale un nombre al perfil de configuración');
      return;
    }
    if (!slots.length) {
      setMsg('No hay layout de Cocina para guardar. Envíalo desde App Cocina.');
      return;
    }
    setBusy(true);
    try {
      await hub.saveLayout(nom, slots);
      setProfileName('');
      setMsg(`Perfil de configuración "${nom}" guardado (${slots.length} monitores)`);
      setProfiles(await hub.listLayouts());
    } catch (e) {
      setMsg('Error al guardar: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function aplicarPerfilGuardado(id: string): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await hub.applyLayout(id, { kiosk: fullscreen });
      setMsg(`Perfil aplicado: ${res.applied} movidas, ${res.opened} abiertas`);
      onRefresh();
    } catch (e) {
      onError('Aplicar perfil: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const slots = inbox?.slots ?? [];

  return (
    <div>
      <div className="topbar">
        <span className="title">Cocina</span>
        <span className="spacer" />
        <label className="kiosk-label" title="Abre cada monitor en kiosk (sin barra de URL)">
          <input
            type="checkbox"
            checked={fullscreen}
            onChange={(e) => void toggleFullscreen(e.target.checked)}
          />
          Pantalla completa
        </label>
        <button className="primary" disabled={busy || slots.length === 0} onClick={() => void desplegar()}>
          {busy && despegando == null ? 'Desplegando…' : 'Desplegar ventanas'}
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="empty-hint">
          Aún no llega layout. En App Cocina → Distribuir Cocina en monitores, asigna
          cocinero y perfil, luego pulsa <strong>Aplicar</strong> o <strong>Enviar al Monitor Hub</strong>.
        </div>
      ) : (
        <>
          <div className="muted" style={{ marginBottom: 10 }}>
            {inbox?.profileName || 'Layout de Cocina'} · {slots.length} monitores listos
            {slots.some((s) => s.cocineroNombre || s.label) ? (
              <span>
                {' '}· En pantalla:{' '}
                {slots
                  .map((s) => `M${s.monitorIndex} ${s.cocineroNombre || s.label || '—'}`)
                  .join(' · ')}
              </span>
            ) : null}
          </div>
          <table className="slots-table">
            <thead>
              <tr>
                <th>Monitor</th>
                <th>Cocinero</th>
                <th>Perfil</th>
                <th>Guarniciones</th>
                <th>Zoom Chrome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={`${s.monitorIndex}-${s.cocineroId || i}`}>
                  <td>M{s.monitorIndex}</td>
                  <td>
                    <CocineroSelect
                      valueId={s.cocineroId}
                      valueNombre={s.cocineroNombre || s.label}
                      cocineros={cocineros}
                      disabled={busy || cambiando === s.monitorIndex}
                      onChange={(cook) => void cambiarCocinero(s.monitorIndex, cook)}
                    />
                  </td>
                  <td>{perfilLabel(s)}</td>
                  <td>{s.listaGuarniciones ? 'Sí' : '—'}</td>
                  <td>
                    <ChromeZoomSlider
                      value={zooms[String(s.monitorIndex)] ?? 100}
                      onChange={(z) => handleZoom(s.monitorIndex, z)}
                    />
                  </td>
                  <td>
                    <button
                      className="primary"
                      disabled={busy}
                      title={`Despegar solo el monitor ${s.monitorIndex}`}
                      onClick={() => void desplegar(s.monitorIndex)}
                    >
                      {despegando === s.monitorIndex ? '…' : 'Despegar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Perfil de configuración</h3>
          <div className="row">
            <input
              placeholder="Nombre del perfil (cocineros, URLs, kiosk)"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
            <button className="primary" disabled={busy} onClick={() => void guardarPerfilConfig()}>
              Guardar perfil de configuración
            </button>
          </div>
          <div className="win-list" style={{ marginTop: 8 }}>
            {profiles.length === 0 && (
              <div className="muted">Sin perfiles guardados. Guarda el layout actual con un nombre.</div>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="win-row" style={{ cursor: 'default' }}>
                <div className="info">
                  <div className="title">{p.name}</div>
                  <div className="sub">
                    {p.slots.length} monitores · {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" disabled={busy} onClick={() => void aplicarPerfilGuardado(p.id)}>
                    Aplicar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
