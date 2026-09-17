import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { SecurityContext } from '../common/security/security-context';
import { nichtGefunden, ungueltigeEingabe } from '../stammdaten/common/problem.util';
import { AuditService } from '../audit/audit.service';
import { NACHWEIS_EVENT_CODES, NACHWEIS_FEHLER_CODES } from './audit/nachweis-audit-events';
import { NachweisFehlerException } from './nachweis-fehler.exception';
import { NachweisExportRepository } from './persistence/nachweis-export.repository';
import { NachweisEinsparlaufRepository } from './persistence/nachweis-einsparlauf.repository';
import { NachweisPreflightRepository } from './persistence/nachweis-preflight.repository';
import { NachweisEinreichungRepository } from './persistence/nachweis-einreichung.repository';
import type { Einreichung, EinreichungDifferenzZeile } from './persistence/nachweis-einreichung.repository';
import { berechneEinreichungDifferenz, klassifiziereDifferenzRichtung } from './domain/einreichung-differenz';
import type { DifferenzZeile } from './domain/einreichung-differenz';
import type { EinreichungAnlegenDto } from './dto/einreichung-anlegen.dto';
import { toSeite } from '../stammdaten/common/seite.dto';
import type { Seite } from '../stammdaten/common/seite.dto';

/**
 * `POST /nachweis/exporte/{id}/einreichungen` (`create:einreichung`) +
 * `GET /nachweis/einreichungen/{id}[/differenzen]` (`read:einreichung`) —
 * ADR-0007 D7/B7/B10.
 *
 * **Ehrlichkeitsklausel (B7 wörtlich):** dieser Dienst VERMERKT die vom
 * Bediener ERKLÄRTE Übermittlung — er bezeugt NICHT den Empfang durch die
 * Behörde. Die Methode heißt deshalb `vermerken()`, nicht `zustellen()`.
 *
 * **Kein Vier-Augen für `create:einreichung`** (User-Beschluss B14/C8) —
 * dieser Dienst prüft daher NUR fachliche Fail-closed-Vorbedingungen
 * (D7/D-EINREICHUNG-BACKSTOP), KEINE Freigabe-Workflow-Logik.
 */
@Injectable()
export class EinreichungService {
  constructor(
    private readonly exportRepository: NachweisExportRepository,
    private readonly einsparlaufRepository: NachweisEinsparlaufRepository,
    private readonly preflightRepository: NachweisPreflightRepository,
    private readonly einreichungRepository: NachweisEinreichungRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * `synthetic` im Audit-Kontext wird aus `einsparlauf.synthetic` geerbt
   * (GENAU wie bei `NachweisExportService`, s. dortiger Kommentar) — UND ist
   * hier durch den D7-Fail-closed-Vorabcheck (`synthetic=true` ⇒ CONFLICT,
   * s. u.) an dieser Stelle strukturell IMMER `false`: eine erfolgreiche
   * Einreichung kann nie einen synthetischen Einsparlauf betreffen.
   */
  async vermerken(exportId: string, dto: EinreichungAnlegenDto, subject: SecurityContext): Promise<Einreichung> {
    // DTO-Kohärenz (DB-CHECK ck_einreichung_ersetzt_kohaerenz ist der Backstop) —
    // `@ValidateIf` im DTO deckt nur EINE Richtung ab (Format von korrekturGrundCode,
    // WENN ersetztEinreichungId gesetzt ist), s. dortigen Kommentar.
    if (dto.ersetztEinreichungId !== undefined && dto.korrekturGrundCode === undefined) {
      throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.KORREKTUR_OHNE_GRUND, HttpStatus.BAD_REQUEST, 'ersetztEinreichungId verlangt einen korrekturGrundCode (D7).');
    }
    if (dto.ersetztEinreichungId === undefined && dto.korrekturGrundCode !== undefined) {
      throw ungueltigeEingabe('korrekturGrundCode ist nur zusammen mit ersetztEinreichungId zulaessig (D7).');
    }

    const exportRow = await this.exportRepository.findById(exportId);
    if (exportRow === undefined) {
      throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.EXPORT_NICHT_GEFUNDEN, HttpStatus.NOT_FOUND, `Export ${exportId} wurde nicht gefunden.`);
    }
    const einsparlauf = await this.einsparlaufRepository.findById(exportRow.einsparlaufId);
    if (einsparlauf === undefined) {
      throw nichtGefunden('Einsparlauf');
    }

    // D7/D-EINREICHUNG-BACKSTOP — App-seitige Vorwegnahme des DB-Triggers
    // `nachweis.pruefe_einreichung_faehig()` (sprechendes ProblemDetails statt
    // roher 23514/P0001-Exception; der Trigger bleibt der fail-closed Backstop).
    if (einsparlauf.art !== 'foerderjahr_nachweis') {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.EINREICHUNG_NICHT_FAEHIG,
        HttpStatus.CONFLICT,
        `Einsparlauf ${einsparlauf.id} hat art='${einsparlauf.art}' — nur art=foerderjahr_nachweis ist einreichbar (D4/B7).`,
      );
    }
    if (einsparlauf.synthetic) {
      throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.EINREICHUNG_NICHT_FAEHIG, HttpStatus.CONFLICT, `Einsparlauf ${einsparlauf.id} ist synthetic=true — niemals einreichbar (B7).`);
    }
    const preflight = await this.preflightRepository.findById(einsparlauf.preflightId);
    if (preflight === undefined || preflight.ergebnis !== 'gruen') {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.EINREICHUNG_NICHT_FAEHIG,
        HttpStatus.CONFLICT,
        `Preflight zu Einsparlauf ${einsparlauf.id} ist nicht gruen — Einreichung abgewiesen (D4/B7).`,
      );
    }

    let differenzZeilen: readonly DifferenzZeile[] = [];
    if (dto.ersetztEinreichungId !== undefined) {
      const ersetzteEinreichung = await this.einreichungRepository.findById(dto.ersetztEinreichungId);
      if (ersetzteEinreichung === undefined) {
        throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.EINREICHUNG_NICHT_GEFUNDEN, HttpStatus.BAD_REQUEST, `ersetztEinreichungId ${dto.ersetztEinreichungId} wurde nicht gefunden.`);
      }
      if (einsparlauf.ersetztEinsparlaufId === null) {
        throw new NachweisFehlerException(
          NACHWEIS_FEHLER_CODES.KORREKTUR_OHNE_ERSETZTEN_LAUF,
          HttpStatus.BAD_REQUEST,
          `Der Export ${exportId} basiert auf einem Einsparlauf OHNE ersetzt_einsparlauf_id — eine Korrektur-Einreichung verlangt einen Ersatz-Lauf (B7 Punkt 1-3).`,
        );
      }
      const altSeite = await this.einsparlaufRepository.findErgebnisseByLaufId(einsparlauf.ersetztEinsparlaufId, { limit: 10_000 });
      const neuSeite = await this.einsparlaufRepository.findErgebnisseByLaufId(einsparlauf.id, { limit: 10_000 });
      differenzZeilen = berechneEinreichungDifferenz(
        altSeite.daten.map((e) => ({ endkundeId: e.endkundeId, energietraeger: e.energietraeger, einsparungKwhEndenergie: e.einsparungKwhEndenergie })),
        neuSeite.daten.map((e) => ({ endkundeId: e.endkundeId, energietraeger: e.energietraeger, einsparungKwhEndenergie: e.einsparungKwhEndenergie })),
      );
    }

    const einreichung = await this.einreichungRepository.insertEinreichung({
      id: randomUUID(),
      exportId,
      einsparlaufId: exportRow.einsparlaufId,
      art: dto.art,
      anfrageRef: dto.anfrageRef ?? null,
      empfaenger: dto.empfaenger ?? 'bafa',
      uebermittlungsweg: dto.uebermittlungsweg,
      manifestHash: exportRow.manifestHash,
      uebermitteltAt: dto.uebermitteltAt,
      eingereichtVonSub: subject.sub,
      belegRef: dto.belegRef ?? null,
      ersetztEinreichungId: dto.ersetztEinreichungId ?? null,
      korrekturGrundCode: dto.korrekturGrundCode ?? null,
    });

    if (differenzZeilen.length > 0) {
      const ursacheCode = dto.korrekturGrundCode as string;
      await this.einreichungRepository.insertDifferenzZeilen(
        einreichung.id,
        differenzZeilen.map((z) => ({
          endkundeId: z.endkundeId,
          energietraeger: z.energietraeger,
          wertAltKwh: z.wertAltKwh,
          wertNeuKwh: z.wertNeuKwh,
          deltaKwh: z.deltaKwh,
          ursacheCode,
        })),
      );
    }

    const differenzRichtung = differenzZeilen.length === 0 ? 'unveraendert' : klassifiziereDifferenzRichtung(differenzZeilen);
    await this.auditService.append({
      eventTyp: dto.ersetztEinreichungId === undefined ? NACHWEIS_EVENT_CODES.EINREICHUNG_VERMERKT : NACHWEIS_EVENT_CODES.EINREICHUNG_KORRIGIERT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: einreichung.id,
      // NIEMALS `null` als Kontext-Wert (V0003 `audit.event_seal()`-Trigger —
      // `jsonb_typeof(null)` ist KEIN erlaubter Skalartyp). Nullable Felder
      // werden bei Abwesenheit AUSGELASSEN, nicht als `null` mitgegeben.
      kontext: {
        synthetic: einsparlauf.synthetic,
        einreichung_id: einreichung.id,
        export_id: exportId,
        einsparlauf_id: exportRow.einsparlaufId,
        art: einreichung.art,
        ...(einreichung.anfrageRef !== null ? { anfrage_ref: einreichung.anfrageRef } : {}),
        uebermittlungsweg: einreichung.uebermittlungsweg,
        empfaenger: einreichung.empfaenger,
        manifest_hash: einreichung.manifestHash.toString('hex'),
        ...(einreichung.ersetztEinreichungId !== null ? { ersetzt_einreichung_id: einreichung.ersetztEinreichungId } : {}),
        ...(einreichung.korrekturGrundCode !== null ? { korrektur_grund_code: einreichung.korrekturGrundCode } : {}),
        differenz_positionen_anzahl: differenzZeilen.length,
        differenz_richtung: differenzRichtung,
      },
    });

    return einreichung;
  }

  async finden(id: string): Promise<Einreichung> {
    const einreichung = await this.einreichungRepository.findById(id);
    if (einreichung === undefined) {
      throw nichtGefunden('Einreichung');
    }
    return einreichung;
  }

  async differenzen(
    einreichungId: string,
    optionen: { readonly cursorEndkundeId?: string; readonly cursorEnergietraeger?: string; readonly limit: number },
  ): Promise<Seite<EinreichungDifferenzZeile>> {
    await this.finden(einreichungId);
    const cursorPaar =
      optionen.cursorEndkundeId !== undefined && optionen.cursorEnergietraeger !== undefined
        ? { endkundeId: optionen.cursorEndkundeId, energietraeger: optionen.cursorEnergietraeger }
        : undefined;
    const result = await this.einreichungRepository.findDifferenzenByEinreichungId(einreichungId, { ...(cursorPaar !== undefined ? { cursorPaar } : {}), limit: optionen.limit });
    const naechsterCursor = result.naechsterCursor === null ? null : `${result.naechsterCursor.endkundeId}:${result.naechsterCursor.energietraeger}`;
    return toSeite(result.daten, naechsterCursor, optionen.limit);
  }
}
