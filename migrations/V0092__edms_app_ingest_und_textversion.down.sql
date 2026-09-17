-- Down zu V0092.
--
-- Nimmt die in V0092 ergaenzten Rechte zurueck.
--
-- ACHTUNG: Mit der Schema-USAGE auf `ingest` werden auch die aus
-- V0039/V0041/V0059/V0085 stammenden Tabellenrechte wieder unausuebbar —
-- genau wie vor V0092. Der Zustand ist unsinnig, aber er ist der
-- dokumentierte Vorzustand; eine Down-Migration stellt ihn her, statt ihn zu
-- verbessern.
--
-- Die Betriebssicht auf die Messdaten-Aufnahme
-- (`/monitoring/ingest-betrieb`) faellt danach aus, sobald die Anwendung
-- unter `edms_app` laeuft, und das Veroeffentlichen einer neuen
-- Einwilligungs-Textfassung schlaegt fehl (das Schliessen der Vorgaenger-
-- Fassung braucht das spaltenscharfe UPDATE).

REVOKE UPDATE (gueltig_bis) ON consent.text_version FROM edms_app;

REVOKE SELECT ON ingest.kanal_status    FROM edms_app;
REVOKE SELECT ON ingest.quelle_status   FROM edms_app;
REVOKE SELECT ON ingest.ausfall_vorgang FROM edms_app;

REVOKE USAGE ON SCHEMA ingest FROM edms_app;
