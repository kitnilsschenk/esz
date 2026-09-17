/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/berechnung/laeufe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Neuen Berechnungslauf starten (synchron)
         * @description ABAC-Aktion `create:berechnungslauf` (NEU). Rolle `betrieb`. A10-Sperr-Check (`energy.endkunde.verarbeitungs_status`) läuft ZUERST — ein gesperrter/gelöschter Endkunde liefert `409 Conflict`, OHNE jeden Schreibzugriff (auch kein Audit-Event). Erfolgreiche und fehlgeschlagene Läufe werden auditiert (`berechnungslauf.bereinigung.angefordert`/`.abgeschlossen`/ `.fehlgeschlagen`/`.ersetzt`).
         *     `endkundeId` UND `mvetId` sind BEIDE Pflicht (redundant, wie `analytics.berechnungslauf` selbst) — der Server prüft, dass `mvetId` tatsächlich zu `endkundeId` gehört (400 bei Abweichung).
         *     v1-Einschränkungen (bitte im Review bestätigen, s. finale Antwort des Arbeitspakets): `periodeVon`/`periodeBis` müssen Monatsanfänge sein; `baseline_einheit` muss `kWh` sein (keine automatische Brennwertumrechnung); `stationRef` ist ein expliziter, vom Aufrufer gewählter Parameter (keine automatische Klimareferenz-Auflösung, ADR-0006 O-B5 ist noch offen); `gtzNorm`/`baselineNormKwh` bleiben `null`, sofern nicht explizit `gtzNormOverride` gesetzt wird (keine automatische Normperioden-Auflösung).
         */
        post: operations["berechnungslaufAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/berechnung/laeufe/{laufId}/neuberechnung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Berechnungslauf-ID (`analytics.berechnungslauf.id`). */
                laufId: components["parameters"]["LaufIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bestehenden Lauf mit unveraenderten Parametern neu rechnen (Korrektur)
         * @description ABAC-Aktion `create:berechnungslauf`. Rolle `betrieb`.
         *     Der Einstieg in die nachtraegliche Korrektur (ADR-0007 B7/D7, "nie stilles Ueberschreiben"): Der alte Lauf bleibt stehen, der neue ersetzt ihn (`ersetztLaufId`), `ausloeser` ist `nachlauf_korrektur`, und die Differenz wird bei der naechsten Einreichung ausgewiesen.
         *     Nimmt BEWUSST keine Rechenparameter entgegen. Messkonzept, Periode, Grundlastanteil, Klimastation, GTZ_base und GTZ_norm werden vom ersetzten Lauf uebernommen — wer korrigiert, soll nichts anderes rechnen koennen als das Original. Geaendert hat sich nur die Datenlage.
         *     `409 Conflict`, wenn der Lauf bereits durch einen neueren ersetzt wurde: Eine Korrektur gehoert an den juengsten Lauf, sonst haette das Original zwei gleichrangige Nachfolger.
         */
        post: operations["berechnungslaufNeuBerechnen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/berechnung/laeufe/{laufId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Berechnungslauf-ID (`analytics.berechnungslauf.id`). */
                laufId: components["parameters"]["LaufIdPath"];
            };
            cookie?: never;
        };
        /**
         * Berechnungslauf + Monatsergebnisse lesen
         * @description ABAC-Aktion `read:berechnungslauf` (NEU). Rollen `betrieb`/`compliance-auditor`. PII-frei (`endkundeId` ist Pseudonym). Liefert AUSDRÜCKLICH KEINE Tages-Detail-Snapshots (`eingang_messwert_tag`/`eingang_klima_tag` — Detail-Niveau, `edms_analytics_detail_reader`, kein v1-Konsument dieser Route).
         */
        get: operations["berechnungslaufLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/berechnung/endkunden/{endkundeId}/laeufe": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Endkunde-ID (`energy.endkunde.id`, Pseudonym-Surrogat). */
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * Berechnungsläufe eines Endkunden auflisten (PII-frei, Cursor-paginiert)
         * @description ABAC-Aktion `read:berechnungslauf`. Rollen `betrieb`/ `compliance-auditor`. Liefert eine PII-freie Zusammenfassung je Lauf (OHNE `laufergebnis`-Monatszeilen) — das Monats-Detail kommt über `GET /berechnung/laeufe/{laufId}`. Cursor-basiert (`cursor` + `limit`, api-contracts.md), niemals offset.
         */
        get: operations["berechnungslaufListeLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/berechnung/parametervorschlag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lauf-Parameter aus dem Bestand herleiten
         * @description ABAC-Aktion `read:berechnungslauf`. Rollen `betrieb` und `compliance-auditor` — rein lesend: Ein Auditor darf sehen, mit welchen Werten zu rechnen wäre, ohne rechnen zu dürfen.
         *     `POST /berechnung/laeufe` verlangt sechs Pflichtparameter, darunter `grundlastAnteil` — den Anteil der Baseline, der NICHT der Witterung folgt. Diese eine Zahl entscheidet über die Form der Monatskurve: `referenzMonat()` teilt die Baseline in `g·B·(dM/dA)` und `(1−g)·B·(GTZ_ist/GTZ_base)`. Wer `g` zu klein wählt, hängt zu viel an den Gradtagzahlen — und die gehen im Sommer gegen null. Die Referenz sackt dann ab, während der Ist-Verbrauch bleibt: rechnerischer Mehrverbrauch, wo tatsächlich eingespart wurde.
         *     **Die Herleitung:** `g` ist das Verhältnis des Sommerniveaus (Juli/August — dann heizt niemand, der verbleibende Tagesverbrauch IST die Grundlast) zum Jahresmittel, gebildet über die erfassten Baseline-Perioden. Liegt der Sommer NICHT unter dem Jahresmittel, folgt der Verbrauch der Heizwitterung überhaupt nicht (Strom in einem Bürogebäude: Kühlung und Beleuchtung) — dann ist der Vorschlag `1`.
         *     Der Vorschlag kommt mit seiner Grundlage zurück (Sommermittel, Jahresmittel, Fenster, Tage), damit man ihm widersprechen kann. Ein Vorschlag ohne nachvollziehbare Herleitung wäre nur eine besser getarnte Vermutung.
         *     Die Antwort trägt außerdem die Umstände, die einen Lauf ins Leere laufen ließen: fehlende Baseline-Perioden (`gtzBaseErmittelbar`), eine nicht verwertbare Baseline-Einheit, eine leere Systemgrenze (dann greift der `endkunde_fallback` und zieht ALLE Zähler des Kunden heran), gar keine Messdaten. Diese Dinge fielen sonst erst am Ergebnis auf.
         */
        get: operations["berechnungParametervorschlag"];
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
        Energietraeger: "strom" | "waerme" | "kaelte" | "gas" | "oel" | "biomasse";
        /**
         * @description B12.4 — Datenqualitäts-Schwelle je Monat (bzw. schlechteste Stufe der Periode am Lauf-Kopf).
         * @enum {string}
         */
        QualitaetsStufe: "belastbar" | "eingeschraenkt" | "nicht_ausweisbar";
        /** @enum {string} */
        Ausloeser: "manuell" | "job" | "nachlauf_korrektur";
        /** @description Optionale Overrides der Verfahrensparameter — fehlt ein Feld, greift der Kern-Default (`t_innen_c=20`, `t_heizgrenze_c=15`, `tage_pro_jahr=365.25`, `tages_zeitzone='Europe/Berlin'`). */
        BerechnungslaufParameter: {
            tInnenC?: number;
            tHeizgrenzeC?: number;
            tageProJahr?: number;
            tagesZeitzone?: string;
        };
        BerechnungslaufAnlegen: {
            /** Format: uuid */
            endkundeId: string;
            /**
             * Format: uuid
             * @description `energy.messkonzept_version_energietraeger.id`.
             */
            mvetId: string;
            /**
             * Format: date
             * @description Erster Kalendertag des ERSTEN Zielmonats (Monatsanfang).
             */
            periodeVon: string;
            /**
             * Format: date
             * @description Erster Kalendertag NACH dem letzten Zielmonat (halboffen, Monatsanfang).
             */
            periodeBis: string;
            /**
             * @description g — witterungsunabhängiger Anteil (B12.1), expliziter Parameter.
             *     **Wird beim Standard-/alternativen Messkonzept IGNORIERT** (V0076): Dort ist g kein Eingabewert, sondern Ergebnis der Anpassung an die vermessene Baseline-Periode. Der Lauf schreibt den angepassten Wert in seine Antwort — ein eingesandtes g findet sich dann dort NICHT wieder. Das Feld bleibt Pflicht, weil derselbe Endpoint beide Messkonzepte bedient und der vereinfachte Weg ohne g nicht rechnen kann.
             */
            grundlastAnteil: number;
            /** @description Eingefrorene Klimastations-Referenz (D4, keine Laufzeit-Auflösung). */
            stationRef: string;
            /** @description Expliziter GTZ_base-Override (Kd/a) — überspringt die Baseline-Perioden/Klima-Herleitung. */
            gtzBaseOverride?: number;
            /** @description Expliziter GTZ_norm-Override (Kd/a) — NUR für `baselineNormKwh` (Ausweis), geht NIE in `referenzKwh` ein. */
            gtzNormOverride?: number;
            ausloeser?: components["schemas"]["Ausloeser"];
            /**
             * Format: uuid
             * @description Verweist auf einen abgelösten Vorgänger-Lauf desselben Endkunden/derselben mvet (F7b, Neuberechnung).
             */
            ersetztLaufId?: string;
            parameter?: components["schemas"]["BerechnungslaufParameter"];
        };
        Laufergebnis: {
            /**
             * Format: date
             * @description Monatserster (lokal).
             */
            monat: string;
            /** @description R_m — witterungsbereinigte Monats-Referenz. */
            referenzKwh: number;
            /** @description A_m — gemessener Ist-Verbrauch. */
            istKwh: number;
            /** @description GTZ des Monats unter Ist-Wetter (Kd). */
            gtzIst: number;
            tageGesamt: number;
            tageGemessen: number;
            tageGeschaetzt: number;
            tageErsatz: number;
            tageFehlend: number;
            abdeckungPct: number;
            qualitaetsStufe: components["schemas"]["QualitaetsStufe"];
        };
        BerechnungslaufAntwort: {
            /** Format: uuid */
            id: string;
            /**
             * Format: uuid
             * @description Pseudonym
             */
            endkundeId: string;
            energietraeger: components["schemas"]["Energietraeger"];
            /** Format: uuid */
            mvetId: string;
            verfahrenCode: string;
            verfahrenVersion: number;
            /** Format: date */
            periodeVon: string;
            /** Format: date */
            periodeBis: string;
            baselineWertKwh: number;
            grundlastAnteil: number;
            gtzBase: number;
            gtzNorm: number | null;
            baselineNormKwh: number | null;
            /**
             * @description Messkonzept, mit dem DIESER Lauf gerechnet hat (Merkblatt Technik v2.2 Kap. 2, V0076). `vereinfacht` = a0 und b1 aus erfasster Baseline und Grundlast-Anteil GESETZT; `standard`/`alternativ` = an die vermessene Baseline-Periode ANGEPASST. Eingefroren wie `stationRef` — das Etikett am Messkonzept kann sich spaeter aendern, der Lauf behaelt seinen Stand.
             * @enum {string}
             */
            messkonzeptTyp: "vereinfacht" | "standard" | "alternativ";
            /** @description Guete der Baseline-Anpassung. `null` beim vereinfachten Messkonzept: dort wurde nichts angepasst, und eine Zahl waere die Behauptung einer nie gemessenen Guete. */
            modellguete: components["schemas"]["Modellguete"] | null;
            qualitaetsStufeMin: components["schemas"]["QualitaetsStufe"];
            ausloeser: components["schemas"]["Ausloeser"];
            /** Format: uuid */
            ersetztLaufId: string | null;
            /**
             * Format: uuid
             * @description Der Lauf, der DIESEN ersetzt — `null`, solange keiner existiert. Gegenrichtung zu `ersetztLaufId`. Ohne sie liest jemand eine alte Zahl, ohne zu erkennen, dass eine Korrektur sie abgeloest hat.
             */
            ersetztDurchLaufId: string | null;
            /** Format: date-time */
            erstelltAt: string;
            ergebnisse: components["schemas"]["Laufergebnis"][];
        };
        /** @description Guete der Baseline-Anpassung beim Standard-/alternativen Messkonzept (V0076). Vier Masse statt einem: R2 allein ist bei waermegefuehrten Traegern schon durch den Sommer-Winter-Kontrast hoch, auch wenn das Modell in den Uebergangsmonaten danebenliegt. */
        Modellguete: {
            /** @description R2, ZENTRIERT definiert (1 - SSE/SST um den Mittelwert). Fuer ein Modell ohne Achsenabschnitt ist auch die unzentrierte Variante gebraeuchlich — sie faellt systematisch hoeher aus. Darf negativ sein: ein Modell, das schlechter trifft als der blosse Mittelwert, ist eine Aussage, kein Fehler. */
            bestimmtheitsmass: number;
            /** @description Variationskoeffizient des RMSE in Prozent des Monatsmittels — die typische relative Abweichung. */
            cvRmsePct: number;
            /** @description Normalisierter mittlerer Bias in Prozent der Gesamtmenge. Dass er nahe null liegt, ist KEINE Guete — kleinste Quadrate erzwingen es fast. Aussagekraeftig waere erst eine Abweichung davon. */
            nmbePct: number;
            /** @description n — Monatspunkte der Vermessung. Ohne n ist R2 nicht bewertbar. */
            punkte: number;
            /** @description Abstand der ANGEPASSTEN zur nach TB-02 ERFASSTEN Jahres-Baseline in Prozent. Befund, kein Fehler: die erfasste Baseline bleibt der Beleg, die angepasste das Modell. `null`, wenn keine erfasste Baseline vorliegt. */
            baselineAbweichungPct: number | null;
        };
        /**
         * @description Woher die Zähler-Menge stammt. `endkunde_fallback` heißt: Für diese mvet ist KEINE Systemgrenze gepflegt, der Lauf griffe auf alle aktiven Zähler des Endkunden mit passendem Energieträger zurück — bei mehreren Messkonzepten desselben Kunden fließt dabei fremder Verbrauch ein.
         * @enum {string}
         */
        SystemgrenzeQuelle: "mvet_system" | "endkunde_fallback";
        /** @description Der Vorschlag für `g` samt der Rechnung, aus der er stammt. */
        GrundlastHerleitung: {
            /** @description Sommermittel ÷ Jahresmittel, gedeckelt auf 1. */
            anteilVorschlag: number;
            /** @description Mittlerer Tagesverbrauch im Juli/August. */
            sommerMittelKwhTag: number;
            /** @description Mittlerer Tagesverbrauch über das ganze Bezugsfenster. */
            jahresMittelKwhTag: number;
            sommerTage: number;
            /** @description Tage mit Messwerten im Bezugsfenster. */
            basisTage: number;
            /** Format: date */
            basisVon: string;
            /**
             * Format: date
             * @description Letzter Tag MIT Werten (einschließlich).
             */
            basisBis: string;
            /**
             * @description `baseline_periode` = aus den erfassten Bezugszeiträumen gebildet (der Regelweg). `erste_messdaten` = ersatzweise aus dem ersten Jahr der vorhandenen Messreihe, weil keine Periode erfasst ist — das muss nicht das Baselinejahr sein und ist entsprechend schwächer.
             * @enum {string}
             */
            basisHerkunft: "baseline_periode" | "erste_messdaten";
            /** @description `false`, wenn der Sommerverbrauch NICHT unter dem Jahresmittel liegt. Dann folgt der Verbrauch der Heizwitterung nicht, und der Vorschlag ist `1`. */
            witterungsgefuehrt: boolean;
        };
        BerechnungParametervorschlag: {
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            mvetId: string;
            energietraeger: string;
            baselineWertKwh: number | null;
            baselineEinheit: string | null;
            /** @description `false`, wenn die Einheit gesetzt und nicht `kWh` ist — der Lauf lehnt sie dann fail-closed ab (`BASELINE_EINHEIT_UNGUELTIG`, keine automatische Brennwertumrechnung). */
            baselineEinheitVerwertbar: boolean;
            systemgrenzeQuelle: components["schemas"]["SystemgrenzeQuelle"];
            /** @description Zähler */
            zaehlerAnzahl: number;
            baselinePeriodenAnzahl: number;
            /** @description `false`, wenn keine Baseline-Periode erfasst ist. Der Lauf bricht dann mit `GTZ_BASE_NICHT_ERMITTELBAR` ab, sofern kein `gtzBaseOverride` gesetzt ist und `grundlastAnteil` unter 1 liegt. */
            gtzBaseErmittelbar: boolean;
            /** @description `null`, wenn im Bezugsfenster keine Messdaten oder keine Sommertage liegen. */
            grundlast: components["schemas"]["GrundlastHerleitung"] | null;
            /**
             * @description Woher die Vorschläge stammen. `standort` = `energy.standort.klimareferenz` der Systeme dieses Messkonzepts — die fachlich richtige Quelle, die Station gehört zum Objekt. `fruehere_laeufe` = nur aus dem, was bei diesem Kunden schon gerechnet wurde; das wiederholt zuverlässig auch einen Fehler, falls einer drinsteckt (ADR-0006 C10.1: eine Station 220 km neben dem Objekt, jahrelang unbemerkt). `keine` = nichts hinterlegt.
             * @enum {string}
             */
            stationRefHerkunft: "standort" | "fruehere_laeufe" | "keine";
            /** @description Klimastations-Kennungen für dieses Messkonzept: zuerst die am Standort hinterlegten, danach die für diesen Endkunden schon einmal verwendeten (neueste zuerst, höchstens zehn). `stationRef` ist ein frei gewählter String ohne Auflösung (ADR-0006 O-B5 ist offen); ein leeres Textfeld wäre die nächste Ratestelle. Die Liste ist ein Vorschlag, kein Katalog — ein neuer Kunde hat keine. */
            stationRefVorschlaege: string[];
            /** Format: date */
            datenVon: string | null;
            /** Format: date */
            datenBis: string | null;
            /**
             * Format: date
             * @description Monatserster des ersten Monats mit Daten.
             */
            periodeVonVorschlag: string | null;
            /**
             * Format: date
             * @description EXKLUSIV, Monatserster. Ein angeschnittener letzter Monat fällt heraus — er zählt jeden fehlenden Tag gegen seine Abdeckung und wäre nicht belastbar.
             */
            periodeBisVorschlag: string | null;
        };
        /** @description PII-freie Lauf-Zusammenfassung für die Betriebs-UI-Liste (OHNE `laufergebnis`-Monatszeilen, OHNE Snapshot-/Rohdaten-Hashes). */
        BerechnungslaufListItem: {
            /** Format: uuid */
            id: string;
            energietraeger: components["schemas"]["Energietraeger"];
            verfahrenCode: string;
            verfahrenVersion: number;
            /** Format: date */
            periodeVon: string;
            /** Format: date */
            periodeBis: string;
            qualitaetsStufeMin: components["schemas"]["QualitaetsStufe"];
            ausloeser: components["schemas"]["Ausloeser"];
            /** Format: uuid */
            ersetztLaufId: string | null;
            /** Format: date-time */
            erstelltAt: string;
        };
        SeitenInfo: {
            /** @description Cursor der nächsten Seite; `null` = letzte Seite. */
            naechsterCursor: string | null;
            limit: number;
        };
        BerechnungslaufListe: {
            daten: components["schemas"]["BerechnungslaufListItem"][];
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
        /** @description Ressource nicht gefunden (Endkunde, mvet, Berechnungslauf). */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description A10-Sperre (Endkunde gesperrt/gelöscht, Art. 18 DSGVO) — kein neuer Berechnungslauf zulässig. */
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
        /** @description Berechnungslauf-ID (`analytics.berechnungslauf.id`). */
        LaufIdPath: string;
        /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/ Format geprüft — s. Datei-Kopf zum Stand der Replay-Deduplizierung. */
        IdempotencyKey: string;
        /** @description Endkunde-ID (`energy.endkunde.id`, Pseudonym-Surrogat). */
        EndkundeIdPath: string;
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
    berechnungslaufAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/ Format geprüft — s. Datei-Kopf zum Stand der Replay-Deduplizierung. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BerechnungslaufAnlegen"];
            };
        };
        responses: {
            /** @description Berechnungslauf erfolgreich abgeschlossen und persistiert. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BerechnungslaufAntwort"];
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
    berechnungslaufNeuBerechnen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen). Präsenz/ Format geprüft — s. Datei-Kopf zum Stand der Replay-Deduplizierung. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Berechnungslauf-ID (`analytics.berechnungslauf.id`). */
                laufId: components["parameters"]["LaufIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Korrekturlauf abgeschlossen und persistiert; ersetzt den angegebenen Lauf. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BerechnungslaufAntwort"];
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
    berechnungslaufLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Berechnungslauf-ID (`analytics.berechnungslauf.id`). */
                laufId: components["parameters"]["LaufIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Berechnungslauf inkl. `laufergebnis`-Zeilen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BerechnungslaufAntwort"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    berechnungslaufListeLesen: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (`seite.naechsterCursor`), niemals offset. */
                cursor?: components["parameters"]["CursorQuery"];
                /** @description Maximale Seitengröße (Default 50, max. 100). */
                limit?: components["parameters"]["LimitQuery"];
            };
            header?: never;
            path: {
                /** @description Endkunde-ID (`energy.endkunde.id`, Pseudonym-Surrogat). */
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Lauf-Zusammenfassungen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BerechnungslaufListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    berechnungParametervorschlag: {
        parameters: {
            query: {
                endkundeId: string;
                /** @description `energy.messkonzept_version_energietraeger.id`. Pflicht wie am Lauf selbst: Der Vorschlag gilt für ein (Endkunde, Energieträger)-Paar — ein Kunde mit Strom UND Wärme bekommt zwei völlig verschiedene Grundlastanteile. */
                mvetId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vorschlag samt Herleitung. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BerechnungParametervorschlag"];
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
