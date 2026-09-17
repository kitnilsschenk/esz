import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestPostgres } from '../../health/test-support/testcontainer-postgres';
import { migrateTestPostgres } from '../../stammdaten/test-support/migrate-test-postgres';
import {
  buildIngestWorkerConnectionString,
  ensureIngestWorkerLoginRole,
} from '../test-support/ingest-worker-role.test-support';
import { provisioniereTestGeraet } from '../test-support/device-fixture.test-support';
import { buildSyntheticUplink } from '../synthetic-publisher/synthetic-uplink-fixture';
import { HERKUNFT_BACKFILL } from '../ingest-flow/messwert-codes';
import { NachlaufRunnerModule } from './nachlauf-runner.module';
import { NachlaufService } from './nachlauf.service';

const KWH_PRO_TAG = 100;

/** Die Zeilen als `AsyncIterable` — dieselbe Form, in der `readline` sie liefert. */
function zeilenAus(zeilen: readonly string[]): AsyncIterable<string> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- Der Vertrag ist async; es gibt hier nur nichts zu erwarten.
    async *[Symbol.asyncIterator]() {
      yield* zeilen;
    },
  };
}

/**
 * Der Nachlauf gegen eine echte Datenbank (ADR-0005 §21 D9).
 *
 * **Was dieser Test hält, was der Unit-Test nicht kann.** Dort ist die
 * Pipeline gemockt; geprüft wird, was der Nachlauf ihr übergibt. Hier geht
 * dieselbe Datei durch den ECHTEN Schreibpfad — DevEUI-Auflösung,
 * Kanalsuche, Plausibilität, Upsert — und die Frage ist, was danach in
 * `measurement.messwert` steht. Genau dort saß der Befund vom 2026-09-08:
 * das ±48-h-Fenster galt auch für `backfill`, und jeder Wert, der älter als
 * zwei Tage war, fiel in die Quarantäne. Ein Nachlauf war damit strukturell
 * unmöglich, ohne dass irgendein Test das gezeigt hätte.
 *
 * **Kein MQTT.** Der Nachlauf läuft über `NachlaufRunnerModule`, das den
 * Broker bewusst nicht mitbringt — der Test belegt damit auch, dass der
 * Runner ohne Broker anläuft.
 */
describe('Nachlauf — Integrationstests (ADR-0005 §21 D9, herkunft=backfill)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let adminClient: Client;
  let app: INestApplicationContext;
  let service: NachlaufService;

  beforeAll(async () => {
    process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
    process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');

    pgContainer = await startTestPostgres();
    await migrateTestPostgres(pgContainer);
    await ensureIngestWorkerLoginRole(pgContainer);
    process.env['EDMS_INGEST_DATABASE_URL'] = buildIngestWorkerConnectionString(pgContainer);

    adminClient = new Client({ connectionString: pgContainer.getConnectionUri() });
    await adminClient.connect();

    app = await NestFactory.createApplicationContext(NachlaufRunnerModule, { logger: false });
    service = app.get(NachlaufService);
  }, 180_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await adminClient?.end().catch(() => undefined);
    await pgContainer?.stop().catch(() => undefined);
  }, 60_000);

  /** Zählerstände eines vergangenen Zeitraums als NDJSON-Zeilen. */
  function nachlaufZeilen(devEui: string, tage: number, startTag: Date): string[] {
    return Array.from({ length: tage }, (_, i) => {
      const zeitpunkt = new Date(startTag.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
      const uplink = buildSyntheticUplink({
        devEui,
        wertRoh: (i + 1) * KWH_PRO_TAG,
        deviceTimestampIso: zeitpunkt,
      });
      return uplink.payload.toString('utf8');
    });
  }

  async function anzahlMesswerte(messkanalKey: number): Promise<number> {
    const ergebnis = await adminClient.query<{ anzahl: string }>(
      'SELECT count(*)::text AS anzahl FROM measurement.messwert WHERE messkanal_key = $1',
      [messkanalKey],
    );
    return Number(ergebnis.rows[0]?.anzahl ?? '0');
  }

  it('nimmt einen Monat aus der Vergangenheit auf — genau das war vorher unmöglich', async () => {
    // Vor der Korrektur vom 2026-09-08 fiel JEDER dieser Werte in die
    // Quarantäne: Das ±48-h-Plausibilitätsfenster galt auch für `backfill`.
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-01' });
    const start = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const bilanz = await service.verarbeiteDatei(zeilenAus(nachlaufZeilen(geraet.devEui, 10, start)), true);

    expect(bilanz.modus).toBe('ausfuehrung');
    expect(bilanz.uplinksVerarbeitet).toBe(10);
    expect(bilanz.messwerteGeschrieben).toBe(10);
    expect(bilanz.quarantaene).toBe(0);
    expect(await anzahlMesswerte(geraet.messkanalKey)).toBe(10);
  }, 60_000);

  it('kennzeichnet die Werte als Nachlauf, nicht als Live-Aufnahme', async () => {
    // Die Herkunft ist keine Nebensache: Sie unterscheidet einen Wert, der
    // beim Entstehen ankam, von einem, der nachgereicht wurde.
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-02' });
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await service.verarbeiteDatei(zeilenAus(nachlaufZeilen(geraet.devEui, 3, start)), true);

    const herkuenfte = await adminClient.query<{ herkunft: number }>(
      'SELECT DISTINCT herkunft FROM measurement.messwert WHERE messkanal_key = $1',
      [geraet.messkanalKey],
    );
    expect(herkuenfte.rows).toHaveLength(1);
    // `HERKUNFT_BACKFILL = 1`, `HERKUNFT_INGEST_LIVE = 0` (`messwert-codes.ts`).
    expect(herkuenfte.rows[0]?.herkunft).toBe(HERKUNFT_BACKFILL);
  }, 60_000);

  it('schreibt im Probelauf nichts, meldet aber die unlesbaren Zeilen', async () => {
    // Die Zahl, wegen der man den Probelauf macht: Taugt die Datei, BEVOR
    // etwas geschrieben wird?
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-03' });
    const start = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const zeilen = [...nachlaufZeilen(geraet.devEui, 3, start), '{kaputt'];

    const bilanz = await service.verarbeiteDatei(zeilenAus(zeilen), false);

    expect(bilanz.zeilenUnlesbar).toBe(1);
    expect(bilanz.ersteUnlesbareZeilen).toEqual([4]);
    expect(await anzahlMesswerte(geraet.messkanalKey)).toBe(0);
  }, 60_000);

  it('ist wiederholbar — ein zweiter Lauf über dieselbe Datei erzeugt keine Dubletten', async () => {
    // Der Regelfall ist genau das: erst ein Teil nacharbeiten, dann
    // sicherheitshalber alles.
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-04' });
    const start = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
    const zeilen = nachlaufZeilen(geraet.devEui, 5, start);

    await service.verarbeiteDatei(zeilenAus(zeilen), true);
    const zweite = await service.verarbeiteDatei(zeilenAus(zeilen), true);

    expect(await anzahlMesswerte(geraet.messkanalKey)).toBe(5);
    expect(zweite.quarantaene).toBe(0);
  }, 60_000);

  it('füllt Lücken VOR bereits vorhandenen Werten — der eigentliche Zweck eines Nachlaufs', async () => {
    // Der Regelfall: Der Zähler hat seit gestern wieder Kontakt, die letzten
    // drei Wochen fehlen. Bis zum 2026-09-09 fiel dabei JEDER nachgereichte
    // Wert als „Monotonie verletzt" in die Quarantäne — verglichen wurde
    // gegen den JÜNGSTEN Wert des Kanals statt gegen den zeitlichen
    // Vorgänger. Der Nachlauf war damit genau in der Lage unmöglich, für die
    // es ihn gibt.
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-05' });
    const start = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const alleZeilen = nachlaufZeilen(geraet.devEui, 10, start);

    // Zuerst die JÜNGSTEN drei Tage — wie ein Zähler, der wieder sendet.
    await service.verarbeiteDatei(zeilenAus(alleZeilen.slice(7)), true);
    expect(await anzahlMesswerte(geraet.messkanalKey)).toBe(3);

    // Danach die sieben Tage DAVOR nachreichen.
    const bilanz = await service.verarbeiteDatei(zeilenAus(alleZeilen.slice(0, 7)), true);

    expect(bilanz.quarantaene).toBe(0);
    expect(bilanz.messwerteGeschrieben).toBe(7);
    expect(await anzahlMesswerte(geraet.messkanalKey)).toBe(10);
  }, 60_000);

  it('erkennt einen ECHTEN Rückwärtssprung auch im Nachlauf — die Prüfung wird nicht weicher', async () => {
    // Die Korrektur oben darf die Monotonie nicht abschalten: Ein
    // nachgereichter Wert, der ÜBER dem bereits gespeicherten späteren Stand
    // liegt, bedeutet einen fallenden Zähler und gehört in die Quarantäne.
    const geraet = await provisioniereTestGeraet(pgContainer, { devEui: 'AA-AA-AA-AA-AA-AA-A0-06' });
    const start = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
    const zeilen = nachlaufZeilen(geraet.devEui, 4, start);

    // Erst der letzte Tag (Stand 400), dann ein „nachgereichter" erster Tag
    // mit einem HÖHEREN Stand.
    await service.verarbeiteDatei(zeilenAus(zeilen.slice(3)), true);
    const ueberhoeht = buildSyntheticUplink({
      devEui: geraet.devEui,
      wertRoh: 9999,
      deviceTimestampIso: start.toISOString(),
    }).payload.toString('utf8');

    const bilanz = await service.verarbeiteDatei(zeilenAus([ueberhoeht]), true);

    expect(bilanz.messwerteGeschrieben).toBe(0);
    expect([...bilanz.quarantaeneJeGrund.keys()]).toContain('unplausibel_monotonie_verletzt');
  }, 60_000);

  it('nennt den Grund, wenn ein Gerät unbekannt ist, statt still nichts zu tun', async () => {
    // „5 Zeilen verarbeitet, 0 Messwerte" wäre ohne Grund nicht deutbar.
    const start = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const zeilen = nachlaufZeilen('00-00-00-00-00-00-FF-FF', 2, start);

    const bilanz = await service.verarbeiteDatei(zeilenAus(zeilen), true);

    expect(bilanz.messwerteGeschrieben).toBe(0);
    expect(bilanz.quarantaene).toBe(2);
    expect([...bilanz.quarantaeneJeGrund.keys()]).toContain('devEUI_unbekannt');
  }, 60_000);

  it('trägt die Zeilennummer in die Quarantäne-Zeile — sonst findet niemand die Stelle in der Datei', async () => {
    const start = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await service.verarbeiteDatei(zeilenAus(nachlaufZeilen('00-00-00-00-00-00-FF-FE', 1, start)), true);

    const zeilen = await adminClient.query<{ topic_redacted: string }>(
      `SELECT topic_redacted FROM ingest.eingang_quarantaene WHERE topic_redacted LIKE 'nachlauf/%' LIMIT 1`,
    );
    expect(zeilen.rows[0]?.topic_redacted).toMatch(/^nachlauf\/zeile-\d+$/);
  }, 60_000);
});
