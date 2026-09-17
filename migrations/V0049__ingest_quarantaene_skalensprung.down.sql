-- Down zu V0049 (ADR-0011 O3 Punkt 3).
--
-- ACHTUNG, DATENVERLUST-RISIKO IST HIER UMGEKEHRT ALS SONST — wie schon bei
-- V0042: Der Rueckbau des CHECK schlaegt fehl, solange Zeilen mit
-- `grund = 'skalensprung_verdacht'` existieren; die alte Liste kennt den Wert
-- nicht. Das ist ABSICHT. Diese Zeilen sind Uplinks, bei denen der Verdacht
-- besteht, dass sich die Rechenvorschrift im fremden Codec geaendert hat.
-- Sie stillschweigend umzuetikettieren oder zu loeschen hiesse, einen
-- erkannten Nachweis-Mangel zu verwischen.
--
-- Wer wirklich zurueck muss, entscheidet vorher bewusst, was mit diesen
-- Zeilen geschieht, und dokumentiert es:
--
--   SELECT count(*) FROM ingest.eingang_quarantaene
--    WHERE grund = 'skalensprung_verdacht';
--
-- Erst danach dieses Skript. Kein `DELETE` hier — eine Down-Migration loescht
-- keine Betriebsbefunde (`.claude/rules/database-migrations.md`).

ALTER TABLE ingest.eingang_quarantaene
    DROP CONSTRAINT ck_quarantaene_grund;

ALTER TABLE ingest.eingang_quarantaene
    ADD CONSTRAINT ck_quarantaene_grund CHECK (grund IN (
        'envelope_parse_fehler', 'devEUI_unbekannt', 'unbekannter_geraetetyp',
        'decode_fehler', 'kanal_unbekannt', 'unplausibel_monotonie_verletzt',
        'einheit_inkonsistent', 'zeitstempel_fehlt',
        'herkunft_widerspruechlich'
    ));
