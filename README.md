# Gambusinas Monitor Hub

Launcher de escritorio Windows (estilo DisplayFusion) para distribuir ventanas en monitores físicos. Pensado para cocina: 1 PC con 1 monitor principal + N monitores secundarios en modo "extender".

## Estado

- Fase 1 — PoC Win32 + CLI: **hecho**
- Fase 2 — Electron + UI React: **hecho**
- Fase 3 — Modos de ventana (normal/maximizado/fullscreen): **hecho**
- Fase 4 — Perfiles de layout (guardar/aplicar/borrar): **hecho**
- Fase 5 — Bridge con App Cocina (inbox + archivo JSON + HTTP local): **hecho**
- Fase 6 — Pulido (polling, errores, identificar monitores): **hecho**
- Instalador NSIS (Windows): **publicado como Release**

## Descarga

Instalador (solo la primera vez): https://github.com/hgartemis3515/gambusinas-monitor-hub/releases/latest

La app instalada se actualiza sola al abrir y cada 15 min (Ajustes → Buscar actualizaciones). No hace falta volver a bajar el Setup.

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

El Hub lee layouts desde tres vías:

1. **HTTP local** (recomendado): App Cocina hace `POST http://127.0.0.1:7331/import`
   con el body `CocinaLayoutImport`. El Hub lo guarda en el inbox y queda listo
   para importar/aplicar. En `DistribuirCocinaMonitoresPage` hay un botón
   **"Enviar al Monitor Hub"** que envía la asignación actual por esta vía
   (requiere que el Hub corra en la misma PC que App Cocina).
2. **Inbox**: `%APPDATA%/Gambusinas Monitor Hub/cocina-inbox/*.json` (escrito
   por la vía HTTP o manualmente).
3. **Archivo**: botón "Importar archivo JSON…" (diálogo de archivo).

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
