/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/consent/zwecke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Zweck-Katalog auflisten
         * @description ABAC-Aktion `read:consent`, Rollen `betrieb`/`compliance-auditor`.
         *     Geschlossene Liste. **Je Zweck eine eigene Einwilligung** — damit ist das Kopplungsverbot (Art. 7 Abs. 4 DSGVO, DS-03) strukturell eingehalten: Es gibt technisch keine Möglichkeit, mehrere Zwecke mit einem Häkchen zu erteilen.
         *     `verweigerbar` hält fest, ob die Verweigerung die Leistung kostet. Es steuert nichts — es zwingt dazu, die Kopplungsfrage je Zweck beantwortet zu halten.
         */
        get: operations["consentZweckeListe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consent/texte": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Erklärungsfassungen auflisten (DS-04)
         * @description ABAC-Aktion `read:consent`, Rollen `betrieb`/`compliance-auditor`. Optional auf einen Zweck eingegrenzt; neueste Fassung zuerst.
         *     Fassungen sind **unveränderlich** (`REVOKE UPDATE, DELETE` auf der Tabelle). `wortlautSha256` macht eine dennoch erfolgte Textänderung sichtbar — ohne ihn zeigten alle erteilten Einwilligungen stillschweigend auf den neuen Wortlaut.
         */
        get: operations["consentTexteListe"];
        put?: never;
        /**
         * Neue Erklärungsfassung veröffentlichen
         * @description ABAC-Aktion `create:consent_text`. Rolle `betrieb` — NICHT `compliance-auditor` (DS-01, strikt lesend).
         *     Schließt die bisher offene Fassung desselben Zwecks GENAU an diesem Zeitpunkt: zwei Zeitscheiben ohne Lücke und ohne Überlappung. Zu keinem Zeitpunkt gelten zwei Fassungen desselben Zwecks — sonst hinge von der Zeilenreihenfolge ab, welcher Wortlaut einer Erteilung zugrunde liegt.
         *     Der SHA-256 wird **serverseitig** aus dem Wortlaut gebildet und nicht entgegengenommen: Ein mitgelieferter Hash wäre eine Behauptung über den Text statt einer Prüfung desselben.
         *     Audit `einwilligung.consent.text_veroeffentlicht`.
         */
        post: operations["consentTextVeroeffentlichen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consent/einwilligungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Consent-Stand eines Subjekts über alle Zwecke
         * @description ABAC-Aktion `read:consent`, Rollen `betrieb`/`compliance-auditor` — der Auditor MUSS den Stand sehen können, das ist Teil seiner Aufgabe (Art. 7 Abs. 1: Nachweisbarkeit).
         *     Enthält **auch Zwecke ohne Einwilligung** (`wirksameEinwilligung: null`, leerer Verlauf). Nur so ist „hierzu wurde nie eingewilligt" von „hierzu gibt es keinen Zweck" unterscheidbar — eine Liste, die nur Erteiltes zeigt, beantwortet die Frage nach dem Nicht-Erteilten nicht. Genau das verlangt eine Auskunft nach Art. 15 DSGVO.
         *     Der `verlauf` führt auch widerrufene Einwilligungen: Sie sind der Nachweis, dass die Verarbeitung rechtmäßig war, solange sie galten.
         *     PII-frei: Kennungen, Codes, Zeitpunkte. IP und User-Agent stehen feldverschlüsselt im Beleg und werden hier NICHT ausgegeben.
         */
        get: operations["consentStandLesen"];
        put?: never;
        /**
         * Einwilligung erfassen (nicht digital — s. Beschreibung)
         * @description ABAC-Aktion `create:einwilligung`. Rolle `betrieb`.
         *     **`erfassungsweg: digital_opt_in` wird mit 400 abgewiesen.** In der Betriebssicht handelt nicht die betroffene Person, sondern ein Mitarbeiter, der eine anderswo erteilte Einwilligung nachträgt. Die einzige hier verfügbare IP ist seine — sie als IP der betroffenen Person zu protokollieren wäre eine Fälschung des Nachweises. Zulässig sind `vertrag_schriftlich` und `uebernahme_altbestand`.
         *     Die zum Erteilungszeitpunkt gültige Erklärungsfassung wird serverseitig ermittelt und festgeschrieben. Ist zu diesem Zweck keine Fassung veröffentlicht, wird mit 400 abgewiesen — man kann nicht einer Erklärung zustimmen, die es nicht gibt.
         *     Fachzeile und Beleg entstehen in DERSELBEN Transaktion; der Beleg wird mit dem Schlüssel der betroffenen Person verschlüsselt, damit ein Krypto-Shred (ADR-0009) ihn erfasst.
         *     `rechtsgrundlage` hat **keinen Vorgabewert** (DS-02): ADR-0012 O1 — ob die Kernverarbeitung auf Einwilligung oder Vertragserfüllung gestützt wird — ist eine offene Rechtsfrage.
         *     Audit `einwilligung.consent.erteilt` (Pflichtereignis).
         */
        post: operations["consentEinwilligungErteilen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consent/einwilligungen/{einwilligungId}/widerruf": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                einwilligungId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Einwilligung widerrufen (Art. 7 Abs. 3 DSGVO)
         * @description ABAC-Aktion `widerrufen:einwilligung`. Rolle `betrieb`.
         *     Beendet die Wirkung AB diesem Zeitpunkt und **löscht nichts**. Die bis dahin erfolgte Verarbeitung bleibt rechtmäßig (Art. 7 Abs. 3 S. 2) — Fachzeile und Beleg bleiben stehen, sonst wäre auch der Nachweis der rechtmäßigen Vergangenheit vernichtet.
         *     `POST .../widerruf` statt `DELETE`, weil nichts verschwindet.
         *     Ein zweiter Widerruf antwortet **409** und überschreibt den ursprünglichen Zeitpunkt NICHT: Sonst verschöbe sich die Aussage, ab wann die Verarbeitung ohne Grundlage lief.
         *     Wer nach einem Widerruf erneut einwilligt, erzeugt eine NEUE Einwilligung mit der dann gültigen Fassung.
         *     Audit `einwilligung.consent.widerrufen` (Pflichtereignis).
         */
        post: operations["consentEinwilligungWiderrufen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consent/widersprueche": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Widersprüche einer Person
         * @description ABAC-Aktion `read:consent`. Rollen `betrieb` und `compliance-auditor`.
         *     Getrennt vom Consent-Stand und bewusst nicht in ihn eingebettet: Ein Widerspruch ist kein Zustand einer Einwilligung, sondern eine eigene Erklärung zu einer Verarbeitung, die es auch **ohne** Zustimmung gibt. Wer beides in eine Liste legt, lädt dazu ein, sie zu verwechseln.
         *     Vollständiger Verlauf, neueste zuerst — auch zurückgenommene. Der Zeitraum, in dem widersprochen war, entscheidet, ob eine Verarbeitung in dieser Zeit zulässig war.
         */
        get: operations["consentWiderspruecheLesen"];
        put?: never;
        /**
         * Widerspruch bzw. Abwahl erfassen (AW-27)
         * @description ABAC-Aktion `create:widerspruch`. Rolle `betrieb`.
         *     Das Gegenstück zur Einwilligung — für die andere Hälfte der Rechtsgrundlagen-Matrix. Wo eine Verarbeitung `opt_out` oder `vertraglich` läuft, gibt es nichts zu widerrufen; dort erklärt die betroffene Person einen Widerspruch bzw. wählt die Leistung ab.
         *     Gegen einen **Opt-in**-Zweck ist das nicht möglich (**400**) — dagegen widerruft man die Einwilligung (Art. 7 Abs. 3). Die Datenbank hält dieselbe Grenze über einen zusammengesetzten Fremdschlüssel auf die Matrix.
         *     `erlaubnismodus` steht NICHT im Body: Er wird serverseitig aus `consent.zweck_subjekt` bestimmt. Ob eine Verarbeitung geschuldet ist oder auf einer Einwilligung beruht, entscheidet nicht, wer das Formular ausfüllt.
         *     Für `zweckCode = wiss_auswertung` setzt der Vorgang zugleich das DE-04-Ausnahme-Attribut am Subjekt. Die Durchsetzungsstelle bleibt das Attribut — aber es folgt ab jetzt der Erklärung und wird **nicht mehr von Hand gesetzt**; der entsprechende Weg über die Stammdaten-API antwortet seit AW-27 mit 400.
         *     Ein zweiter wirksamer Widerspruch zum selben Zweck antwortet **409**.
         *     Audit `widerspruch.consent.erklaert` (Pflichtereignis).
         */
        post: operations["consentWiderspruchErklaeren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/consent/widersprueche/{widerspruchId}/ruecknahme": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                widerspruchId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Widerspruch zurücknehmen
         * @description ABAC-Aktion `zuruecknehmen:widerspruch`. Rolle `betrieb`.
         *     Eigener Vorgang mit eigenem Zeitpunkt und eigenem Beleg — nicht das Löschen des ersten. `POST .../ruecknahme` statt `DELETE`, weil nichts verschwindet: Würde die Erklärung gelöscht, verschwände auch der Nachweis über den Zeitraum, in dem widersprochen war.
         *     Die Rücknahme lässt eine Verarbeitung **wieder anlaufen** und setzt bei `wiss_auswertung` ein Bestandsmerkmal zurück. Sie ist deshalb ebenso protokollpflichtig wie die Erklärung — von beiden Richtungen ist die zurücknehmende die gefährlichere.
         *     Eine zweite Rücknahme antwortet **409** und überschreibt den ursprünglichen Zeitpunkt NICHT.
         *     Audit `widerspruch.consent.zurueckgenommen` (Pflichtereignis).
         */
        post: operations["consentWiderspruchZuruecknehmen"];
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
        /**
         * @description Wer einwilligt. Es ist immer die BETROFFENE Person — im Mietfall der Anschlussnutzer, nicht der Endkunde (DS-07).
         * @enum {string}
         */
        SubjektTyp: "endkunde" | "anschlussnutzer";
        /**
         * @description KEIN Vorgabewert (DS-02). ADR-0012 O1 ist offen: Ob die Kernverarbeitung auf Einwilligung (Art. 6 Abs. 1 lit. a) oder auf Vertragserfüllung (lit. b) gestützt wird, ist eine Rechtsfrage mit erheblicher Folge — eine widerrufbare Einwilligung als Grundlage der Kernverarbeitung ist etwas anderes als ein Vertrag.
         * @enum {string}
         */
        Rechtsgrundlage: "einwilligung_art6_1a" | "vertrag_art6_1b";
        /**
         * @description `digital_opt_in` ist über DIESE API nicht erfassbar (400) — s. `POST /consent/einwilligungen`. Der Wert existiert für das spätere Nutzerportal, in dem die betroffene Person selbst handelt.
         * @enum {string}
         */
        Erfassungsweg: "digital_opt_in" | "vertrag_schriftlich" | "uebernahme_altbestand";
        Zweck: {
            code: string;
            bezeichnung: string;
            beschreibung: string;
        };
        /**
         * @description Wie die Erlaubnis zustande kommt (A12-6). `opt_in` = es braucht eine ausdrückliche Erklärung; `opt_out` = die Leistung läuft, bis widersprochen wird (TB-06); `vertraglich` = geschuldet, es gibt nichts zu erklären und nichts zu widerrufen. Ein Widerspruch nach Art. 21 ist etwas anderes als ein Widerruf nach Art. 7 Abs. 3.
         * @enum {string}
         */
        Erlaubnismodus: "opt_in" | "opt_out" | "vertraglich";
        TextVersion: {
            /** Format: uuid */
            id: string;
            zweckCode: string;
            fassung: string;
            wortlaut: string;
            /** @description SHA-256 des Wortlauts (hex). Macht eine nachträgliche Textänderung sichtbar. */
            wortlautSha256: string;
            /** Format: date-time */
            gueltigAb: string;
            /**
             * Format: date-time
             * @description `null` = derzeit gültige Fassung.
             */
            gueltigBis: string | null;
        };
        TextVersionVeroeffentlichen: {
            zweckCode: string;
            fassung: string;
            /** @description Der rechtsverbindliche Wortlaut mit den Angaben nach Art. 13 DSGVO. Die Mindestlänge fängt das leere Feld ab und MASST SICH NICHT AN, die Vollständigkeit dieser Angaben zu prüfen — das ist eine juristische Beurteilung, keine Zeichenzählung. */
            wortlaut: string;
        };
        Einwilligung: {
            /** Format: uuid */
            id: string;
            subjektTyp: components["schemas"]["SubjektTyp"];
            /** Format: uuid */
            subjektId: string;
            zweckCode: string;
            /** Format: uuid */
            textVersionId: string;
            fassung: string;
            rechtsgrundlage: components["schemas"]["Rechtsgrundlage"];
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            /** @description Fundstelle des zugrundeliegenden Dokuments (A12-28). `null` nur beim digitalen Weg, wo es kein Dokument gibt. */
            quelleRef: string | null;
            /** @description Auf welchem Weg der Widerruf erklärt wurde; `null`, solange nicht widerrufen. */
            widerrufErfassungsweg: components["schemas"]["Erfassungsweg"] | null;
            /** @description Fundstelle des Widerrufsschreibens; `null`, solange nicht widerrufen. */
            widerrufQuelleRef: string | null;
            /**
             * Format: date-time
             * @description Zeitpunkt der **Erklärung** durch die betroffene Person — NICHT der Zeitpunkt der Erfassung (A12-27). Bei nachgetragenen Vorgängen liegen beide Wochen auseinander.
             */
            erteiltAt: string;
            /**
             * Format: date-time
             * @description Zeitpunkt, zu dem der Widerruf **erklärt** wurde. `null` = wirksam.
             */
            widerrufenAt: string | null;
            /** @description Abgeleitet aus `widerrufenAt === null`. Der Zustand folgt aus dem Ereignis, nicht umgekehrt — es gibt keine getrennt gepflegte zweite Wahrheit. */
            wirksam: boolean;
        };
        /** @description Eine Erklärung gegen eine Verarbeitung, die ohne Einwilligung läuft. PII-frei: Kennungen, Codes, Zeitpunkte. `quelleRef` ist eine Ordnungsnummer, kein Personendatum. */
        Widerspruch: {
            /** Format: uuid */
            id: string;
            subjektTyp: components["schemas"]["SubjektTyp"];
            /** Format: uuid */
            subjektId: string;
            zweckCode: string;
            /**
             * @description Aus der Matrix bestimmt. `opt_in` ist ausgeschlossen — dagegen widerruft man.
             * @enum {string}
             */
            erlaubnismodus: "opt_out" | "vertraglich";
            /**
             * Format: date-time
             * @description Zeitpunkt der ERKLÄRUNG, nicht der Erfassung. Er sagt, ab wann nicht mehr verarbeitet werden durfte.
             */
            erklaertAt: string;
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            quelleRef: string | null;
            /** Format: date-time */
            zurueckgenommenAt: string | null;
            ruecknahmeErfassungsweg: components["schemas"]["Erfassungsweg"] | null;
            ruecknahmeQuelleRef: string | null;
            /** @description Abgeleitet aus `zurueckgenommenAt === null` — der Zustand folgt dem Ereignis, nicht umgekehrt. */
            wirksam: boolean;
        };
        WiderspruchErklaeren: {
            subjektTyp: components["schemas"]["SubjektTyp"];
            /** Format: uuid */
            subjektId: string;
            zweckCode: string;
            /** Format: date-time */
            erklaertAt: string;
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            quelleRef: string;
        };
        WiderspruchZuruecknehmen: {
            /** Format: date-time */
            zurueckgenommenAt: string;
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            quelleRef: string;
        };
        /** @description **Ohne `rechtsgrundlage`** (A12-1). Sie wird serverseitig aus der Matrix `consent.zweck_subjekt` bestimmt — eine Rechtsgrundlage, die ein Sachbearbeiter aus einem Dropdown wählt, ist von der falschen Stelle gewählt. Beruht der Zweck für diese Subjektart nicht auf einer Einwilligung (`vertraglich`/`opt_out`), antwortet die Route `400` und nennt den Grund. */
        EinwilligungErteilen: {
            subjektTyp: components["schemas"]["SubjektTyp"];
            /** Format: uuid */
            subjektId: string;
            zweckCode: string;
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            /**
             * Format: date-time
             * @description Zeitpunkt der **Erklärung**, Pflichtfeld (A12-27). Der Regelfall dieser API ist das Nachtragen: Eine auf Papier erteilte Einwilligung wird Tage oder Wochen später erfasst. Setzte der Server hier den Erfassungszeitpunkt ein, wiese der Nachweis systematisch den falschen Tag aus. Zukunftswerte: 400.
             */
            erteiltAt: string;
            /** @description Fundstelle des zugrundeliegenden Dokuments (A12-28). Ohne sie bedeutet `erfassungsweg: vertrag_schriftlich` nicht „es gibt eine unterschriebene Erklärung", sondern nur „jemand hat einen Listeneintrag gewählt". Ordnungsnummer, KEIN Personendatum. */
            quelleRef: string;
        };
        /** @description Der Widerruf war bis V0046 ein Aufruf ohne Rumpf — kein Kanal, keine Fundstelle, kein Erklärungszeitpunkt. Damit war die Erteilung dreifach belegt und der Widerruf einfach; Art. 7 Abs. 3 S. 4 verlangt, dass der Widerruf so einfach sein muss wie die Erteilung, dann muss er auch so belegt sein (A12-29). */
        EinwilligungWiderrufen: {
            /**
             * Format: date-time
             * @description Zeitpunkt, zu dem der Widerruf **erklärt** wurde. Hier wiegt der Unterschied schwerer als bei der Erteilung: Ein am 1. brieflich erklärter, am 20. erfasster Widerruf ließe sonst neunzehn Tage rechtswidriger Verarbeitung rechtmäßig aussehen.
             */
            widerrufenAt: string;
            erfassungsweg: components["schemas"]["Erfassungsweg"];
            quelleRef: string;
        };
        SubjektZweckStand: {
            zweckCode: string;
            bezeichnung: string;
            /** @description Ob die Verweigerung die Leistung kostet (Art. 7 Abs. 4 DSGVO). Steht am Paar (Zweck, Subjektart), nicht am Zweck allein: Die Verbrauchsmessung ist für den Endkunden nicht verweigerbar (Vertragsgegenstand) und für den Anschlussnutzer sehr wohl. */
            verweigerbar: boolean;
            rechtsgrundlage: components["schemas"]["Rechtsgrundlage"];
            erlaubnismodus: components["schemas"]["Erlaubnismodus"];
            /** @description Warum genau diese Grundlage gilt. Wird dem Bediener angezeigt — eine Matrix, die Eingaben ablehnt, ohne den Grund zu nennen, wäre eine Blackbox. */
            begruendung: string;
            /** @description `null` = zu diesem Zweck besteht derzeit keine Einwilligung. */
            wirksameEinwilligung: components["schemas"]["Einwilligung"] | null;
            /** @description Vollständiger Verlauf, neueste zuerst — einschließlich widerrufener Einwilligungen. Sie sind der Nachweis, dass die Verarbeitung rechtmäßig war, solange sie galten. */
            verlauf: components["schemas"]["Einwilligung"][];
        };
        SubjektConsentStand: {
            subjektTyp: components["schemas"]["SubjektTyp"];
            /** Format: uuid */
            subjektId: string;
            /** @description EIN Eintrag je Zweck des Katalogs — auch für Zwecke ohne Einwilligung. Nur so ist „nie eingewilligt" von „Zweck existiert nicht" unterscheidbar. */
            zwecke: components["schemas"]["SubjektZweckStand"][];
        };
    };
    responses: {
        /** @description Ungültige Eingabe (Validierung fehlgeschlagen). PII-frei. */
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
        /** @description AuthZ-Ablehnung (RBAC/ABAC, PolicyInterceptor). PII-frei, strukturierter Grund. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Einwilligung oder Person nicht gefunden. */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Bereits wirksame Einwilligung zu diesem Zweck, bereits vergebene Fassungsnummer, oder ein zweiter Widerruf. */
        Konflikt: {
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
        /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    consentZweckeListe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Alle Zwecke, nach Code sortiert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Zweck"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    consentTexteListe: {
        parameters: {
            query?: {
                /** @description Zweck-Code, auf den eingegrenzt wird. */
                zweck?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Erklärungsfassungen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TextVersion"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    consentTextVeroeffentlichen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TextVersionVeroeffentlichen"];
            };
        };
        responses: {
            /** @description Fassung veröffentlicht. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TextVersion"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    consentStandLesen: {
        parameters: {
            query: {
                /** @description Wer eingewilligt hat. Im Mietfall ist das der Anschlussnutzer, nicht der Endkunde (DS-07) — eine Einwilligung, die jemand für einen anderen erteilt, ist keine. */
                subjektTyp: components["schemas"]["SubjektTyp"];
                subjektId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stand des Subjekts. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubjektConsentStand"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    consentEinwilligungErteilen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinwilligungErteilen"];
            };
        };
        responses: {
            /** @description Einwilligung erfasst. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Einwilligung"];
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
    consentEinwilligungWiderrufen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                einwilligungId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinwilligungWiderrufen"];
            };
        };
        responses: {
            /** @description Widerrufen; ausgegeben wird die Einwilligung mit gesetztem `widerrufenAt`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Einwilligung"];
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
    consentWiderspruecheLesen: {
        parameters: {
            query: {
                subjektTyp: components["schemas"]["SubjektTyp"];
                subjektId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verlauf der Widersprüche. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Widerspruch"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    consentWiderspruchErklaeren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WiderspruchErklaeren"];
            };
        };
        responses: {
            /** @description Erfasst. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Widerspruch"];
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
    consentWiderspruchZuruecknehmen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                widerspruchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WiderspruchZuruecknehmen"];
            };
        };
        responses: {
            /** @description Zurückgenommen; ausgegeben wird der Widerspruch mit gesetztem `zurueckgenommenAt`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Widerspruch"];
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
}
