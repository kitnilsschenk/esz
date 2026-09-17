-- V0040__audit_art19_code_richtigstellung.down.sql
--
-- Rollback: den richtig benannten Code entfernen und den mit V0038 falsch
-- benannten wiederherstellen.
--
-- HINWEIS: dieser Pfad stellt einen ANERKANNTEN Namensfehler wieder her. Er
-- existiert nur, damit der Migrationsstapel umkehrbar bleibt -- fachlich ist
-- er nie erwuenscht. Existieren bereits Ereignisse unter dem richtigen Code,
-- wird dessen Katalog-Eintrag NICHT geloescht (Append-only/FK-Schutz), und
-- der Rollback bleibt unvollstaendig; das ist beabsichtigt.

DO $$
DECLARE
    v_neu        text := 'einreichung.nachweis.art19_mitgeteilt';
    v_alt        text := 'nachweis.einreichung.art19_mitgeteilt';
    v_referenced boolean;
BEGIN
    -- Alten Code nur wiederherstellen, wenn er nicht (mehr) existiert.
    IF NOT EXISTS (SELECT 1 FROM audit.event_typ WHERE code = v_alt) THEN
        INSERT INTO audit.event_typ (code) VALUES (v_alt);
        INSERT INTO audit.event_typ_version
            (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
             rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
        VALUES
            (gen_random_uuid(), v_alt, 'einreichung', 'mitteilen',
             ARRAY['synthetic','kanal','anlass'], true, false, true,
             'Wiederhergestellter V0038-Stand (falsch benannter Code, vertauschte Segmente) -- siehe V0040.',
             now());
    END IF;

    SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_neu) INTO v_referenced;

    IF v_referenced THEN
        UPDATE audit.event_typ_version
           SET aktiv = false, gueltig_bis = now()
         WHERE code = v_neu AND gueltig_bis IS NULL;
        RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen geschlossen/deaktiviert.', v_neu;
    ELSE
        DELETE FROM audit.event_typ_version WHERE code = v_neu;
        DELETE FROM audit.event_typ WHERE code = v_neu;
    END IF;
END
$$;
