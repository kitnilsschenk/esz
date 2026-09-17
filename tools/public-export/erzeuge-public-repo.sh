#!/usr/bin/env bash
#
# erzeuge-public-repo.sh — erzeugt aus dem geprüften Export-Baum ein FRISCHES
# Git-Repository mit genau einem Commit.
#
# WOFÜR
# -----
# Die Förderauflage verlangt die Veröffentlichung des geförderten Produkts
# (Apache-2.0, unentgeltlich, mindestens ein Jahr über den Projektzeitraum
# hinaus — und ausdrücklich auch für spätere Versionen, Updates und Patches).
# Veröffentlicht wird der Quelltext, NICHT die interne Entwicklungs-Akte:
# `compliance/`, `.claude/`, `production/` und `Projektleitlinien` bleiben privat
# (Manifest `exclude.txt`, durchgesetzt von `guard.sh` und dem gleichnamigen
# CI-Job).
#
# Dieses Skript ist der zweite Schritt: Aus dem gefilterten Baum wird ein
# eigenständiges Repository ohne Vorgeschichte.
#
# WAS ES NICHT TUT — UND WARUM NICHT
# ----------------------------------
# Es legt KEIN entferntes Repository an und es PUSHT NICHTS. Veröffentlichen
# ist nicht zurückzunehmen: Was einmal öffentlich war, ist in Caches, Forks
# und Suchmaschinen. Der letzte Schritt gehört deshalb in eine bewusste,
# menschliche Hand und nicht in ein Skript, das man versehentlich zweimal
# startet. Das Skript endet mit dem lokalen Repository und sagt, was der
# nächste Schritt wäre.
#
# ZUR HISTORIE — BITTE EINMAL LESEN
# ---------------------------------
# Der Eigenentwicklungs-Nachweis gegenüber dem Fördergeber ist die LÜCKENLOSE
# Git-Historie samt DCO-Signoff (Projektleitlinien, Abschnitt Lizenz- &
# Förder-Compliance). Dieses Skript erzeugt bewusst eine Momentaufnahme OHNE
# diese Historie — sie bleibt im privaten Repository, und dort muss sie
# bleiben. Wer das private Repository nach der Veröffentlichung aufräumt,
# vernichtet den Nachweis.
#
# AUFRUF
#   bash tools/public-export/erzeuge-public-repo.sh \
#        --out-dir <zielverzeichnis> \
#        [--name "Vorname Nachname"] [--email adresse@example.org] \
#        [--message "Commit-Betreff"] [--ref HEAD]
#
# Ohne `--name`/`--email` wird die Git-Identität des aktuellen Repositories
# verwendet.

set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HIER}/../.." && pwd)"

out_dir=""
ref="HEAD"
autor_name=""
autor_email=""
betreff=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) out_dir="${2:?--out-dir braucht einen Pfad}"; shift 2 ;;
    --ref)     ref="${2:?--ref braucht eine Referenz}";       shift 2 ;;
    --name)    autor_name="${2:?--name braucht einen Wert}";  shift 2 ;;
    --email)   autor_email="${2:?--email braucht einen Wert}"; shift 2 ;;
    --message) betreff="${2:?--message braucht einen Wert}";  shift 2 ;;
    -h|--help) sed -n '2,45p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${out_dir}" ]]; then
  echo "FEHLER: --out-dir fehlt." >&2
  exit 2
fi

if [[ -e "${out_dir}" ]]; then
  echo "FEHLER: ${out_dir} existiert bereits." >&2
  echo "        Das Skript überschreibt nichts -- bitte ein leeres Ziel angeben." >&2
  exit 2
fi

autor_name="${autor_name:-$(git -C "${REPO}" config user.name || true)}"
autor_email="${autor_email:-$(git -C "${REPO}" config user.email || true)}"

if [[ -z "${autor_name}" || -z "${autor_email}" ]]; then
  echo "FEHLER: Kein Autor bestimmbar. Bitte --name und --email angeben." >&2
  exit 2
fi

# Version aus der Wurzel-package.json — sie benennt den veröffentlichten
# Stand, damit der eine Commit nicht "irgendein Dienstag" heißt.
version="$(node -p "require('${REPO}/package.json').version" 2>/dev/null || echo "0.0.0")"
betreff="${betreff:-EDMS ${version} — Erstveröffentlichung des Quelltexts}"

echo "==> Schritt 1/3: Export-Guard (Manifest + git-archive + harter Zusatz-Check)"
arbeits_dir="$(mktemp -d)"
bash "${HIER}/guard.sh" --ref "${ref}" --out-dir "${arbeits_dir}" >/dev/null
baum="${arbeits_dir}/tree"

if [[ ! -d "${baum}" ]]; then
  echo "FEHLER: Guard hat keinen Export-Baum erzeugt." >&2
  exit 1
fi

anzahl="$(find "${baum}" -type f | wc -l | tr -d ' ')"
echo "    ${anzahl} Datei(en) freigegeben."

echo "==> Schritt 2/3: Frisches Repository in ${out_dir}"
mkdir -p "${out_dir}"
# `cp -R <dir>/.` kopiert auch Punktdateien, ohne auf Shell-Globbing
# angewiesen zu sein (`.github`, `.editorconfig`, `.env.example` …).
cp -R "${baum}/." "${out_dir}/"

git -C "${out_dir}" init --quiet --initial-branch=main
git -C "${out_dir}" add -A

# Genau EIN Commit, mit der angegebenen Identität als Autor UND Committer.
#
# KEIN `Co-Authored-By`-Trailer: Der Rechteinhaber ist die KIT Consulting
# GmbH (s. NOTICE), und dieser Commit ist die Veröffentlichung ihres Werks.
# Werkzeuge, die bei der Entstehung geholfen haben, sind keine Miturheber --
# sie stehen auch nicht im Impressum eines Buchs, weil ein Textverarbeiter
# benutzt wurde. Die interne Historie dokumentiert den Entstehungsweg
# vollständig und bleibt der Nachweis; sie wird hier nicht ersetzt, sondern
# nur nicht mitveröffentlicht.
#
# `-s` setzt den DCO-Signoff (Developer Certificate of Origin) -- die
# Erklärung, die Beiträge einbringen zu dürfen. Die Förderauflage verlangt
# ihn; er gehört an den veröffentlichten Stand wie an jeden internen Commit.
GIT_AUTHOR_NAME="${autor_name}" \
GIT_AUTHOR_EMAIL="${autor_email}" \
GIT_COMMITTER_NAME="${autor_name}" \
GIT_COMMITTER_EMAIL="${autor_email}" \
git -C "${out_dir}" commit --quiet -s -m "${betreff}" -m "$(cat <<'RUMPF'
Erstveröffentlichung als Open Source unter Apache-2.0 (siehe LICENSE und
NOTICE). Rechteinhaber: KIT Consulting GmbH.

Dies ist eine Momentaufnahme des Quelltexts, keine Übernahme der internen
Entwicklungs-Historie. Nicht enthalten sind die Compliance-Akte
(DSGVO-Verarbeitungsverzeichnis, Datenschutz-Folgenabschätzungen,
ISO-27001-Controls, Risiko-Register), die interne Entwicklungssteuerung und
die Betriebs-/Planungsunterlagen.
RUMPF
)"

echo "==> Schritt 3/3: Ergebnis"
echo
git -C "${out_dir}" --no-pager log --format='    Commit : %h%n    Autor  : %an <%ae>%n    Betreff: %s' -1
echo "    Dateien: ${anzahl}"
echo
echo "    Trailer des Commits:"
git -C "${out_dir}" --no-pager log -1 --format=%B | grep -E "^[A-Za-z-]+:" | sed 's/^/      /' || echo "      (keine)"
echo
echo "==> Lokales Repository steht: ${out_dir}"
echo
echo "    NICHT gepusht und kein entferntes Repository angelegt -- das ist Absicht."
echo "    Veröffentlichen ist nicht zurückzunehmen; der Schritt gehört in eine"
echo "    bewusste Hand. Wenn geprüft und gewollt:"
echo
echo "      cd ${out_dir}"
echo "      git remote add origin git@github.com:<organisation>/<repo>.git"
echo "      git push -u origin main"
echo
echo "    Vorher lohnt ein Blick auf:"
echo "      - README.md   — beschreibt sie das Projekt für Aussenstehende?"
echo "      - CONTRIBUTING.md, LICENSE, NOTICE — vollständig?"
echo "      - Verweise auf nicht-öffentliche Pfade (.claude/, compliance/)"
