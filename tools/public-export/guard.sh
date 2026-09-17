#!/usr/bin/env bash
# tools/public-export/guard.sh
#
# CI-Job "public-export-guard" (ADR-0001-projekt-skelett.md, Abschnitt 10.6,
# Job 10). Arbeitet AUSSCHLIESSLICH mit `git archive` gegen das
# Exclude-Manifest (tools/public-export/exclude.txt) -- kein History-Rewrite.
# Der einmalige History-Rewrite beim tatsächlichen Public-Go (`git
# filter-repo`) ist NICHT Teil dieses Skripts, siehe
# tools/public-export/README.md ("Einmalig beim Public-Go").
#
# Prüft:
#   (a) Ein Export-Baum/-Tarball des aktuellen Standes lässt sich erzeugen.
#   (b) Kein sensibler Pfad (compliance/, .claude/, production/, .env* außer
#       .env.example) landet im Export -- sowohl manifest-gesteuert als auch
#       per hartem Zusatz-Check (Verteidigung in der Tiefe, unabhängig vom
#       Manifest-Parsing).
#   (c) Kein neuer, unklassifizierter Top-Level-Pfad ist aufgetaucht (weder
#       im Exclude-Manifest noch in der unten gepflegten Public-Baseline
#       erfasst).
#
# Die Buildbarkeits-Prüfung des Export-Standes (ADR §10.6, dritter
# Guard-Punkt "prüft, dass der Export-Stand das Walking Skeleton grün baut")
# erfolgt NICHT in diesem Skript, sondern als eigener nachgelagerter Schritt
# im CI-Job (.github/workflows/ci.yml), der auf dem hier erzeugten
# Export-Verzeichnis aufsetzt. So bleibt dieses Skript frei von
# pnpm/Node-Abhängigkeiten und ist auch ohne installierte Toolchain lokal
# ausführbar (benötigt: bash >= 3.2 -- bewusst ohne assoziative Arrays, damit
# es sowohl auf macOS-Standard-Bash als auch auf den CI-Runnern läuft --,
# git, tar).
#
# Usage: guard.sh [--ref <git-ref>] [--out-dir <dir>]

set -euo pipefail

# --- Baseline bekannter, öffentlicher Top-Level-Pfade -----------------------
# Pflege: bei jedem NEUEN, bewusst öffentlichen Top-Level-Pfad hier ergänzen
# (siehe tools/public-export/README.md, Abschnitt "Format" -- "bewusst
# weggelassen, weil er öffentlich sein darf"). Sensible neue Top-Level-Pfade
# gehören stattdessen ins Exclude-Manifest (tools/public-export/exclude.txt);
# Änderungen daran, die die compliance/- oder .claude/-Klassifizierung
# betreffen, zwingend mit compliance-director abstimmen (README.md,
# Abschnitt "Zuständigkeit"). Stand: AP2 (2026-07-09).
KNOWN_PUBLIC_TOP_LEVEL=(
  # Build-Kontext-Filter fuer Container-Builds -- reine Bau-Konfiguration.
  ".dockerignore"
  ".editorconfig"
  ".env.example"
  ".github"
  ".gitignore"
  ".nvmrc"
  ".prettierignore"
  ".prettierrc.json"
  "CONTRIBUTING.md"
  "LICENSE"
  # ZWINGEND oeffentlich: Apache-2.0 §4(d) verlangt die Weitergabe der
  # NOTICE-Datei mit jedem Werk, das sie enthaelt. Sie ist zugleich der Ort,
  # an dem die Urhebernennung der KIT Consulting GmbH steht -- genau die
  # Eigenschaft, wegen der die Foerderauflage mit Apache-2.0 statt MIT
  # erfuellt wird (Projektleitlinien, Abschnitt Lizenz- & Foerder-Compliance).
  "NOTICE"
  "README.md"
  "deployment"
  # Bringt den lokalen Dev-Stack hoch -- fuer einen veroeffentlichten
  # Quelltext die wichtigste Datei ueberhaupt: ohne sie kann niemand von
  # aussen das Projekt starten.
  "dev-up.sh"
  "docs"
  "eslint.config.mjs"
  "migrations"
  "package.json"
  # Lockfile ist ZWINGEND öffentlich: reproduzierbare Builds
  # (--frozen-lockfile, M6) und License-Gate/SBOM-Determinismus.
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "schemas"
  "src"
  "tests"
  "tools"
  "tsconfig.base.json"
  # Vitest-Workspace-Bündelung (AP6) — reine Test-Konfiguration.
  "vitest.workspace.ts"
  "workflows"
)

# --- Sensible Präfixe: harter Zusatz-Check, unabhängig vom Manifest-Parsing -
HARD_SENSITIVE_TOP_LEVEL=("compliance" ".claude" "production")

REPO_ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="${REPO_ROOT}/tools/public-export/exclude.txt"

ref="HEAD"
out_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      ref="$2"
      shift 2
      ;;
    --out-dir)
      out_dir="$2"
      shift 2
      ;;
    -h | --help)
      echo "Usage: $0 [--ref <git-ref>] [--out-dir <dir>]"
      exit 0
      ;;
    *)
      echo "FEHLER: unbekannte Option '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${out_dir}" ]]; then
  out_dir="$(mktemp -d)"
  echo "==> Kein --out-dir angegeben, nutze temporäres Verzeichnis: ${out_dir}"
fi
mkdir -p "${out_dir}"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "FEHLER: Exclude-Manifest nicht gefunden: ${MANIFEST}" >&2
  exit 1
fi

echo "==> Public-Export-Guard für Ref '${ref}' (ADR-0001-projekt-skelett.md §10.6)"

# --- (c) Unklassifizierte neue Top-Level-Pfade ------------------------------
echo "==> Prüfe Top-Level-Pfade gegen Public-Baseline + Exclude-Manifest ..."

in_list() {
  # Lineare Suche statt assoziativem Array (Portabilität: läuft auch unter
  # macOS-Standard-Bash 3.2, nicht nur Bash >= 4). Bei der geringen Anzahl
  # an Top-Level-Einträgen ist das performant genug.
  local needle="$1"
  shift
  local x
  for x in "$@"; do
    [[ "${x}" == "${needle}" ]] && return 0
  done
  return 1
}

classified=("${KNOWN_PUBLIC_TOP_LEVEL[@]}")

# Top-Level-Anteil jeder Nicht-Negations-Zeile im Manifest ebenfalls als
# "klassifiziert" zählen (Negationszeilen klassifizieren selbst keinen neuen
# Top-Level-Pfad, sie nehmen nur innerhalb eines bereits ausgeschlossenen
# Pfades etwas wieder auf).
while IFS= read -r line; do
  line="${line%$'\r'}"
  [[ -z "${line}" ]] && continue
  [[ "${line}" == \#* ]] && continue
  [[ "${line}" == '!'* ]] && continue
  top="${line%%/*}"
  classified+=("${top}")
done < "${MANIFEST}"

unclassified=()
while IFS= read -r top_level; do
  [[ -z "${top_level}" ]] && continue
  if ! in_list "${top_level}" "${classified[@]}"; then
    unclassified+=("${top_level}")
  fi
done < <(git -C "${REPO_ROOT}" ls-tree --name-only "${ref}")

if [[ "${#unclassified[@]}" -gt 0 ]]; then
  echo "FEHLER: unklassifizierte(r) neue(r) Top-Level-Pfad(e) gefunden:" >&2
  for u in "${unclassified[@]}"; do
    echo "  - ${u}" >&2
  done
  echo "Bitte klassifizieren: entweder in tools/public-export/exclude.txt" >&2
  echo "aufnehmen (sensibel -- bei compliance/.claude-Bezug zwingend mit" >&2
  echo "compliance-director abstimmen) ODER in KNOWN_PUBLIC_TOP_LEVEL in" >&2
  echo "tools/public-export/guard.sh ergänzen, falls bewusst öffentlich" >&2
  echo "(siehe tools/public-export/README.md)." >&2
  exit 3
fi
echo "==> OK: keine unklassifizierten Top-Level-Pfade."

# --- (a) Export-Baum erzeugen -----------------------------------------------
raw_archive="${out_dir}/.raw-full.tar"
pristine_dir="${out_dir}/.pristine"
tree_dir="${out_dir}/tree"
final_archive="${out_dir}/public-export.tar"

rm -rf "${raw_archive}" "${pristine_dir}" "${tree_dir}" "${final_archive}"
mkdir -p "${pristine_dir}" "${tree_dir}"

echo "==> Erzeuge git-archive-Export von '${ref}' ..."
git -C "${REPO_ROOT}" archive --format=tar "${ref}" -o "${raw_archive}"
tar -xf "${raw_archive}" -C "${pristine_dir}"

# --- Manifest einlesen (Reihenfolge relevant für Negation "!") -------------
manifest_lines=()
while IFS= read -r line; do
  line="${line%$'\r'}"
  [[ -z "${line}" ]] && continue
  [[ "${line}" == \#* ]] && continue
  manifest_lines+=("${line}")
done < "${MANIFEST}"

path_matches() {
  # Root-relativer Pfad-Glob-Vergleich (siehe README.md, Abschnitt "Format"):
  # ein Muster ist immer relativ zum Repo-Root verankert (kein
  # gitignore-typisches "überall in der Tiefe"-Matching ohne führenden
  # Slash). Verzeichnis-Ausschlüsse ("foo/") matchen "foo" und alles
  # darunter; "*" ist als Glob erlaubt (z. B. ".env*").
  local p="$1" base="${2%/}"
  case "${p}" in
    ${base}) return 0 ;;
    ${base}/*) return 0 ;;
  esac
  return 1
}

is_excluded() {
  # Semantik wie .gitignore-Negation: die LETZTE in Datei-Reihenfolge
  # matchende Zeile gewinnt. Rückgabewert (Bash-Exit-Code-Konvention):
  # 0 = ausgeschlossen, 1 = nicht ausgeschlossen (Default: öffentlich).
  local path="$1"
  local excluded=1
  local entry pattern negate
  for entry in "${manifest_lines[@]}"; do
    negate=0
    pattern="${entry}"
    if [[ "${pattern}" == '!'* ]]; then
      negate=1
      pattern="${pattern#!}"
    fi
    if path_matches "${path}" "${pattern}"; then
      if [[ "${negate}" -eq 1 ]]; then
        excluded=1
      else
        excluded=0
      fi
    fi
  done
  return "${excluded}"
}

echo "==> Wende Exclude-Manifest auf den Export an ..."
copied=0
while IFS= read -r -d '' f; do
  rel="${f#"${pristine_dir}"/}"
  if is_excluded "${rel}"; then
    continue
  fi
  dest="${tree_dir}/${rel}"
  mkdir -p "$(dirname "${dest}")"
  cp -a "${f}" "${dest}"
  copied=$((copied + 1))
done < <(find "${pristine_dir}" -mindepth 1 -type f -print0)

echo "==> ${copied} Datei(en) in den gefilterten Export-Baum übernommen."

# --- (a2) Redaktion: Begriffe ersetzen, die im Export nichts zu suchen haben -
#
# Anders als das Exclude-Manifest entfernt dies keine Dateien, sondern
# BEGRIFFE aus Dateien, die oeffentlich werden sollen — im Wesentlichen
# Kommentare, die den realen Pilotbestand benennen. Die Ersetzungen und die
# Verbotsliste stehen in redaktion.txt, jeweils mit Begruendung.
#
# Warum ueberhaupt beim EXPORT und nicht in der Quelle: Drei der Fundstellen
# stehen in bereits angewendeten Migrationen. Die sind unveraenderlich
# (Pruefsummen-Riegel des Runners) — der Begriff liesse sich dort nur durch
# Rueckbau der gesamten Kette entfernen. Und der interne Kommentar hat
# Dokumentationswert ("wogegen wurde die Formel geprueft?"), den nur der
# oeffentliche Baum nicht braucht.
REDAKTION_MANIFEST="${REPO_ROOT}/tools/public-export/redaktion.txt"
if [[ -f "${REDAKTION_MANIFEST}" ]]; then
  echo "==> Wende Redaktions-Manifest auf den Export an ..."
  if ! python3 "${REPO_ROOT}/tools/public-export/redigiere.py" "${REDAKTION_MANIFEST}" "${tree_dir}"; then
    echo "==> Public-Export-Guard FEHLGESCHLAGEN (Redaktion)." >&2
    exit 1
  fi
fi

# --- (b) Harter Zusatz-Check: sensible Pfade dürfen NICHT im Export landen --
echo "==> Harter Zusatz-Check (Verteidigung in der Tiefe, unabhängig vom Manifest-Parsing) ..."
leak_found=0
for prefix in "${HARD_SENSITIVE_TOP_LEVEL[@]}"; do
  if [[ -e "${tree_dir}/${prefix}" ]]; then
    echo "FEHLER: sensibler Pfad '${prefix}' ist im Export-Baum gelandet!" >&2
    leak_found=1
  fi
done

while IFS= read -r -d '' envfile; do
  base_name="$(basename "${envfile}")"
  if [[ "${base_name}" != ".env.example" ]]; then
    echo "FEHLER: sensible Env-Datei '${base_name}' ist im Export-Baum gelandet!" >&2
    leak_found=1
  fi
done < <(find "${tree_dir}" -maxdepth 1 -name '.env*' -print0)

if [[ "${leak_found}" -ne 0 ]]; then
  echo "==> Public-Export-Guard FEHLGESCHLAGEN (sensibler Pfad im Export-Baum)." >&2
  exit 2
fi
echo "==> OK: keine sensiblen Pfade im Export-Baum."

# --- Finales Tarball aus dem gefilterten Baum bauen ------------------------
tar -cf "${final_archive}" -C "${tree_dir}" .
rm -rf "${raw_archive}" "${pristine_dir}"

echo "==> Export-Tarball:        ${final_archive}"
echo "==> Gefilterter Export-Baum: ${tree_dir}"
echo "==> Public-Export-Guard OK."
