import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { requireSecurityContext } from '../common/security-context.util';
import { extractBodyString } from '../policy/geraet-reverse-zugriff.util';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { DeviceProvisioningService } from './device-provisioning.service';
import { DeviceReverseAufloesungService } from './device-reverse-aufloesung.service';
import { GeraetZuordnungAendernDto } from './dto/geraet-zuordnung-aendern.dto';
import { GeraetReverseAufloesungDto } from './dto/geraet-reverse-aufloesung.dto';
import type { GeraetZuordnungDetail } from './geraet-zuordnung.types';
import type { GeraetReverseAufloesungErgebnis } from './geraet-reverse-aufloesung.types';

/**
 * `/stammdaten/geraet-zuordnungen/{geraetZuordnungId}` (stammdaten.openapi.yaml,
 * ADR-0005 §26.4). Top-level Einzel-Ressourcen-Route (analog
 * `MesskanalController` fuer `/stammdaten/messkanaele/{messkanalId}`):
 *   - `update:geraet_zuordnung` (Deaktivierung, v1 minimal), UND
 *   - `read:geraet_zuordnung` (Reverse-Aufloesung Blind-Index/Zeile ->
 *     Klartext-DevEUI, SEC-5, NEU) — EIGENSTAENDIGE break-glass-Haertung
 *     (eigene Rolle `geraete-support`, Ticket-Pflicht, eigene Zweck-
 *     Whitelist, Punkt-Aufloesung + Velocity/Quota), NICHT das
 *     `read:verbrauch_detail`-Muster. Bewusst KEIN `GET` (die Response
 *     traegt sensible Nutzlast + erfordert `zweck`/`ticketRef` im Body ->
 *     POST, s. Arbeitsauftrag).
 */
@Controller('stammdaten/geraet-zuordnungen')
export class DeviceGeraetZuordnungController {
  constructor(
    private readonly deviceProvisioningService: DeviceProvisioningService,
    private readonly deviceReverseAufloesungService: DeviceReverseAufloesungService,
  ) {}

  @Roles('betrieb')
  @Fachaktion('update:geraet_zuordnung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<GeraetZuordnungDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_AKTUALISIERT,
    objektRefExtractor: ({ result }) => result?.id,
    // V0015-Whitelist EXAKT { synthetic, zaehler_id } — KEIN kontext.pepper_version
    // (bewusst schmalere Whitelist als provisioniert, s. STAMMDATEN_EVENT_CODES-Kommentar).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zaehler_id: ({ result }) => result?.zaehlerId,
    },
  })
  @Patch(':geraetZuordnungId')
  async aendern(
    @Param('geraetZuordnungId') geraetZuordnungId: string,
    @Body() dto: GeraetZuordnungAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<GeraetZuordnungDetail> {
    return this.deviceProvisioningService.aendern(geraetZuordnungId, dto);
  }

  /**
   * ADR-0005 §26.4 SEC-5 — Reverse-Aufloesung. `@Roles('geraete-support')`
   * (NICHT `betrieb`) ist die PRIMAERE RBAC-Gate; der `InCodePolicyAdapter`
   * traegt ZUSAETZLICH die volle SEC-5-Haertung (Rolle nochmals, Zweck-
   * Whitelist, Ticket-Format, Quota — Defense-in-Depth). `objektRefExtractor`
   * liest bewusst aus `request.params` (NICHT `result`) — dadurch traegt
   * auch ein ABGELEHNTER Versuch (403) den `objekt_ref`, s. Kommentar unten.
   * `kontext.zweck`/`kontext.ticket_ref` lesen bewusst aus `request.body`
   * (NICHT `result`) — aus demselben Grund: auch ein DENY-Audit-Eintrag soll
   * Zweck/Ticket tragen (Nachvollziehbarkeit abgelehnter Versuche). KEIN
   * `Idempotency-Key` (reine, wiederholbare Lese-Operation ohne
   * State-Aenderung an `device.*` — api-contracts.md verlangt den Header nur
   * fuer schreibende Operationen auf der Ressource selbst).
   */
  @Roles('geraete-support')
  @Fachaktion('read:geraet_zuordnung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<GeraetReverseAufloesungErgebnis>({
    eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_REVERSE_AUFGELOEST,
    objektRefExtractor: ({ request }) => (request.params as Record<string, string | undefined>)['geraetZuordnungId'],
    // V0015-Whitelist EXAKT { synthetic, zaehler_id, zweck, ticket_ref} —
    // RL-2: KEIN devEui/Blind-Index im Kontext (result.devEui wird HIER
    // bewusst NICHT gelesen).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zaehler_id: ({ result }) => result?.zaehlerId,
      zweck: ({ request }) => extractBodyString(request.body, 'zweck'),
      ticket_ref: ({ request }) => extractBodyString(request.body, 'ticketRef'),
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post(':geraetZuordnungId/reverse-aufloesung')
  async reverseAufloesen(
    @Param('geraetZuordnungId') geraetZuordnungId: string,
    @Body() dto: GeraetReverseAufloesungDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<GeraetReverseAufloesungErgebnis> {
    const subject = requireSecurityContext(request);
    return this.deviceReverseAufloesungService.reverseAufloesen(geraetZuordnungId, dto, subject);
  }
}
