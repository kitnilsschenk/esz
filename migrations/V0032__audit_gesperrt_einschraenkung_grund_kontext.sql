-- V0032__audit_gesperrt_einschraenkung_grund_kontext.sql
--
-- ADR-Bezug: ADR-0007 Auflage A11.5 (compliance-director-Votum 2026-08-26 zum
-- C8-Folgeauftrag). Erweitert die Kontext-Whitelist von
-- `endkunde.stammdaten.gesperrt` um GENAU EINEN Schluessel:
-- `einschraenkung_grund_code`.
--
-- =====================================================================
-- Warum der Grund ins Audit-Log gehoert
-- =====================================================================
-- Die naheliegende Sorge -- "der Grund verraet, dass eine Person die
-- Richtigkeit bestreitet bzw. Widerspruch eingelegt hat, das gehoert nicht ins
-- append-only Log" -- fuehrt im Ergebnis in die andere Richtung:
--
--   1. KEINE besondere Kategorie nach Art. 9. Es ist ein
--      Betroffenenrechts-Metadatum, kein Gesundheits-/Weltanschauungs-/
--      Gewerkschafts-/Biometrie-/Sexualleben-Datum. Normaler Massstab.
--   2. Der Empfaengerkreis wird nicht erweitert, sondern VERENGT: die
--      Information steht ohnehin in `energy.endkunde` und ist fuer `betrieb`
--      lesbar. `audit.event` ist append-only, mit engerem Rollenkreis und
--      ohne UPDATE/DELETE-Rechte.
--   3. Ohne den Eintrag gibt es KEINE Historie. Die kuenftige Aufhebung der
--      Einschraenkung (A11.7/A11.10) muss wegen
--      `ck_endkunde_einschraenkung_kohaerenz` (V0024) Status, Grund UND
--      `gesperrt_seit` in EINEM Statement zuruecksetzen -- danach ist in
--      `energy.endkunde` KEINE Spur des Art.-18-Vorgangs mehr vorhanden. Die
--      Spalte ist fluechtiger Zustand, nicht Historie. Der Audit-Eintrag ist
--      dann der EINZIGE verbleibende Beleg. Ihn nicht zu schreiben schuetzt
--      die betroffene Person nicht -- es nimmt ihr die Auskunft ueber den
--      eigenen Vorgang (Art. 15) und dem Verantwortlichen die Rechenschaft
--      (Art. 5 Abs. 2).
--   4. Der Grund steuert eine materielle Rechtsfolge (FJ-07b Ausweis MIT
--      Kennzeichnung vs. FJ-07c Paar-Ausschluss). Eine Entscheidung mit
--      Aussenwirkung, deren Ausloeser nicht protokolliert ist, ist nicht
--      nachvollziehbar.
--
-- BENANNTES RESTRISIKO (Retentionsasymmetrie): die Spalte lebt "an die Dauer
-- der Einschraenkung gebunden" (V0024-Kommentar), die Audit-Zeile nach der
-- F2-Hypothese Projektlaufzeit + 5 Jahre (A-O6 offen). Die Tatsache "diese
-- Person hat einmal Widerspruch eingelegt" ueberdauert den Vorgang also um
-- Jahre. Bewertet als verhaeltnismaessig -- die Zeile ist pseudonym
-- (`objekt_ref` = Endkunde-UUID, kein FK nach `identity`), und der
-- Re-ID-Pfad wird durch den Krypto-Shred gekappt, sodass sie nach
-- Art.-17-Vollzug faktisch anonym ist. A-O6 bekommt damit einen ZWEITEN
-- konkreten Anwendungsfall und ist in `retention-matrix.md` entsprechend zu
-- fuehren (A11.13, `compliance/**` ist gated).
--
-- =====================================================================
-- Grenzen dieser Erweiterung
-- =====================================================================
-- EIN Schluessel, geschlossener Code. KEIN `bemerkung`, kein `antrag_text`,
-- kein Antragsteller, kein Belegverweis, keine Kanalangabe mit Personenbezug
-- -- der Vorgangsakteninhalt gehoert in die Betroffenenrechts-Akte, nicht ins
-- Audit-Log. Der Code darf ausserdem NICHT in `objekt_ref` oder einen
-- zusammengesetzten Bezeichner wandern (Fehlertyp aus A19/Dateinamen).
--
-- ZWEITE LINIE: `audit.event_seal()` (V0003) prueft Schluesselnamen,
-- Skalaritaet und Groessen-Cap fail-closed -- aber NICHT die Wertemenge. Die
-- Validierung des Wertes gegen `EINSCHRAENKUNG_GRUND_CODES` erfolgt daher
-- serviceseitig VOR dem Schreiben (`EndkundeSperrenDto` `@IsIn`, Muster der
-- V0029-Haertung).
--
-- =====================================================================
-- SCD2 statt UPDATE
-- =====================================================================
-- Die bestehende V0006-Zeile wird NICHT editiert -- historische Events muessen
-- weiter gegen die Version aufloesbar bleiben, unter der sie geschrieben
-- wurden. Muster exakt wie V0009 (Ergaenzung `antrag_id` an
-- `endkunde.stammdaten.geschreddert`): alte Zeile `gueltig_bis`, neue Zeile
-- mit erweitertem Array. Kein neuer `audit.event_typ`-Header.
--
-- LAST-BEARING ANNAHME (wie V0009): `now()` ist innerhalb EINER Transaktion
-- stabil (Transaktions-Startzeit, nicht `clock_timestamp()`) -- UPDATE und
-- INSERT muessen daher in EINER Transaktion laufen (Standardverhalten des
-- Migrations-Runners je Datei). Nur so gilt exakt
-- `alte_version.gueltig_bis = neue_version.gueltig_ab`; die Down-Datei nutzt
-- diese Gleichheit, um die neue Version deterministisch zu erkennen.

UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'endkunde.stammdaten.gesperrt'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'endkunde.stammdaten.gesperrt', 'endkunde', 'sperren',
     ARRAY['synthetic','einschraenkung_grund_code'], false, false, true,
     'Endkunde gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (EndkundeController.sperren, ADR-0008 §11/§20). objekt_ref=Endkunde-UUID, kontext.synthetic Pflicht-Tag. NEU (ADR-0007 A11.5, C8-Folgeauftrag): kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (art18_1a_richtigkeit|art18_1b_unrechtmaessig|art18_1c_rechtsverteidigung_betroffener|art18_1d_widerspruch, energy.endkunde.einschraenkung_grund_code, V0024). Er ist seit dem C8-Folgeauftrag PFLICHTANGABE der Route -- die Route selbst wandert dabei von DELETE /stammdaten/endkunden/{id} auf POST /stammdaten/endkunden/{id}/sperren, Fachaktion sperren:endkunde statt delete:endkunde. Der Kontext-Wert wird aus dem ERGEBNIS gelesen, nicht aus dem Request: bei einem idempotenten Wiederholungsaufruf (gleicher Grund) protokolliert die Zeile damit den tatsaechlich wirksamen, bereits gespeicherten Grund. Begruendung fuer die Aufnahme: die kuenftige Aufhebung der Einschraenkung nullt Grund und gesperrt_seit (Kohaerenz-CHECK V0024) -- diese Zeile ist danach der EINZIGE Beleg des Vorgangs (Art. 15 Auskunft, Art. 5 Abs. 2 Rechenschaft). rolle_erfassen bleibt false (Datensparsamkeit, V0006-Begruendung traegt weiter); fuer das kuenftige ENTSPERR-Event ist rolle_erfassen=true vorgesehen (A11.10) -- das Aufheben ist die Handlung mit Missbrauchspotenzial und traegt eine eigene Rechtspflicht (Art. 18 Abs. 3).',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert, s.
-- V0006/V0007/V0009/V0015/V0021/V0026-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert KEINE eigene Zeile in `audit.event`. Pruefung
-- unabhaengig hergeleitet -- Punkt 2 der Vorgaenger traegt hier ausdruecklich
-- NICHT MEHR, das ist gegenueber V0026 neu:
--   1. Das ADR-0004-Ingest-Gate ist unveraendert ZU: v1 synthetic-only, die
--      Route liegt hinter dem `SyntheticOnlyInterceptor`. Es existieren keine
--      realen Betroffenen, deren Art.-18-Vorgang hier protokolliert wuerde.
--   2. ABWEICHEND von V0026: `endkunde.stammdaten.gesperrt` HAT einen
--      produktiven Emitter im Repo (`EndkundeController.sperren`). Der Code
--      ist also nicht "strukturell unbenutzt". Das allein aendert die
--      Entscheidung jedoch nicht -- siehe 3.
--   3. Der mechanische Grund gilt unveraendert und ist allein tragend: ein
--      SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1). Eine Selbst-Emission muesste einen Akteur
--      erfinden -- genau das, was das Audit-Log ausschliessen soll.
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission.
-- VERBINDLICHER HINWEIS: Auflage A11.5 verlangt die Emission dieses
-- Ereignisses. Sie ist damit NICHT erledigt, sondern VERSCHOBEN -- als
-- operativer Schritt mit echtem Principal
-- (`audit.append_event('audit.katalog.geaendert', ...)`) nachzutragen,
-- spaetestens bei Oeffnung des ADR-0004-Gates. Das Ereignis wird durch das
-- Fehlen der Migrations-Emission nicht rueckwirkend unmoeglich.
