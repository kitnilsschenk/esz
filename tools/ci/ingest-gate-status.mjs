#!/usr/bin/env node
// tools/ci/ingest-gate-status.mjs
//
// Sagt, welche der Bedingungen für den Real-Daten-Betrieb erfüllt sind — und
// welche nicht.
//
// WORUM ES GEHT
// -------------
// `EDMS_SYNTHETIC_ONLY=false` ist der Moment, in dem echte Personendaten ins
// System dürfen. ADR-0004 §7.1 knüpft ihn an sechs Bedingungen, ADR-0008 §22
// verlangt zusätzlich, dass die zugehörigen „Gate-Marker" NICHT als
// selbst-attestierte Config-Flags existieren.
//
// DIE ZENTRALE UNTERSCHEIDUNG DIESES SKRIPTS
// ------------------------------------------
// Die sechs Bedingungen sind NICHT gleichartig, und sie gleich zu behandeln
// wäre der eigentliche Fehler:
//
//   * Ob ein AVV geschlossen ist, kann keine Software feststellen. Ein AVV
//     ist ein Vertrag. Wer so tut, als prüfe er ihn, baut eine Attrappe —
//     und eine Schein-Verifikation ist schlimmer als eine offene Lücke, weil
//     sie das Vertrauen erzeugt, das sie nicht verdient.
//
//   * Was dieses Repository sehr wohl prüfen kann: ob die Compliance-Akte
//     SELBST behauptet, die Voraussetzung sei erfüllt. `avv-register.md`
//     trägt `status: review` und im Text „Register bleibt review, weil kein
//     AVV geschlossen ist". Das ist eine maschinenlesbare, nicht beiläufig
//     fälschbare Aussage: Die Datei steht unter Schreibschutz
//     (`.claude/settings.json`), trägt die Signatur des
//     `compliance-director` und liegt mit DCO-Signoff in der Historie.
//
// Deshalb drei Gruppen: geprüft, zur Laufzeit zu prüfen, nur attestierbar.
// Was nur attestierbar ist, wird als Behauptung ausgewiesen — nicht als
// Häkchen.
//
// DIES IST EIN BETREIBER-WERKZEUG, KEIN PRODUKTBESTANDTEIL
// --------------------------------------------------------
// Wichtige Abgrenzung, weil dieses Repository unter Apache-2.0
// veröffentlicht wird: Die Compliance-Akte ist vom Public-Export
// ausgeschlossen (`tools/public-export/exclude.txt`, „niemals öffentlich").
// Sie gehört KIT Consulting als Betreiber — ein Dritter, der diese Software
// einsetzt, hat seinen EIGENEN AVV, seine EIGENE DSFA, seinen eigenen Hoster.
//
// Dieses Skript prüft folglich NICHT das Produkt, sondern den Aktenstand
// EINES Betreibers. Fehlt die Akte — also in jedem veröffentlichten Stand und
// in jedem Fork —, sagt es das und hört auf. Es stürzt nicht ab (so war es in
// der ersten Fassung) und behauptet erst recht nicht, ein fremder Betrieb sei
// nicht freigabefähig, weil ER unsere Unterlagen nicht hat.
//
// Der LAUFZEIT-Riegel der Software hängt bewusst an keiner dieser Dateien.
// Er hängt am Gate-Marker in der Datenbank des jeweiligen Betreibers — der
// ist betreiberlokal und trägt dessen eigene Nachweise. Nur so trägt der
// Mechanismus für jeden, der die Software einsetzt, statt nur für uns.
//
// WARUM ES NICHT ROT WIRD
// -----------------------
// Ohne Argument ist dies ein BERICHT, kein Gate: Exit 0, auch wenn nichts
// erfüllt ist. Ein CI-Job, der bis zum Tag der Gate-Öffnung rot steht, wird
// nach der zweiten Woche ignoriert oder abgeschaltet — und dann fehlt er
// genau dann, wenn er zählt.
//
// Mit `--verlangen` ist es ein Gate: Exit 1, sobald eine prüfbare Bedingung
// offen ist. Diese Form gehört in den Deploy-Pfad für Real-Daten-Betrieb,
// nicht in die normale Pipeline.
//
// `--fingerabdruck` gibt den SHA-256 über die beteiligten Artefakte aus. Der
// wandert in den Datenbank-Marker: Er bindet die Freigabe an einen KONKRETEN
// Aktenstand, sodass eine spätere Änderung an DSFA oder AVV-Register die
// Freigabe ungültig macht, statt sie stillschweigend weitergelten zu lassen.
//
// Usage:
//   node tools/ci/ingest-gate-status.mjs                 # Bericht
//   node tools/ci/ingest-gate-status.mjs --verlangen     # Gate
//   node tools/ci/ingest-gate-status.mjs --fingerabdruck # nur der Hash

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Aktenstücke, deren `status:` eine Gate-Bedingung trägt.
 * `soll` ist der Status, bei dem die Bedingung als erfüllt gilt.
 */
const AKTENSTUECKE = [
  {
    bedingung: 'DSFA abgeschlossen',
    quelle: 'ADR-0004 §7.1 Nr. 4, Art. 35 DSGVO',
    gate: true,
    datei: 'compliance/dsgvo/dsfas/dsfa-0001-messdaten-verarbeitung.md',
    soll: 'active',
  },
  {
    bedingung: 'AVV geschlossen',
    quelle: 'ADR-0004 §7.1 Nr. 5, Art. 28 DSGVO',
    gate: true,
    datei: 'compliance/dsgvo/avv-register.md',
    soll: 'active',
  },
  // Die folgenden sind KEINE Gate-Bedingungen aus §7.1 -- sie stehen hier,
  // weil sie denselben Aktenstand betreffen und man sie beim Umschaltakt
  // ohnehin sehen will. Sie als Gate-Bedingung auszugeben hiesse zu
  // behaupten, das ADR verlange etwas, das es nicht verlangt: Ein Werkzeug,
  // das strenger ist als die Vorgabe, klingt sicher, macht die Vorgabe aber
  // unlesbar -- und beim naechsten Widerspruch glaubt man weder dem einen
  // noch dem anderen.
  {
    bedingung: 'Verarbeitungsverzeichnis geführt',
    quelle: 'Art. 30 DSGVO — eigenständige Pflicht, nicht §7.1',
    gate: false,
    datei: 'compliance/dsgvo/rvt.md',
    soll: 'active',
  },
  {
    bedingung: 'Löschfristen festgestellt',
    quelle: 'Art. 5 Abs. 1 lit. e — eigenständige Pflicht, nicht §7.1',
    gate: false,
    datei: 'compliance/dsgvo/retention-matrix.md',
    soll: 'active',
  },
];

/** Bedingungen, die erst die laufende Instanz kennt. */
const LAUFZEIT = [
  {
    bedingung: 'Consent-Enforcement scharf (ADR-0012 Stufe C)',
    hinweis: 'EDMS_INGEST_CONSENT_ENFORCEMENT=true plus Freigabe-Referenz; Default ist aus.',
  },
];

/**
 * Bedingungen, die KEINE Software feststellen kann. Sie stehen hier, damit
 * niemand sie für vergessen hält — eine unvollständige Liste wäre gefährlicher
 * als eine ehrliche.
 */
const NUR_ATTESTIERBAR = [
  {
    bedingung: 'DE-Only-Hosting (ADR-0004 §7.1 Nr. 5, DS-09)',
    warum:
      'Wo eine Software läuft, kann sie über sich selbst nicht zuverlässig feststellen. ' +
      'Zeitzone oder Region wären Vermutungen; eine Vermutung als Beweis auszugeben wäre schlechter als die Lücke.',
  },
  {
    bedingung: 'Transfer-Impact-Assessment (TIA) vorhanden',
    warum: 'Ein Dokument. Im Repository liegt bislang keines — es gibt also nicht einmal etwas zu referenzieren.',
  },
];

/** Liest ein Aktenstück; `undefined`, wenn es in diesem Stand nicht vorliegt. */
function akteLesen(datei) {
  try {
    return readFileSync(path.join(WURZEL, datei), 'utf8');
  } catch (fehler) {
    if (fehler.code === 'ENOENT') return undefined;
    throw fehler;
  }
}

function frontmatterStatus(inhalt) {
  return inhalt === undefined ? undefined : /^status:\s*(\S+)\s*$/m.exec(inhalt)?.[1];
}

function revision(inhalt) {
  return inhalt === undefined ? '?' : (/^revision:\s*(\S+)\s*$/m.exec(inhalt)?.[1] ?? '?');
}

/** Liegt in diesem Stand überhaupt eine Betreiber-Akte vor? */
const akteVorhanden = AKTENSTUECKE.some((a) => akteLesen(a.datei) !== undefined);

/** Ist ein Produktions-KMS gebunden, oder noch der Dev-Adapter? */
function kmsBefund() {
  const datei = 'src/backend/src/common/crypto/crypto.module.ts';
  const inhalt = readFileSync(path.join(WURZEL, datei), 'utf8');
  const devGebunden = /KEY_MANAGEMENT_PORT[\s\S]{0,200}LocalDevKmsAdapter/.test(inhalt);
  return {
    bedingung: 'Produktiver KeyManagementPort gebunden',
    quelle: 'ADR-0008 §19/§22, ADR-0004 §7.1 Nr. 6',
    gate: true,
    erfuellt: !devGebunden,
    detail: devGebunden
      ? `${datei}: KEY_MANAGEMENT_PORT zeigt auf LocalDevKmsAdapter — Master-Key aus der Umgebung.`
      : `${datei}: kein LocalDevKmsAdapter mehr gebunden.`,
  };
}

const pruefungen = AKTENSTUECKE.map((a) => {
  const inhalt = akteLesen(a.datei);
  const ist = frontmatterStatus(inhalt);
  return {
    ...a,
    ist,
    erfuellt: ist === a.soll,
    detail: `${a.datei}: status=${ist ?? '(fehlt)'} (soll: ${a.soll}), revision=${revision(inhalt)}`,
  };
});
pruefungen.push(kmsBefund());

// Ohne Betreiber-Akte ist hier nichts zu pruefen. Das ist der Normalfall
// jedes veroeffentlichten Stands -- s. Kopfkommentar.
if (!akteVorhanden) {
  if (process.argv.includes('--fingerabdruck')) {
    // Ein Aufrufer, der einen Hash erwartet, darf keine Prosa bekommen --
    // und schon gar keinen Hash ueber nicht vorhandene Dateien.
    console.error('Kein Fingerabdruck möglich: In diesem Stand liegt keine Compliance-Akte vor.');
    process.exit(2);
  }
  console.log('Ingest-Gate — Bedingungen für den Betrieb mit echten Personendaten');
  console.log('');
  console.log('In diesem Stand liegt keine Compliance-Akte vor.');
  console.log('');
  console.log('Das ist kein Fehler: Die Akte ist vom Public-Export ausgeschlossen');
  console.log('(tools/public-export/exclude.txt). Sie gehört dem Betreiber, nicht dem');
  console.log('Produkt — wer diese Software einsetzt, führt seinen eigenen AVV, seine');
  console.log('eigene DSFA und sein eigenes Hosting-Verzeichnis.');
  console.log('');
  console.log('Für den eigenen Betrieb zu prüfen, bevor echte Personendaten fließen');
  console.log('(ADR-0004 §7.1, im Repository unter docs/adr/):');
  for (const a of AKTENSTUECKE.filter((x) => x.gate)) {
    console.log(`  - ${a.bedingung}  (${a.quelle})`);
  }
  for (const l of LAUFZEIT) console.log(`  - ${l.bedingung}`);
  for (const n of NUR_ATTESTIERBAR) console.log(`  - ${n.bedingung}  — nicht maschinell feststellbar`);
  console.log('');
  console.log('Der technische Riegel der Software hängt an keiner dieser Dateien, sondern');
  console.log('am Gate-Marker in IHRER Datenbank. Dieses Skript ersetzt ihn nicht.');
  process.exit(0);
}

const offen = pruefungen.filter((p) => !p.erfuellt);
// Nur §7.1-Bedingungen entscheiden ueber das Gate. Die uebrigen werden
// berichtet, blockieren aber nicht -- s. Kommentar an AKTENSTUECKE.
const offeneGateBedingungen = offen.filter((p) => p.gate);

if (process.argv.includes('--fingerabdruck')) {
  // Der Fingerabdruck bindet die Freigabe an einen konkreten Aktenstand.
  // Aendert sich spaeter eines der Artefakte, passt er nicht mehr — die
  // Freigabe gilt dann nicht stillschweigend weiter.
  const hash = createHash('sha256');
  for (const a of AKTENSTUECKE) {
    hash.update(a.datei);
    hash.update(readFileSync(path.join(WURZEL, a.datei)));
  }
  console.log(hash.digest('hex'));
  process.exit(0);
}

console.log('Ingest-Gate — Bedingungen für den Betrieb mit echten Personendaten');
console.log('(ADR-0004 §7.1, ADR-0008 §22)');
console.log('');

console.log('GEPRÜFT — gegen die Compliance-Akte und den Code:');
for (const p of pruefungen) {
  console.log(`  [${p.erfuellt ? 'x' : ' '}] ${p.bedingung}${p.gate ? '' : '   (nachrichtlich)'}`);
  console.log(`        ${p.quelle}`);
  console.log(`        ${p.detail}`);
}

console.log('');
console.log('ZUR LAUFZEIT — die laufende Instanz entscheidet:');
for (const l of LAUFZEIT) {
  console.log(`  [?] ${l.bedingung}`);
  console.log(`        ${l.hinweis}`);
}

console.log('');
console.log('NUR ATTESTIERBAR — keine Software kann das feststellen:');
for (const n of NUR_ATTESTIERBAR) {
  console.log(`  [!] ${n.bedingung}`);
  console.log(`        ${n.warum}`);
}

console.log('');
if (offeneGateBedingungen.length === 0) {
  console.log('Alle prüfbaren Bedingungen sind erfüllt.');
  console.log('Das öffnet das Gate NICHT: Die Laufzeit- und die attestierbaren Bedingungen');
  console.log('bleiben, und die Attestierung gehört in den Datenbank-Marker samt Audit-Ereignis.');
} else {
  console.log(`${offeneGateBedingungen.length} prüfbare GATE-Bedingung(en) offen:`);
  for (const p of offeneGateBedingungen) {
    console.log(`  - ${p.bedingung} (${p.quelle})`);
  }
  const weitere = offen.filter((p) => !p.gate);
  if (weitere.length > 0) {
    console.log('');
    console.log('Nachrichtlich, blockiert das Gate nicht:');
    for (const p of weitere) {
      console.log(`  - ${p.bedingung} (${p.quelle})`);
    }
  }
}

if (process.argv.includes('--verlangen') && offeneGateBedingungen.length > 0) {
  console.error('');
  console.error('ABBRUCH (--verlangen): Real-Daten-Betrieb ist nicht freigebbar, solange eine');
  console.error('prüfbare Bedingung offen ist.');
  process.exit(1);
}

process.exit(0);
