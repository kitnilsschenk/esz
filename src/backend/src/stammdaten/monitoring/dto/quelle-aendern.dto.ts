import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { QuelleStatus, TlsModus } from '../ingest-quelle.types';
import { TLS_MODUS_WERTE } from './quelle-anlegen.dto';

const BROKER_HOST_FORM = /^[A-Za-z0-9.\-_]+(:\d{1,5})?$/;
// Der Leerstring ist ausdruecklich erlaubt: Er ENTFERNT ein hinterlegtes
// Geheimnis. Ohne die `^$`-Alternative waere ein einmal eingespieltes
// Zertifikat nicht mehr loeschbar, ausser durch Neuanlage der Quelle.
const PEM_FORM = /^$|^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----\s*$/;

export const QUELLE_STATUS_WERTE: readonly QuelleStatus[] = ['aktiv', 'inaktiv'];

/**
 * Änderung einer Datenquelle. Alle Felder optional — ein weggelassenes Feld
 * bleibt, wie es ist.
 *
 * **`quelleCode` fehlt hier mit Absicht.** Über ihn lädt ein Worker seine
 * Konfiguration; ihn im Betrieb umzubenennen hieße, einen laufenden Prozess
 * beim nächsten Start ins Leere greifen zu lassen — und die bereits unter dem
 * alten Code protokollierten Quarantäne-Zeilen zeigten auf nichts mehr. Wer
 * die Kennung ändern will, legt eine neue Quelle an.
 *
 * **Geheimnisse:** Ein weggelassenes Feld lässt das hinterlegte Geheimnis
 * unangetastet — wer eine Quelle umbenennt, löscht damit nicht ihr Passwort.
 * Ein LEERER String entfernt es; das ist die einzige Art, ein Geheimnis
 * wieder loszuwerden, ohne die Quelle neu anzulegen. Deshalb steht auf den
 * Geheimnis-Feldern KEIN `@MinLength(1)`.
 */
export class QuelleAendernDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bezeichnung?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(BROKER_HOST_FORM, {
    message:
      'brokerHost: nur Host oder Host:Port. Zugangsdaten gehoeren in die Felder benutzername/passwort, nicht in die Adresse.',
  })
  brokerHost?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  topic?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  clientId?: string;

  @IsOptional()
  @IsIn(TLS_MODUS_WERTE)
  tlsModus?: TlsModus;

  @IsOptional()
  @IsIn(QUELLE_STATUS_WERTE)
  status?: QuelleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notiz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  benutzername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  passwort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64_000)
  @Matches(PEM_FORM, { message: 'caZertifikat: PEM-Block erwartet (-----BEGIN … -----END …), oder leer zum Entfernen.' })
  caZertifikat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64_000)
  @Matches(PEM_FORM, {
    message: 'clientZertifikat: PEM-Block erwartet (-----BEGIN … -----END …), oder leer zum Entfernen.',
  })
  clientZertifikat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64_000)
  @Matches(PEM_FORM, {
    message: 'clientSchluessel: PEM-Block erwartet (-----BEGIN … -----END …), oder leer zum Entfernen.',
  })
  clientSchluessel?: string;
}
