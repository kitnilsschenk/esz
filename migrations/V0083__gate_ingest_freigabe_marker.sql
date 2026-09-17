-- V0083__gate_ingest_freigabe_marker.sql
--
-- Der Gate-Marker fuer den Betrieb mit echten Personendaten.
-- Umsetzung von ADR-0008 §22 / offener Punkt C3 (Folgeauftrag `devops-lead`).
--
-- =====================================================================
-- WAS HIER GELOEST WIRD
-- =====================================================================
-- `EDMS_SYNTHETIC_ONLY=false` ist der Moment, in dem echte Personendaten ins
-- System duerfen. ADR-0008 §22 verlangt dafuer Gate-Marker und stellt
-- ausdruecklich klar, dass sie NICHT als "selbst-attestierte Config-Flags"
-- existieren duerfen. Eine Umgebungsvariable behauptet, die DSFA sei fertig
-- und der AVV geschlossen — und jeder, der Umgebungsvariablen setzen kann,
-- kann das behaupten, ohne Spur.
--
-- =====================================================================
-- WARUM DER MARKER IN DER DATENBANK LIEGT UND NICHT IM REPOSITORY
-- =====================================================================
-- Dies ist der Punkt, an dem eine naheliegende Loesung falsch gewesen waere.
--
-- Das Repository erscheint unter Apache-2.0. Die Compliance-Akte
-- (`compliance/**`) ist vom Public-Export ausgeschlossen — sie gehoert KIT
-- Consulting als BETREIBER, nicht dem Produkt. Wer diese Software einsetzt,
-- hat seinen EIGENEN AVV, seine EIGENE DSFA, seinen eigenen Hoster.
--
-- Ein Riegel, der gegen UNSERE Aktenstaende prueft, waere fuer jeden anderen
-- Betreiber sinnlos bis schaedlich: Er blockierte dessen rechtmaessigen
-- Betrieb, weil ER unsere Unterlagen nicht hat. Der Marker liegt deshalb in
-- der Datenbank DES JEWEILIGEN BETREIBERS und traegt DESSEN Nachweise. So
-- traegt der Mechanismus fuer jeden, der die Software einsetzt, statt nur
-- fuer uns.
--
-- (Der Bericht `tools/ci/ingest-gate-status.mjs` prueft demgegenueber
-- ausdruecklich NUR den Aktenstand eines Betreibers und sagt das auch, wenn
-- keine Akte vorliegt. Er ist ein Betreiber-Werkzeug, kein Produktteil.)
--
-- =====================================================================
-- WAS DER MARKER KANN UND WAS NICHT
-- =====================================================================
-- Er verifiziert NICHTS. Ein AVV ist ein Vertrag; keine Software kann
-- feststellen, ob er existiert. Wer so tut, baut eine Attrappe — und eine
-- Schein-Verifikation ist schlimmer als eine offene Luecke, weil sie das
-- Vertrauen erzeugt, das sie nicht verdient.
--
-- Was er leistet: Er haelt eine ERKLAERUNG fest — wer hat wann, unter Verweis
-- auf welches Dokument, und gegen welchen Aktenstand erklaert, dass die
-- Voraussetzungen vorliegen. Unveraenderlich, mit Audit-Ereignis in der
-- Hash-Kette. Das ist genau die Frage, die ein Pruefer stellt, und "wir haben
-- aufgepasst" ist darauf eine schlechte Antwort.
--
-- =====================================================================
-- AN EINE FUNKTION, NICHT AN EINE PERSON (User-Entscheidung 2026-09-17)
-- =====================================================================
-- `attestiert_durch` traegt eine ORGANISATORISCHE FUNKTION
-- (`geschaeftsfuehrung`, `datenschutzbeauftragter`, `informationssicherheits
-- beauftragter`), keinen Namen. Begruendung: Personen wechseln, die
-- Verantwortung der Funktion bleibt; und ein Personenname im Marker waere
-- selbst ein personenbezogenes Datum in einer Tabelle ohne Loeschfrist.
--
-- Die menschliche Zurechenbarkeit traegt `freigabe_ref` — der Verweis auf das
-- Freigabedokument, in dem die handelnde Person unterschreibt. Die Kette ist
-- damit vollstaendig, ohne den Namen hier zu speichern.
--
-- =====================================================================
-- APPEND-ONLY, UND WARUM EIN WIDERRUF EINE NEUE ZEILE IST
-- =====================================================================
-- `REVOKE UPDATE, DELETE` wie im Audit-Schema. Eine Freigabe zurueckzunehmen
-- heisst, eine Zeile mit `art='widerruf'` zu schreiben, nicht die alte zu
-- aendern. Der Grund ist derselbe wie beim Widerruf einer Einwilligung
-- (ADR-0012 E10): Im Streitfall zaehlt, AB WANN etwas galt und ab wann nicht
-- mehr. Ein ueberschriebener Zeitpunkt beantwortet diese Frage nicht.

-- =====================================================================
-- (1) Schema und Rolle
-- =====================================================================

CREATE SCHEMA gate;

COMMENT ON SCHEMA gate IS
  'Freigabe-Marker fuer den Betrieb mit echten Personendaten (ADR-0008 §22). Betreiberlokal: haelt die Nachweise DIESER Installation, nicht die eines Herstellers. Append-only.';

-- Die Rolle, die erklaeren darf. NOLOGIN-Gruppenrolle wie alle anderen im
-- Repo; die LOGIN-Rolle entsteht ausserhalb der Migration (kein Passwort im
-- veroeffentlichten Quellcode, DS-10).
DO $$ BEGIN
    CREATE ROLE edms_ingest_freigabe NOLOGIN;   -- darf erklaeren, sonst nichts
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_ingest_freigabe existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- =====================================================================
-- (2) Die Marker-Tabelle
-- =====================================================================

CREATE TABLE gate.ingest_freigabe (
    id                          uuid PRIMARY KEY,
    -- Strenge Reihenfolge der Erklaerungen, unabhaengig von jedem Zeitstempel.
    --
    -- DIES IST DIE KORREKTUR EINES ECHTEN FEHLERS, gefunden beim Durchspielen
    -- von Freigabe-dann-Widerruf: Die Sicht sortierte zunaechst nur nach
    -- `erklaert_at`, und dessen DEFAULT ist `now()` — die TRANSAKTIONSzeit.
    -- Zwei Erklaerungen in derselben Transaktion (oder in derselben
    -- Mikrosekunde) tragen damit denselben Wert, die Sortierung wird
    -- mehrdeutig, und der Stand zeigte nach dem Widerruf weiterhin die
    -- FREIGABE. Ein Gate, das einen Widerruf verschluckt, ist schlimmer als
    -- gar keins.
    --
    -- Eine Identitaetsspalte ist hier richtig und kein Widerspruch zur
    -- UUID-Regel aus `.claude/rules/database-migrations.md`: Der extern
    -- sichtbare Schluessel bleibt `id` (uuid). `lfd` ist ausschliesslich
    -- Reihenfolge und verlaesst die Datenbank nicht. Luecken durch
    -- zurueckgerollte Transaktionen sind belanglos — gebraucht wird nur die
    -- Ordnung, nicht die Dichte.
    lfd                         bigint      GENERATED ALWAYS AS IDENTITY,
    art                         text        NOT NULL,
    -- Der Aktenstand, GEGEN DEN erklaert wurde. Bindet die Freigabe an einen
    -- konkreten Stand der Nachweise: Aendert sich spaeter eine DSFA, passt
    -- der Fingerabdruck nicht mehr, und die Freigabe gilt nicht
    -- stillschweigend weiter. Erzeugt von `tools/ci/ingest-gate-status.mjs
    -- --fingerabdruck`; welche Dokumente eingehen, bestimmt der Betreiber.
    aktenstand_fingerabdruck    text,
    -- Verweis auf das Freigabedokument (Aktenzeichen, DMS-Kennung, URL).
    -- Hier steht die menschliche Zurechenbarkeit, nicht in attestiert_durch.
    freigabe_ref                text,
    -- Die zwei Bedingungen, die KEINE Software feststellen kann und die
    -- deshalb ausdruecklich als Erklaerung erfasst werden.
    de_only_hosting_attestiert  boolean,
    tia_attestiert              boolean,
    -- Die organisatorische FUNKTION, nicht die Person (s. Kopf).
    attestiert_durch            text,
    -- Nur beim Widerruf: warum.
    begruendung                 text,
    -- `clock_timestamp()` statt `now()`: Letzteres ist die TRANSAKTIONSzeit
    -- und fuer zwei Zeilen derselben Transaktion identisch. Fuer die
    -- Reihenfolge zaehlt ohnehin `lfd`; hier geht es darum, dass der
    -- Zeitstempel nicht mehr verspricht, als er halten kann.
    erklaert_at                 timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT ck_ingest_freigabe_art
        CHECK (art IN ('freigabe', 'widerruf')),

    CONSTRAINT ck_ingest_freigabe_funktion
        CHECK (attestiert_durch IS NULL OR attestiert_durch IN
               ('geschaeftsfuehrung', 'datenschutzbeauftragter', 'informationssicherheitsbeauftragter')),

    -- Eine Freigabe ohne vollstaendige Erklaerung gibt es nicht. Wer eine der
    -- beiden Bedingungen nicht bestaetigen kann, hat keine Freigabe zu
    -- erteilen -- und das steht hier als Constraint, nicht als Bitte.
    CONSTRAINT ck_ingest_freigabe_vollstaendig
        CHECK (
            art <> 'freigabe'
            OR (
                aktenstand_fingerabdruck IS NOT NULL
                AND freigabe_ref IS NOT NULL
                AND de_only_hosting_attestiert IS TRUE
                AND tia_attestiert IS TRUE
                AND attestiert_durch IS NOT NULL
            )
        ),

    -- Ein Widerruf ohne Grund ist im Nachhinein nicht auswertbar.
    CONSTRAINT ck_ingest_freigabe_widerruf_begruendet
        CHECK (art <> 'widerruf' OR begruendung IS NOT NULL),

    -- Ein Fingerabdruck ist ein SHA-256 in Hex oder gar nichts.
    CONSTRAINT ck_ingest_freigabe_fingerabdruck_form
        CHECK (aktenstand_fingerabdruck IS NULL OR aktenstand_fingerabdruck ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE gate.ingest_freigabe IS
  'pii=false; Append-only-Protokoll der Erklaerungen zum Ingest-Gate (ADR-0008 §22). Eine Zeile art=freigabe erklaert, dass die Voraussetzungen fuer den Betrieb mit echten Personendaten vorliegen; art=widerruf nimmt das zurueck. Die Tabelle VERIFIZIERT nichts -- sie haelt fest, wer wann unter Verweis auf welches Dokument und gegen welchen Aktenstand erklaert hat. Kein UPDATE, kein DELETE.';

COMMENT ON COLUMN gate.ingest_freigabe.attestiert_durch IS
  'pii=false; ORGANISATORISCHE FUNKTION, kein Personenname (User-Entscheidung 2026-09-17). Personen wechseln, die Verantwortung der Funktion bleibt -- und ein Name waere hier ein personenbezogenes Datum in einer Tabelle ohne Loeschfrist. Die Person steht im Dokument, auf das freigabe_ref verweist.';

COMMENT ON COLUMN gate.ingest_freigabe.aktenstand_fingerabdruck IS
  'pii=false; SHA-256 (hex) ueber die Nachweis-Dokumente, gegen die erklaert wurde. Bindet die Freigabe an einen konkreten Stand: Aendert sich spaeter eines der Dokumente, passt der Fingerabdruck nicht mehr und die Freigabe gilt nicht stillschweigend weiter.';

-- Der Lesepfad der Anwendung. Eine Sicht statt einer Abfrage im Code: Was
-- "wirksam" heisst, gehoert an eine Stelle, nicht in jeden Aufrufer.
CREATE VIEW gate.ingest_freigabe_stand AS
SELECT
    f.art = 'freigabe'          AS wirksam,
    f.art,
    f.aktenstand_fingerabdruck,
    f.freigabe_ref,
    f.attestiert_durch,
    f.erklaert_at
FROM gate.ingest_freigabe f
-- Nach `lfd`, NICHT nach Zeitstempel: s. Kommentar an der Spalte. Zwei
-- Erklaerungen derselben Transaktion haben dieselbe Transaktionszeit, und ein
-- Widerruf, der dadurch hinter seiner Freigabe einsortiert wird, ist genau
-- der Fehler, den diese Sicht nicht machen darf.
ORDER BY f.lfd DESC
LIMIT 1;

COMMENT ON VIEW gate.ingest_freigabe_stand IS
  'Der aktuell geltende Stand: die zuletzt geschriebene Erklaerung (nach lfd, nicht nach Zeitstempel -- s. Spaltenkommentar). Leer, solange nie eine erteilt wurde, und das ist der Normalzustand einer frischen Installation. Der Startup-Check liest hier, nicht in der Tabelle.';

-- =====================================================================
-- (3) Append-only erzwingen
-- =====================================================================

REVOKE UPDATE, DELETE ON gate.ingest_freigabe FROM PUBLIC;

-- =====================================================================
-- (4) Audit-Ereignisse
-- =====================================================================

INSERT INTO audit.event_typ (code)
VALUES ('gate.ingest_freigabe.erklaert');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'gate.ingest_freigabe.erklaert', 'gate', 'freigeben',
     ARRAY['art', 'aktenstand_fingerabdruck', 'freigabe_ref', 'attestiert_durch'],
     false, true, true,
     'Erklaerung zum Ingest-Gate (ADR-0008 §22): Freigabe oder Widerruf des Betriebs mit echten Personendaten. objekt_ref=gate.ingest_freigabe.id. Pflichtereignis -- es ist der Vorgang, nach dem ein Pruefer als Erstes fragt. kontext.attestiert_durch traegt eine ORGANISATORISCHE FUNKTION, keinen Personennamen; die handelnde Person steht im Dokument hinter freigabe_ref. Der Marker verifiziert nichts: Ein AVV ist ein Vertrag, den keine Software pruefen kann -- festgehalten wird die Erklaerung samt Bezugsstand.',
     now());

-- Zweckgebundener Wrapper statt EXECUTE auf die generische
-- `audit.append_event`. Lehre aus dem security-lead-Review zu V0079
-- (behoben in V0080): PostgreSQL kennt keine argumentscharfen GRANTs, und ein
-- EXECUTE auf die generische Funktion erlaubt JEDEN Event-Typ mit FREI
-- GEWAEHLTEM actor_sub. `event_typ`, `actor_typ` und `actor_sub` stehen
-- deshalb im Funktionskoerper, nicht in der Signatur.
--
-- `actor_typ='dienstkonto'`: ein benanntes Konto, das fuer eine FUNKTION
-- handelt -- nicht 'benutzer' (keine natuerliche Person hinterlegt) und nicht
-- 'system' (kein automatischer Vorgang; es ist eine Willenserklaerung).
CREATE FUNCTION audit.append_ingest_freigabe_event(
    p_freigabe_id              uuid,
    p_art                      text,
    p_aktenstand_fingerabdruck text,
    p_freigabe_ref             text,
    p_attestiert_durch         text
) RETURNS audit.event
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_row audit.event%ROWTYPE;
BEGIN
    IF p_art NOT IN ('freigabe', 'widerruf') THEN
        RAISE EXCEPTION 'audit.append_ingest_freigabe_event: unzulaessige art %', p_art;
    END IF;

    SELECT * INTO v_row FROM audit.append_event(
        'gate.ingest_freigabe.erklaert',  -- p_event_typ  -- FEST VERDRAHTET
        'dienstkonto',                    -- p_actor_typ  -- FEST VERDRAHTET
        'ok',                             -- p_ergebnis
        'ingest-freigabe',                -- p_actor_sub  -- FEST VERDRAHTET
        NULL,                             -- p_actor_rolle
        p_freigabe_id,                    -- p_objekt_ref
        jsonb_build_object(
            'art',                      p_art,
            'aktenstand_fingerabdruck', p_aktenstand_fingerabdruck,
            'freigabe_ref',             p_freigabe_ref,
            'attestiert_durch',         p_attestiert_durch
        ),
        NULL,                             -- p_korrelations_id
        NULL,                             -- p_event_id
        1::smallint                       -- p_format_version
    );
    RETURN v_row;
END;
$$;

ALTER FUNCTION audit.append_ingest_freigabe_event(uuid, text, text, text, text)
    OWNER TO edms_audit_owner;

REVOKE EXECUTE ON FUNCTION audit.append_ingest_freigabe_event(uuid, text, text, text, text) FROM PUBLIC;

-- =====================================================================
-- (5) Grants
-- =====================================================================

-- Die erklaerende Rolle: schreiben und das Geschriebene sehen, sonst nichts.
GRANT USAGE  ON SCHEMA gate TO edms_ingest_freigabe;
GRANT SELECT, INSERT ON gate.ingest_freigabe TO edms_ingest_freigabe;
GRANT SELECT ON gate.ingest_freigabe_stand   TO edms_ingest_freigabe;
GRANT USAGE  ON SCHEMA audit TO edms_ingest_freigabe;
GRANT EXECUTE ON FUNCTION audit.append_ingest_freigabe_event(uuid, text, text, text, text)
    TO edms_ingest_freigabe;

-- Die Anwendung LIEST nur, und nur die Sicht. Sie darf den Stand pruefen --
-- sie darf ihn nicht herstellen. Das ist der ganze Zweck der Trennung: Wer
-- den Schalter umlegt, soll nicht derselbe sein koennen, der behauptet, die
-- Voraussetzungen laegen vor.
GRANT USAGE  ON SCHEMA gate TO edms_app;
GRANT SELECT ON gate.ingest_freigabe_stand TO edms_app;
