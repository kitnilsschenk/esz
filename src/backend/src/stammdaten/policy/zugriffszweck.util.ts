import type { Request } from 'express';
import type { ZugriffszweckAttribut } from '../../auth/policy/policy-decision-port';

const HEADER_NAME = 'x-edms-zugriffszweck';
const ZAEHLER_HEADER_NAME = 'x-edms-zugriffszweck-zaehler-id';
const VON_HEADER_NAME = 'x-edms-zugriffszweck-von';
const BIS_HEADER_NAME = 'x-edms-zugriffszweck-bis';

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * ADR-0008 §16 (D4) — liest den break-glass-Zweck aus Request-Headern
 * (`X-Edms-Zugriffszweck` = whitelisted Zweck-Code, KEIN Freitext, plus die
 * Zähler-/Zeitfenster-Begrenzung). Reine STRUKTUR-Extraktion — die
 * Whitelist-/Fenster-PRÜFUNG selbst ist PDP-Sache (`InCodePolicyAdapter`,
 * `evaluateBreakGlass()`), nicht Aufgabe dieses Extraktors (Separation of
 * Concerns: der Provider zieht Ressourcen-ATTRIBUTE, der PDP ENTSCHEIDET).
 *
 * v1-Realität (ADR-0008 §16): KEIN Endpoint in diesem Paket konsumiert
 * `read:verbrauch_detail` — dieser Extraktor ist PDP-ready/unit-testbar,
 * ohne dass ein Fach-Endpoint ihn aktuell aufruft.
 */
export function extractZugriffszweck(request: Request): ZugriffszweckAttribut | undefined {
  const zweckCode = headerString(request.headers[HEADER_NAME]);
  const zaehlerId = headerString(request.headers[ZAEHLER_HEADER_NAME]);
  const vonTs = headerString(request.headers[VON_HEADER_NAME]);
  const bisTs = headerString(request.headers[BIS_HEADER_NAME]);

  if (zweckCode === undefined || zaehlerId === undefined || vonTs === undefined || bisTs === undefined) {
    return undefined;
  }

  return { zweckCode, zaehlerId, vonTs, bisTs };
}
