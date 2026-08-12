import React from 'react';
import type { MonitorInfo, WindowInfo, WindowMode } from '@shared/types';

interface Props {
  monitor: MonitorInfo;
  windowOnMonitor: WindowInfo | undefined;
  onIdentify: () => void;
  onSetMode: (hwnd: number, mode: WindowMode) => void;
}

export function MonitorCard({ monitor, windowOnMonitor, onIdentify, onSetMode }: Props): React.ReactElement {
  const transmitting = Boolean(windowOnMonitor);
  return (
    <div className={`monitor-card${monitor.isPrimary ? ' primary' : ''}${transmitting ? ' tx-glow' : ''}`}>
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
        {transmitting ? (
          <div className="card-win">
            {windowOnMonitor!.thumbnail ? (
              <img className="card-thumb" src={windowOnMonitor!.thumbnail} alt={windowOnMonitor!.title} />
            ) : (
              <div className="card-thumb-ph">Sin vista previa</div>
            )}
            <div className="card-win-info">
              <div className="title">{windowOnMonitor!.title}</div>
              <div className="sub">[{windowOnMonitor!.processName}] M{windowOnMonitor!.monitorIndex}</div>
            </div>
            <div className="actions">
              <button
                title="Pantalla completa"
                onClick={() => onSetMode(windowOnMonitor!.hwnd, 'fullscreen')}
              >
                ⛶
              </button>
              <button
                title="Maximizar"
                onClick={() => onSetMode(windowOnMonitor!.hwnd, 'maximized')}
              >
                ▢
              </button>
              <button
                title="Restaurar"
                onClick={() => onSetMode(windowOnMonitor!.hwnd, 'normal')}
              >
                ⤢
              </button>
            </div>
          </div>
        ) : (
          <span className="muted">— sin ventana asignada —</span>
        )}
      </div>
      <div className="row">
        <button onClick={onIdentify}>Identificar</button>
      </div>
    </div>
  );
}
