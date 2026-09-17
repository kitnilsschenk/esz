import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für den `MesskonzeptController`
 * (`/stammdaten/endkunden/{endkundeId}/messkonzept/versionen`) — schließt
 * die Merge-Blocker-Lücke aus dem Phase-4-Review. Muster 1:1 aus
 * `stammdaten.integration.spec.ts` übernommen. Deckt zusätzlich die
 * Append-only-Versionierungs-Invariante ab (Linie 3: eine neue Version
 * SCHLIESST die bisherige, statt sie zu editieren).
 */
describe('MesskonzeptController — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);
  }, 120_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: { name: `Testkunde Musterfirma ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  function gueltigeVersionsDto(aenderungsgrund?: string): Record<string, unknown> {
    return {
      typ: 'standard',
      systemgrenze: 'Gebäude Musterhalle, gesamtes Erdgeschoss',
      systembeschreibung: 'Testbeschreibung der Systemgrenze',
      bereinigungsverfahren: 'Testverfahren zur Bereinigung',
      messgeraeteWahl: 'Testwahl der Messgeräte',
      geraeteerkennungsVerfahren: 'Testverfahren zur Geräteerkennung',
      ...(aenderungsgrund !== undefined ? { aenderungsgrund } : {}),
      energietraeger: [{ energietraeger: 'strom' }],
    };
  }

  async function legeVersionAn(endkundeId: string, aenderungsgrund?: string): Promise<{ versionNr: number }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(gueltigeVersionsDto(aenderungsgrund));
    expect(response.status).toBe(201);
    return { versionNr: (response.body as { versionNr: number }).versionNr };
  }

  describe('Messkonzept-Version — Anlegen/Lesen (Append-only, Linie 3)', () => {
    it('POST legt die ERSTE Version (versionNr=1) an, wenn der Endkunde existiert (Happy Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Alpha');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/1`);
      expect(response.body).toMatchObject({ versionNr: 1, typ: 'standard', gueltigBis: null });
      expect((response.body as { energietraeger: unknown[] }).energietraeger).toHaveLength(1);
    });

    it('POST legt bei einem ZWEITEN Aufruf versionNr=2 an UND schließt Version 1 (gueltigBis gesetzt, Append-only)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Gamma');
      await legeVersionAn(endkundeId);

      const zweiteResponse = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto('Anpassung der Systemgrenze'));

      expect(zweiteResponse.status).toBe(201);
      expect(zweiteResponse.body).toMatchObject({ versionNr: 2, gueltigBis: null });

      const ersteVersionResponse = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/1`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(ersteVersionResponse.status).toBe(200);
      expect((ersteVersionResponse.body as { gueltigBis: string | null }).gueltigBis).not.toBeNull();
    });

    it('GET Version liefert 404 fuer eine unbekannte Versionsnummer', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Delta');
      await legeVersionAn(endkundeId);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/99`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Version liefert 404, wenn der Endkunde nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen/1`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Liste liefert 404, wenn der Endkunde nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Liste liefert eine leere Seite, wenn (noch) keine Version angelegt wurde', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Epsilon');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ daten: [] });
    });
  });

  describe('M1 — Rolle × Route-Matrix (Messkonzept)', () => {
    it('anonym (kein Token) -> 401 auf GET Liste', async () => {
      const response = await request(testApp.httpServer).get(
        `/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`,
      );
      expect(response.status).toBe(401);
    });

    it('anonym (kein Token) -> 401 auf POST', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`)
        .send(gueltigeVersionsDto());
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET Liste (admin ist KEINE Stammdaten-Rolle)', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET Liste', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Zeta');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 200 auf GET Version (Detail)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Eta');
      await legeVersionAn(endkundeId);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/1`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('betrieb -> 201 auf POST (Referenz-Happy-Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Iota');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());
      expect(response.status).toBe(201);
    });

  });

  /**
   * REGRESSIONSTEST (Bug gefunden beim Schreiben dieser Suite, gefixt am
   * 2026-07-14 — ADR-0008 §30.1):
   *
   * `MesskonzeptController.anlegen()` setzte
   *   kontextExtractors: { version_nr: ({ result }) => result?.versionNr ?? null }
   * Auf JEDEM Fehlerpfad (Endkunde 404, invalides DTO 400, RBAC-Deny 403,
   * fehlender Idempotency-Key 400) ist `result === undefined`, der Extraktor
   * lieferte also `kontext.version_nr = null`. Der DB-Seal-Trigger
   * `audit.event_seal()` (V0003, Zeile ~696-699) akzeptiert aber NUR
   * `jsonb_typeof(...) IN ('string','number','boolean')` — JSON `null`
   * (`jsonb_typeof` liefert `'null'`) faellt NICHT darunter und die INSERT
   * wurde mit `RAISE EXCEPTION 'audit: kontext-Wert nicht skalar oder ueber
   * Cap (%)'` abgelehnt. Der `AuditActionInterceptor.emit()`-Aufruf im
   * `catch`-Zweig warf dann SELBST (DB-Exception) und maskierte den korrekten
   * Statuscode — JEDER Fehlerfall lieferte 500 statt 404/400/403.
   *
   * FIX (Kandidat (a)): Extraktor `result?.versionNr` OHNE `?? null` — auf
   * Fehlerpfaden liefert er `undefined`, `buildKontext()` laesst den Key weg,
   * kein JSON `null` erreicht den Trigger. Diese Tests asserten das
   * vertraglich korrekte Verhalten (404/400/403) und waren vor dem Fix rot
   * (`.claude/rules/tests.md`: "Jeder Bug-Fix hat einen Regressionstest, der
   * vor Fix rot war"). OFFEN als Folgeauftrag (ADR-0008 §29(C), `audit-trail-
   * engineer`): App-/DB-Inkonsistenz — `AuditKontextValue` erlaubt `null`
   * (`audit-envelope.dto.ts` `KontextIsScalarMapConstraint`), der DB-Trigger
   * verbietet es; solange das nicht vereinheitlicht ist, bleibt JSON `null` in
   * JEDEM kontext-Extraktor eine latente 500-Falle.
   */
  describe('POST-Fehlerpfade liefern den korrekten Statuscode (Regression: Audit-Kontext darf kein JSON null emittieren)', () => {
    it('POST -> 404, wenn der referenzierte Endkunde nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('POST -> 400, wenn energietraeger ein leeres Array ist (ArrayMinSize:1)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Beta');
      const invalideDto = { ...gueltigeVersionsDto(), energietraeger: [] };

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(invalideDto);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('admin -> 403 (admin ist KEINE Stammdaten-Rolle; der Deny-Fehlerpfad auditiert sauber)', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${randomUUID()}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf POST (DS-01: Auditor hat keinen Schreibzugriff)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Theta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());
      expect(response.status).toBe(403);
    });

    it('fehlender Idempotency-Key -> 400', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Kappa');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send(gueltigeVersionsDto());
      expect(response.status).toBe(400);
    });
  });

  describe('TB-02 — Baseline-Beleg als externer Verweis (V0065)', () => {
    it('nimmt Anzahl, Aktenzeichen und Ablageort entgegen und gibt sie zurueck', async () => {
      const endkunde = await legeEndkundeAn('BelegOk');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkunde.id}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          ...gueltigeVersionsDto(),
          energietraeger: [
            {
              energietraeger: 'strom',
              baselineWert: 12000,
              baselineEinheit: 'kWh',
              baselineAbrechnungenAnzahl: 3,
              baselineBelegAktenzeichen: 'AZ-2024-0815',
              baselineBelegAblageort: 'Aktenordner Baseline 2024, Register 7',
            },
          ],
        });

      expect(response.status).toBe(201);
      const eintrag = (response.body as { energietraeger: Record<string, unknown>[] }).energietraeger[0];
      expect(eintrag?.['baselineAbrechnungenAnzahl']).toBe(3);
      expect(eintrag?.['baselineBelegAktenzeichen']).toBe('AZ-2024-0815');
      expect(eintrag?.['baselineBelegAblageort']).toBe('Aktenordner Baseline 2024, Register 7');
    });

    it('weist zwei Abrechnungen ohne Begruendung mit 400 ab, nicht mit einem Serverfehler', async () => {
      // Der DB-CHECK ist der Backstop; er wuerde als 500 durchschlagen. Der
      // Betrieb bekaeme "interner Fehler" fuer ein ausgefuelltes Formular.
      const endkunde = await legeEndkundeAn('BelegFehlt');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkunde.id}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          ...gueltigeVersionsDto(),
          energietraeger: [{ energietraeger: 'strom', baselineAbrechnungenAnzahl: 2 }],
        });

      expect(response.status).toBe(400);
      expect((response.body as { detail?: string }).detail).toMatch(/TB-02/);
    });

    it('haelt die Auflage auch dann, wenn jemand an der API vorbei schreibt (DB-CHECK)', async () => {
      // Zweite Verteidigungslinie: Eine Auflage gehoert in die Datenbank und
      // nicht nur in eine Formularvalidierung, die ein zweiter Schreibpfad
      // umgehen kann.
      const endkunde = await legeEndkundeAn('BelegDbCheck');
      const angelegt = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkunde.id}/messkonzept/versionen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(gueltigeVersionsDto());
      expect(angelegt.status).toBe(201);

      const client = new Client({ connectionString: testApp.container.getConnectionUri() });
      await client.connect();
      try {
        await expect(
          client.query(
            `UPDATE energy.messkonzept_version_energietraeger
                SET baseline_abrechnungen_anzahl = 2, baseline_begruendung = NULL
              WHERE endkunde_id = $1`,
            [endkunde.id],
          ),
        ).rejects.toThrow(/ck_mvet_baseline_begruendung_bei_wenigen_abrechnungen/);
      } finally {
        await client.end();
      }
    });
  });
});
