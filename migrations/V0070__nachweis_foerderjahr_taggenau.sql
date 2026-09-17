-- =====================================================================
-- V0070 -- Das Foerderjahr bekommt taggenaue Grenzen
-- =====================================================================
--
-- WARUM
-- -----
-- `nachweis.foerderjahr` kannte bisher nur `von_monat`/`bis_monat`. Damit
-- liess sich ein Foerderjahr, das nicht am Monatsersten beginnt, nicht
-- abbilden -- und genau das ist der Regelfall, sobald das Foerderjahr aus
-- dem Bewilligungsbescheid stammt statt aus dem Kalender
-- (`definition_quelle = 'bewilligungszeitraum'`).
--
-- Das Technische Merkblatt v2.2 verlangt in Kap. 9.1 woertlich, Einsparungen
-- „zeitanteilig zu ermitteln, soweit der fuer die Berechnung der Einsparung
-- relevante Zeitraum kleiner ist als das Foerderjahr". Ein Raster, das nur
-- ganze Kalendermonate kennt, kann dem nicht folgen: Ein Bewilligungszeitraum
-- vom 12.10. bis 11.10. laesst sich nur auf Monatsgrenzen runden, und das
-- verschiebt den Nachweiszeitraum um Wochen.
--
-- Der praktische Anlass war ein Bestandsimport (Liegenschaft mit
-- Foerderjahren 12.10.-11.10.): Die Kette lief bis zum Export durch, aber
-- jedes Foerderjahr war um elf Tage verschoben.
--
-- DER GETEILTE MONAT IST DER KERN DER SACHE
-- -----------------------------------------
-- Zwei aufeinanderfolgende Foerderjahre TEILEN SICH einen Kalendermonat: Das
-- eine endet am 11.10., das naechste beginnt am 12.10. Ein Monat gehoert
-- damit zu ZWEI Foerderjahren -- mit verschiedenen Tagen. Solange nur
-- Monatsgrenzen existierten, war dieser Fall nicht ausdrueckbar; die Bindung
-- suchte je Monatserstem GENAU EINEN Berechnungslauf und fand fuer den
-- geteilten Oktober den des VORJAHRES.
--
-- Mit `von_tag`/`bis_tag` bekommt jede Bindung die Scheibe, die sie meint --
-- und der Oktober kann in beiden Foerderjahren vorkommen, ohne dass ein Tag
-- doppelt zaehlt.
--
-- WARUM DIE MONATSFELDER BLEIBEN
-- ------------------------------
-- `von_monat`/`bis_monat` werden NICHT geloescht: Sie sind das Etikett, unter
-- dem ein Foerderjahr in Listen und Exporten erscheint, und sie sind
-- Bestandteil bestehender Abfragen. Sie werden aber zur ABLEITUNG degradiert
-- -- zwei CHECKs binden sie an die taggenauen Grenzen, damit sie keine
-- zweite, abweichende Wahrheit werden koennen.
--
-- `bis_tag` ist EXKLUSIV (halboffenes Intervall), wie `periode_bis` in
-- `analytics.berechnungslauf`. `bis_monat` bleibt INKLUSIV, wie bisher. Die
-- beiden Felder heissen aehnlich und meinen Verschiedenes -- der CHECK unten
-- schreibt den Zusammenhang fest, statt ihn der Erinnerung zu ueberlassen.
--
-- BACKFILL
-- --------
-- Bestehende Zeilen bekommen genau das Fenster, das sie bisher bedeuteten:
-- vom Ersten des `von_monat` bis zum Ersten des Monats NACH `bis_monat`.
-- Fuer sie aendert sich damit nichts.
--
-- Review-Bedarf: `database-lead` (Constraints), `bafa-export-engineer`
-- (Kap.-9.1-Bezug), `technical-director` (ADR-0007-Wirkung).

ALTER TABLE nachweis.foerderjahr
    ADD COLUMN von_tag date,
    ADD COLUMN bis_tag date;

COMMENT ON COLUMN nachweis.foerderjahr.von_tag IS
    'Erster Tag des Foerderjahres (inklusiv). Bei definition_quelle=bewilligungszeitraum der Tag aus dem Bescheid.';
COMMENT ON COLUMN nachweis.foerderjahr.bis_tag IS
    'Erster Tag NACH dem Foerderjahr (EXKLUSIV) -- wie analytics.berechnungslauf.periode_bis.';

UPDATE nachweis.foerderjahr
   SET von_tag = von_monat,
       bis_tag = (bis_monat + interval '1 month')::date
 WHERE von_tag IS NULL;

ALTER TABLE nachweis.foerderjahr
    ALTER COLUMN von_tag SET NOT NULL,
    ALTER COLUMN bis_tag SET NOT NULL;

ALTER TABLE nachweis.foerderjahr
    ADD CONSTRAINT ck_foerderjahr_tage_reihenfolge
        CHECK (von_tag < bis_tag);

-- Die Monatsfelder sind ab jetzt die Monate der taggenauen Grenzen, nicht
-- mehr eine unabhaengige Angabe. `bis_tag - 1` ist der LETZTE enthaltene Tag
-- (bis_tag ist exklusiv), sein Monat ist `bis_monat`.
ALTER TABLE nachweis.foerderjahr
    ADD CONSTRAINT ck_foerderjahr_von_monat_folgt_von_tag
        CHECK (von_monat = date_trunc('month', von_tag)::date),
    ADD CONSTRAINT ck_foerderjahr_bis_monat_folgt_bis_tag
        CHECK (bis_monat = date_trunc('month', bis_tag - 1)::date);
