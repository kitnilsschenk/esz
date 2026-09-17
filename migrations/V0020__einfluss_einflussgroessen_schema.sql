-- V0020__einfluss_einflussgroessen_schema.sql
--
-- ADR-Bezug: docs/adr/ADR-0006-baseline-bereinigung.md Teil B, D8/B8
-- (Einflussgroessen). compliance-director-Votum 2026-07-24 zu D8 (Auflagen
-- A1-A5, "kein Veto") ist darin VOLLSTAENDIG eingearbeitet -- diese Migration
-- setzt eine bereits abgenommene Policy in DDL um, KEIN neuer
-- Compliance-Entwurf (analog V0015-Kopf zum Drei-Wege-Split). B12.5
-- (baseline-engineer, 2026-08-19) liefert die drei geschlossenen
-- Wertelisten (nutzungszweck, anlass_code, ueberschreitung_klasse), die hier
-- als CHECK umgesetzt werden.
--
-- Design-Owner: database-lead (Migrations-Entwurf, direkter Arbeitsauftrag).
-- Review vor Merge (ausstehend, ADR-Status "proposed"): technical-director,
-- compliance-director (A1-A5-Umsetzung + die beiden ueber die woertliche
-- Skizze hinaus ergaenzten CHECKs gegenpruefen, s. u.), access-control-
-- engineer (read:einflussgroesse-Haertung, B10).
--
-- =====================================================================
-- Warum ein DRITTER, EIGENER Namensraum -- NICHT identity, NICHT energy
-- (D8.1, B8, hier NUR referenziert, nicht neu entschieden)
-- =====================================================================
-- NICHT identity: Einflussgroessen gehen in reproduzierbare Nachweis-Laeufe
-- ein (ADR-0006 F6). Waeren sie am Subjekt-DEK gebunden, wuerde eine
-- Art.-17-Loeschung sie unlesbar machen und RUECKWIRKEND die
-- Nachweisfuehrung (DE-03/TB-08) zerstoeren -- Krypto-Shredding ist hier
-- AUSDRUECKLICH KEIN Loeschmittel (B8, "ein Betroffenenrecht vernichtete die
-- Beweiskette"). NICHT energy: RL-1 aus ADR-0010 -- `energy` muss ohne
-- PII-Pruefung in Analytics-/Export-/Debug-Pfaden nutzbar bleiben.
-- Praezedenz: `device` (V0010) -- eigener Namensraum + eigene Least-
-- Privilege-Rolle fuer ein Schutzobjekt mit abweichender Loesch-Policy.
--
-- KONSEQUENZ (D8.1): `einfluss.*` UEBERLEBT den Endkunden-Shred. Loeschung
-- erfolgt fristgebunden an die BAFA-Nachweispflicht (O-B9, noch offen --
-- retention-engineer + compliance-director), NICHT an die Vertragsdauer,
-- ueber einen EIGENEN, kuenftigen Loesch-Job (Ops-Scope, NICHT Teil dieser
-- Migration). Anders als `analytics.*` (V0019, A6/A7) ist `einfluss.intervall`
-- KEIN Nachweis-Artefakt im append-only-Sinn -- die Zeitreihen-Struktur
-- (gueltig_ab_monat/gueltig_bis_monat) TRAEGT Korrekturen bereits als neue
-- Zeile (Zustands-Zeitreihe, Teil A F5), das Schliessen eines Intervalls
-- (gueltig_bis_monat setzen) ist eine erwartete, seltene In-Place-Mutation
-- -- daher HIER bewusst KEIN REVOKE UPDATE FROM PUBLIC (anders als V0019).
--
-- =====================================================================
-- Entscheidungen mit Begruendung (ueber die woertliche B9-Skizze hinaus)
-- =====================================================================
--
-- (D-ROLLE) `edms_einfluss` (NOLOGIN) ist die EINZIGE Rolle mit Zugriff auf
--   dieses Schema (D8.1, "eigene DB-Rolle") -- edms_app bekommt bewusst
--   KEINEN Grant hier. Begruendung: Einflussgroessen sind das EINZIGE
--   Schutzobjekt in diesem Repo, das Klartext-PII (Personenzahl/Nutzflaeche,
--   A8) OHNE Verschluesselung/Pseudonymisierung traegt und ausschliesslich
--   ueber eine eigenstaendig gehaertete Leseaktion (`read:einflussgroesse`,
--   B10: "eigene Defense-in-Depth-Deny-Regel fuer die Auditor-Rolle") lesbar
--   sein darf -- eine separate DB-Rolle erzwingt diese Trennung STRUKTURELL
--   (echtes TOM), nicht nur ueber die ABAC-Policy-Schicht (analog V0010
--   RL-1-Begruendung fuer edms_ingest_worker). Credential-/Verbindungs-
--   Zuweisung (z. B. ein eigener DB-Connection-Pool fuer die
--   Einflussgroessen-Routen, waehrend der uebrige Request-Pfad weiter unter
--   edms_app laeuft) ist Betriebs-/Architektur-Scope (backend-lead/
--   devops-lead), NICHT Teil dieser Migration.
--
-- (D-UPDATE-SCOPE) `UPDATE` fuer edms_einfluss auf `einfluss.intervall` ist
--   SPALTENSCHARF auf `(gueltig_bis_monat, updated_at)` beschraenkt (D8.1,
--   "spaltenscharfe GRANTs" -- woertlich uebernommen, hier auf die konkrete
--   Spaltenliste angewendet). Begruendung: die einzige in B10 beschriebene
--   Mutation ist `PATCH .../einflussgroessen/{id}` ("Korrektur /
--   gueltigBisMonat setzen") -- UND das Erfassungsmodell ist explizit eine
--   ZUSTANDS-ZEITREIHE (Teil A F5): eine "Korrektur" schliesst das
--   fehlerhafte Intervall (gueltig_bis_monat) und legt eine NEUE Zeile mit
--   anlass_code='korrektur' an, statt wert_num/wert_code/rechtsgrundlage/
--   betroffener_typ etc. nachtraeglich zu ueberschreiben (das wuerde D8.3'
--   "rechtsgrundlage wird beim Erfassen FESTGESCHRIEBEN" unterlaufen). Kein
--   Widerspruch zum fehlenden REVOKE oben: die Spalten-Beschraenkung ist
--   POSITIV (nur diese zwei Spalten erlaubt), das REVOKE waere eine
--   zusaetzliche, hier nicht gewaehlte Haertungsebene fuer PUBLIC/andere
--   Rollen -- durch das explizite Spalten-GRANT bereits strukturell
--   erreicht (kein anderer, nicht gelisteter Spaltenzugriff moeglich, weil
--   Postgres UPDATE-Grants per Default auf KEINE Spalte wirken, s. V0010-
--   Kommentar zum PUBLIC-Default).
--
-- (D-KATALOG-SEED) `einfluss.katalog` wird mit den FUENF TB-03-
--   Kernkategorien aus F5(c)/D8.1-Skizzenkommentar geseedet
--   (nutzungszweck, energietraeger_mix, personenanzahl, nutzflaeche,
--   geraeteabschaffung) -- OHNE `tb03_schwellwert`-Werte (bleibt NULL): die
--   TB-03-Schwellwerte selbst sind laut ADR-Kopf ("Weiterhin ausstehend:
--   D6-Schwellwerte") NOCH NICHT final durch compliance-director bestaetigt
--   -- diese Migration seedet nur den KATALOG (Struktur, fuer FK-Ziele/
--   Testbarkeit), KEINE fachlich noch offenen Zahlen.
--
-- (D-CHECK-WERT) `einfluss.intervall`: CHECK, dass MINDESTENS eine der
--   beiden Wert-Spalten (wert_num/wert_code) belegt ist -- ueber die
--   woertliche B9-Skizze hinaus (dort keine Wert-Praesenz-Pruefung). Eine
--   Zeile ohne jeglichen Wert waere fachlich bedeutungslos.
--
-- (D-CHECK-NUTZUNGSZWECK) `einfluss.intervall`: CHECK, dass bei
--   groesse_code='nutzungszweck' der wert_code aus der B12.5-Werteliste
--   stammt (wohnen|buero|handel|produktion|lager|sonstige) -- die Aufgabe
--   nennt "Wertelisten aus B12.5 (nutzungszweck, anlass_code,
--   ueberschreitung_klasse) als CHECK" ausdruecklich; nutzungszweck ist ein
--   WERT (wert_code), kein eigenes Feld -- dieser bedingte CHECK bildet die
--   B12.5-Liste korrekt an der tatsaechlichen Speicherstelle ab.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Schema -> einfluss.set_updated_at() -> katalog (+Seed) -> intervall
-- (+CHECKs +EXCLUDE +Trigger +PII-Kommentare) -> befund (+CHECK) ->
-- Indizes -> Rolle (idempotenter DO-Block) -> GRANTS (spaltenscharf).

CREATE SCHEMA einfluss;

CREATE FUNCTION einfluss.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- Geschlossener Katalog (A2/D8.1)
-- =====================================================================

CREATE TABLE einfluss.katalog (
    code             text PRIMARY KEY,   -- nutzungszweck|energietraeger_mix|personenanzahl|nutzflaeche|geraeteabschaffung|betriebsgroesse_*
    wert_art         text NOT NULL,      -- numerisch|codiert
    einheit          text,
    tb03_schwellwert jsonb,               -- Regel je Groesse (TB-03) -- NULL bis D6-Schwellwerte final (s. D-KATALOG-SEED)
    aktiv            boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_katalog_wert_art CHECK (wert_art IN ('numerisch', 'codiert'))
);

INSERT INTO einfluss.katalog (code, wert_art, einheit) VALUES
    ('nutzungszweck',       'codiert',   NULL),
    ('energietraeger_mix',  'codiert',   NULL),
    ('personenanzahl',      'numerisch', 'Personen'),
    ('nutzflaeche',         'numerisch', 'm2'),
    ('geraeteabschaffung',  'codiert',   NULL);

-- =====================================================================
-- D8.2/D8.3 -- Einfluss-Intervalle (A3/A4, Zustands-Zeitreihe)
-- =====================================================================

CREATE TABLE einfluss.intervall (
    id                    uuid PRIMARY KEY,
    endkunde_id           uuid NOT NULL REFERENCES energy.endkunde(id),
    system_id             uuid NOT NULL REFERENCES energy.system(id),    -- RL-B1: Bilanzebene (A1)
    standort_id           uuid REFERENCES energy.standort(id),           -- nur wo gemessen wird (A1); Vorbedingung App-Scope, hier nicht dupliziert
    groesse_code          text NOT NULL REFERENCES einfluss.katalog(code),
    wert_num              numeric(18,3),
    wert_code             text,
    gueltig_ab_monat      date NOT NULL,
    gueltig_bis_monat     date,
    betroffener_typ       text NOT NULL,     -- endkunde|anschlussnutzer (A4)
    quelle_typ            text NOT NULL,     -- endkunde|anschlussnutzer|betriebsteam|vor_ort (A4)
    rechtsgrundlage       text NOT NULL,     -- art6_1b|art6_1f -- beim Erfassen FESTGESCHRIEBEN
    abwaegung_ref         text,              -- Verweis auf dokumentierte LIA (nur art6_1f)
    art14_information_at  timestamptz,       -- Vorbedingung produktiver Erfassung (A4)
    anlass_code           text,              -- geschlossene Liste, KEIN Freitext (A3/B12.5)
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (gueltig_ab_monat = date_trunc('month', gueltig_ab_monat)::date),
    CHECK (gueltig_bis_monat IS NULL
           OR (gueltig_bis_monat = date_trunc('month', gueltig_bis_monat)::date
               AND gueltig_bis_monat > gueltig_ab_monat)),
    CHECK (betroffener_typ IN ('endkunde', 'anschlussnutzer')),
    CHECK (quelle_typ IN ('endkunde', 'anschlussnutzer', 'betriebsteam', 'vor_ort')),
    CHECK (rechtsgrundlage IN ('art6_1b', 'art6_1f')),
    -- A4 als Constraint, nicht als Service-Kommentar: beim Anschlussnutzer
    -- traegt lit. b NICHT -- lit. f + Abwaegung + Art.-14-Information zwingend.
    CHECK (betroffener_typ <> 'anschlussnutzer'
           OR (rechtsgrundlage = 'art6_1f'
               AND abwaegung_ref IS NOT NULL
               AND art14_information_at IS NOT NULL)),
    -- B12.5, geschlossene Werteliste (D-CHECK-NUTZUNGSZWECK):
    CHECK (groesse_code <> 'nutzungszweck'
           OR wert_code IN ('wohnen', 'buero', 'handel', 'produktion', 'lager', 'sonstige')),
    -- B12.5, geschlossene Werteliste (anlass_code, optional):
    CHECK (anlass_code IS NULL
           OR anlass_code IN ('ersterfassung', 'turnusaktualisierung', 'korrektur',
                               'systemgrenzenaenderung', 'meldung_aenderung', 'sonstige')),
    -- D-CHECK-WERT: eine Zeile ohne jeglichen Wert ist fachlich bedeutungslos.
    CHECK (wert_num IS NOT NULL OR wert_code IS NOT NULL),
    CONSTRAINT ex_einfluss_no_overlap EXCLUDE USING gist (
        system_id WITH =, groesse_code WITH =,
        daterange(gueltig_ab_monat, gueltig_bis_monat) WITH &&
    )
);
COMMENT ON COLUMN einfluss.intervall.wert_num IS
  'pii=true — Personenzahl/Nutzflaeche sind der PII-Wert, auch pseudonymisiert; retention wie oben; shred=nein';
COMMENT ON COLUMN einfluss.intervall.wert_code IS
  'pii=true — Personenzahl/Nutzflaeche sind der PII-Wert, auch pseudonymisiert; retention wie oben; shred=nein';
COMMENT ON COLUMN einfluss.intervall.endkunde_id IS
  'personenbeziehbar=true; pii=false; art=pseudonym-referenz auf energy.endkunde.id; grundlage=Art.6(1)(b) bzw. (f) je Zeile (rechtsgrundlage); retention=an die BAFA-Nachweispflicht gebunden, NICHT an die Vertragsdauer; Loeschung NICHT ueber Krypto-Shredding (D8.1/A2, ADR-0006 B8)';

CREATE TRIGGER trg_intervall_updated_at BEFORE UPDATE ON einfluss.intervall
    FOR EACH ROW EXECUTE FUNCTION einfluss.set_updated_at();

-- =====================================================================
-- TB-03-Schwellwertueberschreitung (A5), B12.5 ueberschreitung_klasse
-- =====================================================================

CREATE TABLE einfluss.befund (
    id                     uuid PRIMARY KEY,
    system_id              uuid NOT NULL REFERENCES energy.system(id),
    groesse_code           text NOT NULL REFERENCES einfluss.katalog(code),
    zeitraum_von           date NOT NULL,
    zeitraum_bis           date NOT NULL,
    ueberschreitung_klasse text NOT NULL,   -- klassiert, KEIN Rohprozentsatz im Report-Key (B10)
    erkannt_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (zeitraum_bis > zeitraum_von),
    CHECK (ueberschreitung_klasse IN ('schwelle_ueberschritten', 'deutlich_ueberschritten', 'stark_ueberschritten'))
);

-- =====================================================================
-- Indizes (mit Begruendung)
-- =====================================================================

-- "Aktuell gueltige Werte je System+Groesse" -- Hot Path fuer Befund-
-- Erkennung UND fuer die Snapshot-Erstellung im Lauf (B7: Einflussgroessen
-- werden als dritte Snapshot-Art eingefroren) -- analog
-- ix_nutzung_system_aktiv (V0002).
CREATE INDEX ix_einfluss_intervall_system_aktuell ON einfluss.intervall (system_id, groesse_code)
    WHERE gueltig_bis_monat IS NULL;

-- TB-03-Report-Endpunkt (B10: GET .../einflussgroessen/befunde) filtert/
-- sortiert nach System + Groesse + Zeitraum.
CREATE INDEX ix_einfluss_befund_system ON einfluss.befund (system_id, groesse_code, zeitraum_von);

-- =====================================================================
-- Rolle (idempotenter DO-Block, Muster V0003/V0010) -- D8.1
-- =====================================================================

DO $$ BEGIN
    CREATE ROLE edms_einfluss NOLOGIN;   -- einzige Rolle mit Zugriff auf `einfluss.*` (D-ROLLE)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_einfluss existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- Credential-/Mitgliedschafts-Zuweisung bewusst NICHT Teil dieser Migration
-- (devops-lead/security-lead, wie ueberall in diesem Repo).

-- =====================================================================
-- GRANTS (spaltenscharf, D8.1)
-- =====================================================================

GRANT USAGE ON SCHEMA einfluss TO edms_einfluss;

GRANT SELECT ON einfluss.katalog TO edms_einfluss;   -- governter Katalog, kein INSERT/UPDATE zur Laufzeit

GRANT SELECT, INSERT ON einfluss.intervall TO edms_einfluss;
GRANT UPDATE (gueltig_bis_monat, updated_at) ON einfluss.intervall TO edms_einfluss;   -- D-UPDATE-SCOPE: NUR Intervall-Schliessen

GRANT SELECT, INSERT ON einfluss.befund TO edms_einfluss;   -- KEIN UPDATE/DELETE (Befund ist Erkennungs-Log, keine Korrektur vorgesehen)
