# Gambusinas Monitor Hub

Launcher de escritorio Windows (estilo DisplayFusion) para distribuir ventanas en monitores físicos. Pensado para cocina: 1 PC con 1 monitor principal + N monitores secundarios en modo "extender".

## Estado

- Fase 1 — PoC Win32 + CLI: **hecho**
- Fase 2 — Electron + UI React: **hecho**
- Fase 3 — Modos de ventana (normal/maximizado/fullscreen): **hecho**
- Fase 4 — Perfiles de layout (guardar/aplicar/borrar): **hecho**
- Fase 5 — Bridge con App Cocina (inbox + archivo JSON): **hecho**
- Fase 6 — Pulido (polling, errores, identificar monitores): **hecho**

## Uso

### App de escritorio

```bash
npm install
npm run dev      # desarrollo con HMR
npm run build    # build producción
npm start        # preview de la app compilada
```

### CLI de validación (PoC Fase 1)

```bash
npm run poc -- list-monitors
npm run poc -- list-windows [all|chrome|edge]
npm run poc -- move <hwnd> <monitorIndex> [normal|maximized|fullscreen]
npm run poc -- fullscreen <hwnd>
npm run poc -- identify
```

## Arquitectura

```
src/
  main/                 # proceso principal Electron (Node)
    index.ts            # arranque + BrowserWindow
    ipc.ts              # handlers IPC centralizados
    native/win32.ts     # wrappers Win32 vía koffi (FFI)
    monitors.ts         # listMonitors()
    windows.ts          # listWindows(filter)
    windowManager.ts    # moveWindowToMonitor(), setWindowMode()
    layoutStore.ts      # perfiles JSON en %APPDATA%/.../layouts
    cocinaBridge.ts     # import desde App Cocina (inbox + archivo)
  preload/
    index.ts            # contextBridge expone window.hub
  renderer/             # UI React
    App.tsx
    components/
      MonitorCard.tsx   # tarjeta por monitor (estado "transmitiendo")
      WindowPicker.tsx  # lista de ventanas + enviar a monitor N
      LayoutPanel.tsx   # perfiles + import Cocina
  shared/
    types.ts            # MonitorInfo, WindowInfo, LayoutProfile, ...
    ipc-channels.ts     # nombres de canales IPC
    logger.ts
  poc/
    cli.ts              # CLI Fase 1
    test-koffi.ts       # smoke test FFI
```

## IPC

Canales: `monitors:list`, `monitors:identify`, `windows:list`, `window:move`,
`window:setMode`, `layouts:list`, `layouts:save`, `layouts:apply`,
`layouts:delete`, `cocina:import`, `cocina:importFile`.

## Integración con App Cocina

El Hub lee layouts desde:
- **Inbox**: `%APPDATA%/Gambusinas Monitor Hub/cocina-inbox/*.json` (escrito por App Cocina).
- **Archivo**: botón "Importar archivo JSON…" (dialogo de archivo).

Formato esperado (`CocinaLayoutImport`):

```json
{
  "source": "appcocina",
  "profileName": "Turno noche 7 cocineros",
  "slots": [
    { "monitorIndex": 2, "match": { "titleContains": "Ana" }, "mode": "fullscreen" },
    { "monitorIndex": 3, "url": "http://host/?monitor=3&cocineroId=...&modo=completo-fijo", "mode": "fullscreen" }
  ]
}
```

Al aplicar un perfil, el Hub reutiliza ventanas abiertas que encajen con `match`
o abre Chrome/Edge con `url` posicionada en el monitor destino.

## Plataforma

Solo Windows. koffi (N-API) carga los binarios Win32 en runtime.
