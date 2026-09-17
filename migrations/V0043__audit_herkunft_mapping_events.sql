-- V0043__audit_herkunft_mapping_events.sql
--
-- ADR-Bezug: ADR-0011 B2/D3. Audit-Event-Typen fuer die Pflege der
-- Herkunfts-Zuordnung (`ingest.herkunft_mapping`, V0042).
--
-- WARUM DIESE ZUORDNUNG UEBERHAUPT PROTOKOLLPFLICHTIG IST
-- ------------------------------------------------------
-- Sie sieht nach Konfiguration aus, wirkt aber wie eine Fach-Entscheidung:
-- Seit ADR-0011 B3 entscheidet sie mit darueber, WESSEN Messwerte
-- eingespeist werden. Wer eine Application dem falschen Endkunden zuordnet,
-- lenkt Verbrauchsdaten in einen fremden Foerderjahres-Nachweis; wer eine
-- richtige Zuordnung entfernt, macht den Abgleich fuer diesen Tenant wieder
-- blind. Beides muss nachvollziehbar sein, und zwar mit Person und Zeitpunkt.
--
-- ZWEI EREIGNISSE, KEIN "GEAENDERT"
-- ---------------------------------
-- Die API kennt bewusst nur Anlegen und Entfernen (s. ADR-0011 B2). Eine
-- Zuordnung zu "aendern" hiesse, still eine ANDERE Aussage unter derselben
-- Kennung zu fuehren -- im Protokoll stuende dann ein `geaendert` ohne den
-- vorherigen Stand. Entfernen und neu anlegen erzeugt stattdessen zwei
-- Zeilen, aus denen der Uebergang lueckenlos hervorgeht.
--
-- KONTEXT-WHITELIST
-- -----------------
-- `synthetic` (Pflicht-Tag wie ueberall im Stammdaten-Pfad),
-- `chirpstack_tenant_id`, `chirpstack_application_id`, `endkunde_id`,
-- `standort_id`, `quelle_code`.
--
-- Alle sechs sind opake Kennungen bzw. ein Formcode -- keine Namen. Die
-- ChirpStack-Namen (`tenantName`, `applicationName`) bleiben aus demselben
-- Grund draussen wie ueberall sonst in ADR-0011 D1: Es ist Freitext aus einem
-- FREMDEN System, in dem im Beleg faktisch eine Anschrift stand.
--
-- `objekt_ref` traegt die `id` der Zuordnungszeile. Die vier Fach-Kennungen
-- stehen TROTZDEM im Kontext -- und das ist keine Redundanz: Nach einem
-- Entfernen existiert die Zeile nicht mehr, `objekt_ref` zeigt dann auf
-- nichts Auffindbares. Ohne die Kennungen im Kontext waere aus dem Protokoll
-- nicht mehr rekonstruierbar, WELCHE Zuordnung verschwunden ist -- genau die
-- Frage, die man bei einem stillgewordenen Abgleich stellt.
--
-- `rolle_erfassen=true`: Wer eine Datenlenkung zwischen Endkunden aendert,
-- gehoert mit seiner Rolle ins Protokoll -- dieselbe Begruendung wie beim
-- Entsperren (V0036) und bei der Art.-19-Mitteilung (V0038).
--
-- `pflichtereignis=false`: Die Zuordnung ist ein Betriebsvorgang, kein
-- rechtlich erzwungenes Ereignis wie eine Betroffenenrechts-Erfuellung.

INSERT INTO audit.event_typ (code) VALUES
    ('herkunft_mapping.ingest.zugeordnet'),
    ('herkunft_mapping.ingest.entfernt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'herkunft_mapping.ingest.zugeordnet', 'herkunft_mapping', 'zuordnen',
     ARRAY['synthetic','chirpstack_tenant_id','chirpstack_application_id','endkunde_id','standort_id','quelle_code'],
     true, false, true,
     'Eine ChirpStack-Application wurde einem EDMS-Standort und damit ein Netzserver-Tenant einem Endkunden zugeordnet (ADR-0011 B2/D3, ingest.herkunft_mapping aus V0042). objekt_ref=ingest.herkunft_mapping.id. Fachlich folgenreich, nicht blosse Konfiguration: Seit B3 entscheidet die Zuordnung mit darueber, WESSEN Messwerte eingespeist werden -- eine falsche Zuordnung lenkt Verbrauchsdaten in einen fremden Foerderjahres-Nachweis. Kontext fuehrt ausschliesslich opake Kennungen, KEINE ChirpStack-Namen (D1: Freitext aus einem fremden System, im Beleg faktisch eine Anschrift). rolle_erfassen=true wie bei jedem Vorgang, der Daten zwischen Endkunden lenkt.',
     now()),
    (gen_random_uuid(), 'herkunft_mapping.ingest.entfernt', 'herkunft_mapping', 'loeschen',
     ARRAY['synthetic','chirpstack_tenant_id','chirpstack_application_id','endkunde_id','standort_id','quelle_code'],
     true, false, true,
     'Eine Herkunfts-Zuordnung wurde entfernt (ADR-0011 B2/D3). objekt_ref=ingest.herkunft_mapping.id -- die Zeile existiert danach NICHT mehr, weshalb der Kontext die vier Fach-Kennungen mitfuehrt: Ohne sie waere aus dem Protokoll nicht rekonstruierbar, WELCHE Zuordnung verschwunden ist, und genau das ist die Frage bei einem stillgewordenen Herkunfts-Abgleich. Folge des Entfernens: Fuer diesen Tenant greift die Pruefung aus B3/D4 nicht mehr -- Uplinks werden wieder ungeprueft eingespeist. Es gibt bewusst KEIN Aenderungs-Ereignis: Umhaengen laeuft als Entfernen + Neuzuordnung, damit der Uebergang lueckenlos aus zwei Zeilen hervorgeht statt aus einem geaendert ohne Vorzustand.',
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
-- Oeffnung des ADR-0004-Gates. V0032, V0033, V0036, V0038 und V0043 sind
-- dabei GEMEINSAM zu behandeln.
