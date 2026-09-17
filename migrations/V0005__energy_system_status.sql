-- V0005__energy_system_status.sql
--
-- ADR-Bezug: docs/adr/ADR-0008-stammdaten-betriebs-ui.md §12
-- ("Scope-Abgleich Modell ↔ V0002 (drei bindende Schema-Realitäten)"):
-- "`energy.system` ... hat KEINE `status`-/Sperr-Spalte ... Entscheidung
-- (access-control-engineer 5): `energy.system` bekommt in Phase 4 eine
-- `status`-Spalte (`aktiv|stillgelegt`) via Folge-Migration V0005 -- sonst
-- ist weder Deaktivierung noch die transitive Sperre bei Endkunde-Sperre
-- abbildbar." Design-Owner der Entscheidung: access-control-engineer
-- (ADR-0008 Phase-2-Review). Migrations-Umsetzung: database-lead.
-- Review vor Merge: database-lead (Selbst-Review) + compliance-director
-- (s. "NICHT-PII"-Vermerk unten -- leichtgewichtiger Review erwartet, keine
-- PII-Spalte betroffen).
--
-- WARUM (fachlicher Hintergrund, ADR-0008 §12): `energy.zaehler` und
-- `energy.messkanal` haben bereits je eine `status`-Spalte
-- (`aktiv|stillgelegt`, V0002) -- `energy.system` (Messstelle) hatte in V0002
-- KEINE. Folgen ohne diese Spalte: (a) ein stillgelegtes/abgebautes System
-- ist nicht abbildbar, ohne das in `.claude/rules/database-migrations.md`
-- ("Keine DROP TABLE auf produktive Tabellen ...") und ADR-0004 rote Linie 3
-- ("Zustand statt Zerstörung") verbotene Hard-DELETE zu verwenden; (b) wird
-- der zugehörige `energy.endkunde` gesperrt (Art. 18) oder per
-- Krypto-Shredding gelöscht (Art. 17, ADR-0004 §16), kann `energy.system`
-- diesen Zustand strukturell nicht spiegeln. Diese Migration schließt NUR
-- die strukturelle Lücke (die Spalte selbst) -- der eigentliche
-- Übertragungsmechanismus "Endkunde gesperrt -> zugehörige Systeme auf
-- `stillgelegt`" ist Anwendungs-/ABAC-Logik (ADR-0002/ADR-0008
-- Service-Schicht) und NICHT Teil dieser Schema-Migration.
--
-- MUSTER-ABGLEICH (Auftrag: "prüfe deren echte Werte/Namen und übernimm sie
-- konsistent"): `energy.zaehler.status` und `energy.messkanal.status`
-- (beide V0002) sind `text NOT NULL DEFAULT 'aktiv'` mit Werten
-- `aktiv|stillgelegt`, dokumentiert NUR per Inline-Kommentar ("-- aktiv|
-- stillgelegt -- NIE hart löschen"), OHNE CHECK-Constraint. Diese Migration
-- übernimmt Spaltentyp, Default und die exakt gleichen Wertnamen
-- (`aktiv`/`stillgelegt`) 1:1 -- volle Konsistenz mit dem etablierten
-- Vokabular.
--
-- DOKUMENTIERTE ABWEICHUNG vom Zähler-/Messkanal-Muster (Kennzeichnungspflicht):
-- Diese Spalte bekommt zusätzlich ein echtes `CHECK`-Constraint
-- (`ck_system_status`), das `zaehler.status`/`messkanal.status` NICHT haben
-- (dort nur Kommentar-Konvention). Das ist eine bewusste, isolierte
-- Härtung für diese NEUE Spalte (im Auftrag explizit gefordert) -- keine
-- rückwirkende Änderung der bereits gemergten V0002-Spalten (append-only;
-- ein CHECK dort nachzuziehen wäre eine eigene, spätere Migration, falls
-- gewünscht, hier nicht beauftragt). Die CHECK-Werte sind identisch zur
-- Kommentar-Konvention (`aktiv`/`stillgelegt`), daher keine
-- Vokabular-Abweichung, nur eine strengere DB-seitige Durchsetzung.
--
-- NICHT-PII (Compliance-Review-Vereinfachung): `status` ist eine
-- betriebliche Zustandsspalte auf einer Fachtabelle im `energy`-Schema
-- (keine PII laut ADR-0004 rote Linie 1: `energy`/`measurement` führen
-- ausschließlich Pseudonyme/Fachattribute). Kein `COMMENT ON COLUMN ...
-- pii=true`, kein `REVOKE` nötig (`energy.system` steht -- wie alle
-- `energy.*`-Tabellen -- nicht unter der `audit`-spezifischen
-- REVOKE-Pflicht aus `.claude/rules/database-migrations.md`, die sich auf
-- Audit-Tabellen im Schema `audit` bezieht, s. V0003-Migrations-Kopf
-- "REVOKE-Geltungsbereich"). Analog zu `energy.zaehler.status`/
-- `energy.messkanal.status`, die ebenfalls keinen PII-Kommentar tragen.
--
-- ADDITIV, NICHT-BRECHEND: `ADD COLUMN ... DEFAULT 'aktiv'` befüllt
-- bestehende Zeilen automatisch mit dem Default (PostgreSQL >= 11: additive
-- Spalte mit konstantem Default ist eine reine Metadaten-Operation, KEIN
-- Tabellen-Rewrite/Full-Table-Lock) -- kein Datenverlust, keine
-- Anwendungs-/API-Breaking-Change (ADR-0008 §12: "der API-Contract bleibt
-- additiv: ein späteres `DELETE /systeme/{id}` = Stilllegung kommt ohne
-- Bruch dazu").
--
-- Kein `updated_at`-Sonderfall: `energy.system` hat bereits einen
-- `updated_at`-Trigger (`trg_system_updated_at`, V0002) -- ein `UPDATE
-- energy.system SET status = ...` wird davon unverändert miterfasst, keine
-- Änderung an Trigger/Funktion nötig.

ALTER TABLE energy.system
    ADD COLUMN status text NOT NULL DEFAULT 'aktiv';  -- aktiv|stillgelegt -- NIE hart löschen (ADR-0004 rote Linie 3, analog zaehler/messkanal)

ALTER TABLE energy.system
    ADD CONSTRAINT ck_system_status CHECK (status IN ('aktiv', 'stillgelegt'));

COMMENT ON COLUMN energy.system.status IS
  'Betriebs-/Sperrzustand der Messstelle: aktiv|stillgelegt; NIE hart löschen (ADR-0004 rote Linie 3, ADR-0008 §12); keine PII (energy-Schema, Fachattribut, rote Linie 1)';
