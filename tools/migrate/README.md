# `@edms/migrate` — SQL-Migrations-Runner

Eigenständiger, schlanker Migrations-Runner für `migrations/**`
(ADR-0001 §10.4). Einzige Runtime-Dependency: [`pg`](https://node-postgres.com/)
(node-postgres, MIT). Kein Migrations-Framework, keine ORM-Bindung — die
Migrationsdateien selbst sind reines, review-fähiges SQL.

## Namenskonvention (verbindlich, `.claude/rules/database-migrations.md`)

```
migrations/
  V0001__create_extensions.sql
  V0001__create_extensions.down.sql
  V0002__<snake_case_beschreibung>.sql
  V0002__<snake_case_beschreibung>.down.sql
```

- `V<NNNN>__<snake_case>.sql` — **NNNN ist genau 4 Ziffern** (nicht "mindestens
  4"), lückenlos aufsteigend, beginnend bei `0001`.
- Zu jeder Up-Datei **muss** die gepaarte `V<NNNN>__<snake_case>.down.sql`
  existieren — sonst bricht jeder Befehl (`up`, `status`) bereits in der
  Validierungsphase ab, bevor irgendetwas an die Datenbank geht.
- `<snake_case>` erlaubt nur `[a-z0-9_]`, ohne führende/doppelte
  Unterstriche.

Der Runner sammelt **alle** Validierungsprobleme eines Laufs (Namensfehler,
fehlende Down-Datei, doppelte Version, Lücke in der Sequenz) in **einer**
Fehlermeldung, statt beim ersten Problem abzubrechen.

## Kommandos

```bash
# Nach dem Bauen (siehe unten) — oder via package.json-Skripte, s. u.
node dist/cli.js status
node dist/cli.js up
node dist/cli.js down --yes
```

Über pnpm-Skripte (nach `pnpm --filter @edms/migrate build`):

```bash
pnpm --filter @edms/migrate run status
pnpm --filter @edms/migrate run up
pnpm --filter @edms/migrate run down -- --yes
```

### `status`

Rein lesend: zeigt pro Migration Version, Status (`applied`/`pending`),
Checksum-Abgleich (`ok`/`DRIFT`) und Anwendungszeitpunkt (UTC). Legt **keine**
Tabelle an und mutiert nichts.

### `up`

> **Einmalig vor dem ERSTEN Lauf gegen eine frische Datenbank, wenn der
> Runner NICHT als Superuser läuft:**
>
> ```bash
> EDMS_MIGRATION_ROLE=<rolle-die-migriert> ./tools/db/bootstrap-owner-rollen.sh
> ```
>
> Drei Migrationen (V0003, V0019, V0025) übertragen Objekt-Eigentum an eine
> eigene Owner-Rolle, damit der Eigentümer weder Superuser noch die
> App-Laufzeitrolle ist. Seit PostgreSQL 16 verlangt `ALTER … OWNER TO`, dass
> die Sitzung per `SET ROLE` auf diese Rolle wechseln kann — und `CREATE ROLE`
> gewährt seither nur noch ADMIN OPTION, nicht mehr automatisch SET. Die drei
> Dateien holen sich das Recht nicht selbst und scheitern deshalb mit
> `must be able to SET ROLE "edms_audit_owner"`.
>
> **Warum keine Migration das reparieren kann:** Die drei sind angewendet, ihre
> Prüfsummen liegen fest (s. u.), und eine *spätere* Migration käme zu spät —
> jede Datei läuft in einer Transaktion, und der Fehlschlag rollt das
> `CREATE ROLE` derselben Datei mit zurück. Die Rolle existiert danach nicht,
> ein nachträgliches Grant liefe ins Leere. Die Rechte müssen vor dem Lauf
> stehen.
>
> Im Dev-Stack und in jedem Testcontainer fällt das nicht auf, weil beide als
> Bootstrap-Superuser laufen — der umgeht die Prüfung vollständig. Der Fehler
> schlägt also genau dann zu, wenn man es richtig macht.

Wendet alle ausstehenden Migrationen an. Ablauf:

1. Verzeichnis-Scan + Validierung (Namenskonvention, Paarung, Lückenlosigkeit).
2. `pg_advisory_lock` über den **gesamten Lauf** (fester, prozessweiter
   Schlüssel) — serialisiert parallele Runner-Aufrufe (CI + lokal) gegen
   dieselbe Datenbank.
3. `schema_migrations` sicherstellen (`CREATE TABLE IF NOT EXISTS`, s. u.).
4. **Checksum-Drift-Check zuerst**, über alle bereits angewendeten Versionen,
   **bevor** irgendetwas Neues angewendet wird (siehe Abschnitt
   "Checksum-Drift" unten).
5. Jede ausstehende Migration in ihrer **eigenen Transaktion**
   (`BEGIN`/`COMMIT`, bei Fehler `ROLLBACK`). Schlägt eine Migration fehl,
   bricht der gesamte Lauf ab — bereits committete frühere Migrationen im
   selben Lauf bleiben angewendet, die fehlgeschlagene und alle danach
   **nicht**.

### `down`

Rollt **ausschließlich die zuletzt angewendete** Migration zurück, über ihre
`.down.sql`. Erfordert das Bestätigungs-Flag `--yes` — ohne das Flag bricht
der Befehl mit einer Fehlermeldung ab, **ohne** die Datenbank zu berühren.

**Wichtig — `down` ist ein rein manueller Schritt:**

- `.down.sql` wird **niemals automatisch** bei einem fehlgeschlagenen `up`
  ausgeführt. Schlägt eine Migration innerhalb ihrer Transaktion fehl, genügt
  der `ROLLBACK` — es wurde nichts committet, es gibt nichts zurückzurollen.
- `down` rollt **genau eine** Migration zurück (die zuletzt angewendete),
  nicht kaskadierend mehrere. Für mehrere Schritte zurück: `down --yes`
  mehrfach hintereinander aufrufen.
- Vor dem Rollback prüft der Runner zusätzlich die Checksumme der
  zugehörigen Up-Datei (falls noch vorhanden) gegen den gespeicherten Wert —
  bei Drift bricht auch `down` ab (Diagnose zuerst über `status`/`up`).

## Checksum-Drift = harter Abbruch (kein Auto-Repair)

`schema_migrations` speichert pro angewendeter Migration einen
SHA-256-Hash ihres Datei-Inhalts. Weicht der aktuelle Hash einer **bereits
angewendeten** Datei vom gespeicherten Wert ab (die Datei wurde nachträglich
verändert — ein Verstoß gegen die Append-only-Regel für `migrations/**`),
bricht der Runner **hart ab**, bevor irgendetwas angewendet wird. Es gibt
**keinen** Auto-Repair-Mechanismus — das ist Absicht: eine automatische
"Reparatur" würde die Integritätsgarantie gerade aushebeln, die die Prüfung
herstellen soll. Abhilfe ist immer ein bewusster, nachvollziehbarer Schritt
(z. B. neue, nachfolgende Migration statt Editieren der alten Datei).

Fehlt umgekehrt die Datei einer bereits angewendeten Version komplett im
Verzeichnis, wird das identisch als Drift/Abbruch behandelt (die Checksumme
kann nicht verifiziert werden).

## `pg_advisory_lock` (Nebenläufigkeit)

Der Runner nimmt vor jedem `up`/`down`-Lauf einen sitzungsgebundenen
`pg_advisory_lock` mit einem festen, im Code dokumentierten Schlüssel
(`src/db.ts`, `ADVISORY_LOCK_KEY`). Damit serialisieren sich z. B. ein
CI-Job und ein lokal parallel gestarteter Runner gegen dieselbe Datenbank,
statt sich gegenseitig Migrationen "wegzuschnappen". Der Lock wird in einem
`finally`-Block freigegeben, auch bei Fehlern.

## `schema_migrations` — bewusst keine Migrationsdatei

Die Tabelle `public.schema_migrations` (Spalten: `version`, `name`,
`checksum`, `applied_at timestamptz`) wird vom Runner selbst per
`CREATE TABLE IF NOT EXISTS` angelegt (`src/schema-migrations.ts`) — **nicht**
über eine Datei unter `migrations/**`. Das ist analog zu etablierten Runnern
(z. B. Flyways `flyway_schema_history`): das Buchführungs-Schema des Runners
selbst unterliegt nicht der `V<NNNN>__`-Konvention, die für **fachliche**
Migrationen gilt. Die eigentliche Baseline-Migration (Extensions,
`CREATE EXTENSION IF NOT EXISTS timescaledb;` ggf. `pgcrypto`) ist bewusst
**nicht** Teil dieses Arbeitspakets — sie entsteht separat über den
`/add-migration`-Workflow mit Review (ADR-0001 §10.4/§11).

## Konfiguration (ausschließlich über ENV)

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `DATABASE_URL` | nein | Vorrangig, falls gesetzt (z. B. `postgres://user:pass@host:5432/db`). |
| `POSTGRES_HOST` | ja, falls kein `DATABASE_URL` | siehe `.env.example` |
| `POSTGRES_PORT` | nein (Default `5432`) | siehe `.env.example` |
| `POSTGRES_DB` | ja, falls kein `DATABASE_URL` | siehe `.env.example` |
| `POSTGRES_USER` | ja, falls kein `DATABASE_URL` | siehe `.env.example` |
| `POSTGRES_PASSWORD` | ja, falls kein `DATABASE_URL` | siehe `.env.example` |
| `MIGRATIONS_DIR` | nein (Default `<cwd>/migrations`) | Override, z. B. für Tests gegen ein Fixture-Verzeichnis. |

Es gibt bewusst **keine** hartkodierte Connection — weder Host/Port noch
Credentials. Der Runner erwartet, aus dem Repo-Root heraus aufgerufen zu
werden (Default für `MIGRATIONS_DIR`).

`DATABASE_URL`/`MIGRATIONS_DIR` sind reine Runner-Interna und daher bewusst
**nicht** in `.env.example` ergänzt — der Runner kommt vollständig mit den
dort bereits dokumentierten `POSTGRES_*`-Variablen (AP1) aus.

## Logging

Ausschließlich Dateinamen, Versionsnummern und generische Statustexte,
niemals SQL-Inhalte, Connection-Strings oder rohe DB-Fehlermeldungen (die
könnten Fragmente von Tabellendaten enthalten) — siehe `src/logger.ts`.
Zeitstempel sind UTC (ISO-8601, `Z`-Suffix).

## Bauen

```bash
pnpm --filter @edms/migrate install   # einmalig, im Rahmen des regulären Workspace-Installs
pnpm --filter @edms/migrate run build # tsc → dist/
```

## Programmatische Nutzung (für spätere Integrationstests)

`src/index.ts` exportiert die öffentliche API (`scanMigrations`, `runUp`,
`runDown`, `runStatus`, `loadConfig`, …) für den direkten Import — gedacht
für das Testcontainer-/Vitest-Setup aus ADR-0001 §10.5, das diesen Runner
gegen eine echte PostgreSQL+TimescaleDB-Instanz testen wird (keine
DB-Mocks, `.claude/rules/tests.md`). Dieses Arbeitspaket (AP3) liefert
bewusst noch **keine** Tests dafür — das `test`-Skript ist bis dahin ein
Platzhalter, konsistent mit dem Muster der übrigen Workspace-Pakete vor
ihrer jeweiligen Implementierungs-AP.

## Exit-Codes

`0` bei Erfolg, `1` bei jedem Fehler (Validierungsfehler, Checksum-Drift,
fehlgeschlagene Migration, fehlendes `--yes` bei `down`, fehlende
DB-Konfiguration). Fehlermeldungen gehen nach `stderr`, alles andere nach
`stdout`.
