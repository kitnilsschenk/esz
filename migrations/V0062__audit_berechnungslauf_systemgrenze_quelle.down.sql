-- V0062__audit_berechnungslauf_systemgrenze_quelle.down.sql
--
-- Rueckbau der SCD2-Erweiterung an `berechnungslauf.bereinigung.abgeschlossen`.
-- Muster exakt wie V0032-Down (dort ausfuehrlich begruendet), hier die
-- tragende Kurzfassung:
--
-- `audit.event` hat KEINEN Fremdschluessel auf `event_typ_version.id` (nur auf
-- `event_typ.code`, V0003). "Referenziert" heisst hier daher nicht
-- FK-Verletzung, sondern ZEITLICHE ZUGEHOERIGKEIT: eine Ereigniszeile mit
-- diesem Code und `ts >= gueltig_ab` der neuen Version wurde unter DEREN
-- Whitelist gesiegelt. Ein Hard-Delete machte die nachtraegliche Frage "welche
-- Whitelist galt fuer dieses Ereignis?" unbeantwortbar. Deshalb:
--
--   - KEINE solche Ereigniszeile (Normalfall: frische Dev-/Test-/CI-Instanz):
--     vollstaendiger Rueckbau, Vorgaenger-Zeile wird auf `gueltig_bis = NULL`
--     restauriert. Deterministischer Up/Down-Roundtrip.
--   - MINDESTENS EINE solche Zeile: KEIN Hard-Delete -- die neue Version wird
--     nur SCD2-konform geschlossen und bleibt historisch bestehen. Folge:
--     `systemgrenze_quelle` ist danach nicht mehr schreibbar, und Laeufe
--     scheitern fail-closed, bis der Service-Code mit zurueckgenommen ist.
--     Das ist beabsichtigt: ein Katalog-Rueckbau unter laufender Emission
--     verlangt einen database-lead-/compliance-director-Review, keinen
--     stillen SQL-Rueckbau.

DO $$
DECLARE
    v_code           text := 'berechnungslauf.bereinigung.abgeschlossen';
    v_new_id         uuid;
    v_new_gueltig_ab timestamptz;
    v_referenced     boolean;
BEGIN
    SELECT id, gueltig_ab INTO v_new_id, v_new_gueltig_ab
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_new_id IS NULL THEN
        RAISE WARNING 'audit: keine offene (gueltig_bis IS NULL) Version fuer % gefunden -- V0062 vermutlich bereits zurueckgerollt oder Katalog seither veraendert; ueberspringe.', v_code;
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
        RAISE WARNING 'audit: Version % (id=%, gueltig_ab=%) wird bereits von audit.event referenziert -- KEIN Hard-Delete, KEINE Restauration der Vorgaenger-Version. Version SCD2-konform geschlossen; Ruecksetzung auf den V0021-Stand erfordert manuellen Review.', v_code, v_new_id, v_new_gueltig_ab;
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
