// Bewusst KEIN statischer `import ... from 'jose'` für Laufzeit-Bindings
// (Design-Entscheidung, s. finale Antwort dieses Arbeitspakets): `jose`
// (Filip Skokan, MIT) verteilt je nach installierter Major-Version
// ESM-only oder dual CJS/ESM. Dieses Backend-Paket ist `"type":"commonjs"`
// (`module`/`moduleResolution`: `NodeNext`) — ein statischer `import`, der zu
// `require('jose')` kompiliert, würde bei einer reinen ESM-Distribution zur
// LAUFZEIT mit `ERR_REQUIRE_ESM` fehlschlagen. Der dynamische `import()`
// funktioniert dagegen unabhängig von der `jose`-Major-Version (Node lädt
// ESM-Module über `import()` auch aus CJS-Code korrekt). `import type`-
// Deklarationen (Typen, kein Laufzeit-Code) bleiben überall sonst als
// normale statische Imports zulässig, da sie beim Kompilieren vollständig
// entfernt werden (kein Laufzeit-`require`).
type JoseModule = typeof import('jose');

let cached: Promise<JoseModule> | undefined;

export function loadJose(): Promise<JoseModule> {
  cached ??= import('jose');
  return cached;
}
