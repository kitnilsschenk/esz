-- V0059 — ingest.quelle: verwaltete Datenquellen-Konfiguration
--
-- WARUM DIESE TABELLE
-- ===================
-- Eine Datenquelle entstand bisher ausschliesslich dadurch, dass ein
-- Worker-Prozess mit bestimmten Umgebungsvariablen startet. In der Plattform
-- liess sich weder eine anlegen noch ansehen, WAS konfiguriert ist —
-- `ingest.quelle_status` (V0039) ist der Laufzeit-Spiegel des Workers, keine
-- Konfiguration: Er schreibt hinein, niemand sonst.
--
-- Diese Tabelle trennt das sauber: `ingest.quelle` ist die gepflegte
-- Konfiguration (Betrieb legt an), `ingest.quelle_status` bleibt die
-- Selbstauskunft des Prozesses. Verbunden ueber `quelle_code`, bewusst OHNE
-- Fremdschluessel — der Status darf auch dann entstehen, wenn ein Worker mit
-- einem Code startet, der (noch) nicht gepflegt ist. Genau diese Abweichung
-- soll die Betriebssicht zeigen koennen, nicht verhindern.
--
-- ZUGANGSDATEN IN DER DATENBANK — ABWEICHUNG VON ADR-0005 §17
-- ===========================================================
-- ADR-0005 §17 (SEC-2) legte fest: Broker-Zugangsdaten kommen AUSSCHLIESSLICH
-- aus Umgebungsvariablen, nie aus Code oder Datenbank. Diese Migration weicht
-- davon ab — auf ausdrueckliche Entscheidung des Auftraggebers (2026-09-08):
-- Eine Datenquelle soll vollstaendig ueber die Oberflaeche anlegbar sein,
-- einschliesslich Zertifikat. Der Grund ist betrieblich: Wer ein Netz
-- anbindet, sitzt nicht auf der Maschine, auf der der Worker laeuft.
--
-- Die Abweichung wird durch die Bauart aufgefangen, nicht durch Zusicherung:
--
--   1. KEIN Geheimnis liegt im Klartext. Benutzername, Passwort und der
--      private Schluessel des Client-Zertifikats stehen ausschliesslich als
--      Chiffrat (AES-256-GCM, `FieldCipherService`), verschluesselt mit einem
--      DEK je Quelle, der seinerseits gewrappt ist (`ingest.quelle_schluessel`,
--      Muster `device.schluessel` V0010). Es gibt keine Spalte, in die ein
--      Klartext-Geheimnis ueberhaupt passte.
--   2. Die AAD bindet jedes Chiffrat an (quelle_id, feldname). Ein Chiffrat
--      aus einer anderen Quelle oder einem anderen Feld entschluesselt nicht —
--      Umhaengen faellt auf.
--   3. Geheimnisse verlassen die Datenbank NUR in Richtung Worker. Die API
--      gibt sie nie aus (auch nicht maskiert-rueckholbar); die Oberflaeche
--      zeigt „hinterlegt" oder „nicht hinterlegt".
--   4. `broker_host` traegt weiterhin den Backstop gegen Zugangsdaten in der
--      Adresse (`NOT LIKE '%@%'`, uebernommen aus V0039).
--
-- Offen und bewusst NICHT hier geloest: Rotation der hinterlegten
-- Zugangsdaten und ein Ablauf-Datum fuer Zertifikate. Beides gehoert in den
-- Betriebsprozess (devops-lead) und braucht keine Schemaform.

BEGIN;

-- ---------------------------------------------------------------------------
-- Schluesselablage je Quelle (Muster device.schluessel, V0010)
-- ---------------------------------------------------------------------------
-- Ein eigener DEK je Quelle statt eines gemeinsamen: Wird eine Quelle
-- entfernt, laesst sich ihr Schluessel gezielt vernichten, ohne die anderen
-- anzufassen (Krypto-Shred).
CREATE TABLE ingest.quelle_schluessel (
    id          uuid        PRIMARY KEY,            -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002)
    wrapped_dek bytea       NOT NULL,               -- DEK, gewrappt durch das KMS — NIE der Klartext-DEK
    kms_key_id  text        NOT NULL,               -- welcher KMS-Schluessel gewrappt hat (Rotation nachvollziehbar)
    -- `alg_version` gehoert zum Wrapping-Verfahren, nicht zur Zierde: Der
    -- `KeyManagementPort` verlangt sie beim Entpacken (`WrappedDekRef`). Ohne
    -- sie liesse sich ein einmal gewrappter DEK nach einem Verfahrenswechsel
    -- nicht mehr entpacken — dieselbe Spalte fuehren `device.schluessel`
    -- (V0010) und `identity.subjekt_schluessel` (V0002).
    alg_version smallint    NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_quelle_schluessel_dek_nicht_leer CHECK (length(wrapped_dek) > 0),
    CONSTRAINT ck_quelle_schluessel_kms_nicht_leer CHECK (length(btrim(kms_key_id)) > 0),
    CONSTRAINT ck_quelle_schluessel_alg_version    CHECK (alg_version > 0)
);

COMMENT ON TABLE  ingest.quelle_schluessel IS
    'Gewrappter DEK je Datenquelle (ADR-0005 §26.3-Muster). pii=false; grundlage=Art. 32 DSGVO / ISO 27001 A.8.24; retention=mit der Quelle.';
COMMENT ON COLUMN ingest.quelle_schluessel.wrapped_dek IS
    'DEK im gewrappten Zustand. Der Klartext-DEK wird NIE persistiert. pii=false.';

-- ---------------------------------------------------------------------------
-- Die verwaltete Datenquelle
-- ---------------------------------------------------------------------------
CREATE TABLE ingest.quelle (
    id                  uuid        PRIMARY KEY,    -- App: UUIDv7, KEIN DB-DEFAULT
    quelle_code         text        NOT NULL,       -- Kennung; dieselbe, die der Worker als EDMS_INGEST_QUELLE_CODE fuehrt
    bezeichnung         text        NOT NULL,       -- Klartext fuer Menschen ("ChirpStack Netz Lahnstein")
    broker_host         text        NOT NULL,       -- NUR Host[:Port] — niemals Zugangsdaten, s. CHECK
    topic               text        NOT NULL,       -- abonniertes Uplink-Topic (Wildcard-Muster)
    client_id           text        NOT NULL,       -- MQTT-Client-Id; macht doppelt vergebene Sitzungen sichtbar
    tls_modus           text        NOT NULL,       -- kein_tls | tls | mtls
    crypto_key_id       uuid        NOT NULL REFERENCES ingest.quelle_schluessel (id),

    -- Geheimnisse — AUSSCHLIESSLICH als Chiffrat (s. Datei-Kopf Punkt 1/2).
    benutzername_enc      bytea,                    -- NULL = kein Benutzername konfiguriert
    passwort_enc          bytea,                    -- NULL = kein Passwort konfiguriert
    client_schluessel_enc bytea,                    -- privater Schluessel des Client-Zertifikats (mTLS)

    -- Zertifikate sind oeffentliche Bestandteile. Sie werden dennoch
    -- verschluesselt abgelegt: Sie stehen in derselben Zeile wie der private
    -- Schluessel, und eine Ausnahme waere nur eine zusaetzliche Regel, die
    -- irgendwann jemand falsch anwendet.
    ca_zertifikat_enc     bytea,
    client_zertifikat_enc bytea,

    status              text        NOT NULL DEFAULT 'aktiv',   -- aktiv | inaktiv
    notiz               text,                                   -- Freitext fuer den Betrieb
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- Ein Code identifiziert GENAU EINE Quelle: Der Worker laedt seine
    -- Konfiguration ueber ihn, eine Mehrdeutigkeit waere ein Fehlstart.
    CONSTRAINT uq_quelle_code UNIQUE (quelle_code),

    -- Gleiche Form wie ingest.quelle_status.quelle_code (V0039) — der Wert
    -- erscheint in Konfiguration, Betriebssicht und Herkunfts-Mapping.
    CONSTRAINT ck_quelle_code_form CHECK (quelle_code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),

    -- Backstop gegen Zugangsdaten in der Broker-Angabe (uebernommen aus V0039).
    CONSTRAINT ck_quelle_broker_ohne_credentials CHECK (broker_host NOT LIKE '%@%'),
    CONSTRAINT ck_quelle_broker_nicht_leer       CHECK (length(btrim(broker_host)) > 0),
    CONSTRAINT ck_quelle_topic_nicht_leer        CHECK (length(btrim(topic)) > 0),
    CONSTRAINT ck_quelle_client_id_nicht_leer    CHECK (length(btrim(client_id)) > 0),
    CONSTRAINT ck_quelle_bezeichnung_nicht_leer  CHECK (length(btrim(bezeichnung)) > 0),

    CONSTRAINT ck_quelle_tls_modus CHECK (tls_modus IN ('kein_tls', 'tls', 'mtls')),
    CONSTRAINT ck_quelle_status    CHECK (status    IN ('aktiv', 'inaktiv')),

    -- mTLS OHNE Client-Zertifikat waere eine Konfiguration, die beim
    -- Verbinden scheitert — und zwar erst dort, im Worker-Log. Die Datenbank
    -- laesst sie gar nicht erst entstehen.
    CONSTRAINT ck_quelle_mtls_vollstaendig CHECK (
        tls_modus <> 'mtls'
        OR (client_zertifikat_enc IS NOT NULL AND client_schluessel_enc IS NOT NULL)
    ),

    -- Ein Passwort ohne Benutzername ist bei MQTT nicht verwendbar.
    CONSTRAINT ck_quelle_passwort_braucht_benutzer CHECK (
        passwort_enc IS NULL OR benutzername_enc IS NOT NULL
    )
);

COMMENT ON TABLE ingest.quelle IS
    'Gepflegte Konfiguration einer Messdaten-Quelle (Broker). Gegenstueck zu ingest.quelle_status, das der Worker selbst schreibt. pii=false; grundlage=Art. 32 DSGVO / ISO 27001 A.5.17, A.8.24; retention=solange die Quelle gefuehrt wird.';
COMMENT ON COLUMN ingest.quelle.broker_host IS
    'NUR Host[:Port]. Zugangsdaten gehoeren in die *_enc-Spalten, nie in die Adresse (ck_quelle_broker_ohne_credentials). pii=false.';
COMMENT ON COLUMN ingest.quelle.passwort_enc IS
    'AES-256-GCM, AAD an (quelle_id, feld) gebunden. Verlaesst die Datenbank NUR Richtung Ingest-Worker — die API gibt es nie aus. pii=false; secret=true.';
COMMENT ON COLUMN ingest.quelle.client_schluessel_enc IS
    'Privater Schluessel des Client-Zertifikats, AES-256-GCM. Wie passwort_enc: nie ueber die API ausgegeben. pii=false; secret=true.';

CREATE INDEX ix_quelle_status_aktiv ON ingest.quelle (status) WHERE status = 'aktiv';

CREATE TRIGGER trg_quelle_updated_at
    BEFORE UPDATE ON ingest.quelle
    FOR EACH ROW EXECUTE FUNCTION ingest.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
-- Der Worker LIEST nur — er darf seine eigene Konfiguration nicht veraendern.
-- Gepflegt wird ausschliesslich ueber die Anwendung (`edms_app`), und damit
-- ueber die auditierten Fachaktionen.
GRANT SELECT                 ON ingest.quelle            TO edms_ingest_worker;
GRANT SELECT                 ON ingest.quelle_schluessel TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE ON ingest.quelle            TO edms_app;
GRANT SELECT, INSERT         ON ingest.quelle_schluessel TO edms_app;

COMMIT;
