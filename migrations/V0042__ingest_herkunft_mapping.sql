-- V0042 — ingest.herkunft_mapping: Uebersetzung der Netzserver-Kennungen in
-- EDMS-Stammdaten, und der Quarantaenegrund fuer den Widerspruch.
-- (ADR-0011 B2/D3 und B3/D4.)
--
-- ANLASS
-- ------
-- Seit V0041 steht an jeder liegengebliebenen Nachricht, aus welchem Netz und
-- aus welcher ChirpStack-Application sie kam -- als OPAKE Kennung. Was fehlt,
-- ist die Uebersetzung: `7b0c677e-…` statt „Gebaeude Lahnstein". Bis dahin
-- muss man jede Kennung im fremden Netzserver nachschlagen, um zu wissen,
-- wovon eine Quarantaene-Zeile ueberhaupt spricht.
--
-- Genau deshalb braucht es die ChirpStack-NAMEN aus D1 nicht: Sobald die
-- Application einem `energy.standort` zugeordnet ist, zeigt die Oberflaeche
-- den EDMS-eigenen Gebaeudenamen -- aus unserem Feldkatalog, unter unserem
-- Loeschkonzept.
--
-- ZWEI SPALTENPAARE, EINE ZEILE JE APPLICATION (D3)
-- ------------------------------------------------
--   chirpstack_tenant_id       ↔ endkunde_id   (n:1 -- ein Tenant, ein Endkunde)
--   chirpstack_application_id  ↔ standort_id   (1:1 -- Application = Gebaeude)
--
-- Ein Endkunde hat mehrere Gebaeude, also mehrere Application-Zeilen zu
-- demselben Tenant. Die Kardinalitaeten sind vom Betreiber bestaetigt
-- (ADR-0011 Abschnitt 2).
--
-- DREI INVARIANTEN, ALLE DEKLARATIV
-- ---------------------------------
-- (1) EINE APPLICATION GEHOERT ZU GENAU EINEM STANDORT.
--     `ux_herkunft_mapping_application` -- unique auf der Application-Kennung
--     ALLEIN, nicht auf (quelle_code, application_id). Eine Application zweimal
--     zuzuordnen ist auch dann falsch, wenn es ueber zwei Netzserver geschieht:
--     dann widersprechen sich die beiden Zeilen, und die Uebersetzung waere
--     nicht mehr eindeutig. `quelle_code` bleibt als Spalte erhalten (WOHER kam
--     die Zuordnung) und wird beim Abgleich mitgeprueft.
--
-- (2) EIN TENANT GEHOERT ZU GENAU EINEM ENDKUNDEN.
--     `ex_herkunft_mapping_tenant_ein_endkunde` -- eine EXCLUDE-Constraint mit
--     `endkunde_id WITH <>`: zwei Zeilen mit demselben Tenant und
--     ABWEICHENDEM Endkunden schliessen einander aus. Derselbe Tenant mit
--     DEMSELBEN Endkunden bleibt beliebig oft erlaubt -- das sind die
--     mehreren Gebaeude. `btree_gist` liefert den `<>`-Operator dafuer (seit
--     V0001 vorhanden); gegen diese Datenbank verifiziert.
--
--     Ohne diese Constraint waere der Abgleich in B3 wertlos: Er fragt „zu
--     welchem Endkunden gehoert dieser Tenant?" und braucht darauf EINE
--     Antwort. Zwei widersprechende Zeilen wuerden die Pruefung je nach
--     Zeilenreihenfolge mal bestehen und mal nicht.
--
-- (3) DER STANDORT GEHOERT DEM ZUGEORDNETEN ENDKUNDEN.
--     `fk_herkunft_mapping_standort_mandant` -- zusammengesetzter Fremd-
--     schluessel auf `energy.standort (id, endkunde_id)` gegen die dortige
--     `ux_standort_id_endkunde`. Dasselbe Muster, mit dem V0017 die
--     Mandantentreue des Standort-Baums sichert (D2.1): Wer Gebaeude X dem
--     Endkunden A zuordnet, obwohl X dem Endkunden B gehoert, bekommt einen
--     FK-Fehler statt einer stillen Fehlzuordnung.
--
--     Ein separater FK auf `energy.endkunde(id)` waere redundant -- er folgt
--     bereits aus diesem FK plus dem FK von `energy.standort.endkunde_id`.
--
-- WAS NICHT ERZWUNGEN WIRD
-- ------------------------
-- `standort.typ = 'gebaeude'` steht NICHT als Constraint hier. Die Aussage
-- „Application = Gebaeude" ist die Struktur BEIM HEUTIGEN Betreiber, nicht
-- eine Eigenschaft des Netzservers -- eine andere Instanz kann eine
-- Application je Liegenschaft fuehren. Die API prueft es als Warnung, das
-- Schema schreibt es nicht fest.
--
-- KEIN AUTO-PROVISIONING (O5)
-- ---------------------------
-- Diese Tabelle macht das Anbinden zu einem bequemen MANUELLEN Vorgang, nicht
-- zu einem automatischen. Der Worker LIEST sie (s. Grants) und legt nie eine
-- Zeile an -- ein unbekanntes Geraet erzeugt weiterhin eine Quarantaene-Zeile.
--
-- NEUER QUARANTAENEGRUND `herkunft_widerspruechlich` (D4)
-- -------------------------------------------------------
-- Kommt der Uplink aus Tenant A, sagt die aufgeloeste EDMS-Kette aber
-- Endkunde B, wird NICHT eingespeist. Begruendung (ADR-0011 D4): Wird ein
-- Geraet im fremden ChirpStack umgehaengt -- versehentlich oder bei einem
-- Wechsel --, fuellt es sonst still die Messwerte des falschen Endkunden. In
-- einem System, das daraus einen Foerderjahres-Nachweis rechnet, ist das der
-- teuerste denkbare stille Fehler. Die Pruefung liegt auf der
-- fail-closed-Linie des uebrigen Ingest-Pfads.
--
-- Der Wert wird der bestehenden `ck_quarantaene_grund`-Liste hinzugefuegt.
-- Anwendungscode MUSS ihn wortgleich schreiben (Vokabular-Konsistenz,
-- `reason-code.ts` haelt dieselbe Liste).
--
-- Review-Bedarf (`.claude/rules/database-migrations.md`): `database-lead`
-- (Schema) und `compliance-director` -- die Tabelle stellt eine Beziehung zu
-- `energy.endkunde` her und ordnet fremde Kennungen einem Datensubjekt-
-- Vertragspartner zu. Personenbezogene Spalten traegt sie nicht: die
-- ChirpStack-Kennungen sind opake UUIDs (D1), `endkunde_id`/`standort_id`
-- sind EDMS-interne Schluessel, und `energy.*` ist seit V0002 PII-frei
-- (rote Linie 1).

CREATE TABLE ingest.herkunft_mapping (
    id                        uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002 S4)
    quelle_code               text        NOT NULL,       -- WOHER die Zuordnung stammt (ADR-0011 D8), gleiche Kennung wie ingest.quelle_status
    chirpstack_tenant_id      uuid        NOT NULL,       -- opake Mandanten-Kennung des Netzservers (D1) -- NUR die ID, nie der Name
    chirpstack_application_id uuid        NOT NULL,       -- opake Application-Kennung des Netzservers (D1) -- NUR die ID, nie der Name
    endkunde_id               uuid        NOT NULL,       -- FK ueber den zusammengesetzten Schluessel unten, s. Invariante (3)
    standort_id               uuid        NOT NULL,       -- dito
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    -- Gleiche Form wie ingest.quelle_status.quelle_code (V0039) und
    -- ingest.eingang_quarantaene.quelle_code (V0041) -- derselbe Wert aus
    -- derselben Umgebungsvariablen.
    CONSTRAINT ck_herkunft_mapping_quelle_code_form
        CHECK (quelle_code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),

    -- Invariante (3), s. Datei-Kopf: Mandantentreue deklarativ, Muster aus
    -- V0017 D2.1.
    CONSTRAINT fk_herkunft_mapping_standort_mandant
        FOREIGN KEY (standort_id, endkunde_id)
        REFERENCES energy.standort (id, endkunde_id),

    -- Invariante (2), s. Datei-Kopf: ein Tenant, ein Endkunde -- mehrere
    -- Gebaeude desselben Tenants bleiben erlaubt.
    CONSTRAINT ex_herkunft_mapping_tenant_ein_endkunde EXCLUDE USING gist (
        chirpstack_tenant_id WITH =,
        endkunde_id          WITH <>
    )
);

-- Invariante (1), s. Datei-Kopf. Zugleich der Hot-Path des Abgleichs in B3
-- und der Quarantaene-Anreicherung: Lookup nach Application-Kennung.
CREATE UNIQUE INDEX ux_herkunft_mapping_application
    ON ingest.herkunft_mapping (chirpstack_application_id);

-- „Welche Gebaeude dieses Endkunden sind angebunden?" -- Zugriffspfad der
-- Verwaltungsoberflaeche. Der Tenant-Lookup des Abgleichs laeuft bereits ueber
-- den GiST-Index der EXCLUDE-Constraint.
CREATE INDEX ix_herkunft_mapping_endkunde ON ingest.herkunft_mapping (endkunde_id);

CREATE TRIGGER trg_herkunft_mapping_updated_at BEFORE UPDATE ON ingest.herkunft_mapping
    FOR EACH ROW EXECUTE FUNCTION ingest.set_updated_at();  -- Wiederverwendung V0011

COMMENT ON TABLE  ingest.herkunft_mapping                           IS 'Uebersetzt Netzserver-Kennungen (Tenant/Application) in EDMS-Stammdaten (Endkunde/Standort) -- ADR-0011 D3. Traegt AUSSCHLIESSLICH opake Fremd-IDs, keine Namen (D1). pii=false.';
COMMENT ON COLUMN ingest.herkunft_mapping.quelle_code               IS 'Aus welchem Netz die Zuordnung stammt (ADR-0011 D8). Ein Uplink derselben Application ueber eine ANDERE Quelle ist ein Herkunfts-Widerspruch. pii=false.';
COMMENT ON COLUMN ingest.herkunft_mapping.chirpstack_tenant_id      IS 'Opake Mandanten-Kennung des Netzservers (ADR-0011 D1); beim Betreiber ein Endkunde. NUR die ID. pii=false.';
COMMENT ON COLUMN ingest.herkunft_mapping.chirpstack_application_id IS 'Opake Application-Kennung des Netzservers (ADR-0011 D1); beim Betreiber ein Gebaeude. NUR die ID. pii=false.';

-- Der Worker LIEST nur (O5: kein Auto-Provisioning -- er legt nie eine
-- Zuordnung an). Gepflegt wird die Tabelle ueber die API.
GRANT SELECT                         ON ingest.herkunft_mapping TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.herkunft_mapping TO edms_app;

-- SPALTENSCHARF (RL-1, Muster aus V0010 §26.4-Rechte-Matrix und V0023):
-- Der Abgleich in B3 muss fragen „welchem Endkunden gehoert der aufgeloeste
-- Zaehler?". Der Weg dahin fuehrt ueber `energy.system`, auf das die
-- Worker-Rolle bisher KEIN Recht hat -- absichtlich, denn ein voller
-- `GRANT SELECT` gaebe ihr auch `bezeichnung` und `systembeschreibung`:
-- Freitext, den der Worker fuer nichts braucht und der in Logs oder
-- Fehlermeldungen landen koennte.
--
-- Gewaehrt werden deshalb genau die zwei Spalten, die die Frage beantworten.
-- Fasst der Worker je eine dritte an, bricht die Query -- statt still mehr zu
-- lesen, als vorgesehen war.
GRANT SELECT (id, endkunde_id) ON energy.system TO edms_ingest_worker;

-- =====================================================================
-- Quarantaenegrund `herkunft_widerspruechlich` (ADR-0011 D4)
-- =====================================================================
-- Erweiterung der geschlossenen Liste aus V0011. Wortgleich mit
-- `INGEST_REASON_CODES` in `reason-code.ts` zu halten.
ALTER TABLE ingest.eingang_quarantaene
    DROP CONSTRAINT ck_quarantaene_grund;

ALTER TABLE ingest.eingang_quarantaene
    ADD CONSTRAINT ck_quarantaene_grund CHECK (grund IN (
        'envelope_parse_fehler', 'devEUI_unbekannt', 'unbekannter_geraetetyp',
        'decode_fehler', 'kanal_unbekannt', 'unplausibel_monotonie_verletzt',
        'einheit_inkonsistent', 'zeitstempel_fehlt',
        'herkunft_widerspruechlich'
    ));
