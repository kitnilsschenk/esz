/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/geraeteerkennung/gruppen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Geräte-/Anlagengruppen eines Endkunden
         * @description ABAC-Aktion `read:geraeteerkennung`. Rollen `betrieb` und `compliance-auditor`.
         */
        get: operations["geraeteerkennungGruppenLesen"];
        put?: never;
        /**
         * Gruppe anlegen
         * @description ABAC-Aktion `create:geraetegruppe`. Rolle `betrieb`.
         *     Die Bezeichnung ist das, was der Endkunde später in seiner monatlichen Information liest ([Q3] Kap. 6: „getrennt nach jeweiligen Gruppen") — sie sollte allgemeinverständlich sein, „Beleuchtung" statt „Abgang 3".
         */
        post: operations["geraeteerkennungGruppeAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/geraeteerkennung/zuordnungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Zuordnungen eines Endkunden — einschliesslich beendeter
         * @description ABAC-Aktion `read:geraeteerkennung`. Rollen `betrieb` und `compliance-auditor`.
         *     Beendete Zuordnungen bleiben in der Liste. Sie sind der Nachweis der Zeit, in der die Zuordnung galt — und damit der Quote der Vergangenheit.
         */
        get: operations["geraeteerkennungZuordnungenLesen"];
        put?: never;
        /**
         * Messkanal einer Gruppe zuordnen
         * @description ABAC-Aktion `create:geraetegruppe_zuordnung`. Rolle `betrieb`. **Der Vorgang HEBT die Nachweisquote** und ist deshalb pflichtprotokolliert.
         *     `methode` und `genauigkeitPct` verlangt Kap. 5 ausdrücklich. Die Genauigkeit ist Pflicht, sobald **nicht** direkt gemessen wird: Bei einer Direktmessung ist sie die des Messgeräts und steht am Zähler, bei einer Schätzung ist sie eine eigene Aussage.
         *     `imGesamtverbrauchEnthalten` ist die Angabe, ohne die die Quote nicht rechenbar wäre: Misst der Kanal eine **Untermessung** (sein Verbrauch steckt schon in der Hauptmessung) oder einen eigenen Zähler daneben? Summierte man beides, zählte man denselben Strom zweimal.
         *     Ein Kanal kann zu einem Zeitpunkt nur zu **einer** Gruppe gehören — sonst ginge sein Verbrauch doppelt in den Zähler der Quote (**409**).
         *     Audit `geraetegruppe.zuordnung.angelegt` (Pflichtereignis).
         */
        post: operations["geraeteerkennungZuordnungAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/geraeteerkennung/zuordnungen/beenden": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zuordnung beenden
         * @description ABAC-Aktion `beenden:geraetegruppe_zuordnung`. Rolle `betrieb`. **Der Vorgang SENKT die Nachweisquote** — von den beiden Richtungen ist das die, die später erklärt werden muss. Der `grund` ist deshalb Pflicht.
         *     `POST .../beenden` statt `DELETE`: Es verschwindet nichts. Die Zeile bleibt mit ihrem Grund stehen, sonst wäre auch der Nachweis der Zeit weg, in der die Zuordnung galt.
         *     Eine bereits beendete Zuordnung wird nicht erneut beendet (**404**) — sonst verschöbe sich der Zeitpunkt, ab dem ihr Verbrauch nicht mehr zählt.
         *     Audit `geraetegruppe.zuordnung.beendet` (Pflichtereignis).
         */
        post: operations["geraeteerkennungZuordnungBeenden"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/geraeteerkennung/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Zuordnungsquote für ein Förderjahr
         * @description ABAC-Aktion `read:geraeteerkennung`. Rollen `betrieb` und `compliance-auditor` — die Quote ist der Nachweis, dass TB-05 erfüllt wird, und gehört damit zur Aufgabe des Auditors.
         *     Gerechnet wird auf `measurement.messwert_tag`, dem Tagesbestand, auf dem auch der BAFA-Nachweis rechnet. **Das hat eine Voraussetzung:** Die Verdichtung muss für den Zeitraum gelaufen sein. Liegen keine Tageswerte vor, ist `quotePct` **`null`** und `ohneTageswerte` `true` — die Quote ist dann nicht „0 %", sondern unbekannt. Eine 0 wäre hier die gefährlichere Antwort: Sie sieht aus wie ein Ergebnis.
         *     Die Zuordnung wird **tagesgenau** gewertet: Eine Zuordnung, die Mitte des Jahres beginnt, bringt nur die Tage ab ihrem Beginn in den Zähler. Würde der ganze Zeitraum gezählt, sobald sie ihn irgendwo überlappt, wäre die Quote systematisch zu hoch — in genau der Richtung, in der sie günstig aussieht.
         */
        get: operations["geraeteerkennungQuoteLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/geraeteerkennung/systeme/{systemId}/entbehrlich": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: string;
            };
            cookie?: never;
        };
        /**
         * Stand der Entbehrlichkeits-Feststellung eines Systems
         * @description ABAC-Aktion `read:geraeteerkennung`. Rollen `betrieb`, `compliance-auditor`.
         *     Ohne diese Route waere das Vermerken schreib-only: Die Betriebssicht koennte ein Haekchen setzen, aber nicht zeigen, ob schon eines gesetzt IST — und der naechste Bearbeiter uebersaehe eine bestehende Feststellung samt ihrer Begruendung.
         */
        get: operations["geraeteerkennungEntbehrlichLesen"];
        put?: never;
        /**
         * Geräteerkennung für dieses System als nicht sinnvoll vermerken
         * @description ABAC-Aktion `vermerken:geraeteerkennung_entbehrlich`. Rolle `betrieb`.
         *     [Q3] Kap. 5: „In Fällen, in denen eine Geräteerkennung nicht sinnvoll ist, beispielsweise bei Systemen, die nur ein Gerät umfassen, gelten die für Geräteerkennung genannten Anforderungen pauschal als erfüllt."
         *     **Der Vorgang mit dem grössten Missbrauchspotenzial dieses Moduls** — ein Häkchen, das eine Förderauflage für ein System als erfüllt erklärt. Deshalb eine eigene ABAC-Aktion, ein Pflicht-Audit-Ereignis und eine **Pflicht-Begründung**: „Pauschal erfüllt" ohne Begründung ist gegenüber der Bewilligungsbehörde keine Feststellung, sondern eine Behauptung.
         *     Der Vermerk verändert die berechnete Quote **nicht**. Er wird ihr danebengestellt; die Würdigung trifft ein Mensch.
         *     Audit `system.geraeteerkennung.entbehrlich_vermerkt` (Pflichtereignis).
         */
        post: operations["geraeteerkennungEntbehrlichVermerken"];
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
        /**
         * @description [Q3] Kap. 5, wörtlich: „ob es sich um eine Direktmessung, eine Algorithmen-Erkennung, ein Vorschaltgerät oder eine sonstige Erhebungsmethode handelt". Eine gemessene Zuordnung ist etwas anderes als eine geschätzte — und der Unterschied ist genau das, was die Bewilligungsbehörde wissen will.
         * @enum {string}
         */
        Erkennungsmethode: "direktmessung" | "algorithmus" | "vorschaltgeraet" | "sonstige";
        Geraetegruppe: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            bezeichnung: string;
            beschreibung: string | null;
        };
        GeraetegruppeAnlegen: {
            /** Format: uuid */
            endkundeId: string;
            bezeichnung: string;
            beschreibung?: string;
        };
        Zuordnung: {
            /** Format: uuid */
            geraetegruppeId: string;
            geraetegruppeBezeichnung: string;
            /** Format: uuid */
            messkanalId: string;
            methode: components["schemas"]["Erkennungsmethode"];
            /** @description Erwartete Genauigkeit. `null` nur bei Direktmessung — dort ist sie die des Messgeräts. */
            genauigkeitPct: number | null;
            /** @description Anteil des Kanalverbrauchs, der dieser Gruppe zuzurechnen ist. Bei Direktmessung 100. */
            anteilProzent: number;
            /**
             * @description `true` = Untermessung; der Verbrauch steckt bereits in der Hauptmessung und wird im NENNER der Quote nicht zusätzlich gezählt. `false` = eigene Messstelle (zählt in Zähler UND Nenner).
             *     ABGELEITET aus `energy.messkanal.ist_untermessung` (V0058) — die Topologie ist eine Eigenschaft der Messstelle, nicht der Zuordnung. Beim Anlegen wird sie deshalb nicht entgegengenommen.
             */
            imGesamtverbrauchEnthalten: boolean;
            /** Format: date */
            gueltigVon: string;
            /** Format: date */
            gueltigBis: string | null;
            beendetGrund: string | null;
            /** @description Abgeleitet aus `gueltigBis === null`. */
            wirksam: boolean;
        };
        ZuordnungAnlegen: {
            /** Format: uuid */
            geraetegruppeId: string;
            /** Format: uuid */
            messkanalId: string;
            methode: components["schemas"]["Erkennungsmethode"];
            /** @description Pflicht, sobald `methode` nicht `direktmessung` ist. */
            genauigkeitPct?: number;
            /** @default 100 */
            anteilProzent: number;
            /** Format: date */
            gueltigVon: string;
        };
        ZuordnungBeenden: {
            /** Format: uuid */
            geraetegruppeId: string;
            /** Format: uuid */
            messkanalId: string;
            /** Format: date */
            gueltigBis: string;
            /** @description Pflicht — der Vorgang senkt die Nachweisquote und muss erklärt werden. */
            grund: string;
        };
        Entbehrlichkeit: {
            /** Format: uuid */
            systemId: string;
            entbehrlich: boolean;
            /** @description Pflicht-Begruendung, `null` solange nichts vermerkt ist. */
            grund: string | null;
        };
        EntbehrlichVermerken: {
            entbehrlich: boolean;
            /** @description Pflicht, sobald `entbehrlich` gesetzt wird. */
            grund?: string;
        };
        GruppenAnteil: {
            /** Format: uuid */
            geraetegruppeId: string;
            bezeichnung: string;
            zugeordnetKwh: number;
            anteilPct: number;
        };
        ZuordnungsQuote: {
            foerderjahrCode: string;
            /** @description Projektjahr — bestimmt die Sollquote. */
            foerderjahrNummer: number;
            /** Format: date */
            vonMonat: string;
            /** Format: date */
            bisMonat: string;
            /** Format: uuid */
            endkundeId: string;
            energietraeger: string;
            gesamtKwh: number;
            zugeordnetKwh: number;
            /** @description `null`, wenn kein Verbrauch vorliegt — 0 % wäre dann eine Behauptung. */
            quotePct: number | null;
            /** @description 20 / 25 / 30 / 35 / 40 nach Projektjahr. **Nicht kumulativ** ([Q3] Kap. 5). */
            sollQuotePct: number;
            erreicht: boolean | null;
            /** @description Aufteilung je Gruppe — die Angabe, die Kap. 6 für die Nutzerinformation verlangt. */
            gruppen: components["schemas"]["GruppenAnteil"][];
            systemeGesamt: number;
            systemeEntbehrlich: number;
            /** @description `true`, wenn ALLE Systeme als entbehrlich vermerkt sind. Nimmt die Würdigung niemandem ab — zeigt ihm nur die Tatsache. */
            alleSystemeEntbehrlich: boolean;
            /** @description `true`, wenn für den Zeitraum keine Tageswerte vorliegen. Meist, weil die Verdichtung noch nicht gelaufen ist. */
            ohneTageswerte: boolean;
        };
        /** @description RFC 9457. */
        ProblemDetails: {
            type?: string;
            title?: string;
            status?: number;
            detail?: string;
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
        /** @description Nicht authentifiziert. */
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
        /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    geraeteerkennungGruppenLesen: {
        parameters: {
            query: {
                endkundeId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Die Gruppen, alphabetisch. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Geraetegruppe"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungGruppeAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeraetegruppeAnlegen"];
            };
        };
        responses: {
            /** @description Angelegt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Geraetegruppe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungZuordnungenLesen: {
        parameters: {
            query: {
                endkundeId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zuordnungen, je Gruppe neueste zuerst. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Zuordnung"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungZuordnungAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZuordnungAnlegen"];
            };
        };
        responses: {
            /** @description Zugeordnet. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Zuordnung"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungZuordnungBeenden: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZuordnungBeenden"];
            };
        };
        responses: {
            /** @description Beendet; ausgegeben wird die Zuordnung mit gesetztem `gueltigBis`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Zuordnung"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungQuoteLesen: {
        parameters: {
            query: {
                endkundeId: string;
                energietraeger: string;
                /** @description Die Sollquote hängt am Projektjahr — es steht im Förderjahr. */
                foerderjahrId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Die Quote. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZuordnungsQuote"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungEntbehrlichLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aktueller Stand. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entbehrlichkeit"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraeteerkennungEntbehrlichVermerken: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                systemId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EntbehrlichVermerken"];
            };
        };
        responses: {
            /** @description Vermerkt. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
}
