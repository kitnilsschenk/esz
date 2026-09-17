import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { EINFLUSS_ERKENNUNG_POOL } from './einfluss-erkennung-pg.module';
import { validateAuditEnvelope } from '../../audit/audit-envelope.validator';
import type { Tb03Befundkandidat } from '../domain/tb03-erkennung';

/**
 * Die SCHREIBENDE Seite: Befunde und die beiden Audit-Ereignisse — beides
 * über die Rolle `edms_einfluss_erkennung` (V0079, verschärft V0082).
 *
 * WARUM HIER EIN EIGENER AUDIT-SCHREIBPFAD STATT `AuditService`. Auflage
 * A19(b) verlangt das Ereignis in DERSELBEN Transaktion wie der Befund.
 * `AuditService` schreibt über `TransactionHost`, also über die
 * App-Verbindung (`edms_app`) — eine Transaktion kann aber nicht über zwei
 * Verbindungen reichen. Da der Befund auf der Erkennungs-Verbindung
 * entsteht, muss das Ereignis dort entstehen.
 *
 * V0079 hatte dieser Rolle dafür EXECUTE auf das generische
 * `audit.append_event(...)` erteilt — ein High-Befund im Security-Review:
 * PostgreSQL kennt keine argumentscharfen GRANTs, die Rolle hätte damit
 * JEDEN aktiven Event-Typ mit JEDEM `actor_sub` schreiben können, nicht nur
 * die zwei hier verdrahteten Codes. V0082 ersetzt das generische Grant durch
 * ZWEI zweckgebundene `SECURITY DEFINER`-Wrapper
 * (`audit.append_tb03_einsicht_event`/`audit.append_tb03_ueberschreitung_event`),
 * die `event_typ`/`actor_typ`/`actor_sub`/`ergebnis` selbst festlegen — nicht
 * mehr der Aufrufer. Die Funktionen sind weiterhin `SECURITY DEFINER`
 * (Owner `edms_audit_owner`), die Rolle sieht das Log selbst also nicht.
 *
 * ENVELOPE-VALIDIERUNG (V0082, zweiter Punkt desselben Reviews):
 * `AuditService.append()` fährt jeden App-seitigen Envelope durch
 * `AuditEnvelopeDto`/`validateSync` (Struktur-Check, Defense-in-Depth
 * zusätzlich zum DB-Seal-Trigger). Der rohe `pool.query(...)`-Aufruf hier
 * umging das vollständig. `validateAuditEnvelope(...)` ist dieselbe,
 * zustandslose Kernfunktion (`audit-envelope.validator.ts`, ohne HTTP-/
 * TransactionHost-Bindung) — jetzt VOR jedem Schreibzugriff auf dieser
 * zweiten Verbindung eingesetzt, statt einer Kommentar-Erinnerung, sie von
 * Hand nachzuziehen.
 */

const EVENT_EINSICHT = 'einflussgroesse.stammdaten.einsicht';
const EVENT_UEBERSCHRITTEN = 'einflussgroesse.schwellwert.ueberschritten';

/**
 * A19: `actor_typ='system'` (interner, nicht-HTTP-Emittent — `actor-typ.ts`),
 * `actor_rolle` bleibt NULL. Eine Rolle zu erfinden wäre schlechter als das
 * leere Feld: Der Lauf hat keine, und „ein leeres Rollenfeld wäre
 * aussagekräftiger als ein erfundenes" (V0067).
 *
 * Seit V0082 nur noch als LOKALER Wert für die Envelope-Validierung
 * (`validateAuditEnvelope`) verwendet — der tatsächliche `actor_sub`, mit
 * dem die Zeile in `audit.event` landet, ist im DB-Wrapper selbst fest
 * verdrahtet, nicht mehr ein von hier übergebener Parameter.
 */
const ACTOR_SUB = 'tb03-erkennung-runner';

/** V0082 — Wrapper statt generischem `audit.append_event(...)` (s. Klassenkopf). */
const SQL_APPEND_EINSICHT_EVENT = 'SELECT * FROM audit.append_tb03_einsicht_event($1, $2)';
const SQL_APPEND_UEBERSCHREITUNG_EVENT =
  'SELECT * FROM audit.append_tb03_ueberschreitung_event($1, $2, $3, $4, $5, $6, $7, $8)';

export interface Tb03SchreibErgebnis {
  readonly geschrieben: number;
  /** Bereits vorhandene, identische Befunde — vom Idempotenz-Index abgewiesen (A23). */
  readonly bereitsVorhanden: number;
}

@Injectable()
export class Tb03BefundRepository {
  constructor(@Inject(EINFLUSS_ERKENNUNG_POOL) private readonly pool: Pool) {}

  /**
   * A19(a) — EIN Einsicht-Ereignis JE LAUF, nicht je Zeile.
   *
   * Es wird auch bei null Befunden und auch im Probelauf geschrieben: Der
   * Lauf hat den Klartextbestand gelesen, und B10 bindet die Auditpflicht an
   * den Lesevorgang, nicht an sein Ergebnis. Ohne dieses Ereignis gäbe es
   * einen unauditierten Lesepfad auf Personendaten — genau die Lücke, die
   * `read:einflussgroesse` schließen soll.
   *
   * Je Zeile zu auditieren wäre dagegen schädlich: Der Code dient der
   * Missbrauchsprüfung MENSCHLICHER Einsichten; monatlich tausende
   * Maschinenzeilen würden ihn unlesbar machen.
   */
  async protokolliereEinsicht(anzahlSaetze: number, synthetic: boolean): Promise<void> {
    // Struktur-Check VOR dem DB-Roundtrip (V0082) — derselbe Envelope, den
    // `AuditService.append()` für HTTP-Pfade prüft, nur hier auf der
    // Erkennungs-Verbindung. `event_typ`/`actor_typ`/`actor_sub` legt danach
    // ausschließlich der DB-Wrapper fest, nicht dieser Aufruf.
    validateAuditEnvelope({
      eventTyp: EVENT_EINSICHT,
      actorTyp: 'system',
      ergebnis: 'ok',
      actorSub: ACTOR_SUB,
      kontext: { synthetic, anzahl_saetze: anzahlSaetze },
    });

    await this.pool.query(SQL_APPEND_EINSICHT_EVENT, [anzahlSaetze, synthetic]);
  }

  /**
   * Schreibt die Befunde eines Systems und je geschriebenem Befund sein
   * Audit-Ereignis — in EINER Transaktion (A19b).
   *
   * `ON CONFLICT DO NOTHING RETURNING id` ist die Idempotenz aus A23: Der
   * Unique-Index aus V0079 entscheidet, nicht eine vorherige Abfrage (die
   * hätte ein Wettlauffenster). `RETURNING` liefert nur die TATSÄCHLICH
   * eingefügten Zeilen — damit entstehen Audit-Ereignisse ausschließlich für
   * neue Befunde und nicht bei jedem Monatslauf erneut.
   */
  async schreibeBefunde(
    systemId: string,
    kandidaten: readonly Tb03Befundkandidat[],
    synthetic: boolean,
  ): Promise<Tb03SchreibErgebnis> {
    if (kandidaten.length === 0) {
      return { geschrieben: 0, bereitsVorhanden: 0 };
    }

    const client: PoolClient = await this.pool.connect();
    let geschrieben = 0;

    try {
      await client.query('BEGIN');

      for (const kandidat of kandidaten) {
        const eingefuegt = await client.query<{ id: string }>(
          `INSERT INTO einfluss.befund
               (id, system_id, groesse_code, zeitraum_von, zeitraum_bis, ueberschreitung_klasse, schwellwert_code)
           VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            systemId,
            kandidat.groesseCode,
            kandidat.zeitraumVon,
            kandidat.zeitraumBis,
            kandidat.ueberschreitungKlasse,
            kandidat.schwellwertCode,
          ],
        );

        const befundId = eingefuegt.rows[0]?.id;
        if (befundId === undefined) {
          continue;
        }

        geschrieben += 1;

        // Kontext WÖRTLICH nach der Whitelist aus V0021 (12) — klassiert,
        // kein Rohprozentsatz, keine Rohwerte. Struktur-Check VOR dem
        // DB-Roundtrip (V0082, s. Klassenkopf) — derselbe Envelope, den
        // `AuditService.append()` für HTTP-Pfade prüft.
        const kontext = {
          synthetic,
          system_id: systemId,
          groesse_code: kandidat.groesseCode,
          schwellwert_code: kandidat.schwellwertCode,
          zeitraum_von: kandidat.zeitraumVon,
          zeitraum_bis: kandidat.zeitraumBis,
          ueberschreitung_klasse: kandidat.ueberschreitungKlasse,
        };

        validateAuditEnvelope({
          eventTyp: EVENT_UEBERSCHRITTEN,
          actorTyp: 'system',
          ergebnis: 'ok',
          actorSub: ACTOR_SUB,
          objektRef: befundId,
          kontext,
        });

        await client.query(SQL_APPEND_UEBERSCHREITUNG_EVENT, [
          befundId,
          systemId,
          kandidat.groesseCode,
          kandidat.schwellwertCode,
          kandidat.zeitraumVon,
          kandidat.zeitraumBis,
          kandidat.ueberschreitungKlasse,
          synthetic,
        ]);
      }

      await client.query('COMMIT');
    } catch (fehler) {
      await client.query('ROLLBACK');
      throw fehler;
    } finally {
      client.release();
    }

    return { geschrieben, bereitsVorhanden: kandidaten.length - geschrieben };
  }
}
