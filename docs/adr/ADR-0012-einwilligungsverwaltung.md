# ADR-0012: Einwilligungsverwaltung (DS-03/DS-04) — versionierte Texte, belegbare Zustimmung, Widerruf

- **Status:** **draft** — aber nicht mehr ungeprüft. Der
  `compliance-director` hat am **2026-09-05** ein Votum abgegeben: **kein
  Veto gegen das ADR als Ganzes**, 29 Auflagen (`A12-1` … `A12-29`), und ein
  **Teil-Veto** gegen den produktiven Einsatz von B1/B2, das mit A12-27/28/29
  aufgehoben ist. Eine **User-Freigabe** steht weiterhin aus, und die
  offenen Punkte in Abschnitt 7 sind Rechts- und Tatsachenfragen, die dieses
  Dokument nicht entscheiden kann.
  **Fortschreibung 2026-09-07:** Der User hat die Tatsachenfragen beantwortet
  (Fragenkatalog A1–A9, B1–B3, C1–C4), der `compliance-director` hat sie
  ausgewertet (`production/votum-2026-09-07-antworten.md`, 12 Entscheidungen,
  30 Auflagen `AW-1` … `AW-30`). **O1 ist damit vorbehaltlos entschieden**,
  O3 und O4 ruhen mit benanntem Trigger, O5 bleibt offen, O6 ist neu. Status
  bleibt `draft` bis zur User-Freigabe.
- **Datum:** 2026-09-05
- **Autor:** Entwurf aus einer Arbeitssitzung am Kopier-Repo
- **Reviewer (vorgesehen, NOCH NICHT erfolgt):** `compliance-director`
  (federführend — die Einwilligung ist die Rechtsgrundlage, nach der sich der
  gesamte Ingest richtet), `dsgvo-auditor`, `database-lead` (Schema),
  `security-lead` (IP-Speicherung), `ux-lead` (Kopplungsverbot in der
  Oberfläche), `consent-engineer`
- **Bezug:** ADR-0004 (Kern-Datenmodell, hält den Consent-Slot),
  ADR-0002 (AuthN/AuthZ), ADR-0008 (Betriebs-UI), DS-02/DS-03/DS-04/DS-07/
  DS-08/DS-11 aus `compliance/foerderauflagen/merkblatt-anforderungen.md`

> **Hinweis zur Entstehung.** Dieser Entwurf ist ohne Votum des
> `compliance-director` geschrieben worden. Er ersetzt dieses Votum
> **nicht** — er bereitet es vor, indem er die Entscheidungen benennt, die
> zu treffen sind, und die Stellen markiert, an denen der Entwurf sich
> bewusst auf die restriktive Seite legt. Vor der Implementierung der
> **Rechtsgrundlagen-Wirkung** (Abschnitt 6, E5) ist das Votum zwingend.

---

## 1. Kontext

Das Datenmodell hält seit ADR-0004 (V0002) drei Spalten an `energy.endkunde`
bereit — `consent_status`, `consent_text_version`, `consent_ref_id` —
ausdrücklich als **Slot**, mit dem Kommentar „Mechanik = Consent-ADR". Der
Slot ist bis heute leer: Es gibt keinen Text, kein Erteilen, keinen Widerruf,
keinen Beleg. `consent_status` steht bei jedem Endkunden auf dem Default
`fehlt`.

Solange das so bleibt, ist die Einwilligung eine Behauptung ohne Nachweis.
Für ein Vorhaben, dessen Verarbeitungen sich auf sie stützen, ist das die
empfindlichste offene Stelle im System: Nicht belegbare Einwilligung heißt im
Streitfall **keine** Einwilligung (Art. 7 Abs. 1 DSGVO — der Verantwortliche
muss nachweisen können).

Die Roadmap führt die Einwilligungsverwaltung als Voraussetzung für das
Endkunden-Onboarding und als Teil des ADR-0004-Ingest-Gates.

### Was die Förderauflagen konkret verlangen

| ID | Kern | Folge für dieses ADR |
|---|---|---|
| **DS-02** | Datensparsamkeit, Privacy by Default; **optionale Abfragen nie vorausgewählt** | Kein `true` als Default irgendwo im Consent-Pfad — weder im DTO noch in der Oberfläche (E7) |
| **DS-03** | Belegbar: **Zeitpunkt + IP** bei digitalem Opt-in; **Kopplungsverbot**; umfassende Informationspflichten | E1 (eigenes Fachobjekt), E2 (Zweck-Granularität), E4 (Beleg samt IP) |
| **DS-04** | Erklärungen **versionieren**; Neu-/Altkunden unterscheidbar | E3 (Textversion als eigene Entität, unveränderlich) |
| **DS-07** | Anschlussnutzer ≠ Endkunde | E6 (wer erteilt für wen?) |
| **DS-08** | Sperrung statt Löschung bei Aufbewahrungspflicht | E8 (Widerruf löscht den Beleg NICHT) |
| **DS-11** | Keine PII ins öffentliche Repo | Testfixtures synthetisch, IP-Beispiele erfunden |

---

## 2. Die Kernfrage, an der alles hängt

**Ist die Einwilligung ein Zustand oder ein Ereignis?**

Der heutige Slot behandelt sie als Zustand: eine Spalte `consent_status` mit
drei Werten. Das ist für die Abfrage „darf ich gerade verarbeiten?" bequem und
für den Nachweis unbrauchbar — ein Zustand hat keine Geschichte. Wer im Jahr
2029 belegen muss, dass Frau X am 14. März 2026 um 10:22 Uhr aus dem Netz
139.…, auf Grundlage der Textfassung 2.1, in die monatliche Nutzerinformation
eingewilligt hat, findet in einer Statusspalte nichts davon.

**Dieser Entwurf behandelt sie als Ereignisfolge mit abgeleitetem Zustand.**
Die Wahrheit ist die lückenlose Kette der Erteilungen und Widerrufe; der
Zustand ist eine Ableitung daraus, die aus Bequemlichkeit mitgeführt wird —
nicht umgekehrt.

Das ist dieselbe Bauform wie beim Audit-Log (ADR-0003) und aus demselben
Grund: Ein Nachweis, den man überschreiben kann, ist keiner.

---

## 3. Befunde aus dem Bestand

### B1 — Der Slot passt, aber er ist zu eng
`consent_status` kennt genau einen Wert je Endkunde. Das Kopplungsverbot
verlangt aber, dass **jeder Zweck einzeln** erteilbar und einzeln widerrufbar
ist (Art. 7 Abs. 4 DSGVO; DS-03). Ein Endkunde kann in die Verbrauchsmessung
einwilligen und die monatliche Nutzerinformation ablehnen — das sind zwei
Antworten, nicht eine.

Die Spalte kann bleiben, aber nur als **Ableitung über den einen Zweck, der
die Verarbeitung trägt** — nicht als Gesamtaussage.

### B2 — Die IP ist personenbezogen, der Beleg braucht sie trotzdem
DS-03 verlangt die IP ausdrücklich. Eine IP-Adresse ist nach ständiger
Rechtsprechung ein personenbezogenes Datum. `energy.*` ist seit V0002
PII-frei (rote Linie 1) — die IP kann dort nicht hin.

Der Beleg gehört damit in den `identity`-Namensraum, feldverschlüsselt, mit
demselben Muster wie `identity.standort_pii` und `identity.endkunde_pii`.

### B3 — „Anschlussnutzer ≠ Endkunde" trifft die Einwilligung im Kern
DS-07 trennt beide Rollen. Wer einwilligt, ist die **betroffene Person** —
also derjenige, dessen Verbrauch gemessen wird. Das ist im Mietfall der
Anschlussnutzer, nicht der Endkunde (Vermieter). Der Endkunde kann für den
Anschlussnutzer nicht wirksam einwilligen; eine Einwilligung, die jemand für
einen anderen erteilt, ist keine.

Das Datenmodell trägt beide bereits als eigene Entitäten mit
`verarbeitungs_status` — die Einwilligung muss an **beide** andocken können.

### B4 — Es gibt bereits eine Sperr-/Lösch-Mechanik, die nicht kollidieren darf
V0024/V0032–V0036 führen `einschraenkung_grund_code`, `verarbeitungs_status`
und die Art.-18-/Art.-19-Kette. Der Widerruf einer Einwilligung ist etwas
**anderes** als eine Einschränkung nach Art. 18: Der Widerruf beendet die
Rechtsgrundlage für die Zukunft (Art. 7 Abs. 3), die Einschränkung friert eine
Verarbeitung ein, deren Grundlage strittig ist. Beide dürfen nicht in
denselben Statuswert fallen.

---

## 4. Entscheidungsvorschläge

### E1 — Einwilligung als eigenes Fachobjekt, nicht als Spalte
Eine Tabelle `consent.einwilligung`, eine Zeile je **(Person, Zweck,
Erteilung)**. Kein `UPDATE` auf den fachlichen Kern: Ein Widerruf setzt
`widerrufen_at` und ist damit selbst ein Ereignis; eine erneute Einwilligung
ist eine **neue Zeile**, keine Wiederbelebung der alten.

Begründung: DS-03 nennt den „Consent-Datensatz als eigenes Fachobjekt"
wörtlich. Und nur so ist die Frage „was galt am Stichtag X?" beantwortbar —
die Frage, die ein Nachweis stellt.

*Review: `database-lead` + `compliance-director`.*

### E2 — Ein Zweck, eine Antwort (Kopplungsverbot strukturell)
Zwecke sind eine **geschlossene, versionierte Liste**, jeder einzeln
erteilbar. Vorschlag für v1:

| Zweck-Code | Gegenstand | Verweigerung möglich, ohne die Leistung zu verlieren? |
|---|---|---|
| `messdaten_verarbeitung` | Erhebung/Verarbeitung der Verbrauchsdaten zum Zweck der Einsparermittlung | **Nein** — ohne sie gibt es keine Messung. Das ist keine Kopplung, sondern der Vertragsgegenstand. |
| `nutzerinformation` | Mindestens monatliche Information über Verbrauch und Einsparung | **Ja** — Opt-out ausdrücklich vorgesehen (Technik-Merkblatt Kap. 6) |
| `geraeteerkennung` | Zuordnung von Verbrauchsanteilen zu Gerätegruppen | **Ja** |
| `mehrwertdienste` | Über die Einsparermittlung hinausgehende Auswertungen | **Ja** |
| `wiss_auswertung` | Pseudonymisierte wissenschaftliche Auswertung des Programms | **Ja** — DE-04 kennt die Ausnahme bereits als Attribut |

Das Kopplungsverbot wird damit **strukturell** eingehalten: Es gibt technisch
keine Möglichkeit, vier Zwecke mit einem Häkchen zu erteilen, weil vier Zeilen
entstehen müssen.

**Offen (O1):** Ob `messdaten_verarbeitung` überhaupt auf Einwilligung
gestützt wird oder auf Vertragserfüllung (Art. 6 Abs. 1 lit. b). Das ist eine
Rechtsfrage mit erheblicher Folge — eine widerrufbare Einwilligung als
Grundlage der Kernverarbeitung ist etwas anderes als ein Vertrag. Der Entwurf
führt beide Möglichkeiten im Feld `rechtsgrundlage`, entscheidet aber nicht.

### E3 — Textversionen sind unveränderlich und inhaltsadressiert
`consent.text_version` trägt je Zweck eine fortlaufende Fassung mit
Gültigkeitszeitraum und einem **SHA-256 des Textes**. Eine erteilte
Einwilligung verweist auf die Fassung, unter der sie erteilt wurde.

Der Hash ist nicht Zierrat: Er ist der Unterschied zwischen „wir haben eine
Version 2.1" und „dies ist der Wortlaut, dem zugestimmt wurde". Ohne ihn
könnte jemand den Text einer bestehenden Fassung ändern, und alle
Einwilligungen zeigten stillschweigend auf den neuen Wortlaut.

`REVOKE UPDATE, DELETE` auf die Tabelle; Korrekturen laufen als neue Fassung
(SCD2 wie der Audit-Katalog).

### E4 — Der Beleg liegt verschlüsselt im `identity`-Namensraum
`identity.einwilligung_beleg`: Zeitpunkt (UTC), IP (verschlüsselt),
User-Agent (verschlüsselt), Erfassungsweg (`digital_opt_in` |
`vertrag_schriftlich` | `uebernahme_altbestand`).

Warum getrennt von `consent.einwilligung`: Die fachliche Zeile (wer, welcher
Zweck, welche Fassung, seit wann) wird **oft** gelesen — bei jeder
Zugriffsprüfung. Der Beleg wird **selten** gelesen — im Streitfall, bei einer
Auskunft, bei einer Prüfung. Beides in einer Tabelle zu führen hieße, das
PII-Feld bei jeder Routineabfrage mitzuschleppen; getrennt bleibt der heiße
Pfad PII-frei.

**Offen (O2):** Aufbewahrungsdauer des Belegs. Der Beleg ist zugleich Nachweis
(spricht für lange Aufbewahrung) und personenbezogenes Datum (spricht für
kurze). Vorschlag: gekoppelt an die Verjährung möglicher Ansprüche, nicht an
die Einwilligung selbst — zu entscheiden mit `retention-engineer` +
`compliance-director`, einzutragen in `compliance/dsgvo/retention-matrix.md`.

### E5 — ÜBERARBEITET nach dem Votum: ein RECHTSGRUNDLAGEN-Gate, kein Einwilligungs-Gate
**Die ursprüngliche Formulierung war falsch, und der `compliance-director`
hat sie abgelehnt.** Sie lautete: „ohne aktive Einwilligung für
`messdaten_verarbeitung` wird nicht eingespeist". Nach der O1-Entscheidung
wird es für den Endkunden aber **nie** eine Einwilligung für diesen Zweck
geben. Ein Gate, das darauf prüft, hätte genau zwei mögliche Ausgänge: Es
blockiert alle Endkunden-Messwerte, oder jemand legt für jeden Endkunden eine
lit.-a-Zeile an, damit es aufgeht. Der zweite ist der wahrscheinlichere und
der schlimmere — **ein Compliance-Mechanismus, der als Nebenwirkung falsche
Rechtsgrundlagen-Datensätze produziert, ist schädlicher als gar keiner.**

Verbindliche Fassung: **kein Ingest ohne dokumentierte, wirksame
Rechtsgrundlage für diese Person und diesen Zweck.**

Freigegeben mit neun Auflagen (A12-11 … A12-19), darunter: Der Worker bekommt
**kein** Tabellen-Grant auf `consent.*`, sondern eine `SECURITY DEFINER`-
Funktion, die genau `boolean` zurückgibt — er erfährt eine Erlaubnis, keine
Historie. Bewertung gegen den **Verarbeitungszeitpunkt**, nicht gegen `ts`
des Messwerts (ein Backfill über einen Widerruf hinweg ist ausgeschlossen).
Abgewiesene Uplinks werden **verworfen, nicht quarantäniert** — die Daten
einer Person, die widerrufen hat, in eine Tabelle mit offener Löschfrist zu
schreiben, wäre die Umkehrung dessen, was der Widerruf bewirken soll.

**Dass v1 synthetic-only ist, spricht FÜR die sofortige Umsetzung, nicht
dagegen** — die Durchsetzung zu bauen, solange kein einziger echter Messwert
fließt, ist der sicherste Zeitpunkt, den es je geben wird. Stufe C ist zudem
keine Option: Gate-Bedingung 5 aus ADR-0004 §7.1 nennt Consent-Enforcement
ausdrücklich.

**NOCH NICHT GEBAUT.**

Ursprüngliche Fassung:

### E5 (ursprünglich) — Die Einwilligung wirkt fail-closed auf den Ingest
Ohne aktive Einwilligung für `messdaten_verarbeitung` wird für diese Person
**nicht eingespeist** — dieselbe Linie wie der Herkunfts-Abgleich in ADR-0011
D4 und das Synthetic-only-Gate.

**Diese Wirkung wird in diesem Schritt NICHT scharf geschaltet.** Sie ist die
Stelle, an der ein Fehler den Betrieb anhält, und sie setzt E2/O1 voraus.
Gebaut wird zunächst die Verwaltung; die Kopplung an den Schreibpfad ist ein
eigener, ausdrücklich freizugebender Schritt (Stufe C).

### E6 — Einwilligen kann jede betroffene Person, nicht nur der Endkunde
`consent.einwilligung` trägt ein Paar `(subjekt_typ, subjekt_id)` mit
`subjekt_typ ∈ {endkunde, anschlussnutzer}`.

Kein Fremdschlüssel auf beide Tabellen gleichzeitig (das ginge nur mit zwei
nullable Spalten und einem CHECK) — sondern zwei nullable FK-Spalten mit
einem CHECK, der genau eine verlangt. Das ist die Form, die auch bei einer
späteren dritten Subjektart trägt und die Mandantentreue deklarativ hält.

### E7 — Nichts ist vorausgewählt (DS-02, hart)
Kein Default `true` — nicht im DTO, nicht in der Oberfläche, nicht in der
Datenbank. Der DB-Default für einen erteilten Zustand existiert **nicht**:
Eine Zeile in `consent.einwilligung` entsteht nur durch eine ausdrückliche
Handlung.

Das ist mehr als eine UI-Regel. Ein `DEFAULT true` in einer Spalte wäre ein
vorausgewähltes Häkchen, das niemand mehr sieht.

### E8 — Widerruf löscht nichts
Der Widerruf setzt `widerrufen_at` und beendet die Wirkung **ab diesem
Zeitpunkt** (Art. 7 Abs. 3 Satz 2: die Rechtmäßigkeit der bis dahin erfolgten
Verarbeitung bleibt unberührt). Zeile und Beleg bleiben stehen.

Sie zu löschen wäre doppelt falsch: Es vernichtete den Nachweis, dass
überhaupt je eingewilligt wurde, und es vernichtete den Nachweis, dass
rechtmäßig verarbeitet wurde, solange die Einwilligung galt.

Der Löschanspruch nach Art. 17 wird davon nicht berührt — er läuft über die
bestehende Krypto-Shredding-Mechanik (ADR-0009), die den Beleg mit dem
Schlüssel des Subjekts unlesbar macht, statt die Zeile zu entfernen.

---

## 5. Was NICHT Teil dieses ADR ist

- **Die Informationstexte selbst.** DS-03 verlangt Angaben zu Identität,
  Zweck, Bedingungen, Empfängern, Datenkategorien, Speicherdauer und Folgen
  der Verweigerung. Das ist ein juristischer Text, kein Datenmodell — er
  gehört von einer fachkundigen Stelle verfasst und als Textfassung
  eingepflegt, nicht hier erfunden.

  **Fortschreibung 2026-09-07:** Der User hat die Erlaubnis erteilt, die Texte
  zu schreiben (Fragenkatalog B1). Die verbindlichen Vorgaben stehen im Votum
  vom 2026-09-07, **V-8a bis V-8d**: welche (Zweck, Subjektart)-Kombinationen
  einen eigenen Text brauchen (acht, nicht fünf), die fünfzehn Pflichtangaben
  je Text, die Speicherdauer je Zweck und die fünf Voraussetzungen der
  Veröffentlichung. Die Entwürfe liegen unter **`docs/consent/`** und sind
  `draft` — **kein `INSERT` in `consent.text_version` vor der Freigabe**
  (AW-23/AW-24).

  Dabei aufgefallen und hier festgehalten, weil es dieses ADR betrifft:
  **`consent.text_version` führt keine Subjektart.** Eindeutigkeit und
  Überlappungsprüfung laufen über `zweck_code`, die Textsuche ebenfalls. Für
  einen Zweck kann damit zu einem Zeitpunkt genau EIN Wortlaut gelten — die
  Vorgabe je Kombination ist im heutigen Schema nicht speicherbar. Betroffen
  sind die drei Zwecke, die in beiden Spalten `opt_in` sind. Eine Migration um
  `subjekt_typ` (samt Eindeutigkeits-, Überlappungs- und Fremdschlüssel) ist
  vor der ersten Veröffentlichung erforderlich.
- **Die Oberfläche für den Endkunden.** Das Nutzerportal ist ein eigenes
  Vorhaben; hier entsteht die Betriebssicht (Erfassen einer schriftlich
  erteilten Einwilligung, Widerruf entgegennehmen, Stand einsehen).
- **Die Scharfschaltung des Ingest-Gates** (E5, Stufe C).

---

## 6. Stufenplan

| Stufe | Inhalt | Abhängig von | Betroffen |
|---|---|---|---|
| **A1** | Schema: Zweck-Katalog, Textfassungen, Einwilligung, Beleg | — | Migration |
| **A2** | Audit-Event-Typen (erteilt/widerrufen/Textfassung veröffentlicht) | A1 | Migration |
| **B1** | API: Stand lesen, erfassen, widerrufen | A1, A2 | Backend |
| **B2** | Betriebssicht: Stand je Endkunde, Erfassen, Widerruf | B1 | Frontend |
| **C** | **Wirkung auf den Ingest scharf schalten** (E5) | alle, O1 | Ingest-Worker + **Freigabe** |
| **D** | Nutzerportal-Selbstbedienung | C, Portal-ADR | später |

---

## 7. Offene Punkte

- **O1 — ENTSCHIEDEN (compliance-director, 2026-09-05), differenziert nach
  Subjektart.** Endkunde = Vertragspartei → **lit. b**; Anschlussnutzer
  (Mieter) ist es nicht → **lit. a**. Die Folge ist unsymmetrisch: Der
  Endkunde kann die Messung nicht widerrufen (er kann kündigen), der
  Anschlussnutzer sehr wohl. In V0047 als Matrix umgesetzt und über einen
  zusammengesetzten Fremdschlüssel erzwungen.
  **Vorbehalt F-1 — ERLEDIGT (2026-09-07).** Auf die Frage, ob der ESZ-Vertrag
  die Verbrauchsmessung als Hauptleistung schuldet, lautet die Antwort des
  Users: **Ja.** Der lit.-b-Zweig des Endkunden steht damit. Zwei
  Einschränkungen, die keine Formalien sind (Votum V-2): Er trägt nur, **soweit
  der Endkunde selbst natürliche Person ist** (s. F-2), und nur für Verträge,
  **die die Klausel tatsächlich enthalten** — das „Ja" der Geschäftsführung ist
  Entscheidungsgrundlage, nicht Beleg (Art. 5 Abs. 2). Erforderlich bleibt der
  Aktenvermerk **AW-2** mit Bezeichnung und Fassungsdatum des
  Vertragsmusters, Klauselnummer und Geltungsbereich.

  **Vorbehalt F-2 — OPERATIONALISIERT (2026-09-07).** Endkunden sind
  juristische Personen, in deren Gebäuden natürliche eingemietet sein können.
  Aus der Grundsatzfrage wird damit die Datensatzfrage: Welcher konkrete
  Endkunde ist was? Dafür trägt `energy.endkunde` seit **V0050** das Merkmal
  `rechtsform_kategorie` — **dokumentarisch, nicht berechtigend**; es ist
  ausdrücklich kein Zugriffs- und kein Schutzschalter (Votum V-1).

  **Keine Zeile der Matrix entfällt.** Ist der Endkunde eine juristische
  Person, ist die lit.-b-Zeile Vertragsdokumentation ohne
  datenschutzrechtliche Bedeutung; ist er eine natürliche Person, trägt sie.
  Überdokumentation ist unschädlich, Unterdokumentation nicht.

  **Der materielle Befund dazu:** Bei einer juristischen Person ist die
  **Ansprechperson nicht Vertragspartei** — für ihre Daten scheidet lit. b
  aus, richtig ist **lit. f mit dokumentierter Abwägung** (LIA offen, AW-4).
  Aus einer `endkunde`-Zeile darf **niemals** gefolgert werden, dass für die
  Ansprechperson eine Rechtsgrundlage vorliegt. Das sind zwei verschiedene
  Betroffene.

  Die `begruendung` der Endkunden-Zeile ist mit V0050 entsprechend
  fortgeschrieben; der Migrationstext V0047 bleibt als angewandte Historie
  unverändert.
- **O2 — ENTSCHIEDEN (compliance-director, 2026-09-05), zweistufig.**
  *Stufe 1:* `ip_enc`/`user_agent_enc` werden zum Ende des **dritten vollen
  Kalenderjahres nach Wegfall der Wirkung** feldweise genullt (Verjährung
  Art. 82 DSGVO / § 199 BGB und Verfolgungsverjährung § 41 BDSG i. V. m.
  § 31 OWiG decken sich bei drei Jahren).
  *Stufe 2:* Beleg-Rumpf und Fachzeile sind an die Retention der getragenen
  Daten gekoppelt, gedeckelt durch den F2/A-O6-Anker — **ein Nachweis, der
  mit dem Widerruf verfällt, ist keiner**.
  Die Regel ist relativ formuliert und damit **sofort umsetzbar**; nur die
  Obergrenze hängt an A-O6. Löschmittel für Stufe 1 ist ein `UPDATE`, kein
  `DELETE` — `edms_retention` ist dafür bereits ausgestattet.
  **Der Löschlauf selbst ist NOCH NICHT gebaut.**
- **O3 — Altbestand: RUHEND MIT TRIGGER (2026-09-07).** Auf die Frage nach
  Altkunden ohne belegbare Einwilligung lautet die Antwort des Users: „Gibt es
  nicht." Daraus folgt keine Erledigung, sondern eine Sperre: Der
  Erfassungsweg `uebernahme_altbestand` bleibt im Schema (V0044) und ist auf
  der **API fail-closed gesperrt** (HTTP 400, AW-20). Die Sperre trägt in
  beide Richtungen — stimmt die Antwort, kostet sie nichts; stimmt sie nicht,
  verhindert sie eine dokumentierte Einwilligung ohne Beleg. Ein erfundener
  Nachweis ist schlimmer als ein fehlender, weil er die Prüfung besteht.
  **Auslöser:** die erste Datenübernahme aus einem Alt- oder Fremdsystem.
  *Offen aus AW-20:* das zusätzlich verlangte Audit-Ereignis beim Versuch —
  der Emitter hängt heute am `@AuditAction`-Dekorator einer erfolgreichen
  Route, und eine Emission aus dem Fehlerpfad einer `@Transactional`-Methode
  verschwände mit dem Rollback.
- **O4 — Minderjährige: RUHEND MIT TRIGGER, und fachlich korrigiert
  (2026-09-07).** Es gibt derzeit keine Mietfälle (Antwort A9); der Auslöser
  ist die **erste Anlage** eines Anschlussnutzers, nicht der erste Ingest.
  **Die Norm war falsch benannt:** Art. 8 DSGVO gilt für Dienste der
  Informationsgesellschaft, die einem Kind **direkt angeboten** werden — eine
  Verbrauchsmessung ist das nicht. Die richtige Frage ist die
  **Einwilligungs- und Einsichtsfähigkeit Minderjähriger** und, wo sie fehlt,
  die Erklärung durch den Träger der elterlichen Verantwortung (AW-21). Eine
  Auflage, die auf die falsche Norm zeigt, führt später zur falschen Prüfung.
- **O5 — Widerruf über einen anderen Kanal** (Brief, Telefon). Der
  Erfassungsweg deckt das Erteilen ab; für den Widerruf fehlt das Gegenstück.
  **Ausdrücklich NICHT ruhend** (Votum V-7): Von A9/C2 gar nicht betroffen —
  ein Widerrufsweg muss existieren, sobald die **erste** Einwilligung erteilt
  wird, auch beim Endkunden.
- **O6 — Widerspruch nach Art. 21: NEU (2026-09-07).** Für den Opt-out-Zweck
  `nutzerinformation`/Endkunde existiert **kein Erfassungsweg**.
  `consent.einwilligung` verbietet bei lit. b den Widerruf (V0047,
  `ck_einwilligung_kein_widerruf_bei_vertrag`) — richtig so, denn ein
  Widerspruch ist etwas anderes als ein Widerruf. Nur: Das Gegenstück fehlt.
  Ein Endkunde, der der monatlichen Information widerspricht, kann derzeit
  nicht dokumentiert werden, obwohl TB-06 das Opt-out ausdrücklich vorsieht
  (AW-27).
  **Dabei zu klären:** Das Votum bezeichnet dieses Opt-out als Widerspruch
  nach Art. 21. **Art. 21 Abs. 1 gilt seinem Wortlaut nach nur für lit. e und
  lit. f, nicht für lit. b.** Das Opt-out selbst bleibt richtig — es ist dann
  aber ein leistungsbezogenes Abwahlrecht und kein Betroffenenrecht, und die
  Bauform des Erklärungsobjekts hängt daran. Einordnung durch den
  `compliance-director`, s. `docs/consent/README.md`.

---

## 8. Compliance-Einfluss

- **DSGVO:** Art. 4 Nr. 11 (Einwilligungsbegriff), Art. 6 Abs. 1 lit. a,
  Art. 7 (Bedingungen, Nachweispflicht, Widerruf, Kopplungsverbot), Art. 8
  (O4), Art. 13 (Informationspflichten), Art. 25 (Privacy by Default → E7),
  Art. 30 (RVT-Eintrag), Art. 32 (Verschlüsselung des Belegs).
- **ISO 27001:2022:** A.5.34 (Privatsphäre und Schutz von PII), A.8.11
  (Datenmaskierung), A.5.33 (Schutz von Aufzeichnungen — E3/E8), A.8.24
  (Kryptographie).
- **Fortzuschreiben:** `compliance/dsgvo/rvt.md`,
  `compliance/dsgvo/dsfas/dsfa-0001-messdaten-verarbeitung.md` (dort ist die
  Consent-Mechanik ausdrücklich als „noch nicht gebaut" vermerkt),
  `compliance/dsgvo/retention-matrix.md` (O2),
  `compliance/iso27001/controls.md`.

---

## 9. Was davon gebaut ist

**Stand 2026-09-05:** A1, A2, B1 und B2 sind gebaut (V0044/V0045,
`src/backend/src/consent/**`, `schemas/openapi/consent.openapi.yaml`,
`src/frontend/src/features/consent/**`). C und D stehen aus.

**Nachtrag 2026-09-07** (Votum zu den User-Antworten, V0050 + AW-20):

- Die Rechtsgrundlagen-Matrix ist um den Vorbehalt F-1 bereinigt und um die
  operationalisierte Fassung von F-2 ergaenzt (V0050, `UPDATE` auf
  `consent.zweck_subjekt.begruendung` — V0047 bleibt als angewandte Historie
  unveraendert).
- **E12 — `uebernahme_altbestand` ist auf der API gesperrt** (AW-20, s. O3).
  Damit ist der einzige verbleibende betrieblich zulaessige Erfassungsweg
  `vertrag_schriftlich`. Das ist keine Verengung, sondern die Folge der
  Tatsachenlage: Es gibt weder ein Nutzerportal (also kein `digital_opt_in`,
  E9) noch einen Altbestand (Antwort C2).
- Die Einwilligungstexte sind als **Entwurf** geschrieben und liegen unter
  `docs/consent/` (AW-23/AW-24). **Kein `INSERT` in `consent.text_version`
  vor der Freigabe** — fuenf Voraussetzungen sind offen (V-8d).
- **Stufe C bleibt ungebaut.** Sie war „abhaengig von O1"; O1 ist jetzt
  entschieden und der Vorbehalt gefallen — die Scharfschaltung braucht
  dennoch die **User-Freigabe** und faellt unter das fortbestehende Veto
  gegen die Oeffnung des Ingest-Gates.

B2 haengt an BEIDEN Detailseiten — Endkunde UND Anschlussnutzer. Das ist
nicht Bequemlichkeit, sondern DS-07: Im Mietfall ist der Anschlussnutzer die
betroffene Person und willigt selbst ein; eine Oberflaeche, die nur am
Endkunden Einwilligungen kennt, wuerde zu der Annahme verleiten, der
Vermieter koenne fuer den Mieter zustimmen.

**Was beim Bau von B1 entschieden wurde** (nicht vorab im ADR, hier
nachgetragen):

**E9 — Ein digitales Opt-in ist ueber die BETRIEBS-API nicht erfassbar.**
DS-03 verlangt bei digitalem Opt-in die IP der einwilligenden Person. In der
Betriebssicht handelt aber nicht die betroffene Person, sondern ein
Mitarbeiter, der eine anderswo erteilte Einwilligung nachtraegt — die einzige
dort verfuegbare IP ist seine. Sie als IP der betroffenen Person zu
protokollieren waere eine **Faelschung des Nachweises**: Der Beleg behauptete
einen digitalen Vorgang, den es nie gab, an einer Adresse, die nichts mit der
Person zu tun hat. Die API weist `digital_opt_in` deshalb mit 400 ab; der
Wert bleibt fuer Stufe D (Nutzerportal) reserviert.

Das hat eine Folge, die benannt gehoert: **Solange es kein Nutzerportal gibt,
entsteht im EDMS ueberhaupt kein digitales Opt-in.** Jede Einwilligung ist
eine nachgetragene — schriftlich erteilt oder uebernommen. Wer DS-03 liest
und die IP-Spalte gefuellt erwartet, findet sie leer, und das ist richtig so.

**E10 — Der Widerruf ueberschreibt sich nicht selbst.** Ein zweiter Widerruf
antwortet 409 und laesst den urspruenglichen Zeitpunkt stehen. Wuerde er ihn
ueberschreiben, verschoebe sich die Aussage, ab wann die Verarbeitung ohne
Rechtsgrundlage lief — und genau das ist die Frage, die im Streitfall zaehlt.

**E11 — Der Stand fuehrt auch die Zwecke OHNE Einwilligung.** Eine Liste, die
nur Erteiltes zeigt, beantwortet die Frage nach dem Nicht-Erteilten nicht.
Fuer eine Auskunft nach Art. 15 DSGVO ist „hierzu wurde nie eingewilligt"
eine Aussage, die getroffen werden muss — sie darf nicht als Abwesenheit
eines Listeneintrags erraten werden muessen.

**E12 — Der Hash wird serverseitig gebildet.** Ein vom Aufrufer mitgelieferter
SHA-256 waere eine Behauptung ueber den Text statt einer Pruefung desselben.

Nicht gebaut und ausdrücklich nicht vorweggenommen: die Wirkung auf den
Ingest (E5/Stufe C), die Informationstexte selbst, die Endkunden-Oberfläche.

Der Zweck-Katalog aus E2 ist als Werteliste eingepflegt, die
**Rechtsgrundlage je Zweck bleibt jedoch ein Feld ohne Vorbelegung** —
O1 ist nicht entschieden, und der Entwurf gibt vor, sie nicht zu entscheiden.

**Nachtrag 2026-09-10 — der Widerspruch ist bedienbar (AW-27).**

`consent.widerspruch` war seit V0052 vollstaendig gebaut: Tabelle, Dienst,
drei Routen, Audit-Pflichtereignisse, Beleg (V0069). Die Oberflaeche kannte
die Routen **gar nicht** — `consentApi.ts` rief sie nirgends auf.

Das war folgenreicher als eine fehlende Schaltflaeche. Die monatliche
Nutzerinformation ist beim Endkunden `opt_out`: Sie laeuft, bis widersprochen
wird (TB-06). Der Erzeugungslauf wertet einen Widerspruch **laengst** aus
(`nutzerinfo.repository.ts`, `hatWiderspruch`; die Kennzahl
`anzahl_uebersprungen_widerspruch` steht im Audit). Nur ERFASSEN konnte ihn
niemand. Ein Kunde, der die Zusendung abbestellt, war im System nicht
abbildbar — die Information waere weitergelaufen.

Im Consent-Abschnitt stand an genau dieser Stelle der Satz „Zu diesem Zweck
ist keine Einwilligung zu erfassen". Richtig, aber unvollstaendig: Erteilt
wird dort nichts, **widersprochen aber sehr wohl**. Der Satz ist entfallen —
mit `erteilbar = opt_in` und `widersprechbar = !opt_in` deckt die Ansicht
jeden der drei Erlaubnismodi ab.

**E13 — Wo die Luecke wirklich lag.** Zunaechst war sie beim
**Anschlussnutzer** vermutet. Das war zu kurz gegriffen: In der Matrix (V0047)
ist fuer ihn heute **jeder** Zweck `opt_in`. Dort widerspricht man nicht, man
widerruft — und der Widerruf war da. Ein Widerspruch fuer einen
Anschlussnutzer ist derzeit nicht einmal schreibbar (zusammengesetzter
Fremdschluessel auf die Matrix plus `ck_widerspruch_kein_opt_in`). Die Ansicht
bietet ihn dort deshalb NICHT an; sie folgt dem `erlaubnismodus` und zieht
automatisch nach, sollte die Matrix je eine Opt-out-Zeile fuer ihn bekommen.

Die Luecke lag beim **Endkunden**: `nutzerinformation` (opt_out) und
`messdaten_verarbeitung` (vertraglich).

**E14 — Ein wirksamer Widerspruch steht im STATUS, nicht nur im Verlauf.**
Stuende dort weiter „Gilt ueber den Vertrag", behauptete die Ansicht eine
laufende Verarbeitung, der die betroffene Person widersprochen hat — und
danach richtet sich, wer als Naechstes auf die Zeile schaut. Widerspruchs- und
Einwilligungsverlauf bleiben **getrennt**: zwei verschiedene Rechte, die man
ohnehin leicht verwechselt; eine gemeinsame Liste muesste eine Auskunft nach
Art. 15 wieder aufteilen.

**E15 — Der Erfassungsweg bleibt `vertrag_schriftlich`**, auch beim
Widerspruch — dieselbe Linie wie E9 (`erklaerung.policy.ts` teilt sich beide
Vorgaenge). Die Ruecknahme ist ein eigener Vorgang mit eigenem
Erklaerungsdatum und eigener Fundstelle, nicht das Loeschen der ersten
Erklaerung: Der Zeitraum, in dem widersprochen war, entscheidet, ob eine
Verarbeitung damals zulaessig war.

**Dabei mitgefunden — das Endkunden-Formular war unbenutzbar.**
`endkunde.service.ts` weist `vonWissAuswertungAusgenommen` seit AW-27 in
Anlegen UND Aendern mit 400 ab (richtig so: Das DE-04-Attribut folgt seit
V0052 der Erklaerung). Die Oberflaeche bot das Haekchen aber weiter an, und
ihr Mapper schickte das Feld bei JEDEM Absenden mit, weil ein `boolean` nie
`undefined` ist. **Jeder** Versuch, einen Endkunden anzulegen oder zu aendern,
scheiterte damit an einem 400 — nicht nur das Haekchen. Das Feld ist aus
beiden Formularen, Zod-Schemas und Mappern entfernt; GELESEN wird es weiter
(Detail, Liste) — es ist die Durchsetzungsstelle, nur nicht mehr die
Eingabestelle. Im OpenAPI-Vertrag bleibt es als `deprecated` mit dem Hinweis
stehen, dass es abgewiesen wird und wie es stattdessen gesetzt wird; das
Backend behaelt es im DTO, damit ein Aufruf einen **erklaerten** Fehler
bekommt statt der generischen `forbidNonWhitelisted`-Meldung.
