import { Injectable, Logger } from '@nestjs/common';
import { hashIp } from './hash-ip.util';

/**
 * Strukturiertes Security-Log für AuthN-Ablehnungen (401) — ADR-0002 §15
 * (`security-lead`-Votum 4): "401-Security-Log strukturiert (Route/ts/
 * Grund-Code/IP-Hash), nie Rohtoken/Claims". 401 ist bewusst KEIN
 * `audit.event` (rote Linie 1 — ohne validierten Prinzipal keine
 * Akteurs-Zuschreibung); dieses Log ist der Ersatz-Kanal für
 * Security-Monitoring unauthentisierter Zugriffe.
 *
 * Feld-Whitelist (kein `pino` als neue Dependency eingeführt — s. finale
 * Antwort, Abweichung: minimaler eigener Structured-Logger statt
 * `pino`-Redact-Konfiguration; funktional äquivalent für den hier
 * benötigten Umfang). Gibt NIE Tokens, Header-Rohwerte oder Claims aus.
 */
@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger('SecurityLog');

  // Arrow-Klassenfeld statt Methode — vermeidet `@typescript-eslint/
  // unbound-method` beim Mocken in Tests, ohne die Regel zu unterdrücken
  // (s. `access-token-verifier.service.ts`).
  authenticationDenied = (input: {
    readonly route: string;
    readonly method: string;
    readonly reasonCode: string;
    readonly ip?: string | undefined;
  }): void => {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      route: input.route,
      method: input.method,
      reasonCode: input.reasonCode,
    };

    const ipHash = hashIp(input.ip);
    if (ipHash !== undefined) {
      entry['ipHash'] = ipHash;
    }

    this.logger.warn(JSON.stringify(entry));
  };
}
