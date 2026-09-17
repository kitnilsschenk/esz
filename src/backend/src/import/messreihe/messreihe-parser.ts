import { XlsxArbeitsmappe, type XlsxZeile } from '../xlsx/xlsx-arbeitsmappe';
import type { FoerderjahrBlatt, ImportMessgroesse, Messmappe, Messreihe, Tageswert } from './messreihe.types';

export class MessreiheParseFehler extends Error {}

/** Blattname eines Förderjahres, z. B. `FJ3 2020-2021`. */
const FJ_BLATT = /^FJ\s*(\d+)\b/;

/** Spaltenüberschrift -> Messgröße. Alles andere ist entweder Beiwerk oder ein Fehler (s. `ordneSpaltenZu`). */
const MESSGROESSE_JE_UEBERSCHRIFT: Readonly<Record<string, ImportMessgroesse>> = {
  'strom (kwh)': 'wirkarbeit',
  'waerme (kwh)': 'thermische_energie',
  'wärme (kwh)': 'thermische_energie',
};

/** Überschriften, die bewusst KEINE Messreihe sind. */
const BEIWERK = new Set(['datum', 'wochentag', 'tagestyp', 'gesamt (kwh)']);

/**
 * Wie genau die selbst mitgelieferte Summe stimmen muss.
 *
 * Die Blattsummen sind Fließkomma-Summen über 365 Werte
 * (`1212028.5000000002`), die Einzelwerte haben eine Nachkommastelle. Ein
 * Zehntel Toleranz je 1000 Werte fängt die Rundung ab und würde einen
 * vergessenen oder doppelten Tag trotzdem bemerken — der wäre um
 * Größenordnungen daneben.
 */
const SUMMEN_TOLERANZ_KWH = 0.5;

/**
 * Liest eine Messreihen-Mappe im Aufbau des Pilotbestands A ein.
 *
 * **Der Aufbau, auf den sich das stützt.** Je Förderjahr ein Blatt
 * (`FJ1 2018-2019`), darin eine Kopfzeile mit dem Zeitraum, eine
 * Spaltenüberschriften-Zeile mit `Datum` und je Messgröße eine Spalte, dann
 * die Tageszeilen und zuletzt eine Summenzeile.
 *
 * **Spalten werden über ihre Überschrift zugeordnet, nie über ihre Position.**
 * Dieselbe Linie wie beim DWD-Parser: Zwei der fünf Mappen führen `Waerme`,
 * drei nicht — wer hier nach Spaltennummer läse, importierte bei der nächsten
 * Mappe Strom als Wärme. Eine Überschrift, die weder bekannte Messgröße noch
 * bekanntes Beiwerk ist, bricht den Import ab: Eine stillschweigend
 * übergangene Spalte in einer Verbrauchstabelle ist ein Datenverlust, den
 * niemand bemerkt.
 *
 * **Die Summenzeile wird nicht importiert, sondern geprüft.** Sie ist die
 * Prüfsumme, die die Mappe selbst mitliefert — und der einzige Weg, einen
 * verlorenen oder doppelt gelesenen Tag zu bemerken, ohne die Quelle zu
 * kennen. Weicht sie ab, bricht der Import ab.
 */
export function leseMessmappe(dateiname: string, inhalt: Buffer): Messmappe {
  const mappe = XlsxArbeitsmappe.lese(inhalt);
  const blattNamen = mappe.blattNamen.filter((n) => FJ_BLATT.test(n));

  if (blattNamen.length === 0) {
    throw new MessreiheParseFehler(
      `${dateiname}: kein Foerderjahr-Blatt gefunden (erwartet 'FJ<n> …', vorhanden: ${mappe.blattNamen.join(', ')}).`,
    );
  }

  let anlage: string | undefined;
  const blaetter = blattNamen.map((name) => {
    const blatt = leseBlatt(dateiname, name, mappe.blatt(name));
    anlage ??= blatt.anlage;
    return blatt.daten;
  });

  return { dateiname, anlage, blaetter };
}

function leseBlatt(
  dateiname: string,
  blattName: string,
  zeilen: readonly XlsxZeile[],
): { daten: FoerderjahrBlatt; anlage: string | undefined } {
  const wo = `${dateiname} [${blattName}]`;
  const foerderjahr = Number.parseInt(FJ_BLATT.exec(blattName)?.[1] ?? '', 10);
  if (!Number.isFinite(foerderjahr) || foerderjahr < 1) {
    throw new MessreiheParseFehler(`${wo}: aus dem Blattnamen laesst sich kein Foerderjahr lesen.`);
  }

  const kopfIndex = zeilen.findIndex((z) => text(z[0])?.toLowerCase() === 'datum');
  if (kopfIndex === -1) {
    throw new MessreiheParseFehler(`${wo}: keine Spaltenueberschrift gefunden (erwartet 'Datum' in Spalte A).`);
  }

  const anlage = leseAnlage(zeilen[0]);
  const spalten = ordneSpaltenZu(wo, zeilen[kopfIndex] ?? []);

  const werteJeSpalte = new Map<number, Tageswert[]>(spalten.map((s) => [s.spalte, []]));
  const summeJeSpalte = new Map<number, number>();
  let vorherigerTag: string | undefined;

  for (let i = kopfIndex + 1; i < zeilen.length; i += 1) {
    const zeile = zeilen[i] ?? [];
    const erste = zeile[0];

    if (erste === undefined) {
      continue;
    }

    // Die Summenzeile schliesst das Blatt ab. Sie traegt in Spalte A Text
    // statt eines Datums — daran, und nur daran, wird sie erkannt.
    if (erste.art !== 'datum') {
      const beschriftung = text(erste)?.toLowerCase() ?? '';
      if (beschriftung.startsWith('summe')) {
        for (const s of spalten) {
          const wert = zahl(zeile[s.spalte]);
          if (wert !== undefined) {
            summeJeSpalte.set(s.spalte, wert);
          }
        }
        break;
      }
      throw new MessreiheParseFehler(
        `${wo} Zeile ${String(i + 1)}: Spalte A enthaelt weder ein Datum noch eine Summenzeile, sondern '${beschriftung}'.`,
      );
    }

    const tag = erste.iso.slice(0, 10);
    if (vorherigerTag !== undefined && tag <= vorherigerTag) {
      // Ein Rueckwaertssprung oder ein doppelter Tag hiesse, dass die Zeilen
      // nicht das sind, wofuer der Import sie haelt.
      throw new MessreiheParseFehler(
        `${wo} Zeile ${String(i + 1)}: Datum ${tag} folgt nicht auf ${vorherigerTag} — die Reihe ist nicht aufsteigend.`,
      );
    }
    vorherigerTag = tag;

    for (const s of spalten) {
      const wert = zahl(zeile[s.spalte]);
      if (wert === undefined) {
        // Eine Luecke bleibt eine Luecke. Sie als 0 zu schreiben waere die
        // Behauptung, an diesem Tag sei nichts verbraucht worden.
        continue;
      }
      if (wert < 0) {
        throw new MessreiheParseFehler(`${wo} Zeile ${String(i + 1)}: negativer Verbrauch ${String(wert)} kWh.`);
      }
      werteJeSpalte.get(s.spalte)?.push({ tag, kwh: wert });
    }
  }

  const reihen: Messreihe[] = spalten.map((s) => {
    const werte = werteJeSpalte.get(s.spalte) ?? [];
    const summeLautBlatt = summeJeSpalte.get(s.spalte);
    pruefeSumme(`${wo} Spalte '${s.ueberschrift}'`, werte, summeLautBlatt);
    return { messgroesse: s.messgroesse, werte, summeLautBlatt };
  });

  const vonTag = reihen[0]?.werte[0]?.tag;
  const letzte = reihen[0]?.werte.at(-1)?.tag;
  if (vonTag === undefined || letzte === undefined) {
    throw new MessreiheParseFehler(`${wo}: keine einzige Tageszeile gelesen.`);
  }

  return { daten: { blattName, foerderjahr, vonTag, bisTag: letzte, reihen }, anlage };
}

/**
 * Die Anlage aus der Titelzeile: `Foerderjahr 1: … | BHKW` → `BHKW`.
 *
 * Der Dateiname wäre die naheliegende Quelle, ist aber die schlechtere: Er
 * lässt sich beim Ablegen umbenennen, die Titelzeile steht in der Mappe. Wo
 * keine Anlage genannt ist, misst die Mappe den Hauptzähler.
 */
function leseAnlage(kopfzeile: XlsxZeile | undefined): string | undefined {
  const titel = text(kopfzeile?.[0]);
  if (titel === undefined || !titel.includes('|')) {
    return undefined;
  }
  const hinten = titel.slice(titel.lastIndexOf('|') + 1).trim();
  return hinten.length === 0 ? undefined : hinten;
}

function ordneSpaltenZu(
  wo: string,
  kopf: XlsxZeile,
): readonly { spalte: number; ueberschrift: string; messgroesse: ImportMessgroesse }[] {
  const spalten: { spalte: number; ueberschrift: string; messgroesse: ImportMessgroesse }[] = [];

  for (let i = 0; i < kopf.length; i += 1) {
    const ueberschrift = text(kopf[i]);
    if (ueberschrift === undefined) {
      continue;
    }
    const schluessel = ueberschrift.trim().toLowerCase();
    if (BEIWERK.has(schluessel)) {
      continue;
    }
    const messgroesse = MESSGROESSE_JE_UEBERSCHRIFT[schluessel];
    if (messgroesse === undefined) {
      throw new MessreiheParseFehler(
        `${wo}: unbekannte Spalte '${ueberschrift}'. Bekannt sind ${Object.keys(MESSGROESSE_JE_UEBERSCHRIFT).join(', ')} ` +
          `sowie das Beiwerk ${[...BEIWERK].join(', ')}. Eine uebergangene Spalte waere ein unbemerkter Datenverlust.`,
      );
    }
    spalten.push({ spalte: i, ueberschrift: ueberschrift.trim(), messgroesse });
  }

  if (spalten.length === 0) {
    throw new MessreiheParseFehler(`${wo}: keine einzige Messgroessen-Spalte in der Ueberschrift.`);
  }
  return spalten;
}

function pruefeSumme(wo: string, werte: readonly Tageswert[], summeLautBlatt: number | undefined): void {
  if (summeLautBlatt === undefined) {
    return;
  }
  const eigene = werte.reduce((s, w) => s + w.kwh, 0);
  const abweichung = Math.abs(eigene - summeLautBlatt);
  if (abweichung > SUMMEN_TOLERANZ_KWH) {
    throw new MessreiheParseFehler(
      `${wo}: Summe der gelesenen Tage (${eigene.toFixed(1)} kWh) weicht von der Summenzeile ` +
        `(${summeLautBlatt.toFixed(1)} kWh) um ${abweichung.toFixed(1)} kWh ab — es fehlt oder doppelt ein Tag.`,
    );
  }
}

function text(zelle: XlsxZeile[number]): string | undefined {
  return zelle?.art === 'text' ? zelle.text : undefined;
}

function zahl(zelle: XlsxZeile[number]): number | undefined {
  return zelle?.art === 'zahl' ? zelle.zahl : undefined;
}
