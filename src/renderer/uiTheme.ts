// Tokens de diseño del Monitor Hub.
// Fuente de verdad para duraciones/easing de animaciones y colores de marca.
// Los valores numéricos se usan en CSS (styles.css); mantener sincronizados.

export const motion = {
  FAST: '150ms',
  NORMAL: '250ms',
  SLOW: '400ms',
  EASE_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)',
  EASE_IN_OUT: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

export const colors = {
  bg: '#0f172a',
  bgDeep: '#020617',
  surface: '#1e293b',
  border: '#334155',
  borderActive: '#2563eb',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#2563eb',
  accentHover: '#3b82f6',
  ok: '#16a34a',
  danger: '#b91c1c',
} as const;

export const thumb = {
  width: 96,
  height: 54,
  radius: 6,
} as const;
