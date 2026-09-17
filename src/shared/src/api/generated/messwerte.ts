/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/messwerte/standorte/{standortId}/verbrauch": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        /**
         * Aggregierter Verbrauch je Standortknoten (inkl. Unterknoten)
         * @description ABAC-Aktion `read:verbrauch_aggregat` (NEU). Rollen `betrieb`/`compliance-auditor`, KEIN break-glass. Nutzt die Kern-Query "alle Zähler unter Knoten X zum Stichtag T" (ADR-0010 D6, `pfad @> ARRAY[...]` + Zeitscheibe) und aggregiert deren aktive Messkanäle über das halboffene Intervall `[von, bis)` (UTC) in der gewünschten Zeitauflösung (`time_bucket`, Apache-2-konform).
         *     `stichtag` (Default `bis`) legt fest, welcher Zähler-Bestand für die GESAMTE Periode gilt (v1-Vereinfachung — ein Zähler, der WÄHREND `[von, bis)` umgezogen wurde, wird einheitlich nach seinem Zustand zum `stichtag` gezählt, nicht bucket-genau neu aufgelöst).
         *     Response ist PII-FREI: keine Standort-Bezeichnung/Adresse, nur die `standortId` aus dem Pfad ist bereits bekannt.
         */
        get: operations["verbrauchAggregatLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/messwerte/messkanaele/{messkanalId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Messkanal-ID (energy.messkanal.id). */
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        /**
         * Roh-Zeitreihe eines Messkanals (Detailansicht, break-glass)
         * @description ABAC-Aktion `read:verbrauch_detail` (BESTEHEND, ADR-0008 §16/D4 — WIEDERVERWENDET, nicht aufgeweicht). Rollen `betrieb`/`compliance-auditor`; **deny by default** — permit NUR mit vollständig aufgelöstem, whitelisted, fenster-konformem break-glass-Zweck (Header `X-Edms-Zugriffszweck` = Zweck-Code, z. B. `stoerungsdiagnose`; `X-Edms-Zugriffszweck-Zaehler-Id`; `X-Edms-Zugriffszweck-Von`/`-Bis` ≤ `MAX_FENSTER_TAGE`). Sowohl `permit` als auch `deny` werden auditiert (`stammdaten.verbrauch_detail.einsicht`).
         *     Liefert die ROHEN Messwerte inkl. `qualitaet`/`herkunft` — KEINE Differenzbildung/Aggregation (das leistet ausschließlich Route A).
         */
        get: operations["messkanalZeitreiheLesen"];
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
        /** @description Fehlerobjekt nach RFC 9457 (application/problem+json). */
        Problem: {
            /**
             * Format: uri
             * @default about:blank
             */
            type: string;
            title: string;
            status: number;
            /** @description Menschenlesbare, PII-freie Detailbeschreibung. */
            detail?: string;
            /** Format: uri */
            instance?: string;
        };
        /** @enum {string} */
        Aufloesung: "stunde" | "tag" | "monat";
        /** @enum {string} */
        MessgroesseArt: "kumulativ_zaehlerstand" | "intervall_verbrauch";
        /**
         * @description V0002/V0013/V0014-Kanon — NIEMALS als Zahlencode vergleichen (nur über `measurement.rang()` in der DB).
         * @enum {string}
         */
        MesswertQualitaet: "gemessen" | "geschaetzt" | "korrigiert" | "ersatzwert";
        /** @enum {string} */
        MesswertHerkunft: "ingest_live" | "backfill" | "manuell" | "import_altsystem";
        /** @description EIN Punkt der aggregierten Zeitreihe — existiert NUR für Buckets mit belastbarem Wert (Lücken fehlen hier, s. `metadaten.erkannteLuecken`). */
        VerbrauchAggregatPunkt: {
            /** Format: date-time */
            zeitpunkt: string;
            messgroesse: string;
            einheit: string;
            wert: number;
        };
        VerbrauchAggregatMetadaten: {
            /** @description Anzahl der zum Stichtag unter dem Knoten verorteten Zähler. */
            einbezogeneZaehler: number;
            /** @description Anzahl der aktiven Hauptmessungen dieser Zähler. Untermessungen sind nicht enthalten, s. `ausgelasseneUntermessungen`. */
            einbezogeneKanaele: number;
            /** @description Anzahl der aktiven Kanäle, die als Untermessung gekennzeichnet sind und deshalb nicht in die Kurve eingehen. Sie messen eine Teilmenge einer Hauptmessung; doppelt gezählt ergäbe das einen zu hohen Verbrauch. */
            ausgelasseneUntermessungen: number;
            /** @description Anzahl (Zeit-Bucket × Messgrößen/Einheiten-Gruppe) OHNE belastbaren Wert. */
            erkannteLuecken: number;
        };
        VerbrauchAggregatAntwort: {
            zeitreihe: components["schemas"]["VerbrauchAggregatPunkt"][];
            metadaten: components["schemas"]["VerbrauchAggregatMetadaten"];
        };
        MesswertRohPunkt: {
            /** Format: date-time */
            ts: string;
            wert: number;
            qualitaet: components["schemas"]["MesswertQualitaet"];
            herkunft: components["schemas"]["MesswertHerkunft"];
        };
        MesswertZeitreiheAntwort: {
            /** Format: uuid */
            messkanalId: string;
            messgroesse: string;
            einheit: string;
            art: components["schemas"]["MessgroesseArt"];
            werte: components["schemas"]["MesswertRohPunkt"][];
        };
    };
    responses: {
        /** @description Ungültige Eingabe (Validierung fehlgeschlagen, z. B. `von >= bis`). PII-frei. */
        UngueltigeEingabe: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Kein/ungültiges/abgelaufenes Access-Token (AuthN, JwtAuthGuard). */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description AuthZ-Ablehnung (RBAC/ABAC, PolicyInterceptor) — Rolle fehlt oder (Route B) break-glass-Zweck fehlt/ungültig/Fenster überschritten. Wird auditiert. PII-frei, strukturierter Grund. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Ressource nicht gefunden (Standort bzw. Messkanal). */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Unerwarteter Fehler. PII-/stacktrace-frei (DS-10). */
        Unerwartet: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description Standort-ID (energy.standort.id, ADR-0010). */
        StandortIdPath: string;
        /** @description Messkanal-ID (energy.messkanal.id). */
        MesskanalIdPath: string;
        /** @description Intervall-Untergrenze (UTC, inklusive) — halboffenes Intervall `[von, bis)`. */
        VonParam: string;
        /** @description Intervall-Obergrenze (UTC, EXKLUSIVE) — halboffenes Intervall `[von, bis)`. */
        BisParam: string;
        /** @description Zeitauflösung der Aggregation (`time_bucket`, Apache-2-konform). */
        AufloesungParam: components["schemas"]["Aufloesung"];
        /** @description Subtree einbeziehen (`pfad @> ARRAY[standortId]`) — Default `true`. */
        InklusiveUnterknotenParam: boolean;
        /** @description Stichtag für die Zähler-Standort-Zuordnung (ADR-0010 D6) — Default `bis` (Zähler-Bestand "wie am Ende der Periode"). */
        StichtagParam: string;
        /** @description Break-glass-Zweck-Code (whitelisted, kein Freitext — z. B. `stoerungsdiagnose`, ADR-0008 §16/D4). PFLICHT für einen `permit`. */
        ZugriffszweckHeader: string;
        /** @description Zähler-Pseudonym-Referenz, an die sich der Zweck bindet (ADR-0008 §16/D4). */
        ZugriffszweckZaehlerIdHeader: string;
        /** @description Break-glass-Fenster-Untergrenze (UTC) — dient NUR der PDP-Fensterprüfung, unabhängig von `von`. */
        ZugriffszweckVonHeader: string;
        /** @description Break-glass-Fenster-Obergrenze (UTC) — `bis - von <= MAX_FENSTER_TAGE`. */
        ZugriffszweckBisHeader: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    verbrauchAggregatLesen: {
        parameters: {
            query: {
                /** @description Intervall-Untergrenze (UTC, inklusive) — halboffenes Intervall `[von, bis)`. */
                von: components["parameters"]["VonParam"];
                /** @description Intervall-Obergrenze (UTC, EXKLUSIVE) — halboffenes Intervall `[von, bis)`. */
                bis: components["parameters"]["BisParam"];
                /** @description Zeitauflösung der Aggregation (`time_bucket`, Apache-2-konform). */
                aufloesung: components["parameters"]["AufloesungParam"];
                /** @description Subtree einbeziehen (`pfad @> ARRAY[standortId]`) — Default `true`. */
                inklusiveUnterknoten?: components["parameters"]["InklusiveUnterknotenParam"];
                /** @description Stichtag für die Zähler-Standort-Zuordnung (ADR-0010 D6) — Default `bis` (Zähler-Bestand "wie am Ende der Periode"). */
                stichtag?: components["parameters"]["StichtagParam"];
            };
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aggregierte Verbrauchs-Zeitreihe + Metadaten. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerbrauchAggregatAntwort"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanalZeitreiheLesen: {
        parameters: {
            query: {
                /** @description Intervall-Untergrenze (UTC, inklusive) — halboffenes Intervall `[von, bis)`. */
                von: components["parameters"]["VonParam"];
                /** @description Intervall-Obergrenze (UTC, EXKLUSIVE) — halboffenes Intervall `[von, bis)`. */
                bis: components["parameters"]["BisParam"];
            };
            header?: {
                /** @description Break-glass-Zweck-Code (whitelisted, kein Freitext — z. B. `stoerungsdiagnose`, ADR-0008 §16/D4). PFLICHT für einen `permit`. */
                "X-Edms-Zugriffszweck"?: components["parameters"]["ZugriffszweckHeader"];
                /** @description Zähler-Pseudonym-Referenz, an die sich der Zweck bindet (ADR-0008 §16/D4). */
                "X-Edms-Zugriffszweck-Zaehler-Id"?: components["parameters"]["ZugriffszweckZaehlerIdHeader"];
                /** @description Break-glass-Fenster-Untergrenze (UTC) — dient NUR der PDP-Fensterprüfung, unabhängig von `von`. */
                "X-Edms-Zugriffszweck-Von"?: components["parameters"]["ZugriffszweckVonHeader"];
                /** @description Break-glass-Fenster-Obergrenze (UTC) — `bis - von <= MAX_FENSTER_TAGE`. */
                "X-Edms-Zugriffszweck-Bis"?: components["parameters"]["ZugriffszweckBisHeader"];
            };
            path: {
                /** @description Messkanal-ID (energy.messkanal.id). */
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Roh-Zeitreihe des Messkanals. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesswertZeitreiheAntwort"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
}
