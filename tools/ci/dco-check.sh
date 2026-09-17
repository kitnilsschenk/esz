#!/usr/bin/env bash
# tools/ci/dco-check.sh
#
# CI-Job "dco-check" (ADR-0001-projekt-skelett.md, Abschnitt 10.3, Job 9).
# Prüft für jeden Commit im Bereich (base, head], ob ein "Signed-off-by:"
# DCO-Trailer vorhanden ist, der zu Autor ODER Committer passt (Name + E-Mail).
# Eigenentwicklung, keine Drittanbieter-Action (Zero-Third-Party-Surface,
# stützt den Eigenentwicklungs-Nachweis gegenüber dem Fördergeber).
#
# Usage: dco-check.sh <base-sha-or-ref> <head-sha-or-ref>
#
# <base-sha-or-ref> darf leer oder eine All-Zero-SHA sein (z. B.
# github.event.before bei einem ersten Push auf einen neuen Branch) — in dem
# Fall wird nur der head-Commit selbst geprüft.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <base-sha-or-ref> <head-sha-or-ref>" >&2
  exit 2
fi

base="$1"
head="$2"
zero_sha="0000000000000000000000000000000000000000"

if [[ -z "${head}" ]]; then
  echo "FEHLER: <head-sha-or-ref> ist leer." >&2
  exit 2
fi

if [[ -z "${base}" || "${base}" == "${zero_sha}" ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "==> Kein gültiger Base-Commit übergeben ('${base}') -- prüfe nur den letzten Commit (${head})."
  if git rev-parse --verify "${head}~1" >/dev/null 2>&1; then
    range="${head}~1..${head}"
  else
    # head ist der allererste Commit im Repository.
    range="${head}"
  fi
else
  range="${base}..${head}"
fi

echo "==> DCO-Check über Commit-Bereich: ${range}"
commits="$(git rev-list --no-merges "${range}")"

if [[ -z "${commits}" ]]; then
  echo "==> Keine (Nicht-Merge-)Commits im Bereich -- nichts zu prüfen."
  exit 0
fi

fail=0
while IFS= read -r sha; do
  [[ -z "${sha}" ]] && continue

  author_name="$(git show -s --format='%an' "${sha}")"
  author_email="$(git show -s --format='%ae' "${sha}")"
  committer_name="$(git show -s --format='%cn' "${sha}")"
  committer_email="$(git show -s --format='%ce' "${sha}")"
  body="$(git show -s --format='%B' "${sha}")"

  trailers="$(printf '%s\n' "${body}" | grep -E '^Signed-off-by:[[:space:]]' || true)"

  if [[ -z "${trailers}" ]]; then
    echo "FEHLER: Commit ${sha} (${author_name} <${author_email}>) hat KEINEN Signed-off-by-Trailer." >&2
    fail=1
    continue
  fi

  matched=0
  while IFS= read -r trailer; do
    [[ -z "${trailer}" ]] && continue
    signoff="${trailer#Signed-off-by:}"
    signoff="$(printf '%s' "${signoff}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    so_email="$(printf '%s' "${signoff}" | grep -oE '<[^>]+>' | tr -d '<>' || true)"
    so_name="$(printf '%s' "${signoff}" | sed -E 's/^(.*)<[^>]+>$/\1/' | sed -e 's/[[:space:]]*$//')"

    [[ -z "${so_email}" ]] && continue

    if { [[ "${so_email}" == "${author_email}" ]] && [[ "${so_name}" == "${author_name}" ]]; } \
      || { [[ "${so_email}" == "${committer_email}" ]] && [[ "${so_name}" == "${committer_name}" ]]; }; then
      matched=1
      break
    fi
  done <<< "${trailers}"

  if [[ "${matched}" -ne 1 ]]; then
    echo "FEHLER: Commit ${sha} hat Signed-off-by, das weder zu Autor" \
      "(${author_name} <${author_email}>) noch Committer" \
      "(${committer_name} <${committer_email}>) passt." >&2
    fail=1
  else
    echo "OK: ${sha} -- DCO-Signoff passt."
  fi
done <<< "${commits}"

if [[ "${fail}" -ne 0 ]]; then
  echo "==> DCO-Check FEHLGESCHLAGEN. Bitte 'git commit -s' (bzw. 'git rebase --signoff') nutzen." >&2
  exit 1
fi

echo "==> DCO-Check OK: alle Commits im Bereich sind signiert."
exit 0
