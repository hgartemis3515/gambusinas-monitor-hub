import React from 'react';

export type HubView = 'monitores' | 'cocina' | 'ventanas' | 'layouts' | 'ajustes';

const NAV: Array<{ id: HubView; label: string; icon: string }> = [
  { id: 'monitores', label: 'Monitores', icon: '▦' },
  { id: 'cocina', label: 'Cocina', icon: '🍳' },
  { id: 'ventanas', label: 'Ventanas', icon: '▭' },
  { id: 'layouts', label: 'Layouts', icon: '⊞' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
];

interface Props {
  view: HubView;
  onView: (v: HubView) => void;
  status: string;
  version: string;
  inboxCount: number;
}

export function Sidebar({ view, onView, status, version, inboxCount }: Props): React.ReactElement {
  const ok = status === 'connected';
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">G</div>
        <div>
          <div className="sidebar-title">Monitor Hub</div>
          <div className="sidebar-sub">Gambusinas</div>
        </div>
      </div>
      <div className={`sidebar-status ${ok ? 'ok' : 'warn'}`}>
        <span className={`dot ${ok ? 'ok' : 'warn'}`} />
        {ok ? 'Conectado' : 'Sin conexión'}
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${view === item.id ? ' active' : ''}`}
            onClick={() => onView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'cocina' && inboxCount > 0 && (
              <span className="nav-badge">{inboxCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">v{version || '—'}</div>
    </aside>
  );
}
