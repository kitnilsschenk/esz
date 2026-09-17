import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import { EnergyMesskanalRepository, PG_UNIQUE_VIOLATION } from '../persistence/energy/energy-messkanal.repository';
import type { Messkanal } from '../persistence/energy/energy-messkanal.repository';
import { hatPgErrorCode } from '../persistence/pg-error.util';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapMesskanalDetail, mapMesskanalListItem } from './messkanal.mapper';
import type { MesskanalDetail, MesskanalListItem } from './messkanal.types';
import type { MesskanalAnlegenDto } from './dto/messkanal-anlegen.dto';
import type { MesskanalAendernDto } from './dto/messkanal-aendern.dto';

@Injectable()
export class MesskanalService {
  constructor(
    private readonly messkanalRepository: EnergyMesskanalRepository,
    private readonly zaehlerRepository: EnergyZaehlerRepository,
  ) {}

  async liste(
    zaehlerId: string,
    options: { readonly cursor?: string; readonly limit: number },
  ): Promise<Seite<MesskanalListItem>> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }

    const rows = await this.messkanalRepository.listPage({ ...options, zaehlerId });
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapMesskanalListItem), naechsterCursor, options.limit);
  }

  async detail(id: string): Promise<MesskanalDetail> {
    const messkanal = await this.messkanalRepository.findById(id);
    if (messkanal === undefined) {
      throw nichtGefunden('Messkanal');
    }
    return mapMesskanalDetail(messkanal);
  }

  async anlegen(zaehlerId: string, dto: MesskanalAnlegenDto): Promise<MesskanalDetail> {
    const zaehler = await this.zaehlerRepository.findById(zaehlerId);
    if (zaehler === undefined) {
      throw nichtGefunden('Zaehler');
    }

    try {
      const messkanal = await this.anlegenInTx(zaehlerId, dto);
      return mapMesskanalDetail(messkanal);
    } catch (error: unknown) {
      if (hatPgErrorCode(error, PG_UNIQUE_VIOLATION)) {
        throw konflikt('Ein Messkanal mit dieser Kombination aus Zaehler/Messgroesse/OBIS-Kennzahl existiert bereits.');
      }
      throw error;
    }
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(zaehlerId: string, dto: MesskanalAnlegenDto): Promise<Messkanal> {
    return this.messkanalRepository.insert({
      id: randomUUID(),
      zaehlerId,
      messgroesse: dto.messgroesse,
      einheit: dto.einheit,
      art: dto.art,
      obisKennzahl: dto.obisKennzahl ?? null,
      istUntermessung: dto.istUntermessung ?? false,
      richtung: dto.richtung ?? 'bezug',
    });
  }

  async aendern(id: string, dto: MesskanalAendernDto): Promise<MesskanalDetail> {
    if (
      dto.einheit === undefined &&
      dto.obisKennzahl === undefined &&
      dto.istUntermessung === undefined &&
      dto.richtung === undefined
    ) {
      throw ungueltigeEingabe('Mindestens ein Feld muss gesetzt sein.');
    }

    const existing = await this.messkanalRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Messkanal');
    }

    const updated = await this.messkanalRepository.update(id, {
      ...(dto.einheit !== undefined ? { einheit: dto.einheit } : {}),
      ...(dto.obisKennzahl !== undefined ? { obisKennzahl: dto.obisKennzahl } : {}),
      ...(dto.istUntermessung !== undefined ? { istUntermessung: dto.istUntermessung } : {}),
      ...(dto.richtung !== undefined ? { richtung: dto.richtung } : {}),
    });

    if (updated === undefined) {
      throw nichtGefunden('Messkanal');
    }
    return mapMesskanalDetail(updated);
  }

  /** IDEMPOTENT — Stilllegung (kein Hard-Delete, Linie 3). */
  async stilllegen(id: string): Promise<MesskanalDetail> {
    const existing = await this.messkanalRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Messkanal');
    }

    const updated = await this.messkanalRepository.stilllegen(id);
    if (updated === undefined) {
      throw nichtGefunden('Messkanal');
    }
    return mapMesskanalDetail(updated);
  }
}
