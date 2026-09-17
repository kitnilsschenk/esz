-- =====================================================================
-- V0072 -- Audit-Ereignis fuer die Systemgrenzen-Zuordnung
-- =====================================================================
--
-- WARUM
-- -----
-- `energy.messkonzept_version_energietraeger_system` legt fest, WELCHE
-- Systeme (und damit welche Zaehler) in die Systemgrenze eines
-- Messkonzept-Energietraegers fallen. Bis heute gab es dafuer weder ein
-- Repository noch eine API noch eine Oberflaeche -- die Zuordnung entstand
-- ausschliesslich per SQL in Testfixtures, im Demo-Generator und in
-- Aufbau-Skripten.
--
-- Das ist folgenreicher, als der Tabellenname vermuten laesst: FEHLT die
-- Zuordnung, faellt der Berechnungslauf auf `endkunde_fallback` zurueck und
-- nimmt ALLE aktiven Zaehler des Endkunden mit passendem Energietraeger.
-- V0062 schreibt die Konsequenz selbst hin -- „bei mehreren Messkonzepten
-- desselben Kunden fliesst dabei fremder Verbrauch ein". Eine Angabe, die
-- ueber die Richtigkeit jeder Einsparzahl entscheidet, gehoert nicht in ein
-- Skript.
--
-- Mit dem Erfassungsweg braucht es das Ereignis: Wer die Systemgrenze
-- aendert, aendert rueckwirkend die Bedeutung jedes kuenftigen Laufs. Ohne
-- Eintrag liesse sich spaeter nicht mehr aufklaeren, warum zwei Laeufe
-- desselben Messkonzepts verschiedene Zaehler umfassten.
--
-- WARUM `zuordnen` UND NICHT `aendern`
-- ------------------------------------
-- Die Route setzt die MENGE der Systeme (PUT, idempotent), sie aendert kein
-- Attribut. `zuordnen` ist im Katalog vorhanden und trifft den Vorgang.
--
-- KONTEXT-KEYS
-- ------------
-- `synthetic` (Pflicht-Tag, A9), `energietraeger` (welcher Traeger des
-- Messkonzepts), `system_anzahl` (wie viele Systeme die Grenze jetzt
-- umfasst) und `vorher_anzahl` (wie viele es vorher waren). Die beiden
-- Zahlen zusammen machen aus dem Eintrag eine Aussage: „von 5 auf 1" ist
-- eine Korrektur, „von 0 auf 1" eine Ersteinrichtung. Keine
-- Systembezeichnungen -- die sind Freitext und koennten einen Standortnamen
-- tragen (A13-Linie).
--
-- objekt_ref = mvet_id (die Zuordnung haengt am Energietraeger einer
-- Version, nicht am Endkunden).
--
-- Review-Bedarf: `compliance-director` (Kontext-Keys), `database-lead`.

-- Der Code muss zuerst im uebergeordneten Katalog stehen
-- (`audit.event_typ`, FK `event_typ_version_code_fkey`). Die Trennung hat
-- ihren Grund: `event_typ` ist die stabile Kennung, `event_typ_version`
-- traegt ihre SCD2-Historie.
INSERT INTO audit.event_typ (code)
VALUES ('messkonzept.systemgrenze.zugeordnet');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'messkonzept.systemgrenze.zugeordnet', 'messkonzept', 'zuordnen',
     ARRAY['synthetic', 'energietraeger', 'system_anzahl', 'vorher_anzahl'],
     false, false, true,
     'Systemgrenze eines Messkonzept-Energietraegers gesetzt (MesskonzeptSystemgrenzeController.setzen). objekt_ref=mvet_id (energy.messkonzept_version_energietraeger.id). Die Zuordnung entscheidet, WELCHE Zaehler ein Berechnungslauf umfasst; fehlt sie, greift der endkunde_fallback und nimmt alle aktiven Zaehler des Endkunden (s. V0062). kontext.system_anzahl/vorher_anzahl machen aus dem Eintrag eine Aussage ueber die Art der Aenderung, ohne Systembezeichnungen zu fuehren (Freitext, koennte Standortnamen tragen -- A13-Linie).',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s. V0006-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile:
-- Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
-- herstellen. Die Aenderung ist ueber die Migrationshistorie belegt.
