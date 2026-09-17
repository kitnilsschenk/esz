import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { NUTZERINFO_EVENT_CODES } from './audit/nutzerinfo-audit-events';
import { NutzerinformationService } from './nutzerinformation.service';
import { NutzerinfoLaufDto } from './dto/nutzerinfo-lauf.dto';
import { NutzerinfoSammelZustellungDto, NutzerinfoZustellungDto } from './dto/nutzerinfo-zustellung.dto';
import { NutzerinfoDokumentService } from './dokument/nutzerinfo-dokument.service';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { NutzerinfoQueryDto } from './dto/nutzerinfo-query.dto';
import type {
  NutzerinfoBericht,
  NutzerinfoLaufErgebnis,
  NutzerinfoMonatsstand,
  NutzerinfoSammelZustellung,
  NutzerinformationItem,
} from './nutzerinfo.types';

const STANDARD_LIMIT = 24;

/**
 * `/nutzerinfo/*` — die monatliche Nutzerinformation (TB-06, [Q3] Kap. 6).
 *
 * **Rollen.** Lesen: `betrieb` und `compliance-auditor` — für den Auditor ist
 * es der Nachweis, dass die Auflage erfüllt wird. Schreiben: nur `betrieb`.
 *
 * **Was hier NICHT ist: Endkunden-Zugang.** Diese Routen sind die
 * Betriebssicht. Der Kunde selbst kommt über `PortalModule`
 * (`PortalAuthController`, Sitzungs-Cookie, eigene Authentisierung) an
 * dieselben Zahlen — dort auch an seinen Widerspruch (Opt-out). Das
 * Kundendokument dieser Controller-Routen weist seit der Portal-Einführung
 * selbst auf das Portal hin (`nutzerinfo-dokument.renderer.ts`,
 * `renderePortalHinweis`): Ohne den Hinweis im gedruckten/verschickten Brief
 * erführe ein Kunde nie, dass es den digitalen Weg überhaupt gibt.
 *
 * Der postalische Weg bleibt vollständig bedienbar und ist unabhängig vom
 * Portal: `GET .../dokument` bzw. `GET /nutzerinfo/dokumente` liefern das
 * druckfertige Kundendokument (einzeln oder als Monatsmappe),
 * `POST .../zustellung` bzw. `POST /nutzerinfo/zustellungen` vermerken den
 * Versand — einzeln oder für den ganzen Stapel.
 */
@Controller('nutzerinfo')
export class NutzerinformationController {
  constructor(
    private readonly service: NutzerinformationService,
    private readonly dokumentService: NutzerinfoDokumentService,
  ) {}

  /**
   * Der Verlauf eines Endkunden — die Ansicht, die ein Portal später zeigt.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Get('informationen')
  async liste(@Query() query: NutzerinfoQueryDto): Promise<readonly NutzerinformationItem[]> {
    return this.service.findeFuerEndkunde(query.endkundeId, query.limit ?? STANDARD_LIMIT);
  }

  /**
   * „Ist der Monat durch?" — die Frage, die auf den Arbeitsplatz gehoert.
   *
   * Ohne `monat` antwortet der Server fuer den letzten ABGESCHLOSSENEN Monat
   * und sagt in der Antwort, welcher das war. Welcher Monat gerade zaehlt,
   * haengt an der Zeitzone und soll nicht in jeder Oberflaeche neu
   * ausgerechnet werden.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Get('status')
  async status(@Query('monat') monat?: string): Promise<NutzerinfoMonatsstand> {
    return this.service.monatsstand(monat);
  }

  /**
   * Der Bericht, den der Endkunde zu sehen bekommt.
   *
   * Eigene Route und nicht ein groesseres `informationen/:id`: Die
   * Detail-Auskunft ist eine Zeile, der Bericht zieht die Gruppen-Aufteilung
   * und den Vormonat nach. Wer nur den Zustellstand braucht, soll nicht drei
   * zusaetzliche Abfragen ausloesen.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Get('informationen/:id/bericht')
  async bericht(@Param('id') id: string): Promise<NutzerinfoBericht> {
    return this.service.bericht(id);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Get('informationen/:id')
  async einzeln(@Param('id') id: string): Promise<NutzerinformationItem> {
    return this.service.findeById(id);
  }

  /**
   * Erzeugungslauf für einen abgeschlossenen Monat.
   *
   * Ohne `ausfuehren: true` ein Probelauf. Die interessante Zahl ist nicht,
   * wie viele Informationen entstehen, sondern `ohneBerechnung`: Für diese
   * Kunden gibt es keinen eindeutig bindbaren Berechnungslauf — sie können
   * nicht informiert werden, obwohl sie es müssten. Das ist die Zahl, die
   * eine Auflagenverletzung sichtbar macht.
   */
  @Roles('betrieb')
  @Fachaktion('create:nutzerinfo_lauf')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<NutzerinfoLaufErgebnis>({
    eventTyp: NUTZERINFO_EVENT_CODES.ERZEUGT,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      monat: ({ result }) => result?.monat,
      modus: ({ result }) => result?.modus,
      anzahl_erzeugt: ({ result }) => result?.anzahlErzeugt,
      anzahl_uebersprungen_widerspruch: ({ result }) => result?.uebersprungenWiderspruch,
      anzahl_uebersprungen_gesperrt: ({ result }) => result?.uebersprungenGesperrt,
      anzahl_ohne_berechnung: ({ result }) => result?.ohneBerechnung,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('laeufe')
  async lauf(
    @Body() dto: NutzerinfoLaufDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NutzerinfoLaufErgebnis> {
    return dto.ausfuehren === true ? this.service.fuehreAus(dto.monat) : this.service.probelauf(dto.monat);
  }

  /**
   * Das druckfertige Kundendokument zu EINER Information.
   *
   * `text/html` und nicht PDF: Ein PDF-Erzeuger waere eine neue
   * Produktivabhaengigkeit (freigabepflichtig, `.claude/rules/dependencies.md`)
   * fuer etwas, das der Browser mit „Drucken -> Als PDF sichern" ohnehin
   * leistet. Das Dokument ist eigenstaendig: kein Skript, kein Bild, keine
   * externe Schrift.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Get('informationen/:id/dokument')
  async dokument(@Param('id') id: string): Promise<string> {
    return (await this.dokumentService.einzeln(id)).html;
  }

  /**
   * Die Versandmappe eines Monats — alle Informationen, eine je Seite.
   *
   * Der Grund fuer eine eigene Route: Postversand ist ein Stapelvorgang.
   * Tausend Einzeldateien nacheinander zu oeffnen ist kein Arbeitsablauf,
   * und ohne praktikablen Ablauf bleibt die Auflage unerfuellt.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nutzerinfo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Get('dokumente')
  async dokumente(@Query('monat') monat: string): Promise<string> {
    return (await this.dokumentService.monatsmappe(monat)).html;
  }

  /**
   * Vermerkt die Zustellung — der Nachweis, den TB-06 verlangt.
   *
   * `POST .../zustellung` und nicht `PATCH` auf die Information: Es ist ein
   * Vorgang, kein Feld. Eine zweite Zustellung antwortet 409 und lässt den
   * ersten Zeitpunkt stehen.
   */
  @Roles('betrieb')
  @Fachaktion('zustellen:nutzerinfo')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<NutzerinformationItem>({
    eventTyp: NUTZERINFO_EVENT_CODES.ZUGESTELLT,
    objektRefExtractor: ({ result }) => result?.id,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      monat: ({ result }) => result?.monat,
      zustellweg: ({ result }) => result?.zustellweg ?? undefined,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('informationen/:id/zustellung')
  async zustellung(
    @Param('id') id: string,
    @Body() dto: NutzerinfoZustellungDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NutzerinformationItem> {
    return this.service.vermerkeZustellung(id, dto.zustellweg, dto.zugestelltAt);
  }

  /**
   * Vermerkt die Zustellung fuer einen GANZEN Monat.
   *
   * KEIN `@AuditAction`: Der Vorgang schreibt ein Ereignis JE INFORMATION
   * (V0055-Zuschnitt — die Frage lautet spaeter immer „wurde DIESER Kunde
   * informiert?"), und der Decorator schriebe eine Zeile je Anfrage. Die
   * Emission liegt deshalb im Service.
   *
   * Bereits zugestellte Informationen bleiben unberuehrt und werden gezaehlt;
   * ihr erster Zeitpunkt ist der Nachweis und wird nicht ueberschrieben.
   */
  @Roles('betrieb')
  @Fachaktion('zustellen:nutzerinfo')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('zustellungen')
  async sammelZustellung(
    @Body() dto: NutzerinfoSammelZustellungDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<NutzerinfoSammelZustellung> {
    const subject = requireSecurityContext(request);
    return this.service.vermerkeSammelZustellung(
      dto.monat,
      dto.zustellweg,
      dto.zugestelltAt,
      subject,
      request.synthetic ?? false,
    );
  }
}
