-- =====================================================================
-- V0077 (down) -- Exportschema v4 zurueckbauen
-- =====================================================================
--
-- Derselbe Schutz wie in V0064/V0075 (down): Ein Rueckbau, der bereits
-- erzeugtes Nachweismaterial unbrauchbar machte, wird ABGEBROCHEN statt still
-- durchgefuehrt. Ein Export unter Schema-Version 4 liesse sich danach nicht
-- mehr rendern und damit nicht mehr gegen seinen Hash verifizieren.

DO $$
DECLARE
    v_exporte bigint;
BEGIN
    SELECT count(*) INTO v_exporte
      FROM nachweis.export WHERE schema_code = 'nachweis_export_kanonisch' AND schema_version >= 4;

    IF v_exporte > 0 THEN
        RAISE EXCEPTION 'nachweis: % Export(e) unter Schema-Version >= 4 vorhanden -- der Rueckbau muesste Nachweismaterial entwerten. Migration abgebrochen; bewusster Rueckbau erfordert vorherige Klaerung mit compliance-director.', v_exporte;
    END IF;
END
$$;

-- =====================================================================
-- Verfahrenskatalog: v4 entfernen, v3 wieder oeffnen
-- =====================================================================

DO $$
DECLARE
    v_code           text := 'nachweis_export_kanonisch';
    v_neu_id         uuid;
    v_neu_gueltig_ab timestamptz;
BEGIN
    SELECT id, gueltig_ab INTO v_neu_id, v_neu_gueltig_ab
      FROM analytics.verfahren_version
     WHERE code = v_code AND version = 4 AND gueltig_bis IS NULL;

    IF v_neu_id IS NULL THEN
        RAISE WARNING 'analytics: keine offene Version 4 fuer % gefunden -- V0077 vermutlich bereits zurueckgerollt; ueberspringe Katalog-Rueckbau.', v_code;
        RETURN;
    END IF;

    DELETE FROM analytics.verfahren_version WHERE id = v_neu_id;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = NULL
     WHERE code = v_code AND version = 3 AND gueltig_bis = v_neu_gueltig_ab;

    IF NOT FOUND THEN
        RAISE WARNING 'analytics: Version 3 von % mit gueltig_bis=% nicht gefunden -- Restauration uebersprungen (Katalog-Historie bitte manuell pruefen).', v_code, v_neu_gueltig_ab;
    END IF;
END
$$;
