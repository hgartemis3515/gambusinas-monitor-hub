import React from 'react';
import type { HubConfig, HubUpdateStatus, PreviewScale } from '@shared/types';
import type { HubApi } from '../../preload/index';
import { HubStatus } from './HubStatus';

interface Props {
  onConfigChange: (cfg: HubConfig) => void;
}

export function SettingsPanel({ onConfigChange }: Props): React.ReactElement {
  const [cfg, setCfg] = React.useState<HubConfig | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [upd, setUpd] = React.useState<HubUpdateStatus | null>(null);
  const [checking, setChecking] = React.useState(false);

  function getHub(): HubApi | null {
    return (window as unknown as { hub?: HubApi }).hub ?? null;
  }

  React.useEffect(() => {
    const hub = getHub();
    if (!hub) return;
    void hub.getHubConfig().then((c) => {
      setCfg(c);
      onConfigChange(c);
    });
    void hub.getUpdateStatus?.().then(setUpd).catch(() => undefined);
    return hub.onUpdateStatus?.(setUpd);
  }, [onConfigChange]);

  async function patch(partial: Partial<HubConfig>): Promise<void> {
    const hub = getHub();
    if (!hub || !cfg) return;
    const next = { ...cfg, ...partial };
    setCfg(next);
    setSaving(true);
    try {
      await hub.setHubConfig(partial);
      const live = await hub.getHubConfig();
      setCfg(live);
      onConfigChange(live);
      setMsg('Guardado');
    } catch (e) {
      setMsg('Error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="muted">Cargando ajustes…</div>;

  return (
    <div>
      <div className="topbar">
        <span className="title">Ajustes</span>
      </div>

      <h2>Servidor</h2>
      <HubStatus />

      <h2 style={{ marginTop: 22 }}>Vista de monitores</h2>
      <div className="settings-row">
        <label>Tamaño de screens</label>
        <select
          value={String(cfg.previewScale)}
          disabled={saving}
          onChange={(e) => void patch({ previewScale: Number(e.target.value) as PreviewScale })}
        >
          <option value="1">Normal</option>
          <option value="1.5">Grande</option>
          <option value="2">Muy grande</option>
        </select>
      </div>
      <div className="settings-row">
        <label>Actualización (ms)</label>
        <input
          type="number"
          min={1000}
          max={5000}
          step={100}
          value={cfg.previewIntervalMs}
          disabled={saving}
          onChange={(e) => {
            const n = Number(e.target.value);
            setCfg({ ...cfg, previewIntervalMs: n });
          }}
          onBlur={() => void patch({ previewIntervalMs: cfg.previewIntervalMs })}
        />
      </div>
      <p className="muted">Más grande = se ven mejor las pantallas. Intervalo menor = más “en vivo” (más CPU). Mínimo 1000 ms para que Windows no marque la app como “no responde”.</p>

      <h2 style={{ marginTop: 22 }}>Desplegar</h2>
      <label className="kiosk-label">
        <input
          type="checkbox"
          checked={cfg.fullscreenOnDeploy}
          disabled={saving}
          onChange={(e) => void patch({ fullscreenOnDeploy: e.target.checked })}
        />
        Pantalla completa al desplegar
      </label>
      <label className="kiosk-label" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={cfg.autoDeployOnReceive}
          disabled={saving}
          onChange={(e) => void patch({ autoDeployOnReceive: e.target.checked })}
        />
        Desplegar automáticamente al recibir de App Cocina
      </label>
      {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}

      <h2 style={{ marginTop: 22 }}>Actualizaciones</h2>
      <p className="muted">
        Con la app instalada, el Hub se actualiza solo desde GitHub (sin descargar el Setup a mano).
        Comprueba al abrir y cada 15 minutos.
      </p>
      <div className="muted" style={{ margin: '8px 0' }}>
        Versión actual: <strong>v{upd?.currentVersion || '—'}</strong>
        {upd?.availableVersion ? ` · nueva: v${upd.availableVersion}` : ''}
        <br />
        {upd?.message || (upd?.packaged === false ? 'Modo desarrollo: el auto-update solo corre en el instalador.' : '')}
      </div>
      <button
        disabled={checking}
        onClick={() => {
          const hub = getHub();
          if (!hub?.checkForUpdates) return;
          setChecking(true);
          void hub.checkForUpdates().then(setUpd).finally(() => setChecking(false));
        }}
      >
        {checking ? 'Buscando…' : 'Buscar actualizaciones ahora'}
      </button>
    </div>
  );
}
