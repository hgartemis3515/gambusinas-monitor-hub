import React from 'react';

interface Props {
  value: number;
  disabled?: boolean;
  onChange: (zoom: number) => void;
}

export function ChromeZoomSlider({ value, disabled, onChange }: Props): React.ReactElement {
  return (
    <div className="zoom-row">
      <label>Zoom (como Chrome)</label>
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="zoom-val">{value}%</span>
    </div>
  );
}
