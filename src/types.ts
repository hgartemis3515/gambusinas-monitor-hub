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
