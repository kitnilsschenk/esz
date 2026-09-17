-- V0089 — Auflagen C-8 und C-10 (ADR-0012 Stufe C, Nachbesserung).
--
-- Zwei Vorgaenge, die dasselbe Muster teilen und deshalb in EINER Migration
-- stehen: beide erweitern die Kontext-Whitelist eines bestehenden
-- Audit-Ereignisses um die WIRKUNG, die der Vorgang auf die Messdatenerhebung
-- hat. Bis hierher protokollierte das Log, DASS etwas geschah, nicht was
-- daraus folgte.
--
-- C-8 (Sperr-Ereignisse): `neuerhebung_fortsetzen` — die bei Art. 18 Abs. 1
--     lit. b / lit. d ausdruecklich zu treffende Entscheidung, ob weiter
--     ERHOBEN wird (Spalte aus V0087). Warum das Ereignis sie tragen muss und
--     nicht die Tabelle allein: die Aufhebung der Einschraenkung nullt die
--     Spalte zusammen mit dem Grund (Kohaerenz mit `ck_*_einschraenkung_
--     kohaerenz`, V0024). Danach ist diese Zeile der einzige Beleg dafuer,
--     ob waehrend der Sperre gemessen wurde — und genau das ist die Frage,
--     die eine betroffene Person nach Art. 15 stellt.
--
-- C-10 (Widerruf): `zaehler_gestoppt` und `zaehler_ohne_grundlage` — die
--     Anzahl der Zaehler, deren Rechtsgrundlage DIESER Widerruf beendet, und
--     die Anzahl derer, die danach insgesamt ohne Grundlage sind. Bisher war
--     die Wirkung eines Widerrufs nirgends festgehalten: das Ereignis nannte
--     Zweck und Subjekt, nicht die Reichweite. Art. 7 Abs. 3 S. 1 verlangt,
--     dass der Widerruf so einfach ist wie die Erteilung; die Rechenschaft
--     nach Art. 5 Abs. 2 verlangt zusaetzlich, dass seine FOLGE belegbar ist.
--
--     Zwei Zahlen statt einer, weil eine allein in die Irre fuehrt:
--     `zaehler_gestoppt = 0` kann heissen „der Widerruf aenderte nichts,
--     weil ein Vertrag traegt" ODER „er aenderte nichts, weil ohnehin schon
--     alles stand". Erst `zaehler_ohne_grundlage` unterscheidet die Faelle.
--
-- SCD2 in beiden Faellen (Muster V0086): bestehende Zeile schliessen, neue
-- anlegen. Kein UPDATE auf `erlaubte_kontext_keys` der laufenden Zeile — die
-- Whitelist ist die Regel, gegen die vergangene Zeilen geprueft wurden, und
-- sie rueckwirkend zu erweitern hiesse, Ereignisse als regelkonform
-- erscheinen zu lassen, die zu ihrer Zeit gar keinen solchen Schluessel
-- tragen DURFTEN.

-- =====================================================================
-- (1) C-8 — endkunde.stammdaten.gesperrt
-- =====================================================================
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'endkunde.stammdaten.gesperrt'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'endkunde.stammdaten.gesperrt', 'endkunde', 'sperren',
     ARRAY['synthetic', 'einschraenkung_grund_code', 'neuerhebung_fortsetzen'],
     false, false, true,
     'Endkunde gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (EndkundeController.sperren, ADR-0008 §11/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag. kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (art18_1a_richtigkeit|art18_1b_unrechtmaessig|art18_1c_rechtsverteidigung_betroffener|art18_1d_widerspruch, energy.endkunde.einschraenkung_grund_code, V0024), PFLICHTANGABE der Route POST /stammdaten/endkunden/{id}/sperren (Fachaktion sperren:endkunde). NEU seit V0089 (Auflage C-8, ADR-0012 Stufe C): kontext.neuerhebung_fortsetzen = die bei lit. b und lit. d ausdruecklich zu treffende Entscheidung ueber die WEITERE ERHEBUNG (''true''/''false'', energy.endkunde.neuerhebung_fortsetzen, V0087). Bei lit. a und lit. c FEHLT der Schluessel -- dort stellt sich die Frage nicht, weil Art. 18 Abs. 2 die Speicherung ausnimmt; ein ''false'' waere dort eine Aussage, die niemand getroffen hat. Beide Kontext-Werte werden aus dem ERGEBNIS gelesen, nicht aus dem Request: bei einem idempotenten Wiederholungsaufruf protokolliert die Zeile den tatsaechlich wirksamen, bereits gespeicherten Zustand. Begruendung fuer die Aufnahme: die Aufhebung der Einschraenkung nullt Grund, gesperrt_seit UND die Entscheidung -- diese Zeile ist danach der EINZIGE Beleg des Vorgangs (Art. 15 Auskunft, Art. 5 Abs. 2 Rechenschaft). rolle_erfassen bleibt false (Datensparsamkeit, V0006-Begruendung traegt weiter).',
     now());

-- =====================================================================
-- (2) C-8 — anschlussnutzer.stammdaten.gesperrt
-- =====================================================================
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'anschlussnutzer.stammdaten.gesperrt'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'anschlussnutzer.stammdaten.gesperrt', 'anschlussnutzer', 'sperren',
     ARRAY['synthetic', 'einschraenkung_grund_code', 'neuerhebung_fortsetzen'],
     false, false, true,
     'Anschlussnutzer gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (AnschlussnutzerController.sperren -> AnschlussnutzerService.sperren, ADR-0007 A11.6). objekt_ref=Anschlussnutzer-UUID, kontext.synthetic Pflicht-Tag, kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (energy.anschlussnutzer.einschraenkung_grund_code, V0024). NEU seit V0089 (Auflage C-8): kontext.neuerhebung_fortsetzen wie bei endkunde.stammdaten.gesperrt -- s. dort. Beim Anschlussnutzer wiegt die Entscheidung schwerer als beim Endkunden: das Gate wertet ALLE aktiven Nutzungsverhaeltnisse eines Systems mit bool_and aus, eine Entscheidung gegen die Erhebung stoppt deshalb auch die Messung fuer die uebrigen Bewohner desselben Systems und fuer den Endkunden. Der Anschlussnutzer ist eine EIGENE betroffene Person -- diese Sperre ist unabhaengig von der des Endkunden und wird im Nachweis unter FJ-11a/b/c ausgewertet (ADR-0006 P4/ADR-0007 A12), waehrend die Endkunden-Sperre unter FJ-07a/b/c laeuft. Der Sperr-Pfad setzt BEIDE Namensraeume: energy.anschlussnutzer.verarbeitungs_status samt Grund und identity.anschlussnutzer_pii.pii_status. rolle_erfassen=false (Datensparsamkeit, analog endkunde.stammdaten.gesperrt).',
     now());

-- =====================================================================
-- (3) C-10 — einwilligung.consent.widerrufen
-- =====================================================================
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'einwilligung.consent.widerrufen'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'einwilligung.consent.widerrufen', 'einwilligung', 'widerrufen',
     ARRAY['synthetic', 'zweck_code', 'subjekt_typ', 'zaehler_gestoppt', 'zaehler_ohne_grundlage'],
     true, true, true,
     'Eine Einwilligung wurde widerrufen (ADR-0012 E8, Art. 7 Abs. 3 DSGVO). objekt_ref=consent.einwilligung.id. Die Wirkung endet AB dem Widerruf; die bis dahin erfolgte Verarbeitung bleibt rechtmaessig (Art. 7 Abs. 3 S. 2), und weder Fachzeile noch Beleg werden geloescht -- sonst waere auch der Nachweis der rechtmaessigen Vergangenheit weg. Schmalerer Kontext als beim Erteilen: Textfassung, Rechtsgrundlage und Erfassungsweg stehen bereits am Erteilungs-Ereignis derselben objekt_ref; sie hier zu wiederholen waere Redundanz im append-only Log. NEU seit V0089 (Auflage C-10, ADR-0012 Stufe C): kontext.zaehler_gestoppt = Anzahl der Zaehler, deren Rechtsgrundlage GENAU DIESER Widerruf beendet (Differenz der Gate-Auswertung vor und nach dem UPDATE, in derselben Transaktion); kontext.zaehler_ohne_grundlage = Anzahl der Zaehler des Subjekts, die danach INSGESAMT ohne Grundlage sind. Beide Zahlen sind subjektfrei -- keine Zaehler-IDs, keine Standorte (A12-13: das Log soll die Wirkung belegen, nicht ein zweites Bestandsverzeichnis werden). Gemessen wird ueber consent.ingest_rechtsgrundlage_wirksam(), also ueber DIESELBE Funktion, die der Ingest-Worker fragt: eine nachgebaute Zaehlung koennte abweichen und wuerde dann das Falsche belegen. Solange das Gate nicht scharf geschaltet ist (ConsentEnforcementConfig.enforced=false), beschreiben die Zahlen die Wirkung, die der Widerruf HAETTE -- der Wert ist damit auch der ehrlichste verfuegbare Beleg fuer die Frage, was die Scharfschaltung veraendern wuerde. pflichtereignis=true -- der Widerruf ist die Ausuebung eines Betroffenenrechts.',
     now());

-- =====================================================================
-- (4) C-10 — die Anwendung muss das Gate fragen duerfen
-- =====================================================================
-- Bis hierher durfte nur `edms_ingest_worker` die Funktion aufrufen. Die
-- Zaehlung im Widerrufs-Pfad laeuft aber unter `edms_app`.
--
-- Das erweitert die Angriffsflaeche NICHT: die Funktion ist ein
-- Boolean-Orakel ueber Daten, die `edms_app` ohnehin direkt lesen darf (das
-- Consent-Modul ist ihr Eigentuemer). Fuer `edms_ingest_worker` war die enge
-- Fassung die Pointe -- er soll Zeilen aus consent.* NIE sehen. Fuer die
-- Anwendung ist sie schlicht der Weg, dieselbe Antwort zu bekommen wie der
-- Worker, statt die Regel ein zweites Mal zu formulieren.
GRANT EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) TO edms_app;
