-- Down zu V0088 (Auflage C-11).
--
-- Stellt den Stand nach V0087 wieder her: Funktion OHNE Rollen-Auswertung,
-- keine Ausnahmen-Tabelle.
--
-- ACHTUNG, was der Rueckbau bedeutet: Danach verlangt das Gate fuer einen
-- `eigentuemer_selbstnutzer` wieder eine lit.-a-Einwilligung, obwohl der
-- Vertrag des Endkunden traegt. Das ist genau der Fehlermodus, wegen dem
-- diese Migration entstanden ist — der Betrieb sieht einen blockierten
-- Zaehler und legt eine Einwilligungszeile an, die es nicht braucht. Wer
-- zurueckbaut, sollte das wissen und die Gate-Scharfschaltung so lange
-- ausgeschaltet lassen.
--
-- Reihenfolge umgekehrt zur Anlage: erst die Funktion (sie liest die
-- Tabelle), dann die Grants, dann die Tabelle.

-- =====================================================================
-- (1) Funktionskoerper zurueck auf den V0087-Stand
-- =====================================================================
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
    c_zweck_code  CONSTANT text := 'messdaten_verarbeitung';
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

    IF v_status_ek = 'geloescht' THEN
        RETURN false;
    END IF;

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
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7, C-8. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner). Bewertet IMMER gegen now() (C-2). Zweck FEST messdaten_verarbeitung (A12-15). `opt_out` fail-closed false (C-3). GELOESCHT blockiert, GESPERRT nicht (C-7); bei Sperrgrund lit. b/d gilt die am Sperrvorgang festgehaltene Entscheidung (C-8). Liest energy.nutzungsverhaeltnis.rolle NICHT -- offene Luecke fuer eigentuemer_selbstnutzer (C-4a/C-11). NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default).';


-- =====================================================================
-- (2) Grants zurueck auf den V0087-Umfang
-- =====================================================================
REVOKE SELECT (rolle) ON energy.nutzungsverhaeltnis FROM edms_consent_gate_owner;

-- =====================================================================
-- (3) Tabelle (die Grants darauf verschwinden mit ihr)
-- =====================================================================
DROP TABLE IF EXISTS consent.zweck_subjekt_rolle;
