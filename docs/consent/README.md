# Einwilligungs- und Informationstexte — Entwürfe

**Status: `draft`. Kein Text in diesem Verzeichnis ist veröffentlichungsfähig.**

Grundlage: Auflagen **AW-23** und **AW-24** aus
`production/votum-2026-09-07-antworten.md` (compliance-director, 2026-09-07),
Vorgaben V-8a bis V-8d. Der User hat die Erlaubnis zum Schreiben am
2026-09-07 erteilt (Fragenkatalog B1: „Du hast die Erlaubnis das zu
schreiben").

---

## Warum die Texte hier liegen und nicht in der Datenbank

`consent.text_version` ist **unveränderlich** (`REVOKE UPDATE, DELETE`,
V0044). Eine falsch veröffentlichte Fassung lässt sich nicht korrigieren,
sondern nur durch eine neue überlagern — und der Fehler bleibt dauerhaft im
Bestand sichtbar, mitsamt allen Einwilligungen, die auf ihn zeigen.

Deshalb gilt die harte Regel aus V-8d: **kein `INSERT` in
`consent.text_version` vor der Freigabe.** Auch nicht „zum Testen".

Sie liegen auch nicht unter `compliance/**` — dort gilt Freigabepflicht, und
ein Entwurf, der noch juristisch zu prüfen ist, gehört nicht in den Bestand
der geprüften Artefakte.

---

## Die fünf Voraussetzungen der Veröffentlichung (V-8d)

Solange auch nur eine davon fehlt, bleibt jeder Text `draft`:

| # | Voraussetzung | Auflage | Stand 2026-09-07 |
|---|---|---|---|
| 1 | DSB benannt oder Anlaufstelle festgelegt (Art. 13 Abs. 1 lit. b) | AW-16 / AW-17 | **offen** — kein DSB bestellt |
| 2 | Firmierung gegen Handelsregisterauszug verifiziert | AW-1 | **offen** |
| 3 | AVV mit dem Hoster geschlossen (Empfängerangabe belastbar) | AW-8 | **offen** |
| 4 | Zuständige Aufsichtsbehörde verifiziert | — | **offen** |
| 5 | Fristfeststellung F2 erfolgt (Speicherdauer belastbar) | AW-15 | **offen** |

Jede dieser fünf Lücken ist im Text als `[OFFEN — …]` markiert. Das ist
Absicht: Ein Entwurf, dem man ansieht, dass er nicht fertig ist, wird nicht
versehentlich veröffentlicht.

---

## Welche Texte es gibt — und warum es acht Kombinationen sind, nicht fünf

Der Fragenkatalog nannte „fünf Texte". Das war falsch. Nach der
Rechtsgrundlagen-Matrix (V0047) stehen **acht (Zweck, Subjektart)-
Kombinationen** auf `opt_in`, und der Textbedarf richtet sich nach der
**Kombination**, nicht nach dem Zweck:

> Ein Text, der beide Subjektarten zugleich adressiert, verfehlt zwingend die
> Angabe der **Folgen der Verweigerung** — sie sind für Endkunde und
> Anschlussnutzer verschieden. Das ist der Kern der O1-Asymmetrie, und im
> Text darf er nicht eingeebnet werden.

| # | Zweck / Subjektart | Art | Fällig | Datei |
|---|---|---|---|---|
| 1 | `geraeteerkennung` / Endkunde | Einwilligung | **jetzt** | `E1-geraeteerkennung-endkunde.md` |
| 2 | `mehrwertdienste` / Endkunde | Einwilligung | **jetzt** | `E2-mehrwertdienste-endkunde.md` |
| 3 | `messdaten_verarbeitung` / Anschlussnutzer | Einwilligung | ruhend (A9) | — |
| 4 | `nutzerinformation` / Anschlussnutzer | Einwilligung | ruhend (A9) | — |
| 5 | `geraeteerkennung` / Anschlussnutzer | Einwilligung | ruhend (A9) | — |
| 6 | `mehrwertdienste` / Anschlussnutzer | Einwilligung | ruhend (A9) | — |
| 7 | `wiss_auswertung` / Anschlussnutzer | Einwilligung | **gesperrt** | — |
| 8 | `wiss_auswertung` / Endkunde | entfällt als Einwilligung → Information + Widerspruch | mit VT-0004 | `I11-widerspruch-wissenschaftliche-auswertung.md` |

Dazu die drei Texte, die **nicht** im Consent-Katalog stehen, nach
Art. 13/14 aber zwingend sind und im Repository bisher nirgends existierten:

| # | Text | Grund | Datei |
|---|---|---|---|
| 9 | Datenschutzinformation Endkunde (vertraglicher Zweig) | Für lit.-b-Verarbeitungen gibt es keine Einwilligung — aber sehr wohl eine Informationspflicht | `I9-datenschutzinformation-endkunde.md` |
| 10 | Datenschutzinformation Ansprechpartner beim Endkunden (lit. f) | Neue Betroffenenkategorie aus V-1 | `I10-datenschutzinformation-ansprechpartner.md` |
| 11 | DE-04-Widerspruchsinformation | Trägt das Opt-out der wissenschaftlichen Auswertung | `I11-widerspruch-wissenschaftliche-auswertung.md` |

**Warum die Texte 3–7 heute nicht geschrieben sind:** Das Votum führt sie als
**ruhend** (A9 — im Pilot-Portfolio gibt es aktuell keine Mietfälle) bzw. als
**gesperrt** (Nr. 7, Anschlussnutzer-Zweig der wissenschaftlichen
Auswertung). Sie werden fällig mit der **ersten Anlage** eines
Anschlussnutzers — nicht mit dem ersten Ingest, denn die Freiwilligkeit
entscheidet sich bei der Einholung. Der Anschlussnutzer-Fall trägt zusätzlich
Anforderungen, die im Endkunden-Fall nicht auftauchen: die Herkunftsangabe
nach Art. 14 (die Daten werden nicht bei ihm erhoben), die
Freiwilligkeitssicherung gegenüber dem Vermieter (A12-5) und die
Einwilligungsfähigkeit Minderjähriger (A12-25, in der korrigierten Fassung
nach AW-21). Sie jetzt ins Blaue zu schreiben hiesse, sie später ohne den
konkreten Fall prüfen zu müssen.

---

## Befund: das Schema kann diese Texte heute nicht halten

`consent.text_version` führt **keine Subjektart**. Der Eindeutigkeitsschlüssel
ist `(zweck_code, fassung)`, die Überlappungsprüfung
(`ex_text_version_kein_overlap`) läuft über `zweck_code`, und
`findGueltigeTextVersion(zweckCode, erteiltAt)` sucht ohne Subjektart.

Für **einen Zweck** kann damit zu einem Zeitpunkt genau **ein** Wortlaut
gelten. Die Vorgabe aus V-8a — je Kombination ein eigener Text — ist im
heutigen Schema **nicht speicherbar**.

Das ist kein Formfehler. Es betrifft die Zwecke, die in **beiden** Spalten
`opt_in` sind (`geraeteerkennung`, `mehrwertdienste`, `wiss_auswertung`):
Dort müsste ein und derselbe Wortlaut für Endkunde und Anschlussnutzer
gelten, obwohl die Folgen der Verweigerung verschieden sind.

**Erforderlich, bevor irgendein Text veröffentlicht wird:** eine Migration,
die `consent.text_version` um `subjekt_typ` erweitert — samt angepasstem
Eindeutigkeits- und Überlappungsschlüssel, angepasstem zusammengesetztem
Fremdschlüssel aus `consent.einwilligung` und angepasster Textsuche. Das ist
eine Schema-Entscheidung für `database-lead` + `compliance-director` und
wurde hier bewusst **nicht** im Alleingang gebaut.

Solange sie fehlt, ist die Reihenfolge ohnehin unkritisch: Veröffentlicht
werden darf nichts (V-8d).

---

## Zweiter Befund: Art. 21 passt nicht auf eine lit.-b-Verarbeitung

Die Rechtsgrundlagen-Matrix (V0047) führt `nutzerinformation`/Endkunde als
`vertrag_art6_1b` mit Erlaubnismodus `opt_out` und verweist für den
Widerspruch auf **Art. 21 DSGVO**. Das trägt so nicht:

> **Art. 21 Abs. 1 DSGVO gilt seinem Wortlaut nach nur für Verarbeitungen auf
> Grundlage von Art. 6 Abs. 1 lit. e oder lit. f** — nicht für lit. b.

Ein Endkunde, dessen Verarbeitung auf dem Vertrag beruht, hat danach **kein**
Widerspruchsrecht aus Art. 21. Das Opt-out selbst bleibt richtig — TB-06 sieht
es vor, und als vertragliche Gestaltung ist es ohne Weiteres zulässig. Es ist
dann aber ein **leistungsbezogenes Abwahlrecht** und kein Betroffenenrecht.

Warum das nicht bloss eine Etikettenfrage ist: Wer einem Kunden ein
Betroffenenrecht zuschreibt, das ihm nicht zusteht, macht dieselbe Art von
Fehler wie beim Häkchen für eine nicht widerrufbare Verarbeitung — nur in die
andere Richtung. Und die Bauform des Erklärungsobjekts aus AW-27 hängt daran:
Ein „Art.-21-Widerspruch" und eine „Abwahl der Zusendung" sind zwei
verschiedene Objekte mit verschiedenen Rechtsfolgen.

`I9-datenschutzinformation-endkunde.md` formuliert deshalb **funktional**
(„Sie können der Zusendung widersprechen"), ohne die Norm zu behaupten.
**Die Einordnung gehört zum `compliance-director`** und berührt ausserdem
`compliance/dsgvo/betroffenenrechte.md` und die Umsetzung von AW-27.

Für **DE-04** (wissenschaftliche Auswertung) stellt sich die Frage nicht: Die
Verarbeitung steht dort auf lit. f, und Art. 21 ist einschlägig.

---

## Aufbau jedes Textes

Jeder Einwilligungstext enthält die **fünfzehn Pflichtangaben** aus V-8b.
Zwei davon werden regelmäßig verwechselt und sind deshalb hier ausdrücklich
getrennt:

- **Widerruf** (Art. 7 Abs. 3) gehört in einen **Einwilligungstext**.
- **Widerspruch** (Art. 21) gehört in einen **Informationstext** zu einer
  Verarbeitung auf lit. e oder lit. f.

Die beiden zu vermischen ist der häufigste Fehler in solchen Texten. Kein
Einwilligungstext in diesem Verzeichnis nennt ein Widerspruchsrecht, und kein
Informationstext nennt einen Widerruf.

---

## Was als Nächstes zu tun ist

1. Die fünf Voraussetzungen schließen (AW-1, AW-8, AW-15, AW-16/AW-17,
   Aufsichtsbehörde).
2. Schema-Erweiterung `consent.text_version.subjekt_typ` entscheiden.
3. **Juristische Prüfung der Texte** — sie sind fachlich strukturiert und
   nach Art. 13 vollständig angelegt, aber nicht anwaltlich geprüft.
4. Erst danach Veröffentlichung über `POST /consent/texte`, Fassung `1.0`.
