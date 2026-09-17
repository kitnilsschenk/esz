import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ClsService } from 'nestjs-cls';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  buildEinflussErkennungConnectionString,
  ensureEinflussErkennungLoginRole,
} from './test-support/einfluss-erkennung-role.test-support';
import { Tb03ErkennungRunnerModule } from './tb03-erkennung-runner.module';
import { Tb03ErkennungService } from './tb03-erkennung.service';

/**
 * Integrationstests gegen einen ECHTEN Postgres+TimescaleDB-Testcontainer mit
 * ALLEN `migrations/**` und ohne DB-Mock (`.claude/rules/tests.md`).
 *
 * **Der wichtigste Test ist der letzte.** Er beweist, dass die
 * Least-Privilege-Rolle wirkt: Der Lauf verbindet sich mit denselben
 * Credentials, mit denen er im Betrieb liefe, und der Versuch zu löschen
 * scheitert an PostgreSQL — nicht an einer Zusicherung im Code. Ohne diesen
 * Test wäre Auflage A20 eine Behauptung.
 *
 * Alle Daten sind synthetisch.
 */
describe('TB-03-Erkennung — Integrationstests', () => {
  let testApp: StammdatenTestApp;
  let db: Client;
  let runner: INestApplicationContext;
  let service: Tb03ErkennungService;
  let cls: ClsService;

  const endkundeId = randomUUID();
  const gesperrterEndkundeId = randomUUID();
  const systemId = randomUUID();
  const gesperrtesSystemId = randomUUID();

  /** Baseline endet am 30.09.2019 — `bis` ist exklusiv, Ankermonat ist also September 2019. */
  const BASELINE_BIS_EXKLUSIV = '2019-10-01';

  async function legeEndkundeMitSystemAn(
    kundeId: string,
    sysId: string,
    verarbeitungsStatus: string,
  ): Promise<void> {
    await db.query(`INSERT INTO energy.endkunde (id, verarbeitungs_status) VALUES ($1, $2)`, [
      kundeId,
      verarbeitungsStatus,
    ]);
    await db.query(
      `INSERT INTO energy.system (id, endkunde_id, bezeichnung, systemgrenze)
       VALUES ($1, $2, 'Synthetisches System', 'Gebaeude')`,
      [sysId, kundeId],
    );

    const messkonzeptId = randomUUID();
    const versionId = randomUUID();
    const mvetId = randomUUID();

    await db.query(`INSERT INTO energy.messkonzept (id, endkunde_id) VALUES ($1, $2)`, [messkonzeptId, kundeId]);
    await db.query(
      `INSERT INTO energy.messkonzept_version
           (id, messkonzept_id, version_nr, typ, systemgrenze, systembeschreibung,
            bereinigungsverfahren, messgeraete_wahl, geraeteerkennungs_verfahren, gueltig_von)
       VALUES ($1, $2, 1, 'vereinfacht', 'Gebaeude', 'synthetisch',
               'witterung', 'synthetisch', 'direktmessung', '2018-10-12')`,
      [versionId, messkonzeptId],
    );
    await db.query(
      `INSERT INTO energy.messkonzept_version_energietraeger (id, messkonzept_version_id, energietraeger, endkunde_id)
       VALUES ($1, $2, 'strom', $3)`,
      [mvetId, versionId, kundeId],
    );
    await db.query(
      `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
       VALUES ($1, $2, $3)`,
      [mvetId, sysId, kundeId],
    );
    await db.query(
      `INSERT INTO energy.baseline_periode (id, mvet_id, von, bis) VALUES ($1, $2, '2018-10-01', $3)`,
      [randomUUID(), mvetId, BASELINE_BIS_EXKLUSIV],
    );
  }

  async function legeIntervallAn(
    sysId: string,
    kundeId: string,
    groesseCode: string,
    abMonat: string,
    bisMonat: string | null,
    wert: { num?: number; code?: string },
  ): Promise<void> {
    await db.query(
      `INSERT INTO einfluss.intervall
           (id, endkunde_id, system_id, groesse_code, wert_num, wert_code,
            gueltig_ab_monat, gueltig_bis_monat, betroffener_typ, quelle_typ, rechtsgrundlage)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, 'endkunde', 'betriebsteam', 'art6_1b')`,
      [randomUUID(), kundeId, sysId, groesseCode, wert.num ?? null, wert.code ?? null, abMonat, bisMonat],
    );
  }

  async function zaehleAuditEreignisse(eventTyp: string): Promise<number> {
    const ergebnis = await db.query<{ anzahl: string }>(
      `SELECT count(*)::text AS anzahl FROM audit.event WHERE event_typ = $1`,
      [eventTyp],
    );
    return Number(ergebnis.rows[0]?.anzahl ?? '0');
  }

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();

    db = new Client({ connectionString: testApp.container.getConnectionUri() });
    await db.connect();

    // Die Login-Rolle des Laufs — ohne sie gäbe es keine zweite Verbindung.
    await ensureEinflussErkennungLoginRole(testApp.container);
    process.env['EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL'] = buildEinflussErkennungConnectionString(
      testApp.container,
    );

    await legeEndkundeMitSystemAn(endkundeId, systemId, 'aktiv');
    await legeEndkundeMitSystemAn(gesperrterEndkundeId, gesperrtesSystemId, 'gesperrt');

    // Baseline-Stand (gilt im Ankermonat September 2019) und die Änderung.
    await legeIntervallAn(systemId, endkundeId, 'nutzflaeche', '2018-10-01', '2021-01-01', { num: 100 });
    await legeIntervallAn(systemId, endkundeId, 'nutzflaeche', '2021-01-01', null, { num: 130 });

    // Derselbe Sachverhalt beim gesperrten Endkunden — darf NICHT erkannt werden.
    await legeIntervallAn(gesperrtesSystemId, gesperrterEndkundeId, 'nutzflaeche', '2018-10-01', '2021-01-01', {
      num: 100,
    });
    await legeIntervallAn(gesperrtesSystemId, gesperrterEndkundeId, 'nutzflaeche', '2021-01-01', null, {
      num: 130,
    });

    runner = await NestFactory.createApplicationContext(Tb03ErkennungRunnerModule, { logger: false });
    service = runner.get(Tb03ErkennungService);
    cls = runner.get(ClsService);
  }, 180_000);

  afterAll(async () => {
    await runner?.close();
    await db?.end();
    await stopStammdatenTestApp(testApp);
  });

  it('schreibt im Probelauf keinen Befund, aber das Einsicht-Ereignis (A19a, A24)', async () => {
    const vorher = await zaehleAuditEreignisse('einflussgroesse.stammdaten.einsicht');

    const ergebnis = await cls.run(() => service.probelauf());

    expect(ergebnis.modus).toBe('probelauf');
    expect(ergebnis.kandidaten).toBe(1);
    expect(ergebnis.geschrieben).toBe(0);

    const befunde = await db.query<{ anzahl: string }>('SELECT count(*)::text AS anzahl FROM einfluss.befund');
    expect(befunde.rows[0]?.anzahl).toBe('0');

    expect(await zaehleAuditEreignisse('einflussgroesse.stammdaten.einsicht')).toBe(vorher + 1);
  });

  it('weist die nicht maschinell ueberwachten Groessen aus (A25)', async () => {
    const ergebnis = await cls.run(() => service.probelauf());

    expect([...ergebnis.nichtUeberwachteGroessen].sort()).toEqual([
      'energietraeger_mix',
      'geraeteabschaffung',
    ]);
  });

  it('ueberspringt Systeme nicht aktiver Endkunden (A18)', async () => {
    const ergebnis = await cls.run(() => service.probelauf());

    expect(ergebnis.uebersprungenNichtAktiv).toBe(1);
    expect(ergebnis.gepruefteSysteme).toBe(1);
  });

  it('schreibt den Befund samt Audit-Ereignis und bleibt danach idempotent (A19b, A23)', async () => {
    const ereignisseVorher = await zaehleAuditEreignisse('einflussgroesse.schwellwert.ueberschritten');

    const erster = await cls.run(() => service.fuehreAus());
    expect(erster.geschrieben).toBe(1);

    const befund = await db.query<{
      system_id: string;
      groesse_code: string;
      zeitraum_von: string;
      zeitraum_bis: string;
      ueberschreitung_klasse: string;
      schwellwert_code: string;
    }>(
      `SELECT system_id::text, groesse_code,
              to_char(zeitraum_von,'YYYY-MM-DD') AS zeitraum_von,
              to_char(zeitraum_bis,'YYYY-MM-DD') AS zeitraum_bis,
              ueberschreitung_klasse, schwellwert_code
         FROM einfluss.befund`,
    );

    expect(befund.rows).toHaveLength(1);
    expect(befund.rows[0]?.system_id).toBe(systemId);
    expect(befund.rows[0]?.groesse_code).toBe('nutzflaeche');
    expect(befund.rows[0]?.zeitraum_von).toBe('2021-01-01');
    // Beginn der Änderung plus sieben Monate ("über ein halbes Jahr").
    expect(befund.rows[0]?.zeitraum_bis).toBe('2021-08-01');
    // +30 % = 3,0 x der 10-%-Schwelle.
    expect(befund.rows[0]?.ueberschreitung_klasse).toBe('stark_ueberschritten');
    // A13 — die Fassung steht im Code selbst.
    expect(befund.rows[0]?.schwellwert_code).toBe('tb03.nutzflaeche.10pct_halbjahr.v2022');

    expect(await zaehleAuditEreignisse('einflussgroesse.schwellwert.ueberschritten')).toBe(
      ereignisseVorher + 1,
    );

    // Zweiter Lauf: derselbe Bestand, kein zweiter Befund, kein zweites Ereignis.
    const zweiter = await cls.run(() => service.fuehreAus());
    expect(zweiter.geschrieben).toBe(0);
    expect(zweiter.bereitsVorhanden).toBe(1);

    const nachher = await db.query<{ anzahl: string }>('SELECT count(*)::text AS anzahl FROM einfluss.befund');
    expect(nachher.rows[0]?.anzahl).toBe('1');
    expect(await zaehleAuditEreignisse('einflussgroesse.schwellwert.ueberschritten')).toBe(
      ereignisseVorher + 1,
    );
  });

  it('kann mit der Rolle des Laufs weder loeschen noch aendern (A20)', async () => {
    const laufVerbindung = new Client({
      connectionString: process.env['EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL'],
    });
    await laufVerbindung.connect();

    try {
      // Lesen darf sie — sonst könnte sie nicht erkennen.
      const gelesen = await laufVerbindung.query('SELECT count(*) FROM einfluss.intervall');
      expect(gelesen.rowCount).toBe(1);

      await expect(laufVerbindung.query('DELETE FROM einfluss.intervall')).rejects.toThrow(
        /permission denied/i,
      );
      await expect(laufVerbindung.query('DELETE FROM einfluss.befund')).rejects.toThrow(/permission denied/i);
      await expect(
        laufVerbindung.query("UPDATE einfluss.befund SET ueberschreitung_klasse = 'schwelle_ueberschritten'"),
      ).rejects.toThrow(/permission denied/i);
      // Und an `energy.*` kommt sie gar nicht heran (A17 — Namensraum-Trennung).
      await expect(laufVerbindung.query('SELECT count(*) FROM energy.endkunde')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await laufVerbindung.end();
    }
  });

  /**
   * Security-Review-Nachbesserung zu V0079 (V0082). Vor V0082 hatte die
   * Rolle EXECUTE auf das generische `audit.append_event(...)` — PostgreSQL
   * kennt keine argumentscharfen GRANTs, sie hätte damit JEDEN aktiven
   * Event-Typ mit JEDEM `actor_sub` schreiben können, nicht nur die zwei im
   * Code verdrahteten TB-03-Codes. Dieser Test beweist das Gegenteil an der
   * echten Rolle — nicht an einer Zusicherung im Code — und MUSS fehlschlagen,
   * bis V0082 angewendet ist (Regressionstest, `.claude/rules/tests.md`).
   */
  it('kann ueber die Erkennungsrolle weder ein fremdes Event noch einen fremden actor_sub schreiben (V0082)', async () => {
    const laufVerbindung = new Client({
      connectionString: process.env['EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL'],
    });
    await laufVerbindung.connect();

    try {
      // Das generische audit.append_event(...) ist NICHT mehr erreichbar —
      // nur noch die beiden zweckgebundenen TB-03-Wrapper (V0082). Damit ist
      // insbesondere ein fremder Event-Typ (hier: eine PII-Einsicht bei
      // einem Endkunden) unerreichbar, egal welchen actor_sub der Aufrufer
      // versucht mitzugeben.
      await expect(
        laufVerbindung.query('SELECT * FROM audit.append_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
          'endkunde.pii.einsicht',
          'system',
          'ok',
          'jemand-fremdes',
          null,
          null,
          '{}',
          null,
          null,
          1,
        ]),
      ).rejects.toThrow(/permission denied/i);

      // Auch der EIGENE TB-03-Event-Code ist über den generischen Pfad nicht
      // mehr schreibbar — nur über den Wrapper, der actor_sub selbst
      // festlegt. Ein kompromittierter Host kann sich damit nicht mehr als
      // ein anderer Principal ausgeben.
      await expect(
        laufVerbindung.query('SELECT * FROM audit.append_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [
          'einflussgroesse.schwellwert.ueberschritten',
          'system',
          'ok',
          'ein-fremder-actor-sub',
          null,
          null,
          '{}',
          null,
          null,
          1,
        ]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await laufVerbindung.end();
    }
  });
});
