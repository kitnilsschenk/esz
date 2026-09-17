import { Injectable } from '@nestjs/common';
import { EnergyMesskonzeptRepository } from '../stammdaten/persistence/energy/energy-messkonzept.repository';

/**
 * ADR-0007 B13.4/B14/O-B3b — Substitutions-Erkennung (FJ-06). Bis 2026-08-26
 * ein BEWUSSTER, dokumentierter Stub (`istSubstitutionsfall()`, freie
 * Funktion, immer `false`) — B14 hatte den WEG festgelegt („explizites Feld
 * am Messkonzept, `energietraeger_substitution boolean`, vom Betriebs-Team
 * gesetzt"), aber dieses Feld war NICHT Teil des damaligen Schemas.
 *
 * V0029 liefert das Feld (`energy.messkonzept_version_energietraeger.
 * energietraeger_substitution`). DIESE Klasse ist die reale Verdrahtung: sie
 * bleibt der EINE Ort, an dem das Merkmal ausgewertet wird —
 * `PreflightService`/`EinsparlaufService` rufen AUSSCHLIESSLICH
 * `SubstitutionErkennungService.pruefen()` auf, kein zweiter, divergierender
 * Erkennungspfad. Aus einer freien Funktion wurde ein `@Injectable()`, weil
 * die reale Prüfung — wie in der vormaligen Stub-Dokumentation bereits
 * angekündigt — eine DB-Abfrage ist und damit `TransactionHost`/Repository-
 * Injection braucht (Konsistenz mit jedem anderen Service in diesem Modul).
 *
 * Erkennungsweg (B14/D-EBENE, V0029-Migrationskopf): das Kennzeichen wirkt
 * PAARWEISE je (Endkunde, Energieträger) auf der AKTUELLEN Messkonzept-
 * Version (`EnergyMesskonzeptRepository.findAktuelleSubstitution()`) — NICHT
 * aus der mvet-Historie abgeleitet, NICHT aus einer TB-03-Schwellwert-
 * Erkennung (die B14 ausdrücklich NICHT gewählt hat).
 */
@Injectable()
export class SubstitutionErkennungService {
  constructor(private readonly messkonzeptRepository: EnergyMesskonzeptRepository) {}

  async pruefen(endkundeId: string, energietraeger: string): Promise<boolean> {
    return this.messkonzeptRepository.findAktuelleSubstitution(endkundeId, energietraeger);
  }
}
