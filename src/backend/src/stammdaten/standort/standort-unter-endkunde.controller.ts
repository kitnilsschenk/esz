import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { StandortBaumService } from './standort-baum.service';
import { StandortLabelService } from './standort-label.service';
import { StandortService } from './standort.service';
import { StandortAnlegenDto } from './dto/standort-anlegen.dto';
import { StandortListeQueryDto } from './dto/standort-liste-query.dto';
import { StandortLabelsAnfrageDto } from './dto/standort-labels-anfrage.dto';
import type { StandortLabelItem, StandortStruktur } from './standort.types';

/**
 * `/stammdaten/endkunden/{endkundeId}/standorte` (stammdaten.openapi.yaml,
 * ADR-0010 §5). Trägt BEIDE Lesestufen (D5) UND das Anlegen — analog
 * `MesskanalUnterZaehlerController`-Muster (nested Liste+Create unter dem
 * Parent).
 *
 * KRITISCHE TRENNUNG (D5, Arbeitsauftrag): `liste()` ruft AUSSCHLIESSLICH
 * `StandortBaumService` (garantiert `identity`-frei) — `labels()`
 * AUSSCHLIESSLICH `StandortLabelService` (der einzige Ort mit
 * Entschlüsselungs-Zugriff). Diese Klassen sind physisch getrennt (s.
 * deren Klassen-Dok) — dieser Controller injiziert beide, ruft aber NIE
 * eine Methode "quer" auf.
 */
@Controller('stammdaten/endkunden/:endkundeId/standorte')
export class StandortUnterEndkundeController {
  constructor(
    private readonly standortBaumService: StandortBaumService,
    private readonly standortLabelService: StandortLabelService,
    private readonly standortService: StandortService,
  ) {}

  /**
   * `read:standort` — Baum/Struktur, PII-frei (D5). Rollen `betrieb`/
   * `compliance-auditor` (Auswerte-Rollen, ADR-0010 §5 wörtlich).
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:standort')
  @Get()
  async liste(
    @Param('endkundeId') endkundeId: string,
    @Query() query: StandortListeQueryDto,
  ): Promise<StandortStruktur[]> {
    return this.standortBaumService.liste(endkundeId, {
      ...(query.wurzelId !== undefined ? { wurzelId: query.wurzelId } : {}),
      ...(query.maxTiefe !== undefined ? { maxTiefe: query.maxTiefe } : {}),
      ...(query.nurAktive !== undefined ? { nurAktive: query.nurAktive } : {}),
    });
  }

  /**
   * `read:standort_pii` — Batch-Entschlüsselung (D5). NUR `betrieb`
   * (`compliance-auditor` bleibt strukturell ausgeschlossen, RBAC UND PDP
   * `standort_pii_auditor_verboten`, Defense-in-Depth). EIN Audit-Event je
   * Aufruf (`kontext.anzahl_knoten`), NICHT eines je Knoten (D5 wörtlich).
   */
  @Roles('betrieb')
  @Fachaktion('read:standort_pii')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortLabelItem[]>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_PII_EINSICHT,
    // objekt_ref bleibt NULL (Batch ueber mehrere Standorte, V0018-Kommentar
    // woertlich: "objekt_ref TYPISCHERWEISE NULL").
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ request }) => (request.params as Record<string, string | undefined>)['endkundeId'],
      anzahl_knoten: ({ result }) => result?.length,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('labels')
  async labels(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: StandortLabelsAnfrageDto,
  ): Promise<StandortLabelItem[]> {
    return this.standortLabelService.labels(endkundeId, dto.standortIds);
  }

  /** `create:standort` — Rolle `betrieb`. PII-Schreibroute (bezeichnung Pflicht, D4). */
  @Roles('betrieb')
  @Fachaktion('create:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortStruktur>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ result }) => result?.endkundeId,
      typ: ({ result }) => result?.typ,
      ebene: ({ result }) => result?.ebene,
      // audit.event_seal() (V0003) akzeptiert KEIN JSON-`null` als Kontext-
      // Wert (jsonb_typeof('null') faellt nicht in die Whitelist) —
      // `?? undefined` laesst den Key bei Wurzelknoten (parentId===null)
      // entfallen, statt ein verbotenes `null` zu senden.
      parent_id_neu: ({ result }) => result?.parentId ?? undefined,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: StandortAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortStruktur> {
    const result = await this.standortService.anlegen(endkundeId, dto);
    response.setHeader('Location', `/stammdaten/standorte/${result.id}`);
    return result;
  }
}
