import { IsString, Length, Matches } from 'class-validator';

/**
 * IEEE EUI-64 — genau 16 Hex-Zeichen (8 Byte), optional je Byte-Paar mit
 * `:`/`-` getrennt. Erzwingt STRUKTURELL, dass nach dem Entfernen der
 * Trennzeichen exakt 16 Hex-Zeichen uebrig bleiben — deckungsgleich mit der
 * Normalisierung in `BlindIndexService.normalisiere()` (ADR-0005 §26.3), die
 * NIE eine `ProblemDetailsException` wirft (nur ein rohes `Error`). Diese
 * DTO-Validierung ist daher die tatsaechliche 400-Bad-Request-Grenze — ein
 * Wert, der hier durchkommt, MUSS bei `BlindIndexService.berechne()`
 * erfolgreich normalisieren.
 */
const DEVEUI_FORMAT = /^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){7}$/;

/**
 * `components/schemas/GeraetZuordnungAnlegen` (stammdaten.openapi.yaml,
 * ADR-0005 §26.2/§26.3). `zaehlerId` kommt aus dem Pfad (analog
 * `MesskanalAnlegenDto`, NICHT Teil des Bodys). `devEui` wird NIE geloggt,
 * NIE persistiert (nur feldverschluesselt + als Blind-Index) — RL-2/O4
 * Design-Prinzip 1.
 */
export class GeraetZuordnungAnlegenDto {
  @IsString()
  @Length(16, 23)
  @Matches(DEVEUI_FORMAT, {
    message: 'devEui muss 16 Hex-Zeichen sein (IEEE EUI-64), optional getrennt durch \':\' oder \'-\'.',
  })
  devEui!: string;
}
