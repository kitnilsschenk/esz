#!/usr/bin/env bash
#
# dev-up.sh — bringt den lokalen EDMS-Dev-Stack reproduzierbar hoch.
#
# WARUM DIESES SKRIPT
# Der Dev-Stack hat zwei Nachlauf-Schritte, die NACH jedem Keycloak-Neustart
# nötig sind und leicht vergessen werden:
#   1. `bootstrap-secret.sh`  — setzt das BFF-Client-Secret aus der .env in
#      Keycloak (die Realm-Datei pinnt bewusst KEIN Secret, damit keine
#      Credential im veröffentlichten Repo landet, siehe
#      deployment/keycloak/README.md „Secret-freie Clients"). Ohne diesen
#      Schritt schlägt der App-Login mit „Invalid client credentials" fehl.
#   2. `dev-unlock-users.sh`  — entfernt die realm-weite CONFIGURE_TOTP-
#      Required-Action von den Dev-Nutzern (Keycloak hat im Dev bewusst kein
#      Volume, re-importiert also den Realm bei jedem Neustart).
# Dieses Skript bündelt beide plus Compose-Up und Migrationen, damit der
# Stack mit EINEM Kommando reproduzierbar bereitsteht — credential-frei.
#
# Idempotent: mehrfaches Ausführen ist unschädlich (Migrationen/Secret/
# Unlock sind alle idempotent).
#
# NUR DEV. Produktion nutzt echte Secrets aus Vault/Env und einen anderen
# Deploy-Pfad (Kubernetes/OpenTofu).

set -euo pipefail

REPO_WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_WURZEL}"
COMPOSE="deployment/docker/docker-compose.dev.yml"

if [[ ! -f .env ]]; then
  echo "FEHLER: .env fehlt. Nach dem Muster von .env.example anlegen." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a && source .env && set +a

echo "==> 1/6  Mosquitto-Passwortdatei sicherstellen (gitignored)..."
if [[ ! -f deployment/mosquitto/passwd ]]; then
  ./deployment/mosquitto/erzeuge-passwd.sh
else
  echo "    vorhanden."
fi

echo "==> 2/6  Docker-Stack hochfahren (Postgres, Keycloak, Mosquitto)..."
docker compose -f "${COMPOSE}" up -d

echo "==> 3/6  Warte auf Postgres-Health..."
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' edms-dev-postgres-1 2>/dev/null || echo none)"
  [[ "${status}" == "healthy" ]] && break
  sleep 2
done
[[ "${status:-}" == "healthy" ]] || { echo "FEHLER: Postgres nicht healthy geworden." >&2; exit 1; }
echo "    Postgres healthy."

echo "==> 4/6  Migrationen anwenden..."
node tools/migrate/dist/cli.js up

echo "==> 5/6  Login-Rolle des Ingest-Workers (ADR-0011 C3)..."
# Die Gruppenrolle `edms_ingest_worker` kommt aus V0010; die LOGIN-Rolle kann
# dort nicht entstehen, weil sie ein Passwort braucht und Passwoerter nicht in
# ein veroeffentlichtes Repository gehoeren. Ohne diesen Schritt scheitert der
# Worker mit `role "edms_ingest_worker_login" does not exist`.
if [ -n "${EDMS_INGEST_WORKER_PASSWORD:-}" ]; then
  bash tools/db/dev-ingest-worker-login.sh
else
  echo "    UEBERSPRUNGEN: EDMS_INGEST_WORKER_PASSWORD nicht gesetzt."
  echo "    Der Ingest-Worker kann sich ohne diese Rolle NICHT verbinden."
  echo "    Setzen und erneut ausfuehren, oder von Hand:"
  echo "      EDMS_INGEST_WORKER_PASSWORD=... ./tools/db/dev-ingest-worker-login.sh"
fi

echo "==> 6/6  Keycloak-Nachlauf (BFF-Secret + Dev-Nutzer entsperren)..."
# bootstrap-secret.sh wartet selbst auf Keycloak-Health.
bash tools/keycloak/bootstrap-secret.sh
bash tools/keycloak/dev-unlock-users.sh

cat <<'EOF'

==> Dev-Infrastruktur steht (Postgres, Keycloak, Mosquitto, Migrationen, BFF-Secret, Dev-Nutzer).

    Anwendungsprozesse (in eigenen Terminals, .env geladen):
      Backend:            node src/backend/dist/main.js          # nach `pnpm --filter @edms/backend build`
      Frontend:           npm --prefix src/frontend run dev      # http://localhost:5180
      Ingest-Worker:      node src/backend/dist/ingest-worker/worker-main.js
      Synth. Publisher:   node src/backend/dist/ingest-worker/synthetic-publisher/publisher-main.js

    Der Ingest-Worker laeuft alternativ als CONTAINER-DIENST (ADR-0011 C3) --
    dann uebernimmt Docker Neustart und Signalbehandlung, statt dass ein
    Terminal offen bleiben muss:

      docker compose -f deployment/docker/docker-compose.dev.yml \
        --profile ingest up -d --build ingest-worker

    Er haengt unter einem Profil, damit das gewoehnliche `up` (Postgres,
    Keycloak, Mosquitto) kein mehrminuetiges Image-Build ausloest. Logs:
      docker compose -f deployment/docker/docker-compose.dev.yml logs -f ingest-worker

    Login: http://localhost:5180  —  dev-betrieb-01 / (Dev-Passwort, siehe deployment/keycloak/README.md)
EOF
