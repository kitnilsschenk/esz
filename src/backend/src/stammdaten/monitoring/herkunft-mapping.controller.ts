import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { HerkunftMappingService } from './herkunft-mapping.service';
import { HerkunftMappingAnlegenDto } from './dto/herkunft-mapping-anlegen.dto';
import type { HerkunftMappingItem } from './herkunft-mapping.types';

/**
 * `/monitoring/ingest/herkunft` (ADR-0011 B2/D3) — Pflege der Übersetzung
 * zwischen Netzserver-Kennungen und EDMS-Stammdaten.
 *
 * **Warum diese Route SCHREIBRECHTE hat, obwohl sie unter `/monitoring`
 * liegt.** Das Lesen bleibt bei `read:monitoring` — es ist derselbe
 * Betriebsblick wie auf Status und Quarantäne. Das Schreiben bekommt eigene
 * Fachaktionen (`create:herkunft_mapping`, `delete:herkunft_mapping`) und
 * ist auf `betrieb` beschränkt: Wer eine Application zuordnet, entscheidet
 * seit ADR-0011 B3 mit darüber, WESSEN Messwerte eingespeist werden. Das ist
 * keine Monitoring-Handlung, sondern ein Stammdaten-Eingriff mit
 * Datenlenkungs-Wirkung — `compliance-auditor` bleibt hier strikt lesend
 * (DS-01).
 *
 * **Kein Auto-Provisioning (O5).** Diese Route macht das Zuordnen zu einem
 * bequemen MANUELLEN Vorgang. Der Worker legt nie eine Zeile an; er liest nur.
 */
@Controller('monitoring/ingest/herkunft')
export class HerkunftMappingController {
  constructor(private readonly herkunftMappingService: HerkunftMappingService) {}

  /**
   * Alle Zuordnungen. Ohne Pagination — eine Zeile je ChirpStack-Application,
   * also die Größenordnung „Gebäude im Bestand"; die Pflege-Sicht will
   * ohnehin alles auf einmal sehen, um Lücken zu erkennen.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async liste(): Promise<readonly HerkunftMappingItem[]> {
    return this.herkunftMappingService.liste();
  }

  @Roles('betrieb')
  @Fachaktion('create:herkunft_mapping')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<HerkunftMappingItem>({
    eventTyp: STAMMDATEN_EVENT_CODES.HERKUNFT_MAPPING_ZUGEORDNET,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      chirpstack_tenant_id: ({ result }) => result?.chirpstackTenantId,
      chirpstack_application_id: ({ result }) => result?.chirpstackApplicationId,
      endkunde_id: ({ result }) => result?.endkundeId,
      standort_id: ({ result }) => result?.standortId,
      quelle_code: ({ result }) => result?.quelleCode,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: HerkunftMappingAnlegenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<HerkunftMappingItem> {
    return this.herkunftMappingService.anlegen(dto);
  }

  /**
   * Entfernt eine Zuordnung. FOLGE, die in der Oberfläche benannt gehört:
   * Für diesen Tenant greift der Herkunfts-Abgleich (B3/D4) danach nicht
   * mehr — Uplinks werden wieder ungeprüft eingespeist.
   *
   * Der Rückgabewert ist die ENTFERNTE Zeile, nicht `void`: Der
   * Audit-Kontext braucht die Kennungen einer Zeile, die es danach nicht
   * mehr gibt.
   */
  @Roles('betrieb')
  @Fachaktion('delete:herkunft_mapping')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<HerkunftMappingItem>({
    eventTyp: STAMMDATEN_EVENT_CODES.HERKUNFT_MAPPING_ENTFERNT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      chirpstack_tenant_id: ({ result }) => result?.chirpstackTenantId,
      chirpstack_application_id: ({ result }) => result?.chirpstackApplicationId,
      endkunde_id: ({ result }) => result?.endkundeId,
      standort_id: ({ result }) => result?.standortId,
      quelle_code: ({ result }) => result?.quelleCode,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async entfernen(
    @Param('id') id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<HerkunftMappingItem> {
    return this.herkunftMappingService.entfernen(id);
  }
}
