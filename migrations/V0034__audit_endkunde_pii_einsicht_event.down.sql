-- V0034__audit_endkunde_pii_einsicht_event.down.sql
--
-- Rueckbau des neuen Event-Typs `endkunde.pii.einsicht`.
-- Muster exakt wie V0009-Down Teil (B) (dort begruendet):
--
-- `audit.event.event_typ` traegt einen FREMDSCHLUESSEL auf
-- `audit.event_typ(code)` (V0003). Existiert bereits ein Ereignis unter diesem
-- Code, ist ein Hard-Delete weder erlaubt (FK) noch zulaessig (append-only) --
-- dann wird die Katalog-Version nur SCD2-konform geschlossen und deaktiviert,
-- der Header bleibt als FK-Ziel bestehen. Andernfalls (Normalfall: frische
-- Dev-/Test-/CI-Instanz, pre-go-live/synthetic-only) vollstaendiger Rueckbau.

DO $$
DECLARE
    v_code       text := 'endkunde.pii.einsicht';
    v_referenced boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_code) INTO v_referenced;

    IF v_referenced THEN
        UPDATE audit.event_typ_version
           SET aktiv = false,
               gueltig_bis = now()
         WHERE code = v_code
           AND gueltig_bis IS NULL;
        RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen deaktiviert/geschlossen (SCD2); Header-Zeile audit.event_typ bleibt bestehen, da Fremdschluessel bestehender Ereigniszeilen darauf verweisen.', v_code;
    ELSE
        DELETE FROM audit.event_typ_version WHERE code = v_code;
        DELETE FROM audit.event_typ WHERE code = v_code;
    END IF;
END
$$;
