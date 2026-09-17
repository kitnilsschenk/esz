import { leseZipEintraege, ZipLeseFehler } from '../../common/zip/zip-eintrag.util';
import { attribut, scanneXml, XmlLeseFehler } from './xml-scanner';

export class XlsxLeseFehler extends Error {}

/** Eine gelesene Zelle. Leere Zellen kommen als `undefined` in der Zeile vor, nicht als Wert. */
export type XlsxZelle =
  | { readonly art: 'text'; readonly text: string }
  | { readonly art: 'zahl'; readonly zahl: number }
  /** `iso` ist `YYYY-MM-DD` bei einem reinen Tag, sonst `YYYY-MM-DDTHH:MM:SS`. OHNE Zeitzone — die Mappe kennt keine. */
  | { readonly art: 'datum'; readonly iso: string }
  | { readonly art: 'bool'; readonly wert: boolean };

/** Eine Zeile, indexiert nach Spalte (0 = A). Lücken sind `undefined`. */
export type XlsxZeile = readonly (XlsxZelle | undefined)[];

/**
 * Liest eine XLSX-Arbeitsmappe (ECMA-376 / OPC) aus dem Dateiinhalt.
 *
 * **Was gelesen wird und was nicht.** Blattnamen, Zellwerte und die
 * Unterscheidung Zahl/Text/Datum/Wahrheitswert — mehr braucht ein Import
 * nicht. Nicht gelesen werden Formeln (nur ihr zwischengespeichertes
 * Ergebnis), Formatierung, Diagramme, Kommentare, Makros. Eine Formel ohne
 * gespeichertes Ergebnis liefert eine leere Zelle: Ein Import darf nicht
 * anfangen, Tabellenkalkulation nachzuspielen.
 *
 * **Fehlerzellen sind leer, nicht null.** `#REF!`, `#DIV/0!` und Verwandte
 * kommen als `undefined` zurück. Sie als 0 zu lesen wäre die schlimmste
 * Variante — eine Null im Verbrauch ist eine Aussage, ein Fehler ist keine.
 *
 * Die Datumserkennung folgt dem Zahlenformat der Zelle, wie es die
 * Tabellenkalkulation selbst tut: `styles.xml` sagt, ob eine Zahl ein Datum
 * meint. Ohne diesen Umweg käme ein Datum als fünfstellige Zahl an.
 */
export class XlsxArbeitsmappe {
  private constructor(
    private readonly blaetter: ReadonlyMap<string, readonly XlsxZeile[]>,
    /** In Dateireihenfolge — die Reihenfolge der Reiter in der Mappe. */
    readonly blattNamen: readonly string[],
  ) {}

  static lese(inhalt: Buffer): XlsxArbeitsmappe {
    try {
      return XlsxArbeitsmappe.leseIntern(inhalt);
    } catch (fehler) {
      if (fehler instanceof ZipLeseFehler || fehler instanceof XmlLeseFehler) {
        // Die Ursache bleibt in der Meldung stehen, aber der Aufrufer soll
        // EINEN Fehlertyp behandeln muessen: Fuer ihn ist beides dasselbe —
        // die Datei ist keine lesbare Arbeitsmappe.
        throw new XlsxLeseFehler(`Datei ist keine lesbare XLSX-Arbeitsmappe: ${fehler.message}`);
      }
      throw fehler;
    }
  }

  /** Die Zeilen eines Blattes. @throws XlsxLeseFehler wenn es das Blatt nicht gibt. */
  blatt(name: string): readonly XlsxZeile[] {
    const zeilen = this.blaetter.get(name);
    if (zeilen === undefined) {
      throw new XlsxLeseFehler(
        `Blatt '${name}' fehlt in der Arbeitsmappe (vorhanden: ${this.blattNamen.join(', ')}).`,
      );
    }
    return zeilen;
  }

  hatBlatt(name: string): boolean {
    return this.blaetter.has(name);
  }

  private static leseIntern(inhalt: Buffer): XlsxArbeitsmappe {
    const teile = new Map(
      leseZipEintraege(inhalt, (name) => name.startsWith('xl/') || name === '[Content_Types].xml').map((e) => [
        e.name,
        e.inhalt,
      ]),
    );

    const workbook = teile.get('xl/workbook.xml');
    if (workbook === undefined) {
      throw new XlsxLeseFehler('xl/workbook.xml fehlt — das ist keine XLSX-Arbeitsmappe.');
    }

    const zeichenketten = leseSharedStrings(teile.get('xl/sharedStrings.xml'));
    const istDatumsFormat = leseStyles(teile.get('xl/styles.xml'));
    const ziele = leseBeziehungen(teile.get('xl/_rels/workbook.xml.rels'));

    const blaetter = new Map<string, readonly XlsxZeile[]>();
    const namen: string[] = [];

    for (const { name, rId } of leseBlattVerweise(workbook)) {
      const ziel = ziele.get(rId);
      if (ziel === undefined) {
        throw new XlsxLeseFehler(`Blatt '${name}' verweist auf die unbekannte Beziehung '${rId}'.`);
      }
      const teil = teile.get(`xl/${ziel}`) ?? teile.get(ziel);
      if (teil === undefined) {
        throw new XlsxLeseFehler(`Blatt '${name}': Teil 'xl/${ziel}' fehlt im Archiv.`);
      }
      namen.push(name);
      blaetter.set(name, leseBlatt(teil, zeichenketten, istDatumsFormat));
    }

    if (namen.length === 0) {
      throw new XlsxLeseFehler('Die Arbeitsmappe enthaelt kein einziges Blatt.');
    }

    return new XlsxArbeitsmappe(blaetter, namen);
  }
}

/* --- Die einzelnen XML-Teile --------------------------------------- */

function leseBlattVerweise(workbook: Buffer): readonly { name: string; rId: string }[] {
  const verweise: { name: string; rId: string }[] = [];
  let inSheets = false;

  for (const e of scanneXml(workbook)) {
    if (e.art === 'start' && e.name === 'sheets') {
      inSheets = true;
    } else if (e.art === 'ende' && e.name === 'sheets') {
      inSheets = false;
    } else if (inSheets && e.art === 'start' && e.name === 'sheet') {
      const name = attribut(e.attribute, 'name');
      const rId = attribut(e.attribute, 'r:id') ?? attribut(e.attribute, 'id');
      if (name === undefined || rId === undefined) {
        throw new XlsxLeseFehler('Ein <sheet>-Eintrag hat keinen Namen oder keine Beziehungs-Kennung.');
      }
      verweise.push({ name, rId });
    }
  }
  return verweise;
}

function leseBeziehungen(rels: Buffer | undefined): ReadonlyMap<string, string> {
  const ziele = new Map<string, string>();
  if (rels === undefined) {
    return ziele;
  }
  for (const e of scanneXml(rels)) {
    if (e.art === 'start' && e.name === 'Relationship') {
      const id = attribut(e.attribute, 'Id');
      const ziel = attribut(e.attribute, 'Target');
      if (id !== undefined && ziel !== undefined) {
        // Ziele stehen relativ zu `xl/`; ein fuehrendes `/` meint die
        // Paketwurzel. Beide Schreibweisen kommen in freier Wildbahn vor.
        ziele.set(id, ziel.replace(/^\.?\//, ''));
      }
    }
  }
  return ziele;
}

/**
 * `xl/sharedStrings.xml` — die Zeichenketten-Tabelle.
 *
 * Ein Eintrag (`<si>`) kann aus mehreren Läufen (`<r>`) mit je eigenem `<t>`
 * bestehen, wenn Teile des Textes anders formatiert sind. Sie gehören zu EINER
 * Zelle und werden aneinandergehängt — sonst verlöre „Wärme (kWh)" seine
 * Klammer, nur weil jemand sie kursiv gesetzt hat.
 *
 * `<rPh>` (phonetische Hilfstexte, japanisch) wird übersprungen: Es steht
 * innerhalb des `<si>`, gehört aber nicht zum Wert.
 */
function leseSharedStrings(teil: Buffer | undefined): readonly string[] {
  if (teil === undefined) {
    return [];
  }

  const eintraege: string[] = [];
  let aktuell: string[] | undefined;
  let inT = false;
  let inPhonetisch = false;

  for (const e of scanneXml(teil)) {
    if (e.art === 'start') {
      if (e.name === 'si') {
        aktuell = [];
      } else if (e.name === 'rPh') {
        inPhonetisch = true;
      } else if (e.name === 't' && !e.leer && !inPhonetisch) {
        inT = true;
      }
    } else if (e.art === 'ende') {
      if (e.name === 'si' && aktuell !== undefined) {
        eintraege.push(aktuell.join(''));
        aktuell = undefined;
      } else if (e.name === 'rPh') {
        inPhonetisch = false;
      } else if (e.name === 't') {
        inT = false;
      }
    } else if (inT && aktuell !== undefined) {
      aktuell.push(e.inhalt);
    }
  }

  return eintraege;
}

/** Eingebaute Zahlenformate, die ein Datum oder eine Uhrzeit meinen (ECMA-376 §18.8.30). */
const EINGEBAUTE_DATUMS_FORMATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * `xl/styles.xml` — beantwortet für einen Stil-Index: meint diese Zahl ein Datum?
 *
 * Ohne diese Auskunft käme der 12.10.2018 als `43385` an. Die
 * Tabellenkalkulation selbst entscheidet es genauso: Eine Datumszelle ist eine
 * Zahl mit einem Datums-Zahlenformat, mehr nicht.
 */
function leseStyles(teil: Buffer | undefined): (stilIndex: number | undefined) => boolean {
  if (teil === undefined) {
    return () => false;
  }

  const eigeneDatumsFormate = new Set<number>();
  const formatJeStil: number[] = [];
  let inCellXfs = false;

  for (const e of scanneXml(teil)) {
    if (e.art === 'start' && e.name === 'numFmt') {
      const id = Number.parseInt(attribut(e.attribute, 'numFmtId') ?? '', 10);
      const code = attribut(e.attribute, 'formatCode') ?? '';
      if (Number.isFinite(id) && istDatumsCode(code)) {
        eigeneDatumsFormate.add(id);
      }
    } else if (e.art === 'start' && e.name === 'cellXfs') {
      inCellXfs = true;
    } else if (e.art === 'ende' && e.name === 'cellXfs') {
      inCellXfs = false;
    } else if (inCellXfs && e.art === 'start' && e.name === 'xf') {
      const id = Number.parseInt(attribut(e.attribute, 'numFmtId') ?? '0', 10);
      formatJeStil.push(Number.isFinite(id) ? id : 0);
    }
  }

  return (stilIndex) => {
    if (stilIndex === undefined) {
      return false;
    }
    const formatId = formatJeStil[stilIndex];
    if (formatId === undefined) {
      return false;
    }
    return EINGEBAUTE_DATUMS_FORMATE.has(formatId) || eigeneDatumsFormate.has(formatId);
  };
}

/**
 * Erkennt an einem Formatcode, ob er ein Datum meint.
 *
 * Literale in Anführungszeichen und escapte Zeichen werden vorher entfernt —
 * sonst machte ein Format wie `0" Tage"` aus einer Stückzahl ein Datum, nur
 * weil im Text ein `d` vorkommt.
 */
function istDatumsCode(code: string): boolean {
  const ohneLiterale = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(ohneLiterale);
}

/* --- Das Blatt selbst ---------------------------------------------- */

function leseBlatt(
  teil: Buffer,
  zeichenketten: readonly string[],
  istDatum: (stilIndex: number | undefined) => boolean,
): readonly XlsxZeile[] {
  const zeilen: (XlsxZelle | undefined)[][] = [];

  let zeile: (XlsxZelle | undefined)[] | undefined;
  let zeilenNummer = 0;
  let spalte = 0;
  let typ = '';
  let stil: number | undefined;
  let inWert = false;
  let inInlineText = false;
  let stuecke: string[] = [];

  for (const e of scanneXml(teil)) {
    if (e.art === 'start') {
      switch (e.name) {
        case 'row': {
          const r = Number.parseInt(attribut(e.attribute, 'r') ?? '', 10);
          zeilenNummer = Number.isFinite(r) && r >= 1 ? r : zeilenNummer + 1;
          zeile = [];
          break;
        }
        case 'c': {
          const bezug = attribut(e.attribute, 'r');
          spalte = bezug === undefined ? spalte + 1 : spalteAusBezug(bezug);
          typ = attribut(e.attribute, 't') ?? 'n';
          const s = attribut(e.attribute, 's');
          stil = s === undefined ? undefined : Number.parseInt(s, 10);
          stuecke = [];
          break;
        }
        case 'v':
          inWert = !e.leer;
          break;
        case 't':
          // Nur innerhalb von `<is>` (inline string) relevant; im Blatt gibt
          // es kein anderes `<t>`.
          inInlineText = !e.leer;
          break;
        default:
          break;
      }
    } else if (e.art === 'ende') {
      switch (e.name) {
        case 'row':
          if (zeile !== undefined) {
            // `r` ist 1-basiert; Luecken zwischen Zeilen bleiben Luecken.
            zeilen[zeilenNummer - 1] = zeile;
            zeile = undefined;
          }
          break;
        case 'c':
          if (zeile !== undefined) {
            zeile[spalte] = baueZelle(stuecke.join(''), typ, stil, zeichenketten, istDatum);
          }
          break;
        case 'v':
          inWert = false;
          break;
        case 't':
          inInlineText = false;
          break;
        default:
          break;
      }
    } else if (inWert || inInlineText) {
      stuecke.push(e.inhalt);
    }
  }

  // Luecken auffuellen, damit der Aufrufer nicht auf `undefined`-Zeilen stoesst.
  for (let i = 0; i < zeilen.length; i += 1) {
    zeilen[i] ??= [];
  }
  return zeilen;
}

function baueZelle(
  roh: string,
  typ: string,
  stil: number | undefined,
  zeichenketten: readonly string[],
  istDatum: (stilIndex: number | undefined) => boolean,
): XlsxZelle | undefined {
  if (roh.length === 0) {
    return undefined;
  }

  switch (typ) {
    case 's': {
      const index = Number.parseInt(roh, 10);
      const text = zeichenketten[index];
      if (text === undefined) {
        throw new XlsxLeseFehler(`Zelle verweist auf die Zeichenkette ${roh}, die es nicht gibt.`);
      }
      return text.length === 0 ? undefined : { art: 'text', text };
    }
    case 'str':
    case 'inlineStr':
      return { art: 'text', text: roh };
    case 'b':
      return { art: 'bool', wert: roh === '1' };
    case 'e':
      // Fehlerzellen (#REF!, #DIV/0!) sind KEIN Wert. Als 0 gelesen waeren sie
      // eine Aussage ueber den Verbrauch, die niemand getroffen hat.
      return undefined;
    case 'd':
      // ECMA-376 2nd edition: ISO-Datum direkt in der Zelle.
      return { art: 'datum', iso: roh };
    default: {
      const zahl = Number(roh);
      if (!Number.isFinite(zahl)) {
        throw new XlsxLeseFehler(`Zellwert '${roh}' ist keine Zahl (Typ '${typ}').`);
      }
      return istDatum(stil) ? { art: 'datum', iso: seriellZuIso(zahl) } : { art: 'zahl', zahl };
    }
  }
}

/** `A` -> 0, `Z` -> 25, `AA` -> 26. Der Zeilenteil des Bezugs wird ignoriert. */
function spalteAusBezug(bezug: string): number {
  let spalte = 0;
  for (const zeichen of bezug) {
    const code = zeichen.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      spalte = spalte * 26 + (code - 64);
    } else if (code >= 97 && code <= 122) {
      spalte = spalte * 26 + (code - 96);
    } else {
      break;
    }
  }
  if (spalte === 0) {
    throw new XlsxLeseFehler(`Zellbezug '${bezug}' hat keinen Spaltenteil.`);
  }
  return spalte - 1;
}

/**
 * Serielle Tabellenkalkulations-Zahl -> ISO-Datum.
 *
 * Bezugspunkt ist der 30.12.1899, nicht der 31.12.: Die Zählung enthält den
 * 29.02.1900, den es nie gab (Lotus-1-2-3-Erbe, ECMA-376 §18.17.4.1). Für
 * alles ab dem 01.03.1900 hebt der um einen Tag zurückgesetzte Bezugspunkt den
 * Fehler exakt auf. Davor tut er es NICHT — deshalb wird dieser Bereich
 * abgewiesen statt um einen Tag daneben gelesen.
 */
function seriellZuIso(seriell: number): string {
  if (seriell < 61) {
    throw new XlsxLeseFehler(
      `Datumszahl ${seriell} liegt vor dem 01.03.1900 — in diesem Bereich ist die Zaehlung der ` +
        'Tabellenkalkulation um einen Tag verschoben (Schaltjahrfehler 1900) und damit nicht eindeutig.',
    );
  }

  const tage = Math.floor(seriell);
  const restSekunden = Math.round((seriell - tage) * 86400);
  const zeitpunkt = new Date(Date.UTC(1899, 11, 30) + tage * 86_400_000 + restSekunden * 1000);
  const iso = zeitpunkt.toISOString();

  return restSekunden === 0 ? iso.slice(0, 10) : iso.slice(0, 19);
}
