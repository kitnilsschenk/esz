/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness-Probe (öffentlich)
         * @description Öffentlicher, unauthentisierter Liveness-Endpunkt. Antwortet ohne Abhängigkeitsprüfung, solange der Prozess läuft. Für Orchestrator- und CI-Probes gedacht.
         */
        get: operations["getLiveness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Readiness-Probe (öffentlich)
         * @description Öffentlicher Readiness-Endpunkt. Prüft nachgelagerte Abhängigkeiten; im Skelett ausschließlich PostgreSQL/TimescaleDB via `SELECT 1`. Liefert 503, sobald eine Pflicht-Abhängigkeit nicht erreichbar ist.
         */
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        LivenessStatus: {
            /**
             * @description Statischer Liveness-Indikator.
             * @enum {string}
             */
            status: "ok";
            /**
             * @description Anwendungsversion (SemVer).
             * @example 0.1.0
             */
            version?: string;
            /** @description Prozesslaufzeit in Sekunden. */
            uptimeSeconds?: number;
            /**
             * Format: date-time
             * @description Serverzeit in UTC (ISO 8601, Suffix `Z`).
             * @example 2026-07-09T10:00:00.000Z
             */
            timestamp: string;
        };
        ReadinessStatus: {
            /**
             * @description Aggregierter Bereitschaftsstatus.
             * @enum {string}
             */
            status: "ok" | "error";
            checks: {
                database: components["schemas"]["DependencyCheck"];
            };
            /**
             * Format: date-time
             * @description Serverzeit in UTC (ISO 8601, Suffix `Z`).
             * @example 2026-07-09T10:00:00.000Z
             */
            timestamp: string;
        };
        DependencyCheck: {
            /**
             * @description Erreichbarkeit der Abhängigkeit.
             * @enum {string}
             */
            status: "up" | "down";
            /**
             * @description Optionaler, vordefinierter generischer Statustoken. NIEMALS rohe DB-/Netzwerk-Fehlertexte durchreichen — unauthentisierter Endpunkt, kein Topologie-Leak (backend-lead-Finding, hoch). Rohdiagnose gehört ausschließlich ins interne Log.
             * @enum {string}
             */
            detail?: "ready" | "not_ready";
        };
        /** @description Fehlerobjekt nach RFC 9457 (application/problem+json). */
        Problem: {
            /**
             * Format: uri
             * @description URI-Referenz, die den Fehlertyp identifiziert.
             * @default about:blank
             */
            type: string;
            /** @description Kurze, menschenlesbare Zusammenfassung des Fehlertyps. */
            title: string;
            /** @description HTTP-Statuscode. */
            status: number;
            /** @description Menschenlesbare, PII-freie Detailbeschreibung. */
            detail?: string;
            /**
             * Format: uri
             * @description URI-Referenz, die das konkrete Auftreten identifiziert.
             */
            instance?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getLiveness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dienst ist lebendig. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LivenessStatus"];
                };
            };
            /** @description Dienst nicht verfügbar. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Unerwarteter Fehler. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dienst ist bereit; alle Pflicht-Abhängigkeiten erreichbar. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadinessStatus"];
                };
            };
            /** @description Nicht bereit; mindestens eine Pflicht-Abhängigkeit down. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Unerwarteter Fehler. */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
}
