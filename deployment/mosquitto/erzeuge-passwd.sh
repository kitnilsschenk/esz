#!/usr/bin/env bash
#
# Erzeugt die Mosquitto-Passwortdatei fuer den lokalen Dev-Stack (ADR-0005).
#
# WARUM DIESES SKRIPT EXISTIERT
# Die erzeugte `passwd` wird BEWUSST NICHT versioniert (siehe .gitignore).
# Dieses Repository unterliegt der Open-Source-Publikationspflicht des
# Foerdervorhabens (Apache-2.0, siehe LICENSE) — eine Credential-Datei im
# veroeffentlichten Repo waere schlechte Praxis, selbst mit reinen
# Dev-Zugangsdaten und selbst als Hash: sie wird kopiert und wandert so in
# fremde Installationen.
#
# Die beiden Identitaeten sind Least-Privilege getrennt (siehe ./acl):
#   edms_worker     — darf NUR subscriben (Ingest-Worker)
#   edms_publisher  — darf NUR publishen (synthetischer Publisher)
#
# VERWENDUNG
#   ./deployment/mosquitto/erzeuge-passwd.sh
# Passwoerter werden aus der (gitignoreten) .env im Repo-Wurzelverzeichnis
# gelesen; fehlen sie, bricht das Skript ab, statt still einen Default zu
# setzen (fail-closed — ein stiller Default-Zugang ist genau die Sorte
# Bequemlichkeit, die spaeter produktiv landet).
#
# NUR FUER DEN DEV-STACK. Im produktiven Profil gilt ohnehin SA-3
# (TLS 1.3 + mTLS statt Username/Passwort) — siehe ADR-0005 §31.

set -euo pipefail

SKRIPT_VERZEICHNIS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_WURZEL="$(cd "${SKRIPT_VERZEICHNIS}/../.." && pwd)"
ENV_DATEI="${REPO_WURZEL}/.env"
ZIEL="${SKRIPT_VERZEICHNIS}/passwd"
MOSQUITTO_IMAGE="eclipse-mosquitto:2.0.18"

if [[ ! -f "${ENV_DATEI}" ]]; then
  echo "FEHLER: ${ENV_DATEI} nicht gefunden." >&2
  echo "        Lege sie nach dem Muster von .env.example an." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "${ENV_DATEI}" && set +a

if [[ -z "${EDMS_INGEST_MQTT_PASSWORD:-}" || -z "${EDMS_SYNTHETIC_PUBLISHER_MQTT_PASSWORD:-}" ]]; then
  echo "FEHLER: EDMS_INGEST_MQTT_PASSWORD und/oder" >&2
  echo "        EDMS_SYNTHETIC_PUBLISHER_MQTT_PASSWORD fehlen in .env." >&2
  echo "        Kein Default wird gesetzt (fail-closed)." >&2
  exit 1
fi

WORKER_BENUTZER="${EDMS_INGEST_MQTT_USERNAME:-edms_worker}"
PUBLISHER_BENUTZER="${EDMS_SYNTHETIC_PUBLISHER_MQTT_USERNAME:-edms_publisher}"

rm -f "${ZIEL}"

# `mosquitto_passwd` laeuft im offiziellen Image — so wird keine lokale
# Mosquitto-Installation vorausgesetzt und der Hash entspricht exakt dem,
# was der Broker im Compose-Stack erwartet.
docker run --rm -v "${SKRIPT_VERZEICHNIS}:/tmp/mq" "${MOSQUITTO_IMAGE}" \
  mosquitto_passwd -c -b /tmp/mq/passwd "${WORKER_BENUTZER}" "${EDMS_INGEST_MQTT_PASSWORD}"
docker run --rm -v "${SKRIPT_VERZEICHNIS}:/tmp/mq" "${MOSQUITTO_IMAGE}" \
  mosquitto_passwd -b /tmp/mq/passwd "${PUBLISHER_BENUTZER}" "${EDMS_SYNTHETIC_PUBLISHER_MQTT_PASSWORD}"

chmod 600 "${ZIEL}"

echo "Mosquitto-Passwortdatei erzeugt: ${ZIEL}"
echo "  Identitaeten: ${WORKER_BENUTZER} (nur subscribe), ${PUBLISHER_BENUTZER} (nur publish)"
echo "  Die Datei ist gitignored und wird NICHT versioniert."
