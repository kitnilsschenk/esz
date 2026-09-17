#!/usr/bin/env bash
# EDMS — Keycloak Bootstrap: setzt/rotiert das edms-bff-Client-Secret.
#
# Bezug: docs/adr/ADR-0002-auth-modul.md §14 (D4 Realm-as-Code, rote Linie 4,
# "security-lead-Votum 5"). Der versionierte Realm-Export
# (deployment/keycloak/realm-edms.json) enthält BEWUSST kein `secret`-Feld
# für `edms-bff` — Keycloak generiert beim Import ein zufälliges
# Platzhalter-Secret. Dieses Skript überschreibt es idempotent mit dem Wert
# aus ${EDMS_BFF_CLIENT_SECRET} (Env/Vault) via Admin-REST-API.
#
# HART FEHLSCHLAGEND (kein stiller Leerlauf): fehlt eine Pflicht-Variable,
# ist Keycloak nicht erreichbar/healthy, schlägt ein API-Aufruf fehl oder
# weicht das verifizierte Secret vom erwarteten Wert ab, bricht das Skript
# mit Exit-Code 1 und einer Fehlermeldung auf STDERR ab.
#
# Voraussetzungen: curl, jq.
#
# Verwendung (Beispiel, siehe auch README.md in diesem Verzeichnis):
#   KEYCLOAK_ADMIN=admin \
#   KEYCLOAK_ADMIN_PASSWORD=changeme_local_dev_only \
#   EDMS_BFF_CLIENT_SECRET=changeme_local_dev_only_bff_secret \
#   ./tools/keycloak/bootstrap-secret.sh
#
# Env-Variablen (siehe .env.example):
#   KEYCLOAK_URL                  Basis-URL des Keycloak-HTTP-Ports
#                                 (Default: http://localhost:${KEYCLOAK_PORT:-8080})
#   KEYCLOAK_MANAGEMENT_URL       Basis-URL des Management-/Health-Ports
#                                 (Default: http://localhost:${KEYCLOAK_MANAGEMENT_PORT:-9000})
#   KEYCLOAK_REALM                Realm-Name (Default: edms)
#   KEYCLOAK_BFF_CLIENT_ID        Client-ID (Default: edms-bff)
#   KEYCLOAK_ADMIN                Bootstrap-Admin-Benutzername (Pflicht)
#   KEYCLOAK_ADMIN_PASSWORD       Bootstrap-Admin-Passwort (Pflicht)
#   EDMS_BFF_CLIENT_SECRET        Zu setzendes Client-Secret (Pflicht)
#   KEYCLOAK_HEALTH_TIMEOUT_SECONDS  Wartezeit auf Health (Default: 90)
#
# Erweiterung auf weitere Clients (z. B. einen konkreten edms-worker-*-
# Service-Account, sobald der erste echte Verbraucher existiert): dieses
# Skript strikt auf `edms-bff` fokussiert lassen und für den jeweiligen
# Worker-Client eine analoge Instanz anlegen (gleiches Read-Modify-Write-
# Muster über die Admin-REST-API, eigener Secret-Env-Name).

set -euo pipefail

: "${KEYCLOAK_URL:=http://localhost:${KEYCLOAK_PORT:-8080}}"
: "${KEYCLOAK_MANAGEMENT_URL:=http://localhost:${KEYCLOAK_MANAGEMENT_PORT:-9000}}"
: "${KEYCLOAK_REALM:=edms}"
: "${KEYCLOAK_BFF_CLIENT_ID:=edms-bff}"
: "${KEYCLOAK_HEALTH_TIMEOUT_SECONDS:=90}"

fail() {
  echo "FEHLER: $*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Pflicht-Variable ${name} ist nicht gesetzt. Abbruch (kein stiller Leerlauf)."
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Benötigtes Kommando '$1' wurde nicht gefunden."
}

require_cmd curl
require_cmd jq

require_env KEYCLOAK_ADMIN
require_env KEYCLOAK_ADMIN_PASSWORD
require_env EDMS_BFF_CLIENT_SECRET

echo "==> Warte auf Keycloak-Health (${KEYCLOAK_MANAGEMENT_URL}/health/ready, Timeout ${KEYCLOAK_HEALTH_TIMEOUT_SECONDS}s)..."
elapsed=0
until curl -fsS -o /dev/null "${KEYCLOAK_MANAGEMENT_URL}/health/ready"; do
  elapsed=$((elapsed + 2))
  if (( elapsed >= KEYCLOAK_HEALTH_TIMEOUT_SECONDS )); then
    fail "Keycloak wurde innerhalb von ${KEYCLOAK_HEALTH_TIMEOUT_SECONDS}s nicht 'ready' (${KEYCLOAK_MANAGEMENT_URL}/health/ready). Abbruch."
  fi
  sleep 2
done
echo "==> Keycloak ist ready."

echo "==> Hole Admin-Token (Master-Realm, admin-cli)..."
token_response="$(curl -fsS -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password")" || fail "Admin-Token-Request fehlgeschlagen (Keycloak nicht erreichbar oder falsche Zugangsdaten)."

admin_token="$(printf '%s' "${token_response}" | jq -r '.access_token // empty')"
[[ -n "${admin_token}" ]] || fail "Kein access_token in der Token-Antwort — falsche Admin-Zugangsdaten oder Keycloak-Fehler."

echo "==> Suche Client '${KEYCLOAK_BFF_CLIENT_ID}' im Realm '${KEYCLOAK_REALM}'..."
client_list="$(curl -fsS "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${KEYCLOAK_BFF_CLIENT_ID}" \
  -H "Authorization: Bearer ${admin_token}")" || fail "Client-Lookup fehlgeschlagen."

client_uuid="$(printf '%s' "${client_list}" | jq -r '.[0].id // empty')"
[[ -n "${client_uuid}" ]] || fail "Client '${KEYCLOAK_BFF_CLIENT_ID}' nicht gefunden im Realm '${KEYCLOAK_REALM}'. Ist der Realm-Import gelaufen (deployment/keycloak/realm-edms.json via --import-realm)?"

echo "==> Setze Client-Secret (Read-Modify-Write der vollständigen Client-Repräsentation via Admin-REST)..."
current_repr="$(curl -fsS "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${client_uuid}" \
  -H "Authorization: Bearer ${admin_token}")" || fail "Client-Repräsentation konnte nicht gelesen werden."

updated_repr="$(printf '%s' "${current_repr}" | jq --arg secret "${EDMS_BFF_CLIENT_SECRET}" '.secret = $secret')"

http_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
  "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${client_uuid}" \
  -H "Authorization: Bearer ${admin_token}" \
  -H "Content-Type: application/json" \
  --data-binary "${updated_repr}")"

[[ "${http_status}" == "204" ]] || fail "Secret-Update fehlgeschlagen (HTTP ${http_status})."

echo "==> Verifiziere gesetztes Secret..."
verify="$(curl -fsS "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${client_uuid}/client-secret" \
  -H "Authorization: Bearer ${admin_token}")" || fail "Secret-Verifikation fehlgeschlagen (GET client-secret)."

verify_value="$(printf '%s' "${verify}" | jq -r '.value // empty')"
if [[ "${verify_value}" != "${EDMS_BFF_CLIENT_SECRET}" ]]; then
  fail "Verifikation fehlgeschlagen: das gesetzte Secret weicht vom erwarteten Wert ab."
fi

echo "==> OK: Client-Secret für '${KEYCLOAK_BFF_CLIENT_ID}' im Realm '${KEYCLOAK_REALM}' erfolgreich gesetzt/rotiert."
