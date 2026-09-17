import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { KEY_MANAGEMENT_PORT, type KeyManagementPort } from '../../common/crypto/key-management.port';
import { IngestQuelleKonfigRepository } from '../persistence/ingest-quelle-konfig.repository';
import { loadIngestMqttOptions, type IngestMqttOptions } from './ingest-mqtt.config';

/**
 * Woher der Worker seine Broker-Konfiguration nimmt.
 *
 * REIHENFOLGE, UND WARUM SIE SO IST
 * ---------------------------------
 * 1. Ist `EDMS_INGEST_QUELLE_CODE` gesetzt UND gibt es dazu eine gepflegte
 *    Quelle (`ingest.quelle`, V0059), gilt die Datenbank. Sie ist die Stelle,
 *    an der ein Mensch die Konfiguration gepflegt hat.
 * 2. Gibt es dazu KEINE Zeile, gilt die Umgebung — wie vor V0059. Das ist
 *    bewusst kein Fehlstart: Bestehende Installationen laufen ohne gepflegte
 *    Quelle, und ein Upgrade darf sie nicht stillegen. Der Worker sagt aber
 *    beim Start deutlich, woher er liest.
 * 3. Ist die gepflegte Quelle auf `inaktiv` gesetzt, bricht der Start ab.
 *    Das ist der eine Fall, in dem jemand ausdrücklich entschieden hat, dass
 *    diese Quelle NICHT laufen soll — darüber setzt sich kein Fallback hinweg.
 *
 * Ein stiller Rückfall auf die Umgebung, obwohl jemand die Quelle gepflegt
 * hat, wäre die schlimmste Variante: Der Worker liefe dann gegen einen
 * anderen Broker als den, der in der Oberfläche steht.
 *
 * KEIN LOGGING VON GEHEIMNISSEN. Der Startlog nennt Quelle, Host, Topic und
 * TLS-Modus — nie Benutzername, Passwort oder Schlüssel (RL-2).
 */
@Injectable()
export class IngestQuelleKonfigService {
  private readonly logger = new Logger(IngestQuelleKonfigService.name);

  constructor(
    @Optional() private readonly repository?: IngestQuelleKonfigRepository,
    @Optional() private readonly fieldCipher?: FieldCipherService,
    @Optional() @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort?: KeyManagementPort,
  ) {}

  async ladeOptionen(): Promise<IngestMqttOptions> {
    const quelleCode = process.env['EDMS_INGEST_QUELLE_CODE'];
    if (
      quelleCode === undefined ||
      quelleCode.length === 0 ||
      this.repository === undefined ||
      this.fieldCipher === undefined ||
      this.keyManagementPort === undefined
    ) {
      return loadIngestMqttOptions();
    }

    const zeile = await this.repository.findByCode(quelleCode);
    if (zeile === undefined) {
      this.logger.warn(
        `Keine gepflegte Datenquelle mit der Kennung "${quelleCode}" gefunden — Konfiguration kommt aus der ` +
          'Umgebung (Verhalten wie vor V0059). Wer sie in der Oberflaeche pflegen will, legt dort eine Quelle ' +
          'mit genau dieser Kennung an.',
      );
      return loadIngestMqttOptions();
    }

    if (zeile.status !== 'aktiv') {
      throw new Error(
        `Die Datenquelle "${quelleCode}" ist auf "inaktiv" gesetzt. Fail-closed: Der Worker startet NICHT mit ` +
          'einer Konfiguration, gegen deren Betrieb ausdruecklich entschieden wurde. Quelle in der Oberflaeche ' +
          'aktivieren oder den Worker mit einer anderen Kennung starten.',
      );
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: zeile.wrapped_dek,
      kmsKeyId: zeile.kms_key_id,
      algVersion: zeile.alg_version,
    });

    const entschluessele = (feld: string, chiffrat: Buffer | null): string | undefined =>
      chiffrat === null ? undefined : this.fieldCipher?.decrypt(dek, zeile.id, feld, chiffrat);

    const benutzername = entschluessele('benutzername', zeile.benutzername_enc);
    const passwort = entschluessele('passwort', zeile.passwort_enc);
    const ca = entschluessele('ca_zertifikat', zeile.ca_zertifikat_enc);
    const zertifikat = entschluessele('client_zertifikat', zeile.client_zertifikat_enc);
    const schluessel = entschluessele('client_schluessel', zeile.client_schluessel_enc);

    const protokoll = zeile.tls_modus === 'kein_tls' ? 'mqtt' : 'mqtts';

    this.logger.log(
      `Konfiguration aus der Datenbank: quelle=${zeile.quelle_code}, broker=${zeile.broker_host}, ` +
        `topic=${zeile.topic}, tls=${zeile.tls_modus} (keine Zugangsdaten geloggt, RL-2).`,
    );

    return {
      url: `${protokoll}://${zeile.broker_host}`,
      clientId: zeile.client_id,
      topic: zeile.topic,
      ...(benutzername !== undefined ? { username: benutzername } : {}),
      ...(passwort !== undefined ? { password: passwort } : {}),
      ...(ca !== undefined ? { ca } : {}),
      ...(zertifikat !== undefined ? { cert: zertifikat } : {}),
      ...(schluessel !== undefined ? { key: schluessel } : {}),
    };
  }
}
