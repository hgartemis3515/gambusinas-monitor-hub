import koffi from 'koffi';
import { platform } from 'node:os';
import type { MonitorBounds, RawMonitorData } from '../../shared/types.js';

const isWindows = platform() === 'win32';

const MONITOR_DEFAULTTONEAREST = 0x00000002;
const MONITORINFOF_PRIMARY = 0x00000001;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const GWL_STYLE = -16;
const WS_OVERLAPPEDWINDOW = 0x00cf0000;
const WS_POPUP = 0x80000000;
const WS_VISIBLE = 0x10000000;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SW_RESTORE = 9;
const SW_MAXIMIZE = 3;
const SW_SHOW = 5;
const VK_F11 = 0x7a;
const VK_MENU = 0x12; // ALT, para el truco de SetForegroundWindow
const KEYEVENTF_KEYUP = 0x0002;

interface NativeApi {
  enumMonitors(): RawMonitorData[];
  enumWindowsRaw(): Array<{ hwnd: bigint; title: string; pid: number }>;
  monitorFromWindow(hwnd: bigint): bigint | null;
  getProcessName(pid: number): string | null;
  setWindowPos(hwnd: bigint, x: number, y: number, w: number, h: number): boolean;
  showWindow(hwnd: bigint, cmd: number): boolean;
  getWindowStyle(hwnd: bigint): number;
  setWindowStyle(hwnd: bigint, style: number): void;
  bringToFront(hwnd: bigint): void;
  sendF11(hwnd: bigint): void;
  captureRect(
    x: number,
    y: number,
    w: number,
    h: number,
    dstW: number,
    dstH: number,
  ): Buffer | null;
}

let _native: NativeApi | null = null;

function buildNative(): NativeApi {
  if (!isWindows) {
    throw new Error('Win32 native API solo disponible en Windows');
  }

  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const gdi32 = koffi.load('gdi32.dll');
  const SRCCOPY = 0x00cc0020;
  const HALFTONE = 4;

  const RECT = koffi.struct('RECT', {
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long',
  });

  const MONITORINFOEXW = koffi.struct('MONITORINFOEXW', {
    cbSize: 'uint32',
    rcMonitor: RECT,
    rcWork: RECT,
    dwFlags: 'uint32',
    szDevice: koffi.array('uint16', 32),
  });

  const MonitorEnumProc = koffi.proto(
    'bool __stdcall MonitorEnumProc(void *hMonitor, void *hdc, void *lprc, long dwData)',
  );
  const EnumWindowsProc = koffi.proto(
    'bool __stdcall EnumWindowsProc(void *hwnd, long lParam)',
  );

  const EnumDisplayMonitors = user32.func(
    'EnumDisplayMonitors',
    'bool',
    ['void *', 'void *', koffi.pointer(MonitorEnumProc), 'long'],
  );
  const GetMonitorInfoW = user32.func(
    'bool GetMonitorInfoW(void *hMonitor, MONITORINFOEXW *lpmi)',
  );
  const EnumWindows = user32.func(
    'EnumWindows',
    'bool',
    [koffi.pointer(EnumWindowsProc), 'long'],
  );
  const IsWindowVisible = user32.func('bool IsWindowVisible(void *hwnd)');
  const GetWindowTextLengthW = user32.func(
    'int GetWindowTextLengthW(void *hwnd)',
  );
  const GetWindowTextW = user32.func(
    'int GetWindowTextW(void *hwnd, uint16 *lpString, int nMaxCount)',
  );
  const GetWindowThreadProcessId = user32.func(
    'uint32 GetWindowThreadProcessId(void *hwnd, uint32 *lpdwProcessId)',
  );
  const MonitorFromWindow = user32.func(
    'void *MonitorFromWindow(void *hwnd, uint32 dwFlags)',
  );
  const SetWindowPos = user32.func(
    'bool SetWindowPos(void *hwnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)',
  );
  const ShowWindow = user32.func('bool ShowWindow(void *hwnd, int nCmdShow)');
  const GetWindowLongPtrW = user32.func(
    'intptr GetWindowLongPtrW(void *hwnd, int nIndex)',
  );
  const SetWindowLongPtrW = user32.func(
    'intptr SetWindowLongPtrW(void *hwnd, int nIndex, intptr dwNewLong)',
  );
  const SetForegroundWindow = user32.func(
    'bool SetForegroundWindow(void *hwnd)',
  );
  const keybd_event = user32.func(
    'void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)',
  );
  const OpenProcess = kernel32.func(
    'void *OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)',
  );
  const QueryFullProcessImageNameW = kernel32.func(
    'bool QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, uint16 *lpExeName, uint32 *lpdwSize)',
  );
  const CloseHandle = kernel32.func('bool CloseHandle(void *hObject)');

  const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
    biSize: 'uint32',
    biWidth: 'int32',
    biHeight: 'int32',
    biPlanes: 'uint16',
    biBitCount: 'uint16',
    biCompression: 'uint32',
    biSizeImage: 'uint32',
    biXPelsPerMeter: 'int32',
    biYPelsPerMeter: 'int32',
    biClrUsed: 'uint32',
    biClrImportant: 'uint32',
  });

  const GetDC = user32.func('void *GetDC(void *hWnd)');
  const ReleaseDC = user32.func('int ReleaseDC(void *hWnd, void *hDC)');
  const CreateCompatibleDC = gdi32.func('void *CreateCompatibleDC(void *hdc)');
  const CreateCompatibleBitmap = gdi32.func(
    'void *CreateCompatibleBitmap(void *hdc, int cx, int cy)',
  );
  const SelectObject = gdi32.func('void *SelectObject(void *hdc, void *h)');
  const StretchBlt = gdi32.func(
    'int StretchBlt(void *hdcDest, int xDest, int yDest, int wDest, int hDest, void *hdcSrc, int xSrc, int ySrc, int wSrc, int hSrc, uint32 rop)',
  );
  const SetStretchBltMode = gdi32.func('int SetStretchBltMode(void *hdc, int mode)');
  const SetBrushOrgEx = gdi32.func(
    'int SetBrushOrgEx(void *hdc, int x, int y, void *lppt)',
  );
  const DeleteDC = gdi32.func('int DeleteDC(void *hdc)');
  const DeleteObject = gdi32.func('int DeleteObject(void *ho)');
  const GetDIBits = gdi32.func(
    'int GetDIBits(void *hdc, void *hbm, uint32 start, uint32 lines, void *bits, void *bmi, uint32 usage)',
  );

  function decodeWchar(arr: ArrayLike<number>, max: number): string {
    const codes: number[] = [];
    for (let i = 0; i < max; i++) {
      const c = (arr as unknown as number[])[i];
      if (c === undefined || c === 0) break;
      codes.push(c);
    }
    return String.fromCharCode(...codes);
  }

  function rectToBounds(r: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): MonitorBounds {
    return {
      x: r.left,
      y: r.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
    };
  }

  function enumMonitors(): RawMonitorData[] {
    const out: RawMonitorData[] = [];
    const cb = (_hMon: unknown, _hdc: unknown, _lprc: unknown, _data: unknown) => {
      const infoPtr = koffi.alloc(MONITORINFOEXW, 1);
      koffi.encode(infoPtr, MONITORINFOEXW, { cbSize: koffi.sizeof(MONITORINFOEXW) });
      const ok = GetMonitorInfoW(_hMon as never, infoPtr);
      if (!ok) return true;
      const info = koffi.decode(infoPtr, MONITORINFOEXW) as {
        rcMonitor: { left: number; top: number; right: number; bottom: number };
        rcWork: { left: number; top: number; right: number; bottom: number };
        dwFlags: number;
        szDevice: Uint16Array | number[];
      };
      const handle = koffi.address(_hMon as never) as bigint;
      out.push({
        handle,
        bounds: rectToBounds(info.rcMonitor),
        workArea: rectToBounds(info.rcWork),
        isPrimary: (info.dwFlags & MONITORINFOF_PRIMARY) !== 0,
        deviceName: decodeWchar(info.szDevice as Uint16Array, 32),
      });
      return true;
    };
    EnumDisplayMonitors(null, null, cb as never, 0);
    return out;
  }

  function enumWindowsRaw(): Array<{
    hwnd: bigint;
    title: string;
    pid: number;
  }> {
    const out: Array<{ hwnd: bigint; title: string; pid: number }> = [];
    const cb = (hwndRaw: unknown, _lparam: unknown) => {
      const hwnd = koffi.address(hwndRaw as never) as bigint;
      if (!IsWindowVisible(hwndRaw as never)) return true;
      const len = GetWindowTextLengthW(hwndRaw as never);
      if (len <= 0) return true;
      const buf = Buffer.alloc((len + 1) * 2);
      GetWindowTextW(hwndRaw as never, buf, len + 1);
      const title = buf.toString('utf16le', 0, len * 2);
      const pidBuf = Buffer.alloc(4);
      GetWindowThreadProcessId(hwndRaw as never, pidBuf);
      const pid = pidBuf.readUInt32LE(0);
      out.push({ hwnd, title, pid });
      return true;
    };
    EnumWindows(cb as never, 0);
    return out;
  }

  function monitorFromWindow(hwnd: bigint): bigint | null {
    const handlePtr = MonitorFromWindow(hwnd as never, MONITOR_DEFAULTTONEAREST);
    const addr = koffi.address(handlePtr as never);
    if (!addr) return null;
    return BigInt(addr) as bigint;
  }

  function getProcessName(pid: number): string | null {
    const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (!h) return null;
    try {
      const buf = Buffer.alloc(1024 * 2);
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32LE(1024, 0);
      const ok = QueryFullProcessImageNameW(h, 0, buf, sizeBuf);
      if (!ok) return null;
      const len = sizeBuf.readUInt32LE(0);
      const full = buf.toString('utf16le', 0, len * 2);
      const slash = Math.max(full.lastIndexOf('\\'), full.lastIndexOf('/'));
      return slash >= 0 ? full.slice(slash + 1) : full;
    } finally {
      CloseHandle(h);
    }
  }

  function setWindowPos(
    hwnd: bigint,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean {
    return Boolean(
      SetWindowPos(
        hwnd as never,
        null,
        x,
        y,
        w,
        h,
        SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
      ),
    );
  }

  function showWindow(hwnd: bigint, cmd: number): boolean {
    return Boolean(ShowWindow(hwnd as never, cmd));
  }

  function getWindowStyle(hwnd: bigint): number {
    return Number(GetWindowLongPtrW(hwnd as never, GWL_STYLE));
  }

  function setWindowStyle(hwnd: bigint, style: number): void {
    SetWindowLongPtrW(hwnd as never, GWL_STYLE, style);
  }

  function bringToFront(hwnd: bigint): void {
    SetForegroundWindow(hwnd as never);
  }

  function sendF11(hwnd: bigint): void {
    // Truco ALT: pulsa y suelta ALT para que Windows permita SetForegroundWindow
    // desde este proceso (sino lo bloquea por no ser ya el foreground).
    keybd_event(VK_MENU, 0, 0, 0);
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    SetForegroundWindow(hwnd as never);
    keybd_event(VK_F11, 0, 0, 0);
    keybd_event(VK_F11, 0, KEYEVENTF_KEYUP, 0);
  }

  function captureRect(
    x: number,
    y: number,
    w: number,
    h: number,
    dstW: number,
    dstH: number,
  ): Buffer | null {
    const width = Math.max(1, Math.floor(dstW));
    const height = Math.max(1, Math.floor(dstH));
    const hdcScreen = GetDC(null);
    if (!hdcScreen) return null;
    const hdcMem = CreateCompatibleDC(hdcScreen);
    if (!hdcMem) {
      ReleaseDC(null, hdcScreen);
      return null;
    }
    const hbm = CreateCompatibleBitmap(hdcScreen, width, height);
    if (!hbm) {
      DeleteDC(hdcMem);
      ReleaseDC(null, hdcScreen);
      return null;
    }
    const prev = SelectObject(hdcMem, hbm);
    SetStretchBltMode(hdcMem, HALFTONE);
    SetBrushOrgEx(hdcMem, 0, 0, null);
    const ok = StretchBlt(
      hdcMem,
      0,
      0,
      width,
      height,
      hdcScreen,
      Math.floor(x),
      Math.floor(y),
      Math.max(1, Math.floor(w)),
      Math.max(1, Math.floor(h)),
      SRCCOPY,
    );
    if (!ok) {
      SelectObject(hdcMem, prev);
      DeleteObject(hbm);
      DeleteDC(hdcMem);
      ReleaseDC(null, hdcScreen);
      return null;
    }
    const bmiPtr = koffi.alloc(BITMAPINFOHEADER, 1);
    koffi.encode(bmiPtr, BITMAPINFOHEADER, {
      biSize: koffi.sizeof(BITMAPINFOHEADER),
      biWidth: width,
      biHeight: -height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    });
    const pixels = Buffer.alloc(width * height * 4);
    const copied = GetDIBits(hdcMem, hbm, 0, height, pixels, bmiPtr, 0);
    SelectObject(hdcMem, prev);
    DeleteObject(hbm);
    DeleteDC(hdcMem);
    ReleaseDC(null, hdcScreen);
    if (!copied) return null;
    return pixels;
  }

  return {
    enumMonitors,
    enumWindowsRaw,
    monitorFromWindow,
    getProcessName,
    setWindowPos,
    showWindow,
    getWindowStyle,
    setWindowStyle,
    bringToFront,
    sendF11,
    captureRect,
  };
}

export function getNative(): NativeApi {
  if (!_native) _native = buildNative();
  return _native;
}

export const isWin = isWindows;

export const constants = {
  SW_RESTORE,
  SW_MAXIMIZE,
  SW_SHOW,
  WS_OVERLAPPEDWINDOW,
  WS_POPUP,
  WS_VISIBLE,
  SWP_NOZORDER,
  SWP_NOACTIVATE,
  SWP_FRAMECHANGED,
  SWP_SHOWWINDOW,
};
