import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { requireSecurityContext } from '../common/security-context.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { IngestQuelleService } from './ingest-quelle.service';
import { QuelleAnlegenDto } from './dto/quelle-anlegen.dto';
import { QuelleAendernDto } from './dto/quelle-aendern.dto';
import type { IngestQuelleItem } from './ingest-quelle.types';

/**
 * `/monitoring/ingest/quellen` — Pflege der Datenquellen (ADR-0011,
 * `ingest.quelle` V0059).
 *
 * WARUM SCHREIBEN EINE EIGENE FACHAKTION IST
 * ------------------------------------------
 * Lesen läuft über `read:monitoring` wie die übrige Betriebssicht. Schreiben
 * NICHT: Wer eine Quelle anlegt oder ihren Broker-Host ändert, bestimmt, WOHER
 * dieses System Messwerte bezieht — und wer sie deaktiviert, legt die
 * Datenaufnahme still. Das ist dieselbe Größenordnung wie die
 * Herkunfts-Zuordnung und gehört deshalb, wie diese, hinter eine eigene, nur
 * `betrieb` erlaubte Aktion. `compliance-auditor` bleibt strikt lesend (DS-01).
 *
 * ZWEI EREIGNISSE JE SCHREIBVORGANG — UND WARUM
 * ---------------------------------------------
 * Beim Ändern protokolliert der Decorator `quelle.ingest.geaendert`. Wurde
 * dabei ein Geheimnis hinterlegt, kommt `quelle.ingest.zugangsdaten_hinterlegt`
 * hinzu (V0060). Das ist bewusst nicht zusammengefasst: „wer hat wann welches
 * Geheimnis hinterlegt" muss sich beantworten lassen, ohne die übrigen
 * Änderungen zu interpretieren.
 *
 * KEIN `DELETE`. Eine Quelle wird deaktiviert, nicht entfernt: Ihre Kennung
 * steht in Quarantäne-Zeilen und im Herkunfts-Abgleich, und ein Hard-Delete
 * ließe die dort ins Leere zeigen. Dieselbe Linie wie beim Stilllegen von
 * Zählern (Linie 3).
 */
@Controller('monitoring/ingest/quellen')
export class IngestQuelleController {
  constructor(private readonly ingestQuelleService: IngestQuelleService) {}

  /**
   * Alle Quellen. Ohne Pagination — ein Betrieb führt eine Handvoll Netze,
   * und die Pflege-Sicht will sie ohnehin vollständig sehen.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async liste(): Promise<readonly IngestQuelleItem[]> {
    return this.ingestQuelleService.liste();
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get(':quelleId')
  async finden(@Param('quelleId') quelleId: string): Promise<IngestQuelleItem> {
    return this.ingestQuelleService.finden(quelleId);
  }

  @Roles('betrieb')
  @Fachaktion('create:ingest_quelle')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<IngestQuelleItem>({
    eventTyp: STAMMDATEN_EVENT_CODES.INGEST_QUELLE_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      quelle_code: ({ result }) => result?.quelleCode,
      // `broker_host` darf ins Protokoll: V0059 schliesst Zugangsdaten in der
      // Adresse strukturell aus (`ck_quelle_broker_ohne_credentials`).
      broker_host: ({ result }) => result?.brokerHost,
      tls_modus: ({ result }) => result?.tlsModus,
      status: ({ result }) => result?.status,
      // NUR Feldnamen — nie Werte, auch nicht gekuerzt oder gehasht.
      geheimnis_felder: ({ result }) => result?.hinterlegteGeheimnisse.join(','),
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: QuelleAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<IngestQuelleItem> {
    return this.ingestQuelleService.anlegen(dto, requireSecurityContext(request), request.synthetic ?? false);
  }

  @Roles('betrieb')
  @Fachaktion('update:ingest_quelle')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<IngestQuelleItem>({
    eventTyp: STAMMDATEN_EVENT_CODES.INGEST_QUELLE_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      quelle_code: ({ result }) => result?.quelleCode,
      broker_host: ({ result }) => result?.brokerHost,
      tls_modus: ({ result }) => result?.tlsModus,
      status: ({ result }) => result?.status,
      geheimnis_felder: ({ result }) => result?.hinterlegteGeheimnisse.join(','),
    },
  })
  @Patch(':quelleId')
  async aendern(
    @Param('quelleId') quelleId: string,
    @Body() dto: QuelleAendernDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<IngestQuelleItem> {
    return this.ingestQuelleService.aendern(quelleId, dto, requireSecurityContext(request), request.synthetic ?? false);
  }
}
