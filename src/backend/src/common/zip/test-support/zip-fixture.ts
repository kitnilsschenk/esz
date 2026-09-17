import { deflateRawSync } from 'node:zlib';

/**
 * ZIP-Fixture-Bauer für die Tests des ZIP-Lesers, des DWD-Adapters und der
 * XLSX-Arbeitsmappe.
 *
 * Bewusst im Test statt über eine Bibliothek oder eine mitgelieferte
 * Beispieldatei: DWD-Rohdaten dürfen nicht ins Repository
 * (`docs/datenquellen.md`, „Rote Linie"), und eine ZIP-Bibliothek nur für
 * Fixtures wäre genau die Abhängigkeit, die der Produktivcode gerade
 * vermeidet (s. `zip-eintrag.util.ts`).
 */
export interface TestEintrag {
  readonly name: string;
  /** Als `string` wird UTF-8 kodiert — XLSX-Teile enthalten Umlaute. */
  readonly inhalt: string | Buffer;
  /** 0 = gespeichert, 8 = Deflate (Standard), alles andere zum Prüfen der Abweisung. */
  readonly methode?: number;
}

/**
 * Baut ein echtes ZIP-Archiv nach PKWARE APPNOTE 4.3 — bewusst im Test statt
 * über eine Bibliothek oder eine mitgelieferte Beispieldatei: DWD-Rohdaten
 * dürfen nicht ins Repository (`docs/datenquellen.md`, „Rote Linie"), und
 * eine Bibliothek nur für Testfixtures wäre eine Abhängigkeit, die der
 * Produktivcode gerade vermeidet.
 */
export function baueZip(eintraege: readonly TestEintrag[]): Buffer {
  const lokal: Buffer[] = [];
  const zentral: Buffer[] = [];
  let offset = 0;

  for (const eintrag of eintraege) {
    const methode = eintrag.methode ?? 8;
    const roh = Buffer.isBuffer(eintrag.inhalt) ? eintrag.inhalt : Buffer.from(eintrag.inhalt, 'utf8');
    const daten = methode === 8 ? deflateRawSync(roh) : roh;
    const name = Buffer.from(eintrag.name, 'latin1');

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);
    kopf.writeUInt16LE(methode, 8);
    kopf.writeUInt32LE(0, 14); // CRC32 — vom Leser nicht geprüft, s. dortige Doku.
    kopf.writeUInt32LE(daten.length, 18);
    kopf.writeUInt32LE(roh.length, 22);
    kopf.writeUInt16LE(name.length, 26);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(methode, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(daten.length, 20);
    cd.writeUInt32LE(roh.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);

    lokal.push(kopf, name, daten);
    zentral.push(cd, name);
    offset += kopf.length + name.length + daten.length;
  }

  const zentralBuffer = Buffer.concat(zentral);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(eintraege.length, 8);
  eocd.writeUInt16LE(eintraege.length, 10);
  eocd.writeUInt32LE(zentralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...lokal, zentralBuffer, eocd]);
}
