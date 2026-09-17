/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/nachweis/foerderjahre": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Förderjahre auflisten (Cursor-paginiert)
         * @description ABAC-Aktion `read:stammdaten` (B10 — Lesen läuft über die BESTEHENDE Fachaktion, KEIN eigenes `read:foerderjahr`). Rollen `betrieb`/ `compliance-auditor`.
         */
        get: operations["foerderjahrListeLesen"];
        put?: never;
        /**
         * Förderjahr-Stammdaten anlegen
         * @description ABAC-Aktion `create:foerderjahr` (PORTFOLIOWEIT, kein `endkundeId`- Bezug). Rolle `betrieb`. `vonMonat`/`bisMonat` sind BEIDE INKLUSIVE Monatsanfänge (anders als `BerechnungslaufAnlegen.periodeBis`, dort exklusiv).
         *     **Taggenaue Grenzen (seit V0070).** Ein Förderjahr aus dem Bewilligungsbescheid beginnt selten am Monatsersten; Kap. 9.1 des Technischen Merkblatts v2.2 verlangt, die Einsparung zeitanteilig zu ermitteln, wenn der relevante Zeitraum kleiner ist als das Förderjahr. Wer `vonTag`/`bisTag` mitgibt, bekommt genau diesen Zeitraum — die Randmonate werden dann angeschnitten gerechnet, und zwei aufeinanderfolgende Förderjahre dürfen sich einen Kalendermonat teilen.
         *     Ohne die beiden Felder gilt wie bisher das VOLLE Monatsfenster. Sie sind wechselseitig Pflicht (eine halbe Angabe wäre ein Förderjahr, dessen eines Ende beschieden und dessen anderes gerundet ist) und müssen in den Monaten liegen, die `vonMonat`/`bisMonat` nennen — die Monatsangaben sind das Etikett der taggenauen Grenzen, nicht eine zweite Wahrheit.
         */
        post: operations["foerderjahrAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/foerderjahre/{foerderjahrId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Förderjahr-ID (`nachweis.foerderjahr.id`). */
                foerderjahrId: components["parameters"]["FoerderjahrIdPath"];
            };
            cookie?: never;
        };
        /**
         * Förderjahr lesen
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor`.
         */
        get: operations["foerderjahrLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/preflights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Vollständigkeits-Preflight ausführen (wiederholbar, append-only)
         * @description ABAC-Aktion `create:nachweis_preflight` (PORTFOLIOWEIT). Rolle `betrieb`. Wendet den Regel-Startsatz FJ-01..FJ-09 an (FJ-07 gemäß Auflage A11 als FJ-07a/b/c differenziert — Art.-18-Sperren sind ein PAAR-Ausschluss, NIEMALS ein Förderjahr-Blocker, C2). „Grün" heißt NULL Blocker; Warnungen sind zulässig. Jeder Aufruf erzeugt einen NEUEN, eigenständigen Datensatz (append-only, idempotent im fachlichen Sinn: gleiche Eingabe → gleiches Ergebnis, nicht „kein zweiter Lauf").
         */
        post: operations["preflightAusfuehren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/preflights/{preflightId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Preflight-ID (`nachweis.preflight.id`). */
                preflightId: components["parameters"]["PreflightIdPath"];
            };
            cookie?: never;
        };
        /**
         * Preflight-Kopf lesen
         * @description ABAC-Aktion `read:nachweis_preflight` (portfolioweit, Existenz-Auflösung ohne `endkundeId`-Scope). Rollen `betrieb`/`compliance-auditor`.
         */
        get: operations["preflightLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/preflights/{preflightId}/befunde": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Preflight-ID (`nachweis.preflight.id`). */
                preflightId: components["parameters"]["PreflightIdPath"];
            };
            cookie?: never;
        };
        /**
         * Preflight-Befunde auflisten (Cursor-paginiert)
         * @description ABAC-Aktion `read:nachweis_preflight`. Befunde sind PII- und wertfrei (Regel-Code, Paar-Referenz als Pseudonym, Monat, Schwere, klassierte Kennzahl — NIEMALS kWh-Mengen, A15).
         */
        get: operations["preflightBefundeLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einsparlaeufe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Einspar-Läufe auflisten (Cursor-paginiert)
         * @description ABAC-Aktion `read:einsparlauf`. Rollen `betrieb`/`compliance-auditor`.
         */
        get: operations["einsparlaufListeLesen"];
        put?: never;
        /**
         * Einspar-Lauf starten (synchron, EINE Transaktion)
         * @description ABAC-Aktion `create:einsparlauf` (PORTFOLIOWEIT). Rolle `betrieb`. Fail-closed-Vorbedingung (D4): `art=foerderjahr_nachweis` verlangt einen GRÜNEN referenzierten Preflight (`409`, sonst); `art= zwischenstand` darf auf einem roten Preflight aufsetzen. Bindet monatsscharf GENAU EINEN nicht-ersetzten `analytics.berechnungslauf` je (Endkunde, Energieträger, Monat) im Förderjahres-Umfang (D2) und aggregiert nach dem Rechenmodell B13 (Verrechnung OHNE Kappung, Ausschluss `nicht_ausweisbarer` Monate, 75-%-Jahres-Abdeckungsfloor). `nachweis.einsparlauf_ergebnis` trägt EINE Zeile je (Endkunde, Energieträger)-Paar im Umfang, AUCH für ausgeschlossene (DE-02- Vollständigkeit — Art.-18-FJ-07c-Paare und Substitutionsfälle bleiben sichtbar, nur ohne Zahlenwert).
         */
        post: operations["einsparlaufAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einsparlaeufe/{einsparlaufId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        /**
         * Einspar-Lauf + Jahres-Ergebniszeilen lesen
         * @description ABAC-Aktion `read:einsparlauf`. Rollen `betrieb`/`compliance-auditor`. PII-frei (`endkundeId` ist Pseudonym).
         */
        get: operations["einsparlaufLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einsparlaeufe/{einsparlaufId}/ergebnisse": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        /**
         * Jahres-Ergebniszeilen auflisten (Cursor-paginiert, INKLUSIVE Ausschlüssen)
         * @description ABAC-Aktion `read:einsparlauf`. DE-02-Vollständigkeit: eine Zeile je (Endkunde, Energieträger)-Paar im Umfang, AUCH für `status=ausgeschlossen`.
         */
        get: operations["einsparlaufErgebnisseLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einsparlaeufe/{einsparlaufId}/bindungen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        /**
         * Monatsbindungen auflisten (Cursor-paginiert)
         * @description ABAC-Aktion `read:einsparlauf`. Monatsscharfe Bindung an genau einen `analytics.berechnungslauf` je (Endkunde, Energieträger, Monat, D2) — eingefrorene `referenzKwh`/`istKwh`, `kandidatenAnzahl > 1` zeigt eine aufgelöste Mehrdeutigkeit an (identische Werte, D2).
         */
        get: operations["einsparlaufBindungenLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einsparlaeufe/{einsparlaufId}/exporte": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Nachweis-Export erzeugen (deterministisch gerendert, KEINE Byte-Ablage)
         * @description ABAC-Aktion `create:nachweis_export` (PORTFOLIOWEIT). Rolle `betrieb`. Rendert das kanonische CSV-Dateibündel (`baseline_lauf`, `baseline_klima_tag`, `einflussgroessen_intervall`, `einspardaten_monat`, `einspardaten_jahr`, optional `einspardaten_differenz` bei Korrektur-Läufen, `geraeteerkennung_quote`, `geraeteerkennung_gruppe`, `metablatt`, `manifest`) und persistiert AUSSCHLIESSLICH Metadaten/Hashes.
         *     Seit **Schema-Version 3** (V0075) kommt `einsparungsnachweis.xlsx` hinzu — der technische Erfolgsnachweis in der Form der BAFA-Vorlage ([Q3] Kap. 9 + VN-Merkblatt Kap. 4.3.4), neun Blätter mit denselben Zahlen wie die CSVs, aber in der Gliederung des behördlichen Formulars. Die EINZIGE binäre Datei des Bündels; sie trägt Formeln, damit der Empfänger jede Zahl nachrechnen kann.
         *     Neue Exporte entstehen unter **Schema-Version 3** (V0075). Ein bestehender Export behält seine gespeicherte Version und wird beim Download unverändert darunter neu gerendert — sonst erschiene jeder bereits eingereichte Nachweis rückwirkend als gedriftet.
         *     Die beiden `geraeteerkennung_*`-Dateien belegen TB-05 ([Q3] Kap. 5, 20/25/30/35/40 % je Projektjahr, nicht kumulativ): Quote je (Endkunde, Energieträger) gegen die Sollquote und die Zuordnung je Gerätegruppe samt **Methode** und **Genauigkeit**. Die Gruppen-Bezeichnung ist Freitext und wird wie die Station behandelt (Auflage A13): pseudonymisiert als `GG-<lfd>`, Klarname nur bei `stationDarstellung=klarname`. Kategorie `rohdaten` ist in v1 UNBEDINGT ausgeschlossen (Auflage A12 — Anschlussnutzer-Sperren im vereinfachten Messkonzept sind strukturell nicht auflösbar; im Metablatt ausgewiesen). `zweck='wissenschaftliche_auswertung'` ist fail-closed gesperrt (Auflage A23, `403`). `stationDarstellung='klarname'` verlangt eine aktenkundige `anfrageRef` (Auflage A13, `400` sonst) — DB-CHECK ist der Backstop.
         */
        post: operations["nachweisExportErzeugen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/exporte/{exportId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
            };
            cookie?: never;
        };
        /**
         * Export-Kopf + Datei-Manifest lesen (Metadaten/Hashes, KEINE Dateiinhalte)
         * @description ABAC-Aktion `read:nachweis_export` — Auflage A19/B10: die schutzwürdigste Leseaktion dieses ADR, AUSSCHLIESSLICH Rolle `betrieb` (eigene, resource-lose Auditor-Deny-Regel `nachweis_export_auditor_verboten` im PDP — `compliance-auditor` erhält HIER `403`, ANDERS als bei `read:einreichung`).
         */
        get: operations["nachweisExportLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/exporte/{exportId}/dateien/{dateiname}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
                /** @description Entitätsfreier Dateiname aus der geschlossenen, kategoriebasierten Liste (Auflage A19, DB-CHECK `ck_export_datei_kategorie_dateiname`), z. B. `einspardaten_jahr.csv`. */
                dateiname: components["parameters"]["DateinamePath"];
            };
            cookie?: never;
        };
        /**
         * Export-Datei herunterladen (rendert neu, verifiziert vor Auslieferung)
         * @description ABAC-Aktion `read:nachweis_export` (s. o., AUSSCHLIESSLICH `betrieb`). Rendert die angeforderte Datei aus dem eingefrorenen Einspar-Lauf NEU und vergleicht `datei_hash`/`manifest_hash` gegen das persistierte Artefakt (A.8.24) — bei Abweichung erfolgt KEINE Auslieferung (`500`), unabhängig vom Ergebnis wird `export.nachweis.abgerufen` auditiert (`rolle_erfassen=true`, JEDER Abruf, auch `permit`).
         */
        get: operations["nachweisExportDateiLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/exporte/{exportId}/einreichungen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Einreichung vermerken (Ehrlichkeitsklausel — "vermerkt", NICHT "zugestellt")
         * @description ABAC-Aktion `create:einreichung` (PORTFOLIOWEIT). Rolle `betrieb`, KEIN Vier-Augen-Prinzip (User-Beschluss B14/C8). Bezeugt die vom Bediener ERKLÄRTE Übermittlung (z. B. manueller BSCW-Upload) — NICHT den Empfang durch die Behörde; `belegRef` ist der Slot für eine spätere Empfangsbestätigung. Fail-closed-Vorbedingung (D7, DB-Trigger `nachweis.pruefe_einreichung_faehig()` als Backstop): nur ein Einspar-Lauf mit `art=foerderjahr_nachweis`, `synthetic=false` und grünem Preflight ist einreichbar (`409` sonst). Korrektur (`ersetztEinreichungId` + `korrekturGrundCode`, BEIDE gemeinsam): erzeugt eine NEUE, eigenständige Einreichung samt Differenz-Report (`nachweis.einreichung_differenz`) — die alte Einreichung bleibt UNVERÄNDERT (append-only, kein Überschreiben).
         */
        post: operations["einreichungVermerken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einreichungen/{einreichungId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einreichungs-ID (`nachweis.einreichung.id`). */
                einreichungId: components["parameters"]["EinreichungIdPath"];
            };
            cookie?: never;
        };
        /**
         * Einreichung lesen
         * @description ABAC-Aktion `read:einreichung` — B10: AUSDRÜCKLICH auditor-zugänglich (Rollen `betrieb`/`compliance-auditor`), KEINE eigene Deny-Regel im PDP — die Metadaten (wann, von wem, an wen, welcher Hash) sind der Prüfgegenstand des `compliance-auditor`, nicht sein Risiko. Bewusste Asymmetrie zu `read:nachweis_export`.
         */
        get: operations["einreichungLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/einreichungen/{einreichungId}/differenzen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einreichungs-ID (`nachweis.einreichung.id`). */
                einreichungId: components["parameters"]["EinreichungIdPath"];
            };
            cookie?: never;
        };
        /**
         * Differenz-Report einer Korrektur-Einreichung auflisten (Cursor-paginiert)
         * @description ABAC-Aktion `read:einreichung` (s. o., auch `compliance-auditor`). TB-01/TB-08-Darlegung (D7 Punkt 4): je (Endkunde, Energieträger) die Werte VOR/NACH der Korrektur und das Delta — NUR bei Korrektur-Einreichungen nicht-leer. `monat` ist in v1 IMMER `null` (Jahres-Ebene, s. `EinreichungDifferenzZeile`).
         */
        get: operations["einreichungDifferenzenLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/art19-pflichten": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Mitteilungspflichten nach Art. 19 DSGVO
         * @description ABAC-Aktion `read:art19_pflicht`. Rollen `betrieb`/`compliance-auditor` — für den Auditor ist die Liste der OFFENEN Pflichten der eigentliche Prüffall.
         *
         *     Art. 19 verpflichtet, allen Empfängern, denen Daten offengelegt wurden, jede Einschränkung (Art. 18) oder Löschung (Art. 17) mitzuteilen. Die Unverhältnismäßigkeits-Ausnahme greift hier NICHT: es gibt genau einen Empfänger, er ist aktenkundig, und die Zuordnung Person → Einreichung ist eine Abfrage über `einsparlauf_bindung` (Register nach A18).
         *
         *     Der Report meldet und belegt — er teilt nicht selbst mit. Die Ausführung als Korrektur-Einreichung (A18) hängt am BSCW-Übermittlungsweg und wartet auf O-B9.
         *
         *     Liefert offene UND erfüllte Pflichten; die erfüllten sind der Beleg.
         */
        get: operations["art19PflichtenListe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/nachweis/art19-pflichten/mitteilungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Erfolgte Art.-19-Mitteilung dokumentieren
         * @description ABAC-Aktion `create:art19_mitteilung`. Rolle `betrieb` (der Auditor bleibt strikt lesend, DS-01).
         *
         *     Fail-closed gegen das Register: dokumentiert wird NUR, was tatsächlich eine Pflicht ist (404 sonst). Eine zweite Meldung desselben Vorgangs wird abgelehnt (409) — eine spätere Löschung nach Art. 17 ist dagegen ein eigener Anlass und wird eigens dokumentiert.
         *
         *     Zeitpunkt und Ausführender werden serverseitig gesetzt; der differenzierte Art.-18-Grund ist KEIN Feld und verlässt das System nicht (C4 Punkt 6). Audit `einreichung.nachweis.art19_mitgeteilt`.
         */
        post: operations["art19MitteilungAnlegen"];
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
         * @description Welche Rechtsfolge mitgeteilt wurde. Art. 19 nennt Berichtigung, Löschung UND Einschränkung — im EDMS entstehen beide letzteren: Art. 18 über den Sperr-Pfad, Art. 17 über das Krypto-Shredding.
         * @enum {string}
         */
        Art19Anlass: "einschraenkung_art18" | "loeschung_art17";
        Art19PflichtItem: {
            /** Format: uuid */
            einreichungId: string;
            /** @description Aktenkundiger Empfänger der Einreichung — der Adressat der Mitteilung. */
            empfaenger: string;
            /** Format: date-time */
            uebermitteltAt: string;
            /** @enum {string} */
            subjektTyp: "endkunde" | "anschlussnutzer";
            /** Format: uuid */
            subjektId: string;
            anlass: components["schemas"]["Art19Anlass"];
            /**
             * Format: date-time
             * @description `null` = Pflicht offen; sonst der Zeitpunkt der dokumentierten Mitteilung.
             */
            mitgeteiltAm: string | null;
            offen: boolean;
        };
        Art19PflichtReport: {
            items: components["schemas"]["Art19PflichtItem"][];
            offenAnzahl: number;
        };
        /** @description Kein Feld für Zeitpunkt oder Ausführenden (serverseitig — sonst wäre der Beleg rückdatierbar bzw. einem Dritten zuschreibbar) und keines für den Einschränkungsgrund (er verlässt das System nicht). */
        Art19MitteilungAnlegen: {
            /** Format: uuid */
            einreichungId: string;
            /** @enum {string} */
            subjektTyp: "endkunde" | "anschlussnutzer";
            /** Format: uuid */
            subjektId: string;
            anlass: components["schemas"]["Art19Anlass"];
            /**
             * @description Dieselbe geschlossene Liste wie die Art.-18-Unterrichtung — es ist derselbe Vorgangstyp, und zwei getrennte Listen würden auseinanderlaufen.
             * @enum {string}
             */
            kanal: "postalisch" | "elektronisch" | "telefonisch" | "persoenlich";
        };
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
        SeitenInfo: {
            /** @description Cursor der nächsten Seite; `null` = letzte Seite. */
            naechsterCursor: string | null;
            limit: number;
        };
        /**
         * @description O1 — Förderjahr-Zuschnitt, parametrisiert (NIE hartkodiert).
         * @enum {string}
         */
        DefinitionQuelle: "kalenderjahr" | "bewilligungszeitraum";
        FoerderjahrAnlegen: {
            /** @description z. B. 'FJ-2027', UNIQUE. */
            code: string;
            /** @description Aktenzeichen/Bescheid-Bezug (Slot */
            vorhabenRef: string;
            /** @description Projektjahr 1..5 (TB-05-kompatibel). */
            nummer: number;
            /**
             * Format: date
             * @description Monatserster
             */
            vonMonat: string;
            /**
             * Format: date
             * @description Monatserster
             */
            bisMonat: string;
            /**
             * Format: date
             * @description Optional, seit V0070 — der taggenaue Beginn (INKLUSIV) aus dem Bewilligungsbescheid. Nur gemeinsam mit `bisTag` zulässig; fehlt beides, gilt das volle Monatsfenster.
             */
            vonTag?: string;
            /**
             * Format: date
             * @description Optional, seit V0070 — erster Tag NACH dem Förderjahr (EXKLUSIV, anders als `bisMonat`). Nur gemeinsam mit `vonTag`.
             */
            bisTag?: string;
            definitionQuelle: components["schemas"]["DefinitionQuelle"];
            bescheidRef?: string;
        };
        Foerderjahr: {
            /** Format: uuid */
            id: string;
            code: string;
            vorhabenRef: string;
            nummer: number;
            /**
             * Format: date
             * @description Etikett — der Monat
             */
            vonMonat: string;
            /**
             * Format: date
             * @description Etikett — der Monat
             */
            bisMonat: string;
            /**
             * Format: date
             * @description Erster Tag des Förderjahres (INKLUSIV).
             */
            vonTag: string;
            /**
             * Format: date
             * @description Erster Tag NACH dem Förderjahr (EXKLUSIV).
             */
            bisTag: string;
            definitionQuelle: components["schemas"]["DefinitionQuelle"];
            bescheidRef: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        FoerderjahrListe: {
            daten: components["schemas"]["Foerderjahr"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        PreflightAusfuehren: {
            /** Format: uuid */
            foerderjahrId: string;
            /**
             * @description `analytics.verfahren_version`-Katalogcode (art=nachweispruefung, V0024) — v1 kennt genau EINEN Wert.
             * @constant
             */
            profilCode: "foerderjahr_preflight_de02";
        };
        /**
         * @description 'gruen' == NULL Blocker (DB-CHECK) — Warnungen sind zulässig.
         * @enum {string}
         */
        PreflightErgebnis: "gruen" | "rot";
        Preflight: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            foerderjahrId: string;
            profilCode: string;
            profilVersion: number;
            ergebnis: components["schemas"]["PreflightErgebnis"];
            /** @description A11/C2: `FJ-07c`-Befunde (Art.-18-Paar-Ausschluss) zählen NICHT in diese Zahl — sie sind paar-scoped, kein Förderjahr-Blocker. */
            blockerAnzahl: number;
            warnungAnzahl: number;
            hinweisAnzahl: number;
            umfangPaareAnzahl: number;
            monateErwartet: number;
            synthetic: boolean;
            /** Format: date-time */
            ausgefuehrtAt: string;
            /** @description Opake Akteurs-Referenz (KEIN Klartext-Name). */
            ausgefuehrtVonSub: string;
        };
        /** @enum {string} */
        PreflightSchwere: "blocker" | "warnung" | "hinweis";
        PreflightBefund: {
            /** Format: uuid */
            preflightId: string;
            lfd: number;
            /** @description FJ-01..FJ-06, FJ-07a/b/c (A11), FJ-08 (A20), FJ-09 — aus dem Verfahrenskatalog gelesen, hier nicht abschließend aufgezählt. */
            regelCode: string;
            schwere: components["schemas"]["PreflightSchwere"];
            /**
             * Format: uuid
             * @description Pseudonym.
             */
            endkundeId: string | null;
            energietraeger: string | null;
            /** Format: date */
            monat: string | null;
            /** @description KLASSIERT (z. B. `kandidaten_2`, `grund_fehlt`) — NIEMALS kWh/Prozent (A15/B12.5-Muster). */
            kennzahlKlasse: string | null;
        };
        PreflightMitBefunden: {
            preflight: components["schemas"]["Preflight"];
            befunde: components["schemas"]["PreflightBefund"][];
        };
        PreflightBefundListe: {
            daten: components["schemas"]["PreflightBefund"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /** @enum {string} */
        EinsparlaufArt: "foerderjahr_nachweis" | "zwischenstand";
        /** @enum {string} */
        EinsparlaufAusloeser: "manuell" | "job" | "korrektur";
        /**
         * @description Monats-/Lauf-Kopf-Qualitätsstufe (identisch zur ADR-0006-Domäne).
         * @enum {string}
         */
        QualitaetsStufe: "belastbar" | "eingeschraenkt" | "nicht_ausweisbar";
        EinsparlaufAnlegen: {
            /** Format: uuid */
            foerderjahrId: string;
            /**
             * Format: uuid
             * @description Referenziert den GENAUEN Preflight-Lauf, dessen Ergebnis für die D4-Fail-closed-Vorbedingung herangezogen wird (explizit, nicht implizit „jüngster Preflight" — Preflights sind wiederholbar).
             */
            preflightId: string;
            art: components["schemas"]["EinsparlaufArt"];
            ausloeser?: components["schemas"]["EinsparlaufAusloeser"];
            /**
             * Format: uuid
             * @description Verweist auf einen abgelösten Vorgänger-Lauf desselben Förderjahres (Neuberechnung).
             */
            ersetztEinsparlaufId?: string;
        };
        /** @enum {string} */
        EinsparlaufErgebnisStatus: "ausgewiesen" | "nicht_nachweisbar" | "ausgeschlossen";
        /**
         * @description Geschlossene Liste (A11). `datenschutzrechtliche_einschraenkung` = FJ-07c (der differenzierte Art.-18-Grund bleibt INTERN in `energy.endkunde`); `energietraeger_substitution_v1_nicht_ unterstuetzt` = FJ-06/B13.4 (Erkennung heute ein dokumentierter Stub, O-B3b); `nicht_nachweisbar` = struktureller Sammelcode für sonstige Nichtaufnahme (z. B. keine bindbare Analytics-Zeile trotz FJ-02- Ausnahme).
         * @enum {string}
         */
        AusschlussGrundCode: "datenschutzrechtliche_einschraenkung" | "energietraeger_substitution_v1_nicht_unterstuetzt" | "nicht_nachweisbar";
        EinsparlaufErgebnis: {
            /** Format: uuid */
            einsparlaufId: string;
            /**
             * Format: uuid
             * @description Pseudonym.
             */
            endkundeId: string;
            energietraeger: string;
            status: components["schemas"]["EinsparlaufErgebnisStatus"];
            ausschlussGrundCode: components["schemas"]["AusschlussGrundCode"] | null;
            referenzKwhSumme: number | null;
            istKwhSumme: number | null;
            /** @description E_{k,t}^{FJ} — B13.1/B13.2, kein `max(·,0)`. `null` genau bei `status ≠ ausgewiesen`. */
            einsparungKwhEndenergie: number | null;
            monateAusgewiesen: number;
            /** @description v1 immer 0 (keine Ersatz-/Hochrechnung, B13.3/B14). */
            monateErsatz: number;
            monateFehlend: number;
            /**
             * @description Jahres-Status/-Qualitätsstufe (B13.3) — EIGENE Domäne, `nicht_nachweisbar` statt `nicht_ausweisbar`.
             * @enum {string}
             */
            qualitaetsStufeMin: "belastbar" | "eingeschraenkt" | "nicht_nachweisbar";
            /** @description DE-04-Kennzeichnung (D6). */
            wissAuswertungAusgenommen: boolean;
        };
        EinsparlaufAntwort: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            foerderjahrId: string;
            art: components["schemas"]["EinsparlaufArt"];
            verfahrenCode: string;
            verfahrenVersion: number;
            /** @description Vorzeichenregel/Lückenregel/Floor/Rundung (B13) — vollständiger, eingefrorener Parametersatz. */
            parameter: Record<string, never>;
            /** Format: uuid */
            preflightId: string;
            umfangPaareAnzahl: number;
            monateErwartet: number;
            monateGebunden: number;
            gebundeneLaeufeAnzahl: number;
            qualitaetsStufeMin: components["schemas"]["QualitaetsStufe"];
            ausloeser: components["schemas"]["EinsparlaufAusloeser"];
            codeRevision: string;
            synthetic: boolean;
            /** Format: uuid */
            ersetztEinsparlaufId: string | null;
            /** Format: date-time */
            erstelltAt: string;
            erstelltVonSub: string;
            ergebnisse: components["schemas"]["EinsparlaufErgebnis"][];
        };
        EinsparlaufListItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            foerderjahrId: string;
            art: components["schemas"]["EinsparlaufArt"];
            qualitaetsStufeMin: components["schemas"]["QualitaetsStufe"];
            /** Format: uuid */
            ersetztEinsparlaufId: string | null;
            /** Format: date-time */
            erstelltAt: string;
        };
        EinsparlaufListe: {
            daten: components["schemas"]["EinsparlaufListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        EinsparlaufErgebnisListe: {
            daten: components["schemas"]["EinsparlaufErgebnis"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /**
         * @description v1 kennt KEIN `ersatz` (keine Hochrechnung, B13.3/B14).
         * @enum {string}
         */
        MonatsBehandlung: "gemessen" | "ausgeschlossen";
        EinsparlaufBindung: {
            /** Format: uuid */
            einsparlaufId: string;
            /**
             * Format: uuid
             * @description Pseudonym.
             */
            endkundeId: string;
            energietraeger: string;
            /** Format: date */
            monat: string;
            /**
             * Format: uuid
             * @description `analytics.berechnungslauf.id` (ADR-0006, D2).
             */
            berechnungslaufId: string;
            referenzKwh: number;
            istKwh: number;
            /** @description R_m − A_m, VOR Vorzeichenregel. */
            deltaKwh: number;
            /** @description NACH Vorzeichen-/Lückenregel (F2/F3) — 0 bei `behandlung=ausgeschlossen`. */
            deltaAusgewiesenKwh: number;
            qualitaetsStufe: components["schemas"]["QualitaetsStufe"];
            behandlung: components["schemas"]["MonatsBehandlung"];
            /** @description > 1 zeigt eine aufgelöste Mehrdeutigkeit an (D2, identische Werte — abweichende Werte sind ein FJ-05-Preflight-Blocker). */
            kandidatenAnzahl: number;
        };
        EinsparlaufBindungListe: {
            daten: components["schemas"]["EinsparlaufBindung"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /**
         * @description Auflage A14: `de04_auszug` wird DB-seitig AUS `zweck` abgeleitet (`GENERATED ALWAYS AS (zweck = 'wissenschaftliche_auswertung')`). `wissenschaftliche_auswertung` ist Auflage A23 fail-closed gesperrt (DB-CHECK `ck_export_zweck_wiss_auswertung_gesperrt`) — Empfänger/ Rolle/Rechtsgrundlage sind ungeklärt.
         * @enum {string}
         */
        NachweisExportZweck: "nachweis" | "erfolgskontrolle" | "wissenschaftliche_auswertung";
        /**
         * @description Default `pseudonymisiert` (Art. 25 Abs. 2). Auflage A13 — Ehrlichkeitsklausel: die Ersetzung ist KEINE Anonymisierung, weil die mitgelieferte Klima-Tagesreihe die Station gegen frei verfügbare DWD-Referenzreihen bestimmbar macht (im Metablatt ausgewiesen). `klarname` nur bei aktenkundiger Anforderung (`anfrageRef` PFLICHT, DB-CHECK).
         * @enum {string}
         */
        ExportStationDarstellung: "pseudonymisiert" | "klarname";
        NachweisExportErzeugen: {
            /** @default nachweis */
            zweck: components["schemas"]["NachweisExportZweck"];
            /** @default pseudonymisiert */
            stationDarstellung: components["schemas"]["ExportStationDarstellung"];
            /** @description PFLICHT bei `stationDarstellung=klarname` (Auflage A13, aktenkundige Anforderung). */
            anfrageRef?: string;
        };
        /**
         * @description DE-03-Kategorien (D5) plus `geraeteerkennung` (Exportschema v2, V0064 — TB-05-Quotennachweis) plus `einsparungsnachweis` (Exportschema v3, V0075 — die Nachweis-Mappe in der Form der BAFA-Vorlage). `rohdaten` erscheint NIE in einer `NachweisExportAntwort.dateien`-Liste (Auflage A12).
         * @enum {string}
         */
        ExportKategorie: "rohdaten" | "baseline" | "einflussgroessen" | "einspardaten" | "geraeteerkennung" | "einsparungsnachweis" | "meta";
        NachweisExportDatei: {
            /** Format: uuid */
            exportId: string;
            dateiname: string;
            kategorie: components["schemas"]["ExportKategorie"];
            /** @description Zeilenzahl OHNE Header, als String (`bigint`-Herkunft). */
            zeilenAnzahl: string;
            /** @description SHA-256 über den kanonischen Dateiinhalt, hex. Dieselbe Schreibweise wie in der ausgelieferten `manifest.csv` — sie soll ohne Umrechnung vergleichbar sein. */
            dateiHash: string;
        };
        NachweisExportAntwort: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            einsparlaufId: string;
            /** @constant */
            schemaCode: "nachweis_export_kanonisch";
            schemaVersion: number;
            /**
             * @description v1 rendert AUSSCHLIESSLICH `csv` (keine XLSX-Beilage, D5).
             * @enum {string}
             */
            format: "csv" | "csv+xlsx";
            zweck: components["schemas"]["NachweisExportZweck"];
            /** @description DB-abgeleitet (`zweck=wissenschaftliche_auswertung`) — in v1 immer `false` (A23 gesperrt). */
            de04Auszug: boolean;
            /** @constant */
            pseudonymProfil: "standard";
            stationDarstellung: components["schemas"]["ExportStationDarstellung"];
            anfrageRef: string | null;
            /** @description SHA-256 über die sortierte Dateiliste, hex. */
            manifestHash: string;
            dateienAnzahl: number;
            zeilenAnzahlGesamt: string;
            /** Format: date-time */
            erzeugtAt: string;
            /** @description Opake Akteurs-Referenz (KEIN Klartext-Name). */
            erzeugtVonSub: string;
            dateien: components["schemas"]["NachweisExportDatei"][];
        };
        /**
         * @description DE-01 "nur auf Anfrage" — der Anlass wird am Artefakt geführt.
         * @enum {string}
         */
        EinreichungArt: "verwendungsnachweis" | "zwischennachweis" | "anfrage_bafa" | "stichprobe";
        /**
         * @description `email_geschuetzt` setzt eine Übertragung nach BSI TR-02102 voraus (Auflage A22, organisatorisches TOM — hier NICHT technisch erzwungen).
         * @enum {string}
         */
        EinreichungUebermittlungsweg: "bscw_manuell" | "email_geschuetzt" | "api";
        /**
         * @description Geschlossene Liste (D7) — NUR zusammen mit `ersetztEinreichungId`.
         * @enum {string}
         */
        KorrekturGrundCode: "messwert_korrektur" | "klima_revision" | "baseline_korrektur" | "einflussgroesse_korrektur" | "verfahren_version_neu" | "parameter_korrektur" | "foerderjahr_definition_geaendert" | "sonstige";
        EinreichungAnlegen: {
            art: components["schemas"]["EinreichungArt"];
            /** @description DE-01 "nur auf Anfrage" → Aktenzeichen. */
            anfrageRef?: string;
            /** @default bafa */
            empfaenger: string;
            uebermittlungsweg: components["schemas"]["EinreichungUebermittlungsweg"];
            /**
             * Format: date-time
             * @description ISO-8601-UTC-Zeitpunkt der ERKLÄRTEN Übermittlung durch den Bediener (Ehrlichkeitsklausel — "vermerkt", nicht "zugestellt").
             */
            uebermitteltAt: string;
            /**
             * Format: uuid
             * @description Slot für eine spätere Empfangsbestätigung — KEIN FK (eigenes Beleg-ADR).
             */
            belegRef?: string;
            /**
             * Format: uuid
             * @description Korrektur (D7 Punkt 3) — NUR gemeinsam mit `korrekturGrundCode`.
             */
            ersetztEinreichungId?: string;
            korrekturGrundCode?: components["schemas"]["KorrekturGrundCode"];
        };
        Einreichung: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            exportId: string;
            /** Format: uuid */
            einsparlaufId: string;
            art: components["schemas"]["EinreichungArt"];
            anfrageRef: string | null;
            empfaenger: string;
            uebermittlungsweg: components["schemas"]["EinreichungUebermittlungsweg"];
            /** @description Eingefroren, = `export.manifestHash` zum Einreichungszeitpunkt; hex. */
            manifestHash: string;
            /** Format: date-time */
            uebermitteltAt: string;
            /** @description Opake Akteurs-Referenz (KEIN Klartext-Name). */
            eingereichtVonSub: string;
            /** Format: uuid */
            belegRef: string | null;
            /** Format: uuid */
            ersetztEinreichungId: string | null;
            korrekturGrundCode: components["schemas"]["KorrekturGrundCode"] | null;
            /** Format: date-time */
            createdAt: string;
        };
        EinreichungDifferenzZeile: {
            /** Format: uuid */
            einreichungId: string;
            /**
             * Format: uuid
             * @description Pseudonym.
             */
            endkundeId: string;
            energietraeger: string;
            /** @description v1 IMMER `null` — nur Jahres-Ebene (s. Renderer-Dok, monatsscharfe Differenzen sind additiv möglich, aber nicht Teil dieser Version). */
            monat: null;
            wertAltKwh: number | null;
            wertNeuKwh: number | null;
            /** @description wertNeuKwh − wertAltKwh (fehlende Seite zählt als 0). */
            deltaKwh: number;
            ursacheCode: components["schemas"]["KorrekturGrundCode"];
        };
        EinreichungDifferenzListe: {
            daten: components["schemas"]["EinreichungDifferenzZeile"][];
            seite: components["schemas"]["SeitenInfo"];
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
        /** @description Ressource nicht gefunden (Förderjahr, Preflight, Einspar-Lauf). */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description D4 fail-closed: `art=foerderjahr_nachweis` ohne grünen referenzierten Preflight — kein neuer Einspar-Lauf zulässig. */
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
        /** @description Förderjahr-ID (`nachweis.foerderjahr.id`). */
        FoerderjahrIdPath: string;
        /** @description Preflight-ID (`nachweis.preflight.id`). */
        PreflightIdPath: string;
        /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
        EinsparlaufIdPath: string;
        /** @description Export-ID (`nachweis.export.id`). */
        ExportIdPath: string;
        /** @description Entitätsfreier Dateiname aus der geschlossenen, kategoriebasierten Liste (Auflage A19, DB-CHECK `ck_export_datei_kategorie_dateiname`), z. B. `einspardaten_jahr.csv`. */
        DateinamePath: string;
        /** @description Einreichungs-ID (`nachweis.einreichung.id`). */
        EinreichungIdPath: string;
        /** @description Filter auf `foerderjahrId`. */
        FoerderjahrQuery: string;
        ArtQuery: components["schemas"]["EinsparlaufArt"];
        /** @description Nur nicht-ersetzte Läufe (`ersetzt_einsparlauf_id IS NULL`). */
        NurAktuelleQuery: boolean;
        /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
        CursorQuery: string;
        /** @description Maximale Seitengröße (Default 50, max. 100). */
        LimitQuery: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    foerderjahrListeLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Förderjahren. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FoerderjahrListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    foerderjahrAnlegen: {
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
                "application/json": components["schemas"]["FoerderjahrAnlegen"];
            };
        };
        responses: {
            /** @description Förderjahr angelegt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Foerderjahr"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    foerderjahrLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Förderjahr-ID (`nachweis.foerderjahr.id`). */
                foerderjahrId: components["parameters"]["FoerderjahrIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Förderjahr. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Foerderjahr"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    preflightAusfuehren: {
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
                "application/json": components["schemas"]["PreflightAusfuehren"];
            };
        };
        responses: {
            /** @description Preflight durchgeführt (Kopf + alle Befunde). */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreflightMitBefunden"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    preflightLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Preflight-ID (`nachweis.preflight.id`). */
                preflightId: components["parameters"]["PreflightIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Preflight-Kopf. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Preflight"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    preflightBefundeLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path: {
                /** @description Preflight-ID (`nachweis.preflight.id`). */
                preflightId: components["parameters"]["PreflightIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Preflight-Befunden. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreflightBefundListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einsparlaufListeLesen: {
        parameters: {
            query?: {
                /** @description Filter auf `foerderjahrId`. */
                foerderjahr?: components["parameters"]["FoerderjahrQuery"];
                art?: components["parameters"]["ArtQuery"];
                /** @description Nur nicht-ersetzte Läufe (`ersetzt_einsparlauf_id IS NULL`). */
                nurAktuelle?: components["parameters"]["NurAktuelleQuery"];
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Einspar-Lauf-Zusammenfassungen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinsparlaufListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einsparlaufAnlegen: {
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
                "application/json": components["schemas"]["EinsparlaufAnlegen"];
            };
        };
        responses: {
            /** @description Einspar-Lauf erfolgreich abgeschlossen und persistiert. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinsparlaufAntwort"];
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
    einsparlaufLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Einspar-Lauf inkl. `ergebnisse`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinsparlaufAntwort"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einsparlaufErgebnisseLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Jahres-Ergebniszeilen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinsparlaufErgebnisListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einsparlaufBindungenLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Monatsbindungen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinsparlaufBindungListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nachweisExportErzeugen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Einspar-Lauf-ID (`nachweis.einsparlauf.id`). */
                einsparlaufId: components["parameters"]["EinsparlaufIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NachweisExportErzeugen"];
            };
        };
        responses: {
            /** @description Export erzeugt (Kopf + Datei-Manifest). */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NachweisExportAntwort"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            /** @description RBAC/ABAC-Ablehnung ODER Auflage A23 (`zweck=wissenschaftliche_auswertung` fail-closed gesperrt). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nachweisExportLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Export-Kopf + Datei-Manifest. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NachweisExportAntwort"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nachweisExportDateiLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
                /** @description Entitätsfreier Dateiname aus der geschlossenen, kategoriebasierten Liste (Auflage A19, DB-CHECK `ck_export_datei_kategorie_dateiname`), z. B. `einspardaten_jahr.csv`. */
                dateiname: components["parameters"]["DateinamePath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dateiinhalt. Die CSV-Dateien als kanonisches CSV (RFC 4180, UTF-8, CRLF); `einsparungsnachweis.xlsx` seit Exportschema v3 (V0075) als XLSX-Arbeitsmappe — ein ZIP-Container, also ein BINÄRER Body. Ein Client, der die Antwort als Text liest, beschädigt die Mappe. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            /** @description A.8.24: der neu gerenderte Inhalt weicht vom persistierten Hash ab — Auslieferung verweigert. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            default: components["responses"]["Unerwartet"];
        };
    };
    einreichungVermerken: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/Format geprüft. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Export-ID (`nachweis.export.id`). */
                exportId: components["parameters"]["ExportIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinreichungAnlegen"];
            };
        };
        responses: {
            /** @description Einreichung vermerkt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Einreichung"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            /** @description D7 fail-closed: Einsparlauf nicht `art=foerderjahr_nachweis`, `synthetic=true`, oder Preflight nicht grün. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            default: components["responses"]["Unerwartet"];
        };
    };
    einreichungLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einreichungs-ID (`nachweis.einreichung.id`). */
                einreichungId: components["parameters"]["EinreichungIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Einreichung. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Einreichung"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einreichungDifferenzenLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path: {
                /** @description Einreichungs-ID (`nachweis.einreichung.id`). */
                einreichungId: components["parameters"]["EinreichungIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Differenzzeilen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinreichungDifferenzListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    art19PflichtenListe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pflichten-Report. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Art19PflichtReport"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    art19MitteilungAnlegen: {
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
                "application/json": components["schemas"]["Art19MitteilungAnlegen"];
            };
        };
        responses: {
            /** @description Mitteilung dokumentiert; Antwort ist der aktualisierte Pflichten-Report. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Art19PflichtReport"];
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
