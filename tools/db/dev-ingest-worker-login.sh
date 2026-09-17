#!/usr/bin/env bash
# EDMS — Dev-Setup: Login-Rolle des Ingest-Workers.
#
# ANLASS (Befund 2026-09-05, ADR-0011 C3)
# ---------------------------------------
# `.env.example` verweist seit ADR-0005 auf die Verbindungsrolle
# `edms_ingest_worker_login` — **angelegt wurde sie nirgends.** Weder in einer
# Migration noch in einem Setup-Skript. In einer frisch aufgesetzten Umgebung
# konnte sich der Ingest-Worker deshalb nie verbinden; er scheiterte mit
# `role "edms_ingest_worker_login" does not exist`. Wer ihn bisher betrieb,
# hatte die Rolle irgendwann von Hand angelegt — und damit einen
# Umgebungszustand, den das Repository nicht reproduziert.
#
# WARUM NICHT IN EINER MIGRATION
# ------------------------------
# Die GRUPPENROLLE `edms_ingest_worker` (NOLOGIN, mit allen Grants) entsteht
# korrekt in V0010 — sie traegt kein Geheimnis. Eine LOGIN-Rolle braucht ein
# Passwort, und ein Passwort gehoert nicht in eine versionierte Migration:
# Das Repository wird unter Apache-2.0 veroeffentlicht (Foerderauflage), und
# `.claude/rules/dependencies.md`/DS-10 verbieten Klartext-Zugangsdaten im
# Quellcode. Dasselbe Muster wie beim Keycloak-Client-Secret
# (`tools/keycloak/bootstrap-secret.sh`): Struktur versioniert, Geheimnis aus
# der Umgebung.
#
# NUR DEV. In Produktion wird diese Rolle vom Betrieb angelegt, das Passwort
# kommt aus Vault/KMS, und statt Passwort-Authentifizierung ist mTLS oder
# SCRAM mit rotierten Anmeldedaten vorzuziehen. Dieses Skript ist ausdruecklich
# KEIN Produktions-Provisionierungsweg.
#
# HART FEHLSCHLAGEND: fehlt eine Pflicht-Variable oder ist die Datenbank nicht
# erreichbar, bricht das Skript mit Exit-Code 1 ab — kein stiller Leerlauf.
#
# Verwendung:
#   EDMS_INGEST_WORKER_PASSWORD=DevOnlyIngestWorker2026 \
#     ./tools/db/dev-ingest-worker-login.sh
#
# Env-Variablen:
#   EDMS_INGEST_WORKER_PASSWORD   Pflicht. Passwort der Login-Rolle.
#   PGHOST/PGPORT/PGUSER/PGDATABASE   Optional; Defaults unten. Alternativ
#                                     wird POSTGRES_PORT aus der .env genutzt.

set -euo pipefail

ROLLE="edms_ingest_worker_login"
GRUPPE="edms_ingest_worker"

: "${EDMS_INGEST_WORKER_PASSWORD:?FEHLT: EDMS_INGEST_WORKER_PASSWORD. Ohne Passwort keine Login-Rolle — und ein hier eingebautes Standardpasswort waere ein Zugangsdatum im oeffentlichen Repository.}"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-edms}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-edms}}"
export PGHOST PGPORT PGUSER PGDATABASE

if ! command -v psql > /dev/null 2>&1; then
  echo "FEHLER: psql nicht gefunden. Entweder psql installieren oder das Skript im DB-Container ausfuehren." >&2
  exit 1
fi

echo "==> Login-Rolle ${ROLLE} auf ${PGHOST}:${PGPORT}/${PGDATABASE} einrichten (nur Dev)..."

# PASSWORT-UEBERGABE — was hier geht und was nicht.
#
# Ein Rollenpasswort erreicht den Server IMMER als Teil einer Anweisung:
# `ALTER ROLE ... PASSWORD` kennt keine gebundenen Parameter, das ist eine
# Eigenschaft von Postgres-DDL und nicht umgehbar. Vermeidbar sind dagegen
# zwei andere Austrittsstellen, und um die geht es hier:
#
#   * die PROZESSLISTE des Hosts — deshalb KEIN `--set pw=...` (das landete in
#     argv und waere fuer jeden `ps`-Aufruf sichtbar) und kein Passwort in der
#     Kommandozeile;
#   * die psql-HISTORIE — deshalb `--no-psqlrc` und die Uebergabe per
#     `\getenv` aus der Umgebung.
#
# Wer zusaetzlich das Server-Log schuetzen will, setzt fuer die Dauer des
# Aufrufs `log_statement=none`. Im Dev ist das nicht vorgesehen; in Produktion
# wird diese Rolle ohnehin nicht so angelegt (s. Kopf).
psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 <<'SQL'
\getenv pw EDMS_INGEST_WORKER_PASSWORD

-- Der Wert wird HIER uebergeben, nicht im DO-Block: psql ersetzt seine
-- Variablen NICHT innerhalb dollar-quotierter Bloecke ($$...$$) -- dort bliebe
-- `:'pw'` ein Syntaxfehler. `set_config(..., false)` legt ihn fuer die
-- Sitzung ab; der DO-Block liest ihn mit `current_setting`.
SELECT set_config('edms.dev_worker_pw', :'pw', false);

DO $$
DECLARE
    v_pw text := current_setting('edms.dev_worker_pw', true);
BEGIN
    IF v_pw IS NULL OR btrim(v_pw) = '' THEN
        RAISE EXCEPTION 'Passwort leer — Abbruch statt Rolle ohne Passwort.';
    END IF;

    -- `CREATE ROLE` kennt kein `IF NOT EXISTS` (Rollen sind cluster-global) --
    -- dasselbe DO-Block-Idiom wie in V0003/V0010.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_ingest_worker_login') THEN
        EXECUTE format('CREATE ROLE edms_ingest_worker_login LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_ingest_worker_login angelegt.';
    ELSE
        -- Idempotent: vorhandene Rolle bekommt das aktuelle Passwort. Das ist
        -- zugleich der Rotationsweg im Dev.
        EXECUTE format('ALTER ROLE edms_ingest_worker_login WITH LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_ingest_worker_login existierte bereits — Passwort gesetzt.';
    END IF;

    -- Die Rechte haengen an der GRUPPENROLLE (V0010, spaltenscharf, RL-1).
    -- Die Login-Rolle bekommt selbst KEINE eigenen Grants — sie erbt
    -- ausschliesslich. Damit bleibt V0010 die einzige Stelle, an der ueber
    -- die Rechte des Workers entschieden wird.
    IF NOT EXISTS (
        SELECT 1
          FROM pg_auth_members m
          JOIN pg_roles r ON r.oid = m.roleid
          JOIN pg_roles g ON g.oid = m.member
         WHERE r.rolname = 'edms_ingest_worker'
           AND g.rolname = 'edms_ingest_worker_login'
    ) THEN
        EXECUTE 'GRANT edms_ingest_worker TO edms_ingest_worker_login';
        RAISE NOTICE 'Mitgliedschaft in edms_ingest_worker erteilt.';
    END IF;

    -- Ein Verbindungsrecht auf die Datenbank braucht sie zusaetzlich; PUBLIC
    -- hat es standardmaessig, aber darauf zu bauen waere eine Annahme ueber
    -- eine Einstellung, die ein Betrieb sinnvollerweise entzieht.
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO edms_ingest_worker_login', current_database());
END
$$;

-- Sitzungsvariable wieder leeren. Die Sitzung endet gleich ohnehin, aber ein
-- Passwort laenger in `current_setting` stehen zu lassen als noetig, ist eine
-- Gewohnheit, die man sich nicht angewoehnt.
SELECT set_config('edms.dev_worker_pw', '', false);
SQL

echo "==> Fertig. Verbindungszeichenkette fuer .env:"
echo "    EDMS_INGEST_DATABASE_URL=postgresql://${ROLLE}:<passwort>@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "    (Die Rolle erbt ihre Rechte ausschliesslich aus ${GRUPPE} — V0010, spaltenscharf.)"
