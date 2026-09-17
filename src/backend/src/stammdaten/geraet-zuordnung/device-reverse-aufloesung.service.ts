import { Inject, Injectable } from '@nestjs/common';
import { DeviceGeraetZuordnungRepository } from '../persistence/device/device-geraet-zuordnung.repository';
import { DeviceSchluesselRepository } from '../persistence/device/device-schluessel.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { GERAET_REVERSE_ALERT_PORT } from './geraet-reverse-alert.port';
import type { AlertPort } from './geraet-reverse-alert.port';
import type { SecurityContext } from '../../common/security/security-context';
import { konflikt, nichtGefunden } from '../common/problem.util';
import { FELD_DEVEUI } from './geraet-zuordnung.constants';
import type { GeraetReverseAufloesungDto } from './dto/geraet-reverse-aufloesung.dto';
import type { GeraetReverseAufloesungErgebnis } from './geraet-reverse-aufloesung.types';

/**
 * ADR-0005 §26.4 SEC-5 — Reverse-Auflösung (Blind-Index/Zeile → Klartext-
 * DevEUI). Erreicht diese Klasse wird NUR über die vorgelagerte, im
 * `InCodePolicyAdapter.evaluateGeraetReverse()` implementierte
 * break-glass-Härtung (Rolle `geraete-support` + Zweck-Whitelist +
 * Ticket-Format + Velocity/Quota) — der Service selbst führt KEINE eigene
 * ABAC-Neuprüfung durch (das ist PDP-Sache, Separation of Concerns); er
 * IST aber der Ort für die Fach-Invarianten (Zuordnung existiert/ist nicht
 * bereits geschreddert) UND für das Echtzeit-Alerting (SEC-5 (e)):
 * Erreichen des `alertPort.emit(...)`-Aufrufs beweist strukturell, dass ein
 * `permit` vorlag (ein `deny` erreicht diese Methode nie, `PolicyInterceptor`
 * wirft davor `ForbiddenException`).
 *
 * RL-2 (rote Linie, VERBINDLICH): `devEui` wird NIRGENDS geloggt — weder
 * hier noch im Alert (s. `GeraetReverseAlertPayload`) noch im Audit-Kontext
 * (`@AuditAction`-`kontextExtractors` am Controller lesen NUR `zaehler_id`/
 * `zweck`/`ticket_ref`, NIE `result.devEui`).
 */
@Injectable()
export class DeviceReverseAufloesungService {
  constructor(
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
    private readonly schluesselRepository: DeviceSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
    @Inject(GERAET_REVERSE_ALERT_PORT) private readonly alertPort: AlertPort,
  ) {}

  async reverseAufloesen(
    geraetZuordnungId: string,
    dto: GeraetReverseAufloesungDto,
    subject: SecurityContext,
  ): Promise<GeraetReverseAufloesungErgebnis> {
    const zuordnung = await this.geraetZuordnungRepository.findById(geraetZuordnungId);
    if (zuordnung === undefined) {
      throw nichtGefunden('Geraete-Zuordnung');
    }

    if (zuordnung.status === 'geschreddert') {
      throw konflikt(
        'Diese Geraete-Zuordnung wurde bereits krypto-geschreddert (Art. 17 DSGVO) — Reverse-Aufloesung strukturell nicht mehr moeglich.',
      );
    }

    const schluessel = await this.schluesselRepository.findById(zuordnung.cryptoKeyId);
    if (schluessel === undefined || schluessel.keyState === 'geschreddert') {
      throw konflikt('Der zugehoerige Schluessel ist nicht mehr verfuegbar (krypto-geschreddert).');
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: schluessel.wrappedDek,
      kmsKeyId: schluessel.kmsKeyId,
      algVersion: schluessel.algVersion,
    });

    const devEui = this.fieldCipher.decrypt(dek, zuordnung.zaehlerId, FELD_DEVEUI, zuordnung.deveuiEnc);

    // SEC-5 (e) — Echtzeit-Alert bei JEDEM permit. Erreichen dieser Zeile IST
    // der permit-Fall (vorgelagerte ABAC-Haertung hat bereits entschieden).
    // RL-2: NIEMALS devEui/Blind-Index im Alert-Inhalt.
    await this.alertPort.emit({
      actorSub: subject.sub,
      zaehlerId: zuordnung.zaehlerId,
      zweck: dto.zweck,
      ticketRef: dto.ticketRef,
      zeitpunkt: new Date().toISOString(),
    });

    return { id: zuordnung.id, zaehlerId: zuordnung.zaehlerId, devEui };
  }
}
