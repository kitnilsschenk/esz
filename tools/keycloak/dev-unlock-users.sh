#!/usr/bin/env bash
# EDMS — Keycloak Dev-Helfer: entfernt die Login-Pflichtaktionen der
# Dev-Nutzer (CONFIGURE_TOTP, UPDATE_PASSWORD), damit sie sich im lokalen
# Dev-Stack mit reinem Passwort anmelden können (kein TOTP-Enrollment,
# keine erzwungene Passwortänderung beim ersten Login).
#
# WARUM: Der Realm-Export (deployment/keycloak/realm-edms.json) trägt bei
# jedem der drei dev-*-01-Nutzer bewusst CONFIGURE_TOTP + UPDATE_PASSWORD als
# requiredActions (MFA-Test-Absicht, siehe deployment/keycloak/README.md
# "MFA: CONFIGURE_TOTP"). Keycloak hat im Dev-Stack KEIN Volume — jeder
# Container-Neustart importiert den Realm frisch und setzt diese Pflichtaktionen
# (und alle in einer Vorsession gesetzten Passwörter/TOTP-Secrets) zurück.
# Dieses Skript stellt danach den bequemen Passwort-Login wieder her, OHNE die
# MFA-Absicht im versionierten Realm-Export aufzugeben (es ändert nur die
# LAUFENDE Instanz, nicht die JSON-Datei).
#
# NUR FÜR LOKALEN DEV-EINSATZ. Es schwächt MFA ab und darf NIE gegen eine
# nicht-lokale/produktive Keycloak-Instanz laufen (Localhost-Sicherung unten).
#
# Voraussetzungen: curl, jq. Laufender, gesunder Keycloak mit importiertem
# edms-Realm.
#
# Verwendung:
#   KEYCLOAK_ADMIN=admin \
#   KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
#   ./tools/keycloak/dev-unlock-users.sh
#
# Env-Variablen (siehe .env.example / bootstrap-secret.sh):
#   KEYCLOAK_URL                 Default: http://localhost:${KEYCLOAK_PORT:-8080}
#   KEYCLOAK_MANAGEMENT_URL      Default: http://localhost:${KEYCLOAK_MANAGEMENT_PORT:-9000}
#   KEYCLOAK_REALM               Default: edms
#   KEYCLOAK_ADMIN               Bootstrap-Admin-Benutzername (Pflicht)
#   KEYCLOAK_ADMIN_PASSWORD      Bootstrap-Admin-Passwort (Pflicht)
#   DEV_UNLOCK_USERS             Space-separierte Nutzerliste
#                                (Default: "dev-betrieb-01 dev-auditor-01 dev-admin-01")
#   KEYCLOAK_HEALTH_TIMEOUT_SECONDS  Wartezeit auf Health (Default: 90)
#   DEV_UNLOCK_ALLOW_NONLOCAL=1   Localhost-Sicherung übersteuern (NICHT empfohlen)

set -euo pipefail

: "${KEYCLOAK_URL:=http://localhost:${KEYCLOAK_PORT:-8080}}"
: "${KEYCLOAK_MANAGEMENT_URL:=http://localhost:${KEYCLOAK_MANAGEMENT_PORT:-9000}}"
: "${KEYCLOAK_REALM:=edms}"
: "${DEV_UNLOCK_USERS:=dev-betrieb-01 dev-auditor-01 dev-admin-01}"
: "${KEYCLOAK_HEALTH_TIMEOUT_SECONDS:=90}"

fail() { echo "FEHLER: $*" >&2; exit 1; }
require_env() { local n="$1"; [[ -n "${!n:-}" ]] || fail "Pflicht-Variable ${n} ist nicht gesetzt. Abbruch (kein stiller Leerlauf)."; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Benötigtes Kommando '$1' wurde nicht gefunden."; }

require_cmd curl
require_cmd jq
require_env KEYCLOAK_ADMIN
require_env KEYCLOAK_ADMIN_PASSWORD

# Localhost-Sicherung: dieses Skript schwächt MFA ab — niemals gegen eine
# nicht-lokale Instanz. Übersteuerbar nur mit expliziter Absicht.
if [[ "${DEV_UNLOCK_ALLOW_NONLOCAL:-0}" != "1" ]]; then
  case "${KEYCLOAK_URL}" in
    *localhost*|*127.0.0.1*|*://[::1]*) : ;;
    *) fail "KEYCLOAK_URL='${KEYCLOAK_URL}' ist nicht lokal. Dieses Skript schwächt MFA ab und ist NUR für den lokalen Dev-Stack. Zum Übersteuern DEV_UNLOCK_ALLOW_NONLOCAL=1 setzen (auf eigene Verantwortung)." ;;
  esac
fi

echo "==> Warte auf Keycloak-Health (${KEYCLOAK_MANAGEMENT_URL}/health/ready, Timeout ${KEYCLOAK_HEALTH_TIMEOUT_SECONDS}s)..."
elapsed=0
until curl -fsS -o /dev/null "${KEYCLOAK_MANAGEMENT_URL}/health/ready"; do
  elapsed=$((elapsed + 2))
  (( elapsed >= KEYCLOAK_HEALTH_TIMEOUT_SECONDS )) && fail "Keycloak wurde innerhalb von ${KEYCLOAK_HEALTH_TIMEOUT_SECONDS}s nicht 'ready'. Abbruch."
  sleep 2
done
echo "==> Keycloak ist ready."

echo "==> Hole Admin-Token (Master-Realm, admin-cli)..."
token_response="$(curl -fsS -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" -d "grant_type=password")" \
  || fail "Admin-Token-Request fehlgeschlagen (Keycloak nicht erreichbar oder falsche Zugangsdaten)."
admin_token="$(printf '%s' "${token_response}" | jq -r '.access_token // empty')"
[[ -n "${admin_token}" ]] || fail "Kein access_token — falsche Admin-Zugangsdaten oder Keycloak-Fehler."

for username in ${DEV_UNLOCK_USERS}; do
  user_list="$(curl -fsS "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${username}&exact=true" \
    -H "Authorization: Bearer ${admin_token}")" || fail "User-Lookup für '${username}' fehlgeschlagen."
  user_id="$(printf '%s' "${user_list}" | jq -r '.[0].id // empty')"
  if [[ -z "${user_id}" ]]; then
    echo "==> WARNUNG: Nutzer '${username}' nicht im Realm '${KEYCLOAK_REALM}' gefunden — übersprungen." >&2
    continue
  fi
  current="$(curl -fsS "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}" \
    -H "Authorization: Bearer ${admin_token}")" || fail "User-Repräsentation für '${username}' konnte nicht gelesen werden."
  updated="$(printf '%s' "${current}" | jq '.requiredActions = [] | .enabled = true')"
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
    "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user_id}" \
    -H "Authorization: Bearer ${admin_token}" -H "Content-Type: application/json" \
    --data-binary "${updated}")"
  [[ "${http_status}" == "204" ]] || fail "Update für '${username}' fehlgeschlagen (HTTP ${http_status})."
  echo "==> OK: '${username}' entsperrt (requiredActions geleert, enabled=true) — Passwort-Login möglich."
done

echo "==> Fertig. Dev-Nutzer können sich im edms-Realm jetzt mit reinem Passwort anmelden."
