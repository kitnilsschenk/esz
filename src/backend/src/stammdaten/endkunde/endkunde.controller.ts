import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ListQueryDto, resolveLimit } from '../common/list-query.dto';
import { requireSecurityContext } from '../common/security-context.util';
import { EinschraenkungUnterrichtungDto } from '../common/einschraenkung-unterrichtung.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { EndkundeService } from './endkunde.service';
import { EndkundeAnlegenDto } from './dto/endkunde-anlegen.dto';
import { EndkundeAendernDto } from './dto/endkunde-aendern.dto';
import { EndkundeSperrenDto } from './dto/endkunde-sperren.dto';
import { EndkundeLabelsAnfrageDto } from './dto/endkunde-labels-anfrage.dto';
import { EndkundeLabelService, type EndkundeLabelItem } from './endkunde-label.service';
import type { EndkundeDetail, EndkundeListItem } from './endkunde.types';

/**
 * ADR-0008 Teil B — Controller DÜNN (`.claude/rules/backend-nestjs.md`):
 * KEINE Business-Logik hier, nur Request-/Response-Mechanik + Delegation an
 * `EndkundeService`. Routen exakt nach `stammdaten.openapi.yaml`.
 *
 * ADR-0009 §2.4 — der vormalige Direkt-Endpoint
 * `POST :endkundeId/kryptoshredding` (Krypto-Shredding OHNE Vier-Augen-
 * Kontrolle) ist ENTFERNT (hartes Cutover, kein Deprecation-Fenster,
 * begründet mit synthetic-only/pre-go-live-Status, s. dortige ADR-Begründung).
 * Der Ersatz ist der Antrag→Freigabe/Ablehnung→Ausführung-Workflow in
 * `ShredAntragController` (`stammdaten/endkunden/{endkundeId}/shred-antraege/**`).
 * `EndkundeService.shred()` selbst bleibt bestehen (Art.-17-Fach-Logik,
 * weiterhin idempotent) — nur nicht mehr über eine eigene, ungesicherte
 * HTTP-Route direkt erreichbar; `ShredAntragService.freigebenInTx()` ruft
 * sie innerhalb der Vier-Augen-Transaktion auf.
 */
@Controller('stammdaten/endkunden')
export class EndkundeController {
  constructor(
    private readonly endkundeService: EndkundeService,
    private readonly endkundeLabelService: EndkundeLabelService,
  ) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query() query: ListQueryDto): Promise<Seite<EndkundeListItem>> {
    return this.endkundeService.liste({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EndkundeDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
    // ADR-0008 §22 (D10) — `kontext.synthetic` ist auf JEDER durch
    // `SyntheticOnlyInterceptor` geschuetzten PII-Schreibroute PFLICHT
    // (`erlaubte_kontext_keys`-Whitelist der betroffenen Event-Typen).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: EndkundeAnlegenDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    const result = await this.endkundeService.anlegen(dto, subject);
    response.setHeader('Location', `/stammdaten/endkunden/${result.id}`);
    return result;
  }

  /**
   * ADR-0008 **D12** — Batch-Auflösung von Klartextnamen für Listen und
   * Auswahlfelder. `read:endkunde_pii`, Rolle `betrieb` NUR
   * (`compliance-auditor` strukturell ausgeschlossen: RBAC hier UND
   * PDP-Regel `endkunde_pii_auditor_verboten`, Defense-in-Depth — Auflage A5).
   *
   * AUSDRÜCKLICH KEIN Break-glass (A8): Der Name ist ein Stammdatum, das
   * dieselbe Rolle auf der Detailseite ohnehin als Dauerrecht sieht. Ein
   * Zweck-Token bei jedem Seitenaufbau wäre Ritual und entwertete die
   * Signalwirkung des echten break-glass-Gates beim Lastgang. Auditiert wird
   * trotzdem IMMER: GENAU EIN Event je Aufruf, NICHT eines je Endkunde (A6).
   *
   * **Kein `@IdempotencyKey`** (Nebenbefund N1 der K14-Entscheidung),
   * abweichend vom Standort-Sibling: `api-contracts.md` fordert den Header für
   * SCHREIBENDE Operationen; POST ist hier nur gewählt, weil eine Id-Menge
   * nicht in den Query-String gehört (Access-/Proxy-Logs). Gravierender: Die
   * Semantik „Wiederholung ohne den Effekt zu duplizieren" legte nahe, das
   * Audit-Event bei Wiederholung zu unterdrücken — ein direkter A6-Bruch,
   * denn jede Einsicht ist eine Einsicht.
   *
   * Muss VOR `@Get(':endkundeId')` stehen? Nein — andere HTTP-Methode, kein
   * Routen-Konflikt. Die Reihenfolge folgt hier der fachlichen Lesbarkeit.
   */
  @Roles('betrieb')
  @Fachaktion('read:endkunde_pii')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EndkundeLabelItem[]>({
    eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_PII_EINSICHT,
    // objekt_ref bleibt NULL — Batch über mehrere Endkunden (V0034, analog
    // `standort.pii.einsicht`).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      // Die DIFFERENZ dieser beiden Zahlen ist der einzige Beleg, dass A4
      // wirkt (still gefilterte gesperrte/geschredderte Sätze). `result` ist
      // ein blankes Array (K14) — `result?.length` hängt damit an KEINEM
      // Feldnamen, der bei einem Refactor lautlos brechen könnte.
      anzahl_angefragt: ({ request }) => (request.body as EndkundeLabelsAnfrageDto | undefined)?.endkundeIds?.length,
      anzahl_endkunden: ({ result }) => result?.length,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('labels')
  async labels(
    @Body() dto: EndkundeLabelsAnfrageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<EndkundeLabelItem[]> {
    const subject = requireSecurityContext(request);
    return this.endkundeLabelService.labels(subject, dto.endkundeIds);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':endkundeId')
  async lesen(@Param('endkundeId') endkundeId: string, @Req() request: AuthenticatedRequest): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    return this.endkundeService.detail(endkundeId, subject);
  }

  @Roles('betrieb')
  @Fachaktion('update:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EndkundeDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
    // ADR-0008 §22 (D10) — s. Begruendung bei `anlegen()`.
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
    },
  })
  @Patch(':endkundeId')
  async aendern(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: EndkundeAendernDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    return this.endkundeService.aendern(endkundeId, dto, subject);
  }

  /**
   * Art.-18-Sperre (ADR-0007 A11.1, C8-Folgeauftrag). Vormals
   * `DELETE /stammdaten/endkunden/{endkundeId}` ohne Body — mit dem
   * Pflicht-Grund wird daraus eine Aktions-Route nach dem etablierten Muster
   * `POST /stammdaten/standorte/{standortId}/stilllegen`.
   *
   * Warum kein Body am DELETE: RFC 9110 spricht dem Inhalt einer
   * DELETE-Anfrage jede definierte Semantik ab (Proxies duerfen ihn
   * verwerfen), und ein PFLICHT-Body widerspricht der Zusage aus
   * `api-contracts.md`, dass alle DELETE-Operationen idempotent sind — ein
   * zweiter Aufruf mit ABWEICHENDEM Grund ist eben nicht derselbe Vorgang
   * (er endet mit 409, s. `EndkundeService.sperren()`). Die alte Route ist
   * ersatzlos entfernt statt deprecated: bliebe sie ohne Grund benutzbar,
   * waere die Pflichtangabe aus A11.1 mit einem Aufruf umgehbar — eine
   * Kontrolle mit offener Hintertuer ist keine. Die Spec steht auf 0.x und
   * hatte genau EINEN Konsumenten (dieses Repo), daher kein
   * Deprecation-Fenster.
   *
   * Die Fachaktion wandert von `delete:endkunde` auf `sperren:endkunde` —
   * die ABAC-Entscheidung bleibt unveraendert, s. `policy-decision-port.ts`.
   */
  @Roles('betrieb')
  @Fachaktion('sperren:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EndkundeDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_GESPERRT,
    objektRefExtractor: ({ result }) => result?.id,
    // ADR-0008 §22 (D10) — s. Begruendung bei `anlegen()`.
    // `einschraenkung_grund_code` (A11.5, V0032): der geschlossene Code, sonst
    // nichts — kein Antragsteller, kein Freitext, kein Belegverweis. Er wird
    // aus dem ERGEBNIS gelesen, nicht aus dem Request: nur so protokolliert
    // die Zeile den tatsaechlich wirksamen Grund (bei einem idempotenten
    // Wiederholungsaufruf ist das der bereits gespeicherte).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      einschraenkung_grund_code: ({ result }) => result?.einschraenkungGrundCode ?? undefined,
      // Auflage C-8 (V0089): die Erhebungs-Entscheidung ist der Teil des
      // Sperrvorgangs, den die Tabelle NICHT dauerhaft belegt -- beim
      // Entsperren wird die Spalte genullt (s. `markEntsperrt`). Ohne diesen
      // Kontext-Schluessel liesse sich hinterher nicht mehr zeigen, ob
      // waehrend einer lit.-b-/lit.-d-Sperre bewusst weitergemessen wurde.
      // `?? undefined` statt `null`: bei lit. a / lit. c stellt sich die Frage
      // nicht, dann fehlt der Schluessel ganz.
      neuerhebung_fortsetzen: ({ result }) =>
        result?.neuerhebungFortsetzen === null || result?.neuerhebungFortsetzen === undefined
          ? undefined
          : String(result.neuerhebungFortsetzen),
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post(':endkundeId/sperren')
  async sperren(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: EndkundeSperrenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    return this.endkundeService.sperren(endkundeId, dto.grund, dto.neuerhebungFortsetzen, subject);
  }
  // KEIN `@AuditAction` auf den beiden folgenden Routen — der Service
  // emittiert selbst (Muster `EinsparlaufService`/`NachweisExportService`).
  // Grund: der `AuditExtractionContext` kennt nur `request`/`result`. Beim
  // Entsperren steht der aufgehobene Einschraenkungsgrund aber in KEINEM von
  // beiden — im Ergebnis ist er bereits genullt (Kohaerenz-CHECK V0024), und
  // ihn nur fuer das Protokoll in die API-Antwort zu heben waere der falsche
  // Weg. Der Service liest ihn vor dem UPDATE und schreibt beide Ereignisse
  // dort, wo der Vorgang bekannt ist.
  /**
   * Art. 18 Abs. 3 DSGVO — Unterrichtung dokumentieren (Schritt 1 von 2,
   * ADR-0007 A11.10). Eigene Route statt eines Feldes am Entsperren: nur so
   * ist die von der Norm geforderte REIHENFOLGE (unterrichten, dann aufheben)
   * ueberhaupt belegbar.
   */
  @Roles('betrieb')
  @Fachaktion('entsperren:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post(':endkundeId/einschraenkung-unterrichtung')
  async unterrichten(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: EinschraenkungUnterrichtungDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    return this.endkundeService.unterrichten(endkundeId, dto.kanal, subject);
  }

  /**
   * Aufhebung der Art.-18-Einschraenkung (Schritt 2, ADR-0007 A11.7/A11.10).
   * Wird fail-closed abgelehnt, solange kein an dieselbe Einschraenkung
   * gebundener Unterrichtungs-Nachweis vorliegt.
   */
  @Roles('betrieb')
  @Fachaktion('entsperren:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post(':endkundeId/entsperren')
  async entsperren(
    @Param('endkundeId') endkundeId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EndkundeDetail> {
    const subject = requireSecurityContext(request);
    return this.endkundeService.entsperren(endkundeId, subject);
  }

}
