import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { GERAETEERKENNUNG_EVENT_CODES } from './audit/geraeteerkennung-audit-events';
import { GeraeteerkennungService } from './geraeteerkennung.service';
import { GeraetegruppeAnlegenDto } from './dto/geraetegruppe-anlegen.dto';
import { ZuordnungAnlegenDto } from './dto/zuordnung-anlegen.dto';
import { ZuordnungBeendenDto } from './dto/zuordnung-beenden.dto';
import { EntbehrlichVermerkenDto } from './dto/entbehrlich-vermerken.dto';
import { EndkundeQueryDto, QuoteQueryDto } from './dto/geraeteerkennung-query.dto';
import type {
  EntbehrlichkeitItem,
  GeraetegruppeItem,
  ZuordnungItem,
  ZuordnungsQuote,
} from './geraeteerkennung.types';

/**
 * `/geraeteerkennung/*` — Identifikation von Geräte- und Anlagengruppen
 * (TB-05, [Q3] Kap. 5).
 *
 * **Rollen.** Lesen: `betrieb` und `compliance-auditor` — die Quote ist der
 * Nachweis, dass die Auflage erfüllt wird, und gehört damit zur Aufgabe des
 * Auditors. Schreiben: nur `betrieb`.
 *
 * **Drei getrennte Schreib-Aktionen, nicht eine.** Zuordnen, Beenden und die
 * Entbehrlichkeit zu vermerken sind verschieden folgenreich: Das eine hebt
 * die Quote, das andere senkt sie, das dritte nimmt ein System ganz aus der
 * Wertung. Wer zuordnen darf, muss nicht auch eine Auflage für erfüllt
 * erklären dürfen.
 */
@Controller('geraeteerkennung')
export class GeraeteerkennungController {
  constructor(private readonly service: GeraeteerkennungService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:geraeteerkennung')
  @Get('gruppen')
  async gruppen(@Query() query: EndkundeQueryDto): Promise<readonly GeraetegruppeItem[]> {
    return this.service.findeGruppen(query.endkundeId);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:geraeteerkennung')
  @Get('zuordnungen')
  async zuordnungen(@Query() query: EndkundeQueryDto): Promise<readonly ZuordnungItem[]> {
    return this.service.findeZuordnungen(query.endkundeId);
  }

  /**
   * Die Zuordnungsquote für ein Förderjahr — die Zahl, die TB-05 verlangt.
   *
   * Sie ist eine Rechnung, keine Wertung: `erreicht` vergleicht sie mit der
   * Sollquote des Projektjahres, aber die Entbehrlichkeits-Feststellung nach
   * Kap. 5 steht daneben und verändert die Zahl nicht.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:geraeteerkennung')
  @Get('quote')
  async quote(@Query() query: QuoteQueryDto): Promise<ZuordnungsQuote> {
    return this.service.quote(query);
  }

  @Roles('betrieb')
  @Fachaktion('create:geraetegruppe')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post('gruppen')
  async legeGruppeAn(
    @Body() dto: GeraetegruppeAnlegenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<GeraetegruppeItem> {
    return this.service.legeGruppeAn(dto);
  }

  /**
   * Ordnet einen Messkanal einer Gruppe zu — der Vorgang, der die Quote HEBT.
   *
   * Ein Kanal kann zu einem Zeitpunkt nur EINER Gruppe gehören (409), sonst
   * zählte sein Verbrauch doppelt.
   */
  @Roles('betrieb')
  @Fachaktion('create:geraetegruppe_zuordnung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ZuordnungItem>({
    eventTyp: GERAETEERKENNUNG_EVENT_CODES.ZUORDNUNG_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.geraetegruppeId,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      methode: ({ result }) => result?.methode,
      im_gesamtverbrauch_enthalten: ({ result }) => result?.imGesamtverbrauchEnthalten,
      genauigkeit_pct: ({ result }) => result?.genauigkeitPct ?? undefined,
      anteil_prozent: ({ result }) => result?.anteilProzent,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post('zuordnungen')
  async legeZuordnungAn(
    @Body() dto: ZuordnungAnlegenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZuordnungItem> {
    return this.service.legeZuordnungAn(dto);
  }

  /**
   * Beendet eine Zuordnung — der Vorgang, der die Quote SENKT.
   *
   * `POST .../beenden` statt `DELETE`: Es verschwindet nichts. Die Zeile
   * bleibt mit ihrem Grund stehen, sonst wäre auch der Nachweis der Zeit weg,
   * in der die Zuordnung galt.
   */
  @Roles('betrieb')
  @Fachaktion('beenden:geraetegruppe_zuordnung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<ZuordnungItem>({
    eventTyp: GERAETEERKENNUNG_EVENT_CODES.ZUORDNUNG_BEENDET,
    objektRefExtractor: ({ result }) => result?.geraetegruppeId,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      methode: ({ result }) => result?.methode,
    },
  })
  @HttpCode(HttpStatus.OK)
  @Post('zuordnungen/beenden')
  async beendeZuordnung(
    @Body() dto: ZuordnungBeendenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZuordnungItem> {
    return this.service.beendeZuordnung(dto);
  }

  /**
   * Vermerkt, dass eine Geräteerkennung für dieses System nicht sinnvoll ist
   * ([Q3] Kap. 5).
   *
   * **Der Vorgang mit dem grössten Missbrauchspotenzial dieses Moduls** — ein
   * Häkchen, das eine Förderauflage für ein System als erfüllt erklärt.
   * Deshalb eine eigene ABAC-Aktion, ein Pflicht-Audit-Ereignis und eine
   * Pflicht-Begründung.
   */
  /**
   * Der aktuelle Stand der Entbehrlichkeits-Feststellung eines Systems.
   *
   * Ohne diese Route waere das Vermerken schreib-only: Die Betriebssicht
   * koennte ein Haekchen setzen, aber nicht zeigen, ob schon eines gesetzt
   * ist — und der naechste Bearbeiter uebersaehe eine bestehende Feststellung
   * samt ihrer Begruendung.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:geraeteerkennung')
  @Get('systeme/:systemId/entbehrlich')
  async entbehrlichkeit(@Param('systemId') systemId: string): Promise<EntbehrlichkeitItem> {
    return this.service.findeEntbehrlichkeit(systemId);
  }

  @Roles('betrieb')
  @Fachaktion('vermerken:geraeteerkennung_entbehrlich')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<void>({
    eventTyp: GERAETEERKENNUNG_EVENT_CODES.ENTBEHRLICH,
    objektRefExtractor: ({ request }) => (request.params as { systemId?: string }).systemId,
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      entbehrlich: ({ request }) => (request.body as { entbehrlich?: boolean }).entbehrlich,
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('systeme/:systemId/entbehrlich')
  async vermerkeEntbehrlich(
    @Param('systemId') systemId: string,
    @Body() dto: EntbehrlichVermerkenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<void> {
    await this.service.vermerkeEntbehrlich(systemId, dto.entbehrlich, dto.grund);
  }
}
