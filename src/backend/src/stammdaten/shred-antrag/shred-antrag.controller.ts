import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ListQueryDto, resolveLimit } from '../common/list-query.dto';
import { requireSecurityContext } from '../common/security-context.util';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { KryptoShreddingAnweisungDto } from '../endkunde/dto/krypto-shredding-anweisung.dto';
import { ShredAntragService } from './shred-antrag.service';
import { ShredFreigebenAnweisungDto } from './dto/shred-freigeben-anweisung.dto';
import { ShredAblehnenAnweisungDto } from './dto/shred-ablehnen-anweisung.dto';
import type { ShredAntragDetail, ShredFreigebenErgebnis } from './shred-antrag.types';

/**
 * ADR-0009 §2.4 — Vier-Augen-Krypto-Shredding-Workflow (Art. 17 DSGVO,
 * Folgeauftrag ADR-0008 §29(C4)). Ersetzt den ENTFERNTEN Direkt-Endpoint
 * `POST /stammdaten/endkunden/{endkundeId}/kryptoshredding` (ADR-0009 §2.4 —
 * hartes Entfernen statt Deprecation, begründet mit synthetic-only/
 * pre-go-live-Status).
 *
 * Controller DÜNN (`.claude/rules/backend-nestjs.md`): KEINE Business-Logik
 * hier, nur Request-/Response-Mechanik + Delegation an `ShredAntragService`.
 *
 * KRITISCH (ADR-0009 §2.3 Finding P2): die `freigeben`-Route trägt BEWUSST
 * KEIN `@AuditAction` — beide Audit-Ereignisse (`shred_freigegeben`,
 * `geschreddert`) werden MANUELL, in logischer Reihenfolge, im Service
 * erzeugt (s. `ShredAntragService.freigebenInTx()`). Ein ABAC-Deny auf dieser
 * Route wird dennoch auditiert — über den generischen
 * `AuditActionInterceptor`-Fallback (`runWithForbiddenFallback()`, Katalog-
 * Code `authz.zugriff.verweigert`), der für JEDE Route ohne `@AuditAction`
 * automatisch greift (Denied-Safety-Net, keine zusätzliche Verdrahtung
 * nötig).
 */
@Controller('stammdaten/endkunden/:endkundeId/shred-antraege')
export class ShredAntragController {
  constructor(private readonly shredAntragService: ShredAntragService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(
    @Param('endkundeId') endkundeId: string,
    @Query() query: ListQueryDto,
  ): Promise<Seite<ShredAntragDetail>> {
    return this.shredAntragService.liste(endkundeId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('shred:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ShredAntragDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.SHRED_BEANTRAGT,
    objektRefExtractor: ({ request }) => request.params['endkundeId'],
    // ADR-0008 §22 (D10) — kontext.synthetic Pflicht-Tag, s. Begruendung bei
    // EndkundeController.anlegen(). kontext.antrag_id verlinkt den
    // Vier-Augen-Fluss (ADR-0009 §2.3).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      antrag_id: ({ result }) => result?.id,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async beantragen(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: KryptoShreddingAnweisungDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ShredAntragDetail> {
    const subject = requireSecurityContext(request);
    const antrag = await this.shredAntragService.beantragen(endkundeId, dto, subject);
    response.setHeader('Location', `/stammdaten/endkunden/${endkundeId}/shred-antraege/${antrag.id}`);
    return antrag;
  }

  /**
   * ADR-0009 §2.2/§2.3 — Freigabe durch eine ZWEITE `betrieb`-Person
   * (Vier-Augen, `sub` muss von der antragstellenden Person abweichen — vom
   * `InCodePolicyAdapter` erzwungen, NICHT hier im Controller). Koppelt
   * Freigeben+Ausführen in EINER Transaktion (ADR-0009 §2.1 Impl.-
   * Entscheidung) — die Antwort enthält sowohl den aktualisierten Antrag als
   * auch das `ShreddingErgebnis`.
   */
  @Roles('betrieb')
  @Fachaktion('shred:endkunde:freigeben')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post(':antragId/freigeben')
  async freigeben(
    @Param('endkundeId') endkundeId: string,
    @Param('antragId') antragId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @Body() _anweisung: ShredFreigebenAnweisungDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ShredFreigebenErgebnis> {
    const subject = requireSecurityContext(request);
    return this.shredAntragService.freigeben(endkundeId, antragId, subject);
  }

  @Roles('betrieb')
  @Fachaktion('shred:endkunde:ablehnen')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ShredAntragDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.SHRED_ABGELEHNT,
    objektRefExtractor: ({ request }) => request.params['endkundeId'],
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      antrag_id: ({ result }) => result?.id,
      ablehnungsgrund: ({ result }) => result?.ablehnungsgrund,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post(':antragId/ablehnen')
  async ablehnen(
    @Param('endkundeId') endkundeId: string,
    @Param('antragId') antragId: string,
    @Body() dto: ShredAblehnenAnweisungDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ShredAntragDetail> {
    const subject = requireSecurityContext(request);
    return this.shredAntragService.ablehnen(endkundeId, antragId, dto, subject);
  }
}
