import React from 'react';
import type { HubCocinero } from '@shared/types';

interface Props {
  valueId?: string;
  valueNombre?: string;
  cocineros: HubCocinero[];
  disabled?: boolean;
  onChange: (cook: HubCocinero) => void;
}

export function CocineroSelect({
  valueId,
  valueNombre,
  cocineros,
  disabled,
  onChange,
}: Props): React.ReactElement {
  const current = String(valueId || '');
  const inList = cocineros.some((c) => c.id === current);
  return (
    <select
      className="cocinero-select"
      disabled={disabled || cocineros.length === 0}
      value={current}
      title="Cocinero de este monitor"
      onChange={(e) => {
        const id = e.target.value;
        const cook = cocineros.find((c) => c.id === id);
        if (cook) onChange(cook);
      }}
    >
      {!current && <option value="">— Elegir cocinero —</option>}
      {current && !inList && (
        <option value={current}>{valueNombre || 'Cocinero actual'}</option>
      )}
      {cocineros.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}
