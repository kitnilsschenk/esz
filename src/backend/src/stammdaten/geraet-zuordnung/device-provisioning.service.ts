import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import {
  DeviceGeraetZuordnungRepository,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '../persistence/device/device-geraet-zuordnung.repository';
import type { GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import { DeviceSchluesselRepository } from '../persistence/device/device-schluessel.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { BlindIndexService } from '../../common/crypto/blind-index.service';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { konflikt, nichtGefunden } from '../common/problem.util';
import { mapGeraetZuordnungDetail } from './geraet-zuordnung.mapper';
import type { GeraetZuordnungDetail } from './geraet-zuordnung.types';
import type { GeraetZuordnungAnlegenDto } from './dto/geraet-zuordnung-anlegen.dto';
import type { GeraetZuordnungAendernDto } from './dto/geraet-zuordnung-aendern.dto';
import { FELD_DEVEUI } from './geraet-zuordnung.constants';

interface AnlegenTxInput {
  readonly geraetZuordnungId: string;
  readonly zaehlerId: string;
  readonly cryptoKeyId: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly deveuiEnc: Buffer;
  readonly deveuiBlindIndex: Buffer;
  readonly pepperVersion: number;
}

/**
 * ADR-0005 §26.2/§26.3 (D14, O4 Vorgabe-Punkt 1/2) — Provisioning-Fach-
 * Service (Controller duenn, Business-Logik hier, `.claude/rules/
 * backend-nestjs.md`). Create ist die "NESTED-Tx über device.*"-Variante des
 * bereits etablierten `EndkundeService.anlegen()`-Musters (ADR-0008 §20):
 * (1) DEK generieren (`KeyManagementPort`, VOR dem inneren NESTED-Tx-Beginn —
 * s. dortiger Kommentar zum §19-Constraint-Stand, ADR-0008 §29(C)), (2)
 * DevEUI feldverschluesseln (AAD=`LP(zaehlerId)||LP('deveui')`) + Blind-Index
 * berechnen (`BlindIndexService`, §26.3 — NICHT abweichen von der 8-rohe-
 * Bytes-Konvention dort), (3) `device.schluessel` + `device.geraet_zuordnung`
 * in EINER `@Transactional(Propagation.Nested)`-Klammer (atomar oder gar
 * nicht).
 */
@Injectable()
export class DeviceProvisioningService {
  constructor(
    private readonly zaehlerRepository: EnergyZaehlerRepository,
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
    private readonly schluesselRepository: DeviceSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
    private readonly blindIndexService: BlindIndexService,
  ) {}

  async anlegen(zaehlerId: string, dto: GeraetZuordnungAnlegenDto): Promise<GeraetZuordnungDetail> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }

    // Frueher, freundlicher 409 VOR dem DB-Roundtrip/KMS-Aufwand (D-EXCL,
    // V0010 bleibt der eigentliche, ATOMARE Integritaets-Garant gegen ein
    // Race — dieser Vorab-Check ist reine UX, kein Sicherheitsmerkmal).
    const aktive = await this.geraetZuordnungRepository.findAktivByZaehlerId(zaehlerId);
    if (aktive !== undefined) {
      throw konflikt(
        'Fuer diesen Zaehler existiert bereits eine aktive Geraete-Zuordnung (ADR-0005 §26, D-EXCL). Zuerst deaktivieren.',
      );
    }

    // DEK VOR Tx-Beginn (ADR-0008 §19-Erbe, s. Klassen-Dok + EndkundeService.anlegen()).
    const generatedKey = await this.keyManagementPort.generateDataKey();
    const geraetZuordnungId = randomUUID();
    const cryptoKeyId = randomUUID();

    const deveuiEnc = this.fieldCipher.encrypt(generatedKey.dek, zaehlerId, FELD_DEVEUI, dto.devEui);
    const { blindIndex, pepperVersion } = await this.blindIndexService.berechne(dto.devEui);

    try {
      const zuordnung = await this.anlegenInTx({
        geraetZuordnungId,
        zaehlerId,
        cryptoKeyId,
        wrappedDek: generatedKey.wrappedDek,
        kmsKeyId: generatedKey.kmsKeyId,
        algVersion: generatedKey.algVersion,
        deveuiEnc,
        deveuiBlindIndex: blindIndex,
        pepperVersion,
      });
      return mapGeraetZuordnungDetail(zuordnung);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_EXCLUSION_VIOLATION)) {
        throw konflikt('Fuer diesen Zaehler existiert bereits eine aktive Geraete-Zuordnung (zeitlicher Overlap, D-EXCL).');
      }
      if (hatPgErrorCode(error, PG_UNIQUE_VIOLATION)) {
        // Partieller Unique-Index ux_geraet_zuordnung_blind_index_aktiv (§26.3)
        // — dieselbe DevEUI ist bereits aktiv einem ANDEREN Zaehler zugeordnet.
        // KEIN Detail-Leak (kein DevEUI-Klartext/Blind-Index in der Meldung, RL-2).
        throw konflikt('Diese DevEUI ist bereits aktiv einem anderen Zaehler zugeordnet.');
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(input: AnlegenTxInput): Promise<GeraetZuordnung> {
    await this.schluesselRepository.insert({
      id: input.cryptoKeyId,
      wrappedDek: input.wrappedDek,
      kmsKeyId: input.kmsKeyId,
      algVersion: input.algVersion,
    });

    return this.geraetZuordnungRepository.insert({
      id: input.geraetZuordnungId,
      zaehlerId: input.zaehlerId,
      cryptoKeyId: input.cryptoKeyId,
      deveuiEnc: input.deveuiEnc,
      deveuiBlindIndex: input.deveuiBlindIndex,
      pepperVersion: input.pepperVersion,
    });
  }

  /**
   * `update:geraet_zuordnung` — v1 MINIMAL: nur `aktion='deaktivieren'`
   * (status→`inaktiv`, `gueltig_bis=now()`, IDEMPOTENT — analog
   * `EnergyZaehlerRepository.stilllegen`/`NutzungsverhaeltnisService.beenden`).
   * Ein Geraete-Tausch am selben Zaehler ist v1 ZWEI Client-Aufrufe (PATCH
   * deaktivieren + POST auf die Create-Route), s. DTO-Kommentar.
   */
  async aendern(geraetZuordnungId: string, dto: GeraetZuordnungAendernDto): Promise<GeraetZuordnungDetail> {
    const existing = await this.geraetZuordnungRepository.findById(geraetZuordnungId);
    if (existing === undefined) {
      throw nichtGefunden('Geraete-Zuordnung');
    }

    if (existing.status === 'geschreddert') {
      throw konflikt('Diese Geraete-Zuordnung wurde bereits krypto-geschreddert (Art. 17) und kann nicht mehr geaendert werden.');
    }

    // dto.aktion hat aktuell nur einen erlaubten Wert (`deaktivieren`,
    // class-validator @IsIn) — trotzdem explizit statt implizit, damit ein
    // kuenftig ergaenzter Wert hier NICHT still durchfaellt.
    if (dto.aktion !== 'deaktivieren') {
      throw konflikt('Unbekannte Aktion.');
    }

    const updated = await this.geraetZuordnungRepository.deaktivieren(geraetZuordnungId);
    if (updated === undefined) {
      throw nichtGefunden('Geraete-Zuordnung');
    }
    return mapGeraetZuordnungDetail(updated);
  }
}
