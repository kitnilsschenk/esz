-- V0011__ingest_betriebstabellen.sql
--
-- ADR-Bezug: docs/adr/ADR-0005-messdaten-ingestion.md §25 ("D13 --
-- Orphan-Check & Kanal-Validierung"), §27 ("D15 -- DE-02/TB-04:
-- Luecken-/Ausfall-Erkennung"), §28 ("D16 -- Schema-Skizze"). Design-Owner:
-- technical-director (ADR-0005 Phase-2-Design). Migrations-Entwurf:
-- database-lead. Teil des Phase-4-Migrations-Batches (V0010-V0013),
-- NUR Schema -- Ingest-Gate bleibt ZU (s. V0010-Datei-Kopf).
--
-- Review vor Merge (ausstehend): database-lead (Migrations-Entwurf) +
-- compliance-director (KEINE PII-Spalte, aber personenbeziehbares
-- `deveui_blind_index`-Korrelat, s. u.).
--
-- =====================================================================
-- Namensraum-Abgrenzung + Audit-REVOKE-Ausnahme (verbindlich zu begruenden,
-- Auftrag)
-- =====================================================================
-- Neuer Namensraum `ingest` -- getrennt von `measurement`/`device`, weil er
-- WORKER-BETRIEBSZUSTAND buchhaelt (Fehlerpfad/Freshness/Ausfall), NICHT
-- Fachdaten (energy/measurement) und NICHT die O4-Korrelation (device).
--
-- `ingest.*` FAELLT NICHT unter die `audit`-Schema-`REVOKE UPDATE,
-- DELETE`-Konvention (`.claude/rules/database-migrations.md`, "REVOKE
-- UPDATE, DELETE auf Audit-Tabellen im Schema audit"). Begruendung (analog
-- der bereits in V0003 fuer `audit.ketten_kopf`/`audit.retention_freigabe`
-- etablierten Abgrenzung, s. dortiger Migrations-Kopf "REVOKE-
-- Geltungsbereich"): `ingest.kanal_status` ist eine mutable
-- Ein-Zeile-je-Kanal-Freshness-Tabelle (TB-04, per `GREATEST`-Upsert bei
-- JEDEM erfolgreichen Ingest neu geschrieben) und `ingest.ausfall_vorgang`
-- ist ein mutabler Vorgangs-Status (offen -> andauernd -> behoben) -- BEIDE
-- sind BETRIEBSZUSTAND, KEIN Beweismittel im Sinne des unveraenderlichen
-- Audit-Logs (ADR-0003). Selbst `ingest.eingang_quarantaene` (Dead-Letter,
-- am ehesten "beweismittel-nah") ist als Diagnose-/Retention-Objekt
-- konzipiert (DB-7, Retention-Job noch offen, s. u.), nicht als
-- rechtssicherer Nachweis-Anker -- ein `REVOKE UPDATE, DELETE FROM PUBLIC`
-- waere hier nur eine woertliche, aber sachlich unpassende Uebertragung der
-- Audit-Regel. Diese Abgrenzung ist damit ausdruecklich dieselbe Design-
-- Entscheidung wie in V0003 fuer `ketten_kopf`/`retention_freigabe`
-- ("Arbeitstabelle, kein Vertrauensanker"), NICHT deren woertliche
-- Totalauslegung auf jede neue Betriebstabelle -- compliance-director bitte
-- hierauf pruefen (analog V0003-Praezedenzfall).
--
-- =====================================================================
-- Entscheidungen mit Begruendung
-- =====================================================================
--
-- (D-QUAR-SPALTEN) `ingest.eingang_quarantaene` bekommt ZUSAETZLICH zu den
--   im Auftrag explizit genannten Spalten (`id, grund, rohpayload_redacted,
--   topic_redacted, empfangen_at, created_at`) drei NULLABLE Korrelations-
--   Spalten (`zaehler_id`, `messkanal_key`, `deveui_blind_index`) --
--   Ergaenzung ueber den woertlichen Auftragstext hinaus, aber DECKUNGS-
--   GLEICH mit ADR-0005 §28 (Schema-Skizze) UND zwingend fuer die in §25
--   ausdruecklich geforderte DB-7-Auflage ("Taeglicher Orphan-Check-Job ...
--   aggregiert die Quarantaene-Tabelle nach grund + Haeufigkeit/Dauer je
--   (soweit aufloesbar) zaehler_id/Blind-Index") -- ohne diese Spalten waere
--   diese Aggregation strukturell unmoeglich. Bewusst NICHT ergaenzt:
--   `alert_status`/`ts_uplink` (ADR-Skizze §28 nennt sie, aber weder der
--   Auftragstext noch DB-7 selbst verlangen sie zwingend fuer den
--   Migrations-Batch -- Alert-Zustand ist App-/Job-Scope, `ts_uplink` kein
--   Pflichtfeld fuer die Orphan-Aggregation; offener Punkt, s. finale
--   Antwort).
--
-- (D-GRUND) `grund` bekommt ein `CHECK`-Constraint mit der VOLLSTAENDIGEN
--   Reason-Code-Liste aus ADR-0005 §25-Tabelle (acht Werte) -- der
--   Auftragstext nennt nur "u. a." fuenf Beispiele; die ADR-Tabelle ist die
--   massgebliche, vollstaendige Quelle. Schreibweise `decode_fehler`
--   (ADR-Kanon) statt der im Auftragstext abweichend geschriebenen
--   "decoder_fehler" uebernommen -- Vokabular-Konsistenz mit ADR-0005 §25
--   hat Vorrang, da Anwendungscode exakt diese Strings schreiben wird.
--   Muster (CHECK statt nur Kommentar-Konvention): analog V0005
--   (`ck_system_status`) fuer einen kleinen, kontrollierten Wertebereich.
--
-- (D-PAYLOAD) `ck_quarantaene_payload_vorhanden`: erzwingt SEC-1 (ADR-0005
--   §25) auf DB-Ebene -- entweder das redigierte JSON (`rohpayload_
--   redacted`) ODER (bei `envelope_parse_fehler`, wo kein geparstes Objekt
--   existiert) Laenge+Hash sind vorhanden, nie beides leer. Kein
--   spekulativer Constraint: setzt eine im ADR als Blocker-geloest
--   markierte Sicherheitsanforderung strukturell durch, statt sie
--   ausschliesslich der Anwendungsschicht zu ueberlassen.
--
-- (D-KANAL-STATUS-KEIN-TRIGGER) `ingest.kanal_status` bekommt BEWUSST
--   KEINEN `updated_at`-Trigger (Abweichung vom sonstigen "wenn inhaltlich
--   passend"-Muster) -- explizite Auftragsvorgabe: "Die GREATEST-Upsert-
--   Semantik ist App-Code, nicht Schema -- nur Kommentar." Sachlich
--   begruendet: diese Tabelle wird bei JEDEM erfolgreichen Uplink
--   geschrieben (ADR-0005 §20 Schritt 11, M3: >= 50.000/s) -- ein
--   BEFORE-UPDATE-Trigger auf diesem Hochfrequenz-Pfad waere zusaetzlicher
--   Overhead OHNE fachlichen Mehrwert (die GREATEST-Monotonie-Garantie
--   MUSS ohnehin in der App-seitigen Upsert-Anweisung selbst stehen, ein
--   generischer `updated_at := now()`-Trigger haette darauf keinen
--   Einfluss). `ingest.ausfall_vorgang` dagegen mutiert SELTEN (Vorgangs-
--   Statuswechsel, kein Hot-Path) -- dort IST ein Trigger inhaltlich
--   passend und wird gesetzt (s. u.).
--
-- (D-AUSFALL-ERKANNT-AT) `ingest.ausfall_vorgang.erkannt_at` ersetzt die
--   Standard-`created_at`-Spalte (dokumentierte, benannte Abweichung von
--   `.claude/rules/database-migrations.md`, analog V0002 Abweichung (b)
--   `measurement.messwert.erfasst_at`): der Zeitpunkt, an dem der
--   periodische Freshness-Check den Ausfall ERKENNT, IST der Zeitpunkt der
--   Zeilen-Anlage -- eine zusaetzliche, inhaltsgleiche `created_at`-Spalte
--   waere reine Doppelung. Fachlich sprechenderer Name fuer eine Tabelle,
--   deren Existenz-Zeitpunkt selbst die fachliche Aussage ist ("wann wurde
--   der Ausfall festgestellt").
--
-- (D-AUSFALL-OFFEN-INDEX) Partieller Unique-Index `ux_ausfall_vorgang_
--   offen_je_kanal` (analog V0008 `ux_endkunde_shred_antrag_offen_je_
--   endkunde`): hoechstens EIN nicht-behobener Ausfall-Vorgang je Kanal --
--   verhindert doppelte "offene" Zeilen, wenn der periodische Freshness-
--   Check denselben Ausfall wiederholt erkennt, bevor er als `behoben`
--   markiert wurde.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> ingest.set_updated_at() -> eingang_quarantaene (+ CHECKs +
-- Index) -> kanal_status (ohne Trigger, s. D-KANAL-STATUS-KEIN-TRIGGER) ->
-- ausfall_vorgang (+ CHECK + Trigger + partieller Index) -> Grants
-- (edms_ingest_worker, bereits angelegt in V0010).

CREATE SCHEMA ingest;

-- Eigene, je-Schema-duplizierte Trigger-Funktion (rote Linie 5, V0002/V0003/
-- V0010-Konvention) -- nur fuer ingest.ausfall_vorgang genutzt (s. o.).
CREATE FUNCTION ingest.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- ingest.eingang_quarantaene -- Dead-Letter (ADR-0005 §25, S3a/SEC-1)
-- =====================================================================
CREATE TABLE ingest.eingang_quarantaene (
    id                  uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT
    grund               text        NOT NULL,       -- Reason-Code, s. CHECK unten (ADR-0005 §25-Tabelle)
    zaehler_id          uuid,                        -- LOGISCHER Verweis (kein FK), NULLABLE -- nicht immer aufloesbar (D-QUAR-SPALTEN)
    messkanal_key       integer,                     -- LOGISCHER Verweis auf energy.messkanal.kanal_key (kein FK), NULLABLE
    deveui_blind_index  bytea,                       -- NIEMALS Klartext-DevEUI (RL-2) -- nur der deterministische Blind-Index, NULLABLE
    rohpayload_redacted jsonb,                       -- redigiertes, DevEUI-freies Envelope-JSON; NULL bei envelope_parse_fehler (SEC-1)
    payload_laenge      integer,                     -- Byte-Laenge der Rohbytes; NUR bei envelope_parse_fehler befuellt (SEC-1)
    payload_hash        bytea,                       -- SHA-256 der Rohbytes (Wiedererkennung ohne Inhalt); NUR bei envelope_parse_fehler befuellt
    topic_redacted      text        NOT NULL,        -- MQTT-Topic mit Geraete-/DevEUI-Segment redigiert (RL-2) -- immer ableitbar, daher NOT NULL
    empfangen_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_quarantaene_grund CHECK (grund IN (
        'envelope_parse_fehler', 'devEUI_unbekannt', 'unbekannter_geraetetyp',
        'decode_fehler', 'kanal_unbekannt', 'unplausibel_monotonie_verletzt',
        'einheit_inkonsistent', 'zeitstempel_fehlt'
    )),
    -- SEC-1 (ADR-0005 §25, Blocker geloest): entweder das redigierte JSON
    -- ODER (envelope_parse_fehler) Laenge+Hash -- nie beides leer.
    CONSTRAINT ck_quarantaene_payload_vorhanden CHECK (
        rohpayload_redacted IS NOT NULL
        OR (payload_laenge IS NOT NULL AND payload_hash IS NOT NULL)
    )
);
COMMENT ON COLUMN ingest.eingang_quarantaene.deveui_blind_index IS
  'personenbeziehbar=true; pii=false; art=deterministisches-korrelat (identisch zu device.geraet_zuordnung.deveui_blind_index, ADR-0005 §26.3) -- dient NUR der Wiedererkennung "dieselbe fehlerhafte Quelle", NIEMALS Klartext-DevEUI (RL-2); ADR-0005 §25';
COMMENT ON COLUMN ingest.eingang_quarantaene.rohpayload_redacted IS
  'pii=false: enthaelt ausschliesslich das geparste, DevEUI-freie Envelope-JSON (feldbasierte Redaction, ADR-0005 §25); bei envelope_parse_fehler IMMER NULL (SEC-1, s. CHECK ck_quarantaene_payload_vorhanden) -- feldbasierte Redaction setzt ein erfolgreich geparstes JSON-Objekt voraus.';
COMMENT ON COLUMN ingest.eingang_quarantaene.topic_redacted IS
  'pii=false: MQTT-Topic mit Geraete-/DevEUI-Pfadsegment redigiert (RL-2, ADR-0005 §25) -- niemals der Rohtopic mit Klartext-Geraetekennung.';

-- DB-7 (Auftrag, ADR-0005 §25): traegt den taeglichen Orphan-Check-
-- Aggregations-Zugriffspfad ("nach grund + Haeufigkeit/Dauer").
CREATE INDEX ix_quarantaene_grund_empfangen ON ingest.eingang_quarantaene (grund, empfangen_at);

-- Retention/Wachstum dieser Tabelle ist ein OFFENER PUNKT (DB-7,
-- retention-engineer/compliance-director, ADR-0005 §25/§31) -- NICHT Teil
-- dieser Migration, NICHT v1-blockierend (synthetic-only, geringes Volumen).

-- =====================================================================
-- ingest.kanal_status -- TB-04-Freshness (ADR-0005 §27, TS-3)
-- =====================================================================
-- Natuerlicher Schluessel statt UUID-Surrogat (dokumentierte Abweichung,
-- analog audit.ketten_kopf/measurement.messwert -- V0002/V0003-Praezedenz):
-- `messkanal_key` IST der einzig sinnvolle externe Bezugspunkt fuer eine
-- 1-Zeile-je-Kanal-Freshness-Tabelle; ein zusaetzliches UUID waere nie
-- referenziert. Typ exakt wie energy.messkanal.kanal_key/measurement.
-- messwert.messkanal_key (V0002): integer.
--
-- KEIN updated_at-Trigger (s. Datei-Kopf D-KANAL-STATUS-KEIN-TRIGGER):
-- die GREATEST-Upsert-Semantik ist App-Code (ADR-0005 §20 Schritt 11,
-- §27 TS-3), NICHT hier als Trigger nachgebildet -- nur als Kommentar
-- dokumentiert:
--   INSERT INTO ingest.kanal_status (messkanal_key, letzter_ts, updated_at)
--   VALUES ($1, $2, now())
--   ON CONFLICT (messkanal_key) DO UPDATE SET
--     letzter_ts = GREATEST(EXCLUDED.letzter_ts, ingest.kanal_status.letzter_ts),
--     updated_at = now();
-- (NIE ein bedingungsloses Ueberschreiben -- sonst dreht ein spaeter
-- verarbeiteter Backfill-Datensatz das TB-04-Freshness-Signal rueckwaerts,
-- ADR-0005 §20 Schritt 11/TS-3.)
CREATE TABLE ingest.kanal_status (
    messkanal_key integer     PRIMARY KEY,   -- LOGISCHER Verweis auf energy.messkanal.kanal_key (kein FK, Konvention V0002)
    letzter_ts    timestamptz NOT NULL,       -- monoton via GREATEST-Upsert (App-Code, s. o.)
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- ingest.ausfall_vorgang -- TB-04-Ausfall-Dokumentation (ADR-0005 §27)
-- =====================================================================
CREATE TABLE ingest.ausfall_vorgang (
    id            uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT
    messkanal_key integer     NOT NULL,       -- LOGISCHER Verweis auf energy.messkanal.kanal_key (kein FK)
    status        text        NOT NULL DEFAULT 'offen',  -- offen|andauernd|behoben (ADR-0005 §27)
    beginn_ts     timestamptz NOT NULL,       -- letzter bekannter guter Zeitstempel vor dem erkannten Ausfall
    ende_ts       timestamptz,                -- gesetzt bei status='behoben'; NULL waehrend laufendem Ausfall
    erkannt_at    timestamptz NOT NULL DEFAULT now(),  -- ersetzt created_at (D-AUSFALL-ERKANNT-AT, dok. Abweichung)
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_ausfall_vorgang_status CHECK (status IN ('offen', 'andauernd', 'behoben'))
);

-- D-AUSFALL-OFFEN-INDEX: hoechstens EIN nicht-behobener Ausfall je Kanal
-- (analog V0008 ux_endkunde_shred_antrag_offen_je_endkunde) -- verhindert
-- doppelte offene Zeilen bei wiederholter Erkennung desselben Ausfalls.
CREATE UNIQUE INDEX ux_ausfall_vorgang_offen_je_kanal
    ON ingest.ausfall_vorgang (messkanal_key) WHERE status <> 'behoben';

CREATE TRIGGER trg_ausfall_vorgang_updated_at BEFORE UPDATE ON ingest.ausfall_vorgang
    FOR EACH ROW EXECUTE FUNCTION ingest.set_updated_at();

-- =====================================================================
-- Grants -- edms_ingest_worker (Rolle bereits angelegt in V0010)
-- =====================================================================
-- SELECT, INSERT, UPDATE auf ingest.* -- KEIN DELETE (Bereinigung/Retention
-- spaeter ueber eine separate, privilegierte Rolle -- Auftragsvorgabe;
-- DB-7-Retention-Job selbst ist noch offener Punkt, s. o.).

GRANT USAGE ON SCHEMA ingest TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE ON ingest.eingang_quarantaene TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE ON ingest.kanal_status         TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE ON ingest.ausfall_vorgang       TO edms_ingest_worker;
