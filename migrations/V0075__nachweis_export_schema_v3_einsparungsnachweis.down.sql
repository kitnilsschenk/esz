-- =====================================================================
-- V0075 (down) -- Exportschema v3 zurueckbauen
-- =====================================================================
--
-- Derselbe Schutz wie in V0064 (down): Ein Rueckbau, der bereits erzeugtes
-- Nachweismaterial unbrauchbar machte, wird ABGEBROCHEN statt still
-- durchgefuehrt. Ein Export unter Schema-Version 3 liesse sich danach nicht
-- mehr rendern und damit nicht mehr gegen seinen Hash verifizieren -- der
-- Nachweis waere entwertet, obwohl an ihm nichts falsch ist.

DO $$
DECLARE
    v_dateien bigint;
    v_exporte bigint;
BEGIN
    SELECT count(*) INTO v_dateien
      FROM nachweis.export_datei WHERE kategorie = 'einsparungsnachweis';

    SELECT count(*) INTO v_exporte
      FROM nachweis.export WHERE schema_code = 'nachweis_export_kanonisch' AND schema_version >= 3;

    IF v_dateien > 0 OR v_exporte > 0 THEN
        RAISE EXCEPTION 'nachweis: % Exportdatei(en) der Kategorie einsparungsnachweis und % Export(e) unter Schema-Version >= 3 vorhanden -- der Rueckbau muesste Nachweismaterial entwerten. Migration abgebrochen; bewusster Rueckbau erfordert vorherige Klaerung mit compliance-director.', v_dateien, v_exporte;
    END IF;
END
$$;

-- =====================================================================
-- (1) Verfahrenskatalog: v3 entfernen, v2 wieder oeffnen
-- =====================================================================

DO $$
DECLARE
    v_code           text := 'nachweis_export_kanonisch';
    v_neu_id         uuid;
    v_neu_gueltig_ab timestamptz;
BEGIN
    SELECT id, gueltig_ab INTO v_neu_id, v_neu_gueltig_ab
      FROM analytics.verfahren_version
     WHERE code = v_code AND version = 3 AND gueltig_bis IS NULL;

    IF v_neu_id IS NULL THEN
        RAISE WARNING 'analytics: keine offene Version 3 fuer % gefunden -- V0075 vermutlich bereits zurueckgerollt; ueberspringe Katalog-Rueckbau.', v_code;
        RETURN;
    END IF;

    DELETE FROM analytics.verfahren_version WHERE id = v_neu_id;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = NULL
     WHERE code = v_code AND version = 2 AND gueltig_bis = v_neu_gueltig_ab;

    IF NOT FOUND THEN
        RAISE WARNING 'analytics: Version 2 von % mit gueltig_bis=% nicht gefunden -- Restauration uebersprungen (Katalog-Historie bitte manuell pruefen).', v_code, v_neu_gueltig_ab;
    END IF;
END
$$;

-- =====================================================================
-- (2) Kategorie und Dateiname auf den v2-Stand zuruecksetzen
-- =====================================================================

ALTER TABLE nachweis.export_datei
    DROP CONSTRAINT ck_export_datei_kategorie,
    DROP CONSTRAINT ck_export_datei_kategorie_dateiname;

ALTER TABLE nachweis.export_datei
    ADD CONSTRAINT ck_export_datei_kategorie CHECK (
        kategorie IN ('rohdaten', 'baseline', 'einflussgroessen', 'einspardaten', 'geraeteerkennung', 'meta')
    ),
    ADD CONSTRAINT ck_export_datei_kategorie_dateiname CHECK (
        (kategorie = 'rohdaten'          AND dateiname ~ '^rohdaten_messwert_tag\.(csv|xlsx)$')
     OR (kategorie = 'baseline'          AND dateiname ~ '^(baseline_lauf|baseline_klima_tag)\.(csv|xlsx)$')
     OR (kategorie = 'einflussgroessen'  AND dateiname ~ '^einflussgroessen_intervall\.(csv|xlsx)$')
     OR (kategorie = 'einspardaten'      AND dateiname ~ '^(einspardaten_monat|einspardaten_jahr|einspardaten_differenz)\.(csv|xlsx)$')
     OR (kategorie = 'geraeteerkennung'  AND dateiname ~ '^(geraeteerkennung_quote|geraeteerkennung_gruppe)\.(csv|xlsx)$')
     OR (kategorie = 'meta'              AND dateiname ~ '^(metablatt|manifest)\.(csv|xlsx)$')
    );
