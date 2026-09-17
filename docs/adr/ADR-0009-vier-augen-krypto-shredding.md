# ADR-0009: Vier-Augen-/Freigabe-Kontrolle für Krypto-Shredding (Endkunde, Art. 17 DSGVO)

- **Status:** **accepted** — mit dokumentierten Bedingungen (Auflagen/Findings unten; **kein Freibrief** zur Umsetzung ohne deren Erfüllung, insb. §6/§8)
- **Datum:** 2026-07-15
- **Autor:** access-control-engineer
- **Reviewer:** `compliance-director` — **freigegeben, kein Veto, sieben Auflagen** (2026-07-15, s. §5); `technical-director` — **architektonisch tragfähig, drei Findings P1–P3 eingearbeitet** (2026-07-15, s. §2.3/§2.7, weitere Impl.-Constraints §6); `security-lead` (Fenster-Wert final, DB-Gate-Vorbedingung mitzeichnen, s. §8)
- **Freigabe:** User — Grundentscheidungen (Option A, Freigeber-Modell, Entfernung des Direkt-Endpoints, v1-Tiefe) am 2026-07-15 bestätigt (s. Entwurfsbericht access-control-engineer). **Beide Direktoren haben ADR-0009 am 2026-07-15 freigegeben**: `compliance-director` ohne Veto mit sieben Auflagen (§5), `technical-director` mit drei Findings P1–P3 — **P1 (ehrliches v1-Framing, §2.7) ist die wichtigste Korrektur**: die ursprüngliche Formulierung „App-Layer-ABAC + DB-CHECK = belastbare Kontrolle" war zu optimistisch und wurde ersetzt. Status damit **accepted**, Umsetzung an die Erfüllung der Auflagen gebunden (insb. DB-Gate als bindende Vorbedingung vor Produktivbestand, §2.7; Audit-Atomarität fail-closed, §2.3).
- **Bezug:** ADR-0008 §19 (D7-Review-Nachtrag „Finding B" — Fehlreferenz „§21" korrigiert, s. §1), §29 Folgeauftrag C4; ADR-0003 Anhang (`audit.retention_freigabe`/`audit.retention_drop()`-Präzedenzfall)
- **Workflow:** Folgeauftrag aus ADR-0008 §29(C4) — kein `/new-feature`-Neustart, kein neues Schema/keine Migration/keine Implementierung in diesem Dokument

> **Reifegrad-Hinweis.** Dies ist ein **Design-Dokument** (Phase 2, technische Entscheidung). Es enthält **keine SQL-Migration und keinen Code** — Tabellen-/Spalten-/Endpoint-Beschreibungen sind Entwurfsskizzen für die nachfolgende Impl.-Phase (`/add-migration`, `/api-design`, `/implement-endpoint`), keine ausführbaren Artefakte. **Nächster Schritt (nach erfolgter Freigabe):** Erfüllung der Auflagen (§5) und Impl.-Constraints (§6) gemäß der Reihenfolge in §7, beginnend mit den compliance-/security-lead-Festlegungen (Fenster-Wert, Ablehnungsgrund-Vokabular), danach `database-lead`-Migrationsentwurf `V0008`, `audit-trail-engineer`-Katalog-Nachtrag `V0009`, dann Backend-/Frontend-Implementierung.

---

## 1. Kontext

Krypto-Shredding (Art. 17 DSGVO) ist der einzige Weg, mit dem das EDMS personenbezogene Endkunden-Stammdaten unwiderruflich unlesbar macht: `KryptoShreddingService.shred()` vernichtet den per-Subjekt-DEK (`identity.subjekt_schluessel.key_state='geschreddert'`), `EndkundeService.shred()` orchestriert zusätzlich die Neutralisierung der PII-Zeile und `energy.endkunde.verarbeitungs_status='geloescht'` (`src/backend/src/stammdaten/crypto/krypto-shredding.service.ts`, `src/backend/src/stammdaten/endkunde/endkunde.service.ts`). Der Vorgang ist **strukturell unumkehrbar** (Un-Wrap nach Vernichtung des `wrapped_dek` unmöglich) und ist damit der höchstfolgenreichste Schreibpfad im System.

**Ist-Zustand (unzureichend).** Der Endpoint `POST /stammdaten/endkunden/{endkundeId}/kryptoshredding` (`src/backend/src/stammdaten/endkunde/endkunde.controller.ts`) trägt aktuell nur `@Roles('betrieb')` + `@Fachaktion('shred:endkunde')`. Jede einzelne Person mit der breiten `betrieb`-Rolle kann diesen irreversiblen Vorgang **allein** auslösen. Der bestehende Fehlbedien-Schutz (`KryptoShreddingAnweisungDto`: `bestaetigung==='ENDGUELTIG_LOESCHEN'` + whitelisted `grund`; FE: Type-to-confirm-`ConfirmDialog` in `EndkundeShreddenAktion`) schützt vor dem versehentlichen Klick **einer** Person — nicht vor einer böswilligen oder fehlerhaften **Einzelentscheidung**. Genau diese Lücke soll diese ADR schließen.

**Auftrag.** ADR-0008 §19 (D7-Review-Nachtrag, „Finding B", `access-control-engineer`) hält fest: „Das irreversible Krypto-Shredding läuft nicht allein über `@Roles('betrieb')`, sondern bekommt eine eigene, strengere ABAC-Regel (Vier-Augen-/Freigabe-Prinzip)." Als Folgeauftrag **C4** in §29(C) verbucht.

**Grounding-Korrektur.** ADR-0008 selbst (Zeile 828) sowie die Migration `migrations/V0006__seed_stammdaten_event_typen.sql` (Kommentare Zeilen 209, 369, 376) referenzieren dieses Finding fälschlich als „**§21** Finding B". Tatsächlich steht der Text in **§19** (D7 — Feld-Verschlüsselung, `KeyManagementPort`, Krypto-Shredding); §21 ist D9 („Ein Domänen-Contract statt je-Ressource-Split") und thematisch unverwandt. Diese ADR verwendet durchgängig die korrekte Referenz §19. Die Fehlreferenz wird hier benannt, aber nicht rückwirkend in V0006 korrigiert (kein Migrations-Schreibzugriff in diesem Auftrag — optionale Folgeaufgabe für `audit-trail-engineer`).

**Bereits vorhandener Präzedenzfall.** `migrations/V0003__audit_log_schema.sql` (Zeilen 320-351) enthält, unabhängig von diesem Auftrag entstanden, `audit.retention_freigabe` — eine **Vier-Augen-Kontrolltabelle** für den Retention-Sonderpfad (`drop_chunks` auf `audit.event`): Spalten `antragsteller`/`freigeber` (opake `sub`-Werte, kein FK), `status` (`offen|freigegeben|ausgefuehrt`), `CONSTRAINT ck_freigabe_vier_augen CHECK (freigeber IS NULL OR freigeber <> antragsteller)`, und eine `SECURITY DEFINER`-Gate-Funktion `audit.retention_drop()` als einziger Ausführungspfad (prüft Vier-Augen **nochmals** auf DB-Ebene, bevor sie ausführt). Dieser Fund ist der Ausgangspunkt für das Datenmodell in §2.1 — das Vier-Augen-Muster muss für Krypto-Shredding nicht erfunden, sondern gespiegelt werden.

**Rollen-Realität.** Es existieren genau drei Rollen: `betrieb`, `compliance-auditor`, `admin` (`src/backend/src/common/security/app-role.ts`). `compliance-auditor` ist über eine **ausnahmslose** PDP-Regel (`InCodePolicyAdapter.evaluate()`, `src/backend/src/auth/policy/in-code-policy.adapter.ts`, Zeilen 43-45) von jeder Nicht-Read-Aktion ausgeschlossen — das war der schwerste PDP-Fund der ADR-0008-Phase-4-Review und ist bewusst ohne Ausnahme gebaut („Auditor bleibt strikt lesend, auch ABAC-seitig, Defense-in-Depth").

## 2. Entscheidung

**Gewählt: Option A — asynchroner, persistierter Antrag→Freigabe-Workflow**, im Datenmodell gespiegelt an `audit.retention_freigabe`. Freigeber-Modell: erzwungen wird ausschließlich **Freigeber-`sub` ≠ Antragsteller-`sub`** — beide Personen halten weiterhin dieselbe Rolle `betrieb` (keine neue Rolle, kein DS-01-Konflikt, keine Keycloak-Änderung). Der bestehende Direkt-Endpoint wird **entfernt**, nicht deprecatet (Begründung §2.4). v1-Tiefe: App-Layer-ABAC + DB-`CHECK`-Constraint — **korrigiertes Framing (technical-director Finding P1, s. §2.7): v1 ist effektiv App-Layer-only**, der `CHECK` ist ein Integritäts-Guard, kein Sicherheits-Backstop. Die DB-`SECURITY DEFINER`-Gate-Funktion (analog `audit.retention_drop()`) ist **kein** v1-Bestandteil, aber **bindende Vorbedingung vor Produktivbestand** (nicht mehr nur Folgeausbau, s. §2.7).

### 2.1 Datenmodell

Neue Tabelle **`energy.endkunde_shred_antrag`**. Namensraum-Begründung: die Tabelle trägt ausschließlich Pseudonym-Referenzen (`endkunde_id`) und whitelisted Metadaten (Status, Grund, opake `sub`-Werte) — **keine PII** — und bleibt damit konsistent mit der Linie-5-Namensraum-Trennung (`identity` = PII, `energy` = Pseudonym-Anker + Fachdaten, ADR-0004 §11/§12; ADR-0008 §20/D8).

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | `uuid` (PK, v7) | Antrags-ID |
| `endkunde_id` | `uuid NOT NULL` | `REFERENCES energy.endkunde(id)` |
| `grund` | `text NOT NULL` | whitelisted, **wiederverwendet** `KryptoShreddingGrund` (`betroffenenantrag_art17\|aufbewahrung_abgelaufen\|sonstige_rechtsgrundlage`, s. `krypto-shredding-anweisung.dto.ts`) |
| `status` | `text NOT NULL DEFAULT 'beantragt'` | `beantragt\|freigegeben\|abgelehnt\|ausgefuehrt\|abgelaufen` |
| `beantragt_von_sub` | `text NOT NULL` | opaker Principal (kein FK) — analog `audit.event.actor_sub`/`audit.retention_freigabe.antragsteller` |
| `beantragt_am` | `timestamptz NOT NULL DEFAULT now()` | |
| `gueltig_bis` | `timestamptz NOT NULL` | `beantragt_am + Frist` — Frist **provisorisch: Vorschlag 7 Tage** (analog `MAX_FENSTER_TAGE` break-glass, ADR-0008 §16; kompatibel mit der Art.-12(3)-Monatsfrist für Betroffenenanträge), final `security-lead`/`compliance-director` (compliance-director-Auflage, s. §5/§8) |
| `freigeber_sub` | `text` (nullable) | opaker Principal, gesetzt bei Freigabe/Ablehnung |
| `entschieden_am` | `timestamptz` (nullable) | Zeitpunkt der Freigabe- **oder** Ablehnungsentscheidung |
| `ablehnungsgrund` | `text` (nullable) | whitelisted, **PROVISORISCHE v1-Liste** (compliance-director-Auflage): `kein_rechtsgrund\|endkunde_widerspruch\|fehlbedienung\|sonstiges` — final `access-control-engineer`/`compliance-director` (s. §8) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Standard-Konvention |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Trigger `energy.set_updated_at()` (bereits vorhanden, `migrations/V0002__kern_datenmodell_energie.sql:362`) — Ergänzung über die reine Antrag/Freigabe-Skizze hinaus, analog der dokumentierten Abweichung bei `audit.retention_freigabe` |

Constraints:
- **`CHECK (freigeber_sub IS NULL OR freigeber_sub <> beantragt_von_sub)`** — 1:1 aus `ck_freigabe_vier_augen` (`audit.retention_freigabe`) übernommen. DB-Ebene als Minimalschutz zusätzlich zur App-Layer-ABAC-Prüfung (Defense-in-Depth).
- `CHECK (status IN ('beantragt','freigegeben','abgelehnt','ausgefuehrt','abgelaufen'))`.
- **Pflicht** (hochgestuft von ursprünglicher Empfehlung — **compliance-director-Auflage**, s. §5): partieller Unique-Index, der **höchstens einen** offenen (`status='beantragt'`) Antrag je `endkunde_id` zulässt — verhindert widersprüchliche Parallel-Anträge. **Impl.-Constraint (technical-director, s. §6 Idempotency-Key-Semantik):** ein Retry desselben, bereits erfolgreich gestellten Antrags (gleicher `Idempotency-Key`) darf **nicht** gegen diesen Index laufen und einen 500er auslösen — der Antrags-Endpoint muss den Idempotency-Replay-Fall vor dem Insert erkennen.

**Zustandsübergänge.** `beantragt` → (Freigeben durch zweite Person) → `ausgefuehrt`; `beantragt` → `abgelehnt` (durch zweite Person, terminal, Antragsteller kann erneut beantragen); `beantragt` → `abgelaufen` (`gueltig_bis` überschritten, terminal). **Impl.-Freiheitsgrad, nicht Teil der engeren Entscheidung:** ob „Freigeben" und „Ausführen" atomar in einem Request/einer Transaktion gekoppelt werden (Empfehlung dieser ADR — ein zusätzlicher, zeitlich entkoppelter Ausführen-Schritt öffnet ein weiteres Zeitfenster zwischen Entscheidung und Löschung, ohne zusätzlichen Sicherheitsgewinn, da die Vier-Augen-Prüfung bereits am Freigabe-Zeitpunkt vollständig erfüllt ist) oder ob ein separater, zeitlich entkoppelter Ausführen-Schritt eingeführt wird, ist eine Impl.-Entscheidung (s. offener Punkt §8). Der Wert `freigegeben` bleibt im Vokabular für begriffliche Konsistenz mit `audit.retention_freigabe`, unabhängig davon, ob er im Betrieb je als eigenständig sichtbarer Zwischenzustand persistiert wird. **TOCTOU-Constraint (technical-director, s. §6):** die tatsächliche Transitions-Autorität ist im Service-Layer per Zeilen-Lock/Affected-Rows-Check zu erzwingen, **nicht** die vorgelagerte PDP-Statusprüfung (die kann veraltet sein).

### 2.2 ABAC

**Neue `PolicyAction`en** (`src/backend/src/auth/policy/policy-decision-port.ts`): `shred:endkunde:freigeben` sowie `shred:endkunde:ablehnen` — **beide bestätigt** (ursprünglich war Letztere nur als Vorschlag markiert; **compliance-director-Auflage** bestätigt sie ausdrücklich als eigene `PolicyAction`, s. §5), gleiche Distinctness-Regel, symmetrisch zu „Freigeben". Die bestehende `shred:endkunde`-Aktion bleibt unverändert für den harmlosen „Antrag stellen"-Schritt (dort ändert sich am RBAC-/ABAC-Gate nichts).

**Neues `ResourceAttributes`-Feld**: `shredAntrag?: { beantragtVonSub: string; status: 'beantragt' | 'freigegeben' | 'abgelehnt' | 'ausgefuehrt' | 'abgelaufen' }` — analog zu `zugriffszweck` (break-glass, §16/D4 in ADR-0008). Aufgelöst durch eine neue Zweig in `StammdatenResourceAttributesProvider` (`src/backend/src/stammdaten/policy/stammdaten-resource-attributes.provider.ts`) für `params['antragId']`, mit **höchster Priorität** in der bestehenden Auflösungs-Kaskade (spezifischster Pfad-Parameter zuerst, analog `nutzungsverhaeltnisId > anschlussnutzerId > … > endkundeId`).

**`InCodePolicyAdapter`-Erweiterung** (`src/backend/src/auth/policy/in-code-policy.adapter.ts`): ein neuer, **deny-by-default**-Zweig für `shred:endkunde:freigeben`/`shred:endkunde:ablehnen`, platziert **vor** dem generischen Permit-Fallback (verbindliche Prüfreihenfolge, analog break-glass §16):
1. `resource===undefined` oder `resource.shredAntrag===undefined` → `deny` (`shred_antrag_ungueltig`).
2. `resource.shredAntrag.status !== 'beantragt'` → `deny` (`shred_antrag_ungueltig` — bereits entschieden/abgelaufen).
3. `resource.shredAntrag.beantragtVonSub === subject.sub` → `deny` (`vier_augen_selbstfreigabe_verboten`).
4. sonst → `permit`.

**Neue `PolicyDenyReason`-Werte** (kein Freitext, rote Linie 2): `vier_augen_selbstfreigabe_verboten`, `shred_antrag_ungueltig`.

**Wichtige Bestätigung ohne Code-Änderung:** Die DS-01-Verstärkung (`compliance-auditor` + Nicht-Read → `deny`) prüft bereits **zuerst**, unabhängig von diesem Entwurf, und `classifyAction()` (`src/backend/src/auth/policy/classify-action.ts`) klassifiziert `shred:endkunde:freigeben`/`:ablehnen` über den Präfix-Test `action.startsWith('shred')` automatisch als Kategorie `shred` (≠ `read`) — **kein Anpassungsbedarf** an `classifyAction()`. `compliance-auditor` ist für die neuen Aktionen also bereits durch die bestehende, unveränderte Härtung abgedeckt.

### 2.3 Audit-Katalog — Ordering & Katalog-SCD2 (technical-director Findings P2/P3, verbindlich)

Neue Codes (Konvention `domaene.objekt.verb`, `src/backend/src/stammdaten/audit/stammdaten-audit-events.ts`): `endkunde.stammdaten.shred_beantragt`, `endkunde.stammdaten.shred_freigegeben`, `endkunde.stammdaten.shred_abgelehnt`. Das bestehende `endkunde.stammdaten.geschreddert` bleibt der Code für die tatsächliche Ausführung. Alle vier Codes: `rolle_erfassen=true` (konsistent mit der bereits für `geschreddert` getroffenen Begründung — hochfolgenreicher, irreversibler Vorgang, Rechenschaft überwiegt Datensparsamkeit). `erlaubte_kontext_keys` für die drei neuen Codes mindestens `synthetic` (PII-nahe Route, bestehende Konvention) und `antrag_id` (verlinkt die Ereignisse über den Zwei-Akteure-Fluss, analog `kontext.version_nr` bei `messkonzept.version.angelegt`). `objekt_ref` = Endkunde-UUID (konsistent mit den übrigen `endkunde.*`-Codes).

**Finding P3 — Katalog-SCD2-Pflicht für `geschreddert` (verbindlich für `V0009`).** Die bestehende Katalog-Version von `endkunde.stammdaten.geschreddert` (`V0006`) erlaubt ausschließlich `erlaubte_kontext_keys=['synthetic']` — **kein** `antrag_id`. Da die Ausführung künftig aus dem Vier-Augen-Fluss heraus erfolgt und `kontext.antrag_id` zur Verlinkung mit `shred_freigegeben` benötigt wird, **muss** `V0009` (append-only-SCD2-Muster von `audit.event_typ_version`, `migrations/V0003__audit_log_schema.sql`) zusätzlich zu den drei neuen Codes **eine neue `event_typ_version`-Zeile für `geschreddert`** anlegen mit `erlaubte_kontext_keys=['synthetic','antrag_id']`, während die Vorgänger-Version (`V0006`) per `gueltig_bis=now()` geschlossen wird — **kein Edit der bestehenden Zeile** (append-only, Linie 4 des Audit-Log-Modells). Die zugehörige `.down.sql` macht diesen Schritt spiegelbildlich rückgängig: neue Zeile löschen, `gueltig_bis` der Vorgänger-Version wieder auf `NULL` restaurieren.

**Finding P2 — Reihenfolge/Atomarität der Ausführung (verbindlich).** `@AuditAction` (`src/backend/src/common/decorators/audit-action.decorator.ts`) emittiert **nach** dem Handler-Rückgabewert. Ein zusätzlicher, manueller `AuditService.append(...)`-Aufruf **während** der Handler-Ausführung (also vor dem Decorator-Emit) würde `geschreddert` eine **niedrigere** `seq` in der Hash-Kette geben als `shred_freigegeben`, obwohl `shred_freigegeben` logisch zuerst geschieht — eine Reihenfolge-Inversion im append-only-Log. **Festgelegt:** Auf der `freigeben`-Route werden **beide** Ereignisse **manuell** über `AuditService.append(...)` **im Service** erzeugt, in **logischer Reihenfolge** (`shred_freigegeben` **zuerst**, danach `geschreddert`), **innerhalb derselben Transaktion** wie die Fach-Mutation (`@Transactional(Propagation.Nested)`-Klammer, analog zum bestehenden Endkunde-Muster, ADR-0008 §20). Der `@AuditAction`-Decorator wird auf dieser Route **weggelassen** bzw. **nur als Denied-Safety-Net** eingesetzt (dokumentierte Ausnahme — Vorbild: ADR-0008 §17 hält bereits fest, dass nicht jede Route zwingend über `@AuditAction` läuft; hier gilt die Ausnahme, weil die Route selbst zwei geordnete, ordnungskritische Ereignisse statt eines einzigen erzeugt, nicht weil auf Auditierung verzichtet wird). `shred_beantragt`/`shred_abgelehnt` bleiben regulär über `@AuditAction` (ein Ereignis pro Route, kein Ordering-Konflikt).

Migrationsnummerierung (Vorschlag, kein verbindlicher Claim): `V0008` für die neue Tabelle, `V0009` für den Audit-Katalog-Seed (drei neue Codes **plus** SCD2-Nachtrag für `geschreddert`, s. o.) — Trennung Schema/Katalog konsistent mit dem bereits etablierten Muster V0005/V0006.

### 2.4 API-Contract & Entfernung des Direkt-Endpoints

Neue Endpoints (`schemas/openapi/stammdaten.openapi.yaml`, ein Domänen-Contract lt. ADR-0008 §21/D9):
- `POST /stammdaten/endkunden/{endkundeId}/shred-antraege` — `@Roles('betrieb')`, `@Fachaktion('shred:endkunde')` (unverändert), Body = bestehendes `KryptoShreddingAnweisungDto`, `Idempotency-Key` Pflicht, `201` mit Antrag (`id`, `status`, `gueltigBis`).
- `GET /stammdaten/endkunden/{endkundeId}/shred-antraege` — `@Roles('betrieb','compliance-auditor')`, `@Fachaktion('read:stammdaten')`, Cursor-paginierte Liste (offene + historische Anträge).
- `POST .../shred-antraege/{antragId}/freigeben` — `@Roles('betrieb')`, `@Fachaktion('shred:endkunde:freigeben')` (neu), Body: neues DTO mit erneuter, eigenständiger `bestaetigung==='ENDGUELTIG_LOESCHEN'`-Bestätigung (zweite Person bestätigt bewusst über ein **eigenes** Type-to-confirm, nicht durch bloßes Anklicken der Antragsentscheidung), `Idempotency-Key` Pflicht, `200` mit aktualisiertem Antrag + `ShreddingErgebnis`.
- `POST .../shred-antraege/{antragId}/ablehnen` — `@Roles('betrieb')`, `@Fachaktion('shred:endkunde:ablehnen')` (neu, s. §2.2), Body: whitelisted `ablehnungsgrund`, `Idempotency-Key` Pflicht.
- **Entfernt:** `POST /stammdaten/endkunden/{endkundeId}/kryptoshredding`.
- Fehlerformat weiterhin `application/problem+json` (RFC 9457); `403` bei ABAC-Deny (Detail = whitelisted Deny-Reason, kein Freitext); `409` bei ungültigem Status-Übergang (z. B. bereits entschieden/abgelaufen); **404** bei Antrag/Endkunde-Scope-Mismatch (s. §6 Provider-Scoping).
- **Provider-Scoping (technical-director, s. §6):** jede `antragId`-Route verifiziert `antrag.endkunde_id === params.endkundeId` — bei Abweichung `404`, nicht `403` (kein Bestätigen der Existenz eines fremden Antrags unter falscher Endkunde-ID).
- **Idempotency-Key-Semantik (technical-director, s. §6):** ein Retry mit demselben Key liefert den Replay der ursprünglichen `2xx`-Antwort, **nicht** `409`; s. auch §2.1 (partieller Unique-Index darf bei Retry nicht `500` werfen).

**Begründung für Entfernen statt Deprecation** (bewusster Contract-Bruch, Abweichung von `.claude/rules/api-contracts.md` „Breaking Changes: neue Major-Version + Deprecation-Header für 2 Minor"): Ein parallel weiterlaufender Direktpfad während einer Deprecation-Frist würde die gesamte Vier-Augen-Kontrolle für die Dauer der Frist **wirkungslos** machen — jede `betrieb`-Person könnte den alten Pfad weiter nutzen, um die Kontrolle zu umgehen. Da das System ausschließlich **synthetic-only** und **pre-go-live** betrieben wird (ADR-0008 §0/§22 — kein produktiver Konsument existiert), ist ein harter Cutover ohne Deprecation-Fenster hier ausnahmsweise vertretbar. **Diese Ausnahme gilt ausdrücklich nicht mehr, sobald ein produktiver Konsument existiert** — dann wäre ein regulärer Deprecation-Pfad Pflicht. Kein Präzedenzfall für künftige Breaking Changes außerhalb der synthetic-only-Phase.

**SemVer-Waiver (technical-director, dokumentierte Abweichung von der `api-contracts.md`-Wörtlichkeit, s. auch §6).** `schemas/openapi/stammdaten.openapi.yaml` steht aktuell auf `info.version: 0.2.0`. Diese ADR legt **`0.2.0 → 0.3.0`** fest (Minor-Bump), **nicht** `1.0.0`, obwohl der Endpoint-Entfernung nach Wortlaut von `.claude/rules/api-contracts.md` „neue Major-Version" verlangt: solange die Spec `0.x` ist, gilt SemVer selbst als noch nicht stabil („0.x-Minor darf breaking sein") — ein Sprung auf `1.0.0` würde fälschlich Produktiv-/Go-Live-Reife signalisieren, die (synthetic-only, pre-go-live, ADR-0008 §0) explizit nicht gegeben ist. Dies ist ein **expliziter, dokumentierter Waiver** dieser ADR gegenüber der Regel-Wörtlichkeit, kein Präzedenzfall für `1.x`-Contracts.

### 2.5 UI-Implikationen

`EndkundeShreddenAktion` + `ConfirmDialog` (Type-to-confirm, `src/frontend/src/features/stammdaten/components/endkunde/EndkundeShreddenAktion.tsx`) wird zur „Antrag stellen"-Aktion (Zielroute ändert sich, Label-Anpassung, z. B. „Krypto-Shredding beantragen" statt „krypto-schreddern"). Neue Ansicht „Offene Shred-Anträge" mit Freigeben-/Ablehnen-Aktion je Antrag — Freigeben verlangt ebenfalls ein eigenes Type-to-confirm (zweite, eigenständige bewusste Bestätigung, nicht nur ein Klick). UI blendet den Freigeben-Button aus, wenn `beantragt_von_sub === aktuelle Session-sub` — reiner UX-Komfort (`useKannStammdatenAnlegen`-Präzedenzfall: „KEINE Autorisierungsentscheidung", Server erzwingt unabhängig via ABAC, `src/frontend/src/features/stammdaten/hooks/shared/useKannStammdatenAnlegen.ts`). `useEndkundeShreddenView`/`useEndkundeShredding` werden in getrennte Mutations für Antrag/Freigabe/Ablehnung aufgeteilt.

### 2.6 Migrationen (Ausblick — keine SQL in diesem Dokument)

`V0008`: `energy.endkunde_shred_antrag` + Constraints (inkl. **Pflicht**-Unique-Index, §2.1) + `updated_at`-Trigger (Funktion bereits vorhanden). `V0009`: Audit-Katalog-Seed für die drei neuen Codes **plus** SCD2-Nachtrag für `geschreddert` (§2.3). **Beide Migrationen erfordern zwingend Review durch `database-lead` UND `compliance-director`** (nicht optional — compliance-director-Auflage, s. §5), wegen personenbeziehbarer, wenn auch PII-freier Spalten `beantragt_von_sub`/`freigeber_sub` (`.claude/rules/database-migrations.md`). Spalten-Kommentar-Konvention: `personenbeziehbar=true; pii=false; art=opake-principal (Vier-Augen-Workflow, kein FK)` — 1:1 aus `audit.retention_freigabe.antragsteller`/`freigeber` übernommen.

### 2.7 v1 vs. Produktiv-Vorbedingung — ehrliches Framing (technical-director Finding P1, wichtigste Korrektur, verbindlich eingearbeitet)

**Korrigiertes Framing.** Diese ADR formulierte ursprünglich „App-Layer-ABAC + DB-`CHECK`-Constraint = belastbare Kontrolle" (§2/§3-Neutral). Das ist **zu optimistisch** und wird hiermit ersetzt: Der DB-`CHECK (freigeber_sub <> beantragt_von_sub)` (§2.1) ist ein **Integritäts-Guard, kein Sicherheits-Backstop** — er ist mit **zwei beliebigen unterschiedlichen `sub`-Werten trivial erfüllbar** und verhindert nur den offensichtlichsten Fehler (Selbstfreigabe mit exakt demselben Wert), nicht aber, dass ein Akteur mit direktem DB-Zugriff außerhalb des Controllers/PDP eine Zeile manipuliert oder die Prüfung anderweitig umgeht. **v1 ist damit effektiv App-Layer-only**: die einzige tatsächlich wirksame Vier-Augen-Durchsetzung ist der `InCodePolicyAdapter`-Zweig (§2.2), nicht die Datenbank.

**Bypass-Risiko benannt.** Die Runtime-DB-Rolle (`edms_app` bzw. äquivalent) ist aktuell eine **breite** Rolle mit vollen Schreibrechten über `energy.*`/`identity.*` — es existiert **kein** rollen-getrenntes Execute-only-Modell wie bei `audit.retention_drop()`/`edms_audit_betrieb`. Ein direkter DB-Zugriff außerhalb des Controllers (fehlerhafte/bösartige Query, kompromittierter DB-Client, ein künftiger Batch-/Migrations-Job, der versehentlich `identity.subjekt_schluessel`/`energy.endkunde_shred_antrag` direkt schreibt) **bleibt in v1 möglich und wäre unauditiert** (kein `AuditService.append`-Pfad außerhalb der Controller-Route).

**Für die Primärbedrohung ausreichend.** Das adressierte Kernrisiko dieser ADR ist eine **Einzelperson, die über die API allein schreddert** — genau dagegen ist die App-Layer-ABAC-Prüfung (§2.2) voll wirksam (deny-by-default, distinct-`sub`-Zwang, vollständiger Audit-Trail). v1 ist auf dieser Grundlage **vertretbar, aber NUR** unter der doppelten Bedingung **(a)** synthetic-only/pre-go-live-Betrieb (kein realer Personenbezug, kein Produktivverkehr, ADR-0008 §0/§22) **und (b)** explizit akzeptiertem Restrisiko (s. u.).

**Hochstufung (compliance- + technical-director-Auflage): DB-`SECURITY DEFINER`-Gate wird bindende Vorbedingung vor Produktivbestand — kein optionaler Folgeausbau mehr.** Die DB-Gate-Funktion analog `audit.retention_drop()` (einziger Ausführungspfad zur tatsächlichen DEK-Vernichtung, prüft Vier-Augen **nochmals innerhalb** der Datenbank, unabhängig vom App-Layer) **muss** existieren, **bevor** dieser Pfad mit realen (nicht-synthetischen) Endkunden-Daten betrieben wird. Vorbedingung dafür ist ein rollen-getrenntes Grant-Modell für `identity`/`energy` (existiert aktuell nur für `audit`, s. `edms_audit_betrieb`) — Owner `database-lead`/`security-lead`, gekoppelt an die Einführung des echten Cloud-KMS-Adapters (ADR-0005), da der Shred-Pfad dort ohnehin erneut angefasst wird. **Zieltermin:** spätestens vor dem `EDMS_SYNTHETIC_ONLY=false`-Umschaltpunkt (ADR-0008 §22/C3) — **ins Risiko-Register aufzunehmen** (nicht in dieser ADR terminiert, s. Restrisiko-Eintrag unten).

**Neuer v1-Restrisiko-Eintrag (für das Risiko-Register — Zeichnung durch `compliance-director`/`security-lead`):**
> *Krypto-Shredding-Vier-Augen ist in v1 nur App-Layer-durchgesetzt (kein DB-Gate); ein direkter, Controller-umgehender DB-Zugriff könnte die Vier-Augen-Kontrolle unauditiert umgehen. Wahrscheinlichkeit: gering (kein Produktivzugriff, synthetic-only, begrenzter Nutzerkreis). Auswirkung: hoch (Art. 17/Rechenschaft). Behandlung: DB-`SECURITY DEFINER`-Gate als bindende Vorbedingung vor Produktivbestand (§2.7). Fällig: vor `EDMS_SYNTHETIC_ONLY=false`. Owner: `security-lead`/`database-lead`.*

**Positiv-Vermerk (technical-director):** Der Shred-Pfad selbst macht **keinen KMS-Roundtrip** (`KryptoShreddingService.shred()` überschreibt nur `wrapped_dek`/`key_state`, kein `unwrapDek()`/`generateDataKey()`) — die `freigeben`-Transaktion ist damit **frei** vom in ADR-0008 §19 dokumentierten „KMS-Roundtrip-in-offener-Tx"-Problem (Folgeaufträge C6/§19). Kein zusätzlicher Constraint für diesen Pfad nötig.

## 3. Konsequenzen

### Positiv
- Echte Funktionstrennung (Maker-Checker) für einen irreversiblen Art.-17-Vorgang, ohne neue Abhängigkeit und ohne DS-01-Konflikt.
- Wiederverwendung eines bereits im Repo vorhandenen, konzeptionell geprüften Musters (`audit.retention_freigabe`) senkt Review-Aufwand und Drift-Risiko gegenüber einer Neuerfindung.
- Vollständige, nachvollziehbare Audit-Kette (Antrag → Freigabe/Ablehnung → Ausführung), deutlich stärkere Rechenschaftsfähigkeit (Art. 5(2)) als der heutige Ist-Zustand, in dem „die zum Ausführungszeitpunkt geltende Rolle die einzige nachträglich rekonstruierbare Kontrollspur" ist (`migrations/V0006__seed_stammdaten_event_typen.sql:207-222`).

### Negativ
- Breaking Change am bestehenden Endpoint (hartes Entfernen statt Deprecation) — vertretbar nur wegen synthetic-only/pre-go-live-Status, s. §2.4; dazu ein dokumentierter SemVer-Waiver (`0.2.0→0.3.0` statt `1.0.0`, s. §2.4).
- Zusätzlicher Migrations-/Test-/UI-Implementierungsaufwand (zwei Migrationen, mehrere neue Endpoints, neue FE-Ansicht).
- **v1 ist effektiv App-Layer-only** (korrigiertes Framing, technical-director Finding P1, §2.7): der DB-`CHECK`-Constraint ist ein Integritäts-Guard, kein Sicherheits-Backstop; ein Controller-umgehender direkter DB-Zugriff bliebe in v1 möglich und unauditiert. Für die Primärbedrohung (Einzelperson über die API) ist das kompensiert, aber es ist ein **dokumentiertes Restrisiko** (Risiko-Register-Eintrag, §2.7), **nur** wegen synthetic-only/pre-go-live vertretbar, und macht das DB-`SECURITY DEFINER`-Gate zur bindenden Vorbedingung vor Produktivbestand.
- Zwei `betrieb`-Personen müssen im Betriebsalltag verfügbar sein; bei einem sehr kleinen Team kann das im Einzelfall (Krankheit/Urlaub) die Erfüllung einer Art.-17-Frist verzögern — ein Prozess-/Organisationspunkt, kein technischer Blocker (sollte im Betriebshandbuch adressiert werden, nicht Teil dieser ADR).

### Neutral
- Die Reihenfolge/Kopplung von `shred_freigegeben` und `geschreddert` (§2.3, Finding P2) sowie die Katalog-SCD2-Ergänzung (Finding P3) sind jetzt verbindlich festgelegt, nicht mehr offen — Mehraufwand gegenüber der ursprünglichen Skizze, aber kein zusätzliches Risiko.
- Der Shred-Pfad macht keinen KMS-Roundtrip (§2.7) — die `freigeben`-Transaktion ist frei vom ADR-0008-§19-KMS-in-offener-Tx-Problem; kein zusätzlicher Handlungsbedarf.

## 4. Alternativen

- **B — Dual-Control bei Ausführung (synchron).** Zwei Spielarten geprüft: **B1** (kurzlebiger Antrag) konvergiert technisch zu Option A, da ein rein In-Memory-„flüchtiger" Zustand in einem mehrreplika-fähigen Kubernetes-Deployment nicht trägt (Pod-Neustart/Lastverteilung) und ein Cache-Dienst (z. B. Redis) für echten flüchtigen State an der Lizenz-Whitelist scheitert — aktuelle Redis-Versionen (≥7.4) sind RSALv2/SSPLv1-lizenziert, nicht auf der Whitelist in `.claude/rules/dependencies.md` und auch nicht unter den dort explizit erlaubten Netzwerk-Diensten (nur PostgreSQL/Keycloak/MinIO/OpenSearch). **B2** (synchroner Co-Sign/Step-up-Auth im selben Request) verworfen, weil `audit.event` aktuell nur **einen** `actor_sub` pro Zeile trägt (`migrations/V0003__audit_log_schema.sql:407-409`) — ein zweiter, gleichrangiger Akteur wäre ohne Audit-Schema-Erweiterung nicht sauber nachweisbar; zusätzlich verlangt B2 die gleichzeitige Anwesenheit beider Personen, was für ein kleines Team unpraktisch ist.
- **C — Segregierter Co-Sign über eine zweite Rolle.** Verworfen: `compliance-auditor` als Freigeber würde die ausnahmslose DS-01-Regel im PDP aufweichen (Auditor bleibt strikt lesend — genau die Eigenschaft, die den schwersten PDP-Fund der ADR-0008-Phase-4-Review behoben hat) und den Auditor vom unabhängigen Prüfer zum operativen Mitentscheider machen, was seine künftige Prüfunabhängigkeit für ebendiesen Vorgang untergräbt. Eine echte neue Rolle wäre der sauberste C-Weg, aber der teuerste (neue Keycloak-Realm-Rolle, `RolesMapperService`-Erweiterung, komplette Rolle×Route-Matrix-Regressionstests neu) und wirft für ein kleines BAFA-Team die ungeklärte Frage auf, wer diese Rolle in der Praxis trägt.
- **A — Antrag→Freigabe (gewählt).** S. §2. Einziges Muster ohne neue Abhängigkeit, ohne DS-01-Konflikt, mit vorhandenem DB-Präzedenzfall und praktikabel für ein kleines Team (asynchron, keine Gleichzeitigkeit nötig).

## 5. Compliance-Einfluss

**DSGVO:** Art. 17 bleibt im Ergebnis unverändert (Krypto-Shredding-Mechanik selbst wird nicht angetastet), erhält aber erstmals eine nachweisbare Funktionstrennung für die *Ausführung*. Art. 5(2) Rechenschaftspflicht deutlich gestärkt gegenüber dem Ist-Zustand (§3, Positiv). Art. 32 (TOM): Vier-Augen als organisatorisch-technische Zusatzmaßnahme gegen Fehl-/Missbrauch bei einem irreversiblen Verfahren.

**ISO 27001:** **A.5.3 (Segregation of duties)** — wird mit dieser ADR **erstmals** ins Control-Mapping aufgenommen; geprüft (`compliance/iso27001/controls.md`, `compliance/iso27001/soa.md`): aktuell **kein** A.5.3-Eintrag vorhanden. A.8.3 (Access restriction — bereits Kern-Control des Stammdaten-Features, ADR-0008) erweitert um die neue Freigabe-Route. A.5.34 (PII protection/Krypto-Shredding) unverändert in der Wirkung, aber kontrollierter ausgelöst.

**`compliance-director`-Freigabe: kein Veto, sieben Auflagen (2026-07-15).** Diese ADR gilt als **accepted**, sofern die folgenden sieben Auflagen bei der Umsetzung erfüllt werden (Review-Verantwortung s. §7 Reihenfolge):

1. **DB-Gate als bindende Vorbedingung vor Produktivbestand** (nicht mehr optionaler Folgeausbau) — s. §2.7, inkl. Aufnahme des dortigen Restrisiko-Eintrags ins Risiko-Register.
2. **Audit-Atomarität fail-closed**: `shred_freigegeben` und `geschreddert` werden manuell, in logischer Reihenfolge, in derselben Transaktion erzeugt (Finding P2) — s. §2.3.
3. **Verfallsfenster `gueltig_bis`**: provisorischer v1-Wert **7 Tage** (analog break-glass `MAX_FENSTER_TAGE`, kompatibel mit der Art.-12(3)-Monatsfrist), finaler Wert durch `security-lead`/`compliance-director` — s. §2.1/§8.
4. **Ablehnungsgrund-Vokabular**: whitelisted, PII-frei, provisorische v1-Liste (`kein_rechtsgrund\|endkunde_widerspruch\|fehlbedienung\|sonstiges`); **`shred:endkunde:ablehnen` als eigene `PolicyAction` bestätigt** (nicht mehr nur Vorschlag) — s. §2.1/§2.2.
5. **Partieller Unique-Index „max. 1 offener Antrag je Endkunde"** von Empfehlung auf **Pflicht** hochgestuft — s. §2.1.
6. **`V0008`/`V0009`-Migrations-Review zwingend durch `database-lead` UND `compliance-director`** (PII-nahe `sub`-Spalten, kein optionaler Einzel-Review) — s. §2.6. Zusätzlich: **Freigeber-Rolle** (zweite `betrieb`-Person, keine neue Rolle) als **Re-Evaluationspunkt vor Go-live** vormerken — zu prüfen, ob die reine Distinctness-Regel bei Produktivbetrieb (größeres Team, reale Personalfluktuation) weiterhin ausreicht oder eine dedizierte Rolle nötig wird.
7. **DSFA-0001 Rev. 6** + **ISO-A.5.3-Erstaufnahme** als eigenständige `compliance-director`-Folgeartefakte (nicht Teil dieser ADR — hier nur benannt/verlinkt, Ausführung in `compliance/dsgvo/`, `compliance/iso27001/controls.md`, `compliance/iso27001/soa.md`).

## 6. Weitere Impl.-Constraints (technical-director, konsolidierte Übersicht)

Details stehen bereits inline bei den referenzierten Abschnitten — diese Liste ist eine Sammelübersicht für die Impl.-Phase:

- **TOCTOU (§2.1):** Das Freigabe-/Ablehnungs-Gate im Service läuft unter Zeilen-Lock (`SELECT ... FOR UPDATE`) bzw. als bedingtes `UPDATE ... WHERE status='beantragt'` mit Affected-Rows-Check. Die PDP-Statusprüfung (§2.2) ist eine Autorisierungsentscheidung auf einem zuvor gelesenen Snapshot — **nicht** die transaktionale Autorität über den Zustandsübergang selbst; ohne Lock/Affected-Rows-Check ist ein Race zwischen zwei parallelen Freigabe-Versuchen möglich.
- **Provider-Scoping (§2.4):** jede `antragId`-Route verifiziert `antrag.endkunde_id === params.endkundeId` — bei Abweichung `404` (nicht `403`, um die Existenz eines fremden Antrags nicht zu bestätigen).
- **Idempotency-Key-Semantik (§2.1/§2.4):** Retry mit demselben Key liefert den Replay der ursprünglichen `2xx`-Antwort, **nicht** `409`; der jetzt verpflichtende partielle Unique-Index (§2.1) darf dabei **keinen** `500`er auslösen — der Antrags-Endpoint muss den Idempotency-Replay-Fall vor dem Insert erkennen.
- **SemVer-Waiver (§2.4):** Contract-Version `0.2.0 → 0.3.0`, **nicht** `1.0.0` — dokumentierte, bewusste Abweichung von der `api-contracts.md`-Wörtlichkeit („neue Major-Version" bei Breaking Changes), begründet mit der 0.x-Konvention und der pre-go-live-Realität.
- **Positiv-Vermerk (§2.7):** kein KMS-Roundtrip im Shred-Pfad — die `freigeben`-Transaktion ist frei vom ADR-0008-§19-„KMS-Roundtrip-in-offener-Tx"-Problem, kein zusätzlicher Constraint nötig.

## 7. Empfohlene Umsetzungsreihenfolge (technical-director)

Kein Schritt überspringt die vorherigen Festlegungen — insbesondere dürfen `database-lead`/`audit-trail-engineer` erst **nach** Festlegung von Fenster-Wert und Ablehnungsgrund-Liste migrieren (sonst Migrations-Rework):

1. **`compliance-director`**: Auflagen-Festlegungen, die vor jeder Code-/Migrations-Berührung feststehen müssen — Fenster-Wert final, Ablehnungsgrund-Liste final, DSFA-0001-Rev.-6/A.5.3-Artefakte anstoßen (§5).
2. **`security-lead`**: Fenster-Wert final mitzeichnen; DB-Gate-Vorbedingung + Risiko-Register-Eintrag gegenzeichnen (§2.7).
3. **`database-lead`**: Migrationsentwurf `V0008` (Tabelle + Pflicht-Unique-Index, §2.1/§2.6).
4. **`audit-trail-engineer`**: Migrationsentwurf `V0009` (drei neue Codes + SCD2-Nachtrag für `geschreddert`, §2.3).
5. **`backend-lead`/`api-developer`**: OpenAPI-Contract (`0.3.0`), Endpoint-Implementierung inkl. TOCTOU-Lock, Provider-Scoping, Idempotency-Semantik, manuelles Audit-Ordering (§6).
6. **`frontend-lead`/`react-developer`**: UI-Umbau (§2.5).

## 8. Offene Punkte

- Konkreter Fenster-Wert für `gueltig_bis`: v1-Vorschlag **7 Tage** ist in dieser Revision gesetzt (§2.1/§5) — **finale Bestätigung** durch `security-lead`/`compliance-director` noch ausstehend.
- `ablehnungsgrund`-Vokabular: v1-Vorschlagsliste ist in dieser Revision gesetzt (§2.1/§5) — **finale Bestätigung** durch `access-control-engineer`/`compliance-director` noch ausstehend.
- Kopplung „Freigeben" + „Ausführen" in einem Request vs. zeitlich entkoppelter, separater Ausführen-Schritt (§2.1) — Impl.-Entscheidung, hier nur empfohlen, nicht verbindlich festgelegt.
- Migrationsnummerierung `V0008`/`V0009` (§2.3/§2.6) ist ein Vorschlag, keine verbindliche Zuteilung (kann sich durch parallele Arbeit verschieben).
- DB-`SECURITY DEFINER`-Gate-Funktion (§2.7): jetzt **bindende Vorbedingung** vor Produktivbestand (nicht mehr optionaler Folgeausbau) — konkreter Zieltermin und Owner-Zuteilung sind als Risiko-Register-Eintrag zu erfassen, hier nicht terminiert.
- Freigeber-Rolle (zweite `betrieb`-Person, keine neue Rolle) als **Re-Evaluationspunkt vor Go-live** (compliance-director-Auflage 6, §5) — ob die reine `sub`-Distinctness-Regel bei Produktivbetrieb (größeres Team, reale Personalfluktuation) weiterhin ausreicht.
- DSFA-0001 Rev. 6 / ISO-A.5.3-Erstaufnahme (compliance-director-Auflage 7, §5) — eigenständige `compliance-director`-Folgeartefakte, hier nur benannt/verlinkt, nicht Teil dieser ADR.

## 9. Änderungsprotokoll

**Revision 2 (2026-07-15) — Freigabe durch `compliance-director` und `technical-director`, Status `proposed` → `accepted` (mit Bedingungen).** Gegenüber der Erstfassung (Revision 1, 2026-07-15, `proposed`) geändert:
- **§2.7/§3:** Framing korrigiert (Finding P1) — DB-`CHECK` ist Integritäts-Guard, kein Sicherheits-Backstop; v1 ist effektiv App-Layer-only; DB-`SECURITY DEFINER`-Gate von Empfehlung auf **bindende Vorbedingung vor Produktivbestand** hochgestuft; neuer v1-Restrisiko-Eintrag benannt.
- **§2.3:** Audit-Ordering festgelegt (Finding P2) — `shred_freigegeben`/`geschreddert` manuell, geordnet, in derselben Tx, `@AuditAction` auf der Freigeben-Route nur als Denied-Safety-Net. Katalog-SCD2-Pflicht für `geschreddert` ergänzt (Finding P3).
- **§2.1/§2.2/§5:** `shred:endkunde:ablehnen` als eigene `PolicyAction` **bestätigt** (vormals nur Vorschlag); partieller Unique-Index von Empfehlung auf **Pflicht**; `gueltig_bis`-Frist-Vorschlag **7 Tage** konkretisiert; `ablehnungsgrund`-Vorschlagsliste konkretisiert.
- **§2.4/§6:** TOCTOU-, Provider-Scoping-, Idempotency-Key- und SemVer-Waiver-Constraints ergänzt; Positiv-Vermerk „kein KMS-Roundtrip" ergänzt.
- **§2.6/§5:** `V0008`/`V0009`-Review zwingend durch `database-lead` **und** `compliance-director` (nicht optional); Freigeber-Rolle als Re-Evaluationspunkt vor Go-live vorgemerkt; DSFA-0001 Rev. 6/A.5.3-Erstaufnahme als `compliance-director`-Folgeartefakte benannt.
- **§7 (neu):** empfohlene Umsetzungsreihenfolge.
- Kein Schema, keine Migration, kein Code, kein Commit in dieser Revision — reine Dokumentänderung.

## Folgeaufgaben

- [ ] `compliance-director`: Fenster-Wert und Ablehnungsgrund-Liste final bestätigen; A.5.3-Control-Mapping/SoA-Erstaufnahme signieren; DSFA-0001-Rev.-6-Bezug klären (eigenständiger Nachtrag vs. Teil von §29 C5); Freigeber-Rolle-Re-Evaluationspunkt vor Go-live vormerken
- [ ] `security-lead`: Fenster-Wert final mitzeichnen; DB-Gate-Vorbedingung + Risiko-Register-Eintrag (§2.7) gegenzeichnen, Zieltermin festlegen
- [ ] `database-lead`: Migrationsentwurf `V0008` (Tabelle inkl. Pflicht-Unique-Index) erstellen und gemeinsam mit `compliance-director` reviewen
- [ ] `audit-trail-engineer`: Migrationsentwurf `V0009` (drei neue Codes + SCD2-Nachtrag `geschreddert`) erstellen und gemeinsam mit `compliance-director` reviewen; optional Fehlreferenz „§21" in V0006-Kommentaren korrigieren
- [ ] `backend-lead`/`api-developer`: OpenAPI-Contract-Entwurf (`schemas/openapi/stammdaten.openapi.yaml`, `0.3.0`), Endpoint-Implementierung inkl. TOCTOU-Lock/Provider-Scoping/Idempotency-Semantik/manuellem Audit-Ordering
- [ ] `frontend-lead`/`react-developer`: UI-Umbau (Antrag stellen/Freigeben/Ablehnen, „Offene Shred-Anträge"-Ansicht)
- [ ] `database-lead`/`security-lead`: DB-`SECURITY DEFINER`-Gate-Funktion (bindende Vorbedingung vor Produktivbestand, §2.7) — Rollen-/Grant-Modell für `identity`/`energy` entwerfen, Zieltermin festlegen
