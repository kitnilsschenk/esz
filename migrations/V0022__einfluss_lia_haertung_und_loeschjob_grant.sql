-- V0022__einfluss_lia_haertung_und_loeschjob_grant.sql
--
-- ADR-Bezug: docs/adr/ADR-0006-baseline-bereinigung.md Teil C, C4 ("Offene
-- Auflagen aus Phase 5 vor produktiver Aktivierung"). Setzt ZWEI dort
-- benannte Punkte um:
--   P2   (compliance-director) -- LIA-CHECK-Haertung auf einfluss.intervall.
--   O-B9 (retention-engineer + compliance-director, Vorbereitungsteil) --
--        DELETE-Grant fuer den kuenftigen fristgebundenen Loesch-Job.
-- Direkter Arbeitsauftrag (database-lead), NUR ENTWURF -- kein Apply gegen
-- die Dev-DB, keine Migrations-Ausfuehrung ausserhalb eines Wegwerf-Test-
-- containers. ADR-0006 selbst bleibt "proposed" bis technical-director-/
-- User-Freigabe.
--
-- =====================================================================
-- P2 -- LIA-CHECK-Haertung (Option A, compliance-director-Empfehlung)
-- =====================================================================
-- Befund: der bestehende CHECK aus V0020 --
--   CHECK (betroffener_typ <> 'anschlussnutzer'
--          OR (rechtsgrundlage = 'art6_1f' AND abwaegung_ref IS NOT NULL
--              AND art14_information_at IS NOT NULL))
-- -- erzwingt eine dokumentierte Interessenabwaegung NUR beim Anschluss-
-- nutzer. Fuer betroffener_typ='endkunde' liess das Schema
-- rechtsgrundlage='art6_1f' bislang OHNE jede Abwaegungs-Pflicht zu -- eine
-- Luecke, weil die LIA (Legitimate Interest Assessment) fuer Art. 6(1)(f)
-- KONSTITUTIV ist, unabhaengig vom betroffener_typ (Auftrag, woertlich).
--
-- Zwei Optionen standen zur Wahl:
--   Option A (hier umgesetzt): Endkunde-Zeilen werden auf art6_1b FEST-
--     GESCHRIEBEN -- Art.6(1)(f) fuer betroffener_typ='endkunde' wird
--     STRUKTURELL ausgeschlossen, nicht nur bedingt erlaubt.
--   Option B (NICHT umgesetzt): CHECK symmetrisch erweitern, sodass auch
--     Endkunde+art6_1f zulaessig bleibt, aber ebenfalls abwaegung_ref/
--     art14_information_at verlangt.
-- Rationale fuer A (compliance-director-Empfehlung, Auftrag): fuer den
-- Endkunden (Foerderteilnehmer, Vertragspartner) ist die Erforderlichkeit
-- zur Teilnahme am Foerderprogramm (TB-03) die tragende, PASSENDERE
-- Rechtsgrundlage (Art. 6(1)(b)) -- eine Interessenabwaegung waere hier nur
-- ein Umweg zum selben Ergebnis, mit Dokumentationsaufwand ohne fachlichen
-- Mehrwert. Der Anschlussnutzer-Fall bleibt unveraendert (er hat KEINEN
-- Vertrag mit dem Foerdernehmer, lit. b traegt dort nicht -- V0020-CHECK
-- unangetastet).
--
-- Backfill-Risiko: KEINS. `einfluss.intervall` hat zum Zeitpunkt dieser
-- Migration KEINE Backend-CRUD-Anbindung (ADR-0006 Teil C, C4/P3) und ist
-- in JEDER bislang gemergten Migration (V0020/V0021) leer geblieben --
-- V0021 seedt ausschliesslich den Audit-Event-Katalog, keine Fachzeilen.
-- `ALTER TABLE ... ADD CONSTRAINT` scannt den (leeren) Bestand ohne
-- Konfliktrisiko; kein `NOT VALID` noetig.
--
-- =====================================================================
-- O-B9-Vorbereitung -- DELETE-Grant fuer edms_einfluss
-- =====================================================================
-- `edms_einfluss` ist gemaess V0020 (D-ROLLE) die EINZIGE Rolle mit
-- Zugriff auf `einfluss.*` (Single-Role-Design des Namensraums -- anders
-- als `analytics`, das dedizierte edms_analytics_owner/edms_retention/
-- edms_analytics_detail_reader trennt). Ein kuenftiger, fristgebundener
-- Loesch-Job (Art. 17(3)(b)-Nachweisfrist, an die BAFA-Nachweispflicht
-- gebunden -- konkrete Frist bleibt WEITERHIN offen, O-B9 ist NICHT
-- geschlossen) braucht DELETE auf `einfluss.intervall`/`einfluss.befund`,
-- das V0020 nicht vergeben hat (dort nur SELECT/INSERT + spaltenscharfes
-- UPDATE(gueltig_bis_monat, updated_at), D-UPDATE-SCOPE).
--
-- Diese Migration liefert AUSSCHLIESSLICH das Recht. NICHT Teil dieser
-- Migration: der Loesch-Job selbst, seine pg_cron-Verdrahtung, die
-- konkrete Frist und der Shred-Report-Ausweis-Zaehler (P5b bereits fuer
-- `analytics`/`einfluss` in `ShreddingErgebnis` vorbereitet, C3) -- das
-- bleibt Ops-/Fach-Scope (retention-engineer + compliance-director +
-- devops-lead).
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- P2 (ADD CONSTRAINT + COMMENT) -> O-B9-Vorbereitung (GRANT DELETE).

-- =====================================================================
-- P2
-- =====================================================================

ALTER TABLE einfluss.intervall
    ADD CONSTRAINT ck_intervall_endkunde_art6_1b
    CHECK (betroffener_typ <> 'endkunde' OR rechtsgrundlage = 'art6_1b');

COMMENT ON CONSTRAINT ck_intervall_endkunde_art6_1b ON einfluss.intervall IS
  'P2 (compliance-director, ADR-0006 Teil C C4, Option A): schliesst die LIA-Luecke fuer betroffener_typ=endkunde -- Art.6(1)(f) ist ohne Interessenabwaegung fuer den Endkunden nicht zulaessig; der Endkunde wird stattdessen strukturell auf Art.6(1)(b) (Foerderteilnahme, TB-03) festgeschrieben. Anschlussnutzer-Fall unveraendert (V0020-CHECK erzwingt dort bereits Abwaegung/Art.14).';

-- =====================================================================
-- O-B9-Vorbereitung
-- =====================================================================

GRANT DELETE ON einfluss.intervall, einfluss.befund TO edms_einfluss;
