-- V0013__messwert_rang_und_korrektur_log.sql
--
-- ADR-Bezug: docs/adr/ADR-0005-messdaten-ingestion.md §24 ("D12 --
-- Idempotenter Schreibpfad (F4): Vorrang-Regel & Korrekturhistorie",
-- Entscheidungen D1/D2/TS-1/TD-5), §28 ("D16 -- Schema-Skizze", TS-6).
-- Design-Owner: technical-director/User (D1, s. u.). Migrations-Entwurf:
-- database-lead. Teil des Phase-4-Migrations-Batches (V0010-V0013), NUR
-- Schema -- Ingest-Gate bleibt ZU (s. V0010-Datei-Kopf). Diese Migration
-- fasst KEINE bereits gemergte Zeile in measurement.messwert an (append-
-- only, ADR-0004 §14 Abweichung (d)) -- sie ergaenzt NUR eine neue
-- Funktion, eine neue Tabelle, einen neuen Trigger auf der bestehenden
-- Tabelle sowie zwei Rechte-Aenderungen.
--
-- Review vor Merge (ausstehend): database-lead (Migrations-Entwurf) +
-- timescale-engineer (rang()-Semantik/Testmatrix, ADR-0005 §24) --
-- KEINE PII-Spalte in dieser Migration.
--
-- =====================================================================
-- ABWEICHUNG VOM AUFTRAGSTEXT (Kennzeichnungspflicht -- WICHTIGSTE
-- Entscheidung dieser Datei, bitte im Review prioritaer pruefen)
-- =====================================================================
-- Der Migrations-Arbeitsauftrag benennt fuer measurement.messwert_
-- korrektur_log explizit Spalten "wert_alt/neu" (zusaetzlich zu qualitaet_
-- alt/neu, herkunft_alt/neu). DIESE MIGRATION LEGT KEINE wert_alt/wert_neu-
-- SPALTEN AN -- bewusste, dokumentierte Abweichung vom Auftragstext
-- zugunsten der bereits vorliegenden, ADR-0005-eigenen Design-Entscheidung
-- D2 (§24): "keine wert-Spalten (alt/neu) in dieser Tabelle, um dem 'keine
-- Rohwerte ausserhalb des eigentlichen Messwertpfads duplizieren'-
-- Vorsichtsprinzip zu folgen; Nachweis DASS und WANN korrigiert wurde,
-- nicht um welchen Betrag." D2 ist eine bereits im Phase-2-Design
-- ausgearbeitete, auf Art. 5(2) DSGVO (Datenminimierung/Rechenschaft)
-- gestuetzte Entscheidung -- ein Datenminimierungs-Grundsatz wird NICHT
-- stillschweigend durch eine abweichend formulierte Migrations-Anweisung
-- rueckgaengig gemacht, ohne dass dies ausdruecklich vom User/
-- compliance-director bestaetigt wird. Diese Migration setzt daher §24/D2
-- um (KEINE Wert-Spalten) und markiert die Abweichung vom Auftragstext
-- hier ausdruecklich als OFFENEN, zu klaerenden Punkt (s. finale Antwort) --
-- falls tatsaechlich `wert_alt`/`wert_neu` gewuenscht sind, ist das eine
-- bewusste NEUE Design-Entscheidung, die D2 explizit widerruft und eine
-- compliance-director-Bestaetigung braucht (Datenminimierungs-Abwaegung),
-- NICHT eine stille Schema-Ergaenzung.
--
-- Weitere, unkritische Benennungs-Abweichungen vom ADR-Skizzen-Wortlaut
-- (§24, "alte_qualitaet/neue_qualitaet/alter_rang/neuer_rang/korrigiert_at")
-- zugunsten der im Auftragstext gewaehlten X_alt/X_neu-Suffixkonvention
-- (`qualitaet_alt/neu`, `herkunft_alt/neu`, `geaendert_at` statt
-- `korrigiert_at`) -- reine Namenskonvention ohne Datenminimierungs-
-- Implikation, hier unbedenklich uebernommen; `rang_alt`/`rang_neu`
-- (statt `alter_rang`/`neuer_rang`) fuer durchgaengige Suffix-Konsistenz
-- ergaenzt (Diagnose-/Testwert, keine PII, kein Rohwert).
--
-- =====================================================================
-- D1/TS-1/TD-5 -- measurement.rang(): EINE kanonische, IMMUTABLE-Funktion
-- =====================================================================
-- `qualitaet` (0=gemessen,1=geschaetzt,2=korrigiert,3=ersatzwert) und
-- `herkunft` (0=ingest_live,1=backfill,2=manuell,3=import_altsystem)
-- existieren bereits in V0002 -- KEINE Schema-Ergaenzung an measurement.
-- messwert selbst, nur die hier bislang fehlende Vorrang-SEMANTIK.
--
-- LESER-FALLE (ADR-0005 §24, ausdruecklich zu vermerken): die Rang-Ordnung
-- ist eine NICHT-MONOTONE UMKEHRUNG der V0002-Rohcodes -- Rohcode 3
-- (`ersatzwert`, der HOECHSTE Rohcode-Zahlenwert) hat den NIEDRIGSTEN
-- Rang (0)! Ein naiver Vergleich `WHERE EXCLUDED.qualitaet >
-- messwert.qualitaet` (direkter Rohcode-Vergleich statt rang()) waere
-- EXAKT FALSCH HERUM -- `ersatzwert` wuerde dann IMMER gewinnen.
-- VERBINDLICHE REGEL: Anwendungscode vergleicht qualitaet/herkunft
-- NIEMALS direkt (keine Literal-/Zahlenvergleiche) -- jede Rang-Logik
-- laeuft AUSSCHLIESSLICH ueber diese Funktion. Ein Code-Review-Guard
-- ("kein direkter qualitaet/herkunft-Vergleich ausserhalb von rang()")
-- ist Teil der Phase-4-Umsetzung (nicht Teil dieser Migration).
--
-- D1 (TD-1, User-Entscheidung, ADR-0005 §24): `herkunft` als SEKUNDAERER
-- Tiebreak -- `rang()` ist composite ueber (qualitaet, herkunft):
-- qualitaet bleibt die PRIMAERE, herkunft die SEKUNDAERE Sortierachse
-- (greift NUR bei qualitaet-Gleichstand). Ohne diesen Tiebreak wuerde bei
-- gleichem qualitaet-Rang implizit "erster Wert gewinnt" gelten
-- (first-writer-abhaengig) -- ein Verstoss gegen M2 ("bitgleich inkl.
-- herkunft", ADR-0005 §3): zwei unterschiedliche Ankunftsreihenfolgen
-- koennten sonst bei gleichem qualitaet-Rang, aber unterschiedlichem
-- herkunft, zu unterschiedlichen Endzustaenden fuehren.
--
-- RUECKGABETYP-ENTSCHEIDUNG (Auftrag: "entscheide + dokumentiere"): EIN
-- skalarer `smallint`-Composite-Wert (qualitaet_rang * 10 + herkunft_rang,
-- Wertebereich 0..33) statt eines Tupel-/Record-Typs -- genau die im ADR-
-- 0005-Sketch (§24) vorgeschlagene Form uebernommen, WEIL sie einen
-- EINZIGEN Skalarvergleich im ON-CONFLICT-WHERE ermoeglicht (`rang(neu) >
-- rang(alt)`), waehrend ein Tupel-/ROW-Typ dort einen composite-Vergleich
-- braeuchte, der bei gleichem Zahlenwert stets korrekt, aber weniger
-- offensichtlich lesbar waere. Der Faktor `* 10` garantiert, dass
-- `qualitaet` IMMER dominiert (herkunft-Rang in {0..3} kann den qualitaet-
-- Rang-Abstand nie ueberschreiten) -- herkunft entscheidet AUSSCHLIESSLICH
-- bei qualitaet-Gleichstand.
--
-- OFFENER PUNKT (nicht Teil dieser Migration, s. finale Antwort): weder
-- measurement.messwert.qualitaet noch .herkunft tragen (seit V0002) ein
-- CHECK-Constraint auf den gueltigen Wertebereich {0,1,2,3}. Ein aus dem
-- Wertebereich fallender Aufruf von rang() liefert NULL (CASE ohne ELSE) --
-- das wuerde die ON-CONFLICT-WHERE-Bedingung als NULL (weder wahr noch
-- falsch) auswerten und den Upsert STILL als No-Op behandeln, statt laut
-- zu scheitern. Da die Funktion bewusst `LANGUAGE sql IMMUTABLE` bleibt
-- (Planner-Inlining-Faehigkeit im Hot-Path, ADR-0005-Sketch-Vorgabe,
-- KEINE Aenderung auf plpgsql/RAISE EXCEPTION hier), ist eine harte
-- Fehlerbehandlung innerhalb der Funktion selbst nicht ohne Abstriche bei
-- dieser Eigenschaft moeglich. Empfehlung fuer eine spaetere, EIGENE
-- Migration (nicht hier beauftragt): CHECK-Constraint auf messwert.
-- qualitaet/herkunft IN (0,1,2,3) -- zur Bestaetigung database-lead/
-- postgres-engineer.
CREATE FUNCTION measurement.rang(p_qualitaet smallint, p_herkunft smallint)
RETURNS smallint IMMUTABLE LANGUAGE sql AS $$
  SELECT
    (CASE p_qualitaet WHEN 2 THEN 3 WHEN 0 THEN 2 WHEN 1 THEN 1 WHEN 3 THEN 0 END) * 10
    + (CASE p_herkunft  WHEN 2 THEN 3 WHEN 0 THEN 2 WHEN 1 THEN 1 WHEN 3 THEN 0 END)
$$;
-- PUBLIC-EXECUTE bewusst NICHT entzogen (analog V0003 Punkt V3b, "reine
-- Hilfsfunktionen lp/canon_event/genesis bleiben bei PUBLIC-EXECUTE"):
-- measurement.rang() ist eine reine, seiteneffektfreie Skalarberechnung
-- ohne Zugriff auf privilegierte Daten -- kein Sicherheitsgewinn durch
-- Einschraenkung, aber Nutzen fuer Tests/Diagnose durch beliebige Rollen.

-- =====================================================================
-- D2 -- measurement.messwert_korrektur_log (append-only, JETZT angelegt)
-- =====================================================================
-- Deckt NUR die ERSTMALIGE Korrektur ab (`korrigiert` ueberschreibt
-- `gemessen`/`geschaetzt`/`ersatzwert`) -- eine "Korrektur der Korrektur"
-- (kein hoeherer Rang als 3 verfuegbar) bleibt Out-of-Scope v1 (ADR-0005
-- §24), gebunden an einen noch nicht existierenden manuellen Korrektur-
-- Workflow. Der append-only-VERTRAG selbst wird dennoch JETZT angelegt
-- (User-Entscheidung D2): DE-03/Art. 5(2) verlangt, dass der
-- Korrekturhistorien-Mechanismus EXISTIERT, bevor je eine reale Korrektur
-- moeglich ist, nicht erst nachtraeglich draufgesetzt.
--
-- Normale Tabelle, KEIN Hypertable (TS-4: v1-Korrektur-Volumen gering,
-- kein Zeitreihen-Sizing-Bedarf -- anders als measurement.messwert selbst).
--
-- `id uuid PRIMARY KEY`: Standard-PK-Konvention (database-migrations.md),
-- ABER NICHT die audit.event-PK-AUSNAHME kopiert (DB-8) -- audit.event hat
-- KEINEN UUID-Primaerschluessel (natuerlicher Ketten-Schluessel (lane,
-- tag_utc, seq) statt UUID-Surrogat, ADR-0003 Abweichung (a)); diese
-- Tabelle hat dagegen SEHR WOHL einen echten UUID-Primaerschluessel `id`,
-- wie von der allgemeinen Regel gefordert.
--
-- `id`-Erzeugung (Abweichung von "App erzeugt UUIDv7, kein DB-Default"):
-- JEDE Zeile dieser Tabelle entsteht AUSSCHLIESSLICH innerhalb des unten
-- stehenden DB-Triggers (kein App-Aufrufer beteiligt an diesem spezifischen
-- INSERT-Pfad) -- die uebliche Begruendung fuer App-seitige UUIDv7
-- (Zeit-/Index-Lokalitaet fuer den dominanten, App-getriebenen Schreibpfad)
-- greift hier nicht. Der Trigger erzeugt `id` selbst per `gen_random_uuid()`
-- (PG16-Core seit PG13, KEIN pgcrypto) -- EXAKT ANALOG zum bereits
-- etablierten Praezedenzfall V0003 Punkt V4 (audit.event_typ_version-Seed-
-- Zeilen: "fuer diese EINMALIGEN ... Zeilen ist die UUIDv4-Alternative
-- ausdruecklich zulaessig, da Einfuege-Reihenfolge/Index-Lokalitaet ...
-- irrelevant ist") -- hier zusaetzlich gestuetzt durch TS-4 (geringes
-- Volumen, seltener Zugriff ueber den Sekundaerindex (messkanal_key, ts),
-- nicht ueber die PK-Einfuegereihenfolge). Kein DB-DEFAULT auf der Spalte
-- selbst (Konvention gewahrt) -- der Wert wird explizit in der INSERT-
-- Anweisung des Triggers gesetzt, analog zum V0003-Seed-Muster.
CREATE TABLE measurement.messwert_korrektur_log (
    id            uuid        PRIMARY KEY,   -- DB-Trigger-erzeugt (gen_random_uuid()), s. Kommentar oben -- KEIN DB-DEFAULT
    messkanal_key integer     NOT NULL,       -- = measurement.messwert.messkanal_key (FK-los, Konvention V0002)
    ts            timestamptz NOT NULL,       -- = measurement.messwert.ts der korrigierten Zeile
    qualitaet_alt smallint    NOT NULL,
    qualitaet_neu smallint    NOT NULL,
    rang_alt      smallint    NOT NULL,       -- measurement.rang(qualitaet_alt, herkunft_alt) zum Korrekturzeitpunkt
    rang_neu      smallint    NOT NULL,       -- measurement.rang(qualitaet_neu, herkunft_neu) zum Korrekturzeitpunkt
    herkunft_alt  smallint    NOT NULL,
    herkunft_neu  smallint    NOT NULL,
    geaendert_at  timestamptz NOT NULL DEFAULT now()
);
-- KEINE wert_alt/wert_neu-Spalten (s. Datei-Kopf, Abweichung vom
-- Auftragstext -- ADR-0005 §24/D2 Datenminimierungs-Entscheidung).
-- KEIN updated_at (append-only -- eine Korrektur-Log-Zeile wird nie
-- nachtraeglich veraendert, s. REVOKE unten).

CREATE INDEX ix_messwert_korrektur_log_kanal_ts
    ON measurement.messwert_korrektur_log (messkanal_key, ts);
-- Begruendung: Zugriffspfad "Korrekturhistorie eines Messwerts/Kanals" --
-- kein spekulativer Index, direkt aus ADR-0005 §24 abgeleitet.

-- Beweismittel-Charakter (append-only, analog audit-Schema-Muster,
-- .claude/rules/database-migrations.md) -- OBWOHL diese Tabelle NICHT im
-- Schema `audit` liegt (Namensraum bleibt `measurement`, s. V0011-Datei-
-- Kopf fuer die Abgrenzung zum separaten `ingest`-Namensraum, der
-- ausdruecklich NICHT unter diese Konvention faellt).
REVOKE UPDATE, DELETE ON measurement.messwert_korrektur_log FROM PUBLIC;

-- Nur INSERT fuer den Ingest-Worker (der Trigger unten laeuft mit
-- Invoker-Rechten, s. dortiger Kommentar -- daher direktes INSERT-Grant
-- noetig, KEIN SECURITY-DEFINER-Umweg). KEIN SELECT/UPDATE/DELETE: der
-- Worker liest seine eigene Korrekturhistorie nicht, schreibt sie nur.
GRANT INSERT ON measurement.messwert_korrektur_log TO edms_ingest_worker;

-- =====================================================================
-- D2 -- Trigger AFTER UPDATE (TS-4: explizit AFTER, nicht BEFORE)
-- =====================================================================
-- AFTER (nicht BEFORE): Postgres fuehrt AFTER-UPDATE-Row-Trigger NUR fuer
-- tatsaechlich AUSGEFUEHRTE Updates aus -- ein durch die WHERE-Bedingung
-- des idempotenten Upserts (rang(EXCLUDED...) > rang(messwert...))
-- VERHINDERTER (No-Op-)Upsert loest KEINEN Trigger-Fire aus (ADR-0005
-- §24). Ein frischer INSERT eines neuen (messkanal_key, ts)-Paares loest
-- ohnehin NIEMALS diesen (AFTER-UPDATE-)Trigger aus -- er feuert
-- ausschliesslich bei tatsaechlichen UPDATE-Ereignissen auf einer bereits
-- existierenden Zeile, strukturell also nie im "frischer Insert"-Regelfall
-- des Live-/Backfill-Pfads.
--
-- ZUSAETZLICHE, defensive Rang-Pruefung IN der Funktion selbst (ueber die
-- reine "AFTER UPDATE feuert nur bei echten Updates"-Garantie hinaus):
-- schreibt NUR dann eine Log-Zeile, wenn NEW tatsaechlich einen HOEHEREN
-- rang() traegt als OLD -- Verteidigung gegen einen etwaigen kuenftigen,
-- direkten UPDATE-Pfad (z. B. ein manueller Korrektur-Workflow, der NICHT
-- ueber die WHERE-gesicherte ON-CONFLICT-Anweisung laeuft), der sonst eine
-- irrefuehrende Log-Zeile fuer eine NICHT-eskalierende Aenderung erzeugen
-- koennte.
CREATE FUNCTION measurement.messwert_korrektur_log_schreiben() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF measurement.rang(NEW.qualitaet, NEW.herkunft) > measurement.rang(OLD.qualitaet, OLD.herkunft) THEN
        INSERT INTO measurement.messwert_korrektur_log (
            id, messkanal_key, ts,
            qualitaet_alt, qualitaet_neu, rang_alt, rang_neu,
            herkunft_alt, herkunft_neu
        ) VALUES (
            gen_random_uuid(), NEW.messkanal_key, NEW.ts,
            OLD.qualitaet, NEW.qualitaet,
            measurement.rang(OLD.qualitaet, OLD.herkunft), measurement.rang(NEW.qualitaet, NEW.herkunft),
            OLD.herkunft, NEW.herkunft
        );
    END IF;
    RETURN NEW;
END;
$$;
-- Nicht SECURITY DEFINER (Invoker-Rechte): alle Referenzen sind bereits
-- schema-qualifiziert (measurement.rang, measurement.messwert_korrektur_
-- log) -- kein search_path-Pinning noetig (analog V0003 Punkt V3, audit.
-- melde_ddl()/pruefe_kette()-Reasoning fuer Nicht-SECURITY-DEFINER-
-- Funktionen ohne unqualifizierte Namensaufloesung).

CREATE TRIGGER trg_messwert_korrektur_log AFTER UPDATE ON measurement.messwert
    FOR EACH ROW EXECUTE FUNCTION measurement.messwert_korrektur_log_schreiben();

-- =====================================================================
-- TS-6 (Auflage) -- Defense-in-Depth auf measurement.messwert
-- =====================================================================
-- Zusaetzlich zur bereits granularen edms_ingest_worker-Rechte-Vergabe
-- (unten): explizites REVOKE auf measurement.messwert selbst. HINWEIS:
-- PostgreSQL vergibt STANDARDMAESSIG KEINERLEI Tabellen-Rechte an PUBLIC
-- (anders als bei Funktionen, s. V0003 Punkt V3b) -- dieses REVOKE ist
-- damit zum jetzigen Zeitpunkt ein No-Op (es gibt nichts zurueckzunehmen,
-- PUBLIC hatte nie UPDATE/DELETE auf dieser Tabelle). Es wird dennoch --
-- wie im Auftrag gefordert (TS-6, Defense-in-Depth) -- EXPLIZIT gesetzt,
-- um die Absicht dauerhaft/dokumentarisch festzuschreiben und gegen einen
-- kuenftigen, versehentlichen `ALTER DEFAULT PRIVILEGES ... TO PUBLIC`
-- an anderer Stelle abzusichern. Ein REVOKE ohne vorhandenes Recht ist in
-- PostgreSQL ein folgenloser No-Op (kein Fehler).
REVOKE DELETE, UPDATE ON measurement.messwert FROM PUBLIC;

-- Ingest-Worker-Grants auf measurement.messwert (ADR-0005 §26.4-Rechte-
-- Matrix: "measurement.messwert | SELECT, INSERT, UPDATE (Upsert-Pfad)").
-- UEBER DEN WOERTLICHEN AUFTRAGSTEXT HINAUS ERGAENZT (bitte im Review
-- pruefen): der Auftrag nennt fuer diese Datei nur "INSERT, UPDATE (kein
-- DELETE)" -- SELECT wird HIER ZUSAETZLICH vergeben, weil der idempotente
-- Upsert (`INSERT ... ON CONFLICT (messkanal_key, ts) DO UPDATE ... WHERE
-- rang(EXCLUDED...) > rang(messwert...)`) im WHERE-Ausdruck lesend auf die
-- BESTEHENDEN Spaltenwerte der Zielzeile (messwert.qualitaet/herkunft)
-- zugreift -- PostgreSQL verlangt fuer referenzierte, nicht per SET
-- geaenderte Spalten in einer UPDATE-Bedingung SELECT-Recht auf der
-- Zieltabelle. Ohne dieses SELECT wuerde der Upsert-Kernpfad des Workers
-- an einem Rechte-Fehler scheitern.
GRANT USAGE ON SCHEMA measurement TO edms_ingest_worker;
GRANT SELECT, INSERT, UPDATE ON measurement.messwert TO edms_ingest_worker;
-- KEIN DELETE (append-only-Charakter von measurement.messwert unveraendert,
-- ADR-0004 §14 Abweichung (d)).
