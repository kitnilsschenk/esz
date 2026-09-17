import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { IdempotencyKey } from '../../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { NachweisExportService } from './nachweis-export.service';
import { NachweisExportErzeugenDto } from '../dto/nachweis-export-erzeugen.dto';
import type { NachweisExportAntwort } from './nachweis-export.types';

/**
 * `/nachweis/einsparlaeufe/{id}/exporte` + `/nachweis/exporte/{id}[/dateien/{dateiname}]`
 * (ADR-0007 D5/D6/B10, Teil C A13/A14/A15/A19/A20/A23).
 *
 * **A19/B10-Asymmetrie, bewusst so umgesetzt:** `read:nachweis_export`
 * bekommt HIER — anders als `read:einsparlauf`/`read:nachweis_preflight`/
 * `read:einreichung` — AUSSCHLIESSLICH `@Roles('betrieb')`, KEIN
 * `compliance-auditor` (B10: „die schutzwürdigste Leseaktion dieses ADR",
 * „ausschließlich an das Betriebs-/Nachweis-Team"). Die zusätzliche,
 * eigenständige Auditor-Deny-Regel im `InCodePolicyAdapter`
 * (`nachweis_export_auditor_verboten`) ist Defense-in-Depth — GENAU wie bei
 * `read:standort_pii`/`read:einflussgroesse` trägt bereits das RBAC-Gate
 * hier den Hauptschutz, die PDP-Regel fängt eine künftige RBAC-
 * Fehlkonfiguration ab.
 *
 * KEIN `@AuditAction` — `NachweisExportService` emittiert
 * `export.nachweis.erzeugt`/`.abgerufen` manuell (Muster
 * `EinsparlaufController`/`PreflightController`).
 */
@Controller()
export class NachweisExportController {
  constructor(private readonly exportService: NachweisExportService) {}

  @Roles('betrieb')
  @Fachaktion('create:nachweis_export')
  @HttpCode(HttpStatus.CREATED)
  @Post('nachweis/einsparlaeufe/:einsparlaufId/exporte')
  async erzeugen(
    @Param('einsparlaufId') einsparlaufId: string,
    @Body() dto: NachweisExportErzeugenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NachweisExportAntwort> {
    const subject = requireSecurityContext(request);
    return this.exportService.erzeugen(einsparlaufId, dto, subject);
  }

  @Roles('betrieb')
  @Fachaktion('read:nachweis_export')
  @Get('nachweis/exporte/:exportId')
  async finden(@Param('exportId') exportId: string): Promise<NachweisExportAntwort> {
    return this.exportService.finden(exportId);
  }

  @Roles('betrieb')
  @Fachaktion('read:nachweis_export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Get('nachweis/exporte/:exportId/dateien/:dateiname')
  async datei(
    @Param('exportId') exportId: string,
    @Param('dateiname') dateiname: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string | Buffer> {
    const subject = requireSecurityContext(request);
    const inhalt = await this.exportService.datei(exportId, dateiname, subject);
    response.setHeader('Content-Disposition', `attachment; filename="${dateiname}"`);
    // Die Einsparungsnachweis-Mappe ist die einzige binaere Datei des
    // Buendels (Exportschema v3). Ohne den richtigen Typ liefert der Server
    // sie als Text aus, und der Empfaenger bekommt eine unbrauchbare Datei.
    if (Buffer.isBuffer(inhalt)) {
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    return inhalt;
  }
}
