# ADR-0007: Einsparberechnung & BAFA-Nachweis-Export

- **Status:** **proposed** (Phase 1 — Konzept & Vision)
- **Datum:** 2026-08-20
- **Autor:** product-director
- **Reviewer:** ausstehend — `compliance-director` (F6/F7: Export verlässt das System, Pseudonymisierung/Re-ID, Freeze-Aufbewahrung), `technical-director` (F1/F8), `savings-engineer` (F2/F3/F4/F5), `bafa-export-engineer` (F6)
- **Freigabe:** ausstehend (User). **Dieses Dokument entscheidet nichts** — es legt die Fragen vor, die vor Phase 2 beantwortet sein müssen.
- **Bezug:** ADR-0006 (liefert je Monat `R_m`/`A_m` + Qualitätsstufe als append-only Lauf-Artefakte; B7/B12), ADR-0004 (Kern-Datenmodell, `messkonzept_version_energietraeger`), ADR-0005 (Messwert-Qualität), ADR-0009 (Krypto-Shredding — Snapshot überlebt als pseudonymes Nachweisartefakt, Art. 17(3)(b)), ADR-0010 (`klimareferenz` → Re-ID-Vektor)
- **Auflagen:** DE-01, DE-02, DE-03, DE-04, TB-05 (Abgrenzung), TB-06 (Abgrenzung), TB-08; Attribution DWD (`docs/datenquellen.md` DQ-001, A-2); ggf. Primärenergie-/Emissionsfaktoren als neue Fremddatenquelle (A-5)

> **Reifegrad:** Vision-Memo. Keine Migration, kein Code, keine Schema-Skizze. Teil B (Design) folgt in Phase 2 mit `technical-director` + Leads.

---

## 1. Kontext

ADR-0006 endet bei der Aussage: *„Für Endkunde X, Energieträger Y, Monat Z gilt bereinigter Referenzverbrauch `R_m` und Ist-Verbrauch `A_m`, beides mit Qualitätsstufe und auf einen reproduzierbaren, append-only Lauf zurückführbar."* Es rechnet **nie die Einsparung** — die ist definitorisch `Σ_m (R_m − A_m)` und ausdrücklich diesem ADR zugewiesen (ADR-0006 §5, B7, B12.1).

Was heute fehlt, ist genau das, wofür es das Förderprogramm gibt: die **Einsparzahl je Förderjahr** und der **prüffeste Nachweis** darüber an die Bewilligungsbehörde. DE-03 verlangt vier Datenkategorien — **Rohdaten, Baseline-Daten, Einflussgrößen, Einspardaten** — so aufbereitet, dass die Behörde die Einsparberechnung **ohne Nachfragen** nachvollziehen kann. DE-01 verlangt sie in **Tabellenform** (BSCW, auf Anfrage). DE-02/TB-09 verlangen **Vollständigkeit je Förderjahr** (alle Zählerstände, ≥ 1 Wert/Tag). DE-04 verlangt Pseudonymisierung als Standard und ein Ausnahme-Flag für die wissenschaftliche Auswertung.

Die tragende Vorarbeit ist erledigt: die Läufe sind reproduzierbar, append-only und pseudonym; die drei Rohdaten-Snapshots (Messwert-Tage, Klima-Tage, Einflussgrößen-Projektion) sind je Lauf eingefroren und überleben sogar das Krypto-Shredding (ADR-0009). ADR-0007 baut **auf diesen Artefakten auf** und darf nicht daneben eine zweite Wahrheit erzeugen.

## 2. Zielnutzer und Job-to-be-done

- **KIT Consulting als Zuwendungsempfänger** (Betriebs-Team / Nachweis-Verantwortlicher) — **primärer Nutzer**. Erstellt den (Zwischen-)Verwendungsnachweis je Förderjahr und trägt die Rückforderungs-Konsequenz aus TB-08, wenn er unvollständig oder inkonsistent ist.
- **Bewilligungsbehörde (BAFA)** — Empfänger des Exports, aber der **Auftraggeber** dieses ADR: DE-03 (Nachvollziehbarkeit) und TB-08 (Konsistenzprüfung, Stichproben, Rückforderung) definieren die Qualitätslatte.
- **Endkunde / Anschlussnutzer** — **nicht** Nutzer dieses ADR. Die monatliche Nutzerinformation (TB-06) ist ein anderer Zielnutzer, ein anderer JTBD und kundengerichtet statt behördengerichtet — Abgrenzung in §5, Vorschlag eigenes ADR (O4).

**Job-to-be-done:** *„Erzeuge für ein Förderjahr einen prüffesten, vollständigen und reproduzierbaren Verwendungsnachweis, der die Einsparung je Endkunde und Energieträger belegt und alle vier DE-03-Kategorien in Tabellenform enthält — pseudonymisiert, ohne manuelle Nacharbeit, und rückführbar bis auf die eingefrorenen Rohdaten des jeweiligen Laufs."*

**Erfolgsmaßstab (Vorschlag, vor Phase 2 zu bestätigen):**
- **M1** — Ein Förderjahr-Nachweis ist **ohne manuelle Nacharbeit** aus den vorhandenen Lauf-Artefakten erzeugbar (kein Nachrechnen in Excel). Heute nicht möglich.
- **M2** — Der **Vollständigkeits-Preflight** je Förderjahr ist grün (DE-02: alle Zählerstände, ≥ 1 Wert/Tag; nicht-ausweisbare Monate ausgewiesen), **bevor** exportiert werden kann.
- **M3** — Jeder exportierte Einsparwert ist bis auf den eingefrorenen Messwert-/Klima-Snapshot **zurückführbar** — die Reproduzierbarkeit von ADR-0006 reicht bis in den Export durch, nicht nur bis zum Lauf.
- **M4** — Null Rückfragen der Behörde zur Nachvollziehbarkeit der Einsparberechnung im ersten Verwendungsnachweis (DE-03). Zugleich der Grund, warum M3 kein Selbstzweck ist.

## 3. Scope-Vorschlag v1

**Drin:** Einsparung als `Σ_m (R_m − A_m)` je (Endkunde, Energieträger, Förderjahr) **ausschließlich auf Basis bestehender ADR-0006-Läufe** (B7: nie eigene Aggregation auf `measurement`); **Endenergie in kWh je Energieträger** (keine Primärenergie-Verrechnung, keine trägerübergreifende Summe); tabellarischer Export der vier DE-03-Kategorien je Förderjahr, pseudonymisiert; **Vollständigkeits-Preflight** je Förderjahr (DE-02); DE-04-Ausnahme-Flag; ein **Freeze** des eingereichten Stands (die Fähigkeit, „Stand X wurde eingereicht" unveränderlich festzuhalten — die ADR-0006-Läufe sind bereits einfrierbar, hier wird der eingereichte *Satz* fixiert).

**Draußen (spätere Ausbaustufe):** Primärenergiefaktoren und Energieträger-Substitution (F4); Vergütungs-/Bonus-/Verrechnungslogik (F5); Geräteerkennungs-Quoten TB-05 (eigenes ADR); Mehrwertdienste TB-07; monatliche Nutzerinformation TB-06 (O4, eigenes ADR); automatisierte BSCW-Übertragung (O7 — v1 kann kontrollierten Datei-Export + manuellen Upload vorsehen).

**Begründung der Endenergie-Grenze (Vorschlag, kein Fragepunkt für sich):** solange kein Endkunde einen Energieträger *ersetzt* (Öl → Wärmepumpe), ist die Einsparung je Träger in kWh vollständig und ehrlich ausweisbar. Die trägerübergreifende Verrechnung und die Substitution brauchen Primärenergiefaktoren — eine neue, lizenzpflichtige Fremddatenquelle — und werden erst nötig, wenn das Portfolio Substitutionsfälle enthält (F4/O2).

## 3a. Phase-1-Entscheidungen (User, 2026-08-20)

- **O1 — Förderjahr-Definition: noch offen.** Der Schnitt (Kalenderjahr vs.
  Bewilligungszeitraum-Jahr) wird aus dem Zuwendungsbescheid nachgereicht. **Design-Auflage:**
  die Förderjahr-Definition wird **parametrisiert** (Konfiguration/Verfahrensparameter,
  nicht hart verdrahtet), sodass beide Schnitte ohne Code-Änderung tragbar sind. Der
  Vollständigkeits-Preflight (DE-02) liest die Monatsmenge aus dieser Definition.
- **O2 — Energieträger-Substitution: JA, im Portfolio vorhanden.** Damit sind
  Primärenergiefaktoren **real erforderlich** (nicht hypothetisch/spätere Kür).
  **Folgenreiche Konsequenz (in Phase 2 aufzulösen):** ein Förderjahr-Nachweis, der
  Substitutionsfälle enthält, ist in reiner Endenergie **nicht DE-02-vollständig** — Öl-kWh
  und Strom-kWh sind nicht vergleichbar, die *tatsächliche* Einsparung eines Trägerwechsels
  entsteht erst über eine gemeinsame Bezugsgröße (Primärenergie). Zwei Wege, Entscheidung in
  Phase 2: **(a)** die **Primärenergie-Faktorschicht** wird Teil von v1 — dann ist die
  Faktor-Quelle inkl. **Lizenz/Attribution** (neuer Datenlizenz-Fall analog DWD,
  `docs/datenquellen.md`, Auflage A-5) **vor** Nutzung zu klären (neuer offener Punkt
  **O2b**); **(b)** v1 exportiert nur die Nicht-Substitutionsfälle in Endenergie und weist
  Substitutionsfälle als **ausgewiesene, noch nicht nachweisfähige Teilmenge** aus — nur
  tragfähig, wenn kein einzureichendes Förderjahr solche Fälle enthält. Die Endenergie-Naht
  bleibt in jedem Fall die Basis; die Faktorschicht setzt darauf auf (kein Umbau).
- **v1-Scope — bestätigt.** Endenergie-Einsparungskern + BAFA-Export + Freeze wie §3.
  Vergütungs-/Bonuslogik (O3), monatliche Nutzerinformation TB-06 (O4) und automatische
  BSCW-Übertragung (O7) bleiben **außerhalb** von ADR-0007 (spätere/eigene ADRs).

## 4. Zu entscheidende Fragen

### F1 — Ist die Einsparung ein eigener Lauf oder eine Sicht auf die Berechnungsläufe?

- **(a) Sicht/View** über `analytics.laufergebnis` (`Σ R_m − Σ A_m` je Förderjahr, on-read). Billig, immer konsistent mit dem jüngsten Lauf — aber es gibt **keinen zitierbaren Stand**: was eingereicht wurde, ist morgen ein anderer Wert, sobald ein ADR-0006-Lauf nach F7(b) ersetzt wird.
- **(b) Eigener append-only Einspar-Lauf**, analog ADR-0006: er referenziert die verwendeten Berechnungsläufe (deren IDs), friert die Förderjahres-Aggregation, das Faktoren-/Parameterprofil und die Qualitäts-Zusammenfassung ein und ist selbst unveränderlich. Neuberechnung = neuer Lauf mit `ersetzt`-Verweis.
- **(c) Hybrid:** laufende Vorschau als View, aber der Export materialisiert einen unveränderlichen Einspar-Lauf.

**Warum folgenreich:** Die Einreichung (F7) braucht etwas Unveränderliches zum Einfrieren; eine reine View hat keinen Stand. Fällt die Antwort auf (a), ist DE-03/TB-08 nur mit manueller Konservierung je Einreichung erfüllbar — genau der Fehler, den ADR-0006 F6 vermieden hat. *Vorschlag:* (b)/(c), Wiederverwendung des append-only-Musters aus ADR-0006 statt neuer Erfindung.

### F2 — Wie wird das Förderjahr geschnitten und aggregiert?

- **Zuschnitt:** (a) Kalenderjahr; (b) **Bewilligungszeitraum-Jahr** aus dem Zuwendungsbescheid (Start ≠ 1.1.). Diese Wahl ist eine **Faktenfrage an den User** (O1) — sie steht nicht in unserer Hand, sondern im Bescheid, und ein falsch geschnittenes Förderjahr macht jeden Vollständigkeits-Check wertlos.
- **Aggregation:** Summe der Monats-Deltas `Σ_m (R_m − A_m)`. ADR-0006 liefert die Monate bewusst, „nicht separat gerechnet, sonst zwei Wahrheiten" (ADR-0006 §3) — dieser Grundsatz ist hier fortzuführen.
- **Vorzeichen / Mehrverbrauch:** Was, wenn `A_m > R_m` (Mehrverbrauch)? (i) monatsweise verrechnen (negative Deltas mindern die Jahres-Einsparung); (ii) Untergrenze 0 je Monat (Mehrverbrauch zählt nicht als Negativ-Einsparung); (iii) Jahres-Netto. Das ist eine **fachliche/förderrechtliche** Frage, keine Software-Frage — sie entscheidet über die ausgewiesene Einsparung und gehört dem Energieberater/der Bescheidauslegung (O3-nah, → `savings-engineer` + User).

*Vorschlag:* Zuschnitt (b), sobald O1 beantwortet ist; Aggregation als Summe der Monats-Deltas; Vorzeichenregel als expliziten, dokumentierten Lauf-Parameter — **nicht** implizit.

### F3 — Wie geht der Nachweis mit nicht-ausweisbaren Monaten und Datenlücken um?

ADR-0006 B6/B12.4 markiert Monate als `belastbar` / `eingeschraenkt` / `nicht_ausweisbar`, **entfernt sie aber nicht** — die Fachregel für den Förderjahr-Nachweis ist ausdrücklich ADR-0007 zugewiesen.

- **(a) Weglassen** nicht-ausweisbarer Monate — unterschätzt die Einsparung systematisch, macht das Jahr rechnerisch unvollständig, kollidiert mit DE-02 („sämtliche Zählerstände").
- **(b) Ersatz/Hochrechnung** (z. B. aus den belastbaren Monaten oder der Baseline) — schließt die Lücke, ist aber eine **Annahme**, die als solche auszuweisen und der Behörde darzulegen ist (TB-08).
- **(c) Ausweisen mit Kennzeichnung**, Jahr nur bei Unterschreitung einer Mindest-Abdeckung als nicht nachweisbar markieren.

**Warum folgenreich:** DE-02-Vollständigkeit und TB-08-Konsistenz hängen direkt daran; eine falsche Regel führt im Prüfungsfall zu Rückforderung. Die Schwelle „ab wann ist ein *Förderjahr* nicht nachweisbar" ist fachlich zu setzen, nicht zu raten. *Vorschlag:* (b)/(c) mit gekennzeichneter, dokumentierter Ersatzregel; harte Untergrenze fachlich vor Phase 2 (`savings-engineer` + `compliance-director`).

### F4 — Endenergie oder Primärenergie? Und wenn Primärenergie: welche Faktor-Quelle, welche Lizenz?

- **(a) Endenergie in kWh je Energieträger** (v1-Vorschlag). Vollständig und ehrlich, solange kein Träger ersetzt wird; keine neue Datenquelle nötig.
- **(b) Primärenergie** mit Primärenergiefaktoren — nötig für **trägerübergreifende Summen** und **Energieträger-Substitution** (Öl → Strom/Wärmepumpe). Erfordert eine **neue Fremddatenquelle** (Primärenergie-/Emissionsfaktoren, z. B. GEG-Anlage, DIN V 18599, UBA/GEMIS).

**Warum folgenreich:** Jede Faktor-Quelle ist — wie DWD-Klimadaten in ADR-0006 O-B1 — **datenlizenzpflichtig** und attributionspflichtig; A-5 der DWD-Auflage sagt ausdrücklich, dass die Datenlizenz-Regel „spätestens ab der nächsten Fremddatenquelle (Primärenergie-/Emissionsfaktoren)" greift. Faktoren sind zudem **versioniert und zeitpunktbezogen** — sie müssen wie Klimadaten je Lauf eingefroren werden, sonst driftet eine gemeldete Zahl. *Vorschlag:* (a) für v1; (b) als benannte, additive Ausbaustufe, deren Quelle + Lizenz **vor** Nutzung durch `compliance-director` freizugeben ist (O2, Register `docs/datenquellen.md`). **Nicht vorwegentscheiden** — Portfolio-abhängig (Substitutionsfälle?).

### F5 — Gehört die Vergütungs-/Bonus-/Verrechnungslogik in ADR-0007?

Die Studio-Rolle `savings-engineer` nennt „Verrechnungs-/Vergütungslogik, Primärenergiefaktoren, Vergütungsschlüssel/Boni" — das ist ein anderer Gegenstand als der *Nachweis* der Einsparung.

- **(a) In v1 drin** — größerer Scope, hohe fachliche/vertragliche Abhängigkeit (Vergütungssätze, Boni, Deckelungen stehen im Programm/Bescheid, nicht in unserer Hand).
- **(b) Eigenes ADR** — der Nachweis (Einsparzahl + Export) steht für sich; die monetäre Bewertung baut darauf auf.
- **(c) Nur Datengrundlage** — v1 liefert die geprüfte Einsparzahl, die Vergütung rechnet extern.

**Warum folgenreich:** Vergütung ist förderrechtlich und vertraglich, kein reines Software-Thema; eine falsche Zahl hier ist ein unmittelbares Förderrisiko. *Vorschlag:* (b)/(c) — v1 endet bei der ausweisbaren Einsparung; Vergütung ist eine **User-/Scope-Entscheidung** (O3), nicht hier vorwegzunehmen.

### F6 — Export-Form, -Weg und Pseudonymisierung; Verhältnis zu den Lauf-Snapshots

DE-01 verlangt Tabellenform (BSCW, auf Anfrage); DE-03 die vier Kategorien; DE-04 Pseudonymisierung als Standard.

- **Form:** CSV (schlicht, versionsstabil, gut diff-/prüfbar) vs. XLSX (mehrere Blätter je Kategorie, Metablatt) vs. beides. Attributionsvermerk und Änderungsvermerk der DWD-Quelle müssen ins Kopf-/Metablatt jedes Exports mit witterungsbereinigten Werten (`docs/datenquellen.md` A-2) — das ist Definition-of-Done, keine Kür.
- **Rohdaten-Kategorie:** Die DE-03-„Rohdaten" sind **nicht** `measurement.messwert` roh, sondern der bereits je Lauf eingefrorene **Tages-Snapshot** (`analytics.eingang_messwert_tag`) — er ist die reproduzierbare Rohdaten-Grundlage und liegt bereits pseudonym vor (ADR-0006 B7). Der Export liest **nur Lauf-Artefakte** (Ergebnis + drei Snapshots), nie `measurement`/`einfluss` direkt (B7, sonst zweite Wahrheit).
- **Pseudonymisierung:** spaltenscharf, kein Endkunden-Klartext; die Einflussgrößen liegen bereits als pseudonyme Projektion im Lauf-Snapshot (ohne Betroffenen-/Quellen-/Rechtsgrundlagen-Felder, A5).

**Warum folgenreich:** Der Export ist der einzige Pfad, auf dem Daten das System Richtung BAFA verlassen — Form und Pseudonymisierungsschema sind zugleich das Compliance-Nadelöhr. *Vorschlag:* tabellarischer Datei-Export (Format vor Phase 2 mit `bafa-export-engineer`), Rohdaten-Kategorie = Lauf-Snapshots, Pseudonymisierung spaltenscharf und `compliance-director`-abgenommen (Phase 3).

### F7 — Was heißt „eingereichter Stand"? (Freeze — von ADR-0006 ausdrücklich hierher weitergereicht)

ADR-0006 F7 hat die **Unveränderlichkeit der Läufe** gebaut, den **Freeze der Einreichung** aber bewusst ADR-0007 überlassen („dort wird eingereicht").

- **(a) Kein expliziter Freeze** — man exportiert den jeweils aktuellen Stand. Nach Einreichung eines Verwendungsnachweises inakzeptabel: eine spätere Baseline-/Klima-/Messwert-Korrektur (ADR-0006 F7b erzeugt Ersatz-Läufe) ließe den gemeldeten Wert still driften.
- **(b) Einreichungs-Artefakt** — der Export fixiert den Satz verwendeter Lauf-IDs + Aggregationsparameter unveränderlich, mit Zeitpunkt und Ausführendem; eine spätere Korrektur erzeugt eine **neue** Einreichung mit Differenz-Report (Input für die TB-01/TB-08-Darlegungspflicht), verändert die alte nie.

**Warum folgenreich:** Ohne Freeze ist keine belastbare Aussage „das wurde am Datum X eingereicht" möglich, und Korrekturen lassen sich nicht sauber *melden* statt *verschweigen* (TB-08-Rückforderungsrisiko). *Vorschlag:* (b); Aufbewahrung des eingereichten Stands unter Art. 17(3)(b), im Verhältnis zu den Löschfristen O-B4/O-B9 aus ADR-0006 (O6).

### F8 — Wo entstehen die Einspardaten: `analytics` erweitern oder eigener Namensraum?

- **(a) `analytics` erweitern** — die Einspar-/Export-Läufe hängen neben die Berechnungsläufe; ADR-0006 B1 hat das ausdrücklich vorgesehen („ADR-0007 hängt seine Einspar-/Export-Läufe daneben"). Gleicher Grant-/Append-only-/Retention-Zuschnitt, PII-frei/pseudonym.
- **(b) Eigener Namensraum** (z. B. `nachweis`/`export`) — trennt Nachweis-Artefakte von Rechen-Artefakten, kostet aber eine zweite Grant-/Retention-Regelwelt ohne erkennbaren Gewinn, solange beide pseudonym und append-only sind.

**Warum folgenreich:** Namensraum entscheidet über Grants, Retention/Shred-Verhalten und die Least-Privilege-Rollen — nachträglich teuer zu verschieben. *Vorschlag:* (a), Wiederverwendung des `analytics`-Zuschnitts; endgültig `technical-director` + `database-lead` in Phase 2.

## 5. Abgrenzung

**ADR-0006 endet** bei `(R_m, A_m)` je Monat mit Qualitätsstufe und liefert die reproduzierbaren, einfrierbaren Läufe. **ADR-0006 rechnet nie die Einsparung.**

**ADR-0007 beginnt** bei der Differenz `R_m − A_m`: Förderjahres-Zuschnitt und -Aggregation, Umgang mit nicht-ausweisbaren Monaten, (optional) Primärenergie, Pseudonymisierung, Tabellenexport der vier DE-03-Kategorien, Vollständigkeits-Preflight, Einreichungs-Freeze. **ADR-0007 liest ausschließlich Lauf-Artefakte** (`analytics.laufergebnis` + die drei eingefrorenen Snapshots) — nie `measurement.messwert`, nie `einfluss.*`, nie eigene Aggregation (ADR-0006 B7).

**Nicht ADR-0007 (eigene ADRs vorgeschlagen):**
- **Monatliche Nutzerinformation (TB-06)** — anderer Zielnutzer (Endkunde), kundengerichtet, Opt-out-verwaltet; teilt zwar die bereinigten Werte, aber weder Zweck noch Empfänger noch Datenschutzprofil mit dem BAFA-Export (O4).
- **Geräteerkennungs-Quoten (TB-05, 20→40 %)** — eigener Nachweis, eigene Zuordnungslogik, nicht die Einsparrechnung.
- **Vergütungs-/Bonuslogik** — F5, Scope-Entscheidung (O3).

## 6. Risiken

- **R1 — Zweite Wahrheit.** ADR-0007 rechnet am Lauf vorbei (eigene Aggregation auf `measurement`) und liefert eine andere Zahl als der Nachweis. Beherrscht durch die B7-Regel „nur Lauf-Artefakte lesen" (F1/F8).
- **R2 — Stiller Drift des gemeldeten Werts.** Ohne Freeze (F7) ändert eine nachträgliche Baseline-/Klima-/Messwert-Korrektur (ADR-0006 F7b erzeugt Ersatz-Läufe) eine bereits eingereichte Einsparzahl. Nur durch F7(b) beherrschbar.
- **R3 — Lizenz-/Attributionsfalle Primärenergiefaktoren.** Eine Faktor-Quelle ist datenlizenzpflichtig (A-5); ungeprüft eingebunden droht derselbe Fall wie DWD-O-B1. Entschärft nur, indem F4(a) v1 die Quelle vermeidet und (b) nur nach `compliance-director`-Freigabe kommt.
- **R4 — Re-Identifikation kleiner Kohorten.** ADR-0006 hat es ausdrücklich hierher weitergereicht: die eingefrorene `station_ref` ist im pseudonymen Export ein grobes Geolokations-Attribut und bei wenigen Endkunden je Station ein Re-ID-Vektor (`bafa-export-engineer`/`dsgvo-auditor`). Betrifft F6/F9.
- **R5 — Unvollständigkeit zu spät erkannt.** Fehlt der Preflight (M2), fällt DE-02/TB-08-Unvollständigkeit erst der Behörde auf — Konsequenz laut TB-08 ausdrücklich Bescheid-Rücknahme/Rückforderung.
- **R6 — Falsche Vorzeichen-/Lückenregel.** F2 (Mehrverbrauch) und F3 (nicht-ausweisbare Monate) verändern die ausgewiesene Einsparung; jede Regel ist angreifbar, wenn sie nicht fachlich gesetzt und dokumentiert ist.
- **R7 — Scope-Creep Vergütung.** F5 zieht Vergütungs-/Bonuslogik in v1; das ist förderrechtlich/vertraglich und überproportional aufwendig gegenüber dem reinen Nachweis.

## 7. Offene Punkte

- **O1 (User, 2026-08-20 — TEIL-ENTSCHIEDEN):** Förderjahr-Definition noch aus dem Zuwendungsbescheid nachzureichen; **Design parametrisiert** die Definition (§3a), sodass Kalenderjahr und Bewilligungszeitraum-Jahr ohne Code-Änderung tragbar sind. Der exakte Schnitt ist vor der ersten *echten* Nachweis-Erstellung zu setzen, nicht vor Phase 2.
- **O2 (User, 2026-08-20 — ENTSCHIEDEN: JA):** Das Portfolio enthält Energieträger-Substitutionsfälle → **Primärenergiefaktoren sind erforderlich** (§3a). Konsequenz für die DE-02-Vollständigkeit in Phase 2 aufzulösen (Faktorschicht in v1 vs. ausgewiesene Teilmenge). **O2b (neu, `compliance-director`):** Primärenergiefaktor-Quelle inkl. Datenlizenz/Attribution (analog DWD, `docs/datenquellen.md`, A-5) **vor** Nutzung zu klären und zu registrieren.
- **O3 (User / `product-director`, aus F5):** Vergütungs-/Bonus-/Verrechnungslogik — in ADR-0007, eigenes ADR, oder außerhalb des Systems? Scope-Entscheidung vor Phase 2.
- **O4 (`product-director`):** Monatliche Nutzerinformation (TB-06) als **eigenes ADR** bestätigen — Abgrenzung §5.
- **O5 (`compliance-director`, Phase 3):** Pseudonymisierungsschema des Exports, Re-ID-Risiko kleiner Kohorten (R4), DE-04-Ausnahme-Flag „von wissenschaftlicher Auswertung ausgenommen".
- **O6 (`compliance-director` + `retention-engineer`):** Aufbewahrung des eingereichten Freeze-Stands (Art. 17(3)(b)) im Verhältnis zu den offenen Löschfristen O-B4/O-B9 aus ADR-0006.
- **O7 (`product-director` + `integration-engineer`):** BSCW-Übermittlungsweg (DE-01) — automatisierte Anbindung oder kontrollierter Datei-Export + manueller Upload in v1?
- **O8 (außerhalb des Studios):** Wer verantwortet die **fachliche** Richtigkeit der Vorzeichen-/Lücken-/Aggregationsregeln gegenüber der Behörde (Energieberater, Vier-Augen-Prüfung)? Software-Review ersetzt das nicht (analog ADR-0006 O7).

## 8. Compliance-Flags (Benennung; `compliance-director` in Phase 3)

- **Export verlässt das System Richtung BAFA** — Pseudonymisierung ist Standard (DE-04), spaltenscharf, kein Endkunden-Klartext; DE-04-Ausnahme-Flag berücksichtigen (O5).
- **DE-03-Vollständigkeit:** alle vier Kategorien (Rohdaten = Lauf-Snapshot, Baseline, Einflussgrößen = pseudonyme Projektion, Einspardaten) im Export, ohne Nachfragen nachvollziehbar.
- **Attributionspflicht abgeleiteter Werte** (DWD, `docs/datenquellen.md` DQ-001 / A-2): Quellen- **und** Änderungsvermerk im Kopf-/Metablatt jedes Exports mit witterungsbereinigten Werten — Definition-of-Done.
- **Re-Identifikationsrisiko bei kleinen Kohorten** durch eingefrorene `station_ref` (grobe Geolokation) — ADR-0006 hat diesen Punkt ausdrücklich an ADR-0007 weitergereicht (R4/O5).
- **Neue Fremddatenquelle bei Primärenergie** (F4b): Datenlizenz-Regel `.claude/rules/dependencies.md` (A-5) + Registereintrag `docs/datenquellen.md`, `compliance-director`-Freigabe vor Nutzung.
- **Aufbewahrung des Nachweises** unter Art. 17(3)(b) (überlebt Krypto-Shredding als pseudonymes Artefakt, ADR-0009) — Löschfrist offen (O6).

---

> **Nächster Schritt:** Dieses Dokument entscheidet nichts. Vor Phase 2 (Design, `technical-director` + Leads) sind mindestens **O1** (Förderjahr-Definition), **O3** (Vergütungs-Scope) und die Portfolio-Frage **O2** (Substitutionsfälle → Primärenergie ja/nein) durch den User zu klären. F1/F8 (Lauf-Architektur, Namensraum) gehen an `technical-director`; F6/F7 an `compliance-director` (Phase 3).

---

# Teil B — Phase 2 (Design), Struktur-Entscheidungen

- **Status:** **proposed** (unverändert; Teil A bleibt wie oben)
- **Datum:** 2026-08-20 · **Autor:** `technical-director`
- **Gegenstand:** die **Struktur**-Fragen F1 (Lauf vs. Sicht), F6 (Export-Form/-Weg/Pseudonymisierung), F7 (Freeze/Einreichung), F8 (Namensraum) sowie der Vollständigkeits-Preflight (DE-02). **Nicht** Gegenstand: F2 (Vorzeichen/Aggregationsregel), F3 (nicht-ausweisbare Monate), F4b (Primärenergie in v1 ja/nein), F5 (Vergütung) — das entscheidet `savings-engineer` parallel bzw. der User (§3a/O3).
- **Reviewer ausstehend:** `compliance-director` (D6/D7 — Pseudonymisierung, Stationsdarstellung, DE-04-Auslegung, Art.-18-Sperre, Aufbewahrung), `savings-engineer` (Parameter-Schema des Aggregations-Regelwerks, B8-Naht), `bafa-export-engineer` (D5 Dateiformat/Spaltenprofil), `database-lead` (B9 Sizing/Migrationszuschnitt), `access-control-engineer` (B10), `retention-engineer` (B11)
- **Reifegrad:** Design. **Keine Migration, kein Code, keine Policy-Datei-Änderung.** Nächste freie Migrationsnummer: **V0024** (V0022/V0023 sind ADR-0006-Nachtrags-Entwürfe, noch nicht freigegeben).
- **Vom User gesetzt (§3a), hier nicht neu aufgerollt:** v1-Scope = Endenergie-Einsparungskern + BAFA-Export + Freeze; Förderjahr-Definition **parametrisiert** (O1); Substitutionsfälle sind im Portfolio vorhanden (O2); Vergütung (O3), Nutzerinformation (O4) und automatische BSCW-Übertragung (O7) bleiben außerhalb.

## B0. Was Teil B entscheidet

| # | Entscheidung | Kern |
|---|---|---|
| D1 | Einspar-Lauf | **Eigener append-only Nachweis-Lauf** je (Vorhaben, Förderjahr), portfolioweit — F1 = (b), mit Vorschau-Sicht als ausdrücklich **vorläufigem** Nebenweg |
| D2 | Bindung an ADR-0006 | **Monatsscharfe, materialisierte Bindung** an genau einen Berechnungslauf je (Endkunde, Energieträger, Monat) + `bindungs_hash` als Siegel |
| D3 | Namensraum | **Eigener Namensraum `nachweis`** — F8 = (b), bewusste Abweichung von der ADR-0006-B1-Vorwegnahme; Verfahrenskatalog wird dagegen **geteilt** |
| D4 | Preflight | Eigenes append-only Prüf-Artefakt, **fail-closed**: kein Einspar-Lauf ohne grünen Preflight, keine Einreichung ohne einreichbaren Lauf |
| D5 | Export | **Deterministisch gerenderte Tabellen-Dateien + Manifest-Hash**, keine Byte-Ablage in v1; vier DE-03-Kategorien + Metablatt mit DWD-Quellen- **und** Änderungsvermerk |
| D6 | Pseudonymisierung | Spaltenscharfe Positivliste, **exportstabile Pseudonyme** aus einer einzigen, eng gegranteten Brückentabelle; Stationsdarstellung **Default pseudonymisiert** |
| D7 | Einreichung/Freeze | Append-only `einreichung` mit Manifest-Hash; Korrektur = **neue** Einreichung mit `ersetzt`-Verweis + **Differenz-Report**; verdrahtet `analytics.lauf_retention_status.nachweis_gebunden` |
| D8 | Primärenergie | **Additive Naht** (eigener Faktor-Vorrat, eigene Snapshot-Art, eigene Anhang-Tabellen) — der Einspar-Lauf wird dafür **nicht** umgebaut, die Endenergie-Basis bleibt unberührt |

## B1 — D1: Der Einspar-Lauf (F1)

**Entscheidung: (b) eigener append-only Nachweis-Lauf**, `nachweis.einsparlauf`, mit (c) als ausdrücklich nachrangigem Nebenweg (Vorschau-Sicht, s. u.).

**Warum nicht (a) Sicht:** Eine View über `analytics.laufergebnis` hat keinen Stand. Die Einreichung (F7) braucht ein zitierbares Artefakt; ein nach ADR-0006 F7(b) erzeugter Ersatz-Lauf würde den gemeldeten Wert still verschieben (R2). Genau diesen Fehler hat ADR-0006 F6 vermieden — ihn hier zu wiederholen, hieße, die Reproduzierbarkeit am letzten Meter aufzugeben.

**Bezugsobjekt: (Vorhaben, Förderjahr), nicht (Endkunde, Energieträger).** Der Verwendungsnachweis wird als **ein** Vorgang je Förderjahr eingereicht; ein Lauf je Endkunde würde M1 („ohne manuelle Nacharbeit") verfehlen, weil jemand N Läufe zu einem Nachweis zusammenklauben müsste — und die DE-02-Vollständigkeitsaussage („wer war erwartet, wer fehlt") wäre nirgends materialisiert. Die Ergebnisauflösung bleibt trotzdem (Endkunde × Energieträger), eine Zeile je Paar. **Folge, ausdrücklich benannt:** `create:einsparlauf` ist eine **portfolioweite** Aktion ohne Endkunden-Ressourcenbezug — das ABAC-Muster „auflösen über `endkundeId`" trägt hier nicht (s. B10).

**Der Lauf trägt:** Förderjahr-Referenz · `art` (`foerderjahr_nachweis` | `zwischenstand`) · Aggregations-Verfahren + Version + vollständiger Parametersatz (`jsonb`) + `parameter_hash` · Referenz auf den **grünen** Preflight · `bindungs_hash` (Siegel über die Bindungsmenge, D2) · Umfangs-/Vollständigkeits-Kopfzahlen · schlechteste Qualitätsstufe · `ausloeser` · `code_revision` (Git-SHA, forensisch) · `synthetic` · `erstellt_at`/`erstellt_von_sub` · `ersetzt_einsparlauf_id`.

**Append-only, exakt nach dem D1-Muster von ADR-0006:** `REVOKE UPDATE, DELETE ... FROM PUBLIC`, eigener Schema-Owner (nicht `edms_app`), **kein Status und kein `updated_at` am Artefakt** — der Lauf entsteht erst bei erfolgreichem Abschluss in einer Transaktion. Die Job-Steuerung (portfolioweite Läufe sind Langläufer, `.claude/rules/backend-nestjs.md`: keine synchronen Langläufer im Request) lebt getrennt in `nachweis.einsparlauf_auftrag` (mutabel, kein Nachweischarakter). Neuberechnung = **neuer** Lauf mit `ersetzt_einsparlauf_id`; der alte bleibt unangetastet, auch wenn er bereits eingereicht wurde (dann erzwingt D7 zusätzlich den Differenz-Report).

**Vorschau-Sicht (das (c)-Element):** eine Live-Aggregation über die jeweils aktuellen ADR-0006-Läufe, als Betriebsansicht während des Jahres. Sie trägt **immer** `vorlaeufig: true`, hat **keine** Artefakt-ID, ist **nicht** exportierbar und **nicht** einreichbar. Sie darf keine Zahl liefern, die aussieht wie ein Nachweiswert — der Unterschied ist im DTO strukturell (kein `einsparlaufId`), nicht nur ein Label.

**Regelwerk statt Konstanten:** die Vorzeichenregel (F2) und die Lückenregel (F3) sind **explizite Parameter des Laufs**, validiert gegen das `parameter_schema` der Regelwerk-Version — nie implizit im Code. Damit trägt die Struktur jede Fachwahl von `savings-engineer`, und eine Regeländerung ist wie in ADR-0006 D3 ein Versionssprung mit Golden Vectors, kein normales Deployment.

## B2 — D2: Welche ADR-0006-Läufe der Nachweis bindet, und wie unveränderlich

**Auswahlregel (deterministisch, monatsscharf):** für jedes Paar (Endkunde, Energieträger) im Umfang und **jeden** erwarteten Monat des Förderjahres wird **genau ein** `analytics.berechnungslauf` gebunden — der jüngste (`erstellt_at`), selbst **nicht ersetzte** Lauf, dessen Periode den Monat enthält (die `lauf_aktuell`-Semantik aus ADR-0006 B1, hier auf Monatsebene angewandt).

**Mehrdeutigkeit ist real** (ein Jahreslauf und ein späterer Nachlauf über einen Teilzeitraum sind **beide** nicht-ersetzt, weil `ersetzt_lauf_id` unterschiedliche Perioden nicht sauber überdecken kann) und wird nicht wegdefiniert:
- ≥ 2 Kandidaten mit **identischen** `referenz_kwh`/`ist_kwh` → Auswahl nach der Regel oben, Preflight-Befund der Schwere `warnung`, Ausweis im Metablatt.
- ≥ 2 Kandidaten mit **abweichenden** Werten → **Blocker** (fail-closed). Das ist ein echter Widerspruch in der Rechenhistorie; ihn stillschweigend nach `erstellt_at` aufzulösen, wäre genau das „nimm die erste", das ADR-0006 D4 bereits verboten hat.
- 0 Kandidaten → Blocker (fehlender Monat, DE-02).

**Unveränderlich festgehalten wird die Auswahl auf zwei Ebenen:**
1. **Materialisierte Bindung** `nachweis.einsparlauf_bindung` — eine append-only Zeile je (Einspar-Lauf, Endkunde, Energieträger, Monat) mit `berechnungslauf_id`, den **eingefrorenen** Monatswerten (`referenz_kwh`, `ist_kwh` — Kopie aus `analytics.laufergebnis`), der Qualitätsstufe, der `behandlung` (`gemessen` | `ersatz` | `ausgeschlossen`, gesetzt durch die Lückenregel) und dem daraus abgeleiteten `delta_kwh` / `delta_ausgewiesen_kwh`. Die Kopie ist **kein** Bruch von B7 (es wird nichts neu aggregiert, nur die gelesene Lauf-Zeile mitgeführt) und ist nötig, weil die Behandlungs-/Vorzeichenregel abgeleitete Größen erzeugt, die im ADR-0006-Lauf definitionsgemäß nicht existieren.
2. **Siegel** `einsparlauf.bindungs_hash` — SHA-256 über die kanonisch geordnete Menge `(endkunde_id, energietraeger, monat, berechnungslauf_id, parameter_hash, rohdaten_hash, referenz_kwh, ist_kwh)`. Exakt die Rolle, die `rohdaten_hash` in ADR-0006 B2.3 spielt: **Erkennungsmittel**. Rekonstruktionsmittel ist die Bindungstabelle selbst plus die dahinter unveränderten Lauf-Artefakte. Dass `rohdaten_hash` und `parameter_hash` in das Siegel eingehen, verkettet den Nachweis bis auf die eingefrorenen Rohdaten durch — das ist M3, in einer Zahl.

**B7 bleibt unangetastet:** ADR-0007 liest ausschließlich Lauf-Artefakte (`berechnungslauf`, `laufergebnis`, die drei `eingang_*`-Snapshots). Kein Lesepfad nach `measurement.*` oder `einfluss.*`, keine eigene Aggregation — auch nicht „nur für den Export".

## B3 — D3: Namensraum `nachweis` (F8)

**Entscheidung: (b) eigener Namensraum `nachweis`** — bewusste Abweichung von der ADR-0006-B1-Vorwegnahme („ADR-0007 hängt seine Einspar-/Export-Läufe daneben"). Diese Vorwegnahme stammt aus der Zeit **vor** den Auflagen A6/A7; sie hat den entscheidenden Unterschied noch nicht gekannt.

**Das PII-Argument trifft hier nicht** — anders als bei `einfluss` (Klartext-PII, ADR-0006 D8.1) ist im Nachweis alles pseudonym. Die Trennung wird trotzdem gezogen, aus drei Gründen:

1. **Unterschiedliche Löschuhren, und der Fehlgriff wäre irreversibel.** `analytics`-Läufe sind grundsätzlich löschbar — `edms_retention` hat DELETE auf alle sieben Nachweis-/Snapshot-Tabellen (V0019). Nachweis-Artefakte sind an die **Einreichung** gebunden (Art. 17(3)(b), BAFA-Nachweispflicht) und dürfen von einem Analytics-Retention-Lauf **nie** erfasst werden. Innerhalb von `analytics` wäre das nur durch tabellengenaue Grant-Disziplin gesichert — und `GRANT ... ON ALL TABLES IN SCHEMA` ist das häufigste reale Least-Privilege-Leck im Ops-Alltag. Getrennte Schemata machen diesen Fehlgriff folgenlos.
2. **Getrennte Leserollen mit unterschiedlichem Schutzniveau.** Die Einreichungs-Metadaten (wann, von wem, an wen, welcher Hash) sollen dem `compliance-auditor` **offenstehen** — sie sind sein Prüfgegenstand. Die Export-Dateien (Tagesdetails, Einflussgrößen-Projektion) sollen ihm **verschlossen** bleiben. Zwei gegenläufige Schutzniveaus in einem Schema mit einheitlichem Owner sind mühsam; als eigener Namensraum sind sie sauber schneidbar (B11).
3. **Semantische Grenze:** `analytics` = Rechenartefakte (reproduzierbar, ersetzbar, löschbar). `nachweis` = behördengerichtete Artefakte (eingereicht, unwiderruflich, aufbewahrungspflichtig). Das ist dieselbe Logik, die `device` und `einfluss` je einen eigenen Namensraum gegeben hat: unterschiedlicher Lebenszyklus, unterschiedlicher Grant-Zuschnitt.

**Was ausdrücklich NICHT dupliziert wird — der Verfahrenskatalog.** `analytics.verfahren` / `analytics.verfahren_version` werden **geteilt** und um neue `art`-Werte erweitert (`einsparaggregation`, `nachweispruefung`, `exportschema`; heute `CHECK (art IN ('bereinigung','baseline'))` → additive Migration). Begründung: der Katalog ist genau für diesen Zweck gebaut (SCD2, `parameter_schema`, `golden_vectors`, Pflege ausschließlich per Migration, `REVOKE UPDATE, DELETE`, keine INSERT-Rolle zur Laufzeit), er ist **ewig gültig und wird nie gelöscht** (V0019 D-A6-RETENTION sagt das ausdrücklich) — das Trennungsargument oben trifft ihn also nicht. Und der bestehende Golden-Vector-Bootstrap-Guard (`golden-vector-bootstrap.service.ts`, fail-closed) deckt die neuen Vorschriften dadurch **automatisch** mit ab, statt dass ein zweiter Guard entsteht, den man vergessen kann. Artefakte getrennt, Katalog geteilt.

**Cross-Schema-FKs** `nachweis.* → analytics.berechnungslauf(id)` und `→ energy.endkunde(id)` sind zulässig und gewollt (Postgres kennt keine Schema-Grenze bei FKs); sie sind zugleich der strukturelle Beleg, dass der Nachweis auf den Läufen steht und nicht neben ihnen.

## B4 — D4: Vollständigkeits-Preflight (DE-02, M2)

**Eigenes append-only Prüf-Artefakt** `nachweis.preflight` (Kopf) + `nachweis.preflight_befund` (Zeilen), wiederholbar und idempotent, **vor** und **ohne** Einspar-Lauf ausführbar. Kette, fail-closed in jeder Stufe: **Preflight (grün) → Einspar-Lauf → Export → Einreichung.**

**Erwartete Monate kommen aus der parametrisierten Förderjahr-Definition** (§3a/O1), nie aus dem Kalender und nie aus Code: `nachweis.foerderjahr` trägt `nummer`, `von_monat`, `bis_monat`, `definition_quelle` (`kalenderjahr` | `bewilligungszeitraum`), `bescheid_ref`. Die erwartete Monatsmenge ist die Menge der Monatsersten in `[von_monat, bis_monat]`. Beide Schnitte aus F2 sind damit ohne Code-Änderung tragbar; fehlt die Definition, ist der Preflight rot (`FJ-01`), nicht „12 Monate ab Januar".

**Umfang je Förderjahr** — die zweite Hälfte von DE-02, die leicht übersehen wird: „vollständig" heißt nicht nur „alle Monate", sondern „**alle erwarteten Paare** (Endkunde × Energieträger)". Der Umfang wird aus einer benannten Umfangsregel bestimmt und **materialisiert** (`einsparlauf_ergebnis`, eine Zeile je Paar, auch für ausgeschlossene — mit `status` und `ausschluss_grund_code`). Nur so ist gegenüber der Behörde belegbar, wer erwartet war und warum jemand fehlt.

**Regel-Startsatz (Codes stabil, Schweregrad je Profil-Version parametriert; fachliche Schwellen offen → O-B2):**

| Code | Prüfung | Default-Schwere |
|---|---|---|
| `FJ-01` | Förderjahr-Definition vorhanden, Monatsmenge nicht leer | Blocker |
| `FJ-02` | je erwartetem Paar × Monat genau eine Bindung auflösbar | Blocker |
| `FJ-03` | gebundener Monat `nicht_ausweisbar` ohne dokumentierte Behandlung (F3) | Blocker |
| `FJ-04` | gebundener Monat `eingeschraenkt` bzw. `tage_fehlend > 0` (TB-04/TB-09-Ausweis) | Warnung + Pflichtausweis |
| `FJ-05` | mehrdeutige Lauf-Kandidatenlage mit abweichenden Werten (D2) | Blocker |
| `FJ-06` | Substitutionsfall im Umfang, solange die Faktorschicht nicht aktiv ist (O2/F4b) | Blocker (Weg a) bzw. Warnung + Teilmengen-Ausweis (Weg b) — **Schärfe ist Parameter**, s. B8 |
| `FJ-07` | Endkunde `verarbeitungs_status <> 'aktiv'` (Art.-18-Sperre) im Umfang | Blocker (fail-closed, Analogie zu A10) — Auslegung offen, O-B6 |
| `FJ-08` | Attributions-Vorbedingung: DWD-Quellenvermerk trägt noch den Platzhalter-Marker (`docs/datenquellen.md` A-1) | Blocker |
| `FJ-09` | Lauf/Umfang enthält synthetische Daten (`synthetic`) | Blocker für `art=foerderjahr_nachweis` |

`FJ-08` verdient eine eigene Bemerkung: damit wird die Auflage A-1 aus ADR-0006 O-B1 **strukturell** statt prozessual durchgesetzt — solange der wörtliche DWD-Vermerk nicht eingesetzt ist, kann kein einreichbarer Nachweis entstehen. Eine Auflage, die nur in einem Kommentar steht, ist irgendwann keine.

**„Grün" heißt: null Blocker.** Warnungen sind zulässig, aber **vollständig im Metablatt auszuweisen** — ein Nachweis mit verschwiegenen Einschränkungen ist unter TB-08 schlechter als einer mit ausgewiesenen. Ein `einsparlauf` mit `art=foerderjahr_nachweis` verlangt einen grünen Preflight desselben Umfangs; `art=zwischenstand` darf auf einem roten Preflight aufsetzen, ist dafür aber **nicht einreichbar** (D7). Das löst den Zwischenverwendungsnachweis-Fall, ohne fail-closed aufzuweichen: einreichbar ist nur, was grün ist.

**Befunde sind PII- und wertfrei:** ein Befund trägt Regel-Code, Paar-Referenz (Pseudonyme), Monat, Schwere und eine **klassierte** Kennzahl (z. B. Abdeckungsklasse), niemals kWh-Mengen (B12.5-Muster `ueberschreitung_klasse`).

## B5 — D5: Export-Artefakt (F6 — Form und Weg)

**Form: kanonischer CSV-Satz, eine Datei je Kategorie-Teil, plus Metablatt, plus Manifest.** CSV ist die Nachweisgrundlage, weil es zeilen- und byteweise prüfbar, diff-fähig und **deterministisch hashbar** ist. Eine XLSX-Beilage (ein Blatt je Datei, aus demselben Renderer, ohne eigenen Rechenschritt) ist als Empfänger-Bequemlichkeit vorgesehen, aber **nie** die Nachweisgrundlage — XLSX ist ein ZIP mit eingebetteten Zeitstempeln und damit nicht bit-stabil. Zeichensatz, Trennzeichen und Dezimalkonvention sind Empfängerfrage → **O-B8** (Empfehlung: UTF-8, RFC 4180, Punkt als Dezimaltrenner, ISO-8601-Daten, UTC mit `Z` — und die XLSX-Beilage genau deshalb, weil sie das deutsche Excel-Komma-Problem gar nicht erst erzeugt).

**Kategorien (DE-03) und ihre Quelle — ausschließlich Lauf-Artefakte (B7):**

| Kategorie | Datei(en) | Quelle |
|---|---|---|
| `rohdaten` | `rohdaten_messwert_tag` | `analytics.eingang_messwert_tag` der gebundenen Läufe — **nicht** `measurement.messwert` |
| `baseline` | `baseline_lauf`, `baseline_klima_tag` | `analytics.berechnungslauf` (B_a, g, GTZ_base, GTZ_norm, B_norm, Verfahren + Version + Parameter) und `analytics.eingang_klima_tag` (Bereinigungsgrundlage) |
| `einflussgroessen` | `einflussgroessen_intervall` | `analytics.eingang_einflussgroesse` — die **pseudonyme Projektion** (A5), nie `einfluss.*` |
| `einspardaten` | `einspardaten_monat`, `einspardaten_jahr` | `nachweis.einsparlauf_bindung` / `nachweis.einsparlauf_ergebnis` |
| `meta` | `metablatt`, `manifest` | s. u. |

**Metablatt — Definition of Done, nicht Kür.** Enthält: Förderjahr-Definition und -Quelle; Aggregations-Verfahren + Version + vollständiger Parametersatz (Vorzeichen-/Lückenregel im Klartext benannt); Liste der gebundenen Berechnungsläufe mit `parameter_hash`/`rohdaten_hash`; `bindungs_hash`; Preflight-Ergebnis inkl. **aller** Warnungen; Pseudonymisierungsprofil (welche Spalte wurde wie ersetzt); Erzeugungszeitpunkt (UTC), `export_schema_version`, Renderer-Revision; **DWD-Quellenvermerk und Änderungsvermerk** (`docs/datenquellen.md` DQ-001, Auflage A-2). Beide DWD-Texte werden **aus der bestehenden zentralen Konstante** `src/backend/src/berechnung/klima/dwd-quellenvermerk.const.ts` referenziert — der Änderungsvermerk („Daten verändert: Aggregation zu Gradtagzahlen nach VDI 3807") ist dort heute **noch nicht** hinterlegt und wird als zweites Feld derselben Konstante ergänzt, **nicht** als zweite Textstelle im Export-Renderer (`.claude/rules/dependencies.md`: „kein Duplizieren von Vermerkstexten").

**Determinismus und Ablage — die Bytes werden nicht gespeichert.** Der Renderer ist deterministisch (feste Spaltenfolge, feste Sortierung, feste Zahl-/Datumsformatierung, keine Uhrzeit im Dateiinhalt außer den eingefrorenen Feldern des Metablatts). Persistiert werden nur **Metadaten und Hashes**: `nachweis.export` (Kopf, `manifest_hash`) + `nachweis.export_datei` (Dateiname, Kategorie, Zeilenzahl, `datei_hash`). Das Manifest ist die Hash-Liste über die geordneten Dateien.
- **Warum keine Byte-Ablage:** die Datei ist aus dem eingefrorenen Einspar-Lauf **bit-identisch reproduzierbar**; ein Objektspeicher wäre ein **neues Drittsystem** (MinIO/S3 ist im Dev-Stack bewusst nicht enthalten) und damit ADR- und Security-Review-pflichtig — für einen Nutzen, den der Hash bereits liefert. Ein DB-BLOB scheidet ohnehin aus (Studio-Heuristik: nie DB-BLOBs > 1 MB).
- **Die Kontrolle, die das trägt:** der Download-Endpoint rendert neu und **verifiziert vor der Auslieferung** `datei_hash`/`manifest_hash` gegen das Artefakt. Abweichung → **keine Auslieferung**, Fehler, Audit-Event. Damit ist „die Datei driftet unbemerkt" strukturell ausgeschlossen statt organisatorisch gehofft.
- **Renderer-Drift** wird wie eine Formeländerung behandelt: `export_schema_version` ist eine Version im geteilten Verfahrenskatalog (`art='exportschema'`, mit Spaltenprofil im `parameter_schema` und Golden-Export-Fixtures in `golden_vectors`). Alte Versionen bleiben im Code lieferbar — sonst wäre eine zwei Jahre alte Einreichung nicht mehr ausdruckbar.
- **Offener Punkt O-B10:** ob zusätzlich die Bytes abgelegt werden sollen (Objektspeicher-ADR). Meine Empfehlung: nein, in v1.

**Weg (O7) — v1-Empfehlung: kontrollierter Datei-Export + manueller Upload ins BSCW.** DE-01 sagt „nur auf Anfrage"; ein automatisierter Dauer-Push widerspricht dem Merkblatt-Geist, und eine BSCW-Integration wäre ein weiteres Drittsystem mit Credential-Verwaltung für ein bis zwei Übermittlungen pro Jahr. Der Anlass wird stattdessen am Artefakt geführt (`einreichung.anlass ∈ {verwendungsnachweis, zwischennachweis, anfrage_bafa, stichprobe}` + `anfrage_ref` = Aktenzeichen) — damit ist DE-01 („nur auf Anfrage") belegbar, statt nur behauptet. Entscheidung bleibt beim `product-director` (O7 → O-B9).

## B6 — D6: Pseudonymisierung des Exports (DE-04, R4)

**Spaltenscharfe Positivliste je Datei** — der Renderer schreibt ausschließlich Spalten, die im `spaltenprofil` der `export_schema_version` stehen. Kein `SELECT *`, keine „durchgereichten" Zusatzfelder. Was nicht im Profil steht, kann das System nicht verlassen.

**Exportstabile Pseudonyme statt interner IDs.** Endkunden erscheinen als `EK-<lfd>`, Systeme/Messkanäle analog. Vergabe einmalig bei Erstexport, danach unveränderlich, in **einer** Brückentabelle `nachweis.export_pseudonym`. Warum nicht die internen UUIDs (die sind schließlich schon pseudonym): sie sind systemweit korrelierbar und tauchen in Tickets, Logs und Support-Vorgängen auf — ein Export ist der falsche Ort, sie nach außen zu tragen. Warum keine HMAC-Ableitung: die bräuchte Schlüsselmanagement und wäre bei Schlüsselverlust nicht mehr reproduzierbar. Warum **stabil** über Förderjahre: TB-08 erlaubt der Behörde Stichproben und Zeitvergleiche; jährlich neu gewürfelte Pseudonyme würden das unmöglich machen und wären als Verschleierung lesbar.
> Die Brückentabelle ist die **einzige** Re-Identifikationsbrücke im Exportpfad und bekommt entsprechend den engsten Grant-Zuschnitt (B11): Schreib-/Lesezugriff nur für die Renderer-Rolle, **kein** SELECT für die Nachweis-Leserolle, **nie** für den Auditor. Und: Pseudonym und `endkunde_id` dürfen **niemals gemeinsam** in einem Audit-Kontext erscheinen (B10, Verbotsliste) — das wäre die Brücke im Log.

**Stationsdarstellung (R4, von ADR-0006 O-B1 ausdrücklich hierher gereicht):** `station_ref` ist im pseudonymisierten Export ein grobes Geolokationsattribut und bei wenigen Endkunden je Station ein Re-ID-Vektor. **Entscheidung: eigenes Exportfeld mit Default `pseudonymisiert`** (`ST-<lfd>`); die Klima-Tageswerte werden vollständig mitgeliefert, die Behörde kann die Gradtagzahlen also nachrechnen, ohne den Ort zu kennen. Umschaltung auf Klarnamen ist möglich, aber nur als dokumentierte, auditierte Freigabe (Feld `station_darstellung` am Export-Artefakt, im Metablatt ausgewiesen). Der datenschutzfreundliche Default folgt Art. 25(2); ob die Behörde für DE-03 den Klarnamen braucht, ist eine Compliance-/Fachfrage → **O-B4**.

**DE-04-Ausnahme-Flag — Auslegung (bestätigungsbedürftig, O-B5):** `vonWissAuswertungAusgenommen` bedeutet „von der **wissenschaftlichen Auswertung** ausgenommen", nicht „vom Verwendungsnachweis ausgenommen" — für diese Endkunden wird die Förderung ja gerade beansprucht. Struktur daher: im Förderjahr-Nachweis werden sie **geführt und als ausgenommen gekennzeichnet** (eigene Spalte, damit die Behörde sie aus der Auswertung nehmen kann); in einem **wissenschaftlichen bzw. Stichproben-Auszug** werden sie **ausgeschlossen** (fail-closed, Ausschluss im Metablatt gezählt ausgewiesen). Das ist die einzige Lesart, die DE-04 und DE-02 gleichzeitig erfüllt — Bestätigung durch `compliance-director`.

**Was den Export nie erreicht:** Klartext-Bezeichnungen und Adressen (`identity`), DevEUIs und Geräte-Zuordnungen, `einfluss.*`-Verwaltungsfelder (Betroffener, Quelle, Rechtsgrundlage, Anlass — A5), Bearbeiter-`sub`s, interne UUIDs außerhalb der Bindungs-Nachweisspalten.

## B7 — D7: Einreichung und Freeze (F7)

**Entscheidung: (b) Einreichungs-Artefakt**, `nachweis.einreichung`, append-only.

**„Stand X wurde am Datum Y eingereicht" heißt konkret:** eine Zeile mit `einsparlauf_id` (der eingefrorene Stand), `export_id` + `manifest_hash` (die exakten Bytes), `art`/`anlass` + `anfrage_ref`, `uebermittlungsweg` (`bscw_manuell` | `email_geschuetzt` | `api`), `empfaenger`, `uebermittelt_at`, `eingereicht_von_sub`, optional `beleg_ref` (Slot, kein FK — analog `baseline_beleg_ref`). **Ehrlichkeitsklausel, die ins ADR gehört:** bei manuellem Upload bezeugt das System die **Erklärung des Bedieners**, nicht den Empfang durch die Behörde. Das Artefakt heißt deshalb „vermerkt", nicht „zugestellt", und der Beleg-Slot ist die Stelle für eine Empfangsbestätigung.

**Fail-closed-Vorbedingungen:** nur `art=foerderjahr_nachweis` mit grünem Preflight ist einreichbar; `synthetic=true` ist niemals einreichbar (Backstop als `BEFORE INSERT`-Trigger, Präzedenz V0023 — die App-Prüfung allein wäre wieder ein P4-Fall).

**Verdrahtung mit `analytics.lauf_retention_status.nachweis_gebunden`** (das Flag existiert seit V0019 genau dafür):
- Gesetzt wird es **bei der Erstellung des Einspar-Laufs**, nicht erst bei der Einreichung — schon der Einspar-Lauf ist ein zitierbares Artefakt, und seine Bausteine dürfen ab dann nicht mehr unter ihm weggelöscht werden. Gleichzeitig `gebunden_at` und `nachweis_referenz = 'einsparlauf:<uuid>'`.
- Das Flag ist **monoton**: nie zurück auf `false`, auch nicht, wenn der Einspar-Lauf später ersetzt wird — der ersetzte Lauf bleibt Teil der Nachweishistorie und muss belegbar bleiben.
- `nachweis_referenz` ist ein einzelner Text-Slot und trägt daher die **erste** Bindung; ein Berechnungslauf kann in mehreren Einspar-Läufen gebunden sein. Die maßgebliche, vollständige n:m-Wahrheit ist `nachweis.einsparlauf_bindung`. Das wird hier ausdrücklich festgehalten, damit niemand den Slot später für eine Vollständigkeitsaussage hält.
- `legal_hold` bleibt unberührt reserviert für laufende Prüfungen (V0019) — die Nachweisbindung ist kein Hold.

**Nachträgliche Korrektur — nie stilles Überschreiben:**
1. Neuer Einspar-Lauf mit `ersetzt_einsparlauf_id` (typischer Auslöser: ADR-0006 F7(b)-Ersatzlauf nach Messwert-Korrektur oder DWD-Revision).
2. Neuer Export.
3. Neue `einreichung` mit `ersetzt_einreichung_id` und `korrektur_grund_code` aus geschlossener Liste (`messwert_korrektur`, `klima_revision`, `baseline_korrektur`, `einflussgroesse_korrektur`, `verfahren_version_neu`, `parameter_korrektur`, `foerderjahr_definition_geaendert`, `sonstige`).
4. **Differenz-Report** `nachweis.einreichung_differenz` — je (Endkunde, Energieträger [, Monat]) `wert_alt`, `wert_neu`, `delta`, `ursache_code`. Er ist **Bestandteil des Export-Bündels** der Korrektur-Einreichung (eigene Datei in Kategorie `einspardaten`), weil TB-01/TB-08 die Darlegung verlangen — eine Korrektur, die man selbst meldet, ist ein anderer Vorgang als eine, die die Behörde findet.
Die alte Einreichung bleibt inhaltlich unangetastet und behält ihren Manifest-Hash. „Aktuell gültig" ist auch hier keine Spalte, sondern die Anti-Join-Sicht auf nicht-ersetzte Einreichungen.

## B8 — D8: Primärenergie-Faktorschicht als additive Naht (F4b — **nicht** hier entschieden)

`savings-engineer` entscheidet parallel, ob die Faktorschicht Teil von v1 wird (Weg a) oder Substitutionsfälle als ausgewiesene, noch nicht nachweisfähige Teilmenge separiert werden (Weg b, §3a/O2). **Beide Wege müssen ohne Umbau tragen** — deshalb ist die Naht hier benannt, nicht gebaut:

**Andockstellen (alle additiv, keine Änderung an `einsparlauf`/`einsparlauf_bindung`/`einsparlauf_ergebnis`):**
1. **Faktor-Vorrat:** `nachweis.energiefaktor` — laufender Vorrat mit **Revisionsachse**, exakt das Muster von `analytics.klima_tag`: `(quelle_code, faktor_art, energietraeger, gueltig_ab, gueltig_bis, revision)` PK-artig, plus `wert`, `einheit`, `quelle_version`, `lizenz_kennung`, `abgerufen_at`. Append-only, nie überschreiben — Faktorsätze werden von ihren Herausgebern revidiert, genau wie Wetterdaten.
2. **Vierte Snapshot-Art, je Lauf eingefroren:** `nachweis.eingang_snapshot` (`art='energiefaktor'`, content-addressed mit `inhalt_hash`) + `nachweis.eingang_energiefaktor` — bewusst im `nachweis`-Schema und nicht als vierter `art`-Wert in `analytics.eingang_snapshot`, weil das Nachweis-Modul sonst schreibend in `analytics` greifen müsste (Grant-Kreuzung, B11). **Faktoren werden je Lauf eingefroren wie Klimadaten** — ein nicht eingefrorener Faktor lässt eine bereits gemeldete Zahl driften (dasselbe R2, nur mit anderer Quelle).
3. **Anhang statt Spalten:** `nachweis.einsparlauf_faktorbezug` (1:0..1 zum Lauf: `faktor_snapshot_id`, `faktor_profil_code`, `faktor_profil_version`) und `nachweis.einsparlauf_ergebnis_primaerenergie` (je Paar bzw. je Endkunde: `einsparung_kwh_primaerenergie`, trägerübergreifende Summe). Damit bleibt das v1-Artefakt bitgleich, auch wenn die Faktorschicht später kommt — dasselbe Muster, mit dem `lauf_retention_status` das ADR-0006-Nachweisartefakt statusfrei hält.
4. **Export:** neue Dateien `baseline_energiefaktor` (Kategorie `baseline`, die Faktoren sind Berechnungsgrundlage) und `einspardaten_primaerenergie` (Kategorie `einspardaten`) — plus **Sprung der `export_schema_version`**, alte Version bleibt lieferbar.
5. **Preflight:** `FJ-06` wechselt die Schärfe (Blocker → Warnung + Teilmengen-Ausweis) und `FJ-08` prüft zusätzlich den Quellenvermerk der Faktorquelle auf Platzhalter-Marker.

**Die Endenergie-Basis bleibt davon unberührt.** `R_m`, `A_m`, `delta_kwh` und `einsparung_kwh_endenergie` sind und bleiben Endenergie je Energieträger — die geprüfte, gemessene Zahl. Die Faktorschicht erzeugt **zusätzliche**, abgeleitete Größen, sie ersetzt keine. Wird ein Faktorsatz später revidiert, ändert das die Primärenergie-Ausweisung, nicht die Endenergie-Nachweiskette.

**Lizenz/Attribution (O2b):** jede Faktorquelle ist ein neuer Datenlizenz-Fall (`.claude/rules/dependencies.md`, Abschnitt „Datenlizenzen", Auflage A-5). Vor Nutzung: Registereintrag `docs/datenquellen.md` (DQ-002), wörtlicher Quellenvermerk als **eine** zentrale Konstante analog `DWD_QUELLENVERMERK`, `compliance-director`-Freigabe. Ohne Registereintrag kein Faktor-Import — dieselbe Härte wie `FJ-08`.

## B9 — Schema-Skizze (DDL-nah, **keine Migration**)

```sql
CREATE SCHEMA nachweis;   -- pseudonym, PII-frei; FKs nach energy/analytics zulaessig.
                          -- Lebenszyklus: eingereicht/unwiderruflich/aufbewahrungspflichtig (D3).

-- Additiv in analytics (D3, geteilter Katalog): CHECK-Erweiterung
--   ck_verfahren_art -> ('bereinigung','baseline','einsparaggregation',
--                        'nachweispruefung','exportschema')
-- Neue Katalogzeilen (verfahren/verfahren_version) NUR per Migration, wie B3.

CREATE TABLE nachweis.foerderjahr (               -- O1: parametrisiert, nie hart verdrahtet
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,                    -- z. B. 'FJ-2027'
    vorhaben_ref text NOT NULL,                   -- Aktenzeichen/Bescheid-Bezug (Slot, kein FK)
    nummer int NOT NULL,                          -- Projektjahr 1..5 (TB-05-kompatibel)
    von_monat date NOT NULL, bis_monat date NOT NULL,   -- Monatserste
    definition_quelle text NOT NULL,              -- kalenderjahr|bewilligungszeitraum
    bescheid_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (von_monat = date_trunc('month', von_monat)::date),
    CHECK (bis_monat = date_trunc('month', bis_monat)::date AND bis_monat >= von_monat),
    CHECK (definition_quelle IN ('kalenderjahr','bewilligungszeitraum'))
);

CREATE TABLE nachweis.preflight (                 -- D4, append-only Pruef-Artefakt
    id uuid PRIMARY KEY,
    foerderjahr_id uuid NOT NULL REFERENCES nachweis.foerderjahr(id),
    profil_code text NOT NULL, profil_version int NOT NULL,   -- analytics.verfahren_version (art='nachweispruefung')
    ergebnis text NOT NULL,                       -- gruen|rot
    blocker_anzahl int NOT NULL, warnung_anzahl int NOT NULL, hinweis_anzahl int NOT NULL,
    umfang_paare_anzahl int NOT NULL, monate_erwartet int NOT NULL,
    synthetic boolean NOT NULL,
    ausgefuehrt_at timestamptz NOT NULL DEFAULT now(), ausgefuehrt_von_sub text NOT NULL,
    FOREIGN KEY (profil_code, profil_version) REFERENCES analytics.verfahren_version (code, version),
    CHECK (ergebnis IN ('gruen','rot')),
    CHECK ((ergebnis = 'gruen') = (blocker_anzahl = 0))        -- gruen == null Blocker, DB-erzwungen
);
CREATE TABLE nachweis.preflight_befund (
    preflight_id uuid NOT NULL REFERENCES nachweis.preflight(id) ON DELETE CASCADE,
    lfd int NOT NULL,
    regel_code text NOT NULL,                     -- FJ-01..FJ-09
    schwere text NOT NULL,                        -- blocker|warnung|hinweis
    endkunde_id uuid, energietraeger text, monat date,
    kennzahl_klasse text,                         -- KLASSIERT, nie kWh/Prozent (B12.5-Muster)
    PRIMARY KEY (preflight_id, lfd),
    CHECK (schwere IN ('blocker','warnung','hinweis'))
);

CREATE TABLE nachweis.einsparlauf (               -- D1, Nachweis-Artefakt, append-only
    id uuid PRIMARY KEY,
    foerderjahr_id uuid NOT NULL REFERENCES nachweis.foerderjahr(id),
    art text NOT NULL,                            -- foerderjahr_nachweis|zwischenstand
    verfahren_code text NOT NULL, verfahren_version int NOT NULL,   -- art='einsparaggregation'
    parameter jsonb NOT NULL,                     -- Vorzeichenregel (F2), Lueckenregel (F3), Rundung
    parameter_hash bytea NOT NULL,
    preflight_id uuid NOT NULL REFERENCES nachweis.preflight(id),
    bindungs_hash bytea NOT NULL,                 -- Siegel ueber die Bindungsmenge (D2)
    umfang_paare_anzahl int NOT NULL, monate_erwartet int NOT NULL, monate_gebunden int NOT NULL,
    gebundene_laeufe_anzahl int NOT NULL,
    qualitaets_stufe_min text NOT NULL,           -- belastbar|eingeschraenkt|nicht_ausweisbar
    ausloeser text NOT NULL,                      -- manuell|job|korrektur
    code_revision text NOT NULL,                  -- Git-SHA, forensisch (ADR-0006 D3)
    synthetic boolean NOT NULL,
    ersetzt_einsparlauf_id uuid REFERENCES nachweis.einsparlauf(id),
    erstellt_at timestamptz NOT NULL DEFAULT now(), erstellt_von_sub text NOT NULL,
    FOREIGN KEY (verfahren_code, verfahren_version) REFERENCES analytics.verfahren_version (code, version),
    CHECK (art IN ('foerderjahr_nachweis','zwischenstand')),
    CHECK (monate_gebunden <= monate_erwartet)
    -- KEIN status, KEIN updated_at (D1-Muster ADR-0006): entsteht erst bei Erfolg.
);

CREATE TABLE nachweis.einsparlauf_bindung (       -- D2, eine Zeile je Paar x Monat
    einsparlauf_id uuid NOT NULL REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    energietraeger text NOT NULL,
    monat date NOT NULL,                          -- Monatserster, lokal
    berechnungslauf_id uuid NOT NULL REFERENCES analytics.berechnungslauf(id),
    referenz_kwh numeric(18,3) NOT NULL,          -- eingefroren aus analytics.laufergebnis (R_m)
    ist_kwh numeric(18,3) NOT NULL,               -- eingefroren (A_m)
    delta_kwh numeric(18,3) NOT NULL,             -- R_m - A_m, VOR Vorzeichenregel
    delta_ausgewiesen_kwh numeric(18,3) NOT NULL, -- NACH Vorzeichen-/Lueckenregel (F2/F3)
    qualitaets_stufe text NOT NULL,
    behandlung text NOT NULL,                     -- gemessen|ersatz|ausgeschlossen (F3, dokumentiert)
    kandidaten_anzahl smallint NOT NULL,          -- >1 => Mehrdeutigkeit, im Metablatt ausgewiesen (D2)
    PRIMARY KEY (einsparlauf_id, endkunde_id, energietraeger, monat),
    CHECK (monat = date_trunc('month', monat)::date),
    CHECK (behandlung IN ('gemessen','ersatz','ausgeschlossen')),
    CHECK (referenz_kwh >= 0 AND ist_kwh >= 0 AND kandidaten_anzahl >= 1)
);

CREATE TABLE nachweis.einsparlauf_ergebnis (      -- Jahreszeile je Paar, INKL. Ausschluessen (DE-02)
    einsparlauf_id uuid NOT NULL REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    energietraeger text NOT NULL,
    status text NOT NULL,                         -- ausgewiesen|nicht_nachweisbar|ausgeschlossen
    ausschluss_grund_code text,                   -- geschlossene Liste (gesperrt|substitution|kein_messkonzept|...)
    referenz_kwh_summe numeric(18,3), ist_kwh_summe numeric(18,3),
    einsparung_kwh_endenergie numeric(18,3),      -- die ausgewiesene Zahl (Endenergie, D8 unberuehrt)
    monate_ausgewiesen smallint NOT NULL, monate_ersatz smallint NOT NULL, monate_fehlend smallint NOT NULL,
    qualitaets_stufe_min text NOT NULL,
    wiss_auswertung_ausgenommen boolean NOT NULL, -- DE-04-Kennzeichnung (D6)
    PRIMARY KEY (einsparlauf_id, endkunde_id, energietraeger),
    CHECK (status IN ('ausgewiesen','nicht_nachweisbar','ausgeschlossen')),
    CHECK ((status = 'ausgewiesen') = (einsparung_kwh_endenergie IS NOT NULL)),
    CHECK ((status = 'ausgeschlossen') = (ausschluss_grund_code IS NOT NULL))
);

CREATE TABLE nachweis.export (                    -- D5, Artefakt-Metadaten (KEINE Bytes)
    id uuid PRIMARY KEY,
    einsparlauf_id uuid NOT NULL REFERENCES nachweis.einsparlauf(id),
    schema_code text NOT NULL, schema_version int NOT NULL,   -- art='exportschema'
    format text NOT NULL,                         -- csv|csv+xlsx
    pseudonym_profil text NOT NULL,               -- v1: 'standard' (D6)
    station_darstellung text NOT NULL DEFAULT 'pseudonymisiert',  -- |klarname (O-B4, auditierte Freigabe)
    de04_auszug boolean NOT NULL DEFAULT false,   -- true = wiss./Stichproben-Auszug => Ausgenommene ausgeschlossen
    manifest_hash bytea NOT NULL,
    dateien_anzahl int NOT NULL, zeilen_anzahl_gesamt bigint NOT NULL,
    erzeugt_at timestamptz NOT NULL DEFAULT now(), erzeugt_von_sub text NOT NULL,
    FOREIGN KEY (schema_code, schema_version) REFERENCES analytics.verfahren_version (code, version),
    CHECK (station_darstellung IN ('pseudonymisiert','klarname'))
);
CREATE TABLE nachweis.export_datei (
    export_id uuid NOT NULL REFERENCES nachweis.export(id) ON DELETE CASCADE,
    dateiname text NOT NULL,
    kategorie text NOT NULL,                      -- rohdaten|baseline|einflussgroessen|einspardaten|meta
    zeilen_anzahl bigint NOT NULL, datei_hash bytea NOT NULL,
    PRIMARY KEY (export_id, dateiname),
    CHECK (kategorie IN ('rohdaten','baseline','einflussgroessen','einspardaten','meta'))
);

CREATE TABLE nachweis.einreichung (               -- D7, Freeze
    id uuid PRIMARY KEY,
    export_id uuid NOT NULL REFERENCES nachweis.export(id),
    einsparlauf_id uuid NOT NULL REFERENCES nachweis.einsparlauf(id),   -- redundant, bewusst (Filter ohne Join)
    art text NOT NULL,                            -- verwendungsnachweis|zwischennachweis|anfrage_bafa|stichprobe
    anfrage_ref text,                             -- DE-01 "nur auf Anfrage" -> Aktenzeichen
    empfaenger text NOT NULL DEFAULT 'bafa',
    uebermittlungsweg text NOT NULL,              -- bscw_manuell|email_geschuetzt|api
    manifest_hash bytea NOT NULL,                 -- eingefroren, = export.manifest_hash zum Zeitpunkt Y
    uebermittelt_at timestamptz NOT NULL, eingereicht_von_sub text NOT NULL,
    beleg_ref uuid,                               -- Slot fuer Empfangsbestaetigung, KEIN FK (Beleg-ADR)
    ersetzt_einreichung_id uuid REFERENCES nachweis.einreichung(id),
    korrektur_grund_code text,                    -- geschlossene Liste (D7)
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((ersetzt_einreichung_id IS NULL) = (korrektur_grund_code IS NULL))
    -- Fail-closed-Backstop (Praezedenz V0023): BEFORE INSERT-Trigger prueft
    --   einsparlauf.art='foerderjahr_nachweis' AND NOT synthetic AND preflight.ergebnis='gruen'.
);
CREATE TABLE nachweis.einreichung_differenz (     -- TB-01/TB-08-Darlegung, Teil des Korrektur-Exports
    einreichung_id uuid NOT NULL REFERENCES nachweis.einreichung(id) ON DELETE CASCADE,
    endkunde_id uuid NOT NULL, energietraeger text NOT NULL, monat date,
    wert_alt_kwh numeric(18,3), wert_neu_kwh numeric(18,3), delta_kwh numeric(18,3) NOT NULL,
    ursache_code text NOT NULL,
    PRIMARY KEY (einreichung_id, endkunde_id, energietraeger, monat)
);

CREATE TABLE nachweis.export_pseudonym (          -- D6, EINZIGE Re-ID-Bruecke im Exportpfad
    entitaet_typ text NOT NULL,                   -- endkunde|system|messkanal|station
    entitaet_ref text NOT NULL,                   -- uuid bzw. messkanal_key/station_ref als Text
    pseudonym text NOT NULL,                      -- 'EK-0001', 'ST-003', ... stabil ueber Foerderjahre
    vergeben_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entitaet_typ, entitaet_ref),
    UNIQUE (entitaet_typ, pseudonym)
);

-- Mutabel, KEIN Nachweisartefakt (D1-Muster ADR-0006):
CREATE TABLE nachweis.einsparlauf_auftrag (       -- Job-Steuerung (portfolioweite Laeufe = Langlaeufer)
    id uuid PRIMARY KEY, foerderjahr_id uuid NOT NULL, art text NOT NULL,
    status text NOT NULL,                         -- angefordert|laeuft|abgeschlossen|fehlgeschlagen
    versuche int NOT NULL DEFAULT 0, fehler_code text,
    einsparlauf_id uuid REFERENCES nachweis.einsparlauf(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nachweis.einsparlauf_retention_status (   -- A7-Muster, Frist offen (O-B7)
    einsparlauf_id uuid PRIMARY KEY REFERENCES nachweis.einsparlauf(id) ON DELETE CASCADE,
    eingereicht boolean NOT NULL DEFAULT false,
    legal_hold boolean NOT NULL DEFAULT false,
    frist_start_at timestamptz,                   -- Loeschuhr, projektbezogen (ADR-0006 C5/A-2)
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only (Muster V0013/V0019/audit-Schema). App-Rolle ist NICHT Eigentuemerin.
REVOKE UPDATE, DELETE ON
    nachweis.foerderjahr, nachweis.preflight, nachweis.preflight_befund,
    nachweis.einsparlauf, nachweis.einsparlauf_bindung, nachweis.einsparlauf_ergebnis,
    nachweis.export, nachweis.export_datei,
    nachweis.einreichung, nachweis.einreichung_differenz, nachweis.export_pseudonym
FROM PUBLIC;
```

**Keine Hypertables** — dieselbe Begründung wie V0019: Zugriffspfad ist immer „ein Lauf/ein Export vollständig", nicht „Zeitfenster über alle Entitäten". Volumengrößenordnung: `einsparlauf_bindung` ≈ Paare × 12 Zeilen/Jahr (10³–10⁴), die Export-Rohdatenkategorie liest ≈ 365 × Kanäle × Endkunden aus bereits vorhandenen Snapshots. Sizing/Index-Schnitt und Migrationszuschnitt (ab V0024) → **O-B12**.

**PII-Kommentare (A8-Muster, zwingend in der späteren Migration):** `endkunde_id`, `referenz_kwh`/`ist_kwh`/`delta_*` in `nachweis.*` → `personenbeziehbar=true; pii=false (pseudonym); grundlage=Art.6(1)(b/f) via identity; retention=BAFA-Nachweispflicht Art.17(3)(b); shred=nein — Re-ID-Schluessel in identity`. `export_pseudonym.entitaet_ref/pseudonym` → zusätzlich `re-id-bruecke=true; grant=nur Renderer-Rolle`. `*_von_sub` → `personenbeziehbar=true (Beschaeftigter); grundlage=Art.6(1)(c)/(f) Nachweisfuehrung; erscheint NICHT im Export`.

## B10 — API-, ABAC- und Audit-Skizze

**Neue `PolicyAction`s (9):** `create:foerderjahr` · `create:nachweis_preflight` · `read:nachweis_preflight` · `create:einsparlauf` · `read:einsparlauf` · `create:nachweis_export` · `read:nachweis_export` · `create:einreichung` · `read:einreichung`. Alle klassifizieren automatisch über `classifyAction()` (`create:*`→`write`, `read:*`→`read`) — **kein** Eingriff dort.

**Zwei Härtungen über den Default hinaus:**
- **`read:nachweis_export` ist die schutzwürdigste Leseaktion dieses ADR.** Die Dateien tragen Tages-Detailwerte (`read:verbrauch_detail`-Niveau, ADR-0008 D4) **und** die Einflussgrößen-Projektion. Daher: eigene Defense-in-Depth-**Auditor-Deny-Regel** im `InCodePolicyAdapter` (analog `read:standort_pii` / `read:einflussgroesse`, neuer Deny-Grund `nachweis_export_auditor_verboten`), **immer audit-pflichtig** (`rolle_erfassen=true`), Vergabe ausschließlich an das Betriebs-/Nachweis-Team.
- **`read:einreichung` ist ausdrücklich auditor-zugänglich** — Einreichungs-Metadaten (wann, von wem, an wen, welcher Hash) sind der Prüfgegenstand des `compliance-auditor`, nicht sein Risiko. Genau deshalb ist sie von `read:nachweis_export` getrennt und nicht in eine Sammelaktion gefaltet.

**Neue `ResourceAttributes`:** `einsparlauf?: { foerderjahrCode, art, umfangPaareAnzahl, qualitaetsStufeMin }` und `nachweisExport?: { einsparlaufId, foerderjahrCode, de04Auszug, stationDarstellung }` — beide **PII-frei und wertfrei** (nie kWh, nie Pseudonym-Zuordnung), aufgelöst über `params['einsparlaufId']`/`params['exportId']`.
> **Ehrlich benannt:** `create:einsparlauf`, `create:nachweis_preflight` und `create:nachweis_export` sind **portfolioweite** Aktionen (B1) — es gibt keinen `endkundeId`, über den `resolveViaEndkunde()` scopen könnte. Ihr Schutz ist RBAC (`betrieb`, ggf. eigene Rolle `nachweis` → O-B11) plus die fail-closed-Vorbedingungen aus D4/D7, **nicht** ABAC-Scoping. Das ist eine bewusste Abweichung vom Stammdaten-Muster und keine Lücke, die man später „noch schließt" — wer einen Förderjahr-Nachweis erzeugen darf, sieht das Portfolio.
> **Art.-18-Sperre:** Endkunden mit `verarbeitungs_status <> 'aktiv'` werden nicht implizit mitverarbeitet, sondern über `FJ-07` als Blocker sichtbar (Analogie zu A10; App-Prüfung plus perspektivisch DB-Backstop wie V0023). Auslegung → O-B6.

| Methode | Pfad | Aktion |
|---|---|---|
| `POST` | `/nachweis/foerderjahre` | `create:foerderjahr` (Lesen über `read:stammdaten`) |
| `POST` | `/nachweis/preflights` | `create:nachweis_preflight` (Body: `foerderjahrId`, `profilCode`) |
| `GET` | `/nachweis/preflights/{id}` | `read:nachweis_preflight` |
| `GET` | `/nachweis/preflights/{id}/befunde` | `read:nachweis_preflight` (Cursor, `limit` ≤ 100) |
| `POST` | `/nachweis/einsparlaeufe` | `create:einsparlauf` (asynchron → `einsparlauf_auftrag`) |
| `GET` | `/nachweis/einsparlaeufe` | `read:einsparlauf` (Filter `foerderjahr`, `art`, `nurAktuelle`) |
| `GET` | `/nachweis/einsparlaeufe/{id}` | `read:einsparlauf` |
| `GET` | `/nachweis/einsparlaeufe/{id}/ergebnisse` | `read:einsparlauf` (Cursor; Jahreszeilen inkl. Ausschlüssen) |
| `GET` | `/nachweis/einsparlaeufe/{id}/bindungen` | `read:einsparlauf` (Cursor; Monatsbindung + Lauf-IDs) |
| `GET` | `/nachweis/vorschau` | `read:einsparlauf` (**vorläufig**, ohne Artefakt-ID, nicht exportierbar) |
| `POST` | `/nachweis/einsparlaeufe/{id}/exporte` | `create:nachweis_export` |
| `GET` | `/nachweis/exporte/{id}` | `read:nachweis_export` (Manifest + Metadaten) |
| `GET` | `/nachweis/exporte/{id}/dateien/{dateiname}` | `read:nachweis_export` (Stream, **Hash-verifiziert**, audit-pflichtig) |
| `POST` | `/nachweis/exporte/{id}/einreichungen` | `create:einreichung` |
| `GET` | `/nachweis/einreichungen/{id}` | `read:einreichung` (auditor-zugänglich) |
| `GET` | `/nachweis/einreichungen/{id}/differenzen` | `read:einreichung` (Cursor) |

Alle schreibenden Routen: `Idempotency-Key`, Transaktion, `@Fachaktion`, Zeitstempel UTC (`Z`); Fehler als `application/problem+json` (RFC 9457); Cursor-Pagination, nie `offset`. Spec: `schemas/openapi/nachweis.openapi.yaml` (OpenAPI 3.1), Contract-Tests je Endpoint.

**Neue Audit-Event-Codes** (Schema `<objekt>.<bereich>.<verb>`, Katalog per Migration, zunächst RESERVIERT):

`einsparlauf.nachweis.angefordert`, `.abgeschlossen`, `.fehlgeschlagen`, `.ersetzt`, `preflight.nachweis.durchgefuehrt`, `export.nachweis.erzeugt`, `export.nachweis.abgerufen`, `einreichung.nachweis.vermerkt`, `einreichung.nachweis.korrigiert`, `foerderjahr.stammdaten.definiert` — plus, erst mit der Faktorschicht (B8): `energiefaktor.import.durchgefuehrt`, `energiefaktor.import.revision_erkannt`.

**`erlaubte_kontext_keys` (PII-frei, `synthetic` überall — A9):**
- `einsparlauf.nachweis.*`: `synthetic`, `einsparlauf_id`, `foerderjahr_code`, `art`, `verfahren_code`, `verfahren_version`, `preflight_id`, `umfang_paare_anzahl`, `gebundene_laeufe_anzahl`, `monate_erwartet`, `monate_gebunden`, `qualitaets_stufe_min`, `ersetzt_einsparlauf_id`, `fehler_code`
- `preflight.nachweis.durchgefuehrt`: `synthetic`, `preflight_id`, `foerderjahr_code`, `profil_code`, `profil_version`, `ergebnis`, `blocker_anzahl`, `warnung_anzahl`, `hinweis_anzahl`, `umfang_paare_anzahl`, `regel_codes`
- `export.nachweis.erzeugt|abgerufen`: `synthetic`, `export_id`, `einsparlauf_id`, `foerderjahr_code`, `schema_code`, `schema_version`, `format`, `pseudonym_profil`, `station_darstellung`, `de04_auszug`, `dateien_anzahl`, `zeilen_anzahl_gesamt`, `manifest_hash`, `dateiname` (nur `.abgerufen`) — `rolle_erfassen=true` für `.abgerufen` (Detaildaten verlassen das System, analog `standort.pii.einsicht`)
- `einreichung.nachweis.vermerkt|korrigiert`: `synthetic`, `einreichung_id`, `export_id`, `einsparlauf_id`, `foerderjahr_code`, `art`, `anfrage_ref`, `uebermittlungsweg`, `empfaenger`, `manifest_hash`, `ersetzt_einreichung_id`, `korrektur_grund_code`, `differenz_positionen_anzahl`, `differenz_richtung` (`hoeher|niedriger|unveraendert` — **klassiert**)
- `foerderjahr.stammdaten.definiert`: `synthetic`, `foerderjahr_id`, `foerderjahr_code`, `nummer`, `von_monat`, `bis_monat`, `definition_quelle`

**Verboten in jedem Kontext** (Verbotsliste aus ADR-0006 B10 gilt unverändert fort, hier erweitert): kWh-Mengen jeder Art — **einschließlich Einsparmengen und Differenzbeträgen**; Baseline-Werte, Temperaturen, Gradtagzahlen; Einflussgrößen-Werte; exakte Prozentsätze; jeder Adress-/Labelbestandteil; **Export-Pseudonyme** und erst recht die Kombination `endkunde_id` + `pseudonym` in einem Kontext (das wäre die Re-ID-Brücke im Audit-Log, D6); Stations-Klarnamen; Bearbeiter-Klarnamen (nur opake `sub` im Akteursfeld des Audit-Events selbst). `manifest_hash`/`datei_hash` sind zugelassen: Hashes über große, geordnete Mengen tragen keine Einzelwerte und sind der forensische Anker zwischen Audit-Eintrag und ausgeliefertem Artefakt.

## B11 — Rollen, Grants, Retention-Anbindung

**Rollen (Muster V0003/V0010/V0019, alle `NOLOGIN`; Credential-/Mitgliedschafts-Zuweisung bleibt `devops-lead`/`security-lead`):**
- `edms_nachweis_owner` — Eigentümerin **aller** `nachweis`-Objekte. Nicht `edms_app`, sonst greift `REVOKE` nicht (A6a).
- `edms_app` — `USAGE` + `INSERT, SELECT` auf die Nachweisartefakte, **nirgends** `UPDATE`/`DELETE`; `INSERT, SELECT, UPDATE` nur auf die zwei mutablen Bookkeeping-Tabellen (`einsparlauf_auftrag`, `einsparlauf_retention_status`).
- `edms_nachweis_reader` — nur `SELECT` auf Lauf-/Ergebnis-/Einreichungs-Artefakte. **Kein** `SELECT` auf `export_pseudonym` (D6: die Brücke braucht nur der Renderer, und der läuft als `edms_app`).
- **Kein neuer Grant auf `analytics`.** Der Export-Renderer braucht die Detail-Snapshots — er bekommt sie über **Mitgliedschaft** in der bereits vorhandenen `edms_analytics_detail_reader` (V0019 D-A6-DETAIL-READER nennt ADR-0007 ausdrücklich als erwarteten Konsumenten). Rollen-Mitgliedschaft statt Grant-Wildwuchs.
- `edms_retention` — **kein `DELETE` auf `nachweis`-Artefakte in v1** (die Frist ist offen, O-B7; ein Grant, den niemand braucht, ist nur ein Risiko). Zusätzlich `SELECT` auf `nachweis.einsparlauf_bindung`, damit ein Retention-Lauf die Nachweisbindung eines `analytics`-Laufs unabhängig vom mutablen Flag verifizieren kann.
- `REVOKE UPDATE, DELETE ... FROM PUBLIC` auf allen elf Artefakttabellen (B9) und, über die Skizze hinaus, auf den neuen Katalogzeilen-Achsen — die liegen ohnehin unter dem bestehenden `analytics`-REVOKE (D-A6-VERFAHREN-REVOKE).

**Retention/Shred:**
- `nachweis.*` ist **Art.-17(3)(b)-Material**: es überlebt das Endkunde-Krypto-Shredding als pseudonymes Nachweisartefakt — dieselbe Bewertung wie für `analytics` (ADR-0006 C1). Das Shred vernichtet den Re-ID-Schlüssel in `identity`; die pseudonyme Kopie bleibt.
- **Auflage (Erweiterung von P5b):** der Shred-Report muss künftig **auch** die bewusst erhaltenen `nachweis`-Artefakte ausweisen (`ShreddingErgebnis.nachweisArtefakteUnveraendert`, mit Rechtsgrundlagen-Vermerk). Ein Report, der `analytics` und `einfluss` ausweist, aber `nachweis` verschweigt, behauptet wieder eine Vollständigkeit, die es nicht gibt.
- **Löschuhr:** `einsparlauf_retention_status.frist_start_at` knüpft an denselben projektbezogenen Anker wie ADR-0006 C5/A-2 (Arbeitshypothese: Jahre nach Schluss-Verwendungsnachweis); `legal_hold` übersteuert. Konkrete Frist → **O-B7** (`compliance-director` + `retention-engineer`), gemeinsam mit O-B4/O-B9 aus ADR-0006 zu entscheiden, nicht getrennt.
- `analytics.lauf_retention_status.nachweis_gebunden` wird wie in D7 beschrieben gesetzt — damit ist die Kette „Nachweis hält seine Bausteine fest" **strukturell** geschlossen und nicht von der Disziplin eines Lösch-Jobs abhängig.

## B12 — Offene Punkte aus Teil B

- **O-B1 (User, aus O1):** konkrete Förderjahr-Grenzen aus dem Zuwendungsbescheid (`von_monat`/`bis_monat`/`definition_quelle` je Förderjahr). Struktur ist parametrisiert und blockiert **nicht** die Implementierung — wohl aber die erste **echte** Nachweis-Erstellung (`FJ-01`).
- **O-B2 (`savings-engineer` + User, aus F2/F3):** Vorzeichenregel (Mehrverbrauch), Lücken-/Ersatzregel und die Mindest-Abdeckung, ab der ein **Förderjahr** nicht nachweisbar ist — als Parametersatz der Regelwerk-Version, inklusive Golden Vectors (B12.6-Muster). Ohne diese Zahlen ist `FJ-03`/`FJ-04` nicht scharf zu stellen.
- **O-B3 (`savings-engineer` + User, aus F4b/O2):** Faktorschicht in v1 (Weg a) oder ausgewiesene Teilmenge (Weg b). **Zusätzlich strukturell offen:** woran das System einen **Substitutionsfall** überhaupt erkennt — heute existiert kein Merkmal dafür (Kandidaten: `einfluss.katalog.energietraeger_mix`, TB-03-Befund, Messkonzept-Flag). `FJ-06` hängt daran.
- **O-B4 (`compliance-director`, aus R4/O5):** Stationsdarstellung im Export. Default `pseudonymisiert` gesetzt (Art. 25(2)); zu bestätigen ist, ob DE-03-Nachvollziehbarkeit den Klarnamen verlangt und wie kleine Kohorten bewertet werden.
- **O-B5 (`compliance-director`, aus DE-04):** Bestätigung der Auslegung „ausgenommen von der wissenschaftlichen Auswertung ≠ ausgenommen vom Verwendungsnachweis" (D6) und des `de04_auszug`-Verhaltens.
- **O-B6 (`compliance-director`, neu):** Umgang mit Art.-18-gesperrten Endkunden im Förderjahr — Blocker (Default, fail-closed) oder Verarbeitung nach Art. 18(2) („Geltendmachung/Verteidigung von Rechtsansprüchen" bzw. öffentliches Interesse). Betrifft `FJ-07` und die DE-02-Vollständigkeit unmittelbar.
- **O-B7 (`compliance-director` + `retention-engineer`, aus O6):** Aufbewahrungsfrist der `nachweis`-Artefakte, Verhältnis zu O-B4/O-B9 aus ADR-0006, und die Shred-Report-Erweiterung (B11).
- **O-B8 (`bafa-export-engineer` + User, aus F6):** CSV-Konvention (Encoding, Trennzeichen, Dezimaltrenner), Notwendigkeit der XLSX-Beilage, Dateinamens- und Spaltenprofil je Kategorie — Empfängerseite BAFA/BSCW.
- **O-B9 (`product-director` + `integration-engineer`, aus O7):** BSCW-Weg. Empfehlung dieses Teils: **manueller Upload** in v1, Anlass am Artefakt geführt (D5).
- **O-B10 (`technical-director` + `database-lead`):** Byte-Ablage der Exportdateien. Empfehlung: **nein** in v1 (deterministisches Re-Rendering + Hash-Verifikation). Ein Objektspeicher wäre ein neues Drittsystem und damit ADR- + Security-Review-pflichtig.
- **O-B11 (User + `product-director`):** eigene App-Rolle `nachweis` (getrennt von `betrieb`) und ob `create:einreichung` eine **Vier-Augen-Freigabe** braucht (Muster ADR-0009 `shred:endkunde:freigeben`). Das TB-08-Rückforderungsrisiko spricht dafür, die externe Prüfung durch den Energieberater (O8) dagegen — Organisationsfrage, nicht Softwarefrage.
- **O-B12 (`database-lead`):** Migrationszuschnitt ab **V0024** (Reihenfolge: `analytics`-CHECK-Erweiterung + Katalogzeilen → `nachweis`-Schema → Audit-Event-Seed), Sizing und Index-Schnitt, Down-Migrations.
- **O-B13 (`security-lead` + `compliance-director`):** `export_pseudonym` als einzige Re-ID-Brücke — Grant-Zuschnitt gegenprüfen, Verhalten beim Krypto-Shred bestätigen (beide Seiten der Brücke sind pseudonym, daher voraussichtlich **kein** Löschbedarf) und die Audit-Verbotsliste („Pseudonym und `endkunde_id` nie gemeinsam") als Whitelist-Test absichern.

## B13 — Rechenmodell v1 (`savings-engineer`, 2026-08-20)

Das B12-Äquivalent aus ADR-0006 für ADR-0007: rollt **F2, F3, F4b** fachlich aus.
Nicht neu aufgerollt: F1/F6/F7/F8 (B1–B8). Eingangsgrößen sind ausschließlich
`analytics.laufergebnis` (`R_m`, `A_m`, `qualitaets_stufe`) — nie eigene
Aggregation auf `measurement` (ADR-0006 B7).

**Rechtsgrundlage (wörtlich, Technisches Merkblatt v2.2 Kap. 9.1, an der Quelle
verifiziert):** „Einsparungen sind **zeitanteilig** zu ermitteln, soweit der für die
Berechnung der Einsparung relevante Zeitraum kleiner ist als das Förderjahr.
**Mögliche Mehrverbräuche bei Endkunden sind mit den vorhandenen Einsparungen bei
anderen Endkunden zu verrechnen. Die Einsparungen des Zuwendungsempfängers werden
über die Gesamtzahl der Endkunden berechnet.** Andere Berechnungsmethoden … müssen
vorab mit der Bewilligungsbehörde abgestimmt werden."

### B13.1 — Formelmodell (drei Ebenen)

Ebene 0 (ADR-0006-Eigentum, nur gelesen): `R_m`, `A_m`, `qualitaets_stufe(m)`.

```
M_FJ                = Monatsmenge des Förderjahres            [Parameter, O-B1 — NICHT "Jan–Dez" hartkodiert]
M_FJ_ausweisbar     = { m ∈ M_FJ | qualitaets_stufe(m) ≠ nicht_ausweisbar }
M_FJ_ausgeschlossen = M_FJ \ M_FJ_ausweisbar

E_{k,t}^{FJ} = Σ_{m ∈ M_FJ_ausweisbar} (R_m − A_m)     [kWh Endenergie]   -- nur bei erfülltem Floor (B13.3)
N_t^{FJ}     = Anzahl Endkunden mit ausweisbarem E_{k,t}^{FJ}
E_t^{FJ,ZE}  = Σ_k E_{k,t}^{FJ}                        [kWh Endenergie]   -- Portfolio-Ebene, Kap. 9.1 Satz 3
```

| Symbol | Bedeutung | Einheit | Herkunft |
|---|---|---|---|
| `R_m`, `A_m` | Referenz / Ist-Verbrauch des Monats | kWh | `analytics.laufergebnis.referenz_kwh`/`.ist_kwh` |
| `qualitaets_stufe(m)` | Monats-Qualitätsstufe | Enum | `analytics.laufergebnis.qualitaets_stufe` |
| `M_FJ` | Monatsmenge des Förderjahres | Monatserste | `nachweis.foerderjahr` (parametrisiert) |
| `E_{k,t}^{FJ}` | Förderjahres-Einsparung je Endkunde/Träger | kWh | Ergebnisgröße ADR-0007 |
| `N_t^{FJ}` | „Gesamtzahl der Endkunden" (Kap. 9.1) | Anzahl | **Auslegungsfrage, O-B14** |
| `E_t^{FJ,ZE}` | Einsparung des Zuwendungsempfängers | kWh | Ergebnisgröße ADR-0007 |

**Neu gegenüber Teil A:** die **Portfolio-Ebene** `E_t^{FJ,ZE}` war dort keine
Formelgröße. Sie gehört ins Rechenmodell (Kap. 9.1 „Berechnung der Einsparungen"),
nicht in die Vergütung (F5/O3). Trägerübergreifende Summe bleibt draußen (§3).

### B13.2 — Vorzeichen / Mehrverbrauch (F2): Verrechnung, keine Kappung

Ein Monat mit `A_m > R_m` geht mit **negativem** `Δ_m` in `E_{k,t}^{FJ}` ein; ein
Endkundenjahr mit `E_{k,t}^{FJ} < 0` geht **unverändert** in `E_t^{FJ,ZE}` ein.
Kein `max(·,0)` auf keiner Ebene.

Begründung ist der Wortlaut, nicht Ermessen: Kap. 9.1 verlangt, Mehrverbräuche
„mit den vorhandenen Einsparungen bei anderen Endkunden zu **verrechnen**" — eine
Kappung auf 0 verrechnete mit „0" statt mit den Einsparungen anderer und
widerspräche dem Satz direkt. Fachlich überschätzt Kappung systematisch (jeder
Monat wirkt nur nach oben) → genau das TB-08-Rückforderungsrisiko.
**Ausdrücklich verworfen:** Untergrenze 0 je Monat/Endkunde — das wäre eine
„andere Berechnungsmethode" (Kap. 9.1 Satz 4) und **vorab** mit der
Bewilligungsbehörde abzustimmen. Negative `E_{k,t}^{FJ}` sind kein Fehlerzustand
und werden im Export ausgewiesen (keine stille Filterung „nur Einsparer").

### B13.3 — Lücken / Qualität (F3): fail-closed mit Abdeckungsfloor

`nicht_ausweisbar`-Monate werden **ausgeschlossen**, nicht mit 0 gefüllt und nicht
hochgerechnet — Grundlage ist die „zeitanteilig"-Klausel (Kap. 9.1 Satz 2). Eine
Hochrechnung wäre eine Annahme über einen nicht gemessenen Wert und damit selbst
eine abstimmungspflichtige „andere Berechnungsmethode".

| Monatsabdeckung `|M_FJ_ausweisbar|/|M_FJ|` | Jahres-Status | Wirkung |
|---|---|---|
| 100 % und alle einbezogenen Monate `belastbar` | `belastbar` | uneingeschränkt ausweisbar |
| ≥ 75 % (mind. ein Monat `eingeschraenkt` oder exkludiert) | `eingeschraenkt` | ausweisbar, zeitanteilig gekennzeichnet |
| < 75 % | `nicht_nachweisbar` | **kein** Einsparwert; nur Status + Lückenliste |

Der 75-%-Anker ist bewusst derselbe Zahlenwert wie der Monats-Tagesfloor in
ADR-0006 B12.4 (Studio-Konsistenz), aber eine **andere Dimension** (Monate im Jahr
statt Tage im Monat) → **fachlich eigenständig zu bestätigen** (O-B2).
Jahres-Qualitätsstufe `Q_{k,t}^{FJ}` = schlechteste Stufe der einbezogenen Monate
(Lauf-Kopf-Prinzip ADR-0006 B1).

**Ausweis-Regel:** jede exportierte Jahreszeile trägt zwingend `berechneter_zeitraum`,
`ausgeschlossene_monate` (je Monat mit Grund), `einsparung_kwh` (NULL bei
`nicht_nachweisbar`), `jahres_qualitaetsstufe`, `hinweis_zeitanteilig`. Eine Zahl
**ohne** diese Begleitangaben wäre die stille Annahme, die dieses Modell vermeidet.

### B13.4 — Substitution / Primärenergie (F4b): Entscheidung (b) für v1

**Der tragende Befund (an der Quelle verifiziert, in Teil A nicht benannt):**
Merkblatt v2.2 Kap. 3 („Einsparungen durch **Substitution** von Energieträgern")
sagt unbedingt: „Die Baseline ist **in jedem Fall** gemäß den Vorgaben des
**alternativen oder Standardmesskonzepts** unter Berücksichtigung von Nutzen und
Einflussgrößen zu bilden."

Substitutionsfälle sind damit **kategorisch vom vereinfachten Messkonzept
ausgeschlossen** — genau dem Messkonzept-Typ, den ADR-0006 v1 exklusiv
implementiert (alternatives/Standard-Messkonzept ist dort „Draußen"). Folge:
Für Substitutionsfälle fehlt nicht die Umrechnungsformel, sondern die
**Eingangsgröße `R_m` in einer zulässigen Methodik**. Eine Primärenergie-Schicht
auf die vereinfachte `R_m`-Bereinigung zu setzen erzeugte eine Zahl, die aussieht
wie eine gültige Einsparung, aber auf einer für diesen Fall unzulässigen Baseline
beruht — ein **größeres** TB-08-Risiko als eine offen ausgewiesene Lücke.
Damit ist Option (a) keine additive Erweiterung von ADR-0007, sondern hat eine
**blockierende Abhängigkeit** zu einer noch nicht gebauten ADR-0006-Fähigkeit.
Dies ist die Konkretisierung von **ADR-0006 R1** („v1 nur für den vereinfachten
Fall gebaut … teuerstes Einzelrisiko").

**Entscheidung v1: (b) — erkennen und offen ausweisen.** Betroffene (Endkunde,
Träger)-Paare erhalten `foerderjahr_status = 'nicht_nachweisbar_substitution'`
(eigener Status, unabhängig von der Monats-Datenqualität — das Problem ist
methodisch, kein Lückenproblem), Ausschlussgrund
`energietraeger_substitution_v1_nicht_unterstuetzt`. Der Endkunde bleibt in der
Export-Liste **sichtbar** (kein stilles Weglassen, DE-02).

**Erkennungsmerkmal — offener Punkt (O-B3), Widerspruch bewusst festgehalten:**
`savings-engineer` schlug zwei Kriterien vor: (a) `einfluss.befund` mit
`groesse_code='energietraeger_mix'`, (b) Energieträger-Wechsel in der
`messkonzept_version_energietraeger`-Historie. **Verifikation (2026-08-20):**
Kriterium (a) trägt heute **nicht** — `einfluss.befund` hat keinen Schreibpfad,
die TB-03-Schwellwert-Erkennung ist nicht gebaut (ADR-0006 C4/P3). Kriterium (b)
ist aus der Versionshistorie **ableitbar**, aber kein fertiges Merkmal (Join über
`messkonzept_version`). `technical-director`s Feststellung „heute existiert kein
Merkmal" ist damit zutreffend. **Vor der ersten echten Nachweis-Erstellung ist ein
belastbares Substitutions-Merkmal festzulegen** — Optionen: explizites Feld am
Messkonzept, oder die TB-03-Erkennung nachziehen, oder eine kuratierte Liste.

### B13.5 — Einheiten / Rundung

Durchgängig **kWh Endenergie je Energieträger** — ADR-0007 rechnet nie um, es
summiert nur. Kein Zwischenrunden: `Σ_m`/`Σ_k` exakt auf den Eingangswerten,
Rundung erst an der eigenen Ausweisgrenze (`numeric(18,3)`, Konvention aus
ADR-0006 B12/`witterung-gtz.ts`). Trifft ADR-0007 auf eine Zeile mit abweichender
Einheiten-Konvention → **fail-closed verweigern**, nicht stillschweigend umrechnen.
Für eine spätere (a)-Ausbaustufe: primärenergetische Werte (`kWh_PE`) **niemals**
in derselben Spalte wie Endenergie-kWh — getrennte, eindeutig benannte Felder,
damit ein Export nicht versehentlich Endenergie und Primärenergie addiert.

### B13.6 — Golden-Vector-Startsatz

Alle Vektoren nehmen Ebene 0 als **gegeben** (die GTZ-Formel ist bereits durch
ADR-0006 B12.6 gesichert) und testen nur Aggregation, Vorzeichen, Floor und
Erkennung. Werte in kWh.

- **GV1 Normalfall** (`M_FJ`=Jan–Apr, alle `belastbar`, Δ = +200/+150/+20/+20):
  `E = 390,000`, Abdeckung 100 %, `Q = belastbar`.
- **GV2 Mehrverbrauch** (Feb: `R=1100`, `A=1300` ⇒ Δ = −200):
  `E = 200−200+20+20 = 40,000`. **Regressionsschutz:** eine Kappung `max(Δ,0)`
  ergäbe `240,000` — falsch, prüft B13.2.
- **GV3 Lücke an der Floor-Grenze** (Feb `nicht_ausweisbar`, 3/4 = 75 %):
  `E = 240,000`, Jahres-Status `eingeschraenkt`, `ausgeschlossene_monate={Feb}`.
- **GV4 Floor unterschritten** (Feb+Mär `nicht_ausweisbar`, 2/4 = 50 %):
  Status `nicht_nachweisbar`, `E = NULL` (**nicht** 220,000, obwohl arithmetisch
  berechenbar) — geht nicht in `E_t^{FJ,ZE}` ein.
- **GV5 Substitution** (Träger-Wechsel erkannt): Status
  `nicht_nachweisbar_substitution`, kein Zahlenwert, Endkunde bleibt sichtbar —
  **unabhängig** davon, dass alle Monate `belastbar` wären.
- **GV6 Portfolio-Verrechnung** (A=+390, B=−150, C=+40): `N=3`,
  `E_t^{FJ,ZE} = 280,000`. **Regressionsschutz:** Kappung von B auf 0 ergäbe
  `430,000` — widerspricht Kap. 9.1 Satz 3.

### B13.7 — Offene Punkte aus B13

- **O-B14 (neu, `compliance-director` + Behörde):** Definition von `N_t^{FJ}`
  („Gesamtzahl der Endkunden", Kap. 9.1) — zählen Endkunden mit
  `nicht_nachweisbar`/`…_substitution` zur Gesamtzahl? Der Vorschlag (Ausschluss
  aus der Summe, sichtbare Auflistung im Export) ist eine **Auslegung**, keine
  Studio-Entscheidung; grenzt an Kap. 9.1 Satz 4 (Abstimmungspflicht) → O8.
- **O-B2** (Floor 75 %) — s. B13.3, fachliche Bestätigung nötig.
- **O-B3** (Substitutions-Merkmal) — s. B13.4, vor erster Nachweis-Erstellung.
- **Abhängigkeit (dokumentiert, nicht geprüft):** `A_m` setzt die
  Eigenerzeugungs-Additionsregel (Kap. 2.1.4: selbst erzeugter und selbst
  verbrauchter Strom ist keine Einsparung und vollumfänglich zur bezogenen Energie
  zu addieren) korrekt voraus. Das ist Mess-/Messkonzept-Ebene (ADR-0004/0005/0006);
  ADR-0007 prüft es nach dem B7-Prinzip **nicht erneut**, nimmt es aber auch nicht
  stillschweigend als erledigt an.
- **F5-Schnittstelle:** welche Granularität ein späteres Vergütungs-ADR braucht
  (`E_{k,t}^{FJ}` je Endkunde vs. nur `E_t^{FJ,ZE}`), ist mangels F5-Scope (O3)
  nicht spezifizierbar — die hier definierten Felder sind ein Vorschlag, kein
  Commitment.

## B14 — Phase-2-Beschlüsse (User, 2026-08-20)

Diese Beschlüsse schließen die user-seitig offenen Punkte aus B12/B13.7. Die
compliance-seitigen Punkte (O-B4, O-B5, O-B6, O-B7, O-B13) gehen unverändert in
Phase 3; `N_t^{FJ}` (O-B14) braucht die Bewilligungsbehörde (O8).

- **F4b / O-B3 — Weg (b) bestätigt.** v1 rechnet Substitutionsfälle **nicht**,
  sondern erkennt und weist sie offen aus (`nicht_nachweisbar_substitution`,
  Ausschlussgrund `energietraeger_substitution_v1_nicht_unterstuetzt`, Endkunde
  bleibt in der Export-Liste sichtbar). Das **Standard-/alternative Messkonzept**
  (ADR-0006-Erweiterung mit Nutzen- und Einflussgrößen-Modellierung) wird als
  **eigener, nachgelagerter Block** geführt — bis dahin haben Substitutionskunden
  keinen gültigen Nachweisweg, und genau das steht dann auch im Nachweis.
  *(Fortschreibung von ADR-0006 R1; die Priorisierung dieses Blocks ist eine
  Portfolio-Frage — ADR-0006 O1 ist weiterhin unbeantwortet.)*
- **O-B3b — Substitutions-Merkmal: explizites Feld am Messkonzept.** Der Fall wird
  **vom Betriebs-Team gesetzt** (Kennzeichen an der Messkonzept-Version, z. B.
  `energietraeger_substitution boolean`), nicht aus der Historie abgeleitet und
  nicht aus der TB-03-Schwellwert-Erkennung gezogen. Begründung: sofort baubar,
  fail-closed, und das Betriebs-Team kennt den Fall ohnehin bei der Erfassung.
  Die Ableitung aus der `mvet`-Historie bleibt als **Plausibilitätsprüfung**
  möglich (Warnung, wenn ein Trägerwechsel sichtbar ist, das Kennzeichen aber
  fehlt) — Umsetzung optional, nicht v1-blockierend. *(Design-Folge: kleines
  Schema-/DTO-/UI-Delta an `messkonzept_version_energietraeger`; gehört in die
  Migrationsreihenfolge O-B12 vor das `nachweis`-Schema.)*
- **O-B10 — keine Byte-Ablage.** Export-Dateien werden **nicht** gespeichert,
  sondern aus dem eingefrorenen Lauf neu gerendert und **vor Auslieferung gegen
  den persistierten `datei_hash`/`manifest_hash` verifiziert** (Abweichung =
  keine Auslieferung). Kein Objektspeicher, kein neues Drittsystem. Renderer-Drift
  wird über die `exportschema`-Version behandelt wie eine Formeländerung (alte
  Versionen bleiben lieferbar).
- **O-B11 — keine Vier-Augen-Freigabe für `create:einreichung`.** Die Einreichung
  wird von der Betriebs-Rolle vermerkt; eine eigene `nachweis`-Rolle wird in v1
  **nicht** eingeführt. Begründung des Users: die externe fachliche Prüfung durch
  den Energieberater (O8) deckt die Richtigkeit ab, ein zweiter interner Freigeber
  wäre doppelt. **Dokumentiertes Restrisiko (bewusst getragen, nicht übersehen):**
  die Einreichung ist der Moment, in dem Zahlen die Organisation Richtung Behörde
  verlassen; ohne internes Vier-Augen hängt die Absicherung vollständig am
  externen Prozess (TB-08-Rückforderungsrisiko). Das Artefakt bleibt
  append-only + audit-pflichtig (`einreichung.nachweis.vermerkt`), die Korrektur
  bleibt nachvollziehbar (`ersetzt_einreichung_id` + Differenz-Report).
  *`compliance-director` kann diesen Punkt in Phase 3 erneut aufwerfen.*
- **O-B2 — Jahres-Abdeckungsfloor 75 % bestätigt.** Unter 75 % ausweisbarer Monate
  wird **kein** Einsparwert exportiert (Status `nicht_nachweisbar` + vollständige
  Lückenliste). Der Wert ist damit gesetzt, nicht mehr vorläufig — er bleibt aber
  als **Parameter** implementiert (nicht als Literal), damit eine spätere
  fachliche Korrektur keine Code-Änderung erfordert.

**Weiterhin offen (nicht in diesem Beschluss):** O-B1 (Förderjahr-Grenzen aus dem
Bescheid — Design ist parametrisiert, blockiert erst die *erste echte*
Nachweis-Erstellung), O-B8/O-B9 (CSV-Konvention und BSCW-Weg — hängen an der
Empfängerseite; v1-Empfehlung bleibt kanonisches CSV + Datei-Export mit manuellem
Upload), O-B12 (Migrationszuschnitt ab V0024), O-B14 (`N_t`-Auslegung, Behörde).

---

# Teil C — Phase 3 (Compliance-Review)

- **Datum:** 2026-08-21 · **Prüfer:** `compliance-director`
- **Votum: KEIN VETO. Freigabe mit dreizehn bindenden Auflagen A11–A23**
  (Fortsetzung der Nummerierung aus ADR-0006 C1 / A6–A10, die unverändert fortgelten).

## C1 — Der tragende Befund des Reviews

Das Design behandelt den Export überwiegend als **Nachweis**-Problem und erst
nachrangig als **Übermittlungs**-Problem. Mit ADR-0007 entsteht der **erste
Abflusspfad des Systems an einen Dritten**. Damit werden vier Dinge erstmals
relevant, die in ADR-0004…0006 keine Rolle spielten:

1. Die BAFA wird **Empfänger** i. S. v. Art. 4 Nr. 9 → **Art. 19 DSGVO**
   (Mitteilungspflicht) wird einschlägig.
2. Art. 18 wandelt sich von einer **Schreibsperre** zu einer **Übermittlungsfrage**.
3. Pseudonymisierung muss gegen einen **externen Beobachter mit Zusatzwissen**
   halten — nicht nur gegen die eigene Auditor-Rolle.
4. Die Datei liegt zwischen Download und BSCW-Upload auf einem
   **Arbeitsplatzrechner** — dem ungeschütztesten Punkt der Kette.

Positiv festgehalten: die B7-Regel („nur Lauf-Artefakte lesen") ist zugleich die
wirksamste Zweckbindungskontrolle im System — sie versperrt den zweiten Lesepfad
nach `einfluss.*` **strukturell**, nicht policy-seitig.

## C2 — Die drei substanziellen Funde

- **Die Pseudonymisierung der `station_ref` ist wirkungslos** (→ A13). Der Export
  liefert die Klima-Tagesreihe vollständig mit (DE-03, Nachrechenbarkeit). Eine
  Jahresreihe von Tagesmitteltemperaturen ist gegen die frei verfügbaren
  DWD-Open-Data-Reihen **derselben Quelle** in Minuten eindeutig matchbar — es
  gibt bundesweit nur einige hundert Stationen. `ST-003` ist damit kein Pseudonym,
  sondern eine Verschleierung mit kurzer Halbwertszeit. Der Konflikt ist **nicht**
  durch bessere Pseudonymisierung heilbar (er würde DE-03 verletzen), sondern nur
  durch Ehrlichkeit über die Wirkung + Adressierung dort, wo der Empfängerkreis
  wächst.
- **`FJ-07` als Förderjahr-Blocker ist der falsche Mechanismus** (→ A11). Ein
  einziger widersprechender Anschlussnutzer blockierte den gesamten
  Verwendungsnachweis — das erzeugt den Anreiz, die Art.-18-Sperre wegzuräumen,
  um handlungsfähig zu bleiben. *Eine Kontrolle, die zu ihrer eigenen Umgehung
  drängt, ist keine.*
- **`nachweis.export_pseudonym` unter `edms_app` ist keine geschützte Brücke**
  (→ A19). „Nur der Renderer, und der läuft als `edms_app`" ist eine Aussage über
  **Code**, keine über **Grants** — derselbe Fehlertyp, den A6 mit
  „Owner ≠ App-Rolle" bereits einmal korrigiert hat.

## C3 — Auflagen A11–A23 (Kurzfassung; Volltext-Begründungen im Review-Protokoll)

| # | Auflage | Wann |
|---|---|---|
| **A11** | `FJ-07` differenzieren: Art.-18-Sperre = **Paar-Ausschluss**, kein Förderjahr-Blocker; `geloescht` (Art. 17 vollzogen) ist **kein** Befund, sondern regulär auszuweisen. Setzt **Schema-Delta** voraus: `einschraenkung_grund_code` + `gesperrt_seit` an `energy.endkunde`/`anschlussnutzer` (existiert heute **nicht**). | **blockierend vor Implementierung** |
| **A12** | Solange Anschlussnutzer-Sperren nicht auflösbar sind (ADR-0006 P4/C5): Kategorie `rohdaten` **nicht** exportierbar, Preflight-Blocker `FJ-10`. | vor Produktivbetrieb |
| **A13** | Station: Ehrlichkeitsklausel im Metablatt, **k ≥ 5** im wissenschaftlichen Auszug (Sammelklassen statt Ausschluss, ohne Klima-Reihe), Klarname nur auf aktenkundige Anforderung. Schließt **ADR-0010 O1**, beantwortet O2 differenziert. | **blockierend vor Implementierung** |
| **A14** | DE-04-Auslegung **bestätigt**; `de04_auszug` durch **`zweck`**-Feld ersetzen (abgeleitet); Ausgenommene im Auszug nur **gezählt**, nie als Pseudonym-Liste; **Antrags-/Belegpfad fehlt vollständig** und ist zu bauen. | **blockierend vor Implementierung** |
| **A15** | Datenminimierung: Exportumfang steuerbar (TB-08 „auszugsweise"); **Einflussgrößen in v1 klassiert** exportieren (sie sind laut ADR-0006 F5 *keine Rechengröße* — ein Wert, der nicht in die Rechnung eingeht, muss für deren Nachvollziehbarkeit nicht im Rohwert vorliegen); Spalten-Positivliste per Migration, Golden-Export-Fixture. | **blockierend vor Implementierung** |
| **A16** | Aufbewahrung: Anker ist die **Bestandskraft des Schlussbescheids**, nicht die Einreichung; **eine gemeinsame Uhr** für `nachweis.*` und gebundene `analytics.*`; Löschreihenfolge nach Datenintensität; Zielkonflikt zu O-B10 (ohne Byte-Ablage ist die eingereichte Datei nach Löschung der Bausteine nicht mehr reproduzierbar) benennen. | Struktur blockierend / Zahl vor Produktivbetrieb |
| **A17** | Shred-Report differenziert erweitern: `nachweisEinsparlaeufeUnveraendert`, `nachweisEinreichungenUnveraendert`, **`bereitsUebermitteltAn`** — letzteres ist die für den Betroffenen erhebliche Tatsache (Löschung im EDMS holt nichts zurück). | Design jetzt / Umsetzung vor Produktivbetrieb |
| **A18** | **Art. 19 DSGVO operationalisieren** (Mitteilungspflicht an Empfänger) — `betroffenenrechte.md` kennt Art. 19 heute **überhaupt nicht**. Register ist `nachweis.einreichung` × `einsparlauf_bindung`; Ausführung als Korrektur-Einreichung mit Differenz-Report. Unverhältnismäßigkeits-Ausnahme greift nicht (Empfänger bekannt und aktenkundig). | vor erster echter Einreichung |
| **A19** | `export_pseudonym`: **eigene NOLOGIN-Rolle `edms_nachweis_renderer`** (`edms_app` ohne Grant), **entitätsfreie Dateinamen** (sonst trägt `dateiname` das Pseudonym ins append-only Audit-Log), Positivlisten-Test gegen `audit.event_seal()`. Tabellen-Konstruktion statt HMAC **bestätigt**. | **blockierend vor Implementierung** |
| **A20** | Attribution: Metablatt genügt (nicht je Datenzeile); **Kurzreferenz im Dateikopf** der zwei DWD-abgeleiteten Dateien (BSCW: Dateien reisen einzeln); **bedingte** Attribution (bei Grundlast-/Synthetik-Läufen wäre der DWD-Vermerk eine **Falschangabe**); `FJ-08` auf `DWD_AENDERUNGSVERMERK` erweitern. | blockierend / A-1 vor erster Einreichung |
| **A21** | **Gegenauflage zu O-B11:** Beschluss B14 (kein Vier-Augen für `create:einreichung`) wird **ausdrücklich getragen**. Stattdessen Zweitfreigabe nur für die zwei Ausnahme-Schalter `station_darstellung='klarname'` und `zweck='wissenschaftliche_auswertung'` — dort liegt die eigentliche Datenschutz-Ermessensentscheidung, ein- bis zweimal jährlich. | vor Produktivbetrieb |
| **A22** | Übertragungs-/Handhabungsregel für das Bündel (ISO A.5.14/A.8.12, DS-10): Ablage nur auf verschlüsseltem Firmengerät, Löschung nach bestätigtem Upload; **Definition von `email_geschuetzt`** (BSI TR-02102), sonst lädt das Feld zum unverschlüsselten Anhang ein; Fehlversand-Runbook (Art. 33/34 + DS-12). | vor erster echter Einreichung |
| **A23** | Zweck „wissenschaftliche Auswertung": Empfänger, **Rolle** (Art. 26 vs. 28 → ggf. **AVV zwingend**) und Rechtsgrundlage klären; ggf. eigener RVT-Eintrag VT-0004. Bis dahin `zweck='wissenschaftliche_auswertung'` **fail-closed gesperrt**. | vor erstem wissenschaftlichem Auszug |

## C4 — Entscheidung zu O-B6 (Art.-18-gesperrte Endkunden im Nachweis)

**Ja — ein gesperrter Endkunde darf im Nachweis erscheinen, differenziert nach
Sperrgrund.** Die Begründungskette:

1. Speicherung ist immer erlaubt (Art. 18 Abs. 2) → bestehende Lauf-Artefakte
   bleiben unangetastet.
2. Aggregation und Übermittlung sind Verarbeitung und brauchen einen der **vier
   abschließenden** Tatbestände des Art. 18 Abs. 2. **Achtung — die Falle:**
   „rechtliche Verpflichtung" ist **keiner** davon. Wer die Nachweispflicht aus
   dem Zuwendungsbescheid als Erlaubnis anführt, argumentiert an der Norm vorbei.
3. Tragend ist **„Verteidigung von Rechtsansprüchen"**: Der Verwendungsnachweis
   sichert den Zuwendungsanspruch gegen Rücknahme/Rückforderung (TB-08 benennt
   diese Folge wörtlich); flankierend das wichtige öffentliche Interesse
   (§§ 23, 44 BHO/ANBest).
4. Dieser Tatbestand trägt **nicht bei jedem Sperrgrund gleich weit**:
   bei Art. 18(1)(b) (Rechtmäßigkeit bestritten) und (1)(d) (Widerspruch nach
   Art. 21 schwebend) würde die Übermittlung den Zustand **ausweiten**, den die
   Einschränkung einfrieren soll → **Paar-Ausschluss**. Bei (1)(a)/(1)(c) →
   Ausweis **mit Kennzeichnung**.
5. DE-02-Vollständigkeit bleibt gewahrt: die ausgeschlossene Zeile bleibt
   **sichtbar** (neutraler Sammelcode `datenschutzrechtliche_einschraenkung`, kein
   Wert) — dasselbe Muster wie B13.4 für Substitution. Stilles Weglassen wäre der
   schlechteste Weg: datenschutzrechtlich nicht besser, förderrechtlich ein
   TB-08-Befund.
6. Der **exportierte** Grund ist der neutrale Sammelcode; der differenzierte
   Sperrgrund bleibt intern (Art. 5 Abs. 1 lit. c) — die Behörde braucht die
   Lücke, nicht die Art des Betroffenenrechts-Vorgangs.
7. Eine spätere Sperre entwertet eine erfolgte Einreichung **nicht rückwirkend**
   (append-only, ex nunc) — sie löst die **Art.-19-Mitteilung** aus (A18).

## C5 — Weitere Beurteilungen

- **O-B5 (DE-04): Auslegung bestätigt** — „ausgenommen von der wissenschaftlichen
  Auswertung" ≠ „ausgenommen vom Verwendungsnachweis". Sonst wäre die Norm kein
  Betroffenenschutz, sondern ein **Förderausschluss zulasten dessen**, der die
  Ausnahme beantragt hat. Präzisierungen s. A14.
- **O-B7:** Frist-Struktur ja, Zahl offen (A-O6, **gemeinsam** mit ADR-0006
  O-B4/O-B9 festzulegen, nicht getrennt). Shred-Report ist zu erweitern (A17).
- **O-B13:** Tabellen-Konstruktion (statt HMAC-Ableitung) **bestätigt** — eine
  Tabelle ist kontrollierbar, löschbar, auditierbar; eine Ableitungsfunktion ist
  mit Pepper-Kenntnis nachrechenbar und nicht widerrufbar. Kein Löschbedarf beim
  Krypto-Shred (beide Seiten pseudonym), **aber**: `entitaet_typ='station'` trägt
  eine **Klartext**-Stationskennung — den Schlüssel zu genau der Verschleierung
  aus A13; zu dokumentieren, Grant-Trennung ohnehin dieselbe.
- **Audit-Verbotsregel:** Die eigentliche Kontrolle ist nicht die Verbotsliste,
  sondern die **Positivliste** der `erlaubte_kontext_keys` mit dem fail-closed
  `audit.event_seal()`-Trigger — keine der neuen Whitelists enthält `endkunde_id`
  oder `pseudonym`. Das ist stärker als eine Verbotsliste und wird als Test
  abgesichert (A19).
- **ISO 27001 neu berührt:** A.5.14 (Informationsübertragung — bisher **ohne
  Bezugspunkt** im ISMS, weil es keine Übertragung gab), A.8.11 (Datenmaskierung),
  A.8.12 (Data Leakage Prevention). Fortgeschrieben: A.5.31/5.33/5.34, A.8.3,
  A.8.10, A.8.15, A.8.24.
- **Rote Linie festgehalten:** **kein Lesepfad von Mehrwertdiensten (TB-07) nach
  `nachweis.*`** — der Grant-Zuschnitt sichert das strukturell.

## C6 — Nachtrag-Bedarf an den Compliance-Artefakten (Entwürfe liegen vor, `compliance/**` gated)

`rvt.md` Rev. 9 (BAFA als konkreter Empfänger, Namensraum `nachweis` + drei
Rollen, gemeinsame Löschuhr; ggf. **VT-0004** für die wissenschaftliche
Auswertung) · `dsfa-0001` Abschnitt 14/Rev. 10 (kein neuer Auslöser, aber neues
Element „Übermittlung an einen Dritten" nach Art. 35 Abs. 7 lit. a; drei neue
Risiken 14-A/B/C; die Art.-18-Auslegung gehört dokumentiert) · `toms.md`
Abschnitt 12 · `betroffenenrechte.md` Rev. 8 (**neuer Art.-19-Abschnitt**,
Art. 15 um Empfänger-Angabe, Art. 17 um „bereits übermittelt", Art. 18 um die
Kennzeichnungsregel) · `retention-matrix.md` Rev. 6 (zwei neue Zeilen) ·
`risk-register/` **R-0006** (R-0005 bleibt reserviert) · `iso27001/soa.md` +
`controls.md`.

## C7 — Offene Entscheidungen aus Phase 3

**User:** (1) **A11-Schema-Delta** `einschraenkung_grund_code` ergänzen? Ohne das
Feld ist A11 nicht umsetzbar und es bleibt nur die unverhältnismäßige Variante.
(2) **A23** — wer führt die wissenschaftliche Auswertung durch, in welcher Rolle?
(3) **A16** — numerischer Fristwert (A-O6, mit ADR-0006 O-B4/O-B9). (4) **A21** —
Zustimmung zur Zweitfreigabe auf den zwei Ausnahme-Schaltern.

**Bewilligungsbehörde (→ O8, Kap. 9.1 Satz 4 „vorab abzustimmen"):**
(5) Genügt für DE-03 ein **klassierter** Ausweis von Personenanzahl/Nutzfläche
(Empfehlung: ja, Rohwerte vorhalten)? (6) Verlangt sie den **Klarnamen** der
Klimastation, oder genügt die pseudonymisierte Kennung mit vollständiger
Klima-Reihe (Empfehlung: Letzteres)? (7) Ist der sichtbare Ausweis von Paaren mit
`datenschutzrechtliche_einschraenkung` ohne Wert akzeptabel — gemeinsam mit
**O-B14** (`N_t^{FJ}`) zu klären, da die drei Ausschlussgründe (`substitution`,
`nicht_nachweisbar`, `datenschutzrechtliche_einschraenkung`) zusammen die
„Gesamtzahl der Endkunden" bestimmen. (8) **O-B8** CSV/XLSX-Konvention.

## C8 — Phase-3-Beschlüsse (User, 2026-08-21)

- **A11 — Schema-Delta bestätigt.** `einschraenkung_grund_code` (geschlossene
  Liste `art18_1a_richtigkeit` | `art18_1b_unrechtmaessig` |
  `art18_1c_rechtsverteidigung_betroffener` | `art18_1d_widerspruch`) und
  `gesperrt_seit` werden an `energy.endkunde` **und** `energy.anschlussnutzer`
  ergänzt. Damit ist die differenzierte Art.-18-Behandlung (C4) umsetzbar; der
  unverhältnismäßige Pauschal-Blocker entfällt. Migration in der Reihenfolge
  O-B12 **vor** dem `nachweis`-Schema. *Folge: der bestehende
  `EndkundeService.sperren()`-Pfad und die zugehörige API/UI brauchen den Grund
  als Pflichtangabe — bislang ist die Sperre grundlos.*
- **A21 — Zweitfreigabe bestätigt.** Antragsteller ≠ Freigeber für
  `station_darstellung='klarname'` und `zweck='wissenschaftliche_auswertung'`
  am `create:nachweis_export` (Muster ADR-0009). Der Regelfall
  (Verwendungsnachweis, pseudonymisiert) bleibt Ein-Augen gemäß B14.
- **Reihenfolge:** die Compliance-Nachträge (C6) werden **vor** Phase 4 (Bau)
  geschrieben.

**Weiterhin offen:** A16 (numerischer Fristwert, A-O6 gemeinsam mit ADR-0006
O-B4/O-B9), A23 (Empfänger/Rolle/Rechtsgrundlage der wissenschaftlichen
Auswertung — bis dahin `zweck='wissenschaftliche_auswertung'` fail-closed
gesperrt) sowie die vier Behörden-Fragen aus C7.

---

# Teil D — C8-Folgeauftrag: Art.-18-Sperrgrund als Pflichtangabe

- **Datum:** 2026-08-26 (Votum) / 2026-08-26 bis 2026-08-28 (Umsetzung)
- **Prüfer:** `compliance-director` · **Votum: KEIN VETO**, Freigabe unter den
  Auflagen **A11.1–A11.13** (Unter-Nummerierung von A11, keine neuen Auflagen —
  Präzisierung einer bestehenden).

## D1 — Anlass

C8 hielt fest: *„der bestehende `EndkundeService.sperren()`-Pfad und die
zugehörige API/UI brauchen den Grund als Pflichtangabe — bislang ist die Sperre
grundlos."* Dieser Folgeauftrag war bis dahin unbearbeitet.

Der Befund im Code war schärfer als erwartet: `einschraenkung_grund_code` und
`gesperrt_seit` existierten seit V0024 an **beiden** Subjekttabellen und wurden
vom Preflight ausgewertet (FJ-07a/b/c, FJ-11a/b/c) — aber **kein Schreibpfad
setzte sie jemals**. Jede Art.-18-Sperre war damit grundlos und fiel
fail-closed auf den Paar-Ausschluss, auch dort, wo A11/C4 den Ausweis mit
Kennzeichnung vorsehen. Das verkürzte die DE-02-Vollständigkeit ohne Not und
stellte die betroffene Person **schlechter**, nicht besser.

## D2 — Auflagen A11.1–A11.13

**Blockierend vor Implementierung**

| # | Auflage |
|---|---|
| **A11.1** | Sperrgrund ist **Pflichtparameter** von `sperren()` und der API. Geschlossene Liste, kein Default, **kein fünfter Auffangcode**. Nicht-Art.-18-Verarbeitungsstopps (Einwilligungswiderruf, Legal-Hold, Incident) laufen **nicht** über diesen Pfad. |
| **A11.2** | **Kein stilles Verwerfen.** Zweiter Aufruf mit gleichem Grund → 200 idempotent; mit **abweichendem** Grund → 409. Ein bestehender Grund wird über diesen Pfad **nie** überschrieben. |
| **A11.3** | Grund und `gesperrt_seit` in **einem** UPDATE (Kohärenz-CHECK V0024); Zeitstempel **serverseitig**, kein Client-Wert (kein Rückdatieren). |
| **A11.4** | Beide Felder in den Detail-Antworten für **`betrieb` und `compliance-auditor`**. **Nicht** über `PiiProjektionsPolicy` führen, **nicht** im ListItem, **kein** Filter/Sort. |
| **A11.5** | Audit: **ein** neuer Kontext-Key `einschraenkung_grund_code`, geschlossener Code, kein Freitext. Katalog-Erweiterung **append-only per Migration**; `audit.katalog.geaendert` emittieren. |
| **A11.6** | **Anschlussnutzer-Sperrpfad mitbauen** — Betroffenenrechts-Triade symmetrisch, begrenzt auf diese Triade. |
| **A11.7** | **Entsperr-Semantik jetzt festschreiben**, damit sie nicht verbaut wird: Aufhebung setzt in einer Transaktion Status→`aktiv`, Grund→NULL, `gesperrt_seit`→NULL **und** `pii_status`→`aktiv`; nur `gesperrt → aktiv`; aus `geloescht` fail-closed; Unterrichtung nach Art. 18 Abs. 3 als vorgelagertes, eigenes Ereignis. |
| **A11.8 (bedingt)** | Ist `gesperrt AND grund IS NULL` **> 0**, wird A11.9 sofort blockierend. |

**Vor Produktivbetrieb**

| # | Auflage |
|---|---|
| **A11.9** | **Nacherfassungspfad** als eigener Vorgang, nur bei `grund IS NULL`, nie überschreibend; Betriebskennzahl „gesperrt ohne Grund" mit Zielwert 0; danach DB-seitiger Rückwärts-CHECK. |
| **A11.10** | **Entsperr-Pfad bauen** nach A11.7, mit Zwei-Schritt-Ordnung; `rolle_erfassen=true` am Entsperr-Event. |
| **A11.11** | **Fristenüberwachung** für die befristeten Tatbestände 1a und 1d: Wiedervorlage auf `gesperrt_seit`, damit keine Einschränkung nach Wegfall des Grundes stillschweigend fortbesteht (Art. 5 Abs. 1 lit. e). |
| **A11.12** | **Art.-19-Kopplung (A18):** eine Sperre **nach** erfolgter Einreichung löst die Mitteilung an die Bewilligungsbehörde aus. |
| **A11.13** | **Compliance-Nachträge** (`compliance/**` gated): `betroffenenrechte.md` (Pflichtgrund, Nacherfassung, Abs.-3-Verfahren, Richtigstellung der Aussage zur unabhängigen Sperrbarkeit), `rvt.md` (Rechtsgrundlage **Art. 6 Abs. 1 lit. c** i. V. m. Art. 18 — **nicht** Art. 18 als Erlaubnisnorm), `retention-matrix.md` (Retentionsasymmetrie Spalte vs. Audit-Zeile), `toms.md`, ISO-Mapping A.5.34/A.5.33/A.8.15/A.8.10. |

**Nicht erforderlich:** keine DSFA-Neuauslösung (korrekte Umsetzung eines
bestehenden Betroffenenrechts innerhalb einer bereits bewerteten Verarbeitung —
Vermerk in `dsfa-0001` Abschnitt 14 genügt), kein neuer Auftragsverarbeiter,
kein Risiko-Register-Neueintrag.

## D3 — Tragende Begründungen (Kurzfassung)

- **Warum Pflicht ohne Ausnahme (A11.1):** Art. 18 Abs. 1 kennt vier
  abschließende Tatbestände und keine Auffangklausel. Ohne Grund ist Abs. 2
  nicht anwendbar — welcher Erlaubnistatbestand die Übermittlung trägt, hängt
  am Sperrgrund (C4 Punkt 4). Zudem sind 1a und 1d **befristet**; ohne Grund
  ist das Fristende nicht bestimmbar und die Einschränkung wird versehentlich
  dauerhaft. Und Art. 5 Abs. 2: ein Statusfeld `gesperrt` ohne Grund ist ein
  Nachweis, der nichts nachweist.
- **Warum der Grund ins Audit-Log gehört (A11.5):** kein Art.-9-Datum; der
  Empfängerkreis wird nicht erweitert, sondern verengt; und vor allem — die
  Aufhebung nullt Grund und `gesperrt_seit` (Kohärenz-CHECK), die Audit-Zeile
  ist danach der **einzige** Beleg (Art. 15, Art. 5 Abs. 2). Benanntes
  Restrisiko: Retentionsasymmetrie, zweiter Anwendungsfall für A-O6.
- **Warum der Grund in der Betriebs-UI erscheinen darf (A11.4):** C4 Punkt 6
  zieht die Linie an der **Systemgrenze zum Empfänger** („die Behörde braucht
  die Lücke, nicht die Art des Vorgangs"), nicht zwischen Datenbank und
  Bildschirm der bearbeitenden Stelle. `betrieb` setzt die Sperre und kennt den
  Grund ohnehin; `compliance-auditor` kann ohne ihn genau die eine Kontrolle
  nicht prüfen, für die die Rolle existiert (passt FJ-07b/FJ-07c zum
  dokumentierten Grund?).
- **Warum der Anschlussnutzer mitmuss (A11.6):** nicht Symmetrie-Ästhetik —
  `compliance/dsgvo/betroffenenrechte.md` sichert bereits zu, Endkunde und
  Anschlussnutzer seien unabhängig sperrbar. Diese Aussage war unwahr. Ein
  Compliance-Dokument, das eine nicht existierende Fähigkeit zusichert, ist
  schlechter als eine dokumentierte Lücke.

## D4 — Umsetzungsstand

| Auflage | Stand | Beleg |
|---|---|---|
| A11.1–A11.5 | **erledigt** | `8f1bed1` — Route `DELETE /stammdaten/endkunden/{id}` → `POST .../{id}/sperren`, Fachaktion `sperren:endkunde`, API 0.9.0; **V0032** (Audit-Whitelist) |
| A11.6 | **erledigt** | `480bd0e` — Anschlussnutzer-Sperrpfad, **V0033**; geteilte Regel `entscheideSperre()`; API 0.10.0 |
| A11.7 | **erledigt** (Semantik + Bau) | `7e4ac99` |
| A11.8 | **greift nicht** | `gesperrt AND grund IS NULL` = 0 für beide Subjektarten (gegen die Dev-DB gemessen) → A11.9 bleibt „vor Produktivbetrieb" |
| A11.10 | **erledigt** | `7e4ac99` — Zwei-Schritt-Pfad, **V0035** (`energy.einschraenkung_unterrichtung`), **V0036** (vier Event-Typen, `rolle_erfassen=true`); API 0.11.0 |
| A11.9, A11.11, A11.12, A11.13 | **offen** | — |

**Abweichung, die benannt gehört:** A11.5 verlangt die Emission von
`audit.katalog.geaendert`. Ein SQL-Migrationsskript kann keinen validierten
`actor_*`-Principal herstellen (rote Linie 1) — alle Katalog-Migrationen seit
V0003 verzichten deshalb auf die Selbst-Emission. Der Schritt ist in V0032,
V0033 und V0036 jeweils als **verschoben** dokumentiert, nicht als erledigt,
und mit echtem Principal nachzutragen; die drei sind dabei **gemeinsam** zu
behandeln.

**Design-Entscheidungen ohne ADR-Literal**, die aus der Umsetzung stammen und
hier festgehalten werden, weil sie das Verhalten bestimmen:

1. **Aktions-Route statt Body am DELETE.** RFC 9110 spricht dem Inhalt einer
   DELETE-Anfrage jede definierte Semantik ab, und ein Pflicht-Body
   widerspricht der Zusage aus `api-contracts.md`, dass alle DELETE-Operationen
   idempotent sind. Die alte Route ist **ersatzlos entfernt**, nicht deprecated:
   bliebe sie ohne Grund benutzbar, wäre A11.1 mit einem Aufruf umgehbar.
2. **`gesperrt_seit` bindet den Unterrichtungs-Nachweis** an genau eine
   Einschränkung. Ohne diese Bindung würde ein Nachweis aus einer früheren
   Einschränkung eine spätere aufsperren.
3. **Exklusiver Bogen** (zwei nullbare FK + CHECK) statt polymorpher
   `subjekt_id` in `energy.einschraenkung_unterrichtung` — ein Beleg, der auf
   niemanden mehr zeigt, ist kein Beleg.
4. **`kanal` als geschlossene Liste**, kein Freitext: sonst trägt die Spalte
   Kontaktdaten und damit PII in eine Tabelle und ein Audit-Log, die beide
   bewusst keine führen.
