#!/usr/bin/env bash
# EDMS — Bootstrap: Owner-Rollen VOR dem ersten Migrationslauf anlegen.
#
# ANLASS
# ------
# Drei Migrationen uebertragen Objekt-Eigentum an eine eigens angelegte
# Owner-Rolle, damit der Eigentuemer NICHT der Superuser und nicht die
# App-Laufzeitrolle ist:
#
#   V0003 -> edms_audit_owner       (Audit-Log, SECURITY-DEFINER-Funktionen)
#   V0019 -> edms_analytics_owner   (alle analytics-Objekte, D-A6-OWNER)
#   V0025 -> edms_nachweis_owner    (alle nachweis-Objekte)
#
# Seit PostgreSQL 16 verlangt `ALTER ... OWNER TO <rolle>`, dass die
# ausfuehrende Sitzung per SET ROLE auf diese Rolle wechseln KANN. `CREATE
# ROLE` gewaehrt der erzeugenden Rolle seither nur noch ADMIN OPTION, NICHT
# mehr automatisch das SET-Recht. Die drei Migrationen holen sich dieses Recht
# nicht selbst — unter einer echten, nicht-superuser Migrationsrolle scheitern
# sie deshalb jeweils mit:
#
#   ERROR:  must be able to SET ROLE "edms_audit_owner"
#
# WARUM DAS BISHER NIEMANDEM AUFGEFALLEN IST
# ------------------------------------------
# Der Dev-Stack und jeder Testcontainer laufen als Bootstrap-Superuser, und
# ein Superuser umgeht die Pruefung vollstaendig. Der Fehler schlaegt also
# GENAU DANN zu, wenn man es richtig macht — beim ersten Least-Privilege-
# Deployment gegen eine frische Datenbank. Gefunden am 2026-09-17 bei der
# Verifikation von V0083 (ADR-0012 Stufe C, Auflage C-1) gegen eine echte
# nicht-superuser Rolle.
#
# WARUM DAS KEINE MIGRATION REPARIEREN KANN
# -----------------------------------------
# Zwei Gruende, und beide sind hart:
#
#  1. Die drei Dateien sind ANGEWENDET. Der Runner haelt je Datei eine
#     SHA-256-Pruefsumme und bricht bei Abweichung ab, ohne Auto-Repair
#     (`ChecksumDriftError`, ADR-0001 §10.4 (b)). Sie nachtraeglich zu aendern
#     waere eine append-only-Verletzung.
#
#  2. Eine SPAETERE Migration kaeme zu spaet. Jede Migrationsdatei laeuft in
#     EINER Transaktion; scheitert `ALTER ... OWNER TO`, rollt alles in dieser
#     Datei zurueck — auch das `CREATE ROLE`, das kurz zuvor in DERSELBEN
#     Transaktion lief. Nach dem Fehlschlag existiert die Rolle also gar
#     nicht, und ein nachtraegliches `GRANT ... WITH SET TRUE` liefe ins Leere.
#
# Die Rechte muessen deshalb VOR dem Lauf stehen, ausserhalb jeder
# Migrations-Transaktion. Genau das tut dieses Skript.
#
# WARUM DAS UNGEFAEHRLICH IST
# ---------------------------
# Alle drei Migrationen legen ihre Rolle im idempotenten Muster an
# (`DO $$ ... EXCEPTION WHEN duplicate_object THEN RAISE NOTICE`). Eine vorab
# angelegte Rolle finden sie vor und ueberspringen den Schritt — derselbe
# Pfad, der auch greift, wenn die Rolle aus einem frueheren Lauf im selben
# Cluster stammt (Rollen sind cluster-global, nicht datenbankgebunden).
#
# Die Rollen sind NOLOGIN und haben kein Passwort. Dieses Skript enthaelt
# folglich kein Geheimnis und ist — anders als die `dev-*-login.sh` daneben —
# NICHT auf Dev beschraenkt: Es gehoert in jede Umgebung, in der die
# Migrationskette gegen eine frische Datenbank unter einer Rolle ohne
# Superuser-Recht laeuft.
#
# Verwendung (vor `migrate up`):
#   EDMS_MIGRATION_ROLE=edms_migrator ./tools/db/bootstrap-owner-rollen.sh
#
# Env-Variablen:
#   EDMS_MIGRATION_ROLE  Die Rolle, die spaeter `migrate up` ausfuehrt.
#                        Default: $PGUSER. Sie bekommt das SET-Recht.
#   PGHOST/PGPORT/PGUSER/PGDATABASE  Optional; Defaults unten.
#
# Auszufuehren ist es von einer Rolle, die `CREATE ROLE` darf (Superuser oder
# CREATEROLE) — im Betrieb typischerweise einmalig beim Aufsetzen der
# Datenbank, nicht bei jedem Deploy.

set -euo pipefail

# Rollen, deren Migration sich das SET-Recht NICHT selbst gewaehrt.
# V0083 (consent-Gate) ist bewusst NICHT dabei: Sie holt sich das Recht
# selbst, weil sie nach dem Befund entstanden ist — s. dort.
OWNER_ROLLEN=(edms_audit_owner edms_analytics_owner edms_nachweis_owner)

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-edms}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-edms}}"
export PGHOST PGPORT PGUSER PGDATABASE

MIGRATION_ROLE="${EDMS_MIGRATION_ROLE:-$PGUSER}"

if ! command -v psql > /dev/null 2>&1; then
  echo "FEHLER: psql nicht gefunden. Entweder psql installieren oder das Skript im DB-Container ausfuehren." >&2
  exit 1
fi

echo "==> Owner-Rollen auf ${PGHOST}:${PGPORT}/${PGDATABASE} vorbereiten,"
echo "    SET-Recht fuer die Migrationsrolle '${MIGRATION_ROLE}'."

export EDMS_BOOTSTRAP_MIGRATION_ROLE="${MIGRATION_ROLE}"

psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 <<'SQL'
\getenv migrationsrolle EDMS_BOOTSTRAP_MIGRATION_ROLE

-- Ohne `\o` druckt psql die Rueckgabe von set_config als Ergebnistabelle --
-- ein Wert, der niemanden interessiert, aber die Notices ueberdeckt.
\o /dev/null
SELECT set_config('edms.bootstrap_migrationsrolle', :'migrationsrolle', false);
\o

DO $$
DECLARE
    v_rolle          text;
    v_migrationsrolle text := current_setting('edms.bootstrap_migrationsrolle', true);
    v_owner_rollen   text[] := ARRAY['edms_audit_owner', 'edms_analytics_owner', 'edms_nachweis_owner'];
    v_pg_version     int := current_setting('server_version_num')::int;
BEGIN
    IF v_migrationsrolle IS NULL OR btrim(v_migrationsrolle) = '' THEN
        RAISE EXCEPTION 'Migrationsrolle leer — Abbruch statt Grant ins Nichts.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_migrationsrolle) THEN
        RAISE EXCEPTION
            'Migrationsrolle % existiert nicht. Erst anlegen, dann dieses Skript.', v_migrationsrolle;
    END IF;

    FOREACH v_rolle IN ARRAY v_owner_rollen LOOP
        -- `CREATE ROLE` kennt kein `IF NOT EXISTS` (Rollen sind cluster-global)
        -- — dasselbe DO-Block-Idiom wie in V0003/V0019/V0025 selbst.
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rolle) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', v_rolle);
            RAISE NOTICE 'Rolle % angelegt.', v_rolle;
        ELSE
            RAISE NOTICE 'Rolle % existierte bereits — unveraendert.', v_rolle;
        END IF;

        IF v_pg_version >= 160000 THEN
            -- Der eigentliche Zweck dieses Skripts. `WITH SET TRUE` gibt es
            -- erst ab PostgreSQL 16 — davor ist SET in der Mitgliedschaft
            -- enthalten und der Fehler tritt gar nicht auf.
            EXECUTE format(
                'GRANT %I TO %I WITH ADMIN OPTION, SET TRUE',
                v_rolle, v_migrationsrolle
            );
        ELSE
            EXECUTE format('GRANT %I TO %I WITH ADMIN OPTION', v_rolle, v_migrationsrolle);
        END IF;
        RAISE NOTICE 'SET-Recht auf % an % erteilt.', v_rolle, v_migrationsrolle;
    END LOOP;
END $$;
SQL

echo "==> Fertig. Die Migrationskette laeuft jetzt auch unter einer Rolle ohne Superuser-Recht."
echo "    Gegenprobe:  node tools/migrate/dist/cli.js status"
