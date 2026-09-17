-- V0023__analytics_berechnungslauf_endkunde_sperre_trigger.sql
--
-- ADR-Bezug: docs/adr/ADR-0006-baseline-bereinigung.md Teil C, C4 -- P4
-- (technical-director/security-lead): "A10 nur App-Scope. Entscheiden:
-- DB-BEFORE-INSERT-Trigger als Backstop (analog Audit-Seal) ODER
-- Single-Writer-Invariante dokumentieren + per Architekturtest erzwingen."
-- Direkter Arbeitsauftrag (database-lead) waehlt die erste Option:
-- DB-seitiger Backstop-Trigger. NUR ENTWURF -- kein Apply gegen die Dev-DB,
-- keine Migrations-Ausfuehrung ausserhalb eines Wegwerf-Testcontainers.
-- ADR-0006 bleibt "proposed" bis technical-director-/User-Freigabe.
--
-- =====================================================================
-- Zweck
-- =====================================================================
-- A10 (compliance-director-Auflage, C1) verlangt: ein gesperrter Endkunde
-- (`energy.endkunde.verarbeitungs_status <> 'aktiv'`, Art. 18 DSGVO) darf
-- KEINEN neuen Berechnungslauf bekommen. Umgesetzt ist das bislang
-- AUSSCHLIESSLICH in `BerechnungslaufService.starten()` (App-Scope, erster
-- Schritt vor jedem Schreibzugriff, integrationsbewiesen: 0 Zeilen bei
-- gesperrtem Endkunden). Residualrisiko (P4): ein KUENFTIGER zweiter
-- Schreibpfad auf `analytics.berechnungslauf` (Backfill-Skript, Admin-Tool,
-- Migrations-Datenkorrektur, ein zweiter Service) muesste diesen Check
-- eigenstaendig neu implementieren -- vergisst er das, entsteht ein Leck
-- OHNE dass irgendein bestehender Test es bemerkt. Dieser Trigger schliesst
-- die Luecke STRUKTURELL, unabhaengig vom Schreibpfad.
--
-- =====================================================================
-- Entwurfsentscheidungen
-- =====================================================================
--
-- (D-MUSTER) Eigentuemer-/SECURITY-Modell ANALOG audit.event_seal() (V0003):
--   `SECURITY DEFINER`, `SET search_path = analytics, pg_temp`, Owner =
--   `edms_analytics_owner` (bereits Owner von `analytics.berechnungslauf`
--   seit V0019), `REVOKE EXECUTE ... FROM PUBLIC` (Konsistenz-Massnahme --
--   Funktionen mit Rueckgabetyp `trigger` sind ohnehin nicht per SELECT
--   aufrufbar, PostgreSQL verweigert das strukturell; das REVOKE dupliziert
--   trotzdem das V0003-Muster, s. dortiger Kommentar). Fail-closed:
--   `RAISE EXCEPTION` bei jeder Abweichung -- KEIN stiller Default, KEIN
--   `WARNING`.
--
-- (D-GRANT-ENERGY) `SECURITY DEFINER` bedeutet: die Funktion laeuft mit den
--   Rechten des Eigentuemers (`edms_analytics_owner`), NICHT mit denen des
--   aufrufenden Schreibpfads. `edms_analytics_owner` ist eine NEUE,
--   dedizierte Rolle (V0019, D-A6-OWNER) OHNE jegliches Privileg auf
--   `energy.*` -- PostgreSQL vergibt an neue Schemata/Tabellen
--   standardmaessig KEINE PUBLIC-Rechte (energy wurde in V0002 per
--   `CREATE SCHEMA IF NOT EXISTS energy` angelegt, OHNE begleitendes
--   `GRANT USAGE ... TO PUBLIC`). Diese Migration muss daher ZWEI
--   Privilegien explizit erteilen: `USAGE` auf dem Schema `energy`
--   (sonst ist `energy.endkunde` fuer die Rolle nicht einmal SICHTBAR --
--   in einem Wegwerf-Testcontainer verifiziert, s. Verifikations-Notiz
--   am Dateiende) UND spaltenscharfes `SELECT (id, verarbeitungs_status)`
--   -- NICHT die volle Zeile (Muster D-UPDATE-SCOPE, V0020), weil der
--   Trigger ausschliesslich diese beiden Spalten liest (id in der
--   WHERE-Klausel, verarbeitungs_status im Ergebnis). Beide GRANTs sind
--   UNABHAENGIG von der in V0019 dokumentierten, bislang fehlenden
--   edms_app-Verdrahtung fuer `energy` (ADR-0002-Scope) -- sie haerten
--   NICHT das Schema `energy` insgesamt, sondern eroeffnen nur der
--   Trigger-Funktion den minimal noetigen Lesezugriff, unabhaengig davon,
--   ob/wie `energy` spaeter fuer `edms_app` gehaertet wird.
--
-- (D-NOT-FOUND) `NOT FOUND` (kein `energy.endkunde` mit `NEW.endkunde_id`)
--   wird EBENFALLS abgewiesen, obwohl die Spalte eine FK-Referenz traegt
--   (V0019). Grund: `BEFORE ROW`-Trigger laufen VOR der FK-Pruefung
--   (PostgreSQL prueft Fremdschluessel nach den BEFORE-ROW-Triggern) --
--   zum Zeitpunkt dieses Triggers ist `NEW.endkunde_id` noch NICHT
--   verifiziert zu existieren. Fail-closed heisst hier: nicht auflösbar
--   wird wie gesperrt behandelt, nicht wie erlaubt.
--
-- (D-SCOPE-ANSCHLUSSNUTZER) Diese Migration deckt AUSSCHLIESSLICH die
--   Endkunde-Sperre ab (A10, woertlich). Die vom Arbeitsauftrag genannte
--   Anschlussnutzer-Sperre (compliance-director-Zusatzfund A-3: ein
--   gesperrter Anschlussnutzer, dessen Daten der Lauf an der System-
--   grenze mitverarbeitet, blockt heute nichts) wird HIER BEWUSST NICHT
--   umgesetzt -- s. Kommentar am Dateiende ("OFFENER KLAERUNGSPUNKT").
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- GRANTs (D-GRANT-ENERGY) -> Trigger-Funktion -> Ownership -> REVOKE EXECUTE
-- -> CREATE TRIGGER -> Kommentar "OFFENER KLAERUNGSPUNKT" (Anschlussnutzer).

-- =====================================================================
-- Additiver Lesezugriff fuer die SECURITY-DEFINER-Funktion (D-GRANT-ENERGY)
-- =====================================================================

GRANT USAGE ON SCHEMA energy TO edms_analytics_owner;
GRANT SELECT (id, verarbeitungs_status) ON energy.endkunde TO edms_analytics_owner;

-- =====================================================================
-- Trigger-Funktion (D-MUSTER, D-NOT-FOUND)
-- =====================================================================

CREATE FUNCTION analytics.pruefe_endkunde_sperre() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = analytics, pg_temp AS $$
DECLARE
    v_status text;
BEGIN
    SELECT e.verarbeitungs_status INTO v_status
      FROM energy.endkunde e
     WHERE e.id = NEW.endkunde_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'analytics: endkunde_id % nicht in energy.endkunde aufloesbar -- Berechnungslauf abgelehnt (fail-closed, A10-DB-Backstop, ADR-0006 C4 P4)', NEW.endkunde_id;
    END IF;

    IF v_status <> 'aktiv' THEN
        RAISE EXCEPTION 'analytics: endkunde_id % ist nicht aktiv (verarbeitungs_status=%) -- Berechnungslauf abgelehnt (Art. 18 DSGVO, A10-DB-Backstop, ADR-0006 C4 P4)', NEW.endkunde_id, v_status;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION analytics.pruefe_endkunde_sperre() OWNER TO edms_analytics_owner;

REVOKE EXECUTE ON FUNCTION analytics.pruefe_endkunde_sperre() FROM PUBLIC;

CREATE TRIGGER trg_berechnungslauf_endkunde_sperre BEFORE INSERT ON analytics.berechnungslauf
    FOR EACH ROW EXECUTE FUNCTION analytics.pruefe_endkunde_sperre();

COMMENT ON TRIGGER trg_berechnungslauf_endkunde_sperre ON analytics.berechnungslauf IS
  'A10-DB-Backstop (P4, ADR-0006 Teil C C4): fail-closed BEFORE-INSERT-Sperrpruefung gegen energy.endkunde.verarbeitungs_status, unabhaengig vom Schreibpfad (App-Scope-Check bleibt zusaetzlich in BerechnungslaufService.starten() bestehen, dieser Trigger ist der strukturelle Zweitpfad-Backstop). Deckt NUR die Endkunde-Sperre ab -- Anschlussnutzer-Sperre bewusst NICHT umgesetzt, s. Migrations-Kopf "D-SCOPE-ANSCHLUSSNUTZER" und Dateiende "OFFENER KLAERUNGSPUNKT".';

-- =====================================================================
-- OFFENER KLAERUNGSPUNKT (compliance-director-Zusatzfund A-3, Auftrag) --
-- Anschlussnutzer-Sperre NICHT mitgebaut, mit Begruendung + Empfehlung
-- =====================================================================
--
-- Befund (A-3, woertlich): "A10 prueft heute nur die Endkunde-Sperre; ein
-- gesperrter Anschlussnutzer, dessen Daten der Lauf an der Systemgrenze
-- mitverarbeitet, blockt nichts." Ein analytisch deterministischer Check
-- waere z. B. "kein aktives energy.nutzungsverhaeltnis eines gesperrten
-- Anschlussnutzers auf dem/den System(en) der mvet_id im Lauf-Zeitraum".
--
-- Diese Migration baut das NICHT, weil DREI voneinander unabhaengige
-- Fachentscheidungen fehlen, keine davon im Trigger-SQL selbst sauber
-- schaetzbar ist, und ein FALSCH geschaetzter fail-closed-Trigger schlimmer
-- ist als gar keiner (blockiert entweder zu wenig -- truegerische
-- Sicherheit -- oder zu viel -- legitime Laeufe schlagen grundlos fehl):
--
-- (1) KEINE strukturelle Verknuepfung mvet_id -> system(e). Das Schema
--     (V0002/V0019) kennt keine Zuordnungstabelle
--     `messkonzept_version_energietraeger -> system`. Der EINZIGE im Repo
--     bereits verwendete Loesungsweg ist eine dokumentierte v1-Heuristik
--     (`AnalyticsMesswertMonatRepository.findAktiveZaehlerIds`,
--     src/backend/src/berechnung/persistence/analytics-messwert-monat.
--     repository.ts): "ALLE AKTIVEN Zaehler des Endkunden (ueber
--     energy.system.endkunde_id) MIT PASSENDEM energietraeger" -- dort
--     bereits als "groeber als eine echte Systemgrenzen-Zuordnung"
--     dokumentiert (ein Endkunde mit ZWEI unabhaengigen Gas-Messkonzepten
--     wuerde faelschlich beide Systeme summieren/hier: beide pruefen). Eine
--     bekannt ungenaue Heuristik in einen HARTEN, fail-closed DB-Trigger zu
--     giessen ist keine Haertung, sondern verschiebt das Ungenauigkeits-
--     risiko von "App liefert falsche Zahlen" zu "DB blockiert legitime
--     Laeufe grundlos ODER laesst unbemerkt Luecken" -- ohne dass der
--     Trigger-Kommentar das im laufenden Betrieb noch sichtbar macht.
-- (2) Zeitraum-Semantik unklar. `energy.nutzungsverhaeltnis.gueltig_von/
--     gueltig_bis` sind `timestamptz`, `analytics.berechnungslauf.
--     periode_von/periode_bis` sind `date` (lokaler Kalendertag, D4). Ein
--     Overlap-Check verlangt eine explizite Zeitzone-Verankerung (welche
--     lokale Zeitzone spannt periode_von/periode_bis zu einem tstzrange
--     auf? -- D4 sagt "je Lauf eingefroren", aber das Feld traegt die
--     Zeitzone nicht in `berechnungslauf` selbst) UND eine Fach-Entscheidung
--     "gilt die Sperre, wenn IRGENDEIN Ueberlappungstag betroffen ist, oder
--     nur wenn das Nutzungsverhaeltnis zum LAUF-ERSTELLUNGSZEITPUNKT
--     aktuell ist" (letzteres waere zwar trivial umsetzbar -- `gueltig_bis
--     IS NULL`, Index `ix_nutzung_system_aktiv` existiert bereits --, deckt
--     aber NICHT den vom Auftrag genannten Fall "im Lauf-Zeitraum" ab,
--     sondern nur "JETZT").
-- (3) Sperr-Wert fuer Anschlussnutzer nicht dokumentiert. Anders als
--     `energy.endkunde.verarbeitungs_status` (V0002, Inline-Kommentar
--     "aktiv|gesperrt(Art.18)|geloescht/anonym(Art.17)") traegt
--     `energy.anschlussnutzer.verarbeitungs_status` KEINEN analogen
--     Kommentar und KEINEN CHECK -- die Wertemenge ist fuer diese Spalte im
--     Schema nirgends verbindlich fixiert. Ein Trigger, der hier
--     `<> 'aktiv'` abfragt, wuerde eine Konvention unterstellen, die nie
--     explizit entschieden wurde.
--
-- EMPFEHLUNG (database-lead) an technical-director/access-control-engineer,
-- in dieser Reihenfolge zu klaeren, dann NACHTRAGSMIGRATION (neue Nummer,
-- append-only):
--   (a) Schema-Entscheidung zu (1): entweder eine echte mvet_id/system-
--       Zuordnungstabelle nachziehen (schliesst die bereits im Berechnungs-
--       Modul dokumentierte v1-Luecke strukturell, Nutzen ueber diesen
--       Trigger hinaus) ODER die vorhandene Endkunde+Energietraeger-
--       Heuristik EXPLIZIT als vorlaeufig ausreichend fuer den DB-Backstop
--       absegnen (dann aber im Trigger-Kommentar als bewusste Vereinfachung
--       mit derselben Einschraenkung wie im Berechnungs-Modul dokumentieren
--       -- keine stille Praezisions-Annahme).
--   (b) Zeitraum-/Zeitzone-Semantik zu (2) fachlich festlegen (vermutlich
--       `tages_zeitzone`-Parameter-Analogie aus D4, aber das ist eine
--       baseline-engineer/technical-director-Entscheidung, keine DB-Frage).
--   (c) `energy.anschlussnutzer.verarbeitungs_status`-Wertemenge nachtraeglich
--       per CHECK/Kommentar fixieren (kleine, risikoarme Vorabmigration,
--       unabhaengig von (a)/(b) sofort machbar).
-- Bis dahin bleibt die Anschlussnutzer-Sperre App-Scope-Luecke -- IDENTISCH
-- zum Status quo vor dieser Migration, nicht verschlechtert, nur nicht
-- durch einen zusaetzlichen DB-Trigger geschlossen.
