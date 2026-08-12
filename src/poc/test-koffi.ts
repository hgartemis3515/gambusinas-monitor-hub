// Smoke test de la capa FFI koffi (no usa la API de alto nivel).
// Ejecutar: npx tsx src/poc/test-koffi.ts
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${name}: OK`);
  } catch (e) {
    console.log(`${name} FAIL:`, e instanceof Error ? e.message : e);
  }
}

run('proto classic + pointer', () => {
  const Cb = koffi.proto('MonEnumCb1', 'bool', ['void *', 'void *', 'void *', 'long']);
  user32.func('EnumDisplayMonitors', 'bool', ['void *', 'void *', koffi.pointer(Cb), 'long']);
});

run('proto string + pointer', () => {
  const Cb = koffi.proto('bool MonEnumCb2(void *a, void *b, void *c, long d)');
  user32.func('EnumDisplayMonitors', 'bool', ['void *', 'void *', koffi.pointer(Cb), 'long']);
});

run('EnumDisplayMonitors call', () => {
  const Cb = koffi.proto('bool __stdcall MonEnumCbCall(void *a, void *b, void *c, long d)');
  const F = user32.func('EnumDisplayMonitors', 'bool', ['void *', 'void *', koffi.pointer(Cb), 'long']);
  let count = 0;
  F(null, null, (() => {
    count++;
    return true;
  }) as never, 0);
  console.log(`  monitores enumerados: ${count}`);
});

run('EnumWindows call', () => {
  const Cb = koffi.proto('bool __stdcall WinEnumCb(void *hwnd, long lp)');
  const F = user32.func('EnumWindows', 'bool', [koffi.pointer(Cb), 'long']);
  let count = 0;
  F((() => {
    count++;
    return true;
  }) as never, 0);
  console.log(`  ventanas enumeradas: ${count}`);
});
