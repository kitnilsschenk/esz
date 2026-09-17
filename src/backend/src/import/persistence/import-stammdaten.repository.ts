import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

/**
 * Die Nachschlage-Fragen, die ein WIEDERHOLBARER Import stellen muss.
 *
 * **Warum das nicht über die Fach-Repositories geht.** Die kennen
 * „auflisten mit Cursor" und „nach Kennung lesen" — sie kennen kein „gibt es
 * schon ein System mit dieser Bezeichnung". Das ist kein Versehen, sondern
 * die Sicht der Fach-API: Dort legt ein Mensch etwas an und weiß, was er
 * anlegt. Ein Import weiß es nicht; er muss es erfragen können, sonst
 * erzeugt der zweite Lauf einen zweiten Bestand.
 *
 * **Warum die Systembezeichnung der Bestandsschlüssel ist.** Der naheliegende
 * wäre der Endkundenname — aber der liegt feldverschlüsselt unter dem
 * Subjekt-Schlüssel (ADR-0009) und ist ohne Blindindex nicht durchsuchbar,
 * mit gutem Grund. Die Systembezeichnung steht im Klartext, ist fachlich
 * sprechend und für eine Liegenschaft ohnehin eindeutig. Sie beantwortet
 * damit die einzige Frage, die der Import wirklich braucht: „Habe ich das
 * hier schon einmal angelegt?"
 */
@Injectable()
export class ImportStammdatenRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** Das System mit genau dieser Bezeichnung — `undefined`, wenn es keins gibt. */
  async findeSystemNachBezeichnung(
    bezeichnung: string,
  ): Promise<{ readonly id: string; readonly endkundeId: string } | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      'SELECT id, endkunde_id FROM energy.system WHERE bezeichnung = $1 ORDER BY created_at LIMIT 1',
      [bezeichnung],
    );
    const zeile = (rows as { id: string; endkunde_id: string }[])[0];
    return zeile === undefined ? undefined : { id: zeile.id, endkundeId: zeile.endkunde_id };
  }

  /** Irgendein System dieses Präfixes — beantwortet „zu welchem Endkunden gehört dieser Bestand?". */
  async findeEndkundeNachSystemPraefix(praefix: string): Promise<string | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      'SELECT endkunde_id FROM energy.system WHERE bezeichnung LIKE $1 ORDER BY created_at LIMIT 1',
      [`${praefix}%`],
    );
    return (rows as { endkunde_id: string }[])[0]?.endkunde_id;
  }

  /** Der aktive Zähler dieses Systems für diesen Energieträger. */
  async findeZaehler(systemId: string, energietraeger: string): Promise<string | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT id FROM energy.zaehler
        WHERE system_id = $1 AND energietraeger = $2 AND status = 'aktiv'
        ORDER BY created_at LIMIT 1`,
      [systemId, energietraeger],
    );
    return (rows as { id: string }[])[0]?.id;
  }

  /** Der Messkanal dieses Zählers für diese Messgröße, samt `kanal_key` für den Schreibweg. */
  async findeMesskanal(
    zaehlerId: string,
    messgroesse: string,
  ): Promise<{ readonly id: string; readonly kanalKey: number; readonly art: string } | undefined> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT id, kanal_key, art FROM energy.messkanal
        WHERE zaehler_id = $1 AND messgroesse = $2
        ORDER BY created_at LIMIT 1`,
      [zaehlerId, messgroesse],
    );
    const zeile = (rows as { id: string; kanal_key: number; art: string }[])[0];
    return zeile === undefined ? undefined : { id: zeile.id, kanalKey: zeile.kanal_key, art: zeile.art };
  }

  /** Der `kanal_key` eines frisch angelegten Kanals — das Surrogat, unter dem Messwerte hängen. */
  async kanalKey(messkanalId: string): Promise<number> {
    const rows: unknown = await this.txHost.tx.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [
      messkanalId,
    ]);
    const zeile = (rows as { kanal_key: number }[])[0];
    if (zeile === undefined) {
      throw new Error(`Messkanal ${messkanalId} wurde angelegt, hat aber keinen kanal_key.`);
    }
    return zeile.kanal_key;
  }
}
