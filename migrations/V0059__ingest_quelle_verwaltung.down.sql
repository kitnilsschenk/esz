-- Down zu V0059.
--
-- Die Reihenfolge ist zwingend: `ingest.quelle` haelt den Fremdschluessel auf
-- die Schluesselablage, sie muss zuerst weichen.
--
-- Mit den Tabellen verschwinden auch die gewrappten DEKs — die hinterlegten
-- Zugangsdaten und Zertifikate sind danach nicht wiederherstellbar, auch
-- nicht aus einem Backup der Chiffrate allein. Das ist beabsichtigt
-- (Krypto-Shred) und der Grund, warum ein Down-Lauf hier KEINE Formsache ist:
-- Wer ihn faehrt, muss die Zugangsdaten der betroffenen Quellen erneut
-- beschaffen.

BEGIN;

DROP TRIGGER IF EXISTS trg_quelle_updated_at ON ingest.quelle;
DROP TABLE IF EXISTS ingest.quelle;
DROP TABLE IF EXISTS ingest.quelle_schluessel;

COMMIT;
