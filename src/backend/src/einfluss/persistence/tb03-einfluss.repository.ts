import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { EINFLUSS_ERKENNUNG_POOL } from './einfluss-erkennung-pg.module';
import { leseTb03Regel } from '../domain/tb03-regel';
import type { Tb03Regel } from '../domain/tb03-regel';
import type { Tb03Intervall } from '../domain/tb03-erkennung';

/**
 * Die LESENDE Seite des Erkennungslaufs im Namensraum `einfluss` — Katalog
 * und Intervalle, ausschließlich über die Rolle `edms_einfluss_erkennung`
 * (V0079, A20).
 *
 * DATUMSWERTE WERDEN IN SQL FORMATIERT (`to_char`), nicht im JavaScript.
 * `pg` liefert `date` je nach Typ-Parser als `Date`-Objekt, und ein
 * `Date`-Objekt trägt eine Zeitzone, die eine Monatsgrenze um einen Tag
 * verschieben kann. Die gesamte Erkennung rechnet auf Monatsersten als
 * Zeichenketten; die Umwandlung gehört deshalb an die Grenze, an der die
 * Daten entstehen — nicht an fünf Stellen weiter oben.
 */

export interface Tb03SystemGroessenIntervalle {
  readonly systemId: string;
  readonly intervalle: readonly Tb03Intervall[];
}

interface KatalogRow {
  readonly code: string;
  readonly tb03_schwellwert: unknown;
}

interface IntervallRow {
  readonly system_id: string;
  readonly gueltig_ab_monat: string;
  readonly gueltig_bis_monat: string | null;
  readonly wert_num: string | null;
  readonly wert_code: string | null;
}

/** `numeric` kommt über `pg` als Zeichenkette — bewusst hier und nur hier gewandelt. */
function toNumberOrNull(wert: string | null): number | null {
  if (wert === null) {
    return null;
  }
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? zahl : null;
}

@Injectable()
export class Tb03EinflussRepository {
  constructor(@Inject(EINFLUSS_ERKENNUNG_POOL) private readonly pool: Pool) {}

  /**
   * Die maschinell überwachten Größen — und NUR sie.
   *
   * Eine Katalogzeile mit `tb03_schwellwert IS NULL` wird hier nicht
   * zurückgegeben. Nach A25 heißt das „nicht maschinell überwacht", niemals
   * „nie überschritten"; der Aufrufer muss die Zahl der übersprungenen Größen
   * ausweisen, damit die Lücke im Ergebnis sichtbar bleibt.
   */
  async ladeRegeln(): Promise<{ regeln: readonly Tb03Regel[]; uebersprungen: readonly string[] }> {
    const ergebnis = await this.pool.query<KatalogRow>(
      `SELECT code, tb03_schwellwert
         FROM einfluss.katalog
        WHERE aktiv = true
        ORDER BY code`,
    );

    const regeln: Tb03Regel[] = [];
    const uebersprungen: string[] = [];

    for (const row of ergebnis.rows) {
      const regel = leseTb03Regel(row.code, row.tb03_schwellwert);
      if (regel === undefined) {
        uebersprungen.push(row.code);
      } else {
        regeln.push(regel);
      }
    }

    return { regeln, uebersprungen };
  }

  /**
   * Alle Intervalle einer Größe für die übergebenen Systeme, nach System
   * gruppiert. Eine Abfrage je Größe statt einer je (System, Größe) — der
   * Lauf soll die Klartext-PII-Tabelle so selten wie möglich anfassen.
   */
  async ladeIntervalle(
    systemIds: readonly string[],
    groesseCode: string,
  ): Promise<readonly Tb03SystemGroessenIntervalle[]> {
    if (systemIds.length === 0) {
      return [];
    }

    const ergebnis = await this.pool.query<IntervallRow>(
      `SELECT system_id,
              to_char(gueltig_ab_monat,  'YYYY-MM-DD') AS gueltig_ab_monat,
              to_char(gueltig_bis_monat, 'YYYY-MM-DD') AS gueltig_bis_monat,
              wert_num,
              wert_code
         FROM einfluss.intervall
        WHERE system_id = ANY($1::uuid[])
          AND groesse_code = $2
        ORDER BY system_id, gueltig_ab_monat`,
      [systemIds, groesseCode],
    );

    const nachSystem = new Map<string, Tb03Intervall[]>();
    for (const row of ergebnis.rows) {
      const liste = nachSystem.get(row.system_id) ?? [];
      liste.push({
        gueltigAbMonat: row.gueltig_ab_monat,
        gueltigBisMonat: row.gueltig_bis_monat,
        wertNum: toNumberOrNull(row.wert_num),
        wertCode: row.wert_code,
      });
      nachSystem.set(row.system_id, liste);
    }

    return [...nachSystem.entries()].map(([systemId, intervalle]) => ({ systemId, intervalle }));
  }

  /** Anzahl gelesener Klartext-Zeilen — Kontextwert `anzahl_saetze` des Einsicht-Ereignisses (A19a). */
  async zaehleGeleseneSaetze(systemIds: readonly string[], groessenCodes: readonly string[]): Promise<number> {
    if (systemIds.length === 0 || groessenCodes.length === 0) {
      return 0;
    }

    const ergebnis = await this.pool.query<{ anzahl: string }>(
      `SELECT count(*)::text AS anzahl
         FROM einfluss.intervall
        WHERE system_id = ANY($1::uuid[])
          AND groesse_code = ANY($2::text[])`,
      [systemIds, groessenCodes],
    );

    return Number(ergebnis.rows[0]?.anzahl ?? '0');
  }
}
