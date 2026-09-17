import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { resolveLimit } from '../common/list-query.dto';
import { requireSecurityContext } from '../common/security-context.util';
import { EinschraenkungUnterrichtungDto } from '../common/einschraenkung-unterrichtung.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { AnschlussnutzerService } from './anschlussnutzer.service';
import { AnschlussnutzerAnlegenDto } from './dto/anschlussnutzer-anlegen.dto';
import { AnschlussnutzerSperrenDto } from './dto/anschlussnutzer-sperren.dto';
import { AnschlussnutzerListQueryDto } from './dto/anschlussnutzer-list-query.dto';
import type { AnschlussnutzerDetail, AnschlussnutzerListItem } from './anschlussnutzer.types';

@Controller('stammdaten/anschlussnutzer')
export class AnschlussnutzerController {
  constructor(private readonly anschlussnutzerService: AnschlussnutzerService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query() query: AnschlussnutzerListQueryDto): Promise<Seite<AnschlussnutzerListItem>> {
    return this.anschlussnutzerService.liste({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.endkundeId !== undefined ? { endkundeId: query.endkundeId } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:anschlussnutzer')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<AnschlussnutzerDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ANSCHLUSSNUTZER_ANGELEGT,
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
    @Body() dto: AnschlussnutzerAnlegenDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<AnschlussnutzerDetail> {
    const subject = requireSecurityContext(request);
    const result = await this.anschlussnutzerService.anlegen(dto, subject);
    response.setHeader('Location', `/stammdaten/anschlussnutzer/${result.id}`);
    return result;
  }

  /**
   * Art.-18-Sperre des Anschlussnutzers (ADR-0007 A11.6). Aktions-Route mit
   * Pflicht-Grund, wortgleich zum Endkunden-Pfad — inklusive der Begruendung,
   * warum es KEIN `DELETE` mit Body ist (s. `EndkundeController.sperren()`).
   *
   * Anders als beim Endkunden gab es hier vorher UEBERHAUPT keinen
   * Schreibpfad: `EnergyAnschlussnutzerRepository` kannte nur
   * `insert`/`findById`/`listPage`. Der Preflight wertete die Sperre bereits
   * aus (FJ-11a/b/c), setzen konnte sie niemand.
   */
  @Roles('betrieb')
  @Fachaktion('sperren:anschlussnutzer')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<AnschlussnutzerDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ANSCHLUSSNUTZER_GESPERRT,
    objektRefExtractor: ({ result }) => result?.id,
    // Wie beim Endkunden: der geschlossene Code, sonst nichts (A11.5). Aus dem
    // ERGEBNIS gelesen, nicht aus dem Request — ein idempotenter
    // Wiederholungsaufruf protokolliert damit den tatsaechlich wirksamen Grund.
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
  @Post(':anschlussnutzerId/sperren')
  async sperren(
    @Param('anschlussnutzerId') anschlussnutzerId: string,
    @Body() dto: AnschlussnutzerSperrenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<AnschlussnutzerDetail> {
    const subject = requireSecurityContext(request);
    return this.anschlussnutzerService.sperren(anschlussnutzerId, dto.grund, dto.neuerhebungFortsetzen, subject);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':anschlussnutzerId')
  async lesen(
    @Param('anschlussnutzerId') anschlussnutzerId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AnschlussnutzerDetail> {
    const subject = requireSecurityContext(request);
    return this.anschlussnutzerService.detail(anschlussnutzerId, subject);
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
  @Fachaktion('entsperren:anschlussnutzer')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post(':anschlussnutzerId/einschraenkung-unterrichtung')
  async unterrichten(
    @Param('anschlussnutzerId') anschlussnutzerId: string,
    @Body() dto: EinschraenkungUnterrichtungDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<AnschlussnutzerDetail> {
    const subject = requireSecurityContext(request);
    return this.anschlussnutzerService.unterrichten(anschlussnutzerId, dto.kanal, subject);
  }

  /**
   * Aufhebung der Art.-18-Einschraenkung (Schritt 2, ADR-0007 A11.7/A11.10).
   * Wird fail-closed abgelehnt, solange kein an dieselbe Einschraenkung
   * gebundener Unterrichtungs-Nachweis vorliegt.
   */
  @Roles('betrieb')
  @Fachaktion('entsperren:anschlussnutzer')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post(':anschlussnutzerId/entsperren')
  async entsperren(
    @Param('anschlussnutzerId') anschlussnutzerId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<AnschlussnutzerDetail> {
    const subject = requireSecurityContext(request);
    return this.anschlussnutzerService.entsperren(anschlussnutzerId, subject);
  }

}
