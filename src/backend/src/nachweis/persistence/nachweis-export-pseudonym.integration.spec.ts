import { randomUUID } from 'node:crypto';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../../stammdaten/test-support/stammdaten-test-app';
import { NachweisExportPseudonymRepository } from './nachweis-export-pseudonym.repository';

/**
 * Die Pseudonym-Vergabe des Exports (ADR-0007 D6/B6, Auflage A19).
 *
 * **Warum dieser Test existiert.** `NachweisExportService.aufloesenOderVergeben`
 * löst die Entitäten eines Exports mit `Promise.all` auf — mehrere Aufrufe
 * INNERHALB DERSELBEN Transaktion. Die Vergabe bestand aus zwei Anweisungen
 * (zählen, dann einfügen), und die verschränkten sich: Erst zählten alle, dann
 * fügten alle ein, alle mit derselben laufenden Nummer. Der `pg_advisory_xact_lock`
 * half nicht — er ist re-entrant, dieselbe Sitzung bekommt ihn beliebig oft.
 *
 * Aufgefallen ist das nicht im Test, sondern beim ersten Lauf des
 * Demo-Datengenerators: Bei EINEM Messkanal je Typ (so die bisherigen
 * Fixtures) tritt es nie auf, bei DREIEN bricht der Export mit
 * `duplicate key ... export_pseudonym_entitaet_typ_pseudonym_key` ab. Der
 * Export war also nur deshalb grün, weil ihm nie mehr als eine Entität je Typ
 * vorgelegt wurde.
 */
describe('Export-Pseudonyme — Integrationstests (ADR-0007 D6, A19)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let repository: NachweisExportPseudonymRepository;
  let txHost: TransactionHost<TransactionalAdapterTypeOrm>;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    repository = testApp.app.get(NachweisExportPseudonymRepository);
    txHost = testApp.app.get<TransactionHost<TransactionalAdapterTypeOrm>>(TransactionHost);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function inTransaktion<T>(fn: () => Promise<T>): Promise<T> {
    return txHost.withTransaction(Propagation.Required, fn);
  }

  it('vergibt PARALLEL angeforderte Pseudonyme desselben Typs verschieden', async () => {
    // Genau der Aufrufweg des Exports: `Promise.all` in EINER Transaktion.
    const refs = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

    const pseudonyme = await inTransaktion(() =>
      Promise.all(refs.map((ref) => repository.findeOderErstelle('messkanal', ref))),
    );

    expect(new Set(pseudonyme).size).toBe(refs.length);
    for (const pseudonym of pseudonyme) {
      expect(pseudonym).toMatch(/^MK-\d{4}$/);
    }
  });

  it('gibt fuer dieselbe Entitaet immer dasselbe Pseudonym zurueck', async () => {
    // D6: einmalig bei Erstexport vergeben, danach unveraenderlich. Ein
    // zweiter Export desselben Foerderjahres muss dieselbe Kennung tragen,
    // sonst waere die Zeitreihe der Behoerde nicht zusammenzufuehren.
    const ref = randomUUID();

    const erstes = await inTransaktion(() => repository.findeOderErstelle('endkunde', ref));
    const zweites = await inTransaktion(() => repository.findeOderErstelle('endkunde', ref));

    expect(zweites).toBe(erstes);
  });

  it('zaehlt je Entitaetstyp getrennt weiter', async () => {
    const kanal = await inTransaktion(() => repository.findeOderErstelle('messkanal', randomUUID()));
    const station = await inTransaktion(() => repository.findeOderErstelle('station', randomUUID()));

    expect(kanal.startsWith('MK-')).toBe(true);
    expect(station.startsWith('ST-')).toBe(true);
  });

  it('legt fuer parallele Anforderungen genau so viele Zeilen an, wie Entitaeten uebergeben wurden', async () => {
    const vorher = await dbClient.query(
      "SELECT count(*)::int AS n FROM nachweis.export_pseudonym WHERE entitaet_typ = 'system'",
    );
    const refs = [randomUUID(), randomUUID(), randomUUID()];

    await inTransaktion(() => Promise.all(refs.map((ref) => repository.findeOderErstelle('system', ref))));

    const nachher = await dbClient.query(
      "SELECT count(*)::int AS n FROM nachweis.export_pseudonym WHERE entitaet_typ = 'system'",
    );
    expect((nachher.rows[0] as { n: number }).n - (vorher.rows[0] as { n: number }).n).toBe(refs.length);
  });
});
