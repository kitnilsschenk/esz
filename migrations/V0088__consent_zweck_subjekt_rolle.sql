-- V0088__consent_zweck_subjekt_rolle.sql
--
-- Auflage C-11 (`compliance-director`-Votum 2026-09-16 zu ADR-0012 Stufe C):
-- Die Rechtsgrundlagen-Matrix bekommt eine Rollen-Dimension.
--
-- =====================================================================
-- DER FEHLER, DEN DAS BEHEBT
-- =====================================================================
-- Die Gate-Funktion las `energy.nutzungsverhaeltnis.rolle` nicht. Jedes
-- aktive Nutzungsverhaeltnis schaltete auf den Anschlussnutzer-Zweig um —
-- auch bei `rolle = 'eigentuemer_selbstnutzer'`, wo gar kein Dritter
-- beteiligt ist und der Vertrag des Endkunden traegt (V0047/O1 haelt genau
-- fuer diesen Fall den lit.-b-Zweig fuer richtig).
--
-- Die Folge ist die gefaehrlichere Sorte Fehler, weil sie in die falsche
-- Richtung drueckt: Das Gate blockiert einen rechtmaessigen Zaehler, der
-- Betrieb sieht das, legt eine Einwilligungszeile an, damit es weitergeht —
-- und dann steht eine Rechtsgrundlage in der Akte, die es gar nicht braucht
-- und die damit falsch dokumentiert ist. Genau dieser Fehlermodus war der
-- Grund, aus dem der `compliance-director` die erste Fassung von E5
-- abgelehnt hat.
--
-- =====================================================================
-- WARUM EINE EIGENE TABELLE UND KEINE SPALTE IN `zweck_subjekt`
-- =====================================================================
-- `consent.zweck_subjekt` hat den Primaerschluessel `(zweck_code,
-- subjekt_typ)` und zwei weitere Unique-Constraints darauf. Eine dritte
-- Dimension hineinzuziehen hiesse, den Schluessel und beide Constraints
-- umzubauen — an einer Tabelle, die die Rechtsgrundlagen-Wahrheit des
-- gesamten Systems traegt und auf die V0047 mit sorgfaeltig begruendeten
-- Kohaerenz-CHECKs aufsetzt.
--
-- Diese Tabelle ist stattdessen eine AUSNAHMEN-Tabelle: Wer keinen Eintrag
-- hat, faellt auf die allgemeine Regel zurueck. Das hat drei Vorteile:
--   * Der bestehende Bestand bleibt unveraendert gueltig — kein Backfill,
--     keine Umdeutung vorhandener Zeilen.
--   * Die allgemeine Regel bleibt an EINER Stelle lesbar; man muss nicht
--     vier Zeilen vergleichen, um zu sehen, was normalerweise gilt.
--   * Eine Ausnahme ist als Ausnahme sichtbar. Haetten alle Rollen eine
--     eigene Zeile, waere die Sonderbehandlung des Selbstnutzers nicht mehr
--     von den drei Normalfaellen zu unterscheiden.
--
-- =====================================================================
-- WAS DIESE MIGRATION NICHT TUT
-- =====================================================================
-- Sie ruehrt die ABAC-Seite nicht an. `policy-decision-port.ts` fuehrt das
-- Signal `anschlussnutzerAbweichtEndkunde`, definiert als
-- "Rolle ≠ eigentuemer_selbstnutzer" — dieselbe fachliche Unterscheidung,
-- die hier getroffen wird, an einer zweiten Stelle und im Anwendungscode
-- fest verdrahtet.
--
-- Das ist eine bekannte Doppelung, und sie wird hier BENANNT statt
-- stillschweigend verdoppelt: Wer die Rollen-Bedeutung aendert, muss beide
-- Stellen anfassen. Sie zusammenzufuehren waere richtig, ist aber eine
-- eigene Aenderung an der Zugriffskontrolle — und die gehoert nicht als
-- Nebenwirkung in eine Ingest-Gate-Migration.

CREATE TABLE consent.zweck_subjekt_rolle (
    zweck_code      text        NOT NULL,
    subjekt_typ     text        NOT NULL,
    rolle           text        NOT NULL,
    rechtsgrundlage text        NOT NULL,
    erlaubnismodus  text        NOT NULL,
    verweigerbar    boolean     NOT NULL,
    begruendung     text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_zweck_subjekt_rolle PRIMARY KEY (zweck_code, subjekt_typ, rolle),

    -- Die Ausnahme haengt an einer bestehenden allgemeinen Regel. Ohne diesen
    -- Fremdschluessel koennte eine Ausnahme fuer eine Kombination entstehen,
    -- die es gar nicht gibt — und niemand faende sie je wieder.
    CONSTRAINT fk_zweck_subjekt_rolle_basis
        FOREIGN KEY (zweck_code, subjekt_typ)
        REFERENCES consent.zweck_subjekt (zweck_code, subjekt_typ),

    -- Rollen aus energy.nutzungsverhaeltnis.rolle. Bewusst hier wiederholt
    -- statt per Fremdschluessel: `rolle` ist dort eine Spalte mit CHECK, kein
    -- Katalog mit eigener Tabelle.
    CONSTRAINT ck_zweck_subjekt_rolle_wert CHECK (
        rolle IN ('mieter', 'eigentuemer_selbstnutzer', 'gewerbe_nutzer', 'sonstige')
    ),

    -- Dieselben Wertelisten und Kohaerenz-Regeln wie in der allgemeinen
    -- Matrix (V0047). Eine Ausnahme, die andere Regeln kennt als die Regel,
    -- von der sie abweicht, waere keine Ausnahme mehr, sondern ein zweites
    -- System.
    CONSTRAINT ck_zweck_subjekt_rolle_rechtsgrundlage CHECK (
        rechtsgrundlage IN ('einwilligung_art6_1a', 'vertrag_art6_1b')
    ),
    CONSTRAINT ck_zweck_subjekt_rolle_modus CHECK (
        erlaubnismodus IN ('opt_in', 'opt_out', 'vertraglich')
    ),
    CONSTRAINT ck_zweck_subjekt_rolle_einwilligung_kohaerenz CHECK (
        rechtsgrundlage <> 'einwilligung_art6_1a'
        OR (erlaubnismodus = 'opt_in' AND verweigerbar = true)
    ),
    CONSTRAINT ck_zweck_subjekt_rolle_vertrag_kohaerenz CHECK (
        rechtsgrundlage <> 'vertrag_art6_1b'
        OR (erlaubnismodus <> 'opt_in' AND verweigerbar = false)
    )
);

COMMENT ON TABLE consent.zweck_subjekt_rolle IS
  'pii=false; AUSNAHMEN zur allgemeinen Rechtsgrundlagen-Matrix (consent.zweck_subjekt), aufgeschluesselt nach energy.nutzungsverhaeltnis.rolle (Auflage C-11). Wer hier KEINEN Eintrag hat, faellt auf die allgemeine Regel zurueck -- der Bestand bleibt damit unveraendert gueltig, und eine Ausnahme bleibt als Ausnahme erkennbar. Wie die allgemeine Matrix ausschliesslich ueber Migrationen aenderbar (edms_app haelt nur SELECT): Eine Rechtsgrundlage ist nichts, was im laufenden Betrieb entsteht.';

COMMENT ON COLUMN consent.zweck_subjekt_rolle.rolle IS
  'pii=false; Rolle aus energy.nutzungsverhaeltnis.rolle. Sie entscheidet, OB der Anschlussnutzer gegenueber dem Endkunden ein eigenes Datensubjekt ist -- dieselbe Unterscheidung, die die Zugriffskontrolle als `anschlussnutzerAbweichtEndkunde` fuehrt (policy-decision-port.ts). Bekannte Doppelung: Wer die Bedeutung einer Rolle aendert, muss beide Stellen anfassen.';

-- =====================================================================
-- Der eine Fall, den es heute gibt
-- =====================================================================
INSERT INTO consent.zweck_subjekt_rolle
    (zweck_code, subjekt_typ, rolle, rechtsgrundlage, erlaubnismodus, verweigerbar, begruendung)
VALUES
    ('messdaten_verarbeitung', 'anschlussnutzer', 'eigentuemer_selbstnutzer',
     'vertrag_art6_1b', 'vertraglich', false,
     'Der Eigentuemer, der selbst nutzt, ist gegenueber dem Endkunden kein Dritter -- es gibt niemanden, dessen Daten hier zusaetzlich verarbeitet wuerden. Die Rechtsgrundlage ist dieselbe wie beim Endkunden: der Vertrag (Art. 6 Abs. 1 lit. b), nicht eine Einwilligung. Ohne diese Ausnahme verlangte das Ingest-Gate eine lit.-a-Einwilligung, wo der Vertrag traegt -- und der Betrieb legte, um den blockierten Zaehler freizubekommen, eine Einwilligungszeile an, die es nicht braucht und die damit falsch dokumentiert waere (Auflage C-11).');

-- =====================================================================
-- Grants
-- =====================================================================
-- Wie die allgemeine Matrix: die App liest, aendert wird per Migration.
GRANT SELECT ON consent.zweck_subjekt_rolle TO edms_app;

-- Die Gate-Funktion braucht die Ausnahmen-Tabelle UND die Rolle der Zeile.
GRANT SELECT (zweck_code, subjekt_typ, rolle, erlaubnismodus)
    ON consent.zweck_subjekt_rolle TO edms_consent_gate_owner;
GRANT SELECT (system_id, anschlussnutzer_id, gueltig_von, gueltig_bis, rolle)
    ON energy.nutzungsverhaeltnis  TO edms_consent_gate_owner;

-- =====================================================================
-- Die Gate-Funktion wertet die Rolle aus
-- =====================================================================
-- Der Erlaubnismodus wird JE ZEILE bestimmt, nicht mehr einmal fuer alle:
-- In einer WG koennen zwei Anschlussnutzer mit verschiedenen Rollen an
-- derselben Messstelle haengen, und dann gilt fuer jeden seine eigene Regel.
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

    -- C-7: geloescht heisst kein Vertrag mehr.
    IF v_status_ek = 'geloescht' THEN
        RETURN false;
    END IF;

    -- C-8: Bei Sperrgrund lit. b/d gilt die am Sperrvorgang getroffene
    -- Entscheidung ueber die Neuerhebung.
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
    -- SEINE Rolle, sonst die allgemeine Regel. `COALESCE` macht genau das:
    -- kein Eintrag -> allgemeine Regel, und der Bestand bleibt gueltig.
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
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7, C-8, C-11. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner). Bewertet IMMER gegen now() (kein Zeitpunkt-Parameter, C-2). Zweck FEST messdaten_verarbeitung (A12-15). `opt_out` fail-closed false (C-3). GELOESCHT blockiert, GESPERRT nicht -- Art. 18 Abs. 2 nimmt die Speicherung aus (C-7); bei Sperrgrund lit. b/d gilt zusaetzlich die am Sperrvorgang festgehaltene Entscheidung (C-8). Der Erlaubnismodus wird JE ANSCHLUSSNUTZER aus consent.zweck_subjekt_rolle bestimmt, mit Rueckfall auf die allgemeine Matrix (C-11) -- ein eigentuemer_selbstnutzer traegt damit den Vertrag des Endkunden statt eine Einwilligung zu brauchen. NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default).';

