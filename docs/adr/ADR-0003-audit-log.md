# ADR-0003: Unveränderliches Audit-Log (append-only Event-Hypertable, TimescaleDB)

- **Status:** **accepted** — **durch User freigegeben am 2026-07-10** (mit stündlicher Anker-Kadenz als Default, §14.5). Phase 1 (Abschnitte 1–10) und Teil B (Phase-2-Design, Abschnitte 11–23 + Anhänge D/E/F) abgeschlossen; beide Lead-Reviews eingearbeitet (§22). DB-Schema-Skizze: `schemas/database/adr-0003-audit-log.md`. **Kein** Schema, **keine** Migration in diesem ADR — DDL folgt über `/add-migration` **nach Phase 3** (Compliance-Nachträge, §7.4). Offene Punkte A-O1…A-O8 in §23; A-O3 (KMS/Vault für Anker-Signatur) koppelt an den offenen Hosting-Input aus ADR-0004 und ist Vorbedingung der Ingest-Gate-Öffnung, nicht dieser Schema-Migration.
- **Datum:** 2026-07-09
- **Autor:** product-director (Phase 1, Abschnitte 1–10); technical-director (Phase 2, Teil B)
- **Reviewer:** `compliance-director` — **Phase 1 ohne Veto bestätigt (2026-07-09)**; Risiko-Flag MITTEL, Beschäftigtendatenschutz-Schärfung (Art. 88 DSGVO/§26 BDSG), fünf rote Linien für Phase 2, Phase-3-Vorschau; `technical-director` (Phase 2, Design-Owner); **Lead-Reviews `audit-trail-engineer` (Envelope / Hash-Kette / Verifikation) + `security-lead` (Rollen / REVOKE / Krypto / Threat-Model) — abgeschlossen 2026-07-09, Voten eingearbeitet (§22)**
- **Freigabe:** User — **Phase-1-Entscheidungen getroffen (2026-07-09)**: F1 = Hash-Kette je Partition, F2 = Retention-Arbeitshypothese (Projektlaufzeit + 5 Jahre), V1–V3 bestätigt (Abschnitt 8.1); **Phase-2-Design freigegeben, ADR accepted (2026-07-10)**
- **Workflow:** `/new-feature audit-log`, Phase 1 (Konzept & Vision) laut `.claude/docs/workflow-catalog.yaml`
- **Roadmap-Bezug:** „Als Nächstes: ADR-0003 — Audit-Log-Schema (TimescaleDB-Hypertable) — **Voraussetzung für die Ingest-Gate-Freigabe von ADR-0004**" (`production/roadmap.md`, revision 5)

> **Hinweis zum Reifegrad:** Dies ist das **Vision-Memo** (Phase-1-Output,
> abgeschlossen). Es beantwortet die Produktfragen (Zielnutzer, Job-to-be-done,
> Erfolgsmetriken, Scope, Alternativen, Compliance-Risiko) und die
> Phase-1-Entscheidungen (F1/F2, V1–V3). Die **Produkt-Richtung** ist damit
> gesetzt: Integritäts-Ambition = **Hash-Kette je Partition** (F1),
> Retention-**Arbeitshypothese** = Projektlaufzeit + 5 Jahre (F2). **Alle konkreten
> Detail-Entscheidungen** — Event-Envelope-Spaltenschnitt, Hypertable-/Chunk-Parameter,
> Verkettungs-/Hash-Algorithmus und Manifest-Format, Decorator-Signatur, finaler
> Retention-Mechanismus — sind **bewusst Phase 2/3/4.** In diesem ADR wird **kein
> Schema entworfen und keine Migration angelegt.**
>
> **Vorarbeit vorhanden:** Das Ziel-Schema `audit` ist in **ADR-0004 §12 bereits
> reserviert**; die Extensions `timescaledb` (Apache-2/`-oss`) und `btree_gist`
> liegen mit **`migrations/V0001__baseline_extensions.sql`** vor (V0001-Kommentar
> nennt den Audit-Log-Hypertable aus ADR-0003 ausdrücklich als Mitnutzer von
> `timescaledb`). Phase 2 kann direkt auf `audit` aufsetzen.

---

## 1. Vision-Satz (Job-to-be-done)

> **Als Auditor (BAFA-Fördergeber, Datenschutz-Aufsicht, interne ISO-27001-Revision)
> und als Incident-/Betriebsprozess brauche ich ein unveränderliches, append-only
> geführtes Audit-Log, in das jeder state-ändernde Fach-Service automatisch und
> PII-frei protokolliert, *wer wann was woran mit welchem Ergebnis* getan hat —
> damit Rechenschaftspflicht (Art. 5(2)/32 DSGVO), ISO/IEC 27001 A.8.15 und die
> BAFA-Nachweispflichten (TB-08) maschinell prüfbar belegt sind, statt auf
> Vertrauen zu beruhen.**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

Das Audit-Log ist einer der **zwei harten Gate-Bausteine** (neben ADR-0002 Auth),
die stehen müssen, **bevor produktiver PII-/Verbrauchs-Ingest** erlaubt ist
(ADR-0004 §6 und §7.1, Gate-Bedingung 2; `roadmap.md` rev. 5, Sequenz-Gate). Ohne
ein unveränderliches Zugriffs-/Vorgangs-Protokoll existierten personenbezogene
Verbrauchsdaten **ohne nachweisbare Rechenschaft** — Art. 30/32 wären nicht
belegbar. ADR-0003 macht das Studio-Grundprinzip „**Bei Audit-Trail-Änderungen:
niemals rückwirkend editieren, nur append-only**" (`Projektleitlinien`) und die DB-Regel
„**`REVOKE UPDATE, DELETE` auf Audit-Tabellen im Schema `audit`**"
(`.claude/rules/database-migrations.md`) zu einem umgesetzten, geprüften Baustein.

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Auditor / Fördergeber (primär, Leser/Stakeholder).**
BAFA-Prüfer, Datenschutz-Aufsicht/DSB, interner `iso27001-auditor`. Prüft
**Nachweise, nicht Fachbedienung**: Wurde **jeder BAFA-Export autorisiert und
protokolliert** (TB-08)? Sind **Consent-Änderungen belegt**? Ist das Log
**unveränderlich** (A.8.15/A.5.33)? Erfolg = jede rechenschaftspflichtige Aktion
ist **lückenlos, manipulationssicher und ohne Vertrauensvorschuss** rekonstruierbar;
die quartals-/monatsweisen Prüfpunkte des Audit-Programms
(`compliance/iso27001/audit-programm.md`) stützen sich auf reale Log-Nachweise.

**Persona B — Incident-/Betriebsprozess (primär, später).**
`devops-lead`, `security-lead`, DSB im Vorfalls-Fall (DS-12, R-0003). Nutzt das Log
als **Beweismittel** bei Datenschutz-/Sicherheitsvorfällen: rekonstruiert „was ist
wann durch wen passiert", belegt eingeleitete Maßnahmen (DS-12: „Maßnahmen
dokumentieren"). Erfolg = das Log liefert im Ernstfall die Faktenbasis für die
72-h-Meldung an Aufsichtsbehörde **und** BAFA.

**Persona C — Fach-Service (System-Akteur, primär als Emittent).**
Jeder state-ändernde Service — Consent-Verwaltung (eigener ADR), Stammdaten-CRUD
(nach ADR-0002), Einsparberechnung/BAFA-Export (ADR-0007), PII-Zugriffspfad
(ADR-0004 `identity`). Schreibt Events **automatisch** über den
**Audit-Action-Decorator** (`.claude/rules/backend-nestjs.md`: „Audit-Action-Decorator
auf allen state-ändernden Methoden, die fachlich nachvollziehbar sein müssen").
Erwartet: **schmale Emit-Schnittstelle, geringer Schreibpfad-Overhead, kein
PII-Leak-Risiko**.

**Persona D — compliance-director / dsgvo-auditor (Stakeholder, Veto).**
Belegt mit dem Log A.8.15 (bisher **im SoA unbelegt** — `soa.md` A.8.15 steht auf
`tbd`), stützt Art. 32 (TOM) und Art. 5(2) (Rechenschaft). Prüft das
**Spannungsfeld Aufbewahrung vs. Speicherbegrenzung** (Art. 5(1)(e)/DS-08) und
entscheidet über DSFA-/RVT-Relevanz (Abschnitt 7).

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| **M1** | **Append-only DB-seitig erzwungen** — `UPDATE`/`DELETE` auf `audit.*` schlagen fehl, auch für den Applikations-DB-User | Integrationstest gegen Testcontainer-PG16+Timescale-`oss`: `INSERT` erfolgreich, `UPDATE`/`DELETE` durch `REVOKE` (DB-Rule) **abgewiesen**; Nachweis, dass der App-Rolle **nur** `INSERT`+`SELECT` auf `audit.*` erteilt ist | **0** erfolgreiche `UPDATE`/`DELETE`; Test **grün** und Teil der CI |
| **M2** | **Integritätsprüfung mechanisch möglich & monatlich grün** | Eine deterministische **Prüf-Funktion/Query** verifiziert die **Hash-Kette je Partition** (F1) und gleicht gegen das **Export-Manifest** des Cold-Archivs ab; im **Phase-7-Betrieb** monatlich ausführbar; bindet an `workflow-catalog` Phase-7-Gate „**Monatliche Audit-Log-Integritätsprüfung grün**" und an `audit-programm.md` | Prüfung **ausführbar** und in v1 gegen synthetische Daten **grün**; kein manueller Sonderlauf nötig |
| **M3** | **Kein PII-Klartext im Log** | Schema-Inspektion + `pii-scan`-Hook über alle `audit.events`-Felder: Akteur = **opake Principal-ID** (Keycloak-`sub`), Objekt = **Pseudonym/Entity-Ref** (ADR-0004 `pseudonym_id`), **keine** Freitext-/Klartext-PII-Felder im Envelope | **0** Klartext-PII, **0** Hook-Findings |
| **M4** | **Schreibpfad-Overhead je Event im Budget** | Benchmark: zusätzliche p95-Latenz einer auditierten state-ändernden Operation gegenüber der nicht-auditierten Baseline | Overhead unter definiertem Budget (**Zielwert = Phase 2**); Audit-Emit darf Fach-Operationen **nicht spürbar** bremsen |
| **M5** | **Nachweisbare Decorator-Abdeckung** | Mechanismus (Lint-Regel/Test), der state-ändernde, fachlich-nachvollziehbare Controller-/Service-Methoden **ohne** Audit-Action-Decorator meldet | Mechanismus **vorhanden**; für die zum Zeitpunkt existierenden pflichtigen Methoden **100 %** abgedeckt |

> **M4-Zielwert** und das **M2-Integritätsverfahren** sind bewusst Phase 2. M1/M3/M5
> sind bereits in v1 hart prüfbar und CI-tauglich.

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope v1 (Vorschlag)

- **`audit`-Schema mit Event-Hypertable** (TimescaleDB, nur Apache-2-Features —
  analog ADR-0004: **kein** natives Compression/Retention-Policy/Continuous-Aggregate;
  Ersatz-Mechanik = Phase-2/4-Thema, 5.3). Ziel-Schema `audit` ist reserviert
  (ADR-0004 §12), Extensions liegen vor (V0001).
- **`REVOKE UPDATE, DELETE`** auf `audit.*` als **DB-seitige Pflicht**
  (`.claude/rules/database-migrations.md`) — **atomar in derselben Migration**, die
  die Tabellen anlegt (rote Linie 3); App-Rolle erhält **nur** `INSERT`+`SELECT`
  (M1). Kein Applikationspfad, der Events ändert oder löscht.
- **Event-Envelope-Schema** — die generische Hülle „**wer / wann / was / worauf /
  Ergebnis**":
  - *wer* = **Akteur** als **opake Principal-ID** (Keycloak-`sub`; System-Akteur als
    Service-Kennung) — **kein** Klartext-Name.
  - *wann* = **UTC-Zeitstempel** (Zeit-Dimension des Hypertables;
    `backend-nestjs.md`: „Zeitstempel immer UTC").
  - *was* = **Event-Typ/Aktion** (kontrolliertes Vokabular; neue Typen via
    `/add-audit-event`).
  - *worauf* = **Objekt-Referenz** als **Pseudonym/Entity-Ref** (z. B. ADR-0004
    `pseudonym_id`, Entitätstyp + Surrogat-ID) — **KEIN PII-Klartext** (M3).
  - *Ergebnis* = **Ausgang** (erfolg/abgelehnt/fehler) + strukturierter,
    PII-freier Kontext.
- **Schreib-Service** (`audit-trail-engineer`-Domäne) als **einziger** Schreibpfad
  auf `audit.*` — kapselt Envelope-Validierung, PII-freien Kontext, append-only-Insert.
- **NestJS-Audit-Action-Decorator (Stub + Contract)** — die **Schnittstelle**, mit
  der state-ändernde Methoden Events emittieren (`backend-nestjs.md`-Pflicht).
  Die **flächendeckende Verdrahtung** aller Fach-Services ist Folge-Scope (5.1).
- **Integritätsmechanismus = Hash-Kette je Partition (F1 entschieden).** Jedes Event
  wird über Zeit + Vorgänger-Hash **je Partition** verkettet, sodass Manipulation
  **und Lücken** mechanisch erkennbar werden — **auch gegen privilegierten Zugriff**.
  Verkettungs-/Hash-Algorithmus, Kettenkopf-Handling je Chunk und **Manifest-Format**
  = Phase-2-Detail (5.2).
- **Kontrollierter `drop_chunks()`-Retention-Sonderpfad** (Retention-Mechanik zu F2):
  **separate privilegierte Betriebsrolle** (die App-Rolle bleibt strikt
  `INSERT`+`SELECT`); je Lauf **Vier-Augen-Prinzip + `compliance-director`-Freigabe**;
  **verifizierter Cold-Export** (WORM/S3, DE-Only, Row-Count-/Checksum-Abgleich)
  **VOR** der Löschung mit Nachweis in `compliance/audit-reports/`; der **Löschlauf
  selbst ist ein Pflicht-Audit-Event**; die **Monats-Integritätsprüfung gleicht gegen
  das Export-Manifest ab** (so bleibt die Kette über archivierte Chunks hinweg
  lückenlos verifizierbar).
- **Minimale Abfrage-/Prüf-Funktion** für die Integritätsprüfung (M2) — verifiziert
  die Hash-Kette und gleicht gegen das Export-Manifest ab; nur so viel Lese-Oberfläche,
  wie die monatliche Prüfung (Phase 7) braucht.

**Fachliche Scope-Treiber (Nachweisgrundlage, Detail-Events = `/add-audit-event`):**

| Treiber | Quelle | Audit-Bezug |
|---|---|---|
| **Jeder BAFA-Export ist ein protokollierter, autorisierter Vorgang** | TB-08 | Export = pflichtiges Audit-Event (wer/Umfang/Förderjahr/Pseudonym-Set/Ergebnis) |
| **Consent-Datensätze audit-geloggt** | DS-03/DS-04, Consent-ADR | Consent-Grant/-Widerruf/-Änderung als pflichtige Events |
| **Dokumentation von Sicherheitsmaßnahmen/Vorfällen** | DS-12, R-0003 | Log als **Beweismittel** für Incident-Runbook + BAFA-Meldeweg |
| **A.8.15 Logging** | ISO 27001 SoA (bisher `tbd`/unbelegt) | ADR-0003 = belegender Nachweis für A.8.15 |
| **PII-Zugriff nachvollziehbar** | Art. 32 / ADR-0004 `identity` | Zugriff auf PII-Namensraum als auditierbarer Vorgang |

### 4.2 Out-of-Scope v1 (explizit NICHT)

- **Audit-UI / Viewer** → späterer ADR (Betriebs-/Auditor-Oberfläche).
- **Audit-Reports / Auszugs-Aufbereitung** → späterer ADR (BAFA-Report-Aufbereitung
  hängt teils an ADR-0007).
- **SIEM-/Export-Anbindung** (Weiterleitung an externes SIEM) → späterer ADR.
- **Alerting** (Echtzeit-Benachrichtigung auf Audit-Muster) → Betriebs-/Monitoring-ADR;
  v1 liefert die **Datengrundlage**, nicht die Alarmierung.
- **Flächendeckende Emitter-Verdrahtung** aller Fach-Services → verteilt auf die
  jeweiligen Folge-ADRs (5.1).

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 Emitter-Integration: Decorator-Stub jetzt vs. eigenes späteres ADR

- **A — Envelope + Schreib-Service + Decorator-Contract jetzt (ADR-0003), per-Service-Verdrahtung in den jeweiligen Folge-ADRs.**
  *Pro:* jeder künftige state-ändernde Service (Stammdaten nach ADR-0002, Export in
  ADR-0007, Consent-ADR) kann **ab Tag 1 audit-fähig** entstehen; spiegelt das
  bewährte „**audit-ready**"-Muster aus ADR-0004 §6/§13.2; ADR-0003 bleibt schlank
  und blockiert nicht auf noch nicht existierende Services. *Contra:* der Decorator
  ist in v1 überwiegend **Stub/Contract** mit wenigen realen Emittenten (M5 greift
  erst mit den Folge-Services voll).
- **B — Eigenes späteres „Emitter-Integrations-ADR", ADR-0003 nur Schema+Service.**
  *Pro:* klare Trennung Infrastruktur vs. Verdrahtung. *Contra:* riskiert, dass
  Folge-Services **ohne** Emit gebaut werden und die Nachrüstung teuer wird; der
  Decorator-Contract ist ohnehin trivial genug, um jetzt fixiert zu werden.
- **C — Alles jetzt flächendeckend verdrahten.** *Contra:* die meisten Fach-Services
  existieren noch nicht (Stammdaten-CRUD ist bewusst **nach** ADR-0002, ADR-0004 §17)
  — nicht umsetzbar.
- **Empfehlung: A.** Leichtgewichtig, hält den Gate-Baustein schlank und macht
  Folge-ADRs sofort audit-fähig, ohne auf sie zu warten.

### 5.2 Integritätsmechanismus — **entschieden: Hash-Kette je Partition (F1)**

Produktseitig zählt, dass die Integritätsprüfung **mechanisch möglich und monatlich
grün** ist (M2, Phase-7-Gate). Der **Ambitionsgrad** ist mit F1 entschieden; das
**Detail-Design** bleibt `technical-director`-/`audit-trail-engineer`-Sache (Phase 2).

- **Gewählt: A — Hash-Kette je Partition.** Jedes Event trägt den Hash des Vorgängers
  (Verkettung über Zeit + Vorgänger-Hash je Partition) → Manipulation **und Lücke**
  werden mechanisch erkennbar, **auch gegen privilegierten Eingriff**. Der
  Schreibpfad-Overhead (Serialisierung je Kette) ist **weit unkritischer** als beim
  Messwert-Hypertable — Audit-Volumen = pro Vorgang, **Größenordnungen kleiner** als
  die 50k Messwerte/s aus ADR-0004 §14; „je Partition/Chunk" statt global mildert die
  Kopplung zusätzlich. Berührt M4-Budget (Phase-2-Benchmark). Der monatliche Abgleich
  läuft **gegen das Export-Manifest** des Cold-Archivs (5.3), damit die Kette auch über
  archivierte Chunks hinweg lückenlos bleibt.
- **Verworfen: B — nur `REVOKE` + Backup-/Checksum-Abgleich.** Erkennt Manipulation
  nur gegen einen externen Referenzstand, nicht intrinsisch je Zeile — schwächer
  gegen privilegierten Eingriff; für einen der beiden harten PII-Ingest-Gate-Bausteine
  nicht ausreichend.
- **Phase-2-Detail** (`technical-director`): Hash-/Verkettungs-Algorithmus,
  Kettenkopf je Chunk, Manifest-Format, Overhead-Budget (M4).

### 5.3 Retention des Audit-Logs — **entschieden als Arbeitshypothese (F2)**

**Gewählt: Definierter Retention-Horizont + archivierter Cold-Export vor Löschung**
(analog ADR-0004 §14). Der Horizont ist als **Arbeitshypothese** gesetzt:
**Projektlaufzeit + 5 Jahre nach Schlussverwendungsnachweis**, mit zwei bindenden
Nebenbedingungen:

1. **Verifikationsauftrag (offener Input):** Die 5-Jahre-Frist ist gegen den
   **Zuwendungsbescheid / ANBest** zu verifizieren (analog zur Fassungs-Klärung der
   Merkblätter, `merkblatt-anforderungen.md`) — bis zur Bestätigung bleibt sie
   Hypothese.
2. **Nie kürzer als die Retention der überwachten Daten** — das Audit-Log darf nicht
   vor den Daten verfallen, deren Zugriffe es belegt (Kopplung an ADR-0004-Retention,
   offener Punkt O2).

**Umsetzungspfad (kontrollierter `drop_chunks()`-Sonderpfad, verbindlich):** Cold-Export
→ WORM/S3, DE-Only → Row-Count-/Checksum-Konsistenz-Gate → **manuelles** `drop_chunks()`.
Der **subtile Konflikt** mit der Unveränderlichkeit (`REVOKE UPDATE, DELETE` sperrt
**DML**, aber `drop_chunks()` als DDL ist privilegiert und wäre sonst ein
Retention-**Umgehungspfad**) wird durch folgende Härtung entschärft (verbindlich, aus
dem Compliance-Ergebnis):

- **separate privilegierte Betriebsrolle** für `drop_chunks()`; die **App-Rolle bleibt
  strikt `INSERT`+`SELECT`**;
- **Vier-Augen-Prinzip + `compliance-director`-Freigabe je Lauf**;
- **verifizierter Cold-Export VOR** der Löschung, Nachweis in `compliance/audit-reports/`;
- der **Löschlauf selbst ist ein Pflicht-Audit-Event**;
- die **Monats-Integritätsprüfung gleicht gegen das Export-Manifest ab** — die
  Hash-Kette bleibt über archivierte Chunks hinweg lückenlos verifizierbar.

**Art. 17 (Betroffenen-Löschung) berührt das Audit-Log NICHT durch Editieren/Löschen:**
Die Subjekt-Löschung wirkt über **Krypto-Shredding / Pseudonym-Neutralisierung in
ADR-0004** (§15/§16) — die im Audit-Log gespeicherten Pseudonym-Refs werden dadurch
**faktisch anonym**, während die Audit-Zeilen **nie editiert oder gelöscht** werden.
Die Append-only-Garantie bleibt unangetastet (rote Linie 4).

**Offener Input (F2):** finale Bestätigung des 5-Jahre-Horizonts durch
`compliance-director` gegen Zuwendungsbescheid/ANBest; `retention-matrix`-Eintrag in
Phase 3.

---

## 6. Sequenzierung & Abhängigkeiten

- **ADR-0003 ist Gate-Baustein für ADR-0004** (`roadmap.md` rev. 5;
  ADR-0004 §6/§7.1 Bedingung 2): der **produktive PII-/Verbrauchs-Ingest** öffnet
  erst, wenn u. a. **ADR-0002 (Auth) + ADR-0003 (Audit-Log)** stehen. ADR-0003
  **selbst braucht den ADR-0004-Prod-Datenpfad NICHT** — es kann **jetzt** gebaut
  werden (Schema `audit` reserviert, Extensions in V0001).
- **Kopplung an ADR-0002 (Auth):** die Akteur-Principal-ID ist der Keycloak-`sub`.
  ADR-0003 modelliert ihn als **opake ID** (kein Hart-FK auf eine noch nicht
  existierende User-Tabelle) — dieselbe Entkopplung wie ADR-0004 §6. Die **scharfe
  AuthZ-Durchsetzung** der Audit-Lese-/Prüf-Zugriffe kommt mit ADR-0002.
- **Reihenfolge-Realität:** ADR-0004 wurde per User-Entscheidung vor 0002/0003
  entworfen; ADR-0003 füllt nun den Gate-Baustein und ist **audit-ready-Empfänger**
  für alle Folge-ADRs (Consent, Stammdaten, ADR-0007-Export).

---

## 7. Compliance-Einfluss / Phase-1-Risiko-Flag

### 7.1 Risiko-Einordnung — **MITTEL (durch `compliance-director` bestätigt, ohne Veto)**

**Einstufung: MITTEL** (deutlich unter ADR-0004 „HOCH", aber **nicht** „niedrig/keine")
— **Phase 1 durch `compliance-director` ohne Veto bestätigt (2026-07-09).**

*Begründung:* Das Audit-Log ist einerseits **selbst eine TOM nach Art. 32** (Logging
als Sicherheitsmaßnahme) und der Nachweis für **Art. 5(2) Rechenschaft** — insofern
**risikomindernd**. Andererseits **führt es eine eigene personenbeziehbare Verarbeitung
ein**: es referenziert **Akteure** (Keycloak-`sub`) und, über Pseudonyme, **Betroffene**
(deren Vorgänge protokolliert werden). Auch ohne PII-Klartext ist das Log damit
**personenbeziehbar** (pseudonym i. S. v. ErwGr. 26), **zweckgebunden** auf
Sicherheit/Nachweis.

**Phase-1-Gate „Compliance-Risiko grob benannt": erfüllt — Einstufung MITTEL,
`compliance-director` ohne Veto.**

### 7.2 Risiko-Schärfung: Beschäftigtendatenschutz (Art. 88 DSGVO / § 26 BDSG)

Die protokollierten **Akteure sind regelmäßig Beschäftigte** (Betriebs-Team,
Administratoren, Auditoren). Ein Log ihrer Handlungen ist damit
**beschäftigtendatenschutzrechtlich relevant** (**Art. 88 DSGVO i. V. m. § 26 BDSG**).
Verbindlich für Phase 2/3:

- **Zweckbindung explizit und eng:** Das Audit-Log dient **ausschließlich
  Sicherheit und Rechenschaft** (Art. 32/Art. 5(2)), **NICHT der Leistungs- oder
  Verhaltenskontrolle** von Beschäftigten. Diese Zweckbindung ist in RVT/TOMs
  festzuhalten und darf technisch nicht unterlaufen werden (kein Reporting/Profiling
  über Beschäftigten-Aktivität).
- **Mitbestimmungs-Hinweis:** Ein Beschäftigten-Aktivitätslog kann der
  **Mitbestimmung** (Betriebs-/Personalrat) unterliegen — organisatorisch zu prüfen;
  Hinweis an `compliance-director` (kein Produkt-/Technik-Thema, aber
  entscheidungsrelevant vor Produktivbetrieb).

### 7.3 Fünf rote Linien für Phase 2 (verbindliche Design-Constraints)

Wörtlich als Constraints für den Phase-2-Schema-/Service-Entwurf
(`technical-director` / `audit-trail-engineer` / `security-lead` / `database-lead`):

1. **Kein PII-Klartext — strukturell.** Nur **opake Principal-IDs** (Keycloak-`sub`)
   und **Pseudonym-Refs**; **kontrolliertes, strukturiertes Vokabular** statt
   Freitext-Details; **`pii-scan` + Schema-Inspektion in der CI** (M3).
2. **Auflösung nur über getrennte Systeme.** **KEIN FK** von `audit` nach `identity`
   oder auf User-Tabellen; Re-Identifikation (Principal-ID → Person, Pseudonym →
   Betroffener) nur als **autorisierter, selbst wieder auditierter Vorgang**.
3. **Unveränderlichkeit atomar.** **`REVOKE UPDATE, DELETE`** in **derselben
   Migration**, die die Tabellen anlegt; App-Rolle **nur `INSERT`+`SELECT`**;
   **M1-CI-Test greift ab der Migration**.
4. **Retention nur über den kontrollierten Sonderpfad** (5.3): Vier-Augen +
   `compliance`-Freigabe + verifizierter Cold-Export vor `drop_chunks()`; **Art. 17
   via Krypto-Shredding** (ADR-0004), **Append-only unangetastet**.
5. **Zeitstempel DB-seitig** (UTC, **nie emitter-geliefert**), **NTP als Voraussetzung**;
   Integritätsprüfung **deterministisch + monatlich** als **Phase-7-Gate** (A.8.17
   Clock synchronization).

### 7.4 Phase-3-Vorschau (`compliance-director`, dünn)

Erwartete Phase-3-Deliverables (durch `compliance-director` / `dsgvo-auditor` /
`iso27001-auditor`, **vor** Implementation; **ich schreibe nicht in `compliance/**`**):

- **DSFA:** **kein eigenständiger DSFA** — **Nachtrag zu DSFA-0001** (das Log ist
  begleitende Sicherheits-/Nachweismaßnahme zur bereits bewerteten
  Messdaten-Verarbeitung).
- **RVT (Art. 30, DS-06):** **schlankes VT-0002** in `compliance/dsgvo/rvt.md`
  (Akteurskategorie **Beschäftigte**, Zweck Sicherheit/Rechenschaft).
- **TOMs:** eigener **Abschnitt „Logging"** in `compliance/dsgvo/toms.md`.
- **Betroffenenrechte:** Ergänzung in `compliance/dsgvo/betroffenenrechte.md`
  (Art. 15 Auskunft; **Grenzen von Art. 17(3)(b)** — Aufbewahrung zur Erfüllung
  rechtlicher Pflichten/Rechenschaft schlägt Löschung im Log).
- **Retention-Matrix:** Eintrag der **5-Jahre-Arbeitshypothese** in
  `compliance/dsgvo/retention-matrix.md` (mit Verifikationsvorbehalt, F2).
- **SoA:** **A.8.15 belegen**; **A.5.28** (Collection of evidence), **A.8.16**
  (Monitoring activities), **A.8.17** (Clock synchronization) **ergänzen**; **A.5.33**
  (Protection of records) **erweitern**.
- **Audit-Programm:** **Monats-Integritätsprüfung** + **Vier-Augen-Retention-Lauf** in
  `compliance/iso27001/audit-programm.md` aufnehmen.
- **Risiko-Register:** **voraussichtlich kein neuer Voll-Eintrag** (Risiko über die
  fünf roten Linien + bestehende R-0003/R-0004 abgedeckt).

---

## 8. Fragen-Status nach Phase 1

### 8.1 Entschieden (User + `compliance-director`, 2026-07-09)

- **F1 — Integritäts-Ambition: Hash-Kette je Partition** (Manipulations-/Lücken-Evidenz
  auch gegen privilegierten Zugriff; Detail-Design Phase 2 — Verkettung Zeit +
  Vorgänger-Hash je Partition, Abgleich gegen Export-Manifest). Siehe 5.2.
- **F2 — Retention: Projektlaufzeit + 5 Jahre** nach Schlussverwendungsnachweis **als
  Arbeitshypothese** — mit Verifikationsauftrag gegen Zuwendungsbescheid/ANBest und
  Nebenbedingung „nie kürzer als die Retention der überwachten Daten" (O2). Siehe 5.3.
- **V1 — Emitter-Integration: Muster A** (Envelope + Service + Decorator-Contract jetzt;
  per-Service-Verdrahtung in Folge-ADRs), 5.1.
- **V2 — v1-Scope bestätigt:** `audit`-Schema + Event-Hypertable + `REVOKE`-Härtung +
  Envelope + Schreib-Service + Decorator-Stub + Hash-Kette + kontrollierter
  Retention-Sonderpfad + minimale Prüf-Funktion; **ohne** UI/Reports/SIEM/Alerting (4.2).
- **V3 — Risiko-Flag: MITTEL**, `compliance-director` ohne Veto (§7.1), mit
  Beschäftigtendatenschutz-Schärfung (§7.2).

### 8.2 Weiterhin offen — mit Klärungsauftrag (blockiert Impl., nicht Phase 2)

- **Retention-Frist-Verifikation (aus F2):** 5-Jahre-Horizont gegen
  **Zuwendungsbescheid/ANBest** bestätigen lassen (offener Input, analog
  Fassungs-Klärung der Merkblätter); bis dahin Arbeitshypothese →
  `retention-matrix`-Eintrag Phase 3 mit Vorbehalt.
- **Mitbestimmung (aus §7.2):** organisatorisch prüfen, ob das Beschäftigten-Aktivitätslog
  der Betriebs-/Personalratsmitbestimmung unterliegt → `compliance-director` vor
  Produktivbetrieb.

---

## 9. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Schließt einen der **zwei harten Gate-Bausteine** für den ADR-0004-Ingest;
  belegt das bisher offene ISO-Control **A.8.15**; macht Rechenschaft (Art. 5(2)/32)
  und BAFA-Nachweis (TB-08) **maschinell prüfbar**.
- Macht Folge-ADRs (Consent, Stammdaten, ADR-0007) **ab Entstehung audit-fähig**.

### Negativ
- Das Retention-Spannungsfeld (Append-only vs. Speicherbegrenzung, 5.3) ist über den
  **kontrollierten `drop_chunks()`-Sonderpfad** (Vier-Augen + `compliance`-Freigabe +
  verifizierter Cold-Export) gelöst — erhöht aber den **Betriebsaufwand** je
  Retention-Lauf; die 5-Jahre-Frist bleibt bis zur Zuwendungsbescheid-Verifikation
  Arbeitshypothese (8.2).
- Die **Hash-Kette je Partition** (F1) fügt dem Schreibpfad Kopplung/Overhead hinzu
  (M4-Budget, Phase-2-Benchmark).

### Neutral
- Setzt den **Envelope- und Decorator-Contract**, an den sich alle state-ändernden
  Folge-Services binden.

---

## 10. Folgeaufgaben

- [x] **User-Freigabe Phase 1** — F1 (Hash-Kette je Partition), F2 (Retention-Hypothese)
      entschieden; V1–V3 bestätigt (Abschnitt 8.1).
- [x] **`compliance-director` (Phase-1-Veto):** **ohne Veto**; Risiko **MITTEL** (§7.1);
      Beschäftigtendatenschutz-Schärfung (§7.2); fünf rote Linien (§7.3);
      Phase-3-Vorschau (§7.4).
- [x] **Roadmap-Fortschreibung** (`production/roadmap.md`, rev. 6): ADR-0003 nach
      „Jetzt: in Arbeit, Phase 2".
- [x] **Übergabe an `technical-director` (Phase 2):** Event-Envelope-Schema,
      Hypertable-/Chunk-Parameter (nur Apache-2), `REVOKE`-Härtung + App-Rollen-Grants,
      **Hash-Ketten-Verkettung + Manifest** (F1), kontrollierter Retention-Sonderpfad
      (5.3), DB-seitige UTC-Zeitstempel, Decorator-Signatur, minimale Prüf-Funktion —
      auf dem reservierten Schema `audit` (ADR-0004 §12), Extensions aus V0001 —
      **unter Beachtung der fünf roten Linien (§7.3)**.
      **Erledigt: Teil B (Abschnitte 11–22) + Schema-Skizze
      `schemas/database/adr-0003-audit-log.md`.**
- [ ] **Lead-Reviews Phase 2 (offen):** `audit-trail-engineer` (Envelope-Schnitt,
      Hash-Ketten-Segmentierung, Anker/Manifest, Verifikations-Funktion) +
      `security-lead` (Rollen-/`REVOKE`-Modell, `SECURITY DEFINER`-Trigger, Krypto-Wahl
      SHA-256, Threat-Model gegen privilegierten Zugriff). Offene Punkte in §22.
- [ ] **Phase 3 (zwingend vor Impl.):** `compliance-director` + `dsgvo-auditor`
      (VT-0002/TOM-Logging/DSFA-0001-Nachtrag, Betroffenenrechte inkl. Art. 17(3)(b),
      retention-matrix) + `iso27001-auditor` (A.8.15 belegen; A.5.28/A.8.16/A.8.17
      ergänzen; A.5.33 erweitern); Audit-Programm-Ergänzung (Monatsprüfung +
      Vier-Augen-Retention).
- [ ] **Klärungsaufträge (8.2):** Retention-Frist gegen Zuwendungsbescheid/ANBest;
      Mitbestimmungs-Prüfung Beschäftigten-Log.
- [ ] **Neue Event-Typen** künftig über `/add-audit-event` (Schema-Erweiterung des
      kontrollierten Vokabulars), nicht ad hoc.

---

# Teil B — Phase-2-Design (Status: proposed)

> **Reifegrad:** Phase-2-Output (`technical-director`, Design-Owner). Jede
> Entscheidung mit **einer verworfenen Alternative**. Umgesetzt unter Beachtung der
> **fünf roten Linien (§7.3)** — Konformitäts-Matrix in **Anhang F**. Die
> DB-Schema-Skizze (ERD + DDL-/Trigger-/Verifikations-Entwurf) liegt in
> `schemas/database/adr-0003-audit-log.md`. **Keine Migration** in Phase 2. Konsistent
> zu ADR-0004 §12–§16 (Namensraum-Muster, opake Principal-/Pseudonym-Refs ohne
> Hart-FK, Hypertable-Konventionen, UUIDv7 app-seitig, nur Apache-2-Timescale).

## 11. Design-Prinzipien (Ableitung der fünf roten Linien §7.3)

1. **Kein Freitext-Einfallstor (Linie 1):** Envelope trägt ausschließlich
   **kontrolliertes Vokabular** (`event_typ` aus Katalog) und **strukturierten,
   whitelist-geprüften** `kontext` (JSONB, PII-frei); kein freier Text-/Detailfeld.
2. **Auflösung nur über getrennte Systeme (Linie 2):** `actor_sub` (Keycloak-`sub`)
   und `objekt_ref` (Pseudonym/Entity-UUID) sind **opake Werte ohne DB-FK** nach
   `identity`/`energy`/User-Tabellen — exakt die Entkopplung aus ADR-0004 §13/§6.
3. **Unveränderlichkeit atomar + evident (Linie 3):** `REVOKE UPDATE, DELETE` in
   **derselben Migration** wie die Tabellen; App-Rolle **nur `INSERT`+`SELECT`**;
   **darüber hinaus** Hash-Kette + extern publizierter Tages-Anker → Manipulation
   auch durch **privilegierte** Rollen wird *evident* (REVOKE bindet den Owner nicht,
   die Kette schon — s. §15.4).
4. **Retention nur über den Sonderpfad (Linie 4):** `drop_chunks()` durch **separate
   Betriebsrolle**, Vier-Augen + `compliance`-Freigabe, verifizierter Cold-Export vor
   Löschung; Append-only unangetastet (§19).
5. **Zeit DB-seitig + deterministisch prüfbar (Linie 5):** `ts` wird vom
   **BEFORE-INSERT-Trigger** gesetzt (`clock_timestamp()`, UTC), **nie**
   emitter-geliefert; Verifikation ist deterministisch + monatlich (§18).

## 12. Namensraum & Objekt-Übersicht

**Entscheidung:** Ein eigenes Schema **`audit`** (in ADR-0004 §12 bereits reserviert),
mit einer klaren Trennung zwischen dem **append-only Ereignis-Kern** und **begleitenden
Steuer-/Integritäts-Objekten**:

| Objekt (`audit`) | Art | Zweck | Append-only / `REVOKE`? |
|---|---|---|---|
| `audit.event` | **Hypertable** | Ereignis-Envelope (Zeitreihe) | **Ja** — `REVOKE UPDATE, DELETE` (Linie 3, M1) |
| `audit.tages_anker` | Tabelle | Versiegelter Tages-Anker + Anker-Kette (§14.5) | **Ja** — nach Versiegelung immutable |
| `audit.event_typ` | **Katalog-Tabelle** | Kontrolliertes Vokabular + Kontext-Whitelist + Metadaten | **Nein** (governte Config, nur Betriebsrolle schreibt; App nur `SELECT`) |
| `audit.ketten_kopf` | Arbeitstabelle | Laufender Ketten-Kopf je `(lane, tag_utc)` (Insert-Optimierung) | **Nein** (rekonstruierbar aus `event`; kein Integritätsanker — §14.3) |

**Warum Katalog und Kopf NICHT unter `REVOKE`:** Die Immutabilitäts-Regel
(`.claude/rules/database-migrations.md`) zielt auf das **Ereignis-Protokoll**. Der
Katalog ist **governte Konfiguration** (Änderung nur über `/add-audit-event` durch die
Betriebsrolle), der Ketten-Kopf ist eine **aus `event` rekonstruierbare** O(1)-Optimierung
und **kein Vertrauensanker** (die Verifikation rechnet unabhängig aus den Ereigniszeilen
nach, §18). Diese Scoping-Entscheidung ist bewusst und in der Migration zu dokumentieren.

**Verworfene Alternative:** **Alles (inkl. Katalog/Kopf) unter `REVOKE UPDATE, DELETE`.**
*Contra:* der Katalog wäre nicht mehr per `/add-audit-event` pflegbar (jede neue
Ereignisart bräuchte eine Tabellen-Neuanlage), und der Ketten-Kopf könnte nicht als
mutierbarer Zähler dienen — die Immutabilität würde formal auf Objekte ausgedehnt, die
**kein** Beweismittel sind, und der praktische Betrieb bräche.

## 13. Event-Envelope-Schema

### 13.1 Spaltenschnitt (wer / wann / was / worauf / Ergebnis)

| Spalte | Typ | Herkunft | Bemerkung |
|---|---|---|---|
| `ts` | `timestamptz` | **Trigger** (`clock_timestamp()`) | UTC, Zeit-Dimension; **nie** emitter-geliefert (Linie 5) |
| `tag_utc` | `date` | **Trigger** (`(ts AT TIME ZONE 'UTC')::date`) | Segment-Tag der Hash-Kette (§14) |
| `event_id` | `uuid` | App (**UUIDv7**) | stabile Ereignis-ID für Punkt-Lookups; **im Hash-Kanon** (Anhang D) — sonst einziges Feld außerhalb des Ankers; **kein** Unique/PK (§16) |
| `lane` | `smallint` | App (**Hash über `korrelations_id`**, §14.2) | Ketten-Lane; **eine Tx = eine Lane = ein Lock** |
| `seq` | `bigint` | **Trigger** (nach Kopf-Lock) | lückenlose Sequenz je `(lane, tag_utc)` |
| `format_version` | `smallint` | App/Default `1` | Kanonisierungs-/Envelope-Version (Krypto-Agilität, in Hash-Input) |
| `event_typ` | `text` | App | **Katalog-Code** `domäne.objekt.verb`; Trigger-validiert gegen `audit.event_typ` |
| `objekt_typ` | `text` | **Trigger** (aus Katalog) | Diskriminator für `objekt_ref` |
| `objekt_ref` | `uuid` NULL | App | Pseudonym (`energy.*.id`) / Entity-UUID; **kein FK** (Linie 2); *personenbeziehbar* |
| `actor_sub` | `text` NULL | App (Sicherheitskontext) | opake Principal-ID (Keycloak-`sub`); **kein FK** (Linie 2); *personenbeziehbar* |
| `actor_typ` | `text` | App | `benutzer` \| `dienstkonto` \| `system` |
| `actor_rolle` | `text` NULL | App | **nur** wenn Katalog `rolle_erfassen=true` (Datensparsamkeit, §13.4); *personenbeziehbar* |
| `ergebnis` | `text` | App | `CHECK IN ('ok','denied','error')` |
| `kontext` | `jsonb` | App | strukturiert, **Whitelist-Keys je `event_typ`** (§13.3), PII-frei |
| `korrelations_id` | `uuid` NULL | App | Request-/Transaktions-Tracing |
| `prev_hash` | `bytea` | **Trigger** | Vorgänger-Hash der Ketten-Lane |
| `zeilen_hash` | `bytea` | **Trigger** | `sha256(kanonisch(zeile) ‖ prev_hash)` |

**`event_id uuid` (UUIDv7, app-seitig) — aber kein UUID-*Primärschlüssel*** (dokumentierte
Abweichung von der PK-Rule, analog `measurement.messwert` ADR-0004 §14). **O-B entschieden
(`audit-trail-engineer`): `event_id` JA und in den Hash-Kanon (Anhang D)** — sonst wäre sie
das **einzige** Feld außerhalb des Vertrauensankers und damit unbemerkt manipulierbar.
Timescale verlangt die Partitionsspalte in jedem Unique-Index, daher `event_id` **nur als
einfacher Btree** für Punkt-Lookups (**nicht** unique/PK, §16). Der natürliche
Ketten-Schlüssel bleibt `(lane, tag_utc, seq)`.

**„aktion" ist keine eigene Spalte (Entscheidung):** Die fachliche Aktion ist die
**Verb-Komponente** des namespaced `event_typ` und liegt als Katalog-Metadatum
`aktion_kategorie` vor. **Verworfene Alternative:** eine **zweite, frei am Insert
gesetzte `aktion`-Spalte.** *Contra:* zwei kontrollierte Felder driften auseinander
(`event_typ='consent.widerrufen'` mit `aktion='erstellen'`) — ein zweites
Vokabular ohne Zusatznutzen; die Verb-Information ist bereits im Katalog eindeutig.

### 13.2 Kontrolliertes Vokabular — **Katalog-Tabelle** statt CHECK/Enum

**Entscheidung:** `event_typ` referenziert einen **Katalog** `audit.event_typ`
(`code` PK, `objekt_typ`, `aktion_kategorie`, `erlaubte_kontext_keys text[]`,
`rolle_erfassen bool`, `pflichtereignis bool`, `aktiv bool`, `beschreibung`). Die
Gültigkeit wird **im Seal-Trigger** geprüft (Existenz + `aktiv`), der Trigger setzt
`objekt_typ` **aus** dem Katalog (autoritativ). Neue Typen kommen ausschließlich über
`/add-audit-event` (Katalog-`INSERT` + Migration) hinzu.

- *Warum Trigger-geprüft statt Hart-FK:* Der Seal-Trigger läuft **ohnehin** bei jedem
  Insert (§14.4) und ist die eine, nicht umgehbare Durchsetzungsstelle; damit liegen
  Vokabular-Prüfung, Kontext-Whitelist und Hash-Siegel an **einem** Ort und der
  Hypertable-FK-Sonderfall entfällt. *(Ein declarativer FK bleibt als Härtung möglich —
  Reviewer-Frage O-A in §22, `database-lead`/`security-lead`.)*
- *Warum Katalog statt CHECK/Enum:* Ein CHECK-`IN(...)`-Literal bzw. ein `CREATE TYPE …
  ENUM` ist **statisch** (jede neue Ereignisart = `ALTER`/`ADD VALUE`, kein Rückbau) und
  kann **keine Metadaten** tragen — vor allem **nicht die Kontext-Key-Whitelist**, die
  Linie 1 („kein Freitext-Einfallstor") trägt.

**Verworfene Alternative:** **Statische CHECK-Liste / natives `ENUM`.** *Contra:* keine
per-Typ-Metadaten (Whitelist, `pflichtereignis` für M5, `rolle_erfassen`), Erweiterung
nur per Schema-Migration, `ENUM`-Werte nicht entfernbar — passt nicht zum
`/add-audit-event`-Governance-Muster.

**Einarbeitung Lead-Review (O-A: FK *zusätzlich*, `security-lead`):** Es wird **doch ein
declarativer FK** `audit.event.event_typ REFERENCES audit.event_typ(code)` gesetzt —
**`ON UPDATE NO ACTION ON DELETE NO ACTION`** (einmal benutzte Codes sind
**unlösch-/unumbenennbar**). **`ON UPDATE CASCADE` ist explizit verboten:** ein
kaskadierendes Code-Update liefe mit **Owner-Rechten**, änderte historische `event`-Zeilen
und würde die **Hash-Kette flächig invalidieren**. Der **Trigger bleibt** für
Aktiv-Prüfung + Kontext-Whitelist (der FK garantiert nur Existenz/Immutabilität des Codes).

**Einarbeitung Lead-Review (Katalog-Versionierung, `audit-trail-engineer`-Finding 3):**
Der Katalog wird **append-only versioniert** statt update-in-place: `code` bleibt
**immutabler PK/FK-Ziel** im schlanken Header `audit.event_typ`; die mutablen Attribute
(`objekt_typ`, `aktion_kategorie`, `erlaubte_kontext_keys`, `rolle_erfassen`,
`pflichtereignis`, `aktiv`, `beschreibung`) wandern in `audit.event_typ_version`
(`gueltig_ab`/`gueltig_bis`, append-only). Der Seal-Trigger liest die **zum `ts` gültige**
Version. **Jede Katalog-Änderung ist selbst ein Pflicht-Audit-Event** — so ist die
Vokabular-Historie rekonstruierbar und ein „stiller" Whitelist-Umbau nachweisbar.

### 13.3 PII-Freiheit des `kontext` (Linie 1)

**Entscheidung:** `kontext jsonb NOT NULL DEFAULT '{}'` mit **dreifacher** Absicherung:

1. **Key-Whitelist je `event_typ`** (`event_typ.erlaubte_kontext_keys`) — der
   Seal-Trigger weist jede Zeile ab, deren `kontext`-Keys **nicht** Teilmenge der
   Whitelist sind, und lehnt **verschachtelte/überlange** Werte ab (nur Skalare,
   Größen-Cap). Defense-in-depth **zusätzlich** zur Service-Validierung (§17).
2. **Schreib-Service** (§17) validiert Envelope + Kontext **vor** der DB (DTO,
   `class-validator`, Whitelist).
3. **CI:** `pii-scan`-Hook + Schema-Inspektion über `audit.event` (M3) — 0 Findings.

So bleibt der `kontext` strukturiert und PII-frei, **ohne** ein freies Detailfeld zu
öffnen. **Verworfene Alternative:** **frei geformtes `jsonb` nur per Konvention**
(kein Whitelist-Zwang). *Contra:* genau das von Linie 1 verbotene Freitext-Einfallstor —
ein einziger falsch befüllter Kontext leakt Klartext-PII ins unveränderliche Log.

### 13.4 `actor_rolle` — selektiv (Beschäftigtendatenschutz, §7.2)

**Entscheidung:** `actor_rolle` wird **nur** erfasst, wenn der Katalog-Eintrag
`rolle_erfassen=true` setzt (z. B. autorisierungskritische Ereignisse wie
BAFA-Export-Freigabe, wo „in welcher Rolle" materieller Teil des Nachweises ist). Für
alle anderen Ereignisse bleibt sie `NULL`. Das dient der **Datensparsamkeit**
(Art. 5(1)(c)) und der engen **Zweckbindung** aus §7.2 (kein Beschäftigten-Profiling).

**Verworfene Alternative:** **`actor_rolle` bei jedem Ereignis erfassen.** *Contra:*
vergrößert den Beschäftigtendaten-Fußabdruck unnötig (Art. 88/§26) — die Rolle-zum-
Zeitpunkt ist nur für wenige Ereignistypen nachweisrelevant. *(Der Gegenpol „nie
erfassen" verlöre den Nachweis „in welcher Rolle" für genau diese kritischen Fälle.)*

## 14. Hash-Ketten-Design (F1)

### 14.1 Verkettungs-Einheit — Segment `(lane, tag_utc)`

**Entscheidung:** Die Kette ist **nicht global** und **nicht am physischen Chunk**
aufgehängt, sondern an einem logischen **Segment `(lane, tag_utc)`**:
- `tag_utc` = UTC-Kalendertag → natürliche **Tages-Anker-Granularität** (§14.5) und
  passt in die monatlichen Chunks (§16) sowie in den Retention-/Export-Takt (§19).
- `lane` = kleine, feste Zahl paralleler Ketten (Vorschlag **N = 16**, `smallint`),
  die die **Serialisierung entkoppelt** (§14.2).

**Verworfene Alternative:** **Eine globale Kette über die ganze Tabelle** (bzw. je
physischem Chunk). *Contra:* global erzwingt **totale Serialisierung** aller Inserts auf
einen Ketten-Kopf (ein Hot-Lock, Deadlock-Gefahr in Fachtransaktionen); „je Chunk" hängt
die Integrität an ein **Implementierungsdetail** (Chunk-Intervall) statt an ein stabiles
fachliches Segment. F1 spricht explizit von „je Partition" — das Segment `(lane, tag_utc)`
setzt das kontrolliert und durchsatzschonend um.

### 14.2 Durchsatz-/Parallelitäts-Lösung (Konsequenz der Serialisierung)

Eine Hash-Kette erzwingt Ordnung: Zeile *i* braucht `zeilen_hash` von *i−1*. Bei
**globaler** Kette heißt das *ein* Lock für **alle** Schreiber → Durchsatz-Decke +
Lock-Wait/Deadlock, gerade weil der Audit-Insert (Entscheidung §17) **in der
Fachtransaktion** läuft. **Lösung:** N Lanes → die Serialisierung beschränkt sich auf
**denselben `(lane, tag_utc)`**; N unabhängige Ketten geben ~N-fache Nebenläufigkeit. Der
Tages-Anker (§14.5) bindet **alle** Lanes, sodass die Segmentierung die Integrität
**nicht** schwächt (das Löschen einer ganzen Lane bricht den Anker). N ist bewusst
moderat (Audit-Volumen ist klein, aber **bursty** — Massen-Operationen, parallele
Requests).

**Lane-Zuweisung = Hash über `korrelations_id` mod N (O-C, `audit-trail-engineer`) —
nicht Round-Robin, nicht connection-gebunden:** Round-Robin verteilte die Ereignisse
**einer** Transaktion auf **mehrere** Segment-Locks → Lock-Ordering-**Deadlock**;
Connection-Bindung bräche unter **PgBouncer-Transaction-Pooling**. Mit dem
Korrelations-Hash gilt **eine Tx = eine Lane = ein Lock** (alle Events eines
Requests/einer Tx landen im selben Segment, in `seq`-Reihenfolge). Der Schreib-Service
(§17.1) stellt sicher, dass **jede** auditierte Tx eine `korrelations_id` trägt (sonst
tx-lokal erzeugt). **N = 16** als Startwert; der **M4-Benchmark** (Phase 4) vergleicht
Round-Robin vs. Korrelations-Hash im **Burst-Fall** (eine Tx mit 50–100 Events) **und** im
**Skew-Fall** (Batch-Job flutet eine Lane) gegen die **p95 unbeteiligter** Transaktionen.

### 14.3 Ketten-Kopf & Ordnung

Pro Segment führt `audit.ketten_kopf(lane, tag_utc)` den laufenden Kopf
(`letzter_seq`, `letzter_hash`, `anzahl`). Der Seal-Trigger nimmt ein
`SELECT … FOR UPDATE` auf die Kopf-Zeile (Serialisierungspunkt genau eines Segments),
vergibt `seq := letzter_seq + 1`, setzt `prev_hash := letzter_hash` und aktualisiert den
Kopf. Der Kopf ist **reine Optimierung** — die Wahrheit sind die Ereigniszeilen; die
Verifikation (§18) rechnet **unabhängig** aus `audit.event` nach und **vertraut dem Kopf
nicht**. Genesis einer neuen `(lane, tag_utc)`-Kette: `prev_hash :=
sha256('AUDIT-GEN-v'||format_version||'|'||lane||'|'||tag_utc)` (deterministisch).

### 14.4 Hash-Inhalt & **Ort der Berechnung** (Trigger vs. Service)

**Entscheidung:** Berechnung im **DB-`BEFORE INSERT`-Trigger** (`SECURITY DEFINER`,
Owner der `audit`-Objekte), Hash = **Postgres-Core `sha256(bytea)`** (ab PG11
eingebaut → **kein pgcrypto**, konsistent mit V0001-Verzicht, keine neue Dependency).
Kanonisierung = **längenpräfigierte** Verkettung aller integritätsrelevanten Felder
(§ Anhang D) in fester Reihenfolge, NULL distinkt kodiert, `kontext` als deterministisches
`jsonb`-Textrendering, `ts` als **Epoch-Mikrosekunden** (verbindlich; **nicht** ISO-Text —
portabler für unabhängige Nachrechnung, kein Format-Drift, O-D) — dann `‖ prev_hash`.
**`format_version` und `event_id` gehen in den Hash ein** (O-B: `event_id` läge sonst
außerhalb des Ankers; die Verifikation wählt via `format_version` die Kanonisierung).

Der Trigger erledigt: (a) `event_typ`-Version + Kontext-Whitelist + **Werte-Cap** (nur
Skalare, `octet_length`-Grenze; O-H) validieren (§13.2/§13.3), (b) **Segment-Kopf sperren
(`SELECT … FOR UPDATE`), DANN** `ts := clock_timestamp()` + `tag_utc` setzen (Linie 5),
(c) Kette fortschreiben + `zeilen_hash` siegeln. **Reihenfolge-Fix (O-D/Finding 2,
`audit-trail-engineer`):** `ts` wird **nach** dem `FOR UPDATE` gesetzt — sonst könnte ein
Lock-Verlierer einen **früheren `ts`** mit **späterer `seq`** erhalten
(Monotonie-Verletzung innerhalb der Lane). **`lock_timeout`/`statement_timeout`** auf dem
`FOR UPDATE` sind zu setzen (STRIDE, `security-lead`): alarmierbarer Fehler statt
unkontrolliertem App-Hängen.

*Trade-off:* **Trigger = näher an der DB-Wahrheit** — er feuert auf **jedem**
Insert-Pfad (auch bei einem direkten `INSERT` der Betriebsrolle), hat transaktional
konsistenten Kopf-Zugriff (`FOR UPDATE`) und legt die Vertrauenswurzel **zur Datenlage**
statt in mutierbaren App-Code. Der „Service ist testbarer"-Vorteil entfällt praktisch:
`tests.md` schreibt ohnehin Integrationstests gegen Testcontainer-PG+Timescale vor, gegen
die der Trigger deterministisch getestet wird.

**Verworfene Alternative:** **Hash im NestJS-Schreib-Service.** *Contra:* **umgehbar** —
ein direkter `INSERT` (versehentlich oder durch die privilegierte Betriebsrolle beim
Retention-Lauf) würde die Kette brechen/fälschen, weil der Service nicht im Pfad ist;
Kopf-Race bräuchte App-seitiges Locking; die Integritäts-Wurzel läge in mutierbarem Code
neben den Daten.

### 14.5 Tages-Anker & Publikation (Root of Trust)

Nach Perioden-Abschluss (kleine Gnadenfrist, s. u. O-G) versiegelt ein Job (`pg_cron` oder
extern) die Periode: `audit.anker(stufe, periode_start)` mit
`anker_hash := sha256(kanonisch(stufe, periode_start, sortiert[(lane, seq, anzahl,
head_hash)], anzahl_gesamt) ‖ vorher_anker_hash)`. Die **Anker bilden je Stufe eine Kette**
→ das stille Löschen einer ganzen Periode bricht die Anker-Kette. Der Anker wird **extern
signiert publiziert** (WORM/S3, DE-Only, Eintrag in
`compliance/audit-reports/` — außerhalb meines Schreib-Scopes, nur Konzept). Diese
**externe Publikation** ist der Grund, warum Manipulation **auch gegen privilegierten
Zugriff** evident ist: bereits publizierte Anker kann auch ein Owner/Superuser nicht mehr
umschreiben (§15.4).

**Verworfene Alternative:** **Nur intra-Segment-Ketten ohne Tages-Anker/Publikation.**
*Contra:* ohne externen, unveränderlichen Bezugspunkt könnte ein privilegierter Akteur die
gesamte Kette **konsistent neu rechnen** (Rewrite) — die Kette wäre in sich stimmig, die
Fälschung unentdeckt. Der publizierte Anker schließt genau diese Lücke (F1-Ziel).

**Härtung nach `security-lead`-Review (O-E, Finding HOCH):**
- **(a) Stündliche Zwischen-Anker** zusätzlich zum Tages-Anker (generalisierte
  `audit.anker`-Struktur, `stufe ∈ {stunde, tag}`, je Stufe eigene Anker-Kette) → das
  Manipulationsfenster sinkt von **24 h auf ~1 h**. Das verbleibende Rest-Fenster (jüngste,
  noch nicht publizierte Ereignisse) ist **explizit vom `compliance-director`
  gegenzuzeichnen**, falls keine feinere Kadenz gewählt wird.
- **(b) Anker-Signatur zwingend:** jeder publizierte Anker wird mit einem
  **HMAC-/Signaturschlüssel in Vault/KMS** signiert, den **keine DB-Rolle** kennt — sonst
  kollabiert der Root of Trust auf „wer kontrolliert den S3-Bucket". Die Signatur entsteht
  **außerhalb** der DB (dedizierter Publish-Dienst).
- **(c) Dedizierte Publish-Identität**, **getrennt** von `edms_audit_betrieb`, minimale
  Rechte; WORM/S3 mit **Object-Lock/Compliance-Mode**, Retention ≥ Audit-Horizont (F2).
- **(d) Publikation über schmale `SECURITY DEFINER`-Funktion `audit.markiere_publiziert()`**
  statt Spalten-`UPDATE`; **selbst ein Pflicht-Audit-Event**. Auch **Versiegelungslauf**
  und **Zwischen-/Tages-Anker-Erzeugung** sind Pflicht-Audit-Events (STRIDE).

**KMS/Vault-Abhängigkeit (Betriebs-/User-Input):** der Signaturschlüssel koppelt an den
**noch offenen Hosting-/KMS-Input aus ADR-0004** (dortiges KMS für die PII-Envelope-Krypto,
§15) — als konsolidierter offener Punkt in §23 geführt.

## 15. Rollen- & Rechte-Modell

### 15.1 Rollen (in der Migration angelegt, `NOLOGIN`-Gruppenrollen)

| Rolle | Rechte auf `audit.*` | Zweck |
|---|---|---|
| `edms_audit_owner` | Owner (DDL), Owner der `SECURITY DEFINER`-Funktionen | nur Migrations-/Setup-Zeit, **kein** Runtime-Login |
| `edms_app` | **`INSERT, SELECT` auf `audit.event`**; `SELECT` auf `event_typ(_version)`/`anker`; `EXECUTE` auf `audit.pruefe_kette` | Runtime-Schreibpfad (nur über Trigger gesiegelt) |
| `edms_audit_betrieb` | **nur `EXECUTE`** auf die Wrapper `audit.retention_drop()` / `audit.versiegle()` / Katalog-Pflege (`/add-audit-event`) — **kein** direktes `drop_chunks`/`UPDATE` | privilegierter Betrieb, **nur** unter Vier-Augen + `compliance`-Freigabe |
| `edms_audit_publish` | **dedizierte Publish-Identität** (O-E/c): `EXECUTE` auf `audit.markiere_publiziert()`, Schreibrecht auf WORM/S3-Bucket; **kennt den KMS-Signaturschlüssel** (den keine andere DB-Rolle kennt) | Anker-Export/-Signatur/-Publikation, getrennt von `edms_audit_betrieb` |

`edms_app` hat **weder** `UPDATE`/`DELETE` auf `audit.event` **noch** direkten Zugriff auf
`ketten_kopf` — den Kopf pflegt der `SECURITY DEFINER`-Trigger (Owner). Damit kann der
App-Pfad **ausschließlich** siegeln, nie ändern. **Auch `edms_audit_betrieb` bekommt kein
Zeilen-`UPDATE`/`DELETE`** — Retention läuft nur über den `retention_drop()`-Wrapper (§15.5).

### 15.2 `REVOKE` atomar (Linie 3)

In **derselben Migration**, die `audit.event` (und `tages_anker`) anlegt:
`REVOKE UPDATE, DELETE ON audit.event FROM PUBLIC;` und Grants **nur** `INSERT, SELECT`
für `edms_app`. Der **M1-CI-Test** (verbindet als `edms_app`) belegt ab der Migration:
`INSERT` ok, `UPDATE`/`DELETE` **abgewiesen**.

### 15.3 Verträglichkeit mit Dev-Single-User (`DATABASE_URL=…edms`)

Die drei Rollen werden in der Migration **als Gruppenrollen** erzeugt; der Dev-User
`edms` erhält Mitgliedschaft. In dev verbindet die App als `edms` und **`SET ROLE
edms_app`** (bzw. nutzt eine dedizierte, `edms_app`-mitgliedschaftliche Login-Rolle); in
prod bekommt jede Rolle eigene Credentials. So bleibt der M1-Test aussagekräftig
(Testverbindung als `edms_app`) — die Rollen-Nutzung wird im Migrations-Kopf dokumentiert.

### 15.4 Grenze des `REVOKE` — bewusst durch die Kette geschlossen

`REVOKE` bindet **nicht** den Tabellen-Owner/Superuser (Ownership überschreibt Grants).
Das ist der Grund, warum F1 (Hash-Kette + **extern publizierter** Anker) **kein Add-on,
sondern die eigentliche Absicherung gegen privilegierten Zugriff** ist: Der `REVOKE` deckt
die **App-Ebene** (M1), die Kette + publizierter Anker machen selbst Owner-/Superuser-
Manipulation **evident** (§14.5). Der Owner ist zudem `NOLOGIN`/Setup-only (Separation of
Duties). Dieser Layering-Punkt ist im `security-lead`-Threat-Model bestätigt (§22, O-E/O-F).

### 15.5 Privilegierte Operationen nur über schmale Wrapper (O-F, `security-lead`)

- **`audit.retention_drop(...)` (`SECURITY DEFINER`)** — der **einzige** Pfad zu
  `drop_chunks('audit.event', …)`: prüft die **Vier-Augen-Freigabe** gegen eine
  Kontroll-/Freigabetabelle (Antragsteller ≠ Freigeber, `compliance`-Vermerk), verlangt den
  **verifizierten Cold-Export** (Row-Count/Checksum + Anker-Manifest) und **löst selbst ein
  Pflicht-Audit-Event aus**. `edms_audit_betrieb` erhält **nur `EXECUTE`**, **kein**
  Owner-nahes `drop_chunks`-Recht.
- **`ddl_command_end`-Event-Trigger** auf Objekte des Schemas `audit`: meldet **jede**
  DDL-Änderung extern (`pg_notify` → Listener/SIEM). Kompensation gegen
  **Funktions-Replacement durch den Owner** (ein ausgetauschter Seal-Trigger wäre in der
  Kette selbst unsichtbar — die externe DDL-Meldung macht ihn sichtbar).
- **`search_path`-Pinning** aller `SECURITY DEFINER`-Funktionen (`SET search_path = audit,
  pg_temp`), Owner **≠ Superuser**, minimale `EXECUTE`-Grants (bestätigt).

## 16. Hypertable-Parameter (nur Apache-2)

**Entscheidung:** `create_hypertable('audit.event','ts', chunk_time_interval => INTERVAL
'1 month')`. Audit-Volumen ist **um Größenordnungen kleiner** als die Messwerte (ADR-0004
§14, 7-Tage-Chunks); Monats-Chunks halten die Chunk-Zahl klein und decken sich mit dem
**monatlichen** Integritäts-/Anker-/Retention-Takt (§18/§19). **Verworfene Alternative:**
7-Tage-Chunks wie beim Messwert-Hypertable — *Contra:* unnötige Chunk-Proliferation bei
niedrigem Volumen ohne Query-Nutzen; der Prüf-/Export-Takt ist monatlich.

**Indizes — minimal:**
- `UNIQUE (lane, tag_utc, seq, ts)` — enthält die Partitionsspalte `ts` (Timescale-Pflicht
  für Unique-Index, analog `ux_messwert_kanal_ts`); DB-seitige Garantie „keine
  Duplikat-/Lücken-Sequenz" (Belt zusätzlich zum Trigger) + Ordnungs-Index der Verifikation.
- Default-`ts`-Index des Hypertables (Zeitbereichs-Queries der Auditoren).
- `(objekt_typ, objekt_ref, ts) WHERE objekt_ref IS NOT NULL` — **objekt-zentrische**
  Auditor-Query („Historie dieses Endkunden/Exports", Persona A).
- **Kein** `(actor_sub, …)`-Index in v1 (Entscheidung): hält den Schreibpfad schlank (M4)
  **und** privilegiert technisch **keine** Beschäftigten-Aktivitätsabfrage (§7.2,
  Zweckbindung „kein Profiling"). Incident-Recherche nach Akteur läuft zeitfenster-begrenzt.
  **Verworfene Alternative:** eifrige `(actor_sub, ts)`- und `(korrelations_id)`-Indizes —
  *Contra:* Schreibpfad-Kosten (M4) und, beim Actor-Index, erleichtertes Employee-Profiling.
- **`event_id`-Index:** einfacher Btree `(event_id)` für Punkt-Lookups — **nicht** unique
  (Timescale-Partitionsspalten-Regel; O-B).
- **FK `event_typ → audit.event_typ(code)`** (`ON UPDATE NO ACTION ON DELETE NO ACTION`;
  **`ON UPDATE CASCADE` verboten**, O-A/§13.2) — declarative Härtung **zusätzlich** zur
  Trigger-Validierung.
- **Weiterhin kein FK** von `audit.event` nach `identity`/`energy`/User-Tabellen (Linie 2).

**Auditor-Abfragemuster „Endkunde X" (dokumentiert, `audit-trail-engineer`-Finding 3):**
Der Objekt-Index `(objekt_typ, objekt_ref, ts)` allein reicht **bewusst nicht** für „alle
Vorgänge zu Endkunde X" direkt — es gibt (Linie 2) keinen Namens-/PII-Join. Muster:
**Pseudonym-Enumeration in `identity`** (selbst ein auditierter Vorgang) → Menge der
`objekt_ref`-Pseudonyme → **N Index-Scans** über den Objekt-Index. Das Fan-out ist gewollt
(keine bequeme Personen-Recherche ohne autorisierten, auditierten Re-ID-Schritt).

## 17. Schreib-Service & `@AuditAction`-Decorator (DESIGN, Impl. Phase 4)

### 17.1 Service-API

`AuditService.append(ereignis)` ist der **einzige** App-Schreibpfad auf `audit.event`.
Er validiert den Envelope (DTO, `class-validator`, `whitelist`), erzwingt PII-freien
`kontext` (Whitelist-Keys je `event_typ`, nur Skalare, Größen-Cap), leitet `actor_*` aus
dem **Sicherheitskontext** (Keycloak-`sub`) ab und ruft **genau eine DB-Funktion** auf:
`SELECT * FROM audit.append_event(<payload>)`. **Keine** Hash-/Zeit-/Lane-Logik im
Service — die trägt vollständig die DB-Seite.

> **Nachtrag (2026-07-10, Migration V0003):** Der ursprünglich skizzierte rohe
> `INSERT` ist in der Implementierung entfallen. Grund: TimescaleDB routet die
> Zeile anhand des im INSERT übergebenen `ts` in den Chunk — ein Trigger, der
> `ts` erst nach dem Kopf-Lock setzt (O-D-Fix), greift dafür zu spät. Nach
> Re-Review durch `security-lead` + `audit-trail-engineer` (beide mitgetragen
> mit Auflagen, umgesetzt) ist der einzige Schreibpfad die `SECURITY DEFINER`-
> Funktion **`audit.append_event(...)`**: Aufrufer liefert nur die Payload
> (ohne `ts`/`tag_utc`/`seq`/`prev_hash`/`lane`), die Funktion leitet die Lane
> transaktionsstabil aus `korrelations_id` ab, erwirbt den Segment-Lock, setzt
> `ts` danach und führt den INSERT selbst aus. `edms_app` hat **kein**
> INSERT-Recht mehr auf `audit.event` (nur SELECT) — Zeitstempel-Fälschung ist
> damit strukturell ausgeschlossen (rote Linie 5); der Seal-Trigger verifiziert
> zusätzlich `tag_utc`-Konsistenz und ein ±5-s-Toleranzfenster gegen
> `clock_timestamp()` (Defense-in-Depth, empirisch auch gegen Superuser-INSERTs
> getestet). Details: `migrations/V0003__audit_log_schema.sql`, Datei-Kopf
> „KRITISCHER BEFUND".

### 17.2 Decorator-Contract

`@AuditAction({ eventTyp, objektRefSelector, ergebnisMapping, kontextKeys })` deklariert
je state-ändernder Methode: den **Katalog-`event_typ`** (Build-/Lint-Check gegen den
Katalog → M5), wie `objekt_ref` aus Argumenten/Ergebnis abgeleitet wird, das
Ergebnis-Mapping und die zu erfassenden **Whitelist-Kontext-Keys**. Er feuert
**nach** der Fachlogik: Erfolg → `ok`; gefangener AuthZ-Fehler → **`denied`** (wird
**mit**-auditiert!); sonstiger Fehler → **`error`** (ebenfalls auditiert). Denials/Fehler
sind bewusst Teil des Logs (Security-Monitoring, Persona B).

### 17.3 Fehlerverhalten — **gleiche Transaktion** statt Outbox

**Entscheidung:** Der Audit-Insert läuft **in derselben Transaktion** wie die
Fachoperation (`backend-nestjs.md`: mutierende Routen sind ohnehin transaktional; der
Decorator enlisted in den ambienten Transaktions-`EntityManager`). Folge: **Fail-closed**
— committet die Fachoperation, ist die Audit-Zeile atomar mit-committet; scheitert der
Audit-Insert, rollt die **ganze** Fachtransaktion zurück. Es gibt **keinen** Pfad, auf dem
die Fachoperation committet, aber das Audit still verloren geht (genau die
Anforderung „Audit-Fehler darf Fachtransaktion nicht stumm verlieren").

*Warum so:* Das Audit-Log ist eine **Compliance-TOM** und harter Gate-Baustein —
„**keine nachvollziehbare Zustandsänderung ohne Rechenschaft**" ist die korrekte,
fail-closed Haltung (Art. 5(2)/32). Audit-Volumen ist niedrig → der synchrone Kostenanteil
ist begrenzt; die N-Lane-Segmentierung (§14.2) hält die Kopf-Lock-Contention in
Fachtransaktionen beherrschbar (M4-Benchmark Phase 4). Simpelste Lösung, die dem
Compliance-Anspruch genügt (kein Dispatcher, keine Eventual Consistency, keine
Audit-Lücke).

**Verworfene Alternative:** **Transactional Outbox** (Fachtransaktion schreibt eine
Outbox-Zeile, ein asynchroner Dispatcher überträgt nach `audit.event`). *Contra:*
Eventual Consistency (Audit-Lag), zweite bewegliche Komponente mit eigenem Fehlermodus
(stecken­gebliebener Dispatcher = Audit-Lücke), und die Ketten-Ordnung müsste über die
Outbox erhalten bleiben — **überdimensioniert** für das niedrige Audit-Volumen. **Bleibt
als Eskalationspfad dokumentiert**, falls je ein hochvolumiger Emitter entstünde (den v1
bewusst ausschließt — kein per-Messwert-Audit).

### 17.4 Trust-Boundary `actor_*` (STRIDE, `security-lead`)

Die **Vertrauensgrenze** für `actor_sub`/`actor_typ`/`actor_rolle` liegt im **NestJS-Layer**
(validiertes Keycloak-Token) — die DB übernimmt diese Werte als gegeben. Das ist als
**Trust-Boundary mit Kopplung an ADR-0002** (Token-Validierung/AuthZ-Enforcement) zu
dokumentieren: **vor** ADR-0002 ist `actor_sub` nur so vertrauenswürdig wie der Emitter
selbst (der Envelope ist dann integritätsgesichert, aber die Akteurs-Zuschreibung noch
nicht scharf durchgesetzt).

## 18. Integritätsprüfung (deterministisch, monatlich — M2/Phase-7-Gate)

**Entscheidung:** Eine read-only SQL-Funktion `audit.pruefe_kette(von date, bis date)`
rechnet deterministisch nach:
1. **Intra-Segment:** je `(lane, tag_utc)` Ereignisse nach `seq` lesen, `zeilen_hash` aus
   **derselben** Kanonisierung (Anhang D) neu berechnen, gegen den gespeicherten Wert und
   gegen `prev_hash[i] = zeilen_hash[i-1]` prüfen; `seq` lückenlos `1..n`.
2. **Tages-Anker:** `anker_hash` je Tag aus den Lane-Köpfen neu berechnen, gegen den
   gespeicherten Anker **und** die Anker-Kette (`vortags_anker_hash`) prüfen.
3. **Externer Abgleich:** recomputed Anker gegen die **publizierten Anker / das
   Export-Manifest** (WORM/S3) — der Schritt, der privilegierte Manipulation aufdeckt und
   die Kette **über archivierte/gedropte Chunks hinweg** lückenlos hält (§19).

Rückgabe: je Tag `ok`/Abweichung + erste verletzende `seq`. **Monatslauf** (`pg_cron` oder
extern) prüft den Vormonat, schreibt das Ergebnis als **Pflicht-Audit-Event** und
Report-Artefakt in `compliance/audit-reports/` (außerhalb meines Schreib-Scopes). Grün = M2.

**Verworfene Alternative:** **Ad-hoc-/Applikations-seitige Prüfung** (Service liest Zeilen
und vergleicht). *Contra:* nicht deterministisch reproduzierbar an die DB-Wahrheit
gebunden, schwer als Phase-7-Gate/CI-Artefakt zu verankern; die SQL-Funktion teilt sich die
**identische** Kanonisierung mit dem Seal-Trigger und ist damit beweis-fest.

## 19. Anbindung Retention-Sonderpfad (F2, Linie 4)

`drop_chunks('audit.event', older_than => …)` läuft **ausschließlich** durch
`edms_audit_betrieb` unter **Vier-Augen + `compliance`-Freigabe**, **nach** verifiziertem
Cold-Export (Row-Count-/Checksum-Abgleich **und** Anker-Manifest). Die gedropten Monate
bleiben über die **publizierten Anker** verifizierbar (§18.3): fehlen Zeilen lokal, prüft
`pruefe_kette` gegen das Manifest. Der Drop-Lauf selbst ist ein **Pflicht-Audit-Event**;
`drop_chunks` ist DDL (kein DML) — **Append-only bleibt unangetastet** (Linie 4). Art. 17
wirkt **nicht** über das Audit-Log, sondern über Krypto-Shredding/Pseudonym-Neutralisierung
in ADR-0004 §15/§16 (die `objekt_ref`-Pseudonyme werden faktisch anonym, die Audit-Zeilen
nie editiert). Konsistent mit ADR-0004 §14/§16.

## 20. Phase-2-Gates (Workflow `2-design`)

- [x] **„ADR review-ready"** — auf `proposed` ausgebaut (Teil B, §11–§23), jede
  Entscheidung mit verworfener Alternative; DB-Schema-Skizze vorhanden
  (`schemas/database/adr-0003-audit-log.md`). **Beide Lead-Reviews (`audit-trail-engineer`
  + `security-lead`) abgeschlossen und eingearbeitet (§22)** — Gate **belegt**.
- [x] **Kanonisierungs-Stabilität (Test-Constraint, `audit-trail-engineer`-Finding 1):**
  **„Golden-Byte"-Regressionstests** pinnen die kanonische Bytefolge fixer Beispielzeilen
  und laufen in der CI **bei jedem PG-Major-Upgrade** — sonst produziert ein Routine-Upgrade
  (via `jsonb::text`-/Format-Drift) einen **False-Positive-Massenalarm „MANIPULATION"**.
  (Umsetzung Phase 4 mit `test-engineer`; hier als verbindliche Test-Auflage verankert.)
- [x] **„Breaking Changes identifiziert" — keine.** Greenfield: `audit`-Schema wird
  **neu** eingeführt, kein bestehendes Schema, keine Consumer, keine API-Vorversion. Die
  Extensions (`timescaledb`/`btree_gist`) liegen aus V0001 vor; `sha256` ist Core (kein
  neues Drittsystem, keine neue Extension — konform `dependencies.md`).
- [x] **„DSGVO-relevante Datenfelder markiert" — vorhanden.** `actor_sub`, `objekt_ref`
  (und selektiv `actor_rolle`) sind **personenbeziehbar pseudonym** (`pii=false`
  strukturell, aber ErwGr. 26) — Markierungs-Schema + Begründung in **Anhang E**; jede
  betroffene Spalte trägt den erweiterten `COMMENT ON COLUMN … personenbeziehbar=true;
  pii=false; …` in der DDL-Skizze (M3).

## 21. Konsequenzen-Update

**(positiv):** Schließt einen der zwei harten Ingest-Gate-Bausteine; belegt A.8.15; macht
Rechenschaft/BAFA-Nachweis maschinell prüfbar; Fail-closed-Atomicity garantiert „keine
Zustandsänderung ohne Rechenschaft". **(negativ):** Der synchrone, gesiegelte Audit-Insert
liegt im Fachpfad (M4-Overhead, Kopf-Lock je Segment) — durch N-Lanes gemildert, in Phase 4
zu benchmarken; die externe Anker-Publikation + Monatsprüfung + Vier-Augen-Retention
erhöhen den Betriebsaufwand. **(neutral):** Setzt Envelope-, Katalog- und
Decorator-Contract, an den alle state-ändernden Folge-Services binden.

## 22. Lead-Review-Ergebnis (`audit-trail-engineer` + `security-lead`) — eingearbeitet

**Beide Phase-2-Lead-Reviews abgeschlossen (2026-07-09); alle Voten eingearbeitet, Status
bleibt `proposed`.** Auflösung der zuvor offenen Punkte O-A…O-H + neue Findings:

| Ref | Votum | Einarbeitung |
|-----|-------|--------------|
| **O-A** | FK **zusätzlich** zum Trigger; `ON UPDATE CASCADE` **verboten** (kaskadierendes Update liefe mit Owner-Rechten → invalidiert Kette flächig) | §13.2, §16 — FK `event_typ(code)` `NO ACTION`; Trigger bleibt für Aktiv-Prüfung/Whitelist |
| **O-B** | `event_id` **JA** (UUIDv7), **in den Hash-Kanon**; kein Unique (Timescale) → einfacher Btree | §13.1, §16, Anhang D |
| **O-C** | Lane = **Hash über `korrelations_id`** (nicht Round-Robin/connection-gebunden); **eine Tx = eine Lane = ein Lock**; N=16 Start; M4-Benchmark Burst + Skew | §14.2, §17.1 |
| **O-D** | `clock_timestamp()` **beibehalten**, aber **Trigger-Reihenfolge-Bug fixen** (`ts` **nach** `FOR UPDATE`); Kanon **verbindlich Epoch-Mikrosekunden** (nicht ISO-Text) | §14.4, Anhang D |
| **O-E** | Anker-Härtung (HOCH): **stündliche** Zwischen-Anker (24h→~1h) *oder* `compliance`-Gegenzeichnung; **Anker-Signatur zwingend** (KMS-Schlüssel, keiner DB-Rolle bekannt); **dedizierte Publish-Identität** + WORM-Object-Lock; Publikation via `markiere_publiziert()` + Pflicht-Audit-Event | §14.5 |
| **O-F** | `drop_chunks` **nicht** über Owner-Rechte, sondern **schmale `SECURITY DEFINER`-Wrapper** (`retention_drop()`, prüft Vier-Augen-Freigabe, löst Pflicht-Audit-Event); **`ddl_command_end`-Event-Trigger** auf `audit` (DDL → `pg_notify`/SIEM, Kompensation gegen Funktions-Replacement); `search_path`-Pinning bestätigt | §15, Schema-Skizze §4/§6 |
| **O-G** | Gnadenfrist: echtes Risiko = **Transaktions-Sichtbarkeits-Latenz** (vor Mitternacht gestartet, danach committet), nicht Uhren-Skew → Versiegelung prüft via `pg_stat_activity`, dass **keine** vor der Tagesgrenze gestartete Tx mehr offen ist | §14.5, Schema-Skizze §4.3 |
| **O-H** | Werte-Cap **im Trigger** (`jsonb_typeof` = nur Skalare, `octet_length`-Grenze je Wert), konsistent zur Trigger-Whitelist | §13.3, §14.4, Schema-Skizze §4.2 |

**Weitere Findings (eingearbeitet):**
- **Kanonisierungs-Stabilität über PG-Major-Upgrades** (`audit-trail-engineer` F1) →
  **Golden-Byte-Regressionstests** in der CI (§20).
- **Katalog-Versionierung** (`audit-trail-engineer` F3) → append-only `event_typ` +
  `event_typ_version` (`gueltig_ab/bis`), Katalog-Änderungen als Pflicht-Audit-Event; plus
  dokumentiertes Auditor-Abfragemuster „Endkunde X" (Fan-out über Pseudonym-Enumeration,
  §16).
- **STRIDE-Zusätze** (`security-lead`): `lock_timeout`/`statement_timeout` auf dem
  Kopf-`FOR UPDATE` (§14.4); **Versiegelungs-/Publikationsläufe selbst als
  Pflicht-Audit-Events** (§14.5); **`actor_*`-Trust-Boundary** im NestJS-Layer, gekoppelt an
  ADR-0002 (§17.4).

## 23. Konsolidierte offene Punkte für die User-Freigabe (Status `proposed`)

| # | Offener Punkt | Art | Zuständig / Zeitpunkt |
|---|---------------|-----|------------------------|
| A-O1 | **Lane-Anzahl N** (Start 16) + Round-Robin vs. Korrelations-Hash final | **Phase-4-Benchmark** | `timescale-`/`performance-engineer` (M4: Burst + Skew) |
| A-O2 | **Anker-Kadenz + 24h-Restrisiko:** stündliche Zwischen-Anker vs. nur Tages-Anker | Compliance-Gegenzeichnung | `compliance-director` (falls nicht stündlich) |
| A-O3 | **KMS/Vault für Anker-Signatur** — Schlüssel, den **keine DB-Rolle** kennt | **Betriebs-/User-Input** | **koppelt an offenen Hosting-/KMS-Input aus ADR-0004** (§15) + `security-lead`/`devops-lead` |
| A-O4 | **WORM/S3-Ablage + Publish-Identität** (Object-Lock/Compliance-Mode, Retention ≥ Audit-Horizont) | Betriebs-/Deployment | `devops-lead` + `security-lead` (ADR-0005-Vorwirkung) |
| A-O5 | **Gnadenfrist-Dauer** der Tages-/Stunden-Versiegelung (max. Tx-Laufzeit über die Grenze) | Phase-4/Betrieb | `audit-trail-engineer` |
| A-O6 | **Retention-Horizont** (F2, 5-Jahre-Hypothese) gegen Zuwendungsbescheid/ANBest; nie kürzer als überwachte Daten (O2 ADR-0004) | Compliance-Gate | `compliance-director` + User (§8.2) |
| A-O7 | **Mitbestimmung** Beschäftigten-Aktivitätslog (§7.2) | Organisatorisch | `compliance-director` vor Produktivbetrieb (§8.2) |
| A-O8 | **Phase 3 (zwingend vor Impl.):** VT-0002, TOM-Logging, DSFA-0001-Nachtrag, Betroffenenrechte (Art. 17(3)(b)), retention-matrix; SoA A.8.15 belegen + A.5.28/A.8.16/A.8.17/A.5.33 | Compliance | `compliance-director`/`dsgvo-`/`iso27001-auditor` (§7.4) |

> **Hinweis:** A-O3/A-O4 verlagern den kritischen Root-of-Trust (Anker-Signatur + WORM) in
> die Betriebs-/Hosting-Schicht — sie sind **freigabe-relevant**, weil ohne extern
> gehaltenen Signaturschlüssel die F1-Zusage „evident auch gegen privilegierten Zugriff"
> auf die S3-Zugriffskontrolle zusammenfällt (`security-lead`, Finding HOCH).

---

## Anhang D — Kanonische Serialisierung (Hash-Input, deterministisch)

> Verbindlich identisch in Seal-Trigger **und** `pruefe_kette`. Versioniert über
> `format_version` (in den Hash eingeschlossen).

`zeilen_hash = sha256( CANON ‖ prev_hash )`, mit `CANON` = **längenpräfigierte** Konkatenation
in fester Feldreihenfolge:

```
CANON := LP(format_version) ‖ LP(event_id) ‖ LP(tag_utc) ‖ LP(lane) ‖ LP(seq)
       ‖ LP(ts_micros) ‖ LP(event_typ) ‖ LP(objekt_typ) ‖ LP(objekt_ref)
       ‖ LP(actor_sub) ‖ LP(actor_typ) ‖ LP(actor_rolle)
       ‖ LP(ergebnis) ‖ LP(kontext_canonical_json) ‖ LP(korrelations_id)

LP(x)  := if x IS NULL then 0xFFFFFFFF
          else uint32_be(byte_length(utf8(x))) ‖ utf8(x)
event_id             := UUIDv7 (in den Kanon, O-B — sonst einziges Feld außerhalb des Ankers)
ts_micros            := (EXTRACT(EPOCH FROM ts) * 1000000)::bigint  -- Epoch-Mikrosekunden
                        (PG16: EXTRACT liefert numeric -> exakt, KEIN Float-Drift; O-D)
                        VERBINDLICH statt ISO-Text (portabel, kein Format-Drift)
kontext_canonical_json := deterministisches jsonb-Textrendering (stabile Key-Ordnung)
```

- **NULL** ist distinkt (`0xFFFFFFFF`) von leer (`0x00000000`) — keine Kollision.
- **Längenpräfix** verhindert Delimiter-/Feldgrenzen-Injektion (kein Trennzeichen nötig).
- **`event_id` und `ts_micros`** sind seit dem Lead-Review Teil des Kanons (O-B/O-D).
- **Golden-Byte-Pinning:** die Byte-Repräsentation von `ts_micros` und
  `kontext_canonical_json` ist über PG-Major-Versionen per Regressionstest zu fixieren
  (§20, `audit-trail-engineer`-Finding 1).
- `anker_hash(stufe, periode) = sha256( LP(stufe) ‖ LP(periode_start) ‖ Σ_sortiert
  LP(lane)‖LP(letzter_seq)‖LP(anzahl)‖letzter_hash ‖ LP(anzahl_gesamt) ‖ vorher_anker_hash )`
  — je **Stufe** (`stunde`/`tag`) eine eigene Anker-Kette (O-E).

## Anhang E — DSGVO-Datenfeld-Markierung (Gate „DSGVO-Felder markiert")

> **Neues Markierungs-Schema:** Die `COMMENT`-Konvention der Migrations-Rule ist für
> `pii=true` gedacht. Die Audit-Felder sind **nicht** direkt-PII, aber
> **personenbeziehbar pseudonym** (ErwGr. 26). Dafür der erweiterte Kommentar:
> `personenbeziehbar=true; pii=false; art=<pseudonym|opake-principal>; grundlage=…;
> zweckbindung=Sicherheit/Rechenschaft (Art.32/5(2)), NICHT Leistungs-/Verhaltenskontrolle
> (Art.88/§26 BDSG); aufloesung=nur via getrenntes System (ADR-0002/identity), kein FK`.

| Feld | Kategorie | Markierung / Begründung |
|---|---|---|
| `audit.event.actor_sub` | **opake Principal-ID** (i. d. R. Beschäftigte, §7.2) | `personenbeziehbar=true; pii=false; art=opake-principal`; Auflösung nur via Keycloak/ADR-0002 (getrenntes System, **kein FK**, Linie 2); Zweckbindung §7.2 |
| `audit.event.objekt_ref` | **Pseudonym/Entity-Ref** | `personenbeziehbar=true; pii=false; art=pseudonym`; Re-ID nur via `identity` (ADR-0004, autorisierter, selbst wieder auditierter Vorgang; **kein FK**) |
| `audit.event.actor_rolle` | Rolle-zum-Zeitpunkt (selektiv, §13.4) | `personenbeziehbar=true; pii=false`; nur wenn `event_typ.rolle_erfassen`; Zweckbindung §7.2 |
| `audit.event.kontext` | strukturiert, **PII-frei erzwungen** | `pii=false` (Whitelist-Keys je `event_typ` + `pii-scan`, §13.3) — **kein** Klartext-PII |
| `audit.event.korrelations_id` | technische Trace-ID | keine Personenbeziehbarkeit (Request-Korrelation) |

## Anhang F — Rote-Linien-Konformität (§7.3)

| Rote Linie | Umsetzung | Nachweis |
|---|---|---|
| **1** Kein PII-Klartext, kontrolliertes Vokabular, kein Freitext | `event_typ`-Katalog; `kontext`-Whitelist (3-fach); `pii-scan`/Schema-Inspektion | §13.2, §13.3, Anhang E |
| **2** Auflösung nur über getrennte Systeme, **kein FK** | `actor_sub`/`objekt_ref` opak, **kein** FK nach `identity`/`energy`/User | §11.2, §13.1, §16 |
| **3** Unveränderlichkeit atomar (+ evident) | `REVOKE UPDATE, DELETE` in derselben Migration, App nur `INSERT`+`SELECT` (M1); Hash-Kette + publizierter Anker gegen privilegierten Zugriff | §15.2, §15.4, §14 |
| **4** Retention nur über Sonderpfad | `drop_chunks` durch Betriebsrolle, Vier-Augen + `compliance`, Cold-Export vorher; Append-only unangetastet | §19 |
| **5** Zeit DB-seitig, deterministische Monatsprüfung | `ts` per Trigger (`clock_timestamp()` UTC, nie emitter); `pruefe_kette` deterministisch, Phase-7-Gate | §11.5, §13.1, §18 |
