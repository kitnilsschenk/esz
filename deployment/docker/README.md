# EDMS Dev-Stack (Docker Compose)

Bezug: `docs/adr/ADR-0001-projekt-skelett.md`, Abschnitt 10.5 (Dev-Stack) und
Abschnitt 4.1 (User-Entscheidung F4: schlanker Dev-Compose-Stack);
`docs/adr/ADR-0002-auth-modul.md` Teil B §14/§16 (Keycloak, Phase 4 AP-A).

## Was hier läuft — und was bewusst NICHT

Dieser Stack enthält **PostgreSQL 16 + TimescaleDB** und (seit ADR-0002
Phase 4 AP-A) **Keycloak** (Identitäts-/AuthN-Dienst, secret-freier
Realm-Import aus `deployment/keycloak/realm-edms.json` — Details und
Design-Entscheidungen in `deployment/keycloak/README.md`). MinIO und
OpenSearch werden **erst mit ihren jeweiligen Features** als eigene
Netzwerkdienste ergänzt — nicht vorab in dieses File eingebaut.

## Voraussetzung: `.env`

Der Stack liest DB- und Keycloak-Zugangsdaten aus Umgebungsvariablen mit
**Dev-Defaults** (siehe `environment:`-Blöcke in `docker-compose.dev.yml`),
die exakt den Variablen aus `.env.example` (Repo-Root) entsprechen:
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`,
`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_PORT`,
`KEYCLOAK_MANAGEMENT_PORT`.

Falls noch nicht geschehen: `.env.example` (Repo-Root) nach `.env` kopieren
und lokal anpassen. `.env` ist git-ignoriert.

## Start / Stop

Von **Repo-Root** ausführen, damit Compose eure `.env` findet und
Variablen-Overrides greifen (ohne `--env-file` gelten die im Compose-File
gesetzten Dev-Defaults):

```bash
# Start (im Hintergrund) — alle Dienste
docker compose --env-file .env -f deployment/docker/docker-compose.dev.yml up -d

# Nur Keycloak (z. B. für Auth-Arbeit ohne DB-Bedarf)
docker compose --env-file .env -f deployment/docker/docker-compose.dev.yml up -d keycloak

# Status / Healthcheck prüfen
docker compose -f deployment/docker/docker-compose.dev.yml ps

# Logs
docker compose -f deployment/docker/docker-compose.dev.yml logs -f postgres
docker compose -f deployment/docker/docker-compose.dev.yml logs -f keycloak

# Stop (Volumes bleiben erhalten — Keycloak hat ohnehin kein Volume, s. u.)
docker compose -f deployment/docker/docker-compose.dev.yml down

# Stop + Volume löschen (alle lokalen DB-Daten weg — nur für einen sauberen Neustart)
docker compose -f deployment/docker/docker-compose.dev.yml down -v
```

Nach dem ersten Hochfahren von Keycloak das Client-Secret setzen (siehe
`tools/keycloak/README.md`):

```bash
KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
EDMS_BFF_CLIENT_SECRET=changeme_local_dev_only_bff_secret \
./tools/keycloak/bootstrap-secret.sh
```

Ohne `--env-file .env` laufen die in `docker-compose.dev.yml` hinterlegten
Dev-Defaults (`edms` / `changeme_local_dev_only` / Port `5432`) — bewusst
identisch zu `.env.example`, damit der Stack auch ganz ohne lokale `.env`
sofort startet.

## `-oss`-Pflicht (Förderauflage)

Das Image-Suffix **`-oss`** ist zwingend — siehe
`.claude/rules/dependencies.md`, Abschnitt "TimescaleDB: nur Apache-2-Edition".
Nur die Apache-2-lizenzierte Community-OSS-Edition darf verwendet werden; das
Image **ohne** `-oss`-Suffix enthält TSL-lizenzierte Features
(Compression-/Retention-/Continuous-Aggregate-Policies), die im Produkt
verboten sind (dieselbe Regel verbietet auch die entsprechenden SQL-Befehle
in Migrationen, z. B. `add_compression_policy(...)`).

**Wichtig:** Der in `docker-compose.dev.yml` gepinnte Tag wurde ohne
Netzzugriff gewählt (siehe Kommentar im File) und sollte vor dem ersten
Pull gegen die aktuelle Tag-Liste auf Docker Hub verifiziert werden:
<https://hub.docker.com/r/timescale/timescaledb/tags>. Ein Versions-Update
ist eine bewusste, dokumentierte Änderung dieser Datei — kein `latest`-Tag,
um Reproduzierbarkeit (Erfolgsmetrik M6, ADR-0001) nicht zu gefährden.

## Extensions

`docker-compose.dev.yml` legt **keine** Extensions an (kein `CREATE
EXTENSION`) — das ist Aufgabe der Baseline-Migration
(`CREATE EXTENSION IF NOT EXISTS timescaledb;`, ggf. `pgcrypto`), die über
den `/add-migration`-Workflow mit Review angelegt wird (siehe ADR-0001,
Abschnitte 10.4 und 11) und anschließend über den Migrations-Runner
(`tools/migrate/`, `@edms/migrate`) angewendet wird.

## Zusammenspiel mit `tools/migrate`

```bash
# 1. Stack starten (s. o.)
# 2. Migrationen anwenden — Runner liest dieselben POSTGRES_*-Variablen
DATABASE_URL=postgres://edms:changeme_local_dev_only@localhost:5432/edms \
  node tools/migrate/dist/cli.js status
```

Details zum Runner (Namenskonvention, Checksum-Drift, Advisory-Lock,
`down`-Semantik): siehe `tools/migrate/README.md`.
