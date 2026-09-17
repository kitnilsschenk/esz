-- V0066__portal_endkunden_zugang.sql
--
-- Nutzerportal, Fundament: Endkunden-Zugang ueber einen Zugangscode aus dem
-- Brief, danach eigenes Passwort und eigene Sitzung.
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- [Q3] Kap. 6 verlangt die monatliche Nutzerinformation MIT Opt-out. Der
-- Postweg steht seit dem 2026-09-09 (Kundendokument, Versandmappe,
-- Zustellnachweis) — was fehlt, ist der digitale: Ohne einen Zugang, den der
-- Endkunde selbst benutzt, kann er auch nicht selbst widersprechen. Ein
-- Opt-out, das nur der Betrieb fuer ihn eintragen kann, ist keines.
--
-- =====================================================================
-- WARUM EIN EIGENER WEG UND NICHT KEYCLOAK
-- =====================================================================
-- Der Betrieb meldet sich ueber Keycloak an (ADR-0002, Realm `edms`,
-- OIDC-Code-Flow ueber das BFF). Fuer Endkunden waere ein zweiter Realm mit
-- Selbstregistrierung der naheliegende Weg — er scheitert an zwei Dingen, die
-- es im System nicht gibt:
--
--   1. KEIN Mailversand. Passwort-Reset, Verifikationsmail und
--      Registrierungsbestaetigung setzen ihn voraus.
--   2. KEINE Zuordnung. Ein Selbstregistrierer muesste seinem
--      `energy.endkunde`-Datensatz zugeordnet werden — genau die Zuordnung,
--      die ein Angreifer faelschen wuerde.
--
-- Der Zugangscode aus dem Brief loest beides: Der Brief geht an eine Anschrift,
-- die der Betrieb bereits gepflegt hat, und der Code IST die Zuordnung. Der
-- Betrieb kennt seine Endkunden ohnehin; eine Selbstregistrierung wuerde nur
-- eine Angriffsflaeche eroeffnen, die niemand braucht (User-Entscheidung
-- 2026-09-09).
--
-- =====================================================================
-- Was hier NICHT im Klartext liegt
-- =====================================================================
-- Weder der Zugangscode noch das Passwort. Beide stehen ausschliesslich als
-- Hash in der Tabelle:
--
--   * Der CODE existiert im Klartext GENAU EINMAL — im Brief. Er wird beim
--     Ausgeben erzeugt, sofort gehasht und danach nirgends mehr rekonstruiert.
--     Wer ihn verliert, bekommt einen neuen; niemand kann ihn nachschlagen,
--     auch der Betrieb nicht. Das ist Absicht: Ein nachschlagbarer Code waere
--     ein Generalschluessel zu den Verbrauchsdaten aller Kunden.
--   * Das PASSWORT wird mit scrypt (RFC 7914) und einem Salt je Zugang
--     abgeleitet. Die Parameter stehen MIT in der Zeile (`passwort_algo`,
--     Form `scrypt$N$r$p`), damit sie spaeter erhoeht werden koennen, ohne
--     bestehende Zeilen unlesbar zu machen.
--
-- scrypt statt Argon2id, weil `node:crypto` es mitbringt: eine
-- Passwort-Hashing-Bibliothek waere eine neue Produktivabhaengigkeit
-- (`.claude/rules/dependencies.md`, vor der Installation freigabepflichtig)
-- fuer ein Verfahren, das die Standardbibliothek bereits in der von OWASP
-- akzeptierten Form anbietet.
--
-- =====================================================================
-- Sperren statt raten lassen
-- =====================================================================
-- `fehlversuche`/`gesperrt_bis` sind kein Komfort, sondern die einzige
-- Bremse gegen das Durchprobieren eines Codes. Der Code ist kurz genug, um
-- ihn abzutippen — also auch kurz genug, um ihn zu raten, wenn niemand zaehlt.
--
-- =====================================================================
-- Rechte
-- =====================================================================
-- `edms_app` bekommt SELECT/INSERT/UPDATE. KEIN DELETE: Ein Zugang wird
-- gesperrt, nicht geloescht — sonst waere nachtraeglich nicht mehr zu
-- belegen, dass ein Kunde einen hatte. Die Loeschung laeuft ueber den
-- Krypto-Shred des Endkunden (s. u.).

CREATE SCHEMA IF NOT EXISTS portal;

-- =====================================================================
-- Der Zugang -- genau einer je Endkunde
-- =====================================================================
CREATE TABLE portal.zugang (
    id                    uuid PRIMARY KEY,
    endkunde_id           uuid NOT NULL UNIQUE REFERENCES energy.endkunde(id),

    -- Einmal-Zugangscode, NUR als Hash (s. Datei-Kopf). NULL, sobald
    -- eingeloest oder abgelaufen-und-ersetzt.
    code_hash             bytea,
    code_gueltig_bis      timestamptz,
    code_ausgegeben_at    timestamptz,

    -- Nach der Einloesung: das vom Kunden gesetzte Passwort.
    passwort_hash         bytea,
    passwort_salt         bytea,
    -- Form `scrypt$N$r$p` -- die Parameter gehoeren zur Zeile, nicht in eine
    -- Konstante im Code: sonst waeren alte Hashes nach einer Erhoehung nicht
    -- mehr pruefbar.
    passwort_algo         text,
    passwort_gesetzt_at   timestamptz,

    fehlversuche          smallint    NOT NULL DEFAULT 0,
    gesperrt_bis          timestamptz,

    -- ausgegeben = Code verschickt, noch nicht eingeloest
    -- aktiv       = Passwort gesetzt, Anmeldung moeglich
    -- gesperrt    = vom Betrieb stillgelegt (kein Selbstheilungs-Zustand)
    status                text        NOT NULL,

    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_portal_zugang_status CHECK (status IN ('ausgegeben', 'aktiv', 'gesperrt')),
    CONSTRAINT ck_portal_zugang_fehlversuche CHECK (fehlversuche >= 0),
    -- Ein Hash ohne Ablauf waere ein unbefristeter Zweitschluessel.
    CONSTRAINT ck_portal_zugang_code_kohaerenz CHECK (
        (code_hash IS NULL AND code_gueltig_bis IS NULL AND code_ausgegeben_at IS NULL)
     OR (code_hash IS NOT NULL AND code_gueltig_bis IS NOT NULL AND code_ausgegeben_at IS NOT NULL)
    ),
    -- Hash, Salt und Parameter sind ohne einander wertlos.
    CONSTRAINT ck_portal_zugang_passwort_kohaerenz CHECK (
        (passwort_hash IS NULL AND passwort_salt IS NULL AND passwort_algo IS NULL AND passwort_gesetzt_at IS NULL)
     OR (passwort_hash IS NOT NULL AND passwort_salt IS NOT NULL AND passwort_algo IS NOT NULL AND passwort_gesetzt_at IS NOT NULL)
    ),
    -- `aktiv` behauptet, dass eine Anmeldung moeglich ist. Ohne Passwort
    -- waere das falsch -- und der Anmeldepfad muesste den Zustand abfangen,
    -- den es hier gar nicht geben darf.
    CONSTRAINT ck_portal_zugang_aktiv_hat_passwort CHECK (
        status <> 'aktiv' OR passwort_hash IS NOT NULL
    )
);

COMMENT ON TABLE portal.zugang IS
  'Endkunden-Zugang zum Nutzerportal ([Q3] Kap. 6). pii=indirekt (pseudonym ueber endkunde_id). Weder Zugangscode noch Passwort liegen im Klartext vor -- der Code existiert genau einmal, im Brief. retention=an den Endkunden gebunden: der Krypto-Shred macht die zugehoerigen Verbrauchsdaten unlesbar, dieser Zugang wird dabei gesperrt (EndkundeService.shred()).';
COMMENT ON COLUMN portal.zugang.code_hash IS
  'pii=false; SHA-256 ueber den Einmal-Zugangscode. Der Klartext wird beim Ausgeben EINMAL erzeugt, in den Brief geschrieben und nie gespeichert -- ein nachschlagbarer Code waere ein Generalschluessel zu fremden Verbrauchsdaten. Ein einfacher Hash genuegt hier (anders als beim Passwort): der Code ist zufaellig und kurzlebig, nicht vom Menschen gewaehlt.';
COMMENT ON COLUMN portal.zugang.passwort_algo IS
  'pii=false; scrypt-Parameter der Zeile, Form `scrypt$N$r$p` (RFC 7914). Steht MIT in der Zeile, damit die Parameter spaeter erhoeht werden koennen, ohne bestehende Hashes unlesbar zu machen.';
COMMENT ON COLUMN portal.zugang.gesperrt_bis IS
  'pii=false; Zeitsperre nach zu vielen Fehlversuchen. Die einzige Bremse gegen das Durchprobieren eines abtippbaren Codes.';

-- =====================================================================
-- Die Sitzung
-- =====================================================================
-- Das Sitzungs-Token liegt beim Kunden in einem `__Host-`-Cookie
-- (httpOnly/Secure/SameSite), hier NUR als Hash: Ein Datenbankleser darf sich
-- damit nicht anmelden koennen.
CREATE TABLE portal.sitzung (
    id            uuid PRIMARY KEY,
    zugang_id     uuid        NOT NULL REFERENCES portal.zugang(id),
    token_hash    bytea       NOT NULL UNIQUE,
    erstellt_at   timestamptz NOT NULL DEFAULT now(),
    laeuft_ab_at  timestamptz NOT NULL,
    -- Gesetzt bei Abmeldung oder Sperrung. Append-only-Linie: eine beendete
    -- Sitzung bleibt stehen, damit spaeter belegbar ist, dass es sie gab.
    beendet_at    timestamptz,
    beendet_grund text,

    CONSTRAINT ck_portal_sitzung_ablauf CHECK (laeuft_ab_at > erstellt_at),
    CONSTRAINT ck_portal_sitzung_beendet CHECK (
        (beendet_at IS NULL AND beendet_grund IS NULL)
     OR (beendet_at IS NOT NULL AND beendet_grund IS NOT NULL)
    ),
    CONSTRAINT ck_portal_sitzung_token_laenge CHECK (octet_length(token_hash) = 32)
);

COMMENT ON TABLE portal.sitzung IS
  'Portal-Sitzungen. Das Token liegt beim Kunden im __Host--Cookie und hier NUR als SHA-256 -- ein Datenbankleser darf sich damit nicht anmelden koennen. Beendete Sitzungen bleiben stehen (append-only-Linie).';

CREATE INDEX ix_portal_sitzung_zugang ON portal.sitzung (zugang_id, laeuft_ab_at DESC);
-- Der Abmelde-/Aufraeumpfad sucht die offenen Sitzungen eines Zugangs.
CREATE INDEX ix_portal_sitzung_offen ON portal.sitzung (zugang_id) WHERE beendet_at IS NULL;

CREATE TRIGGER trg_portal_zugang_updated_at BEFORE UPDATE ON portal.zugang
    FOR EACH ROW EXECUTE FUNCTION energy.set_updated_at();

GRANT USAGE ON SCHEMA portal TO edms_app;
-- KEIN DELETE: Ein Zugang wird gesperrt, nicht geloescht (s. Datei-Kopf).
GRANT SELECT, INSERT, UPDATE ON portal.zugang  TO edms_app;
GRANT SELECT, INSERT, UPDATE ON portal.sitzung TO edms_app;
