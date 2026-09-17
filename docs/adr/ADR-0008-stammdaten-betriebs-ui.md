# ADR-0008: Stammdaten-CRUD-API + internes Betriebs-UI (Endkunde, System/Messstelle, Zähler/Messkanal, Messkonzept — ABAC-geschützt, auditiert)

- **Status:** **accepted** — **durch User freigegeben am 2026-07-13** (Phase-2-Design
  inkl. aller drei Lead-Reviews, Teil B §11–§30 + Contract
  `schemas/openapi/stammdaten.openapi.yaml`; zwei PDP-Blocker behoben, §30). Phase 1
  abgeschlossen 2026-07-13 (User-Entscheidungen F1–F5, `compliance-director`-Sichtung
  ohne Veto — DS-07-Innensicht §6.5, F6-Bedingungen §6.6, rote Linien §6.7). **Kein
  Schema, keine Migration, keine Implementation in diesem ADR** — **nächster Schritt:
  Phase 3 (Compliance-Nachträge), danach Phase 4** (V0005-Migration `energy.system.status`,
  CRUD-API + ABAC/break-glass, Dev-KMS, synthetic-only-Guard, Betriebs-UI). Offene-Punkte-
  Liste §29 (A: vor Impl. entschieden; B: Phase-4-Umsetzung; C: Folgeaufträge).
- **Datum:** 2026-07-13
- **Autor:** product-director (Phase 1)
- **Reviewer:** compliance-director — **Phase 1 ohne Veto (2026-07-13)**; Risiko
  **MITTEL–HOCH** bestätigt (6.1); DS-07-Innensicht-Policy (6.5), F6-Bedingungen (6.6)
  und fünf rote Linien (6.7) als verbindliche Phase-2-Constraints; technical-director
  (Phase 2, folgt)
- **Freigabe:** User — **F1–F5 entschieden (2026-07-13)**, siehe Abschnitt 8.1;
  Übergabe an Phase 2 durch `compliance-director` mitgetragen
- **Workflow:** `/new-feature stammdaten-betriebs-ui`, Phase 1
- **Roadmap-Bezug:** „Jetzt (in Arbeit): ADR-0008 Stammdaten-CRUD-API + internes
  Betriebs-UI — Endkunden/Systeme/Zähler/Messkonzepte pflegen, Vollständigkeits-/
  Störungs-Monitoring (DE-02-Lücken-Reports). Voraussetzung: ADR-0002."
  (`production/roadmap.md`, rev. 8). Personas: Betriebs-Team (ADR-0004 Persona B).

> ## Nummerierung (F0 aufgelöst, 2026-07-13)
>
> Ursprünglich als ADR-0006 angelegt — kollidierte aber mit den Roadmap-
> Reservierungen **ADR-0006 = Baseline & Bereinigung** und **ADR-0007 =
> Einsparberechnung + BAFA-Export** (in ADR-0004 §1/§4.2 quervernetzt).
> **Auflösung: dieses Memo ist ADR-0008** (kollisionsfrei, keine Änderung an
> Roadmap oder ADR-0004-Cross-Refs nötig). Die Nummern 0005/0006/0007 bleiben
> wie in der Roadmap reserviert (Ingestion/Baseline/Einsparung).

> **Reifegrad-Hinweis.** Dies ist das **Vision-Memo** (Phase-1-Output). Das
> **Datenmodell existiert bereits** (ADR-0004 Teil B, migriert als V0002); die
> **Auth-/ABAC-/Audit-Maschinerie existiert bereits** (ADR-0002 accepted 2026-07-13:
> `JwtAuthGuard`, `PolicyInterceptor` mit ABAC-PDP-Port, `@AuditAction`, RBAC-Rollen
> `betrieb`/`compliance-auditor`/`admin`). **Dieses Feature ist das erste, das diese
> Maschinerie auf FACH-Routen (nicht nur Auth-Routen) anwendet.** Es entwirft **kein
> neues Schema** und **keine neue Auth-Mechanik**, sondern eine **API-/UI-Schicht**
> darauf. Konkrete OpenAPI-Spec, DTO-/Endpoint-Design, UI-Flows = Phase 2/3/4.

---

## 0. Gate-Klarstellung — was dieses Feature DARF und was am harten Gate hängt

Das **ADR-0004-Ingest-Gate** (§6/§7.1) ist **weiter ZU**: kein produktiver PII-/
Verbrauchsdaten-Ingest vor DSFA-Aktivierung + Consent-Enforcement + DE-Only-Hosting/
AVV/TIA + Audit-Log (ADR-0003) produktiv. **Dieses Feature ändert daran nichts** und
öffnet das Gate **nicht**. Die entscheidende Abgrenzung:

**DARF (kein Gate-Verstoß) — Bau + Betrieb mit SYNTHETISCHEN Daten:**
- Schema existiert (V0002), Auth existiert (ADR-0002). Die Stammdaten-CRUD-API und das
  Betriebs-UI dürfen **gebaut, getestet und mit synthetischen Stammdaten betrieben**
  werden — zum Aufbau des Betriebs-UIs, der Testabdeckung und der ABAC-/Audit-
  Verdrahtung.
- Das ist etwas **grundsätzlich anderes** als produktiver Messdaten-Ingest: keine
  realen Personen, keine LoRaWAN-Verbrauchszeitreihen, kein Endkunden-Onboarding.
- **Deckung:** Gate-Bedingung 1 (nur synthetische Daten bis Gate-Freigabe) erlaubt
  genau diesen Zustand; DSFA-0001 §1 („Datenflüsse", **Stammdaten-Pfad**) beschreibt
  diese CRUD-API bereits ausdrücklich als die vorgesehene operative Umsetzung.

**HÄNGT AM HARTEN GATE (nicht Teil dieses Features):**
- **Echte Endkunden-PII / reales Onboarding.** Sobald reale Namen/Anschriften/
  Zählernummern erfasst werden, greift das volle Gate (DSFA active, Consent, DE-Only,
  AVV/TIA, Audit-Log produktiv).
- **Gate-Bedingung 6 (kein verdrahteter Prod-Datenpfad auf PII bis Freigabe):** Die API
  ist so zu bauen, dass der **Umschalt-Punkt auf Echtbetrieb** ein bewusster,
  compliance-freigegebener Schritt bleibt (z. B. Umgebungs-/Feature-Flag „synthetic-only"
  als Default; Deaktivierung nur durch `compliance-director`). Der **Bau** verletzt
  Bedingung 6 nicht — der **produktive Real-PII-Betrieb** wäre der gate-pflichtige Akt.

**Fazit:** v1 = **synthetic-only, gebaut & getestet, aber nicht produktiv real-PII
geschaltet.** Das Feature bringt uns bis an das Gate heran, ohne es zu öffnen.

---

## 1. Vision-Satz (Job-to-be-done)

> **Als internes Betriebs-Team (ADR-0004 Persona B) brauche ich eine
> authentifizierte, ABAC-geschützte und lückenlos auditierte CRUD-API mit einem
> internen Betriebs-UI, um Endkunden, Systeme/Messstellen, Zähler/Messkanäle und
> Messkonzepte anzulegen und zu pflegen sowie deren Vollständigkeit und Störungen zu
> überwachen — damit die Energiedaten-Plattform eine gepflegte, förder-konforme
> Stammdatengrundlage bekommt, ohne dass jemals ein ungeschützter PII-Pfad an der
> Zugriffskontrolle vorbei entsteht.**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

Dieses Feature ist der **erste Fach-Anwendungsfall** der ADR-0002-Maschinerie und die
**operative Umsetzung** der in ADR-0004/DSFA-0001 bereits bewerteten PII-Verarbeitung.
Es erzeugt die Stammdaten, auf denen ADR-0005 (Ingestion), ADR-0006/0007 (Baseline/
Einsparung — Roadmap-Nummerierung, reserviert) und das spätere Portal aufsetzen.

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Internes Betriebs-Team (primär).** = ADR-0004 Persona B, RBAC-Rolle
`betrieb` (ADR-0002 §11). Legt Endkunden/Systeme/Zähler/Messkonzepte an, pflegt
Stammdaten, betreut Störungen (TB-04) und prüft Datenvollständigkeit (DE-02). Erwartet:
Stammdatenpflege ohne Umwege, nachvollziehbare Fachhistorie, klare Lücken-Sicht. Erfolg
= jede fachlich relevante Änderung ist mit einem Handgriff möglich **und** im Audit-Log
rekonstruierbar.

**Persona B — Compliance-/Fördernachweis-Auditor (sekundär, strikt lesend).** RBAC-Rolle
`compliance-auditor` (ADR-0002 §11, **ohne** Schreib-/Admin-Rechte, DS-01-getrennt). Liest
Vollständigkeits-/Nachweis-Sichten, **schreibt nie**. Erfolg = Nachweise ohne
Fachbedienung, ohne Klartext-PII über das Erforderliche hinaus.

**Persona C — Administrator (sekundär, Betriebsaufgaben).** RBAC-Rolle `admin`. Betriebs-/
Konfigurationsaufgaben, **kein** routinemäßiger PII-Fachzugriff (DS-01-Trennung Auditor/
Betrieb ≠ IT-Admin, DS-01). Für dieses Feature v1 nachrangig.

**Persona D — Endkunde / Anschlussnutzer (nicht in Scope, strukturell relevant).** Sieht
später über das **Portal** (Roadmap „Später") nur einen eng begrenzten Ausschnitt (DS-07
Abrechnungsminimum). **Kein** Portal in diesem Feature. Für v1 nur als **Struktur-/Policy-
Anforderung**: die Betriebs-API/-UI muss die DS-07-Sichttrennung im Datenmodell und im
PDP respektieren, damit sie später ohne Umbau scharf geschaltet werden kann.

**Stakeholder — `compliance-director` / DSB / BAFA.** Prüfen, dass DS-07/DS-10/DE-04 auch
in einer schreibenden Fach-API belegbar bleiben.

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| **M1** | **CRUD über ABAC-geschützte, auditierte Endpoints** — Kern-Entitäten anlegen/lesen/ändern; **jede** non-public Route mit `JwtAuthGuard` (AuthN) + `PolicyInterceptor` (RBAC `@Roles` + ABAC-PDP), Default **deny** | Test-Matrix **Rolle × Route** (ADR-0002 M5-Muster): `betrieb`/`compliance-auditor`/`admin`/anonym → erwartete allow/deny; Contract-Test je Endpoint gegen OpenAPI | Matrix **grün**; 0 Route ohne Guard+Policy |
| **M2** | **DS-07-Sichttrennung im Test nachweisbar** — der ABAC-PDP konsumiert `nutzungsverhaeltnis.datenklasse` (Abrechnungsminimum/Detailverbrauch) + `von_wiss_auswertung_ausgenommen`; eine Rolle/Beziehung erhält **nur** ihren erlaubten Ausschnitt | Unit-Test am PDP (permit/deny je Datenklasse) **+** Integrationstest am Endpoint (Antwort enthält nur erlaubte Felder) | DS-07-Trennung **testbelegt**; kein Detailverbrauch-Leak an nur-Abrechnungsminimum-berechtigte Prinzipale |
| **M3** | **Jede Mutation erzeugt ein Audit-Event** — `@AuditAction` auf allen state-ändernden Endpoints (HTTP-Pfad); auch **403-Ablehnungen** (`authz.zugriff.verweigert`) werden auditiert | Integrationstest zählt Audit-Emit je Mutation + je Deny; Review „kein state-ändernder Endpoint ohne `@AuditAction`" | **100 %** der Mutationen + Denies auditiert |
| **M4** | **Kein Klartext-PII-Leak** — PII nur über den `identity`-Namensraum (feldverschlüsselt); Listen/Detail/Logs enthalten **keinen** Klartext-PII über das rollen-/datenklassen-erlaubte Maß hinaus; Fehlerausgaben ohne Stacktrace (DS-10) | Automatisierter PII-Scan über API-Responses + Logs (pino-redact-Whitelist); `problem+json` ohne interne Details | Scan **grün**, 0 Klartext-PII-Verstoß |
| **M5** | **Betriebs-UI zeigt Vollständigkeits-/Lücken-Sicht** (DE-02) — je Endkunde/System/Zähler: welche Stammdaten fehlen (z. B. kein Messkonzept, kein Zähler, kein aktiver Consent-Slot, keine Mindestauflösungs-Zusage) | UI-/API-Test gegen **synthetische** Fixtures mit gezielt gesetzten Lücken; Lücken-Report = erwartete Menge | Lücken-Report **deckungsgleich** mit Fixture-Erwartung |
| **M6** | **Synthetic-only-Garantie** (Gate-Bedingung 1) — Ende-zu-Ende auf synthetischen Daten; keine realen Namen/Adressen/Zählernummern in Seeds/Fixtures | PII-Scan-Hook auf Seeds/Fixtures; „synthetic-only"-Flag als Default | Hook **grün**; Real-PII-Betrieb **nur** durch `compliance-director`-Freigabe schaltbar |

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope v1 — **entschieden (F1, 2026-07-13)**

| Entität (ADR-0004 §13.2) | v1-Umfang | Anmerkung |
|---|---|---|
| **Endkunde** (`energy.endkunde` + `identity.endkunde_pii`) | **CRUD** (Anlegen/Lesen/Ändern; „Löschen" = **Sperre/Krypto-Shredding**, ADR-0004 §16, **kein** Hard-Delete) | PII-Schreib-Pfad app-seitig verschlüsselt (**F3 entschieden: produktive Krypto ab v1**, §5.2); Consent-Status-Slot nur **anzeigen/respektieren**, keine Consent-Mechanik |
| **System / Messstelle** (`energy.system`) | **CRUD** | Systemgrenze/Beschreibung (operativ) |
| **Zähler + Messkanal** (`energy.zaehler`, `energy.messkanal`) | **CRUD** (`status` aktiv/stillgelegt, **kein** Hard-Delete) | Energieträger-Dimension (F7), `geraete_referenz` synthetisch bis Gate |
| **Messkonzept** (`energy.messkonzept` + `_version` + `_version_energietraeger`) | **Lesen + Anlegen** (versioniert, 7 Pflichtinhalte + Energieträger-Link) | **Kein** Editieren bestehender Versionen (append-only neue Version); Anzeige-Workflow TB-01 = später |
| **Anschlussnutzer + nutzungsverhältnis** (`energy.anschlussnutzer`, `energy.nutzungsverhaeltnis`) | **Strukturell** (Anlegen der Beziehung + `datenklasse`/`rolle`) | DS-07-Attribute für den PDP; **scharfe** Portal-Durchsetzung gated (O3, F2) |
| **Betriebs-UI** | Listen · Detail · Anlegen-Formulare (obige Entitäten) · **Vollständigkeits-Dashboard** (DE-02-Lücken) | Deutsche UI-Strings, A11y, OpenAPI-Client (frontend-Rule) |

### 4.2 Out-of-Scope v1 (mit Verankerungs-Bezug)

- **Messdaten-Ingestion** (ChirpStack → MQTT → Ingest-Worker) → **ADR-0005**. Dieses
  Feature liefert die Stammdaten (Zähler/Messkanal), auf die die Ingestion referenziert.
- **Consent-Flow / -Mechanik** (Zeitpunkt+IP, Opt-out, Kopplungsverbot, DS-03/DS-04) →
  **eigener Consent-ADR.** v1 **respektiert** nur den Consent-Status-Slot am Endkunden
  (ADR-0004 Anhang B N1) — Anzeige, keine Erfassung.
- **Baseline / Einsparberechnung + BAFA-Export** → **ADR-0006/0007 (Roadmap-Nummerierung
  reserviert).** v1 legt Messkonzepte inkl. Baseline-Slot an, **rechnet** aber nichts.
- **Endkunden-/Nutzer-Portal** (DS-07 Endnutzer-Sicht, TB-06 Nutzerinformation) → später.
- **Messkonzept-Änderungs-Workflow / Anzeige-Vorgang an die Bewilligungsbehörde** (TB-01,
  TB-03) → Workflow-ADR. v1 **speichert** Versionen, **löst** keine Anzeige aus.
- **Gerätegruppe-CRUD** (TB-05-Quoten) → später; v1 nur strukturell vorhanden (ADR-0004).
- **Retention-/Lösch-Läufe**, **Belegablage** (Jahresabrechnungen TB-02) → spätere ADRs.

### 4.3 Abgrenzung zu ADR-0004 und ADR-0002 (kein Neu-Entwurf)

Dieses Feature **entwirft weder Schema noch Auth-Mechanik neu.** Es **nutzt**: das
migrierte Datenmodell (V0002), den `JwtAuthGuard`, den `PolicyInterceptor` mit
**ABAC-PDP-Port** (`PolicyDecisionPoint.evaluate(subject, action, resource)`, ADR-0002
§13), den `@AuditAction`-Decorator und die RBAC-Rollen. Neu ist ausschließlich die
**Fach-API-Schicht** (Controller → Service → Repository/Krypto-Adapter) + das
**Betriebs-UI**.

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 API-first vs. UI-first vs. parallel
- **A — API-first** (OpenAPI-Spec + Endpoints zuerst, UI gegen generierten Client).
  *Pro:* frontend-Rule verlangt ohnehin ausschließlich den generierten OpenAPI-Client;
  Contract-Tests + ABAC/Audit-Verdrahtung am Backend zuerst absichern. *Contra:* UI
  sichtbar später.
- **B — UI-first.** *Pro:* frühes sichtbares Ergebnis. *Contra:* UI gegen instabilen
  Kontrakt = Nacharbeit; widerspricht dem generierten-Client-Zwang.
- **Empfehlung: A.** API-first, dann UI. Deckt sich mit `api-contracts.md`/`frontend-react.md`.
- **Entschieden (F5, 2026-07-13): A — API-first.**

### 5.2 PII-Feld-Verschlüsselung produktiv in v1 nutzen vs. nur Felder anlegen
- **A — echter Krypto-Pfad in v1** (AES-256-GCM/Envelope + per-Subjekt-DEK, ADR-0004 §15)
  **mit synthetischen Daten** gegen einen **Dev-KMS**. *Pro:* der PII-Schreib-/Lese-Pfad
  ist **real getestet**, bevor je echte PII fließt; kein Nachrüsten auf einem später
  PII-berührenden Pfad. *Contra:* Dev-KMS-Abhängigkeit muss jetzt entschieden werden
  (Infra, Vorwirkung Deployment).
- **B — Felder anlegen, Krypto stubben** (Klartext oder No-op bis Gate). *Pro:* schneller.
  *Contra:* der spätere Umschalt-Punkt auf echte Krypto ist genau ein PII-berührender
  Nach-Umbau (Gate-Bedingung 6-nah); rote Linie 5 (ADR-0004 §7.2) fordert Feld-
  Verschlüsselung als First-Class.
- **Empfehlung: A** (mit Dev-KMS jetzt entscheiden). Der Krypto-Pfad ist genau der Teil,
  der später **nicht** billig nachrüstbar ist. → F3.
- **Entschieden (F3, 2026-07-13): A — produktive Feld-Verschlüsselung ab v1.** Envelope
  (AES-256-GCM) + per-Subjekt-DEK + **Krypto-Shredding real aktiv** gegen synthetische
  Daten; DSGVO-Mechanik **von Anfang an, kein Nachrüsten**. Die **lokale Dev-KMS-Lösung**
  (Wrapping des DEK) ist eine **Phase-2-Design-Aufgabe** (`technical-director`/
  `security-lead`; Vorwirkung Deployment/ADR-0005). — Abschnitt 10.

### 5.3 Messkonzept-Komplexität in v1
- **A — volle Struktur (Lesen+Anlegen)**: 7 Pflichtinhalte + Energieträger-Link-Tabelle
  (ADR-0004 §13.2). *Pro:* Schema existiert bereits; TB-01 vollständig abbildbar.
  *Contra:* mehr Formular-Aufwand.
- **B — minimal** (nur Kernfelder). *Pro:* schneller. *Contra:* unvollständiger TB-01-
  Nachweis, spätere Nach-Formulare.
- **Empfehlung: A** (Lesen+Anlegen voll; Editieren/Versions-Workflow später). → F4.
- **Entschieden (via F1-Scope, 2026-07-13): A — Messkonzept Lesen+Anlegen mit allen
  sieben TB-01-Pflichtinhalten** (versioniert); Editieren/Anzeige-Workflow später.

### 5.4 DS-07-Enforcement jetzt scharf vs. strukturell
- **A — strukturell jetzt** (PDP konsumiert Datenklasse-Attribute, Endpoints laufen durch
  den `PolicyInterceptor`, ABAC unit-testbar), **scharfe Portal-Durchsetzung deferred**
  auf O3/erstes Mieter-Projekt. *Pro:* konsistent mit ADR-0002 §8.1 (A2) und DSFA-0001
  §9.1; kein Umbau nötig, wenn scharf geschaltet wird. *Contra:* die scharfe Trennung ist
  in v1 nur strukturell, nicht endnutzer-wirksam (aber: es gibt in v1 auch kein Portal).
- **B — jetzt scharf.** *Pro:* DS-07 sofort wirksam. *Contra:* ohne Portal/Mieter-Fall
  ohne konkreten Anwendungsfall; O3 ist bewusst an das erste Mieter-Projekt gebunden.
- **Empfehlung: A** — **aber** mit einer **compliance-director-Entscheidung zur Innensicht**
  des `betrieb`-Teams (siehe Abschnitt 6, F2): Was darf `betrieb` von
  Anschlussnutzer-Detaildaten sehen? Das ist die einzige v1-scharfe DS-07-Frage.
- **Entschieden (F2-i, 2026-07-13): A — DS-07 strukturell jetzt** (ABAC-Attribute +
  Datenklasse im API/PDP verankert und getestet), **scharfes Mieter-Portal-Enforcement
  deferred an O3.** Die **Betriebs-Innensicht** (F2-ii) entscheidet der
  `compliance-director` in der laufenden Phase-1-Sichtung (Abschnitt 6.2/8).

---

## 6. Compliance-Einfluss / Phase-1-Risiko-Flag

**Gesamt-Flag: MITTEL–HOCH — durch `compliance-director` bestätigt (2026-07-13, kein
Veto).** Dies ist die **erste PII-verarbeitende Fach-API** des Systems — sie
operationalisiert genau die Verarbeitung, die DSFA-0001 (ADR-0004) bereits bewertet hat.
Präzisierung des `compliance-director`: **effektiv MITTEL, solange synthetic-only
technisch hält**, aber **latent HOCH** — die Distanz zu Real-PII ist **ein einziges Flag**.
Daraus folgt die **wichtigste Einzelkontrolle: die technische Erzwingung der
Synthetic-only-Garantie** (6.6, rote Linie 5 in 6.7). Das Risiko ist **hoch der Art nach**
(Endkunden-/Anschlussnutzer-PII, DS-07/DS-10), aber **gemindert durch Synthetic-only +
geschlossenes Gate** (kein realer Betroffener in v1).

### 6.1 Warum voraussichtlich Nachtrag statt neue DSFA
- DSFA-0001 §1 („Datenflüsse", **Stammdaten-Pfad**) **beschreibt diese CRUD-API bereits
  ausdrücklich** als vorgesehene operative Umsetzung — inkl. app-seitiger AES-256-GCM-
  Verschlüsselung und der Bedingung „erst nach ADR-0002". Der Art.-35-Schwellentest
  (DSFA-0001 §0) ist für **diese** Verarbeitung bereits durchlaufen; dieses Feature
  begründet **keine neuen WP248-Kriterien**.
- Erwartung analog ADR-0002/0003: **Phase 3 überwiegend dünn** = **DSFA-0001-Nachtrag /
  TOM-Verweis** (die CRUD-API + Feld-Verschlüsselung als Art.-32-TOM in `toms.md`; RVT-
  Berührung VT-0001) statt eigenständiger neuer DSFA. **Voraussetzung:** Synthetic-only +
  Gate bleiben gewahrt.

### 6.2 Der eine substanzielle Phase-3-Punkt (nicht dünn)
- **DS-07-Innensicht des Betriebs-Teams.** Dieses Feature ist die **erste** Stelle, an der
  überhaupt jemand (die Rolle `betrieb`) Anschlussnutzer-/Nutzungsverhältnis-Daten
  **schreibend/lesend** anfasst. Auch wenn die **Portal**-Enforcement gated ist (O3), muss
  `compliance-director` **jetzt** entscheiden, **was `betrieb` von Anschlussnutzer-
  Detaildaten sehen darf** — das ist eine echte Policy-Entscheidung, kein bloßer Nachtrag.
  (DS-07 richtet sich primär gegen die *Endkunden*-Sicht; die *Betriebs*-Innensicht ist
  separat zu bewerten und zu begründen — Zweckbindung/Erforderlichkeit.)
- **Frontend-DS-10-Fläche.** Neu: PII-Anzeige im UI. `problem+json` ohne Stacktrace, keine
  Klartext-PII in Fehler-/Log-Ausgaben, keine PII in `localStorage`/`sessionStorage`
  (frontend-Rule) — als Design-Constraint verbindlich (M4).

### 6.3 Voraussichtlich berührte ISO/IEC-27001-Controls (grob, Feinmapping Phase 3)
A.5.15/A.5.18 (Zugriffssteuerung/Zugriffsrechte), A.8.3 (Informationszugriffs-
Beschränkung), A.5.34 (Privacy/PII), A.8.11 (Data Masking, UI/Response), A.8.24
(Kryptografie, Feld-Verschlüsselung), A.8.15 (Protokollierung, via ADR-0003-Audit) —
final durch `iso27001-auditor`.

### 6.4 Harte Regel
Ich schreibe **nicht** in `compliance/**`. DSFA-0001-Nachtrag, TOM-/RVT-Berührung und
Control-Mapping laufen in Phase 3 über `compliance-director`/`dsgvo-auditor`/
`iso27001-auditor`. Die **Phase-1-Sichtung durch `compliance-director` ist abgeschlossen
(kein Veto)** — Ergebnisse in 6.5/6.6/6.7.

**Phase-3-Einordnung (bestätigt durch `compliance-director`):** **kein neuer Art.-35-DSFA**
— **DSFA-0001-Nachtrag** (CRUD-API + Feld-Verschlüsselung als operative Umsetzung **plus**
die **DS-07-Innensicht-Regel (6.5) = der substanzielle Punkt**); **RVT VT-0001-Berührung**;
**TOM-Zusatz** (Fach-API-Zugriffskontrolle / Data Masking / Löschen = Sperre); **R-0004-
Berührung** (synthetic-only-Enforcement); ISO **A.5.15/5.18/5.34/8.3/8.11/8.24/8.15**.
Also **überwiegend dünn (Nachträge), mit einem substanziellen Punkt** (DS-07-Innensicht).

### 6.5 DS-07-Innensicht des Betriebs-Teams — verbindliche `compliance-director`-Policy (F2-ii)

> **Verbindliches Phase-2-PDP-Design-Constraint.** Entscheidung des `compliance-director`
> (2026-07-13). Das `betrieb`-Team sieht bei **Mieter-Fällen NICHT standardmäßig** die
> vollen Verbrauchs-**Detaildaten** des Anschlussnutzers — die Abrechnungsminimum-/
> Metadaten-Sichttrennung (DS-07) gilt **auch intern** (Art. 5(1)(b) Zweckbindung +
> (c) Datenminimierung; Mieter-Vulnerabilität; Inferenzrisiko DSFA-0001 §3.1/§3.2).

| Subjekt · Aktion | PDP-Entscheidung |
|---|---|
| `betrieb` · `read:stammdaten` | **permit** — Stammdaten inkl. `nutzungsverhaeltnis.rolle`/`datenklasse`; PII **soweit für Zuordnung/Pflege erforderlich** |
| `betrieb` · `read:monitoring` | **permit** — Vollständigkeits-/Lücken-/Status-**METADATEN** (DE-02/TB-04); **kein** Verbrauchsinhalt |
| `betrieb` · `read:verbrauch_detail` (inhaltliche Lastgänge) | **deny by default**; **permit nur** (i) zweckgebunden/begründet (Störungsdiagnose), (ii) auf **Zähler/Zeitraum begrenzt** (kein Massen-Export, kein Dauer-Detaildashboard), (iii) **audit-pflichtig mit Zweck-Token** — **„break-glass"** |
| Endkunde/Vermieter (Portal, später) | **deny** auf Anschlussnutzer-Detail (nur Abrechnungsminimum) |
| `compliance-auditor` | **read-only** Nachweis-/Vollständigkeitssichten; **kein** Detailverbrauchsinhalt (need-to-know); Einzelfall nur über **denselben auditierten Detail-Zugriff** |

Diese Regel wird in Phase 2 als **PDP-Policy** (ADR-0002 §13-PDP-Port) modelliert und ist
über M2 testpflichtig; sie fließt in Phase 3 als **substanzieller** DSFA-0001-Nachtrag ein.

### 6.6 Synthetic-only mitgetragen unter fünf Bedingungen (F6, `compliance-director`)

1. **Technisch erzwungenes `synthetic-only`-Default-Flag** — Umschalten **nur** durch
   `compliance-director`.
2. **Keine Echt-PII in Fixtures/Seeds** — **blockierender CI-Guard / PII-Scan** auf
   **Seeds/Fixtures UND Responses/Logs** (M4/M6).
3. **Kein Consent-/Onboarding-Pfad** — Consent-Status-Slot **nur respektieren**, nicht
   erfassen.
4. **Dev/Test-Synthetic zeigt nicht auf Prod-PII-Umgebung**; **Dev-KMS-Schlüssel Dev-only**.
5. **Dokumentierter, gate-pflichtiger Umschalt-Punkt** synthetic → real (Gate-Bedingung 6,
   Abschnitt 0).

### 6.7 Fünf rote Linien für Phase 2 (verbindliche Design-Constraints, `compliance-director`)

1. **Kein Fach-Endpoint ohne `JwtAuthGuard` + `PolicyInterceptor`** (default **deny**;
   AuthZ im **Interceptor**, damit **denied auditiert** wird; **DS-07-Innensicht (6.5) im
   PDP**).
2. **PII nie Klartext in Liste/Log/`problem+json`** — PII nur aus `identity`,
   **feldentschlüsselt nur für den berechtigten Einzel-Detail-Zugriff**; **Listen =
   Pseudonym-Surrogate + erforderliche Nicht-PII** (Data Masking, A.8.11); **pino-redact**;
   `problem+json` **ohne Stacktrace**.
3. **Löschen = Sperre (Art. 18) / Krypto-Shredding (Art. 17)** — **kein Hard-Delete**;
   **Messkonzept-Versionen append-only**.
4. **Jede Mutation + jede Ablehnung auditiert** (`@AuditAction`; **403 → `authz.zugriff.
   verweigert`**; `actor_sub` **nur aus validiertem Token**; Events **PII-frei**; **auch
   der break-glass-Detailzugriff**).
5. **Synthetic-only technisch erzwungen** + **Dev-KMS-Schlüssel nie im Repo** (Env/Vault,
   **getrennt vom Prod-KMS**).

---

## 7. Sequenzierung / Voraussetzungen

| Baustein | Status | Bezug |
|---|---|---|
| **Datenmodell** (V0001/V0002) | **liegt vor** (migriert 2026-07-09) | ADR-0004 Teil B, `schemas/database/adr-0004-kern-datenmodell.md` |
| **Auth/RBAC/ABAC-Fundament** | **accepted** (2026-07-13) | ADR-0002 (`JwtAuthGuard`, `PolicyInterceptor`, PDP-Port, `@AuditAction`, Rollen) |
| **Audit-Log** (Hypertable/Emit-Pfad) | in Arbeit | ADR-0003 — für v1-**Test** nutzbar; **produktiv** Teil des Ingest-Gates |
| **DSFA-0001** | `review` (mit Auflagen) | einschlägig; Nachtrag statt neue DSFA (6.1) |
| **Dev-KMS** (F3 = produktive Krypto ab v1) | **Design-Aufgabe Phase 2** | Vorwirkung Deployment/ADR-0005 |

Dieses Feature braucht ADR-0002 als **Code** (erste Fach-Nutzung) und ADR-0004 als
**Schema**. Der produktive Real-PII-Betrieb bleibt hinter dem ADR-0004-Gate.

---

## 8. Fragen-Status nach Phase 1

### 8.1 Entschieden (User, 2026-07-13)

- **F0 — Nummerierung: aufgelöst → ADR-0008.** Kollisionsfrei; Roadmap-Reservierungen
  0005 (Ingestion) / 0006 (Baseline) / 0007 (Einsparung) **bleiben unverändert**; keine
  ADR-0004-Cross-Refs geändert (siehe Kopf-Notiz „Nummerierung").
- **F1 — Entitäts-Umfang v1: voller Vorschlag (4.1).** Endkunde + System/Messstelle +
  Zähler/Messkanal = **CRUD**; **Messkonzept = Lesen+Anlegen** (versioniert, 7 TB-01-
  Pflichtinhalte); Anschlussnutzer/nutzungsverhältnis **strukturell**; Gerätegruppe
  **später**. UI: Listen/Detail/Anlegen + **Vollständigkeits-/Lücken-Dashboard**.
- **F2-i — DS-07: strukturell jetzt** (ABAC-Attribute + Datenklasse im API/PDP verankert
  und getestet), **scharfes Mieter-Portal-Enforcement deferred an O3** (5.4 A).
- **F3 — PII-Feld-Verschlüsselung: produktiv ab v1 mit Dev-KMS** (5.2 A). Envelope +
  Krypto-Shredding **real aktiv** gegen synthetische Daten; DSGVO-Mechanik von Anfang an,
  kein Nachrüsten. Lokale Dev-KMS-Lösung = **Phase-2-Design-Aufgabe** (10).
- **F4 — Messkonzept-Komplexität: volle Struktur Lesen+Anlegen** (via F1-Scope, 5.3 A);
  Editieren/Anzeige-Workflow später.
- **F5 — API-first** (5.1 A).

### 8.2 Beschieden durch `compliance-director` (Phase-1-Sichtung abgeschlossen, 2026-07-13)

- **F2-ii — DS-07-Innensicht des Betriebs-Teams: entschieden.** Verbindliche PDP-Policy
  in **Abschnitt 6.5** — `betrieb` sieht bei Mieter-Fällen **nicht** standardmäßig die
  Verbrauchs-Detaildaten; Detail-Zugriff nur zweckgebunden/begrenzt/auditiert
  („break-glass"). Der **substanzielle** Phase-3-Punkt.
- **F6 — Synthetic-only-Rahmung: mitgetragen unter fünf Bedingungen** (Abschnitt 6.6):
  erzwungenes Default-Flag, CI-PII-Guard auf Seeds/Fixtures + Responses/Logs, kein
  Consent-/Onboarding-Pfad, Dev-KMS Dev-only ohne Prod-Zugriff, dokumentierter
  gate-pflichtiger Umschalt-Punkt.
- **Fünf rote Linien** für Phase 2 als verbindliche Design-Constraints: **Abschnitt 6.7**.

> **Phase-2-Freigabe: erteilt.** Übergabe an `technical-director` unter Beachtung von
> 6.5 (DS-07-Innensicht-PDP), 6.6 (F6-Bedingungen) und 6.7 (fünf rote Linien).

---

## 9. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Erste reale Fach-Nutzung der ADR-0002-Maschinerie → validiert Guard/Policy/Audit auf
  Fach-Routen; Stammdaten für ADR-0005 ff. entstehen.
- Der PII-Schreib-/Krypto-Pfad wird (F3 entschieden) real getestet, bevor echte PII fließt.

### Negativ
- Dev-KMS-Abhängigkeit (F3 entschieden) wird vorgezogen (Infra/Deployment-Vorwirkung).
- DS-07-Innensicht-Entscheidung (6.2) macht einen Teil von Phase 3 substanziell.

### Neutral
- Setzt das Fach-API-Muster (Controller→Service→Repository/Krypto-Adapter, `@AuditAction`,
  PDP-Nutzung), an das Folge-Fach-APIs gebunden sind.

---

## 10. Folgeaufgaben

- [x] **F0 (Nummerierung) aufgelöst → ADR-0008;** Nummern **0005/0006/0007 bleiben
      reserviert** (Ingestion/Baseline/Einsparung), keine ADR-0004-Cross-Refs geändert.
- [x] **User-Freigabe Phase 1** — F1–F5 entschieden (8.1).
- [x] **Roadmap-Fortschreibung** (`production/roadmap.md`, rev. 8): Betriebs-UI von
      „Als Nächstes" nach „Jetzt (in Arbeit, Phase 1→2)" gezogen.
- [x] **`compliance-director`-Sichtung abgeschlossen (kein Veto):** F2-ii DS-07-Innensicht
      als verbindliche PDP-Policy (6.5), F6 unter fünf Bedingungen (6.6), fünf rote Linien
      (6.7), Risiko MITTEL–HOCH bestätigt (6.1).
- [~] **Übergabe an `technical-director` (Phase 2)** — **Teil B `proposed` erstellt**
      (Abschnitte 11–29 + `schemas/openapi/stammdaten.openapi.yaml`), unter Beachtung von
      6.5/6.6/6.7: OpenAPI-Spec (RFC 9457, Cursor-Pagination, Idempotency-Key), DTO-/
      Endpoint-Design (D1), **DS-07-Innensicht-PDP-Policy** (6.5 → D3/D4) mit
      break-glass-Detailzugriff, PDP-Attribut-Durchleitung (D3), UX-Flows (D11); Lead-
      Reviews offen (§29), sowie:
  - [ ] **Phase-2-Design-Aufgabe: lokale Dev-KMS-Lösung** für die Feld-Verschlüsselung
        (F3) — DEK-Wrapping/`kms_key_id`/Rotation gegen synthetische Daten, **Schlüssel
        Dev-only, nie im Repo, getrennt vom Prod-KMS** (`technical-director`/
        `security-lead`; Vorwirkung Deployment/ADR-0005).
  - [ ] **Technische Synthetic-only-Erzwingung** (Default-Flag + blockierender CI-PII-Guard
        auf Seeds/Fixtures + Responses/Logs) als wichtigste Einzelkontrolle (6.1/6.6).
- [ ] **Phase 3:** **DSFA-0001-Nachtrag** (CRUD-API + Feld-Verschlüsselung **+ DS-07-
      Innensicht-Regel = substanziell**), **RVT VT-0001-Berührung**, **TOM-Zusatz**,
      **R-0004-Berührung** (synthetic-only-Enforcement), **ISO A.5.15/5.18/5.34/8.3/8.11/
      8.24/8.15** (`compliance-director`/`dsgvo-auditor`/`iso27001-auditor`).

---

# Teil B — Phase-2-Design (Architektur & Technik)

- **Status:** **proposed** (2026-07-13). Design-Owner: `technical-director`.
  **Reviews abgeschlossen und eingearbeitet (2026-07-13):** `backend-lead` +
  `security-lead` + `access-control-engineer` — **Änderungsprotokoll §30**, darunter
  **zwei PDP-Blocker** (Literalvergleich-Falle + Fallback „permit by default" →
  beide behoben, §14/§15/§16). Status bleibt `proposed` bis **User-Freigabe**
  (konsolidierte Offene-Punkte-Liste §29); danach Phase 3
  (`compliance-director`/Auditoren, §6.4), dann Impl. Phase 4. **Kein
  Schreibzugriff** auf `src/`, `migrations/`, `compliance/`, `deployment/` in dieser
  Phase — nur dieses ADR + `schemas/openapi/*.yaml`.
- **Bindende Vorgaben:** die **fünf roten Linien (§6.7)**, die **DS-07-Innensicht-
  Policy (§6.5)**, die **fünf F6-Bedingungen (§6.6)**, die **F1–F5-Entscheidungen
  (§8.1)**, das **ADR-0004-Gate (§0)**, `.claude/rules/backend-nestjs.md`,
  `frontend-react.md`, `api-contracts.md`, `dependencies.md` (Lizenz-Whitelist).
- **Ausgangslage (kein Neu-Entwurf, §4.3):** Schema **liegt vor** (V0002 —
  `migrations/V0002__kern_datenmodell_energie.sql`, Namensräume `identity`/`energy`/
  `measurement`). Auth-/ABAC-/Audit-Maschinerie **liegt vor** (ADR-0002 accepted):
  `JwtAuthGuard` (AuthN), `PolicyInterceptor` (RBAC `@Roles` + ABAC-`PolicyDecisionPort`),
  `AuditActionInterceptor` + `@AuditAction`, `AuditService.append`, `nestjs-cls`-
  Savepoint-Kette (`TransactionHost`), `RolesMapperService`. Der **PDP-Port + der
  `NullResourceAttributesProvider` existieren bereits** (`src/backend/src/auth/policy/`).
  Dieses Feature ist die **erste Fach-Nutzung** und liefert den **ersten echten
  `ResourceAttributesProvider`** sowie den **ersten `@AuditAction`-Fach-Emitter**.
- **Neue Artefakte:** `schemas/openapi/stammdaten.openapi.yaml` (CRUD + Monitoring,
  proposed). **Ein** Domänen-Contract (Begründung §21).

> Jede D-Entscheidung nennt **Optionen**, **verworfene Alternative** und — wo
> Abhängigkeiten berührt sind — einen **Lizenz-Check** (`dependencies.md`,
> OSS-Publikationspflicht). **Keine neue eingebettete Dependency** für v1; **kein
> neues Drittsystem** (DB/Queue/Cache) — Monolith bleibt Default.

## 11. Design-Prinzipien (Ableitung der roten Linien §6.7 + ADR-0004 §11)

1. **Guard+Interceptor auf jeder Fach-Route** (Linie 1). Kein eigener AuthZ-Code in
   Controllern/Services — die **globale** Kette (`JwtAuthGuard` → `TransactionInterceptor`
   → `AuditActionInterceptor` → `PolicyInterceptor`) greift bereits; Fach-Routen tragen
   nur `@Roles(...)`, `@Fachaktion(...)` (D2) und `@AuditAction(...)` (D5).
2. **PII niemals Klartext in Liste/Log/`problem+json`** (Linie 2). Listen = **Pseudonym-
   Surrogat + erforderliche Nicht-PII**; PII (`identity.*_enc`) **nur** feldentschlüsselt
   im **berechtigten Einzel-Detail-Zugriff**, projektions-maskiert je Rolle (D6). Der
   **PDP zieht selbst keine PII** (D3/D4).
3. **Zustand statt Zerstörung** (Linie 3). „Löschen" = **Sperre** (`verarbeitungs_status
   =gesperrt`, Art. 18) bzw. **Krypto-Shredding** (DEK vernichten, Art. 17); **kein
   Hard-Delete**; Messkonzept-Versionen **append-only**.
4. **Jede Mutation + jede Ablehnung auditiert** (Linie 4) — `@AuditAction` auf jeder
   state-ändernden Route; 403 → `authz.zugriff.verweigert` (Fallback des
   `AuditActionInterceptor`); `actor_*` nur aus `SecurityContext`; **break-glass-Einsicht
   auch bei `permit` auditiert**.
5. **Synthetic-only technisch erzwungen + Dev-KMS Dev-only, nie im Repo** (Linie 5,
   D7). **Kein cross-namespace-Join** `energy ↔ identity` (ADR-0004 §11/§12); Kopplung
   nur logisch über `pseudonym_id`, in der App aufgelöst (D8).

## 12. Scope-Abgleich Modell ↔ V0002 (drei bindende Schema-Realitäten)

Die API arbeitet gegen **das migrierte V0002-Schema**, nicht gegen die Skizze. Drei
Abweichungen der Migration von der ADR-0004-Skizze sind **v1-bindend** (kein
Schema-Eingriff in diesem Paket, `migrations/**` bleibt Quelle der Wahrheit):

- **`energy.zaehler.geraete_referenz` existiert in V0002 NICHT** (bewusst
  zurückgestellt, Quasi-Identifier-Klassifizierung offen, V0002-Kopf Abweichung (a) /
  ADR-0004 O4). → **Der Zähler-Contract v1 führt kein `geraeteReferenz`-Feld.** Nachtrag
  erst nach `compliance-director`-Klassifizierung (eigene spätere Migration).
- **`energy.system` und `energy.nutzungsverhaeltnis` haben KEINE `status`-/
  Sperr-Spalte.** → **Kein soft-delete möglich** ohne Schema-Änderung. Konsequenz für
  **v1**: **System = Create/Read/Update (kein DELETE)**; **Nutzungsverhältnis =
  Create/Read + „beenden" per `gueltig_bis`** (Temporalität ist vorhanden — Mieterwechsel,
  ADR-0004 §13.2, `access-control-engineer` **bestätigt: gueltig_bis reicht**), **kein
  DELETE**. Das ist die roten-Linie-3-konforme Auflösung der §4.1-Sammelbezeichnung
  „CRUD" für Entitäten ohne Sperr-Spalte. **Entscheidung (access-control-engineer 5):**
  `energy.system` **bekommt in Phase 4 eine `status`-Spalte** (`aktiv|stillgelegt`) via
  **Folge-Migration V0005** — sonst ist weder Deaktivierung noch die **transitive Sperre
  bei Endkunde-Sperre** abbildbar. Bis dahin bleibt System v1 = CRU (der API-Contract
  bleibt additiv: ein späteres `DELETE /systeme/{id}` = Stilllegung kommt ohne Bruch dazu).
- **`energy.messkanal.kanal_key` (int, `GENERATED ALWAYS AS IDENTITY`)** ist ein
  **internes Hypertable-Surrogat** → **nie im Contract exponiert**; Außenschlüssel ist
  `messkanal.id` (UUID).

## 13. D1 — OpenAPI-Ressourcenschnitt & Nicht-PII-Listen (Linie 2)

**Problem.** Contract für Endkunde/System/Zähler/Messkanal (CRUD), Messkonzept
(lesen + versioniert anlegen), Anschlussnutzer/Nutzungsverhältnis (strukturell) +
DE-02-Monitoring — unter Cursor-Pagination, `problem+json`, `Idempotency-Key`,
oauth2-Default, **ohne Klartext-PII in Listen**.

**Entscheidung (Ressourcen & Pfade, `stammdaten.openapi.yaml`):**

| Ressource | Pfade (Auszug) | Ops |
|---|---|---|
| Endkunde | `/stammdaten/endkunden`, `/{id}`, `/{id}/kryptoshredding` | list, create, get, patch, **delete=sperren**, **shredding (Art. 17)** |
| System | `/stammdaten/systeme`, `/{id}` | list, create, get, patch (**kein delete**, §12) |
| Zähler | `/stammdaten/zaehler`, `/{id}` | list, create, get, patch, **delete=stilllegen** |
| Messkanal | `/stammdaten/zaehler/{zid}/messkanaele`, `/stammdaten/messkanaele/{id}` | list, create, get, patch, **delete=stilllegen** |
| Messkonzept | `/stammdaten/endkunden/{id}/messkonzept/versionen`, `/{versionNr}` | list, get, **create-Version (append-only)** |
| Anschlussnutzer | `/stammdaten/anschlussnutzer`, `/{id}` | list, create, get |
| Nutzungsverhältnis | `/stammdaten/nutzungsverhaeltnisse`, `/{id}` | list, create, **patch=beenden** (`gueltig_bis`) |
| Monitoring (DE-02) | `/monitoring/vollstaendigkeit` | list (nur Metadaten) |

**Zwei-Schema-Trennung Liste vs. Detail (Kern von Linie 2):** je Entität **zwei**
Response-Schemas — `…ListItem` (nur Pseudonym-`id`, Beziehungs-`id`s, Status, Nicht-PII,
`createdAt`) und `…Detail`. **PII (`name`/`anschrift`/`kontakt`) existiert
ausschließlich im Detail-Schema** als **optionaler, nullable `stammdatenPii`-Block** —
**nur befüllt für den berechtigten Einzelzugriff** (D6); für `compliance-auditor`
maskiert (`null`). Der Contract **deklariert die Maximalform**, die Maskierung ist
Laufzeit (D6). **Idempotency-Key** ist Pflicht-Header auf allen POST/PATCH/DELETE;
Pagination **cursor+limit (max 100)**; Fehler **RFC 9457**.

**Verworfene Alternative:** **Ein einziges `…`-Schema mit PII-Feldern, per Rolle
gefiltert.** *Contra:* PII-Felder erschienen im Listen-Schema, ein Bug im
Feld-Filter leakt Klartext-PII in Listen/Logs (Linie-2-Bruch strukturell möglich).
Getrennte List-/Detail-Schemas machen den PII-freien Listenpfad **schema-erzwungen**.

## 14. D2 — Aktions-Taxonomie & `@Fachaktion` (PDP-Kontrakt erhalten)

**Problem.** §6.5 verlangt feinere Aktionen als das grobe `PolicyAction =
'read'|'write'|'delete'` (`policy-decision-port.ts`). Der `PolicyInterceptor` leitet
die Aktion heute rein aus der **HTTP-Methode** ab (`METHOD_ACTION_MAP`) — er kann
`GET /monitoring` (=`read:monitoring`) nicht von `GET /endkunden/{id}`
(=`read:stammdaten`) unterscheiden.

**Optionen.** (a) **Route-Decorator `@Fachaktion(action)`**, den der `PolicyInterceptor`
via `Reflector` liest und **an Stelle** der Methoden-Ableitung an den PDP gibt (Fallback
= bisherige Methoden-Map, wenn Decorator fehlt → Auth-Routen unverändert). (b) Feine
Aktion in `ResourceAttributes` mitführen (vermischt Aktion und Ressource). (c) Neue
PDP-Methode je Aktion (Port-Bruch).

**Entscheidung: (a).** Additive, rückwärtskompatible Erweiterung: `PolicyAction` wird
zur **breiteren Union** (Domänen-Aktionen unten); der **Port-Signatur-Vertrag
`evaluate(subject, action, resource?)` bleibt unverändert** (Ports & Adapters, ADR-0002
§13). Der `PolicyInterceptor` bekommt **eine** Zeile: `action =
reflector.getAllAndOverride(FACHAKTION_KEY, [handler, class]) ?? METHOD_ACTION_MAP[method]`
— **`getAllAndOverride([handler, class])` konsistent zu `ROLES_KEY`/`AUDIT_ACTION_KEY`/
`IS_PUBLIC_KEY`/`SKIP_TRANSACTION`** (`backend-lead` 8), damit ein Class-Default von einer
Methode überschreibbar bleibt. Verworfen: (b) Attribut-Vermischung, (c) Port-Bruch.

**Taxonomie (verbindlich):**
`read:stammdaten` · `read:monitoring` · `read:verbrauch_detail` (break-glass, D4) ·
`create:endkunde|system|zaehler|messkanal|messkonzept_version|anschlussnutzer|
nutzungsverhaeltnis` · `update:endkunde|system|zaehler|messkanal|nutzungsverhaeltnis` ·
`delete:endkunde` (=Sperre) · `delete:zaehler|messkanal` (=Stilllegung) ·
`shred:endkunde|anschlussnutzer` (Art. 17). Grobgranulares RBAC bleibt **vor** dem PDP:
`@Roles('betrieb')` auf **Schreib-/Shredding-Routen**; `@Roles('betrieb',
'compliance-auditor')` auf **Listen-, Monitoring- UND Detail-Routen** (Auflösung des
D2/D6-Widerspruchs, s. u.). **`admin` erhält KEINE Stammdaten-Rolle** (DS-01/Least-
Privilege, Persona C — kein routinemäßiger PII-Fachzugriff); das ist eine
**Realm-Rollen-/Policy-Entscheidung**, keine Code-Sonderlogik.

**Review-Nachtrag (2026-07-13).**
- **Literalvergleich-Falle behoben (PDP-Blocker 1, `access-control-engineer` +
  `backend-lead` unabhängig).** Der bestehende `InCodePolicyAdapter`
  (`in-code-policy.adapter.ts:30,39`) vergleicht **hart gegen das Literal `'read'`** —
  die neuen Aktionen `read:stammdaten`/`read:monitoring`/`read:verbrauch_detail` matchen
  das **nicht**. Folge sonst: (a) `compliance-auditor` würde bei jedem Stammdaten-Read
  fälschlich als **Schreibzugriff** abgelehnt (DS-01-Bruch), (b) die DE-04-Schutzregel
  (`vonWissAuswertungAusgenommen && action==='read'`) **feuerte für die neuen
  Lese-Aktionen still nie mehr**. **Behebung (verbindlich):** Alle
  action-Kategorie-Prüfungen laufen über eine reine Hilfsfunktion **`classifyAction(a)
  → 'read'|'write'|'delete'|'shred'`** (bzw. `a.startsWith('read')`), **nie** über
  Literalgleichheit. **Pflicht-Regressionstests:** `compliance-auditor` × `GET
  /endkunden/{id}` → **permit**; DE-04-Ausnahme feuert bei `read:stammdaten`;
  `compliance-auditor` × jede `create/update/delete/shred`-Aktion → **deny**
  (`auditor_schreibzugriff_verboten`).
- **D2/D6-Widerspruch aufgelöst (Punkt 3): Auditor ERREICHT Detail-Routen**, die
  **D6-Maskierung ist die zweite Verteidigungslinie** — das ist die maßgebliche Fassung
  (D6/D11 bleiben, der frühere „Detail nur `betrieb`"-Halbsatz ist damit ersetzt). Die
  **M1-Matrix** wird entsprechend gesetzt (`compliance-auditor` × Detail → permit,
  Response **ohne** `stammdatenPii`).

## 15. D3 — `StammdatenResourceAttributesProvider` (PDP zieht keine PII, Linie 2)

**Problem.** Der PDP braucht Ressourcen-Attribute (`nutzungsverhaeltnis.datenklasse`,
`verarbeitungs_status`, `von_wiss_auswertung_ausgenommen`, „Anschlussnutzer ≠
Endkunde"-Flag), **darf dafür aber keine PII lesen** (Linie 2). Heute liefert der
global gebundene `NullResourceAttributesProvider` immer `undefined` (→ `permit`).

**Entscheidung.** Ein **`CompositeResourceAttributesProvider`** ersetzt am
`RESOURCE_ATTRIBUTES_PROVIDER`-Token den Null-Provider **global**; er dispatcht per
Route-Marker (`@Fachaktion`/Controller-Metadatum) auf einen **domänen-eigenen
`StammdatenResourceAttributesProvider`**. **DI-Ort (`backend-lead` 6):** die Bindung
`RESOURCE_ATTRIBUTES_PROVIDER → CompositeResourceAttributesProvider` liegt in der
**Kompositionswurzel `AppModule`** (nicht im `AuthModule`) — der Composite injiziert den
`StammdatenResourceAttributesProvider` aus dem `StammdatenModule`; damit entsteht **keine
Rückwärtsabhängigkeit** cross-cutting → Fach-Modul (das `AuthModule` kennt kein Fach-Modul).
Dieser Resolver **fragt ausschließlich den `energy`-Namensraum** (nie `identity`):
`energy.endkunde.verarbeitungs_status`/`von_wiss_auswertung_ausgenommen`, das **aktuell
gültige** `energy.nutzungsverhaeltnis` (`gueltig_bis IS NULL`, partieller Index
`ix_nutzung_*_aktiv`) für `datenklasse`/`rolle`, und leitet `anschlussnutzerAbweichtEndkunde`
daraus ab (Rolle ≠ `eigentuemer_selbstnutzer` bzw. Anschlussnutzer-Pseudonym ≠
Endkunde-Bezug). **Alle Attribute sind Nicht-PII** (ADR-0004 Anhang B N2). Der Resolver
läuft in derselben ambienten Tx (`TransactionHost.tx`), liest also konsistent zur
Fachoperation.

**Finding A — fail-closed bei Mehrzeilen (`access-control-engineer`).** Das
EXCLUDE-Constraint verhindert Overlaps nur **je (anschlussnutzer_id, system_id)** —
eine Abfrage `WHERE system_id=? AND gueltig_bis IS NULL` kann daher **mehrere** aktuelle
Zeilen liefern (mehrere Anschlussnutzer an derselben Messstelle). Der Provider **darf
kein stilles `LIMIT 1`** nehmen: bei >1 Treffer gilt **fail-closed** — die
**restriktivste Datenklasse gewinnt** (`detailverbrauch` schlägt `abrechnungsminimum`)
bzw., wenn keine eindeutige „aktuelle" Beziehung bestimmbar ist, wird die
Ressourcen-Auflösung **restriktiv** (führt im PDP zu `deny`, nicht zu `permit`).

**Erweiterung `ResourceAttributes` (additiv):** neben den bestehenden Feldern
(`nutzungsverhaeltnis`, `datenklasse`, `vonWissAuswertungAusgenommen`, `ownerSub`) neu:
`entityTyp`, `verarbeitungsStatus` (`aktiv|gesperrt|geloescht`),
`anschlussnutzerAbweichtEndkunde`, und der **break-glass-`zugriffszweck`** (D4). Bestehende
Nutzer (Auth) bleiben unberührt (alle neu = optional).

**Verworfene Alternative:** **PDP liest Endkunde inkl. entschlüsselter PII, um „darf
sehen" zu entscheiden.** *Contra:* zieht PII in die Policy-Schicht (Linie-2-Bruch),
koppelt PDP an `identity`/Dev-KMS, macht `identity` unabtrennbar (ADR-0004 §12).

## 16. D4 — Break-glass `read:verbrauch_detail` (§6.5, DS-07)

**Regel (§6.5):** `read:verbrauch_detail` (inhaltliche Lastgänge) = **deny by default**;
**permit nur** (i) zweckgebunden/begründet, (ii) auf **Zähler + Zeitraum begrenzt**
(kein Massen-Export, kein Dauer-Dashboard), (iii) **audit-pflichtig mit Zweck-Token**.

**Mechanik.** Der **Zweck** ist ein **Request-Attribut** (Header
`X-Edms-Zugriffszweck` = **whitelisted Zweck-Code**, kein Freitext — z. B.
`stoerungsdiagnose`; plus optionaler strukturierter Begründungs-Verweis). Der
`StammdatenResourceAttributesProvider` liest ihn aus dem Request und legt ihn als
`resource.zugriffszweck = { zweckCode, zaehlerId, vonTs, bisTs }` ab. Der PDP prüft:
Zweck-Code ∈ Whitelist **und** `zaehlerId` gesetzt **und** `bisTs − vonTs ≤ MAX_FENSTER`
→ sonst `deny` (`reason: 'break_glass_grenzen_verletzt'` / `'zweck_fehlt'`). **Auch der
`permit`-Fall wird auditiert** (neues Fach-Event `stammdaten.verbrauch_detail.einsicht`,
`erlaubte_kontext_keys=['zweck_code','zaehler_ref','fenster_tage']`, `rolle_erfassen=true`,
über `/add-audit-event` in Phase 4).

**PDP deny-by-default für `read:verbrauch_detail` (PDP-Blocker 2 — schwerster Fund,
`access-control-engineer` + `backend-lead`).** Der bestehende `InCodePolicyAdapter`
folgt einem **Blacklist-Modell**: `resource === undefined` → **sofort permit**, und der
generische Fallback endet mit `permit/default_permit_v1`. Für break-glass **muss** das
Modell für diese Aktion **umgekehrt** sein. **Verbindlich:** eine **explizite Deny-Regel
für `classifyAction()==='read' && entityTyp==='verbrauch'` (bzw. jede
`read:verbrauch_detail`-Aktion) steht VOR dem generischen permit-Fallback** und lautet
**default = deny** (`reason:'break_glass_erforderlich'`); nur wenn `zugriffszweck`
**vollständig** aufgelöst ist (Zweck-Code ∈ Whitelist **und** `zaehlerId` **und**
`bisTs − vonTs ≤ MAX_FENSTER`) → `permit`. Ein **unvollständig aufgelöstes**
Zweck-Attribut (fehlender/kaputter Header, kein Provider-Treffer) rutscht damit **nicht**
durch das permit-Ende. Explizit unit-getestet (M2): fehlender Zweck → deny; überzogenes
Fenster → deny; vollständiger Zweck → permit + Audit.

**break-glass-Härtung (bindende Vorbedingung für ADR-0005, `security-lead` 11).** Bevor
der **erste echte Verbrauchs-/Lastgang-Endpoint** (ADR-0005) diese Aktion konsumiert,
sind zu erfüllen: **Begründungsverweis PFLICHT** (nicht optional), **Velocity/Quota je
Subjekt** (Anti-Massen-Einsicht), **`MAX_FENSTER` konkret fixiert** (Vorschlag: ≤ 7 Tage,
final `security-lead`/`compliance-director`), **Echtzeit-Alert an DSB/Security bei jedem
`permit`** (`Projektleitlinien`: „Break-Glass = sofort Alert + Audit") und ein **periodischer
Audit-Review als Pflichtprozess**. In diesem ADR nur als **Vorbedingung notiert** (kein
v1-Endpoint) — Umsetzung mit ADR-0005.

**v1-Realität (ehrlich):** **In v1 existiert KEIN Endpoint, der Verbrauchs-Detailinhalt
liefert** — Messwert-Lesepfade sind `measurement`/ADR-0005 (Out-of-Scope §4.2). Die
break-glass-**PDP-Logik ist gebaut und unit-testbar** (M2, wie ADR-0002 den PDP baute,
bevor ein Enforcement-Point live war); **erster realer Konsument = Verbrauchs-/
Lastgang-Endpoint (ADR-0005 / Portal)**. So bleibt die DS-07-Innensicht ohne Umbau
scharf schaltbar. `compliance-auditor` erhält Verbrauchsdetail **nur** über **denselben
auditierten break-glass-Pfad** (need-to-know), nie als Dauerrecht.

## 17. D5 — Audit-Verdrahtung (Linie 4, erster Fach-Emitter)

**Entscheidung.** Jede state-ändernde Route trägt `@AuditAction({ eventTyp,
objektRefExtractor, kontextExtractors })` mit **typisierten Extraktoren**
(`audit-action.decorator.ts`) — `objektRef` = **Pseudonym-/Entity-UUID** (nie PII),
`kontext` = **whitelisted Skalare** (z. B. `entitaet`, `status_neu`; **nie** Name/
Anschrift). Erfolg → `ok`; `ForbiddenException` (PDP-`deny`) → `denied`; sonst `error`
(bestehende `AuditActionInterceptor`-Semantik). Reine Lese-Routen ohne `@AuditAction`
sind durch den **generischen 403-Fallback** (`authz.zugriff.verweigert`) abgedeckt (M2).

**Neue Fach-Event-Typen (Katalog, via `/add-audit-event` in Phase 4 — nicht in diesem
Paket):** `domaene.objekt.verb`-Konvention, z. B. `endkunde.stammdaten.angelegt` /
`.geaendert` / `.gesperrt` / `.geschreddert`, `system.stammdaten.angelegt/geaendert`,
`zaehler.stammdaten.angelegt/geaendert/stillgelegt`, `messkanal.*`,
`messkonzept.version.angelegt`, `anschlussnutzer.stammdaten.angelegt`,
`nutzungsverhaeltnis.angelegt/beendet`, `stammdaten.verbrauch_detail.einsicht`
(break-glass, D4). **Alle PII-frei**, kontrolliertes Vokabular (ADR-0003 §13.2).
`actor_*` ausschließlich aus `SecurityContext` (Linie 1). **Kein Emitter in dieser
Phase** — nur der Katalog-/Decorator-Entwurf.

**Transaktion.** Fach-Mutationen laufen in `@Transactional(Propagation.NESTED)`
(Savepoint); der `AuditActionInterceptor` schreibt im **äußeren** Scope — die
`nestjs-cls`-Savepoint-Kette (ADR-0002 §15) garantiert, dass eine `denied`/`error`-
Audit-Zeile den Fach-Rollback überlebt. **Mehr-Namensraum-Schreibungen** (Endkunde =
`identity` + `energy`, D8) laufen in **einer** NESTED-Tx (atomar oder gar nicht).

## 18. D6 — PII-Projektion/Maskierung im Detail (Linie 2, DS-07-Innensicht)

**Problem.** Der Detail-Endpoint liefert für `betrieb` PII „soweit für Zuordnung/Pflege
erforderlich" (§6.5), für `compliance-auditor` **maskiert**. Ein Endpoint, zwei
Projektionen.

**Entscheidung.** Eine **`PiiProjektionsPolicy`** als **eigenständiges, `@Injectable`-,
unit-testbares Policy-Artefakt** (`access-control-engineer` 4 — **NICHT** Inline-
`roles.includes(...)` im Service; Studio-Regel „kein String-Matching auf Rollen im
Business-Code"). Sie entscheidet **im Mapper/Service** (nach PDP-`permit`), **ob** der
`stammdatenPii`-Block befüllt (feldentschlüsselt) oder `null` bleibt — Signatur z. B.
`darfPiiSehen(subject, resourceAttrs) → boolean`. **Fail-closed-Default: jede Rolle außer
explizit berechtigt → maskiert/`null`.** Berechtigt in v1: **`betrieb`** bei
`verarbeitungs_status='aktiv'`; **`compliance-auditor` → maskiert** (Nachweissicht ohne
Klartext-PII); `gesperrt`/`geloescht` → maskiert (Art. 18/Shredding); unbekannte/künftige
Rolle → maskiert. **Erst nach `true`** ruft der Mapper `IdentityRepository`+
`FieldCipherService` (D7/D8) — **kein PII-Entschlüsseln „auf Vorrat"**. Die Policy ist
**eigenständig getestet** (M2/M4, inkl. Fail-closed-Fall). **Fehlerausgaben** =
`problem+json` **ohne Stacktrace**; Logger **pino-redact** mit Feld-Whitelist (nie
`*_enc`, nie Klartext-PII) — `backend-nestjs.md`.

Diese Policy ist die **scharfe** Trennung hinter dem in D2 aufgelösten Auditor-Detail-
Zugang (Punkt 3): Rollen-RBAC lässt den Auditor auf die Detail-Route, die
`PiiProjektionsPolicy` liefert ihm **konsistent** eine PII-freie Projektion.

**Verworfene Alternative:** **Zwei getrennte Endpoints** (`/detail` mit PII vs.
`/detail-nachweis` ohne). *Contra:* dupliziert Route/Contract/Tests, verlagert die
Trennung von der Policy in die URL (drift-anfällig, ein vergessenes `@Roles` leakt PII).

## 19. D7 — Feld-Verschlüsselung, `KeyManagementPort` & Dev-KMS (F3, Linie 5)

**Envelope (ADR-0004 §15).** AES-256-GCM je PII-Feld; **ein DEK je Subjekt** (256 bit),
DEK **vom KMS-Master-Key gewrappt** in `identity.subjekt_schluessel` (`wrapped_dek`,
`kms_key_id`, `alg_version=1`). **Klartext-DEK/-Key liegt nie in der DB.** Krypto =
Node-**built-in `crypto`** (`createCipheriv('aes-256-gcm')`, `randomBytes`, HKDF optional)
— **keine neue Dependency**.

**Byte-Layout — WIDERSPRUCH aufgelöst (`security-lead` 9).** ADR-0004 §15 skizziert
`ciphertext||nonce||tag`, dieser ADR zuvor `nonce||ciphertext||tag`. **Maßgeblich (final):
`nonce(12B) || ciphertext || tag(16B)`** (self-describing: Nonce am Anfang, GCM-Tag am
Ende — Standard-Layout, deterministisch parsebar). ADR-0004 ist **accepted → nicht
editiert**; das Byte-Layout ist ein **Implementierungsdetail**, für das **diese Fassung
(ADR-0008 §19) maßgeblich** ist — bei der `/add-migration`-/Impl.-Umsetzung ist das als
**Korrektur/Präzisierung zu ADR-0004 §15** zu kennzeichnen (kein Schema-Bruch:
`identity.*_enc` bleibt `bytea`).

**AAD (Associated Data) — kanonisch fixiert.** Jedes Chiffrat bindet an
`subjekt_id` **und** `feldname`, aber **NICHT als bloße Konkatenation** (Injektions-/
Ambiguitäts-Risiko), sondern **längen-präfixiert** (z. B. `LP(subjekt_id) ‖ LP(feld)`
mit fester Feldlänge/`uint32`-Längenpräfix, analog zum Audit-Hash-Kanon ADR-0003 §Anhang),
sodass `("ab","c")` ≠ `("a","bc")`. Verhindert Feld-/Subjekt-Vertauschen eindeutig.

**Ports (Hexagonal).**
- `KeyManagementPort` (Interface): `generateDataKey() → { dek, wrappedDek, kmsKeyId,
  algVersion }`, `unwrapDek({ wrappedDek, kmsKeyId, algVersion }) → dek`. **Prod-Adapter**
  = Cloud-KMS `GenerateDataKey`/`Decrypt` (AWS KMS / Azure Key Vault) — der Master-Key
  verlässt das HSM nie. **Dev-Adapter** = **`LocalDevKmsAdapter`**.
- `FieldCipherService`: `encrypt(plaintext, subjektId, feld) → bytea`,
  `decrypt(bytea, subjektId, feld) → plaintext` — nutzt `KeyManagementPort` zum
  Un-/Wrappen, AES-256-GCM mit frischem `nonce` je Chiffrat + AAD.
- `KryptoShreddingService.shred(subjektId)`: setzt `subjekt_schluessel.key_state=
  'geschreddert'`, `geschreddert_at=now()`, überschreibt/entfernt `wrapped_dek` →
  Un-Wrap unmöglich → alle Chiffrate unwiederbringlich; zusätzlich
  `identity.*_pii.pii_status='geloescht'` + `pseudonym_id`-Mapping neutralisieren +
  `energy.endkunde.verarbeitungs_status='geloescht'` (Art. 17, ADR-0004 §16). Audit
  `…geschreddert` (Linie 4). **Fach-/Messdaten (`energy`/`measurement`) bleiben — jetzt
  anonym.**

**Dev-KMS-Entscheidung: `LocalDevKmsAdapter` (datei-/env-basierter Keystore).** Der
Dev-Master-Key (32 B) wird **aus Env/Dev-Volume** geladen (`EDMS_DEV_KMS_MASTER_KEY`
base64 **oder** Pfad auf eine gitignorierte Keystore-Datei außerhalb des Repos), wrappt
DEKs mit AES-256-GCM. **Schlüssel NIE im Repo** (Linie 5, F6-Bedingung 4); **kein
Prod-Zugriff** (getrennt vom Prod-KMS). Startup-**Self-Check** (D8-nah): fehlt der
Dev-Key → **harter Fehlstart** (fail-closed, kein Nulldefault). `kms_key_id` trägt eine
**Dev-Kennung** (`dev-local:v1`), damit ein Chiffrat seinen Ursprung deklariert und ein
versehentlicher Prod-Un-Wrap-Versuch erkennbar ist. **Prod-Austauschbarkeit:** nur der
Adapter am `KeyManagementPort` wechselt (Cloud-KMS-SDK), Envelope/Schema/Services
unverändert.

**Verworfene Alternativen.** (i) **`pgcrypto`/`pgp_sym_encrypt`** — bereits in ADR-0004
§15 verworfen: Schlüssel in DB-Session/`pg_stat_statements`/Logs, kein per-Subjekt-
Shredding, DBA sieht Klartextpfad. (ii) **Echtes Cloud-KMS schon in Dev** — verletzt
F6-Bedingung 4 (Dev-KMS Dev-only, kein Prod-Zugriff), erzeugt Infra-/AVV-/Kosten-
Vorwirkung, koppelt Dev an Netz/Cloud-Creds. (iii) **KMS-Master-Key als Env-Konstante
im Repo/Compose-Default** — Linie-5-Bruch (Schlüssel im Repo). **Lizenz-Check:** v1 =
Node-`crypto` (built-in) → **keine neue Dependency**. Prod-KMS-SDK **später** in der
Deployment-/ADR-0005-Phase: `@aws-sdk/client-kms` = **Apache-2.0** ✓ **oder**
`@azure/keyvault-keys` = **MIT** ✓ (beide Whitelist) — **jetzt NICHT eingezogen**.

**Review-Nachträge (2026-07-13).**
- **KMS-Roundtrip NICHT innerhalb der offenen Tx (`backend-lead` 8, Prod-Adapter-
  Constraint).** Ein Cloud-KMS-`GenerateDataKey`/`Decrypt` ist ein **Netz-Roundtrip** —
  er **darf nicht** innerhalb der offenen Fach-/NESTED-Tx laufen (hält DB-Verbindung +
  Segment-Lock über eine Netz-Latenz auf, Contention/Timeout-Risiko). **Constraint:** DEK
  **vor Tx-Beginn** ziehen/entpacken (unwrap), Tx nur für die reinen DB-Schreibungen der
  bereits im Speicher liegenden Chiffrate öffnen. Der `LocalDevKmsAdapter` ist ohnehin
  lokal/synchron; der Constraint gilt verbindlich für den **Prod-Adapter**.
- **Krypto-Shredding-Backup-Lücke (`security-lead` 10, Risiko HOCH).** Ein **Restore
  eines Pre-Shredding-Backups** stellt `wrapped_dek` wieder her (der Master-Key rotiert
  nicht mit) → die **Art.-17-Garantie ist über Backups unterlaufbar**. **Nicht
  v1-blockierend** (kein Prod-Betrieb, synthetic-only), aber als **dokumentiertes
  Residualrisiko/TOM** und **Folgeauftrag** (`retention-engineer`/`storage-engineer`/
  `compliance-director`) festgehalten: Backup-Retention-Fenster + Master-Key-Rotation +
  Shredding-Nachlauf auf Backups koordinieren (§30 OP-Liste C).
- **`shred:*` braucht erhöhte Kontrolle (Finding B, `access-control-engineer`).** Das
  irreversible Krypto-Shredding läuft **nicht** allein über `@Roles('betrieb')`, sondern
  bekommt eine **eigene, strengere ABAC-Regel** (Vier-Augen-/Freigabe-Prinzip). Phase-3/4-
  Punkt (§30 OP-Liste C); v1-Contract trägt bereits die explizite
  `KryptoShreddingAnweisung` (Bestätigungs-Token + whitelisted Grund) als Fehlbedien-Schutz.

## 20. D8 — Repository-/Service-Schicht (query-basiert, Namensraum-Trennung)

**Datenzugriff.** **Query-basiert über `EntityManager.query(...)`** auf der ambienten
`TransactionHost.tx` — **keine** TypeORM-`@Entity`-Klassen. Begründung: `database.module.ts`
hält `synchronize:false`, `migrationsRun:false`, `entities:[]`; **einzige Schema-Quelle
ist `migrations/**`**. `AuditService` setzt genau dieses Muster bereits (`SELECT * FROM
audit.append_event(...)` über `txHost.tx`). Roh-SQL wird **parametrisiert** (Safe-SQL-Hook)
und die Zeilenform **explizit auf ein `RowType` gebunden** (kein `any`-Durchsickern, wie
in `audit.service.ts` vorgemacht). **Verworfen:** TypeORM-Entities — dupliziert das
Schema in TS, Drift-Risiko gegen `migrations/**`, verlockt zu `synchronize`, bringt
keinen Mehrwert bei bekanntem, festem Schema. **mapRow-Konventions-Helfer verbindlich
(`backend-lead` 8):** die Zeilen→DTO-Bindung läuft je Repository über eine **einheitliche
`mapRow`-Konvention** (eine typisierte Mapper-Funktion je `RowType`, kein ad-hoc-Mapping
pro Query), um Boilerplate-Drift und `any`-Durchsickern zu vermeiden.

**Namensraum-Trennung (Linie 5, ADR-0004 §11/§12).** **Getrennte Repository-Familien:**
`Energy…Repository` fragt **nur `energy.*`**; `Identity…Repository` fragt **nur
`identity.*`**. **Kein cross-namespace-JOIN.** Die Kopplung `pseudonym_id ↔ energy.*.id`
wird **in der App** aufgelöst (zwei Queries), nie per SQL-`JOIN`/`REFERENCES` — damit
bleibt `identity` physisch abtrennbar (späterer Vault, ADR-0004 §5.3/O). Beispiel
**Endkunde anlegen** (eine NESTED-Tx): (1) DEK generieren (`KeyManagementPort`) →
`identity.subjekt_schluessel`; (2) PII feldverschlüsseln (`FieldCipherService`) →
`identity.endkunde_pii` (`pseudonym_id` = neue Endkunde-UUIDv7); (3) `energy.endkunde`
(Pseudonym-Anker). Reihenfolge FK-korrekt; alles atomar; App setzt `pseudonym_id`.
(DEK-Beschaffung via KMS liegt **vor** dem Tx-Beginn, D7-Constraint.)

**Referenzkonsistenz app-seitig prüfen (`backend-lead` 7).** Da es **keine
cross-namespace-FK** und beim Nutzungsverhältnis keine DB-erzwungene
Endkunde-Kohärenz gibt, **muss der Service vor dem Insert** per `SELECT` sicherstellen,
dass `anschlussnutzer.endkunde_id` **und** `system.endkunde_id` zum übergebenen
`endkundeId` passen — **Mismatch → 400/409** (nicht stumm anlegen). Analog prüfen
Create-Pfade die Zugehörigkeit (z. B. Messkanal→Zähler, Zähler→System) in derselben Tx.

**„Löschen" als Service-Operationen.** `EndkundeService.sperren(id)` (Art. 18 →
`verarbeitungs_status='gesperrt'` + `identity.pii_status='gesperrt'`, idempotent);
`KryptoShreddingService.shred(id)` (Art. 17, D7); `ZaehlerService.stilllegen` /
`MesskanalService.stilllegen` (`status='stillgelegt'`, idempotent). **Kein Hard-Delete**
(Linie 3). DELETE-Routen sind damit **idempotent** (`api-contracts.md`): erneuter Aufruf
auf bereits gesperrt/stillgelegt → unveränderter Zustand, gleicher 2xx.

**Modul.** Neues `StammdatenModule` (Controller dünn → Services → Repositories +
Krypto-/KMS-Adapter), bindet den `CompositeResourceAttributesProvider` (D3) am globalen
Token, registriert `LocalDevKmsAdapter` am `KeyManagementPort` (Dev). Contracts:
Controller-Endpoints **exakt** nach `stammdaten.openapi.yaml`; **Contract-Test je
Endpoint** + **Integrationstest gegen Testcontainer-PG+Timescale** (V0002 migriert),
**Rolle × Route × Datenklasse**-Matrix (M1/M2), **PII-Leak-Scan** über Responses/Logs
(M4) — alles synthetisch (M6).

## 21. D9 — Ein Domänen-Contract statt je-Ressource-Split

**Entscheidung.** **Eine** Datei `schemas/openapi/stammdaten.openapi.yaml` für alle
Stammdaten-Ressourcen **inkl. `/monitoring/vollstaendigkeit`**. Gründe: gemeinsame
Komponenten (`Problem`, `SeitenInfo`/Cursor, `IdempotencyKey`-Header, PII-Marker) werden
**einmal** definiert; der generierte Client bildet **eine `generated/stammdaten.ts`**
(Muster `health`/`auth`, eine `apiClient`-Instanz, `client.ts`); die abweichende
ABAC-Aktion des Monitoring-Pfads (`read:monitoring`) ist **pro Operation** ausgedrückt
(`@Fachaktion` + `@Roles`), nicht per Datei. **Verworfen:** je-Ressource-Split — würde
die geteilten Komponenten vervielfachen und mehrere `generated/*`-Stems erzeugen ohne
fachlichen Grenznutzen (die Ressourcen sind ein Aggregat).

## 22. D10 — Synthetic-only-Erzwingung + CI-PII-Guard (F6-Bedingung 1/2, Linie 5)

**Wahrheitsquelle & Laufzeit-Schalter (`security-lead` 12).** Eine **eindeutige
`EDMS_ENV_CLASS = dev | staging | prod`** ist die **Wahrheitsquelle** des Self-Checks
(statt mehrerer Heuristik-Signale). Dazu das Flag **`EDMS_SYNTHETIC_ONLY`**, **Default
`true`**. Ein **Startup-Self-Check** (fail-closed) erzwingt Kohärenz:
- `EDMS_SYNTHETIC_ONLY=true` ⇒ es **muss** der `LocalDevKmsAdapter` (Dev-KMS) aktiv sein
  **und** `EDMS_ENV_CLASS ≠ prod` — sonst **Fehlstart** (verhindert versehentlichen
  Real-PII-Betrieb auf Dev-Krypto).
- `EDMS_SYNTHETIC_ONLY=false` ⇒ nur zulässig bei `EDMS_ENV_CLASS=prod` **und** gesetzten
  **Gate-Markern** (DSFA-active, Consent-Enforcement, DE-Only/AVV/TIA — §0/ADR-0004 §7.1)
  **und** gebundenem Prod-`KeyManagementPort`; sonst **Fehlstart**. **Härtung (nicht nur
  selbst-attestierte Config-Flags):** die Gate-Marker liegen in einem **geschützten
  Config-Store**, und der Umschaltakt läuft über ein **CI/CD-Deploy-Gate mit
  Pflicht-Referenz auf ein `compliance-director`-Freigabeartefakt** (Folgeauftrag
  `devops-lead`, §30 OP-Liste C). Das Umschalten ist der **dokumentierte, gate-pflichtige
  Punkt** (F6-Bedingung 5). Der Bau/Betrieb mit `true` verletzt Gate-Bedingung 6 nicht;
  der Real-Betrieb (`false`) ist der gate-pflichtige Akt (§0).

Der Schalter ist **kein** Inhalts-Detektor (echt vs. synthetisch ist zur Laufzeit nicht
unterscheidbar) — seine Wirkung ist die **strukturelle Kopplung** „PII-Schreibpfad ⇄
Dev-KMS/Dev-DB ⇄ geschlossenes Gate". **PFLICHT (nicht optional, `security-lead` 12):**
ein **`SyntheticOnlyInterceptor`** setzt auf PII-Schreibrouten bei `true`
`kontext.synthetic=true` ins Audit (Nachweis-Spur) — `synthetic` gehört zur
`erlaubte_kontext_keys`-Whitelist der betroffenen Fach-Event-Typen (§17).

**CI-Guard (Skizze, Umsetzung Phase 4).** Blockierender CI-Job, zweigeteilt:
1. **Seeds/Fixtures-Scan** — Muster-Scan (Namen/Anschriften/Kontakt/Zähler-/devEUI-
   Muster) **plus Positiv-Allowlist**: alle synthetischen Daten **müssen** reservierte
   Marker nutzen (`@example.invalid`-Domains, `Musterstraße`/`Testkunde …`, reservierte
   devEUI-Präfixe) — alles außerhalb der Allowlist ⇒ **rot**. Baut auf dem vorhandenen
   `.claude/hooks/pre-write-pii-scan.sh` (write-time) als **CI-Gegenstück** auf.
2. **Response-/Log-Scan** — Integrationstest-Assertion: Listen-Responses enthalten **kein**
   PII-Feld; Detail-Responses nur die **projektions-erlaubten** Felder (D6); Logs
   enthalten **kein** `*_enc`/Klartext-PII (pino-redact verifiziert). Deckt M4/M6.

## 23. D11 — Betriebs-UI (Skizze, Impl. Phase 4)

**Views (`src/frontend/src/features/stammdaten/…`, deutsche Strings aus
`shared/i18n/de.json`, A11y, Route-Split + Error-Boundary je Route):**
- **Endkunden-Liste** — Tabelle: Pseudonym-`id` (gekürzt), `verarbeitungs_status`,
  `consent_status` (Badge), `von_wiss_auswertung_ausgenommen`, `createdAt`; **kein Name**
  (Linie 2). Cursor-Pagination, TanStack Query.
- **Endkunde-Detail** — `stammdatenPii` (Name/Anschrift/Kontakt) für `betrieb` sichtbar,
  für `compliance-auditor` **maskiert** (`•••`, D6); darunter Systeme/Zähler/Messkonzept-
  Version-Zusammenfassung/Nutzungsverhältnisse. **Kein Verbrauchsinhalt** (nur ADR-0005/
  break-glass).
- **Anlegen-/Bearbeiten-Formulare** (Endkunde, System, Zähler, Messkanal,
  Anschlussnutzer, Nutzungsverhältnis) — **Zod**-Validierung (Schemas tw. mit Backend
  geteilt), Client-generierter **`Idempotency-Key`** je Submit, semantisches HTML/
  Tastatur-Flow.
- **Messkonzept-Ansicht** — Versionsliste + **read-only** Versions-Detail; „**neue
  Version anlegen**" (7 TB-01-Pflichtinhalte + Energieträger/Baseline-Zeilen); **kein
  Editieren** bestehender Versionen (Linie 3).
- **Vollständigkeits-/Lücken-Dashboard (DE-02, M5)** — je Endkunde/System/Zähler:
  fehlendes Messkonzept, fehlender Zähler, kein aktiver Consent-Slot, keine
  Mindestauflösungs-Zusage; **nur Metadaten** (`read:monitoring`), **kein
  Verbrauchsinhalt, keine PII**.
- **Client:** generierter `openapi-fetch`-Client (eine `apiClient`-Instanz, `paths`-Union
  um `stammdaten` erweitert — `src/shared/src/api/client.ts`); Access-Token nur im Memory.
- **Maskierte Felder:** Name/Anschrift/Kontakt (PII, rollenabhängig); **`geraeteReferenz`
  existiert nicht** (§12); nirgends Lastgänge/Verbrauch.

## 24. Konsequenzen (Teil B)

**Positiv.** Erste Fach-Nutzung von Guard/PDP/Audit auf FACH-Routen; der PII-Schreib-/
Krypto-/Shredding-Pfad ist **real getestet**, bevor echte PII fließt (F3); DS-07-Innensicht
+ break-glass **PDP-ready ohne Umbau**; Listen sind **schema-erzwungen PII-frei**;
**keine neue Dependency, kein neues Drittsystem**.

**Negativ.** Dev-KMS + Envelope-Krypto + Key-Lifecycle erhöhen Komplexität/Testlast;
`CompositeResourceAttributesProvider` + `@Fachaktion` + PII-Projektion sind zusätzliche
Policy-Infrastruktur mit hoher Testmatrix (Rolle × Route × Datenklasse × Sperr-Zustand);
Mehr-Namensraum-Create in einer NESTED-Tx ist sorgfaltspflichtig.

**Neutral.** Setzt das Fach-API-Muster (query-basierte Repos, `@Fachaktion`/PDP-Nutzung,
`@AuditAction`, KMS-Port), an das ADR-0005 ff. gebunden sind.

## 25. Phase-2-Gates (Workflow `2-design`)

- [x] **„ADR review-ready"** — Teil B auf `proposed` ausgebaut (Entscheidungen D1–D11 je
  mit verworfener Alternative), `schemas/openapi/stammdaten.openapi.yaml` vorhanden.
  **Alle drei Lead-Reviews abgeschlossen und eingearbeitet** (`backend-lead` +
  `security-lead` + `access-control-engineer`, 2026-07-13, Änderungsprotokoll §30, inkl.
  zwei behobener PDP-Blocker) — **Gate belegt**. Verbleibend: **User-Freigabe** (§29).
- [x] **„Breaking Changes identifiziert" — keine (additive API).** Neue Routen/Modul;
  die globale Guard-/Interceptor-Kette greift unverändert; `PolicyAction`-Union +
  `ResourceAttributes` **additiv** erweitert; der `RESOURCE_ATTRIBUTES_PROVIDER`-Wechsel
  Null→Composite ist verhaltensadditiv (Null lieferte `undefined`→`permit`; Composite
  liefert für Nicht-Stammdaten-Routen weiterhin `undefined`). Keine API-Vorversion,
  keine Consumer.
- [x] **„DSGVO-relevante Datenfelder markiert"** — §26 + Contract-Kopf.

## 26. DSGVO-Feld-Markierung (Linie 2, DS-07/DS-10)

| Feld / Response | Klasse | Sichtbarkeit / Maskierung |
|---|---|---|
| `identity.endkunde_pii.name_enc/anschrift_enc/kontakt_enc` → `EndkundeDetail.stammdatenPii.*` | **direkt-PII** (feldverschlüsselt) | **nur** Detail, **nur** `betrieb`, **nur** `verarbeitungs_status=aktiv`; sonst `null` (D6). Nie in Liste/Log (`*_enc` pino-redact). |
| `identity.anschlussnutzer_pii.name_enc/kontakt_enc` → `AnschlussnutzerDetail.stammdatenPii.*` | **direkt-PII Datensubjekt (DS-07)** | wie oben; **DS-07-Innensicht** — nur soweit für Zuordnung/Pflege erforderlich. |
| `energy.*.id` (Endkunde/Anschlussnutzer/System/Zähler/Messkanal) | **Pseudonym-Surrogat** (Nicht-PII) | frei in Liste/Detail — Außenschlüssel (Linie 2). |
| `energy.nutzungsverhaeltnis.datenklasse/rolle` | Nicht-PII (ABAC-Steuergröße) | Detail/Struktur-Lesepfad; **speist den PDP** (N2). |
| `energy.endkunde.consent_status/_text_version/_ref_id` | Nicht-PII-Slot | anzeigen/respektieren, **nicht** erfassen (Consent-ADR). |
| `energy.endkunde.von_wiss_auswertung_ausgenommen` | Nicht-PII (DE-04-Flag) | Liste/Detail; PDP-Eingabe. |
| `X-Edms-Zugriffszweck` (break-glass) | Zweck-Code (Nicht-PII, whitelisted) | Request-Header; **audit-pflichtig** (D4). |
| `problem+json` | Fehler | **kein** Stacktrace, **kein** roher DB-/Krypto-Fehlertext, **keine** PII (DS-10). |

## 27. Neue Abhängigkeiten (Lizenz-Check)

**v1: keine.** Krypto = Node-built-in `crypto`; PDP/Repos/Provider = in-code; Audit/Tx =
bestehend (`jose`, `nestjs-cls`, `@nestjs-cls/transactional` — alle MIT ✓); Client =
`openapi-fetch` (bestehend). **Später (nicht dieses Paket):** Prod-KMS-SDK
`@aws-sdk/client-kms` (**Apache-2.0** ✓) **oder** `@azure/keyvault-keys` (**MIT** ✓) beim
Bau des Prod-`KeyManagementPort`-Adapters (Deployment/ADR-0005). **Kein neues Drittsystem**
(keine DB/Queue/Cache) — Monolith bleibt.

## 28. Bezug zum ADR-0004-Gate (§0)

Dieses Design **öffnet das Gate nicht.** Es baut die Fach-API **synthetic-only**
(`EDMS_SYNTHETIC_ONLY=true` Default, D10) gegen Dev-KMS/Dev-DB; der Umschalt-Punkt auf
Real-PII (`false`) ist fail-closed an die Gate-Marker + `compliance-director`-Freigabe
gebunden. Der **produktive Real-PII-Betrieb** bleibt der gate-pflichtige Akt (DSFA-active,
Consent, DE-Only/AVV/TIA, Audit-Log produktiv).

## 29. Konsolidierte Offene-Punkte-Liste (für User-Freigabe)

Alle drei Lead-Reviews sind **eingearbeitet** (§30). Für die **User-Freigabe** die
Punkte, dreigeteilt nach Fälligkeit:

### (A) VOR Phase-4-Implementation zu fixierende Design-Punkte (jetzt entschieden, umzusetzen)
- **A1 (Blocker 1):** `InCodePolicyAdapter` von **Literalvergleich `'read'`** auf
  **`classifyAction()`/`startsWith('read')`** umstellen + Pflicht-Regressionstests
  (Auditor×Detail→permit; DE-04 feuert bei `read:stammdaten`). (§14)
- **A2 (Blocker 2):** **deny-by-default-Regel für `read:verbrauch_detail` VOR** dem
  generischen permit-Fallback im PDP; unvollständiger Zweck ⇒ deny. (§16)
- **A3 (Punkt 3):** Auditor **erreicht** Detail-Routen (`@Roles('betrieb',
  'compliance-auditor')`), `PiiProjektionsPolicy` maskiert — M1-Matrix entsprechend. (§14/§18)
- **A4 (Punkt 4):** `PiiProjektionsPolicy` als **injectable, unit-testbares** Artefakt,
  **fail-closed-Default** (jede nicht-explizit-berechtigte Rolle → maskiert). (§18)
- **A5 (Punkt 6):** `RESOURCE_ATTRIBUTES_PROVIDER → CompositeResourceAttributesProvider`
  in **`AppModule`** (Kompositionswurzel), Stammdaten-Resolver aus `StammdatenModule`
  injiziert — keine cross-cutting→Fach-Rückwärtsabhängigkeit. (§15)
- **A6 (Punkt 8):** `@Fachaktion` via **`getAllAndOverride([handler,class])`**;
  **mapRow-Konventions-Helfer** verbindlich. (§14/§20)
- **A7 (Punkt 9):** Byte-Layout **final `nonce||ciphertext||tag`** (Korrektur-Vermerk zu
  ADR-0004 §15); **AAD längen-präfixiert** kanonisch. (§19)
- **A8 (Finding A):** `StammdatenResourceAttributesProvider` **fail-closed bei Mehrzeilen**
  (restriktivste Datenklasse gewinnt / deny), kein stilles `LIMIT 1`. (§15)

### (B) Phase-4-Umsetzung (Impl.-Arbeitspakete)
- **B1 (Punkt 5):** **V0005-Migration** — `energy.system.status` (`aktiv|stillgelegt`);
  danach System-DELETE=Stilllegung + transitive Sperre bei Endkunde-Sperre (additiv). (§12)
- **B2 (Punkt 7):** Service prüft vor Nutzungsverhältnis-Insert per `SELECT`, dass
  `anschlussnutzer.endkunde_id`/`system.endkunde_id` zum `endkundeId` passen (400/409). (§20)
- **B3:** `PiiProjektionsPolicy`, `FieldCipherService`, `KryptoShreddingService`,
  `LocalDevKmsAdapter`, `SyntheticOnlyInterceptor`, query-basierte Repos + mapRow,
  `@Fachaktion`-Decorator; **neue Fach-Event-Typen** über `/add-audit-event` (§17); CI-PII-
  Guard (§22); KMS-Roundtrip **vor** Tx (Prod-Adapter-Constraint, §19). (§17/§19/§20/§22)

### (C) Folgeaufträge / spätere Vorbedingungen (außerhalb v1)
- **C1 (Punkt 10):** **Krypto-Shredding-Backup-Lücke** — Backup-Retention ↔
  Master-Key-Rotation ↔ Shredding-Nachlauf koordinieren; als Residualrisiko/TOM.
  (`retention-engineer`/`storage-engineer`/`compliance-director`). (§19)
- **C2 (Punkt 11):** **break-glass-Härtung** (Begründung Pflicht, Velocity/Quota,
  `MAX_FENSTER`, Echtzeit-DSB-Alert, periodische Review) — **bindende Vorbedingung für
  ADR-0005** (erster Verbrauchs-Endpoint). (§16)
- **C3 (Punkt 12):** **`EDMS_SYNTHETIC_ONLY=false`-Umschaltpunkt** technisch absichern —
  geschützter Config-Store + CI/CD-Deploy-Gate mit Pflicht-Referenz auf
  `compliance-director`-Freigabeartefakt. (`devops-lead`). (§22)
- **C4 (Finding B):** **`shred:*` Vier-Augen-/eigene-ABAC-Regel** statt bloßem
  `@Roles('betrieb')`. (Phase 3/4, `access-control-engineer`/`compliance-director`). (§19)
- **C5 (Phase 3, `compliance-director`):** DSFA-0001-Nachtrag (CRUD + Feld-Verschlüsselung
  + **DS-07-Innensicht = substanziell**), RVT VT-0001, TOM-Zusatz (Fach-API-Zugriffs-
  kontrolle/Data-Masking/Löschen=Sperre/Envelope-Krypto), R-0004 (synthetic-only), ISO
  A.5.15/5.18/5.34/8.3/8.11/8.24/8.15; Freigabe des Umschaltpunkts.

**Neu aus der Phase-4-Implementierungs-Review (2026-07-14, §30-Nachtrag) — bindende
Vorbedingungen für ADR-0005 (Cloud-KMS / erster Verbrauchs-Endpoint):**
- **C6 (backend-lead + security-lead):** **KMS-Roundtrip liegt faktisch doch in offener
  Tx.** Der in B3/§19 als „vor Tx" verbuchte Constraint ist **nur relativ zur inneren
  `Propagation.Nested`-Tx** erfüllt, **nicht** relativ zur äußeren: der globale
  `TransactionInterceptor` öffnet für jeden Request (außer `@SkipTransaction`) bereits
  **vor** dem Controller eine `Propagation.Required`-Tx mit sofortigem `BEGIN` — die
  DB-Connection ist während `generateDataKey()`/`unwrapDek()` gehalten. Für den synchronen
  `LocalDevKmsAdapter` (kein Netz) **folgenlos**; vor Einführung eines echten Cloud-KMS-
  Adapters **architektonisch zu lösen** (eigener Nicht-Tx-Ausführungskontext für KMS-
  Calls, z. B. `@SkipTransaction` + manuell nach dem KMS-Call geöffnete `Required`-Tx auf
  den PII-Schreibrouten). Code-Kommentare in `key-management.port.ts`/`endkunde.service.ts`
  am 2026-07-14 präzisiert. (`backend-lead`/`security-lead`, vor ADR-0005). (§19)
- **C7 (access-control-engineer):** **`datenklasse`/`anschlussnutzerAbweichtEndkunde`**
  werden vom Provider fail-closed aufgelöst, aber vom `InCodePolicyAdapter` **noch nicht
  konsumiert** (v1 hat keinen Verbrauchsdetail-Endpoint). Die „restriktivste Datenklasse
  gewinnt"-Garantie ist **vorverdrahtet, aber wirkungslos** — vor dem ersten realen
  `read:verbrauch_detail`-Konsumenten explizit re-verifizieren, dass diese Attribute
  tatsächlich in eine Deny-Entscheidung einfließen. (vor ADR-0005). (§15/§16)
- **C8 (access-control-engineer):** `zugriffszweck.util.ts` (break-glass-Header-Extraktion)
  hat **keine eigene Unit-Spec** — direkte Tests (Array-Header, leere Strings, Multi-Header)
  vor ADR-0005 ergänzen. Risiko gering (keine Whitelist-/Fensterprüfung dort). (§16)
- **C9 (security-lead, Härtung):** `LocalDevKmsAdapter.wrap()/unwrap()` bindet die AAD nur
  an eine feste Versionskonstante, **nicht** an `subjekt_schluessel.id`/`kms_key_id` — ein
  zeilenübergreifend vertauschtes `wrapped_dek` würde auf dieser Schicht unbemerkt entpackt
  (End-to-End aktuell durch die Feld-AAD in `FieldCipherService` abgefangen, daher nicht
  ausnutzbar). Beim Prod-Cloud-KMS-Adapter mit `EncryptionContext`/AAD auf Zeilen-/
  Schlüssel-Identität binden. (§19)

**Neu aus der Phase-4-Testabdeckung (2026-07-14, §30.2 — beim Testschreiben gefundene
Produkt-/Schema-Befunde):**
- **C10 (test-engineer → `database-lead`/`postgres-engineer`):** `UNIQUE (zaehler_id,
  messgroesse, obis_kennzahl)` (V0002) **schützt NICHT vor Duplikaten, wenn
  `obis_kennzahl` NULL ist** (Postgres wertet zwei NULL in UNIQUE nicht als gleich). Da
  `obisKennzahl` nur bei Strom gesetzt ist, bleiben alle anderen Energieträger (Wärme,
  Kälte, Gas, Öl, Biomasse) ohne Duplikatschutz — obwohl der Migrations-Kommentar ihn
  verspricht. Fix-Kandidat: `UNIQUE NULLS NOT DISTINCT` (PG ≥ 15, **neue Migration** +
  User-Freigabe) oder App-seitiger Pre-Check. Nicht v1-blockierend (synthetic-only), aber
  vor produktivem Messkanal-Anlegen zu schließen. Regressionsnachweis dokumentiert in
  `messkanal.integration.spec.ts`.
- **C11 (test-engineer → `audit-trail-engineer`/`compliance-director`):** **App-/DB-
  Inkonsistenz bei `null` im Audit-Kontext.** `AuditKontextValue` (`audit-envelope.dto.ts`,
  `KontextIsScalarMapConstraint`) lässt JSON `null` ausdrücklich zu; der DB-Seal-Trigger
  `audit.event_seal()` (V0003) akzeptiert aber nur `string|number|boolean` und wirft bei
  `null`. Der Messkonzept-500-Bug (§30.2) war die erste Ausprägung — punktuell gefixt
  (Extraktor ohne `?? null`), aber **solange App und DB nicht vereinheitlicht sind, bleibt
  jeder künftige Kontext-Extraktor, der `null` liefert, eine latente 500-Falle.**
  Entscheidung nötig: `null` aus `AuditKontextValue` entfernen (Typ verbietet es → Fehler
  zur Compile-/Validierungszeit) ODER Trigger auf `null` erweitern. (vor weiteren
  `@AuditAction`-Kontext-Extraktoren).

- **C12 (`backend-lead` + `access-control-engineer` + `compliance-director`, → D12):**
  **Klartext-Namen in Listen über einen separaten, auditierten Auflösungs-Endpunkt**
  (`POST /stammdaten/endkunden/labels`, Fachaktion `read:endkunde_pii`, Audit
  `endkunde.pii.einsicht`). Entschieden am 2026-08-26, **nicht umgesetzt** — Auflagen
  A1–A10 und Umsetzungsreihenfolge siehe **D12**. Anlass: Endkunden sind in Listen und
  Auswahlfeldern ausschließlich über ein UUID-Präfix identifizierbar; der
  `compliance-director` bewertet den heutigen Zustand als **Fehlzuordnungsrisiko nach
  Art. 5 Abs. 1 lit. d**, das in Nutzerinformation und BAFA-Nachweis fortwirkt. Offener
  Punkt **K14** (Antwortform) wartet auf `technical-director`.
- **C13 (`audit-trail-engineer` + `backend-lead`, Mangel M-1, → D12 §8):** **Der
  Klartext-Namensabruf auf der Endkunde-Detailseite wird nicht protokolliert**
  (`endkunde.controller.ts`, `@Get(':endkundeId')` ohne `@AuditAction`) — anders als
  `standort.pii.einsicht`, `einflussgroesse.stammdaten.einsicht` und
  `stammdaten.verbrauch_detail.einsicht`. Die Wirksamkeit der `PiiProjektionsPolicy` ist
  damit **behauptet, nicht belegbar** (Art. 32 Abs. 1 lit. b i. V. m. Art. 5 Abs. 2).
  **Vor `EDMS_SYNTHETIC_ONLY=false` zu beheben**; auf User-Entscheidung getrennt von C12
  geführt. Als nummerierte Zeile in `ADR-0005 §31` aufzunehmen (D12 §8, K2) — die
  Nennung hier allein begründet keine Durchsetzung.

## 30. Änderungsprotokoll (Review-Einarbeitung, 2026-07-13)

**Zwei PDP-Blocker (von `access-control-engineer` + `backend-lead` unabhängig gefunden):**
- **Literalvergleich-Falle** (`in-code-policy.adapter.ts:30,39` prüft hart `'read'`) →
  `classifyAction()`/`startsWith('read')` + Regressionstests. Ohne Fix: DS-01-Bruch
  (Auditor-Reads als Schreib abgelehnt) + DE-04-Regel feuert nie. (§14, A1)
- **Fallback „permit by default"** (`resource===undefined`/Ende `default_permit_v1`) →
  **deny-by-default-Regel für `read:verbrauch_detail` VOR** dem permit-Fallback. (§16, A2)

**`access-control-engineer`:** D2/D6-Widerspruch aufgelöst (Auditor erreicht Detail +
Maskierung als 2. Linie, §14/§18); `PiiProjektionsPolicy` injectable + fail-closed (§18);
`energy.system`-`status` als V0005 (§12); Provider fail-closed bei Mehrzeilen (Finding A,
§15); `shred:*` Vier-Augen (Finding B, §19).

**`backend-lead`:** Composite-Provider-DI in `AppModule` (§15); Nutzungsverhältnis-
Referenzkonsistenz per `SELECT` (§20); `@Fachaktion` `getAllAndOverride` + mapRow-Helfer
(§14/§20); KMS-Roundtrip **vor** der Tx (Prod-Adapter-Constraint, §19).

**`security-lead`:** Byte-Layout `nonce||ciphertext||tag` final + Korrektur-Vermerk zu
ADR-0004 §15, AAD längen-präfixiert (§19); Krypto-Shredding-Backup-Lücke als
Residualrisiko/TOM (§19); break-glass-Härtung als ADR-0005-Vorbedingung (§16);
`EDMS_ENV_CLASS` als Self-Check-Wahrheitsquelle + geschützter Config-Store/CI-Deploy-Gate,
`kontext.synthetic=true` von optional auf **Pflicht** (§22).

**Contract (`stammdaten.openapi.yaml`):** Detail-Endpoint-Beschreibungen auf den
Auditor-Zugang (mit Maskierung) präzisiert; break-glass-Härtungshinweise + Byte-Layout-
Fassung im Kopfkommentar nachgezogen (kein Struktur-/Pfad-Bruch — additiv).

### 30.1 Phase-4-Implementierungs-Review (2026-07-14)

Drei Lead-Reviews des implementierten API-Pakets (`access-control-engineer`, `security-lead`,
`backend-lead`), rein lesend. **Architektur, PDP-Verdrahtung (beide Blocker-Fixes A1/A2
verifiziert), Krypto-Byte-Layout/AAD (A7), Provider-Fail-closed (A8), NESTED-Create,
Referenzkonsistenz (B2) und der `bindReturningRows()`-Fix bestätigt korrekt.** Eingearbeitet:

- **Compliance-Bug behoben (security-lead):** `kontext.synthetic=true` (§22, Pflicht) wurde
  auf `request.synthetic` gesetzt, aber von keinem `@AuditAction`-`kontextExtractor` gelesen
  ⇒ nie in der Audit-Zeile. Fix: `kontextExtractors: { synthetic }` auf den PII-Schreibrouten
  (`EndkundeController.anlegen/aendern/sperren/kryptoShredding`, `AnschlussnutzerController.
  anlegen`) + Ende-zu-Ende-Integrationstest gegen die echte Audit-Row.
- **Irreführende KMS-Kommentare korrigiert:** siehe C6.
- **Merge-Blocker Testabdeckung (backend-lead + access-control-engineer):** M1-Rolle×Route-
  Matrix und Integration nur für Endkunde; 7/9 Controller ohne Integrationstest, 6/8 Services
  ohne Unit-Test (inkl. PII-schreibender `AnschlussnutzerService`). Modulweite Abdeckung
  (Happy + 1 Fehler je Controller, Service-Unit-Tests) nachgeliefert, bevor Phase 4 als
  „fertig" (M1/M2/M4/M6, §3/§20) gilt.
- **Neue Folgeaufträge C6–C9** in §29(C) aufgenommen.

### 30.2 Phase-4-Testabdeckung (2026-07-14)

Beim Schließen des Merge-Blockers (modulweite Abdeckung: 12 neue Specs, Rolle×Route-Matrix
je Controller, PII-Maskierung, synthetic-only-E2E) fand der `test-engineer` zwei echte
Produkt-/Schema-Befunde. Endstand: **Lint 0, 285 Unit + 126 Integration grün.**

- **Bug #1 (kritisch, gefixt 2026-07-14):** `POST .../messkonzept/versionen` lieferte auf
  JEDEM Fehlerpfad 500 statt 404/400/403 — der `@AuditAction`-Extraktor `version_nr:
  ({result}) => result?.versionNr ?? null` schrieb auf Fehlerpfaden `null`, das am
  Audit-Seal-Trigger (V0003, nur `string|number|boolean`) brach; der Emit im catch-Zweig
  warf selbst und maskierte den Statuscode. Fix: `?? null` entfernt (`buildKontext()`
  verwirft undefined-Keys). Die 5 vormals roten Regressionstests bestätigen jetzt den
  korrekten Statuscode.
- **Bug #2 (Schema-Design-Lücke) → C10.**
- **Systemische App/DB-`null`-Inkonsistenz → C11** (Ursache hinter Bug #1, punktuell
  umgangen, systemisch offen).

---

## D12 — Nachtrag zu D1/D6: Klartext-Namen in Listen über einen separaten, auditierten Auflösungs-Endpunkt (2026-08-26)

**Status:** entschieden 2026-08-26 · **nicht umgesetzt** (Stand 2026-08-27, Begründung §9)
**Freigabe:** `compliance-director` gegengezeichnet mit Korrekturen K1–K14 (2026-08-26,
eingearbeitet) · User (2026-08-27) · `technical-director`: **K14 entschieden**
(2026-08-27, §3) + Test-Schärfung §9 Schritt 4. Keine offenen Punkte mehr.

**Anlass.** Ein Bedienbarkeits-Review des Betriebs-UI ergab, dass Endkunden in
**jeder** Liste und **jedem** Auswahlfeld ausschließlich über ein 8-Zeichen-Präfix
ihrer Pseudonym-UUID identifizierbar sind (`0198c3aa`). Betroffen sind die
Endkundenliste selbst sowie die Endkunden-Auswahl beim Anlegen von System,
Anschlussnutzer und Nutzungsverhältnis sowie in der Standort-Übersicht. Eine
Suche existiert nicht. Bei dreistelligen Beständen ist „den richtigen Endkunden
finden" nicht durchführbar.

**Der Befund ist nicht bloß eine Komfortlücke.** Der `compliance-director`
stellt in seinem Votum vom 2026-08-26 ausdrücklich fest, dass **der heutige
Zustand nicht der sichere Zustand** ist: Eine Zuordnung über UUID-Präfixe
erzeugt ein reales Fehlzuordnungsrisiko — System, Zähler, Anschlussnutzer oder
Nutzungsverhältnis am falschen Endkunden. Das berührt **Art. 5 Abs. 1 lit. d
(Richtigkeit)** und pflanzt sich fort in die monatliche Nutzerinformation
(falscher Empfängerbezug, potenziell meldepflichtig nach Art. 33 / DS-12) sowie
in die BAFA-Nachweis-Exporte (falsche Verbrauchszuordnung je Förderjahr).
Übermaskierung in einem reinen Innenwerkzeug ist hier ein Sicherheits**risiko**,
kein Sicherheits**gewinn**.

### 1. Ausgangslage

- `PiiProjektionsPolicy.darfPiiSehen()` liefert `true` **nur** für Rolle
  `betrieb` **und** `verarbeitungsStatus='aktiv'`. `compliance-auditor` →
  immer `false`; `gesperrt`/`geloescht` → `false`. Fail-closed.
- Rolle `betrieb` sieht den Klartextnamen damit **bereits heute** auf der
  Endkunde-Detailseite. Es gibt **keine Endkunden-/Kundenrolle** im Backend
  (`admin`, `betrieb`, `compliance-auditor`, `sachbearbeiter`,
  `geraete-support`, `dienstkonto`). Das Betriebs-UI ist ein reines
  Innenwerkzeug.
- Den Namen vor **demselben** Nutzer zu verbergen, der ihn einen Klick weiter
  im Klartext liest, schützt niemanden. Der Schutzzweck von D1 ist ein
  **anderer** — siehe §2.

### 2. Was §13/D1 tatsächlich schützt (und warum das gültig bleibt)

§13 verwirft die Alternative „ein Schema mit PII-Feldern, per Rolle gefiltert"
mit der Begründung, ein Bug im Feld-Filter könne Klartext-PII in
Listen/Logs/`problem+json` leaken (Linie-2-Bruch **strukturell möglich**);
getrennte List-/Detail-Schemas machen den PII-freien Listenpfad
**schema-erzwungen**. Das Argument ist **kein Berechtigungs-Argument**, sondern
ein **Struktur-Argument**: Solange kein PII-Feld im Listen-Schema existiert,
kann kein Laufzeitfehler eines leaken.

**§13 bleibt durch diesen Nachtrag vollumfänglich gültig.** `EndkundeListItem`
bleibt schema-erzwungen PII-frei. Die Auflösung erfolgt **nicht** im
Listen-Schema per Rollenfilter, sondern in einem **separaten Vorgang mit eigener
Fachaktion, eigenem Gate und eigenem Audit-Event**. Wer diesen Endpunkt später
liest, darf daraus **nicht** die Analogie ableiten, D1 sei aufgeweicht.

**Zur Abgrenzung (K7):** §13 ist ein **Struktur**-Argument. Das
**Berechtigungs**-Argument steht an anderer Stelle — in §18/D6
(`PiiProjektionsPolicy`, fail-closed, je Datensatz). D12 hält **beide** Linien:
das Listen-Schema bleibt strukturell PII-frei, und die Auflösung bleibt an
dieselbe fail-closed-Policy je Datensatz gebunden (A4). Wer künftig nur eine
der beiden Linien löst, hat D1 bzw. D6 gebrochen — unabhängig davon, wie er
sich auf D12 beruft.

### 3. Entscheidung

Ein eigener Batch-Auflösungs-Endpunkt nach dem Muster des bereits bestehenden
`StandortLabelService` (ADR-0010 §5):

```
POST /stammdaten/endkunden/labels
  Body:     { endkundeIds: uuid[1..100] }
  Response: EndkundeLabelItem[]   (blankes Array, NICHT paginiert — K14)
  Aktion:   read:endkunde_pii     Rolle: betrieb
  Audit:    endkunde.pii.einsicht  (ein Event je Aufruf)
```

Das Frontend reichert Listen und Auswahlfelder damit an. Ohne Berechtigung
bleibt die Pseudonym-Darstellung stehen — **kein** Fehlerzustand (Muster
`useStandortLabels` / `useKannStandortPiiLesen`).

Ergebnis: `betrieb` sieht `Stadtwerke Musterstadt (0198c3aa)`,
`compliance-auditor` weiterhin `0198c3aa`, gesperrte und geschredderte
Endkunden bleiben maskiert.

**K14 entschieden am 2026-08-27 (`technical-director`): blankes Array.**

Die scheinbare Spannung — Standort-Vorbild liefert ein Array, die Mehrheit des
Contracts eine Hülle — löst sich bei genauem Hinsehen auf. Eine Durchsicht
**aller** Antwortformen in `stammdaten.openapi.yaml` ergibt eine bereits
etablierte, bisher nur unausgesprochene Regel:

> Cursor-**paginierte** Kollektion → `{ daten, seite }`. Vom Aufrufer
> mengenmäßig **begrenzte, nicht paginierte** Kollektion → blankes Array.

Ausnahmslos alle zehn Hüllen (`EndkundeListe`, `SystemListe`, `ZaehlerListe`,
`MesskanalListe`, `MesskonzeptVersionListe`, `AnschlussnutzerListe`,
`NutzungsverhaeltnisListe`, `ShredAntragListe`, `VollstaendigkeitListe`,
`AusfallListe`) tragen `required: [daten, seite]`; **kein einziges** Schema
führt `daten` ohne `seite`. Alle vier blanken Arrays
(`MesskanalFreshnessItem[]`, `StandortStruktur[]`, `StandortLabelItem[]`,
`ZaehlerUnterKnotenItem[]`) sind begrenzte, nicht paginierte Kollektionen.

Der Label-Endpunkt fällt **konstitutiv** in die zweite Klasse: A2 macht
Pagination unmöglich, ein `seite`-Feld kann hier nie entstehen, ohne A2 und A6
gleichzeitig zu brechen. `{ daten: [...] }` ohne `seite` wäre damit keine
Mehrheitsform, sondern eine im Contract **nicht existierende dritte Form**, die
Lesern und generierten Clients fälschlich „paginiert, `seite` fehlt noch"
signalisierte.

**Erweiterbarkeit spricht hier gegen die Hülle, nicht für sie.** Das einzige
plausible Zusatzfeld — die Zahl der nicht aufgelösten Ids — ist clientseitig
exakt ableitbar (der Aufrufer kennt seine Anfragemenge, Mengendifferenz
genügt); es trüge null Information. Jedes Zusatzfeld, das *nicht* ableitbar
wäre, etwa eine Aufschlüsselung nach `gesperrt`/`geschreddert`, verstieße
direkt gegen A4 („fallen **still** aus der Antwort"). Die Hülle bewahrte also
eine Optionalität, die wir ausdrücklich **nicht wohlfeil** haben wollen: Soll
künftig jemand eine Aussage über gefilterte Sätze in die Antwort schreiben, ist
ein Breaking Change mit Major-Version und `compliance-director`-Gegenzeichnung
das **richtige** Kostensignal — nicht ein additives Feld, das durch die Review
rutscht, weil es „ja nicht breaking" ist.

**Für A6 ist das Array zudem robuster.** `result?.daten?.length` hängt an einem
**Feldnamen**, der bei einem Refactor umbenannt oder optional werden kann; da
`audit.event_seal()` die Kontext-Whitelist nur als **Teilmengen**-Prüfung
erzwingt (gelistete Keys sind nicht Pflicht), verschwände `anzahl_endkunden`
dann **lautlos** — und übrig bliebe ein Event „100 angefragt" ohne Gegenzahl.
Genau diese Differenz ist aber der einzige Nachweis, dass A4 wirkt.
`result?.length` hat keinen Feldnamen, der brechen kann.

Die dritte Form `{ daten, nichtAufgeloest }` ist damit ausdrücklich verworfen
und **nicht** an den `compliance-director` zurückgegeben: Die Sichtbarkeit der
Filterung ist bereits doppelt hergestellt — im Audit über die A6-Differenz (für
die Aufsicht) und im Client über die Mengendifferenz (für die Darstellung, die
dort schlicht das Pseudonym stehen lässt).

Extractor damit exakt wie beim Standort-Vorbild:

```ts
anzahl_endkunden: ({ result }) => result?.length,
anzahl_angefragt: ({ request }) => (request.body as EndkundeLabelsAnfrageDto | undefined)?.endkundeIds?.length,
```

**N1 — kein `Idempotency-Key`,** abweichend vom Standort-Sibling. Der Header
ist laut `api-contracts.md` für **schreibende** Operationen vorgesehen; hier ist
POST nur gewählt, weil die Id-Menge nicht in den Query-String darf (Suchbegriffe
und Id-Mengen gehören nicht in Access-/Proxy-Logs). Gravierender: Die
dokumentierte Semantik „Wiederholung ohne den Effekt zu duplizieren" legte nahe,
das Audit-Event bei Wiederholung zu unterdrücken — ein direkter **A6-Bruch**,
denn jede Einsicht ist eine Einsicht.
*Nebenbefund am Standort-Pfad (nicht D12):* Dort deklariert die Spec den Header
als `required: true`, der Controller trägt auf `labels()` aber kein
`@IdempotencyKey()` — Spec und Implementierung divergieren bereits heute
(Contract-Test-Lücke). Auflösung empfohlen in Richtung „Header aus der Spec
entfernen", sobald die Datei frei ist.

**N2 — `uniqueItems: true`** in der Anfrage (OpenAPI-Entsprechung des von A2
geforderten `ArrayUnique`): Ohne sie könnte ein Client 100 identische Ids
senden und `anzahl_angefragt` gegenüber `anzahl_endkunden` künstlich aufblähen
— das verfälschte genau die A4-Nachweis-Differenz.

### 4. Verbindliche Auflagen (`compliance-director`, 2026-08-26)

Die Auflagen sind **konstitutiv**, nicht Verhandlungsmasse — sie sind der Preis
dafür, dass die erweiterte Reichweite (§5) akzeptiert wird.

| | Auflage | Anmerkung |
|---|---|---|
| **A1** | Antwort trägt **ausschließlich `{ id, name }`** | Keine `anschrift`, kein `kontakt`. **Bewusste Abweichung vom Standort-Vorbild**, das `{ id, bezeichnung, anschrift }` liefert: Dort ist die Anschrift das Unterscheidungsmerkmal zwischen Gebäudeknoten, hier genügt der Name. Bei realer Namensgleichheit ist das Mittel eine **nicht-personenbezogene** interne Kundenreferenz (§6 (D)) — nicht die Anschrift. |
| **A2** | `ArrayMaxSize(100)`, dazu `ArrayMinSize(1)`, `ArrayUnique`, `IsUUID(each)` | **Nicht 500 wie beim Standort** (`MAX_BATCH_GROESSE`). Der Standort-Endpunkt liegt unter `{endkundeId}` und ist durch die Mandantengrenze gedeckelt; ein Endkunden-Label-Endpunkt hat **keine** Obergrenze. 100 = `limit`-Maximum aus `api-contracts.md`. Damit gilt: **1 Aufruf = 1 dargestellte Seite = 1 Audit-Event** — diese Gleichung macht A6 verhältnismäßig.<br>**Korollar (K4):** Die Gleichung hält nur, solange die dargestellte Seitengröße der anreichernden Listen und Auswahlfelder **≤ 100** bleibt. Wird sie überschritten, entkoppelt sich der Batch von der Darstellung und A3 wie A6 verlieren ihre Grundlage. **Die Seitengröße ist damit selbst auflagenrelevant.** |
| **A3** | Aufruf entspricht dem **dargestellten Ausschnitt** | Kein Prefetch des Gesamtbestands, kein seitenübergreifender Voll-Cache. Kurze `staleTime`/`gcTime`, kein persistenter Cache. PII in `localStorage`/`sessionStorage` ist ohnehin verboten. |
| **A4** | `PiiProjektionsPolicy` **je Datensatz**, nicht je Route | Gesperrte (Art. 18) und geschredderte (Art. 17) Sätze fallen **still** aus der Antwort — kein Klartext, kein 404. Entschlüsselt wird erst **nach** `true` je Satz, nie auf Vorrat. **Ohne A4 hebelt der Batch die Art.-18-Sperre aus** — Veto-Grund. |
| **A5** | Eigene Fachaktion `read:endkunde_pii`; `@Roles('betrieb')` **und** explizite PDP-Deny-Regel `endkunde_pii_auditor_verboten` **vor** dem generischen permit-Fallback | Defense-in-Depth wie beim Standort (`standort_pii_auditor_verboten`, `in-code-policy.adapter.ts` Regel 1c). Eigener Frontend-Hook analog `useKannStandortPiiLesen` — **keine** Wiederverwendung eines bestehenden Hooks. |
| **A6** | **Ein** Audit-Event je Aufruf. Kontext-Whitelist: `{synthetic, anzahl_endkunden, anzahl_angefragt}`, `rolle_erfassen=true`. `objekt_ref` bleibt im Batch-Pfad NULL (**Spalte, kein Kontext-Schlüssel**). Die Route trägt `@UseInterceptors(SyntheticOnlyInterceptor)` **exakt wie** `POST .../standorte/labels` — ohne ihn existiert `request.synthetic` nicht und die neue PII-Leseroute fällt aus der D10-Gate-Abdeckung (§22). | `anzahl_angefragt` ist die Ergänzung gegenüber dem Standort-Muster: Die **Differenz** zu `anzahl_endkunden` belegt, wie viele Sätze maskiert/gesperrt/geschreddert waren. **Ohne diesen Schlüssel ist A4 nicht auditierbar.** **Bewusst NICHT im Kontext: die Liste der aufgelösten IDs** — das machte das Audit-Log zur zweiten Kundenkartei und wäre selbst eine Minimierungsverletzung (technisch ohnehin erzwungen: `audit.event_seal()` erlaubt nur Skalare). |
| **A7** | Keine Sonderfrist | `endkunde.pii.einsicht` läuft unter der bestehenden Zeile „Audit-Events" der Retention-Matrix (F2, gekoppelt an O2/A-O6). Nicht kürzer — das Log ist der Nachweis der Zugriffskontrolle und darf nie vor den überwachten Daten verfallen. Nicht länger — kein Grund. |
| **A8** | **Keine** Zweckbindungs-Bestätigung | Ausdrücklich verneint. Das Lastgang-Gate ist break-glass für **deny-by-default**-Zugriff auf **Verhaltensdaten**; der Name ist ein Stammdatum, das dieselbe Rolle als Dauerrecht hat. Ein Token bei jedem Seitenaufbau wäre Ritual und **entwertete die Signalwirkung des echten break-glass-Gates**. Stattdessen: statischer, nicht-blockierender Hinweis im Listenkopf. |
| **A9** | Periodischer Audit-Review, **kein** Echtzeit-Alert | Aufnahme in den für `read:verbrauch_detail` ohnehin vorgesehenen Review; Kriterium: Ausreißer in `anzahl_endkunden` je Subjekt und Tag. Echtzeit-Alert bleibt break-glass vorbehalten, sonst stumpft er ab. Velocity-Quota je Subjekt als Gate-Auflage vor Real-Ingest (§8, K2).<br>**Beschäftigtendatenschutz (K10):** Der Review ist eine **beschäftigtenbezogene** Auswertung. Er dient ausschließlich der Missbrauchs- und Sicherheitserkennung, **nicht** der Leistungs- oder Verhaltenskontrolle (Art. 88 DSGVO / § 26 BDSG). Zweckbindung, Auswertungsberechtigte und Aufbewahrung folgen unverändert der bestehenden Linie in DSFA-0001 Abschnitt 8.3, `rvt.md` VT-0002 und `toms.md`. |
| **A10** | **Rote Linie:** gilt **nur für Endkunden-Namen** | **Kein Präzedenzfall** für eine analoge Batch-Auflösung von **Anschlussnutzer**-PII. Anschlussnutzer sind die DS-07-Datensubjekte; anderer Maßstab. Bei gleichem Bedienproblem dort: separat vorlegen. |

**Nicht verhandelbar** sind **A1**, **A4**, **A5** und **A6** (K6). A5 gehört
in diese Klasse, weil das Versagen binär ist: ohne die PDP-Deny-Regel lässt ein
vergessenes `@Roles` den `compliance-auditor` auf die Route. **A4 und A5 sind
testbelegt zu erbringen** — je ein Integrationstest für `verarbeitungs_status`
in `aktiv`, `gesperrt` und `geschreddert` sowie einer für den Auditor-Deny auf
PDP-Ebene (Präzedenz `standort.integration.spec.ts`). Ohne diese Tests sind A4
und A5 Kommentare, keine Maßnahmen. Bei **A2** oder **A9** ist eine Abweichung
technisch möglich, eröffnet dann aber ein eigenständiges Risiko-Artefakt (§7).

**Randbemerkung (ohne Auflagencharakter).** Der Bestand ist gemischt —
Firmennamen juristischer Personen sind kein PII, natürliche Personen als
Eigentümer/Selbstnutzer schon. Da weder `EndkundeListItem` noch `EndkundeDetail`
ein Rechtsform-Attribut führen, ist einheitlich als PII zu behandeln.

### 5. Aggregationsrisiko — bewertet, nicht wegdefiniert

Zwei Dimensionen, getrennt zu beantworten:

**(a) Sensitivität je Datum: unverändert.** Derselbe Name, dieselbe Rolle,
dieselbe Rechtsgrundlage (Art. 6 Abs. 1 lit. b, VT-0001). Reine
Effizienzsteigerung eines bereits erlaubten Zugriffs. **Art. 13/14 bleiben
unberührt** — kein neuer Zweck, kein neuer Empfänger, kein neuer Datenkreis.

**(b) Reichweite je Vorgang: qualitativ neu** — und zwar stärker als beim
Standort-Präzedenzfall, der deshalb **nicht** unbesehen durchgereicht wird. Aus
„Detailseite je Kunde" (n Vorgänge, n Audit-Events, nachvollziehbare
Arbeitsspur, natürliche Reibung) wird „Bestandsabzug" (1 Vorgang, 1 Event,
keine Reibung). Für ein kompromittiertes `betrieb`-Konto sinkt der Aufwand für
die vollständige Kundenliste von n Requests auf ⌈n/100⌉.

**Bewertung.** Es entsteht kein neues *Recht*, aber eine neue *Ausnutzbarkeit*
eines bestehenden Rechts. Kein Veto — Massenauslesen wäre auch heute über n
Detailseitenaufrufe möglich, nur langsamer. Aber: **A2, A3, A6 und A9 sind die
Kompensation**, nicht optional. Mit ihnen: **W2 × A3 = 6 vor Behandlung,
Restrisiko niedrig nach Behandlung** — als benanntes Teilszenario mit dieser
Bewertung im Behandlungspunkt zu R-0004 zu führen, in derselben Systematik wie
dessen Teilszenarien 3.4 und 3.7. Eine bloß qualitative Einstufung genügt dem
Risiko-Register nicht (K9).

Zur Einordnung: Der Endkundenname liegt gegenüber dem Lastgang deutlich
niedriger — keine besondere Kategorie nach Art. 9, keine Verhaltensdaten, kein
Rückschluss auf Anwesenheit oder Lebensführung. Deshalb ist break-glass
unverhältnismäßig (A8) und Mengengrenze plus Protokoll das angemessene Mittel.

### 6. Verworfene Alternativen

> Die Buchstaben folgen der Nummerierung des Votums vom 2026-08-26: (A)
> Blind-Index-Suche, (B) der hier gewählte Batch-Endpunkt, (C) PII im
> Listen-Schema. **(D)** ist auf Verlangen der Gegenzeichnung (K8) ergänzt.

**(A) Serverseitige Suche über Blind-Index, Antwort bleibt pseudonym.**
*Contra, technisch:* `BlindIndexService` ist deterministisches HMAC-SHA256 und
beantwortet ausschließlich **exakte Gleichheit** auf einem normalisierten Wert.
„Stadtwerke Musterstadt" findet man nur bei exakter, vollständiger Eingabe;
Teilstring- oder Fuzzy-Suche ist prinzipiell ausgeschlossen. Jedes n-Gramm-/
Präfix-Indexschema erhöhte die Re-Identifizierbarkeit der Indexspalte erheblich
(Frequenzanalyse) und wäre ein eigener Krypto-Entwurf mit eigenem Votum.
*Contra, fachlich:* Selbst mit funktionierender Suche steht der Bearbeiter vor
einer Trefferliste aus UUID-Präfixen und weiß weiterhin nicht, welches der
richtige ist. **A löst „springe zu einem bekannten Kunden", nicht „arbeite mit
einer Liste".**
*Als Komplement später sinnvoll* — dann aber zwingend: **der Suchbegriff ist
selbst PII und gehört nicht in den Query-String** (Access-/Proxy-Logs,
Browser-History), sondern in einen POST-Body. Eigenes Votum erforderlich.

**(C) PII direkt ins `EndkundeListItem`.** *Contra:* verlagert den Schutz von
„strukturell unmöglich" auf „hoffentlich korrekt implementiert", an genau den
Stellen, an denen Leaks entstehen: Fehlerpfade, `problem+json`-Echos,
Logging-Serializer, Testfixtures, generierte Clients. **Zusätzliches Argument,
das in §13 noch nicht steht:** Der Klartextzugriff wäre damit **nicht mehr als
eigener Vorgang auditierbar** — die Protokollierungspflicht ließe sich nur noch
an „jede Listenabfrage" hängen, also entweder Log-Flut oder faktisch keine
Protokollierung. Gegenüber dem heutigen Stand ein **Rückschritt**.

**(D) Nicht-personenbezogene, sprechende interne Kundenreferenz statt
Klartext-Namen.** Ein im `energy`-Schema geführtes, vom Betrieb vergebenes
Kürzel würde in Listen und Auswahlfeldern **ganz ohne** PII-Auflösung angezeigt
und wäre damit die datenschutzfreundlichste Variante (Art. 25 Abs. 1/2).
*Contra:* Sie führt eine **zweite Identitätsebene** ein, die selbst
fehlzuordnungsanfällig ist und gepflegt werden muss; die Kernaufgabe — die
Zuordnung gegen reale Belege (Verträge, Jahresabrechnungen, BAFA-Unterlagen),
die auf **Namen** lauten — löst sie nicht, sondern verlagert sie auf einen
Übersetzungsschritt, der neue Fehlerquellen schafft. Der im Anlass beschriebene
Art.-5-Abs.-1-lit.-d-Befund bliebe damit bestehen. *Verworfen als Ersatz,
ausdrücklich zugelassen als Komplement* — bei realer Namensgleichheit ist sie
nach A1 sogar das vorgeschriebene Mittel.

### 7. Folgeartefakte (jeweils eigene Freigabe)

**Zeitpunkt (K11).** Solange D12 nicht implementiert ist (§9), dürfen die
Artefakte dieser Tabelle **nicht** als beschreibende Nachweisdokumentation
geschrieben werden. Ein TOM-Eintrag über eine nicht existierende Maßnahme wäre
unwahr (Art. 5 Abs. 2, Art. 32 Abs. 1). Zulässig sind ausschließlich:
(i) Schreiben zeitgleich mit der Implementierung, oder (ii) Schreiben mit
ausdrücklichem Vermerk „geplant, nicht implementiert (Stand …)", analog dem
„RESERVIERT"-Muster der Katalog-Migrationen ohne Emitter (V0018). Die
Katalog-Migration selbst darf vorgezogen werden — sie trägt dieses Muster
ohnehin.

| Artefakt | Änderung |
|---|---|
| `compliance/dsgvo/toms.md` | **Haupteintrag.** Abschnitt 9 „Fach-API-Zugriffskontrolle (Stammdaten)", Aufzählungspunkt „Data Masking in Responses (A.8.11)": generalisiertes Muster „PII-freies Listen-Schema + separater, gegateter Batch-Auflösungs-Endpunkt" aufnehmen (steht dort bisher gar nicht, auch nicht für den Standort-Pfad). A1, A2, A4, A6 dort verankern. Revisionsvermerk + Signatur. |
| `compliance/dsgvo/rvt.md` | **Zwei** Berührungen, **kein** neuer Eintrag: **VT-0001** TOM-/Owner-Verweis ergänzen; **VT-0002 (Audit-Protokollierung)** — der neue Code mit `rolle_erfassen=true` erweitert den Beschäftigten-bezogenen Audit-Bestand, **und** die Zweckbindung der neuen Auswertung nach A9 (Art. 88 DSGVO / § 26 BDSG) ist dort zu verankern (K10). Der zweite Punkt wird laut `compliance-director` erfahrungsgemäß übersehen. |
| `compliance/dsgvo/dsfas/dsfa-0001-messdaten-verarbeitung.md` | **Neuer Nachtrags-Abschnitt (§15, Revision 11) mit Rückverweis auf Abschnitt 10**, keine Änderung *in* Abschnitt 10 und **keine DSFA-0002** (K13): Die Datei ist append-strukturiert (§§ 8–14 = je ein Nachtrag). Art.-35-Schwellentest für D12 isoliert nicht erfüllt (kein zusätzliches WP248-Kriterium). Inhalt: Reichweitenbewertung §5, A1–A6/A9 als Minderung, Restrisiko „Bestandsabzug durch kompromittiertes `betrieb`-Konto". |
| `compliance/dsgvo/retention-matrix.md` | Redaktionelle Nennung des Event-Codes unter „Audit-Events", Kopplung O2/A-O6 unverändert (A7). Keine neue Zeile. |
| `compliance/dsgvo/betroffenenrechte.md` | Ergänzung analog den Passagen zu `stammdaten.verbrauch_detail.einsicht` und `einflussgroesse.stammdaten.einsicht`: Batch-Einsicht ist protokolliertes Ereignis; Art.-18-Sperre und Art.-17-Shredding schließen sie automatisch aus (A4). Relevant für Art.-15-Auskünfte. **Nebenbefund:** `standort.pii.einsicht` fehlt dort ebenfalls — bei der Gelegenheit mit erledigen. |
| `compliance/iso27001/{soa,controls}.md` | Schärfungen, **kein** Control wechselt von „nicht anwendbar" (verifiziert): **A.8.11** (Batch-Muster + A1), **A.5.15** (`read:endkunde_pii`, Auditor-Deny), **A.8.15** (neuer Code, `rolle_erfassen`), **A.8.12** (A2 als DLP-Maßnahme), **A.8.16** (A9). |
| `compliance/risk-register/R-0004-…md` | **Kein neues Risiko-Artefakt**, sofern A1–A6 kommen. Behandlungspunkt ergänzen: „Massen-Auflösung durch kompromittiertes/missbräuchliches `betrieb`-Konto — **W2 × A3 = 6 vor Behandlung, Restrisiko niedrig** — behandelt über Mengengrenze, Protokollierung, periodischen Review; Velocity-Quota als Gate-Auflage vor Real-Ingest." **Entfällt A2 oder A9, ist ein eigenständiges Risiko zu eröffnen.** |
| `migrations/V00NN__seed_endkunde_pii_einsicht_event.sql` (+ `.down.sql`) | Katalog-Eintrag: `erlaubte_kontext_keys = {synthetic, anzahl_endkunden, anzahl_angefragt}`, `rolle_erfassen=true`. `beschreibung` muss **beide** Kontextausprägungen benennen (§8). Höchste vergebene Nummer im Repo: V0032. |
| `docs/architecture/audit-events.md` | Register-Eintrag. |
| `schemas/openapi/stammdaten.openapi.yaml` | Neuer Pfad + Schemas. `compliance-director`-Review bei PII-Feldern zwingend (`api-contracts.md`). Das Antwortschema darf `name` **nicht** in einem Sammel-Schema führen, das anderswo wiederverwendet wird. Antwortform: offener Punkt K14 (§3). |
| `docs/adr/ADR-0005-messdaten-ingestion.md` §31 | Gate-Auflagen vor Real-Ingest: M-1 und die A9-Velocity-Quota als nummerierte Zeilen (§8, K2). |

### 8. Abgrenzung: Mangel M-1 wird separat geführt

Der `compliance-director` hat unabhängig von dieser Entscheidung festgestellt,
dass der **Klartext-Namensabruf auf der Endkunde-Detailseite heute nicht
protokolliert** wird (`endkunde.controller.ts`, `@Get(':endkundeId')` ohne
`@AuditAction`) — anders als `standort.pii.einsicht`,
`einflussgroesse.stammdaten.einsicht` und `stammdaten.verbrauch_detail.einsicht`.
Rechtlich: Art. 32 Abs. 1 lit. b i. V. m. Art. 5 Abs. 2 (Rechenschaftspflicht);
die Wirksamkeit der `PiiProjektionsPolicy` ist derzeit **behauptet, nicht
belegbar**. BAFA-seitig relevant für DS-06 und DS-12.

**Auf User-Entscheidung vom 2026-08-26 wird M-1 als eigener Vorgang geführt**
(Owner `audit-trail-engineer` + `backend-lead`, fällig **vor** Umschalten auf
`EDMS_SYNTHETIC_ONLY=false`). D12 ist nicht davon abhängig. Die Trennung ist
vertretbar, solange `EDMS_SYNTHETIC_ONLY=true` gilt: Bis dahin gibt es keine
reale PII, an der die Lücke Schaden anrichten könnte.

**Konstruktive Auflage aus dieser Trennung (K1).** `erlaubte_kontext_keys` des
Codes `endkunde.pii.einsicht` ist **von Anfang an** auf
`{synthetic, anzahl_endkunden, anzahl_angefragt}` festzulegen — einschließlich
der für D12 allein redundanten Ausprägungen. `audit.event.objekt_ref` ist
bereits tabellenweit nullable (`V0003__audit_log_schema.sql`) und braucht
**keine** Vorkehrung; ein per-Code-Schalter dafür existiert im Katalog nicht.
Der eigentliche Kostenpunkt ist die **Kontext-Whitelist**: `audit.event_seal()`
weist nicht gelistete Keys fail-closed ab, eine Erweiterung erfordert eine
SCD2-Katalog-Nachtragsmigration (Präzedenzfall V0016). Die `beschreibung` der
Katalogzeile muss **beide** Kontextausprägungen ausdrücklich benennen.
**`endkunde_id` gehört bewusst NICHT in die Whitelist** — anders als beim
Standort-Code (V0018 (7)), der unter `{endkundeId}` liegt und den Mandanten
deshalb führt; hier entstünde daraus die zweite Kundenkartei, die A6 verbietet.

Ein Code, zwei Kontextausprägungen:

| Pfad | `objekt_ref` (Spalte) | `anzahl_angefragt` | `anzahl_endkunden` |
|---|---|---|---|
| Detailseite (M-1, später) | `endkundeId` | 1 | 1 |
| Batch (D12, jetzt) | NULL | m | n |

**Warnung für die Audit-Auswertung, solange M-1 offen ist (K3).** Der Code
`endkunde.pii.einsicht` deckt **ausschließlich** den Batch-Pfad ab. Der
Klartextabruf auf der Endkunde-Detailseite bleibt bis M-1 unprotokolliert. Aus
dem Vorhandensein dieses Codes darf **nicht** geschlossen werden, dass
PII-Lesezugriffe auf Endkunden vollständig protokolliert sind.

**Durchsetzung (K2).** Die Nennung hier begründet keine Durchsetzung. M-1 ist
als nummerierte Zeile in die Gate-Auflagentabelle `ADR-0005 §31` („Gate-Auflagen
vor Real-Ingest", Schema `DS-n`) aufzunehmen, mit Owner und Fälligkeit.
Dasselbe gilt für die in A9 als Gate-Auflage bezeichnete Velocity-Quota. Ohne
diese Einträge werden beide beim Umschalten auf `EDMS_SYNTHETIC_ONLY=false`
nicht geprüft.

### 9. Umsetzungsplan (nicht Teil dieses Nachtrags — zur Terminierung)

Bewusst **noch nicht umgesetzt**: Zum Zeitpunkt dieses Entwurfs arbeitet eine
zweite Session parallel im selben Repo (Backend `nachweis/`, `messkonzept/`,
`schemas/openapi/stammdaten.openapi.yaml` und Frontend `features/nachweis/`).
Eine gleichzeitige Umsetzung würde in der OpenAPI-Datei, im Stammdaten-Backend
und inzwischen auch im Frontend kollidieren. Präzedenz für „entschieden, nicht
umgesetzt": `V0018__seed_standort_events.sql` („RESERVIERT: kein
v1-Endpoint/Emitter im Repo") bei ADR-0010 im Status `proposed`.

Reihenfolge bei späterer Umsetzung:

1. Katalog-Migration Audit-Event (K14 ist entschieden, die Migration ist
   unmittelbar ziehbar — sie hängt nicht an der Antwortform)
2. `EndkundeLabelService` nach `StandortLabelService`-Muster, A4 je Datensatz
3. Controller + Fachaktion `read:endkunde_pii` + PDP-Deny-Regel (A5) +
   `SyntheticOnlyInterceptor` (A6)
4. Integrationstests für A4 (drei Status) und A5 (Auditor-Deny) — ohne sie
   gelten die Auflagen als nicht erbracht (§4). Die A4-Tests prüfen **das
   Audit-Event mit**, nicht nur die HTTP-Antwort: Assertion auf
   `kontext = {synthetic, anzahl_angefragt: 3, anzahl_endkunden: 1}`. Ohne
   diese Assertion ist der A6-Nachweis von einem stillen Extraktor-Ausfall
   bedroht, den weder Trigger noch Typsystem fangen (Schärfung
   `technical-director` 2026-08-27, compliance-neutral)
5. OpenAPI-Pfad + Schemas, `compliance-director`-Review
6. Frontend: `useEndkundeLabels`, `useKannEndkundePiiLesen`, Einsatz in
   Endkundenliste und den vier Endkunden-Auswahlfeldern, statischer Hinweis
   (A8); Seitengröße ≤ 100 halten (A2-Korollar)
7. `compliance/**`-Artefakte aus §7, zeitgleich (K11)
8. `ADR-0005 §31`-Gate-Zeilen für M-1 und Velocity-Quota (K2)

Aufwandsschätzung Backend ≈ ein Tag (inkl. Tests aus Schritt 4), Frontend ≈ ein
halber Tag, Compliance-Artefakte separat.

## D13 — Nachtrag: die letzten Schreibwege ohne Oberfläche (2026-09-10)

**Anlass.** Ein vollständiger Abgleich der OpenAPI-Verträge gegen die
`apiClient.*`-Aufrufe des Frontends. Zum Zeitpunkt der Analyse — nach
Systemgrenze, Baseline-Perioden und Widerspruch — hatten **141 von 148
Routen** einen Bedienweg. Von den sieben übrigen sind zwei
OIDC-Weiterleitungen (kein XHR), zwei Einzel-GETs, deren Listen-Route bereits
genutzt wird, eine forensische Admin-Aktion (`reverse-aufloesung`) und
`GET …/einflussgroessen/befunde`, dem nicht die Oberfläche fehlt, sondern der
Inhalt (`tb03_schwellwert` ist durchgängig `NULL`, die Schwellwert-Erkennung
ist nicht gebaut). Übrig blieb **eine** echte Lücke: `POST /berechnung/laeufe`.

Der Befund ist grundsätzlicher, als die Zahl vermuten lässt. Die drei in
dieser Runde geschlossenen Lücken (Systemgrenze, Baseline-Perioden,
Berechnungslauf) lagen alle **hintereinander in derselben Kette**:

```
Stammdaten → Messkonzept → Systemgrenze → Baseline-Periode → BERECHNUNG
          → Einsparlauf → Preflight → Export → Nutzerinformation
```

Alles links und rechts davon war bedienbar; die Mitte nicht. Für einen neuen
Kunden brach die Kette damit an ihrer zweiten Stelle ab — und genau deshalb
musste `aufbau-pilotbestand-a.ts` überhaupt geschrieben werden.

**D13.1 — Ein Formular, das herleitet statt abzufragen.** `POST
/berechnung/laeufe` verlangt sechs Pflichtparameter. Sechs leere Zahlenfelder
wären die Einladung gewesen, den Fehler vom 2026-09-08 zu wiederholen (ein
geratenes `g = 0,25`, das jeden Sommermonat als Mehrverbrauch auswies). Der
Server leitet fünf der sechs aus dem Bestand her
(`GET /berechnung/parametervorschlag`, s. ADR-0006 C7.3) und liefert die
Rechnung mit; sie steht sichtbar unter dem Feld.

Das ist eine Abweichung vom üblichen Muster dieses ADR — sonst validiert das
Formular, hier **rechnet der Server vor**. Begründung: Der Grundlastanteil ist
der einzige Parameter, den ein Bediener nicht nachschlagen kann. Eine
Validierung kann nur sagen, dass eine Zahl im Wertebereich liegt; sie kann
nicht sagen, dass sie falsch ist.

**D13.2 — Hindernisse vor dem Absenden, nicht danach.** Die Ansicht führt die
Gründe auf, aus denen ein Lauf ins Leere liefe (fehlender Baseline-Wert,
Einheit außer kWh, kein aktiver Zähler, keine Messdaten, keine
Baseline-Periode) — **oberhalb** der Felder. Wer erst unten am gesperrten
Knopf merkt, dass etwas fehlt, hat den Weg umsonst gemacht.

Eine davon ist eine **Warnung und kein Riegel**: die leere Systemgrenze. Sie
ist die einzige, die der Lauf nicht selbst bemerkt — er rechnet still über
alle Zähler des Kunden (`endkunde_fallback`). Es gibt aber Bestände mit genau
einem Messkonzept, für die das richtig rechnet; ein Riegel wäre hier
Bevormundung.

**D13.3 — `datalist` statt `select` bei der Klimastation.** `stationRef` ist
ein frei gewählter String ohne Auflösung (ADR-0006 O-B5 offen). Ein `select`
machte eine noch nie verwendete Station unmöglich, ein leeres Textfeld wäre
die nächste Ratestelle. Vorgeschlagen werden die für diesen Kunden bereits
verwendeten Kennungen; das Feld bleibt offen.

**D13.4 — Ein Vermerk, der zur Sackgasse wurde.** In `berechnungApi.ts` stand
seit Phase 4 wörtlich: *„`create:berechnungslauf` ist NICHT Teil dieses
Passes — Läufe entstehen v1 ausschließlich serverseitig, die Betriebs-UI zeigt
sie nur an (Arbeitsauftrag, wörtlich: ‚KEIN Anlegen/Ändern im UI')."* Der
Vermerk war korrekt protokolliert und hat trotzdem geschadet: Er beschrieb
eine Abgrenzung des damaligen Arbeitspakets, las sich aber wie eine
Architekturentscheidung — und blieb deshalb elf Wochen stehen, ohne dass
jemand die Lücke als Lücke sah.

> **Lehre für dieses ADR:** Eine Scope-Grenze im Code sollte sagen, **wann sie
> fällt**, nicht nur, dass sie besteht. Ein „noch nicht, weil X" lässt sich
> prüfen; ein „nicht Teil dieses Passes" nicht.

**D13.5 — Ein toter Schreibweg, der das Formular lahmlegte.** Beim Bau des
Widerspruchs-Zweigs (ADR-0012 E13) fiel auf, dass das
**Endkunden-Formular vollständig unbenutzbar** war: Es bot ein Häkchen an,
das der Dienst seit AW-27 mit 400 abweist, und der Mapper schickte das Feld
bei jedem Absenden mit. Details dort; hier der UI-seitige Schluss:

> Ein Feld aus dem Backend zu entfernen, ohne das Formular anzufassen, macht
> nicht das Feld unbenutzbar, sondern das **ganze Formular** — sobald der
> Mapper es bedingungslos mitschickt. Beim nächsten Entfernen eines
> Schreibfelds gehört der Mapper mit auf die Liste, nicht nur die Maske.
