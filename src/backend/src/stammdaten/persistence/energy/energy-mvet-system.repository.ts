import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

/** Ein System innerhalb der Systemgrenze — mit dem, was die Oberfläche zum Auswählen braucht. */
export interface SystemgrenzeEintrag {
  readonly systemId: string;
  readonly bezeichnung: string;
}

/**
 * `energy.messkonzept_version_energietraeger_system` — WELCHE Systeme in die
 * Systemgrenze eines Messkonzept-Energieträgers fallen.
 *
 * **Warum es dieses Repository erst jetzt gibt.** Die Tabelle steht seit
 * V0028 im Schema und wurde bis dahin ausschließlich per SQL befüllt: in
 * Testfixtures, im Demo-Generator, in Aufbau-Skripten. Ein Betriebsmensch
 * konnte sie nicht setzen.
 *
 * Das ist folgenreicher, als der Name vermuten lässt: Fehlt die Zuordnung,
 * fällt der Berechnungslauf auf `endkunde_fallback` zurück und nimmt ALLE
 * aktiven Zähler des Endkunden mit passendem Energieträger. Bei mehreren
 * Messkonzepten desselben Kunden fließt dabei fremder Verbrauch ein (V0062
 * schreibt genau das hin). Eine Angabe, die über die Richtigkeit jeder
 * Einsparzahl entscheidet, gehört nicht in ein Skript.
 */
@Injectable()
export class EnergyMvetSystemRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** Die Systeme, die aktuell in der Grenze liegen — nach Bezeichnung sortiert. */
  async listeFuerMvet(mvetId: string): Promise<SystemgrenzeEintrag[]> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT s.id, s.bezeichnung
         FROM energy.messkonzept_version_energietraeger_system mvs
         JOIN energy.system s ON s.id = mvs.system_id
        WHERE mvs.mvet_id = $1
        ORDER BY s.bezeichnung`,
      [mvetId],
    );
    return (rows as { id: string; bezeichnung: string }[]).map((r) => ({
      systemId: r.id,
      bezeichnung: r.bezeichnung,
    }));
  }

  /**
   * Setzt die Systemgrenze auf GENAU diese Menge.
   *
   * **Ersetzen statt einzeln hinzufügen und entfernen.** Die Systemgrenze ist
   * eine Menge, keine Liste von Vorgängen — wer sie ansieht, will wissen, was
   * drin ist, und wer sie ändert, meint den neuen Zustand. Ein PUT auf die
   * ganze Menge ist außerdem idempotent: Ein zweiter Aufruf mit demselben
   * Inhalt ändert nichts.
   *
   * Gibt die Anzahl VORHER zurück — der Betrieb soll im Audit-Eintrag
   * unterscheiden können, ob hier eingerichtet oder korrigiert wurde.
   */
  async setze(mvetId: string, endkundeId: string, systemIds: readonly string[]): Promise<number> {
    const vorher: unknown = await this.txHost.tx.query(
      'SELECT count(*)::int AS anzahl FROM energy.messkonzept_version_energietraeger_system WHERE mvet_id = $1',
      [mvetId],
    );
    const anzahlVorher = (vorher as { anzahl: number }[])[0]?.anzahl ?? 0;

    // Erst weg, was nicht mehr dazugehoert — dann rein, was fehlt. Beides in
    // EINER Transaktion (der Aufrufer haelt sie): Ein Zwischenzustand mit
    // leerer Grenze wuerde einen gleichzeitig startenden Lauf auf den
    // `endkunde_fallback` schicken.
    await this.txHost.tx.query(
      `DELETE FROM energy.messkonzept_version_energietraeger_system
        WHERE mvet_id = $1 AND system_id <> ALL($2::uuid[])`,
      [mvetId, [...systemIds]],
    );
    if (systemIds.length > 0) {
      await this.txHost.tx.query(
        `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
         SELECT $1, s, $3 FROM unnest($2::uuid[]) AS s
         ON CONFLICT (mvet_id, system_id) DO NOTHING`,
        [mvetId, [...systemIds], endkundeId],
      );
    }

    return anzahlVorher;
  }

  /** Der Energieträger und der Endkunde einer mvet — für Prüfung und Audit-Kontext. */
  async findeMvet(mvetId: string): Promise<{ readonly endkundeId: string; readonly energietraeger: string } | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT mvet.endkunde_id, mvet.energietraeger
         FROM energy.messkonzept_version_energietraeger mvet
        WHERE mvet.id = $1`,
      [mvetId],
    );
    const zeile = (rows as { endkunde_id: string; energietraeger: string }[])[0];
    return zeile === undefined
      ? undefined
      : { endkundeId: zeile.endkunde_id, energietraeger: zeile.energietraeger };
  }

  /** Die Systeme, die ÜBERHAUPT in Frage kommen — alle des Endkunden. */
  async waehlbareSysteme(endkundeId: string): Promise<SystemgrenzeEintrag[]> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT id, bezeichnung FROM energy.system
        WHERE endkunde_id = $1 AND status = 'aktiv'
        ORDER BY bezeichnung`,
      [endkundeId],
    );
    return (rows as { id: string; bezeichnung: string }[]).map((r) => ({
      systemId: r.id,
      bezeichnung: r.bezeichnung,
    }));
  }
}
