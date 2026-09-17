import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

interface WirksamRow {
  readonly wirksam: boolean;
}

/**
 * ADR-0012 E5/Stufe C (A12-11) — der EINZIGE Zugriff des Ingest-Workers auf
 * die Rechtsgrundlagen-Frage.
 *
 * Ruft ausschliesslich `consent.ingest_rechtsgrundlage_wirksam(uuid)` auf —
 * eine `SECURITY DEFINER`-Funktion (Migration V0084), die `boolean`
 * zurueckgibt. Diese Klasse haelt KEIN SELECT auf irgendeine Tabelle in
 * `consent.*`: Der Worker erfaehrt eine Erlaubnis, keine Historie.
 *
 * Der Zweck ist NICHT Teil der Signatur — die Funktion haelt ihn selbst
 * fest (`messdaten_verarbeitung`, A12-15). Diese Klasse kann also gar nicht
 * nach einem anderen Zweck fragen, selbst wenn ein Aufrufer es versuchte.
 *
 * **KEIN Zeitpunkt-Parameter (Auflage C-2/B-1, `compliance-director`-Votum).**
 * Die urspruengliche Fassung nahm `verarbeitungszeitpunkt` als Parameter
 * entgegen — das war ein echter Fehler, kein Stilproblem: `edms_ingest_worker`
 * haelt `SELECT` auf die volle Zeile von `energy.zaehler` (V0010) und kann
 * damit jede Zaehler-ID aufzaehlen; mit einem frei waehlbaren Zeitpunkt-
 * Parameter waere der exakte Widerrufszeitpunkt jedes Anschlussnutzers per
 * Binaersuche rekonstruierbar gewesen — die Funktion haette dann eine
 * Historie preisgegeben, nur langsamer als ein direktes `SELECT`. Die
 * Funktion bildet `now()` jetzt SELBST im Funktionskoerper — der Aufrufer
 * kann keinen Zeitpunkt mehr waehlen, weder den aktuellen noch einen
 * vergangenen. A12-12 ist damit eine Schema-Eigenschaft, keine Zusicherung
 * in einem TypeScript-Kommentar.
 */
@Injectable()
export class ConsentGateRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * @param zaehlerId der bereits korrelierte Zaehler (Schritt 4,
   *                  Forward-Lookup) — KEIN frei waehlbares Subjekt.
   */
  async messdatenVerarbeitungErlaubt(zaehlerId: string): Promise<boolean> {
    const result = await this.pool.query<WirksamRow>(`SELECT consent.ingest_rechtsgrundlage_wirksam($1) AS wirksam`, [
      zaehlerId,
    ]);

    // `SELECT <scalar-function>` liefert immer genau eine Zeile — ein
    // fehlender Treffer ist strukturell nicht vorgesehen. Fail-closed dennoch:
    // ein unerwarteter DB-Zustand ist keine Erlaubnis.
    return result.rows[0]?.wirksam ?? false;
  }
}
