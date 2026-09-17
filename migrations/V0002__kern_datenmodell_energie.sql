-- V0002__kern_datenmodell_energie.sql
--
-- ADR-Bezug: docs/adr/ADR-0004-kern-datenmodell-energie.md (Status:
-- accepted, 2026-07-09) -- Teil B "Phase-2-Design" (Abschnitte 11-20,
-- Anhang B "DSGVO-relevante Datenfelder", Anhang C "Rote-Linien-
-- Konformität"). DDL-Vorlage: schemas/database/adr-0004-kern-datenmodell.md
-- (finale, review-eingearbeitete Skizze, Abschnitte 3-5).
--
-- Design-Owner: technical-director.
-- Lead-Review Teil B (2026-07-09, vollständig eingearbeitet, ADR §20):
--   - database-lead: numeric(18,3) statt double precision (S1); FK-loser
--     Hypertable-Zugriff unter drei Bedingungen (S3); Link-Tabelle
--     messkonzept_version_energietraeger statt skalarer baseline_*-Spalten
--     (S8); EXCLUDE USING gist + btree_gist für Overlap-Schutz;
--     je-Schema-duplizierte updated_at-Trigger-Funktionen (rote Linie 5);
--     UUIDv7 app-seitig ohne DB-Default (S4); UNIQUE(crypto_key_id) je
--     PII-Tabelle (1 DEK/Subjekt); PII-Kommentare vervollständigt; partielle
--     ABAC-Indizes WHERE gueltig_bis IS NULL.
--   - timescale-engineer: 7-Tage-Chunks bestätigt + Benchmark-Faustformel
--     (Phase 4); kein globaler ts-Zweit-Index; Integer-Surrogat kanal_key im
--     Hypertable; fillfactor=90 für HOT-Updates bei Backfill; Space-
--     Partitioning geprüft und verworfen; inkrementelles Rollup statt
--     Full-Refresh-MV (Phase 4); Apache-2-Konformität bestätigt.
-- compliance-director: Phase 1 ohne Veto (Risiko-Flag HOCH), sechs
--   Gate-Bedingungen (ADR §7.1) + fünf rote Linien (ADR §7.2) mitgetragen.
--   Phase-3-Review ABGESCHLOSSEN (2026-07-09): DSFA-0001 (status: review,
--   Aktivierungsbedingungen dokumentiert), RVT VT-0001, TOMs rev. 2,
--   ISO-Annex-A-Mapping (SoA rev. 2), R-0004 angelegt. Das Phase-3-Gate hat
--   diese Schema-only-Migration ausdrücklich freigegeben; die DSFA-
--   Aktivierung bleibt Vorbedingung für den PRODUKTIVEN Ingest, nicht für
--   dieses DDL. PII-Review vor Merge: database-lead (2026-07-09) +
--   compliance-director (2026-07-09, Merge-Freigabe ohne blockierende
--   Auflagen) -- .claude/rules/database-migrations.md "Review" erfüllt.
--
-- GATE-STATUS (ADR §6/§7.1, unverändert durch diese Migration): Es wird
-- KEIN Anwendungscode/Datenpfad verdrahtet, der reale PII-/Verbrauchsdaten
-- in diese Tabellen schreibt. Das PII-Ingest-Gate bleibt geschlossen, bis
-- ADR-0002 (AuthZ/ABAC), ADR-0003 (Audit-Log), die DSFA, Consent-Enforcement
-- und DE-Only-Hosting/AVV stehen (ADR §6, Gate-Bedingung 6: "kein
-- verdrahteter Prod-Datenpfad auf PII-/Verbrauchstabellen").
--
-- DOKUMENTIERTE ABWEICHUNGEN vom Standard/der Skizze (Kennzeichnungspflicht
-- laut Arbeitsauftrag):
--
--   (a) `energy.zaehler.geraete_referenz` wird in DIESER Migration NICHT
--       angelegt (Abweichung von der DDL-Skizze §4, die die Spalte bereits
--       vorsieht). Grund: `geraete_referenz` ist als Quasi-Identifier
--       klassifiziert (ADR-0004 Anhang B, Eintrag Q1: "devEUI/Seriennr.,
--       Klassifizierung offen"); die Quasi-Identifier-Einstufung inkl.
--       ggf. nötiger Pseudonymisierungs-/Hashing-Vorgabe ist laut ADR §20.1
--       (offener Punkt O4) NOCH NICHT final durch compliance-director
--       entschieden. Die Spalte wird bewusst zurückgestellt und erst per
--       eigener Nachtrags-Migration (`ALTER TABLE energy.zaehler ADD COLUMN
--       geraete_referenz ...` inkl. COMMENT ON COLUMN) ergänzt, sobald die
--       Klassifizierung feststeht -- append-only, keine nachträgliche
--       Änderung dieser Datei. Bis dahin trägt `energy.zaehler` keine
--       Geräte-Korrelations-Spalte; die Ingest-Korrelation (ADR-0005) muss
--       das beim Entwurf berücksichtigen.
--   (b) `measurement.messwert.erfasst_at` statt `created_at`: weicht von der
--       Standard-Spaltenbenennung (.claude/rules/database-migrations.md,
--       "created_at timestamptz NOT NULL DEFAULT now()") namentlich ab, um
--       die Schreibzeit klar von der Messzeit `ts` zu trennen
--       (database-lead-Finding, ADR §14). Inhaltlich identisches Verhalten
--       (NOT NULL DEFAULT now()).
--   (c) `measurement.messwert` hat KEINEN UUID-Primärschlüssel (Abweichung
--       von der PK-Rule): einzelne Messwerte sind nicht extern einzeln
--       adressierbar, der natürliche Schlüssel (messkanal_key, ts) genügt;
--       ein Surrogat kostete nur Schreibdurchsatz (ADR §14, M3).
--   (d) KEIN `updated_at`-Trigger auf `measurement.messwert`
--       (Append-only-Charakter; Korrekturen laufen kontrolliert über
--       `INSERT ... ON CONFLICT (messkanal_key, ts) DO UPDATE`, ADR-0005).
--   (e) KEIN `updated_at` auf `energy.messkonzept`,
--       `energy.messkonzept_version`,
--       `energy.messkonzept_version_energietraeger` und
--       `energy.geraetegruppe_kanal`: Versions-/Zuordnungs-Semantik ist
--       append-only (Änderungshistorie statt In-Place-Update), nur
--       `created_at` (ADR §13.2, Fußnote zur Entitäten-Übersicht).
--   (f) Schema `audit` wird HIER NICHT angelegt -- reserviert für ADR-0003
--       (unveränderliches Audit-Log inkl. REVOKE UPDATE, DELETE FROM
--       PUBLIC). Diese Migration ist "audit-ready" (UTC-Zeitstempel, keine
--       destruktiven Updates auf PII ohne Fachhistorie), verdrahtet aber
--       keine Audit-Hypertable.
--
-- Phase-4-Punkte (NICHT freigabe-blockierend, ADR §20.1 O5 -- vor
-- Produktiv-Betrieb nachzuziehen): finale numeric-Scale je Messgröße
-- (P4-1, postgres-engineer), finale EXCLUDE-Spaltenauswahl nach
-- Mieter-Klärung (P4-2, access-control-engineer), Chunk-Benchmark (P4-3,
-- timescale-engineer), inkrementelles Rollup (P4-4, timescale-engineer),
-- Archiv-Export-Konsistenz vor drop_chunks() (P4-5, timescale-engineer +
-- compliance-director).
--
-- Reihenfolge dieser Datei folgt den FK-Abhängigkeiten: identity (Subjekt-
-- Schlüssel vor PII-Tabellen) -> energy (endkunde -> anschlussnutzer/system
-- -> nutzungsverhaeltnis -> zaehler -> messkanal -> messkonzept(+version(
-- +energietraeger)) -> geraetegruppe(+kanal)) -> measurement (Hypertable,
-- referenziert energy.messkanal.kanal_key OHNE DB-FK, s. u.).

-- =====================================================================
-- Namensräume
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS energy;
CREATE SCHEMA IF NOT EXISTS measurement;
-- Schema `audit` bewusst NICHT angelegt: reserviert für ADR-0003
-- (unveränderliches Audit-Log, REVOKE UPDATE, DELETE FROM PUBLIC dort).

-- Rote Linie 1 & 5 (ADR §7.2, §11): KEIN Fremdschlüssel energy -> identity
-- und KEIN identity -> energy. Die Verbindung Pseudonym <-> reale Identität
-- ist AUSSCHLIESSLICH ein logischer Abgleich über die Spalte
-- `pseudonym_id` (KEIN DB-FK) -- damit bleibt `identity` als Namensraum
-- physisch abtrennbar (M5, DS-09). Aus demselben Grund sind die
-- `updated_at`-Trigger-Funktionen je Schema dupliziert (kein
-- cross-schema-Funktionsaufruf, database-lead-Votum 5).

-- =====================================================================
-- Schema `identity` -- direkt identifizierende PII, feldverschlüsselt
-- =====================================================================

-- Pro Subjekt genau ein Data-Encryption-Key (DEK), gewrappt vom
-- KMS-Master-Key. Krypto-Shredding (Art. 17) = DEK hier vernichten ->
-- Chiffrate werden unwiederbringlich (ADR §15/§16).
CREATE TABLE identity.subjekt_schluessel (
    id               uuid PRIMARY KEY,            -- App: UUIDv7, KEIN DB-DEFAULT (database-lead-Votum S4)
    wrapped_dek      bytea       NOT NULL,         -- DEK, gewrappt via KMS
    kms_key_id       text        NOT NULL,         -- Referenz auf KMS-Masterschlüssel
    alg_version      smallint    NOT NULL,         -- Krypto-Agilität (AES-256-GCM v1)
    key_state        text        NOT NULL DEFAULT 'aktiv',  -- aktiv|geschreddert
    created_at       timestamptz NOT NULL DEFAULT now(),
    geschreddert_at  timestamptz
);
COMMENT ON COLUMN identity.subjekt_schluessel.wrapped_dek IS
  'pii=true; grundlage=Art.32 DSGVO (TOM Verschlüsselung) [Platzhalter -> final DSFA]; retention=an Subjekt gebunden; Löschung=Krypto-Shredding (Art.17); ADR-0004 Anhang B, P7';

CREATE TABLE identity.endkunde_pii (
    id            uuid PRIMARY KEY,             -- App: UUIDv7, KEIN DB-DEFAULT
    pseudonym_id  uuid        NOT NULL UNIQUE,  -- LOGISCHER Link zu energy.endkunde.id (KEIN FK!)
    crypto_key_id uuid        NOT NULL UNIQUE   -- UNIQUE: 1 DEK je Subjekt (Krypto-Shredding-Garantie, database-lead-Finding)
                  REFERENCES identity.subjekt_schluessel(id),
    name_enc      bytea       NOT NULL,         -- AES-256-GCM(ciphertext||nonce||tag)
    anschrift_enc bytea       NOT NULL,
    kontakt_enc   bytea,                        -- E-Mail/Telefon
    pii_status    text        NOT NULL DEFAULT 'aktiv',  -- aktiv|gesperrt|geloescht
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN identity.endkunde_pii.pseudonym_id IS
  'pii=true; grundlage=Re-Identifikations-Mapping (Verkettbarkeit) [Platzhalter -> final DSFA]; retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, P4';
COMMENT ON COLUMN identity.endkunde_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag / Art.6(1)(a) Einwilligung [Platzhalter -> final DSFA/RVT]; retention=Projektlaufzeit + gesetzl. Aufbewahrung; Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P1';
COMMENT ON COLUMN identity.endkunde_pii.anschrift_enc IS
  'pii=true; grundlage=Art.6(1)(b) Vertrag [Platzhalter -> final DSFA/RVT]; retention=Projektlaufzeit + gesetzl. Aufbewahrung; ADR-0004 Anhang B, P2';
COMMENT ON COLUMN identity.endkunde_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (TB-06 Nutzerinformation) [Platzhalter -> final DSFA/RVT]; retention=bis Widerruf/Projektende; ADR-0004 Anhang B, P3';

CREATE TABLE identity.anschlussnutzer_pii (
    id            uuid PRIMARY KEY,
    pseudonym_id  uuid        NOT NULL UNIQUE,  -- LOGISCHER Link zu energy.anschlussnutzer.id (KEIN FK!)
    crypto_key_id uuid        NOT NULL UNIQUE   -- UNIQUE: 1 DEK je Subjekt
                  REFERENCES identity.subjekt_schluessel(id),
    name_enc      bytea       NOT NULL,
    kontakt_enc   bytea,
    pii_status    text        NOT NULL DEFAULT 'aktiv',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN identity.anschlussnutzer_pii.pseudonym_id IS
  'pii=true; grundlage=Re-Identifikations-Mapping Datensubjekt (Verkettbarkeit, DS-07) [Platzhalter -> final DSFA]; retention=an Subjekt gebunden; Löschung=Krypto-Shredding + Nullen des Mappings; ADR-0004 Anhang B, analog P4';
COMMENT ON COLUMN identity.anschlussnutzer_pii.name_enc IS
  'pii=true; grundlage=Art.6(1)(f)/(a) -- Datensubjekt der Verbrauchsdaten (DS-07) [Platzhalter -> final DSFA/RVT]; retention=Nutzungsdauer + gesetzl. Aufbewahrung; Sperrung statt Löschung (DS-08); ADR-0004 Anhang B, P5';
COMMENT ON COLUMN identity.anschlussnutzer_pii.kontakt_enc IS
  'pii=true; grundlage=Art.6(1)(a) Einwilligung (DS-07 Datensubjekt) [Platzhalter -> final DSFA/RVT]; retention=bis Widerruf/Nutzungsende; ADR-0004 Anhang B, P6';

-- updated_at-Trigger: eigene Funktion je Schema (bewusst dupliziert, rote Linie 5).
CREATE FUNCTION identity.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_endkunde_pii_updated_at BEFORE UPDATE ON identity.endkunde_pii
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();
CREATE TRIGGER trg_anschlussnutzer_pii_updated_at BEFORE UPDATE ON identity.anschlussnutzer_pii
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

-- =====================================================================
-- Schema `energy` -- Fachdaten, KEINE PII (rote Linie 1)
-- =====================================================================

CREATE TABLE energy.endkunde (
    id                              uuid PRIMARY KEY,   -- = stabiler Pseudonym-Surrogat (UUIDv7, KEIN DB-DEFAULT)
    verarbeitungs_status            text NOT NULL DEFAULT 'aktiv',  -- aktiv|gesperrt(Art.18)|geloescht/anonym(Art.17)
    consent_status                  text NOT NULL DEFAULT 'fehlt',  -- aktiv|fehlt|widerrufen (Slot; Mechanik = Consent-ADR)
    consent_text_version            text,
    consent_ref_id                  uuid,               -- Slot, KEIN FK (Consent-ADR)
    von_wiss_auswertung_ausgenommen boolean NOT NULL DEFAULT false,  -- DE-04
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now()
);
-- KEINE PII-Spalten hier (rote Linie 1). Kein COMMENT pii=true nötig.
-- consent_status/_text_version/_ref_id = Nicht-PII-Slot (ADR-0004 Anhang B, N1).

CREATE TABLE energy.anschlussnutzer (
    id                   uuid PRIMARY KEY,        -- Pseudonym-Surrogat des Datensubjekts
    endkunde_id          uuid NOT NULL REFERENCES energy.endkunde(id),
    verarbeitungs_status text NOT NULL DEFAULT 'aktiv',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE energy.system (
    id                  uuid PRIMARY KEY,
    endkunde_id         uuid NOT NULL REFERENCES energy.endkunde(id),
    bezeichnung         text NOT NULL,
    systemgrenze        text NOT NULL,          -- strukturell (TB-01 dokumentiert versionsweit im Messkonzept)
    systembeschreibung  text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- DS-07: First-Class-Beziehung Datensubjekt <-> Vertragspartner <-> Ort,
-- inkl. Datenklasse (ABAC-Steuergröße) und Temporalität (Mieterwechsel).
CREATE TABLE energy.nutzungsverhaeltnis (
    id                 uuid PRIMARY KEY,
    endkunde_id        uuid NOT NULL REFERENCES energy.endkunde(id),
    anschlussnutzer_id uuid NOT NULL REFERENCES energy.anschlussnutzer(id),
    system_id          uuid NOT NULL REFERENCES energy.system(id),
    datenklasse        text NOT NULL DEFAULT 'abrechnungsminimum',  -- abrechnungsminimum|detailverbrauch (ADR-0004 Anhang B, N2)
    rolle              text NOT NULL,           -- mieter|eigentuemer_selbstnutzer|...
    gueltig_von        timestamptz NOT NULL,
    gueltig_bis        timestamptz,             -- NULL = aktuell
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    -- Verhindert zeitlichen Overlap je (anschlussnutzer_id, system_id):
    -- ohne diesen Schutz könnten sich zwei "aktuelle" Nutzungsverhältnisse
    -- für denselben Anschlussnutzer/dieselbe Messstelle überlappen, was die
    -- DS-07-ABAC-Auswertung (welche Rolle/Datenklasse gilt JETZT) mehrdeutig
    -- machen würde. Finale Spaltenauswahl bleibt Phase-4-Punkt (P4-2,
    -- access-control-engineer, nach Mieter-Klärung ADR §8.2/O3).
    CONSTRAINT ex_nutzung_no_overlap EXCLUDE USING gist (
        anschlussnutzer_id WITH =,
        system_id          WITH =,
        tstzrange(gueltig_von, gueltig_bis) WITH &&
    )
);
-- ABAC-Hot-Path (database-lead-Finding): die ABAC-Policy (ADR-0002) fragt im
-- Zugriffspfad wiederholt "welches ist das AKTUELL gültige
-- Nutzungsverhältnis" -- partieller Index auf offene Intervalle hält diesen
-- Pfad schlank, statt über alle historischen Zeilen zu scannen.
CREATE INDEX ix_nutzung_anschlussnutzer_aktiv
    ON energy.nutzungsverhaeltnis (anschlussnutzer_id) WHERE gueltig_bis IS NULL;
CREATE INDEX ix_nutzung_system_aktiv
    ON energy.nutzungsverhaeltnis (system_id) WHERE gueltig_bis IS NULL;

CREATE TABLE energy.zaehler (
    id               uuid PRIMARY KEY,
    system_id        uuid NOT NULL REFERENCES energy.system(id),
    geraetetyp       text NOT NULL,             -- Messgeräte-Wahl (TB-01)
    energietraeger   text NOT NULL,             -- strom|waerme|kaelte|gas|oel|biomasse (F7)
    status           text NOT NULL DEFAULT 'aktiv',  -- aktiv|stillgelegt -- NIE hart löschen (database-lead-Votum, S3-Bedingung b)
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
    -- geraete_referenz (devEUI/Seriennr., ADR-0004 Anhang B Q1) bewusst
    -- NICHT angelegt -- siehe Datei-Kopf, Abweichung (a). Quasi-Identifier-
    -- Klassifizierung offen (ADR §20.1, O4); Nachtrag = eigene, spätere
    -- Migration, sobald compliance-director final entschieden hat.
);

-- Serie/Kanal: trägt die energieträger-übergreifende Messgröße/Einheit-
-- Dimension. kanal_key = kompaktes Integer-Surrogat für das Hypertable
-- (timescale-engineer-Finding: 4 statt 16 Byte je Zeile in Heap + Index bei
-- 10^8-10^9 Zeilen).
CREATE TABLE energy.messkanal (
    id             uuid PRIMARY KEY,            -- UUIDv7 (Außenschlüssel bleibt)
    kanal_key      integer GENERATED ALWAYS AS IDENTITY UNIQUE,  -- 4-Byte-Surrogat für measurement
    zaehler_id     uuid NOT NULL REFERENCES energy.zaehler(id),
    messgroesse    text NOT NULL,               -- wirkarbeit|thermische_energie|volumen|temperatur|...
    einheit        text NOT NULL,               -- kWh|m3|degC|...
    art            text NOT NULL,               -- kumulativ_zaehlerstand|intervall_verbrauch
    status         text NOT NULL DEFAULT 'aktiv',  -- aktiv|stillgelegt -- NIE hart löschen (database-lead-Votum, S3-Bedingung b)
    obis_kennzahl  text,                         -- nur Strom, sonst NULL
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    -- Verhindert doppelt angelegte Kanäle für denselben Zähler/dieselbe
    -- Messgröße/OBIS-Kennzahl (Datenqualität für den Ingest-Lookup, ADR-0005).
    UNIQUE (zaehler_id, messgroesse, obis_kennzahl)
);

-- Messkonzept: versioniertes Fachobjekt je Endkunde (TB-01), Header +
-- immutable Versionen (append-only, Abweichung (e): kein updated_at).
CREATE TABLE energy.messkonzept (
    id          uuid PRIMARY KEY,
    endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutable Versionen: kein updated_at (Versions-Semantik, Abweichung (e)).
CREATE TABLE energy.messkonzept_version (
    id                          uuid PRIMARY KEY,
    messkonzept_id              uuid NOT NULL REFERENCES energy.messkonzept(id),
    version_nr                  int  NOT NULL,
    typ                         text NOT NULL,   -- vereinfacht|standard|alternativ
    -- TB-01-Pflichtinhalte (versionsweit); Energieträger + Baseline je
    -- Träger -> eigene Link-Tabelle (s. u., database-lead-Votum S8):
    systemgrenze                text NOT NULL,   -- (2)
    systembeschreibung          text NOT NULL,   -- (3)
    bereinigungsverfahren       text NOT NULL,   -- (5)
    messgeraete_wahl            text NOT NULL,   -- (6)
    geraeteerkennungs_verfahren text NOT NULL,   -- (7)
    aenderungsgrund             text,            -- TB-01: Änderungen darzulegen
    anzeige_status              text,            -- Slot für Anzeige-Workflow (späterer ADR)
    gueltig_von                 timestamptz NOT NULL,
    gueltig_bis                 timestamptz,     -- NULL = aktuelle Version
    created_at                  timestamptz NOT NULL DEFAULT now(),
    -- Verhindert doppelte Versionsnummern je Messkonzept.
    UNIQUE (messkonzept_id, version_nr)
);
-- Änderungshistorie = append-only (audit-ready); keine destruktiven Updates.

-- (1) Energieträger + (4) Baseline je Energieträger -- statt skalarer
-- baseline_*-Spalten am messkonzept_version (database-lead-Votum S8):
-- eindeutige Baseline-Zuordnung bei Mehr-Energieträger-Messkonzepten.
-- Append-only wie messkonzept_version (Abweichung (e): kein updated_at).
CREATE TABLE energy.messkonzept_version_energietraeger (
    id                     uuid PRIMARY KEY,
    messkonzept_version_id uuid NOT NULL REFERENCES energy.messkonzept_version(id),
    energietraeger         text NOT NULL,   -- strom|waerme|kaelte|gas|oel|biomasse
    baseline_wert          numeric,         -- TB-02-Slot (Berechnung = ADR-0006)
    baseline_einheit       text,
    baseline_methode       text,
    baseline_begruendung   text,            -- Pflicht wenn < 3 Jahresabrechnungen (TB-02)
    baseline_beleg_ref     uuid,            -- Slot, KEIN FK (Beleg-ADR)
    created_at             timestamptz NOT NULL DEFAULT now(),
    -- Verhindert mehrdeutige Baseline-Zuordnung: höchstens ein Eintrag je
    -- Energieträger und Messkonzept-Version.
    UNIQUE (messkonzept_version_id, energietraeger)
);

-- TB-05-Vorbereitung: Gerätegruppen + Zuordnung von Verbrauchsanteilen
-- (Kanälen). Quoten-Berechnung/Reports sind späterer Scope.
CREATE TABLE energy.geraetegruppe (
    id           uuid PRIMARY KEY,
    endkunde_id  uuid NOT NULL REFERENCES energy.endkunde(id),
    bezeichnung  text NOT NULL,
    beschreibung text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Zuordnungstabelle (append-only wie messkonzept_version, Abweichung (e):
-- kein updated_at -- reine Zuordnungs-/Anteils-Metadatum ohne fachlichen
-- In-Place-Update-Bedarf; eine Anteils-Änderung ist eine neue Zeile/ein
-- neuer Zuordnungs-Vorgang, kein Update-Fall).
CREATE TABLE energy.geraetegruppe_kanal (
    geraetegruppe_id uuid NOT NULL REFERENCES energy.geraetegruppe(id),
    messkanal_id     uuid NOT NULL REFERENCES energy.messkanal(id),
    anteil_prozent   numeric,                   -- Zuordnungs-Metadatum (Quoten-Report = später)
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (geraetegruppe_id, messkanal_id)
);

-- updated_at-Trigger: eigene Funktion je Schema (bewusst dupliziert, rote
-- Linie 5). Ausnahmen ohne Trigger: messkonzept, messkonzept_version,
-- messkonzept_version_energietraeger, geraetegruppe_kanal (Abweichung (e)).
CREATE FUNCTION energy.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_endkunde_updated_at BEFORE UPDATE ON energy.endkunde
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_anschlussnutzer_updated_at BEFORE UPDATE ON energy.anschlussnutzer
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_system_updated_at BEFORE UPDATE ON energy.system
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_nutzungsverhaeltnis_updated_at BEFORE UPDATE ON energy.nutzungsverhaeltnis
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_zaehler_updated_at BEFORE UPDATE ON energy.zaehler
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_messkanal_updated_at BEFORE UPDATE ON energy.messkanal
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();
CREATE TRIGGER trg_geraetegruppe_updated_at BEFORE UPDATE ON energy.geraetegruppe
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();

-- =====================================================================
-- Schema `measurement` -- Messwert-Hypertable (Zeitreihe, pseudonym)
-- =====================================================================

-- Roh-Messwert-Zeitreihe. Referenziert die Serie über kanal_key (int,
-- kompakt), NICHT über UUID (timescale-engineer-Finding: 4 vs. 16 Byte je
-- Zeile bei ~10^8-10^9 Zeilen/Jahr, F3-Sizing). Wert "as delivered"
-- (kumulativ ODER intervall gemäß energy.messkanal.art); KEINE
-- verlustbehaftete Umrechnung beim Ingest (Idempotenz, DE-02-Zählerstände,
-- ADR §14).
CREATE TABLE measurement.messwert (
    messkanal_key integer       NOT NULL,        -- = energy.messkanal.kanal_key (FK-los, s. u.)
    ts            timestamptz   NOT NULL,        -- UTC, Zeit-Dimension (Hypertable-Partitionsspalte)
    wert          numeric(18,3) NOT NULL,        -- numeric für DE-03-Nachweisbarkeit; finale Scale = Phase-4-Punkt P4-1
    qualitaet     smallint      NOT NULL DEFAULT 0,  -- 0=gemessen,1=geschaetzt,2=korrigiert,3=ersatzwert
    herkunft      smallint      NOT NULL DEFAULT 0,  -- 0=ingest_live,1=backfill,2=manuell,3=import_altsystem
    erfasst_at    timestamptz   NOT NULL DEFAULT now()  -- Schreibzeit = created_at-Analog (<> ts); dok. Abweichung (b)
) WITH (fillfactor = 90);   -- HOT-Updates bei Backfill-Korrekturen (timescale-engineer-Finding)

-- Apache-2-konform: create_hypertable ist erlaubt (.claude/rules/dependencies.md).
-- Compression-/Retention-/Continuous-Aggregate-Policies sind TSL-only und
-- werden hier NICHT verwendet (Archivierungs-Ersatzkonzept = Phase 4,
-- P4-4/P4-5, ADR §14).
SELECT create_hypertable(
    'measurement.messwert', 'ts',
    chunk_time_interval => INTERVAL '7 days'
);

-- Idempotenter Upsert-Ziel-Constraint (ADR-0005-Vorbereitung):
-- (messkanal_key, ts) enthält die Partitionsspalte ts (Timescale-Pflicht
-- für einen Unique-Index auf einem Hypertable) und ist zugleich der
-- primäre Zugriffspfad (Serie + Zeitbereich). Ingest:
-- INSERT ... ON CONFLICT (messkanal_key, ts) DO NOTHING | DO UPDATE
-- (Backfill-Korrektur). KEIN globaler ts-Zweit-Index (timescale-engineer-
-- Votum): systemweite Sichten gehören ins Rollup (Phase 4), nicht in einen
-- teuren Zusatz-Index auf dem Schreibpfad (M3: >= 50.000 Messwerte/s).
CREATE UNIQUE INDEX ux_messwert_kanal_ts
    ON measurement.messwert (messkanal_key, ts DESC);

-- Bewusste Abweichungen von .claude/rules/database-migrations.md, s. Datei-
-- Kopf (b)-(d): kein UUID-PK, erfasst_at statt created_at, kein updated_at.
--
-- Referenzielle Integrität OHNE FK (database-lead-Votum S3, mitgetragen
-- unter drei Bedingungen -- diese Migration legt NUR das Schema an; die
-- Bedingungen selbst sind Betriebs-/Ingest-Aufgaben AUSSERHALB dieser
-- Migration):
--   (a) täglicher Orphan-Check-Job MIT Alerting (nicht nur Logging) für
--       verwaiste messkanal_key-Werte -- Umsetzung: devops-lead/ADR-0005.
--   (b) energy.zaehler/energy.messkanal tragen bereits `status` und werden
--       NIE hart gelöscht (siehe oben) -- strukturell in dieser Migration
--       erfüllt.
--   (c) der Ingest-Service (ADR-0005) validiert den Kanal vor dem Insert --
--       Umsetzung: document-ingestion-/integration-engineer, ADR-0005.
