import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

interface AbgleichRow {
  readonly tatsaechlicher_endkunde_id: string;
  readonly erwarteter_endkunde_id: string | null;
}

/**
 * Ergebnis des Herkunfts-Abgleichs (ADR-0011 D4).
 *
 * `kein_mapping` ist bewusst ein EIGENER Fall und kein „stimmig": Die
 * Zuordnungstabelle wird nach und nach gepflegt, und solange ein Tenant nicht
 * zugeordnet ist, gibt es schlicht nichts zu vergleichen. Beides in einen
 * Wert zu falten hiesse, „ungeprueft" und „geprueft und in Ordnung" gleich zu
 * behandeln — der Unterschied gehoert an den Aufrufer, nicht in dieses
 * Repository.
 */
export type HerkunftAbgleich =
  | { readonly art: 'stimmig' }
  | { readonly art: 'kein_mapping' }
  | {
      readonly art: 'widerspruch';
      readonly erwarteterEndkundeId: string;
      readonly tatsaechlicherEndkundeId: string;
    };

/**
 * ADR-0011 B3/D4 — beantwortet die eine Frage, die ueber Einspeisen oder
 * Quarantaene entscheidet: **Gehoert der aufgeloeste Zaehler zu demselben
 * Endkunden, dem der sendende ChirpStack-Tenant zugeordnet ist?**
 *
 * WARUM DAS UEBERHAUPT GEPRUEFT WIRD
 * Wird ein Geraet im fremden Netzserver umgehaengt — versehentlich oder bei
 * einem Wechsel —, fuellt es sonst still die Messwerte des FALSCHEN
 * Endkunden. In einem System, das daraus einen Foerderjahres-Nachweis
 * rechnet, ist das der teuerste denkbare stille Fehler: Er faellt nicht auf,
 * er sieht wie gueltige Daten aus, und er verfaelscht eine Einsparung, die
 * am Ende abgerechnet wird.
 *
 * EINE ABFRAGE, NICHT ZWEI
 * Der Abgleich liegt im Hot-Path jedes Uplinks. Beide Seiten des Vergleichs
 * kommen deshalb in EINEM Rundlauf: die tatsaechliche Zugehoerigkeit ueber
 * `zaehler → system`, die erwartete als skalare Unterabfrage auf die
 * Zuordnungstabelle. Die Unterabfrage nutzt den GiST-Index der
 * EXCLUDE-Constraint (V0042).
 *
 * `LIMIT 1` in der Unterabfrage ist keine Willkuer: Zu einem Tenant gehoeren
 * MEHRERE Zeilen (eine je Gebaeude), aber laut
 * `ex_herkunft_mapping_tenant_ein_endkunde` tragen sie ALLE denselben
 * `endkunde_id`. Welche Zeile die Datenbank liefert, ist deshalb
 * gleichgueltig — die Constraint macht die Antwort eindeutig, nicht die
 * Sortierung.
 *
 * RECHTE: Diese Klasse liest `energy.system` — dafuer haelt die Worker-Rolle
 * seit V0042 einen SPALTENSCHARFEN Grant auf genau `(id, endkunde_id)`
 * (RL-1). Wer hier eine weitere Spalte ergaenzt, bekommt zur Laufzeit
 * `permission denied` und keine stille Ausweitung.
 */
@Injectable()
export class HerkunftAbgleichRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * @param zaehlerId      der ueber den Blind-Index aufgeloeste Zaehler
   * @param chirpstackTenantId  Mandanten-Kennung aus dem Uplink (`deviceInfo`)
   */
  async pruefe(zaehlerId: string, chirpstackTenantId: string): Promise<HerkunftAbgleich> {
    const result = await this.pool.query<AbgleichRow>(
      `SELECT sys.endkunde_id AS tatsaechlicher_endkunde_id,
              (SELECT hm.endkunde_id
                 FROM ingest.herkunft_mapping hm
                WHERE hm.chirpstack_tenant_id = $2
                LIMIT 1) AS erwarteter_endkunde_id
         FROM energy.zaehler z
         JOIN energy.system sys ON sys.id = z.system_id
        WHERE z.id = $1`,
      [zaehlerId, chirpstackTenantId],
    );

    const row = result.rows[0];

    // Kein Zaehler auffindbar: Das kann nur eine Inkonsistenz zwischen
    // Forward-Lookup und Stammdaten sein. HIER daraus einen Herkunfts-
    // Widerspruch zu machen waere eine Falschaussage — behauptet wuerde, die
    // Zugehoerigkeit sei geprueft und abweichend, obwohl sie gar nicht
    // ermittelbar war. Der unmittelbar folgende Geraetetyp-Lookup laeuft
    // ohnehin in `unbekannter_geraetetyp`.
    if (row === undefined) {
      return { art: 'kein_mapping' };
    }

    if (row.erwarteter_endkunde_id === null) {
      return { art: 'kein_mapping' };
    }

    if (row.erwarteter_endkunde_id === row.tatsaechlicher_endkunde_id) {
      return { art: 'stimmig' };
    }

    return {
      art: 'widerspruch',
      erwarteterEndkundeId: row.erwarteter_endkunde_id,
      tatsaechlicherEndkundeId: row.tatsaechlicher_endkunde_id,
    };
  }
}
