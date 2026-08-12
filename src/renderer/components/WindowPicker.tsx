import React from 'react';
import type { MonitorInfo, WindowInfo, WindowMode, WindowProcessFilter } from '@shared/types';

interface Props {
  windows: WindowInfo[];
  monitors: MonitorInfo[];
  filter: WindowProcessFilter;
  selectedHwnd: number | null;
  onFilterChange: (f: WindowProcessFilter) => void;
  onSelect: (hwnd: number) => void;
  onMove: (hwnd: number, monitorIndex: number, mode: WindowMode) => void;
  onSetMode: (hwnd: number, mode: WindowMode) => void;
}

export function WindowPicker({
  windows,
  monitors,
  filter,
  selectedHwnd,
  onFilterChange,
  onSelect,
  onMove,
  onSetMode,
}: Props): React.ReactElement {
  const [target, setTarget] = React.useState<number>(2);
  const [mode, setMode] = React.useState<WindowMode>('normal');

  return (
    <div>
      <div className="row">
        <label className="muted">Filtro:</label>
        <select value={filter} onChange={(e) => onFilterChange(e.target.value as WindowProcessFilter)}>
          <option value="all">Todas</option>
          <option value="chrome">Chrome</option>
          <option value="edge">Edge</option>
        </select>
        <span className="muted">{windows.length} ventanas</span>
      </div>

      <div className="win-list">
        {windows.length === 0 && <div className="muted">No hay ventanas visibles con título.</div>}
        {windows.map((w) => (
          <div
            key={w.hwnd}
            className={`win-row${selectedHwnd === w.hwnd ? ' selected' : ''}`}
            onClick={() => onSelect(w.hwnd)}
          >
            <div className="thumb">
              {w.thumbnail ? (
                <img src={w.thumbnail} alt={w.title} />
              ) : (
                <span className="thumb-ph" title="Sin vista previa">▢</span>
              )}
            </div>
            <div className="info">
              <div className="title">{w.title}</div>
              <div className="sub">
                [{w.processName}] pid={w.pid} · M{w.monitorIndex} · hwnd={w.hwnd}
              </div>
            </div>
            <div className="actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMode(w.hwnd, 'fullscreen');
                }}
                title="Pantalla completa"
              >
                ⛶
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMode(w.hwnd, 'maximized');
                }}
                title="Maximizar"
              >
                ▢
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMode(w.hwnd, 'normal');
                }}
                title="Restaurar"
              >
                ⤢
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <span className="muted">Enviar seleccionada a:</span>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          {monitors.map((m) => (
            <option key={m.index} value={m.index}>
              M{m.index}{m.isPrimary ? ' (primario)' : ''}
            </option>
          ))}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as WindowMode)}>
          <option value="normal">Normal</option>
          <option value="maximized">Maximizado</option>
          <option value="fullscreen">Pantalla completa</option>
        </select>
        <button
          className="primary"
          disabled={selectedHwnd == null}
          onClick={() => selectedHwnd != null && onMove(selectedHwnd, target, mode)}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
