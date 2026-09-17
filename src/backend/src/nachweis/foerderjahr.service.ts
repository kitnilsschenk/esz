import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SecurityContext } from '../common/security/security-context';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import { AuditService } from '../audit/audit.service';
import { NACHWEIS_EVENT_CODES } from './audit/nachweis-audit-events';
import { fensterAusMonaten, NachweisFoerderjahrRepository } from './persistence/nachweis-foerderjahr.repository';
import type { Foerderjahr } from './persistence/nachweis-foerderjahr.repository';
import { istMonatsanfang } from './zeit.util';
import type { FoerderjahrAnlegenDto } from './dto/foerderjahr-anlegen.dto';
import { toSeite } from '../stammdaten/common/seite.dto';
import type { Seite } from '../stammdaten/common/seite.dto';

/**
 * `POST /nachweis/foerderjahre` (`create:foerderjahr`, ADR-0007 B4/O1) —
 * PARAMETRISIERTE Förderjahr-Definition, NIE hart verdrahtet (§3a/O1: „beide
 * Schnitte [Kalenderjahr/Bewilligungszeitraum] sind ohne Code-Änderung
 * tragbar"). Append-only Stammdaten (`nachweis.foerderjahr`, KEIN Update-/
 * Delete-Pfad).
 */
@Injectable()
export class FoerderjahrService {
  constructor(
    private readonly foerderjahrRepository: NachweisFoerderjahrRepository,
    private readonly auditService: AuditService,
  ) {}

  async anlegen(dto: FoerderjahrAnlegenDto, subject: SecurityContext, synthetic: boolean): Promise<Foerderjahr> {
    if (!istMonatsanfang(dto.vonMonat) || !istMonatsanfang(dto.bisMonat)) {
      throw ungueltigeEingabe('vonMonat und bisMonat muessen Monatsanfaenge sein (nachweis.foerderjahr-CHECK).');
    }
    if (Date.parse(dto.vonMonat) > Date.parse(dto.bisMonat)) {
      throw ungueltigeEingabe('vonMonat muss vor oder gleich bisMonat liegen (INKLUSIVES Intervall, B4).');
    }

    // Taggenaue Grenzen (V0070) sind optional, aber wechselseitig Pflicht:
    // Eine halbe Angabe waere ein Foerderjahr, dessen eines Ende aus dem
    // Bescheid stammt und dessen anderes gerundet ist.
    if ((dto.vonTag === undefined) !== (dto.bisTag === undefined)) {
      throw ungueltigeEingabe('vonTag und bisTag sind nur GEMEINSAM zulaessig — sonst waere eine Grenze gerundet.');
    }
    const fenster =
      dto.vonTag !== undefined && dto.bisTag !== undefined
        ? { vonTag: dto.vonTag, bisTag: dto.bisTag }
        : fensterAusMonaten(dto.vonMonat, dto.bisMonat);

    if (Date.parse(fenster.vonTag) >= Date.parse(fenster.bisTag)) {
      throw ungueltigeEingabe('vonTag muss zeitlich VOR bisTag liegen (bisTag ist EXKLUSIV).');
    }
    // Die Monatsfelder sind das Etikett der taggenauen Grenzen — laufen sie
    // auseinander, wiese die Liste ein anderes Foerderjahr aus als der
    // Nachweis rechnet. Die Datenbank haelt dieselbe Grenze als CHECK (V0070);
    // hier steht sie, damit die Meldung erklaert, was gemeint ist.
    const monatVon = fenster.vonTag.slice(0, 7);
    const monatBis = new Date(Date.parse(fenster.bisTag) - 86_400_000).toISOString().slice(0, 7);
    if (monatVon !== dto.vonMonat.slice(0, 7) || monatBis !== dto.bisMonat.slice(0, 7)) {
      throw ungueltigeEingabe(
        `vonTag/bisTag (${fenster.vonTag}..${fenster.bisTag}) liegen nicht in den Monaten ` +
          `${dto.vonMonat}..${dto.bisMonat}. Die Monatsangaben sind das Etikett der taggenauen Grenzen.`,
      );
    }

    const bestehend = await this.foerderjahrRepository.findByCode(dto.code);
    if (bestehend !== undefined) {
      throw ungueltigeEingabe(`Foerderjahr-Code '${dto.code}' existiert bereits (nachweis.foerderjahr.code ist UNIQUE).`);
    }

    const foerderjahr = await this.foerderjahrRepository.insert({
      id: randomUUID(),
      code: dto.code,
      vorhabenRef: dto.vorhabenRef,
      nummer: dto.nummer,
      vonTag: fenster.vonTag,
      bisTag: fenster.bisTag,
      definitionQuelle: dto.definitionQuelle,
      bescheidRef: dto.bescheidRef ?? null,
    });

    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.FOERDERJAHR_DEFINIERT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: foerderjahr.id,
      kontext: {
        synthetic,
        foerderjahr_id: foerderjahr.id,
        foerderjahr_code: foerderjahr.code,
        nummer: foerderjahr.nummer,
        von_monat: foerderjahr.vonMonat,
        bis_monat: foerderjahr.bisMonat,
        von_tag: foerderjahr.vonTag,
        bis_tag: foerderjahr.bisTag,
        definition_quelle: foerderjahr.definitionQuelle,
      },
    });

    return foerderjahr;
  }

  async finden(id: string): Promise<Foerderjahr> {
    const foerderjahr = await this.foerderjahrRepository.findById(id);
    if (foerderjahr === undefined) {
      throw nichtGefunden('Foerderjahr');
    }
    return foerderjahr;
  }

  async liste(optionen: { readonly cursor?: string; readonly limit: number }): Promise<Seite<Foerderjahr>> {
    const result = await this.foerderjahrRepository.listPage(optionen);
    return toSeite(result.daten, result.naechsterCursor, optionen.limit);
  }
}
