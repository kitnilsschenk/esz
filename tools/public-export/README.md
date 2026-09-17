# Public-Export-Exclude-Manifest

Zweck: `exclude.txt` in diesem Verzeichnis ist die **einzige Quelle der
Wahrheit** dafür, welche Pfade beim Public-Export aus dem `git archive`-Export
ausgeschlossen werden (`public-export-guard`-CI-Job, siehe
`docs/adr/ADR-0001-projekt-skelett.md`, Abschnitt 10.6). Solange das Repository
privat ist, läuft dieser Job **laufend ab Commit 1** (nicht erst beim
Public-Go) und blockt, sobald ein sensibler oder unklassifizierter Pfad
auftaucht.

## Format

- Eine Zeile = ein Pfad-Glob, relativ zum Repo-Root.
- Kommentarzeilen beginnen mit `#`; Leerzeilen sind erlaubt.
- Verzeichnis-Ausschlüsse enden auf `/` (z. B. `compliance/`).
- Negation (Wieder-Einschluss) mit führendem `!`, ausgewertet in
  Datei-Reihenfolge — analog zur `.gitignore`-Syntax. Beispiel: `.env*`
  schließt alle Env-Dateien aus, `!.env.example` nimmt die Beispieldatei
  wieder auf.
- Jeder **neue Top-Level-Pfad** im Repository muss hier explizit
  klassifiziert werden (entweder als Ausschluss aufgenommen oder bewusst
  weggelassen, weil er öffentlich sein darf). Der Guard-Job blockt bei einem
  unklassifizierten neuen Top-Level-Pfad (ADR-0001, Abschnitt 10.6).

## Zuständigkeit

- Pflege/Erweiterung des Manifests und Implementierung der eigentlichen
  Guard-Logik (CI-Job, `git archive`-Aufruf): `devops-lead` — das ist ein
  Phase-4/AP-Artefakt (CI-Pipeline), **nicht** Teil dieses Manifests selbst.
- Review bei Änderungen, die `compliance/`- oder `.claude/`-Klassifizierung
  betreffen: zwingend `compliance-director` (Auflage 1, ADR-0001 Abschnitt
  6.1) — auch wenn die Datei selbst außerhalb von `compliance/**` liegt und
  technisch von jedem Agenten editierbar ist.
- Der einmalige History-Rewrite beim tatsächlichen Public-Go (`git
  filter-repo`) ist ein separater, hier **nicht** enthaltener Schritt (siehe
  ADR-0001, Abschnitt 10.6, "Einmalig beim Public-Go").

## Referenz

Siehe `docs/adr/ADR-0001-projekt-skelett.md`, Abschnitt 10.6 (Public/Private-Grenze).
