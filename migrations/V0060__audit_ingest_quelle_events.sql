-- V0060__audit_ingest_quelle_events.sql
--
-- Audit-Event-Typen fuer die Pflege der Datenquellen (`ingest.quelle`, V0059).
--
-- WARUM DIE PFLEGE EINER QUELLE PROTOKOLLPFLICHTIG IST
-- ----------------------------------------------------
-- Sie sieht nach Infrastruktur aus, entscheidet aber, WOHER dieses System
-- ueberhaupt Messwerte bezieht. Wer einen Broker-Host aendert, lenkt die
-- Datenaufnahme auf einen anderen Absender um; wer eine Quelle deaktiviert,
-- legt sie still. Beides bleibt sonst unsichtbar, bis jemand bemerkt, dass
-- Werte fehlen -- und dann ist nicht mehr feststellbar, seit wann und durch
-- wen.
--
-- DREI EREIGNISSE
-- ---------------
-- `angelegt` und `geaendert` decken die Konfiguration ab. Das Hinterlegen
-- von Zugangsdaten ist BEWUSST ein eigenes Ereignis und keine Spielart von
-- `geaendert`: Es ist die sicherheitsrelevante Handlung an dieser Tabelle,
-- und die Frage "wer hat wann welches Geheimnis hinterlegt" muss sich ohne
-- Interpretation der uebrigen Aenderungen beantworten lassen. Das Deaktivieren
-- laeuft als `geaendert` mit `status` im Kontext -- der Uebergang geht damit
-- aus dem Kontext hervor, ohne einen vierten Ereignistyp zu brauchen.
--
-- KONTEXT-WHITELIST
-- -----------------
-- `synthetic` (Pflicht-Tag wie ueberall im Stammdaten-Pfad), `quelle_code`,
-- `broker_host`, `tls_modus`, `status`, `geheimnis_felder`.
--
-- `broker_host` darf hier stehen: V0059 schliesst Zugangsdaten in der Adresse
-- strukturell aus (`ck_quelle_broker_ohne_credentials`). `geheimnis_felder`
-- ist eine Liste von FELDNAMEN ('passwort', 'client_schluessel') -- welche
-- Geheimnisse gesetzt wurden, NIE deren Werte, auch nicht gekuerzt oder
-- gehasht. Ein Hash waere ein Orakel fuer schwache Passwoerter.
--
-- `rolle_erfassen=true`: Wer die Datenaufnahme umlenkt oder ein Geheimnis
-- hinterlegt, gehoert mit seiner Rolle ins Protokoll -- dieselbe Begruendung
-- wie bei der Herkunfts-Zuordnung (V0043).
--
-- `pflichtereignis=false`: Betriebsvorgang, kein rechtlich erzwungenes
-- Ereignis wie eine Betroffenenrechts-Erfuellung.

INSERT INTO audit.event_typ (code) VALUES
    ('quelle.ingest.angelegt'),
    ('quelle.ingest.geaendert'),
    ('quelle.ingest.zugangsdaten_hinterlegt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'quelle.ingest.angelegt', 'ingest_quelle', 'anlegen',
     ARRAY['synthetic','quelle_code','broker_host','tls_modus','status','geheimnis_felder'],
     true, false, true,
     'Eine Messdaten-Quelle wurde angelegt (ingest.quelle, V0059). objekt_ref=ingest.quelle.id. Die Quelle bestimmt, WOHER dieses System Messwerte bezieht -- deshalb protokollpflichtig wie eine Fach-Entscheidung, nicht wie eine Einstellung. Kontext fuehrt broker_host im Klartext, weil V0059 Zugangsdaten in der Adresse strukturell ausschliesst (ck_quelle_broker_ohne_credentials); geheimnis_felder nennt die FELDNAMEN hinterlegter Geheimnisse, niemals deren Werte -- auch nicht gehasht, weil ein Hash ein Orakel fuer schwache Passwoerter waere.',
     now()),
    (gen_random_uuid(), 'quelle.ingest.geaendert', 'ingest_quelle', 'aendern',
     ARRAY['synthetic','quelle_code','broker_host','tls_modus','status','geheimnis_felder'],
     true, false, true,
     'Die Konfiguration einer Messdaten-Quelle wurde geaendert (ingest.quelle, V0059). objekt_ref=ingest.quelle.id. Umfasst auch das Deaktivieren: Der neue Zustand steht als status im Kontext, ein eigener Ereignistyp dafuer waere Redundanz. Eine Aenderung von broker_host lenkt die Datenaufnahme auf einen anderen Absender um, eine Deaktivierung legt sie still -- beides bleibt sonst unsichtbar, bis jemand fehlende Werte bemerkt, und dann ist weder Zeitpunkt noch Urheber rekonstruierbar.',
     now()),
    (gen_random_uuid(), 'quelle.ingest.zugangsdaten_hinterlegt', 'ingest_quelle', 'erfassen',
     ARRAY['synthetic','quelle_code','tls_modus','geheimnis_felder'],
     true, false, true,
     'Fuer eine Messdaten-Quelle wurden Zugangsdaten oder ein Client-Zertifikat hinterlegt (ingest.quelle, V0059). objekt_ref=ingest.quelle.id. BEWUSST ein eigener Ereignistyp und keine Spielart von quelle.ingest.geaendert: Es ist die sicherheitsrelevante Handlung an dieser Tabelle, und die Frage "wer hat wann welches Geheimnis hinterlegt" muss sich ohne Interpretation der uebrigen Aenderungen beantworten lassen. geheimnis_felder nennt ausschliesslich Feldnamen (passwort, benutzername, client_schluessel, client_zertifikat, ca_zertifikat) -- die Werte selbst verlassen die Datenbank nur Richtung Ingest-Worker und erscheinen in KEINEM Protokoll.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
--
-- Keine eigene `audit.katalog.geaendert`-Zeile. Pruefung fuer DIESEN
-- Zeitpunkt:
--   1. Der Emitter entsteht im selben Commit -- der V0026-Punkt "kein
--      Emitter" traegt also nicht. Tragend ist allein 2.
--   2. Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine Selbst-Emission.
-- VERBINDLICHER HINWEIS: A11.5 verlangt dieses Ereignis. Es ist VERSCHOBEN,
-- nicht erledigt -- mit echtem Principal nachzutragen, spaetestens bei
-- Oeffnung des ADR-0004-Gates. V0032, V0033, V0036, V0038, V0043 und V0060
-- sind dabei GEMEINSAM zu behandeln.
