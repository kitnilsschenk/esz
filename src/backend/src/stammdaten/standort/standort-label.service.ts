import { Inject, Injectable } from '@nestjs/common';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import { IdentityStandortPiiRepository } from '../persistence/identity/identity-standort-pii.repository';
import { IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { FELD_ANSCHRIFT, FELD_BEZEICHNUNG } from './standort.constants';
import type { StandortLabelItem } from './standort.types';

/**
 * ADR-0010 D5 — `read:standort_pii` (Batch-Entschlüsselung für die Baum-UI,
 * `POST .../standorte/{endkundeId}/standorte/labels`). GETRENNT von
 * `StandortBaumService` (kritischer Punkt: die Baum-Struktur-Lesestufe darf
 * NIE `identity` berühren) — diese Klasse ist der EINZIGE Ort, an dem
 * Standort-Label/-Adresse entschlüsselt werden.
 *
 * AAD-Bindung (D4, ZENTRALE Sicherheitsauflage): `FieldCipherService.decrypt(
 * dek, STANDORT_ID, feld, chiffrat)` — der `subjektId`-Parameter ist IMMER
 * die `standortId` DES JEWEILIGEN Datensatzes (NICHT die `endkundeId`).
 * Da alle Standorte eines Endkunden denselben DEK teilen (D4/A2), würde ein
 * `subjektId=endkundeId` die AAD-Bindung wertlos machen — ein Chiffrat aus
 * "Standort A" ließe sich dann anstandslos als "Standort B" entschlüsseln
 * (GCM verifiziert nur, dass DEK+AAD zum Chiffrat passen — mit identischem
 * `subjektId` für alle Standorte wäre das immer der Fall). Mit
 * `subjektId=standortId` schlägt `decrypt()` bei vertauschten Chiffraten mit
 * einem GCM-Auth-Tag-Fehler fehl (s. `standort.service.spec.ts`/Integrationstest
 * "AAD-Bindung").
 *
 * EIN Audit-Event je Aufruf (`standort.pii.einsicht`, `@AuditAction` am
 * Controller, `kontext.anzahl_knoten` aus `result.length`) — NICHT eines je
 * Knoten (D5, ADR-0010 §5 wörtlich).
 */
@Injectable()
export class StandortLabelService {
  constructor(
    private readonly standortRepository: EnergyStandortRepository,
    private readonly standortPiiRepository: IdentityStandortPiiRepository,
    private readonly endkundePiiRepository: IdentityEndkundePiiRepository,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
  ) {}

  async labels(endkundeId: string, standortIds: readonly string[]): Promise<StandortLabelItem[]> {
    // Mandantentreue: nur Standorte, die TATSÄCHLICH zu endkundeId gehören
    // (silently gefiltert, s. `EnergyStandortRepository.findManyByIdsAndEndkunde`-Kommentar).
    const gueltigeStandorte = await this.standortRepository.findManyByIdsAndEndkunde(standortIds, endkundeId);
    if (gueltigeStandorte.length === 0) {
      return [];
    }

    // KEIN nichtGefunden() bei fehlendem endkunde_pii: nach einem
    // Krypto-Shredding (Art. 17) ist `pseudonym_id` bewusst NEUTRALISIERT
    // (`IdentityEndkundePiiRepository.neutralisiereUndMarkGeloescht`) — ein
    // `findByPseudonymId(endkundeId)`-Treffer entfaellt dann naturgemaess,
    // OBWOHL `gueltigeStandorte` oben (energy-seitig, PII-frei) noch
    // gefunden werden. Das ist ERWARTET (D4: Standort-DEK == Endkunden-DEK,
    // beide sind nach dem Shred unlesbar) — analog zur
    // subjektSchluessel-geschreddert-Pruefung unten: leere Liste, KEIN 404.
    const endkundePii = await this.endkundePiiRepository.findByPseudonymId(endkundeId);
    if (endkundePii === undefined) {
      return [];
    }

    const subjektSchluessel = await this.subjektSchluesselRepository.findById(endkundePii.cryptoKeyId);
    if (subjektSchluessel === undefined || subjektSchluessel.keyState === 'geschreddert') {
      // Endkunde bereits krypto-geschreddert (Art. 17) — keine PII mehr
      // entschlüsselbar. Kein Fehler (analog `PiiProjektionsPolicy`-Maskierung),
      // einfach eine leere Liste.
      return [];
    }

    const piiRows = await this.standortPiiRepository.findManyByPseudonymIds(gueltigeStandorte.map((s) => s.id));
    if (piiRows.length === 0) {
      return [];
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: subjektSchluessel.wrappedDek,
      kmsKeyId: subjektSchluessel.kmsKeyId,
      algVersion: subjektSchluessel.algVersion,
    });

    return piiRows.map((pii) => ({
      id: pii.pseudonymId,
      bezeichnung: this.fieldCipher.decrypt(dek, pii.pseudonymId, FELD_BEZEICHNUNG, pii.bezeichnungEnc),
      anschrift:
        pii.anschriftEnc === null ? null : this.fieldCipher.decrypt(dek, pii.pseudonymId, FELD_ANSCHRIFT, pii.anschriftEnc),
    }));
  }
}
