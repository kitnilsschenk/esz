import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './persistence/ingest-pg.module';

export interface VorflugErgebnis {
  readonly zaehlerGesamt: number;
  readonly wuerdeDurchlassen: number;
  readonly wuerdeVerwerfen: number;
  /** Nur gefüllt, wenn ausdrücklich angefordert — s. Kommentar an `pruefe`. */
  readonly verworfeneZaehlerIds: readonly string[];
}

/**
 * Der Trockenlauf des Ingest-Gates über den gesamten Bestand
 * (ADR-0012 Stufe C, Auflage C-12).
 *
 * **Wozu.** Der Schalter `EDMS_INGEST_CONSENT_ENFORCEMENT` ist ein
 * Ein-Aus-Vorgang mit sofortiger Wirkung: Ab dem Umlegen schreibt der Worker
 * für jeden Zähler ohne wirksame Rechtsgrundlage nichts mehr. Ohne vorherige
 * Zählung erfährt der Betrieb das erst daran, dass Messwerte ausbleiben — und
 * dann ist die Frage „liegt es am Gate oder an der Technik" genau die, die
 * sich am schwersten beantworten lässt.
 *
 * Dieser Lauf beantwortet sie vorher: Wie viele Zähler würden durchlaufen,
 * wie viele nicht.
 *
 * **Warum das heute wichtiger ist, als es klingt.** `consent.einwilligung`
 * verlangt eine freigegebene `consent.text_version`, und die Texte stehen
 * noch auf Entwurf (V-8d). Es kann derzeit also gar keine wirksame
 * Anschlussnutzer-Einwilligung geben. Für jeden Zähler mit aktivem
 * Nutzungsverhältnis liefert das Gate damit `false` — korrektes
 * Fail-closed-Verhalten, aber wer den Schalter ohne diesen Lauf umlegt, legt
 * unter Umständen den halben Bestand still.
 *
 * **Er ändert nichts.** Nur Lesen, keine Metrik, kein Verwurf-Aggregat, kein
 * Audit-Ereignis. Der Lauf ist eine Frage, keine Handlung.
 */
@Injectable()
export class ConsentVorflugService {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * @param zaehlerNennen Wenn `true`, werden die Kennungen der Zähler
   *   zurückgegeben, die das Gate abweisen würde.
   *
   *   Standardmäßig AUS. Die Liste ist subjektkorreliert: Wer sie hat, weiß,
   *   für welche Messstellen keine Rechtsgrundlage vorliegt — und das ist
   *   eine Aussage über Personen, nicht über Geräte. Sie gehört auf den
   *   Bildschirm dessen, der die Lücke schließt, nicht in ein
   *   Log-Aggregat.
   *
   *   Sie fügt allerdings auch keine Berechtigung hinzu: Die Verbindung, die
   *   diesen Lauf ausführt, kann `energy.zaehler` ohnehin aufzählen. Der
   *   Schalter regelt, was auf dem Bildschirm landet, nicht, was erreichbar
   *   ist.
   */
  async pruefe(zaehlerNennen = false): Promise<VorflugErgebnis> {
    // Ein einziger Rundlauf statt N Einzelabfragen: Bei einigen tausend
    // Zählern wäre das sonst ein spürbar langer Lauf, und ein Werkzeug, das
    // lange braucht, wird vor der Entscheidung nicht mehr ausgeführt.
    const ergebnis = await this.pool.query<{ zaehler_id: string; wirksam: boolean }>(
      `SELECT z.id AS zaehler_id,
              consent.ingest_rechtsgrundlage_wirksam(z.id) AS wirksam
         FROM energy.zaehler z
        ORDER BY z.id`,
    );

    const verworfen = ergebnis.rows.filter((row) => !row.wirksam);

    return {
      zaehlerGesamt: ergebnis.rows.length,
      wuerdeDurchlassen: ergebnis.rows.length - verworfen.length,
      wuerdeVerwerfen: verworfen.length,
      verworfeneZaehlerIds: zaehlerNennen ? verworfen.map((row) => row.zaehler_id) : [],
    };
  }
}
