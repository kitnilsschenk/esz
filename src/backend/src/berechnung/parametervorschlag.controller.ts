import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { ParametervorschlagService } from './parametervorschlag.service';
import type { Parametervorschlag } from './parametervorschlag.service';
import { ParametervorschlagQueryDto } from './dto/parametervorschlag-query.dto';

/**
 * `/berechnung/parametervorschlag` — was ein Lauf braucht, aus dem Bestand
 * hergeleitet.
 *
 * **Eigene Route statt eines Vorschlagsblocks in der Lauf-Antwort.** Der
 * Vorschlag wird VOR dem Rechnen gebraucht, der Lauf antwortet danach. Und er
 * ist rein lesend: `read:berechnungslauf` genügt, während das Rechnen
 * `create:berechnungslauf` verlangt. Ein Auditor darf sehen, mit welchen
 * Werten zu rechnen wäre, ohne rechnen zu dürfen.
 *
 * Die Antwort ist bewusst kein bloßer Zahlenvorschlag: Sie trägt auch die
 * Umstände, die einen Lauf ins Leere laufen ließen — fehlende
 * Baseline-Perioden, eine nicht verwertbare Baseline-Einheit, eine leere
 * Systemgrenze (dann greift der `endkunde_fallback` und zieht alle Zähler des
 * Kunden heran), gar keine Messdaten. Diese Dinge fielen sonst erst am
 * Ergebnis auf, und dort sind sie teuer.
 */
@Controller('berechnung/parametervorschlag')
export class ParametervorschlagController {
  constructor(private readonly parametervorschlagService: ParametervorschlagService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:berechnungslauf')
  @Get()
  async ermitteln(@Query() query: ParametervorschlagQueryDto): Promise<Parametervorschlag> {
    return this.parametervorschlagService.ermitteln(query.endkundeId, query.mvetId);
  }
}
