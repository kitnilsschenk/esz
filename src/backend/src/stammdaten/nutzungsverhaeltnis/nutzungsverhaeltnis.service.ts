import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergyAnschlussnutzerRepository } from '../persistence/energy/energy-anschlussnutzer.repository';
import { EnergySystemRepository } from '../persistence/energy/energy-system.repository';
import {
  EnergyNutzungsverhaeltnisRepository,
  PG_EXCLUSION_VIOLATION,
} from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import type { Nutzungsverhaeltnis } from '../persistence/energy/energy-nutzungsverhaeltnis.repository';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapNutzungsverhaeltnisDetail, mapNutzungsverhaeltnisListItem } from './nutzungsverhaeltnis.mapper';
import type { NutzungsverhaeltnisDetail, NutzungsverhaeltnisListItem } from './nutzungsverhaeltnis.types';
import type { NutzungsverhaeltnisAnlegenDto } from './dto/nutzungsverhaeltnis-anlegen.dto';
import type { NutzungsverhaeltnisBeendenDto } from './dto/nutzungsverhaeltnis-beenden.dto';

/**
 * ADR-0008 §20 (D8, B2, `backend-lead`-Votum 7) — Referenzkonsistenz-SELECT
 * VOR dem Insert: es gibt KEINE cross-namespace-FK und beim
 * Nutzungsverhältnis keine DB-erzwungene Endkunde-Kohärenz (Linie 5, kein
 * `energy ↔ identity`- bzw. hier `system`/`anschlussnutzer`-übergreifender
 * FK-Constraint auf `endkunde_id`) — der Service MUSS vor dem Insert
 * sicherstellen, dass `anschlussnutzer.endkunde_id` UND `system.endkunde_id`
 * zum übergebenen `endkundeId` passen. Mismatch → 400 (nicht stumm anlegen).
 */
@Injectable()
export class NutzungsverhaeltnisService {
  constructor(
    private readonly nutzungsverhaeltnisRepository: EnergyNutzungsverhaeltnisRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly anschlussnutzerRepository: EnergyAnschlussnutzerRepository,
    private readonly systemRepository: EnergySystemRepository,
  ) {}

  async liste(options: {
    readonly cursor?: string;
    readonly limit: number;
    readonly endkundeId?: string;
    readonly anschlussnutzerId?: string;
    readonly systemId?: string;
    readonly nurAktuelle?: boolean;
  }): Promise<Seite<NutzungsverhaeltnisListItem>> {
    const rows = await this.nutzungsverhaeltnisRepository.listPage(options);
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapNutzungsverhaeltnisListItem), naechsterCursor, options.limit);
  }

  async detail(id: string): Promise<NutzungsverhaeltnisDetail> {
    const nutzung = await this.nutzungsverhaeltnisRepository.findById(id);
    if (nutzung === undefined) {
      throw nichtGefunden('Nutzungsverhaeltnis');
    }
    return mapNutzungsverhaeltnisDetail(nutzung);
  }

  async anlegen(dto: NutzungsverhaeltnisAnlegenDto): Promise<NutzungsverhaeltnisDetail> {
    const [endkunde, anschlussnutzer, system] = await Promise.all([
      this.endkundeRepository.findById(dto.endkundeId),
      this.anschlussnutzerRepository.findById(dto.anschlussnutzerId),
      this.systemRepository.findById(dto.systemId),
    ]);

    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }
    if (anschlussnutzer === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }
    if (system === undefined) {
      throw nichtGefunden('System');
    }

    // Referenzkonsistenz-SELECT (B2) — Mismatch => 400, NICHT stumm anlegen.
    if (anschlussnutzer.endkundeId !== dto.endkundeId) {
      throw ungueltigeEingabe('anschlussnutzerId gehoert nicht zum angegebenen endkundeId.');
    }
    if (system.endkundeId !== dto.endkundeId) {
      throw ungueltigeEingabe('systemId gehoert nicht zum angegebenen endkundeId.');
    }

    try {
      const nutzung = await this.anlegenInTx(dto);
      return mapNutzungsverhaeltnisDetail(nutzung);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_EXCLUSION_VIOLATION)) {
        throw konflikt('Zeitlicher Overlap: es existiert bereits ein aktuelles Nutzungsverhaeltnis fuer diese Anschlussnutzer/System-Kombination.');
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(dto: NutzungsverhaeltnisAnlegenDto): Promise<Nutzungsverhaeltnis> {
    return this.nutzungsverhaeltnisRepository.insert({
      id: randomUUID(),
      endkundeId: dto.endkundeId,
      anschlussnutzerId: dto.anschlussnutzerId,
      systemId: dto.systemId,
      datenklasse: dto.datenklasse ?? 'abrechnungsminimum',
      rolle: dto.rolle,
      gueltigVon: dto.gueltigVon,
    });
  }

  /**
   * IDEMPOTENT bezüglich DESSELBEN Endzeitpunkts (api-contracts.md): ein
   * bereits mit `gueltigBis=X` beendetes Verhältnis, erneut mit `X` beendet,
   * liefert denselben 200er. Ein ABWEICHENDER Endzeitpunkt auf einem bereits
   * beendeten Verhältnis ist ein Konflikt (409) — kein stilles Überschreiben
   * einer Fachhistorie.
   */
  async beenden(id: string, dto: NutzungsverhaeltnisBeendenDto): Promise<NutzungsverhaeltnisDetail> {
    const existing = await this.nutzungsverhaeltnisRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Nutzungsverhaeltnis');
    }

    if (existing.gueltigBis !== null) {
      if (existing.gueltigBis === dto.gueltigBis) {
        return mapNutzungsverhaeltnisDetail(existing);
      }
      throw konflikt('Das Nutzungsverhaeltnis ist bereits mit einem abweichenden Endzeitpunkt beendet.');
    }

    const updated = await this.nutzungsverhaeltnisRepository.beenden(id, dto.gueltigBis);
    if (updated === undefined) {
      throw nichtGefunden('Nutzungsverhaeltnis');
    }
    return mapNutzungsverhaeltnisDetail(updated);
  }
}
