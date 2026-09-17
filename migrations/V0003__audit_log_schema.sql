-- V0003__audit_log_schema.sql
--
-- ADR-Bezug: docs/adr/ADR-0003-audit-log.md (Status: accepted, 2026-07-10) --
-- Teil B "Phase-2-Design" (Abschnitte 11-23, Anhang D "Kanonische
-- Serialisierung", Anhang E "DSGVO-Datenfeld-Markierung", Anhang F
-- "Rote-Linien-Konformitaet"). DDL-Vorlage: schemas/database/adr-0003-audit-log.md
-- (finale, review-eingearbeitete Skizze, Abschnitte 1-6). Konsistent zu
-- ADR-0004 §12-16 / migrations/V0002__kern_datenmodell_energie.sql (Schema
-- `audit` war dort bewusst NICHT angelegt, Abweichung (f)).
--
-- Design-Owner: technical-director.
-- Lead-Review Teil B (2026-07-09, vollstaendig eingearbeitet, ADR §22):
--   - audit-trail-engineer: Segment (lane, tag_utc) statt globaler/Chunk-Kette;
--     Lane = Hash(korrelations_id) mod N (O-C); Katalog append-only versioniert
--     (Header event_typ + event_typ_version, Finding 3); Kanonisierungs-
--     Stabilitaet ueber PG-Major-Upgrades -> Golden-Byte-Tests (Finding 1,
--     Phase 4); Reihenfolge-Fix ts NACH Kopf-Lock (O-D, Finding 2).
--   - security-lead: FK event_typ zusaetzlich zum Trigger, ON UPDATE CASCADE
--     verboten (O-A); Anker-Haertung stuendlich + Signatur + Publish-Identitaet
--     (O-E, Finding HOCH); retention_drop()-Wrapper + ddl_command_end-Event-
--     Trigger statt Owner-Rechte (O-F); Gnadenfrist via pg_stat_activity (O-G);
--     Werte-Cap im Trigger (O-H); STRIDE: lock_timeout/statement_timeout,
--     search_path-Pinning aller SECURITY-DEFINER-Funktionen, actor_*-Trust-
--     Boundary an ADR-0002 gekoppelt.
-- compliance-director: Phase 1 ohne Veto (Risiko MITTEL, §7.1), Beschaeftigten-
--   datenschutz-Schaerfung Art.88 DSGVO/§26 BDSG (§7.2), fuenf rote Linien
--   (§7.3) mitgetragen. Phase 3 (VT-0002, TOM-Logging, DSFA-0001-Nachtrag,
--   SoA A.8.15/A.5.28/A.8.16/A.8.17/A.5.33, §23 A-O8) steht noch aus -- diese
--   Migration ist Schema-only (Phase-3-Gate hat die Migration selbst
--   freigegeben); Review durch database-lead + compliance-director bleibt vor
--   Merge zwingend (.claude/rules/database-migrations.md).
--
-- GATE-STATUS (unveraendert durch diese Migration): Es wird KEIN Emitter/
-- Schreib-Service (§17, AuditService.append/@AuditAction-Decorator) verdrahtet
-- -- reines DDL (Compliance-Review-Checkpunkt 3). Der PII-Ingest-Gate aus
-- ADR-0004 §6/§7.1 bleibt unberuehrt geschlossen.
--
-- =====================================================================
-- Entschiedene technische Vorsichtspunkte (Auftrag: "entscheide + dokumentiere")
-- =====================================================================
--
-- (V1) ROLLEN SIND CLUSTER-GLOBAL: `CREATE ROLE` kennt kein `IF NOT EXISTS`.
--   Jede der vier Rollen wird daher in einem eigenen DO-Block mit
--   `EXCEPTION WHEN duplicate_object` angelegt (Standard-Idiom fuer
--   idempotente Rollen-Anlage). DOWN-MIGRATION DROPPT DIE ROLLEN NICHT
--   (dokumentierter Teil-No-Op, analog V0001-Extensions): (a) Rollen sind
--   cluster-, nicht datenbankweit -- ein Rollback DIESER Migration kann nicht
--   sicher wissen/pruefen, ob die Rolle in einer ANDEREN Datenbank desselben
--   Clusters noch Eigentuemer/Grantee ist (DROP ROLE schlaegt dann ohnehin
--   fehl, aber das Fehlschlagen waere abhaengig vom Cluster-Zustand, nicht
--   deterministisch); (b) `edms_app` ist bewusst so benannt, dass es
--   voraussichtlich zur schemauebergreifenden Runtime-Rolle des gesamten
--   Backend-Service wird (nicht nur `audit`) -- eine spaetere Migration
--   (Grants auf `energy`/`identity`/`measurement`, ADR-0002) wird sie
--   vermutlich weiterverwenden; sie in diesem Rollback zu droppen waere ein
--   versteckter Bruch fuer noch nicht geschriebenen Code. Rollen-Anlage bleibt
--   damit dieselbe konservative Linie wie V0001 (Extensions nicht im Down
--   entfernen).
--
-- (V2) EVENT-TRIGGER BRAUCHT SUPERUSER: `CREATE EVENT TRIGGER` verlangt in
--   PostgreSQL immer eine Superuser-Rolle (keine graduelle GRANT-Abstufung
--   moeglich) -- im Dev-Container ist der DB-User Superuser (Standard-
--   Bootstrap-User des offiziellen Postgres-/Timescale-Images), in
--   verwalteten Cloud-Postgres-Diensten (z. B. RDS/Azure Database for
--   PostgreSQL) ist der Migrations-User i. d. R. KEIN Superuser. Ein hartes
--   `CREATE EVENT TRIGGER` wuerde dort die GESAMTE Migration (eine
--   Transaktion) zum Abbruch bringen und damit auch alle unproblematischen
--   Tabellen/Funktionen/REVOKEs verhindern. Entscheidung: bedingte Anlage in
--   einem DO-Block (`current_setting('is_superuser')`), bei fehlendem
--   Superuser-Recht NUR `RAISE WARNING` statt Abbruch, mit explizit
--   dokumentiertem manuellen Prod-Nachzieh-Schritt (devops-lead/security-lead)
--   im Warntext selbst. Analoge Absicherung im Down-Pfad vor `DROP SCHEMA
--   audit CASCADE` (Event-Trigger haengen nicht an einem Schema, sondern sind
--   eigene Datenbank-Objekte -- CASCADE wuerde sie zwar ueber die Abhaengigkeit
--   zu `audit.melde_ddl()` mit entfernen, aber mit identischem
--   Superuser-Bedarf und einer weniger aussagekraeftigen Fehlermeldung).
--
-- (V3) SECURITY-DEFINER-FUNKTIONEN: verifiziert -- alle vier `SECURITY
--   DEFINER`-Funktionen der Skizze (`event_seal`, `versiegle`,
--   `markiere_publiziert`, `retention_drop`) tragen bereits `SET search_path =
--   audit, pg_temp` (unveraendert uebernommen). `melde_ddl()` (Event-Trigger-
--   Funktion) und `pruefe_kette()` sind NICHT `SECURITY DEFINER` (Invoker-
--   Rechte) und referenzieren ausschliesslich schema-qualifizierte Namen
--   (`audit.event`, `audit.genesis`, `audit.canon_event`, `pg_event_trigger_*`,
--   `pg_notify`) -- kein `search_path`-Pinning noetig, da keine unqualifizierte
--   Namensaufloesung stattfindet, die durch einen manipulierten `search_path`
--   umgeleitet werden koennte.
--
-- (V3b) HAERTUNG UEBER DIE SKIZZE HINAUS (ADDITION, fuer security-lead/
--   compliance-director-Aufmerksamkeit): PostgreSQL vergibt `EXECUTE` auf neu
--   angelegte Funktionen standardmaessig an PUBLIC. Ohne ein explizites
--   `REVOKE EXECUTE ... FROM PUBLIC` waere die in der Skizze/ADR §15.1
--   getroffene Aussage "Betriebsrolle bekommt NUR EXECUTE" / "App-Rolle NUR
--   ... EXECUTE Pruef-Fn" NICHT durchgesetzt -- jede beliebige Rolle koennte
--   `audit.retention_drop()` (loest `drop_chunks` aus!) oder `audit.versiegle()`
--   direkt aufrufen. Diese Migration ergaenzt daher explizite
--   `REVOKE EXECUTE ... FROM PUBLIC` auf alle vier privilegierten Funktionen
--   PLUS `pruefe_kette`, VOR den selektiven GRANTs (§ unten). Die reinen
--   Hilfsfunktionen `lp`/`canon_event`/`genesis` bleiben bei PUBLIC-EXECUTE
--   (unveraendert, keine Nebenwirkungen, keine sensiblen Daten).
--
-- (V4) KATALOG-SEED (NUR Pflicht-Event-Typen, die das Schema selbst braucht):
--   fuenf Katalog-Eintraege (`audit.retention.durchgefuehrt`,
--   `audit.anker.versiegelt`, `audit.anker.publiziert`, `audit.katalog.geaendert`,
--   `audit.ddl.gemeldet`) werden als STATISCHE GOVERNANCE-/KONFIGURATIONSDATEN
--   geseedet (INSERT INTO audit.event_typ / audit.event_typ_version) -- KEINE
--   personenbezogenen Daten (reine Vokabular-/Whitelist-Metadaten, analog
--   Enum-Werten) und KEIN "Ingest" (es wird KEINE Zeile in die
--   `audit.event`-Hypertable eingefuegt, Compliance-Review-Checkpunkt 3 bleibt
--   erfuellt). `event_typ_version.id` wird dabei per `gen_random_uuid()`
--   (PG16-Core seit PG13, KEIN pgcrypto) belegt -- fuer app-seitig erzeugte
--   Laufzeit-Events bleibt UUIDv7 ohne DB-Default die Norm (ADR-0004-Konvention);
--   fuer diese EINMALIGEN Migrations-Seed-Zeilen ist die UUIDv4-Alternative
--   ausdruecklich zulaessig (.claude/rules/database-migrations.md: "v7
--   bevorzugt, alternativ v4"), da Einfuege-Reihenfolge/Index-Lokalitaet fuer
--   eine kleine, seltene Katalog-Tabelle irrelevant ist.
--   WICHTIG: Die in der Skizze als Kommentar skizzierten "+ Pflicht-Audit-Event"
--   INSERTs INNERHALB von `versiegle()`/`markiere_publiziert()`/
--   `retention_drop()` werden in dieser Migration NICHT implementiert (Skizze
--   §4 ueberschrieben als "Pseudocode-nah" -- diese INSERTs sind dort bewusst
--   nur als Kommentar-Platzhalter skizziert, keine lauffaehige Anweisung).
--   Eine echte Implementierung braeuchte App-/Job-seitige `event_id`
--   (UUIDv7)-Erzeugung und einen `actor_*`-Kontext -- das ist Emitter-/
--   Schreib-Service-Verdrahtung (Phase 4, §17) und damit ausdruecklich NICHT
--   Teil dieser Schema-only-Migration (Checkpunkt 3). Der Katalog steht bereit,
--   damit diese Nachimplementierung ohne weitere Schema-Migration auskommt.
--   `audit.ddl.gemeldet` ist analog reserviert fuer einen KUENFTIGEN,
--   nachgelagerten Listener-/SIEM-Prozess, der eine `pg_notify`-Meldung von
--   `audit.melde_ddl()` als formales, gesiegeltes Event nachtraegt --
--   `melde_ddl()` selbst schreibt bewusst NUR `pg_notify` (Skizze §4.5),
--   keinen direkten `INSERT INTO audit.event` (Event-Trigger-Kontext ist fuer
--   einen zusaetzlichen DML-Pfad im selben Atemzug wie beliebige Fremd-DDL
--   riskanter als ein reines, seiteneffektfreies Notify).
--
-- =====================================================================
-- Dokumentierte Abweichungen von `.claude/rules/database-migrations.md`
-- =====================================================================
--
--   (a) `audit.event.event_id` ist `uuid` (App, UUIDv7), aber KEIN
--       Primaerschluessel -- natuerlicher Ketten-Schluessel `(lane, tag_utc,
--       seq)`; `event_id` nur einfacher Btree (Timescale erlaubt keinen
--       Unique-Index ohne Partitionsspalte). Analog `measurement.messwert`
--       (ADR-0004 §14).
--   (b) `audit.event_typ.code` (text) ist Primaerschluessel OHNE UUID-Surrogat
--       -- der Katalog-Code ist der einzige, ueberall referenzierte,
--       stabile Fachschluessel (FK-Ziel von `event_typ_version` UND
--       `event.event_typ`); ein zusaetzliches UUID-Surrogat waere reine
--       Indirektion ohne Nutzen fuer eine kleine, governte, selten
--       geaenderte Katalog-Tabelle.
--   (c) `audit.ketten_kopf` (PK `(lane, tag_utc)`), `audit.anker` (PK
--       `(stufe, periode_start)`) und `audit.anker_publikation` (PK
--       `(stufe, periode_start)`) verwenden zusammengesetzte, fachlich
--       bedeutungsvolle Schluessel statt eines UUID-Surrogats -- das Segment/
--       die Periode IST der einzig sinnvolle externe Bezugspunkt, ein
--       zusaetzliches UUID waere nie referenziert.
--   (d) KEIN `updated_at` auf `audit.event`, `audit.anker`,
--       `audit.anker_publikation`, `audit.event_typ`, `audit.event_typ_version`
--       (append-only/immutable bzw. governte Versions-Historie).
--       `audit.ketten_kopf.updated_at` ersetzt `created_at` (Arbeitstabelle,
--       "letzter Kontakt" ist die einzig relevante Zeit); `audit.anker.
--       versiegelt_at`/`audit.anker_publikation.publiziert_at` sind
--       `created_at`-Analoga (Momentaufnahme beim einmaligen INSERT, analog
--       `measurement.messwert.erfasst_at`, ADR-0004 §14).
--   (e) ERWEITERTE PII-KOMMENTAR-KONVENTION (Anhang E) statt
--       `pii=true`-Standard: `audit.event.actor_sub`/`objekt_ref`/
--       `actor_rolle` sind NICHT direkt-PII, sondern *personenbeziehbar
--       pseudonym* (ErwGr. 26) -- `personenbeziehbar=true; pii=false; art=…;
--       grundlage=…; zweckbindung=…; aufloesung=…; retention=…`. KEIN
--       Klartext-PII-Feld in diesem Schema (rote Linie 1/2).
--   (f) `audit.event_typ`, `audit.event_typ_version`, `audit.ketten_kopf`,
--       `audit.retention_freigabe` stehen NICHT unter `REVOKE UPDATE, DELETE`
--       -- NUR `audit.event`, `audit.anker`, `audit.anker_publikation` (siehe
--       naechster Abschnitt). Das ist eine BEWUSSTE, im ADR explizit
--       begruendete Einschraenkung der allgemeinen Rule-Formulierung
--       ("REVOKE ... auf Audit-Tabellen im Schema audit"), NICHT deren
--       woertliche Totalauslegung auf jede Tabelle im Schema.
--   (g) ADDITION ueber die Skizze hinaus: `audit.retention_freigabe` bekommt
--       `updated_at` + Trigger (die Skizze hatte nur `created_at`, obwohl
--       `retention_drop()` die Zeile mit `UPDATE ... SET status =
--       'ausgefuehrt'` tatsaechlich in-place aendert -- ein Fall, in dem
--       `updated_at` laut Rule "wenn inhaltlich passend" tatsaechlich passend
--       ist). Bewusst NICHT auf `ketten_kopf`/`anker`/`anker_publikation`
--       ausgeweitet (dort bleibt (d)/(c) wie in der Skizze).
--
-- =====================================================================
-- REVOKE-Geltungsbereich (Compliance-Review-Checkpunkt 1) -- Begruendung
-- =====================================================================
-- `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC` gilt NUR fuer die drei
-- Beweismittel-Objekte `audit.event`, `audit.anker`, `audit.anker_publikation`
-- (Linie 3, M1). `audit.event_typ`/`audit.event_typ_version` sind governte
-- Konfiguration (Aenderung ausschliesslich ueber `/add-audit-event` durch die
-- Betriebsrolle) und `audit.ketten_kopf` ist eine aus `audit.event`
-- rekonstruierbare Arbeitsoptimierung, KEIN Vertrauensanker (`pruefe_kette`
-- rechnet unabhaengig aus den Ereigniszeilen nach, verlaesst sich NIE auf den
-- Kopf) -- ADR-0003 §12, woertlich: "Warum Katalog und Kopf NICHT unter
-- REVOKE". `audit.retention_freigabe` ist eine Betriebs-Freigabetabelle
-- (Vier-Augen-Workflow), ebenfalls kein Beweismittel. Diese Einschraenkung ist
-- die REVIEWTE, ausdrueckliche Design-Entscheidung (verworfene Alternative:
-- "Alles inkl. Katalog/Kopf unter REVOKE" -- Contra: Katalog waere nicht mehr
-- per `/add-audit-event` pflegbar, Kopf koennte nicht als mutierbarer Zaehler
-- dienen) und WIRD SO UMGESETZT, auch wenn Checkpunkt 1 verkuerzt von "ALLEN
-- audit.*-Tabellen" spricht -- compliance-director bitte hierauf besonders
-- pruefen (Abgleich mit ADR-0003 §12/Anhang F Zeile 3).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> Katalog (+Seed) -> ketten_kopf -> retention_freigabe (+Trigger)
-- -> anker/anker_publikation -> event (+Hypertable/Indizes) -> Hilfsfunktionen
-- (lp/canon_event/genesis) -> begin_segment() (Lock+ts VOR dem INSERT, s.
-- "KRITISCHER BEFUND" unten) -> Seal-Trigger (verifiziert + haertet, s.
-- "KRITISCHER BEFUND, TEIL 2") -> append_event() (EINZIGER Schreibpfad fuer
-- edms_app, Re-Review-Auflage 1) -> versiegle/markiere_publiziert/
-- retention_drop -> melde_ddl (+ bedingter Event-Trigger) -> pruefe_kette ->
-- Rollen -> Ownership -> REVOKE (Unveraenderlichkeit + EXECUTE-Haertung +
-- kein INSERT/begin_segment mehr fuer edms_app) -> GRANTs -> Timeouts (inkl.
-- idle_in_transaction_session_timeout). Alle CREATE-Anweisungen laufen unter
-- den Rechten der
-- Migrations-Runner-Rolle (Owner-Uebertragung erst GANZ AM ENDE, damit
-- zwischenzeitliche CREATE-Schritte nicht durch vorzeitigen Rechte-Entzug
-- blockiert werden koennen).

-- =====================================================================
-- Schema
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS audit;
-- Extensions bereits aus V0001 vorhanden: timescaledb (Apache-2/-oss),
-- btree_gist (fuer EXCLUDE, s. event_typ_version). KEIN pgcrypto: Ketten-Hash
-- nutzt Core-`sha256(bytea)` (PG >= 11); Anker-Signatur entsteht ausserhalb
-- der DB (KMS, das keine DB-Rolle kennt, ADR-0003 §14.5/O-E).

-- =====================================================================
-- Katalog (append-only versioniert): event_typ (Header) + event_typ_version
-- =====================================================================

-- Header: code immutabel, FK-Ziel. NICHT unter REVOKE (governte Config,
-- s. Migrations-Kopf).
CREATE TABLE audit.event_typ (
    code        text PRIMARY KEY,                 -- namespaced domaene.objekt.verb
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Version (SCD2, append-only): Aenderung = neue Zeile; Vorgaenger bekommt
-- gueltig_bis. Kein Overlap je code (btree_gist aus V0001). Aenderung selbst
-- ist fachlich ein Pflicht-Audit-Event (audit.katalog.geaendert, s. Seed
-- unten) -- die tatsaechliche Emittierung ist Phase-4-Schreib-Service-Scope.
CREATE TABLE audit.event_typ_version (
    id                    uuid PRIMARY KEY,        -- Migrations-Seed: gen_random_uuid(); App-Runtime: UUIDv7, kein DB-DEFAULT
    code                  text NOT NULL REFERENCES audit.event_typ(code),
    objekt_typ            text NOT NULL,
    aktion_kategorie      text NOT NULL,           -- erstellen|lesen|aendern|loeschen|exportieren|freigeben|anmelden|melden|...
    erlaubte_kontext_keys text[] NOT NULL DEFAULT '{}',   -- Whitelist (rote Linie 1)
    rolle_erfassen        boolean NOT NULL DEFAULT false, -- actor_rolle nur wenn true (§13.4)
    pflichtereignis       boolean NOT NULL DEFAULT false, -- M5
    aktiv                 boolean NOT NULL DEFAULT true,
    beschreibung          text NOT NULL,
    gueltig_ab            timestamptz NOT NULL,
    gueltig_bis           timestamptz,             -- NULL = aktuell
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ex_event_typ_version_no_overlap EXCLUDE USING gist (
        code WITH =, tstzrange(gueltig_ab, gueltig_bis) WITH &&
    )
);

-- Seed: NUR die fuenf Pflicht-Event-Typen, die dieses Schema fuer seine
-- eigenen STRIDE-Pflichtereignisse braucht (s. Migrations-Kopf, Punkt V4).
-- Governance-/Konfigurationsdaten, KEIN Ingest, KEINE personenbezogenen Daten.
INSERT INTO audit.event_typ (code) VALUES
    ('audit.retention.durchgefuehrt'),
    ('audit.anker.versiegelt'),
    ('audit.anker.publiziert'),
    ('audit.katalog.geaendert'),
    ('audit.ddl.gemeldet');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'audit.retention.durchgefuehrt', 'audit_retention_freigabe', 'loeschen',
     ARRAY['freigabe_id','chunk_aelter_als'], false, true, true,
     'Pflicht-Event: Ausfuehrung des Retention-Sonderpfads (audit.retention_drop()) -- Vier-Augen-Freigabe + verifizierter Cold-Export vor drop_chunks() (ADR-0003 Paragraph 15.5/19).',
     now()),
    (gen_random_uuid(), 'audit.anker.versiegelt', 'audit_anker', 'erstellen',
     ARRAY['stufe','periode_start','periode_ende','anzahl_gesamt'], false, true, true,
     'Pflicht-Event: Versiegelung eines Stunden-/Tages-Ankers (audit.versiegle()) -- STRIDE-Nachweis der Ketten-/Anker-Fortschreibung (ADR-0003 Paragraph 14.5).',
     now()),
    (gen_random_uuid(), 'audit.anker.publiziert', 'audit_anker_publikation', 'exportieren',
     ARRAY['stufe','periode_start','publikations_ref'], false, true, true,
     'Pflicht-Event: externe, signierte Publikation eines Ankers (audit.markiere_publiziert()) -- Root-of-Trust gegen privilegierten Zugriff (ADR-0003 Paragraph 14.5/O-E).',
     now()),
    (gen_random_uuid(), 'audit.katalog.geaendert', 'audit_event_typ_version', 'aendern',
     ARRAY['code','version_id'], false, true, true,
     'Pflicht-Event: Aenderung des kontrollierten Vokabulars (neue audit.event_typ_version) -- macht einen stillen Whitelist-Umbau nachweisbar (ADR-0003 Paragraph 13.2, audit-trail-engineer-Finding 3).',
     now()),
    (gen_random_uuid(), 'audit.ddl.gemeldet', 'pg_ddl_command', 'melden',
     ARRAY['command_tag','object_identity'], false, true, true,
     'Reservierter Katalogeintrag fuer DDL-Meldungen auf Schema audit (Kompensation gegen Funktions-Replacement durch den Owner, ADR-0003 Paragraph 15.5/O-F); audit.melde_ddl() selbst sendet nur ein transientes pg_notify (s. Migrations-Kopf) -- dieser Eintrag steht fuer einen nachgelagerten Listener-/SIEM-Prozess bereit, der die Meldung als formales, gesiegeltes Event nachtraegt.',
     now());

-- =====================================================================
-- Ketten-Kopf (Arbeitstabelle, kein Vertrauensanker)
-- =====================================================================

-- Laufender Kopf je Segment. Insert-Optimierung; kein Vertrauensanker
-- (pruefe_kette rechnet unabhaengig aus den Ereigniszeilen nach). Nur der
-- SECURITY-DEFINER-Seal-Trigger pflegt ihn -- KEIN Grant an edms_app/
-- edms_audit_betrieb (Zugriffskontrolle allein ueber Ownership, s. u.).
CREATE TABLE audit.ketten_kopf (
    lane         smallint    NOT NULL,
    tag_utc      date        NOT NULL,
    letzter_seq  bigint      NOT NULL,
    letzter_hash bytea       NOT NULL,
    anzahl       bigint      NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lane, tag_utc)
);

-- =====================================================================
-- Retention-Freigabe (Vier-Augen-Kontrolltabelle)
-- =====================================================================

-- Schema-lokale updated_at-Trigger-Funktion (rote Linie 5: je Schema
-- dupliziert, kein cross-schema-Funktionsaufruf -- analog identity.*/energy.*
-- aus V0002).
CREATE FUNCTION audit.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- Vier-Augen-Kontrolltabelle fuer den Retention-Sonderpfad. `updated_at` ist
-- eine Ergaenzung ueber die Skizze hinaus (Migrations-Kopf, Abweichung (g)):
-- die Zeile wird durch retention_drop() tatsaechlich in-place aktualisiert.
CREATE TABLE audit.retention_freigabe (
    id                 uuid PRIMARY KEY,           -- App: UUIDv7
    chunk_aelter_als   timestamptz NOT NULL,       -- drop_chunks-Grenze
    antragsteller      text NOT NULL,
    freigeber          text,                       -- muss <> antragsteller (Vier-Augen)
    compliance_ref     text,                       -- Verweis compliance/audit-reports/
    export_verifiziert boolean NOT NULL DEFAULT false,  -- Row-Count/Checksum + Anker-Manifest
    status             text NOT NULL DEFAULT 'offen',   -- offen|freigegeben|ausgefuehrt
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_freigabe_vier_augen CHECK (freigeber IS NULL OR freigeber <> antragsteller)
);
COMMENT ON COLUMN audit.retention_freigabe.antragsteller IS
  'personenbeziehbar=true; pii=false; art=opake-principal (Vier-Augen-Workflow, kein FK); analog audit.event.actor_sub; ADR-0003 Anhang E (sinngemaess)';
COMMENT ON COLUMN audit.retention_freigabe.freigeber IS
  'personenbeziehbar=true; pii=false; art=opake-principal (Vier-Augen-Workflow, kein FK); analog audit.event.actor_sub; ADR-0003 Anhang E (sinngemaess)';

CREATE TRIGGER trg_retention_freigabe_updated_at BEFORE UPDATE ON audit.retention_freigabe
    FOR EACH ROW EXECUTE FUNCTION audit.set_updated_at();

-- =====================================================================
-- Anker (stuendlich + taeglich) + Publikations-Nachweis (append-only)
-- =====================================================================

-- Verallgemeinerter Anker (O-E/a): stuendliche Zwischen-Anker senken das
-- Manipulationsfenster von 24h auf ~1h; Tages-Anker fasst den Tag. Je Stufe
-- eine eigene Anker-Kette (vorher_anker_hash). Append-only (nur INSERT beim
-- Versiegeln, s. audit.versiegle()). `versiegelt_at` = created_at-Analog
-- (Abweichung (d)).
CREATE TABLE audit.anker (
    stufe             text        NOT NULL,        -- stunde|tag
    periode_start     timestamptz NOT NULL,        -- Periodenbeginn (UTC)
    periode_ende      timestamptz NOT NULL,        -- exklusiv
    anker_hash        bytea       NOT NULL,
    vorher_anker_hash bytea,                        -- NULL = Genesis der Stufe
    lane_koepfe       jsonb       NOT NULL,         -- {lane: {seq, anzahl, head_hash(hex)}}
    anzahl_gesamt     bigint      NOT NULL,
    versiegelt_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (stufe, periode_start),
    CONSTRAINT ck_anker_stufe CHECK (stufe IN ('stunde','tag'))
);

-- Publikations-/Signatur-Nachweis getrennt gehalten -> audit.anker bleibt
-- append-only (kein spaeteres Spalten-UPDATE). Nur INSERT via
-- markiere_publiziert(). `publiziert_at` = created_at-Analog (Abweichung (d)).
CREATE TABLE audit.anker_publikation (
    stufe            text        NOT NULL,
    periode_start    timestamptz NOT NULL,
    publikations_ref text        NOT NULL,          -- WORM/S3-Objekt (Object-Lock/Compliance-Mode)
    signatur         bytea       NOT NULL,          -- HMAC/Sig, extern via KMS erzeugt (O-E/b)
    publiziert_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (stufe, periode_start),
    FOREIGN KEY (stufe, periode_start) REFERENCES audit.anker(stufe, periode_start)
);

-- =====================================================================
-- Event-Envelope (Hypertable)
-- =====================================================================

-- event_id (UUIDv7, App) IM Hash-Kanon (O-B) -- sonst einziges Feld ausserhalb
-- des Ankers. KEIN UUID-PK (dok. Abweichung (a), analog measurement.messwert
-- ADR-0004 §14): natuerlicher Ketten-Schluessel (lane, tag_utc, seq);
-- event_id nur Btree (nicht unique, Timescale-Partitionsspalten-Regel).
CREATE TABLE audit.event (
    event_id        uuid         NOT NULL,          -- App UUIDv7; im Kanon (O-B)
    lane            smallint     NOT NULL,          -- App: Hash(korrelations_id) mod N (O-C)
    tag_utc         date         NOT NULL,          -- Trigger: = gelocktes Segment
    seq             bigint       NOT NULL,          -- Trigger: NACH Kopf-Lock
    ts              timestamptz  NOT NULL,          -- Trigger: clock_timestamp() NACH Lock (O-D); nie emitter (Linie 5)
    format_version  smallint     NOT NULL DEFAULT 1,
    event_typ       text         NOT NULL           -- FK: NO ACTION; ON UPDATE CASCADE VERBOTEN (O-A)
                    REFERENCES audit.event_typ(code) ON UPDATE NO ACTION ON DELETE NO ACTION,
    objekt_typ      text         NOT NULL,          -- Trigger: aus gueltiger Katalog-Version
    objekt_ref      uuid,                            -- Pseudonym/Entity-UUID; KEIN FK (Linie 2)
    actor_sub       text,                            -- opake Principal-ID; KEIN FK
    actor_typ       text         NOT NULL,
    actor_rolle     text,                            -- nur wenn Version.rolle_erfassen (§13.4)
    ergebnis        text         NOT NULL,
    kontext         jsonb        NOT NULL DEFAULT '{}',
    korrelations_id uuid,
    prev_hash       bytea        NOT NULL,          -- Trigger
    zeilen_hash     bytea        NOT NULL,          -- Trigger
    CONSTRAINT ck_event_ergebnis  CHECK (ergebnis IN ('ok','denied','error')),
    CONSTRAINT ck_event_actor_typ CHECK (actor_typ IN ('benutzer','dienstkonto','system'))
);

-- DSGVO-Markierung: personenbeziehbar pseudonym (ErwGr. 26), pii=false
-- (ADR-0003 Anhang E). Compliance-Review-Checkpunkt 2.
COMMENT ON COLUMN audit.event.actor_sub IS
  'personenbeziehbar=true; pii=false; art=opake-principal; grundlage=Art.6(1)(f) DSGVO + Paragraph 26 BDSG (Beschaeftigtendatenschutz) [Platzhalter -> final DSFA-0001-Nachtrag/VT-0002]; zweckbindung=Sicherheit/Rechenschaft (Art.32/Art.5(2)), NICHT Leistungs-/Verhaltenskontrolle (Art.88 DSGVO/Paragraph 26 BDSG); aufloesung=nur via ADR-0002/Keycloak (getrenntes System, KEIN FK); retention=F2-Hypothese Projektlaufzeit+5 Jahre (offener Punkt A-O6, ADR-0003 Paragraph 23); ADR-0003 Anhang E';
COMMENT ON COLUMN audit.event.objekt_ref IS
  'personenbeziehbar=true; pii=false; art=pseudonym; grundlage=Art.6(1)(f) DSGVO + Paragraph 26 BDSG (soweit Beschaeftigten-Handlung betroffen) [Platzhalter -> final DSFA-0001-Nachtrag]; zweckbindung=Sicherheit/Rechenschaft (Art.32/Art.5(2)); aufloesung=nur via identity (ADR-0004 Paragraph 16, autorisiert + selbst auditiert, KEIN FK); Art.17 via Krypto-Shredding, nie via Edit; retention=F2-Hypothese Projektlaufzeit+5 Jahre (offener Punkt A-O6, ADR-0003 Paragraph 23); ADR-0003 Anhang E';
COMMENT ON COLUMN audit.event.actor_rolle IS
  'personenbeziehbar=true; pii=false; art=rolle-zum-zeitpunkt; erfasst nur wenn Katalog-Version.rolle_erfassen=true (Datensparsamkeit Art.5(1)(c)); grundlage=Art.6(1)(f) DSGVO + Paragraph 26 BDSG [Platzhalter -> final DSFA]; zweckbindung wie actor_sub (§7.2); retention=F2-Hypothese (offener Punkt A-O6); ADR-0003 Anhang E';
COMMENT ON COLUMN audit.event.kontext IS
  'pii=false erzwungen: Keys = Teilmenge erlaubte_kontext_keys (Whitelist), nur Skalare (jsonb_typeof), octet_length-Cap je Wert -- Trigger + Service + CI-pii-scan (M3). KEIN Freitext-Einfallstor.';

-- Apache-2: create_hypertable erlaubt; Compression/Retention/CAgg-Policies
-- TSL -> verboten (.claude/rules/dependencies.md). Chunk 1 Monat
-- (Audit-Volumen << Messwerte, ADR-0004 7-Tage); deckt Monats-Pruef-/
-- Anker-/Retention-Takt (ADR-0003 §16/§18/§19).
SELECT create_hypertable('audit.event', 'ts', chunk_time_interval => INTERVAL '1 month');

-- Indizes minimal (M4).
CREATE UNIQUE INDEX ux_event_lane_tag_seq
    ON audit.event (lane, tag_utc, seq, ts);       -- ts = Partitionsspalte (Timescale-Pflicht)
CREATE INDEX ix_event_objekt
    ON audit.event (objekt_typ, objekt_ref, ts) WHERE objekt_ref IS NOT NULL;  -- Persona A (Objekt-Historie)
CREATE INDEX ix_event_id
    ON audit.event (event_id);                     -- Punkt-Lookups; NICHT unique (O-B)
-- BEWUSST KEIN (actor_sub, ...)-Index: M4 + §7.2 (kein Beschaeftigten-Profiling).
-- Default-ts-Index legt create_hypertable an.

-- =====================================================================
-- Laengenpraefix-Kanonisierung (identisch in Seal-Trigger und pruefe_kette)
-- =====================================================================

CREATE FUNCTION audit.lp(v text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN '\xffffffff'::bytea
              ELSE int4send(octet_length(v)) || convert_to(v, 'UTF8') END;   -- int4send = 4-Byte BE
$$;

-- Kanonische Bytefolge EINER Ereigniszeile (ohne prev_hash/zeilen_hash).
-- event_id IM Kanon (O-B). ts als EPOCH-MIKROSEKUNDEN (O-D): PG16 EXTRACT ->
-- numeric, exakt, kein Float-Drift; verbindlich statt ISO-Text. Golden-Byte-
-- Tests pinnen die Bytefolge ueber PG-Major-Upgrades (Phase 4, §20).
CREATE FUNCTION audit.canon_event(
    p_format_version smallint, p_event_id uuid, p_tag_utc date, p_lane smallint, p_seq bigint,
    p_ts timestamptz, p_event_typ text, p_objekt_typ text, p_objekt_ref uuid,
    p_actor_sub text, p_actor_typ text, p_actor_rolle text, p_ergebnis text,
    p_kontext jsonb, p_korrelations_id uuid
) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT audit.lp(p_format_version::text) || audit.lp(p_event_id::text)
      || audit.lp(p_tag_utc::text) || audit.lp(p_lane::text) || audit.lp(p_seq::text)
      || audit.lp(((EXTRACT(EPOCH FROM p_ts) * 1000000)::bigint)::text)   -- Epoch-Mikrosekunden
      || audit.lp(p_event_typ) || audit.lp(p_objekt_typ) || audit.lp(p_objekt_ref::text)
      || audit.lp(p_actor_sub) || audit.lp(p_actor_typ) || audit.lp(p_actor_rolle)
      || audit.lp(p_ergebnis) || audit.lp(p_kontext::text) || audit.lp(p_korrelations_id::text);
$$;

CREATE FUNCTION audit.genesis(p_format_version smallint, p_lane smallint, p_tag_utc date)
RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to('AUDIT-GEN-v'||p_format_version||'|'||p_lane||'|'||p_tag_utc, 'UTF8'));
$$;

-- =====================================================================
-- KRITISCHER BEFUND (waehrend Docker-Verifikation entdeckt) + Korrektur:
-- audit.begin_segment() + zweistufiger Seal-Ablauf statt Einzel-Trigger
-- =====================================================================
--
-- Die Skizze (ADR-0003 §4, ausdruecklich "Pseudocode-nah") sah EINEN
-- BEFORE-INSERT-Trigger vor, der u. a. `NEW.ts := clock_timestamp()` ERST
-- NACH dem `SELECT ... FOR UPDATE`-Kopf-Lock setzt (Reihenfolge-Fix O-D:
-- Monotonie seq<=>ts). Das ist auf einer TimescaleDB-Hypertable NICHT
-- ausfuehrbar: TimescaleDB entscheidet den Ziel-CHUNK anhand des Werts der
-- Partitionsspalte (`ts`), WIE ER IM URSPRUENGLICHEN INSERT-TUPEL VORLIEGT --
-- diese Chunk-Zuordnung erfolgt UNABHAENGIG von/vor einer Aenderung durch
-- einen BEFORE-ROW-Trigger. Empirisch bestaetigt (Docker-Test):
--   - `ts` beim INSERT weggelassen (NULL) -> Timescale bricht SOFORT mit
--     "NULL value in column ts violates not-null constraint / Columns used
--     for time partitioning cannot be NULL" ab, BEVOR der Trigger ueberhaupt
--     laeuft.
--   - `ts` mit einem Platzhalterwert (z. B. Jahr 2000) belegt: die Zeile wird
--     dem CHUNK fuer das Jahr 2000 zugewiesen; der Trigger ueberschreibt
--     `NEW.ts` danach zwar korrekt mit `clock_timestamp()` (2026, richtiger
--     Hash), aber die physische Zeile landet weiterhin im 2000er-Chunk, dessen
--     CHECK CONSTRAINT (`constraint_1`, die Chunk-Zeitgrenzen) den NEUEN
--     (2026er) Wert ablehnt -> `ERROR: new row for relation "_hyper_..."
--     violates check constraint`.
-- Ein simpler Fix (ts stattdessen per Spalten-DEFAULT VOR dem Trigger/Lock
-- setzen) wuerde den O-D-Fix direkt wieder aufheben (Lock-Verlierer koennte
-- dann erneut einen frueheren ts mit spaeterer seq bekommen). Beide ADR-
-- Vorgaben (Linie 5 "ts nie emitter-geliefert" + O-D "ts erst nach Lock")
-- lassen sich auf einem Hypertable NUR erfuellen, wenn Lock+Zeitstempel-
-- Erfassung VOR dem eigentlichen INSERT-Statement stattfinden, sodass
-- Timescale von Anfang an den korrekten, endgueltigen `ts`-Wert zur
-- Chunk-Wahl bekommt.
--
-- KORREKTUR: `audit.begin_segment()` uebernimmt exakt die Schritte (1)-(3)
-- der urspruenglichen Trigger-Skizze (Tag bestimmen, Kopf-Zeile sicherstellen
-- + PER FOR UPDATE SPERREN, ERST DANACH ts erfassen) als EIGENE, dem
-- eigentlichen INSERT vorgeschaltete Anweisung -- IN DERSELBEN TRANSAKTION
-- (der Zeilen-Lock bleibt bis zum COMMIT/ROLLBACK der Fachtransaktion
-- gehalten, §17.3 bleibt also unveraendert: Audit + Fachoperation weiterhin
-- EINE Transaktion, fail-closed, KEIN Outbox-Pattern). Der Aufrufer
-- (kuenftiger Schreib-Service, §17.1 -- NICHT Teil dieser Migration) MUSS
-- daher zweistufig arbeiten:
--   1. `SELECT * FROM audit.begin_segment(p_lane, p_format_version);`
--   2. `INSERT INTO audit.event (..., tag_utc, seq, ts, prev_hash, ...)
--        VALUES (..., <Ergebnis aus Schritt 1>, ...);`
-- Der (jetzt schlankere) BEFORE-INSERT-Trigger `event_seal()` verlangt, dass
-- `NEW.tag_utc/seq/ts/prev_hash` bereits gesetzt sind, und VERIFIZIERT sie
-- GEGEN den (weiterhin gesperrten) Kopf, statt sie selbst zu berechnen --
-- Verteidigung gegen einen Aufrufer, der `begin_segment()` uebergeht und
-- versucht, `audit.event` direkt mit erfundenen Werten zu befuellen (edms_app
-- hat INSERT-Recht direkt auf die Tabelle, s. GRANTs). Kontext-Whitelist,
-- Katalog-Gueltigkeit, Werte-Cap und Hash-Siegel bleiben unveraendert im
-- Trigger. `ts` bleibt strikt DB-seitig (`clock_timestamp()` in
-- `begin_segment()`, NIE ein vom Aufrufer gewaehlter/uebergebener Wert, Linie
-- 5 bleibt gewahrt) -- der Aufrufer erhaelt den Wert nur als RUECKGABE, kann
-- ihn nicht beeinflussen.
--
-- REVIEW-HINWEIS Teil 1 (Zwischenstand, durch Teil 2 unten UEBERHOLT): Der
-- urspruengliche Fix aenderte den in ADR-0003 §17.1 skizzierten Schreib-
-- Service-Kontrakt ("AuditService.append() macht EINEN INSERT") auf ZWEI
-- Anweisungen (begin_segment()-Aufruf + direktes INSERT durch edms_app).
--
-- KRITISCHER BEFUND, TEIL 2 (Re-Review durch security-lead +
-- audit-trail-engineer, merge-blockierende Auflage, unabhaengig
-- gefunden): Der Zwischenstand verifizierte im Trigger zwar seq/prev_hash
-- gegen den gesperrten Kopf, liess aber `ts` UNVERIFIZIERT vom Aufrufer
-- durchreichen. Weil edms_app direktes INSERT auf audit.event hatte, konnte
-- ein Aufrufer tag_utc/seq/prev_hash aus einem legitimen
-- begin_segment()-Aufruf uebernehmen und trotzdem ein FREI GEWAEHLTES ts
-- einsetzen (Vergangenheit/Zukunft, beliebige Chunk-Platzierung) -- sowohl
-- der (Teil-1-)Trigger als auch audit.pruefe_kette() (rechnet mit dem
-- gespeicherten ts) haetten das unbemerkt gelassen. Bruch der roten Linie 5.
--
-- KORREKTUR (konsolidiert aus security-lead + audit-trail-engineer,
-- umgesetzt): (1) `audit.append_event(...)` ist jetzt der EINZIGE
-- Schreibpfad fuer edms_app -- der Aufrufer liefert AUSSCHLIESSLICH
-- fachliche Payload, KEIN ts/tag_utc/seq/prev_hash/lane mehr;
-- `REVOKE INSERT ON audit.event FROM edms_app` (nur noch SELECT);
-- `begin_segment()` bekommt kein EXECUTE-Grant fuer edms_app mehr (nur noch
-- intern von append_event() aus aufrufbar, s. dessen Funktions-Kommentar).
-- (2) Der Seal-Trigger bleibt als Defense-in-Depth bestehen und prueft
-- zusaetzlich: (a) tag_utc muss zu ts passen, (b) ts muss in engem
-- Toleranzfenster (Sekunden) um clock_timestamp() liegen -- s. Kommentar
-- "(0b) HAERTUNG" in audit.event_seal(). (3) `edms_app` bekommt zusaetzlich
-- `idle_in_transaction_session_timeout`, damit eine Fachtransaktion, die den
-- Segment-Lock haelt, aber nie committet, den Lock nicht unbegrenzt blockiert
-- (schliesst eine Luecke, die lock_timeout/statement_timeout allein nicht
-- abdecken, s. Timeouts-Abschnitt).
--
-- ERGEBNIS: Der Schreib-Service-Kontrakt (ADR §17.1) ist durch diese zweite
-- Korrektur wieder EIN Aufruf (`audit.append_event(...)`) -- einfacher als
-- der Teil-1-Zwischenstand (zwei Anweisungen) UND als die urspruengliche
-- Skizze (die einen direkten INSERT vorsah, der auf einem Hypertable so
-- nicht funktioniert, s. Teil 1 oben). Re-Review-Status: security-lead
-- mitgetragen mit Auflagen (umgesetzt); audit-trail-engineer mitgetragen mit
-- Auflagen (umgesetzt). ADR-0003 §17.1 sollte redaktionell nachgezogen
-- werden (Schreib-Service ruft kuenftig `audit.append_event(...)` auf, KEIN
-- roher INSERT und KEIN zweistufiger begin_segment()+INSERT-Ablauf mehr) --
-- das ist eine Doku-Anpassung ausserhalb des Schreib-Scopes dieser Migration
-- (kein `.md`-Schreibzugriff hier), siehe finale Antwort.
-- Hinweis Namensgebung: lokale Variablen sind bewusst ANDERS benannt als die
-- RETURNS-TABLE-Out-Parameter (v_tag/v_seq_next/v_prev statt tag_utc/seq/
-- prev_hash) -- eine gleichnamige Verwendung fuehrt in eingebetteten
-- SQL-Anweisungen (hier: `ON CONFLICT (lane, tag_utc)`) zu einer von Postgres
-- abgelehnten Namens-Ambiguitaet zwischen PL/pgSQL-Variable und Tabellenspalte
-- (empirisch in der Docker-Verifikation aufgetreten, analog zur bereits in
-- pruefe_kette() dokumentierten Korrektur).
CREATE FUNCTION audit.begin_segment(p_lane smallint, p_format_version smallint)
RETURNS TABLE (seq bigint, ts timestamptz, tag_utc date, prev_hash bytea)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_tag      date;
    v_prev     bytea;
    v_seq_next bigint;
BEGIN
    -- (1) Provisorischer Tag NUR zur Segment-Bestimmung; finales ts kommt NACH dem Lock.
    v_tag := (clock_timestamp() AT TIME ZONE 'UTC')::date;

    -- (2) Segment-Kopf sicherstellen (idempotent) und exklusiv locken -> race-frei.
    --     Lock bleibt bis Commit/Rollback der AUFRUFENDEN Transaktion gehalten.
    --     `ON CONFLICT ON CONSTRAINT ketten_kopf_pkey` statt einer Spalten-
    --     Zielliste `(lane, tag_utc)`: `tag_utc` ist zugleich ein
    --     RETURNS-TABLE-Out-Parameter dieser Funktion (also durchgehend eine
    --     gueltige PL/pgSQL-Variable) UND eine Tabellenspalte -- eine bare
    --     Spalten-Zielliste in ON CONFLICT bleibt darum unausweichlich
    --     mehrdeutig (empirisch in der Docker-Verifikation aufgetreten, s.
    --     Kommentar oberhalb der Funktion). Der Constraint-Name umgeht das.
    INSERT INTO audit.ketten_kopf (lane, tag_utc, letzter_seq, letzter_hash, anzahl)
    VALUES (p_lane, v_tag, 0, audit.genesis(p_format_version, p_lane, v_tag), 0)
    ON CONFLICT ON CONSTRAINT ketten_kopf_pkey DO NOTHING;
    SELECT k.letzter_seq, k.letzter_hash INTO v_seq_next, v_prev
      FROM audit.ketten_kopf k WHERE k.lane = p_lane AND k.tag_utc = v_tag
      FOR UPDATE;                                   -- Serialisierungspunkt = genau EIN Segment

    -- (3) ERST NACH dem Lock ts erfassen -> Monotonie (seq steigt <=> ts steigt), O-D-Fix.
    tag_utc   := v_tag;
    seq       := v_seq_next + 1;
    ts        := clock_timestamp();
    prev_hash := v_prev;
    RETURN NEXT;
END;
$$;

-- Lane-Zuweisung (O-C): lane := hashtext(korrelations_id) mod N (nicht
-- Round-Robin/connection-gebunden; eine Tx = eine Lane = ein Lock) -- NACH
-- Re-Review-Auflage 1 NICHT mehr Aufgabe eines Aufrufers, der begin_segment()
-- direkt anspricht, sondern intern in audit.append_event() umgesetzt (s.
-- dort). Diese Trigger-Funktion nimmt `NEW.lane` weiterhin nur als bereits
-- feststehend entgegen (gesetzt via append_event(), das begin_segment()
-- innerhalb DERSELBEN Transaktion aufruft, bevor der hier behandelte INSERT
-- abgesetzt wird).
CREATE FUNCTION audit.event_seal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_ver  audit.event_typ_version%ROWTYPE;
    v_kopf audit.ketten_kopf%ROWTYPE;
    v_bad  text[];
BEGIN
    -- (0) tag_utc/seq/ts/prev_hash muessen bereits aus audit.begin_segment()
    --     stammen (Chunk-Routing-Kompatibilitaet, s. Kommentar oben) --
    --     Pflichtfelder, kein stiller Default.
    IF NEW.tag_utc IS NULL OR NEW.seq IS NULL OR NEW.ts IS NULL OR NEW.prev_hash IS NULL THEN
        RAISE EXCEPTION 'audit: tag_utc/seq/ts/prev_hash fehlen -- zuerst audit.begin_segment(lane, format_version) aufrufen und dessen Ergebnis in den INSERT uebernehmen';
    END IF;

    -- (0b) HAERTUNG (Re-Review-Auflage, security-lead + audit-trail-engineer,
    --      s. Migrations-Kopf "KRITISCHER BEFUND, Teil 2"): seq/prev_hash
    --      werden unten (1) gegen den gesperrten Kopf verifiziert, aber OHNE
    --      eine zusaetzliche ts-Pruefung koennte ein direkter INSERT (waere
    --      der Aufrufer nicht laengst per REVOKE/GRANT auf audit.append_event()
    --      beschraenkt, s. u.) tag_utc/seq/prev_hash aus einem legitimen
    --      audit.begin_segment()-Aufruf uebernehmen und trotzdem ein FREI
    --      GEWAEHLTES ts einsetzen (Vergangenheit/Zukunft) -- ein Bruch der
    --      roten Linie 5 ("ts nie emitter-geliefert"), den weder diese
    --      Trigger-Pruefung noch audit.pruefe_kette() (rechnet MIT dem
    --      gespeicherten ts) sonst bemerken wuerden. Defense-in-Depth
    --      zusaetzlich zur Zugriffsbeschraenkung (Auflage 1): tag_utc muss zu
    --      ts passen, UND ts muss in eng toleriertem Abstand zu
    --      clock_timestamp() liegen (ts wird in audit.append_event()
    --      unmittelbar vor diesem INSERT gesetzt -- das Toleranzfenster
    --      deckt nur Planungs-/Ausfuehrungs-Jitter derselben Anweisung ab,
    --      keine Emitter-Verzoegerung).
    IF NEW.tag_utc <> (NEW.ts AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION 'audit: tag_utc (%) passt nicht zu ts (%) -- inkonsistentes Segment', NEW.tag_utc, NEW.ts;
    END IF;
    IF NEW.ts < clock_timestamp() - INTERVAL '5 seconds'
       OR NEW.ts > clock_timestamp() + INTERVAL '5 seconds' THEN
        RAISE EXCEPTION 'audit: ts (%) liegt ausserhalb des Toleranzfensters um clock_timestamp() (%) -- moeglicher manipulierter Zeitstempel', NEW.ts, clock_timestamp();
    END IF;

    -- (1) Gegen den (weiterhin gesperrten) Kopf verifizieren -- Verteidigung
    --     gegen einen Aufrufer, der begin_segment() umgeht und erfundene
    --     Werte direkt einfuegt. FOR UPDATE auf der bereits von
    --     begin_segment() gehaltenen Zeile ist innerhalb derselben
    --     Transaktion ein no-op (Selbst-Reentrant), kein Deadlock-Risiko.
    SELECT * INTO v_kopf FROM audit.ketten_kopf
      WHERE lane = NEW.lane AND tag_utc = NEW.tag_utc
      FOR UPDATE;
    IF NOT FOUND OR NEW.seq <> v_kopf.letzter_seq + 1 OR NEW.prev_hash <> v_kopf.letzter_hash THEN
        RAISE EXCEPTION 'audit: seq/prev_hash stimmen nicht mit dem gesperrten Ketten-Kopf ueberein (lane=%, tag_utc=%) -- audit.begin_segment() umgangen oder Kopf zwischenzeitlich veraendert', NEW.lane, NEW.tag_utc;
    END IF;

    -- (2) Gueltige Katalog-Version zum ts aufloesen (append-only SCD2).
    SELECT * INTO v_ver FROM audit.event_typ_version
     WHERE code = NEW.event_typ AND aktiv
       AND gueltig_ab <= NEW.ts AND (gueltig_bis IS NULL OR NEW.ts < gueltig_bis);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'audit: keine gueltige/aktive Katalog-Version fuer % @ %', NEW.event_typ, NEW.ts;
    END IF;
    NEW.objekt_typ := v_ver.objekt_typ;             -- autoritativ aus Katalog
    IF NOT v_ver.rolle_erfassen THEN NEW.actor_rolle := NULL; END IF;   -- Datensparsamkeit (§13.4)

    -- (3) Kontext: Whitelist + nur Skalare + Groessen-Cap (O-H).
    SELECT array_agg(k) INTO v_bad FROM jsonb_object_keys(NEW.kontext) k
     WHERE k <> ALL (v_ver.erlaubte_kontext_keys);
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'audit: kontext-key(s) nicht in Whitelist von %: %', NEW.event_typ, v_bad;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(NEW.kontext) e
               WHERE jsonb_typeof(e.value) NOT IN ('string','number','boolean')
                  OR octet_length(e.value::text) > 512) THEN                -- Cap = Skizze, Phase 4
        RAISE EXCEPTION 'audit: kontext-Wert nicht skalar oder ueber Cap (%)', NEW.event_typ;
    END IF;

    -- (4) Siegeln + Kopf fortschreiben.
    NEW.zeilen_hash := sha256(
        audit.canon_event(NEW.format_version, NEW.event_id, NEW.tag_utc, NEW.lane, NEW.seq,
            NEW.ts, NEW.event_typ, NEW.objekt_typ, NEW.objekt_ref, NEW.actor_sub, NEW.actor_typ,
            NEW.actor_rolle, NEW.ergebnis, NEW.kontext, NEW.korrelations_id) || NEW.prev_hash);
    UPDATE audit.ketten_kopf
       SET letzter_seq = NEW.seq, letzter_hash = NEW.zeilen_hash, anzahl = anzahl + 1, updated_at = now()
     WHERE lane = NEW.lane AND tag_utc = NEW.tag_utc;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_seal BEFORE INSERT ON audit.event
    FOR EACH ROW EXECUTE FUNCTION audit.event_seal();

-- =====================================================================
-- audit.append_event() -- EINZIGER Schreibpfad fuer edms_app (Re-Review-
-- Auflage 1, security-lead + audit-trail-engineer)
-- =====================================================================
--
-- Nach dem ersten Re-Review (s. Migrations-Kopf "KRITISCHER BEFUND, Teil 2")
-- reicht die Trigger-Verifikation von seq/prev_hash allein NICHT: solange
-- edms_app direktes INSERT auf audit.event hat, kann ein Aufrufer
-- tag_utc/seq/prev_hash aus einem legitimen audit.begin_segment()-Aufruf
-- uebernehmen, aber ein FREI GEWAEHLTES ts einsetzen -- Trigger UND
-- audit.pruefe_kette() wuerden das nicht bemerken (rote Linie 5 gebrochen).
--
-- LOESUNG: `audit.append_event(...)` ist ab jetzt der EINZIGE Weg, wie
-- edms_app eine Zeile in audit.event erzeugen kann (`REVOKE INSERT ...FROM
-- edms_app`, s. GRANT-Abschnitt). Der Aufrufer liefert AUSSCHLIESSLICH
-- fachliche Payload -- KEIN ts, KEIN tag_utc, KEIN seq, KEIN prev_hash, KEINE
-- lane (die wird intern aus korrelations_id abgeleitet, s. u.). Diese
-- Funktion ruft intern audit.begin_segment() auf (Lock + ts-Erfassung NACH
-- dem Lock, unveraendert) und fuehrt selbst den INSERT aus -- innerhalb
-- DERSELBEN Transaktion wie die Fachoperation (§17.3 bleibt unveraendert:
-- fail-closed, kein Outbox-Pattern). `begin_segment()` bleibt eine separate
-- Funktion (Wiederverwendbarkeit/Testbarkeit fuer edms_audit_owner), bekommt
-- aber KEIN EXECUTE-Grant fuer edms_app mehr -- nur append_event() (als
-- SECURITY DEFINER mit demselben Owner) darf sie noch aufrufen.
--
-- Lane-Ableitung (audit-trail-Auflage 3): deterministisch UND
-- transaktionsstabil aus korrelations_id -- `abs(hashtext(korrelations_id))
-- % 16` (Start-N=16 laut ADR-0003 §14.2; finale Lane-Zahl = Phase-4-
-- Benchmark, A-O1). "Transaktionsstabil" heisst hier: WENN der Aufrufer fuer
-- mehrere Events derselben Fachtransaktion dieselbe korrelations_id
-- mitgibt, landen sie garantiert in derselben Lane (eine Tx = eine Lane =
-- ein Lock, O-C) -- unabhaengig davon, wie oft/wann append_event() innerhalb
-- der Tx aufgerufen wird. Liefert der Aufrufer KEINE korrelations_id, wird
-- eine aus der laufenden Transaktions-ID abgeleitete, fuer die GESAMTE
-- Transaktion stabile UUID verwendet (`md5(txid_current()::text)::uuid` --
-- reiner Core-Ausdruck, kein pgcrypto), damit auch unisntrumentierte
-- Mehrfach-Events derselben Tx in einer Lane bleiben (ADR-0003 §14.2: "Der
-- Schreib-Service stellt sicher, dass JEDE auditierte Tx eine
-- korrelations_id traegt, sonst tx-lokal erzeugt").
--
-- event_id: optional (App-seitig bevorzugt UUIDv7 fuer Zeit-/Index-Lokalitaet,
-- ADR-0004-Konvention); wird hier NUR als Fallback per gen_random_uuid()
-- (Core, PG13+, KEIN pgcrypto) erzeugt, falls der Aufrufer keine eigene
-- mitgibt -- dokumentierte, unkritische Abweichung (Fallback-Pfad, nicht der
-- Normalfall).
--
-- objekt_typ wird bewusst NICHT als Parameter angenommen: die Spalte wird
-- ohnehin autoritativ vom Trigger aus dem Katalog abgeleitet (§13.2) --
-- ein zusaetzlicher, vom Trigger sofort verworfener Parameter waere nur
-- Verwirrungspotential.
CREATE FUNCTION audit.append_event(
    p_event_typ       text,
    p_actor_typ       text,
    p_ergebnis        text,
    p_actor_sub       text DEFAULT NULL,
    p_actor_rolle     text DEFAULT NULL,
    p_objekt_ref      uuid DEFAULT NULL,
    p_kontext         jsonb DEFAULT '{}'::jsonb,
    p_korrelations_id uuid DEFAULT NULL,
    p_event_id        uuid DEFAULT NULL,
    p_format_version  smallint DEFAULT 1
) RETURNS audit.event
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_korrelations_id uuid     := COALESCE(p_korrelations_id, (md5(txid_current()::text))::uuid);
    v_lane            smallint := (abs(hashtext(v_korrelations_id::text)) % 16)::smallint;
    v_event_id        uuid     := COALESCE(p_event_id, gen_random_uuid());
    seg               RECORD;
    v_row             audit.event%ROWTYPE;
BEGIN
    SELECT * INTO seg FROM audit.begin_segment(v_lane, p_format_version);

    INSERT INTO audit.event (
        event_id, lane, tag_utc, seq, ts, format_version, event_typ,
        objekt_ref, actor_sub, actor_typ, actor_rolle,
        ergebnis, kontext, korrelations_id, prev_hash
    ) VALUES (
        v_event_id, v_lane, seg.tag_utc, seg.seq, seg.ts, p_format_version, p_event_typ,
        p_objekt_ref, p_actor_sub, p_actor_typ, p_actor_rolle,
        p_ergebnis, p_kontext, v_korrelations_id, seg.prev_hash
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

-- =====================================================================
-- Anker versiegeln (Stufe stunde/tag) -- inkl. Sichtbarkeits-Gnadenfrist (O-G)
-- =====================================================================

-- Sammelt je lane den Ketten-Stand zum periode_ende (fuer 'tag' == Tages-
-- Endstand, fuer 'stunde' == kumulativer Stand bis Stundenende) und kettet an
-- den vorherigen Anker DERSELBEN Stufe. Selbst ein Pflicht-Audit-Event
-- (STRIDE) -- die tatsaechliche INSERT INTO audit.event-Emittierung ist NICHT
-- Teil dieser Migration (s. Migrations-Kopf, Punkt V4).
CREATE FUNCTION audit.versiegle(p_stufe text, p_start timestamptz) RETURNS bytea
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    p_ende  timestamptz := p_start + CASE p_stufe WHEN 'stunde' THEN INTERVAL '1 hour' ELSE INTERVAL '1 day' END;
    v_prev  bytea; v_canon bytea; v_summe bigint := 0; v_anker bytea; r RECORD;
BEGIN
    -- O-G: echtes Risiko = Transaktions-Sichtbarkeits-Latenz (vor der Grenze
    -- gestartete, danach committende Tx), nicht Uhren-Skew. Versiegeln nur,
    -- wenn KEINE vor p_ende gestartete Client-Tx mehr offen ist.
    IF EXISTS (SELECT 1 FROM pg_stat_activity
               WHERE xact_start < p_ende AND state <> 'idle' AND backend_type = 'client backend') THEN
        RAISE EXCEPTION 'audit: Versiegelung % @ % verschoben -- offene Tx vor Periodengrenze', p_stufe, p_start;
    END IF;

    SELECT anker_hash INTO v_prev FROM audit.anker
     WHERE stufe = p_stufe AND periode_start = (p_start - (p_ende - p_start));   -- vorherige Periode der Stufe

    v_canon := audit.lp(p_stufe) || audit.lp(p_start::text);
    FOR r IN                                        -- je lane letzter Stand bis p_ende
        SELECT DISTINCT ON (e.lane) e.lane, e.seq, e.zeilen_hash,
               count(*) OVER (PARTITION BY e.lane) AS anzahl
          FROM audit.event e
         WHERE e.tag_utc = (p_start AT TIME ZONE 'UTC')::date AND e.ts < p_ende
         ORDER BY e.lane, e.seq DESC
    LOOP
        v_canon := v_canon || audit.lp(r.lane::text) || audit.lp(r.seq::text)
                 || audit.lp(r.anzahl::text) || r.zeilen_hash;
        v_summe := v_summe + r.anzahl;
    END LOOP;
    v_canon := v_canon || audit.lp(v_summe::text) || COALESCE(v_prev, ''::bytea);
    v_anker := sha256(v_canon);

    INSERT INTO audit.anker (stufe, periode_start, periode_ende, anker_hash, vorher_anker_hash,
                             lane_koepfe, anzahl_gesamt)
    VALUES (p_stufe, p_start, p_ende, v_anker, v_prev, '{}'::jsonb, v_summe);   -- lane_koepfe-Snapshot: Detail Phase 4
    RETURN v_anker;
END;
$$;

-- =====================================================================
-- Publikation (dedizierte Identitaet, extern signiert)
-- =====================================================================

-- Nur INSERT in anker_publikation (audit.anker bleibt append-only). Signatur
-- entsteht AUSSERHALB der DB (KMS-Schluessel, den keine DB-Rolle kennt, O-E/b)
-- und wird hier als Nachweis abgelegt. Selbst ein Pflicht-Audit-Event
-- (s. Migrations-Kopf, Punkt V4).
CREATE FUNCTION audit.markiere_publiziert(p_stufe text, p_start timestamptz,
                                          p_ref text, p_signatur bytea) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
BEGIN
    INSERT INTO audit.anker_publikation (stufe, periode_start, publikations_ref, signatur)
    VALUES (p_stufe, p_start, p_ref, p_signatur);
END;
$$;

-- =====================================================================
-- Retention-Wrapper (Vier-Augen) + DDL-Event-Trigger (O-F)
-- =====================================================================

-- Einziger Pfad zu drop_chunks('audit.event', ...). Prueft Vier-Augen-
-- Freigabe + verifizierten Cold-Export gegen die Kontrolltabelle. Selbst ein
-- Pflicht-Audit-Event (s. Migrations-Kopf, Punkt V4). edms_audit_betrieb
-- bekommt NUR EXECUTE hierauf, KEIN direktes drop_chunks/UPDATE (s. GRANTs).
CREATE FUNCTION audit.retention_drop(p_freigabe_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE f audit.retention_freigabe%ROWTYPE;
BEGIN
    SELECT * INTO f FROM audit.retention_freigabe WHERE id = p_freigabe_id;
    IF NOT FOUND OR f.status <> 'freigegeben' OR f.freigeber IS NULL
       OR f.freigeber = f.antragsteller OR NOT f.export_verifiziert THEN
        RAISE EXCEPTION 'audit: Retention-Freigabe % ungueltig (Vier-Augen/Export fehlt)', p_freigabe_id;
    END IF;
    PERFORM drop_chunks('audit.event', older_than => f.chunk_aelter_als);   -- Apache-2, erlaubt
    UPDATE audit.retention_freigabe SET status = 'ausgefuehrt' WHERE id = p_freigabe_id;
END;
$$;

-- DDL-Event-Trigger: meldet JEDE DDL im Schema audit extern (pg_notify ->
-- Listener/SIEM). Kompensation gegen Funktions-Replacement durch den Owner
-- (in der Hash-Kette selbst unsichtbar). NICHT SECURITY DEFINER -- laeuft mit
-- den Rechten dessen, der die DDL ausfuehrt; pg_notify braucht keine
-- erhoehten Rechte, alle Referenzen sind bereits schema-/catalog-qualifiziert
-- (kein search_path-Pinning noetig, s. Migrations-Kopf Punkt V3).
CREATE FUNCTION audit.melde_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE o RECORD;
BEGIN
    FOR o IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE schema_name = 'audit' OR object_identity LIKE 'audit.%' LOOP
        PERFORM pg_notify('audit_ddl', o.command_tag || ' ' || COALESCE(o.object_identity,''));
    END LOOP;
END;
$$;

-- Bedingte Anlage: CREATE EVENT TRIGGER verlangt IMMER Superuser (s.
-- Migrations-Kopf, Punkt V2). WARNING statt Abbruch, damit der Rest dieser
-- Migration auch unter eingeschraenkten (nicht-Superuser) DB-Rollen
-- durchlaeuft -- mit explizit dokumentiertem manuellen Nachzieh-Schritt.
DO $$
BEGIN
    IF current_setting('is_superuser') = 'on' THEN
        EXECUTE 'CREATE EVENT TRIGGER trg_audit_ddl ON ddl_command_end EXECUTE FUNCTION audit.melde_ddl()';
    ELSE
        RAISE WARNING 'audit: CREATE EVENT TRIGGER trg_audit_ddl uebersprungen -- aktuelle Rolle ist kein Superuser (z. B. verwaltete Cloud-Postgres-Dienste ohne vollen Superuser-Zugriff). Muss NACHTRAEGLICH von einem Superuser angelegt werden: CREATE EVENT TRIGGER trg_audit_ddl ON ddl_command_end EXECUTE FUNCTION audit.melde_ddl(); (devops-lead/security-lead, siehe ADR-0003 Paragraph 15.5/O-F).';
    END IF;
END
$$;

-- =====================================================================
-- Integritaetspruefung (deterministisch, read-only -- M2/Phase-7-Gate)
-- =====================================================================

-- Rechnet Lane-Ketten (inkl. event_id im Kanon) neu und vergleicht gegen die
-- gespeicherten Werte. Der externe Abgleich gegen die PUBLIZIERTEN,
-- SIGNIERTEN Anker (audit.anker_publikation + WORM/S3) deckt privilegierte
-- Manipulation auf und haelt die Kette ueber archivierte/gedropte Chunks
-- hinweg (§19 ADR); dieser Abgleich laeuft im Monats-Job gegen das Manifest +
-- KMS-Signatur-Verifikation, ausserhalb dieser Fn.
--
-- KORREKTUR gegenueber der Skizze (diese ist laut ADR §4 explizit
-- "Pseudocode-nah", keine geprueft lauffaehige SQL): die Skizze qualifizierte
-- die RETURNS-TABLE-Out-Parameter innerhalb der eingebetteten Query per
-- `pruefe_kette.tag_utc`/`pruefe_kette.lane` -- ein impliziter
-- Funktions-Block-Label dieser Form existiert in Standard-PL/pgSQL NICHT.
-- Funktional IDENTISCH umgesetzt mit eindeutig benannten lokalen Variablen
-- (v_tag_utc, v_lane), die erst unmittelbar vor RETURN NEXT den
-- gleichnamigen Out-Parametern zugewiesen werden -- keine inhaltliche
-- Abweichung von der Kanon-/Verifikationslogik (Anhang D).
CREATE FUNCTION audit.pruefe_kette(p_von date, p_bis date)
RETURNS TABLE (tag_utc date, lane smallint, status text, erste_verletzung bigint, detail text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_tag_utc date;
    v_lane    smallint;
    r         RECORD;
    v_prev    bytea;
    v_erwart  bigint;
    v_recomp  bytea;
BEGIN
    FOR v_tag_utc, v_lane IN
        SELECT DISTINCT e.tag_utc, e.lane FROM audit.event e
         WHERE e.tag_utc BETWEEN p_von AND p_bis ORDER BY 1, 2
    LOOP
        v_prev := audit.genesis(
            (SELECT min(e2.format_version) FROM audit.event e2
              WHERE e2.tag_utc = v_tag_utc AND e2.lane = v_lane),
            v_lane, v_tag_utc);
        v_erwart := 0;
        tag_utc := v_tag_utc;
        lane := v_lane;
        status := 'ok';
        erste_verletzung := NULL;
        detail := NULL;
        FOR r IN
            SELECT * FROM audit.event e
             WHERE e.tag_utc = v_tag_utc AND e.lane = v_lane
             ORDER BY e.seq
        LOOP
            v_erwart := v_erwart + 1;
            v_recomp := sha256(
                audit.canon_event(r.format_version, r.event_id, r.tag_utc, r.lane, r.seq, r.ts,
                    r.event_typ, r.objekt_typ, r.objekt_ref, r.actor_sub, r.actor_typ,
                    r.actor_rolle, r.ergebnis, r.kontext, r.korrelations_id) || v_prev);
            IF r.seq <> v_erwart THEN
                status := 'LUECKE'; erste_verletzung := v_erwart; detail := 'seq-Sprung'; EXIT;
            ELSIF r.prev_hash <> v_prev OR r.zeilen_hash <> v_recomp THEN
                status := 'MANIPULATION'; erste_verletzung := r.seq; detail := 'hash-Mismatch'; EXIT;
            END IF;
            v_prev := r.zeilen_hash;
        END LOOP;
        RETURN NEXT;
    END LOOP;
    -- Anker-Kette (je Stufe) + Abgleich gegen anker_publikation/Manifest:
    -- Monats-Job, inkl. KMS-Signatur-Verifikation (Detail Phase 4).
END;
$$;

-- =====================================================================
-- Rollen (NOLOGIN-Gruppenrollen) -- cluster-global, daher DO-Block-Idiom
-- (Migrations-Kopf, Punkt V1)
-- =====================================================================

DO $$ BEGIN
    CREATE ROLE edms_audit_owner NOLOGIN;   -- Owner der Objekte + SECURITY-DEFINER-Fns; nur Setup (Owner <> Superuser)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_audit_owner existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_app NOLOGIN;           -- Runtime-Schreibpfad (nur ueber Seal-Trigger gesiegelt)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_app existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_audit_betrieb NOLOGIN; -- privilegierter Betrieb: NUR EXECUTE auf Wrapper (kein drop_chunks/UPDATE)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_audit_betrieb existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

DO $$ BEGIN
    CREATE ROLE edms_audit_publish NOLOGIN; -- dedizierte Publish-Identitaet (O-E/c); kennt den KMS-Signaturschluessel
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_audit_publish existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- Hinweis (ADR-0003 §15.3, Dev-Single-User): Mitgliedschafts-/Credential-
-- Zuweisung (z. B. Dev-User Mitglied von edms_app fuer SET ROLE, oder
-- dedizierte Login-Rollen in Prod) ist ABSICHTLICH NICHT Teil dieser
-- Migration -- Betriebs-/Credential-Entscheidung (devops-lead/security-lead).
-- In Dev genuegt der Standard-Superuser-Bootstrap-User (SET ROLE auf jede
-- Rolle ohne explizite Mitgliedschaft moeglich, s. Verifikationsprotokoll).

-- =====================================================================
-- Ownership (Owner <> Superuser, O-F) -- ERST HIER, nach allen CREATEs
-- =====================================================================

ALTER SCHEMA audit OWNER TO edms_audit_owner;

ALTER TABLE audit.event_typ         OWNER TO edms_audit_owner;
ALTER TABLE audit.event_typ_version OWNER TO edms_audit_owner;
ALTER TABLE audit.ketten_kopf        OWNER TO edms_audit_owner;
ALTER TABLE audit.retention_freigabe OWNER TO edms_audit_owner;
ALTER TABLE audit.anker              OWNER TO edms_audit_owner;
ALTER TABLE audit.anker_publikation  OWNER TO edms_audit_owner;
ALTER TABLE audit.event              OWNER TO edms_audit_owner;

ALTER FUNCTION audit.set_updated_at()                                          OWNER TO edms_audit_owner;
ALTER FUNCTION audit.lp(text)                                                  OWNER TO edms_audit_owner;
ALTER FUNCTION audit.canon_event(smallint, uuid, date, smallint, bigint,
    timestamptz, text, text, uuid, text, text, text, text, jsonb, uuid)        OWNER TO edms_audit_owner;
ALTER FUNCTION audit.genesis(smallint, smallint, date)                         OWNER TO edms_audit_owner;
ALTER FUNCTION audit.begin_segment(smallint, smallint)                         OWNER TO edms_audit_owner;
ALTER FUNCTION audit.event_seal()                                              OWNER TO edms_audit_owner;
ALTER FUNCTION audit.append_event(text, text, text, text, text, uuid, jsonb,
    uuid, uuid, smallint)                                                     OWNER TO edms_audit_owner;
ALTER FUNCTION audit.versiegle(text, timestamptz)                              OWNER TO edms_audit_owner;
ALTER FUNCTION audit.markiere_publiziert(text, timestamptz, text, bytea)       OWNER TO edms_audit_owner;
ALTER FUNCTION audit.retention_drop(uuid)                                      OWNER TO edms_audit_owner;
ALTER FUNCTION audit.melde_ddl()                                               OWNER TO edms_audit_owner;
ALTER FUNCTION audit.pruefe_kette(date, date)                                  OWNER TO edms_audit_owner;
-- KEIN "ALTER EVENT TRIGGER trg_audit_ddl OWNER TO ...": Event-Trigger-DDL
-- (CREATE/ALTER/DROP) verlangt in Postgres IMMER Superuser, unabhaengig vom
-- Owner-Eintrag -- eine Owner-Umschreibung auf die NOLOGIN-Rolle
-- edms_audit_owner braechte keinen Sicherheitsgewinn (sie waere trotzdem nie
-- berechtigt, ihn zu aendern/droppen) und wuerde die Zuordnung nur verwirren.

-- =====================================================================
-- UNVERAENDERLICHKEIT atomar (M1) -- direkt mit der Tabellenanlage
-- =====================================================================

-- Geltungsbereich s. Migrations-Kopf ("REVOKE-Geltungsbereich"): NUR die drei
-- Beweismittel-Objekte, NICHT event_typ(_version)/ketten_kopf/
-- retention_freigabe (ADR-0003 §12, explizit begruendet).
REVOKE UPDATE, DELETE, TRUNCATE ON audit.event             FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit.anker             FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit.anker_publikation FROM PUBLIC;

-- Haertung ueber die Skizze hinaus (Migrations-Kopf, Punkt V3b): PostgreSQL
-- vergibt EXECUTE auf neue Funktionen standardmaessig an PUBLIC. Ohne dieses
-- REVOKE waeren die nachfolgenden selektiven GRANTs wirkungslos.
REVOKE EXECUTE ON FUNCTION audit.event_seal()                                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.begin_segment(smallint, smallint)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint)                                                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.versiegle(text, timestamptz)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.markiere_publiziert(text, timestamptz, text, bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.retention_drop(uuid)                                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.pruefe_kette(date, date)                            FROM PUBLIC;

-- =====================================================================
-- App-Rolle: NUR SELECT auf event (Re-Review-Auflage 1: kein direktes
-- INSERT mehr -- der einzige Schreibpfad ist audit.append_event()); SELECT
-- auf Katalog/Anker; EXECUTE Pruef-Fn + append_event(). KEIN Zugriff auf
-- ketten_kopf UND KEIN Zugriff auf begin_segment() (nur SECURITY-DEFINER-
-- Funktionen mit Owner edms_audit_owner duerfen sie noch aufrufen) --
-- Compliance-Review-Checkpunkt 1 + Re-Review-Auflage 1.
-- =====================================================================

GRANT USAGE   ON SCHEMA audit                       TO edms_app;
GRANT SELECT  ON audit.event                        TO edms_app;   -- KEIN INSERT mehr (Auflage 1)
GRANT SELECT  ON audit.event_typ, audit.event_typ_version, audit.anker, audit.anker_publikation TO edms_app;
GRANT EXECUTE ON FUNCTION audit.pruefe_kette(date, date)             TO edms_app;
GRANT EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint)                                    TO edms_app;
-- begin_segment() bekommt bewusst KEIN Grant fuer edms_app (nur intern von
-- append_event() aus aufgerufen, s. Funktions-Kommentar oben).

-- =====================================================================
-- Betriebsrolle: NUR EXECUTE auf die schmalen Wrapper + Katalog-Pflege. KEIN
-- direktes drop_chunks/UPDATE/DELETE auf event.
-- =====================================================================

GRANT USAGE   ON SCHEMA audit                       TO edms_audit_betrieb;
GRANT SELECT, INSERT ON audit.event_typ, audit.event_typ_version TO edms_audit_betrieb;  -- /add-audit-event (append-only)
GRANT INSERT, SELECT, UPDATE ON audit.retention_freigabe TO edms_audit_betrieb;          -- Vier-Augen-Workflow
GRANT EXECUTE ON FUNCTION audit.versiegle(text, timestamptz)  TO edms_audit_betrieb;
GRANT EXECUTE ON FUNCTION audit.retention_drop(uuid)          TO edms_audit_betrieb;

-- =====================================================================
-- Publish-Identitaet: NUR Publikations-Markierung (+ externer WORM/S3-/
-- KMS-Zugriff ausserhalb der DB). Getrennt von edms_audit_betrieb (SoD).
-- =====================================================================

GRANT USAGE   ON SCHEMA audit                       TO edms_audit_publish;
GRANT EXECUTE ON FUNCTION audit.markiere_publiziert(text, timestamptz, text, bytea) TO edms_audit_publish;

-- =====================================================================
-- Timeouts (STRIDE): blockierter Kopf-Lock scheitert alarmierbar statt zu
-- haengen.
-- =====================================================================

ALTER ROLE edms_app SET lock_timeout      = '2s';    -- Werte = Skizze, Phase-4-Tuning
ALTER ROLE edms_app SET statement_timeout = '10s';
-- Re-Review-Auflage 3 (security-lead): idle_in_transaction_session_timeout
-- zusaetzlich zu lock_/statement_timeout -- schliesst eine Luecke, die die
-- beiden anderen Timeouts NICHT abdecken: eine Fachtransaktion, die
-- audit.append_event() bereits erfolgreich ausgefuehrt hat (Kopf-Lock also
-- HAELT), dann aber IDLE bleibt (kein weiteres Statement, kein COMMIT/
-- ROLLBACK) und nie committet, wuerde den Segment-Lock unbegrenzt blockieren
-- -- lock_timeout greift nur beim WARTEN auf einen Lock, statement_timeout
-- nur waehrend eine Anweisung laeuft, keins von beiden bei einer bereits
-- abgeschlossenen Anweisung in einer untaetigen offenen Transaktion.
ALTER ROLE edms_app SET idle_in_transaction_session_timeout = '30s';   -- Wert = Skizze, Phase-4-Tuning

-- Grenze des REVOKE (ADR-0003 §15.4): bindet NICHT Owner/Superuser -> die
-- Hash-Kette + der EXTERN signierte, publizierte Anker (§14.5/O-E) sind die
-- eigentliche Absicherung gegen privilegierten Zugriff (F1). Der
-- ddl_command_end-Event-Trigger meldet zusaetzlich Owner-DDL
-- (Funktions-Replacement) extern.
