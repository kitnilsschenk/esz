import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istAbgelaufen, leseGueltigBis } from './zertifikat-gueltigkeit.util';

/**
 * Die Zertifikate werden HIER ERZEUGT statt als Fixture eingecheckt.
 *
 * Ein eingechecktes Testzertifikat mit fester Laufzeit läuft irgendwann ab —
 * und dann wird der Test rot aus einem Grund, der mit dem Prüfgegenstand
 * nichts zu tun hat. Genau die Fehlerart, gegen die dieses Modul gebaut ist,
 * hätte man sich damit in die Testsuite geholt.
 */
describe('Zertifikats-Gültigkeit', () => {
  let verzeichnis: string;
  let gueltigesPem: string;
  let abgelaufenesPem: string;

  /**
   * `tage > 0` → gültig ab heute für so viele Tage.
   * `tage < 0` → Gültigkeitsfenster liegt VOLLSTÄNDIG in der Vergangenheit.
   */
  function erzeuge(name: string, tage: number): string {
    const key = path.join(verzeichnis, `${name}.key`);
    const crt = path.join(verzeichnis, `${name}.crt`);
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      key,
      '-out',
      crt,
      '-nodes',
      '-subj',
      `/CN=${name}`,
      ...(tage > 0
        ? ['-days', String(tage)]
        : ['-not_before', alsAsn1Zeit(tage - 1), '-not_after', alsAsn1Zeit(-1)]),
    ]);
    return readFileSync(crt, 'utf8');
  }

  /**
   * `YYYYMMDDHHMMSSZ` relativ zu heute — OpenSSL verlangt genau dieses
   * Format. Das `T` aus der ISO-Form muss mit weg, sonst lehnt es die Angabe
   * mit „start date is invalid" ab.
   */
  function alsAsn1Zeit(tageDelta: number): string {
    const datum = new Date(Date.now() + tageDelta * 86_400_000);
    return `${datum.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  }

  beforeAll(() => {
    verzeichnis = mkdtempSync(path.join(tmpdir(), 'edms-zert-'));
    gueltigesPem = erzeuge('gueltig', 45);
    abgelaufenesPem = erzeuge('abgelaufen', -30);
  });

  afterAll(() => {
    rmSync(verzeichnis, { recursive: true, force: true });
  });

  it('liest das Ablaufdatum aus einem PEM-Zertifikat', () => {
    const bis = leseGueltigBis(gueltigesPem);

    expect(bis).toBeDefined();
    const alsDatum = new Date(String(bis));
    expect(Number.isNaN(alsDatum.getTime())).toBe(false);
    // 45 Tage Laufzeit — grosszuegig geprueft, es geht um die Groessenordnung.
    const tageEntfernt = (alsDatum.getTime() - Date.now()) / 86_400_000;
    expect(tageEntfernt).toBeGreaterThan(40);
    expect(tageEntfernt).toBeLessThan(50);
  });

  it('gibt `undefined` statt zu werfen, wenn der Text kein Zertifikat ist', () => {
    // Ein unlesbarer Inhalt soll die Pflege nicht blockieren: Ueber die echte
    // Gueltigkeit entscheidet der Verbindungsaufbau, nicht das Formular.
    expect(leseGueltigBis('irgendein Text')).toBeUndefined();
    expect(leseGueltigBis('')).toBeUndefined();
    expect(leseGueltigBis('-----BEGIN CERTIFICATE-----\nkeinBase64\n-----END CERTIFICATE-----')).toBeUndefined();
  });

  it('haelt ein gueltiges Zertifikat NICHT fuer abgelaufen', () => {
    expect(istAbgelaufen(gueltigesPem)).toBe(false);
  });

  it('erkennt ein abgelaufenes Zertifikat gegen die aktuelle Zeit', () => {
    // Der haeufigste Bedienfehler beim Erneuern: versehentlich das ALTE
    // Zertifikat kopieren. Ohne diese Pruefung entstuende eine Konfiguration,
    // die sicher nicht verbindet — und der Grund staende nur im
    // Worker-Protokoll.
    expect(istAbgelaufen(abgelaufenesPem)).toBe(true);
  });

  it('bewertet den Ablauf gegen einen uebergebenen Zeitpunkt', () => {
    // Die Zeitbezug-Variante ist die, auf die sich alles andere verlassen
    // kann: Ein Zertifikat, das heute gilt, ist nach seinem notAfter abgelaufen.
    const bis = new Date(String(leseGueltigBis(gueltigesPem)));
    const einTagSpaeter = new Date(bis.getTime() + 86_400_000);

    expect(istAbgelaufen(gueltigesPem, einTagSpaeter)).toBe(true);
  });
});
