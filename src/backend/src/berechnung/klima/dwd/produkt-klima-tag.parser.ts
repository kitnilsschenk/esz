import type { KlimaTagRohwert } from '../klima-quelle.port';

/**
 * Parser für `produkt_klima_tag_<von>_<bis>_<station>.txt` aus den
 * CDC-Tageswert-Archiven (`observations_germany/climate/daily/kl`).
 *
 * Aufbau der Datei (Stand 2026-09, Kopfzeile aus einem echten Archiv):
 *
 * ```
 * STATIONS_ID;MESS_DATUM;QN_3;  FX;  FM;QN_4; RSK;RSKF; SDK;SHK_TAG;  NM; VPM;  PM; TMK; UPM; TXK; TNK; TGK;eor
 *         433;20250307;   10;   5.5;   1.6;    9;   0.0;   0;-999;   0;   2.2;   6.0; 1013.80;    9.8;   54.00;   19.1;    0.1;   -4.0;eor
 * ```
 *
 * Gelesen werden GENAU drei Spalten: `MESS_DATUM` (Kalendertag), `TMK`
 * (Tagesmittel der Lufttemperatur in °C) und `QN_4` (Qualitätsniveau der
 * Temperaturwerte). Alles andere wird ignoriert — nicht aus Bequemlichkeit,
 * sondern weil jede zusätzlich gelesene Spalte eine zusätzliche Stelle wäre,
 * an der ein Formatwechsel beim DWD die Rechnung still verfälschen könnte.
 *
 * **Adressierung über Spaltennamen, nicht über Positionen.** Die Kopfzeile
 * wird ausgewertet; eine eingeschobene Spalte verschiebt damit nichts. Fehlt
 * eine benötigte Spalte, bricht der Parser ab, statt eine falsche zu lesen.
 *
 * **Fehlwerte.** `-999` ist die dokumentierte DWD-Fehlwertkennung und führt
 * zum Auslassen des Tages (nicht zu einer 0 °C — die wäre im Winter kaum von
 * einem echten Messwert zu unterscheiden und ginge direkt in die
 * Gradtagzahl ein). Ein Wert außerhalb von ±70 °C ist dagegen KEIN
 * bekannter Fehlwert, sondern ein Hinweis auf ein verschobenes Feld: dort
 * bricht der Parser ab.
 */

const FEHLWERT = -999;
const PLAUSIBLE_TEMPERATUR_C = 70;

const SPALTE_DATUM = 'MESS_DATUM';
const SPALTE_TEMPERATUR = 'TMK';
const SPALTE_QUALITAET = 'QN_4';

export class ProduktKlimaTagFormatFehler extends Error {}

export function parseProduktKlimaTag(inhalt: string): KlimaTagRohwert[] {
  const zeilen = inhalt.split(/\r?\n/).filter((zeile) => zeile.trim().length > 0);
  const [kopfzeile, ...datenzeilen] = zeilen;

  if (kopfzeile === undefined) {
    throw new ProduktKlimaTagFormatFehler('Produktdatei ist leer.');
  }

  const spalten = kopfzeile.split(';').map((feld) => feld.trim().toUpperCase());
  const datumIndex = spaltenIndex(spalten, SPALTE_DATUM);
  const temperaturIndex = spaltenIndex(spalten, SPALTE_TEMPERATUR);
  const qualitaetIndex = spalten.indexOf(SPALTE_QUALITAET);

  const werte: KlimaTagRohwert[] = [];

  for (const zeile of datenzeilen) {
    const felder = zeile.split(';').map((feld) => feld.trim());
    const rohDatum = felder[datumIndex];
    const rohTemperatur = felder[temperaturIndex];

    if (rohDatum === undefined || rohTemperatur === undefined) {
      throw new ProduktKlimaTagFormatFehler(
        `Datenzeile hat nur ${felder.length} Felder, erwartet werden mindestens ${Math.max(datumIndex, temperaturIndex) + 1}.`,
      );
    }

    const tMittelC = Number.parseFloat(rohTemperatur);
    if (!Number.isFinite(tMittelC)) {
      throw new ProduktKlimaTagFormatFehler(`Temperaturfeld '${rohTemperatur}' ist keine Zahl (Tag ${rohDatum}).`);
    }
    if (tMittelC <= FEHLWERT) {
      continue;
    }
    if (Math.abs(tMittelC) > PLAUSIBLE_TEMPERATUR_C) {
      throw new ProduktKlimaTagFormatFehler(
        `Tagesmittel ${tMittelC} °C am ${rohDatum} liegt außerhalb ±${PLAUSIBLE_TEMPERATUR_C} °C — vermutlich verschobene Spalten, Abbruch statt Falschrechnung.`,
      );
    }

    werte.push({
      tag: toIsoTag(rohDatum),
      tMittelC,
      qualitaetsNiveau: leseQualitaet(felder, qualitaetIndex),
    });
  }

  return werte;
}

function spaltenIndex(spalten: readonly string[], name: string): number {
  const index = spalten.indexOf(name);
  if (index < 0) {
    throw new ProduktKlimaTagFormatFehler(
      `Spalte '${name}' fehlt in der Kopfzeile (gefunden: ${spalten.join(', ')}) — Dateiformat hat sich geändert.`,
    );
  }
  return index;
}

function leseQualitaet(felder: readonly string[], index: number): number | null {
  if (index < 0) {
    return null;
  }
  const roh = felder[index];
  if (roh === undefined) {
    return null;
  }
  const niveau = Number.parseInt(roh, 10);
  // QN ist 1..10; `-999` kommt auch hier vor. Ein unbrauchbares Niveau macht
  // den Messwert nicht unbrauchbar — nur seine Einordnung bleibt offen.
  return Number.isFinite(niveau) && niveau >= 0 && niveau <= 10 ? niveau : null;
}

function toIsoTag(rohDatum: string): string {
  if (!/^\d{8}$/.test(rohDatum)) {
    throw new ProduktKlimaTagFormatFehler(`Datumsfeld '${rohDatum}' ist kein YYYYMMDD.`);
  }
  return `${rohDatum.slice(0, 4)}-${rohDatum.slice(4, 6)}-${rohDatum.slice(6, 8)}`;
}
