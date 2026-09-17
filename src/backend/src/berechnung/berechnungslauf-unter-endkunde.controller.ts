import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { ListQueryDto, resolveLimit } from '../stammdaten/common/list-query.dto';
import type { Seite } from '../stammdaten/common/seite.dto';
import { BerechnungslaufService } from './berechnungslauf.service';
import type { BerechnungslaufListItem } from './berechnungslauf.types';

/**
 * `GET /berechnung/endkunden/{endkundeId}/laeufe`
 * (`schemas/openapi/berechnung.openapi.yaml`, ADR-0006 Teil B) — PII-freie
 * Liste der Berechnungsläufe eines Endkunden, Cursor-paginiert. Erster
 * Konsument der Betriebs-UI-Lauf-Liste; das Monats-Detail (`laufergebnis`)
 * kommt über die `{laufId}`-Route (`BerechnungslaufController`).
 *
 * `read:berechnungslauf` — Rollen `betrieb`/`compliance-auditor` (identisch
 * zur Detail-Route). ABAC-Auflösung über den bestehenden
 * `StammdatenResourceAttributesProvider`-Zweig `params['endkundeId']`
 * (→ `resolveViaEndkunde`) — kein Modul-lokaler ABAC-Code. Reine Lese-Route
 * OHNE eigenes Audit-Event (Konvention `read:standort`/`read:monitoring`,
 * M2).
 *
 * Eigener Controller (nicht `BerechnungslaufController`, das auf
 * `berechnung/laeufe` gemountet ist), analog `StandortUnterEndkundeController`
 * — der Pfad-Präfix `berechnung/endkunden` trägt den `endkundeId`-Parameter,
 * den die ABAC-Auflösung braucht.
 */
@Controller('berechnung/endkunden')
export class BerechnungslaufUnterEndkundeController {
  constructor(private readonly berechnungslaufService: BerechnungslaufService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:berechnungslauf')
  @Get(':endkundeId/laeufe')
  async liste(
    @Param('endkundeId') endkundeId: string,
    @Query() query: ListQueryDto,
  ): Promise<Seite<BerechnungslaufListItem>> {
    return this.berechnungslaufService.listeFuerEndkunde(endkundeId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }
}
