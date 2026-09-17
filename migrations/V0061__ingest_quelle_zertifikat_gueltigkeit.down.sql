-- Down zu V0061.
--
-- Verlustfrei im eigentlichen Sinn: Die Ablaufdaten sind aus den weiterhin
-- gespeicherten Zertifikaten jederzeit wieder ableitbar (sie stehen im PEM).
-- Was verloren geht, ist die Sichtbarkeit — nach einem Down-Lauf warnt
-- niemand mehr vor einem ablaufenden Zertifikat.

BEGIN;

DROP INDEX IF EXISTS ingest.ix_quelle_client_zertifikat_ablauf;

ALTER TABLE ingest.quelle
    DROP CONSTRAINT IF EXISTS ck_quelle_ca_gueltigkeit_braucht_zertifikat,
    DROP CONSTRAINT IF EXISTS ck_quelle_client_gueltigkeit_braucht_zertifikat;

ALTER TABLE ingest.quelle
    DROP COLUMN IF EXISTS ca_zertifikat_gueltig_bis,
    DROP COLUMN IF EXISTS client_zertifikat_gueltig_bis;

COMMIT;
