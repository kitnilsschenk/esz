import { baueZip } from '../../../common/zip/test-support/zip-fixture';

/**
 * Baut eine echte, minimale XLSX-Arbeitsmappe für Tests.
 *
 * Bewusst selbst gebaut statt als Beispieldatei mitgeliefert: Fixtures sind
 * synthetisch (`.claude/rules/tests.md`), und eine binäre Beispielmappe im
 * Repository könnte niemand mehr auf ihren Inhalt prüfen — man müsste sie
 * öffnen, um zu wissen, was der Test eigentlich behauptet. Hier steht es im
 * Test.
 */

export interface TestBlatt {
  readonly name: string;
  /**
   * Zeilen mit Zellen. `null` = leere Zelle (kein `<c>`-Element).
   * `{ datum }` erzeugt eine Zahl mit Datums-Zahlenformat.
   */
  readonly zeilen: readonly (readonly TestZelle[])[];
}

export type TestZelle =
  | string
  | number
  | null
  | { readonly datum: number }
  | { readonly bool: boolean }
  | { readonly fehler: string }
  | { readonly formelText: string };

const SPALTEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function baueXlsx(blaetter: readonly TestBlatt[]): Buffer {
  const zeichenketten: string[] = [];
  const indexJeText = new Map<string, number>();

  function sharedIndex(text: string): number {
    const vorhanden = indexJeText.get(text);
    if (vorhanden !== undefined) {
      return vorhanden;
    }
    const index = zeichenketten.length;
    zeichenketten.push(text);
    indexJeText.set(text, index);
    return index;
  }

  const blattTeile = blaetter.map((blatt, i) => ({
    pfad: `xl/worksheets/sheet${String(i + 1)}.xml`,
    inhalt: baueBlattXml(blatt, sharedIndex),
  }));

  const sharedXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(zeichenketten.length)}" uniqueCount="${String(zeichenketten.length)}">` +
    zeichenketten.map((t) => `<si><t xml:space="preserve">${maskiere(t)}</t></si>`).join('') +
    `</sst>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    blaetter
      .map((b, i) => `<sheet name="${maskiere(b.name)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`)
      .join('') +
    `</sheets></workbook>`;

  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    blaetter
      .map(
        (_b, i) =>
          `<Relationship Id="rId${String(i + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  // Stil 0 = Standard (kein Datum), Stil 1 = Datumsformat (numFmtId 14 = kurzes Datum).
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>` +
    `</styleSheet>`;

  return baueZip([
    { name: '[Content_Types].xml', inhalt: '<?xml version="1.0"?><Types/>' },
    { name: 'xl/workbook.xml', inhalt: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', inhalt: relsXml },
    { name: 'xl/sharedStrings.xml', inhalt: sharedXml },
    { name: 'xl/styles.xml', inhalt: stylesXml },
    ...blattTeile.map((t) => ({ name: t.pfad, inhalt: t.inhalt })),
  ]);
}

function baueBlattXml(blatt: TestBlatt, sharedIndex: (text: string) => number): string {
  const zeilen = blatt.zeilen
    .map((zellen, zi) => {
      const nr = zi + 1;
      const inhalt = zellen
        .map((zelle, si) => baueZelleXml(`${spalte(si)}${String(nr)}`, zelle, sharedIndex))
        .filter((x) => x.length > 0)
        .join('');
      return `<row r="${String(nr)}">${inhalt}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${zeilen}</sheetData></worksheet>`
  );
}

function baueZelleXml(bezug: string, zelle: TestZelle, sharedIndex: (text: string) => number): string {
  if (zelle === null) {
    return '';
  }
  if (typeof zelle === 'string') {
    return `<c r="${bezug}" t="s"><v>${String(sharedIndex(zelle))}</v></c>`;
  }
  if (typeof zelle === 'number') {
    return `<c r="${bezug}"><v>${String(zelle)}</v></c>`;
  }
  if ('datum' in zelle) {
    return `<c r="${bezug}" s="1"><v>${String(zelle.datum)}</v></c>`;
  }
  if ('bool' in zelle) {
    return `<c r="${bezug}" t="b"><v>${zelle.bool ? '1' : '0'}</v></c>`;
  }
  if ('fehler' in zelle) {
    return `<c r="${bezug}" t="e"><v>${maskiere(zelle.fehler)}</v></c>`;
  }
  return `<c r="${bezug}" t="str"><v>${maskiere(zelle.formelText)}</v></c>`;
}

function spalte(index: number): string {
  if (index < 26) {
    return SPALTEN[index] ?? 'A';
  }
  return `${SPALTEN[Math.floor(index / 26) - 1] ?? 'A'}${SPALTEN[index % 26] ?? 'A'}`;
}

function maskiere(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Tage seit dem 30.12.1899 — die serielle Datumszahl der Tabellenkalkulation. */
export function seriellesDatum(iso: string): number {
  const [j, m, t] = iso.split('-').map((x) => Number.parseInt(x, 10));
  return Math.round((Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
}
