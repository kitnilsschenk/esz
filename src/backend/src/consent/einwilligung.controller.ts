import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { CONSENT_EVENT_CODES, WIDERSPRUCH_EVENT_CODES } from './audit/consent-audit-events';
import { EinwilligungService } from './einwilligung.service';
import { WiderspruchService } from './widerspruch.service';
import { EinwilligungErteilenDto } from './dto/einwilligung-erteilen.dto';
import { EinwilligungWiderrufenDto } from './dto/einwilligung-widerrufen.dto';
import { SubjektStandQueryDto } from './dto/subjekt-stand-query.dto';
import { TextVersionQueryDto } from './dto/text-version-query.dto';
import { TextVersionVeroeffentlichenDto } from './dto/text-version-veroeffentlichen.dto';
import { WiderspruchErklaerenDto } from './dto/widerspruch-erklaeren.dto';
import { WiderspruchZuruecknehmenDto } from './dto/widerspruch-zuruecknehmen.dto';
import { WiderspruchQueryDto } from './dto/widerspruch-query.dto';
import type {
  EinwilligungItem,
  EinwilligungWiderrufItem,
  SubjektConsentStand,
  TextVersionItem,
  WiderspruchItem,
  ZweckItem,
} from './consent.types';

/**
 * `/consent/*` (ADR-0012 B1) — Verwaltung der Einwilligungen.
 *
 * **Rollen.** Lesen: `betrieb` und `compliance-auditor` — der Auditor MUSS
 * den Consent-Stand sehen können, das ist Teil seiner Aufgabe (Art. 7 Abs. 1
 * DSGVO: Nachweisbarkeit). Schreiben: nur `betrieb`; die DS-01-Regel im PDP
 * hält den Auditor über die Aktions-Präfixe ohnehin fern.
 *
 * **Was hier PII-frei bleibt.** Alle Antworten führen Kennungen, Codes und
 * Zeitpunkte. Die IP und der User-Agent stehen feldverschlüsselt im Beleg
 * und verlassen ihn über diese Schnittstelle NICHT — auch nicht für den
 * Auditor. Wer sie im Streitfall braucht, braucht dafür einen eigenen,
 * auditierten Pfad (nicht gebaut, ADR-0012 O2-Umfeld).
 */
@Controller('consent')
export class EinwilligungController {
  constructor(
    private readonly einwilligungService: EinwilligungService,
    private readonly widerspruchService: WiderspruchService,
  ) {}

  /** Der Zweck-Katalog — die Grundlage jeder Einwilligung. */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:consent')
  @Get('zwecke')
  async zwecke(): Promise<readonly ZweckItem[]> {
    return this.einwilligungService.zwecke();
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:consent')
  @Get('texte')
  async texte(@Query() query: TextVersionQueryDto): Promise<readonly TextVersionItem[]> {
    return this.einwilligungService.textVersionen(query.zweck);
  }

  /**
   * Veröffentlicht eine neue Fassung. Schließt die bisherige GENAU an
   * diesem Zeitpunkt — es gibt zu keinem Zeitpunkt zwei gültige Fassungen
   * desselben Zwecks und auch keine Lücke.
   */
  @Roles('betrieb')
  @Fachaktion('create:consent_text')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<TextVersionItem>({
    eventTyp: CONSENT_EVENT_CODES.TEXT_VEROEFFENTLICHT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zweck_code: ({ result }) => result?.zweckCode,
      fassung: ({ result }) => result?.fassung,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post('texte')
  async veroeffentliche(
    @Body() dto: TextVersionVeroeffentlichenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<TextVersionItem> {
    return this.einwilligungService.veroeffentlicheTextVersion(dto);
  }

  /**
   * Der Stand EINES Subjekts über alle Zwecke — die Ansicht, die eine
   * Auskunft nach Art. 15 DSGVO beantwortet. Enthält bewusst auch Zwecke
   * ohne Einwilligung: Eine Liste, die nur Erteiltes zeigt, sagt nichts
   * über das Nicht-Erteilte.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:consent')
  @Get('einwilligungen')
  async stand(@Query() query: SubjektStandQueryDto): Promise<SubjektConsentStand> {
    return this.einwilligungService.standFuerSubjekt(query.subjektTyp, query.subjektId);
  }

  /**
   * Erfasst eine Einwilligung. **Kein digitales Opt-in** — s.
   * `EinwilligungService`: Die dabei zu protokollierende IP wäre die des
   * Bearbeiters, nicht die der betroffenen Person.
   */
  @Roles('betrieb')
  @Fachaktion('create:einwilligung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EinwilligungItem>({
    eventTyp: CONSENT_EVENT_CODES.ERTEILT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zweck_code: ({ result }) => result?.zweckCode,
      text_version_id: ({ result }) => result?.textVersionId,
      subjekt_typ: ({ result }) => result?.subjektTyp,
      rechtsgrundlage: ({ result }) => result?.rechtsgrundlage,
      erfassungsweg: ({ result }) => result?.erfassungsweg,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post('einwilligungen')
  async erteile(
    @Body() dto: EinwilligungErteilenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinwilligungItem> {
    return this.einwilligungService.erteile(dto);
  }

  /**
   * Widerruf (Art. 7 Abs. 3 DSGVO). Beendet die Wirkung AB diesem Zeitpunkt
   * und löscht nichts — die bis dahin erfolgte Verarbeitung bleibt
   * rechtmäßig, und ihr Nachweis muss erhalten bleiben.
   *
   * `POST .../widerruf` statt `DELETE`: Ein `DELETE` würde suggerieren, dass
   * etwas verschwindet. Es verschwindet nichts.
   */
  @Roles('betrieb')
  @Fachaktion('widerrufen:einwilligung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<EinwilligungWiderrufItem>({
    eventTyp: CONSENT_EVENT_CODES.WIDERRUFEN,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zweck_code: ({ result }) => result?.zweckCode,
      subjekt_typ: ({ result }) => result?.subjektTyp,
      // Auflage C-10 (V0089) — die WIRKUNG des Widerrufs, gemessen am
      // Ingest-Gate. Ohne sie belegte das Log nur, dass widerrufen wurde,
      // nicht was das fuer die Messung bedeutet. Fehlt die Messung (kein
      // EXECUTE-Recht auf dem Gate, s. `EinwilligungService.widerrufe()`),
      // fehlen die Schluessel ganz — eine `0` waere hier die gefaehrlichste
      // Angabe: sie liesse „nicht gemessen" wie „nichts betroffen" aussehen.
      zaehler_gestoppt: ({ result }) =>
        result?.wirkung === null || result?.wirkung === undefined ? undefined : String(result.wirkung.zaehlerGestoppt),
      zaehler_ohne_grundlage: ({ result }) =>
        result?.wirkung === null || result?.wirkung === undefined
          ? undefined
          : String(result.wirkung.zaehlerOhneGrundlage),
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('einwilligungen/:id/widerruf')
  async widerrufe(
    @Param('id') id: string,
    @Body() dto: EinwilligungWiderrufenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinwilligungWiderrufItem> {
    return this.einwilligungService.widerrufe(id, dto);
  }

  /**
   * Die Widersprueche einer Person — die andere Haelfte der Matrix.
   *
   * Getrennt vom Consent-Stand und nicht in ihn eingebettet: Ein Widerspruch
   * ist kein Zustand einer Einwilligung, sondern eine eigene Erklaerung zu
   * einer Verarbeitung, die es auch ohne Zustimmung gibt. Wer beides in eine
   * Liste legt, laedt dazu ein, sie zu verwechseln.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:consent')
  @Get('widersprueche')
  async widersprueche(@Query() query: WiderspruchQueryDto): Promise<readonly WiderspruchItem[]> {
    return this.widerspruchService.findeFuerSubjekt(query.subjektTyp, query.subjektId);
  }

  /**
   * Widerspruch bzw. Abwahl erfassen (AW-27).
   *
   * Fuer `wiss_auswertung` setzt der Vorgang zugleich das Ausnahme-Attribut
   * am Subjekt — die Durchsetzungsstelle bleibt das Attribut, aber es folgt
   * ab jetzt der Erklaerung und wird nicht mehr von Hand gesetzt.
   */
  @Roles('betrieb')
  @Fachaktion('create:widerspruch')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<WiderspruchItem>({
    eventTyp: WIDERSPRUCH_EVENT_CODES.ERKLAERT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zweck_code: ({ result }) => result?.zweckCode,
      subjekt_typ: ({ result }) => result?.subjektTyp,
      erlaubnismodus: ({ result }) => result?.erlaubnismodus,
      erfassungsweg: ({ result }) => result?.erfassungsweg,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post('widersprueche')
  async widerspreche(
    @Body() dto: WiderspruchErklaerenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<WiderspruchItem> {
    return this.widerspruchService.erklaere(dto);
  }

  /**
   * Ruecknahme eines Widerspruchs.
   *
   * `POST .../ruecknahme` statt `DELETE`: Es verschwindet nichts. Die
   * Erklaerung bleibt stehen, weil sonst auch der Nachweis ueber den
   * Zeitraum verschwaende, in dem widersprochen war.
   */
  @Roles('betrieb')
  @Fachaktion('zuruecknehmen:widerspruch')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<WiderspruchItem>({
    eventTyp: WIDERSPRUCH_EVENT_CODES.ZURUECKGENOMMEN,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zweck_code: ({ result }) => result?.zweckCode,
      subjekt_typ: ({ result }) => result?.subjektTyp,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('widersprueche/:id/ruecknahme')
  async nimmWiderspruchZurueck(
    @Param('id') id: string,
    @Body() dto: WiderspruchZuruecknehmenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<WiderspruchItem> {
    return this.widerspruchService.nimmZurueck(id, dto);
  }
}
