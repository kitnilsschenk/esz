#!/usr/bin/env python3
"""Wendet das Redaktions-Manifest auf einen Export-Baum an.

Aufruf:  redigiere.py <manifest> <baum>

Zwei Aufgaben, streng getrennt:

  1. ERSETZEN — jede Zeile `alt<TAB>neu` wird woertlich (nicht als regulaerer
     Ausdruck) in allen Textdateien des Baums ersetzt. Woertlich deshalb,
     weil ein Manifest, das Muster erlaubt, frueher oder spaeter etwas
     trifft, das niemand gemeint hat.

  2. VERBIETEN — jede Zeile `!begriff` darf danach nirgends mehr im Baum
     stehen. Das ist die zweite Linie: Eine Ersetzungsliste, die eine
     Schreibweise uebersieht, faellt hier auf, statt durchzurutschen.

Beendet sich mit Status 1, sobald ein Verbotsbegriff uebrig bleibt — der
Export-Guard bricht dann ab.

Binaerdateien werden uebersprungen (sie koennen den Begriff nicht als Text
tragen, und ein Ersetzungsversuch wuerde sie beschaedigen).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Dateiendungen, die als Text behandelt werden. Positivliste statt
# Negativliste: Was hier nicht steht, wird nicht angefasst — das ist die
# sichere Ausfallrichtung fuer ein Werkzeug, das Dateien ueberschreibt.
TEXT_ENDUNGEN = {
    ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".sql", ".yaml",
    ".yml", ".sh", ".py", ".css", ".html", ".txt", ".example", ".conf",
    ".editorconfig", ".gitignore", ".dockerignore", ".nvmrc",
}


def ist_text(pfad: Path) -> bool:
    if pfad.suffix in TEXT_ENDUNGEN:
        return True
    # Punktdateien ohne Endung (.gitignore, .nvmrc …) tragen ihren Namen als
    # `suffix`; Dateien ganz ohne Endung werden nicht angefasst.
    return pfad.name in TEXT_ENDUNGEN


def lade_manifest(manifest: Path) -> tuple[list[tuple[str, str]], list[str]]:
    ersetzungen: list[tuple[str, str]] = []
    verbote: list[str] = []

    for nummer, rohzeile in enumerate(manifest.read_text(encoding="utf-8").splitlines(), start=1):
        zeile = rohzeile.rstrip("\n")
        if not zeile.strip() or zeile.lstrip().startswith("#"):
            continue
        if zeile.startswith("!"):
            verbote.append(zeile[1:].strip())
            continue
        if "\t" not in zeile:
            raise SystemExit(
                f"FEHLER: {manifest}:{nummer} — Ersetzungszeile ohne TAB-Trenner:\n  {zeile}"
            )
        alt, neu = zeile.split("\t", 1)
        # `\n` ist die einzige Escape-Sequenz: Sie erlaubt Wendungen, die im
        # Fliesstext ueber zwei Zeilen umgebrochen sind. Alles andere bleibt
        # woertlich — ein Manifest mit vollem Escape-Vokabular waere wieder
        # eine kleine Sprache, und die will hier niemand pflegen.
        alt = alt.strip().replace("\\n", "\n")
        neu = neu.strip().replace("\\n", "\n")
        if not alt:
            raise SystemExit(f"FEHLER: {manifest}:{nummer} — leerer Suchbegriff.")
        ersetzungen.append((alt, neu))

    return ersetzungen, verbote


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Aufruf: redigiere.py <manifest> <baum>")

    manifest = Path(sys.argv[1])
    baum = Path(sys.argv[2])

    if not manifest.is_file():
        raise SystemExit(f"FEHLER: Manifest nicht gefunden: {manifest}")
    if not baum.is_dir():
        raise SystemExit(f"FEHLER: Export-Baum nicht gefunden: {baum}")

    ersetzungen, verbote = lade_manifest(manifest)

    # Laengere Suchbegriffe zuerst: Sonst ersetzt ein kurzer Begriff einen
    # Teil eines laengeren, und der laengere trifft danach nicht mehr.
    ersetzungen.sort(key=lambda paar: len(paar[0]), reverse=True)

    geaenderte_dateien = 0
    ersetzungen_gesamt = 0

    for pfad in baum.rglob("*"):
        if not pfad.is_file() or not ist_text(pfad):
            continue
        try:
            inhalt = pfad.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        neuer_inhalt = inhalt
        for alt, neu in ersetzungen:
            if alt in neuer_inhalt:
                ersetzungen_gesamt += neuer_inhalt.count(alt)
                neuer_inhalt = neuer_inhalt.replace(alt, neu)

        if neuer_inhalt != inhalt:
            pfad.write_text(neuer_inhalt, encoding="utf-8")
            geaenderte_dateien += 1

    print(f"==> {ersetzungen_gesamt} Ersetzung(en) in {geaenderte_dateien} Datei(en).")

    # Zweite Linie.
    treffer: list[str] = []
    for begriff in verbote:
        if not begriff:
            continue
        for pfad in baum.rglob("*"):
            if not pfad.is_file() or not ist_text(pfad):
                continue
            try:
                inhalt = pfad.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if begriff in inhalt:
                for nummer, zeile in enumerate(inhalt.splitlines(), start=1):
                    if begriff in zeile:
                        treffer.append(f"  {pfad.relative_to(baum)}:{nummer}: {zeile.strip()[:120]}")

    if treffer:
        print("FEHLER: Verbotsbegriff(e) stehen nach der Redaktion noch im Export:", file=sys.stderr)
        for zeile in treffer:
            print(zeile, file=sys.stderr)
        return 1

    print(f"==> OK: keiner der {len(verbote)} Verbotsbegriffe steht noch im Export.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
