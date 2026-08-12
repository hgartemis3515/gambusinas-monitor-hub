import { getNative } from './native/win32.js';
import { listMonitors } from './monitors.js';
import type { WindowInfo, WindowProcessFilter } from '../shared/types.js';
import { logger } from '../shared/logger.js';

const PROCESS_MATCHERS: Record<WindowProcessFilter, (name: string) => boolean> = {
  all: () => true,
  chrome: (n) => n.toLowerCase().includes('chrome'),
  edge: (n) => n.toLowerCase().includes('msedge') || n.toLowerCase().includes('edge'),
};

export function listWindows(filter: WindowProcessFilter = 'all'): WindowInfo[] {
  const native = getNative();
  const monitors = listMonitors();
  const monitorByHandle = new Map<bigint, number>();
  for (const m of monitors) {
    const raw = native.enumMonitors().find((r, idx) => {
      void idx;
      return r.bounds.x === m.bounds.x && r.bounds.y === m.bounds.y;
    });
    if (raw) monitorByHandle.set(raw.handle, m.index);
  }

  const rawWindows = native.enumWindowsRaw();
  const matcher = PROCESS_MATCHERS[filter];

  const out: WindowInfo[] = [];
  for (const w of rawWindows) {
    const processName = native.getProcessName(w.pid) ?? 'unknown';
    if (!matcher(processName)) continue;
    const monHandle = native.monitorFromWindow(w.hwnd);
    const monitorIndex = monHandle ? (monitorByHandle.get(monHandle) ?? 0) : 0;
    out.push({
      hwnd: Number(w.hwnd),
      title: w.title,
      processName,
      pid: w.pid,
      monitorIndex,
      visible: true,
    });
  }

  logger.debug('listWindows', { filter, count: out.length });
  return out;
}
