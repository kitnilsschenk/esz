-- V0003__audit_log_schema.down.sql
--
-- Rollt das Audit-Log-Schema (ADR-0003) vollstaendig zurueck. Greenfield-
-- Migration (kein Bestandsschema, keine Produktivdaten -- Schema-only,
-- Emitter nicht verdrahtet, s. Up-Datei-Kopf); `DROP SCHEMA audit CASCADE`
-- ist hier vertretbar, weil alle Tabellen/Funktionen/Trigger/Indizes/das
-- Hypertable in diesem Schema AUSSCHLIESSLICH von V0003 angelegt wurden.
--
-- Reihenfolge: (1) Event-Trigger zuerst explizit entfernen (liegt NICHT im
-- Schema `audit`, s. u.), (2) Schema-CASCADE-Drop, (3) Rollen bewusst NICHT
-- droppen (dokumentierter Teil-No-Op, analog V0001-Extensions), (4)
-- Timeout-Konfiguration auf der (bestehen bleibenden) Rolle edms_app
-- zuruecksetzen.

-- =====================================================================
-- (1) Event-Trigger zuerst entfernen
-- =====================================================================
-- Event-Trigger sind Datenbank-, keine Schema-Objekte (kein
-- Namensraum-Mitglied von `audit`) -- `DROP SCHEMA audit CASCADE` wuerde
-- trg_audit_ddl zwar ueber die Abhaengigkeit zu audit.melde_ddl() implizit
-- mit entfernen, aber mit demselben Superuser-Bedarf und einer weniger
-- aussagekraeftigen Fehlermeldung. Explizite, gefuehrte Behandlung stattdessen
-- (Guard: nur wenn vorhanden UND nur wenn Superuser -- analog Up-Datei
-- Punkt V2).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_audit_ddl') THEN
        IF current_setting('is_superuser') = 'on' THEN
            EXECUTE 'DROP EVENT TRIGGER trg_audit_ddl';
        ELSE
            RAISE WARNING 'audit: DROP EVENT TRIGGER trg_audit_ddl uebersprungen -- aktuelle Rolle ist kein Superuser. Das nachfolgende DROP SCHEMA audit CASCADE schlaegt in diesem Fall vermutlich ebenfalls fehl (Event-Trigger haengt noch an audit.melde_ddl()) -- zuerst als Superuser manuell: DROP EVENT TRIGGER trg_audit_ddl;';
        END IF;
    END IF;
END
$$;

-- =====================================================================
-- (2) Schema-CASCADE-Drop
-- =====================================================================
-- Entfernt Tabellen (inkl. Hypertable audit.event -- Timescale raeumt die
-- zugehoerigen _timescaledb_internal-Chunk-Tabellen beim Drop der Hypertable
-- automatisch mit auf, kein manuelles drop_chunks() noetig), Funktionen,
-- Trigger, Indizes, Katalog-Seed-Daten.
--
-- ACHTUNG (nur relevant, falls diese Migration NICHT auf einer frischen
-- Dev-/Test-Instanz zurueckgerollt wird): Greenfield-Migration ohne
-- Produktivdaten -> .claude/rules/database-migrations.md verlangt HIER
-- keinen gesonderten Backup-Nachweis. Sollte diese Migration wider Erwarten
-- bereits auf einer Instanz MIT echten (auch synthetischen Pilot-)Daten
-- angewendet worden sein, ist vor diesem Rollback ein Backup zu ziehen und
-- die User-Freigabe einzuholen (devops-lead-Abstimmung).
DROP SCHEMA audit CASCADE;

-- =====================================================================
-- (3) Rollen bewusst NICHT gedroppt (dokumentierter Teil-No-Op)
-- =====================================================================
-- Begruendung (Up-Datei-Kopf, Punkt V1, hier wiederholt fuer den Down-Pfad):
--   (a) Rollen sind CLUSTER-, nicht datenbankweit. Diese Migration kann aus
--       der aktuellen Datenbank heraus nicht sicher/deterministisch pruefen,
--       ob eine der vier Rollen in einer ANDEREN Datenbank desselben
--       Clusters noch Owner/Grantee ist -- DROP ROLE wuerde in diesem Fall
--       ohnehin fehlschlagen, aber abhaengig vom (hier nicht sichtbaren)
--       Cluster-Zustand, nicht deterministisch reproduzierbar.
--   (b) edms_app ist bewusst so benannt, dass es voraussichtlich zur
--       SCHEMAUEBERGREIFENDEN Runtime-Rolle des gesamten Backend-Service wird
--       (nicht nur audit) -- eine spaetere Migration (Grants auf
--       energy/identity/measurement, ADR-0002) wird sie vermutlich
--       weiterverwenden. Sie hier zu droppen waere ein versteckter Bruch
--       fuer noch nicht geschriebenen Code.
--   (c) Nach dem Schema-Drop (2) besitzen alle vier Rollen ohnehin keinerlei
--       Privilegien mehr auf konkrete Objekte dieses Features (Tabellen/
--       Funktionen sind weg) -- die verbleibenden Rollen-Huellen sind
--       inert/harmlos.
--
-- Wer diese Migration auf einer isolierten Dev-/Test-Instanz wirklich
-- vollstaendig zurueckrollen will (inkl. Rollen), tut das bewusst und manuell
-- ausserhalb des Runners -- NICHT ueber diese Datei:
--   DROP ROLE IF EXISTS edms_audit_publish;
--   DROP ROLE IF EXISTS edms_audit_betrieb;
--   DROP ROLE IF EXISTS edms_app;
--   DROP ROLE IF EXISTS edms_audit_owner;
-- (Reihenfolge unkritisch nach Schema-Drop, da keine Objekte mehr an ihnen
-- haengen; DROP ROLE schlaegt sonst mit "cannot be dropped because some
-- objects depend on it" fehl.)

-- =====================================================================
-- (4) Timeout-Konfiguration zuruecksetzen (Rolle bleibt bestehen)
-- =====================================================================
ALTER ROLE edms_app RESET lock_timeout;
ALTER ROLE edms_app RESET statement_timeout;
