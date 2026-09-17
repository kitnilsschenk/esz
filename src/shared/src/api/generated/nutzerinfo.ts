/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/nutzerinfo/informationen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Verlauf der monatlichen Informationen eines Endkunden
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb` und `compliance-auditor` — für den Auditor ist es der Nachweis, dass die Auflage erfüllt wird.
         *     Neueste zuerst. Die Antwort trägt `zugestelltAt`: Eine Information ohne Zustellzeitpunkt ist erzeugt, aber nicht zugestellt — und damit ist die Auflage für diesen Monat nicht erfüllt.
         */
        get: operations["nutzerinfoInformationenLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ist der Monat durch?
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb` und `compliance-auditor`.
         *     Ohne `monat` antwortet der Server für den letzten **abgeschlossenen** Monat und sagt in der Antwort, welcher das war. Welcher Monat gerade zählt, hängt an der Zeitzone und soll nicht in jeder Oberfläche neu ausgerechnet werden — eine Zahl ohne ihren Monat ist keine Auskunft.
         *     `anzahlOffen` ist die Zahl, auf die es ankommt: erzeugt, aber nicht zugestellt. Für diese Endkunden ist die Auflage in diesem Monat nicht erfüllt.
         *     **Nicht enthalten** ist die Zahl der Endkunden ohne Berechnungsgrundlage. Die kennt nur ein Lauf, weil sie aus dem Vergleich mit den vorhandenen Berechnungsläufen entsteht — sie hier zu schätzen hiesse, eine zweite, möglicherweise abweichende Wahrheit zu erzeugen.
         */
        get: operations["nutzerinfoStatusLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/informationen/{informationId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        /**
         * Eine einzelne monatliche Information
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb` und `compliance-auditor`.
         */
        get: operations["nutzerinfoInformationLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/laeufe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Erzeugungslauf für einen abgeschlossenen Monat
         * @description ABAC-Aktion `create:nutzerinfo_lauf`. Rolle `betrieb`.
         *     **Ohne `ausfuehren: true` ein Probelauf** — er zählt, schreibt aber nichts. Dieselbe Linie wie beim Retention- und Migrations-Runner.
         *     **Die interessante Zahl ist `ohneBerechnung`.** Für diese Kunden gibt es keinen eindeutig bindbaren Berechnungslauf; sie können nicht informiert werden, obwohl sie es müssten. Das ist die Zahl, die eine Auflagenverletzung sichtbar macht — im Unterschied zu `uebersprungenWiderspruch` (Opt-out, zulässig) und `uebersprungenGesperrt` (Art. 18, zulässig).
         *     Ein **laufender oder künftiger Monat** wird mit 400 abgelehnt: Er ist nicht abgeschlossen, ergäbe einen zu niedrigen Verbrauch, und nach der Zustellung wird nicht mehr korrigiert.
         *     Die Zahlen werden **nicht neu gerechnet**. Sie kommen aus dem Berechnungslauf, den auch der BAFA-Nachweis binden würde (jüngster, selbst nicht ersetzter Lauf, dessen Periode den Monat enthält). Widersprüchliche Kandidaten werden **nicht** aufgelöst — der Kunde bekommt dann nichts, statt einer willkürlich gewählten Zahl.
         *     Audit `nutzerinfo.information.erzeugt` (Aggregat je Lauf).
         */
        post: operations["nutzerinfoLaufAusfuehren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/informationen/{informationId}/bericht": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        /**
         * Der Bericht, den der Endkunde zu sehen bekommt
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb`, `compliance-auditor`.
         *     Rechnet die Einsparung NICHT neu — sie kommt unveraendert aus der eingefrorenen Zeile. Ergaenzt wird, was [Q3] Kap. 6 darueber hinaus verlangt: die Verbraeuche der erkannten Geraetegruppen, getrennt nach Gruppen, gebildet aus den Zuordnungen, die IM BERICHTSMONAT galten.
         */
        get: operations["nutzerinfoBerichtLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/informationen/{informationId}/zustellung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zustellung vermerken (Versand-/Bereitstellungsnachweis, TB-06)
         * @description ABAC-Aktion `zustellen:nutzerinfo`. Rolle `betrieb`.
         *     Der Nachweis, den TB-06 ausdrücklich verlangt. Eigene Aktion und nicht `create:*`: Der Erzeugungslauf leitet ab, die Zustellung erfüllt die Auflage — wer erzeugen darf, muss nicht zustellen dürfen.
         *     `POST .../zustellung` und nicht `PATCH` auf die Information: Es ist ein Vorgang, kein Feld.
         *     `zugestelltAt` ist Pflicht und kein `now()` — der Regelfall ist das Nachtragen eines Vorgangs, der ausserhalb des Systems stattgefunden hat (Brief, Übergabe). Ein Zeitpunkt in der Zukunft wird abgelehnt.
         *     Eine zweite Zustellung antwortet **409** und lässt den ersten Zeitpunkt stehen: Er belegt, dass die Auflage in DIESEM Monat erfüllt wurde.
         *     Audit `nutzerinfo.information.zugestellt` (Pflichtereignis, je Information).
         */
        post: operations["nutzerinfoZustellungVermerken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/informationen/{informationId}/dokument": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        /**
         * Das druckfertige Kundendokument zu EINER Information
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb`, `compliance-auditor`.
         *     Der Gegenstand, den der Endkunde erreicht — bis es ein Nutzerportal gibt, ist das der Weg, mit dem die Auflage aus [Q3] Kap. 6 tatsaechlich erfuellbar ist.
         *     `text/html` und nicht PDF: Ein PDF-Erzeuger waere eine neue Produktivabhaengigkeit (freigabepflichtig, `.claude/rules/dependencies.md`) fuer etwas, das der Browser mit „Drucken -> Als PDF sichern" ohnehin leistet. Das Dokument ist vollstaendig eigenstaendig: kein Skript, kein Bild, keine externe Schrift, kein Netzzugriff beim Oeffnen.
         *     Es rechnet nichts neu und ist deterministisch — gleiche Eingabe, gleiches Ergebnis (Muster V0054: kein Byte-Archiv, sondern Re-Rendering plus Hash-Vergleich).
         *     Der DWD-Quellenvermerk erscheint NUR, wenn in den zugrunde liegenden Berechnungslauf tatsaechlich DWD-Klimadaten eingegangen sind (Auflage A-2/A20, `docs/datenquellen.md` DQ-001) — bei synthetischem Klima waere er eine Falschangabe.
         */
        get: operations["nutzerinfoDokumentLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/dokumente": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Die Versandmappe eines Monats (eine Information je Seite)
         * @description ABAC-Aktion `read:nutzerinfo`. Rollen `betrieb`, `compliance-auditor`.
         *     Eigene Route, weil Postversand ein Stapelvorgang ist: einmal drucken, einmal kuvertieren, einmal einliefern. Tausend Einzeldateien nacheinander zu oeffnen ist kein Arbeitsablauf — und ohne praktikablen Ablauf bleibt die Auflage unerfuellt.
         *     Enthaelt bewusst ALLE Informationen des Monats, nicht nur die unzugestellten: die Mappe ist auch der Beleg, was hinausgegangen ist. Ein Monat ohne erzeugte Informationen antwortet **400** statt einer leeren Mappe.
         */
        get: operations["nutzerinfoMonatsmappeLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nutzerinfo/zustellungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zustellung fuer einen ganzen Monat vermerken
         * @description ABAC-Aktion `zustellen:nutzerinfo`. Rolle `betrieb`.
         *     Derselbe Vorgang wie einzeln, nur ueber den Stapel. Muesste der Betrieb nach einem Postversand jede Information einzeln anklicken, bliebe der Nachweis in der Praxis unvollstaendig — und ein unvollstaendiger Versandnachweis ist gegenueber der Bewilligungsbehoerde dasselbe wie kein Versand.
         *     Bereits zugestellte Informationen bleiben UNBERUEHRT (ihr erster Zeitpunkt ist der Nachweis) und werden in `anzahlBereitsZugestellt` gezaehlt — kein Fehler, sondern der Normalfall bei einem Nachzuegler.
         *     Audit `nutzerinfo.information.zugestellt` **je Information**, nicht eines fuer den Stapel: Die Frage lautet spaeter immer „wurde DIESER Kunde informiert?".
         */
        post: operations["nutzerinfoSammelZustellungVermerken"];
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
         * @description Wie die Information den Endkunden erreicht hat. **Heute existiert keiner dieser Wege im System** — die Liste beschreibt, was vorgesehen ist. Ein Nachweis ohne Angabe des Weges ist keine Aussage: „informiert" ist etwas anderes als „bereitgestellt".
         * @enum {string}
         */
        Zustellweg: "portal_bereitgestellt" | "email" | "brief" | "persoenlich";
        BerichtGruppe: {
            /** Format: uuid */
            geraetegruppeId: string;
            bezeichnung: string;
            verbrauchKwh: number;
            /** @description Anteil am ERFASSTEN Gesamtverbrauch des Monats — nicht am zugeordneten. */
            anteilPct: number;
        };
        NutzerinfoBericht: {
            information: components["schemas"]["Nutzerinformation"];
            /** Format: date */
            vonTag: string;
            /** Format: date */
            bisTag: string;
            /** @description Leer, wenn keine Zuordnung bestand — eine erfundene Aufteilung waere schlimmer als keine. */
            gruppen: components["schemas"]["BerichtGruppe"][];
            zugeordnetKwh: number;
            nichtZugeordnetKwh: number;
            /** @description `true` = keine Tageswerte im Monat; die Aufteilung ist dann unbekannt, nicht 0. */
            ohneTageswerte: boolean;
            /** @description Die Differenz, die der Kunde im Vormonat TATSAECHLICH gelesen hat. */
            vormonatDeltaKwh: number | null;
            vormonatIstKwh: number | null;
        };
        Nutzerinformation: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            energietraeger: string;
            /**
             * Format: date
             * @description Monatserster.
             */
            monat: string;
            /**
             * Format: uuid
             * @description Welche Rechnung der Kunde gesehen hat. Ohne dieses Feld wäre die Information eine Zahl ohne Herkunft — und der Unterschied zum BAFA-Nachweis nicht aufklärbar.
             */
            berechnungslaufId: string;
            /** @description Was nach Baseline zu erwarten war (R_m). */
            referenzKwh: number;
            /** @description Was tatsächlich verbraucht wurde (A_m). */
            istKwh: number;
            /** @description `referenzKwh - istKwh`. **Positiv = Einsparung, negativ = Mehrverbrauch.** Bewusst OHNE die Vorzeichen-/Lückenregel des BAFA-Nachweises: Kap. 6 verlangt die Angabe von Einsparungen UND Mehrverbräuchen; einen Mehrverbrauch auf null zu setzen wäre eine Beschönigung. */
            deltaKwh: number;
            /** @enum {string} */
            qualitaetsStufe: "belastbar" | "eingeschraenkt" | "nicht_ausweisbar";
            abdeckungPct: number;
            /** @description Gehört in die Kundeninformation, weil Kap. 6 „nachvollziehbar" verlangt: Eine Einsparung aus einem Monat mit acht fehlenden Tagen ist eine andere Aussage als eine aus einem vollständigen. */
            tageFehlend: number;
            /** @description >1 = mehrdeutige, aber wertgleiche Läufe. */
            kandidatenAnzahl: number;
            /** @description SHA-256 des kanonisierten Inhalts. Beantwortet - Stand das damals wirklich so drin? */
            inhaltHashHex: string;
            /** Format: date-time */
            erzeugtAt: string;
            /**
             * Format: date-time
             * @description Versand-/Bereitstellungsnachweis. **`null` heisst: die Auflage ist für diesen Monat nicht erfüllt.**
             */
            zugestelltAt: string | null;
            zustellweg: components["schemas"]["Zustellweg"] | null;
        };
        NutzerinfoMonatsstand: {
            /**
             * Format: date
             * @description Der ausgewertete Monat — steht in der Antwort, weil der Server ihn bei fehlender Angabe selbst bestimmt.
             */
            monat: string;
            anzahlErzeugt: number;
            anzahlZugestellt: number;
            /** @description Erzeugt, aber nicht zugestellt. Für diese Endkunden ist die Auflage offen. */
            anzahlOffen: number;
        };
        NutzerinfoLauf: {
            /** @description Monatserster eines ABGESCHLOSSENEN Monats. */
            monat: string;
            /** @description Fehlt es oder ist es `false`, läuft der Lauf als Probelauf. */
            ausfuehren?: boolean;
        };
        NutzerinfoLaufErgebnis: {
            /** @enum {string} */
            modus: "probelauf" | "ausfuehrung";
            /** Format: date */
            monat: string;
            anzahlPaare: number;
            anzahlErzeugt: number;
            /** @description Opt-out nach TB-06 — zulässig, sogar gefordert. */
            uebersprungenWiderspruch: number;
            /** @description Verarbeitung nach Art. 18 DSGVO eingeschränkt — zulässig. */
            uebersprungenGesperrt: number;
            /** @description **Ein Befund.** Kein eindeutig bindbarer Berechnungslauf — der Kunde kann nicht informiert werden, obwohl er es müsste. */
            ohneBerechnung: number;
        };
        NutzerinfoZustellung: {
            zustellweg: components["schemas"]["Zustellweg"];
            /** Format: date-time */
            zugestelltAt: string;
        };
        NutzerinfoSammelZustellung: {
            monat: string;
            zustellweg: components["schemas"]["Zustellweg"];
            /** Format: date-time */
            zugestelltAt: string;
        };
        NutzerinfoSammelZustellungErgebnis: {
            monat: string;
            zustellweg: components["schemas"]["Zustellweg"];
            /** Format: date-time */
            zugestelltAt: string;
            /** @description Informationen des Monats insgesamt. */
            anzahlGesamt: number;
            /** @description In DIESEM Vorgang neu vermerkt. */
            anzahlVermerkt: number;
            /** @description Bereits vorher zugestellt und deshalb uebergangen. Kein Fehlerzaehler — der erste Zeitpunkt bleibt der Nachweis. */
            anzahlBereitsZugestellt: number;
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
    nutzerinfoInformationenLesen: {
        parameters: {
            query: {
                endkundeId: string;
                /** @description Wie viele Monate zurück. Default 24 — zwei Jahre sind die übliche Kundensicht. */
                limit?: number;
            };
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
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoStatusLesen: {
        parameters: {
            query?: {
                /** @description Monatserster. Fehlt er, wird der letzte abgeschlossene Monat ausgewertet. */
                monat?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stand des Monats. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzerinfoMonatsstand"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoInformationLesen: {
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
            /** @description Die Information. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Nutzerinformation"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoLaufAusfuehren: {
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
                "application/json": components["schemas"]["NutzerinfoLauf"];
            };
        };
        responses: {
            /** @description Lauf ausgeführt bzw. Probelauf gezählt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzerinfoLaufErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoBerichtLesen: {
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
            /** @description Der Bericht. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzerinfoBericht"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoZustellungVermerken: {
        parameters: {
            query?: never;
            header: {
                /** @description Pflicht auf allen schreibenden Routen (.claude/rules/api-contracts.md). */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                informationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NutzerinfoZustellung"];
            };
        };
        responses: {
            /** @description Vermerkt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Nutzerinformation"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoDokumentLesen: {
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
            /** @description Das Dokument. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoMonatsmappeLesen: {
        parameters: {
            query: {
                /** @description Monatserster, `YYYY-MM-01`. */
                monat: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Die Mappe. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzerinfoSammelZustellungVermerken: {
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
                "application/json": components["schemas"]["NutzerinfoSammelZustellung"];
            };
        };
        responses: {
            /** @description Vermerkt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzerinfoSammelZustellungErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
}
