-- V0024__nachweis_vorbedingungen_a11_und_verfahrenskatalog.sql
--
-- ADR-Bezug: docs/adr/ADR-0007-einsparberechnung-bafa-export.md Teil C
-- (Phase-3-Compliance-Review, Auflagen A11-A23) + Teil B B3/B9/B13/B14
-- (Verfahrenskatalog-Erweiterung, Rechenmodell-Konstanten, Golden Vectors).
-- Direkter Arbeitsauftrag (database-lead), NUR ENTWURF -- kein Apply gegen
-- die Dev-DB, keine Migrations-Ausfuehrung ausserhalb eines Wegwerf-Test-
-- containers. ADR-0007 bleibt "proposed" bis technical-director-/
-- User-Freigabe; Teil C selbst traegt bereits ein "kein Veto"-Votum mit
-- verbindlichen Auflagen (2026-08-21), die HIER erstmals in DDL umgesetzt
-- werden.
--
-- Diese Migration ist eine VORBEDINGUNG fuer V0025 (Schema `nachweis`):
--   (1) A11-Schema-Delta (User-Beschluss C8, 2026-08-21): faehigkeit,
--       Art.-18-Einschraenkungen an `energy.endkunde`/`energy.
--       anschlussnutzer` DIFFERENZIERT abzubilden (Grund + Zeitpunkt) --
--       ohne dieses Feld waere A11 (FJ-07-Differenzierung, C2/C3/C4) nicht
--       umsetzbar, es bliebe nur der unverhaeltnismaessige Pauschal-Blocker.
--   (2) `analytics.verfahren.ck_verfahren_art` additiv um drei neue Werte
--       erweitert (einsparaggregation, nachweispruefung, exportschema,
--       ADR-0007 F8/D3: "der Katalog wird geteilt, nicht dupliziert") --
--       mit den zugehoerigen Katalog-/Versionszeilen (SCD2, Praezedenz
--       V0019), damit V0025s Fremdschluessel
--       (nachweis.einsparlauf.verfahren_code/_version,
--        nachweis.preflight.profil_code/_version,
--        nachweis.export.schema_code/_version)
--       ueberhaupt gueltige Katalog-Ziele vorfinden.
--
-- =====================================================================
-- (1) A11-Schema-Delta -- Entscheidungen mit Begruendung
-- =====================================================================
--
-- (D-A11-SPALTEN) Zwei neue Spalten auf BEIDEN Tabellen (C8, woertlich:
--   "an energy.endkunde UND energy.anschlussnutzer"):
--     einschraenkung_grund_code text   -- geschlossene Liste, s. u.
--     gesperrt_seit             timestamptz
--   Beide NULLABLE (Bestandsdaten: der bestehende `EndkundeService.
--   sperren()`-Pfad ist laut ADR-0007 C8 "bislang grundlos" -- es gibt
--   heute schon `verarbeitungs_status='gesperrt'`-Zeilen OHNE jeglichen
--   dokumentierten Grund, und diese Migration darf sie nicht nachtraeglich
--   ungueltig machen).
--
-- (D-A11-CHECK-VORWAERTS, DB-erzwungen) Ein Grund darf NUR gesetzt sein,
--   wenn `verarbeitungs_status='gesperrt'` -- das ist die im Arbeitsauftrag
--   woertlich verlangte Haelfte ("CHECK, dass ein Grund nur bei
--   verarbeitungs_status='gesperrt' gesetzt sein darf") und traegt KEIN
--   Backfill-Risiko: die beiden neuen Spalten sind bei jeder Bestandszeile
--   zwangslaeufig NULL (frisch hinzugefuegte Spalten ohne Default ausser
--   NULL), also verletzt keine existierende Zeile diese Richtung.
--   Zusaetzlich (ueber den woertlichen Auftrag hinaus, aber unmittelbar
--   angrenzend und nicht-spekulativ, D-CHECK-Praezedenz V0019/V0020):
--   `einschraenkung_grund_code` und `gesperrt_seit` werden GEMEINSAM
--   gesetzt oder GEMEINSAM NULL belassen -- ein Grund ohne Zeitpunkt (oder
--   umgekehrt) waere fachlich unvollstaendig und aus keiner Bestandszeile
--   ableitbar (beide Spalten sind neu, es gibt keine Altzeile mit genau
--   einer der beiden bereits gesetzt).
--
-- (D-A11-CHECK-RUECKWAERTS, BEWUSST NICHT DB-ERZWUNGEN) Die
--   Umkehr-Implikation ("verarbeitungs_status='gesperrt' ERZWINGT einen
--   Grund") wird HIER NICHT als harter CHECK umgesetzt -- Arbeitsauftrag
--   nennt genau dieses Risiko ("Bestandsdaten! ggf. nur fuer neue Zeilen
--   ueber den App-Pfad, nicht per DB-CHECK"). Begruendung:
--     1. Bestandsschutz: ADR-0007 C8 sagt woertlich, der bisherige
--        Sperren-Pfad ist "grundlos" -- es existieren (potenziell) bereits
--        `verarbeitungs_status='gesperrt'`-Zeilen ohne Grund. Ein
--        `ALTER TABLE ... ADD CONSTRAINT` OHNE `NOT VALID` wuerde den
--        gesamten Tabellenbestand beim Anwenden dieser Migration scannen
--        und HART FEHLSCHLAGEN, sobald eine einzige solche Altzeile
--        existiert -- diese Migration waere dann in einer bereits
--        gefuellten Umgebung gar nicht anwendbar.
--     2. Auch `NOT VALID` loest das Problem nicht sauber: eine `NOT VALID`-
--        CHECK-Constraint validiert zwar den Bestand nicht sofort, aber
--        JEDES kuenftige `UPDATE` einer bereits betroffenen Altzeile (auch
--        auf eine voellig unbeteiligte Spalte, z. B. `consent_status`)
--        wuerde PostgreSQL zwingen, ALLE CHECK-Constraints der Zeile erneut
--        zu pruefen -- eine Altzeile ohne Grund waere dann fuer JEDES
--        kuenftige Update blockiert, bis jemand nachtraeglich einen Grund
--        nachtraegt. Das ist ein ueberraschender Seiteneffekt fuer
--        voellig unbeteiligte Schreibpfade (z. B. Consent-Widerruf), nicht
--        nur fuer den Sperren-Pfad selbst -- ein zu hoher, unkontrollierter
--        Blast-Radius fuer eine Migration, die ausdruecklich "NUR ENTWURF"
--        ist und deren Ziel (A11) NICHT ist, bestehende Endkunden
--        handlungsunfaehig zu machen.
--   ENTSCHEIDUNG: die Umkehr-Implikation ist App-Scope (`EndkundeService.
--   sperren()` erhaelt den Grund als PFLICHT-Parameter, ADR-0007 C8,
--   letzter Satz: "der bestehende EndkundeService.sperren()-Pfad ... braucht
--   den Grund als Pflichtangabe -- bislang ist die Sperre grundlos") --
--   Umsetzung in der Backend-Migration/dem Service-Layer, NICHT hier.
--   Empfehlung fuer eine SPAETERE, eigene Migration (append-only,
--   NACHDEM der App-Pfad produktiv immer einen Grund mitgibt): ein NEUER
--   CHECK mit `NOT VALID`, gefolgt von einer expliziten, ops-begleiteten
--   `VALIDATE CONSTRAINT` NACH einem gezielten Daten-Backfill der
--   verbleibenden Altzeilen -- ausdruecklich NICHT Teil dieser Migration.
--
-- (D-A11-WERTELISTE) `einschraenkung_grund_code`, geschlossene Liste,
--   woertlich aus C8/User-Beschluss uebernommen:
--     art18_1a_richtigkeit               -- Art. 18(1)(a) Richtigkeit bestritten
--     art18_1b_unrechtmaessig            -- Art. 18(1)(b) unrechtmaessige Verarbeitung
--     art18_1c_rechtsverteidigung_betroffener  -- Art. 18(1)(c) Betroffener braucht die Daten fuer Rechtsanspruch
--     art18_1d_widerspruch               -- Art. 18(1)(d) Widerspruch nach Art. 21 schwebend
--   Diese vier Werte sind die Grundlage der FJ-07a/b/c-Differenzierung
--   (ADR-0007 C4/A11, TOM Abschnitt 12): (1a)/(1c) -> Ausweis MIT
--   Kennzeichnung (FJ-07b), (1b)/(1d) -> Paar-Ausschluss mit neutralem
--   Sammelcode `datenschutzrechtliche_einschraenkung` (FJ-07c). Diese
--   Differenzierungslogik selbst ist App-/Preflight-Scope (spaeterer
--   `savings-engineer`/`bafa-export-engineer`-Baustein) -- diese Migration
--   liefert nur die STRUKTUR, aus der die vier Werte aufloesbar sind.
--   `verarbeitungs_status='geloescht'` (Art. 17 vollzogen, FJ-07a) BRAUCHT
--   laut A11 explizit KEINEN Grund-Code ("ist KEIN Befund, sondern regulaer
--   auszuweisen") -- konsistent damit erzwingt der obige CHECK einen Grund
--   NUR bei 'gesperrt', NICHT bei 'geloescht'.
--
-- (D-A11-PII-KOMMENTARE) `einschraenkung_grund_code` ist -- anders als die
--   uebrigen Spalten von `energy.endkunde` (V0002: "KEINE PII-Spalten hier,
--   rote Linie 1") -- ein Datenpunkt UEBER die Ausuebung eines
--   Betroffenenrechts durch ein identifizierbares (pseudonymes) Subjekt.
--   ADR-0007 C4.6 verlangt ausdruecklich Datenminimierung an dieser Stelle
--   ("Der exportierte Grund ist der neutrale Sammelcode; der differenzierte
--   Sperrgrund bleibt INTERN, Art. 5(1)(c)") -- daher COMMENT ON COLUMN
--   nach demselben Muster wie `analytics.eingang_snapshot.endkunde_id`
--   (personenbeziehbar, aber pseudonym/kein Klartext), s. u.
--
-- (D-A11-KEIN-INDEX) KEIN zusaetzlicher Index auf `verarbeitungs_status`
--   oder `einschraenkung_grund_code` -- `.claude/rules/database-migrations.md`
--   verbietet spekulative Indizes. `energy.endkunde`/`anschlussnutzer` sind
--   Stammdaten-Tabellen in der Groessenordnung "Anzahl Foerderteilnehmer"
--   (10^3-10^4 Zeilen, NICHT 10^8-10^9 wie `measurement.messwert`); ein
--   Foerderjahr-Preflight laeuft hoechstens einige Male pro Jahr und liest
--   dabei ohnehin nur den im Umfang befindlichen, bereits vorab
--   eingegrenzten Endkunden-/Anschlussnutzerkreis (kein Full-Scan-Hot-Path,
--   der einen Index rechtfertigen wuerde).
--
-- =====================================================================
-- (2) Verfahrenskatalog-Erweiterung -- Entscheidungen mit Begruendung
-- =====================================================================
--
-- (D-KATALOG-ART-ERWEITERUNG) `analytics.verfahren.ck_verfahren_art` kann
--   in PostgreSQL nicht "erweitert", nur ERSETZT werden (kein
--   `ALTER CHECK`) -- DROP + ADD derselben Constraint unter demselben
--   Namen, additiv um die drei neuen Werte (F8: "der Katalog wird geteilt,
--   nicht dupliziert"). Kein Backfill-Risiko: die zwei Bestandswerte
--   ('bereinigung','baseline') bleiben in der erweiterten Menge gueltig.
--
-- (D-KATALOG-DREI-VERFAHREN) Drei neue `verfahren`-Zeilen (je eine pro
--   neuem `art`-Wert) + je EINE `verfahren_version`@1 (SCD2, Praezedenz
--   V0019) -- OHNE diese Zeilen koennten `nachweis.einsparlauf`,
--   `nachweis.preflight` und `nachweis.export` (V0025) ihre jeweilige
--   FOREIGN KEY (code, version) REFERENCES analytics.verfahren_version
--   NIEMALS erfuellen (B3: "gepflegt AUSSCHLIESSLICH ueber Migrationen" --
--   es gibt keinen Laufzeit-INSERT-Pfad, der das nachholen koennte).
--
--   (a) 'einsparung_foerderjahr_kap91' (art=einsparaggregation):
--       `parameter_schema` transkribiert die in Phase 2 (B13, B14)
--       BEREITS ENTSCHIEDENEN Rechenmodell-Konstanten -- NICHTS davon ist
--       hier neu erfunden:
--         - `abdeckungsfloor_pct` = 75 (B13.3, B14/O-B2 "bestaetigt,
--           bleibt aber als Parameter implementiert, nicht als Literal")
--         - `vorzeichenregel` = 'verrechnung_ohne_kappung' (B13.2, Kap. 9.1
--           Satz 2/3 woertlich: Mehrverbrauch wird VERRECHNET, KEINE
--           Kappung auf 0 -- Kappung waere eine "andere Berechnungsmethode"
--           und abstimmungspflichtig, Kap. 9.1 Satz 4)
--         - `lueckenregel` = 'ausschluss_nicht_ausweisbar' (B13.3:
--           nicht_ausweisbar-Monate werden ausgeschlossen, nicht 0-gefuellt,
--           nicht hochgerechnet)
--         - `portfolio_verrechnung` = true (Kap. 9.1 Satz 3: E_t^{FJ,ZE} =
--           Summe der E_{k,t}^{FJ}, OHNE 0-Kappung negativer Endkundenjahre)
--       `golden_vectors` = GV1-GV6 aus B13.6, STRUKTURIERT (kanonische
--       Quelle bleibt -- wie V0019 D-GV -- eine kuenftige Repo-Datei
--       `tests/golden/verfahren/einsparung_foerderjahr_kap91@1.json`, hier
--       NUR redundanter DB-Spiegel fuer DE-03-Nachvollziehbarkeit + einen
--       kuenftigen Bootstrap-Vollstaendigkeitscheck, analog V0019 D-GV).
--
--   (b) 'foerderjahr_preflight_de02' (art=nachweispruefung): Katalog-Zeile
--       fuer das FK-Ziel von `nachweis.preflight.profil_code/_version`.
--       `parameter_schema` transkribiert den B4-Regel-Startsatz (FJ-01..09)
--       MIT der bereits beschlossenen Aenderung durch A11 (FJ-07 wird durch
--       FJ-07a/b/c ersetzt, KEIN Foerderjahr-Blocker mehr) und A20 (FJ-08
--       um den DWD-Aenderungsvermerk erweitert) -- das sind die ZWEI der
--       sechs vom Arbeitsauftrag als "in diesen Migrationen umzusetzen"
--       benannten Auflagen, die den Preflight-Regelkatalog selbst
--       betreffen. `golden_vectors` = '[]'::jsonb -- es gibt (noch) KEINEN
--       Preflight-Ausfuehrungsmotor im Repo, dessen Verhalten hier
--       fixierbar waere; ein Golden-Fixture-Startsatz ist erst mit dessen
--       Implementierung sinnvoll (offener Punkt, s. Dateiende).
--
--   (c) 'nachweis_export_kanonisch' (art=exportschema): Katalog-Zeile fuer
--       das FK-Ziel von `nachweis.export.schema_code/_version`.
--       `parameter_schema` bewusst NUR strukturell (Format-/Kategorie-
--       Enum) -- das eigentliche Spaltenprofil je Datei (A15: "Spalten-
--       Positivliste per Migration") haengt an O-B8 (CSV-Konvention:
--       Encoding, Trennzeichen, Dezimaltrenner), das laut ADR-0007 B12/C7
--       NOCH OFFEN ist ("bafa-export-engineer + User"). Diese Migration
--       ERFINDET dieses Spaltenprofil NICHT -- eine Nachtragsmigration
--       (neue Nummer, append-only) liefert es, sobald O-B8 beantwortet ist.
--       Die A19-Dateinamen-Haertung (entitaetsfreie, geschlossene Liste)
--       wird UNABHAENGIG davon bereits strukturell in V0025 als DB-CHECK
--       auf `nachweis.export_datei.dateiname` erzwungen (staerker als ein
--       JSON-Schema es koennte) -- keine Duplizierung hier.
--       `golden_vectors` = '[]'::jsonb -- Golden-Export-Fixture (A15) ist
--       ebenfalls von O-B8 abhaengig, s. o.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- (1) energy.endkunde/anschlussnutzer: ADD COLUMN + CHECKs + COMMENTs.
-- (2) analytics.verfahren: CHECK ersetzen -> drei verfahren-Zeilen -> drei
--     verfahren_version-Zeilen (SCD2-Seed).

-- =====================================================================
-- (1) A11-Schema-Delta
-- =====================================================================

ALTER TABLE energy.endkunde
    ADD COLUMN einschraenkung_grund_code text,
    ADD COLUMN gesperrt_seit             timestamptz;

ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_einschraenkung_grund_code CHECK (
        einschraenkung_grund_code IS NULL
        OR einschraenkung_grund_code IN (
            'art18_1a_richtigkeit',
            'art18_1b_unrechtmaessig',
            'art18_1c_rechtsverteidigung_betroffener',
            'art18_1d_widerspruch'
        )
    ),
    ADD CONSTRAINT ck_endkunde_einschraenkung_kohaerenz CHECK (
        (einschraenkung_grund_code IS NULL AND gesperrt_seit IS NULL)
        OR (
            einschraenkung_grund_code IS NOT NULL
            AND gesperrt_seit IS NOT NULL
            AND verarbeitungs_status = 'gesperrt'
        )
    );

COMMENT ON COLUMN energy.endkunde.einschraenkung_grund_code IS
  'personenbeziehbar=true; pii=false (kein Klartext, geschlossener Code); art=Art.-18-Einschraenkungsgrund eines identifizierbaren pseudonymen Datensubjekts; grundlage=Art.18 DSGVO; Datenminimierung Art.5(1)(c): der differenzierte Grund bleibt INTERN, im BAFA-Nachweis-Export nur der neutrale Sammelcode datenschutzrechtliche_einschraenkung (ADR-0007 Teil C C4.6/A11); retention=an die Dauer der Einschraenkung gebunden; Loeschung NICHT ueber Krypto-Shredding (Konsistenz zu identity-Trennung, V0004/ADR-0004)';
COMMENT ON COLUMN energy.endkunde.gesperrt_seit IS
  'personenbeziehbar=true; pii=false; Zeitpunkt-Metadatum zum Art.-18-Vorgang, s. Kommentar einschraenkung_grund_code; grundlage=Art.18 DSGVO; retention=wie einschraenkung_grund_code';

ALTER TABLE energy.anschlussnutzer
    ADD COLUMN einschraenkung_grund_code text,
    ADD COLUMN gesperrt_seit             timestamptz;

ALTER TABLE energy.anschlussnutzer
    ADD CONSTRAINT ck_anschlussnutzer_einschraenkung_grund_code CHECK (
        einschraenkung_grund_code IS NULL
        OR einschraenkung_grund_code IN (
            'art18_1a_richtigkeit',
            'art18_1b_unrechtmaessig',
            'art18_1c_rechtsverteidigung_betroffener',
            'art18_1d_widerspruch'
        )
    ),
    ADD CONSTRAINT ck_anschlussnutzer_einschraenkung_kohaerenz CHECK (
        (einschraenkung_grund_code IS NULL AND gesperrt_seit IS NULL)
        OR (
            einschraenkung_grund_code IS NOT NULL
            AND gesperrt_seit IS NOT NULL
            AND verarbeitungs_status = 'gesperrt'
        )
    );

COMMENT ON COLUMN energy.anschlussnutzer.einschraenkung_grund_code IS
  'personenbeziehbar=true; pii=false (kein Klartext, geschlossener Code); art=Art.-18-Einschraenkungsgrund eines identifizierbaren pseudonymen Datensubjekts; grundlage=Art.18 DSGVO; Datenminimierung Art.5(1)(c): der differenzierte Grund bleibt INTERN, im BAFA-Nachweis-Export nur der neutrale Sammelcode datenschutzrechtliche_einschraenkung (ADR-0007 Teil C C4.6/A11); retention=an die Dauer der Einschraenkung gebunden; Loeschung NICHT ueber Krypto-Shredding';
COMMENT ON COLUMN energy.anschlussnutzer.gesperrt_seit IS
  'personenbeziehbar=true; pii=false; Zeitpunkt-Metadatum zum Art.-18-Vorgang, s. Kommentar einschraenkung_grund_code; grundlage=Art.18 DSGVO; retention=wie einschraenkung_grund_code';

-- Hinweis (nicht Gegenstand dieser Migration, s. V0023 D-SCOPE-
-- ANSCHLUSSNUTZER Punkt (3)): `energy.anschlussnutzer.verarbeitungs_status`
-- traegt weiterhin KEINEN CHECK auf seine Werteliste -- diese Migration
-- fuegt zwei NEUE, davon unabhaengige Spalten hinzu und loest die
-- vorbestehende Luecke nicht mit; das bleibt ein separater, bereits
-- dokumentierter Klaerungspunkt.

-- =====================================================================
-- (2) Verfahrenskatalog-Erweiterung (additiv, F8/D3)
-- =====================================================================

ALTER TABLE analytics.verfahren DROP CONSTRAINT ck_verfahren_art;
ALTER TABLE analytics.verfahren ADD CONSTRAINT ck_verfahren_art CHECK (
    art IN ('bereinigung', 'baseline', 'einsparaggregation', 'nachweispruefung', 'exportschema')
);

INSERT INTO analytics.verfahren (code, art, beschreibung) VALUES
    ('einsparung_foerderjahr_kap91', 'einsparaggregation',
     'Foerderjahres-Einsparaggregation nach Technischem Merkblatt v2.2 Kap. 9.1 (ADR-0007 B13): Summe der Monats-Deltas (R_m - A_m) je (Endkunde, Energietraeger), Verrechnung von Mehrverbrauch OHNE Kappung, Ausschluss nicht_ausweisbarer Monate, Jahres-Abdeckungsfloor, Portfolio-Verrechnung ueber alle Endkunden.'),
    ('foerderjahr_preflight_de02', 'nachweispruefung',
     'Vollstaendigkeits-Preflight je Foerderjahr (DE-02, ADR-0007 B4): Regel-Startsatz FJ-01..FJ-09, FJ-07 gemaess Auflage A11 in FJ-07a/b/c differenziert (Art.-18-Sperre wird zum Paar-Ausschluss, kein Foerderjahr-Blocker mehr), FJ-08 gemaess Auflage A20 auf den DWD-Aenderungsvermerk erweitert.'),
    ('nachweis_export_kanonisch', 'exportschema',
     'Kanonisches Export-Dateibuendel je Einspar-Lauf (ADR-0007 D5/B5): deterministisch gerenderte CSV-Dateien (optional CSV+XLSX) je DE-03-Kategorie plus Metablatt und Manifest, KEINE Byte-Ablage (O-B10) -- nur Metadaten/Hashes in nachweis.export/export_datei.');

INSERT INTO analytics.verfahren_version
    (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
VALUES
    -- (a) einsparung_foerderjahr_kap91@1 -- B13/B14-Konstanten + B13.6-Golden-Vectors
    (gen_random_uuid(), 'einsparung_foerderjahr_kap91', 1,
    $params$
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "urn:edms:nachweis:verfahren:einsparung_foerderjahr_kap91:1",
      "type": "object",
      "additionalProperties": false,
      "required": ["abdeckungsfloor_pct", "vorzeichenregel", "lueckenregel", "portfolio_verrechnung"],
      "properties": {
        "abdeckungsfloor_pct": {"type": "number", "default": 75, "minimum": 0, "maximum": 100,
          "status": "bestaetigt (ADR-0007 B14/O-B2)",
          "beschreibung": "Jahres-Mindestabdeckung ausweisbarer Monate (B13.3): |M_FJ_ausweisbar|/|M_FJ| >= Floor => eingeschraenkt ausweisbar, sonst nicht_nachweisbar (E=NULL). Bewusst Parameter, nicht Literal (B14)."},
        "vorzeichenregel": {"type": "string", "const": "verrechnung_ohne_kappung",
          "status": "bestaetigt (ADR-0007 B13.2, Merkblatt v2.2 Kap. 9.1 Satz 2/3)",
          "beschreibung": "Mehrverbrauch (A_m > R_m) geht mit negativem Delta ein und wird MIT den Einsparungen anderer Monate/Endkunden verrechnet; KEIN max(Delta,0) auf keiner Ebene. Eine Kappung waere eine abstimmungspflichtige andere Berechnungsmethode (Kap. 9.1 Satz 4)."},
        "lueckenregel": {"type": "string", "const": "ausschluss_nicht_ausweisbar",
          "status": "bestaetigt (ADR-0007 B13.3)",
          "beschreibung": "nicht_ausweisbare Monate werden aus der Summe ausgeschlossen (zeitanteilig, Kap. 9.1 Satz 2) -- NICHT mit 0 gefuellt, NICHT hochgerechnet."},
        "portfolio_verrechnung": {"type": "boolean", "const": true,
          "status": "bestaetigt (ADR-0007 B13.1, Merkblatt v2.2 Kap. 9.1 Satz 3)",
          "beschreibung": "E_t^{FJ,ZE} = Summe der E_{k,t}^{FJ} ueber alle Endkunden -- OHNE 0-Kappung negativer Endkundenjahre vor der Summierung."},
        "rundung_nachkommastellen": {"type": "integer", "default": 3,
          "beschreibung": "Ausweisgrenze numeric(18,3), Konvention ADR-0006 B12/witterung-gtz.ts (B13.5) -- kein Zwischenrunden."}
      }
    }
    $params$::jsonb,
    $vectors$
    [
      {"vektor": "GV1", "beschreibung": "Normalfall: alle Monate belastbar",
       "ebene": "endkunde_traeger_jahr", "monate_delta_kwh": {"2027-01": 200, "2027-02": 150, "2027-03": 20, "2027-04": 20},
       "monate_qualitaet": {"2027-01": "belastbar", "2027-02": "belastbar", "2027-03": "belastbar", "2027-04": "belastbar"},
       "erwartete_einsparung_kwh": 390.000, "abdeckung_pct": 100, "jahres_qualitaetsstufe": "belastbar"},
      {"vektor": "GV2", "beschreibung": "Mehrverbrauch im Februar (R=1100, A=1300) -- Regressionsschutz gegen Kappung",
       "ebene": "endkunde_traeger_jahr", "monate_delta_kwh": {"2027-01": 200, "2027-02": -200, "2027-03": 20, "2027-04": 20},
       "monate_qualitaet": {"2027-01": "belastbar", "2027-02": "belastbar", "2027-03": "belastbar", "2027-04": "belastbar"},
       "erwartete_einsparung_kwh": 40.000, "abdeckung_pct": 100, "jahres_qualitaetsstufe": "belastbar",
       "regressionsschutz_hinweis": "eine Kappung max(Delta,0) ergaebe fehlerhaft 240,000 (B13.2)"},
      {"vektor": "GV3", "beschreibung": "Luecke an der Floor-Grenze: Februar nicht_ausweisbar, 3/4=75% Abdeckung",
       "ebene": "endkunde_traeger_jahr", "monate_delta_kwh": {"2027-01": 200, "2027-03": 20, "2027-04": 20},
       "ausgeschlossene_monate": ["2027-02"],
       "erwartete_einsparung_kwh": 240.000, "abdeckung_pct": 75, "jahres_qualitaetsstufe": "eingeschraenkt"},
      {"vektor": "GV4", "beschreibung": "Floor unterschritten: Februar+Maerz nicht_ausweisbar, 2/4=50% Abdeckung",
       "ebene": "endkunde_traeger_jahr", "monate_delta_kwh": {"2027-01": 200, "2027-04": 20},
       "ausgeschlossene_monate": ["2027-02", "2027-03"],
       "erwartete_einsparung_kwh": null, "abdeckung_pct": 50, "jahres_qualitaetsstufe": "nicht_nachweisbar",
       "regressionsschutz_hinweis": "E bleibt NULL, NICHT 220,000, obwohl aus den verbleibenden Monaten arithmetisch berechenbar (B13.3)"},
      {"vektor": "GV5", "beschreibung": "Energietraeger-Substitution erkannt -- unabhaengig von der Monats-Datenqualitaet",
       "ebene": "endkunde_traeger_jahr", "monate_delta_kwh": {"2027-01": 200, "2027-02": 150, "2027-03": 20, "2027-04": 20},
       "status": "ausgeschlossen", "ausschluss_grund_code": "energietraeger_substitution_v1_nicht_unterstuetzt",
       "erwartete_einsparung_kwh": null,
       "hinweis": "Endkunde bleibt in der Export-Liste sichtbar (DE-02), kein Zahlenwert -- unabhaengig davon, dass alle Monate belastbar waeren (B13.4/B14)"},
      {"vektor": "GV6", "beschreibung": "Portfolio-Verrechnung ueber drei Endkunden -- Regressionsschutz gegen Kappung auf Portfolioebene",
       "ebene": "portfolio_jahr", "endkunden_einsparung_kwh": {"A": 390.000, "B": -150.000, "C": 40.000},
       "erwartete_n_t": 3, "erwartete_portfolio_einsparung_kwh": 280.000,
       "regressionsschutz_hinweis": "eine Kappung von B auf 0 ergaebe fehlerhaft 430,000 -- widerspricht Kap. 9.1 Satz 3 (B13.1/B13.6)"}
    ]
    $vectors$::jsonb,
    'Golden-Vector-Startsatz B13.6 (savings-engineer, 2026-08-20): GV1 Normalfall, GV2 Mehrverbrauch/Vorzeichenregel, GV3 Floor-Grenze, GV4 Floor unterschritten, GV5 Substitutions-Erkennung, GV6 Portfolio-Verrechnung. Kanonische Quelle bleibt tests/golden/verfahren/einsparung_foerderjahr_kap91@1.json (D-GV-Muster V0019, Datei selbst NICHT Teil dieser Migration). N_t^{FJ}-Definition (O-B14) und Substitutions-Erkennungsmerkmal am Messkonzept (O-B3b) bleiben fachlich offen -- GV5/GV6 pruefen nur die Aggregation, nicht die Erkennung/Zaehlung selbst.',
    true, now()),

    -- (b) foerderjahr_preflight_de02@1 -- B4-Regelkatalog + A11-Differenzierung + A20-Erweiterung
    (gen_random_uuid(), 'foerderjahr_preflight_de02', 1,
    $params$
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "urn:edms:nachweis:verfahren:foerderjahr_preflight_de02:1",
      "type": "object",
      "additionalProperties": false,
      "required": ["regeln"],
      "properties": {
        "regeln": {
          "type": "object",
          "additionalProperties": false,
          "beschreibung": "Preflight-Regel-Startsatz (ADR-0007 B4-Tabelle). FJ-07 gemaess Auflage A11 (C2/C3/C4) durch FJ-07a/b/c ERSETZT -- die urspruengliche, undifferenzierte FJ-07 (Foerderjahr-Blocker bei JEDER Art.-18-Sperre) ist eine Fehlkonstruktion (C2, 'eine Kontrolle, die zu ihrer eigenen Umgehung draengt, ist keine') und wird hier NICHT mehr gefuehrt. FJ-08 gemaess Auflage A20 auf den DWD-Aenderungsvermerk erweitert.",
          "properties": {
            "FJ-01": {"const": "blocker", "beschreibung": "Foerderjahr-Definition vorhanden, Monatsmenge nicht leer"},
            "FJ-02": {"const": "blocker", "beschreibung": "je erwartetem Paar x Monat genau eine Bindung aufloesbar (D2)"},
            "FJ-03": {"const": "blocker", "beschreibung": "gebundener Monat nicht_ausweisbar ohne dokumentierte Behandlung (F3)"},
            "FJ-04": {"const": "warnung", "beschreibung": "gebundener Monat eingeschraenkt bzw. tage_fehlend > 0 -- Pflichtausweis im Metablatt (TB-04/TB-09)"},
            "FJ-05": {"const": "blocker", "beschreibung": "mehrdeutige Lauf-Kandidatenlage mit ABWEICHENDEN Werten (D2) -- Widerspruch in der Rechenhistorie"},
            "FJ-06": {"const": "warnung", "status": "bestaetigt (ADR-0007 B14, Weg b)",
              "beschreibung": "Substitutionsfall im Umfang -- Weg (b): Warnung + Teilmengen-Ausweis (status=ausgeschlossen, ausschluss_grund_code=energietraeger_substitution_v1_nicht_unterstuetzt). Weg (a) (Blocker) wurde durch B14 verworfen -- Substitution wird in v1 NICHT gerechnet."},
            "FJ-07a": {"const": "kein_befund", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "verarbeitungs_status=geloescht (Art. 17 vollzogen) -- KEIN Befund, regulaerer Ausweis. 'kein_befund' ist absichtlich KEIN Wert der preflight_befund.schwere-Domaene (blocker|warnung|hinweis) -- diese Zeile erzeugt strukturell GAR KEINE Befund-Zeile."},
            "FJ-07b": {"const": "warnung", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "Art.18(1)(a)/(1)(c) (einschraenkung_grund_code=art18_1a_richtigkeit|art18_1c_rechtsverteidigung_betroffener) -- Ausweis MIT Kennzeichnung, Paar bleibt status=ausgewiesen. OFFENER PUNKT: die konkrete Kennzeichnungs-Spalte am Ergebnis-Artefakt ist NICHT Teil von V0025 -- s. Migrations-Kommentar dort."},
            "FJ-07c": {"const": "blocker", "status": "bestaetigt (Auflage A11)",
              "beschreibung": "Art.18(1)(b)/(1)(d) (einschraenkung_grund_code=art18_1b_unrechtmaessig|art18_1d_widerspruch) -- PAAR-Ausschluss (status=ausgeschlossen, ausschluss_grund_code=datenschutzrechtliche_einschraenkung). Blocker-Schwere bezieht sich auf das PAAR, NICHT mehr auf das gesamte Foerderjahr (C2: Kernkorrektur von A11)."},
            "FJ-08": {"const": "blocker", "status": "erweitert (Auflage A20)",
              "beschreibung": "Attributions-Vorbedingung: DWD_QUELLENVERMERK UND DWD_AENDERUNGSVERMERK (zentrale Konstante src/backend/src/berechnung/klima/dwd-quellenvermerk.const.ts) duerfen KEINEN Platzhalter-Marker tragen -- NUR wenn tatsaechlich DWD-Klimadaten (nicht Grundlast-/Synthetik-Laeufe) in mindestens einen gebundenen Lauf eingegangen sind (bedingte Attribution, sonst Falschangabe, A20)."},
            "FJ-09": {"const": "blocker", "beschreibung": "Lauf/Umfang enthaelt synthetische Daten (synthetic=true) -- Blocker NUR fuer art=foerderjahr_nachweis"}
          }
        }
      }
    }
    $params$::jsonb,
    '[]'::jsonb,
    'Preflight-Regelkatalog (ADR-0007 B4) mit den zwei fuer diese Migrationsgruppe blockierenden Compliance-Auflagen bereits eingearbeitet: A11 (FJ-07 -> FJ-07a/b/c) und A20-Teil (FJ-08 -> DWD_AENDERUNGSVERMERK). golden_vectors bewusst leer: es existiert noch KEIN Preflight-Ausfuehrungsmotor im Repo (Preflight-Service ist spaeterer savings-engineer/bafa-export-engineer-Baustein) -- ein Golden-Fixture-Startsatz waere an dieser Stelle spekulativ. Fachlich weiterhin offen: FJ-07b-Kennzeichnungsmechanik (s. V0025), Mindestabdeckungs-/Schwellenwerte ausserhalb des B14-bestaetigten 75%-Floors (O-B2), Substitutions-Erkennungsmerkmal (O-B3/O-B3b).',
    true, now()),

    -- (c) nachweis_export_kanonisch@1 -- NUR Struktur-Slot, Spaltenprofil haengt an O-B8
    (gen_random_uuid(), 'nachweis_export_kanonisch', 1,
    $params$
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "urn:edms:nachweis:verfahren:nachweis_export_kanonisch:1",
      "type": "object",
      "additionalProperties": false,
      "required": ["format_optionen", "kategorien"],
      "properties": {
        "format_optionen": {"type": "array", "items": {"type": "string", "enum": ["csv", "csv+xlsx"]},
          "default": ["csv", "csv+xlsx"],
          "beschreibung": "D5: kanonischer CSV-Satz ist IMMER die Nachweisgrundlage; XLSX ist optionale, nicht-bit-stabile Empfaenger-Beilage aus demselben Renderer."},
        "kategorien": {"type": "array", "items": {"type": "string",
            "enum": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "meta"]},
          "const": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "meta"],
          "beschreibung": "DE-03-Kategorien (D5-Tabelle), deckungsgleich mit dem DB-CHECK auf nachweis.export_datei.kategorie (V0025)."},
        "spaltenprofil": {"type": "null", "const": null,
          "status": "NICHT Teil dieser Migration -- O-B8 offen",
          "beschreibung": "Das spaltenscharfe Positivlisten-Profil je Datei (D6/A15: 'Der Renderer schreibt ausschliesslich Spalten, die im spaltenprofil der export_schema_version stehen') haengt an der noch offenen CSV-Konvention O-B8 (Encoding, Trennzeichen, Dezimaltrenner, bafa-export-engineer + User). Diese Migration ERFINDET das Profil NICHT -- Nachtragsmigration (neue Nummer) erforderlich, BLOCKIEREND vor dem ersten echten Export (A15)."},
        "entitaetsfreie_dateinamen": {"type": "boolean", "const": true,
          "beschreibung": "A19 wird UNABHAENGIG von diesem parameter_schema bereits als DB-CHECK auf nachweis.export_datei.dateiname (geschlossene, kategoriebasierte Liste) erzwungen -- staerker als ein JSON-Schema, keine Duplizierung hier."}
      }
    }
    $params$::jsonb,
    '[]'::jsonb,
    'Struktur-Slot fuer das Export-Dateibuendel-Schema (D5). Spaltenprofil je Datei bewusst NICHT gesetzt (O-B8 offen, Auflage A15 vor erstem echten Export). golden_vectors bewusst leer -- ein Golden-Export-Fixture (A15) ist erst mit dem konkreten Spaltenprofil sinnvoll definierbar.',
    true, now());
