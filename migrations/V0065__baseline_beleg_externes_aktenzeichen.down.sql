-- V0065__baseline_beleg_externes_aktenzeichen.down.sql
--
-- Rueckbau des externen Baseline-Belegverweises.
--
-- Anders als bei V0063/V0064 KEINE Abbruch-Pruefung auf vorhandene Daten:
-- Aktenzeichen und Ablageort sind Verweise auf Unterlagen, die AUSSERHALB
-- des Systems liegen und liegen bleiben. Der Rueckbau verliert den Verweis,
-- nicht den Beleg — die Abrechnungen sind danach unveraendert dort, wo sie
-- vorher waren. Er ist damit aergerlich, aber nicht zerstoerend.
--
-- Die Zahl der Abrechnungen faellt mit weg; die TB-02-Begruendungspflicht ist
-- danach wieder nicht pruefbar. Das ist der Zustand vor V0065.

ALTER TABLE energy.messkonzept_version_energietraeger
    DROP CONSTRAINT IF EXISTS ck_mvet_baseline_begruendung_bei_wenigen_abrechnungen,
    DROP CONSTRAINT IF EXISTS ck_mvet_baseline_abrechnungen_anzahl;

ALTER TABLE energy.messkonzept_version_energietraeger
    DROP COLUMN IF EXISTS baseline_beleg_ablageort,
    DROP COLUMN IF EXISTS baseline_beleg_aktenzeichen,
    DROP COLUMN IF EXISTS baseline_abrechnungen_anzahl;

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.baseline_beleg_ref IS NULL;
