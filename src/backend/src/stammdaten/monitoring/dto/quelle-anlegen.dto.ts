import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { TlsModus } from '../ingest-quelle.types';

/** Gleiche Form wie `ingest.quelle_status.quelle_code` (V0039/V0059). */
const QUELLE_CODE_FORM = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/**
 * Host[:Port] — und ausdrücklich KEIN `user:pass@host`.
 *
 * Der Datenbank-CHECK (`ck_quelle_broker_ohne_credentials`) fängt das ohnehin
 * ab, aber erst als 500. Hier wird daraus eine verständliche 400 mit dem
 * Hinweis, wohin die Zugangsdaten stattdessen gehören.
 */
const BROKER_HOST_FORM = /^[A-Za-z0-9.\-_]+(:\d{1,5})?$/;

export const TLS_MODUS_WERTE: readonly TlsModus[] = ['kein_tls', 'tls', 'mtls'];

/**
 * PEM-Block, wie ihn jedes Werkzeug ausgibt. Die Prüfung ist bewusst grob:
 * Sie fängt den häufigen Fall ab, dass jemand eine DER-Datei oder einen
 * halben Block einfügt — die inhaltliche Gültigkeit prüft erst der
 * Verbindungsaufbau, und das ist auch der richtige Ort dafür.
 */
const PEM_FORM = /^$|^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----\s*$/;

export class QuelleAnlegenDto {
  @IsString()
  @Matches(QUELLE_CODE_FORM, {
    message:
      'quelleCode: Kleinbuchstaben, Ziffern, "-" und "_", beginnend mit Buchstabe oder Ziffer, hoechstens 63 Zeichen.',
  })
  quelleCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bezeichnung!: string;

  @IsString()
  @MaxLength(255)
  @Matches(BROKER_HOST_FORM, {
    message:
      'brokerHost: nur Host oder Host:Port. Zugangsdaten gehoeren in die Felder benutzername/passwort, nicht in die Adresse.',
  })
  brokerHost!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  topic!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  clientId!: string;

  @IsIn(TLS_MODUS_WERTE)
  tlsModus!: TlsModus;

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
  @Matches(PEM_FORM, { message: 'caZertifikat: PEM-Block erwartet (-----BEGIN … -----END …).' })
  caZertifikat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64_000)
  @Matches(PEM_FORM, { message: 'clientZertifikat: PEM-Block erwartet (-----BEGIN … -----END …).' })
  clientZertifikat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64_000)
  @Matches(PEM_FORM, { message: 'clientSchluessel: PEM-Block erwartet (-----BEGIN … -----END …).' })
  clientSchluessel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notiz?: string;
}
