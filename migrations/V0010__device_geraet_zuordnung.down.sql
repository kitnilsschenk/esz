-- V0010__device_geraet_zuordnung.down.sql
--
-- Rollt den Namensraum `device` (ADR-0005 §26, O4-DevEUI-Zaehler-Korrelation)
-- vollstaendig zurueck. Greenfield-Migration (kein Bestandsschema, keine
-- Produktivdaten -- Ingest-Gate bleibt geschlossen, s. Up-Datei-Kopf) --
-- `DROP SCHEMA device CASCADE` ist hier vertretbar: alle Tabellen/Funktionen/
-- Trigger/Indizes/Constraints in diesem Schema wurden AUSSCHLIESSLICH von
-- V0010 angelegt.
--
-- WICHTIG (anders als V0002/V0003/V0008-Down-Dateien): diese Migration hat
-- ZUSAETZLICH Grants auf Objekten AUSSERHALB des Schemas `device` vergeben
-- (`energy.zaehler`, `energy.messkanal`, Schema `energy` selbst -- s. Up-Datei
-- Entscheidung D-GRANT-ERW). `DROP SCHEMA device CASCADE` faengt diese
-- Grants NICHT ein (sie haengen an `energy`-Objekten, die von V0002 verwaltet
-- werden und hier unangetastet bleiben muessen) -- sie werden daher VOR dem
-- Schema-Drop explizit zurueckgenommen, damit ein Rollback dieser Migration
-- keine Rechte-Reste auf einem fremden Schema hinterlaesst.

-- =====================================================================
-- (1) Ausserhalb von `device` vergebene Grants zurueeknehmen (D-GRANT-ERW)
-- =====================================================================

REVOKE SELECT ON energy.zaehler, energy.messkanal FROM edms_ingest_worker;
REVOKE USAGE ON SCHEMA energy FROM edms_ingest_worker;

-- =====================================================================
-- (2) Schema-CASCADE-Drop
-- =====================================================================
-- Entfernt device.schluessel, device.geraet_zuordnung (inkl. CHECKs,
-- EXCLUDE-Constraint, partiellem Unique-Index, Trigger), device.
-- set_updated_at() -- alles ausschliesslich V0010-Eigentum.
--
-- ACHTUNG (nur relevant, falls dieser Rollback NICHT auf einer frischen
-- Dev-/Test-Instanz erfolgt): Greenfield-Migration ohne Produktivdaten ->
-- .claude/rules/database-migrations.md verlangt HIER keinen gesonderten
-- Backup-Nachweis. Wurde diese Migration bereits auf einer Instanz MIT
-- echten (auch synthetischen Pilot-)Daten angewendet, ist vor diesem
-- Rollback ein Backup zu ziehen und die User-Freigabe einzuholen
-- (devops-lead-Abstimmung, analog V0002/V0003/V0008-Down-Dateien).
DROP SCHEMA device CASCADE;

-- =====================================================================
-- (3) Rolle bewusst NICHT gedroppt (dokumentierter Teil-No-Op,
-- V0003-Praezedenzfall)
-- =====================================================================
-- Begruendung (analog V0003-Down-Datei, Punkt V1):
--   (a) Rollen sind CLUSTER-, nicht datenbankweit -- dieser Rollback kann
--       aus der aktuellen Datenbank heraus nicht sicher/deterministisch
--       pruefen, ob edms_ingest_worker in einer ANDEREN Datenbank desselben
--       Clusters noch Grantee ist.
--   (b) Nach Schritt (1)+(2) besitzt edms_ingest_worker ohnehin keinerlei
--       Privilegien mehr auf konkrete Objekte dieses Features (weder in
--       `device` noch die ergaenzten `energy.*`-Grants) -- die verbleibende
--       Rollen-Huelle ist inert/harmlos.
--   (c) Eine spaetere Migration (V0011/V0013 dieses Batches, oder ein
--       kuenftiger Ausbau) verwendet edms_ingest_worker voraussichtlich
--       weiter -- ein Drop hier waere ein versteckter Bruch fuer bereits
--       geschriebene/geplante Folge-Migrationen dieses selben Batches.
--
-- Wer diese Migration auf einer isolierten Dev-/Test-Instanz wirklich
-- vollstaendig zurueckrollen will (inkl. Rolle), tut das bewusst und manuell
-- ausserhalb des Runners -- NICHT ueber diese Datei:
--   DROP ROLE IF EXISTS edms_ingest_worker;
-- (Nur zulaessig, wenn KEINE der Folge-Migrationen V0011/V0013 mehr
-- angewendet ist -- sonst schlaegt DROP ROLE mit "cannot be dropped because
-- some objects depend on it" fehl.)
