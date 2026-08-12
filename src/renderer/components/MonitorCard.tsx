import React from 'react';
import type { MonitorInfo, WindowInfo } from '@shared/types';

interface Props {
  monitor: MonitorInfo;
  windowOnMonitor: WindowInfo | undefined;
  onIdentify: () => void;
}

export function MonitorCard({ monitor, windowOnMonitor, onIdentify }: Props): React.ReactElement {
  const transmitting = Boolean(windowOnMonitor);
  return (
    <div className={`monitor-card${monitor.isPrimary ? ' primary' : ''}`}>
      <div className="head">
        <span className="idx">M{monitor.index}</span>
        <span className={`badge ${transmitting ? 'tx' : 'free'}`}>
          {transmitting ? 'Transmitiendo' : 'Libre'}
        </span>
      </div>
      <div className="meta">
        {monitor.bounds.width}×{monitor.bounds.height} @ ({monitor.bounds.x},{monitor.bounds.y})
        {monitor.isPrimary ? ' · PRIMARIO' : ''}
      </div>
      {monitor.label && <div className="meta">Etiqueta: {monitor.label}</div>}
      <div className="win">
        {transmitting
          ? `[${windowOnMonitor!.processName}] ${windowOnMonitor!.title}`
          : <span className="muted">— sin ventana asignada —</span>}
      </div>
      <div className="row">
        <button onClick={onIdentify}>Identificar</button>
      </div>
    </div>
  );
}
