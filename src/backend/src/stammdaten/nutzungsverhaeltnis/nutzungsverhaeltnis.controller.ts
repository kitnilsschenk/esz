import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { NutzungsverhaeltnisService } from './nutzungsverhaeltnis.service';
import { NutzungsverhaeltnisAnlegenDto } from './dto/nutzungsverhaeltnis-anlegen.dto';
import { NutzungsverhaeltnisBeendenDto } from './dto/nutzungsverhaeltnis-beenden.dto';
import { NutzungsverhaeltnisListQueryDto } from './dto/nutzungsverhaeltnis-list-query.dto';
import type { NutzungsverhaeltnisDetail, NutzungsverhaeltnisListItem } from './nutzungsverhaeltnis.types';

/**
 * Macht aus einem Datumswert einen Skalar, den der Audit-Envelope annimmt.
 *
 * WARUM DAS NOETIG IST, obwohl der Typ `string` sagt: `NutzungsverhaeltnisDetail.
 * gueltigVon` ist als `string` deklariert, aber der `pg`-Treiber liefert
 * `date`/`timestamptz`-Spalten als JavaScript-`Date`. Der deklarierte Typ ist
 * an dieser Stelle eine Behauptung ueber die Laufzeit, keine Tatsache — und
 * die Skalar-Pruefung des Audit-Envelopes weist ein `Date` zurueck, was den
 * gesamten Schreibvorgang mit 500 beendet.
 *
 * Aufgefallen ist das erst im Integrationstest gegen echtes PostgreSQL. Ein
 * Unit-Test mit `'2026-01-01T00:00:00.000Z'` als Fixture haette es nie
 * gezeigt: Dort stimmt der Typ.
 */
function alsAuditText(wert: unknown): string | undefined {
  if (wert === null || wert === undefined) {
    return undefined;
  }
  if (wert instanceof Date) {
    return wert.toISOString();
  }
  // Nur echte Zeichenketten durchlassen. Ein beliebiges Objekt zu
  // stringifizieren erzeugte `[object Object]` im Audit-Log — eine Zeile, die
  // aussieht wie ein Beleg und keiner ist. Was hier nicht passt, fehlt lieber.
  return typeof wert === 'string' ? wert : undefined;
}

@Controller('stammdaten/nutzungsverhaeltnisse')
export class NutzungsverhaeltnisController {
  constructor(private readonly nutzungsverhaeltnisService: NutzungsverhaeltnisService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query() query: NutzungsverhaeltnisListQueryDto): Promise<Seite<NutzungsverhaeltnisListItem>> {
    return this.nutzungsverhaeltnisService.liste({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.endkundeId !== undefined ? { endkundeId: query.endkundeId } : {}),
      ...(query.anschlussnutzerId !== undefined ? { anschlussnutzerId: query.anschlussnutzerId } : {}),
      ...(query.systemId !== undefined ? { systemId: query.systemId } : {}),
      ...(query.nurAktuelle !== undefined ? { nurAktuelle: query.nurAktuelle } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:nutzungsverhaeltnis')
  @AuditAction<NutzungsverhaeltnisDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.NUTZUNGSVERHAELTNIS_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
    // Auflage C-9 (V0086): Das Ingest-Gate entscheidet unter anderem anhand
    // dieser Zeile, ob fuer einen Zaehler eine Rechtsgrundlage besteht -- und
    // der Verwurf eines Uplinks schreibt bewusst KEIN eigenes Ereignis
    // (A12-13/C-4c). Die Rekonstruierbarkeit vergangener Gate-Entscheidungen
    // haengt deshalb daran, dass die EINGANGSGROESSEN belegt sind.
    //
    // `rolle` und `gueltig_von` stehen seit V0086 im Ereignis SELBST, statt
    // sich darauf zu verlassen, dass die Tabellenspalten unveraenderlich
    // bleiben. Sie sind es heute (der einzige UPDATE-Pfad setzt
    // `gueltig_bis`) -- aber ein Nachweis, dessen Aussagekraft an einer
    // Eigenschaft haengt, die woanders steht, ist eine Wette auf die Zukunft.
    //
    // KEIN Anschlussnutzer und KEIN System im Kontext: Die Zuordnung steht in
    // der Zeile, auf die `objekt_ref` zeigt. Sie zusaetzlich ins Ereignis zu
    // schreiben, machte aus dem Audit-Log eine zweite Personendatenablage.
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      rolle: ({ result }) => result?.rolle,
      gueltig_von: ({ result }) => alsAuditText(result?.gueltigVon),
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: NutzungsverhaeltnisAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NutzungsverhaeltnisDetail> {
    const result = await this.nutzungsverhaeltnisService.anlegen(dto);
    response.setHeader('Location', `/stammdaten/nutzungsverhaeltnisse/${result.id}`);
    return result;
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':nutzungsverhaeltnisId')
  async lesen(@Param('nutzungsverhaeltnisId') nutzungsverhaeltnisId: string): Promise<NutzungsverhaeltnisDetail> {
    return this.nutzungsverhaeltnisService.detail(nutzungsverhaeltnisId);
  }

  @Roles('betrieb')
  @Fachaktion('update:nutzungsverhaeltnis')
  @AuditAction<NutzungsverhaeltnisDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.NUTZUNGSVERHAELTNIS_BEENDET,
    objektRefExtractor: ({ result }) => result?.id,
    // Auflage C-9 (V0086): Das Ende eines Nutzungsverhaeltnisses verschiebt
    // das SUBJEKT der Rechtsgrundlage vom Anschlussnutzer zurueck zum
    // Endkunden -- eine Gate-Entscheidung faellt danach anders aus als davor.
    // Ohne belegtes Enddatum laesst sich nicht rekonstruieren, ab wann.
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      gueltig_bis: ({ result }) => alsAuditText(result?.gueltigBis),
    },
  })
  @Patch(':nutzungsverhaeltnisId')
  async beenden(
    @Param('nutzungsverhaeltnisId') nutzungsverhaeltnisId: string,
    @Body() dto: NutzungsverhaeltnisBeendenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NutzungsverhaeltnisDetail> {
    return this.nutzungsverhaeltnisService.beenden(nutzungsverhaeltnisId, dto);
  }
}
