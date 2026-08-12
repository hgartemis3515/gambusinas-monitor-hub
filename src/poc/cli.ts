import { listMonitors } from '../main/monitors.js';
import { listWindows } from '../main/windows.js';
import { moveWindowToMonitor, setWindowMode } from '../main/windowManager.js';
import { isWin } from '../main/native/win32.js';
import type { WindowProcessFilter } from '../shared/types.js';

function usage(): void {
  console.log(`Uso:
  npm run poc -- list-monitors
  npm run poc -- list-windows [all|chrome|edge]
  npm run poc -- move <hwnd> <monitorIndex> [normal|maximized|fullscreen]
  npm run poc -- fullscreen <hwnd>
  npm run poc -- identify
`);
}

function printMonitors(): void {
  const monitors = listMonitors();
  console.log(`\nMonitores detectados: ${monitors.length}`);
  for (const m of monitors) {
    const tag = m.isPrimary ? ' (PRIMARIO)' : '';
    console.log(
      `  M${m.index}${tag}  ${m.bounds.width}x${m.bounds.height} @ (${m.bounds.x},${m.bounds.y})` +
        (m.deviceName ? `  [${m.deviceName}]` : ''),
    );
  }
}

function printWindows(filter: WindowProcessFilter): void {
  const windows = listWindows(filter);
  console.log(`\nVentanas (filtro: ${filter}): ${windows.length}`);
  for (const w of windows) {
    console.log(
      `  hwnd=${w.hwnd}  M${w.monitorIndex}  [${w.processName}]  "${w.title}"`,
    );
  }
}

function identify(): void {
  const { spawn } = require('node:child_process');
  console.log(
    '\nIdentificar monitores: abre una ventana numerada por cada display (2s).',
  );
  const monitors = listMonitors();
  for (const m of monitors) {
    const text = String(m.index);
    const psScript = `
Add-Type -AssemblyName PresentationFramework
$w = New-Object System.Windows.Window
$w.WindowStyle = 'None'
$w.WindowState = 'Maximized'
$w.AllowsTransparency = $true
$w.Background = [System.Windows.Media.Brushes]::Black
$w.Topmost = $true
$w.ShowInTaskbar = $false
$t = New-Object System.Windows.Controls.TextBlock
$t.Text = '${text}'
$t.FontSize = 200
$t.Foreground = [System.Windows.Media.Brushes]::White
$t.HorizontalAlignment = 'Center'
$t.VerticalAlignment = 'Center'
$w.Content = $t
$w.Show()
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(2)
$timer.Add_Tick({ $w.Close(); [System.Windows.Application]::Current.Shutdown() })
$timer.Start()
[System.Windows.Application]::New().Run($w) | Out-Null
`;
    const args = ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript];
    spawn('powershell', args, { detached: true, stdio: 'ignore' }).unref();
  }
}

function main(): void {
  if (!isWin) {
    console.error('Este PoC solo funciona en Windows.');
    process.exit(1);
  }
  const [, , cmd, ...rest] = process.argv;
  try {
    switch (cmd) {
      case 'list-monitors':
        printMonitors();
        break;
      case 'list-windows':
        printWindows((rest[0] as WindowProcessFilter) ?? 'all');
        break;
      case 'move': {
        const hwnd = Number(rest[0]);
        const monitorIndex = Number(rest[1]);
        const mode = (rest[2] as 'normal' | 'maximized' | 'fullscreen') ?? 'normal';
        if (!hwnd || !monitorIndex) {
          usage();
          process.exit(2);
        }
        moveWindowToMonitor(hwnd, monitorIndex, mode);
        console.log(`OK: hwnd ${hwnd} -> M${monitorIndex} (${mode})`);
        break;
      }
      case 'fullscreen': {
        const hwnd = Number(rest[0]);
        if (!hwnd) {
          usage();
          process.exit(2);
        }
        setWindowMode(hwnd, 'fullscreen');
        console.log(`OK: hwnd ${hwnd} fullscreen`);
        break;
      }
      case 'identify':
        identify();
        break;
      default:
        usage();
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
