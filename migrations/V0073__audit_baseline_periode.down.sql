-- =====================================================================
-- V0073 (down) -- Audit-Ereignis der Baseline-Bezugszeitraeume entfernen
-- =====================================================================
--
-- Entfernt die Katalogzeile. BESTEHENDE Audit-Zeilen mit diesem Code bleiben
-- unangetastet -- `audit.event` ist append-only, und die Zeilen sind gegen
-- die Version gueltig, unter der sie geschrieben wurden. Nach dem Rollback
-- weist der Schreibpfad NEUE Ereignisse dieses Typs fail-closed ab; der
-- Erfassungsweg fuer die Baseline-Perioden ist dann nicht mehr benutzbar.
--
-- Bereits erfasste `energy.baseline_periode`-Zeilen bleiben ebenfalls
-- bestehen -- diese Migration fasst nur den Katalog an.

DELETE FROM audit.event_typ_version
 WHERE code = 'messkonzept.baseline_periode.erfasst';

DELETE FROM audit.event_typ
 WHERE code = 'messkonzept.baseline_periode.erfasst';
