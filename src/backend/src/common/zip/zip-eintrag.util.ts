import { inflateRawSync } from 'node:zlib';

/**
 * Minimaler ZIP-Leser.
 *
 * **Warum selbst gebaut statt Bibliothek.** Zwei Datenquellen liefern
 * ausschließlich ZIP: die CDC-Archive des DWD (`tageswerte_KL_<id>_akt.zip`,
 * eine unkomprimierte Variante gibt es dort nicht) und jede XLSX-Arbeitsmappe
 * (ZIP mit XML-Teilen, OPC/ECMA-376). Eine ZIP-Bibliothek wäre eine neue
 * Produktivabhängigkeit — und jede solche ist laut
 * `.claude/rules/dependencies.md` vor der Installation lizenz- und
 * freigabepflichtig. Node bringt mit `node:zlib` bereits alles mit, was
 * fehlt, ist das Container-Format um den Deflate-Strom herum: rund 60 Zeilen
 * gut dokumentierter Struktur (PKWARE APPNOTE 4.3).
 *
 * **Bewusst unvollständig.** Kein ZIP64, keine Verschlüsselung, keine
 * Streaming-Verarbeitung, keine Data-Descriptor-Nachträge — Fälle, die weder
 * in CDC-Archiven noch in den Arbeitsmappen gängiger Tabellenkalkulationen
 * vorkommen. Was nicht abgedeckt ist, wird fail-closed mit klarer Meldung
 * abgewiesen statt still falsch gelesen.
 *
 * Liegt in `common/`, weil ihn zwei fachlich unverbundene Kontexte brauchen
 * (`berechnung/klima/dwd`, `import/xlsx`) — er kennt keinen von beiden.
 */

const EOCD_SIGNATUR = 0x06054b50;
const CENTRAL_DIR_SIGNATUR = 0x02014b50;
const LOCAL_HEADER_SIGNATUR = 0x04034b50;

/** Max. Kommentarlänge (0xFFFF) + EOCD-Grundlänge (22) — weiter hinten kann das EOCD nicht beginnen. */
const EOCD_SUCHFENSTER = 0xffff + 22;

const METHODE_GESPEICHERT = 0;
const METHODE_DEFLATE = 8;

/** Zip64-Marker: taucht 0xFFFFFFFF in einer Größen-/Offsetangabe auf, liegt der echte Wert im Zip64-Feld. */
const ZIP64_MARKER = 0xffffffff;

export class ZipLeseFehler extends Error {}

export interface ZipEintrag {
  readonly name: string;
  readonly inhalt: Buffer;
}

/**
 * Liest den EINEN Eintrag aus `archiv`, dessen Name `passt` erfüllt.
 *
 * Bewusst „einer statt alle": ein CDC-Archiv enthält 33 Dateien, gebraucht
 * wird genau die Produktdatei. Alles andere zu entpacken wäre verschenkte
 * Arbeit an Daten, die niemand ansieht.
 *
 * Mehrdeutigkeit ist hier ein FEHLER und keine Auswahl: Irgendeinen Treffer
 * zu nehmen hieße, sich auf die Reihenfolge im Central Directory zu
 * verlassen — die ist nicht zugesichert.
 *
 * @throws ZipLeseFehler wenn das Archiv unlesbar ist, kein oder mehr als ein
 *   Eintrag passt, oder ein nicht unterstütztes ZIP-Merkmal auftritt.
 */
export function leseZipEintrag(archiv: Buffer, passt: (dateiname: string) => boolean): ZipEintrag {
  const treffer = leseZipEintraege(archiv, passt);

  const [ersterTreffer] = treffer;
  if (ersterTreffer === undefined) {
    throw new ZipLeseFehler('Kein passender Eintrag im Archiv gefunden.');
  }
  if (treffer.length > 1) {
    throw new ZipLeseFehler(`Mehrdeutig: ${treffer.length} Einträge passen (${treffer.map((e) => e.name).join(', ')}).`);
  }

  return ersterTreffer;
}

/**
 * Liest ALLE Einträge aus `archiv`, deren Name `passt` erfüllt — in der
 * Reihenfolge des Central Directory.
 *
 * Für eine XLSX-Arbeitsmappe unvermeidlich: Ein Blatt allein ergibt keinen
 * Text, weil die Zeichenketten in einer zweiten Datei stehen
 * (`sharedStrings.xml`) und die Datumserkennung in einer dritten
 * (`styles.xml`). Das Archiv dafür dreimal neu aufzuschlagen wäre dreimal
 * dasselbe Central Directory.
 *
 * Auf die Reihenfolge darf sich der Aufrufer NICHT verlassen — er soll die
 * Einträge über ihren Namen aufsuchen.
 *
 * @throws ZipLeseFehler wie `leseZipEintrag`, nur ohne die Eindeutigkeits-Grenze.
 */
export function leseZipEintraege(archiv: Buffer, passt: (dateiname: string) => boolean): readonly ZipEintrag[] {
  const eocd = findeEocd(archiv);
  const eintragsAnzahl = archiv.readUInt16LE(eocd + 10);
  const centralDirOffset = archiv.readUInt32LE(eocd + 16);

  if (centralDirOffset === ZIP64_MARKER) {
    throw new ZipLeseFehler('ZIP64-Archiv — nicht unterstützt (CDC-Archive sind es nicht).');
  }

  const treffer: ZipEintrag[] = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < eintragsAnzahl; i += 1) {
    if (cursor + 46 > archiv.length || archiv.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATUR) {
      throw new ZipLeseFehler(`Central-Directory-Eintrag ${i} fehlt oder ist beschädigt.`);
    }

    const nameLaenge = archiv.readUInt16LE(cursor + 28);
    const extraLaenge = archiv.readUInt16LE(cursor + 30);
    const kommentarLaenge = archiv.readUInt16LE(cursor + 32);
    const name = archiv.toString('utf8', cursor + 46, cursor + 46 + nameLaenge);

    if (passt(name)) {
      treffer.push({
        name,
        inhalt: entpackeEintrag(archiv, {
          name,
          methode: archiv.readUInt16LE(cursor + 10),
          komprimierteGroesse: archiv.readUInt32LE(cursor + 20),
          entpackteGroesse: archiv.readUInt32LE(cursor + 24),
          lokalerOffset: archiv.readUInt32LE(cursor + 42),
        }),
      });
    }

    cursor += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }

  return treffer;
}

function findeEocd(archiv: Buffer): number {
  const ab = Math.max(0, archiv.length - EOCD_SUCHFENSTER);
  for (let i = archiv.length - 22; i >= ab; i -= 1) {
    if (archiv.readUInt32LE(i) === EOCD_SIGNATUR) {
      return i;
    }
  }
  throw new ZipLeseFehler('Kein End-of-Central-Directory gefunden — die Datei ist kein (vollständiges) ZIP-Archiv.');
}

function entpackeEintrag(
  archiv: Buffer,
  eintrag: {
    readonly name: string;
    readonly methode: number;
    readonly komprimierteGroesse: number;
    readonly entpackteGroesse: number;
    readonly lokalerOffset: number;
  },
): Buffer {
  if (eintrag.komprimierteGroesse === ZIP64_MARKER || eintrag.entpackteGroesse === ZIP64_MARKER) {
    throw new ZipLeseFehler(`Eintrag '${eintrag.name}': ZIP64-Größenangabe — nicht unterstützt.`);
  }

  const kopf = eintrag.lokalerOffset;
  if (kopf + 30 > archiv.length || archiv.readUInt32LE(kopf) !== LOCAL_HEADER_SIGNATUR) {
    throw new ZipLeseFehler(`Eintrag '${eintrag.name}': lokaler Datei-Header fehlt oder ist beschädigt.`);
  }

  // Die Längen im LOKALEN Header können von denen im Central Directory
  // abweichen (Extra-Felder werden beim Schreiben oft nur dort ergänzt) —
  // für die Datenposition zählt daher ausschließlich der lokale Header.
  const datenAb = kopf + 30 + archiv.readUInt16LE(kopf + 26) + archiv.readUInt16LE(kopf + 28);
  const datenBis = datenAb + eintrag.komprimierteGroesse;
  if (datenBis > archiv.length) {
    throw new ZipLeseFehler(`Eintrag '${eintrag.name}': Daten reichen über das Archivende hinaus.`);
  }

  const nutzdaten = archiv.subarray(datenAb, datenBis);
  const inhalt = eintrag.methode === METHODE_GESPEICHERT ? Buffer.from(nutzdaten) : inflate(eintrag, nutzdaten);

  if (inhalt.length !== eintrag.entpackteGroesse) {
    throw new ZipLeseFehler(
      `Eintrag '${eintrag.name}': entpackte Größe ${inhalt.length} weicht von der Angabe ${eintrag.entpackteGroesse} ab.`,
    );
  }

  return inhalt;
}

function inflate(eintrag: { readonly name: string; readonly methode: number }, nutzdaten: Buffer): Buffer {
  if (eintrag.methode !== METHODE_DEFLATE) {
    throw new ZipLeseFehler(
      `Eintrag '${eintrag.name}': Kompressionsmethode ${eintrag.methode} — nur 0 (gespeichert) und 8 (Deflate) werden unterstützt.`,
    );
  }

  try {
    return inflateRawSync(nutzdaten);
  } catch (fehler) {
    throw new ZipLeseFehler(
      `Eintrag '${eintrag.name}': Deflate-Strom nicht dekodierbar (${fehler instanceof Error ? fehler.message : 'unbekannt'}).`,
    );
  }
}
