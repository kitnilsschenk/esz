import { describe, expect, it } from 'vitest';
import { ZipLeseFehler, leseZipEintrag } from './zip-eintrag.util';
import { baueZip } from './test-support/zip-fixture';

describe('leseZipEintrag', () => {
  it('holt genau den gesuchten Eintrag aus einem Archiv mit vielen Dateien', () => {
    // Ein CDC-Archiv enthält 33 Dateien; gebraucht wird eine einzige.
    const archiv = baueZip([
      { name: 'Metadaten_Geographie_00433.txt', inhalt: 'egal' },
      { name: 'produkt_klima_tag_20250307_20260907_00433.txt', inhalt: 'STATIONS_ID;MESS_DATUM;TMK;eor' },
      { name: 'Metadaten_Parameter_klima_tag_00433.txt', inhalt: 'auch egal' },
    ]);

    const eintrag = leseZipEintrag(archiv, (name) => name.startsWith('produkt_klima_tag_'));

    expect(eintrag.name).toBe('produkt_klima_tag_20250307_20260907_00433.txt');
    expect(eintrag.inhalt.toString('latin1')).toBe('STATIONS_ID;MESS_DATUM;TMK;eor');
  });

  it('entpackt auch längere Inhalte verlustfrei', () => {
    // Kurze Strings können durch Deflate zufällig unverändert durchlaufen —
    // erst ab einiger Länge ist wirklich der Inflate-Pfad getestet.
    const inhalt = Array.from({ length: 500 }, (_, i) => `        433;2025010${i % 10};   10;   ${i / 10};eor`).join('\n');
    const archiv = baueZip([{ name: 'produkt_klima_tag_20250101_20251231_00433.txt', inhalt }]);

    expect(leseZipEintrag(archiv, (n) => n.startsWith('produkt')).inhalt.toString('latin1')).toBe(inhalt);
  });

  it('liest auch unkomprimiert gespeicherte Einträge', () => {
    const archiv = baueZip([{ name: 'produkt.txt', inhalt: 'unkomprimiert', methode: 0 }]);

    expect(leseZipEintrag(archiv, () => true).inhalt.toString('latin1')).toBe('unkomprimiert');
  });

  it('weist ein Archiv ohne passenden Eintrag ab, statt irgendetwas zurückzugeben', () => {
    const archiv = baueZip([{ name: 'Metadaten_Geographie_00433.txt', inhalt: 'egal' }]);

    expect(() => leseZipEintrag(archiv, (n) => n.startsWith('produkt_'))).toThrow(ZipLeseFehler);
  });

  it('weist Mehrdeutigkeit ab — die Reihenfolge im Central Directory ist nicht zugesichert', () => {
    const archiv = baueZip([
      { name: 'produkt_klima_tag_a.txt', inhalt: '1' },
      { name: 'produkt_klima_tag_b.txt', inhalt: '2' },
    ]);

    expect(() => leseZipEintrag(archiv, (n) => n.startsWith('produkt_'))).toThrow(/Mehrdeutig: 2 Einträge/);
  });

  it('weist eine unbekannte Kompressionsmethode ab, statt Rohbytes durchzureichen', () => {
    const archiv = baueZip([{ name: 'produkt.txt', inhalt: 'egal', methode: 12 }]);

    expect(() => leseZipEintrag(archiv, () => true)).toThrow(/Kompressionsmethode 12/);
  });

  it('erkennt eine abgeschnittene Datei, statt sie halb zu lesen', () => {
    // Der häufigste reale Fehlerfall: die Verbindung bricht mitten im Download ab.
    const archiv = baueZip([{ name: 'produkt.txt', inhalt: 'egal' }]);

    expect(() => leseZipEintrag(archiv.subarray(0, archiv.length - 30), () => true)).toThrow(
      /End-of-Central-Directory/,
    );
  });

  it('erkennt einen beschädigten Deflate-Strom', () => {
    const archiv = baueZip([{ name: 'produkt.txt', inhalt: 'a'.repeat(400) }]);
    // Mitten in die Nutzdaten schreiben (hinter den 30-Byte-Kopf + Dateinamen).
    archiv.writeUInt32LE(0xdeadbeef, 30 + 'produkt.txt'.length + 4);

    expect(() => leseZipEintrag(archiv, () => true)).toThrow(ZipLeseFehler);
  });
});
