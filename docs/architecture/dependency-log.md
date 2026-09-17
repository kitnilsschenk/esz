# Dependency License Log

- **Owner:** technical-director / backend-lead
- **Erstellt:** 2026-07-09 — Phase 4, Feature `projekt-skelett`, Arbeitspaket AP1 (Repo-Grundgerüst)
- **Referenz:** `docs/adr/ADR-0001-projekt-skelett.md` (Abschnitte 10.1–10.3), `.claude/rules/dependencies.md`

Lizenz-Whitelist (eingebettete Dependencies, laut `.claude/rules/dependencies.md`):
MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, MPL-2.0, PostgreSQL,
Zlib, Unlicense, CC0-1.0, BlueOak-1.0.0 — sonst nichts ohne User-Freigabe.
(BlueOak-1.0.0 ergänzt 2026-09-16 durch User-Freigabe; Begründung in
`.claude/rules/dependencies.md`. Pflicht daraus: Die Pakete müssen ihre
`LICENSE.md` mit ausliefern — bei npm-Paketen im `node_modules`-Baum ohnehin
der Fall, bei einem gebündelten Backend-Artefakt aktiv sicherzustellen.)

Dieses Log wird **append-only** geführt: neue Pakete werden ergänzt,
ausgemusterte Zeilen werden als "entfernt" markiert statt gelöscht. Es
ergänzt (ersetzt nicht) das CycloneDX-SBOM, das ab der CI-Pipeline (ADR-0001
§10.3) zusätzlich auch generierte/transitive Abhängigkeiten je Release erfasst.

## AP1 — Root-Tooling (nur devDependencies, keine Laufzeit-Fläche)

| Paket | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| pnpm | `10.11.0` (via `packageManager`-Feld + Corepack) | MIT | ✓ | Package-Manager, keine Projekt-Dependency | **Integritäts-Hash ergänzt (2026-07-09)** via `corepack use pnpm@10.11.0` (`+sha512.<hex>`), nachdem der erste CI-Lauf am veralteten Registry-Signaturschlüssel des Node-20-Corepack scheiterte; zusätzlich hebt die Setup-Action Corepack auf gepinnte `0.34.0` und setzt `COREPACK_DEFAULT_TO_LATEST=0`. |
| typescript | `^5.7.2` | Apache-2.0 | ✓ | Root-devDependency | Geteilter Compiler für alle Workspace-Pakete (`tsconfig.base.json`). |
| eslint | `^9.17.0` | MIT | ✓ | Root-devDependency | Flat Config (`eslint.config.mjs`). |
| typescript-eslint | `^8.19.0` | MIT | ✓ | Root-devDependency | Type-checked-Preset via `projectService`; liefert `@typescript-eslint/no-explicit-any: error`. |
| prettier | `^3.4.2` | MIT | ✓ | Root-devDependency | Formatierung, per `eslint-config-prettier` von Lint entkoppelt. |
| eslint-config-prettier | `^9.1.0` | MIT | ✓ | Root-devDependency | Deaktiviert ESLint-Stilregeln, die mit Prettier kollidieren (ADR-0001 §10.2 verlangt dies explizit). **Hinweis:** über die vier im Arbeitspaket namentlich genannten Tools hinaus ergänzt — hier zur Transparenz gesondert vermerkt. |

Es sind aktuell **keine** `dependencies` (Laufzeit) in irgendeinem Paket
deklariert — `@edms/backend`, `@edms/frontend` und `@edms/shared` sind
Platzhalter-Pakete (AP1, je ein leeres `src/index.ts`). Framework-/
Laufzeit-Abhängigkeiten (NestJS, React, Vite, TanStack Query, Radix UI, Zod,
class-validator/class-transformer, …) gehören zu **AP4 (Backend)** und
**AP5 (Frontend)** und sind bei ihrer Einführung hier zu ergänzen.

## AP3 — Migrations-Runner (`tools/migrate`, `@edms/migrate`, ADR-0001 §10.4)

| Paket | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| pg | `^8.13.1` | MIT | ✓ | `dependencies` (Laufzeit) von `@edms/migrate` | **Einzige** Runtime-Dependency des Migrations-Runners (ADR-0001 §10.4, node-postgres). Verbindet ausschließlich über `DATABASE_URL`/`POSTGRES_*`-ENV (siehe `.env.example`), keine hartkodierten Connection-Strings (`tools/migrate/src/config.ts`). |
| @types/pg | `^8.11.10` | MIT | ✓ | `devDependencies` von `@edms/migrate` | Typdeklarationen für `pg` (DefinitelyTyped) — reine Build-Time-Abhängigkeit, keine Laufzeit-Fläche. |
| @types/node | `^24.0.0` (angehoben 2026-07-09, zuvor `^20.18.1`) | MIT | ✓ | `devDependencies` von `@edms/migrate` | Node-Typdeklarationen (`fs`, `crypto`, `process`) für strict TypeScript, passend zum `.nvmrc`-Pin `24.18.0` (Node 24 LTS „Krypton"; Node 20 EOL 04/2026). |

Der Runner selbst (`tools/migrate/src/**`) ist Eigencode (DCO-signiert),
**keine** weitere Migrations-Framework-Dependency — konsistent mit der in
ADR-0001 §10.4 dokumentierten Verwerfung von Flyway (JVM-Ballast,
`.down`-Rollback kostenpflichtig in Community-Edition) und
node-pg-migrate/dbmate (Namenskonvention passt nicht zu
`.claude/rules/database-migrations.md`).

## AP4 — Backend Walking Skeleton (`@edms/backend`, ADR-0001 §10.7)

| Paket | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| @nestjs/common | `^11.0.0` | MIT | ✓ | `dependencies` | NestJS-Kern. |
| @nestjs/core | `^11.0.0` | MIT | ✓ | `dependencies` | NestJS-Kern. |
| @nestjs/platform-express | `^11.0.0` | MIT | ✓ | `dependencies` | HTTP-Adapter; express kommt transitiv (MIT). |
| reflect-metadata | `^0.2.2` | Apache-2.0 | ✓ | `dependencies` | DI-Metadaten (`emitDecoratorMetadata`). |
| rxjs | `^7.8.1` | Apache-2.0 | ✓ | `dependencies` | NestJS-Peer. |
| pg | `^8.13.1` | MIT | ✓ | `dependencies` | Readiness-Ping (`HealthService`), Verbindung nur via `DATABASE_URL`. |
| class-validator | `^0.14.1` | MIT | ✓ | `dependencies` | Globale ValidationPipe (Backend-Rule). |
| class-transformer | `^0.5.1` | MIT | ✓ | `dependencies` | Globale ValidationPipe (Backend-Rule). |
| @types/express | `^4.17.21` | MIT | ✓ | `devDependencies` | Nur Typen. |
| @types/node | `^24.0.0` (angehoben 2026-07-09, zuvor `^20.17.9`) | MIT | ✓ | `devDependencies` | Nur Typen; passend zu Node 24 LTS. |
| @types/pg | `^8.11.10` | MIT | ✓ | `devDependencies` | Nur Typen. |

## AP5 — Frontend + Shared-API-Client (`@edms/frontend`, `@edms/shared`, ADR-0001 §10.7 + §13.1(2))

Generator-Entscheidung final (frontend-lead, 2026-07-09): `openapi-typescript` + `openapi-fetch` (statt orval; Bundle-Budget ≤ 250 KB gz).

| Paket | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| react | `^18.3.1` | MIT | ✓ | `dependencies` (`@edms/frontend`) | |
| react-dom | `^18.3.1` | MIT | ✓ | `dependencies` (`@edms/frontend`) | |
| @tanstack/react-query | `^5.62.7` | MIT | ✓ | `dependencies` (`@edms/frontend`) | Einziger Server-State-Mechanismus (Frontend-Rule). |
| openapi-fetch | `^0.13.3` | MIT | ✓ | `dependencies` (`@edms/shared`) | ~1 KB Runtime; einzige Client-Instanz in `src/shared/src/api/client.ts`. |
| vite | `^6.0.7` | MIT | ✓ | `devDependencies` (`@edms/frontend`) | |
| @vitejs/plugin-react | `^4.3.4` | MIT | ✓ | `devDependencies` (`@edms/frontend`) | |
| openapi-typescript | `^7.5.2` | MIT | ✓ | `devDependencies` (`@edms/shared`) | Erzeugt nur Typen (kein Runtime-Code); `pnpm generate:api`. |
| @types/react | `^18.3.18` | MIT | ✓ | `devDependencies` (`@edms/frontend`) | Nur Typen. |
| @types/react-dom | `^18.3.5` | MIT | ✓ | `devDependencies` (`@edms/frontend`) | Nur Typen. |

Alle Versionsangaben sind konservative Majors; exakte Patch-Auflösung und
Verifikation erfolgen beim ersten `pnpm install` (Verifikationsschritt).

## AP2 — CI-Pipeline (keine package.json-Dependencies; `pnpm dlx` gepinnt bzw. Binary/Action SHA-verifiziert, ADR-0001 §10.3)

| Tool | Version | Lizenz | Whitelist-Status | Bezug |
|---|---|---|---|---|
| ~~license-checker~~ | ~~`25.0.1`~~ | ~~BSD-3-Clause~~ | entfallen 2026-09-16 | Folgte dem pnpm-Symlink-Store nicht und sah 15 statt 231 Pakete; ersetzt durch `tools/ci/lizenz-gate.mjs` (Eigenentwicklung auf `pnpm licenses list`, keine Fremd-Abhängigkeit) |
| @cyclonedx/cdxgen | `12.7.1` | Apache-2.0 | ✓ | `pnpm dlx`, SBOM (restricted mode `--type npm`) |
| gitleaks | `8.30.1` | MIT | ✓ | Binary-Download, SHA256-gepinnt (`.github/actions/gitleaks-install`) |
| actions/checkout | v4.3.1 (SHA `34e11487…`) | MIT | ✓ | GitHub Action, SHA-gepinnt |
| actions/setup-node | v4.4.0 (SHA `49933ea5…`) | MIT | ✓ | GitHub Action, SHA-gepinnt |
| actions/cache | v4.3.0 (SHA `0057852b…`) | MIT | ✓ | GitHub Action, SHA-gepinnt |
| actions/upload-artifact | v4.6.2 (SHA `ea165f8d…`) | MIT | ✓ | GitHub Action, SHA-gepinnt |
| actions/download-artifact | v4.3.0 (SHA `d3f86a10…`) | MIT | ✓ | GitHub Action, SHA-gepinnt |

Alle SHAs am 2026-07-09 live via `git ls-remote`/GitHub-API verifiziert; Updates
laufen über Dependabot (`.github/dependabot.yml`) mit SHA-Pin-Erhalt.

## AP6 — Test-Infrastruktur (nur devDependencies, ADR-0001 §10.5)

| Paket | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| vitest | `^2.1.8` | MIT | ✓ | devDependency (backend, frontend, shared, tools/migrate) | Gemeinsamer Test-Runner. |
| unplugin-swc | `^1.5.1` | MIT | ✓ | devDependency (backend) | SWC-Transform — harte ADR-Auflage (esbuild kann kein `emitDecoratorMetadata`). |
| @swc/core | `^1.10.7` | Apache-2.0 | ✓ | devDependency (backend) | SWC-Kern. |
| @nestjs/testing | `^11.0.0` | MIT | ✓ | devDependency (backend) | Test-Harness für NestJS-Apps. |
| supertest | `^7.0.0` | MIT | ✓ | devDependency (backend) | HTTP-Assertions in Integrationstests. |
| @types/supertest | `^6.0.2` | MIT | ✓ | devDependency (backend) | Nur Typen. |
| @testcontainers/postgresql | `^10.16.0` | MIT | ✓ | devDependency (backend) | Echte PG+Timescale-oss in Integrationstests (Tests-Rule: keine DB-Mocks). |
| ajv | `^8.17.1` | MIT | ✓ | devDependency (backend) | Contract-Test gegen `health.openapi.yaml`. |
| yaml | `^2.7.0` | ISC | ✓ | devDependency (backend) | YAML-Parsing für den Contract-Test. |
| jsdom | `^25.0.1` | MIT | ✓ | devDependency (frontend) | DOM-Environment. |
| @testing-library/react | `^16.1.0` | MIT | ✓ | devDependency (frontend) | Komponenten-Tests. |
| @testing-library/jest-dom | `^6.6.3` | MIT | ✓ | devDependency (frontend) | Matcher. |
| axe-core | `^4.10.2` | **MPL-2.0** | ✓ (MPL-2.0 auf Whitelist) | devDependency (frontend) | A11y-Check im Test-Setup (Tests-Rule); reine Dev-/Test-Fläche, gelangt nie ins Bundle. |
| rollup-plugin-license | `^3.5.3` | MIT | ✓ | devDependency (frontend) | License-Gate Stufe 2: erzeugt `dist/oss-licenses.json` beim Vite-Build (Nacharbeit nach AP2). |

## AP-Auth-Modul AP-A — Keycloak (Netzwerkdienst, ADR-0002 Teil B §14/§16, devops-lead)

Kein `package.json`-Eintrag — Keycloak läuft **ausschließlich als Dienst über
die Netzwerkgrenze** (`docker-compose.dev.yml`), unmodifiziert, nur über
Admin-REST/OIDC-Protokoll angesprochen (`.claude/rules/dependencies.md`,
Abschnitt "Dienste über Netzwerkgrenze"). Hier zur Traceability/SBOM-
Vollständigkeit dennoch geführt (explizite Aufgabenstellung AP-A).

| Image | Version (gepinnt) | Lizenz | Whitelist-Status | Scope | Hinweis |
|---|---|---|---|---|---|
| `quay.io/keycloak/keycloak` | `26.7.0` | Apache-2.0 | ✓ | Netzwerkdienst (`deployment/docker/docker-compose.dev.yml`) | Identitäts-/AuthN-Dienst (OIDC). Tag real gegen die Quay-API verifiziert (2026-07-13, `docker manifest inspect` + `quay.io/api/v1/...tag`): die im ADR illustrativ genannte Version `26.0` ist ein über ein Jahr alter Floating-Tag (Feb. 2025) — verstößt gegen die devops-lead-Hartregel "Base-Image nicht älter als 30 Tage". Stattdessen exakt auf den aktuellen Patch-Release `26.7.0` gepinnt (veröffentlicht 2026-07-09). Health-/Bootstrap-Verhalten dieser exakten Version empirisch gegen einen isolierten, temporären Container verifiziert (siehe `deployment/keycloak/README.md`, Abschnitt "Verifikations-Protokoll"). |

## AP-BCD — Backend-Auth-Modul (`@edms/backend`, ADR-0002 Teil B)

Whitelist-konform; Versionen konservativ, exakte Auflösung + Lizenz-Reverifikation beim `pnpm install` / License-Gate.

| Paket | Version | Lizenz | Whitelist | Scope | Hinweis |
|---|---|---|---|---|---|
| jose | `^6.0.0` | MIT | ✓ | `dependencies` | JWT/JWKS-Validierung (`createRemoteJWKSet`); Lizenz einmalig via `npm view` bestätigt (6.2.3). |
| nestjs-cls | `^4.4.1` | MIT | ✓ | `dependencies` | AsyncLocalStorage-Kontext für die Transaction-/Audit-Kette. |
| @nestjs-cls/transactional | `^3.0.0` | MIT | ✓ | `dependencies` | Propagation REQUIRED/NESTED (Savepoint) — Konflikt-B-Lösung. |
| @nestjs-cls/transactional-adapter-typeorm | `^1.3.0` | MIT | ✓ | `dependencies` | TypeORM-Adapter für obiges. |
| typeorm | `^0.3.20` | MIT | ✓ | `dependencies` | NUR als Tx/EntityManager-Fassade (`synchronize:false`, keine Entities — Schema bleibt bei `migrations/**`). |
| @nestjs/throttler | `^6.4.0` | MIT | ✓ | `dependencies` | Rate-Limiting auf AuthController (401/403). |

## Vorgemerkt / noch nicht installiert (Traceability, ADR-0001 §10.3–10.5)

Folgende Werkzeuge sind im ADR bereits entschieden, aber bewusst **nicht**
Teil von AP1 (gehören zur CI-/Test-Infrastruktur späterer Arbeitspakete).
Aufgeführt zur Vorab-Struktur des Logs; Zeilen bei tatsächlicher Installation
mit exakter Version vervollständigen:

| Paket | Lizenz (laut ADR) | Ziel-AP / Job |
|---|---|---|
| ~~license-checker~~ | ~~BSD-3-Clause~~ | entfallen 2026-09-16, siehe oben — CI `license-gate` Stufe 1 läuft jetzt über `tools/ci/lizenz-gate.mjs` ohne Fremd-Paket |
| rollup-plugin-license | MIT | CI `license-gate` Stufe 2, Frontend-Build (devops-lead) |
| @cyclonedx/cdxgen | Apache-2.0 | CI `sbom` (devops-lead) |
| gitleaks (Binary, SHA256-gepinnt) | MIT | CI `secret-scan` (devops-lead) |
| git-filter-repo | MIT | einmaliger History-Rewrite beim Public-Go (devops-lead) |
| @testcontainers/postgresql | MIT | Integrationstests (backend-lead/qa-lead) |
| vitest | MIT | Test-Runner (backend-lead/frontend-lead/qa-lead) |
| unplugin-swc | MIT | Vitest + NestJS-DI-Fix (backend-lead) |
| @swc/core | Apache-2.0 | Vitest + NestJS-DI-Fix (backend-lead) |

## ADR-0008 Phase 4c + Design-System — Frontend (`@edms/frontend`, 2026-07-15)

Betriebs-UI (ADR-0008 Phase 4c) + KIT-CI-Design-System (`Design-System`, Tailwind).
Alle Lizenzen vor Installation via `npm view <pkg> license` geprüft.

| Paket | Version (gepinnt) | Lizenz | Whitelist | Scope | Hinweis |
|---|---|---|---|---|---|
| react-router-dom | `^7.18.1` | MIT | ✓ | dependency (`@edms/frontend`) | Routing + Route-Level-Error-Boundaries (Phase 4c). |
| zod | `^4.4.3` | MIT | ✓ | dependency (`@edms/frontend`) | Formular-Validierung (Frontend-Rule); route-split in eigenen Chunk. |
| class-variance-authority | `^0.7.1` | Apache-2.0 | ✓ | dependency | Varianten der `ui/`-Komponenten (Button/Badge). |
| clsx | `^2.1.1` | MIT | ✓ | dependency | `cn()`-Helfer (`shared/lib/cn.ts`). |
| tailwind-merge | `^3.6.0` | MIT | ✓ | dependency | `cn()`-Helfer (Tailwind-Klassen-Deduplizierung). |
| lucide-react | `^1.24.0` | ISC | ✓ | dependency | Icons (Nav/Buttons/Theme-Toggle), tree-shakeable. |
| @fontsource/roboto | `5.1.1` (**exakt, kein `^`**) | Apache-2.0 | ✓ | dependency | Roboto self-hosted (DSGVO: **kein** Google-Fonts-CDN). **WICHTIG: ab `5.2.0` auf SIL-OFL-1.1 umgestellt (NICHT Whitelist) — nicht upgraden ohne User-Freigabe.** Nur CSS-`@import` → erscheint NICHT im `rollup-plugin-license`-Gate (manuell geprüft; bekannte Gate-Lücke für CSS-only-Pakete). |
| tailwindcss | `^4.3.2` | MIT | ✓ | devDependency | Tailwind v4 (CSS-first, `@theme inline`, kein `tailwind.config.js`). |
| @tailwindcss/vite | `^4.3.2` | MIT | ✓ | devDependency | Tailwind-v4-Vite-Plugin (`vite.config.ts`). |
