-- =====================================================================
-- V0072 (down) -- Audit-Ereignis der Systemgrenzen-Zuordnung entfernen
-- =====================================================================
--
-- Entfernt die Katalogzeile. BESTEHENDE Audit-Zeilen mit diesem Code bleiben
-- unangetastet -- `audit.event` ist append-only, und die Zeilen sind gegen
-- die Version gueltig, unter der sie geschrieben wurden. Nach dem Rollback
-- weist der Schreibpfad NEUE Ereignisse dieses Typs fail-closed ab; der
-- Erfassungsweg fuer die Systemgrenze ist dann nicht mehr benutzbar.

DELETE FROM audit.event_typ_version
 WHERE code = 'messkonzept.systemgrenze.zugeordnet';

DELETE FROM audit.event_typ
 WHERE code = 'messkonzept.systemgrenze.zugeordnet';
