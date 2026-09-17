# ADR-0002: Auth-Modul (OIDC/Keycloak, JWT-Guard, RBAC + ABAC-Fundament, BFF-Token-Handling)

- **Status:** **accepted** — **durch User freigegeben am 2026-07-13** (Phase-2-Design inkl. beider Lead-Reviews, Teil B §11–§20; Konflikt-Entscheidungen PolicyInterceptor + Savepoint-Kette via `nestjs-cls` bestätigt). Phase 1 abgeschlossen 2026-07-10 (User-Entscheidungen A1–A6, Abschnitt 8.1; `compliance-director` ohne Veto — Risiko **MITTEL (Verarbeitung) / HOCH (Kompromittierungs-Wirkung, A.5.17)**, fünf rote Linien 7.3). **Kein** Schema, **keine** Migration, **kein** Compose-Eingriff in diesem ADR — **nächster Schritt: Phase 3 (Compliance-Nachträge, §7.4), danach Implementation Phase 4.** Offene Punkte §19 (admin-Erstvergabe + MFA-Bootstrap-Frist, A-O7-Mitbestimmung, Phase-4-Verifikationen).
- **Datum:** 2026-07-10
- **Autor:** product-director (Phase 1)
- **Reviewer:** `compliance-director` — **Phase 1 ohne Veto bestätigt (2026-07-10)**; Risiko-Flag **MITTEL (Verarbeitung) / HOCH (Kompromittierungs-Wirkung, A.5.17)** geschärft; **fünf rote Linien** für Phase 2 (7.3); Phase-3-Vorschau (7.4); Beschäftigten-Mitbestimmung läuft unter dem **bestehenden A-O7-Klärungsauftrag (ADR-0003)** als Vorbedingung vor produktiver Beschäftigten-Konten-Nutzung.
- **Freigabe:** User — **Phase-1-Entscheidungen A1–A6 getroffen (2026-07-10)**, siehe Abschnitt 8.1.
- **Workflow:** `/new-feature auth-modul`, Phase 1 (Konzept & Vision) laut `.claude/docs/workflow-catalog.yaml`
- **Roadmap-Bezug:** „Als Nächstes: ADR-0002: Auth-Modul (OIDC, Keycloak) — Voraussetzung für die Ingest-Gate-Freigabe von ADR-0004" **und** „Stammdaten-CRUD-API + internes Betriebs-UI … Voraussetzung: ADR-0002" (`production/roadmap.md`, revision 6).

> **Hinweis zum Reifegrad:** Dies ist das **Vision-Memo** (Phase-1-Output,
> **abgeschlossen**). Es beantwortet die Produktfragen (Zielnutzer, Job-to-be-done,
> Erfolgsmetriken, Scope, Alternativen, Sequenzierung, Compliance-Risiko) und die
> Phase-1-Entscheidungen (A1–A6, Abschnitt 8.1); die **Übergabe an
> `technical-director` (Phase 2)** ist der nächste Schritt. **Alle konkreten
> Technik-Entscheidungen** — ABAC-Engine-Wahl, Guard-/Interceptor-Implementierung,
> Token-/Session-Detaildesign, Realm-Konfigurationsdetails, Krypto-/JWKS-Handling,
> Migrationen — sind **bewusst Phase 2/3/4.** In diesem ADR wird **kein Code
> geschrieben, kein Realm exportiert und keine Migration angelegt.**
>
> **Domäne:** EDMS = **Energiedatenmanagementsystem** (Einsparzähler-Plattform,
> BAFA-Pilotprogramm ESZ). Grundlage: `Projektleitlinien`, `production/roadmap.md` (rev. 6),
> `compliance/foerderauflagen/merkblatt-anforderungen.md` (rev. 3, DS-/DE-/TB-Zeilen),
> `docs/adr/ADR-0004-kern-datenmodell-energie.md` (§6, §13.2) und
> `docs/adr/ADR-0003-audit-log.md` (§17).

---

## 1. Vision-Satz (Job-to-be-done)

> **Als internes Betriebs-Team, als Auditor und als jeder state-ändernde
> Fach-Service brauche ich eine zentrale, gegen Keycloak (OIDC) verankerte
> Identitäts- und Zugriffsdurchsetzung — Deny-by-default-AuthN/AuthZ auf jeder
> nicht-öffentlichen Route, rollenbasiert (RBAC) und um die
> Datenschutz-Attribute des Kern-Datenmodells (Nutzungsverhältnis,
> Datenklasse) erweiterbar (ABAC) — damit erst hier der `actor_sub` scharf
> vertrauenswürdig wird, jede abgelehnte Entscheidung nachweisbar ist und die
> beiden Folge-Bausteine (ADR-0004-Ingest-Gate, Stammdaten-API + Betriebs-UI)
> überhaupt aufsetzen können.**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

ADR-0002 ist der **letzte große Gate-Baustein**: Es ist (neben ADR-0003) die zweite
harte Vorbedingung der **ADR-0004-Ingest-Gate-Öffnung** (ADR-0004 §6/§7.1
Bedingung 1) **und** die Voraussetzung dafür, dass die **Stammdaten-CRUD-API + das
interne Betriebs-UI** (bewusst in ADR-0004 §17 hinter ADR-0002 verschoben)
freigeschaltet werden. Es ist außerdem das **bindende Stück** für das Audit-Log:
Erst mit validiertem Keycloak-Token wird die in ADR-0003 §17.4 dokumentierte
`actor_sub`-Trust-Boundary im NestJS-Layer **scharf** — ADR-0002 ist damit der
**erste echte Audit-Emitter** (authn/authz-Events, Abschnitt 4.1).

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Internes Betriebs-Team (primär, erste reale Nutzergruppe).**
Die **erste** produktive Nutzergruppe überhaupt (Betriebs-UI folgt direkt auf
ADR-0002). Meldet sich am Web-Frontend an (OIDC-Code-Flow gegen Keycloak), pflegt
Stammdaten (Endkunden/Systeme/Zähler/Messkonzepte), prüft Vollständigkeit (DE-02)
und Störungen (TB-04). Erwartet: verlässlicher Login/Logout, sauberer
Session-Ablauf, keine unerwarteten Sperren, klare „darf ich das?"-Fehler statt
Stacktraces (DS-10). Erfolg = arbeiten ohne Auth-Reibung, aber jede Aktion ist
autorisiert und protokolliert.

**Persona B — Auditor / Compliance (primär als Leser, Stakeholder mit Veto).**
`compliance-auditor`-Rolle: BAFA-/Datenschutz-/ISO-27001-Sicht. Braucht **Lese-**
Zugriff auf Nachweise (u. a. Audit-Log-Prüfsichten aus ADR-0003), **ohne**
Schreib-/Admin-Rechte. **DS-01-Rollenausschluss:** Die DSB-/Auditor-Funktion ist
organisatorisch von IT-Admin-Rechten zu **trennen** — das RBAC-Modell muss das
abbilden (kein „Admin sieht/darf alles inkl. Auditor-Rolle in Personalunion").
Erfolg = die Rollentrennung ist im Modell verankert und belegbar.

**Persona C — Fach-Service / Dienstkonto (System-Akteur).**
Ingest-/Baseline-/Export-Worker (ADR-0005/0006/0007) und interne Service-zu-Service-
Aufrufe. Authentisiert sich als **Dienstkonto** (Client-Credentials), nicht als
Mensch. Erwartet: opake, stabile Principal-Kennung für das Audit-Log
(`actor_typ='dienstkonto'`), knappe Least-Privilege-Rechte. Erfolg = kein
Mensch-Login-Pfad für Maschinen, saubere Trennung `benutzer`/`dienstkonto`/`system`
(deckt ADR-0003 §13.1 `actor_typ` ab).

**Persona D — Endkunde / Anschlussnutzer (sekundär, später).**
Meldet sich **erst mit dem Nutzerportal** an (Roadmap „Später"). Für ADR-0002 nur
als **Strukturanforderung** relevant: Das ABAC-Fundament muss die DS-07-Sichttrennung
(Endkunde/Vermieter sieht nur **Abrechnungsminimum** der Anschlussnutzer-Daten)
**durchsetzen können**, sobald das Portal kommt — die *scharfe Durchsetzung* ist
mangels Portal in v1 noch nicht live (siehe 4.2, A2). Self-Registration/Consent-UI
= späterer ADR.

**Persona E — `compliance-director` / `dsgvo-`/`iso27001-auditor` (Stakeholder, Veto).**
Prüft: DS-01 (Rollenausschlüsse), DS-09 (Keycloak hält Beschäftigten-PII → DE-Only-
Hosting), DS-10 (TLS, Login-Härtung, Passwörter nie Klartext), Beschäftigten-
datenschutz (Art. 88 DSGVO/§26 BDSG, analog ADR-0003). Erfolg = AuthN/AuthZ ist als
TOM (Art. 32) belegbar, ohne dass ein neuer DSFA-Auslöser entsteht (Abschnitt 7).

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| **M1** | **Deny-by-default real erzwungen** — jede **nicht-`@Public`**-Route ohne gültiges Token liefert **401/403** | **Contract-/Integrationstest** gegen den globalen JWT-Guard (ersetzt den Deny-by-default-Stub aus dem Skelett): Aufruf jeder registrierten Route **ohne** und mit **ungültigem/abgelaufenem** Token; `@Public`-Routen bleiben offen. Teil der CI. | **0** unautorisierte Durchbrüche; Test **grün** und in CI |
| **M2** | **Jede abgelehnte AuthZ-Entscheidung ist auditiert** | Denied-Pfad emittiert via **`audit.append_event`** (ADR-0003 §17.1) ein Event mit `ergebnis='denied'` (ADR-0003 §17.2). Integrationstest: verbotener Zugriff → genau **eine** `denied`-Audit-Zeile mit opakem `actor_sub`, ohne PII. | **1:1** denied→Audit-Event; **0** stille Ablehnungen |
| **M3** | **Token-Handling nach Frontend-Rule nachweisbar** | Automatisierter Check/Playwright-Assertion: **kein** Access-Token in `localStorage`/`sessionStorage`; Access-Token **nur im Memory**; Refresh **nur** im **httpOnly**-Cookie (via Backend/BFF). Statischer Grep-Check gegen `localStorage`/`sessionStorage`-Token-Nutzung. | **0** Token-Persistenz im Browser-Storage |
| **M4** | **Keycloak-Realm als Code reproduzierbar** | Realm-**Export im Repo** (versioniert); Re-Import in frischen Dev-Compose erzeugt **identische** Konfiguration inkl. **DS-10-Härtung** (Brute-Force-Lockout, Passwort-Policy, TLS-Erzwingung). Idempotenz-Check im CI/Dev-Bootstrap. | Realm **deterministisch** rekonstruierbar; DS-10-Settings **im Code sichtbar** |
| **M5** | **RBAC-Rollen-Mapping korrekt & getestet** | Test-Matrix **Rolle × Route**: Token-Claim/Rolle → erwartete Guard-Entscheidung (allow/deny). Belegt insbesondere den **DS-01-Ausschluss** (Auditor ≠ IT-Admin, Persona B). | Matrix **grün**; DS-01-Ausschluss **testbelegt** |
| **M6** | **ABAC-Fundament greift auf Datenmodell-Attribute zu** | Der **Policy-Decision-Point** (Schnittstelle) ist unit-testbar mit den ABAC-Steuergrößen aus ADR-0004 §13.2 (`nutzungsverhaeltnis`, Datenklasse **Abrechnungsminimum vs. Detailverbrauch**, `von_wiss_auswertung_ausgenommen`) — auch wenn der **Enforcement-Point (Portal)** noch nicht live ist. | Policy-Interface **vorhanden + testbar**; Attribut-Durchleitung nachgewiesen |

> **M6-Enforcement-Zeitpunkt** der DS-07-Sichttrennung koppelt an das erste
> Portal-/Mieter-Projekt (ADR-0004 §8.2, A2) — v1 liefert die **Policy-Schnittstelle
> + Attribut-Durchleitung**, nicht die scharfe Portal-Durchsetzung. **ABAC-Engine-Wahl
> ist Phase 2.** M1–M5 sind bereits in v1 hart prüfbar und CI-tauglich.

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope v1 (Vorschlag)

- **OIDC-Authorization-Code-Flow gegen Keycloak** (mit PKCE) — der NestJS-Backend-
  Teil agiert als **vertraulicher Client**; Keycloak läuft als **Dienst über die
  Netzwerkgrenze** (`Projektleitlinien`).
- **JWT-Validierungs-Guard** — **ersetzt den vorhandenen Deny-by-default-Guard-Stub
  mit `@Public()`-Decorator** aus dem Skelett (`.claude/rules/backend-nestjs.md`:
  „AuthZ-Guard auf jeder non-public Route. Default = deny"). Token-Signatur-/
  Aussteller-/Audience-/Ablauf-Prüfung gegen die Keycloak-JWKS.
- **RBAC-Grundrollen (Vorschlag, A1):** minimaler v1-Satz
  - **`betrieb`** — internes Betriebs-Team: Stammdaten-CRUD + Monitoring (Persona A).
  - **`compliance-auditor`** — **nur lesend** auf Nachweis-/Audit-Sichten (Persona B);
    **DS-01-getrennt** von `admin`.
  - **`admin`** — Benutzer-/System-Administration; **ohne** Auditor-Rechte in
    Personalunion (DS-01).
  Rollen kommen als **Token-Claims aus Keycloak** (Realm-Rollen/Gruppen), das Backend
  **mappt**, verlässt sich aber auf die validierte Signatur.
- **ABAC-Fundament** — **Policy-Schnittstelle (PDP-Interface)**, die Attribute aus
  dem Kern-Datenmodell konsumiert (ADR-0004 §13.2: `nutzungsverhaeltnis`,
  Datenklasse Abrechnungsminimum/Detailverbrauch, `von_wiss_auswertung_ausgenommen`;
  opake Principal-IDs). **Engine-Wahl** (z. B. OPA/Rego, Casbin, CASL, in-code) ist
  **Phase 2** (Tech-Trade-off, `technical-director`). v1 = **Schnittstelle +
  Attribut-Durchleitung**, nicht die produktive Portal-Durchsetzung (A2).
- **BFF-Token-Endpoints** — **Login / Refresh / Logout** im NestJS-Backend, das die
  Frontend-Rule erzwingt: **Access-Token nur im Memory, Refresh im httpOnly-Cookie
  via Backend** (`.claude/rules/frontend-react.md`). Backend hält den vertraulichen
  Client-Pfad und setzt/rotiert das httpOnly-Refresh-Cookie. **Session-TTLs (A4
  entschieden):** Access **5 min**, Idle-Timeout **30 min**, absolute Session **8 h**.
- **MFA-Pflicht ab v1 (A3 entschieden):** **verpflichtend** für **alle Konten mit
  PII-Schreib- oder Auditor-Leserecht** (`betrieb`, `admin`, `compliance-auditor`),
  **spätestens vor dem ersten produktiven Zugriff**. **Dokumentierte, befristete
  Ausnahme nur für das Bootstrap-Admin-Konto.** **Dienstkonten** (Persona C) laufen
  **nicht** über MFA, sondern via **Client-Credentials mit starken Secrets/mTLS**
  (Secrets nie im Realm-Export, sondern via Env/Vault — rote Linie 4). Die
  Realm-/Flow-Wahl bildet MFA (TOTP/WebAuthn) **erzwingbar** ab.
- **Keycloak im Dev-Compose** (bewusst bisher **nicht** enthalten — kommt jetzt) **+
  Realm-Export als Code** (versioniert, reproduzierbar, M4) inkl. **DS-10-Härtung**:
  TLS-Erzwingung, **Login-Versuche limitieren + Login-Sperre** (Keycloak-Brute-Force-
  Detection), **Passwörter nie im Klartext** (Keycloak-Hashing, Argon2/bcrypt).
- **Audit-Emitter für authn/authz-Events** — **ERSTER echter Emitter** des in
  ADR-0003 gebauten Log-Bausteins (§17, Phase-4-Auflage). Neue `event_typ`-Katalog-
  Einträge über **`/add-audit-event`** (z. B. `auth.login.ok`, `auth.login.denied`,
  `auth.logout.ok`, `authz.access.denied`) — PII-frei, opaker `actor_sub`,
  `ergebnis`-Mapping nach ADR-0003 §17.2. **Denied wird mit-auditiert** (M2).

### 4.2 Out-of-Scope v1 (explizit NICHT — mit „Verankerungs-Slots")

- **Endkunden-Self-Registration** → Portal-ADR. v1 kennt nur intern
  provisionierte Konten (Betriebs-Team, Dienstkonten).
- **MFA-Enforcement ist v1-Scope** (A3, siehe 4.1) — **NICHT** out-of-scope. Später
  bleiben nur **Komfort-/Self-Service-Aspekte** (nutzergeführte Enrollment-/
  Recovery-UX, weitere Faktoren) und der breite Endkunden-Portal-MFA-Rollout.
- **LDAP/AD-Federation** → **`integration-engineer`, späterer ADR.** v1: lokaler
  Keycloak-Realm; Federation-Slot bleibt offen (kein Bruch).
- **Consent-UI / Consent-Enforcement** → **eigener Consent-ADR** (ADR-0004 §4.3;
  Ingest-Gate-Bedingung 4). ADR-0002 liefert nur die Identität, an die ein späterer
  Consent-Datensatz gebunden wird.
- **Scharfe DS-07-Portal-Durchsetzung** (Endkunde sieht nur Abrechnungsminimum) →
  koppelt an das erste Portal-/Mieter-Projekt (ADR-0004 §8.2). v1 = Policy-Interface
  + Attribute (M6), nicht der Portal-Enforcement-Point.
- **Feingranulare Objekt-/Feld-Berechtigungen** über die RBAC-Grundrollen hinaus →
  wachsen mit den Fach-ADRs (`access-control-engineer`).

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 RBAC-Granularität in v1 — schmaler Grundsatz vs. breiter Rollenbaum

- **A — Schmaler v1-Satz** (`betrieb`, `compliance-auditor`, `admin`), fein
  nachschärfen mit den Fach-ADRs. *Pro:* deckt die **erste reale Nutzergruppe**
  (Betriebs-Team) + DS-01-Trennung + Dienstkonten ab, ohne Rollen zu erfinden, die
  noch keinen Nutzer haben; ABAC trägt später die Feingranularität. *Contra:* einige
  Fach-ADRs müssen Rollen ergänzen (erwartet, nicht teuer).
- **B — Breiter, antizipierender Rollenbaum** (Sachbearbeiter/Freigeber/Support/…
  schon jetzt). *Pro:* „einmal fertig". *Contra:* **Scope-Creep** — Rollen ohne
  Nutzer/JTBD; Rollen-Design ohne reale Prozesse ist Spekulation und veraltet, bevor
  es benutzt wird.
- **Entschieden: A (A1).** Minimaler, nutzergedeckter Satz `betrieb` /
  `compliance-auditor` (strikt lesend) / `admin`, DS-01-getrennt; Feingranularität
  über ABAC + Fach-ADRs. Konkrete `admin`-Vergabe klärt der User bei der
  Realm-Einrichtung (8.2).

### 5.2 Keycloak-Betriebsmodell — selbst betreiben vs. Managed

- **A — Keycloak selbst betreiben** (Dev-Compose jetzt; prod im DE-Only-K8s). *Pro:*
  **volle Kontrolle über DS-09** (Keycloak-User-DB = Beschäftigten-PII → DE-Only,
  ISO-27001-RZ); Realm-as-Code ohnehin nötig (M4). *Contra:* Betriebslast
  (Patching, HA, Backup) beim Team.
- **B — Managed Keycloak/IdP-as-a-Service.** *Pro:* weniger Betrieb. *Contra:*
  **DS-09-Risiko** — der Managed-Anbieter verarbeitet PII; DE-Only-Standort +
  ISO-27001-RZ + **AVV/TIA** müssen vertraglich sicher sein; koppelt an R-0002.
- **Entschieden: A (A6) — Selbstbetrieb, DE-Only** (Dev-Compose jetzt; prod
  DE-Only-K8s). Managed nur *theoretisch* und nur bei DE-RZ + ISO-27001 + **kein
  US-Mutterkonzern** + AVV/TIA — **nicht verfolgt.**

### 5.3 Token-/Session-Modell — Hybrid (Frontend-Rule) vs. voller BFF

- **A — Hybrid (Frontend-Rule-konform):** Access-Token **im Memory**, Refresh im
  **httpOnly-Cookie**; Backend als vertraulicher Client. *Pro:* **entspricht der
  geltenden `frontend-react.md`-Rule**; Access-Token nie persistent, Refresh
  XSS-geschützt. *Contra:* Access-Token existiert (kurzlebig) im Browser-Speicher.
- **B — Voller BFF (Session-Cookie only):** Token verlässt den Browser **nie**;
  Frontend hält nur ein **httpOnly-Session-Cookie**, Backend hängt das Token
  server-seitig an. *Pro:* stärkste Härtung (kein Token im Browser). *Contra:*
  **weicht von der aktuellen Frontend-Rule ab** (die ein Access-Token im Memory
  vorsieht) — bräuchte eine **Rule-Anpassung** + `ux-lead`/`security-lead`-Abnahme.
- **Entschieden: A (A5) für v1** (Rule-konform, geringstes Risiko); **voller BFF (B)
  als spätere Härtungsoption vorgemerkt** (bräuchte Frontend-Rule-Anpassung).

### 5.4 Session-/Token-Lebensdauern — **entschieden (A4)**

**Gewählt (Standard):** Access-Token **5 min**, Idle-Timeout **30 min**, absolute
Session **8 h** (Betriebs-Team-Arbeitstag). Balanciert Datensparsamkeit/DS-10-Härtung
gegen Bedienkomfort; kurze Access-TTL begrenzt das Fenster kompromittierter Tokens.
Reauth bei besonders sensiblen Aktionen bleibt Phase-2-Feinschliff (`security-lead`).

---

## 6. Sequenzierung & Abhängigkeiten

- **ADR-0002 ist der letzte harte Gate-Baustein** für den **ADR-0004-Ingest**
  (§6/§7.1 Bedingung 1) und schaltet **Stammdaten-API + Betriebs-UI** frei
  (ADR-0004 §17; `roadmap.md` rev. 6). Danach fehlen fürs Ingest-Gate nur noch die
  **nicht-Auth-Bedingungen**: abgeschlossene DSFA, Consent-Enforcement, DE-Only-
  Hosting/AVV/TIA (ADR-0004 §7.1 Bed. 3–5) — Auth **allein** öffnet das Gate **nicht**.
- **Kopplung an ADR-0003 (Audit):** ADR-0002 ist der **erste echte Emitter**. Es
  **schärft** die in ADR-0003 §17.4 dokumentierte `actor_sub`-Trust-Boundary: **vor**
  ADR-0002 ist `actor_sub` nur so vertrauenswürdig wie der Emitter; **mit** validiertem
  Keycloak-Token wird die Akteurs-Zuschreibung scharf. Der Schreibpfad bleibt
  **`audit.append_event`** (ADR-0003 §17.1) — ADR-0002 baut **kein** eigenes Audit-Schema.
- **Kopplung an ADR-0004 (Datenmodell):** ADR-0002 **konsumiert** die ABAC-Attribute
  (§13.2), führt sie aber **nicht** ins Datenmodell ein (die liegen bereits vor).
  Principal-Referenzen bleiben **opake `sub`** (kein Hart-FK, wie ADR-0004 §6/§13.2
  vorgesehen).
- **Reihenfolge-Realität:** ADR-0004 (Schema accepted) und ADR-0003 (accepted)
  liegen vor; ADR-0002 füllt den zweiten Gate-Baustein und macht die Folge-Services
  (Stammdaten, ADR-0007-Export, Consent) **von Beginn an authz- und audit-fähig**.

---

## 7. Compliance-Einfluss / Phase-1-Risiko-Flag

### 7.1 Risiko-Einordnung — **MITTEL (Verarbeitung) / HOCH (Kompromittierungs-Wirkung) — `compliance-director` ohne Veto bestätigt (2026-07-10)**

**Einstufung: MITTEL für die laufende Verarbeitung** (Identitäts-/Zugriffsverwaltung
interner Beschäftigter — Betriebs-Team, Admins, Auditoren; **kein neuer DSFA-Auslöser**,
da kein hochauflösendes Verbrauchsprofil wie ADR-0004) — **aber Kompromittierungs-
Wirkung HOCH.**

**Risiko-Schärfung (`compliance-director`, verbindlich):** Keycloak hält nicht nur
Identitäts-PII, sondern **Authentisierungs-GEHEIMNISSE** — **Passwort-Hashes,
MFA-Seeds, Session-Material, Client-Secrets** (ISO/IEC 27001 **A.5.17
Authentication information**). Deren Kompromittierung hätte **hohe** Auswirkung
(Vollzugriff auf alle nachgelagerten Fach-/PII-Daten). Das **begründet** die
**MFA-Pflicht ab v1** (A3, 4.1) und die **harte DS-10-Realm-Härtung** (M4).
Zugleich ist ADR-0002 selbst eine **TOM nach Art. 32** (Zugriffskontrolle) und damit
teilweise **risikomindernd**.

**Risiko-Treiber (Phase-3-Nachträge durch `compliance-director`, ich schreibe nicht
in `compliance/**`):**

- **DS-01 (Rollenausschlüsse):** DSB/Auditor-Funktion **strukturell getrennt** von
  IT-Admin — RBAC-Modell (4.1) trägt die Trennung, das **Admin-Konzept** dokumentiert
  den Ausschluss (M5, rote Linie 3).
- **DS-09 (PII-Hosting DE-Only, R-0002-Erweiterung):** die **Keycloak-User-DB ist eine
  zusätzliche DE-Only-/ISO-27001-pflichtige PII-Komponente** — R-0002 wird in Phase 3
  entsprechend erweitert (Storage-/DB-/Deployment-Vorwirkung auf ADR-0005).
- **DS-10 (Webportal-Härtung):** TLS-Erzwingung, **Login-Versuche limitieren +
  Login-Sperre**, **Passwörter nie im Klartext**, **Fehlerausgaben im Frontend
  deaktivieren** — über **Realm-as-Code-Härtung** (M4) + Frontend-Error-Handling
  (rote Linie 4).

**Phase-1-Gate „Compliance-Risiko grob benannt": erfüllt — MITTEL (Verarbeitung) /
HOCH (Kompromittierungs-Wirkung), `compliance-director` ohne Veto.**

### 7.2 Beschäftigtendatenschutz & A-O7-Einbindung (verbindlich)

Login-/Zugriffs-Metadaten der protokollierten Akteure sind **Beschäftigtendaten**
(**Art. 88 DSGVO i. V. m. § 26 BDSG**, analog ADR-0003 §7.2). Zweckbindung eng:
**Sicherheit/Zugriffskontrolle**, **nicht** Leistungs-/Verhaltenskontrolle.

- **Mitbestimmung — kein neuer Punkt:** Die Mitbestimmungsfrage (Betriebs-/
  Personalrat) läuft unter dem **bereits bestehenden Klärungsauftrag A-O7 (ADR-0003
  §23)** und ist eine **verbindliche Vorbedingung vor produktiver Nutzung von
  Beschäftigten-Konten** (8.2) — sie wird hier **nicht** als eigener Punkt dupliziert.

### 7.3 Fünf rote Linien für Phase 2 (verbindliche Design-Constraints, `compliance-director`)

Wörtlich als Constraints für den Phase-2-Design (`technical-director` /
`security-lead` / `backend-lead` / `frontend-lead`):

1. **`actor_sub`/`actor_typ`/`actor_rolle` ausschließlich aus serverseitig
   validiertem Keycloak-Token** (Signatur/Issuer/Audience/Ablauf gegen JWKS), **nie**
   aus Client-Input; **ohne vollständige Validierung KEIN Audit-Emit** (fail-closed).
2. **Keine Tokens/Credentials/Secrets/MFA-Seeds in Logs/Fehlerausgaben/Audit** —
   **pino-redact-Whitelist**; `denied`-Events nur **opake `sub` + strukturierter,
   whitelisted Grund** (kein Freitext, kein PII).
3. **DS-01 strukturell:** Auditor **strikt lesend**, **nie** Personalunion mit
   `admin`, **kein** Zugriff auf die privilegierten ADR-0003-Wrapper; Ausschluss
   **First-Class im Realm-as-Code** + **Test-Matrix M5**.
4. **DS-10-Härtung als versionierter, SECRET-FREIER Realm-Export** (TLS-only,
   Brute-Force-Lockout, Passwort-Policy, kurze Access-TTL) — **Secrets via Env/Vault**,
   nie im Export.
5. **DS-09-Separierbarkeit:** Keycloak-DB **DE-Only platzierbar**; Principal-
   Referenzen bleiben **opake `sub`**, **KEIN Hart-FK** von Fach-/Audit-Schemas auf
   User-Tabellen.

### 7.4 Phase-3-Vorschau (`compliance-director`, dünn)

Erwartete Phase-3-Deliverables (durch `compliance-director` / `dsgvo-auditor` /
`iso27001-auditor`, **vor** Implementation):

- **RVT:** **VT-0003 „Benutzer-/Zugriffsverwaltung"** (Akteurskategorie Beschäftigte)
  — Status `review` bis zur Firmierung.
- **TOMs:** **Abschnitt AuthN/AuthZ** in `compliance/dsgvo/toms.md` (active-fähig).
- **DSFA:** **kein eigener Auslöser** — **TOM-Nachtrag zu DSFA-0001**.
- **Betroffenenrechte:** Ergänzung um **Keycloak-Identitätsdaten** (Auskunft/Löschung
  von Beschäftigten-Konten).
- **Risiko-Register:** **R-0002-Erweiterung** (Keycloak-User-DB als DE-Only-PII).
- **SoA:** **A.5.15** teilweise + **neu A.5.16 / A.5.17 / A.5.18 / A.8.5** +
  **A.8.2 / A.8.3**.

---

## 8. Fragen-Status nach Phase 1

### 8.1 Entschieden (User, 2026-07-10)

- **A1 — RBAC-Erstausstattung: bestätigt.** Grundrollen `betrieb` /
  `compliance-auditor` (**strikt lesend**) / `admin`, **DS-01-getrennt**. Konkrete
  `admin`-Vergabe klärt der User bei der Realm-Einrichtung (→ 8.2).
- **A2 — DS-07-Enforcement: bestätigt (Default).** In v1 nur **ABAC-Fundament**
  (Policy-Interface + Attribute, M6); **scharfe Portal-Durchsetzung erst mit dem
  ersten Portal-/Mieter-Projekt** (koppelt an ADR-0004 §8.2).
- **A3 — MFA: PFLICHT AB V1.** Verpflichtend für **alle Konten mit PII-Schreib- oder
  Auditor-Leserecht**, spätestens **vor dem ersten produktiven Zugriff**;
  **dokumentierte, befristete Ausnahme nur** fürs **Bootstrap-Admin-Konto**;
  **Dienstkonten** via **Client-Credentials mit starken Secrets/mTLS** (4.1).
- **A4 — Session-TTLs (Standard): Access 5 min, Idle 30 min, absolute Session 8 h**
  (5.4).
- **A5 — Token-Modell: bestätigt (Default).** **Hybrid** (Access im Memory, Refresh
  httpOnly via Backend); **voller BFF als spätere Härtungsoption vorgemerkt** (5.3).
- **A6 — Keycloak: SELBSTBETRIEB, DE-Only** (Managed nur theoretisch mit
  DE-RZ/ISO-27001/kein US-Mutterkonzern/AVV+TIA — **nicht verfolgt**) (5.2).

### 8.2 Weiterhin offen — mit Klärungsauftrag (blockiert Impl./Produktivnutzung, nicht Phase 2)

- **Konkrete `admin`-Vergabe (aus A1):** *wer* initial `admin` erhält, klärt der User
  **bei der Realm-Einrichtung** — mit dokumentierter, befristeter Bootstrap-Ausnahme
  von der MFA-Pflicht (A3), die vor Produktivzugriff aufzulösen ist.
- **Mitbestimmung Beschäftigten-Aktivitätslog (A-O7, ADR-0003 §23):** verbindliche
  Vorbedingung **vor produktiver Nutzung von Beschäftigten-Konten** —
  `compliance-director`, organisatorisch (7.2). **Kein neuer Punkt**, läuft unter A-O7.

---

## 9. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Schließt den **letzten harten Gate-Baustein** (neben ADR-0003) für den
  ADR-0004-Ingest und **schaltet Stammdaten-API + Betriebs-UI frei**.
- Macht die `actor_sub`-Trust-Boundary (ADR-0003 §17.4) **scharf** — der erste echte
  Audit-Emitter; jede `denied`-Entscheidung wird nachweisbar.
- Belegt mehrere bisher offene ISO-Access-Control-Controls (A.5.15–A.5.18, A.8.2/3/5).

### Negativ
- Führt **Beschäftigten-PII + Auth-Geheimnisse in Keycloak** ein (Passwort-Hashes,
  MFA-Seeds, Session-Material, Client-Secrets, A.5.17) → **Kompromittierungs-Wirkung
  HOCH**; DS-09/DS-10/Art. 88 gelten auch dort (Betriebs-/Hosting-Aufwand,
  R-0002-Erweiterung, Phase-3-Nachträge RVT/TOMs).
- **MFA-Pflicht ab v1** + Deny-by-default + BFF-Token-Handling erhöhen die anfängliche
  Integrations-/Onboarding-/Test-Last (Guard, MFA-Enrollment, Contract-Tests,
  Cookie-Flows).

### Neutral
- Setzt das Rollen-/Attribut-Vokabular, an das sich alle Folge-Services binden
  (RBAC-Grundrollen, ABAC-Attribute aus ADR-0004 §13.2).

---

## 10. Folgeaufgaben

- [x] **User-Freigabe Phase 1** — A1–A6 entschieden (Abschnitt 8.1).
- [x] **`compliance-director` (Phase-1-Veto):** **ohne Veto** (2026-07-10); Risiko
      **MITTEL (Verarbeitung) / HOCH (Kompromittierung, A.5.17)** geschärft (7.1);
      Beschäftigtendatenschutz + A-O7-Einbindung (7.2); **fünf rote Linien** (7.3);
      Phase-3-Vorschau (7.4).
- [x] **Roadmap-Fortschreibung** (`production/roadmap.md`, rev. 7): ADR-0002 nach
      „Jetzt: in Arbeit, Phase 2".
- [~] **Übergabe an `technical-director` (Phase 2):** JWT-Guard-Design (Stub-Ersatz),
      **ABAC-Engine-Wahl**, BFF-Token-/Cookie-Detaildesign, **MFA-Enforcement-Flows**,
      Keycloak-Compose + **secret-freier Realm-Export**, authn/authz-`event_typ`-Katalog
      über `/add-audit-event`, TTL-Umsetzung (5/30/480 min) — **unter Beachtung der
      fünf roten Linien (7.3)**. → **Teil B unten (Status `proposed`), Review durch
      `backend-lead` + `security-lead` offen.**
- [ ] **Phase 3 (zwingend vor Impl.):** `compliance-director` + `dsgvo-auditor`
      (**VT-0003**, TOM AuthN/AuthZ, DSFA-0001-TOM-Nachtrag, Betroffenenrechte
      Keycloak-Identitätsdaten, **R-0002-Erweiterung**) + `iso27001-auditor`
      (A.5.15 tw. + A.5.16/17/18/A.8.5 + A.8.2/A.8.3).
- [ ] **Klärungsaufträge (8.2):** konkrete `admin`-Vergabe bei Realm-Einrichtung;
      **A-O7-Mitbestimmung** vor produktiver Beschäftigten-Konten-Nutzung.
- [ ] **Neue Audit-Event-Typen** ausschließlich über `/add-audit-event`
      (kontrolliertes Vokabular, ADR-0003 §13.2).

---

## Anhang A — Anforderungs-Mapping (Scope → Baustein, Phase-1-Skizze)

> Nachweisgrundlage für die Erfolgsmetriken. Verfeinerung = Phase 2.

| Anforderung | Quelle | Baustein / Slot in ADR-0002 |
|-------------|--------|------------------------------|
| AuthZ-Guard auf jeder non-public Route, Default = deny | `backend-nestjs.md` | **JWT-Guard** ersetzt Deny-by-default-Stub (M1) |
| Access-Token nur Memory, Refresh httpOnly via Backend | `frontend-react.md` | **BFF-Token-Endpoints** Login/Refresh/Logout (M3) |
| Anschlussnutzer ≠ Endkunde (Abrechnungsminimum) | DS-07 | **ABAC-Policy-Interface** + Attribute aus ADR-0004 §13.2 (M6) |
| DSB/Auditor ≠ IT-Admin | DS-01 | **RBAC-Rollenmodell** mit Ausschluss (M5) |
| TLS, Login-Versuche limitieren, Login-Sperre, Passwörter nie Klartext | DS-10 | **Keycloak-Realm-as-Code** Härtung (M4) + Frontend-Error-Handling |
| PII-Hosting DE-Only (auch Keycloak) | DS-09 / R-0002 | Keycloak DE-Only platzierbar; Betriebsmodell A6 (Deployment = ADR-0005) |
| `actor_sub` scharf; jede `denied` auditierbar | ADR-0003 §17 | **Erster Audit-Emitter** via `audit.append_event` (M2) |
| ABAC-Steuergrößen (Nutzungsverhältnis, Datenklasse), opake Principal-IDs | ADR-0004 §13.2 | Attribut-Durchleitung in den PDP (M6); `sub` opak, kein Hart-FK |
| Beschäftigtendatenschutz | Art. 88 DSGVO/§26 BDSG | Zweckbindung Sicherheit/Zugriffskontrolle; RVT/TOM Phase 3; A-O7-Mitbestimmung (8.2) |
| MFA-Pflicht für PII-Schreib-/Auditor-Konten; Auth-Geheimnisse schützen | DS-10 / A.5.17 | **MFA-Enforcement v1** (A3, 4.1); secret-freier Realm-Export, Secrets via Env/Vault (rote Linie 4) |

---

# Teil B — Phase-2-Design (Architektur & Technik)

- **Status:** **proposed** (2026-07-10). Design-Owner: `technical-director`.
  **Reviews abgeschlossen (2026-07-10):** `backend-lead` + `security-lead` — beide
  Voten **eingearbeitet** (Änderungsprotokoll §20). **Zwei Architektur-Konflikte
  im Design entschieden** (Freigabe-Bedingung `backend-lead`): **Konflikt A** —
  Guard-Denials erreichen keinen Interceptor → **AuthZ (RBAC+ABAC) wandert aus dem
  Guard in einen `PolicyInterceptor`** (§11/§15); **Konflikt B** — Rollback
  vernichtet die `denied`/`error`-Audit-Zeile → **Savepoint-Kette via `nestjs-cls`
  + `@nestjs-cls/transactional`, `Propagation.NESTED`** (§15). Status bleibt
  `proposed` bis **User-Freigabe**; danach Phase 3 (`compliance-director`), dann
  Impl. Phase 4. **Kein Schreibzugriff** auf `src/`, `migrations/`, `deployment/`,
  `compliance/` in dieser Phase.
- **Bindende Vorgaben:** die **fünf roten Linien (§7.3)**, die **Entscheidungen
  A1–A6 (§8.1)**, `.claude/rules/backend-nestjs.md`, `frontend-react.md`,
  `api-contracts.md`, `dependencies.md` (Lizenz-Whitelist).
- **Neuer Artefakt:** `schemas/openapi/auth.openapi.yaml` (BFF-Contract, proposed).

> Jede D-Entscheidung nennt **Optionen**, **verworfene Alternative** und
> **Lizenz-Check** (Fördervorhaben mit OSS-Publikationspflicht, `dependencies.md`).
> **Keine neue eingebettete Dependency** ohne Whitelist-Konformität; **kein neues
> Drittsystem** (DB/Queue/Cache) — Monolith bleibt Default.

## 11. D1 — JWT-Validierung & Guard (ersetzt den Deny-Stub)

**Problem.** Der globale `DenyByDefaultGuard` (`src/backend/src/common/guards/
deny-by-default.guard.ts`, `APP_GUARD` in `app.module.ts`) lässt nur `@Public()`
durch, prüft aber **kein** Token. Für scharfen `actor_sub` (rote Linie 1) und M1/M5
braucht es echte Keycloak-JWT-Validierung mit Rollen-Extraktion.

**Optionen.**
- **(a) `jose`** (Filip Skokan, **MIT**): zero-dependency, moderner Standard;
  `createRemoteJWKSet(url, { cacheMaxAge, cooldownDuration })` erledigt
  JWKS-Caching **und** `kid`-Rotation ohne App-Cache; `jwtVerify(token, jwks,
  { issuer, audience, algorithms, clockTolerance })` deckt Signatur/iss/aud/exp/nbf
  in einem Aufruf. Eigener, schlanker NestJS-Guard.
- **(b) `passport-jwt` + `jwks-rsa`** (beide **MIT**): etabliert, aber
  Passport-Strategy-Indirektion + **zwei** Libraries + `passport`-Transitivabhängig-
  keiten (größerer SBOM/CycloneDX-Fußabdruck, mehr Lizenz-Oberfläche).

**Entscheidung: (a) `jose`.** Kleinster Fußabdruck (zero-deps → schlanke SBOM,
weniger Lizenz-Oberfläche, `dependencies.md`), integriertes JWKS-Caching +
Rotation, keine Passport-Boilerplate. **Lizenz-Check:** `jose` = **MIT** ✓
(Whitelist). Verworfene Alternative (b) ist lizenzkonform, aber schwerer und
indirekter — **nicht verfolgt**.

**Validierungsumfang (verbindlich).** Signatur (**Algorithmus-Allowlist**
`RS256`/`ES256`, **nie** `none`/HS\* gegen JWKS → alg-confusion-Schutz), **`iss`** =
exakte Realm-Issuer-URL, **`aud`** = erwartete Audience/Client, **`azp`** =
BFF-Client (Keycloak-Eigenheit: Access-Token führt `aud` teils als `account`),
**`exp`**, **`nbf`**, `typ`=Bearer.
**Clock-Skew-Toleranz (entschieden, `security-lead`-Votum 1):** `clockTolerance`
**5 s einheitlich** — **kein** Dev/Prod-Split. Begründung: Uhren-Drift zwischen
Keycloak und Backend ist ein **Zeitsync-Defekt** (NTP), kein Guard-Parameter;
5 s deckt reinen Ausführungs-Jitter und ist konsistent mit dem Audit-±5-s-Fenster
(V0003).

**Guard-Design.** `JwtAuthGuard` ersetzt `DenyByDefaultGuard` **1:1** als
`APP_GUARD`. `@Public()`/`IS_PUBLIC_KEY` bleibt unverändert (zuerst geprüft,
Kurzschluss-Allow — Semantik wie bisher). Ablauf: Bearer aus `Authorization`
extrahieren → `jose.jwtVerify` → bei Fehlen/ungültig **401** (`problem+json`);
bei Erfolg `request.securityContext = { sub, actorTyp, roles, azp }` setzen. **Der
Guard macht ausschließlich AuthN** (401) — **kein** AuthZ (die 403-Entscheidung
liegt im Interceptor-Layer, s. Konflikt A / §15).
**`actorTyp` als expliziter Claim (entschieden, `security-lead`-Votum 2):** **keine**
Heuristik über `sid`/`session_state`. Ein **Protocol-Mapper im Realm-as-Code**
(§14) setzt den Claim **explizit** — `dienstkonto` auf Service-Account-Clients,
`benutzer` auf `edms-bff`. Der Guard validiert **fail-closed gegen das Enum**
(`benutzer`/`dienstkonto`/`system`): fehlt der Claim oder ist er unbekannt →
**401** (kein Default-Fallback). Die **M5-Test-Matrix** wird um diese Enum-
Validierung erweitert.
**Rollen-Extraktion (entschieden, `backend-lead`-Votum 4):** in einem dedizierten
injectable **`RolesMapperService`** (reine Funktion `Claims → AppRole[]`), **nicht**
im Guard/Decorator. Quelle: `realm_access.roles` **+**
`resource_access[<bff-client>].roles` → internes Vokabular
`betrieb`/`compliance-auditor`/`admin`; unbekannte Realm-Rollen werden **verworfen**
(nicht durchgereicht). Der Guard ruft den Mapper auf und legt das Ergebnis in den
`SecurityContext`.

**Autorisierung → Interceptor-Layer (Konflikt A, §15).** AuthN (Guard) und AuthZ
sind **strikt getrennt**: Die **gesamte** Autorisierung — grobgranulare Rollen
(`@Roles(...)`) **und** feingranulares ABAC (PDP-Port, D3) — läuft im
**`PolicyInterceptor`** (§15), damit **jede** `denied`-Entscheidung den
Audit-Interceptor erreicht (M2). Guards laufen vor Interceptors; eine 403 aus
einem Guard würde weder Transaction- noch AuditAction-Interceptor auslösen — der
strukturelle Grund für die Verlagerung. Default bleibt **deny**.

## 12. D2 — BFF-Token-Endpoints & CSRF (Hybrid-Modell A5)

**Problem.** Frontend-Rule verlangt Access-Token **nur im Memory**, Refresh **nur**
im httpOnly-Cookie via Backend; das Backend ist vertraulicher OIDC-Client.
Contract: `schemas/openapi/auth.openapi.yaml`.

**Flow (entschieden).**
- **`GET /auth/login`** (public): PKCE (S256), `state`+`nonce` erzeugen; Transienten
  in **verschlüsseltem, httpOnly, Secure, SameSite=Lax**-Vor-Auth-Cookie
  (`__Host-edms_auth_tx`, kurze TTL) — **Lax nötig**, weil der Keycloak-Rücksprung
  eine Top-Level-Navigation ist (Strict würde den Cookie strippen). 302 zu Keycloak.
- **`GET /auth/callback`** (public): `state` prüfen, Code-Exchange **serverseitig**
  (vertrauliches Client-Secret aus Env/Vault, **nie** im Realm-Export, rote Linie 4),
  ID-Token/`nonce` validieren; Refresh-Token in **`__Host-edms_rt`**
  (httpOnly, Secure, **SameSite=Strict**, Path=/, Max-Age=8 h). **Kein Access-Token
  in der Redirect-URL** (History-/Referer-Leak-Schutz) → 302 in die SPA; die SPA
  bootstrappt den Access-Token direkt über `/auth/refresh`.
  bootstrappt den Access-Token direkt über `/auth/refresh`. **Fester
  SPA-Einstiegspunkt** — **kein** `redirect_uri`-Parameter in v1 (STRIDE-3,
  Open-Redirect-Fläche vermieden; konfigurierbares Ziel später nur mit exakter
  Pfad-Allowlist).
- **`POST /auth/refresh`** (Cookie-basiert): Keycloak `grant_type=refresh_token`,
  **Refresh-Token-Rotation** (neues `__Host-edms_rt`), Access-Token als JSON-Body
  (Memory). Idle-/Absolut-Timeout setzt **Keycloak** durch → 401 → SPA startet Login.
- **`POST /auth/logout`** (idempotent): Cookie löschen + Keycloak-Session beenden
  (RP-initiated/Backchannel, Refresh-Widerruf).
- **`GET /auth/session`** (Bearer): abgeleitete Sitzungssicht für die UI.

**Schicht-Split (entschieden, `backend-lead`-Votum F1).** `AuthController` (dünn) →
`AuthService` (Orchestrierung: PKCE/state/nonce, Cookie-Handling, Audit-Trigger) →
**`KeycloakOidcAdapter`** (Port für Token-Endpoint/JWKS/End-Session — kein direkter
Fremdsystem-Aufruf im Service, `backend-nestjs.md`).

**Decorator-Ausnahme (entschieden, `backend-lead`-Votum F2).** Login/Callback/
Refresh/Logout laufen **nicht** über den `@AuditAction`-Decorator (der nur
HTTP-Fach-Mutationen mit Objektbezug abdeckt), sondern rufen `AuditService.append()`
**direkt** mit **eigener kurzer Tx** auf (dokumentierte Ausnahme, §15).

**Refresh-Rotation-Race paralleler Tabs (entschieden, STRIDE-1).** Primär:
**Frontend-Single-Flight** über die **Web Locks API** serialisiert konkurrierende
Refreshes im selben Browser (ein Inflight-Refresh je Origin). Defense-in-Depth:
Keycloak toleriert **kleinen** `refreshTokenMaxReuse` (Realm-as-Code, §14) für
Netz-Retry-Races — **bewusste, minimale Abschwächung** der Reuse-Detection,
`security-lead`-sichtbar dokumentiert (Reuse-Widerruf bleibt aktiv).

**Cookie-Härtung (entschieden).** `__Host-`-Präfix (erzwingt Secure, Path=/, keine
Domain → kein Subdomain-Cookie-Injection). Trade-off: `__Host-` verlangt Path=/,
der Refresh-Cookie geht also same-origin bei jedem Request mit — akzeptiert, da
httpOnly + SameSite=Strict; stärkerer Injection-Schutz gewichtet höher als
Pfad-Scoping.

**CSRF (entschieden, `security-lead`-Votum 3 — KEIN Double-Submit).**
`SameSite=Strict` (httpOnly-Refresh-Cookie wird bei Cross-Site-POST nicht
mitgesendet) **+ serverseitiger `Origin`-Allowlist-Check** auf `/auth/refresh` und
`/auth/logout` (fehlender/fremder Origin → **403**). Der `Origin`-Header ist
browsergesetzt und per JS nicht fälschbar → deckt Alt-Browser-/Same-Site-Subdomain-
Restrisiken. **Double-Submit-Token wird bewusst NICHT** eingesetzt (SameSite=Strict
+ Origin-Allowlist genügen; weniger State/Angriffsfläche). **Explizite
Voraussetzung (neu dokumentiert):** die **CORS-Konfiguration** für `/auth/refresh`
und `/auth/logout` **spiegelt den Origin NIE mit `Access-Control-Allow-Credentials`
zurück** (keine Origin-Reflexion). **Rate-Limiting** deckt **401 UND 403** auf den
Auth-Pfaden. Der `Origin`-Check ist ein reiner Server-Abgleich und wird **nicht**
als OpenAPI-Request-Parameter modelliert (Widerspruch „required vs. fehlt→403"
aufgelöst, F3).

**TTLs (A4) — Umsetzungsort:** Access **5 min** = Keycloak `accessTokenLifespan=300`;
Idle **30 min** = `ssoSessionIdleTimeout=1800`; absolute Session **8 h** =
`ssoSessionMaxLifespan=28800`. Der BFF **erzwingt nichts eigenständig**, sondern
reicht Keycloak-Ablehnungen als 401 durch (single source of truth = Realm).

**Verworfene Alternative:** **Voller BFF (Session-Cookie only, Token nie im
Browser)** — stärker gehärtet, aber weicht von `frontend-react.md` ab
(bräuchte Rule-Anpassung + `ux-lead`/`security-lead`-Abnahme); bleibt laut A5 als
**spätere Härtungsoption** vorgemerkt. **Lizenz-Check:** OIDC-Code-Exchange mit
`jose` (JWKS/ID-Token) + `openid-client` **oder** direktem `fetch` gegen den
Token-Endpoint — `openid-client` (**MIT**) ✓ optional; v1 kommt mit `jose` +
`fetch` **ohne** zusätzliche Dependency aus (Vorzug).

## 13. D3 — ABAC-Engine (v1-Fundament, DS-07-fähig ohne Umbau)

**Problem.** M6 verlangt einen **unit-testbaren PDP** über die ADR-0004-§13.2-
Attribute (`nutzungsverhaeltnis`, Datenklasse Abrechnungsminimum/Detailverbrauch,
`von_wiss_auswertung_ausgenommen`), auch wenn der **Enforcement-Point (Portal)**
in v1 noch nicht scharf ist (A2). Das Interface muss so geschnitten sein, dass
DS-07 später **ohne Umbau** scharf geht.

**Optionen.**
- **(a) Eigener PDP-Port + in-code Policy-Adapter:** `interface
  PolicyDecisionPoint { evaluate(subject: SecurityContext, action: Action,
  resource: ResourceAttributes): Decision }`. v1-Adapter wertet RBAC + Attribut-
  Prädikate in-code aus. **Keine** neue Dependency.
- **(b) CASL (`@casl/ability`, MIT):** deklarative Abilities mit Bedingungs-
  Matching auf Objekt-Attribute — passt auf ABAC, aber neue eingebettete
  Dependency + eigenes Ability-Modell.
- **(c) OPA/Rego (Apache-2.0):** **externer Dienst** → **neues Drittsystem**
  (harte Regel: ADR + Security-Review), Netz-Hop pro Entscheidung, Betriebslast —
  **überdimensioniert**, solange der Enforcement-Point nicht live ist.

**Entscheidung: (a) eigener PDP-Port + in-code Adapter für v1.** Erfüllt M6
(Interface + Attribut-Durchleitung, unit-testbar) ohne neue Dependency/Drittsystem;
DS-07 geht später scharf, indem der Enforcement-Point **echte** `ResourceAttributes`
liefert — der **PDP-Kontrakt ändert sich nicht** (Ports-&-Adapters). **CASL (MIT)
als dokumentierte, whitelist-konforme Ausbaustufe** vorgemerkt, falls die
Policy-Komplexität wächst. **OPA verworfen** (Drittsystem-Regel).
**Lizenz-Check:** in-code = keine Dependency ✓; CASL = **MIT** ✓ (Reserve);
OPA = **Apache-2.0** (lizenzkonform, aber an der Drittsystem-Regel gescheitert).

**Schnitt (verbindlich).** `SecurityContext` (aus D1: `sub`, `roles`, `actorTyp`),
`Action` (z. B. `read`/`write`), `ResourceAttributes` (`nutzungsverhaeltnis`,
`datenklasse`, `von_wiss_auswertung_ausgenommen`, opake Owner-`sub`). `Decision =
{ effect: 'permit'|'deny', reason: <whitelisted-code> }` — **strukturierter Grund**,
kein Freitext (rote Linie 2, fließt PII-frei in `authz.zugriff.verweigert`).

## 14. D4 — Realm-as-Code (secret-frei, DS-10-gehärtet)

**Struktur.** `deployment/keycloak/realm-edms.json` (Keycloak-Realm-Repräsentation),
im Dev-Compose per **`--import-realm`** aus `/opt/keycloak/data/import` importiert
(Volume-Mount read-only). Ein Export/Re-Import in einen frischen Stack erzeugt
**identische** Konfiguration (M4, idempotent).

**Clients (minimal).** **Ein** vertraulicher Client **`edms-bff`** (Standard-Flow,
Service = NestJS-Backend). Die SPA ist **kein eigener Keycloak-Client** (reines
BFF/Hybrid). Dazu **Service-Account-Clients** je Dienstkonto (Client-Credentials,
Persona C, z. B. `edms-worker-ingest`).
- **PKCE IdP-seitig erzwungen (STRIDE-2):** auf `edms-bff`
  **`pkce.code.challenge.method=S256`** als **Pflicht**-Einstellung im Export (nicht
  nur clientseitig gesendet) → ein Code-Exchange **ohne** PKCE wird von Keycloak
  **abgelehnt**. **Regressionstest**: Exchange ohne PKCE → abgelehnt.
- **`actor_typ`-Protocol-Mapper (security-lead-Votum 2):** je Client ein
  **Hardcoded-Claim-Mapper**, der `actor_typ` **explizit** in Access-Token setzt —
  `benutzer` auf `edms-bff`, `dienstkonto` auf Service-Account-Clients. Der Guard
  validiert fail-closed gegen das Enum (§11).

**DS-10-Härtung im Export (M4, rote Linie 4).**
- `sslRequired: "all"` (TLS-Erzwingung), `registrationAllowed: false`.
- **Brute-Force:** `bruteForceProtected: true` + `failureFactor`,
  `waitIncrementSeconds`, `maxFailureWaitSeconds` (temporäre Login-Sperre).
- **Passwort-Policy:** `length(12)`, Groß-/Klein-/Ziffer-/Sonderzeichen,
  `notUsername`, `passwordHistory(5)`, **Hash `argon2`** (Passwörter nie Klartext).
- **TTLs (A4):** `accessTokenLifespan=300`, `ssoSessionIdleTimeout=1800`,
  `ssoSessionMaxLifespan=28800`.
- **Refresh-Rotation (STRIDE-1):** `revokeRefreshToken=true` (Rotation aktiv) +
  **kleiner** `refreshTokenMaxReuse` (z. B. 1) als Race-Toleranz; Reuse-Widerruf
  bleibt aktiv (Defense-in-Depth zum Frontend-Single-Flight, §12).
- **MFA:** `CONFIGURE_TOTP` als Required-Action **+** Browser-Flow mit
  **erzwungenem** OTP/WebAuthn für `betrieb`/`admin`/`compliance-auditor` (A3);
  Bootstrap-Admin bekommt die dokumentierte, **befristete** Ausnahme (§8.2).
- **DS-01 first-class:** Realm-Rollen `betrieb`/`compliance-auditor`/`admin` als
  **disjunkte** Rollen; `compliance-auditor` **ohne** Admin-/Schreib-Client-Rollen;
  Test-Matrix M5 belegt den Ausschluss.

**SECRET-FREI (rote Linie 4 — korrigiert nach `security-lead`-Votum 5).** Die zuvor
skizzierte `${EDMS_BFF_CLIENT_SECRET}`-Env-Substitution im Realm-JSON ist
**wahrscheinlich falsch**: Keycloaks Property-Substitution/Vault-SPI nutzt
`${vault.<key>}` und **nur** für designierte Secret-Felder — kein generischer
Env-Ersatz für das `secret`-Feld. **Entschieden:** Der **Realm-Import läuft OHNE
echtes Secret** (Dummy-/Platzhalter-Client), danach setzt ein **idempotentes
Bootstrap-Skript** das echte Secret via **Keycloak-Admin-REST-API** aus Env/Vault.
Das Skript **schlägt hart fehl** (kein stiller Leerlauf), wenn das Secret fehlt.
Im Repo liegt damit **kein** Geheimnis; der Export ist deterministisch (M4) und
secret-frei.

**Versionspinning (Lizenz-Check).** Keycloak-Image **gepinnt**, z. B.
`quay.io/keycloak/keycloak:26.0` — **Apache-2.0** ✓. **Vor** dem ersten `pull` den
Tag gegen die aktuelle Release-Liste verifizieren (analog zum Timescale-Pin-
Kommentar in `docker-compose.dev.yml`); Update nur über bewusste Datei-Änderung,
kein `latest`.

**Verworfene Alternative:** **Realm manuell in der Admin-Konsole pflegen** — nicht
reproduzierbar (verletzt M4), driftanfällig, kein Review-Gegenstand.

## 15. D5 — Audit-Emitter (erster echter Emitter, rote Linie 1)

**Service-Mechanik.** `AuditService.append(envelope)` ist der **einzige** App-
Schreibpfad und ruft **genau eine** DB-Funktion (ADR-0003 §17.1-Nachtrag,
V0003 Z. 767–802):

```
SELECT * FROM audit.append_event(
  p_event_typ, p_actor_typ, p_ergebnis,
  p_actor_sub, p_actor_rolle, p_objekt_ref,
  p_kontext, p_korrelations_id, p_event_id, p_format_version);
```

Der Service liefert **nur** die fachliche Payload — **kein** `ts`/`tag_utc`/`seq`/
`prev_hash`/`lane` (Lane/Chunk/Hash/Zeit trägt vollständig die DB; rote Linie 5 ist
strukturell erzwungen, `edms_app` hat kein INSERT-Recht auf `audit.event`).

**Transaktions-Kopplung — `nestjs-cls` + Savepoint-Kette (entschieden, Konflikt A+B,
`backend-lead`-Votum 1).** `audit.append_event` hält den Segment-Lock
(`begin_segment ... FOR UPDATE`) **bis zum Commit der aufrufenden Tx** — es **muss**
dieselbe DB-Tx sein wie die Fachoperation. Der ALS-Eigenbau aus dem ersten Entwurf
wird **verworfen** zugunsten von **`nestjs-cls` + `@nestjs-cls/transactional`
(TypeORM-Adapter)** — beide **MIT** ✓ (Whitelist). Grund ist **Konflikt B**:

> **Konflikt B — Rollback vernichtet die `denied`/`error`-Audit-Zeile.** Naives
> `catchError → append → rethrow` in **einer** Tx würde beim `ROLLBACK` auch die
> Audit-Zeile verwerfen. Es braucht **Savepoint-Semantik**.

**Savepoint-Kette (verbindlich).**
1. **Äußere Tx** (`@Transactional()`, `Propagation.REQUIRED`) am Request-Rand
   (Controller-Handler) — öffnet den CLS-Tx-Scope; **hier** committet am Ende die
   Audit-Zeile.
2. **Fach-Mutationen** laufen in einer **NESTED**-Tx
   (`@Transactional({ propagation: Propagation.NESTED })`) = **SAVEPOINT**. Ein
   Fehler rollt **nur** bis zum Savepoint zurück (`ROLLBACK TO SAVEPOINT`), die
   **äußere** Tx überlebt.
3. Der **`AuditActionInterceptor`** liegt **äußer** zur NESTED-Region: `next.handle()`
   → bei Erfolg `ergebnis='ok'` (Savepoint released); bei Fehler ist der Savepoint
   zurückgerollt → `AuditService.append()` schreibt `denied`/`error` in den **äußeren**
   Scope → **äußere Tx committet** (Audit **persistiert**) → **rethrow** an den
   Exception-Filter (403/500). **Keine Fachschreibung committet ohne Audit; keine
   Audit-Zeile geht durch Rollback verloren.**

**Sonderfall `error` bei bereits abgebrochener DB-Verbindung (fail-closed,
dokumentiert).** Ist der Fehler selbst ein DB-/Verbindungsdefekt, der die **äußere**
Tx vergiftet (PG-`aborted`) oder die Connection physisch tötet, kann **auch** die
Audit-Zeile nicht mehr geschrieben werden → **es committet NICHTS** (weder Fach
noch Audit). Das ist das **korrekte fail-closed-Verhalten** einer Compliance-TOM
(„keine Zustandsänderung ohne Rechenschaft", Art. 5(2)/32) — der Verlust betrifft
**nur** eine ohnehin gescheiterte Operation; der Fehler wird zusätzlich ins
Security-Log geschrieben (redacted).

**Konflikt A — AuthZ in den Interceptor-Layer (entschieden).** Wirft ein AuthZ-Guard
403, laufen weder Transaction- noch AuditAction-Interceptor → M2 wäre strukturell
unerfüllbar. **Optionen:** **(i)** PDP-/Rollen-Evaluation aus dem Guard in einen
**`PolicyInterceptor`** verschieben (in der Kette **innerhalb** von TransactionInterceptor
und **innerhalb** von AuditActionInterceptor; wirft `ForbiddenException` → für dessen
`catchError` sichtbar). **(ii)** Guard bleibt, Guard-Denials bekommen einen **eigenen
kurzen Emit-Pfad** (eigene kurze Tx, analog Login/Logout-Carve-out).
**Entscheidung: (i) `PolicyInterceptor`.** **Begründung:** **eine** Audit-Emit-
Mechanik statt zweier Pfade — Request-Denials und Guard-Denials laufen durch
**dieselbe** `AuditActionInterceptor.catchError`-Logik, teilen `korrelations_id`/Tx/
whitelisted-`kontext` und bleiben damit einheitlich PII-sicher (rote Linie 2).
**Verworfene Alternative (ii):** dupliziert den Emit-Pfad (zwei Stellen, die
`kontext`-Whitelist + `actor_*`-Ableitung korrekt halten müssen), trennt
Guard-`denied` von Request-`denied` und verliert die gemeinsame Tx-/Korrelations-
Klammer — höhere Drift-/Fehlerfläche für ein Compliance-Beweismittel.

**Interceptor-Kette (außen→innen):** `TransactionInterceptor` (öffnet äußere Tx/CLS)
→ `AuditActionInterceptor` (`catchError`/`tap` → Emit im äußeren Scope) →
`PolicyInterceptor` (RBAC `@Roles` + ABAC-PDP; wirft `ForbiddenException` → `denied`)
→ Handler (Fach-Mutationen in **NESTED**-Savepoint). Der **`JwtAuthGuard`** bleibt
ein Guard und macht **nur AuthN** (401, **nicht** auditiert — s. u.); die **AuthZ**
(403, **auditiert**) liegt vollständig im Interceptor-Layer.

**`@AuditAction`-Decorator (Skizze, `backend-lead`-Votum 3).** `@AuditAction({
eventTyp, objektRefSelector, ergebnisMapping, kontextExtractors })` als Methoden-
Decorator (`SetMetadata`) — die Extraktion nutzt **generische, typisierte
Extraktor-Funktionen** (`(args, result, ctx) => value`) statt roher **String-Keys**
(strict-TS-konform, PII-Schutz durch Typisierung + Whitelist). Der globale
`AuditActionInterceptor` baut daraus den **whitelisted** `kontext` (nur
`erlaubte_kontext_keys`, nur Skalare, Größen-Cap) und leitet `actor_*`
**ausschließlich** aus dem validierten `SecurityContext` (D1) ab — **nie** aus
Client-Input (rote Linie 1: **ohne vollständige Token-Validierung KEIN Emit**).
**Dokumentierte GRENZE:** Decorator/Interceptor erfasst **nur HTTP-Pfade** —
**Worker/Cron/interne** Aufrufe (Persona C, ADR-0005 ff.) haben keinen HTTP-Kontext
und **müssen** `AuditService.append()` **explizit** aufrufen (mit eigener Tx-Klammer,
gleiche Savepoint-Regeln).

**Event-Typen v1 (Vorschlag; Anlage via `/add-audit-event`-Migration in Phase 4,
kontrolliertes Vokabular ADR-0003 §13.2).** Namenskonvention `domaene.objekt.verb`
konsistent zum bestehenden Katalog (`aktion_kategorie` u. a. `anmelden`/`melden`):
- `auth.anmeldung.erfolg` (`ok`, `aktion_kategorie=anmelden`) — nach vollständiger
  ID-Token-Validierung im Callback (rote Linie 1).
- `auth.anmeldung.fehlschlag` (`denied`/`error`) — z. B. `state`/`nonce`-Mismatch,
  Code-Exchange-Fehler; **`actor_sub=NULL`, `actor_typ='system'`**, Grund als
  whitelisted `kontext`-Code (kein validierter Prinzipal → keine Akteurs-Zuschreibung).
- `auth.token.erneuert` (`ok`) — Refresh (optional, Datensparsamkeit prüfen).
- `auth.abmeldung.erfolg` (`ok`).
- `authz.zugriff.verweigert` (`denied`, `aktion_kategorie=melden`) — **AuthZ**-Ablehnung
  (403) eines **authentisierten** Prinzipals; opaker `sub` + strukturierter Grund (M2).

**AuthN- vs. AuthZ-Grenze (bestätigt, `security-lead`-Votum 4).** **403** (Token gültig,
Policy verweigert) → **Audit `denied`** (validierter `sub` vorhanden, M2 erfüllt).
**401** (kein/ungültiges Token) ist eine **AuthN**-Ablehnung **ohne** vertrauenswürdigen
Prinzipal → **kein** `audit.event` (strukturell durch **rote Linie 1** erzwungen:
ohne validierte Identität keine Akteurs-Zuschreibung), sondern ein **strukturiertes
Security-Log** (pino): **Route, `ts`, Grund-Code**, ggf. **IP-Hash** — **NIE**
Rohtoken/Claims aus einem **nicht** validierten Token (rote Linie 2 gilt auch für
Logs). Rate-Limiting deckt **401 und 403** (§12). Das vermeidet unauthentisierte
Audit-Verstärkung/DoS.

## 16. D6 — Dev-Compose (Keycloak) & Frontend-Login-Flow

**Compose (Design, Umsetzung Phase 4 in `deployment/docker/docker-compose.dev.yml`).**
Keycloak-Service, gepinnt (`quay.io/keycloak/keycloak:26.0`, Apache-2.0), **Dev-Modus**
`start-dev --import-realm` (H2/dev-file, keine separate Keycloak-DB im Dev nötig).
**DE-Only ist eine Prod-Hosting-Auflage (DS-09), im Dev irrelevant** (synthetische
Daten). **Healthcheck** gegen den Management-Health-Endpoint (Keycloak 26:
`:9000/health/ready`). **Realm-Auto-Import** per Volume
`./deployment/keycloak:/opt/keycloak/data/import:ro`. Bootstrap-Admin + Client-
Secrets als **Env-Platzhalter** (Dev-Defaults, nie Prod). Der Backend-Service
`depends_on` Keycloak (healthy).

**Frontend-Login-Flow (Hybrid, Skizze).** Geschützte SPA-Route ohne Memory-Access-
Token → `POST /auth/refresh`; **401** → Browser-Redirect auf `GET /auth/login` →
Keycloak-Login **+ MFA** → `GET /auth/callback` (setzt Refresh-Cookie, 302 in die
SPA) → SPA `POST /auth/refresh` → Access-Token **im Memory** → TanStack-Query hängt
`Authorization: Bearer` an; **401 mitten in der Session** → stiller `/auth/refresh`;
scheitert der Refresh → zurück zum Login. Logout → `POST /auth/logout`. **Kein**
Token in `localStorage`/`sessionStorage` (M3, `frontend-react.md`).

## 17. Phase-2-Gates & Breaking Changes

**Review-ready.** `schemas/openapi/auth.openapi.yaml` (proposed) + dieser Teil B.
**Reviews `backend-lead` + `security-lead` abgeschlossen und eingearbeitet**
(Änderungsprotokoll §20); die **zwei Architektur-Konflikte (A: PolicyInterceptor;
B: Savepoint-Kette) sind im Design entschieden** — `backend-lead`-Freigabe-Bedingung
erfüllt. **Nächstes Gate: User-Freigabe** (offene Punkte §19). **Danach Phase 3**
(`compliance-director`/Auditoren, §7.4) **vor** jeder Implementation.

**Breaking Change (dokumentiert, Greenfield = akzeptabel).** Der **Guard-Swap**
(`DenyByDefaultGuard` → `JwtAuthGuard` als `APP_GUARD`) ändert das Laufzeitverhalten
**jeder künftigen non-`@Public()`-Route**: statt „Stub verweigert alles außer public"
gilt „Token-Validierung; ohne/ungültig → **401**, gültig aber nicht autorisiert →
**403**". Da bisher **nur** `/health`+`/health/ready` (public) existieren, ist der
Bruch **folgenlos** und **jetzt** der richtige Zeitpunkt. **`@Public()`-Semantik
bleibt** unverändert. **CI-Anpassung:** der M1-Contract-Test wird von „403 für alles"
auf die 401/403-Differenzierung umgestellt (Aufruf ohne / mit ungültigem /
abgelaufenem Token; `@Public` bleibt offen).

**DSGVO-Feld-Markierung (rote Linie 2, Aufgabe 8).**
- **Refresh-Cookie (`__Host-edms_rt`)** = **Authentifizierungsgeheimnis** (A.5.17);
  httpOnly (kein JS-Zugriff, M3), **nie** im Body/Log (pino-redact-Whitelist).
- **Vor-Auth-Cookie (`__Host-edms_auth_tx`)** = PKCE/state/nonce-Transienten,
  verschlüsselt, httpOnly, kurzlebig; kein Log.
- **`AccessTokenResponse.accessToken`** = kurzlebiges JWT, **nur SPA-Memory**.
- **`SessionInfo.sub`/`roles`/`actorTyp`** = personenbeziehbar **pseudonym**
  (ErwGr. 26, `pii=false`); Zweckbindung Sicherheit/Zugriffskontrolle (Art. 32/88
  DSGVO, § 26 BDSG), **nicht** Leistungs-/Verhaltenskontrolle. **Keine Klartext-PII**
  im Contract; optionaler `name` (Beschäftigtendatum) nur bei Realm-Freigabe
  (Datensparsamkeit Art. 5(1)(c)).
- **Audit-`kontext`** (Auth-Events) = **whitelisted Skalare**, opaker `sub`, kein
  Freitext (rote Linie 2).

## 18. Konsequenzen (Teil B)

**Positiv.** Deny-by-default wird **real** (M1); `actor_sub` scharf ab dem ersten
Emitter (M2); kleinste Dependency-Oberfläche (`jose` MIT, kein Drittsystem);
DS-07-fähiger PDP-Port ohne Umbau (M6); reproduzierbarer, secret-freier Realm (M4).

**Negativ.** Guard-Swap ist ein (folgenloser) Verhaltensbruch; die
`nestjs-cls`-Savepoint-Kette (NESTED-Propagation, Interceptor-Reihenfolge) ist
zusätzliche Infrastruktur mit hoher Testlast (Konflikt-B-Regressionstest zwingend:
`denied`/`error` überlebt den Fach-Rollback); CSRF/Cookie/PKCE/Single-Flight-Flows
erhöhen die anfängliche Integrations-/Testlast; MFA-Enrollment + Secret-Bootstrap-
Skript im Realm.

**Neutral.** Legt Bibliotheks-/Cookie-/Event-Vokabular fest, an das sich Folge-
Services binden.

## 19. Offene Punkte (konsolidiert, für User-Freigabe)

Alle Lead-Review-Punkte sind **entschieden und eingearbeitet** (§20). Für die
**User-Freigabe** verbleiben nur noch Bestätigungen bzw. Klärungen **außerhalb** des
reinen Technik-Designs:

- **Bestätigung des Designs (User):** Übernahme der beiden Konflikt-Entscheidungen
  (A: `PolicyInterceptor`; B: `nestjs-cls`-Savepoint-Kette) und der Bibliothekswahl
  (`jose`, `nestjs-cls`/`@nestjs-cls/transactional` — alle **MIT**, Whitelist ✓);
  **kein neues Drittsystem** (keine DB/Queue/Cache), Monolith bleibt.
- **Konkrete `admin`-Vergabe** bei der Realm-Einrichtung (§8.2) + **befristete
  MFA-Bootstrap-Ausnahme** (Frist vor Produktivzugriff festlegen).
- **A-O7-Mitbestimmung** (Betriebs-/Personalrat) **vor** produktiver Nutzung von
  Beschäftigten-Konten (§7.2/§8.2) — organisatorisch, `compliance-director`.
- **Phase 3 (zwingend vor Impl.):** `event_typ`-Endnamen +
  `aktion_kategorie`/`rolle_erfassen` je Auth-Event über `/add-audit-event`
  (kontrolliertes Vokabular); VT-0003, TOM AuthN/AuthZ, DSFA-0001-Nachtrag,
  R-0002-Erweiterung, SoA-Controls (§7.4).
- **Phase-4-Verifikationen** (dokumentiert, kein Design-Blocker): exakter
  Keycloak-`quay.io/keycloak/keycloak`-Tag vor Pull (§14); `${vault.<key>}`-Verhalten
  bzw. Admin-REST-Bootstrap gegen die gepinnte Keycloak-Version verifizieren;
  Health-Endpoint-Pfad der gepinnten Version.

## 20. Änderungsprotokoll (Review-Einarbeitung, 2026-07-10)

**Zwei Architektur-Konflikte entschieden (Freigabe-Bedingung `backend-lead`):**
- **Konflikt A** — AuthZ (RBAC `@Roles` + ABAC-PDP) aus dem Guard in den
  **`PolicyInterceptor`** verschoben, damit `denied` den Audit-Interceptor erreicht
  (M2). Verworfen: eigener kurzer Guard-Emit-Pfad (Emit-Dopplung). (§11, §15)
- **Konflikt B** — **Savepoint-Kette** via `nestjs-cls` + `@nestjs-cls/transactional`
  (`Propagation.NESTED`): Fach-Rollback zum Savepoint, Audit-Zeile im äußeren Scope
  committen; **Sonderfall** `error` bei toter DB-Verbindung als fail-closed benannt.
  ALS-Eigenbau verworfen. (§15)

**`backend-lead`-Voten:** 3 typisierte Kontext-Extraktoren statt String-Keys +
HTTP-Only-Grenze (Worker/Cron → expliziter `append()`); 4 `RolesMapperService`;
F1 Schicht-Split `AuthController`→`AuthService`→`KeycloakOidcAdapter`; F2 Auth-
Endpoints als Decorator-Ausnahme (direkter `append` mit kurzer Tx). (§11, §12, §15)

**`security-lead`-Voten:** 1 Clock-Skew **5 s einheitlich**; 2 `actor_typ` als
**expliziter Protocol-Mapper-Claim** + fail-closed-Enum (fehlt/unbekannt → 401),
M5-Matrix erweitert; 3 CSRF **SameSite=Strict + Origin-Allowlist, KEIN
Double-Submit** + **CORS-Sperre** (keine Origin-Reflexion mit Credentials) +
Rate-Limiting 401/403; 4 401-Security-Log **strukturiert** (Route/ts/Grund-Code/
IP-Hash), nie Rohtoken/Claims; 5 Realm-**Secret nie im Export** → **Dummy-Import +
idempotentes Admin-REST-Bootstrap** (hart fehlschlagend). (§11, §12, §14, §15)

**STRIDE:** 1 Refresh-Race → **Frontend-Single-Flight (Web Locks)** + kleiner
`refreshTokenMaxReuse`; 2 **PKCE S256 IdP-seitig erzwungen** auf `edms-bff` +
Regressionstest; 3 **`redirect_uri` gestrichen** (fester SPA-Einstiegspunkt).
(§12, §14; OpenAPI nachgezogen)
