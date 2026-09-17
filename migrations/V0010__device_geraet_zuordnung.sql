-- V0010__device_geraet_zuordnung.sql
--
-- ADR-Bezug: docs/adr/ADR-0005-messdaten-ingestion.md §26 ("D14 — O4: DevEUI
-- <-> Zaehler-Korrelation, das Herzstueck"), §28 ("D16 — Schema-Skizze,
-- Phase-4-Ausblick"). Design-Owner: technical-director/access-control-engineer
-- (ADR-0005 Phase-2-Design). Migrations-Entwurf: database-lead.
-- ADR-0005 hat Phase 2 (vier Fach-Reviews) + Phase 3 (compliance-director
-- KEIN VETO) durchlaufen. Diese Migration ist Teil des Phase-4-Migrations-
-- Batches (V0010-V0013), NUR Schema -- das Ingest-Gate (ADR-0005 §0/§19,
-- "fail-closed synthetic-only") bleibt ZU: keine Anwendungslogik/Datenpfad
-- wird hier verdrahtet, keine echten personenbezogenen Daten fliessen.
--
-- Review vor Merge (ausstehend, s. Antwort des Auftrags): database-lead
-- (Migrations-Entwurf) + compliance-director (PII-Spalten wrapped_dek/
-- deveui_enc, .claude/rules/database-migrations.md).
--
-- =====================================================================
-- Namensraum-Entscheidung (ADR-0005 §26.1, Vorgabe-Punkt 3)
-- =====================================================================
-- Neuer Namensraum `device`, NICHT `identity` mitbenutzt: `identity` bleibt
-- strikt "echte Personen-PII" (Endkunde/Anschlussnutzer, V0002); Geraete-
-- Korrelationsdaten sind ein ANDERES Schutzobjekt (Geraet, nicht Person) mit
-- potenziell abweichender Aufbewahrungs-/Loesch-Policy -- eigener
-- Namensraum haelt beide Schutzobjekte sauber getrennt (kein Vermischen auf
-- Schluesselebene, s. auch §26.5 "verworfene Alternative").
--
-- ROTE LINIE (ADR-0005 §26.1, Fortschreibung V0002 rote Linie 1/5):
-- `energy.zaehler` bekommt KEINE Geraete-Referenz-Spalte -- weder Klartext
-- noch verschluesselt (unveraendert seit V0002 Abweichung (a)).
-- `device.geraet_zuordnung.zaehler_id` ist ein LOGISCHER Verweis auf
-- `energy.zaehler.id` -- KEIN `REFERENCES`, KEIN Cross-Namensraum-Hart-FK.
-- Die aufrufende Anwendungsschicht prueft die Existenz SELBST (App-seitige
-- Referenzintegritaet, analog zur bereits etablierten `messkanal_key`-
-- Konvention aus V0002/ADR-0005 §25 S3c). Aus demselben Grund ist
-- `device.set_updated_at()` eine EIGENE, dupliziert angelegte Funktion --
-- KEIN Cross-Schema-Aufruf auf `energy.set_updated_at()` (V0002 rote Linie 5,
-- ADR-0005 DB-3).
--
-- ROTE LINIE (RL-1, Least-Privilege-Rollentrennung, ADR-0005 §26.4): die
-- neue Betriebsrolle `edms_ingest_worker` bekommt NUR spaltenscharfen
-- `SELECT` auf GENAU die vier Spalten, die der Worker-Vorwaerts-Lookup
-- tatsaechlich braucht (`zaehler_id, deveui_blind_index, status,
-- gueltig_bis` -- s. ADR-0005 §26.3 "kanonisches Aktiv-Praedikat"
-- `status='aktiv' AND gueltig_bis IS NULL`, s. u.). KEIN `SELECT` auf
-- `deveui_enc`/`crypto_key_id` (die Klartext-DevEUI ist fuer den Worker
-- niemals noetig -- er arbeitet ausschliesslich ueber den Blind-Index, ADR-
-- 0005 §26.6). KEIN Zugriff (kein GRANT jeglicher Art) auf `device.
-- schluessel` -- der Worker hat keinerlei Bedarf, DEKs zu lesen. KEIN
-- Zugriff auf `identity.*` -- der Worker kennt ausschliesslich Pseudonym-/
-- Kanal-Surrogate (ADR-0005 §2), niemals eine reale Identitaet. Diese
-- Beschraenkung wird durch das DB-Rechte-Modell selbst erzwungen (echtes
-- TOM, funktioniert auch bei einem Anwendungs-Bug), NICHT nur durch
-- Anwendungslogik (ADR-0005 §26.4, "Deny-by-default ... ueber eine
-- dedizierte, spaltenscharfe Postgres-Rolle").
--
-- HINWEIS (PostgreSQL-Grundverhalten): Tabellen bekommen bei `CREATE TABLE`
-- STANDARDMAESSIG KEINERLEI Rechte fuer `PUBLIC` (anders als Funktionen, wo
-- `EXECUTE` automatisch an `PUBLIC` vergeben wird, s. V0003 Punkt V3b) --
-- ein explizites `REVOKE ... FROM PUBLIC` auf `device.schluessel`/
-- `device.geraet_zuordnung` ist daher NICHT noetig: es gibt nichts zu
-- entziehen. Das Unterlassen jeglichen GRANTs an `identity.*` fuer
-- `edms_ingest_worker` genuegt bereits, um "KEIN Zugriff auf identity.*"
-- strukturell durchzusetzen.
--
-- =====================================================================
-- Entscheidungen mit Begruendung (Auftrag: "entscheide + dokumentiere")
-- =====================================================================
--
-- (D-EXCL) EXCLUDE-Constraint auf `device.geraet_zuordnung` (ADR-0005 §28
--   nennt ihn in der Schema-Skizze, der Arbeitsauftrag stellt ihn als
--   OPTIONAL zur Entscheidung): AUFGENOMMEN.
--   Begruendung: verhindert zwei zeitlich UEBERLAPPENDE Geraete-Zuordnungen
--   fuer DENSELBEN `zaehler_id` -- z. B. wenn ein Geraete-Tausch-Workflow
--   die ALTE Zuordnung nicht korrekt mit `gueltig_bis` schliesst, bevor die
--   NEUE geoeffnet wird. Ohne diesen Schutz koennten zwei unterschiedliche
--   DevEUIs gleichzeitig als "aktiv fuer denselben Zaehler" markiert sein --
--   fachlich widerspruechlich (ein physischer Zaehler hat zu einem Zeitpunkt
--   genau ein aktives Funkmodul) und eine stille Datenqualitaets-Luecke, die
--   erst bei einer spaeteren Reverse-Aufloesung (§26.4, Support-/Diagnose-
--   Fall) auffiele. Kosten-Nutzen: Provisionierung ist eine SELTENE,
--   niedrigfrequente Operation (Geraete-Installation/-Tausch, ADR-0005
--   §26.4-Tabelle) -- der zusaetzliche GIST-Index-Overhead betrifft NICHT
--   den M3-Hochdurchsatz-Ingest-Pfad (>= 50.000 Uplinks/s), sondern nur den
--   seltenen Schreibpfad auf `device.geraet_zuordnung` selbst. `btree_gist`
--   ist bereits seit V0001 installiert (dort fuer exakt dieses Muster
--   vorgesehen, s. V0001-Kommentar); `energy.nutzungsverhaeltnis` (V0002)
--   nutzt bereits denselben Constraint-Typ fuer eine strukturell identische
--   Anforderung (Overlap-Schutz je Entitaet). Kein spekulativer Index im
--   Sinne der Regel (`.claude/rules/database-migrations.md`): adressiert
--   ein konkret benanntes, im ADR selbst identifiziertes Integritaetsrisiko.
--
-- (D-KANON) Kanonisches Aktiv-Praedikat (DB-1/TD-3, ADR-0005 §26.3/§26.5,
--   VERBINDLICH): `CHECK ((status = 'aktiv') = (gueltig_bis IS NULL))`
--   erzwingt, dass Deaktivierung UND Shredding IMMER `gueltig_bis` mit-
--   schliessen -- nie nur eines von beiden. Der partielle Unique-Index
--   `UNIQUE(deveui_blind_index) WHERE gueltig_bis IS NULL` und der Worker-
--   Lookup (§26.6, `WHERE deveui_blind_index = $1 AND status = 'aktiv' AND
--   gueltig_bis IS NULL`) verwenden WORTGLEICH dasselbe Praedikat -- keine
--   drei unabhaengig formulierten, potenziell divergierenden Bedingungen.
--
-- (D-GB) `deveui_blind_index` NULLABLE (GB-C, Haertung UEBER die
--   ADR-0005-§26.5-Textfassung hinaus, aber ausdruecklich Teil dieses
--   Migrations-Auftrags): der partielle Unique-Index ALLEIN wuerde beim
--   Shredding bereits durch das gesetzte `gueltig_bis` greifen (die Zeile
--   faellt aus dem `WHERE gueltig_bis IS NULL`-Filter, unabhaengig vom
--   Blind-Index-Wert). Das zusaetzliche Nullen von `deveui_blind_index`
--   selbst (App-Schicht, KryptoShreddingService, NICHT Teil dieser
--   Migration) verhindert DARUEBER HINAUS, dass eine geshredderte Zeile ueber
--   ihren weiterhin deterministischen HMAC-Wert spaeter mit einer neuen
--   Zuordnung fuer dasselbe physische Geraet (Wiederverwendung/Re-
--   Provisionierung) verkettet werden koennte -- Verteidigung gegen
--   Re-Identifikations-Korrelation, die ueber die reine DEK-Vernichtung
--   hinausgeht. Diese Migration legt NUR die Nullable-Eigenschaft an; die
--   Ausfuehrung des Nullens ist App-Scope (`DeviceKryptoShreddingService`,
--   ADR-0005 §26.5).
--
-- (D-ROLLE) `edms_ingest_worker` als eigene, NEUE Rolle (nicht Wieder-
--   verwendung von `edms_app`/`edms_audit_betrieb` aus V0003): der Worker
--   ist ein eigenstaendiger, hochfrequenter (M3: >= 50.000/s) Prozess ohne
--   HTTP-`SecurityContext` (ADR-0005 §26.4, "Deny-by-default ... NICHT ueber
--   den HTTP-gebundenen PolicyDecisionPort") -- ein eigenes, minimal
--   geschnittenes Rechte-Profil ist hier angemessener als die Wieder-
--   verwendung einer bereits breiter berechtigten Rolle. Idempotente
--   Anlage via `DO`-Block mit `EXCEPTION WHEN duplicate_object` (V0003-
--   Muster V1, da `CREATE ROLE` kein `IF NOT EXISTS` kennt). `NOLOGIN`
--   (Gruppenrolle) -- Credential-/Mitgliedschafts-Zuweisung ist bewusst
--   NICHT Teil dieser Migration (Betriebs-/Credential-Entscheidung,
--   devops-lead/security-lead, analog V0003 §15.3-Hinweis).
--
-- (D-GRANT-ERW) UEBER DEN WOERTLICHEN AUFTRAGSTEXT HINAUS ERGAENZT (bitte
--   im Review besonders pruefen): der Auftrag fuer DIESE Datei nennt
--   explizit nur den spaltenscharfen Grant auf `device.geraet_zuordnung`.
--   Diese Migration ergaenzt zusaetzlich `GRANT USAGE ON SCHEMA energy` +
--   `GRANT SELECT ON energy.zaehler, energy.messkanal TO
--   edms_ingest_worker` -- OHNE diese beiden Grants ist der in ADR-0005 §20
--   (Schritte 5 und 7: Geraetetyp-Auflösung, Kanal-Auflösung) beschriebene
--   Ingest-Flow strukturell UNAUSFUEHRBAR (der Worker koennte nach einem
--   erfolgreichen Blind-Index-Treffer weder den Geraetetyp noch den
--   `kanal_key` ermitteln). ADR-0005 §26.4 fuehrt exakt diese beiden Grants
--   bereits in der dortigen Rechte-Matrix ("energy.zaehler, energy.
--   messkanal | SELECT (nicht-PII Stammdaten)"). Ergaenzung hier aus
--   Vollstaendigkeitsgruenden -- KEINE neue PII-Exposition (beide Tabellen
--   sind bereits seit V0002 PII-frei, rote Linie 1).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> device.set_updated_at() -> device.schluessel -> device.
-- geraet_zuordnung (+ CHECKs + EXCLUDE + partieller Unique-Index) ->
-- Trigger -> Rolle (idempotenter DO-Block) -> Grants.

CREATE SCHEMA device;

-- Eigene, je-Schema-duplizierte Trigger-Funktion (rote Linie 5, s. o.) --
-- inhaltlich identisch zu identity.set_updated_at()/energy.set_updated_at()
-- (V0002), aber bewusst NICHT wiederverwendet (kein Cross-Schema-Aufruf).
CREATE FUNCTION device.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- device.schluessel -- 1 DEK je Geraete-Zuordnungs-Zeile (ADR-0005 §26.2)
-- =====================================================================
-- Strukturell identisch zu identity.subjekt_schluessel (V0002), aber
-- EIGENER Schluesselraum (bewusst dupliziert, nicht cross-schema geteilt --
-- konsistent mit der "je-Schema-duplizierte Funktionen/Strukturen"-
-- Konvention, V0002 rote Linie 5). Krypto-Shredding (Art. 17 DSGVO) = DEK
-- hier vernichten -> deveui_enc wird unwiederbringlich (ADR-0005 §26.5).
-- KEIN `updated_at` (DB-3, analog identity.subjekt_schluessel V0002): der
-- einzige In-Place-Zustandswechsel ist das einmalige Shredding, dafuer
-- traegt die Zeile bereits `geschreddert_at`.
CREATE TABLE device.schluessel (
    id              uuid PRIMARY KEY,             -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002 S4)
    wrapped_dek     bytea       NOT NULL,          -- DEK, gewrappt via KMS (FieldCipherService, ADR-0005 §26.2)
    kms_key_id      text        NOT NULL,          -- Referenz auf KMS-Masterschluessel
    alg_version     smallint    NOT NULL,          -- Krypto-Agilitaet (AES-256-GCM v1)
    key_state       text        NOT NULL DEFAULT 'aktiv',  -- aktiv|geschreddert
    created_at      timestamptz NOT NULL DEFAULT now(),
    geschreddert_at timestamptz
);
COMMENT ON COLUMN device.schluessel.wrapped_dek IS
  'pii=true; grundlage=Art.32 DSGVO (TOM Verschluesselung) [Platzhalter -> final DSFA-Nachtrag ADR-0005 §32]; retention=an Geraete-Zuordnung gebunden; Loeschung=Krypto-Shredding (Art.17) via DeviceKryptoShreddingService; analog identity.subjekt_schluessel.wrapped_dek (V0002); ADR-0005 §26.2/§26.5';

-- =====================================================================
-- device.geraet_zuordnung -- O4-Kernkorrelation DevEUI <-> Zaehler
-- (ADR-0005 §26, das "Herzstueck" der DevEUI-Zaehler-Korrelation)
-- =====================================================================
CREATE TABLE device.geraet_zuordnung (
    id                  uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT
    zaehler_id          uuid        NOT NULL,       -- LOGISCHER Verweis auf energy.zaehler.id -- KEIN FK (rote Linie, s. Datei-Kopf)
    crypto_key_id       uuid        NOT NULL UNIQUE -- UNIQUE: 1 DEK je Zuordnungs-Zeile (DB-2, 1:1-Shredding-Granularitaet)
                        REFERENCES device.schluessel(id),
    deveui_enc          bytea       NOT NULL,       -- AES-256-GCM(nonce||ciphertext||tag); AAD = LP(zaehler_id)||LP('deveui')
    deveui_blind_index  bytea,                       -- HMAC-SHA256(pepper, normalisierte DevEUI); NULLABLE -- s. Entscheidung D-GB
    pepper_version      smallint    NOT NULL,        -- Pepper-Rotations-Voraussetzung (ADR-0005 §26.3)
    status              text        NOT NULL DEFAULT 'aktiv',  -- aktiv|inaktiv|geschreddert
    gueltig_von         timestamptz NOT NULL DEFAULT now(),
    gueltig_bis         timestamptz,                 -- NULL = aktuell aktiv; s. kanonisches Praedikat D-KANON
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_geraet_zuordnung_status CHECK (status IN ('aktiv', 'inaktiv', 'geschreddert')),
    -- D-KANON (DB-1/TD-3, verbindlich): Deaktivierung/Shredding schliessen
    -- IMMER gueltig_bis -- nie nur status ODER nur gueltig_bis allein.
    CONSTRAINT ck_geraet_zuordnung_aktiv_praedikat CHECK ((status = 'aktiv') = (gueltig_bis IS NULL)),
    -- D-EXCL (s. Datei-Kopf): verhindert zeitlich ueberlappende Zuordnungen
    -- fuer denselben Zaehler (Geraete-Tausch-Workflow-Fehler).
    CONSTRAINT ex_geraet_zuordnung_no_overlap EXCLUDE USING gist (
        zaehler_id WITH =,
        tstzrange(gueltig_von, gueltig_bis) WITH &&
    )
);
COMMENT ON COLUMN device.geraet_zuordnung.deveui_enc IS
  'pii=true; grundlage=Art.6(1)(f) DSGVO (Netzbetrieb/Geraete-Korrelation) [Platzhalter -> final DSFA-Nachtrag, ADR-0005 §32]; retention=an Geraete-Zuordnung gebunden; Loeschung=Krypto-Shredding (Art.17) ueber device.schluessel; Layout=nonce||ciphertext||tag (AES-256-GCM, FieldCipherService); AAD=LP(zaehler_id)||LP(''deveui''); ADR-0005 §26.2';
COMMENT ON COLUMN device.geraet_zuordnung.deveui_blind_index IS
  'personenbeziehbar=true; pii=false; art=deterministisches-korrelat (HMAC-SHA256 mit system-weitem Pepper, ADR-0005 §26.3); MUSS beim Krypto-Shredding (Art.17) zusaetzlich zu status/gueltig_bis auf NULL gesetzt werden (App-Schicht, DeviceKryptoShreddingService, GB-C) -- verhindert Re-Identifikations-Korrelation ueber den deterministischen HMAC hinaus, auch nach DEK-Vernichtung; ADR-0005 §26.3/§26.5';

-- ABAC-/Worker-Hot-Path (analog energy.nutzungsverhaeltnis-Indizes, V0002):
-- exakt das kanonische Praedikat status='aktiv' AND gueltig_bis IS NULL
-- (D-KANON) als partieller Index -- nur die aktuell AKTIVE Zuordnung muss je
-- Blind-Index eindeutig sein; eine historisch beendete/geshredderte Zeile
-- fuer denselben Blind-Index bleibt bei Geraete-Wiederverwendung erlaubt.
CREATE UNIQUE INDEX ux_geraet_zuordnung_blind_index_aktiv
    ON device.geraet_zuordnung (deveui_blind_index) WHERE gueltig_bis IS NULL;

CREATE TRIGGER trg_geraet_zuordnung_updated_at BEFORE UPDATE ON device.geraet_zuordnung
    FOR EACH ROW EXECUTE FUNCTION device.set_updated_at();

-- =====================================================================
-- Rolle edms_ingest_worker (idempotenter DO-Block, V0003-Muster V1)
-- =====================================================================

DO $$ BEGIN
    CREATE ROLE edms_ingest_worker NOLOGIN;  -- Least-Privilege-Betriebsrolle des Ingest-Workers (ADR-0005 §26.4)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_ingest_worker existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- Credential-/Mitgliedschafts-Zuweisung bewusst NICHT Teil dieser Migration
-- (Betriebs-/Credential-Entscheidung, devops-lead/security-lead, analog
-- V0003 §15.3-Hinweis).

-- =====================================================================
-- Grants (RL-1, spaltenscharf, ADR-0005 §26.4-Rechte-Matrix)
-- =====================================================================

GRANT USAGE ON SCHEMA device TO edms_ingest_worker;

-- NUR die vier Spalten, die der kanonische Worker-Lookup (§26.3/§26.6)
-- braucht: `WHERE deveui_blind_index = $1 AND status = 'aktiv' AND
-- gueltig_bis IS NULL` liefert `zaehler_id`. KEIN SELECT auf deveui_enc/
-- crypto_key_id (Klartext-DevEUI/DEK-Referenz niemals fuer den Worker
-- noetig).
GRANT SELECT (zaehler_id, deveui_blind_index, status, gueltig_bis)
    ON device.geraet_zuordnung TO edms_ingest_worker;

-- KEIN Grant jeglicher Art auf device.schluessel fuer edms_ingest_worker
-- (kein SELECT, kein INSERT/UPDATE/DELETE) -- der Worker liest niemals DEKs.
-- KEIN Grant auf identity.* (rote Linie, s. Datei-Kopf).

-- Kein Auto-Provisioning durch den Worker (ADR-0005 §11 Design-Prinzip 4,
-- §26.4): edms_ingest_worker bekommt bewusst KEIN INSERT/UPDATE/DELETE auf
-- device.geraet_zuordnung -- strukturell durch das DB-Rechte-Modell
-- erzwungen, nicht nur durch Anwendungslogik.

-- D-GRANT-ERW (s. Datei-Kopf): Stammdaten-Lesezugriff, ohne den der
-- Ingest-Flow (ADR-0005 §20 Schritte 5+7) strukturell nicht funktioniert.
GRANT USAGE ON SCHEMA energy TO edms_ingest_worker;
GRANT SELECT ON energy.zaehler, energy.messkanal TO edms_ingest_worker;
