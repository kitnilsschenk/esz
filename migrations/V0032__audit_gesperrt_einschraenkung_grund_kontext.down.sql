-- V0032__audit_gesperrt_einschraenkung_grund_kontext.down.sql
--
-- Rueckbau der SCD2-Erweiterung an `endkunde.stammdaten.gesperrt`. Muster
-- exakt wie V0009-Down Teil (A) -- dort ausfuehrlich begruendet, hier nur die
-- tragende Kurzfassung:
--
-- `audit.event` hat KEINEN Fremdschluessel auf `event_typ_version.id` (nur auf
-- `event_typ.code`, V0003). "Referenziert" heisst hier daher NICHT
-- FK-Verletzung, sondern ZEITLICHE ZUGEHOERIGKEIT: eine `audit.event`-Zeile
-- mit `event_typ='endkunde.stammdaten.gesperrt' AND ts >= <gueltig_ab der
-- neuen Version>` wurde unter der Kontext-Whitelist DIESER Version gesiegelt.
-- Ein Hard-Delete der Version wuerde die nachtraegliche Frage "welche
-- Whitelist galt fuer dieses Ereignis?" unbeantwortbar machen -- ohne die
-- (append-only, unveraenderlichen) Ereigniszeilen selbst anzutasten. Genau
-- deshalb wird hier NICHT bedingungslos geloescht:
--
--   - KEINE solche Ereigniszeile (Normalfall: frische Dev-/Test-/CI-Instanz,
--     weiterhin pre-go-live/synthetic-only): vollstaendiger Rueckbau -- neue
--     Version geloescht, Vorgaenger-Zeile auf `gueltig_bis = NULL`
--     restauriert. Deterministischer Up/Down-Roundtrip; die
--     EXCLUDE-Constraint erlaubt das wieder, weil die neue Version dann nicht
--     mehr existiert (keine Range-Ueberlappung).
--   - MINDESTENS EINE solche Ereigniszeile: KEIN Hard-Delete, KEINE
--     Restauration der Vorgaenger-Zeile -- stattdessen wird die neue Version
--     nur SCD2-konform geschlossen (`gueltig_bis := now()`) und bleibt als
--     historische Zeile bestehen. Folge: der Code kann nicht mehr unter der
--     erweiterten Whitelist versiegelt werden; das Wiederherstellen des
--     V0006-Stands ist ABSICHTLICH nicht automatisiert (setzt einen
--     database-lead-/compliance-director-Review voraus, kein reiner
--     SQL-Rueckbau).

DO $$
DECLARE
    v_code           text := 'endkunde.stammdaten.gesperrt';
    v_new_id         uuid;
    v_new_gueltig_ab timestamptz;
    v_referenced     boolean;
BEGIN
    -- Die von V0032 (Up) eingefuegte Version ist -- solange kein weiterer,
    -- spaeterer Katalog-Umbau fuer diesen Code stattfand -- die einzige Zeile
    -- mit `gueltig_bis IS NULL` (die EXCLUDE-Constraint erlaubt je Code
    -- hoechstens EINE offen-endende Range, V0003). ORDER BY + LIMIT 1 als
    -- Absicherung, falls dennoch mehrere offene Zeilen existieren -- nimmt
    -- dann die juengste.
    SELECT id, gueltig_ab INTO v_new_id, v_new_gueltig_ab
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_new_id IS NULL THEN
        RAISE WARNING 'audit: keine offene (gueltig_bis IS NULL) Version fuer % gefunden -- V0032 vermutlich bereits anderweitig zurueckgerollt oder Katalog seither veraendert; ueberspringe.', v_code;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM audit.event
         WHERE event_typ = v_code AND ts >= v_new_gueltig_ab
    ) INTO v_referenced;

    IF v_referenced THEN
        UPDATE audit.event_typ_version
           SET gueltig_bis = now()
         WHERE id = v_new_id;
        RAISE WARNING 'audit: Version % (id=%, gueltig_ab=%) von % wird bereits von audit.event referenziert -- KEIN Hard-Delete, KEINE Restauration der Vorgaenger-Version (Append-only-/Historien-Schutz gewahrt). Version stattdessen SCD2-konform geschlossen; Ruecksetzung auf den V0006-Stand erfordert manuellen Compliance-/database-lead-Review.', v_code, v_new_id, v_new_gueltig_ab;
    ELSE
        DELETE FROM audit.event_typ_version WHERE id = v_new_id;
        UPDATE audit.event_typ_version
           SET gueltig_bis = NULL
         WHERE code = v_code AND gueltig_bis = v_new_gueltig_ab;
        IF NOT FOUND THEN
            RAISE WARNING 'audit: keine Vorgaenger-Version von % mit gueltig_bis=% gefunden -- Restauration uebersprungen (unerwarteter Zustand, Katalog-Historie bitte manuell pruefen).', v_code, v_new_gueltig_ab;
        END IF;
    END IF;
END
$$;
