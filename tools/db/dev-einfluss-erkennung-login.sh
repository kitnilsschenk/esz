#!/usr/bin/env bash
# EDMS — Dev-Setup: Login-Rolle des TB-03-Erkennungslaufs.
#
# ANLASS
# ------
# V0079 legt die GRUPPENROLLE `edms_einfluss_erkennung` an (NOLOGIN, mit den
# spaltenscharfen Grants). Der Erkennungslauf braucht zusaetzlich eine
# LOGIN-Rolle — und genau an dieser Stelle ist das Repository beim Ingest-
# Worker schon einmal auseinandergelaufen: `.env.example` verwies auf eine
# Rolle, die nirgends angelegt wurde, und in einer frischen Umgebung
# scheiterte der Worker mit `role ... does not exist` (Befund 2026-09-05).
# Dieses Skript ist die Konsequenz daraus, im selben Zuschnitt wie
# `dev-ingest-worker-login.sh`.
#
# WARUM NICHT IN DER MIGRATION
# ----------------------------
# Eine LOGIN-Rolle braucht ein Passwort, und ein Passwort gehoert nicht in
# eine versionierte Migration: Das Repository wird unter Apache-2.0
# veroeffentlicht (Foerderauflage), Klartext-Zugangsdaten im Quellcode sind
# nach DS-10 unzulaessig. Struktur versioniert, Geheimnis aus der Umgebung.
#
# WARUM DIESE ROLLE UEBERHAUPT
# ----------------------------
# Der Lauf liest unbeaufsichtigt Klartext-Personendaten (Personenanzahl,
# Nutzflaeche). Ueber die App-Verbindung liefe er als Eigentuemer der
# Datenbank — mit Loeschrecht auf genau diese Daten. `edms_einfluss_erkennung`
# darf lesen und Befunde schreiben, sonst nichts (Auflage A20 des
# compliance-director-Votums vom 2026-09-16). Die Einschraenkung erzwingt
# PostgreSQL, nicht der Anwendungscode.
#
# NUR DEV. In Produktion legt der Betrieb die Rolle an, das Passwort kommt aus
# Vault/KMS, und mTLS oder SCRAM mit rotierten Anmeldedaten sind vorzuziehen.
#
# Verwendung:
#   EDMS_EINFLUSS_ERKENNUNG_PASSWORD=DevOnlyErkennung2026 \
#     ./tools/db/dev-einfluss-erkennung-login.sh
#
# Env-Variablen:
#   EDMS_EINFLUSS_ERKENNUNG_PASSWORD  Pflicht. Passwort der Login-Rolle.
#   PGHOST/PGPORT/PGUSER/PGDATABASE   Optional; Defaults unten.

set -euo pipefail

ROLLE="edms_einfluss_erkennung_login"
GRUPPE="edms_einfluss_erkennung"

: "${EDMS_EINFLUSS_ERKENNUNG_PASSWORD:?FEHLT: EDMS_EINFLUSS_ERKENNUNG_PASSWORD. Ohne Passwort keine Login-Rolle — und ein hier eingebautes Standardpasswort waere ein Zugangsdatum im oeffentlichen Repository.}"

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

# Passwort-Uebergabe per `\getenv` statt `--set`: sonst stuende es in argv und
# waere fuer jeden `ps`-Aufruf sichtbar. `--no-psqlrc` haelt es aus der
# psql-Historie. Begruendung ausfuehrlich in `dev-ingest-worker-login.sh`.
psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 <<'SQL'
\getenv pw EDMS_EINFLUSS_ERKENNUNG_PASSWORD

-- psql ersetzt seine Variablen NICHT innerhalb dollar-quotierter Bloecke —
-- der Wert wird deshalb hier in die Sitzung gelegt und im DO-Block gelesen.
SELECT set_config('edms.dev_erkennung_pw', :'pw', false);

DO $$
DECLARE
    v_pw text := current_setting('edms.dev_erkennung_pw', true);
BEGIN
    IF v_pw IS NULL OR btrim(v_pw) = '' THEN
        RAISE EXCEPTION 'Passwort leer — Abbruch statt Rolle ohne Passwort.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_einfluss_erkennung') THEN
        RAISE EXCEPTION 'Gruppenrolle edms_einfluss_erkennung fehlt — V0079 zuerst anwenden.';
    END IF;

    -- `CREATE ROLE` kennt kein `IF NOT EXISTS` (Rollen sind cluster-global) --
    -- dasselbe DO-Block-Idiom wie in V0003/V0010/V0079.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_einfluss_erkennung_login') THEN
        EXECUTE format('CREATE ROLE edms_einfluss_erkennung_login LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_einfluss_erkennung_login angelegt.';
    ELSE
        -- Idempotent; zugleich der Rotationsweg im Dev.
        EXECUTE format('ALTER ROLE edms_einfluss_erkennung_login WITH LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_einfluss_erkennung_login existierte bereits — Passwort gesetzt.';
    END IF;

    -- Die Rechte haengen ausschliesslich an der GRUPPENROLLE (V0079). Die
    -- Login-Rolle bekommt KEINE eigenen Grants — sie erbt nur. Damit bleibt
    -- V0079 die einzige Stelle, an der ueber die Rechte des Laufs entschieden
    -- wird, und ein `\du`-Blick zeigt sofort, dass hier nichts nachtraeglich
    -- aufgeweitet wurde.
    IF NOT EXISTS (
        SELECT 1
          FROM pg_auth_members m
          JOIN pg_roles r ON r.oid = m.roleid
          JOIN pg_roles g ON g.oid = m.member
         WHERE r.rolname = 'edms_einfluss_erkennung'
           AND g.rolname = 'edms_einfluss_erkennung_login'
    ) THEN
        EXECUTE 'GRANT edms_einfluss_erkennung TO edms_einfluss_erkennung_login';
        RAISE NOTICE 'Mitgliedschaft in edms_einfluss_erkennung erteilt.';
    END IF;

    EXECUTE format('GRANT CONNECT ON DATABASE %I TO edms_einfluss_erkennung_login', current_database());
END
$$;

SELECT set_config('edms.dev_erkennung_pw', '', false);
SQL

echo "==> Fertig. Verbindungszeichenkette fuer .env:"
echo "    EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL=postgresql://${ROLLE}:<passwort>@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "    (Die Rolle erbt ihre Rechte ausschliesslich aus ${GRUPPE} — V0079: lesen und Befunde schreiben, sonst nichts.)"
