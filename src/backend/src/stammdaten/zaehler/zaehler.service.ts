import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergySystemRepository } from '../persistence/energy/energy-system.repository';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import type { Zaehler } from '../persistence/energy/energy-zaehler.repository';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapZaehlerDetail, mapZaehlerListItem } from './zaehler.mapper';
import {
  DeviceGeraetZuordnungRepository,
  type GeraetZuordnung,
} from '../persistence/device/device-geraet-zuordnung.repository';
import type { ZaehlerDetail, ZaehlerListItem } from './zaehler.types';
import type { ZaehlerAnlegenDto } from './dto/zaehler-anlegen.dto';
import type { ZaehlerAendernDto } from './dto/zaehler-aendern.dto';

@Injectable()
export class ZaehlerService {
  constructor(
    private readonly zaehlerRepository: EnergyZaehlerRepository,
    private readonly systemRepository: EnergySystemRepository,
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
  ) {}

  /**
   * Aktive Geraete-Zuordnung fuer die Anzeige am Zaehler (ADR-0011 D7).
   * Liest ausschliesslich den Lebenszyklus-Zustand; DevEUI und Blind-Index
   * bleiben in der Persistenzschicht (s. `mapZaehlerDetail`).
   */
  private async ladeAnbindung(zaehlerId: string): Promise<GeraetZuordnung | undefined> {
    return this.geraetZuordnungRepository.findAktivByZaehlerId(zaehlerId);
  }

  async liste(options: {
    readonly cursor?: string;
    readonly limit: number;
    readonly systemId?: string;
  }): Promise<Seite<ZaehlerListItem>> {
    const rows = await this.zaehlerRepository.listPage(options);
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapZaehlerListItem), naechsterCursor, options.limit);
  }

  async detail(id: string): Promise<ZaehlerDetail> {
    const zaehler = await this.zaehlerRepository.findById(id);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }
    return mapZaehlerDetail(zaehler, await this.ladeAnbindung(zaehler.id));
  }

  async anlegen(dto: ZaehlerAnlegenDto): Promise<ZaehlerDetail> {
    const system = await this.systemRepository.findById(dto.systemId);
    if (system === undefined) {
      throw nichtGefunden('System');
    }

    const zaehler = await this.anlegenInTx(dto);
    // Ein frisch angelegter Zaehler kann keine Zuordnung haben — die Abfrage
    // waere garantiert leer und wird deshalb gespart.
    return mapZaehlerDetail(zaehler, undefined);
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(dto: ZaehlerAnlegenDto): Promise<Zaehler> {
    return this.zaehlerRepository.insert({
      id: randomUUID(),
      systemId: dto.systemId,
      geraetetyp: dto.geraetetyp,
      energietraeger: dto.energietraeger,
    });
  }

  async aendern(id: string, dto: ZaehlerAendernDto): Promise<ZaehlerDetail> {
    if (dto.geraetetyp === undefined) {
      throw ungueltigeEingabe('Mindestens ein Feld muss gesetzt sein.');
    }

    const existing = await this.zaehlerRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Zaehler');
    }

    const updated = await this.zaehlerRepository.updateGeraetetyp(id, dto.geraetetyp);
    if (updated === undefined) {
      throw nichtGefunden('Zaehler');
    }
    return mapZaehlerDetail(updated, await this.ladeAnbindung(id));
  }

  /** IDEMPOTENT — Stilllegung (kein Hard-Delete, Linie 3). */
  async stilllegen(id: string): Promise<ZaehlerDetail> {
    const existing = await this.zaehlerRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Zaehler');
    }

    const updated = await this.zaehlerRepository.stilllegen(id);
    if (updated === undefined) {
      throw nichtGefunden('Zaehler');
    }
    // Das Stilllegen beendet eine aktive Geraete-Zuordnung NICHT (ADR-0011
    // O6, offene fachliche Frage). Die Antwort weist sie deshalb weiterhin
    // aus, statt sie zu verschweigen.
    return mapZaehlerDetail(updated, await this.ladeAnbindung(id));
  }
}
