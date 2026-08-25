import React from 'react';
import type { LayoutProfile, LayoutSlot, MonitorInfo, WindowInfo } from '@shared/types';

interface Props {
  monitors: MonitorInfo[];
  windows: WindowInfo[];
  onRefresh: () => void;
}

function deriveSlotsFromCurrent(windows: WindowInfo[]): LayoutSlot[] {
  return windows
    .filter((w) => w.monitorIndex > 1)
    .map((w) => ({
      monitorIndex: w.monitorIndex,
      match: { titleContains: w.title },
      mode: 'normal' as const,
    }));
}

export function LayoutPanel({ monitors, windows, onRefresh }: Props): React.ReactElement {
  const [profiles, setProfiles] = React.useState<LayoutProfile[]>([]);
  const [name, setName] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [kioskMode, setKioskMode] = React.useState<boolean>(() => {
    return localStorage.getItem('hub:kiosk') !== '0';
  });

  function setKiosk(v: boolean): void {
    setKioskMode(v);
    localStorage.setItem('hub:kiosk', v ? '1' : '0');
  }

  async function reload(): Promise<void> {
    const hub = window.hub;
    if (!hub) return;
    const list = await hub.listLayouts();
    setProfiles(list);
  }

  React.useEffect(() => {
    void reload();
  }, []);

  async function save(): Promise<void> {
    if (!name.trim()) {
      setMsg('Dale un nombre al perfil');
      return;
    }
    setBusy(true);
    try {
      const slots = deriveSlotsFromCurrent(windows);
      await window.hub.saveLayout(name.trim(), slots);
      setName('');
      setMsg(`Perfil guardado con ${slots.length} asignaciones`);
      await reload();
    } catch (e) {
      setMsg('Error al guardar: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply(id: string): Promise<void> {
    setBusy(true);
    setApplying(true);
    setMsg(null);
    try {
      const res = await window.hub.applyLayout(id, { kiosk: kioskMode });
      setMsg(`Aplicado: ${res.applied} movidas, ${res.opened} abiertas${res.errors.length ? ', ' + res.errors.join('; ') : ''}`);
      onRefresh();
    } catch (e) {
      setMsg('Error al aplicar: ' + (e as Error).message);
    } finally {
      setBusy(false);
      setApplying(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    try {
      await window.hub.deleteLayout(id);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function importFile(): Promise<void> {
    setBusy(true);
    try {
      const data = await window.hub.importCocinaFile();
      if (!data) {
        setMsg('No se importó ningún layout');
      } else {
        const slots = data.slots ?? [];
        await window.hub.saveLayout(data.profileName ?? 'Importado de Cocina', slots);
        setMsg(`Importado: ${slots.length} slots`);
        await reload();
      }
    } catch (e) {
      setMsg('Error import: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importInbox(): Promise<void> {
    setBusy(true);
    try {
      const data = await window.hub.importFromCocina();
      if (!data) {
        setMsg('Inbox vacío (App Cocina no envió ningún layout)');
      } else {
        const slots = data.slots ?? [];
        await window.hub.saveLayout(data.profileName ?? 'Importado de Cocina', slots);
        setMsg(`Importado desde inbox: ${slots.length} slots`);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Perfiles de layout</h2>

      <div className="row">
        <input
          placeholder="Nombre del perfil"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" disabled={busy} onClick={save}>
          Guardar perfil de configuración
        </button>
      </div>

      <div className="row">
        <button disabled={busy} onClick={importInbox}>
          Importar desde App Cocina (inbox)
        </button>
        <button disabled={busy} onClick={importFile}>
          Importar archivo JSON…
        </button>
      </div>

      <div className="row">
        <label className="kiosk-label" title="Kiosk: pantalla bloqueada sin barra de URL ni pestañas. Ideal para pantallas de cocina fijas.">
          <input
            type="checkbox"
            checked={kioskMode}
            onChange={(e) => setKiosk(e.target.checked)}
          />{' '}
          Kiosk (pantalla bloqueada, sin URL)
        </label>
      </div>

      <div className="win-list" style={{ marginTop: 12 }}>
        {profiles.length === 0 && <div className="muted">Sin perfiles guardados.</div>}
        {profiles.map((p) => (
          <div key={p.id} className="win-row" style={{ cursor: 'default' }}>
            <div className="info">
              <div className="title">{p.name}</div>
              <div className="sub">
                {p.slots.length} slots · {new Date(p.updatedAt).toLocaleString()}
              </div>
            </div>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => apply(p.id)}>
                Aplicar
              </button>
              <button className="danger" disabled={busy} onClick={() => remove(p.id)}>
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      <div className="muted" style={{ marginTop: 8 }}>
        {monitors.length} monitores · {windows.length} ventanas
      </div>

      {applying && (
        <div className="apply-overlay">
          <div className="box">
            <div className="msg">Aplicando layout…</div>
            <div className="sub">Moviendo ventanas a sus monitores</div>
          </div>
        </div>
      )}
    </div>
  );
}
