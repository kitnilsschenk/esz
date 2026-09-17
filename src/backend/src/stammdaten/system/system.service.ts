import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergySystemRepository } from '../persistence/energy/energy-system.repository';
import { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';
import type { System } from '../persistence/energy/energy-system.repository';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapSystemDetail, mapSystemListItem } from './system.mapper';
import type { SystemDetail, SystemListItem } from './system.types';
import type { SystemAnlegenDto } from './dto/system-anlegen.dto';
import type { SystemAendernDto } from './dto/system-aendern.dto';

/**
 * ADR-0008 §12/§20 — System = CRUD in v1 (`DELETE` = Stilllegung, kein
 * Hard-Delete, Linie 3). `energy.system` hatte in V0002 keine Sperr-Spalte
 * für Deaktivierung; die V0005-`status`-Spalte wird seit dieser Route
 * exponiert und per `stilllegen()` geschaltet — analog `ZaehlerService`.
 */
@Injectable()
export class SystemService {
  constructor(
    private readonly systemRepository: EnergySystemRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly standortRepository: EnergyStandortRepository,
  ) {}

  /**
   * Der Standort muss DEMSELBEN Endkunden gehoeren.
   *
   * Die Datenbank haelt das ohnehin auf — `fk_system_standort_mandant` ist
   * ein zusammengesetzter Fremdschluessel auf `(id, endkunde_id)` (V0074).
   * Aber sie antwortet darauf mit einem 500, und ein Mandantenbruch, der als
   * Serverfehler erscheint, sieht aus wie ein Ausfall statt wie eine
   * abgewiesene Eingabe. Dieselbe Linie wie bei der Systemgrenze.
   */
  private async pruefeStandort(standortId: string | undefined, endkundeId: string): Promise<void> {
    if (standortId === undefined) {
      return;
    }
    const standort = await this.standortRepository.findById(standortId);
    if (standort === undefined) {
      throw nichtGefunden('Standort');
    }
    if (standort.endkundeId !== endkundeId) {
      throw ungueltigeEingabe(
        'Der Standort gehoert zu einem anderen Endkunden. Ein System bezieht sich auf einen Standort ' +
          'DESSELBEN Kunden — der Einsparungsnachweis rechnet je Energietraeger und Standort eines Endkunden.',
      );
    }
  }

  async liste(options: {
    readonly cursor?: string;
    readonly limit: number;
    readonly endkundeId?: string;
  }): Promise<Seite<SystemListItem>> {
    const rows = await this.systemRepository.listPage(options);
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapSystemListItem), naechsterCursor, options.limit);
  }

  async detail(id: string): Promise<SystemDetail> {
    const system = await this.systemRepository.findById(id);
    if (system === undefined) {
      throw nichtGefunden('System');
    }
    return mapSystemDetail(system);
  }

  async anlegen(dto: SystemAnlegenDto): Promise<SystemDetail> {
    const endkunde = await this.endkundeRepository.findById(dto.endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    await this.pruefeStandort(dto.standortId, dto.endkundeId);

    const system = await this.anlegenInTx(dto);
    return mapSystemDetail(system);
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(dto: SystemAnlegenDto): Promise<System> {
    return this.systemRepository.insert({
      id: randomUUID(),
      endkundeId: dto.endkundeId,
      bezeichnung: dto.bezeichnung,
      systemgrenze: dto.systemgrenze,
      systembeschreibung: dto.systembeschreibung ?? null,
      standortId: dto.standortId ?? null,
    });
  }

  async aendern(id: string, dto: SystemAendernDto): Promise<SystemDetail> {
    if (
      dto.bezeichnung === undefined &&
      dto.systemgrenze === undefined &&
      dto.systembeschreibung === undefined &&
      dto.standortId === undefined
    ) {
      throw ungueltigeEingabe('Mindestens ein Feld muss gesetzt sein.');
    }

    const existing = await this.systemRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('System');
    }

    await this.pruefeStandort(dto.standortId, existing.endkundeId);

    const system = await this.aendernInTx(id, dto);
    return mapSystemDetail(system);
  }

  @Transactional(Propagation.Nested)
  private async aendernInTx(id: string, dto: SystemAendernDto): Promise<System> {
    const updated = await this.systemRepository.update(id, {
      ...(dto.bezeichnung !== undefined ? { bezeichnung: dto.bezeichnung } : {}),
      ...(dto.systemgrenze !== undefined ? { systemgrenze: dto.systemgrenze } : {}),
      ...(dto.systembeschreibung !== undefined ? { systembeschreibung: dto.systembeschreibung } : {}),
      ...(dto.standortId !== undefined ? { standortId: dto.standortId } : {}),
    });

    if (updated === undefined) {
      throw nichtGefunden('System');
    }
    return updated;
  }

  /** IDEMPOTENT — Stilllegung (kein Hard-Delete, Linie 3), analog `ZaehlerService.stilllegen`. */
  async stilllegen(id: string): Promise<SystemDetail> {
    const existing = await this.systemRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('System');
    }

    const updated = await this.systemRepository.stilllegen(id);
    if (updated === undefined) {
      throw nichtGefunden('System');
    }
    return mapSystemDetail(updated);
  }
}
