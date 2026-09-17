import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from './test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from './test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer,
 * `migrations/V0001`-`V0005` angewendet, KEIN DB-Mock, `.claude/rules/
 * tests.md`) für das `StammdatenModule` (ADR-0008 Teil B, Phase 4).
 *
 * Deckt ab:
 *   - Endkunde-NESTED-Tx-Create (identity+energy atomar, D7/D8) +
 *     PII-Projektion (D6: betrieb sieht PII bei aktiv, compliance-auditor
 *     NIE, Listen sind schema-erzwungen PII-frei, Linie 2).
 *   - Referenzkonsistenz-SELECT vor Nutzungsverhältnis-Insert (B2).
 *   - M1 Rolle×Route-Matrix (betrieb/compliance-auditor/admin/anonym).
 *
 * EINE gemeinsame App-/Container-Instanz für alle `describe`-Blöcke (Docker-
 * Ressourcen-/Laufzeit-Budget) — Testdaten sind ausschließlich synthetisch
 * (F6-Bedingung 2/M6): `@example.invalid`-Domains, "Testkunde"/
 * "Musterstraße"-Marker.
 */
describe('Stammdaten — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;
  // Verifikations-Client GEGEN `audit.event` (analog `transaction-chain.
  // integration.spec.ts`) — bewusst NICHT ueber `AuditService`/den
  // Interceptor selbst, sondern der tatsaechlich per `audit.append_event(...)`
  // committete Append-Pfad (echte DB-Zeile, kein Mock).
  let auditClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);

    auditClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await auditClient.connect();
  }, 120_000);

  afterAll(async () => {
    await auditClient?.end().catch(() => undefined);
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
        stammdatenPii: {
          name: `Testkunde Musterfirma ${namenSuffix}`,
          anschrift: 'Musterstraße 1, 12345 Musterstadt',
          kontakt: 'kontakt@example.invalid',
        },
      });

    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  describe('Endkunde — NESTED-Tx-Create + PII-Projektion (D6/D7/D8)', () => {
    it('POST legt einen Endkunden an; die Response enthält die PII im Klartext (nur betrieb erreicht die Route)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          stammdatenPii: {
            name: 'Testkunde Musterfirma Alpha',
            anschrift: 'Musterstraße 1, 12345 Musterstadt',
            kontakt: 'kontakt@example.invalid',
          },
          // `vonWissAuswertungAusgenommen` wird hier NICHT mehr mitgesendet:
          // Seit AW-27 antwortet die Route darauf mit 400. Die DE-04-Ausnahme
          // folgt einer Erklaerung (POST /consent/widersprueche), nicht einem
          // Feld im Anlege-Formular.
        });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/endkunden/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({
        verarbeitungsStatus: 'aktiv',
        stammdatenPii: {
          name: 'Testkunde Musterfirma Alpha',
          anschrift: 'Musterstraße 1, 12345 Musterstadt',
          kontakt: 'kontakt@example.invalid',
        },
      });
    });

    it('GET Detail: betrieb sieht die entschlüsselte PII, compliance-auditor NIE (D2/D6-Auflösung)', async () => {
      const { id } = await legeEndkundeAn('Beta');

      const alsBetrieb = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(alsBetrieb.status).toBe(200);
      expect((alsBetrieb.body as { stammdatenPii: unknown }).stammdatenPii).not.toBeNull();

      const alsAuditor = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${id}`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(alsAuditor.status).toBe(200);
      expect((alsAuditor.body as { stammdatenPii: unknown }).stammdatenPii).toBeNull();
    });

    it('GET Liste enthält KEIN PII-Feld (Linie 2, schema-erzwungen — PII-Leak-Scan, M4/M6)', async () => {
      await legeEndkundeAn('Gamma');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('Testkunde');
      expect(serialized).not.toContain('Musterstraße');
      expect(serialized).not.toContain('name');
      expect(serialized).not.toContain('anschrift');
    });

    /** Hilfsaufruf fuer die Aktions-Route (ADR-0007 A11.1 — Grund ist Pflicht). */
    // `neuerhebungFortsetzen` (Auflage C-8) ist nur bei lit. b / lit. d
    // erlaubt und dort Pflicht. Die Vorgabe `true` haelt die Tests, die
    // sich mit etwas anderem befassen, frei von diesem Detail; wer die
    // Entscheidung selbst prueft, uebergibt sie ausdruecklich.
    async function sperre(id: string, grund: string, neuerhebungFortsetzen = true) {
      return request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${id}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(
          grund === 'art18_1b_unrechtmaessig' || grund === 'art18_1d_widerspruch'
            ? { grund, neuerhebungFortsetzen }
            : { grund },
        );
    }

    it('POST sperren ist bei GLEICHEM Grund idempotent und liefert Grund + Zeitpunkt zurueck (Art. 18, kein Hard-Delete)', async () => {
      const { id } = await legeEndkundeAn('Delta');

      const erste = await sperre(id, 'art18_1a_richtigkeit');
      expect(erste.status).toBe(200);
      const ersterBody = erste.body as { verarbeitungsStatus: string; einschraenkungGrundCode: string; gesperrtSeit: string };
      expect(ersterBody.verarbeitungsStatus).toBe('gesperrt');
      expect(ersterBody.einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
      expect(ersterBody.gesperrtSeit).not.toBeNull();

      const zweite = await sperre(id, 'art18_1a_richtigkeit');
      expect(zweite.status).toBe(200);
      const zweiterBody = zweite.body as { verarbeitungsStatus: string; einschraenkungGrundCode: string; gesperrtSeit: string };
      expect(zweiterBody.verarbeitungsStatus).toBe('gesperrt');
      expect(zweiterBody.einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
      // Unveraendert: der zweite Aufruf hat NICHT erneut geschrieben.
      expect(zweiterBody.gesperrtSeit).toBe(ersterBody.gesperrtSeit);
    });

    // Regressionstest zu ADR-0007 A11.2. Vor dem C8-Umbau lief `markGesperrt()`
    // bei bereits gesperrtem Subjekt ins Leere und die Antwort war trotzdem
    // 200 — mit Pflicht-Grund waere der mitgelieferte Grund damit STILL
    // verworfen worden. Genau das darf nicht passieren.
    it('POST sperren lehnt einen ABWEICHENDEN Grund mit 409 ab und laesst den bestehenden Grund unangetastet', async () => {
      const { id } = await legeEndkundeAn('Epsilon');

      const erste = await sperre(id, 'art18_1a_richtigkeit');
      expect(erste.status).toBe(200);

      const abweichend = await sperre(id, 'art18_1d_widerspruch');
      expect(abweichend.status).toBe(409);

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(detail.status).toBe(200);
      expect((detail.body as { einschraenkungGrundCode: string }).einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
    });

    it('POST sperren weist einen fehlenden oder unbekannten Grund an der DTO-Grenze mit 400 ab', async () => {
      const { id } = await legeEndkundeAn('Zeta');

      const ohneGrund = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${id}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});
      expect(ohneGrund.status).toBe(400);

      // Kein fuenfter Auffangcode (A11.1) — „sonstiges" ist kein Art.-18-Tatbestand.
      const erfunden = await sperre(id, 'sonstiges');
      expect(erfunden.status).toBe(400);
    });

    // ADR-0007 A11.5, Positivlisten-Test analog A19. Der eigentliche Schutz ist
    // NICHT eine Verbotsliste, sondern die Whitelist `erlaubte_kontext_keys`
    // mit dem fail-closed `audit.event_seal()`-Trigger (V0003) — dieser Test
    // belegt BEIDE Richtungen: der erlaubte Schluessel kommt an, und die Zeile
    // traegt NICHTS darueber hinaus (kein Antragsteller, kein Freitext, kein
    // Belegverweis). Ohne V0032 wuerde der Trigger den INSERT abweisen und
    // schon der `sperre()`-Aufruf oben fehlschlagen.
    it('POST sperren schreibt den Grund in die ECHTE Audit-Zeile — und nur ihn (A11.5)', async () => {
      const { id } = await legeEndkundeAn('AuditSperrgrund');

      const antwort = await sperre(id, 'art18_1c_rechtsverteidigung_betroffener');
      expect(antwort.status).toBe(200);

      const auditRow = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.stammdaten.gesperrt' AND objekt_ref = $1",
        [id],
      );

      expect(auditRow.rowCount).toBe(1);
      const { kontext } = auditRow.rows[0] as { kontext: Record<string, unknown> };
      expect(kontext['einschraenkung_grund_code']).toBe('art18_1c_rechtsverteidigung_betroffener');
      expect(kontext['synthetic']).toBe(true);
      expect(Object.keys(kontext).sort()).toEqual(['einschraenkung_grund_code', 'synthetic']);
    });


    /** Schritt 1 des Entsperr-Vorgangs (Art. 18 Abs. 3, ADR-0007 A11.10). */
    async function unterrichte(id: string, kanal: string) {
      return request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${id}/einschraenkung-unterrichtung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ kanal });
    }

    /** Schritt 2. */
    async function entsperre(id: string) {
      return request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${id}/entsperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
    }

    // DIE zentrale Zusicherung: Art. 18 Abs. 3 verlangt Unterrichtung VOR
    // Aufhebung. Ohne den Nachweis muss die Aufhebung scheitern — sonst waere
    // die Reihenfolge eine Absichtserklaerung, keine Kontrolle.
    it('lehnt das Entsperren ab, solange nicht unterrichtet wurde, und laesst die Sperre unangetastet', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(409);

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((detail.body as { verarbeitungsStatus: string }).verarbeitungsStatus).toBe('gesperrt');
      expect((detail.body as { einschraenkungGrundCode: string }).einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
    });

    it('hebt nach dokumentierter Unterrichtung auf und nullt Grund und Zeitpunkt gemeinsam', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await sperre(id, 'art18_1c_rechtsverteidigung_betroffener')).status).toBe(200);
      expect((await unterrichte(id, 'postalisch')).status).toBe(200);

      const aufgehoben = await entsperre(id);
      expect(aufgehoben.status).toBe(200);
      const body = aufgehoben.body as {
        verarbeitungsStatus: string;
        einschraenkungGrundCode: string | null;
        gesperrtSeit: string | null;
      };
      expect(body.verarbeitungsStatus).toBe('aktiv');
      expect(body.einschraenkungGrundCode).toBeNull();
      expect(body.gesperrtSeit).toBeNull();
    });

    // Der Kern der `gesperrt_seit`-Bindung: ein Nachweis aus einer FRUEHEREN
    // Einschraenkung darf eine SPAETERE nicht aufsperren.
    it('laesst einen Nachweis aus einer frueheren Einschraenkung eine neue NICHT aufheben', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
      expect((await unterrichte(id, 'telefonisch')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(200);

      // Zweite, neue Einschraenkung — der alte Nachweis haengt an der alten
      // `gesperrt_seit` und darf hier nicht greifen.
      expect((await sperre(id, 'art18_1d_widerspruch')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(409);
    });

    it('lehnt eine Unterrichtung ab, wenn gar keine Einschraenkung besteht', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await unterrichte(id, 'elektronisch')).status).toBe(409);
    });

    it('weist einen unbekannten Kanal an der DTO-Grenze ab (geschlossene Liste, kein Freitext)', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
      expect((await unterrichte(id, 'brieftaube')).status).toBe(400);
    });

    it('protokolliert beide Schritte mit genau den erlaubten Kontext-Schluesseln (V0036)', async () => {
      const { id } = await legeEndkundeAn(`Entsperr${String(Math.trunc(performance.now() * 1000))}`);

      expect((await sperre(id, 'art18_1b_unrechtmaessig')).status).toBe(200);
      expect((await unterrichte(id, 'persoenlich')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(200);

      const unterrichtung = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.stammdaten.einschraenkung_unterrichtet' AND objekt_ref = $1",
        [id],
      );
      expect(unterrichtung.rowCount).toBe(1);
      const uKontext = (unterrichtung.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(uKontext['kanal']).toBe('persoenlich');
      expect(Object.keys(uKontext).sort()).toEqual(['kanal', 'synthetic']);

      const entsperrt = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.stammdaten.entsperrt' AND objekt_ref = $1",
        [id],
      );
      expect(entsperrt.rowCount).toBe(1);
      const eKontext = (entsperrt.rows[0] as { kontext: Record<string, unknown> }).kontext;
      // Der Grund des AUFGEHOBENEN Vorgangs — nach der Aufhebung ist er in
      // energy.* genullt, diese Zeile ist der einzige Beleg.
      expect(eKontext['einschraenkung_grund_code']).toBe('art18_1b_unrechtmaessig');
      expect(Object.keys(eKontext).sort()).toEqual(['einschraenkung_grund_code', 'synthetic']);
    });

    // ----------------------------------------------------------------
    // Auflage C-8 (ADR-0012 Stufe C) — die Entscheidung ueber die WEITERE
    // ERHEBUNG. Sie ist der Punkt, an dem eine Art.-18-Sperre auf den
    // Messpfad durchschlaegt; bis V0087 fiel sie implizit und zugunsten des
    // Weitermessens.
    // ----------------------------------------------------------------
    describe('Auflage C-8 — Entscheidung ueber die weitere Erhebung', () => {
      it('verlangt die Entscheidung bei lit. b und sperrt OHNE sie nicht', async () => {
        const { id } = await legeEndkundeAn(`C8a${String(Math.trunc(performance.now() * 1000))}`);

        const ohne = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${id}/sperren`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ grund: 'art18_1b_unrechtmaessig' });

        expect(ohne.status).toBe(400);

        // Entscheidend: Es wurde auch nichts halb geschrieben.
        const zeile = await auditClient.query(
          'SELECT verarbeitungs_status FROM energy.endkunde WHERE id = $1',
          [id],
        );
        expect((zeile.rows[0] as { verarbeitungs_status: string }).verarbeitungs_status).toBe('aktiv');
      });

      it('nimmt bei lit. a KEINE Entscheidung entgegen — sie waere eine Aussage, die niemand getroffen hat', async () => {
        const { id } = await legeEndkundeAn(`C8b${String(Math.trunc(performance.now() * 1000))}`);

        const ueberfluessig = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${id}/sperren`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ grund: 'art18_1a_richtigkeit', neuerhebungFortsetzen: false });

        expect(ueberfluessig.status).toBe(400);
      });

      it('speichert die Entscheidung und gibt sie zurueck (lit. d, gegen die Fortsetzung)', async () => {
        const { id } = await legeEndkundeAn(`C8c${String(Math.trunc(performance.now() * 1000))}`);

        const antwort = await sperre(id, 'art18_1d_widerspruch', false);
        expect(antwort.status).toBe(200);
        expect((antwort.body as { neuerhebungFortsetzen: boolean | null }).neuerhebungFortsetzen).toBe(false);

        const zeile = await auditClient.query(
          'SELECT neuerhebung_fortsetzen FROM energy.endkunde WHERE id = $1',
          [id],
        );
        expect((zeile.rows[0] as { neuerhebung_fortsetzen: boolean | null }).neuerhebung_fortsetzen).toBe(false);
      });

      it('lehnt eine ABWEICHENDE Entscheidung bei gleichem Grund mit 409 ab statt sie still zu verwerfen', async () => {
        const { id } = await legeEndkundeAn(`C8d${String(Math.trunc(performance.now() * 1000))}`);

        expect((await sperre(id, 'art18_1b_unrechtmaessig', true)).status).toBe(200);
        expect((await sperre(id, 'art18_1b_unrechtmaessig', false)).status).toBe(409);

        // Der gespeicherte Wert bleibt der erste — der 409 ist keine halbe
        // Schreibaktion.
        const zeile = await auditClient.query(
          'SELECT neuerhebung_fortsetzen FROM energy.endkunde WHERE id = $1',
          [id],
        );
        expect((zeile.rows[0] as { neuerhebung_fortsetzen: boolean | null }).neuerhebung_fortsetzen).toBe(true);
      });

      it('protokolliert die Entscheidung im Sperr-Ereignis (V0089) — und laesst den Schluessel bei lit. a weg', async () => {
        const mitFrage = await legeEndkundeAn(`C8e${String(Math.trunc(performance.now() * 1000))}`);
        const ohneFrage = await legeEndkundeAn(`C8f${String(Math.trunc(performance.now() * 1000))}`);

        expect((await sperre(mitFrage.id, 'art18_1b_unrechtmaessig', false)).status).toBe(200);
        expect((await sperre(ohneFrage.id, 'art18_1a_richtigkeit')).status).toBe(200);

        const mit = await auditClient.query(
          "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.stammdaten.gesperrt' AND objekt_ref = $1",
          [mitFrage.id],
        );
        expect(mit.rowCount).toBe(1);
        const mKontext = (mit.rows[0] as { kontext: Record<string, unknown> }).kontext;
        expect(mKontext['neuerhebung_fortsetzen']).toBe('false');
        expect(Object.keys(mKontext).sort()).toEqual([
          'einschraenkung_grund_code',
          'neuerhebung_fortsetzen',
          'synthetic',
        ]);

        const ohne = await auditClient.query(
          "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.stammdaten.gesperrt' AND objekt_ref = $1",
          [ohneFrage.id],
        );
        expect(ohne.rowCount).toBe(1);
        // Kein `neuerhebung_fortsetzen: 'null'` — der Schluessel fehlt ganz.
        expect(Object.keys((ohne.rows[0] as { kontext: Record<string, unknown> }).kontext).sort()).toEqual([
          'einschraenkung_grund_code',
          'synthetic',
        ]);
      });

      it('nullt die Entscheidung beim Entsperren mit — sie gehoert zu GENAU DIESER Einschraenkung', async () => {
        const { id } = await legeEndkundeAn(`C8g${String(Math.trunc(performance.now() * 1000))}`);

        expect((await sperre(id, 'art18_1b_unrechtmaessig', false)).status).toBe(200);
        expect((await unterrichte(id, 'postalisch')).status).toBe(200);
        expect((await entsperre(id)).status).toBe(200);

        const zeile = await auditClient.query(
          'SELECT neuerhebung_fortsetzen FROM energy.endkunde WHERE id = $1',
          [id],
        );
        expect((zeile.rows[0] as { neuerhebung_fortsetzen: boolean | null }).neuerhebung_fortsetzen).toBeNull();
      });
      it('meldet die Erhebungs-Entscheidung im eigenen Monitoring-Bericht (R-0008)', async () => {
        const gestoppt = await legeEndkundeAn(`C8h${String(Math.trunc(performance.now() * 1000))}`);
        const laeuft = await legeEndkundeAn(`C8i${String(Math.trunc(performance.now() * 1000))}`);

        expect((await sperre(gestoppt.id, 'art18_1b_unrechtmaessig', false)).status).toBe(200);
        expect((await sperre(laeuft.id, 'art18_1d_widerspruch', true)).status).toBe(200);

        const bericht = await request(testApp.httpServer)
          .get('/monitoring/erhebungs-entscheidungen')
          .set('Authorization', `Bearer ${betriebToken}`);

        expect(bericht.status).toBe(200);
        const body = bericht.body as {
          erhebungGestopptAnzahl: number;
          entscheidungOffenAnzahl: number;
          items: { subjektId: string; lage: string }[];
        };

        const lageVon = (id: string): string | undefined => body.items.find((item) => item.subjektId === id)?.lage;
        expect(lageVon(gestoppt.id)).toBe('erhebung_gestoppt');
        expect(lageVon(laeuft.id)).toBe('erhebung_laeuft');
        expect(body.erhebungGestopptAnzahl).toBeGreaterThanOrEqual(1);

        // Der Bericht traegt KEINE PII — nur Pseudonyme, Code, Zeit, Lage.
        expect(JSON.stringify(body)).not.toContain('C8h');
        expect(JSON.stringify(body)).not.toContain('C8i');
      });
    });

    // ADR-0007 A11.11 — Wiedervorlage der BEFRISTETEN Tatbestaende.
    describe('Fristenueberwachung', () => {
      async function fristen(schwelleTage?: number) {
        const req = request(testApp.httpServer)
          .get('/monitoring/einschraenkung-fristen')
          .set('Authorization', `Bearer ${betriebToken}`);
        return schwelleTage === undefined ? req : req.query({ schwelleTage });
      }

      it('fuehrt eine 1a-Sperre, aber KEINE 1b-Sperre (nur befristete Tatbestaende)', async () => {
        const { id: befristet } = await legeEndkundeAn('Frist1a');
        const { id: unbefristet } = await legeEndkundeAn('Frist1b');

        expect((await sperre(befristet, 'art18_1a_richtigkeit')).status).toBe(200);
        expect((await sperre(unbefristet, 'art18_1b_unrechtmaessig')).status).toBe(200);

        const antwort = await fristen();
        expect(antwort.status).toBe(200);
        const ids = (antwort.body as { items: { subjektId: string }[] }).items.map((i) => i.subjektId);
        expect(ids).toContain(befristet);
        // 1b endet nicht von selbst — die betroffene Person hat die Loeschung
        // abgelehnt und die Einschraenkung VERLANGT.
        expect(ids).not.toContain(unbefristet);
      });

      it('meldet eine frische Sperre als nicht ueberfaellig und bei Schwelle 1 als ueberfaellig', async () => {
        const { id } = await legeEndkundeAn('FristSchwelle');
        expect((await sperre(id, 'art18_1d_widerspruch')).status).toBe(200);

        const streng = await fristen(1);
        const zeileStreng = (streng.body as { items: { subjektId: string; ueberfaellig: boolean }[] }).items.find(
          (i) => i.subjektId === id,
        );
        // tageOffen ist 0 -> bei Schwelle 1 noch nicht ueberfaellig.
        expect(zeileStreng?.ueberfaellig).toBe(false);

        const grosszuegig = await fristen(3650);
        const zeileGross = (grosszuegig.body as { items: { subjektId: string; ueberfaellig: boolean }[] }).items.find(
          (i) => i.subjektId === id,
        );
        // Die Zeile erscheint AUCH, wenn sie nicht ueberfaellig ist — sonst
        // saehe die Sachbearbeitung nie, was demnaechst faellig wird.
        expect(zeileGross?.ueberfaellig).toBe(false);
        expect(zeileGross).toBeDefined();
      });

      it('nimmt eine aufgehobene Einschraenkung aus der Wiedervorlage', async () => {
        const { id } = await legeEndkundeAn('FristAufgehoben');
        expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
        expect((await unterrichte(id, 'postalisch')).status).toBe(200);
        expect((await entsperre(id)).status).toBe(200);

        const antwort = await fristen();
        const ids = (antwort.body as { items: { subjektId: string }[] }).items.map((i) => i.subjektId);
        expect(ids).not.toContain(id);
      });

      it('ist fuer compliance-auditor lesbar — die Aufsichtsfrage stellt genau er', async () => {
        const antwort = await request(testApp.httpServer)
          .get('/monitoring/einschraenkung-fristen')
          .set('Authorization', `Bearer ${auditorToken}`);
        expect(antwort.status).toBe(200);
      });

      it('weist eine unsinnige Schwelle an der DTO-Grenze ab', async () => {
        expect((await fristen(0)).status).toBe(400);
        expect((await fristen(99999)).status).toBe(400);
      });
    });

    it('DELETE /stammdaten/endkunden/{id} existiert nicht mehr — die Sperre laeuft ausschliesslich ueber die Aktions-Route (A11.1)', async () => {
      const { id } = await legeEndkundeAn('Eta');

      const antwort = await request(testApp.httpServer)
        .delete(`/stammdaten/endkunden/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(antwort.status).toBe(404);
    });

    it(
      'POST kryptoshredding (Direkt-Endpoint) ist ENTFERNT (ADR-0009 §2.4 — hartes Cutover, kein Deprecation-Fenster). ' +
        'Krypto-Shredding (Art. 17) läuft jetzt ausschließlich über den Vier-Augen-Workflow ' +
        '(`ShredAntragController`, s. `shred-antrag/shred-antrag.integration.spec.ts` für den vollen Fluss ' +
        'beantragen->freigeben->ausgefuehrt inkl. PII-Maskierung).',
      async () => {
        const { id } = await legeEndkundeAn('Epsilon');

        const response = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${id}/kryptoshredding`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });

        expect(response.status).toBe(404);
      },
    );
  });

  describe('Referenzkonsistenz-SELECT vor Nutzungsverhältnis-Insert (B2)', () => {
    it('lehnt ab (400), wenn der Anschlussnutzer nicht zum angegebenen Endkunden gehört', async () => {
      const { id: endkundeA } = await legeEndkundeAn('RefA');
      const { id: endkundeB } = await legeEndkundeAn('RefB');

      const systemResponse = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: endkundeA, bezeichnung: 'Testsystem', systemgrenze: 'Gebäude A' });
      expect(systemResponse.status).toBe(201);
      const systemId = (systemResponse.body as { id: string }).id;

      const anschlussnutzerResponse = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: endkundeB, stammdatenPii: { name: 'Testnutzer Zeta' } });
      expect(anschlussnutzerResponse.status).toBe(201);
      const anschlussnutzerId = (anschlussnutzerResponse.body as { id: string }).id;

      // anschlussnutzer gehört zu endkundeB, system gehört zu endkundeA — Mismatch.
      const response = await request(testApp.httpServer)
        .post('/stammdaten/nutzungsverhaeltnisse')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          endkundeId: endkundeA,
          anschlussnutzerId,
          systemId,
          rolle: 'mieter',
          gueltigVon: '2026-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });
  });

  describe('Audit — kontext.synthetic Pflicht-Tag (ADR-0008 §22, Review-Fix)', () => {
    it(
      'POST /stammdaten/endkunden schreibt kontext.synthetic=true in die ECHTE Audit-Zeile ' +
        '(SyntheticOnlyInterceptor -> @AuditAction-kontextExtractors -> audit.append_event, kein Interceptor-Mock) ' +
        'UND die Hash-Kette der Lane/des Tages bleibt intakt (ADR-0008 §17, /add-audit-event Schritt 4)',
      async () => {
        const { id } = await legeEndkundeAn('AuditSynthetic');

        const auditRow = await auditClient.query(
          "SELECT kontext, tag_utc, lane FROM audit.event WHERE event_typ = 'endkunde.stammdaten.angelegt' AND objekt_ref = $1",
          [id],
        );

        expect(auditRow.rowCount).toBe(1);
        const { kontext, tag_utc: tagUtc, lane } = auditRow.rows[0] as {
          kontext: Record<string, unknown>;
          tag_utc: string;
          lane: number;
        };
        expect(kontext['synthetic']).toBe(true);

        // Ketten-Integritaet: wiederverwendet die vorhandene, DB-seitige
        // Ketten-Pruef-Funktion aus V0003 (`audit.pruefe_kette`, s. deren
        // Kommentar in migrations/V0003__audit_log_schema.sql) statt
        // prev_hash/zeilen_hash hier erneut manuell nachzurechnen (das
        // geschieht bereits in audit/audit.service.integration.spec.ts
        // fuer den generischen Append-Pfad) — dieser Test bestaetigt, dass
        // die Lane/der Tag NACH einer echten Stammdaten-Mutation weiterhin
        // als 'ok' verifiziert wird (kein 'LUECKE'/'MANIPULATION').
        const kettenPruefung = await auditClient.query(
          'SELECT status FROM audit.pruefe_kette($1::date, $1::date) WHERE lane = $2',
          [tagUtc, lane],
        );
        expect(kettenPruefung.rowCount).toBeGreaterThanOrEqual(1);
        for (const row of kettenPruefung.rows as Array<{ status: string }>) {
          expect(row.status).toBe('ok');
        }
      },
    );
  });

  describe('M1 — Rolle × Route-Matrix', () => {
    it('anonym (kein Token) -> 401 auf einer geschützten Stammdaten-Route', async () => {
      const response = await request(testApp.httpServer).get('/stammdaten/endkunden');
      expect(response.status).toBe(401);
    });

    it('compliance-auditor -> 200 auf Lese-Routen (Liste)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf einer Schreib-Route (POST, DS-01)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ stammdatenPii: { name: 'Testkunde X', anschrift: 'Musterstraße 1' } });
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf Stammdaten-Lese-Routen (admin ist KEINE Stammdaten-Rolle, DS-01/Least-Privilege)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf Stammdaten-Schreib-Routen', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ stammdatenPii: { name: 'Testkunde Y', anschrift: 'Musterstraße 1' } });
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf einer Schreib-Route (Referenz-Happy-Path)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ stammdatenPii: { name: 'Testkunde Matrix', anschrift: 'Musterstraße 1' } });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf einer Schreib-Route', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ stammdatenPii: { name: 'Testkunde ZZ', anschrift: 'Musterstraße 1' } });
      expect(response.status).toBe(400);
    });
  });
});
