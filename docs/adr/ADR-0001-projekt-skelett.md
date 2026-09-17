# ADR-0001: Projekt-Skelett, CI-Pipeline (License-Gate + CycloneDX-SBOM), Testcontainer-Setup

- **Status:** **accepted** — **durch User freigegeben am 2026-07-09**. Phase 2 (Design & Architektur) abgeschlossen durch `technical-director` (Abschnitte 10–13); beide Lead-Reviews (backend-lead + devops-lead) abgeschlossen und eingearbeitet (Abschnitt 13); Phase 1 abgeschlossen am 2026-07-09. Offener Punkt 13.1(1) (GitHub-Plan/Push-Protection) durch User **entschieden** (Plan = Free, siehe 13.1); es verbleibt nur 13.1(2) (Client-Generator-Finalisierung) für Phase 4. **Nächster Schritt: Phase 3 (Compliance-Check der Auflagen-Umsetzung) durch `compliance-director`.**
- **Datum:** 2026-07-09
- **Autor:** product-director (Phase 1, Abschnitte 1–9); technical-director (Phase 2, Abschnitte 10–13)
- **Reviewer:** compliance-director — **Phase 1 ohne Veto bestätigt, mit Auflagen** (siehe 6.1); technical-director (Phase 2, Design-Owner); **backend-lead + devops-lead — Phase-2-Lead-Review abgeschlossen, Voten eingearbeitet** (Abschnitt 13)
- **Freigabe:** User — **ADR accepted am 2026-07-09** (GitHub-Plan Free entschieden, 13.1(1) aufgelöst)
- **Workflow:** `/new-feature projekt-skelett`, Phase 1 (Konzept & Vision) laut `.claude/docs/workflow-catalog.yaml`
- **Roadmap-Bezug:** „Jetzt: in Arbeit, Phase 2 Design" → ADR-0001 (`production/roadmap.md`)

> **Hinweis zum Reifegrad:** Dies ist das **Vision-Memo** (Phase-1-Output). Es
> beantwortet die Produktfragen (Zielnutzer, Job-to-be-done, Erfolgsmetriken,
> Scope, Alternativen, Compliance-Risiko, offene Fragen) und bereitet die
> Übergabe an `technical-director` vor. **Technische Detailentscheidungen
> (Package-Manager, konkrete CI-Tools, Verzeichnisnamen im Detail) sind bewusst
> Phase 2.**
>
> **Stand nach Phase-1-Abschluss (2026-07-09):** Die offenen Fragen der Erstfassung
> sind entschieden (Abschnitt 7.1); zwei Punkte bleiben bewusst offen mit
> Klärungsauftrag (7.2, insb. Public-Go). Die Auflagen des `compliance-director`
> sind in **6.1** verbindlich verankert; beide Phase-1-Gates
> (Vision-in-einem-Satz, Compliance-Risiko benannt) sind erfüllt.
>
> **Domänen-Korrektur (2026-07-09, nach Phase 4):** EDMS bedeutet
> **Energiedatenmanagementsystem** (Einsparzähler-Plattform, BAFA-ESZ), NICHT
> „Elektronisches Dokumenten-Management-System" — vom User explizit korrigiert.
> Alle Aussagen dieses ADRs zu Workspace, Tooling, CI-Gates, Public/Private-
> Grenze, Migrations-Runner und Walking Skeleton sind **domänenneutral und
> bleiben unverändert gültig**. Wo dieses Dokument von „Dokumenten"-Fachlichkeit
> spricht (z. B. Folge-ADR „Dokument-Entity"), gilt stattdessen die
> Energie-Domäne laut `production/roadmap.md` (revision 3): Kern-Datenmodell
> Energie, ChirpStack/MQTT-Ingestion, Baseline & Bereinigung, Einsparberechnung,
> BAFA-Export. Beleg-Ablage (z. B. Jahresabrechnungen) bleibt als Nebenmodul.

---

## 1. Vision-Satz (Job-to-be-done)

> **Als Entwickler/Agent des EDMS-Studios will ich das Repository klonen und in
> wenigen Minuten einen grünen, compliance-gesicherten Build haben, damit ich
> Fachfeatures bauen kann, statt Tooling-, Lizenz- und CI-Grundlagen jedes Mal
> neu aufzusetzen.**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

Das Projekt-Skelett ist das **Fundament**, auf dem alle Folge-ADRs (Auth,
Audit-Log, Dokument-Entity, Storage …) aufsetzen. Es liefert nicht nur ein
Verzeichnis-Gerüst, sondern die **automatisierten Leitplanken** (CI-Gates), die
die Studio-Regeln und die BAFA-OSS-Förderauflagen von Commit 1 an durchsetzen —
Guardrails statt Disziplin.

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Studio-Entwickler / Agent (primär).**
Kennt den Stack (NestJS, PG+TimescaleDB, React/Vite). Will Reibungsfreiheit:
klonen, `make dev`/`make test`, sofort produktiv. Verlässt sich darauf, dass CI
Lizenz-, Secret- und Qualitätsfehler abfängt, statt sie manuell zu prüfen.
Erfolg = keine „works-on-my-machine"-Reibung, klare Struktur, schneller Test.

**Persona B — OSS-Nachnutzer / Community-Contributor (sekundär).**
Kennt die EDMS-Domäne womöglich nicht. Findet den Einstieg ausschließlich über
das README (Doku A–D) und einen reproduzierbaren Build. Entscheidet in Minuten,
ob das Projekt weiterverwendbar ist. Erfolg = versteht Zweck/Struktur/
Voraussetzungen/Parameter ohne Rückfrage; Build läuft auf seiner Maschine grün.

**Persona C — Fördergeber-Auditor (BAFA) / compliance-director (indirekt, Stakeholder).**
Prüft nicht Code, sondern **Nachweise**: Lizenzkonformität aller (auch
generierter) Abhängigkeiten, CycloneDX-SBOM je Release, Eigenentwicklung via
DCO-Signoff, unentgeltliche öffentliche Verfügbarkeit. Erfolg = jeder Nachweis
ist automatisiert und nachvollziehbar aus dem Repo ableitbar.

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| M1 | **Time-to-green** (Clone → grüner lokaler Testlauf) | Zeit von `git clone` bis grün auf frischer Maschine mit dokumentierten Voraussetzungen (Doku C) | **≤ 15 min** (vom User bestätigt) |
| M2 | **License-Gate blockt nachweisbar** | Negativtest: absichtlich eingeschleustes Non-Whitelist-Package (z. B. GPL/proprietär) lässt CI rot werden | Gate schlägt fehl = bestanden |
| M3 | **License-Gate deckt generierte Build-Artefakte** | Prüfung läuft auch über Build-Output, nicht nur deklarierte Dependencies (Punkt 10.2 „bestehen oder generiert") | 100 % Abdeckung Runtime-Artefakte |
| M4 | **SBOM valide & vollständig** | CycloneDX-SBOM pro Release; Schema-Validierung grün, alle Runtime-Dependencies enthalten | 100 % Runtime-Coverage |
| M5 | **Doku A–D formal vollständig** | README-Checkliste Zweck/Struktur/Voraussetzungen/Parameter | 4/4 Abschnitte vorhanden |
| M6 | **Reproduzierbarkeit** | Zweiter Clone auf anderer Maschine → identisch grüner Build | deterministisch grün |
| M7 | **DCO-Coverage** | CI-Check: alle Commits signiert (`git commit -s`) | 100 % |

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope (gehört ins Skelett)

- **Monorepo-Layout:** ein Repository mit klar getrennten Bereichen (Backend,
  Frontend, geteilter Code, `migrations/`, `tests/`, `docs/`, `schemas/openapi/`,
  Dev-Deployment). Konkrete Ordnernamen = Phase 2.
- **Tooling-Baseline:** Strict-TypeScript-Basiskonfiguration, Lint/Format,
  Node-≥-20-Pin, Git-Hooks für DCO/Lint. Package-Manager-Wahl = Phase 2.
- **CI-Pipeline mit Gates:** Lint, Typecheck, Unit-Tests, **License-Gate
  (inkl. generierter Build-Artefakte)**, **CycloneDX-SBOM-Erzeugung**,
  **DCO-Signoff-Check**.
- **Dev-Compose-Stack (schlank, User-Entscheidung F4):** **nur** PostgreSQL 16 +
  TimescaleDB **`-oss`**. Keycloak, MinIO und OpenSearch kommen **erst mit ihren
  jeweiligen Features** (ADR-0002 ff.), jeweils als Netzwerkdienst über die
  Netzwerkgrenze, nicht eingebettet.
- **Testcontainer-Basis:** gemeinsames Setup für Integration/E2E gegen **echte**
  PG + TimescaleDB (laut `.claude/rules/tests.md`: keine DB-Mocks).
- **README nach Doku-Struktur A–D auf Englisch** (User-Entscheidung F3;
  Merkblatt 10.1 erlaubt EN), inkl. **Platzhalter für den Wesentlichkeits-/
  Mehrwert-Textbaustein** (Merkblatt 10.1, User-Entscheidung F7); `LICENSE`
  (BSD-3-Clause, existiert), `CONTRIBUTING` mit DCO-Hinweis.
- **Walking Skeleton:** minimaler NestJS-Health-Endpoint + minimaler
  React/Vite-Bootstrap — nur so viel Code, dass Build/Test/Compose/CI **echt**
  grün laufen (macht M1/M2/M6 messbar). **Keine Fachlogik.**

### 4.2 Out-of-Scope (explizit NICHT im Skelett)

- **Keine Fachmodule** (Dokument, Version, Retention, OCR, Workflow,
  Such-Fachlogik).
- **Keine Auth-Implementierung** — Keycloak nur als Dev-Dienst im Compose; die
  OIDC/RBAC/ABAC-Integration ist **ADR-0002**.
- **Kein Audit-Log-Schema** (ADR-0003), **kein Dokument-/Versionsmodell**
  (ADR-0004), **keine Storage-Abstraktion** (ADR-0005). Höchstens eine
  Baseline-Migration für Extensions.
- **Kein Prod-Deployment**, kein Kubernetes-/OpenTofu-**Prod**-IaC. Nur
  Dev-Compose.
- **Keine echten Daten / keine PII** in Fixtures oder Configs — strikt, wegen
  öffentlicher OSS-Publikation.

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 ADR-Zuschnitt: ein ADR vs. Skelett-ADR + separater CI-ADR

- **A — Ein ADR-0001** deckt Skelett + CI (License-Gate/SBOM) + Testcontainer.
  *Pro:* eine Entscheidung, eine Referenz für den Fördernachweis, weniger
  Overhead; entspricht dem Roadmap-Wortlaut. *Contra:* großer ADR, CI-Details
  vermischen sich mit Layout.
- **B — ADR-0001 (Skelett) + separater CI/License-Gate-ADR.**
  *Pro:* das förderrechtlich hochsensible License-Gate/SBOM bekommt eigene,
  nachvollziehbare Entscheidungs-Historie. *Contra:* Roadmap führt ADR-0001
  bereits kombiniert; Aufsplittung erzeugt Doppelpflege.
- **Empfehlung: A** — ein ADR-0001 (wie Roadmap), aber mit klar abgegrenztem
  CI-Abschnitt. Wächst das License-Gate in Phase 2 stark, kann ein **Folge-ADR**
  es vertiefen, ohne ADR-0001 zu überladen.

### 5.2 Repo-Struktur: Monorepo (ein öffentliches Repo) vs. getrennte Repos

- **A — Monorepo, ein öffentliches GitHub-Repo.**
  *Pro:* **förderrechtlich klar überlegen** — ein Publikationsnachweis, ein
  `LICENSE`, ein SBOM-Scope, ein DCO-Verlauf; **kein Open-Core-Risiko** (Auflage 6
  „wesentlicher Teil", kein Open-Core); atomare Cross-Cutting-Changes; die
  BAFA-Zustimmungspflicht bei Veröffentlichungs-Änderungen (Merkblatt 3.0) ist
  über **ein** Repo einfacher zu kontrollieren. *Contra:* größeres Repo; die
  PII-/Secret-Vermeidung muss konsequent für alles gelten, was öffentlich wird.
- **B — Getrennte Repos** (Backend/Frontend/Infra).
  *Pro:* kleinere Einheiten, unabhängige Releases. *Contra:* **mehrfacher**
  Publikations-/Lizenz-/SBOM-Nachweis; Gefahr eines Open-Core-Vorwurfs (welches
  Repo ist „der wesentliche Teil"?); Change-Control über mehrere Repos schwerer.
- **Entschieden: A (Monorepo, User-Entscheidung F1)** — die OSS-
  Publikationspflicht macht ein einziges (später öffentliches) Repo eindeutig zur
  risikoärmeren Wahl. Der Start erfolgt **privat** (Public-Go = eigenes Gate, 7.2).

### 5.3 Walking Skeleton vs. reines Verzeichnis-/Config-Gerüst

- **A — Walking Skeleton** (minimaler Health-Endpoint + Vite-Bootstrap).
  *Pro:* CI/Testcontainer/Compose sind **sofort echt** testbar; M1/M2/M6 werden
  messbar; sofort reproduzierbar. *Contra:* minimaler, später ersetzbarer Code.
- **B — Reines Gerüst ohne Runtime.**
  *Pro:* noch weniger Code. *Contra:* CI-Gates laufen ins Leere; „grüner
  Testlauf" nicht demonstrierbar → Erfolgsmetriken nicht überprüfbar.
- **Empfehlung: A (Walking Skeleton)** — damit die Metriken überhaupt greifen.

---

## 6. Compliance-Einfluss / Phase-1-Risiko-Flag

**Gesamt-Flag (grob): niedrig — konditioniert.** (Bestätigt vom
`compliance-director`, Phase 1 ohne Veto; die Einstufung gilt nur unter Auflage 5
in 6.1: solange License-Gate inkl. generierter Build-Artefakte, SBOM, DCO und
Secret-/PII-Scan **ab Commit 1 grün** sind — Pflicht-Deliverables, keine Optionen.)

*Begründung in einem Satz:* Das Skelett verarbeitet **keine personenbezogenen
Daten** und enthält keine Fachlogik (→ kein DSGVO-Verarbeitungsvorgang, keine
DSFA); das einzige relevante Berührungsfeld sind die BAFA-OSS-Förderauflagen,
die das Skelett durch License-Gate, SBOM, DCO und PII-Verbot in Fixtures **aktiv
absichert statt gefährdet**.

- **DSGVO:** keine PII-Verarbeitung; Restrisiko nur bei versehentlicher
  PII/Secret-Aufnahme in öffentlich publizierte Fixtures/Configs → wird durch
  Secret-Scan-Hook + PII-Regel + strikte „keine Echtdaten"-Regel adressiert.
- **ISO 27001 (grob, Feinmapping = Phase 3):** berührt u. a. sichere Entwicklung
  (Secure-CI/CD, Trennung), Konfigurations-/Abhängigkeitsmanagement,
  Secrets-Handling. Konkrete Annex-A-Controls markiert `iso27001-auditor`.
- **Förder-/OSS-Compliance:** Auflagen 4 (Eigenentwicklung/DCO), 5 (freie
  Abhängigkeiten, auch keine generierten proprietären), 6 (kein Open-Core) sowie
  Doku A–D werden vom Skelett **erfüllt**; hier liegt der eigentliche Wert.
- **Zuständigkeit:** OSS-Auflagen berührt → `compliance-director` hat **Phase 1
  ohne Veto, mit Auflagen bestätigt** (6.1). Ich schreibe **nicht** in
  `compliance/**`; Änderungen an `.claude/rules/dependencies.md` oder
  Compliance-Artefakten laufen über `compliance-director`.

### 6.1 Auflagen des `compliance-director` (verbindlich, Phase-1-Bestätigung mit Auflagen)

1. **Public/Private-Grenze vor Commit 1 festlegen:** `compliance/**` und
   `.claude/**` gehören **nicht** ins öffentliche Repo; technisch erzwingen
   (separates privates Compliance-Repo **oder** verifizierter Pfad-Ausschluss).
   Diese Grenzziehung ist **Phase-2-Design-Aufgabe** (an `technical-director`).
2. **Serverseitiger Secret-Scan (gitleaks o. ä.) + GitHub Push-Protection ab
   Commit 1**, zusätzlich zum lokalen Hook; **einmaliger History-/PII-Scrub vor
   dem ersten Public-Push**.
3. **Erstveröffentlichung = hartes Compliance-Gate** (`compliance-director`-
   Freigabe + Antragsabgleich); **Einbahntür** wegen Widerrufsvorbehalt und
   BAFA-Zustimmungspflicht (Merkblatt 3.0/3.4). Siehe 7.2 (F5).
4. **`SECURITY.md` mit CVD-Policy ab Public-Go** — inkl. DS-12-Doppelmeldeweg
   ≤ 72 h an Aufsichtsbehörde **und** BAFA.
5. **„Compliance-Risiko niedrig" ist konditioniert:** gilt nur, solange
   License-Gate (inkl. generierter Build-Artefakte), SBOM, DCO und Secret-/PII-Scan
   **ab Commit 1 grün** sind — **Pflicht-Deliverables, keine Optionen.**

---

## 7. Fragen-Status nach Phase 1

### 7.1 Entschieden (Phase 1)

- **F1 — Repo-Struktur: Monorepo, JA** — ein (später öffentliches) Repository.
- **F2 — Time-to-green: ≤ 15 min** akzeptiert (M1).
- **F3 — README-Sprache: Englisch** (Doku A–D auf EN; Merkblatt 10.1 erlaubt es).
- **F4 — Dev-Compose: schlank** — nur PostgreSQL 16 + TimescaleDB `-oss`;
  Keycloak/MinIO/OpenSearch erst mit ihren Features.
- **F7 — README-Platzhalter für Wesentlichkeits-/Mehrwert-Textbaustein: JA.**

### 7.2 Weiterhin offen — mit Klärungsauftrag

- **F5 — Public-Go: offen (KEINE „Reife-Tag"-Entscheidung).** Das Skelett startet
  **privat**. Die Veröffentlichung ist ein **eigenes, späteres Compliance-Gate**
  (Auflage 3 in 6.1) und wird erst nach **interner Klärung der Antragszusage**
  entschieden — konkret Zeitpunkt und Art der im Antrag zugesagten
  Veröffentlichung (Merkblatt Punkt 10). *Klärungsauftrag:* Antragsunterlagen/
  Zusage prüfen, dann Public-Go-Gate ansetzen (`compliance-director` + User).
- **F6 — GitHub-Organisation / Repo-Name: vertagt** bis zum Public-Go-Gate (F5).
- **F8 — Package-Manager/Workspace-Tool:** Tech-Trade-off, an `technical-director`
  in Phase 2; zusätzliche Tooling-Abhängigkeiten müssen die Lizenz-Whitelist
  (`.claude/rules/dependencies.md`) erfüllen.

---

## 8. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Alle Folge-ADRs starten auf gesichertem, reproduzierbarem Fundament.
- OSS-Förderauflagen (Lizenz, SBOM, DCO, kein Open-Core) sind ab Commit 1
  automatisiert nachweisbar.

### Negativ
- Vorlaufaufwand, bevor sichtbare Fachfeatures entstehen.
- Walking-Skeleton-Code ist teils Wegwerf-Code.

### Neutral
- Setzt Konventionen, an die sich alle späteren Module halten müssen.

---

## 9. Folgeaufgaben

- [x] **Phase-1-Freigabe** durch den User (F1–F7 entschieden, siehe 7.1).
- [x] `compliance-director`: Phase 1 **ohne Veto, mit Auflagen** bestätigt (6.1);
      Risiko-Flag **niedrig (konditioniert)**.
- [x] Roadmap-Status ADR-0001 → „Jetzt: in Arbeit, Phase 2 Design"
      fortgeschrieben (`production/roadmap.md`).
- [x] **Übergabe an `technical-director` für Phase 2** (Design & Architektur):
      konkretes Monorepo-Layout, CI-Tooling, Testcontainer-Setup, F8 **sowie
      Auflage 1 (Public/Private-Grenze `compliance/**` + `.claude/**`) als
      technische Design-Aufgabe** — ausgearbeitet in Abschnitten 10–12.
- [x] **Phase-2-Lead-Review:** `backend-lead` (Walking-Skeleton-Zuschnitt,
      Migrations-Runner, Test-Runner) + `devops-lead` (CI-Pipeline, License-Gate,
      SBOM, Secret-Scan, Public-Export-Guard) **abgeschlossen**; Voten in
      Abschnitten 10–13 eingearbeitet.
- [ ] **User-Freigabe** der offenen Punkte 13.1 (GitHub-Plan/Push-Protection;
      Client-Generator-Finalisierung optional in Phase 4). Danach Status →
      `accepted`.
- [ ] **Public-Go-Gate (F5)** vorbereiten: Antragszusage (Merkblatt Punkt 10)
      intern klären; Erstveröffentlichung nur nach `compliance-director`-Freigabe
      (Einbahntür, 6.1 Auflage 3).
- [ ] Phase 3 (falls nötig): `iso27001-auditor` — Annex-A-Control-Mapping der
      Secure-CI/CD-Aspekte.

---

## 10. Phase-2-Design-Entscheidungen (proposed)

> **Reifegrad:** Diese Abschnitte sind der Phase-2-Output (`technical-director`,
> Design-Owner). Jede Werkzeug-Wahl ist **gegen die Lizenz-Whitelist in
> `.claude/rules/dependencies.md` geprüft** (erlaubt: MIT, ISC, BSD-2/3-Clause,
> 0BSD, Apache-2.0, MPL-2.0, PostgreSQL, Zlib, Unlicense, CC0-1.0). **Ergebnis
> vorweg: alle gewählten Werkzeuge sind whitelist-konform** (MIT/BSD/Apache-2.0/
> ISC). Es wird in Phase 2 **kein Package installiert und keine Migration
> angelegt** — Implementation ist Phase 4.

### 10.1 Package-Manager & Workspace-Layout (F8)

**Entscheidung:** **pnpm Workspaces**, versionsgepinnt über **corepack** (in
Node ≥ 20 LTS enthalten → kein globaler Zusatz-Install). Root-`package.json`
(`private: true`) mit `packageManager: "pnpm@<pin>"`; `pnpm-workspace.yaml`
listet die Pakete unter `src/`.

**Lizenz-Check:** pnpm = **MIT** ✓. corepack ist Bestandteil von Node (kein
zusätzliches npm-Package). → whitelist-konform.

**Warum:** Strikte, nicht-gehobene `node_modules` (kein Phantom-Dependency-Zugriff)
→ das ist für die **Korrektheit des License-Gates und des SBOM-Scopes** wesentlich
(nur deklarierte Abhängigkeiten sind auflösbar). Content-addressed Store + Hardlinks
beschleunigen den CI-Install → zahlt auf **Time-to-green ≤ 15 min (M1)** ein.
Deterministisches `pnpm-lock.yaml` stützt **Reproduzierbarkeit (M6)**.

**Verworfene Alternative:** **npm Workspaces** — Dependency-Hoisting erzeugt
Phantom-Dependencies, die den License-/SBOM-Scope **verfälschen** können, und
weniger deterministisches Auflösen; kein strikter Isolationsvorteil. **yarn
Berry** — PnP-Komplexität und Loader-Overhead ohne Mehrwert hier. (Beide ebenfalls
whitelist-konform lizenziert, aber fachlich unterlegen.)

**Konkretes Monorepo-Layout** (entlang `.claude/docs/directory-structure.md`,
keine neuen Top-Level-Verzeichnisse):

| Workspace-Paket | Pfad | Name | Zweck |
|---|---|---|---|
| Backend | `src/backend/` | `@edms/backend` | NestJS-App (Health-Modul im Skelett) |
| Frontend | `src/frontend/` | `@edms/frontend` | React/Vite-Bootstrap |
| Shared | `src/shared/` | `@edms/shared` | geteilte Typen, generierter OpenAPI-Client, geteilte Zod-Schemas |

Geteilte Tooling-Configs liegen **im Repo-Root** (kein neues `packages/`-Verzeichnis):
`tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`.
Der Migrations-Runner und der Public-Export-Guard liegen unter `tools/`
(bereits in der Struktur vorgesehen).

### 10.2 TypeScript- / ESLint- / Prettier-Basiskonfiguration

**Entscheidung:** Eine geteilte **`tsconfig.base.json`** im Root, von jedem Paket
via `extends` erweitert. Verbindliche Flags (aus `.claude/rules/backend-nestjs.md`
und `frontend-react.md`):

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- zusätzlich: `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `forceConsistentCasingInFileNames`, `useUnknownInCatchVariables` (in `strict`),
  `target: ES2022`
- Modul-Auflösung pro Paket: Backend `module/moduleResolution: NodeNext`,
  Frontend `bundler`.

**Lint/Format:** **ESLint (Flat Config, `eslint.config.mjs`) + typescript-eslint**
im **type-checked**-Modus (nur so lassen sich `no-any`, erzwungene Type-Guards für
`unknown` und Promise-Fehler regelkonform durchsetzen) + **Prettier** mit
`eslint-config-prettier` (entkoppelt Format von Lint).

**Lizenz-Check:** TypeScript = **Apache-2.0** ✓; ESLint = **MIT** ✓;
typescript-eslint = **MIT** ✓; Prettier = **MIT** ✓; eslint-config-prettier =
**MIT** ✓. → alle whitelist-konform.

**Verworfene Alternative:** **Biome** (MIT, sehr schnell) — die für uns
zentralen **typ-bewussten** Regeln (z. B. verlässliches `no-explicit-any`,
Decorator-/DI-taugliche Regeln für NestJS) sind bei Biome noch nicht auf
typescript-eslint-Niveau. Wird bei Reifegrad-Fortschritt erneut geprüft.

### 10.3 CI-Plattform & Pipeline-Design

**Plattform:** **GitHub Actions** (das Repo läuft ohnehin auf GitHub — Auflage 2
verlangt GitHub **Push-Protection**). Actions selbst sind ein **Dienst**, keine
eingebettete Dependency; verwendete Actions werden **per Commit-SHA gepinnt** und
einzeln lizenzgeprüft.

**Verworfene Alternative:** **GitLab CI** (self-hosted) — mehr Betriebslast,
kein Vorteil, und die geforderte Push-Protection/Publikationskontrolle ist auf
GitHub-Seite bereits gesetzt.

**Jobs, Reihenfolge, Blocking** (alle Gates **blockierend** — Pflicht-Deliverables
laut Auflage 5):

| # | Job | Abhängig von | Blockierend | Inhalt |
|---|---|---|---|---|
| 0 | `setup` | – | ja | checkout, corepack pnpm, `pnpm install --frozen-lockfile`, Store-Cache |
| 1 | `lint` | 0 | ja | ESLint + `prettier --check` |
| 2 | `typecheck` | 0 | ja | `tsc --noEmit` über alle Workspaces |
| 3 | `unit` | 0 | ja | Unit-Tests, Coverage ≥ 80 % geänderte Zeilen |
| 4 | `build` | 0 | ja | Backend- + Frontend-Build → **Artefakte** (Input für 5) |
| 5 | `license-gate` | 4 | ja | zweistufig, siehe unten (deckt **generierte Artefakte** → M3) |
| 6 | `sbom` | 4 | ja | CycloneDX-SBOM erzeugen + Schema-validieren (M4) |
| 7 | `integration` | 0 | ja | Testcontainers PG16+Timescale-`oss` (kein DB-Mock) |
| 8 | `secret-scan` | – | ja | **PR-Pfad: gitleaks Diff-Scan** (Commit-Range); Full-History **nightly** + einmalig vor Public-Go (devops-Votum 1) |
| 9 | `dco-check` | – | ja | alle Commits `Signed-off-by` (M7) |
| 10 | `public-export-guard` | 0 | ja | **`git archive`** gegen Exclude-Manifest, blockt Leaks/unklassifizierte Pfade (siehe 10.6) |
| 11 | `dep-audit` (SCA/CVE) | 0 | ja | **blockierendes Schwachstellen-Gate** — `pnpm audit` (nativ) oder `osv-scanner` (Apache-2.0 ✓); Tool-Wahl final mit `security-auditor` in Phase 5 (devops-Finding, hoch) |

`lint`, `typecheck`, `unit`, `integration`, `dep-audit` laufen nach `setup` parallel;
`build` speist `license-gate` und `sbom`. **Secret-Scan im PR-Pfad als Diff-Scan**
(Time-to-green, devops-Votum 1); der Full-History-Scan läuft nightly und einmalig
vor Public-Go.

**License-Gate — zweistufig** (deckt **deklarierte** *und* **generierte**
Abhängigkeiten, M3):

1. **Deklarierte Ebene:** `license-checker` mit `--onlyAllow "<Whitelist>"` über
   den **Production-Dependency-Baum** jedes deploybaren Pakets; Fehlschlag bei
   jeder Nicht-Whitelist-Lizenz **und** bei `UNKNOWN`/fehlender Lizenz. Für den
   NestJS-Backend-Artefakt (versendet `node_modules`) ist der `--production`-Baum
   zugleich das ausgelieferte Artefakt.
2. **Gebündelte Ebene (Frontend):** Der Vite-Build erzeugt via
   **`rollup-plugin-license`** ein **Lizenz-Manifest der tatsächlich gebündelten
   Module** (Build-Artefakt). Das Gate prüft dieses Manifest gegen die Whitelist.
   Damit deckt das Gate genau das, was im ausgelieferten Bundle landet — nicht nur
   deklarierte Dependencies. → schließt die M3-Lücke „generierte Build-Artefakte".

**Lizenz-Check der Gate-Werkzeuge:** `license-checker` = **BSD-3-Clause** ✓;
`rollup-plugin-license` = **MIT** ✓.

> **Verbindliche Auflage (devops-Votum 2) für ADR-0005/Deployment:** Stufe 1 setzt
> voraus, dass der `--production`-Baum dem ausgelieferten Artefakt **entspricht**.
> Das Backend-Deploy-Image **muss** daher `pnpm install --prod --frozen-lockfile`
> gegen **denselben** Lockfile ausführen; andernfalls driftet der Baum über
> Plattform-/`optionalDependencies` und die Äquivalenz bricht. Diese Auflage wird
> in ADR-0005 (Deployment/Dockerfile) verankert.

**SBOM:** **`@cyclonedx/cdxgen`** (CycloneDX) — unterstützt pnpm-Workspaces/-Lockfiles
robust; erzeugt CycloneDX-JSON, wird schema-validiert und als CI-Artefakt **je Lauf**
sowie **je Release** abgelegt (M4). **Lizenz:** cdxgen = **Apache-2.0** ✓.
*Alternative* `@cyclonedx/cyclonedx-npm` (Apache-2.0 ✓) verworfen: npm-zentriert,
pnpm-Unterstützung schwächer.
**Auflage (devops-Votum 3):** cdxgen im **eingeschränkten Modus** (`--type npm`,
**keine** optionalen Fremd-Analyzer, **keine** Binary-Downloads zur Laufzeit) →
deterministisch und ohne unkontrollierten Netzzugriff im CI.

**Secret-Scan:** **gitleaks** — als **MIT-Binary direkt** in der Pipeline
ausgeführt (PR-Pfad Diff-Scan, Full-History nightly, siehe Job-Tabelle), **nicht**
über den Org-lizenzpflichtigen `gitleaks-action`-Wrapper; das Release-Binary wird
**per SHA256-Checksumme gepinnt** (devops-Votum 4). Zusätzlich der lokale Hook
`.claude/hooks/pre-write-secret-scan.sh`. **Lizenz:** gitleaks = **MIT** ✓.
*Verworfen:* **trufflehog** = **AGPL-3.0** — als externer, nur über die CLI
aufgerufener **CI-Dienst** (kein Linken in das Produkt) wäre es analog zur
„Dienste-über-Netzwerkgrenze"-Ausnahme grundsätzlich **vertretbar**, wird aber
**nicht** gewählt: mit gitleaks existiert ein **MIT-Äquivalent**, das die Toolchain
eindeutig AGPL-frei und whitelist-konform hält (kein Interpretationsspielraum
gegenüber dem Fördergeber).

> **Offener Punkt (devops-Votum 4) — GitHub Push-Protection ist Tatsachenfrage:**
> Für **private** Repos ist Push-Protection i. d. R. nur mit **GitHub Advanced
> Security / Secret-Protection-Add-on** (Team/Enterprise) verfügbar, auf **Free
> nicht**. Bis zur Klärung des GitHub-Plans (User-Frage 1 in Abschnitt 13) gilt:
> **Auflage 2 (Push-Protection als präventive, serverseitige Kontrolle) ist noch
> nicht gesichert.** Der gitleaks-CI-Job wirkt **nach** dem Push und ist damit eine
> **Kompensationskontrolle, nicht gleichwertig** (er verhindert das Landen des
> Secrets in der Remote-History nicht, er detektiert es nur). Diese Nicht-Äquivalenz
> ist gegenüber `compliance-director` und User explizit zu machen.

**DCO-Check:** Ein **eigenes, DCO-signiertes Prüf-Skript** im Job (verifiziert für
den Commit-Range je Commit einen `Signed-off-by`-Trailer, der zu Author/Committer
passt). Zero-Third-Party-Surface stützt den **Eigenentwicklungs-Nachweis**.
*Alternative* DCO-GitHub-App verworfen (externer Dienst, unnötige Abhängigkeit).

**CI-Härtung (devops-Voten, Mittel):**
- **Cache-Trust-Boundary:** der pnpm-Store-Cache wird **scope-getrennt** (Cache-Key
  inkl. Branch/Basis-Ref), um Cross-Branch-/Fork-Kontamination zu verhindern.
  **Verbot** von `pull_request_target` in Kombination mit Fork-Code **und** Secrets.
- **Action-Pinning + Update-Prozess:** alle Actions **per Commit-SHA** gepinnt;
  Aktualisierung über **Dependabot** (GitHub-nativ, **keine** Dependency-Fläche) mit
  SHA-Pin-Updates. *Verworfen:* **Renovate** = **AGPL-3.0** (AGPL-Fläche vermeiden).

### 10.4 Migrations-Tooling

**Entscheidung:** Ein **schlanker, eigener SQL-Migrations-Runner** unter `tools/`
auf Basis des `pg`-Treibers. Er wendet `V<NNNN>__<snake_case>.sql` **lückenlos
aufsteigend** an, führt jede Migration **transaktional** aus, protokolliert
angewandte Versionen inkl. **Checksumme** (Integrität, append-only-freundlich) in
einer Tabelle `schema_migrations` und rollt über die gepaarte
`V<NNNN>__<snake_case>.down.sql` zurück.

**Lizenz-Check:** `pg` (node-postgres) = **MIT** ✓. Der Runner selbst ist
Eigencode (DCO-signiert, **null** zusätzliche Migrations-Dependency → kleinere
SBOM-/Lizenz-Fläche).

**Warum eigen:** Die von `.claude/rules/database-migrations.md` vorgeschriebene
Konvention (`V<NNNN>__*.sql` **plus separate** `.down.sql`, lückenlos) ist
**projektspezifisch** und wird von **keinem** whitelist-kompatiblen
Standard-Runner ohne Workaround exakt getroffen. Raw-SQL hält Migrationen
**review-fähig** für `database-lead` + `compliance-director` und ist portabel;
der Runner integriert sauber mit der append-only-Regel für `migrations/` und dem
Hook `post-write-audit-log.sh`.

**Verworfene Alternativen:**
- **Flyway (Community, Apache-2.0):** JVM-Laufzeit im Node-Stack (Dev/CI-Ballast,
  gefährdet M1); **Undo/`.down`-Migrationen sind ein kostenpflichtiges
  Teams-Feature** → die zwingende `.down.sql`-Regel ist in der Community-Edition
  nicht erfüllbar.
- **node-pg-migrate (MIT) / dbmate (MIT):** JS- bzw. Single-File-Migrationen mit
  Timestamp-/Marker-Format — **Format- und Namenskonvention passen nicht** zur
  Regel (raw `.sql` + separate `.down.sql` + `V<NNNN>__`).

**Verbindliche Runner-Semantik für Phase 4 (backend-lead-Votum 2):**
- **(a) Rollback-Semantik präzisiert:** `.down.sql` dient **ausschließlich** dem
  **manuellen Rollback bereits erfolgreich angewendeter** Migrationen — **nicht**
  der Fehlerbehandlung eines fehlgeschlagenen Laufs. Schlägt eine Migration
  innerhalb ihrer Transaktion fehl, committet der `ROLLBACK` ohnehin nichts;
  `.down.sql` wird dabei **nicht** ausgeführt.
- **(b) Checksum-Drift = harter Abbruch:** Weicht die Checksumme einer **bereits
  angewendeten** Migrationsdatei von der in `schema_migrations` gespeicherten ab
  (nachträglich veränderte Datei), **bricht der Runner hart ab** (kein
  Auto-Repair) — schützt die append-only-Integrität von `migrations/`.
- **(c) Nebenläufigkeit:** der Runner nimmt vor dem Anwenden einen
  **`pg_advisory_lock`**, um **parallele Runner-Läufe** (CI + lokal) zu
  serialisieren.

**Wichtig:** In Phase 2 wird **keine Migration** angelegt. Eine **Baseline-Migration
für Extensions** (`CREATE EXTENSION IF NOT EXISTS timescaledb;`, ggf. `pgcrypto`)
ist ein **Phase-4-Artefakt** — sie enthält **keine Fachtabellen und keine PII**
(siehe Abschnitt 11).

### 10.5 Testcontainer-Setup

**Entscheidung:** Integration/E2E laufen gegen **echte** PostgreSQL 16 +
TimescaleDB über **Testcontainers for Node** (`@testcontainers/postgresql`),
Image **`timescale/timescaledb:<pin>-pg16-oss`** (Suffix `-oss` zwingend, laut
`dependencies.md`). Eine geteilte Test-Fixture startet den Container, wartet auf
Readiness, führt `CREATE EXTENSION timescaledb` aus und wendet die Migrationen
**über den Runner aus 10.4** an — d. h. Tests laufen gegen das gleiche
Schema-Setup wie Prod. Container-Reuse/Singleton pro Test-Suite hält die Laufzeit
im M1-Budget. **Kein DB-Mock** (laut `.claude/rules/tests.md`).

> **Risiko-Vermerk (devops-Votum 1):** Der **Testcontainers-Image-Pull**
> (`timescale/timescaledb:<pin>-pg16-oss`) ist auf gehosteten Runnern **ohne
> Registry-Cache** ein **unbudgetiertes** Zeitrisiko gegenüber M1 (≤ 15 min). Wird
> im **ersten echten CI-Lauf gemessen**; bei Bedarf Image-Layer-Cache oder
> Self-hosted-Runner-Cache nachziehen.

**Test-Runner:** **Vitest** monorepo-weit (ESM-nativ, teilt Config mit Vite,
schnell) — bestätigt durch backend-lead **mit harter Auflage**.

> **Harte Auflage (backend-lead-Votum 1) — SWC-Transform für den Backend-Workspace:**
> Vitests **esbuild**-Default unterstützt **kein `emitDecoratorMetadata`** →
> NestJS-DI bricht **still** (Provider werden nicht aufgelöst). Der Backend-Workspace
> **muss** daher einen **SWC-Transform** verwenden (z. B. **`unplugin-swc`**, MIT ✓,
> auf **`@swc/core`**, Apache-2.0 ✓). **Ohne** diese Ergänzung ist der Fallback
> **Jest**. Diese Auflage ist Voraussetzung für die Vitest-Wahl.

**Lizenz-Check:** Testcontainers (Node) = **MIT** ✓; `@testcontainers/postgresql`
= **MIT** ✓; `pg` = **MIT** ✓; Vitest = **MIT** ✓; `unplugin-swc` = **MIT** ✓;
`@swc/core` = **Apache-2.0** ✓. *Alternative* **Jest** (MIT, NestJS-Default)
whitelist-konform — Fallback, falls die SWC-Auflage nicht umgesetzt wird.

### 10.6 Public/Private-Grenze (Compliance-Auflage 1)

**Problem:** `compliance/**` und `.claude/**` dürfen **niemals** ins spätere
öffentliche Repo gelangen; die Grenze muss **technisch erzwungen** und
**maschinell verifizierbar** sein. Wichtig: `.gitignore` ist hier das **falsche**
Werkzeug — beide Verzeichnisse müssen im **privaten** Repo **versioniert** bleiben
(Compliance-Nachweise, Studio-Config). Die Grenze greift also **beim Publizieren**,
nicht beim Committen.

**Option A — Ein privates Monorepo jetzt, verifizierter gefilterter Publish beim
Public-Go (empfohlen).** Alles bleibt im **einen privaten** Monorepo (konsistent
mit F1/„startet privat"). Ein **maschinenlesbares Exclude-Manifest**
(z. B. `tools/public-export/exclude.txt`) ist die **einzige Quelle der Wahrheit**
für Ausschlüsse (`compliance/**`, `.claude/**`, `.env*`, interne Docs).

Klare **Werkzeug-Trennung (devops-Votum 5):**
- **Laufend, ab Commit 1 — Job 10 `public-export-guard` nutzt ausschließlich
  `git archive`** gegen das Exclude-Manifest (kein History-Rewrite). Der Job
  (a) erzeugt das Export-Tarball des aktuellen Stands, (b) **blockt**, falls ein
  sensibler Pfad **nicht** im Manifest steht oder ein **neuer, unklassifizierter
  Top-Level-Pfad** auftaucht, und (c) prüft, dass der Export-Stand das **Walking
  Skeleton grün** baut.
- **Einmalig beim Public-Go — `git filter-repo`** führt den **History-Rewrite**
  (Entfernen der ausgeschlossenen Pfade **inkl. Historie**) für den Erst-Push aus.
  **Nur** hier, **nicht** im laufenden Guard. → deterministisch, verifiziert,
  **Einbahntür** (Auflage 3), inkl. History-/PII-Scrub (Auflage 2).

**Lizenz-Check (devops-Votum 5):** `git-filter-repo` = **MIT** ✓ (externes
CLI-Werkzeug, nur beim Public-Go aufgerufen, **nicht** eingebettet); `git archive`
ist Bestandteil von Git. → whitelist-konform.

**Option B — Separates privates Compliance-Repo ab jetzt.** `compliance/**` und
`.claude/**` wandern sofort in ein zweites, privates Repo; das Produkt-Repo wird
später „as-is" öffentlich. *Pro:* physische Trennung ab Tag 1, kein Rewrite-Risiko.
*Contra:* **öffnet die entschiedene Monorepo-Wahl (F1) wieder**, spaltet
DCO-/SBOM-/History-Nachweis auf, und zieht die **`.claude/`-Studio-Config** (die
den gesamten Agenten-Betrieb steuert) **aus dem Produkt-Repo heraus** →
Atomarität von Cross-Cutting-Changes verloren, höhere Betriebslast sofort.

**Empfehlung: Option A.** Sie ist die **einzige mit der festen Monorepo-Entscheidung
(F1) konsistente** Variante, hält Compliance-Artefakte während der Entwicklung
**ko-lokalisiert** (atomare Reviews) und macht die Grenze durch das
**maschinengeprüfte Exclude-Manifest ab Commit 1 verifizierbar** — sie adressiert
damit genau die Fehlerquelle, die die `compliance-director`-Auflage adressiert
(vergessener sensibler Pfad), ohne die Zwei-Repo-Kosten. Der eigentliche
Erstveröffentlichungs-Akt bleibt das harte, freigabepflichtige Public-Go-Gate
(6.1 Auflage 3) inklusive History-/PII-Scrub (Auflage 2). **Option B verworfen**,
weil sie F1 re-öffnet.

*Hinweis Zuständigkeit:* Das Exclude-Manifest und der Guard-Job liegen unter
`tools/` bzw. in CI — **kein** Schreibzugriff auf `compliance/**` nötig. Die
finale Freigabe der Grenzziehung erfolgt durch `compliance-director` (Auflage 1).

### 10.7 Walking-Skeleton-Zuschnitt

**Backend (`src/backend/`):** ein `HealthModule` (`src/backend/src/health/`) mit
`HealthController` + **`HealthService`**:
- `GET /health` — Liveness, **öffentlich**, keine Abhängigkeitsprüfung.
- `GET /health/ready` — Readiness mit **`SELECT 1`** gegen PG. **DB-Wiring gehört
  ins Skelett** (backend-lead-Votum 3), damit Readiness echt testbar ist.

**Auflage (backend-lead-Votum 3):** Der DB-Check läuft über den **`HealthService`**
— **kein DB-Call im Controller** (Backend-Rule: Controller dünn, Service
orchestriert). Der Controller ruft nur den Service. Rohe DB-/Netzwerk-Fehler werden
im Service **auf generische, PII-/topologiefreie Tokens gemappt** (`ready`/
`not_ready`), Rohdiagnose nur ins interne Log — entspricht dem OpenAPI-Contract und
schließt das Topologie-Leak-Finding (hoch).

**Entscheidung `@Public()`-Guard (backend-lead-Finding, mittel):** Ein
**minimaler, global registrierter Deny-by-default-`AuthGuard`-Stub ab Commit 1**
wird eingeführt; ohne ihn wäre `@Public()` **vakuos**. Der Stub verweigert jede
Route **ohne** `@Public()`-Marker (Default = deny, Backend-Rule) und lässt
`@Public()`-Routen (nur `/health`, `/health/ready`) durch. Die **echte
Token-/OIDC-Validierung** ist ADR-0002; der Stub setzt das Deny-by-default-Muster
aber **verbindlich ab Tag 1** durch (nicht „aspirational"). *Verworfen:* die
Kennzeichnung als „aspirational bis ADR-0002" — hinterließe eine still wirkungslose
Sicherheitsannotation.

Kein Terminus-Zwang im Skelett (Liveness = schlanker Controller/Service ohne
Zusatz-Dep); `@nestjs/terminus` (MIT ✓) bleibt optional für spätere
Readiness-Ausbaustufen. Globale `ValidationPipe`
(`whitelist: true, forbidNonWhitelisted: true`) und UTC-`Z`-Zeitstempel werden
bereits im Skelett aktiviert.

**Test-Checkliste Health-Modul für Phase 4 (backend-lead-Finding, niedrig):**
- Controller-Integrationstest **Happy** (`200`) **und Fehler** (`503`) gegen
  Testcontainer-PG.
- **Contract-Test** gegen `schemas/openapi/health.openapi.yaml`.
- **Down-DB-Fall:** Readiness liefert `503` mit **generischem** Detail-Token (kein
  Roh-Fehler), Container gestoppt/DB nicht erreichbar.

**Frontend (`src/frontend/`):** minimaler React/Vite-Bootstrap
(`main.tsx`, `App.tsx`), rendert eine Status-Seite und ruft `/health` über den
**generierten OpenAPI-Client** in `src/shared/api/` (Frontend-Regel).
Route-Level-Error-Boundary vorhanden; keine Fachlogik.

**Shared (`src/shared/`):** hält den **aus `schemas/openapi/health.openapi.yaml`
generierten** Client sowie geteilte Typen. **Generator-Wahl** (whitelist-konform):
backend-lead-**Tendenz `openapi-typescript` + `openapi-fetch`** (beide MIT ✓) —
reine **Typen ohne nennenswerte Laufzeitkosten** vs. `orval`s (MIT ✓) mit dem
Bundle wachsender Hook-Menge; als Kriterium ergänzt: **Bundle-Budget initial
≤ 250 KB gz** (Frontend-Rule). **Finale Entscheidung an `frontend-lead` delegiert**
(darf in Phase 4 erfolgen, siehe Abschnitt 13, offener Punkt 2) — beide
lizenzkonform.

**Lizenz-Check Skelett-Kern:** NestJS = **MIT** ✓; Vite = **MIT** ✓; React =
**MIT** ✓; @tanstack/react-query = **MIT** ✓; Radix UI = **MIT** ✓; Zod =
**MIT** ✓; class-validator/class-transformer = **MIT** ✓. → whitelist-konform.

---

## 11. Datenmodell: bewusst KEIN Fachschema (Phase-2-Feststellung)

Das Skelett führt **bewusst kein Fachschema** ein:

- **Keine Fachtabellen** (Dokument, Version, Metadaten, Retention, Audit-Log,
  Workflow, User/Rolle …) — diese sind ADR-0003 ff.
- **Keine personenbezogenen Datenfelder.** Es gibt daher **keinen
  DSGVO-Verarbeitungsvorgang**, **keine PII-Spalten** und folglich **keine
  `COMMENT ON COLUMN … pii=true`-Pflicht** und **keine DSFA-Auslöser** in diesem
  ADR.
- **Höchstens** eine **Baseline-Extension-Migration** in Phase 4
  (`CREATE EXTENSION IF NOT EXISTS timescaledb;`, ggf. `pgcrypto`) — **ohne
  Fachtabellen, ohne PII**. Sie dient nur der reproduzierbaren DB-Grundausstattung
  für Testcontainer und Compose.
- **UUID-Hinweis (für Folge-ADRs, nicht Skelett):** PostgreSQL 16 hat **kein**
  natives `uuidv7()`; die Regel-Präferenz „uuid v7" wird in Fachtabellen
  applikationsseitig (MIT-Lib) **oder** per Extension erzeugt — Entscheidung in
  ADR-0003/0004, hier nur vermerkt.

TimescaleDB wird im Skelett **nur** als Extension bereitgestellt, **nicht**
genutzt (Hypertables erst für Audit-Log/Events in ADR-0003) — konsistent mit der
Regel „Timescale nur für Zeitreihen".

---

## 12. Phase-2-Gates & Abnahme-Status

Gates laut `.claude/docs/workflow-catalog.yaml`, Phase `2-design`:

- [x] **„ADR review-ready"** — ADR auf Status `proposed` ausgebaut (Abschnitte
  10–13), OpenAPI-Entwurf vorhanden (`schemas/openapi/health.openapi.yaml`),
  DB-Schema-Feststellung dokumentiert (Abschnitt 11). **Beide Lead-Reviews
  abgeschlossen und eingearbeitet** (backend-lead + devops-lead, siehe Abschnitt
  13) — Gate belegt.
- [x] **„Breaking Changes identifiziert"** — **keine**. Greenfield-Skelett, keine
  bestehenden Consumer, keine API-Vorversion. (Der Health-Contract startet bei
  `0.1.0`; Breaking-Change-Regeln greifen erst ab einer publizierten Major.)
- [x] **„DSGVO-relevante Datenfelder markiert"** — **keine vorhanden**. Skelett
  verarbeitet keine personenbezogenen Daten, kein Fachschema (Abschnitt 11);
  bestätigt konsistent mit dem Phase-1-Risiko-Flag „niedrig (konditioniert)".

**Phase-2-Status:** Alle drei Gates **erfüllt**; beide Lead-Voten eingearbeitet.
**Status bleibt `proposed`** — **User-Freigabe steht aus** (Abschnitt 13). Die
konditionierte Risiko-Einstufung (6.1 Auflage 5) bleibt an das ab-Commit-1-grüne
License-Gate/SBOM/DCO/Secret-Scan gebunden — durch das Pipeline-Design in 10.3
adressiert; Einschränkung Push-Protection siehe offener Punkt 1.

---

## 13. Phase-2-Lead-Reviews & konsolidierte offene Punkte

Beide Lead-Reviews sind **abgeschlossen** und oben in die Abschnitte 10.x
eingearbeitet. Zusammenfassung des Review-Trace:

**backend-lead — Voten (alle eingearbeitet):**
1. Vitest **bestätigt mit harter Auflage** SWC-Transform (`unplugin-swc`, MIT) für
   den Backend-Workspace (sonst bricht NestJS-DI still) → 10.5; Fallback Jest.
2. Migrations-Eigenbau **bestätigt** + drei Muss-Ergänzungen (Rollback-Semantik,
   Checksum-Drift = harter Abbruch, `pg_advisory_lock`) → 10.4.
3. Health **bestätigt** (inline `SELECT 1`, DB-Wiring im Skelett) via **`HealthService`**,
   kein DB-Call im Controller → 10.7.
4. Client-Generator: **Tendenz `openapi-typescript` + `openapi-fetch`** (Bundle-Budget
   ≤ 250 KB gz ergänzt); finale Entscheidung an `frontend-lead` delegiert → 10.7.
- Findings: (hoch) Topologie-Leak `/health/ready` → **OpenAPI + 10.7 gefixt**
  (generische Tokens); (mittel) `@Public()`-Guard → **Deny-by-default-Stub ab
  Commit 1 entschieden** → 10.7; (niedrig) Health-Test-Checkliste → 10.7.

**devops-lead — Voten (alle eingearbeitet):**
1. Time-to-green: Secret-Scan im PR-Pfad = **Diff-Scan**, Full-History nightly +
   vor Public-Go; Testcontainers-Image-Pull als **unbudgetiertes Risiko** vermerkt
   → 10.3/10.5.
2. License-Gate Stufe 2 abgenommen; **Auflage** `pnpm install --prod --frozen-lockfile`
   gegen denselben Lockfile für das Deploy-Image → verankert für ADR-0005 → 10.3.
3. SBOM cdxgen **eingeschränkter Modus** (`--type npm`, keine Fremd-Analyzer) → 10.3.
4. gitleaks-Binary + **SHA256-Pinning**; **Push-Protection ungeklärt** → offener
   Punkt 1 → 10.3.
5. `public-export-guard` = **`git archive`-only**; `git filter-repo` nur einmalig
   beim Public-Go; git-filter-repo = **MIT** ✓; Action-Pinning per SHA bestätigt
   → 10.6.
- Findings: (hoch) **SCA/CVE-Gate ergänzt** (Job 11 `dep-audit`, `pnpm audit`/
  `osv-scanner` Apache-2.0) → 10.3; (mittel) Cache-Trust-Boundary + Verbot
  `pull_request_target` mit Fork+Secrets → 10.3; (mittel) Action-Update-Prozess
  **Dependabot** (Renovate=AGPL verworfen) → 10.3.

### 13.1 Offene Punkte — Status nach User-Freigabe (2026-07-09)

1. **GitHub-Plan / Push-Protection — ENTSCHIEDEN (User, 2026-07-09): GitHub-Plan =
   Free.** Push-Protection und GitHub Secret Scanning sind für **private** Repos
   auf dem Free-Plan **nicht** verfügbar (setzen GitHub Advanced Security /
   Secret-Protection, Team/Enterprise, voraus). **Konsequenz — vom User bewusst
   akzeptiert:** Bis zum Public-Go wirkt der **gitleaks-CI-Job** (Diff-Scan im
   PR-Pfad, Full-History nightly, siehe 10.3) als **nachgelagerte
   Kompensationskontrolle** — nicht gleichwertig zur präventiven, serverseitigen
   Push-Protection. **Compliance-Auflage 2 ist damit bewusst nur teilweise
   erfüllt** (präventiver Anteil offen, detektierender Anteil abgedeckt).
   **Wichtig / Pflichtschritt Public-Go:** Für **öffentliche** Repos sind
   **Push-Protection und Secret Scanning kostenlos**. Ihre **Aktivierung** ist
   daher als **verbindlicher Punkt in die Public-Go-Checkliste** (6.1 Auflage 3)
   aufzunehmen — **damit wird Auflage 2 beim Public-Go voll erfüllt**.
   → Kein offener Punkt mehr für Phase 4; Nachverfolgung am Public-Go-Gate.
2. **Finalisierung Client-Generator** (`openapi-typescript`+`openapi-fetch` vs.
   `orval`) durch `frontend-lead`. **Nicht blockierend, EINZIGER verbleibender
   offener Punkt** — darf in **Phase 4** erfolgen; beide Optionen sind
   lizenzkonform und erfüllen die Frontend-Rule.

### 13.2 Abnahme

- Phase-2-Gates **erfüllt** (Abschnitt 12), beide Lead-Voten **eingearbeitet**.
- **Status `accepted`** — **User-Freigabe am 2026-07-09** erteilt; offener Punkt
  13.1(1) durch User entschieden (GitHub-Plan Free), es verbleibt nur 13.1(2)
  (Client-Generator) für Phase 4.
- **Nächste Schritte:** Phase 3 (kompakter Compliance-Check der Auflagen-Umsetzung
  im Design) durch `compliance-director`; **Phase 4 (Implementation) startet nach
  dessen Ergebnis.** Compliance-Auflage 1 (Public/Private-Grenze) und Auflage 2
  (Push-Protection-Aktivierung) finalisiert `compliance-director` am
  Public-Go-Gate (6.1 Auflage 3).

---

## 14. Nachtrag: Lizenzwechsel BSD-3-Clause → Apache-2.0 (2026-09-16)

**Vom User entschieden.** Abschnitt 7.1 und Punkt 111 oben beschreiben den
Stand bis hierher (`LICENSE` = BSD-3-Clause) und bleiben als Phasen-Historie
unverändert stehen.

### 14.1 — Der Anlass ist ein Ziel, keine Lizenzpräferenz

Die Geschäftsführung will, dass **jeder, der die Software als Grundlage nutzt,
die KIT Consulting GmbH nennt**. Gemessen daran war der zunächst erwogene
Wechsel zu MIT die falsche Richtung:

| Lizenz | Was sie zur Nennung verlangt |
|---|---|
| MIT | Nur: Copyright- und Lizenztext bei „copies or substantial portions" mitgeben. Wer die Software einbettet, muss den Urheber **nirgends** nennen, wo ein Nutzer hinsieht |
| BSD-3-Clause (bis hier) | Zusätzlich Klausel 2: Bei Binär-Weitergabe erscheint der Vermerk „in the documentation and/or other materials". Klausel 3 schützt den Namen gegen Werbenutzung |
| **Apache-2.0** | **§4(d):** Abgeleitete Werke tragen den NOTICE-Inhalt — in der NOTICE-Datei, der Dokumentation **oder der von ihnen erzeugten Anzeige**. **§6:** ausdrücklich keine Markenrechte. **§3:** Patentlizenz |

Apache-2.0 ist das einzige anerkannte Standardinstrument, dessen Attribution
bis in das sichtbare Produkt reichen kann.

### 14.2 — Warum das zulässig ist

Die bindende Auflage (`compliance/foerderauflagen/opensource-publikationspflicht.md`,
Auflage 1, wörtlich mitgeteilt 2026-07-09) verlangt eine **Eigenschaft**, keinen
Lizenznamen: „Muss die kommerzielle Weiterverwendung und die Einbettung in
kommerzielle Produkte ohne Einschränkung erlauben — empfohlen MIT oder BSD."

Apache-2.0 erfüllt diese Eigenschaft (OSI-anerkannt, permissiv, kommerzielle
Nutzung und Einbettung in proprietäre Produkte ausdrücklich erlaubt). „Empfohlen"
ist eine Empfehlung, keine Beschränkung — die Wahl ist eine **Abweichung von der
Empfehlung, kein Verstoß gegen die Auflage**, und wird deshalb hier begründet
statt beiläufig vollzogen.

Apache-2.0 steht überdies bereits auf der eigenen Abhängigkeits-Whitelist
(`.claude/rules/dependencies.md`) — intern entsteht kein Widerspruch.

### 14.3 — Der Nachteil, der bleibt

**Apache-2.0 ist mit GPL-2.0-only unvereinbar** (mit GPLv3 dagegen verträglich).
Ein GPLv2-only-Projekt kann diesen Code nicht einbinden; unter MIT oder
BSD-3-Clause könnte es das. Das ist die einzige Stelle, an der Apache weniger
kann als der bisherige Stand, und die einzige, auf die eine weite Auslegung von
„Einbettung ohne Einschränkung" zeigen könnte.

Gewichtet: Die Auflage spricht von der Einbettung in **kommerzielle** Produkte;
dort spielt GPLv2-Kompatibilität praktisch keine Rolle. Der Punkt wird
festgehalten, nicht weggeredet.

### 14.4 — Der Zeitpunkt ist der günstigste, den es gibt

Nichts ist veröffentlicht, das Repository ist privat, und die
Projektdokumentation ist **noch nicht bei der BAFA**. Damit ist dies keine
*Änderung einer Veröffentlichung* im Sinne des Widerrufsvorbehalts (3.4), der
rückwirkende Aberkennung und Rückforderung vorsieht, sondern die
Erstfestlegung. Nachträglich wäre derselbe Schritt erheblich teurer.

### 14.5 — Was geändert wurde und was offen bleibt

Geändert: `LICENSE` (vollständiger Apache-2.0-Text, unverändert übernommen,
Prüfsumme gegen eine vorhandene kanonische Kopie abgeglichen), neu `NOTICE`,
`package.json` und `tools/migrate/package.json` (SPDX-Kennung), `CONTRIBUTING.md`
(inbound = outbound, plus die Pflicht, neue Attributionen im selben Commit in
`NOTICE` nachzutragen), `Projektleitlinien`, `.claude/rules/dependencies.md`.

Die Whitelist-Zeilen, die BSD-3-Clause weiterhin führen, bleiben: Sie betreffen
zulässige Lizenzen von **Abhängigkeiten**, nicht die eigene.

| Offen | Warum nicht hier erledigt |
|---|---|
| `compliance/foerderauflagen/opensource-publikationspflicht.md` (Auflage 1, Abschnitte 4 und 5) | Schreibgeschützter Pfad — `compliance-director`-Votum erforderlich |
| `README.md`, Lizenzabschnitt (zwei Stellen) | Wird zeitgleich von einer anderen Arbeitssitzung bearbeitet; eine parallele Änderung derselben Datei ginge beim nächsten Speichern verloren |
| `docs/bafa/Projektdokumentation…` (zwei Stellen, „BSD-3-Clause … erfüllt") | Ebenfalls in fremder Bearbeitung; muss die neue Lizenz nennen, **bevor** das Dokument eingereicht wird |
| BAFA-Zustimmung als Change-Control (R-0001) | Fachliche Abstimmung, keine Code-Aufgabe |
