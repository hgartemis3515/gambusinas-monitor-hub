import { getNative } from './native/win32.js';
import type { MonitorInfo } from '../shared/types.js';
import { logger } from '../shared/logger.js';

export function listMonitors(): MonitorInfo[] {
  const native = getNative();
  const raw = native.enumMonitors();
  raw.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

  const primaryFirst = raw.find((m) => m.isPrimary);
  const ordered = primaryFirst
    ? [primaryFirst, ...raw.filter((m) => m !== primaryFirst)]
    : raw;

  const result: MonitorInfo[] = ordered.map((m, i) => ({
    id: `monitor-${i + 1}`,
    index: i + 1,
    isPrimary: m.isPrimary,
    bounds: m.bounds,
    workArea: m.workArea,
    deviceName: m.deviceName,
  }));

  logger.debug('listMonitors', { count: result.length });
  return result;
}

export function getMonitorByIndex(index: number): MonitorInfo | undefined {
  return listMonitors().find((m) => m.index === index);
}
