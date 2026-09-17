-- V0090__gate_nachbesserung_database_lead_review.sql
--
-- Nachbesserungen aus dem `database-lead`-Review der Migrationen V0084-V0089
-- (2026-09-17). Das Review war im Kopf von V0084 ausdruecklich als
-- nachzuholen vermerkt; diese Migration traegt seine Befunde nach, soweit sie
-- nicht schon in V0087/V0088 selbst repariert wurden (NOT VALID, INHERIT).
--
-- Fuenf Punkte, in der Reihenfolge ihres Gewichts:
--
--   (1) Index fuer den heissen Pfad des Gates. Ohne ihn liest die Funktion je
--       Aufruf die gesamte Nutzungs-HISTORIE eines Systems.
--   (2) Die Enumeration der Zaehler eines Subjekts wandert aus der Anwendung
--       in eine eigene SECURITY-DEFINER-Funktion -- `edms_app` hat auf
--       `energy.*` keinerlei Rechte, die Auflage C-10 war unter dem eigenen
--       Rollenmodell des Projekts gar nicht lauffaehig.
--   (3) Die Gate-Funktion wird `STABLE` (sie liest nur).
--   (4) Der Endkunden-Zweig bekommt ein `ELSE false` -- bisher konnte er
--       theoretisch `NULL` liefern, und `NULL` bedeutet an den beiden
--       Auswertungsstellen VERSCHIEDENES.
--   (5) Der C-8-CHECK wird symmetrisch: eine Entscheidung dort, wo sich die
--       Frage nicht stellt, ist kuenftig unzulaessig.

-- =====================================================================
-- (1) Index fuer die Nutzungsverhaeltnis-Aufloesung im Gate
-- =====================================================================
-- Das Gate fragt je Uplink:
--
--     WHERE n.system_id = <system>
--       AND n.gueltig_von <= now()
--       AND (n.gueltig_bis IS NULL OR n.gueltig_bis > now())
--
-- Der einzige bis hierher passende Index ist `ix_nutzung_system_aktiv`
-- (V0002) -- PARTIELL mit `WHERE gueltig_bis IS NULL`. Er deckt damit genau
-- die Haelfte der aktiven Zeilen NICHT ab: ein Nutzungsverhaeltnis mit
-- bereits gesetztem, aber noch ZUKUENFTIGEM Ende ist aktiv und fehlt ihm.
-- Der Planer weicht deshalb auf den GiST-Index der EXCLUDE-Constraint
-- `ex_nutzung_no_overlap` aus, dessen fuehrende Spalte `anschlussnutzer_id`
-- ist -- fuer eine Suche nach `system_id` ist er praktisch blind.
--
-- Im Review gemessen (160.000 Zeilen, 20.000 Systeme, je 1 laufendes,
-- 1 zukuenftig endendes und 6 historische Nutzungsverhaeltnisse):
--
--     ohne diesen Index   1348 Buffer fuer 2 gefundene Zeilen,  2,85 ms
--     mit diesem Index      15 Buffer,                          0,13 ms
--     2000 Gate-Aufrufe:  463 ms  ->  141 ms
--
-- Der eigentliche Punkt ist nicht die Millisekunde, sondern die Ordnung:
-- `energy.nutzungsverhaeltnis` wird nie geleert (die Historie ist der
-- Nachweis). Ohne Index waechst die je Uplink gelesene Zeilenzahl mit der
-- Mieterhistorie des Systems -- der Messpfad wuerde also langsamer, je
-- laenger die Anlage laeuft.
--
-- KEIN partieller Index mit `WHERE gueltig_bis IS NULL OR gueltig_bis >
-- now()`: `now()` ist STABLE, nicht IMMUTABLE, und in einem Index-Praedikat
-- unzulaessig. Genau diese Falle hat `ix_nutzung_system_aktiv` gestellt.
--
-- `gueltig_von` ist mit aufgenommen (gemessen 114 ms gegen 122 ms bei
-- `(system_id, gueltig_bis)`): die dritte Spalte laesst den Index auch die
-- Von-Bedingung tragen. 7,8 MB bei 160.000 Zeilen -- gegenueber 30 MB fuer
-- den GiST, den er in diesem Zugriffspfad ersetzt.
CREATE INDEX ix_nutzung_system_gueltigkeit
    ON energy.nutzungsverhaeltnis (system_id, gueltig_von, gueltig_bis);

COMMENT ON INDEX energy.ix_nutzung_system_gueltigkeit IS
  'Zugriffspfad des Ingest-Gates (consent.ingest_rechtsgrundlage_wirksam, V0084): System -> aktive Nutzungsverhaeltnisse. Bewusst NICHT partiell -- ix_nutzung_system_aktiv (V0002, WHERE gueltig_bis IS NULL) laesst die Zeilen mit zukuenftigem Ende aus und ist fuer diese Abfrage deshalb unbrauchbar. Angelegt V0090 nach dem database-lead-Review 2026-09-17 (gemessen: 1348 -> 15 Buffer je Gate-Aufruf).';

-- =====================================================================
-- (2)-(4) Die Gate-Funktion
-- =====================================================================
-- Zur Rolle unten: dieselbe Begruendung wie in V0087/V0088. `CREATE OR
-- REPLACE` auf eine fremde Funktion verlangt Eigentuemer-Aequivalenz, die
-- aus einer Mitgliedschaft nur mit INHERIT folgt. Ausdrueckliche Zusicherung
-- statt stiller Annahme. `SET ROLE` waere der falsche Weg -- die Owner-Rolle
-- hat auf dem Schema `consent` bewusst kein CREATE.
GRANT edms_consent_gate_owner TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;

-- ---------------------------------------------------------------------
-- (3) STABLE statt VOLATILE, (4) ELSE false im Endkunden-Zweig
-- ---------------------------------------------------------------------
-- STABLE: Die Funktion schreibt nichts und liefert innerhalb einer Anweisung
-- fuer dieselben Argumente dasselbe Ergebnis -- sie wertet gegen `now()` aus,
-- also die Transaktionszeit. VOLATILE war schlicht der Default, keine
-- Entscheidung; er zwingt den Planer, die Funktion je Zeile neu auszuwerten
-- und verbietet ihm jede Umstellung.
--
-- ELSE false: Der Endkunden-Zweig endete in einem `CASE` ohne `ELSE`. Faellt
-- `v_modus_ek` je aus der Werteliste (heute verhindert `ck_zweck_subjekt_
-- modus` das -- aber dieses Repo verlaesst sich nirgends auf EINE Kontrolle,
-- s. `toVerarbeitungsStatus()`), liefert `CASE` dann `NULL`.
--
-- Und `NULL` ist hier nicht bloss unschoen, sondern zweideutig -- die beiden
-- Auswerter lesen es GEGENSAETZLICH:
--
--   ConsentGateRepository:  `rows[0]?.wirksam ?? false`      -> verwirft
--   C-10-Zaehlung:          `WHERE NOT <fn>` (NOT NULL = NULL) -> zaehlt den
--                           Zaehler als MIT Grundlage
--
-- Der Worker wuerde den Uplink also verwerfen, waehrend das Audit-Log
-- ausweist, es sei nichts betroffen: falsch, und zwar in der beruhigenden
-- Richtung. Die Anwendungsseite ist bereits gehaertet (COALESCE in
-- `zaehleZaehlerOhneRechtsgrundlage`); hier kommt die Datenbankseite dazu,
-- damit `NULL` gar nicht erst entstehen kann.
--
-- Der Anschlussnutzer-Zweig war nie betroffen: `COALESCE(v_alle_an_ok,
-- false)` faengt ihn seit V0084 ab. Genau diese Asymmetrie war der Hinweis,
-- dass es sich um ein Versehen handelt und nicht um eine Entscheidung.
CREATE OR REPLACE FUNCTION consent.ingest_rechtsgrundlage_wirksam(
    p_zaehler_id uuid
) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = consent, pg_temp AS $$
DECLARE
    c_zweck_code  CONSTANT text := 'messdaten_verarbeitung';  -- A12-15: fest, kein Parameter
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
        RETURN false;
    END IF;

    -- C-7: geloescht heisst kein Vertrag mehr.
    IF v_status_ek = 'geloescht' THEN
        RETURN false;
    END IF;

    -- C-8: Bei Sperrgrund lit. b/d gilt die am Sperrvorgang getroffene
    -- Entscheidung ueber die Neuerhebung. NULL (Bestandszeile vor V0087)
    -- blockiert NICHT -- der Zustand vor der Einfuehrung bleibt erhalten.
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
        RETURN false;
    END IF;

    -- C-11: Der Erlaubnismodus je Anschlussnutzer ist die Ausnahme fuer
    -- SEINE Rolle, sonst die allgemeine Regel.
    SELECT count(*) > 0,
           bool_and(
               an.verarbeitungs_status <> 'geloescht'
               AND NOT (
                   an.verarbeitungs_status = 'gesperrt'
                   AND an.einschraenkung_grund_code = ANY (c_gruende_mit_frage)
                   AND an.neuerhebung_fortsetzen IS NOT DISTINCT FROM false
               )
               AND CASE COALESCE(
                       (SELECT zsr.erlaubnismodus
                          FROM consent.zweck_subjekt_rolle zsr
                         WHERE zsr.zweck_code  = c_zweck_code
                           AND zsr.subjekt_typ = 'anschlussnutzer'
                           AND zsr.rolle       = n.rolle),
                       v_modus_an)
                   WHEN 'vertraglich' THEN true
                   WHEN 'opt_out'     THEN false
                   WHEN 'opt_in'      THEN EXISTS (
                       SELECT 1 FROM consent.einwilligung e
                        WHERE e.anschlussnutzer_id = n.anschlussnutzer_id
                          AND e.zweck_code = c_zweck_code
                          AND e.erteilt_at <= now()
                          AND (e.widerrufen_at IS NULL OR e.widerrufen_at > now())
                   )
                   ELSE false   -- V0090: unbekannter Modus blockiert, s. Kopf
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
        ELSE false   -- V0090: NIE NULL zurueckgeben, s. Kopf dieser Migration
    END;
END;
$$;

COMMENT ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) IS
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7, C-8, C-11. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner), seit V0090 STABLE. Bewertet IMMER gegen now() (kein Zeitpunkt-Parameter, C-2 -- Begruendung: risk-register R-0009). Zweck FEST messdaten_verarbeitung (A12-15). Liefert NIE NULL: beide CASE-Zweige haben seit V0090 ein ELSE false (database-lead-Review 2026-09-17). GELOESCHT blockiert, GESPERRT nicht (C-7); bei Sperrgrund lit. b/d gilt die am Sperrvorgang festgehaltene Entscheidung (C-8), eine fehlende Entscheidung aus der Zeit vor V0087 blockiert NICHT. Rollen-Ausnahmen aus consent.zweck_subjekt_rolle (C-11). Zugriffspfad-Index: energy.ix_nutzung_system_gueltigkeit (V0090). NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default).';

-- =====================================================================
-- (2) Die Zaehlung der betroffenen Zaehler wandert in die Datenbank
-- =====================================================================
-- BEFUND: Die Auflage C-10 (Wirkung eines Widerrufs belegen) zaehlt die
-- Zaehler eines Subjekts ohne Rechtsgrundlage. Diese Zaehlung stand als SQL
-- in `ConsentRepository` und enumerierte dafuer `energy.zaehler`,
-- `energy.system` und `energy.nutzungsverhaeltnis` -- Tabellen, auf die
-- `edms_app` KEINERLEI Rechte hat, in keiner der 89 vorhergehenden
-- Migrationen. Im Review verifiziert:
--
--     SET ROLE edms_app; SELECT ... FROM energy.zaehler ...
--     ERROR:  permission denied for table zaehler
--
-- Dass es bisher lief, liegt allein daran, dass die Anwendung in Entwicklung
-- und Test als `edms` verbindet -- und `edms` ist Superuser. Das gesamte
-- Least-Privilege-Modell um `edms_app` ist dort ausgehebelt; C-10 waere am
-- Tag der Umstellung ausgefallen.
--
-- KORREKTUR DES V0089-KOMMENTARS: Dort steht als Begruendung fuer das
-- `GRANT EXECUTE ... TO edms_app`, die Funktion sei "ein Boolean-Orakel ueber
-- Daten, die `edms_app` ohnehin direkt lesen darf". Das ist zur Haelfte
-- falsch. Fuer `consent.*` stimmt es (dort hat die Rolle SELECT); fuer
-- `energy.*` nicht -- die Funktion trifft sehr wohl eine Aussage ueber
-- Zustaende, die `edms_app` nicht lesen darf. V0089 ist angewendet und wird
-- nicht rueckwirkend umgeschrieben; diese Migration nimmt der falschen
-- Begruendung stattdessen ihren Gegenstand, indem sie das Recht wieder
-- entzieht.
--
-- ZWEI WEGE waren moeglich: `edms_app` spaltenscharfe SELECT-Rechte auf die
-- drei energy-Tabellen geben, ODER die Enumeration selbst hinter eine
-- SECURITY-DEFINER-Funktion legen. Der zweite Weg ist der richtige und
-- derselbe, aus dem das Gate ueberhaupt existiert: Ueber die Grenze geht die
-- ANTWORT, nicht die Datenbasis. Am Ende steht EINE Zahl statt einer
-- Zaehlerliste -- was auch A12-13 entspricht, wonach das Audit-Log kein
-- zweites Bestandsverzeichnis werden darf.
CREATE FUNCTION consent.zaehle_zaehler_ohne_rechtsgrundlage(
    p_subjekt_typ text,
    p_subjekt_id  uuid
) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = consent, pg_temp AS $$
DECLARE
    v_anzahl integer;
BEGIN
    IF p_subjekt_typ = 'endkunde' THEN
        -- Der Endkunde ist Vertragspartner des Systems, unabhaengig davon,
        -- wer darin wohnt.
        SELECT count(*) INTO v_anzahl
          FROM energy.zaehler z
          JOIN energy.system s ON s.id = z.system_id
         WHERE s.endkunde_id = p_subjekt_id
           AND NOT consent.ingest_rechtsgrundlage_wirksam(z.id);

    ELSIF p_subjekt_typ = 'anschlussnutzer' THEN
        -- Nur AKTIVE Nutzungsverhaeltnisse: fuer ein System, das der
        -- Anschlussnutzer nicht mehr nutzt, hat sein Widerruf keine Wirkung
        -- mehr -- es mitzuzaehlen bliese die Zahl mit fremden Zaehlern auf.
        --
        -- `DISTINCT` ist defensiv, nicht notwendig: `ex_nutzung_no_overlap`
        -- laesst zwei gleichzeitig gueltige Nutzungsverhaeltnisse desselben
        -- Anschlussnutzers am selben System nicht zu (im Review geprueft).
        -- Er bleibt, weil er nichts kostet und die Zahl richtig haelt, falls
        -- die Constraint je gelockert wird.
        SELECT count(*) INTO v_anzahl
          FROM (
              SELECT DISTINCT z.id
                FROM energy.zaehler z
                JOIN energy.system s ON s.id = z.system_id
                JOIN energy.nutzungsverhaeltnis n ON n.system_id = s.id
               WHERE n.anschlussnutzer_id = p_subjekt_id
                 AND n.gueltig_von <= now()
                 AND (n.gueltig_bis IS NULL OR n.gueltig_bis > now())
          ) z
         WHERE NOT consent.ingest_rechtsgrundlage_wirksam(z.id);

    ELSE
        -- Kein stilles 0. Eine 0 hiesse "kein Zaehler betroffen" und landete
        -- so im Audit-Log -- bei einem Tippfehler im Subjekttyp waere das
        -- eine falsche Aussage ueber die Wirkung eines Betroffenenrechts.
        RAISE EXCEPTION 'Unbekannter Subjekttyp: %. Zulaessig sind endkunde und anschlussnutzer.', p_subjekt_typ
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    RETURN COALESCE(v_anzahl, 0);
END;
$$;

-- Eigentumsuebertragung -- Muster und Begruendung wortgleich zu V0084,
-- Auflage C-1: `ALTER FUNCTION ... OWNER TO` verlangt, dass die NEUE
-- Owner-Rolle CREATE auf dem Zielschema besitzt (sonst waere der
-- Owner-Wechsel ein Weg, etwas zu tun, das ein direktes DROP+CREATE unter
-- der neuen Rolle nicht koennte). `edms_consent_gate_owner` hat auf
-- `consent` bewusst nur USAGE. Also: kurz gewaehren, uebertragen, sofort
-- wieder entziehen.
--
-- Diese drei Zeilen fehlten in der ersten Fassung von V0090. Aufgefallen
-- ist es NICHT beim Anwenden gegen die Entwicklungsdatenbank -- dort
-- verbindet `edms` als Superuser, und ein Superuser umgeht die Pruefung
-- lautlos. Gemeldet hat es der Integrationstest, der die gesamte Kette
-- unter einer echten Nicht-Superuser-Migrationsrolle faehrt (Auflage C-1):
--
--     [ERROR] Fehlgeschlagen: V0090 ... permission denied for schema consent
--
-- Genau dafuer gibt es diesen Testaufbau -- und genau das ist auch der
-- Befund, den dieses Review an anderer Stelle festhaelt: Entwicklung und
-- Test verbinden als Superuser, das Rollenmodell ist dort unsichtbar.
GRANT CREATE ON SCHEMA consent TO edms_consent_gate_owner;

ALTER FUNCTION consent.zaehle_zaehler_ohne_rechtsgrundlage(text, uuid)
    OWNER TO edms_consent_gate_owner;

REVOKE CREATE ON SCHEMA consent FROM edms_consent_gate_owner;

COMMENT ON FUNCTION consent.zaehle_zaehler_ohne_rechtsgrundlage(text, uuid) IS
  'Auflage C-10: zaehlt die Zaehler eines Subjekts, fuer die aktuell KEINE Rechtsgrundlage besteht -- gemessen ueber dieselbe Funktion, die der Ingest-Worker fragt. Liefert EINE ZAHL, nie eine Zaehlerliste (A12-13). SECURITY DEFINER, weil edms_app auf energy.* keine Rechte hat und auch keine bekommen soll: ueber die Rollengrenze geht die Antwort, nicht die Datenbasis. Angelegt V0090 nach dem database-lead-Review 2026-09-17; ersetzt die vorherige Enumeration in ConsentRepository, die unter edms_app mit "permission denied for table zaehler" gescheitert waere.';

REVOKE EXECUTE ON FUNCTION consent.zaehle_zaehler_ohne_rechtsgrundlage(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION consent.zaehle_zaehler_ohne_rechtsgrundlage(text, uuid) TO edms_app;

-- Das direkte Gate-Recht braucht `edms_app` damit nicht mehr. Es war mit
-- einer unzutreffenden Begruendung erteilt worden (s. o.) und geht zurueck.
-- `edms_ingest_worker` behaelt seines -- er IST der Grund, aus dem die
-- Funktion existiert.
REVOKE EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) FROM edms_app;

-- =====================================================================
-- (5) Der C-8-CHECK wird symmetrisch
-- =====================================================================
-- Bisher verlangte er einen Wert, wo die Frage sich stellt -- verbot aber
-- keinen, wo sie sich NICHT stellt. Die Datenbank nahm also eine Entscheidung
-- entgegen, die nie gelten kann (im Review geprueft). Sie ist wirkungslos,
-- weil das Gate sie bei lit. a/lit. c gar nicht liest, aber sie steht in der
-- Akte und behauptet etwas. Das Nullen beim Entsperren und beim Shred
-- geschieht bisher ausschliesslich anwendungsseitig; dieses Repo verlaesst
-- sich an vergleichbarer Stelle nicht auf EINE Kontrolle (V0023-Trigger als
-- struktureller Zweitpfad).
--
-- `NOT VALID` aus demselben Grund wie in V0087: Bestandszeilen werden nicht
-- nachtraeglich geprueft, jede neue oder geaenderte Zeile schon.
ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_neuerhebung_nur_bei_frage CHECK (
        neuerhebung_fortsetzen IS NULL
        OR (einschraenkung_grund_code IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch'))
    ) NOT VALID;

ALTER TABLE energy.anschlussnutzer
    ADD CONSTRAINT ck_anschlussnutzer_neuerhebung_nur_bei_frage CHECK (
        neuerhebung_fortsetzen IS NULL
        OR (einschraenkung_grund_code IN ('art18_1b_unrechtmaessig', 'art18_1d_widerspruch'))
    ) NOT VALID;

COMMENT ON CONSTRAINT ck_endkunde_neuerhebung_nur_bei_frage ON energy.endkunde IS
  'Gegenstueck zu ck_endkunde_neuerhebung_entschieden (V0087): Eine Entscheidung ueber die weitere Erhebung darf nur dort stehen, wo sich die Frage stellt -- also bei Sperrgrund lit. b oder lit. d. Beim Aufheben der Einschraenkung und beim Krypto-Shred wird die Spalte zusammen mit dem Grund genullt; dieser CHECK ist der strukturelle Zweitpfad dazu, damit das Nullen nicht allein an der Anwendungsdisziplin haengt (database-lead-Review 2026-09-17).';

COMMENT ON CONSTRAINT ck_anschlussnutzer_neuerhebung_nur_bei_frage ON energy.anschlussnutzer IS
  'Wie ck_endkunde_neuerhebung_nur_bei_frage -- s. dort.';
