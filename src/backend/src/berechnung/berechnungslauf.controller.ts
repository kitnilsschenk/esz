import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { BerechnungslaufService } from './berechnungslauf.service';
import { BerechnungslaufAnlegenDto } from './dto/berechnungslauf-anlegen.dto';
import type { BerechnungslaufAntwort } from './berechnungslauf.types';

/**
 * `/berechnung/laeufe` (`schemas/openapi/berechnung.openapi.yaml`, ADR-0006
 * Teil B) — EIGENER, fachlicher Top-Level-Kontext (`berechnung`, NICHT
 * innerhalb `stammdaten` verschachtelt), analog `messwerte` (Projektleitlinien
 * "Modul-Struktur ... eins pro fachlichem Kontext").
 *
 * `create:berechnungslauf`/`read:berechnungslauf` (NEU, s.
 * `auth/policy/policy-decision-port.ts` — Policy-Diff FREIGABEPFLICHTIG,
 * s. finale Antwort). ABAC-Auflösung läuft über den bestehenden
 * `StammdatenResourceAttributesProvider` (`CompositeResourceAttributesProvider`
 * dispatcht rein über `@Fachaktion(...)` + Pfad-Parameter/Body — modul-
 * unabhängig, exakt das bereits etablierte Muster aus `MesswerteModule`).
 *
 * KEIN `@AuditAction` auf `anlegen()` — der Service emittiert bis zu VIER
 * unterschiedliche Event-TYPEN (`.angefordert`/`.abgeschlossen`/
 * `.fehlgeschlagen`/`.ersetzt`) je nach Ausgang; `@AuditAction` kennt nur
 * GENAU EINEN statischen `eventTyp` je Route — Präzedenzfall
 * `SHRED_FREIGEGEBEN` (`shred-antrag.service.ts`, "manuell im Service").
 */
@Controller('berechnung/laeufe')
export class BerechnungslaufController {
  constructor(private readonly berechnungslaufService: BerechnungslaufService) {}

  /**
   * `create:berechnungslauf` — Rolle `betrieb`. `SyntheticOnlyInterceptor`
   * (Ingest-Gate ZU, ADR-0008 §22/D10) setzt `request.synthetic`, das der
   * Service 1:1 in JEDES seiner Audit-Events als `kontext.synthetic`
   * (Pflicht-Tag, A9) übernimmt.
   */
  @Roles('betrieb')
  @Fachaktion('create:berechnungslauf')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: BerechnungslaufAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<BerechnungslaufAntwort> {
    const subject = requireSecurityContext(request);
    return this.berechnungslaufService.starten(dto, subject, request.synthetic ?? false);
  }

  /**
   * `create:berechnungslauf` — Rolle `betrieb`. Rechnet einen bestehenden
   * Lauf mit UNVERAENDERTEN Parametern neu und setzt ihn als dessen Ersatz.
   *
   * Bewusst eine eigene Route statt eines Flags am Anlegen-Body: Sie nimmt
   * KEINE Rechenparameter entgegen. Wer korrigiert, soll nichts anderes
   * rechnen koennen als das Original — die Parameter kommen aus dem
   * ersetzten Lauf, nicht aus dem Aufruf (s. `neuBerechnen()`).
   */
  @Roles('betrieb')
  @Fachaktion('create:berechnungslauf')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post(':laufId/neuberechnung')
  async neuBerechnen(
    @Param('laufId') laufId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<BerechnungslaufAntwort> {
    const subject = requireSecurityContext(request);
    return this.berechnungslaufService.neuBerechnen(laufId, subject, request.synthetic ?? false);
  }

  /**
   * `read:berechnungslauf` — Rollen `betrieb`/`compliance-auditor`. Liefert
   * Lauf + `laufergebnis`, PII-frei, OHNE Tages-Detail-Snapshots
   * (`read:verbrauch_detail`/`edms_analytics_detail_reader`-Niveau, kein
   * v1-Konsument dieser Route). Reine Lese-Route OHNE eigenes Audit-Event
   * (Konvention `read:standort`/`read:monitoring`: der generische
   * `authz.zugriff.verweigert`-Fallback deckt abgelehnte Zugriffe ab, M2).
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:berechnungslauf')
  @Get(':laufId')
  async finden(@Param('laufId') laufId: string): Promise<BerechnungslaufAntwort> {
    return this.berechnungslaufService.finden(laufId);
  }
}
