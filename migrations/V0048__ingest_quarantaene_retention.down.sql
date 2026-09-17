-- Down zu V0048 (Votum 2026-09-05, Punkt 3).
--
-- Der Rueckbau nimmt der Retention-Rolle die Rechte und schliesst bzw.
-- entfernt den Ereignistyp. Er stellt damit den Zustand wieder her, in dem
-- `ingest.eingang_quarantaene` unbegrenzt waechst — die harte Gate-Auflage
-- aus DSFA-0001 Element 12 a) waere danach wieder offen.
--
-- BEREITS GELOESCHTE ZEILEN KOMMEN NICHT ZURUECK. Das ist kein Mangel
-- dieses Skripts, sondern die Natur der Sache: Eine Loeschung, die sich
-- zuruecknehmen liesse, waere keine.

REVOKE DELETE                     ON ingest.eingang_quarantaene FROM edms_retention;
REVOKE UPDATE (deveui_blind_index) ON ingest.eingang_quarantaene FROM edms_retention;
REVOKE SELECT                     ON ingest.eingang_quarantaene FROM edms_retention;
REVOKE SELECT                     ON ingest.ausfall_vorgang     FROM edms_retention;

-- `USAGE` auf dem Schema bleibt: `edms_retention` hat seit V0044 auch Rechte
-- auf `identity.einwilligung_beleg`; ein Entzug hier wuerde einen anderen
-- Pfad beschaedigen, der mit dieser Migration nichts zu tun hat.

DO $$
DECLARE
    v_code       text := 'ingest.quarantaene.retention_lauf';
    v_referenced boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_code) INTO v_referenced;

    IF v_referenced THEN
        UPDATE audit.event_typ_version
           SET aktiv = false,
               gueltig_bis = now()
         WHERE code = v_code
           AND gueltig_bis IS NULL;
        RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen deaktiviert/geschlossen (SCD2).', v_code;
    ELSE
        DELETE FROM audit.event_typ_version WHERE code = v_code;
        DELETE FROM audit.event_typ WHERE code = v_code;
    END IF;
END
$$;
