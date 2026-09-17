-- V0007__seed_system_stillgelegt_event.down.sql
--
--
-- Rollt den Katalog-Seed aus V0007 zurueck. EXAKT dasselbe SCD2-sichere Muster
-- wie V0004/V0006 (dort begruendet): `audit.event_typ`/`event_typ_version`
-- stehen NICHT unter REVOKE UPDATE/DELETE; ein Hard-Delete ist zulaessig, darf
-- aber NIE Zeilen entfernen, auf die bereits echte `audit.event`-Zeilen per FK
-- verweisen. Ist der Code bereits referenziert (z. B. in einem Integrationstest
-- gegen eine laufende Instanz): KEIN Hard-Delete, stattdessen SCD2-Close
-- (aktiv=false, gueltig_bis=now()); der Header bleibt (FK-Ziel). Sonst
-- vollstaendiger Rueckbau (deterministischer up->down->up-Roundtrip).
DO $$
DECLARE
    v_code       text := 'system.stammdaten.stillgelegt';
    v_referenced boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_code) INTO v_referenced;

    IF v_referenced THEN
        UPDATE audit.event_typ_version
           SET aktiv = false, gueltig_bis = now()
         WHERE code = v_code AND gueltig_bis IS NULL;
        RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen deaktiviert/geschlossen (SCD2); Header-Zeile bleibt bestehen.', v_code;
    ELSE
        DELETE FROM audit.event_typ_version WHERE code = v_code;
        DELETE FROM audit.event_typ WHERE code = v_code;
    END IF;
END
$$;
