export interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: string;
  index: number;
  isPrimary: boolean;
  bounds: MonitorBounds;
  workArea: MonitorBounds;
  deviceName?: string;
  label?: string;
}

export type WindowMode = 'normal' | 'maximized' | 'fullscreen';

export type WindowProcessFilter = 'all' | 'chrome' | 'edge';

export interface WindowInfo {
  hwnd: number;
  title: string;
  processName: string;
  processPath?: string;
  pid: number;
  monitorIndex: number;
  visible: boolean;
  thumbnail?: string;
}

export interface MonitorHandle {
  id: string;
  handle: bigint;
}

export interface RawMonitorData {
  handle: bigint;
  bounds: MonitorBounds;
  workArea: MonitorBounds;
  isPrimary: boolean;
  deviceName?: string;
}

export type PreviewScale = 1 | 1.5 | 2;

export interface HubConfig {
  backendUrl: string;
  previewScale: PreviewScale;
  previewIntervalMs: number;
  fullscreenOnDeploy: boolean;
  autoDeployOnReceive: boolean;
}

export interface MonitorPreview {
  monitorIndex: number;
  dataUrl?: string;
}

export interface LayoutSlot {
  monitorIndex: number;
  match?: { process?: string; titleContains?: string };
  url?: string;
  mode: WindowMode;
  label?: string;
  cocineroId?: string;
  cocineroNombre?: string;
  perfil?: string;
  perfilNombre?: string;
  listaGuarniciones?: boolean;
}

export interface LayoutProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  slots: LayoutSlot[];
}

export interface CocinaLayoutImport {
  source: 'appcocina';
  profileName?: string;
  slots: LayoutSlot[];
  /** JSON `{ token, usuario }` para inyectar sesión en Chrome kiosk (perfil vacío). */
  authBundle?: string;
}
