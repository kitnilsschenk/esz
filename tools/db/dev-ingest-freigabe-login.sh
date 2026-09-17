#!/usr/bin/env bash
# EDMS — Dev-Setup: Login-Rolle für die Ingest-Gate-Erklärung.
#
# ANLASS
# ------
# V0083 legt die GRUPPENROLLE `edms_ingest_freigabe` an (NOLOGIN, mit
# INSERT/SELECT auf `gate.ingest_freigabe` und EXECUTE auf den
# zweckgebundenen Audit-Wrapper). Wer eine Erklaerung abgibt, braucht
# zusaetzlich eine LOGIN-Rolle — sonst existiert das Recht, aber niemand kann
# es ausueben. Gleicher Zuschnitt wie `dev-ingest-worker-login.sh` und
# `dev-einfluss-erkennung-login.sh`.
#
# WARUM NICHT IN DER MIGRATION
# ----------------------------
# Eine LOGIN-Rolle braucht ein Passwort, und ein Passwort gehoert nicht in
# eine versionierte Migration: Das Repository wird unter Apache-2.0
# veroeffentlicht (Foerderauflage), Klartext-Zugangsdaten im Quellcode sind
# nach DS-10 unzulaessig. Struktur versioniert, Geheimnis aus der Umgebung.
#
# WARUM DIESE ROLLE GETRENNT VON DER ANWENDUNG EXISTIERT
# ------------------------------------------------------
# Das ist der ganze Zweck des Markers (ADR-0008 §22): **Wer den Schalter
# umlegt, soll nicht derselbe sein koennen, der behauptet, die Voraussetzungen
# laegen vor.** `edms_app` darf den Stand LESEN und nicht schreiben; diese
# Rolle darf schreiben und sonst nichts. Faellt die Trennung, faellt der
# Sinn — dann ist der Marker wieder ein selbst-attestiertes Flag, nur mit
# mehr Aufwand.
#
# Deshalb gehoert das Passwort dieser Rolle NICHT in dieselbe Hand wie die
# Zugangsdaten der Anwendung. Im Dev ist das eine Formalie; im Betrieb ist es
# die Maßnahme.
#
# NUR DEV. In Produktion legt der Betrieb die Rolle an, das Passwort kommt aus
# Vault/KMS, und mTLS oder SCRAM mit rotierten Anmeldedaten sind vorzuziehen.
#
# Verwendung:
#   EDMS_INGEST_FREIGABE_PASSWORD=DevOnlyFreigabe2026 \
#     ./tools/db/dev-ingest-freigabe-login.sh
#
# Env-Variablen:
#   EDMS_INGEST_FREIGABE_PASSWORD   Pflicht. Passwort der Login-Rolle.
#   PGHOST/PGPORT/PGUSER/PGDATABASE Optional; Defaults unten.

set -euo pipefail

ROLLE="edms_ingest_freigabe_login"
GRUPPE="edms_ingest_freigabe"

: "${EDMS_INGEST_FREIGABE_PASSWORD:?FEHLT: EDMS_INGEST_FREIGABE_PASSWORD. Ohne Passwort keine Login-Rolle — und ein hier eingebautes Standardpasswort waere ein Zugangsdatum im oeffentlichen Repository.}"

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

# Passwort per `\getenv` statt `--set`: sonst stuende es in argv und waere fuer
# jeden `ps`-Aufruf sichtbar. Begruendung ausfuehrlich in
# `dev-ingest-worker-login.sh`.
psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 <<'SQL'
\getenv pw EDMS_INGEST_FREIGABE_PASSWORD

\o /dev/null
SELECT set_config('edms.dev_freigabe_pw', :'pw', false);
\o

DO $$
DECLARE
    v_pw text := current_setting('edms.dev_freigabe_pw', true);
BEGIN
    IF v_pw IS NULL OR btrim(v_pw) = '' THEN
        RAISE EXCEPTION 'Passwort leer — Abbruch statt Rolle ohne Passwort.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_ingest_freigabe') THEN
        RAISE EXCEPTION 'Gruppenrolle edms_ingest_freigabe fehlt — V0083 zuerst anwenden.';
    END IF;

    -- `CREATE ROLE` kennt kein `IF NOT EXISTS` (Rollen sind cluster-global).
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_ingest_freigabe_login') THEN
        EXECUTE format('CREATE ROLE edms_ingest_freigabe_login LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_ingest_freigabe_login angelegt.';
    ELSE
        -- Idempotent; zugleich der Rotationsweg im Dev.
        EXECUTE format('ALTER ROLE edms_ingest_freigabe_login WITH LOGIN PASSWORD %L', v_pw);
        RAISE NOTICE 'Rolle edms_ingest_freigabe_login existierte bereits — Passwort gesetzt.';
    END IF;

    -- Die Rechte haengen ausschliesslich an der GRUPPENROLLE (V0083). Die
    -- Login-Rolle bekommt hier KEIN eigenes Grant auf irgendein Objekt —
    -- sonst liefen zwei Rechte-Quellen nebeneinander, und beim naechsten
    -- Rueckbau bliebe eine davon stehen.
    EXECUTE 'GRANT edms_ingest_freigabe TO edms_ingest_freigabe_login';
    RAISE NOTICE 'Mitgliedschaft in edms_ingest_freigabe erteilt.';
END $$;
SQL

echo "==> Fertig."
echo "    Eine Erklaerung abgeben (Beispiel, Werte anpassen):"
echo "      INSERT INTO gate.ingest_freigabe"
echo "        (id, art, aktenstand_fingerabdruck, freigabe_ref,"
echo "         de_only_hosting_attestiert, tia_attestiert, attestiert_durch)"
echo "      VALUES (gen_random_uuid(), 'freigabe',"
echo "         '<node tools/ci/ingest-gate-status.mjs --fingerabdruck>',"
echo "         '<Aktenzeichen des Freigabedokuments>', true, true,"
echo "         'geschaeftsfuehrung');"
echo "    Danach im selben Vorgang das Audit-Ereignis:"
echo "      SELECT audit.append_ingest_freigabe_event(<id>, 'freigabe', <fingerabdruck>, <ref>, <funktion>);"
