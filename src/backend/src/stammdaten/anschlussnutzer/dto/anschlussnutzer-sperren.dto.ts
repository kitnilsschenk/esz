import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  EINSCHRAENKUNG_GRUND_CODES,
  type EinschraenkungGrundCode,
} from '../../../nachweis/domain/paar-einschraenkung';

/**
 * `components/schemas/AnschlussnutzerSperren` (stammdaten.openapi.yaml) —
 * `POST /stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren`,
 * ADR-0007 A11.1/A11.6.
 *
 * Inhaltlich identisch zu `EndkundeSperrenDto` — die vollstaendige Begruendung
 * (warum Pflicht, warum kein Auffangcode, warum `gesperrtSeit` kein Feld ist)
 * steht dort und gilt hier unveraendert: der Anschlussnutzer ist eine EIGENE
 * betroffene Person mit denselben Betroffenenrechten, nicht ein Anhaengsel des
 * Endkunden.
 *
 * Bewusst ein eigenes DTO statt Wiederverwendung des Endkunden-DTO: die beiden
 * Routen sind eigenstaendige API-Ressourcen mit eigenem OpenAPI-Schema, und ein
 * geteiltes DTO wuerde eine Kopplung suggerieren, die es fachlich nicht gibt
 * (ein Anschlussnutzer kann unabhaengig vom Endkunden gesperrt werden — genau
 * das ist der Zweck dieses Pfades). Die GEMEINSAME Substanz — Werteliste und
 * 200/409-Entscheidung — ist stattdessen geteilt
 * (`EINSCHRAENKUNG_GRUND_CODES`, `entscheideSperre()`).
 */
export class AnschlussnutzerSperrenDto {
  @IsIn(EINSCHRAENKUNG_GRUND_CODES)
  grund!: EinschraenkungGrundCode;

  /**
   * Auflage C-8 (ADR-0012 Stufe C) — bei Sperrgrund Art. 18 Abs. 1 lit. b
   * oder lit. d PFLICHT, bei lit. a und lit. c UNZULAESSIG. Beide Regeln
   * setzt `pruefeNeuerhebungsEntscheidung()` durch, nicht dieses DTO: sie
   * haengen am Wert eines ANDEREN Feldes, und die Fehlermeldung soll den
   * fachlichen Grund nennen statt eines Schema-Verstosses.
   *
   * `true` = die Messdaten-Erhebung laeuft trotz der Einschraenkung weiter,
   * `false` = das Ingest-Gate liefert fuer die Zaehler dieses Subjekts ab
   * sofort `false` und Uplinks werden verworfen. Die Entscheidung ist keine
   * Voreinstellung, die man nachjustiert — sie erzeugt oder verhindert eine
   * Messluecke, die sich nachtraeglich nicht schliessen laesst.
   */
  @IsOptional()
  @IsBoolean()
  neuerhebungFortsetzen?: boolean;
}
