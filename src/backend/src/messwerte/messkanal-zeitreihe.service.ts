import { Injectable } from '@nestjs/common';
import { EnergyMesskanalRepository } from '../stammdaten/persistence/energy/energy-messkanal.repository';
import { MeasurementMesswertRepository } from './persistence/measurement-messwert.repository';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import type { MesswertZeitreiheAntwort } from './messkanal-zeitreihe.types';

/**
 * `GET /messwerte/messkanaele/{messkanalId}` (`read:verbrauch_detail`,
 * break-glass-gehärtet — ADR-0008 §16/D4, WIEDERVERWENDET, NICHT aufgeweicht).
 * Liefert die ROHE Zeitreihe EINES Messkanals inkl. `qualitaet`/`herkunft` —
 * bewusst OHNE Differenzbildung/Aggregation (das leistet ausschließlich Route
 * A, `VerbrauchAggregatService`). ABAC/break-glass-Prüfung + Audit laufen
 * VOLLSTÄNDIG über die bestehende Maschinerie (`PolicyInterceptor` +
 * `AuditActionInterceptor`, s. `messkanal-zeitreihe.controller.ts`) — dieser
 * Service kennt Zweck-Header/Break-glass gar nicht.
 */
@Injectable()
export class MesskanalZeitreiheService {
  constructor(
    private readonly messkanalRepository: EnergyMesskanalRepository,
    private readonly messwertRepository: MeasurementMesswertRepository,
  ) {}

  async zeitreihe(messkanalId: string, von: string, bis: string): Promise<MesswertZeitreiheAntwort> {
    const messkanal = await this.messkanalRepository.findById(messkanalId);
    if (messkanal === undefined) {
      throw nichtGefunden('Messkanal');
    }

    if (Date.parse(von) >= Date.parse(bis)) {
      throw ungueltigeEingabe('von muss zeitlich VOR bis liegen (halboffenes Intervall [von, bis)).');
    }

    const werte = await this.messwertRepository.findRohwerte(messkanalId, von, bis);

    return {
      messkanalId: messkanal.id,
      messgroesse: messkanal.messgroesse,
      einheit: messkanal.einheit,
      art: messkanal.art,
      werte,
    };
  }
}
