import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { EinflussgroesseService } from './einflussgroesse.service';
import { EinflussgroesseErfassenDto } from './dto/einflussgroesse-erfassen.dto';
import type { EinflussgroesseDetail } from './einflussgroesse.types';

/**
 * `/stammdaten/systeme/{systemId}/einflussgroessen` (schemas/openapi/stammdaten.openapi.yaml,
 * ADR-0006 Teil B, B8/B10) — Erfassen (`create:einflussgroesse`) + Klartext-
 * Liste (`read:einflussgroesse`, IMMER auditiert) je System (RL-B1-
 * Bilanzebene, A1).
 *
 * BEIDE Routen `@Roles('betrieb')` NUR — `compliance-auditor` bleibt
 * strukturell ausgeschlossen (RBAC UND eine eigenständige PDP-Deny-Regel,
 * `InCodePolicyAdapter.einflussgroesse_auditor_verboten`, Defense-in-Depth,
 * analog `read:standort_pii`/`read:geraet_zuordnung`) — B10: "Klartext-PII-
 * Leseaktion, immer audit-pflichtig, Auditor-Deny".
 */
@Controller('stammdaten/systeme/:systemId/einflussgroessen')
export class EinflussgroesseUnterSystemController {
  constructor(private readonly einflussgroesseService: EinflussgroesseService) {}

  /**
   * `create:einflussgroesse`. `endkundeId` wird server-seitig aus dem System
   * abgeleitet (RL-B1) — der Request-Body trägt bewusst KEIN `endkundeId`-Feld.
   */
  @Roles('betrieb')
  @Fachaktion('create:einflussgroesse')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EinflussgroesseDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.EINFLUSSGROESSE_ERFASST,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      einflussgroesse_id: ({ result }) => result?.id,
      endkunde_id: ({ result }) => result?.endkundeId,
      system_id: ({ result }) => result?.systemId,
      groesse_code: ({ result }) => result?.groesseCode,
      gueltig_ab_monat: ({ result }) => result?.gueltigAbMonat,
      gueltig_bis_monat: ({ result }) => result?.gueltigBisMonat ?? undefined,
      betroffener_typ: ({ result }) => result?.betroffenerTyp,
      quelle_typ: ({ result }) => result?.quelleTyp,
      rechtsgrundlage: ({ result }) => result?.rechtsgrundlage,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async erfassen(
    @Param('systemId') systemId: string,
    @Body() dto: EinflussgroesseErfassenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinflussgroesseDetail> {
    const result = await this.einflussgroesseService.erfassen(systemId, dto);
    response.setHeader('Location', `/stammdaten/einflussgroessen/${result.id}`);
    return result;
  }

  /**
   * `read:einflussgroesse` — Klartext-Intervalle (PII, A8/B10). EIN Audit-
   * Event je Aufruf (`kontext.anzahl_saetze`), NICHT eines je Zeile (analog
   * `standort.pii.einsicht`, D5). `objekt_ref` bleibt NULL (Batch, mehrere
   * Zeilen).
   */
  @Roles('betrieb')
  @Fachaktion('read:einflussgroesse')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EinflussgroesseDetail[]>({
    eventTyp: STAMMDATEN_EVENT_CODES.EINFLUSSGROESSE_EINSICHT,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      system_id: ({ request }) => (request.params as Record<string, string | undefined>)['systemId'],
      endkunde_id: ({ result }) => result?.[0]?.endkundeId,
      anzahl_saetze: ({ result }) => result?.length,
    },
  })
  @Get()
  async liste(@Param('systemId') systemId: string): Promise<EinflussgroesseDetail[]> {
    return this.einflussgroesseService.listeFuerSystem(systemId);
  }
}
