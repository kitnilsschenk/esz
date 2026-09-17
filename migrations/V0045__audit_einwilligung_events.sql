-- V0045__audit_einwilligung_events.sql
--
-- ADR-Bezug: ADR-0012 A2. Audit-Event-Typen fuer die Einwilligungsverwaltung.
--
-- WARUM DIESE EREIGNISSE UNVERZICHTBAR SIND
-- -----------------------------------------
-- Art. 7 Abs. 1 DSGVO dreht die Beweislast um: Der Verantwortliche muss
-- nachweisen koennen, dass eingewilligt wurde. `consent.einwilligung` traegt
-- dafuer die fachliche Zeile, `identity.einwilligung_beleg` den
-- personenbezogenen Nachweis -- aber BEIDE stehen in gewoehnlichen Tabellen,
-- die eine berechtigte Rolle schreiben kann.
--
-- Das Audit-Log ist die dritte, unabhaengige Spur: append-only, hash-verkettet
-- (ADR-0003), mit Person und Zeitpunkt. Es beantwortet die Frage, die die
-- Fachtabelle NICHT beantworten kann -- „wer hat das eingetragen?" -- und es
-- ueberlebt eine Korrektur an der Fachzeile.
--
-- DREI EREIGNISSE
-- ---------------
-- `erteilt` und `widerrufen` sind die beiden Zustandsuebergaenge einer
-- Einwilligung. `text_veroeffentlicht` gehoert dazu, obwohl es keine Person
-- betrifft: Eine neue Textfassung aendert, WORIN kuenftig eingewilligt wird.
-- Wer eine Fassung veroeffentlicht, ohne dass es jemand nachvollziehen kann,
-- kann den Gegenstand der Einwilligung stillschweigend verschieben.
--
-- KONTEXT-WHITELIST -- UND WAS BEWUSST FEHLT
-- ------------------------------------------
-- Aufgenommen: `synthetic` (Pflicht-Tag), `zweck_code`, `text_version_id`,
-- `subjekt_typ`, `rechtsgrundlage`, `erfassungsweg`, `fassung`.
--
-- NICHT aufgenommen: die IP und der User-Agent. Sie stehen im Beleg
-- (`identity.einwilligung_beleg`, feldverschluesselt) und gehoeren nicht ins
-- Audit-Log -- dieses ist eine Hypertable mit eigener, laengerer
-- Aufbewahrung und wird von `compliance-auditor` breit gelesen. Eine
-- IP-Adresse im Klartext-Kontext waere ein personenbezogenes Datum in einer
-- Tabelle, deren Zweck gerade NICHT die Personendaten-Haltung ist -- und der
-- Krypto-Shred (ADR-0009) erreichte sie dort nicht.
--
-- Der `erfassungsweg` wird dagegen gefuehrt: Er ist kategorial (drei Werte),
-- nicht personenbezogen, und beantwortet beim Nachweis die erste
-- Rueckfrage -- „digital oder auf Papier?".
--
-- NICHT aufgenommen ist auch die SUBJEKT-Kennung als Kontext-Key:
-- `objekt_ref` traegt die `consent.einwilligung.id`, und ueber sie ist das
-- Subjekt auffindbar. Ein zweiter Schluessel mit derselben Aussage waere
-- Redundanz im append-only Log.
--
-- `rolle_erfassen=true` bei allen dreien: Wer eine Rechtsgrundlage erfasst,
-- beendet oder deren Wortlaut aendert, gehoert mit seiner Rolle ins
-- Protokoll -- dieselbe Begruendung wie beim Entsperren (V0036) und bei der
-- Art.-19-Mitteilung (V0038).
--
-- `pflichtereignis`: `erteilt` und `widerrufen` sind TRUE. Sie sind die
-- Ereignisse, ohne die der Nachweis nach Art. 7 Abs. 1 nicht gefuehrt werden
-- kann -- ihr Fehlen ist selbst ein Befund. `text_veroeffentlicht` ist ein
-- Verwaltungsvorgang und bleibt FALSE.

INSERT INTO audit.event_typ (code) VALUES
    ('einwilligung.consent.erteilt'),
    ('einwilligung.consent.widerrufen'),
    ('einwilligung.consent.text_veroeffentlicht');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'einwilligung.consent.erteilt', 'einwilligung', 'erfassen',
     ARRAY['synthetic','zweck_code','text_version_id','subjekt_typ','rechtsgrundlage','erfassungsweg'],
     true, true, true,
     'Eine Einwilligung wurde erfasst (ADR-0012 E1, DS-03/DS-04). objekt_ref=consent.einwilligung.id. Dritte, unabhaengige Spur neben Fachzeile und Beleg: Sie beantwortet, WER die Einwilligung eingetragen hat -- was die Fachtabelle nicht kann -- und ueberlebt eine spaetere Korrektur an ihr. kontext.erfassungsweg=digital_opt_in|vertrag_schriftlich|uebernahme_altbestand (kategorial, nicht personenbezogen). BEWUSST OHNE IP und User-Agent: die stehen feldverschluesselt im Beleg (identity.einwilligung_beleg); im Audit-Log waeren sie personenbezogene Daten in einer breit gelesenen Hypertable, die der Krypto-Shred nicht erreicht. BEWUSST OHNE Subjekt-Kennung: ueber objekt_ref auffindbar. pflichtereignis=true -- ohne dieses Ereignis ist der Nachweis nach Art. 7 Abs. 1 DSGVO nicht zu fuehren.',
     now()),
    (gen_random_uuid(), 'einwilligung.consent.widerrufen', 'einwilligung', 'widerrufen',
     ARRAY['synthetic','zweck_code','subjekt_typ'],
     true, true, true,
     'Eine Einwilligung wurde widerrufen (ADR-0012 E8, Art. 7 Abs. 3 DSGVO). objekt_ref=consent.einwilligung.id. Die Wirkung endet AB dem Widerruf; die bis dahin erfolgte Verarbeitung bleibt rechtmaessig (Art. 7 Abs. 3 S. 2), und weder Fachzeile noch Beleg werden geloescht -- sonst waere auch der Nachweis der rechtmaessigen Vergangenheit weg. Schmalerer Kontext als beim Erteilen: Textfassung, Rechtsgrundlage und Erfassungsweg stehen bereits am Erteilungs-Ereignis derselben objekt_ref; sie hier zu wiederholen waere Redundanz im append-only Log. pflichtereignis=true -- der Widerruf ist die Ausuebung eines Betroffenenrechts.',
     now()),
    (gen_random_uuid(), 'einwilligung.consent.text_veroeffentlicht', 'einwilligung_text', 'veroeffentlichen',
     ARRAY['synthetic','zweck_code','fassung'],
     true, false, true,
     'Eine neue Fassung einer Einwilligungserklaerung wurde veroeffentlicht (ADR-0012 E3, DS-04). objekt_ref=consent.text_version.id. Betrifft keine einzelne Person und ist trotzdem protokollpflichtig: Eine neue Fassung aendert, WORIN kuenftig eingewilligt wird -- wer sie unbemerkt veroeffentlichen koennte, koennte den Gegenstand der Einwilligung stillschweigend verschieben. Der Wortlaut selbst steht nicht im Kontext (er waere zu lang und liegt ohnehin unveraenderlich in consent.text_version, samt SHA-256 gegen nachtraegliche Aenderung). pflichtereignis=false -- Verwaltungsvorgang, kein Betroffenenrechts-Ereignis.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
--
-- Keine eigene `audit.katalog.geaendert`-Zeile. Pruefung fuer DIESEN
-- Zeitpunkt:
--   1. Es existiert noch keine Einwilligung -- die Mechanik entsteht in
--      diesem und den folgenden Commits (ADR-0012 §9).
--   2. Der Emitter entsteht im selben Commit -- der V0026-Punkt "kein
--      Emitter" traegt also nicht. Tragend ist allein 3.
--   3. Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine Selbst-Emission.
-- VERBINDLICHER HINWEIS: A11.5 verlangt dieses Ereignis. Es ist VERSCHOBEN,
-- nicht erledigt -- mit echtem Principal nachzutragen, spaetestens bei
-- Oeffnung des ADR-0004-Gates. V0032, V0033, V0036, V0038, V0043 und V0045
-- sind dabei GEMEINSAM zu behandeln.
