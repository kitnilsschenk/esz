# tools/keycloak — Keycloak Bootstrap-Tooling

Bezug: `docs/adr/ADR-0002-auth-modul.md` §14 (D4 Realm-as-Code, rote Linie 4),
`deployment/keycloak/README.md` (Realm-Rationale).

## `bootstrap-secret.sh`

Setzt/rotiert das `edms-bff`-Client-Secret **idempotent** via
Keycloak-Admin-REST-API, **nachdem** der secret-freie Realm-Export
(`deployment/keycloak/realm-edms.json`) importiert wurde. Grund: Keycloaks
Property-/Vault-Substitution (`${vault.<key>}`) gilt nur für designierte
Secret-Felder und ist **kein** generischer Env-Ersatz im Realm-JSON — ein
`${ENV_VAR}`-Platzhalter direkt im versionierten Export würde als **Literal-
String** importiert, nicht aufgelöst (ADR-0002 §14, korrigiert nach
`security-lead`-Votum 5).

### Ablauf

1. Wartet auf `${KEYCLOAK_MANAGEMENT_URL}/health/ready` (Timeout
   konfigurierbar, Default 90 s).
2. Holt ein Admin-Token aus dem `master`-Realm (`admin-cli`,
   Password-Grant mit `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD`).
3. Sucht den Client `edms-bff` im Ziel-Realm (`edms`).
4. Liest die **vollständige** Client-Repräsentation, setzt `secret` auf
   `${EDMS_BFF_CLIENT_SECRET}`, schreibt sie per `PUT` zurück (die
   `POST .../client-secret`-Regenerierungs-Route liefert **nur** ein
   zufälliges Secret, kein `PUT`-fähiges Custom-Secret — deshalb der
   Read-Modify-Write-Umweg über die volle Repräsentation).
5. Verifiziert das gesetzte Secret per `GET .../client-secret`.

**Jeder Schritt bricht hart ab** (`set -euo pipefail` + explizite
`fail()`-Aufrufe) — kein stiller Leerlauf, keine stillschweigend
übersprungene Rotation.

### Voraussetzungen

- `curl`, `jq` (beide müssen im PATH sein — das Skript prüft das explizit).
- Laufender, gesunder Keycloak-Container mit bereits importiertem
  `edms`-Realm (`docker compose -f deployment/docker/docker-compose.dev.yml
  up -d keycloak`).

### Verwendung

```bash
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
EDMS_BFF_CLIENT_SECRET=changeme_local_dev_only_bff_secret \
./tools/keycloak/bootstrap-secret.sh
```

Alle Variablen sind in `.env.example` (Repo-Root) dokumentiert. Bei
abweichenden Ports (z. B. weil `KEYCLOAK_PORT`/`KEYCLOAK_MANAGEMENT_PORT`
lokal umgelegt wurden, um Portkonflikte zu vermeiden) zusätzlich
`KEYCLOAK_URL`/`KEYCLOAK_MANAGEMENT_URL` setzen.

### Idempotenz

Mehrfacher Aufruf mit demselben `EDMS_BFF_CLIENT_SECRET` ist ein No-Op im
Ergebnis (derselbe Wert wird erneut geschrieben). Ein **Rotations**-Lauf mit
einem **neuen** Wert überschreibt das bisherige Secret sofort — das
NestJS-Backend (BFF) muss dann mit dem neuen Wert neu gestartet werden.

### Erweiterung auf weitere Dienstkonten-Clients

`edms-worker` (Service-Account-Template, siehe
`deployment/keycloak/realm-edms.json`) hat aktuell **keinen** Konsumenten
und wird von diesem Skript bewusst **nicht** mitbehandelt. Sobald ein
konkreter Worker (z. B. `edms-worker-ingest`) produktiv wird, eine analoge
Skript-Instanz mit eigenem `client_id`/Secret-Env-Namen ergänzen — **nicht**
dieses Skript stillschweigend auf mehrere Clients erweitern (Klarheit über
„welches Secret wird gerade rotiert" bleibt sonst nicht nachvollziehbar).

## `dev-unlock-users.sh` (nur lokaler Dev-Stack)

Entfernt die Login-Pflichtaktionen (`CONFIGURE_TOTP`, `UPDATE_PASSWORD`) der
Dev-Nutzer `dev-betrieb-01`/`dev-auditor-01`/`dev-admin-01` in der **laufenden**
Keycloak-Instanz, damit der App-Login mit reinem Passwort (`DevOnly-Dummy-2026!`)
funktioniert — ohne TOTP-Enrollment und ohne erzwungene Passwortänderung.

**Warum nötig:** Der Realm-Export erzwingt bei den Dev-Nutzern bewusst TOTP+
Passwortänderung (MFA-Test-Absicht, `deployment/keycloak/README.md`), und der
Dev-Stack hat **kein Keycloak-Volume** — jeder Container-Neustart importiert den
Realm frisch und setzt die Pflichtaktionen (und alle in einer Vorsession
gesetzten Passwörter/TOTP-Secrets) zurück. Dieses Skript stellt danach den
bequemen Passwort-Login wieder her, **ohne** die versionierte MFA-Absicht im
Realm-JSON zu verändern (es ändert nur die laufende Instanz).

```bash
KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
  ./tools/keycloak/dev-unlock-users.sh
```

**Nur lokal.** Das Skript schwächt MFA ab und bricht mit einer Fehlermeldung ab,
wenn `KEYCLOAK_URL` nicht auf `localhost`/Loopback zeigt (Übersteuerung nur mit
`DEV_UNLOCK_ALLOW_NONLOCAL=1`, auf eigene Verantwortung). Idempotent
(mehrfacher Aufruf ist folgenlos); Nutzerliste über `DEV_UNLOCK_USERS`
anpassbar. Voraussetzungen wie `bootstrap-secret.sh`: `curl`, `jq`, laufender
Keycloak mit importiertem `edms`-Realm.
