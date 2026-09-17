import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';
import { idempotencyKey, legeEndkundeAn } from '../../nachweis/test-support/nachweis-test-fixtures';

/**
 * `POST/DELETE /monitoring/ingest/herkunft` (ADR-0011 B2/D3) gegen eine ECHTE
 * Datenbank.
 *
 * **Warum dieser Test existiert.** `HerkunftMappingService` uebersetzt drei
 * Constraint-Verletzungen aus V0042 in praezise Antworten (zweimal 409,
 * einmal 400) — mit ausformulierten Meldungen, die dem Betriebspersonal
 * sagen, WELCHE Regel gegriffen hat. Ob diese Uebersetzung beim Aufrufer
 * ankommt, kann nur ein Test gegen die echte Datenbank zeigen: Ein Unit-Test
 * mit einem Repository-Mock prueft, dass der Service aus einem GEWORFENEN
 * Fehlercode die richtige Exception baut — nicht, ob dieser Fehlercode den
 * Weg durch Transaktion und Audit-Interceptor ueberhaupt uebersteht.
 *
 * Er tut es nicht, solange der Service `@Transactional()` statt
 * `@Transactional(Propagation.Nested)` fuehrt (ADR-0002 §18): Der
 * Constraint-Verstoss bricht dann die GESAMTE Request-Transaktion ab, der
 * Audit-Schreibpfad laeuft in „current transaction is aborted" — und aus
 * jeder der drei sorgfaeltig formulierten Antworten wird ein nacktes 500.
 * Genau das war der Zustand vor diesem Test.
 */
describe('Herkunfts-Zuordnung — Integrationstests (ADR-0011 B2/D3)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  async function legeStandortAn(endkundeId: string, bezeichnung: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung, adresse: 'Teststrasse 1, 12345 Musterstadt' });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  function anlegen(body: Record<string, unknown>): request.Test {
    return request(testApp.httpServer)
      .post('/monitoring/ingest/herkunft')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
  }

  it('legt eine Zuordnung an und liefert sie in der Liste', async () => {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `HM-Happy-${randomUUID().slice(0, 8)}`);
    const standortId = await legeStandortAn(endkundeId, 'Werk Happy');

    const angelegt = await anlegen({
      chirpstackTenantId: randomUUID(),
      chirpstackApplicationId: randomUUID(),
      endkundeId,
      standortId,
    });

    expect(angelegt.status).toBe(201);
    const id = (angelegt.body as { id: string }).id;

    const liste = await request(testApp.httpServer)
      .get('/monitoring/ingest/herkunft')
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(liste.status).toBe(200);
    expect((liste.body as { id: string }[]).some((eintrag) => eintrag.id === id)).toBe(true);
  });

  describe('Die drei Constraint-Uebersetzungen kommen als 4xx beim Aufrufer an', () => {
    it('meldet eine doppelt zugeordnete Application als 409 — nicht als 500', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `HM-App-${randomUUID().slice(0, 8)}`);
      const standortId = await legeStandortAn(endkundeId, 'Werk Doppelt');
      const applicationId = randomUUID();
      const tenantId = randomUUID();

      expect(
        (await anlegen({ chirpstackTenantId: tenantId, chirpstackApplicationId: applicationId, endkundeId, standortId }))
          .status,
      ).toBe(201);

      const zweite = await anlegen({
        chirpstackTenantId: tenantId,
        chirpstackApplicationId: applicationId,
        endkundeId,
        standortId,
      });

      expect(zweite.status).toBe(409);
      expect((zweite.body as { detail?: string }).detail).toContain('bereits zugeordnet');
    });

    it('meldet einen Tenant bei einem ZWEITEN Endkunden als 409 — nicht als 500', async () => {
      // Ein Tenant gehoert zu genau einem Endkunden. Waere es anders, liefen
      // fremde Messwerte unter der falschen Kennung ein.
      const ersterKunde = await legeEndkundeAn(testApp, betriebToken, `HM-T1-${randomUUID().slice(0, 8)}`);
      const zweiterKunde = await legeEndkundeAn(testApp, betriebToken, `HM-T2-${randomUUID().slice(0, 8)}`);
      const tenantId = randomUUID();

      expect(
        (
          await anlegen({
            chirpstackTenantId: tenantId,
            chirpstackApplicationId: randomUUID(),
            endkundeId: ersterKunde,
            standortId: await legeStandortAn(ersterKunde, 'Werk Eins'),
          })
        ).status,
      ).toBe(201);

      const fremd = await anlegen({
        chirpstackTenantId: tenantId,
        chirpstackApplicationId: randomUUID(),
        endkundeId: zweiterKunde,
        standortId: await legeStandortAn(zweiterKunde, 'Werk Zwei'),
      });

      expect(fremd.status).toBe(409);
      expect((fremd.body as { detail?: string }).detail).toContain('ANDEREN Endkunden');
    });

    it('meldet einen fremden Standort als 400 — nicht als 500', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `HM-S1-${randomUUID().slice(0, 8)}`);
      const andererKunde = await legeEndkundeAn(testApp, betriebToken, `HM-S2-${randomUUID().slice(0, 8)}`);
      const fremderStandort = await legeStandortAn(andererKunde, 'Fremdes Werk');

      const response = await anlegen({
        chirpstackTenantId: randomUUID(),
        chirpstackApplicationId: randomUUID(),
        endkundeId,
        standortId: fremderStandort,
      });

      expect(response.status).toBe(400);
      expect((response.body as { detail?: string }).detail).toContain('gehoert nicht zu diesem Endkunden');
    });
  });

  it('gibt beim Entfernen die Zeile zurueck, die es gleich nicht mehr gibt', async () => {
    // Der Audit-Kontext (V0043) braucht die vier Fach-Kennungen der geloeschten
    // Zeile — sonst waere aus dem Protokoll nicht rekonstruierbar, welche
    // Zuordnung verschwunden ist.
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `HM-Del-${randomUUID().slice(0, 8)}`);
    const standortId = await legeStandortAn(endkundeId, 'Werk Entfernen');
    const applicationId = randomUUID();
    const angelegt = await anlegen({
      chirpstackTenantId: randomUUID(),
      chirpstackApplicationId: applicationId,
      endkundeId,
      standortId,
    });
    expect(angelegt.status).toBe(201);
    const id = (angelegt.body as { id: string }).id;

    const entfernt = await request(testApp.httpServer)
      .delete(`/monitoring/ingest/herkunft/${id}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey());

    expect(entfernt.status).toBe(200);
    expect(entfernt.body).toMatchObject({ id, endkundeId, standortId, chirpstackApplicationId: applicationId });

    // Und danach ist die Application wieder frei — genau der Weg, den der
    // Service anstelle eines „Aendern" vorsieht.
    const erneut = await anlegen({
      chirpstackTenantId: randomUUID(),
      chirpstackApplicationId: applicationId,
      endkundeId,
      standortId,
    });
    expect(erneut.status).toBe(201);
  });

  it('meldet das Entfernen einer unbekannten Zuordnung als 404', async () => {
    const response = await request(testApp.httpServer)
      .delete(`/monitoring/ingest/herkunft/${randomUUID()}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey());

    expect(response.status).toBe(404);
  });
});
