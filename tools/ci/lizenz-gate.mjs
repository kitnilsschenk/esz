#!/usr/bin/env node
// tools/ci/lizenz-gate.mjs
//
// License-Gate Stufe 1: Prueft den PRODUKTIONS-Abhaengigkeitsbaum aller
// Workspace-Pakete gegen die Lizenz-Whitelist aus
// `.claude/rules/dependencies.md`.
//
// WARUM ES DIESES SKRIPT GIBT
// ---------------------------
// Vorher lief hier `license-checker@25.0.1 --start <pkg> --production`, je
// Workspace-Paket einmal. Das Werkzeug stammt aus der npm/yarn-Welt und folgt
// dem pnpm-Store NICHT: pnpm legt jedes Paket genau einmal unter
// `node_modules/.pnpm/<name>@<version>/node_modules/<name>` ab und verlinkt von
// dort. `license-checker` laeuft den Symlinks nicht nach und sieht deshalb nur
// die direkt verlinkten Pakete der obersten Ebene.
//
// Wie gross der Unterschied ist, zeigt der Vergleich am 2026-09-16:
//
//     license-checker --start src/backend --production   ->   15 Pakete
//     pnpm licenses list -r --prod                       ->  617 Pakete
//
// Das Gate meldete "bestanden", weil es fast nichts sah — nicht, weil der Baum
// sauber war. Ein gruenes Gate, das nichts prueft, ist schaedlicher als gar
// keins: Es erzeugt genau die Sicherheit, die es widerlegen soll. Konkret
// durchgelassen hat es vier Pakete unter BlueOak-1.0.0 (`jackspeak`,
// `minipass`, `package-json-from-dist`, `path-scurry`), die ueber
// `typeorm` -> `glob` im ausgelieferten Backend landen. (Ein fuenfter
// Kandidat, `minimatch`, steht nur im DEV-Baum unter dieser Lizenz -- im
// Produktionsbaum liegt 9.0.9 unter ISC. Der Unterschied faellt nur auf, wenn
// man `--prod` von `--dev` trennt, und genau deshalb tut dieses Skript das.)
// BlueOak-1.0.0 ist seit dem 2026-09-16 durch User-Freigabe auf der
// Whitelist; der Befund bleibt hier stehen, weil er zeigt, was ein blindes
// Gate durchlaesst.
//
// `pnpm licenses list` ist pnpms eigenes Werkzeug und kennt den Store. Es
// braucht keine zusaetzliche Abhaengigkeit — wie `dco-check.sh` ist das hier
// bewusst Eigenentwicklung ohne Fremd-Action (Zero-Third-Party-Surface, stuetzt
// den Eigenentwicklungs-Nachweis gegenueber dem Foerdergeber).
//
// WAS GEPRUEFT WIRD
// -----------------
// Nur der PRODUKTIONS-Baum (`--prod`). Dev-Abhaengigkeiten werden nicht
// ausgeliefert und fallen nicht unter die Einbettungsfrage der Foerderauflage;
// sie brauchen nach der Regel trotzdem eine Freigabe, sind aber kein
// Merge-Blocker und werden hier nur nachrichtlich gelistet, wenn
// `--mit-dev` gesetzt ist.
//
// Zusammengesetzte SPDX-Ausdruecke werden ausgewertet, nicht als Zeichenkette
// verglichen: `(MIT AND BSD-3-Clause)` besteht nur, wenn BEIDE Teile erlaubt
// sind; `(MIT OR GPL-3.0)` besteht, wenn EINER erlaubt ist — bei ODER darf der
// Nutzer waehlen, und wir waehlen den erlaubten Zweig. Ein Paket ohne Lizenz
// oder mit `UNKNOWN` faellt durch: Eine unbekannte Lizenz ist keine
// permissive, sie ist ungeklaert.
//
// Usage:
//   node tools/ci/lizenz-gate.mjs [--mit-dev]
//
// Whitelist ueber die Umgebung (Semikolon-getrennt, gleiche Form wie zuvor):
//   EDMS_LICENSE_ALLOWLIST_SEMI="MIT;ISC;..."
// Fehlt sie, gilt die eingebaute Liste unten — sie ist die Kopie aus
// `.claude/rules/dependencies.md` und muss mit ihr uebereinstimmen.

import { execFileSync } from 'node:child_process';

/** Whitelist aus `.claude/rules/dependencies.md`. */
const WHITELIST_VORGABE = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'Apache 2.0',
  'MPL-2.0',
  'PostgreSQL',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  // Freigegeben 2026-09-16, s. `.claude/rules/dependencies.md`: permissiv,
  // Patentlizenz wie Apache-2.0 §3, kein Copyleft. Kam ueber typeorm -> glob.
  'BlueOak-1.0.0',
];

const mitDev = process.argv.includes('--mit-dev');

const whitelist = new Set(
  (process.env.EDMS_LICENSE_ALLOWLIST_SEMI
    ? process.env.EDMS_LICENSE_ALLOWLIST_SEMI.split(';')
    : WHITELIST_VORGABE
  )
    .map((eintrag) => eintrag.trim())
    .filter(Boolean)
    .map((eintrag) => eintrag.toLowerCase()),
);

/**
 * Wertet einen SPDX-Ausdruck gegen die Whitelist aus.
 *
 * Bewusst klein gehalten: Es geht um die Formen, die in einem npm-Baum
 * tatsaechlich vorkommen — ein blanker Bezeichner, eine UND-Verknuepfung, eine
 * ODER-Verknuepfung, jeweils optional geklammert. Ein vollstaendiger
 * SPDX-Parser waere eine weitere Abhaengigkeit fuer einen Gewinn, den dieser
 * Baum nicht hergibt. Verschachtelte Ausdruecke (`(A OR (B AND C))`) kommen
 * hier nicht vor; taeuchte einer auf, faellt er als nicht erlaubt durch und
 * wird damit sichtbar, statt still zu bestehen.
 */
function istErlaubt(ausdruck) {
  if (!ausdruck) return false;

  const roh = String(ausdruck).trim();
  if (!roh || roh.toUpperCase() === 'UNKNOWN' || roh.toUpperCase() === 'UNLICENSED') {
    return false;
  }

  const ohneKlammern = roh.replace(/^\(+/, '').replace(/\)+$/, '').trim();

  // `+` (z. B. "GPL-2.0+") und ein nachgestelltes WITH sind fuer die
  // Whitelist-Frage unerheblich bzw. machen die Lizenz strenger — beides fuehrt
  // dazu, dass der Ausdruck nicht als blanker Treffer gilt.
  if (/\bOR\b/i.test(ohneKlammern)) {
    return ohneKlammern.split(/\bOR\b/i).some((teil) => istErlaubt(teil));
  }
  if (/\bAND\b/i.test(ohneKlammern)) {
    return ohneKlammern.split(/\bAND\b/i).every((teil) => istErlaubt(teil));
  }

  return whitelist.has(ohneKlammern.toLowerCase());
}

function leseLizenzen(prodNur) {
  const argumente = ['licenses', 'list', '-r', '--json'];
  if (prodNur) argumente.push('--prod');
  const ausgabe = execFileSync('pnpm', argumente, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(ausgabe);
}

function sammleVerstoesse(nachLizenz) {
  const verstoesse = [];
  for (const [lizenz, pakete] of Object.entries(nachLizenz)) {
    if (istErlaubt(lizenz)) continue;
    for (const paket of pakete) {
      verstoesse.push({
        name: paket.name,
        versionen: (paket.versions ?? []).join(', '),
        lizenz,
      });
    }
  }
  return verstoesse.sort((a, b) => a.name.localeCompare(b.name));
}

// Selbsttest der Ausdrucks-Auswertung. Sie ist die Stelle, die still falsch
// werden kann: Ein Fehler macht das Gate nicht rot, sondern gruen — und ein
// gruenes Gate prueft niemand nach. Laeuft in CI mit, kostet nichts.
if (process.argv.includes('--selbsttest')) {
  const faelle = [
    ['MIT', true],
    ['Apache-2.0', true],
    ['mit', true, 'Gross-/Kleinschreibung ist unerheblich'],
    ['(MIT AND BSD-3-Clause)', true, 'UND: beide Teile erlaubt'],
    ['(MIT AND GPL-3.0)', false, 'UND: ein Teil verboten kippt das Ganze'],
    ['(MIT OR GPL-3.0)', true, 'ODER: der erlaubte Zweig darf gewaehlt werden'],
    ['(GPL-2.0 OR AGPL-3.0)', false, 'ODER: kein Zweig erlaubt'],
    ['GPL-3.0', false],
    ['BlueOak-1.0.0', true, 'User-Freigabe 2026-09-16 — permissiv, Patentlizenz, kein Copyleft'],
    ['UNKNOWN', false, 'ungeklaert ist nicht permissiv'],
    ['', false],
    [null, false],
    ['Apache-2.0 WITH LLVM-exception', false, 'WITH aendert die Lizenz, also erst pruefen'],
  ];
  let fehler = 0;
  for (const [ausdruck, erwartet, warum] of faelle) {
    const ist = istErlaubt(ausdruck);
    if (ist !== erwartet) {
      console.error(
        `SELBSTTEST FEHLER: istErlaubt(${JSON.stringify(ausdruck)}) = ${ist}, erwartet ${erwartet}` +
          (warum ? ` — ${warum}` : ''),
      );
      fehler += 1;
    }
  }
  if (fehler > 0) {
    console.error(`${fehler} von ${faelle.length} Faellen falsch.`);
    process.exit(2);
  }
  console.log(`Selbsttest bestanden (${faelle.length} Faelle).`);
  process.exit(0);
}

let prodBaum;
try {
  prodBaum = leseLizenzen(true);
} catch (fehler) {
  console.error('FEHLER: `pnpm licenses list -r --prod --json` ist gescheitert.');
  console.error(fehler.message);
  process.exit(2);
}

const anzahlPakete = Object.values(prodBaum).reduce((summe, liste) => summe + liste.length, 0);
const verstoesse = sammleVerstoesse(prodBaum);

console.log(`License-Gate Stufe 1 — Produktionsbaum, ${anzahlPakete} Pakete geprueft.`);
console.log(`Whitelist: ${[...whitelist].join(', ')}`);
console.log('');

if (mitDev) {
  try {
    const vollBaum = leseLizenzen(false);
    const devVerstoesse = sammleVerstoesse(vollBaum).filter(
      (eintrag) => !verstoesse.some((v) => v.name === eintrag.name && v.lizenz === eintrag.lizenz),
    );
    if (devVerstoesse.length > 0) {
      console.log('Nachrichtlich — nur in Dev-Abhaengigkeiten, nicht ausgeliefert:');
      for (const eintrag of devVerstoesse) {
        console.log(`  ${eintrag.name}@${eintrag.versionen} — ${eintrag.lizenz}`);
      }
      console.log('');
    }
  } catch {
    console.log('Hinweis: Dev-Baum konnte nicht gelesen werden, wird uebersprungen.');
    console.log('');
  }
}

if (verstoesse.length === 0) {
  console.log('Bestanden: Jede Lizenz im Produktionsbaum steht auf der Whitelist.');
  process.exit(0);
}

console.error(`DURCHGEFALLEN: ${verstoesse.length} Paket(e) mit nicht freigegebener Lizenz im`);
console.error('Produktionsbaum. Diese Pakete werden mit ausgeliefert.');
console.error('');
for (const eintrag of verstoesse) {
  console.error(`  ${eintrag.name}@${eintrag.versionen} — ${eintrag.lizenz}`);
}
console.error('');
console.error('Weg nach `.claude/rules/dependencies.md`: Lizenz pruefen, dann ENTWEDER die');
console.error('Abhaengigkeit ersetzen ODER die Lizenz durch den User freigeben lassen und in');
console.error('die Whitelist aufnehmen — in der Regeldatei UND in `EDMS_LICENSE_ALLOWLIST_SEMI`');
console.error('in `.github/workflows/ci.yml`. Herkunft mit `pnpm why -r <paket>` bestimmen.');
process.exit(1);
