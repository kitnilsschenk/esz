/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * OIDC-Login starten (öffentlich, 302 zu Keycloak)
         * @description Startet den Authorization-Code-Flow mit PKCE (S256, IdP-seitig auf `edms-bff` ERZWUNGEN). Das Backend erzeugt `state`, `nonce`, `code_verifier`/`code_challenge`, legt sie in einem kurzlebigen, verschlüsselten, httpOnly, Secure, SameSite=Lax-Vor-Auth-Cookie (`__Host-edms_auth_tx`) ab (SameSite=Lax ist nötig, weil der Rücksprung von Keycloak eine Top-Level-Navigation ist) und antwortet mit 302 zur Keycloak-Authorization-URL. FESTER SPA-Einstiegspunkt: v1 kennt bewusst KEINEN `redirect_uri`-Parameter (Open-Redirect-Fläche vermieden, STRIDE-3). Ein konfigurierbares Ziel kommt später NUR mit exakter Pfad-Allowlist.
         */
        get: operations["authLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * OIDC-Callback (öffentlich, Code-Exchange serverseitig, 302 zur SPA)
         * @description Rücksprungziel von Keycloak. Validiert `state` gegen den Vor-Auth-Cookie, tauscht `code` + `code_verifier` serverseitig am Keycloak-Token-Endpoint (vertraulicher Client), validiert das ID-Token (u. a. `nonce`), setzt das Refresh-Token als httpOnly+Secure+ SameSite=Strict-Cookie (`__Host-edms_rt`) und leitet mit 302 in die SPA. Der Access-Token wird NICHT in die Redirect-URL geschrieben (History-/Referer-Leak-Schutz); die SPA holt ihn direkt danach über `POST /auth/refresh`. Pflicht-Audit-Event `auth.anmeldung.erfolg` wird erst NACH vollständiger Token-Validierung emittiert (rote Linie 1).
         */
        get: operations["authCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Access-Token erneuern (Refresh-Cookie; CSRF-geschützt)
         * @description Liest das Refresh-Token aus dem httpOnly-Cookie `__Host-edms_rt`, ruft den Keycloak-Token-Endpoint (`grant_type=refresh_token`) auf, ROTIERT das Refresh-Token (setzt neues `__Host-edms_rt`) und liefert einen frischen Access-Token im Body (NUR SPA-Memory, M3). Keycloak setzt Idle-Timeout (30 min) und absolute Session (8 h) durch; abgelaufen → 401, die SPA leitet dann zu `/auth/login`. CSRF-Schutz (D2, entschieden): SameSite=Strict + serverseitiger Origin-Allowlist-Check (KEIN Double-Submit); Voraussetzung ist eine CORS-Sperre ohne Origin-Reflexion mit Credentials. Parallele-Tabs-Race: der Client serialisiert Refreshes (Single-Flight, Web Locks API); Keycloak toleriert kleine Refresh-Reuse (`refreshTokenMaxReuse`) als Defense-in-Depth (STRIDE-1).
         */
        post: operations["authRefresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Abmelden (idempotent; Refresh-Cookie + Keycloak-Session beenden)
         * @description Löscht das Refresh-Cookie und beendet die Keycloak-Session (RP-initiated / Backchannel-Logout, Refresh-Token-Widerruf). Idempotent: mehrfacher Aufruf liefert weiterhin 204. CSRF-Schutz wie /auth/refresh (SameSite=Strict + serverseitiger Origin-Allowlist-Check, CORS ohne Origin-Reflexion). Pflicht-Audit-Event `auth.abmeldung.erfolg`.
         */
        post: operations["authLogout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Aktuelle Sitzung/Prinzipal (Bearer-geschützt)
         * @description Liefert die aus dem VALIDIERTEN Access-Token abgeleitete Sitzungssicht (opake `sub`, gemappte Rollen, actor_typ) für die SPA-UI. Läuft über den globalen JwtAuthGuard (Default-Security oauth2). Enthält KEINE Klartext-PII.
         */
        get: operations["authSession"];
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
        /** @description Kurzlebiger Access-Token für das SPA-Memory (M3). Der Refresh-Token ist NICHT enthalten (nur httpOnly-Cookie). */
        AccessTokenResponse: {
            /** @description Signiertes JWT (Keycloak). NUR im Arbeitsspeicher halten, niemals in localStorage/sessionStorage (frontend-react.md). */
            accessToken: string;
            /** @enum {string} */
            tokenType: "Bearer";
            /** @description Restlaufzeit in Sekunden (A4: 300 = 5 min). */
            expiresIn: number;
        };
        /** @description Aus dem validierten Token abgeleitete Sitzungssicht. Alle Felder personenbeziehbar pseudonym (pii=false); keine Klartext-PII. */
        SessionInfo: {
            /** @description Opake Keycloak-Principal-ID. personenbeziehbar=true; pii=false; art=opake-principal; zweckbindung=Sicherheit/Zugriffskontrolle (Art. 32/88 DSGVO, § 26 BDSG). KEIN Hart-FK (rote Linie 5). */
            sub: string;
            /**
             * @description Akteurstyp (ADR-0003 §13.1; deckt actor_typ). Stammt aus einem EXPLIZITEN Keycloak-Claim (Protocol-Mapper im Realm-as-Code, D1); der Guard validiert fail-closed gegen dieses Enum — fehlender/ unbekannter Wert → 401 (keine Heuristik).
             * @enum {string}
             */
            actorTyp: "benutzer" | "dienstkonto" | "system";
            /** @description Gemappte interne Rollen (aus realm_access/resource_access, D1). */
            roles: ("betrieb" | "compliance-auditor" | "admin" | "geraete-support")[];
            /** @description OPTIONALER Anzeigename (Beschäftigtendatum). Nur wenn vom Realm freigegeben; Datensparsamkeit Art. 5(1)(c). Default nicht gesetzt. */
            name?: string;
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
            /** @description Menschenlesbare, PII-freie Detailbeschreibung. NIEMALS roher IdP-/Token-/Netzwerk-Fehlertext, keine Tokens/Secrets (rote Linie 2). */
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
    authLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Weiterleitung zur Keycloak-Authorization-URL. */
            302: {
                headers: {
                    /** @description Keycloak-Authorization-Endpoint inkl. PKCE-Parametern. */
                    Location?: string;
                    /** @description `__Host-edms_auth_tx` (httpOnly, Secure, SameSite=Lax, Path=/, kurze TTL) — verschlüsselter PKCE-/state-/nonce-Kontext. AUTHENTIFIZIERUNGS-Transienten, kein Log (rote Linie 2). */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Identity-Provider (Keycloak) nicht erreichbar. */
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
    authCallback: {
        parameters: {
            query: {
                code?: string;
                state: string;
                /** @description OIDC-Fehlercode von Keycloak (z. B. abgebrochene MFA). */
                error?: string;
                /** @description Menschenlesbare OIDC-Fehlerbeschreibung von Keycloak. */
                error_description?: string;
                /** @description Keycloak-Session-Referenz (informativ). */
                session_state?: string;
                /** @description Issuer-Identifier nach RFC 9207 (Mixup-Schutz). TODO(security-lead): im BFF aktiv gegen KEYCLOAK_ISSUER_URL prüfen, derzeit nur akzeptiert. */
                iss?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Login erfolgreich; Refresh-Cookie gesetzt, Weiterleitung in die SPA. */
            302: {
                headers: {
                    /** @description Allowlist-geprüftes SPA-Ziel. */
                    Location?: string;
                    /** @description `__Host-edms_rt` (httpOnly, Secure, SameSite=Strict, Path=/, Max-Age = absolute Session 8 h). Refresh-Token = Authentifizierungsgeheimnis (A.5.17). Zusätzlich wird der Vor-Auth-Cookie gelöscht. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Ungültiger/fehlender `state`, `nonce`-Mismatch oder fehlgeschlagener Code-Exchange. PII-frei; kein roher IdP-Fehlertext. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description OIDC-Fehler von Keycloak (z. B. Login/MFA abgebrochen). */
            401: {
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
    authRefresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Neuer Access-Token; Refresh-Cookie rotiert. */
            200: {
                headers: {
                    /** @description Rotiertes `__Host-edms_rt` (Attribute wie /auth/callback). */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessTokenResponse"];
                };
            };
            /** @description Kein/ungültiges/abgelaufenes Refresh-Token bzw. Idle-/Absolut- Timeout überschritten. SPA startet neuen Login. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description CSRF-Abwehr — `Origin` fehlt oder nicht in der serverseitigen Allowlist (Header wird NICHT als Request-Parameter modelliert). */
            403: {
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
    authLogout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Abgemeldet (oder war bereits abgemeldet — idempotent). */
            204: {
                headers: {
                    /** @description `__Host-edms_rt` mit Max-Age=0 gelöscht. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description CSRF-Abwehr — `Origin` fehlt oder nicht in der serverseitigen Allowlist (Header wird NICHT als Request-Parameter modelliert). */
            403: {
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
    authSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sitzungssicht des validierten Prinzipals. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionInfo"];
                };
            };
            /** @description Kein/ungültiges/abgelaufenes Access-Token. */
            401: {
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
