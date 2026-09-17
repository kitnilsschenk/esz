# ADR-0006: Baseline & Bereinigung

- **Status:** **proposed** (Phase 1 — Konzept & Vision)
- **Datum:** 2026-07-24
- **Autor:** product-director
- **Reviewer:** ausstehend — `compliance-director` (F5/O6: Personenanzahl und Nutzfläche sind personenbeziehbar), `technical-director` (F6/F7), `baseline-engineer` (F3/F4)
- **Freigabe:** ausstehend (User). **Dieses Dokument entscheidet nichts** — es legt die Fragen vor, die vor Phase 2 beantwortet sein müssen.
- **Bezug:** ADR-0004 (Messkonzept, Baseline-Slot), ADR-0005 (Messwert-Qualität/Korrektur-Log), ADR-0008 (Betriebs-UI), ADR-0010 (`klimareferenz`, O2), ADR-0007 (Einsparberechnung + Export, baut hierauf auf)
- **Auflagen:** TB-01, TB-02, TB-03, TB-08, TB-09, DE-03

> **Reifegrad (korrigiert 2026-09-15):** Der Kopf oben beschreibt **Teil A**
> — ein Vision-Memo, das nichts entscheidet. Das gilt fuer Teil A unveraendert
> und wird bewusst nicht umgeschrieben (Phasen-Historie). **Fuer das Dokument
> als Ganzes stimmt es seit Teil B nicht mehr:** Teil B entscheidet, Teil C
> haelt die gebaute Implementierung fest (Schema V0019-V0021, V0027/V0028,
> V0063, V0072/V0073, V0076; Modul `src/backend/src/berechnung/**`). Wer den
> Stand sucht, liest **Teil C von hinten** — C8 ist der juengste Nachtrag.
>
> **C10 (2026-09-16) haelt die Umstellung auf echte DWD-Klimadaten fest** —
> und drei Befunde, die unter synthetischem Wetter unsichtbar waren.
>
> **F1 ist seit C8 (2026-09-16) nicht mehr (a), sondern (a)+(b):** das
> Standard-Messkonzept wird gerechnet. Aeltere Stellen im Dokument, die „nur
> vereinfacht" sagen, beschreiben den Stand bis dahin.

---

## 1. Kontext

Das System kann heute Messwerte erfassen, verorten und **Verbrauch** ausliefern. Es kann die Frage, für die es das Förderprogramm gibt, nicht beantworten: *„Wie viel wurde eingespart?"* Verbrauch ist nicht Einsparung. Ohne Baseline und Witterungsbereinigung sieht ein kalter Juli wie Verschwendung aus und ein warmer wie Erfolg.

Vorhanden ist der **Slot**, nicht die **Fähigkeit**: `energy.messkonzept_version_energietraeger` trägt `baseline_wert/_einheit/_methode/_begruendung/_beleg_ref`, `messkonzept_version` trägt `typ` und `bereinigungsverfahren` — alles heute manuell erfasster Text bzw. eine manuell eingetragene Zahl. Das genügt, um ein Messkonzept zu dokumentieren. Es genügt **nicht** für DE-03 („die Behörde muss die Einsparberechnung ohne Nachfragen nachvollziehen können"), denn ein Skalar mit Freitext-Begründung ist keine nachvollziehbare Rechnung.

ADR-0006 füllt diese Lücke. Es endet vor der Einsparung selbst — die ist ADR-0007.

## 2. Zielnutzer und Job-to-be-done

- **Betriebs-Team (ADR-0004 Persona B)** — primärer Nutzer in v1. Pflegt Messkonzepte, erfasst Baselines aus Jahresabrechnungen, muss sehen, ob eine Baseline plausibel und vollständig belegt ist. Kann heute nicht erkennen, ob ein Wert richtig gerechnet wurde.
- **Bewilligungsbehörde (BAFA)** — Nutzer über den Export (ADR-0007), aber der **Auftraggeber** dieses ADR: DE-03 und TB-08 (Stichproben, Konsistenzprüfung) definieren die Qualitätslatte.
- **Endkunde / Anschlussnutzer** — Nutznießer, nicht Nutzer in v1: die monatliche Nutzerinformation (TB-06) zeigt später „Einsparung gegen Baseline"; falsch bereinigte Zahlen zerstören dort Vertrauen zuerst.

**Job-to-be-done:** *„Gib mir für jeden Endkunden und Energieträger einen belegten Referenzverbrauch und einen dazu vergleichbar gemachten Ist-Verbrauch — bereinigt um das, was der Endkunde nicht beeinflusst hat — so dass die Differenz eine Einsparung misst und nicht das Wetter."*

**Erfolgsmaßstab (Vorschlag, vor Phase 2 zu bestätigen):**
- **M1** — 100 % der aktiven Endkunden haben je Energieträger eine Baseline mit Methode, Zeitraum und Belegverweis. Heute nicht messbar.
- **M2** — Jeder ausgewiesene bereinigte Wert ist aus gespeicherten Eingangsdaten reproduzierbar (Re-Run-Test auf Stichprobe, Abweichung 0). Das ist der eigentliche Produkt-Anspruch, siehe F6.
- **M3** — Null Rückfragen der Behörde zur Nachvollziehbarkeit der Baseline im ersten Verwendungsnachweis (DE-03).
- **M4** — Sanity-Check des Verfahrens: die monatliche Streuung der bereinigten Werte ist auf Referenzkunden geringer als die der unbereinigten. Bereinigt das Verfahren nicht, ist es Dekoration.

## 3. Scope-Vorschlag v1

**Drin:** Baseline-Herleitung für den **vereinfachten** Messkonzept-Typ (TB-02, Mittelwert der letzten drei Jahresabrechnungen) inkl. Einheiten-Normierung auf kWh; **eine** benannte, versionierte Witterungsbereinigung für wärmegeführte Energieträger; strukturierte, zeitbezogene Erfassung der Einflussgrößen entlang der TB-03-Liste; ein **reproduzierbares Berechnungs-Artefakt** als tragende Struktur (F6).

**Draußen:** Einsparberechnung, Primärenergiefaktoren, Export, Pseudonymisierung (alles ADR-0007); Regressionsmodelle für Einflussgrößen; alternatives Messkonzept; NILM/Geräteerkennung; der TB-03-Anzeige-**Workflow** an die Behörde (v1 liefert nur die Datengrundlage und einen Schwellwert-Report, kein Vorgang, keine Frist).

**Auflösung (Vorschlag, kein Fragepunkt, Widerspruch willkommen):** Tageswerte als Rechenbasis (TB-09 garantiert sie), **Monat** als gespeicherte und ausweisbare Ergebnisauflösung (passt zur monatlichen Nutzerinformation TB-06 und zur Abrechnungslogik), Förderjahr als **Summe der Monate** — nicht separat gerechnet, sonst entstehen zwei Wahrheiten für dieselbe Zahl.

## 4. Zu entscheidende Fragen

### F1 — Welche Messkonzept-Typen deckt v1 ab?

- **(a) Nur vereinfacht.** Baseline = Mittelwert aus Versorger-Abrechnungen. Schnellster Weg zu echten Einsparzahlen, kein Statistikmodell, gegenüber der Behörde trivial erklärbar.
- **(b) Vereinfacht + Standard ohne Regression.** Zusätzlich eine *gemessene* Baseline-Periode, aber nur witterungsbereinigt.
- **(c) Voller Standard-Fall inkl. Mehrgrößen-Regression.** Faktor 3–4 im Aufwand, erfordert Modellvalidierung und eine Erklärungsfähigkeit gegenüber der Behörde, die wir uns erst erarbeiten müssen.

**Trade-off:** Diese Frage kann ich nicht beantworten, ohne das Portfolio zu kennen — sie ist eine **Faktenfrage an den User** (O1): *Wie verteilen sich die geplanten Endkunden auf vereinfacht/Standard, und läuft bei den Standard-Kunden die Baseline-Messperiode schon?* Falls letzteres zutrifft, ist das keine Software-Frage mehr, sondern eine Datenerfassungsfrage mit Deadline — eine nicht gemessene Baseline-Periode ist unwiederbringlich.

*Vorschlag:* (a), sofern die Mehrheit vereinfacht ist; Datenmodell so schneiden, dass (b) additiv nachrüstbar bleibt.

### F2 — Rechnet das System die Baseline oder nimmt es sie entgegen?

- **(a) Status quo:** manueller Skalar + Freitext-Begründung. Nulldurchsatz an Aufwand, aber DE-03 nur durch menschliche Erklärung erfüllbar, und die TB-02-Regel bleibt ein Appell.
- **(b) Abgeleitet:** Abrechnungspositionen werden strukturiert erfasst (Zeitraum, Menge, Einheit, Energieträger, Belegverweis); die Baseline ist das **Ergebnis**, nicht die Eingabe. TB-02 wird erzwingbar („weniger als drei Abrechnungen → Begründung ist Pflichtfeld"), die Prüfbarkeit fällt gratis ab.
- **(c) Abgeleitet mit begründungspflichtigem Override.** Realistisch, weil es Sonderfälle gibt (Zählertausch, Umzug, Leerstand, Teilzeiträume).

**Zwei Fallen, die an dieser Frage hängen:**
1. **Perioden-Normierung.** Abrechnungszeiträume sind selten Kalenderjahre und selten gleich lang. Der arithmetische Mittelwert dreier Abrechnungen über 11, 13 und 12 Monate ist kein Jahresverbrauch. Wird auf 365 Tage normiert — und wenn ja, linear oder gradtaggewichtet?
2. **Einheiten.** Gas kommt in m³ (Brennwert × Zustandszahl → kWh), Öl in Litern, Biomasse in Ster oder Tonnen. Baseline und Ist müssen zwingend in derselben Einheit stehen. Ein falscher Umrechnungsfaktor ist nicht sichtbar — er ist plausibel.

*Vorschlag:* (c), mit Normierung als explizitem, gespeichertem Parameter des Laufs.

### F3 — Welches Bereinigungsverfahren, und wie wird die Grundlast abgetrennt?

- **(a) Gradtagzahlen / Heizgradtage nach VDI 3807** mit festen Parametern (Heizgrenze, Bezugstemperatur), Faktor = GTZ(Referenz) / GTZ(Betrachtung). Im Programm üblich, gegenüber der Behörde am leichtesten zu erklären.
- **(b) Standortindividuelle Regression Verbrauch ~ Heizgradtage** (Grundlast = Achsenabschnitt). Genauer — **aber im vereinfachten Fall nicht anwendbar**, weil die Baseline aus Jahresabrechnungen stammt und es gar keine monatlichen Baseline-Messwerte gibt, gegen die man regressieren könnte. Erst ab (b)/(c) in F1 möglich.
- **(c) Kein Verfahren in v1**, nur das Feld weiterführen. Ehrlich, aber dann bleibt die Ausgangsfrage offen.

**Der kritische Unterpunkt ist nicht das Verfahren, sondern die Grundlast.** Wer den *gesamten* Verbrauch mit dem GTZ-Faktor skaliert, bereinigt Warmwasser, Kochen und Hilfsstrom mit — ein systematischer, gleichgerichteter Fehler, der die ausgewiesene Einsparung dauerhaft verzerrt. Optionen: Sommermonats-Mittel als Grundlast, Regressions-Achsenabschnitt (setzt Messdaten voraus), oder ein pauschaler Anteil je Nutzungsart. Diese Wahl ist zu treffen und zu dokumentieren, nicht zu implizieren.

*Vorschlag:* (a) mit expliziter, je Messkonzept dokumentierter Grundlast-Regel.

### F4 — Klimadaten: Quelle, Station, Bezugsnormal

- **Quelle:** (a) DWD Open Data (kostenlos, Namensnennungspflicht — Lizenz für unsere BSD-Publikation ist zu prüfen, O2); (b) kommerzieller Wetterdienst (Kosten, Förderfähigkeit, Lizenzkonflikt mit der Publikationspflicht); (c) fertige GTZ-Tabellen Dritter (Lizenz meist restriktiver als die Rohdaten).
- **Stationszuordnung:** (a) feste Station je Standort aus `energy.standort.klimareferenz` (ADR-0010) — hält die PII-Trennung sauber, Grobkörnigkeit aber noch unbestätigt (ADR-0010 O2); (b) nächstgelegene Station zur Laufzeit aus der Adresse — bricht den Geist von ADR-0010 RL-1, weil die Bereinigung dann `identity` lesen müsste; (c) Rasterprodukt statt Punktstation.
- **Bezugsnormal:** Bereinigung auf das **Baseline-Wetter**, auf das **Ist-Wetter**, oder beides auf ein **langjähriges Mittel** (Normperiode). Die Wahl entscheidet über die Vergleichbarkeit von Förderjahr zu Förderjahr und ist später nur mit Neuberechnung aller Perioden korrigierbar.

**Betriebliche Falle:** Klimadaten sind eine externe, **veränderliche** Quelle — der DWD revidiert Werte nachträglich. Ohne eingefrorenen Snapshot ändert sich eine 2027 gerechnete Einsparung 2028 von selbst. Das ist kein Randfall, sondern der Regelfall, und es verbindet F4 direkt mit F6.

*Vorschlag:* (a)/(a) plus langjähriges Mittel als Bezugsnormal, Klimadaten als versionierter, referenzierbarer Snapshot.

### F5 — Welche Einflussgrößen in v1, und wie werden sie erfasst?

Die TB-03-Schwellwerte definieren die Liste bereits: Nutzungszweck, Energieträger-Mix, Personenanzahl, Nutzfläche, Geräteabschaffung. **Das sind dieselben Größen, die eine Baseline entwerten** — Anzeigepflicht und Bereinigungsbedarf haben denselben Auslöser. Sie zweimal zu modellieren wäre der teuerste Fehler dieses ADR.

- **(a) Fester Katalog exakt entlang TB-03** (fünf Größen). Schmal, erzwingbar, direkt schwellwertfähig — kann aber Gewerbe/Industrie (Betriebsstunden, Produktionsmenge, Belegungstage) nicht abbilden und wird beim ersten Nicht-Wohn-Kunden nachgezogen.
- **(b) Generischer Katalog** mit Typ/Einheit, frei anlegbar. Deckt alles ab, verliert aber die erzwingbare Schwellwertregel und zerfällt ohne Typdisziplin in Freitext.
- **(c) Beides:** fünf TB-03-Kernkategorien fest verdrahtet und schwellwertfähig, plus generischer Slot für Betriebsgrößen.

**Erfassungsform, unabhängig von der Wahl:** als **Zustands-Zeitreihe** („Personenzahl ab 01.03. = 4"), nicht als Ereignisliste. Nur so ist TB-03 („> 50 % über mehr als ein halbes Jahr") überhaupt auswertbar. Herkunft in v1: Betriebs-UI (das Endkunden-Portal existiert nicht).

**Compliance-Flag:** Personenanzahl im Haushalt, Nutzfläche und Anwesenheitsmuster ergeben zusammen ein **Haushaltsprofil**. Das ist eine neue Datenkategorie, kein Detail — `compliance-director` vor Phase 2 einbeziehen (O6).

*Vorschlag:* (c), Erfassung als Zustands-Zeitreihe; in v1 nur erfassen und Schwellwertüberschreitungen **berichten**, nicht regressieren und keinen Vorgang auslösen.

### F6 — Was heißt „ohne Nachfragen nachvollziehbar"? (architektonisch folgenreichste Frage)

- **(a) Ergebnis-Speicherung:** bereinigter Wert + Methodenname als Text. Billig. Bei einer Rückfrage der Behörde in drei Jahren ist die damalige Rechnung nicht mehr rekonstruierbar — der Code hat sich geändert, die Klimadaten auch.
- **(b) Reproduzierbarer Lauf:** Jede Baseline-Ableitung und jede Bereinigung erzeugt ein **unveränderliches Artefakt** mit Verfahrens-ID **und Verfahrens-Version**, allen Parametern (Heizgrenze, Grundlastregel, Normierung), Referenzen auf die eingefrorenen Eingangsdaten (Klima-Snapshot, Messwert-Stand, Messkonzept-Version, Einflussgrößen-Stand), Ergebnis, Zeitpunkt und Ausführendem. Neuberechnung = **neuer** Lauf, der alte bleibt.
- **(c) Zusätzlich vollständiges Rechenprotokoll** je Periode (Zwischengrößen je Monat als Zeilen). Maximale Prüfbarkeit; fällt fast gratis an, wenn Monatswerte ohnehin gespeichert werden (siehe Auflösung in §3).

**Konsequenz von (b), die mitentschieden wird:** Baseline- und Bereinigungsergebnisse werden **append-only** wie die Messkonzept-Versionen — keine UPDATE-Semantik auf Ergebnissen. Und: eine Änderung an der Formel im Code ist dann kein normales Deployment mehr, sondern erfordert eine neue Verfahrens-Version. Das ist eine Disziplin-Auflage an die Entwicklung, kein Feature, und sie muss jetzt akzeptiert werden — nachträglich ist sie nicht einführbar.

*Vorschlag:* (b) + (c) auf Monatsauflösung. Ich halte das für die tragende Entscheidung dieses ADR: fällt sie auf (a), sind DE-03 und TB-08 nur mit manueller Nacharbeit je Prüfung erfüllbar.

### F7 — Was passiert mit bereits gerechneten Werten, wenn sich Eingangsdaten nachträglich ändern?

Auslöser gibt es drei: Baseline-Korrektur (Nachreichung einer Abrechnung), rückwirkend eintreffende oder korrigierte Messwerte (`measurement.messwert_korrektur_log` existiert), Klimadaten-Revision.

- **(a) Immer neu rechnen (recalc-on-read).** Konsistent, aber ausgewiesene Zahlen ändern sich rückwirkend — nach Einreichung eines Verwendungsnachweises inakzeptabel.
- **(b) Läufe unveränderlich, Stände zitierbar.** Eine Korrektur erzeugt einen neuen Lauf mit Verweis auf den ersetzten, plus Differenz-Report. Der Report ist zugleich der Input für die TB-01-Anzeigepflicht („Änderungen sind darzulegen").
- **(c) Nur vorwärts wirken.** Einfach, sachlich falsch, im Nachweis nicht haltbar.

*Vorschlag:* (b). **Abgrenzung:** der eigentliche *Freeze* („dieser Stand wurde eingereicht") gehört zu ADR-0007, weil dort eingereicht wird — die **Unveränderlichkeit der Läufe** und die Fähigkeit, „Stand X" zu zitieren, muss aber hier gebaut werden, sonst hat 0007 nichts zum Einfrieren.

### F8 — Ab wann ist ein Zeitraum nicht bereinigungsfähig?

Die Ingestion kennt bereits Qualitätsstufen (gemessen / geschätzt / Ersatzwert / korrigiert). Offen ist die Fachregel: Darf ein Monat mit 40 % Ersatzwerten in den Nachweis?

- **(a) Harte Schwelle** (z. B. Monat gilt als belastbar ab X % gemessener Tage) — erzwingbar, aber die Zahl muss fachlich begründet sein, nicht geraten.
- **(b) Kennzeichnen statt sperren:** jeder Wert trägt eine Qualitätsangabe, der Mensch entscheidet. Flexibel, aber verlagert die Verantwortung genau dorthin, wo sie im Prüfungsfall am teuersten ist.
- **(c) Beides:** harte Untergrenze (nicht ausweisbar) plus Kennzeichnung im Graubereich.

Bezug: TB-04 (Ausfall-Dokumentation), TB-08 (Konsistenzprüfung — das Verfahren ist der Behörde ohnehin darzulegen), DE-02 (Vollständigkeit je Förderjahr).

*Vorschlag:* (c), Schwellenwert vor Phase 2 fachlich zu setzen.

## 5. Abgrenzung zu ADR-0007

**ADR-0006 endet** bei der Aussage: *„Für Endkunde X, Energieträger Y, Monat Z gilt: bereinigter Referenzverbrauch = A kWh, bereinigter Ist-Verbrauch = B kWh, beides auf Lauf L zurückführbar."* Dazu gehören Einheiten-Normierung auf kWh, Klimadaten-Beschaffung, Qualitätsbewertung des Zeitraums.

**ADR-0007 beginnt** bei der Differenz A − B: Primärenergiefaktoren, Förderjahres-Zuschnitt, Vergütungslogik, Pseudonymisierung, Tabellenexport (DE-01/DE-03), Vollständigkeits-Preflight je Förderjahr, Einreichung und Freeze.

Bewusst benannte Grauzonen: Förderjahr-Definition (0006 liefert Monate, 0007 schneidet); Freeze (Mechanik in 0007, Unveränderlichkeit in 0006); Primärenergie (0007, weil erst für die Einsparbewertung nötig).

## 6. Risiken

- **R1 — Portfolio-Fehleinschätzung.** v1 nur für den vereinfachten Fall gebaut, während die Mehrheit Standard ist. Teuerstes Einzelrisiko, entschärfbar allein durch die Antwort auf O1.
- **R2 — Stille Ergebnis-Drift.** Externe Klimadaten-Revision verändert bereits gemeldete Zahlen. Nur durch Snapshot + F6(b) beherrschbar.
- **R3 — Nachträgliche Baseline-Korrektur entwertet gemeldete Einsparungen.** TB-08 nennt als Konsequenz fehlender oder inkonsistenter Daten ausdrücklich Bescheid-Rücknahme und Rückforderung. Ohne F7(b) gibt es keinen sauberen Weg, eine Korrektur zu melden statt zu verschweigen.
- **R4 — Über- oder Unterbereinigung** durch fehlende Grundlast-Abtrennung (F3). Systematisch, gleichgerichtet, in der Zahl unsichtbar.
- **R5 — Einheiten-/Brennwertfehler** bei Gas/Öl/Biomasse (F2). Ein falscher Faktor produziert plausible, falsche Ergebnisse.
- **R6 — Scope-Creep Richtung Statistikmodell.** Jede zusätzliche Regressionsgröße erhöht Validierungs- und Erklärungsaufwand gegenüber der Behörde überproportional.
- **R7 — Zeitbasis-Versatz** zwischen unserer UTC-Tagesaggregation und der Tagesdefinition des Wetterdienstes. Klein, real, verschiebt Gradtagzahlen um Stunden.
- **R8 — Datenschutz-Ausweitung durch Einflussgrößen** (F5): Haushaltsprofil-Charakter, RVT- und DSFA-Delta zu prüfen.

## 7. Offene Punkte

- **O1 (User, blockierend für F1):** Verteilung der geplanten Endkunden auf vereinfacht/Standard; laufen bei Standard-Kunden bereits Baseline-Messperioden?
- **O2 (`technical-director`/Lizenz):** Klimadaten-Quelle inkl. Lizenz- und Attributionsprüfung gegen die Open-Source-Publikationspflicht (`.claude/rules/dependencies.md` sinngemäß auch für Daten).
- **O3 (`compliance-director`, blockierend für F4):** ADR-0010 O2 — Bestätigung der Grobkörnigkeit von `energy.standort.klimareferenz`. Fällt sie, hängt die Stationszuordnung an `identity`.
- **O4 (`product-director`):** Die Beleg-Ablage (Jahresabrechnungen, TB-02) existiert nicht. Entweder minimal vorziehen oder v1 mit externem Aktenzeichen in `baseline_beleg_ref` betreiben — Entscheidung nötig, sonst ist die Baseline formal unbelegt.
- **O5 (`technical-director`, aus F6):** Wie werden Verfahrens-Versionen releaset (Katalogtabelle, Migration, versionierte Code-Konstante) und wie wird verhindert, dass eine Formeländerung ohne Versionssprung deployt wird?
- **O6 (`compliance-director`, aus F5):** Einflussgrößen als personenbeziehbare Daten — RVT-Eintrag, DSFA-Delta, Aufbewahrung.
- **O7 (außerhalb des Studios):** Wer verantwortet die **fachliche** Richtigkeit von Formel und Parametern gegenüber der Behörde (Energieberater, Vier-Augen-Prüfung)? Software-Review ersetzt das nicht.

---

# Teil B — Phase 2 (Design)

- **Status:** **proposed** (unverändert; Teil A bleibt wie oben)
- **Datum:** 2026-07-24 · **Autor:** `technical-director`
- **`compliance-director` — Votum zu den Einflussgrößen (2026-07-24): kein Veto, fünf bindende Auflagen A1–A5.** Vollständig in **D8/B8** eingearbeitet (A1 → RL-B1, A2 → Namensraum `einfluss`, A3 → Monatsintervalle, A4 → Pflichtfelder als CHECK, A5 → Snapshot-Projektion in B7). Teil A **F5/O6 ist damit beantwortet**, Teil B O-B8 geschlossen. Weiterhin ausstehend: D6-Schwellwerte, O-B1/O-B4/O-B9/O-B10/O-B11.
- **`baseline-engineer` — Rechenmodell v1 finalisiert (2026-08-19):** D5-Formel vollständig (Konstanten, Grundlast-Defaults, Einheitenumrechnung), O-B3/O-B7/O-B11 geschlossen, O-B2 methodisch fixiert (Zahlen-Sign-off bleibt bei `compliance-director`), Golden-Vector-Startsatz definiert → **B12**.
- **Reviewer ausstehend:** `database-lead` (Sizing B9), `access-control-engineer` (B10), `retention-engineer` (O-B9)
- **Reifegrad:** Design. **Keine Migration, kein Code.** Nächste freie Migrationsnummer: `V0019` (V0017/V0018 sind ADR-0010-Entwürfe).
- **Vom User gesetzt, hier nicht neu aufgerollt:** F6 = (b)+(c) reproduzierbarer Lauf; v1 = vereinfachtes Messkonzept + Witterungsbereinigung; F1 = (a) mit offenem Weg zu (b); F2 = Baseline bleibt **manuell erfasst** (Beleg-Ablage existiert nicht, Teil A O4).

## B0. Was Teil B entscheidet

| # | Entscheidung | Kern |
|---|---|---|
| D1 | Berechnungslauf | Eigenes Schema `analytics`; Kopf + Monatszeilen, **append-only**, Auftrag/Status separat mutabel |
| D2 | Einfrieren | **Tages-Snapshot der Rechenbasis (content-addressed) + Hash über die Rohmenge** |
| D3 | Verfahrens-Version | **Katalogtabelle (SCD2, per Migration)** + Bootstrap-Vollständigkeitscheck + **Golden Vectors** |
| D4 | Klimadaten | **Port/Adapter, quellen-agnostisch**; eingefrorener Klima-Snapshot je Lauf; **Lizenz offen (O-B1)** |
| D5 | Rechenmodell | GTZ VDI 3807, Baseline-Zerlegung über **expliziten Grundlastanteil**, Vergleich auf **Ist-Wetter** |
| D6 | Datenqualität | Abdeckung je Ergebniszeile **NOT NULL**; ≥ 90 % / 75–90 % / < 75 % (provisorisch) |
| D7 | Abgrenzung | 0006 endet bei (R_m, A_m); 0007 rechnet **nie** selbst auf `measurement` |
| D8 | Einflussgrößen | Eigener Namensraum `einfluss` (Klartext, Least-Privilege-Rolle); Bezugsebene = **Systemgrenze**; monatsscharf; Snapshot in den Lauf |

## B1 — D1: Der Berechnungslauf

**Namensraum `analytics`** (neu, PII-frei, pseudonym-referenzierend). Getrennt von `energy` (Stammdaten, mutabel) und `measurement` (Rohzeitreihe, Hypertable), weil Läufe einen eigenen Grant-Zuschnitt (append-only), eigene Retention und eine eigene Leserolle haben. ADR-0007 hängt seine Einspar-/Export-Läufe daneben, statt sie in `energy` zu mischen.

**Bezugsobjekt:** `messkonzept_version_energietraeger_id` — die eindeutige Klammer aus Endkunde × Messkonzept-Version × Energieträger (ADR-0004 §13.2). `endkunde_id` und `energietraeger` werden **redundant mitgeführt** (ABAC-Filter, Auswertung ohne Join).

**Der Lauf-Datensatz trägt:** Bezugsobjekt · Periode (`von`/`bis`, Monatsraster) · Verfahren + Version · vollständiger Parametersatz (`jsonb`) + `parameter_hash` · Referenzen auf die eingefrorenen Eingänge (Messwert-Snapshot, Klima-Snapshot, `station_ref`, `rohdaten_hash`) · die verwendeten Baseline-Größen (`baseline_wert_kwh`, `grundlast_anteil`, `gtz_base`) · Ergebnis-Kopfzahlen · `ausloeser` · `code_revision` (Git-SHA, forensisch) · `erstellt_at` · `ersetzt_lauf_id`.

**Rechenprotokoll (F6c):** `analytics.laufergebnis`, eine Zeile je Monat mit allen Zwischengrößen (R_m, A_m, GTZ_ist, Tagesbilanz). Fällt gratis an, weil Monat ohnehin die Ausweisauflösung ist (Teil A §3).

**Append-only — wie erzwungen:**
- `REVOKE UPDATE, DELETE ... FROM PUBLIC` auf `berechnungslauf`, `laufergebnis`, `eingang_*`, `klima_tag` — dasselbe Muster wie `measurement.messwert_korrektur_log` (V0013) und das `audit`-Schema. Caveat wie dort: die App-Rolle darf **nicht** Eigentümerin der Tabellen sein, sonst greift `REVOKE` nicht.
- **Kein Status-Feld am Lauf.** Ein Lauf wird erst **bei erfolgreichem Abschluss** in einer Transaktion geschrieben — es gibt keinen „laufenden" oder „fehlgeschlagenen" Lauf im Nachweisartefakt. Die Job-Steuerung (angefordert/läuft/fehlgeschlagen, Retry-Zähler) lebt in `analytics.lauf_auftrag`, einer **gewöhnlichen mutablen** Tabelle ohne Nachweischarakter. Das löst den sonst üblichen Selbstwiderspruch „append-only mit Status-Update".
- **Neuberechnung = neuer Lauf** mit `ersetzt_lauf_id`. Der alte bleibt unangetastet. „Aktuell gültig" ist keine Spalte, sondern die View `analytics.lauf_aktuell` (jüngster Lauf je Bezugsobjekt+Periode, der selbst nicht ersetzt wurde).

## B2 — D2: Einfrieren der Eingangsdaten (die tragende Entscheidung)

**Option 3 (Referenz + `measurement.messwert_korrektur_log` auswerten) fällt aus — technisch, nicht meinungsbasiert.** Das Log führt bewusst **keine `wert_alt`/`wert_neu`-Spalten** (ADR-0005 §24 D2, Datenminimierung; V0013 wiederholt das explizit). Es belegt **dass** und **wann** korrigiert wurde, nicht **worauf**. Eine Rekonstruktion des damals verwendeten Werts ist daraus prinzipiell unmöglich. Diese Option wäre nur um den Preis einer Rohwert-Duplizierung im Log zu retten — also derselben Speicherkosten wie Option 1, nur an der falschen Stelle und ohne Bezug zum Lauf.

**Option 2 (nur Referenz + Hash) genügt DE-03 nicht.** Ein Hash erkennt, dass sich etwas geändert hat; die Behörde muss die Zahl aber **nachrechnen** können. „Die Eingangsdaten haben sich geändert, wir wissen nicht wie" ist unter TB-08 die schlechteste aller Antworten.

**Entscheidung: Option 1, aber auf der Ebene, auf der tatsächlich gerechnet wird — plus Option 2 als Siegel.**

1. **`analytics.eingang_messwert_tag`** — Tageswerte je `messkanal_key` im Laufzeitraum, mit aggregierter Qualitätsstufe und Messwertanzahl. Vollständige Fidelität, weil **kein Rechenschritt unterhalb der Tagesebene** stattfindet (Teil A §3: Tageswerte als Rechenbasis). Volumen ≈ 365 Zeilen/Kanal/Jahr statt bis zu 35 040 bei 15-Minuten-Rohwerten.
2. **Content-Addressing gegen „Speicher × Läufe":** Snapshots sind eigene Entitäten mit `inhalt_hash` (`UNIQUE` je Endkunde+Art). Ein Re-Run über denselben, unveränderten Zeitraum referenziert **denselben** Snapshot. Erst eine echte Datenänderung erzeugt einen zweiten. Dedup **nur innerhalb desselben Endkunden** — sonst entstünde ein mandantenübergreifend geteiltes Objekt mit Retention-/Shred-Konflikt (ADR-0010 RL-2 sinngemäß).
3. **`rohdaten_hash` im Lauf:** SHA-256 über die geordnete Rohmenge `(messkanal_key, ts, wert, qualitaet, herkunft)` des Zeitraums. Damit ist eine spätere Rohdaten-Änderung auch dann erkennbar, wenn sie das Tagesaggregat nicht verschiebt. Der Hash ist das Erkennungs-, der Snapshot das Rekonstruktionsmittel.

**Konsequenz, die mitentschieden wird:** Snapshots sind Nachweisdaten und unterliegen der Aufbewahrung des Laufs, nicht der der Rohzeitreihe. Löschläufe (`drop_chunks` auf `measurement.messwert`) dürfen Snapshots nicht mitreißen — und umgekehrt darf ein Krypto-Shred nicht an ihnen vorbeilaufen. Snapshots sind pseudonym (nur `messkanal_key`), also vom Shred nicht zwingend betroffen; die Retention-Regel ist trotzdem explizit zu setzen → **O-B4**.

## B3 — D3: Verfahrens-Versionierung

**Entscheidung: Katalogtabellen `analytics.verfahren` + `analytics.verfahren_version`, gepflegt ausschließlich über Migrationen** — dasselbe Muster wie `audit.event_typ` / `audit.event_typ_version` (V0003 ff.). Der Lauf referenziert `(verfahren_code, verfahren_version)` per FK. Ein Lauf kann damit nie auf eine Version zeigen, die es nie gab; die Katalogzeile trägt die behörden-lesbare Beschreibung der Rechenvorschrift und ihr `parameter_schema`.

*Verworfen:* **Code-Konstante** (keine referenzielle Integrität, keine Beschreibung, per Suchen-und-Ersetzen änderbar). **Git-SHA als Identität** (ändert sich bei jedem unbeteiligten Commit, gegenüber der Behörde nicht erklärbar) — er wird als `code_revision` je Lauf **zusätzlich** mitgeschrieben, rein forensisch.

**Wie wird eine Formeländerung ohne Versionssprung verhindert? Zwei Riegel:**

1. **Bootstrap-Vollständigkeitscheck (fail-closed).** Der Code hält eine Registry mit genau einer Implementierung je `(code, version)`. Beim Start wird beidseitig geprüft: jede aktive Katalogversion hat eine Implementierung, jede Implementierung eine aktive Katalogzeile. Abweichung → Start bricht ab. Damit kann eine **neue** Version nicht ohne Migration entstehen.
2. **Golden Vectors (der eigentliche Riegel).** Je Verfahrensversion liegt ein eingecheckter Satz fixer Eingaben → fixer Erwartungswerte im Repo (`tests/golden/verfahren/<code>@<version>.json`). Ändert jemand die Formel, brechen die Vektoren der **alten** Version rot; die einzige grüne Auflösung ist, die alte Implementierung stehen zu lassen und eine neue Version anzulegen.

*Verworfen:* **Quelltext-Hash** in der Katalogzeile — spröde gegenüber Formatierung und Refactoring, erzeugt Fehlalarme und wird dann abgeschaltet. Golden Vectors prüfen das Verhalten statt der Schreibweise.

**Disziplin-Auflage (aus Teil A F6 mitentschieden):** eine Änderung an einer Rechenvorschrift ist kein normales Deployment. Sie braucht Migration + neue Version + neue Vektoren; `CODEOWNERS` auf dem Verfahrensverzeichnis, Review durch `baseline-engineer`.

## B4 — D4: Klimadaten

**Quellen-agnostisch über einen Port.** `KlimaDatenPort`: `stationsKatalog()`, `tagesTemperaturen(stationRef, von, bis)`, `langzeitmittel(stationRef, normperiode)`. Genau ein Adapter in v1, austauschbar konfiguriert. Kandidaten: **DWD Open Data (CDC)**, kommerzieller Wetterdienst, Rasterprodukt.

> **Lizenz ausdrücklich UNGEKLÄRT — O-B1, blockierend für die Adapter-Implementierung, nicht für dieses Design.** `.claude/rules/dependencies.md` regelt **Code**-Abhängigkeiten, **nicht Daten**. Für Wetterdaten existiert im Repo bislang keine Regel. Zu klären ist mindestens: (a) Attributions-/Namensnennungspflicht, (b) Zulässigkeit der Weitergabe abgeleiteter Werte im BAFA-Export, (c) Verhältnis zur BSD-3-Publikationspflicht (die Rohdaten liegen in der DB, nicht im Repo — das entschärft, klärt aber nicht), (d) ob `dependencies.md` um einen Abschnitt „Datenlizenzen" ergänzt wird. Keine Quelle gilt als geklärt, bevor das entschieden ist.

**Klimadaten werden je Lauf eingefroren** — das ist unabhängig von der Quelle, weil **jeder** Anbieter Werte nachträglich revidiert (Teil A R2). Zwei Ebenen:
- `analytics.klima_tag` — laufender Vorrat, **append-only mit Revisionsachse**: eine Revision erzeugt eine **neue Zeile** `(station_ref, tag, revision)`, die alte bleibt. Kein Überschreiben.
- `analytics.eingang_klima_tag` — der eingefrorene, content-addressed Snapshot des Laufs (analog D2).

Ein erkannter Revisionsunterschied beim Import erzeugt das Audit-Event `klimadaten.import.revision_erkannt` und einen Report „betroffene Läufe" — Auslöser für eine Neuberechnung nach F7(b), nie eine stille Änderung.

**Stationszuordnung:** über `energy.standort.klimareferenz` (ADR-0010 D4) — nie über `identity`. Der Lauf bezieht sich aber auf (Endkunde, Energieträger), nicht auf einen Standort. Auflösungsregel: die Klimareferenzen aller im Zeitraum verorteten Zähler des Bezugsobjekts werden gesammelt; **genau eine** → sie wird verwendet und **im Lauf eingefroren** (`station_ref`-Spalte, keine erneute Auflösung zur Laufzeit); **mehrere oder keine** → der Lauf wird **verweigert** (fail-closed) mit Konfliktmeldung. Kein stilles „nimm die erste". Vorbedingung bleibt ADR-0010 O2.

**Zeitbasis (Teil A R7):** Gradtagzahlen sind auf **lokale Kalendertage** definiert. Die Tagesbildung erfolgt daher über reines PostgreSQL (`date_trunc('day', ts AT TIME ZONE 'Europe/Berlin')`) — bewusst **nicht** über `time_bucket(..., timezone => ...)`, um jede Timescale-Lizenzfrage zu vermeiden; `time_bucket` bleibt für UTC-Raster zulässig. Die Zeitzone ist Verfahrensparameter (`tages_zeitzone`) und wird je Lauf eingefroren. Folge: `measurement.taegliche_abdeckung` (V0012, UTC-Tage) ist **Betriebs-Monitoring** und **nicht** die Qualitätsquelle des Laufs — der Lauf berechnet seine Abdeckung aus dem eigenen Snapshot.

## B5 — D5: Rechenmodell (vereinfachtes Messkonzept + Witterungsbereinigung)

**Gradtagzahl nach VDI 3807**, Parameter `t_innen` (Default 20 °C), `t_heizgrenze` (Default 15 °C):

```
gtz_tag(d) = (t_innen − t_mittel(d))   falls t_mittel(d) < t_heizgrenze, sonst 0
GTZ_m      = Σ_{d ∈ Monat m} gtz_tag(d)                    [Kd]
GTZ_base   = mittlere JAHRES-GTZ über die Baseline-Bezugsjahre, gleiche Station [Kd/a]
```

**Grundlast-Abtrennung** (`g` = witterungsunabhängiger Anteil, 0…1):

```
B_grund = B_a · g          B_witt = B_a · (1 − g)          [kWh/a]
```

**Monatliche bereinigte Vergleichsgröße** (Referenz) und Ist-Verbrauch:

```
R_m = B_grund · (d_m / d_a)  +  B_witt · (GTZ_m^ist / GTZ_base)      [kWh]
A_m = Σ_{d ∈ m} wert_kwh(d)     aus dem eingefrorenen Tages-Snapshot [kWh]
```

`d_m` = Tage im Monat, `d_a` = Tage im Baseline-Bezugsjahr (365/366).

**Bezugsnormal — Entscheidung: Vergleich auf Ist-Wetter; die Baseline wird skaliert, der Ist-Verbrauch nie.** Begründung: `A_m` ist eine gemessene Zahl und bleibt unangetastet — gegenüber der Behörde ist das die ehrlichste Konstruktion (kein Vergleich zweier hochgerechneter Größen). Zusätzlich wird je Lauf eine **wetterneutrale Baseline** ausgewiesen, `B_norm = B_grund + B_witt · (GTZ_norm / GTZ_base)`, mit `GTZ_norm` = langjähriges Stationsmittel. **Wichtig und explizit:** `GTZ_norm` **kürzt sich aus der Vergleichsrechnung heraus** — es beeinflusst nur die kommunizierte, jahresübergreifend vergleichbare Baseline-Kennzahl, nicht `R_m`. Damit ist die Normperiodenwahl kein Risiko für die ausgewiesene Einsparung (entschärft Teil A F4 dritter Spiegelstrich).

**Grundlast `g` — Entscheidung: expliziter, begründungspflichtiger Parameter je (Messkonzept-Version, Energieträger).** Keine automatische Ableitung in v1: im vereinfachten Fall ist die Baseline ein **Jahresskalar**, es existieren keine monatlichen Baseline-Messwerte, aus denen sich ein Sommermittel oder ein Regressions-Achsenabschnitt gewinnen ließe. Für nicht wärmegeführte Träger (Strom ohne Elektroheizung, Kälte im Sommerbetrieb) ist `g = 1` zu setzen — **explizit, nicht implizit**: keine Bereinigung ist auch eine dokumentierte Entscheidung. Sobald ≥ 12 Monate Ist-Daten vorliegen, liefert das System eine **Plausibilisierung** von `g` gegen die Sommermonate als Report — Hinweis, kein automatischer Parameterwechsel.

**`GTZ_base` braucht den Baseline-Zeitraum** — der fehlt heute. Additive Ergänzung: `energy.baseline_periode` (je `messkonzept_version_energietraeger_id` 1–3 Abrechnungszeiträume mit `von/bis`, optional `menge/einheit/beleg_ref`). In v1 dient sie **nur** der GTZ_base-Bestimmung; der Baseline-Wert bleibt der manuell erfasste Skalar (F2, gesetzt). Genau diese Tabelle ist zugleich der Weg zu F2(b) „abgeleitete Baseline", ohne ihn jetzt zu gehen. **Fallback ohne erfasste Perioden:** `GTZ_base := GTZ_norm` (Annahme „Baseline entspricht Normalklima"), Lauf-Parameter `baseline_klima_fallback=true`, im Ergebnis und im Export sichtbar auszuweisen.

**Einheiten:** `B_a` und `A_m` immer in kWh. Umrechnung (Gas m³ × Brennwert × Zustandszahl, Öl l, Biomasse t) über einen **versionierten Faktorensatz**, der Teil des Lauf-Parametersatzes wird — Schnitt und Pflege → O-B7.

## B6 — D6: Datenqualität (F8)

**Jede Ergebniszeile trägt ihre Abdeckung — `NOT NULL`.** Ohne Abdeckung ist eine bereinigte Zahl nicht bewertbar; ein Ergebnis ohne Qualitätsangabe darf es nicht geben. Felder je Monat: `tage_gesamt, tage_gemessen, tage_geschaetzt, tage_ersatz, tage_fehlend, abdeckung_pct, qualitaets_stufe`. Der Lauf-Kopf führt die **schlechteste** Stufe der Periode.

**Tages-Klassifikation:** ein Tag erhält die Stufe des **niedrigsten Rangs** der beitragenden Messwerte (konservativ, konsistent mit `measurement.rang()`, ADR-0005 §24). `gemessen`/`korrigiert` zählen als gemessen.

**Schwellwerte (provisorisch — final `compliance-director`, O-B2):**

| Abdeckung gemessener Tage | Stufe | Wirkung |
|---|---|---|
| ≥ 90 % **und** kein Ausfallblock > 7 zusammenhängende Tage | `belastbar` | uneingeschränkt ausweisbar |
| 75 – < 90 % **oder** Ausfallblock > 7 Tage | `eingeschraenkt` | ausweisbar mit Kennzeichnung + Pflichtkommentar (TB-04-Bezug) |
| < 75 % | `nicht_ausweisbar` | Monat wird berechnet und gespeichert, aber als Lücke markiert |

Ein `nicht_ausweisbar`-Monat wird **nicht** aus dem Lauf entfernt — er wird gerechnet, gespeichert und markiert. Wie mit ihm im Förderjahr umgegangen wird (Ersatz, Hochrechnung, Weglassen), ist ADR-0007. Der Ausfallblock-Zusatz kommt aus TB-04: 25 % gleichmäßig verteilte Einzelausfälle sind fachlich etwas anderes als zehn zusammenhängende Tage im Januar.

## B7 — D7: Abgrenzung zu ADR-0007 (Präzisierung von §5)

**Schnittstelle sind die Artefakte des Laufs:** `analytics.laufergebnis` (Monatszeilen) **und** die drei eingefrorenen Snapshots (Messwert-Tage = Rohdaten-Kategorie, Klima-Tage, Einflussgrößen). **ADR-0007 liest ausschließlich Lauf-Artefakte** — nie selbst `measurement.messwert`, nie `einfluss.*`, nie eigene Aggregation. Andernfalls entstehen zwei Wahrheiten für dieselbe Zahl, und die Reproduzierbarkeit (F6) wäre am Export vorbei umgehbar. Alles ab der Differenz `R_m − A_m` (Primärenergiefaktoren, Förderjahres-Zuschnitt, Vergütung, Pseudonymisierung, Tabellenexport, Einreichungs-Freeze) ist 0007.

**Auflösung des DE-03/A5-Konflikts (bewusst entschieden):** DE-03 verlangt Rohdaten, Baseline, **Einflussgrößen** und Einspardaten im Export. Ein **zweiter Lesepfad** von 0007 nach `einfluss.*` wird **verworfen** — er umginge den Lauf, führte Klartext-Verwaltungsfelder (Betroffener, Quelle, Rechtsgrundlage) in die Export-Reichweite und machte die Einflussgrößen zu einer nicht eingefrorenen, rückwirkend veränderlichen Größe. Stattdessen: **Einflussgrößen werden als dritte Snapshot-Art in den Lauf eingefroren** (`analytics.eingang_einflussgroesse`), **pseudonymisiert und auf die fachlichen Felder reduziert** (Code, Wert, Monatsintervall, System-Pseudonym) — ohne Betroffenen-, Quellen-, Rechtsgrundlagen- und Anlass-Felder. Damit ist A5 strukturell erfüllt (Export/Analytics sehen nur die pseudonyme Projektion), D7 bleibt unangetastet, und eine nachträglich korrigierte Personenzahl kann einen bereits gemeldeten Nachweis nicht mehr still verändern. In v1 sind Einflussgrößen **Nachweis-Beigabe, keine Rechengröße** (keine Regression, Teil A F5) — sie gehen trotzdem in `rohdaten_hash` und Snapshot-Identität ein.

## B8 — D8: Einflussgrößen (`compliance-director`-Votum 2026-07-24: kein Veto, Auflagen A1–A5)

**RL-B1 (rote Linie, aus A1): Bezugsebene ist die Systemgrenze des Messkonzepts** — `energy.system`. Nicht der Standort-Baum, nicht der Haushalt. Eine feinere Verortung (`standort_id`) ist **nur** zulässig, wenn an oder unterhalb dieses Knotens im Intervall eine aktive Zähler-Verortung besteht — „feiner nur dort, wo auch gemessen wird" (Service-Vorbedingung, ADR-0010 D3). TB-03 ist damit erfüllt, weil die Schwellwerte auf die **bilanzierte Einheit** zielen, nicht auf den Haushalt. Der Haushaltsprofil-Einwand (Teil A O6/R8) ist damit konstruktiv aufgelöst statt verwaltet. Bindung an `energy.system` (nicht an `mvet_id`): Einflussgrößen überdauern Messkonzept-Versionen; eine neue Version darf sie nicht verwaisen lassen.

**D8.1 — Ablage: eigener Namensraum `einfluss`, Klartext, eigene DB-Rolle (A2, Variante a).** Präzedenz: `device` aus ADR-0005 §26 (V0010: eigenes Schema + `edms_ingest_worker`). Analog: Schema `einfluss`, Least-Privilege-Rolle `edms_einfluss` (`NOLOGIN`), spaltenscharfe GRANTs, `pii=true`-Spaltenkommentare mit Grundlage und Retention.

*Warum nicht `identity`/Feldverschlüsselung:* Einflussgrößen gehen in reproduzierbare Läufe ein. Am Subjekt-DEK gebunden würde eine Art.-17-Löschung sie unlesbar machen und damit **rückwirkend die Nachweisführung nach DE-03/TB-08 zerstören** — ein Betroffenenrecht vernichtete die Beweiskette. **Krypto-Shredding ist hier ausdrücklich kein Löschmittel.** *Warum nicht `energy`:* RL-1 aus ADR-0010 — `energy` muss ohne PII-Prüfung in Analytics-, Export- und Debug-Pfaden nutzbar bleiben; eine stillschweigende Einlagerung ist unzulässig, und Variante (b) (dokumentierte RL-1-Ausnahme) kostete eine dauerhafte Sonderregel in einem Namensraum, dessen Wert gerade in seiner Ausnahmslosigkeit liegt.

**Konsequenz — eigene Löschregel:** `einfluss.*` überlebt den Endkunden-Shred. Löschung erfolgt fristgebunden an die **Nachweispflicht** (Förderjahr + Aufbewahrungsfrist), nicht an die Vertragsdauer, über einen eigenen Lösch-Job. Der Shred-Report muss ausdrücklich ausweisen, dass Einflussgrößen **nicht** mitgeschreddert werden — sonst behauptet er eine Vollständigkeit, die es nicht gibt (Frist: O-B9).

**D8.2 — Monatsscharfe Intervalle, kein Anlass-Freitext (A3).** `gueltig_ab_monat`/`gueltig_bis_monat` (Monatserster, CHECK erzwungen), Overlap-Schutz je `(system_id, groesse_code)` via `EXCLUDE`. Tagesscharfe Wechsel werden **nicht** gespeichert: „2 → 1 zum 14.03." ist als Trennung, Auszug oder Todesfall lesbar; monatsscharf nimmt dem Datum den Ereignischarakter und kostet fachlich nichts, weil TB-03 in Halbjahren rechnet. **Kein `grund`/`anlass`-Freitext** — falls die Anzeigepflicht eine Begründung braucht, `anlass_code` aus geschlossener Werteliste ohne personenbezogene Anlässe. **`nutzungszweck` als geschlossener Katalog ohne Art.-9-nahe Einrichtungskategorien** (keine Pflegeeinrichtung, Arztpraxis, Religionsgemeinschaft — Wohnen/Büro/Handel/Produktion/Lager/Sonstiges).

**D8.3 — Herkunft und Betroffener als Pflichtfelder (A4).** `quelle_typ` (wer hat den Wert angegeben) und `betroffener_typ ∈ {endkunde, anschlussnutzer}` sind `NOT NULL` — **Datenmodell-Merkmal, kein Prozessschritt**: ohne sie ist die Rechtsgrundlage nicht bestimmbar. `rechtsgrundlage` wird beim Erfassen **festgeschrieben** (`art6_1b` | `art6_1f`), nicht zur Laufzeit hergeleitet. Beim Anschlussnutzer ≠ Endkunde trägt lit. b **nicht**; dort ist `art6_1f` mit `abwaegung_ref` (Verweis auf die dokumentierte Abwägung) und `art14_information_at` Pflicht — als **CHECK-Constraint** erzwungen, damit die Art.-14-Vorbedingung nicht in einem Service-Kommentar verdunstet.

## B9 — Schema-Skizze (DDL-nah, keine Migration)

```sql
CREATE SCHEMA analytics;   -- PII-frei, pseudonym; FKs nach energy zulaessig,
                           -- measurement-Bezuege FK-los (Konvention V0002)

CREATE TABLE analytics.verfahren (
    code text PRIMARY KEY,                 -- z.B. 'witterung_gtz_vdi3807'
    art  text NOT NULL,                    -- bereinigung|baseline
    beschreibung text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analytics.verfahren_version (      -- SCD2, Muster audit.event_typ_version
    id uuid PRIMARY KEY, code text NOT NULL REFERENCES analytics.verfahren(code),
    version int NOT NULL, parameter_schema jsonb NOT NULL,
    beschreibung text NOT NULL, aktiv boolean NOT NULL DEFAULT true,
    gueltig_ab timestamptz NOT NULL, gueltig_bis timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (code, version)
);

CREATE TABLE analytics.eingang_snapshot (       -- content-addressed (D2)
    id uuid PRIMARY KEY, endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    art text NOT NULL,                          -- messwert_tag|klima_tag
    inhalt_hash bytea NOT NULL, von date NOT NULL, bis date NOT NULL,
    zeilen_anzahl int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (endkunde_id, art, inhalt_hash)      -- Dedup NUR je Endkunde (Retention/Shred)
);
CREATE TABLE analytics.eingang_messwert_tag (
    snapshot_id uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    messkanal_key int NOT NULL,                 -- FK-los (V0002-Konvention)
    tag date NOT NULL,                          -- lokaler Kalendertag (D4)
    wert_kwh numeric(18,3) NOT NULL,
    qualitaet_min smallint NOT NULL,            -- niedrigster Rang des Tages (D6)
    anzahl_messwerte int NOT NULL,
    PRIMARY KEY (snapshot_id, messkanal_key, tag)
);
CREATE TABLE analytics.eingang_klima_tag (
    snapshot_id uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    station_ref text NOT NULL, tag date NOT NULL,
    t_mittel numeric(6,2) NOT NULL, gtz_tag numeric(8,2) NOT NULL,
    PRIMARY KEY (snapshot_id, tag)
);
-- Dritte Snapshot-Art (D7/A5): pseudonyme PROJEKTION der Einflussgroessen --
-- OHNE betroffener_typ/quelle_typ/rechtsgrundlage/anlass_code (die bleiben
-- ausschliesslich in `einfluss`, s. u.). Kein Personenbezug im Exportpfad.
CREATE TABLE analytics.eingang_einflussgroesse (
    snapshot_id uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    system_id uuid NOT NULL,                    -- Pseudonym-Referenz, FK-los
    groesse_code text NOT NULL,
    wert_num numeric(18,3), wert_code text,
    gueltig_ab_monat date NOT NULL, gueltig_bis_monat date,
    PRIMARY KEY (snapshot_id, system_id, groesse_code, gueltig_ab_monat)
);
CREATE TABLE analytics.klima_tag (              -- laufender Vorrat, Revisionsachse
    station_ref text NOT NULL, tag date NOT NULL, revision int NOT NULL,
    t_mittel numeric(6,2) NOT NULL, quelle text NOT NULL,
    abgerufen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (station_ref, tag, revision)
);

CREATE TABLE analytics.berechnungslauf (
    id uuid PRIMARY KEY,
    endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    energietraeger text NOT NULL,
    mvet_id uuid NOT NULL REFERENCES energy.messkonzept_version_energietraeger(id),
    verfahren_code text NOT NULL, verfahren_version int NOT NULL,
    parameter jsonb NOT NULL, parameter_hash bytea NOT NULL,
    periode_von date NOT NULL, periode_bis date NOT NULL,
    messwert_snapshot_id uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    klima_snapshot_id    uuid NOT NULL REFERENCES analytics.eingang_snapshot(id),
    station_ref text NOT NULL,                  -- eingefroren, keine Laufzeit-Aufloesung
    rohdaten_hash bytea NOT NULL,               -- Siegel ueber die Rohmenge (D2.3)
    baseline_wert_kwh numeric(18,3) NOT NULL, grundlast_anteil numeric(4,3) NOT NULL,
    gtz_base numeric(10,2) NOT NULL, gtz_norm numeric(10,2),
    baseline_norm_kwh numeric(18,3),            -- wetterneutral, nur Ausweis (D5)
    qualitaets_stufe_min text NOT NULL,
    ersetzt_lauf_id uuid REFERENCES analytics.berechnungslauf(id),
    ausloeser text NOT NULL,                    -- manuell|job|nachlauf_korrektur
    code_revision text NOT NULL,                -- Git-SHA, forensisch (D3)
    erstellt_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (verfahren_code, verfahren_version)
        REFERENCES analytics.verfahren_version (code, version)
    -- KEIN status, KEIN updated_at: der Lauf entsteht erst bei Erfolg (D1)
);
CREATE TABLE analytics.laufergebnis (
    lauf_id uuid NOT NULL REFERENCES analytics.berechnungslauf(id),
    monat date NOT NULL,                        -- Monatserster, lokal
    referenz_kwh numeric(18,3) NOT NULL, ist_kwh numeric(18,3) NOT NULL,
    gtz_ist numeric(10,2) NOT NULL,
    tage_gesamt smallint NOT NULL, tage_gemessen smallint NOT NULL,
    tage_geschaetzt smallint NOT NULL, tage_ersatz smallint NOT NULL,
    tage_fehlend smallint NOT NULL, abdeckung_pct numeric(5,2) NOT NULL,
    qualitaets_stufe text NOT NULL,             -- belastbar|eingeschraenkt|nicht_ausweisbar
    PRIMARY KEY (lauf_id, monat)
);

-- Append-only (Muster V0013 / audit-Schema). App-Rolle ist NICHT Eigentuemerin.
REVOKE UPDATE, DELETE ON analytics.berechnungslauf, analytics.laufergebnis,
    analytics.eingang_snapshot, analytics.eingang_messwert_tag,
    analytics.eingang_klima_tag, analytics.klima_tag FROM PUBLIC;

-- Mutabel, KEIN Nachweisartefakt: Job-Steuerung (D1)
CREATE TABLE analytics.lauf_auftrag (
    id uuid PRIMARY KEY, endkunde_id uuid NOT NULL, energietraeger text NOT NULL,
    periode_von date NOT NULL, periode_bis date NOT NULL,
    status text NOT NULL, versuche int NOT NULL DEFAULT 0, fehler_code text,
    lauf_id uuid REFERENCES analytics.berechnungslauf(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Additiv in energy (D5): Baseline-Bezugszeitraeume fuer GTZ_base
CREATE TABLE energy.baseline_periode (
    id uuid PRIMARY KEY,
    mvet_id uuid NOT NULL REFERENCES energy.messkonzept_version_energietraeger(id),
    von date NOT NULL, bis date NOT NULL,
    menge numeric(18,3), einheit text, beleg_ref uuid,   -- Slot, KEIN FK (Beleg-ADR)
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (bis > von)
);

-- =====================================================================
-- D8 -- Einflussgroessen: DRITTER Namensraum, KLARTEXT (A2, Variante a).
-- Praezedenz `device` (V0010). NICHT identity (Krypto-Shred wuerde die
-- Nachweiskette zerstoeren), NICHT energy (RL-1, ADR-0010).
-- =====================================================================
CREATE SCHEMA einfluss;
-- CREATE ROLE edms_einfluss NOLOGIN;  (Muster V0010/V0003, spaltenscharfe GRANTs)

CREATE TABLE einfluss.katalog (          -- geschlossener Katalog (A3)
    code text PRIMARY KEY,               -- nutzungszweck|energietraeger_mix|personenanzahl|
                                         -- nutzflaeche|geraeteabschaffung|betriebsgroesse_*
    wert_art text NOT NULL,              -- numerisch|codiert
    einheit text, tb03_schwellwert jsonb, -- Regel je Groesse (TB-03)
    aktiv boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE einfluss.intervall (
    id uuid PRIMARY KEY,
    endkunde_id uuid NOT NULL REFERENCES energy.endkunde(id),
    system_id   uuid NOT NULL REFERENCES energy.system(id),   -- RL-B1: Bilanzebene
    standort_id uuid REFERENCES energy.standort(id),          -- nur wo gemessen wird (A1)
    groesse_code text NOT NULL REFERENCES einfluss.katalog(code),
    wert_num numeric(18,3),              -- pii=true (Personenanzahl/Nutzflaeche)
    wert_code text,                      -- geschlossene Werteliste, kein Freitext
    gueltig_ab_monat  date NOT NULL,     -- Monatserster (A3)
    gueltig_bis_monat date,              -- NULL = offen
    betroffener_typ text NOT NULL,       -- endkunde|anschlussnutzer            (A4)
    quelle_typ      text NOT NULL,       -- endkunde|anschlussnutzer|betriebsteam|vor_ort (A4)
    rechtsgrundlage text NOT NULL,       -- art6_1b|art6_1f -- beim Erfassen FESTGESCHRIEBEN
    abwaegung_ref text,                  -- Verweis auf dokumentierte LIA (nur art6_1f)
    art14_information_at timestamptz,    -- Vorbedingung produktiver Erfassung (A4)
    anlass_code text,                    -- geschlossene Liste, KEIN Freitext (A3)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (gueltig_ab_monat  = date_trunc('month', gueltig_ab_monat)::date),
    CHECK (gueltig_bis_monat IS NULL
           OR (gueltig_bis_monat = date_trunc('month', gueltig_bis_monat)::date
               AND gueltig_bis_monat > gueltig_ab_monat)),
    CHECK (betroffener_typ IN ('endkunde','anschlussnutzer')),
    CHECK (rechtsgrundlage IN ('art6_1b','art6_1f')),
    -- A4 als Constraint, nicht als Service-Kommentar: beim Anschlussnutzer
    -- traegt lit. b NICHT -- lit. f + Abwaegung + Art.-14-Information zwingend.
    CHECK (betroffener_typ <> 'anschlussnutzer'
           OR (rechtsgrundlage = 'art6_1f'
               AND abwaegung_ref IS NOT NULL
               AND art14_information_at IS NOT NULL)),
    CONSTRAINT ex_einfluss_no_overlap EXCLUDE USING gist (
        system_id WITH =, groesse_code WITH =,
        daterange(gueltig_ab_monat, gueltig_bis_monat) WITH &&
    )
);
-- COMMENT ON COLUMN einfluss.intervall.wert_num IS
--   'pii=true; grundlage=Art.6(1)(b) bzw. (f) je Zeile (rechtsgrundlage);
--    retention=an die BAFA-Nachweispflicht gebunden, NICHT an die
--    Vertragsdauer; Loeschung NICHT ueber Krypto-Shredding (A2)';

CREATE TABLE einfluss.befund (           -- TB-03-Schwellwertueberschreitung (A5)
    id uuid PRIMARY KEY,
    system_id uuid NOT NULL REFERENCES energy.system(id),
    groesse_code text NOT NULL REFERENCES einfluss.katalog(code),
    zeitraum_von date NOT NULL, zeitraum_bis date NOT NULL,
    ueberschreitung_klasse text NOT NULL,  -- klassiert, KEIN Rohprozentsatz im Report-Key
    erkannt_at timestamptz NOT NULL DEFAULT now()
);
```

`analytics.eingang_messwert_tag` bleibt eine **normale** Tabelle (kein Hypertable): Zugriffspfad ist immer „ein Snapshot vollständig", nicht „Zeitfenster über alle Kanäle". Sizing/Index-Schnitt → O-B6.

## B10 — API-, ABAC- und Audit-Skizze

**Neue `PolicyAction`s (7):** `read:berechnungslauf`, `create:berechnungslauf`, `read:klimadaten`, `create:klima_import`, `read:einflussgroesse`, `create:einflussgroesse`, `update:einflussgroesse`. Baseline-Perioden brauchen **keine** eigene Aktion — sie sind Bestandteil der Messkonzept-Version (`create:messkonzept_version`, Lesen über `read:stammdaten`).

**`read:einflussgroesse` ist eine Klartext-PII-Leseaktion (A5):** deny-by-default wie jede Aktion, zusätzlich — analog `read:geraet_zuordnung`/`read:standort_pii` (ADR-0010 D5) — eine **eigene Defense-in-Depth-Deny-Regel für die Auditor-Rolle** und Vergabe ausschließlich an das Betriebs-Team. Immer audit-pflichtig. Der Schwellwert-Report (`einfluss.befund`) läuft unter derselben Aktion.

**Datenschutz-Stufung:** Monatsaggregate aus `laufergebnis` liegen auf `read:verbrauch_aggregat`-Niveau und sind über `read:berechnungslauf` erreichbar. **Die Snapshot-Tageszeilen sind Detailniveau** (`read:verbrauch_detail`, ADR-0008 D4) und bekommen in v1 **keinen** eigenen Endpunkt — sie verlassen das System nur über den Export (ADR-0007).

**Neue `ResourceAttributes`:** `berechnungslauf?: { endkundeId, energietraeger, verfahrenCode, qualitaetsStufe }` und `einflussgroesse?: { endkundeId, systemId, groesseCode, betroffenerTyp }` — beide **PII-frei** (nie der Wert selbst), aufgelöst über `params['laufId']` bzw. `params['systemId']`. Klimadaten sind mandantenlos und tragen keine Ressourcenattribute.

| Methode | Pfad | Aktion |
|---|---|---|
| `POST` | `/analytics/endkunden/{endkundeId}/berechnungslaeufe` | `create:berechnungslauf` |
| `GET` | `/analytics/endkunden/{endkundeId}/berechnungslaeufe` | `read:berechnungslauf` (Filter `energietraeger`, `periode`, `nurAktuelle`) |
| `GET` | `/analytics/berechnungslaeufe/{id}` | `read:berechnungslauf` |
| `GET` | `/analytics/berechnungslaeufe/{id}/ergebnisse` | `read:berechnungslauf` (Monatszeilen inkl. Qualität) |
| `POST` | `/analytics/berechnungslaeufe/{id}/nachrechnen` | `create:berechnungslauf` (Nachfolgelauf + Differenz-Report, F7b) |
| `GET` | `/analytics/klimadaten/stationen/{stationRef}` | `read:klimadaten` |
| `POST` | `/analytics/klimadaten/import` | `create:klima_import` |
| `POST` | `/stammdaten/messkonzept-versionen/{id}/baseline-perioden` | `create:messkonzept_version` |
| `POST` | `/stammdaten/systeme/{systemId}/einflussgroessen` | `create:einflussgroesse` (Bezugsebene System, RL-B1) |
| `GET` | `/stammdaten/systeme/{systemId}/einflussgroessen` | `read:einflussgroesse` (Klartext, immer audit-pflichtig) |
| `PATCH` | `/stammdaten/einflussgroessen/{id}` | `update:einflussgroesse` (Korrektur / `gueltigBisMonat` setzen) |
| `GET` | `/stammdaten/endkunden/{endkundeId}/einflussgroessen/befunde` | `read:einflussgroesse` (TB-03-Report, Betriebs-Team) |

Alle schreibenden Routen: `Idempotency-Key`, Transaktion, `@Fachaktion`, `@AuditAction`; Zeitstempel UTC. Einflussgrößen-Werte erscheinen nie in Fehlermeldungen, Logs oder Problem-Details.

**Neue Audit-Event-Codes** (Namensschema `<entity>.<bereich>.<verb>`, Katalog per Migration `V0019`, alle zunächst RESERVIERT):

`berechnungslauf.bereinigung.angefordert`, `.abgeschlossen`, `.fehlgeschlagen`, `.ersetzt`, `klimadaten.import.durchgefuehrt`, `klimadaten.import.revision_erkannt`, `verfahren.katalog.aktiviert`, `baseline.periode.erfasst`, `einflussgroesse.stammdaten.erfasst`, `einflussgroesse.stammdaten.geaendert`, `einflussgroesse.stammdaten.einsicht`, `einflussgroesse.schwellwert.ueberschritten`.

**`erlaubte_kontext_keys` (PII-frei, `synthetic` überall enthalten — ADR-0010 D5 Rev. 1 als Lehre):**
- `berechnungslauf.*`: `synthetic`, `lauf_id`, `endkunde_id`, `energietraeger`, `verfahren_code`, `verfahren_version`, `periode_von`, `periode_bis`, `monate_anzahl`, `qualitaets_stufe`, `ersetzt_lauf_id`, `fehler_code`
- `klimadaten.import.*`: `synthetic`, `station_ref`, `von`, `bis`, `quelle`, `zeilen_anzahl`, `revision_anzahl`, `betroffene_laeufe_anzahl`
- `verfahren.katalog.aktiviert`: `synthetic`, `verfahren_code`, `verfahren_version`
- `baseline.periode.erfasst`: `synthetic`, `endkunde_id`, `energietraeger`, `von`, `bis`, `einheit`
- `einflussgroesse.stammdaten.*`: `synthetic`, `einflussgroesse_id`, `endkunde_id`, `system_id`, `groesse_code`, `gueltig_ab_monat`, `gueltig_bis_monat`, `betroffener_typ`, `quelle_typ`, `rechtsgrundlage`, `anzahl_saetze` (bei Batch-Einsicht) — `rolle_erfassen=true` für `.einsicht` (Klartext-PII-Lesen, analog `standort.pii.einsicht`)
- `einflussgroesse.schwellwert.ueberschritten`: `synthetic`, `system_id`, `groesse_code`, `schwellwert_code`, `zeitraum_von`, `zeitraum_bis`, `ueberschreitung_klasse`

**Verboten in jedem Kontext:** kWh-Mengen, Baseline-Werte, Temperaturen, Gradtagzahlen, **Einflussgrößen-Werte** (`wert_num`/`wert_code` — Personenanzahl und Nutzfläche sind die PII selbst), `anlass_code`, exakte Überschreitungsprozentsätze, jeder Adress-/Labelbestandteil. Verbrauchsmengen sind nach ADR-0008 D4 schutzwürdiges Detail und gehören nicht ins Audit-Log — nur `einheit`, nie `menge`.

## B11 — Offene Punkte aus Teil B

- ~~**O-B1** — Datenlizenz der Wetterquelle~~ → **GESCHLOSSEN (2026-07-24, `compliance-director`-Votum: kein Veto).** Quelle festgelegt: **DWD Open Data / CDC** unter **CC BY 4.0 bzw. GeoNutzV**, kommerzielle Nutzung ausdrücklich zulässig, **kein Copyleft** — Weitergabe abgeleiteter Werte (Gradtagzahlen, bereinigte Einsparwerte) im BAFA-Export ist gedeckt (Art. 2a CC BY). Die Förderauflage 5 greift nicht: sie adressiert „abhängige Open-Source-**Bibliotheken**", also Software, nicht Eingangsdaten. Rechtlich einschlägig ist nicht das Urheberrecht an Einzelwerten (Tatsachen), sondern das sui-generis-**Datenbankrecht** (§§ 87a ff. UrhG) — CC BY 4.0 lizenziert es in Art. 4 mit. **Kein AVV/TIA** (Dateidownload einer Bundesbehörde, keine Übermittlung von Betroffenendaten). `.claude/rules/dependencies.md` hat den Abschnitt **„Datenlizenzen"** erhalten; Register: `docs/datenquellen.md` (DQ-001).
  **Bindende Auflagen A-1…A-5:** (A-1, blockiert **nicht** die Implementierung, wohl aber den ersten Realbetrieb/Export) wörtlicher Quellenvermerk vor Inbetriebnahme aus den offiziellen Nutzungsbedingungen übernehmen — bis dahin Platzhalter als **eine** zentrale Konstante; (A-2) Attributions-Minimum-Set an drei Stellen — BAFA-Export inkl. Änderungsvermerk, Repo-Doku, kundengerichtete Ausgaben — als Teil der Definition of Done; (A-3) je Klimadatensatz Stations-ID, Zeitraum, Abrufzeitpunkt, Dateiversion und Lizenzkennung persistieren (Attributionsnachweis **und** Reproduzierbarkeit, ISO A.5.33); (A-4) ausschließlich Bulk-Abruf öffentlicher Dateien, **keine** Übermittlung von Endkunden-/Standort-/Zähler-Identifikatoren, Stationszuordnung nur lokal; (A-5) der Regelabschnitt gilt spätestens ab der nächsten Fremddatenquelle (Primärenergie-/Emissionsfaktoren).
  **Rote Linie:** keine echten DWD-Werte als Fixture/Seed im Repo — sonst kippt die Bewertung „kein CC-BY-Material im publizierten Artefakt" und der Vermerk wird auch im Repo Pflicht. Fixtures synthetisch (`.claude/rules/tests.md`).
  **Neuer Folgepunkt (nicht blockierend, an ADR-0007):** die **Stationszuordnung** ist im pseudonymisierten BAFA-Export ein grobes Geolokations-Attribut und damit bei kleinen Kohorten ein Re-Identifikationsvektor — `bafa-export-engineer`/`dsgvo-auditor`.
- **O-B2 — Berechnungsmethodik GESCHLOSSEN, Zahlen-Sign-off offen (`compliance-director`, aus D6):** Abdeckungsformel je Monat und die Ausfallblock-Definition sind in **B12.4** fixiert; die Schwellwerte 90 % / 75 % und die 7-Tage-Blockregel sind aus Fernauslese-Erfahrungswerten technisch plausibel und werden bestätigt — die verbindliche fachliche Freigabe gegen TB-04/DE-02 bleibt bei `compliance-director`.
- **O-B3 — GESCHLOSSEN** durch **B12.2** (`baseline-engineer`): Grundlast-Vorschlagswerte je Energieträger als Erfassungshilfe (kein Systemdefault außer `strom ohne Elektroheizung/WP` und `kälte` = 1,0, D5-Grundsatz „expliziter Parameter" bleibt unangetastet). Fachliche Letztverantwortung gegenüber der Behörde bleibt beim Energieberater (Teil A O7) — Software liefert Vorschlagswerte, keine Freigabe.
- **O-B4 (`retention-engineer` + `compliance-director`):** Aufbewahrung der Snapshots (an den Lauf gebunden, nicht an die Rohzeitreihe) und ihr Verhältnis zu Krypto-Shred und `drop_chunks`-Löschläufen.
- **O-B5 (`compliance-director`, ADR-0010 O2):** Grobkörnigkeit von `klimareferenz`. Zusätzlich neu: Verhalten bei mehreren divergierenden Klimareferenzen je Bezugsobjekt ist hier auf fail-closed gesetzt — Bestätigung erbeten.
- **O-B6 (`database-lead`):** Sizing und Index-Schnitt von `analytics.eingang_messwert_tag` (Zeilen je Endkunde/Jahr/Lauf), Wirksamkeit des Content-Addressing-Dedups, Migrationszuschnitt `V0019`.
- **O-B7 — GESCHLOSSEN** durch **B12.3** (`baseline-engineer`): kein eigener Faktoren-Tabellensatz in v1 — Strom/Wärme/Kälte brauchen keine Brennwertumrechnung (bereits kWh/MWh), Gas wird in der abgerechneten Einheit (heute fast durchgängig kWh) übernommen statt systemseitig aus Brennwert × Zustandszahl neu gerechnet, Öl bekommt einen einzelnen Verfahrensparameter (`oel_heizwert_kwh_je_liter`, **fachlich zu bestätigen**), Biomasse bleibt ohne v1-Automatik (Erweiterungsstelle benannt).
- **O-B8 — GESCHLOSSEN** durch B8/D8 (`compliance-director`-Votum 2026-07-24, A1–A5 eingearbeitet; Teil A F5/O6 damit beantwortet). Nicht mehr vertagt.
- **O-B9 (`retention-engineer` + `compliance-director`, aus A2):** konkrete Löschfrist für `einfluss.*` (an die BAFA-Nachweispflicht gebunden, nicht an die Vertragsdauer) **und** Ergänzung des Shred-Reports um den ausdrücklichen Ausweis „Einflussgrößen sind nicht Teil des Krypto-Shreds".
- **O-B10 (`compliance-director` + `product-director`, aus A4):** Verfahren für die **Art.-14-Information des Anschlussnutzers** als Vorbedingung produktiver Erfassung (das DB-Feld `art14_information_at` erzwingt den Nachweis, nicht den Prozess) sowie Ablage der dokumentierten lit.-f-Abwägung, auf die `abwaegung_ref` zeigt.
- **O-B11 — GESCHLOSSEN** durch **B12.5** (`baseline-engineer`): Wertelisten `nutzungszweck`, `anlass_code`, `ueberschreitung_klasse` festgelegt — unverändert innerhalb der bereits von `compliance-director` (A1–A5) geprüften Kategoriegrenzen, daher kein neues Votum nötig.

## B12 — Rechenmodell v1 (finalisiert) (`baseline-engineer`, 2026-08-19)

Domänen-Review von D5 (Formel/Konstanten) und Abschluss von O-B2 (Methodik) / O-B3 / O-B7 / O-B11. Rollt F1/F3/D5/D6/D8 **nicht** neu auf — nur Zahlen, Formeln und Wertelisten.

### B12.1 — Formel vollständig, mit Konstanten

**Gradtagzahl (VDI 3807), Tagesbasis:**

```
gtz_tag(d) = (t_innen − t_mittel(d))   falls t_mittel(d) < t_heizgrenze, sonst 0     [Kd]
GTZ_m      = Σ_{d ∈ Monat m} gtz_tag(d)                                             [Kd]
GTZ_base   = mittlere JAHRES-GTZ über die Baseline-Bezugsjahre, gleiche Station      [Kd/a]
GTZ_norm   = GTZ der Normperiode (langjähriges Stationsmittel), gleiche Station      [Kd/a]
```

`t_mittel(d)` = Tagesmitteltemperatur der zugeordneten Station (aus `analytics.klima_tag`/`eingang_klima_tag`), lokaler Kalendertag (D4-Zeitbasis).

**Konstanten- und Parametertabelle** (Teil von `verfahren_version.parameter_schema`, je Lauf eingefroren):

| Parameter | Symbol | Default | Einheit | Bedeutung | Status |
|---|---|---|---|---|---|
| Raum-/Bezugstemperatur | `t_innen` | **20** | °C | Angenommene Innentemperatur | gesetzt — VDI-3807-Standardwert |
| Heizgrenztemperatur | `t_heizgrenze` | **15** | °C | Tagesmittel-Schwelle, unterhalb derer geheizt wird | gesetzt — VDI-3807-Standardwert |
| Tage pro Jahr (Grundlast-Proration) | `tage_pro_jahr` (`d_a`) | **365,25** | d | Vermeidet Schaltjahr-Jitter bei mehrjährigem Baseline-Bezug | gesetzt |
| Heizwert Heizöl EL | `oel_heizwert_kwh_je_liter` | **10,0** | kWh/l | Liter→kWh bei literbasierten Öl-Abrechnungen (B12.3) | **fachlich zu bestätigen** (Energieberater) |
| Normperiode | `normperiode` | **1991–2020** | — | WMO-Referenzperiode für `GTZ_norm` | **fachlich zu bestätigen** (Stationsdatenverfügbarkeit beim Adapter, O-B1/A-3) |

Eine feiner nach Nutzungsart differenzierte `t_innen`/`t_heizgrenze` (z. B. Büro vs. Wohnen) ist in v1 **nicht** vorgesehen — ein Parametersatz je Lauf, keine Nutzungsart-Matrix. Erweiterungsstelle, falls Gewerbekunden das fachlich verlangen.

**Grundlast-Zerlegung** (`g` = witterungsunabhängiger Anteil, 0…1, Definition unverändert aus B5):

```
B_grund = B_a · g          B_witt = B_a · (1 − g)          [kWh/a]
```

**Monatliche bereinigte Vergleichsgröße (Referenz) und Ist-Verbrauch** (unverändert aus B5, hier mit vollständiger Variablenliste):

```
R_m = B_grund · (d_m / d_a)  +  B_witt · (GTZ_m^ist / GTZ_base)      [kWh]
A_m = Σ_{d ∈ m} wert_kwh(d)     aus dem eingefrorenen Tages-Snapshot [kWh]
```

| Symbol | Bedeutung | Einheit | Herkunft |
|---|---|---|---|
| `B_a` | Baseline-Jahreswert (TB-02, Mittel der letzten 3 Jahresabrechnungen) | kWh/a | `messkonzept_version_energietraeger.baseline_wert`, normiert (B12.3) |
| `g` | Grundlastanteil | dimensionslos (0…1) | `analytics.berechnungslauf.grundlast_anteil`, expliziter Parameter (B12.2) |
| `d_m` | Kalendertage im Ausweismonat | d | Kalender |
| `d_a` | Tage pro (Baseline-)Jahr | d | Konstante `tage_pro_jahr` = 365,25 |
| `GTZ_m^ist` | Gradtagzahl des Ist-Monats, Vergleichsstation | Kd | `laufergebnis.gtz_ist` |
| `GTZ_base` | mittlere Jahres-GTZ der Baseline-Bezugsjahre | Kd/a | `berechnungslauf.gtz_base` |
| `A_m` | gemessener Ist-Verbrauch des Monats | kWh | Tages-Snapshot (`eingang_messwert_tag`) |
| `R_m` | witterungsbereinigte Vergleichsgröße (Referenz) | kWh | Ergebnis, `laufergebnis.referenz_kwh` |

**Ausgewiesene wetterneutrale Baseline** (Kennzahl, keine Rechengröße):

```
B_norm = B_grund + B_witt · (GTZ_norm / GTZ_base)      [kWh/a]
```

**Formaler Nachweis, dass `GTZ_norm` sich aus der Einsparrechnung heraushebt:** `GTZ_norm` kommt ausschließlich in `B_norm` vor. Weder `R_m` noch `A_m` enthalten den Term. Die Einsparung eines Förderjahres (ADR-0007) ist `Σ_m (R_m − A_m)`; da `B_norm` in dieser Summe nicht auftaucht, ist jede Wahl der Normperiode (WMO 1991–2020, 1961–1990, …) folgenlos für die ausgewiesene Einsparung — sie verändert nur die kommunizierte Baseline-Kennzahl. Ein Normperioden-Wechsel erzwingt **keine** Neuberechnung von `R_m`/`A_m`, wohl aber eine neue Ausweisung von `B_norm` (gleicher Lauf, keine neue Version nötig, da kein Rechenparameter von `R_m`).

### B12.2 — O-B3: Grundlast-Vorschlagswerte je Energieträger

**Bleibt unangetastet (D5):** `g` ist ein **expliziter, begründungspflichtiger** Parameter je (Messkonzept-Version, Energieträger) — keine automatische Herleitung in v1. Die folgende Tabelle liefert **Vorschlagswerte für die Erfassungsmaske** (Erfassungshilfe), keine stillen Systemdefaults — mit **einer** Ausnahme, die aus physikalischer Notwendigkeit ein echter Systemdefault ist (strom ohne Elektroheizung/Wärmepumpe, kälte in v1).

| `energietraeger` | Vorschlagswert `g` | Charakter | Begründung |
|---|---|---|---|
| `strom` (ohne Elektroheizung/Wärmepumpe im Systemumfang) | **1,0** | Systemdefault | Haushalts-/Gewerbestrom (Licht, Kühlschrank, IT) korreliert nicht mit Außentemperatur |
| `strom` (mit Elektroheizung/Wärmepumpe im Systemumfang) | — kein Vorschlag | Pflichterfassung | wärmegeführter Anteil ist objektspezifisch (Anlagentechnik, COP) |
| `kaelte` | **1,0** | Systemdefault, **Scope-Grenze** | Kühlbedarf folgt Kühlgradtagen (Sommer), nicht der Heizgradtag-Formel aus B12.1 — Kühlgradtage sind **außerhalb v1-Scope** (§39: „wärmegeführte Energieträger"); `g=1` heißt hier „v1 bereinigt Kälte nicht", nicht „Kälte ist witterungsunabhängig" |
| `waerme` (Fern-/Nahwärme, Heizwärme) | 0,20 (Ausgangswert) | Erfassungshilfe | Trinkwarmwasser-/Zirkulationsanteil, stark objektspezifisch (Baujahr, Dämmstandard, Personenzahl) |
| `gas` | 0,20 (Ausgangswert) | Erfassungshilfe | wie Wärme, zusätzlich ggf. Kochen |
| `oel` | 0,15 (Ausgangswert) | Erfassungshilfe | Heizöl fast ausschließlich Heizzweck, TWW-Anteil geringer als bei Gas/Wärme-Kombianlagen |
| `biomasse` | 0,10 (Ausgangswert) | Erfassungshilfe | fast ausschließlich Heizzweck; Kombianlagen mit TWW seltener als bei Gas |

**Wo `g` MUSS erfasst statt geraten werden:** bei jedem wärmegeführten Energieträger (`waerme`, `gas`, `oel`, `biomasse`) sowie bei `strom` mit Elektroheizung/Wärmepumpe im Systemumfang — dort gibt es **keinen** Vorschlagswert, das Feld ist ohne Vorbelegung Pflicht. Die vier Ausgangswerte oben (0,10–0,20) sind Erfahrungswerte aus der TWW-Anteils-Literatur, **fachlich zu bestätigen** durch den Energieberater (Teil A O7) — Software haftet nicht für die Zahl, sie erzwingt nur, dass eine dokumentierte steht.

### B12.3 — O-B7: Einheiten-/Brennwertumrechnung

`B_a` und `A_m` sind immer in kWh (D5, unverändert). Kein eigener Faktoren-Tabellensatz in v1:

- **Strom, Wärme, Kälte:** keine Brennwertfrage. Abrechnungen/Zähler liefern bereits kWh bzw. MWh (Faktor 1000, trivial).
- **Gas:** **kein** systemweiter Brennwert-Faktor in v1. Deutsche Gasabrechnungen weisen den Verbrauch inzwischen fast durchgängig direkt in kWh aus (Brennwert `Hs` und Zustandszahl `z` sind netz-/zeitraumspezifische Abrechnungsparameter des Versorgers, nicht systemseitig vorhersagbar — ein pauschaler Systemfaktor wäre genau das R5-Risiko „plausibel, aber falsch"). Erfassungsregel: Baseline in der auf der Abrechnung ausgewiesenen kWh-Zahl. Für die seltene reine m³-Abrechnung: `Hs`/`z` werden als **Beleg-gebundene Einzelwerte** an `energy.baseline_periode` erfasst (Erweiterungsstelle für ADR-0007-Beleg-Ablage), **keine** Systemkonstante.
- **Öl:** literbasierte Abrechnung ist die Regel, ohne individuellen Brennwertausweis. Ein fester Verfahrensparameter ist hier sachgerecht: `oel_heizwert_kwh_je_liter = 10,0` (Heizöl EL, Standard-Literaturwert, **fachlich zu bestätigen**, B12.1-Tabelle).
- **Biomasse:** keine v1-Automatik. Einheiten (Ster, Schüttraummeter, Tonne) sind zu heterogen (Holzart, Wassergehalt) für einen belastbaren Systemfaktor. Erfassung nur in kWh, sofern vom Betrieb ermittelbar (z. B. Lieferschein-Angabe); sonst bleibt das Messkonzept für diesen Energieträger ohne automatische Bereinigung dokumentiert. Erweiterungsstelle für eine spätere Version mit eigener Umrechnungstabelle explizit benannt, nicht gebaut.

Strukturentscheidung O-B7 (Tabelle vs. Verfahrensparameter): **kein eigenes Tabellenkonstrukt in v1** — der einzige echte Systemfaktor (`oel_heizwert_kwh_je_liter`) ist ein einzelner Skalar und gehört in `verfahren_version.parameter_schema` wie `t_innen`/`t_heizgrenze`. Eine eigene `analytics.umrechnungsfaktor`-Tabelle (mit Gültigkeitszeitraum, z. B. für regional differenzierte Gas-Brennwerte) ist die benannte Erweiterungsstelle, falls Gas/Biomasse später automatisiert werden sollen.

### B12.4 — O-B2: Datenqualitäts-Schwellen, Berechnung der Abdeckung

**Abdeckung je Ergebniszeile (Monat):**

```
abdeckung_pct = 100 · tage_gemessen / tage_gesamt
```

- `tage_gesamt` = Kalendertage im Monat (`d_m`) — TB-09 verlangt ≥ 1 Messwert/Tag, also ist die **erwartete** Kadenz „ein Wert pro Kalendertag" und der Nenner braucht keine feinere Auflösung.
- `tage_gemessen` = Anzahl Tage, an denen der Tageswert aus Messwerten mit `measurement.rang(qualitaet, herkunft)` ∈ {Rang von `gemessen`, Rang von `korrigiert`} gebildet wurde (die beiden höchsten Ränge der bestehenden Skala, V0013) — „gemessen/korrigiert zählen als gemessen" (B6, hier operationalisiert).
- `tage_geschaetzt`, `tage_ersatz`, `tage_fehlend` — Rest der Kalendertage, disjunkt, Summe = `tage_gesamt`.

**Ausfallblock (TB-04):** längste zusammenhängende Folge von Kalendertagen im Monat, an denen **kein** Tageswert mit Rang `gemessen`/`korrigiert` vorliegt — also `geschätzt`, `ersatzwert` oder vollständig fehlend zählen als Ausfalltag für die Blockregel. Grund: TB-04 adressiert Ausfälle der **Mess-/Übertragungstechnik**; ein geschätzter oder ersatzweise eingesetzter Tageswert belegt genau das, ein tatsächlich gemessener oder nachträglich korrigierter nicht.

**Schwellwerte — technisch plausibilisiert, Zahlen-Freigabe bleibt bei `compliance-director` (O-B2 bleibt dafür formal offen):**

| Abdeckung | Stufe | Wirkung |
|---|---|---|
| ≥ 90 % **und** kein Ausfallblock > 7 zusammenhängende Tage | `belastbar` | uneingeschränkt ausweisbar |
| 75 – < 90 % **oder** Ausfallblock > 7 Tage | `eingeschraenkt` | ausweisbar mit Kennzeichnung + Pflichtkommentar (TB-04-Bezug) |
| < 75 % | `nicht_ausweisbar` | wird berechnet und gespeichert, als Lücke markiert |

90 % entspricht bei einem 30-Tage-Monat höchstens 3 Nicht-Gemessen-Tagen — konsistent mit den in LoRaWAN-Funknetzen üblichen Verfügbarkeitsraten im Normalbetrieb; 75 % ist als unterer Boden noch aussagekräftig genug für eine Monatsvergleichsgröße, ohne Einzelausfälle sofort zu bestrafen. Die 7-Tage-Blockregel unterscheidet nach TB-04-Logik gleichmäßig verteilte Einzelausfälle von einem zusammenhängenden Technikausfall.

### B12.5 — O-B11: Geschlossene Wertelisten

**`nutzungszweck`** (unverändert die im `compliance-director`-Votum A3 bereits geprüfte Grenze — keine Art.-9-nahen Einrichtungskategorien):

`wohnen` · `buero` · `handel` · `produktion` · `lager` · `sonstige`

**`anlass_code`** (administrativer Auslöser einer Einflussgrößen-Änderung, kein personenbezogener Freitext — unterscheidet sich von `quelle_typ`, das den *Melder* trägt, nicht den *Grund*):

| Code | Bedeutung |
|---|---|
| `ersterfassung` | erste Erfassung dieser Einflussgröße für das System |
| `turnusaktualisierung` | reguläre periodische Neuerhebung (z. B. jährliche Abfrage) |
| `korrektur` | Berichtigung eines fehlerhaft erfassten Werts |
| `systemgrenzenaenderung` | Änderung von System/Messkonzept-Version |
| `meldung_aenderung` | aktiv gemeldete Nutzungs-/Belegungsänderung, ohne weitere Spezifizierung des Anlasses |
| `sonstige` | Restkategorie |

**`ueberschreitung_klasse`** (Klassen statt Rohprozentsatz, für `einfluss.befund` — B10 verbietet exakte Prozentsätze im Audit-Log; die Klasse ist ein Vielfaches des jeweiligen TB-03-Schwellwerts, nicht des Rohwerts):

| Klasse | Bereich (× TB-03-Schwellwert) | Bedeutung |
|---|---|---|
| `schwelle_ueberschritten` | 1,0× – < 1,5× | Anzeigepflicht ausgelöst, knapp über der Grenze |
| `deutlich_ueberschritten` | 1,5× – < 3,0× | deutlich über der Grenze |
| `stark_ueberschritten` | ≥ 3,0× | weit über der Grenze |

Alle drei Listen sind `CHECK`/FK-fähig als Katalog- bzw. Enum-Werte; keine der Listen enthält einen personenbezogenen oder Art.-9-nahen Wert.

### B12.6 — Golden Vectors, Startsatz v1

Verfahren `witterung_gtz_vdi3807`, Version 1. Parameter wie B12.1 (`t_innen=20`, `t_heizgrenze=15`, `tage_pro_jahr=365,25`). Drei Vektoren decken ab: gemischte Grundlast/Witterungs-Aufteilung, den Grenzfall `g=1` (keine Witterungsabhängigkeit) und den Grenzfall `GTZ_m=0` (Sommermonat bei wärmegeführtem Träger). Werte auf `numeric(18,3)` gerundet (Schema `laufergebnis.referenz_kwh`).

| Vektor | `energietraeger` | `B_a` [kWh/a] | `g` | `GTZ_base` [Kd/a] | Monat | `d_m` | `GTZ_m^ist` [Kd] | erwartetes `R_m` [kWh] |
|---|---|---|---|---|---|---|---|---|
| V1 | `gas` | 20 000 | 0,20 | 3 500 | Januar | 31 | 400 | **2168,065** |
| V2 | `strom` | 3 000 | 1,00 | — (irrelevant, `B_witt=0`) | Juli | 31 | 0 | **254,620** |
| V3 | `gas` | 20 000 | 0,20 | 3 500 | August | 31 | 0 | **339,493** |

Rechnung V1: `B_grund = 20000·0,20 = 4000`, `B_witt = 16000`; `R_m = 4000·(31/365,25) + 16000·(400/3500) = 339,493 + 1828,571 = 2168,065` kWh. Zusatzprüfung `B_norm` mit `GTZ_norm = 3400 Kd/a`: `B_norm = 4000 + 16000·(3400/3500) = 19542,857` kWh/a — bestätigt, dass `GTZ_norm` nicht in `R_m` eingeht (B12.1).

Rechnung V2: `B_grund = 3000` (reine Grundlast, `g=1`); `R_m = 3000·(31/365,25) = 254,620` kWh — unabhängig vom (hier irrelevanten) `GTZ_m^ist`. Regressionsschutz: bricht, falls jemand `g=1` nicht mehr als reinen Proration-Fall behandelt.

Rechnung V3: identische Baseline wie V1, aber `GTZ_m^ist = 0` (kein Heizbedarf im August); `R_m = 339,493 + 16000·(0/3500) = 339,493` kWh — Regressionsschutz gegen eine Division-durch-Null- oder Vorzeichen-Falle bei `GTZ_m=0`.

Ablage gemäß D3-Konvention `tests/golden/verfahren/witterung_gtz_vdi3807@1.json`:

```json
[
  {"vektor": "V1", "energietraeger": "gas", "B_a_kwh": 20000, "g": 0.20,
   "gtz_base_kd": 3500, "monat": "2027-01", "d_m": 31, "gtz_m_ist_kd": 400,
   "erwartet_r_m_kwh": 2168.065,
   "zusatz": {"gtz_norm_kd": 3400, "erwartet_b_norm_kwh": 19542.857}},
  {"vektor": "V2", "energietraeger": "strom", "B_a_kwh": 3000, "g": 1.00,
   "gtz_base_kd": null, "monat": "2027-07", "d_m": 31, "gtz_m_ist_kd": 0,
   "erwartet_r_m_kwh": 254.620},
  {"vektor": "V3", "energietraeger": "gas", "B_a_kwh": 20000, "g": 0.20,
   "gtz_base_kd": 3500, "monat": "2027-08", "d_m": 31, "gtz_m_ist_kd": 0,
   "erwartet_r_m_kwh": 339.493}
]
```

Weitere Vektoren (Schaltjahr-Grenzfall, `g=0`, mehrjährige Baseline mit `baseline_klima_fallback=true`) sind vor Phase 3 zu ergänzen — dieser Satz ist der Startsatz, kein Vollständigkeitsanspruch.

---

# Teil C — Phase 3 (Compliance) & Phase 4 (Implementation)

- **Status:** implementiert (Code), ADR gesamt weiter **proposed** bis technical-director/User-Freigabe.
- **Datum:** 2026-08-19 · **Commit:** `edaa34a` (`feat(berechnung)`) + M1/M2/P1/P5b-Nachtrag.

## C1 — `compliance-director`-Votum zur Berechnungslauf-Persistenz (2026-08-19): kein Veto, fünf bindende Auflagen A6–A10

Nachtrag P1 (dsgvo-auditor, Phase 5): Dieses Votum wurde bei der Phase-3-Prüfung
der `analytics`-Persistenz abgegeben, war aber zunächst nur in den
Migrationsköpfen (V0019/V0021) als „Arbeitsauftrag" zitiert, ohne Fundstelle im
ADR — analog zum A1–A5-Eintrag hier vollständig dokumentiert, inkl.
Umsetzungs-Mapping. Kern der Prüfung: der **`analytics`-Snapshot überlebt das
Endkunde-Krypto-Shredding als pseudonymes Nachweisartefakt** — das Shred
vernichtet den Re-Identifikationsschlüssel in `identity` (Art. 17 erfüllt), die
pseudonyme Kopie in `analytics` bleibt unter **Art. 17(3)(b)** (BAFA-Nachweispflicht).

- **A6 — Grants/REVOKE, Least-Privilege-Rollentrennung.** Umsetzung V0019/V0020:
  eigener Owner `edms_analytics_owner` (NOLOGIN, nicht `edms_app` — sonst greift
  `REVOKE` nicht); `edms_app` erhält NUR `INSERT/SELECT` auf den
  Nachweis-/Snapshot-Tabellen (nie UPDATE/DELETE → integrationsbewiesen `42501`);
  dedizierte `edms_retention` mit `DELETE` nur auf die sieben Nachweis-/Snapshot-
  Tabellen; eigene `edms_analytics_detail_reader` für die Tages-Detail-Snapshots
  (`read:verbrauch_detail`, in v1 ohne Konsument); eigene `edms_einfluss`
  (spaltenscharfes `UPDATE` nur auf Intervall-Schließung).
- **A7 — Retention-Mechanik + Shred-Report-Ausweis.** Umsetzung: getrennte
  mutable `analytics.lauf_retention_status` (1:1, `nachweis_gebunden`/`legal_hold`)
  hält das Nachweisartefakt selbst statusfrei/unveränderlich. Der geforderte
  **Ausweis im Shred-Report** („N Läufe/Intervalle bewusst NICHT geschreddert")
  ist mit P5b nachgezogen (`ShreddingErgebnis.analyticsLaeufeUnveraendert` /
  `einflussIntervalleUnveraendert`, s. C3). Konkrete **Löschfrist** bleibt offen
  (O-B4/O-B9, `retention-engineer` + `compliance-director`).
- **A8 — PII-Kommentare.** Umsetzung V0019/V0020: `analytics.*.endkunde_id`/
  `wert_kwh` als `pii=false (pseudonym) … shred=nein — Re-ID-Schluessel in
  identity`; `einfluss.intervall.wert_num/wert_code` als `pii=true` (Personenzahl/
  Nutzfläche sind der Wert selbst).
- **A9 — `synthetic` in jeder Audit-Whitelist, Wert-Keys verboten.** Umsetzung
  V0021 + DB-Trigger `audit.event_seal()` (fail-closed `RAISE EXCEPTION` bei
  Kontext-Key außerhalb Whitelist) + `AuditService.append()` ausschließlich über
  `SECURITY DEFINER`. `baseKontext()` emittiert nur pseudonyme/strukturelle Keys.
- **A10 — Sperr-Zustand blockt `create:berechnungslauf`.** Umsetzung
  `BerechnungslaufService.starten()`: `verarbeitungs_status != 'aktiv'` → 409 als
  allererster Schritt, vor jedem Schreibzugriff (integrationsbewiesen: 0 Zeilen).
  Residualrisiko P4 (nur App-Scope, kein DB-Backstop) — s. C4.

## C2 — Phase-4-Implementierung (Modul `berechnung`)

Schema V0019–V0021 angewendet; NestJS-Modul mit reinem B12-Rechenkern (13/13,
Golden Vectors exakt), Golden-Vector-Bootstrap-Guard (fail-closed bei Kern-Drift),
content-addressed Snapshots, append-only Schreibpfad, KlimaQuellePort-Naht
(synthetisch; echter DWD-Abruf = Folgepaket `integration-engineer`).
Verifikation: tsc 0, eslint 0, **597/597 Unit**, **berechnung-Integration grün**
(Happy/A10/Append-only/Snapshot-Dedup/ABAC/M1/M2), 4/4 Contract.

## C3 — Phase-5-Reviews (2026-08-19)

- **`security-auditor`:** kein Critical/High. Behoben: **M1** (Lauf-Spanne >120
  Monate → 400, Resource-Exhaustion), **M2** (`stationRef`-Whitelist gegen
  Path-/URL-Injection vor dem DWD-Paket). Offen als Auflage: **M3** (Secret-Scan-
  Hook-Muster erweitern, `devops-lead`), **L1** (Dev-Passwort im Realm-Import pro
  Environment generieren, `devops-lead`).
- **`dsgvo-auditor`:** kein Veto; Pseudonymitäts-/Shred-Architektur bestätigt.
  Nachgezogen: **P1** (dieser Abschnitt), **P5b** (Shred-Report-Ausweis:
  `ShreddingErgebnis` zählt beim Shred die bewusst erhaltenen `analytics`-Läufe
  und `einfluss`-Intervalle mit Rechtsgrundlage-Vermerk Art. 17(3)(b)).

## C4 — Offene Auflagen aus Phase 5 (vor produktiver Aktivierung)

- **P2** (`compliance-director`): der LIA-CHECK erzwingt `abwaegung_ref`/
  `art14_information_at` nur für `betroffener_typ='anschlussnutzer'`. Für
  `endkunde` + `rechtsgrundlage='art6_1f'` ist die gleiche Absicherung offen —
  bewusst bestätigen (Art.-13-Vertragspartner) oder CHECK erweitern.
- **P4** (`technical-director`/`security-lead`): A10 nur App-Scope. Entscheiden:
  DB-`BEFORE INSERT`-Trigger als Backstop (analog Audit-Seal) **oder**
  Single-Writer-Invariante dokumentieren + per Architekturtest erzwingen.
- **P5/O-B4/O-B9** (`retention-engineer` + `compliance-director`): konkrete
  Löschfrist für `analytics`/`einfluss`.
- **P6/Q7** (`compliance-director`, `compliance/**` gated): RVT VT-0001-Nachtrag
  (neue Datenkategorie Einflussgrößen + Retention-Ausnahme), DSFA-0001-Delta
  (WP248-Schwelle ≥2 erreicht: Kombination #6 + schwache Position #7), TOMs
  (Rollen `edms_einfluss`/`edms_analytics_*`), Betroffenenrechte-Runbook
  (Art. 15/17/18-Fluss für `analytics`/`einfluss`).
- **P3** (Info): `einfluss.*` hat in v1 noch keine Backend-Implementierung
  (Schema + CHECK vorhanden, kein Repository/Controller) — A4 bislang nur
  DB-seitig verifiziert. Einflussgrößen-CRUD ist ein Folgepaket.

## C5 — Abarbeitungsstand der Phase-5-Auflagen (2026-08-20)

- **P3 — GESCHLOSSEN.** Einflussgrößen-Backend (`stammdaten/einflussgroesse`)
  gebaut (CRUD + Befund-Lesen, Klartext-PII-Härtung: Auditor-Deny im PDP,
  auditierte Einsicht, Art.-14 im Code) + Betriebs-UI (Erfassen/Liste/
  Korrigieren, betrieb-only, auditierte Klartext-Einsicht). A4 ist damit auch
  app-seitig durchgesetzt (Zod-`superRefine` spiegelt die DB-CHECKs).
- **P6/Q7 — GESCHRIEBEN (Signatur `compliance-director` ausstehend).**
  Nachträge durch `compliance-director` entworfen und geschrieben:
  `rvt.md` Rev. 8, `dsfas/dsfa-0001` Rev. 9 (Abschnitt 13, WP248 ≥2, 3 neue
  Risiken), `toms.md` Rev. 7 (Abschnitt 11), `betroffenenrechte.md` Rev. 7
  (Art. 15/17/18), `retention-matrix.md` Rev. 5. Alle `review`, Signatur offen.
- **P2 — MIGRATION V0022 (Entwurf, testcontainer-verifiziert).**
  `compliance-director`-Urteil A-1: Asymmetrie nur haltbar, wenn Endkunde immer
  auf `art6_1b`. Option A umgesetzt (`CHECK betroffener_typ <> 'endkunde' OR
  rechtsgrundlage = 'art6_1b'`); `art14_information_at` bewusst NICHT auf den
  Endkunden gespiegelt (Art. 13, nicht 14). UI-`superRefine` spiegelt die Regel.
  V0022 enthält zusätzlich den DELETE-Grant auf `einfluss.*` für `edms_einfluss`
  (O-B9-Vorbereitung).
- **P4 — MIGRATION V0023 (Entwurf, testcontainer-verifiziert), TEILWEISE.**
  Fail-closed `BEFORE INSERT`-Trigger auf `analytics.berechnungslauf` prüft die
  **Endkunde**-Sperre (Art. 18, DB-Backstop analog Audit-Seal). **Offen
  (`technical-director`/`access-control-engineer`):** die **Anschlussnutzer**-
  Sperre ist NICHT im Trigger — es fehlt eine `mvet_id→System`-Zuordnungstabelle,
  die Zeitraum-/Zeitzonen-Semantik ist ungeklärt, und die Wertemenge von
  `energy.anschlussnutzer.verarbeitungs_status` ist nicht per CHECK/Kommentar
  fixiert (kleiner, sofort machbarer Teilschritt). Bis dahin bleibt die
  Anschlussnutzer-Sperre App-Scope-Lücke (Status quo, nicht verschlechtert).
- **O-B4/O-B9 — FRIST VORGESCHLAGEN, numerischer Anker offen.**
  `compliance-director`-Urteil A-2: an die F2-Arbeitshypothese gekoppelt
  (5 J nach Schluss-Verwendungsnachweis, projektbezogene Löschuhr,
  `legal_hold`/`nachweis_gebunden` übersteuern), Verifikation gegen
  Zuwendungsbescheid/ANBest offen (**A-O6**). DELETE-Grant vorbereitet (V0022);
  Lösch-Job + pg_cron-Verdrahtung bleiben Ops-Scope (`retention-engineer`).
- **Neue Auflage:** V0022/V0023 sind Entwürfe — `compliance-director`/
  `technical-director`-Freigabe der Migrationen steht noch aus; Anwendung auf
  die Dev-DB erfolgt beim nächsten `dev-up.sh` (alle ausstehenden Migrationen).

## C6 — Nachtrag zu D7: `rohdaten_hash` und die dritte Snapshot-Art (2026-08-26)

**Anlass.** Bei der Verifikation von ADR-0007 Phase 4 fiel auf, dass die in
**D7/A5** bewusst entschiedene Lösung des DE-03/A5-Konflikts **nie zu Ende
gebaut** worden war. Der Befund im Einzelnen:

- `analytics.eingang_einflussgroesse` existierte seit V0019 und war **exakt
  nach A5 gebaut** (nur Code, Wert, Monatsintervall, System-Pseudonym — ohne
  Betroffenen-, Quellen-, Rechtsgrundlagen- und Anlass-Felder).
- `analytics.eingang_snapshot.art` erlaubte ausdrücklich `'einflussgroesse'`.
- **Aber:** `analytics.berechnungslauf` hatte **keine** Spalte, die auf diesen
  Snapshot zeigt, und es existierte **kein einziger Schreibpfad**.

Folge: **DE-03-Kategorie 3 war im BAFA-Export strukturell leer** — ein
Vollständigkeitsmangel am Kern-Projektziel, nicht bloß eine fehlende Bequemlichkeit.

**Zweiter Befund — ein Widerspruch zwischen ADR-Wortlaut und Code.** B7 sagt
über die Einflussgrößen wörtlich: *„sie gehen trotzdem in `rohdaten_hash` und
Snapshot-Identität ein"*. Für die **Snapshot-Identität** stimmte das (das
Content-Addressing aus V0019 gilt unverändert für `art='einflussgroesse'`). Für
den **`rohdaten_hash`** stimmte es **nicht**: der Service rechnete
`sha256Canonical([messwertHash, klimaHash])` — zwei Komponenten, keine dritte.
Der ADR behauptete damit mehr, als der Code tat.

**Auflösung (umgesetzt, 2026-08-26).**

1. **V0027** ergänzt `analytics.berechnungslauf.einflussgroesse_snapshot_id`
   (nullable FK auf `eingang_snapshot`). **V0028** liefert die fehlende
   Voraussetzung: die n:m-Zuordnung `mvet × System` — ohne sie gibt es keinen
   Weg von der `mvet_id` eines Laufs zu den Systemen, an denen
   `einfluss.intervall` hängt.
2. Der Berechnungslauf friert die im Lauf-Zeitraum gültigen Intervalle als
   pseudonyme Projektion ein. **A5 ist dabei strukturell durchgesetzt, nicht
   nur zugesichert:** die SQL-Projektion selektiert ausschließlich die sechs
   fachlichen Spalten — die Verwaltungsfelder werden gar nicht erst gelesen und
   können den Namensraum `analytics` deshalb nicht erreichen.
3. **`rohdaten_hash` — Präzisierung des D7-Wortlauts:** die dritte Komponente
   wird **nur eingerechnet, wenn tatsächlich ein Einflussgrößen-Snapshot
   entstanden ist**. Begründung: D7s „gehen … ein" gilt für Einflussgrößen, die
   **tatsächlich in die Rohdatenmenge eingegangen** sind; ein Lauf ohne
   Einflussgrößen im Scope hat semantisch keine dritte Rohdaten-Komponente, und
   ein synthetischer Platzhalter würde einen nicht vorhandenen Bestandteil
   **vortäuschen**. Praktische Folge: der Hash bleibt für jeden Lauf ohne
   Einflussgrößen **bytidentisch** zur bisherigen Zwei-Komponenten-Formel —
   **keine bestehenden Läufe werden gebrochen**; nur ein Lauf, der wirklich
   einen dritten Snapshot führt, bekommt einen strukturell neuen Hash-Raum.
   *Verworfene Alternative: die dritte Komponente immer einrechnen (ggf. mit
   Platzhalter) — hätte den Hash aller Bestandsläufe verändert, ohne dass sich
   an ihren Eingangsdaten etwas geändert hätte.*
4. **Export (ADR-0007):** die Kategorie liefert die eingefrorene Projektion,
   **klassiert** (A15). Läufe ohne Snapshot werden im Metablatt **sichtbar als
   ausgelassen** ausgewiesen statt still leer geliefert. Ein Test belegt, dass
   der gesamte Export-Quelltext **niemals** das `einfluss`-Schema referenziert —
   die B7-Zweckbindungsgrenze ist damit eine **geprüfte Eigenschaft** statt
   einer Zusicherung.

**Regelfall in v1 bleibt `NULL`.** Solange keine `mvet`-System-Zuordnungen
gepflegt sind, entsteht kein Snapshot. Das ist beabsichtigt und wird nicht
erzwungen — die Zuordnung ist ein Stammdaten-Pflegevorgang, kein Automatismus.

**Offen:** Der Lesezugriff auf `einfluss.*` ist in **einem** Repository
gekapselt; `edms_app` hat dort bewusst keinen Grant (D8.1). Für die spätere
`edms_app`-Laufzeit ist ein expliziter `SELECT`-Grant nötig — eigene Migration
+ `compliance-director`, bewusst nicht vorweggenommen.

## C7 — Nachtrag: die drei fehlenden Erfassungswege und die Herleitung von `g` (2026-09-10)

**Anlass.** Beim Aufbau des ersten echten Bestands (Pilotbestand A, fünf
Förderjahre) musste an drei Stellen per SQL gearbeitet werden, weil es keinen
Bedienweg gab. Das ist in einem ADR erwähnenswert, weil alle drei Stellen
**Eingangsgrößen der Rechnung** sind: Wer sie nur per Skript setzen kann, kann
sie auch nur per Skript falsch setzen — und genau das ist passiert.

### C7.1 — Systemgrenze (V0072) und Baseline-Periode (V0073) sind bedienbar

Beide Tabellen standen im Schema und hatten weder Repository noch API noch
Oberfläche:

- **`energy.messkonzept_version_energietraeger_system`** (V0028) entscheidet,
  WELCHE Zähler ein Lauf umfasst. Fehlt die Zuordnung, greift der
  `endkunde_fallback` und nimmt alle aktiven Zähler des Endkunden — bei
  mehreren Messkonzepten desselben Kunden fließt fremder Verbrauch ein
  (V0062, im Kettentest mit Faktor 11 gemessen).
- **`energy.baseline_periode`** (V0019) trägt die Zeiträume, aus denen
  GTZ_base als **Mittelwert der Gradtagzahl-Summen je Periode** gebildet wird
  — den Nenner der Witterungsbereinigung. `AnalyticsBaselinePeriodeRepository`
  konnte ausschließlich LESEN.

Beide haben seit V0072/V0073 eine Route
(`PUT /stammdaten/messkonzept-energietraeger/{mvetId}/systeme` bzw.
`…/baseline-perioden`), ein Audit-Ereignis und einen Abschnitt in der
Messkonzept-Detailansicht. Das Aufbau-Skript ruft jetzt die Fachdienste statt
SQL.

**Korrektur an C6.** Dort steht: *„Regelfall in v1 bleibt `NULL`. Solange
keine `mvet`-System-Zuordnungen gepflegt sind, entsteht kein Snapshot. … die
Zuordnung ist ein Stammdaten-Pflegevorgang, kein Automatismus."* Der zweite
Satz gilt weiter, der erste nicht mehr: Ein Pflegevorgang ohne Pflegeweg ist
kein Regelfall, sondern eine Sackgasse. Seit V0072 ist die Zuordnung
tatsächlich pflegbar, und DE-03-Kategorie 3 ist damit erstmals ohne Skript
erreichbar.

**Die Antwort der Baseline-Perioden-Route rechnet zurück, was die Eingabe
bedeutet** — `tage`, `letzterTag` (weil `bis` AUSSCHLIESSLICH ist),
`laengeAuffaellig` bei mehr als 40 Tagen Abweichung von einem Jahr,
`anzahlWeichtAb` gegen `baseline_abrechnungen_anzahl` (V0065) und
`mengeMittel` gegen `baseline_wert`. TB-02 verlangt den Mittelwert der
Jahresabrechnungen als Baseline; weichen die beiden Zahlen ab, stimmt eine von
beiden nicht.

> **Warum `laengeAuffaellig` ein Hinweis ist und keine Ablehnung.** GTZ_base
> ist der ARITHMETISCHE Mittelwert der Gradtagzahl-Summen, nicht der auf ein
> Jahr normierte. Eine Halbjahres-Periode schleppt eine halbe Jahressumme in
> den Mittelwert und zieht ihn nach unten; der Rechenweg gleicht das **nicht**
> aus. Ein unterjähriger Abrechnungszeitraum (Einzug, Versorgerwechsel) ist
> aber ein echter Fall. **Offen für `baseline-engineer`:** ob der Rechenweg
> statt des einfachen Mittels ein auf 365 Tage normiertes bilden sollte. Das
> wäre eine Änderung am Verfahren und damit versionspflichtig (D3).

### C7.2 — `GTZ_base := GTZ_norm` ist NICHT gebaut (Abweichung von B5)

B5 nennt als **Fallback ohne erfasste Perioden:** *„`GTZ_base := GTZ_norm`
(Annahme ‚Baseline entspricht Normalklima'), Lauf-Parameter
`baseline_klima_fallback=true`, im Ergebnis und im Export sichtbar
auszuweisen."*

Der Code tut das nicht. Er weist stattdessen fail-closed ab
(`GTZ_BASE_NICHT_ERMITTELBAR`), weil die Auflösung der Normperiode fehlt —
`GTZ_norm` entsteht heute nur, wenn jemand `gtzNormOverride` setzt. Ein
Fallback auf eine Größe, die selbst nur aus einer Handeingabe stammt, wäre
kein Fallback, sondern eine zweite Ratestelle mit amtlich klingendem Namen.

**Das ist die bessere Abweichung**, aber sie steht seit V0019 nur als
Fehlermeldung im Code. Hier festgehalten, damit ADR und Implementierung
dasselbe sagen. **Zu entscheiden (`baseline-engineer`):** Fallback ersatzlos
streichen oder mit einer echten Normperioden-Auflösung nachbauen.

### C7.3 — `GET /berechnung/parametervorschlag`: D5 zu Ende gebaut

D5 sagt: *„Sobald ≥ 12 Monate Ist-Daten vorliegen, liefert das System eine
**Plausibilisierung** von `g` gegen die Sommermonate als Report — Hinweis,
kein automatischer Parameterwechsel."* Diese zweite Hälfte von D5 war nie
gebaut. Sie ist es jetzt — und zwar nicht als nachgelagerter Report, sondern
**vor** dem Lauf, im Anlege-Formular.

```
g_vorschlag = min(1, Sommermittel / Jahresmittel)     [kWh/Tag ÷ kWh/Tag]
```

Sommer sind **Juli und August**: Dann heizt in Deutschland niemand, der
verbleibende Tagesverbrauch IST die Grundlast. Juni und September wären in
einem kalten Jahr bereits Heizmonate und würden sie nach oben verfälschen.
Bezugsfenster sind die erfassten `energy.baseline_periode`-Zeiträume; fehlen
sie, ersatzweise das erste Jahr der Messreihe — ausgewiesen über
`basisHerkunft`, weil das nicht das Baselinejahr sein muss. Die Aggregation
läuft über dieselbe `berechneTagesaggregation()` wie der Lauf selbst, damit
Vorschlag und Rechnung dieselben Zahlen sehen.

**Verhältnis zu B12.2.** B12.2 sagt *„keine automatische Herleitung in v1"*
und legt eine **Vorschlagswert-Tabelle je Energieträger** vor. Beides bleibt
gültig, wird aber präzisiert:

- Es gibt weiterhin **keine automatische Herleitung** im Sinne von B12.2 —
  der Wert wird nicht gesetzt, sondern **vorgeschlagen**, kommt mit seiner
  Rechnung zurück und ist überschreibbar. Genau das meinte D5 mit „Hinweis,
  kein automatischer Parameterwechsel".
- Wo Messdaten vorliegen, **verdrängt die Herleitung die Tabellenwerte**.
  B12.2 nennt die Ausgangswerte selbst „Erfassungshilfe", „stark
  objektspezifisch" und „fachlich zu bestätigen". Eine aus dem Bestand
  gerechnete Zahl ist in jeder Hinsicht besser als eine Literaturzahl.
- Die Tabelle bleibt für den Fall **ohne Messdaten** — Neukunde, erstes
  Förderjahr. Dort liefert die Route `grundlast: null`, und die Oberfläche
  sagt ausdrücklich, dass ein von Hand gesetzter Wert dann eine Schätzung ist.

**Empirischer Befund — die Tabellenwerte sind zu grob.** Gegen den
Pilotbestand A geprüft:

| Energieträger | B12.2-Tabelle | hergeleitet | Grundlage |
|---|---|---|---|
| `waerme` | 0,20 (Ausgangswert) | **0,126** | Sommer 7,213 / Jahr 57,211 kWh/Tag |
| `strom` | 1,0 (Systemdefault) | **1,0** | Sommer 386,5 kWh/Tag **über** Jahr 358,8 |

Der Wärmewert liegt **37 % unter** dem Tabellen-Ausgangswert. Beim Strom
bestätigt die Herleitung den Systemdefault unabhängig — und zeigt zugleich,
warum er gilt: Juli/August liegen hier *über* dem Jahresmittel (Kühlung,
Beleuchtung), der Verbrauch folgt der Heizwitterung also nicht. Die Deckelung
auf 1 ist genau dieser Fall.

**Was der Vorschlag sonst noch trägt.** Er ist nicht nur eine Zahl, sondern
die Antwort auf „ließe sich hier überhaupt rechnen": fehlender Baseline-Wert,
Einheit außer kWh (fail-closed, B12.3), kein aktiver Zähler, keine Messdaten,
keine Baseline-Periode — und die **leere Systemgrenze**. Die letzte ist die
wichtigste, weil der Lauf sie als einzige nicht selbst bemerkt: Er rechnet
still über alle Zähler des Kunden. Die Ansicht warnt davor, **hält aber nicht
auf** — es gibt Bestände mit genau einem Messkonzept, für die der Fallback
richtig rechnet.

Der Zeitraum wird nur mit **vollständigen** Monaten vorgeschlagen: Der Lauf
verlangt Monatsanfänge (v1-Einschränkung), und ein angeschnittener Monat
zählt jeden fehlenden Tag gegen seine Abdeckung (B12.4) — er fiele auf
`nicht_ausweisbar`.

### C7.4 — Warum das hier steht und nicht nur im Code

Der Grundlastanteil ist der einzige Lauf-Parameter, den man nicht nachschlagen
kann. Am 2026-09-08 stand für den Pilotbestand A ein geratenes `g = 0,25` im
Aufbau-Skript; die Folge war im Kundenportal zu sehen — jeder Sommermonat wies
6 000 bis 7 700 kWh **Mehrverbrauch** aus, während die Übersichtsblätter des
Kunden für dieselben Jahre sinkenden Verbrauch führten. Mit `g = 0,25` hängen
drei Viertel der Referenz an den Gradtagzahlen, und die gehen im Sommer gegen
null: Die Referenz sackt ab, der Ist-Verbrauch bleibt.

Ein Formular mit einem leeren Zahlenfeld hätte denselben Fehler eingeladen.
Deshalb schlägt der Server vor, und deshalb steht die Rechnung sichtbar unter
dem Feld — nicht damit man ihr glaubt, sondern damit man ihr widersprechen
kann.

### C7.5 — Offene Punkte aus C7

| # | Was | Wer |
|---|---|---|
| **C7-O1** | Sommerdefinition Juli/August bestätigen — oder auf eine Heizgradtag-Schwelle umstellen (dieselbe `t_heizgrenze` wie B12.1) | `baseline-engineer` |
| **C7-O2** | Deckelung `min(1, …)` bestätigen: Ein Sommer über dem Jahresmittel heißt „nicht wärmegeführt". Alternative wäre eine Warnung statt einer Deckelung | `baseline-engineer` |
| **C7-O3** | GTZ_base als einfacher Mittelwert über verschieden lange Perioden (s. C7.1) — normieren oder so belassen | `baseline-engineer`, versionspflichtig (D3) |
| **C7-O4** | B5-Fallback `GTZ_base := GTZ_norm` streichen oder nachbauen (C7.2) | `baseline-engineer` |
| **C7-O5** | B12.2-Tabelle um den Hinweis ergänzen, dass sie nur ohne Messdaten gilt — oder die Ausgangswerte anhand weiterer Bestände nachschärfen | `baseline-engineer` |

---

## C8 — F1 nachgezogen: das Standard-Messkonzept wird gerechnet (2026-09-16)

**Vom User entschieden (2026-09-16):** F1 geht von **(a)** auf **(a)+(b)** —
vereinfachtes **und** Standard-Messkonzept. Damit ist die in Teil A offen
gehaltene Tür („(a), … Datenmodell so schneiden, dass (b) additiv nachrüstbar
bleibt") durchschritten. **(c)**, die Mehrgrößen-Regression, bleibt zu.

### C8.1 — Der Anlass war ein Etikett, das nicht hielt

Beim Bau der Einsparungsnachweis-Mappe (V0075) fiel die Spalte „Modellgüte R²"
der BAFA-Vorlage auf. Sie blieb leer, und die Begründung dafür war richtig: Das
vereinfachte Verfahren passt nichts an, also gibt es keine Anpassungsgüte.

Beim Nachsehen im Bestand zeigte sich aber etwas anderes:

| Ebene | Stand vor C8 |
|---|---|
| Datenmodell | `messkonzept_version.typ` kennt `vereinfacht \| standard \| alternativ` (V0002), Pflichtfeld, validiert |
| Rechenmaschine | kannte **genau einen** Weg — die vereinfachte Form. `typ` wurde **nirgends gelesen** |
| Bestand | **alle** Messkonzept-Versionen standen auf `typ = 'standard'` |

Kein Rechenfehler — die Zahlen waren für das vereinfachte Verfahren korrekt.
Aber die Beschriftung behauptete ein Verfahren, das nicht lief, und im Nachweis
wäre genau das aufgefallen. Der Pilotbestand A erfüllt die Standard-Definition zudem
inhaltlich: `baseline_methode` sagt wörtlich, die Baseline stamme aus
übernommenen **Tageswerten** des ersten Förderjahres, nicht aus
Jahresabrechnungen. Das ist eine Vermessung im Sinne von Kap. 2.2.2, keine
Abrechnungsmittelung nach Kap. 2.1.2.

### C8.2 — Was das Merkblatt unterscheidet

| | vereinfacht (Kap. 2.1) | Standard (Kap. 2.2) | alternativ (Kap. 2.3) |
|---|---|---|---|
| Für wen | Haushalte und Vergleichbares, Verbrauch konstant oder begründet konstant | alle übrigen; sämtliche Zähler eines Energieträgers am Standort | Teilsysteme, Abweichungen vom Standard |
| Baseline | Mittelwert aus den letzten drei Jahresabrechnungen (TB-02) | durch **Vermessung** des Systems zu erheben | wie Standard |
| Bereinigung | nur Witterung, sonst nichts | über den ermittelten Zusammenhang Verbrauch ↔ Einflussgrößen/Nutzen | wie Standard |
| Nutzen | wird ausdrücklich nicht betrachtet | ist zu betrachten | — |

Kap. 2.2.2 verlangt zusätzlich mindestens eine Aussage zum
**einflussunabhängigen Anteil** des Verbrauchs. Das ist a₀ — im angepassten
Modell eine gemessene statt einer gesetzten Größe.

**Ein R² verlangt das Merkblatt an keiner Stelle.** Kap. 2.2.3 sagt nur, das
Bereinigungsverfahren sei in der Projektskizze verständlich darzustellen. Die
R²-Spalte der Vorlage geht über die Auflage hinaus; wir füllen sie, weil wir
die Zahl haben, nicht weil sie gefordert wäre.

### C8.3 — Der Rechenkern bleibt unangetastet

Das ist die tragende Entscheidung. Die Monatsreferenz hat seit B12.1 die Form

```
R_m = a₀ · (d_m / d_a)  +  b₁ · GTZ_m
```

und **beide** Messkonzepte teilen sie. Sie unterscheiden sich allein in der
Herkunft der Koeffizienten:

```
vereinfacht:  a₀ = g·B,  b₁ = (1−g)·B / GTZ_base                    (gesetzt)
Standard:     kwh_m = c·d_m + b₁·GTZ_m, kleinste Quadrate           (angepasst)
              danach a₀ = c·d_a,  B = a₀ + b₁·GTZ_base,  g = a₀/B
```

Der Standard-Pfad füllt damit **dieselben Spalten** und durchläuft **dieselbe
Funktion** (`referenzMonat()`, golden-vector-versiegelt). Es gibt weiterhin ein
Verfahren gegenüber der Bewilligungsbehörde, nicht zwei — und einen Ort, an dem
die Formel steht. Die Golden Vectors aus v1 wurden unverändert nach v2
übernommen und bestehen dort; wären sie anzupassen gewesen, wäre das der Beweis
gewesen, dass der Kern doch angefasst wurde.

**Angepasst wird ohne Achsenabschnitt**, mit den Kalendertagen als eigenem
Regressor. Ein gewöhnlicher Achsenabschnitt unterstellte, jeder Monat sei
gleich lang — bei 28 bis 31 Tagen ein systematischer, immer gleichgerichteter
Fehler zugunsten der kurzen Monate.

### C8.4 — Wo der Pfad fail-closed abbricht

| Fall | Verhalten |
|---|---|
| `typ ≠ vereinfacht`, keine `baseline_periode` erfasst | Abbruch (`baseline_vermessung_fehlt`). Ein stilles Zurückfallen auf das vereinfachte Verfahren wiese eine Baseline aus, die niemand belegt hat |
| weniger als 6 vollständige Monatspunkte | Abbruch (`zu_wenige_punkte`) |
| Gradtagzahl variiert über die Vermessung < 5 % | Abbruch (`gtz_variiert_nicht`) — Kap. 2.2.2 verlangt hinreichende Variation; jede Aufteilung wäre sonst beliebig |
| angepasste Tages-Grundlast < 0 | Abbruch (`grundlast_negativ`) — Datenfehler, kein Modell |
| angepasstes b₁ ≤ 0 | **kein** Abbruch: b₁ = 0, g = 1, und der Lauf hält fest, dass kein Witterungseinfluss nachweisbar war. Der Regelfall bei Strom |

**Unvollständige Monate fallen aus der Anpassung heraus.** Ein Monat mit
fehlenden Messtagen trägt einen zu niedrigen Verbrauch bei voller Gradtagzahl;
die Anpassung zöge daraus eine zu flache Kennlinie und dauerhaft eine zu
niedrige Baseline-Erwartung — ein systematischer Fehler zu Lasten des
Endkunden, der plausibel aussieht.

### C8.5 — Die erfasste Baseline wird nicht ersetzt

`baseline_wert` am Messkonzept bleibt, was es ist: der nach TB-02 erfasste
Beleg. Der Lauf vergleicht und weist den Abstand als
`baseline_abweichung_pct` aus. Wer den Belegwert stillschweigend durch den
angepassten ersetzte, verlöre die Spur zur Jahresabrechnung.

Gegen den Pilotbestand A (Förderjahr 2, `typ = standard`, Vermessung =
Förderjahr 1):

| | Wärme | Strom |
|---|---|---|
| R² | 0,9489 | 0,9370 |
| CV(RMSE) | 19,76 % | 5,24 % |
| NMBE | −0,17 % | 0,00 % |
| n | 12 | 12 |
| g (angepasst) | 0,015 | **1,000** — kein Witterungseinfluss nachweisbar |
| Abstand zur erfassten Baseline | +2,01 % | +0,21 % |

Der Wärme-Befund ist bemerkenswert: Das vereinfachte Verfahren arbeitete hier
mit `g = 0,126` aus der Sommermonats-Heuristik (C7), die Anpassung findet
`g = 0,015`. Die Heuristik hat den witterungsunabhängigen Anteil also um rund
das Achtfache überschätzt. Das ist kein Argument gegen C7 — ohne Messdaten
bleibt sie der beste verfügbare Schätzer —, aber es begrenzt ihren
Anwendungsbereich auf genau den Fall, für den sie gedacht war.

**CV(RMSE) = 19,76 % bei Wärme** liegt über dem gängigen Orientierungswert von
15 % für Monatsmodelle. Die Abweichung sitzt in den Übergangsmonaten und deutet
auf eine zu hohe Heizgrenze (VDI-3807-Default 15 °C). Nachgehen lässt sich das
erst an echten Klimadaten: Die Klimareihe des Pilotbestands A trägt
`quelle = 'synthetic_dev'` und ist über alle fünf Förderjahre nahezu konstant
(GTZ 3 718 / 3 728 / 3 727 / 3 718 / 3 718). In diesem Bestand ist die
Witterungsbereinigung faktisch wirkungslos — ein Befund an ihr beschreibt den
Datengenerator, nicht ein Gebäude.

### C8.6 — Was bewusst nicht gebaut wurde

- **Mehrgrößen-Regression und Nutzen als Einflussgröße (F1-(c)).**
  `analytics.eingang_einflussgroesse` ist leer, und eine `energy`-seitige
  Quelltabelle existiert nicht. Ein Modell für Daten zu bauen, die es nicht
  gibt, wäre Bau auf Vorrat.
- **Automatische Typ-Erkennung.** Ob ein Kunde Haushalt oder Nicht-Haushalt
  ist, entscheidet das Messkonzept, nicht die Software.
- **Migration des Bestands auf den passenden Typ.** Demo- und Nachweis-Fixtures
  wurden auf `vereinfacht` korrigiert (sie führen keine Vermessung); der
  Pilotbestand A bleibt `standard`, weil er eine trägt. Eine pauschale
  Umstellung produktiver Messkonzepte ist eine fachliche Entscheidung je
  Endkunde, keine Migration.

### C8.7 — Offene Punkte aus C8

| # | Was | Wer |
|---|---|---|
| **C8-O1** | Mindestpunktzahl 6 und GTZ-Streuungsschranke 5 % fachlich bestätigen — das Merkblatt nennt keine Zahlen | `baseline-engineer` |
| **C8-O2** | ~~Heizgrenze an echten Klimadaten prüfen~~ — **beantwortet in C10.3**: 15 °C trägt für den Pilotbestand A nicht (Abbruch), 9 °C passt mit R² = 0,99. Fortsetzung als C10-O1 | `baseline-engineer`, versionspflichtig (D3) |
| **C8-O3** | Messkonzept des Pilotbestands A sagt, die Wärmewerte seien **bereits witterungsbereinigt**. **Datenlage seit C10.4**: Die Reihe folgt dem tatsächlichen Wetter eng (R² = 0,989) — der Vermerk ist nicht gedeckt. Mit der liefernden Stelle zu klären, bevor Zahlen in einen Nachweis gehen | `baseline-engineer`, `migration-engineer` |
| **C8-O4** | Zentriertes R² bei einem Modell ohne Achsenabschnitt gegenüber der Behörde erläutern — die unzentrierte Variante fiele höher aus und ist ebenso gebräuchlich | `bafa-export-engineer` |
| **C8-O6** | Vier bewusste Abweichungen der Mappe von der Vorlage bestätigen (s. C9): Spaltenkopf „(pseudonym.)" statt „(Bez.)", Zusatzspalten N/O, Blatt-7-Spalte je vorkommendem Energieträger | `bafa-export-engineer` |
| **C8-O5** | Übergang bestehender Endkunden auf `typ = standard`, wo eine Vermessung vorliegt — je Kunde zu entscheiden, mit Anzeige nach TB-01 | `product-director`, `compliance-director` |


---

## C9 — Nachtrag: die Mappe gegen die Vorlage gelegt (2026-09-16)

Auf die Frage, ob die Software „genau nach der Vorlage" exportiert, half nur
ein Zell-für-Zell-Vergleich. Er förderte acht Abweichungen zutage. Fünf waren
Abweichungen ohne Gewinn und sind mit V0078 (Exportschema v5) behoben, vier
bleiben absichtlich.

### C9.1 — Behoben

| # | Was | Warum es zählte |
|---|---|---|
| 1 | Energieträger als interner Code (`strom`, `waerme`) statt `Strom`, `Gas`, `Wärme` | **Der ernste Punkt.** Blatt 7 der Vorlage summiert mit `SUMIFS` auf feste Zeichenketten. Wer unsere Zahlen ins Originalformular überträgt und dort `waerme` vorfindet, bekommt Nullen — und sieht ihnen nicht an, dass sie falsch sind |
| 2 | Blatt 7 Spaltenköpfe | Folgen jetzt dem Formular (`<Träger>-Einsparung [kWh]`) |
| 3 | Blatt 5 B/C/D trugen Kopien statt `INDEX/MATCH` | Eine Kopie bleibt stehen, wenn jemand das Systemregister korrigiert — die Mappe zeigte dann zwei Wahrheiten |
| 4 | Blatt 5 G ohne `IFERROR` und ohne b₂-Term | Jetzt wörtlich die Vorlagenformel. Der b₂-Term trägt heute 0 bei, wirkt aber ohne Codeänderung, sobald b₂ gefüllt wird |
| 5 | Blatt 6b mit blattübergreifendem Kriterienbereich | `SUMIFS` paarte Zeile i von Blatt 5 mit Zeile i von Blatt 1 — richtig, solange beide gleich sortiert bleiben, und **still falsch**, sobald jemand eines sortiert. Blatt 5 trägt die Branche jetzt selbst (Spalte O) |

Die drei Einheiten, die wir in Spaltenköpfe geschrieben hatten (`Koeff. b₁
[kWh/Kd]`, `Ist X₁ [Kd]`), sind zurückgenommen — sie stehen jetzt in den
Hinweiszeilen unter den Tabellen, wo sie die Kopfzeile der Vorlage nicht
verändern.

### C9.2 — Bewusst beibehalten

- **`2_Messpunkte` Spalte C** heißt „Zähler-ID (pseudonym.)" statt
  „Zähler-ID (Bez.)". Der Inhalt IST ein Pseudonym; ein Kopf, der
  „Bezeichnung" verspricht, wäre unwahr.
- **`5_Einsparung` Spalte N** („Ausgewiesene Monate"). Genau diese Spalte hat
  verhindert, dass die Mappe für den Pilotbestand A FJ5 eine Einsparung auswies, die
  es nicht gibt (0 von 13 getragenen Monaten). Ein nackter Faktor 0,77 ist
  nicht prüfbar.
- **`5_Einsparung` Spalte O** — die Hilfsspalte aus (5).
- **`7_Sachbericht_P13` Spalte D** heißt „Wärme-Einsparung" statt
  „Gas-Einsparung": keine Formabweichung, sondern der Energieträger, den
  dieses Bündel enthält.

Alle Zusatzspalten stehen **rechts** der Vorlagenspalten. Sie verschieben
nichts und stören einen Leser nicht, der nur A–M liest. Zur Bestätigung
vorgelegt als C8-O6.

### C9.3 — Drei Schemaversionen an einem Tag

v3 (V0075), v4 (V0077) und v5 (V0078) sind am 2026-09-15/16 entstanden. Das
ist kein schönes Bild für einen Katalog, der ein dauerhafter Nachweis sein
soll — aber es ist das ehrliche: Es gab an diesem Tag drei Rendering-Regeln,
und welche ein Artefakt erzeugt hat, muss an ihm ablesbar bleiben. Die
Alternative wäre gewesen, eine bestehende Version still umzudefinieren; dann
wäre der Katalog hübscher und falsch.

v3, v4 und v5 teilen sich den Renderer, weil keine der Vorversionen je
eingereicht wurde. Ein unter v3/v4 erzeugter Export meldet beim Download
`hash_abweichung` — geprüft, nicht angenommen — und ist neu zu erzeugen. Wäre
je ein Export eingereicht worden, müsste sein Renderer erhalten bleiben.


---

## C10 — Echte Klimadaten: was der synthetische Bestand verdeckt hat (2026-09-16)

`EDMS_KLIMA_QUELLE` steht seit diesem Tag im Entwicklungsbestand auf `dwd`.
Der Adapter war seit Längerem gebaut, getestet und lizenzseitig freigegeben
(DQ-001, `compliance-director`-Votum 2026-07-24) — er war nur nie
eingeschaltet. Drei Befunde in der ersten Stunde, alle drei unter
synthetischem Wetter unsichtbar.

### C10.1 — Die Klimastation war falsch: Straubing statt Oberschwaben

`aufbau-pilotbestand-a.ts` führte `stationRef: 'DWD-04911'`. Das ist **Straubing
in Niederbayern** (48,83 N / 12,56 E) — rund 220 km entfernt, anderes
Bundesland, anderer Klimaraum.

Aufgefallen ist es nie, weil der synthetische Adapter die Stationsnummer gar
nicht liest: Sie war eine Zeichenkette ohne Wirkung. Mit `dwd` wird sie
wirksam, und die Bereinigung wäre gegen das falsche Wetter gelaufen —
plausibel aussehend, nachweislich falsch.

Korrigiert auf **`DWD-04094` = „Weingarten, Kr. Ravensburg"** (47,806 N /
9,621 E, 441 m, Reihe seit 1946, historisches Archiv bis 2025-12-31) — die
nächstgelegene Station mit durchgehender Reihe über den Bewilligungszeitraum.

> **Keine Entfernungsangabe zum Bestand (2026-09-17).** Hier stand, die
> Station liege „rund vier Kilometer entfernt". Das war der einzige Satz im
> veröffentlichungsfähigen Teil des Repositories, der den Pilotbestand
> geografisch verortet — die Stationsbezeichnung selbst tut das nicht, sie
> nennt einen Landkreis mit rund 290.000 Einwohnern. Eine Entfernung dazu
> verengt das auf einen Umkreis. Für die fachliche Aussage ist sie
> entbehrlich: Maßgeblich ist, dass die Station die nächstgelegene mit
> durchgehender Reihe ist, nicht wie weit sie weg ist.

> Der Kreisname in der Stationsbezeichnung steht hier bewusst und bleibt
> stehen: Es ist die **amtliche Bezeichnung des DWD**, nicht die des
> Bestands. Der Bestand heisst seit dem 2026-09-16 durchgaengig
> „Pilotbestand A" (User-Entscheidung zur Veroeffentlichung). Eine amtliche
> Bezeichnung Dritter umzuschreiben waere schlechter als der Ortsbezug, den
> sie mitfuehrt — die Angabe muss gegen das DWD-Stationsverzeichnis pruefbar
> bleiben.

**Die allgemeine Lehre:** Ein Parameter, den niemand liest, ist nicht
überprüft — er sieht nur so aus. `energy.standort.klimareferenz` (ADR-0010)
wäre der Ort, an dem die Station zum Standort gehört; die Tabelle ist im
Bestand leer, und die Station kommt bis heute allein aus dem Lauf-Parameter.

### C10.2 — Mit echtem Wetter bricht die Wärme-Anpassung ab. Zu Recht.

Erster Lauf mit korrekter Station und VDI-3807-Default (`t_heizgrenze = 15 °C`):

```
HINDERNIS grundlast_negativ: Die Anpassung ergibt eine negative
Tages-Grundlast (-0,419 kWh/d).
```

Die Ursache steht in den Monatspunkten:

| Monat | GTZ (t_h = 15) | kWh |
|---|---|---|
| Januar 2019 | 627,9 | 3 897 |
| Mai 2019 | 275,3 | **923** |
| September 2019 | 133,3 | **378** |
| Juli 2019 | 5,8 | 224 |

Mai und September tragen unter einer Heizgrenze von 15 °C reichlich
Gradtagzahl bei — das Gebäude heizt dann aber nicht. Eine einzige Gerade kann
Winter und Übergangsmonate nicht zugleich treffen; die kleinsten Quadrate
gleichen das über eine steilere Kennlinie aus und drücken die Grundlast unter
null.

**Die fail-closed-Sicherung aus C8.4 hat hier ihren Wert bewiesen.** Ohne sie
wäre ein Modell mit negativer Grundlast entstanden — a₀ knapp unter null, b₁
plausibel, und jede Einsparzahl daraus dauerhaft und unauffällig verschoben.

### C10.3 — C8-O2 beantwortet: 15 °C trägt für dieses Gebäude nicht

Dieselbe Reihe, dieselben echten Temperaturen, nur die Heizgrenze variiert:

| t_h | Grundlast [kWh/d] | b₁ [kWh/Kd] | R² | CV(RMSE) |
|---|---|---|---|---|
| 8 °C | 12,77 | 5,985 | 0,9826 | 11,04 % |
| **9 °C** | **10,15** | **5,900** | **0,9890** | **8,81 %** |
| 10 °C | 8,60 | 5,773 | 0,9857 | 10,03 % |
| 12 °C | 4,23 | 5,892 | 0,9723 | 13,95 % |
| 14 °C | 1,89 | 5,943 | 0,9527 | 18,22 % |
| **15 °C (VDI-Default)** | — | — | — | **Abbruch** |

Bei 9 °C liegt CV(RMSE) mit 8,81 % deutlich unter dem gängigen
15-%-Orientierungswert, und die Grundlast von 10,1 kWh/Tag ≈ 3 700 kWh/Jahr
ist für Warmwasser und Hilfsenergie eines Bürogebäudes plausibel. Der
vollständige Lauf mit `t_heizgrenze_c = 9` liefert R² = 0,9879,
CV(RMSE) = 9,63 %, NMBE = 0,76 %, g = 0,186 und eine Abweichung von −1,11 %
zur nach TB-02 erfassten Baseline.

Eine niedrige Heizgrenze ist für ein Kreditinstitut fachlich erwartbar: hohe
interne Lasten aus IT und Personen, gute Dämmung — geheizt wird erst, wenn es
wirklich kalt ist. **Das ist ein Befund für DIESES Gebäude, kein neuer
Default.** Der VDI-Wert bleibt der Ausgangspunkt; er gehört je Messkonzept
überprüft.

### C10.4 — C8-O3: der Vermerk „bereits witterungsbereinigt" ist durch die Daten nicht gedeckt

Das Messkonzept des Pilotbestands A hält fest, die übernommenen Wärmewerte seien
bereits witterungsbereinigt und eine erneute Bereinigung wäre doppelt. Die
Reihe folgt dem TATSÄCHLICHEN Wetter des Baselinejahres jedoch sehr eng
(b₁ ≈ 5,9 kWh/Kd bei R² = 0,989 gegen die gemessenen Tagestemperaturen der
richtigen Station). Eine auf ein Normaljahr normierte Reihe hätte genau diesen
jahresspezifischen Anteil nicht mehr.

Das widerlegt den Vermerk nicht abschließend — dafür bräuchte es mehrere
Jahre mit deutlich verschiedenem Wetter —, aber es stützt ihn auch nicht. Er
ist mit der Stelle zu klären, die den Import geliefert hat, bevor Zahlen aus
diesem Bestand in einen Nachweis gehen. **C8-O3 bleibt offen, jetzt mit
Datenlage.**

### C10.5 — Neu: R² taugt nicht für Systeme ohne Witterungsanteil

Strom, volle Kalendermonate, echtes Wetter: b₁ = 0 (richtig, kein
Witterungseinfluss), CV(RMSE) = 5,18 % (sehr gut) — und **R² = 0,3163**.

Bei b₁ = 0 lautet das Modell `kwh = c · d`. R² misst dann nur noch, wie gut
die Monatslänge die Monatsmenge erklärt; bei 28 bis 31 Tagen ist da wenig zu
erklären. Dieselbe Reihe in Monatsscheiben mit stärker schwankender Länge
ergibt R² = 0,937 — die Zahl hängt am Zuschnitt, nicht an der Modellqualität.

In der Nachweis-Mappe stünde für ein Stromsystem also „Modellgüte R² = 0,32",
und ein Leser hielte das Modell für schlecht. Als **C8-O7** vermerkt: Die
Mappe sollte R² dort nicht ausweisen oder ausdrücklich als nicht anwendbar
kennzeichnen — beides ändert das Rendering und wartet daher auf die nächste
ohnehin nötige Schema-Version.

### C10.6 — Offene Punkte aus C10

| # | Was | Wer |
|---|---|---|
| **C10-O1** | ~~Heizgrenze bestimmbar machen~~ — **umgesetzt in C11.1**: Die Suche läuft und nennt bei einem Abbruch die passende Heizgrenze samt Güte. Offen bleibt die METHODISCHE Frage, ob ein Vorschlag automatisch übernommen werden darf (versionspflichtig, D3) | `baseline-engineer` |
| **C10-O2** | ~~Station aus `energy.standort.klimareferenz`~~ — **umgesetzt in C11.2** | `integration-engineer`, `backend-lead` |
| **C10-O3** | Stationswahl je Standort belegen (Entfernung, Höhenlage) — vier Kilometer sind gut, aber die Wahl gehört dokumentiert, nicht angenommen | `baseline-engineer` |


---

## C11 — C10-O1 und C10-O2 umgesetzt (2026-09-16)

### C11.1 — Die Heizgrenze wird gesucht, nicht geraten

`sucheHeizgrenze()` in `domain/baseline-regression.ts` passt dieselbe
Vermessung unter mehreren Heizgrenzen an (8 bis 16 °C) und wählt die mit dem
kleinsten CV(RMSE).

**Warum CV(RMSE) und nicht R² das Kriterium ist.** R² belohnt einen großen
Sommer-Winter-Kontrast — und genau den erzeugt eine zu hohe Heizgrenze,
indem sie den Übergangsmonaten Gradtagzahl zuschreibt. Ein Maß, das dasselbe
belohnt, was der Fehler erzeugt, kann die Wahl nicht treffen. CV(RMSE) misst
die typische Abweichung und reagiert richtig herum.

**Systeme ohne Witterungsanteil bekommen keinen Vorschlag.** Bei b₁ = 0 ist
die Heizgrenze bedeutungslos; jede Wahl liefert dasselbe Modell. Ein
Vorschlag täuschte dort eine Genauigkeit vor, die es nicht gibt — die
Funktion gibt `null` zurück.

**Wo er auftaucht.** In der Abbruchmeldung des Laufs. Gegen den Pilotbestand A:

> Die Baseline-Koeffizienten lassen sich nicht an die Vermessung anpassen
> (grundlast_negativ): … Geprueft: Mit t_heizgrenze_c = 9 °C statt 15 °C
> ergaebe dieselbe Vermessung eine Grundlast von 10,50 kWh/d bei R² = 0,9879
> und CV(RMSE) = 9,63 %. Die Heizgrenze ist je Messkonzept zu begruenden,
> nicht pauschal zu uebernehmen.

**Bewusst NICHT automatisch übernommen.** Der Lauf rechnet weiter mit dem
Parameter, den er bekommt. Eine Heizgrenze, die die Software sich selbst
sucht, ginge ohne Entscheidung in jede Einsparzahl ein und wäre gegenüber der
Bewilligungsbehörde nicht mehr begründbar — sie wäre das Ergebnis einer
Optimierung auf die eigenen Messdaten. Die Wahl bleibt beim Menschen; die
Software legt die Alternativen samt Güte daneben (`kandidaten` im Ergebnis).
Ob ein automatischer Vorschlag zulässig wäre, bleibt als methodische Frage
offen (versionspflichtig, D3).

### C11.2 — Die Klimastation hat jetzt einen Ort, an dem sie hingehört

`energy.standort.klimareferenz` gibt es seit V0002. **Schreibbar war die
Spalte nie** — kein DTO, kein OpenAPI-Feld, kein Formular. Deshalb konnte
C10.1 überhaupt passieren: Es gab keine Stelle, an der die richtige Station
hätte stehen können, also stand sie im Aufbau-Skript.

Jetzt: `klimareferenz` in `StandortAnlegen` und `StandortAendern`, in der
`StandortStruktur`-Antwort und in beiden Formularen. Zeichen-Whitelist wie bei
`stationRef` am Lauf — die Kennung landet im DWD-Adapter in Datei- und
URL-Pfaden.

Der `parametervorschlag` liest sie über `mvet → System → Standort` und stellt
sie den Vorschlägen aus früheren Läufen **voran**. Neu ist auch
`stationRefHerkunft`: Steht dort `fruehere_laeufe`, warnt die Oberfläche —
frühere Läufe wiederholen zuverlässig auch eine falsche Station.

**Der Lauf löst weiterhin NICHTS zur Laufzeit auf.** D4 bleibt: eine
eingefrorene `stationRef` je Lauf. Der Standort bedient den VORSCHLAG, der
Bediener übernimmt bewusst.

**Eine Falle, die beim Bauen fast eingebaut worden wäre.** Das
Änderungsformular schickt `klimareferenz` immer mit — nur so lässt sich eine
falsche Station wieder entfernen (Leerstring → `NULL`). Solange die Antwort
die Station aber nicht führte, hätte das Formular ein leeres Feld vorbelegt,
und eine harmlose Sortier-Änderung hätte die Station beiläufig gelöscht.
Deshalb steht `klimareferenz` in `StandortStruktur`, und ein Integrationstest
hält genau diesen Fall fest.

### C11.3 — Offen aus C11

| # | Was | Wer |
|---|---|---|
| **C11-O1** | Darf ein Heizgrenzen-Vorschlag automatisch übernommen werden, oder bleibt die Wahl zwingend beim Menschen? Eine auf die eigenen Messdaten optimierte Heizgrenze ist gegenüber der Behörde anders zu begründen als ein Normwert | `baseline-engineer`, `bafa-export-engineer` |
| **C11-O2** | Kandidatenbereich 8–16 °C fachlich bestätigen — nach oben ist er durch den VDI-Wert begrenzt, nach unten durch nichts als Erfahrung | `baseline-engineer` |
| **C11-O3** | Bestands-Standorte mit Klimastationen befüllen und `system.standort_id` setzen; für den Pilotbestand A wäre das `DWD-04094`. Das ist eine Datenaufnahme, keine Programmieraufgabe | `integration-engineer` |

---

## C12 — Nachtrag: `zeitraum_bis`-Semantik dokumentiert (Security-Review zu V0079, 2026-09-16)

Ein High-Befund aus dem `security-lead`-Review zu V0079 (generisches
`EXECUTE`-Grant auf `audit.append_event(...)` für `edms_einfluss_erkennung`,
behoben in **V0080** — der Grant-Tausch gegen zwei zweckgebundene Wrapper;
V0082 ist rein dokumentarisch) deckte einen zweiten, kleineren Mangel auf: die Spalte
`einfluss.befund.zeitraum_bis` trägt ihre Bedeutung — „Monat, AB DEM die
Anzeigepflicht entsteht", NICHT „Ende des auslösenden Zustands" — bislang
NUR im TS-Docstring von `erkenneTb03()` (`domain/tb03-erkennung.ts`). Die
Berechnung selbst (B12.5, Beginn der Änderung + Mindestdauer) ist richtig und
bleibt unverändert — sie folgt zwingend aus A15/A23 (Idempotenz: derselbe
Bestand muss in jedem Lauf denselben Befund mit denselben Grenzen erzeugen).

**Risiko der bisher fehlenden DB-/API-Dokumentation.** Bei einem OFFENEN
Intervall (z. B. ein dauerhafter Belegungswechsel ohne bekanntes Enddatum)
besteht der anzeigepflichtige Zustand über `zeitraum_bis` hinaus fort. Wer
das Feld als „Ende der Lage" liest statt als „Beginn der Anzeigepflicht",
meldete der Bewilligungsbehörde ein Ende, das nie eintrat — eine
Falschangabe. Da `einfluss.befund` append-only ist (V0020, kein
UPDATE/DELETE), wäre das nicht nachträglich korrigierbar, nur durch einen
neuen, klärenden Befund überschreibbar.

**Nachgetragen (V0082), rein dokumentarisch, kein Verhaltens-/Schema-Change:**
- `COMMENT ON COLUMN einfluss.befund.zeitraum_bis` (Migration V0082).
- `description` auf `EinflussgroesseBefundItem.zeitraumBis` im OpenAPI-Schema
  (`schemas/openapi/stammdaten.openapi.yaml`).
- dieser Nachtrag.

## C13 — `compliance-director`-Votum zur TB-03-Schwellwert-Erkennung (2026-09-16): kein Veto, 16 bindende Auflagen A11–A26

> **Herkunfts- und Vollständigkeitshinweis (zwingend mitzulesen).** Dieser
> Abschnitt ist **keine Abschrift** des Votums vom 2026-09-16 — ein
> eigenständiges, schriftliches Voten-Artefakt zu diesem Datum liegt im
> Repository nicht vor. Rekonstruiert aus den beiden einzigen Fundstellen:
> dem Kopfkommentar von
> `migrations/V0079__einfluss_tb03_schwellwerte_und_erkennung.sql` und den
> Kommentaren in `src/backend/src/einfluss/**` (Domäne, Service, Repositories,
> Runner, Integrationstests) — beides Sekundärquellen, die den Voten-Inhalt
> an der Stelle zitieren, an der er eine Implementierungsentscheidung trägt,
> nicht ein zusammenhängendes Zitat. Wo der Quelltext selbst deutsche
> Anführungszeichen **„…“** verwendet oder eine Formulierung ausdrücklich als
> „wörtlich und bindend" kennzeichnet, ist das unten vermerkt; alles andere
> ist **sinngemäß erschlossen**, nicht wörtlich. Diese Rekonstruktion ersetzt
> keine Prüfung durch `compliance-director` — sie ist deren Ausgangspunkt.
> **Reviewed-by: ausstehend.** Entwurf: `dsgvo-auditor`, 2026-09-16, auf
> gesonderten Auftrag (Zusatzbefund aus einem Security-Review), nicht Teil
> der ursprünglichen Auflage A26 selbst. **Abgrenzung zu Abschnitt C12:**
> Jener Abschnitt ist die eigenständige `security-lead`-Dokumentation der
> `zeitraum_bis`-Semantik (Auflage A15/A23); dieser Abschnitt C13
> rekonstruiert die vollständigen 16 Auflagen A11–A26 desselben Votums.

**Fortsetzung der Zählung** aus Abschnitt B8 (Auflagen A1–A5, 2026-07-24) und
Abschnitt C1 (Auflagen A6–A10, 2026-08-19). Anlass des Votums: die
TB-03-Schwellwert-Erkennung (Migration V0079, Code
`src/backend/src/einfluss/**`, Commit `435a0d6`). Ergebnis laut
Migrationskopf: **kein Veto, 16 bindende Auflagen A11–A26.** Umgesetzt in
V0079/Code sind A11, A12, A13, A15, A16, A17, A18, A19, A20, A21, A22, A23,
A24, A25 (vierzehn von sechzehn); **A14** ist strukturell vorbereitet, aber
mangels beschaffter Antragstellungs-Fassung (O-3) noch nicht angewendet;
**A26** (Compliance-Doku-Nachtrag) ist Gegenstand eines separaten
Nachtragspakets (`rvt.md`, `toms.md`, `dsfa-0001`-Nachtrag,
Risikoregister-Eintrag R-0007), Stand 2026-09-16 in Entwurf, Freigabe
ausstehend. **Nachtrag zu diesem Absatz, noch am selben Tag:** Ein
`security-lead`-Review hat an der A19/A20-Umsetzung einen High-Befund
gefunden und per Migrationen V0080–V0082 (Commit `4464022`) beheben lassen
— Einzelheiten unter A19/A20 unten. A19 und A20 gelten davon unberührt
weiterhin als **umgesetzt**; korrigiert wurde nicht die Auflage, sondern
eine über den Wortlaut von A20 hinausgehende Implementierungsentscheidung.

### A11 — Herkunfts- und Fassungspflicht für jeden Schwellwert (CHECK-erzwungen)

Jeder in `einfluss.katalog.tb03_schwellwert` hinterlegte Schwellwert muss
zwingend seine Herkunft tragen (`schwellwert_code`, `fassung`, `quelle`,
`kapitel`) sowie ein Fassungsvorbehalts-Flag (`fassungsvorbehalt`), solange
die zur Antragstellung (28.06.2018) maßgebliche Merkblattfassung nicht
beschafft ist (O-3). Ohne diese Herkunft wäre nach einer späteren Korrektur
nicht mehr feststellbar, gegen welche Schwelle ein Altbefund entstanden ist.
Per DB-CHECK erzwungen, nicht nur dokumentiert. — *Sinngemäß erschlossen.*
Quelle: V0079 Abschnitt (2) (Zeilen 82–126, Kommentar „FASSUNGSVORBEHALT
(A11/A14 …)", Zeilen 131–139). Umsetzung: CHECK
`ck_katalog_tb03_schwellwert_herkunft`. **Status: umgesetzt.**

### A12 — Neue Spalte `einfluss.befund.schwellwert_code`

Jeder Befund muss den `schwellwert_code` referenzieren, gegen den er
entstanden ist — Voraussetzung dafür, dass das seit V0021 whitelistete
Audit-Kontextfeld `schwellwert_code` tatsächlich aus persistierten Daten
belegbar ist, statt eine Zahl zu behaupten, die nirgends steht. `NOT NULL`
ohne Default (fail-closed, weil die Tabelle vor V0079 leer war). —
*Sinngemäß erschlossen.* Quelle: V0079 Abschnitt (1) (Zeilen 61–80).
Umsetzung: `ALTER TABLE einfluss.befund ADD COLUMN schwellwert_code`.
**Status: umgesetzt.**

### A13 — Seed der drei Schwellwertregeln, wörtliche Strenge des Merkblatts

Personenanzahl (> 50 %, über „> 1/2 Jahr"), Nutzfläche (≥ 10 %, über „> 1/2
Jahr"), Nutzungszweck (Wechsel, „≥ 6 Monate") werden mit der im Merkblatt
Technik Kap. 2.1.5/2.2.5 wörtlich unterschiedlichen Strenge (">"/"≥")
abgebildet, nicht vereinheitlicht — die Asymmetrie entscheidet im Grenzfall
über eine Anzeigepflicht. Die Fassung steht im Code selbst
(`schwellwert_code`-Muster `tb03.<groesse>.<regel>.v<jahr>`), nicht als
Modul-Konstante an anderer Stelle. — *Sinngemäß erschlossen; die
Merkblatt-Zitate „> 1/2 Jahr"/„≥ 6 Monate" sind im Quelltext selbst in
Anführungszeichen gesetzt.* Quelle: V0079 Abschnitt (3) (Zeilen 128–197);
`domain/tb03-regel.ts` Zeile 20. Umsetzung: V0079 UPDATE-Statements;
`tb03-regel.ts`. **Status: umgesetzt.**

### A14 — Fassungskorrektur erzeugt neuen Code, Altbefunde bleiben unangetastet

Wird die zur Antragstellung maßgebliche Fassung (28.06.2018) beschafft und
weicht sie von der aktuell geseedeten Fassung (Merkblatt Technik v2.2, Stand
12.09.2022) ab, entsteht bei Abweichung ein NEUER `schwellwert_code` statt
eines `UPDATE` der bestehenden Katalogzeile — Altbefunde bleiben der Fassung
zugeordnet, gegen die sie entstanden sind (keine rückwirkende Umdeutung von
Nachweisartefakten). Konsequenz für `tb03-regel.ts`: das Modul enthält
bewusst keine einzige Zahl aus dem Merkblatt direkt, sondern liest
ausschließlich aus dem Katalog. — *Sinngemäß erschlossen.* Quelle: V0079
Zeile 80 (Spaltenkommentar), Zeilen 131–139; `domain/tb03-regel.ts` Zeilen
5–7. Umsetzung: strukturell durch A11/A12 ermöglicht; konkrete
Korrektur-Migration noch nicht gebaut (abhängig von O-3). **Status:
strukturell vorbereitet, nicht angewendet.**

### A15 — Kein Vorgang, keine Frist; Zeiträume ausschließlich aus den Intervalldaten

Der Befund erzeugt keinen Vorgang, setzt keine Frist und rührt
`anzeige_status` nicht an (Bezug ADR-0006:54) — er ist Datengrundlage, keine
Erklärung gegenüber der Bewilligungsbehörde. Zusätzlich, im Quelltext selbst
in Anführungszeichen zitiert: **„`zeitraum_von`/`zeitraum_bis` werden
ausschließlich aus den Intervalldaten abgeleitet, nie aus dem Laufdatum."**
— derselbe Bestand erzeugt in jedem späteren Lauf denselben Befund mit
denselben Grenzen (Voraussetzung für die Idempotenz aus A23). — *Der
Zeitraum-Satz ist im Quelltext als Zitat gesetzt; der Vorgangs-/Frist-Satz
ist sinngemäß erschlossen.* Quelle: `domain/tb03-erkennung.ts` Zeilen 12–13,
140–141; `tb03-erkennung.service.ts` Zeilen 19–23. Umsetzung: `erkenneTb03()`.
**Status: umgesetzt.** Die genaue `zeitraum_bis`-Semantik ist zusätzlich in
Abschnitt C12 dokumentiert (Monat, AB DEM die Anzeigepflicht entsteht, nicht
das Ende des auslösenden Zustands).

### A16 — Bezugswert = Ende des Baseline-Erhebungszeitraums

Bezugswert für den Vergleich ist der Wert zum ENDE des
Baseline-Erhebungszeitraums (`energy.baseline_periode.bis`, exklusiv → der
Anker ist der Monat des letzten vollen Tages der Periode), **nicht** das
unmittelbar vorhergehende Intervall. Fehlt der Anker (kein
Baseline-Zeitraum), entsteht kein Befund und kein Rückfall auf ein
Vorintervall — ein zweiter Bezugsmaßstab wäre ein zweiter, undokumentierter
Erkennungsbegriff. Per DB-CHECK (`bezug = 'baseline_ende'`) strukturell auf
genau diesen einen Bezugsmaßstab beschränkt. — *Sinngemäß erschlossen; als
„User-Entscheidung (1)" im Migrationskopf mit ausdrücklichem Bezug auf das
Votum eingeführt.* Quelle: V0079 Zeilen 17–19, CHECK-Zeilen 107–110;
`domain/tb03-erkennung.ts` Zeilen 165–171; `persistence/
tb03-bezug.repository.ts` Zeilen 45–54. Umsetzung: CHECK; `erkenneTb03()`;
`Tb03BezugRepository.ladeSystemBezuege()`. **Status: umgesetzt.**

### A17 — Erkennungsrolle ohne Zugriff auf `energy.*`; Stammdaten weiter über die App-Verbindung ("Weg 1")

Die Namensraum-Trennung aus V0020 (D-ROLLE) bleibt unangetastet —
`edms_einfluss_erkennung` erhält **keinerlei** Rechte auf `energy.*`.
Baseline-Anker, Sperr-Vorfilter (A18) und die Auflösung
Nutzungsverhältnis→System werden stattdessen über die bestehende
App-Verbindung gelesen ("Weg 1"); der Lauf hält deshalb **zwei**
Datenbankverbindungen, statt die Schemagrenze aufzuweichen. Der
naheliegendere Weg — ein zusätzliches `SELECT`-Grant quer über die Grenze —
ist im Votum ausdrücklich als nachrangig eingestuft worden, weil er nicht bei
einem Grant geblieben wäre: Sperrfilter und mvet-Auflösung hätten je ein
weiteres gebraucht. — *Sinngemäß erschlossen; die Quelle nennt A17/A20 explizit
gemeinsam als „Auflagen … des `compliance-director`-Votums vom 2026-09-16".*
Quelle: `persistence/einfluss-erkennung-pg.module.ts` Zeilen 8–9;
`persistence/tb03-bezug.repository.ts` Zeilen 9–17; V0079 Zeilen 285–290.
Umsetzung: `Tb03BezugRepository`; `EinflussErkennungPgModule`; V0079
GRANTS-Kommentar. **Status: umgesetzt.**

### A18 — Sperr- und Shred-Vorfilter

Der Lauf berücksichtigt ausschließlich Systeme von Endkunden mit
`verarbeitungs_status = 'aktiv'`. Gesperrte (Art. 18), geschredderte und
gelöschte Endkunden bleiben draußen: Die Ausnahme, dass `einfluss.*` das
Endkunden-Krypto-Shredding als Nachweisartefakt überlebt (Rev. 8,
Art. 17 Abs. 3 lit. b), ist NACHWEIS-gebunden, nicht ÜBERWACHUNGS-gebunden —
ein neuer Befund für einen gesperrten oder geschredderten Endkunden wäre
Verarbeitung über den Zweck hinaus. Präzedenzfall im selben ADR: A10 (Teil C),
das `create:berechnungslauf` an derselben Bedingung blockt. Die Zahl der
übersprungenen Systeme wird im Laufergebnis ausgewiesen, damit ein
blockierter Lauf nicht wie ein leerer aussieht. — *Sinngemäß erschlossen.*
Quelle: `persistence/tb03-bezug.repository.ts` Zeilen 37–43, 90–97;
`tb03-erkennung.service.ts` Zeile 40; `tb03-erkennung-main.ts` Zeile 103.
Umsetzung: `Tb03BezugRepository.zaehleSystemeNichtAktiverEndkunden()`;
`Tb03LaufErgebnis.uebersprungenNichtAktiv`. **Status: umgesetzt.**

### A19 — Auditpflicht in zwei Teilen

**(a)** EIN „Einsicht"-Audit-Ereignis JE LAUF (nicht je Zeile), unabhängig
vom Ergebnis (auch bei null gelesenen Sätzen) und AUCH im Probelauf — der
Lauf liest denselben Klartextbestand, die Auditpflicht hängt am Lesen, nicht
am Schreiben. **(b)** Befund und sein Audit-Ereignis müssen in DERSELBEN
Transaktion entstehen — EIN Ereignis JE TATSÄCHLICH GESCHRIEBENEM Befund
(nicht je Kandidat, nicht blind für abgewiesene Duplikate). — *Sinngemäß
erschlossen; die a/b-Gliederung ist im Quelltext selbst durchgehend so
verwendet.* Quelle: V0079 Zeilen 258–278 (D-GRANT-ERW); `persistence/
tb03-befund.repository.ts` (gesamt, insb. Zeilen 12–13, 31, 51, 80–86);
`tb03-erkennung.service.ts` Zeilen 91–99. Umsetzung:
`Tb03BefundRepository.protokolliereEinsicht()`/`.schreibeBefunde()`.
**Status: umgesetzt.**

### A20 — Eigene, engere Erkennungsrolle, tatsächlich verdrahtet

Der Erkennungslauf bekommt eine eigene Datenbankrolle
`edms_einfluss_erkennung` (`NOLOGIN`) — nicht `edms_einfluss` wiederverwendet
— mit `SELECT` auf `katalog`/`intervall` und `INSERT` auf `befund`; die Rolle
wird angelegt UND tatsächlich verdrahtet (nach dem Muster des
Ingest-Workers), nicht nur dokumentiert und wirkungslos gelassen. — *Der
Kern („angelegt UND tatsaechlich verdrahtet … nicht als dokumentierte, aber
wirkungslose Rolle") ist im Migrationskopf als „User-Entscheidung (4)" mit
Bezug auf den Anlass dieser Migration wiedergegeben — nahe am Wortlaut,
aber als Paraphrase gekennzeichnet, nicht als Zitat.* Quelle: V0079 Zeilen
27–29, 220–253; `tb03-erkennung.integration.spec.ts` Zeile 24 („Ohne diesen
Test wäre Auflage A20 eine Behauptung."). Umsetzung: V0079 Rollen-/
GRANT-Block; negativer Integrationstest („kann mit der Rolle des Laufs weder
loeschen noch aendern"). **Status: umgesetzt, technisch verifiziert.**

#### Nachtrag zu A19/A20 (2026-09-16, nach Commit `4464022`): Grant-Korrektur, nicht Auflagen-Korrektur

Ein `security-lead`-Review deckte auf, dass die ursprüngliche Umsetzung von
V0079 zwei Grants enthielt, die **über den Wortlaut von A20 hinausgingen**
und im eigenen Migrationskopf als „D-GRANT-ERW" markiert waren: `EXECUTE`
auf die generische `SECURITY DEFINER`-Funktion `audit.append_event(...)`
sowie volles `SELECT` auf `einfluss.befund`. Befund (High, ersteres): Da
PostgreSQL keine argumentscharfen `GRANT`s kennt, hätte das generische
Audit-Recht der Rolle erlaubt, **jeden** aktiven Event-Typ mit **frei
gewähltem** `actor_sub`/`actor_typ`/`objekt_ref` zu schreiben — nicht nur
die zwei für A19 vorgesehenen TB-03-Codes. Korrigiert durch Migrationen
V0080 (zwei zweckgebundene Wrapper-Funktionen mit fest verdrahtetem
`event_typ`/`actor_typ`/`actor_sub`, ersetzen das generische Grant),
V0081 (spaltenscharfes `SELECT (id)` statt vollem Tabellen-`SELECT`, als
Prinzipientreue-Korrektur ohne akutes Risiko eingestuft) und V0082
(Dokumentation der `zeitraum_bis`-Semantik, s. Abschnitt C12 — „Monat, AB
DEM die Anzeigepflicht entsteht", nicht „Ende des auslösenden Zustands").

**Einordnung für die Rekonstruktion:** Dies ist eine Korrektur der
**Implementierung**, nicht der Auflagen A19/A20 selbst — A19 (Audit in
zwei Teilen) und A20 (eigene, engere Rolle) bleiben inhaltlich unverändert
und weiterhin als umgesetzt zu lesen; A19(b) (Befund und Ereignis in
derselben Transaktion) ist durch die Wrapper-Lösung sogar **enger**
erfüllt als zuvor, weil der Aufrufer jetzt keinen Event-Typ/`actor_sub`
mehr frei wählen kann. Die beiden korrigierten Grants waren nie Teil des
Wortlauts von A20 — sie waren, wie die D-GRANT-ERW-Markierung im
Migrationskopf selbst festhielt, eine über A20 hinausgehende Ergänzung der
implementierenden Session, notwendig, um A19(b) technisch zu erfüllen.
Insofern betrifft dieser Befund **die Wahl des Mechanismus**, nicht die
Auflagen-Lesung dieses Abschnitts. Quelle: `migrations/
V0080__audit_tb03_erkennung_event_wrapper.sql`, `migrations/
V0081__einfluss_befund_select_spaltenscharf.sql`, `migrations/
V0082__audit_tb03_erkennung_event_wrapper.sql`, Commit `4464022`.

### A21 — Dauerregeln werden nicht eskaliert

Bei einer Dauerregel (Nutzungszweck-Wechsel) ist Dauer kein Schweremaß — 18
Monate sind nicht „dreifach anzeigepflichtig", sondern derselbe Sachverhalt,
nur älter. Die Klasse bleibt in diesem Fall immer `schwelle_ueberschritten`;
die Dauer bleibt über `zeitraum_von`/`zeitraum_bis` ablesbar. — *Sinngemäß
erschlossen.* Quelle: `domain/tb03-erkennung.ts` Zeilen 87–98;
`domain/tb03-erkennung.spec.ts` Zeile 270. Umsetzung: `klassiereDauer()`.
**Status: umgesetzt.**

### A22 — Kleinwert-Deckel

Ist der Bezugswert (Ausgangswert) einer Personenanzahl ≤ 2, wird die Klasse
auf `schwelle_ueberschritten` gedeckelt, auch wenn die rechnerische
Abweichung `stark_ueberschritten` erreichen würde. Grund: Bei einem
Bezugswert von 1 bedeutete `stark_ueberschritten` (≥ 3,0× 50 %) rechnerisch
„≥ 2,5 Personen" — faktisch die exakte Zahl, sichtbar im Audit-Log, obwohl
die Auditor-Rolle für `read:einflussgroesse` eigens deny-gelistet ist. Der
Betriebs-Blick auf die tatsächliche Höhe bleibt über `read:einflussgroesse`
unberührt; gedeckelt wird nur die Klasse im Audit-Kontext. — *Sinngemäß
erschlossen.* Quelle: `domain/tb03-erkennung.ts` Zeilen 100–130 (insb.
104–110); `domain/tb03-erkennung.spec.ts` Zeile 252. Umsetzung:
`klassiereProzent()`. **Status: umgesetzt.**

### A23 — Idempotenz strukturell in der Datenbank, Ausnahme bei Klassenwechsel

Ein wiederholter Treffer desselben Sachverhalts darf keinen zweiten Befund
erzeugen (die Tabelle kennt weder `UPDATE` noch `DELETE` — sonst dauerhafter
Datenmüll und monatlicher Audit-Lärm, Art. 5 Abs. 1 lit. c). Die Idempotenz
muss STRUKTURELL über einen DB-Unique-Index gesichert sein, nicht über eine
Service-Prüfung, die ein zweiter Aufrufer umgehen könnte. Ausdrücklich
zugelassen — sogar gefordert — ist ein weiterer Befund „nur bei
Klassenwechsel" (eine sich verschärfende Lage muss sichtbar werden); die
Klasse (`ueberschreitung_klasse`) ist deshalb bewusst Teil des
Unique-Schlüssels. — *Sinngemäß erschlossen; „nur bei Klassenwechsel" ist im
Migrationskopf in Anführungszeichen gesetzt.* Quelle: V0079 Zeilen 199–218;
`persistence/tb03-befund.repository.ts` Zeilen 42, 82–86. Umsetzung: Unique-
Index `ux_einfluss_befund_idempotenz`; `INSERT … ON CONFLICT DO NOTHING
RETURNING id`. **Status: umgesetzt.**

### A24 — Probelauf ist der Standard

Ohne explizites Ausführen-Flag zählt und meldet der Lauf, schreibt aber
keinen Befund — Standardverhalten, analog Retention-Runner und
Migrations-Runner. Das Einsicht-Audit-Ereignis (A19a) wird AUCH im Probelauf
geschrieben, weil der Klartextbestand auch dabei gelesen wird. — *Sinngemäß
erschlossen.* Quelle: `tb03-erkennung.service.ts` Zeile 63;
`tb03-erkennung-main.ts` Zeilen 26–37; `tb03-erkennung.integration.spec.ts`
Zeile 150. Umsetzung: `Tb03ErkennungService.probelauf()`/`.fuehreAus()`;
CLI-Flag `--ausfuehren`. **Status: umgesetzt.**

### A25 — Umfangsbegrenzung auf drei von fünf Größen; NULL-Semantik wörtlich bindend

Nur drei der fünf TB-03-Größen (Personenanzahl, Nutzfläche, Nutzungszweck)
erhalten in v1 einen maschinellen Schwellwert. `geraeteabschaffung` fehlt eine
fachliche Festlegung, WER den 10-%-Jahresverbrauchsanteil bestimmt;
`energietraeger_mix` ist nicht unabgedeckt, sondern bewusst über einen
anderen, bereits bestehenden Pfad abgedeckt (ADR-0007 B14,
`SubstitutionErkennungService`) — eine zweite Erkennung wäre ein zweiter,
divergierender Erkennungspfad. Der zentrale Satz ist im Migrationskopf
ausdrücklich als **„woertlich und bindend"** gekennzeichnet und daher hier im
Wortlaut übernommen: **„`tb03_schwellwert IS NULL` bedeutet ‚NICHT
MASCHINELL ÜBERWACHT' — NIEMALS ‚nie überschritten'. Jede Auswertung, die aus
einer NULL-Schwelle Beschwerdefreiheit ableitet, liest den Katalog falsch."**
— *Der zitierte Satz ist die einzige Stelle in diesem gesamten Abschnitt, die
der Quelltext selbst als wörtlich kennzeichnet; alles Übrige zu A25 ist
sinngemäß erschlossen.* Quelle: V0079 Zeilen 34–52 (D-UMFANG), Zeile 49;
`domain/tb03-regel.ts` Zeilen 59–61; `persistence/
tb03-einfluss.repository.ts` Zeilen 55–58; `tb03-erkennung-main.ts` Zeilen
107–115. Umsetzung: kein Seed für die zwei Größen (V0079);
`Tb03EinflussRepository.ladeRegeln()`; explizite Ausgabe im Runner.
**Status: umgesetzt (als bewusste Nicht-Abdeckung).**

### A26 — Nachträge in den Compliance-Akten

Die durch V0079 gebaute Erkennung darf nicht ohne begleitende Fortschreibung
der Compliance-Akte bleiben. Nach der Übergabenotiz der implementierenden
Session (`production/uebergabe-2026-09-16-index-kollision.md`, Zeile 161)
umfasst A26 mindestens: Nachtrag in `rvt.md` (VT-0001, TB-03-Überwachung als
Verarbeitungsschritt), Nachtrag in `toms.md` (neue Rolle
`edms_einfluss_erkennung`), ein Nachtrag statt einer eigenen DSFA in
`dsfa-0001`, sowie ein neuer Risikoregister-Eintrag „TB-03-Erkennung unter
Fassungsvorbehalt". — *Sinngemäß erschlossen; der Wortlaut von A26 selbst
ist NICHT rekonstruierbar — die einzige Primärnennung ist der knappe
Halbsatz im Migrationskopf: „die uebrigen sind App-/Doku-Scope und stehen im
Runner bzw. im Nachtragspaket zu A26" (V0079 Zeile 15). Alles Weitere zu A26
stammt aus der NACHTRÄGLICHEN Zusammenfassung der Übergabenotiz, nicht aus
dem Votum selbst.* **Zuordnungsfrage — inzwischen durch die tatsächliche
Bearbeitung beantwortet, nicht durch neue Quellen zum Wortlaut:** Ob A26
auch die Prüfung der drei im V0079-Migrationskopf separat offen markierten
Abweichungen umfasst (zwei Grants über den Wortlaut von A20 hinaus
[D-GRANT-ERW], der eigene Audit-Schreibpfad auf der Erkennungsverbindung,
die Semantik von `zeitraum_bis`), war zum Entwurfszeitpunkt dieses
Abschnitts offen. Diese drei Punkte sind **noch am 2026-09-16** durch ein
**separates `security-lead`-Review** und die Migrationen V0080–V0082
(Commit `4464022`) abgearbeitet worden — **nicht** durch die
Compliance-Dokumentations-Nachträge dieses A26-Pakets. Das stützt im
Nachhinein die in der Übergabenotiz angelegte Trennung („Gehören in
dieselbe Review-Runde wie der A26-Rest", **nicht** „sind Teil von A26"):
Ein Doku-Nachtrag hätte diese drei technischen Punkte nicht beheben können
— sie brauchten Migrationen, keine Prosa. **Bleibt dennoch als Lücke
festgehalten:** Der Wortlaut von A26 selbst ist damit nicht rekonstruiert,
nur seine Abgrenzung nach außen empirisch bestätigt. Quelle: V0079 Zeile
15; `production/uebergabe-2026-09-16-index-kollision.md` Zeilen 156–164;
`migrations/V0080__audit_tb03_erkennung_event_wrapper.sql`,
`V0081__einfluss_befund_select_spaltenscharf.sql`,
`V0082__audit_tb03_erkennung_event_wrapper.sql`. Umsetzung von A26 selbst:
Gegenstand des separaten Nachtragspakets (Entwürfe `dsgvo-auditor`,
2026-09-16: `rvt.md` Rev. 15, `toms.md` Rev. 12, `dsfa-0001` Abschnitt
17/Rev. 14, `risk-register/R-0007`) — Freigabe durch `compliance-director`
steht aus. **Status: in Bearbeitung.**

### Empfehlung zum weiteren Vorgehen (nicht Teil des rekonstruierten Votums)

1. **Bestätigung durch `compliance-director`:** Jede der sechzehn
   Rekonstruktionen oben ist gegen die tatsächliche Erinnerung/Notizen des
   Votums vom 2026-09-16 zu prüfen und zu korrigieren, bevor dieser Abschnitt
   irgendwo als Nachweis zitiert wird. Abweichungen sind wahrscheinlicher bei
   den als „sinngemäß erschlossen" markierten Punkten als bei den wörtlich
   zitierten (A15-Zeitraumsatz, A25-Kernsatz).
2. **Prozess-Lücke:** Dass ein bindendes Votum mit sechzehn Auflagen
   ausschließlich über Implementierungs-Kommentare rekonstruierbar ist, ist
   der eigentliche Befund dieses Nachtrags. Empfehlung: künftige
   `compliance-director`-Voten werden — wie am 2026-09-07
   (`production/votum-2026-09-07-antworten.md`) bereits vorgemacht — als
   eigenständiges, dem Votum zeitlich vorangehendes oder unmittelbar
   nachfolgendes Artefakt festgehalten, bevor eine Migration darauf Bezug
   nimmt. Diese Empfehlung selbst ist keine Auflage und bindet niemanden;
   sie ist eine Beobachtung zur Nachweisführung.
