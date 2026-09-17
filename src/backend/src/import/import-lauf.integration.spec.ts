import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Client } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestPostgres } from '../health/test-support/testcontainer-postgres';
import { migrateTestPostgres } from '../stammdaten/test-support/migrate-test-postgres';
import {
  buildIngestWorkerConnectionString,
  ensureIngestWorkerLoginRole,
} from '../ingest-worker/test-support/ingest-worker-role.test-support';
import { EndkundeService } from '../stammdaten/endkunde/endkunde.service';
import { SystemService } from '../stammdaten/system/system.service';
import { ZaehlerService } from '../stammdaten/zaehler/zaehler.service';
import { MesskanalService } from '../stammdaten/messkanal/messkanal.service';
import { ImportRunnerModule } from './import-runner.module';
import { ImportStammdatenRepository } from './persistence/import-stammdaten.repository';
import { ImportMesswertRepository } from './persistence/import-messwert.repository';
import { ImportLaufService } from './import-lauf.service';
import { leseMessmappe } from './messreihe/messreihe-parser';
import { baueXlsx, seriellesDatum, type TestZelle } from './xlsx/test-support/xlsx-fixture';

/**
 * Der Messreihen-Import gegen eine echte Datenbank.
 *
 * **Was dieser Test hält, was ein Unit-Test nicht kann.** Der Import berührt
 * ZWEI Verbindungen mit verschiedenen Rollen — Stammdaten über die
 * Anwendungsverbindung, Messwerte über den least-privilege Pool des
 * Ingest-Workers, weil `measurement.messwert` für `edms_app` nicht
 * beschreibbar ist (V0013). Ob das zusammenspielt, ob die Rechte reichen und
 * ob ein Tageswert am Ende unter dem richtigen Kalendertag liegt, zeigt sich
 * ausschließlich hier.
 *
 * **Und die Wiederholbarkeit.** Ein Import, den man versehentlich zweimal
 * startet, ist der Regelfall und nicht die Ausnahme. Dass dabei kein zweiter
 * Endkunde, kein zweiter Kanal und keine doppelten Werte entstehen, ist eine
 * Aussage über den Zustand der Datenbank — sie lässt sich nur an einer
 * echten prüfen.
 */
describe('Messreihen-Import — Integrationstests', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let adminClient: Client;
  let app: INestApplicationContext;
  let service: ImportLaufService;

  beforeAll(async () => {
    process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
    process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');

    pgContainer = await startTestPostgres();
    await migrateTestPostgres(pgContainer);
    await ensureIngestWorkerLoginRole(pgContainer);
    process.env['DATABASE_URL'] = pgContainer.getConnectionUri();
    process.env['EDMS_INGEST_DATABASE_URL'] = buildIngestWorkerConnectionString(pgContainer);

    adminClient = new Client({ connectionString: pgContainer.getConnectionUri() });
    await adminClient.connect();

    app = await NestFactory.createApplicationContext(ImportRunnerModule, { logger: false });
    service = new ImportLaufService({
      txHost: app.get(TransactionHost),
      endkunde: app.get(EndkundeService),
      system: app.get(SystemService),
      zaehler: app.get(ZaehlerService),
      messkanal: app.get(MesskanalService),
      stammdaten: app.get(ImportStammdatenRepository),
      messwerte: app.get(ImportMesswertRepository),
    });
  }, 180_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await adminClient?.end().catch(() => undefined);
    await pgContainer?.stop().catch(() => undefined);
  }, 60_000);

  /** Eine Mappe im Aufbau des Pilotbestands A: ein Förderjahr, `tage` Tageszeilen ab dem 12.10.2018. */
  function mappe(optionen: {
    readonly anlage?: string;
    readonly tage: number;
    readonly kwhJeTag: number;
    readonly mitWaerme?: boolean;
  }) {
    const kopf = optionen.mitWaerme === true
      ? ['Datum', 'Wochentag', 'Tagestyp', 'Waerme (kWh)', 'Strom (kWh)']
      : ['Datum', 'Wochentag', 'Tagestyp', 'Strom (kWh)'];

    const titel =
      optionen.anlage === undefined
        ? 'Foerderjahr 1:  12.10.2018 - 11.10.2019'
        : `Foerderjahr 1:  12.10.2018 - 11.10.2019   |   ${optionen.anlage}`;

    const zeilen: TestZelle[][] = [[titel], [], [], [...kopf]];
    const start = new Date(Date.UTC(2018, 9, 12));

    for (let i = 0; i < optionen.tage; i += 1) {
      const tag = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const werte = optionen.mitWaerme === true ? [optionen.kwhJeTag / 2, optionen.kwhJeTag] : [optionen.kwhJeTag];
      zeilen.push([{ datum: seriellesDatum(tag) }, 'Freitag', 'Werktag', ...werte]);
    }

    const summen =
      optionen.mitWaerme === true
        ? [(optionen.kwhJeTag / 2) * optionen.tage, optionen.kwhJeTag * optionen.tage]
        : [optionen.kwhJeTag * optionen.tage];
    zeilen.push(['Summe Foerderjahr', null, `${String(optionen.tage)} Tage`, ...summen]);

    return baueXlsx([{ name: 'FJ1 2018-2019', zeilen }]);
  }

  async function messwerte(bezeichnung: string, messgroesse: string) {
    const ergebnis = await adminClient.query<{
      anzahl: string;
      erster: string;
      summe: string;
      qualitaet: number;
      herkunft: number;
      art: string;
      ist_untermessung: boolean;
    }>(
      `SELECT count(*)::text AS anzahl,
              min(m.ts AT TIME ZONE 'Europe/Berlin')::date::text AS erster,
              sum(m.wert)::text AS summe,
              min(m.qualitaet) AS qualitaet, min(m.herkunft) AS herkunft,
              min(k.art) AS art, bool_or(k.ist_untermessung) AS ist_untermessung
         FROM measurement.messwert m
         JOIN energy.messkanal k ON k.kanal_key = m.messkanal_key
         JOIN energy.zaehler z ON z.id = k.zaehler_id
         JOIN energy.system s ON s.id = z.system_id
        WHERE s.bezeichnung = $1 AND k.messgroesse = $2`,
      [bezeichnung, messgroesse],
    );
    return ergebnis.rows[0];
  }

  it('legt Stammdaten an und schreibt die Tageswerte', async () => {
    const bilanz = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 10, kwhJeTag: 100 }))],
      { kennung: 'ImportA', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );

    expect(bilanz.endkundeNeu).toBe(true);
    expect(bilanz.geschriebenGesamt).toBe(10);

    const stand = await messwerte('ImportA — Hauptzaehler', 'wirkarbeit');
    expect(stand?.anzahl).toBe('10');
    expect(Number(stand?.summe)).toBeCloseTo(1000, 3);
  }, 120_000);

  it('legt den Tageswert auf den KALENDERTAG der Zeitzone', async () => {
    // Die Umrechnung macht die Datenbank. Eine selbst gerechnete Verschiebung
    // waere zweimal im Jahr um eine Stunde daneben — und damit einmal im Jahr
    // um einen ganzen Tag.
    const stand = await messwerte('ImportA — Hauptzaehler', 'wirkarbeit');

    expect(stand?.erster).toBe('2018-10-12');
  }, 60_000);

  it('stuft importierte Werte als geschaetzt mit Herkunft import_altsystem ein', async () => {
    // `import_altsystem` hat den niedrigsten Rang (V0013) — ein Import
    // ueberschreibt damit nie einen gemessenen Wert.
    const stand = await messwerte('ImportA — Hauptzaehler', 'wirkarbeit');

    expect(stand?.qualitaet).toBe(1);
    expect(stand?.herkunft).toBe(3);
  }, 60_000);

  it('legt Tageswerte als intervall_verbrauch an, nicht als Zaehlerstand', async () => {
    // Als kumulativer Kanal wuerde die Verdichtung die Differenz zweier
    // Tagesverbraeuche als Verbrauch lesen.
    const stand = await messwerte('ImportA — Hauptzaehler', 'wirkarbeit');

    expect(stand?.art).toBe('intervall_verbrauch');
  }, 60_000);

  it('erzeugt beim zweiten Lauf weder einen zweiten Endkunden noch doppelte Werte', async () => {
    const ersteBilanz = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 10, kwhJeTag: 100 }))],
      { kennung: 'ImportB', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );
    const zweiteBilanz = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 10, kwhJeTag: 100 }))],
      { kennung: 'ImportB', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );

    expect(zweiteBilanz.endkundeId).toBe(ersteBilanz.endkundeId);
    expect(zweiteBilanz.endkundeNeu).toBe(false);
    // Kein hoeherer Rang -> das Upsert aendert nichts.
    expect(zweiteBilanz.geschriebenGesamt).toBe(0);
    expect((await messwerte('ImportB — Hauptzaehler', 'wirkarbeit'))?.anzahl).toBe('10');

    const systeme = await adminClient.query<{ anzahl: string }>(
      "SELECT count(*)::text AS anzahl FROM energy.system WHERE bezeichnung = 'ImportB — Hauptzaehler'",
    );
    expect(systeme.rows[0]?.anzahl).toBe('1');
  }, 120_000);

  it('haengt eine zweite Mappe an denselben Endkunden — als Untermessung', async () => {
    // Die vier Unterzaehler einer Liegenschaft muessen am selben Kunden
    // haengen, sonst zaehlt die Geraeteerkennung sie nie gegen den Hauptzaehler.
    const haupt = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 5, kwhJeTag: 100 }))],
      { kennung: 'ImportC', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );
    const unter = await service.importiere(
      [leseMessmappe('bhkw.xlsx', mappe({ anlage: 'BHKW', tage: 5, kwhJeTag: 40 }))],
      { kennung: 'ImportC', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );

    expect(unter.endkundeId).toBe(haupt.endkundeId);
    expect(unter.endkundeNeu).toBe(false);
    expect((await messwerte('ImportC — Hauptzaehler', 'wirkarbeit'))?.ist_untermessung).toBe(false);
    expect((await messwerte('ImportC — BHKW', 'wirkarbeit'))?.ist_untermessung).toBe(true);
  }, 120_000);

  it('legt je Messgroesse einen eigenen Zaehler mit passendem Energietraeger an', async () => {
    await service.importiere(
      [leseMessmappe('beide.xlsx', mappe({ tage: 5, kwhJeTag: 100, mitWaerme: true }))],
      { kennung: 'ImportD', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );

    const zaehler = await adminClient.query<{ energietraeger: string }>(
      `SELECT z.energietraeger FROM energy.zaehler z
         JOIN energy.system s ON s.id = z.system_id
        WHERE s.bezeichnung = 'ImportD — Hauptzaehler' ORDER BY z.energietraeger`,
    );

    expect(zaehler.rows.map((r) => r.energietraeger)).toEqual(['strom', 'waerme']);
    expect((await messwerte('ImportD — Hauptzaehler', 'thermische_energie'))?.anzahl).toBe('5');
  }, 120_000);

  it('schreibt im Probelauf nichts und legt auch keinen Endkunden an', async () => {
    const bilanz = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 5, kwhJeTag: 100 }))],
      { kennung: 'ImportE', zeitzone: 'Europe/Berlin', ausfuehren: false },
    );

    expect(bilanz.modus).toBe('probelauf');
    expect(bilanz.endkundeId).toBeUndefined();
    expect(bilanz.geschriebenGesamt).toBe(0);
    expect(bilanz.kanaele[0]?.tage).toBe(5);
    expect(bilanz.kanaele[0]?.neuAngelegt).toBe(true);

    const systeme = await adminClient.query<{ anzahl: string }>(
      "SELECT count(*)::text AS anzahl FROM energy.system WHERE bezeichnung LIKE 'ImportE%'",
    );
    expect(systeme.rows[0]?.anzahl).toBe('0');
  }, 120_000);

  it('stuft auf Wunsch als gemessen ein — und erst DAS macht einen Monat ausweisbar', async () => {
    // Die Abdeckung eines Monats zaehlt ausschliesslich GEMESSENE Tage
    // (ADR-0006 B12). Ein als `geschaetzt` importiertes Jahr hat 0 %
    // Abdeckung. Wer Ablesungen aus einem Altsystem uebernimmt, muss das
    // sagen koennen — sonst traegt kein uebernommener Bestand je einen
    // Nachweis.
    await service.importiere([leseMessmappe('haupt.xlsx', mappe({ tage: 5, kwhJeTag: 100 }))], {
      kennung: 'ImportG',
      zeitzone: 'Europe/Berlin',
      qualitaet: 'gemessen',
      ausfuehren: true,
    });

    const stand = await messwerte('ImportG — Hauptzaehler', 'wirkarbeit');
    expect(stand?.qualitaet).toBe(0);
    // Die Herkunft bleibt `import_altsystem` — sie sagt, WOHER der Wert kam,
    // nicht wie gut er ist. Auch als gemessen eingestuft ueberschreibt er
    // damit keinen Live-Messwert.
    expect(stand?.herkunft).toBe(3);
  }, 120_000);

  it('stuft ohne Angabe als geschaetzt ein — die schwaechere Aussage ist die sichere', async () => {
    const bilanz = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 3, kwhJeTag: 50 }))],
      { kennung: 'ImportH', zeitzone: 'Europe/Berlin', ausfuehren: true },
    );

    expect(bilanz.qualitaet).toBe('geschaetzt');
    expect((await messwerte('ImportH — Hauptzaehler', 'wirkarbeit'))?.qualitaet).toBe(1);
  }, 120_000);

  it('meldet im Probelauf, was auf dem Kanal schon liegt', async () => {
    // Genau deswegen macht man ihn: Er sagt, ob dieser Lauf ergaenzt oder wiederholt.
    await service.importiere([leseMessmappe('haupt.xlsx', mappe({ tage: 8, kwhJeTag: 100 }))], {
      kennung: 'ImportF',
      zeitzone: 'Europe/Berlin',
      ausfuehren: true,
    });

    const probe = await service.importiere(
      [leseMessmappe('haupt.xlsx', mappe({ tage: 8, kwhJeTag: 100 }))],
      { kennung: 'ImportF', zeitzone: 'Europe/Berlin', ausfuehren: false },
    );

    expect(probe.kanaele[0]?.vorhanden).toBe(8);
    expect(probe.kanaele[0]?.neuAngelegt).toBe(false);
  }, 120_000);
});
