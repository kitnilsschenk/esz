-- =====================================================================
-- V0070 (down) -- taggenaue Foerderjahr-Grenzen zuruecknehmen
-- =====================================================================
--
-- ACHTUNG, DATENVERLUST MIT ANSAGE: Ein Foerderjahr, das NICHT am
-- Monatsersten beginnt oder endet, verliert dabei seine taggenaue Grenze und
-- faellt auf das Monatsfenster zurueck. Die Monatsfelder bleiben erhalten und
-- sind nach diesem Rollback wieder die einzige Wahrheit -- der
-- Nachweiszeitraum eines Bewilligungszeitraum-Foerderjahres ist danach um bis
-- zu einen Monat weiter als der beschiedene.
--
-- Bindungen, die auf angeschnittene Scheiben verweisen, bleiben bestehen;
-- ihre Zeitraeume sind nach dem Rollback nicht mehr aus dem Foerderjahr
-- ableitbar. Vor einem Rollback in einem Bestand mit taggenauen
-- Foerderjahren: Einsparlaeufe pruefen.

ALTER TABLE nachweis.foerderjahr
    DROP CONSTRAINT IF EXISTS ck_foerderjahr_bis_monat_folgt_bis_tag,
    DROP CONSTRAINT IF EXISTS ck_foerderjahr_von_monat_folgt_von_tag,
    DROP CONSTRAINT IF EXISTS ck_foerderjahr_tage_reihenfolge;

ALTER TABLE nachweis.foerderjahr
    DROP COLUMN IF EXISTS bis_tag,
    DROP COLUMN IF EXISTS von_tag;
