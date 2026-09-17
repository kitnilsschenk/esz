-- V0064__nachweis_export_schema_v2_geraeteerkennung.down.sql
--
-- Rueckbau auf Exportschema v1.
--
-- Der Rueckbau ist NUR zulaessig, solange noch kein Export unter Version 2
-- entstanden ist. Danach waere er zerstoerend: Die zugehoerigen
-- `nachweis.export_datei`-Zeilen der Kategorie `geraeteerkennung` verletzten
-- den zurueckgesetzten CHECK, und ein Export, dessen Dateien geloescht
-- werden muessten, um die Migration zurueckzunehmen, ist kein Rueckbau
-- mehr, sondern eine Vernichtung von Nachweismaterial.
--
-- Deshalb: laut, nicht still. Gibt es v2-Exporte, bricht der Rueckbau ab.
-- Dieselbe Linie wie V0063-Down.

DO $$
DECLARE
    v_dateien bigint;
    v_exporte bigint;
BEGIN
    SELECT count(*) INTO v_dateien
      FROM nachweis.export_datei WHERE kategorie = 'geraeteerkennung';

    SELECT count(*) INTO v_exporte
      FROM nachweis.export WHERE schema_code = 'nachweis_export_kanonisch' AND schema_version >= 2;

    IF v_dateien > 0 OR v_exporte > 0 THEN
        RAISE EXCEPTION 'nachweis: % Exportdatei(en) der Kategorie geraeteerkennung und % Export(e) unter Schema-Version >= 2 vorhanden -- der Rueckbau muesste Nachweismaterial loeschen. Migration abgebrochen; bewusster Rueckbau erfordert vorherige Klaerung mit compliance-director.', v_dateien, v_exporte;
    END IF;
END
$$;

-- =====================================================================
-- (1) Verfahrenskatalog: v2 entfernen, v1 wieder oeffnen
-- =====================================================================

DO $$
DECLARE
    v_code           text := 'nachweis_export_kanonisch';
    v_neu_id         uuid;
    v_neu_gueltig_ab timestamptz;
BEGIN
    SELECT id, gueltig_ab INTO v_neu_id, v_neu_gueltig_ab
      FROM analytics.verfahren_version
     WHERE code = v_code AND version = 2 AND gueltig_bis IS NULL;

    IF v_neu_id IS NULL THEN
        RAISE WARNING 'analytics: keine offene Version 2 fuer % gefunden -- V0064 vermutlich bereits zurueckgerollt; ueberspringe Katalog-Rueckbau.', v_code;
        RETURN;
    END IF;

    DELETE FROM analytics.verfahren_version WHERE id = v_neu_id;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = NULL
     WHERE code = v_code AND version = 1 AND gueltig_bis = v_neu_gueltig_ab;

    IF NOT FOUND THEN
        RAISE WARNING 'analytics: Version 1 von % mit gueltig_bis=% nicht gefunden -- Restauration uebersprungen (Katalog-Historie bitte manuell pruefen).', v_code, v_neu_gueltig_ab;
    END IF;
END
$$;

-- =====================================================================
-- (2) CHECKs auf den V0025-Stand zuruecksetzen
-- =====================================================================

ALTER TABLE nachweis.export_pseudonym
    DROP CONSTRAINT ck_export_pseudonym_entitaet_typ;

ALTER TABLE nachweis.export_pseudonym
    ADD CONSTRAINT ck_export_pseudonym_entitaet_typ CHECK (
        entitaet_typ IN ('endkunde', 'system', 'messkanal', 'station')
    );

ALTER TABLE nachweis.export_datei
    DROP CONSTRAINT ck_export_datei_kategorie,
    DROP CONSTRAINT ck_export_datei_kategorie_dateiname;

ALTER TABLE nachweis.export_datei
    ADD CONSTRAINT ck_export_datei_kategorie CHECK (
        kategorie IN ('rohdaten', 'baseline', 'einflussgroessen', 'einspardaten', 'meta')
    ),
    ADD CONSTRAINT ck_export_datei_kategorie_dateiname CHECK (
        (kategorie = 'rohdaten'         AND dateiname ~ '^rohdaten_messwert_tag\.(csv|xlsx)$')
     OR (kategorie = 'baseline'         AND dateiname ~ '^(baseline_lauf|baseline_klima_tag)\.(csv|xlsx)$')
     OR (kategorie = 'einflussgroessen' AND dateiname ~ '^einflussgroessen_intervall\.(csv|xlsx)$')
     OR (kategorie = 'einspardaten'     AND dateiname ~ '^(einspardaten_monat|einspardaten_jahr|einspardaten_differenz)\.(csv|xlsx)$')
     OR (kategorie = 'meta'             AND dateiname ~ '^(metablatt|manifest)\.(csv|xlsx)$')
    );
