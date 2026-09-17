-- Down zu V0044 (ADR-0012 A1).
--
-- REIHENFOLGE: erst der Beleg im identity-Namensraum, dann das
-- consent-Schema. Umgekehrt bliebe der Beleg als Waise stehen, dessen
-- logischer Verweis (`einwilligung_id`, kein FK) ins Leere zeigt -- und
-- niemand saehe ihm an, worauf er sich einmal bezog.
--
-- ACHTUNG, DATENVERLUST: Dieses Skript entfernt NACHWEISE nach Art. 7 Abs. 1
-- DSGVO. Wer eine erteilte Einwilligung geloescht hat, kann sie nicht mehr
-- belegen -- und nicht belegbare Einwilligung ist im Streitfall keine.
--
-- Vor dem Rueckbau ist deshalb zu pruefen, ob ueberhaupt schon eingewilligt
-- wurde, und das Ergebnis zu dokumentieren:
--
--   SELECT count(*) FILTER (WHERE widerrufen_at IS NULL) AS wirksam,
--          count(*)                                      AS gesamt
--     FROM consent.einwilligung;
--   SELECT count(*) FROM identity.einwilligung_beleg;
--
-- Sind die Zahlen groesser null, ist der Rueckbau eine Entscheidung mit
-- Rechtsfolge und braucht die Freigabe des `compliance-director` -- kein
-- Migrationsschritt, den man nebenbei ausfuehrt.
--
-- Das Skript erzwingt das NICHT technisch (eine Down-Migration, die sich
-- selbst blockiert, ist keine). Es sagt es.

DROP TABLE IF EXISTS identity.einwilligung_beleg;

-- Reihenfolge innerhalb von consent: Einwilligung zuerst (verweist auf
-- text_version und zweck), dann die Fassungen, dann der Katalog.
DROP TABLE IF EXISTS consent.einwilligung;
DROP TABLE IF EXISTS consent.text_version;
DROP TABLE IF EXISTS consent.zweck;

DROP FUNCTION IF EXISTS consent.set_updated_at();

DROP SCHEMA IF EXISTS consent;
