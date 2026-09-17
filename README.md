# EDMS — Energy Data Management System

> **Repository status: private.**
> This repository is currently **private** during active development.
> Publication under an open-source license is planned as part of this
> project's public-funding obligations (BAFA). Timing and exact scope of the
> public release are governed by a dedicated compliance gate (`compliance-director`
> sign-off, "Public-Go") and are **not yet decided** — see
> `docs/adr/ADR-0001-projekt-skelett.md`, sections 6.1 (compliance conditions)
> and 7.2 (open question F5). Nothing in this README should be read as an
> announcement of an actual publication date.

## A. Purpose of the software

This repository contains the Energy Data Management System (EDMS) developed
within the **BAFA pilot program "Einsparzähler"** (energy-savings meter). The
software implements the program's core loop end to end:

- **Meter-data ingestion** — time-series readings from LoRaWAN metering
  devices, delivered by an IoT platform (ChirpStack) via MQTT (Mosquitto),
  stored as TimescaleDB hypertables;
- **Master data** — end customers, systems/metering points, and meters as
  defined by the program's metering concepts (Messkonzepte);
- **Baseline & adjustment (Bereinigung)** — establishing the energy baseline
  (including weather adjustment) and normalizing consumption for changing
  influence factors;
- **Verified savings calculation** — computing and evidencing energy savings
  per customer and funding year;
- **Customer feedback & value-added services** — at least monthly consumption
  and savings information (with opt-out), device-/appliance-group recognition
  quotas, and services that actively drive energy savings;
- **Reporting & evidence** — auditable exports toward the funding authority
  (BAFA), including raw data, baseline data, influence factors, and savings,
  plus supporting records such as utility bills used for baselines.

Core design goals are strong data-protection guarantees (GDPR/DSGVO,
consent-based processing, German-residency hosting for personal data) and an
information-security management baseline (ISO/IEC 27001), enforced through
automated CI gates rather than manual discipline.

## B. Structure of the source code

The repository is organized as a single **pnpm workspace monorepo**:

```
EDMS/
├── src/
│   ├── backend/     # @edms/backend  — NestJS API (TypeScript)
│   ├── frontend/     # @edms/frontend — React + Vite SPA (TypeScript)
│   └── shared/        # @edms/shared   — shared types, generated OpenAPI client
├── schemas/
│   ├── openapi/            # API contracts (OpenAPI 3.1) per module
│   ├── database/           # DB schema snapshots / ERDs
│   └── document-types/     # JSON Schemas for evidence records (e.g. metering concepts, utility bills)
├── migrations/       # Versioned, append-only SQL migrations
├── tests/            # unit / integration / e2e / security / performance
├── docs/
│   ├── adr/               # Architecture Decision Records
│   ├── architecture/      # High-level architecture docs, dependency log
│   ├── api/                # Rendered API documentation
│   └── user-manual/        # End-user documentation (German)
├── workflows/        # BPMN process definitions
├── deployment/       # Docker Compose (dev), Kubernetes/IaC (prod)
└── tools/            # Dev/CI tooling (e.g. public-export manifest)
```

Root-level configuration shared by all packages: `pnpm-workspace.yaml`,
`tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`.

### Backend modules

The backend is cut by business context — one module per context, with no
cross-access to another context's data. Under `src/backend/src/`:

| Directory | Responsibility |
|---|---|
| `stammdaten/` | Customers, connected users, sites, systems, meters, metering channels, and the versioned metering concept; field-level encryption and controlled deletion |
| `ingest-worker/` | Standalone ingestion process: broker subscription, payload decoding, channel correlation, idempotency, gap and outage detection |
| `messwerte/` | Read paths over the time series; consumption views |
| `berechnung/` | Baseline, weather adjustment, calculation runs over frozen inputs, influence factors |
| `nachweis/` | Funding year, completeness preflight, savings run, export rendering, submission with difference report |
| `geraeteerkennung/` | Attribution of consumption shares to appliance and plant groups; per-funding-year attribution quota |
| `nutzerinfo/` | Generation and provision of the monthly customer information; objection handling |
| `portal/` | End-customer portal with its own access management, separate from the operations UI |
| `consent/` | Versioned consent texts, recorded grant, withdrawal, legal-basis matrix |
| `retention/` | Retention and compaction runs as standalone batch processes |
| `import/` | Ingestion of historical meter series from spreadsheets |
| `audit/` | Immutable event log, event catalogue, hash chain, periodic sealing |
| `auth/` | OIDC login, role- and attribute-based access decisions |
| `common/` | Cross-cutting concerns: transactions, cryptography, time handling, error shape |
| `health/` | Readiness and liveness checks |

### Frontend features

Under `src/frontend/src/features/`, one directory per functional area:
`stammdaten`, `nachweis`, `geraeteerkennung`, `nutzerinfo`, `portal`,
`consent`, `dashboard`, `auth`, `health`. Each holds its views, forms and
data access. All server access goes through the client generated from the
OpenAPI contracts in `src/shared/`.

### Design rationale

`docs/adr/` holds the architecture decision records. For every substantial
choice they record which alternatives were considered, what was weighed, and
which conditions were derived. They are the recommended entry point for
understanding *why* the system is built the way it is.

Two directories exist in this private repository for internal governance and
are **excluded from the public release** (see `tools/public-export/exclude.txt`):
compliance evidence/records and the internal "studio" tooling configuration
that drives this project's automated development workflow. Neither contains
information required to build, run, or understand the software itself.

## C. Prerequisites

- **Node.js ≥ 22** (`engines`); development and CI run on **Node 24 LTS**
  (see `.nvmrc`). Node 20 reached end-of-life in April 2026 and is not
  supported.
- **pnpm**, activated via [Corepack](https://nodejs.org/api/corepack.html)
  (bundled with Node ≥ 20 — no separate global install). The exact pinned
  version is declared in the root `package.json` (`packageManager` field);
  run `corepack enable` once per machine.
- **Docker / Docker Compose**, for the local development stack
  (PostgreSQL 16 + TimescaleDB, Apache-2 edition) and for integration tests
  that run against real containers (Testcontainers) — no database mocks are
  used in this project.
- **Keycloak** as the identity provider (login, roles) and **Mosquitto** as
  the MQTT broker for meter data are part of the development stack.
- **OpenSearch** is foreseen for full-text search in a later stage; the
  current stage uses PostgreSQL full-text search.

The metering hardware itself is not part of this software. The system assumes
meter readings are read electronically and delivered over an MQTT broker. For
existing stock without that connectivity, an import path for spreadsheet data
is provided (`src/backend/src/import/`).

Setup:

```sh
corepack enable
pnpm install --frozen-lockfile

# Build FIRST. The migration runner (`@edms/migrate`) is a workspace package
# and the backend imports its type declarations; without a build,
# `pnpm typecheck` fails with "Cannot find module '@edms/migrate'".
pnpm build

pnpm lint
pnpm typecheck
pnpm test          # unit tests — no database required
```

Integration tests need a running Docker daemon. They start real
PostgreSQL 16 + TimescaleDB containers (Testcontainers) and apply the full
migration chain — this project uses no database mocks:

```sh
pnpm -r --if-present run test:integration
```

To bring up the local development stack (database, MQTT broker, Keycloak)
including the post-start steps that are easy to forget:

```sh
./dev-up.sh
```

## D. Parameters / configuration

- All runtime configuration is passed via **environment variables**. Copy
  `.env.example` to `.env` for local development; `.env` is git-ignored and
  must **never** be committed. `.env.example` itself must **never** contain
  real secrets or production values — placeholders only.
- New configuration variables must be documented in `.env.example` *before*
  they are read in application code.
- All timestamps produced by the backend are **UTC**, encoded as ISO 8601
  with a trailing `Z`; timezone conversion for display happens exclusively in
  the frontend.
- API error responses follow **RFC 9457** (`application/problem+json`); see
  `schemas/openapi/` for per-module contracts.

## Significance and public value

*(Statement required by the funding body under point 10 of the programme's
application guidance. The authoritative German version is maintained as the
project's Open-Source record.)*

### Why this software is essential to the funded project

This software is not a tool used by the project — it **is** the project. The
Einsparzähler programme does not fund metering hardware as such; it funds
credible evidence of energy savings actually achieved. Producing that evidence
is exactly what this software does: it ingests meter readings, maintains
customers, metering points and metering concepts, establishes the energy
baseline, adjusts consumption for weather, computes savings per funding year,
checks data completeness, and renders the evidence package for the funding
authority.

Its creation was not optional. Until September 2022 the project used a
third-party energy-data solution. As the number of active metering points grew
and the programme's evidence requirements tightened, that solution no longer
covered what was needed. The existing tool was analysed, its shortcomings
documented, a requirements catalogue drawn up, and build-versus-buy assessed
with an effort estimate before the decision to develop in-house was taken. The
migration of the legacy data was carried out in full.

What is published is the **complete product**, not an excerpt. There is no
withheld proprietary core, no separately licensed add-on layer, and no feature
that exists only in a non-public build. That property was designed in rather
than retrofitted: the database's time-series extension is used exclusively in
its freely licensed edition — its proprietary convenience features are banned
project-wide and replaced by our own, published implementations — and the free
alternative was chosen for both search and infrastructure tooling.

The only material excluded from publication is the operator's internal
compliance file (records of processing activities, data protection impact
assessment, risk register and similar). It contains nothing required to build,
run or understand the software, and withholding it follows the programme's
explicit instruction not to publish personal data as part of an open-source
contribution.

### Why it is of substantial public value

**The hard part of an Einsparzähler project is not the measurement — it is the
evidence.** Metering hardware is available off the shelf. What every applicant
faces alike is the chain behind it: establishing and substantiating a baseline,
adjusting for weather, offsetting one customer's excess consumption against
another's savings, verifying completeness against funding-year boundaries that
do not align with calendar months, and rendering the result in the structure the
programme prescribes. That chain is fully worked out in this source code, cited
against the programme's rulebooks, and machine-verified — usable not as a
description but as a running implementation.

**Reproducibility is built in, not promised.** Every calculation run freezes its
inputs as an immutable snapshot and records the version of the method and its
parameters. If inputs change later, a new run is created; the previous one
remains and stays referenceable. Reference cases with pre-agreed expected values
fail the build as soon as a change to the method would alter a previously
reported result. A third party can therefore not merely read the results but
recompute them.

**The data-protection design carries beyond this programme.** Consumption data
from buildings is revealing: a fine-grained load profile permits inferences
about occupancy and working hours. This code shows how to contain that —
personal data held separately from consumption data and encrypted per subject,
irreversible deletion only under four-eyes control, data subjects under a
processing restriction shown in the evidence with a neutral marker rather than
silently dropped, and an immutable audit log whose permitted context fields are
enforced fail-closed at the database level. These patterns transfer to any
project handling consumption or sensor data from occupied buildings.

**Being honest about limits is part of the value.** The evidence package states
explicitly where pseudonymisation does not hold against an observer with side
knowledge, instead of claiming protection it does not provide. The system
refuses to report a savings figure where the data does not support one, instead
of closing the gap by computation. Anyone reusing this work inherits the
documented limits of the method along with the method.

**Portability.** The software is not tied to a meter type, a network operator or
a single property. Device types are onboarded through an extensible registry,
the radio network sits outside the system boundary, and there is an audited
import path for historical data held in spreadsheets. The funding-year
definition is parameterised and handles periods that do not start on the first
of a month.

**The licence makes reuse economically possible — and keeps the author
visible.** Apache-2.0 permits unrestricted commercial reuse and embedding in
commercial products. Every embedded dependency is under a licence that allows
the same; copyleft libraries and proprietary components are excluded and
prevented automatically.

Apache-2.0 was chosen over the more common MIT deliberately. Section 4(d)
requires anyone distributing a derivative work to carry the contents of the
[`NOTICE`](./NOTICE) file — in that file, in the documentation, or in the
display the derivative work generates. MIT asks for none of that: it would
allow the software to be embedded in a product without naming its author
anywhere a user can see. Section 6 additionally makes explicit that the
licence grants no rights in the KIT Consulting name or logo. Attribution is
the price of reuse here, and it is the only one.

## License

Apache-2.0 — see [`LICENSE`](./LICENSE). Copyright 2026 KIT Consulting GmbH.

If you redistribute this software or build on it, you must pass on the
contents of [`NOTICE`](./NOTICE) (section 4(d)). That file also records the
trademark reservation: you may — and should — name KIT Consulting GmbH as the
author, but the name and logo may not be used in a way that suggests
endorsement or an affiliation that does not exist.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md), in particular the DCO sign-off
requirement and the dependency-license whitelist.
