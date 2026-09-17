/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/portal/auth/einloesen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zugangscode aus dem Brief einlösen und Passwort setzen
         * @description Der erste Schritt des Endkunden. Er gibt den Code aus dem Zugangsbrief ein und setzt dabei sein Passwort; danach ist er angemeldet — ein zweiter Anmeldeschritt unmittelbar danach wäre eine Hürde ohne Sicherheitsgewinn.
         *     Der Code darf mit oder ohne Trennstriche und in beliebiger Groß-/Kleinschreibung eingegeben werden. Er ist einmalig: nach dem Einlösen ist er verbraucht.
         *     Die Fehlermeldung bei einem falschen oder abgelaufenen Code ist bewusst dieselbe wie bei einem unbekannten — sonst wäre die Antwort eine Auskunft darüber, welche Codes es gibt.
         */
        post: operations["portalZugangEinloesen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/auth/anmeldung": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Anmeldung mit Kennung und Passwort
         * @description Der reguläre Weg nach dem ersten Einlösen.
         *     Nach mehreren Fehlversuchen wird der Zugang vorübergehend gesperrt. Die Antwort unterscheidet nicht zwischen „Kennung unbekannt", „Passwort falsch" und „noch kein Passwort gesetzt" — und braucht für eine unbekannte Kennung genauso lange wie für eine bekannte.
         */
        post: operations["portalAnmelden"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/auth/abmeldung": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Abmelden
         * @description Beendet die Sitzung und löscht das Cookie. Bewusst OHNE Sitzungspflicht: Eine abgelaufene oder bereits beendete Sitzung soll sich trotzdem abmelden können — sonst bliebe das Cookie im Browser stehen, weil der Server 401 antwortet. Der Vorgang ist idempotent.
         */
        post: operations["portalAbmelden"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/auth/ich": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Wer bin ich? — die Probe, dass die Sitzung trägt
         * @description Die Oberfläche prüft damit beim Start, ob eine Sitzung besteht. Sie bekommt bewusst wenig: Kennung und die interne Endkunden-Kennung, mit der sie NICHTS anfordert — der Server nimmt sie ausschließlich aus der Sitzung.
         */
        get: operations["portalIch"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/informationen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Der eigene Verlauf der Monatsinformationen
         * @description Die letzten 24 Monate, neueste zuerst — dieselben Datensätze, die der Betrieb sieht und aus denen der Papierbrief entsteht. Ein eigener Rechenweg im Portal wäre eine zweite Wahrheit, und die Stelle, an der sie abweicht, wäre ausgerechnet die Auskunft an die betroffene Person.
         */
        get: operations["portalInformationen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/informationen/{informationId}/bericht": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Eine Monatsinformation im Detail */
        get: operations["portalBericht"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/informationen/{informationId}/dokument": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Dieselbe Information als druckfertiges Dokument
         * @description Genau das Dokument, das auch per Post ginge — zum Ausdrucken oder Aufheben. Eigenständiges HTML ohne Skript und ohne externe Verweise.
         */
        get: operations["portalDokument"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/widerspruch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Steht ein Widerspruch gegen die monatliche Information? */
        get: operations["portalWiderspruchStand"];
        put?: never;
        /**
         * Der monatlichen Information widersprechen (Opt-out, TB-06)
         * @description Das digitale Opt-out, das Kap. 6 verlangt.
         *     **Ohne Body.** Der Zweck steht fest (`nutzerinformation` — der einzige, gegen den ein Endkunde widersprechen kann), und der Erklärungszeitpunkt ist jetzt. Hier trägt niemand etwas nach.
         *     Zeitpunkt, IP und User-Agent werden als Beleg festgehalten (DS-03). Die IP kommt aus der Verbindung, nicht aus dem Body: Eine vom Client gelieferte wäre kein Nachweis, sondern eine Behauptung.
         *     Ein zweiter Widerspruch, während schon einer wirksam ist, antwortet **409**.
         */
        post: operations["portalWidersprechen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/portal/widerspruch/ruecknahme": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Den Widerspruch zurücknehmen
         * @description Der Kunde will wieder informiert werden.
         *     Die Zeile bleibt erhalten; gelöscht verschwände der Nachweis über den Zeitraum, in dem widersprochen war — und genau der entscheidet, ob in dieser Zeit informiert werden durfte.
         *     Besteht kein wirksamer Widerspruch, antwortet der Vorgang **403** und nicht still mit Erfolg: Wer glaubt, etwas zurückzunehmen, das es nicht gibt, hat eine falsche Vorstellung vom Zustand.
         */
        post: operations["portalWiderspruchZuruecknehmen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/portal-zugang": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Betriebssicht auf den Portal-Zugang eines Endkunden
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb` und `compliance-auditor`.
         *     Ohne Code und ohne Hash. Es gibt bewusst keine Route, die einen ausgegebenen Code erneut liefert.
         *     Das Lesen bleibt auch bei einem gesperrten Endkunden erlaubt: Der Betrieb muss sehen können, dass es einen Zugang gibt, gerade wenn er ihn sperren will.
         */
        get: operations["portalZugangStand"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/portal-zugang/codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zugangscode ausgeben — der einzige Moment, in dem er im Klartext existiert
         * @description ABAC-Aktion `create:endkunde`. Rolle `betrieb`.
         *     Beim ersten Mal entsteht dabei der Zugang, danach ist es ein Ersatzbrief für denselben. Ein bestehendes Passwort bleibt stehen: Der neue Code ersetzt nur den alten Brief, er ist kein Passwort-Reset.
         *     **Die Antwort enthält den Code und den fertigen Brief genau einmal.** Wer sie verwirft, ohne zu drucken, gibt einen neuen Code aus; der alte wird dabei ungültig.
         *     Für einen gesperrten oder gelöschten Endkunden (Art. 18/17 DSGVO) antwortet der Vorgang **409** — einen neuen Zugriffsweg zu eröffnen wäre das Gegenteil einer Einschränkung. Aus einer Zugangs-Sperre führt ebenfalls kein neuer Code heraus.
         *     Audit `portal.zugang.ausgegeben`.
         */
        post: operations["portalZugangCodeAusgeben"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/portal-zugang/sperre": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zugang sperren und alle offenen Sitzungen beenden
         * @description ABAC-Aktion `update:endkunde`. Rolle `betrieb`.
         *     Beides gehört zusammen: Ein gesperrter Zugang, unter dem jemand angemeldet bleibt, ist eine Ankündigung, keine Maßnahme.
         *     Aus einer Sperre führt kein neuer Code heraus — sie ist bewusst kein Zustand, der sich von selbst auflöst.
         *     Audit `portal.abmeldung` mit `grund = gesperrt`.
         */
        post: operations["portalZugangSperren"];
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
        PortalEinloesenEingabe: {
            /** @description Der Code aus dem Brief — mit oder ohne Trennstriche, Groß-/Kleinschreibung egal. */
            code: string;
            /** @description Das Passwort, das der Kunde dabei setzt. Die Mindestlänge prüft der Server mit einer KONKRETEN Meldung — anders als beim Anmelden, wo jede Auskunft eine Auskunft zu viel wäre. */
            passwort: string;
        };
        PortalAnmeldungEingabe: {
            kennung: string;
            passwort: string;
        };
        PortalAnmeldungAntwort: {
            kennung: string;
            /**
             * Format: date-time
             * @description Wann die Sitzung endet. Das Token selbst steht NICHT im Body.
             */
            laeuftAbAt: string;
        };
        PortalIch: {
            kennung: string;
            /**
             * Format: uuid
             * @description Steht hier, damit die Oberfläche weiß, wessen Daten sie zeigt — NICHT, damit sie irgendwo als Parameter mitgegeben würde.
             */
            endkundeId: string;
        };
        PortalWiderspruchStand: {
            /** @description Immer `nutzerinformation`. */
            zweckCode: string;
            wirksam: boolean;
            /** Format: date-time */
            erklaertAt: string | null;
            /** Format: uuid */
            widerspruchId: string | null;
        };
        /**
         * @description `ausgegeben` = Code ausgegeben, noch nicht eingelöst. `aktiv` = eingelöst, Passwort gesetzt. `gesperrt` = vom Betrieb gesperrt; daraus führt kein neuer Code heraus.
         *
         *     Die drei Werte sind wörtlich der CHECK-Constraint `ck_portal_zugang_status` (V0066). Bis 2026-09-16 stand hier `offen` statt `ausgegeben` — ein Wert, den das Backend nie geliefert hat. Der generierte Client übernahm ihn, die Betriebssicht schlug den tatsächlich gelieferten Status in einer Tabelle nach, die ihn nicht kannte, und riss beim Übersetzen die gesamte Endkunden-Detailseite in die Fehlergrenze. Gefunden erst durch einen Browser-Test, der den Zugang wirklich ausgegeben hat.
         * @enum {string}
         */
        PortalZugangStatus: "ausgegeben" | "aktiv" | "gesperrt";
        PortalZugangStand: {
            /** Format: uuid */
            endkundeId: string;
            vorhanden: boolean;
            kennung: string | null;
            status: components["schemas"]["PortalZugangStatus"] | null;
            /** Format: date-time */
            codeOffenBis: string | null;
            passwortGesetzt: boolean;
            /**
             * Format: date-time
             * @description Vorübergehende Sperre nach zu vielen Fehlversuchen — nicht dasselbe wie `status = gesperrt`.
             */
            gesperrtBis: string | null;
        };
        PortalZugangAusgabe: {
            kennung: string;
            /** @description Klartext, gehört in den Brief. Wird NIRGENDS gespeichert und ist nicht erneut abrufbar. */
            code: string;
            /** Format: date-time */
            gueltigBis: string;
            /** @description `true` = Ersatzbrief für einen bestehenden Zugang. */
            erneut: boolean;
            /** @description Der druckfertige Zugangsbrief als eigenständiges HTML. Er kommt mit, weil ihn eine zweite Route nicht mehr erzeugen könnte — der Code steht nirgends. */
            brief: string;
            /** @description Die Adresse */
            portalUrl: string;
            /** @description `true` = `EDMS_PORTAL_URL` ist nicht gesetzt, im Brief steht die Dev-Adresse. */
            portalUrlIstStandard: boolean;
        };
        BerichtGruppe: {
            /** Format: uuid */
            geraetegruppeId: string;
            bezeichnung: string;
            verbrauchKwh: number;
            anteilPct: number;
        };
        /** @enum {string} */
        Zustellweg: "portal_bereitgestellt" | "email" | "brief" | "persoenlich";
        Nutzerinformation: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            energietraeger: string;
            /** Format: date */
            monat: string;
            /** Format: uuid */
            berechnungslaufId: string;
            referenzKwh: number;
            istKwh: number;
            /** @description Positiv = Einsparung, negativ = Mehrverbrauch. */
            deltaKwh: number;
            /** @enum {string} */
            qualitaetsStufe: "belastbar" | "eingeschraenkt" | "nicht_ausweisbar";
            abdeckungPct: number;
            tageFehlend: number;
            kandidatenAnzahl: number;
            inhaltHashHex: string;
            /** Format: date-time */
            erzeugtAt: string;
            /** Format: date-time */
            zugestelltAt: string | null;
            zustellweg: components["schemas"]["Zustellweg"] | null;
        };
        NutzerinfoBericht: {
            information: components["schemas"]["Nutzerinformation"];
            /** Format: date */
            vonTag: string;
            /** Format: date */
            bisTag: string;
            gruppen: components["schemas"]["BerichtGruppe"][];
            zugeordnetKwh: number;
            nichtZugeordnetKwh: number;
            ohneTageswerte: boolean;
            vormonatDeltaKwh: number | null;
            vormonatIstKwh: number | null;
        };
        /** @description RFC 9457. */
        ProblemDetails: {
            /** Format: uri */
            type?: string;
            title?: string;
            status?: number;
            detail?: string;
            /** Format: uri */
            instance?: string;
        };
    };
    responses: {
        /** @description Ungültige Eingabe. */
        UngueltigeEingabe: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
        /** @description Nicht angemeldet oder Sitzung abgelaufen. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
        /** @description Nicht berechtigt. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
        /** @description Nicht gefunden. */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
        /** @description Konflikt mit dem aktuellen Zustand. */
        Konflikt: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
        /** @description Unerwarteter Fehler. */
        Unerwartet: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["ProblemDetails"];
            };
        };
    };
    parameters: {
        /** @description Pflicht auf den schreibenden Betriebs-Routen (.claude/rules/api-contracts.md). */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    portalZugangEinloesen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PortalEinloesenEingabe"];
            };
        };
        responses: {
            /** @description Eingelöst und angemeldet. Das Sitzungs-Token steht AUSSCHLIESSLICH im `__Host-edms_portal`-Cookie, nicht im Body. */
            200: {
                headers: {
                    /** @description `__Host-edms_portal` — httpOnly, Secure, SameSite=Strict. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalAnmeldungAntwort"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalAnmelden: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PortalAnmeldungEingabe"];
            };
        };
        responses: {
            /** @description Angemeldet. */
            200: {
                headers: {
                    /** @description `__Host-edms_portal` — httpOnly, Secure, SameSite=Strict. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalAnmeldungAntwort"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalAbmelden: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Abgemeldet (auch dann, wenn es nichts zu beenden gab). */
            204: {
                headers: {
                    /** @description Löscht `__Host-edms_portal`. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            default: components["responses"]["Unerwartet"];
        };
    };
    portalIch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Angemeldet. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalIch"];
                };
            };
            401: components["responses"]["Unauthorized"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalInformationen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verlauf, neueste zuerst. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Nutzerinformation"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalBericht: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Der Bericht zu einem Monat. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzerinfoBericht"];
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Die Information gehört nicht zu diesem Zugang. Bewusst **403** und nicht 404: Der Unterschied wäre eine Auskunft darüber, welche Kennungen existieren. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            default: components["responses"]["Unerwartet"];
        };
    };
    portalDokument: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Druckfertiges HTML. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            /** @description Die Information gehört nicht zu diesem Zugang. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            default: components["responses"]["Unerwartet"];
        };
    };
    portalWiderspruchStand: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Der aktuelle Stand. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalWiderspruchStand"];
                };
            };
            401: components["responses"]["Unauthorized"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalWidersprechen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Widerspruch erklärt; der neue Stand. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalWiderspruchStand"];
                };
            };
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalWiderspruchZuruecknehmen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zurückgenommen; der neue Stand. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalWiderspruchStand"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalZugangStand: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Der Stand — auch dann, wenn noch kein Zugang besteht (`vorhanden: false`). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalZugangStand"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalZugangCodeAusgeben: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf den schreibenden Betriebs-Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ausgegeben — Code und Brief, einmalig. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalZugangAusgabe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    portalZugangSperren: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf den schreibenden Betriebs-Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Gesperrt; der neue Stand. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortalZugangStand"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
}
