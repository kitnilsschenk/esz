-- Down zu V0090 (Nachbesserungen aus dem database-lead-Review).
--
-- Stellt den Stand nach V0089 wieder her. Reihenfolge umgekehrt zur Anlage:
-- erst die Constraints, dann die Rechte und die Zaehlfunktion, dann die
-- Gate-Funktion, zuletzt der Index.
--
-- ACHTUNG, was der Rueckbau bedeutet -- drei Dinge, die nicht beilaeufig
-- sind:
--
--   1. Die Zaehlfunktion verschwindet, und `edms_app` bekommt stattdessen
--      das direkte Gate-Recht zurueck. Die Anwendung muss dann WIEDER die
--      Enumeration ueber `energy.*` selbst fahren -- was unter `edms_app`
--      mit "permission denied for table zaehler" scheitert. Nach diesem
--      Rueckbau laeuft Auflage C-10 also nur noch, solange die Anwendung als
--      Superuser verbindet. Der zugehoerige Anwendungscode
--      (`ConsentRepository.zaehleZaehlerOhneRechtsgrundlage`) ist auf die
--      Funktion umgestellt und muesste mit zurueckgebaut werden.
--   2. Die Gate-Funktion wird wieder VOLATILE und kann wieder NULL liefern.
--      NULL bedeutet fuer Worker und Audit-Zaehlung GEGENSAETZLICHES -- s.
--      Kopf der Up-Migration.
--   3. Ohne den Index liest das Gate je Uplink wieder die gesamte
--      Nutzungs-Historie des Systems (gemessen: 1348 statt 15 Buffer).
--
-- Wer zurueckbaut, sollte das wissen und die Gate-Scharfschaltung so lange
-- ausgeschaltet lassen.

-- Eigentuemer-Aequivalenz ausdruecklich zusichern (s. V0087/V0088) -- ganz
-- oben, weil schon das DROP der Zaehlfunktion sie braucht: sie gehoert
-- `edms_consent_gate_owner`, nicht der migrationsfuehrenden Rolle.
GRANT edms_consent_gate_owner TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;

-- =====================================================================
-- (1) Symmetrie-Constraints
-- =====================================================================
ALTER TABLE energy.endkunde        DROP CONSTRAINT IF EXISTS ck_endkunde_neuerhebung_nur_bei_frage;
ALTER TABLE energy.anschlussnutzer DROP CONSTRAINT IF EXISTS ck_anschlussnutzer_neuerhebung_nur_bei_frage;

-- =====================================================================
-- (2) Zaehlfunktion und Rechte zurueck auf den V0089-Stand
-- =====================================================================
GRANT EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) TO edms_app;

DROP FUNCTION IF EXISTS consent.zaehle_zaehler_ohne_rechtsgrundlage(text, uuid);

-- =====================================================================
-- (3) Gate-Funktion zurueck auf den V0088-Stand (VOLATILE, ohne ELSE)
-- =====================================================================
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
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7, C-8, C-11. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner). Bewertet IMMER gegen now() (C-2). Zweck FEST messdaten_verarbeitung (A12-15). GELOESCHT blockiert, GESPERRT nicht (C-7); bei Sperrgrund lit. b/d gilt die am Sperrvorgang festgehaltene Entscheidung (C-8). Rollen-Ausnahmen aus consent.zweck_subjekt_rolle (C-11). NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default).';

-- =====================================================================
-- (4) Index
-- =====================================================================
DROP INDEX IF EXISTS energy.ix_nutzung_system_gueltigkeit;
