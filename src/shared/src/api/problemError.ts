// Mappt Fehlerantworten im `application/problem+json`-Format (RFC 9457) auf
// eine typisierte Fehlerklasse. Jeder Feature-Hook, der `apiClient` (siehe
// `client.ts`) aufruft, MUSS Fehler ausschließlich über `toApiProblemError`
// in eine `ApiProblemError`-Instanz übersetzen — kein Hook wirft/behandelt
// rohe openapi-fetch-Fehlerwerte oder Netzwerkfehler direkt.

import type { components } from './generated/health';

export type ProblemDetails = components['schemas']['Problem'];

/**
 * Typisierter Fehler für `application/problem+json`-Antworten (RFC 9457).
 * Transportiert ausschließlich die vom Server gelieferten, bereits
 * PII-/topologiefreien Felder (siehe Health-Contract, ADR-0001 §10.7,
 * backend-lead-Finding „Topologie-Leak“) — keine zusätzlichen Rohdaten.
 */
export class ApiProblemError extends Error {
  readonly type: string;
  readonly status: number;
  readonly detail: string | undefined;
  readonly instance: string | undefined;

  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiProblemError';
    this.type = problem.type;
    this.status = problem.status;
    this.detail = problem.detail;
    this.instance = problem.instance;
  }
}

const NETWORK_ERROR_PROBLEM: ProblemDetails = {
  type: 'about:blank',
  title: 'Network Error',
  status: 0,
};

/**
 * Wandelt den Fehlerwert aus `apiClient.GET(...)` (`{ error }`) in eine
 * `ApiProblemError` um. Antworten, die nicht dem Problem-Schema entsprechen
 * (z. B. Verbindungsabbruch vor jeder Antwort), werden auf ein generisches
 * Problem mit Status `0` gemappt, damit Aufrufer immer denselben Fehlertyp
 * behandeln.
 */
export function toApiProblemError(error: unknown): ApiProblemError {
  if (isProblemDetails(error)) {
    return new ApiProblemError(error);
  }

  return new ApiProblemError(NETWORK_ERROR_PROBLEM);
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate['title'] === 'string' && typeof candidate['status'] === 'number';
}
