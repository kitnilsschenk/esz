-- V0069__identity_widerspruch_beleg.sql
--
-- Der Beleg zum Widerspruch — mit feldverschluesselter IP fuer den digitalen
-- Weg (DS-03).
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- V0044 hat `identity.einwilligung_beleg` gebaut: crypto_key_id des
-- Subjekts, Erfassungsweg, Zeitpunkt, feldverschluesselte IP — und DS-03
-- woertlich als CHECK ("bei digitalem Opt-in Zeitpunkt UND IP dokumentieren").
--
-- V0052 hat den WIDERSPRUCH nachgezogen, den Beleg dazu aber nicht. Das war
-- bis heute folgenlos: `erklaerung.policy.ts` sperrt `digital_opt_in` in der
-- Betriebssicht ausdruecklich, weil die dort verfuegbare IP die des
-- Bearbeiters waere — "ein erfundener Nachweis ist schlimmer als ein
-- fehlender". Der Kommentar dort nennt auch, wann sich das aendert:
-- "`digital_opt_in` entsteht erst im Nutzerportal (ADR-0012 Stufe D), wo die
-- betroffene Person selbst handelt."
--
-- Das Portal gibt es seit V0066. Damit ist der Weg da, und der Beleg fehlt.
--
-- =====================================================================
-- Warum eine EIGENE Tabelle und nicht `einwilligung_beleg` mitbenutzt
-- =====================================================================
-- Deren `einwilligung_id` verweist logisch auf `consent.einwilligung`, und
-- `ck_einwilligung_beleg_art` kennt nur `erteilung|widerruf`. Eine
-- Widerspruchs-Kennung in dieses Feld zu schreiben hiesse, zwei verschiedene
-- Fachobjekte durch dieselbe Spalte zu fuehren — die naechste Abfrage, die
-- joint, traefe dann die falschen Zeilen. Widerspruch und Einwilligung sind
-- ausdruecklich AUSEINANDERGEHALTEN (`ck_widerspruch_kein_opt_in`): Gegen eine
-- Opt-in-Verarbeitung widerspricht man nicht, man widerruft.
--
-- Die STRUKTUR ist bewusst identisch. Wer den einen Beleg verstanden hat,
-- versteht den anderen.
--
-- =====================================================================
-- Warum die IP ueberhaupt gespeichert wird
-- =====================================================================
-- DS-03 ([Q1] Kap. 4.3) verlangt bei einer digitalen Erklaerung Zeitpunkt UND
-- IP als Nachweis. Sie ist personenbezogen — deshalb liegt sie
-- feldverschluesselt unter dem SUBJEKT-Schluessel: Ein Krypto-Shred
-- (ADR-0009) macht saemtliche Belege dieser Person in einem Zug unlesbar,
-- ohne dass ein Loeschjob sie einzeln aufsuchen muss.
--
-- Und umgekehrt: Wo es keinen digitalen Vorgang gab, DARF keine IP stehen.
-- Eine dort eingetragene waere erfunden. Beide Richtungen stehen als CHECK.

CREATE TABLE identity.widerspruch_beleg (
    id             uuid        PRIMARY KEY,   -- App: UUIDv7
    -- LOGISCHER Verweis auf consent.widerspruch (kein FK ueber Schemagrenze,
    -- dieselbe Konvention wie bei identity.einwilligung_beleg).
    widerspruch_id uuid        NOT NULL,
    crypto_key_id  uuid        NOT NULL REFERENCES identity.subjekt_schluessel(id),
    -- erklaerung = der Widerspruch selbst, ruecknahme = seine Zuruecknahme.
    art            text        NOT NULL,
    erfassungsweg  text        NOT NULL,
    erfasst_at     timestamptz NOT NULL,       -- UTC
    quelle_ref     text,
    ip_enc         bytea,                      -- feldverschluesselt; Pflicht bei digital_opt_in, s. CHECK
    user_agent_enc bytea,                      -- feldverschluesselt; optional
    pii_status     text        NOT NULL DEFAULT 'aktiv',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- Je Vorgang HOECHSTENS EIN Beleg: Erklaerung und Ruecknahme sind zwei
    -- Vorgaenge an derselben Zeile und bekommen je einen.
    CONSTRAINT ux_widerspruch_beleg_vorgang UNIQUE (widerspruch_id, art),

    CONSTRAINT ck_widerspruch_beleg_art CHECK (art IN ('erklaerung', 'ruecknahme')),

    CONSTRAINT ck_widerspruch_beleg_weg CHECK (
        erfassungsweg IN ('digital_opt_in', 'vertrag_schriftlich', 'uebernahme_altbestand')
    ),

    -- DS-03, wortwoertlich als Constraint (Muster V0044).
    CONSTRAINT ck_widerspruch_beleg_ip_bei_digital CHECK (
        erfassungsweg <> 'digital_opt_in' OR ip_enc IS NOT NULL
    ),

    -- Umgekehrt: Wo es keinen digitalen Vorgang gab, kann es keine IP geben.
    CONSTRAINT ck_widerspruch_beleg_keine_ip_ohne_digital CHECK (
        erfassungsweg = 'digital_opt_in' OR ip_enc IS NULL
    ),

    CONSTRAINT ck_widerspruch_beleg_pii_status CHECK (
        pii_status IN ('aktiv', 'gesperrt', 'geloescht')
    )
);

CREATE INDEX ix_widerspruch_beleg_key ON identity.widerspruch_beleg (crypto_key_id);

CREATE TRIGGER trg_widerspruch_beleg_updated_at BEFORE UPDATE ON identity.widerspruch_beleg
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE identity.widerspruch_beleg IS
  'Nachweis zu consent.widerspruch (AW-27, DS-03). pii=true (ip_enc/user_agent_enc). Struktur bewusst identisch zu identity.einwilligung_beleg -- wer den einen verstanden hat, versteht den anderen. Getrennte Tabelle, weil Widerspruch und Einwilligung ausdruecklich auseinandergehalten sind (ck_widerspruch_kein_opt_in): gegen eine Opt-in-Verarbeitung widerspricht man nicht, man widerruft.';
COMMENT ON COLUMN identity.widerspruch_beleg.ip_enc IS
  'pii=true; grundlage=DS-03 ([Q1] Kap. 4.3: Zeitpunkt+IP bei digitaler Erklaerung); retention=ADR-0012 O2 OFFEN. Feldverschluesselt mit dem Subjekt-Schluessel -- ein Krypto-Shred (ADR-0009) macht sie unlesbar. Steht NUR bei erfassungsweg=digital_opt_in; wo es keinen digitalen Vorgang gab, waere sie erfunden.';
COMMENT ON COLUMN identity.widerspruch_beleg.art IS
  'pii=false; erklaerung = der Widerspruch selbst, ruecknahme = seine Zuruecknahme. Zwei Vorgaenge an derselben Fachzeile, je ein Beleg -- sonst ueberschriebe die Ruecknahme den Nachweis der Erklaerung.';

-- Rechte exakt wie bei `identity.einwilligung_beleg` (V0044): `edms_app`
-- schreibt den Beleg an, aendert ihn aber nie -- ein Nachweis, den die
-- Anwendung nachtraeglich korrigieren kann, ist keiner. Unlesbar machen darf
-- ihn nur der Shred-/Loeschlauf.
GRANT SELECT, INSERT ON identity.widerspruch_beleg TO edms_app;

-- Der Krypto-Shred (ADR-0009) muss den Beleg unlesbar machen koennen.
GRANT SELECT, UPDATE ON identity.widerspruch_beleg TO edms_retention;
