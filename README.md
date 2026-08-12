# Gambusinas Monitor Hub

Launcher de escritorio Windows (estilo DisplayFusion) para distribuir ventanas en monitores físicos. Pensado para cocina: 1 PC con 1 monitor principal + N monitores secundarios en modo "extender".

## Estado

Fase 1 — PoC Win32 + CLI (en desarrollo).

## Uso del PoC (CLI)

```bash
npm install
npm run poc -- list-monitors
npm run poc -- list-windows
npm run poc -- list-windows chrome
npm run poc -- move <hwnd> <monitorIndex>
npm run poc -- fullscreen <hwnd>
npm run poc -- identify
```

## Arquitectura

- `src/types.ts` — tipos del dominio (`MonitorInfo`, `WindowInfo`, `WindowMode`).
- `src/native/win32.ts` — wrappers Win32 vía `koffi` (FFI, sin compilar C++).
- `src/monitors.ts` — `listMonitors()`.
- `src/windows.ts` — `listWindows(filter)`.
- `src/windowManager.ts` — `moveWindowToMonitor()`, `setWindowMode()`.
- `src/logger.ts` — logging mínimo con timestamp y nivel.
- `src/poc/cli.ts` — CLI para validar el spike en la máquina real.

## Plataforma

Solo Windows. En otros SO los módulos nativos lanzan error al usarse (importan sin fallar).
