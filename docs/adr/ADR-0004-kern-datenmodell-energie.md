# ADR-0004: Kern-Datenmodell Energie (Endkunde, System/Messstelle, Zähler, Messwert-Zeitreihen, Messkonzept)

- **Status:** **accepted** — **durch User freigegeben am 2026-07-09** (Phase-2-Design inkl. beider Lead-Reviews, siehe Teil B, Abschnitte 11–20 + Anhänge B/C). Phase-1-Vision-Memo (Abschnitte 1–10, Anhang A) unverändert erhalten. **Noch keine Migration** (`migrations/` bleibt leer; DDL erst über `/add-migration` — erst nach Phase 3). **Nächster Schritt: Phase 3 (Compliance-Review — DSFA, RVT, TOMs, ISO-Mapping) ist zwingende Vorbedingung der Implementation.** Offene Punkte O1–O5 in Abschnitt 20.1; O1 (dependencies.md-Nachzug) mit dieser Freigabe umgesetzt.
- **Datum:** 2026-07-09
- **Autor:** product-director (Phase 1, Abschnitte 1–10); technical-director (Phase 2, Teil B)
- **Reviewer:** compliance-director — **Phase 1 ohne Veto bestätigt (2026-07-09)**; Risiko-Flag **hoch geschärft**; Sequenzierungs-Gate unter **sechs Bedingungen** mitgetragen; **fünf rote Linien** für Phase 2 definiert (siehe Abschnitte 7.1–7.3); technical-director (Phase 2, Design-Owner); **`database-lead` + `timescale-engineer` — Teil-B-Lead-Review abgeschlossen, Voten eingearbeitet (Abschnitt 20)**
- **Freigabe:** User — **Phase-1-Entscheidungen F1–F7 getroffen (2026-07-09)**, siehe Abschnitt 8; **Phase-2-Design freigegeben, ADR accepted (2026-07-09)**
- **Workflow:** `/new-feature kern-datenmodell-energie`, Phase 1 (Konzept & Vision) laut `.claude/docs/workflow-catalog.yaml`
- **Roadmap-Bezug:** „Als Nächstes: ADR-0004 — Kern-Datenmodell Energie (Endkunde, System/Messstelle, Zähler; Messwert-Zeitreihen als Hypertables; PII getrennt + verschlüsselt, DS-10)" (`production/roadmap.md`, revision 3)

> **Hinweis zum Reifegrad:** Dies ist das **Vision-Memo** (Phase-1-Output). Es
> beantwortet die Produktfragen (Zielnutzer, Job-to-be-done, Erfolgsmetriken,
> Scope, Alternativen, Sequenzierung, Compliance-Risiko, offene Fragen) und
> bereitet die Übergabe an `technical-director` (Phase 2) vor. **Alle konkreten
> Schema-Entscheidungen** (Tabellenschnitt, Spaltentypen, Hypertable-Parameter,
> Verschlüsselungsverfahren, Index-Strategie, Migrationen) sind **bewusst
> Phase 2/3/4.** In diesem ADR wird **kein Schema entworfen und keine Migration
> angelegt.**
>
> **Domäne (Korrektur 2026-07-09):** EDMS = **Energiedatenmanagementsystem**
> (Einsparzähler-Plattform, BAFA-Pilotprogramm ESZ) — **nicht**
> Dokumenten-Management. Grundlage: `Projektleitlinien`, `production/roadmap.md` (rev. 3)
> und der Anforderungskatalog `compliance/foerderauflagen/merkblatt-anforderungen.md`
> (rev. 3, DS-/DE-/TB-Zeilen).

---

## 1. Vision-Satz (Job-to-be-done)

> **Als Fach-Service (Ingestion, Baseline, Einsparberechnung, BAFA-Export) und als
> internes Betriebs-Team des EDMS brauche ich ein konsistentes, von PII sauber
> getrenntes Kern-Datenmodell für Endkunden, Systeme/Messstellen, Zähler und
> Messwert-Zeitreihen, damit alle Förder-Nachweise (TB-/DE-/DS-Anforderungen) auf
> einer einzigen, datenschutzgerecht strukturierten Datengrundlage aufsetzen —
> statt dass jede Fachlogik ihr eigenes Schema erfindet.**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

Das Kern-Datenmodell ist das **fachliche Fundament**, auf das ADR-0005
(Ingestion), ADR-0006 (Baseline) und ADR-0007 (Einsparberechnung + BAFA-Export)
aufsetzen. Es entscheidet, **welche Fachentitäten existieren**, **wie
personenbezogene von messtechnischen Daten getrennt werden** (DS-10) und **wie
die Betroffenen-Trennung Anschlussnutzer ≠ Endkunde** (DS-07) strukturell
verankert wird — beides ist Voraussetzung dafür, dass die spätere ABAC-Policy
(ADR-0002) und das Audit-Log (ADR-0003) überhaupt greifen können.

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Fach-Service (primär, System-Akteur).**
Ingestion-, Baseline-, Einsparberechnungs- und Export-Worker. Schreiben/lesen
Messwerte im Sekunden-/Batch-Takt, joinen Zähler → System → Endkunde, lesen das
Messkonzept als Berechnungsgrundlage. Erwarten: stabile Fachschlüssel, verlässliche
Zeit-Achse, effiziente Zeitbereichs-Queries, klare Trennung „was ist PII / was ist
Messwert". Erfolg = kein Nach-Modellieren, keine Ad-hoc-Spalten, deterministische
Nachweisbarkeit je Förderjahr.

**Persona B — Internes Betriebs-Team (primär).**
Legt Endkunden/Systeme/Zähler an, pflegt Stammdaten und Messkonzepte, prüft
Datenvollständigkeit (DE-02), betreut Störungen (TB-04). Braucht eine
nachvollziehbare, versionierte Fachhistorie (Messkonzept-Änderungen, TB-01) und
klare Zuständigkeits-/Beziehungsstruktur (wer ist Vertragspartner, wer ist
Datensubjekt der Verbrauchsdaten). Erfolg = Stammdatenpflege ohne Umwege, jede
fachlich relevante Änderung ist rekonstruierbar.

**Persona C — Endkunde / Anschlussnutzer (sekundär, später).**
Sieht später über das Nutzerportal (Roadmap „Später") nur einen **eng begrenzten
Ausschnitt**: der Endkunde/Vermieter nur das **Abrechnungsminimum** der
Anschlussnutzer-Verbrauchsdaten (DS-07). Für ADR-0004 relevant nur als
**Strukturanforderung**: das Modell muss diese Sichttrennung überhaupt ermöglichen.
Portal-Implementierung = späterer ADR.

**Persona D — Fördergeber-/Datenschutz-Auditor (BAFA, DSB, compliance-director) — Stakeholder.**
Prüft Nachweise, nicht Fachbedienung: Vollständigkeit je Förderjahr (DE-02/TB-09),
pseudonymisierte Auszüge (DE-04/TB-08), Nachweis der PII-Trennung/-Verschlüsselung
(DS-10) und der DE-Only-Datenhaltung (DS-09). Erfolg = die Datenschutz-Trennung ist
**per Schema-Inspektion belegbar**, ohne Vertrauensvorschuss.

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| M1 | **Fachliche Vollständigkeit** — alle Scope-Anforderungen (TB-01, TB-02-Slot, TB-05-Vorbereitung, DE-02/TB-09, DS-07, DS-10, DE-04) sind auf Entität/Spalte abbildbar | Mapping-Tabelle Anforderung → Entität/Attribut (siehe Anhang A); Review durch `database-lead` + `compliance-director` | **100 %** der ADR-0004-Scope-Anforderungen abgedeckt |
| M2 | **DSGVO-Trennung per Schema-Inspektion nachweisbar** (DS-10) | Automatisierter Schema-Check: (a) direkt identifizierende PII **nur** in abgegrenztem Identitäts-Schema/-Tabelle; (b) messwert-/verbrauchsführende Tabellen enthalten **keine** direkt-identifizierenden Attribute, nur Surrogat-/Pseudonym-FK; (c) jede PII-Spalte trägt `COMMENT ON COLUMN … pii=true; grundlage=…; retention=…` (DB-Rule) | Check **grün**, 0 Verstöße |
| M3 | **Messwert-Schreibpfad-Performance** (Ingest/Backfill) | Batch-Insert-Benchmark gegen Testcontainer-PG16+Timescale-`oss`; p95-Latenz je Batch, Durchsatz Messwerte/s | **Auf Sizing MITTEL ausgelegt (F3 entschieden):** 1.000–10.000 Endkunden, 15-Min-Intervall → **Größenordnung hunderte Mio. Messwerte/Jahr**. Zielkorridor: Backfill ≥ 50.000 Messwerte/s, p95-Batch < 200 ms; Chunk-/Index-Design und Archivierungs-Strategie (Kompressions-Ersatz, nur Apache-2-Features) darauf auslegen (Phase-2-Thema, siehe 6.1) |
| M4 | **Lücken-/Vollständigkeits-Nachweisbarkeit** (DE-02/TB-09) | Query ermittelt je Zähler und Förderjahr fehlende Tage bei geforderter Mindestauflösung ≥ 1/Tag | Query **korrekt & indexgestützt** ausführbar (< definierter Zeit; Detail Phase 2) |
| M5 | **Data-Residency-Trennbarkeit** (DS-09, R-0002) | Schema-Inspektion: PII-Bestand in klar abgegrenztem, separat platzier-/verschlüsselbarem Namensraum (Vorbedingung für DE-Only-Deployment in ADR-0005) | PII-Bestand **strukturell separierbar** |
| M6 | **Pseudonymisierbarkeit ohne PII-Join** (DE-04/TB-08) | Export kann Endkunde durch stabiles Pseudonym ersetzen, ohne Klartext-PII zu joinen; „von wiss. Auswertung ausgenommen"-Flag vorhanden und filterwirksam | Pseudonym-Export **ohne PII-Zugriff** möglich |

> M3-Zielwert ist mit dem **entschiedenen Sizing MITTEL** (F3: 1.000–10.000
> Endkunden, 15-Min-Intervall) belegt; Retention-Horizont der Rohmesswerte bleibt
> für Phase 2 zu präzisieren (Archivierungs-/Kompressions-Ersatz-Strategie, 6.1).

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope v1 (dieses ADR / dieses Datenmodell)

- **Endkunde** — Vertragspartner im Förderprogramm; **enthält PII**, deshalb im
  **getrennten, verschlüsselten Identitäts-Namensraum** (DS-10) mit
  Surrogat-/Pseudonym-Schlüssel nach außen.
- **Anschlussnutzer-Beziehung** (DS-07) — Trennung „**Datensubjekt der
  Verbrauchsdaten**" (z. B. Mieter) vs. „**Endkunde/Vertragspartner**" (z. B.
  Vermieter). **Entschieden: strukturell in v1** (Empfehlung A bestätigt, 5.2).
  Der **Enforcement-Zeitpunkt** der DS-07-Sichttrennung wird mit dem **ersten
  Mieter-Projekt** entschieden (F2 offen, siehe Klärungsauftrag in Abschnitt 8).
- **System / Messstelle** inkl. **Systemgrenze** (TB-01 Pflichtinhalt) und
  Systembeschreibung.
- **Zähler** inkl. **Gerätetyp** (Messgeräte-Wahl, TB-01) und Zuordnung zur
  Messstelle. **Energieträger als Dimension je Zähler/Messgröße** (F7 entschieden):
  **Strom, Wärme/Kälte, Gas/Öl/Biomasse** — **alle ESZ-Energieträger; Wasser NICHT
  in v1.** Das Modell muss die Energieträger-Dimension und die je Energieträger
  abweichenden Messgrößen/Einheiten tragen (kein Strom-only-Sonderweg).
- **Messwert-Zeitreihe** als **TimescaleDB-Hypertable** — **ausschließlich
  Apache-2-Features** (kein natives Compression/Continuous-Aggregate/Retention-
  Policy; Ersatz per Materialized View + `pg_cron` + eigene Lösch-Jobs, siehe
  `Projektleitlinien`/`dependencies.md`). Mindestauflösung ≥ 1/Tag muss abbildbar und
  prüfbar sein (DE-02/TB-09); reales Intervall im Pilot 15 min (F3).
- **Messkonzept** als **versioniertes Fachobjekt je Endkunde** (TB-01) mit
  **allen sieben Pflichtinhalten** als strukturierte Felder (Energieträger,
  Systemgrenze, Systembeschreibung, Baseline, Bereinigungsverfahren,
  Messgeräte-Wahl, Geräteerkennungs-Verfahren) und **Änderungshistorie**
  (Änderung löst später einen Anzeige-Vorgang aus — Workflow = späterer ADR).
- **Gerätegruppe** als **Vorbereitung für TB-05** (Geräteerkennungs-Quoten
  20→40 %) — Struktur zur Zuordnung von Verbrauchsanteilen; die
  Quoten-**Berechnung/Reports** sind späterer Scope.

### 4.2 Out-of-Scope v1 — mit „Verankerungs-Slots"

Diese Punkte gehören **nicht** in dieses Datenmodell, aber ADR-0004 muss die
**referenziellen Anschlussstellen** vorsehen, damit die Folge-ADRs nicht in eine
PII-berührende Nach-Migration laufen:

- **Ingestion-Pipeline** (ChirpStack → Mosquitto/MQTT → Ingest-Worker) → **ADR-0005**.
  ADR-0004 liefert nur das Ziel-Hypertable + Idempotenz-fähige Schlüssel.
- **Baseline-Engine** (Witterung/Gradtagzahlen, Regression) → **ADR-0006**.
  ADR-0004 hält den **Baseline-Slot** am Messkonzept (TB-01/TB-02), inkl.
  Referenz auf die Beleg-Ablage (Jahresabrechnungen, TB-02) und ein
  **Begründungs-Feld**, falls < 3 Abrechnungen vorliegen. Die **Berechnung**
  ist ADR-0006.
- **Einsparberechnung + BAFA-Export** → **ADR-0007**. ADR-0004 stellt die vier
  Export-Datenkategorien (Rohdaten/Baseline/Einflussgrößen/Einspardaten, DE-03)
  join-bar bereit; Export-Aufbereitung/Pseudonymisierung ist ADR-0007.
- **Beleg-Ablage-Nebenmodul** (Jahresabrechnungen, S3) → späterer ADR;
  ADR-0004 hält nur die **Referenz** vom Messkonzept/Baseline-Slot auf einen
  Beleg.
- **Anzeige-Workflow** (TB-03 Schwellwerte/Fristen) und **monatliche
  Nutzerinformation** (TB-06) → Workflow-/Portal-ADRs.
- **Audit-Log-Hypertable** → **ADR-0003**. ADR-0004 ist nur **audit-ready**
  (Zeitstempel UTC, keine destruktiven Updates auf auditrelevante PII ohne
  Historie); die Audit-Hypertable + Action-Decorator-Verdrahtung bleibt ADR-0003.
- **Consent-Verwaltung** (DS-03/DS-04) → **eigener ADR** (Empfehlung 4.3/5.1).

### 4.3 Consent: Empfehlung (leichtgewichtiger Weg)

Das Datenschutz-Merkblatt Kap. 3.3 macht die Einwilligung zur **Voraussetzung der
Endkunden-Aufnahme**. Die Roadmap führt Consent unter „Später", aber ausdrücklich
als „Voraussetzung für Endkunden-Onboarding". Consent ist ein **eigenständiges,
umfangreiches Feature** (versionierte Texte, Zeitpunkt+IP-Nachweis, Opt-out,
Kopplungsverbot, Informationstext-Bausteine; eigener `consent-engineer`,
DS-03/DS-04).

**Empfehlung:** **Consent als eigener ADR — aber referenzielle Verankerung in
ADR-0004.** Konkret hält ADR-0004 am Endkunden einen **Consent-Referenz-/
Statusslot** (aktiver Consent-Datensatz + eingewilligte Textversion), sodass die
DS-3.3-Voraussetzung „kein aktiver Endkunde ohne gültige Einwilligung"
**strukturell erzwingbar** wird, ohne die volle Consent-Mechanik in ADR-0004
aufzublähen. **Sequenz-Konsequenz:** Der Consent-ADR muss **vor produktivem
Endkunden-Onboarding** liegen — **nicht zwingend vor dem ADR-0004-Schema**.

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 Consent: im Scope von ADR-0004 vs. separater ADR

- **A — Consent-Fachobjekt in ADR-0004 mitnehmen.** *Pro:* Endkunde und
  Einwilligung entstehen zusammen, DS-3.3-Kopplung sofort vollständig. *Contra:*
  überlädt das Datenmodell mit einem eigenen, komplexen Feature (Textversionierung,
  IP/Zeitpunkt-Nachweis, Opt-out, Kopplungsverbot); vermischt zwei Compliance-
  Themen in einem ADR; verzögert das Kern-Datenmodell.
- **B — Consent als eigener ADR + Verankerungs-Slot in ADR-0004.** *Pro:* schlanker,
  fokussierter Kern-ADR; Consent bekommt eigene, nachvollziehbare Entscheidungs-
  Historie (fördernachweis-freundlich); DS-3.3 bleibt über den Referenz-Slot
  **strukturell** gesichert. *Contra:* ein zweiter ADR nötig; Reihenfolge-Disziplin
  (Consent vor Endkunden-Go-Live) muss auf der Roadmap sichtbar bleiben.
- **Empfehlung: B.** Leichtgewichtig, trennt Belange sauber, hält die DS-3.3-Pflicht
  trotzdem strukturell fest.

### 5.2 Anschlussnutzer-Beziehung: in v1 vs. später nachziehen

- **A — Beziehung strukturell in v1** (auch wenn die ersten Pilotkunden
  Eigentümer-Selbstnutzer sind). *Pro:* die DS-07-Trennung „Datensubjekt der
  Verbrauchsdaten ≠ Endkunde/Vertragspartner" ist das **Fundament der gesamten
  ABAC-Datenschutzarchitektur** (ADR-0002); die spätere ABAC-Policy baut direkt
  darauf. *Contra:* minimaler Mehraufwand in v1 (eine Beziehung + Rolle), auch wenn
  anfangs 1:1.
- **B — später nachziehen** (v1 kennt nur Endkunde = Nutzer). *Pro:* v1 minimal
  einfacher. *Contra:* **teuerste Art von Migration** — nachträgliches Einziehen
  einer 1:1→1:n-Betroffenen-Beziehung **auf bereits vorhandenen PII- und
  Verbrauchsdaten**, plus Nachbau der schon existierenden ABAC-Policy auf ein
  geändertes Modell. **DS-07-Pflichten greifen ab dem ersten Mieter-/Vermieter-Fall.**
- **Empfehlung: A.** Der v1-Aufwand ist gering, das Risiko des Weglassens hoch und
  PII-berührend. Deckt sich mit `access-control-engineer` „Anschlussnutzer ≠
  Endkunde".

### 5.3 PII-Trennung (DS-10): separates DB-Schema vs. physisch getrennter Identity-Vault

- **A — separates PostgreSQL-Schema/Namensraum in derselben Instanz**, Feld-/
  Spaltenverschlüsselung, Messdaten referenzieren nur Surrogat-/Pseudonym-ID.
  *Pro:* leichtgewichtig, sofort umsetzbar, erfüllt DS-10 „getrennt + verschlüsselt"
  strukturell; ein Backup-/Betriebspfad. *Contra:* geringere physische Isolation als B.
- **B — physisch getrennte DB/Service (Identity-Vault)**, eigene Verschlüsselung,
  Messdaten kennen nur Pseudonym. *Pro:* stärkere Isolation, kleinerer Blast-Radius,
  granularere DE-Only-Platzierung (DS-09). *Contra:* deutlich höherer Aufwand, koppelt
  eng an Deployment/Betrieb (ADR-0005), zwei Konsistenz-/Backup-Pfade.
- **Empfehlung (Produktebene): A für v1, aber mit gekapselter, schmaler
  PII-Zugriffs-Schnittstelle, die einen späteren Wechsel auf B nicht verbaut**
  (Messdaten kennen ausschließlich die Pseudonym-ID). Die konkrete Krypto-/
  Trennungs-Architektur ist **Phase 2** (`technical-director`/`security-lead`) und
  **Phase 3** (`compliance-director`). — Siehe **F5/F6**.

### 5.4 Messwert-Modell (Technik-Trade-off, hier nur benannt)

Ein **kanal-/OBIS-basiertes, energieträger-übergreifendes Messwert-Hypertable**
vs. **typisierte Tabellen je Energieträger** ist eine **Phase-2-Entscheidung**
(`timescale-engineer`/`database-lead`). Produktseitig relevant nur: das Modell muss
**mehrere Energieträger** (TB-01) und die **Mindestauflösung** (DE-02/TB-09) tragen.
Delegiert an Phase 2 (→ Tech-Trade-off, `technical-director`).

---

## 6. Sequenzierung gegenüber ADR-0002 (Auth) und ADR-0003 (Audit-Log)

Die Roadmap listet 0002/0003 vor 0004; der User hat entschieden, **direkt mit
ADR-0004 fortzufahren**. Diese Reihenfolge ist **fachlich vertretbar** — Auth und
Audit hängen ohne Fachentitäten teilweise „in der Luft"; das Datenmodell ist eher
**Voraussetzung für** 0002/0003 als umgekehrt. Bedingung ist eine saubere
Entkopplung:

**Was das Datenmodell wirklich braucht — und was nicht:**

| Von | Braucht ADR-0004 den **Code**? | Braucht ADR-0004 die **Struktur**? | Entkopplung |
|-----|-------------------------------|-------------------------------------|-------------|
| **ADR-0002 (Auth/RBAC/ABAC)** | **Nein** | **Ja, als Vorbereitung** | Principal-Referenzen als **opake UUID** (Keycloak-`sub`) modellieren, **keine harte FK** auf eine noch nicht existierende User-Tabelle. Die **ABAC-relevanten Attribute** (Beziehung Anschlussnutzer↔Endkunde, Datenklasse „Abrechnungsminimum" vs. „Detailverbrauch") müssen im Modell **vorhanden** sein, damit ADR-0002 sie **durchsetzen** kann. Die Durchsetzung selbst ist **nicht** Teil von ADR-0004. |
| **ADR-0003 (Audit-Log)** | **Nein** | **Ja, audit-ready** | Schema audit-ready entwerfen (UTC-Zeitstempel, keine destruktiven Updates auf auditrelevante PII ohne Fachhistorie). Die eigentliche **Audit-Hypertable + Action-Decorator-Verdrahtung** bleibt ADR-0003. |

**Entschieden (F4, mit `compliance-director` mitgetragen):** ADR-0004
**Schema-Design + Migration dürfen jetzt vorgezogen** werden. Der **produktive
Ingest realer PII-/Verbrauchsdaten** wird jedoch durch ein **hartes Gate**
gesperrt, das **erst öffnet, wenn alle folgenden Bausteine stehen**:

1. **ADR-0002** (Auth/RBAC/ABAC-Enforcement),
2. **ADR-0003** (unveränderliches Audit-Log),
3. **abgeschlossene DSFA** (Art. 35, DS-05),
4. **Consent-Enforcement** (DS-03/DS-04, Kap. 3.3),
5. **DE-Only-Hosting + AVV/TIA** (DS-09, R-0002).

Ohne dieses Gate existierten personenbezogene Verbrauchsdaten ohne
Zugriffsdurchsetzung, ohne Zugriffs-Audit, ohne DSFA und ohne Rechtsgrundlage
(DS-07/DS-10 nicht durchsetzbar, Art. 30/32/35 nicht belegbar). Das Gate ist
**technisch durchzusetzen** (kein verdrahteter Prod-Datenpfad auf PII-/
Verbrauchstabellen bis zur Freigabe — Gate-Bedingung 6 in 7.1) und wird durch
`compliance-director` freigegeben.

---

## 7. Compliance-Einfluss / Phase-1-Risiko-Flag

**Gesamt-Flag: HOCH — durch `compliance-director` bestätigt und geschärft
(2026-07-09, ohne Veto).** Das Sequenzierungs-Gate (Abschnitt 6) wird unter
**sechs Bedingungen** (7.1) mitgetragen; für Phase 2 gelten **fünf rote Linien**
als verbindliche Design-Constraints (7.2); die Phase-3-Vorschau steht in 7.3.

*Begründung in einem Satz:* Dieses ADR führt die **personenbezogenen Daten inkl.
Verbrauchsdaten von Haushalten** ins System ein — genau den Fall, den das
Datenschutz-Merkblatt Kap. 4.1 (DS-05) mit „Smart-Meter in Haushalten, große
Datenmengen in hoher Auflösung" **explizit als DSFA-Auslöser (Art. 35 DSGVO)**
nennt.

**Konsequenzen (Phase 3 zwingend und substanziell):**

- **DSGVO Art. 35 — DSFA erforderlich** (DS-05): Schwellwert klar überschritten
  (Verbrauchsprofile von Haushalten, hohe Auflösung). DSFA-Entwurf unter
  `compliance/dsgvo/dsfas/` nach `.claude/docs/templates/dsfa.md`; ausgefüllte
  Checkliste archivieren (BAFA-vorlegbar).
- **DSGVO Art. 30 — RVT-Eintrag fällig** (DS-06): ESZ-Verarbeitung als
  Sub-Verfahren in `compliance/dsgvo/rvt.md`.
- **DS-09 / R-0002 (PII-Hosting DE-Only):** greift **direkt**, weil dieses ADR die
  PII-Tabellen einführt — Data-Residency DE-Only + ISO-27001-RZ betreffen Storage-/
  DB-/Deployment-Architektur (Vorwirkung auf ADR-0005). M5 sichert die strukturelle
  Trennbarkeit.
- **DS-10 (Trennung + Verschlüsselung)** ist die **Kern-Anforderung dieses ADRs**;
  M2 macht sie per Schema-Inspektion nachweisbar.
- **DS-07 (Anschlussnutzer ≠ Endkunde):** strukturelle Voraussetzung der späteren
  ABAC-Policy (5.2).
- **DE-04 / DS-11 (Pseudonymisierung, kein PII-Leak):** Pseudonym-Schlüssel als
  Standard-Außenschlüssel (M6); **keine PII in OSS-Fixtures** (DS-11).
- **ISO/IEC 27001 (grob, Feinmapping = Phase 3 durch `iso27001-auditor`):**
  voraussichtlich u. a. A.5.12/A.5.13 (Klassifizierung/Kennzeichnung),
  A.5.34 (Privacy/PII-Schutz), A.8.11 (Data Masking), A.8.12 (DLP),
  A.8.24 (Kryptografie), A.8.10 (Löschung) — final durch `iso27001-auditor`.
- **Zuständigkeit / harte Regel:** Ich schreibe **nicht** in `compliance/**`.
  DSFA, RVT-Eintrag, Risiko-Register (R-0002-Bezug), TOMs und Control-Mapping
  laufen über `compliance-director`/`dsgvo-auditor`/`iso27001-auditor` in Phase 3.

**Phase-1-Gate „Compliance-Risiko grob benannt": erfüllt — Einstufung HOCH.**

### 7.1 Sechs Gate-Bedingungen des `compliance-director` (verbindlich)

Das Sequenzierungs-Gate (Abschnitt 6) wird **nur unter diesen sechs Bedingungen**
mitgetragen:

1. **Nur synthetische Daten bis zur Gate-Freigabe** — auch in Fixtures, Seeds und
   Demo-Daten; **keine** echten Namen/Adressen/Zählernummern (verstärkt DS-11,
   OSS-Publikation).
2. **PII-Spalten-Kommentare ab der ersten Migration** — jede PII-Spalte trägt
   `COMMENT ON COLUMN … pii=true; grundlage=…; retention=…` (DB-Rule).
3. **PII-Migrationen nur nach Review** durch `database-lead` **+**
   `compliance-director`.
4. **Abgeschlossene DSFA ist Teil des Ingest-Gates** (Art. 35, DS-05).
5. **Consent-Enforcement + DE-Only-Hosting + AVV/TIA** gehören in **dasselbe**
   Ingest-Gate (DS-03/DS-04, DS-09).
6. **Technische Durchsetzung** — **kein verdrahteter Prod-Datenpfad** auf PII-/
   Verbrauchstabellen, solange das Gate offen ist.

### 7.2 Fünf rote Linien für Phase 2 (verbindliche Design-Constraints)

Wörtlich zu übernehmende Constraints für den Phase-2-Schema-Entwurf
(`technical-director`/`database-lead`/`security-lead`):

1. **Keine PII-Spalte in Messwert-/verbrauchsführenden Tabellen**; PII nur im
   Identitäts-Namensraum; jede PII-Spalte kommentiert.
2. **Stabiler Pseudonym-Außenschlüssel**; Export ohne Klartext-PII-Join; **keine
   natürlichen Identifikatoren als Schlüssel**.
3. **Strukturelle Lösch-/Sperrbarkeit** (Art. 17/18); Krypto-Shredding zulässig;
   **Sperre als Datenzustand**.
4. **Anschlussnutzer-Beziehung + Datenklasse „Abrechnungsminimum vs.
   Detailverbrauch" + Consent-Status-Slot** als **First-Class-Schema-Bürger**.
5. **Feld-Verschlüsselung für direkt identifizierende PII**, **TR-02102-Transport**,
   **Identitäts-Namensraum physisch separierbar** (kein cross-namespace-Hart-FK von
   Verbrauch in Identität).

### 7.3 Phase-3-Vorschau (`compliance-director`)

Erwartete Phase-3-Deliverables (durch `compliance-director` / `dsgvo-auditor` /
`iso27001-auditor`, **vor** Implementation):

- **DSFA** (Art. 35) — voraussichtlich **erforderlich** (Haushalts-Verbrauchsprofile,
  hohe Auflösung).
- **RVT-Eintrag** (Art. 30, DS-06) — ESZ-Verarbeitung als Sub-Verfahren.
- **TOMs** (Art. 32, DS-10) — Trennung, Feld-Verschlüsselung, TR-02102.
- **R-0002-Scharfschaltung** (PII-Hosting DE-Only, DS-09), **ggf. R-0004** (neu).
- **AVV/TIA** (Auftragsverarbeitung/Drittland-Transfer-Abwägung, DS-09).
- **ISO-Controls:** A.5.12/A.5.13 (Klassifizierung/Kennzeichnung), A.5.34
  (Privacy/PII), A.8.10 (Löschung), A.8.11 (Data Masking), A.8.12 (DLP),
  A.8.24 (Kryptografie).

---

## 8. Fragen-Status nach Phase 1

### 8.1 Entschieden (User, 2026-07-09)

- **F1 — Consent-Scope: B** — eigener ADR + Struktur-Slot in ADR-0004; Consent-ADR
  vor Endkunden-Go-Live, nicht zwingend vor dem ADR-0004-Schema.
- **F2 — Anschlussnutzer: A** — Beziehung **strukturell in v1**. (Enforcement-
  Zeitpunkt der DS-07-Sichttrennung bleibt offen → 8.2.)
- **F3 — Sizing: MITTEL** — 1.000–10.000 Endkunden, 15-Min-Intervall → hunderte Mio.
  Messwerte/Jahr; M3 und Chunk-/Index-Design darauf ausgelegt (Abschnitt 3, 6.1).
- **F4 — Sequenzierung: Schema jetzt, PII-Ingest-Gate** erst nach ADR-0002 +
  ADR-0003 + DSFA + Consent-Enforcement + DE-Hosting/AVV (Abschnitt 6, 7.1).
- **F5 — PII-Trennung: A** — Schema-Namensraum in v1, **Vault-Option (B) offen**
  gehalten (physisch separierbar, rote Linie 5 in 7.2).
- **F6 — Verschlüsselung: Feld-Verschlüsselung für direkt identifizierende PII** in
  v1 (rote Linie 5 in 7.2), TR-02102-Transport.
- **F7 — Energieträger v1: Strom + Wärme/Kälte + Gas/Öl/Biomasse** (alle
  ESZ-Energieträger); **Wasser NICHT in v1** (Abschnitt 4.1).

### 8.2 Weiterhin offen — mit Klärungsauftrag

- **Mieter-/Vermieter-Konstellationen im Pilot (aus F2):** derzeit **unklar**. Die
  Anschlussnutzer-Beziehung ist strukturell in v1, aber der **Zeitpunkt der
  scharfen DS-07-Durchsetzung** (ABAC „Abrechnungsminimum") wird **mit dem ersten
  Mieter-Projekt** entschieden. *Klärungsauftrag:* Pilot-Portfolio auf
  Mehrparteien-/Mietobjekte prüfen; sobald ein Mieter-Fall absehbar ist,
  DS-07-Enforcement mit `access-control-engineer` + `compliance-director` scharf
  schalten.
- **Retention-Horizont der Rohmesswerte (aus F3):** für Phase 2 zu präzisieren —
  bestimmt Archivierungs-/Kompressions-Ersatz-Strategie (nur Apache-2-Features:
  Materialized Views + `pg_cron` + eigene Lösch-Jobs).

---

## 9. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Ingestion, Baseline, Einsparberechnung und BAFA-Export bauen auf **einer**
  konsistenten Datengrundlage auf.
- DS-10-Trennung und DS-07-Betroffenen-Trennung sind **ab dem Kern-Schema**
  verankert — spätere ABAC-Policy und Audit-Log greifen ohne PII-Nach-Migration.

### Negativ
- Höherer Vorlaufaufwand (getrennter Identitäts-Namensraum, Anschlussnutzer-
  Beziehung) vor sichtbarem Endnutzer-Feature.
- Phase 3 (Compliance-Review inkl. DSFA) ist **zwingend** und verlängert die
  Time-to-Implementation.

### Neutral
- Setzt Fachschlüssel-/Trennungs-Konventionen, an die alle Folge-ADRs gebunden sind.

---

## 10. Folgeaufgaben

- [x] **User-Freigabe Phase 1** — F1–F7 entschieden (Abschnitt 8.1).
- [x] `compliance-director`: **Phase 1 ohne Veto**; Risiko-Flag **hoch geschärft**;
      sechs Gate-Bedingungen (7.1) + fünf rote Linien (7.2) + Phase-3-Vorschau (7.3).
- [x] **Roadmap-Fortschreibung** (`production/roadmap.md`, rev. 4): ADR-0004 nach
      „Jetzt: in Arbeit, Phase 2 Design"; Consent-ADR als eigener Punkt **vor
      Endkunden-Go-Live**; Sequenz-Gate „kein Prod-PII-Ingest vor
      0002+0003+DSFA+Consent+DE-Hosting/AVV" vermerkt.
- [x] **Übergabe an `technical-director` (Phase 2):** konkreter Schema-Entwurf
      (Entitäten/Spalten, Hypertable-Parameter, PII-Trennungs-/Krypto-Architektur
      mit `security-lead`, Messwert-Modell mit `timescale-engineer`/`database-lead`),
      Anhang-A-Mapping in Schema überführen — **unter Beachtung der fünf roten
      Linien (7.2)**; Retention-/Archivierungs-Strategie klären (8.2).
      **Erledigt: Teil B (Abschnitte 11–19) + Schema-Skizze
      `schemas/database/adr-0004-kern-datenmodell.md`.**
- [x] **Teil-B-Lead-Review:** `database-lead` (Schema/Constraints/Index) +
      `timescale-engineer` (Hypertable/Chunk/Archiv) **abgeschlossen, Voten
      eingearbeitet** (Abschnitt 20).
- [ ] **User-Freigabe Phase 2** (offene Punkte O1–O5 in 20.1); danach Phase 3
      (Compliance) und `/add-migration`.
- [ ] **Retention-/Archiv-Strategie präzisieren** (8.2, O2): Roh-Messwert-Horizont
      festlegen (bestimmt `drop_chunks`-Fenster; Detail-ADR/`/retention-run`).
- [ ] **Phase 3 (zwingend):** `compliance-director` + `dsgvo-auditor`
      (DSFA/RVT/TOMs/Betroffenenrechte) + `iso27001-auditor` (Annex-A-Mapping) **vor**
      Implementation; DSFA ist Teil des Ingest-Gates (7.1, Bedingung 4).
- [ ] **Klärungsaufträge (8.2):** Mieter-Fälle im Pilot; Retention-Horizont
      Rohmesswerte.

---

## Anhang A — Anforderungs-Mapping (Scope → Entität, Phase-1-Skizze)

> Nachweisgrundlage für Metrik M1. Verfeinerung auf Spaltenebene = Phase 2.

| Anforderung | Quelle | Entität / Slot in ADR-0004 |
|-------------|--------|-----------------------------|
| Messkonzept je Endkunde, 7 Pflichtinhalte, versioniert | TB-01 | **Messkonzept** (versioniertes Fachobjekt, Pflichtfelder + Historie) |
| Energieträger Strom + Wärme/Kälte + Gas/Öl/Biomasse (F7; kein Wasser) | TB-01 | **Energieträger-Dimension** je Zähler/Messgröße (energieträger-übergreifendes Modell) |
| Baseline-Nachweis (Mittelwert letzte 3 Jahresabrechnungen; Begründung bei < 3) | TB-02 | **Baseline-Slot** am Messkonzept + Beleg-Referenz + Begründungsfeld (Berechnung = ADR-0006) |
| Geräteerkennungs-Quoten 20→40 % | TB-05 | **Gerätegruppe** (Struktur; Quoten-Report = später) |
| Auflösung ≥ 1 Messwert/Tag, Vollständigkeit je Förderjahr | DE-02 / TB-09 | **Messwert-Hypertable** + Zeit-Index (Lücken-Report = ADR-0005) |
| Vier Export-Kategorien nachvollziehbar | DE-03 | Join-Pfad Rohdaten↔Baseline-Slot↔Einflussgrößen↔Einspardaten (Export = ADR-0007) |
| Von wiss. Auswertung ausnehmbar | DE-04 | **Flag** am Endkunden / Pseudonym-Datensatz |
| Anschlussnutzer ≠ Endkunde | DS-07 | **Anschlussnutzer-Beziehung** + Datenklasse „Abrechnungsminimum" |
| PII getrennt + verschlüsselt von Verbrauchsdaten | DS-10 | **Getrennter Identitäts-Namensraum** + Surrogat-/Pseudonym-FK |
| PII-Hosting DE-Only | DS-09 / R-0002 | Struktur separat platzier-/verschlüsselbar (M5; Deployment = ADR-0005) |
| Einwilligung Voraussetzung der Aufnahme | DS-03/DS-04, Kap. 3.3 | **Consent-Referenz-/Status-Slot** am Endkunden (volle Mechanik = eigener ADR) |
| Löschung/Sperrung (Art. 18), Anonymisierung | DS-08 | Sperr-/Status-Feld als Datenzustand (Lösch-/Anonymisierungs-Job = späterer ADR) |

---

# Teil B — Phase-2-Design (Status: proposed)

> **Reifegrad:** Phase-2-Output (`technical-director`, Design-Owner). Jede
> Entscheidung mit **einer verworfenen Alternative**. Umgesetzt unter Beachtung
> der **fünf roten Linien (7.2)** — Konformitäts-Matrix in **Anhang C**. Die
> DB-Schema-Skizze (ERD + DDL-Entwurf) liegt in
> `schemas/database/adr-0004-kern-datenmodell.md`. **Keine Migration** in Phase 2.

## 11. Design-Prinzipien (Ableitung der roten Linien)

1. **PII-Isolation:** direkt identifizierende PII **nur** in `identity`; Fach-/
   Messtabellen führen ausschließlich **Pseudonym-Surrogate** (rote Linie 1/2).
2. **Physische Separierbarkeit:** **kein** cross-namespace-Hart-FK
   `energy ↔ identity`; Kopplung nur logisch über `pseudonym_id` (rote Linie 5).
3. **Zustand statt Zerstörung:** Sperre/Löschung sind **Datenzustände** bzw.
   Krypto-Shredding; Fachhistorie append-only, audit-ready (rote Linie 3).
4. **First-Class-Datenschutz-Struktur:** Anschlussnutzer-Beziehung, Datenklasse,
   Consent-Status als eigenständige Schema-Bürger (rote Linie 4).
5. **Krypto at rest:** Feld-Verschlüsselung direkt identifizierender PII, per-
   Subjekt-Schlüssel; TR-02102-Transport (rote Linie 5).

## 12. Schema-Namensräume

**Entscheidung:** Vier PostgreSQL-Schemas — `identity` (PII), `energy`
(Fachdaten), `measurement` (Messwert-Hypertable), `audit` (reserviert ADR-0003).
Die PII-/Fach-/Zeitreihen-Trennung ist damit **per Schema-Inspektion belegbar**
(M2) und `identity` als Namensraum **physisch abtrennbar** (M5, DS-09).

**Warum vier statt drei (Messwerte in eigenem Schema):** die Zeitreihe hat ein
grundlegend anderes Betriebs-/Retention-/Archiv-Profil (Hypertable, `drop_chunks`,
S3-Export) als die relationalen Stammdaten. Ein eigenes `measurement`-Schema hält
diese Grenzen sauber und erlaubt separate Rechte-/Backup-/Archivpfade.

**Verworfene Alternative:** **Ein einziges Schema (`public`/`energy`) für PII +
Fachdaten + Messwerte.** *Contra:* macht die DS-10-Trennung **nicht** per
Schema-Inspektion nachweisbar, verhindert die physische Separierbarkeit von
`identity` (rote Linie 5) und vermischt drei völlig verschiedene Betriebsprofile.
Verletzt rote Linie 1 direkt.

## 13. Entitäten & Schlüsseldesign

### 13.1 Pseudonym-Design (rote Linie 2)

**Entscheidung:** Jeder Endkunde und jeder Anschlussnutzer erhält einen **stabilen,
opaken Surrogat-Schlüssel** = `energy.endkunde.id` bzw. `energy.anschlussnutzer.id`
(**UUIDv7**, app-seitig erzeugt). Dieser Pseudonym-Schlüssel ist der **einzige
Außenschlüssel** für alle Fachdaten, Messwerte und Exporte (DE-04/TB-08:
Pseudonym-Export **ohne** PII-Join, M6). Das **Re-Identifikations-Mapping**
Pseudonym ↔ Klartext-PII existiert **ausschließlich** in
`identity.endkunde_pii.pseudonym_id` / `identity.anschlussnutzer_pii.pseudonym_id`
— als **logische Spalte ohne DB-FK** (rote Linie 1/5). **Keine natürlichen
Identifikatoren** (Name, Zählernummer, E-Mail) als Schlüssel.

**Verworfene Alternative:** **Natürlicher/deterministischer Pseudonym-Schlüssel**
(z. B. Hash der Zählernummer oder fortlaufende Kundennummer). *Contra:* Hash
natürlicher Identifikatoren ist bei bekanntem Wertebereich rückrechenbar
(Verkettbarkeit); fortlaufende Nummern leaken Reihenfolge/Menge. Verletzt rote
Linie 2 („keine natürlichen Identifikatoren als Schlüssel").

### 13.2 Entitäten-Überblick

| Entität (Schema) | Zweck / Scope-Bezug | Datenschutz-Notiz |
|---|---|---|
| `identity.endkunde_pii` | Klartext-PII des Vertragspartners (verschlüsselt) | **PII**, feldverschlüsselt, `pii_status` |
| `identity.anschlussnutzer_pii` | Klartext-PII des Datensubjekts (DS-07) | **PII**, feldverschlüsselt |
| `identity.subjekt_schluessel` | per-Subjekt-DEK (Krypto-Shredding-Anker) | Schlüsselmaterial (gewrappt) |
| `energy.endkunde` | Pseudonym-Anker + `verarbeitungs_status` + Consent-Slot + DE-04-Flag | **keine PII** |
| `energy.anschlussnutzer` | Pseudonym des Datensubjekts | **keine PII** |
| `energy.nutzungsverhaeltnis` | **DS-07-Beziehung**: Endkunde↔Anschlussnutzer↔System, **Datenklasse** (Abrechnungsminimum/Detailverbrauch), temporal (Mieterwechsel) | ABAC-Steuergröße (rote Linie 4) |
| `energy.system` | System/Messstelle, **Systemgrenze** (TB-01), Beschreibung | — |
| `energy.zaehler` | Zähler, **Gerätetyp** (TB-01), **Energieträger** (F7), Geräte-Referenz, **`status` (aktiv/stillgelegt, kein Hard-Delete)** | `geraete_referenz` = Quasi-Identifier |
| `energy.messkanal` | Serie je Zähler: **Messgröße/Einheit/Art**, OBIS — trägt die energieträger-übergreifende Dimension; **`kanal_key int` (kompaktes Hypertable-Surrogat)**, **`status`** | — |
| `energy.messkonzept` (+`_version`) | **versioniertes Fachobjekt je Endkunde** (TB-01, 7 Pflichtinhalte, versionsweit), Typ (vereinfacht/Standard/alternativ), Änderungshistorie | append-only Versionen |
| `energy.messkonzept_version_energietraeger` | **Energieträger + Baseline-Slot (TB-02) je Energieträger** einer Messkonzept-Version (Link-Tabelle, database-lead-Votum 3) | append-only |
| `energy.geraetegruppe` (+`_kanal`) | **TB-05-Vorbereitung**: Zuordnung Verbrauchsanteile (Quoten-Report = später) | — |
| `measurement.messwert` | **Hypertable** Roh-Zeitreihe (Abschnitt 14) | pseudonym, keine PII |

**Systemgrenze — Doppelung bewusst:** `energy.system.systemgrenze` ist die
**strukturelle/operative** Grenze (Anker der Zähler); die **dokumentierte,
versionierte** Systemgrenze (TB-01-Pflichtinhalt, förder-vorlegbar) liegt im
`messkonzept_version`. Beide Sichten sind gewollt getrennt (Betrieb vs. Nachweis).

**Messkonzept-Baseline — Strukturänderung (database-lead-Votum 3, eingearbeitet):**
Die TB-01-Pflichtinhalte **Energieträger** und der TB-02-**Baseline-Slot** werden
**nicht** als skalare `baseline_*`-Spalten am `messkonzept_version` geführt, sondern
in der Link-Tabelle `energy.messkonzept_version_energietraeger`
(`energietraeger`, `baseline_wert`, `_einheit`, `_methode`, `_begruendung`,
`_beleg_ref`). Grund: bei **Mehr-Energieträger-Messkonzepten** wäre die
Baseline-Zuordnung bei skalaren Feldern **mehrdeutig**. Die übrigen fünf
Pflichtinhalte (Systemgrenze, Systembeschreibung, Bereinigungsverfahren,
Messgeräte-Wahl, Geräteerkennungs-Verfahren) bleiben versionsweit am
`messkonzept_version`.

**Sequenzierung ADR-0002/0003 (Abschnitt 6):** Principal-Referenzen (Keycloak-`sub`)
werden **nicht** als Spalte in diesem Kern-Modell hart verdrahtet — sie kommen mit
ADR-0002. Die **ABAC-relevanten Attribute** (`nutzungsverhaeltnis.datenklasse`,
Beziehung, `von_wiss_auswertung_ausgenommen`) sind vorhanden, damit ADR-0002 sie
**durchsetzen** kann. Zeitstempel UTC, Fachhistorie append-only → **audit-ready**
für ADR-0003.

## 14. Messwert-Hypertable

**Entscheidung:** **Ein** energieträger-übergreifendes Hypertable
`measurement.messwert`, das die **Serie** über ein **kompaktes Integer-Surrogat
`messkanal_key`** (nicht die 16-Byte-UUID) referenziert. Der `messkanal` trägt
Messgröße, Einheit, Art (kumulativ/intervall) und OBIS — damit liegt die
energieträger-spezifische Dimension **einmal je Serie** statt in hunderten Mio.
Zeilen. Spalten: `messkanal_key` (int), `ts` (UTC, Zeit-Dimension), `wert`
(**`numeric`**, s. u.), `qualitaet` (gemessen/geschätzt/korrigiert/ersatzwert),
`herkunft` (ingest_live/backfill/manuell/import_altsystem), `erfasst_at`
(Schreibzeit, `created_at`-Analog, **≠** `ts`; dokumentierte Namensabweichung von
der Migrations-Rule).

**Integer-Surrogat statt UUID im Hypertable (timescale-Finding 1, eingearbeitet):**
`energy.messkanal` behält den UUID-PK (`id`) als Außenschlüssel, bekommt aber
zusätzlich `kanal_key integer GENERATED ALWAYS AS IDENTITY UNIQUE`. Das Hypertable
speichert nur `messkanal_key` — bei 10^8–10^9 Zeilen spart das **4 statt 16 Byte**
je Zeile in Heap **und** Unique-Index (Cache-/I/O-relevant); die Auflösung
UUID↔`kanal_key` ist im Ingest cachebar. **Verworfen:** UUID direkt im Hypertable
(spürbar größerer Index/Heap ohne Nutzen — Messwerte werden nie einzeln per UUID
adressiert).

**Wert-Typ (S1, eingearbeitet):** **`numeric` mit fester Precision/Scale**
(Skizze `numeric(18,3)`) statt `double precision`. Die **DE-03-Nachweisbarkeit**
(exakte, rundungsfreie Einsparberechnung gegenüber BAFA) schlägt die CPU-Kosten;
der Flaschenhals ist ohnehin I/O + Index-Pflege, nicht Arithmetik. **Finale Scale
je feinster Messgröße = Phase-4-Punkt** mit `postgres-engineer` (P4-1).

**Verworfene Alternative:** **Typisierte Tabellen je Energieträger**
(`strom_messwert`, `waerme_messwert`, …). *Contra:* Schema-Sprawl, jeder neue
Energieträger = neue Tabelle + Ingest-/Query-Verzweigung; energieträger-
übergreifende Vollständigkeits-Queries (DE-02 über **alle** Zähler) brauchen
`UNION` über N Tabellen; ein einziger Hypertable-Retention-/Archiv-Pfad wird zu N
Pfaden. Der marginale Vorteil typ-spezifischer Spalten wiegt das nicht auf.
*(Sub-Variante verworfen: Messgröße/Einheit als Diskriminator-Spalten direkt im
Hypertable — denormalisiert Einheit in jede Zeile; die Serien-Metadaten gehören
einmalig auf den Kanal.)*

**Zählerstand (kumulativ) vs. Verbrauch (Intervall) — Entscheidung:** Wert wird
**„as delivered" gespeichert**; `messkanal.art` sagt, wie er zu lesen ist. **Keine
verlustbehaftete Umrechnung beim Ingest.** *Begründung:* (a) **Idempotenz** —
ein erneut gesendeter kumulativer Zählerstand ist idempotent (`ON CONFLICT`), eine
beim Ingest berechnete Delta-Differenz ist es **nicht** (Reihenfolge-/Backfill-
Abhängigkeit); (b) **DE-02** verlangt „sämtliche **Zählerstände**" → kumulative
Stände müssen erhalten bleiben; (c) Backfill/Lückenfüllung bleibt sauber. Die
Verbrauchs-Deltas werden **downstream** (Baseline/Aggregation, ADR-0006) aus den
Rohständen abgeleitet.

**Verworfene Alternative:** **Beim Ingest alles auf Intervall-Verbrauch
normalisieren.** *Contra:* zerstört Idempotenz, verliert die DE-02-Zählerstände,
macht Backfill-Korrekturen fehleranfällig (Delta hängt vom Nachbarwert ab).

**Chunk-Intervall (timescale-Votum 1, bestätigt):** Start **`INTERVAL '7 days'`**
(nur Zeit-Partitionierung). Sizing-Überschlag (F3): ~hunderte Mio. Messwerte/Jahr ≈
Größenordnung 15k Kanäle × 96 Werte/Tag ≈ ~1,4 Mio. Zeilen/Tag → ~10 Mio.
Zeilen/7-Tage-Chunk. **Phase-4-Benchmark-Faustformel (`timescale-engineer`, P4-3):**
heiße Chunks (**Heap + Index**) ≤ **10–25 % `shared_buffers`**; **beide Sizing-Enden**
(0,1 und 1 Mrd. Zeilen/Jahr) testen; p95 für **30/90/365-Tage-Fenster** **und**
Ingest-Durchsatz messen (M3: Backfill ≥ 50.000 Messwerte/s, p95-Batch < 200 ms);
**Backfill in zwei Szenarien getrennt** (Spätankunft in den letzten 1–2 Chunks vs.
Masse-Backfill über kalte Chunks; jeweils **ON-CONFLICT-Pfad**, nicht `COPY`). Bei
RAM-Knappheit ist **fillfactor/Chunk-Größe** die Stellschraube, **nicht**
Space-Partitioning (s. u.).

**Space-Partitioning — geprüft und verworfen (timescale-Finding 3):** Eine
Hash-Space-Dimension (z. B. auf `messkanal_key`) ist **nicht** die Antwort auf
RAM-Druck — sie erhöht die Chunk-Anzahl/Planungskosten und bringt bei
Single-Node-Einzelplatte keinen Durchsatzvorteil; Timescale empfiehlt sie nur für
Multi-Disk-/verteilte Szenarien, die hier nicht vorliegen. **Nur Zeit-Partitionierung.**

**Index/Unique:** **`UNIQUE (messkanal_key, ts DESC)`** — enthält die
Partitionsspalte `ts` (Timescale-Pflicht für Unique-Index), ist zugleich der
primäre Zugriffspfad (Serie + Zeitbereich) **und** das idempotente Upsert-Ziel
(`INSERT … ON CONFLICT (messkanal_key, ts)` — **ADR-0005-Vorbereitung**). **Kein
globaler `ts`-Zweit-Index** (timescale-Votum 2): systemweite Betriebs-Sichten
gehören ins Rollup, nicht als teurer Zusatz-Index auf dem Schreibpfad (M3).
Zusätzlich **`fillfactor = 90`** auf `messwert` (timescale-Finding 2) für
**HOT-Updates bei Backfill-Korrekturen** (`ON CONFLICT DO UPDATE` ohne Index-Churn).
**Kein Surrogat-UUID-PK** (begründete Abweichung von der PK-Rule).

**FK-Entscheidung (S3, mitgetragen unter drei Bedingungen — database-lead-Votum 2):**
**Kein** DB-FK `messwert.messkanal_key → energy.messkanal` (Durchsatz M3), aber nur
mit: (a) **täglichem Orphan-Check-Job mit Alerting** (nicht nur Logging) auf
verwaiste `messkanal_key`; (b) `energy.zaehler` und `energy.messkanal` erhalten
eine **`status`-Spalte** (`aktiv`/`stillgelegt`) und werden **nie hart gelöscht**
(sonst könnten Messwerte referenzielle Waisen werden) — **neue Spalten, ergänzt**;
(c) der **Ingest-Service (ADR-0005) validiert den Kanal vor dem Insert**.
Alternative „harte FK auf den Hypertable" verworfen (per-Zeile-Lookup bremst
50k/s-Ingest).

**Archivierungs-Strategie (Kompressions-Ersatz, NUR Apache-2; timescale-Votum 4/5):**
natives Compression/Continuous-Aggregate/Retention-Policy sind **TSL-only und
verboten** (`dependencies.md`). Ersatz-Konzept (Detail = Phase 4, P4-4/P4-5):
1. **Inkrementelles Rollup statt Full-Refresh-MV:** eine **normale Tabelle mit
   Watermark**; ein **`pg_cron`**-Job verarbeitet **nur neue, abgeschlossene
   Zeitfenster** (`INSERT … SELECT time_bucket(…) … ON CONFLICT DO UPDATE`) plus ein
   **Reprocessing-Fenster** für Spätankünfte. Ein Full-Refresh-Materialized-View
   skaliert bei hunderten Mio. Zeilen **nicht** und ist damit verworfen.
2. **Cold-Archiv mit Konsistenz-Gate:** Chunks jenseits des Retention-Horizonts
   werden **exportiert** (Chunk-Detach bzw. `COPY`/Parquet → S3, DE-Only) und **erst
   danach** per **manuellem `drop_chunks()`** (Apache-2, **erlaubt**) entfernt.
   **Zwingend vor `drop_chunks()`:** (i) deutlicher **Sicherheitsabstand** zwischen
   Backfill-Gnadenfrist und Export/Drop; (ii) **Row-Count-/Checksum-Abgleich
   Chunk ↔ S3-Export**; (iii) **Export-Nachweis** als Verfahrensschritt in
   `compliance/audit-reports/`. Der Lösch-Job trägt zugleich die DSGVO-Sperrfristen-
   Logik. **`move_chunk()`/`reorder_chunk()` sind TSL → nicht verwendbar;**
   automatisches `add_retention_policy` (TSL) durch den eigenen Job ersetzt.
   **Retention-Horizont bleibt compliance-pflichtig (Gate, offener Punkt 20).**

## 15. Feld-Verschlüsselung PII (rote Linie 5, F6)

**Entscheidung:** **App-seitige Envelope-Verschlüsselung** mit **AES-256-GCM**
(authenticated) je PII-Feld. Pro Subjekt genau **ein DEK**; der DEK wird von einem
**KMS-Master-Key gewrappt** und in `identity.subjekt_schluessel` abgelegt
(`wrapped_dek`, `kms_key_id`, `alg_version` für Krypto-Agilität). Chiffrat als
`bytea` (`ciphertext||nonce||tag`). Transport TR-02102/TLS. **Klartext-Schlüssel
liegt nie in der DB.**

**Krypto-Shredding-Vorbereitung (rote Linie 3):** Schlüssel **je Subjekt** →
Art.-17-Löschung = DEK vernichten (`key_state='geschreddert'`) → alle Chiffrate
des Subjekts werden **unwiederbringlich**, ohne dass Fachdaten/Messwerte angefasst
werden müssen.

**Verworfene Alternative:** **`pgcrypto` (DB-seitige `pgp_sym_encrypt`).** *Contra:*
der Schlüssel muss der DB-Session bekannt sein → erscheint in SQL/`pg_stat_statements`/
Logs, DBA sieht den Klartext-Pfad, kein sauberes per-Subjekt-Key-Management für
Krypto-Shredding, Rotation umständlich. App-seitig hält den Schlüssel **außerhalb**
der DB (kleinerer Blast-Radius, DBA-Kompromittierung ≠ PII-Klartext) und stützt die
physische Separierbarkeit (rote Linie 5). *(`pgcrypto`/Core-`gen_random_uuid()`
darf für Nicht-Shredding-Zwecke aktiv bleiben, aber **nicht** für PII-Feld-Krypto.)*

## 16. Lösch-/Sperr-Semantik (rote Linie 3, DS-08)

- **Art. 17 (Löschung) = Krypto-Shredding + Anonymisierung:** DEK des Subjekts in
  `identity.subjekt_schluessel` vernichten → PII-Chiffrate unlesbar; `pii_status`
  und `pseudonym_id`-Mapping in `identity` neutralisieren → **Re-Identifikation
  unmöglich**. Die pseudonymen **Fach-/Messdaten** (`energy`, `measurement`)
  **bleiben erhalten**, sind aber jetzt **anonym** → für den BAFA-Nachweis
  weiter nutzbar. Erfüllt „PII weg, Fachdaten anonym erhalten" und DS-08
  („löschen **oder** anonymisieren"). `energy.endkunde.verarbeitungs_status =
  geloescht`.
- **Art. 18 (Sperre) = Datenzustand:** `verarbeitungs_status = gesperrt` (bzw.
  `pii_status = gesperrt`). Daten bleiben **vollständig** erhalten (Schlüssel
  intakt), die Verarbeitung wird durch die **ABAC-Policy (ADR-0002)** blockiert,
  die diesen Zustand liest. **Keine** physische Löschung — für Aufbewahrungspflichten
  (DS-08: Sperrung statt Löschung).
- **Warum `drop_chunks` NICHT für Art. 17 taugt:** `drop_chunks` löscht
  **zeitbasiert** (alle Serien eines Zeitfensters), nicht subjektbezogen. Die
  **subjektbezogene** Löschung läuft daher ausschließlich über das Krypto-Shredding
  der PII; die Zeitreihe wird dadurch anonym und darf bleiben. `drop_chunks` dient
  **nur** der zeitbasierten Archiv-/Retention-Bereinigung (Abschnitt 14).

## 17. API-Abgrenzung — Stammdaten-CRUD **nicht** in diesem ADR

**Entscheidung:** Die Stammdaten-CRUD-API (Endkunde/System/Zähler/Messkonzept
anlegen/ändern) ist **NICHT** Teil von ADR-0004 und bekommt **hier keine
OpenAPI-Datei**. Sie wird als **eigenes Arbeitspaket nach ADR-0002** geführt.

**Begründung:** Jeder schreibende/lesende Zugriff auf Endkunden-/Anschlussnutzer-
Daten ist **AuthZ-/ABAC-abhängig** (DS-07 Abrechnungsminimum vs. Detailverbrauch;
DS-10 PII-Zugriff; Sperr-Zustand aus Abschnitt 16). Eine API **vor** ADR-0002 zu
bauen hieße, einen **ungeschützten Datenpfad** auf PII-/Verbrauchstabellen zu
schaffen — das verletzt **Gate-Bedingung 6** (kein verdrahteter Prod-Datenpfad auf
PII bis Gate-Freigabe, 7.1). ADR-0004 liefert daher **nur das Datenmodell** plus die
**idempotenten Messwert-Schlüssel** als Anschluss für die Ingestion (ADR-0005).

**Verworfene Alternative:** **Stammdaten-CRUD gleich mit modellieren.** *Contra:*
erzeugt einen PII-berührenden API-Pfad ohne AuthZ/Audit/DSFA, kollidiert mit dem
harten Ingest-Gate und vermischt Datenmodell mit Zugriffskontrolle.

## 18. Phase-2-Gates (Workflow `2-design`)

- [x] **„ADR review-ready"** — auf `proposed` ausgebaut (Teil B, Abschnitte 11–20),
  Entscheidungen je mit verworfener Alternative, DB-Schema-Skizze vorhanden
  (`schemas/database/adr-0004-kern-datenmodell.md`). **Beide Lead-Reviews
  (`database-lead` + `timescale-engineer`) abgeschlossen und eingearbeitet**
  (Abschnitt 20) — Gate **belegt**.
- [x] **„Breaking Changes identifiziert"** — **keine.** Greenfield: kein
  bestehendes Schema, keine Consumer, keine API-Vorversion. Das idempotente
  Messwert-Upsert-Ziel `(messkanal_key, ts)` wird **neu** eingeführt (ADR-0005 baut
  darauf auf, ohne Bruch).
- [x] **„DSGVO-relevante Datenfelder markiert"** — **diesmal vorhanden.**
  Vollständige PII-/Quasi-Identifier-Liste mit Rechtsgrundlage-Platzhaltern in
  **Anhang B**; jede PII-Spalte trägt bereits den `COMMENT ON COLUMN … pii=true;
  grundlage=…; retention=…` in der DDL-Skizze (M2, Gate-Bedingung 2).

## 19. Konsequenzen-Update

**(positiv):** DS-10-Trennung, DS-07-Beziehung, Pseudonym-Export (DE-04) und
Krypto-Shredding (Art. 17) sind **strukturell verankert** — die spätere ABAC-Policy
und das Audit-Log greifen ohne PII-Nach-Migration.
**(negativ):** vier Namensräume + Envelope-Krypto erhöhen die anfängliche Komplexität
und den Betriebsaufwand (KMS, Key-Lifecycle); je-Schema-duplizierte Trigger-Funktionen
sind bewusste Redundanz für die Separierbarkeit.
**(neutral):** setzt Schlüssel-/Trennungs-Konventionen, an die ADR-0005/0006/0007
gebunden sind.

## 20. Lead-Review-Ergebnis & konsolidierte Offene-Punkte-Liste (User-Freigabe)

**Beide Phase-2-Lead-Reviews abgeschlossen (2026-07-09), alle Voten eingearbeitet.**

**`database-lead` — Voten (eingearbeitet):** S1 `numeric(18,3)` statt `double
precision` (§14); S3 FK-los unter drei Bedingungen — Orphan-Check+Alert, `status`
auf Zähler/Messkanal + kein Hard-Delete, Ingest-Validierung (§14); S8
Link-Tabelle `messkonzept_version_energietraeger` (§13.2); Overlap =
`EXCLUDE USING gist` + `btree_gist`; `updated_at`-Trigger je Schema (dupliziert,
rote Linie 5); S4 UUIDv7 app-seitig + kein DB-DEFAULT + gemeinsame ID-Utility.
DDL-Findings: `UNIQUE (crypto_key_id)` je PII-Tabelle (1 DEK je Subjekt),
PII-Kommentare `anschlussnutzer_pii.pseudonym_id`/`.kontakt_enc`, partielle
ABAC-Indizes `WHERE gueltig_bis IS NULL`, `erfasst_at`-Abweichung dokumentiert.

**`timescale-engineer` — Voten (eingearbeitet):** 7-Tage-Chunks bestätigt +
Benchmark-Faustformel (§14); Index-Minimalität bestätigt (kein globaler ts-Index);
Backfill zwei Szenarien; S6 **inkrementelles Rollup** statt Full-Refresh-MV +
Export-Konsistenz-Gate (§14); Apache-2-Konformität bestätigt. Findings:
**Integer-Surrogat `kanal_key`** im Hypertable (§14), **`fillfactor=90`**,
**Space-Partitioning geprüft & verworfen** (§14).

### 20.1 Offene Punkte für die User-Freigabe (Status `proposed`)

| # | Offener Punkt | Art | Zuständig / Zeitpunkt |
|---|---------------|-----|------------------------|
| O1 | **Policy-Nachzug `dependencies.md`:** Verbotsliste um `move_chunk`, `reorder_chunk`, `compress_chunk`, `decompress_chunk` erweitern (TSL/compression-gebunden) | Policy-Datei | **Koordinator nach User-Freigabe** (kein Agenten-Direktschreib) |
| O2 | **Retention-Horizont der Rohmesswerte** festlegen (bestimmt `drop_chunks`-Fenster + Archiv-Trigger) | Compliance-Gate | `compliance-director` + User (8.2) |
| O3 | **DS-07-Enforcement-Zeitpunkt** (ABAC „Abrechnungsminimum") | Klärungsauftrag | mit erstem Mieter-Projekt; `access-control-engineer` + `compliance-director` (8.2) |
| O4 | **Phase 3 (zwingend vor Impl.):** DSFA (Art. 35), RVT (Art. 30), Rechtsgrundlagen final (Anhang B), TOMs (Krypto/TR-02102), ISO-Annex-A; `geraete_referenz`-Klassifizierung | Compliance | `compliance-director`/`dsgvo-auditor`/`iso27001-auditor` |
| O5 | **Phase-4-Detailpunkte** (nicht freigabe-blockierend): finale `numeric`-Scale (P4-1), EXCLUDE-Spalten (P4-2), Chunk-Benchmark (P4-3), inkrementelles Rollup (P4-4), Export-Konsistenz (P4-5) | Implementierung | bei `/add-migration` bzw. ADR-0005 |

> **Hinweis:** O1 betrifft eine **Policy-/Rule-Datei** (`.claude/rules/dependencies.md`)
> — sie wird **nicht** in diesem Arbeitspaket editiert; der Koordinator setzt sie
> nach User-Freigabe um. Das Design selbst verwendet **kein** TSL-Feature
> (timescale-Votum 5 bestätigt).

---

## Anhang B — DSGVO-relevante Datenfelder (Gate „DSGVO-Datenfelder markiert")

> Rechtsgrundlagen sind **Platzhalter** — final durch `compliance-director`/
> `dsgvo-auditor` (RVT/DSFA, Phase 3). Alle PII-Felder tragen den
> `COMMENT ON COLUMN`-Pflichtkommentar in der DDL-Skizze.

| # | Feld | Kategorie | Rechtsgrundlage (Platzhalter) | Retention / Löschung |
|---|------|-----------|-------------------------------|----------------------|
| P1 | `identity.endkunde_pii.name_enc` | direkt-PII (verschlüsselt) | Art. 6(1)(b) Vertrag / (a) Einwilligung | Projektlaufzeit + gesetzl.; Sperrung statt Löschung (DS-08); Löschung = Krypto-Shredding |
| P2 | `identity.endkunde_pii.anschrift_enc` | direkt-PII | Art. 6(1)(b) Vertrag | wie P1 |
| P3 | `identity.endkunde_pii.kontakt_enc` | direkt-PII (E-Mail/Tel.) | Art. 6(1)(a) Einwilligung (TB-06) | bis Widerruf/Projektende |
| P4 | `identity.endkunde_pii.pseudonym_id` | **Verkettung** (Re-ID-Mapping) | Art. 32 (TOM) / Verkettbarkeit | an Subjekt gebunden; bei Löschung neutralisieren |
| P5 | `identity.anschlussnutzer_pii.name_enc` | direkt-PII Datensubjekt (DS-07) | Art. 6(1)(f)/(a) | Nutzungsdauer + gesetzl.; Sperrung (DS-08) |
| P6 | `identity.anschlussnutzer_pii.kontakt_enc` | direkt-PII | Art. 6(1)(a) | bis Widerruf |
| P7 | `identity.subjekt_schluessel.wrapped_dek` | Schlüsselmaterial | Art. 32 (Verschlüsselung) | an Subjekt gebunden; Löschung = Shredding (Art. 17) |
| Q1 | `energy.zaehler.geraete_referenz` | **Quasi-Identifier** (devEUI/Serie) | Art. 6(1)(f) (Betrieb) — Klassifizierung offen | synthetisch bis Gate; final `compliance-director` (S7) |
| N1 | `energy.endkunde.consent_status`/`_text_version`/`_ref_id` | **Nicht-PII-Slot** (Status/Zeiger) | — | Consent-Mechanik (Zeitpunkt+IP = PII) = **Consent-ADR** |
| N2 | `energy.nutzungsverhaeltnis.datenklasse`/`rolle` | Nicht-PII (Beziehungs-Attribut) | ABAC-Steuergröße (DS-07) | — |

> **Hinweis:** `energy.*` und `measurement.*` enthalten **keine direkt
> identifizierende PII** (rote Linie 1) — nur Pseudonyme, Beziehungs-Attribute und
> einen Quasi-Identifier (Q1). Die eigentlichen Consent-Nachweis-PII (Zeitpunkt+IP,
> DS-03) entstehen im **Consent-ADR**, nicht hier.

## Anhang C — Rote-Linien-Konformität (7.2)

| Rote Linie | Umsetzung im Design | Nachweis |
|---|---|---|
| **1** Keine PII in Mess-/Verbrauchstabellen; PII nur in Identitäts-Namensraum; jede PII-Spalte kommentiert | `identity`-Schema exklusiv für PII; `energy`/`measurement` nur Pseudonyme; `COMMENT`-Pflicht in DDL | §12, §13, DDL-Skizze §3–5 |
| **2** Stabiler Pseudonym-Außenschlüssel; Export ohne PII-Join; keine natürlichen IDs als Schlüssel | UUIDv7-Surrogat `energy.endkunde.id`; Re-ID nur in `identity` | §13.1, M6 |
| **3** Strukturelle Lösch-/Sperrbarkeit; Krypto-Shredding; Sperre als Zustand | per-Subjekt-DEK; `verarbeitungs_status`/`pii_status` | §15, §16 |
| **4** Anschlussnutzer-Beziehung + Datenklasse + Consent-Status-Slot als First-Class | `nutzungsverhaeltnis` (Datenklasse/temporal); Consent-Slot an `endkunde` | §13.2 |
| **5** Feld-Verschlüsselung direkt-PII; TR-02102-Transport; Identitäts-Namensraum physisch separierbar (kein cross-NS-Hart-FK) | AES-256-GCM/KMS; **kein FK** `energy↔identity` (nur `pseudonym_id`) | §11, §12, §15 |
