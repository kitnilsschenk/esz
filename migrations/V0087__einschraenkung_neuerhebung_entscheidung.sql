-- V0087__einschraenkung_neuerhebung_entscheidung.sql
--
-- Auflage C-8 (`compliance-director`-Votum 2026-09-16 zu ADR-0012 Stufe C):
-- Bei einer Art.-18-Sperre mit Grund lit. b oder lit. d ist ausdruecklich zu
-- entscheiden, ob weiter ERHOBEN wird — und die Entscheidung gehoert an den
-- Einschraenkungs-Vorgang.
--
-- =====================================================================
-- WORUM ES GEHT
-- =====================================================================
-- Art. 18 Abs. 2 nimmt die SPEICHERUNG von der Einschraenkung aus. Der
-- Ingest-Schreibpfad ist Erhebung und Speicherung; jede weitergehende
-- Verarbeitung ist ohnehin gesperrt (V0023-Trigger fuer den Berechnungslauf,
-- FJ-07b/c fuer den Nachweis). Fuer die Sperrgruende
--
--   art18_1a_richtigkeit                     (Richtigkeit bestritten)
--   art18_1c_rechtsverteidigung_betroffener  (Person braucht die Daten noch)
--
-- ist Weitermessen deshalb gut begruendet und braucht keine Einzelfallfrage.
--
-- Bei den anderen beiden liegt es anders:
--
--   art18_1b_unrechtmaessig   Die Person sagt: eure Verarbeitung ist
--                             unrechtmaessig. Weiter zu ERHEBEN ist mehr als
--                             das Aufbewahren dessen, was man schon hat.
--   art18_1d_widerspruch      Ein Art.-21-Widerspruch wird gerade geprueft.
--                             Waehrenddessen weiter zu erheben schafft
--                             Fakten, bevor die Frage entschieden ist.
--
-- Art. 18 VERBIETET die Neuerhebung in beiden Faellen nicht. Aber sie soll
-- eine Entscheidung sein und keine stille Fortsetzung — genau das ist der
-- Inhalt der Auflage.
--
-- =====================================================================
-- WARUM EINZELFALL UND KEINE PAUSCHALE REGEL (User-Entscheidung 2026-09-17)
-- =====================================================================
-- Eine pauschale Abschaltung waere konsequent, erzeugt aber eine Datenluecke,
-- und Luecken sind nicht nachtraeglich fuellbar — das Foerderprogramm
-- verlangt ganzjaehrige Messung (TB-04). Wird der Widerspruch
-- zurueckgewiesen, ist die Luecke umsonst entstanden.
--
-- Eine pauschale Fortsetzung wiederum wird lit. b nicht gerecht.
--
-- Die Gruende unterscheiden sich real; eine Regel wird einem von beiden nicht
-- gerecht. Ein dokumentierter Einzelfall ist ausserdem das, was ein Pruefer
-- sehen will: "wir haben es bei jedem Fall entschieden" traegt weiter als
-- "wir haben eine Regel, die meistens passt".
--
-- VORBELEGUNG IST "WEITERMESSEN", aber sie ist keine DB-Vorgabe: Der CHECK
-- unten verlangt bei lit. b/d einen ausdruecklichen Wert. Ein DEFAULT wuerde
-- genau die stille Fortsetzung wieder einfuehren, die die Auflage abstellt —
-- die Oberflaeche darf das Feld vorbelegen, die Datenbank nicht.

ALTER TABLE energy.endkunde
    ADD COLUMN neuerhebung_fortsetzen boolean;

ALTER TABLE energy.anschlussnutzer
    ADD COLUMN neuerhebung_fortsetzen boolean;

COMMENT ON COLUMN energy.endkunde.neuerhebung_fortsetzen IS
  'pii=false; grundlage=Art. 18 Abs. 2 DSGVO; retention=mit dem Endkunden-Datensatz. Ausdrueckliche Entscheidung, ob waehrend einer Art.-18-Sperre mit Grund lit. b oder lit. d WEITER ERHOBEN wird (Auflage C-8). NULL heisst "nicht gefragt" -- zulaessig nur, wenn der Sperrgrund die Frage nicht aufwirft (lit. a/lit. c) oder keine Sperre besteht. Bewusst OHNE DEFAULT: Ein Vorgabewert waere genau die stille Fortsetzung, die diese Spalte abstellen soll.';

COMMENT ON COLUMN energy.anschlussnutzer.neuerhebung_fortsetzen IS
  'pii=false; grundlage=Art. 18 Abs. 2 DSGVO; retention=mit dem Anschlussnutzer-Datensatz. Wie energy.endkunde.neuerhebung_fortsetzen -- s. dort.';

-- Bei lit. b und lit. d MUSS entschieden sein. Bei den uebrigen Gruenden und
-- ohne Sperre bleibt die Spalte frei: Eine Frage, die sich nicht stellt, mit
-- einer Antwort zu fuellen, macht die Akte unschaerfer, nicht genauer.
--
-- ---------------------------------------------------------------------
-- WARUM `NOT VALID` (database-lead-Review 2026-09-17, Befund H/M3)
-- ---------------------------------------------------------------------
-- Die erste Fassung dieser Migration fuegte beide CHECKs SOFORT VALIDIERT
-- hinzu. Das war ein Fehler, und zwar ein nur unter Last sichtbarer: Die
-- neue Spalte hat bewusst keinen Default, Bestandszeilen tragen also NULL.
-- Besteht zum Migrationszeitpunkt auch nur EINE Sperre mit Grund lit. b oder
-- lit. d, bricht die Migration ab mit
--
--     check constraint "ck_endkunde_neuerhebung_entschieden" ... is violated
--
-- Reproduziert im Review gegen eine Kopie des Schemas. In der
-- Entwicklungsumgebung lief sie nur durch, weil dort zufaellig keine solche
-- Sperre bestand -- die Migration war also nicht geprueft, sondern verschont.
--
-- Der Betreiber koennte den Abbruch auch nicht sinnvoll beheben: Die
-- fehlende Angabe IST die Entscheidung, die noch niemand getroffen hat.
-- Sie im Rahmen einer Migration zu erfinden -- per Default, per Backfill --
-- waere genau die stille Fortsetzung, die Auflage C-8 abstellen soll.
--
-- `NOT VALID` loest das richtig herum:
--   * BESTANDSZEILEN bleiben unangetastet und unentschieden. Das Gate
--     behandelt NULL wie "nicht gegen die Erhebung entschieden"
--     (`IS NOT DISTINCT FROM false` weiter unten) -- der Zustand vor dieser
--     Migration bleibt also exakt erhalten, es entsteht keine Messluecke
--     durch ein Schema-Update.
--   * JEDE neue oder geaenderte Zeile wird geprueft. Ein Sperrvorgang ohne
--     Entscheidung ist ab sofort unmoeglich, und eine Bestandszeile kann
--     nicht veraendert werden, ohne die offene Entscheidung nachzuholen.
--
-- Der CHECK bleibt DAUERHAFT `NOT VALID` -- das ist kein Uebergangszustand,
-- den jemand spaeter "aufraeumen" sollte. Ein `VALIDATE CONSTRAINT` wuerde
-- die Bestandszeilen nachtraeglich pruefen und damit denselben Abbruch
-- erzeugen; zulaessig ist es erst, wenn fuer JEDE offene lit.-b-/lit.-d-
-- Sperre eine Entscheidung nachgetragen wurde. Die Abfrage dafuer steht im
-- DO-Block unten.
ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_neuerhebung_entschieden CHECK (
        einschraenkung_grund_code IS NULL
        OR einschraenkung_grund_code NOT IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch')
        OR neuerhebung_fortsetzen IS NOT NULL
    ) NOT VALID;

ALTER TABLE energy.anschlussnutzer
    ADD CONSTRAINT ck_anschlussnutzer_neuerhebung_entschieden CHECK (
        einschraenkung_grund_code IS NULL
        OR einschraenkung_grund_code NOT IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch')
        OR neuerhebung_fortsetzen IS NOT NULL
    ) NOT VALID;

COMMENT ON CONSTRAINT ck_endkunde_neuerhebung_entschieden ON energy.endkunde IS
  'Auflage C-8: Bei Sperrgrund Art. 18 Abs. 1 lit. b (Verarbeitung unrechtmaessig) oder lit. d (Art.-21-Widerspruch anhaengig) muss ausdruecklich entschieden sein, ob weiter ERHOBEN wird. Bei lit. a/lit. c stellt sich die Frage nicht -- Art. 18 Abs. 2 nimmt die Speicherung aus, und der Ingest-Pfad ist Erhebung und Speicherung. DAUERHAFT NOT VALID (database-lead-Review 2026-09-17): Bestandssperren aus der Zeit vor V0087 bleiben unentschieden, jede neue oder geaenderte Zeile wird geprueft. Ein VALIDATE CONSTRAINT ist erst zulaessig, wenn fuer jede offene lit.-b-/lit.-d-Sperre eine Entscheidung nachgetragen wurde -- vorher bricht es ab.';

COMMENT ON CONSTRAINT ck_anschlussnutzer_neuerhebung_entschieden ON energy.anschlussnutzer IS
  'Wie ck_endkunde_neuerhebung_entschieden -- s. dort.';

-- Kein stiller Durchlauf: Wer diese Migration auf einem Bestand faehrt, soll
-- SEHEN, wie viele offene Entscheidungen sie hinterlaesst. Eine WARNING statt
-- einer NOTICE, weil es sich um eine fachliche Aufgabe handelt und nicht um
-- eine Randnotiz -- und ausdruecklich KEIN Abbruch: die Entscheidung gehoert
-- in die Betriebssicht, nicht in ein Migrationsskript.
DO $$
DECLARE
    v_ek integer;
    v_an integer;
BEGIN
    SELECT count(*) INTO v_ek FROM energy.endkunde
     WHERE verarbeitungs_status = 'gesperrt'
       AND einschraenkung_grund_code IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch')
       AND neuerhebung_fortsetzen IS NULL;

    SELECT count(*) INTO v_an FROM energy.anschlussnutzer
     WHERE verarbeitungs_status = 'gesperrt'
       AND einschraenkung_grund_code IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch')
       AND neuerhebung_fortsetzen IS NULL;

    IF v_ek + v_an > 0 THEN
        RAISE WARNING E'Auflage C-8: % Endkunde(n) und % Anschlussnutzer sind mit Grund lit. b oder lit. d gesperrt, ohne dass ueber die weitere Messdaten-Erhebung entschieden wurde.\n'
            '  Die Migration laeuft bewusst durch (CHECK ist NOT VALID) -- das Gate misst fuer diese Faelle unveraendert weiter, wie vor dieser Migration.\n'
            '  Nachzutragen ueber die Betriebssicht. Offene Faelle finden:\n'
            '    SELECT id FROM energy.endkunde WHERE verarbeitungs_status = ''gesperrt'' AND einschraenkung_grund_code IN (''art18_1b_unrechtmaessig'', ''art18_1d_widerspruch'') AND neuerhebung_fortsetzen IS NULL;\n'
            '    (dieselbe Abfrage fuer energy.anschlussnutzer)',
            v_ek, v_an;
    END IF;
END $$;

-- Die Gate-Funktion muss die Spalten lesen koennen.
GRANT SELECT (id, verarbeitungs_status, einschraenkung_grund_code, neuerhebung_fortsetzen)
    ON energy.endkunde        TO edms_consent_gate_owner;
GRANT SELECT (id, verarbeitungs_status, einschraenkung_grund_code, neuerhebung_fortsetzen)
    ON energy.anschlussnutzer TO edms_consent_gate_owner;

-- =====================================================================
-- Die Gate-Funktion wertet die Entscheidung aus
-- =====================================================================
-- `CREATE OR REPLACE` statt einer neuen Funktion: Signatur und Aufrufer
-- bleiben unveraendert, nur der Koerper waechst um die C-8-Pruefung. Die
-- Grants aus V0084 bleiben damit bestehen -- eine neue Funktion haette sie
-- alle neu gebraucht, und genau dabei geht erfahrungsgemaess eines verloren.
-- ---------------------------------------------------------------------
-- EIGENTUEMER-AEQUIVALENZ AUSDRUECKLICH HERSTELLEN
-- (database-lead-Review 2026-09-17, Befund M1)
-- ---------------------------------------------------------------------
-- Die Funktion gehoert seit V0084 der Rolle `edms_consent_gate_owner`.
-- `CREATE OR REPLACE FUNCTION` auf eine fremde Funktion verlangt
-- Eigentuemer-AEQUIVALENZ (`has_privs_of_role`) -- und die ergibt sich aus
-- einer Mitgliedschaft nur, wenn die migrationsfuehrende Rolle INHERIT
-- traegt. Ohne die Zeile unten haengt diese Migration also stillschweigend
-- an einer Eigenschaft der Betriebsrolle, die nirgends garantiert und vom
-- Test-Harness nicht abgedeckt ist: mit `CREATEROLE NOINHERIT` scheitert
-- derselbe Aufruf mit "must be owner of function". Dieselbe Fehlerklasse,
-- die V0084 unter Auflage C-1 fuer `ALTER ... OWNER TO` bereits behoben hat.
--
-- WARUM NICHT `SET ROLE edms_consent_gate_owner` (der naheliegende Weg):
-- Diese Rolle hat auf dem Schema `consent` bewusst KEIN `CREATE` -- V0084
-- haelt sie absichtlich so eng, dass sie dort keine weiteren Objekte anlegen
-- kann. Unter `SET ROLE` scheitert das Ersetzen deshalb an
-- "permission denied for schema consent" (im Review reproduziert). Die enge
-- Fassung der Owner-Rolle ist richtig und bleibt; geaendert wird stattdessen
-- die Annahme ueber die MIGRATIONSROLLE -- aus implizit wird ausdruecklich.
--
-- `CREATE OR REPLACE` statt DROP+CREATE bleibt bewusst: ein DROP nimmt die
-- Grants aus V0084/V0089 mit, und genau dabei geht erfahrungsgemaess einer
-- verloren.
GRANT edms_consent_gate_owner TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;

CREATE OR REPLACE FUNCTION consent.ingest_rechtsgrundlage_wirksam(
    p_zaehler_id uuid
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = consent, pg_temp AS $$
DECLARE
    c_zweck_code  CONSTANT text := 'messdaten_verarbeitung';  -- A12-15: fest, kein Parameter
    -- Die zwei Sperrgruende, bei denen die Neuerhebung eine eigene
    -- Entscheidung ist (Auflage C-8).
    c_gruende_mit_frage CONSTANT text[] := ARRAY['art18_1b_unrechtmaessig', 'art18_1d_widerspruch'];
    v_system_id   uuid;
    v_endkunde_id uuid;
    v_modus_an    text;
    v_modus_ek    text;
    v_status_ek   text;
    v_grund_ek    text;
    v_erhebung_ek boolean;
    v_hat_nutzer  boolean;
    v_alle_an_ok  boolean;
BEGIN
    SELECT s.id, s.endkunde_id, ek.verarbeitungs_status,
           ek.einschraenkung_grund_code, ek.neuerhebung_fortsetzen
      INTO v_system_id, v_endkunde_id, v_status_ek, v_grund_ek, v_erhebung_ek
      FROM energy.zaehler z
      JOIN energy.system s   ON s.id  = z.system_id
      JOIN energy.endkunde ek ON ek.id = s.endkunde_id
     WHERE z.id = p_zaehler_id;

    IF NOT FOUND THEN
        RETURN false;  -- Zaehler nicht aufloesbar: keine Rechtsgrundlage feststellbar (fail-closed).
    END IF;

    -- Auflage C-7: Ein geloeschter Endkunde hat keine Rechtsgrundlage -- der
    -- lit.-b-Zweig besteht kraft VERTRAG, und der endet mit der Loeschung.
    IF v_status_ek = 'geloescht' THEN
        RETURN false;
    END IF;

    -- Auflage C-8: Bei Sperrgrund lit. b/d gilt die getroffene Entscheidung.
    -- Wurde gegen die Neuerhebung entschieden, liefert das Gate `false` --
    -- der Uplink wird verworfen wie bei fehlender Einwilligung.
    --
    -- `IS NOT DISTINCT FROM false` statt `= false`: Der CHECK verlangt bei
    -- diesen Gruenden einen Wert, aber diese Funktion soll auch dann richtig
    -- antworten, wenn eine Zeile aus einer Zeit vor V0087 stammt oder der
    -- CHECK spaeter gelockert wuerde. Ein NULL heisst dann "nicht
    -- entschieden" und blockiert NICHT -- die Entscheidung gehoert an den
    -- Sperrvorgang, nicht in eine Vermutung dieser Funktion.
    IF v_status_ek = 'gesperrt'
       AND v_grund_ek = ANY (c_gruende_mit_frage)
       AND v_erhebung_ek IS NOT DISTINCT FROM false THEN
        RETURN false;
    END IF;

    SELECT zs.erlaubnismodus INTO v_modus_an
      FROM consent.zweck_subjekt zs
     WHERE zs.zweck_code = c_zweck_code AND zs.subjekt_typ = 'anschlussnutzer';

    SELECT zs.erlaubnismodus INTO v_modus_ek
      FROM consent.zweck_subjekt zs
     WHERE zs.zweck_code = c_zweck_code AND zs.subjekt_typ = 'endkunde';

    IF v_modus_an IS NULL OR v_modus_ek IS NULL THEN
        RETURN false;  -- kein Matrix-Eintrag -> keine Rechtsgrundlage bekannt (fail-closed).
    END IF;

    -- Aktive Nutzungsverhaeltnisse GENAU JETZT (`now()`, A12-12). WG-Fall
    -- (A12-16/17): `bool_and(...)` verlangt eine wirksame Rechtsgrundlage fuer
    -- JEDEN aktiven Anschlussnutzer. C-7: ein geloeschter blockiert (Term
    -- INNERHALB des bool_and, nicht als Filter). C-8: ebenso einer, bei dem
    -- gegen die Neuerhebung entschieden wurde.
    SELECT count(*) > 0,
           bool_and(
               an.verarbeitungs_status <> 'geloescht'
               AND NOT (
                   an.verarbeitungs_status = 'gesperrt'
                   AND an.einschraenkung_grund_code = ANY (c_gruende_mit_frage)
                   AND an.neuerhebung_fortsetzen IS NOT DISTINCT FROM false
               )
               AND CASE v_modus_an
                   WHEN 'vertraglich' THEN true
                   WHEN 'opt_out'     THEN false
                   WHEN 'opt_in'      THEN EXISTS (
                       SELECT 1 FROM consent.einwilligung e
                        WHERE e.anschlussnutzer_id = n.anschlussnutzer_id
                          AND e.zweck_code = c_zweck_code
                          AND e.erteilt_at <= now()
                          AND (e.widerrufen_at IS NULL OR e.widerrufen_at > now())
                   )
               END
           )
      INTO v_hat_nutzer, v_alle_an_ok
      FROM energy.nutzungsverhaeltnis n
      JOIN energy.anschlussnutzer an ON an.id = n.anschlussnutzer_id
     WHERE n.system_id = v_system_id
       AND n.gueltig_von <= now()
       AND (n.gueltig_bis IS NULL OR n.gueltig_bis > now());

    IF v_hat_nutzer THEN
        RETURN COALESCE(v_alle_an_ok, false);
    END IF;

    -- Kein aktives Nutzungsverhaeltnis: der Endkunde selbst ist Subjekt.
    -- Auflage C-3: `opt_out` eigener, fail-closed Zweig.
    RETURN CASE v_modus_ek
        WHEN 'vertraglich' THEN true
        WHEN 'opt_out'     THEN false
        WHEN 'opt_in'      THEN EXISTS (
            SELECT 1 FROM consent.einwilligung e
             WHERE e.endkunde_id = v_endkunde_id
               AND e.zweck_code = c_zweck_code
               AND e.erteilt_at <= now()
               AND (e.widerrufen_at IS NULL OR e.widerrufen_at > now())
        )
    END;
END;
$$;

COMMENT ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) IS
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7, C-8. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner). Bewertet IMMER gegen now() (kein Zeitpunkt-Parameter, C-2). Zweck FEST messdaten_verarbeitung (A12-15). `opt_out` fail-closed false (C-3). GELOESCHT blockiert, GESPERRT nicht -- Art. 18 Abs. 2 nimmt die Speicherung aus (C-7). Bei Sperrgrund Art. 18 Abs. 1 lit. b/d gilt zusaetzlich die am Sperrvorgang festgehaltene Entscheidung ueber die Neuerhebung (C-8). Liest energy.nutzungsverhaeltnis.rolle NICHT -- offene Luecke fuer eigentuemer_selbstnutzer (C-4a/C-11). NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default).';

