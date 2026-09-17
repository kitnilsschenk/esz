-- V0036__audit_einschraenkung_aufhebung_events.sql
--
-- ADR-Bezug: ADR-0007 Auflage A11.10. Legt die vier Audit-Event-Typen des
-- zweistufigen Entsperr-Vorgangs an -- je Subjektart einen fuer die
-- Unterrichtung (Art. 18 Abs. 3) und einen fuer die Aufhebung selbst.
--
-- =====================================================================
-- Warum `rolle_erfassen` hier ABWEICHT
-- =====================================================================
-- Beim SETZEN der Sperre gilt `rolle_erfassen=false` (Datensparsamkeit,
-- V0006-Begruendung, uebernommen in V0032/V0033). Beim AUFHEBEN wird es auf
-- `true` gesetzt -- ausdruecklich empfohlen im compliance-director-Votum vom
-- 2026-08-26:
--
--   * Das Aufheben ist die Handlung mit MISSBRAUCHSPOTENZIAL. Es gibt die
--     Verarbeitung wieder frei; eine unberechtigte Aufhebung wirkt nach
--     aussen (Nutzerinformation, Mehrwertdienste, Nachweis-Ausweis), eine
--     unberechtigte Sperre nur nach innen.
--   * Es traegt eine EIGENE Rechtspflicht (Art. 18 Abs. 3) -- wer sie erfuellt
--     hat, ist Teil des Nachweises.
--
-- Fuer die UNTERRICHTUNG gilt dasselbe: sie ist der Nachweis der
-- Pflichterfuellung, und "wer hat unterrichtet" ist genau die Frage, die eine
-- Aufsichtsbehoerde stellt. Beide Schritte daher `rolle_erfassen=true`.
--
-- =====================================================================
-- Kontext-Whitelists
-- =====================================================================
-- Unterrichtung: `synthetic` + `kanal`. Der Kanal ist ein geschlossener Code
-- (V0035-CHECK) -- KEIN Freitext, keine Kontaktdaten. Die
-- DB-Kontext-Whitelist prueft ohnehin nur den SCHLUESSEL-Namen, nicht den
-- Wert (V0003, Trigger-Schritt 3); die Wertvalidierung erfolgt serviceseitig
-- gegen dieselbe geschlossene Liste (zweite Linie, Muster V0029/V0032).
--
-- Aufhebung: `synthetic` + `einschraenkung_grund_code`. Der Grund ist der des
-- AUFGEHOBENEN Vorgangs -- er wird beim Aufheben aus `energy.<subjekt>`
-- gelesen, BEVOR die Spalte genullt wird. Ohne ihn traegt die Audit-Zeile
-- nicht, WAS aufgehoben wurde, und die Kette Sperre -> Aufhebung waere im
-- Protokoll nicht zusammensetzbar. Das ist zugleich der Grund, warum diese
-- Zeile ueberhaupt geschrieben werden muss: nach der Aufhebung ist in
-- `energy.<subjekt>` KEINE Spur des Art.-18-Vorgangs mehr vorhanden
-- (Kohaerenz-CHECK V0024 zwingt Status, Grund und `gesperrt_seit` gemeinsam
-- auf NULL). Audit-Log und `energy.einschraenkung_unterrichtung` sind danach
-- die einzigen Belege.

INSERT INTO audit.event_typ (code) VALUES
    ('endkunde.stammdaten.einschraenkung_unterrichtet'),
    ('endkunde.stammdaten.entsperrt'),
    ('anschlussnutzer.stammdaten.einschraenkung_unterrichtet'),
    ('anschlussnutzer.stammdaten.entsperrt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'endkunde.stammdaten.einschraenkung_unterrichtet', 'endkunde', 'unterrichten',
     ARRAY['synthetic','kanal'], true, false, true,
     'Betroffene Person ueber die bevorstehende Aufhebung der Verarbeitungseinschraenkung unterrichtet (Art. 18 Abs. 3 DSGVO, Schritt 1 des zweistufigen Entsperr-Vorgangs, ADR-0007 A11.10). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.kanal=geschlossener Code (postalisch|elektronisch|telefonisch|persoenlich, energy.einschraenkung_unterrichtung.kanal, V0035 -- KEIN Freitext, damit keine Kontaktdaten ins Protokoll wandern). rolle_erfassen=true: wer unterrichtet hat, ist Teil des Pflichtnachweises. Die Aufhebung (endkunde.stammdaten.entsperrt) wird fail-closed abgelehnt, solange kein an dieselbe Einschraenkung gebundener Unterrichtungs-Nachweis vorliegt (Bindung ueber gesperrt_seit).',
     now()),

    (gen_random_uuid(), 'endkunde.stammdaten.entsperrt', 'endkunde', 'entsperren',
     ARRAY['synthetic','einschraenkung_grund_code'], true, false, true,
     'Verarbeitungseinschraenkung nach Art. 18 DSGVO AUFGEHOBEN (Schritt 2, ADR-0007 A11.7/A11.10). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag, kontext.einschraenkung_grund_code=der Grund des AUFGEHOBENEN Vorgangs (aus energy.endkunde gelesen, BEVOR die Spalte genullt wird). Setzt in EINER Transaktion energy.endkunde.verarbeitungs_status=aktiv, einschraenkung_grund_code=NULL, gesperrt_seit=NULL sowie identity.endkunde_pii.pii_status=aktiv -- der Kohaerenz-CHECK ck_endkunde_einschraenkung_kohaerenz (V0024) laesst nichts anderes zu. NUR aus dem Zustand gesperrt; aus geloescht (Art. 17 vollzogen) wird fail-closed abgelehnt, nicht idempotent quittiert. rolle_erfassen=true: das Aufheben ist die Handlung mit Missbrauchspotenzial (es gibt die Verarbeitung wieder frei) und traegt eine eigene Rechtspflicht. NACH dieser Aufhebung ist in energy.endkunde keine Spur des Vorgangs mehr vorhanden -- diese Zeile und energy.einschraenkung_unterrichtung sind die einzigen Belege.',
     now()),

    (gen_random_uuid(), 'anschlussnutzer.stammdaten.einschraenkung_unterrichtet', 'anschlussnutzer', 'unterrichten',
     ARRAY['synthetic','kanal'], true, false, true,
     'Anschlussnutzer ueber die bevorstehende Aufhebung der Verarbeitungseinschraenkung unterrichtet (Art. 18 Abs. 3 DSGVO, Schritt 1, ADR-0007 A11.10). Semantik identisch zu endkunde.stammdaten.einschraenkung_unterrichtet -- der Anschlussnutzer ist eine EIGENE betroffene Person, sein Vorgang laeuft unabhaengig vom Endkunden. objekt_ref=Anschlussnutzer-UUID, kontext.kanal=geschlossener Code (V0035).',
     now()),

    (gen_random_uuid(), 'anschlussnutzer.stammdaten.entsperrt', 'anschlussnutzer', 'entsperren',
     ARRAY['synthetic','einschraenkung_grund_code'], true, false, true,
     'Verarbeitungseinschraenkung des Anschlussnutzers AUFGEHOBEN (Schritt 2, ADR-0007 A11.7/A11.10). Semantik identisch zu endkunde.stammdaten.entsperrt, angewendet auf energy.anschlussnutzer und identity.anschlussnutzer_pii (Kohaerenz-CHECK ck_anschlussnutzer_einschraenkung_kohaerenz, V0024). objekt_ref=Anschlussnutzer-UUID. rolle_erfassen=true.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert, s.
-- V0006/V0007/V0009/V0015/V0021/V0026/V0032/V0033-Kopf)
-- =====================================================================
--
-- Diese Migration emittiert KEINE eigene Zeile in `audit.event`. Pruefung
-- unabhaengig fuer DIESEN Zeitpunkt hergeleitet:
--   1. Das ADR-0004-Ingest-Gate ist unveraendert ZU: v1 synthetic-only, die
--      neuen Routen liegen hinter dem `SyntheticOnlyInterceptor`.
--   2. Wie bei V0032/V0033 gilt der V0026-Punkt "kein Emitter vorhanden" hier
--      NICHT -- die Emitter entstehen im selben Commit. Tragend ist allein 3.
--   3. Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1). Eine Selbst-Emission muesste einen Akteur
--      erfinden -- genau das, was das Audit-Log ausschliessen soll.
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission.
-- VERBINDLICHER HINWEIS: Auflage A11.5 verlangt dieses Ereignis. Es ist damit
-- NICHT erledigt, sondern VERSCHOBEN -- als operativer Schritt mit echtem
-- Principal nachzutragen, spaetestens bei Oeffnung des ADR-0004-Gates.
-- V0032, V0033 und V0036 sind dabei GEMEINSAM nachzutragen.
