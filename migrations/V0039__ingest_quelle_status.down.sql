-- Rollback zu V0039 (ADR-0011 O8/D8).
--
-- Verlustfrei: Die Tabelle traegt ausschliesslich den AKTUELLEN
-- Betriebszustand der Worker-Prozesse (Upsert, kein Verlauf). Nach einem
-- Rollback schreiben die Worker sie beim naechsten Start neu -- es gehen
-- keine Mess-, Stamm- oder Nachweisdaten verloren.

DROP TRIGGER IF EXISTS trg_quelle_status_updated_at ON ingest.quelle_status;
DROP TABLE IF EXISTS ingest.quelle_status;
