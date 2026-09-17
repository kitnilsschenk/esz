import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * `PUT /stammdaten/messkonzept-energietraeger/{mvetId}/systeme` — die
 * Systemgrenze als MENGE.
 *
 * Ein leeres Array ist ausdrücklich zulässig: Es bedeutet „keine Zuordnung",
 * und der Berechnungslauf fällt dann auf alle aktiven Zähler des Endkunden
 * zurück (`endkunde_fallback`). Das ist selten gewollt, muss aber
 * ausdrückbar bleiben — sonst käme man aus einer falsch gesetzten Grenze
 * nicht mehr heraus.
 */
export class SystemgrenzeSetzenDto {
  @IsArray()
  // 200 Systeme sind weit jenseits dessen, was eine Liegenschaft hat; die
  // Grenze steht gegen einen versehentlich riesigen Body, nicht gegen einen
  // fachlichen Fall.
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  systemIds!: string[];
}
