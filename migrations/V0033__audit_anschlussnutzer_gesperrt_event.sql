-- V0033__audit_anschlussnutzer_gesperrt_event.sql
--
-- ADR-Bezug: ADR-0007 Auflage A11.6 (compliance-director-Votum 2026-08-26).
-- Legt den Audit-Event-Typ `anschlussnutzer.stammdaten.gesperrt` an -- den es
-- bislang NICHT gibt: `audit.event_typ` fuehrt fuer den Anschlussnutzer
-- ausschliesslich `anschlussnutzer.stammdaten.angelegt` (V0006).
--
-- =====================================================================
-- Warum der Pfad ueberhaupt gebaut wird
-- =====================================================================
-- Der Anschlussnutzer ist eine EIGENE betroffene Person mit eigenen
-- Betroffenenrechten (ADR-0004/0008) -- nicht ein Anhaengsel des Endkunden.
-- Der Zustand vor dieser Migration war schief:
--
--   * V0024 hat `einschraenkung_grund_code` und `gesperrt_seit` an
--     `energy.anschlussnutzer` ergaenzt (Lesepfad vorhanden).
--   * `paar-einschraenkung.ts` WERTET die Sperre unter FJ-11a/b/c AUS,
--     `AnalyticsLaufLookupRepository.findAnschlussnutzerSperrenFuerPaar()`
--     liest sie (seit V0028 ueber die mvet->System-Kette aufloesbar).
--   * `AnschlussnutzerController` kannte aber NUR `liste`/`anlegen`/`lesen` --
--     KEINEN Schreibpfad. Das System konnte eine Anschlussnutzer-Sperre
--     auswerten, aber nicht setzen. Uebte ein Anschlussnutzer Art. 18 aus,
--     hatte der Verantwortliche keinen Mechanismus.
--
-- Erschwerend: `compliance/dsgvo/betroffenenrechte.md` sichert in der
-- ADR-0004-Ergaenzung woertlich zu, „Endkunde und Anschlussnutzer koennen
-- unabhaengig voneinander gesperrt werden". Diese Aussage war bis zu diesem
-- Commit UNWAHR. Ein Compliance-Dokument, das eine nicht existierende
-- Faehigkeit zusichert, ist schlechter als eine dokumentierte Luecke -- es ist
-- gegenueber einer Aufsichtsbehoerde nicht haltbar. Das ist der tragende Grund
-- fuer diese Migration, nicht Symmetrie-Aesthetik.
--
-- =====================================================================
-- Kontext-Whitelist
-- =====================================================================
-- `ARRAY['synthetic','einschraenkung_grund_code']` -- identisch zur mit V0032
-- eingefuehrten Fassung von `endkunde.stammdaten.gesperrt`, aus denselben
-- Gruenden (dort ausfuehrlich begruendet, hier nur der tragende Kern): die
-- kuenftige Aufhebung der Einschraenkung nullt Grund und `gesperrt_seit`
-- (Kohaerenz-CHECK V0024) -- die Audit-Zeile ist danach der EINZIGE Beleg des
-- Vorgangs (Art. 15 Auskunft, Art. 5 Abs. 2 Rechenschaft).
--
-- EIN Schluessel, geschlossener Code, sonst nichts: kein Antragsteller, kein
-- Freitext, kein Belegverweis. Der DB-Trigger `audit.event_seal()` prueft nur
-- Schluesselnamen, Skalaritaet und Groessen-Cap -- die Wertevalidierung gegen
-- `EINSCHRAENKUNG_GRUND_CODES` erfolgt serviceseitig
-- (`AnschlussnutzerSperrenDto`).
--
-- `rolle_erfassen=false` wie beim Endkunden (Datensparsamkeit, V0006-
-- Begruendung traegt weiter). Fuer das kuenftige ENTSPERR-Event ist
-- `rolle_erfassen=true` vorgesehen (A11.10): das Aufheben ist die Handlung mit
-- Missbrauchspotenzial und traegt eine eigene Rechtspflicht (Art. 18 Abs. 3).
--
-- `pflichtereignis=false` -- ebenfalls wie beim Endkunden.

INSERT INTO audit.event_typ (code) VALUES
    ('anschlussnutzer.stammdaten.gesperrt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'anschlussnutzer.stammdaten.gesperrt', 'anschlussnutzer', 'sperren',
     ARRAY['synthetic','einschraenkung_grund_code'], false, false, true,
     'Anschlussnutzer gesperrt = Verarbeitungseinschraenkung Art. 18 DSGVO, KEIN Hard-Delete (AnschlussnutzerController.sperren -> AnschlussnutzerService.sperren, ADR-0007 A11.6). objekt_ref=Anschlussnutzer-UUID, kontext.synthetic Pflicht-Tag, kontext.einschraenkung_grund_code = der geschlossene Art.-18-Grund (art18_1a_richtigkeit|art18_1b_unrechtmaessig|art18_1c_rechtsverteidigung_betroffener|art18_1d_widerspruch, energy.anschlussnutzer.einschraenkung_grund_code, V0024). Der Anschlussnutzer ist eine EIGENE betroffene Person -- diese Sperre ist unabhaengig von der des Endkunden und wird im Nachweis unter FJ-11a/b/c ausgewertet (ADR-0006 P4/ADR-0007 A12), waehrend die Endkunden-Sperre unter FJ-07a/b/c laeuft. Der Kontext-Wert wird aus dem ERGEBNIS gelesen, nicht aus dem Request: bei einem idempotenten Wiederholungsaufruf (gleicher Grund) protokolliert die Zeile den tatsaechlich wirksamen, bereits gespeicherten Grund. Der Sperr-Pfad setzt BEIDE Namensraeume: energy.anschlussnutzer.verarbeitungs_status samt Grund und identity.anschlussnutzer_pii.pii_status. rolle_erfassen=false (Datensparsamkeit, analog endkunde.stammdaten.gesperrt); fuer das kuenftige Entsperr-Event ist rolle_erfassen=true vorgesehen (A11.10, Art. 18 Abs. 3).',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert, s.
-- V0006/V0007/V0009/V0015/V0021/V0026/V0032-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert KEINE eigene Zeile in `audit.event`. Pruefung
-- unabhaengig fuer DIESEN Zeitpunkt hergeleitet:
--   1. Das ADR-0004-Ingest-Gate ist unveraendert ZU: v1 synthetic-only, die
--      neue Route liegt hinter dem `SyntheticOnlyInterceptor`. Es existieren
--      keine realen Betroffenen, deren Art.-18-Vorgang hier protokolliert
--      wuerde.
--   2. Wie schon bei V0032 gilt der V0026-Punkt „kein Emitter vorhanden" hier
--      NICHT: der Emitter (`AnschlussnutzerController.sperren`) wird im selben
--      Commit angelegt. Das aendert die Entscheidung dennoch nicht -- s. 3.
--   3. Tragend und allein ausschlaggebend bleibt der mechanische Grund: ein
--      SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
--      herstellen (rote Linie 1). Eine Selbst-Emission muesste einen Akteur
--      erfinden -- genau das, was das Audit-Log ausschliessen soll.
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission.
-- VERBINDLICHER HINWEIS: Auflage A11.5 verlangt dieses Ereignis. Es ist damit
-- NICHT erledigt, sondern VERSCHOBEN -- als operativer Schritt mit echtem
-- Principal (`audit.append_event('audit.katalog.geaendert', ...)`)
-- nachzutragen, spaetestens bei Oeffnung des ADR-0004-Gates. Diese Migration
-- und V0032 sind dabei GEMEINSAM nachzutragen.
