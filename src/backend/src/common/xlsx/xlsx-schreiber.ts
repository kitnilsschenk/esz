import { baueZip } from '../zip/zip-schreiber.util';

/**
 * XLSX-Schreiber (ECMA-376, SpreadsheetML) — so viel davon, wie der
 * Einsparungsnachweis braucht, und keine Zeile mehr.
 *
 * **Warum selbst gebaut.** Dieselbe Begründung wie beim XLSX-LESER
 * (`import/xlsx/xlsx-arbeitsmappe.ts`): Publikationspflicht, geprüfte
 * Lizenzkette, und der gebrauchte Ausschnitt ist überschaubar. `exceljs`
 * (MIT) wäre zulässig; der Gegenwert wäre ein Abhängigkeitsbaum für
 * Zellwerte, Formeln und fünf Zahlenformate.
 *
 * **Was dieser Schreiber KANN:** mehrere Blätter, Text/Zahl/Datum/Wahrheits-
 * wert, echte Formeln (`<f>`), fette Kopfzeilen, Spaltenbreiten, ein paar
 * Zahlenformate und eine gelbe Eingabe-Hinterlegung (die Vorlage nutzt sie
 * als Legende: „gelb = von euch auszufüllen").
 *
 * **Was er NICHT kann** und bewusst nicht lernt: Diagramme, bedingte
 * Formatierung, Zellschutz, Pivot, Autofilter, verbundene Zellen.
 * Ein Nachweis-Artefakt ist eine Tabelle, keine Anwendung.
 *
 * **Formeln werden OHNE zwischengespeichertes Ergebnis geschrieben.** Excel
 * und LibreOffice rechnen beim Öffnen. Ein mitgeschriebener Wert müsste zur
 * Formel passen — täte er es nicht, stünde in der Mappe eine Zahl, die
 * niemand nachrechnen kann, und genau das soll ein Nachweis nicht sein.
 * `fullCalcOnLoad` sagt dem Programm ausdrücklich, dass es rechnen soll.
 */

/** Eine Zelle. `null` erzeugt gar kein Zell-Element. */
export type XlsxZelle =
  | null
  | string
  | number
  | boolean
  | { readonly text: string; readonly stil?: XlsxStil }
  | { readonly zahl: number; readonly stil?: XlsxStil }
  | { readonly formel: string; readonly stil?: XlsxStil };

/**
 * Die Stile, die die Nachweis-Vorlage unterscheidet.
 *
 * Bewusst benannte Rollen statt freier Formatierung: Die Vorlage erklärt in
 * ihrer Legende, was die Farben bedeuten („gelb = auszufüllen, grün =
 * Verknüpfung, schwarz = Formelergebnis"). Ein Schreiber, der beliebige
 * Farben zuließe, würde diese Bedeutung verwässern.
 */
export type XlsxStil = 'kopf' | 'eingabe' | 'zahl' | 'kwh' | 'prozent' | 'datum' | 'hinweis';

export interface XlsxSpalte {
  /** Breite in Zeichen (Excel-Einheit). */
  readonly breite: number;
}

export interface XlsxBlatt {
  /** Blattname. Excel begrenzt auf 31 Zeichen und verbietet `[]:*?/\`. */
  readonly name: string;
  readonly spalten?: readonly XlsxSpalte[];
  readonly zeilen: readonly (readonly XlsxZelle[])[];
}

// Reihenfolge = `s`-Index in `cellXfs`. 0 bleibt der Standard.
const STIL_INDEX: Readonly<Record<XlsxStil, number>> = {
  kopf: 1,
  eingabe: 2,
  zahl: 3,
  kwh: 4,
  prozent: 5,
  datum: 6,
  hinweis: 7,
};

const SPALTEN_BUCHSTABEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function baueXlsx(blaetter: readonly XlsxBlatt[]): Buffer {
  if (blaetter.length === 0) {
    throw new Error('Eine XLSX-Arbeitsmappe braucht mindestens ein Blatt.');
  }

  const zeichenketten: string[] = [];
  const indexJeText = new Map<string, number>();
  const sharedIndex = (text: string): number => {
    const vorhanden = indexJeText.get(text);
    if (vorhanden !== undefined) {
      return vorhanden;
    }
    const index = zeichenketten.length;
    zeichenketten.push(text);
    indexJeText.set(text, index);
    return index;
  };

  const blattXml = blaetter.map((blatt) => baueBlattXml(blatt, sharedIndex));

  const teile: { readonly name: string; readonly inhalt: string }[] = [
    { name: '[Content_Types].xml', inhalt: baueContentTypes(blaetter.length) },
    { name: '_rels/.rels', inhalt: WURZEL_RELS },
    { name: 'xl/workbook.xml', inhalt: baueWorkbookXml(blaetter) },
    { name: 'xl/_rels/workbook.xml.rels', inhalt: baueWorkbookRels(blaetter.length) },
    { name: 'xl/styles.xml', inhalt: STYLES_XML },
    { name: 'xl/sharedStrings.xml', inhalt: baueSharedStringsXml(zeichenketten) },
    ...blattXml.map((inhalt, i) => ({ name: `xl/worksheets/sheet${String(i + 1)}.xml`, inhalt })),
  ];

  return baueZip(teile);
}

/** Spaltenbezeichner: 0 → A, 25 → Z, 26 → AA. */
export function spaltenName(index: number): string {
  let rest = index;
  let name = '';
  do {
    name = (SPALTEN_BUCHSTABEN[rest % 26] ?? 'A') + name;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return name;
}

function maskiere(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function baueZelleXml(bezug: string, zelle: XlsxZelle, sharedIndex: (text: string) => number): string {
  if (zelle === null) {
    return '';
  }
  if (typeof zelle === 'string') {
    return `<c r="${bezug}" t="s"><v>${String(sharedIndex(zelle))}</v></c>`;
  }
  if (typeof zelle === 'number') {
    return `<c r="${bezug}"><v>${zahlAlsXml(zelle)}</v></c>`;
  }
  if (typeof zelle === 'boolean') {
    return `<c r="${bezug}" t="b"><v>${zelle ? '1' : '0'}</v></c>`;
  }

  const stil = zelle.stil === undefined ? '' : ` s="${String(STIL_INDEX[zelle.stil])}"`;
  if ('text' in zelle) {
    return `<c r="${bezug}"${stil} t="s"><v>${String(sharedIndex(zelle.text))}</v></c>`;
  }
  if ('zahl' in zelle) {
    return `<c r="${bezug}"${stil}><v>${zahlAlsXml(zelle.zahl)}</v></c>`;
  }
  // Formel OHNE `<v>` — s. Klassen-Kommentar.
  return `<c r="${bezug}"${stil}><f>${maskiere(zelle.formel)}</f></c>`;
}

/**
 * Zahlen ohne Exponentialschreibweise.
 *
 * `String(1e-7)` liefert `1e-7`, und das ist in SpreadsheetML kein gültiger
 * Zellwert — Excel meldet die Datei dann als beschädigt. Bei den hier
 * auftretenden Größenordnungen (kWh, Gradtagzahlen, Prozente) kommt das nur
 * an den Rändern vor, aber ein Nachweis, der an einem Extremwert
 * unlesbar wird, ist an der falschen Stelle sparsam.
 */
function zahlAlsXml(wert: number): string {
  if (!Number.isFinite(wert)) {
    throw new Error(`Nicht darstellbarer Zellwert: ${String(wert)}. XLSX kennt kein NaN/Infinity.`);
  }
  return Number.isInteger(wert) ? String(wert) : wert.toFixed(10).replace(/\.?0+$/, '');
}

function baueBlattXml(blatt: XlsxBlatt, sharedIndex: (text: string) => number): string {
  const spalten =
    blatt.spalten === undefined || blatt.spalten.length === 0
      ? ''
      : `<cols>${blatt.spalten
          .map(
            (spalte, i) =>
              `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(spalte.breite)}" customWidth="1"/>`,
          )
          .join('')}</cols>`;

  const zeilen = blatt.zeilen
    .map((zellen, zi) => {
      const nr = zi + 1;
      const inhalt = zellen
        .map((zelle, si) => baueZelleXml(`${spaltenName(si)}${String(nr)}`, zelle, sharedIndex))
        .filter((x) => x.length > 0)
        .join('');
      return inhalt.length === 0 ? '' : `<row r="${String(nr)}">${inhalt}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    spalten +
    `<sheetData>${zeilen}</sheetData>` +
    `</worksheet>`
  );
}

function baueContentTypes(blattAnzahl: number): string {
  const blaetter = Array.from(
    { length: blattAnzahl },
    (_x, i) =>
      `<Override PartName="/xl/worksheets/sheet${String(i + 1)}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    blaetter +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`
  );
}

const WURZEL_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

function baueWorkbookXml(blaetter: readonly XlsxBlatt[]): string {
  const sheets = blaetter
    .map(
      (blatt, i) =>
        `<sheet name="${maskiere(blattName(blatt.name))}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
    )
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    // `fullCalcOnLoad`: Die Formeln tragen kein zwischengespeichertes
    // Ergebnis, das Programm MUSS beim Oeffnen rechnen.
    `<calcPr calcId="0" fullCalcOnLoad="1"/>` +
    `<sheets>${sheets}</sheets>` +
    `</workbook>`
  );
}

/**
 * Excel-Grenzen für Blattnamen: höchstens 31 Zeichen, und `[]:*?/\` sind
 * verboten. Ein zu langer oder unerlaubter Name lässt Excel die Datei als
 * beschädigt melden — also hier abschneiden statt dort scheitern.
 */
function blattName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, '_').slice(0, 31);
}

function baueWorkbookRels(blattAnzahl: number): string {
  const blaetter = Array.from(
    { length: blattAnzahl },
    (_x, i) =>
      `<Relationship Id="rId${String(i + 1)}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
      `Target="worksheets/sheet${String(i + 1)}.xml"/>`,
  ).join('');

  const naechste = blattAnzahl + 1;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    blaetter +
    `<Relationship Id="rId${String(naechste)}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${String(naechste + 1)}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`
  );
}

function baueSharedStringsXml(zeichenketten: readonly string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `count="${String(zeichenketten.length)}" uniqueCount="${String(zeichenketten.length)}">` +
    zeichenketten.map((t) => `<si><t xml:space="preserve">${maskiere(t)}</t></si>`).join('') +
    `</sst>`
  );
}

/**
 * Die Stiltabelle.
 *
 * Handgeschrieben und bewusst kurz: acht `cellXfs`-Einträge in der
 * Reihenfolge von `STIL_INDEX`. `numFmtId` 164+ sind die eigenen Formate;
 * 0–163 sind von ECMA-376 vergeben (14 = kurzes Datum, 9 = Prozent).
 */
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2">` +
  `<numFmt numFmtId="164" formatCode="#,##0.000"/>` +
  `<numFmt numFmtId="165" formatCode="#,##0.00&quot; %&quot;"/>` +
  `</numFmts>` +
  `<fonts count="3">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  // Gelb = Eingabefeld, exakt die Bedeutung aus der Vorlagen-Legende.
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `</styleSheet>`;
