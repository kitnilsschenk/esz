-- Rollback zu V0041 (ADR-0011 D8/D1).
--
-- NICHT verlustfrei: Die Herkunfts-Angaben liegengebliebener Uplinks gehen
-- dabei verloren. Das ist vertretbar, weil sie reine Diagnose sind -- sie
-- helfen beim Zuordnen eines unbekannten Geraets, tragen aber weder Mess-
-- noch Nachweisdaten. Die Quarantaene-Zeilen selbst bleiben vollstaendig
-- erhalten; nur die drei Spalten entfallen.

DROP INDEX IF EXISTS ingest.ix_quarantaene_quelle_empfangen;

ALTER TABLE ingest.eingang_quarantaene
    DROP CONSTRAINT IF EXISTS ck_quarantaene_quelle_code_form;

ALTER TABLE ingest.eingang_quarantaene
    DROP COLUMN IF EXISTS chirpstack_application_id,
    DROP COLUMN IF EXISTS chirpstack_tenant_id,
    DROP COLUMN IF EXISTS quelle_code;
