-- V0039 — ingest.quelle_status: Herzschlag und Verbindungszustand je
-- Netzserver-Quelle (ADR-0011 O8 + D8).
--
-- ANLASS
-- ------
-- Zwei Fragen liessen sich bisher aus der Plattform heraus nicht beantworten:
--
--   1. "Steht die Verbindung zum ChirpStack gerade?" Der Ingest-Worker ist ein
--      eigener Prozess; seine Zaehler leben in dessen Speicher, und die API
--      kommt nicht daran. Die Betriebssicht konnte deshalb nur sagen, WANN
--      zuletzt geschrieben wurde -- nicht, ob ueberhaupt noch jemand
--      zuhoert.
--   2. "Auf welchem Broker und welchem Topic haengen wir eigentlich?" Diese
--      Konfiguration steht in Umgebungsvariablen des Worker-Prozesses und
--      war nirgends sichtbar.
--
-- Beides loest dieselbe Tabelle: Der Worker schreibt regelmaessig, WER er
-- ist, WORAUF er hoert und WIE es ihm geht.
--
-- MEHRERE NETZSERVER (ADR-0011 D8)
-- --------------------------------
-- Der Zuschnitt ist EINE ZEILE JE QUELLE, nicht eine Zeile insgesamt. Ein
-- Betrieb mit zwei ChirpStacks faehrt zwei Worker-Prozesse mit je eigenem
-- `EDMS_INGEST_QUELLE_CODE`. Ohne diese Dimension waere die Betriebssicht
-- aktiv irrefuehrend: Liefert Netz A weiter und Netz B seit einem Tag nichts,
-- saehe eine zusammengefasste Kennzahl frisch aus -- und beruhigte ueber
-- einen Ausfall hinweg.
--
-- WARUM `verbunden` ALLEIN NICHT REICHT
-- -------------------------------------
-- Ein abgestuerzter Worker kann sein `verbunden` nicht mehr auf false setzen;
-- die Zeile bliebe fuer immer gruen. Die Wahrheit ergibt sich deshalb erst
-- aus BEIDEN Spalten: `verbunden` UND einem frischen
-- `letzter_herzschlag_at`. Die Bewertung, ab wann ein Herzschlag alt ist,
-- trifft die Anwendung (benannte Konstante), nicht diese Migration -- ein
-- Schwellenwert im Schema waere ohne Migration nicht korrigierbar.
--
-- KEINE ZUGANGSDATEN (RL-2-Linie)
-- -------------------------------
-- `broker_host` fuehrt AUSSCHLIESSLICH Host und Port. Eine Broker-URL kann
-- Zugangsdaten tragen (`mqtt://benutzer:geheim@host:1883`); der Worker
-- entfernt sie vor dem Schreiben, und der CHECK unten ist der Backstop --
-- dieselbe Doppelung aus Anwendungsregel und DB-Constraint wie bei den
-- Quarantaene-Spalten (V0011).
--
-- KEINE ZEITREIHE
-- ---------------
-- Bewusst KEINE Hypertable und keine Historie: Die Tabelle traegt den
-- AKTUELLEN Zustand je Quelle (Upsert), nicht dessen Verlauf. Wer den
-- Verlauf braucht, braucht eine eigene Entscheidung darueber, wie lange er
-- vorgehalten wird -- und die faellt nicht nebenbei.
--
-- Review-Bedarf (`.claude/rules/database-migrations.md`): `database-lead`.
-- `compliance-director` NICHT zwingend (keine personenbezogene Spalte), aber
-- die Sichtbarkeit der Infrastruktur-Konfiguration fuer die Rolle
-- `compliance-auditor` gehoert bestaetigt.

CREATE TABLE ingest.quelle_status (
    id                    uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002)
    quelle_code           text        NOT NULL,       -- Kennung des Netzservers, aus EDMS_INGEST_QUELLE_CODE
    broker_host           text        NOT NULL,       -- NUR Host[:Port] -- niemals Zugangsdaten, s. Datei-Kopf
    topic                 text        NOT NULL,       -- abonniertes Uplink-Topic (Muster mit Wildcards)
    client_id             text        NOT NULL,       -- MQTT-Client-Id; macht doppelt vergebene Sitzungen sichtbar
    verbunden             boolean     NOT NULL,       -- Selbstauskunft des Workers -- NUR zusammen mit dem Herzschlag aussagekraeftig
    letzte_verbindung_at  timestamptz,                -- letzter erfolgreicher Verbindungsaufbau; NULL = seit Start nie verbunden
    letzter_herzschlag_at timestamptz NOT NULL,       -- laeuft der Prozess noch? s. Datei-Kopf
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    -- Der Code erscheint in Konfiguration, Betriebssicht und spaeter im
    -- Herkunfts-Mapping (ADR-0011 B2). Eine enge Form haelt ihn dort
    -- handhabbar und schliesst Leerzeichen-Verwechslungen aus.
    CONSTRAINT ck_quelle_status_code_form CHECK (quelle_code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),

    -- Backstop gegen Zugangsdaten in der Broker-Angabe (s. Datei-Kopf).
    CONSTRAINT ck_quelle_status_broker_ohne_credentials CHECK (broker_host NOT LIKE '%@%'),
    CONSTRAINT ck_quelle_status_broker_nicht_leer       CHECK (length(btrim(broker_host)) > 0),
    CONSTRAINT ck_quelle_status_topic_nicht_leer        CHECK (length(btrim(topic)) > 0)
);

-- Eine Quelle, ein Zustand. Der Worker upsertet auf diesen Schluessel.
CREATE UNIQUE INDEX ux_quelle_status_quelle_code ON ingest.quelle_status (quelle_code);

CREATE TRIGGER trg_quelle_status_updated_at BEFORE UPDATE ON ingest.quelle_status
    FOR EACH ROW EXECUTE FUNCTION ingest.set_updated_at();

COMMENT ON TABLE  ingest.quelle_status                       IS 'Aktueller Zustand je Netzserver-Quelle (ADR-0011 O8/D8). Kein Verlauf, keine Zeitreihe. pii=false.';
COMMENT ON COLUMN ingest.quelle_status.broker_host            IS 'Host[:Port] OHNE Zugangsdaten (CHECK als Backstop). pii=false.';
COMMENT ON COLUMN ingest.quelle_status.verbunden              IS 'Selbstauskunft des Workers. Allein NICHT aussagekraeftig -- ein abgestuerzter Prozess kann sie nicht zuruecksetzen; immer zusammen mit letzter_herzschlag_at bewerten.';
COMMENT ON COLUMN ingest.quelle_status.letzter_herzschlag_at  IS 'Zeitpunkt der letzten Meldung des Workers. Altert der Wert, laeuft der Prozess nicht mehr.';

-- Der Worker schreibt (Upsert), die API liest. Kein DELETE fuer beide:
-- Eine Quelle verschwindet nicht dadurch, dass ihr Worker gerade nicht laeuft
-- -- das Verschwinden waere genau die Information, die man sehen will.
GRANT SELECT, INSERT, UPDATE ON ingest.quelle_status TO edms_ingest_worker;
