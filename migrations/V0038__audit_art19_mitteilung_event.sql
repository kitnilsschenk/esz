-- V0038__audit_art19_mitteilung_event.sql
--
-- ADR-Bezug: ADR-0007 A18 / A11.12. Audit-Event-Typ fuer die Mitteilung nach
-- Art. 19 DSGVO.
--
-- =====================================================================
-- Kontext-Whitelist
-- =====================================================================
-- `synthetic` + `kanal` + `anlass`. Bewusst KEIN
-- `einschraenkung_grund_code`: die Art.-19-Mitteilung selbst traegt den
-- differenzierten Grund nicht (nach aussen gilt der neutrale Sammelcode,
-- ADR-0007 C4 Punkt 6) -- ihn im Protokoll DIESES Ereignisses zu fuehren
-- wuerde die Trennung wieder aufweichen, die die Tabelle einhaelt. Wer den
-- Grund braucht, findet ihn am ausloesenden Ereignis
-- (`*.stammdaten.gesperrt`, V0032/V0033).
--
-- `anlass` unterscheidet Art. 18 (Einschraenkung) von Art. 17 (Loeschung) --
-- beide loesen die Pflicht aus, und welche Rechtsfolge mitgeteilt wurde, ist
-- fuer die Nachvollziehbarkeit wesentlich.
--
-- Kein `einreichung_id` im Kontext: `objekt_ref` traegt es bereits (die
-- Einreichung ist das Objekt, an dem die Mitteilung haengt). Ein zweiter
-- Schluessel mit derselben Aussage waere Redundanz im append-only Log.
--
-- `rolle_erfassen=true`: die Erfuellung einer Mitteilungspflicht gegenueber
-- einer Behoerde ist ein Vorgang, bei dem "wer hat sie erfuellt" Teil des
-- Nachweises ist -- dieselbe Begruendung wie beim Entsperren (V0036).

INSERT INTO audit.event_typ (code) VALUES
    ('nachweis.einreichung.art19_mitgeteilt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'nachweis.einreichung.art19_mitgeteilt', 'einreichung', 'mitteilen',
     ARRAY['synthetic','kanal','anlass'], true, false, true,
     'Empfaenger nach Art. 19 DSGVO ueber eine Einschraenkung (Art. 18) oder Loeschung (Art. 17) unterrichtet, die eine BEREITS ERFOLGTE Einreichung betrifft (ADR-0007 A18/A11.12). objekt_ref=nachweis.einreichung.id, kontext.synthetic Pflicht-Tag, kontext.kanal=geschlossener Code (postalisch|elektronisch|telefonisch|persoenlich, V0037), kontext.anlass=einschraenkung_art18|loeschung_art17. Die Unverhaeltnismaessigkeits-Ausnahme des Art. 19 greift hier NICHT: es gibt genau einen Empfaenger, er ist aktenkundig (nachweis.einreichung.empfaenger), und die Zuordnung Person->Einreichung ist eine Abfrage ueber einsparlauf_bindung. BEWUSST OHNE einschraenkung_grund_code -- der differenzierte Art.-18-Grund verlaesst das System nicht (C4 Punkt 6); wer ihn braucht, findet ihn am ausloesenden Ereignis. rolle_erfassen=true: die Erfuellung einer Mitteilungspflicht gegenueber einer Behoerde ist ein Vorgang, bei dem der Ausfuehrende Teil des Nachweises ist. NICHT enthalten: die Ausfuehrung als Korrektur-Einreichung (A18) -- sie haengt an O-B9 (BSCW-Weg unbestaetigt).',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
--
-- Keine eigene `audit.event`-Zeile. Pruefung fuer DIESEN Zeitpunkt:
--   1. ADR-0004-Ingest-Gate unveraendert ZU (v1 synthetic-only); es existiert
--      keine echte Einreichung, ueber die zu unterrichten waere.
--   2. Der Emitter entsteht im selben Commit -- der V0026-Punkt "kein Emitter"
--      traegt also nicht. Tragend ist allein 3.
--   3. Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission.
-- VERBINDLICHER HINWEIS: A11.5 verlangt dieses Ereignis. Es ist VERSCHOBEN,
-- nicht erledigt -- mit echtem Principal nachzutragen, spaetestens bei
-- Oeffnung des ADR-0004-Gates. V0032, V0033, V0036 und V0038 sind dabei
-- GEMEINSAM zu behandeln.
