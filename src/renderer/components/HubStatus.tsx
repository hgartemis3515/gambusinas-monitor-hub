import React from 'react';
import type { HubApi } from '../../preload/index';

export function HubStatus(): React.ReactElement {
  const [status, setStatus] = React.useState<string>('disconnected');
  const [backendUrl, setBackendUrl] = React.useState<string>('');
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  React.useEffect(() => {
    const w = window as unknown as { hub?: HubApi };
    w.hub?.getHubStatus().then(setStatus);
    w.hub?.getHubConfig().then((c: { backendUrl: string }) => {
      setBackendUrl(c.backendUrl);
      setDraft(c.backendUrl);
    });
    w.hub?.onHubStatus(setStatus);
  }, []);

  async function save(): Promise<void> {
    const w = window as unknown as { hub?: HubApi };
    if (!w.hub) return;
    setSaving(true);
    try {
      await w.hub.setHubConfig({ backendUrl: draft.trim() });
      setBackendUrl(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // Verificar: fuerza reconexion; el estado se actualiza via onHubStatus.
  async function verificar(): Promise<void> {
    const w = window as unknown as { hub?: HubApi };
    if (!w.hub || !backendUrl) return;
    setVerifying(true);
    try {
      await w.hub.setHubConfig({ backendUrl });
      // dar un momento al socket para reconectar y reflejar el estado
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setVerifying(false);
    }
  }

  const ok = status === 'connected';
  return (
    <div className="hub-status">
      <span className={`dot ${ok ? 'ok' : 'warn'}`} title={ok ? 'Conectado al servidor' : 'Desconectado'} />
      <span className="hub-status-text">
        {ok ? 'Conectado' : 'Sin conexión'}
      </span>
      {editing ? (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="http://192.168.50.155:3000"
            style={{ width: 200 }}
          />
          <button disabled={saving} onClick={save}>Guardar</button>
          <button onClick={() => { setEditing(false); setDraft(backendUrl); }}>Cancelar</button>
        </>
      ) : (
        <>
          <button
            title="Configurar URL del backend"
            onClick={() => { setDraft(backendUrl); setEditing(true); }}
          >
            {backendUrl || 'Configurar servidor…'}
          </button>
          <button
            title="Reconectar y verificar"
            disabled={verifying || !backendUrl}
            onClick={verificar}
          >
            {verifying ? 'Verificando…' : 'Verificar'}
          </button>
        </>
      )}
    </div>
  );
}
