-- =====================================================================
-- V0076 (down) -- Standard-Messkonzept zurueckbauen
-- =====================================================================
--
-- Derselbe Schutz wie in V0064/V0075 (down): Ein Rueckbau, der bereits
-- erzeugtes Nachweismaterial entwertet, wird ABGEBROCHEN statt still
-- durchgefuehrt.
--
-- Hier ist der Schaden ein anderer als bei den Export-Migrationen: Ein Lauf
-- mit `messkonzept_typ <> 'vereinfacht'` hat seine Koeffizienten ANGEPASST.
-- Faellt die Spalte weg, sieht der Lauf hinterher aus wie ein vereinfachter --
-- mit einem Grundlast-Anteil, den nie jemand als Parameter gesetzt hat, und
-- ohne die Guete, die seine einzige Rechtfertigung war. Die Zahlen blieben
-- stehen, ihre Herkunft waere geloescht.

DO $$
DECLARE
    v_laeufe bigint;
    v_v2     bigint;
BEGIN
    SELECT count(*) INTO v_laeufe
      FROM analytics.berechnungslauf WHERE messkonzept_typ <> 'vereinfacht';

    SELECT count(*) INTO v_v2
      FROM analytics.berechnungslauf
     WHERE verfahren_code = 'witterung_gtz_vdi3807' AND verfahren_version >= 2;

    IF v_laeufe > 0 OR v_v2 > 0 THEN
        RAISE EXCEPTION 'analytics: % Lauf/Laeufe mit angepasster Baseline (messkonzept_typ <> vereinfacht) und % Lauf/Laeufe unter witterung_gtz_vdi3807 >= v2 vorhanden -- der Rueckbau wuerde ihre Herkunft loeschen und die Zahlen als vereinfacht gerechnet erscheinen lassen. Migration abgebrochen; bewusster Rueckbau erfordert vorherige Klaerung mit compliance-director.', v_laeufe, v_v2;
    END IF;
END
$$;

-- =====================================================================
-- (1) Verfahrenskatalog: v2 entfernen, v1 wieder oeffnen
-- =====================================================================

DO $$
DECLARE
    v_code           text := 'witterung_gtz_vdi3807';
    v_neu_id         uuid;
    v_neu_gueltig_ab timestamptz;
BEGIN
    SELECT id, gueltig_ab INTO v_neu_id, v_neu_gueltig_ab
      FROM analytics.verfahren_version
     WHERE code = v_code AND version = 2 AND gueltig_bis IS NULL;

    IF v_neu_id IS NULL THEN
        RAISE WARNING 'analytics: keine offene Version 2 fuer % gefunden -- V0076 vermutlich bereits zurueckgerollt; ueberspringe Katalog-Rueckbau.', v_code;
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
-- (2) Spalten entfernen
-- =====================================================================

ALTER TABLE analytics.berechnungslauf
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_messkonzept_typ,
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_guete_vollstaendig,
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_guete_nur_bei_anpassung,
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_guete_r2_obergrenze,
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_guete_cv_rmse,
    DROP CONSTRAINT IF EXISTS ck_berechnungslauf_guete_punkte;

ALTER TABLE analytics.berechnungslauf
    DROP COLUMN IF EXISTS messkonzept_typ,
    DROP COLUMN IF EXISTS guete_r2,
    DROP COLUMN IF EXISTS guete_cv_rmse_pct,
    DROP COLUMN IF EXISTS guete_nmbe_pct,
    DROP COLUMN IF EXISTS guete_punkte,
    DROP COLUMN IF EXISTS baseline_abweichung_pct;
