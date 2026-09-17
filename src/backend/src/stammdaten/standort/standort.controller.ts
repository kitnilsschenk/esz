import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { StandortService } from './standort.service';
import { ZaehlerVerortungService } from './zaehler-verortung.service';
import { StandortAendernDto } from './dto/standort-aendern.dto';
import { StandortPiiAendernDto } from './dto/standort-pii-aendern.dto';
import { StandortVerschiebenDto } from './dto/standort-verschieben.dto';
import { StandortStilllegenDto } from './dto/standort-stilllegen.dto';
import { ZaehlerUnterKnotenQueryDto } from './dto/zaehler-unter-knoten-query.dto';
import type {
  StandortLoeschErgebnis,
  StandortPiiDetail,
  StandortStillgelegtErgebnis,
  StandortStruktur,
  StandortVerschobenErgebnis,
  ZaehlerUnterKnotenItem,
} from './standort.types';

/**
 * `/stammdaten/standorte/{standortId}` (stammdaten.openapi.yaml, ADR-0010
 * §5) — Einzel-Ressourcen-Routen (Struktur-Mutation, PII-Mutation, Reparent,
 * Stilllegen, Hart-Löschen, Kern-Query). Alle Routen teilen denselben
 * Pfad-Parameter `standortId` — `StammdatenResourceAttributesProvider.
 * resolveViaStandort()` löst darüber `resource.standort` auf (ADR-0010 D5).
 */
@Controller('stammdaten/standorte')
export class StandortController {
  constructor(
    private readonly standortService: StandortService,
    private readonly zaehlerVerortungService: ZaehlerVerortungService,
  ) {}

  /** `update:standort` — Struktur NUR (`typ`/`sortierung`), NICHT `status` (D2.6, eigene Aktion `stilllegen`). */
  @Roles('betrieb')
  @Fachaktion('update:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortStruktur>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ result }) => result?.endkundeId,
      typ: ({ result }) => result?.typ,
    },
  })
  @Patch(':standortId')
  async aendern(
    @Param('standortId') standortId: string,
    @Body() dto: StandortAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortStruktur> {
    return this.standortService.aendern(standortId, dto);
  }

  /** `update:standort` — PII-Vollersatz (D4/D5). `kontext.pii_felder` = kommagetrennte Feldnamen (keine Werte). */
  @Roles('betrieb')
  @Fachaktion('update:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortPiiDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_PII_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ request }) => (request.params as Record<string, string | undefined>)['standortId'],
      pii_felder: ({ request }) => extractPiiFelder(request.body),
    },
  })
  @Put(':standortId/pii')
  async aendernPii(
    @Param('standortId') standortId: string,
    @Body() dto: StandortPiiAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortPiiDetail> {
    return this.standortService.aendernPii(standortId, dto);
  }

  /** `update:standort` — Reparent (D6). Response `nachfahrenAktualisiert` = Reichweiten-Nachweis. */
  @Roles('betrieb')
  @Fachaktion('update:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortVerschobenErgebnis>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_VERSCHOBEN,
    objektRefExtractor: ({ result }) => result?.standort.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ result }) => result?.standort.endkundeId,
      // audit.event_seal() (V0003) akzeptiert NUR string/number/boolean als
      // Kontext-Wert (kein JSON-`null`, jsonb_typeof('null') faellt nicht in
      // die Whitelist) — `?? undefined` LAESST den Key entfallen, statt ein
      // verbotenes `null` zu senden (Wurzelknoten haben `parentId===null`).
      parent_id_alt: ({ result }) => result?.parentIdAlt ?? undefined,
      parent_id_neu: ({ result }) => result?.standort.parentId ?? undefined,
      ebene: ({ result }) => result?.standort.ebene,
      nachfahren_anzahl: ({ result }) => result?.nachfahrenAktualisiert,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post(':standortId/verschieben')
  async verschieben(
    @Param('standortId') standortId: string,
    @Body() dto: StandortVerschiebenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortVerschobenErgebnis> {
    return this.standortService.verschieben(standortId, dto.neuerParentId);
  }

  /** `update:standort` — Zustandswechsel aktiv->stillgelegt (D2.6), KEIN Hard-Delete. */
  @Roles('betrieb')
  @Fachaktion('update:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortStillgelegtErgebnis>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_STILLGELEGT,
    objektRefExtractor: ({ result }) => result?.standort.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ result }) => result?.standort.endkundeId,
      status_alt: ({ result }) => result?.statusAlt,
      status_neu: ({ result }) => result?.standort.status,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post(':standortId/stilllegen')
  async stilllegen(
    @Param('standortId') standortId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer die Body-Schema-Validierung (whitelisted grund, D2.6) — der Wert selbst fliesst (v1) nicht in den Audit-Kontext (Whitelist kennt kein `grund`).
    @Body() _dto: StandortStilllegenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortStillgelegtErgebnis> {
    return this.standortService.stilllegen(standortId);
  }

  /**
   * `delete:standort` — hartes DELETE (D2.6, "Korrektur von Fehlanlagen"),
   * NUR Blattknoten ohne Verortungshistorie. IDEMPOTENT im HTTP-Sinn: der
   * ERSTE Aufruf löscht (200), ein WIEDERHOLTER Aufruf auf eine bereits
   * gelöschte Ressource liefert 404 — der Endzustand ("Ressource existiert
   * nicht") ist in beiden Fällen identisch (api-contracts.md-Konvention für
   * echte Hard-Deletes, anders als die Sperre/Stilllegung anderer
   * Ressourcen, die denselben 200er wiederholt liefern).
   */
  @Roles('betrieb')
  @Fachaktion('delete:standort')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<StandortLoeschErgebnis>({
    eventTyp: STAMMDATEN_EVENT_CODES.STANDORT_GELOESCHT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      endkunde_id: ({ result }) => result?.endkundeId,
      typ: ({ result }) => result?.typ,
      parent_id_alt: ({ result }) => result?.parentIdAlt ?? undefined,
    },
  })
  @Delete(':standortId')
  async loeschen(
    @Param('standortId') standortId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<StandortLoeschErgebnis> {
    return this.standortService.loeschen(standortId);
  }

  /** `read:standort` — Kern-Query (D6), PII-frei. Rollen `betrieb`/`compliance-auditor`. */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:standort')
  @Get(':standortId/zaehler')
  async zaehlerUnterKnoten(
    @Param('standortId') standortId: string,
    @Query() query: ZaehlerUnterKnotenQueryDto,
  ): Promise<ZaehlerUnterKnotenItem[]> {
    return this.zaehlerVerortungService.zaehlerUnterKnoten(standortId, {
      ...(query.stichtag !== undefined ? { stichtag: query.stichtag } : {}),
      ...(query.inklusiveUnterknoten !== undefined ? { inklusiveUnterknoten: query.inklusiveUnterknoten } : {}),
    });
  }
}

/** `kontext.pii_felder` — kommagetrennte Feldnamen-Liste (KEINE Werte, ADR-0010 D5). */
function extractPiiFelder(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const felder: string[] = [];
  const record = body as Record<string, unknown>;
  if (typeof record['bezeichnung'] === 'string') {
    felder.push('bezeichnung');
  }
  if (typeof record['adresse'] === 'string') {
    felder.push('anschrift');
  }
  if (typeof record['geo'] === 'string') {
    felder.push('geo');
  }
  return felder.join(',');
}
