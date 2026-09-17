# EDMS Keycloak Realm-as-Code (`realm-edms.json`)

Bezug: `docs/adr/ADR-0002-auth-modul.md` Teil B, insbesondere §11 (D1 JWT/
`actor_typ`), §12 (D2 BFF-Endpoints/TTLs), §14 (D4 Realm-as-Code), §7.3
(fünf rote Linien). Arbeitspaket **AP-A** (Phase 4, Fundament für AP-B…F).

## Was hier liegt — und was nicht

`realm-edms.json` ist die **einzige Quelle der Wahrheit** für die Keycloak-
Realm-Konfiguration (M4: reproduzierbar, deterministisch). Es enthält **kein**
einziges echtes Geheimnis (rote Linie 4) — weder Client-Secrets noch
Produktiv-Passwörter. Was **nicht** hier liegt:

- **Client-Secrets** — werden für `edms-bff` erst nach dem Import durch
  `tools/keycloak/bootstrap-secret.sh` via Admin-REST-API gesetzt (siehe dort).
  Der Import selbst lässt Keycloak für `edms-bff` und `edms-worker` ein
  **zufälliges Platzhalter-Secret generieren** (kein `secret`-Feld im JSON —
  bewusst weggelassen, nicht leer gesetzt).
- **Produktiv-Nutzerkonten** — die drei `dev-*-01`-Nutzer sind **synthetische,
  klar als Dev-Only markierte Dummy-Konten** für die M5-Test-Matrix
  (Rolle × Route). Kein Bezug zu echten Personen. Passwörter sind
  Wegwerf-Platzhalter (`temporary: true` erzwingt Passwortänderung beim
  ersten Login) und dürfen **nie** außerhalb eines lokalen, ephemeren
  Dev-Stacks verwendet werden.

## Entscheidungen mit Begründung

### `sslRequired: "external"` statt `"all"` (Dev-Abweichung, dokumentiert)

Der Task-Auftrag verlangt für Prod `"all"` (volle TLS-Erzwingung, DS-10).
Im lokalen Dev-Compose läuft Keycloak jedoch bewusst über **Klartext-HTTP auf
`localhost`** (kein TLS-Terminierung im Dev-Stack) — mit `sslRequired: "all"`
würde **jeder** Login/Token-Request (inkl. `localhost`-Zugriffe) von Keycloak
abgelehnt. `"external"` (= Keycloaks eigener Realm-Default, empirisch gegen
die gepinnte Version verifiziert) verlangt TLS nur für Zugriffe, die **nicht**
aus einem privaten/Loopback-Netz kommen, und lässt den Dev-Workflow auf
`http://localhost` funktionieren.

**Verbindliche Prod-Auflage:** Der **Prod-Realm-Export** (K8s-Deployment,
späterer AP, ADR-0002 §5.2 A6) **muss** `sslRequired: "all"` setzen, sobald
TLS-Terminierung vor Keycloak steht. Diese Datei ist **Dev-spezifisch** und
darf **nicht** unverändert nach Prod übernommen werden — ein separates
Prod-Overlay/-Realm-Export ist vorzusehen (Delegation an Terraform/K8s-
Spezialisten, noch nicht definiert, siehe Eskalation an `technical-director`).

### Passwort-Hashing: `hashAlgorithm(argon2)` — empirisch verifiziert

Argon2 ist ab Keycloak-Core (non-FIPS-Build) **eingebaut** — keine
zusätzliche Provider-JAR nötig (verifiziert gegen die Keycloak-Doku für die
gepinnte Version 26.7.0: „argon2 (default for non-FIPS deployments)“).
Gegen den real gestarteten, gepinnten Container getestet: ein mit dieser
Policy angelegter Nutzer erhält ein `credentialData` mit
`"algorithm":"argon2"` (memory 7168, parallelism 1, hashIterations 5 —
Keycloak-Provider-Defaults). Damit ist die im Auftrag geforderte
„`hashAlgorithm: argon2` falls in v26 konfigurierbar“-Frage **positiv
beantwortet und verifiziert**, kein Dokumentations-Ersatz nötig.

### `refreshTokenMaxReuse: 1` (klein, nicht 0)

ADR-0002 §12 (STRIDE-1): Das Frontend serialisiert Refreshes primär über die
Web-Locks-API (Single-Flight). `refreshTokenMaxReuse: 1` toleriert **genau
eine** zusätzliche Wiederverwendung als Defense-in-Depth gegen Netz-Retry-
Races zwischen parallelen Tabs — die Reuse-**Erkennung und der Widerruf**
bleiben aktiv (`revokeRefreshToken: true`), nur die Grenze ist nicht `0`
(0 wäre die schärfste Einstellung, hätte aber ein höheres Risiko, legitime
Netz-Retries fälschlich als Session-Kompromittierung zu werten und die ganze
Refresh-Token-Familie zu widerrufen). Bewusste, minimale, dokumentierte
Abschwächung — genau wie im ADR gefordert.

### MFA: `CONFIGURE_TOTP` als **realm-weite Default-Required-Action**

Statt eines eigenen, hand-geschriebenen Browser-Flow-Overrides (fragil,
versionsabhängige Execution-IDs) wird `CONFIGURE_TOTP` als
`defaultAction: true` in der `requiredActions`-Liste geführt — **jeder neue
Nutzer** in diesem Realm muss TOTP beim ersten Login einrichten. Da der
v1-Realm **ausschließlich** die drei MFA-pflichtigen Rollen kennt
(`betrieb`/`admin`/`compliance-auditor` — A3), deckt das exakt die
ADR-Anforderung ab, ohne eine bedingte Rollen-Flow-Logik zu benötigen.
Zusätzlich tragen die drei Dev-Nutzer `CONFIGURE_TOTP` explizit in ihrem
eigenen `requiredActions`-Feld (robust gegen Importsemantik-Unschärfen bei
`defaultAction` für importierte vs. neu registrierte Nutzer).

**Offener Punkt für später (kein v1-Blocker, ADR §19 „Enforcement-Doku“):**
Sobald ein Realm/Client mit **nicht-MFA-pflichtigen** Rollen hinzukommt (z. B.
Endkunden-Portal, ADR-0004 §8.2, explizit Out-of-Scope v1), braucht es einen
**bedingten Browser-Flow** (Conditional-Role-Execution), der TOTP nur für
`betrieb`/`admin`/`compliance-auditor` erzwingt. Das ist **nicht** Teil von
AP-A und liegt bei `security-lead`/`backend-lead`, wenn das Portal-ADR kommt.

**Bootstrap-Admin-MFA-Ausnahme (ADR §8.2):** bezieht sich auf den
**Keycloak-Superadmin** (`KC_BOOTSTRAP_ADMIN_USERNAME`, Master-Realm,
Compose-Ebene) — **nicht** auf `dev-admin-01` (das ist ein normaler
`admin`-Realm-Rollen-Nutzer im `edms`-Realm und unterliegt der vollen
MFA-Pflicht wie die anderen beiden Dev-Nutzer).

### Secret-freie Clients (`edms-bff`, `edms-worker`)

Beide Clients haben **kein** `secret`-Feld im JSON. Keycloak generiert beim
Import automatisch ein zufälliges Platzhalter-Secret (empirisch verifiziert
gegen die gepinnte Version) — dieses landet **nie** im Repo. Für `edms-bff`
überschreibt `tools/keycloak/bootstrap-secret.sh` das generierte Secret
danach deterministisch mit dem Wert aus `${EDMS_BFF_CLIENT_SECRET}`
(Env/Vault). Für `edms-worker` gibt es aktuell **keinen** Konsumenten (Persona
C, „für spätere Dienste“) — das generierte Platzhalter-Secret bleibt bis zum
ersten echten Verbraucher unbenutzt; **vor** produktivem Einsatz muss das
gleiche Bootstrap-Muster (Rotation via Admin-REST aus Env/Vault) für den
jeweiligen konkreten Worker-Client ergänzt werden.

### `actor_typ`-Protocol-Mapper — empirisch verifiziert

Gegen den real gestarteten, gepinnten Container getestet: ein
Client-Credentials-Token für `edms-worker` enthält im Access-Token exakt
`"actor_typ": "dienstkonto"` (Hardcoded-Claim-Mapper,
`oidc-hardcoded-claim-mapper`). Für `edms-bff` ist der Wert `benutzer`
(nicht separat end-to-end getestet, da dafür ein vollständiger
Browser-Login inkl. MFA-Enrollment nötig wäre — Konfiguration ist strukturell
identisch zum verifizierten `edms-worker`-Mapper).

### PKCE-S256-Erzwingung — empirisch verifiziert

Ein Autorisierungsanfrage an `edms-bff` **ohne** `code_challenge_method` wird
von der gepinnten Keycloak-Version mit `error=invalid_request&
error_description=Missing+parameter:+code_challenge_method` abgelehnt
(Redirect zur `redirect_uri`, kein Login-Formular). Der geforderte
Regressionstest „Exchange ohne PKCE → abgelehnt" (ADR §14) ist damit gegen
die reale Version bestätigt, nicht nur als Konfigurationsabsicht dokumentiert.

### DS-01 — empirisch verifiziert

`betrieb`, `compliance-auditor`, `admin` wurden nach Import als **einzelne,
nicht-composite** Realm-Rollen bestätigt (`composite: false` bei allen drei);
kein Rollen-Bündel vermischt Auditor- und Admin-Rechte. Das automatisch von
Keycloak angelegte `default-roles-edms`-Composite (Standard-Session-Rollen
wie `offline_access`/`uma_authorization`) ist **kein** Privilegien-Bündel im
Sinne von DS-01 und bleibt unangetastet.

## Import-Mechanik

`docker-compose.dev.yml` mountet dieses Verzeichnis **read-only** nach
`/opt/keycloak/data/import` und startet Keycloak mit `--import-realm`.
Keycloak importiert beim **ersten** Start (leere `dev-file`/H2-Datenbank)
automatisch jede JSON-Datei in diesem Ordner. Bei einem bereits bestehenden
Realm gleichen Namens wird **nicht** erneut importiert (Keycloak-Verhalten) —
für einen sauberen Re-Import den Stack mit `docker compose down -v`
zurücksetzen (kein Volume für Keycloak-Daten vorgesehen, s. u.).

## Bewusst keine Persistenz im Dev-Stack

Es gibt **kein** benanntes Docker-Volume für Keycloaks `dev-file`
(H2-Datenbank). Jeder Container-Neustart mit frischem Container (kein
wiederverwendetes anonymes Volume) importiert den Realm **neu** aus dieser
Datei — das ist genau der M4-Nachweis („Re-Import in frischen Dev-Compose
erzeugt identische Konfiguration“). Persistenz ist im Dev-Kontext nicht
gefordert (DE-Only/DS-09 ist eine **Prod**-Hosting-Auflage, ADR-0002 §7.1/
§16 — im Dev mit synthetischen Daten irrelevant).

## Lokaler App-Login — Dev-Zugangsdaten (synthetisch, nur Dev)

Die drei Dev-Nutzer im `edms`-Realm sind **synthetische Wegwerf-Konten** (kein
Bezug zu echten Personen) für die M5-Rolle×Route-Matrix. Alle haben dasselbe
Export-Passwort **`DevOnly-Dummy-2026!`**:

| Benutzername      | Realm-Rolle          | Sieht in der Betriebs-UI |
|-------------------|----------------------|--------------------------|
| `dev-betrieb-01`  | `betrieb`            | volle Stammdaten-UI, **PII unmaskiert** |
| `dev-auditor-01`  | `compliance-auditor` | Stammdaten **read-only, PII maskiert** (`•••`) |
| `dev-admin-01`    | `admin`              | **kein** Stammdaten-Zugriff → **403** (Absicht, DS-01: `admin` ≠ Fach-Rolle) |
> **`dev-admin-01` ist bewusst kein Stammdaten-Nutzer.** Die Rolle `admin` ist
> per ABAC von den Fach-Routen ausgeschlossen; nach dem Login erscheint die
> App-Shell, aber Endkunden/Systeme/… liefern 403. Zum Durchklicken der UI
> `dev-betrieb-01` verwenden, für die PII-Maskierung `dev-auditor-01`.

**Frontend-Login:** Vite-Dev-Server (`http://localhost:5180` bzw. der lokal
gewählte Port) → „Anmelden" → Keycloak-Login mit obigen Daten.

**Erzwungenes TOTP/Passwortänderung beim ersten Login (und Reset).** Der Export
trägt bei jedem Dev-Nutzer `CONFIGURE_TOTP` + `UPDATE_PASSWORD` als
`requiredActions` (MFA-Test-Absicht, s. o.). Beim **ersten** Login erzwingt
Keycloak daher TOTP-Enrollment + Passwortänderung. Weil der Dev-Stack **kein
Keycloak-Volume** hat (s. voriger Abschnitt), gehen diese Änderungen bei jedem
Container-Neustart verloren — die Nutzer stehen dann wieder auf `DevOnly-Dummy-
2026!` **mit** erneut gesetzten Pflichtaktionen.

**Bequemer Passwort-Login ohne TOTP** (nur lokaler Dev-Stack): nach dem
Hochfahren `tools/keycloak/dev-unlock-users.sh` ausführen — es leert die
`requiredActions` der Dev-Nutzer in der **laufenden** Instanz (ändert **nicht**
diesen Realm-Export, die MFA-Absicht bleibt versioniert erhalten):

```bash
KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
  ./tools/keycloak/dev-unlock-users.sh
```

**Keycloak-Admin-Konsole** (etwas anderes als der App-Login): der
Master-Realm-Superadmin unter `http://localhost:8080/admin` ist
`admin` / `changeme_local_dev_only` (Compose-Default `KC_BOOTSTRAP_ADMIN_*`,
s. `.env.example`).

## Verifikations-Protokoll (2026-07-13, gegen die gepinnte Version)

Alle oben referenzierten „empirisch verifiziert“-Aussagen wurden gegen einen
lokal gestarteten, isolierten `quay.io/keycloak/keycloak:26.7.0`-Container
(eigene Ports, kein Konflikt mit anderen Diensten, danach vollständig
entfernt) geprüft: Health-Endpoint, vollständiger Realm-Import via
Admin-REST (identischer Codepfad zu `--import-realm`), Rollen-/Client-/
Mapper-Struktur, Passwort-Hash-Algorithmus, PKCE-Ablehnung ohne
`code_challenge`, `.well-known/openid-configuration`. Siehe finale
Task-Antwort für die Zusammenfassung.
