import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import type { ZugriffszweckAttribut } from '../auth/policy/policy-decision-port';
import { STAMMDATEN_EVENT_CODES } from '../stammdaten/audit/stammdaten-audit-events';
import { extractZugriffszweck } from '../stammdaten/policy/zugriffszweck.util';
import { MesskanalZeitreiheService } from './messkanal-zeitreihe.service';
import { MesskanalZeitreiheQueryDto } from './dto/messkanal-zeitreihe-query.dto';
import type { MesswertZeitreiheAntwort } from './messkanal-zeitreihe.types';

/**
 * Fensterlänge in Tagen (`bisTs - vonTs`) des break-glass-Zweck-HEADERS —
 * NICHT zu verwechseln mit der eigentlichen Abfrage-Zeitspanne (Query
 * `von`/`bis`). Rein deskriptiv für den Audit-Kontext (`kontext.fenster_tage`,
 * `erlaubte_kontext_keys` V0006) — die tatsächliche Zulässigkeitsprüfung
 * (`<= MAX_FENSTER_TAGE`) läuft ausschließlich im PDP
 * (`InCodePolicyAdapter.evaluateBreakGlass()`), NICHT hier (Separation of
 * Concerns: Audit-Extraktion beschreibt, PDP entscheidet).
 */
function berechneFensterTage(zweck: ZugriffszweckAttribut | undefined): number | undefined {
  if (zweck === undefined) {
    return undefined;
  }
  const von = Date.parse(zweck.vonTs);
  const bis = Date.parse(zweck.bisTs);
  if (Number.isNaN(von) || Number.isNaN(bis)) {
    return undefined;
  }
  return (bis - von) / (1000 * 60 * 60 * 24);
}

/**
 * `/messwerte/messkanaele/{messkanalId}` (schemas/openapi/messwerte.openapi.yaml)
 * — Roh-Zeitreihe EINES Messkanals (Detailansicht, inkl. `qualitaet`/
 * `herkunft`).
 *
 * `read:verbrauch_detail` (BESTEHEND, ADR-0008 §16/D4) — WIEDERVERWENDET,
 * NICHT aufgeweicht: break-glass-Deny-by-default im PDP
 * (`InCodePolicyAdapter.evaluateBreakGlass()`), Zweck-Header
 * `X-Edms-Zugriffszweck`/`-Zaehler-Id`/`-Von`/`-Bis`
 * (`StammdatenResourceAttributesProvider.resolveViaMesskanal()` löst
 * `resource.zugriffszweck` bereits automatisch aus dem Request auf — diese
 * Route braucht dafür KEINEN eigenen Code). `@AuditAction` emittiert den
 * BEREITS SEIT V0006 GESEEDETEN Katalog-Code
 * `stammdaten.verbrauch_detail.einsicht` — dessen `erlaubte_kontext_keys`
 * (`zweck_code`,`zaehler_ref`,`fenster_tage`, KEIN `synthetic`, s. V0006)
 * werden hier EXAKT (nicht mehr, nicht weniger) bedient. Sowohl der
 * `permit`- als auch der `deny`(`ForbiddenException`)-Fall werden über
 * DIESEN EINEN Decorator auditiert (ADR-0008 §16 "auch der permit-Fall wird
 * auditiert").
 */
@Controller('messwerte/messkanaele')
export class MesskanalZeitreiheController {
  constructor(private readonly messkanalZeitreiheService: MesskanalZeitreiheService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:verbrauch_detail')
  @AuditAction<MesswertZeitreiheAntwort>({
    eventTyp: STAMMDATEN_EVENT_CODES.VERBRAUCH_DETAIL_EINSICHT,
    objektRefExtractor: ({ request }) => (request.params as Record<string, string | undefined>)['messkanalId'],
    kontextExtractors: {
      zweck_code: ({ request }) => extractZugriffszweck(request)?.zweckCode,
      zaehler_ref: ({ request }) => extractZugriffszweck(request)?.zaehlerId,
      fenster_tage: ({ request }) => berechneFensterTage(extractZugriffszweck(request)),
    },
  })
  @Get(':messkanalId')
  async lesen(
    @Param('messkanalId') messkanalId: string,
    @Query() query: MesskanalZeitreiheQueryDto,
  ): Promise<MesswertZeitreiheAntwort> {
    return this.messkanalZeitreiheService.zeitreihe(messkanalId, query.von, query.bis);
  }
}
