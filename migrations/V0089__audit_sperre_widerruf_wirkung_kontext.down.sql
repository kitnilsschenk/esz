-- Down zu V0089 (Auflagen C-8 und C-10).
--
-- Schliesst die V0089-Zeilen und stellt den V0032/V0045-Stand der drei
-- Ereignistypen wieder her. Die bereits GESCHRIEBENEN Audit-Zeilen bleiben
-- unberuehrt -- audit.event ist append-only, und das gilt auch fuer einen
-- Rollback. Folge: nach dem Rueckbau existieren Ereignisse mit Kontext-
-- Schluesseln, die die dann gueltige Whitelist nicht mehr nennt. Das ist
-- korrekt so und der Grund fuer die SCD2-Fuehrung: jede Zeile wird gegen die
-- Regel gelesen, die zu IHRER Zeit galt.
--
-- ACHTUNG: Der Rueckbau nimmt der Anwendung das Recht, das Gate zu fragen.
-- Ein Widerruf schreibt danach wieder ein Ereignis ohne Wirkungsangabe --
-- der Code faellt dafuer NICHT aus (er behandelt den fehlenden Wert), aber
-- die Auflage C-10 ist dann nicht mehr erfuellt.

-- =====================================================================
-- (1) Grant zurueck
-- =====================================================================
REVOKE EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) FROM edms_app;

-- =====================================================================
-- (2) einwilligung.consent.widerrufen zurueck auf den V0045-Stand
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
     ARRAY['synthetic', 'zweck_code', 'subjekt_typ'],
     true, true, true,
     'Eine Einwilligung wurde widerrufen (ADR-0012 E8, Art. 7 Abs. 3 DSGVO). objekt_ref=consent.einwilligung.id. Die Wirkung endet AB dem Widerruf; die bis dahin erfolgte Verarbeitung bleibt rechtmaessig (Art. 7 Abs. 3 S. 2), und weder Fachzeile noch Beleg werden geloescht -- sonst waere auch der Nachweis der rechtmaessigen Vergangenheit weg. Schmalerer Kontext als beim Erteilen: Textfassung, Rechtsgrundlage und Erfassungsweg stehen bereits am Erteilungs-Ereignis derselben objekt_ref; sie hier zu wiederholen waere Redundanz im append-only Log. pflichtereignis=true -- der Widerruf ist die Ausuebung eines Betroffenenrechts.',
     now());

-- =====================================================================
-- (3) anschlussnutzer.stammdaten.gesperrt zurueck
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
     ARRAY['synthetic', 'einschraenkung_grund_code'],
     false, false, true,
     'Anschlussnutzer gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (AnschlussnutzerController.sperren -> AnschlussnutzerService.sperren, ADR-0007 A11.6). objekt_ref=Anschlussnutzer-UUID, kontext.synthetic Pflicht-Tag, kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (art18_1a_richtigkeit|art18_1b_unrechtmaessig|art18_1c_rechtsverteidigung_betroffener|art18_1d_widerspruch, energy.anschlussnutzer.einschraenkung_grund_code, V0024). Der Anschlussnutzer ist eine EIGENE betroffene Person -- diese Sperre ist unabhaengig von der des Endkunden und wird im Nachweis unter FJ-11a/b/c ausgewertet (ADR-0006 P4/ADR-0007 A12), waehrend die Endkunden-Sperre unter FJ-07a/b/c laeuft. Der Kontext-Wert wird aus dem ERGEBNIS gelesen, nicht aus dem Request: bei einem idempotenten Wiederholungsaufruf (gleicher Grund) protokolliert die Zeile den tatsaechlich wirksamen, bereits gespeicherten Grund. Der Sperr-Pfad setzt BEIDE Namensraeume: energy.anschlussnutzer.verarbeitungs_status samt Grund und identity.anschlussnutzer_pii.pii_status. rolle_erfassen=false (Datensparsamkeit, analog endkunde.stammdaten.gesperrt); fuer das kuenftige Entsperr-Event ist rolle_erfassen=true vorgesehen (A11.10, Art. 18 Abs. 3).',
     now());

-- =====================================================================
-- (4) endkunde.stammdaten.gesperrt zurueck
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
     ARRAY['synthetic', 'einschraenkung_grund_code'],
     false, false, true,
     'Endkunde gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (EndkundeController.sperren, ADR-0008 §11/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag. NEU (ADR-0007 A11.5, C8-Folgeauftrag): kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (art18_1a_richtigkeit|art18_1b_unrechtmaessig|art18_1c_rechtsverteidigung_betroffener|art18_1d_widerspruch, energy.endkunde.einschraenkung_grund_code, V0024). Er ist seit dem C8-Folgeauftrag PFLICHTANGABE der Route -- die Route selbst wandert dabei von DELETE /stammdaten/endkunden/{id} auf POST /stammdaten/endkunden/{id}/sperren, Fachaktion sperren:endkunde statt delete:endkunde. Der Kontext-Wert wird aus dem ERGEBNIS gelesen, nicht aus dem Request: bei einem idempotenten Wiederholungsaufruf (gleicher Grund) protokolliert die Zeile damit den tatsaechlich wirksamen, bereits gespeicherten Grund. Begruendung fuer die Aufnahme: die kuenftige Aufhebung der Einschraenkung nullt Grund und gesperrt_seit (Kohaerenz-CHECK V0024) -- diese Zeile ist danach der EINZIGE Beleg des Vorgangs (Art. 15 Auskunft, Art. 5 Abs. 2 Rechenschaft). rolle_erfassen bleibt false (Datensparsamkeit, V0006-Begruendung traegt weiter); fuer das kuenftige ENTSPERR-Event ist rolle_erfassen=true vorgesehen (A11.10) -- das Aufheben ist die Handlung mit Missbrauchspotenzial und traegt eine eigene Rechtspflicht (Art. 18 Abs. 3).',
     now());
