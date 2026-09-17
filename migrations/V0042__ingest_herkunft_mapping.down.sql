-- Down zu V0042 (ADR-0011 B2/D3 + D4).
--
-- REIHENFOLGE: erst der Quarantaenegrund zurueck, dann die Tabelle. Umgekehrt
-- ginge es auch, aber der CHECK-Rueckbau kann FEHLSCHLAGEN (s. u.) -- und
-- dann soll die Tabelle noch stehen, damit der Zustand nachvollziehbar
-- bleibt statt halb abgeraeumt.
--
-- ACHTUNG, DATENVERLUST-RISIKO IST HIER UMGEKEHRT ALS SONST: Der Rueckbau des
-- CHECK schlaegt fehl, solange Zeilen mit `grund = 'herkunft_widerspruechlich'`
-- existieren -- die alte Liste kennt den Wert nicht. Das ist ABSICHT: Diese
-- Zeilen sind Uplinks, die wegen eines Herkunfts-Widerspruchs NICHT
-- eingespeist wurden. Sie stillschweigend umzuetikettieren oder zu loeschen
-- hiesse, einen erkannten Fehlzuordnungs-Verdacht zu verwischen.
--
-- Wer wirklich zurueck muss, entscheidet vorher bewusst, was mit diesen
-- Zeilen geschieht, und dokumentiert es:
--
--   SELECT count(*) FROM ingest.eingang_quarantaene
--    WHERE grund = 'herkunft_widerspruechlich';
--
-- Erst danach dieses Skript. Kein `DELETE` hier -- eine Down-Migration loescht
-- keine Betriebsbefunde (`.claude/rules/database-migrations.md`).

ALTER TABLE ingest.eingang_quarantaene
    DROP CONSTRAINT ck_quarantaene_grund;

ALTER TABLE ingest.eingang_quarantaene
    ADD CONSTRAINT ck_quarantaene_grund CHECK (grund IN (
        'envelope_parse_fehler', 'devEUI_unbekannt', 'unbekannter_geraetetyp',
        'decode_fehler', 'kanal_unbekannt', 'unplausibel_monotonie_verletzt',
        'einheit_inkonsistent', 'zeitstempel_fehlt'
    ));

-- Spaltenscharfer Grant aus dem Up-Teil (RL-1) zurueck.
REVOKE SELECT (id, endkunde_id) ON energy.system FROM edms_ingest_worker;

-- Index und Trigger fallen mit der Tabelle.
DROP TABLE ingest.herkunft_mapping;
