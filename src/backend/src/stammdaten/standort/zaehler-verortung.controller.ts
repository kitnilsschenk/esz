import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { ZaehlerVerortungService } from './zaehler-verortung.service';
import { ZaehlerVerortungAnlegenDto } from './dto/zaehler-verortung-anlegen.dto';
import { ZaehlerVerortungBeendenDto } from './dto/zaehler-verortung-beenden.dto';
import type { ZaehlerStandortAktuellDetail, ZaehlerStandortDetail } from './standort.types';

/**
 * Defensive Stringifizierung fuer `kontext.gueltig_von`/`kontext.gueltig_bis`
 * (Finding, dieses Arbeitspaket): `pg`/TypeORMs Roh-SQL-Pfad (`EntityManager.
 * query()`) liefert `timestamptz`-Spalten zur LAUFZEIT als natives `Date`-
 * Objekt zurueck, OBWOHL der Repository-Zeilentyp `string` deklariert
 * (funktioniert unbemerkt ueberall dort, wo der Wert nur in eine HTTP-JSON-
 * Response wandert — `JSON.stringify` ruft `Date.prototype.toJSON()`
 * automatisch auf). `audit.event_seal()`/`KontextIsScalarMapConstraint`
 * (V0003/`audit-envelope.dto.ts`, rote Linie 1) pruefen dagegen VOR jeder
 * Serialisierung `typeof value === 'string'` — ein rohes `Date`-Objekt faellt
 * durch. `toIsoStringKontextWert()` ist die einzige Stelle, an der ein
 * Zeitstempel-Feld in einen `@AuditAction`-Kontext einfliesst — sie erzwingt
 * einen ECHTEN String, unabhaengig davon, ob der Aufrufer bereits einen
 * String oder (wie tatsaechlich der Fall) ein `Date`-Objekt liefert.
 */
function toIsoStringKontextWert(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return new Date(value).toISOString();
}

/**
 * `/stammdaten/zaehler/{zaehlerId}/verortung` (stammdaten.openapi.yaml,
 * ADR-0010 §5/D3) — temporale Zähler-Standort-Zuordnung.
 */
@Controller('stammdaten/zaehler/:zaehlerId/verortung')
export class ZaehlerVerortungController {
  constructor(private readonly zaehlerVerortungService: ZaehlerVerortungService) {}

  /**
   * `read:standort` (identische Lesestufe wie die Baum-/Kern-Query-Routen,
   * D5 — PII-frei, NIEMALS Bezeichnung/Adresse) — Backend-Lücke 1 aus dem
   * Betriebs-UI-Konzept ("Wo hängt dieser Zähler?"), die bislang fehlende
   * Umkehrrichtung zu `GET .../standorte/{id}/zaehler` (D6). Liefert die
   * AKTUELLE Verortung (`gueltig_bis IS NULL`) inklusive Breadcrumb-Pfad
   * (Wurzel zuerst). `verortet=false` (Empty-State, 200 statt 404) bei
   * einem unverorteten ODER nur-historisch verorteten Zähler.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:standort')
  @Get()
  async aktuelleVerortung(@Param('zaehlerId') zaehlerId: string): Promise<ZaehlerStandortAktuellDetail> {
    return this.zaehlerVerortungService.aktuelleVerortung(zaehlerId);
  }

  /**
   * `create:zaehler_standort` — beendet die offene Vorgänger-Verortung
   * DERSELBEN Transaktion (D3, "Umsetzen").
   */
  @Roles('betrieb')
  @Fachaktion('create:zaehler_standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ZaehlerStandortDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ZAEHLER_STANDORT_ZUGEORDNET,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zaehler_id: ({ result }) => result?.zaehlerId,
      standort_id: ({ result }) => result?.standortId,
      gueltig_von: ({ result }) => toIsoStringKontextWert(result?.gueltigVon),
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async erstelleVerortung(
    @Param('zaehlerId') zaehlerId: string,
    @Body() dto: ZaehlerVerortungAnlegenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZaehlerStandortDetail> {
    return this.zaehlerVerortungService.erstelleVerortung(zaehlerId, dto);
  }

  /** `update:zaehler_standort` — beendet die aktuell OFFENE Verortung dieses Zählers. */
  @Roles('betrieb')
  @Fachaktion('update:zaehler_standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ZaehlerStandortDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ZAEHLER_STANDORT_BEENDET,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zaehler_id: ({ result }) => result?.zaehlerId,
      standort_id: ({ result }) => result?.standortId,
      // `gueltigBis` ist nach `beenden()` fachlich IMMER gesetzt, der TS-Typ
      // bleibt `string | null` (dieselbe Spalte traegt bei OFFENEN
      // Verortungen `NULL`) — `toIsoStringKontextWert` deckt beides ab: ein
      // echtes `null` (Key entfaellt, kein verbotenes JSON-`null`) UND die
      // Date->string-Normalisierung (s. Funktions-Kommentar oben).
      gueltig_bis: ({ result }) => toIsoStringKontextWert(result?.gueltigBis),
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('beenden')
  async beendenVerortung(
    @Param('zaehlerId') zaehlerId: string,
    @Body() dto: ZaehlerVerortungBeendenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZaehlerStandortDetail> {
    return this.zaehlerVerortungService.beendenVerortung(zaehlerId, dto);
  }
}
