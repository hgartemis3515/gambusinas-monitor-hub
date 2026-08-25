import React from 'react';
import type { MonitorInfo, PreviewScale, WindowInfo, WindowMode } from '@shared/types';
import { ChromeZoomSlider } from './ChromeZoomSlider';

interface Props {
  monitor: MonitorInfo;
  windowOnMonitor: WindowInfo | undefined;
  preview?: string;
  previewScale: PreviewScale;
  chromeZoom: number;
  onIdentify: () => void;
  onSetMode: (hwnd: number, mode: WindowMode) => void;
  onChromeZoom: (zoom: number) => void;
}

export function MonitorCard({
  monitor,
  windowOnMonitor,
  preview,
  previewScale,
  chromeZoom,
  onIdentify,
  onSetMode,
  onChromeZoom,
}: Props): React.ReactElement {
  const transmitting = Boolean(windowOnMonitor);
  const src = preview || windowOnMonitor?.thumbnail;
  return (
    <div
      className={`monitor-card${monitor.isPrimary ? ' primary' : ''}${transmitting ? ' tx-glow' : ''}`}
      data-scale={String(previewScale)}
    >
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
        <div className="card-win">
          {src ? (
            <img className="card-thumb" src={src} alt={`Monitor ${monitor.index}`} />
          ) : (
            <div className="card-thumb-ph">Capturando…</div>
          )}
          {transmitting ? (
            <>
              <div className="card-win-info">
                <div className="title">{windowOnMonitor!.title}</div>
                <div className="sub">[{windowOnMonitor!.processName}] M{windowOnMonitor!.monitorIndex}</div>
              </div>
              <div className="actions">
                <button title="Pantalla completa" onClick={() => onSetMode(windowOnMonitor!.hwnd, 'fullscreen')}>
                  ⛶
                </button>
                <button title="Maximizar" onClick={() => onSetMode(windowOnMonitor!.hwnd, 'maximized')}>
                  ▢
                </button>
                <button title="Restaurar" onClick={() => onSetMode(windowOnMonitor!.hwnd, 'normal')}>
                  ⤢
                </button>
              </div>
            </>
          ) : (
            <span className="muted">— sin ventana asignada —</span>
          )}
        </div>
      </div>
      <ChromeZoomSlider value={chromeZoom} onChange={onChromeZoom} />
      <div className="row">
        <button onClick={onIdentify}>Identificar</button>
      </div>
    </div>
  );
}
