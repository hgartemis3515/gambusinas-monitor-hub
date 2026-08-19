import React from 'react';
import type { CocinaLayoutImport, LayoutSlot } from '@shared/types';
import type { HubApi } from '../../preload/index';

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

  async function desplegar(): Promise<void> {
    const hub = getHub();
    if (!hub) return;
    setBusy(true);
    onError(null);
    setMsg(null);
    try {
      const res = await hub.applyCocina({ kiosk: fullscreen });
      const extra = res.errors.length ? ' · ' + res.errors.join('; ') : '';
      setMsg(`Desplegadas: ${res.opened} abiertas, ${res.applied} movidas${extra}`);
      onRefresh();
    } catch (e) {
      onError('Desplegar: ' + (e as Error).message);
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
          {busy ? 'Desplegando…' : 'Desplegar ventanas'}
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
          </div>
          <table className="slots-table">
            <thead>
              <tr>
                <th>Monitor</th>
                <th>Cocinero</th>
                <th>Perfil</th>
                <th>Guarniciones</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={`${s.monitorIndex}-${s.cocineroId || i}`}>
                  <td>M{s.monitorIndex}</td>
                  <td>{s.cocineroNombre || s.label || s.cocineroId || '—'}</td>
                  <td>{perfilLabel(s)}</td>
                  <td>{s.listaGuarniciones ? 'Sí' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
