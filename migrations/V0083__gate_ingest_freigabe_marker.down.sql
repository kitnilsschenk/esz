-- V0083__gate_ingest_freigabe_marker.down.sql
--
-- Rueckbau in umgekehrter Reihenfolge der Anlage.
--
-- ACHTUNG, was dieser Rueckbau bedeutet: Mit der Tabelle verschwinden auch
-- alle bereits abgegebenen ERKLAERUNGEN. Die zugehoerigen Audit-Ereignisse
-- bleiben — sie liegen in `audit.event` und sind dort weder loeschbar noch
-- aenderbar. Der Nachweis, WER WANN WAS erklaert hat, ueberlebt den Rueckbau
-- also; verloren geht nur der abfragbare Zustand.
--
-- In einer Installation, die je eine Freigabe erteilt hat, sollte dieser
-- Rueckbau deshalb nicht beilaeufig laufen. Er ist fuer den Fall gedacht,
-- dass die Migration in einer frischen Umgebung zurueckgenommen wird.

-- (5)+(4) Funktion und ihre Grants.
REVOKE EXECUTE ON FUNCTION audit.append_ingest_freigabe_event(uuid, text, text, text, text)
    FROM edms_ingest_freigabe;
DROP FUNCTION IF EXISTS audit.append_ingest_freigabe_event(uuid, text, text, text, text);

-- Katalog-Eintrag. Die Version zuerst (Fremdschluessel auf den Code).
DELETE FROM audit.event_typ_version WHERE code = 'gate.ingest_freigabe.erklaert';
DELETE FROM audit.event_typ         WHERE code = 'gate.ingest_freigabe.erklaert';

-- (3)+(2) Sicht und Tabelle. Die Grants verschwinden mit den Objekten.
DROP VIEW  IF EXISTS gate.ingest_freigabe_stand;
DROP TABLE IF EXISTS gate.ingest_freigabe;

-- (1) Schema. Die Rolle bleibt: Rollen sind cluster-global, koennten von
-- einer anderen Datenbank desselben Clusters gehalten werden, und ein
-- Rueckbau, der fremde Datenbanken beschaedigt, waere schlimmer als eine
-- uebrig gebliebene NOLOGIN-Rolle ohne jedes Recht. Dasselbe Muster wie in
-- V0003/V0019/V0025.
REVOKE USAGE ON SCHEMA gate FROM edms_app;
REVOKE USAGE ON SCHEMA gate FROM edms_ingest_freigabe;
DROP SCHEMA IF EXISTS gate;
