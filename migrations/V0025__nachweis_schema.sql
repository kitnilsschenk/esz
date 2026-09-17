-- V0025__nachweis_schema.sql
--
-- ADR-Bezug: docs/adr/ADR-0007-einsparberechnung-bafa-export.md Teil B
-- (B1-B14, insbes. B9 Schema-Skizze, B10 API/ABAC/Audit, B11 Rollen/Grants/
-- Retention, B13/B14 Rechenmodell) und Teil C (Phase-3-Compliance-Review,
-- Auflagen A11-A23). Direkter Arbeitsauftrag (database-lead), NUR ENTWURF
-- -- kein Apply gegen die Dev-DB, keine Migrations-Ausfuehrung ausserhalb
-- eines Wegwerf-Testcontainers. ADR-0007 bleibt "proposed" bis technical-
-- director-/User-Freigabe. Voraussetzung: V0024 (A11-Schema-Delta +
-- Verfahrenskatalog-Erweiterung) MUSS vor dieser Datei angewendet sein --
-- die FKs auf analytics.verfahren_version (art=einsparaggregation|
-- nachweispruefung|exportschema) haben sonst kein gueltiges Ziel.
--
-- Sechs der dreizehn Phase-3-Auflagen sind laut Arbeitsauftrag "blockierend
-- vor Implementierung" und HIER umgesetzt: A11 (Wirkung im nachweis-Schema
-- -- die Schema-Struktur selbst liegt in V0024), A13, A14, A15, A19, A20
-- (nur der export-seitige Teil -- der Preflight-/FJ-08-Teil liegt in
-- V0024), A16 (nur die STRUKTUR -- die Frist selbst bleibt offen, s. u.).
--
-- =====================================================================
-- Warum ein EIGENER Namensraum `nachweis` -- NICHT `analytics` (D3/F8)
-- =====================================================================
-- ADR-0006 B1 hatte "ADR-0007 haengt seine Einspar-/Export-Laeufe neben
-- analytics" VORWEGGENOMMEN -- diese Vorwegnahme datiert vor den Auflagen
-- A6/A7 und kennt den entscheidenden Unterschied noch nicht: `analytics`-
-- Laeufe sind grundsaetzlich loeschbar (edms_retention haelt DELETE auf
-- sieben Tabellen, V0019), `nachweis`-Artefakte sind an die Einreichung
-- gebunden und duerfen von einem Analytics-Retention-Lauf NIE erfasst
-- werden. Innerhalb EINES Schemas waere das nur durch tabellengenaue
-- Grant-Disziplin gesichert -- `GRANT ... ON ALL TABLES IN SCHEMA` ist das
-- haeufigste reale Least-Privilege-Leck; getrennte Schemata machen den
-- Fehlgriff FOLGENLOS (B3). Der Verfahrenskatalog wird dagegen GETEILT,
-- NICHT dupliziert (V0024) -- er ist "ewig gueltig" (V0019 D-A6-RETENTION)
-- und faellt daher nicht unter dieses Trennungsargument.
--
-- =====================================================================
-- A19 -- Rollen-/Grant-Architektur (VOLLTEXT-Begruendung, Kern des Reviews)
-- =====================================================================
-- Der tragende Befund aus Teil C C2: "'nachweis.export_pseudonym' unter
-- edms_app ist keine geschuetzte Bruecke -- 'Nur der Renderer, und der
-- laeuft als edms_app' ist eine Aussage ueber CODE, keine ueber GRANTS."
-- Vier Rollen (alle NOLOGIN, Muster V0003/V0010/V0019/V0020):
--
--   edms_nachweis_owner    -- Eigentuemerin ALLER nachweis-Objekte. NICHT
--                              edms_app (A6a-Analogie: sonst greift REVOKE
--                              FROM PUBLIC gegen den Owner nicht).
--   edms_app               -- INSERT+SELECT auf ZEHN der elf Artefakt-
--                              tabellen (ALLE AUSSER export_pseudonym --
--                              A19 woertlich: "edms_app bekommt darauf
--                              keinen Grant"), NIRGENDS UPDATE/DELETE;
--                              zusaetzlich INSERT/SELECT/UPDATE (kein
--                              DELETE) auf die zwei mutablen Bookkeeping-
--                              Tabellen.
--   edms_nachweis_renderer -- haelt als EINZIGE Rolle SELECT/INSERT auf
--                              `export_pseudonym` (A19 woertlich) UND
--                              zusaetzlich SELECT auf die Lauf-/Ergebnis-
--                              Artefakte, die der Renderer lesen muss
--                              (einsparlauf/_bindung/_ergebnis), SELECT+
--                              INSERT auf export/export_datei (D5: der
--                              Download-Endpunkt rendert neu und
--                              VERIFIZIERT vor Auslieferung -- braucht also
--                              SELECT), sowie MITGLIEDSCHAFT in der
--                              bereits vorhandenen edms_analytics_detail_
--                              reader (V0019 D-A6-DETAIL-READER nennt
--                              ADR-0007 ausdruecklich als erwarteten
--                              Konsumenten; B11: "Rollen-Mitgliedschaft
--                              statt Grant-Wildwuchs"). Diese vier Objekte
--                              (export/export_datei/export_pseudonym +
--                              Detail-Snapshot-Mitgliedschaft) bekommt
--                              edms_app AUSDRUECKLICH NICHT -- der gesamte
--                              Export-Rendering-/Auslieferungspfad laeuft
--                              unter einer EIGENEN DB-Rolle/einem eigenen
--                              Connection-Pool (Praezedenz `edms_einfluss`,
--                              V0020 D-ROLLE), NICHT unter edms_app.
--                              Begruendung fuer diesen (ueber den woertlichen
--                              A19-Satz "haelt als einzige SELECT/INSERT
--                              auf export_pseudonym" hinausgehenden)
--                              Zuschnitt: B11 beschreibt die Mitgliedschaft
--                              in edms_analytics_detail_reader ausdruecklich
--                              fuer "den Export-Renderer" -- WAERE der
--                              Renderer identisch mit edms_app, waere diese
--                              Mitgliedschaft ein Aussage-loses No-Op (edms_
--                              app haelt aus V0019 bereits DIREKTE SELECT-
--                              Grants auf genau diese Detail-Tabellen).
--                              Nur wenn der Renderer eine ECHTE, von edms_app
--                              GETRENNTE Rolle ist, hat B11s Satz ueberhaupt
--                              Wirkung -- das bestaetigt strukturell, dass
--                              A19 mehr verlangt als nur "eine Tabelle
--                              umziehen".
--   edms_nachweis_reader   -- NUR SELECT auf Lauf-, Ergebnis- und
--                              Einreichungsartefakte (B11 woertlich:
--                              foerderjahr/preflight/preflight_befund/
--                              einsparlauf/einsparlauf_bindung/
--                              einsparlauf_ergebnis/einreichung/
--                              einreichung_differenz) -- AUSDRUECKLICH
--                              OHNE export/export_datei/export_pseudonym
--                              (B10: read:nachweis_export ist eine STRENGER
--                              gehaertete, eigene PolicyAction, "ausschliess-
--                              lich an das Betriebs-/Nachweis-Team", nicht
--                              Teil einer generischen Lese-Rolle).
--
--   edms_retention         -- KEIN DELETE auf `nachweis.*` in v1 (A16/O-B7:
--                              die Frist ist offen, "ein Grant, den niemand
--                              braucht, ist nur ein Risiko"). Zusaetzlich
--                              NUR SELECT auf einsparlauf_bindung (B11:
--                              "damit ein Retention-Lauf die Nachweis-
--                              bindung eines analytics-Laufs UNABHAENGIG
--                              vom mutablen Flag verifizieren kann").
--
-- REVOKE UPDATE, DELETE FROM PUBLIC auf ALLEN ELF Artefakttabellen
-- (append-only, Muster V0013/V0019).
--
-- =====================================================================
-- Weitere Entscheidungen mit Begruendung (ueber die woertliche B9-Skizze
-- hinaus)
-- =====================================================================
--
-- (D-EXPORT-ANFRAGE-REF) `nachweis.export` bekommt eine NEUE Spalte
--   `anfrage_ref text` -- in der B9-Skizze existierte dieses Feld NUR auf
--   `nachweis.einreichung`. Die A13-CHECK-Vorgabe des Arbeitsauftrags
--   ("station_darstellung='klarname' => anfrage_ref IS NOT NULL") kann
--   sich aber NUR auf eine Spalte DERSELBEN Tabelle beziehen wie
--   station_darstellung/zweck (export) -- ein CHECK kann nicht schema-
--   uebergreifend auf eine noch gar nicht existierende einreichung
--   verweisen (Export entsteht in der Pipeline VOR Einreichung, Preflight
--   -> Lauf -> Export -> Einreichung, B4/D7). Die Datenschutz-
--   Ermessensentscheidung "Klarname" (A21: Zweitfreigabe-pflichtig) faellt
--   strukturell BEIM Export (create:nachweis_export, B10), nicht erst bei
--   der Einreichung -- die Aktenzeichen-Referenz gehoert also dorthin.
--
-- (D-A14-GENERATED) `de04_auszug` wird NICHT mehr als eigenstaendiges
--   Feld gesetzt (B9-Skizze: `boolean NOT NULL DEFAULT false`), sondern
--   als `GENERATED ALWAYS AS (zweck = 'wissenschaftliche_auswertung')
--   STORED` -- STRIKTER als ein CHECK: ein GENERATED-Spalte kann gar nicht
--   erst mit einem widersprechenden Wert versehen werden (ein INSERT, der
--   de04_auszug explizit angibt, schlaegt grundsaetzlich fehl, unabhaengig
--   vom Wert). Das ist woertlich "DB-seitig abgeleitet", nicht nur
--   "CHECK-erzwungen" (Auftrag nennt beide Optionen, GENERATED ist die
--   staerkere).
--
-- (D-A14-FAILCLOSED) Ein ZWEITER, separat benannter CHECK
--   (`ck_export_zweck_wiss_auswertung_gesperrt`) sperrt
--   `zweck='wissenschaftliche_auswertung'` vollstaendig, bis A23 geklaert
--   ist (Empfaenger/Rolle/Rechtsgrundlage, ggf. AVV). Bewusst als EIGENE,
--   von der Werteliste getrennte Constraint: eine kuenftige Migration kann
--   GENAU DIESEN einen CHECK per `DROP CONSTRAINT` entfernen, sobald A23
--   geklaert ist, ohne die Werteliste selbst anzufassen.
--
-- (D-A11-AUSSCHLUSSGRUND) `ausschluss_grund_code` (nur bei
--   status='ausgeschlossen') ist EIN geschlossene-Liste-Textfeld mit DREI
--   Werten (Arbeitsauftrag woertlich): `datenschutzrechtliche_
--   einschraenkung` (FJ-07c, C4: neutraler Sammelcode, der differenzierte
--   Art.-18-Grund bleibt INTERN in energy.*), `energietraeger_
--   substitution_v1_nicht_unterstuetzt` (FJ-06/B13.4/B14, Weg b),
--   `nicht_nachweisbar` (struktureller Sammelcode fuer sonstige, NICHT
--   floor-bedingte Nicht-Nachweisbarkeit -- ABSICHTLICH derselbe
--   Zeichenkettenwert wie der STATUS `nicht_nachweisbar`, aber eine
--   ANDERE Spalte/ein anderer Zustand: `status='nicht_nachweisbar'` OHNE
--   Grund-Code = Floor B13.3 unterschritten (< 75% Monatsabdeckung, rein
--   rechnerisch); `status='ausgeschlossen'` MIT
--   `ausschluss_grund_code='nicht_nachweisbar'` = das Paar konnte aus
--   ANDEREN strukturellen Gruenden gar nicht in die Aggregation eingehen
--   (z. B. kein bindbarer Berechnungslauf trotz FJ-02-Ausnahme, kein
--   gueltiges Messkonzept im Foerderjahr). Die exakte fachliche Grenze
--   zwischen diesen beiden Faellen ist NICHT Gegenstand dieser Migration
--   -- Bestaetigung durch savings-engineer offen, s. Dateiende.
--   B13.4s Formulierung "eigener Status nicht_nachweisbar_substitution"
--   wird HIER bewusst NICHT als vierter STATUS-Wert uebernommen, sondern
--   als status='ausgeschlossen' + der zweite Ausschlussgrund abgebildet --
--   konsistent mit dem woertlichen Arbeitsauftrag fuer diese Migration und
--   ohne den status-Enum ueber die B9-Skizze hinaus zu erweitern.
--
-- (D-A11-KENNZEICHNUNG-OFFEN) FJ-07b ("Ausweis MIT Kennzeichnung" fuer
--   Art.18(1)(a)/(1)(c)) braucht strenggenommen eine eigene Markierungs-
--   Spalte an `einsparlauf_ergebnis`, DAMIT die Kennzeichnung im Export
--   nachvollziehbar transportiert werden kann. Diese Spalte ist NICHT
--   Teil des Arbeitsauftrags fuer V0025 und wird HIER BEWUSST NICHT
--   erfunden -- s. "OFFENER PUNKT FJ-07b" am Dateiende.
--
-- (D-A19-DATEINAMEN) EIN CHECK auf `export_datei.dateiname` erfuellt
--   ZWEI Zwecke zugleich: (i) geschlossene, entitaetsfreie Namensliste
--   (A19 -- kein Pseudonym kann jemals Bestandteil sein, weil die Menge
--   der zulaessigen Namen VOLLSTAENDIG und STATISCH ist, keine
--   Konkatenation/Variable), (ii) Konsistenz zwischen `kategorie` und dem
--   Dateinamen (D5-Tabelle: welche Datei gehoert zu welcher DE-03-
--   Kategorie). Basisnamen woertlich aus der D5-Tabelle uebernommen
--   (rohdaten_messwert_tag, baseline_lauf, baseline_klima_tag,
--   einflussgroessen_intervall, einspardaten_monat, einspardaten_jahr,
--   metablatt, manifest) PLUS `einspardaten_differenz` -- dieser NEUNTE
--   Name ist eine database-lead-ERGAENZUNG (B7 nennt nur "eigene Datei in
--   Kategorie einspardaten" fuer den Differenz-Report einer Korrektur-
--   Einreichung, OHNE einen konkreten Dateinamen zu nennen) und VOR O-B8
--   nicht endgueltig -- s. Dateiende. Erlaubte Endungen `.csv`/`.xlsx`
--   (D5: kanonisches CSV + optionale XLSX-Beilage).
--
-- (D-EINREICHUNG-DIFFERENZ-PK) Die B9-Skizze setzt
--   `PRIMARY KEY (einreichung_id, endkunde_id, energietraeger, monat)` bei
--   gleichzeitig NULLABLE `monat` -- ein struktureller Widerspruch:
--   PostgreSQL erzwingt auf JEDER Primary-Key-Spalte automatisch NOT NULL,
--   aber B7 beschreibt die Differenzzeile ausdruecklich als "je (Endkunde,
--   Energietraeger [, Monat])" -- die eckige Klammer signalisiert, dass
--   Monat bei einer JAHRES-Differenz FEHLEN darf. Aufgeloest durch einen
--   SURROGAT-PK (uuid, Repo-Konvention) + ZWEI Unique-Constraints: die
--   erste deckt den monatsscharfen Fall, die zweite (partieller Unique-
--   Index `WHERE monat IS NULL`) verhindert mehrere "Jahres-Ebene"-Zeilen
--   je (einreichung, endkunde, energietraeger). Ohne diese Korrektur
--   waere entweder Monat niemals NULL (Bruch von B7) oder es koennten sich
--   beliebig viele Jahres-Differenzzeilen je Paar ansammeln (NULL <>
--   NULL in UNIQUE-Semantik).
--
-- (D-BEFUND-ENDKUNDE-FK) `preflight_befund.endkunde_id` und
--   `einreichung_differenz.endkunde_id` bekommen -- ueber die woertliche
--   B9-Skizze hinaus, die hier keine FK-Referenz zeigt -- eine
--   `REFERENCES energy.endkunde(id)` (nullable bei preflight_befund, wie
--   in der Skizze; NOT NULL bei einreichung_differenz, wie in der Skizze).
--   Begruendung: Konsistenz zu JEDER anderen pseudonym-referenzierten
--   endkunde_id-Spalte in diesem Schema (einsparlauf_bindung/_ergebnis
--   HABEN diese FK bereits in der Skizze) -- referenzielle Integritaet
--   ist hier ohne Zusatzkosten erreichbar (kein Cross-Schema-/Zyklus-
--   Problem) und schliesst eine sonst willkuerlich wirkende Ausnahme.
--
-- (D-EINREICHUNG-BACKSTOP) Fail-closed `BEFORE INSERT`-Trigger auf
--   `nachweis.einreichung`, Muster/Praezedenz V0023 (`analytics.
--   pruefe_endkunde_sperre`): prueft `einsparlauf.art='foerderjahr_
--   nachweis' AND NOT synthetic AND preflight.ergebnis='gruen'`. Diese
--   Pruefung ist in B7/D7 ALS Backstop AUSDRUECKLICH gefordert ("Backstop
--   als BEFORE INSERT-Trigger, Praezedenz V0023 -- die App-Pruefung allein
--   waere wieder ein P4-Fall") und -- anders als V0023s Anschlussnutzer-
--   Luecke -- OHNE offene Fachentscheidung sofort baubar: alle drei
--   gepruefte Spalten (einsparlauf.art/synthetic, preflight.ergebnis)
--   sind bereits in DIESER Migration final definiert. Anders als V0023
--   braucht diese Funktion KEIN zusaetzliches Cross-Schema-GRANT: sie
--   liest ausschliesslich aus `nachweis.einsparlauf`/`nachweis.preflight`,
--   beide bereits Eigentum von `edms_nachweis_owner` (dem SECURITY-
--   DEFINER-Funktionseigentuemer selbst).
--
-- (D-KEINE-HYPERTABLES) Wie V0019: Zugriffspfad ist immer "ein Lauf/ein
--   Export vollstaendig", nicht "Zeitfenster ueber viele Entitaeten".
--   Volumengroessenordnung (B9, woertlich): einsparlauf_bindung ~= Paare x
--   12 Zeilen/Jahr (10^3-10^4), die Export-Rohdatenkategorie LIEST bereits
--   vorhandene analytics-Snapshots, speichert selbst nichts (O-B10).
--   Gewoehnliche B-Tree-Tabellen sind hier das passende Muster.
--
-- (D-CONTENT-ADDRESSED) "Content-addressed Dedup wo sinnvoll" (V0019-
--   Muster `eingang_snapshot`) ist HIER BEREITS strukturell erreicht, ohne
--   eine zusaetzliche Snapshot-Tabelle: `manifest_hash`/`datei_hash` SIND
--   die Content-Adressierung (D5/O-B10 -- "die Bytes werden nicht
--   gespeichert", nur Hashes ueber deterministisch reproduzierbare
--   Dateien). Eine eigene `nachweis.eingang_snapshot`-Analogie entsteht
--   erst mit der (hier NICHT gebauten) Primaerenergie-Faktorschicht (B8,
--   `nachweis.eingang_snapshot`/`eingang_energiefaktor`) -- ausdruecklich
--   nicht Teil dieser Migration (F4b/O-B3 -- Weg b, B14).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> nachweis.set_updated_at() -> foerderjahr -> preflight(+befund)
-- -> einsparlauf -> einsparlauf_bindung -> einsparlauf_ergebnis -> export
-- -> export_datei -> einreichung(+Backstop-Trigger) -> einreichung_
-- differenz -> export_pseudonym -> einsparlauf_auftrag (+Trigger) ->
-- einsparlauf_retention_status (+Trigger) -> Indizes -> PII-Kommentare ->
-- REVOKE (A19) -> Rollen (idempotente DO-Bloecke) -> Ownership -> GRANTS
-- (A19, Volltext).

CREATE SCHEMA nachweis;   -- pseudonym, PII-frei (personenbeziehbar via
                          -- Pseudonym-Referenzen, s. PII-Kommentare unten);
                          -- FKs nach energy/analytics zulaessig (D3).

CREATE FUNCTION nachweis.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- D4/B4 -- Foerderjahr-Stammdaten (O1: parametrisiert, nie hart verdrahtet)
-- =====================================================================

CREATE TABLE nachweis.foerderjahr (
    id              uuid PRIMARY KEY,
    code            text NOT NULL UNIQUE,          -- z. B. 'FJ-2027'
    vorhaben_ref    text NOT NULL,                  -- Aktenzeichen/Bescheid-Bezug, Slot, KEIN FK
    nummer          int  NOT NULL,                  -- Projektjahr 1..5 (TB-05-kompatibel)
    von_monat       date NOT NULL,
    bis_monat       date NOT NULL,
    definition_quelle text NOT NULL,                -- kalenderjahr|bewilligungszeitraum (O1)
    bescheid_ref    text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_foerderjahr_von_monat_erster CHECK (von_monat = date_trunc('month', von_monat)::date),
    CONSTRAINT ck_foerderjahr_bis_monat_erster CHECK (bis_monat = date_trunc('month', bis_monat)::date AND bis_monat >= von_monat),
    CONSTRAINT ck_foerderjahr_definition_quelle CHECK (definition_quelle IN ('kalenderjahr', 'bewilligungszeitraum')),
    CONSTRAINT ck_foerderjahr_nummer CHECK (nummer >= 1)
);

-- =====================================================================
-- D4/B4 -- Vollstaendigkeits-Preflight (DE-02, M2), append-only
-- =====================================================================

CREATE TABLE nachweis.preflight (
    id                    uuid PRIMARY KEY,
    foerderjahr_id        uuid NOT NULL REFERENCES nachweis.foerderjahr(id),
    profil_code           text NOT NULL,
    profil_version        int  NOT NULL,             -- analytics.verfahren_version (art=nachweispruefung, V0024)
    ergebnis              text NOT NULL,              -- gruen|rot
    blocker_anzahl        int  NOT NULL,
    warnung_anzahl        int  NOT NULL,
    hinweis_anzahl        int  NOT NULL,
    umfang_paare_anzahl   int  NOT NULL,
    monate_erwartet       int  NOT NULL,
    synthetic             boolean NOT NULL,
    ausgefuehrt_at        timestamptz NOT NULL DEFAULT now(),
    ausgefuehrt_von_sub   text NOT NULL,
    FOREIGN KEY (profil_code, profil_version) REFERENCES analytics.verfahren_version (code, version),
    CONSTRAINT ck_preflight_ergebnis CHECK (ergebnis IN ('gruen', 'rot')),
    CONSTRAINT ck_preflight_ergebnis_blocker CHECK ((ergebnis = 'gruen') = (blocker_anzahl = 0)),
    CONSTRAINT ck_preflight_anzahlen CHECK (
        blocker_anzahl >= 0 AND warnung_anzahl >= 0 AND hinweis_anzahl >= 0
        AND umfang_paare_anzahl >= 0 AND monate_erwartet >= 0
    )
);

CREATE TABLE nachweis.preflight_befund (
    preflight_id     uuid NOT NULL REFERENCES nachweis.preflight(id) ON DELETE CASCADE,
    lfd              int  NOT NULL,
    regel_code       text NOT NULL,                  -- FJ-01..FJ-06, FJ-07a/b/c (A11), FJ-08 (A20), FJ-09
    schwere          text NOT NULL,                  -- blocker|warnung|hinweis
    endkunde_id      uuid REFERENCES energy.endkunde(id),   -- D-BEFUND-ENDKUNDE-FK
    energietraeger   text,
    monat            date,
    kennzahl_klasse  text,                           -- KLASSIERT, nie kWh/Prozent (A15/B12.5-Muster)
    PRIMARY KEY (preflight_id, lfd),
    CONSTRAINT ck_preflight_befund_schwere CHECK (schwere IN ('blocker', 'warnung', 'hinweis'))
);

-- =====================================================================
-- D1/B1 -- Der Einspar-Lauf (Nachweis-Artefakt, append-only)
-- =====================================================================

CREATE TABLE nachweis.einsparlauf (
    id                      uuid PRIMARY KEY,
    foerderjahr_id          uuid NOT NULL REFERENCES nachweis.foerderjahr(id),
    art                     text NOT NULL,            -- foerderjahr_nachweis|zwischenstand
    verfahren_code          text NOT NULL,
    verfahren_version       int  NOT NULL,             -- analytics.verfahren_version (art=einsparaggregation, V0024)
    parameter               jsonb NOT NULL,            -- Vorzeichenregel (F2), Lueckenregel (F3), Floor, Rundung
    parameter_hash          bytea NOT NULL,
    preflight_id            uuid NOT NULL REFERENCES nachweis.preflight(id),
    bindungs_hash           bytea NOT NULL,            -- Siegel ueber die Bindungsmenge (D2)
    umfang_paare_anzahl     int  NOT NULL,
    monate_erwartet         int  NOT NULL,
    monate_gebunden         int  NOT NULL,
    gebundene_laeufe_anzahl int  NOT NULL,
    qualitaets_stufe_min    text NOT NULL,             -- belastbar|eingeschraenkt|nicht_ausweisbar
    ausloeser               text NOT NULL,             -- manuell|job|korrektur
    code_revision           text NOT NULL,             -- Git-SHA, forensisch (D3-Analogie ADR-0006)
    synthetic               boolean NOT NULL,
    ersetzt_einsparlauf_id  uuid REFERENCES nachweis.einsparlauf(id),
    erstellt_at             timestamptz NOT NULL DEFAULT now(),
    erstellt_von_sub        text NOT NULL,
    FOREIGN KEY (verfahren_code, verfahren_version) REFERENCES analytics.verfahren_version (code, version),
    -- KEIN status, KEIN updated_at (D1-Muster ADR-0006): entsteht erst bei
    -- Erfolg. Job-Steuerung lebt getrennt in nachweis.einsparlauf_auftrag.
    CONSTRAINT ck_einsparlauf_art CHECK (art IN ('foerderjahr_nachweis', 'zwischenstand')),
    CONSTRAINT ck_einsparlauf_ausloeser CHECK (ausloeser IN ('manuell', 'job', 'korrektur')),
    CONSTRAINT ck_einsparlauf_qualitaet CHECK (qualitaets_stufe_min IN ('belastbar', 'eingeschraenkt', 'nicht_ausweisbar')),
    CONSTRAINT ck_einsparlauf_monate CHECK (monate_gebunden <= monate_erwartet AND monate_erwartet >= 0 AND monate_gebunden >= 0),
    CONSTRAINT ck_einsparlauf_anzahlen CHECK (umfang_paare_anzahl >= 0 AND gebundene_laeufe_anzahl >= 0)
);

-- =====================================================================
-- D2/B2 -- Monatsscharfe Bindung an ADR-0006-Laeufe, append-only
-- =====================================================================

CREATE TABLE nachweis.einsparlauf_bindung (
    einsparlauf_id         uuid NOT NULL REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    endkunde_id            uuid NOT NULL REFERENCES energy.endkunde(id),
    energietraeger         text NOT NULL,
    monat                  date NOT NULL,             -- Monatserster, lokal
    berechnungslauf_id     uuid NOT NULL REFERENCES analytics.berechnungslauf(id),
    referenz_kwh           numeric(18,3) NOT NULL,    -- eingefroren aus analytics.laufergebnis (R_m)
    ist_kwh                numeric(18,3) NOT NULL,    -- eingefroren (A_m)
    delta_kwh              numeric(18,3) NOT NULL,    -- R_m - A_m, VOR Vorzeichenregel
    delta_ausgewiesen_kwh  numeric(18,3) NOT NULL,    -- NACH Vorzeichen-/Lueckenregel (F2/F3)
    qualitaets_stufe       text NOT NULL,
    behandlung             text NOT NULL,             -- gemessen|ersatz|ausgeschlossen (F3)
    kandidaten_anzahl      smallint NOT NULL,         -- >1 => Mehrdeutigkeit (D2), im Metablatt ausgewiesen
    PRIMARY KEY (einsparlauf_id, endkunde_id, energietraeger, monat),
    CONSTRAINT ck_bindung_monat CHECK (monat = date_trunc('month', monat)::date),
    CONSTRAINT ck_bindung_behandlung CHECK (behandlung IN ('gemessen', 'ersatz', 'ausgeschlossen')),
    CONSTRAINT ck_bindung_qualitaet CHECK (qualitaets_stufe IN ('belastbar', 'eingeschraenkt', 'nicht_ausweisbar')),
    CONSTRAINT ck_bindung_werte CHECK (referenz_kwh >= 0 AND ist_kwh >= 0 AND kandidaten_anzahl >= 1)
);

-- =====================================================================
-- Jahreszeile je Paar, INKLUSIVE Ausschluessen (DE-02-Vollstaendigkeit)
-- =====================================================================

CREATE TABLE nachweis.einsparlauf_ergebnis (
    einsparlauf_id            uuid NOT NULL REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    endkunde_id               uuid NOT NULL REFERENCES energy.endkunde(id),
    energietraeger            text NOT NULL,
    status                    text NOT NULL,          -- ausgewiesen|nicht_nachweisbar|ausgeschlossen
    ausschluss_grund_code     text,                   -- NUR bei status=ausgeschlossen (A11, s. D-A11-AUSSCHLUSSGRUND)
    referenz_kwh_summe        numeric(18,3),
    ist_kwh_summe             numeric(18,3),
    einsparung_kwh_endenergie numeric(18,3),          -- die ausgewiesene Zahl (Endenergie, B8/D8 unberuehrt)
    monate_ausgewiesen        smallint NOT NULL,
    monate_ersatz             smallint NOT NULL,
    monate_fehlend            smallint NOT NULL,
    qualitaets_stufe_min      text NOT NULL,
    wiss_auswertung_ausgenommen boolean NOT NULL,     -- DE-04-Kennzeichnung (D6/A14)
    PRIMARY KEY (einsparlauf_id, endkunde_id, energietraeger),
    CONSTRAINT ck_ergebnis_status CHECK (status IN ('ausgewiesen', 'nicht_nachweisbar', 'ausgeschlossen')),
    CONSTRAINT ck_ergebnis_ausschluss_grund_code CHECK (
        ausschluss_grund_code IS NULL
        OR ausschluss_grund_code IN (
            'datenschutzrechtliche_einschraenkung',
            'energietraeger_substitution_v1_nicht_unterstuetzt',
            'nicht_nachweisbar'
        )
    ),
    CONSTRAINT ck_ergebnis_status_grund_kohaerenz CHECK ((status = 'ausgeschlossen') = (ausschluss_grund_code IS NOT NULL)),
    CONSTRAINT ck_ergebnis_status_wert_kohaerenz CHECK ((status = 'ausgewiesen') = (einsparung_kwh_endenergie IS NOT NULL)),
    CONSTRAINT ck_ergebnis_monate_nichtneg CHECK (monate_ausgewiesen >= 0 AND monate_ersatz >= 0 AND monate_fehlend >= 0),
    CONSTRAINT ck_ergebnis_summen_nichtneg CHECK (
        (referenz_kwh_summe IS NULL OR referenz_kwh_summe >= 0)
        AND (ist_kwh_summe IS NULL OR ist_kwh_summe >= 0)
    )
);
COMMENT ON CONSTRAINT ck_ergebnis_ausschluss_grund_code ON nachweis.einsparlauf_ergebnis IS
  'A11-Wirkung (ADR-0007 Teil C C3/C4, B13.4/B14): geschlossene Ausschlussgrund-Liste. datenschutzrechtliche_einschraenkung = FJ-07c (Art.18(1)(b)/(1)(d), neutraler Sammelcode -- der differenzierte Grund bleibt in energy.endkunde/anschlussnutzer.einschraenkung_grund_code, V0024). energietraeger_substitution_v1_nicht_unterstuetzt = FJ-06/Weg b (B14). nicht_nachweisbar = struktureller Sammelcode fuer sonstige Nichtaufnahme (z. B. FJ-02 unaufloesbar) -- ACHTUNG: derselbe Text wie der STATUS-Wert nicht_nachweisbar, aber semantisch verschieden, s. Migrations-Kopf D-A11-AUSSCHLUSSGRUND; exakte Abgrenzung fachlich offen (savings-engineer).';

-- =====================================================================
-- D5/B5 -- Export-Artefakt (Metadaten + Hashes, KEINE Byte-Ablage, O-B10)
-- =====================================================================

CREATE TABLE nachweis.export (
    id                    uuid PRIMARY KEY,
    einsparlauf_id        uuid NOT NULL REFERENCES nachweis.einsparlauf(id),
    schema_code           text NOT NULL,
    schema_version        int  NOT NULL,              -- analytics.verfahren_version (art=exportschema, V0024)
    format                text NOT NULL,               -- csv|csv+xlsx
    zweck                 text NOT NULL DEFAULT 'nachweis',   -- A14: nachweis|erfolgskontrolle|wissenschaftliche_auswertung
    de04_auszug           boolean GENERATED ALWAYS AS (zweck = 'wissenschaftliche_auswertung') STORED,  -- A14: DB-abgeleitet
    pseudonym_profil      text NOT NULL DEFAULT 'standard',   -- v1: nur 'standard' (D6)
    station_darstellung   text NOT NULL DEFAULT 'pseudonymisiert',  -- |klarname (A13/O-B4)
    anfrage_ref           text,                        -- A13/A21: Aktenzeichen der Klarname-Anforderung, Slot, KEIN FK (D-EXPORT-ANFRAGE-REF)
    manifest_hash         bytea NOT NULL,
    dateien_anzahl        int  NOT NULL,
    zeilen_anzahl_gesamt  bigint NOT NULL,
    erzeugt_at            timestamptz NOT NULL DEFAULT now(),
    erzeugt_von_sub       text NOT NULL,
    FOREIGN KEY (schema_code, schema_version) REFERENCES analytics.verfahren_version (code, version),
    CONSTRAINT ck_export_format CHECK (format IN ('csv', 'csv+xlsx')),
    CONSTRAINT ck_export_zweck CHECK (zweck IN ('nachweis', 'erfolgskontrolle', 'wissenschaftliche_auswertung')),
    CONSTRAINT ck_export_zweck_wiss_auswertung_gesperrt CHECK (zweck <> 'wissenschaftliche_auswertung'),
    CONSTRAINT ck_export_pseudonym_profil CHECK (pseudonym_profil = 'standard'),
    CONSTRAINT ck_export_station_darstellung CHECK (station_darstellung IN ('pseudonymisiert', 'klarname')),
    CONSTRAINT ck_export_station_klarname_anfrage CHECK (
        station_darstellung = 'pseudonymisiert'
        OR (anfrage_ref IS NOT NULL AND zweck <> 'wissenschaftliche_auswertung')
    ),
    CONSTRAINT ck_export_anzahlen CHECK (dateien_anzahl >= 0 AND zeilen_anzahl_gesamt >= 0)
);
COMMENT ON CONSTRAINT ck_export_zweck_wiss_auswertung_gesperrt ON nachweis.export IS
  'Auflage A23 (ADR-0007 Teil C, fail-closed gesperrt): Empfaenger/Rolle (Art.26 vs. 28, ggf. AVV-Pflicht)/Rechtsgrundlage der wissenschaftlichen Auswertung sind noch nicht geklaert. Zu lockern NUR durch eine neue, nachfolgende Migration (append-only, NICHT diese Datei editieren), sobald compliance-director A23 freigibt.';
COMMENT ON CONSTRAINT ck_export_station_klarname_anfrage ON nachweis.export IS
  'Auflage A13 (ADR-0007 Teil C): station_darstellung=klarname ist nur bei aktenkundiger Anforderung (anfrage_ref) UND ausserhalb eines wissenschaftlichen Auszugs zulaessig. A21 (Zweitfreigabe fuer diesen Schalter) ist App-/Workflow-Scope, NICHT Teil dieser Migration.';

CREATE TABLE nachweis.export_datei (
    export_id      uuid NOT NULL REFERENCES nachweis.export(id) ON DELETE CASCADE,
    dateiname      text NOT NULL,
    kategorie      text NOT NULL,                     -- rohdaten|baseline|einflussgroessen|einspardaten|meta
    zeilen_anzahl  bigint NOT NULL,
    datei_hash     bytea NOT NULL,
    PRIMARY KEY (export_id, dateiname),
    CONSTRAINT ck_export_datei_kategorie CHECK (kategorie IN ('rohdaten', 'baseline', 'einflussgroessen', 'einspardaten', 'meta')),
    CONSTRAINT ck_export_datei_zeilen_anzahl CHECK (zeilen_anzahl >= 0),
    -- A19 (entitaetsfreie, geschlossene, kategoriebasierte Dateinamensliste,
    -- s. Migrations-Kopf D-A19-DATEINAMEN): kein Pseudonym kann jemals
    -- Bestandteil sein, weil die Menge statisch und vollstaendig ist.
    CONSTRAINT ck_export_datei_kategorie_dateiname CHECK (
        (kategorie = 'rohdaten'         AND dateiname ~ '^rohdaten_messwert_tag\.(csv|xlsx)$')
     OR (kategorie = 'baseline'         AND dateiname ~ '^(baseline_lauf|baseline_klima_tag)\.(csv|xlsx)$')
     OR (kategorie = 'einflussgroessen' AND dateiname ~ '^einflussgroessen_intervall\.(csv|xlsx)$')
     OR (kategorie = 'einspardaten'     AND dateiname ~ '^(einspardaten_monat|einspardaten_jahr|einspardaten_differenz)\.(csv|xlsx)$')
     OR (kategorie = 'meta'             AND dateiname ~ '^(metablatt|manifest)\.(csv|xlsx)$')
    )
);
COMMENT ON CONSTRAINT ck_export_datei_kategorie_dateiname ON nachweis.export_datei IS
  'Auflage A19 (ADR-0007 Teil C): entitaetsfreie, geschlossene, kategoriebasierte Dateinamensliste -- verhindert strukturell, dass ein Pseudonym/eine Entitaets-ID jemals Bestandteil eines Dateinamens wird (sonst truege ein append-only Audit-Kontext-Key `dateiname` das Pseudonym unwiderruflich in die Kette, ADR-0007 B10). Basisnamen aus D5-Tabelle; einspardaten_differenz ist eine database-lead-Ergaenzung fuer den B7-Differenz-Report, endgueltiger Name vor O-B8 zu bestaetigen (bafa-export-engineer).';

-- =====================================================================
-- D7/B7 -- Einreichung und Freeze, append-only
-- =====================================================================

CREATE TABLE nachweis.einreichung (
    id                     uuid PRIMARY KEY,
    export_id              uuid NOT NULL REFERENCES nachweis.export(id),
    einsparlauf_id         uuid NOT NULL REFERENCES nachweis.einsparlauf(id),   -- redundant, bewusst (Filter ohne Join)
    art                    text NOT NULL,              -- verwendungsnachweis|zwischennachweis|anfrage_bafa|stichprobe
    anfrage_ref            text,                        -- DE-01 "nur auf Anfrage" -> Aktenzeichen
    empfaenger             text NOT NULL DEFAULT 'bafa',
    uebermittlungsweg      text NOT NULL,               -- bscw_manuell|email_geschuetzt|api
    manifest_hash          bytea NOT NULL,              -- eingefroren, = export.manifest_hash zum Zeitpunkt Y
    uebermittelt_at        timestamptz NOT NULL,
    eingereicht_von_sub    text NOT NULL,
    beleg_ref              uuid,                        -- Slot fuer Empfangsbestaetigung, KEIN FK (Beleg-ADR)
    ersetzt_einreichung_id uuid REFERENCES nachweis.einreichung(id),
    korrektur_grund_code   text,                        -- geschlossene Liste (D7)
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_einreichung_art CHECK (art IN ('verwendungsnachweis', 'zwischennachweis', 'anfrage_bafa', 'stichprobe')),
    CONSTRAINT ck_einreichung_uebermittlungsweg CHECK (uebermittlungsweg IN ('bscw_manuell', 'email_geschuetzt', 'api')),
    CONSTRAINT ck_einreichung_korrektur_grund_code CHECK (
        korrektur_grund_code IS NULL
        OR korrektur_grund_code IN (
            'messwert_korrektur', 'klima_revision', 'baseline_korrektur',
            'einflussgroesse_korrektur', 'verfahren_version_neu',
            'parameter_korrektur', 'foerderjahr_definition_geaendert', 'sonstige'
        )
    ),
    CONSTRAINT ck_einreichung_ersetzt_kohaerenz CHECK ((ersetzt_einreichung_id IS NULL) = (korrektur_grund_code IS NULL))
);
COMMENT ON TABLE nachweis.einreichung IS
  'D7 (ADR-0007 B7): Ehrlichkeitsklausel -- bei uebermittlungsweg=bscw_manuell/email_geschuetzt bezeugt das Artefakt die ERKLAERUNG DES BEDIENERS, NICHT den Empfang durch die Behoerde ("vermerkt", nicht "zugestellt"); beleg_ref ist der Slot fuer eine spaetere Empfangsbestaetigung (eigenes Beleg-ADR). Auflage A22 (Uebertragungs-/Handhabungsregel, Definition email_geschuetzt nach BSI TR-02102) ist App-/Ops-Scope, NICHT Teil dieser Migration.';

-- D-EINREICHUNG-BACKSTOP: Fail-closed BEFORE-INSERT-Trigger, Praezedenz V0023.
CREATE FUNCTION nachweis.pruefe_einreichung_faehig() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = nachweis, pg_temp AS $$
DECLARE
    v_lauf      nachweis.einsparlauf%ROWTYPE;
    v_preflight nachweis.preflight%ROWTYPE;
BEGIN
    SELECT * INTO v_lauf FROM nachweis.einsparlauf WHERE id = NEW.einsparlauf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'nachweis: einsparlauf_id % nicht aufloesbar -- Einreichung abgelehnt (fail-closed, D7-Backstop, Praezedenz V0023)', NEW.einsparlauf_id;
    END IF;

    IF v_lauf.art <> 'foerderjahr_nachweis' THEN
        RAISE EXCEPTION 'nachweis: einsparlauf_id % hat art=% -- nur art=foerderjahr_nachweis ist einreichbar (D4/B7)', NEW.einsparlauf_id, v_lauf.art;
    END IF;

    IF v_lauf.synthetic THEN
        RAISE EXCEPTION 'nachweis: einsparlauf_id % ist synthetic=true -- synthetische Laeufe sind niemals einreichbar (B7, ADR-0006-A9-Analogie)', NEW.einsparlauf_id;
    END IF;

    SELECT * INTO v_preflight FROM nachweis.preflight WHERE id = v_lauf.preflight_id;
    IF NOT FOUND OR v_preflight.ergebnis <> 'gruen' THEN
        RAISE EXCEPTION 'nachweis: preflight zu einsparlauf_id % ist nicht gruen -- Einreichung abgelehnt (fail-closed, D4/B7)', NEW.einsparlauf_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_einreichung_faehig BEFORE INSERT ON nachweis.einreichung
    FOR EACH ROW EXECUTE FUNCTION nachweis.pruefe_einreichung_faehig();

COMMENT ON TRIGGER trg_einreichung_faehig ON nachweis.einreichung IS
  'D7-Backstop (Praezedenz V0023 analytics.pruefe_endkunde_sperre): fail-closed BEFORE-INSERT-Pruefung, dass nur art=foerderjahr_nachweis, NICHT synthetic und mit gruenem Preflight eingereicht werden kann -- unabhaengig vom Schreibpfad (App-Scope-Check bleibt zusaetzlich Service-Ebene). SECURITY DEFINER, Owner edms_nachweis_owner, liest ausschliesslich aus nachweis.einsparlauf/nachweis.preflight (kein Cross-Schema-Grant noetig, anders als V0023).';

CREATE TABLE nachweis.einreichung_differenz (
    id             uuid PRIMARY KEY,                  -- Surrogat-PK, s. Migrations-Kopf D-EINREICHUNG-DIFFERENZ-PK
    einreichung_id uuid NOT NULL REFERENCES nachweis.einreichung(id) ON DELETE CASCADE,
    endkunde_id    uuid NOT NULL REFERENCES energy.endkunde(id),   -- D-BEFUND-ENDKUNDE-FK
    energietraeger text NOT NULL,
    monat          date,                              -- NULL = Jahres-Ebene (D-EINREICHUNG-DIFFERENZ-PK)
    wert_alt_kwh   numeric(18,3),
    wert_neu_kwh   numeric(18,3),
    delta_kwh      numeric(18,3) NOT NULL,
    ursache_code   text NOT NULL,
    CONSTRAINT ck_einreichung_differenz_monat CHECK (monat IS NULL OR monat = date_trunc('month', monat)::date)
);
-- Monatsscharfe Eindeutigkeit (monat IS NOT NULL):
CREATE UNIQUE INDEX ux_einreichung_differenz_monatsebene
    ON nachweis.einreichung_differenz (einreichung_id, endkunde_id, energietraeger, monat)
    WHERE monat IS NOT NULL;
-- Jahres-Ebene: hoechstens EINE Differenzzeile ohne Monatsbezug je Paar
-- (NULL <> NULL in regulaerer UNIQUE-Semantik -- partieller Index schliesst
-- die Luecke, D-EINREICHUNG-DIFFERENZ-PK).
CREATE UNIQUE INDEX ux_einreichung_differenz_jahresebene
    ON nachweis.einreichung_differenz (einreichung_id, endkunde_id, energietraeger)
    WHERE monat IS NULL;

-- =====================================================================
-- D6 -- Export-Pseudonym: EINZIGE Re-Identifikationsbruecke (A19)
-- =====================================================================

CREATE TABLE nachweis.export_pseudonym (
    entitaet_typ  text NOT NULL,                       -- endkunde|system|messkanal|station
    entitaet_ref  text NOT NULL,                        -- uuid bzw. messkanal_key/station_ref als Text
    pseudonym     text NOT NULL,                        -- 'EK-0001', 'ST-003', ... stabil ueber Foerderjahre
    vergeben_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entitaet_typ, entitaet_ref),
    UNIQUE (entitaet_typ, pseudonym),
    CONSTRAINT ck_export_pseudonym_entitaet_typ CHECK (entitaet_typ IN ('endkunde', 'system', 'messkanal', 'station'))
);
COMMENT ON TABLE nachweis.export_pseudonym IS
  'A19/O-B13: EINZIGE Re-Identifikationsbruecke im Exportpfad -- Tabellen-Konstruktion statt HMAC-Ableitung (bestaetigt, O-B13: eine Tabelle ist kontrollierbar/loeschbar/auditierbar, eine Ableitungsfunktion mit Pepper-Kenntnis waere nachrechenbar und nicht widerrufbar). Schutz ausschliesslich ueber die eigene Rolle edms_nachweis_renderer (s. GRANTS unten), NICHT ueber Code-Disziplin. entitaet_typ=station traegt in entitaet_ref eine KLARTEXT-Stationskennung -- also den Schluessel zur Aufloesung der A13-Stationsersetzung (O-B13, zu dokumentieren, dieselbe Grant-Trennung wie fuer endkunde/system/messkanal).';
COMMENT ON COLUMN nachweis.export_pseudonym.entitaet_ref IS
  'personenbeziehbar=true; pii=false; re-id-bruecke=true; grant=NUR edms_nachweis_renderer (A19); retention=dieselbe Uhr wie die Nachweisartefakte (A16), NICHT der Krypto-Shred -- nach Vernichtung des Re-ID-Schluessels in identity verbindet die Zeile zwei Pseudonyme ohne Aufloesungsmoeglichkeit (voraussichtlich kein Loeschbedarf beim Shred selbst, O-B13).';

-- =====================================================================
-- Mutabel, KEIN Nachweisartefakt (D1-Muster ADR-0006)
-- =====================================================================

CREATE TABLE nachweis.einsparlauf_auftrag (
    id             uuid PRIMARY KEY,
    foerderjahr_id uuid NOT NULL REFERENCES nachweis.foerderjahr(id),
    art            text NOT NULL,
    status         text NOT NULL,                      -- angefordert|laeuft|abgeschlossen|fehlgeschlagen
    versuche       int  NOT NULL DEFAULT 0,
    fehler_code    text,
    einsparlauf_id uuid REFERENCES nachweis.einsparlauf(id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_einsparlauf_auftrag_art CHECK (art IN ('foerderjahr_nachweis', 'zwischenstand')),
    CONSTRAINT ck_einsparlauf_auftrag_status CHECK (status IN ('angefordert', 'laeuft', 'abgeschlossen', 'fehlgeschlagen')),
    CONSTRAINT ck_einsparlauf_auftrag_versuche CHECK (versuche >= 0)
);

CREATE TABLE nachweis.einsparlauf_retention_status (
    einsparlauf_id     uuid PRIMARY KEY REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    nachweis_gebunden  boolean NOT NULL DEFAULT false,  -- A16: true sobald >=1 nicht-ersetzte einreichung existiert; App-Semantik monoton (analog analytics.lauf_retention_status, NICHT DB-erzwungen, Praezedenz V0019)
    legal_hold         boolean NOT NULL DEFAULT false,
    frist_start_at     timestamptz,                     -- A16: Anker = BESTANDSKRAFT SCHLUSSBESCHEID (NICHT Einreichung) -- Ereignis-Erkennung App-/Ops-Scope, Zahl selbst offen (A-O6)
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE nachweis.einsparlauf_retention_status IS
  'A16 (compliance-director-Auflage, ADR-0007 Teil C): Struktur fuer einen kuenftigen fristgebundenen Loesch-Job. Anker ist laut A16 die BESTANDSKRAFT DES SCHLUSSBESCHEIDS, NICHT die Einreichung -- frist_start_at bleibt bewusst bis dahin NULL. A16 verlangt zusaetzlich EINE gemeinsame Uhr fuer nachweis.* und die gebundenen analytics.*-Laeufe -- diese Migration liefert nur die nachweis-seitige Haelfte; analytics.lauf_retention_status (V0019) hat noch KEIN symmetrisches frist_start_at-Feld, s. Migrationsende "OFFENER PUNKT A16-GEMEINSAME-UHR". Retention-Frist selbst NICHT Teil dieser Migration (O-B7, retention-engineer + compliance-director).';

CREATE TRIGGER trg_einsparlauf_auftrag_updated_at BEFORE UPDATE ON nachweis.einsparlauf_auftrag
    FOR EACH ROW EXECUTE FUNCTION nachweis.set_updated_at();
CREATE TRIGGER trg_einsparlauf_retention_status_updated_at BEFORE UPDATE ON nachweis.einsparlauf_retention_status
    FOR EACH ROW EXECUTE FUNCTION nachweis.set_updated_at();

-- =====================================================================
-- Indizes (mit Begruendung -- keine spekulativen Indizes,
-- .claude/rules/database-migrations.md)
-- =====================================================================

-- B10 GET /nachweis/einsparlaeufe?foerderjahr=&art=&nurAktuelle=
CREATE INDEX ix_einsparlauf_foerderjahr ON nachweis.einsparlauf (foerderjahr_id, art)
    WHERE ersetzt_einsparlauf_id IS NULL;
-- "der selbst nicht ersetzt wurde" -- Anti-Join-Praedikat, Praezedenz V0019 ix_berechnungslauf_ersetzt.
CREATE INDEX ix_einsparlauf_ersetzt ON nachweis.einsparlauf (ersetzt_einsparlauf_id)
    WHERE ersetzt_einsparlauf_id IS NOT NULL;

-- B11/A18: Retention-Verifikation UND Art.-19-Mitteilungsregister
-- ("nachweis.einreichung x einsparlauf_bindung") muessen rueckwaerts von
-- einem analytics.berechnungslauf auf die verwendenden Einspar-Laeufe
-- schliessen koennen.
CREATE INDEX ix_einsparlauf_bindung_berechnungslauf ON nachweis.einsparlauf_bindung (berechnungslauf_id);

-- D4: Preflight-Historie je Foerderjahr (idempotent/wiederholbar, juengster
-- Versuch zuerst).
CREATE INDEX ix_preflight_foerderjahr ON nachweis.preflight (foerderjahr_id, ausgefuehrt_at DESC);

-- einsparlauf_id ist laut Skizzenkommentar "redundant, bewusst (Filter ohne
-- Join)" -- ohne Index waere genau dieser Zweck verfehlt.
CREATE INDEX ix_einreichung_einsparlauf ON nachweis.einreichung (einsparlauf_id);
-- "Aktuell gueltige Einreichung" -- Anti-Join-Praedikat (D7).
CREATE INDEX ix_einreichung_ersetzt ON nachweis.einreichung (ersetzt_einreichung_id)
    WHERE ersetzt_einreichung_id IS NOT NULL;

-- B10 GET /nachweis/einsparlaeufe/{id}/exporte (Listing je Lauf).
CREATE INDEX ix_export_einsparlauf ON nachweis.export (einsparlauf_id);

-- Job-Queue-Polling liest nur offene/laufende Auftraege (D1-Analogie),
-- Praezedenz V0019 ix_lauf_auftrag_offen.
CREATE INDEX ix_einsparlauf_auftrag_offen ON nachweis.einsparlauf_auftrag (status, created_at)
    WHERE status IN ('angefordert', 'laeuft');

-- Kuenftiger Retention-Job (A16): Kandidaten-Selektion, Praezedenz V0019
-- ix_lauf_retention_status_kandidat.
CREATE INDEX ix_einsparlauf_retention_status_kandidat ON nachweis.einsparlauf_retention_status (nachweis_gebunden, legal_hold)
    WHERE NOT nachweis_gebunden AND NOT legal_hold;

-- =====================================================================
-- PII-Kommentare (Muster A8/V0019, zwingend --
-- .claude/rules/database-migrations.md)
-- =====================================================================

COMMENT ON COLUMN nachweis.einsparlauf_bindung.endkunde_id IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht Art.17(3)(b), Anker Bestandskraft Schlussbescheid (A16, Frist offen); shred=nein — Re-ID-Schluessel in identity';
COMMENT ON COLUMN nachweis.einsparlauf_bindung.referenz_kwh IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=wie endkunde_id; shred=nein';
COMMENT ON COLUMN nachweis.einsparlauf_bindung.ist_kwh IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=wie endkunde_id; shred=nein';
COMMENT ON COLUMN nachweis.einsparlauf_ergebnis.endkunde_id IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht Art.17(3)(b); shred=nein — Re-ID-Schluessel in identity';
COMMENT ON COLUMN nachweis.einsparlauf_ergebnis.einsparung_kwh_endenergie IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=wie endkunde_id; shred=nein';
COMMENT ON COLUMN nachweis.einreichung_differenz.endkunde_id IS
  'personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=wie einsparlauf_ergebnis; shred=nein';
COMMENT ON COLUMN nachweis.einsparlauf.erstellt_von_sub IS
  'personenbeziehbar=true (Beschaeftigter); pii=false; grundlage=Art.6(1)(c)/(f) DSGVO + Paragraph 26 BDSG Nachweisfuehrung; erscheint NICHT im Export (B10 Verbotsliste: Bearbeiter-Klartext nur im Audit-Akteursfeld selbst)';
COMMENT ON COLUMN nachweis.export.erzeugt_von_sub IS
  'personenbeziehbar=true (Beschaeftigter); pii=false; grundlage=Art.6(1)(c)/(f) Nachweisfuehrung; erscheint NICHT im Export';
COMMENT ON COLUMN nachweis.einreichung.eingereicht_von_sub IS
  'personenbeziehbar=true (Beschaeftigter); pii=false; grundlage=Art.6(1)(c)/(f) Nachweisfuehrung; erscheint NICHT im Export';

-- =====================================================================
-- A19 -- REVOKE (append-only, Muster V0013/V0019). Gilt fuer ALLE ELF
-- Artefakttabellen.
-- =====================================================================

REVOKE UPDATE, DELETE ON
    nachweis.foerderjahr, nachweis.preflight, nachweis.preflight_befund,
    nachweis.einsparlauf, nachweis.einsparlauf_bindung, nachweis.einsparlauf_ergebnis,
    nachweis.export, nachweis.export_datei,
    nachweis.einreichung, nachweis.einreichung_differenz, nachweis.export_pseudonym
FROM PUBLIC;

-- =====================================================================
-- Rollen (idempotente DO-Bloecke, Muster V0003/V0010/V0019/V0020) -- A19
-- =====================================================================

DO $$ BEGIN
    CREATE ROLE edms_nachweis_owner NOLOGIN;      -- Owner ALLER nachweis-Objekte; NICHT edms_app
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_nachweis_owner existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_nachweis_renderer NOLOGIN;   -- A19: einzige Rolle auf der Re-ID-Bruecke export_pseudonym
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_nachweis_renderer existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_nachweis_reader NOLOGIN;     -- Least-Privilege-Leserolle (Lauf-/Ergebnis-/Einreichungsartefakte)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_nachweis_reader existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- edms_app/edms_retention/edms_analytics_detail_reader existieren bereits
-- seit V0003/V0019. Credential-/Mitgliedschafts-ZUWEISUNG an konkrete
-- Menschen/Dienste bleibt NICHT Teil dieser Migration (devops-lead/
-- security-lead, wie ueberall in diesem Repo) -- die Mitgliedschafts-
-- GRANTs zwischen den beiden Rollen unten sind hingegen strukturelle
-- Least-Privilege-Verdrahtung (B11) und daher WOHL Teil dieser Migration.

-- =====================================================================
-- Ownership (A19: App-Laufzeitrolle ist NICHT Eigentuemerin) -- ERST HIER
-- =====================================================================

ALTER SCHEMA nachweis OWNER TO edms_nachweis_owner;

ALTER TABLE nachweis.foerderjahr                OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.preflight                  OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.preflight_befund           OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einsparlauf                OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einsparlauf_bindung        OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einsparlauf_ergebnis       OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.export                     OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.export_datei               OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einreichung                OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einreichung_differenz      OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.export_pseudonym           OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einsparlauf_auftrag        OWNER TO edms_nachweis_owner;
ALTER TABLE nachweis.einsparlauf_retention_status OWNER TO edms_nachweis_owner;
ALTER FUNCTION nachweis.set_updated_at()        OWNER TO edms_nachweis_owner;
ALTER FUNCTION nachweis.pruefe_einreichung_faehig() OWNER TO edms_nachweis_owner;

REVOKE EXECUTE ON FUNCTION nachweis.pruefe_einreichung_faehig() FROM PUBLIC;

-- =====================================================================
-- GRANTS (A19, VOLLTEXT -- zum Gegenlesen)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) edms_app: INSERT+SELECT auf ZEHN der elf Artefakttabellen -- ALLE
--     AUSSER export_pseudonym (A19 woertlich: "edms_app bekommt darauf
--     keinen Grant") UND AUSSER export/export_datei (die laufen unter
--     edms_nachweis_renderer, s. Migrations-Kopf). NIRGENDS UPDATE/DELETE.
--     Auf den beiden mutablen Bookkeeping-Tabellen zusaetzlich UPDATE,
--     weiterhin KEIN DELETE (Retention bleibt exklusiv Ops-Scope, A16).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA nachweis TO edms_app;

GRANT INSERT, SELECT ON
    nachweis.foerderjahr, nachweis.preflight, nachweis.preflight_befund,
    nachweis.einsparlauf, nachweis.einsparlauf_bindung, nachweis.einsparlauf_ergebnis,
    nachweis.einreichung, nachweis.einreichung_differenz
    TO edms_app;

GRANT INSERT, SELECT, UPDATE ON nachweis.einsparlauf_auftrag TO edms_app;
GRANT INSERT, SELECT, UPDATE ON nachweis.einsparlauf_retention_status TO edms_app;

-- ---------------------------------------------------------------------
-- (b) edms_nachweis_renderer: A19-Kernauflage. Einzige Rolle auf
--     export_pseudonym; zusaetzlich der gesamte Export-Erzeugungs-/
--     Auslieferungspfad (export/export_datei, Lese-Zugriff auf die zu
--     rendernden Lauf-/Ergebnis-Artefakte, Mitgliedschaft in
--     edms_analytics_detail_reader fuer die rohen Tages-Snapshots, B11).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA nachweis TO edms_nachweis_renderer;

GRANT SELECT, INSERT ON nachweis.export_pseudonym TO edms_nachweis_renderer;
GRANT SELECT, INSERT ON nachweis.export, nachweis.export_datei TO edms_nachweis_renderer;
GRANT SELECT ON
    nachweis.einsparlauf, nachweis.einsparlauf_bindung, nachweis.einsparlauf_ergebnis
    TO edms_nachweis_renderer;

-- B11: "Der Export-Renderer benoetigt zusaetzlich die Tages-Detail-
-- Snapshots und erhaelt sie ueber Mitgliedschaft in der bereits
-- vorhandenen edms_analytics_detail_reader" (V0019 D-A6-DETAIL-READER).
GRANT edms_analytics_detail_reader TO edms_nachweis_renderer;

-- ---------------------------------------------------------------------
-- (c) edms_nachweis_reader: NUR SELECT auf Lauf-, Ergebnis- und
--     Einreichungsartefakte (B11 woertlich) -- AUSDRUECKLICH OHNE
--     export/export_datei/export_pseudonym (read:nachweis_export ist
--     eigens gehaertet, B10).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA nachweis TO edms_nachweis_reader;

GRANT SELECT ON
    nachweis.foerderjahr, nachweis.preflight, nachweis.preflight_befund,
    nachweis.einsparlauf, nachweis.einsparlauf_bindung, nachweis.einsparlauf_ergebnis,
    nachweis.einreichung, nachweis.einreichung_differenz
    TO edms_nachweis_reader;

-- ---------------------------------------------------------------------
-- (d) edms_retention: KEIN DELETE auf nachweis.* in v1 (A16/O-B7).
--     NUR SELECT auf einsparlauf_bindung (B11: Retention-Verifikation
--     eines analytics-Laufs unabhaengig vom mutablen Flag).
-- ---------------------------------------------------------------------

GRANT USAGE ON SCHEMA nachweis TO edms_retention;
GRANT SELECT ON nachweis.einsparlauf_bindung TO edms_retention;
