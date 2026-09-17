import { crc32, deflateRawSync } from 'node:zlib';

/**
 * ZIP-Schreiber nach PKWARE APPNOTE 4.3 — für Ausgabeformate, die ein
 * ZIP-Container sind (derzeit XLSX).
 *
 * **Warum keine Bibliothek.** Dieselbe Linie wie beim LESER
 * (`zip-eintrag.util.ts`) und beim XLSX-Leser
 * (`import/xlsx/xlsx-arbeitsmappe.ts`): Das Vorhaben steht unter
 * Open-Source-Publikationspflicht, jede eingebettete Abhängigkeit ist
 * lizenzpflichtig zu prüfen (`.claude/rules/dependencies.md`), und was hier
 * gebraucht wird, ist ein knappes Hundert Zeilen. `exceljs` (MIT) wäre
 * zulässig gewesen, brächte aber einen ganzen Baum an Transitiven für eine
 * Aufgabe, die `node:zlib` bereits löst.
 *
 * **Warum nicht der Test-Fixture-Bauer** (`test-support/zip-fixture.ts`):
 * Der schreibt `CRC32 = 0`. Der hauseigene Leser prüft die Prüfsumme nicht,
 * Excel schon — eine damit gebaute Mappe wäre für den Leser gültig und für
 * den Empfänger kaputt. Genau die Sorte Fehler, die erst beim Adressaten
 * auffällt.
 */
export interface ZipEintrag {
  /** Pfad im Archiv, `/`-getrennt, ohne führenden Slash. */
  readonly name: string;
  /** Als `string` wird UTF-8 kodiert. */
  readonly inhalt: string | Buffer;
}

/** Feste Zeitangabe für die Einträge — s. `zeitFelder()`. */
const DOS_ZEIT = dosZeit(new Date(Date.UTC(1980, 0, 1, 0, 0, 0)));

/**
 * Baut ein ZIP-Archiv.
 *
 * **Deterministisch.** Alle Einträge tragen dieselbe feste Zeitangabe
 * (1980-01-01, der Nullpunkt des DOS-Zeitformats). Das ist hier kein
 * Schönheitsfehler, sondern Absicht: Ein Nachweis-Artefakt wird über seinen
 * SHA-256 geführt, und zweimal dieselbe Mappe aus denselben Daten muss
 * denselben Hash ergeben. Mit der aktuellen Uhrzeit im Eintragskopf wäre
 * jeder erneute Download eine andere Datei.
 */
export function baueZip(eintraege: readonly ZipEintrag[]): Buffer {
  const lokal: Buffer[] = [];
  const zentral: Buffer[] = [];
  let offset = 0;

  for (const eintrag of eintraege) {
    const roh = Buffer.isBuffer(eintrag.inhalt) ? eintrag.inhalt : Buffer.from(eintrag.inhalt, 'utf8');
    const daten = deflateRawSync(roh);
    const name = Buffer.from(eintrag.name, 'utf8');
    const pruefsumme = crc32(roh);

    // Bit 11 im Allgemein-Flag = Dateiname ist UTF-8 (APPNOTE 4.4.4). Ohne
    // das Bit liest ein Empfaenger den Namen als CP437 — bei reinen
    // ASCII-Namen folgenlos, aber ein Archiv, das nur zufaellig richtig
    // gelesen wird, ist kein gutes Archiv.
    const flags = 0x0800;

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4); // Version zum Entpacken: 2.0 (Deflate)
    kopf.writeUInt16LE(flags, 6);
    kopf.writeUInt16LE(8, 8); // Methode 8 = Deflate
    kopf.writeUInt16LE(DOS_ZEIT.zeit, 10);
    kopf.writeUInt16LE(DOS_ZEIT.datum, 12);
    kopf.writeUInt32LE(pruefsumme, 14);
    kopf.writeUInt32LE(daten.length, 18);
    kopf.writeUInt32LE(roh.length, 22);
    kopf.writeUInt16LE(name.length, 26);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // Version des Erzeugers
    cd.writeUInt16LE(20, 6); // Version zum Entpacken
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(DOS_ZEIT.zeit, 12);
    cd.writeUInt16LE(DOS_ZEIT.datum, 14);
    cd.writeUInt32LE(pruefsumme, 16);
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

/** Datum/Zeit im DOS-Format (APPNOTE 4.4.6) — Sekunden in Zwei-Sekunden-Schritten. */
function dosZeit(zeitpunkt: Date): { readonly datum: number; readonly zeit: number } {
  const jahr = zeitpunkt.getUTCFullYear();
  return {
    datum: ((jahr - 1980) << 9) | ((zeitpunkt.getUTCMonth() + 1) << 5) | zeitpunkt.getUTCDate(),
    zeit: (zeitpunkt.getUTCHours() << 11) | (zeitpunkt.getUTCMinutes() << 5) | (zeitpunkt.getUTCSeconds() >> 1),
  };
}
