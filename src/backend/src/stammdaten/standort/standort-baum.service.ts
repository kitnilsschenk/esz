import { Injectable } from '@nestjs/common';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { nichtGefunden } from '../common/problem.util';
import { mapStandortStruktur } from './standort.mapper';
import type { StandortStruktur } from './standort.types';

export interface StandortListeOptions {
  readonly wurzelId?: string;
  readonly maxTiefe?: number;
  readonly nurAktive?: boolean;
}

/**
 * ADR-0010 D5 — `read:standort` (Baum/Struktur-Lesestufe). KRITISCHE
 * INVARIANTE dieser Klasse (Arbeitsauftrag, "Diese Antwort muss ohne jeden
 * identity-Zugriff zustande kommen"): sie importiert und injiziert
 * AUSSCHLIESSLICH `energy.*`-Repositories — NIEMALS
 * `IdentityStandortPiiRepository`/`FieldCipherService`/`KeyManagementPort`.
 * Diese physische Trennung (eigene Service-Klasse statt einer gemeinsamen
 * Methode neben der PII-Batch-Entschlüsselung) macht es strukturell
 * unmöglich, versehentlich einen `identity`-Zugriff in den Baum-Lesepfad
 * einzuschleusen — s. `StandortLabelService` für die GETRENNTE
 * `read:standort_pii`-Lesestufe.
 */
@Injectable()
export class StandortBaumService {
  constructor(
    private readonly standortRepository: EnergyStandortRepository,
    private readonly zaehlerStandortRepository: EnergyZaehlerStandortRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
  ) {}

  async liste(endkundeId: string, options: StandortListeOptions): Promise<StandortStruktur[]> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const standorte = await this.standortRepository.listByEndkunde({ endkundeId, ...options });
    const zaehlerAnzahlByStandortId = await this.zaehlerStandortRepository.countAktivByStandortIds(
      standorte.map((standort) => standort.id),
    );

    return standorte.map((standort) => mapStandortStruktur(standort, zaehlerAnzahlByStandortId.get(standort.id) ?? 0));
  }
}
