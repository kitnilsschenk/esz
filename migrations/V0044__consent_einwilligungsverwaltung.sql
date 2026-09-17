-- V0044 — Einwilligungsverwaltung: Zweck-Katalog, versionierte Texte,
-- Einwilligung als Ereignis, verschluesselter Beleg.
-- (ADR-0012 A1; DS-02/DS-03/DS-04/DS-07/DS-08 aus
-- `compliance/foerderauflagen/merkblatt-anforderungen.md`.)
--
-- ANLASS
-- ------
-- ADR-0004 (V0002) legte an `energy.endkunde` drei Spalten als SLOT an --
-- `consent_status`, `consent_text_version`, `consent_ref_id` -- mit dem
-- Kommentar „Mechanik = Consent-ADR". Der Slot ist seither leer: kein Text,
-- kein Erteilen, kein Widerruf, kein Beleg. `consent_status` steht bei jedem
-- Endkunden auf dem Default `fehlt`.
--
-- Damit ist die Einwilligung heute eine Behauptung ohne Nachweis. Art. 7
-- Abs. 1 DSGVO dreht die Beweislast um: Der Verantwortliche MUSS nachweisen
-- koennen, dass eingewilligt wurde. Nicht belegbare Einwilligung ist im
-- Streitfall keine.
--
-- DIE TRAGENDE ENTSCHEIDUNG: EREIGNIS STATT ZUSTAND (ADR-0012 §2)
-- ---------------------------------------------------------------
-- Der heutige Slot behandelt die Einwilligung als ZUSTAND -- eine Spalte mit
-- drei Werten. Fuer die Frage „darf ich gerade verarbeiten?" ist das bequem,
-- fuer den Nachweis unbrauchbar: Ein Zustand hat keine Geschichte. Wer 2029
-- belegen muss, wer wann auf Grundlage welcher Textfassung eingewilligt hat,
-- findet in einer Statusspalte nichts davon.
--
-- Diese Migration legt deshalb die EREIGNISFOLGE an. Der Zustand ist eine
-- Ableitung daraus, nicht umgekehrt -- dieselbe Bauform wie beim Audit-Log
-- (ADR-0003) und aus demselben Grund: Ein Nachweis, den man ueberschreiben
-- kann, ist keiner.
--
-- WAS DIESE MIGRATION NICHT TUT
-- -----------------------------
-- Sie schaltet NICHTS scharf. Die Wirkung auf den Ingest (ADR-0012 E5,
-- Stufe C) ist ein eigener, ausdruecklich freizugebender Schritt; die
-- Worker-Rolle bekommt hier BEWUSST KEIN Leserecht (s. Grants am Ende).
-- Sie aendert auch die drei Slot-Spalten an `energy.endkunde` NICHT -- solange
-- keine Zeile existiert, waere jede Ableitung dorthin eine Aussage ueber
-- nichts. Das Zusammenfuehren gehoert zu Stufe C.
--
-- WARUM EIN EIGENES SCHEMA
-- ------------------------
-- `consent.*` ist pseudonym und PII-FREI -- es fuehrt Subjekt-Kennungen,
-- Zweck-Codes, Fassungen und Zeitpunkte, aber keine Personendaten. Der
-- BELEG dagegen traegt die IP und gehoert damit nach `identity` (s. u.).
-- Dieselbe Trennung wie `energy` ↔ `identity` (rote Linie 1), aus demselben
-- Grund: Der haeufig gelesene Teil bleibt PII-frei.
--
-- Review-Bedarf (`.claude/rules/database-migrations.md`): `database-lead`
-- UND `compliance-director` -- letzterer federfuehrend, weil hier die
-- Rechtsgrundlage modelliert wird, auf die sich die gesamte Verarbeitung
-- stuetzt. ADR-0012 ist ausdruecklich ein ENTWURF ohne Votum.

CREATE SCHEMA consent;

-- Eigene, je-Schema-duplizierte Trigger-Funktion (rote Linie 5, Konvention
-- aus V0002/V0003/V0010/V0011).
CREATE FUNCTION consent.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- =====================================================================
-- consent.zweck — der Zweck-Katalog (ADR-0012 E2)
-- =====================================================================
-- DAS KOPPLUNGSVERBOT WIRD HIER STRUKTURELL EINGELOEST, nicht durch eine
-- Regel im Anwendungscode: Weil die Einwilligung je Zweck EINE EIGENE ZEILE
-- ist, gibt es technisch keine Moeglichkeit, mehrere Zwecke mit einem
-- Haekchen zu erteilen. Wer vier Zwecke erteilen will, erzeugt vier Zeilen.
--
-- `verweigerbar` haelt fest, ob die Verweigerung dieses Zwecks die Leistung
-- kostet. Es ist eine DOKUMENTATIONS-Spalte, keine Steuerspalte: Sie
-- verhindert nichts, sondern zwingt dazu, die Frage je Zweck zu beantworten
-- und beantwortet zu halten -- genau die Frage, die Art. 7 Abs. 4 stellt.
CREATE TABLE consent.zweck (
    code         text        PRIMARY KEY,   -- stabiler Fachcode, s. CHECK
    bezeichnung  text        NOT NULL,       -- kurze Benennung fuer Oberflaechen
    verweigerbar boolean     NOT NULL,       -- s. Kommentar oben
    beschreibung text        NOT NULL,       -- wofuer die Daten verwendet werden
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_zweck_code_form CHECK (code ~ '^[a-z][a-z0-9_]{2,63}$')
);

CREATE TRIGGER trg_zweck_updated_at BEFORE UPDATE ON consent.zweck
    FOR EACH ROW EXECUTE FUNCTION consent.set_updated_at();

COMMENT ON TABLE  consent.zweck              IS 'Geschlossener Zweck-Katalog (ADR-0012 E2). Je Zweck eine eigene Einwilligung -- das Kopplungsverbot (Art. 7 Abs. 4 DSGVO, DS-03) ist damit strukturell eingehalten. pii=false.';
COMMENT ON COLUMN consent.zweck.verweigerbar IS 'Ob die Verweigerung dieses Zwecks die Leistung kostet. Dokumentation, keine Steuerung -- zwingt dazu, die Kopplungsfrage je Zweck beantwortet zu halten.';

-- =====================================================================
-- consent.text_version — versionierte Erklaerungen (ADR-0012 E3, DS-04)
-- =====================================================================
-- UNVERAENDERLICH. `REVOKE UPDATE, DELETE` am Ende dieser Datei; Korrekturen
-- laufen als NEUE Fassung.
--
-- WARUM DER HASH NEBEN DEM WORTLAUT STEHT
-- Auf den ersten Blick redundant -- der Wortlaut steht ja daneben. Er ist der
-- Unterschied zwischen „wir haben eine Fassung 2.1" und „DIES ist der
-- Wortlaut, dem zugestimmt wurde". Faende jemand einen Weg, den Text einer
-- bestehenden Fassung zu aendern (ein Datenbank-Administrator am REVOKE
-- vorbei, eine spaetere Migration), zeigten alle darauf verweisenden
-- Einwilligungen stillschweigend auf den neuen Wortlaut -- ohne dass
-- irgendwo etwas ausweist, dass sich etwas geaendert hat. Der Hash wird bei
-- der Aufnahme gebildet und macht genau das sichtbar.
--
-- KEINE ZWEI FASSUNGEN EINES ZWECKS ZUR SELBEN ZEIT
-- Die EXCLUDE-Constraint verhindert ueberlappende Gueltigkeitsraeume je
-- Zweck (btree_gist, seit V0001 vorhanden) -- dasselbe Muster wie
-- `audit.event_typ_version` (V0003) und `energy.nutzungsverhaeltnis`
-- (V0002). Ohne sie waere bei einer Erteilung nicht bestimmt, WELCHE Fassung
-- gerade gilt, und die Antwort haette von der Zeilenreihenfolge abgehangen.
CREATE TABLE consent.text_version (
    id              uuid        PRIMARY KEY,   -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002 S4)
    zweck_code      text        NOT NULL REFERENCES consent.zweck(code),
    fassung         text        NOT NULL,       -- fachliche Bezeichnung, z. B. '1.0', '2.1'
    wortlaut        text        NOT NULL,       -- der Text, dem zugestimmt wird
    wortlaut_sha256 bytea       NOT NULL,       -- SHA-256 des Wortlauts, s. Kommentar oben
    gueltig_ab      timestamptz NOT NULL,
    gueltig_bis     timestamptz,                -- NULL = derzeit gueltige Fassung
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_text_version_fassung_form   CHECK (fassung ~ '^[0-9]+\.[0-9]+$'),
    CONSTRAINT ck_text_version_wortlaut_gefuellt CHECK (length(btrim(wortlaut)) >= 20),
    CONSTRAINT ck_text_version_sha256_laenge  CHECK (octet_length(wortlaut_sha256) = 32),

    CONSTRAINT ux_text_version_zweck_fassung  UNIQUE (zweck_code, fassung),

    -- Ziel des zusammengesetzten Fremdschluessels aus consent.einwilligung
    -- (s. dort): erzwingt, dass eine Einwilligung auf eine Fassung DESSELBEN
    -- Zwecks zeigt.
    CONSTRAINT ux_text_version_id_zweck       UNIQUE (id, zweck_code),

    CONSTRAINT ex_text_version_kein_overlap EXCLUDE USING gist (
        zweck_code WITH =,
        tstzrange(gueltig_ab, gueltig_bis) WITH &&
    )
);

COMMENT ON TABLE  consent.text_version                 IS 'Versionierte Einwilligungserklaerungen (ADR-0012 E3, DS-04). UNVERAENDERLICH -- Korrektur = neue Fassung. pii=false.';
COMMENT ON COLUMN consent.text_version.wortlaut_sha256 IS 'SHA-256 des Wortlauts. Macht eine nachtraegliche Textaenderung sichtbar, auf die sonst alle erteilten Einwilligungen stillschweigend zeigen wuerden.';

-- =====================================================================
-- consent.einwilligung — das Fachobjekt (ADR-0012 E1/E6/E8, DS-03/DS-07)
-- =====================================================================
-- ZWEI NULLBARE SUBJEKT-SPALTEN, EIN CHECK (E6)
-- Einwilligen kann jede BETROFFENE Person -- im Mietfall der
-- Anschlussnutzer, nicht der Endkunde (DS-07). Eine Einwilligung, die jemand
-- FUER einen anderen erteilt, ist keine. Modelliert als zwei nullbare
-- Fremdschluessel plus ein CHECK, der genau einen verlangt: So bleibt die
-- referentielle Integritaet je Subjektart deklarativ erhalten (eine einzelne
-- polymorphe `subjekt_id`-Spalte koennte auf gar nichts verweisen).
--
-- WIDERRUF LOESCHT NICHTS (E8)
-- Ein Widerruf setzt `widerrufen_at` und beendet die Wirkung AB DIESEM
-- ZEITPUNKT (Art. 7 Abs. 3 Satz 2: die Rechtmaessigkeit der bis dahin
-- erfolgten Verarbeitung bleibt unberuehrt). Die Zeile bleibt stehen. Sie zu
-- loeschen waere doppelt falsch: Es vernichtete den Nachweis, dass je
-- eingewilligt wurde, UND den Nachweis, dass rechtmaessig verarbeitet wurde,
-- solange die Einwilligung galt.
--
-- Der Loeschanspruch nach Art. 17 wird davon nicht beruehrt -- er laeuft ueber
-- das Krypto-Shredding (ADR-0009), das den BELEG mit dem Schluessel des
-- Subjekts unlesbar macht, statt Zeilen zu entfernen.
--
-- ERNEUTE EINWILLIGUNG = NEUE ZEILE
-- Kein Zuruecksetzen von `widerrufen_at`. Wer nach einem Widerruf erneut
-- einwilligt, erzeugt eine neue Zeile mit der dann gueltigen Fassung -- der
-- Verlauf bleibt lesbar, und die zweite Einwilligung erbt nicht stillschweigend
-- die Textfassung der ersten.
CREATE TABLE consent.einwilligung (
    id                 uuid        PRIMARY KEY,   -- App: UUIDv7
    subjekt_typ        text        NOT NULL,       -- endkunde|anschlussnutzer, s. CHECK
    endkunde_id        uuid        REFERENCES energy.endkunde(id),
    anschlussnutzer_id uuid        REFERENCES energy.anschlussnutzer(id),
    zweck_code         text        NOT NULL REFERENCES consent.zweck(code),
    text_version_id    uuid        NOT NULL,       -- FK zusammengesetzt, s. u.
    rechtsgrundlage    text        NOT NULL,       -- s. CHECK und ADR-0012 O1
    erteilt_at         timestamptz NOT NULL,       -- UTC (rules: Zeitstempel immer UTC)
    widerrufen_at      timestamptz,                -- NULL = wirksam
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_einwilligung_subjekt_typ CHECK (subjekt_typ IN ('endkunde', 'anschlussnutzer')),

    -- Genau ein Subjekt, passend zum deklarierten Typ.
    CONSTRAINT ck_einwilligung_genau_ein_subjekt CHECK (
        (subjekt_typ = 'endkunde'        AND endkunde_id IS NOT NULL AND anschlussnutzer_id IS NULL)
     OR (subjekt_typ = 'anschlussnutzer' AND anschlussnutzer_id IS NOT NULL AND endkunde_id IS NULL)
    ),

    -- ADR-0012 O1 ist NICHT entschieden. Beide Werte sind zugelassen, KEINER
    -- ist Default -- die Anwendung muss sich je Zweck festlegen, und die
    -- Festlegung steht an der Zeile statt in einem Kommentar.
    CONSTRAINT ck_einwilligung_rechtsgrundlage CHECK (
        rechtsgrundlage IN ('einwilligung_art6_1a', 'vertrag_art6_1b')
    ),

    CONSTRAINT ck_einwilligung_widerruf_nach_erteilung CHECK (
        widerrufen_at IS NULL OR widerrufen_at >= erteilt_at
    ),

    -- Die Fassung muss zum Zweck gehoeren. Ohne diesen zusammengesetzten
    -- Fremdschluessel koennte eine Einwilligung in die Nutzerinformation auf
    -- den Text der Geraeteerkennung zeigen -- und der Nachweis waere wertlos,
    -- weil er den falschen Wortlaut belegte.
    CONSTRAINT fk_einwilligung_text_version_zweck
        FOREIGN KEY (text_version_id, zweck_code)
        REFERENCES consent.text_version (id, zweck_code)
);

-- HOECHSTENS EINE WIRKSAME EINWILLIGUNG JE SUBJEKT UND ZWECK.
-- Teilindizes statt eines Constraints, weil die Bedingung `widerrufen_at IS
-- NULL` lautet: Widerrufene Zeilen sollen sich beliebig oft wiederholen
-- duerfen (jede erneute Einwilligung mit spaeterem Widerruf ist eine weitere),
-- wirksame nicht.
CREATE UNIQUE INDEX ux_einwilligung_wirksam_endkunde
    ON consent.einwilligung (endkunde_id, zweck_code)
    WHERE widerrufen_at IS NULL AND endkunde_id IS NOT NULL;

CREATE UNIQUE INDEX ux_einwilligung_wirksam_anschlussnutzer
    ON consent.einwilligung (anschlussnutzer_id, zweck_code)
    WHERE widerrufen_at IS NULL AND anschlussnutzer_id IS NOT NULL;

-- „Was gilt fuer diese Person?" -- der Hot-Path jeder Zugriffspruefung.
CREATE INDEX ix_einwilligung_endkunde        ON consent.einwilligung (endkunde_id, zweck_code)        WHERE endkunde_id IS NOT NULL;
CREATE INDEX ix_einwilligung_anschlussnutzer ON consent.einwilligung (anschlussnutzer_id, zweck_code) WHERE anschlussnutzer_id IS NOT NULL;

CREATE TRIGGER trg_einwilligung_updated_at BEFORE UPDATE ON consent.einwilligung
    FOR EACH ROW EXECUTE FUNCTION consent.set_updated_at();

COMMENT ON TABLE  consent.einwilligung                 IS 'Einwilligung als EREIGNIS (ADR-0012 E1). Eine Zeile je (Person, Zweck, Erteilung); Widerruf setzt widerrufen_at und loescht nichts (Art. 7 Abs. 3 S. 2). Erneute Einwilligung = neue Zeile. pii=false (Pseudonym-Kennungen; der personenbezogene Beleg liegt in identity.einwilligung_beleg).';
COMMENT ON COLUMN consent.einwilligung.rechtsgrundlage IS 'einwilligung_art6_1a|vertrag_art6_1b. ADR-0012 O1 ist offen -- ob die Kernverarbeitung auf Einwilligung oder Vertrag gestuetzt wird, ist eine Rechtsfrage. KEIN Default: die Festlegung gehoert an die Zeile.';
COMMENT ON COLUMN consent.einwilligung.widerrufen_at   IS 'Wirkung endet AB diesem Zeitpunkt; die bis dahin erfolgte Verarbeitung bleibt rechtmaessig (Art. 7 Abs. 3 S. 2). NIE zurueck auf NULL setzen -- eine erneute Einwilligung ist eine neue Zeile.';

-- =====================================================================
-- identity.einwilligung_beleg — der Nachweis (ADR-0012 E4, DS-03)
-- =====================================================================
-- WARUM GETRENNT VON DER FACHZEILE
-- Die Fachzeile (wer, welcher Zweck, welche Fassung, seit wann) wird OFT
-- gelesen -- bei jeder Zugriffspruefung. Der Beleg wird SELTEN gelesen: im
-- Streitfall, bei einer Auskunft, bei einer Pruefung. Beides in einer Tabelle
-- hiesse, das PII-Feld bei jeder Routineabfrage mitzuschleppen. Getrennt
-- bleibt der heisse Pfad PII-frei -- dieselbe Trennung wie energy ↔ identity
-- (rote Linie 1).
--
-- KEIN FREMDSCHLUESSEL NACH `consent` (rote Linie 1/5, Muster aus V0017 D4)
-- `einwilligung_id` ist ein LOGISCHER Verweis. Der identity-Namensraum
-- verweist grundsaetzlich nicht referenziell in den pseudonymen Raum -- ein
-- FK waere eine dauerhafte, im Katalog sichtbare Verknuepfung genau der
-- beiden Seiten, die getrennt bleiben sollen.
--
-- `crypto_key_id` IST HIER NICHT UNIQUE — anders als bei
-- `identity.endkunde_pii`. Das ist Absicht: Alle Belege EINER Person teilen
-- deren Subjekt-Schluessel. Genau dadurch macht ein Krypto-Shred (ADR-0009)
-- saemtliche Belege dieser Person in einem Zug unlesbar, ohne dass ein
-- Loeschjob sie einzeln aufsuchen muss.
--
-- DS-03 STEHT ALS CONSTRAINT, NICHT NUR IM TEXT
-- „Bei digitalem Opt-in Zeitpunkt UND IP dokumentieren" -- der CHECK unten
-- macht daraus eine Bedingung, an der ein Insert scheitert. Bei
-- schriftlicher Erteilung oder Altbestand-Uebernahme gibt es keine IP, dort
-- bleibt die Spalte leer.
CREATE TABLE identity.einwilligung_beleg (
    id             uuid        PRIMARY KEY,   -- App: UUIDv7
    einwilligung_id uuid       NOT NULL,       -- LOGISCHER Verweis auf consent.einwilligung (kein FK, s. Kopf)
    crypto_key_id  uuid        NOT NULL REFERENCES identity.subjekt_schluessel(id),
    erfassungsweg  text        NOT NULL,       -- s. CHECK
    erfasst_at     timestamptz NOT NULL,       -- UTC
    ip_enc         bytea,                      -- feldverschluesselt; Pflicht bei digital_opt_in, s. CHECK
    user_agent_enc bytea,                      -- feldverschluesselt; optional
    pii_status     text        NOT NULL DEFAULT 'aktiv',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ux_einwilligung_beleg_einwilligung UNIQUE (einwilligung_id),

    CONSTRAINT ck_einwilligung_beleg_weg CHECK (
        erfassungsweg IN ('digital_opt_in', 'vertrag_schriftlich', 'uebernahme_altbestand')
    ),

    -- DS-03, wortwoertlich als Constraint.
    CONSTRAINT ck_einwilligung_beleg_ip_bei_digital CHECK (
        erfassungsweg <> 'digital_opt_in' OR ip_enc IS NOT NULL
    ),

    -- Umgekehrt: Wo es keinen digitalen Vorgang gab, kann es keine IP geben.
    -- Eine dort eingetragene waere erfunden.
    CONSTRAINT ck_einwilligung_beleg_keine_ip_ohne_digital CHECK (
        erfassungsweg = 'digital_opt_in' OR ip_enc IS NULL
    ),

    CONSTRAINT ck_einwilligung_beleg_pii_status CHECK (
        pii_status IN ('aktiv', 'gesperrt', 'geloescht')
    )
);

CREATE INDEX ix_einwilligung_beleg_key ON identity.einwilligung_beleg (crypto_key_id);

CREATE TRIGGER trg_einwilligung_beleg_updated_at BEFORE UPDATE ON identity.einwilligung_beleg
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.einwilligung_beleg                IS 'Nachweis einer Einwilligung (ADR-0012 E4, DS-03). Personenbezogen, feldverschluesselt, im identity-Namensraum. pii=true; grundlage=Art. 7 Abs. 1 DSGVO (Nachweispflicht); retention=ADR-0012 O2 OFFEN.';
COMMENT ON COLUMN identity.einwilligung_beleg.ip_enc         IS 'pii=true; grundlage=DS-03 (Zeitpunkt+IP bei digitalem Opt-in); retention=ADR-0012 O2 OFFEN. Feldverschluesselt mit dem Subjekt-Schluessel -- ein Krypto-Shred (ADR-0009) macht sie unlesbar.';
COMMENT ON COLUMN identity.einwilligung_beleg.user_agent_enc IS 'pii=true; grundlage=Beweiskraft des Opt-in-Vorgangs; retention=ADR-0012 O2 OFFEN. Optional -- ohne ihn bleibt der Beleg gueltig.';
COMMENT ON COLUMN identity.einwilligung_beleg.crypto_key_id  IS 'Subjekt-Schluessel der betroffenen Person. BEWUSST NICHT UNIQUE (anders als endkunde_pii): Alle Belege einer Person teilen ihn, damit ein Krypto-Shred sie in einem Zug erfasst.';

-- =====================================================================
-- Zweck-Katalog befuellen (ADR-0012 E2)
-- =====================================================================
-- Die Beschreibungen sind FACHLICHE Kurzfassungen fuer Oberflaechen, NICHT
-- die Einwilligungserklaerung selbst. Der rechtsverbindliche Wortlaut mit
-- den Angaben nach Art. 13 DSGVO (Identitaet, Zweck, Bedingungen,
-- Empfaenger, Datenkategorien, Speicherdauer, Folgen der Verweigerung) ist
-- ein juristischer Text und gehoert von fachkundiger Stelle verfasst -- er
-- wird als `consent.text_version` eingepflegt, NICHT hier erfunden
-- (ADR-0012 §5).
INSERT INTO consent.zweck (code, bezeichnung, verweigerbar, beschreibung) VALUES
    ('messdaten_verarbeitung', 'Verbrauchsmessung', false,
     'Erhebung und Verarbeitung der Verbrauchsdaten zum Zweck der Einsparermittlung. Nicht verweigerbar, ohne die Leistung zu verlieren -- ohne Messung gibt es keine Einsparermittlung. Das ist der Vertragsgegenstand, keine Kopplung im Sinne von Art. 7 Abs. 4 DSGVO. Ob dieser Zweck ueberhaupt auf Einwilligung oder auf Vertragserfuellung gestuetzt wird, ist ADR-0012 O1 und NICHT entschieden.'),
    ('nutzerinformation', 'Monatliche Nutzerinformation', true,
     'Mindestens monatliche Information ueber Verbrauch und Einsparung (Technik-Merkblatt Kap. 6). Ausdruecklich verweigerbar -- das Opt-out ist im Merkblatt selbst vorgesehen; die Messung laeuft ohne sie weiter.'),
    ('geraeteerkennung', 'Erkennung von Geraetegruppen', true,
     'Zuordnung von Verbrauchsanteilen zu Geraete- und Anlagengruppen. Verweigerbar: Die Einsparermittlung kommt ohne sie aus, die Quoten-Nachweise des Programms betreffen den Zaehlerbestand, nicht die einzelne Person.'),
    ('mehrwertdienste', 'Mehrwertdienste', true,
     'Ueber die Einsparermittlung hinausgehende Auswertungen und Angebote. Verweigerbar -- sie sind per Definition zusaetzlich.'),
    ('wiss_auswertung', 'Wissenschaftliche Auswertung', true,
     'Pseudonymisierte Auswertung im Rahmen der wissenschaftlichen Begleitung des Foerderprogramms. Verweigerbar; DE-04 kennt die Ausnahme bereits als Attribut am Endkunden (von_wiss_auswertung_ausgenommen, V0002) -- beide Wege sind zusammenzufuehren, s. ADR-0012.');

-- =====================================================================
-- Unveraenderlichkeit und Rechte
-- =====================================================================
-- Textfassungen sind unveraenderlich (E3). Dieselbe Haertung wie bei den
-- Audit-Tabellen (`.claude/rules/database-migrations.md`: REVOKE UPDATE,
-- DELETE). Der Tabelleneigentuemer bleibt davon unberuehrt -- das ist der
-- bekannte Rest, den nur eine Migration ueberwinden kann.
REVOKE UPDATE, DELETE ON consent.text_version FROM PUBLIC;

GRANT USAGE ON SCHEMA consent TO edms_app;
GRANT SELECT                 ON consent.zweck             TO edms_app;   -- Katalog: lesen, nie schreiben
GRANT SELECT, INSERT         ON consent.text_version      TO edms_app;   -- veroeffentlichen ja, aendern nein (s. REVOKE)
GRANT SELECT, INSERT, UPDATE ON consent.einwilligung      TO edms_app;   -- UPDATE ausschliesslich fuer widerrufen_at
GRANT SELECT, INSERT         ON identity.einwilligung_beleg TO edms_app; -- UPDATE nur ueber den Shred-Pfad, s. u.

-- Der Krypto-Shred (ADR-0009) muss den Beleg unlesbar machen koennen.
-- `edms_retention` fuehrt die Loesch-/Sperrlaeufe.
GRANT SELECT, UPDATE ON identity.einwilligung_beleg TO edms_retention;

-- KEIN GRANT FUER `edms_ingest_worker`.
-- Das ist Absicht und die restriktive Seite: Die Wirkung der Einwilligung auf
-- den Schreibpfad (ADR-0012 E5, Stufe C) ist NICHT freigegeben. Ein
-- Leserecht auf Vorrat waere ein Recht ohne Regel -- es wuerde die
-- Entscheidung, die noch aussteht, technisch bereits vorwegnehmen. Wenn
-- Stufe C kommt, kommt der Grant mit ihr, zusammen mit dem
-- compliance-director-Votum, das ADR-0012 dafuer verlangt.
