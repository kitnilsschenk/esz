import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';
import { idempotencyKey } from '../../nachweis/test-support/nachweis-test-fixtures';

/**
 * `/monitoring/ingest/quellen` (V0059/V0060) gegen eine ECHTE Datenbank.
 *
 * **Worum es hier geht.** Diese Routen nehmen Geheimnisse entgegen — ein
 * Broker-Passwort und den privaten Schlüssel eines Client-Zertifikats. Die
 * Zusage lautet: Sie werden verschlüsselt abgelegt und verlassen die
 * Datenbank nie wieder Richtung API. Eine Zusage, die niemand prüft, ist
 * eine Behauptung; deshalb prüft dieser Test sie an drei Stellen —
 * in der Antwort, in der Datenbank und über die Rollen-Matrix.
 *
 * Der Test gegen die ECHTE Datenbank ist hier nicht optional: Ob ein
 * Chiffrat entsteht, ob der CHECK gegen Zugangsdaten in der Broker-Adresse
 * greift und ob die Constraint-Verletzung als saubere 4xx ankommt (statt als
 * 500, weil der Savepoint fehlt), kann kein Unit-Test mit Repository-Attrappe
 * zeigen.
 */
describe('Datenquellen-Verwaltung — Integrationstests (V0059/V0060)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let dbClient: Client;

  const PASSWORT = 'ubJ7-geheim-nicht-ausgeben-9912';
  const CLIENT_SCHLUESSEL = [
    '-----BEGIN PRIVATE KEY-----',
    'TESTSCHLUESSELINHALTnichtEchtNurSynthetischAAAAAAAAAAAAAAAAAAAA',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const CLIENT_ZERTIFIKAT = [
    '-----BEGIN CERTIFICATE-----',
    'TESTZERTIFIKATINHALTnichtEchtNurSynthetischBBBBBBBBBBBBBBBBBBBB',
    '-----END CERTIFICATE-----',
  ].join('\n');

  /** Echte Zertifikate fuer die Ablauf-Pruefung — erzeugt, nicht eingecheckt. */
  let zertVerzeichnis: string;
  let echtesGueltigesZertifikat: string;
  let echtesAbgelaufenesZertifikat: string;

  function alsAsn1Zeit(tageDelta: number): string {
    const datum = new Date(Date.now() + tageDelta * 86_400_000);
    return `${datum.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  }

  function erzeugeZertifikat(name: string, tage: number): string {
    const key = path.join(zertVerzeichnis, `${name}.key`);
    const crt = path.join(zertVerzeichnis, `${name}.crt`);
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
      ...(tage > 0 ? ['-days', String(tage)] : ['-not_before', alsAsn1Zeit(tage - 1), '-not_after', alsAsn1Zeit(-1)]),
    ]);
    return readFileSync(crt, 'utf8');
  }

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-quelle-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-quelle-sub', ['compliance-auditor']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    zertVerzeichnis = mkdtempSync(path.join(tmpdir(), 'edms-quelle-zert-'));
    echtesGueltigesZertifikat = erzeugeZertifikat('gueltig', 45);
    echtesAbgelaufenesZertifikat = erzeugeZertifikat('abgelaufen', -30);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    rmSync(zertVerzeichnis, { recursive: true, force: true });
    await stopStammdatenTestApp(testApp);
  });

  function neuerCode(praefix: string): string {
    return `${praefix}-${randomUUID().slice(0, 8)}`;
  }

  async function legeQuelleAn(body: Record<string, unknown>): Promise<request.Response> {
    return request(testApp.httpServer)
      .post('/monitoring/ingest/quellen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
  }

  function basisBody(code: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      quelleCode: code,
      bezeichnung: 'ChirpStack Testnetz',
      brokerHost: 'mqtt.example.test:8883',
      topic: 'application/+/device/+/event/up',
      clientId: 'edms-ingest-worker',
      tlsModus: 'kein_tls',
      ...overrides,
    };
  }

  it('legt eine Quelle an und gibt das Passwort NICHT zurueck', async () => {
    // Die zentrale Zusage. Kein Klartext, kein maskierter Rest, kein Hash —
    // ein maskierter Wert verriete Laenge und Raender, ein Hash waere ein
    // Orakel fuer schwache Passwoerter.
    const code = neuerCode('netz-a');
    const response = await legeQuelleAn(basisBody(code, { benutzername: 'worker', passwort: PASSWORT }));

    expect(response.status).toBe(201);
    const roh = JSON.stringify(response.body);
    expect(roh).not.toContain(PASSWORT);
    expect(roh).not.toContain('passwortEnc');
    // Stattdessen: WELCHE Felder belegt sind.
    expect(response.body).toMatchObject({
      quelleCode: code,
      hinterlegteGeheimnisse: ['benutzername', 'passwort'],
    });
  });

  it('legt das Passwort verschluesselt ab — der Klartext steht nirgends in der Zeile', async () => {
    // Die Gegenprobe in der Datenbank. Ohne sie bewiese der Test oben nur,
    // dass die Antwort schweigt — nicht, dass die Ablage sicher ist.
    const code = neuerCode('netz-b');
    const response = await legeQuelleAn(basisBody(code, { benutzername: 'worker', passwort: PASSWORT }));
    expect(response.status).toBe(201);

    const zeile = await dbClient.query<{ passwort_enc: Buffer | null; roh: string }>(
      `SELECT passwort_enc, q::text AS roh FROM ingest.quelle q WHERE q.quelle_code = $1`,
      [code],
    );
    const daten = zeile.rows[0];
    expect(daten?.passwort_enc).not.toBeNull();
    // Die ganze Zeile als Text — faengt auch ein Geheimnis, das versehentlich
    // in einer anderen Spalte landete (etwa in `notiz`).
    expect(daten?.roh).not.toContain(PASSWORT);
  });

  it('spielt ein Client-Zertifikat samt privatem Schluessel ein, ohne es je wieder auszugeben', async () => {
    const code = neuerCode('netz-mtls');
    const response = await legeQuelleAn(
      basisBody(code, {
        tlsModus: 'mtls',
        clientZertifikat: CLIENT_ZERTIFIKAT,
        clientSchluessel: CLIENT_SCHLUESSEL,
      }),
    );

    expect(response.status).toBe(201);
    const roh = JSON.stringify(response.body);
    expect(roh).not.toContain('BEGIN PRIVATE KEY');
    expect(roh).not.toContain('BEGIN CERTIFICATE');
    expect((response.body as { hinterlegteGeheimnisse: string[] }).hinterlegteGeheimnisse).toEqual(
      expect.arrayContaining(['client_zertifikat', 'client_schluessel']),
    );

    // Auch der Abruf ueber GET schweigt — es waere ein naheliegender Fehler,
    // die Zusage nur im Anlege-Pfad einzuhalten.
    const gelesen = await request(testApp.httpServer)
      .get(`/monitoring/ingest/quellen/${String((response.body as { id: string }).id)}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(gelesen.status).toBe(200);
    expect(JSON.stringify(gelesen.body)).not.toContain('BEGIN PRIVATE KEY');
  });

  it('lehnt mTLS OHNE Client-Zertifikat ab, statt es beim Verbinden scheitern zu lassen', async () => {
    // Die Datenbank laesst diese Konfiguration gar nicht erst entstehen
    // (ck_quelle_mtls_vollstaendig). Entscheidend ist, dass daraus eine
    // saubere 4xx wird und keine 500 — der Savepoint (Propagation.Nested)
    // muss den Constraint-Verstoss auffangen, sonst reisst er die
    // Audit-tragende Transaktion mit.
    const response = await legeQuelleAn(basisBody(neuerCode('netz-halb'), { tlsModus: 'mtls' }));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('weist Zugangsdaten in der Broker-Adresse zurueck und sagt, wohin sie gehoeren', async () => {
    const response = await legeQuelleAn(basisBody(neuerCode('netz-url'), { brokerHost: 'worker:geheim@mqtt.test' }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('benutzername');
  });

  it('lehnt eine zweite Quelle mit derselben Kennung mit 409 ab', async () => {
    const code = neuerCode('netz-doppelt');
    expect((await legeQuelleAn(basisBody(code))).status).toBe(201);

    const zweite = await legeQuelleAn(basisBody(code, { bezeichnung: 'Anderer Name' }));
    expect(zweite.status).toBe(409);
  });

  it('laesst ein hinterlegtes Passwort beim Umbenennen unangetastet', async () => {
    // Der Fehler, den diese Zusage verhindert: Wer nur die Bezeichnung
    // aendert, schickt kein Passwort mit — ein naiver Update wuerde das als
    // „auf NULL setzen" lesen und die Quelle stumm schalten.
    const code = neuerCode('netz-c');
    const angelegt = await legeQuelleAn(basisBody(code, { benutzername: 'worker', passwort: PASSWORT }));
    expect(angelegt.status).toBe(201);
    const id = (angelegt.body as { id: string }).id;

    const geaendert = await request(testApp.httpServer)
      .patch(`/monitoring/ingest/quellen/${id}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ bezeichnung: 'Neuer Name' });

    expect(geaendert.status).toBe(200);
    expect(geaendert.body).toMatchObject({
      bezeichnung: 'Neuer Name',
      hinterlegteGeheimnisse: ['benutzername', 'passwort'],
    });
  });

  it('entfernt ein Geheimnis, wenn ausdruecklich ein leerer Wert geschickt wird', async () => {
    // Die Gegenprobe zum Test davor: Ohne diesen Weg waere ein einmal
    // hinterlegtes Passwort nur durch Neuanlage der Quelle loszuwerden.
    const code = neuerCode('netz-d');
    const angelegt = await legeQuelleAn(basisBody(code, { benutzername: 'worker', passwort: PASSWORT }));
    const id = (angelegt.body as { id: string }).id;

    const geaendert = await request(testApp.httpServer)
      .patch(`/monitoring/ingest/quellen/${id}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ passwort: '' });

    expect(geaendert.status).toBe(200);
    expect((geaendert.body as { hinterlegteGeheimnisse: string[] }).hinterlegteGeheimnisse).toEqual(['benutzername']);
  });

  it('protokolliert das Hinterlegen von Zugangsdaten als EIGENES Ereignis — mit Feldnamen, ohne Werte', async () => {
    const code = neuerCode('netz-audit');
    const response = await legeQuelleAn(basisBody(code, { benutzername: 'worker', passwort: PASSWORT }));
    expect(response.status).toBe(201);

    const ereignisse = await dbClient.query<{ event_typ: string; kontext: Record<string, unknown> }>(
      `SELECT event_typ, kontext FROM audit.event WHERE objekt_ref = $1 ORDER BY ts ASC`,
      [(response.body as { id: string }).id],
    );
    const typen = ereignisse.rows.map((zeile) => zeile.event_typ);
    expect(typen).toContain('quelle.ingest.angelegt');
    expect(typen).toContain('quelle.ingest.zugangsdaten_hinterlegt');

    // Das Protokoll darf die FELDNAMEN fuehren — niemals die Werte.
    const roh = JSON.stringify(ereignisse.rows);
    expect(roh).toContain('passwort');
    expect(roh).not.toContain(PASSWORT);
  });

  it('compliance-auditor darf lesen, aber nicht anlegen (DS-01)', async () => {
    const lesen = await request(testApp.httpServer)
      .get('/monitoring/ingest/quellen')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(lesen.status).toBe(200);

    const schreiben = await request(testApp.httpServer)
      .post('/monitoring/ingest/quellen')
      .set('Authorization', `Bearer ${auditorToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(basisBody(neuerCode('netz-auditor')));
    expect(schreiben.status).toBe(403);
  });

  it('liest das Ablaufdatum aus dem eingespielten Zertifikat', async () => {
    // Ohne diese Angabe laeuft ein Client-Zertifikat irgendwann ab, der
    // Broker verweigert die Verbindung, und niemand erfaehrt davon — bis
    // jemand fehlende Messwerte bemerkt.
    const code = neuerCode('netz-zert');
    const response = await legeQuelleAn(
      basisBody(code, {
        tlsModus: 'mtls',
        clientZertifikat: echtesGueltigesZertifikat,
        clientSchluessel: CLIENT_SCHLUESSEL,
      }),
    );

    expect(response.status).toBe(201);
    const bis = (response.body as { clientZertifikatGueltigBis: string | null }).clientZertifikatGueltigBis;
    expect(bis).not.toBeNull();
    const tageEntfernt = (new Date(String(bis)).getTime() - Date.now()) / 86_400_000;
    expect(tageEntfernt).toBeGreaterThan(40);
    expect(tageEntfernt).toBeLessThan(50);
  });

  it('weist ein bereits abgelaufenes Zertifikat zurueck', async () => {
    // Der haeufigste Bedienfehler beim Erneuern: versehentlich das ALTE
    // kopieren. Anzunehmen hiesse, eine Verbindung zu konfigurieren, die
    // sicher nicht zustande kommt.
    const response = await legeQuelleAn(
      basisBody(neuerCode('netz-alt'), {
        tlsModus: 'mtls',
        clientZertifikat: echtesAbgelaufenesZertifikat,
        clientSchluessel: CLIENT_SCHLUESSEL,
      }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('abgelaufen');
  });

  it('zieht das Ablaufdatum mit, wenn ein Zertifikat ersetzt wird', async () => {
    const code = neuerCode('netz-ersetzt');
    const angelegt = await legeQuelleAn(basisBody(code));
    expect(angelegt.status).toBe(201);
    expect((angelegt.body as { clientZertifikatGueltigBis: string | null }).clientZertifikatGueltigBis).toBeNull();

    const geaendert = await request(testApp.httpServer)
      .patch(`/monitoring/ingest/quellen/${String((angelegt.body as { id: string }).id)}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ clientZertifikat: echtesGueltigesZertifikat, clientSchluessel: CLIENT_SCHLUESSEL });

    expect(geaendert.status).toBe(200);
    expect((geaendert.body as { clientZertifikatGueltigBis: string | null }).clientZertifikatGueltigBis).not.toBeNull();
  });

  it('entfernt das Ablaufdatum, wenn das Zertifikat entfernt wird', async () => {
    // Ein Ablaufdatum ohne Zertifikat waere eine Aussage ueber nichts — die
    // Datenbank lehnt es zusaetzlich ab (V0061).
    const code = neuerCode('netz-weg');
    const angelegt = await legeQuelleAn(
      basisBody(code, { caZertifikat: echtesGueltigesZertifikat }),
    );
    expect(angelegt.status).toBe(201);
    expect((angelegt.body as { caZertifikatGueltigBis: string | null }).caZertifikatGueltigBis).not.toBeNull();

    const geaendert = await request(testApp.httpServer)
      .patch(`/monitoring/ingest/quellen/${String((angelegt.body as { id: string }).id)}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ caZertifikat: '' });

    expect(geaendert.status).toBe(200);
    expect((geaendert.body as { caZertifikatGueltigBis: string | null }).caZertifikatGueltigBis).toBeNull();
  });

  it('verlangt eine Anmeldung', async () => {
    const response = await request(testApp.httpServer).get('/monitoring/ingest/quellen');
    expect(response.status).toBe(401);
  });
});
