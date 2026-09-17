# ADR-0005: Messdaten-Ingestion (ChirpStack → Mosquitto/MQTT → idempotenter Ingest-Worker → TimescaleDB-Hypertable; Backfill, Lücken-/Ausfall-Erkennung DE-02/TB-04)

- **Status:** **accepted (v1 synthetic-only)** — **Phasen 1–3 abgeschlossen,
  Phase 4 (Implementierung) in Arbeit.** Phase 1 (Vision, F1–F6, 2026-07-16,
  §8.1); Phase 2 (Design Teil B §11–33 + **vier Fach-Reviews** `technical-director`/
  `security-lead`/`timescale-engineer`/`database-lead`, alle „freigegeben-mit-
  Auflagen", konsolidiert in §31); Phase 3 (`compliance-director` **KEIN VETO** mit
  Auflagen, 2026-07-16 — rote Linien **RL-1…RL-5**, Gate-Bedingungen **GB-A…GB-F**,
  O4-Audit-**Drei-Wege-Split wörtlich bestätigt**, §32). **v1 ist synthetic-only und
  öffnet das ADR-0004-Ingest-Gate NICHT** — die produktive Öffnung ist an GB-A…GB-F
  gebunden. **Migrationen V0010–V0014 angewendet + live verifiziert (2026-07-16).**
- **Datum:** 2026-07-16
- **Autor:** product-director (Phase 1), iot-ingestion-engineer (Phase-2-Design
  Teil B), database-lead (Phase-4-Migrationen V0010–V0014)
- **Reviewer:** `technical-director` + `security-lead` (O4-Krypto) +
  `timescale-engineer` + `database-lead` (Phase 2, alle freigegeben-mit-Auflagen);
  `compliance-director` (Phase 3, **KEIN VETO** mit Auflagen); Compliance-Artefakte
  Rev.7 (`dsgvo-auditor` + `iso27001-auditor`). Risiko: **HOCH der Art nach, effektiv
  MITTEL solange synthetic-only technisch hält** (Begründung Abschnitt 7).
- **Freigabe:** User — F1–F6 (2026-07-16, §8.1); Phase-2-Design-Forks **D1/D2**
  (2026-07-16, §24); Phase-3-Entscheidungen **GB-C** (Blind-Index-Nullung, §26.5) +
  Compliance-Artefakte Rev.7 + Anwendung Migrationen V0010–V0014 (2026-07-16).
- **Workflow:** `/new-feature messdaten-ingestion`, Phase 1 (Konzept & Vision).
- **Roadmap-Bezug:** „Als Nächstes: ADR-0005 — Messdaten-Ingestion — ChirpStack →
  Mosquitto (MQTT) → Ingest-Worker (idempotent, Backfill, Lücken-Report für DE-02)"
  (`production/roadmap.md`, rev. 8, Zeile 23) sowie das **Sequenz-/Ingest-Gate**
  (rev. 8, Zeile 15). Personas: Betriebs-Team (ADR-0004 Persona B); Fach-Service
  (ADR-0004 Persona A). **Roadmap-Fortschreibung** (ADR-0005 „Als Nächstes" →
  „Jetzt/in Arbeit") ist eine **Folgeaufgabe mit User-Bestätigung** (Abschnitt 10),
  in diesem Memo NICHT vollzogen.

> **Reifegrad-Hinweis.** Dies ist das **Vision-Memo** (Phase-1-Output). Das
> **Ziel-Datenmodell existiert bereits**: das Messwert-Hypertable
> `measurement.messwert` inkl. Idempotenz-Ziel-Constraint
> `ux_messwert_kanal_ts (messkanal_key, ts DESC)` und der dokumentierten
> Upsert-Vorbereitung `INSERT … ON CONFLICT (messkanal_key, ts) DO NOTHING |
> DO UPDATE` ist mit **V0002** migriert (ADR-0004 Teil B §14,
> `migrations/V0002__kern_datenmodell_energie.sql`). **ADR-0005 bringt daher NICHT
> das Kern-Zeitreihen-Schema mit, sondern baut die Pipeline auf ein vorhandenes
> Schema** (Abschnitt 4.4). Es entwirft in diesem Phase-1-Memo **weder Decoder,
> noch Topic-Layout, noch Migration** — Payload-/Topic-/Broker-/Worker-Architektur,
> Konflikt-Semantik im Detail und etwaige **Zusatz-Schema-Bausteine** (DevEUI-
> Mapping, Dead-Letter, Lücken-Materialisierung) sind **Phase 2/3/4** und unten klar
> markiert.

---

## 0. Gate-Klarstellung — was v1 DARF und was am harten Gate hängt (analog ADR-0008 §0)

Das **ADR-0004-Ingest-Gate** (§6/§7.1) ist **weiter ZU**: kein produktiver PII-/
Verbrauchsdaten-Ingest vor DSFA-Aktivierung + Consent-Enforcement + DE-Only-Hosting/
AVV/TIA + produktivem Audit-Log (ADR-0003). **Dieses Feature öffnet das Gate NICHT.**
Die entscheidende Abgrenzung — und der Grund, warum ADR-0005 trotz geschlossenem Gate
gebaut werden darf:

**DARF (kein Gate-Verstoß) — Pipeline bauen + betreiben mit SYNTHETISCHEN Uplinks:**
- Das Ziel-Hypertable existiert (V0002), die Auth-/Audit-Maschinerie existiert
  (ADR-0002/0003, ADR-0008 als erste Fach-Nutzung). Die **Ingest-Pipeline** (Broker-
  Subscription, Payload-Decoding, idempotenter Upsert, Backfill, Lücken-/Ausfall-
  Erkennung, Orphan-Check) darf **gebaut, getestet und mit synthetischen Uplinks
  betrieben** werden — zum Aufbau von Idempotenz-/Backfill-/Lücken-Nachweisen und der
  Broker-/Reconnect-/TLS-Verdrahtung.
- **Synthetischer Uplink** = simulierter ChirpStack-/MQTT-Frame mit
  **Platzhalter-DevEUI** und **synthetischen Zählerständen** (kein realer Sensor, kein
  reales Gateway, keine reale Person/Anlage). Deckung: ADR-0004 Gate-Bedingung 1 (nur
  synthetische Daten bis Gate-Freigabe); DSFA-0001 §1 beschreibt den **Messwert-Pfad**
  `ChirpStack → Mosquitto/MQTT → Ingest-Worker → measurement.messwert` bereits
  ausdrücklich als die vorgesehene operative Umsetzung, inkl. synthetischem Beispiel.

**HÄNGT AM HARTEN GATE (nicht Teil dieses Features):**
- **Anbindung realer LoRaWAN-Gateways/Zähler realer Haushalte/Anlagen** — der Moment,
  in dem echte Verbrauchszeitreihen fließen, ist der **gate-pflichtige Akt** (DSFA
  active, Consent, DE-Only, AVV/TIA — auch für einen etwaigen ChirpStack-Managed-
  Service/Netzbetreiber als Auftragsverarbeiter, DSFA-0001 §1), **plus produktives
  Audit-Log**.
- **Gate-Bedingung 6 (kein verdrahteter Prod-Datenpfad auf Verbrauchs-/PII-Tabellen
  bis Freigabe):** Die Pipeline ist so zu bauen, dass der **Umschalt-Punkt auf
  Echtbetrieb** (reale Broker-Credentials/Topics statt synthetischem Publisher) ein
  bewusster, `compliance-director`-freigegebener Schritt bleibt — **`synthetic-only`
  als technisch erzwungenes Default** (analog ADR-0008 §6.6). Der **Bau** verletzt
  Bedingung 6 nicht; der **produktive Real-Ingest** wäre der gate-pflichtige Akt.

**Fazit:** v1 = **synthetic-only, gebaut & getestet, aber nicht produktiv real-Sensor
geschaltet.** Das Feature bringt die vollständige, nachweisbare Ingest-Maschinerie bis
an das Gate heran, ohne es zu öffnen.

---

## 1. Vision-Satz (Job-to-be-done)

> **Als internes Betriebs-Team und als Fach-Services (Baseline, Einsparberechnung,
> BAFA-Export) brauche ich eine kontinuierliche, lückenlos nachweisbare und
> manipulationssichere Erfassung der Zählermesswerte je Messkanal — von der
> LoRaWAN-Funkübertragung (ChirpStack) über den MQTT-Broker (Mosquitto) bis in das
> TimescaleDB-Hypertable —, die verspätete oder doppelte Uplinks idempotent
> verarbeitet, Backfill deterministisch nachzieht und Datenlücken/Messtechnik-Ausfälle
> je Zähler förder-tauglich erkennt und meldet, damit am Ende jedes Förderjahres
> sämtliche Zählerstände in mindestens täglicher Auflösung vollständig vorliegen
> (DE-02/TB-09) und Ausfälle belegt sind (TB-04).**

Phase-1-Gate „Vision in einem Satz formulierbar": **erfüllt.**

ADR-0005 ist der **Datenzufluss** des EDMS: Ohne verlässliche, vollständige Messwerte
haben ADR-0006 (Baseline), ADR-0007 (Einsparberechnung + BAFA-Export) und das spätere
Nutzerportal keine belastbare Grundlage. Der **Vollständigkeits-/Lücken-Nachweis
(DE-02)** ist zugleich eine **harte Förderauflage** — der Vollständigkeits-/Störungs-
Blick ist bereits in ADR-0008 (Betriebs-UI, DE-02-Monitoring) angelegt; ADR-0005
**speist** ihn mit echten Ingest-Lückensignalen.

---

## 2. Zielnutzer / Kurz-Personas

**Persona A — Fach-Service / Ingest-Worker (primär, System-Akteur).** = ADR-0004
Persona A. Der **Ingest-Worker** abonniert den Broker, dekodiert Payloads, validiert
(Plausibilität, Einheiten, Monotonie kumulativer Zählerstände), löst DevEUI→Messkanal
auf und schreibt idempotent in das Hypertable. Nachgelagert lesen Baseline-/
Einsparberechnungs-Worker dieselbe Zeitreihe. **Wichtig (DSFA-0001 §1):** Der
Ingest-Worker kennt **ausschließlich Pseudonym-/Kanal-Surrogate** (`messkanal_key`),
**keine** direkt identifizierende PII (rote Linie 1, ADR-0004 §7.2). Erfolg = kein
Datenverlust bei Broker-/Worker-Neustart, keine Duplikate/Overwrites korrekter Werte,
deterministischer Backfill.

**Persona B — Internes Betriebs-Team (primär).** = ADR-0004 Persona B / ADR-0008
Persona A, RBAC-Rolle `betrieb`. Überwacht **Datenvollständigkeit (DE-02)** und
**Messtechnik-Ausfälle (TB-04)** über das in ADR-0008 angelegte Vollständigkeits-/
Störungs-Dashboard; muss bei Dauer-/Wiederholausfall **alarmiert** werden und den
Ausfall dokumentieren können (Sanktionsrisiko bei wiederholten Datenausfällen, TB-04).
Erfolg = Lücken/Ausfälle werden früh, eindeutig und je Zähler/Zeitraum sichtbar; der
Lücken-Report ist BAFA-tauglich.

**Persona C — Compliance-/Fördernachweis-Auditor (sekundär, strikt lesend).** RBAC-Rolle
`compliance-auditor`. Prüft je Förderjahr die **Vollständigkeit sämtlicher Zählerstände**
(DE-02) und die **Ausfall-Dokumentation** (TB-04) — als Metadaten-/Nachweissicht, **ohne**
Verbrauchs-Detaileinsicht über das Erforderliche hinaus (ADR-0008 §6.5, DS-07-Innensicht).
Erfolg = Vollständigkeits-/Lücken-Nachweis ohne Fachbedienung und ohne Klartext-PII.

**Persona D — Endkunde / Anschlussnutzer / betroffene Beschäftigte (nicht in Scope,
compliance-relevant).** Die Verbrauchszeitreihen sind **die** personenbeziehbaren Daten
der DSFA-0001 (Haushalts-Lastgänge; bei gewerblichen Anlagen ggf. Rückschluss auf
Betriebsabläufe/Beschäftigte → Beschäftigtendatenschutz, Art. 88 DSGVO/§26 BDSG, vgl.
ADR-0003-Schärfung). **Kein** Endnutzer-Zugriff in ADR-0005; hier nur als Grund für das
geschlossene Gate und den synthetic-only-Betrieb relevant.

**Stakeholder — `compliance-director` / DSB / BAFA / DevOps.** Prüfen, dass der
Ingest-Pfad die DS-10-/Pseudonymitäts-/DE-02-/TB-04-Auflagen einhält und das Gate
technisch geschlossen bleibt. **DevOps** betreibt Broker + Worker (Reconnect,
Backpressure, Orphan-Check-Alerting) — Vorwirkung Deployment.

---

## 3. Erfolgsmetriken (messbar)

| # | Metrik | Messverfahren | Zielrichtung |
|---|--------|---------------|--------------|
| **M1** | **Idempotenz nachweisbar** — identische/verspätete/erneut zugestellte Uplinks erzeugen **keine** Duplikate und überschreiben **keine** korrekten Werte | Integrationstest (Testcontainer-PG16+Timescale-`oss`): denselben synthetischen Uplink n-fach zustellen; `count(*)` je `(messkanal_key, ts)` bleibt 1; Wert unverändert | **0** Duplikate, **0** unbeabsichtigte Overwrites |
| **M2** | **Backfill deterministisch** — Lade-Reihenfolge (live/verspätet/Batch-Import) ist **ergebnis-irrelevant** | Testcontainer: dieselbe Uplink-Menge in verschiedenen Reihenfolgen ingestieren; Zeitreihe **bitgleich** (inkl. `qualitaet`**+**`herkunft`**-composite**-Vorrangregel, F4 — `herkunft` als **Tiebreak bei Rang-Gleichstand**, präzisiert Teil B §24/D1) | Ergebnis **reihenfolge-invariant**, **`herkunft`-Achse eingeschlossen** |
| **M3** | **Kein Datenverlust bei Broker-/Worker-Neustart** — mindestens **at-least-once**-Zustellung durchgehalten | Chaos-Test: Worker/Broker während Ingest killen und neu starten; alle vor dem Kill bestätigten Uplinks sind nach Recovery persistiert (in Verbindung mit M1: at-least-once + idempotent = effektiv exactly-once ins Hypertable) | **0** verlorene bestätigte Uplinks |
| **M4** | **Lücken-Report DE-02-tauglich** — je Zähler/Messkanal und Förderjahr sind fehlende Tage bei Mindestauflösung ≥ 1/Tag korrekt und indexgestützt ermittelbar | Test gegen synthetische Fixtures mit **gezielt gesetzten Lücken**; Lücken-Menge = Erwartung; Ergebnis speist das ADR-0008-Dashboard | Report **deckungsgleich** mit Fixture-Erwartung |
| **M5** | **Ausfall-Alarmierung (TB-04)** — Dauer-/Wiederholausfall je Zähler löst ein **Alert** (nicht nur Log) aus; Ausfall ist als Vorgang dokumentierbar | Test: Uplink-Ausbleiben über konfigurierten Schwellwert simulieren → Alert-Emit + Audit-Event | Alert **ausgelöst**; Ausfall dokumentiert |
| **M6** | **Referentielle Integrität ohne DB-FK** — kein verwaister `messkanal_key` (V0002-Bedingung S3a/S3c) | (a) Kanal-Validierung **vor** Insert im Worker; (b) täglicher **Orphan-Check-Job mit Alerting**; Test: unbekannter `kanal_key` → Reject in Dead-Letter, kein Insert | **0** Orphans; unbekannte Kanäle sauber abgewiesen |
| **M7** | **Synthetic-only-Garantie** (Gate-Bedingung 1/6) — Ende-zu-Ende auf synthetischen Uplinks; keine realen DevEUIs/Zählernummern in Fixtures; kein Rohwert-/PII-Leak in Logs | PII-/Secret-Scan auf Fixtures + Worker-Logs (pino-redact); `synthetic-only`-Flag als Default; Real-Ingest nur per `compliance-director`-Freigabe | Scan **grün**; Umschalten **nur** freigegeben |

> M4/M5 sind die **Förder-Kernmetriken** (DE-02/TB-04/TB-09). M1–M3 sind die
> **technischen Ingest-Kernmetriken** (Idempotenz/Backfill/Verlustfreiheit). M6/M7
> sichern Integrität und Gate.

---

## 4. Kernumfang vs. Abgrenzung

### 4.1 In-Scope v1 (Vorschlag — abhängig von F1)

- **Broker-Subscription-Pfad:** Ingest-Worker abonniert Mosquitto (MQTT), TLS nach
  BSI TR-02102 (DS-10), Credentials nur aus ENV/Secrets (iot-Regel). **Kern-Baustein**
  laut Roadmap.
- **Payload-Decoding je Gerätetyp:** versionierte Decoder-/Normalisierungs-Registry im
  Worker (Rohframe → normierter Messwert mit Einheit/Art), v1 mit **einem synthetischen
  Referenz-Gerätetyp** (Strategie = F3).
- **Uplink→Messkanal-Zuordnung:** Auflösung DevEUI → `energy.messkanal.kanal_key`
  (Korrelations-Design = F5, **compliance-gated**, s. 4.3/6).
- **Idempotenter Schreibpfad:** `INSERT … ON CONFLICT (messkanal_key, ts) …` gegen das
  bestehende V0002-Hypertable; Konflikt-/Backfill-Semantik = F4.
- **Backfill:** verspätete Uplinks und (optional) Batch-Nachladung; deterministisch,
  ohne Overwrite korrekter Werte (M2).
- **Lücken-/Ausfall-Erkennung (DE-02/TB-04/TB-09):** je Zähler/Messkanal Lücken bei
  Mindestauflösung ≥ 1/Tag; Dauer-/Wiederholausfall-Alarmierung; Report speist das
  ADR-0008-DE-02-Dashboard.
- **Referenz-Integritäts-Absicherung ohne DB-FK:** Kanal-Validierung vor Insert +
  täglicher Orphan-Check-Job mit Alerting (V0002-Bedingungen S3a/S3c einlösen).
- **Synthetic-only-Erzeuger:** simulierter ChirpStack-/MQTT-Publisher für synthetische
  Uplinks (Broker-/ChirpStack-Realitätsgrad = F2).

### 4.2 Out-of-Scope v1 (mit Verankerungs-Bezug)

- **Baseline/Bereinigung** (Witterung/Gradtagzahlen, Regression) → **ADR-0006**.
  ADR-0005 liefert nur die Roh-Zeitreihe „as delivered" (kumulativ/intervall gemäß
  `messkanal.art`, **keine** verlustbehaftete Umrechnung beim Ingest, DSFA-0001 §2).
- **Einsparberechnung + BAFA-Export** → **ADR-0007**. ADR-0005 liefert die Rohdaten-
  Kategorie (DE-03), rechnet/exportiert nichts.
- **Geräteerkennung (NILM/Direktmessung, TB-05-Quoten)** → späterer ADR. ADR-0005
  schreibt nur Kanal-Rohwerte, keine Geräte-Disaggregation.
- **Retention/Cold-Archiv der Rohmesswerte** (`drop_chunks()`-Fenster, Apache-2-
  Ersatzkonzept) → gebunden an **O2** (Retention-Horizont, ADR-0004 §8.2/§20.1;
  DSFA-0001 §1 Speicherbegrenzung offen). ADR-0005 v1 **erzeugt** Rohmesswerte, legt
  aber die Löschstrategie nicht fest (Abschnitt 6/7).
- **DE-02-Dashboard-UI** selbst → gehört ADR-0008. ADR-0005 liefert die **Lücken-/
  Ausfall-Signale**, die das Dashboard darstellt.
- **Manuelle Messwert-Erfassung / Alt-System-CSV-Import** (`herkunft=manuell|
  import_altsystem`, in V0002 als Enum-Wert vorgesehen) → eigener Migrations-/
  Import-Scope (`migration-engineer`); v1 fokussiert den Live-/Backfill-MQTT-Pfad.

### 4.3 Der eine compliance-gated Struktur-Punkt: DevEUI → Messkanal (O4)

**`energy.zaehler.geraete_referenz` existiert in V0002 NICHT** — bewusst
zurückgestellt, weil die **Quasi-Identifier-Klassifizierung** von devEUI/Seriennummer
noch **nicht** durch `compliance-director` final entschieden ist (V0002-Kopf Abweichung
(a); ADR-0004 §20.1 **Offener Punkt O4**; Anhang B Eintrag Q1). Genau diese Spalte ist
aber der **natürliche Ankerpunkt der Uplink→Messkanal-Korrelation** — der Ingest-Worker
muss aus der DevEUI eines Uplinks den `kanal_key` bestimmen. **Das ist der substanzielle
Struktur-/Compliance-Punkt von ADR-0005** (analog zur DS-07-Innensicht in ADR-0008): die
O4-Klassifizierung ist eine **Vorbedingung** des Korrelations-Designs (F5) und keine
bloße Nachtrags-Formalie. Bis O4 entschieden ist, arbeitet v1 mit **synthetischen
Platzhalter-DevEUIs** und trifft **keine** produktive Real-Korrelation.

### 4.4 Abgrenzung zum bestehenden Schema (kein Neu-Entwurf des Zeitreihen-Kerns)

ADR-0005 **entwirft das Messwert-Hypertable nicht neu** — es nutzt V0002:
`measurement.messwert (messkanal_key, ts, wert numeric(18,3), qualitaet, herkunft,
erfasst_at)`, Hypertable (7-Tage-Chunks), Idempotenz-Ziel `ux_messwert_kanal_ts`,
FK-loser Zugriff über `kanal_key` unter drei V0002-Bedingungen (S3a Orphan-Check +
Alerting, S3b `status`-Spalten/kein Hard-Delete = erfüllt, S3c Kanal-Validierung vor
Insert). **S3a und S3c sind genau die Ingest-/Betriebs-Aufgaben, die ADR-0005 einlöst.**
**Etwaige Zusatz-Schema-Bausteine** (DevEUI-Mapping nach O4, Dead-Letter-Tabelle für
nicht zuordenbare Uplinks, ggf. Materialisierung des Lücken-Reports als Materialized
View + `pg_cron` statt teurem Live-Scan) sind **Phase-2-Entscheidungen** und würden per
`/add-migration` **nach** Phase 3 entstehen — **kein** Schema in diesem Memo.

---

## 5. Alternativen (Produktebene, mit Trade-offs)

### 5.1 v1-Scope-Tiefe: volle Pipeline synthetic-only vs. Worker-Kern zuerst
- **A — volle Pipeline synthetic-only** (Broker-Subscription + Decoder-Registry +
  idempotenter Upsert + Backfill + Lücken-/Ausfall-Erkennung + Orphan-Check), analog
  ADR-0008. *Pro:* die **Förder-Kernmetriken M4/M5 (DE-02/TB-04)** und die Idempotenz-/
  Backfill-Nachweise (M1–M3) entstehen in **einem** Zug und sind real getestet, bevor je
  ein echter Sensor angebunden wird; der Lücken-Report ist Pflicht und gehört zum Kern.
  *Contra:* größerer v1-Umfang.
- **B — Worker-Kern zuerst** (Subscription + Upsert + minimaler Decoder), Lücken-/
  Ausfall-Erkennung + Backfill später. *Pro:* schneller erster Durchstich. *Contra:*
  DE-02/TB-04 sind **Förderauflagen** — sie später nachzuziehen verschiebt genau den
  nachweiskritischen Teil; ohne Lücken-Report ist der Ingest förder-unvollständig.
- **Empfehlung: A** (analog ADR-0008). → **F1**.

### 5.2 ChirpStack echt vs. simuliert in v1
- **A — echter ChirpStack + Mosquitto als Dev-Netzwerkdienste**, synthetische Uplinks
  über simulierte Devices. *Pro:* realistischster Frame-/Topic-Pfad. *Contra:* großer
  Dev-Stack-Zuwachs (zwei neue Dienste + Gateway-Bridge) für einen Nutzen, der in v1
  ohne echte Gateways gering ist.
- **B — echter Mosquitto-Broker + synthetischer MQTT-Publisher, der ChirpStack-Uplink-
  Frames als Fixture nachbildet** (kein echter ChirpStack). *Pro:* der **echte
  MQTT-Subscription-Pfad** (Reconnect, QoS, TLS TR-02102) wird real getestet; das
  ChirpStack-Frame-Format wird als versionierte Fixture nachgebildet; echter ChirpStack
  erst, wenn reale Gateways angebunden werden — und das ist **gate-nah**. *Contra:*
  ChirpStack-spezifische Eigenheiten (Integration-API-Details, Frame-Metadaten) erst
  später real.
- **C — kein Broker, synthetischer Feed direkt in den Worker** (In-Process). *Pro:*
  schnellste Unit-/Contract-Tests. *Contra:* umgeht Broker/QoS/Reconnect — deckt M3
  (Neustart-Verlustfreiheit) nicht ab.
- **Empfehlung: B als v1-Default** (echter Broker, simulierter ChirpStack), **C als
  ergänzende Test-Ebene**, **A erst gate-nah**. → **F2.** Lizenz-Hinweis: Mosquitto
  (EPL-2.0/EDL-1.0) und ChirpStack (MIT) sind **Netzwerkdienste über die Grenze** und
  laut `.claude/rules/dependencies.md` unkritisch; die **im Worker eingebettete
  MQTT-Client-Library** muss auf der Whitelist stehen (Prüfpflicht Phase 2, z. B.
  `mqtt`/MIT — vor `npm install` gegen `dependencies.md` prüfen).

### 5.3 Payload-Decoding: Worker-seitige Registry vs. ChirpStack-Codec
- **A — versionierte Decoder-/Normalisierungs-Registry im Worker** (TypeScript je
  Gerätetyp). *Pro:* der Worker ist der **Vertrauens-/Plausibilitäts-Anker** (Einheiten,
  Monotonie, Skalierung), Herkunft im Git nachweisbar (Eigenentwicklungs-Nachweis).
  *Contra:* Decoder-Pflege im Produktcode.
- **B — ChirpStack-seitige Codecs** (JS in ChirpStack), Worker bekommt fertiges JSON.
  *Pro:* weniger Worker-Code. *Contra:* verlagert Vertrauens-/Plausibilitätslogik in ein
  Fremdsystem; Worker müsste ungeprüftes JSON übernehmen (defensiv unerwünscht).
- **Empfehlung: A mit defensiver Haltung** — selbst wenn ChirpStack vordekodiert, **nie
  ungeprüft übernehmen**; Einheiten-Normalisierung/Plausibilität immer im Worker. v1
  minimal: **ein** synthetischer Referenz-Gerätetyp; Registry-Muster für weitere Typen
  offen. → **F3.**

### 5.4 Idempotenz-/Backfill-Konflikt-Semantik (Schlüssel steht, Semantik offen)
Der Idempotenz-Schlüssel `(messkanal_key, ts)` **steht bereits** (V0002); offen ist die
**Konflikt-Auflösung** bei erneuter Zustellung/Backfill:
- **A — `DO NOTHING`** (erster Wert gewinnt, spätere Zustellungen ignoriert). *Pro:*
  maximal einfach, reine Idempotenz. *Contra:* nachträgliche **Korrekturen**
  (Ersatzwert → gemessener Wert) nicht abbildbar; DE-03-Korrekturhistorie fehlt.
- **B — `DO UPDATE` mit strikter Vorrang-Regel** über `qualitaet`/`herkunft` (z. B.
  „korrigiert/gemessen darf ersatzwert/geschätzt überschreiben, **nie** umgekehrt"),
  Korrektur append-only nachvollziehbar. *Pro:* deterministisch (M2), Backfill-Korrektur
  möglich, **kein Overwrite korrekter Werte** (iot-Regel). *Contra:* Vorrang-Regel muss
  präzise definiert und getestet werden.
- **Empfehlung: B** — Vorrang-Regel als Phase-2-Detail (`technical-director`/
  `iot-ingestion-engineer`/`database-lead`). → **F4.**

### 5.5 Worker-Deployment: eigener Prozess vs. In-Monolith-Worker
- **A — eigenständiger Prozess/Service** (separater Bootstrap-Entrypoint, NIE im
  Request-Pfad). *Pro:* iot-Regel + backend-Regel („keine synchronen Langläufer im
  Request"); Broker-Reconnect/Backpressure isoliert; horizontal skalierbar. *Contra:*
  zweiter Betriebs-/Deployment-Artefakt-Pfad (DevOps-Vorwirkung).
- **B — In-Monolith-Worker** (Modul im API-Prozess mit eigenem Bootstrap). *Pro:*
  weniger Betriebs-Overhead. *Contra:* Broker-I/O + API teilen ein Fate-Sharing;
  Neustart der API stoppt den Ingest.
- **Empfehlung: A als Zielbild** (eigener Prozess, ggf. gleiches Image/Repo, **kein**
  neues Drittsystem außer dem Broker). Feinschnitt (Standalone-App vs. `@nestjs/
  microservices`-Transport, Skalierung) = Phase 2. → **F6.**

---

## 6. Sequenzierung / Voraussetzungen & Interaktion mit den harten Gates

| Baustein | Status | Bedeutung für ADR-0005 |
|---|---|---|
| **Ziel-Schema** `measurement.messwert` + Idempotenz-Constraint | **liegt vor** (V0002, 2026-07-09) | ADR-0005 baut **auf** dieses Schema; löst V0002-Bedingungen S3a/S3c ein |
| **Stammdaten** (Zähler/Messkanal, `kanal_key`) | **gebaut** (ADR-0008, `src/backend/src/stammdaten/**`) | liefert die Kanäle, auf die der Ingest referenziert |
| **Auth/RBAC/ABAC + Audit-Emit** | **accepted/gebaut** (ADR-0002; ADR-0003 in Arbeit) | für Betriebs-/Monitoring-Sichten + Audit der Ausfall-/Backfill-Vorgänge |
| **ADR-0004-Ingest-Gate** (DSFA active + Consent + DE-Only/AVV/TIA + Audit-Log produktiv) | **ZU** | sperrt **realen** Sensor-Ingest; v1 bleibt synthetic-only (Abschnitt 0) |
| **O4 — Quasi-Identifier-Klassifizierung DevEUI/`geraete_referenz`** | **offen** (ADR-0004 §20.1) | **Vorbedingung** des Korrelations-Designs F5 (§4.3) |
| **O2 — Retention-Horizont Rohmesswerte** | **offen** (ADR-0004 §8.2; DSFA-0001 §1) | bestimmt spätere `drop_chunks()`-/Cold-Archiv-Strategie; nicht v1-blockierend, aber vor Gate-Öffnung fällig |

**Die harten Gates werden hier benannt, nicht gelöst:** ADR-0002 (AuthZ) und ADR-0003
(Audit) **stehen** bzw. sind gebaut/in Arbeit; **DSFA-Aktivierung, Consent-Enforcement,
DE-Only-Hosting + AVV/TIA** bleiben **Vorbedingungen für den echten Ingest** (DSFA-0001
§7, Ingest-Gate). ADR-0005 v1 ist bewusst so geschnitten, dass es **keine** dieser
Vorbedingungen berührt (synthetic-only), sie aber auch **nicht** aufweicht.

---

## 7. Compliance-Einfluss / Phase-1-Risiko-Flag (Vorschlag des Autors)

**Vorgeschlagenes Gesamt-Flag: HOCH der Art nach — effektiv MITTEL, solange
synthetic-only technisch hält (latent HOCH).** Begründung: ADR-0005 operationalisiert
**genau** den Messwert-Pfad, den DSFA-0001 als Art.-35-Auslöser bewertet (Haushalts-
Verbrauchsprofile, hohe Auflösung, LoRaWAN als „innovative Technologie", DSFA-0001 §0/§1).
In v1 fließt jedoch **kein** realer personenbezogener Datensatz (Gate ZU, synthetic-only)
— daher **effektiv MITTEL**, analog zur `compliance-director`-Einordnung von ADR-0008.
**Die endgültige Einstufung trifft `compliance-director`** (Phase-1-Veto-Gate).

**Voraussichtliche Phase-3-Deliverables (dünn + ein substanzieller Punkt):**
- **DSFA-0001-Nachtrag** — der **Messwert-Pfad ist in DSFA-0001 §1 bereits beschrieben**;
  ADR-0005 begründet **keine** neue Art.-35-DSFA, sondern präzisiert die operative
  Umsetzung (Broker-TLS, Decoder-Vertrauensanker, Idempotenz/Backfill, Lücken-/Ausfall-
  Nachweis). Erwartung analog ADR-0008: **überwiegend Nachtrag/TOM-Verweis.**
- **Substanzieller Punkt — O4-Quasi-Identifier-Klassifizierung** (DevEUI/
  `geraete_referenz`, §4.3): echte Compliance-Entscheidung (Klartext vs. gehashte/
  pseudonymisierte Korrelation), Vorbedingung von F5. Analog dem DS-07-Innensicht-Punkt
  in ADR-0008.
- **O2-Berührung — Speicherbegrenzung** (Art. 5 Abs. 1 lit. e): ADR-0005 erzeugt die
  Rohmesswerte, deren Retention-Horizont noch offen ist (DSFA-0001 §3.6, Risiko 9
  „mittel"). Vor Gate-Öffnung fällig.
- **TB-04-Ausfall-Nachweis** als Förder-/ISO-Nachweis (Protokollierung/Alarmierung).
- **Beschäftigtendatenschutz** (Art. 88/§26 BDSG), falls gewerbliche Anlagen
  Rückschlüsse auf Beschäftigte/Betriebsabläufe erlauben (vgl. ADR-0003-Schärfung) —
  durch `compliance-director` zu bewerten.
- **TOMs/DS-10:** MQTT-TLS nach TR-02102, Credentials nur ENV/Secrets, keine Rohwerte/
  PII in Worker-Logs (pino-redact), synthetic-only technisch erzwungen.
- **Voraussichtlich berührte ISO-Controls (grob, Feinmapping Phase 3 durch
  `iso27001-auditor`):** A.5.34 (Privacy/PII), A.8.24 (Kryptografie, Transport-TLS),
  A.8.15/A.8.16 (Protokollierung/Monitoring, Ausfall-Alarmierung), A.5.7/A.8.16
  (Threat/Anomalie), A.8.10 (Löschung, via O2), A.5.23 (Cloud-Dienste, falls
  ChirpStack-Managed-Service → AVV/TIA).

**Harte Regel:** Ich schreibe **nicht** in `compliance/**`. DSFA-0001-Nachtrag,
RVT-Berührung (VT-0001), TOM-Zusatz, R-0002/R-0004-Berührung und Control-Mapping laufen
in **Phase 3** über `compliance-director` / `dsgvo-auditor` / `iso27001-auditor` — und
sind, wie das ganze ADR, dem **`compliance-director`-Phase-1-Veto** vorgelagert.

**Phase-1-Gate „Compliance-Risiko grob benannt": erfüllt — Vorschlag HOCH/effektiv
MITTEL, finale Einstufung durch `compliance-director`.**

---

## 8. Fragen-Status nach Phase 1

> Alle sechs waren **Phase-1-Entscheidungen** und sind **entschieden (User,
> 2026-07-16)**. Technik-Detail (Topic-Layout, QoS, Chunk-/Rollup-Feinschnitt,
> Vorrang-Regel-Kodierung) bleibt bewusst Phase 2.

### 8.1 Entschieden (User, 2026-07-16)

- **F1 = A — volle Pipeline synthetic-only.** Broker-Subscription + Decoder-Registry +
  idempotenter Upsert + Backfill + **Lücken-/Ausfall-Erkennung (DE-02/TB-04)** +
  Orphan-Check **in einem Zug** (5.1 A). Die Förder-Kernmetriken M4/M5 entstehen
  gemeinsam mit den Ingest-Kernmetriken M1–M3.
- **F2 = B — echter Mosquitto-Broker + simulierter Uplink-Publisher; MQTT-only-
  Integrationsgrenze (verbindliche Phase-2-Randbedingung).** Wichtige Topologie-
  Klarstellung des Users:
  - **ChirpStack ist NICHT Teil des EDMS-Stacks.** ChirpStack läuft in einem
    **eigenen, separaten, extern betriebenen Stack/Umgebung**; Konfiguration und
    Betrieb von ChirpStack liegen **außerhalb des EDMS-Scopes**.
  - Das EDMS **holt Messdaten ausschließlich über MQTT** (Subscribe am Broker, auf
    dem ChirpStack publiziert). Die **Integrationsgrenze ist strikt MQTT-only**.
  - Der **EDMS-Dev-Compose** bekommt daher **Mosquitto + einen synthetischen
    Uplink-Publisher — KEINEN ChirpStack** (Vorwirkung `deployment/docker/
    docker-compose.dev.yml`, Phase 2/4).
  - Das **verstärkt die Netzwerkgrenze-Argumentation** aus
    `.claude/rules/dependencies.md`: der Broker (Mosquitto, EPL-2.0/EDL-1.0) ist der
    einzige Berührungspunkt; die im Worker eingebettete MQTT-Client-Library bleibt
    lizenz-prüfpflichtig (Phase 2). Der frühere Alternativ-Pfad „echter ChirpStack im
    Dev-Stack" (5.2 A) ist damit **verworfen**; A bleibt allenfalls gate-nah/extern.
  - Konsequenz für die ADR-Überschrift/§0: „ChirpStack →" bezeichnet weiterhin die
    **fachliche Herkunft** der Uplinks, **nicht** eine EDMS-interne Komponente — die
    EDMS-Systemgrenze beginnt am **MQTT-Broker**.
- **F3 = A — versionierte Decoder-/Normalisierungs-Registry im Worker als
  Vertrauensanker.** Plausibilität/Einheiten-Normalisierung **immer im Worker** (nie
  ungeprüft übernommenes JSON); v1 = **ein** synthetischer Referenz-Gerätetyp
  (5.3 A).
- **F4 = B — `DO UPDATE` mit `qualitaet`/`herkunft`-Vorrangregel.** Kein Overwrite
  korrekter Werte, DE-03-Korrekturhistorie nachvollziehbar; deterministisch/
  reihenfolge-invariant (M2). Präzise Vorrang-Regel = Phase-2-Detail (5.4 B).
- **F5 / O4 = Sequenz (verbindliche Vorbedingung).** **Erst**
  `compliance-director`-Klassifizierung der **DevEUI-Quasi-Identifier-Frage**
  (ADR-0004 O4), **dann** DevEUI→Messkanal-Mapping-Design in Phase 2. Bis dahin nutzt
  v1 **synthetische Platzhalter-DevEUIs**; **keine** produktive Real-Korrelation. Die
  O4-Klassifizierung ist als **Vorbedingung des Korrelations-Designs** markiert
  (§4.3, §6, §7).
- **F6 = A — Ingest-Worker als eigenständiger Prozess** (nie im Request-Pfad),
  **gleiches Image/Repo**, **kein** neues Drittsystem außer dem Broker (5.5 A).
  Feinschnitt (Standalone-App vs. Microservice-Transport, Skalierung) = Phase 2.

### 8.2 Nächste Vorbedingung vor Phase 2 / Ausstehend

- **`compliance-director`-Phase-1-Sichtung (Veto-Gate) — nächste Vorbedingung.**
  Finales Risiko-Flag; **O4-Klassifizierungsauftrag** (DevEUI/`geraete_referenz`,
  Vorbedingung für F5/das Korrelations-Design); Bestätigung der synthetic-only-
  Rahmung (Abschnitt 0); Phase-3-Vorschau (DSFA-0001-Nachtrag, TOMs, ISO,
  O2-Retention/Beschäftigtendatenschutz). **Ohne diese Sichtung keine Phase-2-Übergabe.**
- **Roadmap-Fortschreibung steht aus** (`production/roadmap.md`: ADR-0005 „Als
  Nächstes" → „Jetzt/in Arbeit") — **nur mit User-Bestätigung** (harte Regel
  Roadmap-Änderung); in diesem Memo **nicht** vollzogen.

---

## 9. Konsequenzen (Vorschau, final in Phase 2)

### Positiv
- Der vollständige, förder-nachweistaugliche Ingest-Pfad (Idempotenz, Backfill, DE-02-
  Lücken, TB-04-Ausfall) wird **real getestet**, bevor je ein echter Sensor fließt.
- Speist das bereits gebaute ADR-0008-DE-02-Dashboard mit echten Lückensignalen;
  liefert die Rohdaten-Grundlage für ADR-0006/0007.
- Löst die offenen V0002-Bedingungen S3a/S3c (Orphan-Check, Kanal-Validierung) ein.

### Negativ
- Neuer Betriebs-Baustein (Mosquitto-Broker + Worker-Prozess) → DevOps-/Deployment-
  Vorwirkung (Reconnect, Backpressure, Alerting).
- Der substanzielle O4-Punkt (DevEUI-Klassifizierung) macht einen Teil von Phase 3
  substanziell und ist Vorbedingung von F5.

### Neutral
- Setzt das Ingest-/Worker-Muster (eigener Prozess, Decoder-Registry, idempotenter
  Upsert, Lücken-/Ausfall-Erkennung), an das spätere Datenzuflüsse (Alt-Import,
  weitere Gerätetypen) gebunden sind.

---

## 10. Folgeaufgaben

- [x] **User-Freigabe Phase 1** — Entscheidungen F1–F6 getroffen (2026-07-16,
      Abschnitt 8.1), inkl. F2 MQTT-only-Topologie (ChirpStack extern, nicht Teil des
      EDMS-Stacks).
- [ ] **`compliance-director`-Phase-1-Sichtung (Veto-Gate) — nächste Vorbedingung:**
      finales Risiko-Flag; **O4-Klassifizierungsauftrag** (DevEUI/`geraete_referenz`,
      Vorbedingung für F5); Bestätigung der synthetic-only-Rahmung; Phase-3-Vorschau
      (DSFA-0001-Nachtrag, TOMs, ISO, O2/Beschäftigtendatenschutz). **Ohne diese
      Sichtung keine Phase-2-Übergabe.**
- [ ] **Roadmap-Fortschreibung** (`production/roadmap.md`): ADR-0005 „Als Nächstes" →
      „Jetzt (in Arbeit, Phase 1→2)" — **nur mit User-Bestätigung** (harte Regel
      Roadmap-Änderung), in diesem Memo **nicht** vollzogen.
- [ ] **Übergabe an `technical-director` (Phase 2):** Topic-Layout/QoS, Decoder-Registry-
      Design (F3), Konflikt-/Vorrang-Regel (F4), DevEUI-Mapping nach O4 (F5), Worker-
      Deployment-Schnitt (F6), Lücken-Report-Materialisierung (MV + `pg_cron` vs. Live-
      Scan, nur Apache-2-Features), MQTT-Client-Lizenz-Check (`dependencies.md`) —
      unter Beachtung von Abschnitt 0 (Gate) und 7 (Compliance-Vorbehalte).
- [ ] **Phase 3 (vor Implementation):** `compliance-director` + `dsgvo-auditor` +
      `iso27001-auditor` — DSFA-0001-Nachtrag, O4-Klassifizierung (substanziell), O2-
      Berührung, TB-04-Nachweis, TOMs/ISO-Mapping.

---

## Anhang A — Anforderungs-Mapping (Scope → Pipeline-Baustein / bestehendes Schema)

> Nachweisgrundlage für die Metriken. Verfeinerung = Phase 2.

| Anforderung | Quelle | Baustein in ADR-0005 / bestehendes Schema |
|-------------|--------|--------------------------------------------|
| Kontinuierliche Erfassung je Messkanal | Vision | Broker-Subscription → Decoder → idempotenter Upsert in `measurement.messwert` (V0002) |
| Idempotenz (keine Duplikate/Overwrites) | iot-Regel / M1 | `ON CONFLICT (messkanal_key, ts)` gegen `ux_messwert_kanal_ts` (V0002); Konflikt-Semantik F4 |
| Backfill deterministisch | Roadmap / M2 | verspätete/Batch-Uplinks, reihenfolge-invariant; Vorrang-Regel F4 |
| Verlustfreiheit bei Neustart | M3 | at-least-once Broker + idempotenter Upsert (Broker-Realitätsgrad F2) |
| Auflösung ≥ 1/Tag, Vollständigkeit je Förderjahr | DE-02 / TB-09 | Lücken-Report je Zähler/Messkanal (speist ADR-0008-Dashboard) |
| Nur auf Anfrage, Tabellenform (kein Dauer-Push) | DE-01 | ADR-0005 **schreibt nur intern**; Export = ADR-0007 (kein automatischer Push) |
| Rohdaten als Export-Kategorie | DE-03 | Roh-Zeitreihe „as delivered" (keine verlustbehaftete Umrechnung); Aufbereitung = ADR-0007 |
| Messtechnik ganzjährig aktiv, Ausfall-Doku, Alarm bei Wiederholausfall | TB-04 | Ausfall-Erkennung + Alerting + dokumentierbarer Ausfall-Vorgang (M5) |
| Referentielle Integrität ohne DB-FK | V0002 S3a/S3c | Kanal-Validierung vor Insert + täglicher Orphan-Check-Job mit Alerting (M6) |
| DevEUI → Messkanal-Zuordnung | Ingest-Kern | Korrelations-Design F5, **compliance-gated an O4** (§4.3) |
| MQTT-Transport verschlüsselt, Credentials aus Secrets | DS-10 / iot-Regel | TLS nach TR-02102; Credentials nur ENV/Secrets; keine Rohwerte/PII in Logs |
| Nur synthetische Daten bis Gate-Freigabe | ADR-0004 Gate-Bed. 1/6 | synthetischer Uplink-Erzeuger; `synthetic-only`-Default technisch erzwungen (M7) |
| Retention/Löschung Rohmesswerte | Art. 5(1)(e) / O2 | **offen** — gebunden an O2; Löschstrategie nicht v1 (§4.2/6) |

---

# Teil B — Phase-2-Design (Architektur & Technik)

- **Status:** **proposed** (2026-07-16). Design-Owner: `technical-director`.
  **Reviews ausstehend:** `security-lead`, `timescale-engineer`, `database-lead`
  (Konsolidierung + Freigabe folgt, analog ADR-0008 §29/§30). Status bleibt
  `proposed` bis User-Freigabe der konsolidierten Offene-Punkte-Liste (§31);
  danach **Phase 3** (`compliance-director`/Auditoren), dann **Phase 4**
  (Migration + Implementation). **Kein Schreibzugriff** auf `src/`,
  `migrations/`, `compliance/`, `deployment/` in dieser Phase — nur dieses ADR.
- **Bindende Vorgaben:** die **F1–F6-Entscheidungen** (§8.1), die
  **compliance-director-Phase-1-Sichtung** (kein Veto, mit Auflagen) — v. a. die
  **O4-DevEUI-Mapping-Vorgabe** (§26, unten wörtlich ausdetailliert, **NICHT**
  verändert) sowie A2/A3, das **ADR-0004/ADR-0005-Gate** (§0, unverändert
  weiterhin ZU), `.claude/rules/backend-nestjs.md`, `dependencies.md`
  (Lizenz-Whitelist, TimescaleDB Apache-2-only), `database-migrations.md`
  (für die Schema-Skizze §28, **keine** Migration in diesem Paket).
- **Ausgangslage (kein Neu-Entwurf des Zeitreihen-Kerns, §4.4):** `measurement.
  messwert` **liegt vor** (V0002) inkl. `qualitaet`/`herkunft`-Spalten
  (bereits migriert — **keine Schema-Ergänzung für diese beiden Spalten
  nötig**, nur Semantik-Definition, §24) und Idempotenz-Ziel-Index
  `ux_messwert_kanal_ts`. Die **Auth-/ABAC-/Audit-/Krypto-Maschinerie** aus
  ADR-0002/0008/0009 **liegt vor und wird wiederverwendet, nicht neu
  erfunden**: `JwtAuthGuard`, `PolicyInterceptor`/`PolicyDecisionPort`,
  `@AuditAction`/`AuditActionInterceptor`, `@Fachaktion`, `FieldCipherService`,
  `KeyManagementPort`/`LocalDevKmsAdapter`, `KryptoShreddingService`,
  `SyntheticOnlyConfigService`/`SyntheticOnlyInterceptor`
  (`EDMS_ENV_CLASS`/`EDMS_SYNTHETIC_ONLY`, fail-closed), das ADR-0008-DE-02-
  Vollständigkeits-Dashboard (`EnergyMonitoringRepository`/`MonitoringService`/
  `MonitoringController`, bereits mit `ebene: 'endkunde'|'system'|'zaehler'`
  und `systemId`/`zaehlerId`-Feldern **vorbereitet, aber ungenutzt** — §27
  füllt genau diese Lücke).
- **Neue Artefakte (Ausblick, Phase 4):** Namensraum `device` (O4-Mapping),
  Namensraum `ingest` (Worker-Betriebs-/Fehlerpfad-Tabellen), Worker-Prozess
  (neues Bootstrap-Entrypoint im selben Repo/Image), **keine** neue
  Datenbank/Queue/Cache — Mosquitto bleibt der einzige neue Netzwerkdienst
  (F2).

> Jede D-Entscheidung nennt **Optionen**, **Entscheidung** und — wo nötig —
> **verworfene Alternative** + **offener Punkt für den Review**. Interface-
> Skizzen unten sind **Signaturen/Spaltenlisten, kein Code** (Design-
> Reifegrad, keine Implementierung in diesem Paket).

## 11. Design-Prinzipien (Ableitung O4-Vorgabe + F1–F6 + V0002-Bedingungen)

1. **DevEUI ist Quasi-Identifier — wie PII behandeln** (O4, verbindlich). Die
   Klartext-DevEUI existiert **nirgends persistent**, **nirgends im Log**.
   Jede Komponente, die eine DevEUI transient hält, hält sie **so kurz wie
   möglich** und **nie** über eine Extraktions-/Blind-Index-Berechnung hinaus.
2. **Namensraum-Trennung wie `identity`↔`energy`** (V0002 rote Linie 1/5,
   fortgeschrieben auf O4): der neue Namensraum `device` referenziert
   `energy.zaehler` **ausschließlich logisch** (`zaehler_id uuid`, **kein
   DB-FK**) — exakt das etablierte Muster `identity.*.pseudonym_id`.
3. **Deny-by-default für jede Auflösung/jedes Provisioning** (O4 Punkt 4),
   **Audit-Volumen aber operational tragbar halten** (§26.6 löst diese
   Spannung explizit auf, als **zu bestätigender** Interpretations-Punkt).
4. **Kein Auto-Provisioning durch den Worker.** Eine unbekannte DevEUI ist
   **immer** ein Orphan-/Dead-Letter-Fall, **nie** ein impliziter
   Onboarding-Trigger (verhindert Spoofing-getriebenes Self-Enrollment).
5. **Der Worker ist NIE im Request-Pfad** (F6, backend-Regel) — er ist ein
   eigenständiger Prozess mit eigenem DB-Rollen-/Rechte-Schnitt
   (Least-Privilege, §26.5), nicht bloß ein Modul im API-Prozess.
6. **Plausibilität/Einheiten immer im Worker** (F3) — ChirpStack-seitig
   vordekodiertes JSON wird **nie** ungeprüft übernommen.
7. **Reihenfolge-Invarianz vor Bequemlichkeit** (F4/M2): jede Konflikt-
   Auflösung ist eine **atomare, zustandslose** SQL-Bedingung
   (`ON CONFLICT ... WHERE`), keine Read-Modify-Write-Sequenz mit
   Race-Fenster.
8. **Nur Apache-2-Timescale-Features** (`dependencies.md`): `time_bucket`,
   gewöhnliche `MATERIALIZED VIEW` + `pg_cron`-Refresh statt Continuous
   Aggregates/Compression/Retention-Policies.

## 12. Scope-Abgleich: was in diesem Paket NICHT neu entworfen wird

- **`measurement.messwert`** (Spalten, Hypertable, `ux_messwert_kanal_ts`) —
  **unverändert**, siehe §24 für die reine Semantik-Präzisierung von
  `qualitaet`/`herkunft` (keine Spalten-Ergänzung).
- **`energy.zaehler`/`energy.messkanal`** — unverändert; **wichtige
  Klarstellung/Korrektur zum V0002-Dateikopf**: die dort skizzierte künftige
  Nachtrags-Migration „`ALTER TABLE energy.zaehler ADD COLUMN
  geraete_referenz ...`" (V0002-Kopf, Abweichung (a)) **wird durch die O4-
  Entscheidung NICHT so umgesetzt** — weder als Klartext- noch als
  verschlüsselte Spalte **auf** `energy.zaehler`. Die Korrelation lebt
  **vollständig** in einer eigenen Tabelle im **neuen** Namensraum `device`
  (§26). `energy.zaehler` bekommt **auch künftig keine** Geräte-Korrelations-
  Spalte. Diese Klarstellung ist selbst ein **Phase-3-DSFA-0001-
  Nachtragspunkt** (§32) — DSFA-0001 §1 „Datenkategorien" nennt aktuell noch
  `energy.zaehler.geraete_referenz` als Fundstelle (Zeile „Quasi-Identifier
  Gerät/Zähler"), die dort auf `device.*` zu korrigieren ist.
- **Auth/ABAC/Audit/Krypto-Bausteine** (§10 Ausgangslage) — werden
  **erweitert** (neue `PolicyAction`-Werte, neue `LueckenTyp`-Werte, ein neuer
  paralleler Krypto-Shredding-Pfad), **nicht** neu gebaut.
- **`stammdaten.openapi.yaml`** — bleibt unangetastet in diesem Paket; die
  Provisionierungs-/Auflösungs-Endpoints (§26.4) sind **Phase-4-Ausblick**
  und würden **additiv** in einen neuen `geraete-zuordnung`-Domänen-Contract
  oder als Erweiterung des Zähler-Contracts entstehen — Entscheidung
  `api-developer`/`technical-director`, Phase 4.

## 13. D1 — Topologie & Systemgrenze (F2: MQTT-only, ChirpStack extern)

**Bindend (F2, §8.1):** ChirpStack ist **nicht** Teil des EDMS-Stacks. Die
EDMS-Systemgrenze beginnt **am Mosquitto-Broker**. Der Ingest-Worker ist
**ausschließlich MQTT-Subscriber** — keine ChirpStack-REST-/Integration-API-
Anbindung in v1.

```
[extern, außerhalb EDMS-Scope]        [EDMS-Systemgrenze]
ChirpStack (LoRaWAN NS)  ──MQTT-Publish──▶  Mosquitto-Broker  ──MQTT-Subscribe──▶  Ingest-Worker
   (fachliche Herkunft,                     (TLS, ACL,                (eigenständiger Prozess,
    kein EDMS-Deployment-                    Persistenz für            F6, nie im Request-Pfad)
    Ziel)                                    Offline-Puffer)
```

**Entscheidung:** `deployment/docker/docker-compose.dev.yml` bekommt
**Mosquitto + synthetischen Uplink-Publisher** (§16) — **kein** ChirpStack-
Container (Phase-4-Vorwirkung, `devops-lead`). Mosquitto (EPL-2.0/EDL-1.0)
läuft **unmodifiziert** als Netzwerkdienst (`dependencies.md`), lizenzrechtlich
unkritisch.

**Verworfene Alternative:** echter ChirpStack-Container im Dev-Stack (Phase-1
Alt. 5.2 A) — verworfen laut User-Entscheidung F2; bleibt allenfalls gate-nah/
extern relevant (z. B. für einen späteren Feld-Test mit echten Gateways,
außerhalb dieses Pakets).

## 14. D2 — Topic-Struktur, QoS, Retained, Subscribe-Modell

**Problem.** ChirpStack publiziert Uplink-Events auf einer festen
MQTT-Integration-Topic-Konvention. Der Worker muss **applikationsübergreifend**
(alle Devices, alle Applications) abonnieren, ohne ChirpStack selbst zu
konfigurieren (extern, §13).

**Entscheidung (Topic-Muster, ChirpStack-v3/v4-Konvention nachgebildet):**

| Topic | Zweck | QoS | Retained |
|---|---|---|---|
| `application/+/device/+/event/up` | Uplink-Event (Nutzdaten-Frame) — **primäres Abo** | **1** (at-least-once) | nein |
| `application/+/device/+/event/status` | Geräte-/Batteriestatus (informativ, **kein** Messwert-Pfad) | 1 | nein |
| `application/+/device/+/event/join` | Join-Accept (Geräte-Provisioning-Signal, **nicht** in v1 verarbeitet) | 1 | nein |

**Wichtige Beobachtung (Sicherheitsrelevanz, neu gegenüber Phase 1):** **die
DevEUI steht bereits im Topic-String** (`device/{devEUI}/event/up`) —
**unabhängig** vom Payload-Body. Konsequenzen:
- Der Worker **extrahiert die DevEUI nur aus einer kanonischen Quelle** — dem
  Payload-Body-Feld (`deviceInfo.devEui`, ChirpStack-JSON-Envelope), **nicht**
  zusätzlich aus dem Topic-String geparst und als zweite Variable gehalten
  (reduziert die Anzahl transienter Klartext-Kopien, Design-Prinzip 1).
  **TD-7 (Auflage, entschieden):** die in der Vorfassung angedeutete
  „Topic-vs-Payload-DevEUI-Konsistenzprüfung" wird **gestrichen**, nicht
  spezifiziert — eine solche Prüfung bräuchte **zwangsläufig** eine
  **zweite** transiente Klartext-Extraktion (aus dem Topic-String), die dem
  Design-Prinzip 1 (so wenige transiente Kopien wie möglich) direkt
  entgegenläuft, für einen **geringen** Sicherheitsgewinn: Topic **und**
  Payload stammen von **demselben** vertrauenswürdigen Upstream-System
  (ChirpStack) — ein Auseinanderlaufen wäre ein ChirpStack-interner Fehler,
  kein Angriffsvektor durch einen externen Absender. **v1 verlässt sich
  ausschließlich auf den Payload-Body** als einzige DevEUI-Quelle.
- **Broker-seitiges Logging** (Mosquitto `log_type`, insbesondere `subscribe`/
  `unsubscribe`/verbose Topic-Logs) kann Klartext-DevEUIs in
  Infrastruktur-Logs sichtbar machen, **außerhalb** der Worker-Kontrolle. Das
  ist ein **neuer TOM-Punkt** für Phase 3 (Mosquitto-Logging-Konfiguration:
  `log_type error warning notice` **ohne** Topic-Detail-Logging in einer
  produktiven Konfiguration; devops-lead/Phase 4) — **offener Punkt** §31.

**Subscribe-Modell:** **ein** Wildcard-Abo (`application/+/device/+/event/up`)
über eine **persistente Session** (`clean session = false`, fester
`clientId`, z. B. `edms-ingest-worker`) — Voraussetzung für die
Offline-Puffer-Garantie (§15).

**Verworfene Alternative:** pro Application/Device ein eigenes Abo
(dynamisch nachgeführt aus Stammdaten). *Contra:* Abo-Verwaltung müsste mit
`energy.zaehler`-Änderungen synchron gehalten werden — unnötige Kopplung, da
ChirpStack ohnehin alle Devices unter denselben Topic-Präfix publiziert;
Kanal-Zugehörigkeit wird **nach** Empfang über die O4-Korrelation aufgelöst
(§26), nicht über Topic-Filterung.

## 15. D3 — Reconnect, persistente Session, Offline-Puffer (M3)

**Anforderung (M3):** kein Datenverlust bei Broker-/Worker-Neustart, mit
`ux_messwert_kanal_ts`-Idempotenz zusammen effektiv **exactly-once** ins
Hypertable.

**Entscheidung:**
- **QoS 1** (nicht 0 — Verlustrisiko; nicht 2 — Vier-Wege-Handshake-Overhead
  ohne Zusatznutzen, da Idempotenz ohnehin auf Anwendungsebene sitzt).
- **Persistente Session** (`clean session = false`) + Mosquitto-
  **Persistenz aktiviert** (`persistence true`, `persistence_location` auf
  einem Volume) — damit queued Mosquitto **QoS-1-Nachrichten für den
  getrennten Worker-Client**, auch über einen Mosquitto-Neustart hinweg
  (Phase-4-Vorwirkung `deployment/docker/`, `devops-lead`).
- **Worker-seitiger Reconnect:** exponentielles Backoff (z. B. 1 s → 30 s
  Cap), automatische Re-Subscription **nicht nötig** bei `clean session =
  false` (Broker behält das Abo) — Client-Bibliothek muss das aber
  **explizit** unterstützen (Prüfpflicht bei Bibliothekswahl, §29).
- **Graceful Shutdown** (SIGTERM): Worker beendet die **aktuell laufende**
  Verarbeitung eines bereits empfangenen Uplinks (Commit oder sauberer
  Abbruch vor `ack`), **bevor** die MQTT-Verbindung geschlossen wird — kein
  `ack` ohne abgeschlossenen (committeten) Schreibpfad. Erst nach Ack der
  Broker-Nachricht gilt sie als "zugestellt"; ein Absturz **vor** Ack führt zu
  Re-Delivery beim nächsten Connect (at-least-once), **idempotent** durch
  `ON CONFLICT` (§24) abgefangen.

**Offener Punkt (§31):** Backpressure-Verhalten bei Burst-Zustellung nach
langer Worker-Downtime (viele gepufferte Uplinks auf einmal) — Batching/
Rate-Limiting am Worker vs. einfacher sequenzieller Abarbeitung; v1-Vorschlag:
**sequenziell, ein Uplink nach dem anderen**, da >= 50.000 Messwerte/s
(V0002-Sizing-Referenz) in v1 synthetic-only ohnehin nicht erreicht wird —
Performance-Tuning ist Phase 4 (`performance-engineer`).

## 16. D4 — Synthetischer Uplink-Publisher (v1)

**Entscheidung:** ein kleiner, **eigenständiger** Publisher-Prozess (selbes
Repo, z. B. `src/backend/src/ingest-worker/synthetic/` oder ein separates
Skript im Dev-Compose), der in konfigurierbarem Intervall (z. B. alle 15 min
je synthetischem Gerät, DSFA-0001-§1-Beispiel-Kadenz) **ChirpStack-Uplink-
JSON-Frames nachbildet** (Topic + Payload-Envelope, §14) und auf den
Dev-Mosquitto publiziert. Nutzt **Platzhalter-DevEUIs** (fixe, offensichtlich
synthetische Werte, z. B. `AA-AA-AA-AA-AA-AA-AA-0N`) und **synthetische**
kumulative Zählerstände (monoton wachsend, realistischer Verlauf für
Plausibilitäts-/Monotonie-Tests).

- **Guard:** der Publisher **teilt** den `SyntheticOnlyConfigService`-
  Mechanismus (§19) — startet **nicht**, wenn `EDMS_SYNTHETIC_ONLY=false`
  bzw. `EDMS_ENV_CLASS=prod` (Defense-in-Depth, auch wenn der Publisher
  ohnehin nie in ein Prod-Deployment-Manifest gehört).
- **Fixture-Versionierung:** das ChirpStack-Envelope-Format wird als
  **versionierte Fixture** gepflegt (Vertrauensanker-Prinzip, F3) — Änderungen
  an echten ChirpStack-Versionen erfordern eine bewusste Fixture-
  Aktualisierung, kein impliziter Drift.
- **Ergänzende Test-Ebene** (Phase-1 Alt. 5.2 C, weiterhin gültig): zusätzlich
  ein **In-Process-Test-Adapter**, der Uplinks direkt in die Ingest-Flow-
  Funktion (§20) injiziert, ohne Broker — für schnelle Unit-/Decoder-Tests
  (deckt **nicht** M3, ergänzt nur die Broker-Ebene).

## 17. D5 — MQTT-TLS & Credentials (A3, DS-10/TR-02102) — **SEC-2, Blocker vor Phase 4, gelöst**

**Entscheidung:**
- Mosquitto-Listener **ausschließlich TLS** (Port 8883), **kein**
  Klartext-Listener in einer produktionsnahen Konfiguration (Dev darf zur
  lokalen Fehlersuche einen zusätzlichen Klartext-Listener auf `localhost`
  haben — Trennung dev/prod-Profil, `devops-lead`).
- **TLS 1.3 exklusiv in produktionsnahen Profilen** (`tls_version tlsv1.3`,
  SEC-2-Auflage `security-lead`) — **TLS 1.2 nur als befristete, begründete
  Kompatibilitätsausnahme** mit expliziter `security-lead`-Einzelfreigabe
  (z. B. Altgerät ohne TLS-1.3-Stack), dokumentiert im jeweiligen
  Freigabeartefakt. **Cipher-Suite-Whitelist (TLS 1.3, abschließend):**
  `TLS_AES_128_GCM_SHA256`, `TLS_AES_256_GCM_SHA384`,
  `TLS_CHACHA20_POLY1305_SHA256` — keine weiteren Suiten in einem
  produktionsnahen Profil.
- **mTLS Worker↔Broker im produktiven Pfad** (SEC-2): der Worker
  authentisiert sich mit einem **kurzlebigen Client-Zertifikat**
  (Gültigkeit **≤ 90 Tage**, Rotation vor Ablauf — Mechanismus/Owner Phase 4,
  `devops-lead`/`security-lead`). **Username/Passwort-über-TLS ist
  ausschließlich ein synthetic-only-Dev-Fallback** (Dev-Compose, `EDMS_
  INGEST_BROKER_MODE=synthetic`, §19) — im produktiven (`real`-)Pfad
  **nicht** zulässig. Credentials/Zertifikate **nie** im Code, **nie** im
  Repo, **nie** in Logs (auch nicht bei Verbindungsfehlern —
  `problem`-artige Fehlermeldungen ohne Credential-/Zertifikatswert).
  ~~Ablage **ausschließlich** in ENV/Secrets.~~ → **Fortgeschrieben durch
  §34 (2026-09-08):** Ablage zusätzlich **feldverschlüsselt in
  `ingest.quelle`** zulässig. Die drei „nie" oben bleiben unverändert
  gültig — sie sind der eigentliche Schutzzweck, die ENV-Bindung war nur
  ein Mittel dazu.
- **Broker-ACL** (Mosquitto `acl_file` oder Plugin): der Worker-Client-Account
  darf **nur subscriben** (`application/+/device/+/event/#`), **nie
  publizieren** außer ggf. auf einen eigenen Status-/Heartbeat-Topic
  (Least-Privilege am Broker, spiegelt die DB-Least-Privilege-Idee, §26.4).
  Der synthetische Publisher hat einen **separaten** Broker-Account mit
  **nur Publish**-Recht auf denselben Uplink-Topic-Präfix.

**Damit gelöst (vormals „Offener Punkt"):** Zertifikatsverwaltung/-Rotation
für den produktiven Broker ist **entschieden** (mTLS, ≤ 90 Tage,
Username/Passwort nur Dev-Fallback). **Restpunkt:** der konkrete
Rotations-*Mechanismus* (automatisiertes Reissue vs. manueller Prozess)
bleibt Phase-4-Umsetzungsdetail (`devops-lead`/`security-lead`, §31 —
**Auflage, kein Blocker**), gebunden an den Real-Ingest-Gate-Umschaltpunkt
(A2, §19).

> **Fortschreibung 2026-09-08 (§34):** Der Ablage-Ort der Zugangsdaten hat
> sich geändert (ENV → zusätzlich feldverschlüsselte Datenbank). Die
> **Überwachung** des Zertifikats-Ablaufs ist seitdem im Produkt umgesetzt
> (`gueltig_bis` je Zertifikat, Warnung in der Betriebssicht); der
> **Rotations-Mechanismus** bleibt der oben genannte offene Restpunkt.

## 18. D6 — Worker-Prozess-Architektur (F6): Bootstrap & Deployment

**Entscheidung:** NestJS-**Standalone-Application-Context**
(`NestFactory.createApplicationContext(IngestWorkerModule)`), **kein**
HTTP-Adapter, **kein** Controller/Guard/Interceptor-HTTP-Pipeline. Eigener
Bootstrap-Entrypoint (Vorschlag: `src/backend/src/ingest-worker/main-worker.ts`),
**selbes Repo/Image** wie die API (F6, „kein neues Drittsystem außer dem
Broker"); Prozess-Rolle über ein Env-Flag ausgewählt (z. B.
`EDMS_PROCESS_ROLE=api|ingest-worker`, vom Container-Entrypoint-Skript in
`Dockerfile*` ausgewertet, Phase 4).

**Modul-Grobschnitt (Vorschlag, Phase-4-Feinschnitt):**

| Verzeichnis (Vorschlag) | Inhalt |
|---|---|
| `ingest-worker/main-worker.ts` | Bootstrap, Startup-Self-Check zuerst (§19) |
| `ingest-worker/mqtt/` | MQTT-Client-Adapter (Subscribe, Reconnect, TLS) |
| `ingest-worker/decoder/` | Decoder-Registry (§23) |
| `ingest-worker/korrelation/` | O4-Blind-Index-Lookup (§26) |
| `ingest-worker/schreibpfad/` | Idempotenter Upsert-Repository (§24) |
| `ingest-worker/quarantaene/` | Dead-Letter-Schreibpfad (§25) |
| `ingest-worker/luecken/` | ruft `EnergyMonitoringRepository`-Erweiterung (§27) |

**Wiederverwendung vs. Refactoring-Bedarf (offener Punkt, §31):**
`FieldCipherService`/`KeyManagementPort`/`LocalDevKmsAdapter` liegen aktuell
unter `src/backend/src/stammdaten/crypto/` — fachlich unabhängig von
„Stammdaten" (reine Krypto-Primitive). **Empfehlung:** vor Worker-Import
extrahieren nach `src/backend/src/common/crypto/` (oder `crypto/` auf
Top-Level), damit der Worker nicht aus einem Domänen-Modul importiert, das
konzeptionell Personen-PII gehört. Kleiner, risikoarmer Refactor —
Entscheidung `backend-lead`, Phase 4.

**Deployment-Skizze (Phase-4-Vorwirkung, `devops-lead`):** zwei Kubernetes-
Workloads aus **einem** Image (`Deployment` für API, **eigenständiges**
`Deployment` mit `replicas: 1` initial für den Worker — Skalierung/Sharding
über mehrere Worker-Instanzen ist Phase-4-Performance-Thema, da MQTT-
Subscription mit einer Client-ID nicht trivial parallelisierbar ist, ohne
Nachrichten aufzuteilen).

## 19. D7 — A2: Fail-closed Synthetic-only im Worker-Bootstrap (wichtigste Einzelkontrolle)

**Anforderung (A2, aus dem Arbeitsauftrag; analog ADR-0008 §22/D10).** Der
Worker **muss** denselben fail-closed-Selbstcheck durchlaufen wie die API,
**bevor** er MQTT- oder DB-Verbindung öffnet, plus einen **worker-
spezifischen** Broker-Umschaltpunkt-Schutz.

**Entscheidung:**
1. **Wiederverwendung** von `SyntheticOnlyConfigService` (`EDMS_ENV_CLASS`/
   `EDMS_SYNTHETIC_ONLY`, Default `true`, fail-closed bei `prod` +
   `synthetic-only=true`-Widerspruch bzw. bei `synthetic-only=false` ohne
   Prod-Adapter) — **als allererste Instanziierung** im Worker-Bootstrap,
   **vor** `mqttClient.connect()` und **vor** dem DB-Connection-Pool-Aufbau.
2. **Neuer, worker-spezifischer Gate-Marker:** `EDMS_INGEST_BROKER_MODE`
   (Vorschlag, Werte `synthetic|real`, Default `synthetic`) — steuert, **ob**
   der Worker sich mit den **synthetischen** Dev-Broker-Credentials/Topics
   oder mit **realen** Broker-Credentials verbindet. Analog zu §22 (ADR-0008)
   gilt: `EDMS_INGEST_BROKER_MODE=real` **erfordert zwingend** (fail-closed
   bei Fehlen) eine **Pflicht-Referenz auf ein `compliance-director`-
   Freigabeartefakt** (Konfigurationswert, z. B. `EDMS_GATE_FREIGABE_REF`,
   geprüft gegen einen dokumentierten Freigabe-Katalog — konkreter Mechanismus
   ist ein **Folgeauftrag** an `devops-lead`, wie bereits für ADR-0008 offener
   Punkt C3 vermerkt). **In diesem Codestand ist `real` NICHT unterstützt**
   (kein Freigabe-Katalog gebunden) — Fehlstart, analog zu
   `EDMS_SYNTHETIC_ONLY=false` in ADR-0008 §22.

   **TD-6 (Auflage) — 2×2-Validitätsmatrix im Bootstrap-Selbstcheck:**

   | `EDMS_INGEST_BROKER_MODE` | `EDMS_SYNTHETIC_ONLY=true` | `EDMS_SYNTHETIC_ONLY=false` |
   |---|---|---|
   | `synthetic` | **gültig** (v1-Standard) | **fail-closed** (Widerspruch: synthetischer Broker-Modus, aber Synthetic-only-Garantie deaktiviert) |
   | `real` | **fail-closed** (Widerspruch: realer Broker-Modus ohne deaktivierte Synthetic-only-Garantie — Kombination `real`+`synthetic_only=true` ist **immer** ein Konfigurationsfehler) | **einzig gültige Real-Kombination** — **zusätzlich** an das Freigabeartefakt (`EDMS_GATE_FREIGABE_REF`) gebunden, in diesem Codestand ohnehin nicht unterstützt |

   Beide „gültig"-Zellen sind fail-closed geprüft (Selbstcheck wirft bei
   jeder anderen Kombination); `real`+`synthetic_only=true` wird **nicht**
   stillschweigend als „real gewinnt" oder „synthetic_only gewinnt"
   aufgelöst, sondern **explizit abgelehnt**.

3. **`kontext.synthetic=true` als Pflicht-Tag** auf jedem vom Worker erzeugten
   Provisioning-/Auflösungs-Audit-Ereignis (§26.6) — spiegelt
   `SyntheticOnlyInterceptor`s Verhalten, aber **im Worker-Kontext ohne HTTP-
   Request**: der Worker setzt das Tag direkt im übergebenen Audit-Kontext-
   Objekt (kein Interceptor nötig, da kein HTTP-Pfad).
4. **CI-PII-Guard auf Worker-Fixtures** (aus dem Arbeitsauftrag explizit
   gefordert): derselbe PII-/Secret-Scan-Hook (`dsgvo-auditor`/CI), der
   bereits auf Stammdaten-Seeds/Fixtures läuft, wird um die
   **Worker-Fixtures** (synthetische Uplink-Envelopes, Decoder-Testdaten,
   Quarantäne-Fixtures) erweitert — **blockierend**, nicht optional (M7).

**Verworfene Alternative:** ein einziges gemeinsames Flag ohne
worker-spezifischen Broker-Marker. *Contra:* der Umschaltpunkt „reale
Broker-Credentials/Topics" (Gate-Bedingung 6, ADR-Abschnitt 0) ist **eine
andere Handlung** als „reale PII-Schreibpfade freischalten" (ADR-0008) —
beide sollten **unabhängig** gate-pflichtig bleiben, damit ein versehentliches
Freischalten des einen nicht implizit das andere freischaltet.

## 20. D8 — Ingest-Flow (Sequenz)

**Schrittfolge je empfangenem Uplink (subscribe → decode → validate →
korrelieren → upsert, Arbeitsauftrag-Reihenfolge, mit Korrektur zur
tatsächlich nötigen technischen Reihenfolge unten begründet):**

1. **Empfang** (MQTT-Callback): rohe Payload-Bytes + Topic-String.
2. **Envelope-Parse** (JSON): `deviceInfo.devEui` (Klartext, **transient**),
   `fPort`, `data` (base64 Nutzdaten), `time`/`rxInfo[].time`
   (Geräte-/Gateway-/Server-Zeitstempel, s. u.), `fCnt`. **SEC-1 (Blocker,
   gelöst):** **kann der Envelope nicht strukturiert geparst werden**
   (kaputtes JSON, fehlendes Pflichtfeld `deviceInfo.devEui` vor jeder
   Extraktion), **dann existiert keine geparste DevEUI, die redigiert
   werden könnte** — die feldbasierte Redaction (§25) setzt ein
   **gültiges** JSON-Objekt voraus. Für diesen Fall gilt eine **eigene,
   strengere** Dead-Letter-Regel (§25, Reason-Code `envelope_parse_fehler`):
   **keine** Rohpayload-Persistierung, **nur** Länge (Byte-Count), ein
   **Hash der Rohbytes** (z. B. SHA-256, für Wiedererkennung derselben
   fehlerhaften Quelle **ohne** Payload-Inhalt) und der Empfangs-Zeitstempel.
3. **DevEUI normalisieren + Blind-Index berechnen** (§26.3) — **sofort**,
   noch **vor** jeder Datenbankinteraktion. Die transiente DevEUI-Variable hat
   **keine** weitere Referenz nach diesem Schritt (kein Log, kein Re-Use).
4. **Korrelation** (§26): Blind-Index → `device.geraet_zuordnung` → aktive
   Zeile → `zaehler_id`. **Kein Treffer → Dead-Letter** (`devEUI_unbekannt`,
   §25), Verarbeitung dieses Uplinks endet hier (kein Absturz des Workers).
5. **Gerätetyp auflösen:** `zaehler_id` → `energy.zaehler.geraetetyp`
   (bestehende, nicht-PII Stammdaten-Abfrage, kein Namensraum-Bruch).
6. **Decode** (§23): Decoder-Registry nach `geraetetyp` → normierte
   Messwert(e) `{messgroesse, wertRoh, einheit, art, deviceTimestamp?}`.
   **Kein registrierter Decoder → Dead-Letter** (`unbekannter_geraetetyp`).
   **Decode-Exception → Dead-Letter** (`decode_fehler`, Try/Catch **pro
   Uplink**, Worker läuft weiter).
7. **Kanal-Auflösung** (S3c, nicht-PII): `(zaehler_id, messgroesse,
   obis_kennzahl)` → `energy.messkanal.kanal_key` (nutzt die bestehende
   `UNIQUE(zaehler_id, messgroesse, obis_kennzahl)`, V0002). **Kein Treffer
   → Dead-Letter** (`kanal_unbekannt`).
8. **Plausibilität** (§23): Monotonie (bei `art='kumulativ_zaehlerstand'`),
   Einheiten-Konsistenz (`einheit` decodiert == `energy.messkanal.einheit`),
   Wertebereich. **Verstoß → Dead-Letter** (jeweiliger Reason-Code) **+**
   Alert-Signal (nicht nur Log — spiegelt die S3a-„nicht nur Logging"-Norm).
9. **Zeitstempel-Wahl (TD-2, Blocker, gelöst — KEIN Per-Uplink-Runtime-
   Fallback):** `zeitstempelQuelle` ist **statisch je Decoder-Eintrag**
   (§23-Vertrag, `'geraet'|'gateway_server'`), **nicht** je Uplink zur
   Laufzeit gewählt. Deklariert ein Decoder `zeitstempelQuelle='geraet'`,
   **muss** jeder von ihm decodierte Uplink einen gültigen
   Geräte-Zeitstempel liefern — **fehlt** dieser oder ist er
   **implausibel** (z. B. außerhalb eines plausiblen Fensters um die
   Empfangszeit), ist das **kein stiller Fallback auf Serverzeit**, sondern
   **Dead-Letter** (§25, Reason-Code `zeitstempel_fehlt`). **Begründung:**
   ein Uplink desselben `messkanal_key`, der abwechselnd mit Geräte- und mit
   Serverzeit geschrieben würde, kann **zwei unterschiedliche `ts`-Werte**
   für denselben logischen Messzeitpunkt erzeugen — das bricht die
   Idempotenz (`(messkanal_key, ts)` erzeugt dann **Doppelzeilen** statt
   eines Konflikts). `zeitstempelQuelle='gateway_server'`-Decoder nutzen
   **immer** `rxInfo[].time`/`time`, ohne Ausnahme. Immer **UTC**
   end-to-end (`Z`-Suffix).
10. **Idempotenter Upsert** (§24): `qualitaet=gemessen`, `herkunft=
    ingest_live` (Default für den Live-MQTT-Pfad), `ON CONFLICT (messkanal_
    key, ts) DO UPDATE ... WHERE <Vorrang-Bedingung>`.
11. **`ingest.kanal_status`-Upsert** (§27, **TS-3, Blocker, gelöst**):
    `letzter_ts`/`updated_at` für den betroffenen `messkanal_key` —
    **zwingend mit `GREATEST`-Semantik**
    (`letzter_ts = GREATEST(EXCLUDED.letzter_ts, ingest.kanal_status.
    letzter_ts)`), **nie** ein bedingungsloses Überschreiben: da Backfill
    (§21) **denselben** Ingest-Flow inkl. dieses Schritts durchläuft, würde
    ein bedingungsloser Upsert bei einem **späten** Backfill-Lauf (alter
    `ts`, aber neu verarbeitet) das TB-04-Freshness-Signal **rückwärts
    drehen**. `GREATEST` garantiert, dass `letzter_ts` **monoton** bleibt,
    unabhängig von der Verarbeitungsreihenfolge.
12. **Broker-Ack** (nur nach erfolgreichem Commit von 10+11, s. §15).

**Begründung zur Reihenfolge relativ zum Arbeitsauftrag:** „korrelieren" muss
technisch **vor** „decode" laufen (Schritt 4/5 vor 6), weil der Decoder erst
über den aufgelösten `geraetetyp` gewählt werden kann — der Arbeitsauftrags-
Wortlaut „subscribe → decode → validate → korrelieren → upsert" ist die
**fachliche Grobreihenfolge** (Validierung ist ohnehin über mehrere Schritte
verteilt: Envelope-Validierung vor Korrelation, Plausibilität nach Decode);
technisch löst sich das wie oben dargestellt auf — **zur Bestätigung im
Review** (§31).

## 21. D9 — Backfill-Modus, Graceful Shutdown, At-least-once

**Backfill-Modus (Entscheidung):** **keine separate Decode-/Validierungs-
Logik.** Ein Backfill-Lauf (CLI-getriggert, z. B. `main-worker.ts --backfill
--quelle=<Datei/Batch>`) ruft **dieselbe** Ingest-Flow-Funktion (§20, Schritte
2–11) auf — Code-Wiederverwendung garantiert deterministisches, reihenfolge-
invariantes Verhalten (M2). Einziger Unterschied: `herkunft=backfill` statt
`ingest_live`.

**Abgrenzung `ingest_live` vs. `backfill` (Klärungsbedarf, zur Bestätigung
`database-lead`/`technical-director`, §31):** **Vorschlag:** `herkunft`
kodiert den **Zustellungs-Pfad**, nicht das Alter des Werts. Ein
**verspäteter** Uplink, der ganz normal über die **live MQTT-Subscription**
eintrifft (z. B. weil ein Zähler offline gepuffert und beim Reconnect alle
gestauten Uplinks nachliefert), bleibt `herkunft=ingest_live` — das ist die
**gewöhnliche** Backfill-Fähigkeit des MQTT-Pfads (M3). `herkunft=backfill`
ist reserviert für einen **expliziten, separat ausgelösten** Batch-
Nachlade-Vorgang (z. B. Operator lädt eine historische Export-Datei nach
einem längeren Ausfall) — ein bewusst getrennter, protokollierter Vorgang,
**kein** MQTT-Live-Fluss.

**Graceful Shutdown / At-least-once:** s. §15. Zusammenfassend: QoS 1 +
persistente Session + Ack-nach-Commit + `ON CONFLICT`-Idempotenz ergibt
**effektiv exactly-once** ins Hypertable (M1 ∧ M3).

## 22. D10 — Log-Redaction & CI-PII-Guard für den Worker

**Entscheidung:**
- **pino-redact-Konfiguration** des Workers **verbietet** explizit jedes
  Feld, das eine DevEUI oder einen rohen Messwert enthalten könnte
  (Whitelist-Ansatz wie in der API, backend-nestjs.md „Logger-Serializer mit
  Feld-Whitelist"). Log-Zeilen zu einem Uplink enthalten **ausschließlich**:
  `messkanal_key` (Pseudonym-Surrogat), `zaehler_id` (Pseudonym-UUID),
  Dead-Letter-`grund`-Code, Zeitstempel, **niemals** `wert` oder DevEUI
  (weder Klartext noch Blind-Index — Blind-Index ist zwar kein Klartext, aber
  ein **deterministisches Korrelat**, das bei Log-Leak dieselbe
  Re-Identifikations-Gefahr wie ein Pseudonym-Schlüssel hätte; Vorsichtsprinzip:
  auch der Blind-Index bleibt außerhalb normaler Logs, nur in
  Fehler-/Metrik-Pfaden mit eingeschränktem Zugriff, s. §25).
- **CI-PII-Guard** (bestehender Hook, `.claude/hooks/`) wird um Worker-
  Fixture-Pfade erweitert (§19 Punkt 4) — **blockierend** bei Fund einer
  realistisch aussehenden DevEUI (Regex-Heuristik z. B. echtes
  EUI-64-Format ohne offensichtlichen Platzhalter-Marker) oder eines
  Klartext-Zählerstands außerhalb der als synthetisch gekennzeichneten
  Fixture-Struktur.
- **SEC-7 (Auflage, Ops-Runbook-Punkt):** MQTT-Client-Debug-Logging (z. B.
  die `DEBUG`-Umgebungsvariable des `mqtt`/`debug`-npm-Pakets) ist in
  produktionsnahen Profilen **deaktiviert** — Debug-Logs eines MQTT-Clients
  können rohe Topic-/Payload-Fragmente ausgeben und damit die
  Log-Redaction (oben) umgehen. Owner: `devops-lead` (Ops-Runbook, Phase 4).

## 23. D11 — Decoder-Registry (F3)

**Entscheidung:** versionierte, **code-basierte** Registry (TypeScript,
`Map<Geraetetyp, GeraetetypDecoder>`), **kein** DB-konfigurierbares
Decoder-Mapping in v1 — konsistent mit der Phase-1-Begründung „Vertrauens-
anker, Herkunft im Git nachweisbar" (F3).

**Vertrag (Signatur-Skizze, kein Code):**

```
interface GeraetetypDecoder {
  geraetetyp: string          // = energy.zaehler.geraetetyp
  version: number             // Krypto-/Deploy-Agilitäts-Muster (vgl. alg_version)
  zeitstempelQuelle: 'geraet' | 'gateway_server'
  decode(rohframe: { data: Buffer; fPort: number }): DecodedMesswert[]
}

interface DecodedMesswert {
  messgroesse: string          // energy.messkanal.messgroesse
  obisKennzahl?: string        // nur Strom, sonst undefined
  wertRoh: number
  einheit: string              // MUSS gegen energy.messkanal.einheit geprüft werden (Schritt 8)
  art: 'kumulativ_zaehlerstand' | 'intervall_verbrauch'
  deviceTimestampIso?: string  // nur wenn zeitstempelQuelle='geraet'
}
```

**TD-2 (Blocker, gelöst) — `zeitstempelQuelle` ist ein STATISCHES
Decoder-Attribut, kein Per-Uplink-Parameter.** Ein Decoder-Eintrag
deklariert genau **eine** Zeitstempel-Quelle für **alle** von ihm
decodierten Uplinks (`deviceTimestampIso` **nicht** als optionaler
Laufzeit-Fallback-Trigger missverstehen — bei `zeitstempelQuelle='geraet'`
ist `deviceTimestampIso` **Pflicht**; fehlt es oder ist es implausibel, ist
das **Dead-Letter** `zeitstempel_fehlt`, §20 Schritt 9/§25 — **nicht** ein
stiller Wechsel auf `gateway_server`-Zeit).

- **v1 = ein synthetischer Referenz-Gerätetyp** (`geraetetyp = 'synthetisch-
  referenz-v1'`, F3). **Vereinfachung (neu, Design-Entscheidung):** die
  Payload dieses Referenztyps ist **JSON** (kein Bit-gepacktes Binärformat) —
  spart eine zusätzliche Codec-Bibliothek für v1; echte Hardware-Gerätetypen
  brauchen später eigene Binär-Decoder (kein v1-Blocker, additive Registry).
- **Unbekannter Gerätetyp / Decode-Fehler:** **niemals** eine unbehandelte
  Exception den Worker crashen lassen — pro-Uplink Try/Catch, Ergebnis
  **immer** Dead-Letter mit Reason-Code (§25), **nie** stiller Datenverlust
  (jeder verworfene Uplink hinterlässt eine Quarantäne-Zeile + Zähler für den
  Orphan-Check).
- **Nicht v1, aber angemerkter Nice-to-have (offener Punkt §31):** eine
  `decoder_version`-Spalte auf `measurement.messwert` für volle
  Reproduzierbarkeit („mit welcher Decoder-Version wurde dieser Wert
  erzeugt") — aktuell nicht in V0002, optionale spätere Migration.

## 24. D12 — Idempotenter Schreibpfad (F4): Vorrang-Regel & Korrekturhistorie

**Bestätigung:** `qualitaet` (0=gemessen,1=geschätzt,2=korrigiert,
3=ersatzwert) und `herkunft` (0=ingest_live,1=backfill,2=manuell,
3=import_altsystem) **existieren bereits** in V0002 — **keine
Schema-Ergänzung nötig.** Dieser Abschnitt definiert die **Semantik/
Rang-Ordnung**, die V0002 bewusst offengelassen hat.

**D1 (TD-1, User-Entscheidung) — `herkunft` als Sekundär-Tiebreak.** Die
ursprüngliche Rang-Ordnung nutzte **nur** `qualitaet` — bei **Gleichstand**
im `qualitaet`-Rang griff dann implizit „erster Wert gewinnt"
(first-writer-abhängig), was **M2 „bitgleich inkl. `herkunft`"** (§3)
verletzt: zwei unterschiedliche Ankunftsreihenfolgen konnten bei gleichem
`qualitaet`-Rang, aber unterschiedlichem `herkunft`, zu unterschiedlichen
Endzuständen führen. **Entscheidung: `rang()` wird composite über
`(qualitaet, herkunft)`** — `qualitaet` bleibt die **primäre**, `herkunft`
die **sekundäre** Sortierachse (greift **nur** bei `qualitaet`-Gleichstand).

**Rang-Ordnung `qualitaet` (Vertrauens-Tiers, primäre Achse, höchster Rang
gewinnt einen Konflikt):**

| Rang | `qualitaet` (Rohcode, V0002) | Bedeutung |
|---|---|---|
| 3 (höchster) | `korrigiert` (Rohcode **2**) | explizite, absichtliche Korrektur eines vorherigen Werts |
| 2 | `gemessen` (Rohcode **0**) | real vom Gerät gemessener Wert (Ingest-Live-Default) |
| 1 | `geschätzt` (Rohcode **1**) | Lücken-Schätzwert (z. B. Interpolation, künftiger Baseline-Bezug) |
| 0 (niedrigster) | `ersatzwert` (Rohcode **3**) | Platzhalter/Ersatzwert (niedrigstes Vertrauen) |

> ⚠️ **Leser-Falle (TS-1/TD-5, explizit zu vermerken):** die Rang-Ordnung ist
> eine **nicht-monotone Umkehrung** der V0002-Rohcodes — Rohcode **3**
> (`ersatzwert`, der **höchste** Rohcode-Zahlenwert) hat den **niedrigsten**
> Rang (0)! Ein naiver Vergleich `WHERE EXCLUDED.qualitaet >
> messwert.qualitaet` (direkter Rohcode-Vergleich statt `rang()`) wäre
> **exakt falsch herum** — `ersatzwert` würde dann **immer** gewinnen.
> **Verbindliche Regel:** Anwendungscode **vergleicht `qualitaet`/`herkunft`
> niemals direkt** (keine Literal-/Zahlenvergleiche) — **jede** Rang-Logik
> läuft **ausschließlich** über die kanonische `rang()`-Funktion (s. u.).
> **Code-Review-Guard:** ein Lint-/Review-Hinweis („kein direkter
> `qualitaet`/`herkunft`-Vergleich außerhalb von `rang()`") ist Teil der
> Phase-4-Umsetzung.

**Rang-Ordnung `herkunft` (sekundäre Achse, Tiebreak, D1):**

| Rang | `herkunft` (Rohcode, V0002) | Begründung |
|---|---|---|
| 3 (höchster) | `manuell` (Rohcode **2**) | menschlich erfasst/geprüft — höchstes prozedurales Vertrauen bei Gleichstand |
| 2 | `ingest_live` (Rohcode **0**) | direkte, automatisierte Live-Messung — der Normalfall |
| 1 | `backfill` (Rohcode **1**) | dieselbe automatisierte Quelle wie `ingest_live`, nur verspätet zugestellt — bei echtem Gleichstand tritt **live vor backfill** (explizite User-Vorgabe D1) |
| 0 (niedrigster) | `import_altsystem` (Rohcode **3**) | migrierte Altdaten unbekannter/externer Qualitätssicherung — niedrigstes prozedurales Vertrauen bei Gleichstand |

**Kanonische Rang-Funktion (Skizze, KEIN Code/Migration in diesem
Paket — TS-1/TD-5: EINE Funktion, nicht in Worker + SQL dupliziert):**

```
-- Vorschlag Phase 4 (measurement.rang, IMMUTABLE, ein einziger Ort):
CREATE FUNCTION measurement.rang(p_qualitaet smallint, p_herkunft smallint)
RETURNS smallint IMMUTABLE LANGUAGE sql AS $$
  SELECT
    (CASE p_qualitaet WHEN 2 THEN 3 WHEN 0 THEN 2 WHEN 1 THEN 1 WHEN 3 THEN 0 END) * 10
    + (CASE p_herkunft  WHEN 2 THEN 3 WHEN 0 THEN 2 WHEN 1 THEN 1 WHEN 3 THEN 0 END)
$$;
```

Der Faktor `* 10` garantiert, dass `qualitaet` **immer** dominiert
(`herkunft`-Rang ∈ {0..3} kann den `qualitaet`-Rang-Abstand nie
überschreiten) — `herkunft` entscheidet **ausschließlich** bei
`qualitaet`-Gleichstand. **Diese Funktion wird EINMAL in SQL definiert und
sowohl vom Upsert-Statement als auch von jedem Anwendungscode (z. B. Tests)
über denselben DB-Aufruf konsultiert** — **keine** zweite, potenziell
abweichende TypeScript-Reimplementierung der Rang-Tabelle
(TS-1/TD-5-Kernforderung).

**Upsert-Bedingung (atomar, ein SQL-Statement, keine Read-Modify-Write-
Race):**

```
INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft, erfasst_at)
VALUES (...)
ON CONFLICT (messkanal_key, ts) DO UPDATE SET
  wert = EXCLUDED.wert, qualitaet = EXCLUDED.qualitaet,
  herkunft = EXCLUDED.herkunft, erfasst_at = EXCLUDED.erfasst_at
WHERE measurement.rang(EXCLUDED.qualitaet, EXCLUDED.herkunft)
    > measurement.rang(messwert.qualitaet, messwert.herkunft)
```

- **Reihenfolge-invariant, jetzt inkl. `herkunft`-Achse** (M2, D1): Postgres
  wertet die `WHERE`-Bedingung **gegen den zum Statement-Zeitpunkt aktuellen
  Zeilenzustand** aus — das Ergebnis hängt **nicht** von der
  Ankunftsreihenfolge ab, sondern **ausschließlich** vom finalen,
  **composite** Rang-Vergleich (Compare-and-Swap-Semantik). Die Zeitreihe
  ist damit **bitgleich**, unabhängig davon, ob z. B. ein `backfill`-Wert vor
  oder nach einem gleichrangigen `ingest_live`-Wert eintrifft — `ingest_live`
  gewinnt **immer**, unabhängig von der Ankunftsreihenfolge (D1).
- **Gleicher composite Rang, abweichender Wert → bewusster No-Op** (erster
  Wert dieses Rangs gewinnt). Das ist **beabsichtigt**: eine echte Korrektur
  **muss** explizit mit `qualitaet=korrigiert` (höherer Rang) eingereicht
  werden — ein gleichrangiger „stiller" Overwrite wäre genau das vom
  `iot`-Regelwerk verbotene „unbeabsichtigte Overwrite korrekter Werte".
- **Pflicht-Testmatrix (TS-1/TD-5):** alle **4×4** `qualitaet`-Kombinationen
  (Alt-Rang trifft Neu-Rang) **und**, bei `qualitaet`-Gleichstand, alle
  **4×4** `herkunft`-Kombinationen (16 zusätzliche Zellen, D1) — insgesamt
  **32 automatisierte Testfälle** (Testcontainer-PG16+Timescale-`oss`),
  Pflichtbestandteil vor Phase-4-Merge.
- **Anomalie-Signal** (kein Rohwert-Log!): weicht ein gleichrangiger,
  abgelehnter Wert **numerisch** vom bestehenden ab, wird **nur** ein
  Boolean-Anomalie-Flag pseudonym geloggt/gezählt
  (`messkanal_key`, `ts`, `anomalie=true`) — **nie** die konkreten
  Werte selbst (Design-Prinzip „keine Rohwerte in Logs").

**D2 (User-Entscheidung) — Korrekturhistorie WIRD JETZT angelegt (nicht
verschoben).** Die Rang-Regel oben deckt **erstmalige** Korrekturen ab
(`korrigiert` überschreibt `gemessen`/`geschätzt`/`ersatzwert`), löst aber
**nicht** den Fall einer **Korrektur der Korrektur** (kein höherer Rang als
3 verfügbar) — dieser Fall (samt „Re-Korrektur"-Tiebreak) **bleibt
Out-of-Scope v1**, gebunden an den noch nicht existierenden manuellen
Korrektur-Workflow (§4.2). **Der append-only-Vertrag selbst wird jedoch
bereits im ersten Migrations-Batch angelegt** (nicht als spätere
Nachtrags-Migration verschoben) — Begründung: DE-03/Art. 5(2) verlangt,
dass der Korrekturhistorien-Mechanismus **existiert, bevor** je eine reale
Korrektur möglich ist, nicht erst nachträglich draufgesetzt.

- **Design: Option A (Trigger-basiert)** — jetzt **verbindlich** statt
  offener Punkt.
- **Tabelle `measurement.messwert_korrektur_log`** — **normale Tabelle,
  KEIN Hypertable** (v1; Korrektur-Volumen ist v1 gering, kein
  Zeitreihen-Sizing-Bedarf). Standard-PK-Konvention
  (`database-migrations.md`): `id uuid PRIMARY KEY` (**UUIDv7**,
  app-seitig — **nicht** die `audit.event`-PK-Ausnahme kopieren, die eine
  andere, ADR-0003-spezifische Begründung hat).
- **Trigger:** `AFTER UPDATE ON measurement.messwert FOR EACH ROW ...` —
  Postgres feuert `AFTER UPDATE`-Trigger nur bei tatsächlich ausgeführten
  Updates; ein durch die `WHERE`-Bedingung verhinderter (No-Op-)Upsert
  löst **keinen** Trigger-Fire aus — kein Zusatz-Guard nötig.
- **Index:** `(messkanal_key, ts)` (Zugriffspfad „Korrekturhistorie eines
  Messwerts").
- **`REVOKE UPDATE, DELETE FROM PUBLIC`** auf `measurement.
  messwert_korrektur_log` — append-only erzwungen, analog dem
  `audit`-Schema-Muster (`database-migrations.md`), **obwohl** diese
  Tabelle nicht im Schema `audit` liegt (Namensraum bleibt `measurement`,
  s. §28 für die Abgrenzung zum separaten `ingest`-Namensraum).
- **Spaltenschnitt (Skizze):** `id, messkanal_key, ts, alte_qualitaet,
  alter_rang, neue_qualitaet, neuer_rang, alte_herkunft, neue_herkunft,
  korrigiert_at` — **keine** `wert`-Spalten (alt/neu) in dieser Tabelle, um
  dem „keine Rohwerte außerhalb des eigentlichen Messwertpfads
  duplizieren"-Vorsichtsprinzip zu folgen; Nachweis **DASS und WANN**
  korrigiert wurde, nicht **um welchen Betrag** — Feinschnitt final
  `database-lead` (§31).

## 25. D13 — Orphan-Check & Kanal-Validierung (S3a/S3c einlösen)

**S3c (Kanal-Validierung vor Insert):** bereits strukturell in der
Ingest-Flow-Sequenz enthalten (§20, Schritt 7) — kein Insert ohne aufgelösten
`kanal_key`.

**S3a (täglicher Orphan-Check-Job mit Alerting) + Dead-Letter/Quarantäne
(neu, Antwort auf „Umgang mit unbekanntem Gerätetyp/Decode-Fehler"):**

**Entscheidung:** neuer Namensraum **`ingest`** (Worker-Betriebs-/
Fehlerpfad-Bookhaltung, getrennt von `measurement`/`device`, §28) mit einer
Quarantäne-Tabelle. **Jeder** in §20 beschriebene Ablehnungsfall (Schritte
4/6/7/8) schreibt **eine Zeile**, **nie** eine stille Verwerfung:

| Reason-Code | Ursprung (Schritt) |
|---|---|
| `envelope_parse_fehler` | 2 — Envelope nicht strukturiert parsebar (**SEC-1**, s. u. — Sonderfall) |
| `devEUI_unbekannt` | 4 — Blind-Index-Lookup ohne Treffer |
| `unbekannter_geraetetyp` | 6 — kein Decoder registriert |
| `decode_fehler` | 6 — Decoder-Exception |
| `kanal_unbekannt` | 7 — `(zaehler_id, messgroesse, obis)` ohne Treffer (S3a-Kernfall) |
| `unplausibel_monotonie_verletzt` | 8 |
| `einheit_inkonsistent` | 8 |
| `zeitstempel_fehlt` | 9 — Geräte-Zeitstempel fehlt/implausibel bei `zeitstempelQuelle='geraet'` (**TD-2**) |

**Quarantäne-Zeile enthält NIE die Klartext-DevEUI** — höchstens den
Blind-Index (für „gleiche fehlerhafte Quelle wiedererkennen", z. B. wenn ein
falsch konfiguriertes Gerät wiederholt auf einen unbekannten Kanal sendet),
sowie den redigierten (DevEUI-freien) Rest-Payload für Fehlerdiagnose.

**SEC-1 (Blocker, gelöst) — Sonderfall `envelope_parse_fehler`:** für
**alle anderen** Reason-Codes ist die gespeicherte Payload bereits ein
**geparstes, DevEUI-freies JSON-Objekt** (feldbasierte Redaction greift, da
die einzelnen Felder bekannt sind). Bei `envelope_parse_fehler` **existiert
kein** geparstes Objekt — die Rohbytes **könnten** eine DevEUI oder sonstige
sensible Fragmente an beliebiger Stelle enthalten, eine feldbasierte
Redaction ist **strukturell nicht möglich**. Für diesen Reason-Code gilt
daher **zwingend**: `rohpayload_redacted` bleibt `NULL`, stattdessen werden
**nur** `payload_laenge_bytes` (integer) und `payload_hash` (z. B. SHA-256
der Rohbytes, für Wiedererkennungszwecke ohne Inhalt) gespeichert (Schema-
Ergänzung, §28).

**DB-7 (Auflage):** Index `(grund, empfangen_at)` auf `ingest.
eingang_quarantaene` (trägt den Orphan-Check-Aggregations-Zugriff, s. u.).
**Retention/Wachstum** der Quarantäne-Tabelle ist ein **offener Punkt**
(O2-Bezug) — an `retention-engineer`/`compliance-director` weiterzureichen
(§31/§32), **nicht** v1-blockierend (synthetic-only, geringes Volumen).

**Täglicher Orphan-Check-Job** (`pg_cron`-getriggert oder Worker-interner
periodischer Task): aggregiert die Quarantäne-Tabelle nach `grund` +
Häufigkeit/Dauer je (soweit auflösbar) `zaehler_id`/Blind-Index → **Alert**
(nicht nur Log) bei Schwellwertüberschreitung — dieselbe Alert-
Infrastruktur wie TB-04 (§27), ein gemeinsamer `AusfallAlertPort` (Ports &
Adapters, Adapter-Wahl = Phase 4).

**TD-8 (Auflage, dokumentiert statt gelöst):** wird eine zuvor
`devEUI_unbekannt`-quarantänisierte DevEUI **nachträglich** provisioniert
(§26.4, Provisioning-Pfad), werden die bereits quarantänisierten,
zwischenzeitlich abgelehnten Uplinks **nicht automatisch nachverarbeitet**
(kein „Quarantäne-Replay" in v1) — der zwischen Uplink-Ablehnung und
Provisionierung liegende Zeitraum bleibt für diesen Kanal **eine reale
Lücke** im Hypertable, sichtbar über das DE-02-Dashboard (§27). **v1
(synthetic-only) akzeptiert diesen Datenverlust explizit** als unkritisch;
ein automatisiertes Quarantäne-Replay-nach-Provisionierung ist ein
**möglicher Phase-4-Ausbau** (nicht entschieden, `technical-director`,
§31).

## 26. D14 — O4: DevEUI ↔ Zähler-Korrelation (das Herzstück)

> **Diese Vorgabe ist compliance-director-verbindlich und wird hier
> ausdetailliert, nicht verändert** (Arbeitsauftrag, wörtliche Fünf-Punkte-
> Vorgabe s. u. je Unterabschnitt zugeordnet).

### 26.1 Namensraum (Vorgabe-Punkt 3)

**Entscheidung: neuer Namensraum `device`** (nicht `identity` mitbenutzt).
**Begründung (Optionen/Trade-off, wie im Arbeitsauftrag als Wahl
angeboten):**
- **A — neuer Namensraum `device`** (gewählt). *Pro:* `identity` bleibt
  strikt „echte Personen-PII" (Endkunde/Anschlussnutzer) — klare
  Schutz-Semantik, kein Vermischen von Personen- und Geräte-
  Korrelationsdaten; eigenständig droppbar/exportierbar für einen
  DB-seitigen Schema-weiten Zugriffs-Schnitt (z. B. eigene DB-Rolle,
  eigenes Backup-Regime, falls später unterschiedliche Aufbewahrungsfristen
  für Personen-PII vs. Geräte-Korrelation nötig werden, O2-Bezug).
- **B — Mitbenutzung von `identity`** (verworfen). *Contra:* vermischt zwei
  unterschiedliche Schutzobjekte (Person vs. Gerät) in einem Namensraum;
  erschwert eine spätere getrennte Aufbewahrungs-/Lösch-Policy.
- **Rote Linie (unverändert, Vorgabe-Punkt 3):** `energy.zaehler` bekommt
  **keine** Geräte-Referenz-Spalte — weder Klartext noch verschlüsselt
  (§12).
- **Kein Cross-Namespace-Hart-FK** (Vorgabe-Punkt 3, Fortschreibung von
  V0002 rote Linie 1/5): `device.geraet_zuordnung.zaehler_id` ist ein
  **logischer** Verweis auf `energy.zaehler.id` — **kein** `REFERENCES`.
  Kanal-Validierung analog S3c: die aufrufende Anwendungsschicht prüft die
  Existenz **selbst** (App-seitige Referenzintegrität, wie bereits für
  `messkanal_key` etabliert).

### 26.2 Feld-Verschlüsselung der DevEUI (Vorgabe-Punkt 1)

**Wiederverwendung** von `FieldCipherService` (AES-256-GCM,
nonce||ciphertext||tag) + `KeyManagementPort`/`LocalDevKmsAdapter` — **exakt
dasselbe Envelope-Muster** wie `identity.*_pii` (ADR-0008 §19), **aber ein
eigener Schlüsselraum**: neue Tabelle `device.schluessel` (strukturell
**identisch** zu `identity.subjekt_schluessel`, bewusst **dupliziert**
statt eines gemeinsamen Cross-Namespace-Zugriffs — konsistent mit der
bereits etablierten Konvention „je-Schema-duplizierte Funktionen/Strukturen"
(V0002 rote Linie 5, z. B. `identity.set_updated_at()`/
`energy.set_updated_at()`).

- **1 DEK je Zuordnungs-Zeile** (nicht je Zähler-Lebenszeit) — ermöglicht
  DEK-Rotation bei Geräte-Tausch, ohne alte Zeilen neu verschlüsseln zu
  müssen (jede Zeile trägt ihren eigenen `crypto_key_id`).
- **AAD** (Associated Data) analog `FieldCipherService`: `LP(zaehler_id) ||
  LP('deveui')` — verhindert Feld-/Zeilen-Vertauschen.

### 26.3 Blind-Index für O(1)-Lookup (Vorgabe-Punkt 2)

**Problem:** der Worker muss eine eingehende DevEUI **ohne** lineares
Entschlüsseln aller Zeilen einer Zähler zuordnen (Envelope-Verschlüsselung
ist **nicht-deterministisch**, kein `WHERE deveui_enc = ...` möglich).

**Entscheidung:** ein **separates, system-weites** (nicht pro-Zeile)
Pepper-Geheimnis aus dem KMS/Vault — **niemals in der DB**, auch nicht
gewrappt:

```
interface BlindIndexPepperPort {
  getActivePepper(): Promise<{ pepper: Buffer; version: number }>
  getPepperByVersion(version: number): Promise<Buffer>   // für Rotations-Übergang
}
```

`deveui_blind_index := HMAC-SHA256(pepper, normalisiere(devEUI))`,
`normalisiere()` = kanonische Form (Großbuchstaben, Trennzeichen entfernt,
16-Hex-Zeichen) — **dieselbe** Normalisierungsfunktion in Worker-Lookup
**und** Provisioning-Pfad (Konsistenzpflicht, sonst Lookup-Miss).

- **Dev-Adapter:** `LocalDevPepperAdapter` (analog `LocalDevKmsAdapter`),
  liest einen fixen Dev-only-Pepper aus ENV (`EDMS_DEV_BLIND_INDEX_PEPPER`)
  — **nie im Repo** (A3/DS-10-Regel, cross-cutting).
- **SEC-8 (Auflage) — Pepper umgebungsgetrennt:** dev/staging/prod nutzen
  **unterschiedliche** Pepper-Werte (kein gemeinsamer Pepper über
  Umgebungsgrenzen hinweg). **`getActivePepper()`/`getPepperByVersion()`
  sind ausschließlich der Worker- und der Provisioning-Identität
  zugänglich** (kein allgemeiner KMS-Zugriff für andere Prinzipale) —
  Rechte-Schnitt analog zur DB-Least-Privilege-Matrix (§26.4).
- **`deveui_blind_index` + `pepper_version`** werden **zusammen**
  gespeichert (Spalte `pepper_version smallint`) — Voraussetzung für eine
  spätere Pepper-Rotation (Re-Index-Job, Phase-4/operativer Folgeauftrag,
  **nicht** v1-blockierend, da synthetic-only mit fixem Dev-Pepper).
- **Eindeutigkeit:** `UNIQUE(deveui_blind_index) WHERE gueltig_bis IS NULL`
  (partieller Index — nur die **aktuell aktive** Zuordnung muss je
  Blind-Index eindeutig sein; eine historisch beendete Zuordnung für
  denselben Blind-Index bleibt bei Geräte-Wiederverwendung erlaubt).
- **DB-1 (Blocker, gelöst) — EIN kanonisches Aktiv-Prädikat.** Der
  partielle Unique-Index oben, der Worker-Lookup (§26.4/26.6) **und** die
  Shred-Neutralisierung (§26.5) verwenden **wortgleich dasselbe**
  Prädikat: **`status = 'aktiv' AND gueltig_bis IS NULL`** — nicht drei
  unabhängig formulierte, potenziell divergierende Bedingungen.
  **Optionale, empfohlene Kopplung (Skizze, §28):** `CHECK ((status =
  'aktiv') = (gueltig_bis IS NULL))` auf `device.geraet_zuordnung` —
  verhindert strukturell einen inkonsistenten Zwischenzustand (z. B.
  `status='aktiv'` bei bereits gesetztem `gueltig_bis`, oder umgekehrt).
- **DB-2 (Auflage) — `crypto_key_id` `NOT NULL UNIQUE REFERENCES device.
  schluessel(id)`** (1:1-Shredding-Granularität, analog der
  `identity.endkunde_pii.crypto_key_id UNIQUE`-Konvention, V0002 S4).

### 26.4 ABAC-Kontrolle + Audit (Vorgabe-Punkt 4) — drei getrennte Aktionen

**Spannung, explizit aufgelöst (zur Bestätigung `compliance-director`,
§31):** ein Audit-Ereignis **je einzelnem Uplink** (potenziell >= 50.000/s,
V0002-Sizing) wäre operativ nicht tragbar und würde den Zweck des
Audit-Logs (nachvollziehbare **Handlungen**, nicht Telemetrie-Volumen)
verwässern. **Interpretation:** „jede Auflösung" bezieht sich auf die
**Reverse-Auflösung** (Zeile → Klartext-DevEUI, seltener menschlicher
Zugriff) und **jedes Provisioning** (Mapping anlegen/ändern) — **nicht**
auf den routinemäßigen Vorwärts-Lookup des Workers selbst. Drei Aktionen:

| `PolicyAction` (neu, additiv zur bestehenden Union) | Kategorie (`classifyAction`) | Akteur | Audit |
|---|---|---|---|
| `create:geraet_zuordnung` / `update:geraet_zuordnung` | write | `betrieb` (Provisioning bei Geräte-Installation/-Tausch, Phase-4-Erweiterung des Zähler-Moduls, ADR-0008) | **jede Mutation** über `@AuditAction` (bestehendes Muster) |
| `read:geraet_zuordnung` | read | eng begrenzte Rolle (final `security-lead`/`access-control-engineer`), **deny-by-default**, **break-glass-analog** (Zweckbindung + Zeitfenster, Wiederverwendung `BREAK_GLASS_ZWECK_WHITELIST`/`MAX_FENSTER_TAGE`-Muster, §16 ADR-0008) — Reverse-Entschlüsselung für Support-/Diagnosefälle | **jede** Auflösung, auch `permit` |
| *(kein PolicyAction nötig)* — Worker-eigener Vorwärts-Lookup | — | System-Prinzipal (Worker-DB-Rolle) | **kein** Einzel-Event; **Metrik/Zähler** (Erfolg/Fehlschlag-Rate) statt Audit-Zeile |

**SEC-5 (Auflage) — `read:geraet_zuordnung` braucht EIGENSTÄNDIGE
break-glass-Härtung**, nicht die pauschale Übernahme der
`read:verbrauch_detail`-Härtungen (ADR-0008 §16, dort ohnehin bereits als
„bindende Vorbedingung für ADR-0005" vermerkt) — fünf **eigene**
Anforderungen, da eine Geräte-Zuordnungs-Auflösung ein **Punkt-Zugriff**
ist (ein Blind-Index → eine Zeile), **kein** Zeitraum-Browsing:
1. **Eigene, eng geschnittene Rolle** (z. B. `geraete-support`) statt
   pauschal `betrieb` — final `security-lead`/`access-control-engineer`.
2. **Begründungs-/Ticket-Pflicht** (nicht nur Zweck-Code) — strukturierter
   Verweis auf einen Vorgang, kein Freitext (rote Linie 2, ADR-0008-Muster).
3. **Eigene Zweck-Whitelist**, unabhängig von `BREAK_GLASS_ZWECK_WHITELIST`
   (die für Lastgang-Einsicht gedacht ist, nicht für Geräte-Korrelation).
4. **Punkt-Auflösung statt Zeitraum:** kein `MAX_FENSTER_TAGE=7`-Muster —
   stattdessen eine **kurzlebige Zugriffs-Autorisierung** (Vorschlag
   ≤ 24–48 h Token-Gültigkeit), da eine Einzel-Auflösung kein Zeitfenster
   braucht.
5. **Echtzeit-Alert bei JEDEM `permit`** (nicht nur `deny`) + **periodischer
   Audit-Review als Pflichtprozess** (analog ADR-0008 §16).

Diese fünf Punkte bleiben **Phase-3/4-Ausgestaltung** (§31/§32), hier als
**verbindliche Design-Constraints** für die spätere PDP-Policy vermerkt.

**SEC-6 (Auflage) — Metrik-Hygiene für den Worker-Vorwärts-Lookup:** die in
der Tabelle genannte „Metrik/Zähler (Erfolg/Fehlschlag-Rate)" ist
**ausschließlich aggregiert** — **keine** Geräte-/Blind-Index-Kardinalität
als Metrik-**Label** (kein `blind_index`/`zaehler_id` als
Prometheus-Label o. ä. — das würde eine Kardinalitäts-/Re-Identifikations-
Fläche über die Metrik-Pipeline öffnen). Zulässig: globale Zähler wie
`ingest_lookup_erfolg_total`, `ingest_lookup_devEUI_unbekannt_total`.

**Deny-by-default für den Worker-eigenen Lookup wird NICHT über den
HTTP-gebundenen `PolicyDecisionPort` durchgesetzt** (der Worker hat keinen
JWT-`SecurityContext`, kein HTTP-Request) — **sondern über eine
dedizierte, spaltenscharfe Postgres-Rolle** (Least-Privilege, echtes TOM,
funktioniert auch bei einem Anwendungs-Bug):

| Objekt | `edms_ingest_worker`-Rolle |
|---|---|
| `device.geraet_zuordnung` | `SELECT` **nur** auf `(id, zaehler_id, deveui_blind_index, status, gueltig_von, gueltig_bis)` — **kein** `SELECT` auf `deveui_enc`/`crypto_key_id` |
| `device.schluessel` | **kein** Zugriff |
| `energy.zaehler`, `energy.messkanal` | `SELECT` (nicht-PII Stammdaten) |
| `measurement.messwert` | `SELECT`, `INSERT`, `UPDATE` (Upsert-Pfad) |
| `ingest.*` | `SELECT`, `INSERT`, `UPDATE` |
| `identity.*` | **kein** Zugriff |

**Kein Auto-Provisioning durch den Worker** (Design-Prinzip 4, §11): die
Worker-Rolle hat **keine** `INSERT`/`UPDATE`/`DELETE`-Rechte auf
`device.geraet_zuordnung` — strukturell durch das DB-Rechte-Modell
erzwungen, nicht nur durch Anwendungslogik.

**TD-9 / SEC (compliance-director-verbindlich, bleibt „proposed" bis
wörtliche Bestätigung, s. §32):** die oben hergeleitete Drei-Wege-
Aufteilung (Provisioning / Reverse-Read / Worker-Vorwärts-Lookup ohne
Einzel-Audit) ist **meine** Auflösung der O4-Vorgabe „Audit auf jede
Auflösung" — **noch nicht** wörtlich vom `compliance-director` bestätigt.
`security-lead`-Votum: **akzeptabel unter vier Bedingungen** — (i)
Orphan-/Ausfall-Alerting (§25/§27) bleibt **scharf** als **detektive
Ersatzkontrolle** für den nicht einzeln auditierten Lookup-Pfad; (ii)
`compliance-director` bestätigt den Drei-Wege-Split **wörtlich**; (iii) die
DB-Grants (Tabelle oben) durchlaufen **Migration-Review + periodischen
Zugriffsreview** (ISO A.5.18); (iv) Metriken **ohne** Geräte-Kardinalität
(SEC-6). Bis zur Bestätigung gilt dieser Abschnitt als **Vorschlag, nicht
als abgenommene Policy**.

**Verworfene Alternative:** den Worker künstlich durch die
HTTP-`PolicyDecisionPort`-Pipeline zu zwingen (synthetischer
`SecurityContext` je Uplink). *Contra:* das ganze Attribut-Auflösungs-Modell
(`ResourceAttributesProvider`, Request-Header-Zweckbindung) ist
HTTP-Request-geformt — eine Zwangs-Adaption auf einen Nicht-HTTP-Hochfrequenz-
Pfad wäre architektonisch unpassend und würde die reale Schutzwirkung
(DB-Least-Privilege) nicht erhöhen.

### 26.5 Krypto-Shredding-Kopplung (Vorgabe-Punkt 5)

**Anforderung:** Subjekt-Shredding (Art. 17, ADR-0009 Vier-Augen-Workflow)
**neutralisiert** die zugehörige(n) Geräte-Zuordnung(en).

**Entscheidung (Option B unten):**
- **Neue, kleine `DeviceKryptoShreddingService`**, strukturell/inhaltlich
  **analog** zur bestehenden `KryptoShreddingService` (gleiche
  Idempotenz-/`key_state`-Semantik), aber **operiert nur auf
  `device.schluessel`** — **Duplikation bewusst**, konsistent mit der
  etablierten Namensraum-Trennungs-Konvention (V0002 rote Linie 5).
- **Orchestrierung bleibt beim bestehenden Fach-Service:**
  `EndkundeService.shred()` (bereits der dokumentierte Orchestrierungsort
  für „begleitende Schritte", `krypto-shredding.service.ts`-Kommentar) wird
  um einen **zusätzlichen** Schritt erweitert: alle `device.geraet_zuordnung`-
  Zeilen ermitteln, deren `zaehler_id` (über `energy.zaehler.system_id` →
  `energy.system.endkunde_id`, **innerhalb** `energy.*`, kein
  Namensraum-Bruch) zum geshredderten Endkunden gehört, und für jede
  betroffene Zeile `DeviceKryptoShreddingService.shred(crypto_key_id)`
  aufrufen. **Keine Änderung** an der bestehenden, bereits akzeptierten
  `KryptoShreddingService`/`IdentitySubjektSchluesselRepository` nötig.
- **Verworfene Alternative:** die DevEUI mit dem **Endkunden-eigenen**
  Personen-DEK verschlüsseln (Wiederverwendung von `identity.subjekt_
  schluessel.id` als `crypto_key_id`). *Contra:* vermischt zwei
  Schutzobjekte auf Schlüsselebene (ein Kompromiss des Geräte-Schlüssels
  hätte Zugriff auf den Personen-DEK und umgekehrt); ein Geräte-Tausch
  müsste dann den **Personen**-DEK anfassen — unsauberes Kopplungsdesign.
- **Offener Punkt (§31, zur Bestätigung `database-lead`):** Systeme sind
  strukturell **stabil** einem Endkunden zugeordnet (`energy.system.
  endkunde_id`, kein Eigentümerwechsel im Schema vorgesehen) — die Kopplung
  „Endkunde-Shredding → Geräte-Zuordnung des Zählers neutralisieren" ist
  daher **widerspruchsfrei** zum Datenmodell. Zu bestätigen: was passiert
  mit einem physischen Zähler, der **nach** Endkunden-Shredding **weiter
  Uplinks sendet** (Meter nicht sofort abgebaut) — dann findet der Worker
  einen aktiven Blind-Index-Treffer auf eine **geschredderte**
  Zuordnungszeile?

  **Entscheidung (DB-1, konsistent mit dem kanonischen Aktiv-Prädikat
  §26.3):** Shredding setzt **sowohl** `status` (→ `'geschreddert'`, nicht
  mehr `'aktiv'`) **als auch** `gueltig_bis` (→ `now()`, falls noch `NULL`)
  **in derselben Operation** — **nie** nur eines von beiden (sonst
  widerspräche der Zustand dem `CHECK`-Kopplungsvorschlag §26.3 und dem
  Worker-Lookup-Prädikat). Der Worker-Lookup (§26.3/26.6) prüft **dasselbe**
  Prädikat (`status='aktiv' AND gueltig_bis IS NULL`) — ein geshredderter
  Eintrag ist damit **strukturell nicht mehr auflösbar** (`deveui_enc`
  zusätzlich durch die DEK-Vernichtung unwiederbringlich).

  **GB-C (Phase-3-Entscheidung `compliance-director`, User-Freigabe
  2026-07-16 — Löschvollständigkeit Geräte-Dimension):** Der Shred **nullt
  zusätzlich** den `deveui_blind_index` der betroffenen Zeile. Grund: der
  Blind-Index ist ein **deterministisches** DevEUI-Korrelat, dessen
  system-weiter Pepper beim Shred **nicht** mitvernichtet wird — bliebe er
  stehen, wäre die Krypto-Löschung auf der Geräte-Dimension **unvollständig**
  (ein DB-Leser könnte die geschredderte DevEUI weiterhin gegen einen
  Kandidatenwert bestätigen bzw. Gerätewanderung verketten). Nach dem Nullen
  bleibt allenfalls die `zaehler_id`-Historie stehen (Pseudonym, **kein**
  Geräte-Korrelat), bis sie eigenständig gelöscht/anonymisiert wird
  (Retention-Bezug O2). Das schließt die von `compliance-director` benannte
  Löschvollständigkeits-Lücke (DSFA-0001 Risiko 3.7). Die DB-Spalte ist dafür
  `NULLABLE` (V0010, Entscheidung D-GB); die Ausführung des Nullens ist
  App-Scope (`DeviceKryptoShreddingService`).

**TD-4 (Phase-3-Compliance-Item, s. §32):** `device.schluessel` **erbt**
die in ADR-0009 §2.7 bereits **explizit an ADR-0005 verankerten**
Verpflichtungen für `identity.subjekt_schluessel` — der neue
`DeviceKryptoShreddingService` ist ein **weiterer irreversibler
Shred-Pfad** mit demselben v1-Restvorbehalt (App-Layer-only, kein DB-
`SECURITY DEFINER`-Gate) und braucht **denselben** Risiko-Register-Eintrag
wie der bestehende Personen-Shred-Pfad. Details §32.

### 26.6 Der Worker-Fluss im Detail (Vorgabe: „wichtig")

**Explizit ausdetailliert, wie im Arbeitsauftrag verlangt:**

1. MQTT-Uplink trifft ein, **Klartext-DevEUI im Payload-Body**
   (`deviceInfo.devEui`).
2. Worker liest das Feld in eine **lokale, funktionsgebundene** Variable
   (keine Klassen-/Modul-weite Zwischenspeicherung, kein Promise-Chaining,
   das die Variable über mehrere Ticks am Leben hält länger als nötig).
3. **Sofort**: `normalisiere(devEui)` → `HMAC-SHA256(pepper, normalisiert)`
   → `blindIndex` (Buffer). Die `pepper`-Beschaffung selbst erfolgt **einmal
   beim Worker-Start** (gecacht im Prozessspeicher, transient, nie
   persistiert) — **kein** KMS-Roundtrip pro Uplink nötig (Performance,
   M3-Durchsatz).
4. Die `devEui`-Variable wird **nicht** an Log-Aufrufe, Fehlerobjekte
   (`Error.message`), Metriken oder die Quarantäne-Zeile übergeben. Sie
   **verlässt den Geltungsbereich** dieses Verarbeitungsschritts, sobald
   `blindIndex` berechnet ist (GC-fähig, keine explizite Sekundär-Referenz).
5. **Ausschließlich** `blindIndex` wird für den DB-Lookup verwendet
   (`WHERE deveui_blind_index = $1 AND status = 'aktiv'`).
6. Bei einem Fehler in Schritt 1–3 (z. B. fehlendes/malformtes
   `devEui`-Feld) wird die Fehlermeldung **generisch** gehalten
   (Reason-Code `envelope_parse_fehler`, **kein** Payload-Fragment in der
   Meldung) — verhindert ein versehentliches Log-Leak über
   Stacktraces/Fehlerkontext. **SEC-1 (Blocker, gelöst, s. §25):** dieser
   Fall persistiert **keine** Rohpayload (auch nicht redigiert) — nur
   Länge + Hash der Rohbytes, da eine feldbasierte Redaction ohne
   erfolgreiches Parsing strukturell nicht möglich ist.

## 27. D15 — DE-02/TB-04: Lücken-/Ausfall-Erkennung (Wiederverwendung ADR-0008-Dashboard)

**Grundsatz (Arbeitsauftrag):** **wiederverwenden statt neu** —
`EnergyMonitoringRepository`/`MonitoringService`/`MonitoringController`
(`ADR-0008 §13/§20`) bereits vorhanden. Diese besitzen **bereits** die
(bisher ungenutzten) Erweiterungspunkte `ebene: 'system'|'zaehler'` und
`systemId`/`zaehlerId`-Felder in `VollstaendigkeitItem` — **genau dafür
vorgesehen**.

**Zwei fachlich unterschiedliche Uhren, zwei Mechanismen:**

| | **DE-02-Vollständigkeit** (retrospektiv, Förderjahr-Nachweis) | **TB-04-Ausfall** (nah-echtzeitig, Alarmierung) |
|---|---|---|
| Granularität | Tag (`time_bucket('1 day', ts)`) | laufend, „seit wann kein Uplink mehr" |
| Mechanismus | **Inkrementelle Watermark-Tabelle + `pg_cron`-Delta-Job** (Apache-2, **kein** Continuous Aggregate, **kein** Full-Refresh-MV — TS-2, konsistent mit ADR-0004 §14) | `ingest.kanal_status`-Tabelle (1 Zeile/Kanal, vom Worker bei jedem erfolgreichen Ingest **mit `GREATEST`-Semantik** upgedatet, §20 Schritt 11/TS-3) + periodischer Freshness-Check |
| Ausgabe | Fehltage je `messkanal_key`/Förderjahr | Alert + dokumentierter „Ausfall-Vorgang" |
| Konsument | `MonitoringController` (`read:monitoring`, `betrieb`/`compliance-auditor`) — **erweitert** um `ebene='zaehler'`, neuer `LueckenTyp`-Wert `datenluecke_messwert` | `AusfallAlertPort` (Ports & Adapters, Adapter-Wahl Phase 4) + `ingest.ausfall_vorgang`-Tabelle |

**Entscheidung DE-02 (TS-2, Blocker, gelöst — korrigiert gegenüber der
Vorfassung):** eine schlichte `MATERIALIZED VIEW` mit periodischem
**Full-Refresh** skaliert **nicht** (Hunderte Mio. Zeilen) — **ADR-0004
§14 hat genau dieses Muster bereits geprüft und verworfen**: „ein
Full-Refresh-Materialized-View skaliert bei hunderten Mio. Zeilen nicht und
ist damit verworfen". **ADR-0005 übernimmt daher exakt das in ADR-0004 §14
für das allgemeine Rollup festgelegte Muster** (inkrementelles Rollup statt
Full-Refresh-MV), hier für die DE-02-Tages-Abdeckung:
- `measurement.taegliche_abdeckung` — **normale Tabelle mit Watermark**
  (kein `MATERIALIZED VIEW`, kein Hypertable in v1): Spalten
  `messkanal_key, tag, anzahl`, `UNIQUE(messkanal_key, tag)`.
- **`pg_cron`-Delta-Job** verarbeitet **nur neue, abgeschlossene
  Zeitfenster** seit der letzten Watermark (analog ADR-0004 §14):
  `INSERT INTO measurement.taegliche_abdeckung SELECT messkanal_key,
  time_bucket('1 day', ts), count(*) FROM measurement.messwert WHERE ts >=
  <watermark> AND ts < <abgeschlossenes Fenster> GROUP BY 1,2 ON CONFLICT
  (messkanal_key, tag) DO UPDATE SET anzahl = EXCLUDED.anzahl` (Skizze,
  §28).
- **Reprocessing-Fenster für Spätankünfte/Backfill** (analog ADR-0004 §14):
  der Delta-Job verarbeitet nicht nur strikt neue Tage, sondern hält ein
  **Nachlauf-Fenster** offen (z. B. die letzten N abgeschlossenen Tage
  erneut aggregiert, `ON CONFLICT DO UPDATE` überschreibt `anzahl`
  idempotent), damit ein **Backfill** (§21), der einen bereits
  „abgedeckten" Tag nachträglich befüllt, **korrekt nachgezogen** wird
  statt an der Watermark vorbeizulaufen. Konkrete Fenstergröße = Phase-4-
  Kalibrierung (`timescale-engineer`, §31).
- `EnergyMonitoringRepository` bekommt eine **neue** Methode (additiv,
  bestehende `listVollstaendigkeit()` unverändert), die je aktivem
  `messkanal_key` gegen `measurement.taegliche_abdeckung` prüft, ob im
  relevanten Förderjahr-Zeitraum Tage mit `anzahl = 0`/fehlende Tage
  existieren → `LueckenTyp = 'datenluecke_messwert'` auf `ebene='zaehler'`
  (Feld `zaehlerId`/`systemId` erstmals befüllt, `endkundeId` weiterhin für
  Roll-up).
- `keine_mindestaufloesungs_zusage` (V0002-Notiz aus ADR-0008,
  „nicht berechnet, da keine Spalte") bleibt **weiterhin offen** — kein
  ADR-0005-Scope.

**Entscheidung TB-04:**
- `ingest.kanal_status (messkanal_key integer PRIMARY KEY, letzter_ts
  timestamptz, updated_at timestamptz)` — vom Worker bei **jedem**
  erfolgreichen Ingest **mit `GREATEST`-Semantik** upgedatet (TS-3, Blocker,
  gelöst — `letzter_ts = GREATEST(EXCLUDED.letzter_ts, ingest.kanal_status.
  letzter_ts)`, s. §20 Schritt 11 für die Begründung: sonst dreht ein später
  verarbeiteter Backfill-Datensatz das Freshness-Signal rückwärts) —
  billige Einzeilen-Upsert, kein Hypertable-Scan nötig für
  Freshness-Checks.
- Periodischer Check (Worker-intern per Intervall-Timer **oder**
  `pg_cron` + kleine Abfrage) markiert Kanäle mit `letzter_ts` älter als
  ein konfigurierbarer Schwellwert (Vorschlag ≥ 36 h Puffer über die
  DE-02-Mindestkadenz von 1/Tag) als „Ausfall" → `ingest.ausfall_vorgang`
  (Zustand `offen|andauernd|behoben`) + `AusfallAlertPort.emit(...)`.
- **Metadaten-only, pseudonym** (Arbeitsauftrag-Vorgabe): Alert-/Report-
  Payload enthält **ausschließlich** `messkanal_key`/`kanal_key`,
  **keine** DevEUI, **keine** Endkunden-PII (durchgängig konsistent mit
  Design-Prinzip 1).
- **DS-07-Innensicht für `compliance-auditor`** (Arbeitsauftrag): folgt der
  **bereits bestehenden** ADR-0008-§6.5-Policy 1:1 — `compliance-auditor`
  liest `read:monitoring` (Metadaten), **kein** neuer PDP-Fall nötig, da die
  neuen `LueckenTyp`/`ebene`-Werte **innerhalb** derselben Aktion
  (`read:monitoring`) laufen, für die die DS-07-Policy bereits gilt.

## 28. D16 — Schema-Skizze (Phase-4-Ausblick, KEINE Migration in diesem Paket)

> Rein illustrativ — **keine** Migrationsdatei entsteht in diesem Paket.
> Konkrete Typen/Constraints/Indizes final durch `database-lead`/
> `timescale-engineer`, Migrations-Nummer **voraussichtlich ab V0010**
> (aktuell höchste: V0009).

**Neue Namensräume:** `device` (O4-Mapping, §26), `ingest`
(Worker-Betriebs-/Fehlerpfad-Bookhaltung, §25/§27).

| Tabelle (Namensraum) | Kernspalten (Skizze) | Zweck |
|---|---|---|
| `device.schluessel` | `id, wrapped_dek, kms_key_id, alg_version, key_state, created_at, geschreddert_at` | 1 DEK je Geräte-Zuordnungs-Zeile (Envelope, analog `identity.subjekt_schluessel`); **nur** `created_at`/`geschreddert_at` (DB-3 — kein `updated_at`, analog `identity.subjekt_schluessel`) |
| `device.geraet_zuordnung` | `id, zaehler_id (logisch, kein FK), deveui_enc, deveui_blind_index, pepper_version, crypto_key_id NOT NULL UNIQUE → device.schluessel (DB-2), gueltig_von, gueltig_bis, status, created_at, updated_at (DB-3)` + `EXCLUDE USING gist (zaehler_id WITH =, tstzrange(gueltig_von,gueltig_bis) WITH &&)` + `UNIQUE(deveui_blind_index) WHERE gueltig_bis IS NULL` + optional `CHECK ((status='aktiv') = (gueltig_bis IS NULL))` (DB-1) | O4-Kernkorrelation; **eigener** `device.set_updated_at()`-Trigger (DB-3, rote Linie 5 — kein Cross-Schema-Aufruf auf `energy.set_updated_at()`) |
| `ingest.eingang_quarantaene` | `id, grund, zaehler_id (logisch, nullable), messkanal_key (nullable), deveui_blind_index (nullable), rohpayload_redacted jsonb (NULL bei `envelope_parse_fehler`, SEC-1), payload_laenge_bytes (nullable, SEC-1), payload_hash (nullable, SEC-1), ts_uplink, empfangen_at, alert_status` + Index `(grund, empfangen_at)` (DB-7) | Dead-Letter (S3a/§25); Retention **offen** → `retention-engineer` (DB-7) |
| `ingest.kanal_status` | `messkanal_key PRIMARY KEY, letzter_ts, updated_at` | TB-04-Freshness, `GREATEST`-Upsert (TS-3, §27) |
| `ingest.ausfall_vorgang` | `id, messkanal_key, status, beginn_ts, ende_ts, created_at` | TB-04-Dokumentation (§27) |
| `measurement.taegliche_abdeckung` (normale Tabelle mit Watermark, **kein** MV, **kein** Hypertable — TS-2) | `messkanal_key, tag (time_bucket 1 day), anzahl` + `UNIQUE(messkanal_key, tag)` | DE-02-Vollständigkeit, inkrementeller `pg_cron`-Delta-Job + Reprocessing-Fenster (§27, analog ADR-0004 §14) |
| `measurement.messwert_korrektur_log` (**entschieden, D2** — append-only, normale Tabelle, `AFTER UPDATE`-Trigger, §24) | `id uuid PK (UUIDv7), messkanal_key, ts, alte_qualitaet, alter_rang, neue_qualitaet, neuer_rang, alte_herkunft, neue_herkunft, korrigiert_at` + Index `(messkanal_key, ts)` + `REVOKE UPDATE, DELETE FROM PUBLIC` | DE-03-Korrekturhistorie — **im ersten Migrations-Batch anzulegen** (D2), Feinschnitt final `database-lead` |
| `measurement.rang(qualitaet, herkunft)` (**entschieden, TS-1/TD-5** — `IMMUTABLE`-SQL-Funktion, §24) | Funktion, kein Tabellen-Objekt | kanonische, einzige Rang-Berechnung (Upsert + Tests) |
| `measurement.messwert.decoder_version` (optionale Spalten-Ergänzung, **nicht** priorisiert) | `smallint` | Reproduzierbarkeit (nice-to-have, §23) |

**Rollen/Grants (DB-5, Skizze, §26.4):** `CREATE ROLE edms_ingest_worker`
als **idempotenter `DO`-Block** (Muster wie für Betriebsrollen etabliert),
gefolgt von den spaltenscharfen `GRANT`s exakt nach der Matrix in §26.4.
**Rollen werden in der Down-Migration NICHT gedroppt** (Konvention analog
anderer Betriebsrollen).

**TS-6 (Auflage):** zusätzlich zur bestehenden Spalten-/Trigger-Lage gilt
für `measurement.messwert` **explizit** `REVOKE DELETE, UPDATE FROM
PUBLIC` (Defense-in-Depth, Ergänzung zum bereits granularen
`edms_ingest_worker`-Grant) — nur die Worker-Rolle (und ggf. eine künftige
Korrektur-Workflow-Rolle) erhalten gezielt `UPDATE`.

**Namensraum-Hinweis (für den Migrations-Kopf, Phase 4):** `ingest.*` fällt
**NICHT** unter die Audit-Schema-`REVOKE UPDATE, DELETE`-Konvention
(`database-migrations.md`) — `ingest.kanal_status`/`ingest.ausfall_vorgang`
sind **mutabler Betriebszustand** (Freshness-Tracking, Vorgangs-Status),
**kein** Beweismittel wie das `audit`-Schema. Diese Abgrenzung ist im
künftigen Migrations-Dateikopf **explizit zu begründen**, damit kein
Reviewer die Audit-`REVOKE`-Regel wörtlich auf `ingest.*` überträgt.

**Keine Änderung an:** `energy.zaehler`, `energy.messkanal`,
`measurement.messwert` (Spaltenbestand unverändert — nur die neue,
optionale `decoder_version` ist Diskussionspunkt, keine beschlossene
Ergänzung; `messwert_korrektur_log` ist als **separate** Tabelle
entschieden, D2, keine Spalten-Ergänzung an `messwert` selbst).

## 29. D17 — Neue Dependencies & Lizenz-Check

| Paket | Zweck | Lizenz (`npm view <pkg> license`, geprüft) | Whitelist-Konform? |
|---|---|---|---|
| `mqtt` | MQTT-Client (Subscribe/Publish, TLS, Reconnect) im Worker + synthetischem Publisher | **MIT** | ✅ |
| Node-built-in `crypto` (HMAC/AES-GCM) | Blind-Index + Feld-Verschlüsselung | — (kein npm-Paket) | ✅ (bereits genutzt, `FieldCipherService`) |
| `pg_cron` | MV-Refresh, Freshness-Checks | Postgres-Extension, **PostgreSQL-Lizenz** (bereits in `dependencies.md` als Ersatzmuster benannt) | ✅ |

**Keine weiteren neuen eingebetteten Dependencies** für v1 (kein Bit-Codec
nötig, da der synthetische Referenz-Gerätetyp JSON-Payload nutzt, §23).
**Kein** `npm install` in diesem Paket — Lizenz-Check ist hiermit
dokumentiert, Installation ist Phase-4-Implementierungsschritt.

## 30. Akzeptanzkriterien — Nachweis-Mapping M1–M7

| Metrik | Design-Absicherung in diesem Paket |
|---|---|
| **M1** Idempotenz | §24 atomare `ON CONFLICT ... WHERE`-Bedingung, reihenfolge-invariant |
| **M2** Backfill deterministisch | §21 — dieselbe Ingest-Flow-Funktion für Live/Backfill, Rang-Regel §24 |
| **M3** Kein Datenverlust bei Neustart | §15 — QoS 1 + persistente Session + Mosquitto-Persistenz + Ack-nach-Commit |
| **M4** Lücken-Report DE-02-tauglich | §27 — MV + `pg_cron`, erweitert bestehendes Dashboard |
| **M5** Ausfall-Alarmierung TB-04 | §27 — `ingest.kanal_status` + `ingest.ausfall_vorgang` + `AusfallAlertPort` |
| **M6** Referentielle Integrität ohne FK | §20 Schritt 7 (S3c) + §25 (S3a, Quarantäne + täglicher Check) |
| **M7** Synthetic-only-Garantie | §16 (Publisher-Guard) + §19 (Worker-Bootstrap-Selbstcheck, `EDMS_INGEST_BROKER_MODE`) + §22 (CI-PII-Guard Worker-Fixtures) |
| **(neu) DevEUI nie Klartext at-rest/in Logs** | §26.2–26.6 durchgängig — Envelope-Verschlüsselung, Blind-Index, transiente Variable, Log-Redaction §22 |

## 31. Offene Punkte für den Design-Review — konsolidierte, kategorisierte Liste

> Nach den vier Phase-2-Reviews (`technical-director`/`security-lead`/
> `timescale-engineer`/`database-lead`, alle „freigegeben-mit-Auflagen")
> und den zwei User-Entscheidungen (D1/D2, §24) konsolidiert. Drei
> Kategorien: **Blocker vor Phase 4** (mussten vor Migration/Implementierung
> gelöst sein — hier **bereits in-Text gelöst**, s. Verweise), **Auflagen**
> (Phase-4-Umsetzungspflicht, aber kein Phase-4-Start-Hindernis) und
> **Phase-3-Compliance-Items** (an `compliance-director` weitergereicht,
> bleiben „offen/proposed" bis dortige Bestätigung, s. auch §32).

### Blocker vor Phase 4 (bereits in-Text gelöst, s. Verweis)

| ID | Owner | Befund | Lösung (Verweis) |
|---|---|---|---|
| **SEC-1** | `security-lead` | Klartext-DevEUI-Leck bei Envelope-Parse-Fehler | neuer Reason-Code `envelope_parse_fehler`; **keine** Rohpayload bei Parse-Fehler, nur Länge+Hash (§20 Schritt 2, §25, §26.6) |
| **SEC-2** | `security-lead` | TLS-Härtungslücke (Version/Cipher/Client-Auth unterspezifiziert) | TLS 1.3 exklusiv (Ausnahme nur mit Einzelfreigabe), Cipher-Suite-Whitelist, mTLS Worker↔Broker ≤ 90 Tage (§17) |
| **TS-1 / TD-5** | `timescale-engineer` / `technical-director` | `rang()` dupliziert (Worker + SQL), nicht-monotone Rohcode-Umkehrung als Leser-Falle unmarkiert | EINE kanonische `IMMUTABLE`-SQL-Funktion `measurement.rang()`, Leser-Falle explizit markiert, Code-Review-Guard, 32-Zellen-Testmatrix (§24) |
| **TS-2** | `timescale-engineer` | DE-02 als Full-Refresh-`MATERIALIZED VIEW` skaliert nicht (widerspricht ADR-0004 §14, dort bereits verworfen) | inkrementelle Watermark-Tabelle `measurement.taegliche_abdeckung` + `pg_cron`-Delta-Job + Reprocessing-Fenster (§27/§28) |
| **TS-3** | `timescale-engineer` | `ingest.kanal_status`-Upsert ohne Monotonie-Schutz — Backfill kann TB-04-Freshness-Signal rückwärts drehen | `GREATEST`-Semantik im Upsert (§20 Schritt 11, §27) |
| **DB-1 / TD-3** | `database-lead` / `technical-director` | drei potenziell divergierende „aktiv"-Prädikate (Unique-Index, Worker-Lookup, Shred-Neutralisierung) | EIN kanonisches Prädikat `status='aktiv' AND gueltig_bis IS NULL`, optionale `CHECK`-Kopplung (§26.3/§26.5) |
| **TD-2** | `technical-director` | `zeitstempelQuelle` als impliziter Per-Uplink-Fallback gelesen — bricht Idempotenz bei Mischnutzung | `zeitstempelQuelle` strikt statisch je Decoder; fehlender/implausibler Geräte-Zeitstempel → Dead-Letter `zeitstempel_fehlt`, kein Fallback (§20 Schritt 9, §23, §25) |
| **D1 (TD-1)** | User (entschieden) | `herkunft` first-writer-abhängig, verletzt M2 „bitgleich inkl. herkunft" | `rang()` composite über `(qualitaet, herkunft)`, feste Rangordnung `manuell > ingest_live > backfill > import_altsystem` (§24, §3/M2) |
| **D2** | User (entschieden) | Korrekturhistorie fehlte / war „offener Punkt" | `measurement.messwert_korrektur_log` (Option A, Trigger-basiert) **im ersten Migrations-Batch**, nicht verschoben (§24, §28) |

### Auflagen (Phase-4-Umsetzungspflicht, kein Blocker)

| ID | Owner | Inhalt (Verweis) |
|---|---|---|
| **TD-6** | `technical-director` | 2×2-Validitätsmatrix `EDMS_INGEST_BROKER_MODE` × `EDMS_SYNTHETIC_ONLY` im Bootstrap-Selbstcheck (§19) |
| **TD-7** | `technical-director` | Topic-vs-Payload-DevEUI-Konsistenzcheck **gestrichen** (Design-Prinzip 1 vs. geringer Sicherheitsgewinn) (§14) |
| **TD-8** | `technical-director` | Quarantäne-Replay-nach-Provisionierung **nicht** automatisiert — Datenlücke im Provisionierungs-Fenster v1 akzeptiert (§25) |
| **SEC-6** | `security-lead` | Vorwärts-Lookup-Metriken nur aggregiert, keine Geräte-/Blind-Index-Kardinalität in Labels (§26.4) |
| **SEC-7** | `devops-lead` (Ops-Runbook) | MQTT-Client-Debug-Logging in Prod-Profilen deaktiviert (§22) |
| **SEC-8** | `security-lead` | Pepper umgebungsgetrennt (dev/staging/prod); `getActivePepper()` nur Worker + Provisioning-Identität (§26.3) |
| **DB-2** | `database-lead` | `crypto_key_id NOT NULL UNIQUE REFERENCES device.schluessel(id)` (§26.3, §28) |
| **DB-3** | `database-lead` | `device.geraet_zuordnung` braucht `updated_at` + eigenen `device.set_updated_at()`-Trigger (rote Linie 5) (§28) |
| **DB-4** | `database-lead` / `compliance-director` | PII-Kommentare `wrapped_dek`/`deveui_enc` (`pii=true`), `deveui_blind_index` (`personenbeziehbar=true; pii=false; art=deterministisches-korrelat`) — finale Klassifizierung Phase 3 (§28, §32) |
| **DB-5** | `database-lead` | `CREATE ROLE edms_ingest_worker` (idempotenter `DO`-Block, V0003-Muster) + spaltenscharfe Grants nach §26.4; Rolle im Down nicht droppen (§28) |
| **DB-7** | `retention-engineer` / `compliance-director` | `ingest.eingang_quarantaene`-Retention/Wachstum offen (O2-Bezug); Index `(grund, empfangen_at)` (§25, §28) |
| **TS-5** | `timescale-engineer` | Chunk-Benchmark (P4-3) an realistischer BAFA-Pilotgröße kalibrieren, nicht an 50k/s-Sizing-Referenz (Phase 4) |
| **TS-6** | `database-lead` / `timescale-engineer` | explizites `REVOKE DELETE, UPDATE FROM PUBLIC` auf `measurement.messwert` (§28) |
| *(Namensraum-Hinweis)* | `database-lead` | `ingest.*` fällt NICHT unter die Audit-`REVOKE`-Konvention — im Migrations-Kopf zu begründen (§28) |
| *(Modul-Refactoring)* | `backend-lead` | `stammdaten/crypto/*` → gemeinsames `common/crypto/` vor Worker-Reuse erwägen (§18) |
| *(Ingest-Flow-Reihenfolge)* | `technical-director` | Bestätigung „korrelieren vor decode" vs. Arbeitsauftrags-Wortlaut (§20) |
| *(`herkunft`-Abgrenzung)* | `database-lead` / `technical-director` | `ingest_live` (inkl. verspäteter Live-Zustellung) vs. `backfill` (expliziter Batch-Nachlauf) (§21) |
| *(`decoder_version`)* | `database-lead` | Phase-4-Nice-to-have oder verwerfen (§23) |

### Phase-3-Compliance-Items (an `compliance-director` weiterreichen — s. §32, bleiben „offen/proposed")

| ID | Owner | Inhalt (Verweis) |
|---|---|---|
| **TD-4** | `compliance-director` / `security-lead` / `database-lead` | `device.schluessel` erbt ADR-0009-§2.7-Verpflichtungen (Cloud-KMS, DB-Gate, Grant-Modell); neuer irreversibler Shred-Pfad braucht eigenen Risiko-Register-Eintrag (§26.5, §32) |
| **TD-9 / SEC** | `compliance-director` | Drei-Wege-Aufteilung der O4-Audit-Granularität — bleibt „proposed" bis wörtliche Bestätigung; `security-lead`-Votum unter vier Bedingungen (§26.4, §32) |
| **SEC-5** | `security-lead` / `access-control-engineer` | eigenständige break-glass-Härtung für `read:geraet_zuordnung` (eigene Rolle, Ticket-Pflicht, eigene Zweck-Whitelist, Punkt- statt Zeitraum-Auflösung, Echtzeit-Alert, Audit-Review) (§26.4, §32) |
| **SEC-9** | `compliance-director` / `dsgvo-auditor` | deterministischer Blind-Index = Linkability-Restrisiko — DSFA-0001-§3.6-Nachtrag, keine Design-Korrektur nötig (§32) |
| **SEC-4** | `compliance-director` / `devops-lead` | `EDMS_INGEST_BROKER_MODE=real`-Freigabe braucht Dual-Control (getrennter Secret-/Config-Pfad, zwei Approvals) (§19, §32) |
| **SEC-3** | `devops-lead` / `security-lead` | Mosquitto-Persistenzspeicher-Verschlüsselung-at-Rest + `max_queued_messages`/`max_queued_bytes` + Message-Expiry (§15, §32) |
| *(TOM-Sammlung)* | `compliance-director` | Pepper-Verwaltung, Mosquitto-Logging, DB-Rollen-Matrix-Review, Metrik-Hygiene, MQTT-Debug-Logging — s. §32 |

**An `iot-ingestion-engineer` (Umsetzung, Phase 4, zur Kenntnis):**
- Konkrete MQTT-Client-Bibliothekskonfiguration (Reconnect-Parameter,
  TLS-/mTLS-Optionen), Decoder-Registry-Implementierung, kanonische
  `rang()`-Funktion, Worker-Bootstrap inkl. 2×2-Validitätsmatrix (TD-6).

### Phase-5-Review-Ergebnisse (2026-07-21)

Vier parallele Reviews über den gesamten Phase-4-Stand: `security-auditor`
(freigegeben-mit-Auflagen), `dsgvo-auditor` (kein Veto mit Auflagen),
`performance-engineer` (v1 tragfähig / produktiv mit Auflagen), `qa-lead`
(release-fähig mit Auflagen). **Kein fachlicher oder sicherheitskritischer
Blocker.** Alle roten Linien RL-1…RL-5 sowie GB-C, SEC-1 und Fail-closed
wurden **einzeln mit Fundstellen belegt** — RL-1 zusätzlich durch einen
negativen Integrationstest (Worker-Rolle erhält PG-Fehler `42501` auf
`deveui_enc`, `device.schluessel`, `identity.subjekt_schluessel`).

**In Phase 5 unmittelbar behoben (Code, im selben Paket):**

| ID | Fix |
|---|---|
| **SA-1** | TOCTOU-Race der SEC-5-Velocity/Quota geschlossen: `pg_advisory_xact_lock` je `actor_sub` serialisiert Check+Decrypt+Audit in derselben Request-Tx. Regressionstest mit **echter Parallelität** (`Promise.all`), gegengeprüft: ohne Fix deterministisch rot |
| **SA-2 / PE-11** | Payload-Byte-Obergrenze vor `JSON.parse` (→ `envelope_parse_fehler`, nur Länge+Hash) + Obergrenze der Eintragsanzahl je Uplink (→ `decode_fehler`) |
| **SA-4** | `DEBUG=mqtt*`-Startup-Guard (fail-closed) statt bloßem Ops-Runbook-Kommentar |
| **SA-5** | Rollback-Fehler wird PII-sicher geloggt statt still verschluckt |
| **PE-6** | Worker-Pool: `statement_timeout`, `lock_timeout`, `connectionTimeoutMillis` gesetzt — verhindert stillen Totalstillstand bei hängender Query |
| **PE-7** | Erfolgs-Logging im Hot Path auf `debug` abgesenkt |
| **QA-3** | `infraFehler()` im MQTT-Adapter verdrahtet → Infra-Fehlerpfad läuft durch die PII-sichere Feld-Whitelist |
| **QA-5** | Drei fehlende Integrationstests, u. a. die **DSGVO-Invariante** „geschredderte/inaktive Zuordnung ⇒ `devEUI_unbekannt`" (war zuvor nur durch Code-Lesen belegt) |
| **QA-6** | Decoder-Atomarität präzisiert (Unabhängigkeitsgarantie gilt erst **nach** erfolgreichem `decode()`) + Mixed-Array-Test |
| **DS-1** | Katalog-Beschreibung der vier `geraet_zuordnung.*`-Codes per SCD2 korrigiert (V0016) — die „RESERVIERT"-Aussage stand in abfragbaren Katalog-**Daten**, nicht nur im Kommentar |

**Gate-Auflagen vor Real-Ingest (offen, zusätzlich zu GB-A…GB-F):**

| ID | Owner | Auflage |
|---|---|---|
| **PE-5** | `iot-ingestion-engineer` / `database-lead` | Mehrkanal-Uplinks: **eine** gemeinsame Transaktion je Uplink + Batch-Lookups statt N Einzeltransaktionen. Gemessen: 3 Kanäle = 2,40× Latenz; ein 10-Kanal-Zähler drückt den Durchsatz auf ~95 Uplinks/s. Größter Hebel vor echten Mehrkanal-Zählern |
| **PE-2** | `technical-director` / `database-lead` | **§21 revidieren:** ein Backfill darf **nicht** 1:1 den Row-by-Row-Ingest-Flow wiederverwenden — gemessener Ceiling ~550–750 Werte/s verfehlt das ADR-0004-Batch-Ziel (≥50.000/s) um Faktor 70–100. Eigener batch-optimierter Schreibpfad nötig |
| **PE-1** | `technical-director` | Eigenes **Live-Durchsatzziel** definieren. Die in §15 und mehreren Migrationsköpfen zitierten „≥50.000 Messwerte/s" sind ein **Backfill-/Batch-Ziel aus ADR-0004**, kein Live-SLA — die reale Live-Last aus dem F3-Sizing liegt bei ~1–11 Nachrichten/s |
| **SA-3** | `security-lead` / `devops-lead` | TLS/mTLS **strukturell** erzwingen (nicht nur kommentiert), bevor `EDMS_INGEST_BROKER_MODE=real` je unterstützt wird; ebenso das Freigabeartefakt für GB-D tatsächlich implementieren |
| **DS-5** | `compliance-director` / `database-lead` | DB-`SECURITY DEFINER`-Shred-Gate + rollen-getrenntes Grant-Modell für `identity`/`energy`/`device` — codeseitig bestätigt weiterhin nicht vorhanden (DSFA-0001 §7 Element 9) |
| **DS-3** | `retention-engineer` | **Harte** Gate-Auflage: Retention-Job für `ingest.eingang_quarantaene`. Die Tabelle wächst sonst unbegrenzt mit personenbeziehbaren Korrelationsdaten (`deveui_blind_index` bleibt dort bewusst, SA-6-Entscheidung) — verankert in DSFA-0001 Element 12 + `retention-matrix.md` Rev. 4 |
| **DS-6 / PE-8** | `postgres-engineer` / `database-lead` | Index auf `audit.event (event_typ, actor_sub, ts)` für die SEC-5-Quota-Zählung — wird mit wachsendem Gesamt-Audit-Volumen teurer, unabhängig vom Reverse-Volumen |
| **DS-7** | `audit-trail-engineer` / `backend-lead` | **Mangel M-1** (ADR-0008 §29 C13 / D12 §8): Der Klartext-Namensabruf auf der Endkunde-**Detailseite** (`GET /stammdaten/endkunden/{endkundeId}`) ist nicht protokolliert — `endkunde.controller.ts` trägt dort kein `@AuditAction`, anders als `standort.pii.einsicht`, `einflussgroesse.stammdaten.einsicht` und `stammdaten.verbrauch_detail.einsicht`. Die Wirksamkeit der `PiiProjektionsPolicy` ist damit **behauptet, nicht belegbar** (Art. 32 Abs. 1 lit. b i. V. m. Art. 5 Abs. 2). Der Event-Code `endkunde.pii.einsicht` existiert seit **V0034** und ist bewusst so geseedet, dass der Detailpfad OHNE zweite Katalog-Migration andocken kann (`objekt_ref=endkundeId`, beide Zählwerte 1). Solange DS-7 offen ist, deckt der Code AUSSCHLIESSLICH den Batch-Pfad ab — aus seinem Vorhandensein darf **nicht** geschlossen werden, dass PII-Lesezugriffe auf Endkunden vollständig protokolliert sind |
| **DS-8** | `security-lead` / `backend-lead` | **Velocity-Quota je Subjekt** für `read:endkunde_pii` (ADR-0008 D12 Auflage A9). Der Batch-Endpunkt senkt den Aufwand für einen vollständigen Kundenbestands-Abzug von n Requests auf ⌈n/100⌉ — es entsteht kein neues *Recht*, aber eine neue *Ausnutzbarkeit* eines bestehenden. Kompensiert wird das v1 über Mengengrenze (A2), Ausschnittsbindung (A3), die Audit-Differenz (A6) und den periodischen Review (A9); eine harte Quota ist vor Real-Ingest zu prüfen. Analog SEC-5 (`read:geraet_zuordnung`), aber **ohne** dessen Break-glass-Härtung — A8 verneint eine Zweckbindungs-Bestätigung ausdrücklich |
| *(Monitoring)* | `iot-ingestion-engineer` | **TB-04-Ausfall-Job + täglicher Orphan-Check-Job** — ohne sie existiert kein „Zähler sendet nicht mehr"-Monitoring; die Tabellen, auf denen sie aufsetzen (`ingest.kanal_status`, `ingest.eingang_quarantaene`), werden bereits geschrieben |
| *(Rollout)* | `devops-lead` / `security-lead` | Keycloak-Realm-Rolle `geraete-support` anlegen/zuweisen (bis dahin ist der Reverse-Endpoint für **alle** `403`, fail-closed); Pepper-Umgebungstrennung dev/staging/prod betrieblich bestätigen |
| *(Betrieb)* | `audit-trail-engineer` / `devops-lead` | Runbook-Schritt nach V0016: `audit.katalog.geaendert` je Code mit **echtem authentifiziertem Principal** emittieren — bewusst **keine** Migration (ein SQL-Skript kann keinen validierten `actor_*` herstellen, rote Linie 1) |
| *(Scope)* | `iot-ingestion-engineer` | Backfill-CLI (§21) und CI-PII-Guard-Erweiterung auf Worker-Fixtures (§19 Punkt 4) — bewusst nicht in v1 |
| *(Altbestand)* | `audit-trail-engineer` | `V0009__seed_shred_workflow_events.down.sql` Z. 94: `RAISE WARNING` mit vier `%`-Platzhaltern, aber drei Argumenten. Gemergt, daher nicht editierbar — löst nur beim Rollback von V0009 mit bereits referenzierenden Audit-Zeilen aus |

## 32. Phase-3-Vorschau (Compliance-Deliverables, Referenz)

Unverändert zur Phase-1-Einschätzung (§7), **plus** ein **neuer, konkreter
Nachtragspunkt** aus diesem Design:

- **DSFA-0001-Nachtrag** (überwiegend, wie in §7 erwartet) — **jetzt mit
  konkretem Inhalt:** Zeile „Quasi-Identifier Gerät/Zähler" in DSFA-0001 §1
  („Datenkategorien") von `energy.zaehler.geraete_referenz` auf `device.
  geraet_zuordnung`/`device.schluessel` korrigieren (§12); Risiko 3.4
  (DSFA-0001 §3.6, Re-Identifizierung via Quasi-Identifier) mit der
  Blind-Index-/Envelope-Konstruktion neu bewerten (Risikominderung
  dokumentieren).
- **O4-Klassifizierung final protokollieren:** dieses Kapitel **ist** die
  ausdetaillierte Umsetzung der O4-Vorgabe — `compliance-director`
  bestätigt in Phase 3, dass die Umsetzung der Vorgabe entspricht (v. a.
  §26.4-Interpretation der Audit-Granularität, oben als offener Punkt
  markiert).
- **TOM-Zusatz:** Blind-Index-Pepper-Verwaltung (KMS/Vault, System-weit,
  Rotation), Mosquitto-Logging-Konfiguration (§14), DB-Rollen-Least-
  Privilege-Matrix (§26.4).
- **ISO-Controls** (Ergänzung zu §7): A.8.24 (Kryptografie, jetzt **zwei**
  Schlüsselräume: `identity` + `device`), A.5.15/A.8.3 (spaltenscharfe
  DB-Zugriffssteuerung, neu gegenüber ADR-0008).

**Zusätzliche Compliance-Items aus dem Phase-2-Review (bleiben „offen/
proposed", an `compliance-director` weiterzureichen — s. auch §31):**

- **TD-4 — `device.schluessel` erbt ADR-0009 §2.7-Verpflichtungen:**
  echter Cloud-KMS-Adapter, Lösung des „KMS-Roundtrip-in-offener-Tx"-
  Problems (bereits in `key-management.port.ts` als offener Punkt notiert),
  DB-`SECURITY DEFINER`-Shred-Gate als **bindende Vorbedingung vor
  Produktivbestand** (wie für `identity.subjekt_schluessel`, ADR-0009 §2.7),
  rollen-getrenntes Grant-Modell `identity`/`energy`/`device`. Der neue
  `DeviceKryptoShreddingService` ist ein **weiterer irreversibler
  Shred-Pfad** mit demselben App-Layer-only-Restvorbehalt (Controller-
  Bypass über die breite `edms_app`-Rolle bleibt in v1 möglich) — **braucht
  denselben Risiko-Register-Eintrag** wie der bestehende Personen-Shred-Pfad
  (ADR-0009, Restrisiko-Eintrag).
- **TD-9 / SEC — O4-Audit-Granularität, compliance-director-verbindlich:**
  die Drei-Wege-Aufteilung (Provisioning voll auditiert / Reverse-Read
  break-glass-auditiert / Worker-Vorwärts-Lookup ohne Einzel-Audit-Event,
  §26.4) ist **meine Interpretation** der O4-Vorgabe „Audit auf jede
  Auflösung" — bleibt **„proposed"**, bis `compliance-director` diese
  Aufteilung **wörtlich bestätigt**. `security-lead`-Votum: **akzeptabel
  unter vier Bedingungen** — scharfes Orphan-/Ausfall-Alerting als
  detektive Ersatzkontrolle; wörtliche compliance-director-Bestätigung;
  DB-Grants durchlaufen Migration-Review + periodischen Zugriffsreview
  (ISO A.5.18); Metriken ohne Geräte-Kardinalität (SEC-6).
- **SEC-5 — `read:geraet_zuordnung` eigenständige break-glass-Härtung:**
  eigene eng geschnittene Rolle (nicht pauschal `betrieb`), Begründungs-/
  Ticket-Pflicht, eigene Zweck-Whitelist, **Punkt-Auflösung** statt
  Zeitraum-Semantik (≤ 24–48 h Token-Gültigkeit statt `MAX_FENSTER_
  TAGE=7`), Echtzeit-Alert bei jedem `permit`, periodischer Audit-Review
  (§26.4) — eigenständig gegenüber der `read:verbrauch_detail`-Härtung
  (ADR-0008 §16), da Punkt- ≠ Zeitraum-Zugriff.
- **SEC-9 — Linkability-Restrisiko des deterministischen Blind-Index:**
  ein DB-Leser kann **ohne** Entschlüsselung erkennen, dass dasselbe
  physische Gerät zwischen Zählern/Kunden gewandert ist (Blind-Index-
  Gleichheit über mehrere historische Zeilen hinweg). **Keine
  Design-Korrektur nötig** — Härtung erfolgt über die bereits beschlossene
  strenge DB-Zugriffsbeschränkung (§26.4); **DSFA-0001-§3.6-Nachtrag**
  (Risiko 3.4, Re-Identifizierung via Quasi-Identifier) hat diesen
  Restrisiko-Aspekt explizit aufzunehmen.
- **SEC-4 — Dual-Control für `EDMS_INGEST_BROKER_MODE=real`:** das
  Freigabeartefakt (§19) liegt **außerhalb** des Schreibzugriffs der
  Deploy-Pipeline (`compliance-director`-kontrollierter Secret-/Config-
  Pfad); CI/CD verifiziert **dagegen**, verändert es aber nie selbst; die
  PR-Umschaltung auf `real` erfordert **zwei getrennte Approvals** (DevOps +
  Compliance) via Branch-Protection/CODEOWNERS.
- **SEC-3 — Mosquitto-Persistenz-Härtung:** `persistence_location`-Volume
  **Verschlüsselung-at-Rest**, `max_queued_messages`/`max_queued_bytes`
  (Speicher-/Backpressure-Begrenzung) und **Message-Expiry** (verhindert
  unbegrenztes Anwachsen des Offline-Puffers, §15).
- **TOM-Sammlung Phase 3 (Zusammenfassung, Owner gemischt):**
  Pepper-Verwaltung (SEC-8); Mosquitto-Logging (`log_type error warning
  notice`, kein `debug`, §14); DB-Rollen-Matrix **review-pflichtig durch
  `database-lead` UND `security-lead` gemeinsam** + periodische
  Grant-Review (DB-5, TD-9/SEC-Bedingung iii); Metrik-Hygiene (SEC-6);
  MQTT-Debug-Logging aus (SEC-7).

**Harte Regel (unverändert):** kein Schreibzugriff auf `compliance/**` in
diesem Paket.

## 33. Folgeaufgaben (Teil B)

- [ ] Konsolidierung der Review-Rückmeldungen (`technical-director`/
      `security-lead`/`timescale-engineer`/`database-lead`) in einem
      Änderungsprotokoll (analog ADR-0008 §30), danach User-Freigabe.
- [ ] Nach Freigabe: Phase 3 (`compliance-director`/`dsgvo-auditor`/
      `iso27001-auditor`) — §32.
- [ ] Nach Phase 3: Phase 4 — Migration(en) ab V0010 (§28), Worker-
      Implementierung (`iot-ingestion-engineer`), Dev-Compose-Erweiterung
      Mosquitto + synthetischer Publisher (`devops-lead`).

---

## 34. Fortschreibung 2026-09-08 — Datenquellen-Verwaltung in der Plattform (V0059/V0060/V0061)

- **Status:** accepted — Freigabe durch den User (2026-09-08), umgesetzt in
  V0059 (`ingest.quelle`), V0060 (Audit-Ereignisse), V0061
  (Zertifikats-Gültigkeit).
- **Betrifft:** §17 (D5 — MQTT-TLS & Credentials).

### Anlass

§17 legte fest, dass Broker-Zugangsdaten und Zertifikate **ausschließlich**
aus ENV/Secrets kommen. Das war für einen Worker richtig gedacht, der auf
einer Maschine läuft, zu der der Betreiber Zugang hat.

Im Betrieb zeigte sich der Bruch: Wer ein neues Netz anbindet, sitzt nicht
auf dieser Maschine. Eine Datenquelle entstand deshalb ausschließlich
dadurch, dass jemand vier Umgebungsvariablen setzte und den Prozess neu
startete — in der Plattform ließ sich weder eine anlegen noch ansehen, **was**
konfiguriert ist. `ingest.quelle_status` (V0039) ist der Laufzeit-Spiegel des
Workers, keine Konfiguration. Ein Zertifikat über eine Umgebungsvariable zu
reichen ist zudem unpraktisch genug, dass es in der Praxis unterbleibt.

### Entscheidung

Die Konfiguration einer Datenquelle wird in der Plattform gepflegt
(`ingest.quelle`), **einschließlich** Benutzername, Passwort und
Client-Zertifikat samt privatem Schlüssel.

Die drei Verbote aus §17 gelten unverändert: **nie** im Code, **nie** im
Repo, **nie** in Logs. Sie sind der Schutzzweck; die ENV-Bindung war nur ein
Mittel dazu und wird durch ein anderes ersetzt:

1. **Kein Geheimnis im Klartext.** Benutzername, Passwort und privater
   Schlüssel stehen ausschließlich als Chiffrat (AES-256-GCM, DEK je Quelle,
   selbst gewrappt — Muster §26.3). Es gibt keine Spalte, in die ein
   Klartext-Geheimnis passte.
2. **AAD-Bindung an `(quelle_id, feldname)`.** Ein Chiffrat aus einer anderen
   Quelle oder einem anderen Feld entschlüsselt nicht; Umhängen fällt auf.
3. **Kein Rückweg über die API.** Geheimnisse verlassen die Datenbank nur
   Richtung Ingest-Worker. Die API gibt sie nie aus — auch nicht maskiert
   (verriete Länge und Ränder) und nicht gehasht (wäre ein Orakel für
   schwache Passwörter). Ausgegeben wird nur, **welche** Felder belegt sind.
4. **Der Worker liest nur.** V0059 erteilt `edms_ingest_worker` ausschließlich
   `SELECT`. Ein Prozess, der Uplinks aus dem Netz entgegennimmt, kann seine
   eigene Konfiguration nicht ändern.
5. **`broker_host` bleibt frei von Zugangsdaten** (`CHECK … NOT LIKE '%@%'`,
   übernommen aus V0039) — DTO-Validierung davor, damit daraus eine
   verständliche 400 wird statt einer 500.
6. **Protokollpflicht.** V0060 führt `quelle.ingest.angelegt`,
   `.geaendert` und — bewusst getrennt — `.zugangsdaten_hinterlegt`. Die
   Frage „wer hat wann welches Geheimnis hinterlegt" muss ohne Auslegung der
   übrigen Änderungen beantwortbar sein. Der Kontext führt ausschließlich
   FELDNAMEN.

### Warum nicht bei ENV/Secrets bleiben?

Geprüft und verworfen wurde die Variante „Referenz in der Datenbank, Geheimnis
in der Umgebung". Sie hätte §17 wörtlich gewahrt, den Bruch aber nur
verschoben: Das Anlegen einer Quelle wäre weiterhin an einen Eingriff auf der
Worker-Maschine gebunden gewesen, und der Betrieb hätte zwei Orte pflegen
müssen, die auseinanderlaufen können. Die Entscheidung fiel bewusst gegen die
wörtliche Wahrung und für den durchgängigen Ablauf — mit den sechs
Härtungen oben als Gegengewicht.

### Konsequenzen

- **Neues Schutzgut in der Datenbank.** `ingest.quelle` enthält Geheimnisse,
  die es dort vorher nicht gab. Ein Datenbank-Backup trägt sie mit; ohne die
  KMS-Schlüssel sind sie wertlos, mit ihnen nicht. Backup- und
  Schlüssel-Ablage gehören damit getrennt (ISO 27001 A.8.24).
- **Der Worker braucht Krypto.** `IngestMqttModule` importiert seit V0059
  `CryptoModule` — die zuvor bewusst vermiedene Abhängigkeit ist jetzt
  Voraussetzung des Verbindungsaufbaus.
- **Reihenfolge der Konfigurationsquellen** (`IngestQuelleKonfigService`):
  gepflegte Quelle → sonst ENV (wie vor V0059, damit ein Upgrade bestehende
  Installationen nicht stilllegt) → **Fehlstart**, wenn die gepflegte Quelle
  auf `inaktiv` steht. Ein stiller Rückfall auf ENV **trotz** gepflegter
  Quelle wäre die schlechteste Variante: Der Worker liefe gegen einen anderen
  Broker als den, der in der Oberfläche steht.

### Was „Rotation" hier genau meint (2026-09-08 geklärt)

Der Restpunkt aus §17 hieß bis hierher pauschal „Rotation". Das sind
tatsächlich **fünf verschiedene Dinge** auf drei Ebenen, mit verschiedenen
Treibern und verschiedenen Ownern — sie zusammenzufassen hat die Lücke eher
verdeckt als benannt:

| # | Was | Treiber | Stand |
|---|---|---|---|
| 1 | **Client-Zertifikat + privater Schlüssel** | §17: ≤ 90 Tage | Ersetzen über die Oberfläche möglich, Ablauf-Warnung steht (V0061). **Offen:** der organisatorische Ablauf (wer beschafft, wer spielt ein, wie belegt) |
| 2 | **Broker-Passwort** | nur Dev-Fallback (§17) | Ersetzen möglich. Produktiv gar nicht zulässig, daher kein Turnus nötig |
| 3 | **CA-Zertifikat** | Broker-Betreiber | Wird eingespielt, nicht von uns rotiert. Ablauf wird mit überwacht (V0061) |
| 4 | **DEK je Quelle** (`ingest.quelle_schluessel`) | Krypto-Hygiene | **Kein Mechanismus.** `alg_version` ist als Voraussetzung da |
| 5 | **KMS-Master-Key** | Krypto-Hygiene, ISO 27001 A.8.24 | **Kein Mechanismus** — und zwar systemweit, nicht nur hier |

**Punkt 4 und 5 sind KEIN Ingest-Thema.** Derselbe fehlende Mechanismus
betrifft `identity.subjekt_schluessel` (Endkunden-PII), `device.schluessel`
(DevEUI) und den Blind-Index-Pepper. Sie stehen hier nur, weil sie beim
Klären von §17 auffielen; ihr Ort ist ein eigener Entwurf durch
`security-lead`, **bevor** das System echte Daten sieht. Bis dahin gilt: Ein
kompromittierter Master-Key macht jedes Chiffrat im Bestand lesbar, und es
gibt keinen Weg, ihn zu wechseln, ohne die Daten neu zu verschlüsseln.

**Punkt 2 und 3 sind erledigt** — für 2 gibt es nichts zu regeln (produktiv
unzulässig), für 3 ist die Überwachung eingebaut.

### Die Neustart-Lücke (2026-09-08 sichtbar gemacht)

Beim Klären fiel eine Lücke auf, die schwerer wiegt als der Turnus: Der
Worker liest seine Konfiguration **nur beim Start**. Ein neu eingespieltes
Zertifikat greift erst nach einem Neustart. Bei 90-Tage-Zertifikaten heißt
das planbar viermal im Jahr Neustart — und wenn den jemand vergisst, läuft
das alte ab, obwohl das neue längst hinterlegt ist. Die Oberfläche zeigte
dann „gültig bis …", während der Broker die Verbindung schon verweigert.
**Die Anzeige hätte gelogen.**

Behoben ist die Sichtbarkeit, nicht der Neustart: Die Betriebssicht
vergleicht, was der laufende Prozess gemeldet hat (`ingest.quelle_status`),
mit dem, was gepflegt ist (`ingest.quelle`), und benennt drei Fälle —
Prozess ohne gepflegte Quelle, Prozess trotz deaktivierter Quelle, und
abweichende Felder (`brokerHost`/`topic`/`clientId`). Kein Neuladen zur
Laufzeit: Ein Reconnect im laufenden Betrieb greift in Session-Handling,
QoS-1-Zustellung und Backoff ein — das ist ein eigener Entwurf und nichts,
was man nebenbei einbaut, während die Kette gerade zuverlässig läuft.

**Offen bleibt damit:** ein Neuladen zur Laufzeit ODER ein bewusst
festgelegter Neustart-Rhythmus, der zur Zertifikats-Laufzeit passt
(`devops-lead`).

### Auflagen

- **Ablauf-Überwachung (erledigt, V0061):** `ingest.quelle` führt je
  Zertifikat ein `gueltig_bis`, das beim Einspielen aus dem PEM gelesen wird.
  Die Betriebssicht warnt vor Ablauf; ein bereits abgelaufenes Zertifikat wird
  beim Anlegen abgewiesen. Grund: Ein ablaufendes Zertifikat legt die
  Datenaufnahme still, und zwar lautlos — dieselbe Fehlerart, die in diesem
  Modul schon zweimal Wochen gekostet hat.
- **Rotation (aufgeschlüsselt, s. Tabelle oben):** Punkt 1 bleibt als
  organisatorischer Ablauf offen (`devops-lead`), Punkt 4 und 5 gehören in
  einen eigenen Entwurf durch `security-lead` — systemweit, nicht nur für die
  Ingest-Quellen. Beides gebunden an den Real-Ingest-Gate-Umschaltpunkt.
- **Neustart-Rhythmus oder Neuladen zur Laufzeit (offen, `devops-lead`):**
  s. Abschnitt „Die Neustart-Lücke".
- **Vor Real-Ingest weiterhin gültig:** TLS 1.3 exklusiv, mTLS,
  Cipher-Whitelist, Client-Zertifikat ≤ 90 Tage (§17, §31 SA-3). Die
  Verwaltung erleichtert das Einspielen, ersetzt aber keine dieser Auflagen.
