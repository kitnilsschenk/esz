import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergyMesskonzeptRepository } from '../persistence/energy/energy-messkonzept.repository';
import type { MesskonzeptVersion, MesskonzeptVersionEnergietraeger } from '../persistence/energy/energy-messkonzept.repository';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import { nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { mapMesskonzeptVersionDetail, mapMesskonzeptVersionListItem } from './messkonzept.mapper';
import type { MesskonzeptVersionDetail, MesskonzeptVersionListItem } from './messkonzept.types';
import type { MesskonzeptVersionAnlegenDto } from './dto/messkonzept-version-anlegen.dto';
import { decodeVersionCursor, encodeVersionCursor } from './version-cursor.util';

/** TB-02 ([Q3] Kap. 2.1.2): „mindestens Mittelwert aus den letzten drei Jahresabrechnungen". */
const BASELINE_MINDEST_ABRECHNUNGEN = 3;

@Injectable()
export class MesskonzeptService {
  constructor(
    private readonly messkonzeptRepository: EnergyMesskonzeptRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
  ) {}

  async listVersionen(
    endkundeId: string,
    options: { readonly cursor?: string; readonly limit: number },
  ): Promise<Seite<MesskonzeptVersionListItem>> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const header = await this.messkonzeptRepository.findHeaderByEndkundeId(endkundeId);
    if (header === undefined) {
      return toSeite([], null, options.limit);
    }

    const cursorVersionNr = options.cursor !== undefined ? decodeVersionCursor(options.cursor) : undefined;
    const rows = await this.messkonzeptRepository.listVersions(header.id, {
      ...(cursorVersionNr !== undefined ? { cursorVersionNr } : {}),
      limit: options.limit,
    });

    const hatWeitereSeite = rows.length > options.limit;
    const daten = hatWeitereSeite ? rows.slice(0, options.limit) : rows;
    const letzte = daten[daten.length - 1];
    const naechsterCursor = hatWeitereSeite && letzte !== undefined ? encodeVersionCursor(letzte.versionNr) : null;

    return toSeite(daten.map(mapMesskonzeptVersionListItem), naechsterCursor, options.limit);
  }

  async getVersion(endkundeId: string, versionNr: number): Promise<MesskonzeptVersionDetail> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const header = await this.messkonzeptRepository.findHeaderByEndkundeId(endkundeId);
    if (header === undefined) {
      throw nichtGefunden('Messkonzept');
    }

    const version = await this.messkonzeptRepository.findVersionByNr(header.id, versionNr);
    if (version === undefined) {
      throw nichtGefunden('Messkonzept-Version');
    }

    const energietraeger = await this.messkonzeptRepository.listEnergietraeger(version.id);
    return mapMesskonzeptVersionDetail(version, energietraeger);
  }

  /** Append-only (Linie 3) — legt eine NEUE Version an, schließt die bisherige aktuelle. */
  async anlegenVersion(endkundeId: string, dto: MesskonzeptVersionAnlegenDto): Promise<MesskonzeptVersionDetail> {
    const endkunde = await this.endkundeRepository.findById(endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const { version, energietraeger } = await this.anlegenVersionInTx(endkundeId, dto);
    return mapMesskonzeptVersionDetail(version, energietraeger);
  }

  @Transactional(Propagation.Nested)
  private async anlegenVersionInTx(
    endkundeId: string,
    dto: MesskonzeptVersionAnlegenDto,
  ): Promise<{ readonly version: MesskonzeptVersion; readonly energietraeger: MesskonzeptVersionEnergietraeger[] }> {
    let header = await this.messkonzeptRepository.findHeaderByEndkundeId(endkundeId);
    if (header === undefined) {
      header = await this.messkonzeptRepository.insertHeader({ id: randomUUID(), endkundeId });
    }

    const maxVersionNr = await this.messkonzeptRepository.findMaxVersionNr(header.id);
    const naechsteVersionNr = maxVersionNr + 1;
    const gueltigVon = new Date().toISOString();

    if (maxVersionNr > 0) {
      await this.messkonzeptRepository.closeCurrentVersion(header.id, gueltigVon);
    }

    const version = await this.messkonzeptRepository.insertVersion({
      id: randomUUID(),
      messkonzeptId: header.id,
      versionNr: naechsteVersionNr,
      typ: dto.typ,
      systemgrenze: dto.systemgrenze,
      systembeschreibung: dto.systembeschreibung,
      bereinigungsverfahren: dto.bereinigungsverfahren,
      messgeraeteWahl: dto.messgeraeteWahl,
      geraeteerkennungsVerfahren: dto.geraeteerkennungsVerfahren,
      aenderungsgrund: dto.aenderungsgrund ?? null,
      gueltigVon,
    });

    // TB-02 ([Q3] Kap. 2.1.2, V0065): Bei weniger als drei Jahresabrechnungen
    // ist eine Begruendung zu dokumentieren.
    //
    // Der DB-CHECK ist der Backstop und wuerde als 500 durchschlagen — der
    // Betrieb bekaeme "interner Fehler" fuer ein ausgefuelltes Formular. Die
    // Pruefung steht deshalb HIER, VOR dem Schreiben, und benennt die
    // Auflage. Die Reihenfolge ist dieselbe wie bei jeder anderen
    // fail-closed-Regel im Repo: App-Pruefung mit Klartext, DB-CHECK als
    // zweite Verteidigungslinie gegen einen zweiten Schreibpfad.
    for (const eintrag of dto.energietraeger) {
      const anzahl = eintrag.baselineAbrechnungenAnzahl;
      const begruendung = eintrag.baselineBegruendung?.trim() ?? '';
      if (anzahl !== undefined && anzahl < BASELINE_MINDEST_ABRECHNUNGEN && begruendung.length === 0) {
        throw ungueltigeEingabe(
          `Energietraeger '${eintrag.energietraeger}': Die Baseline stuetzt sich auf ${String(anzahl)} Jahresabrechnung(en). ` +
            `Das Technische Merkblatt verlangt den Mittelwert aus mindestens ${String(BASELINE_MINDEST_ABRECHNUNGEN)} Abrechnungen ` +
            `und bei weniger eine dokumentierte Begruendung (TB-02, Kap. 2.1.2) — bitte baselineBegruendung ausfuellen.`,
        );
      }
    }

    const energietraeger = [];
    for (const eintrag of dto.energietraeger) {
      // Sequenzielle Inserts derselben Tx, kleine Menge (<=20, Contract maxItems) — bewusst kein Promise.all (Reihenfolge/Fehlerbehandlung je Zeile).
      const inserted = await this.messkonzeptRepository.insertEnergietraeger({
        id: randomUUID(),
        messkonzeptVersionId: version.id,
        energietraeger: eintrag.energietraeger,
        baselineWert: eintrag.baselineWert ?? null,
        baselineEinheit: eintrag.baselineEinheit ?? null,
        baselineMethode: eintrag.baselineMethode ?? null,
        baselineBegruendung: eintrag.baselineBegruendung ?? null,
        baselineAbrechnungenAnzahl: eintrag.baselineAbrechnungenAnzahl ?? null,
        baselineBelegAktenzeichen: eintrag.baselineBelegAktenzeichen ?? null,
        baselineBelegAblageort: eintrag.baselineBelegAblageort ?? null,
        baselineBelegRef: eintrag.baselineBelegRef ?? null,
        energietraegerSubstitution: eintrag.energietraegerSubstitution ?? false,
      });
      energietraeger.push(inserted);
    }

    return { version, energietraeger };
  }
}
