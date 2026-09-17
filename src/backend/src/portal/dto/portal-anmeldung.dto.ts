import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /portal/auth/einloesen` — der Zugangscode aus dem Brief plus das
 * Passwort, das der Kunde dabei setzt.
 *
 * Die Längen sind bewusst großzügig: Der Code darf mit oder ohne
 * Trennstriche eingegeben werden (`normalisiereCode`), und ein Passwort soll
 * nicht an einer knappen Obergrenze scheitern. Die fachliche Regel
 * (Mindestlänge) prüft der Service — mit einer KONKRETEN Meldung, anders als
 * beim Anmelden.
 */
export class PortalEinloesenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  passwort!: string;
}

/** `POST /portal/auth/anmeldung` — Kennung und Passwort. */
export class PortalAnmeldungDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  kennung!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  passwort!: string;
}
